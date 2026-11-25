// ============================================================================
// DOME GOLEM BEHAVIOR — IA del Gólem Rompesuelos (modo Cúpula)
// ============================================================================
// Rediseño de enemigos_base.md §7.4 bajo la premisa "IA perfecta (física
// honesta, cero homing/teletransportes) vs jugador frenético":
//
//  - HELICÓPTERO: la falda estrellada (`root`) es un rotor que sostiene sus
//    300 kg; persigue a Nyx con aceleración pesada (ya no flota anclado a
//    `homePos`) y presiona sin parar mientras gasta energía.
//  - FATIGA: pool de stamina que se agota persiguiendo y encadenando
//    ataques; a cero pasa a EXHAUSTO (rotor parado: avanza a 3 m/s y gira a
//    10°/s — ventana real de castigo) y la recarga completa dentro.
//  - DOS CARGAS EN ESPIRAL: dirección SELLADA al arrancar, línea recta
//    honesta (sin homing en vuelo). `thin` = broca rápida; `thick` = ariete
//    rompesuelos (30 % más lenta) que rompe los slabs que roza.
//  - PUÑETAZO BRUTO: windup torpe y exagerado; el punto de impacto se sella
//    al TERMINAR el windup (sin re-lock durante el golpe) y la inercia
//    posterior le cuesta frenar. El golpe no es interrumpible.
//  - BLOQUEO: pared maciza frontal con el brazo gigante; los impactos
//    frontales se bloquean (0 daño) y obligan a flanquear, provocar el
//    ataque (se suelta si Nyx entra < 8 m) o rematar desde arriba.
//  - REMATE EN CABEZA: un taladro descendente de Nyx (hitDir.y <= -0.45)
//    aplasta `head`, escalda y abre la ventana vulnerable de penetración.
//
// Como el cangrejo: el contexto es el propio `DomeWaveManager`. Scratch de
// módulo: cero allocations por frame.
// ============================================================================

import * as THREE from 'three';
import { DOME_PLAYER_BOUND_RADIUS, type SlabCollider } from './domeTypes';
import { resolveSphereSlabCollision, type SlabContact } from './DomeSlabs';
import { lookAtQuat } from './domeEnemyOrient';
import type { EnemyInternal, ManagedWaveEnemy } from './DomeWaveManager';

// ============================================================================
// Constantes del Gólem Rompesuelos (rediseño §7.4)
// ============================================================================

/** Giro del cuerpo en helicóptero hacia Nyx (slerp exponencial/s). */
export const GOLEM_TURN_RATE = 1.8;
/** Giro honesto del gólem exhausto: 10°/s exactos (rad/s reales). */
export const GOLEM_EXHAUSTED_TURN_RATE = 10.0 * (Math.PI / 180);

// --- Economía de energía/fatiga ---
export const GOLEM_STAMINA_MAX = 100.0;
/** Persecución en helicóptero: -5 stamina/s mientras presiona. */
const GOLEM_STAMINA_DRAIN_HELI = 5.0;
/** Bloqueo en guardia: -4 stamina/s. */
const GOLEM_STAMINA_DRAIN_BLOCK = 4.0;
/** Coste fijo de cada ataque (se cobra al arrancar el windup). */
export const GOLEM_COST_THIN = 22.0;
export const GOLEM_COST_THICK = 30.0;
export const GOLEM_COST_PUNCH = 12.0;
/** Ventana de castigo: duración del exhausto (recarga completa dentro). */
export const GOLEM_EXHAUSTED_SEC = 5.0;
/** Spec §7.4: exhausto avanza lento a 3 m/s. */
export const GOLEM_EXHAUSTED_SPEED = 3.0;

