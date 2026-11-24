#!/usr/bin/env node
// Build public/models/nyx_rigged.glb — NYX 100% PROCEDURAL (cero assets externos).
//
// No lee ningún asset externo: las 4 primitivas
// (`nyx_hair`, `nyx_body`, `nyx_face`, `nyx_eyes`) se generan matemáticamente.
//
// - `nyx_body`: lofting anatómico continuo — perfiles transversales
//   superelípticos suaves para torso, cintura esbelta y cadera limpia tipo
//   bodysuit cósmico (sin cinturón ni faldones), muslos estilizados, rodillas,
//   gemelos, tobillos y botas puntiagudas aerodinámicas, hombros, brazos,
//   antebrazos y manos estilizadas. El torso-pelvis es UNA superficie continua
//   (sin costura cintura→cadera) y los muslos/brazos nacen de domos encajados
//   en profundidad con normales suaves, de modo que el contorno blanco
//   (Inverted Hull) dibuja una silueta exterior impecable sin anillos blancos
//   en la entrepierna, la cintura o los hombros.
// - `nyx_face`: cabeza anime femenina (Y ≈ 1.44..1.64) con barbilla fina,
//   mejillas suaves y cuello integrado (anillo coincidente con el cuello del
//   torso). `nyx_eyes`: ojos almendrados expresivos montados ligeramente por
//   delante del plano facial.
// - `nyx_hair`: melena volumétrica 3D (casquete craneal + flequillos + 7
//   mechones largos) encadenada a los 4 huesos de pelo (hair_1..hair_4).
// - Esqueleto de 25 huesos: índices 0..17 invariables + `hair_4`,
//   `clavicle_L/R`, `foot_L/R` y `toe_L/R` para látigo de 4 eslabones,
//   shrug de hombros y articulación de tobillos/punteras.
// - Skin glTF: JOINTS_0 (VEC4 U16) + WEIGHTS_0 (VEC4 F32, sum === 1) +
//   inverseBindMatrices. `verify()` re-parsea el GLB escrito y valida los 25
//   huesos (nombres, padres, posiciones de mundo) y todos los accessors.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public/models/nyx_rigged.glb');

const PART_COLORS = {
  nyx_hair: '#e2e8f0',
  nyx_body: '#181b2c',
  nyx_face: '#fde6d8',
  nyx_eyes: '#0f172a',
};

// ---------------------------------------------------------------------------
// Esqueleto: 25 huesos. `t` es la traslación RELATIVA al padre.
// ---------------------------------------------------------------------------
const BONES = [
  { name: 'hips',       parent: -1, t: [0, 0.88, 0] },
  { name: 'spine',      parent: 0,  t: [0, 0.22, 0] },
  { name: 'chest',      parent: 1,  t: [0, 0.22, 0] },
  { name: 'neck',       parent: 2,  t: [0, 0.12, 0] },
  { name: 'head',       parent: 3,  t: [0, 0.08, 0] },
  // Cadena del pelo sobre el arco real de la melena (nuca → media espalda).
  { name: 'hair_1',     parent: 4,  t: [0, -0.02, -0.17] },
  { name: 'hair_2',     parent: 5,  t: [0, -0.14, -0.03] },
  { name: 'hair_3',     parent: 6,  t: [0, -0.14, 0.01] },
  { name: 'upperArm_L', parent: 19, t: [0.11, 0, 0] },   // mundo [0.16, 1.40, 0]
  { name: 'forearm_L',  parent: 8,  t: [0.26, -0.02, 0] },
  { name: 'hand_L',     parent: 9,  t: [0.24, -0.02, 0] },
  { name: 'upperArm_R', parent: 20, t: [-0.11, 0, 0] },   // mundo [-0.16, 1.40, 0]
  { name: 'forearm_R',  parent: 11, t: [-0.26, -0.02, 0] },
  { name: 'hand_R',     parent: 12, t: [-0.24, -0.02, 0] },
  { name: 'thigh_L',    parent: 0,  t: [0.09, -0.04, 0] },
  { name: 'shin_L',     parent: 14, t: [0, -0.40, 0] },
  { name: 'thigh_R',    parent: 0,  t: [-0.09, -0.04, 0] },
  { name: 'shin_R',     parent: 16, t: [0, -0.40, 0] },
  // --- 7 huesos nuevos (18..24) ---
  { name: 'hair_4',     parent: 7,  t: [0, -0.12, 0.03] },  // punta del látigo
  { name: 'clavicle_L', parent: 2,  t: [0.05, 0.08, 0] },   // mundo [0.05, 1.40, 0]
  { name: 'clavicle_R', parent: 2,  t: [-0.05, 0.08, 0] },  // mundo [-0.05, 1.40, 0]
  { name: 'foot_L',     parent: 15, t: [0, -0.36, 0] },     // tobillo Y = 0.08
  { name: 'toe_L',      parent: 21, t: [0, -0.02, 0.06] },  // puntera hacia +Z
  { name: 'foot_R',     parent: 17, t: [0, -0.36, 0] },
  { name: 'toe_R',      parent: 23, t: [0, -0.02, 0.06] },
];
// Posiciones de mundo (suma de traslaciones por la cadena de padres).
const B = BONES.map((b) => {
  const w = [0, 0, 0];
  let i = BONES.indexOf(b);
  while (i !== -1) {
    w[0] += BONES[i].t[0];
    w[1] += BONES[i].t[1];
    w[2] += BONES[i].t[2];
    i = BONES[i].parent;
  }
  return w;
});
const HIPS = 0, SPINE = 1, CHEST = 2, NECK = 3, HEAD = 4;
const HAIR1 = 5, HAIR2 = 6, HAIR3 = 7, HAIR4 = 18;
const CLAV_L = 19, CLAV_R = 20, FOOT_L = 21, TOE_L = 22, FOOT_R = 23, TOE_R = 24;

// ---------------------------------------------------------------------------
// Auto-test del esqueleto contra la especificación (orden 0..17, huesos nuevos,
// posiciones de mundo clave) antes de generar nada.
// ---------------------------------------------------------------------------
function selfTest() {
  const names18 = [
    'hips', 'spine', 'chest', 'neck', 'head', 'hair_1', 'hair_2', 'hair_3',
    'upperArm_L', 'forearm_L', 'hand_L', 'upperArm_R', 'forearm_R', 'hand_R',
    'thigh_L', 'shin_L', 'thigh_R', 'shin_R',
  ];
  for (let i = 0; i < 18; i++) {
    if (BONES[i].name !== names18[i]) throw new Error(`selfTest: hueso ${i} debería ser ${names18[i]}`);
  }
  const expectNew = [
    [18, 'hair_4', 7], [19, 'clavicle_L', 2], [20, 'clavicle_R', 2],
    [21, 'foot_L', 15], [22, 'toe_L', 21], [23, 'foot_R', 17], [24, 'toe_R', 23],
  ];
  for (const [i, name, parent] of expectNew) {
    if (BONES[i].name !== name || BONES[i].parent !== parent) {
      throw new Error(`selfTest: hueso ${i} debería ser ${name} (parent ${parent})`);
    }
  }
  const close = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 1e-9;
  if (!close(B[8], [0.16, 1.40, 0])) throw new Error('selfTest: upperArm_L mundo != [0.16, 1.40, 0]');
  if (!close(B[11], [-0.16, 1.40, 0])) throw new Error('selfTest: upperArm_R mundo != [-0.16, 1.40, 0]');
  if (!close(B[19], [0.05, 1.40, 0])) throw new Error('selfTest: clavicle_L mundo != [0.05, 1.40, 0]');
  if (!close(B[20], [-0.05, 1.40, 0])) throw new Error('selfTest: clavicle_R mundo != [-0.05, 1.40, 0]');
  if (Math.abs(B[21][1] - 0.08) > 1e-9 || Math.abs(B[23][1] - 0.08) > 1e-9) {
    throw new Error('selfTest: tobillos (foot_L/R) deben estar en Y = 0.08');
  }
  if (B[22][2] <= 0 || B[24][2] <= 0) throw new Error('selfTest: punteras (toe_L/R) deben apuntar a +Z');
  if (B[18][1] >= B[7][1]) throw new Error('selfTest: hair_4 debe colgar por debajo de hair_3');
}

// ---------------------------------------------------------------------------
// MeshBuilder: vértices con pesos embebidos + triángulos auto-orientados.
// `tri()` voltea la winding cuando el triángulo mira hacia el punto de
// referencia, garantizando normales exteriores (crítico para el Inverted Hull:
// con winding invertida el contorno se dibujaría sobre las caras frontales).
// ---------------------------------------------------------------------------
class MeshBuilder {
  constructor() {
    this.pos = [];
    this.idx = [];
    this.jnt = [];
    this.wgt = [];
  }

  vert(x, y, z, pairs = []) {
    const vi = this.pos.length / 3;
    this.pos.push(x, y, z);
    let s = 0;
    const p = [0, 0, 0, 0], w = [0, 0, 0, 0];
    if (pairs && pairs.length) {
      for (let k = 0; k < Math.min(4, pairs.length); k++) {
        p[k] = pairs[k][0];
        w[k] = pairs[k][1];
        s += w[k];
      }
    }
    if (s <= 0) { p[0] = HIPS; w[0] = 1; s = 1; }
    for (let k = 0; k < 4; k++) {
      this.jnt.push(p[k]);
      this.wgt.push(w[k] / s);
    }
    return vi;
  }

