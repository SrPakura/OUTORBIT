import * as THREE from 'three';
import {
  DOME_PLAYER_BOUND_RADIUS,
  RETICLE_BREAK_RADIUS_PX,
  RETICLE_LOCK_RADIUS_PX,
  type DomeHudState,
  type NyxMovementMode,
  type ReticleLockState,
  type SlabCollider,
  type SpeedAttackKind,
  type TestEnemySphere,
} from '@/game/dome/domeTypes';
import {
  raycastSlabs,
  resolveSphereSlabCollision,
  updateSlabMotion,
  type SlabContact,
} from '@/game/dome/DomeSlabs';
import { NyxAnimator, type NyxAnimState } from '@/game/render/nyxAnimator';
import { MotionVfxSystem } from '@/game/dome/MotionVfx';
import {
  formatKeyCode,
  resolveActionCodes,
  type ControlAction,
  type GameSettings,
} from '@/game/settings';
import type { SynthAudio } from '@/game/audio/SynthAudio';

// ============================================================================
// NyxDomeController — movimiento, física espacial, cámara y ataques de Nyx
// dentro de la cúpula de 50 m, según el diseño exacto de la bóveda.
//
// Modos (NyxMovementMode):
//  - 'grounded'     Adherida a cualquier SlabCollider (suelo, pared o techo).
//                   Cámara LIBRE 360° con dos ángulos escalares (camYaw/camPitch)
//                   sobre un marco ortonormal transportado en paralelo: jamás se
//                   invierte. Espacio = despegue suave a flotación 0G.
//  - 'floating'    Flotación 0G SIN gravedad: inercia espacial real (rozamiento
//                   ~nulo), WASD acelera hacia la cámara (1.0 Edén/s), la cámara
//                   va pegada a la espalda y el cuerpo gira con desfase elástico
//                   limitado por la física centrípeta 1/(1+speed*0.11).
//  - 'dashing'      Clic Derecho (3.0 Edén): 0.38 s a ~32 m/s según WASD,
//                   redirigible en vivo con el ratón.
//  - 'speed_attack' Clic Izquierdo (2.0 Edén/s): patada con lock-in al enemigo
//                   de la mira (gravity_kick / spiral_drill_kick según
//                   accelTimeSec >= 1.5 s) o Caída al Vacío (void_fall) sin
//                   enemigo. Dash lateral/trasero para cortar vector y
//                   Espacio para cancelar en 1-3 kick_flip.
//  - 'kick_recover' Frenado suave encadenando kick_flip.
//
// Economía de Edén (base 100): flotar sin WASD 0/s (+1.0/s de regeneración si
// velocidad < 1.5 m/s sin input), WASD 1.0/s, Dash 3.0 de golpe, Ataque 2.0/s.
//
// Lock-In del visor: enemigo más cercano al centro de la mira a <= 200 px
// (can_lock); se rompe a > 500 px o si queda detrás → Cámara Lenta real de
// 1.25 s (timeScale 0.22) para reaccionar.
// ============================================================================

const DEG = Math.PI / 180;

// --- Suelo (cualquier SlabCollider: suelo, pared o techo)
const PLAYER_RADIUS = 0.45;
const GRAVITY = 22; // solo como fuerza de adherencia al suelo
const WALK_SPEED = 4.6;
const RUN_SPEED = 8.6;
const SLIDE_SPEED = 11.5;
const GROUND_ACCEL_LAMBDA = 10;
const GROUND_STICK_RANGE = 0.35;
const WALL_FLIP_ANGLE = 45 * DEG;
const LAND_RECOVER_SPEED = 12;
const JUMP_LAND_SPEED = 3;
const FLOAT_ENTRY_OFFSET = 0.65;
const FLOAT_ENTRY_SPEED = 3.0;

// --- Flotación 0G
const FLOAT_ACCEL = 13;
const FLOAT_MAX_SPEED = 28;
const FLOAT_DRAG = 0.06; // exp(-0.06*dt): conserva ~95% de la velocidad por segundo
const CENTRIPETAL_SPEED_K = 0.11; // centripetalFactor = 1/(1+speed*0.11)
const BODY_TURN_RATE = 10;
const VEL_ALIGN_RATE = 4.0;

// --- Dash (Clic Derecho)
const DASH_SPEED = 32;
const DASH_DURATION = 0.38;
const DASH_TURN_RATE = 5.0;
const DASH_SIDE_SPEED = 24;
const DASH_BACK_IMPULSE = 12;

// --- Ataque de Velocidad (Clic Izquierdo)
const ATTACK_ACCEL = 11;
const ATTACK_MIN_SPEED = 24;
const SPIRAL_MIN_SPEED = 28;
const ATTACK_MAX_SPEED = 34;
const AUTO_AIM_TURN = 2.8; // maxTurnRate = 2.8/(1+speed*0.04) rad/s
const AUTO_AIM_SPEED_K = 0.04;
const KICK_FLIP_SPEED_2 = 18;
const KICK_FLIP_SPEED_3 = 28;
const ACCEL_TIME_DRILL = 1.5; // s de aceleración -> isDrillReady
const ACCEL_TIME_DECAY = 1.1;
const ACCEL_TIME_HOLD_SPEED = 20; // por debajo de esto, sin acelerar, decae

// --- Economía de Edén
const EDEN_MOVE_DRAIN = 1.0;
const EDEN_DASH_COST = 3.0;
const EDEN_ATTACK_DRAIN = 2.0;
const EDEN_IDLE_REGEN_FRAC = 0.01; // 1% de maxEden por segundo
const IDLE_REGEN_MAX_SPEED = 1.5;

// --- Cámara Lenta (Bullet-Time)
const BULLET_TIME_SCALE = 0.22;
const BULLET_TIME_DURATION = 1.25;

// --- Cámara
const CAM_PITCH_LIMIT = 1.15;
const AIM_PITCH_MAX_DOT = 0.985;
const CAM_DISTANCE = 6.2;
const CAM_LOOK_HEIGHT = 1.35;
const FOV_SPEED_REF = 32;
const FOV_BOOST = 20;

const DOME_BOUNCE_DAMAGE = 10;

type HitEnemyCallback = (
  enemy: TestEnemySphere,
  hitDir: THREE.Vector3,
  isDrill: boolean,
) => void;

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