// --- Helicóptero (persecución con física pesada de 300 kg) ---
export const GOLEM_HELI_SPEED = 9.5;
/** Aceleración pesada (λ de acercamiento a la velocidad objetivo). */
const GOLEM_HELI_ACCEL_LAMBDA = 1.6;
/** El rotor tarda en ganar altura: componente vertical al 65 %. */
const GOLEM_HELI_VERTICAL_SCALE = 0.65;
/** Contención anti-suicidio (mismo criterio que la flotación genérica). */
const GOLEM_KEEP_RADIUS = 78.0;
const GOLEM_KEEP_PULL = 9.0;
/** La carga se corta ANTES de tocar la Barrera Blanca (m de margen). */
const GOLEM_BARRIER_STOP_MARGIN = 2.5;

// --- Puñetazo bruto ---
export const GOLEM_PUNCH_TRIGGER_DISTANCE = 13.0;
export const GOLEM_PUNCH_WINDUP_SEC = 1.1; // Windup torpe y exagerado.
export const GOLEM_PUNCH_SWING_SEC = 0.2;
export const GOLEM_PUNCH_RECOVER_SEC = 1.1; // Inercia posterior.
export const GOLEM_PUNCH_REACH = 4.2;
export const GOLEM_PUNCH_HIT_RADIUS = 4.6;
export const GOLEM_PUNCH_DAMAGE = 16;
export const GOLEM_PUNCH_PUSH = 24.0;
export const GOLEM_PUNCH_COOLDOWN = 3.0;
/** Todo slab con centro a <8 m del punto de impacto se destroza. */
export const GOLEM_SLAB_BREAK_RADIUS = 8.0;
/** El latigazo arrastra el cuerpo hacia el punto de impacto (m/s). */
const GOLEM_PUNCH_LUNGE_SPEED = 4.0;

// --- Cargas en espiral (dirección sellada, trayectoria recta honesta) ---
export const GOLEM_CHARGE_MIN_DIST = 13.0;
export const GOLEM_CHARGE_MAX_DIST = 55.0;
/** Thin: broca rápida (26×mult m/s); thick ~30 % más lenta. */
export const GOLEM_THIN_SPEED = 26.0;
export const GOLEM_THICK_SPEED = 18.2;
export const GOLEM_THIN_WINDUP_SEC = 0.45;
export const GOLEM_THICK_WINDUP_SEC = 0.6;
/** Rastreo honesto durante el windup (rad/s); al terminar, dir. sellada. */
export const GOLEM_THIN_AIM_TURN_RATE = 1.8;
export const GOLEM_THICK_AIM_TURN_RATE = 0.7;
/** Techo de duración de cada carga (s). */
export const GOLEM_THIN_MAX_SEC = 2.2;
export const GOLEM_THICK_MAX_SEC = 2.6;
export const GOLEM_THIN_DAMAGE = 12;
export const GOLEM_THIN_PUSH = 20.0;
export const GOLEM_THICK_DAMAGE = 18;
export const GOLEM_THICK_PUSH = 26.0;
/** Contacto del cuerpo en carga contra Nyx (padding sobre el radius). */
const GOLEM_CHARGE_CONTACT_PADDING = 1.1;
/** Ariete: radio de "roce" extra que rompe slabs mientras ara. */
const GOLEM_THICK_GRAZE_RADIUS = 2.6;
/** Frenado de la inercia tras terminar la carga. */
export const GOLEM_CHARGE_END_SEC = 0.5;

// --- Bloqueo (pared maciza frontal) ---
export const GOLEM_BLOCK_SEC = 1.2;
/** Provocación: si Nyx entra aquí durante la guardia, la suelta y puñetea. */
export const GOLEM_BLOCK_DROP_PUNCH_DIST = 8.0;
/**
 * Impacto frontal bloqueado: `hitDir` apunta HACIA DENTRO del gólem, así que
 * un golpe de frente opone ~180° a su +Z: dot(forward, hitDir) < -0.25.
 */
export const GOLEM_GUARD_FRONT_DOT = -0.25;
const GOLEM_BLOCK_MOVE_SPEED = 1.5;

// --- Remate en cabeza (parry) y flinch ---
export const GOLEM_PARRIED_SEC = 1.6;
/** Ventana vulnerable de penetración al star_core tras el remate (s). */
export const GOLEM_PARRY_VULN_SEC = 1.8;
/** Taladro descendente que remata: componente vertical máxima de hitDir. */
export const GOLEM_PARRY_MAX_Y_HIT_DIR = -0.45;
export const GOLEM_HIT_CLIP_SEC = 0.3;

