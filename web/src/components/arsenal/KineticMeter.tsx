import { useState } from 'react';
import { BESTIARY_ENTITIES } from '../../data/enemiesData';
import { NYX_PHYSICS, NYX_SPEED_PRESETS } from '../../data/nyxData';
import { useWebI18n } from '../../i18n/useWebI18n';

export default function KineticMeter() {
  const { t } = useWebI18n();
  const [speed, setSpeed] = useState(23.5);

  const isDrill = speed >= NYX_PHYSICS.drillSpeedThreshold;
  const isBounce = speed >= NYX_PHYSICS.kineticTriggerSpeed;
  const kineticForce = speed * (isDrill ? NYX_PHYSICS.drillForceMultiplier : 1.0);

  const reticleColor = isDrill ? '#e11d48' : isBounce ? '#7fd8ff' : '#ffffff';
  const reticleScale = 1 - Math.min(0.08, speed * 0.003);
  const stateLabel = isDrill
    ? t.arsenal.reticleDrill
    : isBounce
      ? t.arsenal.reticleBounce
      : t.arsenal.reticleNormal;

  const enemies = BESTIARY_ENTITIES.filter((e) => e.fleshThickness !== null);

  return (
    <div className="border-[3px] border-[#0b0d12] bg-[#fbfbf8] p-5 shadow-[8px_8px_0_#22d3ee] sm:p-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex-1">
          <div className="font-kicker text-[11px] text-[#e11d48]">{t.arsenal.meterTitle}</div>

          <div className="mt-4 flex flex-wrap items-baseline gap-6">
            <div>
              <div className="font-kicker text-[10px] text-[#2a2f3d]">{t.arsenal.meterLabel}</div>
              <div className="font-hud text-5xl font-extrabold italic text-[#0b0d12]">
                {speed.toFixed(1)} <span className="text-2xl text-[#e11d48]">m/s</span>
              </div>
            </div>

            <div>
              <div className="font-kicker text-[10px] text-[#2a2f3d]">{t.arsenal.forceLabel}</div>
              <div className="font-hud text-5xl font-extrabold italic text-[#0e7490]">
                {kineticForce.toFixed(1)}
                {isDrill && (
                  <span className="ml-2 border-2 border-[#0b0d12] bg-[#e11d48] px-2 py-0.5 align-middle font-kicker text-[10px] not-italic text-white">
                    ×1.55
                  </span>
                )}
              </div>
            </div>
          </div>

          <input
            type="range"
            min={0}
            max={34}
            step={0.1}
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="mt-4 w-full accent-[#e11d48]"
            aria-label={t.arsenal.meterLabel}
          />

          <div className="mt-3 flex flex-wrap gap-1.5">
            {NYX_SPEED_PRESETS.map((p) => {
              const active = Math.abs(speed - p.speed) < 0.05;
              const label = t.arsenal.presets[p.id];
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSpeed(p.speed)}
                  className={`border-2 border-[#0b0d12] px-2.5 py-1 font-kicker text-[10px] transition ${
                    active
                      ? 'bg-[#0b0d12] text-[#22d3ee]'
                      : 'bg-[#f1f1ed] text-[#0b0d12] hover:bg-[#e2e2dc]'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Réplica en vivo del Visor Giroscópico SVG (120px) */}
        <div className="flex shrink-0 flex-col items-center border-[3px] border-[#0b0d12] bg-[#05010f] px-6 py-4 text-center">
          <svg
            width={NYX_PHYSICS.reticleSizePx}
            height={NYX_PHYSICS.reticleSizePx}
            viewBox="0 0 120 120"
            style={{ transform: `scale(${reticleScale.toFixed(3)})`, transition: 'transform 120ms ease' }}
          >
            <polygon
              points="36,8 84,8 112,36 112,84 84,112 36,112 8,84 8,36"
              fill="none"
              stroke={reticleColor}
              strokeWidth="2.5"
              strokeOpacity="0.88"
            />
            <circle
              cx="60"
              cy="60"
              r="34"
              fill="none"
              stroke={reticleColor}
              strokeWidth="2"
              strokeDasharray="24 14"
              className="animate-slow-spin origin-center"
            />
            <path
              d="M60 36 L65 55 L84 60 L65 65 L60 84 L55 65 L36 60 L55 55 Z"
              fill={reticleColor}
            />
          </svg>
          <span
            className="mt-2 font-kicker text-[10px]"
            style={{ color: reticleColor }}
          >
            {stateLabel}
          </span>
        </div>
      </div>

      {/* Tabla de penetración en tiempo real */}
      <div className="mt-6 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {enemies.map((e) => {
          const flesh = e.fleshThickness ?? 0;
          const penetrates = kineticForce >= flesh;
          const enemyName = t.bestiary.entities[e.id].name;
          return (
            <div
              key={e.id}
              className={`border-2 border-[#0b0d12] p-3 transition ${
                penetrates ? 'bg-[#0b0d12] text-white' : 'bg-[#f1f1ed] text-[#0b0d12]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-comic text-base uppercase">{enemyName}</span>
                <span className="font-hud text-lg font-extrabold">{flesh}</span>
              </div>
              <div
                className={`mt-1.5 inline-block px-2 py-0.5 font-kicker text-[9px] ${
                  penetrates
                    ? 'bg-[#22d3ee] text-[#0b0d12]'
                    : 'border border-[#0b0d12] bg-white text-[#e11d48]'
                }`}
              >
                {penetrates ? t.arsenal.penetrateTag : t.arsenal.wearTag}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
