import * as THREE from 'three';
import type {
  BehaviorPercentages,
  CharacterId,
  EnemyKind,
  EnemySpawnSpec,
  GalaxySpec,
  GrassZoneSpec,
  InteractableKind,
  PlanetAdaptationConfig,
  PlanetRuntime,
  PlayerBehaviorVector,
  WaterBubbleSpec,
  WorldObjectSpec,
} from '../types';
import { addComicOutline, createComicCelMaterial, createToonMaterial } from '../render/toonMaterials';
import {
  buildBeaconBeam,
  buildBruteModel,
  buildDroneModel,
  buildGuardModel,
  buildKronosModel,
  buildOfficerModel,
  buildPlanetShieldMesh,
  buildStructureMesh,
  buildTurretModel,
  buildVisionConeMesh,
} from '../render/proceduralModels';
import {
  createStructureCollider,
  findStrongestGravityPlanet,
  isLineBlockedByStructures,
  resolvePlayerStructures,
  type StructureCollider,
} from '../math/spherical';
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

// ============================================================================
// Constantes de simulación de los objetos del mundo
// ============================================================================
const OBJ_GRAVITY = 16;
const THROW_SPEED = 36;
const EXPLOSION_RADIUS = 6.5;
const EXPLOSION_DURATION = 0.45;
const STASIS_GRAB_RANGE = 9;
const MELEE_RANGE = 3.0;
const KNOCKOUT_RANGE = 2.9;
const PARRY_RANGE = 4.4;
const GUARD_DETECT_RANGE = 15;
const GUARD_ATTACK_RANGE = 2.6;
const GUARD_WINDUP = 0.45;
const GUARD_ATTACK_CD = 1.5;
const GUARD_GIVEUP_DIST = 24;
const GUARD_PATROL_SPEED = 2.0;
const GUARD_CHASE_SPEED = 4.5;
const LASER_GATE_RADIUS = 3.0;
const LASER_GATE_CD = 1.3;
const GRASS_BLADES_PER_ZONE = 170;
const DASH_HIT_RANGE = 3.2;
const LOCK_ON_MIN_DOT = 0.0; // objetivo dentro del semiespacio frontal
const LOCK_CANDIDATE_MAX = 48;

// --- Red de IA intra-planeta (Hito 3B) ---
const VISION_MIN_DOT = 0.25; // semicírculo frontal (~75° de semiángulo)
const GRASS_HIDE_DIST = 2.5; // la hierba alta oculta salvo a quemarropa
const CURVATURE_CLEARANCE = 0.25; // margen del horizonte esférico
const OFFICER_UNMASK_RANGE = 6.0; // el oficial delata al disfrazado cerca
const SPRINT_SUSPICION_RATE = 1.5; // sospecha por segundo al correr con Shift
const SUSPICION_DECAY = 0.22;
const SEARCH_DURATION = 7.0; // segundos buscando antes de volver a patrullar
const RADIO_ALERT_RANGE = 22.0; // alcance de la alerta por radio
const RADIO_CHECKIN_DELAY = 7.0; // sin respuesta de un compañero -> búsqueda
const BODY_SPOT_RANGE = 14.0; // avistamiento de un compañero noqueado
const ABILITY_REPORT_RANGE = 18.0; // Estasis/Gravity Shift delante de un guardia
const DRONE_HOVER_ALT = 2.3;
const DRONE_PATROL_SPEED = 5.0;
const DRONE_CHASE_SPEED = 6.5;
const DRONE_ZAP_RANGE = 1.9;
const DRONE_ZAP_CD = 1.3;
const TURRET_RANGE = 26.0;
const TURRET_FIRE_CD = 1.6;
const TURRET_FIRE_CD_PREDICTIVE = 1.0;
const PROJECTILE_SPEED = 18.0;
const PROJECTILE_SPEED_PREDICTIVE = 26.0;
const PROJECTILE_LIFE = 4.0;
const PROJECTILE_HIT_RADIUS = 1.2;
const PROJECTILE_POOL_SIZE = 10;
const SCANNER_GATE_RADIUS = 3.4;
const SCANNER_GATE_CD = 2.0;
const SEISMIC_MINE_TRIGGER_RADIUS = 7.0;
const TELEPORT_PIPE_RADIUS = 2.2;
const TELEPORT_COOLDOWN = 2.5;
const KEYCARD_PICKUP_RADIUS = 2.4;
const ADAPTED_SPAWN_BASE = 3; // semilla determinista para spawns de adaptación;

// --- Oleada 2: galaxia continua, conos de visión y distracciones ---
const NOISE_RADIUS = 13.0; // radio del "ruido" de un objeto lanzado al suelo
const NOISE_SEARCH_DURATION = 4.5; // investigan el impacto antes de volver a la ruta
const GUARD_STRUCTURE_RADIUS = 0.6; // radio de colisión guardia vs edificios
const CONE_COLOR_PATROL = 0x4ade80;
const CONE_COLOR_SEARCH = 0xfacc15;
const CONE_COLOR_COMBAT = 0xf87171;
const OBJECTIVE_TARGET_MAX = 8; // buffer preasignado de marcadores de objetivo

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

const KRONOS_STATE_CHASE = 0;
const KRONOS_STATE_WINDUP = 1;
const KRONOS_STATE_STUNNED = 2;

/** Color del anillo de energía según la postura activa de la red MLP. */
const KRONOS_POSTURE_RING_COLORS = [0xf97316, 0xfacc15, 0x22d3ee, 0xa78bfa];

const GRAB_STATE_IDLE = 0;
const GRAB_STATE_HELD = 1;
const GRAB_STATE_FLYING = 2;

const GUARD_STATE_PATROL = 0;
const GUARD_STATE_CHASE = 1;
const GUARD_STATE_WINDUP = 2;
const GUARD_STATE_KO = 3;
const GUARD_STATE_SEARCH = 4;

