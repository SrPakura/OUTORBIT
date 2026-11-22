// ============================================================================
// OUTORBIT — NYX: poses de combate y deslizamiento para `nyx_rigged.glb`.
//
// Compañero de `nyxAnimator.ts`: mismas convenciones de esqueleto y mismos
// helpers de escritura, empaquetados en la interfaz `PoseWriter` (los métodos
// privados del animador son estructuralmente idénticos: integrar un estado
// nuevo es exponerlos y delegar en estas funciones).
//
// Convención (bind pose = T-Pose, +Z frente, +Y arriba, +X brazo izquierdo):
//   brazos      : uz<0 baja el brazo (-1.1 = costado); ux<0 lo lleva al frente;
//                 uy<0 lo abre/gira hacia +Z; codo fy<0 dobla el antebrazo al frente
//   clavículas  : z>0 encoge el hombro hacia arriba; y<0 lo proyecta al frente
//   piernas     : tx<0 muslo adelante (+Z), tx>0 atrás (-Z); tz>0 abre la pierna;
//                 rodilla sx>=0 SIEMPRE (sx>0 dobla el gemelo hacia atrás)
//   tobillos    : fx<0 extiende la puntera (flexión plantar, bota-lanza);
//                 fx>0 encoge el pie hacia la espinilla (talón al impacto);
//                 tx (opcional) añade el látigo de la puntera
//   torso/cabeza: x>0 inclina al frente (+Z), x<0 arquea atrás (-Z); y twist;
//                 z lateral (z<0 inclina hacia +X / izquierda, z>0 hacia -X)
// Los valores del lado R se escriben en convención L y los helpers espejan.
//
// Todas las funciones son puras y sin estado: solo leen sus parámetros y
// escriben en `w`. Cero allocations (sin literales de objeto/array, sin
// closures): seguras para llamar cada frame.
// ============================================================================

// ----------------------------------------------------------------------------
// PoseWriter: espejo exacto de los helpers de escritura de `nyxAnimator.ts`.
// ----------------------------------------------------------------------------
export interface PoseWriter {
  /** Rotación Euler (x, y, z) del hueso `boneIdx` (ver índices abajo). */
  p(boneIdx: number, x: number, y: number, z: number): void;
  /** Offset de posición de la cadera respecto a la pose base del rig. */
  pos(x: number, y: number, z: number): void;
  /** Brazo izquierdo (u = upperArm, f = forearm), en convención L. */
  armL(ux: number, uy: number, uz: number, fx: number, fy: number, fz: number): void;
  /** Brazo derecho: valores en convención L; el helper espeja (y, z). */
  armR(ux: number, uy: number, uz: number, fx: number, fy: number, fz: number): void;
  /** Pierna izquierda (t = thigh, s = shin). Rodilla sx>=0. */
  legL(tx: number, ty: number, tz: number, sx: number): void;
  /** Pierna derecha: valores en convención L; el helper espeja (y, z). */
  legR(tx: number, ty: number, tz: number, sx: number): void;
  /** Tobillo + puntera izquierdos. fx<0 extiende la bota (plantar). */
  footL(fx: number, fy: number, fz: number, tx?: number): void;
  /** Tobillo + puntera derechos: valores en convención L; espeja (y, z). */
  footR(fx: number, fy: number, fz: number, tx?: number): void;
  /** Clavícula izquierda: z>0 encoge el hombro, y<0 lo proyecta al frente. */
  clavL(x: number, y: number, z: number): void;
  /** Clavícula derecha: valores en convención L; el helper espeja (y, z). */
  clavR(x: number, y: number, z: number): void;
}

// --- Índices de hueso (orden fijo del rig; ver nyxAnimator.ts) ----------------
// HIPS=0 SPINE=1 CHEST=2 NECK=3 HEAD=4
// UA_L=5 FA_L=6 HAND_L=7 UA_R=8 FA_R=9 HAND_R=10 TH_L=11 SH_L=12 TH_R=13 SH_R=14
const HIPS = 0, SPINE = 1, CHEST = 2, NECK = 3, HEAD = 4;
const HAND_L = 7, HAND_R = 10;

/** Duración (s) de `poseSpiralDrillKick` (finisher de un solo disparo). */
export const SPIRAL_DRILL_KICK_DURATION = 1.25;
/** Duración (s) de `poseCounterParry` (rechazo de un solo disparo). */
export const COUNTER_PARRY_DURATION = 0.75;

// --- Helpers numéricos puros (los tres primeros, idénticos a nyxAnimator) ----
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
/** Envuelve un ángulo a su equivalente en (-PI, PI] (misma convención que el
 *  wrap de hips.x en `NyxAnimator.update`). */
