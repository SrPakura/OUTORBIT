// ============================================================================
// DOME CRAB BEHAVIOR — IA del Cangrejo Artillero (modo Cúpula)
// ============================================================================
// Comportamiento del cangrejo (rediseño de enemigos_base.md §7.1): la FSM de
// suelos flotantes (agarre, salto parabólico entre slabs, aterrizaje suave y
// deslizamiento por knockback con RNG determinista de oleada) más la FSM de
// combate completa: rayo láser continuo telegrafiado con velocidad angular
// real y fuego amigo (física honesta, cero homing), ráfaga parryable de 3
// proyectiles rectos y protocolo kamikaze con guarda anti-patada y
// detonación rompesuelos. Incluye el guiñeo de vuelo y el aleteo
// procedural de patas para el GLB sin clips.
//
// La FSM de combate recibe un `CrabBehaviorContext` (el propio manager) con
// el pool de proyectiles, el raycast del haz, el hilo/aro telegraphs, etc.
// Scratch de módulo: cero allocations por frame.
// ============================================================================

import * as THREE from 'three';
import { DOME_PLAYER_BOUND_RADIUS, type SlabCollider } from './domeTypes';
import { lookAtQuat } from './domeEnemyOrient';
import type { EnemyInternal, ManagedWaveEnemy } from './DomeWaveManager';

// ============================================================================
// Constantes del Cangrejo Cañón
// ============================================================================

const CRAB_TURN_RATE = 4.0; // Giro del cuerpo sobre el slab (slerp/seg).
const CRAB_TURRET_TURN_RATE = 6.0; // Giro del cañón hacia Nyx (slerp/seg).
const CRAB_TURRET_IDLE_TURN_RATE = 3.0; // Cañón siguiendo a Nyx en reposo (rad/s).
const CANNON_MUZZLE_DISTANCE = 1.4; // Boca del cañón desde el hueso turret.
const CRAB_SLAB_MARGIN = 1.1; // Margen para no salirse del borde del slab.
const CRAB_ATTACH_BLEND_TIME = 0.45; // Aterrizaje suave al cambiar de slab.
// --- Cangrejo Artillero: spawn sobre suelos + salto entre ellos ---
const CRAB_SPAWN_MAX_R = 70.0; // Radio preferido del slab de spawn.
const CRAB_LEAVE_R = 72.0; // El slab flotante sale de la cúpula: saltar.
const CRAB_JUMP_RETARGET_R = 76.0; // Radio del destino que fuerza a re-objetivar en vuelo.
const CRAB_JUMP_R_WEIGHT = 1.2; // Peso del radio de la cúpula al puntuar suelos.
const CRAB_JUMP_DURATION = 0.75; // Duración base del arco del salto (s).
const CRAB_JUMP_DURATION_MAX = 2.4; // Techo de duración en saltos largos (s).
const CRAB_JUMP_H_SPEED = 22.0; // Velocidad horizontal de referencia (m/s).
const CRAB_JUMP_ARC_MIN = 2.5; // Altura mínima del arco (m).
const CRAB_JUMP_ARC_MAX = 9.0; // Altura máxima del arco (m).
const CRAB_GRAB_RANGE = 55.0; // Alcance del salto de agarre desde el aire (m).
const CRAB_SKID_DAMPING = 6.0; // Fricción del deslizamiento por knockback (1/s).
const CRAB_AIR_DAMPING = 3.0; // Fricción del desvío por knockback en vuelo (1/s).
const CRAB_LEG_WAVE_SPEED = 14.0; // Velocidad del aleteo de patas en vuelo.
const CRAB_FLIGHT_WOBBLE = 0.12; // Guiñeo ligero del cuerpo en vuelo (rad).
const CRAB_FLIGHT_WOBBLE_SPEED = 2.7; // Frecuencia del guiñeo de vuelo (rad/s).

// ============================================================================
// Cangrejo Artillero — FSM de combate del rediseño (enemigos_base.md §7.1)
// "IA perfecta (física honesta, cero homing) vs jugador frenético".
// ============================================================================

/** Estado de la máquina de ataques del cangrejo. */
export type CrabAttackState = 'idle' | 'laser_aim' | 'laser_fire' | 'burst' | 'kamikaze_prime';

