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
import { NyxAnimator, type NyxAnimParams, type NyxAnimState } from '@/game/render/nyxAnimator';
import { MotionVfxSystem } from '@/game/dome/MotionVfx';
import {
  formatKeyCode,
  resolveActionCodes,
  type ControlAction,
  type GameSettings,
} from '@/game/settings';
import { GamepadInput } from '@/game/input/GamepadInput';
import type { SynthAudio } from '@/game/audio/SynthAudio';

// ============================================================================
// NyxDomeController — movimiento, física espacial, cámara y ataques de Nyx
// dentro de la cúpula de 90 m, según el diseño exacto de la bóveda.
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
//  - 'dashing'      Clic Derecho (3.0 Edén): 0.36 s a 24 m/s según WASD,
//                   redirigible en vivo con el ratón.
//  - 'speed_attack' Clic Izquierdo (2.0 Edén/s): patada con lock-in al enemigo
//                   de la mira (gravity_kick / spiral_drill_kick según la
//                   velocidad instantánea >= 14.5 m/s) o Caída al Vacío
//                   (void_fall) sin enemigo. Dash lateral/trasero para cortar
//                   vector y Espacio para frenar del todo en 1-3 kick_flip.
//                   Si el enemigo se esquiva de cerca (giro imposible para el
//                   auto-aim o dash evasivo), Cámara Lenta de Redirección
//                   (0.20): un Dash W/A/D apuntando a él re-lockea, curva el
//                   vector de golpe +4 m/s SIN cortar la patada.
//  - 'kick_recover' Frenado suave hasta casi 0 encadenando kick_flip.
//
// Economía de Edén (base 100): +1%/s de regeneración en suelo o flotación sin
// WASD ni clics (aunque te deslices por inercia en 0G), WASD 1.0/s, Dash 3.0
// de golpe, Ataque 2.0/s.
//
// Lock-In del visor: enemigo más cercano al centro de la mira a <= 105 px
// (can_lock); se rompe a > 262 px o si queda detrás → Cámara Lenta real de
// 1.25 s (timeScale 0.22) para reaccionar (solo si había enemigo marcado).
// ============================================================================

const DEG = Math.PI / 180;

// --- Suelo (cualquier SlabCollider: suelo, pared o techo)
const PLAYER_RADIUS = 0.45;
const GRAVITY = 22; // solo como fuerza de adherencia al suelo
const WALK_SPEED = 4.2;
const RUN_SPEED = 7.4;
const SLIDE_SPEED = 10.0;
const GROUND_ACCEL_LAMBDA = 10;
const GROUND_STICK_RANGE = 0.35;
const WALL_FLIP_ANGLE = 45 * DEG;
const LAND_RECOVER_SPEED = 7;
const JUMP_LAND_SPEED = 2;
const FLOAT_ENTRY_OFFSET = 0.65;
const FLOAT_ENTRY_SPEED = 3.0;
// Aterrizaje real vs choque lateral (hit_stagger) según el alineamiento de
// los pies con la normal de la superficie.
const FLOAT_LAND_MAX_SPEED = 14; // contacto suave en flotación: aterriza
const FLOAT_LAND_MIN_ALIGN = -0.25;
const LAND_ALIGN_MIN = 0.35; // pies orientados a la superficie: aterriza
const WALL_BOUNCE_KEEP = 0.45; // rebote lateral amortiguado al 45%

// --- Flotación 0G
const FLOAT_ACCEL = 13.5;
const FLOAT_MAX_SPEED = 28.0;
const FLOAT_DRAG = 0.06; // exp(-0.06*dt): conserva ~95% de la velocidad por segundo
const CENTRIPETAL_SPEED_K = 0.11; // centripetalFactor = 1/(1+speed*0.11)
const BODY_TURN_RATE = 10;
const VEL_ALIGN_RATE = 4.0;

// --- Dash (Clic Derecho)
const DASH_SPEED = 31.0;
const DASH_DURATION = 0.36;
const DASH_TURN_RATE = 5.0;
const DASH_SIDE_SPEED = 30;
const DASH_BACK_IMPULSE = 14;

// --- Ataque de Velocidad (Clic Izquierdo)
const ATTACK_ACCEL = 15;
const DRILL_SPEED_THRESHOLD = 18.0; // m/s instantáneos -> spiral_drill_kick
const GRAVITY_KICK_SPEED = 23.5; // velocidad tope de la patada gravitatoria
const SPIRAL_DRILL_SPEED = 34.0; // velocidad tope del taladro espiral
const VOID_FALL_START_SPEED = 22.0;
const VOID_FALL_MAX_SPEED = 33.0;
const KICK_RECOVER_BRAKE = 4.2; // exp(-4.2*dt): frena hasta casi 0
const KICK_RECOVER_MAX_TIME_PER_FLIP = 0.9; // seguridad anti-atasco por flip

// --- Economía de Edén
const EDEN_MOVE_DRAIN = 1.0;
const EDEN_DASH_COST = 3.0;
const EDEN_ATTACK_DRAIN = 2.0;
const EDEN_IDLE_REGEN_FRAC = 0.01; // 1% de maxEden por segundo

// --- Cámara Lenta (Bullet-Time)
const BULLET_TIME_SCALE = 0.25;
const BULLET_TIME_DURATION = 1.6;

// --- Cámara Lenta de Redirección (Dash durante speed_attack)
const REDIRECT_TIME_SCALE = 0.25;
const REDIRECT_WINDOW_MIN = 1.25;
const REDIRECT_WINDOW_MAX = 2.6;
const REDIRECT_REARM_COOLDOWN = 0.9;
const REDIRECT_SPEED_RETENTION = 0.80;

// --- Cámara
const CAM_PITCH_LIMIT = 1.15;
const AIM_PITCH_MAX_DOT = 0.985;
const CAM_DISTANCE = 6.2;
const CAM_LOOK_HEIGHT = 1.35;
const FOV_SPEED_REF = 32;
const FOV_BOOST = 22;
// Tirachinas de distancia: tira +1.25 m al arrancar y recoge a 5.6 m a tope.
const CAM_TUG_DISTANCE = 1.25;
const CAM_HIGH_SPEED_DISTANCE = 5.6;
// Encuadre de ataque: sube el look para que Nyx quede baja de centro.
const CAM_ATTACK_LOOK_LIFT = 0.28;
// Dutch roll del horizonte (±0.22 rad ≈ ±12.5°).
const CAM_ROLL_MAX = 0.22;
const CAM_ROLL_TURN_K = 0.016;
const CAM_ROLL_DASH_SIDE = 0.11;
// Muelle de aterrizaje: hundimiento de cámara proporcional al impacto.
const LANDING_DIP_MAX = 0.48;
const LANDING_DIP_K = 0.045;
// Hit-stop + FOV punch del impacto de patada/taladro.
const HIT_STOP_KICK = 0.042;
const HIT_STOP_DRILL = 0.068;
const FOV_PUNCH_KICK = -7;
const FOV_PUNCH_DRILL = -11;
const FOV_PUNCH_CAP = -30; // tope de zoom puntual por energía cinética

const DOME_BOUNCE_DAMAGE = 10;

// --- Mando (Gamepad API): rad/s de giro de cámara a stick derecho a tope,
// escalado por gamepadSensitivity (el ratón usa 0.0023 rad/px).
const GAMEPAD_LOOK_RATE = 2.6;

type HitEnemyCallback = (
  enemy: TestEnemySphere,
  hitDir: THREE.Vector3,
  isDrill: boolean,
  impactSpeed?: number,
) => void;

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

// Scratch del bucle caliente: gravedad del pelo y params del animador se
// reutilizan cada frame en lugar de crear array/objeto literales nuevos.
const _hairGravityLocal: [number, number, number] = [0, 0, 0];
const _animParams: NyxAnimParams = {
  speed01: 0,
  turnRate: 0,
  verticalVel: 0,
  hairGravityLocal: _hairGravityLocal,
};

export class NyxDomeController {
  // --- Dependencias
  private readonly nyxRoot: THREE.Group;
  private readonly animator: NyxAnimator;
  private readonly vfx: MotionVfxSystem;
  private readonly audio: SynthAudio | undefined;
  private readonly gamepad: GamepadInput | undefined;
  private settings!: GameSettings;

