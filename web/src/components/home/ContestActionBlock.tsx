import { useState } from 'react';
import { Check, Share2, Star } from 'lucide-react';
import { CONTEST_URLS } from '../../data/contestConfig';
import { useWebI18n } from '../../i18n/useWebI18n';
import FluidInkButton from '../common/FluidInkButton';

export default function ContestActionBlock() {
  const { t } = useWebI18n();
  const [copied, setCopied] = useState(false);

  const handleMobileShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: 'OUTORBIT — 3D Zero-G Kinetic Arena Roguelite',
          text: 'OUTORBIT (Base44 Contest)',
          url: CONTEST_URLS.game,
        });
        return;
      } catch {
        // Fallback to clipboard
      }
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(CONTEST_URLS.game).catch(() => undefined);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 3000);
  };

  return (
    <section
      id="contest-vote"
      className="paper-grid-fine border-t-4 border-[#0b0d12] px-4 py-16 sm:px-8"
    >
      <div className="mx-auto max-w-6xl border-4 border-[#0b0d12] bg-[#fbfbf8] p-6 shadow-[12px_12px_0_#0b0d12] sm:p-10">
        <div className="max-w-3xl">
          <div className="inline-block border-2 border-[#0b0d12] bg-[#e11d48] px-3 py-1 font-kicker text-[10px] text-white">
            {t.home.contestKicker}
          </div>
          <h2 className="mt-3 font-comic text-4xl uppercase text-[#0b0d12] sm:text-6xl">
            {t.home.contestTitle}
          </h2>
          <p className="mt-3 text-base text-[#2a2f3d]">{t.home.contestDesc}</p>
        </div>

        {/* Escritorio (>= 768px) */}
        <div className="mt-8 hidden gap-6 md:grid md:grid-cols-2">
          <div className="flex flex-col justify-between border-[3px] border-[#0b0d12] bg-[#f1f1ed] p-6 shadow-[6px_6px_0_#22d3ee]">
            <div>
              <FluidInkButton
                label={t.home.contestPlayBtn}
                hint="BASE44"
                href={CONTEST_URLS.game}
                stops={['#e11d48', '#7c3aed', '#22d3ee']}
              />
            </div>
            <p className="mt-4 text-xs font-medium text-[#2a2f3d]">{t.home.contestPlayNote}</p>
          </div>

          <div className="flex flex-col justify-between border-[3px] border-[#0b0d12] bg-[#0d0a1f] p-6 text-white shadow-[6px_6px_0_#fbbf24]">
            <a
              href={CONTEST_URLS.launchpad}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-3 border-[3px] border-[#0b0d12] bg-[#fbbf24] px-6 py-5 font-comic text-2xl text-[#0b0d12] shadow-[6px_6px_0_#e11d48] transition hover:-translate-y-0.5"
            >
              <Star className="h-6 w-6 fill-[#e11d48] text-[#0b0d12]" />
              <span>{t.home.contestVoteBtn}</span>
            </a>
            <p className="mt-4 text-xs font-medium text-slate-300">{t.home.contestVoteNote}</p>
          </div>
        </div>

        {/* Móvil / Tablet (< 768px) */}
        <div className="mt-8 flex flex-col gap-4 md:hidden">
          <a
            href={CONTEST_URLS.launchpad}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 border-[3px] border-[#0b0d12] bg-[#fbbf24] px-5 py-4 text-center font-comic text-2xl text-[#0b0d12] shadow-[6px_6px_0_#e11d48]"
          >
            <Star className="h-5 w-5 fill-[#e11d48] text-[#0b0d12]" />
            <span>{t.home.contestVoteBtn}</span>
          </a>

          <button
            type="button"
            onClick={handleMobileShare}
            className="paper-btn flex items-center justify-center gap-2 px-4 py-3.5 text-center font-comic text-lg"
            style={{ ['--accent' as string]: '#22d3ee' }}
          >
            {copied ? <Check className="h-5 w-5 text-emerald-600" /> : <Share2 className="h-5 w-5" />}
            <span>{copied ? t.home.mobileCopied : t.home.mobileShareBtn}</span>
          </button>

          <p className="border-l-4 border-[#e11d48] bg-[#f1f1ed] p-3 text-xs font-medium text-[#2a2f3d]">
            {t.home.mobileNote}
          </p>
        </div>
      </div>
    </section>
  );
}
