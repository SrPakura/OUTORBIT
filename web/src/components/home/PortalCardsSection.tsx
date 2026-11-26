import { ArrowRight } from 'lucide-react';
import { useWebI18n } from '../../i18n/useWebI18n';
import type { AppRoute } from '../layout/Navbar';

interface PortalCardsSectionProps {
  onNavigate: (route: AppRoute) => void;
}

export default function PortalCardsSection({ onNavigate }: PortalCardsSectionProps) {
  const { t } = useWebI18n();
  const accents = ['#22d3ee', '#e11d48', '#fbbf24'];

  return (
    <section className="cosmic-grid border-t-4 border-[#0b0d12] px-4 py-16 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="font-kicker text-xs text-[#22d3ee]">{t.home.portalsKicker}</div>
        <h2 className="mt-1 font-comic text-4xl text-white drop-shadow-[4px_4px_0_#e11d48] sm:text-6xl">
          {t.home.portalsTitle}
        </h2>

        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          {t.home.portals.map((portal, idx) => {
            const accent = accents[idx % accents.length];
            return (
              <button
                key={portal.route}
                type="button"
                onClick={() => onNavigate(portal.route)}
                className="group relative flex flex-col justify-between overflow-hidden border-[3px] border-[#0b0d12] bg-[#fbfbf8] p-6 text-left text-[#0b0d12] transition hover:-translate-y-1.5"
                style={{ boxShadow: `10px 10px 0 ${accent}` }}
              >
                <div className="halftone-burst pointer-events-none absolute -right-10 -top-10 h-44 w-44 opacity-60 transition group-hover:scale-110" />

                <div className="relative z-10">
                  <div className="flex items-center justify-between">
                    <span className="border-2 border-[#0b0d12] bg-[#0b0d12] px-2.5 py-1 font-kicker text-[10px] text-[#fbfbf8]">
                      {portal.tag}
                    </span>
                    <span className="font-hud text-5xl font-extrabold italic text-[#0b0d12]/15">
                      {portal.num}
                    </span>
                  </div>

                  <h3 className="mt-4 font-comic text-3xl uppercase leading-none text-[#0b0d12]">
                    {portal.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-[#2a2f3d]">{portal.desc}</p>
                </div>

                <div
                  className="relative z-10 mt-6 inline-flex items-center gap-2 font-comic text-lg"
                  style={{ color: accent === '#fbbf24' ? '#b45309' : accent === '#22d3ee' ? '#0e7490' : '#e11d48' }}
                >
                  <span>{portal.cta}</span>
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