export class NyxDomeController {
  // --- Dependencias
  private readonly nyxRoot: THREE.Group;
  private readonly animator: NyxAnimator;
  private readonly vfx: MotionVfxSystem;
  private readonly audio: SynthAudio | undefined;
  private settings!: GameSettings;

  // --- Entrada
  private readonly codesDown = new Set<string>();
  private readonly actionByCode = new Map<string, ControlAction>();
  private pointerLocked = false;
  private wantJump = false;
  private wantDash = false;
  private wantAttack = false;
  private wantSlot: 1 | 2 | 3 | null = null;
  private activeSlot: 1 | 2 | 3 = 1;

  // --- Física / estado
  private readonly velocity = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly facing = new THREE.Vector3(0, 0, -1);
  private readonly groundNormal = new THREE.Vector3(0, 1, 0);
  private readonly groundFwd = new THREE.Vector3(0, 0, -1);
  private readonly aimForward = new THREE.Vector3(0, 0, -1);
  private readonly aimUp = new THREE.Vector3(0, 1, 0);
  private readonly prevAimFwd = new THREE.Vector3(0, 0, -1);
  private readonly dashDir = new THREE.Vector3(0, 0, -1);
  private mode: NyxMovementMode = 'floating';
  private isSliding = false;
  private readonly contact: SlabContact = {
    slab: null,
    normal: new THREE.Vector3(),
    depth: 0,
    point: new THREE.Vector3(),
  };

  // --- Cámara de suelo (ángulos escalares: NUNCA se invierte)
  private camYaw = 0;
  private camPitch = 0;

  // --- Temporizadores
  private time = 0;
  private dashTimer = 0;
  private dashSpeed = DASH_SPEED;
  private flipsTotal = 0;
  private flipsPlayed = 0;
  private bounceCooldown = 0;
  private bulletTimeTimer = 0;
  private animLock: NyxAnimState | null = null;

  // --- Aceleración sostenida (isDrillReady a partir de 1.5 s)
  private accelTimeSec = 0;

  // --- Ataque de velocidad / lock-in
  private speedAttackKind: SpeedAttackKind | null = null;
  private lockedEnemy: TestEnemySphere | null = null;
  private candidateEnemy: TestEnemySphere | null = null;
  private reticleLockState: ReticleLockState = 'none';
  private readonly lockedScreenPos = { x: 0, y: 0 };
  private lockedEnemyScreenPos: { x: number; y: number } | null = null;

  // --- Recursos
  private hp = 100;
  private readonly maxHp = 100;
  private eden = 100;
  private readonly maxEden = 100;
  private readonly level = 1;
  private readonly exp = 0;
  private readonly expToNext = 100;
  private domeBounceFlash = 0;
  private shake = 0;

  // --- Scratch (ninguno vive más allá de un helper o de un tramo de update)
  private readonly camFwd = new THREE.Vector3();
  private readonly camRight = new THREE.Vector3();
  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();
  private readonly tmpC = new THREE.Vector3();
  private readonly tmpD = new THREE.Vector3();
  private readonly tmpE = new THREE.Vector3();
  private readonly tmpAxis = new THREE.Vector3();
  private readonly screenPos = { x: 0, y: 0 };
  private readonly quat = new THREE.Quaternion();
  private readonly quatB = new THREE.Quaternion();
  private readonly mat = new THREE.Matrix4();
  private turnRate = 0;

  constructor(
    nyxRoot: THREE.Group,
    animator: NyxAnimator,
    vfx: MotionVfxSystem,
    settings: GameSettings,
    audio?: SynthAudio,
  ) {
    this.nyxRoot = nyxRoot;
    this.animator = animator;
    this.vfx = vfx;
    this.audio = audio;
    this.applySettings(settings);
    // Estado inicial: flotando en 0G donde la escena haya colocado a Nyx.
    this.animator.setState('zero_g_float');
  }

  // ==========================================================================
  // API pública
  // ==========================================================================

  applySettings(settings: GameSettings): void {
    this.settings = settings;
    const resolved = resolveActionCodes(settings.bindings);
    this.actionByCode.clear();
    for (const action of Object.keys(resolved) as ControlAction[]) {
      for (const code of resolved[action]) this.actionByCode.set(code, action);
    }
  }

  /** Escala de tiempo del mundo: 0.22 en cámara lenta, 1.0 normalmente. */
  getTimeScale(): number {
    return this.bulletTimeTimer > 0 ? BULLET_TIME_SCALE : 1.0;
  }

  /**
   * El motor de enemigos llama aquí cuando el enemigo lockeado hace un dash
   * evasivo: rompe el lock-in y activa la cámara lenta (1.25 s reales).
   */
  notifyEnemyEvaded(): void {
    this.bulletTimeTimer = BULLET_TIME_DURATION;
    if (this.lockedEnemy) this.breakLock(true);
  }

  onMouseMove(dx: number, dy: number): void {
    if (!this.pointerLocked) return;
    const sens = 0.0023 * this.settings.mouseSensitivity;
    const pitch = -dy * sens * (this.settings.invertY ? -1 : 1);

    if (this.mode === 'grounded') {
      // Cámara libre 360°: dos ángulos escalares sobre el marco del suelo.
      // dx > 0 (derecha) gira la vista a la derecha alrededor de this.up.
      this.camYaw -= dx * sens;
      // dy < 0 (arriba) mira hacia arriba; dy > 0 (abajo) mira hacia abajo.
      this.camPitch = THREE.MathUtils.clamp(this.camPitch + pitch, -CAM_PITCH_LIMIT, CAM_PITCH_LIMIT);
      return;
    }

    // En vuelo la cámara va pegada a la espalda: el ratón gira la mira objetivo
    // (aimForward) y el cuerpo se alinea detrás con desfase elástico.
    this.quat.setFromAxisAngle(this.aimUp, -dx * sens);
    this.aimForward.applyQuaternion(this.quat);
    this.tmpAxis.crossVectors(this.aimForward, this.aimUp);
    if (this.tmpAxis.lengthSq() > 1e-6) {
      this.tmpAxis.normalize();
      this.quat.setFromAxisAngle(this.tmpAxis, pitch);
      this.aimForward.applyQuaternion(this.quat);
    }
    this.aimForward.normalize();
    // Límite de pitch: deja mirar casi el cenit sin cruzar el polo.
    const d = this.aimForward.dot(this.aimUp);
    if (d > AIM_PITCH_MAX_DOT) {
      this.aimForward.addScaledVector(this.aimUp, AIM_PITCH_MAX_DOT - d).normalize();
    }
  }