/** Cooldown de decisión en helicóptero cuando Nyx está fuera de alcance. */
const GOLEM_DECISION_RETRY_SEC = 0.5;

/**
 * Máquina de estados del Gólem Rompesuelos. `parried` se inyecta desde el
 * impacto melee de Nyx (remate desde arriba), no desde la FSM.
 */
export type GolemState =
  | 'helicopter'
  | 'punch_windup'
  | 'punch_smash'
  | 'punch_recover'
  | 'thin_windup'
  | 'thin_spiral'
  | 'thick_windup'
  | 'thick_spiral'
  | 'charge_end'
  | 'block_guard'
  | 'exhausted'
  | 'parried';

/**
 * Contexto compartido con el DomeWaveManager (patrón del cangrejo).
 * `onGolemSmash` y `onSlabSmash` viajan como parámetros de la FSM ofensiva.
 */
export interface GolemBehaviorContext {
  /** Multiplicador de velocidad de la oleada (escalado de cooldowns/vel.). */
  readonly speedMult: number;
}

// Vectores scratch de módulo (cero allocations por frame).
const _up = new THREE.Vector3(0, 1, 0);
const _toPlayer = new THREE.Vector3();
const _targetVel = new THREE.Vector3();
const _flat = new THREE.Vector3();
const _targetQuat = new THREE.Quaternion();
const _slabScratch: SlabContact = {
  slab: null,
  normal: new THREE.Vector3(),
  depth: 0,
  point: new THREE.Vector3(),
};

/**
 * Giro honesto de un Object3D hacia `dir` con velocidad angular máxima real
 * `maxRadPerSec` (física honesta: nada de slerp exponencial engañoso). Es el
 * mismo trato que el cañón del cangrejo (`aimCrabTurretLimited`).
 */
function turnTowardsHonest(
  mesh: THREE.Object3D,
  dir: THREE.Vector3,
  maxRadPerSec: number,
  dt: number,
): void {
  lookAtQuat(dir, _up, _targetQuat);
  const angle = 2 * Math.acos(Math.min(1, Math.abs(mesh.quaternion.dot(_targetQuat))));
  if (angle < 1e-4) {
    return;
  }
  mesh.quaternion.slerp(_targetQuat, Math.min(1, (maxRadPerSec * dt) / angle));
}

/**
 * Movimiento del Gólem por estado (se llama SIEMPRE, también en Modo
 * Entrenamiento; la FSM ofensiva es la que se apaga en pasivo):
 *  - helicóptero: persecución con aceleración pesada + contención;
 *  - cargas: velocidad constante sobre la dirección sellada;
 *  - estados de castigo/telegraph: inercia amortiguada de los 300 kg.
 */
