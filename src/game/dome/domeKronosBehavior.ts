// ============================================================================
// DOME KRONOS BEHAVIOR — IA del Leviatán KRONOS (modo Cúpula)
// ============================================================================
// Rediseño definitivo del boss de Oleada 15 (ciclos 15, 30, 45...): IA
// perfecta (predicción de trayectoria honesta dentro de la física del mundo)
// vs jugador frenético.
//
// - VIDA = 4 Estrellas Dorsales (star_core_1..4 vinculadas a seg_03/06/09/12):
//   una estrella por fase, sin barra genérica de HP. Solo se rompen con
//   impacto de ALTA velocidad de Nyx (taladro / umbral cinético) o con
//   habilidades gravitatorias / proyectiles de entorno. Anti-skip: como mucho
//   1 estrella por uso y ~0.5 s de invulnerabilidad de transición.
// - CERO clips de Blender (kronos_tail_idle desactivado en el mixer): la
//   cadena head→seg_01..seg_12 se resuelve con física follow-the-leader en
//   espacio de mundo con buffers prealocados, rigidez angular ~15-18° por
//   eslabón, transporte paralelo del vector Up, onda de impulso e inercia
//   lateral en seg_08..12.
// - Cuatro fases: Exploración (0.5·V_base + Anillos), Ataque (1.0·V_base +
//   Latigazo de Cola), Cabdeo (1.35·V_base + Portales 'SOLAR RIFT' +
//   Mordisco) y Destrucción (invulnerable, cuerpo 'VOID COSMOS', slow-mo
//   global 0.75, supervivencia de 60 s con cosmos_fusion y supernova).
//
// Scratch de módulo y buffers por instancia: cero allocations por frame.
// ============================================================================

import * as THREE from 'three';
import { STAR_CORE_EMISSIVE, type EnemyBone } from './DomeEnemyModels';
import { swapKronosFleshToVoidCosmos } from './DomeEnemyModels';
import { faceTowards } from './domeEnemyOrient';
import type { EnemyInternal, ManagedWaveEnemy } from './DomeWaveManager';

// ============================================================================
// Constantes del Leviatán KRONOS
// ============================================================================

/** Tamaño de la cadena: head (0) + seg_01..seg_12 (1..12). */
const KRONOS_CHAIN_POINTS = 13;
/** Radio de las esferas de colisión reales sobre cada punto de la cadena (m). */
export const KRONOS_SEGMENT_HIT_RADIUS = 3.0;
/** Índices de cadena que portan las 4 Estrellas Dorsales (seg_03/06/09/12). */
export const KRONOS_STAR_SEGMENTS = [3, 6, 9, 12];

// --- Física serpentina (follow-the-leader) ---
const KRONOS_MAX_BEND_RAD = 0.28; // Rigidez angular: 15-18° por eslabón.
const KRONOS_WAVE_FREQ = 3.2; // Frecuencia base de la onda transversal (rad/s).
const KRONOS_WAVE_PHASE_STEP = 0.55; // Desfase progresivo entre eslabones.
const KRONOS_WAVE_YAW_AMP = 0.085; // Amplitud de guiñada proporcional a velocidad.
const KRONOS_TURN_RATE = 1.7; // Suavizado de la orientación de la cabeza.
const KRONOS_FIN_FLAP_SPEED = 3.1;
const KRONOS_FIN_FLAP_AMP = 0.3;

// --- Velocidades por fase (x V_base = getBaseMaxSpeed() de Nyx = 28) ---
const KRONOS_PHASE_SPEED = [0.5, 1.0, 1.35, 1.35];
const KRONOS_BITE_EXIT_SPEED_MULT = 1.5; // Ultra velocidad de salida del mordisco.
const KRONOS_PATROL_RING_MIN = 28; // Anillo lejano/medio de la Fase 1 (m).
const KRONOS_PATROL_RING_MAX = 45;
const KRONOS_PATROL_HEIGHT = 16;
const KRONOS_DOME_KEEP_RADIUS = 72; // Contención suave dentro del radio seguro.
const KRONOS_DOME_KEEP_PULL = 16.0;
const KRONOS_DODGE_RANGE = 18; // Una patada cercana provoca esquiva honesta.
const KRONOS_DODGE_COOLDOWN = 1.9;

// --- Anillos de Contención (0 daño directo, empuje radial 30 m/s) ---
const KRONOS_RING_TELEGRAPH_SEC = 0.8;
const KRONOS_RING_TELEGRAPH_JAW_RAD = 0.5;
const KRONOS_RING_COUNT = [3, 2, 1];
const KRONOS_RING_INTERVAL_SEC = 0.45;
const KRONOS_RING_RECOVER_SEC = 0.5;
const KRONOS_RING_TRAVEL_SPEED = 9.0;
const KRONOS_RING_EXPAND_SPEED = 16.0;
const KRONOS_RING_MAX_RADIUS = 55.0;
const KRONOS_RING_HIT_BAND = 1.7;
const KRONOS_RING_PUSH_SPEED = 30.0;
export const KRONOS_RING_POOL_SIZE = 8;

// --- Latigazo de Cola (Fase 2+, 100% físico) ---
const KRONOS_WHIP_RANGE = 12.0;
const KRONOS_WHIP_WINDUP_SEC = 0.35;
const KRONOS_WHIP_STRIKE_SEC = 0.26;
const KRONOS_WHIP_SETTLE_SEC = 0.32;
const KRONOS_WHIP_DAMAGE = 18;
const KRONOS_WHIP_PUSH_SPEED = 50.0;
const KRONOS_WHIP_HIT_RADIUS = 4.6;
const KRONOS_WHIP_RECOVER_SEC = 2.0; // Fallo: ventana de castigo de 2 s.
const KRONOS_WHIP_FAN_RAD = 0.85; // Abanico de tail_L / tail_R (~180° total).

// --- Portales Cósmicos ('SOLAR RIFT') y Mordisco (Fase 3+) ---
const KRONOS_PORTAL_DIAMETER = 14.0;
const KRONOS_PORTAL1_AHEAD = 18.0; // Portal 1 delante de la trayectoria (m).
const KRONOS_PORTAL2_BEHIND = 22.0; // Portal 2 justo detrás de Nyx (m).
const KRONOS_PORTAL_T_OPEN_P2 = 0.5; // t = 0.5 s: se abre el Portal 2.
const KRONOS_PORTAL_T_EXIT = 0.7; // t = 0.7 s: salida a ultra velocidad.
const KRONOS_BITE_DAMAGE = 24;
const KRONOS_BITE_PUSH_SPEED = 32.0;
const KRONOS_BITE_JAW_OPEN_RAD = 0.95;
const KRONOS_BITE_JAW_SNAP_SEC = 0.08; // Cierre de golpe: -0.95 rad -> 0.
const KRONOS_BITE_FLIGHT_SEC = 0.8;
const KRONOS_PORTAL_LIFE_SEC = 3.2;
const KRONOS_PORTAL_COOLDOWN = 8.0;

// --- Fase 4: Destrucción (supervivencia de 60 s) ---
const KRONOS_PHASE4_TOTAL_SEC = 60.0;
const KRONOS_COSMOS_DAMAGE = 16; // cosmos_fusion: impacto automático directo.
const KRONOS_COSMOS_WINDUP_SEC = 0.3;
const KRONOS_SUPERNOVA_SEC = 1.2; // Convulsión segmento a segmento final.
const KRONOS_STAR_INVULN_SEC = 0.5; // Invulnerabilidad de transición por rotura.

// Umbral cinético: Patada Taladro o velocidad > umbral rompe estrellas.
const KRONOS_STAR_BREAK_SPEED = 18.0;
const KRONOS_STAR_SWEEP_SPEED = 14.5;

// ============================================================================
// Tipos compartidos con el DomeWaveManager
// ============================================================================

/**
 * Anillo de Contención: onda circular expansiva que empuja radialmente a
 * Nyx hacia la Barrera Blanca al cruzarla (0 daño directo).
 */
export interface KronosRing {
  mesh: THREE.Mesh;
  active: boolean;
  origin: THREE.Vector3;
  dir: THREE.Vector3;
  travel: number;
  radius: number;
  pushed: boolean;
}

/**
 * Portal Cósmico 'SOLAR RIFT' (Fase 3+): disco de ~14 m con apertura elástica
 * y rotación de vórtice. `dir` es la dirección de CRUCE del umbral (+Z del
 * grupo).
 */
export interface KronosPortal {
  group: THREE.Group;
  disk: THREE.Mesh;
  diskMaterial: THREE.ShaderMaterial;
  rim: THREE.Mesh;
  rimMaterial: THREE.MeshBasicMaterial;
  active: boolean;
  dir: THREE.Vector3;
  pos: THREE.Vector3;
  /** Apertura elástica 0..1 (con rebrote). */
  open: number;
  openVel: number;
  life: number;
}

/**
 * Efectos de cosmos_fusion sobre Nyx que el game loop empuja al controller
 * cada frame. Los pulsos son one-shot y los consume el loop.
 */
export interface KronosNyxEffects {
  deformActive: boolean;
  cameraShake: number;
  controlsInverted: boolean;
  phase4: boolean;
  /** Pulso one-shot de sacudida (rugido del portal), 0..1.3. */
  shakePulse: number;
  /** Destello void cosmos one-shot en HUD/pantalla (cosmos_fusion). */
  voidFlashPulse: number;
}

