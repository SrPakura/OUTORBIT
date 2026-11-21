import * as THREE from 'three';
import { createComicCelMaterial, sharedShaderState } from './toonMaterials';
import { createHeksevilleSignAtlas } from './heksevilleSignAtlas';
import { createHeksevilleArchTextures } from './heksevilleArchAtlas';

// ============================================================================
// Hekseville 1:1 — Librería de materiales cel procedurales por distrito y
// bucket semántico.
//
// Los chunks `.glb` reales de Hekseville llegan SIN las texturas bitmap de
// Gravity Rush: cada malla se separa por nombre de bucket semántico
// (`col_stone`, `col_cliff`, `col_under`, ...) y aquí se le asigna un
// `ShaderMaterial` cel de OUTORBIT vestido con el atlas de arquitectura
// (`heksevilleArchAtlas.ts`: tiles 512×512 sin costuras, mipmaps de hardware
// y anisotropía, cero rejillas `step(fract())` que parpadean a distancia).
// El resultado es una ciudad legible, vibrante y coherente con el arte cómic
// de referencia, con como máximo 5 distritos × 9 buckets = 45 materiales
// compartidos por TODOS los chunks (GPU-friendly, pocos cambios de estado,
// cero fugas de memoria).
//
// Texturas de arquitectura en espacio de mundo (triplanar de 2 ejes: muro y
// suelo), cero estiramiento de UV, y variación por edificio leída de `COLOR_0`:
//   color.r -> categoría de superficie (plaza, tienda, casa, cívico, torre...)
//   color.g -> semilla A única por edificio (paleta, ventanas, rótulos)
//   color.b -> semilla B secundaria (tejados, metal, detalles)
//   color.a -> bandera de hito/realce
// Si un chunk todavía no trae `COLOR_0`, el shader sintetiza semillas
// deterministas por posición de mundo y usa la categoría del bucket: nunca hay
// error de compilación ni una ciudad plana de un solo color.
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
  /** Sincroniza la niebla GLSL de la ciudad con `scene.fog` (FogExp2). */
  setFog: (color: THREE.ColorRepresentation, density: number) => void;
  update: (elapsed: number) => void;
  dispose: () => void;
}

/**
 * Tinte de niebla atmosférica de Pleajeune: cerúleo-periwinkle a juego con el
 * cielo de cómic, para que las torres lejanas se fundan con la silueta del
 * horizonte sin recorte duro.
 */
export const HEKSEVILLE_FOG_COLOR = 0x5575b8;
/** Densidad de la niebla exponencial de Pleajeune. */
export const HEKSEVILLE_FOG_DENSITY = 0.00028;

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
 * Caras: TODOS los buckets `col_*` van a `DoubleSide`. `ChunkMeshCollider`
 * colisiona con los triángulos de ambas caras, así que un muro, arco o tejado
 * de una sola cara orientado en contra de la cámara sería una pared sólida
 * 100% invisible; con `DoubleSide` toda superficie colisionable de Pleajeune
 * se ve desde cualquier ángulo. Los buckets `vis_*` también son láminas finas
 * (neón, copas de árboles) y necesitan las dos caras.
 */
