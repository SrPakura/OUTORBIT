import {
  type GamepadAction,
  type GamepadButtonIndex,
  type GameSettings,
} from '@/game/settings';

// ============================================================================
// GamepadInput — lector de la Gamepad API estándar (W3C) para la Cúpula.
// ============================================================================
//
// Diseñado para cualquier mando W3C estándar: usa el mapeo
// estándar del navegador (0=Cruz/A, 1=Círculo/B, 2=Cuadrado/X, 3=Triángulo/Y,
// 4=L1, 5=R1, 6=L2, 7=R2, 9=Options/Start, 12..15=D-Pad).
//
// `update()` se llama UNA vez por frame desde el loop del juego (antes de la
// física) y no depende del pointer lock: se puede jugar con teclado+ratón, con
// mando, o con ambos a la vez. Los flancos (justPressed) se calculan contra
// el estado del frame anterior, igual que hace el teclado con codesDown.

/** Botones estándar W3C que puede reportar un mando (0..17). */
const MAX_STANDARD_BUTTONS = 18;

/**
 * Patrones de dispositivos HID que el navegador expone en `navigator.getGamepads()`
 * pero NO son mandos de juego (cascos/auriculares USB o Bluetooth, micrófonos,
 * tarjetas de sonido, teclados, ratones, tabletas gráficas, webcams, etc.).
 */
const NON_GAMEPAD_ID_RE =
  /\b(headset|headphone|headphones|earphone|earbuds|earbud|airpods|auricular|auriculares|cascos|audio|sound\s*card|soundcard|sound\s*blaster|soundbar|speaker|speakers|altavoz|mic|microphone|dac|amp|mixer|keyboard|keypad|keychron|ducky|numpad|mouse|trackpad|touchpad|trackball|wacom|tablet|stylus|digitizer|pen\s*display|huion|xp-pen|webcam|camera|stream\s*deck|elgato|spacemouse|3dconnexion|foot\s*pedal|arctis|virtuoso|void\s*(?:pro|elite|rgb)|kraken|blackshark|barracuda|nari|thresher|kaira|cloud\s*(?:ii|iii|alpha|stinger|flight|mix|core|revolver)|pulse\s*3d|inzone|sennheiser|epos|jabra|plantronics|bose|beats|jbl)\b/i;

export type ActiveInputDevice = 'pointer' | 'gamepad';

let lastInputDevice: ActiveInputDevice = 'pointer';

export function markGamepadUsed(): void {
  lastInputDevice = 'gamepad';
}

export function markPointerUsed(): void {
  lastInputDevice = 'pointer';
}

/** True si el último dispositivo usado fue el mando y sigue habiendo un mando real conectado. */
export function isGamepadPreferred(): boolean {
  return lastInputDevice === 'gamepad' && readConnectedGamepad() !== null;
}

/**
 * Comprueba que un `Gamepad` de la Gamepad API sea realmente un mando de juego
 * y no unos cascos, ratón, teclado u otro periférico HID.
 */
export function isValidGamepad(pad: Gamepad | null | undefined): pad is Gamepad {
  if (!pad || !pad.connected) return false;
  if (NON_GAMEPAD_ID_RE.test(pad.id)) return false;
  // Un mando usable en OUTORBIT necesita 2 sticks (>= 4 ejes) y >= 10 botones.
  if (pad.axes.length < 4 || pad.buttons.length < 10) return false;
  // Si el navegador no lo reconoce como 'standard', exigir al menos 12 botones
  // para descartar controles multimedia o HID parciales.
  if (pad.mapping !== 'standard' && pad.buttons.length < 12) return false;
  return true;
}

/** True si el mando tiene algún botón pulsado o algún stick fuera de reposo. */
export function hasGamepadActivity(pad: Gamepad, axisThreshold = 0.25): boolean {
  for (const button of pad.buttons) {
    if (button && (button.pressed || button.value > 0.5)) return true;
  }
  for (const axis of pad.axes) {
    if (Math.abs(axis) > axisThreshold) return true;
  }
  return false;
}

/**
 * Estado crudo de conexión leído de `navigator.getGamepads()`, filtrando
 * dispositivos que no son mandos (cascos, teclados, ratones, etc.).
 * Prioriza mandos con mapeo W3C `'standard'`.
 */
export function readConnectedGamepad(): Gamepad | null {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
  try {
    const pads = navigator.getGamepads();
    if (!pads) return null;
    let fallback: Gamepad | null = null;
    for (const pad of pads) {
      if (!isValidGamepad(pad)) continue;
      if (pad.mapping === 'standard') return pad;
      if (!fallback) fallback = pad;
    }
    return fallback;
  } catch {
    // Algunos navegadores lanzan si se consulta sin gesto del usuario.
  }
  return null;
}

/** Nombre corto del primer mando conectado (null si no hay ninguno). */
export function getConnectedGamepadName(): string | null {
  const pad = readConnectedGamepad();
  return pad ? pad.id : null;
}