  tri(a, b, c, rx, ry, rz) {
    const P = this.pos;
    const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
    const bx = P[b * 3], by = P[b * 3 + 1], bz = P[b * 3 + 2];
    const cx = P[c * 3], cy = P[c * 3 + 1], cz = P[c * 3 + 2];
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const fx = (ax + bx + cx) / 3 - rx, fy = (ay + by + cy) / 3 - ry, fz = (az + bz + cz) / 3 - rz;
    if (nx * fx + ny * fy + nz * fz < 0) { const t = b; b = c; c = t; }
    this.idx.push(a, b, c);
  }
}

// ---------------------------------------------------------------------------
// Matemáticas del lofting
// ---------------------------------------------------------------------------
/** Superelipse unitaria: p=2 → círculo; p>2 → sección más llena/plana. */
function super2(phi, p) {
  const c = Math.cos(phi), s = Math.sin(phi);
  const e = 2 / p;
  return [
    c === 0 ? 0 : Math.sign(c) * Math.pow(Math.abs(c), e),
    s === 0 ? 0 : Math.sign(s) * Math.pow(Math.abs(s), e),
  ];
}

/** Gaussiana angular envuelta a (-PI, PI]. */
function angGauss(phi, center, sigma) {
  let d = phi - center;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return Math.exp(-(d * d) / (2 * sigma * sigma));
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function smooth01(v) {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
}

/**
 * Anillos de un loft: cada anillo es { c, aF, aB, b, p, bumps, frame, pairs }.
 *  - c: centro; frame: [ejeA (frente), ejeB (izquierda)].
 *  - aF/aB: radio a lo largo de ±ejeA (fondo/frente del torso, puntera/talón);
 *    b: radio a lo largo de ejeB (ancho lateral).
 *  - bumps: [{ phi, sig, ampA, ampB }] desplazamientos gaussianos suaves.
 */
function ringRow(mb, r, segs) {
  const row = [];
  const A = r.frame[0], Bx = r.frame[1];
  for (let s = 0; s < segs; s++) {
    const phi = (s / segs) * Math.PI * 2;
    const [su, sv] = super2(phi, r.p || 2);
    const a = su >= 0 ? r.aF : r.aB;
    let ox = A[0] * su * a + Bx[0] * sv * r.b;
    let oy = A[1] * su * a + Bx[1] * sv * r.b;
    let oz = A[2] * su * a + Bx[2] * sv * r.b;
    if (r.bumps) {
      for (const bmp of r.bumps) {
        const g = angGauss(phi, bmp.phi, bmp.sig);
        if (g < 1e-4) continue;
        const aa = (bmp.ampA || 0) * g, ab = (bmp.ampB || 0) * g;
        ox += A[0] * aa + Bx[0] * ab;
        oy += A[1] * aa + Bx[1] * ab;
        oz += A[2] * aa + Bx[2] * ab;
      }
    }
    row.push(mb.vert(r.c[0] + ox, r.c[1] + oy, r.c[2] + oz, r.pairs || [[HIPS, 1]]));
  }
  return row;
}

/**
 * Loft genérico: conecta los anillos con quads y los tapa con casquetes.
 * capStart/capEnd: { mode: 'dome' | 'point' | 'none', depth }.
 *  - 'dome': casquete redondeado (hombro, cadera, coronilla, yema de los dedos).
 *  - 'point': cierre puntiagudo (puntera de la bota, barbilla, perineo).
 *  - 'none': anillo abierto (cuello del torso, soldado por coincidencia con
 *    el cuello de nyx_face; y boca superior del cuello, oculta en la cabeza).
 */
function loft(mb, cfg) {
  const segs = cfg.segs;
  const rings = cfg.rings;
  const grid = rings.map((r) => ringRow(mb, r, segs));
  for (let i = 0; i + 1 < rings.length; i++) {
    const c = rings[i].c;
    for (let s = 0; s < segs; s++) {
      const s2 = (s + 1) % segs;
      mb.tri(grid[i][s], grid[i + 1][s], grid[i + 1][s2], c[0], c[1], c[2]);
      mb.tri(grid[i][s], grid[i + 1][s2], grid[i][s2], c[0], c[1], c[2]);
    }
  }
  cap(mb, grid, rings, segs, true, cfg.capStart);
  cap(mb, grid, rings, segs, false, cfg.capEnd);
}

function cap(mb, grid, rings, segs, isStart, cfgCap) {
  if (!cfgCap || cfgCap.mode === 'none') return;
  const i = isStart ? 0 : rings.length - 1;
  const r = rings[i];
  const c = r.c;
  const other = rings[isStart ? 1 : rings.length - 2].c;
  let tx = other[0] - c[0], ty = other[1] - c[1], tz = other[2] - c[2];
  const l = Math.hypot(tx, ty, tz) || 1;
  // El casquete avanza SIEMPRE alejándose del interior del loft: al inicio,
  // -(rings[1]-rings[0]) retrocede antes del primer anillo; al final,
  // -(rings[n-2]-rings[n-1]) avanza más allá del último anillo.
  tx = -(tx / l); ty = -(ty / l); tz = -(tz / l);
  const depth = cfgCap.depth;
  const dome = cfgCap.mode === 'dome';
  const ts = dome ? [0.3, 0.62, 0.87] : [0.5, 0.85];
  const rows = [grid[i]];
  const centers = [c];
  for (const t of ts) {
    const rad = dome ? Math.cos(t * Math.PI / 2) : Math.pow(1 - t, 1.3);
    const off = dome ? Math.sin(t * Math.PI / 2) : t;
    const cc = [c[0] + tx * depth * off, c[1] + ty * depth * off, c[2] + tz * depth * off];
    centers.push(cc);
    rows.push(ringRow(mb, {
      c: cc,
      aF: r.aF * rad, aB: r.aB * rad, b: r.b * rad,
      p: r.p, frame: r.frame, pairs: r.pairs,
    }, segs));
  }
  for (let k = 0; k + 1 < rows.length; k++) {
    const rc = centers[k];
    for (let s = 0; s < segs; s++) {
      const s2 = (s + 1) % segs;
      mb.tri(rows[k][s], rows[k + 1][s], rows[k + 1][s2], rc[0], rc[1], rc[2]);
      mb.tri(rows[k][s], rows[k + 1][s2], rows[k][s2], rc[0], rc[1], rc[2]);
    }
  }
  const lc = centers[centers.length - 1];
  const tip = mb.vert(
    c[0] + tx * depth, c[1] + ty * depth, c[2] + tz * depth,
    r.pairs || [[HIPS, 1]]
  );
  const last = rows[rows.length - 1];
  for (let s = 0; s < segs; s++) {
    mb.tri(last[s], tip, last[(s + 1) % segs], lc[0], lc[1], lc[2]);
  }
}

/** Marcos ortonormales por punto de un path (A = cross(t, ref), B = cross(A, t)). */
function pathFrames(pathPts, ref) {
  const n = pathPts.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = pathPts[Math.max(0, i - 1)].c;
    const b = pathPts[Math.min(n - 1, i + 1)].c;
    let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2];
    const l = Math.hypot(tx, ty, tz) || 1;
    tx /= l; ty /= l; tz /= l;
    let Ax = ty * ref[2] - tz * ref[1];
    let Ay = tz * ref[0] - tx * ref[2];
    let Az = tx * ref[1] - ty * ref[0];
    const al = Math.hypot(Ax, Ay, Az) || 1;
    Ax /= al; Ay /= al; Az /= al;
    const Bx = Ay * tz - Az * ty;
    const By = Az * tx - Ax * tz;
    const Bz = Ax * ty - Ay * tx;
    out.push({ frame: [[Ax, Ay, Az], [Bx, By, Bz]] });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Tablas anatómicas (mundo; +Z frente, +Y arriba, +X izquierda)
// ---------------------------------------------------------------------------
const FRAME_Z = [[0, 0, 1], [1, 0, 0]]; // A = frente, B = izquierda

/** Interpolación lineal a trozos. `stations` ordenadas DESC por columna 0. */
function profAt(stations, v) {
  const n = stations.length;
  if (v >= stations[0][0]) return stations[0].slice(1);
  if (v <= stations[n - 1][0]) return stations[n - 1].slice(1);
  let i = 0;
  while (i < n - 2 && stations[i + 1][0] > v) i++;
  const a = stations[i], b = stations[i + 1];
  const k = (a[0] - v) / (a[0] - b[0]);
  return a.slice(1).map((x, j) => x + (b[j + 1] - x) * k);
}

// Torso→pelvis: UNA superficie continua de cuello (Y 1.45, ABIERTO, anillo
// coincidente con el basal del cuello de nyx_face) al REMATE de pelvis
// (Y 0.80, ABIERTO: hacia los muslos lo cierran las sillas de montar y el
// parche del perineo — nunca una tapa). bust/glute = pecho/glúteo gaussianos.
// Perfil anatómico de referencia: cintura avispa w 0.164 (Y 1.13), cadera
// máxima w 0.322 (Y 0.94) → busto:cintura:cadera ≈ 1.46:1:1.96.
// [y, rx, rzF, rzB, p, bust, glute]
const TORSO_PROF = [
  [1.450, 0.052, 0.050, 0.052, 2.00, 0.000, 0.000],
  [1.432, 0.070, 0.055, 0.059, 2.00, 0.000, 0.000],
  [1.414, 0.098, 0.068, 0.074, 2.05, 0.000, 0.000],
  [1.396, 0.122, 0.076, 0.082, 2.10, 0.000, 0.000],
  [1.378, 0.132, 0.080, 0.086, 2.10, 0.000, 0.000],
  [1.360, 0.136, 0.083, 0.089, 2.15, 0.000, 0.000],
  [1.342, 0.134, 0.084, 0.090, 2.15, 0.004, 0.000],
  [1.322, 0.128, 0.083, 0.089, 2.15, 0.013, 0.000],
  [1.300, 0.120, 0.081, 0.087, 2.10, 0.019, 0.000],
  [1.276, 0.112, 0.079, 0.084, 2.10, 0.015, 0.000],
  [1.252, 0.104, 0.075, 0.080, 2.05, 0.006, 0.000],
  [1.228, 0.097, 0.071, 0.076, 2.05, 0.000, 0.000],
  [1.204, 0.091, 0.068, 0.073, 2.00, 0.000, 0.000],
  [1.180, 0.086, 0.065, 0.070, 2.00, 0.000, 0.000],
  [1.156, 0.083, 0.063, 0.068, 2.00, 0.000, 0.000],
  [1.132, 0.082, 0.062, 0.067, 2.00, 0.000, 0.000],
  [1.108, 0.085, 0.063, 0.068, 2.00, 0.000, 0.000],
  [1.084, 0.091, 0.066, 0.071, 2.00, 0.000, 0.000],
  [1.060, 0.101, 0.070, 0.076, 2.00, 0.000, 0.000],
  [1.036, 0.116, 0.075, 0.082, 2.05, 0.000, 0.000],
  [1.012, 0.134, 0.080, 0.089, 2.05, 0.000, 0.004],
  [0.988, 0.150, 0.084, 0.096, 2.10, 0.000, 0.010],
  [0.964, 0.159, 0.086, 0.101, 2.10, 0.000, 0.016],
  [0.940, 0.161, 0.086, 0.103, 2.10, 0.000, 0.018],
  [0.916, 0.158, 0.084, 0.103, 2.10, 0.000, 0.018],
  [0.892, 0.154, 0.082, 0.101, 2.05, 0.000, 0.014],
  [0.868, 0.152, 0.079, 0.099, 2.00, 0.000, 0.010],
  [0.844, 0.153, 0.076, 0.098, 2.00, 0.000, 0.006],
  [0.822, 0.155, 0.074, 0.098, 2.00, 0.000, 0.004],
  [0.800, 0.156, 0.072, 0.098, 2.00, 0.000, 0.002],
];
// Anillos del torso: estaciones del perfil + filas extra en la banda del
// hombro (Y 1.348–1.378) para que la silueta del deltoides salga suave.
const TORSO_YS = [
  1.450, 1.432, 1.414, 1.396, 1.378, 1.370, 1.366, 1.360, 1.354, 1.348, 1.342,
  1.322, 1.300, 1.276, 1.252, 1.228, 1.204, 1.180, 1.156, 1.132, 1.108, 1.084,
  1.060, 1.036, 1.012, 0.988, 0.964, 0.940, 0.916, 0.892, 0.868, 0.844, 0.822, 0.800,
];

// Brazo en T-pose (izquierdo; el derecho se espeja). [x, top, bottom, wz, thumb]:
// top/bottom MONÓTONOS (top baja desde el deltoide; bottom baja hasta la
// muñeca y sube en la palma) → todo corte horizontal del brazo es un intervalo
// conexo y la excursión del anillo del torso nunca se rompe. La mano es una
// paleta plana (grosor 0.016–0.02) con abultamiento de pulgar en el borde
// frontal (x≈0.71) y dedos juntos hasta la punta x 0.785.
const ARM_PROF = [
  [0.785, 1.368, 1.352, 0.008, 0.000],
  [0.780, 1.368, 1.352, 0.018, 0.000],
  [0.735, 1.369, 1.351, 0.030, 0.008],
  [0.710, 1.370, 1.350, 0.040, 0.016],
  [0.680, 1.378, 1.344, 0.036, 0.002],
  [0.640, 1.386, 1.336, 0.026, 0.000],
  [0.550, 1.402, 1.338, 0.034, 0.000],
  [0.420, 1.424, 1.343, 0.040, 0.000],
  [0.300, 1.432, 1.345, 0.047, 0.000],
  [0.250, 1.436, 1.345, 0.049, 0.000],
  [0.200, 1.440, 1.346, 0.052, 0.000],
  [0.160, 1.443, 1.349, 0.055, 0.000],
  [0.130, 1.442, 1.352, 0.053, 0.000],
  [0.100, 1.438, 1.358, 0.044, 0.000],
  [0.080, 1.428, 1.372, 0.030, 0.000],
  [0.050, 1.400, 1.400, 0.001, 0.000],
];
function armAt(x) { return profAt(ARM_PROF, x); }
/** Presencia de la sección del brazo en (x, y): fracción de anchura 0..1. */
function armK(x, y) {
  const [top, bottom] = armAt(x);
  const ty = Math.max(1e-6, (top - bottom) / 2);
  const t = (y - (top + bottom) / 2) / ty;
  return t <= -1 || t >= 1 ? 0 : Math.sqrt(1 - t * t);
}
/** Extremo exterior del corte del brazo a altura y (−1 si no hay brazo). */
function armXOut(y) {
  let x = 0.785;
  while (x >= 0.05) {
    const [top, bottom] = armAt(x);
    if (top >= y && bottom <= y) return x;
    x -= 0.002;
  }
  return -1;
}
/** x del camino de la excursión en s (0 = fijación, 0.5 = punta). Nudos que
 *  concentran resolución en muñeca/mano; los que caen más allá de xOut se
 *  fusionan (sin puntos apilados en la punta). */
function excX(s, xAtt, xOut) {
  const raw = [
    [0, xAtt], [0.15, Math.min(xAtt + 0.05, xOut)], [0.25, Math.min(0.42, xOut)],
    [0.35, Math.min(0.64, xOut)], [0.5, xOut],
  ];
  const knots = [];
  for (const [ks, kx] of raw) {
    if (knots.length && kx - knots[knots.length - 1][1] < 1e-6) knots[knots.length - 1][0] = ks;
    else knots.push([ks, kx]);
  }
  let i = 0;
  while (i + 1 < knots.length && s > knots[i + 1][0]) i++;
  const [s0, x0] = knots[i];
  const [s1, x1] = knots[Math.min(i + 1, knots.length - 1)];
  return s1 === s0 ? x0 : x0 + (x1 - x0) * ((s - s0) / (s1 - s0));
}

// Pierna (izquierda; la derecha se espeja): [y, rx, aF, aB, zc]. Muslo esbelto
// con curva femenina, rodilla con rótula (aF), gemelo moldeado (aB), caña de
// bota, tobillo fino y bota con tacón bajo y puntera aerodinámica. El primer
// anillo (Y 0.80) es el ARO COMPARTIDO del muslo: lo cierra la silla de la
// pelvis (bifurcación continua, sin domos sueltos).
const LEG_PROF = [
  [0.800, 0.0725, 0.068, 0.074, 0.000],
  [0.760, 0.0700, 0.064, 0.070, 0.002],
  [0.700, 0.0640, 0.058, 0.064, 0.005],
  [0.640, 0.0580, 0.053, 0.058, 0.008],
  [0.560, 0.0530, 0.049, 0.053, 0.010],
  [0.480, 0.0500, 0.048, 0.051, 0.011],
  [0.440, 0.0540, 0.057, 0.052, 0.012],
  [0.400, 0.0520, 0.048, 0.056, 0.008],
  [0.340, 0.0460, 0.042, 0.050, 0.002],
  [0.280, 0.0390, 0.036, 0.041, -0.004],
  [0.220, 0.0360, 0.034, 0.037, -0.007],
  [0.150, 0.0300, 0.029, 0.031, -0.009],
  [0.105, 0.0270, 0.028, 0.032, -0.007],
  [0.062, 0.0270, 0.030, 0.036, -0.024],
  [0.030, 0.0270, 0.024, 0.010, -0.030],
  [0.026, 0.0280, 0.022, 0.010, 0.000],
  [0.022, 0.0290, 0.020, 0.010, 0.040],
  [0.018, 0.0260, 0.018, 0.009, 0.075],
  [0.016, 0.0120, 0.010, 0.006, 0.100],
];
// Ángulos ψ de los anillos de pierna: 21 puntos que corresponden 1:1 con la
// media silla de pelvis (interior-frontal → frontal → exterior → trasero →
// interior-trasero) + 3 puntos del arco interno (borde del perineo).
const LEG_PSIS = [
  135, 108, 81, 54, 46.3, 38.6, 30.9, 23.1, 15.4, 7.7, 0, -7.7, -15.4, -23.1,
  -30.9, -38.6, -46.3, -54, -81, -108, -135, -157.5, -180, -202.5,
].map((d) => (d * Math.PI) / 180);

// Cabeza anime: coronilla → barbilla en V suave (z desplaza el centro hacia
// el mentón). p > 2 aplana el plano facial (frente/mejillas suaves). nose =
// ampA del bump frontal (nariz sutil) en las filas de la línea nasal.
const HEAD_ROWS = [
  { y: 1.648, rx: 0.052, rzF: 0.055, rzB: 0.058, p: 2.00, z: 0.000 },
  { y: 1.630, rx: 0.078, rzF: 0.080, rzB: 0.086, p: 2.00, z: 0.000 },
  { y: 1.610, rx: 0.094, rzF: 0.094, rzB: 0.100, p: 2.05, z: 0.000 },
  { y: 1.588, rx: 0.102, rzF: 0.098, rzB: 0.104, p: 2.15, z: 0.000 },
  { y: 1.566, rx: 0.105, rzF: 0.098, rzB: 0.106, p: 2.30, z: 0.000 },
  { y: 1.545, rx: 0.105, rzF: 0.098, rzB: 0.106, p: 2.35, z: 0.000 }, // línea de ojos
  { y: 1.524, rx: 0.103, rzF: 0.097, rzB: 0.105, p: 2.35, z: 0.000 },
  { y: 1.503, rx: 0.099, rzF: 0.094, rzB: 0.102, p: 2.30, z: 0.001, nose: 0.005 },
  { y: 1.482, rx: 0.092, rzF: 0.088, rzB: 0.096, p: 2.20, z: 0.003, nose: 0.007 }, // pómulo
  { y: 1.462, rx: 0.080, rzF: 0.078, rzB: 0.086, p: 2.10, z: 0.006 },   // mejilla
  { y: 1.446, rx: 0.062, rzF: 0.064, rzB: 0.072, p: 2.05, z: 0.010 },  // mandíbula
  { y: 1.436, rx: 0.040, rzF: 0.048, rzB: 0.056, p: 2.00, z: 0.014 },  // mentón en V
];

/** Interpolación de parámetros de la cabeza por altura. */
function headParams(y) {
  let i = 0;
  while (i < HEAD_ROWS.length - 1 && HEAD_ROWS[i + 1].y > y) i++;
  const a = HEAD_ROWS[i];
  const b = HEAD_ROWS[Math.min(i + 1, HEAD_ROWS.length - 1)];
  const k = a.y === b.y ? 0 : clamp01((a.y - y) / (a.y - b.y));
  const lp = (x, z) => x + (z - x) * k;
  return {
    rx: lp(a.rx, b.rx), rzF: lp(a.rzF, b.rzF), p: lp(a.p, b.p), z: lp(a.z, b.z),
  };
}

/** Z de la superficie frontal de la cabeza en (x, y). */
function headFrontZ(x, y) {
  const hp = headParams(y);
  const t = Math.min(1, Math.abs(x) / hp.rx);
  const inner = Math.max(0, 1 - Math.pow(t, hp.p));
  return hp.z + hp.rzF * Math.pow(inner, 1 / hp.p);
}

// ---------------------------------------------------------------------------
// Skinning: falloff suave 1/(d²+SOFT) sobre segmentos óseos del mundo.
// ---------------------------------------------------------------------------
const SOFT = 0.005;

function distSeg(px, py, pz, a, b) {
  const ax = b[0] - a[0], ay = b[1] - a[1], az = b[2] - a[2];
  const len2 = ax * ax + ay * ay + az * az || 1e-12;
  let t = ((px - a[0]) * ax + (py - a[1]) * ay + (pz - a[2]) * az) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = px - (a[0] + ax * t), dy = py - (a[1] + ay * t), dz = pz - (a[2] + az * t);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function falloff(d) {
  return 1 / (d * d + SOFT);
}

// [hueso, desde, hasta] en mundo. Muslos a lo largo del fémur (Y 0.86→0.46),
// espinillas hasta el tobillo, pies/dedos hasta la puntera de la bota; brazos
// siguiendo la banda del hombro (Y 1.336–1.443) hasta la punta de la mano.
const SEGS = [
  [HIPS, [0, 0.90, 0], [0, 0.78, 0]],
  [SPINE, [0, 1.12, 0], [0, 0.90, 0]],
  [CHEST, [0, 1.34, 0], [0, 1.12, 0]],
  [NECK, [0, 1.45, 0], [0, 1.34, 0]],
  [HEAD, [0, 1.64, 0], [0, 1.45, 0]],
  [CLAV_L, [0.05, 1.40, 0], [0, 1.34, 0]],
  [CLAV_R, [-0.05, 1.40, 0], [0, 1.34, 0]],
  [8, [0.16, 1.40, 0], [0.42, 1.383, 0]],       // upperArm_L
  [11, [-0.16, 1.40, 0], [-0.42, 1.383, 0]],    // upperArm_R
  [9, [0.42, 1.383, 0], [0.64, 1.361, 0]],       // forearm_L
  [12, [-0.42, 1.383, 0], [-0.64, 1.361, 0]],    // forearm_R
  [10, [0.785, 1.360, 0], [0.64, 1.361, 0]],     // hand_L (hasta la punta)
  [13, [-0.785, 1.360, 0], [-0.64, 1.361, 0]],
  [14, [0.09, 0.86, 0], [0.09, 0.46, 0]],        // thigh_L
  [16, [-0.09, 0.86, 0], [-0.09, 0.46, 0]],
  [15, [0.09, 0.46, 0], [0.09, 0.10, 0]],        // shin_L
  [17, [-0.09, 0.46, 0], [-0.09, 0.10, 0]],
  [FOOT_L, [0.09, 0.03, 0.055], [0.09, 0.10, 0]],
  [FOOT_R, [-0.09, 0.03, 0.055], [-0.09, 0.10, 0]],
  [TOE_L, [0.09, 0.02, 0.10], [0.09, 0.045, 0.02]],
  [TOE_R, [-0.09, 0.02, 0.10], [-0.09, 0.045, 0.02]],
];

function topWeights(cands) {
  const scored = cands
    .map(([bone, d]) => [bone, falloff(d)])
    .filter(([, w]) => isFinite(w) && w > 0);
  if (scored.length === 0) return [[HIPS, 1]];
  scored.sort((a, b) => b[1] - a[1]);
  const picked = scored.slice(0, 4);
  const sum = picked.reduce((s, [, w]) => s + w, 0);
  if (!isFinite(sum) || sum <= 0) return [[HIPS, 1]];
  return picked.map(([bone, w]) => [bone, w / sum]);
}

function bodyWeights(x, y, z) {
  const cands = [];
  for (const [bone, a, b] of SEGS) cands.push([bone, distSeg(x, y, z, a, b)]);
  return topWeights(cands);
}

/**
 * nyx_face: la cabeza sigue al 100% al hueso `head`; el tubo del cuello usa
 * `bodyWeights` en su anillo basal (idéntico al cuello del torso → soldadura
 * perfecta sin desgarros) y funde hacia `head` al subir.
 */
function faceWeights(x, y, z) {
  const r = Math.hypot(x, z);
  if (y < 1.449 || r > 0.053) return [[HEAD, 1]];
  if (y < 1.462) return bodyWeights(x, y, z);
  const k = smooth01((y - 1.462) / 0.043);
  return [[NECK, 1 - k], [HEAD, k]];
}

/** Empaqueta pesos en JOINTS_0 (U16 x4) + WEIGHTS_0 (F32 x4, sum === 1). */
function packWeights(vcount, positionView, weightFn) {
  const joints = new Uint16Array(vcount * 4);
  const weights = new Float32Array(vcount * 4);
  for (let v = 0; v < vcount; v++) {
    const x = positionView[v * 3], y = positionView[v * 3 + 1], z = positionView[v * 3 + 2];
    const pairs = weightFn(x, y, z);
    for (let k = 0; k < 4; k++) {
      const [bone, w] = pairs[k] || [0, 0];
      joints[v * 4 + k] = bone;
      weights[v * 4 + k] = w;
    }
    let sum = weights[v * 4] + weights[v * 4 + 1] + weights[v * 4 + 2] + weights[v * 4 + 3];
    if (!isFinite(sum) || sum <= 0) {
      joints[v * 4] = HIPS; weights[v * 4] = 1;
      weights[v * 4 + 1] = weights[v * 4 + 2] = weights[v * 4 + 3] = 0;
      sum = 1;
    }
    weights[v * 4] = f32(weights[v * 4] + (1 - sum));
    const again = weights[v * 4] + weights[v * 4 + 1] + weights[v * 4 + 2] + weights[v * 4 + 3];
    if (again !== 1) weights[v * 4] = f32(weights[v * 4] + (1 - again));
  }
  return { joints, weights };
}

function f32(v) {
  const out = new Float32Array(1);
  out[0] = v;
  return out[0];
}

function smoothNormals(positions, indices) {
  const vcount = positions.length / 3;
  const normals = new Float32Array(vcount * 3);
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const i of [a, b, c]) {
      normals[i] += nx; normals[i + 1] += ny; normals[i + 2] += nz;
    }
  }
  for (let v = 0; v < vcount; v++) {
    const i = v * 3;
    const l = Math.hypot(normals[i], normals[i + 1], normals[i + 2]);
    if (l > 1e-12) {
      normals[i] /= l; normals[i + 1] /= l; normals[i + 2] /= l;
    } else {
      normals[i] = 0; normals[i + 1] = 1; normals[i + 2] = 0;
    }
  }
  return normals;
}

