import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createComicCelMaterial } from './toonMaterials';

// ============================================================================
// Hekseville 1:1 — Librería de materiales cel por distrito y bucket semántico.
//
// Los chunks `.glb` reales de Hekseville llegan SIN las texturas bitmap de
// Gravity Rush: cada malla se separa por nombre de bucket semántico
// (`col_stone`, `col_cliff`, `col_under`, ...) y aquí se le asigna un material
// cel de OUTORBIT. El resultado es una ciudad legible, vibrante y coherente
// con el arte cómic de referencia, con como máximo 5 distritos × 9 buckets =
// 45 materiales compartidos por TODOS los chunks (GPU-friendly, pocos cambios
// de estado, cero fugas de memoria).
//
// Una sola instancia de la librería debe compartirse entre todos los chunks:
// el caché vive en la instancia y `dispose()` libera exactamente lo creado.
// ============================================================================

export type HeksevilleDistrictId =
  | 'pilar'
  | 'auldnoir'
  | 'pleajeune'
  | 'endestria'
  | 'vendecentre';

/** Buckets semánticos en los que se parten las mallas de cada chunk `.glb`. */
export type HeksevilleBucketName =
  | 'col_stone'
  | 'col_cliff'
  | 'col_under'
  | 'col_roof'
  | 'col_wall_a'
  | 'col_wall_b'
  | 'col_metal'
  | 'vis_glow'
  | 'vis_foliage';

export interface HeksevilleMaterialLibrary {
  getMaterial: (district: HeksevilleDistrictId, bucketName: string) => THREE.Material;
  createCloudSeaGroup: () => THREE.Group;
  update: (elapsed: number) => void;
  dispose: () => void;
}

// ----------------------------------------------------------------------------
// Orden canónico de buckets y reglas de superficie
// ----------------------------------------------------------------------------

const BUCKET_ORDER: readonly HeksevilleBucketName[] = [
  'col_stone',
  'col_cliff',
  'col_under',
  'col_roof',
  'col_wall_a',
  'col_wall_b',
  'col_metal',
  'vis_glow',
  'vis_foliage',
];

const DISTRICTS: readonly HeksevilleDistrictId[] = [
  'pilar',
  'auldnoir',
  'pleajeune',
  'endestria',
  'vendecentre',
];

/**
 * Caras: `DoubleSide` en los buckets que en Gravity Rush son láminas finas
 * (barandillas, tuberías, puentes, copas de árboles, cascos de isla) para que
 * nunca aparezcan agujeros de cara trasera. El resto va a `FrontSide` y ahorra
 * relleno en móvil.
 */
const BUCKET_SIDES: Record<HeksevilleBucketName, THREE.Side> = {
  col_stone: THREE.FrontSide,
  col_cliff: THREE.DoubleSide,
  col_under: THREE.DoubleSide,
  col_roof: THREE.FrontSide,
  col_wall_a: THREE.FrontSide,
  col_wall_b: THREE.FrontSide,
  col_metal: THREE.DoubleSide,
  vis_glow: THREE.DoubleSide,
  vis_foliage: THREE.DoubleSide,
};

/** Fuerza del rim Fresnel: el metal y el neón recortan más que la piedra. */
const BUCKET_RIM_STRENGTH: Record<HeksevilleBucketName, number> = {
  col_stone: 0.42,
  col_cliff: 0.38,
  col_under: 0.3,
  col_roof: 0.5,
  col_wall_a: 0.5,
  col_wall_b: 0.46,
  col_metal: 0.72,
  vis_glow: 0.95,
  vis_foliage: 0.4,
};

/** Nitidez del rim: bajo = halo ancho (neón), alto = filo de tinta. */
const BUCKET_RIM_POWER: Record<HeksevilleBucketName, number> = {
  col_stone: 3.2,
  col_cliff: 3.4,
  col_under: 3.6,
  col_roof: 3.0,
  col_wall_a: 3.0,
  col_wall_b: 3.0,
  col_metal: 2.8,
  vis_glow: 2.4,
  vis_foliage: 3.6,
};

/** Emisión base: solo el neón es autoiluminado (el resto vive del cel). */
const BUCKET_EMISSIVE: Record<HeksevilleBucketName, number> = {
  col_stone: 0,
  col_cliff: 0,
  col_under: 0,
  col_roof: 0,
  col_wall_a: 0,
  col_wall_b: 0,
  col_metal: 0.04,
  vis_glow: 0.34,
  vis_foliage: 0.03,
};

