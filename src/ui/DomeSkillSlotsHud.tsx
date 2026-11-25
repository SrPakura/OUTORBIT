import { memo, useId } from 'react';
import type { DomeHudState } from '@/game/dome/domeTypes';

interface DomeSkillSlotsHudProps {
  slots: DomeHudState['slots'];
  activeSlot: 1 | 2 | 3;
}

const RING_RADIUS = 46;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

// Heptágono interior sutil (eco geométrico de la mira central)
const HEPTAGON_POINTS = Array.from({ length: 7 }, (_, i) => {
  const a = -Math.PI / 2 + (i * Math.PI * 2) / 7;
  const r = 34;
  return `${(60 + Math.cos(a) * r).toFixed(1)},${(60 + Math.sin(a) * r).toFixed(1)}`;
}).join(' ');

// 12 muescas radiales en el bisel exterior (eco del anillo del Yin-Yang)
const BEZEL_TICKS = Array.from({ length: 12 }, (_, i) => {
  const a = (i * Math.PI * 2) / 12;
  const r1 = 55;
  const r2 = i % 3 === 0 ? 58.5 : 57;
  return {
    x1: 60 + Math.cos(a) * r1,
    y1: 60 + Math.sin(a) * r1,
    x2: 60 + Math.cos(a) * r2,
    y2: 60 + Math.sin(a) * r2,
    major: i % 3 === 0,
  };
});

/**
 * Tres ranuras circulares de habilidad apiladas bajo el Yin-Yang.
 *
 * Estética sci-fi / cósmica coherente con el HUD Yin-Yang y los shaders
 * del abismo de Nyx:
 * - Núcleo abisal oscuro (#040408 -> #160c2e) con brillo nebular sutil y
 *   retícula heptagonal interior.
 * - Bisel técnico exterior con muescas radiales y etiqueta de tecla biselada a 45°.
 * - Aro de acreción con gradiente cian/violeta en listo, cian eléctrico al
 *   estar activa en escena, y arco horario sobre pista oscura en cooldown.
 * - Icono WebP 128×128 invertido a blanco luminoso (100% listo, 45% en cooldown).
 */
