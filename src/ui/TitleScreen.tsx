import { useEffect, useRef, useState } from 'react';
import type { GameSettings } from '@/game/settings';
import { musicPlayer } from '@/game/audio/MusicPlayer';
import { useI18n } from '@/i18n';
import { TitleDioramaSandbox } from '@/ui/TitleDioramaSandbox';
import ControlsModal from '@/ui/ControlsModal';
import LeaderboardModal from '@/ui/LeaderboardModal';

type MenuModal = 'controls' | 'leaderboard' | null;

interface TitleScreenProps {
  onPlay: () => void;
  /** Modo Entrenamiento / Debug: cúpula con panel de pruebas (F2 / Tab). */
  onPlayTraining?: () => void;
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
  onPlayTraining,
  settings,
  onUpdateSettings,
}: TitleScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sandboxRef = useRef<TitleDioramaSandbox | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const { language, toggleLanguage, t } = useI18n();

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
    musicPlayer.setVolumeMultiplier(settings.masterVolume);
  }, [settings]);

  // Música del menú: arranca al montar y sobrevive al cambio de pantalla (el
  // bucle de la Cúpula la sustituye con crossfade). Si el navegador bloquea el
  // autoplay, el reproductor la reintenta en el primer gesto del usuario.
  useEffect(() => {
    musicPlayer.play('menu');
  }, []);

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
              {t('menu.tagline')}
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
              {t('menu.play')}
            </span>
          </button>

          {onPlayTraining && (
            <button
              type="button"
              onClick={onPlayTraining}
              className="-skew-x-12 cursor-pointer border-2 border-cyan-300/40 bg-[#090314]/70 px-4 py-2 text-left text-white/75 shadow-[4px_4px_0_#000000] backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-cyan-300 hover:text-white active:translate-y-0"
            >
              <span className="block skew-x-12 text-xs font-black italic uppercase tracking-[0.14em]">
                {t('menu.training')}{' '}
                <span className="text-amber-300/90">{t('menu.trainingDebug')}</span>
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setModal('controls')}
            className="-skew-x-12 cursor-pointer border-2 border-white/80 bg-white/10 px-4 py-2.5 text-left text-white shadow-[5px_5px_0_#000000] backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-cyan-300 hover:bg-white/20 active:translate-y-0"
          >
            <span className="block skew-x-12 text-sm font-black italic uppercase tracking-[0.1em]">
              {t('menu.controls')}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setModal('leaderboard')}
            className="-skew-x-12 cursor-pointer border-2 border-white/80 bg-white/10 px-4 py-2.5 text-left text-white shadow-[5px_5px_0_#000000] backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-cyan-300 hover:bg-white/20 active:translate-y-0"
          >
            <span className="block skew-x-12 text-sm font-black italic uppercase tracking-[0.1em]">
              {t('menu.leaderboard')}
            </span>
          </button>
        </nav>
      </div>

      {/* --- Selector de idioma abajo a la izquierda --- */}
      <div className="absolute bottom-4 left-4 z-10 flex flex-col items-start gap-1.5">
        <button
          type="button"
          onClick={toggleLanguage}
          aria-label="Toggle language / Cambiar idioma"
          className="-skew-x-12 cursor-pointer border-2 border-white/80 bg-[#090314]/80 px-1 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white shadow-[4px_4px_0_#000000] backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-cyan-300 active:translate-y-0"
        >
          <span
            className={`skew-x-12 px-2 py-0.5 transition-colors ${
              language === 'es' ? 'text-cyan-300' : 'text-white/40 hover:text-white/70'
            }`}
          >
            {t('menu.languageEs')}
          </span>
          <span className="skew-x-12 text-white/30">/</span>
          <span
            className={`skew-x-12 px-2 py-0.5 transition-colors ${
              language === 'en' ? 'text-cyan-300' : 'text-white/40 hover:text-white/70'
            }`}
          >
            {t('menu.languageEn')}
          </span>
        </button>
      </div>

      {/* --- Etiqueta minimalista de Nyx --- */}
      <div className="absolute bottom-14 right-4 z-10 flex flex-col items-end gap-2">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-200/70">
          {t('menu.nyxTagline')}
        </p>
      </div>

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