// ============================================================================
// OUTORBIT — NYX: poses de desplazamiento 0G, caída, rebote y victoria
// (`nyx_rigged.glb`, 27 huesos).
//
// Compañero de `nyxAnimsCombat.ts`: misma `PoseWriter` y mismas convenciones
// de ejes (bind pose = T-Pose, +Z frente, +Y arriba, +X izquierda). Los valores
// del lado R se escriben en convención L y los helpers espejan (y, z).
//
// Todas las funciones son puras y sin estado: solo leen sus parámetros y
// escriben en `w`. Cero allocations (sin literales de objeto/array, sin
// closures): seguras para llamar cada frame.
// ============================================================================

import type { PoseWriter } from './nyxAnimsCombat';

const HIPS = 0, SPINE = 1, CHEST = 2, NECK = 3, HEAD = 4;
const HAND_L = 7, HAND_R = 10;

/** Duración (s) de `poseWallShiftFlip` (giro al reorientar la gravedad). */
export const WALL_SHIFT_FLIP_DURATION = 0.75;
/** Duración (s) de `poseDomeBounce` (rebote contra la barrera). */
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

// ============================================================================
// poseZeroGFloat — flotación ingrávida de reposo (sostenida)
// ============================================================================
// Estado base en 0G: el cuerpo cuelga relajado con una respiración lenta que
// recorre pecho, hombros y cabeza; las piernas cuelgan asimétricas (una algo
// recogida, la otra más estirada) con los empeines ligeramente extendidos y
// los brazos abiertos del cuerpo equilibrando, derivando con corrientes de
// aire lentas. `g` (s) da la vida continua.
export function poseZeroGFloat(w: PoseWriter, g: number): void {
  const breath = Math.sin(g * 1.35);        // ciclo respiratorio principal
  const breath2 = Math.sin(g * 0.9 + 1.2);  // deriva secundaria (retardada)
  const drift = Math.sin(g * 0.6) * 0.04;   // balanceo lateral muy lento
  const leg = Math.sin(g * 1.1 + 0.8);      // vida independiente de las piernas

  // Cadera flotando alta y centrada, meciéndose con la respiración
  w.pos(drift, 0.08 + breath * 0.025, breath2 * 0.02);
  w.p(HIPS, -0.05 + breath * 0.02, breath2 * 0.06, drift * 0.8);
  w.p(SPINE, -0.03 + breath * 0.035, -0.04, -0.02 * breath2);
  w.p(CHEST, 0.02 + breath * 0.05, -0.06, 0.02 * breath2);
  w.p(NECK, -0.03 - breath * 0.02, 0, 0);
  w.p(HEAD, -0.05 + breath2 * 0.03, 0.08 + breath2 * 0.06, 0.04 * breath2);

  // Hombros sueltos: caen al espirar y se elevan apenas al inhalar
  w.clavL(0.02 * breath, 0.03, -0.06 + 0.03 * breath);
  w.clavR(0.02 * breath, -0.03, -0.06 + 0.03 * breath);

  // Brazos equilibrando: abiertos del cuerpo, derivando con el aire
  w.armL(-0.1 + breath2 * 0.05, -0.18 + breath * 0.04, -0.72 + breath * 0.06,
    0, -0.28 - breath * 0.05, -0.06);
  w.armR(-0.06 - breath2 * 0.05, -0.14 - breath * 0.04, -0.66 - breath * 0.06,
    0, -0.24 + breath * 0.05, -0.06);
  w.p(HAND_L, -0.08, 0, 0.06);
  w.p(HAND_R, -0.06, 0, -0.06);

  // Piernas asimétricas y sueltas: la izquierda algo recogida, la derecha más
  // estirada; ambos empeines ligeramente extendidos (puntera caída, sin tensión)
  w.legL(-0.22 + leg * 0.05, 0.03, 0.05, 0.42 + leg * 0.06);
  w.legR(0.14 - leg * 0.04, -0.02, 0.07, 0.16 - leg * 0.04);
  w.footL(-0.24 + leg * 0.04, 0.02, 0.03, -0.1);
  w.footR(-0.34 - leg * 0.04, -0.02, -0.03, -0.16);
}