const BUCKET_SIDES: Record<HeksevilleBucketName, THREE.Side> = {
  col_stone: THREE.DoubleSide,
  col_cliff: THREE.DoubleSide,
  col_under: THREE.DoubleSide,
  col_roof: THREE.DoubleSide,
  col_wall_a: THREE.DoubleSide,
  col_wall_b: THREE.DoubleSide,
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

/**
 * Índice canónico del bucket en `BUCKET_ORDER`, expuesto al shader como
 * `uBucketKind`: 0 adoquín · 1 risco · 2 bajos · 3 tejado · 4/5 muros ·
 * 6 metal · 7 rótulos · 8 follaje. Cada bucket elige su textura de
 * arquitectura y su tinte; la categoría fina (`COLOR_0.r`) solo refina los
 * muros (tienda / casa / cívico).
 */
const BUCKET_KIND: Record<HeksevilleBucketName, number> = {
  col_stone: 0,
  col_cliff: 1,
  col_under: 2,
  col_roof: 3,
  col_wall_a: 4,
  col_wall_b: 5,
  col_metal: 6,
  vis_glow: 7,
  vis_foliage: 8,
};

/**
 * Categoría de respaldo cuando la malla no trae `COLOR_0`: mantiene la
 * identidad del bucket (muros secundarios = tiendas, muros = casas...).
 */
const BUCKET_CATEGORY: Record<HeksevilleBucketName, number> = {
  col_stone: 0.0,
  col_cliff: 0.0,
  col_under: 0.0,
  col_roof: 0.32,
  col_wall_a: 0.32,
  col_wall_b: 0.16,
  col_metal: 0.8,
  vis_glow: 0.96,
  vis_foliage: 0.32,
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
  // silueta se lea contra el cielo cerúleo sin caer a negro.
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
  // es ciruela, nunca negra: los muros siguen leyéndose bajo el cielo cerúleo.
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
// Shader cel procedural de ciudad
// ----------------------------------------------------------------------------

/**
 * Vertex shader: pasa posición/normal de mundo y la meta por vértice
 * (`COLOR_0`). Los tres caminos (`USE_COLOR_ALPHA`, `USE_COLOR`, sin color)
 * compilan siempre: si la malla no trae `COLOR_0`, se sintetizan semillas
 * deterministas por posición de mundo y la categoría del bucket.
 */
const cityVertexShader = /* glsl */ `
  uniform float uBucketCategory;

  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;
  varying vec4 vMeta;

  void main() {
    vec4 worldPos = modelMatrix * vec4( position, 1.0 );
    vWorldPos = worldPos.xyz;
    vWorldNormal = normalize( mat3( modelMatrix ) * normal );
    vViewDir = normalize( cameraPosition - worldPos.xyz );

    vec4 meta;
    #if defined( USE_COLOR_ALPHA )
      meta = color;
    #elif defined( USE_COLOR )
      meta = vec4( color, 1.0 );
    #else
      meta = vec4( 0.0 );
    #endif

    // Sin COLOR_0 (chunks aún sin pintar): semilla estable por posición.
    if ( abs( meta.g ) + abs( meta.b ) < 0.0001 ) {
      float h = fract(
        sin( dot( floor( worldPos.xz * 0.35 ) + floor( worldPos.y * 0.22 ), vec2( 12.9898, 78.233 ) ) ) * 43758.5453
      );
      meta = vec4( uBucketCategory, h, fract( h * 7.31 + 0.37 ), 0.0 );
    }
    vMeta = meta;

    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

/**
 * Fragment shader: la ciudad se viste con las texturas de arquitectura del
 * atlas (`heksevilleArchAtlas.ts`, mipmaps de hardware + anisotropía, cero
 * rejillas `step(fract())` que parpadean), proyectadas en espacio de mundo con
 * coordenadas de muro limpias y verticales que NUNCA espejan ventanas ni
 * rótulos en horizontal. Paleta por edificio desde `vMeta`, gradiente vertical
 * de ánimo (arriba vivo, abajo sombrío), 3 bandas cel, halftone cómic
 * desvanecido con la distancia a cámara, rim Fresnel y niebla exponencial.
 */
const cityFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uSunDir;
  uniform vec3 uBaseColor;
  uniform vec3 uShadowTint;
  uniform vec3 uAccentColor;
  uniform vec3 uRimColor;
  uniform float uRimPower;
  uniform float uRimStrength;
  uniform float uEmissiveBoost;
  uniform float uHalftoneEnabled;
  uniform float uBucketKind;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  uniform sampler2D uSignAtlas;
  uniform sampler2D uTexCobble;
  uniform sampler2D uTexHouse;
  uniform sampler2D uTexShop;
  uniform sampler2D uTexRoof;
  uniform sampler2D uTexCivic;
  uniform sampler2D uTexUnder;

  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;
  varying vec4 vMeta;

  // --- Ruido y utilidades ---------------------------------------------------

  float hash21( vec2 p ) {
    vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
    p3 += dot( p3, p3.yzx + 33.33 );
    return fract( ( p3.x + p3.y ) * p3.z );
  }

  float valueNoise2( vec2 p ) {
    vec2 i = floor( p );
    vec2 f = fract( p );
    f = f * f * ( 3.0 - 2.0 * f );
    float a = hash21( i );
    float b = hash21( i + vec2( 1.0, 0.0 ) );
    float c = hash21( i + vec2( 0.0, 1.0 ) );
    float d = hash21( i + vec2( 1.0, 1.0 ) );
    return mix( mix( a, b, f.x ), mix( c, d, f.x ), f.y );
  }

  float fbm2( vec2 p ) {
    float sum = 0.0;
    float amp = 0.55;
    for ( int i = 0; i < 3; i++ ) {
      sum += amp * valueNoise2( p );
      p = p * 2.03 + vec2( 1.7, 9.2 );
      amp *= 0.5;
    }
    return sum;
  }

  // Trama de puntos halftone (impresión cómic).
  float halftoneDots( vec2 fragCoord, float scale ) {
    float angle = 0.523599;
    mat2 rot = mat2( cos( angle ), -sin( angle ), sin( angle ), cos( angle ) );
    vec2 uv = ( rot * fragCoord ) / scale;
    vec2 grid = fract( uv ) - 0.5;
    return length( grid );
  }

  // Selección de paleta de 6 tonos sin indexado dinámico (GLSL ES 1.00).
  vec3 pick6( float t, vec3 c0, vec3 c1, vec3 c2, vec3 c3, vec3 c4, vec3 c5 ) {
    float x = clamp( t, 0.0, 0.9999 ) * 6.0;
    vec3 r = c0;
    r = mix( r, c1, step( 1.0, x ) );
    r = mix( r, c2, step( 2.0, x ) );
    r = mix( r, c3, step( 3.0, x ) );
    r = mix( r, c4, step( 4.0, x ) );
    r = mix( r, c5, step( 5.0, x ) );
    return r;
  }

  // Carteles y pantallas: tile del atlas muestreado con las coordenadas de
  // muro ORIENTADAS (wallUV, nunca espejadas), scanlines y parpadeo. Así el
  // texto nunca aparece en espejo ("NEPO") en muros en ángulo.
  vec3 signColor( vec2 wallUV, float seedA, float seedB, float upper ) {
    float idx = clamp( floor( fract( seedA * 7.0 + seedB * 3.0 ) * 16.0 ), 0.0, 15.0 );
    vec2 tile = vec2( mod( idx, 4.0 ), floor( idx / 4.0 ) );
    float scroll = uTime * ( 0.03 + 0.05 * seedB );
    vec2 suv = vec2( fract( wallUV.x * 0.75 + scroll ), fract( wallUV.y * 0.75 ) );
    suv = clamp( suv, 0.02, 0.98 );
    vec3 tex = texture2D( uSignAtlas, ( tile + suv ) * 0.25 ).rgb;
    float scan = 0.86 + 0.14 * sin( wallUV.y * 180.0 - uTime * 5.0 );
    float flicker = 0.84 + 0.16 * sin( uTime * 11.0 + seedA * 40.0 ) * sin( uTime * 3.1 + seedB * 9.0 );
    return tex * scan * flicker * mix( 0.72, 1.18, upper );
  }

  // Follaje: hojas por FBM, más apagado en la ciudad baja.
  vec3 foliageColor( vec2 uv, float seedA, float seedB, float upper ) {
    float n = fbm2( uv * 1.7 + seedA * 20.0 );
    vec3 leaf = mix( vec3( 0.14, 0.46, 0.32 ), vec3( 0.40, 0.80, 0.44 ), smoothstep( 0.30, 0.72, n ) );
    leaf = mix( leaf, vec3( 0.62, 0.90, 0.52 ), smoothstep( 0.68, 0.95, n ) * 0.55 );
    return leaf * mix( 0.72, 1.08, upper );
  }

  // --- Programa principal ---------------------------------------------------

  void main() {
    vec3 N = normalize( vWorldNormal );
    vec3 V = normalize( vViewDir );

    float seedA = clamp( vMeta.g, 0.0, 1.0 );
    float seedB = clamp( vMeta.b, 0.0, 1.0 );
    float cat = clamp( vMeta.r, 0.0, 1.0 );
    float landmark = clamp( vMeta.a, 0.0, 1.0 );

    // Coordenadas de muro limpias y verticales: cada fachada lee de izquierda
    // a derecha igual vista desde fuera, así ventanas y rótulos NUNCA se
    // espejan en horizontal. Escala natural de 7.5 m por tile y un desfase
    // por edificio para que casas vecinas no repitan el corte.
    vec2 wallAxis = abs( N.x ) > abs( N.z )
      ? vec2( N.x > 0.0 ? -vWorldPos.z : vWorldPos.z, vWorldPos.y )
      : vec2( N.z > 0.0 ? vWorldPos.x : -vWorldPos.x, vWorldPos.y );
    vec2 wallUV = wallAxis * ( 1.0 / 7.5 ) + vec2( seedA * 0.43, 0.0 );
    vec2 groundUV = vWorldPos.xz / 7.5;
    float upness = smoothstep( 0.55, 0.92, abs( N.y ) );

    // Anti-flicker: los halftones se desvanecen suavemente con la distancia a
    // cámara, así la geometría lejana jamás brilla a puntitos.
    float camDist = length( cameraPosition - vWorldPos );
    float dotFade = smoothstep( 140.0, 28.0, camDist );

    // Gradiente de ánimo vertical: arriba vivo, abajo mucho más sombrío.
    float upperFactor = smoothstep( 72.0, 158.0, vWorldPos.y );

    // Textura de arquitectura por bucket semántico (uBucketKind).
    float kind = uBucketKind;
    vec3 surf;
    if ( kind < 0.5 ) {
      // col_stone: adoquín de arenisca del atlas (triplanar en bordillos),
      // cálido y soleado arriba, pizarra apagada en los Bajos.
      vec3 cobbleFloor = texture2D( uTexCobble, groundUV ).rgb;
      vec3 cobbleWall = texture2D( uTexCobble, wallUV ).rgb;
      vec3 cobble = mix( cobbleWall, cobbleFloor, upness );
      vec3 sunnySandstone = vec3( 0.95, 0.90, 0.84 );
      vec3 mutedSlate = vec3( 0.58, 0.60, 0.68 );
      surf = cobble * mix( mutedSlate, sunnySandstone, upperFactor );
    } else if ( kind < 2.5 || ( kind > 5.5 && kind < 6.5 ) ) {
      // col_cliff / col_under / col_metal: sillería de bajos con veta de
      // bronce o pizarra según la semilla, más sombría cuanto más abajo.
      vec2 underUV = mix( wallUV, groundUV, upness );
      vec3 underTex = texture2D( uTexUnder, underUV ).rgb;
      vec3 bronze = vec3( 0.62, 0.50, 0.38 );
      vec3 slate = vec3( 0.46, 0.50, 0.60 );
      surf = underTex * mix( bronze, slate, seedB ) * mix( 0.66, 1.02, upperFactor );
    } else if ( kind < 3.5 ) {
      // col_roof: teja triplanar (XZ en las aguas, muro en los testerios),
      // tintada de forma única por edificio a través de ambas semillas.
      vec2 roofGround = vWorldPos.xz / 6.0;
      vec2 roofWall = wallAxis * ( 1.0 / 6.0 ) + vec2( seedA * 0.43, 0.0 );
      vec3 roofTex = mix(
        texture2D( uTexRoof, roofWall ).rgb,
        texture2D( uTexRoof, roofGround ).rgb,
        upness
      );
      vec3 roofTint = pick6(
        fract( seedA * 0.61 + seedB * 0.37 ),
        vec3( 0.94, 0.48, 0.34 ),
        vec3( 0.90, 0.66, 0.40 ),
        vec3( 0.62, 0.70, 0.56 ),
        vec3( 0.44, 0.56, 0.60 ),
        vec3( 0.98, 0.58, 0.42 ),
        vec3( 0.52, 0.62, 0.52 )
      );
      surf = roofTex * roofTint * mix( 0.80, 1.06, upperFactor );
    } else if ( kind < 5.5 ) {
      // col_wall_a / col_wall_b: estilo arquitectónico por categoría de
      // COLOR_0.r (tiendas ~0.16, casas ~0.32, cívico/torres ~0.48 y ~0.64).
      if ( cat < 0.24 ) {
        // Tiendas: escaparate del atlas mezclado con fachada de casa y tinte
        // alegre y cálido por semilla (coral, mantequilla, menta, melocotón).
        vec3 shopTex = texture2D( uTexShop, wallUV ).rgb;
        vec3 houseTex = texture2D( uTexHouse, wallUV ).rgb;
        vec3 shopTint = pick6(
          seedA,
          vec3( 1.00, 0.64, 0.58 ),
          vec3( 1.00, 0.94, 0.78 ),
          vec3( 0.74, 0.90, 0.76 ),
          vec3( 1.00, 0.80, 0.62 ),
          vec3( 0.90, 0.54, 0.42 ),
          vec3( 1.00, 0.88, 0.70 )
        );
        surf = mix( shopTex, houseTex, 0.35 ) * shopTint;
      } else if ( cat < 0.40 ) {
        // Casas: estuco marfil del atlas tintado individualmente por semilla.
        vec3 houseTex = texture2D( uTexHouse, wallUV ).rgb;
        vec3 houseTint = pick6(
          seedA,
          vec3( 0.98, 0.94, 0.86 ),
          vec3( 0.90, 0.72, 0.48 ),
          vec3( 0.88, 0.66, 0.62 ),
          vec3( 0.70, 0.80, 0.64 ),
          vec3( 0.92, 0.84, 0.68 ),
          vec3( 0.96, 0.90, 0.80 )
        );
        surf = houseTex * houseTint;
      } else {
        // Cívico y rascacielos: caliza tallada en tonos cálidos, nunca
        // rejillas púrpura/neón.
        vec3 civicTex = texture2D( uTexCivic, wallUV ).rgb;
        vec3 civicTint = pick6(
          seedA,
          vec3( 0.94, 0.88, 0.76 ),
          vec3( 0.96, 0.92, 0.82 ),
          vec3( 0.90, 0.84, 0.70 ),
          vec3( 0.66, 0.60, 0.56 ),
          vec3( 0.98, 0.94, 0.86 ),
          vec3( 0.88, 0.82, 0.72 )
        );
        surf = civicTex * civicTint;
      }
    } else if ( kind < 7.5 ) {
      // vis_glow: rótulos y pantallas con el atlas orientado (sin "NEPO").
      surf = signColor( wallUV, seedA, seedB, upperFactor );
    } else {
      // vis_foliage: verdes/teales cel vivos variados por semilla.
      surf = foliageColor( mix( wallUV, groundUV, upness ) * 7.5, seedA, seedB, upperFactor );
    }

    // Identidad del distrito: tinte suave del color base del bucket.
    surf = mix( surf, surf * uBaseColor * 1.35, 0.30 );

    // Ánimo vertical: saturación viva arriba, pizarra/índigo abajo.
    float luma = dot( surf, vec3( 0.299, 0.587, 0.114 ) );
    vec3 vivid = mix( vec3( luma ), surf, 1.18 ) * 1.06;
    vec3 moody = mix( surf, uShadowTint * 1.25, 0.48 ) * 0.78;
    vec3 baseColor = mix( moody, vivid, upperFactor );

    // 3 bandas de cel shading.
    float NdotL = dot( N, normalize( uSunDir ) );
    vec3 litColor = baseColor * 1.14;
    vec3 midColor = mix( baseColor, uShadowTint, 0.30 );
    vec3 darkColor = mix( baseColor, uShadowTint, 0.62 );
    vec3 col = litColor;
    if ( NdotL < 0.12 ) col = darkColor;
    else if ( NdotL < 0.48 ) col = midColor;

    // Halftone cómic en el terminador (más tinta en la ciudad baja),
    // desvanecido con la distancia para que nada brille a lo lejos.
    if ( uHalftoneEnabled > 0.5 && dotFade > 0.01 && NdotL > -0.25 && NdotL < 0.34 ) {
      float dots = halftoneDots( gl_FragCoord.xy, 6.5 );
      float threshold = smoothstep( 0.34, -0.20, NdotL ) * mix( 0.62, 0.42, upperFactor ) * dotFade;
      if ( dots < threshold ) col = mix( col, uShadowTint * 0.85, 0.55 );
    }

    // Rim light Fresnel: recorta la silueta contra el cielo.
    float fresnel = pow( 1.0 - max( dot( N, V ), 0.0 ), uRimPower );
    fresnel = smoothstep( 0.10, 0.82, fresnel ) * ( 0.72 + 0.28 * fresnel );
    col += uRimColor * fresnel * uRimStrength * mix( 0.70, 1.0, upperFactor );

    // Emisión (neón) + realce de hito.
    col += baseColor * uEmissiveBoost;
    col += uAccentColor * landmark * 0.12;

    // Niebla atmosférica exponencial (FogExp2) integrada en GLSL.
    float depth = length( cameraPosition - vWorldPos );
    float fogFactor = 1.0 - exp( - uFogDensity * uFogDensity * depth * depth );
    col = mix( col, uFogColor, clamp( fogFactor, 0.0, 1.0 ) );

    gl_FragColor = vec4( col, 1.0 );
  }
`;

interface CitySharedUniforms {
  uTime: { value: number };
  uSunDir: { value: THREE.Vector3 };
  uHalftoneEnabled: { value: number };
  uSignAtlas: { value: THREE.Texture };
  uTexCobble: { value: THREE.Texture };
  uTexHouse: { value: THREE.Texture };
  uTexShop: { value: THREE.Texture };
  uTexRoof: { value: THREE.Texture };
  uTexCivic: { value: THREE.Texture };
  uTexUnder: { value: THREE.Texture };
  uFogColor: { value: THREE.Color };
  uFogDensity: { value: number };
}

/**
 * Material cel procedural de ciudad para un bucket concreto. Todos los
 * materiales de la librería comparten `uTime`, `uSunDir`, `uSignAtlas` y la
 * niebla, así que animar la ciudad cuesta un puñado de escrituras por frame.
 */
function createCityProceduralCelMaterial(
  bucket: HeksevilleBucketName,
  style: BucketStyle,
  shared: CitySharedUniforms
): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    vertexShader: cityVertexShader,
    fragmentShader: cityFragmentShader,
    uniforms: {
      uTime: shared.uTime,
      uSunDir: shared.uSunDir,
      uHalftoneEnabled: shared.uHalftoneEnabled,
      uSignAtlas: shared.uSignAtlas,
      uTexCobble: shared.uTexCobble,
      uTexHouse: shared.uTexHouse,
      uTexShop: shared.uTexShop,
      uTexRoof: shared.uTexRoof,
      uTexCivic: shared.uTexCivic,
      uTexUnder: shared.uTexUnder,
      uFogColor: shared.uFogColor,
      uFogDensity: shared.uFogDensity,
      uBaseColor: { value: new THREE.Color(style.color) },
      uShadowTint: { value: new THREE.Color(style.shadowTint) },
      uAccentColor: { value: new THREE.Color(style.rimColor) },
      uRimColor: { value: new THREE.Color(style.rimColor) },
      uRimPower: { value: style.rimPower },
      uRimStrength: { value: style.rimStrength },
      uEmissiveBoost: { value: style.emissiveBoost },
      uBucketKind: { value: BUCKET_KIND[bucket] },
      uBucketCategory: { value: BUCKET_CATEGORY[bucket] },
    },
    // `vertexColors` activa USE_COLOR / USE_COLOR_ALPHA: el shader lee
    // `COLOR_0` cuando existe y compila igual cuando no.
    vertexColors: true,
    transparent: false,
    side: style.side,
    fog: false,
    // Rótulos y pantallas (`vis_glow`) viven pegados a los muros: el polygon
    // offset negativo los adelanta en profundidad y evita el z-fighting
    // contra la fachada (parpadeo de carteles).
    ...(bucket === 'vis_glow'
      ? { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }
      : {}),
  });
  return material;
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
// Abismo: niebla morada-azul oscura bajo las islas
// ----------------------------------------------------------------------------

