import * as THREE from 'three';
import {
  GAME_CONSTANTS,
  type GalaxySpec,
  type HudSnapshot,
  type LevelId,
  type LevelObjective,
  type ObjectiveMarker,
  type PlanetAdaptationConfig,
  type PlanetRuntime,
  type PlanetSpec,
  type PlayerBehaviorVector,
  type RadioToast,
} from './types';
import { createSpaceBackdrop, setHalftonesEnabled } from './render/toonMaterials';
import { buildPlanetModel } from './render/proceduralModels';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { PlayerController } from './entities/PlayerController';
import { WorldObjectsManager, type WorldPlayerState } from './entities/WorldObjects';
import { TUTORIAL_SPECS, getTutorialSpec, type TutorialId, type TutorialSpec } from './levels/tutorialDefinitions';
import { SandboxManager } from './sandbox/SandboxManager';
import { initPlanetTerrain, isInLowBasin } from './math/terrain';
import { BehaviorTracker, createEmptyBehaviorVector } from './ai/BehaviorTracker';
import { computePlanetAdaptation } from './ai/AdaptationDirector';
import { SynthAudio } from './audio/SynthAudio';
import { loadGameSettings, CONTROL_ACTIONS, type GameSettings } from './settings';

// ============================================================================
// Constantes de cámara y HUD de la galaxia continua
// ============================================================================
const HUD_INTERVAL = 1 / 15;
const CAMERA_BASE_DIST = 10.5;
const CAMERA_MIN_DIST = 5;
const CAMERA_MAX_DIST = 26;
const CAMERA_DISTANCE_SHIFT = 5.2;
const CAMERA_DISTANCE_CORE_DIVE_FACTOR = 2.2; // zoom-out a radio * 2.2
const CAMERA_FOV_DEFAULT = 70; // FOV base de fábrica (ajustable en Controles)
const CAMERA_FOV_SHIFT_OFFSET = -18; // cámara lenta: base - 18
const CAMERA_FOV_SHIFT_MIN = 40; // suelo del FOV en cámara lenta
const CAMERA_FOV_FLIGHT_BOOST = 18; // base -> base + 18 en mitad del cruce
const CAMERA_FOV_SPRINT_BOOST = 12; // base -> base + 12 al esprintar
const CAMERA_FOV_DASH_BOOST = 18; // base -> base + 18 en dash estilo Jett
const CAMERA_FOV_FLIGHT_FREE_MAX_OFFSET = 20; // base -> base + 20 volando rápido
const CAMERA_FOV_HIT_PUNCH = 6; // HITO 3: FOV punch breve al recibir daño
const CAMERA_FLIGHT_ROLL = 0.12; // giro orbital suave de cámara en vuelo
const RADIO_TOAST_DURATION = 6; // banner táctico de radio (no bloqueante)
const MARKER_SCREEN_CLAMP = 0.88; // borde de pantalla para marcadores fuera/detrás

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

/** Libera la geometría de un subárbol (los materiales compartidos no se tocan). */
function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) mesh.geometry?.dispose();
  });
}

/**
 * Orquestador Three.js de la GALAXIA CONTINUA: monta los 5 planetas a la vez
 * en una sola escena, ejecuta el loop principal, gestiona Pointer Lock /
 * pausa, detecta el planeta activo del jugador, proyecta los marcadores de
 * objetivo al HUD y emite HudSnapshot al callback suscrito (máximo ~15 Hz, o
 * inmediato ante cambios discretos) para que React no se re-renderice por frame.
 */
