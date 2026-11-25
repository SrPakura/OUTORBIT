import * as THREE from 'three';
import { addComicOutline, createComicCelMaterial } from '@/game/render/toonMaterials';
import {
  DOME_PLAYER_BOUND_RADIUS,
  type SlabCollider,
  type SlabRaycastHit,
  type TestEnemySphere,
} from './domeTypes';
import { resolveSphereSlabCollision, raycastSlabs, type SlabContact } from './DomeSlabs';
import {
  createDomeEnemyEntity,
  DOME_ENEMY_ARCHETYPES,
  INK_COUNTER_MAX_SEC,
  INK_COUNTER_MIN_SEC,
  INK_COUNTER_OPACITY,
  INK_STAIN_OPACITY,
  INK_STAIN_SEC,
  type DomeEnemyEntity,
  type EnemyArchetype,
} from './DomeCombatSystem';
import {
  collectGolemRig,
  collectKronosRig,
  collectPrismaNecrozRig,
  collectSparrowRig,
  enemyInkScaleForWave,
  instantiateEnemyVisual,
  INK_DISTANCE_SCALE,
  measureStandHeight,
  onEnemyModelLoaded,
  preloadEnemyModels,
  setEnemyInkScale,
  STAR_CORE_COLOR,
  STAR_CORE_EMISSIVE,
  STAR_CORE_RIM,
  type EnemyBone,
  type GolemRig,
  type KronosRig,
  type PrismaNecrozRig,
  type SparrowRig,
} from './DomeEnemyModels';
import {
  GOLEM_BLOCK_RAISE_CLIP_SEC,
  GOLEM_EXHAUSTED_TURN_RATE,
  GOLEM_GUARD_FACE_DOT,
  GOLEM_HIT_CLIP_SEC,
  GOLEM_PARRY_CLOSE_DIST,
  GOLEM_PARRY_COOLDOWN_SEC,
  GOLEM_PARRY_CRIT_RATIO,
  GOLEM_PARRY_EDEN_RATIO,
  GOLEM_PARRY_EXECUTE_SEC,
  GOLEM_PARRY_LOCKOUT_SEC,
  GOLEM_PARRY_OPEN_DIST,
  GOLEM_PARRY_STAR_OUT,
  GOLEM_PARRY_STAR_UP,
  GOLEM_PARRY_MAX_Y_HIT_DIR,
  GOLEM_PARRY_WINDOW_SEC,
  GOLEM_PUNCH_WINDUP_SEC,
  GOLEM_STAMINA_MAX,
  GOLEM_THICK_WINDUP_SEC,
  GOLEM_TURN_RATE,
  parryGolemHead,
  updateGolemAttack,
  updateGolemEnemy,
  type GolemPlayerInfo,
  type GolemState,
} from './domeGolemBehavior';
import {
  applyKronosStarBreak,
  createKronosBossState,
  deactivateKronosPortals,
  deactivateKronosRings,
  KRONOS_RING_POOL_SIZE,
  resetKronosOffense,
  updateKronosAttack,
  updateKronosMovement,
  updateKronosPhase4,
  updateKronosPose,
  updateKronosPortals,
  updateKronosRings,
  type KronosBehaviorContext,
  type KronosBossState,
  type KronosNyxEffects,
  type KronosPortal,
  type KronosRing,
} from './domeKronosBehavior';
import {
  createKronosPortalVisual,
  disposeKronosPortalShared,
} from './DomeEnemyModels';
import { FLOAT_MAX_SPEED } from './NyxDomeController';
import {
  crabLaserContactDistanceSq,
  CRAB_HIT_CLIP_SEC,
  CRAB_KAMIKAZE_RADIUS,
  CRAB_LASER_BEAM_FF_MARGIN,
  CRAB_LASER_DPS,
  pickCrabSpawnSlab,
  pickSlabLocalPoint,
  resetCrabAttack,
  slabTopPoint,
  updateCrabAttack,
  updateCrabEnemy,
  type CrabAttackState,
  type CrabBehaviorContext,
  type CrabJump,
} from './domeCrabBehavior';
import {
  CellSwarmDirector,
  CELL_CHILD_EXP,
  CELL_RING_START,
  updateCellEnemy,
  type CellBehaviorContext,
  type CellState,
} from './domeCellBehavior';
import { faceTowards, lookAtQuat } from './domeEnemyOrient';

// ============================================================================
// DomeWaveManager — ciclo infinito de oleadas de la cúpula.
//
// Estructura del ciclo (15 rondas, repetido infinito):
//   1–4   Básicos (4 → 8 enemigos)            suelos 'basic'
//   5     Miniboss/Épico 1: giant_sparrow     suelos 'miniboss'
//   6–9   Básicos (7 → 11)                    suelos 'basic'
//   10    Miniboss/Épico 2: prisma_necroz   suelos 'miniboss'
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
// Constantes de comportamiento
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
  'lightning_butterfly',
  'giant_sparrow',
  'prisma_necroz',
]);

const BASIC_ARCHETYPES: readonly EnemyArchetype[] = [
  'abyssal_cell',
  'crab_gunner',
  'spiral_octopus',
  'lightning_butterfly',
  'ground_golem',
];

const CYCLE_LENGTH = 15;

// Pinchos del Prisma Necroz: salen cuando Nyx se acerca de frente (< 10 m) y
// se retraen en la ventana vulnerable tras su dash evasivo o su ráfaga.
const PRISMA_NECROZ_SPIKES_RANGE = 10.0;
const PRISMA_NECROZ_VULN_SEC = 1.8;
const PRISMA_NECROZ_SPIKES_OUT_SCALE = 1.35;
const PRISMA_NECROZ_SPIKES_IN_SCALE = 0.15;
const PRISMA_NECROZ_SPIKES_RIM = 0xff3b3b;
const PRISMA_NECROZ_BASE_RIM = 0xd9baff;
/** Rim de reposo de las mallas detail (DETAIL_RIM de DomeEnemyModels). */
const PRISMA_NECROZ_DETAIL_RIM = 0x6b5f8a;

// --- Ave Legendaria Cristalizada: ráfaga de 3 esferas con la boca abierta ---
const SPARROW_BURST_WINDOW_SEC = 1.8;
/** Momentos de disparo dentro de la ventana (telegraph ~0.75 s + 3 esferas). */
const SPARROW_BURST_FIRE_AT = [1.05, 0.75, 0.45];
const SPARROW_BURST_DAMAGE = 12;
const SPARROW_CHARGE_DAMAGE = 12;
const SPARROW_FLAP_SPEED_BASE = 6.2;
const SPARROW_FLAP_SPEED_BURST = 9.5;
const SPARROW_FLAP_SPEED_DIVE = 15.0;
const SPARROW_JAW_OPEN_RAD = 0.55;
const SPARROW_TURN_RATE = 2.4;

// --- Gólem Rompesuelos (rediseño §7.4): constantes de FSM/movimiento en
// domeGolemBehavior.ts; aquí solo queda el telegraph material del puño. ---
const GOLEM_FIST_NEON_RIM = 0x39ffb0;
const PRISMA_NECROZ_TURN_RATE = 2.6;

// --- Leviatán KRONOS (Boss, rediseño): física de cadena y FSM de 4 fases en
// domeKronosBehavior.ts. Aquí quedan el pool de Anillos/Portales y las
// puertas de rotura de Estrellas Dorsales (anti-skip). ---
/** Margen del daño por contacto de las embestidas (Ave Legendaria). */
const CHARGE_CONTACT_PADDING = 1.9;

// Proyectiles oscuros lentos (pool fijo, sin allocations por frame).
// 96 entradas: la Bola Gigante del pulpo dispersa 15 bolas ¡en 5 tandas
// sucesivas! — con varios pulpos vivos el pool de 32 se saturaba y las
// tandas 4-5 se quedaban sin bolas.
const PROJECTILE_POOL_SIZE = 96;
const PROJECTILE_LIFE_SEC = 9.0;
const PROJECTILE_PLAYER_RADIUS = 1.6;
const PROJECTILE_BOUND_RADIUS = 88.0;

// Embestidas (ave legendaria): carga directa contra Nyx.

// --- Pulpo Espiral (rediseño): hostigador táctico de media distancia ---
// Ciclo propio de 5.0 s: entre dashes deriva lento encarando a Nyx, y en el
// último segundo entra en estado LISTO PARA CONTRA-PARRY (alerta). Fuera de
// esa ventana no puede esquivar NI contra-parry.
const OCTOPUS_DASH_COOLDOWN_SEC = 5.0; // Duración del ciclo completo.
const OCTOPUS_DASH_ALERT_SEC = 1.5; // Ventana de alerta/contra-parry (últimos 1.5 s del ciclo de 5.0 s).
const OCTOPUS_DASH_SPEED = 30.0; // m/s del impulso del dash.
const OCTOPUS_DASH_TIME = 0.55; // s de impulso (luego frena suave).
const OCTOPUS_DRIFT_DAMPING = 0.55; // Fricción de la deriva entre dashes.
const OCTOPUS_DASH_DAMPING = 1.1; // Freno suave del impulso del dash.
const OCTOPUS_KEEP_RADIUS = 80.0; // Contención dura (evita la Barrera Blanca).
const OCTOPUS_KEEP_PULL = 26.0; // Empuje de contención (m/s²).
const OCTOPUS_MIN_NYX_DIST = 2.0; // Banda mínima: nunca pegado a Nyx.
const OCTOPUS_MIN_NYX_PUSH = 9.0; // Repulsión suave bajo la banda mínima.
const OCTOPUS_PREF_MIN_DIST = 9.0; // Preferencia: los dashes no acaban encima de Nyx.
const OCTOPUS_MIN_Y = 2.0; // Altura mínima de la banda libre.
const OCTOPUS_MAX_Y = 42.0; // Altura máxima de la banda libre.
// Ataque 1 — Bolas Rojas de Tinta Ácida (0.333/s = 1 cada 3.0 s).
const OCTOPUS_SHOOT_INTERVAL = 3.0; // s entre bolas base.
const OCTOPUS_BALL_INIT_SPEED = 30.0; // m/s iniciales hacia Nyx.
const OCTOPUS_BALL_DECEL = 1.0; // m/s² de deceleración constante.
const OCTOPUS_BALL_DAMAGE = 8; // HP de daño directo al impacto.
const OCTOPUS_SHOOT_CLIP_SEC = 0.5; // Duración estimada de octopus_shoot_ball.
// Ataque 2 — Bola Gigante de Dispersión (cada 20.0 s).
const OCTOPUS_GIANT_CHARGE_SEC = 20.0; // Barra interna de energía.
const OCTOPUS_GIANT_WINDUP_SEC = 0.8; // octopus_giant_charge antes de lanzarla.
const OCTOPUS_GIANT_SCALE = 2.6; // Tamaño visual de la Bola Gigante.
const OCTOPUS_GIANT_DETONATE_DIST = 12.0; // Detona a ≤ 12 m de Nyx.
const OCTOPUS_GIANT_EXPLODE_COLOR = 0xff2a3a;
const OCTOPUS_SPLIT_TOTAL = 15; // 15 bolas = 5 ráfagas de 3.
const OCTOPUS_SPLIT_BURST = 3; // Bolas por ráfaga.
const OCTOPUS_SPLIT_GAP = 0.16; // s entre ráfagas sucesivas.
const OCTOPUS_SPLIT_SPREAD = 0.12; // rad de abanico dentro de cada ráfaga.
const OCTOPUS_SPLIT_AUTOAIM = 0.35; // Corrección angular leve (rad/s) hacia Nyx.
// Contra-Parry (patada a bocajarro en ventana de alerta).
const OCTOPUS_COUNTER_CLIP_SEC = 0.8; // Duración de octopus_counter_parry.
// Clips one-shot del pulpo (estimados hasta medir el GLB final).
const OCTOPUS_HIT_CLIP_SEC = 0.45;
const OCTOPUS_TURN_RATE = 3.2; // Velocidad de giro hacia Nyx (slerp/seg).
const OCTOPUS_SPIRAL_TILT = 0.38; // Inclinación máx. de la espiral al desplazarse.
const OCTOPUS_SPIRAL_SPEED = 2.6; // Velocidad del balanceo en espiral.
const TENTACLE_WAVE_SPEED = 4.5; // Math.sin(elapsed * 4.5 + phase + i).
const TENTACLE_BASE_AMPLITUDE = 0.32;
const TENTACLE_TIP_AMPLITUDE = 0.45;
const OCTOPUS_INK_FORWARD = 0.55; // Fracción del radius: frente del manto.
const OCTOPUS_INK_UP = 0.35; // Elevación del manto sobre el centro.

// --- Cangrejo Artillero: pegado a suelos + cañón que apunta ---
// --- Cangrejo Artillero: spawn sobre suelos + salto entre ellos ---
const CRAB_LEG_WAVE_AMPLITUDE = 0.3; // Amplitud del aleteo de patas (rad).

// --- Cangrejo Artillero (rediseño §7.1): visuales y detonación ---
// Hilo de puntería / haz del rayo: cilindro unitario alargado por escala.
const CRAB_LASER_POOL_SIZE = 8;
const CRAB_LASER_AIM_RADIUS = 0.06; // Hilo fino rojo del telegraph (m).
const CRAB_LASER_FIRE_RADIUS = 0.42; // Haz grueso del disparo activo (m).
// Aro de peligro del cebado kamikaze sobre la tapa del slab.
const CRAB_DANGER_RING_POOL_SIZE = 8;
const CRAB_LASER_AIM_COLOR = 0xff1622;
const CRAB_LASER_FIRE_COLOR = 0xff5a2a;
// Detonación kamikaze: anillos de daño (0-3 / 3.1-5 / 5.1-10 m).
const CRAB_KAMIKAZE_BANDS: ReadonlyArray<readonly [number, number]> = [
  [50, 32],
  [35, 24],
  [20, 16],
];
const CRAB_KAMIKAZE_EXPLODE_COLOR = 0xff5a2a;

// --- Voladores contra icebergs (activeSlabs): nunca atraviesan los suelos ---
const SLAB_BOUNCE_RESTITUTION = 0.35; // Rebote suave de la velocidad contra la normal.
/** Radio² de la Barrera Blanca: el haz del cangrejo muere al cruzarla. */
const DOME_BARRIER_RADIUS_SQ = DOME_PLAYER_BOUND_RADIUS * DOME_PLAYER_BOUND_RADIUS;

// --- Scratch vectors a nivel de módulo: sin allocations por frame --- 
const _toHome = new THREE.Vector3();
const _toEnemy = new THREE.Vector3();
const _perp = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _flat = new THREE.Vector3();
const _shotDir = new THREE.Vector3();
const _lookDir = new THREE.Vector3();
const _preHitVel = new THREE.Vector3();
const _aimDir = new THREE.Vector3();
const _basisX = new THREE.Vector3();
const _targetQuat = new THREE.Quaternion();
const _rollQuat = new THREE.Quaternion();
const _invQuat = new THREE.Quaternion();
const _turretWorldQuat = new THREE.Quaternion();
const _slabUp = new THREE.Vector3();
const _slabForward = new THREE.Vector3();
const _guardDir = new THREE.Vector3();
const _modelUp = new THREE.Vector3(0, 1, 0);
const _starWorld = new THREE.Vector3();
const _starSide = new THREE.Vector3();

/**
 * Estrella del parry del Gólem: 4 puntas doradas que caben en la mira del
 * visor (estrella de 4 puntas, como la del HUD). Punto de dash del remate.
 */
function makeGolemParryStarGeometry(): THREE.ShapeGeometry {
  const outer = 1.0;
  const inner = 0.38;
  const points = 4;
  const shape = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}
const _localOffset = new THREE.Vector3();
const _targetPos = new THREE.Vector3();
const _muzzlePos = new THREE.Vector3();
const _muzzleDir = new THREE.Vector3();
const _legWaveQuat = new THREE.Quaternion();
const _legWaveAxis = new THREE.Vector3(1, 0, 0);
const _boneQuat = new THREE.Quaternion();
const _boneEuler = new THREE.Euler();
const _spiralDir = new THREE.Vector3();
const _ringForward = new THREE.Vector3(0, 0, 1);
const _slabContact: SlabContact = {
  slab: null,
  normal: new THREE.Vector3(),
  depth: 0,
  point: new THREE.Vector3(),
};

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
    spawns.push({ archetype: 'prisma_necroz', count: 1 });
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
// Aspecto provisional por arquetipo (hasta los GLBs finales)
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
    // Prisma Necroz (Élite): octaedro prismático violeta.
    prisma_necroz: {
      geometry: new THREE.OctahedronGeometry(3.4),
      color: 0xb06bff,
      rim: PRISMA_NECROZ_BASE_RIM,
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

/** Avisos one-shot de clips pedidos por la FSM y ausentes en el GLB. */
const warnedMissingActions = new Set<string>();

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

/** Materiales cel de las mallas `star_core` (parpadeo rojo del kamikaze). */
function collectStarMaterials(root: THREE.Object3D): THREE.ShaderMaterial[] {
  const materials: THREE.ShaderMaterial[] = [];
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.name.includes('star_core')) {
      return;
    }
    if (mesh.material instanceof THREE.ShaderMaterial) {
      materials.push(mesh.material);
    }
  });
  return materials;
}

/** Material cel del cañón del cangrejo (mesh `detail_cannon`). */
function findCannonMaterial(root: THREE.Object3D): THREE.ShaderMaterial | null {
  let found: THREE.ShaderMaterial | null = null;
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (found || !mesh.isMesh || !mesh.name.startsWith('detail_cannon')) {
      return;
    }
    if (mesh.material instanceof THREE.ShaderMaterial) {
      found = mesh.material;
    }
  });
  return found;
}