// ----------------------------------------------------------------------------
// Paletas por distrito (identidad visual de Gravity Rush × OUTORBIT)
// ----------------------------------------------------------------------------

interface DistrictSpec {
  /** Color de rim/accent del distrito: neón, luz de contorno, energía. */
  accent: string;
  /** Tinte de sombra: índigo/ciruela, nunca negro sucio. */
  shadow: string;
  stone: string;
  cliff: string;
  under: string;
  roof: string;
  wallA: string;
  wallB: string;
  metal: string;
  glow: string;
  foliage: string;
}

const DISTRICT_SPECS: Record<HeksevilleDistrictId, DistrictSpec> = {
  // Pilar Central: piedra índigo cósmica, muros/metal violeta crepuscular y
  // energía cian brillante en los anillos.
  pilar: {
    accent: '#9df3ff',
    shadow: '#141a33',
    stone: '#3b3a6b',
    cliff: '#2e2c55',
    under: '#241f45',
    roof: '#4a4483',
    wallA: '#6f5fa8',
    wallB: '#8b7bd0',
    metal: '#7d8fd6',
    glow: '#5df3ff',
    foliage: '#4fd6c0',
  },
  // Auldnoir: adoquín ocre cálido, fachadas terracota y crema, tejados azul
  // pizarra, herrajes de bronce y ventanas doradas.
  auldnoir: {
    accent: '#ffcf8a',
    shadow: '#241a2e',
    stone: '#c9a97c',
    cliff: '#a98a63',
    under: '#5d4a3c',
    roof: '#4f7396',
    wallA: '#c96f4a',
    wallB: '#f4e6cc',
    metal: '#a8763f',
    glow: '#ffd76b',
    foliage: '#3f9e6b',
  },
  // Pleajeune: plazas lavanda perla, fachadas lila pastel y marfil, tejados
  // plum y neón magenta-cian de feria. Paleta alta en luminancia para que la
  // silueta se lea contra el cielo naranja sin caer a negro.
  pleajeune: {
    accent: '#ff9ae6',
    shadow: '#33225c',
    stone: '#e6d8fb',
    cliff: '#a58ed6',
    under: '#5b468f',
    roof: '#6548a3',
    wallA: '#f7efff',
    wallB: '#bfa3f0',
    metal: '#4fd1eb',
    glow: '#ff5ed6',
    foliage: '#43cf9d',
  },
  // Endestria: cubiertas de pizarra/acero cepillado, estructuras ámbar-óxido
  // y gris industrial, tejados carbón y tuberías de cobre, horno naranja.
  endestria: {
    accent: '#ffb066',
    shadow: '#1d1a24',
    stone: '#8496ad',
    cliff: '#6b7a8f',
    under: '#4a5262',
    roof: '#3c4351',
    wallA: '#c97a3f',
    wallB: '#8b95a3',
    metal: '#b06a3a',
    glow: '#ff9a3c',
    foliage: '#7d9a5e',
  },
  // Vendecentre: plazas pizarra luminosa, rascacielos Art-Deco azul-violeta y
  // alabastro cálido, tejados azul cobalto y neón violeta eléctrico. La sombra
  // es ciruela, nunca negra: los muros siguen leyéndose bajo el cielo rojo.
  vendecentre: {
    accent: '#d2c9ff',
    shadow: '#322a5c',
    stone: '#9ea5cf',
    cliff: '#6d74a3',
    under: '#4b507d',
    roof: '#5264a8',
    wallA: '#f3ecdc',
    wallB: '#7a82b5',
    metal: '#b6bce0',
    glow: '#b89cff',
    foliage: '#3dc985',
  },
};

interface BucketStyle {
  color: string;
  rimColor: string;
  rimPower: number;
  rimStrength: number;
  emissiveBoost: number;
  shadowTint: string | number;
  side: THREE.Side;
}

type DistrictPalette = Record<HeksevilleBucketName, BucketStyle>;

