import * as THREE from 'three';
import {
  DOME_PLAYER_BOUND_RADIUS,
  type SlabCollider,
  type SlabRaycastHit,
} from './domeTypes';
import type { DomeEnemyEntity } from './DomeCombatSystem';
import { raycastSlabs, resolveSphereSlabCollision, type SlabContact } from './DomeSlabs';
import { createSparrowMirageClone, type SparrowRig } from './DomeEnemyModels';

// ============================================================================
// Gorrión Gigante (`giant_sparrow`) — Rediseño Definitivo (Oleada 5)
// ============================================================================
// Perseguidor de alta velocidad con IA perfecta en el presente (lead = 0)
// atado a inercia lineal y radio de giro aerodinámico de pájaro:
//   - Persigue la espalda de Nyx (anillo 10–18 m detrás de su cámara).
//   - Esquiva proyectiles lentos/lejanos con alabeo, pero no puede apartarse
//     de disparos a bocajarro/rápidos ni durante frenado o aturdimiento.
//   - Bolas de Aire (`air_ball`): 0 daño, 0 mancha, empuje físico de ~24 m/s.
//   - Aleteo Salvaje (`wild_flap`): da el pecho si Nyx entra de frente (≤11 m)
//     y la empuja violentamente hacia atrás (32 m/s, 0 daño).
//   - Garrido (`shriek`): chillido estridente + sacudida de cámara (~2.5 s).
//   - Dispersión (`clone_split`): si Nyx se gira para encararlo, se duplica
//     y la rodea por ambos lados siguiendo la esfera hasta reunirse detrás.
//   - Taladro de Aire (`air_drill`): si persigue +25 s sin ser frenado/golpeado,
//     gira en barrena a ~50 m/s para estampar a Nyx contra la Esfera Blanca.
//   - Frenado Rompesuelos (`hard_brake`, ~0.55 s) vs Estrellarse (`crash_stun`,
//     2.50 s con puntos débiles expuestos si se come un suelo demasiado rápido).
// ============================================================================

export type SparrowState =
  | 'pursue'
  | 'wild_flap'
  | 'shriek'
  | 'clone_split'
  | 'hard_brake'
  | 'drill_windup'
  | 'drill_dive'
  | 'crash_stun';

export interface IncomingSkillProjectile {
  readonly position: THREE.Vector3;
  readonly velocity: THREE.Vector3;
}

export interface SparrowBossState {
  state: SparrowState;
  stateTimer: number;
  /** Acumulado de persecución continua sin recibir golpe ni ejecutar Taladro. */
  chaseTimer: number;
  /** Segundos seguidos que Nyx lleva apuntando/encarando directamente al Gorrión. */
  facingTimer: number;
  airBallCooldown: number;
  airBallMouthTimer: number;
  wildFlapCooldown: number;
  wildFlapWindupTimer: number;
  wildFlapPushed: boolean;
  shriekCooldown: number;
  /** Segundos restantes de vibración de cámara local provocada por el Garrido. */
  shriekShakeTimer: number;
  cloneSplitCooldown: number;
  cloneOrbitSign: number;
  cloneRadius: number;
  cloneElapsed: number;
  cloneStartAngle: number;
  cloneBasisU: THREE.Vector3;
  cloneBasisV: THREE.Vector3;
  cloneBasisN: THREE.Vector3;
  mirageClone: THREE.Object3D | null;
  mirageInScene: boolean;
  hardBrakeCooldown: number;
  brakeSmashed: boolean;
  brakeTargetSlab: SlabCollider | null;
  brakeDir: THREE.Vector3;
  drillDir: THREE.Vector3;
  drillHitPlayer: boolean;
  hitTimer: number;
  bankRad: number;
  weavePhase: number;
  /** Escala de tiempo táctica suave (0.75x en escenas clave, 1.0 en reposo). */
  slowMoScale: number;
  activeClip: string | null;
}

export interface SparrowBehaviorContext {
  scene: THREE.Scene;
  speedMult: number;
  playerVelocity: THREE.Vector3;
  playerAimForward: THREE.Vector3;
  activeSlabs?: SlabCollider[];
  incomingProjectiles: readonly IncomingSkillProjectile[];
  onGolemSmash?: (damage: number, pushDir: THREE.Vector3, pushSpeed?: number) => void;
  onSlabSmash?: (slab: SlabCollider) => void;
  onSparrowShriek?: () => void;
}

export interface SparrowStepResult {
  crashDamage: number;
  hitFlash: number;
}

// Parámetros de vuelo aerodinámico y combate (calibrados para ser exigentes)
const SPARROW_FLIGHT_BOUND = DOME_PLAYER_BOUND_RADIUS - 11.0; // ~77.6 m
const SPARROW_REAR_RING_DIST = 14.0; // centro del anillo trasero 10–18 m
const SPARROW_CRUISE_SPEED = 29.0;
const SPARROW_BURST_CHASE_SPEED = 37.0;
const SPARROW_ACCEL = 36.0;
const SPARROW_TURN_RATE_LOW = 4.2; // rad/s a baja velocidad
const SPARROW_TURN_RATE_HIGH = 1.45; // rad/s a alta velocidad (radio amplio)

const SPARROW_DODGE_SCAN_RANGE = 42.0;
const SPARROW_DODGE_MIN_REACT_SEC = 0.32;
const SPARROW_DODGE_MAX_REACT_SEC = 1.4;
const SPARROW_DODGE_ACCEL = 58.0;

