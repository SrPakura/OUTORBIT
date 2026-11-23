import { useCallback, useEffect, useRef, useState } from 'react';
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
import { DomeRunTracker, submitDomeRunToLeaderboard } from '@/game/dome/DomeRunStats';
import { DOME_PLAYER_BOUND_RADIUS, type DomeHudState, type SlabCollider, type TestEnemySphere } from '@/game/dome/domeTypes';
import type { GameSettings } from '@/game/settings';
import { SynthAudio } from '@/game/audio/SynthAudio';
import DomeHudSketch from '@/ui/DomeHudSketch';
import FluidLevelUpModal, { type FluidCardOption } from '@/ui/FluidLevelUpModal';
import DomeBattleReport, { type DomeBattleReportData } from '@/ui/DomeBattleReport';
import DomePauseModal from '@/ui/DomePauseModal';
import DomeTrainingPanel, { type TrainingSlotInfo } from '@/ui/DomeTrainingPanel';

interface DomeGameViewProps {
  settings: GameSettings;
  onExit: () => void;
  /**
   * Modo Entrenamiento / Debug: Nyx inmortal, Edén +25/s, sin oleadas
   * automáticas y un único enemigo intercambiable gestionado desde el panel
   * debug (F2 / Tab).
   */
  trainingMode?: boolean;
}

const INITIAL_HUD: DomeHudState = {
  hp: 100,
  maxHp: 100,
  eden: 100,
  maxEden: 100,
  exp: 0,
  expToNext: 1,
  level: 1,
  speed: 0,
  drillThreshold: 14.5,
  isDrillReady: false,
  speedLinesIntensity: 0,
  mode: 'floating',
  speedAttackKind: null,
  pointerLocked: false,
  reticleLockState: 'none',
  lockedEnemyScreenPos: null,
  bulletTimeActive: false,
  bulletTimeRemaining: 0,
  activeSlot: 1,
  slots: [
    { keyLabel: '1', name: null, level: 0 },
    { keyLabel: '2', name: null, level: 0 },
    { keyLabel: '3', name: null, level: 0 },
  ],
  domeBounceFlash: 0,
  impactFlash: 0,
  cameraRollDeg: 0,
  gyroSpinRad: 0,
};

