import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { loadGameSettings, saveGameSettings, type Language } from '@/game/settings';
import { loadStoredLanguage, saveStoredLanguage } from '@/game/localStorageState';
import es from './es.json';
import en from './en.json';
import ja from './ja.json';

// ============================================================================
// Infraestructura multi-idioma de OUTORBIT: español como idioma base e inglés
// como plantilla preparada. El diccionario activo vive en el estado del
// LanguageProvider; `t(key, params)` resuelve rutas con puntos ("pause.title")
// e interpola `{{param}}`, con fallback SIEMPRE seguro a es.json y, si la clave
// no existiera, a la propia clave (la UI nunca rompe por un texto ausente).
// ============================================================================

export type { Language };

/** Parámetros de interpolación: `t('hud.wave', { n: 3 })` -> "OLEADA 3". */
export type TranslationParams = Record<string, string | number>;

const DICTIONARIES: Record<Language, unknown> = { es, en, ja };

/** Resuelve una ruta de puntos ("a.b.c") dentro de un diccionario JSON. */
function resolvePath(dictionary: unknown, key: string): unknown {
  let node: unknown = dictionary;
  for (const segment of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[segment];
  }
  return node;
}

/** Sustituye cada `{{param}}` por su valor (los que faltan se dejan tal cual). */
function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

export interface I18nContextValue {
  /** Idioma activo ('es' por defecto, persistido en GameSettings). */
  language: Language;
  /** Cambia el idioma y lo persiste en localStorage al instante. */
  setLanguage: (language: Language) => void;
  /** Alterna cíclicamente entre 'es', 'en' y 'ja'. */
  toggleLanguage: () => void;
  /** Traduce una clave con fallback seguro a es.json y luego a la clave. */
  t: (key: string, params?: TranslationParams) => string;
}

/** Contexto por defecto (sin provider): inglés y no-ops, nunca rompe la UI. */
const DEFAULT_CONTEXT: I18nContextValue = {
  language: 'en',
  setLanguage: () => {},
  toggleLanguage: () => {},
  t: (key, params) => interpolate(String(resolvePath(en, key) ?? resolvePath(es, key) ?? key), params),
};

const I18nContext = createContext<I18nContextValue>(DEFAULT_CONTEXT);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    try {
      return loadStoredLanguage() ?? loadGameSettings().language;
    } catch {
      return 'en';
    }
  });

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    try {
      saveStoredLanguage(next);
      // Persiste SOLO el idioma sobre los ajustes ya guardados (no toca el resto).
      saveGameSettings({ ...loadGameSettings(), language: next });
    } catch {
      // localStorage bloqueado: el idioma vive solo en esta sesión.
    }
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguageState((prev) => {
      const next: Language = prev === 'es' ? 'en' : prev === 'en' ? 'ja' : 'es';
      try {
        saveStoredLanguage(next);
        saveGameSettings({ ...loadGameSettings(), language: next });
      } catch {
        // Sin persistencia: cambio solo en memoria.
      }
      return next;
    });
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      setLanguage,
      toggleLanguage,
      t: (key, params) => {
        const raw = resolvePath(DICTIONARIES[language], key);
        const fallback = resolvePath(en, key) ?? resolvePath(es, key);
        const template = typeof raw === 'string' ? raw : fallback;
        return interpolate(typeof template === 'string' ? template : key, params);
      },
    }),
    [language, setLanguage, toggleLanguage],
  );

  return createElement(I18nContext.Provider, { value }, children);
}

/** Hook de traducción: `const { t, language, setLanguage } = useI18n()`. */
export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}

/**
 * Clave de diccionario para una etiqueta de oleada emitida por el engine
 * ('BÁSICOS' | 'MINIBOSS' | 'BOSS'), o null si no es una etiqueta conocida
 * (se muestra tal cual). Así el HUD y la pausa traducen en tiempo real.
 */
export function waveLabelKey(label: string): string | null {
  switch (label) {
    case 'BÁSICOS':
      return 'enemies.waveBasic';
    case 'MINIBOSS':
      return 'enemies.waveMiniboss';
    case 'BOSS':
      return 'enemies.waveBoss';
    default:
      return null;
  }
}

/** Mapa de id de habilidad activa/pasiva a la clave en skills / skillDescriptions */
export const SKILL_I18N_KEYS: Record<string, string> = {
  gravity_field: 'gravityField',
  repulse_push: 'push',
  eden_absorb: 'edenAbsorption',
  attraction_well: 'attractionWell',
  bounce_horizon: 'bounceHorizon',
  black_hole: 'blackHole',
  implosion: 'implosion',
  speed_force: 'speed',
  eden_regen: 'edenRegen',
  hp_regen: 'hpRegen',
};

/** Mapa de arquetipo de enemigo a clave de traducción en enemies.* */
export const ENEMY_I18N_KEYS: Record<string, string> = {
  abyssal_cell: 'enemies.abyssalCell',
  spiral_octopus: 'enemies.spiralOctopus',
  crab_gunner: 'enemies.crabGunner',
  ground_golem: 'enemies.groundGolem',
  lightning_butterfly: 'enemies.lightningButterfly',
  giant_sparrow: 'enemies.giantSparrow',
  prisma_necroz: 'enemies.prismaNecroz',
  kronos_leviathan: 'enemies.kronosLeviathan',
};

export default LanguageProvider;
