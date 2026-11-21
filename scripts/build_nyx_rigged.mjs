#!/usr/bin/env node
// Build public/models/nyx_rigged.glb from 'referencias y base/Blender_exports/raven/cro01_base.glb'.
//
// - Preserves the original topology of all 4 primitives (6776 tris total, no
//   aggressive simplification: the source is already super light), minus the
//   floating back-cape layer of nyx_body (2 connected components, 408 tris).
// - Curves the hair mane: the 1 m rigid spike towards -Z is compressed and
//   dropped so it falls in a natural arc to mid-back.
// - Welds coincident positions (1e-5) and recomputes clean smooth per-vertex
//   normals so Inverted Hull outlines never split at seams.
// - Attaches an 18-bone glTF skin (JOINTS_0 VEC4 U16 + WEIGHTS_0 VEC4 F32 +
//   inverseBindMatrices) for runtime animation.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'referencias y base/Blender_exports/raven/cro01_base.glb');
const OUT = path.join(ROOT, 'public/models/nyx_rigged.glb');

const PART_COLORS = {
  nyx_hair: '#e2e8f0',
  nyx_body: '#181b2c',
  nyx_face: '#fde6d8',
  nyx_eyes: '#181b2c',
};

// ---------------------------------------------------------------------------
// Skeleton: 18 bones. `t` is the translation RELATIVE to the parent.
// ---------------------------------------------------------------------------
const BONES = [
  { name: 'hips',      parent: -1, t: [0, 0.88, 0] },
  { name: 'spine',     parent: 0,  t: [0, 0.22, 0] },
  { name: 'chest',     parent: 1,  t: [0, 0.22, 0] },
  { name: 'neck',      parent: 2,  t: [0, 0.12, 0] },
  { name: 'head',      parent: 3,  t: [0, 0.08, 0] },
  // Cadena del pelo siguiendo el arco descendente de la melena curvada
  // (nuca z=-0.20 -> media espalda z=-0.44, y 1.52 -> 1.24).
  { name: 'hair_1',    parent: 4,  t: [0, 0.00, -0.20] },
  { name: 'hair_2',    parent: 5,  t: [0, -0.14, -0.13] },
  { name: 'hair_3',    parent: 6,  t: [0, -0.14, -0.11] },
  { name: 'upperArm_L', parent: 2, t: [0.16, 0.06, 0] },
  { name: 'forearm_L',  parent: 8, t: [0.26, -0.02, 0] },
  { name: 'hand_L',     parent: 9, t: [0.24, -0.02, 0] },
  { name: 'upperArm_R', parent: 2, t: [-0.16, 0.06, 0] },
  { name: 'forearm_R',  parent: 11, t: [-0.26, -0.02, 0] },
  { name: 'hand_R',     parent: 12, t: [-0.24, -0.02, 0] },
  { name: 'thigh_L',   parent: 0,  t: [0.09, -0.04, 0] },
  { name: 'shin_L',    parent: 14, t: [0.00, -0.40, 0] },
  { name: 'thigh_R',   parent: 0,  t: [-0.09, -0.04, 0] },
  { name: 'shin_R',    parent: 16, t: [0.00, -0.40, 0] },
];
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

// ---------------------------------------------------------------------------
// GLB parsing
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
// Geometry: weld at 1e-5 + smooth normals (topology preserved)
// ---------------------------------------------------------------------------
function weld(positions, indices) {
  // Deduplicates ONLY the positions referenced by the indices (the 4 source
  // primitives share one 5055-vertex pool), quantized at 1e-5.
  const map = new Map();
  const newPos = [];
  const remap = new Uint32Array(positions.length / 3);
  for (let v = 0; v < positions.length / 3; v++) {
    const i = v * 3;
    const key =
      Math.round(positions[i] * 1e5) + ',' +
      Math.round(positions[i + 1] * 1e5) + ',' +
      Math.round(positions[i + 2] * 1e5);
    let ni = map.get(key);
    if (ni === undefined) {
      ni = newPos.length / 3;
      map.set(key, ni);
      newPos.push(positions[i], positions[i + 1], positions[i + 2]);
    }
    remap[v] = ni;
  }
  const out = new Uint32Array(indices.length);
  let n = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const a = remap[indices[t]], b = remap[indices[t + 1]], c = remap[indices[t + 2]];
    if (a === b || b === c || a === c) continue;
    out[n++] = a; out[n++] = b; out[n++] = c;
  }
  return compact(newPos, out.subarray(0, n));
}