/**
 * Centro horizontal del abismo: bajo el eje de Pleajeune (15, 330). El radio
 * de los discos (1700) cubre Pleajeune y Vendecentre de sobra.
 */
const VOID_FOG_CENTER_X = 15;
const VOID_FOG_CENTER_Z = 330;
/** Velo superior de niebla: justo por encima del plano de respawn (y = -125). */
const VOID_FOG_UPPER_Y = -112;
/** Suelo abisal: la niebla opaca que cierra el vacío. */
const VOID_FOG_LOWER_Y = -140;
const VOID_FOG_RADIUS = 1700;
const VOID_FOG_SEGMENTS = 64;
/** Paleta del vacío: morado oscuro, azul abisal e índigo cósmico. */
const VOID_FOG_DEEP_PURPLE = '#190a36';
const VOID_FOG_ABYSS_BLUE = '#0c1d4c';
const VOID_FOG_INDIGO_WISP = '#3b2778';

/** LCG determinista: la vida aérea es idéntica en cada carga. */
function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/**
 * Color de la paleta del abismo tal cual se declara: el shader escribe
 * `gl_FragColor` sin pasar por `colorspace_fragment`, así que los números se
 * guardan en sRGB para que el hex se vea exactamente como se especificó.
 */
function voidFogColor(hex: string): THREE.Color {
  return new THREE.Color().setStyle(hex, THREE.LinearSRGBColorSpace);
}

