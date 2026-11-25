import { useEffect, useRef, useState } from 'react';
import { readConnectedGamepad } from '@/game/input/GamepadInput';

// ============================================================================
// Navegación de menús con mando (Gamepad API estándar W3C).
//
// Primitiva `useGamepadMenuNav`: poll del primer mando conectado a 60 FPS con
// detección de flancos. D-Pad (12..15) y stick izquierdo mueven; Cruz (A)
// confirma; Círculo (B) vuelve. Las direcciones se repiten mientras se
// mantienen (retardo inicial 320 ms, luego cada 130 ms), como un menú de
// consola.
//
// Helper `useGamepadListNav`: mueve un índice por una lista (1 columna) o una
// rejilla de 1 fila (N columnas) y confirma con el índice activo.
// ============================================================================

export type GamepadMenuDirection = 'up' | 'down' | 'left' | 'right';

export interface GamepadMenuNavOptions {
  /** El poll se detiene por completo cuando es false (menú cerrado). */
  enabled?: boolean;
  onDirection: (dir: GamepadMenuDirection) => void;
  onConfirm?: () => void;
  onBack?: () => void;
}

const STICK_THRESHOLD = 0.55;
const REPEAT_DELAY_MS = 320;
const REPEAT_RATE_MS = 130;
const DIRECTIONS: GamepadMenuDirection[] = ['up', 'down', 'left', 'right'];

export function useGamepadMenuNav({
  enabled = true,
  onDirection,
  onConfirm,
  onBack,
}: GamepadMenuNavOptions): void {
  const cb = useRef({ onDirection, onConfirm, onBack });
  cb.current = { onDirection, onConfirm, onBack };

  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    const held: Record<GamepadMenuDirection, boolean> = { up: false, down: false, left: false, right: false };
    const nextRepeat: Record<GamepadMenuDirection, number> = { up: 0, down: 0, left: 0, right: 0 };
    const initPad = readConnectedGamepad();
    let prevConfirm = !!initPad?.buttons[0]?.pressed;
    let prevBack = !!initPad?.buttons[1]?.pressed;

    const poll = (): void => {
      raf = requestAnimationFrame(poll);
      const pad = readConnectedGamepad();
      if (!pad) {
        for (const dir of DIRECTIONS) held[dir] = false;
        prevConfirm = false;
        prevBack = false;
        return;
      }

      const ax = pad.axes[0] ?? 0;
      const ay = pad.axes[1] ?? 0;
      const dirs: Record<GamepadMenuDirection, boolean> = {
        up: !!pad.buttons[12]?.pressed || ay < -STICK_THRESHOLD,
        down: !!pad.buttons[13]?.pressed || ay > STICK_THRESHOLD,
        left: !!pad.buttons[14]?.pressed || ax < -STICK_THRESHOLD,
        right: !!pad.buttons[15]?.pressed || ax > STICK_THRESHOLD,
      };

      const now = performance.now();
      for (const dir of DIRECTIONS) {
        if (!dirs[dir]) {
          held[dir] = false;
          continue;
        }
        if (!held[dir]) {
          held[dir] = true;
          nextRepeat[dir] = now + REPEAT_DELAY_MS;
          cb.current.onDirection(dir);
        } else if (now >= nextRepeat[dir]) {
          nextRepeat[dir] = now + REPEAT_RATE_MS;
          cb.current.onDirection(dir);
        }
      }

      const confirm = !!pad.buttons[0]?.pressed;
      if (confirm && !prevConfirm) cb.current.onConfirm?.();
      prevConfirm = confirm;

      const back = !!pad.buttons[1]?.pressed;
      if (back && !prevBack) cb.current.onBack?.();
      prevBack = back;
    };

    raf = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(raf);
  }, [enabled]);
}

export interface GamepadListNavOptions {
  enabled?: boolean;
  /** 1 = lista vertical (arriba/abajo); N > 1 = rejilla de 1 fila (izq/der). */
  columns?: number;
  initialIndex?: number;
  onConfirm: (index: number) => void;
  onBack?: () => void;
}

/**
 * Navegación de lista con mando: devuelve el índice activo y su setter.
 * Cruz (A) confirma con el índice actual; Círculo (B) dispara onBack.
 */
export function useGamepadListNav(
  count: number,
  options: GamepadListNavOptions,
): [number, (index: number) => void] {
  const { enabled = true, columns = 1, initialIndex = 0, onConfirm, onBack } = options;
  const [index, setIndex] = useState(() => Math.max(0, Math.min(initialIndex, count - 1)));
  const indexRef = useRef(index);
  indexRef.current = index;
  const countRef = useRef(count);
  countRef.current = count;
  const columnsRef = useRef(columns);
  columnsRef.current = columns;

  useGamepadMenuNav({
    enabled,
    onDirection: (dir) => {
      const n = countRef.current;
      if (n <= 0) return;
      setIndex((i) => {
        if (columnsRef.current === 1) {
          if (dir === 'up') return (i - 1 + n) % n;
          if (dir === 'down') return (i + 1) % n;
          return i;
        }
        if (dir === 'left') return (i - 1 + n) % n;
        if (dir === 'right') return (i + 1) % n;
        return i;
      });
    },
    onConfirm: () => onConfirm(indexRef.current),
    onBack: () => onBack?.(),
  });

  const setClamped = (i: number): void => {
    setIndex(Math.max(0, Math.min(i, Math.max(0, count - 1))));
  };
  return [index, setClamped];
}
