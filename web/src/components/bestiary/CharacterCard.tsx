import { Play, ShieldAlert } from 'lucide-react';
import type { EntityArchiveSpec } from '../../data/enemiesData';
import { NYX_PHYSICS } from '../../data/nyxData';
import { useWebI18n } from '../../i18n/useWebI18n';

interface CharacterCardProps {
  entity: EntityArchiveSpec;
  activeClip: string;
  onSelectClip: (clip: string) => void;
}

export default function CharacterCard({ entity, activeClip, onSelectClip }: CharacterCardProps) {
  const { t } = useWebI18n();
  const copy = t.bestiary.entities[entity.id];
  const minDrillSpeed =
    entity.fleshThickness !== null
      ? Math.max(
          NYX_PHYSICS.drillSpeedThreshold,
          Math.ceil((entity.fleshThickness / NYX_PHYSICS.drillForceMultiplier) * 10) / 10,
        )
      : null;

  return (
    <article
      className="relative overflow-hidden border-[3px] border-[#0b0d12] bg-[#fbfbf8] p-5 text-[#0b0d12] sm:p-7"
      style={{ boxShadow: `10px 10px 0 ${entity.rimHex}` }}
    >
      <div className="halftone-burst pointer-events-none absolute -right-12 -top-12 h-52 w-52 opacity-70" />

      {/* Número fantasma */}
      <div className="pointer-events-none absolute right-4 top-3 font-hud text-7xl font-extrabold italic text-[#0b0d12]/10">
        {entity.fileNo}
      </div>

      {/* Cabecera de identidad */}
      <div className="relative z-10 pr-16">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="border-2 border-[#0b0d12] px-2 py-0.5 font-kicker text-[10px] text-white"
            style={{ backgroundColor: entity.colorHex }}
          >
            {copy.role}
          </span>
          {entity.waveBadge && (
            <span className="border-2 border-[#0b0d12] bg-[#fbbf24] px-2 py-0.5 font-kicker text-[10px] text-[#0b0d12]">
              {entity.waveBadge}
            </span>
          )}
        </div>

        <h2 className="mt-2 font-comic text-4xl uppercase text-[#0b0d12] sm:text-5xl">
          {copy.name}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-[#2a2f3d]">{copy.summary}</p>
      </div>

      {/* Matriz de atributos físicos */}
      <div className="relative z-10 mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <StatBox label={t.bestiary.statsHp} value={String(entity.hp)} />
        <StatBox
          label={t.bestiary.statsFlesh}
          value={entity.fleshThickness !== null ? `${entity.fleshThickness}` : '—'}
          highlight={entity.fleshThickness !== null}
        />
        <StatBox label={t.bestiary.statsRadius} value={`${entity.radiusM} m`} />
        <StatBox label={t.bestiary.statsExp} value={entity.expValue !== null ? `${entity.expValue}` : '—'} />
        <StatBox label={t.bestiary.statsWeak} value={entity.weakPoints !== null ? `${entity.weakPoints}` : '—'} />
        <StatBox
          label={t.bestiary.statsBarrier}
          value={entity.barrierImmune ? t.bestiary.yes : t.bestiary.no}
        />
      </div>

      {entity.fleshThickness !== null && minDrillSpeed !== null && (
        <div className="relative z-10 mt-4 border-2 border-[#0b0d12] bg-[#f1f1ed] p-3">
          <div className="flex items-center justify-between font-kicker text-[10px] text-[#0b0d12]">
            <span>
              {t.bestiary.penetrationNeeded} {entity.fleshThickness}
            </span>
            <span className="text-[#e11d48]">≥ {minDrillSpeed} m/s (TALADRO ×1.55)</span>
          </div>
          <div className="mt-2 h-2.5 w-full border border-[#0b0d12] bg-white">
            <div
              className="h-full bg-[#e11d48]"
              style={{ width: `${Math.min(100, Math.round((entity.fleshThickness / 90) * 100))}%` }}
            />
          </div>
        </div>
      )}

      {/* Arquitectura de IA */}
      <div className="relative z-10 mt-6">
        <div className="font-kicker text-[10px] text-[#0b0d12]">{t.bestiary.aiFlowTitle}</div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {copy.aiFlow.map((step, i) => (
            <div key={step} className="flex items-center gap-1.5">
              <span className="border-2 border-[#0b0d12] bg-white px-2.5 py-1 font-kicker text-[10px] text-[#0b0d12]">
                {step}
              </span>
              {i < copy.aiFlow.length - 1 && (
                <span className="font-comic text-sm text-[#e11d48]">→</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Selector de clips GLB en vivo */}
      <div className="relative z-10 mt-6">
        <div className="font-kicker text-[10px] text-[#0b0d12]">{t.bestiary.clipsTitle}</div>
        {entity.clips.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {entity.clips.map((clip) => {
              const active = clip === activeClip;
              return (
                <button
                  key={clip}
                  type="button"
                  onClick={() => onSelectClip(clip)}
                  className={`inline-flex items-center gap-1 border-2 px-2.5 py-1 font-mono text-[11px] font-bold transition ${
                    active
                      ? 'border-[#0b0d12] bg-[#22d3ee] text-[#0b0d12] shadow-[2px_2px_0_#0b0d12]'
                      : 'border-[#0b0d12]/40 bg-[#f1f1ed] text-[#2a2f3d] hover:border-[#0b0d12]'
                  }`}
                >
                  <Play className="h-2.5 w-2.5" />
                  <span>{clip}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="mt-2 border-l-4 border-[#22d3ee] bg-[#f1f1ed] p-2.5 text-xs text-[#2a2f3d]">
            {t.bestiary.noClipsNyx}
          </p>
        )}
      </div>

      {/* Bloque táctico Counter */}
      <div className="relative z-10 mt-6 border-l-[6px] border-[#e11d48] bg-[#0b0d12] p-4 text-[#fbfbf8]">
        <div className="flex items-center gap-2 font-kicker text-[10px] text-[#fbbf24]">
          <ShieldAlert className="h-3.5 w-3.5" />
          <span>{t.bestiary.counterTitle}</span>
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-200">{copy.counter}</p>
      </div>
    </article>
  );
}

function StatBox({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="border-2 border-[#0b0d12] bg-[#f1f1ed] px-3 py-2">
      <div className="font-kicker text-[9px] text-[#2a2f3d]">{label}</div>
      <div
        className={`mt-0.5 font-hud text-xl font-extrabold uppercase ${
          highlight ? 'text-[#e11d48]' : 'text-[#0b0d12]'
        }`}
      >
        {value}
      </div>
    </div>
  );
}