/** Contexto compartido con el DomeWaveManager. */
export interface KronosBehaviorContext {
  speedMult: number;
  kronosRings: KronosRing[];
  kronosPortals: KronosPortal[];
  kronosNyxEffects: KronosNyxEffects;
  /** V_base de Nyx sin pasivas (controller.getBaseMaxSpeed() = 28 m/s). */
  kronosBaseMaxSpeed: number;
  /** Foto por frame de la velocidad de Nyx (predicción honesta). */
  playerVelocity: THREE.Vector3;
  /** Foto por frame del aim de Nyx (portales a su espalda). */
  playerAimForward: THREE.Vector3;
  fireProjectile(
    enemy: ManagedWaveEnemy,
    playerPos: THREE.Vector3,
    kind: 'dark' | 'ink_ball' | 'ink_giant',
    damage: number,
    speed: number,
    spreadRad?: number,
    origin?: THREE.Vector3,
    dirOverride?: THREE.Vector3,
  ): void;
  poseBone(bone: EnemyBone | null, rotX: number, rotY: number, rotZ: number): void;
  /**
   * Rotura de Estrella Dorsal con TODAS las puertas anti-skip (Fase 4
   * invulnerable, invulnerabilidad de transición, 1 por uso).
   */
  tryBreakKronosStar(
    enemy: ManagedWaveEnemy,
    impactSpeed: number,
    isDrill: boolean,
  ): boolean;
  /** Fase 4: la convulsión de la supernova terminó — el boss muere. */
  finalizeKronosSupernova(enemy: ManagedWaveEnemy): void;
}

/** FSM del Leviatán (reemplaza a los antiguos charge/rings/coil). */
export type KronosState =
  | 'roam'
  | 'rings'
  | 'whip_windup'
  | 'whip_strike'
  | 'whip_settle'
  | 'whip_recover'
  | 'portals'
  | 'portal_bite'
  | 'cosmos_fusion'
  | 'supernova';

/** Evento de la agenda de cosmos_fusion (Fase 4): 0 deform, 1 shake, 2 ejes. */
interface KronosAgendaEvent {
  at: number;
  on: boolean;
  kind: 0 | 1 | 2;
}

/** Estado completo del boss por enemigo (vidas, fase, ataques, agenda). */
export interface KronosBossState {
  chain: KronosChain;
  /** Estrellas Dorsales restantes (4 = Fase 1 ... 1 = Fase 4). */
  stars: number;
  starInvulnSec: number;
  phase4: boolean;
  phase4Timer: number;
  state: KronosState;
  timer: number;
  attackIndex: number;
  attackCd: number;
  jawOpen01: number;
  jawTarget01: number;
  jawRad: number;
  ringsLeft: number;
  whipSide: 1 | -1;
  whipHit: boolean;
  whipHeadYaw: number;
  whipCd: number;
  portalCd: number;
  portal2Opened: boolean;
  exitDir: THREE.Vector3;
  biteHit: boolean;
  dodgeCd: number;
  dodgeSign: 1 | -1;
  orbitAngle: number;
  agenda: KronosAgendaEvent[];
  agendaIdx: number;
}

// ============================================================================
// Cadena serpentina — física follow-the-leader en espacio de mundo
// ============================================================================

// --- Scratch de módulo (cero allocations por frame) ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _heading = new THREE.Vector3();
const _stare = new THREE.Vector3();
const _pushDir = new THREE.Vector3();
const _predicted = new THREE.Vector3();
const _toTarget = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _qParent = new THREE.Quaternion();
const _basisRest = new THREE.Matrix4();
const _basisCur = new THREE.Matrix4();
const _xRest = new THREE.Vector3();
const _xCur = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);
const _shootFrom = new THREE.Vector3();
const _shootDir = new THREE.Vector3();

/**
 * Buffers prealocados de la cadena (cero allocations por frame):
 * `pos[0..12]` son las posiciones de MUNDO de head/seg_01..seg_12 — las
 * esferas de colisión reales de las hitboxes segmentadas; `segLen[0..11]`
 * las longitudes en reposo medidas del bind pose.
 */
export class KronosChain {
  ready = false;
  /** Posiciones de mundo de los 13 puntos (hitboxes segmentadas). */
  readonly pos: THREE.Vector3[] = Array.from(
    { length: KRONOS_CHAIN_POINTS },
    () => new THREE.Vector3(),
  );
  /** Dirección de cada eslabón en el frame actual (pos[j] -> pos[j+1]). */
  readonly dirNew: THREE.Vector3[] = Array.from(
    { length: KRONOS_CHAIN_POINTS - 1 },
    () => new THREE.Vector3(0, 0, 1),
  );
  /** Vector Up transportado en paralelo por cada punto [0..12]. */
  readonly up: THREE.Vector3[] = Array.from(
    { length: KRONOS_CHAIN_POINTS },
    () => new THREE.Vector3(0, 1, 0),
  );
  /** Longitudes en reposo de los 12 eslabones (m). */
  readonly segLen: number[] = new Array(KRONOS_CHAIN_POINTS - 1).fill(0);
  /** Direcciones de los eslabones medidas en el pose de reposo (bind). */
  readonly restDir: THREE.Vector3[] = Array.from(
    { length: KRONOS_CHAIN_POINTS - 1 },
    () => new THREE.Vector3(0, 0, 1),
  );
  /** Ups de reposo de cada eslabón (ortonormalizados contra restDir). */
  readonly restUp: THREE.Vector3[] = Array.from(
    { length: KRONOS_CHAIN_POINTS - 1 },
    () => new THREE.Vector3(0, 1, 0),
  );
  /** Quaternions de MUNDO de los huesos en reposo (mapeo por pares). */
  readonly restWorldQuat: THREE.Quaternion[] = Array.from(
    { length: KRONOS_CHAIN_POINTS },
    () => new THREE.Quaternion(),
  );
  /** Cadena de huesos [0]=head, [1..12]=seg_01..12 (llenada al medir). */
  readonly bones: (THREE.Object3D | null)[] = new Array(
    KRONOS_CHAIN_POINTS,
  ).fill(null);
  /** Mallas `detail_*` de la cabeza (ojos/cuernos/dientes/fauces). */
  headDetails: THREE.Object3D[] = [];
  /** Mallas `detail_*` del cuerpo (pinchos/aletas). */
  bodyDetails: THREE.Object3D[] = [];
  /** Offset del hueso head respecto al origen de la malla (local de malla). */
  readonly restHeadOffset = new THREE.Vector3();
  /** Quaternión de la cadena mesh→padre(head) en reposo (nodo `root`). */
  readonly parentChainQuat = new THREE.Quaternion();
  /** Rumbo de la cabeza en reposo (de la cola hacia la cabeza). */
  readonly headingRest = new THREE.Vector3(0, 0, 1);
  /** Up de la malla en reposo. */
  readonly upRest = new THREE.Vector3(0, 1, 0);
  /** Orientación suavizada de la malla (control exclusivo de la cadena). */
  readonly meshQuat = new THREE.Quaternion();
  /** Fase integrada de la onda transversal. */
  wavePhase = 0;
  /** Inercia lateral de la cola (links 7..11 = seg_08..12). */
  readonly tailSwing = new Float32Array(5);
  /** Rumbo del frame anterior (tasa de giro para el coleo). */
  readonly headingPrev = new THREE.Vector3(0, 0, 1);
  /** Flexión extra por joint (latigazo / supernova), en rad sobre el up. */
  readonly bendExtra = new Float32Array(KRONOS_CHAIN_POINTS);
  /** Puntos tragados por un portal (ocultos tras cruzar el umbral). */
  readonly submerged = new Array<boolean>(KRONOS_CHAIN_POINTS).fill(false);
}

/**
 * Mide el rig en su pose de reposo y prepara los buffers de la cadena.
 * Devuelve false si aún no hay GLB con el rig completo (queda la forma
 * provisional con hitbox virtual recta).
 */
export function initKronosChain(
  enemy: ManagedWaveEnemy,
  internal: EnemyInternal,
): boolean {
  const rig = internal.kronosRig;
  const chain = internal.kronos.chain;
  if (!rig || !rig.head || rig.segments.length < 12) {
    return false;
  }
  const mesh = enemy.mesh;
  // Medición en reposo: huesos a su pose de reposo y malla a identidad (así
  // el espacio de mundo coincide con el local de la malla).
  mesh.quaternion.identity();
  rig.head.bone.quaternion.copy(rig.head.rest);
  for (const segment of rig.segments) {
    segment.bone.quaternion.copy(segment.rest);
  }
  mesh.updateMatrixWorld(true);
  const headBone = rig.head.bone;
  chain.restHeadOffset
    .copy(headBone.getWorldPosition(_v1))
    .sub(_v2.setFromMatrixPosition(mesh.matrixWorld));
  chain.bones[0] = headBone;
  headBone.parent?.getWorldQuaternion(chain.parentChainQuat);
  for (let i = 0; i < rig.segments.length; i++) {
    chain.bones[i + 1] = rig.segments[i].bone;
  }
  for (let j = 0; j < KRONOS_CHAIN_POINTS; j++) {
    chain.bones[j]!.getWorldPosition(chain.pos[j]);
    chain.bones[j]!.getWorldQuaternion(chain.restWorldQuat[j]);
  }
  for (let j = 0; j < KRONOS_CHAIN_POINTS - 1; j++) {
    _v1.subVectors(chain.pos[j + 1], chain.pos[j]);
    const len = _v1.length();
    chain.segLen[j] = Math.max(0.05, len);
    chain.restDir[j].copy(_v1).multiplyScalar(1 / Math.max(1e-5, len));
    chain.restUp[j]
      .copy(WORLD_UP)
      .addScaledVector(chain.restDir[j], -WORLD_UP.dot(chain.restDir[j]));
    if (chain.restUp[j].lengthSq() < 1e-6) {
      chain.restUp[j].set(0, 0, 1);
    } else {
      chain.restUp[j].normalize();
    }
    chain.dirNew[j].copy(chain.restDir[j]);
  }
  // Rumbo de la malla en reposo: de la cola hacia la cabeza (el frente).
  chain.headingRest.subVectors(chain.pos[0], chain.pos[2]).normalize();
  chain.upRest
    .copy(WORLD_UP)
    .addScaledVector(chain.headingRest, -WORLD_UP.dot(chain.headingRest));
  if (chain.upRest.lengthSq() < 1e-6) {
    chain.upRest.set(0, 1, 0);
  } else {
    chain.upRest.normalize();
  }
  for (let j = 0; j < KRONOS_CHAIN_POINTS; j++) {
    chain.up[j].copy(chain.upRest);
    chain.submerged[j] = false;
    const bone = chain.bones[j];
    if (bone) {
      bone.visible = true;
    }
  }
  // Utilería `detail_*` clasificada por zona (cabeza vs cuerpo).
  chain.headDetails.length = 0;
  chain.bodyDetails.length = 0;
  mesh.traverse((obj) => {
    if (typeof obj.name === 'string' && obj.name.startsWith('detail_')) {
      if (/eyes|horns|jaw|teeth/.test(obj.name)) {
        chain.headDetails.push(obj);
      } else {
        chain.bodyDetails.push(obj);
      }
    }
  });
  for (const flesh of rig.fleshBySegment) {
    if (flesh) {
      flesh.visible = true;
    }
  }
  chain.meshQuat.identity();
  mesh.quaternion.copy(chain.meshQuat);
  chain.headingPrev.copy(chain.headingRest);
  chain.wavePhase = 0;
  chain.tailSwing.fill(0);
  chain.bendExtra.fill(0);
  chain.ready = true;
  return true;
}