function wrapPi(a: number): number {
  let r = a;
  while (r > Math.PI) r -= 2 * Math.PI;
  while (r <= -Math.PI) r += 2 * Math.PI;
  return r;
}
/** Cadena de 4 poses: reposo →(k1)→ a →(k2)→ b →(k3)→ c. */
function seq4(rest: number, a: number, b: number, c: number,
  k1: number, k2: number, k3: number): number {
  return mix(mix(mix(rest, a, k1), b, k2), c, k3);
}
/** Cadena de 5 poses: reposo →(k1)→ a →(k2)→ b →(k3)→ c →(k4)→ d. */
function seq5(rest: number, a: number, b: number, c: number, d: number,
  k1: number, k2: number, k3: number, k4: number): number {
  return mix(seq4(rest, a, b, c, k1, k2, k3), d, k4);
}

// ============================================================================
// poseGravitySlide — derrape gravitatorio a toda pastilla
// ============================================================================
// Estado sostenido (sin `t`; la vida la pone `g`). Silueta de patinadora de
// velocidad sobre suelo o pared: cadera muy baja, pierna derecha estirada al
// frente deslizando sobre la superficie, pierna izquierda muy flexionada atrás
// como contrapeso, mano izquierda casi rozando el suelo (baja más al apoyar el
// interior de la curva) y brazo derecho abierto en equilibrio.
//
// `turnRate` (rad/s, + = giro a la izquierda) inclina el torso hacia el
// interior de la curva y reparte la espiral del cuerpo: cadera ligeramente
// cruzada hacia fuera, pecho apuntando a la trazada y cabeza buscando la
// salida del giro. `speed01` hunde la sentadilla, estira la pierna guía y
// añade micro-baches de la superficie.
export function poseGravitySlide(w: PoseWriter, g: number, speed01: number, turnRate: number): void {
  const sp = clamp(speed01, 0, 1);
  const lean = clamp(-turnRate * 0.35, -0.55, 0.55); // <0 = interior de un giro a la izquierda
  const look = clamp(turnRate * 0.22, -0.5, 0.5);
  const twist = clamp(turnRate * 0.07, -0.16, 0.16);
  // Vida ambiental: baches de la superficie, deriva lenta y aleteo del brazo guía
  const bump = Math.sin(g * 11.3) * 0.016 * sp;
  const bump2 = Math.sin(g * 7.1 + 1.7) * 0.012 * sp;
  const drift = Math.sin(g * 1.6) * 0.03;
  const flutter = Math.sin(g * 6.2 + 0.6) * 0.05 * sp;

  // Cadera muy baja, ligeramente adelantada; más profunda a toda pastilla
  w.pos(drift * 0.4 + lean * 0.06, -0.26 - 0.15 * sp + bump, 0.03 + 0.05 * sp);

  // Torso: inclinación al interior de la curva + espiral cadera → cabeza
  w.p(HIPS, 0.1 + 0.1 * sp, -clamp(turnRate * 0.05, -0.12, 0.12), lean);
  w.p(SPINE, 0.14 + 0.04 * sp, twist, lean * 0.5);
  w.p(CHEST, 0.1, clamp(turnRate * 0.12, -0.28, 0.28), lean * 0.35);
  w.p(NECK, -0.06, 0, -lean * 0.2);
  w.p(HEAD, -0.14, look, -lean * 0.55); // mirada por el interior de la curva

  // Pierna derecha estirada al frente patinando; izquierda muy flexionada atrás
  w.legR(-(0.42 + 0.28 * sp) + bump2, 0, 0.06, 0.16 + 0.1 * sp);
  w.legL(0.42 + 0.16 * sp, 0.04, 0.12 + 0.05 * sp, 1.55 + 0.45 * sp);

  // Mano izquierda rozando el suelo, dedos arrastrando (contrapposto con la
  // pierna guía); brazo derecho abierto en equilibrio, vivo con el viento
  w.armL(0.3 + 0.1 * sp, 0.22, -1.3 + lean * 0.15 + bump * 0.5, 0, -0.14, -0.06);
  w.p(HAND_L, -0.3, 0, 0.15);
  w.armR(-0.12 + flutter * 0.3, -0.38 + flutter, 0.18 + drift, 0, -0.28, -0.1);
  w.p(HAND_R, -0.35, 0, 0);

  // Botas de patinadora: la guía (derecha) desliza con la puntera extendida,
  // la izquierda apunta atrás flexionada como contrapeso elegante
  w.footR(-(0.32 + 0.18 * sp), 0, 0.04, -(0.18 + 0.12 * sp));
  w.footL(-(0.5 + 0.12 * sp), 0.03, 0.05, -0.32);

  // Hombros: el izquierdo cae hacia el suelo con la mano que arrastra,
  // el derecho abre el equilibrio hacia el interior de la curva
  w.clavL(0.05, 0.08, -0.1 + lean * 0.15);
  w.clavR(0.05, -0.06, 0.05 - lean * 0.1);
}