function finishPart(mb, name, weightFn) {
  const positions = new Float32Array(mb.pos);
  const indices = new Uint16Array(mb.idx);
  const normals = smoothNormals(positions, indices);
  const { joints, weights } = packWeights(positions.length / 3, positions, weightFn);
  return { name, positions, normals, joints, weights, indices };
}

// ---------------------------------------------------------------------------
// nyx_body: bifurcación orgánica continua (sin tubos ni domos sueltos)
// ---------------------------------------------------------------------------
// El torso NO termina en una tapa: su aro de pelvis (Y 0.80) se cierra hacia
// cada muslo con una "silla de montar" (banda que abraza el aro COMPARTIDO
// del muslo) y el hueco restante entre ambos muslos lo tapa el parche del
// perineo (vértices compartidos con los aros de muslo) → UNA silueta continua
// sin bolas ni costuras en la ingle. Los brazos nacen igual: cada anillo del
// torso lleva una "excursión" que reemplaza su arco lateral por la superficie
// real del brazo (cresta del deltoides → paleta plana de la mano), soldando
// hombro y brazo en la misma malla.

function lerp3(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Punto del óvalo del torso (con lóbulos de pecho/glúteo) en ángulo phi. */
function ovalPoint(row, phi) {
  const [su, sv] = super2(phi, row.p);
  const a = su >= 0 ? row.rzF : row.rzB;
  let z = su * a;
  if (row.bust) z += row.bust * (angGauss(phi, 0.42, 0.5) + angGauss(phi, -0.42, 0.5));
  if (row.glute) z -= row.glute * (angGauss(phi, Math.PI - 0.55, 0.42) + angGauss(phi, Math.PI + 0.55, 0.42));
  return [sv * row.rx, row.y, z + (row.zOff || 0)];
}

/** Fila del torso a altura y (interpolada del perfil medido). */
function torsoRow(y) {
  const [rx, rzF, rzB, p, bust, glute] = profAt(TORSO_PROF, y);
  return { y, rx, rzF, rzB, p, bust, glute };
}

/** 13 puntos de la excursión del brazo sobre el arco lateral del anillo
 *  (phiA→phiB, punta en i=7). Sin brazo a esa altura quedan sobre el óvalo. */
function armExcursion(row, side) {
  const out = [];
  const phiA = side > 0 ? 0.942 : 4.084;
  const phiB = side > 0 ? 2.199 : 5.341;
  const xOut = armXOut(row.y);
  for (let i = 1; i <= 13; i++) {
    const s = i / 14;
    const arc = ovalPoint(row, phiA + (phiB - phiA) * s);
    let p = arc;
    let ref = [0, row.y, 0];
    if (xOut > 0 && xOut > Math.abs(arc[0]) + 0.004) {
      const x = excX(s < 0.5 ? s : 1 - s, Math.abs(arc[0]), xOut);
      const k = armK(x, row.y);
      const st = armAt(x);
      const yc = (st[0] + st[1]) / 2;
      let w;
      if (i === 7) {
        w = smooth01((xOut - Math.abs(arc[0]) - 0.008) / 0.03);
        p = lerp3(arc, [side * x, row.y, 0], w);
      } else {
        const edge = (s < 0.5 ? st[2] + st[3] : st[2]) * k;
        const armP = [side * x, row.y, s < 0.5 ? edge : -edge];
        w = smooth01(k / 0.06);
        p = lerp3(arc, armP, w);
      }
      ref = lerp3([0, row.y, 0], [side * x, yc, 0], w);
    }
    out.push({ p, ref });
  }
  return out;
}

/** Anillo del torso (40 pts): 14 de óvalo + 13+13 de excursión de brazos. */
function torsoRing(mb, row) {
  const idx = [], refs = [];
  const oval = (s) => {
    const p = ovalPoint(row, (s / 20) * Math.PI * 2);
    idx.push(mb.vert(p[0], p[1], p[2]));
    refs.push([0, row.y, 0]);
  };
  for (const s of [0, 1, 2, 3]) oval(s);
  for (const q of armExcursion(row, 1)) {
    idx.push(mb.vert(q.p[0], q.p[1], q.p[2]));
    refs.push(q.ref);
  }
  for (let s = 7; s <= 13; s++) oval(s);
  for (const q of armExcursion(row, -1)) {
    idx.push(mb.vert(q.p[0], q.p[1], q.p[2]));
    refs.push(q.ref);
  }
  for (const s of [17, 18, 19]) oval(s);
  return { idx, refs };
}

/** Conecta anillos consecutivos {idx,refs} con quads (winding auto por ref). */
function loftRings(mb, rings) {
  for (let r = 0; r + 1 < rings.length; r++) {
    const A = rings[r], B = rings[r + 1];
    const n = A.idx.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const fx = (A.refs[i][0] + A.refs[j][0] + B.refs[i][0] + B.refs[j][0]) / 4;
      const fy = (A.refs[i][1] + A.refs[j][1] + B.refs[i][1] + B.refs[j][1]) / 4;
      const fz = (A.refs[i][2] + A.refs[j][2] + B.refs[i][2] + B.refs[j][2]) / 4;
      mb.tri(A.idx[i], B.idx[i], B.idx[j], fx, fy, fz);
      mb.tri(A.idx[i], B.idx[j], A.idx[j], fx, fy, fz);
    }
  }
}

