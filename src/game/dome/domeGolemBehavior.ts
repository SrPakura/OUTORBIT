// ============================================================================
// DOME GOLEM BEHAVIOR — IA del Gólem Rompesuelos (modo Cúpula)
// ============================================================================
// Rediseño v2 de enemigos_base.md §7.4 bajo la premisa "IA perfecta (física
// honesta, cero homing/teletransportes) vs jugador frenético":
//
//  - HELICÓPTERO: la falda estrellada (`root`) es un rotor que sostiene sus
//    300 kg; persigue a Nyx con aceleración pesada y presiona sin parar
//    mientras gasta energía.
//  - OBSERVE (la lectura): dentro de la banda de compromiso (~26 m) NO
//    dispara ciegas: se planta a media distancia, orbita el anillo de
//    lectura y LEE a Nyx — si se acerca, si le apunta, si ataca, si está
//    quieta, dónde está respecto a la esfera y cuánta vida lleva cada uno.
//    De ahí sale TODO: puñetazo, carga, pared, retirada o ronda de cálculo.
//  - ANTI-SUICIDIO: la espiral solo arranca si TODO el trayecto previsible
//    (con el lead honesto incluido) le deja VIVO con margen. Nyx pegada a la
//    esfera = nada de cargas: acude y castiga con el cuerpo. Las cargas
//    además CORRIGEN el rumbo en pleno vuelo con tope angular real (0.35/
//    0.18 rad/s): seguir a una Nyx a 3 m/s sí; un lateral a 20+ m/s no.
//  - CRITERIO DE TANQUE: herido y con Nyx entera atacando -> CANCELA el
//    windup y levanta la pared; si Nyx también va baja, se juega la vida y
//    mantiene el compromiso (el intercambio sale a cuenta).
//  - PARED REACTIVA: el bloqueo SE REARMA mientras Nyx amenace (apunte o
//    ataque en serio); baja sola ~0.8 s después de que la amenaza desaparezca.
//    El tope absoluto lo pone la stamina.
//  - DESCANSO VOLUNTARIO: con la energía justa y Nyx pasiva, se retira a
//    ~28 m a regenerar en vez de pelear en seco (tanque, no suicida).
//  - FATIGA: pool de stamina que se agota persiguiendo y encadenando
//    ataques; a cero pasa a EXHAUSTO (rotor parado: avanza a 3 m/s y gira a
//    10°/s — ventana real de castigo) y la recarga completa dentro.
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
export const GOLEM_TURN_RATE = 2.6;
/** Giro honesto del gólem exhausto: 10°/s exactos (rad/s reales). */
export const GOLEM_EXHAUSTED_TURN_RATE = 10.0 * (Math.PI / 180);

// --- Lectura de Nyx (IA observadora de media distancia) ---
/** Más allá de aquí SOLO acercarse con el rotor para entrar en banda (m). */
export const GOLEM_ENGAGE_MAX_DIST = 30.0;
/** Análisis/presión: micropausa de decisión dentro de la banda (s). */
export const GOLEM_OBSERVE_SEC = 0.45;
/** Presión: anillo de acoso mientras decide dentro de la banda (m). */
const GOLEM_PRESS_RING = 7.0;
/** Cruceta lateral mientras presiona (m/s): nunca clavado esperando. */
export const GOLEM_OBSERVE_ORBIT_SPEED = 6.0;
/** Lead honesto máximo de la predicción (s): apunta a donde Nyx VA a estar. */
export const GOLEM_LEAD_MAX_SEC = 0.75;
/** Pasividad de Nyx: por debajo de esta velocidad NO le dispara a la posición actual. */
export const GOLEM_PASSIVE_SPEED = 9.5;

// --- Banda de apuesta (20-30 m): aquí SÍ puede inmolarse si hace falta ---
/** Borde interior de la banda de apuesta (m). */
export const GOLEM_GAMBLE_MIN_DIST = 20.0;
/** Borde exterior de la banda de apuesta (m). */
export const GOLEM_GAMBLE_MAX_DIST = 30.0;
/** Eden de Nyx por debajo del cual afronta la inmolación como remate. */
export const GOLEM_GAMBLE_EDEN_LOW = 0.35;

