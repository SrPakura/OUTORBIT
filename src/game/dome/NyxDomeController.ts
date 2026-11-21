import * as THREE from 'three';
import {
  DOME_PLAYER_BOUND_RADIUS,
  type DomeHudState,
  type NyxMovementMode,
  type SlabCollider,
  type SlabRaycastHit,
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
// NyxDomeController — movimiento 360°, cámara inteligente, ataques base y
// recursos de Nyx dentro de la cúpula de 50 m.
//
// Los 5 pilares:
//  1. Flotar 0G (Space en el aire / Clic Derecho): `zero_g` + `zero_g_float`,
//     regeneración de Edén al estar quieta.
//  2. Vuelo 3D con WASD en la dirección de la cámara (drena Edén al acelerar),
//     Air Dash con Shift (~12 Edén) y `isDrillReady` sobre el umbral de taladro.
//  3. Suelo sobre cualquier SlabCollider (suelo, pared o techo): el `up` de
//     Nyx se alinea con la normal del suelo; andar/correr/saltar/slide.
//  4. Aterrizar/despegar: caída libre con gravedad personal, lanzamiento hacia
//     superficies apuntadas (Clic Derecho, raycast hasta 42 m) y aterrizajes
//     con `land_recover` / `wall_shift_flip` según el ángulo de la normal.
//  5. Ataques (Clic Izquierdo): Patada Gravitatoria (`gravity_kick`) bajo el
//     umbral de taladro (1 voltereta `kick_flip` de recuperación) o Patada
//     Taladro Espiral (`spiral_drill_kick`) sobre el umbral (2-3 volteretas).
//
// La cámara orbita 360° libremente cuando Nyx está quieta y se recoloca
// suavemente detrás de su espalda cuando se mueve, con FOV dinámico y shake.
// ============================================================================

const DEG = Math.PI / 180;

// --- Física base
const PLAYER_RADIUS = 0.45;
const GRAVITY = 22;
const FALL_SPEED_CAP = 46;
const WALK_SPEED = 4.6;
const RUN_SPEED = 8.6;
const SLIDE_SPEED = 11.5;
const GROUND_ACCEL_LAMBDA = 10;
const JUMP_SPEED = 9.6;
const GROUND_STICK_RANGE = 0.35;

// --- Flotación 0G
const ZERO_G_ACCEL = 15;
const ZERO_G_MAX_SPEED = 16;
const ZERO_G_DRAG = 0.9;
const EDEN_FLIGHT_DRAIN = 2.6;
const AIR_DASH_COST = 12;
const AIR_DASH_SPEED = 30;
const AIR_DASH_DURATION = 0.35;

// --- Ataques
const DRILL_SPEED_THRESHOLD = 24;
const DRILL_EXTREME_SPEED = 34;
const GRAVITY_KICK_SPEED = 21;
const GRAVITY_KICK_TIME = 0.55;
const SPIRAL_DRILL_SPEED = 34;
const SPIRAL_DRILL_TIME = 0.5;

// --- Recursos
const EDEN_IDLE_REGEN_FRAC = 0.01; // 1% de maxEden por segundo
const EDEN_GROUND_REGEN = 18;
const DOME_BOUNCE_DAMAGE = 10;

// --- Cámara / mira
const AIM_RANGE = 42;
const CAM_DISTANCE = 6.2;
const CAM_LOOK_HEIGHT = 1.35;
const CAM_PITCH_LIMIT = 0.95;
const FOV_SPEED_REF = 32;
const FOV_BOOST = 20;

// --- Orientación
const WALL_FLIP_ANGLE = 55 * DEG;

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
  private wantAltFire = false;
  private wantSlot: 1 | 2 | 3 | null = null;
  private activeSlot: 1 | 2 | 3 = 1;

  // --- Física / estado
  private readonly velocity = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly facing = new THREE.Vector3(0, 0, 1);
  private readonly groundNormal = new THREE.Vector3(0, 1, 0);
  private readonly kickDir = new THREE.Vector3(0, 0, 1);
  private mode: NyxMovementMode = 'falling';
  private floatEnabled = false;
  private isSliding = false;
  private readonly contact: SlabContact = {
    slab: null,
    normal: new THREE.Vector3(),
    depth: 0,
    point: new THREE.Vector3(),
  };

  // --- Temporizadores
  private time = 0;
  private dashTimer = 0;
  private kickTimer = 0;
  private kickImpulseTime = 0;
  private kickSpeed = 0;
  private flipsTotal = 0;
  private flipsPlayed = 0;
  private bounceCooldown = 0;
  private animLock: NyxAnimState | null = null;

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

  // --- Cámara
  private readonly camDir = new THREE.Vector3(0, 0.32, -1).normalize();
  private aimingAtSurface = false;
  private aimDistance: number | null = null;

  // --- Scratch (ninguno vive más allá de un helper o de un tramo de update)
  private readonly camFwd = new THREE.Vector3();
  private readonly camRight = new THREE.Vector3();
  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();
  private readonly tmpC = new THREE.Vector3();
  private readonly quat = new THREE.Quaternion();
  private readonly mat = new THREE.Matrix4();

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
    // Estado inicial: cae desde donde la escena haya colocado a Nyx.
    this.animator.setState('gravity_fall');
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

  onMouseMove(dx: number, dy: number): void {
    if (!this.pointerLocked) return;
    const sens = 0.0023 * this.settings.mouseSensitivity;

    // Yaw: orbita la cámara alrededor del up de Nyx (360° libres).
    this.quat.setFromAxisAngle(this.up, -dx * sens);
    this.camDir.applyQuaternion(this.quat);

    // Pitch: alrededor del eje derecho de la pantalla.
    const right = this.tmpA.crossVectors(this.up, this.camDir);
    if (right.lengthSq() > 1e-6) {
      right.normalize();
      const pitch = dy * sens * (this.settings.invertY ? -1 : 1);
      this.quat.setFromAxisAngle(right, pitch);
      this.camDir.applyQuaternion(this.quat);
    }

    // Límite de pitch: deja ver desde arriba o desde abajo sin pasar el polo.
    const d = this.camDir.dot(this.up);
    if (d > CAM_PITCH_LIMIT || d < -CAM_PITCH_LIMIT) {
      this.camDir
        .addScaledVector(this.up, Math.sign(d) * CAM_PITCH_LIMIT - d)
        .normalize();
    }
  }

  onMouseDown(button: number): void {
    if (!this.pointerLocked) return;
    if (button === 0) this.wantAttack = true;
    else if (button === 2) this.wantAltFire = true;
  }

  onKeyDown(code: string): void {
    if (this.codesDown.has(code)) return; // ignora auto-repeat
    this.codesDown.add(code);
    const action = this.actionByCode.get(code);
    if (action === 'jump') this.wantJump = true;
    else if (action === 'sprint') this.wantDash = true;
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
      pointerLocked: this.pointerLocked,
      aimingAtSurface: this.aimingAtSurface,
      aimDistance: this.aimDistance,
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

  update(dt: number, slabs: SlabCollider[], camera: THREE.PerspectiveCamera): void {
    dt = Math.min(dt, 0.05);
    this.time += dt;
    updateSlabMotion(slabs, this.time);

    // --- Decaimientos
    if (this.bounceCooldown > 0) this.bounceCooldown -= dt;
    if (this.domeBounceFlash > 0) {
      this.domeBounceFlash = Math.max(0, this.domeBounceFlash - dt * 2.2);
    }
    this.shake *= Math.exp(-6 * dt);

    // --- Base de la cámara (dirección de la mira)
    camera.getWorldDirection(this.camFwd);
    this.camRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();

    // --- Entrada de movimiento
    const f = (this.isDown('forward') ? 1 : 0) - (this.isDown('back') ? 1 : 0);
    const r = (this.isDown('right') ? 1 : 0) - (this.isDown('left') ? 1 : 0);
    const hasMoveInput = f !== 0 || r !== 0;
    const sprintHeld = this.isDown('sprint');

    // --- Mira (raycast hasta 42 m para HUD y Clic Derecho)
    const aim = raycastSlabs(slabs, this.nyxRoot.position, this.camFwd, AIM_RANGE);
    this.aimingAtSurface = aim !== null;
    this.aimDistance = aim ? aim.distance : null;

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
    if (this.wantAltFire) {
      this.wantAltFire = false;
      this.handleAltFire(aim);
    }

    // --- Física por modo
    switch (this.mode) {
      case 'grounded':
        this.updateGrounded(dt, f, r, sprintHeld, hasMoveInput);
        break;
      case 'zero_g':
        this.updateZeroG(dt, f, r);
        break;
      case 'falling':
        this.velocity.addScaledVector(this.up, -GRAVITY * dt);
        if (this.velocity.length() > FALL_SPEED_CAP) {
          this.velocity.setLength(FALL_SPEED_CAP);
        }
        break;
      case 'dashing':
        this.dashTimer -= dt;
        if (this.dashTimer <= 0) this.mode = this.floatEnabled ? 'zero_g' : 'falling';
        break;
      case 'kicking':
        this.updateKicking(dt);
        break;
      case 'kick_recover':
        this.updateKickRecover(dt);
        break;
    }

    // --- Integración
    this.nyxRoot.position.addScaledVector(this.velocity, dt);

    // --- Colisión con slabs (y aterrizaje)
    this.resolveGround(slabs);

    // --- Barrera blanca de la cúpula
    this.resolveDomeBound();

    const speed = this.velocity.length();
    const verticalVel = this.velocity.dot(this.up);

    // --- Alineación del up con el suelo + rumbo (facing)
    this.updateOrientation(dt, speed);

    // --- Selección de animación
    this.updateAnimState(speed, verticalVel, hasMoveInput);

    // --- Recursos (Edén)
    this.updateEden(dt, speed, hasMoveInput);

    // --- Cámara inteligente
    this.updateCamera(dt, slabs, camera, speed, hasMoveInput);

    // --- Animador y VFX
    const hairG = this.mode === 'grounded' || this.mode === 'falling' ? -1 : -0.25;
    this.animator.update(dt, {
      speed01: clamp01(speed / RUN_SPEED),
      turnRate: this.turnRate,
      verticalVel,
      hairGravityLocal: [0, hairG, 0],
    });
    this.vfx.update(dt);
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

    // Dirección de input proyectada al plano tangente del suelo.
    const move = this.tmpA.set(0, 0, 0);
    if (f !== 0 || r !== 0) {
      move.addScaledVector(this.camFwd, f).addScaledVector(this.camRight, r);
      move.addScaledVector(n, -move.dot(n));
      if (move.lengthSq() > 1e-6) move.normalize();
    }

    const speed = this.velocity.length();
    this.isSliding = sprintHeld && hasMoveInput && speed > RUN_SPEED + 0.5;
    const targetSpeed = this.isSliding ? SLIDE_SPEED : sprintHeld ? RUN_SPEED : WALK_SPEED;

    const target = this.tmpB.copy(move).multiplyScalar(targetSpeed);
    this.velocity.lerp(target, 1 - Math.exp(-GROUND_ACCEL_LAMBDA * dt));

    // Gravedad personal hacia el suelo (pega a paredes y techos).
    this.velocity.addScaledVector(n, -GRAVITY * dt);
  }

  private updateZeroG(dt: number, f: number, r: number): void {
    if ((f !== 0 || r !== 0) && this.eden > 0.5) {
      const dir = this.tmpA
        .set(0, 0, 0)
        .addScaledVector(this.camFwd, f)
        .addScaledVector(this.camRight, r)
        .normalize();
      this.velocity.addScaledVector(dir, ZERO_G_ACCEL * dt);
      this.eden = Math.max(0, this.eden - EDEN_FLIGHT_DRAIN * dt);
    }
    this.velocity.multiplyScalar(Math.exp(-ZERO_G_DRAG * dt));
    const sp = this.velocity.length();
    if (sp > ZERO_G_MAX_SPEED) {
      this.velocity.setLength(
        THREE.MathUtils.lerp(sp, ZERO_G_MAX_SPEED, 1 - Math.exp(-1.6 * dt)),
      );
    }
  }

  private updateKicking(dt: number): void {
    this.kickTimer += dt;
    if (this.kickTimer < this.kickImpulseTime) {
      const target = this.tmpA.copy(this.kickDir).multiplyScalar(this.kickSpeed);
      this.velocity.lerp(target, 1 - Math.exp(-18 * dt));
    } else {
      // Fin del impulso: encadena las volteretas de recuperación.
      this.mode = 'kick_recover';
      this.flipsPlayed = 0;
      this.velocity.multiplyScalar(0.5);
      this.animator.setState('kick_flip');
    }
  }

  private updateKickRecover(dt: number): void {
    this.velocity.multiplyScalar(Math.exp(-2.6 * dt));
    if (this.animator.getState() === 'kick_flip' && this.animator.isFinished()) {
      this.flipsPlayed++;
      if (this.flipsPlayed < this.flipsTotal) {
        this.animator.setState('kick_flip');
      } else {
        this.mode = this.floatEnabled ? 'zero_g' : 'falling';
      }
    }
  }

  // ==========================================================================
  // Acciones
  // ==========================================================================

  private handleJump(): void {
    if (this.mode === 'grounded') {
      // Salto hacia la normal del suelo (vale para paredes y techos).
      const vn = this.velocity.dot(this.groundNormal);
      this.velocity.addScaledVector(this.groundNormal, JUMP_SPEED - vn);
      this.mode = 'falling';
      this.playOneShot('jump_land');
      this.audio?.playJump();
    } else {
      this.setFloating(!this.floatEnabled);
    }
  }

  private setFloating(on: boolean): void {
    this.floatEnabled = on;
    if (on) {
      this.velocity.multiplyScalar(0.25);
      this.mode = 'zero_g';
      this.audio?.playAnchor();
    } else if (this.mode === 'zero_g') {
      this.mode = 'falling';
    }
  }

  private handleDash(f: number, r: number): void {
    const airborne = this.mode === 'zero_g' || this.mode === 'falling';
    if (!airborne || this.dashTimer > 0 || this.eden < AIR_DASH_COST) return;
    const dir = this.tmpA.set(0, 0, 0);
    if (f !== 0 || r !== 0) {
      dir.addScaledVector(this.camFwd, f).addScaledVector(this.camRight, r).normalize();
    } else {
      dir.copy(this.facing);
    }
    if (dir.lengthSq() < 0.25) dir.set(0, 0, 1);
    this.eden -= AIR_DASH_COST;
    this.velocity.copy(dir).multiplyScalar(AIR_DASH_SPEED);
    this.mode = 'dashing';
    this.dashTimer = AIR_DASH_DURATION;
    this.animator.setState('air_dash');
    this.audio?.playGravityShift();
  }

  private handleAttack(): void {
    if (this.mode === 'kicking' || this.mode === 'kick_recover') return;
    const speed = this.velocity.length();
    this.kickDir.copy(this.camFwd).normalize();
    if (speed < DRILL_SPEED_THRESHOLD) {
      // Patada Gravitatoria: 1 voltereta de recuperación.
      this.kickSpeed = Math.max(GRAVITY_KICK_SPEED, speed + 6);
      this.kickImpulseTime = GRAVITY_KICK_TIME;
      this.flipsTotal = 1;
      this.animator.setState('gravity_kick');
    } else {
      // Patada Taladro Espiral: 2-3 volteretas para frenar la inercia.
      this.kickSpeed = Math.max(SPIRAL_DRILL_SPEED, speed * 1.12);
      this.kickImpulseTime = SPIRAL_DRILL_TIME;
      this.flipsTotal = speed >= DRILL_EXTREME_SPEED ? 3 : 2;
      this.animator.setState('spiral_drill_kick');
      this.shake = Math.max(this.shake, 0.12);
    }
    this.mode = 'kicking';
    this.kickTimer = 0;
    this.flipsPlayed = 0;
    this.animLock = null;
    this.audio?.playMelee();
  }

  private handleAltFire(aim: SlabRaycastHit | null): void {
    if (aim) {
      // Impulso hacia la superficie apuntada orientando el up a la nueva normal.
      const dir = this.tmpA.copy(aim.point).sub(this.nyxRoot.position).normalize();
      const launchSpeed = THREE.MathUtils.clamp(aim.distance * 1.8, 18, 34);
      this.velocity.copy(dir).multiplyScalar(launchSpeed);
      this.mode = 'falling';
      this.floatEnabled = false;
      this.audio?.playGravityShift();
    } else if (this.mode === 'grounded') {
      // Despegue suave desde el suelo.
      this.setFloating(true);
      this.velocity.copy(this.up).multiplyScalar(3);
    } else {
      this.setFloating(!this.floatEnabled);
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

      if (approach < 0) {
        this.velocity.addScaledVector(n, -approach);
        if (this.mode !== 'grounded' && (approach < -1.5 || this.mode === 'falling')) {
          this.landOn(n, -approach);
        }
      }
      if (this.mode === 'grounded') this.groundNormal.copy(n);
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
      this.mode = 'falling';
    }
  }

  private landOn(normal: THREE.Vector3, impact: number): void {
    const angle = Math.acos(THREE.MathUtils.clamp(this.up.dot(normal), -1, 1));
    this.mode = 'grounded';
    this.groundNormal.copy(normal);
    this.dashTimer = 0;
    this.kickTimer = 0;

    if (angle > WALL_FLIP_ANGLE) {
      // Cambio de gravedad brusco (pared/techo): voltereta de reorientación.
      this.playOneShot('wall_shift_flip');
      this.audio?.playGravityShift();
    } else if (impact > 13) {
      this.playOneShot('land_recover');
      this.vfx.spawnBurst(this.nyxRoot.position, normal, 0xffc24d, 26);
      this.audio?.playLand();
    } else if (impact > 3) {
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

    this.playOneShot('dome_bounce');
    this.vfx.spawnDomeBounceRing(
      this.nyxRoot.position,
      this.tmpB.copy(n).multiplyScalar(-1), // normal hacia el centro
    );
    this.domeBounceFlash = 1;
    this.shake = Math.max(this.shake, 0.35);
    this.bounceCooldown = 0.6;
    if (this.mode !== 'grounded') this.mode = this.floatEnabled ? 'zero_g' : 'falling';
    this.audio?.playBounce();
    this.audio?.playHurt();
  }

  // ==========================================================================
  // Orientación, animación, recursos y cámara
  // ==========================================================================

  private turnRate = 0;

  private updateOrientation(dt: number, speed: number): void {
    // El up de Nyx persigue la normal del suelo (paredes y techos incluidos).
    if (this.mode === 'grounded') {
      this.up.lerp(this.groundNormal, 1 - Math.exp(-12 * dt)).normalize();
    }

    // El rumbo persigue la velocidad proyectada al plano perpendicular al up.
    if (speed > 1.2) {
      const target = this.tmpA.copy(this.velocity);
      target.addScaledVector(this.up, -this.velocity.dot(this.up));
      if (target.lengthSq() > 0.04) {
        target.normalize();
        const prev = this.tmpB.copy(this.facing);
        this.facing.lerp(target, 1 - Math.exp(-9 * dt));
        this.facing.addScaledVector(this.up, -this.facing.dot(this.up));
        this.facing.normalize();
        const cross = this.tmpC.crossVectors(prev, this.facing);
        const turn = Math.asin(THREE.MathUtils.clamp(cross.dot(this.up), -1, 1)) / dt;
        this.turnRate = THREE.MathUtils.clamp(turn, -12, 12);
      } else {
        this.turnRate = 0;
      }
    } else {
      this.turnRate = 0;
    }

    // +Z = frente de nyx_rigged.glb, +Y = cabeza: base ortonormal directa.
    const right = this.tmpA.crossVectors(this.up, this.facing);
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    else right.normalize();
    this.mat.makeBasis(right, this.up, this.facing);
    this.quat.setFromRotationMatrix(this.mat);
    this.nyxRoot.quaternion.slerp(this.quat, 1 - Math.exp(-14 * dt));
  }

  private updateAnimState(
    speed: number,
    verticalVel: number,
    hasMoveInput: boolean,
  ): void {
    if (this.animLock !== null) {
      if (this.animator.isFinished()) {
        this.animLock = null;
      } else if (
        this.animLock === 'jump_land' &&
        this.mode === 'falling' &&
        verticalVel < 0
      ) {
        // El salto ya está subiendo: pasa a caída sin esperar al one-shot.
        this.animLock = null;
      }
      return;
    }
    if (this.mode === 'kicking' || this.mode === 'kick_recover' || this.mode === 'dashing') {
      return; // los maneja la lógica de cada modo
    }
    if (this.mode === 'grounded') {
      if (this.isSliding) this.animator.setState('gravity_slide');
      else if (speed > 0.7 && hasMoveInput) this.animator.setState('run');
      else this.animator.setState('idle');
    } else if (this.mode === 'zero_g') {
      this.animator.setState('zero_g_float');
    } else if (this.mode === 'falling') {
      this.animator.setState('gravity_fall');
    }
  }

  private updateEden(dt: number, speed: number, hasMoveInput: boolean): void {
    const idleGrounded = this.mode === 'grounded' && !hasMoveInput && speed < 0.8;
    const idleFloating = this.mode === 'zero_g' && !hasMoveInput && speed < 0.8;
    if (idleGrounded || idleFloating) {
      this.eden += this.maxEden * EDEN_IDLE_REGEN_FRAC * dt;
    }
    if (idleGrounded) this.eden += EDEN_GROUND_REGEN * dt;
    this.eden = Math.min(this.maxEden, this.eden);
  }

  private updateCamera(
    dt: number,
    slabs: SlabCollider[],
    camera: THREE.PerspectiveCamera,
    speed: number,
    hasMoveInput: boolean,
  ): void {
    const moving =
      hasMoveInput ||
      speed > 2 ||
      this.mode === 'kicking' ||
      this.mode === 'dashing' ||
      this.mode === 'kick_recover';

    if (moving) {
      // Sigue suavemente la espalda de Nyx (el ratón sigue guiando el rumbo).
      const behind = this.tmpA.copy(this.facing).multiplyScalar(-1);
      const k = 1 - Math.exp(-(1.8 + 2.6 * clamp01(speed / 12)) * dt);
      this.camDir.lerp(behind, k).normalize();
    }
    // Quieta: la órbita 360° la controla solo el ratón (onMouseMove).

    const look = this.tmpB
      .copy(this.nyxRoot.position)
      .addScaledVector(this.up, CAM_LOOK_HEIGHT);

    // Evita atravesar slabs con la cámara.
    let camDist = CAM_DISTANCE;
    const camHit = raycastSlabs(slabs, look, this.camDir, CAM_DISTANCE);
    if (camHit) camDist = Math.max(1.1, camHit.distance - 0.25);

    const camPos = this.tmpC.copy(look).addScaledVector(this.camDir, camDist);
    if (this.shake > 0.001) {
      camPos.x += (Math.random() * 2 - 1) * this.shake;
      camPos.y += (Math.random() * 2 - 1) * this.shake;
      camPos.z += (Math.random() * 2 - 1) * this.shake;
    }
    camera.position.copy(camPos);
    camera.up.copy(this.up);
    camera.lookAt(look);

    // Frenesí: FOV dinámico con la velocidad.
    const targetFov =
      this.settings.baseFov + FOV_BOOST * clamp01(speed / FOV_SPEED_REF);
    if (Math.abs(targetFov - camera.fov) > 0.05) {
      camera.fov = targetFov;
      camera.updateProjectionMatrix();
    }
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

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
