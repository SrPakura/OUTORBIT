// ============================================================================
// OUTORBIT — NYX: poses de desplazamiento 0G, rebote y victoria (`nyx_rigged.glb`).
// ============================================================================

import type { PoseWriter } from './nyxAnimsCombat';

const HIPS = 0, SPINE = 1, CHEST = 2, NECK = 3, HEAD = 4;
const HAND_L = 7, HAND_R = 10;

export const WALL_SHIFT_FLIP_DURATION = 0.75;
export const DOME_BOUNCE_DURATION = 0.85;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
function mix(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}
function smooth(a: number, b: number, v: number): number {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
function pulse(t: number, a: number, b: number, c: number): number {
  return smooth(a, b, t) * (1 - smooth(b, c, t));
}
function wrapAngle(rad: number): number {
  let a = rad;
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a <= -Math.PI) a += 2 * Math.PI;
  return a;
}

/**
 * 1. `wall_shift_flip` (0.75 s):
 * Giro acrobático elegante en 0G al reorientar la gravedad hacia una pared
 * (90°) o techo (180°). Arqueo fluido de espalda, una rodilla recogida y
 * brazos abiertos guiando el giro de 180°/360° hasta encarar la nueva caída.
 */
export function poseWallShiftFlip(w: PoseWriter, t: number): void {
  const p = clamp(t / WALL_SHIFT_FLIP_DURATION, 0, 1);
  const arc = Math.sin(p * Math.PI);
  const spin = wrapAngle(p * Math.PI * 2);

  w.pos(0, 0.14 * arc, -0.06 * arc);
  w.p(HIPS, 0.25 * arc, spin, 0.28 * arc);
  w.p(SPINE, -0.22 * arc, 0.12 * arc, 0);
  w.p(CHEST, -0.26 * arc, -0.18 * arc, 0);
  w.p(NECK, -0.12 * arc, 0, 0);
  w.p(HEAD, -0.18 * arc, -0.22 * arc, 0.08 * arc);

  // Brazos abiertos guiando la rotación ingrávida
  w.armL(-0.18 * arc, -0.55 * arc, mix(-0.8, -0.25, arc), 0, -0.35 * arc, -0.1);
  w.armR(0.22 * arc, 0.45 * arc, mix(-0.65, -0.15, arc), 0, -0.45 * arc, -0.1);

  // Una rodilla recogida y la opuesta estilizada atrás
  w.legL(-0.95 * arc - 0.15, 0, 0.08, 1.55 * arc + 0.12);
  w.legR(0.35 * arc, 0, 0.10, 0.35 * arc + 0.1);
}

/**
 * 2. `dome_bounce` (0.85 s):
 * Impacto y rebote elástico al tocar el límite de la Esfera de Cristal de 50 m.
 * Breve compresión dorsal contra la barrera seguida de impulso hacia el centro
 * con rotación lateral suave y brazos equilibrando.
 */
export function poseDomeBounce(w: PoseWriter, t: number): void {
  const hit = pulse(t, 0.0, 0.14, 0.36);
  const reb = smooth(0.20, 0.45, t) * (1 - smooth(0.62, 0.85, t));

  w.pos(0, 0.12 * reb - 0.06 * hit, -0.16 * hit + 0.14 * reb);
  w.p(HIPS, -0.45 * hit + 0.22 * reb, 0.35 * reb, -0.35 * hit + 0.32 * reb);
  w.p(SPINE, -0.28 * hit + 0.10 * reb, 0, 0);
  w.p(CHEST, -0.32 * hit + 0.12 * reb, -0.25 * reb, 0);
  w.p(HEAD, 0.15 * hit - 0.12 * reb, 0.15 * hit, 0.12 * hit);

  // Brazos amortiguando atrás al tocar la cúpula -> abiertos al rebotar
  w.armL(0.45 * hit - 0.15 * reb, 0.45 * hit - 0.25 * reb, mix(-1.05, -0.35, Math.max(hit, reb)),
    0, -0.55 * hit - 0.25 * reb, -0.08);
  w.armR(0.45 * hit - 0.10 * reb, 0.35 * hit - 0.20 * reb, mix(-1.05, -0.45, Math.max(hit, reb)),
    0, -0.50 * hit - 0.20 * reb, -0.08);

  w.legL(-0.65 * hit - 0.35 * reb, 0, 0.09, 1.25 * hit + 0.75 * reb);
  w.legR(-0.35 * hit + 0.15 * reb, 0, 0.09, 0.85 * hit + 0.25 * reb);
}

/**
 * 3. `victory_float` (sostenida):
 * Flotación triunfal ingrávida al limpiar una sala o vencer a un Dragón-Serpiente
 * antes de abrir el Fragmento del Edén. Giro lento continuo, piernas cruzadas
 * con soltura, una mano a la cadera/pecho y la otra extendida saludando al vacío.
 */
export function poseVictoryFloat(w: PoseWriter, g: number): void {
  const bob = Math.sin(g * 1.45) * 0.06;
  const sway = Math.sin(g * 0.85);
  const spin = wrapAngle(g * 0.45);

  w.pos(0, 0.10 + bob, 0);
  w.p(HIPS, -0.08 + bob * 0.4, spin, 0.06 * sway);
  w.p(SPINE, -0.06, -0.08, -0.04 * sway);
  w.p(CHEST, -0.08 + Math.sin(g * 1.9) * 0.02, -0.10, 0);
  w.p(NECK, -0.04, 0, 0);
  w.p(HEAD, -0.06, 0.12 + sway * 0.05, 0.06);

  // Brazo izquierdo relajado cerca de la cintura; derecho elevado con elegancia
  w.armL(0.08, 0.35, -0.85, 0, -1.15, -0.12);
  w.p(HAND_L, 0, 0, 0.15);
  w.armR(-0.18 + Math.sin(g * 1.2) * 0.04, -0.35, -0.32 + Math.sin(g * 1.5) * 0.05,
    0, -0.35, -0.10);
  w.p(HAND_R, -0.25, 0, 0);

  // Piernas gráciles en 0G (una doblada alta cruzando ligeramente, la otra suelta)
  w.legL(-0.55 + Math.sin(g * 1.3) * 0.04, -0.12, -0.04, 1.05);
  w.legR(0.18 + Math.sin(g * 1.3 + 1.0) * 0.04, 0.08, 0.06, 0.24);
}