  onMouseDown(button: number): void {
    if (!this.pointerLocked) return;
    if (button === 0) this.wantAttack = true;
    else if (button === 2) this.wantDash = true;
  }

  onKeyDown(code: string): void {
    if (this.codesDown.has(code)) return; // ignora auto-repeat
    this.codesDown.add(code);
    const action = this.actionByCode.get(code);
    if (action === 'jump') this.wantJump = true;
    else if (action === 'slot1') this.wantSlot = 1;
    else if (action === 'slot2') this.wantSlot = 2;
    else if (action === 'slot3') this.wantSlot = 3;
  }

  onKeyUp(code: string): void {
    this.codesDown.delete(code);
  }

  setPointerLocked(locked: boolean): void {
    this.pointerLocked = locked;
    if (!locked) this.codesDown.clear();
  }

  getPosition(): THREE.Vector3 {
    return this.nyxRoot.position;
  }

  getLockedEnemy(): TestEnemySphere | null {
    return this.lockedEnemy;
  }

  getAttackAccelTime(): number {
    return this.mode === 'speed_attack' ? this.accelTimeSec : 0;
  }

  getHudState(): DomeHudState {
    const speed = this.velocity.length();
    return {
      hp: this.hp,
      maxHp: this.maxHp,
      eden: this.eden,
      maxEden: this.maxEden,
      exp: this.exp,
      expToNext: this.expToNext,
      level: this.level,
      speed,
      accelTimeSec: this.accelTimeSec,
      drillThreshold: ACCEL_TIME_DRILL,
      isDrillReady: this.accelTimeSec >= ACCEL_TIME_DRILL,
      speedLinesIntensity: clamp01((speed - 10) / 16),
      mode: this.mode,
      speedAttackKind: this.mode === 'speed_attack' ? this.speedAttackKind : null,
      pointerLocked: this.pointerLocked,
      reticleLockState: this.reticleLockState,
      lockedEnemyScreenPos: this.lockedEnemyScreenPos,
      bulletTimeActive: this.bulletTimeTimer > 0,
      bulletTimeRemaining: this.bulletTimeTimer,
      activeSlot: this.activeSlot,
      slots: [
        { keyLabel: formatKeyCode(this.settings.bindings.slot1), name: null, level: 0 },
        { keyLabel: formatKeyCode(this.settings.bindings.slot2), name: null, level: 0 },
        { keyLabel: formatKeyCode(this.settings.bindings.slot3), name: null, level: 0 },
      ],
      domeBounceFlash: this.domeBounceFlash,
    };
  }

  // ==========================================================================
  // Bucle principal
  // ==========================================================================

  update(
    dt: number,
    slabs: SlabCollider[],
    camera: THREE.PerspectiveCamera,
    enemies?: TestEnemySphere[],
    onHitEnemy?: HitEnemyCallback,
  ): void {
    // La cámara lenta descuenta TIEMPO REAL: bulletTimeTimer baja con rawDt
    // para durar 1.25 s de reloj, mientras el mundo se simula a timeScale.
    const rawDt = Math.min(dt, 0.05);
    const sdt = rawDt * this.getTimeScale();
    if (this.bulletTimeTimer > 0) {
      this.bulletTimeTimer = Math.max(0, this.bulletTimeTimer - rawDt);
    }
    this.time += sdt;
    updateSlabMotion(slabs, this.time);

    // --- Decaimientos
    if (this.bounceCooldown > 0) this.bounceCooldown -= sdt;
    if (this.domeBounceFlash > 0) {
      this.domeBounceFlash = Math.max(0, this.domeBounceFlash - sdt * 2.2);
    }
    this.shake *= Math.exp(-6 * sdt);

    // --- Base de cámara del frame (dirección de mira según el modo)
    this.computeCameraBasis();

    // --- Entrada de movimiento
    const f = (this.isDown('forward') ? 1 : 0) - (this.isDown('back') ? 1 : 0);
    const r = (this.isDown('right') ? 1 : 0) - (this.isDown('left') ? 1 : 0);
    const hasMoveInput = f !== 0 || r !== 0;
    const sprintHeld = this.isDown('sprint');

    // --- Mira: detección de enemigo en el visor (lock / break)
    this.updateReticle(camera, enemies);

    // --- Acciones encoladas por los eventos
    if (this.wantSlot !== null) {
      this.activeSlot = this.wantSlot;
      this.wantSlot = null;
    }
    if (this.wantJump) {
      this.wantJump = false;
      this.handleJump();
    }
    if (this.wantDash) {
      this.wantDash = false;
      this.handleDash(f, r);
    }
    if (this.wantAttack) {
      this.wantAttack = false;
      this.handleAttack();
    }

    // --- Física por modo
    switch (this.mode) {
      case 'grounded':
        this.updateGrounded(sdt, f, r, sprintHeld, hasMoveInput);
        break;
      case 'floating':
        this.updateFloating(sdt, f, r);
        break;
      case 'dashing':
        this.updateDashing(sdt);
        break;
      case 'speed_attack':
        this.updateSpeedAttack(sdt, onHitEnemy);
        break;
      case 'kick_recover':
        this.updateKickRecover(sdt);
        break;
    }

    // --- Integración
    this.nyxRoot.position.addScaledVector(this.velocity, sdt);

    // --- Colisiones con slabs (aterrizaje en cualquier superficie) y cúpula
    this.resolveGround(slabs);
    this.resolveDomeBound();

    const speed = this.velocity.length();

    // --- Marco de vuelo (transporte paralelo) + orientación del cuerpo
    this.updateFlightFrame();
    this.updateOrientation(sdt, speed);

    // --- Animación, acelerómetro y recursos
    this.updateAnimState(speed, hasMoveInput);
    this.updateAccelTime(sdt, f, speed);
    this.updateEden(sdt, hasMoveInput, speed);

    // --- Cámara
    this.updateCamera(sdt, slabs, camera, speed);

    // --- Animador y VFX
    const hairG = this.mode === 'grounded' ? -1 : -0.25;
    this.animator.update(sdt, {
      speed01: clamp01(speed / RUN_SPEED),
      turnRate: this.turnRate,
      verticalVel: this.velocity.dot(this.up),
      hairGravityLocal: [0, hairG, 0],
    });
    this.vfx.update(sdt);
  }

