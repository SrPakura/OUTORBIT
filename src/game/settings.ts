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
  | 'radar'
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
  'radar',
  'slot1',
  'slot2',
  'slot3',
];

/**
 * Acciones rebindables del mando dentro de la Cúpula (Gamepad API estándar).
 * Compatible con mandos estándar vía mapeo W3C.
 */
export type GamepadAction = 'attack' | 'dash' | 'jump' | 'skill' | 'cycleSlot' | 'pause';

/** Orden estable de las acciones de mando (validación, saneado y menú). */
export const GAMEPAD_ACTIONS: GamepadAction[] = [
  'attack',
  'dash',
  'jump',
  'skill',
  'cycleSlot',
  'pause',
];

/**
 * Índice de botón estándar W3C (0..17):
 * 0=Cruz/A, 1=Círculo/B, 2=Cuadrado/X, 3=Triángulo/Y, 4=L1, 5=R1, 6=L2, 7=R2,
 * 8=Share/Select, 9=Options/Start, 10=L3, 11=R3, 12..15=D-Pad, 16=PS, 17=Touchpad.
 */
export type GamepadButtonIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17;

/** Idioma de la interfaz (español base, inglés como plantilla). */
export type Language = 'es' | 'en';

export interface GameSettings {
  /** Idioma de la UI ('es' por defecto, persistido en localStorage). */
  language: Language;
  /** Multiplicador de sensibilidad del ratón (0.25 .. 2.5). */
  mouseSensitivity: number;
  /** Invierte el eje vertical de la cámara. */
  invertY: boolean;
  /** FOV base de la cámara en grados (55 .. 85). */
  baseFov: number;
  /** Multiplicador de volumen sobre el volumen base de SynthAudio (0 .. 1.5). */
  masterVolume: number;
  /** Volumen específico de la música (0 .. 1.5), multiplicado con el general. */
  musicVolume: number;
  /** Volumen específico de sonidos y efectos (0 .. 1.5), multiplicado con el general. */
  sfxVolume: number;
  /** Trama halftone cómic en los materiales cel y en el cielo. */
  halftonesEnabled: boolean;
  /** Tecla primaria de cada acción (valores de `KeyboardEvent.code`). */
  bindings: Record<ControlAction, string>;
  /** Multiplicador de sensibilidad del stick derecho del mando (0.5 .. 3.0). */
  gamepadSensitivity: number;
  /** Zona muerta radial de los sticks analógicos del mando (0.05 .. 0.35). */
  gamepadDeadzone: number;
  /** Botón del mando (índice W3C 0..17) de cada acción de la Cúpula. */
  gamepadBindings: Record<GamepadAction, GamepadButtonIndex>;
}

/** Rangos válidos de los ajustes numéricos (los usa el menú de Controles). */
export const SETTINGS_LIMITS = {
  mouseSensitivity: { min: 0.25, max: 2.5 },
  baseFov: { min: 55, max: 85 },
  masterVolume: { min: 0, max: 1.5 },
  musicVolume: { min: 0, max: 1.5 },
  sfxVolume: { min: 0, max: 1.5 },
  gamepadSensitivity: { min: 0.5, max: 3.0 },
  gamepadDeadzone: { min: 0.05, max: 0.35 },
} as const;

/** Keybindings por defecto (WASD + Espacio + Shift + E/F/R/Q + Tab + 1/2/3). */
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
  radar: 'Tab',
  slot1: 'Digit1',
  slot2: 'Digit2',
  slot3: 'Digit3',
};

/**
 * Bindings de mando por defecto (mapeo W3C estándar):
 * R2 (7) ataca, R1 (5) dashea, Cruz (0) salta/despega, Triángulo (3) usa la
 * habilidad de la ranura activa, D-Pad Abajo (13) cambia de ranura y
 * Options (9) pausa.
 */
export const DEFAULT_GAMEPAD_BINDINGS: Record<GamepadAction, GamepadButtonIndex> = {
  attack: 7,
  dash: 5,
  jump: 0,
  skill: 3,
  cycleSlot: 13,
  pause: 9,
};

