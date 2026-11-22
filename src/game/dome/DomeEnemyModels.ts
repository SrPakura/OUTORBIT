import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { addComicOutline, createComicCelMaterial } from '@/game/render/toonMaterials';
import { DOME_ENEMY_ARCHETYPES, type EnemyArchetype } from './DomeCombatSystem';

// ============================================================================
// DomeEnemyModels — precarga e instanciación de los GLB de enemigos de la
// cúpula (`/models/enemies/<archetype>.glb`).
//
// - `preloadEnemyModels()` lanza en segundo plano la carga de todos los
//   arquetipos. Un 404 (modelo aún no exportado) se ignora silenciosamente y
//   fija la cache a `null`: `DomeWaveManager` mantiene su forma provisional.
// - `instantiateEnemyVisual(archetype)` clona la escena cacheada
//   (`SkeletonUtils.clone` si hay SkinnedMesh/huesos, `.clone(true)` si no),
//   viste cada malla con materiales cel de cómic (carne translúcida para ver
//   el star_core, contornos de tinta propios) y devuelve los `starCores` para
//   rotarlos cada frame, más el `AnimationMixer` si el GLB trae clips.
// ============================================================================

export interface EnemyModelPalette {
  /** Color base de la carne (compartido con la forma provisional). */
  color: number;
  /** Color de rim light de la carne. */
  rim: number;
}

/** Paleta por arquetipo: fuente única para el GLB y la forma provisional. */
export const ENEMY_MODEL_COLORS: Record<EnemyArchetype, EnemyModelPalette> = {
  abyssal_cell: { color: 0x6b143b, rim: 0xff2a9d },
  spiral_octopus: { color: 0x4b1369, rim: 0x2563eb },
  crab_gunner: { color: 0x7c192d, rim: 0xff2a9d },
  ground_golem: { color: 0x3b0f54, rim: 0x1e40af },
  lightning_butterfly: { color: 0x831843, rim: 0xff2a9d },
  giant_sparrow: { color: 0x7f1d1d, rim: 0x2563eb },
  prisma_necrozma: { color: 0x4c1d95, rim: 0xff2a9d },
  kronos_leviathan: { color: 0x31105c, rim: 0x1d4ed8 },
};

// --- Núcleos star_core: dorado con brillo intenso y borde dorado cálido ---
const STAR_CORE_COLOR = 0xffcc33;
const STAR_CORE_RIM = 0xfff3b0;
const STAR_CORE_EMISSIVE = 1.45;
const STAR_CORE_OUTLINE_THICKNESS = 0.035;
const STAR_CORE_INK = 0xffe58f;

// --- Carne: paletas por tipo + tinta exterior blanca para máxima legibilidad ---
const FLESH_SLIME_STOPS = [
  new THREE.Color(0x7f1d1d), // rojo oscuro
  new THREE.Color(0x9a3412), // naranja oscuro
  new THREE.Color(0x854d0e), // amarillo/ámbar oscuro
];
const FLESH_SLIME_NEBULA = [
  new THREE.Color(0xb91c1c),
  new THREE.Color(0xd97706),
  new THREE.Color(0xca8a04),
];
const FLESH_OCTOPUS_A = new THREE.Color(0x2e1065);
const FLESH_OCTOPUS_B = new THREE.Color(0x581c87);
const FLESH_OCTOPUS_NEBULA_A = new THREE.Color(0x6b21a8);
const FLESH_OCTOPUS_NEBULA_B = new THREE.Color(0x9333ea);

const FLESH_CRIMSON_DARK = new THREE.Color(0x7f152e);
const FLESH_PURPLE_DARK = new THREE.Color(0x3b0d63);
const FLESH_CRIMSON_NEBULA = new THREE.Color(0xa12045);
const FLESH_PURPLE_NEBULA = new THREE.Color(0x5b21b6);
const FLESH_INK_WHITE = 0xffffff;
const FLESH_OUTLINE_THICKNESS = 0.05;

