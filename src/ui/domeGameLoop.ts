// ============================================================================
// DOME GAME LOOP — runtime del modo Cúpula
// ============================================================================
// Encapsula el bucle de juego del modo Cúpula (renderer, escena, oleadas,
// entrenamiento, input y sincronización del HUD) que antes vivía como un
// useEffect de ~730 líneas dentro de DomeGameView. El cuerpo se mueve
// verbatim: DomeGameView conserva solo el estado de React y la UI, y este
// módulo recibe refs y setters por parámetro. Devuelve la función de
// disposición (cleanup) que el useEffect de React devuelve tal cual.
// ============================================================================

import * as THREE from 'three';
import { createDomeArenaBackdrop } from '@/game/render/domeArenaScene';
import { loadNyxRigged, type LoadedNyx } from '@/game/render/nyxModelLoader';
import { DomeFloatingSlabManager } from '@/game/dome/DomeFloatingSlabs';
import { DomeSphereTileManager } from '@/game/dome/DomeSphereTiles';
import { DomeWaveManager, type ManagedWaveEnemy, type WaveFloorMode } from '@/game/dome/DomeWaveManager';
import { MotionVfxSystem } from '@/game/dome/MotionVfx';
import { NyxDomeController } from '@/game/dome/NyxDomeController';
import { GamepadInput } from '@/game/input/GamepadInput';
import {
  ACTIVE_SKILLS_CATALOG,
  DomeProgressionManager,
  PASSIVES_CATALOG,
  type ActiveSkillId,
  type LevelUpCardOption,
  type PassiveId,
} from '@/game/dome/DomeProgression';
import { DomePickupManager } from '@/game/dome/DomePickups';
import { DomeSkillExecutor, type SkillTargetEnemy } from '@/game/dome/DomeSkills';
import { DomeCombatSystem, THORNS_DAMAGE_TO_NYX, type EnemyArchetype } from '@/game/dome/DomeCombatSystem';
import { DomeRunTracker } from '@/game/dome/DomeRunStats';
import { DOME_PLAYER_BOUND_RADIUS, type DomeHudState, type SlabCollider, type TestEnemySphere } from '@/game/dome/domeTypes';
import type { GameSettings } from '@/game/settings';
import { SynthAudio } from '@/game/audio/SynthAudio';
import type { DomeBattleReportData } from '@/ui/DomeBattleReport';

/**
 * Puente del panel de entrenamiento hacia el loop: el panel debug muta el
 * juego en vivo a través de estos métodos (se rellena al arrancar el loop).
 */
export interface DomeTrainingBridge {
  setEnemyArchetype: (archetype: EnemyArchetype) => void;
  respawnEnemy: () => void;
  setEnemyPassive: (passive: boolean) => void;
  equipSkill: (slot: 0 | 1 | 2, skillId: ActiveSkillId) => void;
  clearSlot: (slot: 0 | 1 | 2) => void;
  upgradeSlot: (slot: 0 | 1 | 2) => void;
  setPassiveLevel: (id: PassiveId, level: number) => void;
  refillResources: () => void;
}

/** Estado de React del modal de subida de nivel (elección de carta). */
export interface DomeLevelUpUiState {
  isOpen: boolean;
  newLevel: number;
  choices: [LevelUpCardOption, LevelUpCardOption] | null;
  requiresSlotReplacement: boolean;
}

/** Dependencias que DomeGameView inyecta al runtime del loop. */
export interface DomeGameLoopParams {
  canvas: HTMLCanvasElement;
  settingsRef: { current: GameSettings };
  training: boolean;
  trainingUiRef: { current: { archetype: EnemyArchetype; passive: boolean } };
  trainingBridgeRef: { current: DomeTrainingBridge | null };
  controllerRef: { current: NyxDomeController | null };
  audioRef: { current: SynthAudio | null };
  progressionRef: { current: DomeProgressionManager | null };
  runTrackerRef: { current: DomeRunTracker | null };
  setHud: (hud: DomeHudState) => void;
  setLevelUpState: (state: DomeLevelUpUiState) => void;
  setBattleReport: (report: DomeBattleReportData | null) => void;
  setIsPauseOpen: (open: boolean) => void;
  setDebugPanelOpen: (open: boolean) => void;
  levelUpOpenRef: { current: boolean };
  battleReportOpenRef: { current: boolean };
  pauseOpenRef: { current: boolean };
  debugPanelOpenRef: { current: boolean };
  hadPointerLockRef: { current: boolean };
}

