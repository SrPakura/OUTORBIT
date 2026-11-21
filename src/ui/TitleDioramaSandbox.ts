import * as THREE from 'three';
import { createSpaceBackdrop, setHalftonesEnabled } from '@/game/render/toonMaterials';
import {
  buildCharacterModel,
  buildKronosModel,
  buildPlanetModel,
  buildPropMesh,
} from '@/game/render/proceduralModels';
import {
  alignBasisToUp,
  getTangentAxes,
  orientObjectOnSphere,
  resolvePlayerProps,
  type PropCollider,
} from '@/game/math/spherical';
import { getPlanetTerrainOffsetVec, initPlanetTerrain } from '@/game/math/terrain';
import { createMenuFluidDivider, type MenuFluidDivider } from '@/game/render/menuShaders';
import { createMenuLogo3D, type MenuLogo3D } from '@/game/render/logo3d';
import {
  DEFAULT_SETTINGS,
  resolveActionCodes,
  type ControlAction,
  type GameSettings,
} from '@/game/settings';
import type {
  CharacterId,
  GalaxySpec,
  PlanetRuntime,
  PlanetSpec,
  PropKind,
} from '@/game/types';

// ============================================================================
// PASO C — Sandbox jugable de cámara fija sobre el mini-planeta de portada
// ============================================================================
//
// Un único WebGLRenderer dibuja tres capas limpias por frame:
//   1. Escena principal (PerspectiveCamera fov 44, encuadre fijo): cosmos vivo
//      de Fase A + planeta Verdant miniatura con anillos + props colisionables
//      + KRONOS en el hemisferio trasero + el escuadrón jugable.
//   2. clearDepth -> quad ortográfico del divisor líquido (blade blanco).
//   3. clearDepth -> cámara de overlay (fov 32) con el logotipo 3D OUTORBIT.
//
// El jugador se mueve por la esfera con los keybindings reales del usuario:
// los ejes de pantalla de la cámara fija se proyectan al plano tangente en la
// normal radial del jugador (transporte paralelo con `alignBasisToUp`, sin
// gimbal lock en los polos).

const PLANET_ID = 'title-verdant';
const PLANET_RADIUS = 6.2;
const PLANET_CENTER = new THREE.Vector3(0, 0, 0);

const GRAVITY = 22;
const JUMP_IMPULSE = 8.4;
const DOUBLE_JUMP_FACTOR = 0.85;
const MOVE_SPEED = 4.6;
const SPRINT_MULTIPLIER = 1.55;
const PLAYER_RADIUS = 0.45;
const FLIP_TIME = 0.55;
const CHAR_YAW_SPEED = 18;
const RUN_LEAN_ANGLE = 0.16;
const SQUASH_SPRING = 90;
const SQUASH_DAMPING = 10;

/** Ancho visual del logotipo (anillo orbital incluido) en unidades de mundo. */
const LOGO_VISUAL_WIDTH = 7.0;

const DIORAMA_PLANET: PlanetSpec = {
  id: PLANET_ID,
  order: 0,
  name: 'Verdant',
  subtitle: 'Diorama',
  biome: 'verdant',
  center: [0, 0, 0],
  radius: PLANET_RADIUS,
  gravityStrength: GRAVITY,
  surfaceColor: '#4ade80',
  patchColor: '#166534',
  atmosphereColor: '#7dd3fc',
  hasOrbitalRings: true,
  ringColor: '#c4b5fd',
  unlockedByPlanetId: null,
};

/** Galaxia mínima: solo existe para sembrar el relieve del mini-planeta. */
const TITLE_GALAXY: GalaxySpec = {
  skyTopColor: '#05010f',
  skyBottomColor: '#6d28d9',
  planets: [DIORAMA_PLANET],
  structures: [],
  waterBubbles: [],
  grassZones: [],
  objects: [],
  enemies: [],
  spawnPlanetId: PLANET_ID,
  spawnDir: [0, 1, 0],
};

interface DioramaPropSpec {
  kind: PropKind;
  dir: [number, number, number];
  scale: number;
  radius: number;
  height: number;
  capRadius: number;
  capY: number;
  bounce: number;
}