// --- Corrección de rumbo en plena carga (auto-aim honesto de 300 kg) ---
/** Thin (broca): giro máximo en vuelo (rad/s). */
export const GOLEM_THIN_TURN_IN_FLIGHT = 0.45;
/** Thick (ariete): gira la mitad — es un tren de mercancías (rad/s). */
export const GOLEM_THICK_TURN_IN_FLIGHT = 0.22;

// --- Anti-suicidio: la carga solo arranca si la línea es segura ---
/** Margen contra la Barrera Blanca para TODO el trayecto previsible (m). */
const GOLEM_CHARGE_SAFE_MARGIN = 2.5;

// --- Criterio de tanque: cuándo cubrirse y cuándo jugarse la vida ---
/** HP del gólem por debajo del cual prioriza la pared sobre el ataque. */
export const GOLEM_COWARD_HP_RATIO = 0.35;
/** HP de Nyx por debajo del cual apostar la vida sale a cuenta. */
export const GOLEM_PLAYER_LOW_RATIO = 0.30;
/** Amenaza: Nyx con un ataque EN CURSO hacia el gólem (cono medio). */
const GOLEM_THREAT_ATTACK_DOT = 0.62;
/** Amenaza relajada del herido: se cubre con un cono mucho más ancho. */
const GOLEM_THREAT_WOUNDED_DOT = 0.35;
/** Amenaza: distancia a la que un ataque de Nyx se toma en serio (m). */
export const GOLEM_THREAT_RANGE = 20.0;
/** Trabajada la pared: tras bajarla, este tiempo SIN poder re-levantarla (s). */
export const GOLEM_BLOCK_REACT_COOLDOWN = 1.8;

// --- Descanso voluntario (stamina) ---
/** Bajo esto, con Nyx pasiva, se retira a descansar en vez de pelear en seco. */
export const GOLEM_REST_STAMINA = 25.0;
/** Descanso completo: vuelve al ruedo con la energía a este nivel. */
export const GOLEM_REST_TARGET_STAMINA = 62.0;
export const GOLEM_REST_REGEN = 11.0;
/** Distancia de seguridad que busca para descansar (m). */
export const GOLEM_REST_DISTANCE = 26.0;
/** Retirada del descanso (m/s). */
export const GOLEM_RETREAT_SPEED = 9.5;

// --- Economía de energía/fatiga ---
export const GOLEM_STAMINA_MAX = 100.0;
/** Persecución en helicóptero: -3.5 stamina/s mientras presiona. */
const GOLEM_STAMINA_DRAIN_HELI = 3.5;
/** Presión/lectura: el rotor mantiene el vuelo (-1.5 stamina/s). */
const GOLEM_STAMINA_DRAIN_OBSERVE = 1.5;
/** Bloqueo en guardia: -4 stamina/s. */
const GOLEM_STAMINA_DRAIN_BLOCK = 4.0;
/** Coste fijo de cada ataque (se cobra al arrancar el windup). */
export const GOLEM_COST_THIN = 18.0;
export const GOLEM_COST_THICK = 24.0;
export const GOLEM_COST_PUNCH = 10.0;
/** Ventana de castigo: duración del exhausto (recarga completa dentro). */
export const GOLEM_EXHAUSTED_SEC = 5.0;
/** Spec §7.4: exhausto avanza lento a 3 m/s. */
export const GOLEM_EXHAUSTED_SPEED = 3.0;

// --- Helicóptero (persecución con física pesada de 300 kg) ---
export const GOLEM_HELI_SPEED = 15.0;
/** Aceleración pesada (λ de acercamiento a la velocidad objetivo). */
const GOLEM_HELI_ACCEL_LAMBDA = 2.2;
/** El rotor tarda en ganar altura: componente vertical al 75 %. */
const GOLEM_HELI_VERTICAL_SCALE = 0.75;
/** Contención anti-suicidio (mismo criterio que la flotación genérica). */
const GOLEM_KEEP_RADIUS = 78.0;
const GOLEM_KEEP_PULL = 9.0;
/** La carga se corta ANTES de tocar la Barrera Blanca (m de margen). */
const GOLEM_BARRIER_STOP_MARGIN = 2.5;