/** Keeps only the vertices referenced by the indices, renumbered 0..n-1. */
function compact(positions, indices) {
  const used = new Int32Array(positions.length / 3).fill(-1);
  for (let t = 0; t < indices.length; t++) used[indices[t]] = 0;
  let next = 0;
  for (let v = 0; v < used.length; v++) if (used[v] === 0) used[v] = next++;
  const finalPos = new Float32Array(next * 3);
  for (let v = 0; v < used.length; v++) {
    if (used[v] < 0) continue;
    finalPos[used[v] * 3] = positions[v * 3];
    finalPos[used[v] * 3 + 1] = positions[v * 3 + 1];
    finalPos[used[v] * 3 + 2] = positions[v * 3 + 2];
  }
  const finalIdx = new Uint32Array(indices.length);
  for (let t = 0; t < indices.length; t++) finalIdx[t] = used[indices[t]];
  return { positions: finalPos, indices: finalIdx };
}

// ---------------------------------------------------------------------------
// nyx_body: capa trasera flotante (cola/plumas de Raven)
// ---------------------------------------------------------------------------
// El cuerpo principal no pasa de z = -0.134 (espalda/gluteos incluidos). La
// capa trasera son componentes conexas SEPARADAS que flotan detras de los
// hombros hasta z = -0.70; al recibir pesos de brazo se estiran como una
// lanza diagonal al animar. Se descarta la componente entera si su bbox
// llega a z < -0.30 (ninguna pieza legitima del cuerpo pasa de -0.14).
function dropBackCape(positions, indices) {
  const vcount = positions.length / 3;
  const parent = new Int32Array(vcount).fill(-1);
  const find = (x) => { let r = x; while (parent[r] !== -1) r = parent[r]; return r; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
  for (let t = 0; t < indices.length; t += 3) {
    union(indices[t], indices[t + 1]);
    union(indices[t + 1], indices[t + 2]);
  }
  const zmin = new Map();
  for (let v = 0; v < vcount; v++) {
    const r = find(v);
    const z = positions[v * 3 + 2];
    const cur = zmin.get(r);
    if (cur === undefined || z < cur) zmin.set(r, z);
  }
  const kept = new Uint32Array(indices.length);
  let n = 0, dropped = 0;
  for (let t = 0; t < indices.length; t += 3) {
    if (zmin.get(find(indices[t])) < -0.30) { dropped++; continue; }
    kept[n++] = indices[t]; kept[n++] = indices[t + 1]; kept[n++] = indices[t + 2];
  }
  return { indices: kept.subarray(0, n), droppedTris: dropped };
}

// ---------------------------------------------------------------------------
// nyx_hair: melena 3D estilizada con volumen real (casquete + flequillos + 7 mechones)
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

  // 1. Casquete craneal cerrado con volumen redondeado: cubre coronilla, laterales
  // y baja suave por detras hasta la nuca (sin escalon ni borde oscuro), despejando el rostro
  const cx = 0, cy = 1.548, cz = -0.008;
  const rx = 0.106, ry = 0.112, rz = 0.114;
  const rings = 16, segs = 24;
  const capGrid = [];
  for (let r = 0; r <= rings; r++) {
    const v = r / rings;
    const row = [];
    for (let s = 0; s <= segs; s++) {
      const u = s / segs;
      const theta = u * Math.PI * 2;
      // El casquete se queda corto delante (0.68*PI) pero baja hasta la nuca por detras
      const back = (1 - Math.cos(theta)) / 2; // 0 = frente, 1 = nuca
      const phi = v * Math.PI * (0.68 + 0.18 * back);
      let px = cx + Math.sin(phi) * Math.sin(theta) * rx;
      let py = cy + Math.cos(phi) * ry;
      let pz = cz + Math.sin(phi) * Math.cos(theta) * rz;
      // Faldon de nuca: el borde trasero se abomina hacia atras para fundirse con los mechones
      pz -= back * v * v * 0.045;
      // Levanta el frente (+Z) por encima de los ojos para despejar el rostro
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

  // Helper para mechones 3D redondeados y suaves (curva cúbica Bezier + 12 lados)
  const addStrand = (ctrlPts, radX, radZ, ringsCount, usePhysics) => {
    const sides = 12;
    const ringVerts = [];

    // Perfil organico suave: cuerpo abombado sin afinar en punta de cuchillo.
    // Cierra la punta con un casquete redondeado (~18% de radio en el ultimo anillo).
    const profileAt = (t) => {
      const base = Math.pow(Math.sin(t * Math.PI * 0.88 + 0.25), 0.7);
      if (t > 0.86) return base + (0.18 - base) * ((t - 0.86) / 0.14);
      return base;
    };

    const evalCurve = (t) => {
      // Bezier cúbica suave usando los 4 puntos de control (o cuadrática si 3)
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
      if (!usePhysics || t <= 0.14) return [[HEAD, 1]];
      if (t <= 0.44) {
        const k = (t - 0.14) / 0.30;
        return [[HEAD, 1 - k], [5, k]];
      }
      if (t <= 0.74) {
        const k = (t - 0.44) / 0.30;
        return [[5, 1 - k], [6, k]];
      }
      const k = Math.min(1, (t - 0.74) / 0.26);
      return [[6, 1 - k], [7, k]];
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
    // Punta roma redondeada: el vertice final se proyecta sobre la tangente de la
    // curva ~1 radio del ultimo anillo, cerrando un casquete suave (no lanza recta)
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

  // 2. Flequillos laterales más redondeados enmarcando la cara (ligados a HEAD)
  for (const side of [-1, 1]) {
    addStrand([
      [side * 0.072, 1.59, 0.045],
      [side * 0.095, 1.49, 0.062],
      [side * 0.086, 1.37, 0.046],
    ], 0.028, 0.022, 12, false);
  }

  // 3. 7 Mechones traseros volumétricos y redondeados (con físicas en hair_1 -> hair_2 -> hair_3).
  //    Nacen DENTRO del casquete (coronilla trasera, Y ~1.56..1.62, Z ~-0.04..-0.08) para que
  //    no quede ningun corte ni sombra rara en la nuca, y abomban hacia atras con caida natural.
  const backStrands = [
    { x:  0.000, len: 1.02, zOut: -0.155, rx: 0.056, rz: 0.055, rootY: 1.615, rootZ: -0.055 },
    { x: -0.046, len: 1.07, zOut: -0.148, rx: 0.050, rz: 0.051, rootY: 1.605, rootZ: -0.060 },
    { x:  0.046, len: 1.07, zOut: -0.148, rx: 0.050, rz: 0.051, rootY: 1.605, rootZ: -0.060 },
    { x: -0.086, len: 1.14, zOut: -0.130, rx: 0.044, rz: 0.048, rootY: 1.590, rootZ: -0.068 },
    { x:  0.086, len: 1.14, zOut: -0.130, rx: 0.044, rz: 0.048, rootY: 1.590, rootZ: -0.068 },
    { x: -0.114, len: 1.24, zOut: -0.095, rx: 0.038, rz: 0.045, rootY: 1.575, rootZ: -0.075 },
    { x:  0.114, len: 1.24, zOut: -0.095, rx: 0.038, rz: 0.045, rootY: 1.575, rootZ: -0.075 },
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

function smoothNormals(positions, indices) {
  const vcount = positions.length / 3;
  const normals = new Float32Array(vcount * 3);
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
    // Raw cross product = area-weighted face normal.
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

// ---------------------------------------------------------------------------
// Skinning weights
// ---------------------------------------------------------------------------
function distSeg(px, py, pz, a, b) {
  const ax = b[0] - a[0], ay = b[1] - a[1], az = b[2] - a[2];
  const len2 = ax * ax + ay * ay + az * az || 1e-12;
  let t = ((px - a[0]) * ax + (py - a[1]) * ay + (pz - a[2]) * az) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = px - (a[0] + ax * t), dy = py - (a[1] + ay * t), dz = pz - (a[2] + az * t);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function distPoint(px, py, pz, a) {
  const dx = px - a[0], dy = py - a[1], dz = pz - a[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// Soft falloff: inverse-square with a small softening term.
const SOFT = 0.004;
function falloff(d) {
  return 1 / (d * d + SOFT);
}

// Torso chain segments (hips->spine->chest->neck->head->headTip).
const HEAD_TIP = [B[HEAD][0], B[HEAD][1] + 0.1, B[HEAD][2]];
const TORSO_SEGS = [
  [B[0], B[1]], [B[1], B[2]], [B[2], B[3]], [B[3], B[4]], [B[4], HEAD_TIP],
];
// Limb segments (world space), extrapolated tips for hand/foot.
function armSegs(left) {
  const s = left ? 1 : -1;
  const ua = left ? 8 : 11, fa = left ? 9 : 12, ha = left ? 10 : 13;
  const tip = [B[ha][0] + s * 0.24, B[ha][1] - 0.02, B[ha][2]];
  return [
    [ua, [B[ua], B[fa]]],
    [fa, [B[fa], B[ha]]],
    [ha, [B[ha], tip]],
  ];
}
function legSegs(left) {
  const th = left ? 14 : 16, sh = left ? 15 : 17;
  const foot = [B[sh][0], 0.02, B[sh][2] + 0.02];
  return [
    [th, [B[th], B[sh]]],
    [sh, [B[sh], foot]],
  ];
}
const ARM = { L: armSegs(true), R: armSegs(false) };
const LEG = { L: legSegs(true), R: legSegs(false) };

/** Returns up to 4 [boneIndex, weight] pairs summing to 1 (smooth, no hard cutoffs). */
function bodyWeights(x, y, z) {
  let cands;
  if (y < 0.88) {
    const side = x >= 0 ? LEG.L : LEG.R;
    cands = [[HIPS, distPoint(x, y, z, B[HIPS])]];
    for (const [bone, seg] of side) cands.push([bone, distSeg(x, y, z, seg[0], seg[1])]);
  } else {
    cands = [HIPS, SPINE, CHEST, NECK, HEAD].map((bone, i) => [
      bone, distSeg(x, y, z, TORSO_SEGS[i][0], TORSO_SEGS[i][1]),
    ]);
    if (y > 1.12) {
      const side = x >= 0 ? ARM.L : ARM.R;
      for (const [bone, seg] of side) cands.push([bone, distSeg(x, y, z, seg[0], seg[1])]);
    }
  }
  return topWeights(cands);
}

/** Hair: Z > -0.14 -> head; below, a smooth chain blend head->hair_1->hair_2->hair_3.
 *  Stops ajustados a la melena curvada (rango real z ~ [-0.50, -0.14]). */
const HAIR_STOPS = [-0.14, -0.22, -0.32, -0.42];
const HAIR_BONES = [HEAD, 5, 6, 7];
function hairWeights(z) {
  if (z > HAIR_STOPS[0]) return [[HEAD, 1]];
  if (z <= HAIR_STOPS[3]) return [[7, 1]];
  for (let i = 0; i < 3; i++) {
    if (z <= HAIR_STOPS[i + 1]) {
      const t = (z - HAIR_STOPS[i]) / (HAIR_STOPS[i + 1] - HAIR_STOPS[i]);
      return [[HAIR_BONES[i], 1 - t], [HAIR_BONES[i + 1], t]];
    }
  }
  return [[HEAD, 1]];
}

function topWeights(cands) {
  const scored = cands
    .map(([bone, d]) => [bone, falloff(d)])
    .filter(([, w]) => isFinite(w) && w > 0);
  if (scored.length === 0) return [[HIPS, 1]];
  scored.sort((a, b) => b[1] - a[1]);
  const picked = scored.slice(0, 4);
  let sum = picked.reduce((s, [, w]) => s + w, 0);
  if (!isFinite(sum) || sum <= 0) return [[HIPS, 1]];
  return picked.map(([bone, w]) => [bone, w / sum]);
}

/** Packs weights into JOINTS_0 (U16 x4) + WEIGHTS_0 (F32 x4, sum === 1). */
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
    // Normalize in float32 so the stored sum is exactly 1 (no NaN, no drift).
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

  // --- Skeleton nodes (0..17) ---
  const children = BONES.map(() => []);
  BONES.forEach((b, i) => { if (b.parent >= 0) children[b.parent].push(i); });
  BONES.forEach((b, i) => {
    const node = { name: b.name, translation: [...b.t] };
    if (children[i].length) node.children = children[i];
    gltf.nodes.push(node);
  });
  const jointNodeIndices = BONES.map((_, i) => i);

  // --- inverseBindMatrices: identity translated to -worldPos (column-major) ---
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
  parts.forEach((part, i) => {
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
// Verification: re-parse the written GLB and validate every skin accessor.
// ---------------------------------------------------------------------------
function verify(file) {
  const { json: gltf, bin } = parseGLB(file);
  const problems = [];
  const expect = (cond, msg) => { if (!cond) problems.push(msg); };

  expect(gltf.skins?.length === 1, 'skins.length !== 1');
  const skin = gltf.skins[0];
  expect(skin.joints.length === 18, 'skin.joints.length !== 18');
  expect(new Set(skin.joints).size === 18, 'skin.joints has duplicates');

  // inverseBindMatrices
  const ibmAcc = gltf.accessors[skin.inverseBindMatrices];
  expect(ibmAcc.type === 'MAT4' && ibmAcc.componentType === 5126 && ibmAcc.count === 18,
    'inverseBindMatrices accessor must be MAT4/FLOAT/count 18');
  const ibm = readAccessor(gltf, bin, skin.inverseBindMatrices);
  for (let j = 0; j < 18; j++) {
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
  expect(maxJoint < 18, `joint index out of range: ${maxJoint}`);
  expect(nanCount === 0, `${nanCount} non-finite weights`);
  expect(maxSumDev < 1e-6, `weight sum deviation too large: ${maxSumDev}`);

  // Mesh nodes linked to the skin
  const meshNodeNames = gltf.nodes.filter((n) => n.skin === 0 && n.mesh !== undefined).map((n) => n.name);
  expect(meshNodeNames.length === 4, 'expected 4 skinned mesh nodes');
  for (const n of expectedNames) {
    expect(meshNodeNames.includes(n), `missing skinned node ${n}`);
  }

  console.log(`Verificacion: tris=${totalTris}, joints max=${maxJoint}, ` +
    `NaN weights=${nanCount}, max |sum-1|=${maxSumDev.toExponential(2)}`);
  console.log('Verificacion: nodos skin =', meshNodeNames.join(', '));
  console.log('Verificacion: huesos =', skin.joints.map((j) => gltf.nodes[j].name).join(', '));
  if (problems.length) {
    console.error('FALLO DE VERIFICACION:');
    for (const p of problems) console.error(' -', p);
    process.exit(1);
  }
  console.log('Verificacion: JOINTS_0, WEIGHTS_0 e inverseBindMatrices 100% validos. OK');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  const { json: gltf, bin } = parseGLB(SRC);
  const meshDef = gltf.meshes[0];
  if (!meshDef || meshDef.primitives.length !== 4) {
    throw new Error('Expected 1 mesh with 4 primitives, got ' + (meshDef ? meshDef.primitives.length : 0));
  }
  const defs = [
    { name: 'nyx_hair', prim: 0, weightFn: (_x, _y, z) => hairWeights(z) },
    { name: 'nyx_body', prim: 1, weightFn: bodyWeights },
    { name: 'nyx_face', prim: 2, weightFn: () => [[HEAD, 1]] },
    { name: 'nyx_eyes', prim: 3, weightFn: () => [[HEAD, 1]] },
  ];

  const parts = defs.map(({ name, prim, weightFn }) => {
    if (name === 'nyx_hair') {
      const hairPart = buildVolumetricHair();
      console.log(`nyx_hair: melena 3D volumetrica generada (${hairPart.indices.length / 3} tris, ${hairPart.positions.length / 3} verts)`);
      return hairPart;
    }
    const p = meshDef.primitives[prim];
    const positions = readAccessor(gltf, bin, p.attributes.POSITION);
    const rawIdx = readAccessor(gltf, bin, p.indices);
    const indices = new Uint32Array(rawIdx.length);
    for (let i = 0; i < rawIdx.length; i++) indices[i] = rawIdx[i];
    const origTris = indices.length / 3;

    let welded = weld(positions, indices);
    if (name === 'nyx_body') {
      // Recoge suavemente las mangas/plumas traseras que sobresalen hacia -Z sin borrar los brazos.
      for (let v = 0; v < welded.positions.length / 3; v++) {
        const i = v * 3;
        if (welded.positions[i + 2] < -0.18) {
          welded.positions[i + 2] = -0.18 + (welded.positions[i + 2] + 0.18) * 0.25;
        }
      }
    }
    const normals = smoothNormals(welded.positions, welded.indices);
    const { joints, weights } = packWeights(
      welded.positions.length / 3, welded.positions, weightFn
    );
    const outIndices = new Uint16Array(welded.indices);
    console.log(
      `${name}: ${origTris} tris preservados, ${positions.length / 3} -> ` +
      `${welded.positions.length / 3} verts tras soldadura 1e-5`
    );
    return { name, positions: welded.positions, normals, joints, weights, indices: outIndices };
  });

  const totalTris = parts.reduce((s, p) => s + p.indices.length / 3, 0);
  console.log('Total tris:', totalTris);

  const glb = buildGLB(parts);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, glb);
  console.log(`GLB escrito: ${OUT} (${(glb.length / 1024).toFixed(1)} KB)`);

  verify(OUT);
}

main();