/**
 * Rota `dir` hacia `ref` como máximo hasta dejar `maxRad` entre ambos: es el
 * límite angular de rigidez por eslabón (15-18°, sin plegarse en acordeón).
 */
function clampDirToRef(dir: THREE.Vector3, ref: THREE.Vector3, maxRad: number): void {
  const dot = THREE.MathUtils.clamp(dir.dot(ref), -1, 1);
  const angle = Math.acos(dot);
  if (maxRad >= angle || angle < 1e-5) {
    return;
  }
  _v3.crossVectors(dir, ref);
  if (_v3.lengthSq() < 1e-9) {
    return;
  }
  _v3.normalize();
  _q2.setFromAxisAngle(_v3, angle - maxRad);
  dir.applyQuaternion(_q2).normalize();
}

/**
 * Cuaternión R que lleva la base de reposo (dirRest/upRest) a la base actual
 * (dirCur/upCur): W_des del hueso es R * W_rest (mapeo por pares de bases,
 * con el rollo fijado por el Up transportado, no por el (0,1,0) global).
 */
function quatFromBasisPair(
  dirRest: THREE.Vector3,
  upRest: THREE.Vector3,
  dirCur: THREE.Vector3,
  upCur: THREE.Vector3,
  out: THREE.Quaternion,
): void {
  _xRest.crossVectors(upRest, dirRest);
  _basisRest.makeBasis(_xRest, upRest, dirRest);
  _xCur.crossVectors(upCur, dirCur);
  _basisCur.makeBasis(_xCur, upCur, dirCur);
  out.setFromRotationMatrix(_basisCur);
  _q2.setFromRotationMatrix(_basisRest).invert();
  out.multiply(_q2);
}

/**
 * Predicción de intercepción HONESTA: resuelve el tiempo de vuelo contra la
 * trayectoria de Nyx a velocidad constante (con amortiguación del 85%, porque
 * Nyx frena/derrapa en vez de mantener un vector puro). El boss apunta a un
 * punto de futuro real dentro de la física del mundo, sin homing posterior.
 */
function predictIntercept(
  fromPos: THREE.Vector3,
  playerPos: THREE.Vector3,
  playerVel: THREE.Vector3,
  projSpeed: number,
  out: THREE.Vector3,
): void {
  let flyTime = fromPos.distanceTo(playerPos) / Math.max(1, projSpeed);
  for (let iter = 0; iter < 3; iter++) {
    out.copy(playerPos).addScaledVector(playerVel, flyTime * 0.85);
    flyTime = fromPos.distanceTo(out) / Math.max(1, projSpeed);
  }
  out.sub(fromPos);
  if (out.lengthSq() < 1e-6) {
    out.set(0, 0, 1);
  } else {
    out.normalize();
  }
}

// ============================================================================
// FSM de ataques (según fase) + Anillos de Contención + Portales Cósmicos
// ============================================================================

/**
 * Máquina de ataques del Leviatán por fase:
 * - Fase 1 (4 estrellas): Anillos de Contención en cadencia tranquila.
 * - Fase 2 (3): Anillos + Latigazo de Cola si Nyx se acerca (≤ 12 m).
 * - Fase 3 (2): + Portales Cósmicos y Mordisco (secuencia 0/0.5/0.7 s).
 * - Fase 4 (1): sin tiempos muertos: cosmos_fusion, latigazo, anillos y
 *   portales en rotación continua.
 */
