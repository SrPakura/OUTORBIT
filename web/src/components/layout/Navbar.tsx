import { useState } from 'react';
import { BookOpen, Cpu, Home, Menu, Music2, Swords, VolumeX, X } from 'lucide-react';
import { CONTEST_URLS } from '../../data/contestConfig';
import { useWebI18n, type WebLang } from '../../i18n/useWebI18n';
import { useOstAudio } from '../common/OstPlayer';

export type AppRoute = '/' | '/bestiary' | '/arsenal' | '/resources';

interface NavbarProps {
  currentRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
}

const LANGS: Array<{ id: WebLang; label: string }> = [
  { id: 'es', label: 'ES' },
  { id: 'en', label: 'EN' },
  { id: 'ja', label: '日本語' },
];

export default function Navbar({ currentRoute, onNavigate }: NavbarProps) {
  const { lang, setLang, t } = useWebI18n();
  const { isPlaying, togglePlay } = useOstAudio();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems: Array<{ route: AppRoute; label: string; icon: typeof Home }> = [
    { route: '/', label: t.nav.home, icon: Home },
    { route: '/bestiary', label: t.nav.bestiary, icon: Swords },
    { route: '/arsenal', label: t.nav.arsenal, icon: BookOpen },
    { route: '/resources', label: t.nav.resources, icon: Cpu },
  ];

  const handleGo = (route: AppRoute) => {
    onNavigate(route);
    setMobileMenuOpen(false);
  };

  return (
    <header className="fixed inset-x-0 top-3 z-50 px-3 sm:px-5">
      <nav
        aria-label="Primary Navigation"
        className="mx-auto flex max-w-7xl items-center justify-between gap-2 border-[3px] border-[#0b0d12] bg-[#fbfbf8]/95 px-3 py-2 shadow-[5px_5px_0_#0b0d12] backdrop-blur-sm sm:px-5 sm-skew-6"
      >
        <div className="flex items-center gap-3 sm-unskew-6">
          <button
            type="button"
            onClick={() => handleGo('/')}
            className="flex items-center gap-1.5 text-left"
          >
            <span className="font-comic text-xl text-[#0b0d12] sm:text-2xl">OUT</span>
            <span className="font-comic text-xl text-[#e11d48] sm:text-2xl">ORBIT</span>
            <span className="ml-1 border-2 border-[#0b0d12] bg-[#22d3ee] px-1.5 py-0.5 font-kicker text-[9px] text-[#0b0d12]">
              0G
            </span>
          </button>
        </div>

        {/* Desktop Route Tabs */}
        <div className="hidden items-center gap-1.5 lg:flex sm-unskew-6">
          {navItems.map((item) => {
            const active = currentRoute === item.route;
            return (
              <button
                key={item.route}
                type="button"
                onClick={() => handleGo(item.route)}
                className={`border-2 px-3 py-1.5 font-comic text-sm tracking-tight transition ${
                  active
                    ? 'border-[#0b0d12] bg-[#e11d48] text-[#fbfbf8] shadow-[3px_3px_0_#0b0d12]'
                    : 'border-transparent text-[#0b0d12] hover:border-[#0b0d12] hover:bg-[#f1f1ed]'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Utilities */}
        <div className="flex items-center gap-1.5 sm:gap-2 sm-unskew-6">
          <button
            type="button"
            onClick={togglePlay}
            className={`hidden items-center gap-1 border-2 border-[#0b0d12] px-2 py-1 font-kicker text-[10px] transition sm:flex ${
              isPlaying ? 'bg-[#0b0d12] text-[#22d3ee]' : 'bg-[#f1f1ed] text-[#0b0d12] hover:bg-[#e2e2dc]'
            }`}
            title="Toggle OST"
          >
            {isPlaying ? <Music2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
            <span>{isPlaying ? t.nav.ostPlay : t.nav.ostMute}</span>
          </button>

          <div className="flex border-2 border-[#0b0d12] bg-[#f1f1ed]">
            {LANGS.map((l) => {
              const active = lang === l.id;
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setLang(l.id)}
                  className={`px-1.5 py-1 font-kicker text-[10px] transition sm:px-2 ${
                    active ? 'bg-[#0e7490] text-white' : 'text-[#0b0d12] hover:bg-slate-200'
                  }`}
                >
                  {l.label}
                </button>
              );
            })}
          </div>

          <a
            href={CONTEST_URLS.game}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden border-2 border-[#0b0d12] bg-[#e11d48] px-3 py-1 font-comic text-sm text-white shadow-[3px_3px_0_#0b0d12] transition hover:-translate-y-0.5 hover:bg-[#be123c] sm:inline-block"
          >
            {t.nav.play}
          </a>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="flex h-8 w-8 items-center justify-center border-2 border-[#0b0d12] bg-[#f1f1ed] text-[#0b0d12] lg:hidden"
            aria-label="Menu"
          >
            {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </nav>

      {/* Mobile Dropdown Drawer */}
      {mobileMenuOpen && (
        <div className="mx-auto mt-2 max-w-7xl border-[3px] border-[#0b0d12] bg-[#fbfbf8] p-3 shadow-[6px_6px_0_#0b0d12] lg:hidden">
          <div className="grid grid-cols-2 gap-2">
            {navItems.map((item) => {
              const active = currentRoute === item.route;
              const Icon = item.icon;
              return (
                <button
                  key={item.route}
                  type="button"
                  onClick={() => handleGo(item.route)}
                  className={`flex items-center gap-2 border-2 border-[#0b0d12] px-3 py-2 text-left font-comic text-sm ${
                    active ? 'bg-[#e11d48] text-white' : 'bg-[#f1f1ed] text-[#0b0d12]'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 border-t-2 border-[#0b0d12] pt-2">
            <button
              type="button"
              onClick={togglePlay}
              className="flex items-center gap-1.5 border-2 border-[#0b0d12] bg-[#f1f1ed] px-3 py-1.5 font-kicker text-[10px] text-[#0b0d12]"
            >
              {isPlaying ? <Music2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
              <span>{isPlaying ? t.nav.ostPlay : t.nav.ostMute}</span>
            </button>
            <a
              href={CONTEST_URLS.game}
              target="_blank"
              rel="noopener noreferrer"
              className="border-2 border-[#0b0d12] bg-[#e11d48] px-4 py-1.5 font-comic text-sm text-white"
            >
              {t.nav.play}
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