export function updateGolemEnemy(
  enemy: ManagedWaveEnemy,
  internal: EnemyInternal,
  dt: number,
  elapsed: number,
  playerPos: THREE.Vector3,
  passive: boolean,
): void {
  if (passive) {
    // Modo Entrenamiento (saco de boxeo): deriva amortiguada del knockback.
    enemy.velocity.multiplyScalar(Math.exp(-3.5 * dt));
    enemy.position.addScaledVector(enemy.velocity, dt);
    return;
  }

  switch (internal.golemState) {
    case 'helicopter': {
      _toPlayer.subVectors(playerPos, enemy.position);
      if (_toPlayer.lengthSq() < 1e-6) {
        _toPlayer.set(0, 0, 1);
      }
      _toPlayer.normalize();
      _targetVel.copy(_toPlayer).multiplyScalar(GOLEM_HELI_SPEED);
      // El rotor tarda en ganar/perder altura: menor componente vertical.
      _targetVel.y *= GOLEM_HELI_VERTICAL_SCALE;
      const blend = 1 - Math.exp(-GOLEM_HELI_ACCEL_LAMBDA * dt);
      enemy.velocity.lerp(_targetVel, blend);
      // Contención: nunca persigue a Nyx hasta estrellarse contra la Barrera.
      _flat.set(enemy.position.x, 0, enemy.position.z);
      const flatDist = _flat.length();
      if (flatDist > GOLEM_KEEP_RADIUS) {
        _flat.normalize();
        enemy.velocity.addScaledVector(_flat, -GOLEM_KEEP_PULL * dt);
      }
      // Vibración mínima de altura del rotor a 300 kg.
      enemy.velocity.y += Math.sin(elapsed * 24.0 + enemy.phase) * 0.35 * dt;
      enemy.position.addScaledVector(enemy.velocity, dt);
      break;
    }

    case 'thin_spiral':
    case 'thick_spiral':
      // Carga honesta: velocidad constante sobre la dirección sellada.
      enemy.position.addScaledVector(enemy.velocity, dt);
      break;

    case 'thin_windup':
    case 'thick_windup':
    case 'punch_windup':
    case 'punch_recover':
    case 'charge_end':
      // Frenado pesado de la inercia.
      enemy.velocity.multiplyScalar(Math.exp(-2.5 * dt));
      enemy.position.addScaledVector(enemy.velocity, dt);
      break;

    case 'punch_smash':
      // El latigazo arrastra al cuerpo hacia delante frenándose en seco.
      enemy.velocity.multiplyScalar(Math.exp(-4.0 * dt));
      enemy.position.addScaledVector(enemy.velocity, dt);
      break;

    case 'block_guard': {
      // Pared maciza: apenas empuja hacia Nyx mientras cubre.
      _toPlayer.subVectors(playerPos, enemy.position);
      if (_toPlayer.lengthSq() < 1e-6) {
        _toPlayer.set(0, 0, 1);
      }
      _toPlayer.normalize();
      _targetVel.copy(_toPlayer).multiplyScalar(GOLEM_BLOCK_MOVE_SPEED);
      enemy.velocity.lerp(_targetVel, 1 - Math.exp(-2.0 * dt));
      enemy.position.addScaledVector(enemy.velocity, dt);
      break;
    }

    case 'exhausted':
      // Rotor parado: avance lento sobre la dirección sellada al entrar.
      enemy.velocity.copy(internal.golemDriftDir).multiplyScalar(GOLEM_EXHAUSTED_SPEED);
      enemy.position.addScaledVector(enemy.velocity, dt);
      break;

    case 'parried':
      // Aplastamiento vertical: el cuerpo se hunde amortiguando el golpe.
      enemy.velocity.multiplyScalar(Math.exp(-2.5 * dt));
      enemy.velocity.y = Math.max(enemy.velocity.y - 3.0 * dt, -2.0);
      enemy.position.addScaledVector(enemy.velocity, dt);
      break;

    default:
      break;
  }

  // Contención global anti-barrera también fuera de la persecución: el
  // knockback nunca puede deslizar los 300 kg contra la Barrera Blanca.
  _flat.set(enemy.position.x, 0, enemy.position.z);
  if (_flat.length() > GOLEM_KEEP_RADIUS + 6.0) {
    _flat.normalize();
    enemy.velocity.addScaledVector(_flat, -GOLEM_KEEP_PULL * dt);
  }
}

/**
 * FSM ofensiva del Gólem Rompesuelos (rediseño §7.4). `golemTimer` cuenta
 * hacia atrás en todos los estados de duración fija, incluida la distancia
 * de cada carga (los segundos restantes del trayecto recto honesto).
 */
