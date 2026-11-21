import { useEffect, useRef, useState } from 'react';
import { formatKeyCode, type GameSettings } from '@/game/settings';
import type { TutorialId } from '@/game/levels/tutorialDefinitions';
import { TitleDioramaSandbox } from '@/ui/TitleDioramaSandbox';
import ControlsModal from '@/ui/ControlsModal';
import TutorialsModal from '@/ui/TutorialsModal';
import LeaderboardModal from '@/ui/LeaderboardModal';

type MenuModal = 'controls' | 'tutorials' | 'leaderboard' | null;

interface TitleScreenProps {
  onPlay: () => void;
  /** PASO B: lanza un mini-tutorial jugable desde la portada. */
  onPlayTutorial?: (id: TutorialId) => void;
  /** Ajustes persistentes (Controles) compartidos con el GameEngine. */
  settings: GameSettings;
  onUpdateSettings: (settings: GameSettings) => void;
}

/** Chip de tecla del pill de controles (fondo oscuro, borde cian). */
function KeyChip({ children }: { children: string }) {
  return (
    <span className="rounded-md border border-cyan-300/70 bg-[#0b0b14]/80 px-1.5 py-0.5 text-[10px] font-black tracking-[0.08em] text-cyan-100">
      {children}
    </span>
  );
}

/**
 * Portada de OUTORBIT (PASO C): blade blanco diagonal con shader líquido,
 * logotipo 3D extruido con shader propio, sandbox jugable de cámara fija sobre
 * el mini-planeta Verdant y los tres modales funcionales (Controles,
 * Tutoriales y Leaderboard).
 */
export default function TitleScreen({
  onPlay,
  onPlayTutorial,
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

  const bindings = settings.bindings;
  const moveKeys = [bindings.forward, bindings.left, bindings.back, bindings.right]
    .map(formatKeyCode)
    .join('');
  const slotKeys = [bindings.slot1, bindings.slot2, bindings.slot3].map(formatKeyCode).join('/');

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#05010f]">
      {/* --- Diorama 3D jugable (fondo, sin capturar clics) --- */}
      <canvas
        ref={canvasRef}
        className="pointer-events-none fixed inset-0 h-full w-full"
        aria-hidden="true"
      />

      {/* --- Pila de menú: dentro del blade blanco, bajo el logotipo 3D --- */}
      <nav className="absolute left-[3%] top-[34%] z-10 flex w-[24%] min-w-[200px] max-w-[360px] flex-col gap-2.5">
        <button
          type="button"
          onClick={onPlay}
          className="group relative -skew-x-12 cursor-pointer border-4 border-cyan-300 px-6 py-3 text-left shadow-[8px_8px_0_#0b0b14] transition-transform hover:-translate-y-0.5 active:translate-y-0 active:shadow-[4px_4px_0_#0b0b14]"
          style={{
            backgroundImage: 'linear-gradient(100deg, #f97316 0%, #fb7185 55%, #f43f5e 100%)',
          }}
        >
          <span className="block skew-x-12 text-3xl font-black italic tracking-[0.18em] text-white drop-shadow-[0_3px_0_#0b0b14]">
            SANDBOX
          </span>
        </button>

        <button
          type="button"
          onClick={() => setModal('controls')}
          className="-skew-x-12 cursor-pointer border-2 border-[#0f172a] bg-white/75 px-4 py-2 text-left shadow-[5px_5px_0_#0f172a] transition-transform hover:-translate-y-0.5 hover:bg-white active:translate-y-0 active:shadow-[2px_2px_0_#0f172a]"
        >
          <span className="block skew-x-12 text-base font-black italic uppercase leading-tight tracking-[0.06em] text-[#0f172a]">
            Modificar controles
          </span>
        </button>

        <button
          type="button"
          onClick={() => setModal('tutorials')}
          className="-skew-x-12 cursor-pointer border-2 border-[#0f172a] bg-white/75 px-4 py-2 text-left shadow-[5px_5px_0_#0f172a] transition-transform hover:-translate-y-0.5 hover:bg-white active:translate-y-0 active:shadow-[2px_2px_0_#0f172a]"
        >
          <span className="block skew-x-12 text-base font-black italic uppercase leading-tight tracking-[0.06em] text-[#0f172a]">
            Tutoriales
          </span>
        </button>

        <button
          type="button"
          onClick={() => setModal('leaderboard')}
          className="-skew-x-12 cursor-pointer border-2 border-[#0f172a] bg-white/75 px-4 py-2 text-left shadow-[5px_5px_0_#0f172a] transition-transform hover:-translate-y-0.5 hover:bg-white active:translate-y-0 active:shadow-[2px_2px_0_#0f172a]"
        >
          <span className="block skew-x-12 text-base font-black italic uppercase leading-tight tracking-[0.06em] text-[#0f172a]">
            Leaderboard
          </span>
        </button>
      </nav>

      {/* --- Crédito discreto abajo a la izquierda --- */}
      <p className="absolute bottom-4 left-4 z-10 text-[11px] font-semibold tracking-[0.08em] text-[#0f172a]/70">
        hecho por srpakura
      </p>

      {/* --- Pill de controles del sandbox (sobre el badge de Base44) --- */}
      <div className="absolute bottom-14 right-4 z-10 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-full border-2 border-cyan-300/60 bg-[#0b0b14]/75 px-4 py-2 text-[10px] font-bold text-slate-200 shadow-[4px_4px_0_rgba(11,11,20,0.55)] backdrop-blur">
        <span className="flex items-center gap-1">
          <KeyChip>{moveKeys}</KeyChip> Mover
        </span>
        <span className="text-cyan-300/50">·</span>
        <span className="flex items-center gap-1">
          <KeyChip>{formatKeyCode(bindings.jump)}</KeyChip> Saltar
        </span>
        <span className="text-cyan-300/50">·</span>
        <span className="flex items-center gap-1">
          <KeyChip>{formatKeyCode(bindings.sprint)}</KeyChip> Sprint
        </span>
        <span className="text-cyan-300/50">·</span>
        <span className="flex items-center gap-1">
          <KeyChip>{slotKeys}</KeyChip> Personaje
        </span>
        <span className="text-cyan-300/50">·</span>
        <span className="font-black uppercase tracking-[0.12em] text-cyan-200">Cámara fija</span>
      </div>

      {modal === 'controls' && (
        <ControlsModal
          settings={settings}
          onClose={() => setModal(null)}
          onSaveSettings={onUpdateSettings}
        />
      )}

      {modal === 'tutorials' && (
        <TutorialsModal
          onClose={() => setModal(null)}
          onStartTutorial={(id) => {
            setModal(null);
            onPlayTutorial?.(id);
          }}
        />
      )}

      {modal === 'leaderboard' && <LeaderboardModal onClose={() => setModal(null)} />}
    </div>
  );
}
