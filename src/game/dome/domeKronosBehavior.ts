// ============================================================================
// DOME KRONOS BEHAVIOR — IA del Leviatán KRONOS (modo Cúpula)
// ============================================================================
// Comportamiento completo del boss extraído de DomeWaveManager (P6): la FSM
// de ataques (Tramo Devorasuelos, Anillos de Contención, Enrosco
// Gravitatorio), el avance de los anillos expansivos, la espiral de esferas
// oscuras del enrosco, el movimiento (embestida/órbita/flotación) y la pose
// serpentina procedural de la cadena de segmentos.
//
// Las funciones reciben un `KronosBehaviorContext` (el propio manager) con
// los miembros compartidos: multiplicador de velocidad de oleada, pool de
// anillos, disparo de proyectiles, flotación y posado de huesos. Scratch de
// módulo: cero allocations por frame.
// ============================================================================

import * as THREE from 'three';
import { STAR_CORE_EMISSIVE, type EnemyBone } from './DomeEnemyModels';
import { faceTowards } from './domeEnemyOrient';
import type { SlabCollider } from './domeTypes';
import type { EnemyInternal, ManagedWaveEnemy } from './DomeWaveManager';

// ============================================================================
// Constantes del Leviatán KRONOS
// ============================================================================

const KRONOS_TURN_RATE = 1.7; // Giro suave del cuerpo hacia la dirección de avance.
const KRONOS_TURN_RATE_CHARGE = 4.0; // La embestida endereza el cuerpo rápido.
const KRONOS_SEG_WAVE_SPEED = 3.2; // Frecuencia base de la onda (rad/s).
const KRONOS_SEG_PHASE_STEP = 0.55; // Desfase progresivo entre segmentos (rad).
const KRONOS_SEG_YAW_AMP = 0.085; // Amplitud de guiñada por segmento (rad).
const KRONOS_SEG_PITCH_AMP = 0.045; // Amplitud de cabeceo por segmento (rad).
const KRONOS_FIN_FLAP_SPEED = 3.1; // Aleteo de las aletas pectorales (rad/s).
const KRONOS_FIN_FLAP_AMP = 0.3; // Amplitud del aleteo (rad).
const KRONOS_JAW_OPEN_RAD = 0.5; // Apertura del hueso jaw (Anillos de Contención).
// Ataque 1 — Tramo Devorasuelos: embestida que atraviesa la arena rompiendo suelos.
const KRONOS_CHARGE_SPEED = 26.0; // m/s de la embestida.
const KRONOS_CHARGE_SEC = 2.3; // Duración del cruze de la arena (s).
const KRONOS_CHARGE_DAMAGE = 16;
const KRONOS_CHARGE_RECONTACT_SEC = 0.8; // Daño de contacto con cooldown (atraviesa).
const KRONOS_SLAB_BREAK_RADIUS = 9.0; // Alcance de la rotura de suelos flotantes (m).
const KRONOS_CHARGE_END_RADIUS = 76.0; // Fin anticipado al acercarse a la Barrera.
// Ataque 2 — Anillos de Contención: jaw abierta + ondas circulares expansivas.
const KRONOS_RING_TELEGRAPH_SEC = 0.8; // Apertura de fauces antes del disparo.
const KRONOS_RING_COUNT = [3, 2, 1]; // Anillos por ataque (rotado).
const KRONOS_RING_INTERVAL_SEC = 0.45; // Separación entre anillos emitidos.
const KRONOS_RING_RECOVER_SEC = 0.5; // Cierre de fauces tras el último anillo.
const KRONOS_RING_TRAVEL_SPEED = 9.0; // Avance del centro del anillo (m/s).
const KRONOS_RING_EXPAND_SPEED = 16.0; // Crecimiento del radio (m/s).
const KRONOS_RING_MAX_RADIUS = 55.0; // Radio al que se disipa el anillo (m).
const KRONOS_RING_HIT_BAND = 1.7; // Grosor de la banda de empuje (m).
const KRONOS_RING_PUSH_SPEED = 30.0; // Empuje radial hacia la Barrera Blanca (m/s).
export const KRONOS_RING_POOL_SIZE = 8;
// Ataque 3 — Enrosco Gravitatorio (Fase < 50% HP).
const KRONOS_COIL_HP_FRACTION = 0.5; // Umbral de vida que habilita el enrosco.
const KRONOS_COIL_SEC = 7.0; // Duración del enrosco (s).
const KRONOS_COIL_COOLDOWN_SEC = 11.0; // Segundos entre enroscos.
const KRONOS_COIL_ORBIT_R = 34.0; // Radio de la órbita alrededor del centro (m).
const KRONOS_COIL_ANG_SPEED = 0.85; // Velocidad angular de la órbita (rad/s).
const KRONOS_COIL_HEIGHT = 12.0; // Altura de la órbita sobre el centro (m).
const KRONOS_COIL_CURL = 0.14; // Encorvadura extra de los segmentos al enroscarse.
const KRONOS_COIL_SHOT_INTERVAL = 0.13; // Cadencia de la espiral de esferas (s).
const KRONOS_COIL_SHOT_DAMAGE = 9;
const KRONOS_COIL_SHOT_SPEED = 13.0;
const KRONOS_COIL_SPIRAL_STEP = 0.55; // Giro del abanico espiral entre esferas (rad).
const KRONOS_COIL_FLESH = 100; // Carne de los segmentos mientras se enrosca.
const KRONOS_ATTACK_COOLDOWN_SEC = 3.4; // Descanso entre ataques del boss (s).
export const CHARGE_CONTACT_PADDING = 1.9;