  // --- Entrada
  private readonly codesDown = new Set<string>();
  private readonly actionByCode = new Map<string, ControlAction>();
  private pointerLocked = false;
  private wantJump = false;
  private wantDash = false;
  private wantAttack = false;
  private attackHeld = false; // Clic Izquierdo mantenida
  private dashHeld = false; // Clic Derecho mantenida
  private wantSlot: 1 | 2 | 3 | null = null;
  private activeSlot: 1 | 2 | 3 = 1;
  // Stick izquierdo del mando del frame (zona muerta aplicada, -1..1).
  private gpLeftX = 0;
  private gpLeftY = 0;
  // Botones de mando mantenidos este frame (ataque/dash continuos).
  private gpAttackHeld = false;
  private gpDashHeld = false;

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
  // --- Plataforma anclada (Moving Platform Ride): slab sobre el que Nyx
  // está de pie, con su pose del frame anterior para heredar el
  // desplazamiento y la rotación del suelo sin allocations por frame.
  private groundedSlab: SlabCollider | null = null;
  private readonly groundedSlabPrevPos = new THREE.Vector3();
  private readonly groundedSlabPrevQuat = new THREE.Quaternion();

  // --- Cámara de suelo (ángulos escalares: NUNCA se invierte)
  private camYaw = 0;
  private camPitch = 0;

  // --- Temporizadores
  private time = 0;
  private dashTimer = 0;
  private dashSpeed = DASH_SPEED;
  private dashIsForward = true;
  private flipsTotal = 0;
  private flipsPlayed = 0;
  private bounceCooldown = 0;
  private bulletTimeTimer = 0;
  private animLock: NyxAnimState | null = null;

  // --- Ataque de velocidad / lock-in
  private attackElapsed = 0; // tiempo llevado en speed_attack
  private recoverElapsed = 0; // seguridad del frenado kick_recover
  private speedAttackKind: SpeedAttackKind | null = null;
  private lockedEnemy: TestEnemySphere | null = null;
  private candidateEnemy: TestEnemySphere | null = null;
  // --- Dash de redirección en cámara lenta
  private redirectTargetEnemy: TestEnemySphere | null = null;
  private redirectWindowTimer = 0; // segundos REALES de ventana restantes
  private redirectReArm = 0; // antirrebote tras cerrarse la ventana
  private reticleLockState: ReticleLockState = 'none';
  // Enemigo lockeado proyectado a <= RETICLE_LOCK_RADIUS_PX del centro del
  // visor este frame (se recalcula en updateReticle, antes de la física).
  private lockedEnemyInReticle = false;
  private readonly lockedScreenPos = { x: 0, y: 0 };
  private lockedEnemyScreenPos: { x: number; y: number } | null = null;

  // --- Recursos y progresión
  private hp = 100;
  private maxHp = 100;
  private eden = 100;
  private maxEden = 100;
  private level = 1;
  private exp = 0;
  private expToNext = 1;
  private speedMultiplier = 1;
  private edenRegenFrac = EDEN_IDLE_REGEN_FRAC;
  private hpRegenFrac = 0;
  private inkOverlayIntensity = 0;
  private waveNumber = 1;
  private waveLabel = 'BÁSICOS';
  private slotHudInfo: [
    { name: string | null; level: number; cooldownRemaining?: number; maxCooldown?: number },
    { name: string | null; level: number; cooldownRemaining?: number; maxCooldown?: number },
    { name: string | null; level: number; cooldownRemaining?: number; maxCooldown?: number },
  ] = [
    { name: null, level: 0 },
    { name: null, level: 0 },
    { name: null, level: 0 },
  ];
  onSlotTriggered?: (slotIndex: 0 | 1 | 2) => void;
  onDomeBounceDamage?: (damage: number) => void;
  onRedirectionSuccess?: () => void;
  /** Si devuelve true (p.ej. al lanzar una roca de Campo Gravitacional), bloquea la patada/caída */
  onLeftClickAttackOverride?: () => boolean;
  private domeBounceFlash = 0;
  private shake = 0;

  // --- Dirección de cámara arcade (estilo Persona 5)
  private camDist = CAM_DISTANCE; // muelle de distancia de cámara (tirachinas)
  private lookLift = 0; // subida del look en patada / caída al vacío
  private landingDip = 0; // hundimiento vertical del look al aterrizar
  private cameraRollRad = 0; // Dutch roll del horizonte (±0.22 rad)
  private rollImpulse = 0; // impulso de roll por choque lateral (hit_stagger)
  private dashSideRoll = 0; // roll sostenido por dash lateral (A/D)
  private hitStopTimer = 0; // segundos REALES de hit-stop restantes
  private fovPunch = 0; // grados de zoom puntual en el impacto
  private impactFlash = 0; // 0..1 para el HUD
  private gyroSpinRad = 0; // ángulo acumulado de los arcos giroscópicos del visor