// --- Ataque 1: Rayo Láser Continuo (Nyx NO está en el suelo del cangrejo) ---
export const CRAB_LASER_DPS = 20.0; // 20*dt continuos a Nyx y a cualquier enemigo.
// Tope de enganche del láser: más allá, el cangrejo ni se molesta (no es un
// rayo infinito, pero cubre toda la cúpula útil).
const CRAB_LASER_MAX_DIST = 50.0;
const CRAB_LASER_AIM_SEC = 2.0; // Telegraph completo.
const CRAB_LASER_AIM_TRACK_SEC = 1.65; // Primeros 1.65 s persigue; luego sella.
const CRAB_LASER_AIM_TURN_RATE = 1.8; // Velocidad angular máx. de rastreo (rad/s).
const CRAB_LASER_LEAD_SEC = 0.25; // Predicción ligera durante el rastreo.
const CRAB_LASER_FIRE_SEC = 2.0; // Haz grueso continuo.
const CRAB_LASER_FIRE_TURN_RATE = 0.45; // Barrido con inercia (rad/s).
const CRAB_LASER_COOLDOWN = 6.0; // Escalable con speedMult.
const CRAB_LASER_AIM_BLINK_HZ = 14.0; // Parpadeo blanco/rojo del sellado final.
const CRAB_LASER_HIT_RADIUS = 1.7; // Cuerpo de Nyx contra el haz (m).
export const CRAB_LASER_BEAM_FF_MARGIN = 0.45; // Margen del haz contra enemigos (m).

// --- Ataque 2: Ráfaga Láser (Nyx ESTÁ en el suelo del cangrejo) ---
// Banda táctica legible: da igual a qué distancia pise la plataforma; si
// comparte suelo con el cangrejo, la defensa perimetral entra en acción.
const CRAB_BURST_TELEGRAPH_SEC = 0.25; // Chispazo en las 3 pinzas del cañón.
const CRAB_BURST_SHOT_INTERVAL = 0.10; // Separación entre los 3 disparos (s).
const CRAB_BURST_TOTAL_SEC = CRAB_BURST_TELEGRAPH_SEC + 2 * CRAB_BURST_SHOT_INTERVAL;
const CRAB_BURST_SHOT_SPEED = 36.0; // Proyectiles rectos, sin homing en vuelo.
const CRAB_BURST_SHOT_DAMAGE = 2; // 2 HP por disparo (6 HP máx.), parryables.
const CRAB_BURST_COOLDOWN = 3.0;

// --- Ataque 3: Protocolo Kamikaze (dist <= 5 m) ---
export const CRAB_KAMIKAZE_RADIUS = 10.0; // Radio de la detonación (m).
const CRAB_KAMIKAZE_TRIGGER_DIST = 5.0;
const CRAB_KAMIKAZE_ARM_SEC = 0.25; // Tiempo dentro de 5 m para cebarse.
const CRAB_KAMIKAZE_PRIME_SEC = 1.1; // Cebado: punto de no retorno.
const CRAB_KAMIKAZE_RUN_SPEED = 6.5; // Carrera por su slab persiguiendo a Nyx.
export const CRAB_KAMIKAZE_SWELL = 0.35; // Hinchado del cuerpo (mesh.scale).
const CRAB_POST_KICK_GRACE = 0.75; // Guardia anti-patada tras impacto melee.
const CRAB_KAMIKAZE_RETRY_SEC = 0.15; // Reintento cuando la guardia bloquea.

// Duraciones de los clips one-shot del cangrejo (re-explosión del flinch/land).
export const CRAB_HIT_CLIP_SEC = 0.2;
export const CRAB_JUMP_LAND_CLIP_SEC = 0.35;


// ============================================================================
// Tipos, helpers de slab y scratch
// ============================================================================
/** Salto parabólico del cangrejo entre suelos (estado en vuelo). */
export interface CrabJump {
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

/** Punto mundial sobre la cara superior (+Y local) del slab para un offset local. */
export function slabTopPoint(slab: SlabCollider, local: THREE.Vector2, out: THREE.Vector3): THREE.Vector3 {
  _localOffset.set(local.x, slab.halfExtents.y, local.y).applyQuaternion(slab.quaternion);
  return out.copy(slab.center).add(_localOffset);
}

/**
 * Offset local (lx, lz) aleatorio dentro de la zona pisable del slab: el
 * polígono real de la tapa superior si es un suelo flotante arrancado
 * (colisión exacta: nunca flota en el aire junto al borde visible), el
 * rectángulo OBB con margen, o un punto baricéntrico del triángulo 2D si el
 * slab es un triángulo de la esfera (Miniboss/Boss).
 */
export function pickSlabLocalPoint(slab: SlabCollider, rng: () => number, out: THREE.Vector2): void {
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
  const contour = slab.exactMesh?.capContour;
  if (contour) {
    // Muestreo por abanico de triángulos (centro, v[i], v[i+1]) ponderado por
    // área: el punto cae siempre DENTRO del polígono visible de la tapa.
    const n = contour.length / 2;
    let totalArea = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      totalArea +=
        Math.abs(contour[i * 2] * contour[j * 2 + 1] - contour[j * 2] * contour[i * 2 + 1]) * 0.5;
    }
    let pick = rng() * totalArea;
    let bi = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const area =
        Math.abs(contour[i * 2] * contour[j * 2 + 1] - contour[j * 2] * contour[i * 2 + 1]) * 0.5;
      if (pick <= area) {
        bi = i;
        break;
      }
      pick -= area;
    }
    const bj = (bi + 1) % n;
    let u = rng();
    let v = rng();
    if (u + v > 1) {
      u = 1 - u;
      v = 1 - v;
    }
    const px = u * contour[bi * 2] + v * contour[bj * 2];
    const pz = u * contour[bi * 2 + 1] + v * contour[bj * 2 + 1];
    // Contraído hacia el centroide para respetar el margen del borde.
    const cx = contourCentroidX(contour);
    const cz = contourCentroidZ(contour);
    const s = slab.mesh.scale.x || 1;
    const margin = CRAB_SLAB_MARGIN / s;
    out.set(
      (cx + (px - cx) * contourContraction(cx, cz, px, pz, margin)) * s,
      (cz + (pz - cz) * contourContraction(cx, cz, px, pz, margin)) * s,
    );
    return;
  }
  const mx = Math.max(0, slab.halfExtents.x - CRAB_SLAB_MARGIN);
  const mz = Math.max(0, slab.halfExtents.z - CRAB_SLAB_MARGIN);
  out.set((rng() * 2 - 1) * mx, (rng() * 2 - 1) * mz);
}

