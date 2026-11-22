// ============================================================================
// OUTORBIT — NYX: poses de suelo (`nyx_rigged.glb`): idle, run y aterrizajes.
//
// Compañero de `nyxAnimsCombat.ts` / `nyxAnimsTraversal.ts`: mismas convenciones
// de esqueleto y misma interfaz `PoseWriter`. Funciones puras y sin estado:
// solo leen sus parámetros y escriben en `w`. Cero allocations por frame
// (sin literales de objeto/array, sin closures): seguras para llamar cada frame.
//
// Convención (bind pose = T-Pose, +Z frente, +Y arriba, +X brazo izquierdo;
// detalle completo en el cabecero de `nyxAnimsCombat.ts`):
//   brazos      : uz<0 baja el brazo (-1.1 = costado); ux<0 lo lleva al frente;
//                 uy<0 lo abre hacia +Z; codo fy<0 dobla el antebrazo al frente
//   clavículas  : z>0 encoge el hombro hacia arriba; y<0 lo proyecta al frente
//   piernas     : tx<0 muslo adelante (+Z), tx>0 atrás; rodilla sx>=0 SIEMPRE
//   tobillos    : fx<0 extiende la puntera (flexión plantar, talón arriba);
//                 fx>0 encoge el pie hacia la espinilla (talón al impacto);
//                 tx (opcional) añade el látigo de la puntera
//   torso/cabeza: x>0 inclina al frente, y twist, z lateral (z<0 hacia +X)
// Los valores del lado R se escriben en convención L y los helpers espejan.
//
// Mapa de huesos (27): HIPS=0 SPINE=1 CHEST=2 NECK=3 HEAD=4 UA_L=5 FA_L=6
// HAND_L=7 UA_R=8 FA_R=9 HAND_R=10 TH_L=11 SH_L=12 TH_R=13 SH_R=14
// (15..18 pelo) CLAV_L=19 CLAV_R=20 FOOT_L=21 TOE_L=22 FOOT_R=23 TOE_R=24
// (25..26 mangas). Clavículas, tobillos y punteras van a través de los helpers
// `clavL/R` y `footL/R`; las manos se escriben directas con `p`.
// ============================================================================

import type { PoseWriter } from './nyxAnimsCombat';

const HIPS = 0, SPINE = 1, CHEST = 2, NECK = 3, HEAD = 4;
const HAND_L = 7, HAND_R = 10;

/** Duración (s) de `poseJumpLand` (despegue + toque ligero). */
export const JUMP_LAND_DURATION = 1.15;
/** Duración (s) de `poseLandRecover` (aterrizaje fuerte con absorción). */
export const LAND_RECOVER_DURATION = 1.1;
/** Duración (s) de `poseAirDash` (dash lateral/frontal). */
export const AIR_DASH_DURATION = 0.6;