export function updateGolemAttack(
  ctx: GolemBehaviorContext,
  enemy: ManagedWaveEnemy,
  internal: EnemyInternal,
  dt: number,
  playerPos: THREE.Vector3,
  activeSlabs: SlabCollider[] | undefined,
  onGolemSmash?: (damage: number, pushDir: THREE.Vector3, pushSpeed?: number) => void,
  onSlabSmash?: (slab: SlabCollider) => void,
): void {
  switch (internal.golemState) {
    // ------------------------------------------------------------------
    case 'helicopter': {
      // Persecución con rotor: la stamina se quema mientras presiona.
      internal.golemStamina -= GOLEM_STAMINA_DRAIN_HELI * dt;
      if (internal.golemStamina <= 0) {
        startGolemExhausted(enemy, internal, playerPos);
        return;
      }
      if (enemy.attackTimer > 0) {
        return;
      }
      const dist = enemy.position.distanceTo(playerPos);
      if (dist < GOLEM_PUNCH_TRIGGER_DISTANCE) {
        startGolemPunch(enemy, internal);
      } else if (dist <= GOLEM_CHARGE_MAX_DIST && dist >= GOLEM_CHARGE_MIN_DIST) {
        // Alterna broca fina <-> ariete grueso (cadencia legible).
        startGolemChargeWindup(enemy, internal, playerPos, internal.golemChargeKind);
        internal.golemChargeKind = internal.golemChargeKind === 'thin' ? 'thick' : 'thin';
      } else {
        enemy.attackTimer = GOLEM_DECISION_RETRY_SEC;
      }
      return;
    }

    // ------------------------------------------------------------------
    case 'punch_windup': {
      internal.golemTimer -= dt;
      // El windup aún rastrea a Nyx (torpe y pesado); al terminar, la
      // dirección queda SELLADA (sin re-lock durante el golpe).
      if (internal.golemTimer <= 0) {
        _toPlayer.subVectors(playerPos, enemy.position);
        if (_toPlayer.lengthSq() < 1e-4) {
          _toPlayer.set(0, 0, 1);
        } else {
          _toPlayer.normalize();
        }
        internal.golemImpact
          .copy(enemy.position)
          .addScaledVector(_toPlayer, enemy.radius + GOLEM_PUNCH_REACH);
        // El cuerpo se deja arrastrar por el peso del puño.
        enemy.velocity.copy(_toPlayer).multiplyScalar(GOLEM_PUNCH_LUNGE_SPEED);
        internal.golemState = 'punch_smash';
        internal.golemTimer = GOLEM_PUNCH_SWING_SEC;
        enemy.hitFlash = Math.max(enemy.hitFlash, 0.25);
      }
      return;
    }

    case 'punch_smash': {
      internal.golemTimer -= dt;
      if (internal.golemTimer > 0) {
        return;
      }
      // El latigazo alcanza a Nyx: daño + empuje + rotura de suelo.
      if (playerPos.distanceTo(internal.golemImpact) < GOLEM_PUNCH_HIT_RADIUS) {
        _toPlayer.subVectors(playerPos, internal.golemImpact);
        if (_toPlayer.lengthSq() < 1e-4) {
          _toPlayer.set(0, 1, 0);
        } else {
          _toPlayer.normalize();
        }
        onGolemSmash?.(GOLEM_PUNCH_DAMAGE, _toPlayer, GOLEM_PUNCH_PUSH);
      }
      smashSlabsNearPoint(activeSlabs, internal.golemImpact, onSlabSmash);
      internal.golemState = 'punch_recover';
      internal.golemTimer = GOLEM_PUNCH_RECOVER_SEC;
      enemy.attackTimer = GOLEM_PUNCH_COOLDOWN / ctx.speedMult;
      return;
    }

    case 'punch_recover': {
      internal.golemTimer -= dt;
      if (internal.golemTimer <= 0) {
        settleGolem(enemy, internal, playerPos);
      }
      return;
    }

    // ------------------------------------------------------------------
    case 'thin_windup':
    case 'thick_windup': {
      internal.golemTimer -= dt;
      const thin = internal.golemState === 'thin_windup';
      // Rastreo honesto durante el telegraph (velocidad angular real).
      _toPlayer.subVectors(playerPos, enemy.position);
      if (_toPlayer.lengthSq() < 1e-6) {
        _toPlayer.set(0, 0, 1);
      } else {
        _toPlayer.normalize();
      }
      turnTowardsHonest(
        enemy.mesh,
        _toPlayer,
        thin ? GOLEM_THIN_AIM_TURN_RATE : GOLEM_THICK_AIM_TURN_RATE,
        dt,
      );
      if (internal.golemTimer <= 0) {
        // Dirección SELLADA: vuela recto hacia donde estaba Nyx al soltar.
        const speed = (thin ? GOLEM_THIN_SPEED : GOLEM_THICK_SPEED) * ctx.speedMult;
        const dist = enemy.position.distanceTo(playerPos);
        // La carga apunta a CRUZAR la posición de Nyx con margen (whiffeable
        // con un lateral: honradez pura, cero homing). Los segundos que
        // quedan de trayecto viven en golemTimer (no en chargeTimer:
        // un golpe genérico interrumpe embestidas y aquí NO debe).
        internal.golemTimer = Math.min(
          thin ? GOLEM_THIN_MAX_SEC : GOLEM_THICK_MAX_SEC,
          (dist / speed) * 1.35 + 0.4,
        );
        internal.chargeDir.subVectors(playerPos, enemy.position);
        if (internal.chargeDir.lengthSq() < 1e-4) {
          internal.chargeDir.set(0, 0, 1);
        } else {
          internal.chargeDir.normalize();
        }
        enemy.velocity.copy(internal.chargeDir).multiplyScalar(speed);
        internal.golemState = thin ? 'thin_spiral' : 'thick_spiral';
        enemy.hitFlash = Math.max(enemy.hitFlash, 0.2);
      }
      return;
    }

    case 'thin_spiral':
    case 'thick_spiral': {
      // Vuelo recto honesto: segundos restantes del trayecto.
      internal.golemTimer -= dt;
      const thin = internal.golemState === 'thin_spiral';
      const dist = enemy.position.distanceTo(playerPos);

      // Contacto con el cuerpo de Nyx: daño + empuje a lo largo de la carga.
      if (dist < enemy.radius + GOLEM_CHARGE_CONTACT_PADDING) {
        _toPlayer.copy(internal.chargeDir);
        onGolemSmash?.(
          thin ? GOLEM_THIN_DAMAGE : GOLEM_THICK_DAMAGE,
          _toPlayer,
          thin ? GOLEM_THIN_PUSH : GOLEM_THICK_PUSH,
        );
        endGolemCharge(enemy, internal, ctx);
        return;
      }

      // Física contra los slabs (colisión exacta: nada atraviesa gratis).
      if (activeSlabs && activeSlabs.length > 0) {
        const hit = resolveSphereSlabCollision(
          activeSlabs,
          enemy.position,
          enemy.radius,
          _slabScratch,
        );
        if (hit) {
          if (thin) {
            // La broca SE CLAVA contra el suelo y rebota amortiguada.
            enemy.velocity.copy(internal.chargeDir).multiplyScalar(-6.0);
            endGolemCharge(enemy, internal, ctx);
            return;
          }
          // El ariete ROMPE el slab tocado y sigue arando (§7.4).
          if (_slabScratch.slab) {
            onSlabSmash?.(_slabScratch.slab);
          } else {
            smashNearestSlab(
              activeSlabs,
              enemy.position,
              GOLEM_THICK_GRAZE_RADIUS,
              onSlabSmash,
            );
          }
        } else if (!thin) {
          // Sin impacto directo: el ROCE del ariete también rompe suelos.
          smashNearestSlab(
            activeSlabs,
            enemy.position,
            enemy.radius + GOLEM_THICK_GRAZE_RADIUS,
            onSlabSmash,
          );
        }
      }

      // Anti-suicidio honesto: la carga muere ANTES de tocar la Barrera.
      const boundStop = DOME_PLAYER_BOUND_RADIUS - enemy.radius - GOLEM_BARRIER_STOP_MARGIN;
      if (enemy.position.length() > boundStop || internal.golemTimer <= 0) {
        endGolemCharge(enemy, internal, ctx);
      }
      return;
    }

    case 'charge_end': {
      internal.golemTimer -= dt;
      if (internal.golemTimer <= 0) {
        // Tras la inercia levanta la pared maciza (transición defensiva).
        startGolemBlock(enemy, internal);
      }
      return;
    }

    // ------------------------------------------------------------------
    case 'block_guard': {
      internal.golemTimer -= dt;
      internal.golemStamina -= GOLEM_STAMINA_DRAIN_BLOCK * dt;
      const dist = enemy.position.distanceTo(playerPos);
      if (dist < GOLEM_BLOCK_DROP_PUNCH_DIST) {
        // Nyx provoca el ataque: la guardia se suelta en un puñetazo.
        startGolemPunch(enemy, internal);
        return;
      }
      if (internal.golemTimer <= 0 || internal.golemStamina <= 0) {
        settleGolem(enemy, internal, playerPos);
      }
      return;
    }

    // ------------------------------------------------------------------
    case 'exhausted': {
      internal.golemTimer -= dt;
      // La recarga completa vive DENTRO de la ventana de castigo.
      internal.golemStamina = Math.min(
        GOLEM_STAMINA_MAX,
        GOLEM_STAMINA_MAX * (1 - Math.max(0, internal.golemTimer) / GOLEM_EXHAUSTED_SEC),
      );
      if (internal.golemTimer <= 0) {
        // Rotor rearma: vuelve a la persecución con la stamina a tope.
        internal.golemStamina = GOLEM_STAMINA_MAX;
        internal.golemState = 'helicopter';
        internal.golemTimer = 0;
        enemy.attackTimer = 0.5;
      }
      return;
    }

    // ------------------------------------------------------------------
    case 'parried': {
      internal.golemTimer -= dt;
      if (internal.golemTimer <= 0) {
        enemy.attackTimer = 2.0;
        settleGolem(enemy, internal, playerPos);
      }
      return;
    }

    default:
      return;
  }
}

