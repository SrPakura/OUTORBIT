import { useState } from 'react';
import { useI18n } from '@/i18n';

// ============================================================================
// Game Over / Battle Report de la Cúpula: informe arcade cómic-nebulana con
// puntuación gigante, estadísticas de la partida, habilidades finales y
// envío opcional al leaderboard (idle | saving | saved | error).
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
  equippedSkills: Array<{ name: string; level: number }>;
}

export interface DomeBattleReportProps {
  data: DomeBattleReportData;
  onPlayAgain: () => void;
  onExitToMenu: () => void;
  onSubmitScore?: (playerName: string) => Promise<boolean>;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function formatTime(totalSec: number): string {
  const minutes = Math.floor(totalSec / 60);
  const seconds = Math.floor(totalSec % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function StatBox({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div
      className="-skew-x-12 border border-white/25 bg-[#090314]/70 px-4 py-3 text-center"
      style={{ boxShadow: '5px 5px 0 rgba(4,5,16,0.9)' }}
    >
      <div className="skew-x-12">
        <p className="text-[9px] font-black tracking-[0.28em] text-white/45">
          {label}
        </p>
        <p
          className="mt-1 text-xl font-black tabular-nums"
          style={{ color: accent, textShadow: `0 0 12px ${accent}55` }}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

/** Clave de diccionario del texto de cada estado del botón de guardado. */
const SAVE_LABEL_KEYS: Record<SaveState, string> = {
  idle: 'battleReport.saveIdle',
  saving: 'battleReport.saveSaving',
  saved: 'battleReport.saveSaved',
  error: 'battleReport.saveError',
};

export function DomeBattleReport({
  data,
  onPlayAgain,
  onExitToMenu,
  onSubmitScore,
}: DomeBattleReportProps) {
  const [playerName, setPlayerName] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const { t } = useI18n();

  const handleSave = async () => {
    if (!onSubmitScore || saveState === 'saving' || saveState === 'saved') return;
    setSaveState('saving');
    try {
      const ok = await onSubmitScore(playerName.trim() || t('battleReport.defaultPilotName'));
      setSaveState(ok ? 'saved' : 'error');
    } catch {
      setSaveState('error');
    }
  };

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
      {/* Viñeta carmesí de derrota */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ boxShadow: 'inset 0 0 220px 60px rgba(244,63,94,0.16)' }}
      />

      <div className="relative w-full max-w-3xl">
        <p className="text-center text-[10px] font-black tracking-[0.5em] text-[#ff2a55]">
          {t('battleReport.subtitle')}
        </p>
        <h2 className="mt-1.5 text-center text-4xl font-black italic tracking-tight text-white drop-shadow-[3px_3px_0_rgba(4,5,16,0.95)]">
          {t('battleReport.title')}
        </h2>

        {/* Puntuación gigante */}
        <div className="mt-6 flex flex-col items-center">
          <p className="text-[10px] font-black tracking-[0.4em] text-cyan-300/80">
            {t('battleReport.finalScore')}
          </p>
          <p
            className="mt-1 text-6xl font-black italic tabular-nums leading-none text-white"
            style={{
              textShadow:
                '0 0 28px rgba(34,211,238,0.55), 4px 4px 0 rgba(4,5,16,0.95)',
              animation: 'domeReportScorePulse 1.6s ease-in-out infinite',
            }}
          >
            {data.score.toLocaleString('es-ES')}
          </p>
        </div>

        {/* Rejilla de estadísticas */}
        <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatBox label={t('battleReport.statWave')} value={String(data.wave)} accent="#22d3ee" />
          <StatBox label={t('battleReport.statLevel')} value={String(data.level)} accent="#a855f7" />
          <StatBox label={t('battleReport.statKills')} value={String(data.kills)} accent="#ffffff" />
          <StatBox
            label={t('battleReport.statBarrierKills')}
            value={String(data.barrierKills)}
            accent="#ff2a55"
          />
          <StatBox
            label={t('battleReport.statMaxSpeed')}
            value={`${data.maxSpeed.toFixed(1)} m/s`}
            accent="#22d3ee"
          />
          <StatBox
            label={t('battleReport.statTime')}
            value={formatTime(data.survivalTimeSec)}
            accent="#a855f7"
          />
        </div>

        {/* Redirecciones perfectas + habilidades finales */}
        <div className="mt-5 flex flex-col items-center gap-3">
          <p className="text-[10px] font-black tracking-[0.3em] text-[#fbbf24]">
            {t('battleReport.perfectRedirections', { n: data.perfectRedirections })}
          </p>
          <div className="flex flex-wrap justify-center gap-2.5">
            {data.equippedSkills.length === 0 ? (
              <span className="text-[10px] font-bold tracking-[0.22em] text-white/35">
                {t('battleReport.noSkills')}
              </span>
            ) : (
              data.equippedSkills.map((skill) => (
                <div
                  key={skill.name}
                  className="-skew-x-12 border border-cyan-300/50 bg-[#090314]/70 px-3.5 py-1.5 shadow-[0_0_14px_rgba(34,211,238,0.25)]"
                >
                  <span className="block skew-x-12 text-[10px] font-bold tracking-[0.22em] text-white/85">
                    {skill.name} · {t('battleReport.levelShort')} {skill.level}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Registro en el leaderboard */}
        {onSubmitScore && (
          <div className="mt-7 flex flex-col items-center gap-3">
            <div className="flex w-full max-w-md flex-col gap-3 sm:flex-row">
              <input
                type="text"
                value={playerName}
                maxLength={18}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder={t('battleReport.namePlaceholder')}
                disabled={saveState === 'saving' || saveState === 'saved'}
                className="-skew-x-12 flex-1 border-2 border-white/30 bg-[#090314]/85 px-4 py-2.5 text-[11px] font-bold tracking-[0.2em] text-white placeholder:text-white/30 focus:border-cyan-300 focus:outline-none disabled:opacity-50"
              />
              <button
                type="button"
                onClick={handleSave}
                disabled={saveState === 'saving' || saveState === 'saved'}
                className={`-skew-x-12 cursor-pointer border-2 px-5 py-2.5 text-[10px] font-black tracking-[0.24em] transition-transform hover:-translate-y-0.5 disabled:cursor-default disabled:hover:translate-y-0 ${
                  saveState === 'saved'
                    ? 'border-[#34d399] bg-[#34d399]/15 text-[#34d399]'
                    : saveState === 'error'
                      ? 'border-[#ff2a55] bg-[#ff2a55]/15 text-[#ff2a55]'
                      : 'border-cyan-300 bg-cyan-400/15 text-cyan-200 hover:bg-cyan-400/25'
                }`}
                style={{ boxShadow: '5px 5px 0 rgba(4,5,16,0.9)' }}
              >
                <span className="block skew-x-12">{t(SAVE_LABEL_KEYS[saveState])}</span>
              </button>
            </div>
            <p className="text-[9px] tracking-[0.2em] text-white/35">
              {saveState === 'error'
                ? t('battleReport.saveErrorHint')
                : t('battleReport.saveHint')}
            </p>
          </div>
        )}

        {/* Botones finales */}
        <div className="mt-8 flex flex-wrap justify-center gap-4 pb-2">
          <button
            type="button"
            onClick={onPlayAgain}
            className="-skew-x-12 cursor-pointer border-2 border-cyan-300 bg-cyan-400/15 px-8 py-3 text-sm font-black tracking-[0.28em] text-cyan-200 transition-transform hover:-translate-y-0.5 hover:bg-cyan-400/25"
            style={{ boxShadow: '6px 6px 0 rgba(4,5,16,0.95)' }}
          >
            <span className="block skew-x-12">{t('battleReport.playAgain')}</span>
          </button>
          <button
            type="button"
            onClick={onExitToMenu}
            className="-skew-x-12 cursor-pointer border-2 border-white/40 bg-[#090314]/70 px-8 py-3 text-sm font-black tracking-[0.28em] text-white/80 transition-transform hover:-translate-y-0.5 hover:border-white/70"
            style={{ boxShadow: '6px 6px 0 rgba(4,5,16,0.95)' }}
          >
            <span className="block skew-x-12">{t('battleReport.mainMenu')}</span>
          </button>
        </div>
      </div>

      <style>{`
        @keyframes domeReportScorePulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.72; }
        }
      `}</style>
    </div>
  );
}

export default DomeBattleReport;
