import * as THREE from 'three';
import type {
  BehaviorPercentages,
  CharacterId,
  EnemyKind,
  EnemySkin,
  EnemySpawnSpec,
  GalaxySpec,
  GrassZoneSpec,
  InteractableKind,
  NpcSpec,
  PlanetAdaptationConfig,
  PlanetRuntime,
  PlayerBehaviorVector,
  PropKind,
  PropSpec,
  RestrictedZoneSpec,
  WaterBubbleSpec,
  WorldObjectSpec,
} from '../types';
import { addComicOutline, createComicCelMaterial, createToonMaterial } from '../render/toonMaterials';
import { makeSeededRandom } from '../render/meshFactory';
import {
  buildBeaconBeam,
  buildBreakableWallMesh,
  buildEnemyModelBySkin,
  buildInterceptorBelt,
  buildKronosModel,
  buildLockedGateMesh,
  buildNpcModel,
  buildPropMesh,
  buildStructureMesh,
  buildSwitchLeverMesh,
  buildVisionConeMesh,
} from '../render/proceduralModels';
import {
  animateKronos,
  animateNpc,
  collectEnemyRig,
  collectKronosRig,
  collectNpcRig,
  GUARD_STATE_PATROL,
  GUARD_STATE_CHASE,
  GUARD_STATE_WINDUP,
  GUARD_STATE_KO,
  GUARD_STATE_SEARCH,
  GUARD_STATE_WARNING,
  KRONOS_STATE_CHASE,
  KRONOS_STATE_WINDUP,
  KRONOS_STATE_STUNNED,
  type EnemyRigRefs,
  type KronosAnimParams,
  type KronosRigRefs,
  type NpcRigRefs,
} from '../render/enemyAnimator';
import {
  createArchGatePillarColliders,
  createStructureCollider,
  findStrongestGravityPlanet,
  type PropCollider,
  type StructureCollider,
} from '../math/spherical';
import { getPlanetTerrainOffsetVec } from '../math/terrain';
import {
  ANTI_STASIS_INDEX,
  KRONOS_POSTURES,
  KronosNeuralNet,
  buildKronosInput,
  counterCharacterToPostureIndex,
  postureToCounterCharacter,
} from '../ai/KronosNeuralNet';
import { computeBehaviorPercentagesInto } from '../ai/BehaviorTracker';
import type { GameSoundKind } from '../audio/SynthAudio';
import {
  CONE_COLOR_WARNING,
  DRONE_ZAP_RANGE,
  EnemyAISystem,
  RADIO_ALERT_RANGE,
  TURRET_FIRE_CD,
  TURRET_RANGE,
  VISION_MIN_DOT,
  WINDUP_WHIFF_MARGIN,
  type EnemyAIHost,
} from './enemyAI';

// ============================================================================
// Constantes de simulación de los objetos del mundo
// ============================================================================
const OBJ_GRAVITY = 16;
const THROW_SPEED = 36;
const EXPLOSION_RADIUS = 6.5;
const EXPLOSION_DURATION = 0.45;
// HITO 3: anillo de impacto carmesí en el jugador al recibir daño.
const DAMAGE_RING_DURATION = 0.5;
const DAMAGE_RING_MAX_RADIUS = 2.6;
const STASIS_GRAB_RANGE = 9;
const MELEE_RANGE = 3.0;
const KNOCKOUT_RANGE = 2.9;
const PARRY_RANGE = 4.4;
const GUARD_DETECT_RANGE = 15;
const GUARD_ATTACK_RANGE = 2.6;
const GUARD_WINDUP = 0.45;
const GUARD_ATTACK_CD = 1.5;
const GUARD_CHASE_SPEED = 4.5;
const LASER_GATE_RADIUS = 3.0;
const LASER_GATE_CD = 1.3;
const GRASS_BLADES_PER_ZONE = 170;
const DASH_HIT_RANGE = 3.2;
const LOCK_ON_MIN_DOT = 0.0; // objetivo dentro del semiespacio frontal
const LOCK_CANDIDATE_MAX = 48;

// --- Red de IA intra-planeta (Hito 3B) ---
const ABILITY_REPORT_RANGE = 18.0; // Estasis/Gravity Shift delante de un guardia
const DRONE_CHASE_SPEED = 6.5;
const DRONE_ZAP_CD = 1.3;
// HITO 3: telegraph justo del dron — carga 0.35s (anillo/halo + click) antes del zap.
const DRONE_WINDUP = 0.35;
const PROJECTILE_POOL_SIZE = 10;
const SCANNER_GATE_RADIUS = 3.4;
const SCANNER_GATE_CD = 2.0;
const SEISMIC_MINE_TRIGGER_RADIUS = 7.0;
const TELEPORT_PIPE_RADIUS = 2.2;
const TELEPORT_COOLDOWN = 2.5;
const KEYCARD_PICKUP_RADIUS = 2.4;
const ADAPTED_SPAWN_BASE = 3; // semilla determinista para spawns de adaptación;

// --- HITO 1: IA justa y orgánica (aviso, zonas, sospecha gradual) ---
const HOSTILE_RECENT_SEC = 3.5; // infracción reciente del jugador


// --- FASE B: puzle, sigilo y acción táctica ---
const LOCKED_GATE_INTERACT_RANGE = 4.0; // [E] cerca de la compuerta
const SWITCH_LEVER_RANGE = 3.5; // [E] cerca de la palanca
const SWITCH_LEVER_HIT_RADIUS = 1.6; // roca/objeto de Estasis lanzado
const BREAKABLE_WALL_HP = 2; // 2 golpes de roca o 1 barril/Digger
const BREAKABLE_WALL_HIT_MARGIN = 1.2; // margen sobre halfX del impacto
const NPC_FACE_RANGE = 8.0; // el NPC gira a mirarte
const NPC_TALK_RANGE = 4.5; // [E] para hablar
const NPC_DIALOGUE_DURATION = 7.0; // el bocadillo se cierra solo
const GATE_ANIM_SPEED = 2.4; // velocidad de subida/bajada de la barrera

// --- Oleada 2: galaxia continua, conos de visión y distracciones ---
const NOISE_RADIUS = 13.0; // radio del "ruido" de un objeto lanzado al suelo
const NOISE_SEARCH_DURATION = 4.5; // investigan el impacto antes de volver a la ruta
const OBJECTIVE_TARGET_MAX = 8; // buffer preasignado de marcadores de objetivo

// --- OUTORBIT 2.5: Tormenta de Asteroides Interceptores (soft-lock) ---
const INTERCEPTOR_STEER_SPEED = 95.0; // m/s de persecución hacia la trayectoria
const INTERCEPTOR_RETURN_SPEED = 60.0; // m/s de regreso a la órbita
const INTERCEPTOR_HIT_MARGIN = 2.2; // margen sobre el radio del asteroide

// --- Jefe final KRONOS (Hito 4): red MLP híbrida + combate ---
const KRONOS_MAX_HP = 12;
const KRONOS_CHASE_SPEED = 3.4;
const KRONOS_MELEE_RANGE = 5.4;
const KRONOS_WINDUP = 0.85; // windup claro del barrido de maza (parreable)
const KRONOS_SWING_CD = 2.4;
const KRONOS_STUN_TIME = 2.5; // aturdido tras un Parry: recibe daño x2
const KRONOS_STUN_DAMAGE_MUL = 2;
const KRONOS_ORB_CD = 3.4;
const KRONOS_ORB_RANGE = 34;
const KRONOS_ORB_SPEED = 17;
const KRONOS_ORB_LIFE = 4.0;
const KRONOS_ORB_HIT_RADIUS = 1.4;
const KRONOS_ORB_POOL_SIZE = 3;
const KRONOS_POWER_CD = 5.5;
const KRONOS_PULSE_RADIUS = 12; // anti_kitsune: pulso anti-sigilo
const KRONOS_SEISMIC_RADIUS = 15; // anti_digger: onda sísmica
const KRONOS_AIR_BURST_RANGE = 24; // anti_axel: ráfaga aérea
const KRONOS_POSTURE_REEVAL = 2.5; // re-predicción de la red MLP
const KRONOS_FRONT_SHIELD_DOT = 0.35; // escudo frontal anti_stasis
const KRONOS_FRONT_SHIELD_MUL = 0.25; // reduce el daño frontal salvo flanqueo

/** Color del anillo de energía según la postura activa de la red MLP. */
const KRONOS_POSTURE_RING_COLORS = [0xf97316, 0xfacc15, 0x22d3ee, 0xa78bfa];

const GRAB_STATE_IDLE = 0;
const GRAB_STATE_HELD = 1;
const GRAB_STATE_FLYING = 2;
const GRAB_STATE_CONSUMED = 3;

/** Arena del jefe: barriles/rocas reaparecen tras este tiempo (s). */
const GRAB_RESPAWN_KRONOS_SEC = 14;
const KRONOS_ARENA_PLANET_ID = 'kronos-trono';

// HITO 4: los estados GUARD_STATE_* / KRONOS_STATE_* viven en
// enemyAnimator.ts (fuente única de verdad, importados arriba).

/** HITO 4: duración del follow-through visual del golpe (s) tras el windup. */

/** Parámetros de detección/combate por tipo de enemigo. */
export interface EnemyParams {
  detectRange: number;
  chaseSpeed: number;
  attackRange: number;
  windupTime: number;
  attackCdTime: number;
}

const ENEMY_PARAMS: Record<EnemyKind, EnemyParams> = {
  guard: {
    detectRange: GUARD_DETECT_RANGE,
    chaseSpeed: GUARD_CHASE_SPEED,
    attackRange: GUARD_ATTACK_RANGE,
    windupTime: GUARD_WINDUP,
    attackCdTime: GUARD_ATTACK_CD,
  },
  officer: {
    detectRange: 17,
    chaseSpeed: 4.8,
    attackRange: GUARD_ATTACK_RANGE,
    windupTime: GUARD_WINDUP,
    attackCdTime: 1.4,
  },
  drone: {
    detectRange: 20,
    chaseSpeed: DRONE_CHASE_SPEED,
    attackRange: DRONE_ZAP_RANGE,
    windupTime: DRONE_WINDUP,
    attackCdTime: DRONE_ZAP_CD,
  },
  turret: {
    detectRange: TURRET_RANGE,
    chaseSpeed: 0,
    attackRange: 0,
    windupTime: 0,
    attackCdTime: TURRET_FIRE_CD,
  },
  brute: {
    detectRange: 14,
    chaseSpeed: 3.8,
    attackRange: 3.0,
    windupTime: 0.7,
    attackCdTime: 2.0,
  },
  kronos: {
    detectRange: 0,
    chaseSpeed: 0,
    attackRange: 0,
    windupTime: 0,
    attackCdTime: 0,
  },
};

/** Fuente de un golpe/noqueo (determina resistencias de cascos y brutes). */
export type HitSource = 'melee' | 'knockout' | 'dash' | 'shockwave' | 'explosive' | 'parry' | 'stasis';

/**
 * Enemigo unificado de la red intra-planeta: guardias, oficiales, drones,
 * torretas y brutes comparten ciclo de vida (patrol/search/chase/windup/KO),
 * sospecha 0..1 y comunicación por radio.
 */
export interface EnemyObj {
  kind: EnemyKind;
  /** Skin temática del modelo (animales de la selva en Verdant). */
  skin: EnemySkin;
  planet: PlanetRuntime;
  mesh: THREE.Group;
  pos: THREE.Vector3;
  dir: THREE.Vector3; // unit desde el centro del planeta
  forward: THREE.Vector3; // tangente de avance
  waypoints: THREE.Vector3[];
  waypointIdx: number;
  state: number;
  windupT: number;
  attackCd: number;
  suspicion: number; // 0..1
  helmet: boolean; // casco blindado: resiste el primer golpe
  paired: boolean; // patrulla en pareja
  searchT: number;
  lastSeenDir: THREE.Vector3;
  koTimer: number;
  koRadioSent: boolean;
  hoverPhase: number; // dron
  /** Fase del rebote de paso de los animales cuadrúpedos (pantera/gorila/mono). */
  walkPhase: number;
  /** HITO 4: rig cacheado de pivotes nombrados (una vez al hacer spawn). */
  rig: EnemyRigRefs;
  /** HITO 4: escala base del modelo (oni 1.3, cyberMech 1.2, resto 1). */
  baseScale: number;
  /** HITO 4: velocidad real normalizada 0..1 suavizada (sin moonwalk). */
  smoothSpeedRatio: number;
  /** HITO 4: temporizador del follow-through del golpe (s, decae a 0). */
  strikeAnimT: number;
  /** HITO 4: forward del frame anterior (medición del giro para el banking). */
  prevForward: THREE.Vector3;
  /** HITO 4: alabeo lateral suavizado del volador (rad). */
  hoverBank: number;
  /** HITO 4: altura de terreno suavizada del volador (sube rápido, baja lento). */
  smoothTerrainY: number;
  /** HITO 4: posición del frame anterior (medición del movimiento real). */
  prevPos: THREE.Vector3;
  /** HITO 4: halo de sombra bajo el volador (se ve flotar sobre el terreno). */
  shadowHalo: THREE.Object3D | null;
  params: EnemyParams;
  /** Cono de visión adherido al suelo (guardias y oficiales). */
  visionCone: THREE.Mesh | null;
  visionConeMaterial: THREE.MeshBasicMaterial | null;
  /** Lado de flanqueo en combate (+1/-1, alternado al spawn). */
  flankSide: number;
  /** Iconos 3D de estado sobre la cabeza: '?' amarillo y '!' rojo. */
  iconQuestion: THREE.Group | null;
  iconAlert: THREE.Group | null;
  /** FASE B: altura fija sobre la superficie (vigías en torres/murallas). */
  altitudeOffset: number;
  /** FASE B: vigía estacionario que rota ±60º desde su puesto. */
  stationaryLookout: boolean;
  /** FASE B: al caer K.O. entrega la llave/tarjeta del sector. */
  dropsKeycard: boolean;
  /** FASE B: fase del barrido de vigilancia del vigía. */
  lookoutPhase: number;
  /** FASE B: tangente de mirada base del vigía (el barrido orbita sobre ella). */
  baseForward: THREE.Vector3;
  /** HITO 1: tiempo acumulado en GUARD_STATE_WARNING. */
  warningT: number;
  /** HITO 1: mirada fija al perder al jugador en WARNING (0.6s). */
  warningGazeT: number;
  /** HITO 1: tiempo que el jugador lleva invadiendo la distancia melee. */
  warningCloseT: number;
  /** HITO 1: cooldown del chirp/banner de aviso (sin spam por frame). */
  warningCooldown: number;
  /** HITO 1: lado persistente de steering (+1/-1) al rodear muros. */
  steerBias: number;
  /** HITO 1: velocidad de giro aplicada al forward (rad/s, suavizado). */
  turnVel: number;
  /** HITO 1: anillo de telegraph del windup sobre el suelo (caminantes). */
  windupRing: THREE.Mesh | null;
  windupRingMaterial: THREE.MeshBasicMaterial | null;
}

/**
 * Cinturón de Asteroides Interceptores de un planeta protegido: 5 rocas
 * grandes orbitando rápido que persiguen la trayectoria del jugador cuando
 * vuela hacia el planeta con la tormenta aún activa.
 */
interface InterceptorObj {
  planet: PlanetRuntime;
  group: THREE.Group;
  meshes: THREE.Mesh[];
  /** Posiciones mundiales actuales (steering propio, no solo órbita). */
  pos: THREE.Vector3[];
  radii: number[];
  orbitRadii: number[];
  heights: number[];
  angles: number[];
  speeds: number[];
  /** Base ortonormal del plano de órbita (axisA x axisB = axisN). */
  axisA: THREE.Vector3;
  axisB: THREE.Vector3;
  axisN: THREE.Vector3;
}

/** Proyectil luminoso de torreta (parreable). */
export interface TurretProjectile {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  active: boolean;
  reflected: boolean;
  life: number;
  /** HITO 3: motivo del orbe de KRONOS según la postura (ráfaga aérea...). */
  reason?: string;
}

interface KeycardObj {
  mesh: THREE.Group;
  beacon: THREE.Mesh;
  pos: THREE.Vector3;
  planet: PlanetRuntime;
  collected: boolean;
}

interface ScannerGateObj {
  mesh: THREE.Group;
  planeMaterial: THREE.MeshBasicMaterial;
  pos: THREE.Vector3;
  planet: PlanetRuntime;
  cooldown: number;
  phase: number;
}

interface SeismicMineObj {
  mesh: THREE.Group;
  ringMaterial: THREE.MeshBasicMaterial;
  pos: THREE.Vector3;
  planet: PlanetRuntime;
  exploded: boolean;
  phase: number;
}

interface TeleporterObj {
  mesh: THREE.Group;
  pos: THREE.Vector3;
  planet: PlanetRuntime;
  isExit: boolean;
}

/**
 * FASE B — Compuerta bloqueada: marco sólido + barrera energética que baja
 * al abrirse. Mientras `closed` su collider dinámico bloquea al jugador,
 * a los enemigos y a los conos de visión; al abrirse el collider queda
 * `disabled`. Puede requerir tarjeta ([E]), abrirse con su palanca vinculada
 * y cerrarse de golpe por LOCKDOWN si salta la alarma en su planeta.
 */
export interface LockedGateObj {
  id: string;
  mesh: THREE.Group;
  barrier: THREE.Mesh;
  barrierMaterial: THREE.MeshBasicMaterial;
  barrierBaseY: number;
  lockMaterial: THREE.MeshBasicMaterial;
  pos: THREE.Vector3;
  planet: PlanetRuntime;
  collider: StructureCollider;
  closed: boolean;
  /** 0 = cerrada .. 1 = abierta (animación de la barrera). */
  openT: number;
  requiresKeycard: boolean;
  lockdownOnAlert: boolean;
}

/** FASE B — Palanca/switch de pedestal: abre su compuerta vinculada. */
interface SwitchLeverObj {
  id: string;
  mesh: THREE.Group;
  leverPivot: THREE.Group;
  crystalMaterial: THREE.MeshBasicMaterial;
  pos: THREE.Vector3;
  planet: PlanetRuntime;
  activated: boolean;
  linkedGateId: string | null;
}

/**
 * FASE B — Pared rompible: collider sólido mientras está intacta (hp = 2);
 * al romperse explota con FX, libera el collider y abre el pasadizo.
 */
interface BreakableWallObj {
  id: string;
  mesh: THREE.Group;
  crackMaterial: THREE.MeshBasicMaterial;
  pos: THREE.Vector3;
  planet: PlanetRuntime;
  collider: StructureCollider;
  hp: number;
  broken: boolean;
}

/** FASE B — NPC amigable con diálogo de pistas (bocadillo [E] flotante). */
interface NpcObj {
  spec: NpcSpec;
  mesh: THREE.Group;
  /** HITO 4: rig cacheado del NPC (torso/cabeza/brazos/icono [E]). */
  rig: NpcRigRefs;
  pos: THREE.Vector3;
  planet: PlanetRuntime;
  dir: THREE.Vector3;
  forward: THREE.Vector3;
  dialogueIdx: number;
  waypoints: THREE.Vector3[];
  wpIndex: number;
  altitudeOffset: number;
}

/**
 * Comandante KRONOS (jefe final): persigue al jugador sobre la esfera con
 * barridos de maza parreables, orbes energéticos devolvibles y poderes que
 * dependen de la postura que su red MLP (offline + online) predice para el
 * estilo de juego del jugador.
 */
interface KronosObj {
  mesh: THREE.Group;
  ringMaterial: THREE.MeshBasicMaterial;
  maceGroup: THREE.Group;
  /** HITO 4: rig cacheado del jefe (torso/maza/anillo de energía). */
  rig: KronosRigRefs;
  planet: PlanetRuntime;
  pos: THREE.Vector3;
  dir: THREE.Vector3; // unit desde el centro del planeta
  forward: THREE.Vector3; // tangente de avance
  hp: number; // 12
  net: KronosNeuralNet; // copia mutable de la red por combate
  postureIdx: number; // 0..3 (KRONOS_POSTURES)
  state: number;
  windupT: number;
  stunT: number;
  swingCd: number;
  orbCd: number;
  powerCd: number;
  postureCd: number;
  defeated: boolean;
  clock: number;
}

type GrabKind = 'rock' | 'barrel_explosive' | 'snowball' | 'crate';

const GRAB_RADIUS: Record<GrabKind, number> = {
  rock: 0.55,
  barrel_explosive: 0.55,
  snowball: 0.5,
  crate: 0.62,
};

// ============================================================================
// Temporales preasignados: CERO allocations dentro del loop de renderizado.
// ============================================================================
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _v6 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _upAxis = new THREE.Vector3(0, 1, 0);
// HITO 3: eje del agujero del torus del anillo de daño (local Z -> up tangente).
const _zAxis = new THREE.Vector3(0, 0, 1);
const _dummy = new THREE.Object3D();