// ============================================================================
// poseGravityFall — caída libre al vacío (sostenida)
// ============================================================================
// El cuerpo se entrega a la caída: espalda arqueada con el pecho abierto hacia
// arriba, brazos arrastrados atrás a los costados aleteando con la corriente,
// clavículas elevadas y proyectadas atrás, y piernas sueltas colgando con los
// tobillos y punteras estirados al viento. La intensidad crece con la
// velocidad vertical `vVel` (m/s) cuando `hasVVel` es cierto; si no, queda a
// media intensidad.
export function poseGravityFall(w: PoseWriter, g: number, vVel: number, hasVVel: boolean): void {
  // Intensidad 0..1: proporcional a |vVel| (≈15 m/s = plena); media si se desconoce
  const spd = hasVVel ? clamp(Math.abs(vVel) / 15, 0.18, 1) : 0.55;
  const flutter = Math.sin(g * 5.3) * 0.09 * spd;   // aleteo de la corriente
  const flutter2 = Math.sin(g * 3.7 + 1.4) * 0.07 * spd;
  const sway = Math.sin(g * 1.7) * 0.05 * spd;      // deriva lateral del cuerpo

  w.pos(sway * 0.5, 0.04 + flutter2 * 0.3, -0.05 * spd);
  // Espalda arqueada: la cadera empuja al frente y el pecho se abre arriba
  w.p(HIPS, -0.16 * spd, flutter * 0.4, sway);
  w.p(SPINE, -0.2 * spd, -0.05, sway * 0.5);
  w.p(CHEST, -0.26 * spd + flutter2 * 0.3, -0.08, 0);
  w.p(NECK, -0.08 * spd, 0, 0);
  w.p(HEAD, -0.3 * spd + flutter * 0.25, 0.1, sway * 0.6); // mirada al vacío

  // Clavículas elevadas y atrás: el pecho se abre a la caída
  w.clavL(0.04 * spd, 0.1 * spd, 0.12 * spd + flutter * 0.3);
  w.clavR(0.04 * spd, -0.1 * spd, 0.12 * spd - flutter * 0.3);

  // Brazos arrastrados atrás a los costados, aleteando con el aire
  w.armL(0.3 * spd + flutter * 0.5, -0.2, -0.78 + flutter2 * 0.6,
    0, 0.15 + flutter * 0.4, -0.05);
  w.armR(0.26 * spd - flutter * 0.5, -0.16, -0.82 - flutter2 * 0.6,
    0, 0.12 - flutter * 0.4, -0.05);
  w.p(HAND_L, 0.2, 0, 0.08);
  w.p(HAND_R, 0.16, 0, -0.08);

  // Piernas sueltas colgando, asimétricas; tobillos y punteras estirados al viento
  w.legL(0.18 * spd + flutter2 * 0.3, 0.04, 0.06, 0.5 + flutter * 0.5);
  w.legR(0.3 * spd - flutter2 * 0.3, -0.03, 0.08, 0.28 - flutter * 0.5);
  w.footL(-0.5 * spd + flutter * 0.15, 0.03, 0.04, -0.28 * spd);
  w.footR(-0.58 * spd - flutter * 0.15, -0.03, -0.04, -0.34 * spd);
}