// --- Helpers numéricos puros (idénticos a nyxAnimator/nyxAnimsCombat) -------
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
// poseIdle — reposo en suelo
// ============================================================================
// Postura anime de reposo: peso asentado en la pierna izquierda (contrapposto),
// derecha relajada y ligeramente atrás. La respiración sube el pecho y encoge
// las clavículas al ritmo rápido (~0.27 Hz) mientras la cadera se balancea a un
// tempo mucho más lento, desfasado de la respiración. Los pies quedan asentados
// con un leve ángulo de punteras: el de apoyo plano y el libre con el talón
// apenas vivo y la puntera girada hacia fuera.
export function poseIdle(w: PoseWriter, g: number): void {
  const b = Math.sin(g * 1.7) * 0.02;            // respiración
  const sh = Math.sin(g * 0.6);                  // balanceo lento de cadera
  const sh2 = Math.sin(g * 0.6 + 1.2);           // mismo balanceo, desfasado

  // Cadera asentada sobre la pierna de apoyo, flotando con la respiración
  w.pos(sh * 0.018, -0.012 + b * 0.5, 0);
  w.p(HIPS, 0.01, sh * 0.05, sh * 0.035);
  w.p(SPINE, 0.02, -sh * 0.03, -sh * 0.022);
  w.p(CHEST, 0.035 + b, sh * 0.015, -sh * 0.012);
  w.p(NECK, -0.015 - b * 0.3, 0, 0);
  w.p(HEAD, -0.03 - b * 0.5, Math.sin(g * 0.4) * 0.08, sh2 * 0.012);

  // Brazos colgando con micro-balanceo desfasado; manos vivas pero relajadas
  w.armL(0.05 + Math.sin(g * 1.2) * 0.03, 0, -1.1 + b * 2, 0, -0.2, -0.08);
  w.armR(0.05 + Math.sin(g * 1.2 + 0.8) * 0.03, 0, -1.1 - b * 2, 0, -0.2, -0.08);
  w.p(HAND_L, 0.04 + Math.sin(g * 1.2) * 0.02, 0, 0);
  w.p(HAND_R, 0.04 + Math.sin(g * 1.2 + 0.8) * 0.02, 0, 0);

  // Piernas: contrapposto (peso en la izquierda, derecha relajada atrás)
  w.legL(-0.04, 0, 0.03, 0.1);
  w.legR(0.02, 0, 0.03, 0.04);

  // Respiración en clavículas + vaivén con el balanceo de cadera
  w.clavL(0.015 + b * 0.4, sh2 * 0.01, 0.02 + sh * 0.015);
  w.clavR(0.015 + b * 0.4, -sh2 * 0.01, 0.02 - sh * 0.015);

  // Pies asentados: apoyo plano, libre con talón vivo y puntera con leve ángulo
  w.footL(0.04, 0, 0.02, 0.03);
  w.footR(-0.05 + sh * 0.02, 0, 0.02, -0.04 + sh2 * 0.02);
}

// ============================================================================
// poseRun — carrera / andar
// ============================================================================
// Zancada dinámica proporcional a `speed01` (0 = trote suave, 1 = sprint):
// amplitud de piernas y brazos, vuelo de cadera (dos apoyos por ciclo de
// `runPhase`) e inclinación al frente que crece con la velocidad.
//
// `turnRate` (rad/s, + = giro a la izquierda, misma convención que
// `poseGravitySlide`) inclina TODO el cuerpo al interior de la curva —cadera,
// spine, pecho y hombro interior que cae— con la cabeza contrarrotando para
// mantener la mirada al frente y el giro de cabeza buscando la trazada.
//
// Tobillos y punteras articulan cada paso: talón dorsiflexionado al recibir la
// pierna adelante y, en el impulso de atrás, extensión de tobillo con látigo de
// puntera cuya intensidad crece con `speed01`.
export function poseRun(w: PoseWriter, g: number, runPhase: number, speed01: number, turnRate: number): void {
  const sp = clamp(speed01, 0, 1);
  const amp = 0.45 + 0.55 * sp;
  const s = Math.sin(runPhase), c = Math.cos(runPhase);
  const lean = 0.12 + 0.28 * sp;                     // inclinación al frente
  const turn = clamp(-turnRate * 0.22, -0.38, 0.38); // <0 = interior giro izq.
  const twist = clamp(turnRate * 0.06, -0.14, 0.14); // torsión hacia la trazada
  const bounce = 0.5 + 0.5 * Math.cos(2 * runPhase); // 2 apoyos por ciclo
  const flutter = Math.sin(g * 11) * 0.012 * sp;     // vibración al sprint

  // Vuelo del ciclo: la cadera sube en el impulso y cae en la recogida;
  // se desplaza un pelín hacia el interior de la curva
  w.pos(-turn * 0.05, -0.05 * amp * bounce - 0.02, 0);
  w.p(HIPS, lean * 0.4, s * 0.25 * amp, s * 0.04 + turn * 0.35);
  w.p(SPINE, lean * 0.5 + flutter, -s * 0.15 * amp + twist, -s * 0.03 + turn * 0.45);
  w.p(CHEST, lean * 0.5, -s * 0.2 * amp + twist * 0.5, turn * 0.3);
  w.p(NECK, -lean * 0.4, 0, -turn * 0.25);
  w.p(HEAD, -lean * 0.8, clamp(turnRate * 0.1, -0.25, 0.25), -turn * 0.5);

  // Piernas: L en fase, R en contrafase; zancada proporcional a speed01
  w.legL(-s * 0.85 * amp - 0.12 * amp, 0, 0.03,
    0.12 + 1.2 * amp * Math.max(0, c * 0.9 + 0.35));
  w.legR(s * 0.85 * amp - 0.12 * amp, 0, 0.03,
    0.12 + 1.2 * amp * Math.max(0, -c * 0.9 + 0.35));

  // Tobillos/punteras por paso: talón al impacto (pierna adelante, fx>0),
  // impulso con látigo de puntera (pierna atrás, fx<0 + tx<0 más fuerte a
  // más velocidad)
  const pushL = Math.max(0, -s);
  const pushR = Math.max(0, s);
  const whip = (0.35 + 0.3 * sp) * amp;
  w.footL(s * 0.45 * amp + 0.05, 0, 0.03, -pushL * whip);
  w.footR(-s * 0.45 * amp + 0.05, 0, 0.03, -pushR * whip);

  // Brazos en contrafase con su pierna, codos a ~90°, bombeo proporcional
  const bend = 0.85 + 0.35 * amp;
  w.armL(s * 0.9 * amp, 0, -1.2, 0, -(bend - s * 0.25), -0.05);
  w.armR(-s * 0.9 * amp, 0, -1.2, 0, -(bend + s * 0.25), -0.05);
  w.p(HAND_L, -0.08 - s * 0.06 * amp, 0, 0);
  w.p(HAND_R, -0.08 + s * 0.06 * amp, 0, 0);

  // Clavículas: contrarrota con el brazo, encoge al sprint y el hombro
  // interior de la curva cae (el exterior se abre)
  w.clavL(0.03 + 0.05 * sp, s * 0.09 * amp, -0.05 * sp + turn * 0.5);
  w.clavR(0.03 + 0.05 * sp, s * 0.09 * amp, -0.05 * sp - turn * 0.5);
}

