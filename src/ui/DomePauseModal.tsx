import { useEffect } from 'react';
import { useI18n, waveLabelKey } from '@/i18n';

// ============================================================================
// Menú de Pausa de la Cúpula — mismo ADN visual que la subida de nivel y los
// ajustes: papel #f1f1ed con rejilla, tinta #0b0d12, sombras duras, chips
// sesgados y acentos carmesí/cian/dorado. REANUDAR · AJUSTES · REINICIAR
// ÓRBITA · SALIR AL TÍTULO.
// ============================================================================

export interface DomePauseModalProps {
  isOpen: boolean;
  waveNumber?: number;
  waveLabel?: string;
  level?: number;
  onResume: () => void;
  onOpenSettings: () => void;
  onRestart: () => void;
  onExitToMenu: () => void;
}

function PauseButton({
  label,
  hotkey,
  accent,
  onClick,
}: {
  label: string;
  hotkey: string;
  accent: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="pause-btn"
      style={{ '--accent': accent } as React.CSSProperties}
    >
      <span className="pause-btn__label">{label}</span>
      <span className="pause-btn__key">{hotkey}</span>
    </button>
  );
}

export function DomePauseModal({
  isOpen,
  waveNumber,
  waveLabel,
  level,
  onResume,
  onOpenSettings,
  onRestart,
  onExitToMenu,
}: DomePauseModalProps) {
  const { t } = useI18n();

  // Teclado: [1]..[4] dispara los botones del menú mientras la pausa está abierta.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === '1') onResume();
      else if (event.key === '2') onOpenSettings();
      else if (event.key === '3') onRestart();
      else if (event.key === '4') onExitToMenu();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onResume, onOpenSettings, onRestart, onExitToMenu]);

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
    <div className="pause-root">
      <div className="pause-speedlines" />
      <div className="pause-burst" />

      <div className="pause-center">
        <p className="pause-kicker">{t('pause.subtitle')}</p>
        <h1 className="pause-title">{t('pause.title')}</h1>

        <div className="pause-info">
          <span className="pause-info__chip">{waveText}</span>
          {level !== undefined && (
            <span className="pause-info__chip pause-info__chip--level">
              {t('pause.level', { n: level })}
            </span>
          )}
        </div>

        <nav className="pause-nav">
          <PauseButton
            label={t('pause.resume')}
            hotkey="[1]"
            accent="#22d3ee"
            onClick={onResume}
          />
          <PauseButton
            label={t('pause.settings')}
            hotkey="[2]"
            accent="#fbbf24"
            onClick={onOpenSettings}
          />
          <PauseButton
            label={t('pause.restart')}
            hotkey="[3]"
            accent="#e11d48"
            onClick={onRestart}
          />
          <PauseButton
            label={t('pause.exit')}
            hotkey="[4]"
            accent="#0b0d12"
            onClick={onExitToMenu}
          />
        </nav>
      </div>

      <style>{`
        .pause-root {
          position: fixed;
          inset: 0;
          z-index: 50;
          overflow: hidden;
          background-color: #f1f1ed;
          background-image:
            linear-gradient(rgba(11,13,18,0.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(11,13,18,0.06) 1px, transparent 1px);
          background-size: 96px 96px;
          color: #0b0d12;
          font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
          -webkit-font-smoothing: antialiased;
          animation: pauseIn 260ms ease-out;
        }
        @keyframes pauseIn {
          from { opacity: 0; transform: scale(1.04); }
          to   { opacity: 1; transform: scale(1); }
        }
        .pause-speedlines {
          position: absolute;
          inset: -12%;
          pointer-events: none;
          background: repeating-conic-gradient(
            from 0deg at 50% 42%,
            transparent 0deg 5.2deg,
            rgba(11, 13, 18, 0.05) 5.2deg 5.9deg
          );
          -webkit-mask-image: radial-gradient(circle at 50% 42%, transparent 24%, #000 80%);
          mask-image: radial-gradient(circle at 50% 42%, transparent 24%, #000 80%);
        }
        .pause-burst {
          position: absolute;
          left: 50%;
          top: 42%;
          width: 120vmin;
          height: 120vmin;
          transform: translate(-50%, -50%);
          pointer-events: none;
          background-image: radial-gradient(rgba(11,13,18,0.13) 2.2px, transparent 2.4px);
          background-size: 14px 14px;
          -webkit-mask-image: radial-gradient(circle, #000 0%, transparent 60%);
          mask-image: radial-gradient(circle, #000 0%, transparent 60%);
        }

        .pause-center {
          position: relative;
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 4vh 4vw;
        }
        .pause-kicker {
          margin: 0;
          font: 800 11px/1 ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
          letter-spacing: 0.42em;
          color: rgba(11,13,18,0.55);
          text-align: center;
        }
        .pause-title {
          margin: 8px 0 0;
          font-size: clamp(84px, 15vw, 200px);
          font-weight: 900;
          font-style: italic;
          letter-spacing: -0.06em;
          line-height: 0.85;
          color: transparent;
          -webkit-text-stroke: 4px #0b0d12;
          text-shadow: 8px 8px 0 rgba(225, 29, 72, 0.3);
          animation: pauseTitleIn 420ms cubic-bezier(.2, 1.3, .4, 1) backwards;
        }
        @keyframes pauseTitleIn {
          from { opacity: 0; transform: translateY(40px) skewX(-10deg) scale(1.15); }
          to   { opacity: 1; transform: translateY(0) skewX(0deg) scale(1); }
        }

        .pause-info {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 10px;
          margin-top: 18px;
        }
        .pause-info__chip {
          background: #0b0d12;
          color: #22d3ee;
          font: 800 11px/1 ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
          letter-spacing: 0.18em;
          padding: 8px 14px 7px;
          transform: skewX(-8deg);
        }
        .pause-info__chip--level { color: #fbbf24; }

        .pause-nav {
          display: flex;
          flex-direction: column;
          gap: 14px;
          margin-top: 5vh;
          width: min(460px, 86vw);
        }
        .pause-btn {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          background: #fbfbf8;
          border: 3px solid #0b0d12;
          box-shadow: 6px 6px 0 var(--accent, #0b0d12);
          padding: 15px 20px;
          cursor: pointer;
          transform: skewX(-6deg);
          transition: transform 130ms cubic-bezier(.2, .9, .3, 1), box-shadow 130ms ease, background 130ms ease;
          animation: pauseBtnIn 360ms cubic-bezier(.2, 1.2, .35, 1) backwards;
        }
        .pause-btn:nth-child(1) { animation-delay: 90ms; }
        .pause-btn:nth-child(2) { animation-delay: 170ms; }
        .pause-btn:nth-child(3) { animation-delay: 250ms; }
        .pause-btn:nth-child(4) { animation-delay: 330ms; }
        @keyframes pauseBtnIn {
          from { opacity: 0; transform: skewX(-6deg) translateX(-46px); }
          to   { opacity: 1; transform: skewX(-6deg) translateX(0); }
        }
        .pause-btn:hover {
          transform: skewX(-6deg) translateX(10px);
          box-shadow: 10px 10px 0 var(--accent, #0b0d12);
          background: #fff;
        }
        .pause-btn:active {
          transform: skewX(-6deg) translateX(4px);
          box-shadow: 4px 4px 0 var(--accent, #0b0d12);
        }
        .pause-btn__label {
          font-size: 17px;
          font-weight: 900;
          font-style: italic;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #0b0d12;
        }
        .pause-btn__key {
          font: 800 10px/1 ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
          letter-spacing: 0.14em;
          background: #0b0d12;
          color: #fff;
          padding: 6px 8px 5px;
        }
      `}</style>
    </div>
  );
}

export default DomePauseModal;