// ============================================================================
// poseWallShiftFlip — giro acrobático al reorientar la gravedad (0.75 s)
// ============================================================================
// Giro elegante en 0G al reorientar la gravedad hacia una pared (90°) o techo
// (180°). Arqueo fluido de espalda, una rodilla recogida con el pie flexionado
// (talón hacia la espinilla) y la pierna opuesta estirada con el empeine en
// punta latigueando el giro; clavículas que abren los hombros al entrar en la
// rotación y brazos abiertos guiando los 180°/360° hasta encarar la nueva caída.
export function poseWallShiftFlip(w: PoseWriter, t: number): void {
  const p = clamp(t / WALL_SHIFT_FLIP_DURATION, 0, 1);
  const arc = Math.sin(p * Math.PI);
  const spin = wrapAngle(p * Math.PI * 2);
  const tuck = smooth(0.12, 0.4, p) * (1 - smooth(0.62, 0.9, p)); // rodilla recogida

  w.pos(0, 0.14 * arc, -0.06 * arc);
  w.p(HIPS, 0.25 * arc, spin, 0.28 * arc);
  w.p(SPINE, -0.22 * arc, 0.12 * arc, 0);
  w.p(CHEST, -0.26 * arc, -0.18 * arc, 0);
  w.p(NECK, -0.12 * arc, 0, 0);
  w.p(HEAD, -0.18 * arc, -0.22 * arc, 0.08 * arc);

  // Clavículas: hombros que se abren al entrar en el giro y se recogen al salir
  w.clavL(0.03 * arc, -0.08 * arc, 0.1 * arc);
  w.clavR(0.03 * arc, 0.08 * arc, 0.14 * arc);

  // Brazos abiertos guiando la rotación ingrávida
  w.armL(-0.18 * arc, -0.55 * arc, mix(-0.8, -0.25, arc), 0, -0.35 * arc, -0.1);
  w.armR(0.22 * arc, 0.45 * arc, mix(-0.65, -0.15, arc), 0, -0.45 * arc, -0.1);

  // Rodilla izquierda recogida con el pie flexionado; pierna derecha estirada
  // atrás con el empeine en punta y látigo de puntera
  w.legL(-0.95 * arc - 0.15, 0, 0.08, 1.55 * arc + 0.12);
  w.legR(0.35 * arc, 0, 0.1, 0.35 * arc + 0.1);
  w.footL(0.3 * tuck, 0, 0.04, 0.12 * tuck);
  w.footR(-0.42 * arc - 0.1, 0, -0.05, -0.26 * arc - 0.06);
}

// ============================================================================
// poseDomeBounce — rebote contra la barrera de la cúpula (0.85 s)
// ============================================================================
// Impacto y rebote elástico al tocar el límite de la Esfera de Cristal de 50 m.
// Compresión dorsal contra la barrera (espalda arqueada, rodillas recogidas,
// talones hacia la espinilla y hombros encogidos absorbiendo el golpe) seguida
// de la apertura elástica hacia el centro: el cuerpo se despliega, los hombros
// se abren y los tobillos extienden las punteras con látigo al lanzarse fuera.
export function poseDomeBounce(w: PoseWriter, t: number): void {
  const hit = pulse(t, 0.0, 0.14, 0.36);
  const reb = smooth(0.2, 0.45, t) * (1 - smooth(0.62, 0.85, t));

  w.pos(0, 0.12 * reb - 0.06 * hit, -0.16 * hit + 0.14 * reb);
  w.p(HIPS, -0.45 * hit + 0.22 * reb, 0.35 * reb, -0.35 * hit + 0.32 * reb);
  w.p(SPINE, -0.28 * hit + 0.1 * reb, 0, 0);
  w.p(CHEST, -0.32 * hit + 0.12 * reb, -0.25 * reb, 0);
  w.p(NECK, 0.06 * hit, 0, 0);
  w.p(HEAD, 0.15 * hit - 0.12 * reb, 0.15 * hit, 0.12 * hit);

  // Clavículas: hombros encogidos absorbiendo el impacto, abiertos al rebotar
  w.clavL(0, 0.12 * hit, 0.22 * hit - 0.08 * reb);
  w.clavR(0, -0.12 * hit, 0.22 * hit - 0.08 * reb);

  // Brazos amortiguando atrás al tocar la cúpula -> abiertos al rebotar
  w.armL(0.45 * hit - 0.15 * reb, 0.45 * hit - 0.25 * reb, mix(-1.05, -0.35, Math.max(hit, reb)),
    0, -0.55 * hit - 0.25 * reb, -0.08);
  w.armR(0.45 * hit - 0.1 * reb, 0.35 * hit - 0.2 * reb, mix(-1.05, -0.45, Math.max(hit, reb)),
    0, -0.5 * hit - 0.2 * reb, -0.08);

  // Piernas: recogidas al comprimirse contra la barrera, se despliegan al salir
  w.legL(-0.65 * hit - 0.35 * reb, 0, 0.09, 1.25 * hit + 0.75 * reb);
  w.legR(-0.35 * hit + 0.15 * reb, 0, 0.09, 0.85 * hit + 0.25 * reb);

  // Tobillos: talones al impacto (flexión hacia la espinilla), punteras con
  // látigo al lanzarse de vuelta al centro
  w.footL(0.35 * hit - 0.45 * reb, 0, 0.03, 0.18 * hit - 0.3 * reb);
  w.footR(0.3 * hit - 0.4 * reb, 0, -0.03, 0.15 * hit - 0.26 * reb);
}

