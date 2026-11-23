import { useEffect, useRef, useState } from 'react';
import type { GameSettings } from '@/game/settings';
import { musicPlayer } from '@/game/audio/MusicPlayer';
import { useI18n } from '@/i18n';
import { TitleDioramaSandbox } from '@/ui/TitleDioramaSandbox';
import FluidInkButton from '@/ui/FluidInkButton';
import SettingsScreen from '@/ui/SettingsScreen';
import LeaderboardModal from '@/ui/LeaderboardModal';

type MenuModal = 'settings' | 'leaderboard' | null;

interface TitleScreenProps {
  onPlay: () => void;
  /** Modo Entrenamiento / Debug: cúpula con panel de pruebas (F2 / Tab). */
  onPlayTraining?: () => void;
  /** Ajustes persistentes compartidos con el GameEngine. */
  settings: GameSettings;
  onUpdateSettings: (settings: GameSettings) => void;
}

/**
 * Portada de OUTORBIT: diorama de gravedad cero con Nyx flotando (float de
 * Blender) a la derecha y, a la izquierda, un panel de papel con el mismo ADN
 * visual que la pausa/ajustes/subida de nivel: rejilla, tinta, sombras duras
 * y chips sesgados. Los botones son FluidInkButton: cápsulas de tinta viva
 * con borde líquido que ondula, se imanta al cursor y vibra al pulsar.
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
    musicPlayer.setVolumeMultiplier(settings.masterVolume * settings.musicVolume);
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

      {/* --- Panel de papel de la izquierda: logo + botones de tinta viva --- */}
      <aside className="title-panel">
        <div className="title-panel__grid" />
        <div className="title-panel__burst" />

        <header className="select-none">
          <div className="mb-2 flex items-center gap-2">
            <span className="title-tag">{t('menu.tagline')}</span>
            <span className="title-tag__line" />
          </div>
          <h1 className="title-logo">
            OUT<span className="title-logo__accent">ORBIT</span>
          </h1>
        </header>

        <nav className="mt-8 flex flex-col gap-4">
          <FluidInkButton
            label={t('menu.play')}
            stops={['#e11d48', '#f43f5e', '#fb923c', '#fbbf24']}
            vbHeight={116}
            onClick={onPlay}
          />
          {onPlayTraining && (
            <FluidInkButton
              label={t('menu.training')}
              hint={t('menu.trainingDebug')}
              stops={['#22d3ee', '#38bdf8', '#6366f1', '#4f46e5']}
              onClick={onPlayTraining}
            />
          )}
          <FluidInkButton
            label={t('menu.controls')}
            stops={['#a855f7', '#8b5cf6', '#6366f1', '#22d3ee']}
            onClick={() => setModal('settings')}
          />
          <FluidInkButton
            label={t('menu.leaderboard')}
            stops={['#fbbf24', '#f59e0b', '#f43f5e', '#e11d48']}
            onClick={() => setModal('leaderboard')}
          />
        </nav>

        <div className="mt-auto pt-8">
          <FluidInkButton
            label={language === 'es' ? 'ESPAÑOL' : 'ENGLISH'}
            hint={language === 'es' ? 'EN' : 'ES'}
            stops={['#0b0d12', '#1e293b', '#0e7490', '#22d3ee']}
            vbHeight={72}
            cornerRadius={20}
            amplitude={3}
            ariaLabel="Toggle language / Cambiar idioma"
            onClick={toggleLanguage}
          />
        </div>
      </aside>

      {modal === 'settings' && (
        <SettingsScreen
          settings={settings}
          onClose={() => setModal(null)}
          onUpdateSettings={onUpdateSettings}
        />
      )}

      {modal === 'leaderboard' && <LeaderboardModal onClose={() => setModal(null)} />}

      <style>{`
        .title-panel {
          position: relative;
          z-index: 10;
          display: flex;
          flex-direction: column;
          height: 100vh;
          width: clamp(320px, 30vw, 460px);
          padding: 7vh 3.2vw 4.5vh max(3.2vw, 26px);
          background-color: #f1f1ed;
          border-right: 3px solid #0b0d12;
          box-shadow: 10px 0 0 #e11d48;
          color: #0b0d12;
          font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
          -webkit-font-smoothing: antialiased;
          overflow-y: auto;
        }
        .title-panel__grid {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background-image:
            linear-gradient(rgba(11,13,18,0.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(11,13,18,0.06) 1px, transparent 1px);
          background-size: 96px 96px;
        }
        .title-panel__burst {
          position: absolute;
          left: 50%;
          top: 12%;
          width: 90vmin;
          height: 90vmin;
          transform: translate(-50%, -50%);
          pointer-events: none;
          background-image: radial-gradient(rgba(11,13,18,0.1) 2px, transparent 2.2px);
          background-size: 14px 14px;
          -webkit-mask-image: radial-gradient(circle, #000 0%, transparent 60%);
          mask-image: radial-gradient(circle, #000 0%, transparent 60%);
        }

        .title-tag {
          background: #0b0d12;
          color: #22d3ee;
          font: 800 10px/1 ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
          letter-spacing: 0.2em;
          padding: 6px 10px 5px;
          transform: skewX(-8deg);
        }
        .title-tag__line {
          height: 3px;
          flex: 1;
          background: #e11d48;
          transform: skewY(-1deg);
        }
        .title-logo {
          margin: 0;
          font-size: clamp(52px, 4.6vw, 76px);
          font-weight: 900;
          font-style: italic;
          letter-spacing: -0.04em;
          line-height: 0.9;
          color: #0b0d12;
          text-shadow: 5px 5px 0 #e11d48;
        }
        .title-logo__accent {
          color: #e11d48;
          text-shadow: 5px 5px 0 #0b0d12;
        }
      `}</style>
    </div>
  );
}