const SPARROW_AIR_BALL_CD_MIN = 1.45;
const SPARROW_AIR_BALL_CD_MAX = 2.05;
const SPARROW_AIR_BALL_SPEED = 34.0;
const SPARROW_AIR_BALL_MOUTH_SEC = 0.4;

const SPARROW_WILD_FLAP_RANGE = 11.5;
const SPARROW_WILD_FLAP_PUSH_RANGE = 13.8;
const SPARROW_WILD_FLAP_DURATION = 0.67;
const SPARROW_WILD_FLAP_PEAK_AT = 0.16;
const SPARROW_WILD_FLAP_PUSH_SPEED = 32.0;
const SPARROW_WILD_FLAP_CD = 2.5;

const SPARROW_SHRIEK_DURATION = 0.9;
const SPARROW_SHRIEK_SHAKE_SEC = 2.5;
const SPARROW_SHRIEK_CD = 8.5;

const SPARROW_SPLIT_FACING_DOT = 0.72;
const SPARROW_SPLIT_FACING_REACT_SEC = 0.16;
const SPARROW_SPLIT_MAX_RANGE = 44.0;
const SPARROW_SPLIT_DURATION = 1.15;
const SPARROW_SPLIT_CD = 6.2;

const SPARROW_DRILL_TRIGGER_SEC = 25.0;
const SPARROW_DRILL_WINDUP_SEC = 0.45;
const SPARROW_DRILL_DIVE_SEC = 1.65;
const SPARROW_DRILL_SPEED = 52.0;
const SPARROW_DRILL_ACCEL = 115.0;
const SPARROW_DRILL_STEER_RATE = 0.48;
const SPARROW_DRILL_DAMAGE = 25;
const SPARROW_DRILL_KNOCKBACK = 65.0;

const SPARROW_HARD_BRAKE_MIN_SPEED = 19.5;
const SPARROW_HARD_BRAKE_SEC = 0.56;
const SPARROW_HARD_BRAKE_SMASH_AT = 0.22;
const SPARROW_HARD_BRAKE_CD = 1.3;
const SPARROW_CRASH_STUN_SEC = 2.5;
const SPARROW_CRASH_DAMAGE = 35;

const SPARROW_HIT_CLIP_SEC = 0.27;
const SPARROW_CLIP_FADE_SEC = 0.1;

// Scratch reutilizados (cero allocations por frame)
const _toPlayer = new THREE.Vector3();
const _toSparrow = new THREE.Vector3();
const _desiredPos = new THREE.Vector3();
const _desiredDir = new THREE.Vector3();
const _desiredVel = new THREE.Vector3();
const _velDir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _side = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _lookUp = new THREE.Vector3();
const _faceDir = new THREE.Vector3();
const _muzzlePos = new THREE.Vector3();
const _dodgeVec = new THREE.Vector3();
const _projDir = new THREE.Vector3();
const _diff = new THREE.Vector3();
const _slabHit = {
  slab: null as unknown as SlabCollider,
  distance: 0,
  point: new THREE.Vector3(),
  normal: new THREE.Vector3(),
} as SlabRaycastHit;
const _slabContact: SlabContact = {
  point: new THREE.Vector3(),
  normal: new THREE.Vector3(),
  depth: 0,
  slab: null,
};
const _mat4 = new THREE.Matrix4();
const _targetQuat = new THREE.Quaternion();
const _origin = new THREE.Vector3();

export function createSparrowState(seedPhase: number): SparrowBossState {
  return {
    state: 'pursue',
    stateTimer: 0,
    chaseTimer: 0,
    facingTimer: 0,
    airBallCooldown: 1.4,
    airBallMouthTimer: 0,
    wildFlapCooldown: 0.8,
    wildFlapWindupTimer: 0,
    wildFlapPushed: false,
    shriekCooldown: 5.5,
    shriekShakeTimer: 0,
    cloneSplitCooldown: 2.0,
    cloneOrbitSign: 1,
    cloneRadius: 15,
    cloneElapsed: 0,
    cloneStartAngle: 0,
    cloneBasisU: new THREE.Vector3(1, 0, 0),
    cloneBasisV: new THREE.Vector3(0, 0, 1),
    cloneBasisN: new THREE.Vector3(0, 1, 0),
    mirageClone: null,
    mirageInScene: false,
    hardBrakeCooldown: 0,
    brakeSmashed: false,
    brakeTargetSlab: null,
    brakeDir: new THREE.Vector3(0, 0, 1),
    drillDir: new THREE.Vector3(0, 0, 1),
    drillHitPlayer: false,
    hitTimer: 0,
    bankRad: 0,
    weavePhase: seedPhase,
    slowMoScale: 1,
    activeClip: null,
  };
}

function hideMirageClone(state: SparrowBossState): void {
  if (state.mirageClone) {
    state.mirageClone.visible = false;
  }
}

export function resetSparrowState(state: SparrowBossState): void {
  state.state = 'pursue';
  state.stateTimer = 0;
  state.chaseTimer = 0;
  state.facingTimer = 0;
  state.airBallMouthTimer = 0;
  state.wildFlapWindupTimer = 0;
  state.wildFlapPushed = false;
  state.shriekShakeTimer = 0;
  state.brakeSmashed = false;
  state.brakeTargetSlab = null;
  state.drillHitPlayer = false;
  state.hitTimer = 0;
  state.bankRad = 0;
  state.slowMoScale = 1;
  state.activeClip = null;
  hideMirageClone(state);
}