// ============================================================================
// Transiciones de estado y helpers
// ============================================================================

/**
 * Resuelve el estado post-ataque: si la stamina se agotó el rotor se para
 * (exhausto); si no, vuelve a la persecución en helicóptero.
 */
function settleGolem(
  enemy: ManagedWaveEnemy,
  internal: EnemyInternal,
  playerPos: THREE.Vector3,
): void {
  if (internal.golemStamina <= 0) {
    startGolemExhausted(enemy, internal, playerPos);
  } else {
    internal.golemState = 'helicopter';
    internal.golemTimer = 0;
  }
}

/** Arranca el Puñetazo Bruto (windup torpe; dirección sellada al final). */
function startGolemPunch(enemy: ManagedWaveEnemy, internal: EnemyInternal): void {
  internal.golemStamina -= GOLEM_COST_PUNCH;
  internal.golemState = 'punch_windup';
  internal.golemTimer = GOLEM_PUNCH_WINDUP_SEC;
  internal.chargeTimer = 0;
  // El clip golem_brute_punch es one-shot: reinicio forzado (dos puñetazos
  // segudos sin otro clip de por medio no deben quedarse clampados).
  internal.golemRestartPending = true;
  enemy.hitFlash = Math.max(enemy.hitFlash, 0.2);
}