/**
 * Arranca el runtime del modo Cúpula sobre el canvas dado: crea renderer,
 * escena, managers y listeners, lanza el requestAnimationFrame y devuelve
 * la función de disposición que limpia todo (la que el useEffect devuelve).
 */
export function startDomeGameLoop(params: DomeGameLoopParams): () => void {
  const {
    canvas,
    settingsRef,
    training,
    trainingUiRef,
    trainingBridgeRef,
    controllerRef,
    audioRef,
    progressionRef,
    runTrackerRef,
    setHud,
    setLevelUpState,
    setBattleReport,
    setIsPauseOpen,
    setDebugPanelOpen,
    levelUpOpenRef,
    battleReportOpenRef,
    pauseOpenRef,
    debugPanelOpenRef,
    hadPointerLockRef,
  } = params;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    settingsRef.current.baseFov,
    window.innerWidth / window.innerHeight,
    0.1,
    2500,
  );

  const sun = new THREE.DirectionalLight(0xdbeafe, 1.5);
  sun.position.set(60, 120, 40);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x818cf8, 0.65));

  const backdrop = createDomeArenaBackdrop(scene);
  const floatingSlabs = new DomeFloatingSlabManager(scene);
  const sphereTiles = new DomeSphereTileManager(scene);
  const waveMgr = new DomeWaveManager(scene);
  const pickups = new DomePickupManager(scene);
  const skillExecutor = new DomeSkillExecutor(scene);
  const progression = new DomeProgressionManager();
  progressionRef.current = progression;
  const combat = new DomeCombatSystem(progression.maxHp);
  const runTracker = new DomeRunTracker();
  runTrackerRef.current = runTracker;
  const vfx = new MotionVfxSystem(scene);
  const audio = new SynthAudio();
  audio.setVolumeMultiplier(settingsRef.current.masterVolume);
  audioRef.current = audio;
  // Lector de mando (Gamepad API): se actualiza cada frame en el loop, sin
  // depender del pointer lock, para poder jugar con mando y ratón libre.
  const gamepad = new GamepadInput(settingsRef.current);

  const applyFloorMode = (mode: WaveFloorMode) => {
    if (mode === 'basic') {
      floatingSlabs.setTargetCount(5 + Math.floor(Math.random() * 6));
      sphereTiles.setMode('none');
    } else if (mode === 'miniboss') {
      floatingSlabs.setTargetCount(0);
      sphereTiles.setMode('miniboss');
    } else {
      floatingSlabs.setTargetCount(0);
      sphereTiles.setMode('boss');
    }
  };

  // Arrays persistentes del bucle caliente: se rellenan in-place cada frame
  // (cero allocations; antes eran spreads y filters nuevos por frame).
  const activeSlabs: SlabCollider[] = [];
  const refillActiveSlabs = () => {
    activeSlabs.length = 0;
    for (const slab of floatingSlabs.getActiveColliders()) activeSlabs.push(slab);
    for (const slab of sphereTiles.getActiveColliders()) activeSlabs.push(slab);
  };
  const activeEnemies: ManagedWaveEnemy[] = [];
  if (training) {
    // Modo Entrenamiento: sin oleadas automáticas ni elección inicial de
    // cartas; suelos básicos para el Cangrejo Artillero y los escombros del
    // Campo Gravitacional. El enemigo único lo spawnea el puente de abajo.
    progression.pendingInitialPick = false;
    applyFloorMode('basic');
  } else {
    waveMgr.startWave(1, activeSlabs);
    runTracker.recordWave(1);
    applyFloorMode(waveMgr.getWaveInfo().floorMode);
  }
  let nextWaveDelay = 0;

  const openLevelUpModal = (forLevel: number) => {
    if (document.pointerLockElement === canvas) {
      document.exitPointerLock?.();
    }
    const choices = progression.generateLevelUpChoices(forLevel);
    const allSlotsFull = progression.slots.every((s) => s.skillId !== null);
    setLevelUpState({
      isOpen: true,
      newLevel: forLevel,
      choices,
      requiresSlotReplacement: allSlotsFull,
    });
  };

  // Nivel 1: abre elección inicial en el segundo 1 (Carta 1 fija Campo Gravitacional)
  if (progression.pendingInitialPick) {
    openLevelUpModal(1);
  }

  let loadedNyx: LoadedNyx | null = null;
  let controller: NyxDomeController | null = null;
  let disposed = false;

  // --- Modo Entrenamiento: enemigo único delante de Nyx + puente del panel ---
  const trainingState: { archetype: EnemyArchetype; passive: boolean } = {
    archetype: trainingUiRef.current.archetype,
    passive: trainingUiRef.current.passive,
  };
  const trainingSpawnPos = new THREE.Vector3();
  const getTrainingSpawnPos = (): THREE.Vector3 => {
    if (controller) {
      trainingSpawnPos
        .copy(controller.getPosition())
        .addScaledVector(controller.getAimForward(), 18);
      trainingSpawnPos.y = THREE.MathUtils.clamp(trainingSpawnPos.y, 2, 30);
    } else {
      trainingSpawnPos.set(0, 5, -18);
    }
    return trainingSpawnPos;
  };
  const spawnTrainingEnemy = () => {
    waveMgr.spawnSingleEnemy(trainingState.archetype, getTrainingSpawnPos());
  };
  // Daño a Nyx con la regla de inmortalidad del entrenamiento: si un golpe
  // la deja por debajo de 1 HP, se regenera al instante para poder seguir
  // probando golpes enemigos y trampas sin morir.
  const applyDamageToNyx = (amount: number) => {
    if (!controller || amount <= 0) return;
    controller.applyDamage(amount);
    if (training && controller.getHp() < 1) {
      controller.restoreResources(progression.maxHp, 0);
    }
  };
  if (training) {
    waveMgr.setEnemiesPassive(trainingState.passive);
    trainingBridgeRef.current = {
      setEnemyArchetype: (archetype) => {
        trainingState.archetype = archetype;
        spawnTrainingEnemy();
      },
      respawnEnemy: () => spawnTrainingEnemy(),
      setEnemyPassive: (passive) => {
        trainingState.passive = passive;
        waveMgr.setEnemiesPassive(passive);
      },
      equipSkill: (slot, skillId) => {
        const def = ACTIVE_SKILLS_CATALOG[skillId];
        progression.slots[slot] = {
          skillId,
          level: 1,
          cooldownRemaining: 0,
          maxCooldown: def.cooldown,
        };
      },
      clearSlot: (slot) => {
        progression.slots[slot] = {
          skillId: null,
          level: 0,
          cooldownRemaining: 0,
          maxCooldown: 0,
        };
      },
      upgradeSlot: (slot) => {
        const slotState = progression.slots[slot];
        if (!slotState.skillId) return;
        slotState.level = Math.min(
          ACTIVE_SKILLS_CATALOG[slotState.skillId].maxLevel,
          slotState.level + 1,
        );
      },
      setPassiveLevel: (id, level) => {
        progression.passives[id] = Math.min(PASSIVES_CATALOG[id].maxLevel, Math.max(0, level));
      },
      refillResources: () => {
        controller?.restoreResources(progression.maxHp, progression.maxEden);
      },
    };
    spawnTrainingEnemy();
  }

  const killWaveEnemy = (enemy: ManagedWaveEnemy, viaBarrier: boolean) => {
    if (!enemy.entity.alive) return;
    pickups.spawnFromEnemy(enemy.position, enemy.entity.expValue, 6);
    runTracker.recordKill({
      isElite: enemy.entity.isElite,
      isBoss: enemy.entity.isBoss,
    });
    if (viaBarrier) runTracker.recordBarrierKill();
    waveMgr.killEnemy(enemy);
  };

  const handleSkillDamageEnemy = (
    target: SkillTargetEnemy,
    amount: number,
    impulse: THREE.Vector3,
    bypassFlesh = false,
  ) => {
    const enemy = waveMgr.getActiveEnemies().find((e) => e.id === target.id);
    if (!enemy || !enemy.entity.alive) return;

    enemy.entity.position.copy(enemy.position);
    const res = combat.computeKineticImpact(
      enemy.entity,
      Math.max(12, amount * 0.4),
      progression.getModifiers().forceMultiplier,
      false,
      bypassFlesh,
    );
    enemy.velocity.add(impulse);
    enemy.hitFlash = 1;
    runTracker.recordDamage(Math.max(amount, res.damage));
    if (enemy.entity.hp <= 0 || res.killed) {
      killWaveEnemy(enemy, false);
    }
  };

  // --- Callbacks estables del waveMgr: cero closures nuevas por frame ---
  const onWavePlayerHit = (dmg: number) => applyDamageToNyx(dmg);
  const onOctopusInk = () => combat.applyOctopusInkAttack();
  // Manotazo brutal del Gólem: daño + empuje con hit_stagger.
  // (Los Anillos de Contención de KRONOS lo reutilizan con daño 0 y
  // un empuje radial más fuerte hacia la Barrera Blanca.)
  const onGolemSmash = (dmg: number, pushDir: THREE.Vector3, pushSpeed?: number) => {
    applyDamageToNyx(dmg);
    controller?.applySmashKnockback(pushDir, pushSpeed ?? 22);
  };
  // El manotazo rompe un suelo flotante: se destroza y suelta
  // escombros agarrables por el Campo Gravitacional.
  const onSlabSmash = (slab: SlabCollider) => {
    const shattered = floatingSlabs.shatterSlab(slab.id);
    if (shattered) {
      skillExecutor.spawnSlabDebris(shattered.center, 4);
    }
  };
  // Impacto de Nyx contra un enemigo (patada/taladro): aplica el daño
  // cinético del DomeCombatSystem. Event-driven, no cada frame.
  const onControllerHitEnemy = (
    enemy: TestEnemySphere,
    hitDir: THREE.Vector3,
    isDrill: boolean,
    impactSpeed?: number,
  ) => {
    waveMgr.onHitEnemy(enemy, hitDir, isDrill, impactSpeed);
    const managed = waveMgr.getActiveEnemies().find((e) => e.id === enemy.id);
    if (managed && managed.entity.alive) {
      const res = combat.computeKineticImpact(
        managed.entity,
        impactSpeed ?? 14,
        progression.getModifiers().forceMultiplier,
        isDrill,
      );
      // Pinchos del Necrozma: el golpe queda mitigado y Nyx recibe
      // daño de represalia (la repulsión la da el recoilBounce).
      if (res.reason === 'thorns_repel') {
        applyDamageToNyx(THORNS_DAMAGE_TO_NYX);
      }
      runTracker.recordDamage(res.damage);
      if (managed.entity.hp <= 0 || res.killed) {
        killWaveEnemy(managed, false);
      }
    }
  };

  // --- Payload persistente de syncProgression (cero objetos por frame) ---
  const syncPayload: Parameters<NyxDomeController['syncProgression']>[0] = {
    level: 1,
    exp: 0,
    expToNext: 1,
    maxHp: 100,
    maxEden: 100,
    speedMultiplier: 1,
    edenRegenFrac: 0,
    hpRegenFrac: 0,
    inkOverlayIntensity: 0,
    waveNumber: undefined,
    waveLabel: undefined,
    slots: [
      { name: null, level: 0, cooldownRemaining: 0, maxCooldown: 0 },
      { name: null, level: 0, cooldownRemaining: 0, maxCooldown: 0 },
      { name: null, level: 0, cooldownRemaining: 0, maxCooldown: 0 },
    ],
  };

  loadNyxRigged()
    .then((nyx) => {
      if (disposed) {
        nyx.dispose();
        return;
      }
      loadedNyx = nyx;
      // Posicionada justo sobre la plataforma central para aterrizar o flotar desde el inicio
      nyx.root.position.set(0, -1.8, 0);
      scene.add(nyx.root);
      controller = new NyxDomeController(
        nyx.root,
        nyx.animator,
        vfx,
        settingsRef.current,
        audio,
        gamepad,
      );
      controller.setViewportSize(window.innerWidth, window.innerHeight);
      controller.onDomeBounceDamage = () => {
        combat.applyDomeBarrierDamageToNyx();
      };
      controller.onRedirectionSuccess = () => {
        runTracker.recordRedirection();
      };
      controller.onLeftClickAttackOverride = () => {
        if (!controller || !skillExecutor.hasActiveGravityRocks()) return false;
        const target = controller.getLockedEnemy() ?? controller.getCandidateEnemy();
        const fired = skillExecutor.fireOneGravityRock(
          controller.getPosition(),
          controller.getAimForward(),
          target,
        );
        if (fired) {
          controller.triggerSkillAnim('stasis_throw');
          audio.playMelee();
          if (!skillExecutor.hasActiveGravityRocks()) {
            const gSlot = progression.slots.find((s) => s.skillId === 'gravity_field');
            if (gSlot) gSlot.cooldownRemaining = ACTIVE_SKILLS_CATALOG.gravity_field.cooldown;
          }
        }
        return fired;
      };
      controller.onSlotTriggered = (slotIdx) => {
        if (levelUpOpenRef.current || battleReportOpenRef.current || pauseOpenRef.current || !controller) return;
        const slot = progression.slots[slotIdx];
        if (!slot.skillId) return;
        // Si pulsa el slot de Campo Gravitacional teniendo rocas activas -> cancela y las suelta
        if (slot.skillId === 'gravity_field' && skillExecutor.hasActiveGravityRocks()) {
          skillExecutor.cancelGravityField();
          return;
        }
        if (slot.cooldownRemaining > 0) return;
        const def = ACTIVE_SKILLS_CATALOG[slot.skillId];
        if (controller.getEden() < def.edenCost) return;

        const activeTargets = waveMgr.getActiveEnemies();
        const locked = controller.getLockedEnemy();
        const res = skillExecutor.triggerSkill(slot.skillId, slot.level, {
          playerPos: controller.getPosition(),
          forwardDir: controller.getAimForward(),
          isGrounded: controller.isPlayerGrounded(),
          isStill: controller.isPlayerStill(),
          lockedEnemy: locked && activeTargets.some((e) => e.id === locked.id) ? locked : null,
          enemies: activeTargets,
          slabs: activeSlabs,
          onDamageEnemy: handleSkillDamageEnemy,
          onHealPlayer: (hp, eden) => controller?.restoreResources(hp, eden),
        });
        if (res.triggered) {
          controller.spendEden(def.edenCost);
          // El cooldown de gravity_field empieza al gastar/cancelar la última roca
          if (slot.skillId !== 'gravity_field') {
            slot.cooldownRemaining = def.cooldown;
          }
          if (res.animOverride) controller.triggerSkillAnim(res.animOverride);
        }
      };
      controllerRef.current = controller;
      setHud(controller.getHudState());
    })
    .catch((err) => {
      console.error('Failed to load NYX model:', err);
    });

  const onCanvasClick = () => {
    audio.unlock();
    if (document.pointerLockElement !== canvas) {
      canvas.requestPointerLock?.();
    }
  };

  const onPointerLockChange = () => {
    const locked = document.pointerLockElement === canvas;
    if (locked) {
      hadPointerLockRef.current = true;
      // Entrenamiento: al recapturar el ratón (clic en el lienzo) el panel
      // debug se oculta solo para devolver el control completo del juego.
      if (training && debugPanelOpenRef.current) {
        debugPanelOpenRef.current = false;
        setDebugPanelOpen(false);
      }
    } else if (
      hadPointerLockRef.current &&
      !levelUpOpenRef.current &&
      !battleReportOpenRef.current &&
      !pauseOpenRef.current &&
      !debugPanelOpenRef.current
    ) {
      // El navegador consumió ESC para soltar el pointer lock: abre la pausa.
      setIsPauseOpen(true);
    }
    controller?.setPointerLocked(locked);
    if (controller) setHud(controller.getHudState());
  };

  const onMouseMove = (e: MouseEvent) => {
    if (document.pointerLockElement !== canvas) return;
    controller?.onMouseMove(e.movementX, e.movementY);
  };

  const onMouseDown = (e: MouseEvent) => {
    if (document.pointerLockElement !== canvas) return;
    controller?.onMouseDown(e.button);
  };

  const onMouseUp = (e: MouseEvent) => {
    controller?.onMouseUp(e.button);
  };

  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    // Entrenamiento: F2/Tab muestran u ocultan el panel debug; T recarga
    // Vida + Edén al instante (tecla rápida de recarga).
    if (training && (e.code === 'F2' || e.code === 'Tab')) {
      e.preventDefault();
      const next = !debugPanelOpenRef.current;
      debugPanelOpenRef.current = next;
      setDebugPanelOpen(next);
      if (next) {
        document.exitPointerLock?.();
      } else {
        const activeCanvas = canvas;
        if (
          activeCanvas &&
          !levelUpOpenRef.current &&
          !battleReportOpenRef.current &&
          !pauseOpenRef.current
        ) {
          activeCanvas.requestPointerLock?.();
        }
      }
      return;
    }
    if (training && e.code === 'KeyT') {
      trainingBridgeRef.current?.refillResources();
      return;
    }
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (levelUpOpenRef.current || battleReportOpenRef.current) return;
      if (pauseOpenRef.current) {
        setIsPauseOpen(false);
        canvas.requestPointerLock?.();
      } else {
        setIsPauseOpen(true);
        document.exitPointerLock?.();
      }
      return;
    }
    if (pauseOpenRef.current) return;
    controller?.onKeyDown(e.code);
  };

  const onKeyUp = (e: KeyboardEvent) => {
    if (pauseOpenRef.current) return;
    controller?.onKeyUp(e.code);
  };

  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    controller?.setViewportSize(window.innerWidth, window.innerHeight);
  };

  canvas.addEventListener('click', onCanvasClick);
  canvas.addEventListener('contextmenu', onContextMenu);
  document.addEventListener('pointerlockchange', onPointerLockChange);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('resize', onResize);

  let last = performance.now();
  let elapsed = 0;
  let hudTimer = 0;
  let raf = 0;
  let gameOverTriggered = false;

  const tick = () => {
    raf = requestAnimationFrame(tick);
    const now = performance.now();
    const rawDt = Math.min((now - last) / 1000, 0.05);
    last = now;

    // --- Mando (Gamepad API): se lee SIEMPRE cada frame, incluso en pausa,
    // para poder abrir/cerrar DomePauseModal con Options y cerrarla con
    // Círculo (B). El resto de botones los consume el controlador al jugar.
    gamepad.update();
    if (gamepad.justPressedAction('pause')) {
      if (!levelUpOpenRef.current && !battleReportOpenRef.current) {
        if (pauseOpenRef.current) {
          // Reanudar con mando NO captura el ratón: se puede seguir jugando
          // solo con el mando y el puntero libre.
          setIsPauseOpen(false);
        } else {
          setIsPauseOpen(true);
          if (document.pointerLockElement === canvas) {
            document.exitPointerLock?.();
          }
        }
      }
    } else if (pauseOpenRef.current && gamepad.justPressed(1)) {
      setIsPauseOpen(false);
    }

    const isPaused = levelUpOpenRef.current || battleReportOpenRef.current || pauseOpenRef.current;
    const effRawDt = isPaused ? 0 : rawDt;
    const timeScale = controller ? controller.getTimeScale() : 1.0;
    const worldDt = effRawDt * timeScale;
    elapsed += worldDt;

    if (loadedNyx) {
      loadedNyx.universeMat.uniforms.uTime.value = elapsed;
    }

    backdrop.update(worldDt, elapsed);

    if (controller && !isPaused) {
      progression.updateCooldowns(effRawDt);
      // Entrenamiento: el Edén se regenerá rapidísimo (+25/s) para poder
      // probar habilidades en cadena sin farmear.
      if (training) {
        controller.restoreResources(0, 25 * effRawDt);
      }
      const mods = progression.getModifiers();
      const playerStatus = combat.updatePlayerStatus(effRawDt);
      if (playerStatus.inkDamageThisFrame > 0) {
        applyDamageToNyx(playerStatus.inkDamageThisFrame);
      }

      // Suelos activos según oleada (flotantes arrancados en básicas / triángulos de esfera en Miniboss y Boss).
      // Se pasa la posición y dirección de la cámara para que los suelos
      // reciclados re-entren desde fuera del campo de visión del jugador.
      floatingSlabs.update(worldDt, elapsed, camera.position, controller.getAimForward());
      sphereTiles.update(worldDt, elapsed);
      refillActiveSlabs();

      const { didEnemyEvadeDash } = waveMgr.update(
        worldDt,
        elapsed,
        controller.getPosition(),
        controller.getLockedEnemy(),
        controller.getAttackAccelTime(),
        activeSlabs,
        onWavePlayerHit,
        onOctopusInk,
        onGolemSmash,
        onSlabSmash,
      );
      if (didEnemyEvadeDash) {
        controller.notifyEnemyEvaded();
      }

      waveMgr.fillActiveEnemies(activeEnemies);

      // Regla de Barrera Blanca para enemigos
      for (const enemy of activeEnemies) {
        if (!enemy.entity.alive) continue;
        // El cangrejo en pleno salto entre suelos no muere por la barrera.
        if (waveMgr.isEnemyJumping(enemy)) continue;
        if (combat.checkDomeBarrierKill(enemy.entity, DOME_PLAYER_BOUND_RADIUS)) {
          killWaveEnemy(enemy, true);
        }
      }

      // Avance automático al completar oleada. En Entrenamiento no existen
      // oleadas: el enemigo único reaparece al instante con la vida llena.
      if (training) {
        if (waveMgr.getActiveEnemyCount() === 0) {
          spawnTrainingEnemy();
        }
      } else if (waveMgr.getActiveEnemyCount() === 0) {
        if (nextWaveDelay <= 0) nextWaveDelay = 1.6;
        else {
          nextWaveDelay -= worldDt;
          if (nextWaveDelay <= 0) {
            const nextWave = waveMgr.getWaveInfo().wave + 1;
            waveMgr.startWave(nextWave, activeSlabs);
            runTracker.recordWave(nextWave);
            applyFloorMode(waveMgr.getWaveInfo().floorMode);
          }
        }
      } else {
        nextWaveDelay = 0;
      }

      // Actualizar habilidades activas (rocas orbitando frente a Nyx, agujero negro, ondas, pozo)
      skillExecutor.update(
        worldDt,
        activeEnemies,
        handleSkillDamageEnemy,
        controller.getPosition(),
        controller.getAimForward(),
      );

      // Actualizar partículas de EXP / Edén con magnetismo por nivel
      const pickupGains = pickups.update(
        worldDt,
        controller.getPosition(),
        mods.magnetRadius,
        mods.magnetSpeed,
      );
      if (pickupGains.hpGained > 0 || pickupGains.edenGained > 0) {
        controller.restoreResources(pickupGains.hpGained, pickupGains.edenGained);
      }
      if (pickupGains.expGained > 0) {
        const leveled = progression.addExp(pickupGains.expGained);
        runTracker.recordLevel(progression.level);
        if (leveled) {
          openLevelUpModal(progression.level);
        }
      }

      const waveInfo = waveMgr.getWaveInfo();
      // Sincronizar estadísticas/slots con NyxDomeController (payload
      // persistente mutado in-place: cero objetos nuevos por frame).
      syncPayload.level = progression.level;
      syncPayload.exp = progression.exp;
      syncPayload.expToNext = progression.expToNext;
      syncPayload.maxHp = progression.maxHp;
      syncPayload.maxEden = progression.maxEden;
      syncPayload.speedMultiplier = mods.speedMultiplier;
      syncPayload.edenRegenFrac = mods.edenRegenPctPerSec;
      syncPayload.hpRegenFrac = mods.hpRegenPctPerSec;
      syncPayload.inkOverlayIntensity = playerStatus.inkIntensity;
      syncPayload.waveNumber = training ? undefined : waveInfo.wave;
      syncPayload.waveLabel = training ? undefined : waveInfo.label;
      for (let i = 0; i < 3; i++) {
        const slot = progression.slots[i];
        syncPayload.slots[i].name = slot.skillId
          ? ACTIVE_SKILLS_CATALOG[slot.skillId].name
          : null;
        syncPayload.slots[i].level = slot.level;
        syncPayload.slots[i].cooldownRemaining = slot.cooldownRemaining;
        syncPayload.slots[i].maxCooldown = slot.maxCooldown;
      }
      controller.syncProgression(syncPayload);

      controller.update(
        effRawDt,
        activeSlabs,
        camera,
        activeEnemies,
        onControllerHitEnemy,
      );

      runTracker.tick(worldDt);
      runTracker.recordSpeed(controller.getCurrentSpeed());

      // Entrenamiento: Nyx es inmortal, nunca se muestra el Battle Report.
      if (!training && controller.getHp() <= 0 && !gameOverTriggered) {
        gameOverTriggered = true;
        if (document.pointerLockElement === canvas) {
          document.exitPointerLock?.();
        }
        const equippedIds = progression.slots
          .filter((s) => s.skillId !== null)
          .map((s) => ({ id: s.skillId as string, level: s.level }));
        const summary = runTracker.getSummary(equippedIds, progression.passives);
        setBattleReport({
          score: summary.score,
          wave: summary.wave,
          level: summary.maxLevelReached,
          kills: summary.kills,
          barrierKills: summary.barrierKills,
          maxSpeed: summary.maxSpeedReached,
          survivalTimeSec: summary.survivalTimeSec,
          perfectRedirections: summary.perfectRedirections,
          equippedSkills: progression.slots
            .filter((s) => s.skillId !== null)
            .map((s) => ({
              name: ACTIVE_SKILLS_CATALOG[s.skillId!].name,
              level: s.level,
            })),
        });
      }

      hudTimer += rawDt;
      if (hudTimer >= 1 / 30) {
        hudTimer = 0;
        setHud(controller.getHudState());
      }
    } else if (!controller) {
      camera.position.set(0, 2.8, 7.5);
      camera.lookAt(0, 1.0, 0);
    }

    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(tick);

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    if (document.pointerLockElement === canvas) {
      document.exitPointerLock?.();
    }
    canvas.removeEventListener('click', onCanvasClick);
    canvas.removeEventListener('contextmenu', onContextMenu);
    document.removeEventListener('pointerlockchange', onPointerLockChange);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('resize', onResize);
    controllerRef.current = null;
    audioRef.current = null;
    progressionRef.current = null;
    trainingBridgeRef.current = null;
    loadedNyx?.dispose();
    pickups.dispose();
    skillExecutor.dispose();
    waveMgr.dispose();
    sphereTiles.dispose();
    floatingSlabs.dispose();
    vfx.dispose();
    backdrop.dispose();
    renderer.dispose();
  };
}
