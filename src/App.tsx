import { useCallback, useEffect, useRef, useState } from 'react';
import { GameEngine } from '@/game/GameEngine';
import type { HudSnapshot } from '@/game/types';
import MobileBlocker from '@/ui/MobileBlocker';
import TitleScreen from '@/ui/TitleScreen';
import GameHUD from '@/ui/GameHUD';
import LevelTransitionModal from '@/ui/LevelTransitionModal';
import BattleReportScreen from '@/ui/BattleReportScreen';

type Screen = 'title' | 'game';

/**
 * Punto de entrada UI: monta el canvas del GameEngine, suscribe el HudSnapshot
 * (emitido a ~15 Hz) y alterna entre portada y partida. Al derrotar a KRONOS
 * (phase === 'victory') muestra el Battle Report con el leaderboard Base44;
 * JUGAR DE NUEVO reinicia la run completa (engine nuevo y limpio).
 */
export default function App() {
  const [screen, setScreen] = useState<Screen>('title');
  const [runKey, setRunKey] = useState(0);
  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);

  useEffect(() => {
    if (screen !== 'game') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new GameEngine(canvas, setHud);
    engineRef.current = engine;
    engine.start();
    return () => {
      engine.dispose();
      engineRef.current = null;
      setHud(null);
    };
  }, [screen, runKey]);

  const handleResume = useCallback(() => {
    engineRef.current?.resume();
  }, []);

  const handleExitToTitle = useCallback(() => {
    setScreen('title');
  }, []);

  const handleDeployNextPlanet = useCallback(() => {
    engineRef.current?.advanceToNextPlanet();
  }, []);

  const handleToggleMute = useCallback(() => {
    engineRef.current?.toggleMute();
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
        <TitleScreen onPlay={() => setScreen('game')} />
      ) : (
        <div className="relative h-screen w-screen overflow-hidden">
          <canvas ref={canvasRef} className="block h-full w-full" />
          {hud && (
            <GameHUD
              snapshot={hud}
              onResume={handleResume}
              onExitToTitle={handleExitToTitle}
              onToggleMute={handleToggleMute}
            />
          )}
          {hud && hud.phase === 'planet_transition' && (
            <LevelTransitionModal snapshot={hud} onDeploy={handleDeployNextPlanet} />
          )}
          {hud && hud.phase === 'victory' && (
            <BattleReportScreen
              snapshot={hud}
              onPlayAgain={handlePlayAgain}
              onExitToTitle={handleExitToTitle}
            />
          )}
        </div>
      )}
    </div>
  );
}
