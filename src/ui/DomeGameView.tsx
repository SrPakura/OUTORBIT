import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ACTIVE_SKILLS_CATALOG,
  DomeProgressionManager,
  type ActiveSkillId,
  type LevelUpCardOption,
  type PassiveId,
} from '@/game/dome/DomeProgression';
import type { EnemyArchetype } from '@/game/dome/DomeCombatSystem';
import { DomeRunTracker, submitDomeRunToLeaderboard } from '@/game/dome/DomeRunStats';
import type { DomeHudState } from '@/game/dome/domeTypes';
import type { GameSettings } from '@/game/settings';
import {
  loadTutorialProgress,
  setTutorialCompleted,
  type TutorialProgressId,
} from '@/game/localStorageState';
import { SynthAudio } from '@/game/audio/SynthAudio';
import { musicPlayer } from '@/game/audio/MusicPlayer';
import { isGamepadPreferred } from '@/game/input/GamepadInput';
import { NyxDomeController } from '@/game/dome/NyxDomeController';
import { startDomeGameLoop, type DomeLevelUpUiState, type DomeTrainingBridge } from '@/ui/domeGameLoop';
import DomeDarkMatterRings from '@/ui/DomeDarkMatterRings';
import DomeHudSketch from '@/ui/DomeHudSketch';
import DomeLevelUpSequence from '@/ui/DomeLevelUpSequence';
import SettingsScreen from '@/ui/SettingsScreen';
import DomeBattleReport, { type DomeBattleReportData } from '@/ui/DomeBattleReport';
import DomePauseModal from '@/ui/DomePauseModal';
import DomeTrainingPanel, { type TrainingSlotInfo } from '@/ui/DomeTrainingPanel';
import DomeTutorialCard from '@/ui/DomeTutorialCard';

interface DomeGameViewProps {
  settings: GameSettings;
  onExit: () => void;
  /** Aplica y persiste los ajustes al instante (vive en App.tsx). */
  onUpdateSettings: (settings: GameSettings) => void;
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
  parryStarHovered: false,
  kineticBounceState: 'none',
  lockedEnemyScreenPos: null,
  bulletTimeActive: false,
  bulletTimeRemaining: 0,
  activeSlot: 1,
  slots: [
    { keyLabel: '1', skillId: null, name: null, level: 0 },
    { keyLabel: '2', skillId: null, name: null, level: 0 },
    { keyLabel: '3', skillId: null, name: null, level: 0 },
  ],
  domeBounceFlash: 0,
  impactFlash: 0,
  cameraRollDeg: 0,
  gyroSpinRad: 0,
  edenFlash: 0,
};

