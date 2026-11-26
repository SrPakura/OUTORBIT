import { useEffect, useRef, useState } from 'react';
import type { GameSettings } from '@/game/settings';
import { musicPlayer } from '@/game/audio/MusicPlayer';
import { useI18n } from '@/i18n';
import { TitleDioramaSandbox } from '@/ui/TitleDioramaSandbox';
import FluidInkButton from '@/ui/FluidInkButton';
import SettingsScreen from '@/ui/SettingsScreen';
import LeaderboardModal from '@/ui/LeaderboardModal';
import { useGamepadListNav } from '@/game/input/gamepadMenuNav';

type MenuModal = 'settings' | 'leaderboard' | null;

/** Paleta unificada del menú: carmesí -> violeta -> cian. */
const MENU_STOPS = ['#e11d48', '#7c3aed', '#22d3ee'];

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
 * Blender) a la derecha y, a la izquierda, el blade de papel opaco que pinta
 * el shader del divisor (menuShaders.ts), con el logo de tinta oscura y los
 * botones FluidInkButton: rectángulos sesgados de núcleo papel cuyo borde
 * líquido ondula con la paleta unificada carmesí/violeta/cian.
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
  const { language, setLanguage, toggleLanguage, t } = useI18n();

  const [modal, setModal] = useState<MenuModal>(null);

  // Navegación con mando: D-Pad/stick mueve, Cruz (A) activa.
  const actions = [
    { id: 'play', run: onPlay },
    ...(onPlayTraining ? [{ id: 'training', run: onPlayTraining }] : []),
    { id: 'settings', run: () => setModal('settings') },
    { id: 'leaderboard', run: () => setModal('leaderboard') },
    { id: 'language', run: toggleLanguage },
  ] as const;
  const [padIndex] = useGamepadListNav(actions.length, {
    enabled: modal === null,
    onConfirm: (i) => actions[i]?.run(),
  });

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

      {/* --- Menú dentro del blade de papel del shader: logo + botones de tinta --- */}
      <div className="absolute left-[3.5%] top-[14%] z-10 flex w-[25%] min-w-[230px] max-w-[380px] flex-col gap-7">
        <header className="select-none">
          <div className="mb-2 flex items-center gap-2">
            <span className="title-tag">{t('menu.tagline')}</span>
            <span className="title-tag__line" />
          </div>
          <h1 className="title-logo">
            OUT<span className="title-logo__accent">ORBIT</span>
          </h1>
        </header>

        <nav className="flex flex-col gap-3">
          <FluidInkButton
            label={t('menu.play')}
            stops={MENU_STOPS}
            vbHeight={116}
            labelFontSize="1.5rem"
            focused={padIndex === 0}
            onClick={onPlay}
          />
          {onPlayTraining && (
            <FluidInkButton
              label={t('menu.training')}
              stops={MENU_STOPS}
              vbHeight={84}
              labelFontSize="0.875rem"
              focused={padIndex === 1}
              onClick={onPlayTraining}
            />
          )}
          <FluidInkButton
            label={t('menu.controls')}
            stops={MENU_STOPS}
            vbHeight={84}
            labelFontSize="0.875rem"
            focused={padIndex === (onPlayTraining ? 2 : 1)}
            onClick={() => setModal('settings')}
          />
          <FluidInkButton
            label={t('menu.leaderboard')}
            stops={MENU_STOPS}
            vbHeight={84}
            labelFontSize="0.875rem"
            focused={padIndex === (onPlayTraining ? 3 : 2)}
            onClick={() => setModal('leaderboard')}
          />
        </nav>
      </div>

      {/* --- Selector de idioma abajo a la izquierda --- */}
      <div className="absolute bottom-4 left-4 z-10 flex flex-col items-start gap-1.5">
        <div
          className={`-skew-x-12 flex items-center border-2 border-[#0b0d12] bg-white/70 px-1 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#0b0d12] shadow-[4px_4px_0_#0b0d12] transition-all ${
            padIndex === actions.length - 1 ? '-translate-y-0.5 shadow-[4px_4px_0_#e11d48] border-[#e11d48]' : ''
          }`}
        >
          <button
            type="button"
            onClick={() => setLanguage('es')}
            aria-label="Español"
            className={`skew-x-12 cursor-pointer px-2 py-0.5 transition-colors ${
              language === 'es' ? 'text-[#0e7490]' : 'text-[#0b0d12]/40 hover:text-[#0b0d12]/70'
            }`}
          >
            {t('menu.languageEs')}
          </button>
          <span className="skew-x-12 text-[#0b0d12]/30">/</span>
          <button
            type="button"
            onClick={() => setLanguage('en')}
            aria-label="English"
            className={`skew-x-12 cursor-pointer px-2 py-0.5 transition-colors ${
              language === 'en' ? 'text-[#0e7490]' : 'text-[#0b0d12]/40 hover:text-[#0b0d12]/70'
            }`}
          >
            {t('menu.languageEn')}
          </button>
          <span className="skew-x-12 text-[#0b0d12]/30">/</span>
          <button
            type="button"
            onClick={() => setLanguage('ja')}
            aria-label="日本語"
            className={`skew-x-12 cursor-pointer px-2 py-0.5 transition-colors ${
              language === 'ja' ? 'text-[#0e7490]' : 'text-[#0b0d12]/40 hover:text-[#0b0d12]/70'
            }`}
          >
            {t('menu.languageJa')}
          </button>
        </div>
      </div>

      {modal === 'settings' && (
        <SettingsScreen
          settings={settings}
          onClose={() => setModal(null)}
          onUpdateSettings={onUpdateSettings}
        />
      )}

      {modal === 'leaderboard' && <LeaderboardModal onClose={() => setModal(null)} />}

      <style>{`
        .title-tag {
          background: #ffffff;
          color: #0b0d12;
          font: 800 10px/1 ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
          letter-spacing: 0.2em;
          padding: 6px 10px 5px;
          transform: skewX(-8deg);
          box-shadow: 3px 3px 0 #0b0d12;
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
