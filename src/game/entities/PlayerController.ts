import * as THREE from 'three';
import {
  GAME_CONSTANTS,
  type CharacterId,
  type CharacterProfile,
  type PlanetRuntime,
} from '../types';
import { alignBasisToUp, findStrongestGravityPlanet, getTangentAxes } from '../math/spherical';
import { buildCharacterModel } from '../render/proceduralModels';

// ============================================================================
// Constantes de simulación del jugador
// ============================================================================
const GRAVITY_BASE = 22;
const BASIS_ALIGN_SPEED = 9; // velocidad de reorientación del marco tangente
const SPRINT_MULTIPLIER = 1.55;
const DOUBLE_JUMP_FACTOR = 0.85;
const MOUSE_SENSITIVITY = 0.0022;
const PITCH_MIN = -1.25;
const PITCH_MAX = 1.3;
const AIM_CONE_MARGIN = 0.32; // rad de tolerancia sobre el radio angular del planeta
const FLIGHT_SPEED_PER_DIST = 0.34;
const FLIGHT_SPEED_MIN = 26;
const FLIGHT_SPEED_MAX = 74;
const HEAD_HEIGHT = 1.5;

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
 * - Espacio: salto + doble impulso aéreo.
 * - Shift: sprint en superficie.
 * - 1/2/3: cambio instantáneo de personaje (Kitsune / Digger / Axel).
 * - Clic Derecho (mantener): Gravity Shift (cámara lenta + apuntado a otro planeta).
 *
 * Cero allocations por frame: todos los vectores/cuaterniones son preasignados.
 */
export class PlayerController {
  readonly root = new THREE.Group();
  readonly basisQuat = new THREE.Quaternion();
  yaw = 0;
  pitch = 0.3;

  gravityShifting = false;
  gravityTarget: PlanetRuntime | null = null;
  hp = GAME_CONSTANTS.PLAYER_MAX_HP;
  walkDistance = 0;

  private readonly planets: PlanetRuntime[];
  private readonly camera: THREE.PerspectiveCamera;
  private currentPlanet: PlanetRuntime;
  private profile: CharacterProfile;
  private activeCharacter: CharacterId;

  private readonly pos = new THREE.Vector3();
  private readonly lastUp = new THREE.Vector3(0, 1, 0);
  private readonly flightVel = new THREE.Vector3();
  private altitude = 0;
  private vertVel = 0;
  private grounded = true;
  private jumpsUsed = 0;
  private inFlight = false;