export interface EnemyInternal {
  enemy: ManagedWaveEnemy;
  material: THREE.ShaderMaterial | null;
  outlineMaterial: THREE.ShaderMaterial | null;
  /** Materiales con `uTime` (carne nebulosa + contorno vibrante): reloj por frame. */
  animatedMaterials: THREE.ShaderMaterial[];
  starCores: THREE.Object3D[];
  mixer?: THREE.AnimationMixer;
  isGlb?: boolean;
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
  /**
   * Altura del origen del modelo sobre el suelo (m): `-min.y` medido sobre el
   * modelo ya instanciado con su esqueleto aplicado. El cangrejo la usa para
   * apoyar las almohadillas de las 5 patas en la tapa del slab.
   */
  standHeight: number;
  /** Cangrejo: offset local (lx, lz) dentro del slab para no salirse del borde. */
  slabLocalOffset: THREE.Vector2;
  /** Cangrejo: progreso 0..1 del aterrizaje en el slab actual. */
  attachBlend: number;
  /** Cangrejo: posición de partida del aterrizaje suave. */
  attachFrom: THREE.Vector3;
  /** Cangrejo: salto en curso entre suelos (null = pegado o flotando). */
  jump: CrabJump | null;
  /** RNG determinista de la oleada (salto y desfases, sin Math.random). */
  rng: () => number;
  /** Cangrejo: estado de la FSM de combate del rediseño. */
  crabState: CrabAttackState;
  /** Cangrejo: segundos dentro del estado actual de la FSM. */
  crabTimer: number;
  /** Cangrejo: guardia anti-patada tras impacto melee (0.75 s). */
  crabPostKickGrace: number;
  /** Cangrejo: tiempo acumulado a menos de 5 m de Nyx (arma el kamikaze). */
  crabProxTimer: number;
  /** Cangrejo: disparos pendientes de la ráfaga de corta distancia. */
  crabBurstShotsLeft: number;
  /** Cangrejo: hinchado del cuerpo durante el cebado (suma a mesh.scale). */
  crabSwell: number;
  /** Cangrejo: segundos restantes del clip crab_jump_land en el impacto. */
  crabLandTimer: number;
  /** Cangrejo: segundos restantes del flinch crab_hit. */
  crabHitTimer: number;
  /** Materiales cel de los star_core (parpadeo rojo del kamikaze). */
  starMaterials: THREE.ShaderMaterial[];
  /** Cangrejo: material cel del cañón (chispazo/carga del telegraph). */
  cannonMaterial: THREE.ShaderMaterial | null;
  /** Ave: huesos del GLB para aleteo, cuello/cabeza, cola y jaw. */
  sparrowRig: SparrowRig | null;
  /** Ave: fase integrada del aleteo (la velocidad cambia sin saltos). */
  flapPhase: number;
  /** Ave: apertura suavizada del jaw (0 = cerrado, 1 = abierto). */
  jawOpen: number;
  /** Ave: segundos restantes de la ráfaga (telegraph + 3 esferas). */
  burstTimer: number;
  /** Ave: esferas pendientes de la ráfaga en curso. */
  burstShotsLeft: number;
  /** Ave: próximo ataque alternado (embestida <-> ráfaga). */
  nextAttack: 'charge' | 'burst';
  /** Prisma Necroz: huesos del GLB + malla `detail_spikes`. */
  prismaNecrozRig: PrismaNecrozRig | null;
  /** Prisma Necroz: escala actual de `detail_spikes` (suavizada). */
  spikeScale: number;
  /** Gólem: huesos del GLB + malla `detail_fist`. */
  golemRig: GolemRig | null;
  /** Gólem: estado de la FSM del rediseño (§7.4, domeGolemBehavior). */
  golemState: GolemState;
  /** Gólem: segundos restantes del estado (o del trayecto recto de carga). */
  golemTimer: number;
  /** Gólem: stamina del rotor (0 => exhausto: ventana real de castigo). */
  golemStamina: number;
  /** Gólem: próxima carga en espiral (alterna broca fina / ariete grueso). */
  golemChargeKind: 'thin' | 'thick';
  /** Gólem: dirección de deriva sellada al entrar en exhausto. */
  golemDriftDir: THREE.Vector3;
  /** Gólem: segundos restantes del flinch `golem_hit`. */
  golemHitTimer: number;
  /** Gólem: forzar el reinicio del clip one-shot actual al crossfadear. */
  golemRestartPending: boolean;
  /**
   * Gólem: carga de APUESTA (banda 20-30 m) — la espiral ignora el aborto
   * anti-Barrera y el gólem puede inmolarse contra la esfera si hace falta
   * para cruzar a Nyx. Se apaga al terminar/contactar.
   */
  golemGambling: boolean;
  /**
   * Gólem: cooldown de la oportunidad de parry — SOLO con el parry EJECUTADO
   * (dash al star point realizado y/o remate conectado). Si la oportunidad
   * salió y no se ejecutó, no hay cooldown largo (solo el lockout siguiente).
   */
  golemParryCd: number;
  /**
   * Gólem: lockout del parry — al llegar Nyx a α+GOLEM_PARRY_CLOSE_DIST sin
   * ejecutar el remate, la ventana muere y NO reaparece en este gólem durante
   * GOLEM_PARRY_LOCKOUT_SEC (elimina por diseño el "parry post-rebote").
   */
  golemParryLockout: number;
  /**
   * Gólem: gracia de la guardia — tras salir de block_guard, durante el clip
   * golem_block_end (~0.27 s) el brazo sigue ARRIBA y AÚN bloquea (0 daño).
   */
  golemBlockGraceTimer: number;
  /**
   * Gólem: segundos acumulados en block_guard — la guardia está "alzada" a
   * partir del clip golem_block_start (GOLEM_BLOCK_RAISE_CLIP_SEC).
   */
  golemBlockGuardElapsed: number;
  /**
   * Gólem: distancia centro-a-centro con Nyx del frame anterior (detección
   * del cruce hacia dentro de la banda α+GOLEM_PARRY_OPEN_DIST).
   */
  golemPrevPlayerDist: number;
  /** Gólem: ángulo del brazo gigante (fallback procedural sin clips). */
  golemArmAngle: number;
  /** Gólem: torsión de spine/chest durante el telegraph (fallback). */
  golemTwist: number;
  /** Gólem: punto de impacto sellado del puñetazo en espacio mundo. */
  golemImpact: THREE.Vector3;
  /** KRONOS: huesos del GLB (cadena seg_01..12, head/jaw, aletas, cola, estrellas). */
  kronosRig: KronosRig | null;
  /**
   * KRONOS: estado del boss (4 Estrellas Dorsales, FSM de 4 fases, cadena
   * serpentina prealocada, agenda de cosmos_fusion). Campos (roam/rings/...).
   */
  kronos: KronosBossState;
  /** Segundos restantes de embestida en curso (0 = libre). */
  chargeTimer: number;
  chargeSpeed: number;
  chargeDamage: number;
  chargeDir: THREE.Vector3;
  /** Célula Abisal: estado de su FSM de oportunista. */
  cellState: CellState;
  /** Célula: segundos restantes de la fase actual (windup/recover/duplicate). */
  cellTimer: number;
  /** Célula: dirección del lunge, FIJADA al iniciar el windup (sin homing). */
  cellLungeDir: THREE.Vector3;
  /** Célula: dirección divergente de la dispersión (fijada al entrar). */
  cellScatterDir: THREE.Vector3;
  /** Célula: metros restantes del lunge en curso. */
  cellLungeLeft: number;
  /** Célula: radio actual del anillo de acecho (7 → 5 m). */
  cellRing: number;
  /** Célula: segundos llevada oculta de la vista de Nyx. */
  cellHiddenFor: number;
  /** Célula: segundos llevada fuera de vista (ocluida o a la espalda). */
  cellUnseenFor: number;
  /** Célula: slot de órbita asignado por el enjambre (ángulo equidistante). */
  cellSlot: number;
  /** Célula: sentido de giro de la órbita. */
  cellOrbitSign: 1 | -1;
  /** Clips del GLB por nombre (célula animada; null si el modelo no tiene). */
  actions: Map<string, THREE.AnimationAction> | null;
  /** Acción de clip en reproducción (para crossfade solo al cambiar). */
  currentClipAction: THREE.AnimationAction | null;
  /** Célula: segundos restantes del flinch de cell_hit sobre la IA. */
  cellHitTimer: number;
  // --- Pulpo Espiral (rediseño) ---
  /** Cuenta atrás del ciclo de dash de 5.0 s (≤1 s = alerta/contra-parry). */
  octopusDashTimer: number;
  /** Segundos restantes del impulso del dash en curso. */
  octopusDashActive: number;
  /** Barra interna de energía de la Bola Gigante (0..20 s). */
  octopusGiantCharge: number;
  /** Windup de octopus_giant_charge pendiente del lanzamiento. */
  octopusGiantWindup: number;
  /** Segundos restantes del one-shot octopus_shoot_ball. */
  octopusShootTimer: number;
  /** Segundos restantes del flinch octopus_hit. */
  octopusHitTimer: number;
  /** Segundos restantes del contra-parry octopus_counter_parry. */
  octopusCounterTimer: number;
  /** Forzar el reinicio del clip one-shot actual (re-disparo directo). */
  octopusForceRestart: boolean;
}

/**
 * Enemigo en plena animación de muerte: vibra `DEATH_SHAKE_TIME` y luego se
 * infla y estalla. La malla sigue en escena (ya fuera de `enemies`) hasta que
 * termina el efecto; los materiales se liberan al final.
 */
interface DyingEnemy {
  mesh: THREE.Object3D;
  basePos: THREE.Vector3;
  baseScale: THREE.Vector3;
  elapsed: number;
  radius: number;
  color: number;
  materials: THREE.Material[];
  exploded: boolean;
}

/** Temblor previo al estallido (s). */
const DEATH_SHAKE_TIME = 0.22;
/** Inflado final antes de desaparecer (s). */
const DEATH_POP_TIME = 0.16;

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
  kind: 'dark' | 'ink_ball' | 'ink_giant' | 'laser';
  damage: number;
  velocity: THREE.Vector3;
  life: number;
  /** Tinta ácida del pulpo: deceleración constante (m/s²; 0 en el resto). */
  decel: number;
  /** Auto-aim leve hacia Nyx (rad/s; solo las 15 de la Bola Gigante). */
  autoAimRate: number;
  /**
   * Capturada por el Campo Gravitacional: la malla pasó a orbitar a Nyx como
   * proyectil pequeño — ya NO pertenece al pool (se salta en los deactivates
   * globales para no robarla de la órbita).
   */
  captured: boolean;
}

/**
 * Tanda pendiente de la Bola Gigante: al detonar encola las 15 bolas y las
 * suelta en 5 ráfagas sucesivas de 3 desde el punto de la explosión.
 */
interface OctopusSplitBurst {
  active: boolean;
  shotsLeft: number;
  timer: number;
  origin: THREE.Vector3;
}

/**
 * Hilo/haz láser del Cangrejo Artillero (pool por id de enemigo): un cilindro
 * unitario que escala su alto a la distancia del rayo y apunta con su +Y.
 */
interface CrabLaserBeam {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  /** Id del dueño mientras esté en pantalla (null = libre del pool). */
  ownerId: string | null;
}

/** Aro de peligro del cebado kamikaze proyectado sobre la tapa del slab. */
interface CrabDangerRing {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  ownerId: string | null;
}


// ---------------------------------------------------------------------------
// DomeWaveManager
// ---------------------------------------------------------------------------

export class DomeWaveManager implements KronosBehaviorContext, CrabBehaviorContext, CellBehaviorContext {
  /** Enemigos vivos de la oleada (compatibles con TestEnemySphere[]). */
  readonly enemies: ManagedWaveEnemy[] = [];

  /** Coordinador de enjambre de las Células Abisales (slots + token de lunge). */
  readonly cellDirector = new CellSwarmDirector();

  private readonly scene: THREE.Scene;
  private readonly internals = new Map<string, EnemyInternal>();
  private readonly visuals: Record<EnemyArchetype, ArchetypeVisual>;
  private readonly starGeometry = new THREE.OctahedronGeometry(1, 0);
  private readonly projectiles: WaveProjectile[] = [];
  private readonly projectileGeometry = new THREE.SphereGeometry(0.55, 12, 10);
  private readonly darkProjectileMaterial: THREE.ShaderMaterial;
  private readonly inkProjectileMaterial: THREE.ShaderMaterial;
  /**
   * Tandas de dispersión de las Bolas Gigantes del pulpo (hasta 3 bolas
   * gigantes reventando a la vez — suficientes para cualquier oleada).
   */
  private readonly octopusSplits: OctopusSplitBurst[] = [];
  readonly kronosRings: KronosRing[] = [];
  private readonly kronosRingGeometry = new THREE.TorusGeometry(1, 0.07, 8, 48);
  private readonly kronosRingMaterial: THREE.ShaderMaterial;
  /** Portales Cósmicos 'SOLAR RIFT' de KRONOS (2 slots: entrada y salida). */
  readonly kronosPortals: KronosPortal[] = [];
  /**
   * Efectos de cosmos_fusion sobre Nyx (Fase 4): el game loop los empuja al
   * controller cada frame y consume los pulsos one-shot.
   */
  readonly kronosNyxEffects: KronosNyxEffects = {
    deformActive: false,
    cameraShake: 0,
    controlsInverted: false,
    phase4: false,
    shakePulse: 0,
    voidFlashPulse: 0,
  };
  /** V_base de Nyx sin pasivas (la fija el game loop con getBaseMaxSpeed()). */
  kronosBaseMaxSpeed = FLOAT_MAX_SPEED;
  /** Foto por frame del aim de Nyx (portales a su espalda + predicción). */
  readonly playerAimForward = new THREE.Vector3(0, 0, 1);
  /** Foto por frame de la velocidad de Nyx (física de cadena + esquivas). */
  readonly playerVelocity = new THREE.Vector3();
  /** Hilos/haces láser de los cangrejos (pool fijo, uno por atacante). */
  private readonly crabLasers: CrabLaserBeam[] = [];
  private readonly crabLaserGeometry = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
  /** Aros de peligro del cebado kamikaze (pool fijo, uno por cangrejo). */
  private readonly crabDangerRings: CrabDangerRing[] = [];
  private readonly crabDangerRingGeometry = new THREE.RingGeometry(0.92, 1, 64);
  /** Halo dorado sobre la cabeza del gólem durante la ventana de parry. */
  /** Estrella dorada del parry junto al brazo malo del gólem. */
  private readonly golemParryHaloGeometry = makeGolemParryStarGeometry();
  private readonly golemParryHaloMaterial: THREE.MeshBasicMaterial;
  private readonly golemParryHalo: THREE.Mesh;
  /** Id del gólem con la ventana de parry ABIERTA (null = ninguna). */
  private golemParryTargetId: string | null = null;
  /**
   * Tope de SEGURIDAD de la ventana (s de mundo): la abre y la cierra la
   * DISTANCIA en updateGolemParryWindow — este reloj solo recorta ventanas
   * que, por cualquier bug, no llegaran a cerrarse de otra forma.
   */
  private golemParryTimer = 0;
  /** Gólem con la ventana abierta (para cerrarla si muere sin remate). */
  private golemParryEnemy: ManagedWaveEnemy | null = null;
  /**
   * Fase EXPLÍCITA del parry mientras la ventana está abierta:
   *  - `parry_decide`: Nyx dentro de la banda [α+2 .. α+9] con la guardia
   *    alzada — slow-mo, estrella visible y Dash pendiente.
   *  - `parry_strike`: el dash al star point YA se ejecutó (aquí arranca el
   *    cooldown de GOLEM_PARRY_COOLDOWN_SEC); margen corto de mundo para el
   *    taladro descendente. El golpe conectado cierra TODO al instante.
   */
  private golemParryPhase: 'parry_decide' | 'parry_strike' | null = null;
  /** Cierre de ventana pendiente de consumir por domeGameLoop (closeParryWindow). */
  private golemParryClosedFlag = false;
  /** Posición de Nyx del frame actual (cara real para isGolemGuardBlocking). */
  private readonly playerPosCache = new THREE.Vector3();
  /** Punto de la estrella en mundo (junto al brazo malo), refrescado por frame. */
  private readonly golemParryStarPos = new THREE.Vector3();
  /** Gólem cuya ventana abrir; consumido por el game loop en el mismo frame. */
  private pendingParryEnemy: ManagedWaveEnemy | null = null;
  /** Proyectil láser de la ráfaga corta: perla roja brillante parryable. */
  private readonly laserProjectileMaterial: THREE.ShaderMaterial;
  /** Raycast del haz láser contra los suelos (resultado reutilizado; el
   * raycast solo lo ESCRIBE y aquí solo se lee `.distance`). */
  private readonly _crabLaserHit = {
    slab: null as SlabCollider | null,
    point: new THREE.Vector3(),
    normal: new THREE.Vector3(),
    distance: 0,
  };

  /** Enemigos vibrando/estallando (fuera ya de `enemies`). */
  private readonly dying: DyingEnemy[] = [];
  /**
   * Se dispara cuando un enemigo termina de vibrar y estalla: el bucle de
   * juego lo usa para la ráfaga de chispas y el anillo de la explosión.
   */
  onEnemyExplode?: (position: THREE.Vector3, radius: number, color: number) => void;
  /**
   * Se dispara cuando un enemigo muere por daño interno de la IA (fuego
   * amigo del láser del cangrejo, detonación kamikaze): el game loop suelta
   * su EXP (reducida si procede) y contabiliza la kill.
   */
  onInternalKill?: (enemy: ManagedWaveEnemy) => void;

  private currentWave = 0;
  private waveTime = 0;
  speedMult = 1;
  /** Modo Entrenamiento: los enemigos no atacan ni esquivan (sacos de boxeo). */
  private enemiesPassive = false;

  /**
   * Foto de Nyx que LEE el Gólem cada frame (información perfecta, uso
   * honesto): velocidad (lead de las cargas), aim (amenaza), ataque en curso
   * y nivel de vida. Se rellena UNA vez por `update` (cero allocations).
   */
  private readonly golemInfo: GolemPlayerInfo = {
    vel: new THREE.Vector3(),
    aimForward: new THREE.Vector3(0, 0, 1),
    hpRatio: 1,
    edenRatio: 1,
    attacking: false,
  };

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
    // Bolas Rojas de Tinta Ácida / Energía Oscura Inestable: shader procedural
    // 3D de galaxia/plasma rojo carmesí inestable con pulso de vértices y halo
    // Fresnel (cero costuras UV).
    this.inkProjectileMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        uniform float uTime;
        varying vec3 vLocalPos;
        varying vec3 vNormalW;
        varying vec3 vViewDir;