// ============================================================================
// poseVictoryFloat — flotación triunfal (sostenida)
// ============================================================================
// Flotación triunfal ingrávida al limpiar una sala o vencer a un Dragón-
// Serpiente antes de abrir el Fragmento del Edén. Giro lento continuo y
// elegante, piernas cruzadas con soltura y empeines estilizados en punta con
// un látigo lento de puntera, hombros sueltos y una mano a la cadera mientras
// la otra se extiende saludando al vacío.
export function poseVictoryFloat(w: PoseWriter, g: number): void {
  const bob = Math.sin(g * 1.45) * 0.06;
  const sway = Math.sin(g * 0.85);
  const spin = wrapAngle(g * 0.45);
  const toe = Math.sin(g * 1.3) * 0.05; // látigo lento de las punteras

  w.pos(0, 0.1 + bob, 0);
  w.p(HIPS, -0.08 + bob * 0.4, spin, 0.06 * sway);
  w.p(SPINE, -0.06, -0.08, -0.04 * sway);
  w.p(CHEST, -0.08 + Math.sin(g * 1.9) * 0.02, -0.1, 0);
  w.p(NECK, -0.04, 0, 0);
  w.p(HEAD, -0.06, 0.12 + sway * 0.05, 0.06);

  // Hombros sueltos, caídos con elegancia; apenas respiran
  w.clavL(0, 0.04, -0.08 + Math.sin(g * 1.9) * 0.015);
  w.clavR(0, -0.04, -0.08 + Math.sin(g * 1.9) * 0.015);

  // Brazo izquierdo relajado cerca de la cintura; derecho elevado saludando
  w.armL(0.08, 0.35, -0.85, 0, -1.15, -0.12);
  w.p(HAND_L, 0, 0, 0.15);
  w.armR(-0.18 + Math.sin(g * 1.2) * 0.04, -0.35, -0.32 + Math.sin(g * 1.5) * 0.05,
    0, -0.35, -0.1);
  w.p(HAND_R, -0.25, 0, 0);

  // Piernas cruzadas con soltura: la izquierda cruza sobre la derecha
  // (tz<0 la cierra en diagonal), ambos empeines estilizados en punta
  w.legL(-0.55 + Math.sin(g * 1.3) * 0.04, -0.12, -0.14, 1.05);
  w.legR(0.18 + Math.sin(g * 1.3 + 1.0) * 0.04, 0.08, 0.06, 0.24);
  w.footL(-0.42 + toe, 0.02, -0.03, -0.22 + toe * 0.5);
  w.footR(-0.3 - toe * 0.6, -0.02, 0.03, -0.14);
}
