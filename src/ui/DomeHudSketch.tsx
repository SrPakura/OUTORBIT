import { memo } from 'react';
import type { DomeHudState } from '@/game/dome/domeTypes';
import { RETICLE_SIZE_PX } from '@/game/dome/domeTypes';

interface DomeHudSketchProps {
  hud: DomeHudState;
  onExit: () => void;
  hidePointerLockPrompt?: boolean;
}

const RETICLE_SIZE = RETICLE_SIZE_PX; // 180px en pantalla para enmarcar sin tapar a Nyx

const HALFTONE_MASK =
  'radial-gradient(circle at 50% 50%, transparent 48%, rgba(0,0,0,0.45) 72%, black 96%)';

const CORNER_MASK = [
  'radial-gradient(circle at 0% 0%, black 0%, transparent 44%)',
  'radial-gradient(circle at 100% 0%, black 0%, transparent 44%)',
  'radial-gradient(circle at 0% 100%, black 0%, transparent 44%)',
  'radial-gradient(circle at 100% 100%, black 0%, transparent 44%)',
].join(', ');

function Meter({
  label,
  value,
  max,
  barClass,
  glow,
}: {
  label: string;
  value: number;
  max: number;
  barClass: string;
  glow: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="mt-2">
      <div className="flex items-baseline justify-between text-[9px] font-bold tracking-[0.28em]">
        <span className="text-white/55">{label}</span>
        <span className="tabular-nums text-white/40">
          {Math.max(0, Math.ceil(value))}
        </span>
      </div>
      <div className="mt-1 h-[3px] w-full -skew-x-12 overflow-hidden bg-white/12">
        <div
          className={`h-full transition-[width] duration-150 ${barClass}`}
          style={{ width: `${pct}%`, boxShadow: glow }}
        />
      </div>
    </div>
  );
}