// --- Vibración de energía descontrolada (compartida carne + contorno) ---
const ENERGY_WOBBLE_GLSL = /* glsl */ `
  // Vibración orgánica de alta frecuencia: toda la silueta tiembla como
  // energía inestable. Misma fórmula en carne y contorno para que el borde
  // de tinta acompañe exactamente a la superficie.
  float energyWobble( vec3 pos, float uTime ) {
    return sin( pos.x * 9.0 + uTime * 22.0 ) * cos( pos.y * 7.0 - uTime * 19.0 );
  }
`;

// --- Piezas secundarias (detail_*): cel oscuro limpio --- 
const DETAIL_COLOR = 0x241d38;
const DETAIL_RIM = 0x6b5f8a;
const DETAIL_OUTLINE_THICKNESS = 0.04;

/** Nombre marcado en las mallas de contorno para saltarlas en el traverse. */
const OUTLINE_MARKER = '__comic_outline__';

// ============================================================================
// Carne nebulosa estilo NYX: universo interior FBM + estrellas titilantes en
// espacio de pantalla, con paleta roja/morada oscura aleatoria por instancia y
// vibración de energía descontrolada en el vertex shader.
// ============================================================================

const enemyNebulaVert = /* glsl */ `
  uniform float uTime;
  varying vec3 vNormalWorld;
  varying vec3 vViewDir;
  ${ENERGY_WOBBLE_GLSL}
  void main() {
    // Energía descontrolada: la superficie entera vibra a alta frecuencia.
    vec3 pos = position + normal * energyWobble( position, uTime ) * 0.045;
    vec4 worldPos = modelMatrix * vec4( pos, 1.0 );
    vNormalWorld = normalize( mat3( modelMatrix ) * normal );
    vViewDir = normalize( cameraPosition - worldPos.xyz );
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const enemyNebulaFrag = /* glsl */ `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uRimColor;
  uniform float uTime;
  uniform float uOpacity;
  uniform float uEmissiveBoost;
  varying vec3 vNormalWorld;
  varying vec3 vViewDir;

  float hash21( vec2 p ) {
    p = fract( p * vec2( 234.34, 435.345 ) );
    p += dot( p, p + 34.23 );
    return fract( p.x * p.y );
  }
  float noise2( vec2 p ) {
    vec2 i = floor( p );
    vec2 f = fract( p );
    f = f * f * ( 3.0 - 2.0 * f );
    return mix(
      mix( hash21( i ), hash21( i + vec2( 1.0, 0.0 ) ), f.x ),
      mix( hash21( i + vec2( 0.0, 1.0 ) ), hash21( i + vec2( 1.0, 1.0 ) ), f.x ),
      f.y
    );
  }
  float fbm( vec2 p ) {
    float v = 0.0; float a = 0.5;
    mat2 m = mat2( 0.8, 0.6, -0.6, 0.8 );
    for ( int i = 0; i < 4; i++ ) { v += a * noise2( p ); p = m * p * 2.02; a *= 0.5; }
    return v;
  }
  float starLayer( vec2 uv, float scale, float speed ) {
    vec2 gv = fract( uv * scale ) - 0.5;
    vec2 id = floor( uv * scale );
    float h = hash21( id );
    if ( h < 0.70 ) return 0.0;
    vec2 offset = vec2( hash21( id + 7.1 ), hash21( id + 13.7 ) ) - 0.5;
    float d = length( gv - offset * 0.65 );
    float tw = 0.6 + 0.4 * sin( uTime * speed + h * 40.0 );
    return smoothstep( mix( 0.05, 0.16, fract( h * 19.3 ) ), 0.0, d ) * tw;
  }
  void main() {
    vec3 N = normalize( vNormalWorld );
    vec3 V = normalize( vViewDir );
    // Nebulosa en espacio de pantalla (fondo oscuro abisal como NYX).
    vec2 uv = gl_FragCoord.xy * 0.0048;
    vec2 drift = vec2( uTime * 0.045, -uTime * 0.03 );
    float n1 = fbm( uv * 1.6 + drift );
    float n2 = fbm( uv * 2.5 - drift * 1.3 + n1 * 0.9 );
    vec3 col = vec3( 0.02, 0.008, 0.035 );
    col = mix( col, uColorA * 0.48, smoothstep( 0.36, 0.80, n1 ) );
    col = mix( col, uColorB * 0.62, smoothstep( 0.48, 0.88, n2 ) );
    // Estrellas brillantes dentro de la carne oscura.
    float stars = starLayer( uv + drift * 0.35, 14.0, 2.6 ) * 1.3
                + starLayer( uv - drift * 0.22, 24.0, 3.8 ) * 1.6;
    col += mix( vec3( 1.0 ), uRimColor, 0.3 ) * stars;
    // Borde Fresnel + centro más transparente para ver nítida la estrella dorada.
    float fresnel = pow( 1.0 - max( dot( N, V ), 0.0 ), 2.2 );
    col += uRimColor * smoothstep( 0.25, 0.9, fresnel ) * 0.65;
    col += mix( uColorA, uColorB, 0.5 ) * uEmissiveBoost;
    float alpha = mix( uOpacity * 0.45, min( 0.92, uOpacity * 1.15 ), fresnel );
    gl_FragColor = vec4( col, alpha );
  }