  // ==========================================================================
  // Base de cámara del frame
  // ==========================================================================

  private computeCameraBasis(): void {
    if (this.mode === 'grounded') {
      // Cámara libre: yaw alrededor de this.up + pitch alrededor del eje
      // derecho del marco del suelo. Ángulos escalares: nunca se invierte.
      this.camFwd.copy(this.groundFwd);
      this.quat.setFromAxisAngle(this.up, this.camYaw);
      this.camFwd.applyQuaternion(this.quat);
      this.tmpD.crossVectors(this.camFwd, this.up);
      if (this.tmpD.lengthSq() > 1e-6) {
        this.tmpD.normalize();
        this.quat.setFromAxisAngle(this.tmpD, this.camPitch);
        this.camFwd.applyQuaternion(this.quat);
      }
      this.camFwd.normalize();
      this.camRight.crossVectors(this.camFwd, this.up).normalize();
    } else {
      // Cámara pegada a la espalda: mira hacia aimForward.
      this.camFwd.copy(this.aimForward);
      this.camRight.crossVectors(this.camFwd, this.aimUp).normalize();
    }
  }

  // ==========================================================================
  // Mira / Lock-In del visor
  // ==========================================================================

  private updateReticle(
    camera: THREE.PerspectiveCamera,
    enemies: TestEnemySphere[] | undefined,
  ): void {
    this.lockedEnemyScreenPos = null;
    if (this.lockedEnemy && (!enemies || enemies.indexOf(this.lockedEnemy) < 0)) {
      this.breakLock(this.mode === 'speed_attack');
    }
    if (!enemies || enemies.length === 0) {
      if (this.lockedEnemy) this.breakLock(this.mode === 'speed_attack');
      this.candidateEnemy = null;
      if (this.reticleLockState === 'locked') this.reticleLockState = 'none';
      return;
    }

    const width = window.innerWidth;
    const height = window.innerHeight;
    const cx = width * 0.5;
    const cy = height * 0.5;

    if (this.lockedEnemy) {
      const onScreen = this.projectToScreen(this.lockedEnemy.position, camera, width, height);
      const distPx = onScreen
        ? Math.hypot(this.screenPos.x - cx, this.screenPos.y - cy)
        : Number.POSITIVE_INFINITY;
      if (onScreen && distPx <= RETICLE_BREAK_RADIUS_PX) {
        this.lockedScreenPos.x = this.screenPos.x;
        this.lockedScreenPos.y = this.screenPos.y;
        this.lockedEnemyScreenPos = this.lockedScreenPos;
      } else {
        // Se sale a > 500 px del centro de la mira o queda detrás: break.
        this.breakLock(this.mode === 'speed_attack');
      }
    }

    if (this.lockedEnemy) {
      this.candidateEnemy = null;
      return;
    }

    // Sin lock activo: candidato = enemigo más cercano al centro a <= 200 px.
    let best: TestEnemySphere | null = null;
    let bestDist = RETICLE_LOCK_RADIUS_PX;
    for (const enemy of enemies) {
      if (!this.projectToScreen(enemy.position, camera, width, height)) continue;
      const d = Math.hypot(this.screenPos.x - cx, this.screenPos.y - cy);
      if (d <= bestDist) {
        bestDist = d;
        best = enemy;
      }
    }
    this.candidateEnemy = best;
    this.reticleLockState = best ? 'can_lock' : 'none';
  }

  /** Proyecta a píxeles de pantalla. false si está detrás de la cámara. */
  private projectToScreen(
    worldPos: THREE.Vector3,
    camera: THREE.PerspectiveCamera,
    width: number,
    height: number,
  ): boolean {
    this.tmpD.copy(worldPos).applyMatrix4(camera.matrixWorldInverse);
    if (this.tmpD.z > -0.1) return false; // detrás de la cámara
    this.tmpD.copy(worldPos).project(camera);
    if (this.tmpD.z > 1) return false; // ndc.z > 1: detrás
    this.screenPos.x = (this.tmpD.x + 1) * 0.5 * width;
    this.screenPos.y = (1 - this.tmpD.y) * 0.5 * height;
    return true;
  }

  /** Rompe el lock-in; si estabas atacando, activa la cámara lenta. */
  private breakLock(wasAttacking: boolean): void {
    this.lockedEnemy = null;
    this.reticleLockState = 'none'; // se recalcula a 'can_lock'/'none' en el mismo frame
    if (wasAttacking) this.bulletTimeTimer = BULLET_TIME_DURATION;
  }

  // ==========================================================================
  // Acciones
  // ==========================================================================

  /** Espacio: despegue a flotación (solo en suelo) o cancelar el ataque. */
  private handleJump(): void {
    if (this.mode === 'grounded') {
      // SOLO se entra a flotación con Espacio estando en un suelo/pared.
      this.nyxRoot.position.addScaledVector(this.groundNormal, FLOAT_ENTRY_OFFSET);
      this.velocity.copy(this.groundNormal).multiplyScalar(FLOAT_ENTRY_SPEED);
      // Sincroniza la orientación de vuelo con la cámara del suelo.
      this.aimForward.copy(this.camFwd).normalize();
      this.aimUp.copy(this.up);
      this.prevAimFwd.copy(this.aimForward);
      this.facing.copy(this.aimForward);
      this.mode = 'floating';
      this.animator.setState('zero_g_float');
      this.audio?.playAnchor();
    } else if (this.mode === 'speed_attack') {
      // Cancelación del ataque: 1, 2 o 3 kick_flip según la velocidad.
      this.lockedEnemy = null;
      this.speedAttackKind = null;
      this.startKickRecover();
    }
    // En 'floating'/'dashing'/'kick_recover': Espacio NO hace nada.
  }