/** Centroide X de los vértices del polígono de la tapa. */
function contourCentroidX(contour: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < contour.length; i += 2) sum += contour[i];
  return sum / (contour.length / 2);
}

/** Centroide Z de los vértices del polígono de la tapa. */
function contourCentroidZ(contour: Float32Array): number {
  let sum = 0;
  for (let i = 1; i < contour.length; i += 2) sum += contour[i];
  return sum / (contour.length / 2);
}

/**
 * Factor de contracción hacia el centroide que deja el punto a `margin`
 * (unidades locales sin escala) del borde a lo largo de su propio rayo.
 */
function contourContraction(cx: number, cz: number, px: number, pz: number, margin: number): number {
  const dx = px - cx;
  const dz = pz - cz;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-4) return 0;
  return Math.max(0.1, 1 - margin / dist);
}

/** ¿Está (x, z) dentro del polígono de la tapa? (test par-impar) */
function pointInContour(contour: Float32Array, x: number, z: number): boolean {
  let inside = false;
  const n = contour.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = contour[i * 2];
    const zi = contour[i * 2 + 1];
    const xj = contour[j * 2];
    const zj = contour[j * 2 + 1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Fija el offset local dentro de los bordes del slab (el knockback desliza).
 * En suelos flotantes arrancados: dentro del polígono visible de la tapa,
 * contraído al borde más cercano si el deslizamiento salió de la tapa.
 */
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
  const contour = slab.exactMesh?.capContour;
  if (contour) {
    const s = slab.mesh.scale.x || 1;
    const ux = local.x / s;
    const uz = local.y / s;
    if (pointInContour(contour, ux, uz)) return;
    // Fuera de la tapa visible: al punto más cercano del borde del polígono,
    // contraído hacia el centroide para conservar el margen del cangrejo.
    const n = contour.length / 2;
    let bestD2 = Infinity;
    let bx = 0;
    let bz = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = contour[i * 2];
      const az = contour[i * 2 + 1];
      const bxx = contour[j * 2];
      const bzz = contour[j * 2 + 1];
      const ex = bxx - ax;
      const ez = bzz - az;
      const lenSq = ex * ex + ez * ez;
      const t = lenSq > 1e-9 ? Math.min(1, Math.max(0, ((ux - ax) * ex + (uz - az) * ez) / lenSq)) : 0;
      const qx = ax + ex * t;
      const qz = az + ez * t;
      const dx = ux - qx;
      const dz = uz - qz;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) {
        bestD2 = d2;
        bx = qx;
        bz = qz;
      }
    }
    const cx = contourCentroidX(contour);
    const cz = contourCentroidZ(contour);
    const k = contourContraction(cx, cz, bx, bz, CRAB_SLAB_MARGIN / s);
    local.set((cx + (bx - cx) * k) * s, (cz + (bz - cz) * k) * s);
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
export function pickCrabSpawnSlab(activeSlabs: SlabCollider[], rng: () => number): SlabCollider | null {
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
 * Destino del salto del cangrejo: el slab disponible con mejor puntuación
 * `distanciaAlCangrejo + peso·radioDeLaCúpula`. Penalizar el radio evita el
 * suicidio por la esfera: los suelos interiores acaban de entrar y les queda
 * todo el cruce por delante, mientras que los exteriores están a punto de
 * salirse de la cúpula (y matar al cangrejo al aterrizar). Excluye el slab
 * que está abandonando.
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
    const score = fromPos.distanceTo(slab.center) + CRAB_JUMP_R_WEIGHT * slab.center.length();
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

// Vectores scratch de módulo (cero allocations por frame).
const _up = new THREE.Vector3(0, 1, 0);
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
// Scratch de la FSM de combate (cero allocations por frame).
const _leadPos = new THREE.Vector3();
const _turretDir = new THREE.Vector3();
const _aimTarget = new THREE.Vector3();
const _segClosest = new THREE.Vector3();
const _segPoint = new THREE.Vector3();
const _ringUp = new THREE.Vector3();

// ============================================================================
// Contexto compartido con el DomeWaveManager
// ============================================================================

export interface CrabBehaviorContext {
  /** Flotación con muelle hacia homePos (vive en el manager). */
  applyFloatMovement(
    enemy: ManagedWaveEnemy,
    internal: EnemyInternal,
    dt: number,
    elapsed: number,
  ): void;
  /** Multiplicador de velocidad de la oleada (escalado de cooldowns). */
  readonly speedMult: number;
  /** Proyectil del pool hacia Nyx o con dirección sellada (sin homing). */
  fireProjectile(
    enemy: ManagedWaveEnemy,
    playerPos: THREE.Vector3,
    kind: 'dark' | 'ink' | 'laser',
    damage: number,
    speed: number,
    spreadRad?: number,
    origin?: THREE.Vector3,
    dirOverride?: THREE.Vector3,
  ): void;
  /**
   * Distancia mundo del haz láser desde `origin` por `dir`: hasta chocar con
   * un slab o cruzar la esfera de la Barrera Blanca (clamp a `maxDist`).
   */
  raycastCrabLaser(
    activeSlabs: SlabCollider[] | undefined,
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    maxDist: number,
  ): number;
  /** Hilo fino de puntería (fire=false) o haz grueso (fire=true) del láser. */
  showCrabLaser(
    enemyId: string,
    fire: boolean,
    from: THREE.Vector3,
    dir: THREE.Vector3,
    dist: number,
    blinkWhite: boolean,
  ): void;
  /** Oculta el hilo/haz del cangrejo (fin del ataque o muerte). */
  hideCrabLaser(enemyId: string): void;
  /** Aro de peligro proyectado sobre la tapa del slab durante el cebado. */
  showCrabDangerRing(
    enemyId: string,
    pos: THREE.Vector3,
    up: THREE.Vector3,
    radius: number,
    pulse: number,
  ): void;
  hideCrabDangerRing(enemyId: string): void;
  /** Fuego amigo: CRAB_LASER_DPS*dt a todo enemigo vivo que cruce el haz. */
  applyCrabLaserFF(
    ownerId: string,
    from: THREE.Vector3,
    dir: THREE.Vector3,
    dist: number,
    dt: number,
  ): void;
  /** Detonación kamikaze: anillos a Nyx, fuego amigo y slab roto. */
  detonateCrabKamikaze(
    enemy: ManagedWaveEnemy,
    internal: EnemyInternal,
    playerPos: THREE.Vector3,
    activeSlabs: SlabCollider[] | undefined,
    onGolemSmash?: (damage: number, pushDir: THREE.Vector3, pushSpeed?: number) => void,
    onSlabSmash?: (slab: SlabCollider) => void,
  ): void;
}

export function updateCrabEnemy(
  ctx: CrabBehaviorContext,
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
    startCrabJump(enemy, internal, activeSlabs, internal.attachedSlabId);
  }

  if (internal.jump) {
    updateCrabJump(enemy, internal, dt, activeSlabs);
    if (!internal.mixer) {
      flapCrabLegs(enemy, internal, elapsed);
    }
    return;
  }

  if (internal.attachedSlabId && slab) {
    updateCrabOnSlab(ctx, enemy, internal, slab, dt, playerPos);
    return;
  }

  // Sin slab: flotación suave + guiñeo de vuelo + agarre de suelos cercanos.
  ctx.applyFloatMovement(enemy, internal, dt, elapsed);
  orientCrabInFlight(enemy, dt, elapsed, playerPos);
  // Con clips embebidos el aleteo de patas lo anima el GLB (crab_jump_*).
  if (!internal.mixer) {
    flapCrabLegs(enemy, internal, elapsed);
  }
  if (activeSlabs && activeSlabs.length > 0) {
    const target = pickCrabJumpSlab(activeSlabs, null, enemy.position);
    if (target && enemy.position.distanceTo(target.center) <= CRAB_GRAB_RANGE) {
      startCrabJump(enemy, internal, activeSlabs, null);
    }
  }
}

/**
 * Arranca el salto parabólico hacia el mejor slab disponible (center < 68 m
 * o el más cercano al centro). Sin destino, el cangrejo pasa a flotación
 * suave anclada donde está.
 */
function startCrabJump(
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
  // RNG determinista de la oleada (coordinación §7.1: sin Math.random).
  pickSlabLocalPoint(target, internal.rng ?? Math.random, targetLocal);
  slabTopPoint(target, targetLocal, _targetPos);
  _slabUp.set(0, 1, 0).applyQuaternion(target.quaternion);
  _targetPos.addScaledVector(_slabUp, internal.standHeight);
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
function updateCrabJump(
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
    const next = startCrabJump(enemy, internal, activeSlabs, jump.targetSlabId);
    if (next) {
      next.offset.add(jump.offset);
    }
    return;
  }
  if (targetSlab.center.length() > CRAB_JUMP_RETARGET_R && activeSlabs) {
    // El destino marcha hacia la salida de la cúpula: si hay otro
    // visiblemente mejor, re-objetiva en pleno vuelo (solo si es claramente
    // mejor, para no oscilar entre dos suelos igual de malos).
    const better = pickCrabJumpSlab(activeSlabs, jump.targetSlabId, enemy.position);
    if (better && better.center.length() < targetSlab.center.length() - 4.0) {
      const next = startCrabJump(enemy, internal, activeSlabs, jump.targetSlabId);
      if (next) {
        next.offset.add(jump.offset);
      }
      return;
    }
  }

  jump.time += dt;
  const t = Math.min(1, jump.time / jump.duration);

  // Aterrizaje sobre la cara superior del slab destino (sigue su bob).
  slabTopPoint(targetSlab, jump.targetLocal, _targetPos);
  _slabUp.set(0, 1, 0).applyQuaternion(targetSlab.quaternion);
  _targetPos.addScaledVector(_slabUp, internal.standHeight);

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
    // El clip crab_jump_land (one-shot 0.35 s) arranca en el impacto exacto.
    internal.crabLandTimer = CRAB_JUMP_LAND_CLIP_SEC;
  }
}