// Buckets vacíos compartidos: los planetas sin estructuras/props devuelven
// estas referencias en vez de alocar arrays nuevos por consulta.
const EMPTY_STRUCTURE_COLLIDERS: StructureCollider[] = [];
const EMPTY_PROP_COLLIDERS: PropCollider[] = [];
// HITO 1: scratch dedicado de steering/separación (cero allocations en el loop).
// HITO 2: scratch del sondeo de props (distancia segmento-segmento, cero allocs).
// HITO 4: scratch del producto cruzado del giro enemigo (banking de voladores).

// ============================================================================
// Lock-On (Hito 3A): guardias, barriles y generadores fijables
// ============================================================================

export type LockOnKind = 'guard' | 'barrel' | 'generator' | 'wall';

export interface LockOnHandle {
  kind: LockOnKind;
  index: number;
}

const LOCK_KIND_GUARD = 0;
const LOCK_KIND_BARREL = 1;
const LOCK_KIND_GENERATOR = 2;
const LOCK_KIND_WALL = 3;

function lockCodeToKind(code: number): LockOnKind {
  return code === LOCK_KIND_GUARD
    ? 'guard'
    : code === LOCK_KIND_BARREL
      ? 'barrel'
      : code === LOCK_KIND_WALL
        ? 'wall'
        : 'generator';
}

function lockKindToCode(kind: LockOnKind): number {
  return kind === 'guard'
    ? LOCK_KIND_GUARD
    : kind === 'barrel'
      ? LOCK_KIND_BARREL
      : kind === 'wall'
        ? LOCK_KIND_WALL
        : LOCK_KIND_GENERATOR;
}

// Candidatos preasignados (cero allocations al fijar/ciclar objetivos).
const _candAngle = new Float64Array(LOCK_CANDIDATE_MAX);
const _candKindCode = new Int32Array(LOCK_CANDIDATE_MAX);
const _candIndex = new Int32Array(LOCK_CANDIDATE_MAX);
const _candOrder = new Int32Array(LOCK_CANDIDATE_MAX);

// ============================================================================
// Marcadores de objetivos (Oleada 2): buffer preasignado para el HUD
// ============================================================================

export interface ObjectiveTarget {
  pos: THREE.Vector3;
  label: string;
}

export interface ObjectiveTargetResult {
  targets: ObjectiveTarget[];
  count: number;
}

// ============================================================================
// Estructuras internas (creadas solo al construir el nivel)
// ============================================================================
interface GrabObject {
  kind: GrabKind;
  mesh: THREE.Group;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  radius: number;
  state: number;
  spin: number;
  /** Consumido (explotó/rompió): > 0 = segundos hasta reaparecer. */
  respawnT: number;
  /** Punto de spawn original (respawn en la arena de KRONOS). */
  spawnPos: THREE.Vector3;
  spawnPlanet: PlanetRuntime;
}

interface GeneratorObj {
  mesh: THREE.Group;
  core: THREE.Mesh;
  coreMaterial: THREE.MeshBasicMaterial;
  beacon: THREE.Mesh;
  pos: THREE.Vector3;
  planet: PlanetRuntime;
  hp: number;
  destroyed: boolean;
}

interface LaserGateObj {
  mesh: THREE.Group;
  planeMaterial: THREE.MeshBasicMaterial;
  pos: THREE.Vector3;
  planet: PlanetRuntime;
  cooldown: number;
  phase: number;
  /** FASE B: apagada en vivo por una palanca sin compuerta vinculada. */
  disabled: boolean;
}

interface WaterBubbleObj {
  center: THREE.Vector3;
  radius: number;
  mesh: THREE.Group;
  phase: number;
}

interface GrassZoneObj {
  planetId: string;
  dir: THREE.Vector3;
  cosThreshold: number;
}

/**
 * HITO 1 — Zona restringida en runtime: dirección y coseno del umbral
 * precomputados para un test por punto (dot > cos) sin allocations.
 */
export interface RestrictedZoneRuntime {
  spec: RestrictedZoneSpec;
  planetId: string;
  dir: THREE.Vector3;
  cosThreshold: number;
}

interface ExplosionFx {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  active: boolean;
  t: number;
  radius: number;
}

/**
 * HITO 3 — Anillo de impacto carmesí en la posición del jugador al recibir
 * daño: pulso 3D expandiéndose sobre el plano tangente (shock-ring vívido
 * que confirma el golpe en escena, no solo en el HUD).
 */
interface DamageRingFx {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  active: boolean;
  t: number;
}

/** Estado del jugador que el mundo necesita cada frame (vectores preasignados). */
export interface WorldPlayerState {
  pos: THREE.Vector3;
  up: THREE.Vector3;
  forward: THREE.Vector3;
  disguised: boolean;
  inGrass: boolean;
  burrowing: boolean;
  swimming: boolean;
  parryActive: boolean;
  stealthMul: number;
  /** Corriendo con Shift: delata al jugador disfrazado ante los guardias. */
  sprinting: boolean;
  /** En el aire (salto/ancla/vuelo): objetivo válido de las torretas antiaéreas. */
  airborne: boolean;
  /** Planeta destino del vuelo dirigido (activa la persecución de interceptores). */
  flightTargetPlanetId: string | null;
  /** Personaje activo del escuadrón (entrada one-hot de la red MLP de KRONOS). */
  characterId: CharacterId;
  /** HITO 1: lleva un objeto de Estasis (contrabando ante los guardias). */
  holdingContraband: boolean;
  /** HITO 1: acción hostil reciente ~3.5s (ataque, Estasis, explosión...). */
  hostileRecent: boolean;
}

/**
 * Hito 3 — Daño al jugador con atribución completa: quién atacó (nombre
 * en español), por qué (motivo del golpe) y desde qué punto del mundo
 * (para el chevron direccional del HUD). Los 5 últimos parámetros son
 * opcionales para no romper los llamadores que no aportan contexto.
 */
export type PlayerDamageFn = (
  amount: number,
  pushX: number,
  pushY: number,
  pushZ: number,
  attacker?: string,
  reason?: string,
  sourceX?: number,
  sourceY?: number,
  sourceZ?: number
) => void;

/**
 * Hito 3 — Nombre en español del atacante según su skin/kind: la pantera
 * de la selva, el samurái de Kurogane, la ciber-guardia de Neon Bastion...
 * con fallback limpio al uniforme de Kronos (guardia/oficial/coloso/dron).
 */
// ============================================================================
// Builders de mallas (solo al construir el nivel)
// ============================================================================
function buildGrabMesh(kind: GrabKind): THREE.Group {
  const group = new THREE.Group();
  if (kind === 'rock') {
    const mesh = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.5, 0),
      createToonMaterial('#94a3b8')
    );
    addComicOutline(mesh, 0.014);
    mesh.position.y = 0.3;
    mesh.rotation.y = 0.6;
    group.add(mesh);
  } else if (kind === 'barrel_explosive') {
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.42, 1.0, 12),
      createToonMaterial('#dc2626')
    );
    addComicOutline(barrel, 0.014);
    barrel.position.y = 0.5;
    group.add(barrel);
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(0.44, 0.44, 0.18, 12),
      createToonMaterial('#facc15')
    );
    addComicOutline(band, 0.012);
    band.position.y = 0.5;
    group.add(band);
  } else if (kind === 'snowball') {
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 14, 10),
      createToonMaterial('#f8fafc')
    );
    addComicOutline(ball, 0.014);
    ball.position.y = 0.45;
    group.add(ball);
  } else {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.85, 0.85, 0.85),
      createToonMaterial('#b45309')
    );
    addComicOutline(box, 0.014);
    box.position.y = 0.45;
    group.add(box);
  }
  return group;
}

function buildGeneratorMesh(): { group: THREE.Group; core: THREE.Mesh } {
  const group = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 1.2, 1.2),
    createToonMaterial('#334155')
  );
  addComicOutline(base, 0.016);
  base.position.y = 0.6;
  group.add(base);
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xfbbf24 })
  );
  core.position.set(0, 1.35, 0);
  group.add(core);
  const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 1.1, 6),
    createToonMaterial('#64748b')
  );
  addComicOutline(antenna, 0.012);
  antenna.position.set(0.5, 1.7, 0);
  group.add(antenna);
  return { group, core };
}

function buildLaserGateMesh(): {
  group: THREE.Group;
  planeMaterial: THREE.MeshBasicMaterial;
} {
  const group = new THREE.Group();
  const postGeometry = new THREE.CylinderGeometry(0.18, 0.22, 3.2, 8);
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(postGeometry, createToonMaterial('#475569'));
    addComicOutline(post, 0.014);
    post.position.set(2.7 * side, 1.6, 0);
    group.add(post);
  }
  const planeMaterial = new THREE.MeshBasicMaterial({
    color: 0xf87171,
    transparent: true,
    opacity: 0.4,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const plane = new THREE.Mesh(new THREE.BoxGeometry(5.4, 3.0, 0.12), planeMaterial);
  plane.position.y = 1.6;
  group.add(plane);
  return { group, planeMaterial };
}

function buildKeycardMesh(): THREE.Group {
  const group = new THREE.Group();
  const card = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.06, 0.36),
    createToonMaterial('#fbbf24')
  );
  addComicOutline(card, 0.012);
  card.position.y = 0.9;
  group.add(card);
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.56, 0.07, 0.09),
    createToonMaterial('#dc2626')
  );
  stripe.position.set(0, 0.9, -0.1);
  group.add(stripe);
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xfde047 })
  );
  glow.position.y = 0.9;
  group.add(glow);
  return group;
}

function buildScannerGateMesh(): {
  group: THREE.Group;
  planeMaterial: THREE.MeshBasicMaterial;
} {
  const group = new THREE.Group();
  const postGeometry = new THREE.CylinderGeometry(0.18, 0.22, 3.6, 8);
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(postGeometry, createToonMaterial('#334155'));
    addComicOutline(post, 0.014);
    post.position.set(2.7 * side, 1.8, 0);
    group.add(post);
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee })
    );
    lamp.position.set(2.7 * side, 3.4, 0);
    group.add(lamp);
  }
  const topBar = new THREE.Mesh(
    new THREE.BoxGeometry(5.6, 0.24, 0.3),
    createToonMaterial('#475569')
  );
  addComicOutline(topBar, 0.014);
  topBar.position.y = 3.5;
  group.add(topBar);
  const planeMaterial = new THREE.MeshBasicMaterial({
    color: 0x22d3ee,
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const plane = new THREE.Mesh(new THREE.BoxGeometry(5.4, 3.4, 0.1), planeMaterial);
  plane.position.y = 1.8;
  group.add(plane);
  return { group, planeMaterial };
}

function buildSeismicMineMesh(): {
  group: THREE.Group;
  ringMaterial: THREE.MeshBasicMaterial;
} {
  const group = new THREE.Group();
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    createToonMaterial('#1f2937')
  );
  addComicOutline(dome, 0.014);
  group.add(dome);
  const spike = new THREE.Mesh(
    new THREE.ConeGeometry(0.16, 0.5, 6),
    createToonMaterial('#4b5563')
  );
  addComicOutline(spike, 0.012);
  spike.position.y = 0.5;
  group.add(spike);
  const sensor = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xef4444 })
  );
  sensor.position.y = 0.28;
  group.add(sensor);
  // Anillo de detección sísmica sobre la superficie.
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0xfbbf24,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.07, 8, 32), ringMaterial);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.08;
  group.add(ring);
  return { group, ringMaterial };
}

function buildTeleportPipeMesh(isExit: boolean): THREE.Group {
  const group = new THREE.Group();
  const pipe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.95, 0.95, 2.6, 14),
    createToonMaterial('#3f4a5f')
  );
  addComicOutline(pipe, 0.016);
  pipe.position.y = 1.3;
  group.add(pipe);
  const rimGeometry = new THREE.TorusGeometry(0.98, 0.1, 8, 20);
  for (const y of [0.15, 2.45]) {
    const rim = new THREE.Mesh(rimGeometry, createToonMaterial('#f97316'));
    addComicOutline(rim, 0.012);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = y;
    group.add(rim);
  }
  const glowColor = isExit ? 0x22d3ee : 0xf97316;
  const glow = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 0.7, 2.4, 12),
    new THREE.MeshBasicMaterial({
      color: glowColor,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    })
  );
  glow.position.y = 1.3;
  group.add(glow);
  return group;
}

function buildBubbleMesh(radius: number): THREE.Group {
  const group = new THREE.Group();
  const waterMaterial = createComicCelMaterial('#7dd3fc', {
    transparent: true,
    opacity: 0.24,
    rimColor: 0xa5f3fc,
    rimStrength: 0.7,
  });
  waterMaterial.depthWrite = false;
  const water = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 24), waterMaterial);
  group.add(water);
  const rim = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.02, 32, 24),
    new THREE.MeshBasicMaterial({
      color: '#a5f3fc',
      transparent: true,
      opacity: 0.16,
      side: THREE.BackSide,
      depthWrite: false,
    })
  );
  group.add(rim);
  return group;
}

/**
 * Iconos 3D de estado sobre la cabeza de un guardia: '?' amarillo al
 * investigar/sospechar y '!' rojo al entrar en combate/alarma. Ambos ocultos
 * por defecto; el manager los alterna según el estado del enemigo.
 */
function buildStateIcons(): { group: THREE.Group; question: THREE.Group; alert: THREE.Group } {
  const group = new THREE.Group();
  group.name = 'stateIcons';
  group.position.y = 2.35;

  // '?' amarillo: gancho (arco de toro) + punto inferior.
  const question = new THREE.Group();
  const questionMaterial = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
  const hook = new THREE.Mesh(
    new THREE.TorusGeometry(0.17, 0.055, 8, 14, Math.PI * 1.35),
    questionMaterial
  );
  hook.position.set(0.02, 0.16, 0);
  hook.rotation.z = Math.PI * 0.85;
  question.add(hook);
  const questionDot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), questionMaterial);
  questionDot.position.set(-0.08, -0.14, 0);
  question.add(questionDot);
  question.visible = false;
  group.add(question);

  // '!' rojo: barra vertical + punto inferior.
  const alert = new THREE.Group();
  const alertMaterial = new THREE.MeshBasicMaterial({ color: 0xef4444 });
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.34, 0.1), alertMaterial);
  bar.position.y = 0.14;
  alert.add(bar);
  const alertDot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), alertMaterial);
  alertDot.position.y = -0.16;
  alert.add(alertDot);
  alert.visible = false;
  group.add(alert);

  return { group, question, alert };
}

// ============================================================================
// Gestor de objetos interactivos del mundo esférico
// ============================================================================

// --- HITO 2: blueprint de colliders físicos por PropKind ---
// Dimensiones en metros a escala 1 (se multiplican por `scale` del prop).
// `twinPillarOffset` > 0 emite 2 colliders de pilar a ±offset·scale rotados
// por el yaw del mesh: se choca con los pilares y se pasa BAJO el arco.
interface PropColliderBlueprint {
  radius: number;
  height: number;
  capRadius: number;
  capY: number;
  bounceImpulse: number;
  softFoliage: boolean;
  stealthBush: boolean;
  twinPillarOffset: number;
}

const PROP_COLLIDER_BLUEPRINTS: Partial<Record<PropKind, PropColliderBlueprint>> = {
  palm_tree: { radius: 0.55, height: 4.2, capRadius: 1.05, capY: 3.4, bounceImpulse: 0, softFoliage: false, stealthBush: false, twinPillarOffset: 0 },
  cherry_snow_tree: { radius: 0.5, height: 3.0, capRadius: 0.95, capY: 2.4, bounceImpulse: 0, softFoliage: false, stealthBush: false, twinPillarOffset: 0 },
  pine_tree: { radius: 0.45, height: 2.0, capRadius: 0.8, capY: 1.6, bounceImpulse: 0, softFoliage: false, stealthBush: false, twinPillarOffset: 0 },
  ancient_statue: { radius: 0.95, height: 4.0, capRadius: 0, capY: 0, bounceImpulse: 0, softFoliage: false, stealthBush: false, twinPillarOffset: 0 },
  reactor: { radius: 1.0, height: 2.6, capRadius: 0, capY: 0, bounceImpulse: 0, softFoliage: false, stealthBush: false, twinPillarOffset: 0 },
  ice_crystal: { radius: 0.8, height: 3.2, capRadius: 0, capY: 0, bounceImpulse: 0, softFoliage: false, stealthBush: false, twinPillarOffset: 0 },
  igloo: { radius: 1.7, height: 1.6, capRadius: 1.35, capY: 1.55, bounceImpulse: 0, softFoliage: false, stealthBush: false, twinPillarOffset: 0 },
  pagoda_house: { radius: 2.2, height: 5.2, capRadius: 0, capY: 0, bounceImpulse: 0, softFoliage: false, stealthBush: false, twinPillarOffset: 0 },
  village_house: { radius: 1.9, height: 3.6, capRadius: 0, capY: 0, bounceImpulse: 0, softFoliage: false, stealthBush: false, twinPillarOffset: 0 },
  cyber_tower: { radius: 1.6, height: 14.5, capRadius: 0, capY: 0, bounceImpulse: 0, softFoliage: false, stealthBush: false, twinPillarOffset: 0 },
  holo_pillar: { radius: 0.7, height: 2.5, capRadius: 0, capY: 0, bounceImpulse: 0, softFoliage: false, stealthBush: false, twinPillarOffset: 0 },
  pipe: { radius: 1.0, height: 1.5, capRadius: 0, capY: 0, bounceImpulse: 0, softFoliage: false, stealthBush: false, twinPillarOffset: 0 },
  antenna: { radius: 0.35, height: 4.5, capRadius: 0, capY: 0, bounceImpulse: 0, softFoliage: false, stealthBush: false, twinPillarOffset: 0 },
  paper_lantern: { radius: 0.45, height: 2.4, capRadius: 0, capY: 0, bounceImpulse: 0, softFoliage: false, stealthBush: false, twinPillarOffset: 0 },
  spotlight: { radius: 0.4, height: 3.7, capRadius: 0, capY: 0, bounceImpulse: 0, softFoliage: false, stealthBush: false, twinPillarOffset: 0 },
  neon_billboard: { radius: 1.8, height: 6.3, capRadius: 0, capY: 0, bounceImpulse: 0, softFoliage: false, stealthBush: false, twinPillarOffset: 0 },
  giant_flower: { radius: 0.35, height: 2.5, capRadius: 1.1, capY: 2.25, bounceImpulse: 18.5, softFoliage: false, stealthBush: false, twinPillarOffset: 0 },
  glow_mushroom: { radius: 0.4, height: 1.8, capRadius: 1.0, capY: 1.55, bounceImpulse: 16.0, softFoliage: false, stealthBush: false, twinPillarOffset: 0 },
  fern_cluster: { radius: 0.95, height: 0.9, capRadius: 0, capY: 0, bounceImpulse: 0, softFoliage: true, stealthBush: true, twinPillarOffset: 0 },
  bamboo_cluster: { radius: 0.9, height: 2.9, capRadius: 0, capY: 0, bounceImpulse: 0, softFoliage: true, stealthBush: true, twinPillarOffset: 0 },
  torii_gate: { radius: 0.3, height: 3.6, capRadius: 0, capY: 0, bounceImpulse: 0, softFoliage: false, stealthBush: false, twinPillarOffset: 1.5 },
  vine_arch: { radius: 0.5, height: 3.7, capRadius: 0, capY: 0, bounceImpulse: 0, softFoliage: false, stealthBush: false, twinPillarOffset: 1.6 },
  rock: { radius: 0.55, height: 0.5, capRadius: 0.5, capY: 0.45, bounceImpulse: 0, softFoliage: false, stealthBush: false, twinPillarOffset: 0 },
  // --- Ciudad Sandbox (OUTORBIT) ---
  city_house: { radius: 2.05, height: 5.25, capRadius: 0, capY: 0, bounceImpulse: 0, softFoliage: false, stealthBush: false, twinPillarOffset: 0 },
  city_shop: { radius: 2.0, height: 3.1, capRadius: 0, capY: 0, bounceImpulse: 0, softFoliage: false, stealthBush: false, twinPillarOffset: 0 },
  street_lamp: { radius: 0.24, height: 3.9, capRadius: 0, capY: 0, bounceImpulse: 0, softFoliage: false, stealthBush: false, twinPillarOffset: 0 },
  bench: { radius: 0.9, height: 0.6, capRadius: 0, capY: 0, bounceImpulse: 0, softFoliage: false, stealthBush: false, twinPillarOffset: 0 },
  market_stall: { radius: 1.35, height: 2.3, capRadius: 0, capY: 0, bounceImpulse: 0, softFoliage: false, stealthBush: false, twinPillarOffset: 0 },
  clock_tower: { radius: 3.0, height: 22.2, capRadius: 0, capY: 0, bounceImpulse: 0, softFoliage: false, stealthBush: false, twinPillarOffset: 0 },
  crane: { radius: 1.0, height: 12.6, capRadius: 0, capY: 0, bounceImpulse: 0, softFoliage: false, stealthBush: false, twinPillarOffset: 0 },
  awning_arch: { radius: 0.4, height: 5.1, capRadius: 0, capY: 0, bounceImpulse: 0, softFoliage: false, stealthBush: false, twinPillarOffset: 2.5 },
  comic_billboard: { radius: 0.3, height: 5.2, capRadius: 0, capY: 0, bounceImpulse: 0, softFoliage: false, stealthBush: false, twinPillarOffset: 0 },
  fountain: { radius: 2.85, height: 0.72, capRadius: 0, capY: 0, bounceImpulse: 0, softFoliage: false, stealthBush: false, twinPillarOffset: 0 },
  // stone_path y wood_bridge: decoración plana transitable, sin collider.
};