/** Anillo de pierna (24 pts): ψ 135°→−135° es la silla (21 pts que casan 1:1
 *  con la media silla de pelvis) y −157.5°→−202.5° el arco interno del
 *  perineo. A = frente, B = lateral exterior. */
function legRing(mb, st, frame, side) {
  const [A, B] = frame;
  const idx = [], refs = [];
  for (const psi of LEG_PSIS) {
    const sp = Math.sin(psi), cp = Math.cos(psi);
    const a = sp >= 0 ? st.aF : st.aB;
    idx.push(mb.vert(
      side * 0.09 + B[0] * st.rx * cp + A[0] * a * sp,
      st.y + B[1] * st.rx * cp + A[1] * a * sp,
      st.zc + B[2] * st.rx * cp + A[2] * a * sp
    ));
    refs.push([side * 0.09, st.y, st.zc]);
  }
  return { idx, refs };
}

const THIGH_RIM = { y: 0.80, rx: 0.0725, aF: 0.068, aB: 0.074, zc: 0 };

/** Silla de pelvis: banda que une la media circunferencia del aro de pelvis
 *  con el aro compartido del muslo → bifurcación continua, sin domos. */
function buildPelvisJoin(mb, rimRing) {
  const out = [];
  for (const side of [1, -1]) {
    const half = side > 0
      ? rimRing.idx.slice(0, 21)
      : [rimRing.idx[0], rimRing.idx[39], rimRing.idx[38], rimRing.idx[37],
        ...Array.from({ length: 13 }, (_, k) => rimRing.idx[36 - k]),
        rimRing.idx[23], rimRing.idx[22], rimRing.idx[21], rimRing.idx[20]];
    const ring = legRing(mb, THIGH_RIM, [[0, 0, 1], [side, 0, 0]], side);
    for (let i = 0; i < 20; i++) {
      mb.tri(half[i], half[i + 1], ring.idx[i + 1], side * 0.045, 0.85, 0);
      mb.tri(half[i], ring.idx[i + 1], ring.idx[i], side * 0.045, 0.85, 0);
    }
    out.push(ring);
  }
  return out;
}