        void main() {
          float wobble =
            sin(position.x * 7.5 + uTime * 9.0) *
            cos(position.y * 7.5 - uTime * 7.5) *
            sin(position.z * 7.5 + uTime * 8.0);
          vec3 displaced = position + normal * (wobble * 0.085);
          vLocalPos = position;
          vec4 worldPos = modelMatrix * vec4(displaced, 1.0);
          vNormalW = normalize(mat3(modelMatrix) * normal);
          vViewDir = normalize(cameraPosition - worldPos.xyz);
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        varying vec3 vLocalPos;
        varying vec3 vNormalW;
        varying vec3 vViewDir;

        float hash31(vec3 p) {
          p = fract(p * 0.1031);
          p += dot(p, p.yzx + 33.33);
          return fract((p.x + p.y) * p.z);
        }

        float turb3D(vec3 p) {
          float n = 0.0;
          n += sin(p.x * 3.2 + sin(p.y * 2.7 + uTime * 3.8)) * 0.5;
          n += cos(p.y * 4.1 - sin(p.z * 3.5 - uTime * 4.6)) * 0.35;
          n += sin(p.z * 5.3 + cos(p.x * 4.4 + uTime * 5.2)) * 0.25;
          return n * 0.5 + 0.5;
        }

        void main() {
          vec3 dir = normalize(vLocalPos);
          // Remolino galáctico / energía oscura inestable
          float swirl = turb3D(dir * 2.4 + vec3(uTime * 0.7, -uTime * 0.9, uTime * 0.5));
          float veins = turb3D(dir * 5.2 + vec3(swirl * 2.2 - uTime * 1.4));
          float coreBand = smoothstep(0.48, 0.88, swirl * 0.65 + veins * 0.45);
          float crackle = smoothstep(0.80, 0.96, veins);

          // Motas estelares galácticas dentro de la energía oscura
          vec3 starCell = floor(dir * 16.0 + vec3(0.0, uTime * 0.4, 0.0));
          float star = step(0.955, hash31(starCell));

          vec3 voidCol = vec3(0.035, 0.004, 0.015);
          vec3 darkCrimson = vec3(0.52, 0.02, 0.09);
          vec3 acidRed = vec3(1.0, 0.08, 0.20);
          vec3 hotCore = vec3(1.0, 0.58, 0.42);

          vec3 col = mix(voidCol, darkCrimson, smoothstep(0.18, 0.58, swirl));
          col = mix(col, acidRed, coreBand);
          col = mix(col, hotCore, crackle * 0.85);
          col += vec3(1.0, 0.82, 0.78) * star * 0.9;

          float fresnel = pow(1.0 - max(0.0, dot(normalize(vNormalW), normalize(vViewDir))), 2.1);
          col += vec3(1.0, 0.14, 0.28) * fresnel * 1.65;

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    // Ráfaga de corta distancia del cangrejo: perla roja muy brillante.
    this.laserProjectileMaterial = createComicCelMaterial(0xff2233, {
      rimColor: 0xffd9d9,
      rimStrength: 1.0,
      emissiveBoost: 1.3,
    });

    // Anillos de Contención de KRONOS: ondas expansivas azul eléctrico brillante.
    this.kronosRingMaterial = createComicCelMaterial(0x9fd8ff, {
      rimColor: 0x66e0ff,
      rimStrength: 1.0,
      emissiveBoost: 0.9,
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
        decel: 0,
        autoAimRate: 0,
        captured: false,
      });
    }

    // Tandas de dispersión del pulpo: 3 slots de explosiones en curso.
    for (let i = 0; i < 3; i++) {
      this.octopusSplits.push({
        active: false,
        shotsLeft: 0,
        timer: 0,
        origin: new THREE.Vector3(),
      });
    }

    for (let i = 0; i < KRONOS_RING_POOL_SIZE; i++) {
      const mesh = new THREE.Mesh(this.kronosRingGeometry, this.kronosRingMaterial);
      addComicOutline(mesh, 0.05);
      mesh.visible = false;
      this.scene.add(mesh);
      this.kronosRings.push({
        mesh,
        active: false,
        origin: new THREE.Vector3(),
        dir: new THREE.Vector3(0, 0, 1),
        travel: 0,
        radius: 1,
        pushed: false,
      });
    }

    // Portales Cósmicos 'SOLAR RIFT' de KRONOS: 2 slots (entrada del boss y
    // salida tras Nyx). La apertura elástica y el vórtice los anima el
    // comportamiento cada frame.
    for (let i = 0; i < 2; i++) {
      const visual = createKronosPortalVisual();
      this.scene.add(visual.group);
      this.kronosPortals.push({
        group: visual.group,
        disk: visual.disk,
        diskMaterial: visual.diskMaterial,
        rim: visual.rim,
        rimMaterial: visual.rimMaterial,
        active: false,
        dir: new THREE.Vector3(0, 0, 1),
        pos: new THREE.Vector3(),
        open: 0,
        openVel: 0,
        life: 0,
      });
    }

    // Haz láser del cangrejo: cilindro alargable con material aditivo propio
    // (el parpadeo blanco/rojo del sellado es por instancia, no compartido).
    for (let i = 0; i < CRAB_LASER_POOL_SIZE; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: CRAB_LASER_AIM_COLOR,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(this.crabLaserGeometry, material);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.crabLasers.push({ mesh, material, ownerId: null });
    }

    // Aro de peligro del kamikaze: anillo plano rojo sobre la tapa del slab.
    for (let i = 0; i < CRAB_DANGER_RING_POOL_SIZE; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xff2211,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(this.crabDangerRingGeometry, material);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.crabDangerRings.push({ mesh, material, ownerId: null });
    }

    // Halo dorado del parry del gólem: único, flotando sobre su cabeza.
    this.golemParryHaloMaterial = new THREE.MeshBasicMaterial({
      color: 0xffe8a3,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.golemParryHalo = new THREE.Mesh(this.golemParryHaloGeometry, this.golemParryHaloMaterial);
    this.golemParryHalo.visible = false;
    this.golemParryHalo.frustumCulled = false;
    // La estrella es un billboard: cada frame mira hacia Nyx con lookAt.
    this.scene.add(this.golemParryHalo);
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
    deactivateKronosRings(this);

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
      internal.actions = glbVisual.actions;
      internal.currentClipAction = null;
      internal.isGlb = true;
      // Altura de apoyo del GLB real: el cangrejo recoloca sus patas sobre la
      // tapa del slab en el siguiente frame con la medida ya skinneada.
      internal.standHeight = glbVisual.standHeight;
      // Huesos procedurales del GLB: tentáculos del pulpo, patas y cañón del cangrejo.
      internal.tentacles = collectTentacleBones(glbVisual.root);
      internal.legs = collectLegBones(glbVisual.root);
      internal.starMaterials = collectStarMaterials(glbVisual.root);
      internal.cannonMaterial = findCannonMaterial(glbVisual.root);
      const turretRig = findTurretRig(glbVisual.root);
      internal.turretNode = turretRig?.node ?? null;
      if (turretRig) {
        internal.turretForward.copy(turretRig.forward);
      }
      // Rigs de los élites y el gólem: huesos y mallas detail del GLB real.
      if (enemy.entity.archetype === 'giant_sparrow') {
        internal.sparrowRig = collectSparrowRig(glbVisual.root);
      } else if (enemy.entity.archetype === 'prisma_necroz') {
        internal.prismaNecrozRig = collectPrismaNecrozRig(glbVisual.root);
      } else if (enemy.entity.archetype === 'ground_golem') {
        internal.golemRig = collectGolemRig(glbVisual.root);
      } else if (enemy.entity.archetype === 'kronos_leviathan') {
        internal.kronosRig = collectKronosRig(glbVisual.root);
        // El rig cambió: la cadena se re-mide contra el bind pose del GLB
        // en el próximo frame (posiciones de reposo + huesos + longitudes).
        internal.kronos.chain.ready = false;
        internal.kronos.chain.submerged.fill(false);
      }
    }
  }

  private spawnEnemy(
    archetype: EnemyArchetype,
    index: number,
    rng: () => number,
    activeSlabs?: SlabCollider[],
    homePosOverride?: THREE.Vector3,
  ): void {
    // Grosor de tinta de esta oleada: 1-10 normal, 11-20 x1.25, 21-30 x1.5...
    // (el Modo Entrenamiento no pasa por startWave: currentWave 0 cuenta como 1).
    setEnemyInkScale(enemyInkScaleForWave(this.currentWave));
    const stats = DOME_ENEMY_ARCHETYPES[archetype];
    const visual = this.visuals[archetype];
    const glbVisual = instantiateEnemyVisual(archetype);

    let mesh: THREE.Object3D;
    let material: THREE.ShaderMaterial | null = null;
    let outlineMaterial: THREE.ShaderMaterial | null = null;
    let starCores: THREE.Object3D[] = [];
    let mixer: THREE.AnimationMixer | undefined;
    let animatedMaterials: THREE.ShaderMaterial[] = [];
    let standHeight: number;

    if (glbVisual) {
      mesh = glbVisual.root;
      mesh.name = `waveEnemy_${this.currentWave}_${archetype}_${index}`;
      starCores = glbVisual.starCores;
      mixer = glbVisual.mixer;
      animatedMaterials = glbVisual.animatedMaterials;
      material = findBodyMaterial(glbVisual.root);
      standHeight = glbVisual.standHeight;
    } else {
      material = createComicCelMaterial(visual.color, {
        rimColor: visual.rim,
        rimStrength: 0.7,
        emissiveBoost: 0.0,
      });
      const fallbackMesh = new THREE.Mesh(visual.geometry, material);
      fallbackMesh.name = `waveEnemy_${this.currentWave}_${archetype}_${index}`;
      const outline = addComicOutline(
        fallbackMesh,
        visual.outlineThickness * enemyInkScaleForWave(this.currentWave),
        0x090b14,
        INK_DISTANCE_SCALE,
      );
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
      standHeight = measureStandHeight(fallbackMesh);
    }

    // Posición de aparición: anillo distribuido + jitter determinista, o la
    // posición explícita del Modo Entrenamiento (delante de Nyx).
    const angle = (index / Math.max(1, this.enemies.length + 6)) * Math.PI * 2 + rng() * 1.2;
    const dist = 26 + rng() * 30;
    const homePos = homePosOverride
      ? homePosOverride.clone()
      : new THREE.Vector3(
          Math.cos(angle) * dist,
          6 + rng() * 30,
          Math.sin(angle) * dist,
        );

    // Cangrejo Artillero: aparece directamente encima de un suelo flotante
    // dentro de la cúpula (preferiblemente center < 70 m).
    let attachedSlabId: string | null = null;
    const slabLocalOffset = new THREE.Vector2();
    if (!homePosOverride && archetype === 'crab_gunner' && activeSlabs && activeSlabs.length > 0) {
      const slab = pickCrabSpawnSlab(activeSlabs, rng);
      if (slab) {
        pickSlabLocalPoint(slab, rng, slabLocalOffset);
        slabTopPoint(slab, slabLocalOffset, homePos);
        _slabUp.set(0, 1, 0).applyQuaternion(slab.quaternion);
        homePos.addScaledVector(_slabUp, standHeight);
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
      // Cangrejo Artillero: desfase del primer láser 1.0–3.5 s con el RNG
      // determinista de la oleada (coordinación: nada de rayos sincronizados).
      attackTimer:
        archetype === 'crab_gunner' ? 1.0 + rng() * 2.5 : 1.2 + rng() * 1.8,
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
      tentacles: collectTentacleBones(mesh),
      legs: collectLegBones(mesh),
      turretNode: turretRig?.node ?? null,
      turretForward: turretRig ? turretRig.forward : new THREE.Vector3(0, 0, 1),
      attachedSlabId,
      standHeight,
      slabLocalOffset,
      attachBlend: attachedSlabId ? 1 : 0,
      attachFrom: homePos.clone(),
      jump: null,
      sparrowRig: archetype === 'giant_sparrow' ? collectSparrowRig(mesh) : null,
      flapPhase: enemy.phase,
      jawOpen: 0,
      burstTimer: 0,
      burstShotsLeft: 0,
      nextAttack: 'charge',
      prismaNecrozRig: archetype === 'prisma_necroz' ? collectPrismaNecrozRig(mesh) : null,
      spikeScale: 1,
      golemRig: archetype === 'ground_golem' ? collectGolemRig(mesh) : null,
      golemState: 'helicopter',
      golemTimer: 0,
      golemStamina: GOLEM_STAMINA_MAX,
      golemChargeKind: 'thin',
      golemDriftDir: new THREE.Vector3(0, 0, 1),
      golemHitTimer: 0,
      golemRestartPending: false,
      golemGambling: false,
      golemParryCd: 0,
      golemParryLockout: 0,
      golemBlockGraceTimer: 0,
      golemBlockGuardElapsed: 0,
      golemPrevPlayerDist: Number.POSITIVE_INFINITY,
      golemArmAngle: 0,
      golemTwist: 0,
      golemImpact: new THREE.Vector3(),
      kronosRig: archetype === 'kronos_leviathan' ? collectKronosRig(mesh) : null,
      kronos: createKronosBossState(),
      chargeTimer: 0,
      chargeSpeed: 0,
      chargeDamage: 0,
      chargeDir: new THREE.Vector3(),
      rng,
      crabState: 'idle',
      crabTimer: 0,
      crabPostKickGrace: 0,
      crabProxTimer: 0,
      crabBurstShotsLeft: 0,
      crabSwell: 0,
      crabLandTimer: 0,
      crabHitTimer: 0,
      starMaterials: collectStarMaterials(mesh),
      cannonMaterial: findCannonMaterial(mesh),
      cellState: 'seek',
      cellTimer: 0,
      cellLungeDir: new THREE.Vector3(),
      cellScatterDir: new THREE.Vector3(),
      cellLungeLeft: 0,
      cellRing: CELL_RING_START,
      cellHiddenFor: 0,
      cellUnseenFor: 0,
      cellSlot: 0,
      cellOrbitSign: index % 2 === 0 ? 1 : -1,
      actions: glbVisual ? glbVisual.actions : null,
      currentClipAction: null,
      cellHitTimer: 0,
      // Pulpo Espiral: ciclo de dash desincronizado (2.5–5 s) para que varios
      // pulpos de una oleada no entren en alerta a la vez.
      octopusDashTimer:
        archetype === 'spiral_octopus'
          ? (OCTOPUS_DASH_COOLDOWN_SEC * 0.5 + rng() * OCTOPUS_DASH_COOLDOWN_SEC * 0.5)
          : 0,
      octopusDashActive: 0,
      octopusGiantCharge: 0,
      octopusGiantWindup: 0,
      octopusShootTimer: 0,
      octopusHitTimer: 0,
      octopusCounterTimer: 0,
      octopusForceRestart: false,
    });
  }

  // -------------------------------------------------------------------------
  // API pública
  // -------------------------------------------------------------------------

  getWaveInfo(): WaveInfo {
    // Objeto persistente (solo lectura): el bucle de juego lo consulta cada
    // frame sin generar basura.
    const plan = getWavePlan(Math.max(1, this.currentWave));
    this.waveInfoCache.wave = this.currentWave;
    this.waveInfoCache.label = plan.label;
    this.waveInfoCache.floorMode = plan.floorMode;
    this.waveInfoCache.remaining = this.getActiveEnemyCount();
    return this.waveInfoCache;
  }

  getActiveEnemies(): ManagedWaveEnemy[] {
    return this.enemies.filter((e) => e.entity.alive);
  }

  /** Nº de enemigos vivos sin asignar un array nuevo (bucle caliente). */
  getActiveEnemyCount(): number {
    let count = 0;
    for (const enemy of this.enemies) {
      if (enemy.entity.alive) count++;
    }
    return count;
  }

  /**
   * Rellena `out` con los enemigos vivos (vaciándolo antes) y lo devuelve.
   * Versión sin allocations de getActiveEnemies para el bucle de juego.
   */
  fillActiveEnemies(out: ManagedWaveEnemy[]): ManagedWaveEnemy[] {
    out.length = 0;
    for (const enemy of this.enemies) {
      if (enemy.entity.alive) out.push(enemy);
    }
    return out;
  }

  /** Cache de getWaveInfo: los consumidores solo leen, nunca mutan. */
  private readonly waveInfoCache: WaveInfo = {
    wave: 1,
    label: '',
    floorMode: 'basic',
    remaining: 0,
  };

  // -------------------------------------------------------------------------
  // Modo Entrenamiento / Debug
  // -------------------------------------------------------------------------

  /**
   * Modo Entrenamiento: spawnea un único enemigo en `homePos` (p. ej. delante
   * de Nyx), borrando cualquier enemigo anterior y los proyectiles en vuelo.
   */
  spawnSingleEnemy(
    archetype: EnemyArchetype,
    homePos: THREE.Vector3,
    activeSlabs?: SlabCollider[],
  ): ManagedWaveEnemy | null {
    this.clearEnemies();
    this.deactivateAllProjectiles();
    deactivateKronosRings(this);
    const rng = makeRng(Math.floor(Math.random() * 0x7fffffff) || 1);
    this.spawnEnemy(archetype, 0, rng, activeSlabs, homePos);
    return this.enemies[this.enemies.length - 1] ?? null;
  }

  /**
   * Modo Entrenamiento: alterna el comportamiento ofensivo de todos los
   * enemigos vivos. Con `passive` son sacos de boxeo: no atacan, no disparan
   * ni ejecutan dashes evasivos (siguen siendo golpeables y noqueables).
   */
  setEnemiesPassive(passive: boolean): void {
    if (this.enemiesPassive === passive) {
      return;
    }
    this.enemiesPassive = passive;
    if (passive) {
      this.deactivateAllProjectiles();
      deactivateKronosRings(this);
      for (const internal of this.internals.values()) {
        this.resetEnemyOffense(internal);
      }
    }
  }

  /** Cancela todo ataque/telegraph en curso y devuelve al enemigo a reposo. */
  private resetEnemyOffense(internal: EnemyInternal): void {
    internal.enemy.attackTimer = 1.5;
    internal.enemy.entity.mouthOpen = false;
    internal.enemy.entity.spikesActive = false;
    internal.chargeTimer = 0;
    internal.burstTimer = 0;
    internal.burstShotsLeft = 0;
    internal.golemState = 'helicopter';
    internal.golemTimer = 0;
    internal.golemChargeKind = 'thin';
    internal.golemDriftDir.set(0, 0, 1);
    internal.golemHitTimer = 0;
    internal.golemGambling = false;
    internal.golemParryCd = 0;
    internal.golemParryLockout = 0;
    internal.golemBlockGraceTimer = 0;
    internal.golemBlockGuardElapsed = 0;
    internal.golemPrevPlayerDist = Number.POSITIVE_INFINITY;
    if (internal.enemy.entity.archetype === 'crab_gunner') {
      resetCrabAttack(this, internal.enemy, internal);
      internal.crabPostKickGrace = 0;
      internal.crabProxTimer = 0;
      internal.crabHitTimer = 0;
    }
    if (internal.enemy.entity.archetype === 'kronos_leviathan') {
      // KRONOS: cancela cualquier ataque en curso (anillos, latigazo,
      // portales) y cierra los portales abiertos.
      resetKronosOffense(this, internal.enemy, internal);
    }
    // Célula Abisal: cancela cualquier fase ofensiva/telegraph en curso.
    if (internal.cellState !== 'seek' && internal.cellState !== 'stalk') {
      internal.cellState = 'stalk';
      internal.cellTimer = 0;
      internal.cellLungeLeft = 0;
    }
    internal.cellHitTimer = 0;
    // Pulpo Espiral (rediseño): ciclos de dash y ofensiva a valores de reposo
    // — al reactivar la IA nunca arranca en ventana de contra-parry.
    if (internal.enemy.entity.archetype === 'spiral_octopus') {
      internal.octopusDashTimer = Math.max(
        internal.octopusDashTimer,
        OCTOPUS_DASH_ALERT_SEC + 0.5,
      );
      internal.octopusDashActive = 0;
      internal.octopusGiantWindup = 0;
      internal.octopusShootTimer = 0;
      internal.octopusHitTimer = 0;
      internal.octopusCounterTimer = 0;
      internal.octopusForceRestart = false;
    }
  }

  // -------------------------------------------------------------------------
  // Contexto de la Célula Abisal (CellBehaviorContext)
  // -------------------------------------------------------------------------

  getCurrentWave(): number {
    return this.currentWave;
  }

  isEnemiesPassive(): boolean {
    return this.enemiesPassive;
  }

  /**
   * Duplicación de la Célula Abisal: spawnea la hija junto a la madre (a
   * HP completo pero con EXP reducida) y deja a la madre al 60% de su HP.
   */
  spawnCellChild(mother: ManagedWaveEnemy, offset: THREE.Vector3): void {
    const rng = makeRng(Math.floor(Math.random() * 0x7fffffff) || 1);
    const homePos = mother.position.clone().add(offset);
    const index = this.enemies.length;
    this.spawnEnemy('abyssal_cell', index, rng, undefined, homePos);
    const child = this.enemies[index];
    if (child) {
      child.entity.expValue = CELL_CHILD_EXP;
      child.attackTimer = 1.5;
    }
    mother.entity.hp = Math.max(1, mother.entity.hp * 0.6);
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
    // Velocidad ANTES del knockback: si la pared del gólem absorbe el golpe,
    // se restaura (300 kg de brazo macizo no se apartan tras cada patada).
    _preHitVel.copy(internal.enemy.velocity);
    internal.enemy.velocity.addScaledVector(hitDir, baseKnockback * kineticMult);
    internal.enemy.hitFlash = Math.min(1.8, kineticMult);
    internal.enemy.entity.hitFlash = internal.enemy.hitFlash;
    // Un golpe interrumpe la embestida en curso.
    internal.chargeTimer = 0;
    // Cangrejo Artillero: guardia anti-patada (0.75 s sin kamikaze tras el
    // impacto) + flinch de crab_hit si el golpe no lo mata.
    if (internal.enemy.entity.archetype === 'crab_gunner' && internal.enemy.entity.alive) {
      internal.crabPostKickGrace = 0.75;
      internal.crabHitTimer = CRAB_HIT_CLIP_SEC;
    }
    // Pulpo Espiral (rediseño): golpe conectado FUERA de la ventana de
    // alerta (los primeros 4.0 s del ciclo) — sin esquive ni contra-parry,
    // recibe el impacto completo y reproduce octopus_hit.
    if (internal.enemy.entity.archetype === 'spiral_octopus' && internal.enemy.entity.alive) {
      internal.octopusHitTimer = this.octopusClipSec(
      internal,
      'octopus_hit',
      OCTOPUS_HIT_CLIP_SEC,
    );
      internal.octopusForceRestart = true;
    }
    // Célula Abisal: flinch de cell_hit (la FSM ya corta la duplicación por
    // el pico de hitFlash).
    if (internal.enemy.entity.archetype === 'abyssal_cell' && internal.actions) {
      internal.cellHitTimer = 0.2;
    }
    // Gólem Rompesuelos (rediseño §7.4): remate, bloqueo y flinch.
    if (internal.enemy.entity.archetype === 'ground_golem' && internal.enemy.entity.alive) {
      const parryWindowOpenForThis = this.golemParryTargetId === enemy.id;
      const strikePhase = parryWindowOpenForThis && this.golemParryPhase === 'parry_strike';
      const descending = hitDir.y <= GOLEM_PARRY_MAX_Y_HIT_DIR;
      if (isDrill && strikePhase && descending) {
        // FASE 2 — REMATE CONECTADO (dash al star point + taladro
        // descendente): arranca el 35% de la vida TOTAL (aditivo al daño
        // cinético; el kill lo decide el game loop). La ventana se cierra AQUÍ,
        // EN ESTE MISMO FRAME: golemParryClosedFlag llega a domeGameLoop, que
        // llama a controller.closeParryWindow() en el mismo bucle — el
        // slow-mo NUNCA sobrevive al golpe de remate.
        internal.enemy.entity.hp -= internal.enemy.entity.maxHp * GOLEM_PARRY_CRIT_RATIO;
        internal.enemy.entity.hitFlash = 1.8;
        internal.golemParryCd = GOLEM_PARRY_COOLDOWN_SEC;
        this.closeGolemParryWindow(0);
        parryGolemHead(internal.enemy, internal);
      } else if (isDrill && descending) {
        // Taladro descendente: remate en cabeza. Dentro de la ventana (en la
        // fase que sea), el remate conectado TAMBIÉN consume la ventana
        // (cooldown largo); el crítico del 35% es SOLO del parry con dash.
        if (parryWindowOpenForThis) {
          internal.golemParryCd = GOLEM_PARRY_COOLDOWN_SEC;
          this.closeGolemParryWindow(0);
        }
        parryGolemHead(internal.enemy, internal);
      } else if (this.isGolemGuardBlocking(internal.enemy)) {
        // Pared maciza (block_guard o gracia del brazo): el golpe frontal se
        // queda en el brazo gigante y la masa ni se inmuta — domeGameLoop
        // consulta el bloqueo (0 daño cinético) y el rebote de Nyx es la
        // SENTADILLA CINÉTICA contra el brazo.
        if (strikePhase) {
          // En FASE 2 el golpe ya conectó contra el brazo: la ventana muere
          // EN ESTE FRAME (nada de slow-mo colgando tras golpear). En FASE 1
          // la ventana SOBREVIVE al rebote de la patada (el dash sale
          // justo después de rebotar en la pared).
          this.closeGolemParryWindow(0);
        }
        internal.enemy.velocity.copy(_preHitVel);
        internal.enemy.hitFlash = Math.min(internal.enemy.hitFlash, 0.35);
        internal.enemy.entity.hitFlash = internal.enemy.hitFlash;
      } else {
        // Sacudida seca de impacto (golem_hit pisa la FSM mientras dura).
        if (strikePhase) {
          // FASE 2: cualquier golpe conectado cierra la ventana YA — el
          // slow-mo nunca sigue tras haber golpeado el remate.
          this.closeGolemParryWindow(0);
        }
        internal.golemHitTimer = GOLEM_HIT_CLIP_SEC;
        internal.golemRestartPending = true;
      }
    }
  }

  /**
   * ¿Está este enemigo absorbiendo un impacto frontal con la pared maciza del
   * brazo gigante? Lo consulta el game loop ANTES de computeKineticImpact:
   * true significa 0 daño (obliga a flanquear, provocar el ataque con la
   * cercanía o rematar desde arriba con el taladro).
   *
   * - Cuenta la GRACIA: durante el clip golem_block_end (~0.27 s) el brazo
   *   sigue arriba y AÚN bloquea (antes solo miraba block_guard y el gólem
   *   moría "bloqueando" en el último frame de la bajada).
   * - La cara golpeada es la dirección REAL gólem→Nyx (radial), no el
   *   `hitDir` del facing de Nyx: con auto-aim el producto escalar mentía y
   *   el frente "aparente" no era el frente real.
   */
  isGolemGuardBlocking(enemy: TestEnemySphere): boolean {
    const internal = this.internals.get(enemy.id);
    if (!internal) {
      return false;
    }
    // Gracia del brazo: block_guard O la bajada en curso (golem_block_end).
    if (internal.golemState !== 'block_guard' && internal.golemBlockGraceTimer <= 0) {
      return false;
    }
    // Cara REAL que Nyx golpea: radial del centro del gólem hacia Nyx.
    _aimDir.subVectors(this.playerPosCache, internal.enemy.position);
    if (_aimDir.lengthSq() < 1e-4) {
      return false;
    }
    _aimDir.normalize();
    _guardDir.set(0, 0, 1).applyQuaternion(internal.enemy.mesh.quaternion);
    return _guardDir.dot(_aimDir) > GOLEM_GUARD_FACE_DOT;
  }

  /**
   * Elimina un enemigo (escena + materiales + listas). Idempotente.
   *
   * Con `withVfx` la malla no desaparece de golpe: queda en `dying` vibrando
   * `DEATH_SHAKE_TIME` y luego se infla y estalla. El enemigo sale de
   * `enemies` al instante, así que la lógica de juego no cambia.
   *
   * Devuelve true sólo la primera vez (el caller lo usa para soltar la EXP
   * una única vez aunque el combate ya hubiera marcado `entity.alive = false`).
   */
  killEnemy(enemy: ManagedWaveEnemy, withVfx = true): boolean {
    const internal = this.internals.get(enemy.id);
    if (!internal) {
      return false;
    }
    enemy.entity.alive = false;
    enemy.entity.hp = 0;
    this.hideCrabLaser(enemy.id);
    this.hideCrabDangerRing(enemy.id);
    this.internals.delete(enemy.id);
    const idx = this.enemies.indexOf(enemy);
    if (idx >= 0) {
      this.enemies.splice(idx, 1);
    }

    const materials = this.collectEnemyMaterials(enemy, internal);
    if (withVfx) {
      this.dying.push({
        mesh: enemy.mesh,
        basePos: enemy.mesh.position.clone(),
        baseScale: enemy.mesh.scale.clone(),
        elapsed: 0,
        radius: enemy.radius,
        color: this.visuals[enemy.entity.archetype].color,
        materials,
        exploded: false,
      });
      return true;
    }
    this.scene.remove(enemy.mesh);
    for (const material of materials) material.dispose();
    return true;
  }

  /** Materiales propios de la instancia (se liberan al terminar la muerte). */
  private collectEnemyMaterials(
    enemy: ManagedWaveEnemy,
    internal: EnemyInternal,
  ): THREE.Material[] {
    const materials = new Set<THREE.Material>();
    if (internal.material) materials.add(internal.material);
    if (internal.outlineMaterial) materials.add(internal.outlineMaterial);
    // Carne nebulosa + contornos vibrantes: material propio por instancia.
    for (const animatedMaterial of internal.animatedMaterials) {
      materials.add(animatedMaterial);
    }
    // Estrella interior y piezas: material propio por enemigo.
    for (const child of enemy.mesh.children) {
      if (child instanceof THREE.Mesh) materials.add(child.material as THREE.Material);
    }
    return [...materials];
  }

  /** Avanza temblor, estallido y limpieza de los enemigos moribundos. */
  private updateDying(dt: number): void {
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const dying = this.dying[i];
      dying.elapsed += dt;

      if (dying.elapsed < DEATH_SHAKE_TIME) {
        // Vibración de alta frecuencia que crece hacia el estallido, con
        // estrujón de escala para que se lea como un cuerpo a punto de romper.
        const k = dying.elapsed / DEATH_SHAKE_TIME;
        const amp = 0.06 + 0.3 * k;
        dying.mesh.position.set(
          dying.basePos.x + Math.sin(dying.elapsed * 92) * amp,
          dying.basePos.y + Math.cos(dying.elapsed * 77) * amp,
          dying.basePos.z + Math.sin(dying.elapsed * 83 + 1.7) * amp,
        );
        dying.mesh.rotation.z = Math.sin(dying.elapsed * 70) * 0.2 * k;
        const squash = 1 + Math.sin(dying.elapsed * 110) * 0.09 * k;
        dying.mesh.scale.copy(dying.baseScale).multiplyScalar(squash);
        continue;
      }

      if (!dying.exploded) {
        dying.exploded = true;
        dying.mesh.position.copy(dying.basePos);
        dying.mesh.rotation.z = 0;
        this.onEnemyExplode?.(dying.basePos, dying.radius, dying.color);
      }

      const pop = (dying.elapsed - DEATH_SHAKE_TIME) / DEATH_POP_TIME;
      if (pop >= 1) {
        this.scene.remove(dying.mesh);
        for (const material of dying.materials) material.dispose();
        this.dying.splice(i, 1);
        continue;
      }
      // Inflado final: el cuerpo se hincha justo cuando estalla.
      dying.mesh.scale.copy(dying.baseScale).multiplyScalar(1 + pop * 0.7);
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
   * oscuros / tinta / embestidas / ráfaga del Ave con boca abierta / manotazo
   * del Gólem), pinchos y ventana vulnerable de Prisma Necroz, cangrejo pegado a
   * `activeSlabs` (con saltos entre ellos), colisión de voladores contra los
   * icebergs y proyectiles en vuelo.
   *
   * `onGolemSmash` se dispara cuando el manotazo brutal del Gólem alcanza a
   * Nyx (daño + dirección de empuje para el `hit_stagger`) y `onSlabSmash`
   * cuando el manotazo rompe un suelo flotante cercano. Los Anillos de
   * Contención de KRONOS reutilizan `onGolemSmash` con daño 0 y un empuje
   * radial más fuerte (`pushSpeed`).
   */
  update(
    dt: number,
    elapsed: number,
    playerPos: THREE.Vector3,
    lockedEnemy: TestEnemySphere | null,
    playerAttackTime: number,
    playerVel: THREE.Vector3,
    playerAimForward: THREE.Vector3,
    playerDashing: boolean,
    playerKickAnim: boolean,
    playerGroundedSlab: SlabCollider | null,
    activeSlabs: SlabCollider[] | undefined,
    onPlayerHit: (damage: number) => void,
    onOctopusInk: (durationSec: number, opacity: number) => void,
    onGolemSmash?: (damage: number, pushDir: THREE.Vector3, pushSpeed?: number) => void,
    onSlabSmash?: (slab: SlabCollider) => void,
    playerHpRatio = 1,
    playerEdenRatio = 1,
    /** ¿Usó Nyx el dash del remate dentro de la ventana de parry abierta? */
    playerParryDashUsed = false,
  ): {
    didEnemyEvadeDash: boolean;
    golemParryTarget: TestEnemySphere | null;
    golemParryStarPos: THREE.Vector3 | null;
  } {
    let didEnemyEvadeDash = false;
    this.waveTime += dt;
    this.playerPosCache.copy(playerPos);
    // Ventana del parry: si el gólem propietario murió por otra vía
    // (combo, espiral ajena), la ventana muere con él. TODO lo demás
    // (apertura y cierre) lo decide la DISTANCIA en updateGolemParryWindow.
    const parryOwner = this.golemParryEnemy;
    if (
      parryOwner &&
      (!parryOwner.entity.alive ||
        parryOwner.entity.hp <= 0 ||
        !this.internals.has(parryOwner.id))
    ) {
      this.closeGolemParryWindow(0);
    }
    let golemParryTarget: TestEnemySphere | null = null;
    let golemParryStarPos: THREE.Vector3 | null = null;
    // Foto de Nyx para la IA observadora del Gólem (una por frame).
    this.golemInfo.vel.copy(playerVel);
    // Foto de Nyx para KRONOS: velocidad (predicción honesta de trayectoria,
    // esquivas) y aim (Portal 2 a la espalda de Nyx).
    this.playerVelocity.copy(playerVel);
    this.playerAimForward.copy(playerAimForward);
    this.golemInfo.aimForward.copy(playerAimForward);
    this.golemInfo.hpRatio = THREE.MathUtils.clamp(playerHpRatio, 0, 1);
    this.golemInfo.edenRatio = THREE.MathUtils.clamp(playerEdenRatio, 0, 1);
    this.golemInfo.attacking = playerAttackTime > 0.15 || playerKickAnim;
    this.updateDying(dt);
    const lockedId = lockedEnemy?.id ?? null;

    // Enjambre de Células Abisales: foco de Nyx + slots de órbita + token.
    this.cellDirector.beginFrame(
      dt,
      this.enemies,
      this.internals,
      playerPos,
      playerVel,
      playerAimForward,
      playerDashing,
      playerAttackTime,
      lockedId,
      lockedEnemy?.position ?? null,
    );

    // Iteración hacia atrás por índice: killEnemy hace splice de this.enemies
    // durante el bucle y así los índices pendientes no se desplazan (cero
    // allocations, antes era `[...this.enemies]` cada frame).
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      const internal = this.internals.get(enemy.id);
      if (!internal) {
        continue;
      }
      // Limpieza: enemigo marcado como muerto (fuego amigo del láser o
      // kamikaze del cangrejo). Se retira AQUÍ, sobre el índice actual, para
      // no desplazar posiciones dentro del bucle hacia atrás.
      if (!enemy.entity.alive) {
        this.slainByEnemy(enemy);
        continue;
      }

      enemy.evadeCooldown = Math.max(0, enemy.evadeCooldown - dt);
      enemy.entity.evadeCooldown = enemy.evadeCooldown;
      if (enemy.hitFlash > 0) {
        enemy.hitFlash = Math.max(0, enemy.hitFlash - dt * HIT_FLASH_DECAY);
        enemy.entity.hitFlash = enemy.hitFlash;
      }
      enemy.dashTimer = Math.max(0, enemy.dashTimer - dt);
      // Modo pasivo: la cuenta atrás de ataque queda congelada para que al
      // reactivar la IA el enemigo no descargue un ataque instantáneo.
      if (!this.enemiesPassive) {
        enemy.attackTimer -= dt;
      }
      // Ventana vulnerable del Prisma Necroz (tras dash evasivo o ráfaga).
      if ((enemy.entity.vulnerableTimer ?? 0) > 0) {
        enemy.entity.vulnerableTimer = Math.max(0, (enemy.entity.vulnerableTimer ?? 0) - dt);
      }

      // Reloj de los shaders animados: carne nebulosa y contorno vibrante.
      for (const animatedMaterial of internal.animatedMaterials) {
        animatedMaterial.uniforms.uTime.value = elapsed;
      }

      // Rotación continua de la estrella interior en 2 ejes + vibración de
      // energía. Con clips embebidos (célula/gólem) el núcleo lo anima el
      // GLB. Ojo: actions puede ser un Map VACÍO (GLB cached sin clips),
      // que es truthy — sin el size check la estrella quedaba congelada.
      if (!internal.actions || internal.actions.size === 0) {
        for (const star of internal.starCores) {
          star.rotation.y += dt * 2.8;
          star.rotation.x += dt * 2.0;
          star.position.set(
            Math.sin(elapsed * 29 + enemy.phase) * 0.035,
            Math.cos(elapsed * 34 + enemy.phase) * 0.035,
            Math.sin(elapsed * 23 + enemy.phase * 1.4) * 0.035,
          );
        }
      }
      internal.mixer?.update(dt);

      // --- Dash evasivo: rompe el lock-in de los arquetipos escurridizos ---
      if (
        !this.enemiesPassive &&
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
          // Prisma Necroz: tras el dash evasivo abre su ventana vulnerable
          // (pinchos retraídos, star_core al alcance).
          if (enemy.entity.archetype === 'prisma_necroz') {
            enemy.entity.vulnerableTimer = Math.max(
              enemy.entity.vulnerableTimer ?? 0,
              PRISMA_NECROZ_VULN_SEC,
            );
          }
        }
      }

      // --- Movimiento ANTES del comportamiento: el cangrejo ancla a su suelo
      // y hereda su traslación/rotación del mismo paso físico, de modo que la
      // boca del cañón (turretNode) se calcula sobre la pose mundial ACTUAL
      // justo en el instante del disparo (sin desfase de un frame ni
      // "efecto Coriolis" sobre suelos móviles/giratorios).
      const isCrab = enemy.entity.archetype === 'crab_gunner';
      if (isCrab) {
        updateCrabEnemy(this, enemy, internal, dt, elapsed, playerPos, activeSlabs);
      } else if (enemy.entity.archetype === 'kronos_leviathan') {
        // Solo la CABEZA es empujada por la velocidad de la IA: la cadena
        // de segmentos la resuelve la física de follow-the-leader en la pose.
        updateKronosMovement(this, enemy, internal, dt, elapsed, playerPos);
        // Fase 4: timer de supervivencia + agenda de cosmos_fusion.
        updateKronosPhase4(this, enemy, internal, dt);
      } else if (enemy.entity.archetype === 'abyssal_cell') {
        // Célula Abisal: FSM de oportunista (acecho, lunge, huida, duplicación)
        // con su propio ataque por contacto — no pasa por updateEnemyBehavior.
        updateCellEnemy(
          this,
          this.cellDirector,
          enemy,
          internal,
          dt,
          elapsed,
          activeSlabs,
          onPlayerHit,
        );
      } else if (enemy.entity.archetype === 'ground_golem') {
        // Gólem Rompesuelos: el rotor sostiene los 300 kg — su movimiento es
        // propiedad de su FSM (helicóptero, cargas selladas, exhausto).
        updateGolemEnemy(
          enemy,
          internal,
          dt,
          elapsed,
          playerPos,
          this.enemiesPassive,
        );
      } else if (enemy.entity.archetype === 'spiral_octopus') {
        // Pulpo Espiral (rediseño): movimiento libre por toda la cúpula con
        // su PROPIO ciclo de dash de 5.0 s — sin homePos estático, sin dash
        // evasivo genérico. La contención dura vive a 80 m.
        this.updateOctopusEnemy(enemy, internal, dt, playerPos);
      } else {
        this.applyFloatMovement(enemy, internal, dt, elapsed);
      }

      // --- Comportamiento ofensivo por arquetipo (desactivado en modo pasivo) ---
      if (!this.enemiesPassive && enemy.entity.archetype !== 'abyssal_cell') {
        this.updateEnemyBehavior(
          enemy,
          internal,
          dt,
          playerPos,
          playerVel,
          playerKickAnim,
          playerGroundedSlab,
          activeSlabs,
          onPlayerHit,
          onOctopusInk,
          onGolemSmash,
          onSlabSmash,
        );
      }

      // --- Voladores contra los icebergs: nunca atraviesan los suelos ---
      // (KRONOS NO rompe suelos: rebota suavemente y los esquivan su
      // movimiento — nunca llama a onSlabSmash.)
      // Gólem en plena carga en espiral: la FSM resuelve la colisión con los
      // slabs (la broca se clava; el ariete los rompe y sigue arando).
      const golemSpiral =
        enemy.entity.archetype === 'ground_golem' &&
        (internal.golemState === 'thin_spiral' || internal.golemState === 'thick_spiral');
      const crabOnSlab = isCrab && (internal.jump !== null || internal.attachedSlabId !== null);
      if (
        activeSlabs &&
        !crabOnSlab &&
        !golemSpiral &&
        resolveSphereSlabCollision(activeSlabs, enemy.position, enemy.radius, _slabContact)
      ) {
        if (enemy.entity.archetype === 'ground_golem' && _slabContact.slab && onSlabSmash) {
          // El Gólem Rompesuelos destroza el suelo al chocar en vez de
          // teletransportarse por el empuje de su esfera de 3.2 m.
          onSlabSmash(_slabContact.slab);
        } else {
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
      }

      // --- Parry por DISTANCIA (regla 2): apertura/cierre de la banda
      // α+GOLEM_PARRY_OPEN_DIST → α+GOLEM_PARRY_CLOSE_DIST. El MANAGER es
      // la única fuente de verdad de la ventana; domeGameLoop traduce sus
      // aperturas/cierres al slow-mo del controller.
      if (enemy.entity.archetype === 'ground_golem' && enemy.entity.alive) {
        this.updateGolemParryWindow(
          enemy,
          internal,
          playerPos,
          playerVel,
          playerParryDashUsed,
          dt,
        );
      }

      // --- Pose procedural: el pulpo encara a Nyx y ondea sus tentáculos ---
      if (enemy.entity.archetype === 'spiral_octopus') {
        this.updateOctopusPose(enemy, internal, dt, elapsed, playerPos);
      } else if (enemy.entity.archetype === 'giant_sparrow') {
        this.updateSparrowPose(enemy, internal, dt, elapsed, playerPos);
      } else if (enemy.entity.archetype === 'prisma_necroz') {
        this.updatePrismaNecrozPose(enemy, internal, dt, elapsed, playerPos);
      } else if (enemy.entity.archetype === 'ground_golem') {
        this.updateGolemPose(enemy, internal, dt, elapsed, playerPos);
      } else if (enemy.entity.archetype === 'kronos_leviathan') {
        updateKronosPose(this, enemy, internal, dt, elapsed, playerPos);
      } else if (enemy.entity.archetype === 'abyssal_cell') {
        this.updateCellPose(enemy, internal, dt, elapsed);
      } else if (isCrab) {
        this.updateCrabPose(enemy, internal, dt, elapsed);
      }

      enemy.entity.position.copy(enemy.position);
      enemy.entity.velocity.copy(enemy.velocity);

      // --- Flash de impacto + vibración de energía descontrolada + pinchos ---
      const flash = enemy.hitFlash;
      if (enemy.entity.archetype === 'kronos_leviathan') {
        // KRONOS: la escala de la malla la controla EXCLUSIVAMENTE su física
        // de cadena (el wobble global pelearía contra las longitudes medidas
        // de los eslabones). Solo queda el flash en el material.
        enemy.mesh.scale.set(1, 1, 1);
      } else {
        // El cangrejo en cebado kamikaze se hincha por pulsos además del flash.
        const baseScale = 1 + flash * HIT_FLASH_SCALE + internal.crabSwell;
        enemy.mesh.scale.set(
          baseScale + Math.sin(elapsed * 27 + enemy.phase) * 0.026,
          baseScale + Math.cos(elapsed * 31 + enemy.phase) * 0.026,
          baseScale + Math.sin(elapsed * 24 + enemy.phase * 1.7) * 0.026,
        );
      }
      let emissive = flash * HIT_FLASH_EMISSIVE;
      if (internal.material) {
        if (enemy.entity.spikesActive) {
          emissive += 0.5;
          internal.material.uniforms.uRimColor.value.setHex(PRISMA_NECROZ_SPIKES_RIM);
        } else if (enemy.entity.archetype === 'prisma_necroz') {
          internal.material.uniforms.uRimColor.value.setHex(PRISMA_NECROZ_BASE_RIM);
        }
        internal.material.uniforms.uEmissiveBoost.value = emissive;
      }
    }

    this.inkProjectileMaterial.uniforms.uTime.value = elapsed;
    this.updateProjectiles(dt, playerPos, activeSlabs ?? [], onPlayerHit, onOctopusInk);
    this.updateOctopusSplitBursts(dt, playerPos);
    updateKronosRings(this, dt, playerPos, onGolemSmash);
    updateKronosPortals(this.kronosPortals, dt, elapsed);

    // Ventana de parry abierta este frame: el game loop arranca el slow-mo
    // con el gólem y el punto de su estrella (clonado: el manager seguirá
    // moviéndolo, la ventana usa la foto del momento de apertura).
    if (this.pendingParryEnemy) {
      golemParryTarget = this.pendingParryEnemy;
      golemParryStarPos = this.golemParryStarPos.clone();
      this.pendingParryEnemy = null;
    }

    return { didEnemyEvadeDash, golemParryTarget, golemParryStarPos };
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
    for (const ring of this.kronosRings) {
      this.scene.remove(ring.mesh);
    }
    this.kronosRings.length = 0;
    this.kronosRingGeometry.dispose();
    this.kronosRingMaterial.dispose();
    for (const portal of this.kronosPortals) {
      this.scene.remove(portal.group);
      portal.diskMaterial.dispose();
      portal.rimMaterial.dispose();
    }
    this.kronosPortals.length = 0;
    disposeKronosPortalShared();
    this.resetKronosNyxEffects();
    for (const beam of this.crabLasers) {
      this.scene.remove(beam.mesh);
      beam.material.dispose();
    }
    this.crabLasers.length = 0;
    this.crabLaserGeometry.dispose();
    for (const ring of this.crabDangerRings) {
      this.scene.remove(ring.mesh);
      ring.material.dispose();
    }
    this.crabDangerRings.length = 0;
    this.crabDangerRingGeometry.dispose();
    this.scene.remove(this.golemParryHalo);
    this.golemParryHaloMaterial.dispose();
    this.golemParryHaloGeometry.dispose();
    this.laserProjectileMaterial.dispose();
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
    playerVel: THREE.Vector3,
    playerKickAnim: boolean,
    playerGroundedSlab: SlabCollider | null,
    activeSlabs: SlabCollider[] | undefined,
    onPlayerHit: (damage: number) => void,
    onOctopusInk: (durationSec: number, opacity: number) => void,
    onGolemSmash?: (damage: number, pushDir: THREE.Vector3, pushSpeed?: number) => void,
    onSlabSmash?: (slab: SlabCollider) => void,
  ): void {
    const archetype = enemy.entity.archetype;

    // Ave Legendaria: ráfaga en curso (telegraph + 3 esferas, boca abierta).
    if (archetype === 'giant_sparrow') {
      if (this.updateSparrowBurst(enemy, internal, dt, playerPos)) {
        return;
      }
      enemy.entity.mouthOpen = false;
    }

    // Prisma Necroz: saca los pinchos cuando Nyx se acerca de frente
    // (< 10 m); en su ventana vulnerable (tras dash o ráfaga) los retrae.
    if (archetype === 'prisma_necroz') {
      const vulnerable = (enemy.entity.vulnerableTimer ?? 0) > 0;
      const near = enemy.position.distanceTo(playerPos) < PRISMA_NECROZ_SPIKES_RANGE;
      enemy.entity.spikesActive = near && !vulnerable;
    }

    // Cangrejo Artillero: FSM de sus 3 ataques del rediseño (rayo láser
    // continuo con fuego amigo, ráfaga parryable y protocolo kamikaze).
    if (archetype === 'crab_gunner') {
      updateCrabAttack(
        this,
        enemy,
        internal,
        dt,
        playerPos,
        playerVel,
        playerKickAnim,
        playerGroundedSlab,
        activeSlabs,
        onPlayerHit,
        onGolemSmash,
        onSlabSmash,
      );
      return;
    }

    // Gólem Rompesuelos: FSM del rediseño §7.4 (helicóptero/fatiga, dos cargas
    // en espiral honestas, puñetazo bruto, bloqueo y remate en cabeza).
    if (archetype === 'ground_golem') {
      updateGolemAttack(
        this,
        enemy,
        internal,
        dt,
        playerPos,
        this.golemInfo,
        activeSlabs,
        onGolemSmash,
        onSlabSmash,
      );
      return;
    }

    // Leviatán KRONOS: FSM de ataques por fase (Anillos, Latigazo de Cola,
    // Portales Cósmicos + Mordisco, cosmos_fusion y supernova).
    if (archetype === 'kronos_leviathan') {
      updateKronosAttack(
        this,
        enemy,
        internal,
        dt,
        playerPos,
        onPlayerHit,
        onGolemSmash,
      );
      return;
    }

    // Pulpo Espiral (rediseño): hostigador táctico — contra-parry proactivo si
    // Nyx entra en ≤ 3 m de su hitbox atacando con patada en ventana 1.5–0.1 s,
    // y bolas rojas de tinta ácida (nunca a ≤ 2 m de su hitbox).
    if (archetype === 'spiral_octopus') {
      this.updateOctopusOffense(
        enemy,
        internal,
        dt,
        playerPos,
        playerKickAnim,
        onOctopusInk,
      );
      return;
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

    const mult = this.speedMult;

    switch (archetype) {
      case 'giant_sparrow':
        // Élite: alterna embestida aérea (picado) y ráfaga de 3 esferas oscuras
        // por la boca (que abre durante el telegraph + disparo).
        if (internal.nextAttack === 'charge') {
          this.startCharge(enemy, internal, playerPos, 21 * mult, SPARROW_CHARGE_DAMAGE);
          internal.nextAttack = 'burst';
          enemy.attackTimer = 3.2 / mult;
        } else {
          internal.burstTimer = SPARROW_BURST_WINDOW_SEC;
          internal.burstShotsLeft = SPARROW_BURST_FIRE_AT.length;
          enemy.entity.mouthOpen = true;
          internal.nextAttack = 'charge';
          enemy.attackTimer = SPARROW_BURST_WINDOW_SEC + 3.2 / mult;
        }
        break;

      case 'prisma_necroz': {
        // Élite: ráfaga prismática de 2 esferas; tras disparar abre su
        // ventana vulnerable (pinchos retraídos, star_core rematable).
        this.fireProjectile(enemy, playerPos, 'dark', 10, 11 * mult, -0.14);
        this.fireProjectile(enemy, playerPos, 'dark', 10, 11 * mult, 0.14);
        enemy.entity.vulnerableTimer = Math.max(
          enemy.entity.vulnerableTimer ?? 0,
          PRISMA_NECROZ_VULN_SEC,
        );
        enemy.attackTimer = 2.4 / mult;
        break;
      }

      case 'lightning_butterfly':
      case 'abyssal_cell':
      default:
        // Pasivos/escurridizos: sin ataque ofensivo propio (el gólem se
        // gestiona en updateGolemAttack).
        enemy.attackTimer = 1.0;
        break;
    }
  }

  /**
   * Progresa la ráfaga del Ave Legendaria: boca abierta (mouthOpen), frenado
   * suave en el aire y 3 esferas oscuras desde el hueso `jaw`. Devuelve true
   * mientras la ráfaga siga en curso.
   */
  private updateSparrowBurst(
    enemy: ManagedWaveEnemy,
    internal: EnemyInternal,
    dt: number,
    playerPos: THREE.Vector3,
  ): boolean {
    if (internal.burstTimer <= 0) {
      return false;
    }
    internal.burstTimer -= dt;
    enemy.entity.mouthOpen = true;
    // Se frena en el aire mientras telegrafiza y dispara.
    enemy.velocity.multiplyScalar(Math.exp(-2.5 * dt));

    const shotIndex = SPARROW_BURST_FIRE_AT.length - internal.burstShotsLeft;
    if (
      internal.burstShotsLeft > 0 &&
      shotIndex < SPARROW_BURST_FIRE_AT.length &&
      internal.burstTimer <= SPARROW_BURST_FIRE_AT[shotIndex]
    ) {
      this.fireSparrowShot(enemy, internal, playerPos, (shotIndex - 1) * 0.12);
      internal.burstShotsLeft--;
    }
    if (internal.burstTimer <= 0) {
      enemy.entity.mouthOpen = false;
    }
    return true;
  }

  /** Esfera oscura del Ave naciendo en la boca (hueso `jaw`). */
  private fireSparrowShot(
    enemy: ManagedWaveEnemy,
    internal: EnemyInternal,
    playerPos: THREE.Vector3,
    spreadRad: number,
  ): void {
    const jaw = internal.sparrowRig?.jaw;
    if (jaw) {
      jaw.bone.updateWorldMatrix(true, false);
      jaw.bone.getWorldPosition(_muzzlePos);
    } else {
      _muzzlePos.copy(enemy.position);
    }
    this.fireProjectile(
      enemy,
      playerPos,
      'dark',
      SPARROW_BURST_DAMAGE,
      13 * this.speedMult,
      spreadRad,
      _muzzlePos,
    );
  }


  // -------------------------------------------------------------------------
  // Pulpo Espiral (rediseño): ciclo de 5.0 s, bolas de tinta ácida,
  // Bola Gigante de Dispersión y Contra-Parry.
  // -------------------------------------------------------------------------

  /**
   * Movimiento libre del pulpo (banda 2–80 m por toda la zona segura):
   * ciclos de dash de 5.0 s con deriva de fricción suave entre impulsos,
   * observando y encarando a Nyx (la orientación la fija updateOctopusPose).
   * SIN homePos estático y SIN dash evasivo genérico: el último segundo del
   * ciclo (dashTimer <= 1.0 s) es la ventana de alerta del Contra-Parry.
   */
  private updateOctopusEnemy(
    enemy: ManagedWaveEnemy,
    internal: EnemyInternal,
    dt: number,
    playerPos: THREE.Vector3,
  ): void {
    // Modo Entrenamiento (saco de boxeo): sin ciclo de dash, solo fricción.
    if (this.enemiesPassive) {
      enemy.velocity.multiplyScalar(Math.exp(-3.5 * dt));
      enemy.position.addScaledVector(enemy.velocity, dt);
      return;
    }

    internal.octopusDashTimer -= dt;
    if (internal.octopusDashTimer <= 0 && internal.octopusDashActive <= 0) {
      this.startOctopusDash(enemy, internal, playerPos);
    }

    // Fricción: freno suave tras el impulso del dash, deriva lenta el resto
    // del ciclo (el octópodo planea observando a Nyx).
    enemy.velocity.multiplyScalar(
      Math.exp(-(internal.octopusDashActive > 0 ? OCTOPUS_DASH_DAMPING : OCTOPUS_DRIFT_DAMPING) * dt),
    );
    internal.octopusDashActive = Math.max(0, internal.octopusDashActive - dt);
    enemy.position.addScaledVector(enemy.velocity, dt);

    // Contención dura a 80 m: jamás toca la Barrera Blanca.
    _flat.set(enemy.position.x, 0, enemy.position.z);
    const flatDist = _flat.length();
    const keepRadius = OCTOPUS_KEEP_RADIUS - enemy.radius;
    if (flatDist > keepRadius) {
      _flat.divideScalar(flatDist);
      enemy.position.x = _flat.x * keepRadius;
      enemy.position.z = _flat.z * keepRadius;
      const into = enemy.velocity.dot(_flat);
      if (into > 0) {
        enemy.velocity.addScaledVector(_flat, -into);
      }
    }
    // Banda vertical libre.
    if (enemy.position.y < OCTOPUS_MIN_Y) {
      enemy.position.y = OCTOPUS_MIN_Y;
      enemy.velocity.y = Math.max(0, enemy.velocity.y);
    } else if (enemy.position.y > OCTOPUS_MAX_Y) {
      enemy.position.y = OCTOPUS_MAX_Y;
      enemy.velocity.y = Math.min(0, enemy.velocity.y);
    }

    // Banda mínima respecto a Nyx: repulsión suave para no acabar pegado.
    _toEnemy.subVectors(enemy.position, playerPos);
    const nyxDist = _toEnemy.length();
    if (nyxDist > 1e-4 && nyxDist < enemy.radius + OCTOPUS_MIN_NYX_DIST) {
      _toEnemy.divideScalar(nyxDist);
      enemy.velocity.addScaledVector(_toEnemy, OCTOPUS_MIN_NYX_PUSH * dt);
    }
  }

  /**
   * Impulso del dash del ciclo (cada 5.0 s): un nuevo vector libre de la
   * cúpula de alta velocidad, sincronizado con el one-shot
   * `octopus_dash_propel`, que frena suavemente. Resetea el ciclo completo
   * (dashTimer = 5.0 s).
   */
  private startOctopusDash(
    enemy: ManagedWaveEnemy,
    internal: EnemyInternal,
    playerPos: THREE.Vector3,
  ): void {
    const ang = internal.rng() * Math.PI * 2;
    _spiralDir
      .set(Math.cos(ang), (internal.rng() - 0.5) * 0.9, Math.sin(ang))
      .normalize();
    // Nyx demasiado cerca: mezcla el vector libre con la huida (banda de
    // media distancia — el hostigador nunca acaba encima del objetivo).
    const nyxDist = enemy.position.distanceTo(playerPos);
    if (nyxDist < OCTOPUS_PREF_MIN_DIST) {
      _aimDir.subVectors(enemy.position, playerPos);
      if (_aimDir.lengthSq() > 1e-4) {
        _aimDir.normalize();
        _spiralDir.lerp(_aimDir, 0.55).normalize();
      }
    }
    // Cerca del borde de contención: gira el vector hacia dentro (80 m).
    _flat.set(enemy.position.x, 0, enemy.position.z);
    if (_flat.length() > OCTOPUS_KEEP_RADIUS * 0.66) {
      _aimDir.copy(_flat).negate().normalize();
      _spiralDir.lerp(_aimDir, 0.5).normalize();
    }
    enemy.velocity.copy(_spiralDir).multiplyScalar(OCTOPUS_DASH_SPEED);
    internal.octopusDashActive = OCTOPUS_DASH_TIME;
    internal.octopusDashTimer = OCTOPUS_DASH_COOLDOWN_SEC;
    internal.octopusForceRestart = true;
  }

  /**
   * Ofensiva del Pulpo Espiral:
   * - Ataque 1 — Bola Roja de Tinta Ácida: 1 cada 3.0 s (0.333/s) con física
   *   30 m/s + decel constante -1 m/s², sincronizada con octopus_shoot_ball.
   * - Ataque 2 — Bola Gigante de Dispersión: barra interna de energía que se
   *   llena cada 20.0 s; al completarse reproduce octopus_giant_charge y
   *   lanza una Bola Gigante Roja (detona a ≤ 12 m de Nyx).
   */
  private updateOctopusOffense(
    enemy: ManagedWaveEnemy,
    internal: EnemyInternal,
    dt: number,
    playerPos: THREE.Vector3,
    playerKickAnim: boolean,
    onOctopusInk: (durationSec: number, opacity: number) => void,
  ): void {
    const distToNyx = enemy.position.distanceTo(playerPos);

    // Contra-Parry proactivo: Nyx atacando con patada dentro de 3.0 m de la
    // hitbox del pulpo mientras faltan 0.1–1.5 s para su siguiente dash.
    // El pulpo mira a Nyx, le escupe un chorro de tinta negra a bocajarro y
    // esquiva LATERALMENTE con un dash más rápido de lo normal.
    if (
      playerKickAnim &&
      distToNyx <= enemy.radius + 3.0 &&
      internal.octopusDashTimer <= OCTOPUS_DASH_ALERT_SEC &&
      internal.octopusDashTimer >= 0.1 &&
      internal.octopusCounterTimer <= 0
    ) {
      const inkSec = this.executeOctopusCounterParry(enemy, internal);
      onOctopusInk(inkSec, INK_COUNTER_OPACITY);
      return;
    }

    // Regla de cercanía: mientras Nyx esté a ≤ 2.0 m de la hitbox del pulpo,
    // NO dispara ninguna bola roja (evita disparos a quemarropa).
    const tooCloseForBalls = distToNyx <= enemy.radius + 2.0;

    // Barra de energía de la Bola Gigante (cada 20.0 s).
    internal.octopusGiantCharge += dt;
    if (
      !tooCloseForBalls &&
      internal.octopusGiantCharge >= OCTOPUS_GIANT_CHARGE_SEC &&
      internal.octopusGiantWindup <= 0
    ) {
      internal.octopusGiantCharge = 0;
      internal.octopusGiantWindup = this.octopusClipSec(
        internal,
        'octopus_giant_charge',
        OCTOPUS_GIANT_WINDUP_SEC,
      );
      internal.octopusForceRestart = true;
    }
    if (internal.octopusGiantWindup > 0) {
      internal.octopusGiantWindup -= dt;
      if (internal.octopusGiantWindup <= 0 && !tooCloseForBalls) {
        // Lanzamiento de la Bola Gigante Roja desde el frente del manto.
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
        this.fireOctopusBall(_muzzlePos, _muzzleDir, 0, 0, true);
      }
      return; // En windup no hay bolas base (el clip de carga gobierna el manto).
    }

    if (tooCloseForBalls || enemy.attackTimer > 0) {
      return;
    }

    // Bola base desde el frente del manto, hacia Nyx.
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
    this.fireOctopusBall(_muzzlePos, _muzzleDir, OCTOPUS_BALL_DAMAGE * this.speedMult, 0, false);
    internal.octopusShootTimer = this.octopusClipSec(
      internal,
      'octopus_shoot_ball',
      OCTOPUS_SHOOT_CLIP_SEC,
    );
    internal.octopusForceRestart = true;
    enemy.attackTimer = OCTOPUS_SHOOT_INTERVAL / this.speedMult;
  }

  /**
   * Bola de tinta ácida del pool (shader rojo ácido/energético): física
   * 30 m/s con deceleración constante de -1 m/s² y auto-aim leve opcional
   * (solo las 15 de la dispersión de la Bola Gigante). Capturable por el
   * Campo Gravitacional de Nyx.
   */
  private fireOctopusBall(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    damage: number,
    autoAimRate: number,
    giant: boolean,
  ): void {
    const projectile = this.projectiles.find((p) => !p.active && !p.captured);
    if (!projectile) {
      return;
    }
    _shotDir.copy(dir).normalize();
    projectile.active = true;
    projectile.kind = giant ? 'ink_giant' : 'ink_ball';
    projectile.damage = damage;
    projectile.decel = OCTOPUS_BALL_DECEL;
    projectile.autoAimRate = autoAimRate;
    projectile.captured = false;
    projectile.life = PROJECTILE_LIFE_SEC;
    projectile.velocity.copy(_shotDir).multiplyScalar(OCTOPUS_BALL_INIT_SPEED);
    projectile.mesh.material = this.inkProjectileMaterial;
    projectile.mesh.scale.setScalar(giant ? OCTOPUS_GIANT_SCALE : 1);
    projectile.mesh.position.copy(origin).addScaledVector(_shotDir, giant ? 2.4 : 1.2);
    projectile.mesh.visible = true;
  }

  /**
   * Detonación de la Bola Gigante: encola las 15 bolas rojas que se abren
   * brevemente en abanico y se lanzan hacia Nyx en 5 ráfagas sucesivas de 3.
   */
  private enqueueOctopusSplit(origin: THREE.Vector3): void {
    for (const burst of this.octopusSplits) {
      if (burst.active) {
        continue;
      }
      burst.active = true;
      burst.shotsLeft = OCTOPUS_SPLIT_TOTAL;
      burst.timer = 0; // Primera ráfaga inmediata.
      burst.origin.copy(origin);
      return;
    }
    // Sin slot libre (3ª explosión simultánea): las 15 en un único abanico.
    _shotDir.set(0, 0, 1);
    for (let i = 0; i < OCTOPUS_SPLIT_TOTAL; i++) {
      _perp.crossVectors(_shotDir, _up).normalize();
      _aimDir.copy(_shotDir).addScaledVector(_perp, (i - 7) * 0.055).normalize();
      this.fireOctopusBall(origin, _aimDir, OCTOPUS_BALL_DAMAGE * this.speedMult, OCTOPUS_SPLIT_AUTOAIM, false);
    }
  }

  /** Ráfagas sucesivas de 3 en 3 de la Bola Gigante detonada. */
  private updateOctopusSplitBursts(dt: number, playerPos: THREE.Vector3): void {
    for (const burst of this.octopusSplits) {
      if (!burst.active) {
        continue;
      }
      burst.timer -= dt;
      if (burst.timer > 0) {
        continue;
      }
      _shotDir.subVectors(playerPos, burst.origin);
      if (_shotDir.lengthSq() < 1e-4) {
        _shotDir.set(0, 0, 1);
      } else {
        _shotDir.normalize();
      }
      _perp.crossVectors(_shotDir, _up);
      if (_perp.lengthSq() < 1e-4) {
        _perp.set(1, 0, 0);
      } else {
        _perp.normalize();
      }
      for (let i = 0; i < OCTOPUS_SPLIT_BURST; i++) {
        const offset = (i - (OCTOPUS_SPLIT_BURST - 1) / 2) * OCTOPUS_SPLIT_SPREAD;
        _aimDir.copy(_shotDir).addScaledVector(_perp, offset).normalize();
        this.fireOctopusBall(
          burst.origin,
          _aimDir,
          OCTOPUS_BALL_DAMAGE * this.speedMult,
          OCTOPUS_SPLIT_AUTOAIM,
          false,
        );
      }
      burst.shotsLeft -= OCTOPUS_SPLIT_BURST;
      if (burst.shotsLeft <= 0) {
        burst.active = false;
      } else {
        burst.timer = OCTOPUS_SPLIT_GAP;
      }
    }
  }

  /**
   * Bolas de Doble Filo (Campo Gravitacional): captura todas las bolas de
   * tinta ácida (base o de las 15 de la Bola Gigante) dentro de `radius` de
   * `center` EN VEZ de coger rocas. Salen del pool (quedan visibles en
   * escena) y pasan a orbitar a Nyx como proyectiles pequeños.
   */
  captureInkBallsInRadius(center: THREE.Vector3, radius: number): THREE.Mesh[] {
    const captured: THREE.Mesh[] = [];
    for (const projectile of this.projectiles) {
      if (!projectile.active || projectile.captured || projectile.kind !== 'ink_ball') {
        continue;
      }
      if (projectile.mesh.position.distanceTo(center) > radius) {
        continue;
      }
      projectile.active = false;
      projectile.captured = true;
      projectile.life = 0;
      projectile.decel = 0;
      projectile.autoAimRate = 0;
      captured.push(projectile.mesh);
    }
    return captured;
  }

  /**
   * Devuelve al pool una bola de tinta capturada que DomeSkills ya gastó
   * (impactada, expirada o campo cancelado): la entrada vuelve a estar
   * disponible para el siguiente disparo del pulpo sin fugas de capacidad.
   */
  recycleInkBallMesh(mesh: THREE.Mesh): void {
    for (const projectile of this.projectiles) {
      if (projectile.mesh !== mesh) {
        continue;
      }
      projectile.captured = false;
      this.deactivateProjectile(projectile);
      return;
    }
  }

  /**
   * Duración REAL del clip del GLB del pulpo (para cerrar los one-shots
   * exactamente al acabar). Si el clip aún no existe (export pendiente de
   * Blender), cae al estimado `fallback` — la FSM nunca se rompe.
   */
  private octopusClipSec(internal: EnemyInternal, clip: string, fallback: number): number {
    const action = internal.actions?.get(clip);
    return action ? Math.max(1 / 30, action.getClip().duration) : fallback;
  }

  /**
   * Contra-Parry del pulpo (ventana de alerta, dashTimer <= 1.0 s): anula el
   * impacto (0 daño y 0 knockback), se gira al instante para mirar a Nyx a
   * la cara y ejecuta su dash de escape (resetea el ciclo a 5.0 s). La tinta
   * a bocajarro (65 %, 5–10 s aleatorios) la aplica el game loop con la
   * duración devuelta; devuelve 0 si NO puede contra-parry (fuera de la
   * ventana: los primeros 4.0 s del ciclo son la ventana vulnerable real).
   */
  private executeOctopusCounterParry(
    enemy: ManagedWaveEnemy,
    internal: EnemyInternal,
  ): number {
    // Giro instantáneo: mira a Nyx a la cara en este mismo frame.
    _lookDir.subVectors(this.playerPosCache, internal.enemy.position);
    if (_lookDir.lengthSq() < 1e-6) {
      _lookDir.set(0, 0, 1);
    } else {
      _lookDir.normalize();
    }
    lookAtQuat(_lookDir, _up, _targetQuat);
    internal.enemy.mesh.quaternion.copy(_targetQuat);
    // Clip del contra-parry + chorro de tinta negra (sin bola roja).
    internal.octopusCounterTimer = this.octopusClipSec(
      internal,
      'octopus_counter_parry',
      OCTOPUS_COUNTER_CLIP_SEC,
    );
    internal.octopusForceRestart = true;
    this.onEnemyExplode?.(
      enemy.position.clone().addScaledVector(_lookDir, enemy.radius * 0.9),
      enemy.radius * 1.4,
      0x080310,
    );
    // Esquiva LATERAL más rápida que el dash normal (1.6x).
    _perp.crossVectors(_lookDir, _up);
    if (_perp.lengthSq() < 1e-4) {
      _perp.set(1, 0, 0);
    } else {
      _perp.normalize();
    }
    const sideSign = internal.rng() < 0.5 ? -1 : 1;
    _aimDir
      .copy(_perp)
      .multiplyScalar(sideSign)
      .addScaledVector(_up, 0.22)
      .normalize();
    internal.enemy.velocity.copy(_aimDir).multiplyScalar(OCTOPUS_DASH_SPEED * 1.6);
    internal.octopusDashActive = OCTOPUS_DASH_TIME;
    internal.octopusDashTimer = OCTOPUS_DASH_COOLDOWN_SEC;
    internal.enemy.hitFlash = Math.max(internal.enemy.hitFlash, 0.35);
    internal.enemy.entity.hitFlash = internal.enemy.hitFlash;
    return (
      INK_COUNTER_MIN_SEC + internal.rng() * (INK_COUNTER_MAX_SEC - INK_COUNTER_MIN_SEC)
    );
  }

  tryOctopusCounterParry(enemy: TestEnemySphere): number {
    const internal = this.internals.get(enemy.id);
    if (
      !internal ||
      internal.enemy.entity.archetype !== 'spiral_octopus' ||
      !internal.enemy.entity.alive ||
      this.enemiesPassive ||
      internal.octopusDashTimer > OCTOPUS_DASH_ALERT_SEC ||
      internal.octopusDashTimer < 0.1
    ) {
      return 0;
    }
    return this.executeOctopusCounterParry(internal.enemy, internal);
  }

  // -------------------------------------------------------------------------
  // Cangrejo Artillero: rediseño §7.1 — pool de láseres, aros de peligro y
  // fuego amigo + cableado FSM -> clips GLB (crossfades al estilo de la célula).
  // -------------------------------------------------------------------------

  /** Entrada libre del pool (o la propia del dueño) para un haz/aro. */
  private acquireCrabSlot<T extends { ownerId: string | null }>(slots: T[], ownerId: string): T | null {
    for (const slot of slots) {
      if (slot.ownerId === ownerId) {
        return slot;
      }
    }
    for (const slot of slots) {
      if (slot.ownerId === null) {
        slot.ownerId = ownerId;
        return slot;
      }
    }
    return null;
  }

  raycastCrabLaser(
    activeSlabs: SlabCollider[] | undefined,
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    maxDist: number,
  ): number {
    let dist = maxDist;
    // Choque contra un slab: el haz se corta donde impacta la malla real.
    const hit =
      activeSlabs && activeSlabs.length > 0
        ? raycastSlabs(activeSlabs, origin, dir, dist, this._crabLaserHit as SlabRaycastHit)
        : null;
    if (hit) {
      dist = Math.min(dist, hit.distance);
    }
    // Cruce de la esfera de la Barrera Blanca (~88.6 m): el haz muere ahí.
    // |o + t·d|² = R² con |d|=1 => t² + b·t + c = 0. Desde dentro (c < 0) la
    // raíz de SALIDA es (-b + sqrt(disc))/2; usar -b/2 (punto medio de la
    // cuerda) dejaba el haz truncado a la proyección |o·d| y el láser moría
    // decenas de metros antes de Nyx.
    const b = 2 * origin.dot(dir);
    const c = origin.lengthSq() - DOME_BARRIER_RADIUS_SQ;
    if (c < 0) {
      // Origen dentro de la cúpula: primera intersección saliendo.
      const t = (-b + Math.sqrt(b * b - 4 * c)) * 0.5;
      if (t > 0) {
        dist = Math.min(dist, t);
      }
    } else {
      // Origen fuera (casi imposible): solución entrante si apunta adentro.
      const disc = b * b - 4 * c;
      if (disc >= 0) {
        const t = (-b - Math.sqrt(disc)) * 0.5;
        if (t > 0) {
          dist = Math.min(dist, t);
        }
      }
    }
    return Math.max(0.5, dist);
  }

  showCrabLaser(
    enemyId: string,
    fire: boolean,
    from: THREE.Vector3,
    dir: THREE.Vector3,
    dist: number,
    blinkWhite: boolean,
  ): void {
    const slot = this.acquireCrabSlot(this.crabLasers, enemyId);
    if (!slot) {
      return;
    }
    const radius = fire ? CRAB_LASER_FIRE_RADIUS : CRAB_LASER_AIM_RADIUS;
    slot.mesh.visible = true;
    slot.mesh.scale.set(radius, Math.max(0.1, dist), radius);
    slot.mesh.position.copy(from).addScaledVector(dir, dist * 0.5);
    _muzzleDir.set(0, 1, 0);
    slot.mesh.quaternion.setFromUnitVectors(_muzzleDir, dir);
    slot.material.color.setHex(
      fire ? CRAB_LASER_FIRE_COLOR : blinkWhite ? 0xffffff : CRAB_LASER_AIM_COLOR,
    );
    slot.material.opacity = fire ? 0.85 : blinkWhite ? 0.95 : 0.55;
  }

  hideCrabLaser(enemyId: string): void {
    for (const slot of this.crabLasers) {
      if (slot.ownerId === enemyId) {
        slot.mesh.visible = false;
        slot.ownerId = null;
      }
    }
  }

  showCrabDangerRing(
    enemyId: string,
    pos: THREE.Vector3,
    up: THREE.Vector3,
    radius: number,
    pulse: number,
  ): void {
    const slot = this.acquireCrabSlot(this.crabDangerRings, enemyId);
    if (!slot) {
      return;
    }
    slot.mesh.visible = true;
    slot.mesh.scale.setScalar(radius);
    slot.mesh.position.copy(pos);
    _muzzleDir.set(0, 0, 1);
    slot.mesh.quaternion.setFromUnitVectors(_muzzleDir, up);
    slot.material.opacity = 0.25 + 0.45 * pulse * pulse;
  }

  hideCrabDangerRing(enemyId: string): void {
    for (const slot of this.crabDangerRings) {
      if (slot.ownerId === enemyId) {
        slot.mesh.visible = false;
        slot.ownerId = null;
      }
    }
  }

  /** Fuego amigo del rayo: 20*dt a todo enemigo vivo que cruce el haz. */
  applyCrabLaserFF(
    ownerId: string,
    from: THREE.Vector3,
    dir: THREE.Vector3,
    dist: number,
    dt: number,
  ): void {
    const damage = CRAB_LASER_DPS * dt;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const other = this.enemies[i];
      if (other.id === ownerId || !other.entity.alive) {
        continue;
      }
      const reach = other.radius + CRAB_LASER_BEAM_FF_MARGIN;
      if (crabLaserContactDistanceSq(other.position, from, dir, dist) > reach * reach) {
        continue;
      }
      // KRONOS: proyectil de entorno — puede romper UNA Estrella Dorsal (con
      // las puertas anti-skip del manager), pero jamás daña su "HP" (4 = 4
      // estrellas: la barra genérica no existe).
      if (other.entity.archetype === 'kronos_leviathan') {
        this.tryBreakKronosStarFromEnv(other);
        other.hitFlash = Math.max(other.hitFlash, 0.3);
        continue;
      }
      // El láser quema la carne amortiguadora y daña directo.
      other.entity.fleshThickness = Math.max(0, other.entity.fleshThickness - damage * 0.25);
      other.entity.hp -= damage;
      other.hitFlash = Math.max(other.hitFlash, 0.35);
      other.entity.hitFlash = other.hitFlash;
      if (other.entity.hp <= 0) {
        other.entity.alive = false; // La fase defensiva del bucle lo retira.
      }
    }
  }