export function updateKronosAttack(
  ctx: KronosBehaviorContext,
  enemy: ManagedWaveEnemy,
  internal: EnemyInternal,
  dt: number,
  playerPos: THREE.Vector3,
  onPlayerHit: (damage: number) => void,
  onGolemSmash?: (damage: number, pushDir: THREE.Vector3, pushSpeed?: number) => void,
): void {
  const k = internal.kronos;
  k.starInvulnSec = Math.max(0, k.starInvulnSec - dt);
  k.whipCd = Math.max(0, k.whipCd - dt);
  k.dodgeCd = Math.max(0, k.dodgeCd - dt);
  k.portalCd = Math.max(0, k.portalCd - dt);

  // --- Hitboxes segmentadas vs impacto de alta velocidad de Nyx: un
  // taladro/patada rápida que atraviesa CUALQUIER segmento del cuerpo rompe
  // una Estrella Dorsal (las puertas anti-skip viven en el manager).
  if (k.stars > 1 && k.starInvulnSec <= 0) {
    const nyxSpeed = ctx.playerVelocity.length();
    if (nyxSpeed >= KRONOS_STAR_SWEEP_SPEED) {
      const reach = KRONOS_SEGMENT_HIT_RADIUS + 0.9;
      for (let j = 0; j < KRONOS_CHAIN_POINTS; j++) {
        if (_v1.subVectors(playerPos, k.chain.pos[j]).lengthSq() < reach * reach) {
          ctx.tryBreakKronosStar(
            enemy,
            nyxSpeed,
            nyxSpeed >= KRONOS_STAR_BREAK_SPEED,
          );
          break;
        }
      }
    }
  }

  switch (k.state) {
    case 'rings': {
      k.timer -= dt;
      if (k.timer <= 0) {
        if (k.ringsLeft > 0) {
          emitKronosRing(ctx, enemy, internal, playerPos);
          k.ringsLeft--;
          k.timer =
            k.ringsLeft > 0 ? KRONOS_RING_INTERVAL_SEC : KRONOS_RING_RECOVER_SEC;
        } else {
          k.jawTarget01 = 0;
          k.state = 'roam';
          k.attackCd = cooldownForPhase(k) / ctx.speedMult;
        }
      }
      return;
    }

    case 'whip_windup': {
      k.timer -= dt;
      if (k.timer <= 0) {
        k.state = 'whip_strike';
        k.timer = KRONOS_WHIP_STRIKE_SEC;
        k.whipHit = false;
        internal.kronos.chain.bendExtra.fill(0);
        enemy.hitFlash = Math.max(enemy.hitFlash, 0.3);
      }
      return;
    }

    case 'whip_strike': {
      k.timer -= dt;
      // Acierto: cualquier punto de la cola dentro del arco del latigazo.
      if (!k.whipHit) {
        for (let j = 7; j < KRONOS_CHAIN_POINTS; j++) {
          if (_v1.subVectors(playerPos, k.chain.pos[j]).length() < KRONOS_WHIP_HIT_RADIUS) {
            k.whipHit = true;
            _pushDir.subVectors(playerPos, k.chain.pos[j]);
            if (_pushDir.lengthSq() < 1e-4) {
              _pushDir.set(0, 0, 1);
            } else {
              _pushDir.normalize();
            }
            onGolemSmash?.(KRONOS_WHIP_DAMAGE, _pushDir, KRONOS_WHIP_PUSH_SPEED);
            break;
          }
        }
      }
      if (k.timer <= 0) {
        k.state = k.whipHit ? 'whip_settle' : 'whip_recover';
        k.timer = k.whipHit ? KRONOS_WHIP_SETTLE_SEC : KRONOS_WHIP_RECOVER_SEC;
        if (!k.whipHit) {
          // Fallo: 2 s de recuperación física desacelerada (castigo).
          enemy.hitFlash = Math.max(enemy.hitFlash, 0.22);
        }
      }
      return;
    }

    case 'whip_settle':
    case 'whip_recover': {
      k.timer -= dt;
      if (k.timer <= 0) {
        k.state = 'roam';
        k.whipCd = 2.6;
        k.attackCd = cooldownForPhase(k) / ctx.speedMult;
      }
      return;
    }

    case 'portals': {
      k.timer += dt;
      // t = 0.5 s: se abre el Portal 2 ('SOLAR RIFT') justo detrás de Nyx,
      // apuntando a su espalda.
      if (k.timer >= KRONOS_PORTAL_T_OPEN_P2 && !k.portal2Opened) {
        k.portal2Opened = true;
        openKronosPortal2(ctx, playerPos);
        ctx.kronosNyxEffects.shakePulse = Math.max(
          ctx.kronosNyxEffects.shakePulse,
          0.5,
        );
      }
      // Entrada segmento a segmento: cada punto que cruza el umbral del
      // Portal 1 se oculta al pasar.
      const portal1 = ctx.kronosPortals[0];
      for (let j = 0; j < KRONOS_CHAIN_POINTS; j++) {
        if (!k.chain.submerged[j]) {
          if (_v1.subVectors(k.chain.pos[j], portal1.pos).dot(portal1.dir) > 0.5) {
            k.chain.submerged[j] = true;
          }
        }
      }
      // t = 0.7 s (+0.2 tras el Portal 2): salida disparado a ultra velocidad
      // desde el portal trasero, jaw abierta a -0.95 rad.
      if (k.timer >= KRONOS_PORTAL_T_EXIT) {
        const portal2 = ctx.kronosPortals[1];
        // Teletransporte de la cadena detrás del plano del Portal 2: el
        // resto del cuerpo saldrá segmento a segmento tras la cabeza.
        enemy.position.copy(portal2.pos).addScaledVector(portal2.dir, 1.2);
        let cum = 1.2;
        for (let j = 1; j < KRONOS_CHAIN_POINTS; j++) {
          cum += k.chain.segLen[j - 1];
          k.chain.pos[j]
            .copy(portal2.pos)
            .addScaledVector(portal2.dir, 1.2 - cum);
          k.chain.submerged[j] = true;
        }
        k.chain.submerged[0] = false;
        // Predicción honesta de intercepción con la trayectoria de Nyx.
        const exitSpeed =
          ctx.kronosBaseMaxSpeed * KRONOS_BITE_EXIT_SPEED_MULT * ctx.speedMult;
        predictIntercept(enemy.position, playerPos, ctx.playerVelocity, exitSpeed, _v3);
        k.exitDir.copy(_v3);
        enemy.velocity.copy(k.exitDir).multiplyScalar(exitSpeed);
        k.state = 'portal_bite';
        k.timer = KRONOS_BITE_FLIGHT_SEC;
        k.biteHit = false;
        k.jawTarget01 = 1;
        k.jawRad = KRONOS_BITE_JAW_OPEN_RAD;
        k.jawOpen01 = 1;
        ctx.kronosNyxEffects.shakePulse = Math.max(
          ctx.kronosNyxEffects.shakePulse,
          0.8,
        );
      }
      return;
    }

    case 'portal_bite': {
      k.timer -= dt;
      // Los segmentos reemergen por el portal trasero cruzando su umbral.
      const portal2 = ctx.kronosPortals[1];
      for (let j = 1; j < KRONOS_CHAIN_POINTS; j++) {
        if (k.chain.submerged[j]) {
          if (_v1.subVectors(k.chain.pos[j], portal2.pos).dot(portal2.dir) > -0.6) {
            k.chain.submerged[j] = false;
          }
        }
      }
      if (!k.biteHit) {
        // Impacto: 24 HP + empuje frontal 32 m/s + cabeceo seco.
        if (_v1.subVectors(playerPos, enemy.position).length() < KRONOS_SEGMENT_HIT_RADIUS + 1.4) {
          k.biteHit = true;
          onGolemSmash?.(KRONOS_BITE_DAMAGE, _pushDir.copy(k.exitDir), KRONOS_BITE_PUSH_SPEED);
          // Cierre de golpe: 0 rad en 0.08 s.
          k.jawTarget01 = 0;
          k.state = 'whip_settle';
          k.timer = KRONOS_WHIP_SETTLE_SEC;
          return;
        }
      }
      if (k.timer <= 0) {
        k.jawTarget01 = 0;
        k.state = 'whip_settle';
        k.timer = KRONOS_WHIP_SETTLE_SEC;
      }
      return;
    }

    case 'cosmos_fusion': {
      k.timer -= dt;
      if (k.timer <= 0) {
        // Habilidad definitiva INESQUIVABLE: impacto automático directo con
        // destello void cosmos en HUD/pantalla.
        onPlayerHit(KRONOS_COSMOS_DAMAGE);
        ctx.kronosNyxEffects.voidFlashPulse = 1;
        ctx.kronosNyxEffects.shakePulse = Math.max(ctx.kronosNyxEffects.shakePulse, 1.2);
        k.state = 'roam';
        k.attackCd = Math.max(0.9, cooldownForPhase(k)) / ctx.speedMult;
      }
      return;
    }

    case 'supernova': {
      k.timer -= dt;
      if (k.timer <= 0) {
        ctx.finalizeKronosSupernova(enemy);
      }
      return;
    }

    case 'roam':
    default: {
      if (k.attackCd > 0) {
        k.attackCd -= dt;
        return;
      }
      const dist = enemy.position.distanceTo(playerPos);
      // Latigazo inmediato por cercanía (Fase 2+): condición ≤ 12 m.
      if (k.stars <= 3 && k.stars > 1 && dist <= KRONOS_WHIP_RANGE && k.whipCd <= 0) {
        startKronosWhip(k, enemy, playerPos);
        k.attackIndex++;
        return;
      }
      if (k.stars === 4) {
        // FASE 1 — Exploración: único ataque, Anillos de Contención.
        startKronosRings(k, enemy, 0);
      } else if (k.stars === 3) {
        // FASE 2 — Ataque: Anillos o Latigazo si Nyx se pega.
        if (dist <= 15) {
          startKronosWhip(k, enemy, playerPos);
        } else {
          startKronosRings(k, enemy, k.attackIndex % 2);
        }
      } else if (k.stars === 2) {
        // FASE 3 — Cabdeo: Anillos, Mordisco por portales o Latigazo.
        if (k.portalCd <= 0 && k.attackIndex % 3 === 1) {
          startKronosPortals(ctx, k, enemy);
        } else if (dist <= KRONOS_WHIP_RANGE && k.whipCd <= 0) {
          startKronosWhip(k, enemy, playerPos);
        } else {
          startKronosRings(k, enemy, k.attackIndex % 3);
        }
      } else {
        // FASE 4 — Destrucción: IA perfecta sin tiempos muertos.
        const slot = k.attackIndex % 4;
        if (slot === 0) {
          k.state = 'cosmos_fusion';
          k.timer = KRONOS_COSMOS_WINDUP_SEC;
        } else if (slot === 1 && dist <= KRONOS_WHIP_RANGE + 3 && k.whipCd <= 0) {
          startKronosWhip(k, enemy, playerPos);
        } else if (slot === 2) {
          startKronosRings(k, enemy, k.attackIndex % 3);
        } else {
          startKronosPortals(ctx, k, enemy);
        }
      }
      k.attackIndex++;
      return;
    }
  }
}

/** Cadencia entre ataques según la fase (menos estrellas = más agresivo). */
function cooldownForPhase(k: KronosBossState): number {
  if (k.stars === 4) return 5.0;
  if (k.stars === 3) return 3.8;
  if (k.stars === 2) return 2.9;
  return 1.1;
}

function startKronosRings(k: KronosBossState, enemy: ManagedWaveEnemy, slot: number): void {
  k.state = 'rings';
  k.ringsLeft = KRONOS_RING_COUNT[slot % KRONOS_RING_COUNT.length];
  k.timer = KRONOS_RING_TELEGRAPH_SEC;
  k.jawTarget01 = 1;
  k.jawRad = KRONOS_RING_TELEGRAPH_JAW_RAD;
  enemy.hitFlash = Math.max(enemy.hitFlash, 0.2);
}

function startKronosWhip(
  k: KronosBossState,
  enemy: ManagedWaveEnemy,
  playerPos: THREE.Vector3,
): void {
  k.state = 'whip_windup';
  k.timer = KRONOS_WHIP_WINDUP_SEC;
  // Flanco de Nyx respecto al rumbo: de ahí parte la torsión del telegraph.
  _v1.subVectors(playerPos, enemy.position);
  _v2.crossVectors(k.chain.headingPrev, WORLD_UP);
  if (_v2.lengthSq() < 1e-6) {
    _v2.set(1, 0, 0);
  }
  k.whipSide = _v1.dot(_v2) >= 0 ? 1 : -1;
  k.whipHeadYaw = 0;
  enemy.hitFlash = Math.max(enemy.hitFlash, 0.2);
}

function startKronosPortals(
  ctx: KronosBehaviorContext,
  k: KronosBossState,
  enemy: ManagedWaveEnemy,
): void {
  const portal1 = ctx.kronosPortals[0];
  // Portal 1 DELANTE de la trayectoria de KRONOS.
  _v1.copy(enemy.velocity);
  if (_v1.lengthSq() < 1) {
    _v1.copy(k.chain.headingPrev);
  } else {
    _v1.normalize();
  }
  portal1.pos.copy(enemy.position).addScaledVector(_v1, KRONOS_PORTAL1_AHEAD);
  portal1.dir.copy(_v1);
  openKronosPortal(portal1);
  k.state = 'portals';
  k.timer = 0;
  k.portal2Opened = false;
  k.portalCd = KRONOS_PORTAL_COOLDOWN;
  // Rugido profundo + camera shake de la apertura.
  ctx.kronosNyxEffects.shakePulse = Math.max(ctx.kronosNyxEffects.shakePulse, 1.0);
}

/** Abre el Portal 2 ('SOLAR RIFT') justo detrás de Nyx, apuntando a su espalda. */
function openKronosPortal2(ctx: KronosBehaviorContext, playerPos: THREE.Vector3): void {
  const portal2 = ctx.kronosPortals[1];
  _predicted
    .copy(playerPos)
    .addScaledVector(ctx.playerAimForward, -KRONOS_PORTAL2_BEHIND);
  // Contención: el portal del boss no se abre fuera de la cúpula.
  if (_predicted.length() > KRONOS_DOME_KEEP_RADIUS + 12) {
    _predicted.setLength(KRONOS_DOME_KEEP_RADIUS + 12);
  }
  portal2.pos.copy(_predicted);
  // Su +Z de cruce mira hacia la espalda de Nyx (hacia ella).
  predictIntercept(portal2.pos, playerPos, ctx.playerVelocity, 70, portal2.dir);
  openKronosPortal(portal2);
}

/** Apertura elástica del portal (muelle con rebrote), vórtice y vida. */
function openKronosPortal(portal: KronosPortal): void {
  portal.active = true;
  portal.open = 0;
  portal.openVel = 7;
  portal.life = KRONOS_PORTAL_LIFE_SEC;
  portal.group.visible = true;
  portal.group.position.copy(portal.pos);
  portal.group.quaternion.setFromUnitVectors(AXIS_Z, portal.dir);
  portal.diskMaterial.uniforms.uOpacity.value = 0.92;
}