export class WorldObjectsManager implements EnemyAIHost {
  private readonly group: THREE.Group;
  readonly planets: PlanetRuntime[];
  private readonly grabs: GrabObject[] = [];
  private readonly generators: GeneratorObj[] = [];
  private readonly gates: LaserGateObj[] = [];
  private readonly bubbles: WaterBubbleObj[] = [];
  private readonly grassZones: GrassZoneObj[] = [];
  readonly enemies: EnemyObj[] = [];
  readonly projectiles: TurretProjectile[] = [];
  private readonly keycards: KeycardObj[] = [];
  private readonly scanners: ScannerGateObj[] = [];
  private readonly mines: SeismicMineObj[] = [];
  private readonly teleporters: TeleporterObj[] = [];
  private readonly explosions: ExplosionFx[] = [];
  /** HITO 3: pool de anillos de impacto carmesí (reutilizado, sin GC). */
  private readonly damageRings: DamageRingFx[] = [];
  private readonly interceptors: InterceptorObj[] = [];
  // --- FASE B: puzle, sigilo y acción táctica ---
  readonly lockedGates: LockedGateObj[] = [];
  private readonly switchLevers: SwitchLeverObj[] = [];
  private readonly breakableWalls: BreakableWallObj[] = [];
  private readonly npcs: NpcObj[] = [];
  /** Bocadillo de diálogo activo (preasignado, sin GC por frame). */
  private readonly dialogueData: { speaker: string; role: string; text: string } = {
    speaker: '',
    role: '',
    text: '',
  };
  private dialogueNpc: NpcObj | null = null;
  private dialogueT = 0;
  lockdownActive = false;
  private kronos: KronosObj | null = null;
  private readonly kronosOrbs: TurretProjectile[] = [];
  /** Vector de comportamiento combinado de la run (referencia, sin copiar). */
  private kronosBehavior: PlayerBehaviorVector | null = null;
  private kronosCharacter: CharacterId = 'kitsune';
  // Scratch preasignado para la red MLP de KRONOS (cero allocations).
  private readonly kronosPct: BehaviorPercentages = {
    stealth: 0,
    aggression: 0,
    aerial: 0,
    subterranean: 0,
    stasis: 0,
  };
  private readonly kronosInput: number[] = [0, 0, 0, 0, 0, 0, 0, 0];
  private readonly kronosAnim: KronosAnimParams = {
    torso: null,
    torsoBaseY: 0,
    mace: null,
    ring: null,
    ringMaterial: new THREE.MeshBasicMaterial(),
    state: KRONOS_STATE_CHASE,
    windupProgress: 0,
    speedRatio: 0,
    clock: 0,
    dt: 0,
    defeated: false,
  };
  // --- Oleada 2: galaxia continua ---
  // P10: colliders particionados por planeta. Antes los lectores calientes
  // (visión enemiga, steering, colisión del jugador) barrían TODOS los
  // colliders de la galaxia filtrando por planetId en cada comprobación
  // (O(N·M)); ahora cada planeta solo ve su bucket.
  private readonly structureCollidersByPlanet = new Map<string, StructureCollider[]>();
  // --- HITO 2: colliders físicos de props (flora, rocas, obstáculos) ---
  private readonly propCollidersByPlanet = new Map<string, PropCollider[]>();
  private readonly planetGenTotal = new Map<string, number>();
  private readonly planetGenDestroyed = new Map<string, number>();
  private readonly planetKeycardTotal = new Map<string, number>();
  private readonly planetKeycardCollected = new Map<string, number>();
  /** Planetas cuya condición de desbloqueo ya se completó. */
  private readonly completedPlanetIds = new Set<string>();
  /** Buffer preasignado de marcadores de objetivo (cero allocations). */
  private readonly objectiveTargets: ObjectiveTarget[] = [];
  private readonly objectiveTargetResult: ObjectiveTargetResult = { targets: [], count: 0 };
  private heldCount = 0;
  clock = 0;
  globalAlert = false;
  private burrowEjectPending = false;
  private interceptorBouncePending = false;
  private teleportCooldown = 0;
  predictiveShields = false;
  alertBoost = 0; // escalado de detección por baseAlertLevel
  // --- HITO 1: zonas restringidas, infracciones y banner de aviso ---
  readonly restrictedZones: RestrictedZoneRuntime[] = [];
  /** Cache por frame/planeta de la zona restringida bajo el jugador. */
  zoneCachePlanetId: string | null = null;
  /** Infracción hostil reciente (3.5s tras ataque/Estasis/explosión/muro). */
  private recentHostileTimer = 0;
  /** Banner de VIGILANCIA preasignado (sin GC por frame). */
  readonly warningBannerData = { speaker: '', text: '' };
  warningBannerT = 0;
  /** Cambia al aparecer/cambiar/caducar el banner (clave discreta del HUD). */
  warningBannerSeq = 0;

  generatorsDestroyed = 0;
  guardsKnockedOut = 0;
  keycardsCollected = 0;

  /** Callbacks cableados por el GameEngine al construir el nivel. */
  onGlobalAlert: (() => void) | null = null;
  onDisguiseBroken: (() => void) | null = null;
  onTeleportPlayer: ((x: number, y: number, z: number) => void) | null = null;
  /** Sonidos sintetizados (SynthAudio) enrutados por el GameEngine. */
  onSound: ((kind: GameSoundKind) => void) | null = null;
  /** KRONOS derrotado: el GameEngine dispara la victoria y el Battle Report. */
  onKronosDefeated: (() => void) | null = null;
  /**
   * Un planeta completó sus objetivos y el escudo del siguiente cayó en vivo:
   * el GameEngine acumula la ficha de comportamiento, calcula la adaptación
   * de la Red de IA y la inyecta en el planeta recién desbloqueado.
   */
  onPlanetUnlocked: ((planet: PlanetRuntime) => void) | null = null;
  /**
   * FASE B: la alarma cerró de golpe compuertas con `lockdownOnAlert`
   * (LOCKDOWN) — el GameEngine avisa por radio mientras el jugador busca
   * una ruta alternativa.
   */
  onGateLockdown: (() => void) | null = null;
  /** Modo Sandbox: impacto de objeto/explosión contra dianas de retos. */
  onSandboxTargetHit: ((pos: THREE.Vector3, radius: number) => boolean) | null = null;

  /** Red de IA enemiga (P5): FSM, visión, sospecha, steering y proyectiles. */
  private readonly enemyAI = new EnemyAISystem(this);

  constructor(group: THREE.Group, planets: PlanetRuntime[]) {
    this.group = group;
    this.planets = planets;
    for (let i = 0; i < OBJECTIVE_TARGET_MAX; i++) {
      this.objectiveTargets.push({ pos: new THREE.Vector3(), label: '' });
    }
    this.objectiveTargetResult.targets = this.objectiveTargets;
  }

  get held(): number {
    return this.heldCount;
  }

  /** Sospecha máxima que la red de IA tiene sobre el jugador (0..1). */
  get maxSuspicion(): number {
    let max = 0;
    for (const enemy of this.enemies) {
      if (enemy.state === GUARD_STATE_KO) continue;
      if (enemy.suspicion > max) max = enemy.suspicion;
    }
    return max;
  }

  /** Alarma global de la guarnición (radio: cuerpo descubierto, intruso). */
  get isGlobalAlert(): boolean {
    return this.globalAlert;
  }

  /** FASE B: bocadillo de diálogo activo (null si ninguno). */
  get activeDialogue(): { speaker: string; role: string; text: string } | null {
    return this.dialogueNpc !== null ? this.dialogueData : null;
  }

  /** FASE B: clave discreta del diálogo (0 = ninguno, N = línea N). */
  get dialogueKey(): number {
    return this.dialogueNpc !== null ? this.dialogueNpc.dialogueIdx + 2 : 0;
  }

  /** FASE B: hay compuertas selladas por el LOCKDOWN de la alarma. */
  get gateLockdownActive(): boolean {
    return this.lockdownActive;
  }

  /** HITO 1 — Banner de VIGILANCIA activo (null si caducó). */
  get warningBanner(): { speaker: string; text: string } | null {
    return this.warningBannerT > 0 ? this.warningBannerData : null;
  }

  /** HITO 1 — Clave discreta del banner (0 = inactivo) para el HUD React. */
  get warningBannerKey(): number {
    return this.warningBannerT > 0 ? this.warningBannerSeq : 0;
  }

  /** HITO 1 — Acción hostil reciente del jugador (infracción ~3.5s). */
  get playerHostileRecent(): boolean {
    return this.recentHostileTimer > 0;
  }

  // --------------------------------------------------------------------------
  // Comandante KRONOS (Hito 4)
  // --------------------------------------------------------------------------

  /** Vida del jefe normalizada 0..1 (null si el nivel no tiene jefe). */
  get kronosHpRatio(): number | null {
    const k = this.kronos;
    if (!k) return null;
    return Math.max(0, k.hp) / KRONOS_MAX_HP;
  }

  /** Personaje que la postura MLP activa de Kronos contrarresta. */
  get kronosAdaptedTo(): CharacterId | null {
    const k = this.kronos;
    if (!k) return null;
    return postureToCounterCharacter(KRONOS_POSTURES[k.postureIdx]);
  }

  /** Pasos de backpropagation online de la red MLP en este combate. */
  get kronosUpdates(): number {
    return this.kronos?.net.onlineUpdates ?? 0;
  }

  /** El jefe ha caído (dispara la victoria en el GameEngine). */
  get kronosDefeated(): boolean {
    return this.kronos?.defeated ?? false;
  }

  /**
   * Fuente del vector de comportamiento combinado de la run (referencia
   * preasignada del GameEngine, actualizada cada frame sin allocations).
   */
  setKronosBehaviorSource(vec: PlayerBehaviorVector): void {
    this.kronosBehavior = vec;
  }