  private readonly keys = new Set<string>();
  private readonly models = new Map<CharacterId, THREE.Group>();
  private readonly parts = new Map<CharacterId, CharacterParts>();
  private flightTarget: PlanetRuntime | null = null;
  private flightTime = 0;
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
    spawnPlanetId: string,
    spawnDir: THREE.Vector3
  ) {
    if (planets.length === 0) {
      throw new Error('PlayerController: se necesita al menos un planeta');
    }
    this.planets = planets;
    this.camera = camera;
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

    // Modelos pre-construidos: el cambio 1/2/3 es instantáneo.
    const characterIds: CharacterId[] = ['kitsune', 'digger', 'axel'];
    for (const id of characterIds) {
      const model = buildCharacterModel(id);
      model.visible = id === this.activeCharacter;
      this.root.add(model);
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

  /** Up radial actual (normal de la esfera bajo el jugador). */
  get up(): THREE.Vector3 {
    return this.lastUp;
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

  // --------------------------------------------------------------------------
  // Entrada (reenviada por el GameEngine, que posee el Pointer Lock)
  // --------------------------------------------------------------------------
  handleKey(code: string, down: boolean): void {
    if (down) {
      this.keys.add(code);
      if (code === 'Space') this.tryJump();
      else if (code === 'Digit1') this.switchCharacter('kitsune');
      else if (code === 'Digit2') this.switchCharacter('digger');
      else if (code === 'Digit3') this.switchCharacter('axel');
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
    if (button !== 2) return;
    if (down) {
      if (!this.inFlight) this.gravityShifting = true;
    } else if (this.gravityShifting) {
      this.gravityShifting = false;
      if (this.gravityTarget && this.gravityTarget !== this.currentPlanet) {
        this.launchToTarget(this.gravityTarget);
      }
      this.gravityTarget = null;
    }
  }

  /** Al pausar: suelta teclas y cancela el apuntado sin lanzar al jugador. */
  clearTransientInput(): void {
    this.keys.clear();
    this.gravityShifting = false;
    this.gravityTarget = null;
  }

  // --------------------------------------------------------------------------
  // Simulación
  // --------------------------------------------------------------------------
  update(dt: number): void {
    if (dt <= 0) return;

    if (this.inFlight) {
      this.updateFlight(dt);
    } else {
      this.updateGrounded(dt);
    }

    // Reorientación suave del marco tangente (transporte paralelo continuo).
    alignBasisToUp(this.basisQuat, this.lastUp, 1 - Math.exp(-BASIS_ALIGN_SPEED * dt));

    // Aplica transform al modelo: mira hacia el forward de cámara.
    this._yawQuat.setFromAxisAngle(this._v1.set(0, 1, 0), this.yaw);
    this.root.quaternion
      .copy(this.basisQuat)
      .multiply(this._yawQuat)
      .multiply(this._flipQuat);
    this.root.position.copy(this.pos);

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
    if (this.isMoving) {
      this._move.normalize();
      const sprinting = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
      speed = this.profile.moveSpeed * (sprinting ? SPRINT_MULTIPLIER : 1);
      this.pos.addScaledVector(this._move, speed * dt);
      this.walkDistance += speed * dt;
    }

    // Dinámica vertical (salto / gravedad radial).
    this.altitude += this.vertVel * dt;
    this.vertVel -= GRAVITY_BASE * this.profile.gravityScale * dt;
    if (this.altitude <= 0) {
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

  private updateFlight(dt: number): void {
    this.flightTime += dt;
    // Durante un Gravity Shift dirigido, la atracción apunta al planeta objetivo
    // para garantizar el cruce orbital sin quedar atrapado en el planeta de origen.
    const activeTarget =
      this.flightTarget ??
      findStrongestGravityPlanet(this.pos, this.planets, this.currentPlanet.spec.id);
    this.currentPlanet = activeTarget;
    const center = activeTarget.centerVec;

    this._v1.copy(center).sub(this.pos);
    const dist = this._v1.length();
    if (dist > 1e-6) {
      this._v1.divideScalar(dist);
      // Corrección orbital suave hacia el objetivo para evitar desvíos laterales.
      const speed = this.flightVel.length();
      this.flightVel.lerp(this._v2.copy(this._v1).multiplyScalar(Math.max(speed, 50)), Math.min(1, dt * 3.2));
      this.flightVel.addScaledVector(this._v1, GRAVITY_BASE * 1.4 * dt);
    }
    this.pos.addScaledVector(this.flightVel, dt);

    this._up.copy(this.pos).sub(center);
    const newDist = this._up.length();
    this._up.divideScalar(Math.max(newDist, 1e-6));
    this.lastUp.copy(this._up);

    if (this.flightTime > 0.12 && newDist <= activeTarget.spec.radius + 0.15) {
      // Aterrizaje: anclaje a la nueva superficie.
      this.inFlight = false;
      this.flightTarget = null;
      this.flightTime = 0;
      this.grounded = true;
      this.altitude = 0;
      this.vertVel = 0;
      this.jumpsUsed = 0;
      this.flightVel.set(0, 0, 0);
      this.pos.copy(center).addScaledVector(this._up, activeTarget.spec.radius);
    }
  }

  private tryJump(): void {
    if (this.inFlight) return;
    if (this.grounded) {
      this.vertVel = this.profile.jumpImpulse;
      this.grounded = false;
      this.jumpsUsed = 1;
    } else if (this.jumpsUsed < 2) {
      // Doble impulso aéreo básico.
      this.vertVel = this.profile.jumpImpulse * DOUBLE_JUMP_FACTOR;
      this.jumpsUsed = 2;
    }
  }

  private launchToTarget(target: PlanetRuntime): void {
    // Pequeño despegue radial para salvar obstáculos del planeta de salida.
    this.pos.addScaledVector(this.lastUp, 1.2);
    this._v1.copy(target.centerVec).sub(this.pos);
    const travelDist = Math.max(this._v1.length() - target.spec.radius, 1);
    this._v1.normalize().addScaledVector(this.lastUp, 0.25).normalize();
    const speed = THREE.MathUtils.clamp(travelDist * 0.55, 48, 96);
    this.flightVel.copy(this._v1).multiplyScalar(speed);
    this.flightTarget = target;
    this.flightTime = 0;
    this.inFlight = true;
    this.grounded = false;
    this.altitude = 0;
    this.vertVel = 0;
    this.jumpsUsed = 0;
  }

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
    const currentModel = this.models.get(this.activeCharacter);
    if (currentModel) currentModel.visible = false;
    const nextModel = this.models.get(id);
    if (nextModel) nextModel.visible = true;
    this.activeCharacter = id;
    this.profile = GAME_CONSTANTS.CHARACTERS[id];
  }

  private animateLimbs(): void {
    const parts = this.parts.get(this.activeCharacter);
    if (!parts) return;
    const swing = Math.sin(this.walkPhase) * (this.isMoving ? 0.75 : 0.12);
    if (this.grounded) {
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
    this.root.clear();
    this.models.clear();
    this.parts.clear();
    this.keys.clear();
  }
}