/** Perineo: parche 5×7 entre los arcos internos de ambos muslos (vértices
 *  COMPARTIDOS con los aros de muslo) + ventanas frontal/trasera hasta el
 *  aro de pelvis → cierre estanco de la bifurcación. */
function buildPerineum(mb, rimRing, thighRims) {
  const [L, R] = thighRims;
  const rows = [
    { ring: 0, psi: 135, cy: 0.790 },
    { ring: 23, psi: -202.5, cy: 0.778 },
    { ring: 22, psi: -180, cy: 0.774 },
    { ring: 21, psi: -157.5, cy: 0.776 },
    { ring: 20, psi: -135, cy: 0.782 },
  ].map((r) => {
    const psi = (r.psi * Math.PI) / 180;
    const sp = Math.sin(psi), cp = Math.cos(psi);
    return {
      li: L.idx[r.ring], ri: R.idx[r.ring],
      xEnd: 0.09 + THIGH_RIM.rx * cp,
      z: (sp >= 0 ? THIGH_RIM.aF : THIGH_RIM.aB) * sp,
      cy: r.cy,
    };
  });
  const grid = rows.map((row) => {
    const col = [row.li];
    for (let c = 1; c < 6; c++) {
      const t = c / 6;
      col.push(mb.vert(
        row.xEnd * (1 - 2 * t),
        0.80 + (row.cy - 0.80) * (1 - Math.abs(2 * t - 1)),
        row.z
      ));
    }
    col.push(row.ri);
    return col;
  });
  for (let r = 0; r < 4; r++) {
    const z = (rows[r].z + rows[r + 1].z) / 2;
    for (let c = 0; c < 6; c++) {
      mb.tri(grid[r][c], grid[r][c + 1], grid[r + 1][c + 1], 0, 0.82, z);
      mb.tri(grid[r][c], grid[r + 1][c + 1], grid[r + 1][c], 0, 0.82, z);
    }
  }
  for (let c = 0; c < 6; c++) {
    mb.tri(rimRing.idx[0], grid[0][c + 1], grid[0][c], 0, 0.85, 0.05);
    mb.tri(rimRing.idx[20], grid[4][c], grid[4][c + 1], 0, 0.85, -0.05);
  }
}

