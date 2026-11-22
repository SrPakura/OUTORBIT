import * as THREE from 'three';
import { addComicOutline, createComicCelMaterial } from '@/game/render/toonMaterials';
import type { SlabCollider, TestEnemySphere } from './domeTypes';
import { resolveSphereSlabCollision, type SlabContact } from './DomeSlabs';
import {
  createDomeEnemyEntity,
  DOME_ENEMY_ARCHETYPES,
  type DomeEnemyEntity,
  type EnemyArchetype,
} from './DomeCombatSystem';
import {
  instantiateEnemyVisual,
  onEnemyModelLoaded,
  preloadEnemyModels,
} from './DomeEnemyModels';

// ============================================================================
// DomeWaveManager — ciclo infinito de oleadas de la cúpula.
//
// Estructura del ciclo (15 rondas, repetido infinito):
//   1–4   Básicos (4 → 8 enemigos)            suelos 'basic'
//   5     Miniboss/Épico 1: giant_sparrow     suelos 'miniboss'
//   6–9   Básicos (7 → 11)                    suelos 'basic'
//   10    Miniboss/Épico 2: prisma_necrozma   suelos 'miniboss'
//   11–14 Básicos (9 → 13)                    suelos 'basic'
//   15    Boss: kronos_leviathan              suelos 'boss'
//   16+   Repite el ciclo con +2*cycle enemigos y velocidad 1 + cycle*0.2.
//
// Cada enemigo es un `ManagedWaveEnemy` (extiende `TestEnemySphere`), así que
// el array `enemies` es 100% compatible con lo que espera `NyxDomeController`
// para lock-on/patadas, y a la vez lleva su `DomeEnemyEntity` para el
// `DomeCombatSystem` (carne/estrella/puntos débiles).
// ============================================================================

export type WaveFloorMode = 'basic' | 'miniboss' | 'boss';

export interface ManagedWaveEnemy extends TestEnemySphere {
  /** Entidad de combate (HP, carne, estrella, puntos débiles) para DomeCombatSystem. */
  entity: DomeEnemyEntity;
  /** Fase del bob senoidal de flotación. */
  phase: number;
  /** Segundos restantes del dash evasivo (sin freno durante el brusco). */
  dashTimer: number;
  /** Signo del próximo dash lateral (alterna izquierda/derecha). */
  dashSign: 1 | -1;
  /** Cuenta atrás del próximo ataque (proyectil o embestida). */
  attackTimer: number;
}

export interface WaveInfo {
  wave: number;
  label: string;
  floorMode: WaveFloorMode;
  remaining: number;
}

// ---------------------------------------------------------------------------
// Constantes de comportamiento (heredadas del feel de TestEnemySpheres)
// ---------------------------------------------------------------------------

const FLOAT_SPRING = 2.4;
const FLOAT_DAMPING = 1.6;
const FLOAT_BOB_AMPLITUDE = 0.9;
const FLOAT_BOB_SPEED = 0.9;
const LEASH_RADIUS = 9.0;
const HOME_PULL = 6.5;
const DOME_KEEP_RADIUS = 78.0;
const DOME_KEEP_PULL = 9.0;

const EVASIVE_DASH_SPEED = 28.0;
const EVASIVE_DASH_TIME = 0.38;
const EVASIVE_DASH_LIFT = 5.5;
const EVASIVE_COOLDOWN = 3.0;
const EVADE_TRIGGER_ATTACK_TIME = 0.85;
const EVADE_TRIGGER_DISTANCE = 14.0;

const HIT_KNOCKBACK = 14.0;
const HIT_KNOCKBACK_DRILL = 26.0;
const HIT_FLASH_DECAY = 3.2;
const HIT_FLASH_SCALE = 0.35;
const HIT_FLASH_EMISSIVE = 0.85;

/** Arquetipos con dash evasivo al ser lockeados/atacados. */
const EVASIVE_ARCHETYPES: ReadonlySet<EnemyArchetype> = new Set([
  'spiral_octopus',
  'lightning_butterfly',
  'giant_sparrow',
  'prisma_necrozma',
]);

const BASIC_ARCHETYPES: readonly EnemyArchetype[] = [
  'abyssal_cell',
  'crab_gunner',
  'spiral_octopus',
  'lightning_butterfly',
  'ground_golem',
];

const CYCLE_LENGTH = 15;

// Pinchos del Prisma Necrozma: ciclos on/off visibles en emissive/rim.
const NECROZMA_SPIKES_ON_SEC = 3.4;
const NECROZMA_SPIKES_OFF_SEC = 2.6;
const NECROZMA_SPIKES_RIM = 0xff3b3b;
const NECROZMA_BASE_RIM = 0xd9baff;

// Proyectiles oscuros lentos (pool fijo, sin allocations por frame).
const PROJECTILE_POOL_SIZE = 32;
const PROJECTILE_LIFE_SEC = 9.0;
const PROJECTILE_PLAYER_RADIUS = 1.6;
const PROJECTILE_BOUND_RADIUS = 88.0;

// Embestidas (gólem, gorrión): carga directa contra Nyx.
const CHARGE_TRIGGER_DISTANCE = 26.0;
const CHARGE_CONTACT_PADDING = 1.9;

// --- Pulpo Espiral: orientación procedural + tentáculos sin clips ---
const OCTOPUS_TURN_RATE = 3.2; // Velocidad de giro hacia Nyx (slerp/seg).
const OCTOPUS_SPIRAL_TILT = 0.38; // Inclinación máx. de la espiral al desplazarse.
const OCTOPUS_SPIRAL_SPEED = 2.6; // Velocidad del balanceo en espiral.
const TENTACLE_WAVE_SPEED = 4.5; // Math.sin(elapsed * 4.5 + phase + i).
const TENTACLE_BASE_AMPLITUDE = 0.32;
const TENTACLE_TIP_AMPLITUDE = 0.45;
const OCTOPUS_INK_FORWARD = 0.55; // Fracción del radius: frente del manto.
const OCTOPUS_INK_UP = 0.35; // Elevación del manto sobre el centro.

// --- Cangrejo Artillero: pegado a suelos + cañón que apunta ---
const CRAB_TURN_RATE = 4.0; // Giro del cuerpo sobre el slab (slerp/seg).
const CRAB_TURRET_TURN_RATE = 6.0; // Giro del cañón hacia Nyx (slerp/seg).
const CANNON_MUZZLE_DISTANCE = 1.4; // Boca del cañón desde el hueso turret.
const CRAB_SLAB_MARGIN = 1.1; // Margen para no salirse del borde del slab.
const CRAB_ATTACH_BLEND_TIME = 0.45; // Aterrizaje suave al cambiar de slab.
// --- Cangrejo Artillero: spawn sobre suelos + salto entre ellos ---
const CRAB_SPAWN_MAX_R = 70.0; // Radio preferido del slab de spawn.
const CRAB_LEAVE_R = 72.0; // El slab flotante sale de la cúpula: saltar.
const CRAB_JUMP_TARGET_MAX_R = 68.0; // Radio preferido del slab de aterrizaje.
const CRAB_JUMP_DURATION = 0.75; // Duración base del arco del salto (s).
const CRAB_JUMP_DURATION_MAX = 2.4; // Techo de duración en saltos largos (s).
const CRAB_JUMP_H_SPEED = 22.0; // Velocidad horizontal de referencia (m/s).
const CRAB_JUMP_ARC_MIN = 2.5; // Altura mínima del arco (m).
const CRAB_JUMP_ARC_MAX = 9.0; // Altura máxima del arco (m).
const CRAB_GRAB_RANGE = 55.0; // Alcance del salto de agarre desde el aire (m).
const CRAB_SKID_DAMPING = 6.0; // Fricción del deslizamiento por knockback (1/s).
const CRAB_AIR_DAMPING = 3.0; // Fricción del desvío por knockback en vuelo (1/s).
const CRAB_LEG_WAVE_SPEED = 14.0; // Velocidad del aleteo de patas en vuelo.
const CRAB_LEG_WAVE_AMPLITUDE = 0.3; // Amplitud del aleteo de patas (rad).
const CRAB_FLIGHT_WOBBLE = 0.12; // Guiñeo ligero del cuerpo en vuelo (rad).
const CRAB_FLIGHT_WOBBLE_SPEED = 2.7; // Frecuencia del guiñeo de vuelo (rad/s).
const CRAB_STAND_HEIGHT = 1.0; // Altura del cuerpo sobre la cara superior del slab (m).

// --- Voladores contra icebergs (activeSlabs): nunca atraviesan los suelos ---
const SLAB_BOUNCE_RESTITUTION = 0.35; // Rebote suave de la velocidad contra la normal.