/** Arranca el telegraph de una carga en espiral (fina o gruesa). */
function startGolemChargeWindup(
  enemy: ManagedWaveEnemy,
  internal: EnemyInternal,
  playerPos: THREE.Vector3,
  kind: 'thin' | 'thick',
): void {
  internal.golemStamina -= kind === 'thin' ? GOLEM_COST_THIN : GOLEM_COST_THICK;
  internal.golemState = kind === 'thin' ? 'thin_windup' : 'thick_windup';
  internal.golemTimer = kind === 'thin' ? GOLEM_THIN_WINDUP_SEC : GOLEM_THICK_WINDUP_SEC;
  internal.chargeTimer = 0;
  enemy.hitFlash = Math.max(enemy.hitFlash, 0.15);
}

/** Termina la carga y pasa al frenado de inercia. */
function endGolemCharge(
  enemy: ManagedWaveEnemy,
  internal: EnemyInternal,
  ctx: GolemBehaviorContext,
): void {
  internal.chargeTimer = 0;
  internal.golemState = 'charge_end';
  internal.golemTimer = GOLEM_CHARGE_END_SEC;
  enemy.attackTimer = 1.6 / ctx.speedMult;
}

/** Levanta la pared maciza (bloqueo frontal con el brazo gigante). */
function startGolemBlock(enemy: ManagedWaveEnemy, internal: EnemyInternal): void {
  internal.golemState = 'block_guard';
  internal.golemTimer = GOLEM_BLOCK_SEC;
  enemy.hitFlash = Math.max(enemy.hitFlash, 0.12);
}

