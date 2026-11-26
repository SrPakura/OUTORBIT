import { Sparkles } from 'lucide-react';
import type { ActiveSkillSpec } from '../../data/skillsData';
import { useWebI18n } from '../../i18n/useWebI18n';

interface SkillCardProps {
  skill: ActiveSkillSpec;
}

export default function SkillCard({ skill }: SkillCardProps) {
  const { t } = useWebI18n();
  const copy = t.arsenal.skillsCopy[skill.id as keyof typeof t.arsenal.skillsCopy];
  const rarityLabel = t.arsenal.rarity[skill.rarity];

  return (
    <article
      className="relative flex flex-col justify-between overflow-hidden border-[3px] border-[#0b0d12] bg-[#fbfbf8] p-5 text-[#0b0d12] sm-skew-5"
      style={{ boxShadow: `9px 9px 0 ${skill.accent}` }}
    >
      <div className="halftone-burst pointer-events-none absolute -right-10 -top-10 h-44 w-44 opacity-60" />

      <div className="relative z-10 sm-unskew-5">
        <div className="flex items-start justify-between gap-2">
          <span
            className="border-2 border-[#0b0d12] px-2 py-0.5 font-kicker text-[9px] text-[#0b0d12]"
            style={{ backgroundColor: skill.accent }}
          >
            {rarityLabel}
          </span>
          <span className="font-hud text-5xl font-extrabold italic leading-none text-[#0b0d12]/15">
            {skill.index}
          </span>
        </div>

        {/* Aro rotatorio 108x108 + Icono real */}
        <div className="my-4 flex items-center gap-4">
          <div className="relative flex h-[92px] w-[92px] shrink-0 items-center justify-center rounded-full border-[3px] border-[#0b0d12] bg-[#0d0a1f]">
            <div
              className="animate-slow-spin absolute inset-1 rounded-full border-2 border-dashed"
              style={{ borderColor: skill.accent }}
            />
            <img
              src={skill.icon}
              alt={copy.name}
              className="relative z-10 h-14 w-14 object-contain"
            />
          </div>

          <div>
            <h3 className="font-comic text-2xl uppercase leading-tight text-[#0b0d12]">
              {copy.name}
            </h3>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="border border-[#0b0d12] bg-[#f1f1ed] px-2 py-0.5 font-kicker text-[9px]">
                {t.arsenal.costLabel}: {skill.edenCost} {t.arsenal.edenUnit}
              </span>
              <span className="border border-[#0b0d12] bg-[#f1f1ed] px-2 py-0.5 font-kicker text-[9px]">
                {t.arsenal.cdLabel}: {skill.cooldownSec}s
              </span>
              <span className="border border-[#0b0d12] bg-[#0b0d12] px-2 py-0.5 font-kicker text-[9px] text-white">
                {t.arsenal.maxLvLabel}: {skill.maxLevel}
              </span>
            </div>
          </div>
        </div>

        <p className="text-sm leading-relaxed text-[#2a2f3d]">{copy.desc}</p>
      </div>

      <div className="relative z-10 mt-4 border-l-4 border-[#0b0d12] bg-[#f1f1ed] p-3 sm-unskew-5">
        <div className="flex items-center gap-1.5 font-kicker text-[9px] text-[#e11d48]">
          <Sparkles className="h-3 w-3" />
          <span>SINERGIA / EFECTO</span>
        </div>
        <p className="mt-1 text-xs font-medium leading-relaxed text-[#0b0d12]">{copy.synergy}</p>
      </div>
    </article>
  );
}