export const DEFAULT_SETTINGS: GameSettings = {
  language: 'es',
  mouseSensitivity: 1.0,
  invertY: false,
  baseFov: 70,
  masterVolume: 1.0,
  musicVolume: 1.0,
  sfxVolume: 1.0,
  halftonesEnabled: true,
  bindings: { ...DEFAULT_BINDINGS },
  gamepadSensitivity: 1.4,
  gamepadDeadzone: 0.14,
  gamepadBindings: { ...DEFAULT_GAMEPAD_BINDINGS },
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

/** Sanea un índice de botón de mando (entero 0..17) con reserva W3C. */
function clampButtonIndex(value: unknown, fallback: GamepadButtonIndex): GamepadButtonIndex {
  if (typeof value !== 'number' || !Number.isInteger(value)) return fallback;
  if (value < 0 || value > 17) return fallback;
  return value as GamepadButtonIndex;
}

/** Copia profunda de los ajustes (bindings y gamepadBindings son anidados). */
export function cloneGameSettings(settings: GameSettings): GameSettings {
  return {
    ...settings,
    bindings: { ...settings.bindings },
    gamepadBindings: { ...settings.gamepadBindings },
  };
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
  // Los ajustes de mando llegaron después: un JSON viejo sin estos campos cae
  // a los valores por defecto sin romper la partida guardada.
  const rawGamepadBindings = (source.gamepadBindings ?? {}) as Partial<
    Record<GamepadAction, GamepadButtonIndex>
  >;
  const gamepadBindings = {} as Record<GamepadAction, GamepadButtonIndex>;
  for (const action of GAMEPAD_ACTIONS) {
    gamepadBindings[action] = clampButtonIndex(
      rawGamepadBindings[action],
      DEFAULT_GAMEPAD_BINDINGS[action],
    );
  }
  return {
    language: source.language === 'en' ? 'en' : 'es',
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
    musicVolume: clampNumber(
      source.musicVolume,
      SETTINGS_LIMITS.musicVolume.min,
      SETTINGS_LIMITS.musicVolume.max,
      DEFAULT_SETTINGS.musicVolume
    ),
    sfxVolume: clampNumber(
      source.sfxVolume,
      SETTINGS_LIMITS.sfxVolume.min,
      SETTINGS_LIMITS.sfxVolume.max,
      DEFAULT_SETTINGS.sfxVolume
    ),
    halftonesEnabled:
      typeof source.halftonesEnabled === 'boolean'
        ? source.halftonesEnabled
        : DEFAULT_SETTINGS.halftonesEnabled,
    bindings,
    gamepadSensitivity: clampNumber(
      source.gamepadSensitivity,
      SETTINGS_LIMITS.gamepadSensitivity.min,
      SETTINGS_LIMITS.gamepadSensitivity.max,
      DEFAULT_SETTINGS.gamepadSensitivity
    ),
    gamepadDeadzone: clampNumber(
      source.gamepadDeadzone,
      SETTINGS_LIMITS.gamepadDeadzone.min,
      SETTINGS_LIMITS.gamepadDeadzone.max,
      DEFAULT_SETTINGS.gamepadDeadzone
    ),
    gamepadBindings,
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

/**
 * Etiquetas legibles (en español) de los botones estándar W3C 0..17, con el
 * nombre clásico de mando primero y el genérico de PC entre paréntesis:
 * `0 -> Cruz (A)`, `1 -> Círculo (B)`, `4 -> L1`, `9 -> Options (Start)`.
 */
export const GAMEPAD_BUTTON_LABELS: Record<GamepadButtonIndex, string> = {
  0: 'Cruz (A)',
  1: 'Círculo (B)',
  2: 'Cuadrado (X)',
  3: 'Triángulo (Y)',
  4: 'L1',
  5: 'R1',
  6: 'L2',
  7: 'R2',
  8: 'Share (Select)',
  9: 'Options (Start)',
  10: 'L3',
  11: 'R3',
  12: 'D-Pad Arriba',
  13: 'D-Pad Abajo',
  14: 'D-Pad Izquierda',
  15: 'D-Pad Derecha',
  16: 'PS',
  17: 'Touchpad',
};

/** Etiqueta legible de un índice de botón de mando (reserva para índices raros). */
export function formatGamepadButton(index: GamepadButtonIndex): string {
  return GAMEPAD_BUTTON_LABELS[index] ?? `Botón ${index}`;
}
