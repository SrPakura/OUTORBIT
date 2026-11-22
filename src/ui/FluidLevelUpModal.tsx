import { useEffect, useRef, useState } from 'react';

// ============================================================================
// Sección 4.3 del diseño — Subida de Nivel "En Caliente" (UI de 2 Cartas de
// Fluido): pausa visual con desenfoque cósmico, canvas de fluido líquido
// violeta/cian/carmesí que envuelve las 2 cartas y se disuelve (~450ms),
// elección por clic o teclado [1]/[2] y selector rápido de hueco si los
// 3 huecos de habilidad están llenos.
// ============================================================================

export interface FluidCardOption {
  id: string;
  kind: 'active_new' | 'active_upgrade' | 'passive';
  title: string;
  subtitle: string;
  rarity: 'base' | 'common' | 'epic' | 'legendary';
  currentLevel: number;
  nextLevel: number;
  description: string;
  accentColor: string;
  edenCost?: number;
}

export interface FluidLevelUpModalProps {
  isOpen: boolean;
  newLevel: number;
  choices: [FluidCardOption, FluidCardOption] | null;
  equippedSlots: Array<{ name: string | null; level: number }>;
  requiresSlotReplacement: boolean;
  onSelect: (option: FluidCardOption, replaceSlotIndex?: 0 | 1 | 2) => void;
}

const RARITY_STYLES: Record<
  FluidCardOption['rarity'],
  { label: string; color: string; glow: string }
> = {
  base: { label: 'BASE', color: '#34d399', glow: 'rgba(52,211,153,0.55)' },
  common: { label: 'COMÚN', color: '#22d3ee', glow: 'rgba(34,211,238,0.55)' },
  epic: { label: 'ÉPICA', color: '#a855f7', glow: 'rgba(168,85,247,0.6)' },
  legendary: { label: 'LEGENDARIA', color: '#fbbf24', glow: 'rgba(251,191,36,0.65)' },
};

const KIND_LABELS: Record<FluidCardOption['kind'], string> = {
  active_new: 'HABILIDAD NUEVA',
  active_upgrade: 'MEJORA +1 NV.',
  passive: 'PASIVA',
};