/** 6 props colisionables: 2 flores trampolín, 2 palmeras y 2 setas rebotadoras. */
const DIORAMA_PROPS: DioramaPropSpec[] = [
  {
    kind: 'giant_flower',
    dir: [0.62, 0.52, 0.58],
    scale: 0.9,
    radius: 0.16,
    height: 2.2,
    capRadius: 1.15,
    capY: 2.35,
    bounce: 17,
  },
  {
    kind: 'giant_flower',
    dir: [-0.55, 0.3, 0.78],
    scale: 0.85,
    radius: 0.16,
    height: 2.1,
    capRadius: 1.1,
    capY: 2.25,
    bounce: 17,
  },
  {
    kind: 'palm_tree',
    dir: [0.8, 0.05, 0.6],
    scale: 0.85,
    radius: 0.18,
    height: 3.1,
    capRadius: 0,
    capY: 0,
    bounce: 0,
  },
  {
    kind: 'palm_tree',
    dir: [-0.78, -0.12, 0.62],
    scale: 0.8,
    radius: 0.18,
    height: 3.0,
    capRadius: 0,
    capY: 0,
    bounce: 0,
  },
  {
    kind: 'glow_mushroom',
    dir: [0.3, -0.42, 0.86],
    scale: 0.9,
    radius: 0.38,
    height: 1.15,
    capRadius: 0.95,
    capY: 1.2,
    bounce: 14,
  },
  {
    kind: 'glow_mushroom',
    dir: [-0.34, -0.55, 0.76],
    scale: 0.85,
    radius: 0.36,
    height: 1.1,
    capRadius: 0.9,
    capY: 1.15,
    bounce: 14,
  },
];

interface CharacterRig {
  model: THREE.Group;
  head: THREE.Object3D;
  leftArm: THREE.Object3D;
  rightArm: THREE.Object3D;
  leftLeg: THREE.Object3D;
  rightLeg: THREE.Object3D;
  tail: THREE.Object3D;
  tailTip: THREE.Object3D | null;
  cape: THREE.Object3D | null;
}

export interface TitleDioramaSandboxOptions {
  canvas: HTMLCanvasElement;
  settings: GameSettings;
}

/**
 * Runtime interactivo de la portada. Construye toda la escena, escucha el
 * teclado (solo cuando no hay ningún modal abierto) y libera geometrías,
 * materiales, listeners y el renderer en `dispose()`.
 */
export class TitleDioramaSandbox {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly logoScene = new THREE.Scene();
  private readonly logoCamera: THREE.PerspectiveCamera;
  private readonly dividerScene = new THREE.Scene();
  private readonly divider: MenuFluidDivider;
  private readonly logo: MenuLogo3D;
  private readonly backdrop: { update: (dt: number, cameraPos: THREE.Vector3) => void; dispose: () => void };
  private readonly planet: { group: THREE.Group; animTick: (dt: number) => void };
  private readonly planetRuntime: PlanetRuntime;
  private readonly propColliders: PropCollider[] = [];

  private readonly root = new THREE.Group();
  private readonly bodyRoot = new THREE.Group();
  private readonly flipPivot = new THREE.Group();
  private readonly rigs = new Map<CharacterId, CharacterRig>();
  private activeCharacter: CharacterId = 'kitsune';

  private readonly pos = new THREE.Vector3();
  private readonly basisQuat = new THREE.Quaternion();
  private readonly lastUp = new THREE.Vector3(0, 1, 0);
  private altitude = 0;
  private vertVel = 0;
  private grounded = true;
  private jumpsUsed = 0;
  private jumpQueued = false;
  private charYaw = 0;
  private walkPhase = 0;
  private isMoving = false;
  private leanAngle = 0;
  private flipTimer = 0;
  private capeFlow = 0;
  private squashY = 1;
  private squashXZ = 1;
  private squashVelY = 0;
  private squashVelXZ = 0;