  /** Clic Derecho: dash (3.0 Edén). En speed_attack solo lateral/trasero. */
  private handleDash(f: number, r: number): void {
    if (this.mode === 'speed_attack') {
      // Solo A/D (lateral) o S (trasero); W no sirve (ya vas hacia delante).
      if (this.eden < EDEN_DASH_COST) return;
      if (r !== 0) {
        // Amortigua la velocidad frontal restante y suma el vector lateral.
        this.velocity.multiplyScalar(0.35);
        this.velocity.addScaledVector(this.camRight, Math.sign(r) * DASH_SIDE_SPEED);
      } else if (f < 0) {
        // Corta en seco la velocidad frontal y frena del tirón hacia atrás.
        this.velocity.multiplyScalar(0.18);
        this.velocity.addScaledVector(this.camFwd, -DASH_BACK_IMPULSE);
      } else {
        return;
      }
      this.eden -= EDEN_DASH_COST;
      this.lockedEnemy = null;
      this.speedAttackKind = null;
      this.dashDir.copy(this.velocity).normalize();
      this.dashSpeed = this.velocity.length();
      this.mode = 'dashing';
      this.dashTimer = DASH_DURATION;
      this.animator.setState('air_dash');
      // Cámara lenta para re-aimar y volver a lockear al enemigo.
      this.bulletTimeTimer = BULLET_TIME_DURATION;
      this.audio?.playGravityShift();
    } else if (this.mode === 'floating') {
      if (this.eden < EDEN_DASH_COST) return;
      const dir = this.tmpA.set(0, 0, 0);
      if (f !== 0 || r !== 0) {
        dir.addScaledVector(this.camFwd, f).addScaledVector(this.camRight, r).normalize();
      } else {
        dir.copy(this.camFwd); // W o sin teclas = hacia delante
      }
      this.eden -= EDEN_DASH_COST;
      this.velocity.copy(dir).multiplyScalar(DASH_SPEED);
      this.dashDir.copy(dir);
      this.dashSpeed = DASH_SPEED;
      this.mode = 'dashing';
      this.dashTimer = DASH_DURATION;
      this.animator.setState('air_dash');
      this.audio?.playGravityShift();
    }
  }

  /** Clic Izquierdo: Ataque de Velocidad (patada con lock-in o void_fall). */
  private handleAttack(): void {
    if (this.mode === 'speed_attack' || this.mode === 'kick_recover') return;
    if (this.eden <= 0.01) return;
    const speed = this.velocity.length();

    if (this.mode === 'grounded') {
      // En suelo: te despega y lanza hacia donde apuntas.
      this.nyxRoot.position.addScaledVector(this.groundNormal, FLOAT_ENTRY_OFFSET);
      this.aimForward.copy(this.camFwd).normalize();
      this.aimUp.copy(this.up);
      this.prevAimFwd.copy(this.aimForward);
    }

    if (this.reticleLockState === 'can_lock' && this.candidateEnemy) {
      // Patada con lock-in: taladro si llevas >= 1.5 s acelerando o >= 22 m/s.
      this.lockedEnemy = this.candidateEnemy;
      this.reticleLockState = 'locked';
      this.speedAttackKind =
        this.accelTimeSec >= ACCEL_TIME_DRILL || speed >= 22
          ? 'spiral_drill_kick'
          : 'gravity_kick';
      this.animator.setState(this.speedAttackKind);
    } else {
      // Sin enemigo en la mira: Caída al Vacío.
      this.speedAttackKind = 'void_fall';
      this.animator.setState('gravity_fall');
    }

    this.facing.copy(this.aimForward);
    const floor = this.speedAttackKind === 'spiral_drill_kick' ? SPIRAL_MIN_SPEED : ATTACK_MIN_SPEED;
    this.velocity.copy(this.facing).multiplyScalar(Math.max(speed, floor));
    this.mode = 'speed_attack';
    this.dashTimer = 0;
    this.audio?.playMelee();
  }

  /** Encadena 1-3 kick_flip según la velocidad actual. */
  private startKickRecover(): void {
    const speed = this.velocity.length();
    this.flipsTotal = speed < KICK_FLIP_SPEED_2 ? 1 : speed < KICK_FLIP_SPEED_3 ? 2 : 3;
    this.flipsPlayed = 0;
    this.mode = 'kick_recover';
    this.animator.setState('kick_flip');
  }

  private impactEnemy(onHitEnemy: HitEnemyCallback | undefined): void {
    const enemy = this.lockedEnemy;
    if (!enemy) return;
    const isDrill = this.speedAttackKind === 'spiral_drill_kick';
    onHitEnemy?.(enemy, this.tmpE.copy(this.facing), isDrill);
    this.vfx.spawnBurst(enemy.position, this.facing, 0xffc24d, 30);
    this.shake = Math.max(this.shake, 0.28);
    this.lockedEnemy = null;
    this.speedAttackKind = null;
    this.startKickRecover();
    // Rebote corto tras conectar: la voltereta frena la inercia.
    this.velocity.multiplyScalar(-0.3);
    this.audio?.playMelee();
  }

  // ==========================================================================
  // Modos de movimiento
  // ==========================================================================

  private updateGrounded(
    dt: number,
    f: number,
    r: number,
    sprintHeld: boolean,
    hasMoveInput: boolean,
  ): void {
    const n = this.groundNormal;

    // Sin componente normal entrante (la adherencia la hace el sondeo).
    const vn = this.velocity.dot(n);
    if (vn < 0) this.velocity.addScaledVector(n, -vn);

    // WASD sobre la superficie, respecto a la dirección de la cámara.
    const move = this.tmpA.set(0, 0, 0);
    if (hasMoveInput) {
      move.addScaledVector(this.camFwd, f).addScaledVector(this.camRight, r);
      move.addScaledVector(n, -move.dot(n));
      if (move.lengthSq() > 1e-6) move.normalize();
    }

    const speed = this.velocity.length();
    this.isSliding = sprintHeld && hasMoveInput && speed > RUN_SPEED + 0.5;
    const targetSpeed = this.isSliding ? SLIDE_SPEED : sprintHeld ? RUN_SPEED : WALK_SPEED;

    const target = this.tmpB.copy(move).multiplyScalar(targetSpeed);
    this.velocity.lerp(target, 1 - Math.exp(-GROUND_ACCEL_LAMBDA * dt));

    // Adherencia a paredes y techos.
    this.velocity.addScaledVector(n, -GRAVITY * dt);
  }