export function disposeSparrowState(state: SparrowBossState, scene: THREE.Scene): void {
  if (state.mirageClone) {
    if (state.mirageInScene) {
      scene.remove(state.mirageClone);
      state.mirageInScene = false;
    }
    state.mirageClone.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        if (Array.isArray(node.material)) {
          for (const m of node.material) m.dispose();
        } else {
          node.material?.dispose();
        }
      }
    });
    state.mirageClone = null;
  }
}

export function notifySparrowHit(state: SparrowBossState, entity: DomeEnemyEntity): void {
  if (!entity.alive) return;
  state.hitTimer = SPARROW_HIT_CLIP_SEC;
  // Conectar un golpe reinicia la presión acumulada de Taladro (+25 s).
  state.chaseTimer = 0;
}

/**
 * Rota `velocity` hacia `targetVel` respetando el radio de giro aerodinámico
 * (cuanto mayor es la velocidad actual, menor la tasa angular) y la inercia
 * lineal de aceleración/frenado de un pájaro real.
 */
function steerBirdVelocity(
  velocity: THREE.Vector3,
  targetVel: THREE.Vector3,
  maxTurnRate: number,
  accel: number,
  dt: number,
): number {
  const curSpeed = velocity.length();
  const targetSpeed = targetVel.length();

  if (curSpeed < 1e-3) {
    velocity.lerp(targetVel, Math.min(1, dt * 6));
    return 0;
  }

  _velDir.copy(velocity).multiplyScalar(1 / curSpeed);
  if (targetSpeed > 1e-3) {
    _desiredDir.copy(targetVel).multiplyScalar(1 / targetSpeed);
  } else {
    _desiredDir.copy(_velDir);
  }

  // El radio de giro empeora con la velocidad (física de ala vs giro en seco).
  const speedRatio = THREE.MathUtils.clamp(curSpeed / 36.0, 0, 1);
  const effectiveTurn = THREE.MathUtils.lerp(
    maxTurnRate,
    SPARROW_TURN_RATE_HIGH,
    speedRatio * speedRatio,
  );
  const angle = _velDir.angleTo(_desiredDir);
  let turnSigned = 0;
  if (angle > 1e-4) {
    const maxAngle = effectiveTurn * dt;
    const t = Math.min(1, maxAngle / angle);
    // Medimos giro lateral para el alabeo (banking) visual.
    _right.crossVectors(_velDir, _up);
    if (_right.lengthSq() > 1e-4) {
      _right.normalize();
      turnSigned = THREE.MathUtils.clamp(_desiredDir.dot(_right) * Math.min(1, angle * 1.8), -1, 1);
    }
    _velDir.lerp(_desiredDir, t).normalize();
  }

  const nextSpeed =
    curSpeed < targetSpeed
      ? Math.min(targetSpeed, curSpeed + accel * dt)
      : Math.max(targetSpeed, curSpeed - accel * 0.72 * dt);

  velocity.copy(_velDir).multiplyScalar(nextSpeed);
  return turnSigned;
}

/**
 * IA presente del Gorrión: lee los proyectiles lanzados por Nyx en el frame
 * actual (cero predicción) y aplica un quiebro lateral de ala si tiene tiempo
 * de reacción suficiente. Si viene a bocajarro o frenando, NO puede esquivar.
 */
function computeProjectileDodge(
  pos: THREE.Vector3,
  radius: number,
  incoming: readonly IncomingSkillProjectile[],
  outDodge: THREE.Vector3,
): boolean {
  outDodge.set(0, 0, 0);
  let bestUrgency = 0;

  for (let i = 0; i < incoming.length; i++) {
    const proj = incoming[i];
    const pSpeed = proj.velocity.length();
    if (pSpeed < 1.0) continue;

    _diff.subVectors(pos, proj.position);
    const dist = _diff.length();
    if (dist > SPARROW_DODGE_SCAN_RANGE || dist < 0.5) continue;

    _projDir.copy(proj.velocity).multiplyScalar(1 / pSpeed);
    const along = _diff.dot(_projDir);
    if (along <= 0) continue; // ya pasó de largo

    const closingSec = along / pSpeed;
    // Disparos a bocajarro o ultraveloces (< 0.32 s): imposibles de esquivar.
    if (closingSec < SPARROW_DODGE_MIN_REACT_SEC || closingSec > SPARROW_DODGE_MAX_REACT_SEC) {
      continue;
    }

    // Distancia mínima de paso proyectil -> Gorrión.
    _side.copy(_diff).addScaledVector(_projDir, -along);
    const missDist = _side.length();
    if (missDist > radius + 3.4) continue;

    if (missDist > 1e-3) {
      _side.multiplyScalar(1 / missDist);
    } else {
      _side.crossVectors(_projDir, _up);
      if (_side.lengthSq() < 1e-4) _side.set(1, 0, 0);
      else _side.normalize();
    }

    const urgency = 1 / Math.max(0.2, closingSec);
    if (urgency > bestUrgency) {
      bestUrgency = urgency;
      outDodge.copy(_side);
    }
  }

  return bestUrgency > 0;
}

