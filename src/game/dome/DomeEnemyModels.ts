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

// --- Carne: rojos y morados oscuros aleatorios + tinta fucsia o azul oscurillo ---
const FLESH_CRIMSON_DARK = new THREE.Color(0x7f152e);
const FLESH_PURPLE_DARK = new THREE.Color(0x3b0d63);
const FLESH_INK_FUCHSIA = 0xff2a9d;
const FLESH_INK_DARK_BLUE = 0x1e3a8a;
const FLESH_OUTLINE_THICKNESS = 0.05;
const FLESH_INK = 0x1e3a8a;

// --- Piezas secundarias (detail_*): cel oscuro limpio --- 
const DETAIL_COLOR = 0x241d38;
const DETAIL_RIM = 0x6b5f8a;
const DETAIL_OUTLINE_THICKNESS = 0.04;

/** Nombre marcado en las mallas de contorno para saltarlas en el traverse. */
const OUTLINE_MARKER = '__comic_outline__';

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

  const palette = ENEMY_MODEL_COLORS[archetype];
  const fleshOpacity = archetype === 'abyssal_cell' ? 0.52 : 0.72;
  const starCores: THREE.Object3D[] = [];
  // Variación aleatoria por instancia entre rojo oscuro y morado oscuro
  const fleshColor = new THREE.Color().lerpColors(
    FLESH_CRIMSON_DARK,
    FLESH_PURPLE_DARK,
    Math.random(),
  );
  const inkColor = Math.random() < 0.5 ? FLESH_INK_FUCHSIA : FLESH_INK_DARK_BLUE;

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
      const fleshMaterial = createComicCelMaterial(fleshColor.getHex(), {
        rimColor: palette.rim,
        rimStrength: 0.8,
        transparent: true,
        opacity: fleshOpacity,
      });
      // Translúcido: sin depthWrite la estrella del interior se ve perfecta.
      fleshMaterial.depthWrite = false;
      mesh.material = fleshMaterial;
      addComicOutline(mesh, FLESH_OUTLINE_THICKNESS, inkColor).name = OUTLINE_MARKER;
    } else {
      mesh.material = createComicCelMaterial(DETAIL_COLOR, {
        rimColor: DETAIL_RIM,
        rimStrength: 0.4,
      });
      addComicOutline(mesh, DETAIL_OUTLINE_THICKNESS, FLESH_INK).name = OUTLINE_MARKER;
    }
  });

  let mixer: THREE.AnimationMixer | undefined;
  if (cached.animations.length > 0) {
    mixer = new THREE.AnimationMixer(root);
    for (const clip of cached.animations) {
      mixer.clipAction(clip).play();
    }
  }

  return { root, starCores, mixer };
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