  private updateFloating(dt: number, f: number, r: number): void {
    // WASD acelera hacia la cámara (1.0 Edén/s mientras se pulsa).
    if ((f !== 0 || r !== 0) && this.eden > 0.01) {
      const dir = this.tmpA.set(0, 0, 0).addScaledVector(this.camFwd, f).addScaledVector(this.camRight, r);
      if (dir.lengthSq() > 1e-6) {
        dir.normalize();
        this.velocity.addScaledVector(dir, FLOAT_ACCEL * dt);
        this.eden = Math.max(0, this.eden - EDEN_MOVE_DRAIN * dt);
      }
    }

    // Inercia espacial real: rozamiento casi nulo (conserva ~95% por segundo).
    this.velocity.multiplyScalar(Math.exp(-FLOAT_DRAG * dt));

    // Tope suave ~28 m/s.
    const sp = this.velocity.length();
    if (sp > FLOAT_MAX_SPEED) {
      this.velocity.setLength(THREE.MathUtils.lerp(sp, FLOAT_MAX_SPEED, 1 - Math.exp(-1.6 * dt)));
    }

    // Física centrípeta: al acelerar, el vector de velocidad curva hacia el
    // facing; a alta velocidad describe una curva amplia en vez de un codo.
    if (f > 0 && sp > 0.5) {
      const speed = this.velocity.length();
      const centripetal = 1 / (1 + speed * CENTRIPETAL_SPEED_K);
      const dir = this.tmpB.copy(this.velocity).normalize();
      this.rotateToward(dir, this.facing, VEL_ALIGN_RATE * centripetal * dt);
      this.velocity.copy(dir).multiplyScalar(speed);
    }
  }

  private updateDashing(dt: number): void {
    this.dashTimer -= dt;
    // Redirección en vivo: el rumbo del dash sigue a la cámara.
    this.rotateToward(this.dashDir, this.aimForward, DASH_TURN_RATE * dt);
    this.velocity.copy(this.dashDir).multiplyScalar(this.dashSpeed);
    if (this.dashTimer <= 0) this.mode = 'floating';
  }

  private updateSpeedAttack(dt: number, onHitEnemy: HitEnemyCallback | undefined): void {
    this.eden = Math.max(0, this.eden - EDEN_ATTACK_DRAIN * dt);

    // Evolución en vuelo: gravity_kick -> spiral_drill_kick a los 1.5 s.
    if (this.speedAttackKind === 'gravity_kick' && this.accelTimeSec >= ACCEL_TIME_DRILL) {
      this.speedAttackKind = 'spiral_drill_kick';
      this.animator.setState('spiral_drill_kick');
    }

    // Auto-aim con física: la mira (y el cuerpo tras ella) se curva hacia el
    // enemigo lockeado, limitada por 2.8/(1+speed*0.04) rad/s.
    if (this.lockedEnemy) {
      const toEnemy = this.tmpA.copy(this.lockedEnemy.position).sub(this.nyxRoot.position);
      const dist = toEnemy.length();
      if (dist > 1e-4) {
        toEnemy.multiplyScalar(1 / dist);
        const speed = this.velocity.length();
        const maxTurn = (AUTO_AIM_TURN / (1 + speed * AUTO_AIM_SPEED_K)) * dt;
        this.rotateToward(this.aimForward, toEnemy, maxTurn);
      }
      // Impacto contra la esfera enemiga.
      if (dist <= PLAYER_RADIUS + this.lockedEnemy.radius + 0.45) {
        this.impactEnemy(onHitEnemy);
        return;
      }
    }

    // Acelera velozmente (~24-34 m/s) curvando el vector de golpe hacia el
    // facing con la física centrípeta.
    const speed = this.velocity.length();
    const floor = this.speedAttackKind === 'spiral_drill_kick' ? SPIRAL_MIN_SPEED : ATTACK_MIN_SPEED;
    const targetSpeed = Math.min(ATTACK_MAX_SPEED, Math.max(floor, speed) + ATTACK_ACCEL * dt);
    const dir = this.tmpB.copy(this.velocity);
    if (dir.lengthSq() < 1e-4) dir.copy(this.facing);
    else dir.normalize();
    const centripetal = 1 / (1 + speed * CENTRIPETAL_SPEED_K);
    this.rotateToward(dir, this.facing, VEL_ALIGN_RATE * centripetal * dt);

    // Caída al Vacío: ligera vibración/deriva errática de alta velocidad.
    if (this.speedAttackKind === 'void_fall') {
      this.tmpC.crossVectors(dir, this.aimUp);
      if (this.tmpC.lengthSq() > 1e-6) {
        this.tmpC.normalize();
        this.quat.setFromAxisAngle(this.tmpC, Math.sin(this.time * 9.7) * 0.9 * dt);
        dir.applyQuaternion(this.quat);
      }
    }

    this.velocity.copy(dir).multiplyScalar(targetSpeed);
  }

  private updateKickRecover(dt: number): void {
    // Frena suavemente mientras encadena las volteretas.
    this.velocity.multiplyScalar(Math.exp(-2.6 * dt));
    if (this.animator.getState() === 'kick_flip' && this.animator.isFinished()) {
      this.flipsPlayed++;
      if (this.flipsPlayed < this.flipsTotal) {
        this.animator.setState('kick_flip');
      } else {
        this.mode = 'floating';
      }
    }
  }

  // ==========================================================================
  // Colisiones
  // ==========================================================================

  private resolveGround(slabs: SlabCollider[]): void {
    const hit = resolveSphereSlabCollision(
      slabs,
      this.nyxRoot.position,
      PLAYER_RADIUS,
      this.contact,
    );

    if (hit) {
      const n = this.contact.normal;
      const approach = this.velocity.dot(n); // < 0 = entrando en la superficie

      // Corrección posicional: esfera apoyada sobre la superficie.
      this.nyxRoot.position.copy(this.contact.point).addScaledVector(n, PLAYER_RADIUS);

      if (this.mode !== 'grounded') {
        // Flotando/volando/atacando y tocas un suelo o pared: SIEMPRE aterrizas.
        this.landOn(n, Math.max(0, -approach));
      } else {
        if (approach < 0) this.velocity.addScaledVector(n, -approach);
        this.groundNormal.copy(n);
      }
      return;
    }

    if (this.mode !== 'grounded') return;

    // Sin contacto: sondeo de adherencia a lo largo de -up.
    const down = this.tmpA.copy(this.up).multiplyScalar(-1);
    const stick = raycastSlabs(
      slabs,
      this.nyxRoot.position,
      down,
      PLAYER_RADIUS + GROUND_STICK_RANGE,
    );
    if (stick) {
      this.nyxRoot.position.copy(stick.point).addScaledVector(stick.normal, PLAYER_RADIUS);
      this.groundNormal.copy(stick.normal);
    } else {
      // Te sales del borde: pasas a flotación 0G (no existe caída con gravedad).
      this.mode = 'floating';
      this.aimForward.copy(this.facing).normalize();
      this.aimUp.copy(this.up);
      this.prevAimFwd.copy(this.aimForward);
    }
  }

