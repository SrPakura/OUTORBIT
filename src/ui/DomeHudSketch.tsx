import { memo } from 'react';
import type { DomeHudState } from '@/game/dome/domeTypes';
import { RETICLE_SIZE_PX } from '@/game/dome/domeTypes';

interface DomeHudSketchProps {
  hud: DomeHudState;
  onExit: () => void;
}

const RETICLE_SIZE = RETICLE_SIZE_PX; // 180px en pantalla para enmarcar sin tapar a Nyx

function modeLabel(hud: DomeHudState): string {
  switch (hud.mode) {
    case 'grounded':
      return 'SUELO';
    case 'floating':
      return 'FLOTACIÓN 0G';
    case 'dashing':
      return 'DASH';
    case 'speed_attack':
      switch (hud.speedAttackKind) {
        case 'gravity_kick':
          return 'PATADA GRAVITATORIA';
        case 'spiral_drill_kick':
          return 'TALADRO ESPIRAL';
        case 'void_fall':
          return 'CAÍDA AL VACÍO';
        default:
          return 'ATAQUE VELOCIDAD';
      }
    case 'kick_recover':
      return 'FRENADO FLIP';
    default:
      return '—';
  }
}

function modeChipClass(hud: DomeHudState): string {
  switch (hud.mode) {
    case 'grounded':
      return 'bg-white/90 text-[#090314]';
    case 'floating':
      return 'bg-cyan-400 text-[#090314]';
    case 'dashing':
      return 'bg-fuchsia-500 text-[#090314]';
    case 'speed_attack':
      return 'bg-rose-500 text-white';
    case 'kick_recover':
      return 'bg-violet-500 text-[#090314]';
    default:
      return 'bg-white/90 text-[#090314]';
  }
}

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
  const lock = hud.reticleLockState;
  const isLocked = lock === 'locked';
  const starStroke = lock === 'none' ? '#ffffff' : lock === 'can_lock' ? '#ff2a55' : '#ff1e42';
  const starFill = isLocked ? 'rgba(255, 30, 66, 0.28)' : 'none';
  const starStyle =
    lock === 'locked'
      ? { filter: 'drop-shadow(0 0 12px #ff1e42) drop-shadow(0 0 24px #ff0033)' }
      : undefined;
  const innerOctStroke = isLocked ? '#ff4d68' : '#ffffff';
  const enemyPos =
    hud.lockedEnemyScreenPos != null && (lock === 'locked' || lock === 'can_lock')
      ? hud.lockedEnemyScreenPos
      : null;

  // --- Efectos dinámicos del visor (Gravity Rush × Persona 5) ---
  const isVoidFall = hud.mode === 'speed_attack' && hud.speedAttackKind === 'void_fall';
  const octaVibrate = isVoidFall || hud.isDrillReady;
  const impactShake = hud.impactFlash > 0.05;
  const gyroArcsStroke = hud.isDrillReady ? '#22d3ee' : '#ffffff';
  const gyroArcsOpacity = hud.isDrillReady ? 0.9 : 0.45;
  const bulletRingRatio = Math.max(0, Math.min(1, hud.bulletTimeRemaining / 1.25));

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

      {/* 2b. Destello de impacto cómic — Hit-Stop cuando la bota revienta a un enemigo */}
      {impactShake && (
        <div
          className="absolute inset-0 mix-blend-screen"
          style={{
            opacity: Math.min(1, hud.impactFlash * 0.65),
            background:
              'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.20) 0%, rgba(34,211,238,0.32) 45%, rgba(244,63,94,0.60) 100%)',
            maskImage: 'radial-gradient(circle at 50% 50%, transparent 40%, black 82%)',
            WebkitMaskImage:
              'radial-gradient(circle at 50% 50%, transparent 40%, black 82%)',
          }}
        />
      )}

      {/* 2c. Viñeta abisal de Caída al Vacío — índigo/violeta + líneas de velocidad densas */}
      {isVoidFall && (
        <>
          <div
            className="absolute inset-0"
            style={{
              boxShadow:
                'inset 0 0 220px 70px rgba(109,40,217,0.45), inset 0 0 130px 36px rgba(79,70,229,0.35)',
            }}
          />
          <div
            className="absolute inset-0 mix-blend-screen"
            style={{
              opacity: 0.85,
              background:
                'repeating-conic-gradient(from 0deg at 50% 50%, rgba(34,211,238,0.50) 0deg 0.5deg, rgba(167,139,250,0.45) 0.5deg 1deg, transparent 1deg 2.1deg)',
              maskImage: 'radial-gradient(circle at 50% 50%, transparent 26%, black 70%)',
              WebkitMaskImage:
                'radial-gradient(circle at 50% 50%, transparent 26%, black 70%)',
            }}
          />
        </>
      )}

      {/* 3. Tinte de Cámara Lenta (Bullet-Time) en los bordes */}
      {hud.bulletTimeActive && (
        <div
          className="absolute inset-0"
          style={{
            boxShadow:
              'inset 0 0 180px 40px rgba(34,211,238,0.30), inset 0 0 90px 24px rgba(168,85,247,0.24)',
            border: '2px solid rgba(34,211,238,0.45)',
          }}
        />
      )}

      {/* 4. Mira oficial (visor.svg) centrada en pantalla */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <svg
          width={RETICLE_SIZE}
          height={RETICLE_SIZE}
          viewBox="0 0 512 512"
          className="overflow-visible"
          style={
            impactShake
              ? {
                  filter:
                    'drop-shadow(-3px 0 0 #22d3ee) drop-shadow(3px 0 0 #f43f5e)',
                  transform: `scale(${1 + hud.impactFlash * 0.16})`,
                }
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
            {/* Doble anillo octogonal — diafragma que se contrae con la velocidad */}
            <g
              style={
                octaVibrate
                  ? {
                      animation: 'domeHudOctaVibrate 0.18s ease-in-out infinite',
                      transformOrigin: '256px 256px',
                    }
                  : undefined
              }
            >
              <polygon
                id="octagon-outer"
                stroke="#ffffff"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeOpacity="0.85"
                points="256,40 331.01,74.92 408.74,103.26 437.08,180.99 472,256 437.08,331.01 408.74,408.74 331.01,437.08 256,472 180.99,437.08 103.26,408.74 74.92,331.01 40,256 74.92,180.99 103.26,103.26 180.99,74.92"
                style={{
                  transform: `scale(${1 - Math.min(0.1, hud.speed * 0.004)})`,
                  transformOrigin: '256px 256px',
                }}
              />
            </g>
            <polygon
              id="octagon-inner"
              stroke={innerOctStroke}
              strokeWidth="6"
              strokeLinejoin="round"
              points="256,54 325.65,87.85 398.84,113.16 424.15,186.35 458,256 424.15,325.65 398.84,398.84 325.65,424.15 256,458 186.35,424.15 113.16,398.84 87.85,325.65 54,256 87.85,186.35 113.16,113.16 186.35,87.85"
            />

            {/* Arcos giroscópicos — giran con el spin; cian brillante con Taladro listo */}
            <g
              id="gyro-arcs"
              stroke={gyroArcsStroke}
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeOpacity={gyroArcsOpacity}
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
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeOpacity="0.75"
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

            {/* Anillo de cuenta atrás de Cámara Lenta — cuánto queda para el Dash */}
            {hud.bulletTimeActive && (
              <circle
                id="bullet-time-ring"
                cx="256"
                cy="256"
                r="150"
                fill="none"
                stroke="#22d3ee"
                strokeWidth="3"
                strokeLinecap="round"
                strokeOpacity="0.9"
                strokeDasharray={`${2 * Math.PI * 150 * bulletRingRatio} ${2 * Math.PI * 150}`}
                transform="rotate(-90 256 256)"
                style={{ filter: 'drop-shadow(0 0 6px #22d3ee)' }}
              />
            )}

            {/* Estrella central de 4 puntas — color según estado de lock */}
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
            <circle
              id="center-dot"
              cx="256"
              cy="256"
              r="3"
              fill={lock === 'none' ? '#ffffff' : '#ff2a55'}
              stroke="none"
            />
          </g>
        </svg>

        {/* Banner táctico de Cámara Lenta, debajo de la mira */}
        {hud.bulletTimeActive && (
          <div
            className="absolute left-1/2 top-full mt-3 -translate-x-1/2"
            style={{ animation: 'domeHudBulletPulse 0.7s ease-in-out infinite' }}
          >
            <div className="-skew-x-12 border-2 border-cyan-300 bg-gradient-to-r from-cyan-500/90 via-violet-500/90 to-cyan-500/90 px-4 py-1.5 shadow-[0_0_24px_rgba(34,211,238,0.85)]">
              <span className="block skew-x-12 whitespace-nowrap text-[11px] font-black tracking-widest text-white">
                ⚡ CÁMARA LENTA · ¡ESQUIVA ENEMIGA! PULSA [CLIC DER + A / D / S] PARA CORTAR
                INERCIA Y RE-LOCKEAR
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 5. Marcador romboidal sobre el enemigo lockeado / lockeable */}
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
          <polygon
            points="11,1 20,11 11,21 2,11"
            fill="none"
            stroke="#ff2a55"
            strokeWidth="2"
          />
          <polygon points="11,6 15.5,11 11,16 6.5,11" fill="#ff2a55" />
        </svg>
      )}

      {/* 6. Panel superior izquierdo — medidores y estado */}
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

          {/* Modo de movimiento + velocidad */}
          <div className="mt-3 flex items-center justify-between border-t border-white/20 pt-2">
            <span
              className={`-skew-x-12 px-2 py-0.5 text-[11px] font-bold tracking-widest ${modeChipClass(hud)}`}
            >
              {modeLabel(hud)}
            </span>
            <span className="text-sm font-bold tabular-nums text-white">
              {Math.round(hud.speed)}
              <span className="ml-1 text-[10px] text-white/60">m/s</span>
            </span>
          </div>
        </div>
      </div>

      {/* 7. Panel inferior central — selector de habilidades */}
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

      {/* 8. Guía de controles — tira discreta abajo */}
      <div className="absolute bottom-16 left-1/2 w-full max-w-3xl -translate-x-1/2 px-4 text-center text-[9px] leading-relaxed tracking-widest text-white/35">
        <p>EN SUELO: WASD ANDAR · RATÓN CÁMARA LIBRE · ESPACIO ENTRAR A FLOTACIÓN 0G</p>
        <p>
          EN FLOTACIÓN 0G: RATÓN GIRAR CUERPO · WASD PROPULSIÓN (1 EDÉN/S, INERCIA 0G) · CLIC DER +
          WASD DASH (3 EDÉN)
        </p>
        <p>
          ATAQUE VELOCIDAD (2 EDÉN/S): CLIC IZQ (CON ENEMIGO EN MIRA = PATADA/TALADRO · SIN ENEMIGO
          = CAÍDA AL VACÍO) · ESPACIO CANCELAR CON FLIP
        </p>
      </div>

      {/* 9. Aviso de pointer lock */}
      {!hud.pointerLocked && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#090314]/40">
          <div className="-skew-x-12 border-2 border-white bg-[#090314]/90 px-6 py-2 shadow-[6px_6px_0_rgba(34,211,238,0.6)]">
            <span className="block skew-x-12 text-xs font-bold tracking-[0.2em] text-white">
              HAZ CLIC EN LA ARENA PARA CAPTURAR EL RATÓN · ESC PARA SOLTAR
            </span>
          </div>
          <div className="max-w-2xl text-center text-[10px] leading-relaxed tracking-widest text-white/60">
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
        className="pointer-events-auto absolute right-4 top-4 -skew-x-12 border-2 border-white/80 bg-[#090314]/80 px-4 py-1.5 text-xs font-bold tracking-widest text-white transition-colors hover:border-cyan-300 hover:bg-cyan-400/20 hover:text-cyan-200"
      >
        <span className="block skew-x-12">← MENÚ</span>
      </button>

      <style>{`
        @keyframes domeHudPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.25); opacity: 0.55; }
        }
        @keyframes domeHudBulletPulse {
          0%, 100% { opacity: 1; transform: translateX(-50%) scale(1); }
          50% { opacity: 0.7; transform: translateX(-50%) scale(1.04); }
        }
        @keyframes domeHudOctaVibrate {
          0%, 100% { transform: scale(1); }
          25% { transform: scale(1.012) translate(0.8px, -0.6px); }
          50% { transform: scale(0.994); }
          75% { transform: scale(1.008) translate(-0.8px, 0.6px); }
        }
      `}</style>
    </div>
  );
}

export const DomeHudSketch = memo(DomeHudSketchInner);
export default DomeHudSketch;
