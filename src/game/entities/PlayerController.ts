import * as THREE from 'three';
import {
  GAME_CONSTANTS,
  type CharacterId,
  type CharacterProfile,
  type PlanetRuntime,
  type PlayerBehaviorVector,
} from '../types';
import { alignBasisToUp, findStrongestGravityPlanet, getTangentAxes } from '../math/spherical';
import { buildCharacterModel, buildDisguiseOverlay } from '../render/proceduralModels';
import type { LockOnHandle, WorldObjectsManager } from './WorldObjects';

// ============================================================================
// Constantes de simulación del jugador
// ============================================================================
const GRAVITY_BASE = 22;
const BASIS_ALIGN_SPEED = 9; // velocidad de reorientación del marco tangente
const SPRINT_MULTIPLIER = 1.55;
const DOUBLE_JUMP_FACTOR = 0.85;
const MOUSE_SENSITIVITY = 0.0036;
const PITCH_MIN = -1.25;
const PITCH_MAX = 1.3;
const AIM_CONE_MARGIN = 0.32; // rad de tolerancia sobre el radio angular del planeta
const HEAD_HEIGHT = 1.5;

// Ancla gravitatoria (Espacio en el aire)
const ANCHOR_COOLDOWN = 0.9;
const ANCHOR_BURST_DECAY = 3.2;
const ANCHOR_FX_TIME = 0.35;

// Parry (F / Q)
const PARRY_WINDOW = 0.32;
const PARRY_COOLDOWN = 0.85;

// Campo de Estasis (R/C captura; Clic Izquierdo dispara 1 objeto o melee)
const STASIS_GRAB_RANGE = 9;

// Lock-On (Tab/V + Flechas): estilo GTA San Andreas
const LOCK_ON_RANGE = 34;
const LOCK_ON_DROP_RANGE = 44; // margen antes de perder el objetivo fijado

// Gravity Shift / Gravity Dash (Clic Derecho)
const GRAVITY_DASH_SPEED = 30;
const GRAVITY_DASH_TIME = 0.32;
const GRAVITY_DASH_HIT_INTERVAL = 0.08;
const GRAVITY_DASH_COOLDOWN = 0.8; // dash local: cooldown corto
const GRAVITY_JUMP_COOLDOWN_MIN = 1.8; // salto entre planetas: 1.8s-2.8s
const GRAVITY_JUMP_COOLDOWN_MAX = 2.8;
const GRAVITY_JUMP_COOLDOWN_DIST0 = 30; // distancia de referencia del mapeo

// Subsuelo (Digger)
const BURROW_SPEED_MUL = 0.8;
const BURROW_SINK = -0.95;
const CORE_DIVE_SPEED = 55;
const CORE_DIVE_DEPTH_RATIO = 0.82; // cuánto baja el radio hacia el núcleo

// Nado en burbujas
const SWIM_BASE_SPEED = 8;
const SWIM_BOOST_TIME = 0.6;
const SWIM_BOOST_MUL = 1.45;

// Vuelo cinematográfico (Gravity Shift)
const FLIGHT_MIN_DURATION = 1.4;
const FLIGHT_MAX_DURATION = 4.5;
const FLIGHT_SPEED_DIVISOR = 60;
const FLIGHT_LANDING_PITCH = 0.12;
const FLIGHT_ARC_SCALE = 1.15;
const FLIGHT_ARC_LIFT = 8;
const FLIGHT_MID_SLOWDOWN = 0.06; // ralentiza el punto medio entre órbitas

// Vuelo libre (tras salir de una burbuja): propulsión + gravedad suave para
// poder encadenar burbujas/planetas sin caer en picado.
const SWIM_EXIT_BOOST = 1.7;
const FREE_FLIGHT_GRAVITY = 0.25;

// Combate
const SHOCKWAVE_MIN_FALL = 17;
const SHOCKWAVE_RADIUS = 7.5;
const DISGUISE_DURATION = 30;
const INVULN_TIME = 0.9;

// Hielo resbaladizo (bioma cryo / parches de hielo): baja adherencia al frenar.
const ICE_GRIP = 1.6;

interface CharacterParts {
  head: THREE.Object3D;
  leftArm: THREE.Object3D;
  rightArm: THREE.Object3D;
  leftLeg: THREE.Object3D;
  rightLeg: THREE.Object3D;
  tail: THREE.Object3D;
}

/**
 * Controlador del personaje activo en 3ª persona sobre esferas.
 *
 * - WASD: movimiento en el plano tangente a la esfera actual.
 * - Ratón (Pointer Lock): yaw/pitch dentro del marco `basisQuat` (sin gimbal lock).
 * - Espacio: salto + doble impulso aéreo; en el aire, Ancla Gravitatoria
 *   (impulso encadenable, cooldown 0.9s); con Digger en subsuelo, cruce del núcleo.
 * - Shift: sprint; con Digger en superficie, alterna el subsuelo (`isBurrowing`).
 * - 1/2/3: cambio instantáneo de personaje (Kitsune / Digger / Axel).
 * - Clic Derecho (mantener): Gravity Shift (cámara lenta + apuntado a otro planeta);
 *   al soltar, vuelo orbital cinematográfico con aterrizaje de pie. Si no hay
 *   planeta destino, Gravity Dash local hacia la cámara (empuja guardias/cajas).
 * - R/C: captura objetos cercanos al Campo de Estasis (hasta 4 en órbita).
 * - Clic Izquierdo: dispara 1 solo objeto de la Estasis hacia el objetivo
 *   fijado (Lock-On) o la mira; con 0 objetos, golpe melee rápido.
 * - Tab/V (o clic central): Lock-On del objetivo válido más cercano;
 *   Flecha Izquierda/Derecha: cicla el objetivo fijado.
 * - F/Q: Parry (ventana 0.32s, cooldown 0.85s).
 * - E: noqueo por la espalda + robo de uniforme (`isDisguised`).
 *
 * Cero allocations por frame: todos los vectores/cuaterniones son preasignados.
 */
export class PlayerController {
  readonly root = new THREE.Group();
  readonly basisQuat = new THREE.Quaternion();
  readonly behavior: PlayerBehaviorVector = {
    stealthKnockouts: 0,
    disguiseTimeSec: 0,
    alarmsTriggered: 0,
    bruteKills: 0,
    aerialAttacks: 0,
    burrowDistance: 0,
    burrowTimeSec: 0,
    stasisThrows: 0,
    parriesLanded: 0,
    damageTaken: 0,
    totalTimeSec: 0,
  };

  yaw = 0;
  pitch = 0.3;

  gravityShifting = false;
  gravityTarget: PlanetRuntime | null = null;
  hp: number = GAME_CONSTANTS.PLAYER_MAX_HP;
  walkDistance = 0;
  isBurrowing = false;
  isSwimming = false;
  isDisguised = false;