// --- Puñetazo bruto ---
/** Banda del físico: dentro de 5 m el puñetazo es el castigo SIEMPRE. */
export const GOLEM_PUNCH_TRIGGER_DISTANCE = 5.0;
export const GOLEM_PUNCH_WINDUP_SEC = 0.95; // Windup torpe y exagerado.
export const GOLEM_PUNCH_SWING_SEC = 0.2;
export const GOLEM_PUNCH_RECOVER_SEC = 1.0; // Inercia posterior.
export const GOLEM_PUNCH_REACH = 4.6;
/** Radio de impacto del puñetazo contra el cuerpo de Nyx (m). */
export const GOLEM_PUNCH_HIT_RADIUS = 3.8;
export const GOLEM_PUNCH_DAMAGE = 16;
export const GOLEM_PUNCH_PUSH = 24.0;
export const GOLEM_PUNCH_COOLDOWN = 2.4;
/** Todo slab con centro a <8 m del punto de impacto se destroza. */
export const GOLEM_SLAB_BREAK_RADIUS = 8.0;
/** El latigazo arrastra el cuerpo hacia el punto de impacto (m/s). */
const GOLEM_PUNCH_LUNGE_SPEED = 4.0;

// --- Cargas en espiral (dirección sellada, trayectoria recta honesta) ---
/** Banda de la carga: de <5 m (puñetazo) hasta 20 m (más allá: acercarse). */
export const GOLEM_CHARGE_MIN_DIST = 4.5;
export const GOLEM_CHARGE_MAX_DIST = 20.0;
/** Thin: broca rápida (28×mult m/s); thick ~30 % más lenta. */
export const GOLEM_THIN_SPEED = 28.0;
export const GOLEM_THICK_SPEED = 20.0;
export const GOLEM_THIN_WINDUP_SEC = 0.45;
export const GOLEM_THICK_WINDUP_SEC = 0.6;
/** Rastreo honesto durante el windup (rad/s); al terminar, dir. sellada. */
export const GOLEM_THIN_AIM_TURN_RATE = 2.2;
export const GOLEM_THICK_AIM_TURN_RATE = 0.9;
/** Techo de duración de cada carga (s). */
export const GOLEM_THIN_MAX_SEC = 2.2;
export const GOLEM_THICK_MAX_SEC = 2.6;
export const GOLEM_THIN_DAMAGE = 12;
export const GOLEM_THIN_PUSH = 20.0;
export const GOLEM_THICK_DAMAGE = 18;
export const GOLEM_THICK_PUSH = 26.0;
/** Contacto del cuerpo en carga contra Nyx (padding sobre el radius). */
const GOLEM_CHARGE_CONTACT_PADDING = 1.5;
/** Ariete: radio de "roce" extra que rompe slabs mientras ara. */
const GOLEM_THICK_GRAZE_RADIUS = 2.6;
/** Frenado de la inercia tras terminar la carga. */
export const GOLEM_CHARGE_END_SEC = 0.5;

// --- Bloqueo (pared maciza frontal, reactivo) ---
/**
 * La pared SE MANTIENE mientras Nyx sea una amenaza (apunte/ataque en
 * serio): cada frame de amenaza rearma el timer. Sin amenaza, baja sola
 * tras GOLEM_BLOCK_RELAX_SEC. El tope absoluto lo pone la stamina (-4/s).
 */
export const GOLEM_BLOCK_HOLD_SEC = 0.78;
/** Sin amenaza: la pared baja tras este tiempo (s). */
export const GOLEM_BLOCK_RELAX_SEC = 0.78;
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
const GOLEM_DECISION_RETRY_SEC = 0.35;

/**
 * Máquina de estados del Gólem Rompesuelos. `parried` se inyecta desde el
 * impacto melee de Nyx (remate desde arriba), no desde la FSM.
 */
export type GolemState =
  | 'helicopter'
  | 'observe'
  | 'retreat'
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

/**
 * La foto de Nyx que el gólem LEE cada frame (información perfecta, uso
 * honesto): su velocidad (predicción/lead), su apunte (amenaza), si tiene
 * un ataque en curso y su nivel de vida/Eden (critero de tanque y de la
 * banda de apuesta). El `DomeWaveManager` la rellena una vez por frame.
 */