function buildPalette(spec: DistrictSpec): DistrictPalette {
  const colors: Record<HeksevilleBucketName, string> = {
    col_stone: spec.stone,
    col_cliff: spec.cliff,
    col_under: spec.under,
    col_roof: spec.roof,
    col_wall_a: spec.wallA,
    col_wall_b: spec.wallB,
    col_metal: spec.metal,
    vis_glow: spec.glow,
    vis_foliage: spec.foliage,
  };

  // El neón no puede caer a negro en la banda de sombra: su tinte oscuro es una
  // versión apagada de sí mismo, así el cartel sigue leyéndose de noche.
  const glowShadow = new THREE.Color(spec.glow).multiplyScalar(0.42).getHex();

  const palette = {} as DistrictPalette;
  for (const bucket of BUCKET_ORDER) {
    const isGlow = bucket === 'vis_glow';
    palette[bucket] = {
      color: colors[bucket],
      rimColor: isGlow ? spec.glow : spec.accent,
      rimPower: BUCKET_RIM_POWER[bucket],
      rimStrength: BUCKET_RIM_STRENGTH[bucket],
      emissiveBoost: BUCKET_EMISSIVE[bucket],
      shadowTint: isGlow ? glowShadow : spec.shadow,
      side: BUCKET_SIDES[bucket],
    };
  }
  return palette;
}

const PALETTES: Record<HeksevilleDistrictId, DistrictPalette> = {
  pilar: buildPalette(DISTRICT_SPECS.pilar),
  auldnoir: buildPalette(DISTRICT_SPECS.auldnoir),
  pleajeune: buildPalette(DISTRICT_SPECS.pleajeune),
  endestria: buildPalette(DISTRICT_SPECS.endestria),
  vendecentre: buildPalette(DISTRICT_SPECS.vendecentre),
};

/**
 * Normaliza el nombre de bucket que trae el `.glb`. Los nombres canónicos pasan
 * tal cual; cualquier variante del export (mayúsculas, sufijos, `_mat`) se
 * resuelve por palabra clave para que el caché nunca crezca por encima de los
 * 9 buckets por distrito.
 */
function normalizeBucket(bucketName: string): HeksevilleBucketName {
  const raw = bucketName.toLowerCase();
  for (const bucket of BUCKET_ORDER) {
    if (raw === bucket) return bucket;
  }
  if (raw.includes('glow') || raw.includes('neon') || raw.includes('light') || raw.includes('window')) {
    return 'vis_glow';
  }
  if (raw.includes('foliage') || raw.includes('tree') || raw.includes('leaf') || raw.includes('plant')) {
    return 'vis_foliage';
  }
  if (raw.includes('metal') || raw.includes('rail') || raw.includes('pipe') || raw.includes('crane')) {
    return 'col_metal';
  }
  if (raw.includes('roof') || raw.includes('dome') || raw.includes('cap')) return 'col_roof';
  if (raw.includes('under') || raw.includes('hull') || raw.includes('stalactite')) return 'col_under';
  if (raw.includes('cliff') || raw.includes('rock') || raw.includes('retain')) return 'col_cliff';
  if (raw.includes('wall_b') || raw.includes('wallb') || raw.includes('secondary')) return 'col_wall_b';
  if (raw.includes('wall')) return 'col_wall_a';
  return 'col_stone';
}

// ----------------------------------------------------------------------------
// Pulso de neón: cada `vis_glow` respira con fase propia
// ----------------------------------------------------------------------------

interface GlowPulse {
  material: THREE.ShaderMaterial;
  baseColor: THREE.Color;
  baseEmissive: number;
  baseRimStrength: number;
  phase: number;
  speed: number;
}

// ----------------------------------------------------------------------------
// Mar de nubes cel-shaded (muy por debajo de las islas)
// ----------------------------------------------------------------------------

/**
 * Mar de nubes: masa base entre y = -420 y -330 (las islas más bajas, a
 * y = -280, lo despejan) y bancos de cúmulos con centro en -350..-290 cuyas
 * cimas nunca pasan de -250 ni cuyos fondos bajan de -410.
 */
const CLOUD_SEA_BASE_Y = -375;
/**
 * Centro horizontal de la masa base: se desplaza bajo el eje Pleajeune
 * (0, 320) ↔ Vendecentre (-290, -110) para que el mar de nubes cubra las dos
 * únicas islas del sandbox y no quede descentrado bajo el vacío.
 */
const CLOUD_SEA_CENTER_X = -60;
const CLOUD_SEA_CENTER_Z = 175;
const CLOUD_BANK_MIN_RADIUS = 220;
const CLOUD_BANK_MAX_RADIUS = 950;
const CLOUD_BANK_MIN_Y = -350;
const CLOUD_BANK_MAX_Y = -290;
/** Cima máxima de cualquier bola de nube (banda declarada del mar). */
const CLOUD_BANK_TOP_Y = -250;
/** Fondo máximo de cualquier bola de nube. */
const CLOUD_BANK_FLOOR_Y = -410;
const CLOUD_BANK_COUNT = 46;
const GOLDEN_ANGLE = 2.39996323;