// ============================================================================
// poseSpiralDrillKick — finisher aéreo: Patada Taladro (1.25 s)
// ============================================================================
// Fase 1 (0..0.16) compresión en el aire: se recoge en bola (rodillas al
//   pecho, codos dentro) con torsión anticipada de -0.35 rad contra el giro.
// Fase 2 (0.16..1.02) barrena: el cuerpo se estira en horizontal como una
//   lanza (boca arriba, pies al frente) y rota sin tirones sobre su eje
//   longitudinal — 2 vueltas exactas en `hips.y` (eje largo del cuerpo al
//   combinarse con el pitch `hips.x`) — con la pierna derecha completamente
//   extendida como punta del taladro, la izquierda encogida y los brazos
//   pegados al cuerpo en flecha aerodinámica, manos en punta.
// Fase 3 (1.02..1.25) apertura: la barrena cierra en 0 exacto (2 vueltas
//   completas ⇒ sin remanente de giro) y el cuerpo se despliega curvando
//   hacia arriba, listo para fundirse con la flotación en 0G.
//
// OJO integración: `hips.y` se escribe normalizado a (-PI, PI]; el consumidor
// debe envolver el valor ACTUAL de hips.y al equivalente más cercano del
// objetivo (como `NyxAnimator` hace con hips.x en `kick_flip`) para que el
// lerp exponencial persiga la barrena por el camino corto y no la deshaga.
export function poseSpiralDrillKick(w: PoseWriter, t: number, g: number): void {
  const coil = smooth(0, 0.09, t) * (1 - smooth(0.1, 0.18, t)); // compresión
  const launch = smooth(0.12, 0.26, t);                         // bola → lanza
  const drill = smooth(0.16, 0.34, t) * (1 - smooth(1.02, 1.25, t)); // intensidad barrena
  const settle = smooth(1.02, 1.25, t);                         // apertura final
  const vib = Math.sin(g * 29) * 0.03 * drill;  // precesión de la barrena
  const vib2 = Math.cos(g * 23) * 0.02 * drill;

  // Barrena: anticipación -0.35 → 2 vueltas exactas (4π) con rampa suave
  const spin = wrapPi(-0.35 * coil + 4 * Math.PI * smooth(0.15, 1.06, t));

  // Cuerpo: bola encogida → lanza horizontal arqueada → curvando hacia arriba
  w.pos(0,
    seq4(0, 0.05, 0.02, 0.03, coil, launch, settle),
    seq4(0, -0.03, 0.16, 0.06, coil, launch, settle));
  w.p(HIPS, seq4(0, 0.32, -1.46, -0.85, coil, launch, settle), spin, vib);
  w.p(SPINE, seq4(0, 0.22, -0.1, -0.05, coil, launch, settle), 0, vib2 * 0.5);
  w.p(CHEST, seq4(0, 0.16, -0.07, -0.04, coil, launch, settle),
    seq4(0, 0.12, -0.1, -0.02, coil, launch, settle), 0);
  w.p(NECK, seq4(0, 0.1, -0.06, -0.03, coil, launch, settle), 0, 0);
  w.p(HEAD, seq4(0, 0.34, 0.55, 0.1, coil, launch, settle), 0, 0); // mira la punta

  // Brazos: pegados al cuerpo hacia atrás (flecha aerodinámica), ligeramente
  // asimétricos; en la apertura florecen hacia fuera
  const aux = seq4(0.04, 0.1, -0.04, -0.02, coil, launch, settle);
  const auy = seq4(0, -0.35, 0.1, -0.1, coil, launch, settle);
  const auz = seq4(-1.1, -0.9, 1.12, 0.55, coil, launch, settle);
  const afy = seq4(-0.12, -1.25, -0.07, -0.3, coil, launch, settle);
  const ahx = seq4(-0.1, -0.2, -0.55, -0.3, coil, launch, settle);
  w.armL(aux, auy, auz + 0.02, 0, afy, 0.04);
  w.armR(aux, auy, auz - 0.06, 0, afy, 0.04);
  w.p(HAND_L, ahx, 0, 0);
  w.p(HAND_R, ahx, 0, 0);

  // Pierna derecha: punta del taladro, extendida sobre el eje del cuerpo
  w.legR(seq4(0.02, -1.35, -0.03, -0.18, coil, launch, settle), 0,
    seq4(0.03, 0.06, -0.06, -0.04, coil, launch, settle),
    seq4(0.04, 2, 0.05, 0.2, coil, launch, settle)
      + (0.02 + 0.015 * Math.sin(g * 36)) * drill);
  // Pierna izquierda encogida: rodilla al pecho, talón atrás, abierta para
  // no cruzar la línea del taladro
  w.legL(seq4(0, -1.2, -1.02, -0.72, coil, launch, settle), 0.05,
    seq4(0.03, 0.1, 0.14, 0.12, coil, launch, settle),
    seq4(0.04, 1.95, 1.85, 1.35, coil, launch, settle));
}