`;

/**
 * Material de nebulosa/universo para la carne de los enemigos, inspirado en el
 * shader Raven Nebula de NYX pero en rojos y morados oscuros. Cada instancia
 * recibe un matiz único: `uColorA`/`uColorB` se interpolan al azar entre
 * carmesí oscuro y morado abisal, y `uRimColor` toma el tono de la tinta
 * (fucsia o azul oscurillo) para que borde y contorno casen. Translúcido y sin
 * `depthWrite` para que la estrella dorada interior se vea claramente.
 */
function sampleGradient(stops: THREE.Color[], t: number): THREE.Color {
  const scaled = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const idx = Math.min(stops.length - 2, Math.floor(scaled));
  return new THREE.Color().lerpColors(stops[idx], stops[idx + 1], scaled - idx);
}

export function createEnemyNebulaMaterial(
  archetype: EnemyArchetype,
  rimColor: number
): THREE.ShaderMaterial {
  let colorA: THREE.Color;
  let colorB: THREE.Color;
  if (archetype === 'abyssal_cell') {
    const t = Math.random();
    colorA = sampleGradient(FLESH_SLIME_STOPS, t);
    colorB = sampleGradient(FLESH_SLIME_NEBULA, (t + 0.25) % 1);
  } else if (archetype === 'spiral_octopus') {
    colorA = new THREE.Color().lerpColors(FLESH_OCTOPUS_A, FLESH_OCTOPUS_B, Math.random());
    colorB = new THREE.Color().lerpColors(FLESH_OCTOPUS_NEBULA_A, FLESH_OCTOPUS_NEBULA_B, Math.random());
  } else {
    colorA = new THREE.Color().lerpColors(FLESH_CRIMSON_DARK, FLESH_PURPLE_DARK, Math.random());
    colorB = new THREE.Color().lerpColors(FLESH_CRIMSON_NEBULA, FLESH_PURPLE_NEBULA, Math.random());
  }
  return new THREE.ShaderMaterial({
    vertexShader: enemyNebulaVert,
    fragmentShader: enemyNebulaFrag,
    uniforms: {
      uColorA: { value: colorA },
      uColorB: { value: colorB },
      uRimColor: { value: new THREE.Color(rimColor) },
      uTime: { value: 0 },
      uOpacity: { value: archetype === 'abyssal_cell' ? 0.56 : 0.78 },
      uEmissiveBoost: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
  });
}

/**
 * Contorno de tinta Inverted Hull que vibra con la misma energía descontrolada
 * que la carne (`uTime` compartido): la silueta de tinta acompaña al cuerpo
 * tembloroso en cada frame. Devuelve la malla de contorno (hija de `mesh`).
 */
function addVibratingInkOutline(
  mesh: THREE.Mesh,
  thickness: number,
  inkColor: number
): THREE.Mesh {
  const outlineMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      uThickness: { value: thickness },
      uNoiseAmp: { value: 0.35 },
      uInkColor: { value: new THREE.Color(inkColor) },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      uniform float uThickness;
      uniform float uNoiseAmp;
      uniform float uTime;
      ${ENERGY_WOBBLE_GLSL}
      void main() {
        // La tinta vibra exactamente igual que la superficie de la carne.
        vec3 pos = position + normal * energyWobble( position, uTime ) * 0.045;
        // Grosor de pincel irregular (mismo trazo que addComicOutline).
        float brushVar = sin( position.x * 7.3 + position.y * 5.1 ) * cos( position.z * 6.7 - position.y * 4.2 );
        float width = max( 0.008, uThickness * ( 1.0 + brushVar * uNoiseAmp ) );
        vec3 extruded = pos + normalize( normal ) * width;
        gl_Position = projectionMatrix * modelViewMatrix * vec4( extruded, 1.0 );
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uInkColor;
      void main() {
        gl_FragColor = vec4( uInkColor, 1.0 );
      }
    `,
  });

  const outline = new THREE.Mesh(mesh.geometry, outlineMat);
  mesh.add(outline);
  return outline;
}

