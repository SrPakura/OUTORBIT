// ============================================================================
// Ajustes persistentes del juego (controles, cámara, audio y estilo visual)
// ============================================================================
//
// Los ajustes viven en `localStorage` bajo una única clave versionada. Se leen
// al construir el GameEngine (entrar a la partida) y al guardar desde el menú
// de Controles. TODO valor se sanea al cargar: un JSON corrupto, una versión
// antigua o un binding vacío NUNCA rompen la partida — caen a los valores por
// defecto.

/** Acciones rebindables del juego (una tecla primaria por acción). */
export type ControlAction =
  | 'forward'
  | 'back'
  | 'left'
  | 'right'
  | 'jump'
  | 'sprint'
  | 'interact'
  | 'parry'
  | 'stasis'
  | 'lockOn'
  | 'slot1'
  | 'slot2'
  | 'slot3';

/** Orden estable de las acciones (validación, saneado y menú de controles). */
export const CONTROL_ACTIONS: ControlAction[] = [
  'forward',
  'back',
  'left',
  'right',
  'jump',
  'sprint',
  'interact',
  'parry',
  'stasis',
  'lockOn',
  'slot1',
  'slot2',
  'slot3',
];

export interface GameSettings {
  /** Multiplicador de sensibilidad del ratón (0.25 .. 2.5). */
  mouseSensitivity: number;
  /** Invierte el eje vertical de la cámara. */
  invertY: boolean;
  /** FOV base de la cámara en grados (55 .. 85). */
  baseFov: number;
  /** Multiplicador de volumen sobre el volumen base de SynthAudio (0 .. 1.5). */
  masterVolume: number;
  /** Trama halftone cómic en los materiales cel y en el cielo. */
  halftonesEnabled: boolean;
  /** Tecla primaria de cada acción (valores de `KeyboardEvent.code`). */
  bindings: Record<ControlAction, string>;
}

/** Rangos válidos de los ajustes numéricos (los usa el menú de Controles). */
export const SETTINGS_LIMITS = {
  mouseSensitivity: { min: 0.25, max: 2.5 },
  baseFov: { min: 55, max: 85 },
  masterVolume: { min: 0, max: 1.5 },
} as const;

/** Keybindings por defecto (WASD + Espacio + Shift + E/F/R/Q + 1/2/3). */
export const DEFAULT_BINDINGS: Record<ControlAction, string> = {
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  jump: 'Space',
  sprint: 'ShiftLeft',
  interact: 'KeyE',
  parry: 'KeyF',
  stasis: 'KeyR',
  lockOn: 'KeyQ',
  slot1: 'Digit1',
  slot2: 'Digit2',
  slot3: 'Digit3',
};

export const DEFAULT_SETTINGS: GameSettings = {
  mouseSensitivity: 1.0,
  invertY: false,
  baseFov: 70,
  masterVolume: 1.0,
  halftonesEnabled: true,
  bindings: { ...DEFAULT_BINDINGS },
};

const STORAGE_KEY = 'outorbit.settings.v1';

/**
 * Alias secundarios: solo se aceptan mientras el binding primario siga siendo
 * el de fábrica. Así un rebind personalizado SIEMPRE manda y nunca queda una
 * tecla vieja activa por sorpresa.
 */
const SECONDARY_ALIASES: Partial<Record<ControlAction, string[]>> = {
  sprint: ['ShiftRight'],
  stasis: ['KeyC'],
  lockOn: ['Tab', 'KeyV'],
};

/** Flechas como movimiento alternativo cuando no están asignadas a nada. */
const ARROW_FALLBACK: Array<[ControlAction, string]> = [
  ['forward', 'ArrowUp'],
  ['back', 'ArrowDown'],
  ['left', 'ArrowLeft'],
  ['right', 'ArrowRight'],
];

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, min), max);
}

/** Copia profunda de los ajustes (los bindings son un objeto anidado). */
export function cloneGameSettings(settings: GameSettings): GameSettings {
  return { ...settings, bindings: { ...settings.bindings } };
}

/**
 * Resuelve, para cada acción, la lista de códigos que la activan: binding
 * primario + alias secundarios limpios + flechas de reserva. Se calcula una
 * sola vez al aplicar ajustes para que el bucle de juego no asigne nada.
 */
