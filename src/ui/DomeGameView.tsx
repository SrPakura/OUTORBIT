import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { createDomeArenaBackdrop } from '@/game/render/domeArenaScene';
import { loadNyxRigged, type LoadedNyx } from '@/game/render/nyxModelLoader';
import { DomeFloatingSlabManager } from '@/game/dome/DomeFloatingSlabs';
import { DomeSphereTileManager } from '@/game/dome/DomeSphereTiles';
import { DomeWaveManager, type ManagedWaveEnemy, type WaveFloorMode } from '@/game/dome/DomeWaveManager';
import { MotionVfxSystem } from '@/game/dome/MotionVfx';
import { NyxDomeController } from '@/game/dome/NyxDomeController';
import {
  ACTIVE_SKILLS_CATALOG,
  DomeProgressionManager,
  type LevelUpCardOption,
} from '@/game/dome/DomeProgression';
import { DomePickupManager } from '@/game/dome/DomePickups';
import { DomeSkillExecutor, type SkillTargetEnemy } from '@/game/dome/DomeSkills';
import { DomeCombatSystem } from '@/game/dome/DomeCombatSystem';
import { DomeRunTracker, submitDomeRunToLeaderboard } from '@/game/dome/DomeRunStats';
import { DOME_PLAYER_BOUND_RADIUS, type DomeHudState, type SlabCollider } from '@/game/dome/domeTypes';
import type { GameSettings } from '@/game/settings';
import { SynthAudio } from '@/game/audio/SynthAudio';
import DomeHudSketch from '@/ui/DomeHudSketch';
import FluidLevelUpModal, { type FluidCardOption } from '@/ui/FluidLevelUpModal';
import DomeBattleReport, { type DomeBattleReportData } from '@/ui/DomeBattleReport';