/** Cangrejo pegado a su slab: anclaje, deslizamiento por knockback y apuntado. */
function updateCrabOnSlab(
  ctx: CrabBehaviorContext,
  enemy: ManagedWaveEnemy,
  internal: EnemyInternal,
  slab: SlabCollider,
  dt: number,
  playerPos: THREE.Vector3,
): void {
  // Protocolo Kamikaze: corre por su slab persiguiendo a Nyx hasta el borde.
  if (internal.crabState === 'kamikaze_prime') {
    _slabUp.set(0, 1, 0).applyQuaternion(slab.quaternion);
    _aimDir.subVectors(playerPos, enemy.position);
    _aimDir.addScaledVector(_slabUp, -_aimDir.dot(_slabUp));
    if (_aimDir.lengthSq() > 1e-4) {
      _aimDir.normalize();
      const speed = CRAB_KAMIKAZE_RUN_SPEED * ctx.speedMult;
      _localOffset.copy(_aimDir).applyQuaternion(slab.invQuaternion);
      internal.slabLocalOffset.x += _localOffset.x * speed * dt;
      internal.slabLocalOffset.y += _localOffset.z * speed * dt;
    }
  }

  // El knockback desliza el offset local, fijado dentro de los bordes.
  if (enemy.velocity.lengthSq() > 1e-6) {
    _localOffset.copy(enemy.velocity).applyQuaternion(slab.invQuaternion);
    internal.slabLocalOffset.x += _localOffset.x * dt;
    internal.slabLocalOffset.y += _localOffset.z * dt;
    clampSlabLocalPoint(slab, internal.slabLocalOffset);
    enemy.velocity.multiplyScalar(Math.exp(-CRAB_SKID_DAMPING * dt));
  } else if (internal.crabState === 'kamikaze_prime') {
    clampSlabLocalPoint(slab, internal.slabLocalOffset);
  }

  // Anclaje a la cara superior (+Y local) del slab: el origen sube la altura
  // de apoyo medida sobre el modelo ya skinneado, así las almohadillas de las
  // 5 patas tocan la tapa sin flotar ni hundirse.
  slabTopPoint(slab, internal.slabLocalOffset, _targetPos);
  _slabUp.set(0, 1, 0).applyQuaternion(slab.quaternion);
  _targetPos.addScaledVector(_slabUp, internal.standHeight);
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

  // Torreta de área: en reposo el cañón persigue a Nyx a 3 rad/s (IA que
  // apunta SIEMPRE). Los clips de idle viven en las patas/root; el scan del
  // clip sobre `turret` queda pisado por este apuntado continuo. En los
  // estados de ataque lo gobierna la FSM con sus propios límites angulares.
  if (internal.crabState === 'idle') {
    aimCrabTurretLimited(internal, playerPos, CRAB_TURRET_IDLE_TURN_RATE, dt);
  }
}

