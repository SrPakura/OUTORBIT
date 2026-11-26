import * as THREE from 'three';
import { DOME_PLAYER_BOUND_RADIUS, type SlabCollider } from './domeTypes';
import { resolveSphereSlabCollision, type SlabContact } from './DomeSlabs';
import type { DomeEnemyEntity } from './DomeCombatSystem';
import type { ButterflyRig } from './DomeEnemyModels';
import { faceTowards } from './domeEnemyOrient';
import type { IncomingSkillProjectile } from './domeSparrowBehavior';

// ============================================================================
// Mariposa Relámpago (`lightning_butterfly`) — Rediseño Definitivo
// ============================================================================
// Hostigadora frontal piezoeléctrica de alta evasión:
//   - Movimiento base a 10 m/s con aleteo rápido (`butterfly_fast_flap`) que
//     recarga su batería interna por piezoelectricidad.
//   - Ráfagas de 1 a 5 dashes eléctricos encadenados (0.8 s cada trazo, 0.2 s
//     de quiebro entre dashes) con cooldown obligatorio de 1.5–2.0 s entre ráfagas.
//   - IA perfecta en el presente para esquivar cualquier ataque o proyectil
//     mientras la ráfaga no esté en cooldown.
//   - Bolas Eléctricas (larga distancia · bajo coste): auto-aim proporcional a
//     la velocidad actual de Nyx ("energía llamando a energía").
//   - Rayo Eléctrico (corta distancia · alto coste/s): arco continuo desde la
//     cabeza al cuerpo de Nyx mientras mantenga energía.
// ============================================================================

export type ButterflyState =
  | 'hover'
  | 'dash'
  | 'dash_pivot'
  | 'shoot_ball'
  | 'beam'
  | 'hit';

export interface ButterflyBossState {
  state: ButterflyState;
  stateTimer: number;
  energy: number; // 0..100 (generada por el aleteo rápido piezoeléctrico)
  burstDashesLeft: number;
  burstCooldown: number; // 1.5–2.0 s tras agotar ráfaga
  dashDir: THREE.Vector3;
  dashSpeed: number;
  nextDashIndex: number;
  ballCooldown: number;
  ballFired: boolean;
  beamDamageTimer: number;
  hitTimer: number;
  hoverStrafePhase: number;
  activeClip: string | null;
  /** Rayo cercano vivo desde `head` hasta Nyx + trazo del dash eléctrico. */
  beamLine: THREE.Line | null;
  beamPosAttr: THREE.BufferAttribute | null;
  beamMat: THREE.LineBasicMaterial | null;
  dashTrailLine: THREE.Line | null;
  dashTrailAttr: THREE.BufferAttribute | null;
  dashTrailMat: THREE.LineBasicMaterial | null;
  trailOrigin: THREE.Vector3;
  trailAlpha: number;
  inScene: boolean;
}

export interface ButterflyBehaviorContext {
  scene: THREE.Scene;
  speedMult: number;
  playerVelocity: THREE.Vector3;
  playerAimForward: THREE.Vector3;
  playerAttacking: boolean;
  activeSlabs?: SlabCollider[];
  incomingProjectiles: readonly IncomingSkillProjectile[];
  onPlayerHit: (damage: number) => void;
  onElectricDashSfx?: () => void;
  onElectricBallSfx?: () => void;
  onElectricBeamSfx?: () => void;
  onBreakProjectileHoming?: (targetId: string, center: THREE.Vector3, radius: number) => void;
}

const BUTTERFLY_BOUND = DOME_PLAYER_BOUND_RADIUS - 10.0; // ~78.6 m
const BUTTERFLY_BASE_SPEED = 10.0; // m/s fuera de dashes
const BUTTERFLY_ENERGY_MAX = 100.0;
const BUTTERFLY_RECHARGE_PER_SEC = 28.0; // piezoelectricidad al aletear

