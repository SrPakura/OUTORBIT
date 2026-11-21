import * as THREE from 'three';
import {
  GAME_CONSTANTS,
  type HudSnapshot,
  type LevelObjective,
  type LevelSpec,
  type PlanetAdaptationConfig,
  type PlanetRuntime,
  type PlayerBehaviorVector,
} from './types';
import { orientObjectOnSphere } from './math/spherical';
import { createSpaceBackdrop } from './render/toonMaterials';
import { buildPlanetModel, buildWarpPortal } from './render/proceduralModels';
import { PlayerController } from './entities/PlayerController';
import { WorldObjectsManager, type WorldPlayerState } from './entities/WorldObjects';
import { LEVELS, createLevelObjectives } from './levels/levelDefinitions';

// ============================================================================
// Constantes de cámara y portal
// ============================================================================
const HUD_INTERVAL = 1 / 15;
const CAMERA_BASE_DIST = 10.5;
const CAMERA_MIN_DIST = 5;
const CAMERA_MAX_DIST = 20;
const CAMERA_DISTANCE_SHIFT = 5.2;
const CAMERA_DISTANCE_CORE_DIVE = 6.5;
const CAMERA_FOV = 70;
const CAMERA_FOV_SHIFT = 52;
const PORTAL_TRIGGER_RADIUS = 6;
const TRANSITION_DURATION = 2.4;

const DEFAULT_ADAPTATION: PlanetAdaptationConfig = {
  baseAlertLevel: 0,
  extraPatrolCount: 0,
  armoredHelmets: false,
  pairGuardPatrols: false,
  doorScanners: false,
  seismicMines: false,
  antiAirTurrets: false,
  predictiveShields: false,
  summaryReasons: [],
};

/**
 * Orquestador Three.js: monta los niveles de la campaña (Prólogo + Verdant),
 * ejecuta el loop principal, gestiona Pointer Lock / pausa / transiciones de
 * planeta y emite HudSnapshot al callback suscrito (máximo ~15 Hz, o inmediato
 * ante cambios discretos) para que React no se re-renderice por frame.
 */
