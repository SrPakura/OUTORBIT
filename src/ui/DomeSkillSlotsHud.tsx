import { memo } from 'react';
import type { DomeHudState } from '@/game/dome/domeTypes';

interface DomeSkillSlotsHudProps {
  slots: DomeHudState['slots'];
  activeSlot: 1 | 2 | 3;
}

const RING_RADIUS = 48; // 104px diámetro exterior (48 + 4) con strokeWidth=8 dentro de 120×120
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * Tres ranuras circulares de habilidad apiladas bajo el Yin-Yang.
 *
 * Geometría fiel al diseño (viewBox 120×120):
 * - Disco exterior #FBFBF8 (padding 8)
 * - Aro #E11D48 de grosor 8 (104×104) con relleno circular horario en cooldown
 * - Bitmap rasterizado 128×128 WebP mostrado a 56/120 (~46.67%) para conservar
 *   grosores exactos: 100% opacidad listo, 50% en cooldown; ranura vacía al 25%.
 */
function DomeSkillSlotsHudInner({ slots, activeSlot }: DomeSkillSlotsHudProps) {
  return (
    <div
      className="pointer-events-none absolute flex -translate-x-1/2 flex-col items-center select-none"
      style={{
        left: 'calc(20px + min(420px, 30vw) * (100 / 420))',
        top: 'calc(20px + min(420px, 30vw) * (200 / 420) + 6px)',
        gap: 'clamp(8px, 0.9vw, 14px)',
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
        const isActive = activeSlot === slotNum;

        return (
          <div
            key={slotNum}
            className="relative flex items-center justify-center rounded-full"
            style={{
              width: 'clamp(68px, 5.8vw, 88px)',
              height: 'clamp(68px, 5.8vw, 88px)',
              opacity: equipped ? 1 : 0.25,
              boxShadow: isActive && equipped
                ? '0 0 14px rgba(34, 211, 238, 0.45), 0 4px 12px rgba(0, 0, 0, 0.45)'
                : '0 4px 12px rgba(0, 0, 0, 0.4)',
            }}
          >
            <svg
              viewBox="0 0 120 120"
              className="absolute inset-0 h-full w-full"
              aria-hidden="true"
            >
              <circle cx="60" cy="60" r="60" fill="#FBFBF8" />
              {onCooldown && (
                <circle
                  cx="60"
                  cy="60"
                  r={RING_RADIUS}
                  fill="none"
                  stroke="rgba(225, 29, 72, 0.16)"
                  strokeWidth="8"
                />
              )}
              <circle
                cx="60"
                cy="60"
                r={RING_RADIUS}
                fill="none"
                stroke="#E11D48"
                strokeWidth="8"
                strokeLinecap="butt"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={dashOffset}
                transform="rotate(-90 60 60)"
              />
            </svg>

            {equipped && slot.skillId && (
              <img
                src={`/icons/skills/${slot.skillId}.webp`}
                alt={slot.name ?? ''}
                draggable={false}
                className="relative z-10 object-contain"
                style={{
                  width: '46.67%',
                  height: '46.67%',
                  opacity: onCooldown ? 0.5 : 1,
                }}
              />
            )}

            <span
              className="absolute bottom-0 right-0 z-20 flex items-center justify-center rounded-full border border-[#FBFBF8] bg-[#0b0d12] font-mono text-[9px] font-black leading-none"
              style={{
                width: '18px',
                height: '18px',
                color: isActive && equipped ? '#22d3ee' : '#FBFBF8',
              }}
            >
              {slot.keyLabel}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export const DomeSkillSlotsHud = memo(DomeSkillSlotsHudInner);
export default DomeSkillSlotsHud;