/** Pierna: loft del aro compartido del muslo → rodilla → gemelo → bota. */
function buildLeg(mb, side, thighRim) {
  const path = LEG_PROF.map(([y, , , , zc]) => ({ c: [side * 0.09, y, zc] }));
  const frames = pathFrames(path, [1, 0, 0]);
  const rings = [thighRim];
  for (let i = 1; i < LEG_PROF.length; i++) {
    const [y, rx, aF, aB, zc] = LEG_PROF[i];
    const f = frames[i].frame;
    rings.push(legRing(mb, { y, rx, aF, aB, zc }, [f[0], [side * f[1][0], f[1][1], f[1][2]]], side));
  }
  loftRings(mb, rings);
  // Puntera aerodinámica.
  const last = path[path.length - 1].c;
  const prev = path[path.length - 2].c;
  const tx = last[0] - prev[0], ty = last[1] - prev[1], tz = last[2] - prev[2];
  const tl = Math.hypot(tx, ty, tz) || 1;
  const tip = mb.vert(last[0] + (tx / tl) * 0.02, last[1] + (ty / tl) * 0.02, last[2] + (tz / tl) * 0.02);
  const ring = rings[rings.length - 1];
  for (let i = 0; i < ring.idx.length; i++) {
    const j = (i + 1) % ring.idx.length;
    mb.tri(ring.idx[i], tip, ring.idx[j], side * 0.09, 0.05, 0.09);
  }
}

function buildBody() {
  const mb = new MeshBuilder();
  const rings = TORSO_YS.map((y) => torsoRing(mb, torsoRow(y)));
  loftRings(mb, rings);
  const rim = rings[rings.length - 1];
  const thighRims = buildPelvisJoin(mb, rim);
  buildPerineum(mb, rim, thighRims);
  buildLeg(mb, 1, thighRims[0]);
  buildLeg(mb, -1, thighRims[1]);
  return finishPart(mb, 'nyx_body', bodyWeights);
}

// ---------------------------------------------------------------------------
// nyx_face: cabeza anime + cuello integrado
// ---------------------------------------------------------------------------
function buildFace() {
  const mb = new MeshBuilder();

  // Cabeza: casquete de coronilla arriba y barbilla en V abajo (el path
  // final baja hacia +Z → mentón fino y adelantado) + nariz sutil.
  loft(mb, {
    segs: 20,
    rings: HEAD_ROWS.map((row) => ({
      c: [0, row.y, row.z],
      aF: row.rzF, aB: row.rzB, b: row.rx, p: row.p,
      bumps: row.nose ? [{ phi: 0, sig: 0.16, ampA: row.nose }] : undefined,
      frame: FRAME_Z,
    })),
    capStart: { mode: 'dome', depth: 0.014 },
    capEnd: { mode: 'point', depth: 0.016 },
  });

  // Cuello: anillos de torsoRing → el aro basal (Y 1.450) es IDÉNTICO al aro
  // superior del torso (misma fórmula y parámetros) → soldadura perfecta;
  // arriba queda oculto dentro de la mandíbula.
  loftRings(mb, [
    torsoRing(mb, { y: 1.450, rx: 0.052, rzF: 0.050, rzB: 0.052, p: 2.0, zOff: 0 }),
    torsoRing(mb, { y: 1.480, rx: 0.050, rzF: 0.048, rzB: 0.050, p: 2.0, zOff: -0.006 }),
    torsoRing(mb, { y: 1.505, rx: 0.048, rzF: 0.046, rzB: 0.048, p: 2.0, zOff: -0.010 }),
  ]);

  return finishPart(mb, 'nyx_face', faceWeights);
}

// ---------------------------------------------------------------------------
// nyx_eyes: ojos almendrados expresivos sobre el plano facial
// ---------------------------------------------------------------------------
function buildEyes() {
  const mb = new MeshBuilder();
  const NU = 8, NV = 6;
  for (const side of [1, -1]) {
    const cx = side * 0.043, cy = 1.522, hw = 0.018, hh = 0.017;
    const grid = [];
    for (let i = 0; i <= NU; i++) {
      const u = (i / NU) * 2 - 1;
      const vmax = Math.pow(Math.max(0, 1 - u * u), 0.72);
      const col = [];
      for (let j = 0; j <= NV; j++) {
        const v = (j / NV) * 2 - 1;
        const x = cx + u * hw;
        // Comisura exterior ligeramente elevada (gesto anime).
        const y = cy + v * vmax * hh + u * side * 0.003;
        // Lente convexa: flota 4.5 mm sobre la cara y abomba 7.5 mm al centro.
        const z = headFrontZ(x, y) + 0.0045 + 0.0075 * (1 - u * u) * (1 - v * v) * vmax;
        col.push(mb.vert(x, y, z, [[HEAD, 1]]));
      }
      grid.push(col);
    }
    const rz = headFrontZ(cx, cy) - 0.05;
    for (let i = 0; i < NU; i++) {
      for (let j = 0; j < NV; j++) {
        mb.tri(grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], cx, cy, rz);
        mb.tri(grid[i][j], grid[i + 1][j + 1], grid[i][j + 1], cx, cy, rz);
      }
    }
  }
  return finishPart(mb, 'nyx_eyes', () => [[HEAD, 1]]);
}