const BUTTERFLY_DASH_SEC = 0.8;
const BUTTERFLY_DASH_SPEED = 35.7; // -15% de 42.0 m/s (techo de velocidad)
const BUTTERFLY_EVADE_DASH_SPEED = 45.0; // dash amplio para evadir rocas/proyectiles sin auto-aim
const BUTTERFLY_PIVOT_SEC = 0.2;
const BUTTERFLY_BURST_CD_MIN = 1.5;
const BUTTERFLY_BURST_CD_MAX = 2.0;

const BUTTERFLY_BALL_COST = 14.0;
const BUTTERFLY_BALL_DURATION = 0.45;
const BUTTERFLY_BALL_FIRE_AT = 0.16;
const BUTTERFLY_BALL_CD_MIN = 3.7;
const BUTTERFLY_BALL_CD_MAX = 4.6;
const BUTTERFLY_BALL_MIN_RANGE = 13.5;

const BUTTERFLY_BEAM_RANGE = 14.5;
const BUTTERFLY_BEAM_START_COST = 14.0;
const BUTTERFLY_BEAM_DRAIN_PER_SEC = 42.0; // alto gasto por segundo
const BUTTERFLY_BEAM_TICK_SEC = 0.42;
const BUTTERFLY_BEAM_TICK_DAMAGE = 7;

const BUTTERFLY_CLIP_FADE_SEC = 0.08;
const BEAM_SEGMENTS = 9;

// Scratch reutilizables
const _toPlayer = new THREE.Vector3();
const _toButterfly = new THREE.Vector3();
const _desiredPos = new THREE.Vector3();
const _desiredVel = new THREE.Vector3();
const _side = new THREE.Vector3();
const _upVec = new THREE.Vector3(0, 1, 0);
const _upLocal = new THREE.Vector3();
const _projDir = new THREE.Vector3();
const _threatProjDir = new THREE.Vector3();
const _diff = new THREE.Vector3();
const _headPos = new THREE.Vector3();
const _slabContact: SlabContact = {
  point: new THREE.Vector3(),
  normal: new THREE.Vector3(),
  depth: 0,
  slab: null,
};

export function createButterflyState(seedPhase: number): ButterflyBossState {
  return {
    state: 'hover',
    stateTimer: 0,
    energy: 65,
    burstDashesLeft: 0,
    burstCooldown: 0.4,
    dashDir: new THREE.Vector3(1, 0, 0),
    dashSpeed: BUTTERFLY_DASH_SPEED,
    nextDashIndex: 0,
    ballCooldown: 0.9 + (seedPhase % 1.0) * 0.6,
    ballFired: false,
    beamDamageTimer: 0,
    hitTimer: 0,
    hoverStrafePhase: seedPhase,
    activeClip: null,
    beamLine: null,
    beamPosAttr: null,
    beamMat: null,
    dashTrailLine: null,
    dashTrailAttr: null,
    dashTrailMat: null,
    trailOrigin: new THREE.Vector3(),
    trailAlpha: 0,
    inScene: false,
  };
}