/**
 * Avanza los portales activos: apertura elástica hasta 14 m de diámetro,
 * rotación de vórtice del disco SOLAR RIFT, respiración del aro y cierre con
 * desvanecimiento al agotarse la vida.
 */
export function updateKronosPortals(
  portals: KronosPortal[],
  dt: number,
  elapsed: number,
): void {
  for (const portal of portals) {
    if (!portal.active) {
      continue;
    }
    const target = portal.life > 0 ? 1 : 0;
    // Muelle subamortiguado: rebrote elástico al abrir.
    portal.openVel += (target - portal.open) * 90 * dt;
    portal.openVel *= Math.exp(-6.5 * dt);
    portal.open = Math.min(1.15, Math.max(0, portal.open + portal.openVel * dt));
    const diskRadius = KRONOS_PORTAL_DIAMETER * 0.5 * Math.min(1, portal.open);
    portal.disk.scale.setScalar(Math.max(0.01, diskRadius));
    portal.rim.scale.setScalar(Math.max(0.01, diskRadius * 1.02));
    portal.disk.rotation.z += dt * 6.0; // Rotación de vórtice.
    portal.diskMaterial.uniforms.uTime.value = elapsed;
    if (portal.life > 0) {
      portal.life -= dt;
      portal.rimMaterial.opacity =
        0.55 + 0.4 * Math.sin(elapsed * 9.0) * Math.min(1, portal.open);
      continue;
    }
    // Vida agotada: cierre con desvanecimiento del disco.
    portal.diskMaterial.uniforms.uOpacity.value = Math.max(0, 0.92 * portal.open);
    portal.rimMaterial.opacity = Math.min(
      portal.rimMaterial.opacity,
      Math.max(0, portal.open),
    );
    if (portal.open <= 0.02) {
      deactivateKronosPortal(portal);
    }
  }
}

/** Cierra y oculta un portal. */
export function deactivateKronosPortal(portal: KronosPortal): void {
  portal.active = false;
  portal.open = 0;
  portal.openVel = 0;
  portal.life = 0;
  portal.group.visible = false;
  portal.diskMaterial.uniforms.uOpacity.value = 0.92;
}

/** Cierra todos los portales y desoculta los segmentos tragados. */
export function deactivateKronosPortals(ctx: KronosBehaviorContext): void {
  for (const portal of ctx.kronosPortals) {
    deactivateKronosPortal(portal);
  }
}

/** Emite un Anillo de Contención desde las fauces abiertas (hueso `jaw`). */
function emitKronosRing(
  ctx: KronosBehaviorContext,
  enemy: ManagedWaveEnemy,
  internal: EnemyInternal,
  playerPos: THREE.Vector3,
): void {
  const ring = ctx.kronosRings.find((r) => !r.active);
  if (!ring) {
    return;
  }
  const jaw = internal.kronosRig?.jaw;
  if (jaw) {
    jaw.bone.updateWorldMatrix(true, false);
    jaw.bone.getWorldPosition(_shootFrom);
  } else {
    _shootFrom.copy(enemy.position);
  }
  _shootDir.subVectors(playerPos, _shootFrom);
  if (_shootDir.lengthSq() < 1e-4) {
    _shootDir.set(0, 0, 1);
  } else {
    _shootDir.normalize();
  }
  ring.active = true;
  ring.origin.copy(_shootFrom);
  ring.dir.copy(_shootDir);
  ring.travel = 0;
  ring.radius = 1.5;
  ring.pushed = false;
  ring.mesh.position.copy(_shootFrom);
  ring.mesh.quaternion.setFromUnitVectors(AXIS_Z, _shootDir);
  ring.mesh.scale.setScalar(ring.radius);
  ring.mesh.visible = true;
}

/**
 * Avanza los Anillos de Contención: el centro viaja a 9 m/s hacia Nyx
 * mientras el radio crece a 16 m/s hasta los 55 m; al cruzar la banda, Nyx
 * recibe un empuje radial único de 30 m/s hacia la Barrera Blanca (0 daño
 * directo): el -10 HP lo aplica la propia Barrera al tocarla.
 */
export function updateKronosRings(
  ctx: KronosBehaviorContext,
  dt: number,
  playerPos: THREE.Vector3,
  onGolemSmash?: (damage: number, pushDir: THREE.Vector3, pushSpeed?: number) => void,
): void {
  for (const ring of ctx.kronosRings) {
    if (!ring.active) {
      continue;
    }
    ring.travel += KRONOS_RING_TRAVEL_SPEED * dt;
    ring.radius += KRONOS_RING_EXPAND_SPEED * dt;
    ring.mesh.position.copy(ring.origin).addScaledVector(ring.dir, ring.travel);
    ring.mesh.scale.setScalar(ring.radius);
    if (!ring.pushed) {
      _v1.subVectors(playerPos, ring.mesh.position);
      const dist = _v1.length();
      if (Math.abs(dist - ring.radius) < KRONOS_RING_HIT_BAND) {
        ring.pushed = true;
        if (dist > 1e-4) {
          _v1.divideScalar(dist);
        } else {
          _v1.copy(ring.dir);
        }
        onGolemSmash?.(0, _v1, KRONOS_RING_PUSH_SPEED);
      }
    }
    if (ring.radius >= KRONOS_RING_MAX_RADIUS) {
      ring.active = false;
      ring.mesh.visible = false;
    }
  }
}

/** Desactiva todos los Anillos de Contención en vuelo. */
export function deactivateKronosRings(ctx: KronosBehaviorContext): void {
  for (const ring of ctx.kronosRings) {
    ring.active = false;
    ring.mesh.visible = false;
  }
}

// ============================================================================
// Movimiento — solo la cabeza es empujada por la velocidad de la IA
// ============================================================================

/**
 * Movimiento del Leviatán por fase: patrulla escurridiza en anillo 28-45 m
 * (Fase 1), caza media con esquivas a 1.0·V_base (Fase 2), persecución con
 * predicción honesta a 1.35·V_base (Fase 3) y acoso sin tiempos muertos
 * (Fase 4). Contención suave dentro del radio seguro de la cúpula (es inmune
 * a la Barrera Blanca, salvo al cruzar los portales).
 */
