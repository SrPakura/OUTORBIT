import { ExternalLink, Github, Globe } from 'lucide-react';
import { CONTEST_URLS, SOCIAL_LINKS } from '../../data/contestConfig';
import { useWebI18n } from '../../i18n/useWebI18n';
import type { AppRoute } from './Navbar';

interface CreditsFooterProps {
  onNavigate: (route: AppRoute) => void;
}

export default function CreditsFooter({ onNavigate }: CreditsFooterProps) {
  const { t } = useWebI18n();

  return (
    <footer className="relative border-t-4 border-[#e11d48] bg-[#05010f] px-4 py-14 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-10 md:grid-cols-12 md:items-end">
          <div className="md:col-span-6">
            <div className="inline-block border-2 border-[#e11d48] bg-[#e11d48]/15 px-3 py-1 font-kicker text-[10px] text-[#fda4af]">
              {t.footer.tag}
            </div>
            <div className="mt-3 font-comic text-5xl tracking-tight text-white sm:text-6xl">
              OUT<span className="text-[#e11d48]">ORBIT</span>
            </div>
            <p className="mt-3 text-sm text-slate-300">
              {t.footer.authorLabel}{' '}
              <strong className="text-white">{t.footer.authorName}</strong>.
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              <a
                href={CONTEST_URLS.portfolio}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 border-2 border-[#22d3ee] bg-[#0d0a1f] px-4 py-2 font-comic text-base text-[#22d3ee] shadow-[4px_4px_0_#22d3ee] transition hover:-translate-y-0.5"
              >
                <Globe className="h-4 w-4" />
                <span>{t.footer.portfolioBtn}</span>
              </a>
              <a
                href={CONTEST_URLS.github}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 border-2 border-white bg-[#fbfbf8] px-4 py-2 font-comic text-base text-[#0b0d12] shadow-[4px_4px_0_#e11d48] transition hover:-translate-y-0.5"
              >
                <Github className="h-4 w-4" />
                <span>{t.footer.repoBtn}</span>
              </a>
              <a
                href={CONTEST_URLS.game}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 border-2 border-[#fbbf24] bg-[#fbbf24] px-4 py-2 font-comic text-base text-[#0b0d12] shadow-[4px_4px_0_#ffffff] transition hover:-translate-y-0.5"
              >
                <ExternalLink className="h-4 w-4" />
                <span>{t.footer.playBtn}</span>
              </a>
            </div>
          </div>

          <div className="flex flex-col gap-4 md:col-span-6 md:items-end">
            <div className="flex flex-wrap gap-2">
              {(['/', '/bestiary', '/arsenal', '/resources'] as AppRoute[]).map((route) => {
                const label =
                  route === '/'
                    ? t.nav.home
                    : route === '/bestiary'
                      ? t.nav.bestiary
                      : route === '/arsenal'
                        ? t.nav.arsenal
                        : t.nav.resources;
                return (
                  <button
                    key={route}
                    type="button"
                    onClick={() => onNavigate(route)}
                    className="border border-slate-700 bg-[#0d0a1f] px-3 py-1 font-kicker text-[10px] text-slate-300 hover:border-[#22d3ee] hover:text-white"
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {SOCIAL_LINKS.length === 0 ? (
              <div className="border-2 border-[#2a2f3d] bg-[#0d0a1f] px-4 py-2 font-kicker text-[11px] text-[#3be8ff]">
                {t.footer.socialZero}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {SOCIAL_LINKS.map((s) => (
                  <a
                    key={s.id}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="border-2 border-slate-600 px-3 py-1 font-kicker text-[10px] text-slate-200 hover:border-[#22d3ee]"
                  >
                    {s.label}
                  </a>
                ))}
              </div>
            )}

            <div className="font-kicker text-[10px] text-slate-500">
              OUTORBIT.PAKURA.DEV · CLOUDFLARE PAGES SPA
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