function ensureButterflyVfx(state: ButterflyBossState, scene: THREE.Scene): void {
  if (state.inScene) return;
  state.inScene = true;

  const beamPts = new Float32Array((BEAM_SEGMENTS + 1) * 3);
  const beamGeo = new THREE.BufferGeometry();
  const beamPosAttr = new THREE.BufferAttribute(beamPts, 3);
  beamGeo.setAttribute('position', beamPosAttr);
  const beamMat = new THREE.LineBasicMaterial({
    color: 0x7dd3fc,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const beamLine = new THREE.Line(beamGeo, beamMat);
  beamLine.visible = false;
  beamLine.frustumCulled = false;
  scene.add(beamLine);

  const trailPts = new Float32Array(12 * 3);
  const trailGeo = new THREE.BufferGeometry();
  const dashTrailAttr = new THREE.BufferAttribute(trailPts, 3);
  trailGeo.setAttribute('position', dashTrailAttr);
  const dashTrailMat = new THREE.LineBasicMaterial({
    color: 0xa5f3fc,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const dashTrailLine = new THREE.Line(trailGeo, dashTrailMat);
  dashTrailLine.visible = false;
  dashTrailLine.frustumCulled = false;
  scene.add(dashTrailLine);

  state.beamLine = beamLine;
  state.beamPosAttr = beamPosAttr;
  state.beamMat = beamMat;
  state.dashTrailLine = dashTrailLine;
  state.dashTrailAttr = dashTrailAttr;
  state.dashTrailMat = dashTrailMat;
}

export function resetButterflyState(state: ButterflyBossState): void {
  state.state = 'hover';
  state.stateTimer = 0;
  state.energy = 65;
  state.burstDashesLeft = 0;
  state.burstCooldown = 0.5;
  state.ballFired = false;
  state.beamDamageTimer = 0;
  state.hitTimer = 0;
  state.activeClip = null;
  state.trailAlpha = 0;
  if (state.beamLine) state.beamLine.visible = false;
  if (state.dashTrailLine) state.dashTrailLine.visible = false;
}

export function disposeButterflyState(state: ButterflyBossState, scene: THREE.Scene): void {
  if (state.beamLine) {
    scene.remove(state.beamLine);
    state.beamLine.geometry.dispose();
    state.beamMat?.dispose();
    state.beamLine = null;
  }
  if (state.dashTrailLine) {
    scene.remove(state.dashTrailLine);
    state.dashTrailLine.geometry.dispose();
    state.dashTrailMat?.dispose();
    state.dashTrailLine = null;
  }
  state.inScene = false;
}

export function notifyButterflyHit(state: ButterflyBossState, entity: DomeEnemyEntity): void {
  if (!entity.alive) return;
  state.hitTimer = 0.2;
}

function playButterflyClip(
  state: ButterflyBossState,
  actions: Map<string, THREE.AnimationAction> | null,
  clipName: string,
  forceRestart = false,
): void {
  if (!actions) return;
  const next = actions.get(clipName);
  if (!next) return;
  if (state.activeClip === clipName && !forceRestart) return;

  if (state.activeClip) {
    const prev = actions.get(state.activeClip);
    if (prev && prev !== next) {
      prev.fadeOut(BUTTERFLY_CLIP_FADE_SEC);
    }
  }
  next.reset();
  next.fadeIn(BUTTERFLY_CLIP_FADE_SEC).play();
  state.activeClip = clipName;
}

function pickDashDirection(
  pos: THREE.Vector3,
  playerPos: THREE.Vector3,
  playerAimForward: THREE.Vector3,
  dashIndex: number,
  outDir: THREE.Vector3,
  avoidProjDir?: THREE.Vector3,
): void {
  if (avoidProjDir && avoidProjDir.lengthSq() > 0.5) {
    // Evasión perpendicular amplia respecto a la trayectoria del proyectil/roca entrante.
    _side.crossVectors(avoidProjDir, _upVec);
    if (_side.lengthSq() < 1e-4) _side.set(1, 0, 0);
    else _side.normalize();
    _upLocal.crossVectors(_side, avoidProjDir).normalize();
    const lateralSign = dashIndex % 2 === 0 ? 1 : -1;
    const vertSign = dashIndex % 3 === 0 ? -0.38 : 0.42;
    outDir
      .copy(_side)
      .multiplyScalar(0.9 * lateralSign)
      .addScaledVector(_upLocal, vertSign)
      .addScaledVector(avoidProjDir, 0.18);
  } else {
    _toPlayer.subVectors(playerPos, pos);
    if (_toPlayer.lengthSq() < 1e-4) _toPlayer.set(0, 0, 1);
    else _toPlayer.normalize();

    _side.crossVectors(_toPlayer, _upVec);
    if (_side.lengthSq() < 1e-4) _side.set(1, 0, 0);
    else _side.normalize();
    _upLocal.crossVectors(_side, _toPlayer).normalize();

    // Cambia drásticamente de dirección entre dashes (derecha -> izquierda -> abajo -> arriba-diagonal -> flanco).
    const pattern = dashIndex % 5;
    switch (pattern) {
      case 0: // Derecha limpia
        outDir.copy(_side).multiplyScalar(0.92).addScaledVector(_upLocal, 0.25);
        break;
      case 1: // Izquierda agresiva
        outDir.copy(_side).multiplyScalar(-0.92).addScaledVector(_upLocal, 0.3);
        break;
      case 2: // Picado abajo
        outDir.copy(_upLocal).multiplyScalar(-0.88).addScaledVector(_side, 0.42);
        break;
      case 3: // Diagonal superior contraria
        outDir.copy(_upLocal).multiplyScalar(0.84).addScaledVector(_side, -0.5);
        break;
      default: // Flanco frontal manteniendo presión delante de Nyx
        outDir.copy(playerAimForward).multiplyScalar(-0.5).addScaledVector(_side, 0.86);
        break;
    }
  }

  // Empuja ligeramente hacia el interior si está cerca del borde de la cúpula.
  if (pos.length() > BUTTERFLY_BOUND * 0.82) {
    _diff.copy(pos).multiplyScalar(-1 / Math.max(1, pos.length()));
    outDir.addScaledVector(_diff, 0.65);
  }
  outDir.normalize();
}

function detectsIncomingThreat(
  pos: THREE.Vector3,
  radius: number,
  playerPos: THREE.Vector3,
  playerVel: THREE.Vector3,
  playerAimForward: THREE.Vector3,
  playerAttacking: boolean,
  incoming: readonly IncomingSkillProjectile[],
  outThreatProjDir?: THREE.Vector3,
): boolean {
  if (outThreatProjDir) outThreatProjDir.set(0, 0, 0);

  // 1) Proyectiles / rocas / objetos lanzados dirigidos a la Mariposa (prioridad máxima).
  for (let i = 0; i < incoming.length; i++) {
    const proj = incoming[i];
    const prSpeed = proj.velocity.length();
    if (prSpeed < 1.0) continue;
    _diff.subVectors(pos, proj.position);
    const prDist = _diff.length();
    if (prDist > 58.0) continue;
    _projDir.copy(proj.velocity).multiplyScalar(1 / prSpeed);
    const along = _diff.dot(_projDir);
    if (along <= 0) continue;
    _side.copy(_diff).addScaledVector(_projDir, -along);
    if (_side.length() <= radius + 8.5) {
      if (outThreatProjDir) outThreatProjDir.copy(_projDir);
      return true;
    }
  }

  _toPlayer.subVectors(playerPos, pos);
  const dist = _toPlayer.length();
  if (dist < 1e-3) return true;
  _toButterfly.copy(_toPlayer).multiplyScalar(-1 / dist);

  // 2) Aproximación directa o ataque cuerpo a cuerpo / mira encima.
  if (dist <= 11.5) return true;
  if (playerAttacking && dist <= 32.0) {
    const aimDot = playerAimForward.dot(_toButterfly);
    if (aimDot >= 0.72) return true;
  }
  const pSpeed = playerVel.length();
  if (pSpeed >= 15.0 && dist <= 26.0) {
    const velDot = playerVel.dot(_toButterfly) / pSpeed;
    if (velDot >= 0.76) return true;
  }
  return false;
}

function startElectricDash(
  state: ButterflyBossState,
  entityId: string,
  pos: THREE.Vector3,
  velocity: THREE.Vector3,
  playerPos: THREE.Vector3,
  ctx: ButterflyBehaviorContext,
  actions: Map<string, THREE.AnimationAction> | null,
  avoidProjDir?: THREE.Vector3,
): void {
  state.state = 'dash';
  state.stateTimer = BUTTERFLY_DASH_SEC;
  const isProjectileDodge = avoidProjDir !== undefined && avoidProjDir.lengthSq() > 0.5;
  state.dashSpeed = isProjectileDodge
    ? BUTTERFLY_EVADE_DASH_SPEED
    : Math.min(35.7, BUTTERFLY_DASH_SPEED * ctx.speedMult);
  state.trailOrigin.copy(pos);
  state.trailAlpha = 1.0;

  // Rompe el auto-aim de proyectiles/rocas (salvo su propia Bola Eléctrica devuelta).
  ctx.onBreakProjectileHoming?.(entityId, pos, 65);

  pickDashDirection(
    pos,
    playerPos,
    ctx.playerAimForward,
    state.nextDashIndex,
    state.dashDir,
    avoidProjDir,
  );
  state.nextDashIndex++;
  velocity.copy(state.dashDir).multiplyScalar(state.dashSpeed);

  ctx.onElectricDashSfx?.();
  playButterflyClip(state, actions, 'butterfly_electric_dash', true);
}

function finishBurstOrCooldown(state: ButterflyBossState): void {
  if (state.burstDashesLeft > 0) {
    state.state = 'dash_pivot';
    state.stateTimer = BUTTERFLY_PIVOT_SEC;
  } else {
    // Ráfaga agotada -> cooldown obligatorio de 1.5 a 2.0 s
    state.burstCooldown =
      BUTTERFLY_BURST_CD_MIN + Math.random() * (BUTTERFLY_BURST_CD_MAX - BUTTERFLY_BURST_CD_MIN);
    state.state = 'hover';
  }
}

export function updateButterflyEnemy(
  ctx: ButterflyBehaviorContext,
  entity: DomeEnemyEntity,
  pos: THREE.Vector3,
  velocity: THREE.Vector3,
  mesh: THREE.Object3D,
  rig: ButterflyRig | null,
  actions: Map<string, THREE.AnimationAction> | null,
  state: ButterflyBossState,
  dt: number,
  elapsed: number,
  playerPos: THREE.Vector3,
  passive: boolean,
  fireElectricBall: (origin: THREE.Vector3, targetPos: THREE.Vector3) => void,
): void {
  if (dt <= 0) return;

  ensureButterflyVfx(state, ctx.scene);

  if (state.hitTimer > 0) state.hitTimer = Math.max(0, state.hitTimer - dt);
  if (state.burstCooldown > 0) state.burstCooldown = Math.max(0, state.burstCooldown - dt);
  if (state.ballCooldown > 0) state.ballCooldown = Math.max(0, state.ballCooldown - dt);

  state.hoverStrafePhase += dt * 1.9;

  // Actualiza estela del dash eléctrico.
  if (state.trailAlpha > 0 && state.dashTrailLine && state.dashTrailAttr && state.dashTrailMat) {
    state.trailAlpha = Math.max(0, state.trailAlpha - dt * 3.1);
    if (state.trailAlpha > 0.01) {
      state.dashTrailLine.visible = true;
      state.dashTrailMat.opacity = state.trailAlpha * 0.92;
      const arr = state.dashTrailAttr.array as Float32Array;
      for (let i = 0; i <= 11; i++) {
        const k = i / 11;
        const jit = i > 0 && i < 11 ? Math.sin(elapsed * 45 + i * 2.1) * 0.35 : 0;
        arr[i * 3] = THREE.MathUtils.lerp(state.trailOrigin.x, pos.x, k) + jit;
        arr[i * 3 + 1] = THREE.MathUtils.lerp(state.trailOrigin.y, pos.y, k) + jit * 0.7;
        arr[i * 3 + 2] = THREE.MathUtils.lerp(state.trailOrigin.z, pos.z, k) - jit;
      }
      state.dashTrailAttr.needsUpdate = true;
    } else {
      state.dashTrailLine.visible = false;
    }
  }

  if (passive) {
    if (state.beamLine) state.beamLine.visible = false;
    velocity.multiplyScalar(Math.exp(-4.0 * dt));
    _toPlayer.subVectors(playerPos, pos);
    if (_toPlayer.lengthSq() > 1e-4) faceTowards(mesh, _toPlayer.normalize(), 7.0, dt);
    playButterflyClip(state, actions, 'butterfly_fast_flap');
    return;
  }

  _toPlayer.subVectors(playerPos, pos);
  const distToPlayer = _toPlayer.length();
  const dirToPlayer =
    distToPlayer > 1e-4 ? _toPlayer.clone().multiplyScalar(1 / distToPlayer) : _upVec.clone();

  // Posición de cabeza / mandíbulas en mundo para disparar bolas o rayo.
  if (rig?.head) {
    rig.head.bone.updateWorldMatrix(true, false);
    rig.head.bone.getWorldPosition(_headPos);
  } else {
    _headPos.copy(pos);
  }

  // Oculta rayo si no está canalizando `'beam'`.
  if (state.state !== 'beam' && state.beamLine) {
    state.beamLine.visible = false;
  }

  if (state.hitTimer > 0 && state.state !== 'dash') {
    velocity.multiplyScalar(Math.exp(-5.0 * dt));
    pos.addScaledVector(velocity, dt);
    faceTowards(mesh, dirToPlayer, 10.0, dt);
    playButterflyClip(state, actions, 'butterfly_hit');
    return;
  }

  const mult = ctx.speedMult;
  let chargeVisual = state.energy / BUTTERFLY_ENERGY_MAX;

  switch (state.state) {
    case 'dash': {
      state.stateTimer -= dt;
      chargeVisual = 1.4;
      // Curva de aceleración eléctrica rápida + freno seco en el tramo 0.65–0.80 s.
      const progress = 1 - Math.max(0, state.stateTimer) / BUTTERFLY_DASH_SEC;
      const speedProfile = progress > 0.78 ? Math.max(0.18, (1 - progress) / 0.22) : 1.0;
      velocity.copy(state.dashDir).multiplyScalar(state.dashSpeed * speedProfile);
      pos.addScaledVector(velocity, dt);

      faceTowards(mesh, state.dashDir, 18.0, dt);
      playButterflyClip(state, actions, 'butterfly_electric_dash');

      if (state.stateTimer <= 0) {
        velocity.copy(dirToPlayer).multiplyScalar(BUTTERFLY_BASE_SPEED);
        finishBurstOrCooldown(state);
        if (state.burstDashesLeft > 0) {
          playButterflyClip(state, actions, 'butterfly_dash_pivot', true);
        }
      }
      break;
    }

    case 'dash_pivot': {
      state.stateTimer -= dt;
      chargeVisual = 1.15;
      velocity.multiplyScalar(Math.exp(-9.0 * dt));
      pos.addScaledVector(velocity, dt);
      faceTowards(mesh, dirToPlayer, 20.0, dt);
      playButterflyClip(state, actions, 'butterfly_dash_pivot');

      if (state.stateTimer <= 0) {
        if (state.burstDashesLeft > 0) {
          state.burstDashesLeft--;
          startElectricDash(state, entity.id, pos, velocity, playerPos, ctx, actions);
        } else {
          state.state = 'hover';
        }
      }
      break;
    }

    case 'shoot_ball': {
      if (
        state.burstCooldown <= 0 &&
        detectsIncomingThreat(
          pos,
          entity.radius,
          playerPos,
          ctx.playerVelocity,
          ctx.playerAimForward,
          ctx.playerAttacking,
          ctx.incomingProjectiles,
          _threatProjDir,
        )
      ) {
        state.burstDashesLeft = Math.floor(Math.random() * 4) + 1;
        startElectricDash(state, entity.id, pos, velocity, playerPos, ctx, actions, _threatProjDir);
        break;
      }

      state.stateTimer -= dt;
      chargeVisual = 1.1;
      // Recarga algo incluso al soltar y mantiene deriva suave frontal.
      velocity.lerp(_desiredVel.copy(dirToPlayer).multiplyScalar(BUTTERFLY_BASE_SPEED * 0.4), 1 - Math.exp(-4 * dt));
      pos.addScaledVector(velocity, dt);
      faceTowards(mesh, dirToPlayer, 12.0, dt);
      playButterflyClip(state, actions, 'butterfly_shoot_ball');

      const shotElapsed = BUTTERFLY_BALL_DURATION - state.stateTimer;
      if (!state.ballFired && shotElapsed >= BUTTERFLY_BALL_FIRE_AT) {
        state.ballFired = true;
        fireElectricBall(_headPos, playerPos);
        ctx.onElectricBallSfx?.();
      }

      if (state.stateTimer <= 0) {
        state.state = 'hover';
        state.ballCooldown =
          (BUTTERFLY_BALL_CD_MIN +
            Math.random() * (BUTTERFLY_BALL_CD_MAX - BUTTERFLY_BALL_CD_MIN)) /
          Math.max(1, mult * 0.9);
      }
      break;
    }

    case 'beam': {
      chargeVisual = 1.5;
      // Canaliza Rayo Eléctrico de cerca drenando mucha energía por segundo.
      state.energy = Math.max(0, state.energy - BUTTERFLY_BEAM_DRAIN_PER_SEC * dt);
      velocity.lerp(
        _desiredVel.copy(dirToPlayer).multiplyScalar(BUTTERFLY_BASE_SPEED * 0.35),
        1 - Math.exp(-5 * dt),
      );
      pos.addScaledVector(velocity, dt);
      faceTowards(mesh, dirToPlayer, 12.0, dt);
      playButterflyClip(state, actions, 'butterfly_lightning_beam');

      // Renderizar arco eléctrico irregular desde `head` hasta Nyx.
      if (state.beamLine && state.beamPosAttr) {
        state.beamLine.visible = true;
        const arr = state.beamPosAttr.array as Float32Array;
        for (let i = 0; i <= BEAM_SEGMENTS; i++) {
          const k = i / BEAM_SEGMENTS;
          const jitterAmp = i > 0 && i < BEAM_SEGMENTS ? 0.55 : 0;
          arr[i * 3] =
            THREE.MathUtils.lerp(_headPos.x, playerPos.x, k) +
            Math.sin(elapsed * 55 + i * 2.3) * jitterAmp;
          arr[i * 3 + 1] =
            THREE.MathUtils.lerp(_headPos.y, playerPos.y, k) +
            Math.cos(elapsed * 49 + i * 1.9) * jitterAmp;
          arr[i * 3 + 2] =
            THREE.MathUtils.lerp(_headPos.z, playerPos.z, k) +
            Math.sin(elapsed * 61 + i * 3.1) * jitterAmp;
        }
        state.beamPosAttr.needsUpdate = true;
      }

      state.beamDamageTimer -= dt;
      if (state.beamDamageTimer <= 0) {
        state.beamDamageTimer = BUTTERFLY_BEAM_TICK_SEC;
        ctx.onPlayerHit(BUTTERFLY_BEAM_TICK_DAMAGE);
        ctx.onElectricBeamSfx?.();
      }

      // Si Nyx amenaza fuerte o entra dash evasivo disponible -> rompe rayo y esquiva.
      if (
        state.burstCooldown <= 0 &&
        detectsIncomingThreat(
          pos,
          entity.radius,
          playerPos,
          ctx.playerVelocity,
          ctx.playerAimForward,
          ctx.playerAttacking,
          ctx.incomingProjectiles,
          _threatProjDir,
        )
      ) {
        if (state.beamLine) state.beamLine.visible = false;
        state.burstDashesLeft = Math.floor(Math.random() * 4) + 1; // 1–5 dashes totales
        startElectricDash(state, entity.id, pos, velocity, playerPos, ctx, actions, _threatProjDir);
        break;
      }

      if (state.energy <= 1.0 || distToPlayer > BUTTERFLY_BEAM_RANGE + 2.5) {
        if (state.beamLine) state.beamLine.visible = false;
        state.state = 'hover';
      }
      break;
    }

    case 'hover':
    default: {
      // Recarga piezoeléctrica continua gracias al aleteo rápido a 10 m/s.
      state.energy = Math.min(BUTTERFLY_ENERGY_MAX, state.energy + BUTTERFLY_RECHARGE_PER_SEC * dt);

      // 1) IA perfecta de esquiva (mientras NO esté en cooldown entre ráfagas).
      if (
        state.burstCooldown <= 0 &&
        detectsIncomingThreat(
          pos,
          entity.radius,
          playerPos,
          ctx.playerVelocity,
          ctx.playerAimForward,
          ctx.playerAttacking,
          ctx.incomingProjectiles,
          _threatProjDir,
        )
      ) {
        state.burstDashesLeft = Math.floor(Math.random() * 5); // + este dash = ráfaga de 1 a 5
        startElectricDash(state, entity.id, pos, velocity, playerPos, ctx, actions, _threatProjDir);
        break;
      }

      // 2) Ataque de Corta Distancia: Rayo Eléctrico si Nyx entra delante a corta distancia.
      if (distToPlayer <= BUTTERFLY_BEAM_RANGE && state.energy >= BUTTERFLY_BEAM_START_COST) {
        state.state = 'beam';
        state.beamDamageTimer = 0.08;
        break;
      }

      // 3) Ataque de Larga Distancia: Bola Eléctrica (poco gasto de energía).
      if (
        distToPlayer >= BUTTERFLY_BALL_MIN_RANGE &&
        state.ballCooldown <= 0 &&
        state.energy >= BUTTERFLY_BALL_COST
      ) {
        state.energy -= BUTTERFLY_BALL_COST;
        state.state = 'shoot_ball';
        state.stateTimer = BUTTERFLY_BALL_DURATION;
        state.ballFired = false;
        playButterflyClip(state, actions, 'butterfly_shoot_ball', true);
        break;
      }

      // 4) Hostigamiento frontal a 10 m/s en la cúpula frente a Nyx.
      _side.crossVectors(ctx.playerAimForward, _upVec);
      if (_side.lengthSq() < 1e-4) _side.set(1, 0, 0);
      else _side.normalize();

      _desiredPos
        .copy(playerPos)
        .addScaledVector(ctx.playerAimForward, 20.0)
        .addScaledVector(_side, Math.sin(state.hoverStrafePhase) * 8.0)
        .addScaledVector(_upVec, Math.cos(state.hoverStrafePhase * 0.8) * 3.5);

      const bLen = _desiredPos.length();
      if (bLen > BUTTERFLY_BOUND) _desiredPos.multiplyScalar(BUTTERFLY_BOUND / bLen);

      _diff.subVectors(_desiredPos, pos);
      const d = _diff.length();
      if (d > 1e-3) {
        _desiredVel.copy(_diff).multiplyScalar((BUTTERFLY_BASE_SPEED * mult) / d);
      } else {
        _desiredVel.set(0, 0, 0);
      }

      velocity.lerp(_desiredVel, 1 - Math.exp(-5.0 * dt));
      pos.addScaledVector(velocity, dt);
      faceTowards(mesh, dirToPlayer, 9.0, dt);
      playButterflyClip(state, actions, 'butterfly_fast_flap');
      break;
    }
  }

  // Contención suave dentro de la cúpula y rebote suave contra slabs.
  const len = pos.length();
  if (len > BUTTERFLY_BOUND) {
    _diff.copy(pos).multiplyScalar(1 / len);
    pos.copy(_diff).multiplyScalar(BUTTERFLY_BOUND);
    const out = velocity.dot(_diff);
    if (out > 0) velocity.addScaledVector(_diff, -out * 1.25);
  }
  if (
    ctx.activeSlabs &&
    resolveSphereSlabCollision(ctx.activeSlabs, pos, entity.radius, _slabContact)
  ) {
    pos.addScaledVector(_slabContact.normal, _slabContact.depth);
    const into = velocity.dot(_slabContact.normal);
    if (into < 0) velocity.addScaledVector(_slabContact.normal, -into * 1.2);
  }

  // Alimenta la carga piezoeléctrica del shader de Cuarzo Eléctrico.
  if (rig?.quartzMaterials) {
    for (let i = 0; i < rig.quartzMaterials.length; i++) {
      rig.quartzMaterials[i].uniforms.uCharge.value = chargeVisual;
    }
  }
}