interface DomeGameViewProps {
  settings: GameSettings;
  onExit: () => void;
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

export default function DomeGameView({ settings, onExit }: DomeGameViewProps) {
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

    waveMgr.startWave(1);
    runTracker.recordWave(1);
    applyFloorMode(waveMgr.getWaveInfo().floorMode);
    let nextWaveDelay = 0;
    let activeSlabs: SlabCollider[] = [];

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
        );
        controller.onDomeBounceDamage = () => {
          combat.applyDomeBarrierDamageToNyx();
        };
        controller.onRedirectionSuccess = () => {
          runTracker.recordRedirection();
        };
        controller.onSlotTriggered = (slotIdx) => {
          if (levelUpOpenRef.current || battleReportOpenRef.current || !controller) return;
          const slot = progression.slots[slotIdx];
          if (!slot.skillId || slot.cooldownRemaining > 0) return;
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
            slot.cooldownRemaining = def.cooldown;
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
      controller?.onKeyDown(e.code);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      controller?.onKeyUp(e.code);
    };

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight, false);
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

      const isPaused = levelUpOpenRef.current || battleReportOpenRef.current;
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
        const mods = progression.getModifiers();
        const playerStatus = combat.updatePlayerStatus(effRawDt);
        if (playerStatus.inkDamageThisFrame > 0) {
          controller.applyDamage(playerStatus.inkDamageThisFrame);
        }

        // Suelos activos según oleada (flotantes arrancados en básicas / triángulos de esfera en Miniboss y Boss).
        // Se pasa la posición y dirección de la cámara para que los suelos
        // reciclados re-entren desde fuera del campo de visión del jugador.
        floatingSlabs.update(worldDt, elapsed, camera.position, controller.getAimForward());
        sphereTiles.update(worldDt, elapsed);
        activeSlabs = [...floatingSlabs.getActiveColliders(), ...sphereTiles.getActiveColliders()];

        const { didEnemyEvadeDash } = waveMgr.update(
          worldDt,
          elapsed,
          controller.getPosition(),
          controller.getLockedEnemy(),
          controller.getAttackAccelTime(),
          (dmg) => controller?.applyDamage(dmg),
          () => combat.applyOctopusInkAttack(),
        );
        if (didEnemyEvadeDash) {
          controller.notifyEnemyEvaded();
        }

        const activeEnemies = waveMgr.getActiveEnemies();

        // Regla de Barrera Blanca para enemigos
        for (const enemy of activeEnemies) {
          if (!enemy.entity.alive) continue;
          if (combat.checkDomeBarrierKill(enemy.entity, DOME_PLAYER_BOUND_RADIUS)) {
            killWaveEnemy(enemy, true);
          }
        }

        // Avance automático al completar oleada
        if (waveMgr.getActiveEnemies().length === 0) {
          if (nextWaveDelay <= 0) nextWaveDelay = 1.6;
          else {
            nextWaveDelay -= worldDt;
            if (nextWaveDelay <= 0) {
              const nextWave = waveMgr.getWaveInfo().wave + 1;
              waveMgr.startWave(nextWave);
              runTracker.recordWave(nextWave);
              applyFloorMode(waveMgr.getWaveInfo().floorMode);
            }
          }
        } else {
          nextWaveDelay = 0;
        }

        // Actualizar habilidades activas (agujero negro, ondas, pozo de atracción)
        skillExecutor.update(worldDt, waveMgr.getActiveEnemies(), handleSkillDamageEnemy);

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
        // Sincronizar estadísticas/slots con NyxDomeController
        controller.syncProgression({
          level: progression.level,
          exp: progression.exp,
          expToNext: progression.expToNext,
          maxHp: progression.maxHp,
          maxEden: progression.maxEden,
          speedMultiplier: mods.speedMultiplier,
          edenRegenFrac: mods.edenRegenPctPerSec,
          hpRegenFrac: mods.hpRegenPctPerSec,
          inkOverlayIntensity: playerStatus.inkIntensity,
          waveNumber: waveInfo.wave,
          waveLabel: waveInfo.label,
          slots: [
            {
              name: progression.slots[0].skillId ? ACTIVE_SKILLS_CATALOG[progression.slots[0].skillId].name : null,
              level: progression.slots[0].level,
              cooldownRemaining: progression.slots[0].cooldownRemaining,
              maxCooldown: progression.slots[0].maxCooldown,
            },
            {
              name: progression.slots[1].skillId ? ACTIVE_SKILLS_CATALOG[progression.slots[1].skillId].name : null,
              level: progression.slots[1].level,
              cooldownRemaining: progression.slots[1].cooldownRemaining,
              maxCooldown: progression.slots[1].maxCooldown,
            },
            {
              name: progression.slots[2].skillId ? ACTIVE_SKILLS_CATALOG[progression.slots[2].skillId].name : null,
              level: progression.slots[2].level,
              cooldownRemaining: progression.slots[2].cooldownRemaining,
              maxCooldown: progression.slots[2].maxCooldown,
            },
          ],
        });

        controller.update(
          effRawDt,
          activeSlabs,
          camera,
          waveMgr.getActiveEnemies(),
          (enemy, hitDir, isDrill, impactSpeed) => {
            waveMgr.onHitEnemy(enemy, hitDir, isDrill, impactSpeed);
            const managed = waveMgr.getActiveEnemies().find((e) => e.id === enemy.id);
            if (managed && managed.entity.alive) {
              const res = combat.computeKineticImpact(
                managed.entity,
                impactSpeed ?? 14,
                mods.forceMultiplier,
                isDrill,
              );
              runTracker.recordDamage(res.damage);
              if (managed.entity.hp <= 0 || res.killed) {
                killWaveEnemy(managed, false);
              }
            }
          },
        );

        runTracker.tick(worldDt);
        runTracker.recordSpeed(controller.getCurrentSpeed());

        if (controller.getHp() <= 0 && !gameOverTriggered) {
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
  }, [runSeed]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#040510]">
      <canvas ref={canvasRef} className="block h-full w-full cursor-none" />
      <DomeHudSketch
        hud={hud}
        onExit={onExit}
        hidePointerLockPrompt={levelUpState.isOpen || battleReport !== null}
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