// ============================================================================
// Tipos y scratch
// ============================================================================
/** Anillo de Contención de KRONOS: onda circular expansiva visible que empuja
 * radialmente a Nyx hacia la Barrera Blanca al cruzarla. */
export interface KronosRing {
  mesh: THREE.Mesh;
  active: boolean;
  /** Centro de emisión (espacio mundo); el anillo avanza desde ahí. */
  origin: THREE.Vector3;
  /** Dirección de avance de la onda (hacia Nyx en el momento del disparo). */
  dir: THREE.Vector3;
  /** Distancia recorrida por el centro desde `origin` (m). */
  travel: number;
  /** Radio actual del anillo (m). */
  radius: number;
  /** true cuando ya empujó a Nyx (cada anillo empuja una sola vez). */
  pushed: boolean;
}

// Vectores scratch de módulo (cero allocations por frame).
const _toHome = new THREE.Vector3();
const _toEnemy = new THREE.Vector3();
const _shotDir = new THREE.Vector3();
const _lookDir = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _targetQuat = new THREE.Quaternion();
const _targetPos = new THREE.Vector3();
const _muzzlePos = new THREE.Vector3();
const _spiralDir = new THREE.Vector3();
const _ringForward = new THREE.Vector3(0, 0, 1);

// ============================================================================
// Contexto compartido con el DomeWaveManager
// ============================================================================
export interface KronosBehaviorContext {
  /** Multiplicador de velocidad de la oleada activa. */
  speedMult: number;
  /** Pool de Anillos de Contención (creado y dueñado por el manager). */
  kronosRings: KronosRing[];
  /** Dispara un proyectil del pool hacia Nyx (vive en el manager). */
  fireProjectile(
    enemy: ManagedWaveEnemy,
    playerPos: THREE.Vector3,
    kind: 'dark' | 'ink',
    damage: number,
    speed: number,
    spreadRad?: number,
    origin?: THREE.Vector3,
    dirOverride?: THREE.Vector3,
  ): void;
  /** Flotación con muelle hacia homePos (vive en el manager). */
  applyFloatMovement(
    enemy: ManagedWaveEnemy,
    internal: EnemyInternal,
    dt: number,
    elapsed: number,
  ): void;
  /** Posa un hueso del rig con euler relativo al rest pose (manager). */
  poseBone(bone: EnemyBone | null, rotX: number, rotY: number, rotZ: number): void;
}

