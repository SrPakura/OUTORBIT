// ============================================================================
// OUTORBIT — NYX: poses de habilidades (campo de estasis, lanzamiento,
// stagger y absorción de Edén) para `nyx_rigged.glb`.
//
// Compañero de `nyxAnimsCombat.ts` / `nyxAnimsTraversal.ts`: misma interfaz
// `PoseWriter` y mismas convenciones de esqueleto, adaptadas al rig de 27
// huesos (clavículas, tobillos y punteras como huesos propios).
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

import type { PoseWriter } from './nyxAnimsCombat';

// --- Índices de hueso (rig de 27; ver nyxAnimator.ts) ------------------------
const HIPS = 0, SPINE = 1, CHEST = 2, NECK = 3, HEAD = 4;
const HAND_L = 7, HAND_R = 10;
const CLAV_L = 19, CLAV_R = 20;
const FOOT_L = 21, TOE_L = 22, FOOT_R = 23, TOE_R = 24;

/** Duración (s) de `poseStasisThrow` (lanzamiento de un solo disparo). */
export const STASIS_THROW_DURATION = 1.30;
/** Duración (s) de `poseHitStagger` (rebote de choque de un solo disparo). */
export const HIT_STAGGER_DURATION = 0.95;

// --- Helpers numéricos puros (idénticos a nyxAnimsCombat) --------------------
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
/** Sube de a→b y baja de b→c (0 fuera de [a,c]). */
function pulse(t: number, a: number, b: number, c: number): number {
  return smooth(a, b, t) * (1 - smooth(b, c, t));
}

// ============================================================================
// poseStasisCast — campo gravitacional / pozo de estasis (estado sostenido)
// ============================================================================
// Mano derecha proyecta el campo al frente con el hombro (clavícula) adelantado
// y un temblor de energía que sube por brazo → pecho; mano izquierda recogida
// cerca del pecho alimentando el núcleo. Base ancha y estable: tobillos
// anclados al suelo con los dedos de los pies agarrándolo (solo el torso
// vibra, los pies no traicionan el anclaje).
export function poseStasisCast(w: PoseWriter, t: number, g: number): void {
  const a = smooth(0, 0.25, t);                    // entrada a la pose
  const tr = Math.sin(g * 41) * 0.012 * a;         // temblor de energía
  const tr2 = Math.cos(g * 34 + 1.1) * 0.008 * a;  // segundo armónico del temblor
  const pu = 0.5 + 0.5 * Math.sin(g * 6);          // pulso del campo

  w.pos(0, -0.07 * a, 0);                          // se asienta en la base
  // Torso retorcido hacia el lanzamiento: cadera gira, pecho contra-gira
  // abriéndose al frente y el cuello alinea la mirada con la mano
  w.p(HIPS, 0.08 * a, 0.25 * a, 0);
  w.p(SPINE, 0.04 * a, 0.06 * a, 0);
  w.p(CHEST, 0.04 * a, -0.25 * a, tr2 * 0.5);
  w.p(NECK, -0.02 * a, -0.08 * a, 0);
  w.p(HEAD, -0.05 * a, -0.1 * a, 0);

  // Brazo R extendido al frente proyectando el campo (palma viva con el pulso);
  // L recogida cerca del pecho, codo doblado, alimentando el núcleo
  w.armR(mix(0.04, -0.12, a), mix(0, -1.4, a),
    mix(-1.1, -0.08, a) + pu * 0.04 * a, 0, -0.06 * a, tr * 4);
  w.p(HAND_R, -1.05 * a + pu * 0.12 * a, 0, 0);
  w.armL(mix(0.04, 0.15, a), -0.5 * a, mix(-1.1, -0.78, a),
    0, -1.5 * a + tr * 4, -0.1);
  w.p(HAND_L, -0.25 * a, 0, 0);

  // Postura base ancha y clavículas: la derecha proyecta el hombro hacia la
  // mano, la izquierda se retrae equilibrando la torsión
  w.legL(-0.25 * a, 0, 0.15 * a + 0.03, 0.45 * a + 0.04);
  w.legR(0.15 * a, 0, 0.15 * a + 0.03, 0.2 * a + 0.04);
  w.clavR(0.05 * a, -0.22 * a, 0.04 * a);
  w.clavL(0.04 * a, 0.1 * a, 0.02 * a);

  // Tobillos anclados: talones clavados, dedos agarrando el suelo (el temblor
  // nunca baja del torso a los pies)
  w.footL(0.1 * a, 0, 0.03, 0.04 * a);
  w.footR(-0.06 * a, 0, 0.03, -0.03 * a);
}