  /** Muerte por daño interno de la IA: EXP y contabilidad del game loop. */
  private slainByEnemy(enemy: ManagedWaveEnemy): void {
    if (this.killEnemy(enemy)) {
      this.onInternalKill?.(enemy);
    }
  }

  /** Anillo de daño/empuje de la detonación según la distancia al epicentro. */
  private static kamikazeBand(dist: number): readonly [number, number] {
    if (dist <= 3.0) {
      return CRAB_KAMIKAZE_BANDS[0];
    }
    return dist <= 5.0 ? CRAB_KAMIKAZE_BANDS[1] : CRAB_KAMIKAZE_BANDS[2];
  }

  /**
   * Detonación del protocolo kamikaze: anillos de daño/empuje a Nyx (con
   * hit_stagger vía onGolemSmash), fuego amigo a los enemigos en 10 m
   * (mismos anillos), rotura del slab donde detona (escombros agarrables
   * vía onSlabSmash, mecánica compartida con el Gólem) y autoinmolación:
   * el cangrejo muere al instante soltando solo un 25% de su EXP.
   */
  detonateCrabKamikaze(
    enemy: ManagedWaveEnemy,
    internal: EnemyInternal,
    playerPos: THREE.Vector3,
    activeSlabs: SlabCollider[] | undefined,
    onGolemSmash?: (damage: number, pushDir: THREE.Vector3, pushSpeed?: number) => void,
    onSlabSmash?: (slab: SlabCollider) => void,
  ): void {
    const blast = enemy.position;
    enemy.entity.expValue *= 0.25; // Autoinmolación: solo un 25% de orbes.
    enemy.entity.alive = false;

    // Anillos a Nyx: 50/35/20 daño + 32/24/16 m/s de empuje y descontrol.
    const distNyx = blast.distanceTo(playerPos);
    if (distNyx <= CRAB_KAMIKAZE_RADIUS) {
      const [damage, push] = DomeWaveManager.kamikazeBand(distNyx);
      _aimDir.subVectors(playerPos, blast);
      if (_aimDir.lengthSq() < 1e-4) {
        _aimDir.set(0, 1, 0);
      } else {
        _aimDir.normalize();
      }
      onGolemSmash?.(damage, _aimDir, push);
    }

    // Fuego amigo: la explosión también daña a los otros enemigos en 10 m.
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const other = this.enemies[i];
      if (other === enemy || !other.entity.alive) {
        continue;
      }
      const dist = other.position.distanceTo(blast);
      if (dist > CRAB_KAMIKAZE_RADIUS) {
        continue;
      }
      const [damage, push] = DomeWaveManager.kamikazeBand(dist);
      // KRONOS: proyectil de entorno — 1 Estrella Dorsal a lo sumo (con las
      // puertas anti-skip del manager), sin tocar su "HP" (vidas = estrellas).
      if (other.entity.archetype === 'kronos_leviathan') {
        this.tryBreakKronosStarFromEnv(other);
        other.hitFlash = 1;
        other.entity.hitFlash = 1;
        continue;
      }
      other.entity.fleshThickness = Math.max(0, other.entity.fleshThickness - damage * 0.5);
      other.entity.hp -= damage;
      other.hitFlash = 1;
      other.entity.hitFlash = 1;
      _aimDir.subVectors(other.position, blast);
      if (_aimDir.lengthSq() < 1e-4) {
        _aimDir.set(0, 1, 0);
      } else {
        _aimDir.normalize();
      }
      other.velocity.addScaledVector(_aimDir, push);
      if (other.entity.hp <= 0) {
        other.entity.alive = false; // La fase defensiva del bucle lo retira.
      }
    }

