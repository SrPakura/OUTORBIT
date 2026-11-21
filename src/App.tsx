import { useCallback, useEffect, useRef, useState } from 'react';
import { GameEngine } from '@/game/GameEngine';
import type { HudSnapshot } from '@/game/types';
import MobileBlocker from '@/ui/MobileBlocker';
import TitleScreen from '@/ui/TitleScreen';
import GameHUD from '@/ui/GameHUD';

type Screen = 'title' | 'game';

/**
 * Punto de entrada UI: monta el canvas del GameEngine, suscribe el HudSnapshot
 * (emitido a ~15 Hz) y alterna entre portada y partida.
 */
export default function App() {
  const [screen, setScreen] = useState<Screen>('title');
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
  }, [screen]);

  const handleResume = useCallback(() => {
    engineRef.current?.resume();
  }, []);

  const handleExitToTitle = useCallback(() => {
    setScreen('title');
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
            />
          )}
        </div>
      )}
    </div>
  );
}