export function updateKronosAttack(
  ctx: KronosBehaviorContext,
  enemy: ManagedWaveEnemy,
  internal: EnemyInternal,
  dt: number,
  playerPos: THREE.Vector3,
  activeSlabs: SlabCollider[] | undefined,
  onPlayerHit: (damage: number) => void,
  onGolemSmash?: (damage: number, pushDir: THREE.Vector3, pushSpeed?: number) => void,
  onSlabSmash?: (slab: SlabCollider) => void,
): void {
  internal.kronosContactCd = Math.max(0, internal.kronosContactCd - dt);

  switch (internal.kronosState) {
    case 'charge': {
      internal.kronosTimer -= dt;
      // Atraviesa a Nyx: daño por contacto con cooldown (no frena el cruze).
      if (
        internal.kronosContactCd <= 0 &&
        enemy.position.distanceTo(playerPos) < enemy.radius + CHARGE_CONTACT_PADDING
      ) {
        onPlayerHit(KRONOS_CHARGE_DAMAGE);
        internal.kronosContactCd = KRONOS_CHARGE_RECONTACT_SEC;
      }
      // Tramo Devorasuelos: todo suelo flotante cercano se rompe en escombros
      // reales agarrables por el Campo Gravitacional (vía onSlabSmash).
      if (activeSlabs && onSlabSmash) {
        for (const slab of activeSlabs) {
          if (slab.center.distanceTo(enemy.position) < KRONOS_SLAB_BREAK_RADIUS) {
            onSlabSmash(slab);
          }
        }
      }
      if (internal.kronosTimer <= 0 || enemy.position.length() > KRONOS_CHARGE_END_RADIUS) {
        internal.kronosState = 'roam';
        enemy.attackTimer = KRONOS_ATTACK_COOLDOWN_SEC / ctx.speedMult;
        enemy.homePos.copy(enemy.position);
      }
      return;
    }

    case 'rings': {
      internal.kronosTimer -= dt;
      enemy.entity.mouthOpen = true;
      if (internal.kronosTimer <= 0) {
        if (internal.kronosRingsLeft > 0) {
          emitKronosRing(ctx, enemy, internal, playerPos);
          internal.kronosRingsLeft--;
          internal.kronosTimer =
            internal.kronosRingsLeft > 0 ? KRONOS_RING_INTERVAL_SEC : KRONOS_RING_RECOVER_SEC;
        } else {
          internal.kronosState = 'roam';
          enemy.entity.mouthOpen = false;
          enemy.attackTimer = KRONOS_ATTACK_COOLDOWN_SEC / ctx.speedMult;
          enemy.homePos.copy(enemy.position);
        }
      }
      return;
    }

    case 'coil': {
      internal.kronosTimer -= dt;
      internal.kronosSpiralTimer -= dt;
      if (internal.kronosSpiralTimer <= 0) {
        fireKronosSpiralShot(ctx, enemy, internal, playerPos);
        internal.kronosSpiralTimer = KRONOS_COIL_SHOT_INTERVAL;
      }
      if (internal.kronosTimer <= 0) {
        // Fin del enrosco: los segmentos recuperan su carne habitual.
        enemy.entity.fleshThickness = internal.kronosFleshRestore;
        internal.kronosState = 'roam';
        internal.kronosCoilCooldown = KRONOS_COIL_COOLDOWN_SEC;
        enemy.attackTimer = KRONOS_ATTACK_COOLDOWN_SEC / ctx.speedMult;
        enemy.homePos.copy(enemy.position);
      }
      return;
    }

    case 'roam':
    default: {
      internal.kronosCoilCooldown = Math.max(0, internal.kronosCoilCooldown - dt);
      if (enemy.attackTimer > 0) {
        return;
      }
      const mult = ctx.speedMult;
      const belowHalf = enemy.entity.hp <= enemy.entity.maxHp * KRONOS_COIL_HP_FRACTION;
      if (belowHalf && internal.kronosCoilCooldown <= 0) {
        // Ataque 3 — Enrosco Gravitatorio: órbita + espiral + segmentos protegidos.
        internal.kronosState = 'coil';
        internal.kronosTimer = KRONOS_COIL_SEC;
        internal.kronosSpiralTimer = 0.35;
        internal.kronosFleshRestore = enemy.entity.fleshThickness;
        enemy.entity.fleshThickness = KRONOS_COIL_FLESH;
        enemy.hitFlash = Math.max(enemy.hitFlash, 0.3);
      } else if (internal.kronosAttackIndex % 2 === 0) {
        // Ataque 1 — Tramo Devorasuelos: línea directa a través de la arena.
        internal.chargeDir.subVectors(playerPos, enemy.position);
        if (internal.chargeDir.lengthSq() < 1e-4) {
          internal.chargeDir.set(0, 0, 1);
        } else {
          internal.chargeDir.normalize();
        }
        internal.chargeSpeed = KRONOS_CHARGE_SPEED * mult;
        internal.kronosState = 'charge';
        internal.kronosTimer = KRONOS_CHARGE_SEC;
        internal.kronosContactCd = 0;
        enemy.hitFlash = Math.max(enemy.hitFlash, 0.25);
      } else {
        // Ataque 2 — Anillos de Contención: fauces abiertas + ondas expansivas.
        internal.kronosState = 'rings';
        internal.kronosRingsLeft =
          KRONOS_RING_COUNT[internal.kronosAttackIndex % KRONOS_RING_COUNT.length];
        internal.kronosTimer = KRONOS_RING_TELEGRAPH_SEC;
        enemy.entity.mouthOpen = true;
        enemy.hitFlash = Math.max(enemy.hitFlash, 0.2);
      }
      internal.kronosAttackIndex++;
      return;
    }
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
    jaw.bone.getWorldPosition(_muzzlePos);
  } else {
    _muzzlePos.copy(enemy.position);
  }
  _shotDir.subVectors(playerPos, _muzzlePos);
  if (_shotDir.lengthSq() < 1e-4) {
    _shotDir.set(0, 0, 1);
  } else {
    _shotDir.normalize();
  }
  ring.active = true;
  ring.origin.copy(_muzzlePos);
  ring.dir.copy(_shotDir);
  ring.travel = 0;
  ring.radius = 1.5;
  ring.pushed = false;
  ring.mesh.position.copy(_muzzlePos);
  ring.mesh.quaternion.setFromUnitVectors(_ringForward, _shotDir);
  ring.mesh.scale.setScalar(ring.radius);
  ring.mesh.visible = true;
}