// ============================================================================
// poseStasisThrow — lanzamiento estilo Genkidama / agujero negro (1.30 s)
// ============================================================================
// Fase 1 (0..0.38): flota mirando arriba con AMBOS brazos levantados sobre la
//   cabeza concentrando energía; clavículas claramente elevadas (encogimiento)
//   y temblor de carga en las manos.
// Fase 2 (0.52..0.92): se dobla exageradamente en "C" vista de perfil — torso
//   curvado al frente, cabeza contrapesando mirando arriba — lanzando AMBOS
//   brazos y AMBAS piernas hacia delante con los empeines extendidos en punta,
//   soltando la descarga gravitatoria con las palmas abiertas.
export function poseStasisThrow(w: PoseWriter, t: number, g: number): void {
  const ch = smooth(0, 0.24, t) * (1 - smooth(0.46, 0.62, t));  // carga
  const th = smooth(0.52, 0.72, t) * (1 - smooth(1.06, 1.30, t)); // lanzamiento
  const tr = Math.sin(g * 33) * 0.02 * ch;                      // temblor de carga

  w.pos(0, 0.12 * ch - 0.04 * th, -0.06 * ch + 0.14 * th);
  // Fase 1: arqueo mirando arriba · Fase 2: torso curvado en "C" hacia +Z
  w.p(HIPS, -0.12 * ch + 0.3 * th, 0, 0);
  w.p(SPINE, -0.15 * ch + 0.34 * th, 0, 0);
  w.p(CHEST, -0.22 * ch + 0.36 * th, 0, 0);
  w.p(NECK, -0.14 * ch - 0.08 * th, 0, 0);
  w.p(HEAD, -0.28 * ch - 0.42 * th, 0, 0); // la cabeza contrapesa la "C"

  // Brazos: bien arriba sobre la cabeza (ch) → proyectados al frente +Z (th)
  const ux = mix(0.04, -0.05, ch) * (1 - th) - 0.18 * th + tr;
  const uy = -0.15 * ch - 1.42 * th;
  const uz = mix(-1.1, 0.6, ch) * (1 - th) - 0.12 * th;
  const fy = -0.45 * ch - 0.05 * th;
  w.armL(ux, uy, uz + 0.02, 0, fy, 0.08 * ch - 0.06 * th);
  w.armR(ux - tr * 2, uy, uz, 0, fy, 0.08 * ch - 0.06 * th);
  // Manos: puños cerrados concentrando (ch) → palmas abiertas soltando (th)
  const hx = -0.35 * ch - 0.1 * th;
  w.p(HAND_L, hx, 0, 0);
  w.p(HAND_R, hx, 0, 0);

  // Piernas: sueltas atrás en carga → lanzadas exageradamente hacia delante
  // (+Z) en la "C", rodillas apenas dobladas para estirar la curva
  w.legL(0.12 * ch - 1.2 * th, 0, 0.05, 0.28 * ch + 0.24 * th + 0.04);
  w.legR(0.16 * ch - 1.2 * th, 0, 0.05, 0.34 * ch + 0.24 * th + 0.04);

  // Empeines extendidos en punta en el lanzamiento (bota-lanza con látigo de
  // puntera); relajados y colgando durante la carga
  const fx = -0.06 * ch - 0.5 * th;
  w.footL(fx, 0, 0.04, -0.32 * th);
  w.footR(fx, 0, 0.04, -0.32 * th);

  // Clavículas: claramente elevadas en la carga (energía comprimida arriba),
  // proyectadas al frente al soltar con todo el cuerpo
  const cz = 0.16 * ch + 0.06 * th;
  const cy = -0.08 * ch - 0.06 * th;
  w.clavL(0.06 * ch, cy, cz);
  w.clavR(0.06 * ch, cy, cz);
}