interface CachedEnemyModel {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
  hasSkinnedMesh: boolean;
}

const modelCache = new Map<EnemyArchetype, CachedEnemyModel | null>();
const pendingLoads = new Map<EnemyArchetype, Promise<void>>();
const gltfLoader = new GLTFLoader();

function loadEnemyModel(archetype: EnemyArchetype): Promise<void> {
  if (modelCache.has(archetype)) {
    return Promise.resolve();
  }
  const pending = pendingLoads.get(archetype);
  if (pending) {
    return pending;
  }

  const promise = new Promise<void>((resolve) => {
    gltfLoader.load(
      `/models/enemies/${archetype}.glb`,
      (gltf) => {
        let hasSkinnedMesh = false;
        gltf.scene.traverse((obj) => {
          if ((obj as THREE.SkinnedMesh).isSkinnedMesh) {
            hasSkinnedMesh = true;
          }
        });
        modelCache.set(archetype, {
          scene: gltf.scene,
          animations: gltf.animations,
          hasSkinnedMesh,
        });
        for (const cb of loadedCallbacks) cb(archetype);
        resolve();
      },
      undefined,
      () => {
        // 404 u otro error de red: el .glb aún no existe. Cache negativa
        // silenciosa; el caller sigue con la forma provisional.
        modelCache.set(archetype, null);
        resolve();
      },
    );
  });
  pendingLoads.set(archetype, promise);
  return promise;
}

/**
 * Precarga en segundo plano los GLB de todos los arquetipos de enemigo de la
 * cúpula. Fire-and-forget: los enemigos que spawneen antes de que termine la
 * carga usan la forma provisional, los siguientes ya el modelo.
 */
export function preloadEnemyModels(): void {
  for (const archetype of Object.keys(DOME_ENEMY_ARCHETYPES) as EnemyArchetype[]) {
    loadEnemyModel(archetype);
  }
}

const loadedCallbacks = new Set<(archetype: EnemyArchetype) => void>();

export function onEnemyModelLoaded(cb: (archetype: EnemyArchetype) => void): () => void {
  loadedCallbacks.add(cb);
  return () => {
    loadedCallbacks.delete(cb);
  };
}
export interface EnemyVisual {
  root: THREE.Group;
  /** Mallas star_core: rotan sobre sí mismas cada frame. */
  starCores: THREE.Object3D[];
  /** Mixer con los clips del GLB ya en play (undefined si no tiene clips). */
  mixer?: THREE.AnimationMixer;
  /**
   * Materiales con uniform `uTime` (carne nebulosa + contorno de tinta
   * vibrante): el caller debe avanzarles `uTime` cada frame.
   */
  animatedMaterials: THREE.ShaderMaterial[];
}