export function updateKronosMovement(
  ctx: KronosBehaviorContext,
  enemy: ManagedWaveEnemy,
  internal: EnemyInternal,
  dt: number,
  elapsed: number,
  playerPos: THREE.Vector3,
): void {
  const k = internal.kronos;
  const vBase = ctx.kronosBaseMaxSpeed * ctx.speedMult;
  const phaseIdx = THREE.MathUtils.clamp(4 - k.stars, 0, 3);
  const phaseSpeed = vBase * KRONOS_PHASE_SPEED[phaseIdx];

  switch (k.state) {
    case 'rings': {
      enemy.velocity.multiplyScalar(Math.exp(-1.8 * dt));
      break;
    }
    case 'whip_windup': {
      // Telegraph de torsión: frena en seco antes del latigazo.
      enemy.velocity.multiplyScalar(Math.exp(-4.5 * dt));
      break;
    }
    case 'whip_strike': {
      // Latigazo centrífugo: mantiene el rumbo (el cuerpo barre el arco).
      enemy.velocity.multiplyScalar(Math.exp(-0.8 * dt));
      break;
    }
    case 'whip_settle': {
      // Asentamiento tras conectar: recupera la soltura.
      enemy.velocity.multiplyScalar(Math.exp(-1.2 * dt));
      break;
    }
    case 'whip_recover': {
      // Fallo: 2 s de recuperación física desacelerada (ventana de castigo).
      enemy.velocity.multiplyScalar(Math.exp(-2.6 * dt));
      break;
    }
    case 'portals': {
      // Entrada al Portal 1: recto hacia la fisura, más rápido que la fase.
      _toTarget.subVectors(ctx.kronosPortals[0].pos, enemy.position);
      steerKronos(enemy, _toTarget, phaseSpeed * 1.25, 3.2, dt);
      break;
    }
    case 'portal_bite': {
      // Salida disparado a ultra velocidad: línea recta comprometida (la
      // predicción se hizo honesta en el umbral), sin homing posterior.
      if (k.timer < KRONOS_BITE_FLIGHT_SEC * 0.35) {
        enemy.velocity.multiplyScalar(Math.exp(-2.2 * dt));
      }
      break;
    }
    case 'supernova': {
      // Convulsión final: pierde todo el impulso.
      enemy.velocity.multiplyScalar(Math.exp(-5 * dt));
      break;
    }
    case 'cosmos_fusion': {
      enemy.velocity.multiplyScalar(Math.exp(-0.7 * dt));
      break;
    }
    case 'roam':
    default: {
      const dist = enemy.position.distanceTo(playerPos);
      // Esquivas honestas (Fase 2+): dash lateral ante la patada cercana.
      if (k.stars <= 3 && k.dodgeCd <= 0) {
        const dodging =
          dist < KRONOS_DODGE_RANGE &&
          ctx.playerVelocity.length() >= KRONOS_STAR_SWEEP_SPEED;
        if (dodging) {
          _v1.subVectors(enemy.position, playerPos).normalize();
          _v2.crossVectors(_v1, WORLD_UP);
          if (_v2.lengthSq() < 1e-4) {
            _v2.set(1, 0, 0);
          } else {
            _v2.normalize();
          }
          enemy.velocity
            .copy(_v2)
            .multiplyScalar(phaseSpeed * k.dodgeSign)
            .addScaledVector(_v1, phaseSpeed * 0.4);
          k.dodgeSign = k.dodgeSign === 1 ? -1 : 1;
          k.dodgeCd = KRONOS_DODGE_COOLDOWN;
          enemy.hitFlash = Math.max(enemy.hitFlash, 0.15);
        }
      }
      let accel = 2.0;
      if (k.stars === 4) {
        // FASE 1 — Exploración: anillo lejano/medio con esquiva suave.
        k.orbitAngle += 0.42 * dt;
        const ring =
          KRONOS_PATROL_RING_MIN +
          (KRONOS_PATROL_RING_MAX - KRONOS_PATROL_RING_MIN) *
            (0.5 + 0.5 * Math.sin(elapsed * 0.13 + enemy.phase));
        _toTarget.set(
          Math.cos(k.orbitAngle) * ring,
          KRONOS_PATROL_HEIGHT + Math.sin(elapsed * 0.3 + enemy.phase) * 4,
          Math.sin(k.orbitAngle) * ring,
        );
        // Escurridizo: si Nyx se aproxima DESPACIO, deriva tangencialmente.
        if (dist < 22 && ctx.playerVelocity.length() < 12) {
          _v1.subVectors(enemy.position, playerPos).normalize();
          _v2.crossVectors(_v1, WORLD_UP);
          if (_v2.lengthSq() > 1e-4) {
            _v2.normalize();
            _toTarget.addScaledVector(_v2, 18).addScaledVector(_v1, 10);
          }
        }
      } else if (k.stars === 3) {
        // FASE 2 — Ataque: caza orbitando a Nyx a media distancia.
        k.orbitAngle += 0.55 * dt;
        _toTarget.set(
          playerPos.x + Math.cos(k.orbitAngle) * 26,
          playerPos.y + Math.sin(elapsed * 0.4 + enemy.phase) * 6,
          playerPos.z + Math.sin(k.orbitAngle) * 26,
        );
        accel = 2.4;
      } else {
        // FASE 3/4 — Cabdeo/Destrucción: persecución con predicción honesta
        // de la trayectoria de Nyx (intercepción, no persecución pura).
        predictIntercept(enemy.position, playerPos, ctx.playerVelocity, phaseSpeed, _predicted);
        _toTarget
          .copy(playerPos)
          .addScaledVector(
            _predicted,
            Math.min(16, enemy.position.distanceTo(playerPos) * 0.5),
          );
        accel = k.stars === 1 ? 3.0 : 2.6;
      }
      steerKronos(enemy, _v1.subVectors(_toTarget, enemy.position), phaseSpeed, accel, dt);
      break;
    }
  }

  // Contención suave dentro del radio seguro de la cúpula (excepto durante
  // el cruce de portales de la Fase 3 y 4).
  if (k.state !== 'portals' && k.state !== 'portal_bite') {
    _v1.set(enemy.position.x, 0, enemy.position.z);
    const flatDist = _v1.length();
    if (flatDist > KRONOS_DOME_KEEP_RADIUS) {
      _v1.normalize();
      enemy.velocity.addScaledVector(_v1, -KRONOS_DOME_KEEP_PULL * dt);
    }
    if (enemy.position.y > 48) {
      enemy.velocity.y -= 9 * dt;
    } else if (enemy.position.y < -6) {
      enemy.velocity.y += 9 * dt;
    }
  }
  // Amortiguación global suave + integración + tope de velocidad de fase.
  enemy.velocity.multiplyScalar(Math.exp(-0.35 * dt));
  enemy.position.addScaledVector(enemy.velocity, dt);
  const sp = enemy.velocity.length();
  if (sp > phaseSpeed * 1.25) {
    enemy.velocity.multiplyScalar((phaseSpeed * 1.25) / sp);
  }
}

/** Giro suave hacia un objetivo con aceleración limitada (nada de snapeos). */
function steerKronos(
  enemy: ManagedWaveEnemy,
  toTarget: THREE.Vector3,
  speed: number,
  accel: number,
  dt: number,
): void {
  if (toTarget.lengthSq() < 1e-4) {
    return;
  }
  _v2.copy(toTarget).normalize().multiplyScalar(speed);
  enemy.velocity.lerp(_v2, 1 - Math.exp(-accel * dt));
}

// ============================================================================
// Pose — física de cadena + quaternions procedurales de los huesos
// ============================================================================

/**
 * Integra la cadena serpentina y posa los huesos:
 * 1. La malla se orienta (suavizada) por el rumbo de avance; solo la CABEZA
 *    es empujada por la velocidad de la IA.
 * 2. Follow-the-leader sobre los 13 puntos: cada segmento sigue al anterior
 *    manteniendo `segLen` con límite angular de ~15-18° por eslabón, onda de
 *    impulso senoidal proporcional a la velocidad e inercia lateral en
 *    seg_08..12 (la cola coletea en los giros).
 * 3. Up transportado en paralelo de head a seg_12: los quaterniones salen
 *    del par de bases reposo→actual (sin (0,1,0) global: nada de gimbal flip
 *    en picados 0G).
 * 4. updateMatrixWorld + lectura real de posiciones de mundo: esferas de
 *    colisión segmentadas sobre segWorldPos[0..12] (star_core_1..4 vinculadas
 *    a seg_03/06/09/12).
 */
export function updateKronosPose(
  ctx: KronosBehaviorContext,
  enemy: ManagedWaveEnemy,
  internal: EnemyInternal,
  dt: number,
  elapsed: number,
  playerPos: THREE.Vector3,
): void {
  const k = internal.kronos;
  const chain = k.chain;
  const rig = internal.kronosRig;

  // Cadena aún sin medir (GLB cargando o forma provisional).
  if (!chain.ready) {
    if (!initKronosChain(enemy, internal) || !chain.ready) {
      // Sin rig: la forma provisional simplemente encara su rumbo.
      _heading.copy(enemy.velocity);
      if (_heading.lengthSq() > 6.25) {
        faceTowards(enemy.mesh, _heading.normalize(), KRONOS_TURN_RATE, dt);
      } else {
        _heading.subVectors(playerPos, enemy.position);
        if (_heading.lengthSq() > 1e-6) {
          faceTowards(enemy.mesh, _heading.normalize(), KRONOS_TURN_RATE, dt);
        }
      }
      initFallbackChainPositions(enemy, k);
      return;
    }
  }

  const speed = enemy.velocity.length();
  // 1) Rumbo de la cabeza (la IA empuja; parada, mira escrutando a Nyx).
  if (speed > 2.5) {
    _heading.copy(enemy.velocity).multiplyScalar(1 / speed);
  } else {
    _heading.subVectors(playerPos, enemy.position);
    if (_heading.lengthSq() < 1e-6) {
      _heading.copy(chain.headingPrev);
    } else {
      _heading.normalize();
    }
  }

  // Transporte paralelo del Up de la cabeza (sin gimbal flip en picados).
  chain.up[0].addScaledVector(_heading, -chain.up[0].dot(_heading));
  if (chain.up[0].lengthSq() < 1e-6) {
    chain.up[0]
      .copy(WORLD_UP)
      .addScaledVector(_heading, -WORLD_UP.dot(_heading));
  }
  chain.up[0].normalize();

  // Orientación suavizada de la malla: par (rumbo reposo→actual, up).
  quatFromBasisPair(chain.headingRest, chain.upRest, _heading, chain.up[0], _q1);
  chain.meshQuat.slerp(_q1, 1 - Math.exp(-KRONOS_TURN_RATE * ctx.speedMult * dt));
  enemy.mesh.quaternion.copy(chain.meshQuat);

  // 2) Follow-the-leader con rigidez angular por eslabón.
  const headWorld = _v4
    .copy(enemy.position)
    .add(_v1.copy(chain.restHeadOffset).applyQuaternion(chain.meshQuat));
  chain.pos[0].copy(headWorld);
  const speedFactor = THREE.MathUtils.clamp(speed / 12, 0.35, 1.6);
  chain.wavePhase += KRONOS_WAVE_FREQ * (0.7 + speedFactor * 0.5) * dt;
  // Tasa de giro firmada (para la inercia lateral de la cola).
  const turn = signedHeadingTurn(chain.headingPrev, _heading, chain.up[0]);
  chain.headingPrev.copy(_heading);

  // Referencia del eslabón 0: el eslabón recto hacia atrás con la malla ya
  // girada (la cadena sale de la nuca, no del eje de advance).
  _v2.copy(chain.restDir[0]).applyQuaternion(chain.meshQuat);

  for (let j = 1; j < KRONOS_CHAIN_POINTS; j++) {
    const link = j - 1;
    const dir = chain.dirNew[link];
    dir.subVectors(chain.pos[j], chain.pos[j - 1]);
    if (dir.lengthSq() < 1e-8) {
      dir.copy(chain.restDir[link]);
    } else {
      dir.normalize();
    }
    // Rigidez angular: hacia el eslabón anterior (el 0, hacia la nuca).
    clampDirToRef(dir, link === 0 ? _v2 : chain.dirNew[link - 1], KRONOS_MAX_BEND_RAD);
    // Up transportado en paralelo a lo largo de la cadena.
    const upJ = chain.up[j];
    upJ.copy(chain.up[j - 1]).addScaledVector(dir, -chain.up[j - 1].dot(dir));
    if (upJ.lengthSq() < 1e-6) {
      upJ.set(0, 1, 0);
    } else {
      upJ.normalize();
    }
    // Onda de impulso transversal (serpenteo) + inercia lateral de la cola.
    let yaw =
      Math.sin(chain.wavePhase + link * KRONOS_WAVE_PHASE_STEP) *
      KRONOS_WAVE_YAW_AMP *
      speedFactor;
    if (link >= 7) {
      const idx = link - 7;
      const targetSwing =
        THREE.MathUtils.clamp(turn * 1.6, -0.42, 0.42) * ((idx + 1) / 5);
      chain.tailSwing[idx] += (targetSwing - chain.tailSwing[idx]) * Math.min(1, dt * 3.2);
      chain.tailSwing[idx] *= Math.exp(-1.1 * dt);
      yaw += chain.tailSwing[idx] + chain.bendExtra[j];
    } else {
      yaw += chain.bendExtra[j];
    }
    if (yaw !== 0) {
      _q2.setFromAxisAngle(upJ, yaw);
      dir.applyQuaternion(_q2).normalize();
    }
    chain.dirNew[link].copy(dir);
    chain.pos[j].copy(chain.pos[j - 1]).addScaledVector(dir, chain.segLen[link]);
  }

  // 3) Flexiones extra del latigazo / supernova + escrutinio de la cabeza.
  updateKronosHeadBends(k, enemy, chain, dt, elapsed);

  // 4) Posa real de huesos: local = inv(W_parent) * (R * W_rest).
  for (let j = 0; j < KRONOS_CHAIN_POINTS; j++) {
    const dirCur = j < KRONOS_CHAIN_POINTS - 1 ? chain.dirNew[j] : chain.dirNew[j - 1];
    quatFromBasisPair(chain.restDir[j], chain.restUp[j], dirCur, chain.up[j], _q1);
    // Escrutinio/quebro aplicado sobre el hueso head (j = 0).
    if (j === 0) {
      applyHeadScrutiny(k, chain, _q1);
    }
    _q2.copy(_q1).multiply(chain.restWorldQuat[j]);
    if (j === 0) {
      _qParent.copy(chain.meshQuat).multiply(chain.parentChainQuat);
    } else {
      _qParent.copy(_lastBoneWorld);
    }
    chain.bones[j]!.quaternion
      .copy(_qParent)
      .invert()
      .multiply(_q2);
    _lastBoneWorld.copy(_q2);
  }

  // Mandíbula: aperturas por ataque + cierre seco del mordisco.
  updateKronosJaw(ctx, internal, k, dt);

  // Refresco de matrices: lectura REAL de las posiciones de mundo (las
  // hitboxes segmentadas y la estrella de cada eslabón viven sobre ellas).
  enemy.mesh.updateMatrixWorld(true);
  if (chain.bones[0]) {
    chain.bones[0].getWorldPosition(chain.pos[0]);
  }
  for (let j = 1; j < KRONOS_CHAIN_POINTS; j++) {
    chain.bones[j]?.getWorldPosition(chain.pos[j]);
  }

  // Visibilidad de portales: esconde los segmentos tragados uno a uno.
  applyKronosVisibility(internal, k);

  // Aletas pectorales + punta de cola: vaivén orgánico independiente de la
  // física de cadena; abanico tail_L/tail_R del latigazo (~180°).
  const finFlap = Math.sin(elapsed * KRONOS_FIN_FLAP_SPEED + enemy.phase);
  ctx.poseBone(rig?.finL ?? null, 0, 0, finFlap * KRONOS_FIN_FLAP_AMP);
  ctx.poseBone(rig?.finR ?? null, 0, 0, -finFlap * KRONOS_FIN_FLAP_AMP);
  const fan =
    k.state === 'whip_strike'
      ? KRONOS_WHIP_FAN_RAD * (1 - k.timer / KRONOS_WHIP_STRIKE_SEC)
      : KRONOS_WHIP_FAN_RAD * 0.14 * (0.5 + 0.5 * Math.sin(elapsed * 2.2));
  ctx.poseBone(rig?.tailL ?? null, -0.14, 0, fan);
  ctx.poseBone(rig?.tailR ?? null, -0.14, 0, -fan);
  ctx.poseBone(
    rig?.tailTip ?? null,
    Math.sin(elapsed * 3.4 + enemy.phase) * 0.18,
    0,
    Math.sin(elapsed * 4.6 + enemy.phase) * 0.22,
  );

  // Estrellas Dorsales: pulso de brillo (la rotación de star_core es 100%
  // procedural: el mixer está desactivado para GLB del boss).
  const starBoost =
    enemy.hitFlash * 1.5 + (k.state === 'whip_windup' ? 0.5 + Math.sin(elapsed * 9) * 0.3 : 0);
  for (const material of rig?.starCoreMaterials ?? []) {
    material.uniforms.uEmissiveBoost.value = STAR_CORE_EMISSIVE + starBoost;
  }
}

