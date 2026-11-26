import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { fetchTopLeaderboard } from '@/api/leaderboard';
import {
  loadPersonalBestScore,
  loadPilotNickname,
  savePersonalBestScore,
  savePilotNickname,
} from '@/game/localStorageState';
import type { LeaderboardEntryRecord } from '@/game/types';
import { useGamepadListNav } from '@/game/input/gamepadMenuNav';
import { useI18n, SKILL_I18N_KEYS } from '@/i18n';

// ============================================================================
// Game Over / Battle Report de la Cúpula — mismo ADN visual que la subida de
// nivel, la pausa y los ajustes: papel #f1f1ed con rejilla, tinta #0b0d12,
// sombras duras, chips sesgados y acentos carmesí/cian/dorado.
//
// Estructura pensada para caber en un único viewport de escritorio sin scroll:
// - Cabecera asimétrica: Veredicto (GAME OVER) a la izquierda + Score final
//   sellado a la derecha.
// - Columna izquierda: Estadísticas de la run + Carga final de habilidades.
// - Columna derecha: Flujo unificado de Firma del piloto + Top 5 global.
// - Pie: Salidas principales (JUGAR DE NUEVO / MENÚ PRINCIPAL) con atajos [1]/[2].
// ============================================================================

export interface DomeBattleReportData {
  score: number;
  wave: number;
  level: number;
  kills: number;
  barrierKills: number;
  maxSpeed: number;
  survivalTimeSec: number;
  perfectRedirections: number;
  equippedSkills: Array<{ id?: string; name: string; level: number }>;
}