    // Rompesuelos: el slab donde detona se destroza (el suyo si está pegado,
    // si no el más cercano dentro del radio de la explosión).
    if (onSlabSmash && activeSlabs && activeSlabs.length > 0) {
      let target: SlabCollider | null = null;
      if (internal.attachedSlabId) {
        for (const slab of activeSlabs) {
          if (slab.id === internal.attachedSlabId) {
            target = slab;
            break;
          }
        }
      }
      if (!target) {
        let bestDist = CRAB_KAMIKAZE_RADIUS;
        for (const slab of activeSlabs) {
          const d = slab.center.distanceTo(blast);
          if (d < bestDist) {
            target = slab;
            bestDist = d;
          }
        }
      }
      if (target) {
        onSlabSmash(target);
      }
    }

    // Estallido visible + muerte instantánea con la EXP ya reducida.
    this.hideCrabLaser(enemy.id);
    this.hideCrabDangerRing(enemy.id);
    this.onEnemyExplode?.(blast, CRAB_KAMIKAZE_RADIUS, CRAB_KAMIKAZE_EXPLODE_COLOR);
    this.slainByEnemy(enemy);
  }

  /**
   * Cangrejo Artillero: crossfade del clip FSM -> GLB (al estilo de la célula
   * abisal) más los fx de estado que viven fuera de la FSM: star_core rojo
   * incandescente durante el cebado kamikaze y carga del cañón en el
   * telegraph de la ráfaga y el sellado del láser.
   */
  private updateCrabPose(
    enemy: ManagedWaveEnemy,
    internal: EnemyInternal,
    dt: number,
    elapsed: number,
  ): void {
    // star_core: parpadeo frenético rojo incandescente al cebarse (el clip
    // kamikaze nunca debe tocar su escala; el brillo es material).
    const prime = internal.crabState === 'kamikaze_prime';
    for (const material of internal.starMaterials) {
      if (prime) {
        const t01 = Math.min(1, internal.crabTimer / 1.1);
        material.uniforms.uColor.value.setHex(0xff2214);
        material.uniforms.uRimColor.value.setHex(0xff5533);
        material.uniforms.uEmissiveBoost.value =
          0.8 + Math.abs(Math.sin(elapsed * (26 + 62 * t01))) * (0.9 + 2.4 * t01);
      } else {
        material.uniforms.uColor.value.setHex(STAR_CORE_COLOR);
        material.uniforms.uRimColor.value.setHex(STAR_CORE_RIM);
        material.uniforms.uEmissiveBoost.value = STAR_CORE_EMISSIVE;
      }
    }

    // Cañón: chispazo en la ráfaga y carga creciente en el sellado del láser.
    const cannon = internal.cannonMaterial;
    if (cannon) {
      let boost = 0;
      if (internal.crabState === 'laser_aim' && internal.crabTimer > 1.65) {
        boost = 0.6 + Math.sin(internal.crabTimer * 40) * 0.45;
      } else if (internal.crabState === 'burst' && internal.crabTimer < 0.25) {
        boost = 0.4 + Math.abs(Math.sin(internal.crabTimer * 30)) * 1.1;
      } else if (internal.crabState === 'laser_fire') {
        boost = 1.35;
      }
      cannon.uniforms.uEmissiveBoost.value = boost;
    }

    if (internal.crabHitTimer > 0) {
      internal.crabHitTimer = Math.max(0, internal.crabHitTimer - dt);
    }

    // Cableado de los 10 clips: solo si el GLB trae clips (mixer presente).
    if (!internal.mixer) {
      return;
    }
    let clipName: string;
    if (internal.crabHitTimer > 0) {
      clipName = 'crab_hit';
    } else if (internal.crabState === 'kamikaze_prime') {
      clipName = 'crab_kamikaze_prime';
    } else if (internal.crabState === 'laser_aim') {
      clipName = 'crab_laser_charge';
    } else if (internal.crabState === 'laser_fire') {
      clipName = 'crab_laser_fire_loop';
    } else if (internal.crabState === 'burst') {
      clipName = 'crab_burst_shoot';
    } else if (internal.jump) {
      // Despegue (0.25 s) -> pataleo en el aire hasta aterrizar.
      clipName = internal.jump.time <= 0.25 ? 'crab_jump_launch' : 'crab_jump_air_loop';
    } else if (internal.crabLandTimer > 0) {
      clipName = 'crab_jump_land';
    } else if (enemy.velocity.lengthSq() > 9) {
      clipName = 'crab_scuttle_loop'; // Deslizándose por knockback.
    } else {
      clipName = 'crab_idle_breathe';
    }
    this.crossfadeEnemyAction(internal, clipName, 0.12);
  }

  // -------------------------------------------------------------------------
  // Leviatán KRONOS: serpenteo con huesos + 3 patrones de ataque (sección 6.4)
  // -------------------------------------------------------------------------

  /**
   * Máquina de estados de los 3 ataques de KRONOS:
   * 1. Tramo Devorasuelos — embiste en línea atravesando la arena; los suelos
   *    flotantes que cruza cerca se rompen en escombros agarrables (onSlabSmash).
   * 2. Anillos de Contención — abre el hueso `jaw` (~0.8 s de telegraph) y emite
   *    1–3 ondas circulares expansivas que empujan a Nyx hacia la Barrera.
   * 3. Enrosco Gravitatorio — bajo el 50% de vida orbita el centro de la cúpula
   *    disparando una espiral continua de esferas oscuras mientras protege sus
   *    segmentos internos (carne al máximo).
   */
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
   * nace en el borde de la esfera del enemigo. Con `dirOverride` (espiral del
   * Enrosco de KRONOS) sale en esa dirección exacta en vez de apuntar a Nyx.
   */
  fireProjectile(
    enemy: ManagedWaveEnemy,
    playerPos: THREE.Vector3,
    kind: 'dark' | 'ink_ball' | 'ink_giant' | 'laser',
    damage: number,
    speed: number,
    spreadRad = 0,
    origin?: THREE.Vector3,
    dirOverride?: THREE.Vector3,
  ): void {
    const projectile = this.projectiles.find((p) => !p.active && !p.captured);
    if (!projectile) {
      return;
    }
    const from = origin ?? enemy.position;
    if (dirOverride) {
      _shotDir.copy(dirOverride);
    } else {
      _shotDir.subVectors(playerPos, from);
      if (_shotDir.lengthSq() < 1e-4) {
        _shotDir.set(0, 0, 1);
      } else {
        _shotDir.normalize();
      }
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
    projectile.decel = 0;
    projectile.autoAimRate = 0;
    projectile.captured = false;
    projectile.velocity.copy(_shotDir).multiplyScalar(speed);
    projectile.mesh.material =
      kind === 'ink_ball' || kind === 'ink_giant'
        ? this.inkProjectileMaterial
        : kind === 'laser'
          ? this.laserProjectileMaterial
          : this.darkProjectileMaterial;
    // Perla láser algo menor que la esfera oscura estándar del pool.
    projectile.mesh.scale.setScalar(kind === 'laser' ? 0.55 : 1);
    projectile.mesh.position.copy(from).addScaledVector(
      _shotDir,
      origin ? 0.35 : enemy.radius + 0.6,
    );
    projectile.mesh.visible = true;
  }

  private updateProjectiles(
    dt: number,
    playerPos: THREE.Vector3,
    activeSlabs: SlabCollider[],
    onPlayerHit: (damage: number) => void,
    onOctopusInk: (durationSec: number, opacity: number) => void,
  ): void {
    for (const projectile of this.projectiles) {
      if (!projectile.active) {
        continue;
      }
      projectile.life -= dt;

      // Tinta ácida del pulpo: velocidad con deceleración constante de
      // -1.0 m/s² (speed = max(0, 30 - 1.0 * t)) y auto-aim leve (solo las
      // 15 de la dispersión de la Bola Gigante).
      if (projectile.decel > 0) {
        const speed = projectile.velocity.length();
        if (speed > 1e-4) {
          const newSpeed = Math.max(0, speed - projectile.decel * dt);
          if (projectile.autoAimRate > 0) {
            _aimDir.subVectors(playerPos, projectile.mesh.position);
            if (_aimDir.lengthSq() > 1e-4) {
              _aimDir.normalize();
              _shotDir.copy(projectile.velocity).multiplyScalar(1 / speed);
              const angle = _shotDir.angleTo(_aimDir);
              if (angle > 1e-4) {
                _shotDir.lerp(_aimDir, Math.min(1, (projectile.autoAimRate * dt) / angle)).normalize();
              }
              projectile.velocity.copy(_shotDir).multiplyScalar(newSpeed);
            }
          } else {
            projectile.velocity.multiplyScalar(newSpeed / speed);
          }
        }
      }

      projectile.mesh.position.addScaledVector(projectile.velocity, dt);

      // Colisión contra suelos flotantes: las bolas no atraviesan los slabs.
      const ballRadius = projectile.mesh.scale.x * 0.55;
      if (resolveSphereSlabCollision(activeSlabs, projectile.mesh.position, ballRadius, _slabContact)) {
        if (projectile.kind === 'ink_ball' || projectile.kind === 'ink_giant') {
          this.onEnemyExplode?.(
            projectile.mesh.position.clone(),
            projectile.kind === 'ink_giant' ? 2.8 : 1.3,
            OCTOPUS_GIANT_EXPLODE_COLOR,
          );
        }
        this.deactivateProjectile(projectile);
        continue;
      }

      // Bola Gigante: detonación por proximidad al entrar a ≤ 12.0 m de la
      // hitbox de Nyx — se divide en 15 bolas (5 ráfagas sucesivas de 3).
      if (projectile.kind === 'ink_giant') {
        const distNyx = projectile.mesh.position.distanceTo(playerPos);
        if (distNyx <= OCTOPUS_GIANT_DETONATE_DIST + PROJECTILE_PLAYER_RADIUS) {
          this.onEnemyExplode?.(
            projectile.mesh.position.clone(),
            OCTOPUS_GIANT_DETONATE_DIST,
            OCTOPUS_GIANT_EXPLODE_COLOR,
          );
          this.enqueueOctopusSplit(projectile.mesh.position);
          this.deactivateProjectile(projectile);
          continue;
        }
      }

      const hitPlayer =
        projectile.mesh.position.distanceTo(playerPos) <
        PROJECTILE_PLAYER_RADIUS + projectile.mesh.scale.x * 0.55;
      const outOfBounds = projectile.mesh.position.length() > PROJECTILE_BOUND_RADIUS;

      if (hitPlayer) {
        if (projectile.kind === 'ink_ball' || projectile.kind === 'ink_giant') {
          // Bola de tinta ácida: daño directo (8 HP) + mancha negra en el HUD
          // (55 % de opacidad durante 3.0 s) con DoT ácido de 4 HP/s.
          onPlayerHit(projectile.damage);
          onOctopusInk(INK_STAIN_SEC, INK_STAIN_OPACITY);
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
    projectile.decel = 0;
    projectile.autoAimRate = 0;
  }

  private deactivateAllProjectiles(): void {
    for (const projectile of this.projectiles) {
      // Las bolas capturadas por el Campo Gravitacional ya no son del pool:
      // orbitan a Nyx como proyectiles pequeños (DomeSkills las libera).
      if (projectile.captured) {
        continue;
      }
      this.deactivateProjectile(projectile);
    }
    // Tandas de dispersión pendientes: sin bolas de origen, no hay ráfagas.
    for (const burst of this.octopusSplits) {
      burst.active = false;
      burst.shotsLeft = 0;
      burst.timer = 0;
    }
  }

  // -------------------------------------------------------------------------
  // Movimiento y pose procedural
  // -------------------------------------------------------------------------

  /**
   * Flotación estándar: bob senoidal + muelle hacia homePos (salvo dash o
   * embestida en curso) e integración de la velocidad en la posición.
   */
  applyFloatMovement(
    enemy: ManagedWaveEnemy,
    internal: EnemyInternal,
    dt: number,
    elapsed: number,
  ): void {
    // Modo Entrenamiento (saco de boxeo): sin muelle ni bob; el knockback se
    // frena solo y el enemigo queda donde lo dejes para probar física/patadas.
    if (this.enemiesPassive) {
      enemy.velocity.multiplyScalar(Math.exp(-3.5 * dt));
      enemy.position.addScaledVector(enemy.velocity, dt);
      return;
    }
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
   * Célula Abisal: crossfade del clip que corresponde a su estado de FSM
   * (sneak/flee/windup/lunge/recover/duplicate), flinch de `cell_hit` al
   * recibir daño y orientación hacia la dirección de movimiento (el lunge
   * mira el salto comprometido). Sin GLB de clips, solo orienta.
   */
  private updateCellPose(
    enemy: ManagedWaveEnemy,
    internal: EnemyInternal,
    dt: number,
    _elapsed: number,
  ): void {
    // Orientación: en windup/lunge mira el salto comprometido; si no, repta
    // de cara a su velocidad.
    if (internal.cellState === 'windup' || internal.cellState === 'lunge') {
      if (internal.cellLungeDir.lengthSq() > 1e-6) {
        _lookDir.copy(internal.cellLungeDir);
        faceTowards(enemy.mesh, _lookDir, 5.0, dt);
      }
    } else if (enemy.velocity.lengthSq() > 0.3) {
      _lookDir.copy(enemy.velocity).normalize();
      faceTowards(enemy.mesh, _lookDir, 3.0, dt);
    }

    if (!internal.actions || internal.actions.size === 0) {
      // Forma provisional sin clips (o GLB cached sin ellos: Map vacío):
      // la pose la pinta el wobble global.
      return;
    }

    // Clip deseado: el flinch de cell_hit pisa la FSM mientras dura.
    let clipName: string;
    if (internal.cellHitTimer > 0) {
      internal.cellHitTimer -= dt;
      clipName = 'cell_hit';
    } else if (this.enemiesPassive) {
      clipName = 'cell_idle_float';
    } else {
      switch (internal.cellState) {
        case 'windup':
          clipName = 'cell_windup';
          break;
        case 'lunge':
          clipName = 'cell_lunge';
          break;
        case 'recover':
          clipName = 'cell_recover';
          break;
        case 'flee':
        case 'scatter':
          clipName = 'cell_flee_loop';
          break;
        case 'duplicate':
          clipName = 'cell_duplicate';
          break;
        case 'seek':
        case 'stalk':
        default:
          clipName = 'cell_sneak_loop';
          break;
      }
    }
    this.crossfadeEnemyAction(internal, clipName, 0.12);
  }

  /**
   * Crossfade suave entre clips de un enemigo. Con `force` reinicia el clip
   * aunque ya se esté reproduciendo (one-shots que la FSM re-dispara, como
   * dos puñetazos seguidos del Gólem sin otro clip de por medio).
   */
  private crossfadeEnemyAction(
    internal: EnemyInternal,
    clipName: string,
    fadeSec: number,
    force = false,
  ): void {
    const actions = internal.actions;
    if (!actions) {
      return;
    }
    const next = actions.get(clipName);
    if (!next) {
      // Diagnóstico (una vez por nombre): la FSM pide un clip que el GLB no
      // trae — GLB viejo cacheado o nombre mal exportado.
      if (!warnedMissingActions.has(clipName)) {
        warnedMissingActions.add(clipName);
        console.warn('[DomeWaveManager] missing animation action:', clipName);
      }
      return;
    }
    if (next === internal.currentClipAction && !force) {
      return;
    }
    const prev = internal.currentClipAction;
    if (prev && prev !== next) {
      prev.fadeOut(fadeSec);
    }
    next.reset();
    next.fadeIn(fadeSec).play();
    internal.currentClipAction = next;
  }

  /**
   * Pulpo Espiral (rediseño): orientación hacia Nyx con balanceo en espiral,
   * brillo de advertencia del star_core en la ventana de alerta y el
   * cableado de los 7 clips del GLB con crossfade de 0.12 s:
   *   octopus_idle_observe (bucle), octopus_pre_dash_ready (bucle, alerta),
   *   octopus_dash_propel, octopus_shoot_ball, octopus_giant_charge,
   *   octopus_counter_parry y octopus_hit (one-shots).
   * Sin clips en el GLB (export pendiente), cae al fallback seguro
   * procedural de tentáculos — la FSM no se rompe.
   */
  private updateOctopusPose(
    enemy: ManagedWaveEnemy,
    internal: EnemyInternal,
    dt: number,
    elapsed: number,
    playerPos: THREE.Vector3,
  ): void {
    // Relojes de los one-shots del pulpo (flinch, contra-parry, disparo).
    internal.octopusHitTimer = Math.max(0, internal.octopusHitTimer - dt);
    internal.octopusCounterTimer = Math.max(0, internal.octopusCounterTimer - dt);
    internal.octopusShootTimer = Math.max(0, internal.octopusShootTimer - dt);

    // Ventana de alerta (último segundo del ciclo): Listo para Contra-Parry.
    const alert =
      !this.enemiesPassive && internal.octopusDashTimer <= OCTOPUS_DASH_ALERT_SEC;

    // star_core: brillo de advertencia creciente durante la alerta.
    for (const material of internal.starMaterials) {
      if (alert) {
        material.uniforms.uColor.value.setHex(0xff2214);
        material.uniforms.uRimColor.value.setHex(0xff5533);
        material.uniforms.uEmissiveBoost.value =
          0.9 + Math.abs(Math.sin(elapsed * (14 + 26 * (1 - internal.octopusDashTimer)))) * 1.6;
      } else {
        material.uniforms.uColor.value.setHex(STAR_CORE_COLOR);
        material.uniforms.uRimColor.value.setHex(STAR_CORE_RIM);
        material.uniforms.uEmissiveBoost.value = STAR_CORE_EMISSIVE;
      }
    }

    // Encara a Nyx (cámara lenta de giro) + espiral del cuerpo.
    _lookDir.subVectors(playerPos, enemy.position);
    if (_lookDir.lengthSq() < 1e-6) {
      _lookDir.set(0, 0, 1);
    } else {
      _lookDir.normalize();
    }
    lookAtQuat(_lookDir, _up, _targetQuat);
    _rollQuat.setFromAxisAngle(
      _lookDir,
      Math.sin(elapsed * OCTOPUS_SPIRAL_SPEED + enemy.phase) * OCTOPUS_SPIRAL_TILT,
    );
    _targetQuat.premultiply(_rollQuat);
    const turnRate = internal.octopusCounterTimer > 0 ? 40.0 : OCTOPUS_TURN_RATE;
    enemy.mesh.quaternion.slerp(_targetQuat, 1 - Math.exp(-turnRate * dt));

    if (!internal.actions || internal.actions.size === 0) {
      // Fallback seguro sin clips (GLB aún sin exportar): oscilación
      // procedural de los tentáculos sobre su pose de reposo.
      for (let i = 0; i < internal.tentacles.length; i++) {
        const tentacle = internal.tentacles[i];
        _legWaveQuat.setFromAxisAngle(
          _legWaveAxis,
          Math.sin(elapsed * TENTACLE_WAVE_SPEED + enemy.phase + i) * tentacle.amplitude,
        );
        tentacle.bone.quaternion.copy(tentacle.rest).multiply(_legWaveQuat);
      }
      return;
    }

    // --- Cableado FSM -> clips GLB (crossfade de 0.12 s) ---
    // Prioridad: flinch > contra-parry > carga gigante > disparo > dash >
    // alerta pre-dash > reposo observando.
    let clipName: string;
    if (internal.octopusHitTimer > 0) {
      clipName = 'octopus_hit';
    } else if (internal.octopusCounterTimer > 0) {
      clipName = 'octopus_counter_parry';
    } else if (internal.octopusGiantWindup > 0) {
      clipName = 'octopus_giant_charge';
    } else if (internal.octopusShootTimer > 0) {
      clipName = 'octopus_shoot_ball';
    } else if (internal.octopusDashActive > 0) {
      clipName = 'octopus_dash_propel';
    } else if (alert) {
      clipName = 'octopus_pre_dash_ready';
    } else {
      clipName = 'octopus_idle_observe';
    }
    const force = internal.octopusForceRestart;
    internal.octopusForceRestart = false;
    this.crossfadeEnemyAction(internal, clipName, 0.12, force);
  }

  /** Compone una rotación euleriana sobre la pose de reposo de un hueso. */
  poseBone(bone: EnemyBone | null, rotX: number, rotY: number, rotZ: number): void {
    if (!bone) {
      return;
    }
    _boneEuler.set(rotX, rotY, rotZ);
    _boneQuat.setFromEuler(_boneEuler);
    bone.bone.quaternion.copy(bone.rest).multiply(_boneQuat);
  }

  /**
   * Ave Legendaria Cristalizada: encara a Nyx, aleteo potente y coordinado de
   * las 4 alas (acelera antes del picado/embestida), movimiento orgánico de
   * cuello/cabeza/cola y apertura del hueso `jaw` durante la ráfaga, con el
   * star_core_mouth brillando al quedar expuesto.
   */
  private updateSparrowPose(
    enemy: ManagedWaveEnemy,
    internal: EnemyInternal,
    dt: number,
    elapsed: number,
    playerPos: THREE.Vector3,
  ): void {
    // Encara a Nyx con giro suave (también con la forma provisional).
    _lookDir.subVectors(playerPos, enemy.position);
    if (_lookDir.lengthSq() < 1e-6) {
      _lookDir.set(0, 0, 1);
    } else {
      _lookDir.normalize();
    }
    faceTowards(enemy.mesh, _lookDir, SPARROW_TURN_RATE, dt);

    const rig = internal.sparrowRig;
    if (!rig) {
      return;
    }

    // Aleteo coordinado: fase integrada para acelerar sin saltos bruscos.
    const preDive =
      internal.nextAttack === 'charge' && enemy.attackTimer > 0 && enemy.attackTimer < 0.7;
    const flapSpeed =
      internal.chargeTimer > 0 || preDive
        ? SPARROW_FLAP_SPEED_DIVE
        : internal.burstTimer > 0
          ? SPARROW_FLAP_SPEED_BURST
          : SPARROW_FLAP_SPEED_BASE;
    internal.flapPhase += flapSpeed * dt;
    const flap = Math.sin(internal.flapPhase);
    const flapLag = Math.sin(internal.flapPhase + 0.7);
    const flapQuad = Math.sin(internal.flapPhase + Math.PI * 0.5);
    this.poseBone(rig.wingTopLInner, flap * 0.5, 0, flap * 0.1);
    this.poseBone(rig.wingTopLOuter, flapLag * 0.75, 0, flapLag * 0.14);
    this.poseBone(rig.wingTopRInner, flap * 0.5, 0, -flap * 0.1);
    this.poseBone(rig.wingTopROuter, flapLag * 0.75, 0, -flapLag * 0.14);
    this.poseBone(rig.wingBotL, -flap * 0.45, 0, flapQuad * 0.08);
    this.poseBone(rig.wingBotR, -flap * 0.45, 0, -flapQuad * 0.08);

    // Cuello, cabeza y cola con vaivén orgánico independiente del aleteo.
    this.poseBone(
      rig.neck,
      Math.sin(elapsed * 0.8 + enemy.phase) * 0.09,
      Math.sin(elapsed * 1.2 + enemy.phase) * 0.14,
      0,
    );
    this.poseBone(rig.head, Math.sin(elapsed * 1.6 + enemy.phase * 1.3) * 0.2, 0, 0);
    this.poseBone(rig.tail, Math.sin(elapsed * 1.1) * 0.12, Math.sin(elapsed * 1.9 + enemy.phase) * 0.24, 0);

    // jaw: abre claramente durante la ráfaga (mouthOpen) y permanece cerrada
    // fuera de esa ventana.
    const targetOpen = enemy.entity.mouthOpen === true ? 1 : 0;
    internal.jawOpen += (targetOpen - internal.jawOpen) * Math.min(1, dt * 12);
    this.poseBone(rig.jaw, -SPARROW_JAW_OPEN_RAD * internal.jawOpen, 0, 0);

    // star_core_mouth: brilla intensamente mientras la boca está abierta.
    if (rig.mouthStarMaterial) {
      rig.mouthStarMaterial.uniforms.uEmissiveBoost.value =
        enemy.entity.mouthOpen === true
          ? 2.3 + Math.sin(elapsed * 14) * 0.3
          : STAR_CORE_EMISSIVE;
    }
  }

  /**
   * Prisma Necroz: flotación amenazante encarando a Nyx, balanceo de brazos
   * y garras prismáticas, giro de cabeza y pinchos (`detail_spikes`) que se
   * escalan hacia fuera con brillo intenso al acercarse Nyx de frente y se
   * retraen (apagados) en la ventana vulnerable.
   */
  private updatePrismaNecrozPose(
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
    faceTowards(enemy.mesh, _lookDir, PRISMA_NECROZ_TURN_RATE, dt);

    const rig = internal.prismaNecrozRig;
    if (!rig) {
      return;
    }

    // Brazos/garras prismáticas ondeando; la cabeza gira escrutando a Nyx.
    this.poseBone(rig.shoulderL, 0, 0, Math.sin(elapsed * 1.8 + enemy.phase) * 0.15);
    this.poseBone(rig.armL, Math.sin(elapsed * 1.8 + 0.5 + enemy.phase) * 0.3, 0, 0);
    this.poseBone(rig.clawL, 0, Math.sin(elapsed * 2.2 + enemy.phase) * 0.35, 0);
    this.poseBone(rig.shoulderR, 0, 0, -Math.sin(elapsed * 1.8 + 0.9 + enemy.phase) * 0.15);
    this.poseBone(rig.armR, Math.sin(elapsed * 1.8 + 1.4 + enemy.phase) * 0.3, 0, 0);
    this.poseBone(rig.clawR, 0, Math.sin(elapsed * 2.2 + 1.1 + enemy.phase) * 0.35, 0);
    this.poseBone(rig.head, Math.sin(elapsed * 0.9) * 0.06, Math.sin(elapsed * 1.1 + enemy.phase) * 0.3, 0);
    this.poseBone(rig.tail, 0, Math.sin(elapsed * 1.4 + enemy.phase) * 0.28, 0);
    this.poseBone(rig.torso, Math.sin(elapsed * 1.3) * 0.04, 0, 0);

    // Pinchos defensivos: escalan hacia fuera (~1.35) con brillo intenso si
    // Nyx se acerca de frente; retraídos (~0.15) en la ventana vulnerable.
    const spikes = rig.spikes;
    if (spikes) {
      const vulnerable = (enemy.entity.vulnerableTimer ?? 0) > 0;
      const target = vulnerable
        ? PRISMA_NECROZ_SPIKES_IN_SCALE
        : enemy.entity.spikesActive
          ? PRISMA_NECROZ_SPIKES_OUT_SCALE
          : 1;
      internal.spikeScale += (target - internal.spikeScale) * Math.min(1, dt * 6);
      spikes.mesh.scale.setScalar(spikes.restScale * internal.spikeScale);
      if (spikes.material) {
        if (enemy.entity.spikesActive) {
          spikes.material.uniforms.uRimColor.value.setHex(PRISMA_NECROZ_SPIKES_RIM);
          spikes.material.uniforms.uEmissiveBoost.value = 0.85 + Math.sin(elapsed * 11) * 0.4;
        } else {
          spikes.material.uniforms.uRimColor.value.setHex(PRISMA_NECROZ_DETAIL_RIM);
          spikes.material.uniforms.uEmissiveBoost.value = 0.05;
        }
      }
    }
  }

  /**
   * Gólem Rompesuelos (rediseño §7.4): orientación honesta por estado — el
   * helicóptero encara a Nyx, las cargas inclinan el cuerpo 90° hacia su
   * vector de avance sellado (el clip solo pone la pose + el giro
   * longitudinal sobre `root`), el exhausto gira a 10°/s reales y el remate
   * congela el cuerpo — más el cableado de los 8 clips del GLB con
   * crossfades y el telegraph material del puño neón `detail_fist`. Sin GLB
   * de clips cae al fallback procedural de poseBone (como el cangrejo).
   */
  /**
   * Parry por DISTANCIA en DOS FASES explícitas. El MANAGER es la única
   * fuente de verdad; el controller solo obedece (openParryWindow /
   * closeParryWindow vía domeGameLoop):
   *
   *  - FASE 1 (`parry_decide`): se abre cuando Nyx CRUZA hacia dentro
   *    d = α + GOLEM_PARRY_OPEN_DIST (α+9) con el gólem en block_guard y la
   *    guardia ya alzada. Slow-mo + estrella + latigazo de cámara.
   *    Salidas: llega a d <= α+2 sin Dash (lockout de 5 s, SIN cooldown
   *    largo), sale de α+9 hacia fuera o el gólem baja la guardia (cierran
   *    al instante, sin castigo), o Dash hacia la estrella → FASE 2.
   *  - FASE 2 (`parry_strike`): arranca al ejecutarse el dash al star point
   *    (AQUÍ arranca el cooldown de 18 s). Margen corto de mundo
   *    (GOLEM_PARRY_EXECUTE_SEC) para el taladro descendente. El golpe
   *    conectado cierra TODO en ese mismo frame (ver onHitEnemy); si no,
   *    solo el margen puede cerrarla.
   */
  private updateGolemParryWindow(
    enemy: ManagedWaveEnemy,
    internal: EnemyInternal,
    playerPos: THREE.Vector3,
    playerVel: THREE.Vector3,
    playerParryDashUsed: boolean,
    dt: number,
  ): void {
    const dist = enemy.position.distanceTo(playerPos);
    const openBand = enemy.radius + GOLEM_PARRY_OPEN_DIST;
    const closeBand = enemy.radius + GOLEM_PARRY_CLOSE_DIST;
    const guardUp =
      internal.golemState === 'block_guard' &&
      internal.golemBlockGuardElapsed >= GOLEM_BLOCK_RAISE_CLIP_SEC;

    if (this.golemParryTargetId === enemy.id) {
      // Ventana abierta SOBRE este gólem: reloj de seguridad de mundo.
      this.golemParryTimer = Math.max(0, this.golemParryTimer - dt);
      if (this.golemParryPhase === 'parry_decide') {
        if (playerParryDashUsed) {
          // FASE 2 — Remate: arranca al EJECUTAR el dash al star point
          // (AQUÍ, y solo aquí, arranca el cooldown largo de 18 s) y vive el
          // margen corto GOLEM_PARRY_EXECUTE_SEC de mundo para que el
          // taladro descendente conecte aunque Nyx ya esté a < α+2.
          this.golemParryPhase = 'parry_strike';
          this.golemParryTimer = GOLEM_PARRY_EXECUTE_SEC;
          internal.golemParryCd = GOLEM_PARRY_COOLDOWN_SEC;
        } else if (dist <= closeBand) {
          // FASE 1: llegó al cuerpo SIN ejecutar (α+2): ventana muerta al
          // instante y lockout de 5 s — SIN cooldown largo, de diseño no
          // puede reaparecer tras el rebote.
          this.closeGolemParryWindow(GOLEM_PARRY_LOCKOUT_SEC);
        } else if (dist > openBand) {
          // FASE 1: se fue hacia fuera de α+9: cierra SIN lockout y
          // permite reabrir al volver a cruzar la banda en guardia.
          this.closeGolemParryWindow(0);
        } else if (!guardUp) {
          // FASE 1: el gólem bajó la guardia: la oportunidad se esfuma.
          this.closeGolemParryWindow(0);
        } else if (this.golemParryTimer <= 0) {
          // Tope de seguridad: la oportunidad caducó de largo en la banda.
          this.closeGolemParryWindow(GOLEM_PARRY_LOCKOUT_SEC);
        }
      } else {
        // FASE 2 (`parry_strike`): solo el remate conectado (onHitEnemy,
        // que cierra y apaga el slow-mo EN ESE FRAME) o el fin del margen
        // corto pueden cerrar la ventana — la distancia ya no manda (el
        // dash lleva a Nyx por dentro de α+2 para golpear).
        if (this.golemParryTimer <= 0) {
          this.closeGolemParryWindow(0);
        }
      }
      internal.golemPrevPlayerDist = dist;
      return;
    }

    // FASE 1 — Apertura: ¿cruza hacia dentro la banda viniendo hacia él
    // (regla: cruce α+9 con la guardia ya alzada)?
    if (
      guardUp &&
      this.golemParryTargetId === null &&
      internal.golemParryCd <= 0 &&
      internal.golemParryLockout <= 0 &&
      internal.golemPrevPlayerDist > openBand &&
      dist <= openBand &&
      _aimDir.subVectors(enemy.position, playerPos).dot(playerVel) > 0
    ) {
      this.openGolemParryWindow(enemy, internal);
    }
    // El cruce solo cuenta mientras la guardia está alzada: fuera de
    // block_guard la distancia previa se resetea (nada de cruces "prestados"
    // de una guardia anterior).
    internal.golemPrevPlayerDist = guardUp ? dist : Number.POSITIVE_INFINITY;
  }

  /** ¿Hay ventana de parry del gólem abierta ahora mismo? */
  isGolemParryWindowOpen(): boolean {
    return this.golemParryTargetId !== null;
  }

  /** Abre la ventana de parry sobre este gólem (precondiciones duras). */
  private openGolemParryWindow(enemy: ManagedWaveEnemy, internal: EnemyInternal): void {
    if (this.golemParryTargetId !== null) {
      return; // Solo UNA ventana a la vez (otro gólem o este mismo).
    }
    if (internal.golemParryCd > 0 || internal.golemParryLockout > 0) {
      return; // Cooldown por gólem o lockout por dejar pasar la oportunidad.
    }
    if (this.golemInfo.edenRatio < GOLEM_PARRY_EDEN_RATIO) {
      return; // Nyx sin Eden no puede rematar: la ventana sería un bluff.
    }
    this.golemParryTargetId = enemy.id;
    this.golemParryEnemy = enemy;
    this.golemParryTimer = GOLEM_PARRY_WINDOW_SEC; // tope de seguridad de mundo
    this.golemParryPhase = 'parry_decide'; // FASE 1: decisión/lectura
    this.pendingParryEnemy = enemy;
    // La estrella YA existe en el frame de apertura (el harvest del update
    // clona la foto de este mismo frame, no una posición stale o a cero).
    this.updateGolemParryStar(enemy, internal);
  }

  /**
   * Cierra la ventana de parry. `lockoutSec` > 0 castiga al gólem dueño con
   * ese lockout (caso "llegó a α+2 sin ejecutar"); 0 cierra sin castigo.
   * Marca el cierre para que domeGameLoop apague el slow-mo del controller.
   */
  private closeGolemParryWindow(lockoutSec: number): void {
    if (this.golemParryTargetId === null) {
      return;
    }
    const owner = this.golemParryEnemy;
    const ownerInternal = owner ? this.internals.get(owner.id) : null;
    if (lockoutSec > 0 && ownerInternal && ownerInternal.enemy.entity.alive) {
      ownerInternal.golemParryLockout = lockoutSec;
    }
    this.golemParryTargetId = null;
    this.golemParryEnemy = null;
    this.golemParryTimer = 0;
    this.golemParryPhase = null;
    this.golemParryHalo.visible = false;
    this.golemParryClosedFlag = true;
  }

  /**
   * Cierre de la ventana de parry pendiente de consumir (una sola vez).
   * Lo encuesta domeGameLoop DOS veces por frame —antes y después de
   * controller.update— para llamar a closeParryWindow() EN EL MISMO FRAME
   * en que se produjo: cierres de la FSM del manager en su propio update y
   * golpes de remate conectados en onHitEnemy apagan el slow-mo al instante.
   */
  consumeGolemParryClose(): boolean {
    const closed = this.golemParryClosedFlag;
    this.golemParryClosedFlag = false;
    return closed;
  }

  /**
   * Punto de la estrella del parry: junto al BRAZO FINO del gólem (izquierdo),
   * sobresaliendo del cuerpo a una distancia legible respecto al jugador.
   */
  private updateGolemParryStar(enemy: ManagedWaveEnemy, internal: EnemyInternal): void {
    if (internal.golemRig && internal.golemRig.armLUpper) {
      internal.golemRig.armLUpper.bone.getWorldPosition(_starWorld);
    } else {
      _starWorld.set(-1.2, 1.5, 0).applyQuaternion(enemy.mesh.quaternion).add(enemy.position);
    }
    _starSide.subVectors(_starWorld, enemy.position);
    _starSide.y = 0;
    if (_starSide.lengthSq() < 1e-4) {
      _starSide.set(1, 0, 0);
    } else {
      _starSide.normalize();
    }
    this.golemParryStarPos
      .copy(enemy.position)
      .addScaledVector(_starSide, enemy.radius + GOLEM_PARRY_STAR_OUT);
    this.golemParryStarPos.y = _starWorld.y + GOLEM_PARRY_STAR_UP;
  }

  private updateGolemPose(
    enemy: ManagedWaveEnemy,
    internal: EnemyInternal,
    dt: number,
    elapsed: number,
    playerPos: THREE.Vector3,
  ): void {
    if (internal.golemHitTimer > 0) {
      internal.golemHitTimer = Math.max(0, internal.golemHitTimer - dt);
    }
    const state = internal.golemState;

    // Estrella dorada: solo brilla en el gólem con la ventana de parry
    // abierta, flotando JUNTO AL BRAZO MALO (el gigante) a un lado y a la
    // altura de su hombro: el punto de dash del remate. Nunca sobre la
    // cabeza ni pegada al cuerpo — tiene que quedar hueco para que Nyx
    // llegue, mire y taladre en diagonal descendente hacia el centro.
    const isParryTarget = this.golemParryTargetId === enemy.id;
    if (isParryTarget) {
      this.updateGolemParryStar(enemy, internal);
      this.golemParryHalo.visible = true;
      this.golemParryHalo.position.copy(this.golemParryStarPos);
      // Billboard hacia Nyx + giro lento de la estrella + pulso.
      this.golemParryHalo.lookAt(playerPos);
      this.golemParryHalo.rotateZ(elapsed * 1.5);
      this.golemParryHalo.scale.setScalar(1.6 * (1 + 0.14 * Math.sin(elapsed * 9)));
      this.golemParryHaloMaterial.opacity = 0.6 + 0.3 * Math.sin(elapsed * 9);
    } else if (this.golemParryTargetId === null) {
      // Ventana cerrada: ningún gólem debe llevar la estrella.
      this.golemParryHalo.visible = false;
    }

    // --- Orientación honesta del grupo raíz (los clips NUNCA la tocan) ---
    _lookDir.subVectors(playerPos, enemy.position);
    if (_lookDir.lengthSq() < 1e-6) {
      _lookDir.set(0, 1, 0);
    } else {
      _lookDir.normalize();
    }
    switch (state) {
      case 'parried':
        // Aplastamiento vertical: el cuerpo queda congelado por el golpe.
        break;

      case 'thin_windup':
      case 'thick_windup':
      case 'thin_spiral':
      case 'thick_spiral':
        // Cuerpo inclinado 90° siguiendo el vector de avance: el eje
        // corporal (falda → cabeza, bind +Y) se alinea con la dirección
        // SELLADA de la carga (en windup apunta a Nyx). Con ello la falda
        // queda atrás como propulsor y la broca/el ariete lideran. El giro
        // longitudinal (roll del taladro) lo pone el clip sobre `root`.
        _aimDir.copy(state === 'thin_spiral' || state === 'thick_spiral' ? internal.chargeDir : _lookDir);
        if (_aimDir.lengthSq() < 1e-6) {
          _aimDir.set(0, 0, 1);
        }
        _targetQuat.setFromUnitVectors(_modelUp, _aimDir);
        enemy.mesh.quaternion.slerp(_targetQuat, 1 - Math.exp(-8 * dt));
        break;

      case 'exhausted':
        // Giro honesto de 10°/s exactos (ventana real de castigo).
        lookAtQuat(_lookDir, _up, _targetQuat);
        {
          const angle = 2 * Math.acos(Math.min(1, Math.abs(enemy.mesh.quaternion.dot(_targetQuat))));
          if (angle < 1e-4) {
            break;
          }
          enemy.mesh.quaternion.slerp(
            _targetQuat,
            Math.min(1, (GOLEM_EXHAUSTED_TURN_RATE * dt) / angle),
          );
        }
        break;

      case 'block_guard':
        // La pared debe quedar perpendicular a Nyx: giro lento pesado.
        faceTowards(enemy.mesh, _lookDir, 1.0, dt);
        break;

      default:
        faceTowards(enemy.mesh, _lookDir, GOLEM_TURN_RATE, dt);
        break;
    }

    const rig = internal.golemRig;
    if (!rig) {
      return; // Forma provisional (dodecaedro): el wobble global basta.
    }

    if (internal.actions && internal.actions.size > 0) {
      // --- Cableado de los clips del GLB (crossfade FSM -> acción) ---
      const force = internal.golemRestartPending;
      internal.golemRestartPending = false;
      const blockStart = internal.actions.get('golem_block_start');
      const blockLoop = internal.actions.get('golem_block_loop');
      const blockEnd = internal.actions.get('golem_block_end');

      // Bloqueo reactivo en 3 clips (start 0.3 s one-shot -> loop ciclico ->
      // end one-shot): la costura start.final == loop.f0 es exacta (0.0 deg).
      if (
        state !== 'block_guard' &&
        blockEnd &&
        (internal.currentClipAction === blockLoop ||
          internal.currentClipAction === blockStart)
      ) {
        // La FSM acaba de bajar la pared: arranca la bajada (one-shot) y el
        // clip del estado espera a que termine (ver guard de abajo).
        this.crossfadeEnemyAction(internal, 'golem_block_end', 0.06);
      }
      if (
        internal.currentClipAction === blockEnd &&
        blockEnd.time < blockEnd.getClip().duration - 1 / 30
      ) {
        // La pared sigue bajando: no pises la salida con el clip del estado.
        return;
      }

      let clipName: string;
      let fadeSec = 0.12;
      if (state === 'parried') {
        clipName = 'golem_parried_head_hit';
        fadeSec = 0.04;
      } else if (internal.golemHitTimer > 0) {
        clipName = 'golem_hit';
        fadeSec = 0.06;
      } else if (state === 'exhausted') {
        clipName = 'golem_exhausted_loop';
        fadeSec = 0.3;
      } else if (state === 'thin_windup' || state === 'thin_spiral') {
        clipName = 'golem_thin_spiral';
      } else if (state === 'thick_windup' || state === 'thick_spiral') {
        clipName = 'golem_thick_spiral';
      } else if (
        state === 'punch_windup' ||
        state === 'punch_smash' ||
        state === 'punch_recover'
      ) {
        clipName = 'golem_brute_punch';
        fadeSec = force ? 0.08 : 0.12;
      } else if (state === 'block_guard' && blockStart && blockLoop) {
        // Pared REACTIVA: entrada -> subida one-shot; terminada la subida ->
        // bucle ciclico mientras la FSM mantenga la guardia (0.78 s sin
        // amenaza; rearmada mientras Nyx apunte/ataque).
        if (internal.currentClipAction === blockStart) {
          if (blockStart.time >= blockStart.getClip().duration - 1 / 30) {
            // Subida completa: pasa al bucle de pared sostenida.
            this.crossfadeEnemyAction(internal, 'golem_block_loop', 0.1);
            return;
          }
          return; // Sigue subiendo la pared.
        }
        if (internal.currentClipAction !== blockLoop) {
          // Entrada fresca a la guardia (desde helicóptero/windup/etc.):
          // reset forzado de la subida (dos guardias seguidas no quedan
          // clampadas a media subida). El parry solo abre al impactar el golpe.
          this.crossfadeEnemyAction(internal, 'golem_block_start', 0.08, true);
        }
        return; // Ya en el bucle: la pared se sostiene sola.
      } else {
        clipName = 'golem_helicopter_loop';
        fadeSec = 0.3; // El rotor tarda en arrancar/pararse: fundido largo.
      }
      this.crossfadeEnemyAction(internal, clipName, fadeSec, force);
    } else {
      // --- Fallback procedural sin clips (pose por estado) ---
      let armTarget = 0;
      let twistTarget = 0;
      let lambda = 3;
      switch (state) {
        case 'punch_windup':
          armTarget = -1.15;
          twistTarget = -0.55;
          lambda = 5;
          break;
        case 'punch_smash':
          armTarget = 0.62;
          twistTarget = 0.28;
          lambda = 26;
          break;
        case 'block_guard':
          armTarget = -0.35;
          twistTarget = 0.5;
          lambda = 5;
          break;
        case 'parried':
          armTarget = -0.9;
          lambda = 12;
          break;
        case 'exhausted':
          armTarget = 0.25;
          lambda = 2;
          break;
        default:
          break;
      }
      const blend = 1 - Math.exp(-lambda * dt);
      internal.golemArmAngle += (armTarget - internal.golemArmAngle) * blend;
      internal.golemTwist += (twistTarget - internal.golemTwist) * blend;
      const arm = internal.golemArmAngle;
      const twist = internal.golemTwist;
      // Falda estrellada como rotor: giro continuo en helicóptero (1 vuelta
      // cada 1.2 s) y drill longitudinal en las cargas; parado en exhausto.
      let skirtSpin = 0;
      if (state === 'helicopter') {
        skirtSpin = (elapsed * 5.24) % (Math.PI * 2);
      } else if (state === 'thin_spiral') {
        skirtSpin = (elapsed * 31.4) % (Math.PI * 2);
      } else if (state === 'thick_spiral') {
        skirtSpin = (elapsed * 12.6) % (Math.PI * 2);
      }
      this.poseBone(rig.root, 0, skirtSpin, 0);
      this.poseBone(rig.spine, Math.abs(twist) * 0.25, twist, 0);
      this.poseBone(rig.chest, 0, twist * 0.55, 0);
      this.poseBone(rig.head, Math.sin(elapsed * 0.7 + enemy.phase) * 0.08, -twist * 0.45, 0);
      this.poseBone(rig.giantShoulderR, arm, 0, 0);
      this.poseBone(rig.giantArmR, arm * 0.5, 0, 0);
      this.poseBone(rig.giantFistR, arm * 0.3, 0, 0);
      if (state === 'thin_windup' || state === 'thin_spiral') {
        // Broca: brazo izquierdo estirado al frente.
        this.poseBone(rig.armLUpper, -1.35, 0, 0);
        this.poseBone(rig.armLLower, -0.15, 0, 0);
      } else {
        this.poseBone(rig.armLUpper, 0, 0, Math.sin(elapsed * 0.9 + enemy.phase) * 0.05);
        this.poseBone(rig.armLLower, Math.sin(elapsed * 1.2 + enemy.phase) * 0.06, 0, 0);
      }
    }

    // detail_fist: telegraph material (neón creciente) — SIEMPRE en código,
    // clips prohibidos de tocar emisivo/escala del puño.
    const fist = rig.fist;
    if (fist) {
      let boost = 0.05;
      let pulse = 1;
      if (state === 'punch_windup') {
        const w = 1 - internal.golemTimer / GOLEM_PUNCH_WINDUP_SEC;
        boost = 0.35 + w * (1.15 + Math.sin(elapsed * 20) * 0.45);
        pulse = 1 + w * 0.15;
      } else if (state === 'punch_smash') {
        boost = 1.6;
      } else if (state === 'thick_windup') {
        const w = 1 - internal.golemTimer / GOLEM_THICK_WINDUP_SEC;
        boost = 0.9 + w * 0.5;
        pulse = 1 + w * 0.12;
      } else if (state === 'thick_spiral') {
        // Ariete: puño neón encendido al máximo.
        boost = 1.45 + Math.sin(elapsed * 18) * 0.15;
        pulse = 1 + Math.sin(elapsed * 18) * 0.08;
      } else if (state === 'parried') {
        boost = 1.2;
      } else if (state === 'block_guard') {
        boost = 0.35;
      }
      fist.mesh.scale.setScalar(fist.restScale * pulse);
      if (fist.material) {
        fist.material.uniforms.uEmissiveBoost.value = boost;
        fist.material.uniforms.uRimColor.value.setHex(GOLEM_FIST_NEON_RIM);
      }
    }
  }

  private clearEnemies(): void {
    for (const enemy of [...this.enemies]) {
      // Sin animación: al reiniciar la oleada los cuerpos se van de golpe.
      this.killEnemy(enemy, false);
    }
    this.enemies.length = 0;
    this.internals.clear();
    this.cellDirector.reset();
    for (const dying of this.dying) {
      this.scene.remove(dying.mesh);
      for (const material of dying.materials) material.dispose();
    }
    this.dying.length = 0;
    // KRONOS fuera de escena: sin portales, sin anillos, sin efectos sobre
    // Nyx (el game loop empuja este estado al controller en el mismo frame).
    deactivateKronosPortals(this);
    this.resetKronosNyxEffects();
  }

  /**
   * Apaga TODOS los efectos de cosmos_fusion sobre Nyx y el slow-mo de la
   * Fase 4 (muerte del boss, fin de oleada, modo pasivo, etc.).
   */
  private resetKronosNyxEffects(): void {
    this.kronosNyxEffects.deformActive = false;
    this.kronosNyxEffects.cameraShake = 0;
    this.kronosNyxEffects.controlsInverted = false;
    this.kronosNyxEffects.phase4 = false;
    this.kronosNyxEffects.shakePulse = 0;
    this.kronosNyxEffects.voidFlashPulse = 0;
  }

  // -------------------------------------------------------------------------
  // Leviatán KRONOS (rediseño): rotura de Estrellas Dorsales
  // -------------------------------------------------------------------------

  /**
   * Efectos de cosmos_fusion sobre Nyx (Fase 4) que el game loop empuja al
   * controller cada frame. El loop consume los pulsos tras aplicarlos.
   */
  getKronosNyxEffects(): KronosNyxEffects {
    return this.kronosNyxEffects;
  }

  /** ¿Vive KRONOS en Fase 4? (slow-mo global continuo timeScale = 0.75). */
  isKronosPhase4Active(): boolean {
    return this.kronosNyxEffects.phase4;
  }

  /**
   * V_base de Nyx sin pasivas: la fija el game loop con
   * controller.getBaseMaxSpeed() (FLOAT_MAX_SPEED). Por defecto usa esa
   * misma constante (Modo Entrenamiento sin controller enganchado).
   */
  setKronosBaseMaxSpeed(vBase: number): void {
    if (vBase > 0) {
      this.kronosBaseMaxSpeed = vBase;
    }
  }

  /**
   * Rotura de Estrella Dorsal por impacto CINÉTICO de Nyx (Patada Taladro o
   * velocidad > umbral cinético) o por el barrido de las hitboxes de la
   * cadena. Puertas anti-skip: Fase 4 invulnerable y ~0.5 s de
   * invulnerabilidad de transición (nunca más de 1 estrella por uso).
   */
  tryBreakKronosStar(enemy: ManagedWaveEnemy, impactSpeed: number, isDrill: boolean): boolean {
    const internal = this.internals.get(enemy.id);
    if (!internal || !enemy.entity.alive) {
      return false;
    }
    const k = internal.kronos;
    if (k.phase4) {
      return false; // Fase 4: invulnerable al daño.
    }
    if (k.starInvulnSec > 0) {
      return false; // Invulnerabilidad de transición (~0.5 s por rotura).
    }
    if (!isDrill && impactSpeed < 18) {
      return false; // Sin taladro y sin velocidad: no rompe.
    }
    return applyKronosStarBreak(internal.enemy, internal, this.kronosNyxEffects);
  }

  /**
   * Rotura de Estrella Dorsal por HABILIDAD gravitatoria (Campo
   * Gravitacional, agujero negro, Implosión legendaria...): sin umbral de
   * velocidad, pero con las MISMAS puertas anti-skip (1 por uso; las skills
   * de daño continuo quedan limitadas por la invulnerabilidad de transición).
   */
  tryBreakKronosStarFromSkill(enemy: ManagedWaveEnemy): boolean {
    const internal = this.internals.get(enemy.id);
    if (!internal || !enemy.entity.alive) {
      return false;
    }
    const k = internal.kronos;
    if (k.phase4 || k.starInvulnSec > 0) {
      return false;
    }
    return applyKronosStarBreak(internal.enemy, internal, this.kronosNyxEffects);
  }

  /**
   * Rotura de Estrella Dorsal por PROYECTIL DE ENTORNO (fuego amigo del láser
   * del cangrejo, detonación kamikaze). Mismas puertas anti-skip.
   */
  tryBreakKronosStarFromEnv(enemy: ManagedWaveEnemy): boolean {
    return this.tryBreakKronosStarFromSkill(enemy);
  }

  /**
   * Fase 4: terminó la convulsión de la supernova (~1.2 s) — la última
   * estrella colapsa y KRONOS estalla soltando su EXP (10) por la vía de
   * muerte interna de la IA (`onInternalKill` del game loop).
   */
  finalizeKronosSupernova(enemy: ManagedWaveEnemy): void {
    if (!enemy.entity.alive) {
      return;
    }
    this.resetKronosNyxEffects();
    deactivateKronosPortals(this);
    enemy.entity.hp = 0;
    enemy.entity.alive = false;
  }
}
