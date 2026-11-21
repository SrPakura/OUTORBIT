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

// ============================================================================
// Nivel inicial: Prólogo (Luna Tutorial + Satélite Cristal)
// ============================================================================
const PROLOGUE_LEVEL: LevelSpec = {
  id: 'prologue',
  order: 0,
  title: 'PRÓLOGO',
  subtitle: 'Luna Tutorial · Satélite Cristal',
  skyTopColor: '#05010f',
  skyBottomColor: '#6d28d9',
  planets: [
    {
      id: 'luna-tutorial',
      name: 'Luna Tutorial',
      biome: 'tutorial',
      center: [0, 0, 0],
      radius: 60,
      gravityStrength: 1.0,
      surfaceColor: '#cbd5e1',
      patchColor: '#94a3b8',
      atmosphereColor: '#93c5fd',
      hasIcePatches: true,
    },
    {
      id: 'satelite-cristal',
      name: 'Satélite Cristal',
      biome: 'tutorial',
      center: [235, 60, -120],
      radius: 26,
      gravityStrength: 1.35,
      surfaceColor: '#7dd3fc',
      patchColor: '#a78bfa',
      atmosphereColor: '#c4b5fd',
      hasOrbitalRings: true,
      ringColor: '#c4b5fd',
    },
  ],
  waterBubbles: [],
  objects: [],
  enemies: [],
  spawnPlanetId: 'luna-tutorial',
  spawnDir: [0.25, 0.85, 0.45],
  portalPlanetId: 'satelite-cristal',
  portalDir: [0.35, 0.9, 0.25],
  objectiveSummary: 'Domina la gravedad esférica y usa GRAVITY SHIFT para alcanzar el portal.',
};

const PROLOGUE_OBJECTIVES: LevelObjective[] = [
  {
    id: 'explore',
    description: 'Muévete con WASD y salta con ESPACIO',
    completed: false,
    currentCount: 0,
    targetCount: 1,
  },
  {
    id: 'gravity-shift',
    description: 'GRAVITY SHIFT (Clic Derecho): salta hasta el Satélite Cristal',
    completed: false,
    currentCount: 0,
    targetCount: 1,
  },
  {
    id: 'portal',
    description: 'Alcanza el portal orbital',
    completed: false,
    currentCount: 0,
    targetCount: 1,
  },
];

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

