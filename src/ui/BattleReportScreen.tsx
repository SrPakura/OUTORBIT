import { useEffect, useMemo, useState } from 'react';
import type { HudSnapshot, LeaderboardEntryRecord } from '@/game/types';
import {
  computeBehaviorPercentages,
  getDominantStyleLabel,
} from '@/game/ai/BehaviorTracker';
import { KRONOS_PARAM_COUNT } from '@/game/ai/KronosNeuralNet';
import { fetchTopLeaderboard, submitLeaderboardEntry } from '@/api/leaderboard';

// ============================================================================
// Hito 4 — Battle Report: cómo te leyó la red MLP de KRONOS + Leaderboard
// ============================================================================

const STYLE_AXES: Array<{
  label: string;
  key: 'stealth' | 'aggression' | 'aerial' | 'subterranean' | 'stasis';
  color: string;
}> = [
  { label: 'SIGILO', key: 'stealth', color: '#34d399' },
  { label: 'AGRESIÓN', key: 'aggression', color: '#f87171' },
  { label: 'AÉREO', key: 'aerial', color: '#67e8f9' },
  { label: 'SUBSUELO', key: 'subterranean', color: '#facc15' },
  { label: 'ESTASIS', key: 'stasis', color: '#a78bfa' },
];

const RADAR_CENTER = 118;
const RADAR_RADIUS = 88;

