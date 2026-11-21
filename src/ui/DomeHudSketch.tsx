import { memo } from 'react';
import type { DomeHudState, NyxMovementMode } from '@/game/dome/domeTypes';

interface DomeHudSketchProps {
  hud: DomeHudState;
  onExit: () => void;
}

const MODE_LABELS: Record<NyxMovementMode, string> = {
  grounded: 'SUELO',
  zero_g: '0G FLOTANDO',
  falling: 'CAÍDA',
  kicking: 'PATADA',
  kick_recover: 'RECUPERACIÓN',
  dashing: 'AIR DASH',
};

function Bar({
  value,
  max,
  className,
  trackClass = 'bg-white/10',
}: {
  value: number;
  max: number;
  className: string;
  trackClass?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={`h-1.5 w-full overflow-hidden ${trackClass}`}>
      <div
        className={`h-full transition-[width] duration-150 ${className}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function DomeHudSketchInner({ hud, onExit }: DomeHudSketchProps) {
  const modeLabel = MODE_LABELS[hud.mode] ?? '—';
  const aimDist = hud.aimDistance != null ? `${hud.aimDistance.toFixed(0)}m` : null;

  return (
    <div className="pointer-events-none absolute inset-0 z-20 select-none overflow-hidden font-mono text-white">
      {/* 1. Líneas de velocidad cómic */}
      {hud.speedLinesIntensity > 0.05 && (
        <div
          className="absolute inset-0 mix-blend-screen"
          style={{
            opacity: Math.min(1, hud.speedLinesIntensity),
            background:
              'repeating-conic-gradient(from 0deg at 50% 50%, rgba(255,255,255,0.55) 0deg 0.35deg, transparent 0.35deg 3.2deg)',
            maskImage:
              'radial-gradient(circle at 50% 50%, transparent 34%, black 78%)',
            WebkitMaskImage:
              'radial-gradient(circle at 50% 50%, transparent 34%, black 78%)',
          }}
        />
      )}

      {/* 2. Flash de rebote de cúpula */}
      {hud.domeBounceFlash > 0.01 && (
        <div
          className="absolute inset-0"
          style={{
            opacity: Math.min(1, hud.domeBounceFlash),
            boxShadow: 'inset 0 0 120px 30px rgba(244,63,94,0.55)',
            border: '3px solid rgba(244,63,94,0.6)',
          }}
        />
      )}

      {/* 3. Retículo central dinámico */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="relative flex flex-col items-center">
          <div className="relative flex h-8 w-8 items-center justify-center">
            {/* Aro exterior taladro listo */}
            {hud.isDrillReady && (
              <div
                className="absolute inset-0 rounded-full border-2 border-amber-300"
                style={{
                  animation: 'domeHudPulse 0.9s ease-in-out infinite',
                  boxShadow: '0 0 12px rgba(232,121,249,0.8)',
                }}
              />
            )}
            {/* Anillo principal */}
            <div
              className={`absolute inset-1.5 rounded-full border-2 ${
                hud.aimingAtSurface
                  ? 'border-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.9)]'
                  : 'border-white/70'
              }`}
            />
            {/* Punto central */}
            <div
              className={`h-1.5 w-1.5 rounded-full ${
                hud.aimingAtSurface ? 'bg-cyan-300' : 'bg-white/90'
              }`}
            />
          </div>
          {hud.aimingAtSurface && aimDist && (
            <div className="mt-1 flex flex-col items-center gap-0.5">
              <span className="-skew-x-12 bg-cyan-400/90 px-2 py-0.5 text-[11px] font-bold tracking-widest text-[#090314]">
                {aimDist}
              </span>
              <span className="text-[9px] tracking-widest text-cyan-200/80">
                CLIC DER: ATERRIZAR
              </span>
            </div>
          )}
          {hud.isDrillReady && (
            <span className="mt-1 -skew-x-12 bg-fuchsia-500/90 px-2 py-0.5 text-[10px] font-bold tracking-widest text-[#090314]">
              TALADRO LISTO
            </span>
          )}
        </div>
      </div>

      {/* 4. Panel superior izquierdo — medidores */}
      <div className="absolute left-4 top-4 w-64 -skew-x-12 border-2 border-white/80 bg-[#090314]/80 p-3 shadow-[6px_6px_0_rgba(168,85,247,0.5)] [transform-origin:top_left]">
        <div className="skew-x-12">
          <div className="flex items-baseline justify-between">
            <span className="-skew-x-12 bg-violet-500 px-2 py-0.5 text-sm font-black tracking-widest text-[#090314]">
              NV. {hud.level}
            </span>
            <span className="text-[10px] tracking-widest text-white/60">
              EXP {hud.exp}/{hud.expToNext}
            </span>
          </div>
          <div className="mt-1">
            <Bar value={hud.exp} max={hud.expToNext} className="bg-violet-400" />
          </div>

          <div className="mt-3 flex items-baseline justify-between text-[10px] tracking-widest">
            <span className="text-rose-300">HP</span>
            <span className="text-white/70">
              {Math.max(0, Math.ceil(hud.hp))}/{hud.maxHp}
            </span>
          </div>
          <div className="mt-0.5">
            <Bar
              value={hud.hp}
              max={hud.maxHp}
              className="bg-gradient-to-r from-rose-500 to-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.8)]"
            />
          </div>

          <div className="mt-2 flex items-baseline justify-between text-[10px] tracking-widest">
            <span className="text-cyan-300">EDÉN</span>
            <span className="text-white/70">
              {Math.max(0, Math.ceil(hud.eden))}/{hud.maxEden}
            </span>
          </div>
          <div className="mt-0.5">
            <Bar
              value={hud.eden}
              max={hud.maxEden}
              className="bg-gradient-to-r from-cyan-400 to-violet-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]"
            />
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-white/20 pt-2">
            <span
              className={`-skew-x-12 px-2 py-0.5 text-[11px] font-bold tracking-widest ${
                hud.mode === 'zero_g'
                  ? 'bg-cyan-400 text-[#090314]'
                  : hud.mode === 'dashing' || hud.mode === 'kicking'
                    ? 'bg-fuchsia-500 text-[#090314]'
                    : 'bg-white/90 text-[#090314]'
              }`}
            >
              {modeLabel}
            </span>
            <span className="text-sm font-bold tabular-nums text-white">
              {Math.round(hud.speed)}
              <span className="ml-1 text-[10px] text-white/60">m/s</span>
            </span>
          </div>
        </div>
      </div>

      {/* 5. Panel inferior central — selector de habilidades */}
      <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 gap-3">
        {hud.slots.map((slot, i) => {
          const slotNum = (i + 1) as 1 | 2 | 3;
          const active = hud.activeSlot === slotNum;
          return (
            <div
              key={slotNum}
              className={`-skew-x-12 border-2 px-4 py-1.5 backdrop-blur-sm transition-colors ${
                active
                  ? 'border-cyan-300 bg-cyan-400/20 shadow-[0_0_14px_rgba(34,211,238,0.7)]'
                  : 'border-white/50 bg-[#090314]/70'
              }`}
            >
              <div className="flex skew-x-12 items-center gap-2">
                <span
                  className={`-skew-x-12 px-1.5 py-0.5 text-xs font-black ${
                    active ? 'bg-cyan-300 text-[#090314]' : 'bg-white/85 text-[#090314]'
                  }`}
                >
                  {slot.keyLabel}
                </span>
                <span
                  className={`text-[11px] font-bold tracking-widest ${
                    slot.name ? 'text-white' : 'text-white/40'
                  }`}
                >
                  {slot.name ?? 'VACÍO'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 6. Aviso de pointer lock */}
      {!hud.pointerLocked && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#090314]/40">
          <div className="-skew-x-12 border-2 border-white bg-[#090314]/90 px-6 py-2 shadow-[6px_6px_0_rgba(34,211,238,0.6)]">
            <span className="block skew-x-12 text-xs font-bold tracking-[0.2em] text-white">
              HAZ CLIC EN LA ARENA PARA CAPTURAR EL RATÓN · ESC PARA SOLTAR
            </span>
          </div>
          <div className="max-w-xl text-center text-[10px] leading-relaxed tracking-widest text-white/60">
            WASD: MOVER/VOLAR · ESPACIO: SALTAR / 0G · SHIFT: AIR DASH / DERRAPE
            <br />
            CLIC IZQ: PATADA / TALADRO · CLIC DER: 0G / ATERRIZAR
          </div>
        </div>
      )}

      {/* 7. Botón Menú */}
      <button
        type="button"
        onClick={onExit}
        className="pointer-events-auto absolute right-4 top-4 -skew-x-12 border-2 border-white/80 bg-[#090314]/80 px-4 py-1.5 text-xs font-bold tracking-widest text-white transition-colors hover:border-cyan-300 hover:bg-cyan-400/20 hover:text-cyan-200"
      >
        <span className="block skew-x-12">← MENÚ</span>
      </button>

      <style>{`
        @keyframes domeHudPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.25); opacity: 0.55; }
        }
      `}</style>
    </div>
  );
}

export const DomeHudSketch = memo(DomeHudSketchInner);
export default DomeHudSketch;