export interface DomeBattleReportProps {
  data: DomeBattleReportData;
  onPlayAgain: () => void;
  onExitToMenu: () => void;
  onSubmitScore?: (playerName: string) => Promise<boolean>;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/** Filas del Top que se muestran como preview del ranking global. */
const BOARD_PREVIEW_LIMIT = 5;

function formatTime(totalSec: number): string {
  const safe = Number.isFinite(totalSec) ? Math.max(0, totalSec) : 0;
  const minutes = Math.floor(safe / 60);
  const seconds = Math.floor(safe % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** Clave de diccionario del texto de cada estado del botón de guardado. */
const SAVE_LABEL_KEYS: Record<SaveState, string> = {
  idle: 'battleReport.saveIdle',
  saving: 'battleReport.saveSaving',
  saved: 'battleReport.saveSaved',
  error: 'battleReport.saveError',
};

// ---------------------------------------------------------------------------
// Panel de papel: filo de tinta, sombra dura y título en pestaña sesgada.
// ---------------------------------------------------------------------------
function Panel({
  title,
  accent,
  action,
  className = '',
  children,
}: {
  title: string;
  accent: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`brep-panel ${className}`.trim()}>
      <div className="brep-panel__head">
        <h2 className="brep-panel__title" style={{ '--accent': accent } as CSSProperties}>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Cifra grande: etiqueta mono + valor itálico con filo de acento.
// ---------------------------------------------------------------------------
function StatTile({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="brep-stat" style={{ '--accent': accent } as CSSProperties}>
      <span className="brep-stat__label">{label}</span>
      <span className="brep-stat__value">{value}</span>
    </div>
  );
}

export function DomeBattleReport({
  data,
  onPlayAgain,
  onExitToMenu,
  onSubmitScore,
}: DomeBattleReportProps) {
  const [storedNickname] = useState<string>(() => loadPilotNickname().trim());
  const hasStoredNickname = storedNickname.length > 0;
  const [personalBest, setPersonalBest] = useState<number>(() => loadPersonalBestScore());
  const [beatRecordOnMount] = useState<boolean>(
    () => hasStoredNickname && Math.round(data.score) > loadPersonalBestScore(),
  );
  const [playerName, setPlayerName] = useState<string>(storedNickname);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  /** Nombre realmente enviado: resalta su fila en el preview del ranking. */
  const [savedName, setSavedName] = useState<string | null>(null);
  const [entries, setEntries] = useState<LeaderboardEntryRecord[]>([]);
  const [boardLoading, setBoardLoading] = useState(true);
  const [boardReloadKey, setBoardReloadKey] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const playAgainRef = useRef<HTMLButtonElement | null>(null);
  const autoSubmittedRef = useRef(false);
  const { t, language } = useI18n();

  // Mando en Game Over: D-Pad / stick mueve entre [Jugar de nuevo] y [Menú principal]; Cruz (A) confirma.
  const [padIndex] = useGamepadListNav(2, {
    enabled: true,
    columns: 2,
    onConfirm: (i) => {
      if (i === 0) onPlayAgain();
      else onExitToMenu();
    },
  });

  const locale = language === 'ja' ? 'ja-JP' : language === 'es' ? 'es-ES' : 'en-US';
  const formatScore = (value: number): string => Math.round(value).toLocaleString(locale);
  const roundedRunScore = Math.round(data.score);

  // Preview del ranking: se recarga al montar y tras guardar la marca propia.
  useEffect(() => {
    let cancelled = false;
    setBoardLoading(true);
    fetchTopLeaderboard(BOARD_PREVIEW_LIMIT).then((rows) => {
      if (cancelled) return;
      setEntries(rows);
      setBoardLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [boardReloadKey]);

  // Atajos [1]/[2] cuando el usuario no está escribiendo en el input.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target !== null &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

      if (isTyping) {
        if (event.key === 'Escape') {
          inputRef.current?.blur();
        }
        return;
      }

      if (event.key === '1' || event.key === 'r' || event.key === 'R') {
        event.preventDefault();
        onPlayAgain();
      } else if (event.key === '2') {
        event.preventDefault();
        onExitToMenu();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onPlayAgain, onExitToMenu]);

  const handleSave = useCallback(async () => {
    if (!onSubmitScore || saveState === 'saving' || saveState === 'saved') return;
    const name = playerName.trim() || t('battleReport.defaultPilotName');
    setSaveState('saving');
    try {
      const ok = await onSubmitScore(name);
      if (!ok) {
        setSaveState('error');
        return;
      }
      savePilotNickname(name);
      if (roundedRunScore > personalBest) {
        savePersonalBestScore(roundedRunScore);
        setPersonalBest(roundedRunScore);
      }
      setPlayerName(name);
      setSaveState('saved');
      setSavedName(name);
      setBoardReloadKey((key) => key + 1);
      // Mueve el foco al botón principal para poder reiniciar con Enter/Espacio.
      requestAnimationFrame(() => playAgainRef.current?.focus());
    } catch {
      setSaveState('error');
    }
  }, [onSubmitScore, personalBest, playerName, roundedRunScore, saveState, t]);

  // Si ya tiene apodo guardado y supera su récord personal, auto-sube sin clicks.
  useEffect(() => {
    if (!onSubmitScore || !beatRecordOnMount || autoSubmittedRef.current) return;
    autoSubmittedRef.current = true;
    let cancelled = false;
    setSaveState('saving');
    onSubmitScore(storedNickname)
      .then((ok) => {
        if (cancelled) return;
        if (!ok) {
          setSaveState('error');
          return;
        }
        savePersonalBestScore(roundedRunScore);
        setPersonalBest(roundedRunScore);
        setSaveState('saved');
        setSavedName(storedNickname);
        setBoardReloadKey((key) => key + 1);
      })
      .catch(() => {
        if (!cancelled) setSaveState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [beatRecordOnMount, onSubmitScore, roundedRunScore, storedNickname]);

  const isOwnRow = (entry: LeaderboardEntryRecord): boolean => {
    if (savedName === null) return false;
    const sameName = entry.player_name.trim().toLowerCase() === savedName.trim().toLowerCase();
    return sameName && Math.round(entry.score) === roundedRunScore;
  };
  const ownRowVisible = entries.some(isOwnRow);

  return (
    <div className="brep-root">
      <div className="brep-speedlines" />
      <div className="brep-burst" />

      <div className="brep-wrap">
        {/* ---- Veredicto asimétrico ---- */}
        <header className="brep-hero">
          <div className="brep-hero__verdict">
            <p className="brep-kicker">{t('battleReport.subtitle')}</p>
            <h1 className="brep-title">{t('battleReport.title')}</h1>
          </div>
          <div className="brep-score">
            <span className="brep-score__label">{t('battleReport.finalScore')}</span>
            <span className="brep-score__value">{formatScore(data.score)}</span>
          </div>
        </header>

        <div className="brep-grid">
          {/* ---- Columna izquierda: Datos de la run + Carga final ---- */}
          <div className="brep-col">
            <Panel title={t('battleReport.statsTitle')} accent="#e11d48">
              <div className="brep-stats">
                <StatTile label={t('battleReport.statWave')} value={String(data.wave)} accent="#e11d48" />
                <StatTile label={t('battleReport.statKills')} value={String(data.kills)} accent="#0b0d12" />
                <StatTile
                  label={t('battleReport.statTime')}
                  value={formatTime(data.survivalTimeSec)}
                  accent="#22d3ee"
                />
                <StatTile
                  label={t('battleReport.statMaxSpeed')}
                  value={`${data.maxSpeed.toFixed(1)} m/s`}
                  accent="#fbbf24"
                />
              </div>
              <div className="brep-chips">
                <span className="brep-chip">
                  {t('battleReport.statLevel')} {data.level}
                </span>
                <span className="brep-chip">
                  {t('battleReport.chipBarrier')} {data.barrierKills}
                </span>
                <span className="brep-chip brep-chip--gold">
                  {t('battleReport.chipRedirections')} {data.perfectRedirections}
                </span>
              </div>
            </Panel>

            <Panel title={t('battleReport.loadoutTitle')} accent="#22d3ee">
              {data.equippedSkills.length === 0 ? (
                <p className="brep-empty">{t('battleReport.noSkills')}</p>
              ) : (
                <div className="brep-loadout">
                  {data.equippedSkills.map((skill, index) => {
                    const skillKey = skill.id ? SKILL_I18N_KEYS[skill.id] : null;
                    const displayName = skillKey ? t(`skills.${skillKey}`) : skill.name;
                    return (
                      <div key={`${skill.name}-${index}`} className="brep-slot">
                        <span className="brep-slot__idx">R{index + 1}</span>
                        <span className="brep-slot__name">{displayName}</span>
                        <span className="brep-slot__lv">
                          {t('battleReport.levelShort')} {skill.level}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>
          </div>

          {/* ---- Columna derecha: Firma + Ranking unificados ---- */}
          <div className="brep-col">
            <Panel
              title={onSubmitScore ? t('battleReport.pilotTitle') : t('battleReport.boardTitle')}
              accent={onSubmitScore ? '#e11d48' : '#fbbf24'}
              className="brep-panel--ranking"
              action={
                !onSubmitScore ? (
                  <button
                    type="button"
                    className="brep-mini"
                    onClick={() => setBoardReloadKey((key) => key + 1)}
                    disabled={boardLoading}
                  >
                    {t('battleReport.boardReload')}
                  </button>
                ) : undefined
              }
            >
              {onSubmitScore && !hasStoredNickname && (
                <form
                  className="brep-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleSave();
                  }}
                >
                  <div className="brep-form__row">
                    <input
                      ref={inputRef}
                      type="text"
                      value={playerName}
                      maxLength={18}
                      autoFocus
                      onChange={(event) => setPlayerName(event.target.value)}
                      placeholder={t('battleReport.namePlaceholder')}
                      aria-label={t('battleReport.namePlaceholder')}
                      disabled={saveState === 'saving' || saveState === 'saved'}
                      className="brep-input"
                    />
                    <button
                      type="submit"
                      disabled={saveState === 'saving' || saveState === 'saved'}
                      className={`brep-save is-${saveState}`}
                    >
                      {t(SAVE_LABEL_KEYS[saveState])}
                    </button>
                  </div>
                  <p className={`brep-hint${saveState === 'error' ? ' is-error' : ''}`}>
                    {saveState === 'error'
                      ? t('battleReport.saveErrorHint')
                      : t('battleReport.saveHint')}
                  </p>
                </form>
              )}

              {onSubmitScore && hasStoredNickname && (
                <div className="brep-form">
                  {saveState === 'error' && (
                    <div className="brep-form__row">
                      <button
                        type="button"
                        onClick={() => void handleSave()}
                        className="brep-save is-error"
                      >
                        {t(SAVE_LABEL_KEYS.error)}
                      </button>
                    </div>
                  )}
                  <p className={`brep-hint${saveState === 'error' ? ' is-error' : ''}`}>
                    {saveState === 'error'
                      ? t('battleReport.saveErrorHint')
                      : beatRecordOnMount
                        ? saveState === 'saved'
                          ? t('battleReport.autoUploadedHint', {
                              name: storedNickname,
                              score: formatScore(data.score),
                            })
                          : t('battleReport.autoUploadingHint', { name: storedNickname })
                        : t('battleReport.belowRecordHint', {
                            name: storedNickname,
                            best: formatScore(personalBest),
                          })}
                  </p>
                </div>
              )}

              {onSubmitScore && (
                <div className="brep-subhead">
                  <span className="brep-subhead__title">{t('battleReport.boardTitle')}</span>
                  <button
                    type="button"
                    className="brep-mini"
                    onClick={() => setBoardReloadKey((key) => key + 1)}
                    disabled={boardLoading}
                  >
                    {t('battleReport.boardReload')}
                  </button>
                </div>
              )}

              {boardLoading ? (
                <p className="brep-empty">{t('battleReport.boardLoading')}</p>
              ) : entries.length === 0 ? (
                <p className="brep-empty">{t('battleReport.boardEmpty')}</p>
              ) : (
                <ol className="brep-board">
                  {entries.map((entry, index) => {
                    const own = isOwnRow(entry);
                    return (
                      <li
                        key={entry.id ?? `${entry.player_name}-${index}`}
                        className={`brep-board__row${own ? ' is-you' : ''}`}
                      >
                        <span className={`brep-board__rank${index === 0 ? ' is-top' : ''}`}>
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <span className="brep-board__name">
                          <span className="brep-board__name-text">{entry.player_name}</span>
                          {own && <span className="brep-board__you">{t('battleReport.boardYou')}</span>}
                        </span>
                        <span className="brep-board__score">{formatScore(entry.score)}</span>
                      </li>
                    );
                  })}
                </ol>
              )}

              {saveState === 'saved' && !boardLoading && !ownRowVisible && savedName && (
                <p className="brep-recorded">
                  {t('battleReport.savedOutOfTop', {
                    name: savedName.toUpperCase(),
                    score: formatScore(data.score),
                  })}
                </p>
              )}
            </Panel>
          </div>
        </div>

        {/* ---- Salidas ---- */}
        <nav className="brep-actions">
          <button
            ref={playAgainRef}
            type="button"
            onClick={onPlayAgain}
            className={`brep-action brep-action--primary${padIndex === 0 ? ' is-pad-focus' : ''}`}
            style={{ '--accent': '#22d3ee' } as CSSProperties}
          >
            <span className="brep-action__inner">
              <span>{t('battleReport.playAgain')}</span>
              <span className="brep-action__key">[1]</span>
            </span>
          </button>
          <button
            type="button"
            onClick={onExitToMenu}
            className={`brep-action${padIndex === 1 ? ' is-pad-focus' : ''}`}
            style={{ '--accent': '#0b0d12' } as CSSProperties}
          >
            <span className="brep-action__inner">
              <span>{t('battleReport.mainMenu')}</span>
              <span className="brep-action__key">[2]</span>
            </span>
          </button>
        </nav>
      </div>

      <style>{`
        .brep-root {
          position: fixed;
          inset: 0;
          z-index: 50;
          overflow-y: auto;
          background-color: #f1f1ed;
          background-image:
            linear-gradient(rgba(11,13,18,0.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(11,13,18,0.06) 1px, transparent 1px);
          background-size: 96px 96px;
          color: #0b0d12;
          font-family: "Helvetica Neue", Helvetica, Arial, "Noto Sans JP", "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif;
          -webkit-font-smoothing: antialiased;
          animation: brepIn 260ms ease-out;
        }
        @keyframes brepIn {
          from { opacity: 0; transform: scale(1.03); }
          to   { opacity: 1; transform: scale(1); }
        }

        .brep-speedlines {
          position: fixed;
          inset: -12%;
          pointer-events: none;
          background: repeating-conic-gradient(
            from 0deg at 50% 24%,
            transparent 0deg 5.2deg,
            rgba(11, 13, 18, 0.05) 5.2deg 5.9deg
          );
          -webkit-mask-image: radial-gradient(circle at 50% 24%, transparent 26%, #000 84%);
          mask-image: radial-gradient(circle at 50% 24%, transparent 26%, #000 84%);
        }
        .brep-burst {
          position: fixed;
          left: 50%;
          top: 22%;
          width: 115vmin;
          height: 115vmin;
          transform: translate(-50%, -50%);
          pointer-events: none;
          background-image: radial-gradient(rgba(225,29,72,0.16) 2.4px, transparent 2.6px);
          background-size: 15px 15px;
          -webkit-mask-image: radial-gradient(circle, #000 0%, transparent 62%);
          mask-image: radial-gradient(circle, #000 0%, transparent 62%);
        }

        .brep-wrap {
          position: relative;
          min-height: 100dvh;
          max-width: 1160px;
          margin: 0 auto;
          padding: clamp(18px, 3vh, 36px) 4vw clamp(20px, 3.2vh, 36px);
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: clamp(16px, 2.6vh, 28px);
          box-sizing: border-box;
        }

        /* ---- veredicto asimétrico ---- */
        .brep-hero {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          flex-wrap: wrap;
        }
        .brep-hero__verdict {
          flex: 1 1 360px;
          min-width: 0;
        }
        .brep-kicker {
          margin: 0;
          font: 800 11px/1 ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
          letter-spacing: 0.36em;
          color: rgba(11,13,18,0.58);
        }
        .brep-title {
          margin: 6px 0 0;
          font-size: clamp(50px, 7.6vw, 108px);
          font-weight: 900;
          font-style: italic;
          letter-spacing: -0.055em;
          line-height: 0.86;
          color: transparent;
          -webkit-text-stroke: 3.5px #0b0d12;
          text-shadow: 7px 7px 0 rgba(225, 29, 72, 0.32);
          animation: brepTitleIn 420ms cubic-bezier(.2, 1.3, .4, 1) backwards;
        }
        @keyframes brepTitleIn {
          from { opacity: 0; transform: translateY(32px) skewX(-12deg) scale(1.12); }
          to   { opacity: 1; transform: translateY(0) skewX(0deg) scale(1); }
        }
        .brep-score {
          flex: 0 0 auto;
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          gap: 3px;
          padding: 10px 28px 13px;
          background: #fbfbf8;
          border: 3px solid #0b0d12;
          box-shadow: 7px 7px 0 #e11d48;
          transform: rotate(-1.8deg);
          animation: brepScoreIn 360ms cubic-bezier(.2, 1.2, .35, 1) 120ms backwards;
        }
        @keyframes brepScoreIn {
          from { opacity: 0; transform: rotate(-1.8deg) scale(0.86); }
          to   { opacity: 1; transform: rotate(-1.8deg) scale(1); }
        }
        .brep-score__label {
          font: 800 9px/1 ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
          letter-spacing: 0.32em;
          color: rgba(11,13,18,0.52);
        }
        .brep-score__value {
          font-size: clamp(40px, 5.4vw, 72px);
          font-weight: 900;
          font-style: italic;
          letter-spacing: -0.04em;
          line-height: 1;
          font-variant-numeric: tabular-nums;
          color: #0b0d12;
          text-shadow: 4px 4px 0 rgba(34, 211, 238, 0.45);
        }

        /* ---- rejilla de paneles ---- */
        .brep-grid {
          display: grid;
          gap: 18px;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr);
          align-items: stretch;
        }
        .brep-col {
          display: flex;
          flex-direction: column;
          gap: 16px;
          min-width: 0;
        }
        .brep-panel--ranking {
          flex: 1 1 auto;
          display: flex;
          flex-direction: column;
        }

        .brep-panel {
          position: relative;
          background: #fbfbf8;
          border: 3px solid #0b0d12;
          box-shadow: 7px 7px 0 rgba(11,13,18,0.9);
          padding: 15px 16px 14px;
        }
        .brep-panel::before {
          content: "";
          position: absolute;
          inset: 0;
          background-image: radial-gradient(rgba(11,13,18,0.08) 1.5px, transparent 1.7px);
          background-size: 11px 11px;
          -webkit-mask-image: linear-gradient(200deg, #000 0%, transparent 46%);
          mask-image: linear-gradient(200deg, #000 0%, transparent 46%);
          pointer-events: none;
        }
        .brep-panel__head {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 12px;
        }
        .brep-panel__title {
          margin: 0;
          display: inline-block;
          background: var(--accent, #0b0d12);
          color: #fff;
          font-size: 12px;
          font-weight: 900;
          font-style: italic;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          padding: 4px 11px 5px;
          transform: skewX(-8deg);
        }

        /* ---- cifras grandes ---- */
        .brep-stats {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }
        .brep-stat {
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 5px;
          padding: 9px 12px 12px;
          background: #fff;
          border: 3px solid #0b0d12;
          box-shadow: 4px 4px 0 rgba(11,13,18,0.85);
          transform: skewX(-6deg);
          overflow: hidden;
        }
        .brep-stat::after {
          content: "";
          position: absolute;
          left: 0;
          bottom: 0;
          width: 100%;
          height: 5px;
          background: var(--accent, #0b0d12);
        }
        .brep-stat > * { transform: skewX(6deg); }
        .brep-stat__label {
          font: 800 9px/1.2 ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: rgba(11,13,18,0.52);
        }
        .brep-stat__value {
          font-size: 23px;
          font-weight: 900;
          font-style: italic;
          letter-spacing: -0.02em;
          line-height: 1;
          font-variant-numeric: tabular-nums;
          color: #0b0d12;
        }

        .brep-chips { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 12px; }
        .brep-chip {
          font: 800 10px/1 ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
          letter-spacing: 0.13em;
          text-transform: uppercase;
          padding: 6px 9px 5px;
          border: 2px solid rgba(11,13,18,0.45);
          transform: skewX(-8deg);
        }
        .brep-chip--gold {
          background: #0b0d12;
          border-color: #0b0d12;
          color: #fbbf24;
        }

        /* ---- carga de habilidades ---- */
        .brep-loadout { display: grid; gap: 7px; }
        .brep-slot {
          display: grid;
          grid-template-columns: auto 1fr auto;
          align-items: center;
          gap: 10px;
          border: 2px solid rgba(11,13,18,0.8);
          background: rgba(255,255,255,0.72);
          padding: 7px 10px;
        }
        .brep-slot__idx {
          font: 800 9px/1 ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
          letter-spacing: 0.14em;
          background: #0b0d12;
          color: #22d3ee;
          padding: 5px 6px 4px;
        }
        .brep-slot__name {
          font-size: 12px;
          font-weight: 900;
          font-style: italic;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .brep-slot__lv {
          font: 800 10px/1 ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
          letter-spacing: 0.12em;
          color: rgba(11,13,18,0.58);
        }
        .brep-empty {
          margin: 0;
          font: 800 10px/1.6 ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: rgba(11,13,18,0.48);
        }

        /* ---- firma del piloto ---- */
        .brep-form { display: flex; flex-direction: column; gap: 7px; }
        .brep-form__row {
          display: flex;
          gap: 10px;
          align-items: stretch;
        }
        .brep-input {
          flex: 1 1 auto;
          min-width: 0;
          background: #fff;
          border: 3px solid #0b0d12;
          padding: 10px 13px;
          font-size: 19px;
          font-weight: 900;
          font-style: italic;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          color: #0b0d12;
          outline: none;
          box-shadow: 4px 4px 0 rgba(11,13,18,0.85);
          transition: box-shadow 120ms ease, border-color 120ms ease;
        }
        .brep-input::placeholder {
          color: rgba(11,13,18,0.28);
          font-size: 13px;
          letter-spacing: 0.14em;
        }
        .brep-input:focus { border-color: #22d3ee; box-shadow: 4px 4px 0 #22d3ee; }
        .brep-input:disabled { opacity: 0.55; box-shadow: 4px 4px 0 rgba(11,13,18,0.4); }

        .brep-save {
          flex: 0 0 auto;
          background: #0b0d12;
          color: #fff;
          border: 3px solid #0b0d12;
          box-shadow: 4px 4px 0 #22d3ee;
          padding: 10px 16px;
          font-size: 12px;
          font-weight: 900;
          font-style: italic;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          white-space: nowrap;
          cursor: pointer;
          transition: transform 120ms ease, box-shadow 120ms ease, background 120ms ease, color 120ms ease;
        }
        .brep-save:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 6px 6px 0 #22d3ee;
        }
        .brep-save:active:not(:disabled) {
          transform: translateY(1px);
          box-shadow: 2px 2px 0 #22d3ee;
        }
        .brep-save:disabled { cursor: default; }
        .brep-save.is-saving { animation: brepSaving 0.7s steps(2) infinite; }
        @keyframes brepSaving { 50% { background: #2a2f3d; } }
        .brep-save.is-saved {
          background: #22d3ee;
          color: #0b0d12;
          box-shadow: 4px 4px 0 #0b0d12;
        }
        .brep-save.is-error {
          background: #e11d48;
          box-shadow: 4px 4px 0 #0b0d12;
        }
        .brep-hint {
          margin: 0;
          font: 800 9px/1.4 ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: rgba(11,13,18,0.48);
        }
        .brep-hint.is-error { color: #e11d48; }

        /* ---- preview del ranking ---- */
        .brep-subhead {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-top: 14px;
          padding-top: 12px;
          border-top: 2px solid rgba(11,13,18,0.16);
          margin-bottom: 8px;
        }
        .brep-subhead__title {
          display: inline-block;
          background: #fbbf24;
          color: #0b0d12;
          font-size: 11px;
          font-weight: 900;
          font-style: italic;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          padding: 4px 10px;
          transform: skewX(-8deg);
        }
        .brep-mini {
          background: transparent;
          border: 2px solid #0b0d12;
          color: #0b0d12;
          font: 800 9px/1 ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
          letter-spacing: 0.14em;
          padding: 6px 9px 5px;
          cursor: pointer;
          transform: skewX(-8deg);
          transition: background 100ms ease, color 100ms ease;
        }
        .brep-mini:hover:not(:disabled) { background: #0b0d12; color: #fbbf24; }
        .brep-mini:disabled { cursor: wait; opacity: 0.5; }

        .brep-board { margin: 2px 0 0; padding: 0; list-style: none; border-top: 2px solid #0b0d12; }
        .brep-board__row {
          display: grid;
          grid-template-columns: 28px 1fr auto;
          align-items: center;
          gap: 10px;
          padding: 7px 6px;
          border-bottom: 2px dotted rgba(11,13,18,0.22);
        }
        .brep-board__row:last-child { border-bottom: none; }
        .brep-board__row.is-you {
          background: rgba(34, 211, 238, 0.18);
          box-shadow: inset 4px 0 0 #22d3ee;
        }
        .brep-board__rank {
          font: 800 11px/1 ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
          letter-spacing: 0.1em;
          color: rgba(11,13,18,0.45);
        }
        .brep-board__rank.is-top { color: #e11d48; }
        .brep-board__name {
          display: flex;
          align-items: center;
          min-width: 0;
          font-size: 12px;
          font-weight: 900;
          font-style: italic;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }
        .brep-board__name-text {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .brep-board__you {
          flex: 0 0 auto;
          margin-left: 8px;
          font: 800 8px/1 ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
          letter-spacing: 0.16em;
          background: #22d3ee;
          color: #0b0d12;
          padding: 4px 5px 3px;
        }
        .brep-board__score {
          font: 900 14px/1 ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
          letter-spacing: 0.02em;
          font-variant-numeric: tabular-nums;
        }
        .brep-recorded {
          margin: 10px 0 0;
          padding: 7px 10px;
          background: rgba(34, 211, 238, 0.16);
          border-left: 4px solid #22d3ee;
          font: 800 10px/1.3 ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #0b0d12;
        }

        /* ---- salidas ---- */
        .brep-actions {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 14px;
        }
        .brep-action {
          background: #fbfbf8;
          color: #0b0d12;
          border: 3px solid #0b0d12;
          box-shadow: 6px 6px 0 var(--accent, #0b0d12);
          padding: 13px 26px 14px;
          font-size: 14px;
          font-weight: 900;
          font-style: italic;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          cursor: pointer;
          transform: skewX(-6deg);
          transition: transform 130ms cubic-bezier(.2, .9, .3, 1), box-shadow 130ms ease, background 130ms ease;
          outline: none;
        }
        .brep-action:focus-visible {
          box-shadow: 8px 8px 0 #22d3ee;
        }
        .brep-action__inner {
          display: inline-flex;
          align-items: center;
          gap: 12px;
          transform: skewX(6deg);
        }
        .brep-action__key {
          font: 800 10px/1 ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
          letter-spacing: 0.12em;
          opacity: 0.52;
        }
        .brep-action:hover, .brep-action.is-pad-focus {
          transform: skewX(-6deg) translateY(-2px);
          box-shadow: 9px 9px 0 #22d3ee;
          background: #fff;
        }
        .brep-action:active {
          transform: skewX(-6deg) translateY(1px);
          box-shadow: 4px 4px 0 var(--accent, #0b0d12);
        }
        .brep-action--primary { background: #0b0d12; color: #fff; }
        .brep-action--primary:hover, .brep-action--primary.is-pad-focus { background: #161a24; }

        /* ---- móvil / pantallas estrechas ---- */
        @media (max-width: 780px) {
          .brep-wrap {
            justify-content: flex-start;
            padding: 24px 5vw 32px;
          }
          .brep-hero {
            flex-direction: column;
            align-items: center;
            text-align: center;
          }
          .brep-hero__verdict {
            flex: 0 0 auto;
          }
          .brep-grid {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 480px) {
          .brep-form__row {
            flex-direction: column;
          }
          .brep-actions {
            flex-direction: column;
          }
          .brep-action {
            width: 100%;
          }
          .brep-action__inner {
            justify-content: space-between;
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}

export default DomeBattleReport;