function formatTime(totalSec: number): string {
  const minutes = Math.floor(totalSec / 60);
  const seconds = Math.floor(totalSec % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** Vértice del pentágono del eje `i` (0 arriba, sentido horario). */
function axisPoint(axisIndex: number, ratio: number): { x: number; y: number } {
  const angle = -Math.PI / 2 + (axisIndex * Math.PI * 2) / 5;
  return {
    x: RADAR_CENTER + Math.cos(angle) * RADAR_RADIUS * ratio,
    y: RADAR_CENTER + Math.sin(angle) * RADAR_RADIUS * ratio,
  };
}

function polygonPoints(ratios: number[]): string {
  return ratios
    .map((ratio, i) => {
      const p = axisPoint(i, ratio);
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    })
    .join(' ');
}

interface BattleReportScreenProps {
  snapshot: HudSnapshot;
  onPlayAgain: () => void;
  onExitToTitle: () => void;
}

/**
 * Pantalla final al derrotar al Comandante KRONOS: gráfica radar (pentágono)
 * + barras de los 5 ejes de estilo, informe de la red MLP híbrida (134
 * parámetros, offline + online), tiempo/alarmas/puntuación, envío al
 * leaderboard de Base44 (sin login) con Top 10 en vivo y botones de
 * JUGAR DE NUEVO / MENÚ PRINCIPAL.
 */
export default function BattleReportScreen({
  snapshot,
  onPlayAgain,
  onExitToTitle,
}: BattleReportScreenProps) {
  const pct = useMemo(
    () => computeBehaviorPercentages(snapshot.behaviorVector),
    [snapshot.behaviorVector]
  );
  const dominant = useMemo(() => getDominantStyleLabel(pct), [pct]);
  const onlineUpdates = snapshot.kronosUpdates ?? 0;

  const score = useMemo(() => {
    const v = snapshot.behaviorVector;
    return Math.max(
      0,
      Math.round(
        12000 -
          snapshot.elapsedRunSec * 4 -
          v.alarmsTriggered * 300 -
          v.damageTaken * 120 +
          v.parriesLanded * 60 +
          v.stealthKnockouts * 80 +
          v.bruteKills * 40
      )
    );
  }, [snapshot.behaviorVector, snapshot.elapsedRunSec]);

  const [callsign, setCallsign] = useState('PILOTO');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [topEntries, setTopEntries] = useState<LeaderboardEntryRecord[]>([]);

  const refreshLeaderboard = () => {
    fetchTopLeaderboard(10).then(setTopEntries);
  };

  useEffect(() => {
    refreshLeaderboard();
  }, []);

  const handleSave = async () => {
    if (saving || saved) return;
    setSaving(true);
    const name = callsign.trim() || 'PILOTO';
    const created = await submitLeaderboardEntry({
      player_name: name,
      clear_time_sec: Math.round(snapshot.elapsedRunSec),
      score,
      dominant_style: dominant,
      stealth_pct: Math.round(pct.stealth),
      aggression_pct: Math.round(pct.aggression),
      aerial_pct: Math.round(pct.aerial),
      subterranean_pct: Math.round(pct.subterranean),
      stasis_pct: Math.round(pct.stasis),
      alarms_triggered: snapshot.behaviorVector.alarmsTriggered,
    });
    setSaving(false);
    if (created) {
      setSaved(true);
      refreshLeaderboard();
    }
  };

  const radarRatios = STYLE_AXES.map((axis) => pct[axis.key] / 100);

  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#05010f]/92 p-4">
      <div className="max-h-full w-full max-w-4xl rounded-2xl border-4 border-yellow-400 bg-[#160b2e] p-8 shadow-[12px_12px_0_#000]">
        <p className="mb-1 text-center text-[10px] font-black tracking-[0.5em] text-yellow-300">
          BETA COMPLETA · COMANDANTE KRONOS DERROTADO
        </p>
        <h2 className="mb-6 text-center text-4xl font-black tracking-widest text-white drop-shadow-[3px_3px_0_#000]">
          INFORME DE COMBATE FINAL
        </h2>

        <div className="mb-6 grid gap-6 md:grid-cols-[240px_1fr]">
          {/* --- Gráfica SVG Radar (pentágono) --- */}
          <div className="rounded-xl border-2 border-black bg-black/40 p-3">
            <svg viewBox="0 0 236 236" className="mx-auto w-full max-w-[240px]">
              {/* Rejilla del pentágono (25/50/75/100%) */}
              {[0.25, 0.5, 0.75, 1].map((ring) => (
                <polygon
                  key={ring}
                  points={polygonPoints([ring, ring, ring, ring, ring])}
                  fill="none"
                  stroke="#3b3b58"
                  strokeWidth="1"
                />
              ))}
              {/* Ejes */}
              {STYLE_AXES.map((_, i) => {
                const p = axisPoint(i, 1);
                return (
                  <line
                    key={i}
                    x1={RADAR_CENTER}
                    y1={RADAR_CENTER}
                    x2={p.x}
                    y2={p.y}
                    stroke="#3b3b58"
                    strokeWidth="1"
                  />
                );
              })}
              {/* Perfil del jugador */}
              <polygon
                points={polygonPoints(radarRatios)}
                fill="rgba(103,232,249,0.28)"
                stroke="#67e8f9"
                strokeWidth="2.5"
              />
              {radarRatios.map((ratio, i) => {
                const p = axisPoint(i, ratio);
                return <circle key={i} cx={p.x} cy={p.y} r="3.5" fill="#67e8f9" />;
              })}
              {/* Etiquetas de los ejes */}
              {STYLE_AXES.map((axis, i) => {
                const p = axisPoint(i, 1.22);
                return (
                  <text
                    key={axis.key}
                    x={p.x}
                    y={p.y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="10"
                    fontWeight="900"
                    fill={axis.color}
                  >
                    {axis.label}
                  </text>
                );
              })}
            </svg>
          </div>

          {/* --- Barras de estilo + informe MLP --- */}
          <div className="space-y-2.5">
            {STYLE_AXES.map((axis) => (
              <div key={axis.key} className="flex items-center gap-3">
                <span className="w-24 text-right text-[10px] font-black tracking-[0.15em] text-slate-300">
                  {axis.label}
                </span>
                <span className="h-4 flex-1 overflow-hidden rounded-full border-2 border-black bg-slate-800">
                  <span
                    className="block h-full transition-all"
                    style={{
                      width: `${Math.max(2, Math.round(pct[axis.key]))}%`,
                      backgroundColor: axis.color,
                    }}
                  />
                </span>
                <span className="w-10 font-mono text-[11px] font-black tabular-nums text-slate-200">
                  {Math.round(pct[axis.key])}%
                </span>
              </div>
            ))}

            <div className="mt-4 rounded-xl border-2 border-black bg-black/40 p-4">
              <p className="mb-1 text-[10px] font-black tracking-[0.3em] text-red-400">
                LECTURA DE LA RED MLP DE KRONOS
              </p>
              <p className="text-[12px] font-semibold leading-snug text-slate-200">
                Red neuronal híbrida <span className="text-cyan-300">8 → 10 → 4</span> con{' '}
                <span className="text-yellow-300">{KRONOS_PARAM_COUNT} parámetros</span>{' '}
                pre-entrenados offline (MSE 0.00185 · 2000 partidas sintéticas) y{' '}
                <span className="text-yellow-300">{onlineUpdates} actualizaciones online</span>{' '}
                de backpropagation durante tu combate.
              </p>
              <p className="mt-1 text-[12px] font-semibold text-slate-200">
                Estilo dominante detectado:{' '}
                <span className="text-cyan-300">{dominant}</span>
              </p>
            </div>
          </div>
        </div>

        {/* --- Tiempo, alarmas y puntuación --- */}
        <div className="mb-6 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-xl border-2 border-black bg-black/40 px-3 py-3">
            <p className="text-[10px] font-black tracking-[0.25em] text-violet-300">TIEMPO</p>
            <p className="font-mono text-2xl font-black text-white">
              {formatTime(snapshot.elapsedRunSec)}
            </p>
          </div>
          <div className="rounded-xl border-2 border-black bg-black/40 px-3 py-3">
            <p className="text-[10px] font-black tracking-[0.25em] text-violet-300">ALARMAS</p>
            <p className="font-mono text-2xl font-black text-white">
              {snapshot.behaviorVector.alarmsTriggered}
            </p>
          </div>
          <div className="rounded-xl border-2 border-black bg-black/40 px-3 py-3">
            <p className="text-[10px] font-black tracking-[0.25em] text-violet-300">
              PUNTUACIÓN
            </p>
            <p className="font-mono text-2xl font-black text-yellow-300">{score}</p>
          </div>
        </div>

        {/* --- Envío al leaderboard + Top 10 --- */}
        <div className="mb-7 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border-2 border-black bg-black/40 p-4">
            <p className="mb-2 text-[10px] font-black tracking-[0.3em] text-cyan-300">
              REGISTRA TU GESTA
            </p>
            <input
              type="text"
              value={callsign}
              maxLength={18}
              onChange={(e) => setCallsign(e.target.value)}
              placeholder="Tu callsign"
              className="mb-3 w-full rounded-lg border-2 border-black bg-slate-800 px-3 py-2 text-sm font-bold text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400"
            />
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || saved}
              className={`w-full cursor-pointer rounded-xl border-4 border-black px-4 py-2.5 text-xs font-black tracking-widest shadow-[5px_5px_0_#000] transition-transform ${
                saved
                  ? 'bg-emerald-400 text-black'
                  : 'bg-cyan-400 text-black hover:-translate-y-0.5'
              } disabled:cursor-default`}
            >
              {saved
                ? '¡GUARDADO EN BASE44!'
                : saving
                  ? 'GUARDANDO...'
                  : 'GUARDAR EN LEADERBOARD BASE44'}
            </button>
            <p className="mt-2 text-center text-[10px] text-slate-500">
              Sin login obligatorio · Ranking global vía Base44
            </p>
          </div>

          <div className="rounded-xl border-2 border-black bg-black/40 p-4">
            <p className="mb-2 text-[10px] font-black tracking-[0.3em] text-yellow-300">
              TOP 10 PILOTOS
            </p>
            {topEntries.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-400">
                Sin registros aún. ¡Sé el primero!
              </p>
            ) : (
              <ol className="max-h-44 space-y-1 overflow-y-auto pr-1">
                {topEntries.map((entry, index) => (
                  <li
                    key={entry.id ?? `${entry.player_name}-${index}`}
                    className="flex items-center justify-between gap-2 rounded-lg bg-violet-950/60 px-2.5 py-1.5"
                  >
                    <span className="text-[10px] font-black text-yellow-300">#{index + 1}</span>
                    <span className="flex-1 truncate text-[11px] font-bold text-slate-100">
                      {entry.player_name}
                    </span>
                    <span className="text-[10px] font-semibold text-cyan-300">
                      {formatTime(entry.clear_time_sec)}
                    </span>
                    <span className="text-[10px] font-bold text-orange-300">
                      {Math.round(entry.score)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>

        {/* --- Botones finales --- */}
        <div className="flex flex-wrap justify-center gap-4">
          <button
            type="button"
            onClick={onPlayAgain}
            className="cursor-pointer rounded-xl border-4 border-black bg-yellow-400 px-8 py-3 text-base font-black tracking-widest text-black shadow-[6px_6px_0_#000] transition-transform hover:-translate-y-0.5"
          >
            JUGAR DE NUEVO
          </button>
          <button
            type="button"
            onClick={onExitToTitle}
            className="cursor-pointer rounded-xl border-4 border-black bg-slate-600 px-8 py-3 text-base font-black tracking-widest text-white shadow-[6px_6px_0_#000] transition-transform hover:-translate-y-0.5"
          >
            MENÚ PRINCIPAL
          </button>
        </div>
      </div>
    </div>
  );
}