function DomeSkillSlotsHudInner({ slots }: DomeSkillSlotsHudProps) {
  const uid = useId().replace(/:/g, '');

  return (
    <div
      className="pointer-events-none absolute flex -translate-x-1/2 flex-col items-center select-none"
      style={{
        left: 'calc(20px + min(420px, 30vw) * (100 / 420))',
        top: 'calc(20px + min(420px, 30vw) * (200 / 420) + 6px)',
        gap: 'clamp(8px, 0.9vw, 13px)',
      }}
    >
      {slots.map((slot, i) => {
        const slotNum = (i + 1) as 1 | 2 | 3;
        const equipped = Boolean(slot.skillId);
        const cdRemaining = slot.cooldownRemaining ?? 0;
        const maxCd = slot.maxCooldown ?? 0;
        const onCooldown = equipped && cdRemaining > 0.05 && maxCd > 0;
        const progress = onCooldown ? Math.max(0, Math.min(1, 1 - cdRemaining / maxCd)) : 1;
        const dashOffset = RING_CIRCUMFERENCE * (1 - progress);
        const isActive = Boolean(slot.isActive && equipped);
        const ready = equipped && !onCooldown;

        const gradId = `${uid}-grad-${slotNum}`;
        const coreId = `${uid}-core-${slotNum}`;
        const activeRingStroke = isActive ? '#00e5ff' : `url(#${gradId})`;

        return (
          <div
            key={slotNum}
            className="relative flex items-center justify-center"
            style={{
              width: 'clamp(68px, 5.8vw, 86px)',
              height: 'clamp(68px, 5.8vw, 86px)',
              opacity: equipped ? 1 : 0.3,
            }}
          >
            <svg
              viewBox="0 0 120 120"
              className="absolute inset-0 h-full w-full overflow-visible"
              aria-hidden="true"
            >
              <defs>
                <radialGradient id={coreId} cx="38%" cy="32%" r="68%">
                  <stop offset="0%" stopColor={isActive ? '#0f2d46' : '#1b1138'} stopOpacity="0.96" />
                  <stop offset="58%" stopColor="#090418" stopOpacity="0.95" />
                  <stop offset="100%" stopColor="#040408" stopOpacity="0.96" />
                </radialGradient>
                <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#00e5ff" />
                  <stop offset="55%" stopColor="#818cf8" />
                  <stop offset="100%" stopColor="#e879f9" />
                </linearGradient>
              </defs>

              {/* Fondo abisal cósmico */}
              <circle cx="60" cy="60" r="57" fill={`url(#${coreId})`} />

              {/* Bisel exterior técnico + muescas */}
              <circle
                cx="60"
                cy="60"
                r="57"
                fill="none"
                stroke={isActive ? 'rgba(0, 229, 255, 0.7)' : 'rgba(228, 228, 236, 0.28)'}
                strokeWidth="1.2"
              />
              {BEZEL_TICKS.map((tick, idx) => (
                <line
                  key={idx}
                  x1={tick.x1}
                  y1={tick.y1}
                  x2={tick.x2}
                  y2={tick.y2}
                  stroke={
                    tick.major
                      ? isActive
                        ? '#00e5ff'
                        : 'rgba(0, 229, 255, 0.55)'
                      : 'rgba(228, 228, 236, 0.22)'
                  }
                  strokeWidth={tick.major ? '1.4' : '0.9'}
                />
              ))}

              {/* Retícula heptagonal interior */}
              <polygon
                points={HEPTAGON_POINTS}
                fill="none"
                stroke={isActive ? 'rgba(0, 229, 255, 0.28)' : 'rgba(228, 228, 236, 0.13)'}
                strokeWidth="1"
              />

              {/* Pista de cooldown */}
              <circle
                cx="60"
                cy="60"
                r={RING_RADIUS}
                fill="none"
                stroke="rgba(228, 228, 236, 0.12)"
                strokeWidth="6.5"
              />

              {/* Aro de energía / progreso de cooldown */}
              <circle
                cx="60"
                cy="60"
                r={RING_RADIUS}
                fill="none"
                stroke={equipped ? activeRingStroke : 'rgba(228, 228, 236, 0.2)'}
                strokeWidth="6.5"
                strokeLinecap="butt"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={dashOffset}
                transform="rotate(-90 60 60)"
                style={
                  ready
                    ? {
                        filter: isActive
                          ? 'drop-shadow(0 0 6px rgba(0, 229, 255, 0.9))'
                          : 'drop-shadow(0 0 4px rgba(0, 229, 255, 0.45))',
                      }
                    : undefined
                }
              />
            </svg>

            {/* Icono bitmap invertido a blanco/neón sobre el abismo */}
            {equipped && slot.skillId && (
              <img
                src={`/icons/skills/${slot.skillId}.webp`}
                alt={slot.name ?? ''}
                draggable={false}
                className="relative z-10 object-contain"
                style={{
                  width: '46%',
                  height: '46%',
                  opacity: onCooldown ? 0.42 : 1,
                  filter: isActive
                    ? 'invert(1) drop-shadow(0 0 6px rgba(0, 229, 255, 0.95))'
                    : onCooldown
                      ? 'invert(1)'
                      : 'invert(1) drop-shadow(0 0 3px rgba(0, 229, 255, 0.45))',
                }}
              />
            )}

            {/* Etiqueta de tecla biselada a 45° (estilo barra OLEADA) */}
            <svg
              viewBox="0 0 22 22"
              className="absolute -bottom-0.5 -right-0.5 z-20"
              style={{ width: '20px', height: '20px' }}
              aria-hidden="true"
            >
              <polygon
                points="5,1 21,1 21,17 17,21 1,21 1,5"
                fill="#06060a"
                stroke={isActive ? '#00e5ff' : equipped ? 'rgba(228, 228, 236, 0.65)' : 'rgba(228, 228, 236, 0.35)'}
                strokeWidth="1.4"
              />
              <text
                x="11"
                y="14.5"
                textAnchor="middle"
                fill={isActive ? '#00e5ff' : '#ffffff'}
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                fontWeight="900"
                fontSize="11"
              >
                {slot.keyLabel}
              </text>
            </svg>

            {/* Pips de nivel de habilidad (abajo a la izquierda) */}
            {equipped && slot.level > 0 && (
              <div className="absolute -bottom-0.5 left-0.5 z-20 flex gap-[3px]">
                {Array.from({ length: slot.level }, (_, idx) => (
                  <span
                    key={idx}
                    className="block h-[5px] w-[5px] rotate-45"
                    style={{
                      backgroundColor: isActive ? '#00e5ff' : '#e4e4ec',
                      boxShadow: isActive
                        ? '0 0 5px #00e5ff'
                        : '0 0 3px rgba(0, 229, 255, 0.5)',
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export const DomeSkillSlotsHud = memo(DomeSkillSlotsHudInner);
export default DomeSkillSlotsHud;
