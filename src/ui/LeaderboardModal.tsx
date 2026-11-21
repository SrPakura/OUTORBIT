import { useCallback, useEffect, useState } from 'react';
import { fetchTopLeaderboard } from '@/api/leaderboard';
import type { LeaderboardEntryRecord } from '@/game/types';
import MenuModalShell from '@/ui/MenuModalShell';

interface LeaderboardModalProps {
  onClose: () => void;
}

function formatTime(totalSec: number): string {
  const safe = Number.isFinite(totalSec) ? Math.max(0, totalSec) : 0;
  const minutes = Math.floor(safe / 60);
  const seconds = Math.floor(safe % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Leaderboard global (Base44): carga el Top 15 al abrir, cachea el resultado y
 * permite recargar. Muestra rango, piloto, tiempo, puntuación, estilo dominante
 * y alarmas en un modal de vidrio cómic de alto contraste.
 */
export default function LeaderboardModal({ onClose }: LeaderboardModalProps) {
  const [entries, setEntries] = useState<LeaderboardEntryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchTopLeaderboard(15).then((rows) => {
      if (cancelled) return;
      setEntries(rows);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const handleReload = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  return (
    <MenuModalShell
      title="LEADERBOARD"
      subtitle="Top 15 pilotos · ranking global vía Base44"
      accent="#fbbf24"
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            {loading ? 'Sincronizando...' : `${entries.length} registros`}
          </p>
          <button
            type="button"
            onClick={handleReload}
            disabled={loading}
            className="cursor-pointer rounded-lg border-2 border-[#0b0b14] bg-white/10 px-4 py-2 text-[11px] font-black tracking-[0.16em] text-white transition-colors hover:bg-white/20 disabled:cursor-wait disabled:opacity-50"
          >
            RECARGAR
          </button>
        </div>
      }
    >
      {loading ? (
        <p className="py-10 text-center text-xs font-bold tracking-[0.2em] text-cyan-300">
          CARGANDO RANKING...
        </p>
      ) : entries.length === 0 ? (
        <p className="py-10 text-center text-xs leading-relaxed text-slate-300">
          Sin registros todavía.
          <br />
          Sé el primero en alcanzar el portal de KRONOS.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border-2 border-white/10">
          <div className="grid grid-cols-[42px_1fr_64px_64px_1fr_56px] gap-2 border-b-2 border-white/10 bg-white/5 px-3 py-2 text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
            <span>#</span>
            <span>Piloto</span>
            <span className="text-right">Tiempo</span>
            <span className="text-right">Score</span>
            <span>Estilo</span>
            <span className="text-right">Alarmas</span>
          </div>
          <ol>
            {entries.map((entry, index) => (
              <li
                key={entry.id ?? `${entry.player_name}-${index}`}
                className="grid grid-cols-[42px_1fr_64px_64px_1fr_56px] items-center gap-2 border-b border-white/5 px-3 py-2 text-[11px] last:border-b-0 odd:bg-white/[0.03]"
              >
                <span
                  className={`font-black ${
                    index === 0
                      ? 'text-amber-300'
                      : index === 1
                        ? 'text-slate-200'
                        : index === 2
                          ? 'text-orange-300'
                          : 'text-slate-400'
                  }`}
                >
                  #{index + 1}
                </span>
                <span className="truncate font-bold text-slate-100">{entry.player_name}</span>
                <span className="text-right font-semibold text-cyan-300">
                  {formatTime(entry.clear_time_sec)}
                </span>
                <span className="text-right font-black text-orange-300">
                  {Math.round(entry.score)}
                </span>
                <span className="truncate">
                  <span className="rounded-full border border-violet-400/40 bg-violet-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-violet-200">
                    {entry.dominant_style || '—'}
                  </span>
                </span>
                <span className="text-right font-semibold text-rose-300">
                  {entry.alarms_triggered}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </MenuModalShell>
  );
}