const EMPTY_BEHAVIOR: PlayerBehaviorVector = {
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

const HUD_INTERVAL = 1 / 15;
const CAMERA_DISTANCE = 8.5;
const CAMERA_DISTANCE_SHIFT = 5.2;
const CAMERA_FOV = 70;
const CAMERA_FOV_SHIFT = 52;
const PORTAL_TRIGGER_RADIUS = 6;

/**
 * Orquestador Three.js del Hito 1: monta el nivel prólogo, ejecuta el loop
 * principal, gestiona Pointer Lock / pausa y emite HudSnapshot al callback
 * suscrito (máximo ~15 Hz, o inmediato ante cambios discretos) para que React
 * no se re-renderice a la frecuencia del render.
 */
export class GameEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly onHudSnapshot: (snapshot: HudSnapshot) => void;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly player: PlayerController;
  private readonly planets: PlanetRuntime[] = [];
  private readonly planetTicks: Array<(dt: number) => void> = [];
  private readonly backdrop: { update: (dt: number) => void; dispose: () => void };
  private readonly portalPos = new THREE.Vector3();
  private readonly objectives: LevelObjective[] = PROLOGUE_OBJECTIVES.map((o) => ({ ...o }));

  private rafId = 0;
  private lastTime = 0;
  private elapsed = 0;
  private timeScale = 1;
  private camDist = CAMERA_DISTANCE;
  private phase: HudSnapshot['phase'] = 'playing';
  private pointerLocked = false;
  private hudAccum = 0;
  private hudKey = '';

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
  private readonly boundClick = () => this.requestPointerLock();
  private readonly boundContextMenu = (e: Event) => e.preventDefault();
  private readonly boundPointerLockChange = () => this.onPointerLockChange();
  private readonly boundResize = () => this.onResize();

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

    this.scene.background = new THREE.Color(PROLOGUE_LEVEL.skyTopColor);
    this.backdrop = createSpaceBackdrop(
      this.scene,
      PROLOGUE_LEVEL.skyTopColor,
      PROLOGUE_LEVEL.skyBottomColor
    );

    this.setupLights();
    this.buildLevel();

    this.player = new PlayerController(
      this.planets,
      this.camera,
      PROLOGUE_LEVEL.spawnPlanetId,
      new THREE.Vector3(...PROLOGUE_LEVEL.spawnDir)
    );
    this.scene.add(this.player.root);

    this.attachListeners();
    this.emitHud();
  }

  // --------------------------------------------------------------------------
  // Construcción del nivel
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

  private buildLevel(): void {
    for (const spec of PROLOGUE_LEVEL.planets) {
      const { group, animTick } = buildPlanetModel(spec);
      this.scene.add(group);
      this.planets.push({ spec, mesh: group, centerVec: new THREE.Vector3(...spec.center) });
      this.planetTicks.push(animTick);
    }

    // Portal de victoria sobre el planeta destino.
    const portalPlanet = this.planets.find(
      (p) => p.spec.id === PROLOGUE_LEVEL.portalPlanetId
    );
    if (portalPlanet) {
      const portal = buildWarpPortal();
      const portalDir = new THREE.Vector3(...PROLOGUE_LEVEL.portalDir);
      orientObjectOnSphere(
        portal.group,
        portalPlanet.centerVec,
        portalDir,
        portalPlanet.spec.radius + 2.2
      );
      this.portalPos.copy(portal.group.position);
      this.scene.add(portal.group);
      this.planetTicks.push(portal.animTick);
    }
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
      // Cámara lenta durante Gravity Shift.
      const targetScale = this.player.gravityShifting
        ? GAME_CONSTANTS.GRAVITY_SHIFT_TIME_SCALE
        : 1;
      this.timeScale += (targetScale - this.timeScale) * Math.min(1, dtReal * 10);
      const dtSim = dtReal * this.timeScale;

      this.player.update(dtSim);
      for (const animTick of this.planetTicks) animTick(dtSim);
      this.backdrop.update(dtSim);
      this.elapsed += dtSim;

      this.updateObjectives();
      this.checkVictory();
    }

    this.updateCamera(dtReal);
    this.renderer.render(this.scene, this.camera);
    this.updateHudEmission(dtReal);
  };

  private updateCamera(dtReal: number): void {
    const player = this.player;
    player.getCameraOrientation(this._camQuat);
    this.camera.quaternion.copy(this._camQuat);
    this._camDir.set(0, 0, -1).applyQuaternion(this._camQuat);
    player.getHeadPosition(this._camPos);

    // Zoom suave al mantener clic derecho (Gravity Shift).
    const targetDist = player.gravityShifting ? CAMERA_DISTANCE_SHIFT : CAMERA_DISTANCE;
    this.camDist += (targetDist - this.camDist) * Math.min(1, dtReal * 6);
    this.camera.position.copy(this._camPos).addScaledVector(this._camDir, -this.camDist);

    // No atravesar la superficie del planeta actual.
    const planet = player.planet;
    this._v1.copy(this.camera.position).sub(planet.centerVec);
    const camDistToCenter = this._v1.length();
    const minDist = planet.spec.radius + 0.9;
    if (camDistToCenter < minDist && camDistToCenter > 1e-6) {
      this.camera.position
        .copy(planet.centerVec)
        .addScaledVector(this._v1.divideScalar(camDistToCenter), minDist);
    }

    const targetFov = player.gravityShifting ? CAMERA_FOV_SHIFT : CAMERA_FOV;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dtReal * 6);
      this.camera.updateProjectionMatrix();
    }
  }

  private updateObjectives(): void {
    const explore = this.objectives[0];
    if (!explore.completed && this.player.walkDistance >= 15) {
      explore.currentCount = 1;
      explore.completed = true;
    }
    const shift = this.objectives[1];
    const arrived = this.player.planet.spec.id === PROLOGUE_LEVEL.portalPlanetId;
    if (!shift.completed && arrived) {
      shift.currentCount = 1;
      shift.completed = true;
    }
  }

  private checkVictory(): void {
    if (this.phase !== 'playing') return;
    if (this.player.planet.spec.id !== PROLOGUE_LEVEL.portalPlanetId) return;
    if (this.player.position.distanceTo(this.portalPos) > PORTAL_TRIGGER_RADIUS) return;

    this.phase = 'victory';
    const portalObjective = this.objectives[2];
    portalObjective.currentCount = 1;
    portalObjective.completed = true;
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.emitHud();
  }

  // --------------------------------------------------------------------------
  // HUD: emisión limitada (~15 Hz) + inmediata en cambios discretos
  // --------------------------------------------------------------------------
  private updateHudEmission(dtReal: number): void {
    const targetName = this.player.gravityTarget?.spec.name ?? '';
    const key = [
      this.phase,
      this.player.characterId,
      this.player.planet.spec.name,
      targetName,
      this.player.gravityShifting ? 1 : 0,
      this.pointerLocked ? 1 : 0,
      this.objectives.filter((o) => o.completed).length,
    ].join('|');

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

  private emitHud(): void {
    this.onHudSnapshot({
      phase: this.phase,
      levelId: PROLOGUE_LEVEL.id,
      levelTitle: `${PROLOGUE_LEVEL.title} — ${PROLOGUE_LEVEL.subtitle}`,
      activeCharacter: this.player.characterId,
      unlockedCharacters: ['kitsune', 'digger', 'axel'],
      hp: this.player.hp,
      maxHp: GAME_CONSTANTS.PLAYER_MAX_HP,
      isDisguised: false,
      suspicionRatio: 0,
      globalAlert: false,
      isGravityShifting: this.player.gravityShifting,
      gravityTargetName: this.player.gravityTarget?.spec.name ?? null,
      stasisHeldCount: 0,
      isBurrowing: false,
      isSwimming: false,
      anchorCooldownRatio: 0,
      parryWindowActive: false,
      activePlanetName: this.player.planet.spec.name,
      objectives: this.objectives.map((o) => ({ ...o })),
      elapsedRunSec: this.elapsed,
      pointerLocked: this.pointerLocked,
      interactionPrompt: null,
      adaptation: { ...DEFAULT_ADAPTATION },
      behaviorVector: { ...EMPTY_BEHAVIOR, totalTimeSec: this.elapsed },
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
    this.player.handleKey(e.code, true);
  }

  private onKeyUp(e: KeyboardEvent): void {
    if (this.phase !== 'playing') return;
    this.player.handleKey(e.code, false);
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.pointerLocked || this.phase !== 'playing') return;
    this.player.handleMouseMove(e.movementX, e.movementY);
  }

  private onMouseDown(e: MouseEvent): void {
    if (!this.pointerLocked || this.phase !== 'playing') return;
    this.player.handleMouseButton(e.button, true);
  }

  private onMouseUp(e: MouseEvent): void {
    if (this.phase !== 'playing') return;
    this.player.handleMouseButton(e.button, false);
  }

  private requestPointerLock(): void {
    if (this.phase === 'victory') return;
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
      this.player.clearTransientInput();
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
    this.player.dispose();
    this.backdrop.dispose();
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
