import { useCallback, useEffect, useState } from 'react';
import { OstProvider } from './components/common/OstPlayer';
import CreditsFooter from './components/layout/CreditsFooter';
import Navbar, { type AppRoute } from './components/layout/Navbar';
import { WebI18nProvider } from './i18n/useWebI18n';
import ArsenalCombatPage from './pages/ArsenalCombatPage';
import BestiaryPage from './pages/BestiaryPage';
import HomeContestPage from './pages/HomeContestPage';
import ResourcesTransparencyPage from './pages/ResourcesTransparencyPage';

function normalizeRoute(pathname: string): AppRoute {
  if (pathname.startsWith('/bestiary')) return '/bestiary';
  if (pathname.startsWith('/arsenal')) return '/arsenal';
  if (pathname.startsWith('/resources')) return '/resources';
  return '/';
}

function AppShell() {
  const [route, setRoute] = useState<AppRoute>(() =>
    typeof window !== 'undefined' ? normalizeRoute(window.location.pathname) : '/',
  );

  useEffect(() => {
    const onPop = () => setRoute(normalizeRoute(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((next: AppRoute) => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.pathname = next;
      window.history.pushState({}, '', url.toString());
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    setRoute(next);
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-[#05010f]">
      <Navbar currentRoute={route} onNavigate={navigate} />
      <div className="flex-1">
        {route === '/' && <HomeContestPage onNavigate={navigate} />}
        {route === '/bestiary' && <BestiaryPage />}
        {route === '/arsenal' && <ArsenalCombatPage />}
        {route === '/resources' && <ResourcesTransparencyPage />}
      </div>
      <CreditsFooter onNavigate={navigate} />
    </div>
  );
}

export default function App() {
  return (
    <WebI18nProvider>
      <OstProvider>
        <AppShell />
      </OstProvider>
    </WebI18nProvider>
  );
}
