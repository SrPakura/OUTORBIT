import { ArrowDown, Sparkles } from 'lucide-react';
import { CONTEST_URLS } from '../../data/contestConfig';
import { useWebI18n } from '../../i18n/useWebI18n';
import FluidInkButton from '../common/FluidInkButton';
import GravityWaveGrid from './GravityWaveGrid';
import HeroCanvas from './HeroCanvas';

interface HeroSectionProps {
  onScrollToTrailer: () => void;
  onScrollToVote: () => void;
}

export default function HeroSection({ onScrollToTrailer, onScrollToVote }: HeroSectionProps) {
  const { t } = useWebI18n();

  return (
    <section className="relative min-h-[calc(100vh-1rem)] pt-20 lg:grid lg:grid-cols-12">
      {/* Lado izquierdo: Papel + Malla Gravitatoria interactiva */}
      <div className="relative flex flex-col justify-between overflow-hidden bg-[#f1f1ed] px-5 py-10 sm:px-10 lg:col-span-6 lg:py-16 xl:pl-16">
        <GravityWaveGrid />

        <div className="relative z-10 max-w-xl">
          <div className="inline-flex items-center gap-2 border-2 border-[#0b0d12] bg-[#fbfbf8] px-3 py-1 font-kicker text-[10px] text-[#0b0d12] shadow-[4px_4px_0_#e11d48] sm-skew-6">
            <span className="sm-unskew-6">{t.home.kicker}</span>
          </div>
          <div className="mt-2 h-[3px] w-40 -rotate-1 bg-[#e11d48]" />

          <h1 className="mt-6 font-comic text-6xl tracking-tight sm:text-8xl">
            <span className="text-[#0b0d12] drop-shadow-[5px_5px_0_#e11d48]">OUT</span>
            <span className="text-[#e11d48] drop-shadow-[5px_5px_0_#0b0d12]">ORBIT</span>
          </h1>

          <p className="mt-5 max-w-lg text-base font-medium leading-relaxed text-[#2a2f3d] sm:text-lg">
            {t.home.pitch}
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            {t.home.chips.map((chip) => (
              <span
                key={chip}
                className="border-2 border-[#0b0d12] bg-[#fbfbf8] px-2.5 py-1 font-kicker text-[10px] text-[#0b0d12]"
              >
                {chip}
              </span>
            ))}
          </div>

          <div className="mt-8 flex flex-col items-start gap-4">
            <FluidInkButton
              label={t.home.ctaPlay}
              hint="BASE44"
              href={CONTEST_URLS.game}
              stops={['#e11d48', '#7c3aed', '#22d3ee']}
            />

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={onScrollToVote}
                className="paper-btn inline-flex items-center gap-2 px-5 py-2.5 font-comic text-lg"
                style={{ ['--accent' as string]: '#fbbf24' }}
              >
                <Sparkles className="h-4 w-4 text-[#e11d48]" />
                <span>{t.home.ctaVote}</span>
              </button>

              <button
                type="button"
                onClick={onScrollToTrailer}
                className="paper-btn inline-flex items-center gap-2 px-5 py-2.5 font-comic text-lg"
                style={{ ['--accent' as string]: '#22d3ee' }}
              >
                <ArrowDown className="h-4 w-4" />
                <span>{t.home.ctaTrailer}</span>
              </button>
            </div>
          </div>
        </div>

        <div className="relative z-10 mt-8 border-t-2 border-[#0b0d12]/15 pt-3 font-kicker text-[10px] text-[#2a2f3d]">
          ⚡ {t.home.gridHint}
        </div>
      </div>

      {/* Lado derecho: Escena 3D de Nyx en el Vacío + Divisor Líquido */}
      <div className="relative min-h-[380px] border-t-4 border-[#0b0d12] lg:col-span-6 lg:min-h-full lg:border-t-0">
        <HeroCanvas />
      </div>
    </section>
  );
}