/** Parámetros de detección/combate por tipo de enemigo. */
interface EnemyParams {
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
    windupTime: 0,
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
type HitSource = 'melee' | 'knockout' | 'dash' | 'shockwave' | 'explosive' | 'parry' | 'stasis';

/**
 * Enemigo unificado de la red intra-planeta: guardias, oficiales, drones,
 * torretas y brutes comparten ciclo de vida (patrol/search/chase/windup/KO),
 * sospecha 0..1 y comunicación por radio.
 */
interface EnemyObj {
  kind: EnemyKind;
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
  params: EnemyParams;
  /** Cono de visión adherido al suelo (guardias y oficiales). */
  visionCone: THREE.Mesh | null;
  visionConeMaterial: THREE.MeshBasicMaterial | null;
}

/** Proyectil luminoso de torreta (parreable). */
interface TurretProjectile {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  active: boolean;
  reflected: boolean;
  life: number;
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
 * Comandante KRONOS (jefe final): persigue al jugador sobre la esfera con
 * barridos de maza parreables, orbes energéticos devolvibles y poderes que
 * dependen de la postura que su red MLP (offline + online) predice para el
 * estilo de juego del jugador.
 */
interface KronosObj {
  mesh: THREE.Group;
  ringMaterial: THREE.MeshBasicMaterial;
  maceGroup: THREE.Group;
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
const _v5 = new THREE.Vector3();
const _v6 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _upAxis = new THREE.Vector3(0, 1, 0);
const _dummy = new THREE.Object3D();

/** PRNG determinista para los spawns dinámicos de la adaptación. */
function makeSeededRandom(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

// ============================================================================
// Lock-On (Hito 3A): guardias, barriles y generadores fijables
// ============================================================================

export type LockOnKind = 'guard' | 'barrel' | 'generator';

export interface LockOnHandle {
  kind: LockOnKind;
  index: number;
}

const LOCK_KIND_GUARD = 0;
const LOCK_KIND_BARREL = 1;
const LOCK_KIND_GENERATOR = 2;

function lockCodeToKind(code: number): LockOnKind {
  return code === LOCK_KIND_GUARD ? 'guard' : code === LOCK_KIND_BARREL ? 'barrel' : 'generator';
}

function lockKindToCode(kind: LockOnKind): number {
  return kind === 'guard' ? LOCK_KIND_GUARD : kind === 'barrel' ? LOCK_KIND_BARREL : LOCK_KIND_GENERATOR;
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

interface ExplosionFx {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  active: boolean;
  t: number;
  radius: number;
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
  /** Personaje activo del escuadrón (entrada one-hot de la red MLP de KRONOS). */
  characterId: CharacterId;
}

export type PlayerDamageFn = (
  amount: number,
  pushX: number,
  pushY: number,
  pushZ: number
) => void;

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

// ============================================================================
// Gestor de objetos interactivos del mundo esférico
// ============================================================================
export class WorldObjectsManager {
  private readonly group: THREE.Group;
  private readonly planets: PlanetRuntime[];
  private readonly grabs: GrabObject[] = [];
  private readonly generators: GeneratorObj[] = [];
  private readonly gates: LaserGateObj[] = [];
  private readonly bubbles: WaterBubbleObj[] = [];
  private readonly grassZones: GrassZoneObj[] = [];
  private readonly enemies: EnemyObj[] = [];
  private readonly projectiles: TurretProjectile[] = [];
  private readonly keycards: KeycardObj[] = [];
  private readonly scanners: ScannerGateObj[] = [];
  private readonly mines: SeismicMineObj[] = [];
  private readonly teleporters: TeleporterObj[] = [];
  private readonly explosions: ExplosionFx[] = [];
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
  // --- Oleada 2: galaxia continua ---
  private readonly structureColliders: StructureCollider[] = [];
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
  private clock = 0;
  private globalAlert = false;
  private burrowEjectPending = false;
  private teleportCooldown = 0;
  private predictiveShields = false;
  private alertBoost = 0; // escalado de detección por baseAlertLevel

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
    for (const spec of galaxy.structures) {
      const planet = this.findPlanet(spec.planetId);
      this.group.add(buildStructureMesh(spec, planet.centerVec, planet.spec.radius));
      this.structureColliders.push(
        createStructureCollider(spec, planet.centerVec, planet.spec.radius)
      );
    }

    // Escudos planetarios: todo planeta con unlockedByPlanetId nace bloqueado.
    for (const planet of planets) {
      if (planet.spec.unlockedByPlanetId === null) continue;
      planet.shielded = true;
      const shield = buildPlanetShieldMesh(
        planet.spec.radius,
        planet.spec.ringColor ?? planet.spec.atmosphereColor
      );
      shield.position.copy(planet.centerVec);
      this.group.add(shield);
      planet.shieldMesh = shield;
    }

    for (const spec of galaxy.objects) this.spawnObject(spec);
    for (const bubble of galaxy.waterBubbles) this.spawnBubble(bubble);
    for (const zone of galaxy.grassZones ?? []) this.spawnGrass(zone);
    for (const enemy of galaxy.enemies) this.spawnEnemy(enemy);

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
      });
    }
  }