export class GameEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly onHudSnapshot: (snapshot: HudSnapshot) => void;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly planets: PlanetRuntime[] = [];
  private readonly planetTicks: Array<(dt: number) => void> = [];
  private backdrop: { update: (dt: number) => void; dispose: () => void } | null = null;

  // Estado por nivel.
  private levelIndex = 0;
  private level: LevelSpec = LEVELS[0];
  private levelGroup: THREE.Group | null = null;
  private world: WorldObjectsManager | null = null;
  private player: PlayerController | null = null;
  private objectives: LevelObjective[] = [];
  private portalPos = new THREE.Vector3();
  private portalTick: ((dt: number) => void) | null = null;

  private rafId = 0;
  private lastTime = 0;
  private elapsed = 0;
  private timeScale = 1;
  private camDist = CAMERA_BASE_DIST;
  private baseCamDist = CAMERA_BASE_DIST;
  private phase: HudSnapshot['phase'] = 'playing';
  private pointerLocked = false;
  private hudAccum = 0;
  private hudKey = 0;
  private transitionTimer = 0;

  // Estado del jugador que el mundo necesita (preasignado, sin GC).
  private readonly worldState: WorldPlayerState = {
    pos: new THREE.Vector3(),
    up: new THREE.Vector3(),
    forward: new THREE.Vector3(),
    disguised: false,
    inGrass: false,
    burrowing: false,
    swimming: false,
    parryActive: false,
    stealthMul: 1,
  };

  // Temporales preasignados (sin GC en el loop)
  private readonly _camQuat = new THREE.Quaternion();
  private readonly _camDir = new THREE.Vector3();
  private readonly _camPos = new THREE.Vector3();
  private readonly _v1 = new THREE.Vector3();

  private readonly boundKeyDown = (e: KeyboardEvent) => this.onKeyDown(e);
  private readonly boundKeyUp = (e: KeyboardEvent) => this.onKeyUp(e);
  private readonly boundMouseMove = (e: MouseEvent) => this.onMouseMove(e);
  private readonly boundMouseDown = (e: MouseEvent) => this.onMouseDown(e);
  private readonly boundMouseUp = (e: MouseEvent) => this.onMouseUp(e);
  private readonly boundWheel = (e: WheelEvent) => this.onWheel(e);
  private readonly boundClick = () => this.requestPointerLock();
  private readonly boundContextMenu = (e: Event) => e.preventDefault();
  private readonly boundPointerLockChange = () => this.onPointerLockChange();
  private readonly boundResize = () => this.onResize();
  private readonly boundPlayerDamage = (amount: number, px: number, py: number, pz: number) => {
    this.player?.takeDamage(amount, px, py, pz);
  };

  constructor(canvas: HTMLCanvasElement, onHudSnapshot: (snapshot: HudSnapshot) => void) {
    this.canvas = canvas;
    this.onHudSnapshot = onHudSnapshot;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);

    this.camera = new THREE.PerspectiveCamera(
      CAMERA_FOV,
      window.innerWidth / Math.max(window.innerHeight, 1),
      0.1,
      2500
    );

    this.setupLights();
    this.loadLevel(0);
    this.attachListeners();
    this.emitHud();
  }

  // --------------------------------------------------------------------------
  // Construcción / reconstrucción del nivel activo
  // --------------------------------------------------------------------------
  private setupLights(): void {
    const sun = new THREE.DirectionalLight(0xfff2d8, 2.4);
    sun.position.set(320, 420, 220);
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight(0x8b5cf6, 0.7);
    fill.position.set(-260, -120, -300);
    this.scene.add(fill);

    this.scene.add(new THREE.HemisphereLight(0x9d7bff, 0x0b0618, 0.55));
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.32));
  }

  private disposeLevel(): void {
    if (this.player) {
      this.scene.remove(this.player.root);
      this.player.dispose();
      this.player = null;
    }
    if (this.levelGroup) {
      this.levelGroup.traverse((obj) => {
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
      this.scene.remove(this.levelGroup);
      this.levelGroup = null;
    }
    if (this.backdrop) {
      this.backdrop.dispose();
      this.backdrop = null;
    }
    this.world?.clear();
    this.world = null;
    this.planets.length = 0;
    this.planetTicks.length = 0;
    this.portalTick = null;
  }

  private loadLevel(index: number): void {
    this.disposeLevel();
    this.levelIndex = index;
    this.level = LEVELS[index];

    this.scene.background = new THREE.Color(this.level.skyTopColor);
    this.backdrop = createSpaceBackdrop(
      this.scene,
      this.level.skyTopColor,
      this.level.skyBottomColor
    );

    this.levelGroup = new THREE.Group();
    this.levelGroup.name = `level-${this.level.id}`;
    this.scene.add(this.levelGroup);

    for (const spec of this.level.planets) {
      const { group, animTick } = buildPlanetModel(spec);
      this.levelGroup.add(group);
      this.planets.push({ spec, mesh: group, centerVec: new THREE.Vector3(...spec.center) });
      this.planetTicks.push(animTick);
    }

    // Portal de fin de nivel sobre el planeta destino.
    const portalPlanet = this.planets.find((p) => p.spec.id === this.level.portalPlanetId);
    if (portalPlanet) {
      const portal = buildWarpPortal();
      const portalDir = new THREE.Vector3(...this.level.portalDir);
      orientObjectOnSphere(
        portal.group,
        portalPlanet.centerVec,
        portalDir,
        portalPlanet.spec.radius + 2.2
      );
      this.portalPos.copy(portal.group.position);
      this.levelGroup.add(portal.group);
      this.portalTick = portal.animTick;
    }

    // Objetos del mundo: agarrables, generadores, láser, burbujas, hierba, guardias.
    this.world = new WorldObjectsManager(this.levelGroup, this.planets);
    this.world.build(this.level);

    this.objectives = createLevelObjectives(this.level.id);

    this.player = new PlayerController(
      this.planets,
      this.camera,
      this.world,
      this.level.spawnPlanetId,
      new THREE.Vector3(...this.level.spawnDir)
    );
    this.scene.add(this.player.root);
  }

  // --------------------------------------------------------------------------
  // Ciclo de vida
  // --------------------------------------------------------------------------
  start(): void {
    this.lastTime = performance.now() / 1000;
    this.rafId = requestAnimationFrame(this.tick);
  }

  /** Reanuda desde pausa: solicita Pointer Lock (requiere gesto del usuario). */
  resume(): void {
    this.requestPointerLock();
  }

  private readonly tick = (nowMs: number): void => {
    this.rafId = requestAnimationFrame(this.tick);
    const now = nowMs / 1000;
    let dtReal = now - this.lastTime;
    this.lastTime = now;
    dtReal = Math.min(Math.max(dtReal, 0), GAME_CONSTANTS.FIXED_MAX_DT);

    if (this.phase === 'playing') {
      const player = this.player;
      if (player) {
        // Cámara lenta durante Gravity Shift.
        const targetScale = player.gravityShifting
          ? GAME_CONSTANTS.GRAVITY_SHIFT_TIME_SCALE
          : 1;
        this.timeScale += (targetScale - this.timeScale) * Math.min(1, dtReal * 10);
        const dtSim = dtReal * this.timeScale;

        player.update(dtSim);
        this.syncWorldState();
        this.world?.update(dtSim, this.worldState, this.boundPlayerDamage);
        this.elapsed += dtSim;
      }

      for (const animTick of this.planetTicks) animTick(dtReal);
      if (this.portalTick) this.portalTick(dtReal);
      this.backdrop?.update(dtReal);

      this.updateObjectives();
      this.checkVictory();
      this.checkGameOver();
    } else if (this.phase === 'planet_transition') {
      // Congelado cinemático entre niveles; al terminar carga el siguiente.
      this.transitionTimer -= dtReal;
      this.backdrop?.update(dtReal);
      if (this.transitionTimer <= 0) {
        this.loadLevel(this.levelIndex + 1);
        this.phase = 'playing';
        this.emitHud();
      }
    }

    this.updateCamera(dtReal);
    this.renderer.render(this.scene, this.camera);
    this.updateHudEmission(dtReal);
  };

  private syncWorldState(): void {
    const player = this.player;
    const world = this.world;
    if (!player || !world) return;
    this.worldState.pos.copy(player.position);
    this.worldState.up.copy(player.up);
    player.getMoveForward(this.worldState.forward);
    this.worldState.disguised = player.isDisguised;
    this.worldState.burrowing = player.isBurrowing;
    this.worldState.swimming = player.isSwimming;
    this.worldState.parryActive = player.parryWindowActive;
    this.worldState.stealthMul = player.stealthMultiplier;
    this.worldState.inGrass = world.isInGrass(player.position, player.planet);
  }

  private updateCamera(dtReal: number): void {
    const player = this.player;
    if (!player) return;
    player.getCameraOrientation(this._camQuat);
    this.camera.quaternion.copy(this._camQuat);
    this._camDir.set(0, 0, -1).applyQuaternion(this._camQuat);
    player.getHeadPosition(this._camPos);

    // Zoom: rueda del ratón (5-20) + acercamiento en Gravity Shift / cruce de núcleo.
    const targetDist = player.gravityShifting
      ? CAMERA_DISTANCE_SHIFT
      : player.coreDiving
        ? CAMERA_DISTANCE_CORE_DIVE
        : this.baseCamDist;
    this.camDist += (targetDist - this.camDist) * Math.min(1, dtReal * 6);
    this.camera.position.copy(this._camPos).addScaledVector(this._camDir, -this.camDist);

    // Anti-clipping contra TODOS los planetas del nivel: la cámara jamás
    // puede quedar por debajo de ninguna superficie, ni en pleno vuelo.
    for (let i = 0; i < this.planets.length; i++) {
      const planet = this.planets[i];
      this._v1.copy(this.camera.position).sub(planet.centerVec);
      const camDistToCenter = this._v1.length();
      const minDist = planet.spec.radius + 1.5;
      if (camDistToCenter < minDist && camDistToCenter > 1e-6) {
        this.camera.position
          .copy(planet.centerVec)
          .addScaledVector(this._v1.divideScalar(camDistToCenter), minDist);
      }
    }

    const targetFov = player.gravityShifting ? CAMERA_FOV_SHIFT : CAMERA_FOV;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dtReal * 6);
      this.camera.updateProjectionMatrix();
    }
  }

  // --------------------------------------------------------------------------
  // Objetivos, victoria y derrota
  // --------------------------------------------------------------------------
  private updateObjectives(): void {
    const player = this.player;
    if (!player) return;

    if (this.level.id === 'prologue') {
      const explore = this.objectives[0];
      if (explore && !explore.completed && player.walkDistance >= 15) {
        explore.currentCount = 1;
        explore.completed = true;
      }
      const shift = this.objectives[1];
      if (
        shift &&
        !shift.completed &&
        player.planet.spec.id === this.level.portalPlanetId
      ) {
        shift.currentCount = 1;
        shift.completed = true;
      }
    } else {
      // Verdant: generadores destruidos + llegada al islote.
      const generators = this.objectives.find((o) => o.id === 'generators');
      if (generators && !generators.completed) {
        generators.currentCount = this.world?.generatorsDestroyed ?? 0;
        if (generators.currentCount >= generators.targetCount) {
          generators.completed = true;
        }
      }
      const bubbles = this.objectives.find((o) => o.id === 'bubbles');
      if (
        bubbles &&
        !bubbles.completed &&
        player.planet.spec.id === this.level.portalPlanetId
      ) {
        bubbles.currentCount = 1;
        bubbles.completed = true;
      }
    }
  }

  private checkVictory(): void {
    if (this.phase !== 'playing') return;
    const player = this.player;
    if (!player) return;
    if (player.planet.spec.id !== this.level.portalPlanetId) return;
    if (player.position.distanceTo(this.portalPos) > PORTAL_TRIGGER_RADIUS) return;

    const portalObjective = this.objectives.find((o) => o.id === 'portal');
    if (portalObjective) {
      portalObjective.currentCount = 1;
      portalObjective.completed = true;
    }

    if (this.levelIndex >= LEVELS.length - 1) {
      // Último nivel del hito: pantalla de hito completado.
      this.phase = 'victory';
      if (document.pointerLockElement === this.canvas) document.exitPointerLock();
      this.emitHud();
    } else {
      // Cruce de portal: transición cinemática al siguiente planeta.
      this.phase = 'planet_transition';
      this.transitionTimer = TRANSITION_DURATION;
      this.emitHud();
    }
  }

  private checkGameOver(): void {
    if (this.phase !== 'playing') return;
    const player = this.player;
    if (!player || player.hp > 0) return;
    this.phase = 'game_over';
    this.timeScale = 1;
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.emitHud();
  }

  // --------------------------------------------------------------------------
  // HUD: emisión limitada (~15 Hz) + inmediata en cambios discretos
  // --------------------------------------------------------------------------
  private computePromptKind(): number {
    const player = this.player;
    const world = this.world;
    if (!player || !world) return 0;
    if (world.knockoutTargetNear(player.position)) return 1;
    if (world.guardAttackingNear(player.position)) return 2;
    if (world.grabbableNear(player.position)) return 3;
    if (
      player.characterId === 'digger' &&
      player.isGrounded &&
      !player.isBurrowing &&
      !player.isInFlight
    ) {
      return 4;
    }
    return 0;
  }

  private updateHudEmission(dtReal: number): void {
    const player = this.player;
    const world = this.world;
    if (!player || !world) return;

    // Clave numérica discreta (sin allocations por frame).
    let completed = 0;
    for (let i = 0; i < this.objectives.length; i++) {
      if (this.objectives[i].completed) completed++;
    }
    let key = this.levelIndex * 7 + this.phaseCode();
    key = key * 31 + (player.characterId === 'kitsune' ? 0 : player.characterId === 'digger' ? 1 : 2);
    key = key * 31 + this.planets.indexOf(player.planet);
    key = key * 31 + (player.gravityTarget ? this.planets.indexOf(player.gravityTarget) + 2 : 0);
    key = key * 31 + (player.gravityShifting ? 1 : 0);
    key = key * 31 + (this.pointerLocked ? 1 : 0);
    key = key * 31 + completed;
    key = key * 31 + (player.isDisguised ? 1 : 0);
    key = key * 31 + (player.isBurrowing ? 1 : 0);
    key = key * 31 + (player.isSwimming ? 1 : 0);
    key = key * 31 + (player.parryWindowActive ? 1 : 0);
    key = key * 31 + world.held;
    key = key * 31 + player.hp;
    key = key * 31 + world.generatorsDestroyed;
    key = key * 31 + (world.anyGuardInCombat() ? 1 : 0);
    key = key * 31 + this.computePromptKind();

    if (key !== this.hudKey) {
      this.hudKey = key;
      this.emitHud();
      return;
    }
    this.hudAccum += dtReal;
    if (this.hudAccum >= HUD_INTERVAL) {
      this.hudAccum = 0;
      this.emitHud();
    }
  }

  private phaseCode(): number {
    switch (this.phase) {
      case 'playing':
        return 0;
      case 'paused':
        return 1;
      case 'planet_transition':
        return 2;
      case 'game_over':
        return 3;
      case 'victory':
        return 4;
      default:
        return 5;
    }
  }

  private emitHud(): void {
    const player = this.player;
    const world = this.world;
    if (!player || !world) return;

    // Durante la transición se anuncia el nivel entrante.
    const announceIndex =
      this.phase === 'planet_transition' && this.levelIndex < LEVELS.length - 1
        ? this.levelIndex + 1
        : this.levelIndex;
    const announced = LEVELS[announceIndex];

    let prompt: string | null = null;
    switch (this.computePromptKind()) {
      case 1:
        prompt = '[E] Noquear y robar uniforme';
        break;
      case 2:
        prompt = '[F/Q] ¡PARRY AHORA!';
        break;
      case 3:
        prompt = '[CLIC IZQ.] Mantén pulsado: Campo de Estasis';
        break;
      case 4:
        prompt = '[SHIFT] Subsuelo · [ESPACIO] Cruzar el núcleo';
        break;
      default:
        prompt = null;
    }

    const behavior: PlayerBehaviorVector = {
      ...player.behavior,
      totalTimeSec: this.elapsed,
    };

    this.onHudSnapshot({
      phase: this.phase,
      levelId: announced.id,
      levelTitle: `${announced.title} — ${announced.subtitle}`,
      activeCharacter: player.characterId,
      unlockedCharacters: ['kitsune', 'digger', 'axel'],
      hp: player.hp,
      maxHp: GAME_CONSTANTS.PLAYER_MAX_HP,
      isDisguised: player.isDisguised,
      suspicionRatio: 0,
      globalAlert: world.anyGuardInCombat(),
      isGravityShifting: player.gravityShifting,
      gravityTargetName: player.gravityTarget?.spec.name ?? null,
      stasisHeldCount: world.held,
      isBurrowing: player.isBurrowing,
      isSwimming: player.isSwimming,
      anchorCooldownRatio: player.anchorCooldownRatio,
      parryWindowActive: player.parryWindowActive,
      activePlanetName: player.planet.spec.name,
      objectives: this.objectives.map((o) => ({ ...o })),
      elapsedRunSec: this.elapsed,
      pointerLocked: this.pointerLocked,
      interactionPrompt: prompt,
      adaptation: { ...DEFAULT_ADAPTATION },
      behaviorVector: behavior,
      bossHpRatio: null,
      bossAdaptedTo: null,
    });
  }

  // --------------------------------------------------------------------------
  // Entrada y Pointer Lock
  // --------------------------------------------------------------------------
  private attachListeners(): void {
    window.addEventListener('keydown', this.boundKeyDown);
    window.addEventListener('keyup', this.boundKeyUp);
    window.addEventListener('resize', this.boundResize);
    window.addEventListener('wheel', this.boundWheel, { passive: true });
    document.addEventListener('pointerlockchange', this.boundPointerLockChange);
    document.addEventListener('mousemove', this.boundMouseMove);
    document.addEventListener('mousedown', this.boundMouseDown);
    document.addEventListener('mouseup', this.boundMouseUp);
    this.canvas.addEventListener('click', this.boundClick);
    this.canvas.addEventListener('contextmenu', this.boundContextMenu);
  }

  private detachListeners(): void {
    window.removeEventListener('keydown', this.boundKeyDown);
    window.removeEventListener('keyup', this.boundKeyUp);
    window.removeEventListener('resize', this.boundResize);
    window.removeEventListener('wheel', this.boundWheel);
    document.removeEventListener('pointerlockchange', this.boundPointerLockChange);
    document.removeEventListener('mousemove', this.boundMouseMove);
    document.removeEventListener('mousedown', this.boundMouseDown);
    document.removeEventListener('mouseup', this.boundMouseUp);
    this.canvas.removeEventListener('click', this.boundClick);
    this.canvas.removeEventListener('contextmenu', this.boundContextMenu);
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.repeat) return;
    if (this.phase !== 'playing') return;
    if (e.code === 'Space') e.preventDefault();
    this.player?.handleKey(e.code, true);
  }

  private onKeyUp(e: KeyboardEvent): void {
    if (this.phase !== 'playing') return;
    this.player?.handleKey(e.code, false);
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.pointerLocked || this.phase !== 'playing') return;
    this.player?.handleMouseMove(e.movementX, e.movementY);
  }

  private onMouseDown(e: MouseEvent): void {
    if (!this.pointerLocked || this.phase !== 'playing') return;
    this.player?.handleMouseButton(e.button, true);
  }

  private onMouseUp(e: MouseEvent): void {
    if (this.phase !== 'playing') return;
    this.player?.handleMouseButton(e.button, false);
  }

  /** Zoom con la rueda del ratón entre 5 y 20 unidades. */
  private onWheel(e: WheelEvent): void {
    if (this.phase !== 'playing') return;
    this.baseCamDist = THREE.MathUtils.clamp(
      this.baseCamDist + e.deltaY * 0.01,
      CAMERA_MIN_DIST,
      CAMERA_MAX_DIST
    );
  }

  private requestPointerLock(): void {
    if (this.phase === 'victory' || this.phase === 'game_over') return;
    if (document.pointerLockElement !== this.canvas) {
      try {
        const lock = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
        if (lock && typeof lock.catch === 'function') lock.catch(() => {});
      } catch {
        // Cooldown del navegador tras liberar el lock: se reintenta al siguiente clic.
      }
    }
  }

  private onPointerLockChange(): void {
    this.pointerLocked = document.pointerLockElement === this.canvas;
    if (this.pointerLocked) {
      if (this.phase === 'paused') this.phase = 'playing';
    } else if (this.phase === 'playing') {
      // Escape / pérdida de Pointer Lock => pausa.
      this.phase = 'paused';
      this.timeScale = 1;
      this.player?.clearTransientInput();
    }
    this.emitHud();
  }

  private onResize(): void {
    const width = window.innerWidth;
    const height = Math.max(window.innerHeight, 1);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  // --------------------------------------------------------------------------
  // Limpieza
  // --------------------------------------------------------------------------
  dispose(): void {
    cancelAnimationFrame(this.rafId);
    this.detachListeners();
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.disposeLevel();
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
    this.renderer.dispose();
  }
}