function DomeHudSketchInner({ hud, onExit, hidePointerLockPrompt }: DomeHudSketchProps) {
  const lock = hud.reticleLockState;
  const isLocked = lock === 'locked';

  // --- Estrella central: blanca → roja (lockeable) → roja incandescente (lock)
  const starStroke = lock === 'none' ? '#ffffff' : lock === 'can_lock' ? '#ff2a55' : '#ff1e42';
  const starFill = isLocked ? 'rgba(255, 30, 66, 0.22)' : 'none';
  const starStyle =
    lock === 'locked'
      ? { filter: 'drop-shadow(0 0 10px #ff1e42)' }
      : lock === 'can_lock'
        ? { filter: 'drop-shadow(0 0 4px rgba(255,42,85,0.55))' }
        : undefined;
  const dotFill = lock === 'none' ? '#ffffff' : lock === 'can_lock' ? '#ff2a55' : '#ff1e42';

  const enemyPos =
    hud.lockedEnemyScreenPos != null && (lock === 'locked' || lock === 'can_lock')
      ? hud.lockedEnemyScreenPos
      : null;

  // --- Screentones halftone: ganan densidad con la velocidad y el impacto
  const halftoneOpacity = Math.min(
    0.88,
    Math.max(0, (hud.speed - 7) / 14) + hud.impactFlash * 0.45,
  );
  const pressureActive = hud.mode === 'speed_attack' || hud.mode === 'dashing';
  const pressureOpacity = Math.min(0.72, 0.24 + halftoneOpacity * 0.55);

  const isVoidFall = hud.mode === 'speed_attack' && hud.speedAttackKind === 'void_fall';
  const bulletRingRatio = Math.max(0, Math.min(1, hud.bulletTimeRemaining / 1.25));
  const expPct =
    hud.expToNext > 0 ? Math.max(0, Math.min(100, (hud.exp / hud.expToNext) * 100)) : 0;

  return (
    <div className="pointer-events-none absolute inset-0 z-20 select-none overflow-hidden font-mono text-white">
      {/* 1. Screentones halftone manga en los bordes — densidad por velocidad */}
      {halftoneOpacity > 0.01 && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            opacity: halftoneOpacity,
            backgroundImage:
              'radial-gradient(rgba(34, 211, 238, 0.85) 2.2px, transparent 2.4px), radial-gradient(rgba(168, 85, 247, 0.75) 1.8px, transparent 2.0px)',
            backgroundSize: '12px 12px, 12px 12px',
            backgroundPosition: '0 0, 6px 6px',
            maskImage: HALFTONE_MASK,
            WebkitMaskImage: HALFTONE_MASK,
          }}
        />
      )}

      {/* 1b. Corona de presión G en las esquinas — dash / ataque de velocidad */}
      {pressureActive && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            opacity: pressureOpacity,
            backgroundImage:
              'radial-gradient(rgba(244, 63, 94, 0.55) 2.6px, transparent 2.8px), radial-gradient(rgba(9, 3, 20, 0.85) 3.4px, transparent 3.6px)',
            backgroundSize: '16px 16px, 16px 16px',
            backgroundPosition: '0 0, 8px 8px',
            maskImage: CORNER_MASK,
            WebkitMaskImage: CORNER_MASK,
          }}
        />
      )}

      {/* 2. Flash de rebote contra la cúpula */}
      {hud.domeBounceFlash > 0.01 && (
        <div
          className="absolute inset-0"
          style={{
            opacity: Math.min(1, hud.domeBounceFlash),
            boxShadow: 'inset 0 0 120px 30px rgba(244,63,94,0.45)',
          }}
        />
      )}

      {/* 2b. Mancha de tinta del Pulpo Espiral */}
      {(hud.inkOverlayIntensity ?? 0) > 0.01 && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            opacity: Math.min(0.92, hud.inkOverlayIntensity ?? 0),
            background:
              'radial-gradient(circle at 22% 30%, rgba(10,4,22,0.94) 0%, transparent 42%), radial-gradient(circle at 76% 65%, rgba(10,4,22,0.92) 0%, transparent 46%), radial-gradient(circle at 50% 50%, rgba(15,6,30,0.45) 0%, rgba(6,2,14,0.88) 95%)',
          }}
        />
      )}

      {/* 3. Viñeta abisal de Caída al Vacío */}
      {isVoidFall && (
        <div
          className="absolute inset-0"
          style={{
            boxShadow:
              'inset 0 0 220px 70px rgba(109,40,217,0.40), inset 0 0 130px 36px rgba(79,70,229,0.30)',
          }}
        />
      )}

      {/* 4. Tinte de cámara lenta en los bordes */}
      {hud.bulletTimeActive && (
        <div
          className="absolute inset-0"
          style={{
            boxShadow:
              'inset 0 0 180px 40px rgba(34,211,238,0.22), inset 0 0 90px 24px rgba(168,85,247,0.18)',
          }}
        />
      )}

      {/* 5. Visor central (visor.svg) */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <svg
          width={RETICLE_SIZE}
          height={RETICLE_SIZE}
          viewBox="0 0 512 512"
          className="overflow-visible"
          style={
            hud.impactFlash > 0.05
              ? { transform: `scale(${1 + hud.impactFlash * 0.1})` }
              : undefined
          }
        >
          <defs>
            <filter id="hud-contrast" x="-15%" y="-15%" width="130%" height="130%">
              <feDropShadow
                dx="0"
                dy="0"
                stdDeviation="3"
                floodColor="#000000"
                floodOpacity="0.55"
              />
            </filter>
          </defs>

          <g id="visor-gravity" fill="none" stroke="#ffffff" filter="url(#hud-contrast)">
            {/* Octógono exterior — diafragma que se cierra con la velocidad */}
            <polygon
              id="octagon-outer"
              stroke="#ffffff"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeOpacity="0.8"
              points="256,40 331.01,74.92 408.74,103.26 437.08,180.99 472,256 437.08,331.01 408.74,408.74 331.01,437.08 256,472 180.99,437.08 103.26,408.74 74.92,331.01 40,256 74.92,180.99 103.26,103.26 180.99,74.92"
              style={{
                transform: `scale(${1 - Math.min(0.08, hud.speed * 0.003)})`,
                transformOrigin: '256px 256px',
              }}
            />
            <polygon
              id="octagon-inner"
              stroke="#ffffff"
              strokeWidth="5"
              strokeLinejoin="round"
              points="256,54 325.65,87.85 398.84,113.16 424.15,186.35 458,256 424.15,325.65 398.84,398.84 325.65,424.15 256,458 186.35,424.15 113.16,398.84 87.85,325.65 54,256 87.85,186.35 113.16,113.16 186.35,87.85"
            />

            {/* Arcos giroscópicos — giran con el spin del cuerpo */}
            <g
              id="gyro-arcs"
              stroke="#ffffff"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeOpacity="0.5"
              style={{
                transform: `rotate(${(hud.gyroSpinRad * 57.2958) % 360}deg)`,
                transformOrigin: '256px 256px',
              }}
            >
              <path d="M 305.03 159.77 A 108 108 0 0 1 352.23 206.97" />
              <path d="M 352.23 305.03 A 108 108 0 0 1 305.03 352.23" />
              <path d="M 206.97 352.23 A 108 108 0 0 1 159.77 305.03" />
              <path d="M 159.77 206.97 A 108 108 0 0 1 206.97 159.77" />
            </g>

            {/* Ticks cardinales — horizonte artificial, contra-roll de cámara */}
            <g
              id="cardinal-ticks"
              stroke="#ffffff"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeOpacity="0.7"
              style={{
                transform: `rotate(${-hud.cameraRollDeg}deg)`,
                transformOrigin: '256px 256px',
              }}
            >
              <line x1="256" y1="68" x2="256" y2="78" />
              <line x1="256" y1="434" x2="256" y2="444" />
              <line x1="68" y1="256" x2="78" y2="256" />
              <line x1="434" y1="256" x2="444" y2="256" />
            </g>

            {/* Anillo fino de cuenta atrás de cámara lenta */}
            {hud.bulletTimeActive && (
              <circle
                id="bullet-time-ring"
                cx="256"
                cy="256"
                r="150"
                fill="none"
                stroke="#22d3ee"
                strokeWidth="2"
                strokeLinecap="round"
                strokeOpacity="0.85"
                strokeDasharray={`${2 * Math.PI * 150 * bulletRingRatio} ${2 * Math.PI * 150}`}
                transform="rotate(-90 256 256)"
                style={{ filter: 'drop-shadow(0 0 6px #22d3ee)' }}
              />
            )}

            {/* Estrella central de 4 puntas */}
            <path
              id="center-star"
              stroke={starStroke}
              fill={starFill}
              strokeWidth="4.5"
              strokeLinejoin="round"
              style={starStyle}
              d="M 256 94 C 261.5 94, 266 174, 284 228 C 338 246, 418 250.5, 418 256 C 418 261.5, 338 266, 284 284 C 266 338, 261.5 418, 256 418 C 250.5 418, 246 338, 228 284 C 174 266, 94 261.5, 94 256 C 94 250.5, 174 246, 228 228 C 246 174, 250.5 94, 256 94 Z"
            />

            {/* Punto de mira exacto */}
            <circle id="center-dot" cx="256" cy="256" r="3" fill={dotFill} stroke="none" />
          </g>
        </svg>

        {/* Etiqueta compacta de cámara lenta, bajo el visor */}
        {hud.bulletTimeActive && (
          <div
            className="absolute left-1/2 top-full mt-4 -translate-x-1/2"
            style={{ animation: 'domeHudBulletPulse 0.9s ease-in-out infinite' }}
          >
            <span className="whitespace-nowrap text-[10px] font-bold tracking-[0.32em] text-cyan-200/90 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]">
              ⚡ DASH [CLIC DER] PARA REDIRIGIR PATADA
            </span>
          </div>
        )}
      </div>

      {/* 6. Marcador romboidal sobre el enemigo lockeado / lockeable */}
      {enemyPos && (
        <svg
          className="absolute"
          width="22"
          height="22"
          viewBox="0 0 22 22"
          style={{
            left: enemyPos.x - 11,
            top: enemyPos.y - 11,
            animation: 'domeHudPulse 0.9s ease-in-out infinite',
          }}
        >
          <polygon points="11,1 20,11 11,21 2,11" fill="none" stroke="#ff2a55" strokeWidth="2" />
          <polygon points="11,6 15.5,11 11,16 6.5,11" fill="#ff2a55" />
        </svg>
      )}

      {/* 7. Panel superior izquierdo — nivel, EXP, HP y EDÉN */}
      <div className="absolute left-5 top-5 w-52">
        <div className="flex items-baseline gap-2">
          <span className="text-[10px] font-black tracking-[0.4em] text-white/45">NV.</span>
          <span className="text-2xl font-black italic leading-none tracking-tight text-white">
            {hud.level}
          </span>
        </div>
        <div className="mt-1.5 h-px w-full -skew-x-12 overflow-hidden bg-white/15">
          <div
            className="h-full bg-violet-300/90 transition-[width] duration-150"
            style={{ width: `${expPct}%` }}
          />
        </div>

        <Meter
          label="HP"
          value={hud.hp}
          max={hud.maxHp}
          barClass="bg-gradient-to-r from-[#ff6b5e] to-[#ff8f7a]"
          glow="0 0 8px rgba(255,107,94,0.75)"
        />
        <Meter
          label="EDÉN"
          value={hud.eden}
          max={hud.maxEden}
          barClass="bg-gradient-to-r from-cyan-300 to-violet-400"
          glow="0 0 8px rgba(34,211,238,0.7)"
        />
      </div>

      {/* 8. Selector inferior de 3 habilidades */}
      <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 gap-2.5">
        {hud.slots.map((slot, i) => {
          const slotNum = (i + 1) as 1 | 2 | 3;
          const active = hud.activeSlot === slotNum;
          return (
            <div
              key={slotNum}
              className={`-skew-x-12 border px-3.5 py-1.5 backdrop-blur-sm transition-colors ${
                active
                  ? 'border-cyan-300/90 bg-cyan-400/15 shadow-[0_0_16px_rgba(34,211,238,0.45)]'
                  : 'border-white/25 bg-[#090314]/55'
              }`}
            >
              <div className="flex skew-x-12 items-center gap-2">
                <span
                  className={`text-[10px] font-black tracking-widest ${
                    active ? 'text-cyan-200' : 'text-white/45'
                  }`}
                >
                  {slot.keyLabel}
                </span>
                <span
                  className={`text-[10px] font-bold tracking-[0.22em] ${
                    slot.name ? 'text-white/90' : 'text-white/30'
                  }`}
                >
                  {slot.name ?? 'VACÍO'}
                  {slot.name && slot.level > 0 ? ` Nv.${slot.level}` : ''}
                </span>
                {slot.cooldownRemaining !== undefined && slot.cooldownRemaining > 0.05 && (
                  <span className="ml-1 text-[9px] font-bold tabular-nums text-amber-300">
                    {slot.cooldownRemaining.toFixed(1)}s
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 9. Overlay de captura de ratón — única superficie con la guía de controles */}
      {!hud.pointerLocked && !hidePointerLockPrompt && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-[#090314]/45">
          <div className="-skew-x-12 border border-white/80 bg-[#090314]/90 px-6 py-2 shadow-[6px_6px_0_rgba(34,211,238,0.45)]">
            <span className="block skew-x-12 text-[11px] font-bold tracking-[0.24em] text-white">
              HAZ CLIC EN LA ARENA PARA CAPTURAR EL RATÓN · ESC PARA SOLTAR
            </span>
          </div>
          <div className="max-w-2xl text-center text-[9px] leading-relaxed tracking-[0.18em] text-white/55">
            EN SUELO: WASD ANDAR · RATÓN CÁMARA LIBRE · ESPACIO ENTRAR A FLOTACIÓN 0G
            <br />
            EN FLOTACIÓN 0G: RATÓN GIRAR CUERPO · WASD PROPULSIÓN (1 EDÉN/S, INERCIA 0G) · CLIC DER +
            WASD DASH (3 EDÉN)
            <br />
            ATAQUE VELOCIDAD (2 EDÉN/S): CLIC IZQ (CON ENEMIGO EN MIRA = PATADA/TALADRO · SIN ENEMIGO
            = CAÍDA AL VACÍO) · ESPACIO CANCELAR CON FLIP
          </div>
        </div>
      )}

      {/* 10. Botón Menú */}
      <button
        type="button"
        onClick={onExit}
        className="pointer-events-auto absolute right-4 top-4 -skew-x-12 border border-white/40 bg-[#090314]/60 px-4 py-1.5 text-[10px] font-bold tracking-[0.28em] text-white/80 transition-colors hover:border-cyan-300 hover:text-cyan-200"
      >
        <span className="block skew-x-12">← MENÚ</span>
      </button>

      <style>{`
        @keyframes domeHudPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.25); opacity: 0.55; }
        }
        @keyframes domeHudBulletPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}

export const DomeHudSketch = memo(DomeHudSketchInner);
export default DomeHudSketch;
