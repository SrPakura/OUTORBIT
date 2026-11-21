import type { HudSnapshot } from '@/game/types';
import {
  computeBehaviorPercentages,
  getDominantStyleLabel,
} from '@/game/ai/BehaviorTracker';

interface LevelTransitionModalProps {
  snapshot: HudSnapshot;
  onDeploy: () => void;
}

const STYLE_BARS: Array<{ label: string; key: 'stealth' | 'aggression' | 'aerial' | 'subterranean' | 'stasis'; color: string }> = [
  { label: 'SIGILO', key: 'stealth', color: 'bg-emerald-400' },
  { label: 'AGRESIÓN', key: 'aggression', color: 'bg-red-500' },
  { label: 'AÉREO', key: 'aerial', color: 'bg-cyan-300' },
  { label: 'SUBSUELO', key: 'subterranean', color: 'bg-yellow-400' },
  { label: 'ESTASIS', key: 'stasis', color: 'bg-violet-400' },
];

/**
 * Informe de Adaptación (Hito 3B): al cruzar un portal, la IA inter-planeta
 * presenta cómo te ha leído (barras del perfil de comportamiento) y qué
 * contramedidas desplegará en el siguiente planeta. El botón avanza de nivel
 * y recaptura el Pointer Lock.
 */
export default function LevelTransitionModal({
  snapshot,
  onDeploy,
}: LevelTransitionModalProps) {
  const pct = computeBehaviorPercentages(snapshot.behaviorVector);
  const dominant = getDominantStyleLabel(pct);

  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-[#05010f]/85 p-4">
      <div className="max-h-full w-full max-w-2xl overflow-y-auto rounded-2xl border-4 border-cyan-300 bg-[#160b2e] p-8 shadow-[10px_10px_0_#000]">
        <p className="mb-1 text-center text-[10px] font-black tracking-[0.5em] text-cyan-300">
          INFORME DE ADAPTACIÓN · RED DE IA
        </p>
        <h2 className="mb-1 text-center text-3xl font-black tracking-widest text-white drop-shadow-[3px_3px_0_#000]">
          {snapshot.levelTitle}
        </h2>
        <p className="mb-6 text-center text-xs font-bold text-slate-400">
          Perfil detectado: <span className="text-cyan-300">{dominant}</span>
        </p>

        {/* --- Barras del perfil de comportamiento --- */}
        <div className="mb-6 space-y-2.5">
          {STYLE_BARS.map((bar) => (
            <div key={bar.key} className="flex items-center gap-3">
              <span className="w-24 text-right text-[10px] font-black tracking-[0.15em] text-slate-300">
                {bar.label}
              </span>
              <span className="h-4 flex-1 overflow-hidden rounded-full border-2 border-black bg-slate-800">
                <span
                  className={`block h-full ${bar.color} transition-all`}
                  style={{ width: `${Math.max(2, Math.round(pct[bar.key]))}%` }}
                />
              </span>
              <span className="w-10 font-mono text-[11px] font-black tabular-nums text-slate-200">
                {Math.round(pct[bar.key])}%
              </span>
            </div>
          ))}
        </div>

        {/* --- Contramedidas desplegadas --- */}
        <div className="mb-7 rounded-xl border-2 border-black bg-black/40 p-4">
          <p className="mb-2 text-[10px] font-black tracking-[0.3em] text-red-400">
            CONTRAMEDIDAS DESPLEGADAS
          </p>
          {snapshot.adaptation.summaryReasons.length > 0 ? (
            <ul className="space-y-1.5">
              {snapshot.adaptation.summaryReasons.map((reason, i) => (
                <li key={i} className="flex gap-2 text-[12px] font-semibold leading-snug text-slate-200">
                  <span className="text-red-400">▸</span>
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12px] font-semibold text-slate-400">
              La IA aún no tiene datos suficientes sobre tu estilo.
            </p>
          )}
        </div>

        <div className="flex justify-center">
          <button
            type="button"
            onClick={onDeploy}
            className="cursor-pointer rounded-xl border-4 border-black bg-yellow-400 px-8 py-3 text-base font-black tracking-widest text-black shadow-[6px_6px_0_#000] transition-transform hover:-translate-y-0.5"
          >
            DESPLEGAR EN SIGUIENTE PLANETA
          </button>
        </div>
      </div>
    </div>
  );
}