export interface GolemPlayerInfo {
  /** Velocidad actual de Nyx (m/s): lead de las cargas y pasividad. */
  readonly vel: THREE.Vector3;
  /** Aim forward de la cámara de Nyx (unit). */
  readonly aimForward: THREE.Vector3;
  /** Vida de Nyx 0..1. Bajo GOLEM_PLAYER_LOW_RATIO: se juega la vida. */
  hpRatio: number;
  /** Eden de Nyx 0..1: con qué margen puede remontar (banda de apuesta). */
  edenRatio: number;
  /** ¿Tiene Nyx un ataque en curso (ventana de speed_attack)? */
  attacking: boolean;
}

// Vectores scratch de módulo (cero allocations por frame).
const _up = new THREE.Vector3(0, 1, 0);
const _toPlayer = new THREE.Vector3();
const _targetVel = new THREE.Vector3();
const _flat = new THREE.Vector3();
const _targetQuat = new THREE.Quaternion();
const _perp = new THREE.Vector3();
const _predict = new THREE.Vector3();
const _steerAxis = new THREE.Vector3();
const _aimDir = new THREE.Vector3();
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
 * ¿Es Nyx una amenaza REAL para este gólem? SOLO cuenta un ataque EN CURSO
 * apuntándole: la mirada YA NO BLOQUEA — antes levantaba la pared por un
 * apunte fino aunque Nyx no estuviera haciendo nada ("bloquea si lo miro",
 * incluso lejos). Herido, el cono se relaja: el que va perdiendo se cubre
 * antes.
 */
function isThreatToGolem(
  enemy: ManagedWaveEnemy,
  playerPos: THREE.Vector3,
  info: GolemPlayerInfo,
): boolean {
  if (!info.attacking) {
    return false;
  }
  const dist = enemy.position.distanceTo(playerPos);
  if (dist > GOLEM_THREAT_RANGE) {
    return false;
  }
  _aimDir.subVectors(enemy.position, playerPos);
  if (_aimDir.lengthSq() < 1e-4) {
    return true;
  }
  _aimDir.normalize();
  const cone = golemIsWounded(enemy) ? GOLEM_THREAT_WOUNDED_DOT : GOLEM_THREAT_ATTACK_DOT;
  return info.aimForward.dot(_aimDir) > cone;
}

/** ¿Va tan bajo el gólem que un intercambio le sale caro? */
function golemIsWounded(enemy: ManagedWaveEnemy): boolean {
  return enemy.entity.hp / enemy.entity.maxHp < GOLEM_COWARD_HP_RATIO;
}

/**
 * Anti-suicidio (rutas inteligentes): ¿la línea COMPLETA de la carga —desde
 * aquí, a la velocidad real, durante los segundos de vuelo que le quedan al
 * trayecto— deja al gólem dentro de la cúpula con margen? Como el trayecto
 * es recto y la norma es convexa, basta con comprobar el punto final: si el
 * destino previsible cae cerca de la esfera, NO arranca la carga y acude al
 * puñetazo en su lugar. Aquí está el "no me inmolo contra la esfera con tal
 * de darte" del rediseño.
 */