  // --------------------------------------------------------------------------
  // Construcción de la galaxia completa (allocaciones permitidas: fuera del loop)
  // --------------------------------------------------------------------------
  /**
   * Instancia toda la GALAXY_SPEC en una sola escena: estructuras con su
   * collider tangente, escudos planetarios sobre los planetas bloqueados,
   * balizas sobre generadores/tarjetas, objetos, burbujas, hierba y la
   * guarnición completa de los 5 planetas.
   */
  buildGalaxy(galaxy: GalaxySpec, planets: PlanetRuntime[]): void {
    // Estructuras: mesh visual + collider de colisión/LoS (misma convención).
    // Los arcos emiten además 2 colliders sólidos en sus pilares laterales.
    // HITO 2: se apoyan en la altura exacta del terreno (los pads de
    // aplanado del módulo terrain garantizan h≈0 bajo su huella).
    for (const spec of galaxy.structures) {
      const planet = this.findPlanet(spec.planetId);
      _v1.set(spec.sphericalDir[0], spec.sphericalDir[1], spec.sphericalDir[2]).normalize();
      const groundedRadius =
        planet.spec.radius + getPlanetTerrainOffsetVec(spec.planetId, _v1);
      this.group.add(buildStructureMesh(spec, planet.centerVec, groundedRadius));
      this.addToPlanetBucket(
        this.structureCollidersByPlanet,
        createStructureCollider(spec, planet.centerVec, groundedRadius)
      );
      if (spec.kind === 'arch_gate') {
        for (const pillar of createArchGatePillarColliders(
          spec,
          planet.centerVec,
          groundedRadius
        )) {
          this.addToPlanetBucket(this.structureCollidersByPlanet, pillar);
        }
      }
    }

    // Tormenta de Asteroides Interceptores: todo planeta con
    // unlockedByPlanetId nace "protegido" (accesible, pero con riesgo).
    for (const planet of planets) {
      if (planet.spec.unlockedByPlanetId === null) continue;
      planet.shielded = true;
      const belt = buildInterceptorBelt(planet.spec.radius);
      this.group.add(belt.group);
      planet.shieldMesh = belt.group;
      const axis = new THREE.Vector3(0.22, 1, 0.14).normalize();
      const axisA = new THREE.Vector3(1, 0, 0).cross(axis);
      if (axisA.lengthSq() < 1e-6) axisA.set(0, 0, 1).cross(axis);
      axisA.normalize();
      const axisB = new THREE.Vector3().crossVectors(axis, axisA).normalize();
      const meshes = belt.group.children.filter(
        (child): child is THREE.Mesh => (child as THREE.Mesh).isMesh
      );
      const pos: THREE.Vector3[] = [];
      for (let i = 0; i < belt.asteroidCount; i++) {
        // Posición inicial: el punto de órbita en el ángulo base.
        const orbitPos = new THREE.Vector3()
          .copy(planet.centerVec)
          .addScaledVector(axisA, Math.cos(belt.baseAngles[i]) * belt.orbitRadii[i])
          .addScaledVector(axisB, Math.sin(belt.baseAngles[i]) * belt.orbitRadii[i])
          .addScaledVector(axis, belt.heights[i]);
        pos.push(orbitPos);
      }
      this.interceptors.push({
        planet,
        group: belt.group,
        meshes,
        pos,
        radii: belt.asteroidRadii,
        orbitRadii: belt.orbitRadii,
        heights: belt.heights,
        angles: belt.baseAngles.slice(),
        speeds: belt.speeds,
        axisA,
        axisB,
        axisN: axis,
      });
    }

    // Props ambientales (Hito 2): flora, rocas y obstáculos con grounding
    // exacto sobre el terreno y colisión física real.
    for (const prop of galaxy.props ?? []) this.spawnProp(prop);

    for (const spec of galaxy.objects) this.spawnObject(spec);
    for (const bubble of galaxy.waterBubbles) this.spawnBubble(bubble);
    for (const zone of galaxy.grassZones ?? []) this.spawnGrass(zone);
    // HITO 1: zonas restringidas con dirección y coseno precomputados.
    for (const zone of galaxy.restrictedZones ?? []) {
      this.restrictedZones.push({
        spec: zone,
        planetId: zone.planetId,
        dir: new THREE.Vector3(...zone.sphericalDir).normalize(),
        cosThreshold: Math.cos(zone.angularRadius),
      });
    }
    for (const enemy of galaxy.enemies) this.spawnEnemy(enemy);
    for (const npc of galaxy.npcs ?? []) this.spawnNpc(npc);

    // Pool de explosiones / ondas expansivas (reutilizado, sin GC).
    for (let i = 0; i < 4; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xfb923c,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), material);
      mesh.visible = false;
      this.group.add(mesh);
      this.explosions.push({ mesh, material, active: false, t: 0, radius: 1 });
    }

    // HITO 3: pool de anillos de impacto carmesí (shock-ring del daño).
    for (let i = 0; i < 4; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xef4444,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(new THREE.TorusGeometry(1, 0.07, 8, 40), material);
      mesh.visible = false;
      this.group.add(mesh);
      this.damageRings.push({ mesh, material, active: false, t: 0 });
    }

    // Pool de proyectiles luminosos de torreta (parreables con F/Q).
    for (let i = 0; i < PROJECTILE_POOL_SIZE; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xfb923c,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), material);
      mesh.visible = false;
      this.group.add(mesh);
      this.projectiles.push({
        mesh,
        material,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        active: false,
        reflected: false,
        life: 0,
      });
    }

    // Pool de orbes energéticos de KRONOS (parreables: se los devuelves).
    for (let i = 0; i < KRONOS_ORB_POOL_SIZE; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xef4444,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), material);
      mesh.visible = false;
      this.group.add(mesh);
      this.kronosOrbs.push({
        mesh,
        material,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        active: false,
        reflected: false,
        life: 0,
        reason: 'Orbe de energía',
      });
    }
  }

  private findPlanet(id: string): PlanetRuntime {
    const planet = this.planets.find((p) => p.spec.id === id);
    if (!planet) throw new Error(`WorldObjects: planeta desconocido "${id}"`);
    return planet;
  }

  /** Añade un collider al bucket de su planeta (fuente única de colisión). */
  private addToPlanetBucket<T extends { planetId: string }>(
    map: Map<string, T[]>,
    collider: T,
  ): void {
    let bucket = map.get(collider.planetId);
    if (!bucket) {
      bucket = [];
      map.set(collider.planetId, bucket);
    }
    bucket.push(collider);
  }

  private placeOnPlanet(
    mesh: THREE.Object3D,
    planet: PlanetRuntime,
    dirX: number,
    dirY: number,
    dirZ: number,
    altitudeOffset: number
  ): THREE.Vector3 {
    _v1.set(dirX, dirY, dirZ).normalize();
    // HITO 2: todo lo que vive en superficie se apoya en la altura exacta
    // del terreno (cráteres, colinas, valles) del planeta.
    const surfaceAltitude =
      planet.spec.radius + getPlanetTerrainOffsetVec(planet.spec.id, _v1) + altitudeOffset;
    mesh.position.copy(planet.centerVec).addScaledVector(_v1, surfaceAltitude);
    _q1.setFromUnitVectors(_upAxis, _v1);
    mesh.quaternion.copy(_q1);
    return mesh.position;
  }

  private spawnObject(spec: WorldObjectSpec): void {
    const planet = this.findPlanet(spec.planetId);
    const altitude = spec.altitudeOffset ?? 0;
    if (
      spec.kind === 'rock' ||
      spec.kind === 'barrel_explosive' ||
      spec.kind === 'snowball' ||
      spec.kind === 'crate'
    ) {
      const kind = spec.kind as GrabKind;
      const mesh = buildGrabMesh(kind);
      const pos = this.placeOnPlanet(mesh, planet, ...spec.sphericalDir, altitude);
      this.group.add(mesh);
      this.grabs.push({
        kind,
        mesh,
        pos: pos.clone(),
        vel: new THREE.Vector3(),
        radius: spec.radius ?? GRAB_RADIUS[kind],
        state: GRAB_STATE_IDLE,
        spin: 1.5 + (spec.id.length % 5) * 0.4,
        respawnT: 0,
        spawnPos: pos.clone(),
        spawnPlanet: planet,
      });
    } else if (spec.kind === 'generator') {
      const { group, core } = buildGeneratorMesh();
      const pos = this.placeOnPlanet(group, planet, ...spec.sphericalDir, altitude);
      // Baliza vertical: el generador se ve desde cualquier punto del planeta.
      const beacon = buildBeaconBeam('#fbbf24', 16);
      group.add(beacon);
      this.group.add(group);
      this.generators.push({
        mesh: group,
        core,
        coreMaterial: core.material as THREE.MeshBasicMaterial,
        beacon,
        pos: pos.clone(),
        planet,
        hp: 2,
        destroyed: false,
      });
      this.planetGenTotal.set(
        planet.spec.id,
        (this.planetGenTotal.get(planet.spec.id) ?? 0) + 1
      );
    } else if (spec.kind === 'laser_gate') {
      const { group, planeMaterial } = buildLaserGateMesh();
      const pos = this.placeOnPlanet(group, planet, ...spec.sphericalDir, altitude);
      this.group.add(group);
      this.gates.push({
        mesh: group,
        planeMaterial,
        pos: pos.clone(),
        planet,
        cooldown: 0,
        phase: spec.id.length * 1.3,
        disabled: false,
      });
    } else if (spec.kind === 'keycard') {
      const mesh = buildKeycardMesh();
      const pos = this.placeOnPlanet(mesh, planet, ...spec.sphericalDir, altitude);
      // Baliza vertical sobre la tarjeta maestra.
      const beacon = buildBeaconBeam('#fde047', 14);
      mesh.add(beacon);
      this.group.add(mesh);
      this.keycards.push({ mesh, beacon, pos: pos.clone(), planet, collected: false });
      this.planetKeycardTotal.set(
        planet.spec.id,
        (this.planetKeycardTotal.get(planet.spec.id) ?? 0) + 1
      );
    } else if (spec.kind === 'scanner_gate') {
      const { group, planeMaterial } = buildScannerGateMesh();
      const pos = this.placeOnPlanet(group, planet, ...spec.sphericalDir, altitude);
      this.group.add(group);
      this.scanners.push({
        mesh: group,
        planeMaterial,
        pos: pos.clone(),
        planet,
        cooldown: 0,
        phase: spec.id.length * 1.7,
      });
    } else if (spec.kind === 'seismic_mine') {
      const { group, ringMaterial } = buildSeismicMineMesh();
      const pos = this.placeOnPlanet(group, planet, ...spec.sphericalDir, altitude);
      this.group.add(group);
      this.mines.push({
        mesh: group,
        ringMaterial,
        pos: pos.clone(),
        planet,
        exploded: false,
        phase: spec.id.length * 2.1,
      });
    } else if (spec.kind === 'teleport_pipe' || spec.kind === 'teleporter_exit') {
      const isExit = spec.kind === 'teleporter_exit';
      const mesh = buildTeleportPipeMesh(isExit);
      const pos = this.placeOnPlanet(mesh, planet, ...spec.sphericalDir, altitude);
      this.group.add(mesh);
      this.teleporters.push({ mesh, pos: pos.clone(), planet, isExit });
    } else if (spec.kind === 'locked_gate') {
      const halfX = spec.size?.[0] ?? 2.2;
      const heightY = spec.size?.[1] ?? 3.4;
      const halfZ = spec.size?.[2] ?? 0.5;
      const gate = buildLockedGateMesh(halfX, heightY, halfZ);
      const pos = this.placeOnPlanet(gate.group, planet, ...spec.sphericalDir, altitude);
      gate.group.rotateY(spec.yaw ?? 0);
      this.group.add(gate.group);
      // Collider dinámico: bloquea jugador/enemigos/conos mientras está
      // cerrada; Digger puede cruzar por debajo excavando.
      // HITO 2: collider a la altura exacta del terreno bajo la compuerta.
      _v1.set(spec.sphericalDir[0], spec.sphericalDir[1], spec.sphericalDir[2]).normalize();
      const gateGroundedRadius =
        planet.spec.radius + getPlanetTerrainOffsetVec(spec.planetId, _v1);
      const collider = createStructureCollider(
        {
          id: `gate-collider-${spec.id}`,
          kind: 'wall',
          planetId: spec.planetId,
          sphericalDir: spec.sphericalDir,
          altitudeOffset: altitude,
          yaw: spec.yaw ?? 0,
          size: [halfX, heightY, halfZ],
          color: '#3b4463',
          passableUnderground: true,
        },
        planet.centerVec,
        gateGroundedRadius
      );
      this.addToPlanetBucket(this.structureCollidersByPlanet, collider);
      this.lockedGates.push({
        id: spec.id,
        mesh: gate.group,
        barrier: gate.barrier,
        barrierMaterial: gate.barrierMaterial,
        barrierBaseY: gate.barrierBaseY,
        lockMaterial: gate.lockMaterial,
        pos: pos.clone(),
        planet,
        collider,
        closed: true,
        openT: 0,
        requiresKeycard: spec.requiresKeycard ?? false,
        lockdownOnAlert: spec.lockdownOnAlert ?? false,
      });
    } else if (spec.kind === 'switch_lever') {
      const lever = buildSwitchLeverMesh();
      const pos = this.placeOnPlanet(lever.group, planet, ...spec.sphericalDir, altitude);
      lever.group.rotateY(spec.yaw ?? 0);
      this.group.add(lever.group);
      this.switchLevers.push({
        id: spec.id,
        mesh: lever.group,
        leverPivot: lever.leverPivot,
        crystalMaterial: lever.crystalMaterial,
        pos: pos.clone(),
        planet,
        activated: false,
        linkedGateId: spec.linkedGateId ?? null,
      });
    } else if (spec.kind === 'breakable_wall') {
      const halfX = spec.size?.[0] ?? 2.4;
      const heightY = spec.size?.[1] ?? 3.2;
      const halfZ = spec.size?.[2] ?? 0.6;
      const wall = buildBreakableWallMesh(halfX, heightY, halfZ);
      const pos = this.placeOnPlanet(wall.group, planet, ...spec.sphericalDir, altitude);
      wall.group.rotateY(spec.yaw ?? 0);
      this.group.add(wall.group);
      // HITO 2: collider a la altura exacta del terreno bajo el muro.
      _v1.set(spec.sphericalDir[0], spec.sphericalDir[1], spec.sphericalDir[2]).normalize();
      const wallGroundedRadius =
        planet.spec.radius + getPlanetTerrainOffsetVec(spec.planetId, _v1);
      const collider = createStructureCollider(
        {
          id: `wall-collider-${spec.id}`,
          kind: 'wall',
          planetId: spec.planetId,
          sphericalDir: spec.sphericalDir,
          altitudeOffset: altitude,
          yaw: spec.yaw ?? 0,
          size: [halfX, heightY, halfZ],
          color: '#57534e',
          passableUnderground: true,
        },
        planet.centerVec,
        wallGroundedRadius
      );
      this.addToPlanetBucket(this.structureCollidersByPlanet, collider);
      this.breakableWalls.push({
        id: spec.id,
        mesh: wall.group,
        crackMaterial: wall.crackMaterial,
        pos: pos.clone(),
        planet,
        collider,
        hp: BREAKABLE_WALL_HP,
        broken: false,
      });
    }
  }

  /**
   * FASE B — NPC amigable sobre la superficie: mira al jugador cuando se
   * acerca y avanza por sus líneas de diálogo con [E].
   */
  private spawnNpc(spec: NpcSpec): void {
    const planet = this.findPlanet(spec.planetId);
    const mesh = buildNpcModel(spec.accentColor);
    const altOffset = spec.altitudeOffset ?? 0;
    let pos: THREE.Vector3;
    const dir = new THREE.Vector3();
    if (spec.worldPos) {
      pos = new THREE.Vector3(spec.worldPos[0], spec.worldPos[1], spec.worldPos[2]);
      dir.set(0, 1, 0);
      mesh.position.copy(pos);
      mesh.quaternion.identity();
    } else {
      pos = this.placeOnPlanet(mesh, planet, ...spec.sphericalDir, altOffset);
      dir.set(...spec.sphericalDir).normalize();
    }
    mesh.rotateY(spec.yaw ?? 0);
    this.group.add(mesh);
    // Tangente de mirada base: el +Z local del modelo ya girado con yaw.
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(mesh.quaternion);
    forward.addScaledVector(dir, -forward.dot(dir));
    if (forward.lengthSq() < 1e-6) forward.set(1, 0, 0).cross(dir);
    forward.normalize();
    const waypoints = (spec.patrolDirs ?? []).map((d) => new THREE.Vector3(...d).normalize());
    this.npcs.push({
      spec,
      mesh,
      rig: collectNpcRig(mesh),
      pos: pos.clone(),
      planet,
      dir,
      forward,
      dialogueIdx: -1,
      waypoints,
      wpIndex: 0,
      altitudeOffset: altOffset,
    });
  }

  private spawnProp(spec: PropSpec): void {
    const planet = this.findPlanet(spec.planetId);
    const mesh = buildPropMesh(spec.kind);
    mesh.name = `prop-${spec.id}`;
    mesh.scale.setScalar(spec.scale ?? 1);
    this.placeOnPlanet(mesh, planet, ...spec.sphericalDir, spec.altitudeOffset ?? 0);
    mesh.rotateY(spec.yaw ?? 0);
    this.group.add(mesh);
    // HITO 2: registra los colliders físicos del prop sobre el terreno exacto.
    this.pushPropColliders(spec, planet, mesh, spec.scale ?? 1, spec.altitudeOffset ?? 0);
  }

  /**
   * HITO 2 — Emite los PropCollider de un prop según su blueprint: collider
   * único en el centro o pilares gemelos (torii/arco: se choca con los
   * pilares y se pasa bajo el arco). La base se apoya en la altura exacta
   * del terreno en la dirección de cada collider.
   */
  private pushPropColliders(
    spec: PropSpec,
    planet: PlanetRuntime,
    mesh: THREE.Object3D,
    scale: number,
    altitudeOffset: number
  ): void {
    const blueprint = PROP_COLLIDER_BLUEPRINTS[spec.kind];
    if (blueprint === undefined) return; // stone_path / wood_bridge: transitable

    const push = (center: THREE.Vector3, upDir: THREE.Vector3, baseAltitude: number, id: string): void => {
      this.addToPlanetBucket(this.propCollidersByPlanet, {
        id,
        planetId: spec.planetId,
        center,
        upDir,
        baseAltitude,
        radius: blueprint.radius * scale,
        height: blueprint.height * scale,
        capRadius: blueprint.capRadius * scale,
        capY: blueprint.capY * scale,
        bounceImpulse: blueprint.bounceImpulse,
        softFoliage: blueprint.softFoliage,
        isStealthBush: blueprint.stealthBush,
      });
    };

    if (blueprint.twinPillarOffset > 0) {
      // Pilares gemelos a ±offset·scale en el eje X local del mesh girado.
      for (const side of [-1, 1]) {
        _v1
          .set(side * blueprint.twinPillarOffset * scale, 0, 0)
          .applyQuaternion(mesh.quaternion);
        _v2.copy(mesh.position).add(_v1);
        _v3.copy(_v2).sub(planet.centerVec);
        const len = _v3.length();
        if (len < 1e-6) continue;
        _v3.divideScalar(len);
        const terrainH = getPlanetTerrainOffsetVec(spec.planetId, _v3);
        const baseAltitude = terrainH + altitudeOffset;
        _v2.copy(planet.centerVec).addScaledVector(_v3, planet.spec.radius + baseAltitude);
        push(
          _v2.clone(),
          _v3.clone(),
          baseAltitude,
          `${spec.id}-pillar-${side > 0 ? 'r' : 'l'}`
        );
      }
      return;
    }

    // Collider único: la base del mesh ya vive en la superficie del terreno.
    _v3.copy(mesh.position).sub(planet.centerVec);
    const baseAltitude = _v3.length() - planet.spec.radius;
    _v3.normalize();
    push(mesh.position.clone(), _v3.clone(), baseAltitude, spec.id);
  }

  private spawnBubble(spec: WaterBubbleSpec): void {
    const mesh = buildBubbleMesh(spec.radius);
    mesh.position.set(...spec.center);
    this.group.add(mesh);
    this.bubbles.push({
      center: new THREE.Vector3(...spec.center),
      radius: spec.radius,
      mesh,
      phase: spec.id.length * 0.9,
    });
  }

  private spawnGrass(spec: GrassZoneSpec): void {
    const planet = this.findPlanet(spec.planetId);
    const center = new THREE.Vector3(...spec.sphericalDir).normalize();
    let t1 = new THREE.Vector3(0, 1, 0).cross(center);
    if (t1.lengthSq() < 1e-6) t1 = new THREE.Vector3(1, 0, 0).cross(center);
    t1.normalize();
    const t2 = new THREE.Vector3().crossVectors(center, t1).normalize();

    const bladeGeometry = new THREE.ConeGeometry(0.07, 1.1, 4);
    const bladeMaterial = createToonMaterial('#4ade80');
    const blades = new THREE.InstancedMesh(bladeGeometry, bladeMaterial, GRASS_BLADES_PER_ZONE);
    blades.name = `grass-${spec.id}`;
    const dir = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    for (let i = 0; i < GRASS_BLADES_PER_ZONE; i++) {
      const a = (i / GRASS_BLADES_PER_ZONE) * Math.PI * 2 * 3.7; // espiral determinista
      const r = spec.angularRadius * Math.sqrt((i % 17) / 17);
      dir
        .copy(center)
        .addScaledVector(t1, Math.cos(a) * r)
        .addScaledVector(t2, Math.sin(a) * r)
        .normalize();
      // HITO 2: cada brizna se apoya en la altura exacta del terreno.
      _dummy.position
        .copy(planet.centerVec)
        .addScaledVector(
          dir,
          planet.spec.radius + getPlanetTerrainOffsetVec(spec.planetId, dir) + 0.5
        );
      quat.setFromUnitVectors(_upAxis, dir);
      _dummy.quaternion.copy(quat);
      _dummy.rotateY((i * 2.399) % (Math.PI * 2));
      const scale = 0.75 + ((i * 7) % 10) / 18;
      _dummy.scale.set(scale, scale * (0.9 + ((i * 3) % 5) / 10), scale);
      _dummy.updateMatrix();
      blades.setMatrixAt(i, _dummy.matrix);
    }
    blades.instanceMatrix.needsUpdate = true;
    this.group.add(blades);
    this.grassZones.push({
      planetId: spec.planetId,
      dir: center,
      cosThreshold: Math.cos(spec.angularRadius * 1.15),
    });
  }

  private spawnEnemy(spec: EnemySpawnSpec): void {
    if (spec.kind === 'kronos') {
      this.spawnKronos(spec);
      return;
    }
    const planet = this.findPlanet(spec.planetId);
    // Modelo por skin temática (animales de la selva en Verdant) con
    // fallback limpio al uniforme por defecto de cada kind.
    const skin = spec.skin ?? 'default';
    const mesh = buildEnemyModelBySkin(spec.kind, skin);
    // Cono de visión adherido al suelo delante de guardias y oficiales
    // (curvado con el radio del planeta para abrazar la esfera).
    let visionCone: THREE.Mesh | null = null;
    let visionConeMaterial: THREE.MeshBasicMaterial | null = null;
    if (spec.kind === 'guard' || spec.kind === 'officer') {
      const cone = buildVisionConeMesh(
        ENEMY_PARAMS[spec.kind].detectRange,
        Math.acos(VISION_MIN_DOT),
        planet.spec.radius
      );
      visionCone = cone.mesh;
      visionConeMaterial = cone.material;
      mesh.add(cone.mesh);
    }
    // Iconos 3D de estado sobre la cabeza ('?' amarillo / '!' rojo).
    const icons = buildStateIcons();
    mesh.add(icons.group);
    // HITO 1: anillo de telegraph del windup bajo los caminantes (guardia,
    // oficial, brute): marca el área real del golpe (attackRange + 0.9).
    // HITO 3: los drones también lo llevan — flota como halo a su altura de
    // hover y marca el área del zap durante su windup de 0.35s.
    let windupRing: THREE.Mesh | null = null;
    let windupRingMaterial: THREE.MeshBasicMaterial | null = null;
    if (
      spec.kind === 'guard' ||
      spec.kind === 'officer' ||
      spec.kind === 'brute' ||
      spec.kind === 'drone'
    ) {
      windupRingMaterial = new THREE.MeshBasicMaterial({
        color: CONE_COLOR_WARNING,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      windupRing = new THREE.Mesh(
        new THREE.TorusGeometry(
          ENEMY_PARAMS[spec.kind].attackRange + WINDUP_WHIFF_MARGIN,
          0.09,
          8,
          40
        ),
        windupRingMaterial
      );
      windupRing.rotation.x = Math.PI / 2; // tumbado: plano del suelo local (XZ)
      windupRing.position.y = 0.07;
      windupRing.visible = false;
      mesh.add(windupRing);
    }
    const waypoints: THREE.Vector3[] = [];
    for (const dir of spec.patrolDirs) {
      waypoints.push(new THREE.Vector3(...dir).normalize());
    }
    // Torretas y enemigos sin ruta: se anclan al primer waypoint dado.
    const dir =
      waypoints.length > 0 ? waypoints[0] : new THREE.Vector3(0, 1, 0).normalize();
    if (waypoints.length === 0) waypoints.push(dir);
    const altitudeOffset = spec.altitudeOffset ?? 0;
    const pos = this.placeOnPlanet(mesh, planet, dir.x, dir.y, dir.z, altitudeOffset);
    this.group.add(mesh);
    // Tangente de mirada base: si hay segundo waypoint en vigías, apunta hacia él.
    const baseForward = new THREE.Vector3(0, 0, 1);
    if (spec.stationaryLookout && waypoints.length >= 2) {
      baseForward.copy(waypoints[1]).sub(dir);
    }
    baseForward.addScaledVector(dir, -baseForward.dot(dir));
    if (baseForward.lengthSq() < 1e-6) baseForward.set(1, 0, 0).cross(dir);
    baseForward.normalize();
    // HITO 4: cachea los pivotes nombrados UNA vez (cero búsquedas por frame).
    const rig = collectEnemyRig(mesh);
    this.enemies.push({
      kind: spec.kind,
      skin,
      planet,
      mesh,
      pos: pos.clone(),
      dir: dir.clone(),
      forward: baseForward.clone(),
      waypoints,
      waypointIdx: 1 % waypoints.length,
      state: GUARD_STATE_PATROL,
      windupT: 0,
      attackCd: 0.5 + (spec.kind.length % 3) * 0.3,
      suspicion: 0,
      helmet: spec.hasHelmet ?? false,
      paired: spec.pairedWithNext ?? false,
      searchT: 0,
      lastSeenDir: dir.clone(),
      koTimer: 0,
      koRadioSent: false,
      hoverPhase: spec.kind.length * 1.3,
      walkPhase: spec.kind.length * 0.9,
      rig,
      baseScale: mesh.scale.x,
      smoothSpeedRatio: 0,
      strikeAnimT: 0,
      prevForward: baseForward.clone(),
      hoverBank: 0,
      // HITO 4: arranca en el terreno real (sin hundirse en la colina al
      // aparecer); luego el filtro asimétrico lo mantiene despejado.
      smoothTerrainY: getPlanetTerrainOffsetVec(planet.spec.id, dir),
      prevPos: pos.clone(),
      shadowHalo: mesh.getObjectByName('shadowHalo') ?? null,
      params: ENEMY_PARAMS[spec.kind],
      visionCone,
      visionConeMaterial,
      flankSide: this.enemies.length % 2 === 0 ? 1 : -1,
      iconQuestion: icons.question,
      iconAlert: icons.alert,
      altitudeOffset,
      stationaryLookout: spec.stationaryLookout ?? false,
      dropsKeycard: spec.dropsKeycard ?? false,
      lookoutPhase: spec.kind.length * 0.7,
      baseForward,
      warningT: 0,
      warningGazeT: 0,
      warningCloseT: 0,
      warningCooldown: 0,
      steerBias: this.enemies.length % 2 === 0 ? 1 : -1,
      turnVel: 0,
      windupRing,
      windupRingMaterial,
    });
  }

  // --------------------------------------------------------------------------
  // Comandante KRONOS (Hito 4): spawn, red MLP, ataques y daño
  // --------------------------------------------------------------------------

  private spawnKronos(spec: EnemySpawnSpec): void {
    const planet = this.findPlanet(spec.planetId);
    const { group, ringMaterial, maceGroup } = buildKronosModel();
    const dir = new THREE.Vector3(
      ...(spec.patrolDirs[0] ?? ([0, 1, 0] as [number, number, number]))
    ).normalize();
    const pos = this.placeOnPlanet(group, planet, dir.x, dir.y, dir.z, 0);
    this.group.add(group);
    // HITO 4: rig del jefe cacheado una vez + parámetros reutilizables.
    const rig = collectKronosRig(group);
    this.kronosAnim.torso = rig.torso;
    this.kronosAnim.torsoBaseY = rig.torsoBaseY;
    this.kronosAnim.mace = rig.mace;
    this.kronosAnim.ring = rig.ring;
    this.kronosAnim.ringMaterial = ringMaterial;
    this.kronos = {
      mesh: group,
      ringMaterial,
      maceGroup,
      rig,
      planet,
      pos: pos.clone(),
      dir: dir.clone(),
      forward: new THREE.Vector3(0, 0, 1),
      hp: KRONOS_MAX_HP,
      net: new KronosNeuralNet(),
      postureIdx: 0,
      state: KRONOS_STATE_CHASE,
      windupT: 0,
      stunT: 0,
      swingCd: 1.5,
      orbCd: 2.0,
      powerCd: 3.0,
      postureCd: 0,
      defeated: false,
      clock: 0,
    };
    this.applyKronosPostureVisual();
  }

  /** Color del anillo de energía según la postura activa de la red MLP. */
  private applyKronosPostureVisual(): void {
    const k = this.kronos;
    if (!k) return;
    k.ringMaterial.color.set(KRONOS_POSTURE_RING_COLORS[k.postureIdx]);
  }

  /** Rota la posición de Kronos sobre la esfera hacia `targetDir`. */
  private moveKronosTowards(
    k: KronosObj,
    targetDir: THREE.Vector3,
    speed: number,
    dt: number
  ): void {
    const dot = THREE.MathUtils.clamp(k.dir.dot(targetDir), -1, 1);
    const angle = Math.acos(dot);
    if (angle < 1e-5) return;
    const step = Math.min((speed / k.planet.spec.radius) * dt, angle);
    _v1.copy(k.dir).cross(targetDir);
    if (_v1.lengthSq() < 1e-10) {
      _v1.set(1, 0, 0).cross(k.dir);
      if (_v1.lengthSq() < 1e-10) _v1.set(0, 1, 0).cross(k.dir);
    }
    _v1.normalize();
    _q1.setFromAxisAngle(_v1, step);
    k.dir.applyQuaternion(_q1).normalize();
    _v2.copy(targetDir).addScaledVector(k.dir, -THREE.MathUtils.clamp(targetDir.dot(k.dir), -1, 1));
    if (_v2.lengthSq() > 1e-10) k.forward.copy(_v2).normalize();
  }

  /** Transform del jefe sobre la esfera (+ tumbado si fue derrotado). */
  private syncKronosTransform(k: KronosObj): void {
    // HITO 2: KRONOS pisa la altura exacta del terreno (arena aplanada).
    k.pos
      .copy(k.planet.centerVec)
      .addScaledVector(
        k.dir,
        k.planet.spec.radius + getPlanetTerrainOffsetVec(k.planet.spec.id, k.dir)
      );
    k.mesh.position.copy(k.pos);
    _q1.setFromUnitVectors(_upAxis, k.dir);
    _v3.set(0, 0, 1).applyQuaternion(_q1);
    const cosYaw = _v3.dot(k.forward);
    _v4.copy(_v3).cross(k.forward);
    const yaw = Math.atan2(_v4.dot(k.dir), cosYaw);
    // Mismo fix que los guardias: yaw sobre el eje LOCAL (0,1,0).
    _q2.setFromAxisAngle(_upAxis, yaw);
    k.mesh.quaternion.copy(_q1).multiply(_q2);
    if (k.defeated) {
      _q2.setFromAxisAngle(_v3.set(0, 0, 1), 1.45);
      k.mesh.quaternion.multiply(_q2);
    }
  }

  /**
   * Un paso de aprendizaje online que refuerza la postura activa (la postura
   * está funcionando: bloqueó o golpeó al jugador).
   */
  private reinforceKronosPosture(k: KronosObj): void {
    if (!this.kronosBehavior) return;
    computeBehaviorPercentagesInto(this.kronosBehavior, this.kronosPct);
    buildKronosInput(this.kronosPct, this.kronosCharacter, this.kronosInput);
    k.net.trainOnline(this.kronosInput, k.postureIdx);
  }

  /**
   * Daño al jefe. El escudo frontal de `anti_stasis` reduce el daño frontal
   * (salvo flanqueo); si está aturdido por un Parry recibe daño x2. Cada
   * golpe dispara un paso real de backpropagation online: Kronos aprende a
   * contrarrestar al personaje que lo está dañando.
   */
  private damageKronos(amount: number, fromPos: THREE.Vector3, source: HitSource): void {
    const k = this.kronos;
    if (!k || k.defeated) return;
    let mul = 1;
    if (k.postureIdx === 3 && k.state !== KRONOS_STATE_STUNNED) {
      // Escudo frontal: solo protege el arco frontal (flanquea para dañar).
      _v1.copy(fromPos).sub(k.pos);
      const d = _v1.length();
      if (d > 1e-6) {
        _v1.divideScalar(d);
        if (k.forward.dot(_v1) > KRONOS_FRONT_SHIELD_DOT) {
          mul *= KRONOS_FRONT_SHIELD_MUL;
          this.reinforceKronosPosture(k); // la postura bloqueó: refuerzo online
        }
      }
    }
    if (k.state === KRONOS_STATE_STUNNED) mul *= KRONOS_STUN_DAMAGE_MUL;
    k.hp = Math.max(0, k.hp - amount * mul);
    this.onSound?.('bossHit');
    this.spawnExplosion(k.pos, 2.2, 0xfca5a5);
    // Aprendizaje online: postura que contrarresta al personaje que daña.
    if (this.kronosBehavior) {
      computeBehaviorPercentagesInto(this.kronosBehavior, this.kronosPct);
      buildKronosInput(this.kronosPct, this.kronosCharacter, this.kronosInput);
      const target =
        source === 'stasis' || source === 'parry'
          ? ANTI_STASIS_INDEX
          : counterCharacterToPostureIndex(this.kronosCharacter);
      k.net.trainOnline(this.kronosInput, target);
    }
    if (k.hp <= 0) this.defeatKronos(k);
  }

  private defeatKronos(k: KronosObj): void {
    k.defeated = true;
    k.ringMaterial.opacity = 0;
    this.spawnExplosion(k.pos, 8, 0xf97316);
    this.spawnExplosion(k.pos, 5, 0xfacc15);
    this.onSound?.('explosion');
    this.onKronosDefeated?.();
  }

  /** Orbe energético teledirigido al jugador (parreable con F/Q). */
  private spawnKronosOrb(k: KronosObj, state: WorldPlayerState, reason = 'Orbe de energía'): void {
    for (const orb of this.kronosOrbs) {
      if (orb.active) continue;
      orb.active = true;
      orb.reflected = false;
      orb.life = KRONOS_ORB_LIFE;
      orb.reason = reason;
      orb.material.color.set(0xef4444);
      orb.pos.copy(k.pos).addScaledVector(k.dir, 2.6).addScaledVector(k.forward, 1.5);
      orb.vel
        .copy(state.pos)
        .addScaledVector(state.up, 0.5)
        .sub(orb.pos)
        .normalize()
        .multiplyScalar(KRONOS_ORB_SPEED);
      orb.mesh.position.copy(orb.pos);
      orb.mesh.visible = true;
      return;
    }
  }

  /**
   * Poder según la postura MLP activa: pulso anti-sigilo (anti_kitsune),
   * onda sísmica contra excavación (anti_digger), ráfaga aérea (anti_axel) o
   * destello del escudo frontal (anti_stasis, pasivo).
   */
  private kronosPosturePower(
    k: KronosObj,
    state: WorldPlayerState,
    onPlayerDamage: PlayerDamageFn
  ): void {
    switch (KRONOS_POSTURES[k.postureIdx]) {
      case 'anti_kitsune': {
        // Pulso anti-sigilo: delata y daña al jugador oculto (disfraz/hierba).
        this.spawnExplosion(k.pos, KRONOS_PULSE_RADIUS, 0xf97316);
        _v1.copy(state.pos).sub(k.pos);
        if (_v1.length() < KRONOS_PULSE_RADIUS && (state.disguised || state.inGrass)) {
          _v1.normalize().multiplyScalar(10).addScaledVector(state.up, 5);
          onPlayerDamage(
            1,
            _v1.x,
            _v1.y,
            _v1.z,
            'Comandante KRONOS',
            'Pulso anti-sigilo',
            k.pos.x,
            k.pos.y,
            k.pos.z
          );
          this.reinforceKronosPosture(k);
        }
        break;
      }
      case 'anti_digger': {
        // Onda sísmica: expulsa del subsuelo a quien excave cerca.
        this.spawnExplosion(k.pos, KRONOS_SEISMIC_RADIUS, 0xfacc15);
        if (state.burrowing && k.pos.distanceTo(state.pos) < KRONOS_SEISMIC_RADIUS) {
          this.burrowEjectPending = true;
          onPlayerDamage(
            1,
            state.up.x * 8,
            state.up.y * 8,
            state.up.z * 8,
            'Comandante KRONOS',
            'Onda sísmica',
            k.pos.x,
            k.pos.y,
            k.pos.z
          );
          this.reinforceKronosPosture(k);
        }
        break;
      }
      case 'anti_axel': {
        // Ráfaga aérea: orbe directo contra el jugador en el aire.
        if (state.airborne && k.pos.distanceTo(state.pos) < KRONOS_AIR_BURST_RANGE) {
          this.spawnKronosOrb(k, state, 'Ráfaga antiaérea');
          this.reinforceKronosPosture(k);
        }
        break;
      }
      case 'anti_stasis': {
        // Destello del escudo frontal (la reducción de daño es pasiva).
        this.spawnExplosion(k.pos, 3.5, 0xa78bfa);
        break;
      }
    }
  }

  /** Ciclo de combate del jefe: persecución, maza, orbes, posturas y stun. */
  private updateKronos(dt: number, state: WorldPlayerState, onPlayerDamage: PlayerDamageFn): void {
    const k = this.kronos;
    if (!k) return;
    if (k.defeated) {
      // HITO 4: el animador acomoda la pose de derrota (torso caído, anillo
      // apagado) antes de sincronizar la transformada.
      const anim = this.kronosAnim;
      anim.state = k.state;
      anim.windupProgress = 0;
      anim.speedRatio = 0;
      anim.clock = k.clock;
      anim.dt = dt;
      anim.defeated = true;
      animateKronos(anim);
      this.syncKronosTransform(k);
      return;
    }
    k.clock += dt;

    // Re-predicción de la postura con la red MLP (pesos offline + online).
    k.postureCd -= dt;
    if (k.postureCd <= 0 && this.kronosBehavior) {
      k.postureCd = KRONOS_POSTURE_REEVAL;
      computeBehaviorPercentagesInto(this.kronosBehavior, this.kronosPct);
      buildKronosInput(this.kronosPct, state.characterId, this.kronosInput);
      const idx = k.net.predict(this.kronosInput);
      if (idx !== k.postureIdx) {
        k.postureIdx = idx;
        this.applyKronosPostureVisual();
      }
    }

    _v1.copy(state.pos).sub(k.pos);
    const playerDist = _v1.length();

    if (k.state === KRONOS_STATE_STUNNED) {
      // Aturdido por Parry: la maza cae y recibe daño x2.
      k.stunT -= dt;
      if (k.stunT <= 0) {
        k.state = KRONOS_STATE_CHASE;
        k.maceGroup.rotation.z = -0.25;
        k.swingCd = 0.6;
      }
    } else if (k.state === KRONOS_STATE_WINDUP) {
      // Windup claro del barrido de maza: ventana de Parry (F/Q).
      k.windupT -= dt;
      if (k.windupT <= 0) {
        k.state = KRONOS_STATE_CHASE;
        k.swingCd = KRONOS_SWING_CD;
        k.maceGroup.rotation.x = 2.3;
        if (playerDist < KRONOS_MELEE_RANGE + 1.4) {
          _v1.copy(state.pos).sub(k.pos).divideScalar(Math.max(playerDist, 1e-6));
          _v1.multiplyScalar(11).addScaledVector(state.up, 5);
          onPlayerDamage(
            1,
            _v1.x,
            _v1.y,
            _v1.z,
            'Comandante KRONOS',
            'Mazazo imperial',
            k.pos.x,
            k.pos.y,
            k.pos.z
          );
        }
      }
    } else {
      // Persecución sobre la esfera + selección de ataque.
      k.swingCd -= dt;
      k.orbCd -= dt;
      k.powerCd -= dt;
      _v2.copy(state.pos).sub(k.planet.centerVec).normalize();
      this.moveKronosTowards(k, _v2, KRONOS_CHASE_SPEED, dt);
      if (playerDist < KRONOS_MELEE_RANGE && k.swingCd <= 0) {
        k.state = KRONOS_STATE_WINDUP;
        k.windupT = KRONOS_WINDUP;
        // HITO 3: affordance sonora del windup del mazazo (click de carga).
        this.onSound?.('telegraph');
      } else if (playerDist < KRONOS_ORB_RANGE && k.orbCd <= 0) {
        k.orbCd = KRONOS_ORB_CD;
        this.spawnKronosOrb(k, state);
      }
      if (k.powerCd <= 0) {
        k.powerCd = KRONOS_POWER_CD;
        this.kronosPosturePower(k, state, onPlayerDamage);
      }
    }

    // HITO 4: animador procedural del jefe (paso pesado, arco de la maza y
    // anillo de energía pulsando) con parámetros preasignados.
    const anim = this.kronosAnim;
    anim.state = k.state;
    anim.windupProgress = 1 - Math.max(k.windupT, 0) / KRONOS_WINDUP;
    anim.speedRatio = k.state === KRONOS_STATE_CHASE ? 1 : 0;
    anim.clock = k.clock;
    anim.dt = dt;
    anim.defeated = false;
    animateKronos(anim);

    this.syncKronosTransform(k);
  }

  /** Vuelo de los orbes de KRONOS (parreados vuelven directamente al jefe). */
  private updateKronosOrbs(
    dt: number,
    state: WorldPlayerState,
    onPlayerDamage: PlayerDamageFn
  ): void {
    const k = this.kronos;
    for (const orb of this.kronosOrbs) {
      if (!orb.active) continue;
      orb.life -= dt;
      orb.pos.addScaledVector(orb.vel, dt);
      orb.mesh.position.copy(orb.pos);

      // Orbe devuelto con Parry: impacta contra KRONOS.
      if (orb.reflected && k && !k.defeated && orb.pos.distanceToSquared(k.pos) < 6.5) {
        this.enemyAI.deactivateProjectile(orb);
        this.damageKronos(1, orb.pos, 'parry');
        continue;
      }

      // Impacto contra el jugador.
      if (orb.pos.distanceToSquared(state.pos) < KRONOS_ORB_HIT_RADIUS * KRONOS_ORB_HIT_RADIUS) {
        this.enemyAI.deactivateProjectile(orb);
        _v1.copy(orb.vel).normalize().multiplyScalar(9).addScaledVector(state.up, 4);
        onPlayerDamage(
          1,
          _v1.x,
          _v1.y,
          _v1.z,
          'Comandante KRONOS',
          orb.reason ?? 'Orbe de energía',
          orb.pos.x,
          orb.pos.y,
          orb.pos.z
        );
        continue;
      }

      const planet = findStrongestGravityPlanet(orb.pos, this.planets, null);
      // HITO 2: impacto contra el terreno real (colinas/cráteres incluidos).
      _v2.copy(orb.pos).sub(planet.centerVec);
      const orbDist = _v2.length();
      if (orbDist > 1e-6) _v2.divideScalar(orbDist);
      const orbSurface =
        planet.spec.radius + getPlanetTerrainOffsetVec(planet.spec.id, _v2) + 0.3;
      if (orbDist <= orbSurface) {
        this.enemyAI.deactivateProjectile(orb);
      } else if (orb.life <= 0) {
        this.enemyAI.deactivateProjectile(orb);
      }
    }
  }

  /**
   * Inyección dinámica y EN VIVO de la adaptación inter-planeta cuando cae el
   * escudo de un planeta: patrullas extra, cascos blindados, drones, parejas,
   * escáneres, minas sísmicas y torretas antiaéreas desplegadas en ese
   * planeta recién desbloqueado según lo que la IA leyó del jugador.
   */
  applyPlanetAdaptation(planet: PlanetRuntime, adaptation: PlanetAdaptationConfig): void {
    this.predictiveShields = adaptation.predictiveShields;
    this.alertBoost = adaptation.baseAlertLevel * 0.5;
    const rand = makeSeededRandom(
      planet.spec.id.length * 977 + planet.spec.order * 131 + ADAPTED_SPAWN_BASE
    );
    const randomDir = (): [number, number, number] => {
      const u = rand();
      const phi = rand() * Math.PI * 2;
      const cosTheta = 1 - 2 * u;
      const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
      return [sinTheta * Math.cos(phi), cosTheta, sinTheta * Math.sin(phi)];
    };
    const patrolAround = (dir: [number, number, number]): [number, number, number][] => {
      const center = new THREE.Vector3(...dir).normalize();
      let t1 = new THREE.Vector3(0, 1, 0).cross(center);
      if (t1.lengthSq() < 1e-6) t1 = new THREE.Vector3(1, 0, 0).cross(center);
      t1.normalize();
      const t2 = new THREE.Vector3().crossVectors(center, t1).normalize();
      const out: [number, number, number][] = [];
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const d = new THREE.Vector3()
          .copy(center)
          .addScaledVector(t1, Math.cos(a) * 0.12)
          .addScaledVector(t2, Math.sin(a) * 0.12)
          .normalize();
        out.push([d.x, d.y, d.z]);
      }
      return out;
    };

    // Fuerza bruta: patrullas extra con cascos + drones rápidos.
    if (adaptation.extraPatrolCount > 0) {
      for (let i = 0; i < adaptation.extraPatrolCount; i++) {
        const dir = randomDir();
        this.spawnEnemy({
          kind: 'guard',
          planetId: planet.spec.id,
          patrolDirs: patrolAround(dir),
          hasHelmet: adaptation.armoredHelmets,
        });
      }
      for (let i = 0; i < 2; i++) {
        this.spawnEnemy({
          kind: 'drone',
          planetId: planet.spec.id,
          patrolDirs: patrolAround(randomDir()),
        });
      }
    }
    if (adaptation.armoredHelmets) {
      for (const enemy of this.enemies) {
        if (enemy.planet !== planet) continue;
        if (enemy.kind === 'guard' || enemy.kind === 'officer') enemy.helmet = true;
      }
    }
    // Abuso de sigilo: los guardias patrullan en parejas (misma ruta, offset).
    if (adaptation.pairGuardPatrols) {
      const walkers = this.enemies.filter(
        (e) =>
          e.planet === planet &&
          (e.kind === 'guard' || e.kind === 'officer') &&
          e.state !== GUARD_STATE_KO
      );
      for (let i = 0; i + 1 < walkers.length; i += 2) {
        const leader = walkers[i];
        const follower = walkers[i + 1];
        follower.waypoints = leader.waypoints.map((w) => w.clone());
        follower.waypointIdx = Math.floor(leader.waypoints.length / 2);
        leader.paired = true;
        follower.paired = true;
      }
    }
    // Escáneres de puerta anti-disfraces.
    if (adaptation.doorScanners) {
      for (let i = 0; i < 3; i++) {
        this.spawnObject({
          id: `scanner-adapt-${i}`,
          kind: 'scanner_gate',
          planetId: planet.spec.id,
          sphericalDir: randomDir(),
        });
      }
    }
    // Minas sísmicas anti-excavación.
    if (adaptation.seismicMines) {
      for (let i = 0; i < 3; i++) {
        this.spawnObject({
          id: `mina-adapt-${i}`,
          kind: 'seismic_mine',
          planetId: planet.spec.id,
          sphericalDir: randomDir(),
        });
      }
    }
    // Torretas antiaéreas.
    if (adaptation.antiAirTurrets) {
      for (let i = 0; i < 2; i++) {
        this.spawnEnemy({
          kind: 'turret',
          planetId: planet.spec.id,
          patrolDirs: [randomDir()],
        });
      }
    }
  }

  // --------------------------------------------------------------------------
  // Consultas del mundo (usadas por PlayerController / GameEngine)
  // --------------------------------------------------------------------------
  getBubbleAt(pos: THREE.Vector3): WaterBubbleObj | null {
    for (const bubble of this.bubbles) {
      if (pos.distanceToSquared(bubble.center) < (bubble.radius - 0.6) ** 2) {
        return bubble;
      }
    }
    return null;
  }

  /**
   * HITO 1+2 — Cobertura de sigilo: hierba alta de las zonas O follaje denso
   * (helechos/bambú registrados como arbustos de sigilo en sus colliders).
   */
  checkPlayerInGrass(pos: THREE.Vector3, planet: PlanetRuntime): boolean {
    for (const zone of this.grassZones) {
      if (zone.planetId !== planet.spec.id) continue;
      _v1.copy(pos).sub(planet.centerVec);
      if (_v1.lengthSq() < 1e-6) continue;
      _v1.normalize();
      if (_v1.dot(zone.dir) > zone.cosThreshold) return true;
    }
    const propColliders = this.getPropColliders(planet.spec.id);
    for (let i = 0; i < propColliders.length; i++) {
      const c = propColliders[i];
      if (!c.isStealthBush) continue;
      const r = c.radius + 0.4;
      if (pos.distanceToSquared(c.center) < r * r) return true;
    }
    return false;
  }

  /** HITO 2 — El jugador está dentro de follaje denso (helechos/bambú):
   *  empuje elástico suave y factor de velocidad reducido. */
  isInFoliage(pos: THREE.Vector3, planet: PlanetRuntime): boolean {
    const propColliders = this.getPropColliders(planet.spec.id);
    for (let i = 0; i < propColliders.length; i++) {
      const c = propColliders[i];
      if (!c.softFoliage) continue;
      const r = c.radius + 0.5;
      if (pos.distanceToSquared(c.center) < r * r) return true;
    }
    return false;
  }

  grabbableNear(pos: THREE.Vector3): boolean {
    for (const grab of this.grabs) {
      if (grab.state !== GRAB_STATE_IDLE) continue;
      if (grab.pos.distanceToSquared(pos) < STASIS_GRAB_RANGE * STASIS_GRAB_RANGE) return true;
    }
    return false;
  }

  knockoutTargetNear(pos: THREE.Vector3): boolean {
    for (const enemy of this.enemies) {
      if (enemy.state === GUARD_STATE_KO) continue;
      // Brutes, drones y torretas no se pueden noquear por la espalda.
      if (enemy.kind === 'brute' || enemy.kind === 'drone' || enemy.kind === 'turret') continue;
      if (enemy.pos.distanceToSquared(pos) > KNOCKOUT_RANGE * KNOCKOUT_RANGE) continue;
      _v1.copy(pos).sub(enemy.pos).normalize();
      if (enemy.forward.dot(_v1) < -0.1) return true;
    }
    return false;
  }

  guardAttackingNear(pos: THREE.Vector3): boolean {
    for (const enemy of this.enemies) {
      if (enemy.state !== GUARD_STATE_WINDUP) continue;
      if (enemy.pos.distanceToSquared(pos) < (PARRY_RANGE + 1) ** 2) return true;
    }
    // KRONOS en windup: la ventana de Parry de su barrido de maza.
    const kronos = this.kronos;
    if (
      kronos &&
      !kronos.defeated &&
      kronos.state === KRONOS_STATE_WINDUP &&
      kronos.pos.distanceToSquared(pos) < (PARRY_RANGE + 2) ** 2
    ) {
      return true;
    }
    return false;
  }

  anyGuardInCombat(): boolean {
    for (const enemy of this.enemies) {
      if (enemy.state === GUARD_STATE_CHASE || enemy.state === GUARD_STATE_WINDUP) return true;
    }
    return false;
  }

  /**
   * Estasis/Gravity Shift usados delante de un enemigo: delata al jugador
   * disfrazado y dispara su sospecha al 100%.
   */
  reportAbilityUse(pos: THREE.Vector3): void {
    for (const enemy of this.enemies) {
      if (enemy.state === GUARD_STATE_KO) continue;
      if (enemy.kind === 'turret') continue;
      if (enemy.pos.distanceToSquared(pos) > ABILITY_REPORT_RANGE * ABILITY_REPORT_RANGE) {
        continue;
      }
      if (!this.enemyAI.curvatureLOS(enemy.pos, pos, enemy.planet)) continue;
      enemy.suspicion = 1;
    }
  }

  /**
   * HITO 1 — El jugador cometió una acción hostil (disparar Estasis, golpe
   * melee/noqueo, explosión, onda expansiva, embestida con impacto, romper
   * una pared): durante ~3.5s los enemigos que lo vean escalan rápido.
   */
  notifyPlayerHostileAction(): void {
    this.recentHostileTimer = HOSTILE_RECENT_SEC;
  }

  /** Minas sísmicas: consume la petición de eyección del subsuelo. */
  consumeBurrowEject(): boolean {
    if (!this.burrowEjectPending) return false;
    this.burrowEjectPending = false;
    return true;
  }

  // --------------------------------------------------------------------------
  // FASE B — Interacción táctica: compuertas, palancas, NPCs y paredes
  // --------------------------------------------------------------------------
  /**
   * [E] cerca de una compuerta con `requiresKeycard`: la abre si el escuadrón
   * lleva alguna tarjeta/llave robada (la valida como llave maestra).
   */
  tryOpenLockedGate(pos: THREE.Vector3): boolean {
    if (this.keycardsCollected <= 0) return false;
    for (const gate of this.lockedGates) {
      if (!gate.closed || !gate.requiresKeycard) continue;
      if (gate.pos.distanceToSquared(pos) > LOCKED_GATE_INTERACT_RANGE * LOCKED_GATE_INTERACT_RANGE) {
        continue;
      }
      this.setGateOpen(gate, true);
      return true;
    }
    return false;
  }

  /** [E] cerca (< 3.5m) de una palanca sin activar: la activa. */
  tryActivateSwitch(pos: THREE.Vector3): boolean {
    for (const lever of this.switchLevers) {
      if (lever.activated) continue;
      if (lever.pos.distanceToSquared(pos) > SWITCH_LEVER_RANGE * SWITCH_LEVER_RANGE) {
        continue;
      }
      this.activateLever(lever);
      return true;
    }
    return false;
  }

  /**
   * [E] cerca (< 4.5m) de un NPC: avanza por sus líneas de diálogo y
   * devuelve el mensaje activo (bocadillo del HUD durante 7s). El resultado
   * es un objeto preasignado del manager: leerlo, no almacenarlo.
   */
  tryNpcDialogue(pos: THREE.Vector3): { speaker: string; role: string; text: string } | null {
    for (const npc of this.npcs) {
      if (npc.pos.distanceToSquared(pos) > NPC_TALK_RANGE * NPC_TALK_RANGE) continue;
      const lines = npc.spec.dialogue.length;
      npc.dialogueIdx = lines > 0 ? (npc.dialogueIdx + 1) % lines : 0;
      this.dialogueNpc = npc;
      this.dialogueT = NPC_DIALOGUE_DURATION;
      this.dialogueData.speaker = npc.spec.name;
      this.dialogueData.role = npc.spec.role;
      this.dialogueData.text = lines > 0 ? npc.spec.dialogue[npc.dialogueIdx] : '';
      this.onSound?.('npcTalk');
      return this.dialogueData;
    }
    return null;
  }

  /**
   * Embestida de Digger (Gravity Dash / melee) o explosión: daña las paredes
   * rompibles cercanas. `heavy = true` las rompe al instante (Digger/barril);
   * si no, cada golpe resta 1 (una roca de Estasis necesita 2 impactos).
   * Devuelve true si alguna pared se rompió.
   */
  damageBreakableWalls(pos: THREE.Vector3, radius: number, heavy: boolean): boolean {
    let broke = false;
    for (const wall of this.breakableWalls) {
      if (wall.broken) continue;
      const r = radius + wall.collider.halfX;
      if (wall.pos.distanceToSquared(pos) > r * r) continue;
      if (this.damageBreakableWall(wall, heavy ? 2 : 1)) broke = true;
    }
    return broke;
  }

  /** NPC cercano con el que se puede hablar (prompt `[E] Hablar`). */
  npcNear(pos: THREE.Vector3): boolean {
    for (const npc of this.npcs) {
      if (npc.pos.distanceToSquared(pos) < NPC_TALK_RANGE * NPC_TALK_RANGE) return true;
    }
    return false;
  }

  /** Nombre del NPC hablable más cercano (para el prompt del HUD). */
  getNearestNpcName(pos: THREE.Vector3): string | null {
    let best: NpcObj | null = null;
    let bestDistSq = NPC_TALK_RANGE * NPC_TALK_RANGE;
    for (const npc of this.npcs) {
      const distSq = npc.pos.distanceToSquared(pos);
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        best = npc;
      }
    }
    return best ? best.spec.name : null;
  }

  /** Palanca sin activar cerca (prompt `[E] Activar interruptor`). */
  switchNear(pos: THREE.Vector3): boolean {
    for (const lever of this.switchLevers) {
      if (lever.activated) continue;
      if (lever.pos.distanceToSquared(pos) < SWITCH_LEVER_RANGE * SWITCH_LEVER_RANGE) {
        return true;
      }
    }
    return false;
  }

  /** Compuerta cerrada cerca (prompt de abrir / requiere tarjeta). */
  lockedGateNear(pos: THREE.Vector3): boolean {
    for (const gate of this.lockedGates) {
      if (!gate.closed) continue;
      if (gate.pos.distanceToSquared(pos) < LOCKED_GATE_INTERACT_RANGE * LOCKED_GATE_INTERACT_RANGE) {
        return true;
      }
    }
    return false;
  }

  /** Abre/cierra una compuerta: libera/restaura su collider dinámico. */
  setGateOpen(gate: LockedGateObj, open: boolean): void {
    if (gate.closed === !open) return;
    gate.closed = !open;
    gate.collider.disabled = open;
    gate.lockMaterial.color.set(open ? 0x4ade80 : 0xef4444);
    if (open) this.onSound?.('gateOpen');
  }

  /**
   * Activa una palanca: bascula el mando, el cristal pasa a verde y abre la
   * `locked_gate` vinculada (o apaga la `laser_gate` más cercana de su
   * planeta si no tiene `linkedGateId`).
   */
  private activateLever(lever: SwitchLeverObj): void {
    lever.activated = true;
    lever.crystalMaterial.color.set(0x4ade80);
    lever.leverPivot.rotation.x = 0.55;
    this.onSound?.('switchClick');
    if (lever.linkedGateId !== null) {
      for (const gate of this.lockedGates) {
        if (gate.id !== lever.linkedGateId) continue;
        this.setGateOpen(gate, true);
        return;
      }
    }
    // Sin compuerta vinculada: apaga la valla láser más cercana del planeta.
    let best: LaserGateObj | null = null;
    let bestDistSq = Infinity;
    for (const gate of this.gates) {
      if (gate.disabled || gate.planet !== lever.planet) continue;
      const distSq = gate.pos.distanceToSquared(lever.pos);
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        best = gate;
      }
    }
    if (best) {
      best.disabled = true;
      best.mesh.visible = false;
    }
  }

  /** Daña una pared rompible; true si se rompió (FX + collider liberado). */
  private damageBreakableWall(wall: BreakableWallObj, amount: number): boolean {
    if (wall.broken) return false;
    wall.hp -= amount;
    if (wall.hp > 0) {
      // Primer golpe: las grietas pasan al rojo vivo (un golpe más y cae).
      wall.crackMaterial.color.set(0xf97316);
      this.spawnExplosion(wall.pos, 1.8, 0xf97316);
      return false;
    }
    wall.broken = true;
    wall.collider.disabled = true;
    wall.mesh.visible = false;
    this.spawnExplosion(wall.pos, 4.5, 0xfb923c);
    this.spawnExplosion(wall.pos, 3, 0xfbbf24);
    this.onSound?.('wallBreak');
    this.emitNoise(wall.pos, wall.planet);
    // HITO 1: reventar una pared es una acción hostil reciente.
    this.notifyPlayerHostileAction();
    return true;
  }

  /** Cierra el bocadillo de diálogo (timeout o jugador alejado). */
  private clearDialogue(): void {
    this.dialogueNpc = null;
    this.dialogueT = 0;
  }

  // --------------------------------------------------------------------------

  /** Colliders de las estructuras del planeta dado (colisión/visión/steering). */
  getStructureColliders(planetId: string): StructureCollider[] {
    return this.structureCollidersByPlanet.get(planetId) ?? EMPTY_STRUCTURE_COLLIDERS;
  }

  /** HITO 2 — Colliders físicos de los props del planeta dado (flora, rocas). */
  getPropColliders(planetId: string): PropCollider[] {
    return this.propCollidersByPlanet.get(planetId) ?? EMPTY_PROP_COLLIDERS;
  }

  getGeneratorTotalOn(planetId: string): number {
    return this.planetGenTotal.get(planetId) ?? 0;
  }

  getGeneratorsDestroyedOn(planetId: string): number {
    return this.planetGenDestroyed.get(planetId) ?? 0;
  }

  getKeycardTotalOn(planetId: string): number {
    return this.planetKeycardTotal.get(planetId) ?? 0;
  }

  getKeycardsCollectedOn(planetId: string): number {
    return this.planetKeycardCollected.get(planetId) ?? 0;
  }

  /**
   * Marcadores de objetivo del planeta activo en un buffer preasignado:
   * generadores restantes (GEN), tarjetas (TARJETA) y KRONOS. Si el planeta
   * ya completó sus objetivos, apunta al centro del siguiente planeta
   * desbloqueado.
   */
  getObjectiveTargets(activePlanetId: string): ObjectiveTargetResult {
    let n = 0;
    for (const gen of this.generators) {
      if (gen.destroyed || gen.planet.spec.id !== activePlanetId) continue;
      if (n >= OBJECTIVE_TARGET_MAX) break;
      this.objectiveTargets[n].pos.copy(gen.pos);
      this.objectiveTargets[n].label = 'GEN';
      n++;
    }
    for (const card of this.keycards) {
      if (card.collected || card.planet.spec.id !== activePlanetId) continue;
      if (n >= OBJECTIVE_TARGET_MAX) break;
      this.objectiveTargets[n].pos.copy(card.pos);
      this.objectiveTargets[n].label = 'TARJETA';
      n++;
    }
    const kronos = this.kronos;
    if (
      kronos &&
      !kronos.defeated &&
      kronos.planet.spec.id === activePlanetId &&
      n < OBJECTIVE_TARGET_MAX
    ) {
      this.objectiveTargets[n].pos.copy(kronos.pos);
      this.objectiveTargets[n].label = 'KRONOS';
      n++;
    }
    if (n === 0) {
      // Objetivos del planeta completos: siguiente planeta desbloqueado.
      const next = this.planets.find(
        (p) => p.spec.unlockedByPlanetId === activePlanetId && !p.shielded
      );
      if (next) {
        this.objectiveTargets[0].pos.copy(next.centerVec);
        this.objectiveTargets[0].label = next.spec.name.toUpperCase();
        n = 1;
      }
    }
    this.objectiveTargetResult.count = n;
    return this.objectiveTargetResult;
  }

  /**
   * Ruido de distracción (objeto de Estasis lanzado al suelo): los guardias
   * del mismo planeta en patrulla dentro del radio entran en modo
   * investigación, caminan hacia el punto del impacto y vuelven a su ruta.
   */
  private emitNoise(pos: THREE.Vector3, planet: PlanetRuntime): void {
    for (const enemy of this.enemies) {
      if (enemy.planet !== planet) continue;
      if (enemy.state !== GUARD_STATE_PATROL) continue;
      if (enemy.kind === 'drone' || enemy.kind === 'turret') continue;
      if (enemy.pos.distanceToSquared(pos) > NOISE_RADIUS * NOISE_RADIUS) continue;
      enemy.state = GUARD_STATE_SEARCH;
      enemy.searchT = NOISE_SEARCH_DURATION;
      _v6.copy(pos).sub(planet.centerVec).normalize();
      enemy.lastSeenDir.copy(_v6);
      enemy.suspicion = Math.max(enemy.suspicion, 0.45);
    }
  }

  /**
   * Un planeta completó su condición de desbloqueo (todos sus generadores
   * destruidos y, en Iron Bastion, la tarjeta maestra recogida): el escudo
   * del siguiente planeta cae EN VIVO y el GameEngine inyecta allí la
   * adaptación de la Red de IA.
   */
  private checkPlanetUnlock(planetId: string): void {
    if (this.completedPlanetIds.has(planetId)) return;
    const genTotal = this.planetGenTotal.get(planetId) ?? 0;
    if (genTotal === 0) return;
    if ((this.planetGenDestroyed.get(planetId) ?? 0) < genTotal) return;
    const cardTotal = this.planetKeycardTotal.get(planetId) ?? 0;
    if ((this.planetKeycardCollected.get(planetId) ?? 0) < cardTotal) return;

    this.completedPlanetIds.add(planetId);
    const next = this.planets.find(
      (p) => p.spec.unlockedByPlanetId === planetId && p.shielded
    );
    if (!next) return;
    next.shielded = false;
    if (next.shieldMesh) next.shieldMesh.visible = false;
    this.onSound?.('explosion');
    this.onPlanetUnlocked?.(next);
  }

  // --------------------------------------------------------------------------
  // Campo de Estasis
  // --------------------------------------------------------------------------
  grabNearest(pos: THREE.Vector3, forward: THREE.Vector3, range: number): void {
    let best: GrabObject | null = null;
    let bestDistSq = range * range;
    for (const grab of this.grabs) {
      if (grab.state !== GRAB_STATE_IDLE) continue;
      _v1.copy(grab.pos).sub(pos);
      const distSq = _v1.lengthSq();
      if (distSq > bestDistSq) continue;
      _v1.divideScalar(Math.max(Math.sqrt(distSq), 1e-6));
      if (_v1.dot(forward) < -0.25) continue; // acepta ligeramente detrás
      best = grab;
      bestDistSq = distSq;
    }
    if (best) {
      best.state = GRAB_STATE_HELD;
      this.heldCount++;
    }
  }

  /**
   * Dispara UN SOLO objeto de los que orbitan en Estasis, recto hacia `aim`
   * (Lock-On o mira). Devuelve 1 si se lanzó, 0 si no había objetos.
   */
  releaseThrowOne(aim: THREE.Vector3): number {
    if (this.heldCount === 0) return 0;
    for (const grab of this.grabs) {
      if (grab.state !== GRAB_STATE_HELD) continue;
      grab.state = GRAB_STATE_FLYING;
      grab.vel.copy(aim).multiplyScalar(THROW_SPEED);
      this.heldCount--;
      // HITO 1: disparar un objeto de Estasis es una acción hostil.
      this.notifyPlayerHostileAction();
      return 1;
    }
    return 0;
  }

  // --------------------------------------------------------------------------
  // Lock-On (Tab/V + Flechas): guardias, barriles y generadores
  // --------------------------------------------------------------------------

  /** Un handle sigue siendo válido mientras el objetivo exista y esté activo. */
  isLockOnValid(handle: LockOnHandle): boolean {
    if (handle.kind === 'guard') {
      return (
        handle.index >= 0 &&
        handle.index < this.enemies.length &&
        this.enemies[handle.index].state !== GUARD_STATE_KO
      );
    }
    if (handle.kind === 'generator') {
      return (
        handle.index >= 0 &&
        handle.index < this.generators.length &&
        !this.generators[handle.index].destroyed
      );
    }
    if (handle.kind === 'wall') {
      return (
        handle.index >= 0 &&
        handle.index < this.breakableWalls.length &&
        !this.breakableWalls[handle.index].broken
      );
    }
    return (
      handle.index >= 0 &&
      handle.index < this.grabs.length &&
      this.grabs[handle.index].kind === 'barrel_explosive' &&
      this.grabs[handle.index].state === GRAB_STATE_IDLE
    );
  }

  /** Posición mundial actual del objetivo fijado (false si ya no es válido). */
  getLockOnPos(handle: LockOnHandle, out: THREE.Vector3): boolean {
    if (!this.isLockOnValid(handle)) return false;
    if (handle.kind === 'guard') out.copy(this.enemies[handle.index].pos);
    else if (handle.kind === 'generator') out.copy(this.generators[handle.index].pos);
    else if (handle.kind === 'wall') out.copy(this.breakableWalls[handle.index].pos);
    else out.copy(this.grabs[handle.index].pos);
    return true;
  }

  getLockOnName(handle: LockOnHandle): string {
    if (handle.kind === 'generator') return 'Generador';
    if (handle.kind === 'barrel') return 'Barril explosivo';
    if (handle.kind === 'wall') return 'Muro agrietado';
    const enemy = this.enemies[handle.index];
    if (!enemy) return 'Objetivo';
    return this.enemyAI.enemyDisplayName(enemy);
  }

  /**
   * Busca el objetivo fijable más cercano dentro del cono frontal (`dir = 0`)
   * o cicla al siguiente/anterior (`dir = 1 / -1`) en orden angular respecto
   * a `forward`. Devuelve un handle nuevo o null si no hay candidatos.
   */
  findLockOnTarget(
    pos: THREE.Vector3,
    forward: THREE.Vector3,
    range: number,
    current: LockOnHandle | null,
    dir: -1 | 0 | 1
  ): LockOnHandle | null {
    const rangeSq = range * range;
    let n = 0;
    for (let i = 0; i < this.enemies.length && n < LOCK_CANDIDATE_MAX; i++) {
      if (this.enemies[i].state === GUARD_STATE_KO) continue;
      if (this.pushLockCandidate(pos, forward, rangeSq, this.enemies[i].pos, LOCK_KIND_GUARD, i, n)) n++;
    }
    for (let i = 0; i < this.grabs.length && n < LOCK_CANDIDATE_MAX; i++) {
      const grab = this.grabs[i];
      if (grab.kind !== 'barrel_explosive' || grab.state !== GRAB_STATE_IDLE) continue;
      if (this.pushLockCandidate(pos, forward, rangeSq, grab.pos, LOCK_KIND_BARREL, i, n)) n++;
    }
    for (let i = 0; i < this.generators.length && n < LOCK_CANDIDATE_MAX; i++) {
      if (this.generators[i].destroyed) continue;
      if (this.pushLockCandidate(pos, forward, rangeSq, this.generators[i].pos, LOCK_KIND_GENERATOR, i, n)) n++;
    }
    // FASE B: paredes rompibles intactas — fijables con Q para reventarlas
    // con barriles/rocas de Estasis.
    for (let i = 0; i < this.breakableWalls.length && n < LOCK_CANDIDATE_MAX; i++) {
      if (this.breakableWalls[i].broken) continue;
      if (this.pushLockCandidate(pos, forward, rangeSq, this.breakableWalls[i].pos, LOCK_KIND_WALL, i, n)) n++;
    }
    if (n === 0) return null;

    // Orden angular por inserción (pocos candidatos, sin allocations).
    for (let i = 0; i < n; i++) _candOrder[i] = i;
    for (let i = 1; i < n; i++) {
      const key = _candOrder[i];
      let j = i - 1;
      while (j >= 0 && _candAngle[_candOrder[j]] > _candAngle[key]) {
        _candOrder[j + 1] = _candOrder[j];
        j--;
      }
      _candOrder[j + 1] = key;
    }

    let slot = 0;
    if (dir !== 0 && current) {
      const code = lockKindToCode(current.kind);
      for (let i = 0; i < n; i++) {
        if (_candKindCode[_candOrder[i]] === code && _candIndex[_candOrder[i]] === current.index) {
          slot = i;
          break;
        }
      }
      slot = dir > 0 ? (slot + 1) % n : (slot - 1 + n) % n;
    }
    const c = _candOrder[slot];
    return { kind: lockCodeToKind(_candKindCode[c]), index: _candIndex[c] };
  }

  private pushLockCandidate(
    pos: THREE.Vector3,
    forward: THREE.Vector3,
    rangeSq: number,
    targetPos: THREE.Vector3,
    kindCode: number,
    index: number,
    slot: number
  ): boolean {
    _v1.copy(targetPos).sub(pos);
    const distSq = _v1.lengthSq();
    if (distSq > rangeSq || distSq < 1e-6) return false;
    _v1.divideScalar(Math.sqrt(distSq));
    const dot = THREE.MathUtils.clamp(_v1.dot(forward), -1, 1);
    if (dot < LOCK_ON_MIN_DOT) return false;
    _candAngle[slot] = Math.acos(dot);
    _candKindCode[slot] = kindCode;
    _candIndex[slot] = index;
    return true;
  }

  /** Golpe cuerpo a cuerpo corto: noquea guardias / daña generadores / KRONOS. */
  meleeStrike(pos: THREE.Vector3, forward: THREE.Vector3): 'guard' | 'generator' | 'kronos' | null {
    // KRONOS: golpe directo al jefe (el escudo frontal reduce el daño).
    const kronos = this.kronos;
    if (kronos && !kronos.defeated) {
      _v1.copy(kronos.pos).sub(pos);
      const dist = _v1.length();
      if (dist < MELEE_RANGE + 1.6) {
        _v1.divideScalar(Math.max(dist, 1e-6));
        if (_v1.dot(forward) > 0.15) {
          this.damageKronos(1, pos, 'melee');
          this.notifyPlayerHostileAction();
          return 'kronos';
        }
      }
    }
    for (const enemy of this.enemies) {
      if (enemy.state === GUARD_STATE_KO) continue;
      // Drones flotan y las torretas están fuera de alcance del melee.
      if (enemy.kind === 'drone' || enemy.kind === 'turret') continue;
      _v1.copy(enemy.pos).sub(pos);
      const dist = _v1.length();
      if (dist > MELEE_RANGE) continue;
      _v1.divideScalar(Math.max(dist, 1e-6));
      if (_v1.dot(forward) < 0.15) continue;
      // El brute resiste el melee frontal: solo explosivos, parry o estasis.
      if (enemy.kind === 'brute') continue;
      this.notifyPlayerHostileAction();
      this.enemyAI.koEnemy(enemy, 'melee');
      return 'guard';
    }
    for (const gen of this.generators) {
      if (gen.destroyed) continue;
      if (gen.pos.distanceToSquared(pos) < (MELEE_RANGE + 0.8) ** 2) {
        this.damageGenerator(gen, 1);
        this.notifyPlayerHostileAction();
        return 'generator';
      }
    }
    return null;
  }

  /** Gravity Dash: derriba guardias y empuja cajas/barriles al chocar. */
  dashImpact(pos: THREE.Vector3, forward: THREE.Vector3): void {
    // KRONOS: el dash también le hace daño (flanquear rompe su escudo frontal).
    const kronos = this.kronos;
    if (kronos && !kronos.defeated) {
      _v1.copy(kronos.pos).sub(pos);
      const kDist = _v1.length();
      if (kDist < DASH_HIT_RANGE + 1.4) {
        _v1.divideScalar(Math.max(kDist, 1e-6));
        if (_v1.dot(forward) > 0.1) {
          this.damageKronos(1, pos, 'dash');
          this.notifyPlayerHostileAction();
        }
      }
    }
    for (const enemy of this.enemies) {
      if (enemy.state === GUARD_STATE_KO) continue;
      if (enemy.kind === 'turret') continue;
      _v1.copy(enemy.pos).sub(pos);
      const dist = _v1.length();
      if (dist > DASH_HIT_RANGE) continue;
      _v1.divideScalar(Math.max(dist, 1e-6));
      if (_v1.dot(forward) < 0.1) continue;
      // HITO 1: la embestida conectó con un enemigo — acción hostil.
      this.notifyPlayerHostileAction();
      this.enemyAI.koEnemy(enemy, 'dash');
    }
    for (const grab of this.grabs) {
      if (grab.state !== GRAB_STATE_IDLE) continue;
      _v1.copy(grab.pos).sub(pos);
      const dist = _v1.length();
      if (dist > DASH_HIT_RANGE + 1.2) continue;
      _v1.divideScalar(Math.max(dist, 1e-6));
      if (_v1.dot(forward) < 0.0) continue;
      grab.state = GRAB_STATE_FLYING;
      grab.vel.copy(_v1).multiplyScalar(13);
    }
  }

  /** Noqueo por la espalda (E): devuelve true si hubo noqueo (activa disfraz). */
  tryKnockoutBehind(pos: THREE.Vector3): boolean {
    for (const enemy of this.enemies) {
      if (enemy.state === GUARD_STATE_KO) continue;
      if (enemy.kind === 'brute' || enemy.kind === 'drone' || enemy.kind === 'turret') continue;
      if (enemy.pos.distanceToSquared(pos) > KNOCKOUT_RANGE * KNOCKOUT_RANGE) continue;
      _v1.copy(pos).sub(enemy.pos).normalize();
      if (enemy.forward.dot(_v1) < -0.1) {
        // HITO 1: el intento de noqueo conectó — acción hostil reciente.
        this.notifyPlayerHostileAction();
        return this.enemyAI.koEnemy(enemy, 'knockout');
      }
    }
    return false;
  }

  /**
   * Parry: noquea al guardia en windup, derriba drones cercanos y refleja los
   * proyectiles de torreta de vuelta al emisor (destruyéndola). Contra
   * KRONOS: parrea el barrido de maza (2.5s aturdido, daño x2) y devuelve
   * sus orbes energéticos directamente contra él.
   */
  checkParry(pos: THREE.Vector3): boolean {
    const kronos = this.kronos;
    if (
      kronos &&
      !kronos.defeated &&
      kronos.state === KRONOS_STATE_WINDUP &&
      kronos.pos.distanceToSquared(pos) < (PARRY_RANGE + 2) ** 2
    ) {
      kronos.state = KRONOS_STATE_STUNNED;
      kronos.stunT = KRONOS_STUN_TIME;
      this.spawnExplosion(kronos.pos, 3, 0xf8fafc);
      return true;
    }
    // Orbes de KRONOS: se devuelven directamente contra el jefe.
    for (const orb of this.kronosOrbs) {
      if (!orb.active || orb.reflected) continue;
      if (orb.pos.distanceToSquared(pos) > (PARRY_RANGE + 1.5) ** 2) continue;
      if (kronos && !kronos.defeated) {
        orb.vel.copy(kronos.pos).sub(orb.pos).normalize().multiplyScalar(22);
      } else {
        orb.vel.multiplyScalar(-1);
      }
      orb.reflected = true;
      orb.material.color.set(0x67e8f9);
      return true;
    }
    for (const enemy of this.enemies) {
      if (enemy.state === GUARD_STATE_WINDUP) {
        if (enemy.pos.distanceToSquared(pos) > PARRY_RANGE * PARRY_RANGE) continue;
        this.enemyAI.koEnemy(enemy, 'parry');
        return true;
      }
      if (enemy.kind === 'drone' && enemy.state === GUARD_STATE_CHASE) {
        if (enemy.pos.distanceToSquared(pos) > PARRY_RANGE * PARRY_RANGE) continue;
        this.enemyAI.koEnemy(enemy, 'parry');
        return true;
      }
    }
    // Reflejo de proyectiles antiaéreos.
    for (const proj of this.projectiles) {
      if (!proj.active || proj.reflected) continue;
      if (proj.pos.distanceToSquared(pos) > (PARRY_RANGE + 1) ** 2) continue;
      let nearest: EnemyObj | null = null;
      let bestDistSq = Infinity;
      for (const enemy of this.enemies) {
        if (enemy.kind !== 'turret' || enemy.state === GUARD_STATE_KO) continue;
        const distSq = enemy.pos.distanceToSquared(proj.pos);
        if (distSq < bestDistSq) {
          bestDistSq = distSq;
          nearest = enemy;
        }
      }
      if (nearest) {
        proj.vel.copy(nearest.pos).sub(proj.pos).normalize().multiplyScalar(24);
        proj.reflected = true;
        proj.material.color.set(0x67e8f9);
      } else {
        proj.active = false;
        proj.mesh.visible = false;
      }
      return true;
    }
    return false;
  }

  /** Onda expansiva de Digger al aterrizar en Modo Júpiter. */
  shockwave(pos: THREE.Vector3, radius: number): void {
    this.spawnExplosion(pos, radius, 0x67e8f9);
    // HITO 1: la onda expansiva es un ataque — acción hostil reciente.
    this.notifyPlayerHostileAction();
    for (const enemy of this.enemies) {
      if (enemy.state === GUARD_STATE_KO) continue;
      if (enemy.kind === 'turret') continue;
      if (enemy.pos.distanceToSquared(pos) < radius * radius) this.enemyAI.koEnemy(enemy, 'shockwave');
    }
    // KRONOS también cae dentro de la onda expansiva.
    const kronos = this.kronos;
    if (kronos && !kronos.defeated && kronos.pos.distanceToSquared(pos) < radius * radius) {
      this.damageKronos(1, pos, 'shockwave');
    }
    for (const grab of this.grabs) {
      if (grab.state !== GRAB_STATE_IDLE) continue;
      _v1.copy(grab.pos).sub(pos);
      const dist = _v1.length();
      if (dist > radius + 2 || dist < 1e-6) continue;
      grab.state = GRAB_STATE_FLYING;
      grab.vel.copy(_v1.divideScalar(dist)).multiplyScalar(11);
    }
  }

  // --------------------------------------------------------------------------
  // Simulación por frame (cero allocations)
  // --------------------------------------------------------------------------
  update(dt: number, state: WorldPlayerState, onPlayerDamage: PlayerDamageFn): void {
    this.clock += dt;
    this.kronosCharacter = state.characterId;
    // HITO 1: infracción hostil reciente + caducidad del banner de aviso.
    if (this.recentHostileTimer > 0) this.recentHostileTimer -= dt;
    if (this.warningBannerT > 0) this.warningBannerT -= dt;
    this.zoneCachePlanetId = null; // invalida la cache de zona de este frame
    this.updateHeld(dt, state);
    this.updateFlying(dt, state, onPlayerDamage);
    this.updateGrabRespawns(dt);
    this.updateGates(dt, state, onPlayerDamage);
    this.updateLockedGates(dt);
    this.enemyAI.updateEnemies(dt, state, onPlayerDamage);
    this.updateInterceptors(dt, state, onPlayerDamage);
    this.updateKronos(dt, state, onPlayerDamage);
    this.updateKronosOrbs(dt, state, onPlayerDamage);
    this.updateBubbles(dt);
    this.updateKeycards(dt, state);
    this.updateScanners(dt, state);
    this.updateMines(dt, state, onPlayerDamage);
    this.updateTeleporters(dt, state);
    this.updateNpcs(dt, state);
    this.updateExplosions(dt);
    this.updateDamageRings(dt);
  }

  /**
   * FASE B — Animación de las compuertas: la barrera energética baja al
   * suelo (o desaparece) al abrirse y sube de golpe al cerrarse por
   * LOCKDOWN. Cero allocations.
   */
  private updateLockedGates(dt: number): void {
    for (const gate of this.lockedGates) {
      const target = gate.closed ? 0 : 1;
      if (gate.openT === target) continue;
      const step = dt * GATE_ANIM_SPEED;
      gate.openT =
        gate.openT < target
          ? Math.min(gate.openT + step, target)
          : Math.max(gate.openT - step, target);
      const k = 1 - gate.openT; // 1 = cerrada, 0 = abierta
      gate.barrier.scale.y = Math.max(k, 0.001);
      gate.barrier.position.y = gate.barrierBaseY * k;
      gate.barrier.visible = k > 0.01;
      gate.barrierMaterial.opacity = 0.55 * k;
    }
  }

  /**
   * FASE B — NPCs: giran hacia el jugador cuando está cerca (< 8m), el
   * bocadillo [E] flota sobre su cabeza y el diálogo activo caduca a los
   * 7s o al alejarse. Cero allocations.
   */
  private updateNpcs(dt: number, state: WorldPlayerState): void {
    for (const npc of this.npcs) {
      _v1.copy(state.pos).sub(npc.pos);
      const dist = _v1.length();
      if (dist < NPC_FACE_RANGE && dist > 1e-4) {
        // Gira suavemente hacia el jugador (proyección tangente).
        _v1.addScaledVector(npc.dir, -_v1.dot(npc.dir));
        if (_v1.lengthSq() > 1e-6) {
          _v1.normalize();
          npc.forward.lerp(_v1, Math.min(1, dt * 6)).normalize();
        }
      } else if (npc.waypoints.length >= 2) {
        // Paseo tranquilo por la ciudad entre waypoints sobre la superficie.
        const wpDir = npc.waypoints[npc.wpIndex];
        const wpAlt =
          npc.planet.spec.radius +
          getPlanetTerrainOffsetVec(npc.planet.spec.id, wpDir) +
          npc.altitudeOffset;
        _v2.copy(npc.planet.centerVec).addScaledVector(wpDir, wpAlt);
        _v1.copy(_v2).sub(npc.pos);
        if (_v1.lengthSq() < 1.2) {
          npc.wpIndex = (npc.wpIndex + 1) % npc.waypoints.length;
        } else {
          _v1.addScaledVector(npc.dir, -_v1.dot(npc.dir));
          if (_v1.lengthSq() > 1e-6) {
            _v1.normalize();
            npc.forward.lerp(_v1, Math.min(1, dt * 4)).normalize();
            npc.pos.addScaledVector(_v1, 1.85 * dt);
            _v2.copy(npc.pos).sub(npc.planet.centerVec);
            const len = _v2.length();
            if (len > 1e-6) {
              npc.dir.copy(_v2.divideScalar(len));
              const alt =
                npc.planet.spec.radius +
                getPlanetTerrainOffsetVec(npc.planet.spec.id, npc.dir) +
                npc.altitudeOffset;
              npc.pos.copy(npc.planet.centerVec).addScaledVector(npc.dir, alt);
            }
          }
        }
      }
      npc.mesh.position.copy(npc.pos);
      _q1.setFromUnitVectors(_upAxis, npc.dir);
      _v3.set(0, 0, 1).applyQuaternion(_q1);
      const cosYaw = _v3.dot(npc.forward);
      _v4.copy(_v3).cross(npc.forward);
      const yaw = Math.atan2(_v4.dot(npc.dir), cosYaw);
      _q2.setFromAxisAngle(_upAxis, yaw);
      npc.mesh.quaternion.copy(_q1).multiply(_q2);
      // HITO 4: idle procedural (respiración, asentir, saludo y halo [E]
      // girando) con el rig cacheado — cero búsquedas por nombre por frame.
      // El offset por id desfasa el idle entre NPCs vecinos.
      animateNpc(
        npc.rig,
        this.clock + npc.spec.id.length,
        dist < NPC_FACE_RANGE * 1.6,
        dist < NPC_FACE_RANGE
      );
    }
    if (this.dialogueNpc !== null) {
      this.dialogueT -= dt;
      const npc = this.dialogueNpc;
      const away =
        npc.pos.distanceToSquared(state.pos) >
        (NPC_TALK_RANGE + 2) * (NPC_TALK_RANGE + 2);
      if (this.dialogueT <= 0 || away) this.clearDialogue();
    }
  }

  private updateHeld(dt: number, state: WorldPlayerState): void {
    if (this.heldCount === 0) return;
    // Centro de órbita frente al personaje, a la altura del pecho.
    _v1.copy(state.pos).addScaledVector(state.up, 1.7).addScaledVector(state.forward, 2.2);
    _v2.copy(state.forward).cross(state.up);
    if (_v2.lengthSq() < 1e-6) _v2.set(1, 0, 0);
    _v2.normalize();
    const step = (Math.PI * 2) / this.heldCount;
    let idx = 0;
    for (const grab of this.grabs) {
      if (grab.state !== GRAB_STATE_HELD) continue;
      const angle = this.clock * 2.8 + idx * step;
      grab.pos
        .copy(_v1)
        .addScaledVector(_v2, Math.cos(angle) * 0.95)
        .addScaledVector(state.up, Math.sin(angle) * 0.95);
      grab.mesh.position.copy(grab.pos);
      grab.mesh.rotation.y += dt * 3;
      idx++;
    }
  }

  private updateFlying(
    dt: number,
    state: WorldPlayerState,
    onPlayerDamage: PlayerDamageFn
  ): void {
    for (const grab of this.grabs) {
      if (grab.state !== GRAB_STATE_FLYING) continue;
      const planet = findStrongestGravityPlanet(grab.pos, this.planets, null);
      _v1.copy(planet.centerVec).sub(grab.pos);
      const centerDist = _v1.length();
      if (centerDist > 1e-6) {
        _v1.divideScalar(centerDist);
        grab.vel.addScaledVector(_v1, OBJ_GRAVITY * dt);
      }
      grab.pos.addScaledVector(grab.vel, dt);
      grab.mesh.position.copy(grab.pos);
      grab.mesh.rotation.x += dt * grab.spin;
      grab.mesh.rotation.z += dt * grab.spin * 0.6;

      // Impacto contra enemigos (Estasis: los brutes caen, los cascos resisten 1).
      // Barril: explota; caja/bola de nieve: se rompen; roca: rebota al suelo.
      let settled = false;
      for (const enemy of this.enemies) {
        if (enemy.state === GUARD_STATE_KO) continue;
        if (grab.pos.distanceToSquared(enemy.pos) < 3.6) {
          if (grab.kind === 'barrel_explosive') {
            this.explode(grab.pos, state, onPlayerDamage);
            this.consumeGrab(grab);
          } else {
            this.enemyAI.koEnemy(enemy, 'stasis');
            if (grab.kind === 'crate' || grab.kind === 'snowball') this.consumeGrab(grab);
            else this.settleGrab(grab, planet);
          }
          settled = true;
          break;
        }
      }
      if (settled) continue;

      // Impacto contra KRONOS (objeto de Estasis lanzado).
      const kronos = this.kronos;
      if (!settled && kronos && !kronos.defeated && grab.pos.distanceToSquared(kronos.pos) < 7.2) {
        if (grab.kind === 'barrel_explosive') {
          this.explode(grab.pos, state, onPlayerDamage);
          this.consumeGrab(grab);
        } else {
          this.damageKronos(1, grab.pos, 'stasis');
          if (grab.kind === 'crate' || grab.kind === 'snowball') this.consumeGrab(grab);
          else this.settleGrab(grab, planet);
        }
        settled = true;
      }
      if (settled) continue;

      // Impacto contra generadores (1 objeto lanzado los destruye).
      for (const gen of this.generators) {
        if (gen.destroyed) continue;
        if (grab.pos.distanceToSquared(gen.pos) < 5.6) {
          if (grab.kind === 'barrel_explosive') {
            this.explode(grab.pos, state, onPlayerDamage);
            this.consumeGrab(grab);
          } else {
            this.damageGenerator(gen, 2);
            this.settleGrab(grab, planet);
          }
          settled = true;
          break;
        }
      }
      if (settled) continue;

      // FASE B: impacto contra palancas — una roca/objeto de Estasis las
      // activa a distancia sin exponerte a los guardias.
      for (const lever of this.switchLevers) {
        if (lever.activated) continue;
        if (grab.pos.distanceToSquared(lever.pos) > SWITCH_LEVER_HIT_RADIUS * SWITCH_LEVER_HIT_RADIUS) {
          continue;
        }
        this.activateLever(lever);
        this.settleGrab(grab, planet);
        settled = true;
        break;
      }
      if (settled) continue;

      // FASE B: impacto contra paredes rompibles — 2 golpes de roca o
      // 1 barril explosivo directo (el barril explota y la caja/bola se rompen).
      for (const wall of this.breakableWalls) {
        if (wall.broken) continue;
        const hitR = wall.collider.halfX + BREAKABLE_WALL_HIT_MARGIN;
        if (grab.pos.distanceToSquared(wall.pos) > hitR * hitR) continue;
        if (grab.kind === 'barrel_explosive') {
          this.explode(grab.pos, state, onPlayerDamage);
          this.consumeGrab(grab);
        } else {
          this.damageBreakableWall(wall, 1);
          if (grab.kind === 'crate' || grab.kind === 'snowball') this.consumeGrab(grab);
          else this.settleGrab(grab, planet);
        }
        settled = true;
        break;
      }
      if (settled) continue;

      // Modo Sandbox: impacto contra dianas flotantes de retos de Estasis.
      if (this.onSandboxTargetHit?.(grab.pos, grab.radius + 2.2)) {
        if (grab.kind === 'barrel_explosive') {
          this.explode(grab.pos, state, onPlayerDamage);
          this.consumeGrab(grab);
        } else if (grab.kind === 'crate' || grab.kind === 'snowball') {
          this.consumeGrab(grab);
        } else {
          this.settleGrab(grab, planet);
        }
        continue;
      }

      // Impacto contra el terreno: ruido de distracción para los guardias
      // cercanos del mismo planeta (no golpearon a nadie directamente).
      // HITO 2: superficie real = radio nominal + terreno local.
      _v2.copy(grab.pos).sub(planet.centerVec);
      const surfaceDist = _v2.length();
      if (surfaceDist > 1e-6) _v2.divideScalar(surfaceDist);
      const grabSurface =
        planet.spec.radius + getPlanetTerrainOffsetVec(planet.spec.id, _v2) + grab.radius;
      if (surfaceDist <= grabSurface) {
        if (grab.kind === 'barrel_explosive') {
          this.explode(grab.pos, state, onPlayerDamage);
          this.emitNoise(grab.pos, planet);
          this.consumeGrab(grab);
        } else {
          this.emitNoise(grab.pos, planet);
          this.settleGrab(grab, planet);
        }
      }
    }
  }

  /**
   * Consume un barril/caja/bola al explotar o romperse: desaparece del mundo
   * (en la arena de KRONOS reaparece a los 14s para no quedarte sin munición).
   */
  private consumeGrab(grab: GrabObject): void {
    if (grab.state === GRAB_STATE_HELD) this.heldCount--; // seguridad Estasis
    grab.state = GRAB_STATE_CONSUMED;
    grab.mesh.visible = false;
    grab.vel.set(0, 0, 0);
    grab.respawnT =
      grab.spawnPlanet.spec.id === KRONOS_ARENA_PLANET_ID ? GRAB_RESPAWN_KRONOS_SEC : 0;
  }

  /** Respawn de los objetos consumidos (solo arena de KRONOS: 14s). */
  private updateGrabRespawns(dt: number): void {
    for (const grab of this.grabs) {
      if (grab.state !== GRAB_STATE_CONSUMED || grab.respawnT <= 0) continue;
      grab.respawnT -= dt;
      if (grab.respawnT > 0) continue;
      grab.respawnT = 0;
      grab.state = GRAB_STATE_IDLE;
      grab.vel.set(0, 0, 0);
      grab.pos.copy(grab.spawnPos);
      grab.mesh.position.copy(grab.pos);
      _v1.copy(grab.spawnPos).sub(grab.spawnPlanet.centerVec);
      if (_v1.lengthSq() < 1e-6) _v1.set(0, 1, 0);
      _v1.normalize();
      _q1.setFromUnitVectors(_upAxis, _v1);
      grab.mesh.quaternion.copy(_q1);
      grab.mesh.visible = true;
    }
  }

  private settleGrab(grab: GrabObject, planet: PlanetRuntime): void {
    grab.state = GRAB_STATE_IDLE;
    grab.vel.set(0, 0, 0);
    _v1.copy(grab.pos).sub(planet.centerVec);
    if (_v1.lengthSq() < 1e-6) _v1.set(0, 1, 0);
    _v1.normalize();
    // HITO 2: reposa sobre la altura exacta del terreno.
    grab.pos
      .copy(planet.centerVec)
      .addScaledVector(
        _v1,
        planet.spec.radius +
          getPlanetTerrainOffsetVec(planet.spec.id, _v1) +
          grab.radius * 0.5
      );
    grab.mesh.position.copy(grab.pos);
    _q1.setFromUnitVectors(_upAxis, _v1);
    grab.mesh.quaternion.copy(_q1);
  }

  private explode(
    pos: THREE.Vector3,
    state: WorldPlayerState,
    onPlayerDamage: PlayerDamageFn
  ): void {
    this.spawnExplosion(pos, EXPLOSION_RADIUS, 0xfb923c);
    this.onSound?.('explosion');
    this.onSandboxTargetHit?.(pos, EXPLOSION_RADIUS);
    // HITO 1: una explosión (barril del jugador) es una acción hostil.
    this.notifyPlayerHostileAction();
    for (const enemy of this.enemies) {
      if (enemy.state === GUARD_STATE_KO) continue;
      if (enemy.pos.distanceToSquared(pos) < EXPLOSION_RADIUS * EXPLOSION_RADIUS) {
        if (enemy.kind === 'turret') this.enemyAI.destroyTurret(enemy);
        else this.enemyAI.koEnemy(enemy, 'explosive');
      }
    }
    // Barriles explosivos: la forma rápida de abrirle la guardia a KRONOS.
    const kronos = this.kronos;
    if (
      kronos &&
      !kronos.defeated &&
      kronos.pos.distanceToSquared(pos) < EXPLOSION_RADIUS * EXPLOSION_RADIUS
    ) {
      this.damageKronos(1, pos, 'explosive');
    }
    for (const gen of this.generators) {
      if (gen.destroyed) continue;
      if (gen.pos.distanceToSquared(pos) < (EXPLOSION_RADIUS + 1) ** 2) {
        this.damageGenerator(gen, 2);
      }
    }
    // FASE B: la explosión de un barril rompe al instante las paredes
    // rompibles cercanas (1 barril = pasadizo secreto abierto).
    for (const wall of this.breakableWalls) {
      if (wall.broken) continue;
      const r = EXPLOSION_RADIUS + wall.collider.halfX;
      if (wall.pos.distanceToSquared(pos) < r * r) {
        this.damageBreakableWall(wall, 2);
      }
    }
    for (const grab of this.grabs) {
      if (grab.state !== GRAB_STATE_IDLE) continue;
      _v1.copy(grab.pos).sub(pos);
      const dist = _v1.length();
      if (dist > EXPLOSION_RADIUS || dist < 1e-6) continue;
      grab.state = GRAB_STATE_FLYING;
      grab.vel.copy(_v1.divideScalar(dist)).multiplyScalar(9);
    }
    // Daño y empuje al jugador si está cerca.
    _v1.copy(state.pos).sub(pos);
    const dist = _v1.length();
    if (dist < EXPLOSION_RADIUS + 1 && dist > 1e-6) {
      _v1.divideScalar(dist).multiplyScalar(9).addScaledVector(state.up, 4);
      onPlayerDamage(
        1,
        _v1.x,
        _v1.y,
        _v1.z,
        'Barril explosivo',
        'Onda expansiva cercana',
        pos.x,
        pos.y,
        pos.z
      );
    }
  }

  // --------------------------------------------------------------------------
  // Tormenta de Asteroides Interceptores (OUTORBIT 2.5): los asteroides del
  // cinturón de un planeta protegido orbitan rápido y, si el jugador vuela
  // hacia ese planeta, persiguen su trayectoria para interceptarlo.
  // --------------------------------------------------------------------------
  /** Impacto de un interceptor: el jugador rebota al planeta de origen. */
  consumeInterceptorBounce(): boolean {
    if (!this.interceptorBouncePending) return false;
    this.interceptorBouncePending = false;
    return true;
  }

  private updateInterceptors(
    dt: number,
    state: WorldPlayerState,
    onPlayerDamage: PlayerDamageFn
  ): void {
    if (state.flightTargetPlanetId === null) this.interceptorBouncePending = false;
    for (const belt of this.interceptors) {
      const active = belt.planet.shielded;
      belt.group.visible = active;
      if (!active) continue;
      const inbound = state.flightTargetPlanetId === belt.planet.spec.id;
      const center = belt.planet.centerVec;
      for (let i = 0; i < belt.meshes.length; i++) {
        belt.angles[i] += belt.speeds[i] * dt;
        // Punto de órbita base alrededor del planeta.
        _v3.copy(center)
          .addScaledVector(belt.axisA, Math.cos(belt.angles[i]) * belt.orbitRadii[i])
          .addScaledVector(belt.axisB, Math.sin(belt.angles[i]) * belt.orbitRadii[i])
          .addScaledVector(belt.axisN, belt.heights[i]);

        // Steering: intercepta la trayectoria del jugador si vuela hacia la
        // tormenta; si no, regresa a su órbita de guardia.
        const targetPos = inbound ? state.pos : _v3;
        _v4.copy(targetPos).sub(belt.pos[i]);
        const dist = _v4.length();
        const speed = inbound ? INTERCEPTOR_STEER_SPEED : INTERCEPTOR_RETURN_SPEED;
        if (dist > 1e-6) {
          belt.pos[i].addScaledVector(_v4.divideScalar(dist), Math.min(dist, speed * dt));
        }
        const mesh = belt.meshes[i];
        mesh.position.copy(belt.pos[i]);
        mesh.rotation.x += dt * 0.9;
        mesh.rotation.y += dt * 0.7;

        // Colisión con el jugador en ruta: 1 de daño + rebote al origen.
        if (inbound) {
          const hitRadius = belt.radii[i] + INTERCEPTOR_HIT_MARGIN;
          if (belt.pos[i].distanceToSquared(state.pos) < hitRadius * hitRadius) {
            _v4.copy(state.pos)
              .sub(belt.pos[i])
              .normalize()
              .multiplyScalar(14)
              .addScaledVector(state.up, 6);
            // HITO 3: posición del impacto capturada ANTES de devolver el
            // asteroide a su órbita (belt.pos[i] se reasigna justo después).
            const hitX = belt.pos[i].x;
            const hitY = belt.pos[i].y;
            const hitZ = belt.pos[i].z;
            onPlayerDamage(
              1,
              _v4.x,
              _v4.y,
              _v4.z,
              'Tormenta de asteroides',
              'Impacto orbital (desbloquea el planeta anterior)',
              hitX,
              hitY,
              hitZ
            );
            this.interceptorBouncePending = true;
            this.spawnExplosion(belt.pos[i], belt.radii[i] * 1.6, 0xf97316);
            this.onSound?.('explosion');
            // El asteroide vuelve a su órbita tras el impacto.
            belt.pos[i].copy(_v3);
          }
        }
      }
    }
  }

  private updateGates(
    dt: number,
    state: WorldPlayerState,
    onPlayerDamage: PlayerDamageFn
  ): void {
    for (const gate of this.gates) {
      // FASE B: valla láser apagada por una palanca sin compuerta vinculada.
      if (gate.disabled) {
        gate.planeMaterial.opacity = 0;
        continue;
      }
      gate.cooldown -= dt;
      gate.planeMaterial.opacity = 0.32 + Math.sin(this.clock * 7 + gate.phase) * 0.14;
      if (state.burrowing) continue; // Digger cruza por debajo excavando.
      _v1.copy(state.pos).sub(gate.pos);
      const dist = _v1.length();
      if (dist < LASER_GATE_RADIUS && gate.cooldown <= 0) {
        gate.cooldown = LASER_GATE_CD;
        _v1.divideScalar(Math.max(dist, 1e-6)).multiplyScalar(10).addScaledVector(state.up, 5);
        onPlayerDamage(
          1,
          _v1.x,
          _v1.y,
          _v1.z,
          'Barrera láser',
          'Contacto con haz de seguridad',
          gate.pos.x,
          gate.pos.y,
          gate.pos.z
        );
      }
    }
  }

  // --------------------------------------------------------------------------
  // Objetos del mundo del Hito 3B: keycards, escáneres, minas y tuberías
  // --------------------------------------------------------------------------
  private updateKeycards(dt: number, state: WorldPlayerState): void {
    for (const card of this.keycards) {
      if (card.collected) continue;
      card.mesh.rotation.y += dt * 2;
      if (state.pos.distanceToSquared(card.pos) < KEYCARD_PICKUP_RADIUS * KEYCARD_PICKUP_RADIUS) {
        card.collected = true;
        card.mesh.visible = false;
        card.beacon.visible = false;
        this.keycardsCollected++;
        const planetId = card.planet.spec.id;
        this.planetKeycardCollected.set(
          planetId,
          (this.planetKeycardCollected.get(planetId) ?? 0) + 1
        );
        this.checkPlanetUnlock(planetId);
      }
    }
  }

  private updateScanners(dt: number, state: WorldPlayerState): void {
    for (const scanner of this.scanners) {
      scanner.cooldown -= dt;
      scanner.planeMaterial.opacity = 0.22 + Math.sin(this.clock * 6 + scanner.phase) * 0.12;
      if (!state.disguised || scanner.cooldown > 0) continue;
      if (state.pos.distanceToSquared(scanner.pos) > SCANNER_GATE_RADIUS * SCANNER_GATE_RADIUS) {
        continue;
      }
      // Escáner de puerta: rompe el disfraz y salta la alarma.
      scanner.cooldown = SCANNER_GATE_CD;
      this.onDisguiseBroken?.();
      for (const enemy of this.enemies) {
        if (enemy.state === GUARD_STATE_KO || enemy.kind === 'turret') continue;
        if (enemy.pos.distanceToSquared(scanner.pos) < RADIO_ALERT_RANGE * RADIO_ALERT_RANGE) {
          enemy.suspicion = 1;
        }
      }
      this.enemyAI.radioAlert(scanner.pos, '¡Intruso disfrazado!');
    }
  }

  private updateMines(
    dt: number,
    state: WorldPlayerState,
    onPlayerDamage: PlayerDamageFn
  ): void {
    for (const mine of this.mines) {
      if (mine.exploded) continue;
      mine.ringMaterial.opacity = 0.35 + Math.sin(this.clock * 5 + mine.phase) * 0.25;
      if (!state.burrowing) continue;
      if (mine.pos.distanceToSquared(state.pos) > SEISMIC_MINE_TRIGGER_RADIUS * SEISMIC_MINE_TRIGGER_RADIUS) {
        continue;
      }
      // Mina sísmica: detecta a Digger bajo tierra y lo expulsa con daño.
      mine.exploded = true;
      mine.mesh.visible = false;
      this.spawnExplosion(mine.pos, 5, 0xfbbf24);
      this.burrowEjectPending = true;
      _v1.copy(state.pos).sub(mine.pos);
      if (_v1.lengthSq() < 1e-6) _v1.copy(state.up);
      _v1.normalize().multiplyScalar(10).addScaledVector(state.up, 8);
      onPlayerDamage(
        1,
        _v1.x,
        _v1.y,
        _v1.z,
        'Mina sísmica',
        'Detonación por proximidad',
        mine.pos.x,
        mine.pos.y,
        mine.pos.z
      );
    }
  }

  private updateTeleporters(dt: number, state: WorldPlayerState): void {
    this.teleportCooldown -= dt;
    if (this.teleportCooldown > 0) return;
    for (const pipe of this.teleporters) {
      if (pipe.isExit) continue;
      if (state.pos.distanceToSquared(pipe.pos) > TELEPORT_PIPE_RADIUS * TELEPORT_PIPE_RADIUS) {
        continue;
      }
      // Tubería mecánica: teletransporta a la salida conectada más cercana.
      let exit: TeleporterObj | null = null;
      let bestDistSq = Infinity;
      for (const candidate of this.teleporters) {
        if (!candidate.isExit) continue;
        const distSq = candidate.pos.distanceToSquared(pipe.pos);
        if (distSq < bestDistSq) {
          bestDistSq = distSq;
          exit = candidate;
        }
      }
      if (!exit) break;
      this.teleportCooldown = TELEPORT_COOLDOWN;
      this.spawnExplosion(pipe.pos, 2.5, 0x22d3ee);
      this.spawnExplosion(exit.pos, 2.5, 0xf97316);
      this.onTeleportPlayer?.(exit.pos.x, exit.pos.y, exit.pos.z);
      break;
    }
  }

  private damageGenerator(gen: GeneratorObj, amount: number): void {
    if (gen.destroyed) return;
    gen.hp -= amount;
    if (gen.hp <= 0) {
      gen.destroyed = true;
      this.generatorsDestroyed++;
      const planetId = gen.planet.spec.id;
      this.planetGenDestroyed.set(planetId, (this.planetGenDestroyed.get(planetId) ?? 0) + 1);
      gen.coreMaterial.color.set(0x334155);
      gen.beacon.visible = false;
      gen.mesh.rotateZ(0.18);
      this.spawnExplosion(gen.pos, 3.5, 0xfbbf24);
      this.checkPlanetUnlock(planetId);
    }
  }

  private updateBubbles(dt: number): void {
    for (const bubble of this.bubbles) {
      const pulse = 1 + Math.sin(this.clock * 1.6 + bubble.phase) * 0.03;
      bubble.mesh.scale.setScalar(pulse);
    }
  }

  spawnExplosion(pos: THREE.Vector3, radius: number, color: number): void {
    for (const fx of this.explosions) {
      if (fx.active) continue;
      fx.active = true;
      fx.t = 0;
      fx.radius = radius;
      fx.material.color.set(color);
      fx.mesh.position.copy(pos);
      fx.mesh.scale.setScalar(radius * 0.25);
      fx.mesh.visible = true;
      return;
    }
  }

  private updateExplosions(dt: number): void {
    for (const fx of this.explosions) {
      if (!fx.active) continue;
      fx.t += dt;
      const k = fx.t / EXPLOSION_DURATION;
      if (k >= 1) {
        fx.active = false;
        fx.mesh.visible = false;
        continue;
      }
      const grow = 0.25 + 0.75 * (1 - (1 - k) * (1 - k));
      fx.mesh.scale.setScalar(fx.radius * grow);
      fx.material.opacity = 0.8 * (1 - k);
    }
  }

  /**
   * HITO 3 — Anillo de impacto carmesí en la posición del jugador: pulso 3D
   * expandiéndose sobre el plano tangente (up) durante 0.5s. Lo invoca el
   * GameEngine desde el funil único de daño cuando el golpe APLICA de verdad
   * (la invulnerabilidad no genera anillo). Cero allocations.
   */
  spawnDamageRing(pos: THREE.Vector3, up: THREE.Vector3): void {
    for (const fx of this.damageRings) {
      if (fx.active) continue;
      fx.active = true;
      fx.t = 0;
      fx.mesh.position.copy(pos);
      // El torus vive en el plano XY (eje del agujero = Z local): se mapea
      // Z -> up para que el anillo quede tumbado sobre el plano tangente.
      _q1.setFromUnitVectors(_zAxis, up);
      fx.mesh.quaternion.copy(_q1);
      fx.mesh.scale.setScalar(0.35);
      fx.mesh.visible = true;
      return;
    }
  }

  private updateDamageRings(dt: number): void {
    for (const fx of this.damageRings) {
      if (!fx.active) continue;
      fx.t += dt;
      const k = fx.t / DAMAGE_RING_DURATION;
      if (k >= 1) {
        fx.active = false;
        fx.mesh.visible = false;
        continue;
      }
      const grow = 0.35 + (1 - (1 - k) * (1 - k)) * DAMAGE_RING_MAX_RADIUS;
      fx.mesh.scale.setScalar(grow);
      fx.material.opacity = 0.95 * (1 - k);
    }
  }

  /** Limpia las referencias (las mallas las dispone el GameEngine). */
  clear(): void {
    this.grabs.length = 0;
    this.generators.length = 0;
    this.gates.length = 0;
    this.bubbles.length = 0;
    this.grassZones.length = 0;
    this.enemies.length = 0;
    this.projectiles.length = 0;
    this.keycards.length = 0;
    this.scanners.length = 0;
    this.mines.length = 0;
    this.teleporters.length = 0;
    this.explosions.length = 0;
    this.damageRings.length = 0;
    this.interceptors.length = 0;
    this.lockedGates.length = 0;
    this.switchLevers.length = 0;
    this.breakableWalls.length = 0;
    this.npcs.length = 0;
    this.dialogueNpc = null;
    this.dialogueT = 0;
    this.lockdownActive = false;
    this.kronos = null;
    this.kronosOrbs.length = 0;
    this.kronosBehavior = null;
    this.kronosCharacter = 'kitsune';
    this.heldCount = 0;
    this.generatorsDestroyed = 0;
    this.guardsKnockedOut = 0;
    this.keycardsCollected = 0;
    this.globalAlert = false;
    this.burrowEjectPending = false;
    this.interceptorBouncePending = false;
    this.teleportCooldown = 0;
    this.predictiveShields = false;
    this.alertBoost = 0;
    this.structureCollidersByPlanet.clear();
    // HITO 2: colliders físicos de props.
    this.propCollidersByPlanet.clear();
    // HITO 1: zonas restringidas, infracciones y banner de aviso.
    this.restrictedZones.length = 0;
    this.zoneCachePlanetId = null;
    this.enemyAI.resetZoneCache();
    this.recentHostileTimer = 0;
    this.warningBannerT = 0;
    this.warningBannerSeq = 0;
    this.warningBannerData.speaker = '';
    this.warningBannerData.text = '';
    this.planetGenTotal.clear();
    this.planetGenDestroyed.clear();
    this.planetKeycardTotal.clear();
    this.planetKeycardCollected.clear();
    this.completedPlanetIds.clear();
    this.objectiveTargetResult.count = 0;
    this.onGlobalAlert = null;
    this.onDisguiseBroken = null;
    this.onTeleportPlayer = null;
    this.onSound = null;
    this.onKronosDefeated = null;
    this.onPlanetUnlocked = null;
    this.onGateLockdown = null;
  }

  /**
   * Hielo resbaladizo: todo el bioma cryo es helado; en el resto de planetas
   * con parches de hielo, regiones deterministas de la dirección radial.
   */
  isOnIce(pos: THREE.Vector3, planet: PlanetRuntime): boolean {
    if (planet.spec.biome === 'cryo') return true;
    if (planet.spec.hasIcePatches !== true) return false;
    _v1.copy(pos).sub(planet.centerVec);
    if (_v1.lengthSq() < 1e-6) return false;
    _v1.normalize();
    const noise =
      Math.sin(_v1.x * 5.3 + 1.7) * Math.sin(_v1.y * 4.1 + 0.3) * Math.sin(_v1.z * 6.7 + 2.9);
    return noise > 0.35;
  }
}