/**
 * Avanza los Anillos de Contención activos: el centro viaja hacia Nyx
 * mientras el radio crece; cuando la banda de la onda cruza a Nyx recibe un
 * fuerte empuje radial (único por anillo) hacia la Barrera Blanca — el
 * `-10 HP` lo aplica la propia Barrera al tocarla.
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
      _toEnemy.subVectors(playerPos, ring.mesh.position);
      const dist = _toEnemy.length();
      if (Math.abs(dist - ring.radius) < KRONOS_RING_HIT_BAND) {
        ring.pushed = true;
        if (dist > 1e-4) {
          _toEnemy.divideScalar(dist);
        } else {
          _toEnemy.copy(ring.dir);
        }
        onGolemSmash?.(0, _toEnemy, KRONOS_RING_PUSH_SPEED);
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

/**
 * Esfera oscura de la espiral del Enrosco: abanico que gira alrededor del
 * eje vertical de la órbita, ligeramente homing hacia Nyx para cubrir toda
 * la cúpula mientras KRONOS se enrosca.
 */
function fireKronosSpiralShot(
  ctx: KronosBehaviorContext,
  enemy: ManagedWaveEnemy,
  internal: EnemyInternal,
  playerPos: THREE.Vector3,
): void {
  internal.kronosSpiralAngle += KRONOS_COIL_SPIRAL_STEP;
  const head = internal.kronosRig?.head;
  if (head) {
    head.bone.updateWorldMatrix(true, false);
    head.bone.getWorldPosition(_muzzlePos);
  } else {
    _muzzlePos.copy(enemy.position);
  }
  _spiralDir.set(
    Math.cos(internal.kronosSpiralAngle),
    0,
    Math.sin(internal.kronosSpiralAngle),
  );
  _toEnemy.subVectors(playerPos, _muzzlePos);
  if (_toEnemy.lengthSq() > 1e-6) {
    _toEnemy.normalize();
    _spiralDir.multiplyScalar(0.8).addScaledVector(_toEnemy, 0.35).normalize();
  }
  ctx.fireProjectile(
    enemy,
    _muzzlePos,
    'dark',
    KRONOS_COIL_SHOT_DAMAGE,
    KRONOS_COIL_SHOT_SPEED * ctx.speedMult,
    0,
    _muzzlePos,
    _spiralDir,
  );
}

/**
 * Movimiento de KRONOS: embestida en línea recta (Tramo Devorasuelos),
 * órbita alrededor del centro de la cúpula (Enrosco Gravitatorio) y la
 * flotación con muelle hacia homePos del resto del tiempo.
 */
export function updateKronosMovement(
  ctx: KronosBehaviorContext,
  enemy: ManagedWaveEnemy,
  internal: EnemyInternal,
  dt: number,
  elapsed: number,
): void {
  switch (internal.kronosState) {
    case 'charge':
      // Embestida: velocidad constante en línea, sin freno ni muelle.
      enemy.velocity.copy(internal.chargeDir).multiplyScalar(internal.chargeSpeed);
      enemy.position.addScaledVector(enemy.velocity, dt);
      return;
    case 'coil': {
      // Enrosco: órbita alrededor del centro de la cúpula con bob vertical.
      internal.kronosOrbitAngle += KRONOS_COIL_ANG_SPEED * ctx.speedMult * dt;
      _targetPos.set(
        Math.cos(internal.kronosOrbitAngle) * KRONOS_COIL_ORBIT_R,
        KRONOS_COIL_HEIGHT + Math.sin(elapsed * 0.9 + enemy.phase) * 3,
        Math.sin(internal.kronosOrbitAngle) * KRONOS_COIL_ORBIT_R,
      );
      _toHome.subVectors(_targetPos, enemy.position);
      const blend = 1 - Math.exp(-2.6 * dt);
      enemy.position.addScaledVector(_toHome, blend);
      enemy.velocity.copy(_toHome).multiplyScalar(2.6);
      return;
    }
    default:
      ctx.applyFloatMovement(enemy, internal, dt, elapsed);
      return;
  }
}

