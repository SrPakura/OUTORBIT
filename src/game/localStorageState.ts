import type { ControlAction, GamepadAction, GamepadButtonIndex, GameSettings, Language } from './settings';

// ============================================================================
// Persistencia estructurada en localStorage para OUTORBIT
// ============================================================================
// Centraliza las entradas pedidas para el jugador:
// - outorbit_language       : 'en' | 'es' (por defecto 'en')
// - outorbit_nickname       : apodo del piloto para el leaderboard
// - outorbit_best_score     : mejor puntuación personal del piloto
// - outorbit_button_mapping : array con los mapeos de PC y mando
// - outorbit_other_settings : array con el resto de ajustes (cámara, audio, etc.)
// - outorbit_tutorial       : array de progreso de tutoriales (de momento 'movimiento')
// ============================================================================

export const STORAGE_KEYS = {
  language: 'outorbit_language',
  nickname: 'outorbit_nickname',
  legacyPilotName: 'outorbit_pilot_name',
  bestScore: 'outorbit_best_score',
  buttonMapping: 'outorbit_button_mapping',
  otherSettings: 'outorbit_other_settings',
  tutorial: 'outorbit_tutorial',
} as const;

export interface ButtonMappingEntry {
  device: 'pc' | 'gamepad';
  action: ControlAction | GamepadAction;
  binding: string | GamepadButtonIndex;
}

export type OtherSettingKey =
  | 'mouseSensitivity'
  | 'invertY'
  | 'baseFov'
  | 'masterVolume'
  | 'musicVolume'
  | 'sfxVolume'
  | 'halftonesEnabled'
  | 'gamepadSensitivity'
  | 'gamepadDeadzone';

export interface OtherSettingEntry {
  key: OtherSettingKey;
  value: number | boolean;
}

export type TutorialProgressId =
  | 'tutorial_de_movimiento'
  | 'tutorial_de_rebotes'
  | 'tutorial_de_slow_mo';

export interface TutorialProgressEntry {
  id: TutorialProgressId;
  completed: boolean;
}

const DEFAULT_TUTORIAL_PROGRESS: TutorialProgressEntry[] = [
  { id: 'tutorial_de_movimiento', completed: false },
  { id: 'tutorial_de_rebotes', completed: false },
  { id: 'tutorial_de_slow_mo', completed: false },
];

function safeGetItem(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // localStorage bloqueado o cuota llena: ignorar silenciosamente.
  }
}

// ---------------------------------------------------------------------------
// Idioma ('en' por defecto)
// ---------------------------------------------------------------------------
export function loadStoredLanguage(): Language | null {
  const raw = safeGetItem(STORAGE_KEYS.language);
  if (raw === 'es' || raw === 'en' || raw === 'ja') return raw;
  return null;
}

export function saveStoredLanguage(language: Language): void {
  safeSetItem(STORAGE_KEYS.language, language);
}

// ---------------------------------------------------------------------------
// Apodo y récord personal
// ---------------------------------------------------------------------------
export function loadPilotNickname(): string {
  const current = safeGetItem(STORAGE_KEYS.nickname);
  if (current !== null) return current;
  // Compatibilidad con la clave anterior si el jugador ya tenía apodo guardado.
  const legacy = safeGetItem(STORAGE_KEYS.legacyPilotName);
  if (legacy && legacy.trim().length > 0) {
    safeSetItem(STORAGE_KEYS.nickname, legacy.trim());
    return legacy.trim();
  }
  return '';
}

export function savePilotNickname(nickname: string): void {
  const clean = nickname.trim();
  safeSetItem(STORAGE_KEYS.nickname, clean);
  safeSetItem(STORAGE_KEYS.legacyPilotName, clean);
}

export function loadPersonalBestScore(): number {
  const raw = safeGetItem(STORAGE_KEYS.bestScore);
  if (!raw) return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}

export function savePersonalBestScore(score: number): void {
  const clean = Number.isFinite(score) ? Math.max(0, Math.round(score)) : 0;
  safeSetItem(STORAGE_KEYS.bestScore, String(clean));
}