/** Nombres de material de una malla, concatenados para la detección por nombre. */
function materialNames(mesh: THREE.Mesh): string {
  const mat = mesh.material;
  if (Array.isArray(mat)) {
    return mat.map((m) => m.name).join(' ');
  }
  return mat ? mat.name : '';
}

/**
 * Instancia el visual de un arquetipo desde su GLB cacheado: clona la escena
 * (con huesos si los tiene) y viste cada malla con materiales cel de cómic.
 * Devuelve `null` si el modelo aún está cargando o no existe (404).
 */
export function instantiateEnemyVisual(archetype: EnemyArchetype): EnemyVisual | null {
  const cached = modelCache.get(archetype);
  if (!cached) {
    return null;
  }

  const root = (
    cached.hasSkinnedMesh ? cloneSkinned(cached.scene) : cached.scene.clone(true)
  ) as THREE.Group;

  const starCores: THREE.Object3D[] = [];
  const animatedMaterials: THREE.ShaderMaterial[] = [];
  const rimColor =
    archetype === 'abyssal_cell'
      ? 0xf59e0b
      : archetype === 'spiral_octopus'
        ? 0xc084fc
        : 0xff2a9d;

  root.traverse((obj) => {
    // Los contornos que añadimos aquí mismo no se re-visten.
    if (obj.name === OUTLINE_MARKER) {
      return;
    }
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) {
      return;
    }
    mesh.frustumCulled = false;

    // 'mat_star_core' / 'mat_flesh' contienen los mismos substrings, así que
    // una sola comprobación cubre nombre de malla y de material.
    const names = `${mesh.name} ${materialNames(mesh)}`;
    if (names.includes('star_core')) {
      mesh.renderOrder = 0;
      mesh.material = createComicCelMaterial(STAR_CORE_COLOR, {
        rimColor: STAR_CORE_RIM,
        rimStrength: 1.0,
        emissiveBoost: STAR_CORE_EMISSIVE,
      });
      addComicOutline(mesh, STAR_CORE_OUTLINE_THICKNESS, STAR_CORE_INK).name = OUTLINE_MARKER;
      starCores.push(mesh);
    } else if (names.includes('flesh')) {
      mesh.renderOrder = 1;
      // Carne nebulosa estilo NYX: universo rojo/morado con estrellas y
      // vibración de energía; translúcida para ver el star_core dorado.
      const fleshMaterial = createEnemyNebulaMaterial(archetype, rimColor);
      mesh.material = fleshMaterial;
      const outline = addVibratingInkOutline(mesh, FLESH_OUTLINE_THICKNESS, FLESH_INK_WHITE);
      outline.name = OUTLINE_MARKER;
      animatedMaterials.push(fleshMaterial, outline.material as THREE.ShaderMaterial);
    } else {
      mesh.material = createComicCelMaterial(DETAIL_COLOR, {
        rimColor: DETAIL_RIM,
        rimStrength: 0.4,
      });
      addComicOutline(mesh, DETAIL_OUTLINE_THICKNESS, FLESH_INK_WHITE).name = OUTLINE_MARKER;
    }
  });

  let mixer: THREE.AnimationMixer | undefined;
  if (cached.animations.length > 0) {
    mixer = new THREE.AnimationMixer(root);
    for (const clip of cached.animations) {
      mixer.clipAction(clip).play();
    }
  }

  return { root, starCores, mixer, animatedMaterials };
}

/** Libera las escenas GLB cacheadas (geometrías y materiales originales). */
export function disposeEnemyModelCache(): void {
  for (const cached of modelCache.values()) {
    if (!cached) {
      continue;
    }
    const materials = new Set<THREE.Material>();
    cached.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) {
        return;
      }
      mesh.geometry.dispose();
      const mat = mesh.material;
      if (Array.isArray(mat)) {
        mat.forEach((m) => materials.add(m));
      } else if (mat) {
        materials.add(mat);
      }
    });
    materials.forEach((m) => m.dispose());
  }
  modelCache.clear();
  pendingLoads.clear();
}