const _lastBoneWorld = new THREE.Quaternion();

/** Turno firmado (rad/frame) de la cabeza alrededor de su up transportado. */
function signedHeadingTurn(prev: THREE.Vector3, cur: THREE.Vector3, up: THREE.Vector3): number {
  const cross = _v3.crossVectors(prev, cur).dot(up);
  const dot = THREE.MathUtils.clamp(prev.dot(cur), -1, 1);
  return Math.atan2(cross, Math.acos(dot));
}

/**
 * Flexiones extra por estado: quebro del telegraph del latigazo, ola del
 * latigazo centrífugo por seg_06..12 y convulsión de la supernova.
 */
function updateKronosHeadBends(
  k: KronosBossState,
  enemy: ManagedWaveEnemy,
  chain: KronosChain,
  dt: number,
  _elapsed: number,
): void {
  if (k.state === 'whip_windup') {
    // Telegraph ~0.35 s: quiebra la cabeza hacia el flanco (whipHeadYaw lo
    // aplica el hueso head al construir el par de bases).
    const p = 1 - k.timer / KRONOS_WHIP_WINDUP_SEC;
    k.whipHeadYaw = -0.5 * k.whipSide * p;
  } else if (k.state === 'whip_strike') {
    // Invierte el giro: el latigazo centrífugo se propaga por seg_06..12.
    const t = 1 - k.timer / KRONOS_WHIP_STRIKE_SEC;
    k.whipHeadYaw = 0.35 * k.whipSide * t;
    for (let j = 6; j <= 12; j++) {
      const local = THREE.MathUtils.clamp((t * 1.25 - (j - 6) / 6.5) / 0.25, 0, 1);
      const bend = local * 0.5 * k.whipSide;
      if (Math.abs(bend) > Math.abs(chain.bendExtra[j])) {
        chain.bendExtra[j] = bend;
      }
    }
  } else if (k.state === 'supernova') {
    // Convulsión segmento a segmento creciendo hacia el estallido.
    const conv = 1 - k.timer / KRONOS_SUPERNOVA_SEC;
    for (let j = 0; j < KRONOS_CHAIN_POINTS; j++) {
      chain.bendExtra[j] =
        chain.bendExtra[j] * Math.exp(-dt * 18) +
        (Math.random() - 0.5) * conv * (j >= 8 ? 0.24 : 0.12);
    }
  } else {
    k.whipHeadYaw *= Math.exp(-3 * dt);
    // Relajación de la flexión del latigazo (la ola se apaga sola).
    for (let j = 1; j < KRONOS_CHAIN_POINTS; j++) {
      chain.bendExtra[j] *= Math.exp(-6 * dt);
    }
  }
}

/** Quebro/escrutinio de la cabeza (rotación del hueso head sobre su up). */
function applyHeadScrutiny(k: KronosBossState, chain: KronosChain, quat: THREE.Quaternion): void {
  let yaw = k.whipHeadYaw;
  // Escrutinio orgánico: la cabeza vaivene escuchando el universo mientras
  // patrulla (fase integrada de la onda del cuerpo, nada de estados falsos).
  if (k.state === 'roam' || k.state === 'rings' || k.state === 'portals') {
    yaw += Math.sin(chain.wavePhase * 0.28) * 0.09;
  }
  if (yaw === 0) {
    return;
  }
  const upW = _v1.copy(WORLD_UP).applyQuaternion(quat);
  _q2.setFromAxisAngle(upW, yaw);
  quat.premultiply(_q2);
}

/** Apertura de la mandíbula por estado (telegraphs, mordisco, supernova). */
function updateKronosJaw(
  ctx: KronosBehaviorContext,
  internal: EnemyInternal,
  k: KronosBossState,
  dt: number,
): void {
  const rig = internal.kronosRig;
  if (!rig?.jaw) {
    return;
  }
  let rate = 10;
  if (k.state === 'rings') {
    k.jawTarget01 = k.ringsLeft > 0 ? 1 : 0;
    k.jawRad = KRONOS_RING_TELEGRAPH_JAW_RAD;
  } else if (k.state === 'portal_bite') {
    // En vuelo del mordisco se mantiene -0.95 rad; tras conectar/caducar el
    // cierre de golpe dura 0.08 s (jawTarget01 lo pidió la FSM en 0).
    k.jawRad = KRONOS_BITE_JAW_OPEN_RAD;
    rate = k.jawTarget01 < k.jawOpen01 ? 1 / KRONOS_BITE_JAW_SNAP_SEC : 10;
  } else if (k.state === 'supernova') {
    // Cháchara de mandíbula durante la convulsión final.
    k.jawRad = KRONOS_RING_TELEGRAPH_JAW_RAD;
    k.jawTarget01 = Math.sin(k.timer * 87) > 0 ? 0.65 : 0.1;
  } else {
    k.jawTarget01 = 0;
  }
  k.jawOpen01 += (k.jawTarget01 - k.jawOpen01) * Math.min(1, rate * dt);
  ctx.poseBone(rig.jaw, -k.jawRad * k.jawOpen01, 0, 0);
}

/**
 * Ocultado segmento a segmento por los portales: la carne de cada eslabón
 * (flesh_head / flesh_seg_XX, con sus estrellas) desaparece al cruzar el
 * umbral y reaparece al salir segmento a segmento por el portal trasero.
 * Las estrellas rotas permanecen apagadas pase lo que pase.
 */
