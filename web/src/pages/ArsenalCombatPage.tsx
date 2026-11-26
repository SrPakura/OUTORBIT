import { ACTIVE_SKILLS, PASSIVE_SKILLS } from '../data/skillsData';
import { useWebI18n } from '../i18n/useWebI18n';
import ControlsTutorialSection from '../components/arsenal/ControlsTutorialSection';
import KineticMeter from '../components/arsenal/KineticMeter';
import MechanicsGrid from '../components/arsenal/MechanicsGrid';
import SkillCard from '../components/arsenal/SkillCard';

export default function ArsenalCombatPage() {
  const { t } = useWebI18n();

  return (
    <main className="pt-20">
      {/* Laboratorio Cinético */}
      <section className="paper-grid relative overflow-hidden px-4 py-14 sm:px-8">
        <div className="speedlines-overlay pointer-events-none absolute inset-0" />
        <div className="relative z-10 mx-auto max-w-6xl">
          <div className="font-kicker text-xs text-[#e11d48]">{t.arsenal.kicker}</div>
          <h1 className="mt-1 font-comic text-4xl uppercase sm:text-6xl hollow-ink-title">
            {t.arsenal.title}
          </h1>

          <div className="mt-8">
            <KineticMeter />
          </div>

          <MechanicsGrid />
        </div>
      </section>

      {/* Mazo de 7 Habilidades + 3 Pasivas + Modo Fácil */}
      <section className="paper-grid-fine border-t-4 border-[#0b0d12] px-4 py-16 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="font-kicker text-xs text-[#e11d48]">{t.arsenal.skillsKicker}</div>
              <h2 className="mt-1 font-comic text-4xl uppercase text-[#0b0d12] sm:text-6xl">
                {t.arsenal.skillsTitle}
              </h2>
            </div>
            <p className="max-w-md border-l-4 border-[#22d3ee] bg-[#fbfbf8] p-3 text-xs font-medium text-[#2a2f3d]">
              {t.arsenal.skillsNote}
            </p>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {ACTIVE_SKILLS.map((skill) => (
              <SkillCard key={skill.id} skill={skill} />
            ))}
          </div>

          {/* Franja de 3 Pasivas + Modo Fácil */}
          <div className="mt-14">
            <div className="font-kicker text-xs text-[#0b0d12]">{t.arsenal.passivesTitle}</div>
            <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {PASSIVE_SKILLS.map((p) => {
                const copy = t.arsenal.passivesCopy[p.id];
                return (
                  <div
                    key={p.id}
                    className="border-[3px] border-[#0b0d12] bg-[#fbfbf8] p-4"
                    style={{ boxShadow: `6px 6px 0 ${p.accent}` }}
                  >
                    <h3 className="font-comic text-xl uppercase text-[#0b0d12]">{copy.name}</h3>
                    <p className="mt-2 text-xs leading-relaxed text-[#2a2f3d]">{copy.desc}</p>
                  </div>
                );
              })}

              <div className="border-[3px] border-[#0b0d12] bg-[#0d0a1f] p-4 text-white shadow-[6px_6px_0_#e11d48]">
                <div className="inline-block bg-[#fbbf24] px-2 py-0.5 font-kicker text-[9px] text-[#0b0d12]">
                  EASY MODE
                </div>
                <h3 className="mt-2 font-comic text-xl uppercase text-white">
                  {t.arsenal.easyModeTitle}
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-slate-300">
                  {t.arsenal.easyModeDesc}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <ControlsTutorialSection />
    </main>
  );
}