// ============================================================================
// poseCounterParry — rechazo / parry gravitatorio (0.75 s)
// ============================================================================
// 0..0.09   anticipación: peso atrás, cintura enroscada a la derecha y ambas
//           manos recogidas en la cadera derecha (resorte comprimido).
// 0.09..0.3 rechazo: latigazo brusco de cintura a la izquierda + barrido amplio
//           de ambos brazos — suben abriéndose en arco y convergen con las
//           palmas planas al frente, proyectando la onda gravitatoria —
//           mientras la pierna izquierda planta un paso firme adelante y la
//           derecha ancla el impulso.
// 0.3..0.75 recuperación elegante: el giro se suelta, el peso vuelve al centro
//           y los brazos flotan a una guardia asimétrica.
export function poseCounterParry(w: PoseWriter, t: number): void {
  const wind = smooth(0, 0.07, t) * (1 - smooth(0.07, 0.14, t)); // enrosco
  const sweep = smooth(0.09, 0.19, t); // recogida → abiertos en arco
  const push = smooth(0.16, 0.27, t);  // abiertos → palmas al frente
  const snap = smooth(0.09, 0.18, t);  // latigazo de cintura (se mantiene)
  const rec = smooth(0.34, 0.72, t);   // recuperación elegante

  // Cintura: enrosca a la derecha → latigazo a la izquierda → suelta al centro
  w.pos(0,
    -0.05 * wind + mix(-0.13 * snap, -0.015, rec),
    -0.04 * wind + mix(0.1 * snap, 0.02, rec));
  w.p(HIPS, 0.06 * wind + mix(0.1 * snap, 0.03, rec),
    -0.34 * wind + mix(0.62 * snap, 0.06, rec), 0);
  w.p(SPINE, 0.14 * wind + mix(0.1 * snap, 0.03, rec), 0, 0);
  w.p(CHEST, 0.1 * wind + mix(0.16 * snap, 0.05, rec),
    -0.2 * wind + mix(0.5 * snap, 0.04, rec), 0);
  w.p(NECK, mix(-0.05 * snap, -0.02, rec), 0, 0);
  // La mirada SIEMPRE al objetivo: contra-gira el enrosco y el latigazo
  w.p(HEAD, mix(-0.06 * snap, -0.04, rec),
    0.22 * wind + mix(-0.34 * snap, 0.08, rec), 0);

  // Barrido amplio: reposo → cadera derecha → abiertos → palmas al frente → guardia
  w.armL(
    seq5(0.05, 0.1, -0.1, -0.12, -0.06, wind, sweep, push, rec),
    seq5(-0.05, -1.6, -0.28, -1.28, -0.5, wind, sweep, push, rec),
    seq5(-1.08, -1.05, 0.16, -0.3, -0.85, wind, sweep, push, rec),
    0,
    seq5(-0.25, -1.05, -0.16, -0.2, -0.3, wind, sweep, push, rec),
    seq5(-0.08, -0.12, -0.05, -0.06, -0.08, wind, sweep, push, rec));
  w.armR(
    seq5(0.05, 0.06, -0.1, -0.12, 0.08, wind, sweep, push, rec),
    seq5(-0.05, 0.45, -0.28, -1.28, 0.28, wind, sweep, push, rec),
    seq5(-1.08, -1.15, 0.16, -0.3, -0.95, wind, sweep, push, rec),
    0,
    seq5(-0.25, -0.7, -0.16, -0.2, -0.22, wind, sweep, push, rec),
    seq5(-0.08, -0.1, -0.05, -0.06, -0.08, wind, sweep, push, rec));
  // Palmas planas al frente en el impacto de la onda
  const hx = seq5(-0.1, -0.2, -0.25, -0.55, -0.25, wind, sweep, push, rec);
  w.p(HAND_L, hx, 0, 0);
  w.p(HAND_R, hx, 0, 0);

  // Paso firme: izquierda planta adelante, derecha ancla → guardia
  w.legL(seq4(-0.06, -0.18, -0.52, -0.12, wind, snap, rec), 0,
    seq4(0.03, 0.05, 0.05, 0.04, wind, snap, rec),
    seq4(0.06, 0.3, 0.32, 0.14, wind, snap, rec));
  w.legR(seq4(0.03, 0.12, 0.3, 0.06, wind, snap, rec), 0,
    seq4(0.03, 0.07, 0.07, 0.04, wind, snap, rec),
    seq4(0.06, 0.35, 0.55, 0.12, wind, snap, rec));
}