function enterCrashStun(
  state: SparrowBossState,
  entity: DomeEnemyEntity,
  velocity: THREE.Vector3,
  impactNormal: THREE.Vector3,
): number {
  state.state = 'crash_stun';
  state.stateTimer = SPARROW_CRASH_STUN_SEC;
  state.chaseTimer = 0;
  state.airBallMouthTimer = 0;
  state.drillHitPlayer = false;
  hideMirageClone(state);

  const into = velocity.dot(impactNormal);
  if (into < 0) {
    velocity.addScaledVector(impactNormal, -into * 1.25);
  }
  velocity.clampLength(0, 12);

  entity.vulnerableTimer = SPARROW_CRASH_STUN_SEC;
  entity.mouthOpen = true;
  return SPARROW_CRASH_DAMAGE;
}

function beginCloneSplit(
  state: SparrowBossState,
  pos: THREE.Vector3,
  playerPos: THREE.Vector3,
  playerAimForward: THREE.Vector3,
  ctx: SparrowBehaviorContext,
): void {
  state.state = 'clone_split';
  state.stateTimer = SPARROW_SPLIT_DURATION;
  state.cloneElapsed = 0;
  state.cloneSplitCooldown = SPARROW_SPLIT_CD;
  state.cloneOrbitSign = Math.random() < 0.5 ? 1 : -1;
  state.airBallMouthTimer = 0;

  _diff.subVectors(pos, playerPos);
  const rawDist = _diff.length();
  state.cloneRadius = THREE.MathUtils.clamp(rawDist, 11.5, 19.0);

  // Plano orbital sobre la esfera: eje hacia el Gorrión (Nyx->Gorrión) y
  // tangente de giro alrededor de Nyx hasta colocarse detrás (-playerAimForward).
  if (rawDist > 1e-3) {
    state.cloneBasisU.copy(_diff).multiplyScalar(1 / rawDist);
  } else {
    state.cloneBasisU.copy(playerAimForward);
  }

  // Queremos llegar a `-playerAimForward` al completar el arco de pi radianes si
  // estuviera justo en frente, así que definimos el eje perpendicular `cloneBasisV`
  // ortogonal a `cloneBasisU` con ligera inclinación esférica vertical.
  state.cloneBasisV.crossVectors(state.cloneBasisU, _up);
  if (state.cloneBasisV.lengthSq() < 1e-4) {
    state.cloneBasisV.set(1, 0, 0);
  } else {
    state.cloneBasisV.normalize();
  }
  state.cloneBasisN.crossVectors(state.cloneBasisU, state.cloneBasisV).normalize();
  state.cloneBasisV.addScaledVector(state.cloneBasisN, (Math.random() - 0.5) * 0.45).normalize();
  state.cloneStartAngle = 0;

  if (!state.mirageClone) {
    state.mirageClone = createSparrowMirageClone();
  }
  if (!state.mirageInScene) {
    ctx.scene.add(state.mirageClone);
    state.mirageInScene = true;
  }
  state.mirageClone.position.copy(pos);
  state.mirageClone.visible = true;
}

function playSparrowClip(
  state: SparrowBossState,
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
      prev.fadeOut(SPARROW_CLIP_FADE_SEC);
    }
  }
  next.reset();
  next.fadeIn(SPARROW_CLIP_FADE_SEC).play();
  state.activeClip = clipName;
}

function orientSparrowMesh(
  mesh: THREE.Object3D,
  lookDir: THREE.Vector3,
  bankRad: number,
  turnRate: number,
  dt: number,
): void {
  if (lookDir.lengthSq() < 1e-6) return;
  _faceDir.copy(lookDir).normalize();
  _right.crossVectors(_faceDir, _up);
  if (_right.lengthSq() > 1e-4) {
    _right.normalize();
    _lookUp.crossVectors(_right, _faceDir).normalize();
    _lookUp.addScaledVector(_right, Math.sin(bankRad)).normalize();
  } else {
    _lookUp.copy(_up);
  }
  _mat4.lookAt(_faceDir, _origin, _lookUp);
  _targetQuat.setFromRotationMatrix(_mat4);
  mesh.quaternion.slerp(_targetQuat, 1 - Math.exp(-turnRate * dt));
}