export class GameEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly onHudSnapshot: (snapshot: HudSnapshot) => void;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly planets: PlanetRuntime[] = [];
  private readonly planetTicks: Array<(dt: number) => void> = [];
  private backdrop: { update: (dt: number, cameraPos: THREE.Vector3) => void; dispose: () => void } | null = null;

  // Estado de la galaxia (única carga, sin transiciones de nivel).
  private levelGroup: THREE.Group | null = null;
  private world: WorldObjectsManager | null = null;
  private sandbox: SandboxManager | null = null;
  private player: PlayerController | null = null;
  private objectives: LevelObjective[] = [];
  /** Clave discreta del estado de objetivos (evita allocations por frame). */
  private objectivesKey = -1;

  // PASO B — Tutorial activo (null: campaña principal de 5 planetas).
  /** Galaxia cargada: GALAXY_SPEC o la GalaxySpec del tutorial activo. */
  private readonly activeGalaxySpec: GalaxySpec;
  /** Spec del tutorial en curso (null en campaña). */
  private readonly tutorialSpec: TutorialSpec | null;
  /** El tutorial ya cumplió su meta (tarjeta de victoria, sin Battle Report). */
  private tutorialCompleted = false;

  private rafId = 0;
  private lastTime = 0;
  private elapsed = 0;
  private timeScale = 1;
  private camDist = CAMERA_BASE_DIST;
  private baseCamDist = CAMERA_BASE_DIST;
  /** Ajustes persistentes (Controles): se leen al entrar a la partida. */
  private settings: GameSettings = loadGameSettings();
  /** FOV base efectivo: todos los boosts de cámara son offsets sobre él. */
  private baseFov = CAMERA_FOV_DEFAULT;
  private phase: HudSnapshot['phase'] = 'playing';
  private pointerLocked = false;
  private hudAccum = 0;
  private hudKey = 0;
  /** Intensidad suavizada 0..1 de las líneas de velocidad del HUD. */
  private speedLines = 0;
  /** Reloj del jitter del golpe de cámara (frecuencias incommensurables). */
  private camShakeClock = 0;
  /** Motivo específico de la derrota (deriva espacial, etc.). */
  private gameOverReason: string | null = null;

  // IA inter-planeta: acumulado de la run + última adaptación inyectada.
  private readonly behaviorTracker = new BehaviorTracker();
  private adaptation: PlanetAdaptationConfig = DEFAULT_ADAPTATION;

  // Banner táctico de radio (no bloqueante) al caer un escudo planetario.
  private radioToast: RadioToast | null = null;
  private radioToastT = 0;

  // Vector combinado de la run (acumulado + planeta actual), preasignado y
  // actualizado cada frame: es la fuente de entrada de la red MLP de KRONOS.
  private readonly kronosBehavior: PlayerBehaviorVector = {
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

  // Audio procedural Web Audio API (Hito 4): desbloqueo al primer gesto.
  private readonly audio = new SynthAudio();

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
    sprinting: false,
    airborne: false,
    flightTargetPlanetId: null,
    characterId: 'kitsune',
    holdingContraband: false,
    hostileRecent: false,
  };

  // Temporales preasignados (sin GC en el loop)
  private readonly _camQuat = new THREE.Quaternion();
  private readonly _rollQuat = new THREE.Quaternion();
  private readonly _camDir = new THREE.Vector3();
  private readonly _camPos = new THREE.Vector3();
  private readonly _v1 = new THREE.Vector3();
  private readonly _v2 = new THREE.Vector3();

  private readonly boundKeyDown = (e: KeyboardEvent) => this.onKeyDown(e);
  private readonly boundKeyUp = (e: KeyboardEvent) => this.onKeyUp(e);
  private readonly boundMouseMove = (e: MouseEvent) => this.onMouseMove(e);
  private readonly boundMouseDown = (e: MouseEvent) => this.onMouseDown(e);
  private readonly boundMouseUp = (e: MouseEvent) => this.onMouseUp(e);
  private readonly boundWheel = (e: WheelEvent) => this.onWheel(e);
  private readonly boundClick = () => {
    this.audio.unlock();
    this.requestPointerLock();
  };
  private readonly boundContextMenu = (e: Event) => e.preventDefault();
  private readonly boundPointerLockChange = () => this.onPointerLockChange();
  private readonly boundResize = () => this.onResize();
  /**
   * Listener único de pointerdown en window: desbloquea el audio si el
   * contexto aún no existe (gesto del usuario fuera del canvas) y se retira
   * solo en cuanto el SynthAudio tiene contexto.
   */
  private readonly boundPointerDownUnlock = () => {
    this.audio.unlock();
    if (!this.audio.needsUnlock) {
      window.removeEventListener('pointerdown', this.boundPointerDownUnlock);
    }
  };
  /**
   * Hito 3 — Funil único de daño del mundo: reenvía los 9 parámetros
   * (impulso + atribución completa) al jugador y, cuando el golpe APLICA
   * de verdad, dispara el anillo de impacto carmesí en escena. El golpe de
   * cámara (shake + FOV punch) lo activa el propio PlayerController.
   */
  private readonly boundPlayerDamage = (
    amount: number,
    px: number,
    py: number,
    pz: number,
    attacker?: string,
    reason?: string,
    sx?: number,
    sy?: number,
    sz?: number
  ) => {
    const player = this.player;
    if (!player) return;
    const applied = player.takeDamage(amount, px, py, pz, attacker, reason, sx, sy, sz);
    if (applied) {
      this.world?.spawnDamageRing(player.position, player.up);
    }
  };

  constructor(
    canvas: HTMLCanvasElement,
    onHudSnapshot: (snapshot: HudSnapshot) => void,
    launchConfig?: { tutorialId?: TutorialId | null }
  ) {
    this.canvas = canvas;
    this.onHudSnapshot = onHudSnapshot;

    // PASO B: un tutorial carga SU galaxia mínima; sin tutorial (no debería
    // ocurrir en el flujo actual) se arranca el primer tutorial como reserva.
    const tutorialId = launchConfig?.tutorialId ?? null;
    this.tutorialSpec = tutorialId
      ? getTutorialSpec(tutorialId)
      : TUTORIAL_SPECS[0];
    this.activeGalaxySpec = this.tutorialSpec.galaxy;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);

    this.camera = new THREE.PerspectiveCamera(
      this.settings.baseFov,
      window.innerWidth / Math.max(window.innerHeight, 1),
      0.1,
      4000
    );

    this.setupLights();
    this.loadGalaxy();
    // Ajustes persistentes: FOV, sensibilidad, eje Y, keybindings, volumen y
    // halftones se aplican en cuanto el jugador y el mundo existen.
    this.applySettings(this.settings);
    this.attachListeners();
    this.emitHud();
  }

  /**
   * Aplica (y recuerda) los ajustes de Controles: FOV base, sensibilidad del
   * ratón, eje Y invertido, keybindings, volumen del sintetizador y trama
   * halftone. Lo llama el constructor al entrar a la partida y el menú de
   * Controles al guardar.
   */
  applySettings(settings: GameSettings): void {
    this.settings = { ...settings, bindings: { ...settings.bindings } };
    this.baseFov = THREE.MathUtils.clamp(settings.baseFov, 55, 85);
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
    this.player?.applySettings(this.settings);
    this.audio.setVolumeMultiplier(settings.masterVolume);
    setHalftonesEnabled(settings.halftonesEnabled);
    this.emitHud();
  }

  // --------------------------------------------------------------------------
  // Construcción de la galaxia continua (única carga: los 5 planetas a la vez)
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
      this.scene.remove(this.player.lockRing);
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
    this.sandbox?.dispose();
    this.sandbox = null;
    this.world?.clear();
    this.world = null;
    this.planets.length = 0;
    this.planetTicks.length = 0;
  }

  /**
   * Carga única de la galaxia activa (GALAXY_SPEC en campaña, la GalaxySpec
   * mínima del tutorial en modo tutorial): los planetas coexisten en la misma
   * escena con sus escudos, bases, guarniciones y el Comandante KRONOS. No hay
   * pantallas de carga ni transiciones: los escudos caen en vivo.
   */
  private loadGalaxy(): void {
    this.disposeLevel();
    const galaxy = this.activeGalaxySpec;

    // HITO 2 — Terreno esférico determinista: se inicializa ANTES de
    // construir los modelos de planeta y de instanciar estructuras, props,
    // objetos, enemigos y NPCs (todo el mundo se apoya en él).
    initPlanetTerrain(galaxy);

    this.scene.background = new THREE.Color(galaxy.skyTopColor);
    this.backdrop = createSpaceBackdrop(
      this.scene,
      galaxy.skyTopColor,
      galaxy.skyBottomColor
    );

    this.levelGroup = new THREE.Group();
    this.levelGroup.name = 'galaxy';
    this.scene.add(this.levelGroup);

    const effectiveGalaxy = galaxy;
    this.camera.near = 0.1;
    this.camera.far = 4000;
    this.camera.updateProjectionMatrix();
    for (const spec of galaxy.planets) {
      const { group, animTick } = buildPlanetModel(spec);
      this.levelGroup.add(group);
      this.planets.push({
        spec,
        mesh: group,
        centerVec: new THREE.Vector3(...spec.center),
        shielded: false,
      });
      this.planetTicks.push(animTick);
    }

    // Toda la galaxia en una sola escena: estructuras con colisión/LoS,
    // escudos, balizas, objetos, burbujas, hierba y guarniciones.
    this.world = new WorldObjectsManager(this.levelGroup, this.planets);
    this.world.buildGalaxy(effectiveGalaxy, this.planets);

    this.player = new PlayerController(
      this.planets,
      this.camera,
      this.world,
      galaxy.spawnPlanetId,
      new THREE.Vector3(...galaxy.spawnDir)
    );
    // PASO B: el tutorial arranca con su personaje recomendado ya equipado.
    if (this.tutorialSpec) this.player.setCharacter(this.tutorialSpec.recommendedCharacter);
    const hasSandboxContent =
      (galaxy.collectibles?.length ?? 0) > 0 ||
      (galaxy.anchorNodes?.length ?? 0) > 0 ||
      (galaxy.challenges?.length ?? 0) > 0;
    if (galaxy.isSandbox && hasSandboxContent) {
      this.sandbox = new SandboxManager(this.levelGroup, this.planets, galaxy);
      this.player.setSandboxHooks({
        enabled: true,
        getAnchorTarget: (outPos) => this.sandbox?.getBestAnchorTarget(outPos) ?? false,
        onInteract: (pos) =>
          this.sandbox?.tryStartNearestChallenge(pos, (k) => this.audio.play(k)) ?? false,
      });
      this.world.onSandboxTargetHit = (pos, radius) =>
        (this.sandbox?.hitTargetsNear(pos, radius, (k) => this.audio.play(k)) ?? 0) > 0;
    } else {
      this.player.setSandboxHooks({ enabled: false });
    }
    this.scene.add(this.player.root);
    this.scene.add(this.player.lockRing);

    // Cableado de los eventos del mundo hacia el jugador / la ficha de la IA.
    this.world.onGlobalAlert = () => {
      if (this.player) this.player.behavior.alarmsTriggered++;
    };
    this.world.onDisguiseBroken = () => {
      this.player?.forceBreakDisguise();
    };
    this.world.onTeleportPlayer = (x, y, z) => {
      this.player?.teleportTo(x, y, z);
    };
    this.world.onSound = (kind) => this.audio.play(kind);
    this.world.onKronosDefeated = () => this.onKronosDefeated();
    // Oleada 2: un escudo cayó en vivo -> la Red de IA adapta ese planeta.
    this.world.onPlanetUnlocked = (nextPlanet) => this.onPlanetUnlocked(nextPlanet);
    // FASE B: la alarma selló compuertas (LOCKDOWN) -> aviso por radio
    // mientras el jugador busca una ruta alternativa (no bloqueante).
    this.world.onGateLockdown = () => {
      this.radioToast = {
        title: 'LOCKDOWN DE COMPUERTAS ACTIVO',
        lines: [
          'La alarma ha sellado las compuertas de la base.',
          'Ruta alternativa: pared rompible, subsuelo de Digger, tejado o palanca.',
        ],
        accent: '#f87171',
      };
      this.radioToastT = RADIO_TOAST_DURATION;
      this.emitHud();
    };
    this.world.setKronosBehaviorSource(this.kronosBehavior);
    this.player.onSound = (kind) => this.audio.play(kind);

    this.objectives = this.buildObjectives(galaxy.spawnPlanetId);
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

  /** Botón rápido del HUD: alterna el mute del audio procedural. */
  toggleMute(): void {
    this.audio.unlock();
    this.audio.toggleMute();
    this.emitHud();
  }

  /**
   * Desbloquea el AudioContext procedural (seguro llamar en cualquier
   * momento; el App lo invoca al montar tras pulsar JUGAR).
   */
  unlockAudio(): void {
    this.audio.unlock();
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
        if (this.sandbox) {
          player.getAimForward(this._v1);
          const anchorRange = GAME_CONSTANTS.CHARACTERS[player.characterId].anchorRange;
          this.sandbox.update(dtSim, player.position, this._v1, anchorRange, (k) =>
            this.audio.play(k)
          );
        }
        this.elapsed += dtSim;
      }

      for (const animTick of this.planetTicks) animTick(dtReal);
      this.backdrop?.update(dtReal, this.camera.position);

      // Banner táctico de radio: caduca a los 6s (no bloquea la partida).
      if (this.radioToastT > 0) {
        this.radioToastT -= dtReal;
        if (this.radioToastT <= 0) this.radioToast = null;
      }

      this.checkTutorialCompletion();
      this.checkGameOver();
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
    // HITO 2: cuenca/cráter profundo del terreno = cobertura extra (x0.85).
    this.worldState.stealthMul =
      player.stealthMultiplier *
      (isInLowBasin(player.planet.spec.id, player.up) ? 0.85 : 1);
    this.worldState.sprinting = player.isSprinting;
    this.worldState.airborne = player.isAirborne;
    this.worldState.flightTargetPlanetId = player.flightTargetPlanetId;
    this.worldState.characterId = player.characterId;
    this.worldState.inGrass = world.checkPlayerInGrass(player.position, player.planet);
    // HITO 1: contexto de infracción — contrabando de Estasis y acción
    // hostil reciente (el mundo lleva el temporizador de 3.5s).
    this.worldState.holdingContraband = world.held > 0;
    this.worldState.hostileRecent = world.playerHostileRecent;

    // Vector combinado de la run (acumulado + planeta actual) sin allocations:
    // la red MLP de KRONOS lo lee para predecir su postura en tiempo real.
    const combined = this.behaviorTracker.getAccumulatedInto(this.kronosBehavior);
    const level = player.behavior;
    combined.stealthKnockouts += level.stealthKnockouts;
    combined.disguiseTimeSec += level.disguiseTimeSec;
    combined.alarmsTriggered += level.alarmsTriggered;
    combined.bruteKills += level.bruteKills;
    combined.aerialAttacks += level.aerialAttacks;
    combined.burrowDistance += level.burrowDistance;
    combined.burrowTimeSec += level.burrowTimeSec;
    combined.stasisThrows += level.stasisThrows;
    combined.parriesLanded += level.parriesLanded;
    combined.damageTaken += level.damageTaken;
  }

  private updateCamera(dtReal: number): void {
    const player = this.player;
    if (!player) return;
    player.getCameraOrientation(this._camQuat);
    this.camera.quaternion.copy(this._camQuat);
    this._camDir.set(0, 0, -1).applyQuaternion(this._camQuat);
    player.getHeadPosition(this._camPos);

    // Zoom: rueda del ratón (5-26, libre) + acercamiento en Gravity Shift.
    // Cruce del núcleo: zoom-out automático a radio * 2.2 para ver el
    // planeta completo desde fuera (edificios/obstáculos incluidos).
    const targetDist = player.gravityShifting
      ? CAMERA_DISTANCE_SHIFT
      : player.coreDiving
        ? player.planet.spec.radius * CAMERA_DISTANCE_CORE_DIVE_FACTOR
        : this.baseCamDist;
    this.camDist += (targetDist - this.camDist) * Math.min(1, dtReal * 6);
    this.camera.position.copy(this._camPos).addScaledVector(this._camDir, -this.camDist);

    // Anti-clipping contra TODOS los planetas del nivel.
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

    // HITO 3 — Golpe de cámara al recibir daño: offset ortogonal pequeño
    // (right/up de cámara) con jitter pseudo-aleatorio de intensidad
    // decaying durante 0.3s (consumeCameraShake del PlayerController).
    const hitShake = player.consumeCameraShake();
    if (hitShake > 0.001) {
      this.camShakeClock += dtReal;
      const amp = 0.5 * hitShake * hitShake;
      const a = this.camShakeClock * 47;
      this._v1.set(1, 0, 0).applyQuaternion(this._camQuat); // right de cámara
      this._v2.copy(this._v1).cross(this._camDir); // up = right x forward
      this.camera.position
        .addScaledVector(this._v1, Math.sin(a * 1.13) * amp)
        .addScaledVector(this._v2, Math.cos(a * 0.87) * amp * 0.8);
    }

    // FOV dinámico: cámara lenta en Gravity Shift; boost suave al esprintar,
    // hacer Dash, volar rápido (dirigido o libre) o caer en picado. Todos los
    // offsets son relativos al FOV base del ajuste `baseFov`.
    let targetFov = this.baseFov;
    if (player.gravityShifting) {
      targetFov = Math.max(CAMERA_FOV_SHIFT_MIN, this.baseFov + CAMERA_FOV_SHIFT_OFFSET);
    } else if (player.isDirectedFlight) {
      targetFov =
        this.baseFov + CAMERA_FOV_FLIGHT_BOOST * Math.sin(Math.PI * player.flightProgress);
    } else {
      let boost = 0;
      if (player.isSprinting) {
        boost = Math.max(boost, CAMERA_FOV_SPRINT_BOOST);
      }
      if (player.isDashing) {
        boost = Math.max(boost, CAMERA_FOV_DASH_BOOST);
      }
      const flightSpeed = player.freeFlightSpeed;
      if (flightSpeed > 14) {
        boost = Math.max(
          boost,
          THREE.MathUtils.clamp((flightSpeed - 14) / 20, 0, 1) * CAMERA_FOV_FLIGHT_FREE_MAX_OFFSET
        );
      }
      const fall = player.fallSpeed;
      if (fall > 18) {
        boost = Math.max(boost, THREE.MathUtils.clamp((fall - 18) / 14, 0, 1) * 14);
      }
      targetFov = this.baseFov + boost;
    }
    // HITO 3: FOV punch breve (ensanchamiento) mientras dura el golpe de
    // cámara tras recibir daño — se lee como desorientación del impacto.
    targetFov += hitShake * CAMERA_FOV_HIT_PUNCH;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dtReal * 6);
      this.camera.updateProjectionMatrix();
    }

    // Líneas de velocidad estilo cómic: intensidad suavizada 0..1 escalando
    // con el FOV extra (sprint/dash/vuelo rápido/picado).
    const speedTarget = THREE.MathUtils.clamp((targetFov - this.baseFov) / 18, 0, 1);
    this.speedLines += (speedTarget - this.speedLines) * Math.min(1, dtReal * 5);

    // Giro orbital suave de cámara durante el vuelo entre planetas.
    if (player.isDirectedFlight) {
      const roll = Math.sin(Math.PI * player.flightProgress) * CAMERA_FLIGHT_ROLL;
      this._rollQuat.setFromAxisAngle(this._camDir, roll);
      this.camera.quaternion.multiply(this._rollQuat);
    }
  }

  // --------------------------------------------------------------------------
  // Objetivos dinámicos del planeta activo, victoria y derrota
  // --------------------------------------------------------------------------
  /**
   * Objetivos dinámicos del planeta activo, deducidos de los contadores
   * reales del mundo: Luna 1 generador, Verdant/Cryo 3 generadores,
   * Bastion 1 tarjeta + 3 generadores, Kronos derrotar al Comandante.
   *
   * PASO B: en modo tutorial los objetivos son la meta de la lección
   * (generadores de entrenamiento o aterrizaje en el planeta destino).
   */
  private buildObjectives(planetId: string): LevelObjective[] {
    const world = this.world;
    if (!world) return [];
    const tutorial = this.tutorialSpec;
    if (tutorial) return this.buildTutorialObjectives(tutorial);
    if (this.activeGalaxySpec.isSandbox && this.sandbox) {
      const s = this.sandbox.getHudState();
      return [
        {
          id: 'sandbox-coins',
          description: 'Monedas cósmicas',
          completed: s.coinsTotal > 0 && s.coins >= s.coinsTotal,
          currentCount: s.coins,
          targetCount: s.coinsTotal,
        },
        {
          id: 'sandbox-orbs',
          description: 'Orbes Estrella ocultos en la ciudad',
          completed: s.orbsTotal > 0 && s.orbs >= s.orbsTotal,
          currentCount: s.orbs,
          targetCount: s.orbsTotal,
        },
        {
          id: 'sandbox-challenges',
          description: 'Retos urbanos (carreras y Estasis)',
          completed: s.challengesTotal > 0 && s.challengesCompleted >= s.challengesTotal,
          currentCount: s.challengesCompleted,
          targetCount: s.challengesTotal,
        },
      ];
    }
    if (planetId === 'kronos-trono') {
      const defeated = world.kronosDefeated ? 1 : 0;
      return [
        {
          id: 'kronos',
          description: 'Derrota al Comandante KRONOS',
          completed: defeated >= 1,
          currentCount: defeated,
          targetCount: 1,
        },
      ];
    }
    const genTotal = world.getGeneratorTotalOn(planetId);
    const genDestroyed = Math.min(world.getGeneratorsDestroyedOn(planetId), genTotal);
    const cardTotal = world.getKeycardTotalOn(planetId);
    const cardCollected = Math.min(world.getKeycardsCollectedOn(planetId), cardTotal);
    const out: LevelObjective[] = [];
    if (cardTotal > 0) {
      out.push({
        id: 'keycard',
        description: 'Roba la Tarjeta Maestra (habilita el asalto final)',
        completed: cardCollected >= cardTotal,
        currentCount: cardCollected,
        targetCount: cardTotal,
      });
    }
    if (genTotal > 0) {
      out.push({
        id: 'generators',
        description:
          genTotal === 1
            ? 'Destruye el generador de escudo'
            : `Destruye los ${genTotal} generadores de escudo`,
        completed: genDestroyed >= genTotal,
        currentCount: genDestroyed,
        targetCount: genTotal,
      });
    }
    if (out.length === 0) {
      out.push({
        id: 'explore',
        description: 'Explora y viaja con Gravity Shift (Clic Derecho)',
        completed: false,
        currentCount: 0,
        targetCount: 1,
      });
    }
    return out;
  }

  /**
   * PASO B — Objetivos del tutorial activo: una sola meta cristalina, con el
   * contador real del mundo (generadores de entrenamiento destruidos o
   * aterrizaje en el planeta destino).
   */
  private buildTutorialObjectives(tutorial: TutorialSpec): LevelObjective[] {
    const world = this.world;
    if (!world) return [];
    if (tutorial.goalMode === 'reach_target_planet') {
      const targetId = tutorial.targetPlanetId;
      const total = targetId ? world.getGeneratorTotalOn(targetId) : 0;
      const destroyed = targetId
        ? Math.min(world.getGeneratorsDestroyedOn(targetId), total)
        : 0;
      const landed = this.tutorialCompleted ? 1 : 0;
      return [
        {
          id: 'tutorial-reach',
          description: 'Aterriza en el planeta destino con Gravity Shift (Clic Der.)',
          completed: landed >= 1,
          currentCount: landed,
          targetCount: 1,
        },
        ...(total > 0
          ? [
              {
                id: 'tutorial-beacon',
                description: 'O destruye el generador-baliza del destino',
                completed: destroyed >= total,
                currentCount: destroyed,
                targetCount: total,
              },
            ]
          : []),
      ];
    }
    const total = this.tutorialGeneratorTotal();
    const destroyed = Math.min(this.tutorialGeneratorsDestroyed(), total);
    return [
      {
        id: 'tutorial-generators',
        description:
          total === 1
            ? 'Destruye el generador de entrenamiento'
            : 'Destruye los generadores de entrenamiento',
        completed: total > 0 && destroyed >= total,
        currentCount: destroyed,
        targetCount: total,
      },
    ];
  }

  /** Generadores de entrenamiento totales de la galaxia del tutorial. */
  private tutorialGeneratorTotal(): number {
    const world = this.world;
    if (!world) return 0;
    let total = 0;
    for (const planet of this.activeGalaxySpec.planets) {
      total += world.getGeneratorTotalOn(planet.id);
    }
    return total;
  }

  /** Generadores de entrenamiento ya destruidos en la galaxia del tutorial. */
  private tutorialGeneratorsDestroyed(): number {
    const world = this.world;
    if (!world) return 0;
    let destroyed = 0;
    for (const planet of this.activeGalaxySpec.planets) {
      destroyed += world.getGeneratorsDestroyedOn(planet.id);
    }
    return destroyed;
  }

  /**
   * PASO B — Cierre del tutorial: al cumplir la meta se marca la lección como
   * completada, se libera el cursor, suena la fanfarria y el HUD muestra la
   * tarjeta de victoria. NO se abre el Battle Report ni se envía nada al
   * leaderboard: los tutoriales no contaminan las puntuaciones de la campaña.
   */
  private checkTutorialCompletion(): void {
    const tutorial = this.tutorialSpec;
    if (!tutorial || this.tutorialCompleted || this.phase !== 'playing') return;
    const player = this.player;
    const world = this.world;
    if (!player || !world) return;

    let done: boolean;
    if (tutorial.goalMode === 'reach_target_planet') {
      const targetId = tutorial.targetPlanetId;
      if (!targetId) return;
      const total = world.getGeneratorTotalOn(targetId);
      const destroyed = world.getGeneratorsDestroyedOn(targetId);
      const landed = player.planet.spec.id === targetId && player.isGrounded;
      done = landed || (total > 0 && destroyed >= total);
    } else {
      const total = this.tutorialGeneratorTotal();
      done = total > 0 && this.tutorialGeneratorsDestroyed() >= total;
    }
    if (!done) return;

    this.tutorialCompleted = true;
    this.phase = 'victory';
    this.timeScale = 1;
    this.objectives = this.buildObjectives(player.planet.spec.id);
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.audio.play('victory');
    this.emitHud();
  }

  /**
   * Oleada 2: el escudo de un planeta cayó en vivo. La IA cierra la ficha del
   * planeta completado, calcula la adaptación con la Red Estadística, inyecta
   * sus contramedidas en el planeta recién desbloqueado y avisa por radio
   * (banner no bloqueante) mientras el jugador sigue jugando.
   */
  private onPlanetUnlocked(nextPlanet: PlanetRuntime): void {
    const player = this.player;
    if (player) {
      player.behavior.totalTimeSec = this.elapsed;
      this.behaviorTracker.accumulate(player.behavior);
      // La ficha del planeta completado queda cerrada: el vector en vivo se
      // reinicia para el planeta recién desbloqueado.
      Object.assign(player.behavior, createEmptyBehaviorVector());
    }
    const adaptation = computePlanetAdaptation(
      this.behaviorTracker.getAccumulated(),
      nextPlanet.spec.order
    );
    // La arena de KRONOS no despliega guarnición: el jefe se basta solo.
    if (nextPlanet.spec.biome !== 'kronos') {
      this.world?.applyPlanetAdaptation(nextPlanet, adaptation);
    }
    this.adaptation = adaptation;
    this.radioToast = {
      title: `TORMENTA ORBITAL DE ${nextPlanet.spec.name.toUpperCase()} DESACTIVADA`,
      lines: adaptation.summaryReasons,
      accent: '#22d3ee',
    };
    this.radioToastT = RADIO_TOAST_DURATION;
    this.emitHud();
  }

  /**
   * KRONOS derrotado (Hito 4): la IA cierra la ficha del último planeta, suena
   * la fanfarria y el Battle Report toma el relevo con el perfil completo.
   */
  private onKronosDefeated(): void {
    if (this.phase !== 'playing') return;
    const player = this.player;
    if (player) {
      player.behavior.totalTimeSec = this.elapsed;
      this.behaviorTracker.accumulate(player.behavior);
    }
    this.audio.play('victory');
    this.phase = 'victory';
    this.timeScale = 1;
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.emitHud();
  }

  private checkGameOver(): void {
    if (this.phase !== 'playing') return;
    const player = this.player;
    if (!player || player.hp > 0) return;
    if (this.activeGalaxySpec.isSandbox) {
      const spawnPlanet =
        this.planets.find((p) => p.spec.id === this.activeGalaxySpec.spawnPlanetId) ??
        this.planets[0];
      if (spawnPlanet) {
        const wasLostInSpace = player.lostInSpace;
        this._v1.set(...this.activeGalaxySpec.spawnDir).normalize();
        player.respawnAt(spawnPlanet, this._v1);
        this.radioToast = {
          title: 'REAGRUPAMIENTO EN PLAZA DEL SOL',
          lines: [
            wasLostInSpace
              ? 'Demasiado lejos en el espacio abierto: devuelto a la plaza.'
              : 'Escuadrón recuperado para seguir explorando la galaxia.',
          ],
          accent: '#22d3ee',
        };
        this.radioToastT = 3.5;
        this.emitHud();
      }
      return;
    }
    this.gameOverReason = player.lostInSpace ? 'Te perdiste en el espacio profundo' : null;
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
    // FASE B: diálogo con NPC, reto Sandbox, palanca y compuerta con tarjeta.
    if (this.sandbox?.isNearChallengeStart(player.position)) return 9;
    if (world.npcNear(player.position)) return 5;
    if (world.switchNear(player.position)) return 6;
    if (world.lockedGateNear(player.position)) {
      return world.keycardsCollected > 0 ? 7 : 8;
    }
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

    // Objetivos dinámicos del planeta activo (detectado vía player.planet):
    // solo se reconstruyen cuando cambia el planeta o algún contador.
    const planetId = player.planet.spec.id;
    const sandboxHud = this.sandbox ? this.sandbox.getHudState() : null;
    const objectivesKey = this.activeGalaxySpec.isSandbox && sandboxHud
      ? sandboxHud.coins * 1000 + sandboxHud.orbs * 50 + sandboxHud.challengesCompleted
      : this.planets.indexOf(player.planet) * 100 +
        world.getGeneratorsDestroyedOn(planetId) * 10 +
        world.getKeycardsCollectedOn(planetId) * 5 +
        (world.kronosDefeated ? 1 : 0);
    if (objectivesKey !== this.objectivesKey) {
      this.objectivesKey = objectivesKey;
      this.objectives = this.buildObjectives(planetId);
    }

    // Clave numérica discreta (sin allocations por frame).
    let completed = 0;
    for (let i = 0; i < this.objectives.length; i++) {
      if (this.objectives[i].completed) completed++;
    }
    let key = this.phaseCode();
    key = key * 31 + (player.characterId === 'kitsune' ? 0 : player.characterId === 'digger' ? 1 : 2);
    key = key * 31 + this.planets.indexOf(player.planet);
    key = key * 31 + (player.gravityTarget ? this.planets.indexOf(player.gravityTarget) + 2 : 0);
    key = key * 31 + (player.gravityTargetBlockedReason ? 1 : 0);
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
    key = key * 31 + (player.lockOnActive ? 1 : 0);
    key = key * 31 + (world.isGlobalAlert ? 1 : 0);
    key = key * 31 + Math.round(world.maxSuspicion * 16);
    key = key * 31 + world.keycardsCollected;
    // Hito 4: estado del jefe final + mute del audio procedural.
    key = key * 31 + Math.round((world.kronosHpRatio ?? -1) * 24);
    key = key * 31 + (world.kronosAdaptedTo === 'kitsune' ? 1 : world.kronosAdaptedTo === 'digger' ? 2 : world.kronosAdaptedTo === 'axel' ? 3 : 0);
    key = key * 31 + world.kronosUpdates;
    key = key * 31 + (this.audio.muted ? 1 : 0);
    // Oleada 2: banner de radio al caer un escudo planetario.
    key = key * 31 + (this.radioToast ? 1 : 0);
    // Deriva espacial: aviso HUD cuando el jugador se aleja de toda órbita.
    key = key * 31 + (player.isSpaceDrifting ? 1 : 0);
    // FASE B: bocadillo de diálogo (línea activa) y lockdown de compuertas.
    key = key * 31 + world.dialogueKey;
    key = key * 31 + (world.gateLockdownActive ? 1 : 0);
    // HITO 1: banner de VIGILANCIA (aparece/cambia/caduca -> emisión inmediata).
    key = key * 31 + world.warningBannerKey;
    if (sandboxHud) {
      key = key * 31 + sandboxHud.coins;
      key = key * 31 + sandboxHud.orbs;
      key = key * 31 + sandboxHud.challengesCompleted;
      key = key * 31 + (sandboxHud.anchorTargetInRange ? 1 : 0);
      key = key * 31 + (sandboxHud.popup ? sandboxHud.popup.text.length : 0);
      key = key * 31 + (sandboxHud.activeChallenge ? sandboxHud.activeChallenge.progress + 1 : 0);
    }

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
      case 'game_over':
        return 3;
      case 'victory':
        return 4;
      default:
        return 5;
    }
  }

  /** LevelId del HUD deducido del bioma del planeta activo. */
  private planetLevelId(spec: PlanetSpec): LevelId {
    switch (spec.biome) {
      case 'tutorial':
        return 'prologue';
      case 'verdant':
        return 'verdant';
      case 'cryo':
        return 'cryo';
      case 'bastion':
        return 'bastion';
      default:
        return 'kronos';
    }
  }

  /**
   * Proyección 2D de los marcadores de objetivo del planeta activo: si el
   * objetivo está detrás de la cámara o fuera de pantalla, se clampea al
   * borde [-0.88, 0.88] apuntando en su dirección, con distancia en metros.
   */
  private projectObjectiveMarkers(player: PlayerController): ObjectiveMarker[] {
    const world = this.world;
    if (!world) return [];
    const result = world.getObjectiveTargets(player.planet.spec.id);
    const markers: ObjectiveMarker[] = [];
    this.camera.getWorldDirection(this._camDir);
    for (let i = 0; i < result.count; i++) {
      const target = result.targets[i];
      this._v1.copy(target.pos).sub(this.camera.position);
      const inFront = this._v1.dot(this._camDir) > 0;
      this._v2.copy(target.pos).project(this.camera);
      let sx = this._v2.x;
      let sy = this._v2.y;
      if (!inFront) {
        // Detrás de la cámara: la proyección se espeja; se voltea para que
        // el marcador apunte al borde correcto.
        sx = -sx;
        sy = -sy;
      }
      let maxAbs = Math.max(Math.abs(sx), Math.abs(sy));
      if (maxAbs < 1e-4) {
        sx = 0;
        sy = 1;
        maxAbs = 1;
      }
      if (maxAbs > MARKER_SCREEN_CLAMP || !inFront) {
        const scale = MARKER_SCREEN_CLAMP / maxAbs;
        sx *= scale;
        sy *= scale;
      }
      markers.push({
        id: `obj-${i}-${target.label}`,
        label: target.label,
        distanceMeters: player.position.distanceTo(target.pos),
        screenX: sx,
        screenY: sy,
        inFront,
        color:
          target.label === 'KRONOS'
            ? '#f87171'
            : target.label === 'TARJETA'
              ? '#fbbf24'
              : '#4ade80',
      });
    }
    if (this.sandbox) {
      const sMarkers = this.sandbox.getChallengeMarkers();
      for (let i = 0; i < sMarkers.length; i++) {
        const sm = sMarkers[i];
        this._v1.copy(sm.pos).sub(this.camera.position);
        const inFront = this._v1.dot(this._camDir) > 0;
        this._v2.copy(sm.pos).project(this.camera);
        let sx = this._v2.x;
        let sy = this._v2.y;
        if (!inFront) {
          sx = -sx;
          sy = -sy;
        }
        let maxAbs = Math.max(Math.abs(sx), Math.abs(sy));
        if (maxAbs < 1e-4) {
          sx = 0;
          sy = 1;
          maxAbs = 1;
        }
        if (maxAbs > MARKER_SCREEN_CLAMP || !inFront) {
          const scale = MARKER_SCREEN_CLAMP / maxAbs;
          sx *= scale;
          sy *= scale;
        }
        markers.push({
          id: sm.id,
          label: sm.label,
          distanceMeters: player.position.distanceTo(sm.pos),
          screenX: sx,
          screenY: sy,
          inFront,
          color: sm.color,
        });
      }
    }
    return markers;
  }

  private emitHud(): void {
    const player = this.player;
    const world = this.world;
    if (!player || !world) return;

    // Planeta activo detectado dinámicamente (la galaxia es continua).
    const activePlanet = player.planet;
    const onKronos = activePlanet.spec.biome === 'kronos';

    let prompt: string | null = null;
    switch (this.computePromptKind()) {
      case 1:
        prompt = '[E] Noquear y robar uniforme';
        break;
      case 2:
        prompt = '[F] ¡PARRY AHORA!';
        break;
      case 3:
        prompt = '[R/C] Capturar objeto en Estasis';
        break;
      case 4:
        prompt = '[SHIFT] Subsuelo · [ESPACIO] Cruzar el núcleo';
        break;
      case 5:
        prompt = `[E] Hablar con ${world.getNearestNpcName(player.position) ?? 'el NPC'}`;
        break;
      case 6:
        prompt = '[E] Activar interruptor';
        break;
      case 7:
        prompt = '[E] Abrir compuerta (usar tarjeta)';
        break;
      case 8:
        prompt = 'Compuerta sellada: roba una tarjeta del sector';
        break;
      case 9:
        prompt = this.sandbox?.isNearChallengeStart(player.position) ?? null;
        break;
      default:
        prompt = null;
    }

    // Marcador Lock-On: proyección 2D de la posición del objetivo fijado.
    let lockOnScreenX: number | null = null;
    let lockOnScreenY: number | null = null;
    let lockedTargetName: string | null = null;
    if (player.lockOnActive && player.getLockedTargetPos(this._v1)) {
      lockedTargetName = player.lockedTargetName;
      this._v1.project(this.camera);
      if (this._v1.z < 1) {
        lockOnScreenX = this._v1.x;
        lockOnScreenY = this._v1.y;
      }
    }

    // Vector de comportamiento de la run: si ya se cerró el planeta actual
    // (victory), ya está acumulado en behaviorTracker.
    const runVector = this.behaviorTracker.getAccumulated();
    const levelVector = player.behavior;
    const includeCurrent = this.phase !== 'victory';
    const behavior: PlayerBehaviorVector = includeCurrent
      ? {
          stealthKnockouts: runVector.stealthKnockouts + levelVector.stealthKnockouts,
          disguiseTimeSec: runVector.disguiseTimeSec + levelVector.disguiseTimeSec,
          alarmsTriggered: runVector.alarmsTriggered + levelVector.alarmsTriggered,
          bruteKills: runVector.bruteKills + levelVector.bruteKills,
          aerialAttacks: runVector.aerialAttacks + levelVector.aerialAttacks,
          burrowDistance: runVector.burrowDistance + levelVector.burrowDistance,
          burrowTimeSec: runVector.burrowTimeSec + levelVector.burrowTimeSec,
          stasisThrows: runVector.stasisThrows + levelVector.stasisThrows,
          parriesLanded: runVector.parriesLanded + levelVector.parriesLanded,
          damageTaken: runVector.damageTaken + levelVector.damageTaken,
          totalTimeSec: this.elapsed,
        }
      : { ...runVector, totalTimeSec: this.elapsed };

    // La adaptación inyectada más recientemente por la Red de IA.
    const adaptation = this.adaptation;

    // HITO 3 — Atribución del último golpe: dirección del atacante respecto
    // a la base ortonormal de la cámara (forward/right). El método reutiliza
    // su objeto interno (cero GC); aquí se copian campos planos a React.
    player.getCameraOrientation(this._camQuat);
    this._v1.set(0, 0, -1).applyQuaternion(this._camQuat); // forward de cámara
    this._v2.set(1, 0, 0).applyQuaternion(this._camQuat); // right de cámara
    const damageFeedback = player.getDamageFeedback(this._v1, this._v2);

    const sandboxHud = this.sandbox ? this.sandbox.getHudState() : null;
    const isSandbox = Boolean(this.activeGalaxySpec.isSandbox);

    this.onHudSnapshot({
      phase: this.phase,
      levelId: isSandbox ? 'sandbox' : this.planetLevelId(activePlanet.spec),
      levelTitle: `${activePlanet.spec.name} · ${activePlanet.spec.subtitle}`,
      activeCharacter: player.characterId,
      unlockedCharacters: ['kitsune', 'digger', 'axel'],
      hp: player.hp,
      maxHp: GAME_CONSTANTS.PLAYER_MAX_HP,
      isDisguised: player.isDisguised,
      suspicionRatio: world.maxSuspicion,
      globalAlert: world.isGlobalAlert || world.anyGuardInCombat(),
      isGravityShifting: player.gravityShifting,
      gravityTargetName: player.gravityTarget?.spec.name ?? null,
      gravityTargetBlockedReason: player.gravityTargetBlockedReason,
      stasisHeldCount: world.held,
      isBurrowing: player.isBurrowing,
      isSwimming: player.isSwimming,
      anchorCooldownRatio: player.anchorCooldownRatio,
      parryWindowActive: player.parryWindowActive,
      activePlanetName: activePlanet.spec.name,
      objectives: this.objectives.map((o) => ({ ...o })),
      elapsedRunSec: this.elapsed,
      pointerLocked: this.pointerLocked,
      interactionPrompt: prompt,
      adaptation: { ...adaptation },
      behaviorVector: behavior,
      bossHpRatio: onKronos ? world.kronosHpRatio : null,
      bossAdaptedTo: onKronos ? world.kronosAdaptedTo : null,
      gravityShiftCooldownRatio: player.gravityShiftCooldownRatio,
      lockOnActive: player.lockOnActive,
      lockedTargetName,
      lockOnScreenX,
      lockOnScreenY,
      muted: this.audio.muted,
      kronosUpdates: world.kronosUpdates,
      objectiveMarkers: this.projectObjectiveMarkers(player),
      radioToast: this.radioToast ? { ...this.radioToast, lines: [...this.radioToast.lines] } : null,
      speedLinesIntensity: this.speedLines,
      spaceDriftWarning: player.isSpaceDrifting,
      gameOverReason: this.gameOverReason,
      activeDialogue: world.activeDialogue ? { ...world.activeDialogue } : null,
      keycardsCollected: world.keycardsCollected,
      gateLockdownActive: world.gateLockdownActive,
      warningBanner: world.warningBanner
        ? { speaker: world.warningBanner.speaker, text: world.warningBanner.text }
        : null,
      damageFeedback: damageFeedback ? { ...damageFeedback } : null,
      tutorialId: this.tutorialSpec?.id ?? null,
      tutorialTitle: this.tutorialSpec?.title ?? null,
      tutorialLessons: this.tutorialSpec ? [...this.tutorialSpec.lessonSteps] : [],
      tutorialCompleted: this.tutorialCompleted,
      isSandbox,
      sandboxCoins: sandboxHud?.coins,
      sandboxCoinsTotal: sandboxHud?.coinsTotal,
      sandboxOrbs: sandboxHud?.orbs,
      sandboxOrbsTotal: sandboxHud?.orbsTotal,
      sandboxChallengesCompleted: sandboxHud?.challengesCompleted,
      sandboxChallengesTotal: sandboxHud?.challengesTotal,
      activeChallenge: sandboxHud?.activeChallenge
        ? { ...sandboxHud.activeChallenge }
        : null,
      anchorTargetInRange: sandboxHud?.anchorTargetInRange ?? false,
      sandboxPopup: sandboxHud?.popup ? { ...sandboxHud.popup } : null,
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
    window.addEventListener('pointerdown', this.boundPointerDownUnlock);
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
    window.removeEventListener('pointerdown', this.boundPointerDownUnlock);
    this.canvas.removeEventListener('click', this.boundClick);
    this.canvas.removeEventListener('contextmenu', this.boundContextMenu);
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.repeat) return;
    // Primer gesto del usuario: desbloquea el AudioContext del sintetizador.
    this.audio.unlock();
    // Tecla M: alterna el mute del audio procedural (en cualquier fase).
    if (e.code === 'KeyM') {
      this.audio.toggleMute();
      this.emitHud();
      return;
    }
    if (this.phase !== 'playing') return;
    // Space, Tab y cualquier tecla rebindeada: evita scroll y cambio de foco.
    if (e.code === 'Space' || e.code === 'Tab' || this.isBoundCode(e.code)) e.preventDefault();
    this.player?.handleKey(e.code, true);
  }

  /** ¿El código es una tecla de acción del jugador? (evita el scroll del navegador) */
  private isBoundCode(code: string): boolean {
    const bindings = this.settings.bindings;
    for (let i = 0; i < CONTROL_ACTIONS.length; i++) {
      if (bindings[CONTROL_ACTIONS[i]] === code) return true;
    }
    return false;
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
    this.audio.unlock(); // cualquier clic reanuda el AudioContext si estaba suspendido
    if (!this.pointerLocked || this.phase !== 'playing') return;
    // Clic central (Lock-On): evita el autoscroll del navegador.
    if (e.button === 1) e.preventDefault();
    this.player?.handleMouseButton(e.button, true);
  }

  private onMouseUp(e: MouseEvent): void {
    if (this.phase !== 'playing') return;
    this.player?.handleMouseButton(e.button, false);
  }

  /** Zoom con la rueda del ratón entre 5 y 26 unidades (siempre libre). */
  private onWheel(e: WheelEvent): void {
    if (this.phase !== 'playing') return;
    this.baseCamDist = THREE.MathUtils.clamp(
      this.baseCamDist + e.deltaY * 0.01,
      CAMERA_MIN_DIST,
      CAMERA_MAX_DIST
    );
  }

  private requestPointerLock(): void {
    if (this.phase === 'victory' || this.phase === 'game_over') {
      return;
    }
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