function applyKronosVisibility(internal: EnemyInternal, k: KronosBossState): void {
  const rig = internal.kronosRig;
  if (!rig) {
    return;
  }
  const chain = k.chain;
  for (let j = 0; j < KRONOS_CHAIN_POINTS; j++) {
    const hidden = chain.submerged[j];
    const bone = chain.bones[j];
    if (bone) {
      bone.visible = !hidden;
    }
    const flesh = rig.fleshBySegment[j];
    if (flesh) {
      flesh.visible = !hidden;
    }
  }
  for (const detail of chain.headDetails) {
    detail.visible = !chain.submerged[0];
  }
  for (const detail of chain.bodyDetails) {
    detail.visible = !(chain.submerged[4] && chain.submerged[8]);
  }
  for (let s = 0; s < rig.starCoreMeshes.length; s++) {
    if (s >= k.stars) {
      rig.starCoreMeshes[s].visible = false;
    }
  }
}

/** Cadena virtual (sin GLB aún): recta tras la cabeza para las hitboxes. */
function initFallbackChainPositions(enemy: ManagedWaveEnemy, k: KronosBossState): void {
  const chain = k.chain;
  chain.pos[0].copy(enemy.position);
  _v1.copy(enemy.velocity);
  if (_v1.lengthSq() < 1e-4) {
    _v1.set(0, 0, 1);
  } else {
    _v1.normalize();
  }
  let cum = 0;
  for (let j = 1; j < KRONOS_CHAIN_POINTS; j++) {
    const len = j === 1 ? 0.08 : 1.15;
    cum += len;
    chain.segLen[j - 1] = len;
    chain.pos[j].copy(enemy.position).addScaledVector(_v1, -cum);
    chain.submerged[j] = false;
  }
}

// ============================================================================
// Rotura de Estrellas Dorsales y Fase 4
// ============================================================================

/**
 * Aplica la rotura de UNA Estrella Dorsal: apaga visualmente star_core_{n}
 * en orden (star_core_4 primero), enciende ~0.5 s de invulnerabilidad de
 * transición, corta el ataque en curso y avanza de fase. Devuelve true si se
 * rompió. Las PUERTAS anti-skip (Fase 4 invulnerable, transición, 1 por uso)
 * viven en DomeWaveManager.tryBreakKronosStar: único punto de entrada.
 */
export function applyKronosStarBreak(
  enemy: ManagedWaveEnemy,
  internal: EnemyInternal,
  effects: KronosNyxEffects,
): boolean {
  const k = internal.kronos;
  if (k.stars <= 1) {
    // Fase 4: la última estrella solo colapsa con la supernova.
    return false;
  }
  k.stars--;
  k.starInvulnSec = KRONOS_STAR_INVULN_SEC;
  enemy.entity.hp = k.stars; // Cada estrella equivale a 1 punto de vida.
  enemy.entity.weakPointsRemaining = k.stars;
  enemy.hitFlash = Math.min(1.8, 0.8 + enemy.hitFlash);
  enemy.entity.hitFlash = enemy.hitFlash;
  // Apaga/rompe visualmente la estrella: star_core_4 -> 3 -> 2 en orden.
  const rig = internal.kronosRig;
  if (rig && rig.starCoreMeshes[k.stars]) {
    rig.starCoreMeshes[k.stars].visible = false;
  }
  // Transición: corta cualquier ataque en curso (incluida una secuencia de
  // portales a mitad: los segmentos tragados reaparecen al instante).
  k.state = 'roam';
  k.timer = 0;
  k.ringsLeft = 0;
  k.jawTarget01 = 0;
  k.attackCd = KRONOS_STAR_INVULN_SEC;
  k.chain.submerged.fill(false);
  k.portalCd = Math.max(k.portalCd, KRONOS_STAR_INVULN_SEC);
  if (k.stars === 2) {
    k.portalCd = 2.0; // La Fase 3 estrena los portales casi de inmediato.
  } else if (k.stars === 1) {
    enterKronosPhase4(enemy, internal, effects);
  }
  return true;
}

/**
 * FASE 4 — Destrucción: cuerpo al shader 'VOID COSMOS', invulnerable al
 * daño, timer de supervivencia de 60 s y agenda de cosmos_fusion repartida
 * por el ciclo (deformación 15 s, temblor de cámara 20 s, ejes invertidos
 * 5x5 s), sin solapar la Deformación con toda la fase.
 */
export function enterKronosPhase4(
  enemy: ManagedWaveEnemy,
  internal: EnemyInternal,
  effects: KronosNyxEffects,
): void {
  const k = internal.kronos;
  k.phase4 = true;
  k.phase4Timer = KRONOS_PHASE4_TOTAL_SEC;
  effects.phase4 = true;
  enemy.entity.fleshThickness = 100; // Invulnerable: la carne nunca cede.
  // Cuerpo 'VOID COSMOS': la carne nebulosa pasa al universo propio portado
  // desde character-sheet.html (swap en DomeEnemyModels).
  const physics = swapKronosFleshToVoidCosmos(enemy.mesh, internal.animatedMaterials);
  if (physics) {
    internal.material = physics;
  }
  // Agenda de efectos sobre Nyx repartida por los 60 s:
  //  - Temblor de cámara: 4 ráfagas que suman 20 s.
  //  - Deformación: 2 ráfagas que suman 15 s (8 + 7).
  //  - Ejes invertidos: 5 activaciones de 5 s (25 s).
  // Agenda ordenada por marca de tiempo (kind: 0 deformación = 15 s,
  // 1 temblor de cámara = 20 s, 2 ejes invertidos = 5x5 s = 25 s).
  k.agenda = [
    { at: 3.0, on: true, kind: 1 },
    { at: 8.0, on: false, kind: 1 },
    { at: 10.0, on: true, kind: 2 },
    { at: 13.0, on: true, kind: 0 },
    { at: 15.0, on: false, kind: 2 },
    { at: 19.0, on: true, kind: 1 },
    { at: 20.0, on: false, kind: 0 },
    { at: 24.0, on: false, kind: 1 },
    { at: 26.0, on: true, kind: 2 },
    { at: 30.0, on: true, kind: 0 },
    { at: 31.0, on: false, kind: 2 },
    { at: 35.0, on: true, kind: 1 },
    { at: 38.0, on: false, kind: 0 },
    { at: 40.0, on: false, kind: 1 },
    { at: 41.0, on: true, kind: 2 },
    { at: 46.0, on: false, kind: 2 },
    { at: 47.5, on: true, kind: 2 },
    { at: 50.0, on: true, kind: 1 },
    { at: 52.5, on: false, kind: 2 },
    { at: 55.0, on: false, kind: 1 },
    { at: 55.5, on: true, kind: 2 },
    { at: 60.0, on: false, kind: 2 },
  ];
  k.agendaIdx = 0;
}

/**
 * Avanza la Fase 4: el timer de supervivencia de 60 s, la agenda de efectos
 * sobre Nyx (deformación / temblor / ejes invertidos) y la apertura de la
 * supernova al agotarse (la última estrella colapsa).
 */
export function updateKronosPhase4(
  ctx: KronosBehaviorContext,
  enemy: ManagedWaveEnemy,
  internal: EnemyInternal,
  dt: number,
): void {
  const k = internal.kronos;
  const effects = ctx.kronosNyxEffects;
  if (k.state === 'supernova') {
    return;
  }
  k.phase4Timer -= dt;
  if (k.phase4Timer <= 0) {
    // Explosión Final: convulsión segmento a segmento ~1.2 s y supernova.
    k.state = 'supernova';
    k.timer = KRONOS_SUPERNOVA_SEC;
    for (const material of internal.kronosRig?.starCoreMaterials ?? []) {
      material.uniforms.uEmissiveBoost.value = STAR_CORE_EMISSIVE * 2.5;
    }
    effects.cameraShake = 0;
    effects.deformActive = false;
    effects.controlsInverted = false;
    effects.shakePulse = 1.3;
    return;
  }
  // Agenda: enciende/apaga los efectos sobre Nyx en sus marcas.
  const agendaTime = KRONOS_PHASE4_TOTAL_SEC - k.phase4Timer;
  while (k.agendaIdx < k.agenda.length && k.agenda[k.agendaIdx].at <= agendaTime) {
    const ev = k.agenda[k.agendaIdx++];
    if (ev.kind === 0) {
      effects.deformActive = ev.on;
    } else if (ev.kind === 1) {
      effects.cameraShake = ev.on ? 1 : 0;
    } else {
      effects.controlsInverted = ev.on;
    }
  }
}

/** Crea el estado del boss al spawnear (4 estrellas, Fase 1, patrulla). */
export function createKronosBossState(): KronosBossState {
  return {
    chain: new KronosChain(),
    stars: 4,
    starInvulnSec: 0,
    phase4: false,
    phase4Timer: 0,
    state: 'roam',
    timer: 0,
    attackIndex: 0,
    attackCd: 2.0,
    jawOpen01: 0,
    jawTarget01: 0,
    jawRad: KRONOS_RING_TELEGRAPH_JAW_RAD,
    ringsLeft: 0,
    whipSide: 1,
    whipHit: false,
    whipHeadYaw: 0,
    whipCd: 0,
    portalCd: 3.0,
    portal2Opened: false,
    exitDir: new THREE.Vector3(0, 0, 1),
    biteHit: false,
    dodgeCd: 0,
    dodgeSign: 1,
    orbitAngle: Math.random() * Math.PI * 2,
    agenda: [],
    agendaIdx: 0,
  };
}

/**
 * Resetea la ofensiva del boss (paso a modo pasivo del Modo Entrenamiento):
 * vuelve a patrulla, sin ataque en curso ni portales/ringos abiertos.
 */
export function resetKronosOffense(
  ctx: KronosBehaviorContext,
  enemy: ManagedWaveEnemy,
  internal: EnemyInternal,
): void {
  const k = internal.kronos;
  k.state = 'roam';
  k.timer = 0;
  k.ringsLeft = 0;
  k.jawTarget01 = 0;
  k.attackCd = 1.5;
  k.portalCd = 3.0;
  k.chain.submerged.fill(false);
  enemy.entity.mouthOpen = false;
  deactivateKronosPortals(ctx);
}