export default function DomeGameView({ settings, onExit, trainingMode }: DomeGameViewProps) {
  const training = trainingMode ?? false;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const controllerRef = useRef<NyxDomeController | null>(null);
  const audioRef = useRef<SynthAudio | null>(null);
  const progressionRef = useRef<DomeProgressionManager | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const [runSeed, setRunSeed] = useState(0);
  const [hud, setHud] = useState<DomeHudState>(INITIAL_HUD);
  const [levelUpState, setLevelUpState] = useState<{
    isOpen: boolean;
    newLevel: number;
    choices: [LevelUpCardOption, LevelUpCardOption] | null;
    requiresSlotReplacement: boolean;
  }>({ isOpen: false, newLevel: 1, choices: null, requiresSlotReplacement: false });
  const levelUpOpenRef = useRef(false);
  levelUpOpenRef.current = levelUpState.isOpen;

  const [battleReport, setBattleReport] = useState<DomeBattleReportData | null>(null);
  const battleReportOpenRef = useRef(false);
  battleReportOpenRef.current = battleReport !== null;
  const runTrackerRef = useRef<DomeRunTracker | null>(null);

  const [isPauseOpen, setIsPauseOpen] = useState(false);
  const pauseOpenRef = useRef(false);
  pauseOpenRef.current = isPauseOpen;
  // Recuerda si el jugador ya bloqueó el ratón en esta run: permite abrir la
  // pausa desde pointerlockchange aunque el navegador consuma la tecla ESC.
  const hadPointerLockRef = useRef(false);

  // --- Modo Entrenamiento / Debug: panel flotante + puente hacia el loop ---
  const [debugPanelOpen, setDebugPanelOpen] = useState(false);
  const debugPanelOpenRef = useRef(false);
  debugPanelOpenRef.current = debugPanelOpen;
  const [trainingArchetype, setTrainingArchetype] = useState<EnemyArchetype>('abyssal_cell');
  const [trainingPassive, setTrainingPassive] = useState(false);
  const [trainingPassiveLevels, setTrainingPassiveLevels] = useState<Record<PassiveId, number>>({
    speed_force: 0,
    eden_regen: 0,
    hp_regen: 0,
  });
  /** Espejo estable (sin re-render) de la selección actual del panel. */
  const trainingUiRef = useRef<{ archetype: EnemyArchetype; passive: boolean }>({
    archetype: 'abyssal_cell',
    passive: false,
  });
  /** Callbacks vivos dentro del useEffect del juego (solo en entrenamiento). */
  const trainingBridgeRef = useRef<{
    setEnemyArchetype: (archetype: EnemyArchetype) => void;
    respawnEnemy: () => void;
    setEnemyPassive: (passive: boolean) => void;
    equipSkill: (slot: 0 | 1 | 2, skillId: ActiveSkillId) => void;
    clearSlot: (slot: 0 | 1 | 2) => void;
    upgradeSlot: (slot: 0 | 1 | 2) => void;
    setPassiveLevel: (id: PassiveId, level: number) => void;
    refillResources: () => void;
  } | null>(null);

  useEffect(() => {
    controllerRef.current?.applySettings(settings);
    audioRef.current?.setVolumeMultiplier(settings.masterVolume);
  }, [settings]);

  const handleSelectCard = useCallback(
    (option: FluidCardOption, replaceSlotIndex?: 0 | 1 | 2) => {
      const prog = progressionRef.current;
      const choices = levelUpState.choices;
      if (!prog || !choices) return;
      const fullOption = choices.find((c) => c.id === option.id) ?? choices[0];
      prog.applyChoice(fullOption, replaceSlotIndex);
      setLevelUpState({ isOpen: false, newLevel: prog.level, choices: null, requiresSlotReplacement: false });
      const canvas = canvasRef.current;
      if (canvas && document.pointerLockElement !== canvas) {
        canvas.requestPointerLock?.();
      }
    },
    [levelUpState.choices],
  );

  const handlePlayAgain = useCallback(() => {
    setBattleReport(null);
    setHud(INITIAL_HUD);
    setRunSeed((s) => s + 1);
  }, []);

  const handlePauseResume = useCallback(() => {
    setIsPauseOpen(false);
    canvasRef.current?.requestPointerLock?.();
  }, []);

  const handlePauseRestart = useCallback(() => {
    setIsPauseOpen(false);
    hadPointerLockRef.current = false;
    setRunSeed((s) => s + 1);
  }, []);

  // --- Handlers del panel de entrenamiento (mutan el juego vía el puente) ---
  const handleTrainingSetArchetype = useCallback((archetype: EnemyArchetype) => {
    trainingUiRef.current.archetype = archetype;
    setTrainingArchetype(archetype);
    trainingBridgeRef.current?.setEnemyArchetype(archetype);
  }, []);

  const handleTrainingRespawn = useCallback(() => {
    trainingBridgeRef.current?.respawnEnemy();
  }, []);

  const handleTrainingSetPassive = useCallback((passive: boolean) => {
    trainingUiRef.current.passive = passive;
    setTrainingPassive(passive);
    trainingBridgeRef.current?.setEnemyPassive(passive);
  }, []);

  const handleTrainingEquipSkill = useCallback((slot: 0 | 1 | 2, skillId: ActiveSkillId) => {
    trainingBridgeRef.current?.equipSkill(slot, skillId);
  }, []);

  const handleTrainingClearSlot = useCallback((slot: 0 | 1 | 2) => {
    trainingBridgeRef.current?.clearSlot(slot);
  }, []);

  const handleTrainingUpgradeSlot = useCallback((slot: 0 | 1 | 2) => {
    trainingBridgeRef.current?.upgradeSlot(slot);
  }, []);

  const handleTrainingSetPassiveLevel = useCallback((id: PassiveId, level: number) => {
    setTrainingPassiveLevels((prev) => ({ ...prev, [id]: level }));
    trainingBridgeRef.current?.setPassiveLevel(id, level);
  }, []);

  const handleTrainingRefill = useCallback(() => {
    trainingBridgeRef.current?.refillResources();
  }, []);

  const handleSubmitScore = useCallback(async (playerName: string) => {
    const tracker = runTrackerRef.current;
    const prog = progressionRef.current;
    if (!tracker || !prog) return false;
    const equipped = prog.slots
      .filter((s) => s.skillId !== null)
      .map((s) => ({ id: s.skillId as string, level: s.level }));
    const summary = tracker.getSummary(equipped, prog.passives);
    const saved = await submitDomeRunToLeaderboard(summary, playerName);
    return saved !== null;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

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
          const activeCanvas = canvasRef.current;
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
  }, [runSeed, training]);

  // Ranuras en vivo para el panel de entrenamiento (se refresca con el HUD a ~30 Hz).
  const trainingSlots: TrainingSlotInfo[] = [0, 1, 2].map((index) => {
    const slot = progressionRef.current?.slots[index];
    const skillId = slot?.skillId ?? null;
    return {
      keyLabel: String(index + 1),
      skillId,
      level: slot?.level ?? 0,
      maxLevel: skillId ? ACTIVE_SKILLS_CATALOG[skillId].maxLevel : 0,
    };
  });

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#040510]">
      <canvas ref={canvasRef} className="block h-full w-full cursor-none" />
      <DomeHudSketch
        hud={hud}
        onExit={onExit}
        hidePointerLockPrompt={levelUpState.isOpen || battleReport !== null || isPauseOpen || (training && debugPanelOpen)}
      />
      {training && (debugPanelOpen || isPauseOpen) && (
        <DomeTrainingPanel
          archetype={trainingArchetype}
          passive={trainingPassive}
          slots={trainingSlots}
          passiveLevels={trainingPassiveLevels}
          onSetArchetype={handleTrainingSetArchetype}
          onRespawn={handleTrainingRespawn}
          onSetPassive={handleTrainingSetPassive}
          onEquipSkill={handleTrainingEquipSkill}
          onClearSlot={handleTrainingClearSlot}
          onUpgradeSlot={handleTrainingUpgradeSlot}
          onSetPassiveLevel={handleTrainingSetPassiveLevel}
          onRefill={handleTrainingRefill}
        />
      )}
      <DomePauseModal
        isOpen={isPauseOpen}
        waveNumber={hud.waveNumber}
        waveLabel={hud.waveLabel}
        level={hud.level}
        onResume={handlePauseResume}
        onRestart={handlePauseRestart}
        onExitToMenu={onExit}
      />
      <FluidLevelUpModal
        isOpen={levelUpState.isOpen}
        newLevel={levelUpState.newLevel}
        choices={levelUpState.choices}
        equippedSlots={hud.slots.map((s) => ({ name: s.name, level: s.level }))}
        requiresSlotReplacement={levelUpState.requiresSlotReplacement}
        onSelect={handleSelectCard}
      />
      {battleReport && (
        <DomeBattleReport
          data={battleReport}
          onPlayAgain={handlePlayAgain}
          onExitToMenu={onExit}
          onSubmitScore={handleSubmitScore}
        />
      )}
    </div>
  );
}