/** Rotor parado: ventana real de castigo (spec: 3 m/s y 10°/s). */
function startGolemExhausted(
  enemy: ManagedWaveEnemy,
  internal: EnemyInternal,
  playerPos: THREE.Vector3,
): void {
  internal.golemStamina = 0;
  internal.golemState = 'exhausted';
  internal.golemTimer = GOLEM_EXHAUSTED_SEC;
  internal.chargeTimer = 0;
  // Dirección de deriva FIJA al entrar; el giro lento no puede corregirla.
  internal.golemDriftDir.subVectors(playerPos, enemy.position);
  if (internal.golemDriftDir.lengthSq() < 1e-4) {
    internal.golemDriftDir.set(0, 0, 1);
  } else {
    internal.golemDriftDir.normalize();
  }
  enemy.hitFlash = Math.max(enemy.hitFlash, 0.2);
}

/**
 * Remate en cabeza de Nyx (parry §7.4): taladro descendente que aplasta
 * `head`, escalda y abre la ventana vulnerable de penetración al star_core.
 * Lo dispara `DomeWaveManager.onHitEnemy`; el latigazo activo (punch_smash)
 * NO es interrumpible.
 */
export function parryGolemHead(
  enemy: ManagedWaveEnemy,
  internal: EnemyInternal,
): boolean {
  // El latigazo activo NO es interrumpible, y con el rotor ya parado
  // (exhausto) el remate solo añade la ventana vulnerable: no devolvería
  // al helicóptero recortando la ventana de castigo que ya está abierta.
  if (internal.golemState === 'punch_smash' || internal.golemState === 'exhausted') {
    enemy.entity.vulnerableTimer = Math.max(
      enemy.entity.vulnerableTimer ?? 0,
      GOLEM_PARRY_VULN_SEC,
    );
    enemy.hitFlash = Math.max(enemy.hitFlash, 1.5);
    return false;
  }
  internal.golemState = 'parried';
  internal.golemTimer = GOLEM_PARRIED_SEC;
  internal.chargeTimer = 0;
  enemy.entity.vulnerableTimer = Math.max(
    enemy.entity.vulnerableTimer ?? 0,
    GOLEM_PARRY_VULN_SEC,
  );
  enemy.attackTimer = 2.0;
  enemy.hitFlash = Math.max(enemy.hitFlash, 1.5);
  // One-shot: forzar el reinicio del clip de aplastamiento.
  internal.golemRestartPending = true;
  return true;
}

/** Rompe el slab con centro más cercano a <radius del punto dado. */
function smashNearestSlab(
  activeSlabs: SlabCollider[],
  from: THREE.Vector3,
  radius: number,
  onSlabSmash?: (slab: SlabCollider) => void,
): void {
  if (!onSlabSmash) {
    return;
  }
  let best: SlabCollider | null = null;
  let bestDist = radius;
  for (const slab of activeSlabs) {
    const d = slab.center.distanceTo(from);
    if (d < bestDist) {
      best = slab;
      bestDist = d;
    }
  }
  if (best) {
    onSlabSmash(best);
  }
}

/** Todo slab con centro a <8 m del punto de impacto del puñetazo se rompe. */
function smashSlabsNearPoint(
  activeSlabs: SlabCollider[] | undefined,
  point: THREE.Vector3,
  onSlabSmash?: (slab: SlabCollider) => void,
): void {
  if (!activeSlabs || !onSlabSmash) {
    return;
  }
  smashNearestSlab(activeSlabs, point, GOLEM_SLAB_BREAK_RADIUS, onSlabSmash);
}