export function resolveActionCodes(
  bindings: Record<ControlAction, string>
): Record<ControlAction, string[]> {
  const out = {} as Record<ControlAction, string[]>;
  const used = new Set<string>();
  for (const action of CONTROL_ACTIONS) {
    const primary = bindings[action] || DEFAULT_BINDINGS[action];
    const codes = [primary];
    used.add(primary);
    const aliases = SECONDARY_ALIASES[action];
    if (aliases && primary === DEFAULT_BINDINGS[action]) {
      for (const alias of aliases) {
        if (alias === primary || codes.includes(alias)) continue;
        codes.push(alias);
        used.add(alias);
      }
    }
    out[action] = codes;
  }
  // Flechas: movimiento alternativo solo si ninguna acción las ocupa.
  for (const [action, code] of ARROW_FALLBACK) {
    if (used.has(code)) continue;
    out[action].push(code);
    used.add(code);
  }
  return out;
}

/** Sanea cualquier entrada (JSON viejo, campos sueltos) a un GameSettings válido. */
function sanitizeSettings(raw: unknown): GameSettings {
  const source = (raw ?? {}) as Partial<GameSettings>;
  const rawBindings = (source.bindings ?? {}) as Partial<Record<ControlAction, string>>;
  const bindings = {} as Record<ControlAction, string>;
  for (const action of CONTROL_ACTIONS) {
    const code = rawBindings[action];
    bindings[action] =
      typeof code === 'string' && code.length > 0 ? code : DEFAULT_BINDINGS[action];
  }
  return {
    mouseSensitivity: clampNumber(
      source.mouseSensitivity,
      SETTINGS_LIMITS.mouseSensitivity.min,
      SETTINGS_LIMITS.mouseSensitivity.max,
      DEFAULT_SETTINGS.mouseSensitivity
    ),
    invertY: typeof source.invertY === 'boolean' ? source.invertY : DEFAULT_SETTINGS.invertY,
    baseFov: clampNumber(
      source.baseFov,
      SETTINGS_LIMITS.baseFov.min,
      SETTINGS_LIMITS.baseFov.max,
      DEFAULT_SETTINGS.baseFov
    ),
    masterVolume: clampNumber(
      source.masterVolume,
      SETTINGS_LIMITS.masterVolume.min,
      SETTINGS_LIMITS.masterVolume.max,
      DEFAULT_SETTINGS.masterVolume
    ),
    halftonesEnabled:
      typeof source.halftonesEnabled === 'boolean'
        ? source.halftonesEnabled
        : DEFAULT_SETTINGS.halftonesEnabled,
    bindings,
  };
}

/** Lee los ajustes guardados (o los de fábrica si no hay nada válido). */
export function loadGameSettings(): GameSettings {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return cloneGameSettings(DEFAULT_SETTINGS);
    return sanitizeSettings(JSON.parse(stored));
  } catch {
    // localStorage bloqueado o JSON corrupto: la partida arranca por defecto.
    return cloneGameSettings(DEFAULT_SETTINGS);
  }
}

/** Guarda los ajustes saneados (silencioso si el navegador bloquea el storage). */
export function saveGameSettings(settings: GameSettings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeSettings(settings)));
  } catch {
    // Modo privado / cuota llena: los ajustes viven solo en esta sesión.
  }
}

/** Restaura los valores de fábrica y los persiste. */
export function resetGameSettings(): GameSettings {
  const defaults = cloneGameSettings(DEFAULT_SETTINGS);
  saveGameSettings(defaults);
  return defaults;
}

const KEY_LABELS: Record<string, string> = {
  Space: 'ESPACIO',
  ShiftLeft: 'SHIFT',
  ShiftRight: 'SHIFT',
  ControlLeft: 'CTRL',
  ControlRight: 'CTRL',
  AltLeft: 'ALT',
  AltRight: 'ALT',
  MetaLeft: 'META',
  MetaRight: 'META',
  Tab: 'TAB',
  Enter: 'ENTER',
  NumpadEnter: 'ENTER',
  Escape: 'ESC',
  Backspace: 'RETROCESO',
  CapsLock: 'BLOQ MAYÚS',
  Delete: 'SUPR',
  Insert: 'INSERT',
  Home: 'INICIO',
  End: 'FIN',
  PageUp: 'RE PÁG',
  PageDown: 'AV PÁG',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backslash: '\\',
  BracketLeft: '[',
  BracketRight: ']',
  Minus: '-',
  Equal: '=',
  Backquote: '`',
};

/**
 * Etiqueta legible (en español) de un `KeyboardEvent.code`:
 * `KeyW -> W`, `Space -> ESPACIO`, `ShiftLeft -> SHIFT`, `ArrowUp -> ↑`.
 */
export function formatKeyCode(code: string): string {
  if (!code) return '—';
  const known = KEY_LABELS[code];
  if (known) return known;
  if (code.startsWith('Key') && code.length === 4) return code.slice(3).toUpperCase();
  if (code.startsWith('Digit') && code.length === 6) return code.slice(5);
  if (code.startsWith('Numpad') && code.length === 7) return `NUM ${code.slice(6)}`;
  return code.toUpperCase();
}