/** Fluido líquido cósmico: capas de ondas violeta/cian/carmesí + halftone. */
function drawCosmicFluid(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
): void {
  ctx.fillStyle = '#040510';
  ctx.fillRect(0, 0, w, h);

  const layers = [
    {
      top: 'rgba(109, 40, 217, 0.72)',
      bottom: 'rgba(168, 85, 247, 0.08)',
      amp: 0.2,
      freq: 1.6,
      speed: 0.9,
      base: 0.6,
    },
    {
      top: 'rgba(34, 211, 238, 0.55)',
      bottom: 'rgba(6, 182, 212, 0.05)',
      amp: 0.16,
      freq: 2.4,
      speed: -1.2,
      base: 0.48,
    },
    {
      top: 'rgba(244, 63, 94, 0.45)',
      bottom: 'rgba(244, 63, 94, 0.04)',
      amp: 0.12,
      freq: 3.2,
      speed: 1.5,
      base: 0.74,
    },
  ];

  for (const layer of layers) {
    const grad = ctx.createLinearGradient(0, h * (layer.base - layer.amp), 0, h);
    grad.addColorStop(0, layer.top);
    grad.addColorStop(1, layer.bottom);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) {
      const p = x / Math.max(1, w);
      const y =
        h * layer.base +
        Math.sin(p * Math.PI * 2 * layer.freq + t * layer.speed * 2.2) *
          h *
          layer.amp *
          0.55 +
        Math.sin(p * Math.PI * 2 * layer.freq * 2.7 - t * layer.speed * 1.4) *
          h *
          layer.amp *
          0.3;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
  }

  // Screentone halftone: puntos que respiran con el fluido
  const cell = Math.max(10, w / 56);
  for (let y = cell / 2; y < h; y += cell) {
    for (let x = cell / 2; x < w; x += cell) {
      const wave =
        (Math.sin(x * 0.02 + t * 1.7) + Math.sin(y * 0.026 - t * 1.2)) * 0.5;
      const radius = (wave * 0.5 + 0.5) * cell * 0.24;
      if (radius < 0.4) continue;
      ctx.fillStyle =
        (x + y) / cell % 2 < 1 ? 'rgba(34,211,238,0.4)' : 'rgba(168,85,247,0.34)';
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function FluidCard({
  option,
  hotkey,
  disabled,
  onChoose,
}: {
  option: FluidCardOption;
  hotkey: '1' | '2';
  disabled: boolean;
  onChoose: () => void;
}) {
  const rarity = RARITY_STYLES[option.rarity];
  const isUpgrade = option.nextLevel > option.currentLevel;

  return (
    <div style={{ animation: 'fluidCardReveal 420ms ease-out 240ms backwards' }}>
      <button
        type="button"
        onClick={onChoose}
        disabled={disabled}
        className="group -skew-x-6 cursor-pointer border-2 bg-[#090314]/92 p-5 text-left transition-transform hover:-translate-y-1.5 focus:outline-none disabled:cursor-default disabled:opacity-40"
        style={{
          borderColor: `${option.accentColor}80`,
          boxShadow: `0 0 26px ${option.accentColor}30, 8px 8px 0 rgba(4,5,16,0.9)`,
        }}
      >
        <div className="w-72 skew-x-6">
          <div className="flex items-center justify-between">
            <span className="border border-white/30 bg-white/5 px-1.5 py-0.5 text-[10px] font-black tracking-widest text-white/70">
              [{hotkey}]
            </span>
            <span
              className="border px-1.5 py-0.5 text-[9px] font-black tracking-[0.24em]"
              style={{
                color: rarity.color,
                borderColor: `${rarity.color}99`,
                backgroundColor: `${rarity.color}14`,
                textShadow: `0 0 8px ${rarity.glow}`,
              }}
            >
              {rarity.label}
            </span>
          </div>

          <p
            className="mt-3 text-lg font-black italic leading-tight tracking-tight"
            style={{ color: option.accentColor, textShadow: `0 0 12px ${rarity.glow}` }}
          >
            {option.title}
          </p>
          <p className="mt-0.5 text-[10px] font-bold tracking-[0.2em] text-white/50">
            {option.subtitle}
          </p>

          <div className="mt-3 flex items-center justify-between border-t border-white/15 pt-2.5">
            <span className="text-[10px] font-black tracking-[0.18em] text-white/45">
              {KIND_LABELS[option.kind]}
            </span>
            <span className="text-[11px] font-black tabular-nums text-white/90">
              {isUpgrade ? (
                <>
                  Nv. {option.currentLevel}{' '}
                  <span className="text-cyan-300">→ Nv. {option.nextLevel}</span>
                </>
              ) : (
                <>Nv. {option.currentLevel}</>
              )}
            </span>
          </div>

          {option.edenCost != null && (
            <p className="mt-2 text-[10px] font-black tracking-[0.22em] text-cyan-200/90">
              COSTE: {option.edenCost} EDÉN
            </p>
          )}

          <p className="mt-2.5 min-h-[48px] text-[11px] leading-relaxed text-white/70">
            {option.description}
          </p>
        </div>
      </button>
    </div>
  );
}

export function FluidLevelUpModal({
  isOpen,
  newLevel,
  choices,
  equippedSlots,
  requiresSlotReplacement,
  onSelect,
}: FluidLevelUpModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [pendingOption, setPendingOption] = useState<FluidCardOption | null>(null);

  // Reinicia el flujo de reemplazo de hueco al reabrir el modal
  useEffect(() => {
    if (!isOpen) setPendingOption(null);
  }, [isOpen]);

  // Canvas de fluido cósmico: anima mientras vive la disolución (~700ms)
  useEffect(() => {
    if (!isOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    };
    resize();
    window.addEventListener('resize', resize);

    let raf = 0;
    const start = performance.now();
    const loop = (now: number) => {
      drawCosmicFluid(ctx, canvas.width, canvas.height, (now - start) / 1000);
      if (now - start < 700) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [isOpen]);

  const chooseCard = (option: FluidCardOption) => {
    if (requiresSlotReplacement && option.kind === 'active_new') {
      setPendingOption(option);
      return;
    }
    onSelect(option);
  };

  const confirmSlot = (index: 0 | 1 | 2) => {
    if (!pendingOption) return;
    onSelect(pendingOption, index);
    setPendingOption(null);
  };

  // Teclado: [1]/[2] elige carta · con hueco pendiente [1]/[2]/[3] elige hueco
  useEffect(() => {
    if (!isOpen || !choices) return;
    const onKey = (e: KeyboardEvent) => {
      if (pendingOption) {
        if (e.key === 'Escape') {
          setPendingOption(null);
          return;
        }
        if (e.key === '1') confirmSlot(0);
        else if (e.key === '2') confirmSlot(1);
        else if (e.key === '3') confirmSlot(2);
        return;
      }
      if (e.key === '1') chooseCard(choices[0]);
      else if (e.key === '2') chooseCard(choices[1]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, choices, pendingOption, requiresSlotReplacement, onSelect]);

  if (!isOpen || !choices) return null;
  const [left, right] = choices;

  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex select-none flex-col items-center justify-center overflow-hidden bg-[#040510]/85 font-mono text-white backdrop-blur-md">
      {/* Screentone halftone ambiental */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          opacity: 0.3,
          backgroundImage:
            'radial-gradient(rgba(34,211,238,0.6) 2px, transparent 2.2px), radial-gradient(rgba(168,85,247,0.5) 1.7px, transparent 1.9px)',
          backgroundSize: '14px 14px, 14px 14px',
          backgroundPosition: '0 0, 7px 7px',
        }}
      />

      <p className="relative text-[10px] font-black tracking-[0.5em] text-cyan-300/80">
        FLUIDO EN CALIENTE · JUEGO EN PAUSA
      </p>
      <h2 className="relative mt-1.5 text-3xl font-black italic tracking-tight text-white drop-shadow-[3px_3px_0_rgba(4,5,16,0.9)]">
        NIVEL {newLevel}
      </h2>
      <p className="relative mt-1 text-[10px] font-bold tracking-[0.3em] text-white/50">
        ELIGE 1 DE 2 CARTAS · [1] IZQUIERDA · [2] DERECHA
      </p>

      {/* Cartas envueltas en el fluido que se disuelve */}
      <div className="relative mt-7">
        <canvas
          ref={canvasRef}
          className="absolute -inset-6 h-[calc(100%+48px)] w-[calc(100%+48px)]"
          style={{ animation: 'fluidDissolve 450ms ease-out 120ms forwards' }}
        />
        <div className="relative flex gap-6">
          <FluidCard
            option={left}
            hotkey="1"
            disabled={pendingOption != null}
            onChoose={() => chooseCard(left)}
          />
          <FluidCard
            option={right}
            hotkey="2"
            disabled={pendingOption != null}
            onChoose={() => chooseCard(right)}
          />
        </div>
      </div>

      {/* Selector rápido de hueco: carta activa nueva con los 3 huecos llenos */}
      {pendingOption && (
        <div
          className="relative mt-6 border-2 border-cyan-300/70 bg-[#090314]/95 px-5 py-4 shadow-[0_0_24px_rgba(34,211,238,0.35),8px_8px_0_rgba(4,5,16,0.9)]"
          style={{ animation: 'fluidCardReveal 220ms ease-out' }}
        >
          <p className="text-[10px] font-black tracking-[0.3em] text-cyan-200">
            HUECOS LLENOS · ELIGE CUÁL REEMPLAZAR · [1]/[2]/[3] · ESC PARA VOLVER
          </p>
          <div className="mt-3 flex gap-3">
            {equippedSlots.map((slot, i) => {
              const index = i as 0 | 1 | 2;
              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => confirmSlot(index)}
                  className="-skew-x-12 cursor-pointer border border-white/35 bg-[#0d0522]/80 px-4 py-2 transition-colors hover:border-cyan-300 hover:bg-cyan-400/10"
                >
                  <span className="block skew-x-12 text-[10px] font-bold tracking-[0.2em] text-white/85">
                    <span className="font-black text-cyan-300">[{index + 1}]</span>{' '}
                    {slot.name ?? 'VACÍO'} · Nv. {slot.level}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Los 3 huecos equipados, como referencia */}
      <div className="relative mt-7 flex gap-2.5">
        {equippedSlots.map((slot, i) => (
          <div
            key={i}
            className="-skew-x-12 border border-white/25 bg-[#090314]/55 px-3.5 py-1.5"
          >
            <span className="block skew-x-12 text-[10px] font-bold tracking-[0.22em] text-white/60">
              <span className="font-black text-white/40">{i + 1}</span>{' '}
              {slot.name ?? 'VACÍO'}
              {slot.name != null ? ` · Nv. ${slot.level}` : ''}
            </span>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes fluidDissolve {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        @keyframes fluidCardReveal {
          from { opacity: 0; transform: translateY(18px) scale(0.96); }
          to { opacity: 1; transform: none; }
        }
      `}</style>
    </div>
  );
}

export default FluidLevelUpModal;
