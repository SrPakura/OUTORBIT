#!/usr/bin/env node
// Build public/models/nyx_rigged.glb — NYX 100% PROCEDURAL (cero assets externos).
//
// NO lee `cro01_base.glb` ni ningún otro asset con copyright: las 4 primitivas
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

  vert(x, y, z, pairs) {
    const vi = this.pos.length / 3;
    this.pos.push(x, y, z);
    let s = 0;
    const p = [0, 0, 0, 0], w = [0, 0, 0, 0];
    for (let k = 0; k < Math.min(4, pairs.length); k++) {
      p[k] = pairs[k][0];
      w[k] = pairs[k][1];
      s += w[k];
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

// Torso→cadera: UNA superficie continua. Cuello abierto arriba (r 0.049 en
// Y 1.45, coincidente con el anillo 1 del cuello de nyx_face) y cierre en el
// perineo. bust/glute = gaussianas suaves de pecho y glúteo.
const TORSO_ROWS = [
  { y: 1.450, rx: 0.049, rzF: 0.049, rzB: 0.049, p: 2.0 },            // cuello (abierto)
  { y: 1.420, rx: 0.075, rzF: 0.056, rzB: 0.058, p: 2.0 },            // trapecio
  { y: 1.390, rx: 0.118, rzF: 0.078, rzB: 0.082, p: 2.05 },
  { y: 1.360, rx: 0.142, rzF: 0.088, rzB: 0.093, p: 2.1 },
  { y: 1.330, rx: 0.150, rzF: 0.094, rzB: 0.099, p: 2.15 },
  { y: 1.300, rx: 0.152, rzF: 0.099, rzB: 0.104, p: 2.2, bust: 0.020 },
  { y: 1.260, rx: 0.149, rzF: 0.098, rzB: 0.103, p: 2.2, bust: 0.024 },
  { y: 1.220, rx: 0.143, rzF: 0.095, rzB: 0.100, p: 2.2, bust: 0.018 },
  { y: 1.180, rx: 0.132, rzF: 0.091, rzB: 0.096, p: 2.15, bust: 0.008 },
  { y: 1.140, rx: 0.120, rzF: 0.086, rzB: 0.090, p: 2.1 },
  { y: 1.100, rx: 0.108, rzF: 0.080, rzB: 0.084, p: 2.05 },
  { y: 1.060, rx: 0.099, rzF: 0.077, rzB: 0.080, p: 2.0 },            // cintura esbelta
  { y: 1.020, rx: 0.104, rzF: 0.080, rzB: 0.083, p: 2.0 },
  { y: 0.980, rx: 0.114, rzF: 0.086, rzB: 0.089, p: 2.0 },
  { y: 0.940, rx: 0.130, rzF: 0.094, rzB: 0.098, p: 2.05 },           // flanco de cadera
  { y: 0.900, rx: 0.146, rzF: 0.100, rzB: 0.105, p: 2.1 },            // hueso de cadera
  { y: 0.860, rx: 0.150, rzF: 0.099, rzB: 0.108, p: 2.1, glute: 0.016 },
  { y: 0.820, rx: 0.140, rzF: 0.094, rzB: 0.104, p: 2.1, glute: 0.024 },
  { y: 0.780, rx: 0.120, rzF: 0.084, rzB: 0.092, p: 2.05, glute: 0.012 },
  { y: 0.750, rx: 0.094, rzF: 0.068, rzB: 0.074, p: 2.0 },            // bajo de cadera
  { y: 0.735, rx: 0.064, rzF: 0.052, rzB: 0.056, p: 2.0 },
  { y: 0.725, rx: 0.034, rzF: 0.030, rzB: 0.032, p: 2.0 },
  { y: 0.718, rx: 0.010, rzF: 0.009, rzB: 0.009, p: 2.0 },            // perineo
];

// Pierna (izquierda; la derecha se espeja con x → -x): raíz con domo encajado
// en la pelvis, rodilla estilizada, gemelo, caña de bota con cambio de radio
// limpio, tobillo y puntera puntiaguda aerodinámica.
const LEG_PATH = [
  { c: [0.090, 0.870, 0.000], aF: 0.088, aB: 0.088, b: 0.088 }, // raíz (domo en cadera)
  { c: [0.090, 0.800, 0.004], aF: 0.086, aB: 0.091, b: 0.083 },
  { c: [0.090, 0.700, 0.010], aF: 0.081, aB: 0.087, b: 0.078 },
  { c: [0.090, 0.600, 0.012], aF: 0.075, aB: 0.081, b: 0.072 },
  { c: [0.089, 0.500, 0.012], aF: 0.067, aB: 0.073, b: 0.064 },
  { c: [0.088, 0.450, 0.012], aF: 0.061, aB: 0.066, b: 0.058 }, // rodilla
  { c: [0.087, 0.400, 0.008], aF: 0.059, aB: 0.065, b: 0.056 },
  { c: [0.086, 0.330, 0.000], aF: 0.056, aB: 0.072, b: 0.055 }, // gemelo
  { c: [0.085, 0.260, -0.006], aF: 0.052, aB: 0.064, b: 0.052 }, // caña de la bota
  { c: [0.084, 0.160, -0.010], aF: 0.044, aB: 0.051, b: 0.043 },
  { c: [0.084, 0.100, -0.008], aF: 0.042, aB: 0.048, b: 0.040 }, // tobillo (hueso Y 0.08)
  { c: [0.084, 0.060, 0.010], aF: 0.040, aB: 0.050, b: 0.037 },
  { c: [0.084, 0.038, 0.050], aF: 0.032, aB: 0.036, b: 0.033 }, // empeine
  { c: [0.084, 0.028, 0.095], aF: 0.026, aB: 0.028, b: 0.028 }, // antepié
  { c: [0.084, 0.024, 0.130], aF: 0.014, aB: 0.015, b: 0.016 }, // puntera
];

// Brazo en T-pose (izquierdo; el derecho se espeja): domo deltoideo encajado
// en el hombro, codo, guante con cambio de radio limpio a media antebrazo y
// mano estilizada plana con yema redondeada.
const ARM_PATH = [
  { c: [0.155, 1.400, 0.000], w: 0.056, t: 0.056 },              // domo deltoideo
  { c: [0.210, 1.398, 0.001], w: 0.050, t: 0.050 },
  { c: [0.300, 1.392, 0.003], w: 0.047, t: 0.047 },
  { c: [0.420, 1.380, 0.004], w: 0.043, t: 0.043 },              // codo
  { c: [0.500, 1.372, 0.003], w: 0.042, t: 0.040 },              // puño del guante
  { c: [0.580, 1.366, 0.001], w: 0.036, t: 0.034 },
  { c: [0.640, 1.362, 0.000], w: 0.031, t: 0.029 },              // muñeca
  { c: [0.695, 1.358, 0.002], w: 0.041, t: 0.021, thumb: 0.010 }, // palma
  { c: [0.735, 1.356, 0.004], w: 0.033, t: 0.015 },
];

// Cabeza anime: coronilla → barbilla fina (z desplaza el centro hacia el
// mentón). p > 2 aplana el plano facial (frente/mejillas suaves).
const HEAD_ROWS = [
  { y: 1.630, rx: 0.046, rzF: 0.049, rzB: 0.051, p: 2.0, z: 0.000 },
  { y: 1.610, rx: 0.072, rzF: 0.076, rzB: 0.080, p: 2.0, z: 0.000 },
  { y: 1.588, rx: 0.087, rzF: 0.091, rzB: 0.097, p: 2.05, z: 0.000 },
  { y: 1.565, rx: 0.093, rzF: 0.096, rzB: 0.102, p: 2.15, z: 0.000 },
  { y: 1.545, rx: 0.096, rzF: 0.098, rzB: 0.104, p: 2.3, z: 0.000 },
  { y: 1.525, rx: 0.096, rzF: 0.098, rzB: 0.104, p: 2.35, z: 0.000 }, // línea de ojos
  { y: 1.505, rx: 0.092, rzF: 0.094, rzB: 0.099, p: 2.3, z: 0.000 },
  { y: 1.485, rx: 0.085, rzF: 0.086, rzB: 0.091, p: 2.2, z: 0.000 },   // pómulo
  { y: 1.465, rx: 0.073, rzF: 0.073, rzB: 0.080, p: 2.1, z: 0.002 },   // mejilla
  { y: 1.450, rx: 0.058, rzF: 0.060, rzB: 0.066, p: 2.05, z: 0.004 },  // mandíbula
  { y: 1.442, rx: 0.044, rzF: 0.049, rzB: 0.053, p: 2.0, z: 0.010 },   // mentón
];

// Cuello integrado en nyx_face: el anillo 1 es COINCIDENTE con el cuello del
// torso (mismo Y/radio/fase) → unión soldada sin costura; arriba queda oculto
// dentro de la mandíbula.
const NECK_ROWS = [
  { c: [0, 1.450, 0.000], r: 0.049 },
  { c: [0, 1.480, -0.006], r: 0.047 },
  { c: [0, 1.505, -0.010], r: 0.046 },
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

// [hueso, desde, hasta] en mundo. Los muslos arrancan en la punta del domo
// encajado en la pelvis; manos/pies extienden sus segmentos hasta la yema/puntera.
const SEGS = [
  [HIPS, [0, 0.88, 0], [0, 0.76, 0]],
  [SPINE, [0, 1.10, 0], [0, 0.88, 0]],
  [CHEST, [0, 1.32, 0], [0, 1.10, 0]],
  [NECK, [0, 1.44, 0], [0, 1.32, 0]],
  [HEAD, [0, 1.64, 0], [0, 1.44, 0]],
  [CLAV_L, [0.05, 1.40, 0], [0, 1.32, 0]],
  [CLAV_R, [-0.05, 1.40, 0], [0, 1.32, 0]],
  [8, [0.16, 1.40, 0], [0.05, 1.40, 0]],        // upperArm_L
  [11, [-0.16, 1.40, 0], [-0.05, 1.40, 0]],     // upperArm_R
  [9, [0.42, 1.38, 0], [0.16, 1.40, 0]],        // forearm_L
  [12, [-0.42, 1.38, 0], [-0.16, 1.40, 0]],     // forearm_R
  [10, [0.755, 1.355, 0.005], [0.42, 1.38, 0]], // hand_L (hasta la yema)
  [13, [-0.755, 1.355, 0.005], [-0.42, 1.38, 0]],
  [14, [0.09, 0.44, 0], [0.09, 0.905, 0]],      // thigh_L (desde el domo)
  [16, [-0.09, 0.44, 0], [-0.09, 0.905, 0]],
  [15, [0.09, 0.08, 0], [0.09, 0.44, 0]],       // shin_L
  [17, [-0.09, 0.08, 0], [-0.09, 0.44, 0]],
  [FOOT_L, [0.09, 0.045, 0.135], [0.09, 0.08, 0]],
  [FOOT_R, [-0.09, 0.045, 0.135], [-0.09, 0.08, 0]],
  [TOE_L, [0.09, 0.045, 0.135], [0.09, 0.06, 0.06]],
  [TOE_R, [-0.09, 0.045, 0.135], [-0.09, 0.06, 0.06]],
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
// nyx_body: torso continuo + piernas y brazos con domos encajados
// ---------------------------------------------------------------------------
function buildBody() {
  const mb = new MeshBuilder();

  // Torso→cadera: una sola malla continua (sin costura cintura/cadera).
  // Arriba queda ABIERTO en el cuello: el anillo coincide con el anillo 1 del
  // cuello de nyx_face (soldadura por coincidencia); abajo cierra en el
  // perineo, tapando el hueco entre los muslos.
  loft(mb, {
    segs: 20,
    rings: TORSO_ROWS.map((row) => ({
      c: [0, row.y, 0],
      aF: row.rzF, aB: row.rzB, b: row.rx, p: row.p,
      bumps: row.bust
        ? [{ phi: 0.42, sig: 0.5, ampA: row.bust }, { phi: -0.42, sig: 0.5, ampA: row.bust }]
        : row.glute
          ? [{ phi: Math.PI, sig: 0.6, ampA: -row.glute }]
          : undefined,
      frame: FRAME_Z,
    })),
    capStart: { mode: 'none' },
    capEnd: { mode: 'point', depth: 0.012 },
  });

  // Piernas: el domo de la raíz vive DENTRO de la pelvis (pivota con el
  // muslo sin abrir huecos en la entrepierna) y la puntera cierra en punta.
  for (const side of [1, -1]) {
    const mp = LEG_PATH.map((p) => ({ ...p, c: [p.c[0] * side, p.c[1], p.c[2]] }));
    const frames = pathFrames(mp, [1, 0, 0]);
    loft(mb, {
      segs: 16,
      rings: mp.map((p, i) => ({
        c: p.c, aF: p.aF, aB: p.aB, b: p.b, p: 2.0, frame: frames[i].frame,
      })),
      capStart: { mode: 'dome', depth: 0.038 },
      capEnd: { mode: 'point', depth: 0.020 },
    });
  }

  // Brazos: domo deltoideo encajado en el hombro (pivota con el upperArm sin
  // desgarros) y mano estilizada con yema redondeada.
  for (const side of [1, -1]) {
    const mp = ARM_PATH.map((p) => ({ ...p, c: [p.c[0] * side, p.c[1], p.c[2]] }));
    const frames = pathFrames(mp, [0, 1, 0]);
    loft(mb, {
      segs: 14,
      rings: mp.map((p, i) => ({
        c: p.c, aF: p.w, aB: p.w, b: p.t, p: 2.0, frame: frames[i].frame,
        bumps: p.thumb ? [{ phi: 0, sig: 0.45, ampA: p.thumb }] : undefined,
      })),
      capStart: { mode: 'dome', depth: 0.052 },
      capEnd: { mode: 'dome', depth: 0.020 },
    });
  }

  return finishPart(mb, 'nyx_body', bodyWeights);
}

// ---------------------------------------------------------------------------
// nyx_face: cabeza anime + cuello integrado
// ---------------------------------------------------------------------------
function buildFace() {
  const mb = new MeshBuilder();

  // Cabeza: casquete de coronilla arriba y barbilla puntiaguda abajo
  // (el path final baja hacia +Z → mentón fino y adelantado).
  loft(mb, {
    segs: 20,
    rings: HEAD_ROWS.map((row) => ({
      c: [0, row.y, row.z],
      aF: row.rzF, aB: row.rzB, b: row.rx, p: row.p,
      frame: FRAME_Z,
    })),
    capStart: { mode: 'dome', depth: 0.014 },
    capEnd: { mode: 'point', depth: 0.016 },
  });

  // Cuello: mismo nº de segmentos y fase que el torso → anillo 1 coincidente.
  loft(mb, {
    segs: 20,
    rings: NECK_ROWS.map((row) => ({
      c: row.c, aF: row.r, aB: row.r, b: row.r, p: 2.0,
      frame: FRAME_Z,
    })),
    capStart: { mode: 'none' },
    capEnd: { mode: 'none' },
  });

  return finishPart(mb, 'nyx_face', faceWeights);
}

// ---------------------------------------------------------------------------
// nyx_eyes: ojos almendrados expresivos sobre el plano facial
// ---------------------------------------------------------------------------
function buildEyes() {
  const mb = new MeshBuilder();
  const NU = 8, NV = 6;
  for (const side of [1, -1]) {
    const cx = side * 0.040, cy = 1.528, hw = 0.028, hh = 0.0115;
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