// ---------------------------------------------------------------------------
// nyx_hair: melena 3D estilizada con volumen real (casquete + flequillos + 7
// mechones), encadenada a hair_1 → hair_2 → hair_3 → hair_4.
// ---------------------------------------------------------------------------
function buildVolumetricHair() {
  const pos = [];
  const idx = [];
  const jnt = [];
  const wgt = [];

  const pushVert = (x, y, z, pairs) => {
    const vi = pos.length / 3;
    pos.push(x, y, z);
    let s = 0;
    const p = [0, 0, 0, 0], w = [0, 0, 0, 0];
    for (let k = 0; k < Math.min(4, pairs.length); k++) {
      p[k] = pairs[k][0];
      w[k] = pairs[k][1];
      s += w[k];
    }
    if (s <= 0) { p[0] = HEAD; w[0] = 1; s = 1; }
    for (let k = 0; k < 4; k++) {
      jnt.push(p[k]);
      wgt.push(w[k] / s);
    }
    return vi;
  };

  // 1. Casquete craneal cerrado con volumen redondeado: cubre coronilla,
  // laterales y baja suave por detrás hasta la nuca, despejando el rostro.
  const cx = 0, cy = 1.548, cz = -0.008;
  const rx = 0.112, ry = 0.112, rz = 0.118;
  const rings = 16, segs = 24;
  const capGrid = [];
  for (let r = 0; r <= rings; r++) {
    const v = r / rings;
    const row = [];
    for (let s = 0; s <= segs; s++) {
      const u = s / segs;
      const theta = u * Math.PI * 2;
      const back = (1 - Math.cos(theta)) / 2; // 0 = frente, 1 = nuca
      const phi = v * Math.PI * (0.68 + 0.18 * back);
      let px = cx + Math.sin(phi) * Math.sin(theta) * rx;
      let py = cy + Math.cos(phi) * ry;
      let pz = cz + Math.sin(phi) * Math.cos(theta) * rz;
      // Faldón de nuca: el borde trasero se abomba hacia atrás.
      pz -= back * v * v * 0.045;
      // Despeja el rostro por delante.
      if (pz > 0.025 && py < 1.58) {
        const lift = (pz - 0.025) * 1.1;
        py = Math.max(py, 1.56 + lift * 0.35);
      }
      row.push(pushVert(px, py, pz, [[HEAD, 1]]));
    }
    capGrid.push(row);
  }
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segs; s++) {
      const a = capGrid[r][s], b = capGrid[r + 1][s];
      const c = capGrid[r + 1][s + 1], d = capGrid[r][s + 1];
      idx.push(a, b, c, a, c, d);
    }
  }

  // Mechones 3D redondeados (Bezier cúbica + 12 lados) con cadena de pesos
  // head → hair_1 → hair_2 → hair_3 → hair_4 para el látigo de 4 eslabones.
  const addStrand = (ctrlPts, radX, radZ, ringsCount, usePhysics) => {
    const sides = 12;
    const ringVerts = [];

    const profileAt = (t) => {
      const base = Math.pow(Math.sin(t * Math.PI * 0.88 + 0.25), 0.7);
      if (t > 0.86) return base + (0.18 - base) * ((t - 0.86) / 0.14);
      return base;
    };

    const evalCurve = (t) => {
      if (ctrlPts.length === 3) {
        const u = 1 - t;
        const [p0, p1, p2] = ctrlPts;
        return [
          u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
          u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
          u * u * p0[2] + 2 * u * t * p1[2] + t * t * p2[2],
        ];
      }
      const u = 1 - t;
      const u2 = u * u, t2 = t * t;
      const b0 = u2 * u, b1 = 3 * u2 * t, b2 = 3 * u * t2, b3 = t2 * t;
      const [p0, p1, p2, p3] = ctrlPts;
      return [
        b0 * p0[0] + b1 * p1[0] + b2 * p2[0] + b3 * p3[0],
        b0 * p0[1] + b1 * p1[1] + b2 * p2[1] + b3 * p3[1],
        b0 * p0[2] + b1 * p1[2] + b2 * p2[2] + b3 * p3[2],
      ];
    };

    const evalWeights = (t) => {
      if (!usePhysics || t <= 0.12) return [[HEAD, 1]];
      if (t <= 0.38) {
        const k = (t - 0.12) / 0.26;
        return [[HEAD, 1 - k], [HAIR1, k]];
      }
      if (t <= 0.60) {
        const k = (t - 0.38) / 0.22;
        return [[HAIR1, 1 - k], [HAIR2, k]];
      }
      if (t <= 0.80) {
        const k = (t - 0.60) / 0.20;
        return [[HAIR2, 1 - k], [HAIR3, k]];
      }
      const k = Math.min(1, (t - 0.80) / 0.20);
      return [[HAIR3, 1 - k], [HAIR4, k]];
    };

    for (let r = 0; r <= ringsCount; r++) {
      const t = r / ringsCount;
      const [px, py, pz] = evalCurve(t);
      const profile = profileAt(t);
      const wx = radX * profile;
      const wz = radZ * profile;
      const pairs = evalWeights(t);
      const row = [];
      for (let s = 0; s < sides; s++) {
        const ang = (s / sides) * Math.PI * 2;
        row.push(pushVert(px + Math.cos(ang) * wx, py, pz + Math.sin(ang) * wz, pairs));
      }
      ringVerts.push(row);
    }

    // Tapa raíz
    const [rx0, ry0, rz0] = evalCurve(0);
    const rootCenter = pushVert(rx0, ry0 + 0.01, rz0, evalWeights(0));
    for (let s = 0; s < sides; s++) {
      idx.push(rootCenter, ringVerts[0][(s + 1) % sides], ringVerts[0][s]);
    }
    // Cuerpo
    for (let r = 0; r < ringsCount; r++) {
      for (let s = 0; s < sides; s++) {
        const sn = (s + 1) % sides;
        const a = ringVerts[r][s], b = ringVerts[r + 1][s];
        const c = ringVerts[r + 1][sn], d = ringVerts[r][sn];
        idx.push(a, b, c, a, c, d);
      }
    }
    // Punta roma redondeada
    const [ex, ey, ez] = evalCurve(1);
    const [prevX, prevY, prevZ] = evalCurve(1 - 1 / ringsCount);
    let tanX = ex - prevX, tanY = ey - prevY, tanZ = ez - prevZ;
    const tanL = Math.hypot(tanX, tanY, tanZ) || 1e-9;
    const lastRow = ringVerts[ringsCount];
    const lastWx = radX * profileAt(1);
    const tipR = lastWx * 1.1;
    const tipVert = pushVert(
      ex + (tanX / tanL) * tipR,
      ey + (tanY / tanL) * tipR,
      ez + (tanZ / tanL) * tipR,
      evalWeights(1)
    );
    for (let s = 0; s < sides; s++) {
      idx.push(lastRow[s], tipVert, lastRow[(s + 1) % sides]);
    }
  };

  // 2. Flequillos laterales redondeados enmarcando la cara (ligados a HEAD)
  for (const side of [-1, 1]) {
    addStrand([
      [side * 0.072, 1.59, 0.045],
      [side * 0.095, 1.49, 0.062],
      [side * 0.086, 1.37, 0.046],
    ], 0.028, 0.022, 12, false);
  }

  // 3. 7 mechones traseros volumétricos (física hair_1 → hair_2 → hair_3 →
  //    hair_4). Nacen DENTRO del casquete y abomban hacia atrás con caída
  //    natural; las puntas entran en el territorio de hair_4 para el latigazo.
  const backStrands = [
    { x: 0.000, len: 1.02, zOut: -0.155, rx: 0.056, rz: 0.055, rootY: 1.615, rootZ: -0.055 },
    { x: -0.046, len: 1.07, zOut: -0.148, rx: 0.050, rz: 0.051, rootY: 1.605, rootZ: -0.060 },
    { x: 0.046, len: 1.07, zOut: -0.148, rx: 0.050, rz: 0.051, rootY: 1.605, rootZ: -0.060 },
    { x: -0.086, len: 1.14, zOut: -0.130, rx: 0.044, rz: 0.048, rootY: 1.590, rootZ: -0.068 },
    { x: 0.086, len: 1.14, zOut: -0.130, rx: 0.044, rz: 0.048, rootY: 1.590, rootZ: -0.068 },
    { x: -0.114, len: 1.24, zOut: -0.095, rx: 0.038, rz: 0.045, rootY: 1.575, rootZ: -0.075 },
    { x: 0.114, len: 1.24, zOut: -0.095, rx: 0.038, rz: 0.045, rootY: 1.575, rootZ: -0.075 },
  ];
  for (const st of backStrands) {
    const midY = (1.58 + st.len) * 0.5;
    addStrand([
      [st.x * 0.55, st.rootY, st.rootZ],
      [st.x * 0.95, 1.49, st.zOut - 0.020],
      [st.x * 1.12, midY, st.zOut - 0.045],
      [st.x * 1.02, st.len, st.zOut + 0.010],
    ], st.rx, st.rz, 16, true);
  }

  const positions = new Float32Array(pos);
  const indices = new Uint16Array(idx);
  const normals = smoothNormals(positions, indices);
  const joints = new Uint16Array(jnt);
  const weights = new Float32Array(wgt);
  return { name: 'nyx_hair', positions, normals, joints, weights, indices };
}

// ---------------------------------------------------------------------------
// GLB writing
// ---------------------------------------------------------------------------
function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function hexToFactor(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b), 1];
}

function buildGLB(parts) {
  const gltf = {
    asset: { version: '2.0', generator: 'build_nyx_rigged.mjs' },
    scene: 0,
    scenes: [{ name: 'Scene', nodes: [] }],
    nodes: [],
    meshes: [],
    materials: [],
    skins: [],
    accessors: [],
    bufferViews: [],
  };
  const bins = [];
  let binLen = 0;
  const pushBin = (arr) => {
    const pad = (4 - (binLen % 4)) % 4;
    if (pad) { bins.push(Buffer.alloc(pad)); binLen += pad; }
    const b = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
    bins.push(b);
    gltf.bufferViews.push({ buffer: 0, byteOffset: binLen, byteLength: b.length });
    binLen += b.length;
    return gltf.bufferViews.length - 1;
  };

  // --- Skeleton nodes (0..24) ---
  const children = BONES.map(() => []);
  BONES.forEach((b, i) => { if (b.parent >= 0) children[b.parent].push(i); });
  BONES.forEach((b, i) => {
    const node = { name: b.name, translation: [...b.t] };
    if (children[i].length) node.children = children[i];
    gltf.nodes.push(node);
  });
  const jointNodeIndices = BONES.map((_, i) => i);

  // --- inverseBindMatrices: identidad trasladada a -worldPos (column-major) ---
  const ibm = new Float32Array(BONES.length * 16);
  BONES.forEach((_, i) => {
    const o = i * 16;
    ibm[o] = 1; ibm[o + 5] = 1; ibm[o + 10] = 1; ibm[o + 15] = 1;
    ibm[o + 12] = -B[i][0]; ibm[o + 13] = -B[i][1]; ibm[o + 14] = -B[i][2];
  });
  const ibmView = pushBin(ibm);
  const ibmAcc = gltf.accessors.push({
    bufferView: ibmView, componentType: 5126, count: BONES.length, type: 'MAT4',
  }) - 1;

  gltf.skins.push({ joints: jointNodeIndices, inverseBindMatrices: ibmAcc });

  // --- Mesh parts ---
  parts.forEach((part) => {
    const vcount = part.positions.length / 3;
    const posView = pushBin(part.positions);
    const nrmView = pushBin(part.normals);
    const jntView = pushBin(part.joints);
    const wgtView = pushBin(part.weights);
    const idxView = pushBin(part.indices);

    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let v = 0; v < vcount; v++) {
      for (let k = 0; k < 3; k++) {
        const val = part.positions[v * 3 + k];
        if (val < min[k]) min[k] = val;
        if (val > max[k]) max[k] = val;
      }
    }
    const posAcc = gltf.accessors.push({
      bufferView: posView, componentType: 5126, count: vcount, type: 'VEC3', min, max,
    }) - 1;
    const nrmAcc = gltf.accessors.push({
      bufferView: nrmView, componentType: 5126, count: vcount, type: 'VEC3',
    }) - 1;
    const jntAcc = gltf.accessors.push({
      bufferView: jntView, componentType: 5123, count: vcount, type: 'VEC4',
    }) - 1;
    const wgtAcc = gltf.accessors.push({
      bufferView: wgtView, componentType: 5126, count: vcount, type: 'VEC4',
    }) - 1;
    const idxAcc = gltf.accessors.push({
      bufferView: idxView, componentType: 5123, count: part.indices.length, type: 'SCALAR',
    }) - 1;

    const mat = gltf.materials.push({
      name: part.name + '_mat',
      pbrMetallicRoughness: {
        baseColorFactor: hexToFactor(PART_COLORS[part.name]),
        metallicFactor: 0,
        roughnessFactor: 0.9,
      },
      doubleSided: true,
    }) - 1;
    const meshIdx = gltf.meshes.push({
      name: part.name,
      primitives: [{
        attributes: { POSITION: posAcc, NORMAL: nrmAcc, JOINTS_0: jntAcc, WEIGHTS_0: wgtAcc },
        indices: idxAcc, material: mat, mode: 4,
      }],
    }) - 1;
    const nodeIdx = gltf.nodes.push({ name: part.name, mesh: meshIdx, skin: 0 }) - 1;
    gltf.scenes[0].nodes.push(nodeIdx);
  });
  gltf.scenes[0].nodes.unshift(0); // hips skeleton root

  gltf.buffers = [{ byteLength: binLen }];

  const jsonBuf = Buffer.from(JSON.stringify(gltf), 'utf8');
  const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
  const jsonChunk = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)]);
  const binParts = [...bins];
  const binPad = (4 - (binLen % 4)) % 4;
  if (binPad) binParts.push(Buffer.alloc(binPad));
  const binChunk = Buffer.concat(binParts);

  const total = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
  const out = Buffer.alloc(total);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jsonChunk.length, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  jsonChunk.copy(out, 20);
  const binHeader = 20 + jsonChunk.length;
  out.writeUInt32LE(binChunk.length, binHeader);
  out.writeUInt32LE(0x004e4942, binHeader + 4);
  binChunk.copy(out, binHeader + 8);
  return out;
}