  private landOn(normal: THREE.Vector3, impact: number): void {
    const prevMode = this.mode;
    const angle = Math.acos(THREE.MathUtils.clamp(this.up.dot(normal), -1, 1));

    this.mode = 'grounded';
    this.groundNormal.copy(normal);
    this.up.copy(normal);
    this.dashTimer = 0;

    if (prevMode === 'speed_attack') {
      this.lockedEnemy = null;
      this.speedAttackKind = null;
    }

    // Marco de suelo: reutiliza el rumbo proyectado al plano de la superficie.
    this.groundFwd.copy(this.facing).addScaledVector(normal, -this.facing.dot(normal));
    if (this.groundFwd.lengthSq() < 1e-4) {
      this.groundFwd.copy(this.velocity).addScaledVector(normal, -this.velocity.dot(normal));
    }
    if (this.groundFwd.lengthSq() < 1e-4) {
      this.groundFwd.set(1, 0, 0).addScaledVector(normal, -normal.x);
    }
    if (this.groundFwd.lengthSq() < 1e-4) {
      this.groundFwd.set(0, 0, 1).addScaledVector(normal, -normal.z);
    }
    this.groundFwd.normalize();
    this.camYaw = 0;
    this.camPitch = 0;

    // Animación según el ángulo de reorientación y la velocidad de impacto.
    if (angle > WALL_FLIP_ANGLE) {
      this.playOneShot('wall_shift_flip');
      this.audio?.playGravityShift();
    } else if (impact > LAND_RECOVER_SPEED) {
      this.playOneShot('land_recover');
      this.vfx.spawnBurst(this.nyxRoot.position, normal, 0xffc24d, 26);
      this.audio?.playLand();
    } else if (impact > JUMP_LAND_SPEED) {
      this.playOneShot('jump_land');
    }

    // Frena la inercia tangencial según la dureza del impacto.
    this.velocity.multiplyScalar(Math.exp(-Math.min(impact, 20) * 0.06));
  }

  private resolveDomeBound(): void {
    const radial = this.nyxRoot.position.length();
    if (radial <= DOME_PLAYER_BOUND_RADIUS || this.bounceCooldown > 0) return;

    const n = this.tmpA.copy(this.nyxRoot.position).multiplyScalar(1 / radial);
    this.nyxRoot.position.copy(n).multiplyScalar(DOME_PLAYER_BOUND_RADIUS);

    // Refleja la velocidad hacia el centro con rebote con pérdida.
    const vn = this.velocity.dot(n);
    if (vn > 0) this.velocity.addScaledVector(n, -1.6 * vn);
    const inward = this.velocity.dot(n);
    if (inward > -3) this.velocity.addScaledVector(n, -3 - inward);

    this.hp = Math.max(0, this.hp - DOME_BOUNCE_DAMAGE);
    if (this.hp <= 0) this.hp = this.maxHp; // reset temporal hasta tener respawn real

    if (this.mode === 'speed_attack') {
      this.lockedEnemy = null;
      this.speedAttackKind = null;
    }
    if (this.mode !== 'grounded') this.mode = 'floating';

    this.playOneShot('dome_bounce');
    this.vfx.spawnDomeBounceRing(
      this.nyxRoot.position,
      this.tmpB.copy(n).multiplyScalar(-1), // normal hacia el centro
    );
    this.domeBounceFlash = 1;
    this.shake = Math.max(this.shake, 0.35);
    this.bounceCooldown = 0.6;
    this.audio?.playBounce();
    this.audio?.playHurt();
  }

  // ==========================================================================
  // Orientación, animación, recursos y cámara
  // ==========================================================================

  /**
   * Transporte paralelo del marco de vuelo: aimUp sigue a aimForward sin
   * saltos de roll, y se re-ortonormaliza contra aimForward.
   */
  private updateFlightFrame(): void {
    if (this.mode === 'grounded') return;
    if (this.prevAimFwd.angleTo(this.aimForward) > 1e-6) {
      this.quat.setFromUnitVectors(this.prevAimFwd, this.aimForward);
      this.aimUp.applyQuaternion(this.quat);
    }
    this.prevAimFwd.copy(this.aimForward);
    this.aimUp.addScaledVector(this.aimForward, -this.aimUp.dot(this.aimForward));
    if (this.aimUp.lengthSq() < 1e-8) {
      this.aimUp.set(0, 1, 0).cross(this.aimForward);
      if (this.aimUp.lengthSq() < 1e-8) this.aimUp.set(1, 0, 0).cross(this.aimForward);
    }
    this.aimUp.normalize();
  }

  private updateOrientation(dt: number, speed: number): void {
    if (dt < 1e-6) dt = 1e-6;

    if (this.mode === 'grounded') {
      // El up persigue la normal del suelo con transporte paralelo de groundFwd
      // (sin saltos bruscos al caminar por paredes o techos).
      const prevUp = this.tmpA.copy(this.up);
      this.up.lerp(this.groundNormal, 1 - Math.exp(-12 * dt)).normalize();
      this.quat.setFromUnitVectors(prevUp, this.up);
      this.groundFwd.applyQuaternion(this.quat);
      this.groundFwd.addScaledVector(this.up, -this.groundFwd.dot(this.up));
      if (this.groundFwd.lengthSq() < 1e-8) {
        this.groundFwd.copy(this.facing).addScaledVector(this.up, -this.facing.dot(this.up));
        if (this.groundFwd.lengthSq() < 1e-8) {
          this.groundFwd.set(1, 0, 0).addScaledVector(this.up, -this.up.x);
        }
      }
      this.groundFwd.normalize();

      // Rumbo sobre la superficie.
      if (speed > 1.2) {
        const target = this.tmpB.copy(this.velocity);
        target.addScaledVector(this.up, -this.velocity.dot(this.up));
        if (target.lengthSq() > 0.04) {
          target.normalize();
          const prev = this.tmpC.copy(this.facing);
          this.facing.lerp(target, 1 - Math.exp(-9 * dt));
          this.facing.addScaledVector(this.up, -this.facing.dot(this.up)).normalize();
          const cross = this.tmpD.crossVectors(prev, this.facing);
          this.turnRate = THREE.MathUtils.clamp(
            Math.asin(THREE.MathUtils.clamp(cross.dot(this.up), -1, 1)) / dt,
            -12,
            12,
          );
        } else {
          this.turnRate = 0;
        }
      } else {
        this.turnRate = 0;
      }
    } else {
      // Vuelo: el cuerpo se alinea de espaldas a la cámara con desfase elástico,
      // limitado por la física centrípeta (a más velocidad, más le cuesta girar).
      const centripetal = 1 / (1 + speed * CENTRIPETAL_SPEED_K);
      const prev = this.tmpA.copy(this.facing);
      this.facing.lerp(this.aimForward, 1 - Math.exp(-BODY_TURN_RATE * centripetal * dt)).normalize();
      this.up.lerp(this.aimUp, 1 - Math.exp(-8 * centripetal * dt)).normalize();
      const cross = this.tmpB.crossVectors(prev, this.facing);
      this.turnRate = THREE.MathUtils.clamp(
        Math.asin(THREE.MathUtils.clamp(cross.dot(this.up), -1, 1)) / dt,
        -12,
        12,
      );
    }

    // +Z = frente de nyx_rigged.glb, +Y = cabeza: base ortonormal directa.
    const right = this.tmpC.crossVectors(this.up, this.facing);
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    else right.normalize();
    this.mat.makeBasis(right, this.up, this.facing);
    this.quat.setFromRotationMatrix(this.mat);
    this.nyxRoot.quaternion.slerp(this.quat, 1 - Math.exp(-14 * dt));
  }