  private readonly _up = new THREE.Vector3();
  private readonly _camRight = new THREE.Vector3();
  private readonly _camUp = new THREE.Vector3();
  private readonly _move = new THREE.Vector3();
  private readonly _forward = new THREE.Vector3();
  private readonly _right = new THREE.Vector3();
  private readonly _yawQuat = new THREE.Quaternion();
  private readonly _flipQuat = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    Math.PI
  );

  private readonly keys = new Set<string>();
  private codesByAction: Record<ControlAction, string[]> = resolveActionCodes(
    DEFAULT_SETTINGS.bindings
  );
  private suspended = false;

  private width = 1;
  private height = 1;
  private elapsed = 0;
  private lastTime = 0;
  private rafId = 0;

  constructor(options: TitleDioramaSandboxOptions) {
    // El relieve del mini-planeta se siembra ANTES de construir el modelo.
    initPlanetTerrain(TITLE_GALAXY);

    this.renderer = new THREE.WebGLRenderer({
      canvas: options.canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x05010f, 1);
    this.renderer.autoClear = false;

    this.camera = new THREE.PerspectiveCamera(44, 1, 0.1, 4000);
    this.camera.position.set(0, 2.8, 24.3);
    this.camera.lookAt(PLANET_CENTER);
    this.camera.updateMatrixWorld(true);

    this.logoCamera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    this.logoCamera.position.set(0, 0, 10);

    this.backdrop = createSpaceBackdrop(this.scene, '#05010f', '#6d28d9');

    const sun = new THREE.DirectionalLight(0xfff3d6, 1.5);
    sun.position.set(12, 18, 10);
    this.scene.add(sun);
    this.scene.add(new THREE.AmbientLight(0x8b7bd8, 0.55));

    // --- Planeta miniatura con anillos orbitales de maná ---
    this.planet = buildPlanetModel(DIORAMA_PLANET);
    this.scene.add(this.planet.group);
    this.planetRuntime = {
      spec: DIORAMA_PLANET,
      mesh: this.planet.group,
      centerVec: PLANET_CENTER.clone(),
      shielded: false,
    };

    // --- Props colisionables sobre la superficie ---
    for (let i = 0; i < DIORAMA_PROPS.length; i++) {
      const spec = DIORAMA_PROPS[i];
      const dir = new THREE.Vector3(spec.dir[0], spec.dir[1], spec.dir[2]).normalize();
      const terrain = getPlanetTerrainOffsetVec(PLANET_ID, dir);
      const mesh = buildPropMesh(spec.kind);
      mesh.scale.setScalar(spec.scale);
      orientObjectOnSphere(mesh, PLANET_CENTER, dir, PLANET_RADIUS + terrain);
      this.scene.add(mesh);

      this.propColliders.push({
        id: `title-prop-${i}`,
        planetId: PLANET_ID,
        center: mesh.position.clone(),
        upDir: dir.clone(),
        baseAltitude: terrain,
        radius: spec.radius * spec.scale,
        height: spec.height * spec.scale,
        capRadius: spec.capRadius * spec.scale,
        capY: spec.capY * spec.scale,
        bounceImpulse: spec.bounce,
        softFoliage: false,
        isStealthBush: false,
      });
    }

    // --- KRONOS acechando en el hemisferio inferior-trasero ---
    const kronos = buildKronosModel();
    kronos.group.scale.multiplyScalar(0.55);
    orientObjectOnSphere(
      kronos.group,
      PLANET_CENTER,
      new THREE.Vector3(0.25, -0.75, -0.6).normalize(),
      PLANET_RADIUS
    );
    this.scene.add(kronos.group);

    // --- Escuadrón jugable (1/2/3 cambia de personaje al instante) ---
    this.root.add(this.bodyRoot);
    this.flipPivot.position.y = 0.85;
    this.bodyRoot.add(this.flipPivot);
    const characterIds: CharacterId[] = ['kitsune', 'digger', 'axel'];
    for (const id of characterIds) {
      const model = buildCharacterModel(id);
      model.visible = id === this.activeCharacter;
      model.position.y = -0.85;
      this.flipPivot.add(model);
      this.rigs.set(id, {
        model,
        head: model.getObjectByName('head') ?? model,
        leftArm: model.getObjectByName('leftArm') ?? model,
        rightArm: model.getObjectByName('rightArm') ?? model,
        leftLeg: model.getObjectByName('leftLeg') ?? model,
        rightLeg: model.getObjectByName('rightLeg') ?? model,
        tail: model.getObjectByName('tail') ?? model,
        tailTip: model.getObjectByName('tailTip') ?? null,
        cape: model.getObjectByName('cape') ?? null,
      });
    }
    this.scene.add(this.root);

    // Spawn en la cima del planeta (visible, como en la referencia).
    this._up.set(0, 1, 0);
    this.altitude = getPlanetTerrainOffsetVec(PLANET_ID, this._up);
    this.pos.copy(PLANET_CENTER).addScaledVector(this._up, PLANET_RADIUS + this.altitude);
    this.lastUp.copy(this._up);
    alignBasisToUp(this.basisQuat, this._up, 1);

    // --- Capa 2: divisor líquido a pantalla completa ---
    this.divider = createMenuFluidDivider();
    this.dividerScene.add(this.divider.mesh);

    // --- Capa 3: logotipo 3D en el blade superior izquierdo ---
    this.logo = createMenuLogo3D();
    this.logoScene.add(this.logo.group);

    this.setSettings(options.settings);

    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.renderer.setSize(this.width, this.height, false);
    this.layoutCameras();

    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);

    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
  }

  /** Aplica ajustes persistentes (bindings, halftone) sin reconstruir la escena. */
  setSettings(settings: GameSettings): void {
    this.codesByAction = resolveActionCodes(settings.bindings);
    setHalftonesEnabled(settings.halftonesEnabled);
  }

  /** Congela la captura de teclado mientras hay un modal abierto. */
  setControlsSuspended(suspended: boolean): void {
    this.suspended = suspended;
    if (suspended) {
      this.keys.clear();
      this.jumpQueued = false;
    }
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);

    this.backdrop.dispose();
    this.divider.dispose();
    this.logo.dispose();

    this.scene.traverse((obj) => {
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
    this.scene.clear();
    this.dividerScene.clear();
    this.logoScene.clear();
    this.rigs.clear();
    this.keys.clear();
    this.renderer.dispose();
  }

  // --------------------------------------------------------------------------
  // Encuadre (cámara fija del planeta + cámara de overlay del logotipo)
  // --------------------------------------------------------------------------
  private layoutCameras(): void {
    const w = this.width;
    const h = this.height;
    const aspect = w / h;

    // El planeta se centra al ~64% del ancho en escritorio (blade a la izquierda).
    this.camera.aspect = aspect;
    const shift = THREE.MathUtils.clamp((w - 720) / 900, 0, 1) * 0.14;
    this.camera.setViewOffset(w, h, -shift * w, 0, w, h);
    this.camera.updateProjectionMatrix();

    // Logotipo: encuadre en el blade superior izquierdo, escala con la ventana.
    this.logoCamera.aspect = aspect;
    this.logoCamera.updateProjectionMatrix();
    const halfH = Math.tan(THREE.MathUtils.degToRad(this.logoCamera.fov * 0.5)) * this.logoCamera.position.z;
    const halfW = halfH * aspect;
    const scale = (0.31 * 2 * halfW) / LOGO_VISUAL_WIDTH;
    this.logo.group.scale.setScalar(scale);
    this.logo.group.position.set((2 * 0.19 - 1) * halfW, (1 - 2 * 0.195) * halfH, 0);
  }

  private handleResize = (): void => {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.renderer.setSize(this.width, this.height, false);
    this.layoutCameras();
  };

  // --------------------------------------------------------------------------
  // Entrada de teclado (keybindings reales del usuario)
  // --------------------------------------------------------------------------
  private matches(action: ControlAction, code: string): boolean {
    return this.codesByAction[action].includes(code);
  }

  private isBoundCode(code: string): boolean {
    for (const action of Object.keys(this.codesByAction) as ControlAction[]) {
      if (this.codesByAction[action].includes(code)) return true;
    }
    return false;
  }

  private isActionDown(action: ControlAction): boolean {
    const codes = this.codesByAction[action];
    for (let i = 0; i < codes.length; i++) {
      if (this.keys.has(codes[i])) return true;
    }
    return false;
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (this.suspended) return;
    const code = event.code;
    if (this.isBoundCode(code)) event.preventDefault();
    this.keys.add(code);
    if (this.matches('jump', code) && !event.repeat) this.jumpQueued = true;
    if (this.matches('slot1', code)) this.setCharacter('kitsune');
    else if (this.matches('slot2', code)) this.setCharacter('digger');
    else if (this.matches('slot3', code)) this.setCharacter('axel');
  };

  private handleKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  private handleBlur = (): void => {
    this.keys.clear();
    this.jumpQueued = false;
  };

  private setCharacter(id: CharacterId): void {
    if (id === this.activeCharacter) return;
    const current = this.rigs.get(this.activeCharacter);
    if (current) current.model.visible = false;
    const next = this.rigs.get(id);
    if (next) next.model.visible = true;
    this.activeCharacter = id;
  }

  // --------------------------------------------------------------------------
  // Simulación del jugador sobre la esfera (cámara fija)
  // --------------------------------------------------------------------------
  private applySquash(sy: number, sxz: number): void {
    this.squashY = sy;
    this.squashXZ = sxz;
    this.squashVelY = 0;
    this.squashVelXZ = 0;
  }

  private updatePlayer(dt: number): void {
    const up = this._up.copy(this.pos).sub(PLANET_CENTER);
    const radial = up.length();
    if (radial > 1e-6) up.divideScalar(radial);

    // Ejes de pantalla de la cámara fija proyectados al plano tangente.
    const camRight = this._camRight.setFromMatrixColumn(this.camera.matrixWorld, 0);
    const camUp = this._camUp.setFromMatrixColumn(this.camera.matrixWorld, 1);
    camRight.addScaledVector(up, -camRight.dot(up));
    camUp.addScaledVector(up, -camUp.dot(up));
    if (camRight.lengthSq() < 1e-6) camRight.set(1, 0, 0);
    camRight.normalize();
    if (camUp.lengthSq() < 1e-6) camUp.set(0, 0, 1);
    camUp.normalize();

    const inputZ = (this.isActionDown('forward') ? 1 : 0) - (this.isActionDown('back') ? 1 : 0);
    const inputX = (this.isActionDown('right') ? 1 : 0) - (this.isActionDown('left') ? 1 : 0);
    const move = this._move
      .set(0, 0, 0)
      .addScaledVector(camUp, inputZ)
      .addScaledVector(camRight, inputX);
    this.isMoving = move.lengthSq() > 1e-8;

    let speed = 0;
    if (this.isMoving) {
      move.normalize();
      speed = MOVE_SPEED * (this.isActionDown('sprint') ? SPRINT_MULTIPLIER : 1);
      this.pos.addScaledVector(move, speed * dt);
      this.walkPhase += dt * speed * 1.6;
    } else {
      this.walkPhase += dt * 1.4;
    }

    // Salto / doble salto (voltereta 360º alrededor del centro de gravedad).
    if (this.jumpQueued) {
      this.jumpQueued = false;
      if (this.grounded) {
        this.vertVel = JUMP_IMPULSE;
        this.grounded = false;
        this.jumpsUsed = 1;
        this.applySquash(1.18, 0.9);
      } else if (this.jumpsUsed < 2) {
        this.vertVel = JUMP_IMPULSE * DOUBLE_JUMP_FACTOR;
        this.jumpsUsed = 2;
        this.flipTimer = FLIP_TIME;
        this.applySquash(1.16, 0.92);
      }
    }

    // Suelo real: relieve del terreno + techos de props (flores, setas).
    const groundUp = this._forward.copy(this.pos).sub(PLANET_CENTER);
    const groundUpLen = groundUp.length();
    if (groundUpLen > 1e-6) groundUp.divideScalar(groundUpLen);
    const terrainOffset = getPlanetTerrainOffsetVec(PLANET_ID, groundUp);
    const propRes = resolvePlayerProps(
      this.pos,
      this.vertVel,
      this.altitude,
      this.planetRuntime,
      this.propColliders,
      PLAYER_RADIUS
    );
    const propElevated = propRes.groundAltitude - terrainOffset;
    const elevated = Math.max(propElevated, 0);
    const groundAltitude = terrainOffset + elevated;

    this.altitude += this.vertVel * dt;
    this.vertVel -= GRAVITY * dt;
    if (this.altitude <= groundAltitude) {
      if (propRes.bounceImpulse > 0 && propElevated >= elevated - 0.01) {
        // Trampolín: flor gigante / seta bioluminiscente.
        this.vertVel = propRes.bounceImpulse;
        this.grounded = false;
        this.jumpsUsed = 1;
        this.flipTimer = FLIP_TIME;
        this.applySquash(1.2, 0.88);
      } else {
        this.altitude = groundAltitude;
        this.vertVel = 0;
        if (!this.grounded) {
          this.jumpsUsed = 0;
          this.applySquash(0.82, 1.14);
        }
        this.grounded = true;
      }
    } else {
      this.grounded = false;
    }

    // Re-proyección a la esfera (caminar por polos sin gimbal lock).
    up.copy(this.pos).sub(PLANET_CENTER);
    const newRadial = up.length();
    if (newRadial > 1e-6) {
      up.divideScalar(newRadial);
      this.pos.copy(PLANET_CENTER).addScaledVector(up, PLANET_RADIUS + this.altitude);
    }
    this.lastUp.copy(up);
    alignBasisToUp(this.basisQuat, up, 1);

    // Giro del personaje hacia la dirección de movimiento.
    if (this.isMoving) {
      getTangentAxes(this.basisQuat, 0, this._forward, this._right);
      const targetYaw = Math.atan2(-move.dot(this._right), move.dot(this._forward));
      let delta = targetYaw - this.charYaw;
      if (delta > Math.PI) delta -= Math.PI * 2;
      else if (delta < -Math.PI) delta += Math.PI * 2;
      this.charYaw += delta * (1 - Math.exp(-CHAR_YAW_SPEED * dt));
      if (this.charYaw > Math.PI) this.charYaw -= Math.PI * 2;
      else if (this.charYaw < -Math.PI) this.charYaw += Math.PI * 2;
    }

    this.updateVisuals(dt);

    this._yawQuat.setFromAxisAngle(this._forward.set(0, 1, 0), this.charYaw);
    this.root.quaternion
      .copy(this.basisQuat)
      .multiply(this._yawQuat)
      .multiply(this._flipQuat);
    this.root.position.copy(this.pos);
  }

  /** Squash & stretch, voltereta, inclinación al correr y animación de limbs. */
  private updateVisuals(dt: number): void {
    const springY = (1 - this.squashY) * SQUASH_SPRING - this.squashVelY * SQUASH_DAMPING;
    const springXZ = (1 - this.squashXZ) * SQUASH_SPRING - this.squashVelXZ * SQUASH_DAMPING;
    this.squashVelY += springY * dt;
    this.squashVelXZ += springXZ * dt;
    this.squashY += this.squashVelY * dt;
    this.squashXZ += this.squashVelXZ * dt;

    const leanTarget = this.grounded && this.isMoving ? RUN_LEAN_ANGLE : 0;
    this.leanAngle += (leanTarget - this.leanAngle) * Math.min(1, dt * 10);

    let flipAngle = 0;
    if (this.flipTimer > 0) {
      this.flipTimer -= dt;
      const p = THREE.MathUtils.clamp(1 - this.flipTimer / FLIP_TIME, 0, 1);
      flipAngle = -p * Math.PI * 2;
    }
    this.flipPivot.rotation.x = this.leanAngle + flipAngle;
    this.flipPivot.scale.set(this.squashXZ, this.squashY, this.squashXZ);

    const flowTarget = this.isMoving ? 1 : this.grounded ? 0.25 : 0.7;
    this.capeFlow += (flowTarget - this.capeFlow) * Math.min(1, dt * 6);

    const rig = this.rigs.get(this.activeCharacter);
    if (!rig) return;

    if (rig.cape) {
      rig.cape.rotation.x =
        -0.12 - this.capeFlow * 0.5 + Math.sin(this.walkPhase * 1.7) * 0.14 * this.capeFlow;
      rig.cape.rotation.z = Math.sin(this.walkPhase * 0.85) * 0.1 * this.capeFlow;
    }
    if (this.activeCharacter === 'kitsune') {
      const wagSpeed = this.isMoving ? 9 : 3.2;
      const wagAmp = this.isMoving ? 0.55 : 0.3;
      rig.tail.rotation.y = Math.sin(this.elapsed * wagSpeed) * wagAmp;
      if (rig.tailTip) {
        rig.tailTip.rotation.y = Math.sin(this.elapsed * wagSpeed + 1.2) * wagAmp * 0.9;
      }
    } else {
      rig.tail.rotation.y = Math.sin(this.walkPhase * 0.7) * 0.45;
    }

    // Brazos y piernas: carrera articulada / pose aérea.
    if (this.grounded) {
      const swing = Math.sin(this.walkPhase) * (this.isMoving ? 0.75 : 0.12);
      rig.leftArm.rotation.x = swing;
      rig.rightArm.rotation.x = -swing;
      rig.leftLeg.rotation.x = -swing;
      rig.rightLeg.rotation.x = swing;
    } else {
      rig.leftArm.rotation.x = -2.2;
      rig.rightArm.rotation.x = -2.2;
      rig.leftLeg.rotation.x = 0.5;
      rig.rightLeg.rotation.x = -0.3;
    }
    rig.head.rotation.z = Math.sin(this.walkPhase * 0.5) * 0.05;
  }

  // --------------------------------------------------------------------------
  // Loop de render (3 capas limpias)
  // --------------------------------------------------------------------------
  private tick = (): void => {
    this.rafId = requestAnimationFrame(this.tick);
    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;
    this.elapsed += dt;

    this.updatePlayer(dt);
    this.planet.animTick(dt);
    this.backdrop.update(dt, this.camera.position);
    this.divider.update(this.elapsed, this.width / this.height);
    this.logo.animTick(dt);

    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderer.clearDepth();
    this.renderer.render(this.dividerScene, this.divider.camera);
    this.renderer.clearDepth();
    this.renderer.render(this.logoScene, this.logoCamera);
  };
}