  private readonly planets: PlanetRuntime[];
  private readonly camera: THREE.PerspectiveCamera;
  private readonly world: WorldObjectsManager;
  private currentPlanet: PlanetRuntime;
  private profile: CharacterProfile;
  private activeCharacter: CharacterId;

  private readonly pos = new THREE.Vector3();
  private readonly lastUp = new THREE.Vector3(0, 1, 0);
  private readonly flightVel = new THREE.Vector3();
  private readonly swimVel = new THREE.Vector3();
  private readonly anchorBurst = new THREE.Vector3();
  private readonly iceVel = new THREE.Vector3(); // inercia sobre hielo
  private altitude = 0;
  private vertVel = 0;
  private grounded = true;
  private jumpsUsed = 0;

  // Vuelo cinematográfico dirigido (Bezier elevado sobre el origen del nivel).
  private inFlight = false;
  private flightDirected = false;
  private flightDest: PlanetRuntime | null = null;
  private flightTime = 0;
  private flightDuration = 2;
  private readonly flightStart = new THREE.Vector3();
  private readonly flightCtrl = new THREE.Vector3();
  private readonly flightEnd = new THREE.Vector3();

  // Cruce del núcleo (Digger): giro de 180º en un solo eje `diveAxis`.
  private coreDiveActive = false;
  private diveTime = 0;
  private diveDuration = 1;
  private divePrevAngle = 0;
  private readonly diveStart = new THREE.Vector3();
  private readonly diveEnd = new THREE.Vector3();
  private readonly diveAxis = new THREE.Vector3();
  private readonly diveUpStart = new THREE.Vector3();

  // Habilidades.
  private anchorCooldown = 0;
  private anchorFxTimer = 0;
  private parryTimer = 0;
  private parryCooldown = 0;
  private disguiseTimer = 0;
  private invulnTimer = 0;
  private swimBoostTimer = 0;
  private burrowSink = 0;

  // Lock-On (Tab/V + Flechas).
  private lockedTarget: LockOnHandle | null = null;
  private readonly lockedTargetPos = new THREE.Vector3();

  // Gravity Shift / Gravity Dash: cooldown proporcional a la distancia.
  private gravityShiftCooldown = 0;
  private gravityShiftCooldownMax = 1;
  private dashTimer = 0;
  private dashHitTimer = 0;
  private readonly dashDir = new THREE.Vector3();

  private readonly keys = new Set<string>();
  private readonly models = new Map<CharacterId, THREE.Group>();
  private readonly parts = new Map<CharacterId, CharacterParts>();
  private readonly bodyRoot = new THREE.Group();
  private readonly disguiseOverlay: THREE.Group;
  private readonly anchorFx: THREE.Group;
  private readonly flightFx: THREE.Group;
  private readonly flightRingA: THREE.Mesh;
  private readonly flightRingB: THREE.Mesh;
  private walkPhase = 0;
  private isMoving = false;

