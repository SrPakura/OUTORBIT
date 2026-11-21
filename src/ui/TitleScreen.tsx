import { useEffect, useRef, useState } from 'react';
import type { GameSettings } from '@/game/settings';
import type { TutorialId } from '@/game/levels/tutorialDefinitions';
import { TitleDioramaSandbox } from '@/ui/TitleDioramaSandbox';
import ControlsModal from '@/ui/ControlsModal';
import LeaderboardModal from '@/ui/LeaderboardModal';

type MenuModal = 'controls' | 'leaderboard' | null;

interface TitleScreenProps {
  onPlay: () => void;
  /** PASO B: lanza un mini-tutorial jugable desde la portada. */
  onPlayTutorial?: (id: TutorialId) => void;
  /** Ajustes persistentes (Controles) compartidos con el GameEngine. */
  settings: GameSettings;
  onUpdateSettings: (settings: GameSettings) => void;
}

/**
 * Portada de OUTORBIT: blade astral diagonal con shader líquido, logotipo 3D
 * extruido con shader propio, diorama de gravedad cero sobre el cosmos y los
 * dos modales funcionales (Controles y Leaderboard).
 */
export default function TitleScreen({
  onPlay,
  settings,
  onUpdateSettings,
}: TitleScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sandboxRef = useRef<TitleDioramaSandbox | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const [modal, setModal] = useState<MenuModal>(null);

  // Montaje único del runtime WebGL (el sandbox se reconstruye solo al salir).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const sandbox = new TitleDioramaSandbox({ canvas, settings: settingsRef.current });
    sandboxRef.current = sandbox;
    return () => {
      sandbox.dispose();
      sandboxRef.current = null;
    };
  }, []);

  // Ajustes en vivo: bindings del sandbox + trama halftone del cosmos.
  useEffect(() => {
    sandboxRef.current?.setSettings(settings);
  }, [settings]);

  // Ningún modal abierto puede robar el teclado al diorama.
  useEffect(() => {
    sandboxRef.current?.setControlsSuspended(modal !== null);
  }, [modal]);

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#05010f]">
      {/* --- Diorama 3D jugable (fondo, sin capturar clics) --- */}
      <canvas
        ref={canvasRef}
        className="pointer-events-none fixed inset-0 h-full w-full"
        aria-hidden="true"
      />

      {/* --- Logotipo 2D limpio y pila de menú dentro del blade izquierdo --- */}
      <div className="absolute left-[3.5%] top-[14%] z-10 flex w-[25%] min-w-[230px] max-w-[380px] flex-col gap-7">
        <header className="select-none">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="-skew-x-12 bg-white px-2 py-0.5 text-[10px] font-black tracking-[0.2em] text-[#090314]">
              ZERO-G ROGUELITE
            </span>
            <span className="h-[2px] flex-1 bg-gradient-to-r from-cyan-400/80 to-transparent" />
          </div>
          <h1 className="-skew-x-12 text-5xl font-black italic tracking-[-0.03em] text-white drop-shadow-[4px_4px_0_#e11d48] sm:text-6xl">
            OUT<span className="text-cyan-300">ORBIT</span>
          </h1>
        </header>

        <nav className="flex flex-col gap-3">
          <button
            type="button"
            onClick={onPlay}
            className="group relative -skew-x-12 cursor-pointer border-2 border-white px-6 py-3.5 text-left shadow-[6px_6px_0_#000000] transition-transform hover:-translate-y-0.5 active:translate-y-0 active:shadow-[3px_3px_0_#000000]"
            style={{
              backgroundImage: 'linear-gradient(100deg, #7e22ce 0%, #e11d48 55%, #f43f5e 100%)',
            }}
          >
            <span className="block skew-x-12 text-2xl font-black italic tracking-[0.18em] text-white">
              JUGAR
            </span>
          </button>

          <button
            type="button"
            onClick={() => setModal('controls')}
            className="-skew-x-12 cursor-pointer border-2 border-white/80 bg-white/10 px-4 py-2.5 text-left text-white shadow-[5px_5px_0_#000000] backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-cyan-300 hover:bg-white/20 active:translate-y-0"
          >
            <span className="block skew-x-12 text-sm font-black italic uppercase tracking-[0.1em]">
              Modificar controles
            </span>
          </button>

          <button
            type="button"
            onClick={() => setModal('leaderboard')}
            className="-skew-x-12 cursor-pointer border-2 border-white/80 bg-white/10 px-4 py-2.5 text-left text-white shadow-[5px_5px_0_#000000] backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-cyan-300 hover:bg-white/20 active:translate-y-0"
          >
            <span className="block skew-x-12 text-sm font-black italic uppercase tracking-[0.1em]">
              Leaderboard
            </span>
          </button>
        </nav>
      </div>

      {/* --- Crédito discreto abajo a la izquierda --- */}
      <p className="absolute bottom-4 left-4 z-10 text-[11px] font-semibold tracking-[0.08em] text-white/70">
        hecho por srpakura
      </p>

      {/* --- Etiqueta minimalista del roguelite de gravedad cero --- */}
      <p className="absolute bottom-14 right-4 z-10 text-[10px] font-black uppercase tracking-[0.22em] text-cyan-200/70">
        NYX // ZERO-G GRAVITY ROGUELITE
      </p>

      {modal === 'controls' && (
        <ControlsModal
          settings={settings}
          onClose={() => setModal(null)}
          onSaveSettings={onUpdateSettings}
        />
      )}

      {modal === 'leaderboard' && <LeaderboardModal onClose={() => setModal(null)} />}
    </div>
  );
}