// --- Scratch vectors a nivel de módulo: sin allocations por frame --- 
const _toHome = new THREE.Vector3();
const _toEnemy = new THREE.Vector3();
const _perp = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _flat = new THREE.Vector3();
const _shotDir = new THREE.Vector3();
const _lookDir = new THREE.Vector3();
const _aimDir = new THREE.Vector3();
const _basisX = new THREE.Vector3();
const _basisMat = new THREE.Matrix4();
const _targetQuat = new THREE.Quaternion();
const _rollQuat = new THREE.Quaternion();
const _invQuat = new THREE.Quaternion();
const _turretWorldQuat = new THREE.Quaternion();
const _slabUp = new THREE.Vector3();
const _slabForward = new THREE.Vector3();
const _localOffset = new THREE.Vector3();
const _targetPos = new THREE.Vector3();
const _muzzlePos = new THREE.Vector3();
const _muzzleDir = new THREE.Vector3();
const _legWaveQuat = new THREE.Quaternion();
const _legWaveAxis = new THREE.Vector3(1, 0, 0);
const _origin = new THREE.Vector3();
const _slabContact: SlabContact = {
  slab: null,
  normal: new THREE.Vector3(),
  depth: 0,
  point: new THREE.Vector3(),
};

/** Cuaternión que orienta el +Z local hacia `dir` con la referencia `up`. */
function lookAtQuat(dir: THREE.Vector3, up: THREE.Vector3, out: THREE.Quaternion): THREE.Quaternion {
  _basisMat.lookAt(dir, _origin, up);
  return out.setFromRotationMatrix(_basisMat);
}

// ---------------------------------------------------------------------------
// Plan de oleada
// ---------------------------------------------------------------------------

/** Arquetipo concreto o mezcla rotada de básicos. */
type WaveSpawnArchetype = EnemyArchetype | 'basic_mix';

interface WaveSpawn {
  archetype: WaveSpawnArchetype;
  count: number;
}

interface WavePlan {
  wave: number;
  label: string;
  floorMode: WaveFloorMode;
  spawns: WaveSpawn[];
  /** Multiplicador de velocidad/agresividad (1 + cycle * 0.2). */
  speedMult: number;
}

/** Cantidad escalonada de básicos entre `from` y `to` a lo largo de la banda. */
function rampCount(bandIndex: number, bandSize: number, from: number, to: number): number {
  const t = bandSize <= 1 ? 1 : bandIndex / (bandSize - 1);
  return Math.round(from + (to - from) * t);
}

function getWavePlan(waveNumber: number): WavePlan {
  const cycle = Math.floor((waveNumber - 1) / CYCLE_LENGTH);
  const inCycle = ((waveNumber - 1) % CYCLE_LENGTH) + 1;
  const speedMult = 1 + cycle * 0.2;
  const extra = 2 * cycle;
  const spawns: WaveSpawn[] = [];

  let label = 'BÁSICOS';
  let floorMode: WaveFloorMode = 'basic';

  if (inCycle === 5) {
    label = 'MINIBOSS';
    floorMode = 'miniboss';
    spawns.push({ archetype: 'giant_sparrow', count: 1 });
  } else if (inCycle === 10) {
    label = 'MINIBOSS';
    floorMode = 'miniboss';
    spawns.push({ archetype: 'prisma_necrozma', count: 1 });
  } else if (inCycle === 15) {
    label = 'BOSS';
    floorMode = 'boss';
    spawns.push({ archetype: 'kronos_leviathan', count: 1 });
  } else {
    // Bandas de básicos: 1–4 (4→8), 6–9 (7→11), 11–14 (9→13).
    let bandStart = 1;
    let bandEnd = 4;
    let from = 4;
    let to = 8;
    if (inCycle >= 6 && inCycle <= 9) {
      bandStart = 6;
      bandEnd = 9;
      from = 7;
      to = 11;
    } else if (inCycle >= 11 && inCycle <= 14) {
      bandStart = 11;
      bandEnd = 14;
      from = 9;
      to = 13;
    }
    const count = rampCount(inCycle - bandStart, bandEnd - bandStart + 1, from, to) + extra;
    spawns.push({ archetype: 'basic_mix', count });
  }

  // En ciclos avanzados, los miniboss/boss traen escoltas básicos (+2*cycle).
  if (extra > 0 && (floorMode === 'miniboss' || floorMode === 'boss')) {
    spawns.push({ archetype: 'basic_mix', count: extra });
  }

  return { wave: waveNumber, label, floorMode, spawns, speedMult };
}

// ---------------------------------------------------------------------------
// RNG determinista por oleada (posiciones reproducibles)
// ---------------------------------------------------------------------------