function golemChargeIsSafe(
  enemy: ManagedWaveEnemy,
  playerPos: THREE.Vector3,
  info: GolemPlayerInfo,
  thin: boolean,
  speedMult: number,
): boolean {
  const speed = (thin ? GOLEM_THIN_SPEED : GOLEM_THICK_SPEED) * speedMult;
  // Objetivo con el mismo lead honesto que usará el windup al sellar.
  _toPlayer.subVectors(playerPos, enemy.position);
  const rawDist = _toPlayer.length();
  const lead = rawDist > 1e-4 ? Math.min(GOLEM_LEAD_MAX_SEC, (rawDist / speed) * 0.5) : 0;
  _predict.copy(playerPos).addScaledVector(info.vel, lead);
  _toPlayer.subVectors(_predict, enemy.position);
  const dist = _toPlayer.length();
  if (dist < 1e-4) {
    return enemy.position.length() < DOME_PLAYER_BOUND_RADIUS - enemy.radius - GOLEM_CHARGE_SAFE_MARGIN;
  }
  _toPlayer.normalize();
  const flight = Math.min(thin ? GOLEM_THIN_MAX_SEC : GOLEM_THICK_MAX_SEC, (dist / speed) * 1.35 + 0.4);
  // Punto final previsible del trayecto recto sellado.
  _predict.copy(enemy.position).addScaledVector(_toPlayer, speed * flight);
  const boundStop = DOME_PLAYER_BOUND_RADIUS - enemy.radius - GOLEM_CHARGE_SAFE_MARGIN;
  return _predict.length() <= boundStop;
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

    case 'observe': {
      // Análisis en vuelo estacionario: mantiene el anillo de lectura
      // (GOLEM_OBSERVE_RING, contraído a GOLEM_PRESS_RING si la espiral no es
      // segura y toca presionar con el cuerpo) cruceta lenta alrededor de
      // Nyx mientras la FSM superior decide qué hacer con lo que está leyendo.
      _toPlayer.subVectors(playerPos, enemy.position);
      if (_toPlayer.lengthSq() < 1e-6) {
        _toPlayer.set(0, 0, 1);
      }
      const dist = _toPlayer.length();
      _toPlayer.normalize();
      const ring = GOLEM_PRESS_RING;
      // Radial: acércate si estás fuera del anillo, repliega si te metes.
      const radial = THREE.MathUtils.clamp(
        (dist - ring) * 0.55,
        -GOLEM_OBSERVE_ORBIT_SPEED,
        GOLEM_OBSERVE_ORBIT_SPEED,
      );
      _targetVel.copy(_toPlayer).multiplyScalar(radial);
      // Tangencial: cruceta lenta (sentido fijo por instancia).
      _perp.crossVectors(_up, _toPlayer);
      if (_perp.lengthSq() < 1e-4) {
        _perp.set(1, 0, 0);
      } else {
        _perp.normalize();
      }
      const orbitSign = enemy.phase > Math.PI ? 1 : -1;
      _targetVel.addScaledVector(_perp, GOLEM_OBSERVE_ORBIT_SPEED * orbitSign);
      _targetVel.y *= 0.5; // Vuelo estacionario: casi sin ganancia de altura.
      enemy.velocity.lerp(_targetVel, 1 - Math.exp(-2.0 * dt));
      enemy.position.addScaledVector(enemy.velocity, dt);
      break;
    }

    case 'retreat': {
      // Descanso voluntario: se retira a GOLEM_REST_DISTANCE regenerando
      // energía, siempre de cara a Nyx (tanque herido, no cobarre errante).
      _toPlayer.subVectors(playerPos, enemy.position);
      if (_toPlayer.lengthSq() < 1e-6) {
        _toPlayer.set(0, 0, 1);
      }
      const dist = _toPlayer.length();
      _toPlayer.normalize();
      // Fuera de la distancia de descanso: frena y flota en vigilancia.
      const speed = dist >= GOLEM_REST_DISTANCE ? 0 : GOLEM_RETREAT_SPEED;
      _targetVel.copy(_toPlayer).multiplyScalar(-speed);
      enemy.velocity.lerp(_targetVel, 1 - Math.exp(-2.0 * dt));
      enemy.position.addScaledVector(enemy.velocity, dt);
      break;
    }

    case 'thin_spiral':
    case 'thick_spiral':
      // Carga honesta: velocidad constante sobre la dirección sellada
      // (la FSM superior corrige el rumbo con tope angular real).
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
  info: GolemPlayerInfo,
  activeSlabs: SlabCollider[] | undefined,
  onGolemSmash?: (damage: number, pushDir: THREE.Vector3, pushSpeed?: number) => void,
  onSlabSmash?: (slab: SlabCollider) => void,
): void {
  const playerLow = info.hpRatio <= GOLEM_PLAYER_LOW_RATIO;
  if (internal.golemBlockCooldown > 0) {
    internal.golemBlockCooldown = Math.max(0, internal.golemBlockCooldown - dt);
  }
  switch (internal.golemState) {
    // ------------------------------------------------------------------
    case 'helicopter': {
      // Persecución con rotor: la stamina se quema mientras presiona.
      internal.golemStamina -= GOLEM_STAMINA_DRAIN_HELI * dt;
      if (internal.golemStamina <= 0) {
        startGolemExhausted(enemy, internal, playerPos);
        return;
      }
      // Amenaza REAL (ataque en curso hacia él): pared ANTES de comérselo.
      if (isThreatToGolem(enemy, playerPos, info) && tryStartGolemBlock(enemy, internal)) {
        return;
      }
      if (enemy.attackTimer > 0) {
        return;
      }
      const dist = enemy.position.distanceTo(playerPos);
      if (dist < GOLEM_PUNCH_TRIGGER_DISTANCE) {
        // < 5 m: castigo físico SIEMPRE, sin esperar a nadie.
        startGolemPunch(enemy, internal);
        return;
      }
      if (dist <= GOLEM_CHARGE_MAX_DIST) {
        // Banda de la carga (5-20 m): dispara YA si la línea es segura.
        if (
          golemChargeIsSafe(
            enemy,
            playerPos,
            info,
            internal.golemChargeKind === 'thin',
            ctx.speedMult,
          )
        ) {
          startGolemChargeWindup(enemy, internal, playerPos, internal.golemChargeKind);
          internal.golemChargeKind = internal.golemChargeKind === 'thin' ? 'thick' : 'thin';
        } else {
          // Línea no segura (esfera cerca): PRESIÓN — acosa por dentro
          // mientras reevalúa; a <5 m el puñetazo solo.
          internal.golemState = 'observe';
          internal.golemTimer = GOLEM_OBSERVE_SEC;
        }
        return;
      }
      if (dist <= GOLEM_GAMBLE_MAX_DIST) {
        // Banda de APUESTA (20-30 m): alterna según cooldown, stamina, vida
        // de ambos y Eden de Nyx. Si el intercambio sale a cuenta — gólem
        // tocado y Nyx sin vida o sin Eden para remontar — tira la carga
        // LARGA aunque la línea sea un suicidio: aquí SÍ puede inmolarse.
        const allIn =
          golemIsWounded(enemy) &&
          (playerLow || info.edenRatio <= GOLEM_GAMBLE_EDEN_LOW);
        if (
          allIn &&
          internal.golemStamina >= GOLEM_COST_THIN
        ) {
          internal.golemGambling = true;
          startGolemChargeWindup(enemy, internal, playerPos, 'thin');
          return;
        }
        // Cooldown/stamina no listos o apuesta mala: sigue acercándose
        // (perseguirá sin parar hasta entrar en las bandas interiores).
        enemy.attackTimer = GOLEM_DECISION_RETRY_SEC;
        return;
      }
      // > 30 m: persigue al rotor a 15 m/s — nunca "se queda mirando".
      enemy.attackTimer = GOLEM_DECISION_RETRY_SEC;
      return;
    }

    // ------------------------------------------------------------------
    case 'observe': {
      internal.golemTimer -= dt;
      internal.golemStamina -= GOLEM_STAMINA_DRAIN_OBSERVE * dt;
      if (internal.golemStamina <= 0) {
        startGolemExhausted(enemy, internal, playerPos);
        return;
      }
      const dist = enemy.position.distanceTo(playerPos);
      // Nyx se planta encima: castigo físico inmediato (abusa del cuerpo).
      if (dist < GOLEM_PUNCH_TRIGGER_DISTANCE) {
        startGolemPunch(enemy, internal);
        return;
      }
      // Me está atacando apuntándome: pared si puede (cooldown mediante).
      if (isThreatToGolem(enemy, playerPos, info) && tryStartGolemBlock(enemy, internal)) {
        return;
      }
      if (internal.golemTimer > 0) {
        return;
      }
      // --- Reevaluación corta (0.45 s): sin vacilar en la cara ---
      const passivePlayer = info.vel.length() < GOLEM_PASSIVE_SPEED && !info.attacking;
      if (internal.golemStamina < GOLEM_REST_STAMINA && passivePlayer) {
        // Energía justa y Nyx sin intención: retirada a descansar.
        internal.golemState = 'retreat';
        return;
      }
      if (dist <= GOLEM_CHARGE_MAX_DIST) {
        if (
          golemChargeIsSafe(
            enemy,
            playerPos,
            info,
            internal.golemChargeKind === 'thin',
            ctx.speedMult,
          )
        ) {
          startGolemChargeWindup(enemy, internal, playerPos, internal.golemChargeKind);
          internal.golemChargeKind = internal.golemChargeKind === 'thin' ? 'thick' : 'thin';
          return;
        }
      }
      // La esfera sigue cerrando la línea: sigue acosando por dentro hasta
      // <5 m — el puñetazo saldrá solo en cuanto pise esa banda.
      internal.golemTimer = GOLEM_OBSERVE_SEC;
      return;
    }

    // ------------------------------------------------------------------
    case 'retreat': {
      // Descanso voluntario: regenera con el rotor al ralentí. Nyx lo corta
      // agresiva -> al ruedo YA; completo -> vuelve fresco.
      internal.golemStamina = Math.min(
        GOLEM_STAMINA_MAX,
        internal.golemStamina + GOLEM_REST_REGEN * dt,
      );
      const dist = enemy.position.distanceTo(playerPos);
      if (dist < GOLEM_PUNCH_TRIGGER_DISTANCE) {
        startGolemPunch(enemy, internal);
        return;
      }
      const threat = isThreatToGolem(enemy, playerPos, info);
      const rested = internal.golemStamina >= GOLEM_REST_TARGET_STAMINA;
      if (rested) {
        internal.golemState = 'helicopter';
        enemy.attackTimer = 0.35;
        return;
      }
      if (threat) {
        // Nyx le corta el descanso atacándolo: pared (si puede) o al ruedo YA.
        if (tryStartGolemBlock(enemy, internal)) {
          return;
        }
        internal.golemState = 'helicopter';
        enemy.attackTimer = 0;
      }
      return;
    }

    // ------------------------------------------------------------------
    case 'punch_windup': {
      internal.golemTimer -= dt;
      // Criterio de tanque: herido, con Nyx cargando encima y sin apurar el
      // windup -> CANCELA y levanta la pared. Si Nyx también va muy baja,
      // el intercambio sale a cuenta: aguanta y remata el golpe.
      if (
        internal.golemTimer > 0.08 &&
        golemIsWounded(enemy) &&
        !playerLow &&
        isThreatToGolem(enemy, playerPos, info)
      ) {
        startGolemBlock(enemy, internal);
        enemy.attackTimer = 0.4;
        return;
      }
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
      // Criterio de tanque (igual que el puñetazo): herido + amenaza de Nyx
      // +Nyx entera -> cancela el windup y levanta la pared.
      if (
        internal.golemTimer > 0.08 &&
        golemIsWounded(enemy) &&
        !playerLow &&
        isThreatToGolem(enemy, playerPos, info)
      ) {
        startGolemBlock(enemy, internal);
        enemy.attackTimer = 0.4;
        return;
      }
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
        // Dirección SELLADA con PREDICCIÓN: apunta a donde Nyx VA a estar
        // (lead honesto capado por GOLEM_LEAD_MAX_SEC), no a su posición
        // actual. Los segundos de trayecto viven en golemTimer (no en
        // chargeTimer: un golpe genérico interrumpe embestidas y aquí NO
        // debe). El rumbo se corrige un pelín en vuelo (espirales).
        const speed = (thin ? GOLEM_THIN_SPEED : GOLEM_THICK_SPEED) * ctx.speedMult;
        const rawDist = enemy.position.distanceTo(playerPos);
        const lead = Math.min(GOLEM_LEAD_MAX_SEC, (rawDist / speed) * 0.5);
        _predict.copy(playerPos).addScaledVector(info.vel, lead);
        internal.golemTimer = Math.min(
          thin ? GOLEM_THIN_MAX_SEC : GOLEM_THICK_MAX_SEC,
          (rawDist / speed) * 1.35 + 0.4,
        );
        internal.chargeDir.subVectors(_predict, enemy.position);
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
      const speed = (thin ? GOLEM_THIN_SPEED : GOLEM_THICK_SPEED) * ctx.speedMult;
      // GIRO EN MITAD DEL ATAQUE (auto-aim honesto): los 300 kg corrigen el
      // rumbo hacia Nyx con un tope angular REAL — 0.35 rad/s la broca,
      // 0.18 el ariete. Seguir a una Nyx a 3 m/s cuesta ~0.2 rad/s: dentro
      // del tope; un lateral comprometido a 20+ m/s sigue ganando.
      _toPlayer.subVectors(playerPos, enemy.position);
      if (_toPlayer.lengthSq() > 1e-6) {
        _toPlayer.normalize();
        const angle = Math.acos(
          THREE.MathUtils.clamp(internal.chargeDir.dot(_toPlayer), -1, 1),
        );
        if (angle > 1e-4) {
          _steerAxis.crossVectors(internal.chargeDir, _toPlayer);
          if (_steerAxis.lengthSq() > 1e-6) {
            _steerAxis.normalize();
            internal.chargeDir
              .applyAxisAngle(
                _steerAxis,
                Math.min(
                  angle,
                  (thin ? GOLEM_THIN_TURN_IN_FLIGHT : GOLEM_THICK_TURN_IN_FLIGHT) * dt,
                ),
              )
              .normalize();
            // La velocidad se renormaliza desde el rumbo: 300 kg girando no
            // pueden ser desviados por la patada de nadie.
            enemy.velocity.copy(internal.chargeDir).multiplyScalar(speed);
          }
        }
      }
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

      // Anti-suicidio honesto: la carga muere ANTES de tocar la Barrera…
      // salvo en la carga de APUESTA (banda 20-30 m): ahí el gólem decide
      // con la vida de ambos y puede inmolarse contra la esfera si hace
      // falta para cruzar a Nyx.
      if (!internal.golemGambling) {
        const boundStop = DOME_PLAYER_BOUND_RADIUS - enemy.radius - GOLEM_BARRIER_STOP_MARGIN;
        if (enemy.position.length() > boundStop || internal.golemTimer <= 0) {
          endGolemCharge(enemy, internal, ctx);
        }
      } else if (internal.golemTimer <= 0) {
        endGolemCharge(enemy, internal, ctx);
      }
      return;
    }

    case 'charge_end': {
      internal.golemTimer -= dt;
      if (internal.golemTimer <= 0) {
        // Tras la inercia: la pared SOLO si Nyx es amenaza real (antes la
        // alzaba SIEMPRE y se leía como "bloquea después de un ataque").
        if (isThreatToGolem(enemy, playerPos, info)) {
          tryStartGolemBlock(enemy, internal);
        } else {
          settleGolem(enemy, internal, playerPos);
          enemy.attackTimer = Math.max(enemy.attackTimer, 0.4);
        }
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
      // Pared REACTIVA: mientras Nyx siga siendo amenaza (ataque en curso
      // hacia él) el timer SE REARMA. Sin amenaza, cuenta atrás corta y
      // vuelve al ruedo. El tope absoluto lo marca la stamina.
      if (isThreatToGolem(enemy, playerPos, info)) {
        internal.golemTimer = Math.max(internal.golemTimer, GOLEM_BLOCK_HOLD_SEC);
      }
      if (internal.golemTimer <= 0 || internal.golemStamina <= 0) {
        // Pared trabajada: tras bajarla, un rato SIN poder izarla otra vez
        // (ventana de castigo honesta; el herido la ignora).
        internal.golemBlockCooldown = GOLEM_BLOCK_REACT_COOLDOWN;
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
  internal.golemGambling = false;
  internal.golemState = 'charge_end';
  internal.golemTimer = GOLEM_CHARGE_END_SEC;
  enemy.attackTimer = 1.6 / ctx.speedMult;
}

/** Levanta la pared maciza (bloqueo frontal con el brazo gigante). REACTIVA:
 * se mantiene rearmada mientras Nyx amenace (ver FSM) y baja sola ~0.8 s
 * después de que la amenaza desaparezca. */
/**
 * Pared reactiva CON COOLDOWN: tras bajar la guardia el gólem tarda
 * GOLEM_BLOCK_REACT_COOLDOWN en poder izarla otra vez (se puede castigar la
 * pared bajada). El herido ignora el cooldown: sin vida, cubrirse es lo
 * único que le queda. Devuelve false si NO la levantó.
 */
function tryStartGolemBlock(enemy: ManagedWaveEnemy, internal: EnemyInternal): boolean {
  if (internal.golemBlockCooldown > 0 && !golemIsWounded(enemy)) {
    return false;
  }
  startGolemBlock(enemy, internal);
  return true;
}

function startGolemBlock(enemy: ManagedWaveEnemy, internal: EnemyInternal): void {
  internal.golemState = 'block_guard';
  internal.golemTimer = GOLEM_BLOCK_RELAX_SEC;
  // Reinicio del clip de guardia: la pared sube SIEMPRE (no se reusa pose).
  internal.golemRestartPending = true;
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