  // Temporales preasignados (sin GC en el loop)
  private readonly _up = new THREE.Vector3();
  private readonly _forward = new THREE.Vector3();
  private readonly _right = new THREE.Vector3();
  private readonly _move = new THREE.Vector3();
  private readonly _v1 = new THREE.Vector3();
  private readonly _v2 = new THREE.Vector3();
  private readonly _v3 = new THREE.Vector3();
  private readonly _q1 = new THREE.Quaternion();
  private readonly _yawQuat = new THREE.Quaternion();
  private readonly _flipQuat = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    Math.PI
  );

  constructor(
    planets: PlanetRuntime[],
    camera: THREE.PerspectiveCamera,
    world: WorldObjectsManager,
    spawnPlanetId: string,
    spawnDir: THREE.Vector3
  ) {
    if (planets.length === 0) {
      throw new Error('PlayerController: se necesita al menos un planeta');
    }
    this.planets = planets;
    this.camera = camera;
    this.world = world;
    this.currentPlanet =
      planets.find((p) => p.spec.id === spawnPlanetId) ?? planets[0];
    this.activeCharacter = 'kitsune';
    this.profile = GAME_CONSTANTS.CHARACTERS.kitsune;

    // Spawn sobre la superficie, +Y alineado con la normal radial.
    this.pos
      .copy(spawnDir)
      .normalize()
      .multiplyScalar(this.currentPlanet.spec.radius)
      .add(this.currentPlanet.centerVec);
    this._up.copy(this.pos).sub(this.currentPlanet.centerVec).normalize();
    this.lastUp.copy(this._up);
    alignBasisToUp(this.basisQuat, this._up, 1);

    // Jerarquía: root (transform físico) -> bodyRoot (hundimiento del subsuelo)
    // -> modelos. Así el hundimiento de Digger no ensucia la física.
    this.root.add(this.bodyRoot);

    // Modelos pre-construidos: el cambio 1/2/3 es instantáneo.
    const characterIds: CharacterId[] = ['kitsune', 'digger', 'axel'];
    for (const id of characterIds) {
      const model = buildCharacterModel(id);
      model.visible = id === this.activeCharacter;
      this.bodyRoot.add(model);
      this.models.set(id, model);
      this.parts.set(id, {
        head: model.getObjectByName('head') ?? model,
        leftArm: model.getObjectByName('leftArm') ?? model,
        rightArm: model.getObjectByName('rightArm') ?? model,
        leftLeg: model.getObjectByName('leftLeg') ?? model,
        rightLeg: model.getObjectByName('rightLeg') ?? model,
        tail: model.getObjectByName('tail') ?? model,
      });
    }

    // Uniforme robado (visible solo con isDisguised).
    this.disguiseOverlay = buildDisguiseOverlay();
    this.bodyRoot.add(this.disguiseOverlay);

    // FX del Ancla Gravitatoria: orbe brillante + haz hacia delante.
    this.anchorFx = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 7, 6),
      new THREE.MeshBasicMaterial({
        color: 0xfde047,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      })
    );
    beam.rotation.x = Math.PI / 2;
    beam.position.z = 3.5;
    this.anchorFx.add(beam);
    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xfff7cc })
    );
    orb.position.z = 7;
    this.anchorFx.add(orb);
    this.anchorFx.rotation.x = -0.5; // elevado hacia arriba-adelante
    this.anchorFx.visible = false;
    this.bodyRoot.add(this.anchorFx);

    // Estela/anillo de energía alrededor del jugador: visible durante el
    // vuelo dirigido entre planetas y el Gravity Dash.
    this.flightFx = new THREE.Group();
    this.flightFx.position.y = 0.8;
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0x67e8f9,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.flightRingA = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.05, 8, 32), ringMaterial);
    this.flightRingB = new THREE.Mesh(
      new THREE.TorusGeometry(1.3, 0.035, 8, 32),
      ringMaterial.clone()
    );
    this.flightRingB.rotation.x = Math.PI / 2.6;
    this.flightFx.add(this.flightRingA, this.flightRingB);
    this.flightFx.visible = false;
    this.bodyRoot.add(this.flightFx);
  }

  // --------------------------------------------------------------------------
  // Estado consultado por el GameEngine / HUD
  // --------------------------------------------------------------------------
  get characterId(): CharacterId {
    return this.activeCharacter;
  }

  get planet(): PlanetRuntime {
    return this.currentPlanet;
  }

  get position(): THREE.Vector3 {
    return this.pos;
  }

  get isGrounded(): boolean {
    return this.grounded;
  }

  get isInFlight(): boolean {
    return this.inFlight;
  }

  get coreDiving(): boolean {
    return this.coreDiveActive;
  }

  get parryWindowActive(): boolean {
    return this.parryTimer > 0;
  }

  get anchorCooldownRatio(): number {
    return THREE.MathUtils.clamp(this.anchorCooldown / ANCHOR_COOLDOWN, 0, 1);
  }

  /** Cooldown de Gravity Shift/Dash: 0 = listo, 1 = acaba de usarse. */
  get gravityShiftCooldownRatio(): number {
    if (this.gravityShiftCooldownMax <= 0) return 0;
    return THREE.MathUtils.clamp(
      this.gravityShiftCooldown / this.gravityShiftCooldownMax,
      0,
      1
    );
  }

  get lockOnActive(): boolean {
    return this.lockedTarget !== null;
  }

  get lockedTargetName(): string | null {
    return this.lockedTarget ? this.world.getLockOnName(this.lockedTarget) : null;
  }

  /** Vuelo dirigido entre planetas (para FOV boost y roll de cámara). */
  get isDirectedFlight(): boolean {
    return this.inFlight && this.flightDirected;
  }

  /** Progreso 0..1 del vuelo dirigido (mitad del cruce = 0.5). */
  get flightProgress(): number {
    if (!this.flightDirected) return 0;
    return THREE.MathUtils.clamp(this.flightTime / this.flightDuration, 0, 1);
  }

  /** Posición mundial del objetivo fijado (false si no hay Lock-On válido). */
  getLockedTargetPos(outVec: THREE.Vector3): boolean {
    if (!this.lockedTarget) return false;
    return this.world.getLockOnPos(this.lockedTarget, outVec);
  }

  get stealthMultiplier(): number {
    return this.profile.stealthMultiplier;
  }

  /** Up radial actual (normal de la esfera bajo el jugador). */
  get up(): THREE.Vector3 {
    return this.lastUp;
  }

  /** Corriendo con Shift en superficie: delata al jugador disfrazado. */
  get isSprinting(): boolean {
    return (
      this.isMoving &&
      this.grounded &&
      !this.isBurrowing &&
      (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'))
    );
  }

  /** En el aire (salto/ancla): objetivo válido de las torretas antiaéreas. */
  get isAirborne(): boolean {
    return (
      !this.grounded &&
      !this.inFlight &&
      !this.isSwimming &&
      !this.coreDiveActive &&
      !this.isBurrowing
    );
  }

  /** Orientación de cámara: basisQuat * yaw * pitch (sin gimbal lock). */
  getCameraOrientation(outQuat: THREE.Quaternion): void {
    this._yawQuat.setFromAxisAngle(this._v1.set(0, 1, 0), this.yaw);
    outQuat.copy(this.basisQuat).multiply(this._yawQuat);
    this._yawQuat.setFromAxisAngle(this._v1.set(1, 0, 0), this.pitch);
    outQuat.multiply(this._yawQuat);
  }

  /** Posición de la cabeza (para anclar la cámara). */
  getHeadPosition(outVec: THREE.Vector3): void {
    outVec.copy(this.pos).addScaledVector(this.lastUp, HEAD_HEIGHT);
  }

  /** Avance tangente actual (marco de cámara + yaw). */
  getMoveForward(outVec: THREE.Vector3): void {
    getTangentAxes(this.basisQuat, this.yaw, outVec, this._v2);
  }

  /** Dirección de mira (mundo) desde la orientación de cámara. */
  getAimForward(outVec: THREE.Vector3): void {
    this.getCameraOrientation(this._q1);
    outVec.set(0, 0, -1).applyQuaternion(this._q1);
  }

  // --------------------------------------------------------------------------
  // Entrada (reenviada por el GameEngine, que posee el Pointer Lock)
  // --------------------------------------------------------------------------
  handleKey(code: string, down: boolean): void {
    if (down) {
      this.keys.add(code);
      if (code === 'Space') {
        if (this.isBurrowing && !this.coreDiveActive) this.startCoreDive();
        else this.tryJump();
      } else if (code === 'Digit1') this.switchCharacter('kitsune');
      else if (code === 'Digit2') this.switchCharacter('digger');
      else if (code === 'Digit3') this.switchCharacter('axel');
      else if (code === 'KeyE') this.tryKnockout();
      else if (code === 'KeyF' || code === 'KeyQ') this.tryParry();
      else if (code === 'ShiftLeft' || code === 'ShiftRight') this.toggleBurrow();
      else if (code === 'KeyR' || code === 'KeyC') this.captureStasis();
      else if (code === 'Tab' || code === 'KeyV') this.toggleLockOn();
      else if (code === 'ArrowLeft') this.cycleLockOn(-1);
      else if (code === 'ArrowRight') this.cycleLockOn(1);
    } else {
      this.keys.delete(code);
    }
  }

  handleMouseMove(dx: number, dy: number): void {
    this.yaw -= dx * MOUSE_SENSITIVITY;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * MOUSE_SENSITIVITY, PITCH_MIN, PITCH_MAX);
    if (this.yaw > Math.PI) this.yaw -= Math.PI * 2;
    else if (this.yaw < -Math.PI) this.yaw += Math.PI * 2;
  }

  handleMouseButton(button: number, down: boolean): void {
    if (button === 0) {
      // Clic Izquierdo: dispara 1 solo objeto de la Estasis hacia el objetivo
      // fijado (Lock-On) o la mira; con 0 objetos, golpe melee rápido.
      if (!down) return;
      if (this.inFlight || this.isSwimming || this.coreDiveActive || this.isBurrowing) return;
      if (this.world.held > 0) {
        this.throwOneStasis();
      } else {
        this.meleeStrike();
      }
    } else if (button === 1) {
      // Clic central: Lock-On on/off.
      if (down) this.toggleLockOn();
    } else if (button === 2) {
      // Gravity Shift (apuntado a otro planeta) / Gravity Dash local.
      if (down) {
        if (
          !this.inFlight &&
          !this.isSwimming &&
          !this.coreDiveActive &&
          this.gravityShiftCooldown <= 0
        ) {
          this.gravityShifting = true;
        }
      } else if (this.gravityShifting) {
        this.gravityShifting = false;
        if (this.gravityTarget && this.gravityTarget !== this.currentPlanet) {
          this.launchToTarget(this.gravityTarget);
        } else {
          this.gravityDash();
        }
        this.gravityTarget = null;
      }
    }
  }

  /** Al pausar: suelta teclas y cancela el apuntado sin lanzar al jugador. */
  clearTransientInput(): void {
    this.keys.clear();
    this.gravityShifting = false;
    this.gravityTarget = null;
  }

  /** Daño recibido (láser, guardias, explosiones) con empuje opcional. */
  takeDamage(amount: number, pushX = 0, pushY = 0, pushZ = 0): void {
    if (this.invulnTimer > 0) return;
    this.invulnTimer = INVULN_TIME;
    this.hp = Math.max(0, this.hp - amount);
    this.behavior.damageTaken += amount;
    this.isDisguised = false;
    this.disguiseTimer = 0;
    this.anchorBurst.x += pushX;
    this.anchorBurst.y += pushY;
    this.anchorBurst.z += pushZ;
  }

  /**
   * Tubería de teletransporte (Iron Bastion): recoloca al jugador en la
   * salida conectada, reorientando el marco tangente a la nueva normal.
   */
  teleportTo(x: number, y: number, z: number): void {
    this.pos.set(x, y, z);
    const planet = findStrongestGravityPlanet(this.pos, this.planets, this.currentPlanet.spec.id);
    this.currentPlanet = planet;
    this._up.copy(this.pos).sub(planet.centerVec);
    const len = this._up.length();
    if (len > 1e-6) this._up.divideScalar(len);
    this.lastUp.copy(this._up);
    this.pos.copy(planet.centerVec).addScaledVector(this._up, planet.spec.radius);
    alignBasisToUp(this.basisQuat, this._up, 1);
    this.grounded = true;
    this.altitude = 0;
    this.vertVel = 0;
    this.jumpsUsed = 0;
    this.inFlight = false;
    this.flightDirected = false;
    this.flightDest = null;
    this.isSwimming = false;
    this.iceVel.set(0, 0, 0);
  }

  /** Mina sísmica: expulsa a Digger del subsuelo hacia arriba. */
  forceSurfaceEject(): void {
    this.isBurrowing = false;
    this.grounded = false;
    this.altitude = 0.5;
    this.vertVel = 12;
    this.jumpsUsed = 1;
  }

  /** Escáner de puerta: rompe el disfraz desde el mundo. */
  forceBreakDisguise(): void {
    this.breakDisguise();
  }

  // --------------------------------------------------------------------------
  // Simulación
  // --------------------------------------------------------------------------
  update(dt: number): void {
    if (dt <= 0) return;

    if (this.coreDiveActive) {
      this.updateCoreDive(dt);
    } else if (this.isSwimming) {
      this.updateSwim(dt);
    } else if (this.inFlight) {
      this.updateFlight(dt);
    } else {
      this.updateGrounded(dt);
    }

    // Temporizadores de habilidades.
    if (this.anchorCooldown > 0) this.anchorCooldown -= dt;
    if (this.parryCooldown > 0) this.parryCooldown -= dt;
    if (this.invulnTimer > 0) this.invulnTimer -= dt;
    if (this.swimBoostTimer > 0) this.swimBoostTimer -= dt;
    if (this.anchorFxTimer > 0) this.anchorFxTimer -= dt;
    if (this.gravityShiftCooldown > 0) this.gravityShiftCooldown -= dt;

    // Gravity Dash: impulso activo + derribo/empuje de guardias y cajas.
    if (this.dashTimer > 0) {
      this.dashTimer -= dt;
      this.dashHitTimer -= dt;
      if (this.dashHitTimer <= 0) {
        this.dashHitTimer = GRAVITY_DASH_HIT_INTERVAL;
        this.world.dashImpact(this.pos, this.dashDir);
      }
    }

    // Lock-On: refresca la posición del objetivo fijado o lo libera.
    if (this.lockedTarget) {
      if (
        !this.world.getLockOnPos(this.lockedTarget, this.lockedTargetPos) ||
        this.lockedTargetPos.distanceToSquared(this.pos) >
          LOCK_ON_DROP_RANGE * LOCK_ON_DROP_RANGE
      ) {
        this.lockedTarget = null;
      }
    }

    if (this.isDisguised) {
      this.behavior.disguiseTimeSec += dt;
      this.disguiseTimer -= dt;
      if (this.disguiseTimer <= 0) this.isDisguised = false;
    }
    if (this.isBurrowing && !this.coreDiveActive) this.behavior.burrowTimeSec += dt;

    // Mina sísmica: eyección forzada del subsuelo con daño ya aplicado.
    if (this.isBurrowing && !this.coreDiveActive && this.world.consumeBurrowEject()) {
      this.forceSurfaceEject();
    }

    // Ventana de Parry: refleja el ataque de cualquier guardia cercano.
    if (this.parryTimer > 0) {
      this.parryTimer -= dt;
      if (this.world.checkParry(this.pos)) {
        this.behavior.parriesLanded++;
        this.parryTimer = 0;
      }
    }

    // Campo de Estasis: los objetos capturados orbitan solos (sin mantener
    // pulsado); la captura ocurre en `captureStasis` (R/C).

    // Reorientación suave del marco tangente (transporte paralelo continuo).
    alignBasisToUp(this.basisQuat, this.lastUp, 1 - Math.exp(-BASIS_ALIGN_SPEED * dt));

    // Transform del modelo: mira hacia el forward de cámara.
    this._yawQuat.setFromAxisAngle(this._v1.set(0, 1, 0), this.yaw);
    this.root.quaternion
      .copy(this.basisQuat)
      .multiply(this._yawQuat)
      .multiply(this._flipQuat);
    this.root.position.copy(this.pos);

    // Hundimiento visual del subsuelo + overlay de disfraz + FX de ancla.
    const targetSink = this.isBurrowing && !this.coreDiveActive ? BURROW_SINK : 0;
    this.burrowSink += (targetSink - this.burrowSink) * Math.min(1, dt * 10);
    this.bodyRoot.position.y = this.burrowSink;
    this.disguiseOverlay.visible = this.isDisguised;
    this.anchorFx.visible = this.anchorFxTimer > 0;

    // Estela/anillo de energía: vuelo dirigido entre planetas o Gravity Dash.
    const fxActive = this.isDirectedFlight || this.dashTimer > 0;
    this.flightFx.visible = fxActive;
    if (fxActive) {
      this.flightRingA.rotation.z += dt * 5.2;
      this.flightRingA.rotation.x = Math.sin(this.walkPhase * 2) * 0.4;
      this.flightRingB.rotation.y += dt * 3.4;
      const pulse = 1 + Math.sin(this.walkPhase * 6) * 0.08;
      this.flightFx.scale.setScalar(pulse);
    }

    this.animateLimbs();

    // Apuntado Gravity Shift (cono desde la cámara).
    if (this.gravityShifting) {
      this.gravityTarget = this.pickPlanetUnderCrosshair();
    }
  }

  private updateGrounded(dt: number): void {
    const planet = this.currentPlanet;
    const center = planet.centerVec;

    // Movimiento tangente (WASD en el marco de la cámara).
    getTangentAxes(this.basisQuat, this.yaw, this._forward, this._right);
    const inputZ = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
    const inputX = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
    this._move.set(0, 0, 0).addScaledVector(this._forward, inputZ).addScaledVector(this._right, inputX);
    this.isMoving = this._move.lengthSq() > 1e-8;

    let speed = 0;
    const onIce = this.world.isOnIce(this.pos, planet);
    if (this.isMoving) {
      this._move.normalize();
      const sprinting = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
      speed =
        this.profile.moveSpeed *
        (sprinting ? SPRINT_MULTIPLIER : 1) *
        (this.isBurrowing ? BURROW_SPEED_MUL : 1);
      if (onIce) {
        // Hielo resbaladizo: inercia al acelerar/frenar sobre el parche.
        this._v1.copy(this._move).multiplyScalar(speed);
        this.iceVel.lerp(this._v1, Math.min(1, dt * ICE_GRIP));
        this.pos.addScaledVector(this.iceVel, dt);
        this.walkDistance += this.iceVel.length() * dt;
      } else {
        this.pos.addScaledVector(this._move, speed * dt);
        this.walkDistance += speed * dt;
        this.iceVel.copy(this._move).multiplyScalar(speed);
      }
    } else if (this.iceVel.lengthSq() > 1e-6) {
      // Frenada: sobre hielo se desliza; fuera de él se detiene en seco.
      this.iceVel.multiplyScalar(Math.exp(-(onIce ? ICE_GRIP : 16) * dt));
      this.pos.addScaledVector(this.iceVel, dt);
    } else {
      this.iceVel.set(0, 0, 0);
    }
    if (this.isBurrowing && this.isMoving) {
      this.behavior.burrowDistance += speed * dt;
    }

    // Impulso residual del Ancla (decae exponencialmente).
    if (this.anchorBurst.lengthSq() > 1e-6) {
      this.pos.addScaledVector(this.anchorBurst, dt);
      this.anchorBurst.multiplyScalar(Math.exp(-ANCHOR_BURST_DECAY * dt));
    } else {
      this.anchorBurst.set(0, 0, 0);
    }

    // Dinámica vertical (salto / gravedad radial).
    const wasAirborne = !this.grounded;
    this.altitude += this.vertVel * dt;
    this.vertVel -= GRAVITY_BASE * this.profile.gravityScale * dt;
    if (this.altitude <= 0) {
      // Aterrizaje en Modo Júpiter (Digger): onda expansiva.
      if (
        wasAirborne &&
        this.vertVel < -SHOCKWAVE_MIN_FALL &&
        this.profile.gravityScale > 1.2
      ) {
        this.world.shockwave(this.pos, SHOCKWAVE_RADIUS);
      }
      this.altitude = 0;
      this.vertVel = 0;
      if (!this.grounded) this.jumpsUsed = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }

    // Re-proyección a la esfera: caminar por polos sin gimbal lock.
    this._up.copy(this.pos).sub(center);
    const radialDist = this._up.length();
    if (radialDist > 1e-6) {
      this._up.divideScalar(radialDist);
      this.pos.copy(center).addScaledVector(this._up, planet.spec.radius + this.altitude);
    }
    this.lastUp.copy(this._up);

    // Fase de animación de caminata.
    if (this.isMoving) {
      this.walkPhase += dt * speed * 1.35;
    } else {
      this.walkPhase += dt * 1.5;
    }
  }

  // ------------------------------------------------------------------------
  // Nado 3D libre dentro de burbujas de agua (Axel a 2.35x)
  // ------------------------------------------------------------------------
  private updateSwim(dt: number): void {
    const bubble = this.world.getBubbleAt(this.pos);
    if (!bubble) {
      // Salida propulsada: vuelo libre con la inercia del nado.
      this.isSwimming = false;
      this.inFlight = true;
      this.flightDirected = false;
      this.flightDest = null;
      this.flightTime = 0;
      this.flightVel.copy(this.swimVel).multiplyScalar(SWIM_EXIT_BOOST);
      return;
    }

    // Orientación hacia el planeta con mayor atracción.
    const nearest = findStrongestGravityPlanet(this.pos, this.planets, this.currentPlanet.spec.id);
    this.currentPlanet = nearest;
    this._up.copy(this.pos).sub(nearest.centerVec);
    const upLen = this._up.length();
    if (upLen > 1e-6) {
      this.lastUp.copy(this._up.divideScalar(upLen));
    }

    // Natación 3D hacia donde mira la cámara.
    this.getCameraOrientation(this._q1);
    this._forward.set(0, 0, -1).applyQuaternion(this._q1);
    this._right.set(1, 0, 0).applyQuaternion(this._q1);
    const inputZ = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
    const inputX = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
    this._move.set(0, 0, 0).addScaledVector(this._forward, inputZ).addScaledVector(this._right, inputX);
    this.isMoving = this._move.lengthSq() > 1e-8;

    const boost = this.swimBoostTimer > 0 ? SWIM_BOOST_MUL : 1;
    const speed = SWIM_BASE_SPEED * this.profile.swimSpeedMultiplier * boost;
    if (this.isMoving) {
      this._move.normalize().multiplyScalar(speed);
    } else {
      this._move.set(0, 0, 0);
    }
    this.swimVel.lerp(this._move, Math.min(1, dt * 6));
    this.pos.addScaledVector(this.swimVel, dt);
    this.walkPhase += dt * (this.isMoving ? 6 : 1.5);
  }

  private enterSwim(): void {
    this.isSwimming = true;
    this.inFlight = false;
    this.flightDirected = false;
    this.flightDest = null;
    this.grounded = false;
    this.jumpsUsed = 0;
    this.swimVel.set(0, 0, 0);
  }

  // ------------------------------------------------------------------------
  // Vuelo: cinematográfico dirigido (Gravity Shift) o libre (salida de burbuja)
  // ------------------------------------------------------------------------
  private updateFlight(dt: number): void {
    if (this.flightDirected && this.flightDest) {
      this.updateDirectedFlight(dt, this.flightDest);
      return;
    }

    // Vuelo libre: física de atracción suave hacia el planeta más cercano
    // (propulsión de nado: permite encadenar burbujas y planetas).
    this.flightTime += dt;
    const activeTarget = findStrongestGravityPlanet(this.pos, this.planets, this.currentPlanet.spec.id);
    this.currentPlanet = activeTarget;
    const center = activeTarget.centerVec;

    this._v1.copy(center).sub(this.pos);
    const dist = this._v1.length();
    if (dist > 1e-6) {
      this._v1.divideScalar(dist);
      this.flightVel.addScaledVector(this._v1, GRAVITY_BASE * FREE_FLIGHT_GRAVITY * dt);
    }
    this.pos.addScaledVector(this.flightVel, dt);

    this._up.copy(this.pos).sub(center);
    const newDist = this._up.length();
    this._up.divideScalar(Math.max(newDist, 1e-6));
    this.lastUp.copy(this._up);

    if (this.world.getBubbleAt(this.pos)) {
      this.enterSwim();
      return;
    }

    if (this.flightTime > 0.12 && newDist <= activeTarget.spec.radius + 0.15) {
      this.landOn(activeTarget, this._up);
    }
  }

  /**
   * Interpolación orbital cinematográfica: arco Bezier elevado sobre el origen
   * del nivel, desaceleración suave (ease-out), rotación progresiva de
   * `basisQuat` hacia la normal del planeta destino y encuadre de cámara
   * girando hacia la dirección de viaje para aterrizar de pie.
   */
  private updateDirectedFlight(dt: number, target: PlanetRuntime): void {
    this.flightTime += dt;
    const t = Math.min(this.flightTime / this.flightDuration, 1);
    // Ralentiza el punto medio entre órbitas (cruce más épico) y mantiene el
    // ease-out del aterrizaje.
    const warped = t + FLIGHT_MID_SLOWDOWN * Math.sin(Math.PI * 2 * t);
    const te = 1 - (1 - warped) * (1 - warped); // ease-out: desaceleración suave
    const it = 1 - te;

    this.pos
      .set(0, 0, 0)
      .addScaledVector(this.flightStart, it * it)
      .addScaledVector(this.flightCtrl, 2 * it * te)
      .addScaledVector(this.flightEnd, te * te);

    // Up radial respecto al planeta destino: aterrizaje de pie garantizado.
    this._up.copy(this.pos).sub(target.centerVec);
    const upLen = this._up.length();
    if (upLen > 1e-6) {
      this.lastUp.copy(this._up.divideScalar(upLen));
    }

    // Giro cinemático de cámara: yaw/pitch convergen al encuadre frontal.
    this.updateCinematicFraming(dt);

    // Burbuja intermedia en la ruta: se puede entrar nadando.
    if (this.world.getBubbleAt(this.pos)) {
      this.enterSwim();
      return;
    }

    if (t >= 1) {
      this._up.copy(this.flightEnd).sub(target.centerVec).normalize();
      this.landOn(target, this._up);
    }
  }

  /** Encuadre de cámara hacia la dirección de viaje durante el vuelo. */
  private updateCinematicFraming(dt: number): void {
    // Tangente de la trayectoria en el aterrizaje (end - ctrl).
    this._v1.copy(this.flightEnd).sub(this.flightCtrl).normalize();
    // Proyección al plano tangente del up actual.
    this._v1.addScaledVector(this.lastUp, -this._v1.dot(this.lastUp));
    if (this._v1.lengthSq() < 1e-6) return;
    this._v1.normalize();

    // Forward con yaw 0 en el marco actual de la base.
    this._v2.set(0, 0, -1).applyQuaternion(this.basisQuat);
    this._v2.addScaledVector(this.lastUp, -this._v2.dot(this.lastUp));
    if (this._v2.lengthSq() < 1e-6) return;
    this._v2.normalize();

    // Ángulo con signo alrededor del up: yaw objetivo para mirar al frente.
    this._v3.copy(this._v2).cross(this._v1);
    const targetYaw = Math.atan2(this._v3.dot(this.lastUp), this._v2.dot(this._v1));

    // Interpola por el camino corto.
    let delta = targetYaw - this.yaw;
    if (delta > Math.PI) delta -= Math.PI * 2;
    else if (delta < -Math.PI) delta += Math.PI * 2;
    this.yaw += delta * Math.min(1, dt * 2.6);
    if (this.yaw > Math.PI) this.yaw -= Math.PI * 2;
    else if (this.yaw < -Math.PI) this.yaw += Math.PI * 2;

    this.pitch +=
      (FLIGHT_LANDING_PITCH - this.pitch) * Math.min(1, dt * 2.6);
  }

  private landOn(target: PlanetRuntime, up: THREE.Vector3): void {
    this.currentPlanet = target;
    this.inFlight = false;
    this.flightDirected = false;
    this.flightDest = null;
    this.flightTime = 0;
    this.grounded = true;
    this.altitude = 0;
    this.vertVel = 0;
    this.jumpsUsed = 0;
    this.flightVel.set(0, 0, 0);
    this.lastUp.copy(up);
    this.pos
      .copy(target.centerVec)
      .addScaledVector(up, target.spec.radius);
  }

  private launchToTarget(target: PlanetRuntime): void {
    this.flightStart.copy(this.pos);
    this._v1.copy(this.pos).sub(target.centerVec).normalize();
    this.flightEnd
      .copy(target.centerVec)
      .addScaledVector(this._v1, target.spec.radius);

    // Punto de control: arco elevado sobre el origen del nivel (0,0,0).
    this.flightCtrl.copy(this.flightStart).add(this.flightEnd).multiplyScalar(0.5);
    const ctrlLen = this.flightCtrl.length();
    if (ctrlLen > 1e-6) {
      this.flightCtrl.multiplyScalar((ctrlLen * FLIGHT_ARC_SCALE + FLIGHT_ARC_LIFT) / ctrlLen);
    }

    const dist = this.flightStart.distanceTo(this.flightEnd);
    this.flightDuration = THREE.MathUtils.clamp(
      dist / FLIGHT_SPEED_DIVISOR,
      FLIGHT_MIN_DURATION,
      FLIGHT_MAX_DURATION
    );
    // Cooldown proporcional a la distancia del salto entre planetas (1.8s-2.8s).
    this.setGravityShiftCooldown(
      THREE.MathUtils.lerp(
        GRAVITY_JUMP_COOLDOWN_MIN,
        GRAVITY_JUMP_COOLDOWN_MAX,
        THREE.MathUtils.clamp((dist - GRAVITY_JUMP_COOLDOWN_DIST0) / 150, 0, 1)
      )
    );
    this.flightTime = 0;
    this.flightDest = target;
    this.flightDirected = true;
    this.inFlight = true;
    this.grounded = false;
    this.altitude = 0;
    this.vertVel = 0;
    this.jumpsUsed = 0;
    this.currentPlanet = target;
  }

  // ------------------------------------------------------------------------
  // Subsuelo de Digger: hundimiento en superficie + cruce del núcleo
  // ------------------------------------------------------------------------
  private toggleBurrow(): void {
    if (!this.profile.canBurrow || this.coreDiveActive) return;
    if (this.inFlight || this.isSwimming) return;
    if (!this.grounded && !this.isBurrowing) return;
    this.isBurrowing = !this.isBurrowing;
  }

  private startCoreDive(): void {
    const planet = this.currentPlanet;
    this.diveStart.copy(this.pos);
    this.diveUpStart.copy(this.pos).sub(planet.centerVec).normalize();
    this.diveEnd
      .copy(planet.centerVec)
      .addScaledVector(this.diveUpStart, -planet.spec.radius); // polo opuesto
    // Eje tangente capturado en el instante del salto: el right del jugador.
    // Todo el cruce gira 180º alrededor de este ÚNICO eje (sin flip brusco
    // ni gimbal lock en el centro del planeta).
    getTangentAxes(this.basisQuat, this.yaw, this._forward, this._right);
    this.diveAxis.copy(this._right);
    if (this.diveAxis.lengthSq() < 1e-6) {
      this.diveAxis.copy(this._forward).cross(this.diveUpStart);
      if (this.diveAxis.lengthSq() < 1e-6) this.diveAxis.set(1, 0, 0);
      this.diveAxis.normalize();
    }
    this.diveDuration = (2 * planet.spec.radius) / CORE_DIVE_SPEED;
    this.diveTime = 0;
    this.divePrevAngle = 0;
    this.coreDiveActive = true;
    this.isBurrowing = true;
    this.grounded = false;
    this.altitude = 0;
    this.vertVel = 0;
    this.jumpsUsed = 0;
    this.behavior.burrowDistance += 2 * planet.spec.radius;
  }

  private updateCoreDive(dt: number): void {
    this.diveTime += dt;
    const t = Math.min(this.diveTime / this.diveDuration, 1);
    const smooth = t * t * (3 - 2 * t);
    const planet = this.currentPlanet;

    // up(t): la normal inicial rota 180º alrededor de diveAxis mientras el
    // radio baja hacia el núcleo y vuelve a emerger en el polo opuesto.
    const angle = Math.PI * smooth;
    this._q1.setFromAxisAngle(this.diveAxis, angle);
    this._up.copy(this.diveUpStart).applyQuaternion(this._q1);
    const depth = planet.spec.radius * CORE_DIVE_DEPTH_RATIO;
    const radius = planet.spec.radius - depth * Math.sin(Math.PI * smooth);
    this.pos
      .copy(planet.centerVec)
      .addScaledVector(this._up, Math.max(radius, planet.spec.radius * 0.12));
    this.lastUp.copy(this._up);

    // basisQuat acompaña continuamente el giro de 180º alrededor del mismo
    // eje: sin inversión repentina ni gimbal lock al cruzar el centro.
    const delta = angle - this.divePrevAngle;
    if (delta > 0) {
      this._q1.setFromAxisAngle(this.diveAxis, delta);
      this.basisQuat.premultiply(this._q1).normalize();
      this.divePrevAngle = angle;
    }

    if (t >= 1) {
      this.coreDiveActive = false;
      this.isBurrowing = false;
      this.pos.copy(this.diveEnd);
      this.altitude = 0.1;
      this.vertVel = 5; // saltito de salida en el polo opuesto
      this.grounded = false;
      this.jumpsUsed = 0;
    }
  }

  // ------------------------------------------------------------------------
  // Salto, doble impulso y Ancla Gravitatoria
  // ------------------------------------------------------------------------
  private tryJump(): void {
    if (this.isSwimming) {
      this.swimBoostTimer = SWIM_BOOST_TIME; // propulsión en el agua
      return;
    }
    if (this.inFlight || this.coreDiveActive) return;
    if (this.grounded) {
      this.vertVel = this.profile.jumpImpulse;
      this.grounded = false;
      this.jumpsUsed = 1;
    } else if (this.jumpsUsed < 2) {
      this.vertVel = this.profile.jumpImpulse * DOUBLE_JUMP_FACTOR;
      this.jumpsUsed = 2;
    } else {
      this.tryAnchor();
    }
  }

  /**
   * Ancla Gravitatoria (Espacio en el aire): orbe con haz hasta
   * `profile.anchorRange` e impulso aéreo adelante/arriba para encadenar
   * saltos infinitos. Cooldown 0.9s (`anchorCooldownRatio`).
   */
  private tryAnchor(): void {
    if (this.anchorCooldown > 0) return;
    this.anchorCooldown = ANCHOR_COOLDOWN;
    getTangentAxes(this.basisQuat, this.yaw, this._forward, this._right);
    // El alcance del ancla escala con el perfil (Axel 28, Kitsune 18, Digger 14).
    const strength = this.profile.anchorRange * 0.72;
    this.anchorBurst
      .copy(this._forward)
      .multiplyScalar(strength)
      .addScaledVector(this.lastUp, 5);
    this.vertVel = Math.max(this.vertVel, 0) + 6.5;
    this.anchorFx.scale.z = this.profile.anchorRange / 18;
    this.anchorFxTimer = ANCHOR_FX_TIME;
    this.behavior.aerialAttacks++;
  }

  // ------------------------------------------------------------------------
  // Estasis, Lock-On, Gravity Dash, melee, parry y noqueo
  // ------------------------------------------------------------------------

  /** R/C: captura/atrae un objeto cercano al Campo de Estasis (sin mantener). */
  private captureStasis(): void {
    if (this.inFlight || this.isSwimming || this.coreDiveActive || this.isBurrowing) return;
    if (this.world.held >= GAME_CONSTANTS.MAX_STASIS_OBJECTS) return;
    this.getMoveForward(this._forward);
    this.world.grabNearest(this.pos, this._forward, STASIS_GRAB_RANGE);
  }

  /** Clic Izquierdo: dispara 1 solo objeto hacia el objetivo fijado o la mira. */
  private throwOneStasis(): void {
    if (this.lockedTarget) {
      this._v1.copy(this.lockedTargetPos).sub(this.pos);
      if (this._v1.lengthSq() > 1e-6) this._v1.normalize();
      else this.getAimForward(this._v1);
    } else {
      this.getAimForward(this._v1);
    }
    const thrown = this.world.releaseThrowOne(this._v1);
    if (thrown > 0) {
      this.behavior.stasisThrows += thrown;
      // Estasis delante de un guardia: delata al jugador disfrazado.
      this.world.reportAbilityUse(this.pos);
      this.breakDisguise();
    }
  }

  /** Tab/V/clic central: fija el objetivo válido más cercano o libera el actual. */
  private toggleLockOn(): void {
    if (this.lockedTarget) {
      this.lockedTarget = null;
      return;
    }
    this.getAimForward(this._v1);
    this.lockedTarget = this.world.findLockOnTarget(
      this.pos,
      this._v1,
      LOCK_ON_RANGE,
      null,
      0
    );
    if (this.lockedTarget) {
      this.world.getLockOnPos(this.lockedTarget, this.lockedTargetPos);
    }
  }

  /** Flecha Izquierda/Derecha: cicla el objetivo fijado (o fija el más cercano). */
  private cycleLockOn(dir: 1 | -1): void {
    this.getAimForward(this._v1);
    this.lockedTarget = this.world.findLockOnTarget(
      this.pos,
      this._v1,
      LOCK_ON_RANGE,
      this.lockedTarget,
      dir
    );
    if (this.lockedTarget) {
      this.world.getLockOnPos(this.lockedTarget, this.lockedTargetPos);
    }
  }

  /**
   * Gravity Dash local: impulso rápido hacia donde apunta la cámara para
   * recorrer el planeta y derribar/empujar guardias o cajas al chocar.
   * Cooldown corto (0.8s).
   */
  private gravityDash(): void {
    if (this.gravityShiftCooldown > 0) return;
    if (this.inFlight || this.isSwimming || this.coreDiveActive) return;
    this.getAimForward(this._v1);
    // Proyección al plano tangente: el dash discurre por la superficie.
    this._v1.addScaledVector(this.lastUp, -this._v1.dot(this.lastUp));
    if (this._v1.lengthSq() < 1e-6) this.getMoveForward(this._v1);
    this._v1.normalize();
    this.dashDir.copy(this._v1);
    this.anchorBurst.copy(this._v1).multiplyScalar(GRAVITY_DASH_SPEED);
    this.dashTimer = GRAVITY_DASH_TIME;
    this.dashHitTimer = 0;
    this.setGravityShiftCooldown(GRAVITY_DASH_COOLDOWN);
    // Gravity Shift delante de un guardia: delata al jugador disfrazado.
    this.world.reportAbilityUse(this.pos);
  }

  private setGravityShiftCooldown(seconds: number): void {
    this.gravityShiftCooldown = seconds;
    this.gravityShiftCooldownMax = seconds;
  }

  private meleeStrike(): void {
    this.getMoveForward(this._forward);
    const hit = this.world.meleeStrike(this.pos, this._forward);
    if (hit === 'guard') {
      this.behavior.bruteKills++;
      this.breakDisguise();
    }
  }

  private tryParry(): void {
    if (this.parryCooldown > 0) return;
    if (this.inFlight || this.isSwimming || this.coreDiveActive) return;
    this.parryTimer = PARRY_WINDOW;
    this.parryCooldown = PARRY_COOLDOWN;
  }

  private tryKnockout(): void {
    if (this.inFlight || this.isSwimming || this.coreDiveActive) return;
    this.getMoveForward(this._forward);
    if (this.world.tryKnockoutBehind(this.pos)) {
      this.behavior.stealthKnockouts++;
      this.isDisguised = true;
      this.disguiseTimer = DISGUISE_DURATION;
    }
  }

  private breakDisguise(): void {
    if (!this.isDisguised) return;
    this.isDisguised = false;
    this.disguiseTimer = 0;
  }

  // ------------------------------------------------------------------------
  // Apuntado Gravity Shift y cambio de personaje
  // ------------------------------------------------------------------------
  /**
   * Selección de planeta apuntado: cono desde la cámara (barato, sin raycaster
   * ni allocations). Devuelve el planeta visible bajo la mira o null.
   */
  private pickPlanetUnderCrosshair(): PlanetRuntime | null {
    this.camera.getWorldDirection(this._v1);
    let best: PlanetRuntime | null = null;
    let bestAngle = Infinity;
    for (const planet of this.planets) {
      if (planet === this.currentPlanet) continue;
      this._v2.copy(planet.centerVec).sub(this.camera.position);
      const dist = this._v2.length();
      if (dist < 1e-4) continue;
      this._v2.divideScalar(dist);
      const dot = THREE.MathUtils.clamp(this._v1.dot(this._v2), -1, 1);
      const angle = Math.acos(dot);
      const planetAngularRadius = Math.atan2(planet.spec.radius, dist) + AIM_CONE_MARGIN;
      if (angle < planetAngularRadius && angle < bestAngle) {
        bestAngle = angle;
        best = planet;
      }
    }
    return best;
  }

  private switchCharacter(id: CharacterId): void {
    if (id === this.activeCharacter) return;
    const nextProfile = GAME_CONSTANTS.CHARACTERS[id];
    const currentModel = this.models.get(this.activeCharacter);
    if (currentModel) currentModel.visible = false;
    const nextModel = this.models.get(id);
    if (nextModel) nextModel.visible = true;
    this.activeCharacter = id;
    this.profile = nextProfile;
    if (!nextProfile.canBurrow) this.isBurrowing = false;
  }

  private animateLimbs(): void {
    const parts = this.parts.get(this.activeCharacter);
    if (!parts) return;
    if (this.isSwimming) {
      // Nado: braceo continuo.
      const stroke = Math.sin(this.walkPhase * 1.2);
      parts.leftArm.rotation.x = -1.2 + stroke * 0.9;
      parts.rightArm.rotation.x = -1.2 - stroke * 0.9;
      parts.leftLeg.rotation.x = stroke * 0.5;
      parts.rightLeg.rotation.x = -stroke * 0.5;
    } else if (this.grounded) {
      const swing = Math.sin(this.walkPhase) * (this.isMoving ? 0.75 : 0.12);
      parts.leftArm.rotation.x = swing;
      parts.rightArm.rotation.x = -swing;
      parts.leftLeg.rotation.x = -swing;
      parts.rightLeg.rotation.x = swing;
    } else {
      // En el aire: brazos arriba, piernas recogidas.
      parts.leftArm.rotation.x = -2.2;
      parts.rightArm.rotation.x = -2.2;
      parts.leftLeg.rotation.x = 0.5;
      parts.rightLeg.rotation.x = -0.3;
    }
    parts.tail.rotation.y = Math.sin(this.walkPhase * 0.7) * 0.45;
    parts.head.rotation.z = Math.sin(this.walkPhase * 0.5) * 0.05;
  }

  dispose(): void {
    this.root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry?.dispose();
      const material = mesh.material;
      if (Array.isArray(material)) {
        for (const m of material) m.dispose();
      } else if (material) {
        material.dispose();
      }
    });
    this.root.clear();
    this.bodyRoot.clear();
    this.models.clear();
    this.parts.clear();
    this.keys.clear();
  }
}