  // --- Tambaleo orgánico de cámara (camWobble)
  private wobbleTime = 0; // reloj procedural del tambaleo
  private dashWobbleImpulse = 0; // latigazo elástico del dash (decae exp(-7*dt))
  private impactWobbleImpulse = 0; // tambaleo contundente del impacto

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
    gamepad?: GamepadInput,
  ) {
    this.nyxRoot = nyxRoot;
    this.animator = animator;
    this.vfx = vfx;
    this.audio = audio;
    this.gamepad = gamepad;
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
    this.gamepad?.applySettings(settings);
  }

  /** Escala de tiempo del mundo: 0.20 en redirección, 0.22 en cámara lenta. */
  getTimeScale(): number {
    if (this.redirectWindowTimer > 0) return REDIRECT_TIME_SCALE;
    return this.bulletTimeTimer > 0 ? BULLET_TIME_SCALE : 1.0;
  }

  /**
   * Calcula el tiempo real disponible en cámara lenta (0.25x) mientras un dash
   * lateral óptimo manteniendo el 80% de la velocidad todavía permite girar y
   * alcanzar al objetivo antes de sobrepasarlo por completo.
   */
  private computeRedirectWindowSec(target: TestEnemySphere): number {
    const dist = this.nyxRoot.position.distanceTo(target.position);
    const speed = Math.max(this.velocity.length() * REDIRECT_SPEED_RETENTION, 10);
    const worldTimeAvailable = dist / speed;
    const realTimeAvailable = worldTimeAvailable / REDIRECT_TIME_SCALE;
    return THREE.MathUtils.clamp(realTimeAvailable, REDIRECT_WINDOW_MIN, REDIRECT_WINDOW_MAX);
  }

  /**
   * El motor de enemigos llama aquí cuando el enemigo lockeado hace un dash
   * evasivo: guarda el objetivo, rompe el lock y abre la ventana de Cámara
   * Lenta de Redirección (timeScale 0.25) durante el tiempo físico en el que
   * un Dash todavía puede curvar el golpe para alcanzarlo.
   */
  notifyEnemyEvaded(): void {
    const target = this.lockedEnemy ?? this.redirectTargetEnemy;
    if (target) {
      this.redirectTargetEnemy = target;
      this.redirectWindowTimer = this.computeRedirectWindowSec(target);
    }
    if (this.lockedEnemy) {
      this.lockedEnemy = null;
      this.reticleLockState = 'none';
    }
  }

  onMouseMove(dx: number, dy: number): void {
    if (!this.pointerLocked) return;
    const sens = 0.0023 * this.settings.mouseSensitivity;
    this.rotateLook(dx * sens, dy * sens);
  }

  /**
   * Gira la mira/cámara con un delta YA escalado en radianes (lo comparten el
   * ratón y el stick derecho del mando). En suelo mueve los ángulos escalares
   * camYaw/camPitch; en vuelo rota aimForward con transporte paralelo.
   */
  private rotateLook(dx: number, dy: number): void {
    const pitch = -dy * (this.settings.invertY ? -1 : 1);

    if (this.mode === 'grounded') {
      // Cámara libre 360°: dos ángulos escalares sobre el marco del suelo.
      // dx > 0 (derecha) gira la vista a la derecha alrededor de this.up.
      this.camYaw -= dx;
      // dy < 0 (arriba) mira hacia arriba; dy > 0 (abajo) mira hacia abajo.
      this.camPitch = THREE.MathUtils.clamp(this.camPitch + pitch, -CAM_PITCH_LIMIT, CAM_PITCH_LIMIT);
      return;
    }

    // En vuelo la cámara va pegada a la espalda: el giro rota la mira objetivo
    // (aimForward) y el cuerpo se alinea detrás con desfase elástico.
    this.quat.setFromAxisAngle(this.aimUp, -dx);
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
    if (button === 0) {
      this.wantAttack = true;
      this.attackHeld = true;
    } else if (button === 2) {
      this.wantDash = true;
      this.dashHeld = true;
    }
  }

  onMouseUp(button: number): void {
    if (button === 0) this.attackHeld = false;
    else if (button === 2) this.dashHeld = false;
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
    if (!locked) {
      this.codesDown.clear();
      this.attackHeld = false;
      this.dashHeld = false;
    }
  }

  /**
   * Tamaño del viewport en píxeles CSS: lo refresca la vista en cada resize
   * para que la mira no consulte window.innerWidth/innerHeight cada frame.
   */
  setViewportSize(width: number, height: number): void {
    this.viewportW = width;
    this.viewportH = height;
  }
  private viewportW = window.innerWidth;
  private viewportH = window.innerHeight;

  /**
   * Entrada del mando (Gamepad API estándar, DualShock 4 / genérico). NO
   * depende del pointer lock: se puede jugar solo con mando y dejar el ratón
   * libre. El stick derecho rota la cámara (gamepadSensitivity + invertY),
   * el izquierdo se fusiona con WASD en update(), y los botones configurados
   * encolan las mismas acciones que el ratón/teclado con flanco (justPressed)
   * y mantenimiento (held).
   */
  private applyGamepadInput(rawDt: number): void {
    this.gpLeftX = 0;
    this.gpLeftY = 0;
    this.gpAttackHeld = false;
    this.gpDashHeld = false;
    const gp = this.gamepad;
    if (!gp || !gp.isConnected()) return;

    // Stick derecho: rotación fluida de cámara proporcional al frame.
    const rs = gp.getRightStick();
    if (rs.x !== 0 || rs.y !== 0) {
      const rate = GAMEPAD_LOOK_RATE * this.settings.gamepadSensitivity;
      this.rotateLook(rs.x * rate * rawDt, rs.y * rate * rawDt);
    }

    // Stick izquierdo: movimiento WASD analógico (Y negativa = adelante).
    const ls = gp.getLeftStick();
    this.gpLeftX = ls.x;
    this.gpLeftY = ls.y;

    // Botones configurados: flanco = one-shot, held = continuo.
    if (gp.justPressedAction('attack')) this.wantAttack = true;
    this.gpAttackHeld = gp.heldAction('attack');
    if (gp.justPressedAction('dash')) this.wantDash = true;
    this.gpDashHeld = gp.heldAction('dash');
    if (gp.justPressedAction('jump')) this.wantJump = true;
    // Habilidad: dispara la ranura activa (equivalente a pulsar 1/2/3).
    if (gp.justPressedAction('skill')) this.wantSlot = this.activeSlot;
    // Cambiar ranura: cicla 1 -> 2 -> 3 -> 1 sin disparar la habilidad.
    if (gp.justPressedAction('cycleSlot')) {
      this.activeSlot = ((this.activeSlot % 3) + 1) as 1 | 2 | 3;
    }
  }

  /** ¿Hay un mando conectado y activo? (para el aviso del HUD) */
  isGamepadConnected(): boolean {
    return this.gamepad?.isConnected() ?? false;
  }

  getPosition(): THREE.Vector3 {
    return this.nyxRoot.position;
  }

  getLockedEnemy(): TestEnemySphere | null {
    return this.lockedEnemy;
  }

  getCandidateEnemy(): TestEnemySphere | null {
    return this.reticleLockState === 'can_lock' ? this.candidateEnemy : null;
  }

  /** Segundos llevados en speed_attack (cuánto llevas atacando a un enemigo). */
  getAttackAccelTime(): number {
    return this.mode === 'speed_attack' ? this.attackElapsed : 0;
  }

  getAimForward(): THREE.Vector3 {
    return this.aimForward;
  }

  getCurrentSpeed(): number {
    return this.velocity.length();
  }

  getHp(): number {
    return this.hp;
  }

  getEden(): number {
    return this.eden;
  }

  isPlayerGrounded(): boolean {
    return this.mode === 'grounded';
  }

  isPlayerStill(): boolean {
    return (
      (this.mode === 'grounded' || this.mode === 'floating') &&
      this.velocity.length() < 1.25 &&
      !this.attackHeld &&
      !this.dashHeld &&
      !this.gpAttackHeld &&
      !this.gpDashHeld
    );
  }

  spendEden(amount: number): boolean {
    if (this.eden < amount) return false;
    this.eden = Math.max(0, this.eden - amount);
    return true;
  }

  restoreResources(hpDelta: number, edenDelta: number): void {
    if (hpDelta > 0) this.hp = Math.min(this.maxHp, this.hp + hpDelta);
    if (edenDelta > 0) this.eden = Math.min(this.maxEden, this.eden + edenDelta);
  }

  applyDamage(amount: number): void {
    if (amount <= 0) return;
    this.hp = Math.max(0, this.hp - amount);
    this.impactFlash = Math.max(this.impactFlash, 0.85);
    this.shake = Math.max(this.shake, 0.25);
  }

  /**
   * Empujón externo con aturdimiento breve (manotazo brutal del Gólem
   * Rompesuelos): suma impulso a la velocidad de Nyx y reproduce `hit_stagger`.
   */
  applySmashKnockback(pushDir: THREE.Vector3, speed: number): void {
    this.velocity.addScaledVector(pushDir, speed);
    this.playOneShot('hit_stagger');
    this.shake = Math.max(this.shake, 0.32);
    this.impactFlash = Math.max(this.impactFlash, 0.85);
  }

  triggerSkillAnim(anim: NyxAnimState): void {
    this.playOneShot(anim);
  }

  syncProgression(params: {
    level: number;
    exp: number;
    expToNext: number;
    maxHp: number;
    maxEden: number;
    speedMultiplier: number;
    edenRegenFrac: number;
    hpRegenFrac: number;
    inkOverlayIntensity: number;
    waveNumber?: number;
    waveLabel?: string;
    slots: [
      { name: string | null; level: number; cooldownRemaining?: number; maxCooldown?: number },
      { name: string | null; level: number; cooldownRemaining?: number; maxCooldown?: number },
      { name: string | null; level: number; cooldownRemaining?: number; maxCooldown?: number },
    ];
  }): void {
    if (params.maxHp > this.maxHp) {
      this.hp = Math.min(params.maxHp, this.hp + (params.maxHp - this.maxHp));
    }
    if (params.maxEden > this.maxEden) {
      this.eden = Math.min(params.maxEden, this.eden + (params.maxEden - this.maxEden));
    }
    this.level = params.level;
    this.exp = params.exp;
    this.expToNext = params.expToNext;
    this.maxHp = params.maxHp;
    this.maxEden = params.maxEden;
    this.speedMultiplier = params.speedMultiplier;
    this.edenRegenFrac = params.edenRegenFrac;
    this.hpRegenFrac = params.hpRegenFrac;
    this.inkOverlayIntensity = params.inkOverlayIntensity;
    if (params.waveNumber !== undefined) this.waveNumber = params.waveNumber;
    if (params.waveLabel !== undefined) this.waveLabel = params.waveLabel;
    this.slotHudInfo = params.slots;
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
      drillThreshold: DRILL_SPEED_THRESHOLD,
      isDrillReady: speed >= DRILL_SPEED_THRESHOLD,
      speedLinesIntensity: clamp01((speed - 10) / 16),
      mode: this.mode,
      speedAttackKind: this.mode === 'speed_attack' ? this.speedAttackKind : null,
      pointerLocked: this.pointerLocked,
      gamepadConnected: this.isGamepadConnected(),
      reticleLockState: this.reticleLockState,
      lockedEnemyScreenPos: this.lockedEnemyScreenPos,
      bulletTimeActive: this.bulletTimeTimer > 0 || this.redirectWindowTimer > 0,
      bulletTimeRemaining: Math.max(this.bulletTimeTimer, this.redirectWindowTimer),
      activeSlot: this.activeSlot,
      slots: [
        { keyLabel: formatKeyCode(this.settings.bindings.slot1), ...this.slotHudInfo[0] },
        { keyLabel: formatKeyCode(this.settings.bindings.slot2), ...this.slotHudInfo[1] },
        { keyLabel: formatKeyCode(this.settings.bindings.slot3), ...this.slotHudInfo[2] },
      ],
      domeBounceFlash: this.domeBounceFlash,
      inkOverlayIntensity: this.inkOverlayIntensity,
      waveNumber: this.waveNumber,
      waveLabel: this.waveLabel,
      impactFlash: this.impactFlash,
      cameraRollDeg: this.cameraRollRad * (180 / Math.PI),
      gyroSpinRad: this.gyroSpinRad,
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
    // Ventana de redirección: también descuenta TIEMPO REAL. Al cerrarse,
    // re-arma con un antirrebote para no re-abrirla en el mismo acercamiento.
    if (this.redirectWindowTimer > 0) {
      this.redirectWindowTimer = Math.max(0, this.redirectWindowTimer - rawDt);
      if (this.redirectWindowTimer === 0) {
        this.redirectReArm = REDIRECT_REARM_COOLDOWN;
        if (!this.lockedEnemy) this.redirectTargetEnemy = null;
      }
    } else if (this.redirectReArm > 0) {
      this.redirectReArm = Math.max(0, this.redirectReArm - rawDt);
    }
    // Hit-Stop: tras conectar una patada/taladro (o un choque lateral fuerte)
    // se congela la simulación de Nyx unos ms de reloj mientras la cámara
    // vibra y el FOV hace punch. El resto del frame sigue en tiempo real.
    let hitStop = false;
    if (this.hitStopTimer > 0) {
      this.hitStopTimer = Math.max(0, this.hitStopTimer - rawDt);
      hitStop = true;
    }
    const simDt = hitStop ? 0 : sdt;
    this.time += simDt;
    updateSlabMotion(slabs, this.time);

    // --- Moving Platform Ride: si Nyx está de pie sobre un suelo que se
    // mueve (los suelos flotantes trasladan su center y giran su quaternion
    // cada frame), hereda su desplazamiento y rotación ANTES de la física,
    // para que el suelo no se le escape de debajo.
    if (this.mode === 'grounded' && this.groundedSlab !== null) {
      if (slabs.indexOf(this.groundedSlab) < 0) {
        // El suelo anclado desapareció (desvanecido/reciclado): a flotación.
        this.mode = 'floating';
        this.groundedSlab = null;
        this.aimForward.copy(this.facing).normalize();
        this.aimUp.copy(this.up);
        this.prevAimFwd.copy(this.aimForward);
      } else {
        // deltaQuat = quatActual * inv(quatAnterior) del suelo anclado.
        this.quat.copy(this.groundedSlabPrevQuat).invert();
        this.quatB.copy(this.groundedSlab.quaternion).multiply(this.quat);
        // Rota la posición alrededor del centro anterior del suelo y luego
        // súmale la traslación del centro de este frame.
        this.tmpA
          .copy(this.nyxRoot.position)
          .sub(this.groundedSlabPrevPos)
          .applyQuaternion(this.quatB);
        this.nyxRoot.position
          .copy(this.groundedSlabPrevPos)
          .add(this.tmpA)
          .add(this.tmpB.copy(this.groundedSlab.center).sub(this.groundedSlabPrevPos));
        // El marco de suelo acompaña el giro: normal, rumbo, up y facing.
        this.groundNormal.applyQuaternion(this.quatB);
        this.groundFwd.applyQuaternion(this.quatB);
        this.up.applyQuaternion(this.quatB);
        this.facing.applyQuaternion(this.quatB);
      }
    }

    // --- Decaimientos
    if (this.bounceCooldown > 0) this.bounceCooldown -= sdt;
    if (this.domeBounceFlash > 0) {
      this.domeBounceFlash = Math.max(0, this.domeBounceFlash - sdt * 2.2);
    }
    this.shake *= Math.exp(-6 * sdt);
    // El flash de impacto y el punch de FOV decaen en TIEMPO REAL para que
    // se sientan incluso dentro del hit-stop y de la cámara lenta.
    this.impactFlash = Math.max(0, this.impactFlash - rawDt * 3.8);
    this.fovPunch *= Math.exp(-14 * rawDt);

    // --- Entrada de mando (Gamepad API): stick derecho = cámara, botones = acciones
    this.applyGamepadInput(rawDt);

    // --- Base de cámara del frame (dirección de mira según el modo)
    this.computeCameraBasis();

    // --- Entrada de movimiento (WASD + stick izquierdo analógico del mando)
    let f = (this.isDown('forward') ? 1 : 0) - (this.isDown('back') ? 1 : 0);
    let r = (this.isDown('right') ? 1 : 0) - (this.isDown('left') ? 1 : 0);
    if (this.gpLeftX !== 0 || this.gpLeftY !== 0) {
      f = THREE.MathUtils.clamp(f - this.gpLeftY, -1, 1);
      r = THREE.MathUtils.clamp(r + this.gpLeftX, -1, 1);
    }
    const hasMoveInput = f !== 0 || r !== 0;
    const sprintHeld = this.isDown('sprint');

    // --- Mira: detección de enemigo en el visor (lock / break)
    this.updateReticle(camera, enemies);

    // --- Acciones encoladas por los eventos
    if (this.wantSlot !== null) {
      const idx = (this.wantSlot - 1) as 0 | 1 | 2;
      this.activeSlot = this.wantSlot;
      this.wantSlot = null;
      this.onSlotTriggered?.(idx);
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

    // --- Física por modo (simDt = 0 durante el hit-stop: Nyx congelada)
    switch (this.mode) {
      case 'grounded':
        this.updateGrounded(simDt, f, r, sprintHeld, hasMoveInput);
        break;
      case 'floating':
        this.updateFloating(simDt, f, r);
        break;
      case 'dashing':
        this.updateDashing(simDt);
        break;
      case 'speed_attack':
        this.updateSpeedAttack(simDt, onHitEnemy);
        break;
      case 'kick_recover':
        this.updateKickRecover(simDt);
        break;
    }

    // --- Integración (congelada durante el hit-stop)
    if (!hitStop) {
      this.nyxRoot.position.addScaledVector(this.velocity, simDt);

      // --- Colisiones con slabs (aterrizaje en cualquier superficie) y cúpula
      this.resolveGround(slabs);
      this.resolveDomeBound();
    }

    const speed = this.velocity.length();

    // --- Marco de vuelo (transporte paralelo) + orientación del cuerpo
    this.updateFlightFrame();
    this.updateOrientation(simDt, speed);

    // --- Animación, acelerómetro y recursos
    this.updateAnimState(speed, hasMoveInput);
    this.updateEden(simDt, hasMoveInput);

    // --- Giroscopio del visor: los arcos giran según la velocidad real
    const isDrillReady = speed >= DRILL_SPEED_THRESHOLD;
    this.gyroSpinRad += rawDt * (0.45 + speed * 0.22 + (isDrillReady ? 2.4 : 0));

    // --- Cámara (siempre en tiempo real: vibra durante el hit-stop)
    this.updateCamera(rawDt, slabs, camera, speed);

    // --- Animador y VFX
    const hairG = this.mode === 'grounded' ? -1 : -0.25;
    _hairGravityLocal[0] = 0;
    _hairGravityLocal[1] = hairG;
    _hairGravityLocal[2] = 0;
    _animParams.speed01 = clamp01(speed / RUN_SPEED);
    _animParams.turnRate = this.turnRate;
    _animParams.verticalVel = this.velocity.dot(this.up);
    this.animator.update(simDt, _animParams);
    this.vfx.update(
      sdt,
      this.nyxRoot.position,
      this.velocity,
      this.facing,
      this.mode,
      isDrillReady,
    );
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
    this.lockedEnemyInReticle = false;
    if (this.redirectTargetEnemy && (!enemies || enemies.indexOf(this.redirectTargetEnemy) < 0)) {
      this.redirectTargetEnemy = null;
    }
    if (this.lockedEnemy && (!enemies || enemies.indexOf(this.lockedEnemy) < 0)) {
      this.breakLock(this.mode === 'speed_attack' && this.lockedEnemy !== null);
    }
    if (!enemies || enemies.length === 0) {
      if (this.lockedEnemy) this.breakLock(this.mode === 'speed_attack' && this.lockedEnemy !== null);
      this.candidateEnemy = null;
      if (this.reticleLockState === 'locked') this.reticleLockState = 'none';
      return;
    }

    const width = this.viewportW;
    const height = this.viewportH;
    const cx = width * 0.5;
    const cy = height * 0.5;

    if (this.lockedEnemy) {
      const onScreen = this.projectToScreen(this.lockedEnemy.position, camera, width, height);
      const distPx = onScreen
        ? Math.hypot(this.screenPos.x - cx, this.screenPos.y - cy)
        : Number.POSITIVE_INFINITY;
      if (onScreen && distPx <= RETICLE_BREAK_RADIUS_PX) {
        this.lockedEnemyInReticle = distPx <= RETICLE_LOCK_RADIUS_PX;
        this.lockedScreenPos.x = this.screenPos.x;
        this.lockedScreenPos.y = this.screenPos.y;
        this.lockedEnemyScreenPos = this.lockedScreenPos;
      } else {
        // Se sale a > 262 px del centro de la mira o queda detrás: break.
        // La cámara lenta solo se activa aquí si HAY enemigo marcado
        // (lockedEnemy !== null, que es quien llega a esta rama).
        this.breakLock(this.mode === 'speed_attack' && this.lockedEnemy !== null);
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

  /** Rompe el lock-in; si estabas atacando, guarda el objetivo y abre cámara lenta de redirección. */
  private breakLock(wasAttacking: boolean): void {
    const prev = this.lockedEnemy;
    this.lockedEnemy = null;
    this.reticleLockState = 'none'; // se recalcula a 'can_lock'/'none' en el mismo frame
    if (wasAttacking && prev) {
      this.redirectTargetEnemy = prev;
      this.redirectWindowTimer = this.computeRedirectWindowSec(prev);
    } else if (wasAttacking) {
      this.bulletTimeTimer = BULLET_TIME_DURATION;
    }
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
      this.groundedSlab = null;
      this.animator.setState('zero_g_float');
      this.audio?.playAnchor();
    } else if (this.mode === 'speed_attack') {
      // Espacio frena: 1 flip tras patada simple/caída, 2 tras taladro.
      this.velocity.multiplyScalar(0.30);
      this.startKickRecover(this.speedAttackKind === 'spiral_drill_kick' ? 2 : 1);
    } else if (
      (this.mode === 'floating' || this.mode === 'dashing') &&
      this.velocity.length() >= 12.0
    ) {
      // Freno físico aéreo (sin gastar Edén): quita 70% de velocidad y hace 1 flip.
      this.velocity.multiplyScalar(0.30);
      this.dashTimer = 0;
      this.startKickRecover(1);
    }
    // En 'kick_recover' o vuelo lento (< 12 m/s): Espacio NO hace nada.
  }

  /** Clic Derecho: dash (3.0 Edén). En speed_attack solo lateral/trasero. */
  private handleDash(f: number, r: number): void {
    if (this.mode === 'speed_attack') {
      if (this.eden < EDEN_DASH_COST) return;
      // Dash de redirección: SOLO si el jugador apunta. En cámara lenta hace
      // falta haber vuelto a meter al enemigo dentro del visor (estrella roja
      // suave, can_lock); con lockeo activo, el dash W/A/D debe ir hacia él
      // (isRedirectDashDir). NUNCA auto-aim mágico con redirectTargetEnemy:
      // sin enemigo a la vista, el Clic Derecho es un dash normal de WASD.
      const inSlowMo = this.redirectWindowTimer > 0 || this.bulletTimeTimer > 0;
      const candidate = this.reticleLockState === 'can_lock' ? this.candidateEnemy : null;
      const target = candidate ?? this.lockedEnemy;
      const isBrakeBack = f < 0 && r === 0;
      if (
        target &&
        !isBrakeBack &&
        ((inSlowMo && candidate !== null) ||
          ((f > 0 || r !== 0) && this.isRedirectDashDir(f, r, target)))
      ) {
        this.redirectDash(target);
        return;
      }
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
      const hadLockedEnemy = this.lockedEnemy !== null;
      this.lockedEnemy = null;
      this.redirectTargetEnemy = null;
      this.redirectWindowTimer = 0;
      this.speedAttackKind = null;
      if (f < 0) {
        // Frenazo evasivo: sale a flotación 0G, no mantiene el dash.
        this.mode = 'floating';
        this.dashSideRoll = 0;
        this.animLock = null;
        this.playOneShot('air_dash');
      } else {
        this.dashDir.copy(this.velocity).normalize();
        this.dashSpeed = this.velocity.length();
        this.dashIsForward = false;
        this.mode = 'dashing';
        this.dashTimer = DASH_DURATION;
        // Dutch roll sostenido hacia el lado del dash lateral.
        this.dashSideRoll = -Math.sign(r) * CAM_ROLL_DASH_SIDE;
        // Libera el lock de jump_land/land_recover para que el dash anime ya.
        this.animLock = null;
        this.animator.setState('air_dash', { dashDir: r > 0 ? -1 : 1 });
      }
      // Latigazo elástico de cámara + tirachinas de distancia.
      this.dashWobbleImpulse = 1.0;
      this.camDist = Math.min(this.camDist + CAM_TUG_DISTANCE, CAM_DISTANCE + CAM_TUG_DISTANCE);
      // Cámara lenta SOLO si había enemigo marcado (para re-lockear). En una
      // Caída al Vacío sin enemigo, el dash solo corta el vector: NUNCA la toca.
      if (hadLockedEnemy) this.bulletTimeTimer = BULLET_TIME_DURATION;
      this.audio?.playGravityShift();
    } else if (this.mode === 'dashing' && (this.redirectWindowTimer > 0 || this.bulletTimeTimer > 0)) {
      if (this.eden < EDEN_DASH_COST) return;
      // Re-captura SOLO con el enemigo de vuelta dentro del visor: sin
      // candidato no hay auto-aim con redirectTargetEnemy.
      const target = this.reticleLockState === 'can_lock' ? this.candidateEnemy : null;
      if (target) {
        this.redirectDash(target);
        return;
      }
    } else if (this.mode === 'floating') {
      if (this.eden < EDEN_DASH_COST) return;
      if (f < 0 && r === 0) {
        // Dash hacia atrás en libre: frena muy rápido y da impulso hacia atrás.
        this.eden -= EDEN_DASH_COST;
        this.velocity.multiplyScalar(0.18);
        this.velocity.addScaledVector(this.camFwd, -DASH_BACK_IMPULSE);
        this.dashSideRoll = 0;
        this.dashWobbleImpulse = 1.0;
        this.animLock = null;
        this.playOneShot('air_dash');
        this.audio?.playGravityShift();
        return;
      }
      const dir = this.tmpA.set(0, 0, 0);
      if (f !== 0 || r !== 0) {
        dir.addScaledVector(this.camFwd, f).addScaledVector(this.camRight, r).normalize();
      } else {
        dir.copy(this.camFwd); // W o sin teclas = hacia delante
      }
      this.eden -= EDEN_DASH_COST;
      const dashSpd = DASH_SPEED * this.speedMultiplier;
      this.velocity.copy(dir).multiplyScalar(dashSpd);
      this.dashDir.copy(dir);
      this.dashSpeed = dashSpd;
      this.dashIsForward = r === 0 && f >= 0;
      this.mode = 'dashing';
      this.dashTimer = DASH_DURATION;
      // Tirachinas de cámara + roll hacia el lado del dash lateral.
      this.camDist = Math.min(this.camDist + CAM_TUG_DISTANCE, CAM_DISTANCE + CAM_TUG_DISTANCE);
      this.dashSideRoll = -r * CAM_ROLL_DASH_SIDE;
      // Latigazo elástico de cámara del dash.
      this.dashWobbleImpulse = 1.0;
      // Libera el lock de jump_land/land_recover para que el dash anime ya.
      this.animLock = null;
      if (r !== 0) this.animator.setState('air_dash', { dashDir: r > 0 ? -1 : 1 });
      else this.animator.setState('air_dash');
      this.audio?.playGravityShift();
    }
  }

  /**
   * ¿Apunta el Dash W/A/D hacia el enemigo (frente) o hacia el lado por el que
   * el cuerpo debe girar respecto a su vector de velocidad para alcanzarlo?
   */
  private isRedirectDashDir(f: number, r: number, target: TestEnemySphere): boolean {
    const toEnemy = this.tmpB.copy(target.position).sub(this.nyxRoot.position);
    if (toEnemy.lengthSq() < 1e-6) return false;
    toEnemy.normalize();
    if (f > 0 && toEnemy.dot(this.camFwd) > 0.15) return true;
    const side = toEnemy.dot(this.camRight);
    return r !== 0 && Math.sign(r) === Math.sign(side) && Math.abs(side) > 0.15;
  }

  /**
   * Dash de redirección durante speed_attack: NO termina el ataque (el modo y
   * la animación de patada/taladro siguen igual). Gira de golpe mira, cuerpo y
   * vector de velocidad hacia el enemigo (re-lockeo), ignorando la inercia
   * centrípeta acumulada, con +4 m/s de impulso. Apaga la cámara lenta y mete
   * un latigazo de cámara para sentir cómo se rompe la inercia en el aire.
   */
  private redirectDash(target: TestEnemySphere): void {
    this.eden -= EDEN_DASH_COST;
    const toEnemy = this.tmpA.copy(target.position).sub(this.nyxRoot.position);
    if (toEnemy.lengthSq() > 1e-6) toEnemy.normalize();
    else toEnemy.copy(this.aimForward);
    // Re-lockeo: la mira, el cuerpo y el golpe se estampan hacia el enemigo.
    this.lockedEnemy = target;
    this.redirectTargetEnemy = null;
    this.reticleLockState = 'locked';
    this.aimForward.copy(toEnemy);
    this.prevAimFwd.copy(this.aimForward);
    this.facing.copy(toEnemy);
    // Mantiene al menos el 80% de la velocidad actual al girar bruscamente con el dash.
    const speed = this.velocity.length();
    const newSpeed = Math.max(
      speed * REDIRECT_SPEED_RETENTION,
      DASH_SPEED * 0.85 * this.speedMultiplier,
    );
    this.velocity.copy(toEnemy).multiplyScalar(newSpeed);
    this.mode = 'speed_attack';
    this.dashTimer = 0;
    if (this.speedAttackKind === 'void_fall' || this.speedAttackKind === null) {
      this.speedAttackKind =
        newSpeed >= DRILL_SPEED_THRESHOLD ? 'spiral_drill_kick' : 'gravity_kick';
      this.animator.setState(this.speedAttackKind);
    }
    this.attackElapsed = 0;
    // El dash de redirección corta TODA cámara lenta.
    this.bulletTimeTimer = 0;
    this.redirectWindowTimer = 0;
    // Latigazo potente: tirachinas + tambaleo elástico + micro shake.
    this.camDist = Math.min(this.camDist + CAM_TUG_DISTANCE, CAM_DISTANCE + CAM_TUG_DISTANCE);
    this.dashWobbleImpulse = 1.3;
    this.shake = Math.max(this.shake, 0.2);
    this.audio?.playGravityShift();
    this.onRedirectionSuccess?.();
  }

  /** Clic Izquierdo: Ataque de Velocidad (o disparo de habilidad si hay override). */
  private handleAttack(): void {
    if (this.onLeftClickAttackOverride?.()) return;
    if (this.mode === 'speed_attack') {
      // Si estaba atacando sin lock (p.ej. tras perderlo en cámara lenta) y mete
      // al enemigo dentro de la mira, permite re-lockear con Clic Izquierdo.
      if (!this.lockedEnemy && this.reticleLockState === 'can_lock' && this.candidateEnemy) {
        this.lockedEnemy = this.candidateEnemy;
        this.redirectTargetEnemy = null;
        this.reticleLockState = 'locked';
        this.bulletTimeTimer = 0;
        this.redirectWindowTimer = 0;
        if (this.speedAttackKind === 'void_fall' || this.speedAttackKind === null) {
          this.speedAttackKind =
            this.velocity.length() >= DRILL_SPEED_THRESHOLD ? 'spiral_drill_kick' : 'gravity_kick';
          this.animator.setState(this.speedAttackKind);
        }
      }
      return;
    }
    // En kick_recover espera a terminar de frenar, salvo re-lock en cámara lenta.
    if (this.mode === 'kick_recover' && this.bulletTimeTimer <= 0) return;
    if (this.eden <= 0.01) return;
    const speed = this.velocity.length();

    if (this.mode === 'grounded') {
      // En suelo: te despega y lanza hacia donde apuntas.
      this.nyxRoot.position.addScaledVector(this.groundNormal, FLOAT_ENTRY_OFFSET);
      this.aimForward.copy(this.camFwd).normalize();
      this.aimUp.copy(this.up);
      this.prevAimFwd.copy(this.aimForward);
      this.groundedSlab = null;
    }

    this.animLock = null;
    this.attackElapsed = 0;

    if (this.reticleLockState === 'can_lock' && this.candidateEnemy) {
      // Patada con lock-in: taladro si la velocidad instantánea ya es >= 14.5 m/s.
      this.lockedEnemy = this.candidateEnemy;
      this.reticleLockState = 'locked';
      this.speedAttackKind =
        speed >= DRILL_SPEED_THRESHOLD ? 'spiral_drill_kick' : 'gravity_kick';
      this.animator.setState(this.speedAttackKind);
    } else {
      // Sin enemigo en la mira: Caída al Vacío.
      this.speedAttackKind = 'void_fall';
      this.animator.setState('gravity_fall');
    }

    this.facing.copy(this.aimForward);
    // La Caída al Vacío arranca a 17 m/s; las patadas conservan la velocidad
    // actual y aceleran en vuelo hacia su tope (18 / 26 m/s).
    const startSpeed =
      this.speedAttackKind === 'void_fall' ? Math.max(speed, VOID_FALL_START_SPEED) : speed;
    this.velocity.copy(this.facing).multiplyScalar(startSpeed);
    this.mode = 'speed_attack';
    this.dashTimer = 0;
    // Tirachinas de cámara: la patada/caída arranca con un tirón de distancia.
    this.camDist = Math.min(this.camDist + CAM_TUG_DISTANCE, CAM_DISTANCE + CAM_TUG_DISTANCE);
    this.audio?.playMelee();
  }

  /**
   * Recuperación tras patada: 1 flip en patada simple, 2 flips en taladro espiral.
   */
  private startKickRecover(flips: 1 | 2): void {
    this.flipsTotal = flips;
    this.flipsPlayed = 0;
    this.recoverElapsed = 0;
    this.wantAttack = false;
    this.lockedEnemy = null;
    this.redirectTargetEnemy = null;
    this.redirectWindowTimer = 0;
    this.speedAttackKind = null;
    this.mode = 'kick_recover';
    this.animator.setState('kick_flip');
  }

  private impactEnemy(onHitEnemy: HitEnemyCallback | undefined): void {
    const enemy = this.lockedEnemy;
    if (!enemy) return;
    const isDrill = this.speedAttackKind === 'spiral_drill_kick';
    // Energía cinética del golpe: a más velocidad en el instante del impacto,
    // más fuerza tienen el knockback, el hit-stop, el shake y el FOV punch.
    const impactSpeed = this.velocity.length();
    const kineticMult = Math.max(0.6, Math.pow(impactSpeed / 14, 1.35));
    onHitEnemy?.(enemy, this.tmpE.copy(this.facing), isDrill, impactSpeed);
    this.vfx.spawnBurst(enemy.position, this.facing, 0xffc24d, 30);
    this.shake = Math.max(this.shake, 0.28 * kineticMult);
    // Hit-Stop + FOV Punch + flash de impacto: el taladro pega más fuerte.
    this.hitStopTimer = Math.max(
      this.hitStopTimer,
      (isDrill ? HIT_STOP_DRILL : HIT_STOP_KICK) * kineticMult,
    );
    this.fovPunch = Math.min(
      this.fovPunch,
      Math.max(FOV_PUNCH_CAP, (isDrill ? FOV_PUNCH_DRILL : FOV_PUNCH_KICK) * kineticMult),
    );
    this.impactFlash = Math.max(
      this.impactFlash,
      Math.min(1, (isDrill ? 1.0 : 0.75) * kineticMult),
    );
    // Tambaleo contundente de cámara escalado por la velocidad del impacto.
    this.impactWobbleImpulse = Math.max(this.impactWobbleImpulse, Math.min(1.3, kineticMult));
    this.lockedEnemy = null;
    this.speedAttackKind = null;
    this.startKickRecover(isDrill ? 2 : 1);
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

    // Magnitud analógica del input (1 con teclado): con el stick izquierdo a
    // medio recorrido se camina/flota más despacio.
    const inputMag = hasMoveInput ? Math.min(1, Math.hypot(f, r)) : 0;
    const target = this.tmpB.copy(move).multiplyScalar(targetSpeed * inputMag);
    this.velocity.lerp(target, 1 - Math.exp(-GROUND_ACCEL_LAMBDA * dt));

    // Adherencia a paredes y techos.
    this.velocity.addScaledVector(n, -GRAVITY * dt);
  }

  private updateFloating(dt: number, f: number, r: number): void {
    // WASD / stick izquierdo acelera hacia la cámara (1.0 Edén/s mientras se
    // pulsa), con la magnitud analógica del mando escalando el empuje.
    if ((f !== 0 || r !== 0) && this.eden > 0.01) {
      const dir = this.tmpA.set(0, 0, 0).addScaledVector(this.camFwd, f).addScaledVector(this.camRight, r);
      if (dir.lengthSq() > 1e-6) {
        dir.normalize();
        const mag = Math.min(1, Math.hypot(f, r));
        this.velocity.addScaledVector(dir, FLOAT_ACCEL * mag * this.speedMultiplier * dt);
        this.eden = Math.max(0, this.eden - EDEN_MOVE_DRAIN * dt);
      }
    }

    // Inercia espacial real: rozamiento casi nulo (conserva ~95% por segundo).
    this.velocity.multiplyScalar(Math.exp(-FLOAT_DRAG * dt));

    // Tope suave ~28 m/s (escalado por pasiva de velocidad).
    const sp = this.velocity.length();
    const floatMax = FLOAT_MAX_SPEED * this.speedMultiplier;
    if (sp > floatMax) {
      this.velocity.setLength(THREE.MathUtils.lerp(sp, floatMax, 1 - Math.exp(-1.6 * dt)));
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
    // Solo el dash frontal sigue a la cámara en vivo; los laterales/esquivas
    // conservan su vector lateral para poder esquivar golpes limpiamente.
    if (this.dashIsForward) {
      this.rotateToward(this.dashDir, this.aimForward, DASH_TURN_RATE * dt);
    }
    this.velocity.copy(this.dashDir).multiplyScalar(this.dashSpeed);
    if (this.dashTimer <= 0) this.mode = 'floating';
  }

  private updateSpeedAttack(dt: number, onHitEnemy: HitEnemyCallback | undefined): void {
    this.attackElapsed += dt;
    this.eden = Math.max(0, this.eden - EDEN_ATTACK_DRAIN * dt);

    const speed = this.velocity.length();

    // Evolución en vuelo: gravity_kick -> spiral_drill_kick al cruzar 14.5 m/s.
    if (this.speedAttackKind === 'gravity_kick' && speed >= DRILL_SPEED_THRESHOLD) {
      this.speedAttackKind = 'spiral_drill_kick';
      this.animator.setState('spiral_drill_kick');
    }

    // Lock-In suave: la mira y el cuerpo giran hacia el enemigo lockeado con
    // una tasa proporcional a la velocidad (sigue al enemigo en el centro de
    // la mira/estrella sin tirones imposibles).
    if (this.lockedEnemy) {
      const toEnemy = this.tmpA.copy(this.lockedEnemy.position).sub(this.nyxRoot.position);
      const dist = toEnemy.length();
      if (dist > 1e-4) {
        toEnemy.multiplyScalar(1 / dist);
        const trackRate = THREE.MathUtils.clamp(1.8 + speed * 0.14, 2.2, 5.5);
        this.rotateToward(this.aimForward, toEnemy, trackRate * dt);
        this.rotateToward(this.facing, toEnemy, trackRate * dt);
      }
      // Impacto contra la esfera enemiga.
      if (dist <= PLAYER_RADIUS + this.lockedEnemy.radius + 0.45) {
        this.impactEnemy(onHitEnemy);
        return;
      }
      // Dash de redirección: si el giro que pide el enemigo supera lo que la
      // fuerza centrípeta del auto-aim permite, abre una ventana de cámara
      // lenta real (timeScale 0.20) para curvar el golpe con un Dash W/A/D.
      // SOLO cuando el impacto es físicamente imposible sin re-apuntar: a
      // corta distancia timeToImpact se hunde y dispara requiredTurnRate
      // aunque el enemigo esté enfrente (missAngle mínimo, < 4 m con desvío
      // moderado, o todavía dentro del radio de lock del visor), la física
      // centrípeta conecta el golpe sí o sí y NO se toca la cámara lenta.
      if (
        this.redirectWindowTimer <= 0 &&
        this.redirectReArm <= 0 &&
        this.bulletTimeTimer <= 0 &&
        speed > 1e-3
      ) {
        const velDir = this.tmpB.copy(this.velocity).normalize();
        const missAngle = velDir.angleTo(toEnemy);
        const timeToImpact = Math.max(dist / Math.max(speed, 12), 1e-3);
        const requiredTurnRate = missAngle / timeToImpact;
        const maxCentripetalTurnRate = VEL_ALIGN_RATE / (1 + speed * CENTRIPETAL_SPEED_K);
        if (
          dist >= 4.0 &&
          missAngle >= 0.42 &&
          !this.lockedEnemyInReticle &&
          requiredTurnRate > maxCentripetalTurnRate
        ) {
          this.redirectTargetEnemy = this.lockedEnemy;
          this.redirectWindowTimer = this.computeRedirectWindowSec(this.lockedEnemy);
        }
      }
    }

    // Acelera hacia el tope del tipo de ataque (18/26/25 m/s) curvando el
    // vector de golpe hacia el facing con la física centrípeta.
    const maxSpeed =
      (this.speedAttackKind === 'spiral_drill_kick'
        ? SPIRAL_DRILL_SPEED
        : this.speedAttackKind === 'void_fall'
          ? VOID_FALL_MAX_SPEED
          : GRAVITY_KICK_SPEED) * this.speedMultiplier;
    const targetSpeed =
      speed < maxSpeed
        ? Math.min(maxSpeed, speed + ATTACK_ACCEL * dt)
        : Math.max(maxSpeed, speed - ATTACK_ACCEL * dt);
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
    this.recoverElapsed += dt;
    // Frena suavemente hasta casi 0 mientras reproduce exactamente flipsTotal
    // volteretas. recoverElapsed es un seguro anti-atasco si isFinished() falla.
    this.velocity.multiplyScalar(Math.exp(-KICK_RECOVER_BRAKE * dt));
    const flipDone =
      (this.animator.getState() === 'kick_flip' && this.animator.isFinished()) ||
      this.recoverElapsed >= KICK_RECOVER_MAX_TIME_PER_FLIP * this.flipsTotal;
    if (!flipDone) return;
    this.flipsPlayed++;
    if (this.flipsPlayed < this.flipsTotal) {
      this.animator.setState('kick_flip');
    } else {
      this.mode = 'floating';
      this.animator.setState('zero_g_float');
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

      if (this.mode !== 'grounded') {
        // Suelos oneSidedTop: solo la cara superior (+Y del slab) es pisable;
        // laterales y parte inferior de roca siempre rebotan.
        let isTopFace = true;
        if (this.contact.slab?.oneSidedTop) {
          const topDir = this.tmpA.set(0, 1, 0).applyQuaternion(this.contact.slab.quaternion);
          isTopFace = n.dot(topDir) > 0.65;
        }
        // Aterrizaje real vs choque lateral según el alineamiento de los pies.
        const footAlign = this.up.dot(n);
        const canLand =
          isTopFace &&
          ((this.mode === 'floating' &&
            this.velocity.length() < FLOAT_LAND_MAX_SPEED &&
            footAlign > FLOAT_LAND_MIN_ALIGN) ||
            footAlign > LAND_ALIGN_MIN);

        if (canLand) {
          // Aterriza: esfera apoyada sobre la superficie, nunca al centro del slab.
          this.nyxRoot.position.copy(this.contact.point).addScaledVector(n, PLAYER_RADIUS);
          this.landOn(n, Math.max(0, -approach));
        } else {
          // Choque lateral / canto / de cabeza: rebota físicamente y NO entra
          // en grounded; se queda en floating recomponiéndose con hit_stagger.
          this.nyxRoot.position
            .copy(this.contact.point)
            .addScaledVector(n, PLAYER_RADIUS + 0.08);
          const vn = this.velocity.dot(n);
          if (vn < 0) this.velocity.addScaledVector(n, -2 * vn); // reflect
          this.velocity.multiplyScalar(WALL_BOUNCE_KEEP);
          if (this.mode === 'speed_attack') {
            this.lockedEnemy = null;
            this.redirectTargetEnemy = null;
            this.redirectWindowTimer = 0;
            this.speedAttackKind = null;
          }
          this.mode = 'floating';
          this.groundedSlab = null;
          if (this.bounceCooldown <= 0) {
            this.playOneShot('hit_stagger');
            this.vfx.spawnBurst(this.nyxRoot.position, n, 0xffc24d, 18);
            this.shake = Math.max(this.shake, 0.22);
            // Choque lateral fuerte: mini hit-stop, punch de FOV, flash y un
            // impulso de Dutch roll que inclina el horizonte hacia fuera.
            this.hitStopTimer = Math.max(this.hitStopTimer, HIT_STOP_KICK);
            this.fovPunch = Math.min(this.fovPunch, FOV_PUNCH_KICK);
            this.impactFlash = Math.max(this.impactFlash, 0.75);
            this.rollImpulse = THREE.MathUtils.clamp(
              this.rollImpulse + n.dot(this.camRight) * 0.18,
              -CAM_ROLL_MAX,
              CAM_ROLL_MAX,
            );
            this.bounceCooldown = 0.4;
          }
        }
        return;
      }

      // Corrección posicional: esfera apoyada sobre la superficie.
      this.nyxRoot.position.copy(this.contact.point).addScaledVector(n, PLAYER_RADIUS);
      if (approach < 0) this.velocity.addScaledVector(n, -approach);
      this.groundNormal.copy(n);
      // Re-ancla al slab de contacto (puede ser otro suelo al caminar).
      this.groundedSlab = this.contact.slab;
      if (this.contact.slab) {
        this.groundedSlabPrevPos.copy(this.contact.slab.center);
        this.groundedSlabPrevQuat.copy(this.contact.slab.quaternion);
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
      // Mantiene el ancla fresca (y la cambia si caminó a otro suelo).
      this.groundedSlab = stick.slab;
      if (stick.slab) {
        this.groundedSlabPrevPos.copy(stick.slab.center);
        this.groundedSlabPrevQuat.copy(stick.slab.quaternion);
      }
    } else {
      // Te sales del borde: pasas a flotación 0G (no existe caída con gravedad).
      this.mode = 'floating';
      this.groundedSlab = null;
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
    // Ancla al suelo pisado para heredar su movimiento (Moving Platform Ride).
    this.groundedSlab = this.contact.slab;
    if (this.contact.slab) {
      this.groundedSlabPrevPos.copy(this.contact.slab.center);
      this.groundedSlabPrevQuat.copy(this.contact.slab.quaternion);
    }

    if (prevMode === 'speed_attack') {
      this.lockedEnemy = null;
      this.redirectTargetEnemy = null;
      this.redirectWindowTimer = 0;
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

    // Muelle de aterrizaje: la cámara baja acompañando la flexión de rodillas
    // de land_recover / jump_land, proporcional a la velocidad de impacto.
    this.landingDip = -Math.min(LANDING_DIP_MAX, impact * LANDING_DIP_K);

    // Animación según el ángulo de reorientación y la velocidad de impacto.
    if (angle > WALL_FLIP_ANGLE) {
      this.playOneShot('wall_shift_flip');
      this.vfx.spawnBurst(this.nyxRoot.position, normal, 0xffc24d, 22);
      this.audio?.playGravityShift();
    } else if (impact > LAND_RECOVER_SPEED) {
      this.playOneShot('land_recover');
      this.vfx.spawnBurst(this.nyxRoot.position, normal, 0xffc24d, 26);
      this.audio?.playLand();
    } else if (impact > JUMP_LAND_SPEED) {
      this.playOneShot('jump_land');
      this.vfx.spawnBurst(this.nyxRoot.position, normal, 0xffc24d, 14);
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
    if (this.onDomeBounceDamage) {
      this.onDomeBounceDamage(DOME_BOUNCE_DAMAGE);
    } else if (this.hp <= 0) {
      this.hp = this.maxHp; // reset temporal hasta tener respawn real
    }

    if (this.mode === 'speed_attack') {
      this.lockedEnemy = null;
      this.redirectTargetEnemy = null;
      this.redirectWindowTimer = 0;
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

  private updateEden(dt: number, hasMoveInput: boolean): void {
    // Sin WASD ni clics (en suelo o flotando, incluso deslizándote por inercia
    // en 0G a cualquier velocidad): regenera según edenRegenFrac (base +1%/s).
    const idle =
      (this.mode === 'grounded' || this.mode === 'floating') &&
      !hasMoveInput &&
      !this.attackHeld &&
      !this.dashHeld &&
      !this.gpAttackHeld &&
      !this.gpDashHeld;
    if (idle) {
      this.eden += this.maxEden * this.edenRegenFrac * dt;
    }
    this.eden = Math.min(this.maxEden, this.eden);

    // Regeneración constante de HP por pasiva (hp_regen).
    if (this.hpRegenFrac > 0 && this.hp > 0 && this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + this.maxHp * this.hpRegenFrac * dt);
    }
  }

  private updateCamera(
    dt: number,
    slabs: SlabCollider[],
    camera: THREE.PerspectiveCamera,
    speed: number,
  ): void {
    // Dirección de mira final del frame (puede haber curvado el auto-aim).
    this.computeCameraBasis();
    const camUp = this.tmpD.copy(this.mode === 'grounded' ? this.up : this.aimUp);

    // --- Tirachinas de distancia: el tirón del dash/ataque se recoge
    // suavemente de 6.2 m hasta 5.6 m a velocidad máxima.
    const speed01 = clamp01(speed / FOV_SPEED_REF);
    const distTarget = THREE.MathUtils.lerp(CAM_DISTANCE, CAM_HIGH_SPEED_DISTANCE, speed01);
    this.camDist += (distTarget - this.camDist) * (1 - Math.exp(-(2.0 + speed * 0.45) * dt));

    // --- Encuadre de ataque: en patada/taladro/Caída al Vacío el look sube
    // para que Nyx quede más abajo del centro del visor y no tape al enemigo.
    const liftTarget =
      this.mode === 'speed_attack' && this.speedAttackKind !== null ? CAM_ATTACK_LOOK_LIFT : 0;
    this.lookLift += (liftTarget - this.lookLift) * (1 - Math.exp(-6 * dt));

    // --- Muelle de aterrizaje: el hundimiento recupera hacia 0 en ~0.35 s.
    this.landingDip += -this.landingDip * (1 - Math.exp(-7 * dt));

    // --- Dutch roll del horizonte: derrape del giro cerrado + dash lateral
    // + impulso del choque lateral (hit_stagger). Máx ±0.22 rad (~12.5°).
    const rollTarget =
      THREE.MathUtils.clamp(
        this.turnRate * CAM_ROLL_TURN_K + this.dashSideRoll,
        -CAM_ROLL_MAX,
        CAM_ROLL_MAX,
      ) + this.rollImpulse;
    this.cameraRollRad = THREE.MathUtils.clamp(
      this.cameraRollRad + (rollTarget - this.cameraRollRad) * (1 - Math.exp(-8 * dt)),
      -CAM_ROLL_MAX,
      CAM_ROLL_MAX,
    );
    this.rollImpulse *= Math.exp(-5 * dt);
    this.dashSideRoll *= Math.exp(-2.5 * dt);

    // --- Tambaleo orgánico de cámara (camWobble): turbulencia continua por
    // velocidad (fuerza G) + latigazo elástico amortiguado del dash + tambaleo
    // contundente del impacto, escalado por la energía cinética del golpe.
    this.wobbleTime += dt;
    const wt = this.wobbleTime;
    const g = clamp01((speed - 10) / 14);
    const dashOsc = Math.sin(wt * 34) * this.dashWobbleImpulse;
    const impactOsc = Math.sin(wt * 26 + 0.6) * this.impactWobbleImpulse;
    this.dashWobbleImpulse *= Math.exp(-7 * dt);
    this.impactWobbleImpulse *= Math.exp(-6 * dt);
    const wobblePitch =
      g * 0.026 * (Math.sin(wt * 6.7) * 0.6 + Math.sin(wt * 12.9 + 1.3) * 0.4) +
      dashOsc * 0.05 +
      impactOsc * 0.055;
    const wobbleYaw =
      g * 0.034 * (Math.sin(wt * 5.1 + 2.1) * 0.6 + Math.sin(wt * 10.7 + 0.4) * 0.4) +
      dashOsc * 0.04 +
      impactOsc * 0.045;
    const wobbleRoll =
      g * 0.042 * Math.sin(wt * 4.3 + 0.9) + dashOsc * 0.085 + impactOsc * 0.07;

    const look = this.tmpA
      .copy(this.nyxRoot.position)
      .addScaledVector(this.up, CAM_LOOK_HEIGHT + this.landingDip)
      .addScaledVector(camUp, this.lookLift)
      .addScaledVector(this.camRight, wobbleYaw * this.camDist)
      .addScaledVector(camUp, wobblePitch * this.camDist);
    const back = this.tmpB.copy(this.camFwd).multiplyScalar(-1);

    // Evita atravesar slabs con la cámara.
    let camDist = this.camDist;
    const camHit = raycastSlabs(slabs, look, back, this.camDist);
    if (camHit) camDist = Math.max(1.1, camHit.distance - 0.25);

    const camPos = this.tmpC.copy(look).addScaledVector(back, camDist);
    // Vibración: shake de impactos + micro-temblor extra durante el hit-stop.
    const jitter = this.shake + (this.hitStopTimer > 0 ? 0.05 : 0);
    if (jitter > 0.001) {
      camPos.x += (Math.random() * 2 - 1) * jitter;
      camPos.y += (Math.random() * 2 - 1) * jitter;
      camPos.z += (Math.random() * 2 - 1) * jitter;
    }
    camera.position.copy(camPos);
    camera.up.copy(camUp);
    const totalRoll = this.cameraRollRad + wobbleRoll;
    if (Math.abs(totalRoll) > 1e-4) {
      this.quat.setFromAxisAngle(this.camFwd, totalRoll);
      camera.up.applyQuaternion(this.quat);
    }
    camera.lookAt(look);

    // Frenesí: FOV dinámico con la velocidad + punch de impacto (zoom corto).
    const targetFov = this.settings.baseFov + FOV_BOOST * speed01 + this.fovPunch;
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