const voidFogVertexShader = /* glsl */ `
  varying vec2 vLocal;
  varying vec2 vWorldXZ;

  void main() {
    // El disco vive en XY local (el mesh lo gira -PI/2 en X), así que
    // position.xy es la distancia radial al centro del abismo.
    vLocal = position.xy;
    vec4 worldPos = modelMatrix * vec4( position, 1.0 );
    vWorldXZ = worldPos.xz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const voidFogFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uLayer;      // 0 = velo superior, 1 = suelo abisal
  uniform float uOpacity;
  uniform vec3 uDeepPurple;  // #190a36
  uniform vec3 uAbyssBlue;   // #0c1d4c
  uniform vec3 uIndigoWisp;  // #3b2778

  varying vec2 vLocal;
  varying vec2 vWorldXZ;

  float hash21( vec2 p ) {
    vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
    p3 += dot( p3, p3.yzx + 33.33 );
    return fract( ( p3.x + p3.y ) * p3.z );
  }

  float valueNoise2( vec2 p ) {
    vec2 i = floor( p );
    vec2 f = fract( p );
    f = f * f * ( 3.0 - 2.0 * f );
    float a = hash21( i );
    float b = hash21( i + vec2( 1.0, 0.0 ) );
    float c = hash21( i + vec2( 0.0, 1.0 ) );
    float d = hash21( i + vec2( 1.0, 1.0 ) );
    return mix( mix( a, b, f.x ), mix( c, d, f.x ), f.y );
  }

  float fbm2( vec2 p ) {
    float sum = 0.0;
    float amp = 0.55;
    for ( int i = 0; i < 4; i++ ) {
      sum += amp * valueNoise2( p );
      p = p * 2.03 + vec2( 1.7, 9.2 );
      amp *= 0.5;
    }
    return sum;
  }

  // Trama de puntos halftone (impresión cómic) para los jirones índigo.
  float halftoneDots( vec2 fragCoord, float scale ) {
    float angle = 0.523599;
    mat2 rot = mat2( cos( angle ), -sin( angle ), sin( angle ), cos( angle ) );
    vec2 uv = ( rot * fragCoord ) / scale;
    vec2 grid = fract( uv ) - 0.5;
    return length( grid );
  }

  void main() {
    float radial = length( vLocal );
    // Borde radial suave: el abismo se disuelve sin anillo duro en el
    // horizonte. Equivale a smoothstep( 1680.0, 750.0, radial ) pero con los
    // bordes ordenados, como exige GLSL.
    float edge = 1.0 - smoothstep( 750.0, 1680.0, radial );

    // --- Remolino de doble capa -------------------------------------------
    float spin = uTime * ( 0.013 + 0.007 * uLayer );
    mat2 swirl = mat2( cos( spin ), -sin( spin ), sin( spin ), cos( spin ) );
    vec2 p = swirl * ( vWorldXZ * 0.0014 );

    float drift = uTime * 0.019;
    float tendrilA = fbm2( p + vec2( drift, -drift * 0.62 ) + uLayer * 4.3 );

    float counter = -spin * 1.7;
    mat2 swirlB = mat2( cos( counter ), -sin( counter ), sin( counter ), cos( counter ) );
    vec2 pb = swirlB * ( vWorldXZ * 0.0027 ) + vec2( -drift * 1.5, drift * 0.9 );
    float tendrilB = fbm2( pb + tendrilA * 0.6 );

    // --- Paleta del vacío: azul abisal, morado oscuro e índigo luminoso ----
    vec3 col = mix( uAbyssBlue, uDeepPurple, smoothstep( 0.26, 0.80, tendrilA ) );
    float wisp = smoothstep( 0.60, 0.95, tendrilB ) * ( 0.35 + 0.65 * tendrilA );
    col = mix( col, uIndigoWisp, wisp * 0.9 );
    col += uIndigoWisp * pow( wisp, 2.0 ) * 0.45;

    // --- Trama cómic en los jirones más luminosos -------------------------
    float dots = halftoneDots( gl_FragCoord.xy, 5.5 );
    float stipple = smoothstep( 0.30, 0.62, dots ) * wisp;
    col = mix( col, uIndigoWisp * 1.45, stipple * 0.4 );

    // La capa superior es un velo tenue; la inferior, el suelo abisal opaco.
    col *= mix( 1.12, 0.86, uLayer );

    float alpha = edge * uOpacity;
    // El centro del abismo es más denso que el borde lejano.
    alpha *= mix( 0.55, 1.0, smoothstep( 1500.0, 420.0, radial ) );
    // Respiración lenta: la niebla nunca está congelada.
    alpha *= 0.93 + 0.07 * sin( uTime * 0.33 + radial * 0.004 + uLayer * 2.1 );

    if ( alpha < 0.004 ) discard;
    gl_FragColor = vec4( col, alpha );
  }
`;

