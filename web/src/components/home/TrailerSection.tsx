import { Radio, Tv } from 'lucide-react';
import { TRAILER_CONFIG } from '../../data/contestConfig';
import { useWebI18n } from '../../i18n/useWebI18n';

export default function TrailerSection() {
  const { t } = useWebI18n();
  const hasVideo = TRAILER_CONFIG.videoUrl.trim().length > 0;

  return (
    <section id="trailer" className="paper-grid border-t-4 border-[#0b0d12] px-4 py-16 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="font-kicker text-xs text-[#e11d48]">{t.home.trailerKicker}</div>
            <h2 className="mt-1 font-comic text-4xl uppercase sm:text-6xl hollow-ink-title">
              {t.home.trailerTitle}
            </h2>
          </div>
          <div className="inline-flex items-center gap-2 border-2 border-[#0b0d12] bg-[#0b0d12] px-3 py-1.5 font-kicker text-[10px] text-[#22d3ee]">
            <Radio className="h-3.5 w-3.5 animate-pulse text-[#e11d48]" />
            <span>{t.home.trailerFreq}</span>
          </div>
        </div>

        <div className="border-4 border-[#0b0d12] bg-[#0d0a1f] p-3 shadow-[12px_12px_0_#e11d48] sm:p-5">
          {hasVideo ? (
            TRAILER_CONFIG.embedType === 'iframe' ? (
              <div className="aspect-video w-full overflow-hidden border-2 border-[#2a2f3d] bg-black">
                <iframe
                  src={TRAILER_CONFIG.videoUrl}
                  title="OUTORBIT Trailer"
                  className="h-full w-full"
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : (
              <video
                src={TRAILER_CONFIG.videoUrl}
                controls
                playsInline
                poster="/audio/covers/cover.webp"
                className="aspect-video w-full border-2 border-[#2a2f3d] bg-black"
              />
            )
          ) : (
            <div className="cosmic-grid relative flex aspect-video w-full flex-col items-center justify-center overflow-hidden border-2 border-[#22d3ee]/40 p-6 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center border-[3px] border-[#22d3ee] bg-[#05010f] shadow-[4px_4px_0_#e11d48]">
                <Tv className="h-8 w-8 text-[#22d3ee]" />
              </div>
              <div className="font-kicker text-xs text-[#3be8ff]">{t.home.trailerFreq}</div>
              <h3 className="mt-2 font-comic text-2xl text-white sm:text-4xl">
                {t.home.trailerPendingTitle}
              </h3>
              <p className="mt-3 max-w-xl text-sm text-slate-300">{t.home.trailerPendingDesc}</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
