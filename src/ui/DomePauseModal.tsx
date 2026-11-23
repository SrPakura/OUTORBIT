import { useEffect, useState } from 'react';
import { useI18n, waveLabelKey } from '@/i18n';

// ============================================================================
// Menú de Pausa de la Cúpula: overlay cómic-nebulana con REANUDAR, vista de
// CONTROLES reales de la Cúpula, REINICIAR ÓRBITA y SALIR AL TÍTULO.
// ============================================================================

export interface DomePauseModalProps {
  isOpen: boolean;
  waveNumber?: number;
  waveLabel?: string;
  level?: number;
  onResume: () => void;
  onRestart: () => void;
  onExitToMenu: () => void;
}

/** Identificadores de la rejilla de controles (textos en pause.controlsList). */
const DOME_CONTROL_IDS = [
  'wasd',
  'mouse',
  'leftClick',
  'rightClick',
  'space',
  'slots',
  'skill',
  'pause',
] as const;

type DomeControlId = (typeof DOME_CONTROL_IDS)[number];

/** Acento de color de cada fila de la rejilla de controles. */
const DOME_CONTROL_ACCENTS: Record<DomeControlId, string> = {
  wasd: '#22d3ee',
  mouse: '#22d3ee',
  leftClick: '#ff2a55',
  rightClick: '#fbbf24',
  space: '#a855f7',
  slots: '#22d3ee',
  skill: '#a855f7',
  pause: '#ffffff',
};

function MenuButton({
  label,
  accentClass,
  borderClass,
  onClick,
}: {
  label: string;
  accentClass: string;
  borderClass: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-skew-x-12 cursor-pointer border-2 ${borderClass} ${accentClass} px-8 py-3 text-sm font-black tracking-[0.28em] transition-transform hover:-translate-y-0.5`}
      style={{ boxShadow: '6px 6px 0 rgba(4,5,16,0.95)' }}
    >
      <span className="block skew-x-12">{label}</span>
    </button>
  );
}

export function DomePauseModal({
  isOpen,
  waveNumber,
  waveLabel,
  level,
  onResume,
  onRestart,
  onExitToMenu,
}: DomePauseModalProps) {
  const [showControls, setShowControls] = useState(false);
  const { t } = useI18n();

  useEffect(() => {
    if (!isOpen) setShowControls(false);
  }, [isOpen]);

  if (!isOpen) return null;

  const translatedWaveLabel = waveLabel
    ? (() => {
        const key = waveLabelKey(waveLabel);
        return key ? t(key) : waveLabel;
      })()
    : null;

  const waveText =
    waveNumber !== undefined
      ? `${t('pause.wave', { n: waveNumber })}${translatedWaveLabel ? ` · ${translatedWaveLabel}` : ''}`
      : t('pause.orbitStable');

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-50 flex select-none flex-col items-center justify-center overflow-y-auto p-4 font-mono text-white"
      style={{
        background:
          'radial-gradient(ellipse at 20% 15%, rgba(109,40,217,0.28), transparent 55%), radial-gradient(ellipse at 80% 85%, rgba(6,182,212,0.2), transparent 55%), radial-gradient(ellipse at 50% 50%, rgba(4,5,16,0.92), #040510 78%)',
      }}
    >
      {/* Screentone halftone manga ambiental */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          opacity: 0.32,
          backgroundImage:
            'radial-gradient(rgba(34,211,238,0.55) 2px, transparent 2.2px), radial-gradient(rgba(168,85,247,0.45) 1.7px, transparent 1.9px)',
          backgroundSize: '14px 14px, 14px 14px',
          backgroundPosition: '0 0, 7px 7px',
        }}
      />
      {/* Viñeta cian de pausa */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ boxShadow: 'inset 0 0 220px 60px rgba(34,211,238,0.14)' }}
      />

      <div className="relative w-full max-w-2xl">
        {!showControls ? (
          <>
            <p className="text-center text-[10px] font-black tracking-[0.5em] text-cyan-300/80">
              {t('pause.subtitle')}
            </p>
            <h2 className="mt-1.5 text-center text-5xl font-black italic tracking-tight text-white drop-shadow-[3px_3px_0_rgba(4,5,16,0.95)]">
              {t('pause.title')}
            </h2>
            <p className="mt-2 text-center text-[10px] font-bold tracking-[0.3em] text-white/45">
              {waveText}
              {level !== undefined ? ` · ${t('pause.level', { n: level })}` : ''}
            </p>

            {/* Botones principales */}
            <div className="mt-8 flex flex-col items-center gap-4 pb-2">
              <MenuButton
                label={t('pause.resume')}
                accentClass="border-cyan-300 bg-cyan-400/15 text-cyan-200 hover:bg-cyan-400/25"
                borderClass="border-cyan-300"
                onClick={onResume}
              />
              <MenuButton
                label={t('pause.controls')}
                accentClass="border-[#fbbf24] bg-[#fbbf24]/15 text-[#fbbf24] hover:bg-[#fbbf24]/25"
                borderClass="border-[#fbbf24]"
                onClick={() => setShowControls(true)}
              />
              <MenuButton
                label={t('pause.restart')}
                accentClass="border-[#ff2a55] bg-[#ff2a55]/15 text-[#ff2a55] hover:bg-[#ff2a55]/25"
                borderClass="border-[#ff2a55]"
                onClick={onRestart}
              />
              <MenuButton
                label={t('pause.exit')}
                accentClass="border-white/40 bg-[#090314]/70 text-white/80 hover:border-white/70"
                borderClass="border-white/40"
                onClick={onExitToMenu}
              />
            </div>
          </>
        ) : (
          <>
            <p className="text-center text-[10px] font-black tracking-[0.5em] text-[#fbbf24]">
              {t('pause.controlsSubtitle')}
            </p>
            <h2 className="mt-1.5 text-center text-4xl font-black italic tracking-tight text-white drop-shadow-[3px_3px_0_rgba(4,5,16,0.95)]">
              {t('pause.controls')}
            </h2>

            {/* Rejilla de controles reales de la Cúpula */}
            <div className="mt-6 flex flex-col gap-2.5">
              {DOME_CONTROL_IDS.map((id) => {
                const keys = t(`pause.controlsList.${id}.keys`);
                const action = t(`pause.controlsList.${id}.action`);
                const accent = DOME_CONTROL_ACCENTS[id];
                return (
                  <div
                    key={id}
                    className="-skew-x-12 flex items-center gap-4 border border-white/25 bg-[#090314]/70 px-4 py-2.5"
                    style={{ boxShadow: '5px 5px 0 rgba(4,5,16,0.9)' }}
                  >
                    <span
                      className="w-28 shrink-0 skew-x-12 text-right text-[11px] font-black tracking-[0.18em]"
                      style={{ color: accent, textShadow: `0 0 10px ${accent}44` }}
                    >
                      {keys}
                    </span>
                    <span className="skew-x-12 text-[11px] font-bold tracking-[0.14em] text-white/80">
                      {action}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="mt-7 flex justify-center pb-2">
              <MenuButton
                label={t('pause.back')}
                accentClass="border-cyan-300 bg-cyan-400/15 text-cyan-200 hover:bg-cyan-400/25"
                borderClass="border-cyan-300"
                onClick={() => setShowControls(false)}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default DomePauseModal;