// ----------------------------------------------------------------------------
// Vida en el cielo: banners de neón, zepelines y farolillos a la deriva
// ----------------------------------------------------------------------------

/** Centro de las avenidas aéreas de Pleajeune (sobre la terraza del spawn). */
const SKY_LIFE_CENTER_X = 15;
const SKY_LIFE_CENTER_Y = 150;
const SKY_LIFE_CENTER_Z = 330;
const SKY_BANNER_COUNT = 14;
const SKY_BLIMP_COUNT = 6;
const SKY_LANTERN_COUNT = 8;

interface SkyOrbit {
  radius: number;
  height: number;
  speed: number;
  phase: number;
  scale: number;
}

const skyBannerVertexShader = /* glsl */ `
  attribute float aTile;
  attribute float aPhase;

  varying vec2 vUv;
  varying float vTile;
  varying float vPhase;

  void main() {
    vUv = uv;
    vTile = aTile;
    vPhase = aPhase;
    #ifdef USE_INSTANCING
      vec4 worldPos = modelMatrix * instanceMatrix * vec4( position, 1.0 );
    #else
      vec4 worldPos = modelMatrix * vec4( position, 1.0 );
    #endif
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const skyBannerFragmentShader = /* glsl */ `
  uniform sampler2D uSignAtlas;
  uniform float uTime;

  varying vec2 vUv;
  varying float vTile;
  varying float vPhase;

  void main() {
    vec2 tile = vec2( mod( vTile, 4.0 ), floor( vTile / 4.0 ) );
    vec2 uv = clamp( vUv, 0.02, 0.98 );
    vec3 col = texture2D( uSignAtlas, ( tile + uv ) * 0.25 ).rgb;
    float flicker = 0.86 + 0.14 * sin( uTime * 6.0 + vPhase * 9.0 );
    gl_FragColor = vec4( col * flicker * 1.12, 1.0 );
  }