  private updateAnimState(speed: number, hasMoveInput: boolean): void {
    if (this.animLock !== null) {
      if (this.animator.isFinished()) this.animLock = null;
      else return;
    }
    switch (this.mode) {
      case 'grounded':
        if (this.isSliding) this.animator.setState('gravity_slide');
        else if (speed > 0.7 && hasMoveInput) this.animator.setState('run');
        else this.animator.setState('idle');
        break;
      case 'floating':
        this.animator.setState('zero_g_float');
        break;
      case 'dashing':
        if (this.animator.getState() !== 'air_dash') this.animator.setState('air_dash');
        break;
      case 'speed_attack': {
        const st: NyxAnimState =
          this.speedAttackKind === 'spiral_drill_kick'
            ? 'spiral_drill_kick'
            : this.speedAttackKind === 'gravity_kick'
              ? 'gravity_kick'
              : 'gravity_fall';
        // Los one-shots de patada se relanzan mientras dure el vuelo.
        if (this.animator.getState() !== st || this.animator.isFinished()) {
          this.animator.setState(st);
        }
        break;
      }
      case 'kick_recover':
        break; // lo maneja updateKickRecover
    }
  }

  private updateAccelTime(dt: number, f: number, speed: number): void {
    if (this.mode === 'speed_attack' || this.mode === 'dashing') {
      this.accelTimeSec += dt;
    } else if (this.mode === 'floating' && f > 0) {
      this.accelTimeSec += dt;
    } else if (speed < ACCEL_TIME_HOLD_SPEED) {
      // Baja suavemente cuando frenas.
      this.accelTimeSec = Math.max(0, this.accelTimeSec - ACCEL_TIME_DECAY * dt);
    }
    if (this.accelTimeSec > 6) this.accelTimeSec = 6;
  }

  private updateEden(dt: number, hasMoveInput: boolean, speed: number): void {
    // Quieta en suelo o flotando a < 1.5 m/s sin input: +1% / s.
    const idle =
      (this.mode === 'grounded' || this.mode === 'floating') &&
      !hasMoveInput &&
      speed < IDLE_REGEN_MAX_SPEED;
    if (idle) {
      this.eden += this.maxEden * EDEN_IDLE_REGEN_FRAC * dt;
    }
    this.eden = Math.min(this.maxEden, this.eden);
  }

  private updateCamera(
    dt: number,
    slabs: SlabCollider[],
    camera: THREE.PerspectiveCamera,
    speed: number,
  ): void {
    // Dirección de mira final del frame (puede haber curvado el auto-aim).
    this.computeCameraBasis();

    const look = this.tmpA.copy(this.nyxRoot.position).addScaledVector(this.up, CAM_LOOK_HEIGHT);
    const back = this.tmpB.copy(this.camFwd).multiplyScalar(-1);

    // Evita atravesar slabs con la cámara.
    let camDist = CAM_DISTANCE;
    const camHit = raycastSlabs(slabs, look, back, CAM_DISTANCE);
    if (camHit) camDist = Math.max(1.1, camHit.distance - 0.25);

    const camPos = this.tmpC.copy(look).addScaledVector(back, camDist);
    if (this.shake > 0.001) {
      camPos.x += (Math.random() * 2 - 1) * this.shake;
      camPos.y += (Math.random() * 2 - 1) * this.shake;
      camPos.z += (Math.random() * 2 - 1) * this.shake;
    }
    camera.position.copy(camPos);
    camera.up.copy(this.mode === 'grounded' ? this.up : this.aimUp);
    camera.lookAt(look);

    // Frenesí: FOV dinámico con la velocidad.
    const targetFov = this.settings.baseFov + FOV_BOOST * clamp01(speed / FOV_SPEED_REF);
    if (Math.abs(targetFov - camera.fov) > 0.05) {
      camera.fov = targetFov;
      camera.updateProjectionMatrix();
    }
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  /** Rota el vector unitario `v` hacia `target` un máximo de `maxAngle` rad. */
  private rotateToward(v: THREE.Vector3, target: THREE.Vector3, maxAngle: number): void {
    const angle = v.angleTo(target);
    if (maxAngle >= angle || angle < 1e-5) {
      v.copy(target);
      return;
    }
    this.tmpAxis.crossVectors(v, target);
    if (this.tmpAxis.lengthSq() < 1e-12) {
      v.copy(target);
      return;
    }
    this.tmpAxis.normalize();
    this.quatB.setFromAxisAngle(this.tmpAxis, maxAngle);
    v.applyQuaternion(this.quatB);
  }

  private isDown(action: ControlAction): boolean {
    for (const code of this.codesDown) {
      if (this.actionByCode.get(code) === action) return true;
    }
    return false;
  }

  private playOneShot(state: NyxAnimState): void {
    this.animator.setState(state);
    this.animLock = state;
  }
}