function makeRng(seed: number): () => number {
  let s = (seed * 2654435761 + 1013904223) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Aspecto provisional por arquetipo (hasta los GLBs de Nevi)
// ---------------------------------------------------------------------------

interface ArchetypeVisual {
  geometry: THREE.BufferGeometry;
  color: number;
  rim: number;
  outlineThickness: number;
  starColor: number;
  starScale: number;
}

function buildArchetypeVisuals(): Record<EnemyArchetype, ArchetypeVisual> {
  return {
    // Célula Abisal: icosaedro pequeño translúcido aqua.
    abyssal_cell: {
      geometry: new THREE.IcosahedronGeometry(1.5, 1),
      color: 0x7ae8dc,
      rim: 0xbafff2,
      outlineThickness: 0.05,
      starColor: 0xfff6c8,
      starScale: 0.45,
    },
    // Pulpo Espiral: toro en espiral (tentáculos enroscados) magenta.
    spiral_octopus: {
      geometry: new THREE.TorusKnotGeometry(1.5, 0.42, 64, 8),
      color: 0xff5f9e,
      rim: 0xffb3d4,
      outlineThickness: 0.05,
      starColor: 0xfff0a3,
      starScale: 0.5,
    },
    // Cangrejo Artillero: caja chata ancha naranja (torreta).
    crab_gunner: {
      geometry: new THREE.BoxGeometry(2.6, 1.2, 1.9),
      color: 0xff8c42,
      rim: 0xffd0a3,
      outlineThickness: 0.05,
      starColor: 0xfff0b0,
      starScale: 0.4,
    },
    // Gólem Rompesuelos: dodecaedro macizo piedra.
    ground_golem: {
      geometry: new THREE.DodecahedronGeometry(2.9),
      color: 0x9c8f7a,
      rim: 0xd8c9a8,
      outlineThickness: 0.06,
      starColor: 0xffe27a,
      starScale: 0.42,
    },
    // Mariposa Relámpago: tetraedro pequeño amarillo eléctrico.
    lightning_butterfly: {
      geometry: new THREE.TetrahedronGeometry(1.3),
      color: 0xfff45f,
      rim: 0xffffffa8,
      outlineThickness: 0.06,
      starColor: 0xffffff,
      starScale: 0.5,
    },
    // Gorrión Gigante (Élite): elipsoide alargado carmesí (cuerpo de ave).
    giant_sparrow: {
      geometry: new THREE.SphereGeometry(2.4, 20, 14),
      color: 0xff4d5e,
      rim: 0xffb0b8,
      outlineThickness: 0.06,
      starColor: 0x9ff0ff,
      starScale: 0.4,
    },
    // Prisma Necrozma (Élite): octaedro prismático violeta.
    prisma_necrozma: {
      geometry: new THREE.OctahedronGeometry(3.4),
      color: 0xb06bff,
      rim: NECROZMA_BASE_RIM,
      outlineThickness: 0.06,
      starColor: 0xbafff2,
      starScale: 0.38,
    },
    // Leviatán KRONOS (Boss): cápsula serpentante azul abisal.
    kronos_leviathan: {
      geometry: new THREE.CapsuleGeometry(2.6, 9.5, 8, 14),
      color: 0x2f6bff,
      rim: 0x9fc0ff,
      outlineThickness: 0.07,
      starColor: 0xfff0a3,
      starScale: 0.35,
    },
  };
}

// ---------------------------------------------------------------------------
// Internos por enemigo (materiales y estado de comportamiento)
// ---------------------------------------------------------------------------

/** Hueso procedural con su pose de reposo: la animación se compone encima
 * para no romper el bind del skin. Sirve a los tentáculos del pulpo
 * (`tentacle_*`) y a las patas del cangrejo (`leg_*`). */
interface TentacleBone {
  bone: THREE.Object3D;
  rest: THREE.Quaternion;
  amplitude: number;
}

/**
 * Recolecta los huesos `tentacle_*` del rig (octopus_rig) ordenados de base a
 * punta, guardando su pose de reposo: la oscilación procedural se compone
 * encima para no romper el bind del skin.
 */
function collectTentacleBones(root: THREE.Object3D): TentacleBone[] {
  const tentacles: TentacleBone[] = [];
  root.traverse((obj) => {
    const match = /^tentacle_(\d+)_(\d+)$/.exec(obj.name);
    if (!match) {
      return;
    }
    const segment = parseInt(match[2], 10);
    tentacles.push({
      bone: obj,
      rest: obj.quaternion.clone(),
      amplitude: segment <= 1 ? TENTACLE_BASE_AMPLITUDE : TENTACLE_TIP_AMPLITUDE,
    });
  });
  tentacles.sort((a, b) => a.bone.name.localeCompare(b.bone.name));
  return tentacles;
}

interface TurretRig {
  node: THREE.Object3D;
  /** Eje local por el que dispara el cañón. */
  forward: THREE.Vector3;
}

/**
 * Localiza el cañón del cangrejo dentro del GLB: hueso `turret` (los huesos de
 * Blender apuntan por su +Y local) o, en su defecto, el mesh `detail_cannon`
 * (geometría extendida hacia +Z local).
 */
function findTurretRig(root: THREE.Object3D): TurretRig | null {
  const turret = root.getObjectByName('turret');
  if (turret) {
    return { node: turret, forward: new THREE.Vector3(0, 1, 0) };
  }
  const cannon = root.getObjectByName('detail_cannon');
  if (cannon) {
    return { node: cannon, forward: new THREE.Vector3(0, 0, 1) };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Cangrejo Artillero: suelos (spawn pegado + salto entre ellos)
// ---------------------------------------------------------------------------

/** Huesos `leg_*` del cangrejo para el aleteo procedural en el aire. */
function collectLegBones(root: THREE.Object3D): TentacleBone[] {
  const legs: TentacleBone[] = [];
  root.traverse((obj) => {
    if (/^leg_/.test(obj.name)) {
      legs.push({ bone: obj, rest: obj.quaternion.clone(), amplitude: CRAB_LEG_WAVE_AMPLITUDE });
    }
  });
  legs.sort((a, b) => a.bone.name.localeCompare(b.bone.name));
  return legs;
}

/** Punto mundial sobre la cara superior (+Y local) del slab para un offset local. */
function slabTopPoint(slab: SlabCollider, local: THREE.Vector2, out: THREE.Vector3): THREE.Vector3 {
  _localOffset.set(local.x, slab.halfExtents.y, local.y).applyQuaternion(slab.quaternion);
  return out.copy(slab.center).add(_localOffset);
}

/**
 * Offset local (lx, lz) aleatorio dentro de la zona pisable del slab: el
 * rectángulo OBB con margen, o un punto baricéntrico del triángulo 2D si el
 * slab es un triángulo de la esfera (Miniboss/Boss).
 */
function pickSlabLocalPoint(slab: SlabCollider, rng: () => number, out: THREE.Vector2): void {
  const tri = slab.localTriangle2D;
  if (tri) {
    let u = rng();
    let v = rng();
    if (u + v > 1) {
      u = 1 - u;
      v = 1 - v;
    }
    const w = 1 - u - v;
    const gx = (tri[0] + tri[2] + tri[4]) / 3;
    const gz = (tri[1] + tri[3] + tri[5]) / 3;
    // Contraído hacia el centroide para respetar el margen del borde.
    out.set(
      gx + (u * tri[0] + v * tri[2] + w * tri[4] - gx) * 0.65,
      gz + (u * tri[1] + v * tri[3] + w * tri[5] - gz) * 0.65,
    );
    return;
  }
  const mx = Math.max(0, slab.halfExtents.x - CRAB_SLAB_MARGIN);
  const mz = Math.max(0, slab.halfExtents.z - CRAB_SLAB_MARGIN);
  out.set((rng() * 2 - 1) * mx, (rng() * 2 - 1) * mz);
}

/** Fija el offset local dentro de los bordes del slab (el knockback desliza). */
function clampSlabLocalPoint(slab: SlabCollider, local: THREE.Vector2): void {
  const tri = slab.localTriangle2D;
  if (tri) {
    // Triángulo: si el deslizamiento salió del triángulo, tira al centroide.
    const s1 = (tri[2] - tri[0]) * (local.y - tri[1]) - (tri[3] - tri[1]) * (local.x - tri[0]);
    const s2 = (tri[4] - tri[2]) * (local.y - tri[3]) - (tri[5] - tri[3]) * (local.x - tri[2]);
    const s3 = (tri[0] - tri[4]) * (local.y - tri[5]) - (tri[1] - tri[5]) * (local.x - tri[4]);
    if ((s1 < 0 || s2 < 0 || s3 < 0) && (s1 > 0 || s2 > 0 || s3 > 0)) {
      local.set((tri[0] + tri[2] + tri[4]) / 3, (tri[1] + tri[3] + tri[5]) / 3);
    }
    return;
  }
  const mx = Math.max(0, slab.halfExtents.x - CRAB_SLAB_MARGIN);
  const mz = Math.max(0, slab.halfExtents.z - CRAB_SLAB_MARGIN);
  local.x = THREE.MathUtils.clamp(local.x, -mx, mx);
  local.y = THREE.MathUtils.clamp(local.y, -mz, mz);
}

/**
 * Slab de spawn del cangrejo: uno aleatorio dentro de R < 70 m; si todos están
 * lejos, el más cercano al centro de la cúpula.
 */
function pickCrabSpawnSlab(activeSlabs: SlabCollider[], rng: () => number): SlabCollider | null {
  if (activeSlabs.length === 0) {
    return null;
  }
  let nearCount = 0;
  for (const slab of activeSlabs) {
    if (slab.center.length() < CRAB_SPAWN_MAX_R) {
      nearCount++;
    }
  }
  if (nearCount > 0) {
    let pick = Math.floor(rng() * nearCount);
    for (const slab of activeSlabs) {
      if (slab.center.length() < CRAB_SPAWN_MAX_R && pick-- === 0) {
        return slab;
      }
    }
  }
  let best = activeSlabs[0];
  for (const slab of activeSlabs) {
    if (slab.center.length() < best.center.length()) {
      best = slab;
    }
  }
  return best;
}

/**
 * Destino del salto del cangrejo: el slab disponible más cercano al cangrejo
 * con center < 68 m o, si todos están lejos, el más cercano al centro de la
 * cúpula. Excluye el slab que está abandonando.
 */
function pickCrabJumpSlab(
  activeSlabs: SlabCollider[] | undefined,
  leavingSlabId: string | null,
  fromPos: THREE.Vector3,
): SlabCollider | null {
  if (!activeSlabs || activeSlabs.length === 0) {
    return null;
  }
  let best: SlabCollider | null = null;
  let bestScore = Infinity;
  for (const slab of activeSlabs) {
    if (slab.id === leavingSlabId) {
      continue;
    }
    if (slab.center.length() < CRAB_JUMP_TARGET_MAX_R) {
      const score = fromPos.distanceTo(slab.center);
      if (score < bestScore) {
        best = slab;
        bestScore = score;
      }
    }
  }
  if (best) {
    return best;
  }
  for (const slab of activeSlabs) {
    if (slab.id === leavingSlabId) {
      continue;
    }
    const score = slab.center.length();
    if (score < bestScore) {
      best = slab;
      bestScore = score;
    }
  }
  return best;
}

/** Altura del arco del salto según la distancia al slab destino. */
function crabJumpArc(dist: number): number {
  return Math.min(CRAB_JUMP_ARC_MAX, CRAB_JUMP_ARC_MIN + dist * 0.22);
}

/** Busca un slab por id dentro de la lista de suelos activos. */
function findSlabById(slabs: SlabCollider[], id: string): SlabCollider | null {
  for (const slab of slabs) {
    if (slab.id === id) {
      return slab;
    }
  }
  return null;
}

/** Duración del salto: ~0.75 s en saltos cortos, algo más en saltos largos. */
function crabJumpDuration(dist: number): number {
  return Math.min(CRAB_JUMP_DURATION_MAX, Math.max(CRAB_JUMP_DURATION, dist / CRAB_JUMP_H_SPEED));
}

/** Salto parabólico del cangrejo entre suelos (estado en vuelo). */
interface CrabJump {
  /** Punto de despegue en espacio mundo. */
  from: THREE.Vector3;
  /** Id del slab de aterrizaje. */
  targetSlabId: string;
  /** Offset local (lx, lz) de aterrizaje dentro del slab destino. */
  targetLocal: THREE.Vector2;
  /** Duración total del salto (s). */
  duration: number;
  /** Segundos de vuelo transcurridos. */
  time: number;
  /** Altura del vértice del arco sobre la línea despegue→aterrizaje (m). */
  arcHeight: number;
  /** Desvío acumulado por knockback durante el vuelo (m). */
  offset: THREE.Vector3;
}

interface EnemyInternal {
  enemy: ManagedWaveEnemy;
  material: THREE.ShaderMaterial | null;
  outlineMaterial: THREE.ShaderMaterial | null;
  /** Materiales con `uTime` (carne nebulosa + contorno vibrante): reloj por frame. */
  animatedMaterials: THREE.ShaderMaterial[];
  starCores: THREE.Object3D[];
  mixer?: THREE.AnimationMixer;
  isGlb?: boolean;
  /** Timer del ciclo de pinchos (Necrozma). */
  spikeTimer: number;
  /** Segundos restantes de embestida en curso (0 = libre). */
  chargeTimer: number;
  chargeSpeed: number;
  chargeDamage: number;
  chargeDir: THREE.Vector3;
  /** Pulpo: huesos `tentacle_*` para la oscilación procedural. */
  tentacles: TentacleBone[];
  /** Cangrejo: huesos `leg_*` para el aleteo procedural en el aire. */
  legs: TentacleBone[];
  /** Cangrejo: nodo del cañón (hueso `turret` o mesh `detail_cannon`). */
  turretNode: THREE.Object3D | null;
  /** Cangrejo: eje local de disparo del cañón. */
  turretForward: THREE.Vector3;
  /** Cangrejo: id del slab al que está pegado (null = flotación suave). */
  attachedSlabId: string | null;
  /** Cangrejo: offset local (lx, lz) dentro del slab para no salirse del borde. */
  slabLocalOffset: THREE.Vector2;
  /** Cangrejo: progreso 0..1 del aterrizaje en el slab actual. */
  attachBlend: number;
  /** Cangrejo: posición de partida del aterrizaje suave. */
  attachFrom: THREE.Vector3;
  /** Cangrejo: salto en curso entre suelos (null = pegado o flotando). */
  jump: CrabJump | null;
}

/**
 * Localiza el material del cuerpo del enemigo para el flash de impacto:
 * prefiere la carne nebulosa (uniforms `uTime` + `uEmissiveBoost`) y cae al
 * primer material cel con `uEmissiveBoost` (star_core, forma provisional).
 */
function findBodyMaterial(root: THREE.Object3D): THREE.ShaderMaterial | null {
  let cel: THREE.ShaderMaterial | null = null;
  let nebula: THREE.ShaderMaterial | null = null;
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) {
      return;
    }
    const m = mesh.material;
    if (!(m instanceof THREE.ShaderMaterial) || !m.uniforms.uEmissiveBoost) {
      return;
    }
    if (m.uniforms.uTime) {
      if (!nebula) nebula = m;
    } else if (!cel) {
      cel = m;
    }
  });
  return nebula ?? cel;
}