// ============================================================================
// poseJumpLand — despegue / toque ligero (1.15 s)
// ============================================================================
// Fase 1 (0..0.34): compresión breve de rodillas y tobillos, brazos atrás.
// Fase 2 (0.28..0.78): extensión aérea estilizada —pierna guía recogida al
//   pecho, pierna de choque extendida atrás— con las punteras apuntando abajo
//   (bota en punta, látigo incluido) y brazos abiertos en el plano.
// Fase 3 (0.82..1.15): toque ligero de aterrizaje —talones que absorben,
//   rodillas que ceden— y vuelta a reposo.
// La bajada de cadera se deriva del ángulo de muslo (`1 - cos`), de modo que el
// pie plantado no patina durante las compresiones.
export function poseJumpLand(w: PoseWriter, t: number): void {
  const c1 = pulse(t, 0, 0.16, 0.34);        // compresión previa
  const air = pulse(t, 0.28, 0.46, 0.78);    // extensión aérea
  const c2 = pulse(t, 0.82, 0.98, JUMP_LAND_DURATION); // absorción final
  const cr = Math.max(c1, c2 * 1.1);
  const th = cr;                             // ángulo de muslo
  const drop = 0.84 * (1 - Math.cos(th));    // pie plantado: baja la cadera

  w.pos(0, -drop + 0.12 * air, 0.84 * Math.sin(th) * 0.5);
  w.p(HIPS, 0.1 * cr + 0.12 * air, 0, 0);
  w.p(SPINE, 0.2 * cr - 0.12 * air, 0, 0);
  w.p(CHEST, 0.2 * cr - 0.1 * air, 0, 0);
  w.p(NECK, -0.06 * air, 0, 0);
  w.p(HEAD, -0.2 * cr + 0.08 * air, 0, 0);

  // Brazos: atrás al comprimir, abiertos al frente-arriba en el impulso
  // (asimetría sutil: el brazo guía algo más alto que el de choque), abiertos al caer
  const swing = c1 * 0.7 - c2 * 0.5;
  const ua = mix(-1.1, -0.1, air);
  w.armL(mix(0.04, -0.25, air) + swing, 0, ua + 0.1 * air, 0, -0.2 * (1 - air), -0.08);
  w.armR(mix(0.04, -0.05, air) + swing, 0, ua - 0.12 * air, 0, -0.2 * (1 - air), -0.08);

  // Piernas: simétricas en las compresiones; bóveda asimétrica en el aire
  // (guía = rodilla al pecho, choque = estirada atrás)
  w.legL(-th - 0.6 * air, 0, 0.03 + 0.05 * air, 2 * th + 1.1 * air);
  w.legR(-th + 0.75 * air, 0, 0.03, 2 * th + 0.35 * air);

  // Tobillos/punteras: talones clavados al comprimir (fx>0), PUNTERAS AL FRENTE
  // en el aire (fx<0 con látigo, la de la pierna de choque al máximo) y
  // flexión de recepción al tocar
  w.footL(0.32 * c1 + 0.22 * c2 - 0.5 * air, 0, 0.02, -0.3 * c1 - 0.4 * air + 0.15 * c2);
  w.footR(0.32 * c1 + 0.22 * c2 - 0.62 * air, 0, 0.02, -0.3 * c1 - 0.5 * air + 0.15 * c2);

  // Clavículas: encogidas al volar, caídas al comprimir/amortiguar
  w.clavL(0.05 * air - 0.04 * cr, 0, 0.14 * air - 0.05 * cr);
  w.clavR(0.05 * air - 0.04 * cr, 0, 0.14 * air - 0.05 * cr);
}