export function updateSparrowEnemy(
  ctx: SparrowBehaviorContext,
  entity: DomeEnemyEntity,
  pos: THREE.Vector3,
  velocity: THREE.Vector3,
  mesh: THREE.Object3D,
  rig: SparrowRig | null,
  actions: Map<string, THREE.AnimationAction> | null,
  state: SparrowBossState,
  dt: number,
  elapsed: number,
  playerPos: THREE.Vector3,
  passive: boolean,
  fireAirBall: (origin: THREE.Vector3, targetPos: THREE.Vector3, speed: number) => void,
): SparrowStepResult {
  const result: SparrowStepResult = { crashDamage: 0, hitFlash: 0 };

  if (dt <= 0) return result;

  // Enfriamientos y temporizadores compartidos.
  if (state.hitTimer > 0) state.hitTimer = Math.max(0, state.hitTimer - dt);
  if (state.airBallCooldown > 0) state.airBallCooldown = Math.max(0, state.airBallCooldown - dt);
  if (state.airBallMouthTimer > 0) state.airBallMouthTimer = Math.max(0, state.airBallMouthTimer - dt);
  if (state.wildFlapCooldown > 0) state.wildFlapCooldown = Math.max(0, state.wildFlapCooldown - dt);
  if (state.shriekCooldown > 0) state.shriekCooldown = Math.max(0, state.shriekCooldown - dt);
  if (state.shriekShakeTimer > 0) state.shriekShakeTimer = Math.max(0, state.shriekShakeTimer - dt);
  if (state.cloneSplitCooldown > 0) state.cloneSplitCooldown = Math.max(0, state.cloneSplitCooldown - dt);
  if (state.hardBrakeCooldown > 0) state.hardBrakeCooldown = Math.max(0, state.hardBrakeCooldown - dt);
  if ((entity.vulnerableTimer ?? 0) > 0) {
    entity.vulnerableTimer = Math.max(0, (entity.vulnerableTimer ?? 0) - dt);
  }

  state.weavePhase += dt * 2.1;

  if (passive) {
    hideMirageClone(state);
    state.slowMoScale = 1;
    velocity.multiplyScalar(Math.exp(-4.0 * dt));
    _toPlayer.subVectors(playerPos, pos);
    if (_toPlayer.lengthSq() > 1e-4) {
      orientSparrowMesh(mesh, _toPlayer, 0, 3.0, dt);
    }
    entity.mouthOpen = false;
    playSparrowClip(state, actions, 'sparrow_chase_fly');
    return result;
  }

  _toPlayer.subVectors(playerPos, pos);
  const distToPlayer = _toPlayer.length();
  const dirToPlayer =
    distToPlayer > 1e-4 ? _toPlayer.clone().multiplyScalar(1 / distToPlayer) : _up.clone();
  _toSparrow.copy(dirToPlayer).multiplyScalar(-1);

  const mult = ctx.speedMult;
  let targetBank = 0;

  // Detectar si Nyx se giró para encarar directamente al Gorrión (`clone_split`).
  const aimFacingDot = ctx.playerAimForward.dot(_toSparrow);
  if (
    state.state === 'pursue' &&
    aimFacingDot >= SPARROW_SPLIT_FACING_DOT &&
    distToPlayer <= SPARROW_SPLIT_MAX_RANGE
  ) {
    state.facingTimer += dt;
  } else {
    state.facingTimer = Math.max(0, state.facingTimer - dt * 2.5);
  }

  // Acumulador +25 s anti-pasividad: solo crece fuera de crash_stun/drill.
  if (state.state !== 'crash_stun' && state.state !== 'drill_windup' && state.state !== 'drill_dive') {
    state.chaseTimer += dt;
  }

  // -------------------------------------------------------------------------
  // Máquina de estados del Gorrión Gigante
  // -------------------------------------------------------------------------
  switch (state.state) {
    case 'crash_stun': {
      state.stateTimer -= dt;
      velocity.multiplyScalar(Math.exp(-3.2 * dt));
      pos.addScaledVector(velocity, dt);
      entity.mouthOpen = true;
      entity.vulnerableTimer = Math.max(entity.vulnerableTimer ?? 0, state.stateTimer);
      playSparrowClip(state, actions, 'sparrow_crash_stun');
      if (state.stateTimer <= 0) {
        state.state = 'pursue';
        entity.mouthOpen = false;
        state.hardBrakeCooldown = 0.6;
      }
      break;
    }

    case 'hard_brake': {
      state.stateTimer -= dt;
      velocity.multiplyScalar(Math.exp(-7.5 * dt));
      pos.addScaledVector(velocity, dt);
      orientSparrowMesh(mesh, state.brakeDir, 0, 7.0, dt);

      // En el pico del frenazo da un aletazo brutal que parte el suelo delante.
      const elapsedBrake = SPARROW_HARD_BRAKE_SEC - state.stateTimer;
      if (!state.brakeSmashed && elapsedBrake >= SPARROW_HARD_BRAKE_SMASH_AT) {
        state.brakeSmashed = true;
        if (state.brakeTargetSlab && ctx.onSlabSmash) {
          ctx.onSlabSmash(state.brakeTargetSlab);
        }
        state.brakeTargetSlab = null;
      }

      entity.mouthOpen = false;
      playSparrowClip(state, actions, 'sparrow_hard_brake');

      if (state.stateTimer <= 0) {
        state.state = 'pursue';
        state.hardBrakeCooldown = SPARROW_HARD_BRAKE_CD;
      }
      break;
    }

    case 'wild_flap': {
      state.stateTimer -= dt;
      state.wildFlapWindupTimer += dt;
      velocity.multiplyScalar(Math.exp(-4.8 * dt));
      pos.addScaledVector(velocity, dt);
      orientSparrowMesh(mesh, dirToPlayer, 0, 10.0, dt);

      if (!state.wildFlapPushed && state.wildFlapWindupTimer >= SPARROW_WILD_FLAP_PEAK_AT) {
        state.wildFlapPushed = true;
        if (distToPlayer <= SPARROW_WILD_FLAP_PUSH_RANGE && ctx.onGolemSmash) {
          ctx.onGolemSmash(0, dirToPlayer, SPARROW_WILD_FLAP_PUSH_SPEED);
        }
      }

      entity.mouthOpen = false;
      playSparrowClip(state, actions, 'sparrow_wild_flap');

      if (state.stateTimer <= 0) {
        state.state = 'pursue';
        state.wildFlapCooldown = SPARROW_WILD_FLAP_CD;
      }
      break;
    }

    case 'shriek': {
      state.stateTimer -= dt;
      velocity.multiplyScalar(Math.exp(-3.6 * dt));
      pos.addScaledVector(velocity, dt);
      orientSparrowMesh(mesh, dirToPlayer, 0, 9.0, dt);

      entity.mouthOpen = true;
      playSparrowClip(state, actions, 'sparrow_shriek');

      if (state.stateTimer <= 0) {
        state.state = 'pursue';
        entity.mouthOpen = false;
        state.shriekCooldown = SPARROW_SHRIEK_CD;
      }
      break;
    }

    case 'clone_split': {
      state.stateTimer -= dt;
      state.cloneElapsed += dt;
      const t = THREE.MathUtils.clamp(state.cloneElapsed / SPARROW_SPLIT_DURATION, 0, 1);
      // Curva suave 0 -> π alrededor de Nyx siguiendo recorrido esférico.
      const smoothT = t * t * (3 - 2 * t);
      const angle = smoothT * Math.PI;
      const r = state.cloneRadius;

      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle) * state.cloneOrbitSign;

      // Posición real en un lado de la esfera.
      _desiredPos
        .copy(playerPos)
        .addScaledVector(state.cloneBasisU, cosA * r)
        .addScaledVector(state.cloneBasisV, sinA * r)
        .addScaledVector(state.cloneBasisN, Math.sin(angle) * r * 0.22);

      // Si durante la Dispersión un suelo le corta el paso al real, rebota o frena.
      _desiredVel.subVectors(_desiredPos, pos).multiplyScalar(1 / Math.max(0.016, dt));
      velocity.lerp(_desiredVel, 1 - Math.exp(-16 * dt));
      pos.copy(_desiredPos);

      // Encara su arco / hacia Nyx con alabeo fuerte.
      targetBank = state.cloneOrbitSign * 0.65;
      _faceDir.subVectors(playerPos, pos);
      orientSparrowMesh(mesh, _faceDir, targetBank, 9.0, dt);

      // Clon espejismo en el lado opuesto (-sinA) convergiendo atrás.
      if (state.mirageClone) {
        state.mirageClone.visible = true;
        state.mirageClone.position
          .copy(playerPos)
          .addScaledVector(state.cloneBasisU, cosA * r)
          .addScaledVector(state.cloneBasisV, -sinA * r)
          .addScaledVector(state.cloneBasisN, -Math.sin(angle) * r * 0.22);
        _faceDir.subVectors(playerPos, state.mirageClone.position);
        orientSparrowMesh(state.mirageClone, _faceDir, -targetBank, 14.0, dt);
        state.mirageClone.scale.copy(mesh.scale);
      }

      entity.mouthOpen = false;
      playSparrowClip(state, actions, 'sparrow_chase_fly');

      if (state.stateTimer <= 0) {
        hideMirageClone(state);
        state.state = 'pursue';
        // Mantiene impulso tangencial limpio al cerrarse atrás.
        velocity.clampLength(0, SPARROW_CRUISE_SPEED);
      }
      break;
    }

    case 'drill_windup': {
      state.stateTimer -= dt;
      velocity.multiplyScalar(Math.exp(-5.0 * dt));
      pos.addScaledVector(velocity, dt);
      state.drillDir.copy(dirToPlayer);
      orientSparrowMesh(mesh, state.drillDir, 0, 12.0, dt);
      entity.mouthOpen = true;
      playSparrowClip(state, actions, 'sparrow_air_drill');

      if (state.stateTimer <= 0) {
        state.state = 'drill_dive';
        state.stateTimer = SPARROW_DRILL_DIVE_SEC;
        state.drillHitPlayer = false;
        state.chaseTimer = 0;
        velocity.copy(state.drillDir).multiplyScalar(SPARROW_DRILL_SPEED * 0.72 * mult);
      }
      break;
    }

    case 'drill_dive': {
      state.stateTimer -= dt;
      // IA perfecta en el presente (lead = 0), pero giro muy limitado por
      // inercia brutal en línea recta: ¡Nyx puede hacer que se estampe en un suelo!
      _desiredVel.copy(dirToPlayer).multiplyScalar(SPARROW_DRILL_SPEED * mult);
      steerBirdVelocity(
        velocity,
        _desiredVel,
        SPARROW_DRILL_STEER_RATE,
        SPARROW_DRILL_ACCEL * mult,
        dt,
      );
      pos.addScaledVector(velocity, dt);

      _faceDir.copy(velocity.lengthSq() > 1 ? velocity : state.drillDir);
      orientSparrowMesh(mesh, _faceDir, 0, 12.0, dt);
      entity.mouthOpen = true;
      playSparrowClip(state, actions, 'sparrow_air_drill');

      // ¿Impacto contra Nyx? Daño brutal + 65 m/s de empuje directo a la Esfera.
      if (!state.drillHitPlayer && pos.distanceTo(playerPos) < entity.radius + 1.85) {
        state.drillHitPlayer = true;
        _velDir.copy(velocity.lengthSq() > 1 ? velocity : dirToPlayer).normalize();
        ctx.onGolemSmash?.(SPARROW_DRILL_DAMAGE, _velDir, SPARROW_DRILL_KNOCKBACK);
        // Rebota ligeramente hacia arriba tras atravesar el golpe.
        velocity.multiplyScalar(-0.25);
        state.state = 'pursue';
        entity.mouthOpen = false;
        break;
      }

      // ¡Sin frenado posible durante Taladro! Chocar con un slab = CRASH STUN.
      if (
        ctx.activeSlabs &&
        resolveSphereSlabCollision(ctx.activeSlabs, pos, entity.radius * 0.9, _slabContact)
      ) {
        result.crashDamage = enterCrashStun(state, entity, velocity, _slabContact.normal);
        result.hitFlash = 1.25;
        if (_slabContact.slab && ctx.onSlabSmash) {
          ctx.onSlabSmash(_slabContact.slab);
        }
        break;
      }

      if (state.stateTimer <= 0) {
        state.state = 'pursue';
        entity.mouthOpen = false;
      }
      break;
    }

    case 'pursue':
    default: {
      // 1) Castigo +25 s: si ha perseguido tanto tiempo sin éxito -> Taladro.
      if (state.chaseTimer >= SPARROW_DRILL_TRIGGER_SEC) {
        state.state = 'drill_windup';
        state.stateTimer = SPARROW_DRILL_WINDUP_SEC;
        state.airBallMouthTimer = 0;
        break;
      }

      // 2) Dispersión: Nyx se gira para encararlo frontalmente.
      if (state.facingTimer >= SPARROW_SPLIT_FACING_REACT_SEC && state.cloneSplitCooldown <= 0) {
        state.facingTimer = 0;
        beginCloneSplit(state, pos, playerPos, ctx.playerAimForward, ctx);
        break;
      }

      // 3) Aleteo Salvaje: Nyx entra en ≤ 11.5 m delante del Gorrión.
      if (
        distToPlayer <= SPARROW_WILD_FLAP_RANGE &&
        state.wildFlapCooldown <= 0
      ) {
        state.state = 'wild_flap';
        state.stateTimer = SPARROW_WILD_FLAP_DURATION;
        state.wildFlapWindupTimer = 0;
        state.wildFlapPushed = false;
        break;
      }

      // 4) Garrido periódico desorientador.
      if (
        state.shriekCooldown <= 0 &&
        distToPlayer >= 11.0 &&
        distToPlayer <= 44.0
      ) {
        state.state = 'shriek';
        state.stateTimer = SPARROW_SHRIEK_DURATION;
        state.shriekShakeTimer = SPARROW_SHRIEK_SHAKE_SEC;
        ctx.onSparrowShriek?.();
        break;
      }

      // 5) Objetivo de persecución: anillo trasero 10–18 m a la espalda de Nyx.
      // Cero predicción futura (lead = 0): solo usa `playerPos` y cámara actual.
      _side.crossVectors(ctx.playerAimForward, _up);
      if (_side.lengthSq() < 1e-4) _side.set(1, 0, 0);
      else _side.normalize();

      const weaveLateral = Math.sin(state.weavePhase) * 4.5;
      const weaveVert = Math.cos(state.weavePhase * 0.7) * 2.4;
      _desiredPos
        .copy(playerPos)
        .addScaledVector(ctx.playerAimForward, -SPARROW_REAR_RING_DIST)
        .addScaledVector(_side, weaveLateral)
        .addScaledVector(_up, weaveVert + 1.5);

      // Clamp dentro de la cúpula segura.
      const boundLen = _desiredPos.length();
      if (boundLen > SPARROW_FLIGHT_BOUND) {
        _desiredPos.multiplyScalar(SPARROW_FLIGHT_BOUND / boundLen);
      }

      _desiredDir.subVectors(_desiredPos, pos);
      const offsetDist = _desiredDir.length();
      const targetSpeed =
        (offsetDist > 20 ? SPARROW_BURST_CHASE_SPEED : SPARROW_CRUISE_SPEED) * mult;
      if (offsetDist > 1e-3) {
        _desiredVel.copy(_desiredDir).multiplyScalar(targetSpeed / offsetDist);
      } else {
        _desiredVel.copy(dirToPlayer).multiplyScalar(SPARROW_CRUISE_SPEED * 0.45);
      }

      // Esquiva presente de proyectiles lentos/lejanos mediante alabeo.
      const dodging = computeProjectileDodge(
        pos,
        entity.radius,
        ctx.incomingProjectiles,
        _dodgeVec,
      );
      if (dodging) {
        _desiredVel.addScaledVector(_dodgeVec, SPARROW_DODGE_ACCEL * mult);
      }

      const turnSign = steerBirdVelocity(
        velocity,
        _desiredVel,
        SPARROW_TURN_RATE_LOW,
        SPARROW_ACCEL * mult,
        dt,
      );
      targetBank = dodging ? THREE.MathUtils.clamp(_dodgeVec.dot(_side) * 0.85, -0.85, 0.85) : turnSign * 0.55;

      // 6) Mira hacia delante para Frenado Rompesuelos vs Estrellarse contra slab.
      const curSpeed = velocity.length();
      if (ctx.activeSlabs && curSpeed >= SPARROW_HARD_BRAKE_MIN_SPEED) {
        _velDir.copy(velocity).multiplyScalar(1 / curSpeed);
        const emergencyDist = curSpeed * 0.25 + entity.radius;
        const brakeDist = curSpeed * 0.56 + entity.radius;
        const ahead = raycastSlabs(ctx.activeSlabs, pos, _velDir, brakeDist, _slabHit);
        if (ahead && ahead.slab) {
          if (ahead.distance <= emergencyDist) {
            // Demasiado cerca a demasiada velocidad: ¡se estrella sin poder frenar!
            pos.addScaledVector(velocity, dt);
            result.crashDamage = enterCrashStun(state, entity, velocity, _slabHit.normal);
            result.hitFlash = 1.25;
            break;
          } else if (state.hardBrakeCooldown <= 0) {
            // Ve el suelo con el margen de ~0.55 s: entra en Frenado Rompesuelos.
            state.state = 'hard_brake';
            state.stateTimer = SPARROW_HARD_BRAKE_SEC;
            state.brakeSmashed = false;
            state.brakeTargetSlab = ahead.slab;
            state.brakeDir.copy(pos).sub(ahead.point).negate();
            if (state.brakeDir.lengthSq() < 1e-4) state.brakeDir.copy(_velDir);
            else state.brakeDir.normalize();
            break;
          }
        }
      }

      pos.addScaledVector(velocity, dt);

      // Si impacta físicamente un slab a alta velocidad en persecución -> crash.
      if (
        ctx.activeSlabs &&
        resolveSphereSlabCollision(ctx.activeSlabs, pos, entity.radius, _slabContact)
      ) {
        const intoSpeed = -velocity.dot(_slabContact.normal);
        if (intoSpeed >= SPARROW_HARD_BRAKE_MIN_SPEED) {
          result.crashDamage = enterCrashStun(state, entity, velocity, _slabContact.normal);
          result.hitFlash = 1.25;
          break;
        }
        // Impacto lento: empujón suave fuera del slab.
        pos.addScaledVector(_slabContact.normal, _slabContact.depth);
        if (intoSpeed > 0) {
          velocity.addScaledVector(_slabContact.normal, intoSpeed * 1.2);
        }
      }

      // 7) Disparo base de Bola de Aire (`air_ball`) desde la boca (0 daño, solo empuje).
      if (state.airBallCooldown <= 0 && distToPlayer >= 8.5 && distToPlayer <= 65.0) {
        if (rig?.jaw) {
          rig.jaw.bone.updateWorldMatrix(true, false);
          rig.jaw.bone.getWorldPosition(_muzzlePos);
        } else {
          _muzzlePos.copy(pos);
        }
        fireAirBall(_muzzlePos, playerPos, SPARROW_AIR_BALL_SPEED * mult);
        state.airBallMouthTimer = SPARROW_AIR_BALL_MOUTH_SEC;
        state.airBallCooldown =
          (SPARROW_AIR_BALL_CD_MIN +
            Math.random() * (SPARROW_AIR_BALL_CD_MAX - SPARROW_AIR_BALL_CD_MIN)) /
          Math.max(1, mult * 0.9);
      }

      entity.mouthOpen = state.airBallMouthTimer > 0;
      _faceDir.copy(distToPlayer < 22 ? dirToPlayer : curSpeed > 6 ? velocity : dirToPlayer);
      orientSparrowMesh(mesh, _faceDir, targetBank, 5.5, dt);

      // Clip activo según flinch / disparo / vuelo.
      if (state.hitTimer > 0) {
        playSparrowClip(state, actions, 'sparrow_hit');
      } else if (state.airBallMouthTimer > 0) {
        playSparrowClip(state, actions, 'sparrow_air_ball');
      } else {
        playSparrowClip(state, actions, 'sparrow_chase_fly');
      }
      break;
    }
  }

  // Contención suave dentro de la cúpula.
  const posLen = pos.length();
  if (posLen > SPARROW_FLIGHT_BOUND) {
    _velDir.copy(pos).multiplyScalar(1 / posLen);
    pos.copy(_velDir).multiplyScalar(SPARROW_FLIGHT_BOUND);
    const outVel = velocity.dot(_velDir);
    if (outVel > 0) {
      velocity.addScaledVector(_velDir, -outVel * 1.3);
    }
  }

  state.bankRad += (targetBank - state.bankRad) * Math.min(1, dt * 8);

  // Cámara lenta táctica leve (0.75x) en las escenas clave de lectura/reflejo:
  // Dispersión, Frenado Rompesuelos, Aleteo Salvaje, Taladro cercano e impacto.
  const postDist = pos.distanceTo(playerPos);
  const slowMoScene =
    state.state === 'clone_split' ||
    state.state === 'hard_brake' ||
    state.state === 'wild_flap' ||
    state.state === 'drill_windup' ||
    (state.state === 'drill_dive' && postDist <= 30.0) ||
    (state.state === 'crash_stun' && state.stateTimer >= SPARROW_CRASH_STUN_SEC - 0.75);
  const targetSlowMo = slowMoScene ? 0.75 : 1.0;
  state.slowMoScale += (targetSlowMo - state.slowMoScale) * Math.min(1, dt * 16);

  // Brillo del `star_core_mouth`: arde al abrir el pico (Garrido / Taladro / Crash Stun).
  if (rig?.mouthStarMaterial) {
    const stunnedPulse =
      state.state === 'crash_stun' ? 1.55 + Math.sin(elapsed * 14) * 0.45 : 0;
    const drillGlow = state.state === 'drill_windup' || state.state === 'drill_dive' ? 1.3 : 0;
    const activeGlow = Math.max(stunnedPulse, drillGlow, entity.mouthOpen ? 1.4 : 0.25);
    rig.mouthStarMaterial.uniforms.uEmissiveBoost.value = activeGlow;
  }

  return result;
}
