import { useWebI18n } from '../i18n/useWebI18n';
import type { AppRoute } from '../components/layout/Navbar';
import ContestActionBlock from '../components/home/ContestActionBlock';
import HeroSection from '../components/home/HeroSection';
import PortalCardsSection from '../components/home/PortalCardsSection';
import TrailerSection from '../components/home/TrailerSection';

interface HomeContestPageProps {
  onNavigate: (route: AppRoute) => void;
}

export default function HomeContestPage({ onNavigate }: HomeContestPageProps) {
  const { t } = useWebI18n();

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <main>
      <HeroSection
        onScrollToTrailer={() => scrollTo('trailer')}
        onScrollToVote={() => scrollTo('contest-vote')}
      />

      <TrailerSection />

      {/* Bloque 1.3 · ¿De qué va OUTORBIT? (3 Pilares) */}
      <section className="paper-grid relative overflow-hidden border-t-4 border-[#0b0d12] px-4 py-16 sm:px-8">
        <div className="speedlines-overlay pointer-events-none absolute inset-0" />
        <div className="relative z-10 mx-auto max-w-6xl">
          <div className="font-kicker text-xs text-[#e11d48]">{t.home.pillarsKicker}</div>
          <h2 className="mt-1 font-comic text-4xl uppercase text-[#0b0d12] sm:text-6xl">
            {t.home.pillarsTitle}
          </h2>

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {t.home.pillars.map((pillar, idx) => {
              const shadowColors = ['#22d3ee', '#e11d48', '#7c3aed'];
              return (
                <article
                  key={pillar.num}
                  className="border-[3px] border-[#0b0d12] bg-[#fbfbf8] p-6 sm-skew-5"
                  style={{ boxShadow: `8px 8px 0 ${shadowColors[idx % shadowColors.length]}` }}
                >
                  <div className="sm-unskew-5">
                    <div className="font-hud text-5xl font-extrabold italic text-[#e11d48]">
                      {pillar.num}
                    </div>
                    <h3 className="mt-2 font-comic text-2xl uppercase text-[#0b0d12]">
                      {pillar.title}
                    </h3>
                    <p className="mt-3 text-sm leading-relaxed text-[#2a2f3d]">{pillar.body}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <PortalCardsSection onNavigate={onNavigate} />

      <ContestActionBlock />
    </main>
  );
}