// ============================================================================
// poseLandRecover — aterrizaje fuerte con absorción (1.10 s)
// ============================================================================
// Fase 1 (0..0.13): caída en cuclillas profundas y asimétricas —el impacto se
//   absorbe con las rodillas y con TOBILLOS EN FLEXIÓN PLANTAR (foot < 0):
//   talones arriba, el peso recibe en las puntas y los dedos agarran (tx<0).
// Fase 2 (0.13..0.42): pausa de absorción; la mano derecha roza el suelo con
//   la palma abierta y el hombro derecho cae hacia ella.
// Fase 3 (0.42..1.0): subida orgánica empujando con las clavículas —ambas se
//   proyectan al frente y ascienden en una campana sincronizada con el impulso—
//   mientras los tobillos devuelven los talones al suelo y el cuerpo se ergue.
export function poseLandRecover(w: PoseWriter, t: number): void {
  const c = smooth(0.02, 0.13, t) * (1 - smooth(0.42, 1.0, t));
  const rise = smooth(0.42, 1.0, t);
  const push = Math.sin(rise * Math.PI); // impulso de la subida (campana)

  w.pos(0, -0.38 * c + 0.03 * push, 0.1 * c);
  w.p(HIPS, 0.35 * c, 0, 0);
  w.p(SPINE, 0.28 * c, 0, 0);
  w.p(CHEST, 0.16 * c, 0, 0);
  w.p(NECK, -0.1 * c, 0, 0);
  w.p(HEAD, -0.28 * c, 0, 0);

  // Brazo derecho: mano que roza el suelo (palma abierta hacia abajo);
  // izquierdo atrás-arriba en equilibrio
  w.armR(-0.5 * c, 0.15 * c, mix(-1.1, -1.2, c), 0, -0.12 * c, 0);
  w.p(HAND_R, -0.3 * c, 0, 0.1 * c);
  w.armL(0.65 * c, -0.25 * c, mix(-1.1, -0.5, c), 0, -0.5 * c, -0.1);

  // Sentadilla profunda asimétrica (izquierda más cargada)
  w.legL(-1.15 * c, 0.05 * c, 0.06, 1.85 * c + 0.04);
  w.legR(-0.85 * c, 0, 0.06, 1.65 * c + 0.04);

  // Tobillos absorbiendo el impacto en flexión plantar (foot < 0): talones
  // arriba, peso en las puntas, dedos agarrando; al elevarse vuelven a neutro
  w.footL(-0.32 * c, 0, 0.02, -0.18 * c);
  w.footR(-0.32 * c, 0, 0.02, -0.18 * c);

  // Clavículas: derecha cae hacia la mano en el suelo e izquierda abre arriba;
  // la subida empuja proyectando ambas al frente y levantándolas
  w.clavL(0.06 * c + 0.04 * push, 0.12 * c - 0.16 * push, 0.1 * c + 0.05 * push);
  w.clavR(0.08 * c + 0.04 * push, -0.18 * c - 0.06 * push, -0.12 * c + 0.14 * push);
}