/**
 * Zona muerta radial: dentro del círculo de radio `deadzone` el stick es 0;
 * fuera se re-escala linealmente a 0..1 para que no haya salto en el borde.
 */
export function applyRadialDeadzone(
  x: number,
  y: number,
  deadzone: number,
): { x: number; y: number } {
  const mag = Math.hypot(x, y);
  if (mag <= deadzone || mag < 1e-6) return { x: 0, y: 0 };
  const scaled = Math.min(1, (mag - deadzone) / (1 - deadzone)) / mag;
  return { x: x * scaled, y: y * scaled };
}

export class GamepadInput {
  private bindings: Record<GamepadAction, GamepadButtonIndex>;
  private deadzone: number;
  private sensitivity: number;

  // Flancos: estado de cada botón en el frame actual y en el anterior.
  private readonly currButtons: boolean[] = new Array(MAX_STANDARD_BUTTONS).fill(false);
  private readonly prevButtons: boolean[] = new Array(MAX_STANDARD_BUTTONS).fill(false);

  // Sticks con zona muerta aplicada (-1..1).
  private leftX = 0;
  private leftY = 0;
  private rightX = 0;
  private rightY = 0;

  private connected = false;
  private gamepadId: string | null = null;

  constructor(settings: GameSettings) {
    this.bindings = { ...settings.gamepadBindings };
    this.deadzone = settings.gamepadDeadzone;
    this.sensitivity = settings.gamepadSensitivity;
  }

  applySettings(settings: GameSettings): void {
    this.bindings = { ...settings.gamepadBindings };
    this.deadzone = settings.gamepadDeadzone;
    this.sensitivity = settings.gamepadSensitivity;
  }

  /** Sensibilidad configurada del stick derecho (la usa la rotación de cámara). */
  getSensitivity(): number {
    return this.sensitivity;
  }

  /**
   * Lee `navigator.getGamepads()` y recalcula sticks y flancos de botones.
   * Llamar exactamente una vez por frame, antes de consumir la entrada.
   */
  update(): void {
    this.prevButtons.splice(0, MAX_STANDARD_BUTTONS, ...this.currButtons);
    const pad = readConnectedGamepad();
    this.connected = pad !== null;
    this.gamepadId = pad ? pad.id : null;
    if (!pad) {
      this.currButtons.fill(false);
      this.leftX = 0;
      this.leftY = 0;
      this.rightX = 0;
      this.rightY = 0;
      return;
    }

    for (let i = 0; i < MAX_STANDARD_BUTTONS; i++) {
      const btn = pad.buttons[i];
      this.currButtons[i] = btn ? btn.pressed || btn.value > 0.5 : false;
    }

    const ax = pad.axes;
    const lx = ax[0] ?? 0;
    const ly = ax[1] ?? 0;
    const rx = ax[2] ?? 0;
    const ry = ax[3] ?? 0;
    const left = applyRadialDeadzone(lx, ly, this.deadzone);
    const right = applyRadialDeadzone(rx, ry, this.deadzone);
    this.leftX = left.x;
    this.leftY = left.y;
    this.rightX = right.x;
    this.rightY = right.y;
  }

  isConnected(): boolean {
    return this.connected;
  }

  getGamepadId(): string | null {
    return this.gamepadId;
  }

  /** Stick izquierdo: movimiento WASD analógico. Y negativa = arriba/adelante. */
  getLeftStick(): { x: number; y: number } {
    return { x: this.leftX, y: this.leftY };
  }

  /** Stick derecho: rotación de cámara. Y negativa = arriba. */
  getRightStick(): { x: number; y: number } {
    return { x: this.rightX, y: this.rightY };
  }

  /** Flanco de un botón por índice W3C (pulsado este frame y no el anterior). */
  justPressed(index: GamepadButtonIndex): boolean {
    return this.currButtons[index] && !this.prevButtons[index];
  }

  /** Botón por índice W3C mantenida. */
  held(index: GamepadButtonIndex): boolean {
    return this.currButtons[index];
  }

  /** Flanco de la acción configurada (attack/dash/jump/skill/cycleSlot/pause). */
  justPressedAction(action: GamepadAction): boolean {
    return this.justPressed(this.bindings[action]);
  }

  /** Acción configurada mantenida (para disparo continuo / drain de Edén). */
  heldAction(action: GamepadAction): boolean {
    return this.held(this.bindings[action]);
  }

  /**
   * Primer botón físico con flanco en este frame (cualquier índice 0..17).
   * Lo usa el menú de Controles para reasignar una acción pulsando el botón.
   */
  getAnyJustPressed(): GamepadButtonIndex | null {
    for (let i = 0; i < MAX_STANDARD_BUTTONS; i++) {
      if (this.currButtons[i] && !this.prevButtons[i]) return i as GamepadButtonIndex;
    }
    return null;
  }
}
