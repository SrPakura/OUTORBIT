import { useState } from 'react';
import { CODE_METRICS } from '../../data/contestConfig';
import { useWebI18n } from '../../i18n/useWebI18n';

export default function ShaderLayerInspector() {
  const { t } = useWebI18n();
  const [activeLayers, setActiveLayers] = useState<Record<string, boolean>>({
    '01': true,
    '02': true,
    '03': true,
    '04': true,
  });

  const toggle = (id: string) => {
    setActiveLayers((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <section className="cosmic-grid border-t-4 border-[#0b0d12] px-4 py-16 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="font-kicker text-xs text-[#22d3ee]">{t.resources.shaderKicker}</div>
        <h2 className="mt-1 font-comic text-4xl uppercase text-white drop-shadow-[4px_4px_0_#e11d48] sm:text-5xl">
          {t.resources.shaderTitle}
        </h2>

        <div className="mt-8 grid gap-8 lg:grid-cols-12 lg:items-center">
          {/* Diagrama visual interactivo de las 4 capas */}
          <div className="flex flex-col items-center justify-center border-[3px] border-[#22d3ee]/50 bg-[#05010f] p-8 lg:col-span-5">
            <div className="relative flex h-56 w-56 items-center justify-center">
              {/* Capa 02: Inverted Hull */}
              {activeLayers['02'] && (
                <div className="absolute h-44 w-44 rounded-full border-[6px] border-white opacity-95" />
              )}
              {/* Capa 01 + 03: Geometría + Nebulosa FBM */}
              {activeLayers['01'] && (
                <div
                  className="relative flex h-40 w-40 items-center justify-center rounded-full border-2 border-[#0b0d12] transition"
                  style={{
                    background: activeLayers['03']
                      ? 'radial-gradient(circle at 35% 30%, #06b6d4 0%, #7e22ce 45%, #090314 90%)'
                      : '#241d38',
                    boxShadow: activeLayers['04']
                      ? 'inset 0 0 24px rgba(59, 232, 255, 0.85), 0 0 28px rgba(124, 58, 237, 0.55)'
                      : 'none',
                  }}
                >
                  {/* Capa 04: Star Core */}
                  {activeLayers['04'] && (
                    <div
                      className="h-12 w-12 rotate-45 bg-[#ffcc33] shadow-[0_0_24px_#ffcc33]"
                      style={{ clipPath: 'polygon(50% 0%, 63% 37%, 100% 50%, 63% 63%, 50% 100%, 37% 63%, 0% 50%, 37% 37%)' }}
                    />
                  )}
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap justify-center gap-2 font-kicker text-[10px] text-slate-300">
              <span>{CODE_METRICS.totalSrcLines.toLocaleString()} LOC</span>
              <span>·</span>
              <span>{CODE_METRICS.glslBlocks} GLSL</span>
              <span>·</span>
              <span>{CODE_METRICS.nyxGlbCount + CODE_METRICS.enemyGlbCount} GLB</span>
            </div>
          </div>

          {/* Lista de toggles */}
          <div className="space-y-3 lg:col-span-7">
            {t.resources.shaderLayers.map((layer) => {
              const on = activeLayers[layer.id];
              return (
                <button
                  key={layer.id}
                  type="button"
                  onClick={() => toggle(layer.id)}
                  className={`flex w-full items-start justify-between gap-4 border-2 p-4 text-left transition ${
                    on
                      ? 'border-[#22d3ee] bg-[#0d0a1f] text-white shadow-[5px_5px_0_#22d3ee]'
                      : 'border-slate-700 bg-[#070414] text-slate-400'
                  }`}
                >
                  <div>
                    <div className="font-kicker text-[10px] text-[#fbbf24]">
                      CAPA {layer.id} · {on ? 'ON' : 'OFF'}
                    </div>
                    <div className="mt-1 font-comic text-xl uppercase">{layer.name}</div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-300">{layer.detail}</p>
                  </div>
                </button>
              );
            })}

            <div className="grid grid-cols-2 gap-2.5 pt-2 sm:grid-cols-4">
              <MetricChip label="src/ LOC" val={CODE_METRICS.totalSrcLines.toLocaleString()} />
              <MetricChip label="SHADERS GLSL" val={`${CODE_METRICS.glslBlocks}`} />
              <MetricChip label="CLIPS ENEMIGOS" val={`${CODE_METRICS.enemyClipsCount}`} />
              <MetricChip label="CLAVES I18N" val={`${CODE_METRICS.i18nKeysPerLang} × 3`} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function MetricChip({ label, val }: { label: string; val: string }) {
  return (
    <div className="border-2 border-slate-700 bg-[#0d0a1f] px-3 py-2">
      <div className="font-kicker text-[9px] text-slate-400">{label}</div>
      <div className="font-hud text-2xl font-extrabold text-[#3be8ff]">{val}</div>
    </div>
  );
}