// ============================================================================
// poseAirDash — dash lateral/frontal (0.60 s)
// ============================================================================
// Sprint explosivo hacia `dashDir` (+1 = hacia +X del modelo, su costado
// izquierdo; -1 = hacia -X). Envolvente rápida: entra en ~80 ms, sostiene y
// se disuelve hacia el final. Todo el cuerpo se inclina AGRESIVAMENTE hacia
// la dirección del dash (hips > spine > pecho, en cascada) con la cabeza
// contrarrotando para mantener la mirada al frente.
//
// Silueta de flecha asimétrica: la clavícula guía se proyecta al frente y cae
// hacia el dash mientras el brazo guía se extiende en la dirección de marcha y
// el otro queda recogido atrás; la pierna guía va recogida (lista para recibir
// el suelo, puntera apenas arriba) y la opuesta se estira atrás con el empeine
// en punta al máximo, rematado con látigo de puntera. `g` alimenta el aleteo
// de alta velocidad del brazo guía.
export function poseAirDash(w: PoseWriter, t: number, g: number, dashDir: number): void {
  const d = dashDir >= 0 ? 1 : -1;
  const e = smooth(0, 0.08, t) * (1 - smooth(0.25, AIR_DASH_DURATION, t));
  const lean = -d * (0.3 + 0.55 * e); // <0 hacia +X (izquierda) cuando d=+1
  const flutter = Math.sin(g * 14) * 0.05 * e;

  w.pos(d * 0.05 * e, 0, 0);
  w.p(HIPS, 0.35 * e, d * 0.3 * e, lean);
  w.p(SPINE, 0.12 * e, d * 0.12 * e, lean * 0.5);
  w.p(CHEST, 0.14 * e, -d * 0.18 * e, lean * 0.3);
  w.p(NECK, -0.06 * e, 0, 0);
  w.p(HEAD, -0.2 * e, 0, -lean * 0.7); // la cabeza mantiene la mirada

  // Brazo guía extendido hacia la marcha, el otro recogido atrás
  const leadL = d > 0;
  const lx = -0.2, ly = -0.35 * e, lz = mix(-1.1, -0.35, e);
  const tx = 0.5 * e, ty = 0.5 * e, tz = mix(-1.1, -1.3, e);
  if (leadL) {
    w.armL(lx + flutter, ly, lz, 0, -0.1, 0);
    w.armR(tx, ty, tz, 0, -1.0 * e, -0.1);
  } else {
    w.armR(lx + flutter, ly, lz, 0, -0.1, 0);
    w.armL(tx, ty, tz, 0, -1.0 * e, -0.1);
  }

  // Pierna guía recogida; opuesta estirada atrás como estela
  if (leadL) {
    w.legL(-0.6 * e, 0, 0.03, 1.1 * e);
    w.legR(0.35 * e, 0, 0.03 - 0.1 * e, 0.2 * e);
  } else {
    w.legR(-0.6 * e, 0, 0.03, 1.1 * e);
    w.legL(0.35 * e, 0, 0.03 - 0.1 * e, 0.2 * e);
  }

  // Clavículas: la guía se proyecta al frente y cae hacia el dash, la de
  // atrás se retrae y encoge → silueta de flecha asimétrica
  if (leadL) {
    w.clavL(0.06 * e, -0.24 * e, -0.1 * e);
    w.clavR(0.06 * e, 0.14 * e, 0.05 * e);
  } else {
    w.clavR(0.06 * e, -0.24 * e, -0.1 * e);
    w.clavL(0.06 * e, 0.14 * e, 0.05 * e);
  }

  // Pies: el guía hace de timón (tobillo levemente flexionado, puntera arriba
  // para recibir); el de la estela extiende el empeine en punta al máximo
  if (leadL) {
    w.footL(0.12 * e, 0, 0.04, 0.06 * e);
    w.footR(-0.6 * e, 0, 0.04, -0.35 * e);
  } else {
    w.footR(0.12 * e, 0, 0.04, 0.06 * e);
    w.footL(-0.6 * e, 0, 0.04, -0.35 * e);
  }
}