`;

// ----------------------------------------------------------------------------
// Contrato principal
// ----------------------------------------------------------------------------

export function createHeksevilleMaterialLibrary(): HeksevilleMaterialLibrary {
  const cache = new Map<string, THREE.Material>();
  const glowPulses: GlowPulse[] = [];

  // Recursos de la niebla del abismo y de la vida aérea (se liberan en
  // `dispose`).
  const cloudGroups: THREE.Group[] = [];
  const cloudGeometries: THREE.BufferGeometry[] = [];
  const cloudMaterials: THREE.Material[] = [];
  const voidFogMaterials: THREE.ShaderMaterial[] = [];
  const skyGeometries: THREE.BufferGeometry[] = [];
  const skyMaterials: THREE.Material[] = [];

  // Atlas de rótulos y texturas de arquitectura: una sola copia para toda la
  // ciudad (se liberan en `dispose`).
  const signAtlas = createSignAtlasSafe();
  const archTextures = createHeksevilleArchTextures();

  const shared: CitySharedUniforms = {
    uTime: { value: 0 },
    uSunDir: sharedShaderState.uSunDir,
    uHalftoneEnabled: sharedShaderState.uHalftoneEnabled,
    uSignAtlas: { value: signAtlas },
    uTexCobble: { value: archTextures.cobble },
    uTexHouse: { value: archTextures.house },
    uTexShop: { value: archTextures.shop },
    uTexRoof: { value: archTextures.roof },
    uTexCivic: { value: archTextures.civic },
    uTexUnder: { value: archTextures.under },
    uFogColor: { value: new THREE.Color(HEKSEVILLE_FOG_COLOR) },
    uFogDensity: { value: HEKSEVILLE_FOG_DENSITY },
  };

  let skyBanners: THREE.InstancedMesh | null = null;
  let skyBlimps: THREE.InstancedMesh | null = null;
  let skyLanterns: THREE.InstancedMesh | null = null;
  const bannerOrbits: SkyOrbit[] = [];
  const blimpOrbits: SkyOrbit[] = [];
  const lanternOrbits: SkyOrbit[] = [];
  const skyDummy = new THREE.Object3D();

  function getMaterial(district: HeksevilleDistrictId, bucketName: string): THREE.Material {
    const bucket = normalizeBucket(bucketName);
    const key = `${district}:${bucket}`;
    const cached = cache.get(key);
    if (cached) return cached;

    const style = PALETTES[district][bucket];
    const material = createCityProceduralCelMaterial(bucket, style, shared);
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

  function setFog(color: THREE.ColorRepresentation, density: number): void {
    shared.uFogColor.value.set(color);
    shared.uFogDensity.value = density;
  }

  function createCloudSeaGroup(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'heksevilleCloudSea';

    // --- Niebla del abismo: dos discos GLSL morado-azul bajo la ciudad -----
    // Un único `CircleGeometry` compartido por las dos capas (1 geometría,
    // 2 materiales): el velo superior tenue y el suelo abisal opaco. Ambos
    // viven en XY local y el mesh los gira -PI/2 en X, así que el shader lee
    // la distancia radial directamente de `position.xy`.
    const fogGeometry = new THREE.CircleGeometry(VOID_FOG_RADIUS, VOID_FOG_SEGMENTS);
    cloudGeometries.push(fogGeometry);

    const upperMist = new THREE.Mesh(fogGeometry, createVoidFogMaterial(0, 0.62));
    upperMist.name = 'voidMist:upper';
    upperMist.rotation.x = -Math.PI / 2;
    upperMist.position.set(VOID_FOG_CENTER_X, VOID_FOG_UPPER_Y, VOID_FOG_CENTER_Z);
    upperMist.renderOrder = 2;
    group.add(upperMist);

    const lowerMist = new THREE.Mesh(fogGeometry, createVoidFogMaterial(1, 0.97));
    lowerMist.name = 'voidMist:lower';
    lowerMist.rotation.x = -Math.PI / 2;
    lowerMist.position.set(VOID_FOG_CENTER_X, VOID_FOG_LOWER_Y, VOID_FOG_CENTER_Z);
    lowerMist.renderOrder = 1;
    group.add(lowerMist);

    // --- Vida aérea: banners, zepelines y farolillos (3 draw calls) ---
    buildSkyLife(group);

    cloudGroups.push(group);
    return group;
  }

  /**
   * Material de niebla del abismo. `layer` 0 = velo superior (transparente y
   * sin escritura de profundidad), 1 = suelo abisal (alta opacidad, escribe
   * profundidad para cerrar el vacío).
   */
  function createVoidFogMaterial(layer: 0 | 1, opacity: number): THREE.ShaderMaterial {
    const material = new THREE.ShaderMaterial({
      vertexShader: voidFogVertexShader,
      fragmentShader: voidFogFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uLayer: { value: layer },
        uOpacity: { value: opacity },
        uDeepPurple: { value: voidFogColor(VOID_FOG_DEEP_PURPLE) },
        uAbyssBlue: { value: voidFogColor(VOID_FOG_ABYSS_BLUE) },
        uIndigoWisp: { value: voidFogColor(VOID_FOG_INDIGO_WISP) },
      },
      transparent: true,
      depthWrite: layer === 1,
      side: THREE.DoubleSide,
      fog: false,
    });
    material.name = `hekseville:voidFog:${layer === 0 ? 'upper' : 'lower'}`;
    cloudMaterials.push(material);
    voidFogMaterials.push(material);
    return material;
  }

  /**
   * Construye los props animados del cielo de Pleajeune: banners de neón con
   * tiles del atlas, zepelines cel-shaded y farolillos cálidos. Todo va en
   * `InstancedMesh` (3 draw calls) y se anima en `update(elapsed)`.
   */
  function buildSkyLife(group: THREE.Group): void {
    const rng = createRng(0x534b594c); // 'SKYL'

    // --- Banners de neón (1 draw call) ---
    const bannerGeometry = new THREE.PlaneGeometry(9, 4.5);
    const bannerMaterial = new THREE.ShaderMaterial({
      vertexShader: skyBannerVertexShader,
      fragmentShader: skyBannerFragmentShader,
      uniforms: {
        uSignAtlas: shared.uSignAtlas,
        uTime: shared.uTime,
      },
      side: THREE.DoubleSide,
      fog: false,
    });
    bannerMaterial.name = 'hekseville:skyBanner';
    skyMaterials.push(bannerMaterial);

    const tiles = new Float32Array(SKY_BANNER_COUNT);
    const phases = new Float32Array(SKY_BANNER_COUNT);
    for (let i = 0; i < SKY_BANNER_COUNT; i++) {
      tiles[i] = Math.floor(rng() * 16);
      phases[i] = rng() * Math.PI * 2;
      bannerOrbits.push({
        radius: 70 + rng() * 120,
        // Siempre por encima de y = 140: los banners viven en el cielo alto,
        // nunca dentro de la niebla del abismo.
        height: SKY_LIFE_CENTER_Y + rng() * 90,
        speed: 0.055 + rng() * 0.05,
        phase: rng() * Math.PI * 2,
        scale: 0.85 + rng() * 0.6,
      });
    }
    bannerGeometry.setAttribute('aTile', new THREE.InstancedBufferAttribute(tiles, 1));
    bannerGeometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
    skyBanners = new THREE.InstancedMesh(bannerGeometry, bannerMaterial, SKY_BANNER_COUNT);
    skyBanners.name = 'skyBanners';
    skyBanners.frustumCulled = false;
    group.add(skyBanners);
    skyGeometries.push(bannerGeometry);

    // --- Zepelines cel-shaded (1 draw call) ---
    const blimpGeometry = new THREE.IcosahedronGeometry(1, 1);
    const blimpMaterial = createComicCelMaterial('#f7efff', {
      rimColor: '#ff9ae6',
      rimStrength: 0.7,
      rimPower: 2.6,
      emissiveBoost: 0.16,
      shadowTint: '#33225c',
      side: THREE.FrontSide,
    });
    blimpMaterial.name = 'hekseville:skyBlimp';
    skyMaterials.push(blimpMaterial);
    skyBlimps = new THREE.InstancedMesh(blimpGeometry, blimpMaterial, SKY_BLIMP_COUNT);
    skyBlimps.name = 'skyBlimps';
    skyBlimps.frustumCulled = false;
    group.add(skyBlimps);
    skyGeometries.push(blimpGeometry);

    for (let i = 0; i < SKY_BLIMP_COUNT; i++) {
      blimpOrbits.push({
        radius: 120 + rng() * 150,
        height: SKY_LIFE_CENTER_Y + 10 + rng() * 70,
        speed: 0.03 + rng() * 0.03,
        phase: rng() * Math.PI * 2,
        scale: 3.2 + rng() * 2.4,
      });
    }

    // --- Farolillos cálidos (1 draw call) ---
    const lanternGeometry = new THREE.OctahedronGeometry(1, 0);
    const lanternMaterial = createComicCelMaterial('#ffd166', {
      rimColor: '#ffb066',
      rimStrength: 0.95,
      rimPower: 2.2,
      emissiveBoost: 0.72,
      shadowTint: '#5b3a1a',
      side: THREE.FrontSide,
    });
    lanternMaterial.name = 'hekseville:skyLantern';
    skyMaterials.push(lanternMaterial);
    skyLanterns = new THREE.InstancedMesh(lanternGeometry, lanternMaterial, SKY_LANTERN_COUNT);
    skyLanterns.name = 'skyLanterns';
    skyLanterns.frustumCulled = false;
    group.add(skyLanterns);
    skyGeometries.push(lanternGeometry);

    for (let i = 0; i < SKY_LANTERN_COUNT; i++) {
      lanternOrbits.push({
        radius: 45 + rng() * 110,
        // Por encima de y = 140, como los banners: farolillos de cielo alto.
        height: SKY_LIFE_CENTER_Y + rng() * 80,
        speed: 0.09 + rng() * 0.07,
        phase: rng() * Math.PI * 2,
        scale: 1.1 + rng() * 0.9,
      });
    }

    updateSkyLife(0);
  }

  /** Recoloca los props aéreos en sus órbitas (28 matrices por frame). */
  function updateSkyLife(elapsed: number): void {
    const dummy = skyDummy;

    if (skyBanners) {
      for (let i = 0; i < bannerOrbits.length; i++) {
        const o = bannerOrbits[i];
        const t = elapsed * o.speed + o.phase;
        dummy.position.set(
          SKY_LIFE_CENTER_X + Math.cos(t) * o.radius,
          o.height + Math.sin(t * 1.7 + o.phase) * 7,
          SKY_LIFE_CENTER_Z + Math.sin(t) * o.radius * 0.72
        );
        dummy.rotation.set(0, -t + Math.PI * 0.5, Math.sin(t * 0.9) * 0.14);
        dummy.scale.setScalar(o.scale);
        dummy.updateMatrix();
        skyBanners.setMatrixAt(i, dummy.matrix);
      }
      skyBanners.instanceMatrix.needsUpdate = true;
    }

    if (skyBlimps) {
      for (let i = 0; i < blimpOrbits.length; i++) {
        const o = blimpOrbits[i];
        const t = elapsed * o.speed + o.phase;
        dummy.position.set(
          SKY_LIFE_CENTER_X + Math.cos(t) * o.radius,
          o.height + Math.sin(t * 1.3 + o.phase) * 5,
          SKY_LIFE_CENTER_Z + Math.sin(t) * o.radius * 0.8
        );
        dummy.rotation.set(0, -t, Math.sin(t * 0.7) * 0.08);
        dummy.scale.set(o.scale * 2.1, o.scale * 0.85, o.scale * 0.85);
        dummy.updateMatrix();
        skyBlimps.setMatrixAt(i, dummy.matrix);
      }
      skyBlimps.instanceMatrix.needsUpdate = true;
    }

    if (skyLanterns) {
      for (let i = 0; i < lanternOrbits.length; i++) {
        const o = lanternOrbits[i];
        const t = elapsed * o.speed + o.phase;
        dummy.position.set(
          SKY_LIFE_CENTER_X + Math.cos(t) * o.radius,
          o.height + Math.sin(t * 2.1 + o.phase) * 4,
          SKY_LIFE_CENTER_Z + Math.sin(t) * o.radius * 0.9
        );
        dummy.rotation.set(t * 0.6, t * 0.9, 0);
        dummy.scale.setScalar(o.scale);
        dummy.updateMatrix();
        skyLanterns.setMatrixAt(i, dummy.matrix);
      }
      skyLanterns.instanceMatrix.needsUpdate = true;
    }
  }

  function update(elapsed: number): void {
    shared.uTime.value = elapsed;

    for (const pulse of glowPulses) {
      const uniforms = pulse.material.uniforms;
      const wave = 0.5 + 0.5 * Math.sin(elapsed * pulse.speed + pulse.phase);
      // Segundo latido más lento: el neón nunca se siente mecánico.
      const breathe = 0.5 + 0.5 * Math.sin(elapsed * pulse.speed * 0.37 + pulse.phase * 1.7);

      uniforms.uEmissiveBoost.value = pulse.baseEmissive * (0.72 + 0.55 * wave + 0.18 * breathe);
      uniforms.uRimStrength.value = pulse.baseRimStrength * (0.85 + 0.3 * wave);
      (uniforms.uBaseColor.value as THREE.Color).copy(pulse.baseColor).multiplyScalar(0.94 + 0.14 * wave);
    }

    // Niebla del abismo: los dos discos comparten reloj con la ciudad.
    for (const material of voidFogMaterials) {
      material.uniforms.uTime.value = elapsed;
    }

    updateSkyLife(elapsed);
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
    voidFogMaterials.length = 0;

    for (const geometry of skyGeometries) geometry.dispose();
    skyGeometries.length = 0;
    for (const material of skyMaterials) material.dispose();
    skyMaterials.length = 0;
    skyBanners = null;
    skyBlimps = null;
    skyLanterns = null;
    bannerOrbits.length = 0;
    blimpOrbits.length = 0;
    lanternOrbits.length = 0;

    signAtlas.dispose();
    archTextures.dispose();
  }

  return { getMaterial, createCloudSeaGroup, setFog, update, dispose };
}

/**
 * Crea el atlas de rótulos con un fallback de un píxel para entornos sin
 * `document` (SSR, tests): el shader siempre tiene una textura válida.
 */
function createSignAtlasSafe(): THREE.Texture {
  if (typeof document !== 'undefined') return createHeksevilleSignAtlas();
  const data = new Uint8Array([120, 140, 200, 255]);
  const texture = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
