import { useCallback, useEffect, useRef, useState } from 'react';
import { GameEngine } from '@/game/GameEngine';
import type { HudSnapshot } from '@/game/types';
import { TUTORIAL_SPECS, type TutorialId } from '@/game/levels/tutorialDefinitions';
import { loadGameSettings, saveGameSettings, type GameSettings } from '@/game/settings';
import MobileBlocker from '@/ui/MobileBlocker';
import TitleScreen from '@/ui/TitleScreen';
import GameHUD from '@/ui/GameHUD';
import BattleReportScreen from '@/ui/BattleReportScreen';
import DomeArenaPreview from '@/ui/DomeArenaPreview';

type Screen = 'title' | 'game';

/**
 * Punto de entrada UI: monta el canvas del GameEngine, suscribe el HudSnapshot
 * (emitido a ~15 Hz) y alterna entre portada y partida. Al derrotar a KRONOS
 * (phase === 'victory') muestra el Battle Report con el leaderboard Base44;
 * JUGAR DE NUEVO reinicia la run completa (engine nuevo y limpio).
 *
 * PASO B: `activeTutorialId` decide qué se carga — `null` lanza la campaña de
 * 5 planetas y un id lanza ese mini-tutorial. Cada cambio de tutorial (o
 * reintento) incrementa `runKey`, que remonta el engine desde cero.
 *
 * PASO C: `settings` es la única fuente de verdad de los ajustes persistentes
 * (Controles). Se inicializa desde `localStorage`, se guarda al aplicar y se
 * propaga en vivo al diorama de la portada y al GameEngine.
 */
export default function App() {
  const [screen, setScreen] = useState<Screen>('title');
  const [activeTutorialId, setActiveTutorialId] = useState<TutorialId | null>(null);
  const [runKey, setRunKey] = useState(0);
  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [settings, setSettings] = useState<GameSettings>(() => loadGameSettings());
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    if (screen !== 'game' || !activeTutorialId) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new GameEngine(canvas, setHud, { tutorialId: activeTutorialId });
    engineRef.current = engine;
    engine.applySettings(settingsRef.current);
    engine.unlockAudio(); // montaje tras JUGAR: crea el AudioContext cuanto antes
    engine.start();
    return () => {
      engine.dispose();
      engineRef.current = null;
      setHud(null);
    };
  }, [screen, runKey, activeTutorialId]);

  // Ajustes en vivo: cualquier cambio en Controles se aplica a la partida.
  useEffect(() => {
    engineRef.current?.applySettings(settings);
  }, [settings]);

  /** Guarda en localStorage y propaga a la portada y al engine. */
  const handleUpdateSettings = useCallback((next: GameSettings) => {
    saveGameSettings(next);
    setSettings(next);
  }, []);

  const handleResume = useCallback(() => {
    engineRef.current?.resume();
  }, []);

  const handleExitToTitle = useCallback(() => {
    setScreen('title');
    setActiveTutorialId(null);
  }, []);

  const handleToggleMute = useCallback(() => {
    engineRef.current?.toggleMute();
  }, []);

  /** JUGAR: campaña completa de 5 planetas (sin tutorial). */
  const handlePlay = useCallback(() => {
    setHud(null);
    setActiveTutorialId(null);
    setScreen('game');
    setRunKey((key) => key + 1);
  }, []);

  /** JUGAR TUTORIAL: carga el mini-nivel pedido con su personaje recomendado. */
  const handlePlayTutorial = useCallback((id: TutorialId) => {
    setHud(null);
    setActiveTutorialId(id);
    setScreen('game');
    setRunKey((key) => key + 1);
  }, []);

  /** SIGUIENTE TUTORIAL: avanza en el catálogo (no-op si ya es el último). */
  const handleNextTutorial = useCallback(() => {
    const index = TUTORIAL_SPECS.findIndex((spec) => spec.id === activeTutorialId);
    const next = index >= 0 ? TUTORIAL_SPECS[index + 1] : undefined;
    if (!next) return;
    setHud(null);
    setActiveTutorialId(next.id);
    setRunKey((key) => key + 1);
  }, [activeTutorialId]);

  /** REINTENTAR: recarga el tutorial activo desde el principio. */
  const handleRestartTutorial = useCallback(() => {
    setHud(null);
    setRunKey((key) => key + 1);
  }, []);

  /** JUGAR DE NUEVO (Battle Report): run limpia desde el Prólogo. */
  const handlePlayAgain = useCallback(() => {
    setHud(null);
    setRunKey((key) => key + 1);
  }, []);

  return (
    <div className="relative min-h-screen bg-[#05010f]">
      <MobileBlocker />

      {screen === 'title' ? (
        <TitleScreen
          onPlay={handlePlay}
          onPlayTutorial={handlePlayTutorial}
          settings={settings}
          onUpdateSettings={handleUpdateSettings}
        />
      ) : activeTutorialId ? (
        <div className="relative h-screen w-screen overflow-hidden">
          <canvas ref={canvasRef} className="block h-full w-full" />
          {hud && (
            <GameHUD
              snapshot={hud}
              onResume={handleResume}
              onExitToTitle={handleExitToTitle}
              onToggleMute={handleToggleMute}
              onNextTutorial={handleNextTutorial}
              onRestartTutorial={handleRestartTutorial}
            />
          )}
          {hud && hud.phase === 'victory' && !hud.tutorialId && (
            <BattleReportScreen
              snapshot={hud}
              onPlayAgain={handlePlayAgain}
              onExitToTitle={handleExitToTitle}
            />
          )}
        </div>
      ) : (
        <DomeArenaPreview onExit={handleExitToTitle} />
      )}
    </div>
  );
}
