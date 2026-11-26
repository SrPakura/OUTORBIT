import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { es, type WebDictionary } from './es';
import { en } from './en';
import { ja } from './ja';

export type WebLang = 'es' | 'en' | 'ja';

const STORAGE_KEY = 'outorbit_web_lang';

const DICTS: Record<WebLang, WebDictionary> = { es, en, ja };

function detectInitialLang(): WebLang {
  if (typeof window === 'undefined') return 'es';
  const params = new URLSearchParams(window.location.search);
  const urlLang = params.get('lang');
  if (urlLang === 'es' || urlLang === 'en' || urlLang === 'ja') {
    return urlLang;
  }
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'es' || stored === 'en' || stored === 'ja') {
    return stored;
  }
  const nav = (window.navigator.language || '').toLowerCase();
  if (nav.startsWith('ja')) return 'ja';
  if (nav.startsWith('en')) return 'en';
  return 'es';
}

interface WebI18nContextValue {
  lang: WebLang;
  setLang: (lang: WebLang) => void;
  t: WebDictionary;
}

const WebI18nContext = createContext<WebI18nContextValue | null>(null);

export function WebI18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<WebLang>(detectInitialLang);

  const setLang = (next: WebLang) => {
    setLangState(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, next);
      const url = new URL(window.location.href);
      url.searchParams.set('lang', next);
      window.history.replaceState({}, '', url.toString());
    }
  };

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo<WebI18nContextValue>(
    () => ({ lang, setLang, t: DICTS[lang] }),
    [lang],
  );

  return <WebI18nContext.Provider value={value}>{children}</WebI18nContext.Provider>;
}

export function useWebI18n(): WebI18nContextValue {
  const ctx = useContext(WebI18nContext);
  if (!ctx) throw new Error('useWebI18n must be used within WebI18nProvider');
  return ctx;
}
