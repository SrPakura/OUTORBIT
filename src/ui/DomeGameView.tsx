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
import { SynthAudio } from '@/game/audio/SynthAudio';
import { musicPlayer } from '@/game/audio/MusicPlayer';
import { NyxDomeController } from '@/game/dome/NyxDomeController';
import { startDomeGameLoop, type DomeLevelUpUiState, type DomeTrainingBridge } from '@/ui/domeGameLoop';
import DomeHudSketch from '@/ui/DomeHudSketch';
import DomeLevelUpSequence from '@/ui/DomeLevelUpSequence';
import SettingsScreen from '@/ui/SettingsScreen';
import DomeBattleReport, { type DomeBattleReportData } from '@/ui/DomeBattleReport';
import DomePauseModal from '@/ui/DomePauseModal';
import DomeTrainingPanel, { type TrainingSlotInfo } from '@/ui/DomeTrainingPanel';

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
      setLevelUpState({
        isOpen: false,
        newLevel: prog.level,
        choices: null,
        requiresSlotReplacement: false,
        openId: levelUpState.openId,
      });
      const canvas = canvasRef.current;
      if (canvas && document.pointerLockElement !== canvas) {
        canvas.requestPointerLock?.();
      }
    },
    [levelUpState.choices, levelUpState.openId],
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
      hadPointerLockRef,
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
      <canvas ref={canvasRef} className="block h-full w-full cursor-none" />
      <DomeHudSketch
        hud={hud}
        onExit={onExit}
        hidePointerLockPrompt={levelUpState.isOpen || battleReport !== null || isPauseOpen || (training && debugPanelOpen)}
        audioRef={audioRef}
        alertsEnabled={!isPauseOpen && !levelUpState.isOpen && battleReport === null}
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
        onRestart={handlePauseRestart}
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
        key={`${levelUpState.newLevel}-${levelUpState.openId}`}
        isOpen={levelUpState.isOpen}
        newLevel={levelUpState.newLevel}
        choices={levelUpState.choices}
        equippedSlots={hud.slots.map((s) => ({ name: s.name, level: s.level }))}
        requiresSlotReplacement={levelUpState.requiresSlotReplacement}
        skipPlanetAnimation={levelUpState.skipPlanetAnimation}
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
    </div>
  );
}