export default function DomeGameView({ settings, onExit, onUpdateSettings, trainingMode }: DomeGameViewProps) {
  const training = trainingMode ?? false;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const controllerRef = useRef<NyxDomeController | null>(null);
  const audioRef = useRef<SynthAudio | null>(null);
  const progressionRef = useRef<DomeProgressionManager | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const [runSeed, setRunSeed] = useState(0);
  const [hud, setHud] = useState<DomeHudState>(INITIAL_HUD);
  const [levelUpState, setLevelUpState] = useState<DomeLevelUpUiState>({
    isOpen: false,
    newLevel: 1,
    pendingLevels: [],
    choices: null,
    requiresSlotReplacement: false,
    openId: 0,
  });
  const levelUpOpenRef = useRef(false);
  levelUpOpenRef.current = levelUpState.isOpen;

  const [battleReport, setBattleReport] = useState<DomeBattleReportData | null>(null);
  const battleReportOpenRef = useRef(false);
  battleReportOpenRef.current = battleReport !== null;
  const runTrackerRef = useRef<DomeRunTracker | null>(null);

  const [isPauseOpen, setIsPauseOpen] = useState(false);
  const pauseOpenRef = useRef(false);
  pauseOpenRef.current = isPauseOpen;
  // Pantalla de ajustes abierta desde la pausa (la pausa sigue debajo).
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsOpenRef = useRef(false);
  settingsOpenRef.current = settingsOpen;
  // Tutorial inicial de movimiento (una sola vez por jugador salvo reset).
  const [activeTutorial, setActiveTutorial] = useState<TutorialProgressId | null>(() => {
    if (training) return null;
    const progress = loadTutorialProgress();
    const mov = progress.find((entry) => entry.id === 'tutorial_de_movimiento');
    return mov && !mov.completed ? 'tutorial_de_movimiento' : null;
  });
  const tutorialOpenRef = useRef(false);
  tutorialOpenRef.current = activeTutorial !== null;
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
  const trainingBridgeRef = useRef<DomeTrainingBridge | null>(null);
  /**
   * Contador de re-render para el panel de entrenamiento: equipar/+Nv/vaciar
   * solo mutan `progression` (fuera de React) y, con la pausa abierta, el loop
   * congela el `setHud` a 30 Hz, así que sin este bump el panel seguiría
   * mostrando los valores anteriores hasta cerrar y reabrir la pausa.
   */
  const [, setTrainingPanelRev] = useState(0);

  useEffect(() => {
    controllerRef.current?.applySettings(settings);
    audioRef.current?.setVolumeMultiplier(settings.masterVolume * settings.sfxVolume);
    musicPlayer.setVolumeMultiplier(settings.masterVolume * settings.musicVolume);
  }, [settings]);

  const handleSelectCard = useCallback(
    (option: LevelUpCardOption, replaceSlotIndex?: 0 | 1 | 2) => {
      const prog = progressionRef.current;
      const choices = levelUpState.choices;
      if (!prog || !choices) return;
      const fullOption = choices.find((c) => c.id === option.id) ?? choices[0];
      prog.applyChoice(fullOption, replaceSlotIndex);
      if (fullOption.kind === 'heal_hp') {
        const ctrl = controllerRef.current;
        if (ctrl) ctrl.restoreResources(ctrl.getMaxHp(), 0);
      } else if (fullOption.kind === 'heal_eden') {
        const ctrl = controllerRef.current;
        if (ctrl) ctrl.restoreResources(0, ctrl.getMaxEden());
      }

      const [nextLevel, ...restLevels] = levelUpState.pendingLevels;
      if (nextLevel !== undefined) {
        const nextChoices = prog.generateLevelUpChoices(nextLevel);
        const allSlotsFull = prog.slots.every((s) => s.skillId !== null);
        setLevelUpState({
          isOpen: true,
          newLevel: nextLevel,
          pendingLevels: restLevels,
          choices: nextChoices,
          requiresSlotReplacement: allSlotsFull,
          skipPlanetAnimation: true,
          openId: levelUpState.openId,
        });
        return;
      }

      setLevelUpState({
        isOpen: false,
        newLevel: prog.level,
        pendingLevels: [],
        choices: null,
        requiresSlotReplacement: false,
        openId: levelUpState.openId,
      });
      const canvas = canvasRef.current;
      if (canvas && !isGamepadPreferred() && document.pointerLockElement !== canvas) {
        Promise.resolve(canvas.requestPointerLock?.()).catch(() => undefined);
      }
    },
    [levelUpState.choices, levelUpState.openId, levelUpState.pendingLevels],
  );

  const handleRerollChoices = useCallback(() => {
    const prog = progressionRef.current;
    if (!prog || !levelUpState.isOpen) return;
    const nextChoices = prog.rerollLevelUpChoices(levelUpState.newLevel, levelUpState.choices);
    if (!nextChoices) return;
    setLevelUpState((prev) => ({
      ...prev,
      choices: nextChoices,
      skipPlanetAnimation: true,
    }));
  }, [levelUpState.choices, levelUpState.isOpen, levelUpState.newLevel]);

  const handlePlayAgain = useCallback(() => {
    setBattleReport(null);
    setLevelUpState((prev) => ({
      isOpen: false,
      newLevel: 1,
      pendingLevels: [],
      choices: null,
      requiresSlotReplacement: false,
      openId: prev.openId + 1,
    }));
    setHud(INITIAL_HUD);
    setRunSeed((s) => s + 1);
  }, []);

  const handlePauseResume = useCallback(() => {
    // Por si el navegador rechaza el requestPointerLock (cooldown tras un ESC
    // reciente): con la marca limpia, un unlock rezagado no puede reabrir la
    // pausa debajo del juego. Si el clic captura el ratón (lo normal),
    // onPointerLockChange vuelve a marcarla.
    hadPointerLockRef.current = false;
    setIsPauseOpen(false);
    if (!isGamepadPreferred()) {
      Promise.resolve(canvasRef.current?.requestPointerLock?.()).catch(() => undefined);
    }
  }, []);

  const handlePauseRestart = useCallback(() => {
    setIsPauseOpen(false);
    setBattleReport(null);
    setLevelUpState((prev) => ({
      isOpen: false,
      newLevel: 1,
      pendingLevels: [],
      choices: null,
      requiresSlotReplacement: false,
      openId: prev.openId + 1,
    }));
    setHud(INITIAL_HUD);
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
    setTrainingPanelRev((rev) => rev + 1);
  }, []);

  const handleTrainingClearSlot = useCallback((slot: 0 | 1 | 2) => {
    trainingBridgeRef.current?.clearSlot(slot);
    setTrainingPanelRev((rev) => rev + 1);
  }, []);

  const handleTrainingUpgradeSlot = useCallback((slot: 0 | 1 | 2) => {
    trainingBridgeRef.current?.upgradeSlot(slot);
    setTrainingPanelRev((rev) => rev + 1);
  }, []);

  const handleTrainingSetPassiveLevel = useCallback((id: PassiveId, level: number) => {
    setTrainingPassiveLevels((prev) => ({ ...prev, [id]: level }));
    trainingBridgeRef.current?.setPassiveLevel(id, level);
  }, []);

  const handleTrainingRefill = useCallback(() => {
    trainingBridgeRef.current?.refillResources();
  }, []);

  // Tutorial de rebotes: salta la primera vez que la mira se pone azul
  // (suficiente velocidad apuntando a un suelo o iceberg).
  useEffect(() => {
    if (
      training ||
      activeTutorial !== null ||
      isPauseOpen ||
      levelUpState.isOpen ||
      battleReport !== null ||
      hud.kineticBounceState !== 'available'
    ) {
      return;
    }
    const progress = loadTutorialProgress();
    const rebotes = progress.find((entry) => entry.id === 'tutorial_de_rebotes');
    if (rebotes && !rebotes.completed) {
      tutorialOpenRef.current = true;
      if (document.pointerLockElement) {
        document.exitPointerLock?.();
      }
      setActiveTutorial('tutorial_de_rebotes');
    }
  }, [
    training,
    activeTutorial,
    isPauseOpen,
    levelUpState.isOpen,
    battleReport,
    hud.kineticBounceState,
  ]);

  // Tutorial de slow-mo: salta la primera vez que el juego entra en cámara lenta.
  useEffect(() => {
    if (
      training ||
      activeTutorial !== null ||
      isPauseOpen ||
      levelUpState.isOpen ||
      battleReport !== null ||
      !hud.bulletTimeActive
    ) {
      return;
    }
    const progress = loadTutorialProgress();
    const slowMo = progress.find((entry) => entry.id === 'tutorial_de_slow_mo');
    if (slowMo && !slowMo.completed) {
      tutorialOpenRef.current = true;
      if (document.pointerLockElement) {
        document.exitPointerLock?.();
      }
      setActiveTutorial('tutorial_de_slow_mo');
    }
  }, [
    training,
    activeTutorial,
    isPauseOpen,
    levelUpState.isOpen,
    battleReport,
    hud.bulletTimeActive,
  ]);

  const handleFirstSkillUsed = useCallback(() => {
    if (
      training ||
      tutorialOpenRef.current ||
      pauseOpenRef.current ||
      levelUpOpenRef.current ||
      battleReportOpenRef.current
    ) {
      return;
    }
    const progress = loadTutorialProgress();
    const habilidades = progress.find((entry) => entry.id === 'tutorial_de_habilidades');
    if (habilidades && !habilidades.completed) {
      tutorialOpenRef.current = true;
      if (document.pointerLockElement) {
        document.exitPointerLock?.();
      }
      setActiveTutorial('tutorial_de_habilidades');
    }
  }, [training]);

  const handleDismissTutorial = useCallback(() => {
    if (activeTutorial) {
      setTutorialCompleted(activeTutorial, true);
    }
    setActiveTutorial(null);
    if (!isGamepadPreferred()) {
      Promise.resolve(canvasRef.current?.requestPointerLock?.()).catch(() => undefined);
    }
  }, [activeTutorial]);

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
    return startDomeGameLoop({
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
      settingsOpenRef,
      debugPanelOpenRef,
      tutorialOpenRef,
      hadPointerLockRef,
      onFirstSkillUsed: handleFirstSkillUsed,
    });
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
      <canvas key={runSeed} ref={canvasRef} className="block h-full w-full cursor-none" />
      {/* Aros de materia oscura: enemigos lejanos marcados en pantalla (bajo el HUD). */}
      <DomeDarkMatterRings controllerRef={controllerRef} />
      <DomeHudSketch
        hud={hud}
        hidePointerLockPrompt={
          levelUpState.isOpen ||
          battleReport !== null ||
          isPauseOpen ||
          activeTutorial !== null ||
          (training && debugPanelOpen)
        }
        audioRef={audioRef}
        alertsEnabled={!isPauseOpen && !levelUpState.isOpen && battleReport === null && activeTutorial === null}
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
        isOpen={isPauseOpen && !settingsOpen}
        waveNumber={hud.waveNumber}
        waveLabel={hud.waveLabel}
        level={hud.level}
        onResume={handlePauseResume}
        onOpenSettings={() => setSettingsOpen(true)}
        onRestart={training ? undefined : handlePauseRestart}
        onExitToMenu={onExit}
      />
      {settingsOpen && (
        <SettingsScreen
          settings={settings}
          onClose={() => setSettingsOpen(false)}
          onUpdateSettings={onUpdateSettings}
        />
      )}
      <DomeLevelUpSequence
        key={levelUpState.openId}
        isOpen={levelUpState.isOpen}
        newLevel={levelUpState.newLevel}
        hasNextLevel={levelUpState.pendingLevels.length > 0}
        choices={levelUpState.choices}
        equippedSlots={
          progressionRef.current
            ? progressionRef.current.slots.map((s) => ({
                skillId: s.skillId,
                name: s.skillId ? ACTIVE_SKILLS_CATALOG[s.skillId].name : null,
                level: s.level,
              }))
            : hud.slots.map((s) => ({ skillId: s.skillId, name: s.name, level: s.level }))
        }
        requiresSlotReplacement={levelUpState.requiresSlotReplacement}
        skipPlanetAnimation={levelUpState.skipPlanetAnimation}
        rerollsRemaining={progressionRef.current?.rerollsRemaining ?? 0}
        onReroll={handleRerollChoices}
        audioRef={audioRef}
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
      <DomeTutorialCard tutorialId={activeTutorial} onDismiss={handleDismissTutorial} />
    </div>
  );
}