/**
 * Leviatán KRONOS: ondulación serpentina progresiva de la cadena
 * `seg_01..seg_12` (yaw/pitch proporcionales a la velocidad de desplazamiento
 * para serpentear orgánicamente por la cúpula), aleteo de las aletas
 * pectorales, cabeza escrutando a Nyx y jaw que abre clarísimo durante los
 * Anillos de Contención. Las 4 Estrellas Vitales rotan vía `starCores` y
 * aquí responden al daño pulsando su brillo.
 */
export function updateKronosPose(
  ctx: KronosBehaviorContext,
  enemy: ManagedWaveEnemy,
  internal: EnemyInternal,
  dt: number,
  elapsed: number,
  playerPos: THREE.Vector3,
): void {
  const speed = enemy.velocity.length();
  const charging = internal.kronosState === 'charge';
  const coiling = internal.kronosState === 'coil';

  // Orientación: el cuerpo avanza hacia su velocidad (rígido en la embestida).
  if (speed > 2.5) {
    _lookDir.copy(enemy.velocity).divideScalar(speed);
  } else {
    _lookDir.subVectors(playerPos, enemy.position);
    if (_lookDir.lengthSq() < 1e-6) {
      _lookDir.set(0, 0, 1);
    } else {
      _lookDir.normalize();
    }
  }
  faceTowards(
    enemy.mesh,
    _lookDir,
    charging ? KRONOS_TURN_RATE_CHARGE : KRONOS_TURN_RATE,
    dt,
  );

  const rig = internal.kronosRig;
  if (!rig) {
    return;
  }

  // Onda senoidal progresiva: fase integrada (acelera sin saltos) y
  // amplitud/frecuencia proporcionales a la velocidad de desplazamiento.
  const speedFactor = THREE.MathUtils.clamp(speed / 12, 0.35, 1.6);
  const waveSpeed = KRONOS_SEG_WAVE_SPEED * (0.7 + speedFactor * 0.5) * (coiling ? 1.5 : 1);
  internal.flapPhase += waveSpeed * dt;
  const segments = rig.segments;
  for (let i = 0; i < segments.length; i++) {
    const t = internal.flapPhase + i * KRONOS_SEG_PHASE_STEP;
    const yaw = Math.sin(t) * KRONOS_SEG_YAW_AMP * speedFactor;
    const pitch = Math.cos(t * 0.8 + enemy.phase) * KRONOS_SEG_PITCH_AMP * speedFactor;
    // Enrosco: encorvadura creciente hacia la cola para enroscarse en espiral.
    const curl = coiling ? KRONOS_COIL_CURL * (i / Math.max(1, segments.length)) : 0;
    ctx.poseBone(segments[i], pitch, yaw + curl, 0);
  }

  // Aletas pectorales: aleteo orgánico independiente de la onda del cuerpo.
  const finFlap = Math.sin(elapsed * KRONOS_FIN_FLAP_SPEED + enemy.phase);
  ctx.poseBone(rig.finL, 0, 0, finFlap * KRONOS_FIN_FLAP_AMP);
  ctx.poseBone(rig.finR, 0, 0, -finFlap * KRONOS_FIN_FLAP_AMP);

  // Cabeza: vaivén escrutando a Nyx; jaw abre claro en los Anillos.
  ctx.poseBone(
    rig.head,
    Math.sin(elapsed * 1.1 + enemy.phase) * 0.05,
    Math.sin(elapsed * 0.9) * 0.07,
    0,
  );
  const jawTarget = internal.kronosState === 'rings' ? 1 : 0;
  internal.kronosJawOpen += (jawTarget - internal.kronosJawOpen) * Math.min(1, dt * 10);
  ctx.poseBone(rig.jaw, -KRONOS_JAW_OPEN_RAD * internal.kronosJawOpen, 0, 0);

  // Estrellas Vitales: pulso de brillo con el daño recibido (y al enroscarse).
  const starBoost = enemy.hitFlash * 1.5 + (coiling ? 0.7 + Math.sin(elapsed * 9) * 0.3 : 0);
  for (const material of rig.starCoreMaterials) {
    material.uniforms.uEmissiveBoost.value = STAR_CORE_EMISSIVE + starBoost;
  }
}