interface WaveProjectile {
  mesh: THREE.Mesh;
  active: boolean;
  kind: 'dark' | 'ink';
  damage: number;
  velocity: THREE.Vector3;
  life: number;
}

// ---------------------------------------------------------------------------
// DomeWaveManager
// ---------------------------------------------------------------------------

export class DomeWaveManager {
  /** Enemigos vivos de la oleada (compatibles con TestEnemySphere[]). */
  readonly enemies: ManagedWaveEnemy[] = [];

  private readonly scene: THREE.Scene;
  private readonly internals = new Map<string, EnemyInternal>();
  private readonly visuals: Record<EnemyArchetype, ArchetypeVisual>;
  private readonly starGeometry = new THREE.OctahedronGeometry(1, 0);
  private readonly projectiles: WaveProjectile[] = [];
  private readonly projectileGeometry = new THREE.SphereGeometry(0.55, 12, 10);
  private readonly darkProjectileMaterial: THREE.ShaderMaterial;
  private readonly inkProjectileMaterial: THREE.ShaderMaterial;

  private currentWave = 0;
  private waveTime = 0;
  private speedMult = 1;

  private readonly unsubModelLoaded: () => void;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.visuals = buildArchetypeVisuals();
    this.unsubModelLoaded = onEnemyModelLoaded((archetype) => {
      this.upgradeSpawnedVisuals(archetype);
    });
    preloadEnemyModels();

    this.darkProjectileMaterial = createComicCelMaterial(0x1c1030, {
      rimColor: 0x6b4bff,
      rimStrength: 0.9,
      emissiveBoost: 0.35,
    });
    this.inkProjectileMaterial = createComicCelMaterial(0x0a0a12, {
      rimColor: 0x4a2a6a,
      rimStrength: 0.8,
      emissiveBoost: 0.2,
    });