  private findPlanet(id: string): PlanetRuntime {
    const planet = this.planets.find((p) => p.spec.id === id);
    if (!planet) throw new Error(`WorldObjects: planeta desconocido "${id}"`);
    return planet;
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
    mesh.position.copy(planet.centerVec).addScaledVector(_v1, planet.spec.radius + altitudeOffset);
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
    }
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
      _dummy.position
        .copy(planet.centerVec)
        .addScaledVector(dir, planet.spec.radius + 0.5);
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
    let mesh: THREE.Group;
    switch (spec.kind) {
      case 'guard':
        mesh = buildGuardModel();
        break;
      case 'officer':
        mesh = buildOfficerModel();
        break;
      case 'drone':
        mesh = buildDroneModel();
        break;
      case 'turret':
        mesh = buildTurretModel();
        break;
      case 'brute':
        mesh = buildBruteModel();
        break;
      default:
        return;
    }
    // Cono de visión adherido al suelo delante de guardias y oficiales.
    let visionCone: THREE.Mesh | null = null;
    let visionConeMaterial: THREE.MeshBasicMaterial | null = null;
    if (spec.kind === 'guard' || spec.kind === 'officer') {
      const cone = buildVisionConeMesh(
        ENEMY_PARAMS[spec.kind].detectRange,
        Math.acos(VISION_MIN_DOT)
      );
      visionCone = cone.mesh;
      visionConeMaterial = cone.material;
      mesh.add(cone.mesh);
    }
    const waypoints: THREE.Vector3[] = [];
    for (const dir of spec.patrolDirs) {
      waypoints.push(new THREE.Vector3(...dir).normalize());
    }
    // Torretas y enemigos sin ruta: se anclan al primer waypoint dado.
    const dir =
      waypoints.length > 0 ? waypoints[0] : new THREE.Vector3(0, 1, 0).normalize();
    if (waypoints.length === 0) waypoints.push(dir);
    const pos = this.placeOnPlanet(mesh, planet, dir.x, dir.y, dir.z, 0);
    this.group.add(mesh);
    this.enemies.push({
      kind: spec.kind,
      planet,
      mesh,
      pos: pos.clone(),
      dir: dir.clone(),
      forward: new THREE.Vector3(0, 0, 1),
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
      params: ENEMY_PARAMS[spec.kind],
      visionCone,
      visionConeMaterial,
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
    this.kronos = {
      mesh: group,
      ringMaterial,
      maceGroup,
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
    k.pos.copy(k.planet.centerVec).addScaledVector(k.dir, k.planet.spec.radius);
    k.mesh.position.copy(k.pos);
    _q1.setFromUnitVectors(_upAxis, k.dir);
    _v3.set(0, 0, 1).applyQuaternion(_q1);
    const cosYaw = _v3.dot(k.forward);
    _v4.copy(_v3).cross(k.forward);
    const yaw = Math.atan2(_v4.dot(k.dir), cosYaw);
    _q2.setFromAxisAngle(k.dir, yaw);
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
  private spawnKronosOrb(k: KronosObj, state: WorldPlayerState): void {
    for (const orb of this.kronosOrbs) {
      if (orb.active) continue;
      orb.active = true;
      orb.reflected = false;
      orb.life = KRONOS_ORB_LIFE;
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
          onPlayerDamage(1, _v1.x, _v1.y, _v1.z);
          this.reinforceKronosPosture(k);
        }
        break;
      }
      case 'anti_digger': {
        // Onda sísmica: expulsa del subsuelo a quien excave cerca.
        this.spawnExplosion(k.pos, KRONOS_SEISMIC_RADIUS, 0xfacc15);
        if (state.burrowing && k.pos.distanceTo(state.pos) < KRONOS_SEISMIC_RADIUS) {
          this.burrowEjectPending = true;
          onPlayerDamage(1, state.up.x * 8, state.up.y * 8, state.up.z * 8);
          this.reinforceKronosPosture(k);
        }
        break;
      }
      case 'anti_axel': {
        // Ráfaga aérea: orbe directo contra el jugador en el aire.
        if (state.airborne && k.pos.distanceTo(state.pos) < KRONOS_AIR_BURST_RANGE) {
          this.spawnKronosOrb(k, state);
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
      this.syncKronosTransform(k);
      return;
    }
    k.clock += dt;
    k.ringMaterial.opacity = 0.4 + Math.sin(k.clock * 4) * 0.2;

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
      k.maceGroup.rotation.z += (-1.1 - k.maceGroup.rotation.z) * Math.min(1, dt * 6);
      if (k.stunT <= 0) {
        k.state = KRONOS_STATE_CHASE;
        k.maceGroup.rotation.z = -0.25;
        k.swingCd = 0.6;
      }
    } else if (k.state === KRONOS_STATE_WINDUP) {
      // Windup claro del barrido de maza: ventana de Parry (F/Q).
      k.windupT -= dt;
      const p = 1 - Math.max(k.windupT, 0) / KRONOS_WINDUP;
      k.maceGroup.rotation.x = 1.25 - p * 1.0;
      if (k.windupT <= 0) {
        k.state = KRONOS_STATE_CHASE;
        k.swingCd = KRONOS_SWING_CD;
        k.maceGroup.rotation.x = 2.3;
        if (playerDist < KRONOS_MELEE_RANGE + 1.4) {
          _v1.copy(state.pos).sub(k.pos).divideScalar(Math.max(playerDist, 1e-6));
          _v1.multiplyScalar(11).addScaledVector(state.up, 5);
          onPlayerDamage(1, _v1.x, _v1.y, _v1.z);
        }
      }
    } else {
      // Persecución sobre la esfera + selección de ataque.
      k.maceGroup.rotation.x += (1.25 - k.maceGroup.rotation.x) * Math.min(1, dt * 5);
      k.swingCd -= dt;
      k.orbCd -= dt;
      k.powerCd -= dt;
      _v2.copy(state.pos).sub(k.planet.centerVec).normalize();
      this.moveKronosTowards(k, _v2, KRONOS_CHASE_SPEED, dt);
      if (playerDist < KRONOS_MELEE_RANGE && k.swingCd <= 0) {
        k.state = KRONOS_STATE_WINDUP;
        k.windupT = KRONOS_WINDUP;
      } else if (playerDist < KRONOS_ORB_RANGE && k.orbCd <= 0) {
        k.orbCd = KRONOS_ORB_CD;
        this.spawnKronosOrb(k, state);
      }
      if (k.powerCd <= 0) {
        k.powerCd = KRONOS_POWER_CD;
        this.kronosPosturePower(k, state, onPlayerDamage);
      }
    }

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
        this.deactivateProjectile(orb);
        this.damageKronos(1, orb.pos, 'parry');
        continue;
      }

      // Impacto contra el jugador.
      if (orb.pos.distanceToSquared(state.pos) < KRONOS_ORB_HIT_RADIUS * KRONOS_ORB_HIT_RADIUS) {
        this.deactivateProjectile(orb);
        _v1.copy(orb.vel).normalize().multiplyScalar(9).addScaledVector(state.up, 4);
        onPlayerDamage(1, _v1.x, _v1.y, _v1.z);
        continue;
      }

      const planet = findStrongestGravityPlanet(orb.pos, this.planets, null);
      if (
        orb.pos.distanceToSquared(planet.centerVec) <=
        (planet.spec.radius + 0.3) * (planet.spec.radius + 0.3)
      ) {
        this.deactivateProjectile(orb);
      } else if (orb.life <= 0) {
        this.deactivateProjectile(orb);
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

  isInGrass(pos: THREE.Vector3, planet: PlanetRuntime): boolean {
    for (const zone of this.grassZones) {
      if (zone.planetId !== planet.spec.id) continue;
      _v1.copy(pos).sub(planet.centerVec);
      if (_v1.lengthSq() < 1e-6) continue;
      _v1.normalize();
      if (_v1.dot(zone.dir) > zone.cosThreshold) return true;
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
      if (!this.curvatureLOS(enemy.pos, pos, enemy.planet)) continue;
      enemy.suspicion = 1;
    }
  }

  /** Minas sísmicas: consume la petición de eyección del subsuelo. */
  consumeBurrowEject(): boolean {
    if (!this.burrowEjectPending) return false;
    this.burrowEjectPending = false;
    return true;
  }

  // --------------------------------------------------------------------------

  /** Colliders de todas las estructuras de la galaxia (colisión del jugador). */
  getStructureColliders(): StructureCollider[] {
    return this.structureColliders;
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
    else out.copy(this.grabs[handle.index].pos);
    return true;
  }

  getLockOnName(handle: LockOnHandle): string {
    if (handle.kind === 'generator') return 'Generador';
    if (handle.kind === 'barrel') return 'Barril explosivo';
    const enemy = this.enemies[handle.index];
    if (!enemy) return 'Objetivo';
    switch (enemy.kind) {
      case 'officer':
        return 'Oficial';
      case 'drone':
        return 'Dron';
      case 'turret':
        return 'Torreta';
      case 'brute':
        return 'Brute élite';
      default:
        return 'Guardia';
    }
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
      this.koEnemy(enemy, 'melee');
      return 'guard';
    }
    for (const gen of this.generators) {
      if (gen.destroyed) continue;
      if (gen.pos.distanceToSquared(pos) < (MELEE_RANGE + 0.8) ** 2) {
        this.damageGenerator(gen, 1);
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
        if (_v1.dot(forward) > 0.1) this.damageKronos(1, pos, 'dash');
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
      this.koEnemy(enemy, 'dash');
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
        return this.koEnemy(enemy, 'knockout');
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
        this.koEnemy(enemy, 'parry');
        return true;
      }
      if (enemy.kind === 'drone' && enemy.state === GUARD_STATE_CHASE) {
        if (enemy.pos.distanceToSquared(pos) > PARRY_RANGE * PARRY_RANGE) continue;
        this.koEnemy(enemy, 'parry');
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
    for (const enemy of this.enemies) {
      if (enemy.state === GUARD_STATE_KO) continue;
      if (enemy.kind === 'turret') continue;
      if (enemy.pos.distanceToSquared(pos) < radius * radius) this.koEnemy(enemy, 'shockwave');
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
    this.updateHeld(dt, state);
    this.updateFlying(dt, state, onPlayerDamage);
    this.updateGates(dt, state, onPlayerDamage);
    this.updateEnemies(dt, state, onPlayerDamage);
    this.updateKronos(dt, state, onPlayerDamage);
    this.updateKronosOrbs(dt, state, onPlayerDamage);
    this.updateBubbles(dt);
    this.updateKeycards(dt, state);
    this.updateScanners(dt, state);
    this.updateMines(dt, state, onPlayerDamage);
    this.updateTeleporters(dt, state);
    this.updateExplosions(dt);
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
      let settled = false;
      for (const enemy of this.enemies) {
        if (enemy.state === GUARD_STATE_KO) continue;
        if (grab.pos.distanceToSquared(enemy.pos) < 3.6) {
          this.koEnemy(enemy, 'stasis');
          this.settleGrab(grab, planet);
          settled = true;
          break;
        }
      }
      if (settled) continue;

      // Impacto contra KRONOS (objeto de Estasis lanzado).
      const kronos = this.kronos;
      if (!settled && kronos && !kronos.defeated && grab.pos.distanceToSquared(kronos.pos) < 7.2) {
        this.damageKronos(1, grab.pos, 'stasis');
        this.settleGrab(grab, planet);
        settled = true;
      }
      if (settled) continue;

      // Impacto contra generadores (1 objeto lanzado los destruye).
      for (const gen of this.generators) {
        if (gen.destroyed) continue;
        if (grab.pos.distanceToSquared(gen.pos) < 5.6) {
          this.damageGenerator(gen, 2);
          this.settleGrab(grab, planet);
          settled = true;
          break;
        }
      }
      if (settled) continue;

      // Impacto contra el terreno: ruido de distracción para los guardias
      // cercanos del mismo planeta (no golpearon a nadie directamente).
      _v2.copy(grab.pos).sub(planet.centerVec);
      const surfaceDist = _v2.length();
      if (surfaceDist <= planet.spec.radius + grab.radius) {
        if (grab.kind === 'barrel_explosive') {
          this.explode(grab.pos, state, onPlayerDamage);
        }
        this.emitNoise(grab.pos, planet);
        this.settleGrab(grab, planet);
      }
    }
  }

  private settleGrab(grab: GrabObject, planet: PlanetRuntime): void {
    grab.state = GRAB_STATE_IDLE;
    grab.vel.set(0, 0, 0);
    _v1.copy(grab.pos).sub(planet.centerVec);
    if (_v1.lengthSq() < 1e-6) _v1.set(0, 1, 0);
    _v1.normalize();
    grab.pos
      .copy(planet.centerVec)
      .addScaledVector(_v1, planet.spec.radius + grab.radius * 0.5);
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
    for (const enemy of this.enemies) {
      if (enemy.state === GUARD_STATE_KO) continue;
      if (enemy.pos.distanceToSquared(pos) < EXPLOSION_RADIUS * EXPLOSION_RADIUS) {
        if (enemy.kind === 'turret') this.destroyTurret(enemy);
        else this.koEnemy(enemy, 'explosive');
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
      onPlayerDamage(1, _v1.x, _v1.y, _v1.z);
    }
  }

  private updateGates(
    dt: number,
    state: WorldPlayerState,
    onPlayerDamage: PlayerDamageFn
  ): void {
    for (const gate of this.gates) {
      gate.cooldown -= dt;
      gate.planeMaterial.opacity = 0.32 + Math.sin(this.clock * 7 + gate.phase) * 0.14;
      if (state.burrowing) continue; // Digger cruza por debajo excavando.
      _v1.copy(state.pos).sub(gate.pos);
      const dist = _v1.length();
      if (dist < LASER_GATE_RADIUS && gate.cooldown <= 0) {
        gate.cooldown = LASER_GATE_CD;
        _v1.divideScalar(Math.max(dist, 1e-6)).multiplyScalar(10).addScaledVector(state.up, 5);
        onPlayerDamage(1, _v1.x, _v1.y, _v1.z);
      }
    }
  }

  // --------------------------------------------------------------------------
  // Red de IA intra-planeta: visión curva, sospecha, disfraces y radio
  // --------------------------------------------------------------------------
  private updateEnemies(
    dt: number,
    state: WorldPlayerState,
    onPlayerDamage: PlayerDamageFn
  ): void {
    for (const enemy of this.enemies) {
      enemy.attackCd -= dt;
      if (enemy.state === GUARD_STATE_KO) {
        // Check-in por radio: demasiado tiempo sin respuesta de un compañero.
        enemy.koTimer += dt;
        if (!enemy.koRadioSent && enemy.koTimer > RADIO_CHECKIN_DELAY) {
          enemy.koRadioSent = true;
          this.radioMissingGuard(enemy);
        }
      } else if (enemy.kind === 'turret') {
        this.updateTurret(enemy, dt, state);
      } else if (enemy.kind === 'drone') {
        this.updateDrone(enemy, dt, state, onPlayerDamage);
      } else {
        this.updateWalker(enemy, dt, state, onPlayerDamage);
      }
      this.syncEnemyTransform(enemy, dt);
    }
    this.updateProjectiles(dt, state, onPlayerDamage);
  }

  /**
   * Oclusión por curvatura de la esfera: la línea de visión entre dos puntos
   * de la superficie queda cortada por el horizonte esférico cuando el punto
   * medio del arco se hunde bajo el radio del planeta.
   */
  private curvatureLOS(
    fromPos: THREE.Vector3,
    toPos: THREE.Vector3,
    planet: PlanetRuntime
  ): boolean {
    _v5.copy(fromPos).sub(planet.centerVec).normalize();
    _v6.copy(toPos).sub(planet.centerVec).normalize();
    const cosTheta = THREE.MathUtils.clamp(_v5.dot(_v6), -1, 1);
    const half = Math.sqrt(Math.max(0, (1 + cosTheta) * 0.5)); // cos(theta/2)
    return (planet.spec.radius + 1.4) * half >= planet.spec.radius + CURVATURE_CLEARANCE;
  }

  /**
   * Cono de visión curvo: distancia + ángulo frontal + oclusión por la
   * curvatura de la esfera + muros/edificios en la línea de visión (LoS real
   * contra los colliders de estructuras) + hierba alta (a quemarropa se ve).
   */
  private enemyCanSeePlayer(
    enemy: EnemyObj,
    state: WorldPlayerState,
    range: number,
    playerDist: number
  ): boolean {
    if (playerDist > range) return false;
    _v5.copy(state.pos).sub(enemy.pos).divideScalar(Math.max(playerDist, 1e-6));
    if (enemy.forward.dot(_v5) < VISION_MIN_DOT) return false;
    if (!this.curvatureLOS(enemy.pos, state.pos, enemy.planet)) return false;
    // Un muro o edificio en medio corta la línea de visión.
    if (
      isLineBlockedByStructures(
        enemy.pos,
        state.pos,
        this.structureColliders,
        enemy.planet.spec.id
      )
    ) {
      return false;
    }
    if (state.inGrass && playerDist > GRASS_HIDE_DIST) return false;
    if (state.burrowing || state.swimming) return false;
    return true;
  }

  /** Sospecha 0..1 del enemigo según lo que ve (disfraces incluidos). */
  private updateSuspicion(enemy: EnemyObj, dt: number, state: WorldPlayerState, playerDist: number, range: number): boolean {
    const sees = this.enemyCanSeePlayer(enemy, state, range, playerDist);
    if (sees) {
      if (!state.disguised) {
        enemy.suspicion = 1;
      } else if (enemy.kind === 'officer' && playerDist < OFFICER_UNMASK_RANGE) {
        // El oficial delata al disfrazado: sospecha al 100%.
        enemy.suspicion = 1;
      } else if (state.sprinting) {
        // Correr con Shift delata al jugador disfrazado.
        enemy.suspicion += dt * SPRINT_SUSPICION_RATE;
      } else {
        enemy.suspicion -= dt * 0.1;
      }
    } else {
      enemy.suspicion -= dt * SUSPICION_DECAY;
    }
    enemy.suspicion = THREE.MathUtils.clamp(enemy.suspicion, 0, 1);
    return sees;
  }

  /** Guardias, oficiales y brutes: patrulla, búsqueda, caza y melee. */
  private updateWalker(
    enemy: EnemyObj,
    dt: number,
    state: WorldPlayerState,
    onPlayerDamage: PlayerDamageFn
  ): void {
    _v1.copy(state.pos).sub(enemy.pos);
    const playerDist = _v1.length();
    const detectRange =
      enemy.params.detectRange * state.stealthMul * (1 + this.alertBoost) *
      (this.globalAlert ? 1.35 : 1);
    const sees = this.updateSuspicion(enemy, dt, state, playerDist, detectRange);

    if (enemy.state === GUARD_STATE_PATROL) {
      // Cuerpo de un compañero descubierto: aviso por radio y búsqueda.
      if (this.checkBodyDiscovery(enemy)) return;
      const target = enemy.waypoints[enemy.waypointIdx];
      this.moveEnemyTowards(enemy, target, GUARD_PATROL_SPEED * (this.globalAlert ? 1.5 : 1), dt);
      if (enemy.dir.angleTo(target) < 0.02) {
        enemy.waypointIdx = (enemy.waypointIdx + 1) % enemy.waypoints.length;
      }
      if (enemy.suspicion >= 1) this.enterCombat(enemy, state);
    } else if (enemy.state === GUARD_STATE_SEARCH) {
      enemy.searchT -= dt;
      this.moveEnemyTowards(enemy, enemy.lastSeenDir, GUARD_PATROL_SPEED * 1.3, dt);
      if (this.checkBodyDiscovery(enemy)) return;
      if (enemy.suspicion >= 1) {
        this.enterCombat(enemy, state);
      } else if (enemy.searchT <= 0) {
        enemy.state = GUARD_STATE_PATROL;
        enemy.suspicion = Math.min(enemy.suspicion, 0.35);
      }
    } else if (enemy.state === GUARD_STATE_CHASE) {
      _v2.copy(state.pos).sub(enemy.planet.centerVec).normalize();
      this.moveEnemyTowards(enemy, _v2, enemy.params.chaseSpeed, dt);
      const lostTrack =
        playerDist > GUARD_GIVEUP_DIST ||
        (state.disguised && !sees && playerDist > GUARD_GIVEUP_DIST * 0.45);
      if (lostTrack) {
        enemy.state = GUARD_STATE_SEARCH;
        enemy.searchT = SEARCH_DURATION;
        enemy.lastSeenDir.copy(_v2);
      } else if (playerDist < enemy.params.attackRange && enemy.attackCd <= 0) {
        enemy.state = GUARD_STATE_WINDUP;
        enemy.windupT = enemy.params.windupTime;
      }
    } else if (enemy.state === GUARD_STATE_WINDUP) {
      if (playerDist > GUARD_GIVEUP_DIST) {
        enemy.state = GUARD_STATE_CHASE;
      }
      enemy.windupT -= dt;
      if (enemy.windupT <= 0) {
        enemy.state = GUARD_STATE_CHASE;
        enemy.attackCd = enemy.params.attackCdTime;
        if (playerDist < enemy.params.attackRange + 1.2) {
          _v1.divideScalar(Math.max(playerDist, 1e-6));
          _v1.multiplyScalar(9).addScaledVector(state.up, 4);
          onPlayerDamage(1, _v1.x, _v1.y, _v1.z);
        }
      }
    }
  }

  /** Dron rápido: flota sobre la superficie persiguiendo al jugador. */
  private updateDrone(
    enemy: EnemyObj,
    dt: number,
    state: WorldPlayerState,
    onPlayerDamage: PlayerDamageFn
  ): void {
    _v1.copy(state.pos).sub(enemy.pos);
    const playerDist = _v1.length();
    const detectRange =
      enemy.params.detectRange * state.stealthMul * (1 + this.alertBoost) *
      (this.globalAlert ? 1.35 : 1);
    const sees = this.updateSuspicion(enemy, dt, state, playerDist, detectRange);

    if (enemy.state === GUARD_STATE_PATROL) {
      const target = enemy.waypoints[enemy.waypointIdx];
      this.moveEnemyTowards(enemy, target, DRONE_PATROL_SPEED, dt);
      if (enemy.dir.angleTo(target) < 0.02) {
        enemy.waypointIdx = (enemy.waypointIdx + 1) % enemy.waypoints.length;
      }
      if (enemy.suspicion >= 1) this.enterCombat(enemy, state);
    } else if (enemy.state === GUARD_STATE_CHASE) {
      _v2.copy(state.pos).sub(enemy.planet.centerVec).normalize();
      this.moveEnemyTowards(enemy, _v2, enemy.params.chaseSpeed, dt);
      const lostTrack =
        playerDist > GUARD_GIVEUP_DIST + 4 ||
        (state.disguised && !sees && playerDist > 12);
      if (lostTrack) {
        enemy.state = GUARD_STATE_PATROL;
        enemy.suspicion = 0.4;
      } else if (playerDist < DRONE_ZAP_RANGE && enemy.attackCd <= 0) {
        enemy.attackCd = enemy.params.attackCdTime;
        _v1.divideScalar(Math.max(playerDist, 1e-6));
        _v1.multiplyScalar(7).addScaledVector(state.up, 4);
        onPlayerDamage(1, _v1.x, _v1.y, _v1.z);
      }
    }
  }

  /** Torreta antiaérea: dispara proyectiles parreables al jugador aéreo. */
  private updateTurret(enemy: EnemyObj, dt: number, state: WorldPlayerState): void {
    if (!state.airborne || state.swimming) return;
    _v1.copy(state.pos).sub(enemy.pos);
    const dist = _v1.length();
    if (dist > TURRET_RANGE) return;
    if (!this.curvatureLOS(enemy.pos, state.pos, enemy.planet)) return;
    if (enemy.attackCd > 0) return;
    enemy.attackCd = this.predictiveShields ? TURRET_FIRE_CD_PREDICTIVE : TURRET_FIRE_CD;
    this.spawnTurretProjectile(enemy, state);
  }

  private spawnTurretProjectile(enemy: EnemyObj, state: WorldPlayerState): void {
    for (const proj of this.projectiles) {
      if (proj.active) continue;
      proj.active = true;
      proj.reflected = false;
      proj.life = PROJECTILE_LIFE;
      proj.material.color.set(0xfb923c);
      proj.pos.copy(enemy.pos).addScaledVector(enemy.dir, 1.6);
      proj.vel.copy(state.pos).addScaledVector(state.up, 0.6).sub(proj.pos).normalize();
      const speed = this.predictiveShields ? PROJECTILE_SPEED_PREDICTIVE : PROJECTILE_SPEED;
      proj.vel.multiplyScalar(speed);
      proj.mesh.position.copy(proj.pos);
      proj.mesh.visible = true;
      return;
    }
  }

  private updateProjectiles(
    dt: number,
    state: WorldPlayerState,
    onPlayerDamage: PlayerDamageFn
  ): void {
    for (const proj of this.projectiles) {
      if (!proj.active) continue;
      proj.life -= dt;
      proj.pos.addScaledVector(proj.vel, dt);
      proj.mesh.position.copy(proj.pos);

      // Impacto contra el jugador.
      if (proj.pos.distanceToSquared(state.pos) < PROJECTILE_HIT_RADIUS * PROJECTILE_HIT_RADIUS) {
        this.deactivateProjectile(proj);
        _v1.copy(proj.vel).normalize().multiplyScalar(8).addScaledVector(state.up, 4);
        onPlayerDamage(1, _v1.x, _v1.y, _v1.z);
        continue;
      }

      // Proyectil parreado: destruye su torreta al volver.
      if (proj.reflected) {
        let hit = false;
        for (const enemy of this.enemies) {
          if (enemy.kind !== 'turret' || enemy.state === GUARD_STATE_KO) continue;
          if (proj.pos.distanceToSquared(enemy.pos) < 4) {
            this.destroyTurret(enemy);
            hit = true;
            break;
          }
        }
        if (hit) {
          this.deactivateProjectile(proj);
          continue;
        }
      }

      // Impacto contra el terreno o fin de vida útil.
      const planet = findStrongestGravityPlanet(proj.pos, this.planets, null);
      if (
        proj.pos.distanceToSquared(planet.centerVec) <=
        (planet.spec.radius + 0.3) * (planet.spec.radius + 0.3)
      ) {
        this.deactivateProjectile(proj);
      } else if (proj.life <= 0) {
        this.deactivateProjectile(proj);
      }
    }
  }

  private deactivateProjectile(proj: TurretProjectile): void {
    proj.active = false;
    proj.mesh.visible = false;
  }

  /** Un guardia avista a un compañero noqueado: radio + búsqueda global. */
  private checkBodyDiscovery(enemy: EnemyObj): boolean {
    for (const other of this.enemies) {
      if (other === enemy || other.state !== GUARD_STATE_KO) continue;
      if (other.pos.distanceToSquared(enemy.pos) > BODY_SPOT_RANGE * BODY_SPOT_RANGE) continue;
      _v5.copy(other.pos).sub(enemy.pos).normalize();
      if (enemy.forward.dot(_v5) < 0.1) continue;
      if (!this.curvatureLOS(enemy.pos, other.pos, enemy.planet)) continue;
      this.startSearch(enemy, other.dir);
      this.radioAlert(enemy.pos, '¡Intruso disfrazado!');
      return true;
    }
    return false;
  }

  /** Sin respuesta por radio de un compañero cercano: búsqueda coordinada. */
  private radioMissingGuard(koEnemy: EnemyObj): void {
    for (const enemy of this.enemies) {
      if (enemy.state !== GUARD_STATE_PATROL) continue;
      if (enemy.kind === 'turret' || enemy.kind === 'drone') continue;
      if (enemy.pos.distanceToSquared(koEnemy.pos) > RADIO_ALERT_RANGE * RADIO_ALERT_RANGE) {
        continue;
      }
      this.startSearch(enemy, koEnemy.dir);
    }
    this.triggerGlobalAlert();
  }

  private startSearch(enemy: EnemyObj, targetDir: THREE.Vector3): void {
    enemy.state = GUARD_STATE_SEARCH;
    enemy.searchT = SEARCH_DURATION;
    enemy.lastSeenDir.copy(targetDir);
    enemy.suspicion = Math.max(enemy.suspicion, 0.6);
  }

  /** Radio: alerta a los compañeros cercanos ("¡Intruso disfrazado!"). */
  private radioAlert(pos: THREE.Vector3, _message: string): void {
    for (const enemy of this.enemies) {
      if (enemy.state === GUARD_STATE_KO) continue;
      if (enemy.kind === 'turret') continue;
      if (enemy.pos.distanceToSquared(pos) > RADIO_ALERT_RANGE * RADIO_ALERT_RANGE) continue;
      if (enemy.state === GUARD_STATE_PATROL) this.startSearch(enemy, enemy.lastSeenDir);
      enemy.suspicion = Math.max(enemy.suspicion, 0.75);
    }
    this.triggerGlobalAlert();
  }

  private enterCombat(enemy: EnemyObj, state: WorldPlayerState): void {
    enemy.state = GUARD_STATE_CHASE;
    _v2.copy(state.pos).sub(enemy.planet.centerVec).normalize();
    enemy.lastSeenDir.copy(_v2);
    this.radioAlert(enemy.pos, '¡Intruso disfrazado!');
  }

  private triggerGlobalAlert(): void {
    if (this.globalAlert) return;
    this.globalAlert = true;
    this.onSound?.('alert');
    this.onGlobalAlert?.();
  }

  /** Rota `enemy.dir` sobre la esfera hacia `targetDir` a velocidad tangente. */
  private moveEnemyTowards(
    enemy: EnemyObj,
    targetDir: THREE.Vector3,
    speed: number,
    dt: number
  ): void {
    const dot = THREE.MathUtils.clamp(enemy.dir.dot(targetDir), -1, 1);
    const angle = Math.acos(dot);
    if (angle < 1e-5) return;
    const step = Math.min((speed / enemy.planet.spec.radius) * dt, angle);
    _v1.copy(enemy.dir).cross(targetDir);
    if (_v1.lengthSq() < 1e-10) {
      _v1.set(1, 0, 0).cross(enemy.dir);
      if (_v1.lengthSq() < 1e-10) _v1.set(0, 1, 0).cross(enemy.dir);
    }
    _v1.normalize();
    _q1.setFromAxisAngle(_v1, step);
    enemy.dir.applyQuaternion(_q1).normalize();
    // Avance tangente = componente tangencial de targetDir.
    _v2.copy(targetDir).addScaledVector(enemy.dir, -THREE.MathUtils.clamp(targetDir.dot(enemy.dir), -1, 1));
    if (_v2.lengthSq() > 1e-10) enemy.forward.copy(_v2).normalize();
  }

  /** Transform sobre la esfera + hover de dron + tumbado si K.O. */
  private syncEnemyTransform(enemy: EnemyObj, dt: number): void {
    let altitude = 0;
    if (enemy.kind === 'drone') {
      enemy.hoverPhase += dt * 3;
      altitude =
        enemy.state === GUARD_STATE_KO ? 0.35 : DRONE_HOVER_ALT + Math.sin(enemy.hoverPhase) * 0.25;
    }
    enemy.pos
      .copy(enemy.planet.centerVec)
      .addScaledVector(enemy.dir, enemy.planet.spec.radius + altitude);
    // Colisión contra estructuras: los caminantes no atraviesan muros.
    if (
      enemy.state !== GUARD_STATE_KO &&
      enemy.kind !== 'drone' &&
      enemy.kind !== 'turret'
    ) {
      const res = resolvePlayerStructures(
        enemy.pos,
        0,
        false,
        this.structureColliders,
        enemy.planet.spec.id,
        GUARD_STRUCTURE_RADIUS
      );
      if (res.hitWall) {
        enemy.dir.copy(enemy.pos).sub(enemy.planet.centerVec).normalize();
      }
    }
    enemy.mesh.position.copy(enemy.pos);
    _q1.setFromUnitVectors(_upAxis, enemy.dir);
    if (enemy.kind === 'turret') {
      enemy.mesh.quaternion.copy(_q1);
      if (enemy.state === GUARD_STATE_KO) {
        _q2.setFromAxisAngle(_v3.set(1, 0, 0), 0.9);
        enemy.mesh.quaternion.multiply(_q2);
      }
      return;
    }
    _v3.set(0, 0, 1).applyQuaternion(_q1);
    const cosYaw = _v3.dot(enemy.forward);
    _v4.copy(_v3).cross(enemy.forward);
    const yaw = Math.atan2(_v4.dot(enemy.dir), cosYaw);
    _q2.setFromAxisAngle(enemy.dir, yaw);
    enemy.mesh.quaternion.copy(_q1).multiply(_q2);
    if (enemy.state === GUARD_STATE_KO) {
      _q2.setFromAxisAngle(_v3.set(0, 0, 1), 1.45);
      enemy.mesh.quaternion.multiply(_q2);
    }
    this.updateVisionCone(enemy);
  }

  /**
   * Color/opacidad del cono de visión en tiempo real: verde en patrulla,
   * amarillo al sospechar o investigar un ruido, rojo en combate/alarma.
   */
  private updateVisionCone(enemy: EnemyObj): void {
    const cone = enemy.visionCone;
    const material = enemy.visionConeMaterial;
    if (!cone || !material) return;
    const ko = enemy.state === GUARD_STATE_KO;
    cone.visible = !ko;
    if (ko) return;
    let color = CONE_COLOR_PATROL;
    if (enemy.state === GUARD_STATE_CHASE || enemy.state === GUARD_STATE_WINDUP) {
      color = CONE_COLOR_COMBAT;
    } else if (enemy.state === GUARD_STATE_SEARCH || enemy.suspicion > 0.4) {
      color = CONE_COLOR_SEARCH;
    }
    material.color.set(color);
    material.opacity = color === CONE_COLOR_COMBAT ? 0.42 : 0.26;
  }

  /**
   * Noquea/derriba a un enemigo según la fuente del golpe. Devuelve true solo
   * si el enemigo quedó K.O.:
   * - Brute: resiste todo salvo explosivos, parry y estasis.
   * - Casco blindado: resiste el primer golpe melee/estasis/noqueo/dash.
   */
  private koEnemy(enemy: EnemyObj, source: HitSource): boolean {
    if (enemy.state === GUARD_STATE_KO) return false;
    if (enemy.kind === 'brute') {
      if (source === 'explosive' || source === 'parry' || source === 'stasis') {
        this.killEnemy(enemy);
        return true;
      }
      return false;
    }
    if (
      enemy.helmet &&
      (source === 'melee' || source === 'stasis' || source === 'knockout' || source === 'dash')
    ) {
      // El casco blindado absorbe el primer golpe.
      enemy.helmet = false;
      return false;
    }
    this.killEnemy(enemy);
    return true;
  }

  private killEnemy(enemy: EnemyObj): void {
    enemy.state = GUARD_STATE_KO;
    enemy.koTimer = 0;
    enemy.koRadioSent = false;
    this.guardsKnockedOut++;
  }

  private destroyTurret(enemy: EnemyObj): void {
    if (enemy.state === GUARD_STATE_KO) return;
    enemy.state = GUARD_STATE_KO;
    this.spawnExplosion(enemy.pos, 3.5, 0xf97316);
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
      this.radioAlert(scanner.pos, '¡Intruso disfrazado!');
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
      onPlayerDamage(1, _v1.x, _v1.y, _v1.z);
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

  private spawnExplosion(pos: THREE.Vector3, radius: number, color: number): void {
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
    this.teleportCooldown = 0;
    this.predictiveShields = false;
    this.alertBoost = 0;
    this.structureColliders.length = 0;
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