// ---------------------------------------------------------------------------
// GLB parsing (para verify)
// ---------------------------------------------------------------------------
function parseGLB(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('Not a GLB file: ' + file);
  if (buf.readUInt32LE(4) !== 2) throw new Error('Unsupported GLB version');
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  let bin = null;
  const off = 20 + jsonLen;
  if (off + 8 <= buf.length && buf.readUInt32LE(off + 4) === 0x004e4942) {
    const binLen = buf.readUInt32LE(off);
    bin = buf.subarray(off + 8, off + 8 + binLen);
  }
  if (!bin) throw new Error('GLB has no BIN chunk');
  return { json, bin };
}

function readAccessor(gltf, bin, accessorIndex) {
  const acc = gltf.accessors[accessorIndex];
  const bv = gltf.bufferViews[acc.bufferView];
  const base = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const off = bin.byteOffset + base;
  const num = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[acc.type];
  if (acc.componentType === 5126) return new Float32Array(bin.buffer, off, acc.count * num);
  if (acc.componentType === 5125) return new Uint32Array(bin.buffer, off, acc.count * num);
  if (acc.componentType === 5123) return new Uint16Array(bin.buffer, off, acc.count * num);
  throw new Error('Unsupported componentType ' + acc.componentType);
}

// ---------------------------------------------------------------------------
// Verification: re-parse the written GLB and validate the 25-bone skin.
// ---------------------------------------------------------------------------
function verify(file) {
  const { json: gltf, bin } = parseGLB(file);
  const problems = [];
  const expect = (cond, msg) => { if (!cond) problems.push(msg); };
  const NB = BONES.length; // 25

  expect(gltf.skins?.length === 1, 'skins.length !== 1');
  const skin = gltf.skins[0];
  expect(skin.joints.length === NB, `skin.joints.length !== ${NB}`);
  expect(new Set(skin.joints).size === NB, 'skin.joints has duplicates');

  // Parentesco entre nodos (para reconstruir la jerarquía y las posiciones)
  const parentOf = new Int32Array(gltf.nodes.length).fill(-2);
  gltf.nodes.forEach((n, i) => {
    for (const c of n.children || []) parentOf[c] = i;
  });

  // Nombres, padres y posiciones de mundo de los 25 huesos
  for (let i = 0; i < NB; i++) {
    const nodeIdx = skin.joints[i];
    const node = gltf.nodes[nodeIdx];
    expect(node.name === BONES[i].name,
      `bone ${i}: expected "${BONES[i].name}", got "${node.name}"`);
    const wantParent = BONES[i].parent < 0 ? -2 : skin.joints[BONES[i].parent];
    expect(parentOf[nodeIdx] === wantParent,
      `bone ${i} (${BONES[i].name}): parent ${parentOf[nodeIdx]} != ${wantParent}`);
    let x = node.translation[0], y = node.translation[1], z = node.translation[2];
    let p = parentOf[nodeIdx];
    while (p >= 0) {
      x += gltf.nodes[p].translation[0];
      y += gltf.nodes[p].translation[1];
      z += gltf.nodes[p].translation[2];
      p = parentOf[p];
    }
    const w = B[i];
    expect(Math.abs(x - w[0]) < 1e-6 && Math.abs(y - w[1]) < 1e-6 && Math.abs(z - w[2]) < 1e-6,
      `bone ${i} (${BONES[i].name}): world [${x}, ${y}, ${z}] != [${w[0]}, ${w[1]}, ${w[2]}]`);
  }

  // inverseBindMatrices
  const ibmAcc = gltf.accessors[skin.inverseBindMatrices];
  expect(ibmAcc.type === 'MAT4' && ibmAcc.componentType === 5126 && ibmAcc.count === NB,
    `inverseBindMatrices accessor must be MAT4/FLOAT/count ${NB}`);
  const ibm = readAccessor(gltf, bin, skin.inverseBindMatrices);
  for (let j = 0; j < NB; j++) {
    const o = j * 16;
    const ident = ibm[o] === 1 && ibm[o + 1] === 0 && ibm[o + 2] === 0 && ibm[o + 3] === 0 &&
      ibm[o + 4] === 0 && ibm[o + 5] === 1 && ibm[o + 6] === 0 && ibm[o + 7] === 0 &&
      ibm[o + 8] === 0 && ibm[o + 9] === 0 && ibm[o + 10] === 1 && ibm[o + 11] === 0 &&
      ibm[o + 15] === 1;
    const tr = [ibm[o + 12], ibm[o + 13], ibm[o + 14]];
    const want = B[j].map((c) => -c);
    const trOk = tr.every((c, k) => Math.abs(c - want[k]) < 1e-6);
    if (!ident || !trOk) problems.push(`IBM[${j}] invalid (ident=${ident}, tr=${tr})`);
  }

  // Meshes / primitives
  const expectedNames = ['nyx_hair', 'nyx_body', 'nyx_face', 'nyx_eyes'];
  expect(gltf.meshes.length === 4, 'meshes.length !== 4');
  let maxSumDev = 0, maxJoint = -1, nanCount = 0, totalTris = 0;
  for (const mesh of gltf.meshes) {
    for (const prim of mesh.primitives) {
      const posAcc = gltf.accessors[prim.attributes.POSITION];
      const jntAcc = gltf.accessors[prim.attributes.JOINTS_0];
      const wgtAcc = gltf.accessors[prim.attributes.WEIGHTS_0];
      expect(jntAcc.componentType === 5123 && jntAcc.type === 'VEC4',
        `${mesh.name}: JOINTS_0 must be VEC4/UNSIGNED_SHORT`);
      expect(wgtAcc.componentType === 5126 && wgtAcc.type === 'VEC4',
        `${mesh.name}: WEIGHTS_0 must be VEC4/FLOAT`);
      expect(jntAcc.count === posAcc.count && wgtAcc.count === posAcc.count,
        `${mesh.name}: attribute count mismatch`);
      const joints = readAccessor(gltf, bin, prim.attributes.JOINTS_0);
      const weights = readAccessor(gltf, bin, prim.attributes.WEIGHTS_0);
      for (let v = 0; v < posAcc.count; v++) {
        let sum = 0;
        for (let k = 0; k < 4; k++) {
          const j = joints[v * 4 + k];
          const w = weights[v * 4 + k];
          if (j > maxJoint) maxJoint = j;
          if (!isFinite(w)) nanCount++;
          sum += w;
        }
        const dev = Math.abs(sum - 1);
        if (dev > maxSumDev) maxSumDev = dev;
      }
      totalTris += gltf.accessors[prim.indices].count / 3;
    }
  }
  expect(maxJoint < NB, `joint index out of range: ${maxJoint}`);
  expect(nanCount === 0, `${nanCount} non-finite weights`);
  expect(maxSumDev < 1e-6, `weight sum deviation too large: ${maxSumDev}`);

  // Mesh nodes linked to the skin
  const meshNodeNames = gltf.nodes.filter((n) => n.skin === 0 && n.mesh !== undefined).map((n) => n.name);
  expect(meshNodeNames.length === 4, 'expected 4 skinned mesh nodes');
  for (const n of expectedNames) {
    expect(meshNodeNames.includes(n), `missing skinned node ${n}`);
  }

  console.log(`Verificacion: tris=${totalTris}, joints max=${maxJoint}/${NB - 1}, ` +
    `NaN weights=${nanCount}, max |sum-1|=${maxSumDev.toExponential(2)}`);
  console.log('Verificacion: nodos skin =', meshNodeNames.join(', '));
  console.log('Verificacion: huesos (' + NB + ') =',
    skin.joints.map((j) => gltf.nodes[j].name).join(', '));
  if (problems.length) {
    console.error('FALLO DE VERIFICACION:');
    for (const p of problems) console.error(' -', p);
    process.exit(1);
  }
  console.log(`Verificacion: ${NB} huesos, JOINTS_0, WEIGHTS_0 e inverseBindMatrices 100% validos. OK`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  selfTest();

  const hairPart = buildVolumetricHair();
  console.log(`nyx_hair: melena 3D volumetrica (${hairPart.indices.length / 3} tris, ` +
    `${hairPart.positions.length / 3} verts, cadena hair_1..hair_4)`);
  const parts = [
    hairPart,
    buildBody(),
    buildFace(),
    buildEyes(),
  ];
  for (const p of parts.slice(1)) {
    console.log(`${p.name}: ${p.indices.length / 3} tris, ${p.positions.length / 3} verts`);
  }

  const totalTris = parts.reduce((s, p) => s + p.indices.length / 3, 0);
  console.log('Total tris:', totalTris);

  const glb = buildGLB(parts);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, glb);
  console.log(`GLB escrito: ${OUT} (${(glb.length / 1024).toFixed(1)} KB)`);

  verify(OUT);
}

main();