// ============================================================================
// poseHitStagger — golpe / rebote de choque lateral (0.95 s)
// ============================================================================
// Latigazo hacia atrás al recibir el choque (0..0.4): torso y cabeza azotados
// atrás, hombros encogidos por las clavículas (asimetría temblorosa), brazos
// lanzados arriba-atrás y cadera con inclinación lateral del impacto.
// Rodilla vencida (0.2..0.9): la pierna izquierda cede hundiendo la cadera
// mientras los pies agarran el suelo con los dedos. La recuperación de
// equilibrio es el decaimiento natural de todas las curvas: a t=0.95 la pose
// vuelve a ~0 y funde con idle (suelo) o flotación (0G).
export function poseHitStagger(w: PoseWriter, t: number): void {
  const i = pulse(t, 0, 0.08, 0.4);                              // impacto
  const wob = Math.exp(-t * 5) * Math.sin(t * 22);               // vaivén
  const buckle = smooth(0.2, 0.45, t) * (1 - smooth(0.45, 0.9, t)); // rodilla vencida

  w.pos(0, -0.1 * buckle, -0.12 * i);
  // Latigazo atrás con inclinación lateral de la cadera (choque de costado)
  w.p(HIPS, -0.35 * i + 0.1 * buckle, 0.1 * wob, 0.2 * i + 0.08 * wob);
  w.p(SPINE, -0.2 * i, 0, 0);
  w.p(CHEST, -0.3 * i, -0.2 * wob, 0);
  w.p(NECK, -0.3 * i, 0, 0);
  w.p(HEAD, -0.35 * i, 0.2 * wob, 0.15 * i);

  // Brazos lanzados arriba-atrás por el latigazo, asimétricos
  w.armL(0.7 * i, 0.5 * i, -1.1 + 0.8 * i, 0, -0.5 * i, -0.1);
  w.armR(0.5 * i, 0.4 * i, -1.1 + 0.6 * i, 0, -0.4 * i, -0.1);

  // Rodilla vencida: la izquierda cede con todo el peso, la derecha resiste
  w.legL(-0.3 * i - 0.4 * buckle, 0, 0.03, 0.6 * i + 0.8 * buckle);
  w.legR(0.3 * i - 0.2 * buckle, 0, 0.03, 0.2 * i + 0.6 * buckle);

  // Pies que agarran el suelo en el impacto (dedos en garra) y ceden con la
  // rodilla; hombros encogidos por las clavículas, temblando en contrafase
  w.footL(0.2 * i - 0.15 * buckle, 0, 0.03, 0.05 * i);
  w.footR(-0.1 * i - 0.2 * buckle, 0, 0.03, 0.05 * i);
  w.clavL(0.06 * i, 0.18 * i, 0.12 * i + 0.04 * wob);
  w.clavR(0.06 * i, 0.18 * i, 0.12 * i - 0.04 * wob);
}

// ============================================================================
// poseEdenAbsorb — absorción de Edén (estado sostenido)
// ============================================================================
// Flotación mística: cuerpo arqueado hacia atrás con la cabeza entregada,
// brazos y clavículas abiertas hacia arriba recibiendo la corriente, pulso de
// energía recorriendo pecho → palmas → clavículas, y piernas colgando con
// gracia: tobillos sueltos y empeines meciéndose lentamente, sin tensión.
export function poseEdenAbsorb(w: PoseWriter, t: number, g: number): void {
  const a = smooth(0, 0.5, t);                 // entrada a la flotación
  const pu = Math.sin(g * 3);                  // pulso de energía
  const sway = Math.sin(g * 1.4);              // vaivén lento de piernas

  w.pos(0, a * (0.12 + pu * 0.03), 0);         // asciende respirando el pulso
  // Arco hacia atrás repartido por toda la columna, cabeza entregada atrás
  w.p(HIPS, -0.06 * a, Math.sin(g * 0.8) * 0.08 * a, 0);
  w.p(SPINE, -0.12 * a, 0, 0);
  w.p(CHEST, -0.2 * a + pu * 0.025 * a, 0, 0);
  w.p(NECK, -0.18 * a, 0, 0);
  w.p(HEAD, -0.34 * a, 0, 0);

  // Brazos abiertos hacia arriba recibiendo la corriente, palmas pulsando
  const z = mix(-1.1, 0.62, a) + pu * 0.08 * a;
  w.armL(mix(0.04, -0.05, a), -0.15 * a, z, 0, -0.5 * a, 0.1 * a);
  w.armR(mix(0.04, -0.05, a), -0.15 * a, z - pu * 0.05 * a, 0, -0.5 * a, 0.1 * a);
  w.p(HAND_L, -0.4 * a + pu * 0.06 * a, 0, 0);
  w.p(HAND_R, -0.4 * a + pu * 0.06 * a, 0, 0);

  // Piernas sueltas, ligeramente atrás, meciéndose con deriva propia
  w.legL(0.08 * a + sway * 0.05 * a, 0.03, 0.06 * a + 0.03, 0.25 * a + 0.04);
  w.legR(0.15 * a + Math.sin(g * 1.4 + 1) * 0.05 * a, 0, 0.06 * a + 0.03,
    0.35 * a + 0.04);

  // Pies gráciles: empeines sueltos que se mecen despacio (ni puntas ni
  // flexión forzada), punteras colgando con vida propia
  w.footL(-0.28 * a + Math.sin(g * 1.1) * 0.05 * a, 0.02, 0.04,
    -0.16 * a + Math.sin(g * 0.9 + 0.7) * 0.06 * a);
  w.footR(-0.33 * a + Math.sin(g * 1.1 + 1.3) * 0.05 * a, 0, 0.04,
    -0.18 * a + Math.sin(g * 0.9 + 1.9) * 0.06 * a);

  // Clavículas abiertas hacia arriba con el pulso, ofreciendo el pecho al cosmos
  w.clavL(0.04 * a, -0.08 * a, 0.14 * a + pu * 0.03 * a);
  w.clavR(0.04 * a, -0.08 * a, 0.14 * a + pu * 0.03 * a);
}
