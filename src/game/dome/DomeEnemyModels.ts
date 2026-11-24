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
export const STAR_CORE_EMISSIVE = 1.45;
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
/**
 * Engorde del trazo de tinta con la distancia (0 = grosor fijo). Los enemigos
 * aparecen a 26-56 m: sin esto el contorno cae por debajo del píxel y solo se
 * ve una mancha oscura sobre el fondo de la cúpula.
 */
export const INK_DISTANCE_SCALE = 2.6;

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
// Grosor de tinta variable por oleada: las oleadas 1-10 usan la tinta normal
// (la del personaje), y a partir de ahí el trazo engorda un 25% por cada
// bloque de 10 oleadas: 11-20 -> x1.25, 21-30 -> x1.5, 31-40 -> x1.75...
// ============================================================================
let enemyInkScale = 1;

/** Multiplicador de tinta de la oleada `wave` (clampado a >= 1). */
export function enemyInkScaleForWave(wave: number): number {
  return 1 + 0.25 * Math.floor((Math.max(1, wave) - 1) / 10);
}

/**
 * Fija el multiplicador de grosor que aplican los contornos creados a partir
 * de ahora. Lo actualiza el DomeWaveManager al desplegar cada oleada.
 */
export function setEnemyInkScale(scale: number): void {
  enemyInkScale = scale;
}

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
      uOpacity: { value: archetype === 'abyssal_cell' ? 0.62 : 0.76 },
      uEmissiveBoost: { value: 0 },
    },
    transparent: true,
    depthWrite: true,
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
    transparent: true,
    depthWrite: true,
    uniforms: {
      uThickness: { value: thickness },
      uNoiseAmp: { value: 0.35 },
      uInkColor: { value: new THREE.Color(inkColor) },
      uTime: { value: 0 },
      uDistanceScale: { value: INK_DISTANCE_SCALE },
    },
    vertexShader: /* glsl */ `
      uniform float uThickness;
      uniform float uNoiseAmp;
      uniform float uTime;
      uniform float uDistanceScale;
      ${ENERGY_WOBBLE_GLSL}
      void main() {
        // La tinta vibra exactamente igual que la superficie de la carne.
        vec3 pos = position + normal * energyWobble( position, uTime ) * 0.045;
        // Grosor de pincel irregular (mismo trazo que addComicOutline).
        float brushVar = sin( position.x * 7.3 + position.y * 5.1 ) * cos( position.z * 6.7 - position.y * 4.2 );
        float width = max( 0.008, uThickness * ( 1.0 + brushVar * uNoiseAmp ) );
        // El trazo engorda con la distancia: la silueta aguanta en el fondo.
        float distScale = 1.0 + clamp( -modelViewMatrix[ 3 ].z / 18.0, 0.0, 1.0 ) * uDistanceScale;
        vec3 extruded = pos + normalize( normal ) * width * distScale;
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
  /** Mixer de los clips del GLB (undefined si no tiene clips). */
  mixer?: THREE.AnimationMixer;
  /**
   * Acciones del mixer indexadas por nombre de clip (vacío si no tiene
   * clips). Los bucles van en LoopRepeat y los one-shot en LoopOnce con
   * clampWhenFinished; solo se reproduce la de reposo — el comportamiento
   * de cada enemigo hace los crossfades por nombre de estado.
   */
  actions: Map<string, THREE.AnimationAction>;
  /**
   * Materiales con uniform `uTime` (carne nebulosa + contorno de tinta
   * vibrante): el caller debe avanzarles `uTime` cada frame.
   */
  animatedMaterials: THREE.ShaderMaterial[];
  /**
   * Altura del origen del modelo sobre el suelo (m): `-min.y` medido con el
   * esqueleto aplicado más la holgura anti z-fighting. El caller coloca el
   * origen a `suelo + standHeight` para que el punto más bajo del modelo
   * apoye sobre la superficie sin flotar ni hundirse.
   */
  standHeight: number;
}

/** Holgura anti z-fighting al apoyar el modelo sobre una superficie (m). */
const GROUND_CLEARANCE = 0.002;

/**
 * Punto más bajo del modelo con el esqueleto YA aplicado, en espacio local de
 * `root` (m).
 *
 * Los vértices crudos del GLB no sirven para apoyar al enemigo: el hueso
 * `root` del cangrejo lleva `y = +0.30` y su matriz inversa de bind lo
 * compensa, así que el mínimo real solo aparece al skinar. Se recorre cada
 * `SkinnedMesh` con `applyBoneTransform` —la misma transformación que aplica
 * el vertex shader— y se toma el mínimo de Y; las mallas estáticas usan su
 * `matrixWorld`. Los contornos de tinta se saltan: comparten geometría con la
 * carne y se extruyen fuera de la silueta real.
 *
 * Debe llamarse sobre un `root` recién instanciado (transform identidad).
 */
function measureModelMinY(root: THREE.Object3D): number {
  root.updateMatrixWorld(true);
  let minY = Infinity;
  const vertex = new THREE.Vector3();
  const skinned = new THREE.Vector3();
  root.traverse((obj) => {
    if (obj.name === OUTLINE_MARKER) {
      return;
    }
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) {
      return;
    }
    const position = mesh.geometry.getAttribute('position');
    if (!position) {
      return;
    }
    const skin = obj as THREE.SkinnedMesh;
    if (skin.isSkinnedMesh) {
      skin.skeleton.update();
      skin.updateMatrixWorld(true);
      for (let i = 0; i < position.count; i++) {
        vertex.fromBufferAttribute(position, i);
        skin.applyBoneTransform(i, skinned.copy(vertex));
        skinned.applyMatrix4(skin.matrixWorld);
        if (skinned.y < minY) {
          minY = skinned.y;
        }
      }
      return;
    }
    for (let i = 0; i < position.count; i++) {
      vertex.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      if (vertex.y < minY) {
        minY = vertex.y;
      }
    }
  });
  return minY;
}

/** Altura de apoyo de un modelo recién instanciado (m): `-min.y` + holgura. */
export function measureStandHeight(root: THREE.Object3D): number {
  const minY = measureModelMinY(root);
  return (Number.isFinite(minY) ? -minY : 0) + GROUND_CLEARANCE;
}

/** Altura de apoyo por arquetipo: el bind pose es idéntico en cada clon. */
const standHeightCache = new Map<EnemyArchetype, number>();

function cachedStandHeight(archetype: EnemyArchetype, root: THREE.Object3D): number {
  const cached = standHeightCache.get(archetype);
  if (cached !== undefined) {
    return cached;
  }
  const standHeight = measureStandHeight(root);
  standHeightCache.set(archetype, standHeight);
  return standHeight;
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

  // Altura de apoyo medida sobre el clon con su esqueleto ya instanciado,
  // antes de vestir las mallas (los contornos aún no existen).
  const standHeight = cachedStandHeight(archetype, root);

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
      addComicOutline(
        mesh,
        STAR_CORE_OUTLINE_THICKNESS * enemyInkScale,
        STAR_CORE_INK,
        INK_DISTANCE_SCALE,
      ).name = OUTLINE_MARKER;
      starCores.push(mesh);
    } else if (names.includes('flesh')) {
      mesh.renderOrder = 1;
      // Carne nebulosa estilo NYX: universo rojo/morado con estrellas y
      // vibración de energía; depthWrite: true oculta el interior del BackSide blanco.
      const fleshMaterial = createEnemyNebulaMaterial(archetype, rimColor);
      mesh.material = fleshMaterial;
      const outline = addVibratingInkOutline(
        mesh,
        FLESH_OUTLINE_THICKNESS * enemyInkScale,
        FLESH_INK_WHITE
      );
      outline.renderOrder = 2;
      outline.name = OUTLINE_MARKER;
      animatedMaterials.push(fleshMaterial, outline.material as THREE.ShaderMaterial);
    } else {
      mesh.material = createComicCelMaterial(DETAIL_COLOR, {
        rimColor: DETAIL_RIM,
        rimStrength: 0.4,
      });
      addComicOutline(
        mesh,
        DETAIL_OUTLINE_THICKNESS * enemyInkScale,
        FLESH_INK_WHITE,
        INK_DISTANCE_SCALE,
      ).name = OUTLINE_MARKER;
    }
  });

  let mixer: THREE.AnimationMixer | undefined;
  const actions = new Map<string, THREE.AnimationAction>();
  if (cached.animations.length > 0) {
    mixer = new THREE.AnimationMixer(root);
    for (const clip of cached.animations) {
      const action = mixer.clipAction(clip);
      // Bucles (idle/sneak/flee/duplicate...) frente a one-shots
      // (windup/lunge/recover/hit): estos últimos se congelan en su último
      // frame hasta que el comportamiento los reinicie con reset().
      if (/loop|idle|float|duplicate/.test(clip.name)) {
        action.setLoop(THREE.LoopRepeat, Infinity);
      } else {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      actions.set(clip.name, action);
    }
    // Solo arranca en reposo el clip de idle; el resto los activa la IA.
    const idle =
      actions.get('cell_idle_float') ?? actions.values().next().value ?? null;
    if (idle) {
      idle.play();
    }
  }

  return { root, starCores, mixer, actions, animatedMaterials, standHeight };
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
  standHeightCache.clear();
}

// ============================================================================
// Rigs de los GLB riggeados: localización de huesos y mallas `detail_*` para
// que `DomeWaveManager` componga las animaciones procedurales encima de la
// pose de reposo (sin romper el bind del skin).
// ============================================================================

/** Hueso con su pose de reposo: la animación se compone encima. */
export interface EnemyBone {
  bone: THREE.Object3D;
  rest: THREE.Quaternion;
}

/** Malla secundaria (`detail_spikes`, `detail_fist`...) con su material cel. */
export interface EnemyDetailMesh {
  mesh: THREE.Mesh;
  /** Material cel con `uEmissiveBoost`/`uRimColor` (null si no es shader). */
  material: THREE.ShaderMaterial | null;
  /** Escala de reposo de la malla (la animación escala relativo a ella). */
  restScale: number;
}

function findBone(root: THREE.Object3D, name: string): EnemyBone | null {
  const bone = root.getObjectByName(name);
  if (!bone) {
    return null;
  }
  return { bone, rest: bone.quaternion.clone() };
}

function findDetailMesh(root: THREE.Object3D, name: string): EnemyDetailMesh | null {
  const mesh = root.getObjectByName(name) as THREE.Mesh | undefined;
  if (!mesh || !mesh.isMesh) {
    return null;
  }
  const material = mesh.material;
  return {
    mesh,
    material: material instanceof THREE.ShaderMaterial ? material : null,
    restScale: mesh.scale.x,
  };
}

// --- Ave Legendaria Cristalizada (giant_sparrow.glb, 12 joints) ---

export interface SparrowRig {
  wingTopLInner: EnemyBone | null;
  wingTopLOuter: EnemyBone | null;
  wingTopRInner: EnemyBone | null;
  wingTopROuter: EnemyBone | null;
  wingBotL: EnemyBone | null;
  wingBotR: EnemyBone | null;
  tail: EnemyBone | null;
  neck: EnemyBone | null;
  head: EnemyBone | null;
  jaw: EnemyBone | null;
  /** Estrella interior de la boca (`star_core_mouth`): brilla al abrirla. */
  mouthStar: THREE.Object3D | null;
  mouthStarMaterial: THREE.ShaderMaterial | null;
}

/** Huesos del Ave Legendaria Cristalizada para aleteo, cuello/cabeza y jaw. */
export function collectSparrowRig(root: THREE.Object3D): SparrowRig {
  const mouthStar = root.getObjectByName('star_core_mouth');
  const mouthStarMesh = mouthStar as THREE.Mesh | undefined;
  return {
    wingTopLInner: findBone(root, 'wing_top_L_inner'),
    wingTopLOuter: findBone(root, 'wing_top_L_outer'),
    wingTopRInner: findBone(root, 'wing_top_R_inner'),
    wingTopROuter: findBone(root, 'wing_top_R_outer'),
    wingBotL: findBone(root, 'wing_bot_L'),
    wingBotR: findBone(root, 'wing_bot_R'),
    tail: findBone(root, 'tail'),
    neck: findBone(root, 'neck'),
    head: findBone(root, 'head'),
    jaw: findBone(root, 'jaw'),
    mouthStar: mouthStar ?? null,
    mouthStarMaterial:
      mouthStarMesh?.isMesh && mouthStarMesh.material instanceof THREE.ShaderMaterial
        ? mouthStarMesh.material
        : null,
  };
}

// --- Prisma Necrozma (prisma_necrozma.glb, 11 joints + detail_spikes) ---

export interface NecrozmaRig {
  torso: EnemyBone | null;
  head: EnemyBone | null;
  tail: EnemyBone | null;
  shoulderL: EnemyBone | null;
  shoulderR: EnemyBone | null;
  armL: EnemyBone | null;
  armR: EnemyBone | null;
  clawL: EnemyBone | null;
  clawR: EnemyBone | null;
  /** Pinchos defensivos: se escalan hacia fuera (~1.35) o se retraen (~0.15). */
  spikes: EnemyDetailMesh | null;
}

/** Huesos del Prisma Necrozma + malla `detail_spikes`. */
export function collectNecrozmaRig(root: THREE.Object3D): NecrozmaRig {
  return {
    torso: findBone(root, 'torso'),
    head: findBone(root, 'head'),
    tail: findBone(root, 'tail'),
    shoulderL: findBone(root, 'shoulder_L'),
    shoulderR: findBone(root, 'shoulder_R'),
    armL: findBone(root, 'arm_L'),
    armR: findBone(root, 'arm_R'),
    clawL: findBone(root, 'claw_L'),
    clawR: findBone(root, 'claw_R'),
    spikes: findDetailMesh(root, 'detail_spikes'),
  };
}

// --- Gólem Rompesuelos (ground_golem.glb, 9 joints + detail_fist) ---

export interface GolemRig {
  spine: EnemyBone | null;
  chest: EnemyBone | null;
  head: EnemyBone | null;
  giantShoulderR: EnemyBone | null;
  giantArmR: EnemyBone | null;
  giantFistR: EnemyBone | null;
  armLUpper: EnemyBone | null;
  armLLower: EnemyBone | null;
  /** Puño gigante: brilla/pulsa neón durante el telegraph del manotazo. */
  fist: EnemyDetailMesh | null;
}

/** Huesos del Gólem Rompesuelos + malla `detail_fist`. */
export function collectGolemRig(root: THREE.Object3D): GolemRig {
  return {
    spine: findBone(root, 'spine'),
    chest: findBone(root, 'chest'),
    head: findBone(root, 'head'),
    giantShoulderR: findBone(root, 'giant_shoulder_R'),
    giantArmR: findBone(root, 'giant_arm_R'),
    giantFistR: findBone(root, 'giant_fist_R'),
    armLUpper: findBone(root, 'arm_L_upper'),
    armLLower: findBone(root, 'arm_L_lower'),
    fist: findDetailMesh(root, 'detail_fist'),
  };
}

// --- Leviatán KRONOS (kronos_leviathan.glb, 20 joints + star_core_1..4) ---

export interface KronosRig {
  head: EnemyBone | null;
  jaw: EnemyBone | null;
  /** Aletas pectorales (si existen): aleteo procedural. */
  finL: EnemyBone | null;
  finR: EnemyBone | null;
  /** Cadena `seg_01..seg_12` ordenada de cabeza a cola (ondulación serpentina). */
  segments: EnemyBone[];
  /** Materiales cel de las 4 Estrellas Vitales (`star_core_1..4`): respuesta al daño. */
  starCoreMaterials: THREE.ShaderMaterial[];
}

/**
 * Huesos del Leviatán KRONOS: cadena `seg_01..seg_12` para la onda serpentina
 * progresiva, `head`/`jaw` (fauces de los Anillos de Contención) y las aletas
 * `fin_L`/`fin_R`. Las Estrellas Vitales rotan vía `starCores` del visual.
 */
export function collectKronosRig(root: THREE.Object3D): KronosRig {
  const segments: EnemyBone[] = [];
  for (let i = 1; i <= 12; i++) {
    const segment = findBone(root, `seg_${String(i).padStart(2, '0')}`);
    if (segment) {
      segments.push(segment);
    }
  }
  const starCoreMaterials: THREE.ShaderMaterial[] = [];
  for (let i = 1; i <= 4; i++) {
    const star = root.getObjectByName(`star_core_${i}`) as THREE.Mesh | undefined;
    if (star?.isMesh && star.material instanceof THREE.ShaderMaterial) {
      starCoreMaterials.push(star.material);
    }
  }
  return {
    head: findBone(root, 'head'),
    jaw: findBone(root, 'jaw'),
    finL: findBone(root, 'fin_L'),
    finR: findBone(root, 'fin_R'),
    segments,
    starCoreMaterials,
  };
}