/** Boca del cañón en espacio mundo (hueso `turret` o mesh `detail_cannon`). */
export function computeCrabMuzzle(internal: EnemyInternal, out: THREE.Vector3): boolean {
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

/** Cangrejo en el aire sin slab: encara a Nyx con un guiñeo ligero. */
function orientCrabInFlight(
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
function flapCrabLegs(enemy: ManagedWaveEnemy, internal: EnemyInternal, elapsed: number): void {
  for (let i = 0; i < internal.legs.length; i++) {
    const leg = internal.legs[i];
    _legWaveQuat.setFromAxisAngle(
      _legWaveAxis,
      Math.sin(elapsed * CRAB_LEG_WAVE_SPEED + enemy.phase + i * 0.8) * leg.amplitude,
    );
    leg.bone.quaternion.copy(leg.rest).multiply(_legWaveQuat);
  }
}

// ============================================================================
// FSM de combate del Cangrejo Artillero (rediseño §7.1)
// ============================================================================

/** Alcance del haz: la esfera de la Barrera Blanca la corta, no el vacío. */
const CRAB_LASER_RANGE = DOME_PLAYER_BOUND_RADIUS;
const CRAB_BURST_SHOTS = 3;

/**
 * Devuelve el cangrejo a reposo y apaga sus visuales de ataque. Sirve tanto al
 * cancelar por salto como al reset ofensivo del Modo Entrenamiento.
 */
export function resetCrabAttack(ctx: CrabBehaviorContext, enemy: ManagedWaveEnemy, internal: EnemyInternal): void {
  ctx.hideCrabLaser(enemy.id);
  ctx.hideCrabDangerRing(enemy.id);
  internal.crabState = 'idle';
  internal.crabTimer = 0;
  internal.crabBurstShotsLeft = 0;
  internal.crabSwell = 0;
  enemy.attackTimer = Math.max(enemy.attackTimer, 0.85);
}

/** Dirección de disparo actual del cañón en espacio mundo. */
function crabTurretWorldDir(internal: EnemyInternal, out: THREE.Vector3): boolean {
  const node = internal.turretNode;
  if (!node) {
    return false;
  }
  node.updateWorldMatrix(true, false);
  node.getWorldQuaternion(_turretWorldQuat);
  out.copy(internal.turretForward).applyQuaternion(_turretWorldQuat);
  return true;
}

/**
 * Gira el hueso `turret` hacia `targetPos` con velocidad angular máxima
 * real `maxRadPerSec` (física honesta: sin slerp exponencial engañoso). El
 * código rota el hueso por encima del AnimationMixer si hubiera clips.
 * Devuelve el ángulo restante (rad) cuando ya está alineado (~0).
 */
function aimCrabTurretLimited(
  internal: EnemyInternal,
  targetPos: THREE.Vector3,
  maxRadPerSec: number,
  dt: number,
): number {
  const node = internal.turretNode;
  if (!node) {
    return 0;
  }
  node.updateWorldMatrix(true, false);
  node.getWorldPosition(_muzzlePos);
  _lookDir.subVectors(targetPos, _muzzlePos);
  if (_lookDir.lengthSq() < 1e-6) {
    return 0;
  }
  _lookDir.normalize();
  crabTurretWorldDir(internal, _turretDir);
  const angle = Math.acos(THREE.MathUtils.clamp(_turretDir.dot(_lookDir), -1, 1));
  if (angle < 1e-4) {
    return 0;
  }
  // Orientación mundial deseada -> espacio local del hueso.
  _targetQuat.setFromUnitVectors(internal.turretForward, _lookDir);
  const parent = node.parent;
  if (parent) {
    parent.getWorldQuaternion(_invQuat).invert();
    _targetQuat.premultiply(_invQuat);
  }
  node.quaternion.slerp(_targetQuat, Math.min(1, (maxRadPerSec * dt) / angle));
  return angle;
}

/**
 * Distancia² mínima de `point` al segmento `a -> a + unit*len` (raycast de
 * contacto del haz láser contra Nyx y contra otros enemigos). Reutilizable
 * por el manager para el fuego amigo del rayo.
 */
export function crabLaserContactDistanceSq(
  point: THREE.Vector3,
  a: THREE.Vector3,
  unit: THREE.Vector3,
  len: number,
): number {
  _segPoint.subVectors(point, a);
  const t = THREE.MathUtils.clamp(_segPoint.dot(unit), 0, len);
  _segClosest.copy(a).addScaledVector(unit, t);
  return _segClosest.distanceToSquared(point);
}

/** Hilo rojo fino del telegraph: la línea exacta por donde saldrá el rayo. */
function showCrabAimLine(
  ctx: CrabBehaviorContext,
  internal: EnemyInternal,
  enemyId: string,
  activeSlabs: SlabCollider[] | undefined,
  sealed: boolean,
): void {
  if (!computeCrabMuzzle(internal, _muzzlePos) || !crabTurretWorldDir(internal, _turretDir)) {
    return;
  }
  const dist = ctx.raycastCrabLaser(activeSlabs, _muzzlePos, _turretDir, CRAB_LASER_RANGE);
  // Últimos 0.35 s: el hilo sellado parpadea blanco/rojo a 14 Hz.
  const blinkWhite = sealed && Math.floor(internal.crabTimer * CRAB_LASER_AIM_BLINK_HZ) % 2 === 0;
  ctx.showCrabLaser(enemyId, false, _muzzlePos, _turretDir, dist, blinkWhite);
}

/**
 * Máquina de estados de los 3 ataques del Cangrejo Artillero:
 *  1. Rayo Láser Continuo (dist > 7 m): telegraph de 2.0 s con rastreo a
 *     1.8 rad/s (lead 0.25 s) que se sella los últimos 0.35 s, haz grueso de
 *     2.0 s que barre con inercia (0.45 rad/s) y daña todo lo que cruza.
 *  2. Ráfaga Láser (Nyx en la MISMA plataforma del cangrejo): 3 proyectiles
 *     rectos de 36 m/s sin homing (parryables), intervalo 0.10 s, la torreta
 *     rota a 6 rad/s, sin importar la distancia dentro del suelo.
 *  3. Protocolo Kamikaze (dist <= 5 m): guarda anti-patada 0.75 s + acumular
 *     0.25 s de proximidad; cebado de 1.1 s punto de no retorno corriendo
 *     por su slab a 6.5 m/s y detonación de radio 10 m.
 */
export function updateCrabAttack(
  ctx: CrabBehaviorContext,
  enemy: ManagedWaveEnemy,
  internal: EnemyInternal,
  dt: number,
  playerPos: THREE.Vector3,
  playerVel: THREE.Vector3,
  playerKickAnim: boolean,
  playerSlab: SlabCollider | null,
  activeSlabs: SlabCollider[] | undefined,
  onPlayerHit: (damage: number) => void,
  onGolemSmash?: (damage: number, pushDir: THREE.Vector3, pushSpeed?: number) => void,
  onSlabSmash?: (slab: SlabCollider) => void,
): void {
  // Guardia anti-patada (0.75 s tras impacto melee) y clip de aterrizaje.
  if (internal.crabPostKickGrace > 0) {
    internal.crabPostKickGrace = Math.max(0, internal.crabPostKickGrace - dt);
  }
  if (internal.crabLandTimer > 0) {
    internal.crabLandTimer = Math.max(0, internal.crabLandTimer - dt);
  }

  // En pleno salto entre suelos el ataque es imposible: cancela y aguanta.
  if (internal.jump) {
    if (internal.crabState !== 'idle') {
      resetCrabAttack(ctx, enemy, internal);
    }
    enemy.attackTimer = Math.max(enemy.attackTimer, 0.35);
    return;
  }

  switch (internal.crabState) {
    case 'laser_aim': {
      internal.crabTimer += dt;
      // primeros 1.65 s: rastreo honesto con lead ligero; luego congelado.
      if (internal.crabTimer <= CRAB_LASER_AIM_TRACK_SEC) {
        _leadPos.copy(playerPos).addScaledVector(playerVel, CRAB_LASER_LEAD_SEC);
        aimCrabTurretLimited(internal, _leadPos, CRAB_LASER_AIM_TURN_RATE, dt);
      }
      showCrabAimLine(ctx, internal, enemy.id, activeSlabs, internal.crabTimer > CRAB_LASER_AIM_TRACK_SEC);
      if (internal.crabTimer >= CRAB_LASER_AIM_SEC) {
        internal.crabState = 'laser_fire';
        internal.crabTimer = 0;
      }
      return;
    }

    case 'laser_fire': {
      internal.crabTimer += dt;
      // Barrido con inercia: la manguera a alta presión sigue muy despacio,
      // para que Nyx pueda arrastrar el rayo contra otros enemigos.
      aimCrabTurretLimited(internal, playerPos, CRAB_LASER_FIRE_TURN_RATE, dt);
      if (computeCrabMuzzle(internal, _muzzlePos) && crabTurretWorldDir(internal, _muzzleDir)) {
        const dist = ctx.raycastCrabLaser(activeSlabs, _muzzlePos, _muzzleDir, CRAB_LASER_RANGE);
        ctx.showCrabLaser(enemy.id, true, _muzzlePos, _muzzleDir, dist, false);
        // 20*dt continuos mientras el cuerpo de Nyx cruce el haz...
        if (
          crabLaserContactDistanceSq(playerPos, _muzzlePos, _muzzleDir, dist) <=
          CRAB_LASER_HIT_RADIUS * CRAB_LASER_HIT_RADIUS
        ) {
          onPlayerHit(CRAB_LASER_DPS * dt);
        }
        // ...y fuego amigo a CUALQUIER otro enemigo del trayecto.
        ctx.applyCrabLaserFF(enemy.id, _muzzlePos, _muzzleDir, dist, dt);
      }
      if (internal.crabTimer >= CRAB_LASER_FIRE_SEC) {
        ctx.hideCrabLaser(enemy.id);
        internal.crabState = 'idle';
        internal.crabTimer = 0;
        enemy.attackTimer = CRAB_LASER_COOLDOWN / ctx.speedMult;
      }
      return;
    }

    case 'burst': {
      internal.crabTimer += dt;
      // La torreta rota rápido (6 rad/s) entre tiro y tiro.
      aimCrabTurretLimited(internal, playerPos, CRAB_TURRET_TURN_RATE, dt);
      const shotsFired = CRAB_BURST_SHOTS - internal.crabBurstShotsLeft;
      const nextShotAt = CRAB_BURST_TELEGRAPH_SEC + shotsFired * CRAB_BURST_SHOT_INTERVAL;
      if (internal.crabBurstShotsLeft > 0 && internal.crabTimer >= nextShotAt) {
        internal.crabBurstShotsLeft--;
        if (computeCrabMuzzle(internal, _muzzlePos) && crabTurretWorldDir(internal, _muzzleDir)) {
          // Proyectil recto según la orientación ACTUAL: cero homing vuelo.
          ctx.fireProjectile(
            enemy,
            playerPos,
            'laser',
            CRAB_BURST_SHOT_DAMAGE,
            CRAB_BURST_SHOT_SPEED,
            0,
            _muzzlePos,
            _muzzleDir,
          );
        }
      }
      if (internal.crabTimer >= CRAB_BURST_TOTAL_SEC) {
        internal.crabState = 'idle';
        internal.crabTimer = 0;
        enemy.attackTimer = CRAB_BURST_COOLDOWN / ctx.speedMult;
      }
      return;
    }

    case 'kamikaze_prime': {
      internal.crabTimer += dt;
      const t01 = Math.min(1, internal.crabTimer / CRAB_KAMIKAZE_PRIME_SEC);
      // Aro de peligro sobre la tapa del slab, pulsando cada vez más rápido.
      const slab =
        activeSlabs && internal.attachedSlabId
          ? findSlabById(activeSlabs, internal.attachedSlabId)
          : null;
      _ringUp.set(0, 1, 0);
      if (slab) {
        _ringUp.applyQuaternion(slab.quaternion);
        _targetPos.copy(enemy.position).addScaledVector(_ringUp, -(internal.standHeight - 0.12));
      } else {
        _targetPos.copy(enemy.position).addScaledVector(_ringUp, -0.4);
      }
      const pulse = 0.5 + 0.5 * Math.sin(internal.crabTimer * (16 + 44 * t01));
      ctx.showCrabDangerRing(enemy.id, _targetPos, _ringUp, CRAB_KAMIKAZE_RADIUS, pulse);
      // El cuerpo se hincha por pulsos (mesh.scale lo compone el manager).
      internal.crabSwell = CRAB_KAMIKAZE_SWELL * t01 * (0.85 + 0.15 * Math.sin(internal.crabTimer * 26));
      if (internal.crabTimer >= CRAB_KAMIKAZE_PRIME_SEC) {
        ctx.hideCrabDangerRing(enemy.id);
        internal.crabSwell = 0;
        // Punto de no retorno: detona aunque Nyx haya huido.
        ctx.detonateCrabKamikaze(enemy, internal, playerPos, activeSlabs, onGolemSmash, onSlabSmash);
      }
      return;
    }

    case 'idle':
    default: {
      // Acumula proximidad para el kamikaze (anti "rozar en dash a 30 m/s").
      const dist = enemy.position.distanceTo(playerPos);
      if (dist <= CRAB_KAMIKAZE_TRIGGER_DIST) {
        internal.crabProxTimer += dt;
      } else {
        internal.crabProxTimer = Math.max(0, internal.crabProxTimer - dt * 4);
      }
      if (enemy.attackTimer > 0) {
        return;
      }
      // ¿Nyx pisa el MISMO suelo que el cangrejo? (anclada a su slab, no
      // flotando por encima: a 3 m del suelo ya cuenta como "no está en él").
      const sameFloor =
        !!playerSlab && !!internal.attachedSlabId && playerSlab.id === internal.attachedSlabId;
      if (dist <= CRAB_KAMIKAZE_TRIGGER_DIST) {
        // Guardia anti-patada: nada de kamikaze tras un impacto melee de Nyx
        // ni mientras ella siga en rebote/animación de patada.
        const kickLock = internal.crabPostKickGrace > 0 || playerKickAnim;
        if (!kickLock && internal.crabProxTimer >= CRAB_KAMIKAZE_ARM_SEC) {
          internal.crabState = 'kamikaze_prime';
          internal.crabTimer = 0;
        } else {
          enemy.attackTimer = CRAB_KAMIKAZE_RETRY_SEC;
        }
      } else if (sameFloor) {
        // Misma plataforma (a cualquier distancia): defensa perimetral.
        if (internal.turretNode) {
          internal.crabState = 'burst';
          internal.crabTimer = 0;
          internal.crabBurstShotsLeft = CRAB_BURST_SHOTS;
        } else {
          enemy.attackTimer = 1.0;
        }
      } else if (dist <= CRAB_LASER_MAX_DIST) {
        // Distinta plataforma o volando (aunque sea a 3 m de su suelo):
        // rayo de control de espacio de largo alcance.
        if (internal.turretNode) {
          internal.crabState = 'laser_aim';
          internal.crabTimer = 0;
        } else {
          enemy.attackTimer = 1.0;
        }
      }
      // Más allá de 50 m de otra plataforma: fuera del alcance, no ataca.
      return;
    }
  }
}