    for (let i = 0; i < PROJECTILE_POOL_SIZE; i++) {
      const mesh = new THREE.Mesh(this.projectileGeometry, this.darkProjectileMaterial);
      addComicOutline(mesh, 0.05);
      mesh.visible = false;
      this.scene.add(mesh);
      this.projectiles.push({
        mesh,
        active: false,
        kind: 'dark',
        damage: 0,
        velocity: new THREE.Vector3(),
        life: 0,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Ciclo de oleadas
  // -------------------------------------------------------------------------

  /**
   * Limpia la oleada anterior y despliega la composición de `waveNumber`.
   * Con `activeSlabs`, los Cangrejos Artilleros aparecen pegados a un suelo
   * flotante dentro de la cúpula (center < 70 m).
   */
  startWave(waveNumber: number, activeSlabs?: SlabCollider[]): void {
    this.clearEnemies();
    this.deactivateAllProjectiles();

    this.currentWave = waveNumber;
    this.waveTime = 0;

    const plan = getWavePlan(waveNumber);
    this.speedMult = plan.speedMult;

    const rng = makeRng(waveNumber * 7919 + 13);
    let spawnIndex = 0;

    for (const spawn of plan.spawns) {
      for (let i = 0; i < spawn.count; i++) {
        const archetype =
          spawn.archetype === 'basic_mix'
            ? BASIC_ARCHETYPES[spawnIndex % BASIC_ARCHETYPES.length]
            : spawn.archetype;
        this.spawnEnemy(archetype, spawnIndex, rng, activeSlabs);
        spawnIndex++;
      }
    }
  }

  private upgradeSpawnedVisuals(archetype: EnemyArchetype): void {
    for (const enemy of this.enemies) {
      if (enemy.entity.archetype !== archetype || !enemy.entity.alive) continue;
      const internal = this.internals.get(enemy.id);
      if (!internal || internal.isGlb) continue;
      const glbVisual = instantiateEnemyVisual(archetype);
      if (!glbVisual) continue;

      const oldMesh = enemy.mesh;
      glbVisual.root.name = oldMesh.name;
      glbVisual.root.position.copy(oldMesh.position);
      glbVisual.root.quaternion.copy(oldMesh.quaternion);
      this.scene.remove(oldMesh);
      this.scene.add(glbVisual.root);

      internal.material?.dispose();
      internal.outlineMaterial?.dispose();

      enemy.mesh = glbVisual.root;
      enemy.position = glbVisual.root.position;
      enemy.entity.mesh = glbVisual.root;
      internal.material = findBodyMaterial(glbVisual.root);
      internal.outlineMaterial = null;
      internal.animatedMaterials = glbVisual.animatedMaterials;
      internal.starCores = glbVisual.starCores;
      internal.mixer = glbVisual.mixer;
      internal.isGlb = true;
      // Huesos procedurales del GLB: tentáculos del pulpo, patas y cañón del cangrejo.
      internal.tentacles = collectTentacleBones(glbVisual.root);
      internal.legs = collectLegBones(glbVisual.root);
      const turretRig = findTurretRig(glbVisual.root);
      internal.turretNode = turretRig?.node ?? null;
      if (turretRig) {
        internal.turretForward.copy(turretRig.forward);
      }
    }
  }

  private spawnEnemy(
    archetype: EnemyArchetype,
    index: number,
    rng: () => number,
    activeSlabs?: SlabCollider[],
  ): void {
    const stats = DOME_ENEMY_ARCHETYPES[archetype];
    const visual = this.visuals[archetype];
    const glbVisual = instantiateEnemyVisual(archetype);

    let mesh: THREE.Object3D;
    let material: THREE.ShaderMaterial | null = null;
    let outlineMaterial: THREE.ShaderMaterial | null = null;
    let starCores: THREE.Object3D[] = [];
    let mixer: THREE.AnimationMixer | undefined;
    let animatedMaterials: THREE.ShaderMaterial[] = [];

    if (glbVisual) {
      mesh = glbVisual.root;
      mesh.name = `waveEnemy_${this.currentWave}_${archetype}_${index}`;
      starCores = glbVisual.starCores;
      mixer = glbVisual.mixer;
      animatedMaterials = glbVisual.animatedMaterials;
      material = findBodyMaterial(glbVisual.root);
    } else {
      material = createComicCelMaterial(visual.color, {
        rimColor: visual.rim,
        rimStrength: 0.7,
        emissiveBoost: 0.0,
      });
      const fallbackMesh = new THREE.Mesh(visual.geometry, material);
      fallbackMesh.name = `waveEnemy_${this.currentWave}_${archetype}_${index}`;
      const outline = addComicOutline(fallbackMesh, visual.outlineThickness);
      outlineMaterial = outline.material as THREE.ShaderMaterial;

      // Estrella interior de prueba: núcleo brillante visible a través del cuerpo.
      const starMaterial = createComicCelMaterial(visual.starColor, {
        rimColor: visual.starColor,
        rimStrength: 1.0,
        emissiveBoost: 0.95,
      });
      const star = new THREE.Mesh(this.starGeometry, starMaterial);
      star.scale.setScalar(visual.starScale);
      fallbackMesh.add(star);
      starCores = [star];
      mesh = fallbackMesh;
    }

    // Posición de aparición: anillo distribuido + jitter determinista.
    const angle = (index / Math.max(1, this.enemies.length + 6)) * Math.PI * 2 + rng() * 1.2;
    const dist = 26 + rng() * 30;
    const homePos = new THREE.Vector3(
      Math.cos(angle) * dist,
      6 + rng() * 30,
      Math.sin(angle) * dist,
    );

    // Cangrejo Artillero: aparece directamente encima de un suelo flotante
    // dentro de la cúpula (preferiblemente center < 70 m).
    let attachedSlabId: string | null = null;
    const slabLocalOffset = new THREE.Vector2();
    if (archetype === 'crab_gunner' && activeSlabs && activeSlabs.length > 0) {
      const slab = pickCrabSpawnSlab(activeSlabs, rng);
      if (slab) {
        pickSlabLocalPoint(slab, rng, slabLocalOffset);
        slabTopPoint(slab, slabLocalOffset, homePos);
        _slabUp.set(0, 1, 0).applyQuaternion(slab.quaternion);
        homePos.addScaledVector(_slabUp, CRAB_STAND_HEIGHT);
        attachedSlabId = slab.id;
      }
    }
    mesh.position.copy(homePos);
    this.scene.add(mesh);

    const entity = createDomeEnemyEntity(mesh.name, archetype, mesh, homePos);
    entity.evasive = EVASIVE_ARCHETYPES.has(archetype);

    const enemy: ManagedWaveEnemy = {
      id: mesh.name,
      mesh,
      position: mesh.position,
      velocity: new THREE.Vector3(),
      homePos,
      radius: stats.radius,
      evasive: entity.evasive,
      evadeCooldown: 0,
      hitFlash: 0,
      entity,
      phase: rng() * Math.PI * 2,
      dashTimer: 0,
      dashSign: index % 2 === 0 ? 1 : -1,
      attackTimer: 1.2 + rng() * 1.8,
    };

    this.enemies.push(enemy);
    const turretRig = findTurretRig(mesh);
    this.internals.set(enemy.id, {
      enemy,
      material,
      outlineMaterial,
      animatedMaterials,
      starCores,
      mixer,
      isGlb: glbVisual !== null,
      spikeTimer: NECROZMA_SPIKES_OFF_SEC,
      chargeTimer: 0,
      chargeSpeed: 0,
      chargeDamage: 0,
      chargeDir: new THREE.Vector3(),
      tentacles: collectTentacleBones(mesh),
      legs: collectLegBones(mesh),
      turretNode: turretRig?.node ?? null,
      turretForward: turretRig ? turretRig.forward : new THREE.Vector3(0, 0, 1),
      attachedSlabId,
      slabLocalOffset,
      attachBlend: attachedSlabId ? 1 : 0,
      attachFrom: homePos.clone(),
      jump: null,
    });
  }

  // -------------------------------------------------------------------------
  // API pública
  // -------------------------------------------------------------------------

  getWaveInfo(): WaveInfo {
    const plan = getWavePlan(Math.max(1, this.currentWave));
    return {
      wave: this.currentWave,
      label: plan.label,
      floorMode: plan.floorMode,
      remaining: this.getActiveEnemies().length,
    };
  }

  getActiveEnemies(): ManagedWaveEnemy[] {
    return this.enemies.filter((e) => e.entity.alive);
  }

  /**
   * Impacto de patada/taladro de Nyx: knockback físico + flash, sincronizado
   * con la entidad de combate. Acepta cualquier `TestEnemySphere` (el
   * controller no necesita conocer `ManagedWaveEnemy`).
   */
  onHitEnemy(enemy: TestEnemySphere, hitDir: THREE.Vector3, isDrill: boolean, impactSpeed?: number): void {
    const internal = this.internals.get(enemy.id);
    if (!internal) {
      return;
    }
    const kineticMult = Math.max(0.6, Math.pow((impactSpeed ?? 16) / 14, 1.35));
    const baseKnockback = isDrill ? HIT_KNOCKBACK_DRILL : HIT_KNOCKBACK;
    internal.enemy.velocity.addScaledVector(hitDir, baseKnockback * kineticMult);
    internal.enemy.hitFlash = Math.min(1.8, kineticMult);
    internal.enemy.entity.hitFlash = internal.enemy.hitFlash;
    // Un golpe interrumpe la embestida en curso.
    internal.chargeTimer = 0;
  }

  /** Elimina un enemigo (escena + materiales + listas). Idempotente. */
  killEnemy(enemy: ManagedWaveEnemy): void {
    const internal = this.internals.get(enemy.id);
    if (!internal) {
      return;
    }
    enemy.entity.alive = false;
    enemy.entity.hp = 0;
    this.scene.remove(enemy.mesh);
    internal.material?.dispose();
    internal.outlineMaterial?.dispose();
    // Carne nebulosa + contornos vibrantes: material propio por instancia.
    for (const animatedMaterial of internal.animatedMaterials) {
      animatedMaterial.dispose();
    }
    // Estrella interior: material propio por enemigo, geometría compartida.
    for (const child of enemy.mesh.children) {
      if (child instanceof THREE.Mesh) {
        (child.material as THREE.Material).dispose();
      }
    }
    this.internals.delete(enemy.id);
    const idx = this.enemies.indexOf(enemy);
    if (idx >= 0) {
      this.enemies.splice(idx, 1);
    }
  }

  /**
   * true mientras el enemigo salta entre suelos (el Cangrejo Artillero en
   * pleno arco no muere por la Barrera Blanca).
   */
  isEnemyJumping(enemy: TestEnemySphere): boolean {
    return (this.internals.get(enemy.id)?.jump ?? null) !== null;
  }

  /**
   * Update por frame: flotación, dashes evasivos, ataques (proyectiles
   * oscuros / tinta / embestidas), pinchos de Necrozma, cangrejo pegado a
   * `activeSlabs` (con saltos entre ellos), colisión de voladores contra los
   * icebergs y proyectiles en vuelo.
   */
  update(
    dt: number,
    elapsed: number,
    playerPos: THREE.Vector3,
    lockedEnemy: TestEnemySphere | null,
    playerAttackTime: number,
    activeSlabs: SlabCollider[] | undefined,
    onPlayerHit: (damage: number) => void,
    onOctopusInk: () => void,
  ): { didEnemyEvadeDash: boolean } {
    let didEnemyEvadeDash = false;
    this.waveTime += dt;
    const lockedId = lockedEnemy?.id ?? null;

    // Copia: killEnemy puede mutar this.enemies durante el bucle.
    for (const enemy of [...this.enemies]) {
      const internal = this.internals.get(enemy.id);
      if (!internal) {
        continue;
      }
      // Limpieza defensiva: si el DomeCombatSystem ya lo mató, lo retiramos.
      if (!enemy.entity.alive) {
        this.killEnemy(enemy);
        continue;
      }

      enemy.evadeCooldown = Math.max(0, enemy.evadeCooldown - dt);
      enemy.entity.evadeCooldown = enemy.evadeCooldown;
      if (enemy.hitFlash > 0) {
        enemy.hitFlash = Math.max(0, enemy.hitFlash - dt * HIT_FLASH_DECAY);
        enemy.entity.hitFlash = enemy.hitFlash;
      }
      enemy.dashTimer = Math.max(0, enemy.dashTimer - dt);
      enemy.attackTimer -= dt;

      // Reloj de los shaders animados: carne nebulosa y contorno vibrante.
      for (const animatedMaterial of internal.animatedMaterials) {
        animatedMaterial.uniforms.uTime.value = elapsed;
      }

      // Rotación continua de la estrella interior en 2 ejes + vibración de energía
      for (const star of internal.starCores) {
        star.rotation.y += dt * 2.8;
        star.rotation.x += dt * 2.0;
        star.position.set(
          Math.sin(elapsed * 29 + enemy.phase) * 0.035,
          Math.cos(elapsed * 34 + enemy.phase) * 0.035,
          Math.sin(elapsed * 23 + enemy.phase * 1.4) * 0.035,
        );
      }
      internal.mixer?.update(dt);

      // --- Dash evasivo: rompe el lock-in de los arquetipos escurridizos ---
      if (
        enemy.evasive &&
        enemy.id === lockedId &&
        enemy.evadeCooldown <= 0 &&
        (playerAttackTime >= EVADE_TRIGGER_ATTACK_TIME ||
          enemy.position.distanceTo(playerPos) < EVADE_TRIGGER_DISTANCE)
      ) {
        _toEnemy.subVectors(enemy.position, playerPos);
        const dist = _toEnemy.length();
        if (dist > 1e-4) {
          _toEnemy.divideScalar(dist);
          _perp.crossVectors(_toEnemy, _up);
          if (_perp.lengthSq() < 1e-4) {
            _perp.set(1, 0, 0);
          } else {
            _perp.normalize();
          }
          _perp.multiplyScalar(enemy.dashSign);
          enemy.dashSign = enemy.dashSign === 1 ? -1 : 1;

          enemy.velocity
            .copy(_perp)
            .multiplyScalar(EVASIVE_DASH_SPEED * this.speedMult)
            .addScaledVector(_up, EVASIVE_DASH_LIFT);
          enemy.dashTimer = EVASIVE_DASH_TIME;
          enemy.evadeCooldown = EVASIVE_COOLDOWN;
          enemy.hitFlash = Math.max(enemy.hitFlash, 0.35);
          didEnemyEvadeDash = true;
        }
      }

      // --- Comportamiento ofensivo por arquetipo ---
      this.updateEnemyBehavior(enemy, internal, dt, playerPos, onPlayerHit, onOctopusInk);

      // --- Movimiento: cangrejo pegado a suelos / flotación del resto ---
      const isCrab = enemy.entity.archetype === 'crab_gunner';
      if (isCrab) {
        this.updateCrabEnemy(enemy, internal, dt, elapsed, playerPos, activeSlabs);
      } else {
        this.applyFloatMovement(enemy, internal, dt, elapsed);
      }

      // --- Voladores contra los icebergs: nunca atraviesan los suelos ---
      const crabOnSlab = isCrab && (internal.jump !== null || internal.attachedSlabId !== null);
      if (
        activeSlabs &&
        !crabOnSlab &&
        resolveSphereSlabCollision(activeSlabs, enemy.position, enemy.radius, _slabContact)
      ) {
        enemy.position.addScaledVector(_slabContact.normal, _slabContact.depth);
        const into = enemy.velocity.dot(_slabContact.normal);
        if (into < 0) {
          // Reflejo suave de la velocidad contra la normal del slab.
          enemy.velocity.addScaledVector(
            _slabContact.normal,
            -into * (1 + SLAB_BOUNCE_RESTITUTION),
          );
        }
      }

      // --- Pose procedural: el pulpo encara a Nyx y ondea sus tentáculos ---
      if (enemy.entity.archetype === 'spiral_octopus') {
        this.updateOctopusPose(enemy, internal, dt, elapsed, playerPos);
      }

      enemy.entity.position.copy(enemy.position);
      enemy.entity.velocity.copy(enemy.velocity);

      // --- Flash de impacto + vibración de energía descontrolada + pinchos ---
      const flash = enemy.hitFlash;
      const baseScale = 1 + flash * HIT_FLASH_SCALE;
      enemy.mesh.scale.set(
        baseScale + Math.sin(elapsed * 27 + enemy.phase) * 0.026,
        baseScale + Math.cos(elapsed * 31 + enemy.phase) * 0.026,
        baseScale + Math.sin(elapsed * 24 + enemy.phase * 1.7) * 0.026,
      );
      let emissive = flash * HIT_FLASH_EMISSIVE;
      if (internal.material) {
        if (enemy.entity.spikesActive) {
          emissive += 0.5;
          internal.material.uniforms.uRimColor.value.setHex(NECROZMA_SPIKES_RIM);
        } else if (enemy.entity.archetype === 'prisma_necrozma') {
          internal.material.uniforms.uRimColor.value.setHex(NECROZMA_BASE_RIM);
        }
        internal.material.uniforms.uEmissiveBoost.value = emissive;
      }
    }

    this.updateProjectiles(dt, playerPos, onPlayerHit, onOctopusInk);

    return { didEnemyEvadeDash };
  }

  dispose(): void {
    this.unsubModelLoaded();
    this.clearEnemies();
    this.deactivateAllProjectiles();
    for (const projectile of this.projectiles) {
      this.scene.remove(projectile.mesh);
    }
    this.projectileGeometry.dispose();
    this.darkProjectileMaterial.dispose();
    this.inkProjectileMaterial.dispose();
    for (const visual of Object.values(this.visuals)) {
      visual.geometry.dispose();
    }
    this.starGeometry.dispose();
    this.projectiles.length = 0;
  }

  // -------------------------------------------------------------------------
  // Comportamiento ofensivo
  // -------------------------------------------------------------------------

  private updateEnemyBehavior(
    enemy: ManagedWaveEnemy,
    internal: EnemyInternal,
    dt: number,
    playerPos: THREE.Vector3,
    onPlayerHit: (damage: number) => void,
    onOctopusInk: () => void,
  ): void {
    const archetype = enemy.entity.archetype;

    // Prisma Necrozma: alterna pinchos periódicamente (repelen cuerpo a cuerpo).
    if (archetype === 'prisma_necrozma') {
      internal.spikeTimer -= dt;
      if (internal.spikeTimer <= 0) {
        const nextActive = !enemy.entity.spikesActive;
        enemy.entity.spikesActive = nextActive;
        internal.spikeTimer = nextActive ? NECROZMA_SPIKES_ON_SEC : NECROZMA_SPIKES_OFF_SEC;
      }
    }

    // Contacto de embestida en curso: daño a Nyx y fin de la carga.
    if (internal.chargeTimer > 0) {
      const dist = enemy.position.distanceTo(playerPos);
      if (dist < enemy.radius + CHARGE_CONTACT_PADDING) {
        onPlayerHit(internal.chargeDamage);
        internal.chargeTimer = 0;
        enemy.attackTimer = 3.2 / this.speedMult;
        // Rebote del propio enemigo tras embestir.
        enemy.velocity.copy(internal.chargeDir).multiplyScalar(-8);
      }
      return;
    }

    if (enemy.attackTimer > 0) {
      return;
    }

    const distToPlayer = enemy.position.distanceTo(playerPos);
    const mult = this.speedMult;

    switch (archetype) {
      case 'crab_gunner':
        // Torreta: dispara esferas oscuras lentas desde la boca del cañón.
        // En pleno salto entre suelos aguanta el disparo hasta aterrizar.
        if (internal.jump) {
          enemy.attackTimer = 0.35;
          break;
        }
        if (this.computeCrabMuzzle(internal, _muzzlePos)) {
          this.fireProjectile(enemy, playerPos, 'dark', 8, 10 * mult, 0, _muzzlePos);
        } else {
          this.fireProjectile(enemy, playerPos, 'dark', 8, 10 * mult);
        }
        enemy.attackTimer = 2.8 / mult;
        break;

      case 'spiral_octopus': {
        // Chorro de tinta desde el frente del manto: mancha la pantalla de Nyx.
        _muzzleDir.subVectors(playerPos, enemy.position);
        if (_muzzleDir.lengthSq() < 1e-4) {
          _muzzleDir.set(0, 0, 1);
        } else {
          _muzzleDir.normalize();
        }
        _muzzlePos
          .copy(enemy.position)
          .addScaledVector(_muzzleDir, enemy.radius * OCTOPUS_INK_FORWARD)
          .addScaledVector(_up, enemy.radius * OCTOPUS_INK_UP);
        this.fireProjectile(enemy, playerPos, 'ink', 0, 8 * mult, 0, _muzzlePos);
        enemy.attackTimer = 4.5 / mult;
        break;
      }

      case 'ground_golem':
        // Rompesuelos: embiste si Nyx se acerca.
        if (distToPlayer < CHARGE_TRIGGER_DISTANCE) {
          this.startCharge(enemy, internal, playerPos, 17 * mult, 14);
          enemy.attackTimer = 3.5 / mult;
        } else {
          enemy.attackTimer = 0.5;
        }
        break;

      case 'giant_sparrow':
        // Élite: alterna picado (cerca) y esferas oscuras (lejos).
        if (distToPlayer < 20) {
          this.startCharge(enemy, internal, playerPos, 21 * mult, 12);
        } else {
          this.fireProjectile(enemy, playerPos, 'dark', 12, 12 * mult);
        }
        enemy.attackTimer = 3.2 / mult;
        break;

      case 'prisma_necrozma':
        // Élite: bombardeo prismático constante.
        this.fireProjectile(enemy, playerPos, 'dark', 10, 11 * mult);
        enemy.attackTimer = 2.4 / mult;
        break;

      case 'kronos_leviathan':
        // Boss: abanico de 3 esferas oscuras.
        this.fireProjectile(enemy, playerPos, 'dark', 9, 12 * mult, -0.22);
        this.fireProjectile(enemy, playerPos, 'dark', 9, 12 * mult);
        this.fireProjectile(enemy, playerPos, 'dark', 9, 12 * mult, 0.22);
        enemy.attackTimer = 2.0 / mult;
        break;

      case 'lightning_butterfly':
      case 'abyssal_cell':
      default:
        // Pasivos/escurridizos: sin ataque ofensivo propio.
        enemy.attackTimer = 1.0;
        break;
    }
  }

  private startCharge(
    enemy: ManagedWaveEnemy,
    internal: EnemyInternal,
    playerPos: THREE.Vector3,
    speed: number,
    damage: number,
  ): void {
    internal.chargeDir.subVectors(playerPos, enemy.position);
    if (internal.chargeDir.lengthSq() < 1e-4) {
      internal.chargeDir.set(0, 0, 1);
    } else {
      internal.chargeDir.normalize();
    }
    internal.chargeSpeed = speed;
    internal.chargeDamage = damage;
    internal.chargeTimer = 1.2;
    enemy.hitFlash = Math.max(enemy.hitFlash, 0.25);
  }

  /**
   * Dispara un proyectil del pool hacia Nyx. Con `origin` (boca del cañón o
   * frente del manto) nace allí y sale rugiendo hacia el jugador; sin él,
   * nace en el borde de la esfera del enemigo.
   */
  private fireProjectile(
    enemy: ManagedWaveEnemy,
    playerPos: THREE.Vector3,
    kind: 'dark' | 'ink',
    damage: number,
    speed: number,
    spreadRad = 0,
    origin?: THREE.Vector3,
  ): void {
    const projectile = this.projectiles.find((p) => !p.active);
    if (!projectile) {
      return;
    }
    const from = origin ?? enemy.position;
    _shotDir.subVectors(playerPos, from);
    if (_shotDir.lengthSq() < 1e-4) {
      _shotDir.set(0, 0, 1);
    } else {
      _shotDir.normalize();
    }
    if (spreadRad !== 0) {
      _perp.crossVectors(_shotDir, _up);
      if (_perp.lengthSq() < 1e-4) {
        _perp.set(1, 0, 0);
      } else {
        _perp.normalize();
      }
      _shotDir.addScaledVector(_perp, spreadRad).normalize();
    }

    projectile.active = true;
    projectile.kind = kind;
    projectile.damage = damage;
    projectile.life = PROJECTILE_LIFE_SEC;
    projectile.velocity.copy(_shotDir).multiplyScalar(speed);
    projectile.mesh.material = kind === 'ink' ? this.inkProjectileMaterial : this.darkProjectileMaterial;
    projectile.mesh.position.copy(from).addScaledVector(
      _shotDir,
      origin ? 0.35 : enemy.radius + 0.6,
    );
    projectile.mesh.visible = true;
  }

  private updateProjectiles(
    dt: number,
    playerPos: THREE.Vector3,
    onPlayerHit: (damage: number) => void,
    onOctopusInk: () => void,
  ): void {
    for (const projectile of this.projectiles) {
      if (!projectile.active) {
        continue;
      }
      projectile.life -= dt;
      projectile.mesh.position.addScaledVector(projectile.velocity, dt);

      const hitPlayer =
        projectile.mesh.position.distanceTo(playerPos) <
        PROJECTILE_PLAYER_RADIUS + projectile.mesh.scale.x * 0.55;
      const outOfBounds = projectile.mesh.position.length() > PROJECTILE_BOUND_RADIUS;

      if (hitPlayer) {
        if (projectile.kind === 'ink') {
          onOctopusInk();
        } else {
          onPlayerHit(projectile.damage);
        }
        this.deactivateProjectile(projectile);
      } else if (projectile.life <= 0 || outOfBounds) {
        this.deactivateProjectile(projectile);
      }
    }
  }

  private deactivateProjectile(projectile: WaveProjectile): void {
    projectile.active = false;
    projectile.mesh.visible = false;
    projectile.life = 0;
  }

  private deactivateAllProjectiles(): void {
    for (const projectile of this.projectiles) {
      this.deactivateProjectile(projectile);
    }
  }

  // -------------------------------------------------------------------------
  // Movimiento y pose procedural
  // -------------------------------------------------------------------------

  /**
   * Flotación estándar: bob senoidal + muelle hacia homePos (salvo dash o
   * embestida en curso) e integración de la velocidad en la posición.
   */
  private applyFloatMovement(
    enemy: ManagedWaveEnemy,
    internal: EnemyInternal,
    dt: number,
    elapsed: number,
  ): void {
    const bob = Math.sin(elapsed * FLOAT_BOB_SPEED + enemy.phase) * FLOAT_BOB_AMPLITUDE;
    _toHome.subVectors(enemy.homePos, enemy.position);
    const homeDist = _toHome.length();
    _toHome.y += bob * 0.35;

    if (internal.chargeTimer > 0) {
      // Embestida: velocidad constante hacia Nyx, sin freno ni muelle.
      enemy.velocity.copy(internal.chargeDir).multiplyScalar(internal.chargeSpeed);
      internal.chargeTimer = Math.max(0, internal.chargeTimer - dt);
    } else if (enemy.dashTimer <= 0) {
      enemy.velocity.addScaledVector(_toHome, FLOAT_SPRING * dt);
      if (homeDist > LEASH_RADIUS) {
        _toHome.normalize();
        enemy.velocity.addScaledVector(_toHome, HOME_PULL * dt);
      }
      _flat.set(enemy.position.x, 0, enemy.position.z);
      const flatDist = _flat.length();
      if (flatDist > DOME_KEEP_RADIUS) {
        _flat.normalize();
        enemy.velocity.addScaledVector(_flat, -DOME_KEEP_PULL * dt);
      }
      enemy.velocity.multiplyScalar(Math.exp(-FLOAT_DAMPING * dt));
    } else {
      enemy.velocity.multiplyScalar(Math.exp(-0.25 * dt));
    }

    enemy.position.addScaledVector(enemy.velocity, dt);
  }

  /**
   * Cangrejo Artillero: anclaje a suelos, salto parabólico entre ellos cuando
   * el suyo sale de la cúpula o desaparece, y flotación suave (con agarre de
   * suelos cercanos) mientras no quede ninguno disponible.
   */
  private updateCrabEnemy(
    enemy: ManagedWaveEnemy,
    internal: EnemyInternal,
    dt: number,
    elapsed: number,
    playerPos: THREE.Vector3,
    activeSlabs: SlabCollider[] | undefined,
  ): void {
    const slab =
      internal.attachedSlabId && activeSlabs
        ? findSlabById(activeSlabs, internal.attachedSlabId)
        : null;

    // El slab salió de la cúpula (>72 m) o desapareció: salta hacia otro.
    if (internal.attachedSlabId && (!slab || slab.center.length() > CRAB_LEAVE_R)) {
      this.startCrabJump(enemy, internal, activeSlabs, internal.attachedSlabId);
    }

    if (internal.jump) {
      this.updateCrabJump(enemy, internal, dt, activeSlabs);
      this.flapCrabLegs(enemy, internal, elapsed);
      return;
    }

    if (internal.attachedSlabId && slab) {
      this.updateCrabOnSlab(enemy, internal, slab, dt, playerPos);
      return;
    }

    // Sin slab: flotación suave + guiñeo de vuelo + agarre de suelos cercanos.
    this.applyFloatMovement(enemy, internal, dt, elapsed);
    this.orientCrabInFlight(enemy, dt, elapsed, playerPos);
    this.flapCrabLegs(enemy, internal, elapsed);
    if (activeSlabs && activeSlabs.length > 0) {
      const target = pickCrabJumpSlab(activeSlabs, null, enemy.position);
      if (target && enemy.position.distanceTo(target.center) <= CRAB_GRAB_RANGE) {
        this.startCrabJump(enemy, internal, activeSlabs, null);
      }
    }
  }

  /**
   * Arranca el salto parabólico hacia el mejor slab disponible (center < 68 m
   * o el más cercano al centro). Sin destino, el cangrejo pasa a flotación
   * suave anclada donde está.
   */
  private startCrabJump(
    enemy: ManagedWaveEnemy,
    internal: EnemyInternal,
    activeSlabs: SlabCollider[] | undefined,
    leavingSlabId: string | null,
  ): CrabJump | null {
    const target = pickCrabJumpSlab(activeSlabs, leavingSlabId, enemy.position);
    if (!target) {
      internal.attachedSlabId = null;
      internal.jump = null;
      enemy.homePos.copy(enemy.position);
      return null;
    }
    const targetLocal = new THREE.Vector2();
    pickSlabLocalPoint(target, Math.random, targetLocal);
    slabTopPoint(target, targetLocal, _targetPos);
    _slabUp.set(0, 1, 0).applyQuaternion(target.quaternion);
    _targetPos.addScaledVector(_slabUp, CRAB_STAND_HEIGHT);
    const dist = enemy.position.distanceTo(_targetPos);
    internal.jump = {
      from: enemy.position.clone(),
      targetSlabId: target.id,
      targetLocal,
      duration: crabJumpDuration(dist),
      time: 0,
      arcHeight: crabJumpArc(dist),
      offset: new THREE.Vector3(),
    };
    internal.attachedSlabId = null;
    return internal.jump;
  }

  /** Progresa el arco del salto en curso hasta aterrizar pegado al destino. */
  private updateCrabJump(
    enemy: ManagedWaveEnemy,
    internal: EnemyInternal,
    dt: number,
    activeSlabs: SlabCollider[] | undefined,
  ): void {
    const jump = internal.jump;
    if (!jump) {
      return;
    }

    // El knockback en vuelo desvía el arco; el amortiguador de aire lo frena.
    jump.offset.addScaledVector(enemy.velocity, dt);
    enemy.velocity.multiplyScalar(Math.exp(-CRAB_AIR_DAMPING * dt));

    const targetSlab = activeSlabs ? findSlabById(activeSlabs, jump.targetSlabId) : null;
    if (!targetSlab) {
      // El slab destino desapareció en pleno vuelo: re-objetiva o flota.
      const next = this.startCrabJump(enemy, internal, activeSlabs, jump.targetSlabId);
      if (next) {
        next.offset.add(jump.offset);
      }
      return;
    }

    jump.time += dt;
    const t = Math.min(1, jump.time / jump.duration);

    // Aterrizaje sobre la cara superior del slab destino (sigue su bob).
    slabTopPoint(targetSlab, jump.targetLocal, _targetPos);
    _slabUp.set(0, 1, 0).applyQuaternion(targetSlab.quaternion);
    _targetPos.addScaledVector(_slabUp, CRAB_STAND_HEIGHT);

    // Arco parabólico: línea despegue→aterrizaje más la altura del salto.
    enemy.position.lerpVectors(jump.from, _targetPos, t);
    enemy.position.y += jump.arcHeight * 4 * t * (1 - t);
    enemy.position.add(jump.offset);

    if (t >= 1) {
      // Aterrizaje pegado al slab destino, con blend suave desde donde tocó.
      internal.jump = null;
      internal.attachedSlabId = jump.targetSlabId;
      internal.slabLocalOffset.copy(jump.targetLocal);
      internal.attachBlend = 0;
      internal.attachFrom.copy(enemy.position);
    }
  }

  /** Cangrejo pegado a su slab: anclaje, deslizamiento por knockback y apuntado. */
  private updateCrabOnSlab(
    enemy: ManagedWaveEnemy,
    internal: EnemyInternal,
    slab: SlabCollider,
    dt: number,
    playerPos: THREE.Vector3,
  ): void {
    // El knockback desliza el offset local, fijado dentro de los bordes.
    if (enemy.velocity.lengthSq() > 1e-6) {
      _localOffset.copy(enemy.velocity).applyQuaternion(slab.invQuaternion);
      internal.slabLocalOffset.x += _localOffset.x * dt;
      internal.slabLocalOffset.y += _localOffset.z * dt;
      clampSlabLocalPoint(slab, internal.slabLocalOffset);
      enemy.velocity.multiplyScalar(Math.exp(-CRAB_SKID_DAMPING * dt));
    }

    // Anclaje a la cara superior (+Y local) del slab.
    slabTopPoint(slab, internal.slabLocalOffset, _targetPos);
    _slabUp.set(0, 1, 0).applyQuaternion(slab.quaternion);
    _targetPos.addScaledVector(_slabUp, CRAB_STAND_HEIGHT);
    if (internal.attachBlend < 1) {
      internal.attachBlend = Math.min(1, internal.attachBlend + dt / CRAB_ATTACH_BLEND_TIME);
      const t = internal.attachBlend;
      enemy.position.lerpVectors(internal.attachFrom, _targetPos, t * t * (3 - 2 * t));
    } else {
      enemy.position.copy(_targetPos);
    }

    // El cuerpo gira sobre el slab para encarar a Nyx.
    _aimDir.subVectors(playerPos, enemy.position);
    if (_aimDir.lengthSq() > 1e-6) {
      _aimDir.normalize();
      _slabForward.copy(_aimDir).addScaledVector(_slabUp, -_aimDir.dot(_slabUp));
      if (_slabForward.lengthSq() > 1e-4) {
        _slabForward.normalize();
        _basisX.crossVectors(_slabUp, _slabForward).normalize();
        _basisMat.makeBasis(_basisX, _slabUp, _slabForward);
        _targetQuat.setFromRotationMatrix(_basisMat);
        enemy.mesh.quaternion.slerp(_targetQuat, 1 - Math.exp(-CRAB_TURN_RATE * dt));
      }
    }

    // El cañón apunta fino hacia Nyx por encima del giro del cuerpo.
    this.aimCrabTurret(internal, dt, playerPos);
  }

  /** Boca del cañón en espacio mundo (hueso `turret` o mesh `detail_cannon`). */
  private computeCrabMuzzle(internal: EnemyInternal, out: THREE.Vector3): boolean {
    const node = internal.turretNode;
    if (!node) {
      return false;
    }
    node.updateWorldMatrix(true, false);
    node.getWorldPosition(out);
    node.getWorldQuaternion(_turretWorldQuat);
    _muzzleDir.copy(internal.turretForward).applyQuaternion(_turretWorldQuat);
    out.addScaledVector(_muzzleDir, CANNON_MUZZLE_DISTANCE);
    return true;
  }

  /** Gira el hueso del cañón para apuntar su eje de disparo hacia Nyx. */
  private aimCrabTurret(internal: EnemyInternal, dt: number, playerPos: THREE.Vector3): void {
    const node = internal.turretNode;
    if (!node) {
      return;
    }
    node.updateWorldMatrix(true, false);
    node.getWorldPosition(_muzzlePos);
    _lookDir.subVectors(playerPos, _muzzlePos);
    if (_lookDir.lengthSq() < 1e-6) {
      return;
    }
    _lookDir.normalize();
    // Orientación mundial deseada: el eje local del cañón apunta a Nyx.
    _targetQuat.setFromUnitVectors(internal.turretForward, _lookDir);
    const parent = node.parent;
    if (parent) {
      parent.getWorldQuaternion(_invQuat).invert();
      _targetQuat.premultiply(_invQuat);
    }
    node.quaternion.slerp(_targetQuat, 1 - Math.exp(-CRAB_TURRET_TURN_RATE * dt));
  }

  /** Cangrejo en el aire sin slab: encara a Nyx con un guiñeo ligero. */
  private orientCrabInFlight(
    enemy: ManagedWaveEnemy,
    dt: number,
    elapsed: number,
    playerPos: THREE.Vector3,
  ): void {
    _lookDir.subVectors(playerPos, enemy.position);
    if (_lookDir.lengthSq() < 1e-6) {
      _lookDir.set(0, 0, 1);
    } else {
      _lookDir.normalize();
    }
    lookAtQuat(_lookDir, _up, _targetQuat);
    _rollQuat.setFromAxisAngle(
      _up,
      Math.sin(elapsed * CRAB_FLIGHT_WOBBLE_SPEED + enemy.phase) * CRAB_FLIGHT_WOBBLE,
    );
    _targetQuat.premultiply(_rollQuat);
    enemy.mesh.quaternion.slerp(_targetQuat, 1 - Math.exp(-CRAB_TURN_RATE * dt));
  }

  /** Aleteo procedural de las patas (`leg_*`) mientras el cangrejo vuela. */
  private flapCrabLegs(enemy: ManagedWaveEnemy, internal: EnemyInternal, elapsed: number): void {
    for (let i = 0; i < internal.legs.length; i++) {
      const leg = internal.legs[i];
      _legWaveQuat.setFromAxisAngle(
        _legWaveAxis,
        Math.sin(elapsed * CRAB_LEG_WAVE_SPEED + enemy.phase + i * 0.8) * leg.amplitude,
      );
      leg.bone.quaternion.copy(leg.rest).multiply(_legWaveQuat);
    }
  }

  /** Pulpo: orientación suave hacia Nyx con balanceo en espiral y tentáculos ondeando. */
  private updateOctopusPose(
    enemy: ManagedWaveEnemy,
    internal: EnemyInternal,
    dt: number,
    elapsed: number,
    playerPos: THREE.Vector3,
  ): void {
    _lookDir.subVectors(playerPos, enemy.position);
    if (_lookDir.lengthSq() < 1e-6) {
      _lookDir.set(0, 0, 1);
    } else {
      _lookDir.normalize();
    }
    lookAtQuat(_lookDir, _up, _targetQuat);
    // Espiral: rodillo alrededor del eje de avance mientras se desplaza.
    _rollQuat.setFromAxisAngle(
      _lookDir,
      Math.sin(elapsed * OCTOPUS_SPIRAL_SPEED + enemy.phase) * OCTOPUS_SPIRAL_TILT,
    );
    _targetQuat.premultiply(_rollQuat);
    enemy.mesh.quaternion.slerp(_targetQuat, 1 - Math.exp(-OCTOPUS_TURN_RATE * dt));

    // Oscilación procedural de los tentáculos sobre su pose de reposo.
    for (let i = 0; i < internal.tentacles.length; i++) {
      const tentacle = internal.tentacles[i];
      _legWaveQuat.setFromAxisAngle(
        _legWaveAxis,
        Math.sin(elapsed * TENTACLE_WAVE_SPEED + enemy.phase + i) * tentacle.amplitude,
      );
      tentacle.bone.quaternion.copy(tentacle.rest).multiply(_legWaveQuat);
    }
  }

  private clearEnemies(): void {
    for (const enemy of [...this.enemies]) {
      this.killEnemy(enemy);
    }
    this.enemies.length = 0;
    this.internals.clear();
  }
}