type CloudKey = 'deep' | 'violet' | 'warm' | 'cream';

const CLOUD_STYLES: Record<CloudKey, { color: string; rimColor: string; rimStrength: number }> = {
  deep: { color: '#8f7bc4', rimColor: '#b9a6e8', rimStrength: 0.22 },
  violet: { color: '#c3a6ef', rimColor: '#e0c8ff', rimStrength: 0.3 },
  warm: { color: '#ffc9a3', rimColor: '#ffd9b8', rimStrength: 0.32 },
  cream: { color: '#f6ecff', rimColor: '#ffffff', rimStrength: 0.26 },
};

const CLOUD_SHADOW_TINT = '#2a2350';

/** LCG determinista: el mar de nubes es idéntico en cada carga. */
function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

// ----------------------------------------------------------------------------
// Contrato principal
// ----------------------------------------------------------------------------

export function createHeksevilleMaterialLibrary(): HeksevilleMaterialLibrary {
  const cache = new Map<string, THREE.Material>();
  const glowPulses: GlowPulse[] = [];

  // Recursos del mar de nubes (se liberan en `dispose`).
  const cloudGroups: THREE.Group[] = [];
  const cloudGeometries: THREE.BufferGeometry[] = [];
  const cloudMaterials: THREE.Material[] = [];

  function getMaterial(district: HeksevilleDistrictId, bucketName: string): THREE.Material {
    const bucket = normalizeBucket(bucketName);
    const key = `${district}:${bucket}`;
    const cached = cache.get(key);
    if (cached) return cached;

    const style = PALETTES[district][bucket];
    const material = createComicCelMaterial(style.color, {
      rimColor: style.rimColor,
      rimPower: style.rimPower,
      rimStrength: style.rimStrength,
      emissiveBoost: style.emissiveBoost,
      shadowTint: style.shadowTint,
      side: style.side,
    });
    material.name = `hekseville:${key}`;
    cache.set(key, material);

    if (bucket === 'vis_glow') {
      // Desfase por distrito: los barrios no parpadean al unísono.
      const districtIndex = DISTRICTS.indexOf(district);
      glowPulses.push({
        material,
        baseColor: new THREE.Color(style.color),
        baseEmissive: style.emissiveBoost,
        baseRimStrength: style.rimStrength,
        phase: districtIndex * 1.7,
        speed: 1.15 + districtIndex * 0.13,
      });
    }

    return material;
  }

  function createCloudSeaGroup(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'heksevilleCloudSea';

    const materials = new Map<CloudKey, THREE.ShaderMaterial>();
    for (const key of Object.keys(CLOUD_STYLES) as CloudKey[]) {
      const style = CLOUD_STYLES[key];
      const material = createComicCelMaterial(style.color, {
        rimColor: style.rimColor,
        rimStrength: style.rimStrength,
        rimPower: 3.4,
        shadowTint: CLOUD_SHADOW_TINT,
        side: THREE.FrontSide,
      });
      material.name = `hekseville:cloud:${key}`;
      materials.set(key, material);
      cloudMaterials.push(material);
    }

    const buckets = new Map<CloudKey, THREE.BufferGeometry[]>();
    const pushPuff = (
      key: CloudKey,
      x: number,
      y: number,
      z: number,
      radius: number,
      flatten: number,
      detail: number,
      yaw: number
    ): void => {
      const geo = new THREE.IcosahedronGeometry(radius, detail);
      geo.scale(1, flatten, 1);
      if (yaw !== 0) geo.rotateY(yaw);
      geo.translate(x, y, z);
      const list = buckets.get(key);
      if (list) list.push(geo);
      else buckets.set(key, [geo]);
    };

    // --- Masa base: capas apiladas de islas de nube (nunca un disco plano) ---
    // Cada montículo es un icosaedro achatado; al solaparse forman un volumen
    // grueso con techo entre y = -323 y fondo y = -420. Todo el conjunto se
    // desplaza a `CLOUD_SEA_CENTER_*` para quedar bajo Pleajeune y Vendecentre.
    const baseMounds: ReadonlyArray<readonly [number, number, number, number, number, CloudKey]> = [
      [0, CLOUD_SEA_BASE_Y, 0, 1150, 0.039, 'deep'],
      [0, -360, 0, 820, 0.045, 'violet'],
      [0, -350, 0, 560, 0.045, 'warm'],
      [-420, -368, 260, 520, 0.05, 'violet'],
      [380, -372, -300, 470, 0.05, 'deep'],
      [180, -356, 420, 380, 0.055, 'cream'],
      [-260, -352, -420, 340, 0.055, 'warm'],
    ];
    for (const [x, y, z, radius, flatten, key] of baseMounds) {
      pushPuff(
        key,
        x + CLOUD_SEA_CENTER_X,
        y,
        z + CLOUD_SEA_CENTER_Z,
        radius,
        flatten,
        2,
        0
      );
    }

    // --- Bancos de cúmulos: espiral de ángulo áureo, 3-5 bolas por banco ---
    const rng = createRng(0x4f55544f); // 'OUTO'
    for (let i = 0; i < CLOUD_BANK_COUNT; i++) {
      const t = i / (CLOUD_BANK_COUNT - 1);
      const angle = i * GOLDEN_ANGLE;
      const radius = CLOUD_BANK_MIN_RADIUS + t * (CLOUD_BANK_MAX_RADIUS - CLOUD_BANK_MIN_RADIUS);
      const cx = Math.cos(angle) * radius;
      const cz = Math.sin(angle) * radius;
      const cy = CLOUD_BANK_MIN_Y + rng() * (CLOUD_BANK_MAX_Y - CLOUD_BANK_MIN_Y);
      const spread = 26 + t * 46;
      const puffCount = 3 + Math.floor(rng() * 3);

      for (let p = 0; p < puffCount; p++) {
        const puffRadius = 16 + rng() * 34 + t * 14;
        const ox = (rng() - 0.5) * spread * 2;
        const oz = (rng() - 0.5) * spread * 2;
        // La mayoría son bolas achatadas; algunas se elevan para romper la
        // silueta plana del banco.
        const flatten = rng() < 0.25 ? 0.85 + rng() * 0.3 : 0.55 + rng() * 0.25;
        const halfHeight = puffRadius * flatten;
        let oy = (rng() - 0.5) * 16;
        // Ninguna bola rompe la banda del mar: cima <= -250, fondo >= -410.
        const top = cy + oy + halfHeight;
        if (top > CLOUD_BANK_TOP_Y) oy -= top - CLOUD_BANK_TOP_Y;
        const bottom = cy + oy - halfHeight;
        if (bottom < CLOUD_BANK_FLOOR_Y) oy += CLOUD_BANK_FLOOR_Y - bottom;
        const roll = rng();
        const key: CloudKey = roll < 0.4 ? 'warm' : roll < 0.7 ? 'cream' : 'violet';
        pushPuff(key, cx + ox, cy + oy, cz + oz, puffRadius, flatten, 1, rng() * Math.PI * 2);
      }
    }

    // --- Fusión por tono: 4 draw calls para todo el mar de nubes ---
    for (const [key, geometries] of buckets) {
      const merged = mergeGeometries(geometries, false);
      for (const geo of geometries) geo.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, materials.get(key)!);
      mesh.name = `cloudSea:${key}`;
      group.add(mesh);
      cloudGeometries.push(merged);
    }

    cloudGroups.push(group);
    return group;
  }

  function update(elapsed: number): void {
    for (const pulse of glowPulses) {
      const uniforms = pulse.material.uniforms;
      const wave = 0.5 + 0.5 * Math.sin(elapsed * pulse.speed + pulse.phase);
      // Segundo latido más lento: el neón nunca se siente mecánico.
      const breathe = 0.5 + 0.5 * Math.sin(elapsed * pulse.speed * 0.37 + pulse.phase * 1.7);

      uniforms.uEmissiveBoost.value = pulse.baseEmissive * (0.72 + 0.55 * wave + 0.18 * breathe);
      uniforms.uRimStrength.value = pulse.baseRimStrength * (0.85 + 0.3 * wave);
      (uniforms.uColor.value as THREE.Color).copy(pulse.baseColor).multiplyScalar(0.94 + 0.14 * wave);
    }
  }

  function dispose(): void {
    for (const material of cache.values()) material.dispose();
    cache.clear();
    glowPulses.length = 0;

    for (const group of cloudGroups) group.removeFromParent();
    cloudGroups.length = 0;
    for (const geometry of cloudGeometries) geometry.dispose();
    cloudGeometries.length = 0;
    for (const material of cloudMaterials) material.dispose();
    cloudMaterials.length = 0;
  }

  return { getMaterial, createCloudSeaGroup, update, dispose };
}