// ---------------------------------------------------------------------------
// Mapeo de botones (array de PC + Mando)
// ---------------------------------------------------------------------------
export function buildButtonMappingArray(
  bindings: Record<ControlAction, string>,
  gamepadBindings: Record<GamepadAction, GamepadButtonIndex>,
): ButtonMappingEntry[] {
  const entries: ButtonMappingEntry[] = [];
  for (const [action, binding] of Object.entries(bindings)) {
    entries.push({
      device: 'pc',
      action: action as ControlAction,
      binding,
    });
  }
  for (const [action, binding] of Object.entries(gamepadBindings)) {
    entries.push({
      device: 'gamepad',
      action: action as GamepadAction,
      binding,
    });
  }
  return entries;
}

export function loadButtonMappingArray(): ButtonMappingEntry[] | null {
  const raw = safeGetItem(STORAGE_KEYS.buttonMapping);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ButtonMappingEntry[]) : null;
  } catch {
    return null;
  }
}

export function saveButtonMappingArray(
  bindings: Record<ControlAction, string>,
  gamepadBindings: Record<GamepadAction, GamepadButtonIndex>,
): void {
  const entries = buildButtonMappingArray(bindings, gamepadBindings);
  safeSetItem(STORAGE_KEYS.buttonMapping, JSON.stringify(entries));
}

// ---------------------------------------------------------------------------
// Otros ajustes (array con el resto de configuraciones)
// ---------------------------------------------------------------------------
const OTHER_SETTING_KEYS: OtherSettingKey[] = [
  'mouseSensitivity',
  'invertY',
  'baseFov',
  'masterVolume',
  'musicVolume',
  'sfxVolume',
  'halftonesEnabled',
  'gamepadSensitivity',
  'gamepadDeadzone',
];

export function buildOtherSettingsArray(settings: GameSettings): OtherSettingEntry[] {
  return OTHER_SETTING_KEYS.map((key) => ({
    key,
    value: settings[key],
  }));
}

export function loadOtherSettingsArray(): OtherSettingEntry[] | null {
  const raw = safeGetItem(STORAGE_KEYS.otherSettings);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OtherSettingEntry[]) : null;
  } catch {
    return null;
  }
}

export function saveOtherSettingsArray(settings: GameSettings): void {
  safeSetItem(STORAGE_KEYS.otherSettings, JSON.stringify(buildOtherSettingsArray(settings)));
}

// ---------------------------------------------------------------------------
// Tutorial (array; por ahora solo 'movimiento')
// ---------------------------------------------------------------------------
export function loadTutorialProgress(): TutorialProgressEntry[] {
  const raw = safeGetItem(STORAGE_KEYS.tutorial);
  if (!raw) return DEFAULT_TUTORIAL_PROGRESS.map((item) => ({ ...item }));
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return DEFAULT_TUTORIAL_PROGRESS.map((item) => ({ ...item }));
    }
    const byId = new Map<string, boolean>();
    for (const item of parsed) {
      if (item && typeof item.id === 'string') {
        byId.set(item.id, Boolean(item.completed));
      }
    }
    return DEFAULT_TUTORIAL_PROGRESS.map((def) => ({
      id: def.id,
      completed: byId.get(def.id) ?? def.completed,
    }));
  } catch {
    return DEFAULT_TUTORIAL_PROGRESS.map((item) => ({ ...item }));
  }
}

export function saveTutorialProgress(entries: TutorialProgressEntry[]): void {
  safeSetItem(STORAGE_KEYS.tutorial, JSON.stringify(entries));
}

export function setTutorialCompleted(id: TutorialProgressId, completed = true): TutorialProgressEntry[] {
  const current = loadTutorialProgress();
  const next = current.map((entry) => (entry.id === id ? { ...entry, completed } : entry));
  saveTutorialProgress(next);
  return next;
}

export function areAllTutorialsCompleted(): boolean {
  return loadTutorialProgress().every((entry) => entry.completed);
}

export function setAllTutorialsCompleted(completed: boolean): TutorialProgressEntry[] {
  const next = DEFAULT_TUTORIAL_PROGRESS.map((entry) => ({
    id: entry.id,
    completed,
  }));
  saveTutorialProgress(next);
  return next;
}

export function ensureTutorialStorageInitialized(): void {
  if (safeGetItem(STORAGE_KEYS.tutorial) === null) {
    saveTutorialProgress(DEFAULT_TUTORIAL_PROGRESS);
  }
}
