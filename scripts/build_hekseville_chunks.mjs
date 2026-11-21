#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { MeshoptSimplifier } from 'meshoptimizer';

const SRC_DIR = '/home/pakura/Proyectos/OUTORBIT/referencias y base/Blender_exports/ciudad_hekseville';
const OUT_DIR = '/home/pakura/Proyectos/OUTORBIT/public/chunks/hekseville';

// El mundo es 100% Pleajeune: Vendecentre se retiró por completo.
const DISTRICTS = [
  { id: 'pleajeune', file: 'Pleajeune_base_dt.glb', priority: 0, cellSize: 105, minY: -200, maxY: 420 },
];

const MAX_ABS_XZ = 720;

const SKIP_ROOT_SUBSTR = [
  'kamistage',
  'opening_01',
  'opening_02',
  'door_close',
  'light_off',
  '_break_',
  'under_road',
  'under_all',
];

// Micro clutter removed to keep vertex count fast on PC/mobile without altering city architecture
const SKIP_NODE_PREFIXES = [
  'stone_pot',
  'rubble_',
  'flower_',
  'grass_',
  'cardboardbox',
  'can_',
  'woodbox',
  'dust_',
  'dustbox',
  'manhole',
  'poster_',
  'steeldrum',
  'fireplug',
  'vase_',
  'chair_',
  'desk_',
  'fruit_',
  'apple_',
  'barrel_',
  'bottle_',
  'bag_',
  'boxset',
  'airconditioner',
  'telephonebox',
  'roadclosedsign',
  'signboard',
  'manekin',
  'pylon_',
  'cover_',
  'post_',
  'steelbox',
  'pipe1_',
  'branch_',
  'slide_',
  'swing_',
  'light_',
  'fence_',
  'window_',
  // Persianas cerradas y cuerdas finas de estribo: abren los arcos y
  // pasillos de Pleajeune (fance_pd es la variante "fance" del modelo).
  'door_',
  'fance_',
  'gate_',
  'glass_',
  'ironbar',
  'rope',
];

// ALTA FIDELIDAD DE VÉRTICES: presupuestos 1:1 reinvertidos al 100% en
// Pleajeune. La soldadura es SOLO por posición cuantizada (~3 cm), así que
// Meshopt comparte topología entre caras adyacentes, y con ['LockBorder'] +
// maxError normalizado MUY pequeño (0.6%-2% del extent del chunk) las torres
// NUNCA se rompen en aletas flotantes ("rotilla"): el borde de cada isla
// queda sellado y el colapso respeta la silueta esculpida real.
// Las normales se RECONSTRUYEN tras simplificar con crease de 42° (esquinas
// arquitectónicas nítidas, superficies curvas suaves).
const BUCKETS = [
  { name: 'col_stone', ratio: 0.80, maxError: 0.007 },
  { name: 'col_cliff', ratio: 0.68, maxError: 0.011 },
  { name: 'col_under', ratio: 0.60, maxError: 0.014 },
  { name: 'col_roof', ratio: 0.80, maxError: 0.007 },
  { name: 'col_wall_a', ratio: 0.72, maxError: 0.009 },
  { name: 'col_wall_b', ratio: 0.72, maxError: 0.009 },
  { name: 'col_metal', ratio: 0.68, maxError: 0.011 },
  { name: 'vis_glow', ratio: 0.68, maxError: 0.012 },
  { name: 'vis_foliage', ratio: 0.45, maxError: 0.020 },
];
const BUCKET_INDEX = Object.fromEntries(BUCKETS.map((b, i) => [b.name, i]));
// Multiplicador experimental de maxError (debug: HEK_ERR_MUL).
const ERR_MUL = parseFloat(process.env.HEK_ERR_MUL || '1') || 1;

function mulMat4(a, b, out = new Float64Array(16)) {
  for (let col = 0; col < 4; col++) {
    const c4 = col * 4;
    const b0 = b[c4], b1 = b[c4 + 1], b2 = b[c4 + 2], b3 = b[c4 + 3];
    out[c4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
    out[c4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    out[c4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    out[c4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
  }
  return out;
}

function nodeLocalMat4(node) {
  if (node.matrix) return Float64Array.from(node.matrix);
  const t = node.translation || [0, 0, 0];
  const r = node.rotation || [0, 0, 0, 1];
  const s = node.scale || [1, 1, 1];
  const x = r[0], y = r[1], z = r[2], w = r[3];
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  const m = new Float64Array(16);
  m[0] = (1 - (yy + zz)) * s[0];
  m[1] = (xy + wz) * s[0];
  m[2] = (xz - wy) * s[0];
  m[4] = (xy - wz) * s[1];
  m[5] = (1 - (xx + zz)) * s[1];
  m[6] = (yz + wx) * s[1];
  m[8] = (xz + wy) * s[2];
  m[9] = (yz - wx) * s[2];
  m[10] = (1 - (xx + yy)) * s[2];
  m[12] = t[0];
  m[13] = t[1];
  m[14] = t[2];
  m[15] = 1;
  return m;
}

function readGlb(filePath) {
  const buf = fs.readFileSync(filePath);
  const magic = buf.readUInt32LE(0);
  if (magic !== 0x46546c67) throw new Error(`Not a GLB: ${filePath}`);
  const jsonLen = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const binHeaderOffset = 20 + jsonLen;
  const binLen = buf.readUInt32LE(binHeaderOffset);
  const binStart = binHeaderOffset + 8;
  const bin = buf.subarray(binStart, binStart + binLen);
  return { gltf, bin };
}

function getAccessorView(gltf, bin, accIdx) {
  const acc = gltf.accessors[accIdx];
  const bv = gltf.bufferViews[acc.bufferView];
  const byteOffset = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const compPerElem = acc.type === 'VEC3' ? 3 : acc.type === 'VEC2' ? 2 : acc.type === 'VEC4' ? 4 : 1;
  const count = acc.count * compPerElem;
  const absOff = bin.byteOffset + byteOffset;
  if (acc.componentType === 5126) return new Float32Array(bin.buffer, absOff, count);
  if (acc.componentType === 5123) return new Uint16Array(bin.buffer, absOff, count);
  if (acc.componentType === 5125) return new Uint32Array(bin.buffer, absOff, count);
  throw new Error(`Unsupported componentType ${acc.componentType}`);
}

function hashNameColorVariant(name) {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) & 1;
}

/** Hash FNV-1a determinista de un string, normalizado a [0, 1). */
function hashStrToUnit(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

// ----------------------------------------------------------------------------
// Metadatos por instancia (COLOR_0, VEC4 float): [categoryCode, seedA, seedB, flag]
//
// - categoryCode (r): familia arquitectónica (0.00 terreno, 0.16 tiendas,
//   0.32 residencial, 0.48 mansiones/cívicos, 0.64 rascacielos, 0.80 puentes/
//   rails/escaleras/metal, 0.96 letreros/neón).
// - seedA (g): hash del nombre + traslación mundial -> CADA casa/tienda/torre
//   individual recibe una semilla procedural única.
// - seedB (b): segundo hash independiente -> variación secundaria de
//   tejado/remate/letrero.
// - flag (a): 1.0 en letreros animados y landmarks, 0.5 en el resto.
// ----------------------------------------------------------------------------

const DEFAULT_NODE_META = [0.0, 0.0, 0.0, 0.5];

function computeNodeMeta(name, world) {
  if (!name) return null;
  const lower = name.toLowerCase();
  let category = -1;
  if (lower.startsWith('tv_') || lower.startsWith('sign_')) {
    category = 0.96;
  } else if (
    lower.startsWith('bridge_') ||
    lower.startsWith('trainrail') ||
    lower.startsWith('stairs_') ||
    lower.startsWith('pipe_') ||
    lower.startsWith('support_')
  ) {
    category = 0.8;
  } else if (
    lower.startsWith('building_sn_') ||
    lower.startsWith('tower_') ||
    lower.startsWith('structure_')
  ) {
    category = 0.64;
  } else if (
    lower.startsWith('building_ms_') ||
    lower.startsWith('building_pd_') ||
    lower.startsWith('arch_') ||
    lower.startsWith('monument') ||
    lower.startsWith('fountain')
  ) {
    category = 0.48;
  } else if (
    lower.startsWith('building_kk_') ||
    lower.startsWith('building_yy_') ||
    lower.startsWith('uji_')
  ) {
    category = 0.32;
  } else if (lower.startsWith('building_sf_')) {
    category = 0.16;
  } else if (lower.startsWith('building_')) {
    // Edificio sin sufijo de familia: variación residencial por defecto.
    category = 0.32;
  } else if (lower.startsWith('base_') || lower.startsWith('gake_')) {
    category = 0.0;
  }
  if (category < 0) return null;

  const seedA = hashStrToUnit(`${name}${Math.round(world[12] * 2)}_${Math.round(world[14] * 2)}`);
  const seedB = hashStrToUnit(`${seedA * 17 + name.length}`);
  const isAnimatedOrLandmark =
    lower.startsWith('tv_') ||
    lower.startsWith('sign_') ||
    lower.startsWith('monument') ||
    lower.startsWith('fountain') ||
    lower.startsWith('arch_');
  return [category, seedA, seedB, isAnimatedOrLandmark ? 1.0 : 0.5];
}

function classifyNodeCategory(nodeName) {
  const lower = nodeName.toLowerCase();
  if (lower.startsWith('tree_') || lower.startsWith('fance')) return 'foliage';
  if (lower.startsWith('tv_') || lower.startsWith('sign_')) return 'glow';
  if (
    lower.startsWith('bridge_') ||
    lower.startsWith('trainrail') ||
    lower.startsWith('pipe_') ||
    lower.startsWith('antenna_') ||
    lower.startsWith('chimn') ||
    lower.startsWith('watertank') ||
    lower.startsWith('elevator') ||
    lower.startsWith('handrail') ||
    lower.startsWith('gate_') ||
    lower.startsWith('ironbar') ||
    lower.startsWith('duct') ||
    lower.startsWith('tower_') ||
    lower.startsWith('structure_') ||
    lower.startsWith('support_')
  ) {
    return 'metal';
  }
  if (lower.startsWith('base_') || lower.startsWith('gake_')) return 'terrain';
  return 'building';
}

function pickTriBucket(cat, ny, wallVariant) {
  if (cat === 'foliage') return BUCKET_INDEX.vis_foliage;
  if (cat === 'glow') return BUCKET_INDEX.vis_glow;
  if (cat === 'metal') return BUCKET_INDEX.col_metal;
  if (cat === 'terrain') {
    if (ny > 0.56) return BUCKET_INDEX.col_stone;
    if (ny < -0.36) return BUCKET_INDEX.col_under;
    return BUCKET_INDEX.col_cliff;
  }
  if (ny > 0.68) return BUCKET_INDEX.col_roof;
  if (ny < -0.45) return BUCKET_INDEX.col_under;
  return wallVariant === 0 ? BUCKET_INDEX.col_wall_a : BUCKET_INDEX.col_wall_b;
}

function shouldSkipNode(name) {
  const lower = name.toLowerCase();
  for (const p of SKIP_NODE_PREFIXES) {
    if (lower.startsWith(p)) return true;
  }
  return false;
}

/**
 * Inspect whether an asset node holds stacked LOD sibling meshes (LOD0 + LOD1 at same origin).
 * Returns the Set of child indices to SKIP so only the cleanest lower-tri LOD is rendered.
 */
function detectRedundantLodChildren(gltf, nodes, meshBounds, meshTris, node) {
  const chs = node.children || [];
  if (chs.length < 2) return null;
  const name = (node.name || '').toLowerCase();
  if (name.startsWith('base_') || name.startsWith('area')) return null;

  const entries = [];
  for (let i = 0; i < chs.length; i++) {
    const ch = nodes[chs[i]];
    if (ch.translation || ch.rotation || ch.scale || ch.matrix) continue;
    let mi = ch.mesh;
    if (mi === undefined && ch.children && ch.children.length === 1) {
      const sub = nodes[ch.children[0]];
      if (!sub.translation && !sub.rotation && !sub.scale && !sub.matrix && sub.mesh !== undefined) {
        mi = sub.mesh;
      }
    }
    if (mi !== undefined) {
      entries.push({ childIdx: chs[i], meshIdx: mi, tris: meshTris[mi], box: meshBounds[mi] });
    }
  }
  if (entries.length < 2) return null;

  // Compare entries pairwise: if two share near-identical bounds, drop the higher-poly sibling
  const skipSet = new Set();
  for (let i = 0; i < entries.length; i++) {
    if (skipSet.has(entries[i].childIdx)) continue;
    for (let j = i + 1; j < entries.length; j++) {
      if (skipSet.has(entries[j].childIdx)) continue;
      const a = entries[i].box;
      const b = entries[j].box;
      const diff =
        Math.abs(a.min[0] - b.min[0]) +
        Math.abs(a.min[1] - b.min[1]) +
        Math.abs(a.min[2] - b.min[2]) +
        Math.abs(a.max[0] - b.max[0]) +
        Math.abs(a.max[1] - b.max[1]) +
        Math.abs(a.max[2] - b.max[2]);
      if (diff < 1.8) {
        // Keep the lower-poly (still clean sculpted silhouette) LOD
        if (entries[i].tris <= entries[j].tris) {
          skipSet.add(entries[j].childIdx);
        } else {
          skipSet.add(entries[i].childIdx);
        }
      }
    }
  }
  return skipSet.size > 0 ? skipSet : null;
}

// Escalera de umbrales de crease para la reconstrucción de normales tras
// simplificar: 42° mantiene esquinas arquitectónicas nítidas y suaviza
// puentes/torres/rocas; si el bucket superara los 65535 vértices por
// primitiva se reintenta con ángulos más generosos hasta la soldadura total.
const CREASE_COS_LADDER = [Math.cos((42 * Math.PI) / 180), 0.5, 0.17, -1];

/**
 * Reconstruye normales con umbral de crease sobre la malla SIMPLIFICADA.
 * Para cada vértice de salida agrupa sus caras incidentes por hemisferio
 * (dot con la media del grupo >= creaseCos): las esquinas > umbral se
 * separan en vértices distintos (nítidas) y las superficies suaves
 * comparten un único vértice con normal promediada.
 */
function buildCreaseNormals(posArr, colArr, vertCount, indices, creaseCos) {
  const triCount = indices.length / 3;

  // Normales de cara unitarias (fallback (0,1,0) en degeneradas).
  const faceNorm = new Float32Array(triCount * 3);
  for (let t = 0; t < triCount; t++) {
    const a3 = indices[t * 3] * 3;
    const b3 = indices[t * 3 + 1] * 3;
    const c3 = indices[t * 3 + 2] * 3;
    const e1x = posArr[b3] - posArr[a3];
    const e1y = posArr[b3 + 1] - posArr[a3 + 1];
    const e1z = posArr[b3 + 2] - posArr[a3 + 2];
    const e2x = posArr[c3] - posArr[a3];
    const e2y = posArr[c3 + 1] - posArr[a3 + 1];
    const e2z = posArr[c3 + 2] - posArr[a3 + 2];
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const len = Math.hypot(nx, ny, nz);
    if (len > 1e-9) {
      nx /= len;
      ny /= len;
      nz /= len;
    } else {
      nx = 0;
      ny = 1;
      nz = 0;
    }
    faceNorm[t * 3] = nx;
    faceNorm[t * 3 + 1] = ny;
    faceNorm[t * 3 + 2] = nz;
  }

  // Incidentencia cara->vértice (conteo + prefijo + relleno).
  const incidentStart = new Int32Array(vertCount + 1);
  for (let i = 0; i < indices.length; i++) {
    incidentStart[indices[i] + 1]++;
  }
  for (let v = 0; v < vertCount; v++) {
    incidentStart[v + 1] += incidentStart[v];
  }
  const incidentFace = new Int32Array(indices.length);
  const cursor = incidentStart.slice(0, vertCount);
  for (let t = 0; t < triCount; t++) {
    for (let k = 0; k < 3; k++) {
      const v = indices[t * 3 + k];
      incidentFace[cursor[v]++] = t;
    }
  }

  // Agrupar caras incidentes de cada vértice y emitir un vértice de salida
  // por grupo. `cornerGroup` mapea cada esquina del índice al vértice nuevo.
  const cornerGroup = new Int32Array(indices.length);
  const outPos = [];
  const outNorm = [];
  const outCol = [];
  let outVerts = 0;
  for (let v = 0; v < vertCount; v++) {
    const start = incidentStart[v];
    const end = incidentStart[v + 1];
    if (start === end) continue;

    const groups = [];
    for (let k = start; k < end; k++) {
      const f = incidentFace[k];
      const fnx = faceNorm[f * 3];
      const fny = faceNorm[f * 3 + 1];
      const fnz = faceNorm[f * 3 + 2];
      let grp = null;
      for (let g = 0; g < groups.length; g++) {
        const cand = groups[g];
        const len = Math.hypot(cand.nx, cand.ny, cand.nz) || 1;
        if ((cand.nx * fnx + cand.ny * fny + cand.nz * fnz) / len >= creaseCos) {
          grp = cand;
          break;
        }
      }
      if (!grp) {
        grp = { nx: 0, ny: 0, nz: 0, faces: [] };
        groups.push(grp);
      }
      grp.nx += fnx;
      grp.ny += fny;
      grp.nz += fnz;
      grp.faces.push(f);
    }

    for (let g = 0; g < groups.length; g++) {
      const grp = groups[g];
      const len = Math.hypot(grp.nx, grp.ny, grp.nz) || 1;
      const gid = outVerts++;
      outPos.push(posArr[v * 3], posArr[v * 3 + 1], posArr[v * 3 + 2]);
      outNorm.push(grp.nx / len, grp.ny / len, grp.nz / len);
      outCol.push(colArr[v * 4], colArr[v * 4 + 1], colArr[v * 4 + 2], colArr[v * 4 + 3]);
      for (const f of grp.faces) {
        for (let k = 0; k < 3; k++) {
          if (indices[f * 3 + k] === v) cornerGroup[f * 3 + k] = gid;
        }
      }
    }
  }

  return {
    positions: new Float32Array(outPos),
    normals: new Float32Array(outNorm),
    colors: new Float32Array(outCol),
    indices: cornerGroup,
    vertexCount: outVerts,
  };
}

function simplifyBucketGeometry(rawPositions, rawColors, rawTriCount, ratio, maxError) {
  if (rawTriCount === 0) return null;

  // 1) Soldadura por posición cuantizada (~3 cm de rejilla) + metadatos
  //    COLOR_0 (categoryCode a paso 1/12 y seedA a paso 1/16): todos los
  //    triángulos adyacentes DEL MISMO edificio comparten topología aunque sus
  //    normales difieran (esquinas a 90°), mientras que edificios vecinos con
  //    distinta semilla NUNCA sueldan vértices ni mezclan colores entre sí.
  const vertexMap = new Map();
  const weldedPos = [];
  const weldedCol = [];
  const indices = new Uint32Array(rawTriCount * 3);

  const vertCount = rawTriCount * 3;
  let uniqueCount = 0;

  for (let i = 0; i < vertCount; i++) {
    const p3 = i * 3;
    const c4 = i * 4;
    const x = rawPositions[p3];
    const y = rawPositions[p3 + 1];
    const z = rawPositions[p3 + 2];
    const r = rawColors[c4];
    const g = rawColors[c4 + 1];
    const b = rawColors[c4 + 2];
    const a = rawColors[c4 + 3];

    const key = `${Math.round(x * 32)},${Math.round(y * 32)},${Math.round(z * 32)},${Math.round(r * 12)}|${Math.round(g * 16)}`;

    let idx = vertexMap.get(key);
    if (idx === undefined) {
      idx = uniqueCount++;
      vertexMap.set(key, idx);
      weldedPos.push(x, y, z);
      weldedCol.push(r, g, b, a);
    }
    indices[i] = idx;
  }

  const posArr = new Float32Array(weldedPos);
  const colArr = new Float32Array(weldedCol);

  const cleanIdx = [];
  for (let t = 0; t < rawTriCount; t++) {
    const a = indices[t * 3], b = indices[t * 3 + 1], c = indices[t * 3 + 2];
    if (a !== b && b !== c && a !== c) cleanIdx.push(a, b, c);
  }
  if (cleanIdx.length === 0) return null;
  const idxU32 = new Uint32Array(cleanIdx);

  // 2) Simplificación CON ['LockBorder']: el borde de cada isla/torre queda
  //    sellado (sin aletas flotantes ni "rotilla") y el maxError normalizado
  //    tan pequeño solo recorta vértices redundantes, conservando la
  //    silueta esculpida real con muchísimos vértices.
  let finalIndices = idxU32;
  if (idxU32.length / 3 > 80 && ratio < 0.99) {
    const rawTargetTris = Math.max(36, Math.floor((idxU32.length / 3) * ratio));
    try {
      const [dstIdx] = MeshoptSimplifier.simplify(
        idxU32,
        posArr,
        3,
        rawTargetTris * 3,
        maxError,
        ['LockBorder']
      );
      if (dstIdx.length >= 12) {
        finalIndices = dstIdx;
      }
    } catch {
      finalIndices = idxU32;
    }
  }

  // 3) Reconstrucción de normales tras simplificar: la soldadura por posición
  //    fusiona esquinas a 90°, así que se re-derivan con crease de 42° (nítido
  //    donde el ángulo lo exige, suave en puentes/torres/rocas), garantizando
  //    vertexCount <= 65535 por primitiva bucket.
  let built = null;
  for (const creaseCos of CREASE_COS_LADDER) {
    built = buildCreaseNormals(posArr, colArr, uniqueCount, finalIndices, creaseCos);
    if (built.vertexCount <= 65535) break;
  }

  const compactIndices =
    built.vertexCount <= 65535
      ? new Uint16Array(built.indices)
      : new Uint32Array(built.indices);

  return {
    positions: built.positions,
    normals: built.normals,
    colors: built.colors,
    indices: compactIndices,
    indexComponentType: built.vertexCount <= 65535 ? 5123 : 5125,
    vertexCount: built.vertexCount,
    triCount: compactIndices.length / 3,
  };
}

function writeChunkGlb(outPath, primitivesData) {
  const accessors = [];
  const bufferViews = [];
  const materials = [];
  const gltfPrimitives = [];
  const binChunks = [];
  let byteOffset = 0;
  const pad4 = (n) => (n + 3) & ~3;

  for (const prim of primitivesData) {
    const { bucketName, positions, normals, colors, indices, indexComponentType, vertexCount } = prim;
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < vertexCount; i++) {
      const i3 = i * 3;
      const x = positions[i3], y = positions[i3 + 1], z = positions[i3 + 2];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }

    const matIdx = materials.length;
    materials.push({ name: bucketName });

    const posBuf = Buffer.from(positions.buffer, positions.byteOffset, positions.byteLength);
    const posViewIdx = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: posBuf.length, target: 34962 });
    binChunks.push(posBuf);
    byteOffset += posBuf.length;
    const posAccIdx = accessors.length;
    accessors.push({
      bufferView: posViewIdx,
      componentType: 5126,
      count: vertexCount,
      type: 'VEC3',
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ],
    });

    const normBuf = Buffer.from(normals.buffer, normals.byteOffset, normals.byteLength);
    const normViewIdx = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: normBuf.length, target: 34962 });
    binChunks.push(normBuf);
    byteOffset += normBuf.length;
    const normAccIdx = accessors.length;
    accessors.push({
      bufferView: normViewIdx,
      componentType: 5126,
      count: vertexCount,
      type: 'VEC3',
    });

    // COLOR_0 (VEC4, Uint8 normalized): categoryCode (r), seedA (g), seedB (b), flag (a)
    // Ahorra 12 bytes/vértice (4× más compacto que Float32) para respetar el límite de 50 MB.
    const colU8 = new Uint8Array(colors.length);
    for (let c = 0; c < colors.length; c++) {
      const v = colors[c];
      colU8[c] = v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255);
    }
    const colBuf = Buffer.from(colU8.buffer, colU8.byteOffset, colU8.byteLength);
    const colViewIdx = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: colBuf.length, target: 34962 });
    binChunks.push(colBuf);
    byteOffset += colBuf.length;
    const colorAccIdx = accessors.length;
    accessors.push({
      bufferView: colViewIdx,
      componentType: 5121,
      normalized: true,
      count: vertexCount,
      type: 'VEC4',
    });

    const idxBuf = Buffer.from(indices.buffer, indices.byteOffset, indices.byteLength);
    const idxViewIdx = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: idxBuf.length, target: 34963 });
    binChunks.push(idxBuf);
    byteOffset += idxBuf.length;
    const pad = pad4(byteOffset) - byteOffset;
    if (pad > 0) {
      binChunks.push(Buffer.alloc(pad));
      byteOffset += pad;
    }
    const idxAccIdx = accessors.length;
    accessors.push({
      bufferView: idxViewIdx,
      componentType: indexComponentType,
      count: indices.length,
      type: 'SCALAR',
    });

    gltfPrimitives.push({
      attributes: { POSITION: posAccIdx, NORMAL: normAccIdx, COLOR_0: colorAccIdx },
      indices: idxAccIdx,
      material: matIdx,
      mode: 4,
    });
  }

  const gltfJson = {
    asset: { version: '2.0', generator: 'outorbit-hekseville-chunker' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: path.basename(outPath, '.glb') }],
    meshes: [{ name: path.basename(outPath, '.glb'), primitives: gltfPrimitives }],
    materials,
    bufferViews,
    accessors,
    buffers: [{ byteLength: byteOffset }],
  };

  let jsonBuf = Buffer.from(JSON.stringify(gltfJson), 'utf8');
  const jsonPad = pad4(jsonBuf.length) - jsonBuf.length;
  if (jsonPad > 0) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)]);

  const binBuf = Buffer.concat(binChunks);
  const totalLen = 12 + 8 + jsonBuf.length + 8 + binBuf.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLen, 8);

  const jsonHdr = Buffer.alloc(8);
  jsonHdr.writeUInt32LE(jsonBuf.length, 0);
  jsonHdr.writeUInt32LE(0x4e4f534a, 4);

  const binHdr = Buffer.alloc(8);
  binHdr.writeUInt32LE(binBuf.length, 0);
  binHdr.writeUInt32LE(0x004e4942, 4);

  fs.writeFileSync(outPath, Buffer.concat([header, jsonHdr, jsonBuf, binHdr, binBuf]));
  return totalLen;
}

function processDistrict(cfg) {
  const filePath = path.join(SRC_DIR, cfg.file);
  const { gltf, bin } = readGlb(filePath);
  const nodes = gltf.nodes || [];
  const meshes = gltf.meshes || [];

  const parsedMeshes = meshes.map((m) =>
    (m.primitives || []).map((pr) => ({
      pos: getAccessorView(gltf, bin, pr.attributes.POSITION),
      idx: pr.indices !== undefined ? getAccessorView(gltf, bin, pr.indices) : null,
    }))
  );

  const meshBounds = meshes.map((m) => {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const pr of m.primitives || []) {
      const a = gltf.accessors[pr.attributes.POSITION];
      if (a.min && a.max) {
        for (let k = 0; k < 3; k++) {
          if (a.min[k] < min[k]) min[k] = a.min[k];
          if (a.max[k] > max[k]) max[k] = a.max[k];
        }
      }
    }
    return { min, max };
  });
  const meshTris = meshes.map((m) =>
    (m.primitives || []).reduce((s, pr) => {
      if (pr.indices !== undefined) return s + gltf.accessors[pr.indices].count / 3;
      return s + gltf.accessors[pr.attributes.POSITION].count / 3;
    }, 0)
  );

  let rawTris = 0;
  let skippedLodTris = 0;
  const pleajeuneSpawnCandidates = [];
  // Filtro de cielo abierto del spawn: AABBs de los triángulos sólidos en
  // una ventana holgada alrededor del bulevar, indexados en una rejilla XZ
  // gruesa para el test de columna por candidato (O(1) por consulta).
  const OS_GRID = 8;
  const openSkyTriMin = [];
  const openSkyTriMax = [];
  let openSkyTriCount = 0;
  const openSkyGrid = new Map();

  // Vuelca la geometría del distrito en tiles de `cellSize` m y fusiona las
  // tiles huérfanas (<700 tris) en la tile grande más cercana. Se re-ejecuta
  // con celdas más finas si una tile excede el presupuesto de chunk.
  function collectTiles(cellSize) {
    const tiles = new Map();
    rawTris = 0;
    skippedLodTris = 0;
    pleajeuneSpawnCandidates.length = 0;
    openSkyTriMin.length = 0;
    openSkyTriMax.length = 0;
    openSkyTriCount = 0;
    openSkyGrid.clear();

    function ensureTile(key) {
    let t = tiles.get(key);
    if (!t) {
      t = { key, buckets: BUCKETS.map(() => ({ pos: [], col: [], tris: 0 })), totalTris: 0 };
      tiles.set(key, t);
    }
    return t;
  }

  function walk(nodeIdx, parentMat, variantBias, activeMeta) {
    const node = nodes[nodeIdx];
    const name = node.name || '';
    if (shouldSkipNode(name)) return;

    const local = nodeLocalMat4(node);
    const world = mulMat4(parentMat, local);
    const nextVariant = name.startsWith('building_') || name.startsWith('uji_')
      ? hashNameColorVariant(name)
      : variantBias;
    // Metadatos COLOR_0: cada nodo arquitectónico calcula los suyos a partir
    // del nombre + traslación mundial; el resto hereda los del ancestro.
    const meta = computeNodeMeta(name, world) || activeMeta;
    const metaR = meta[0];
    const metaG = meta[1];
    const metaB = meta[2];
    const metaA = meta[3];

    if (node.mesh !== undefined) {
      const cat = classifyNodeCategory(name);
      const prims = parsedMeshes[node.mesh];

      const m0 = world[0], m1 = world[1], m2 = world[2];
      const m4 = world[4], m5 = world[5], m6 = world[6];
      const m8 = world[8], m9 = world[9], m10 = world[10];
      const m12 = world[12], m13 = world[13], m14 = world[14];

      for (const pr of prims) {
        const { pos, idx } = pr;
        const triCount = idx ? Math.floor(idx.length / 3) : Math.floor(pos.length / 9);
        for (let t = 0; t < triCount; t++) {
          const i0 = idx ? idx[t * 3] : t * 3;
          const i1 = idx ? idx[t * 3 + 1] : t * 3 + 1;
          const i2 = idx ? idx[t * 3 + 2] : t * 3 + 2;

          const p0x = pos[i0 * 3], p0y = pos[i0 * 3 + 1], p0z = pos[i0 * 3 + 2];
          const p1x = pos[i1 * 3], p1y = pos[i1 * 3 + 1], p1z = pos[i1 * 3 + 2];
          const p2x = pos[i2 * 3], p2y = pos[i2 * 3 + 1], p2z = pos[i2 * 3 + 2];

          const ax = m0 * p0x + m4 * p0y + m8 * p0z + m12;
          const ay = m1 * p0x + m5 * p0y + m9 * p0z + m13;
          const az = m2 * p0x + m6 * p0y + m10 * p0z + m14;

          const bx = m0 * p1x + m4 * p1y + m8 * p1z + m12;
          const by = m1 * p1x + m5 * p1y + m9 * p1z + m13;
          const bz = m2 * p1x + m6 * p1y + m10 * p1z + m14;

          const cx = m0 * p2x + m4 * p2y + m8 * p2z + m12;
          const cy = m1 * p2x + m5 * p2y + m9 * p2z + m13;
          const cz = m2 * p2x + m6 * p2y + m10 * p2z + m14;

          const mx = (ax + bx + cx) / 3;
          const my = (ay + by + cy) / 3;
          const mz = (az + bz + cz) / 3;

          if (Math.abs(mx) > MAX_ABS_XZ || Math.abs(mz) > MAX_ABS_XZ || my < cfg.minY || my > cfg.maxY) {
            continue;
          }

          // Recorta el conector de puente/rail hacia Pilar Central (z=0):
          // pleajeune conserva el stub norte (mz < 124) fuera del build sin
          // tocar las islas a1..l2 (cuyos bounds empiezan en z = 126.8).
          if (cfg.id === 'pleajeune' && mz < 124) continue;

          const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
          const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
          let fnx = e1y * e2z - e1z * e2y;
          let fny = e1z * e2x - e1x * e2z;
          let fnz = e1x * e2y - e1y * e2x;
          const flen = Math.hypot(fnx, fny, fnz);
          if (flen < 1e-6) continue;
          fnx /= flen; fny /= flen; fnz /= flen;

          rawTris++;
          const bIdx = pickTriBucket(cat, fny, nextVariant);

          // Candidato caminable del bulevar exterior de Pleajeune (piedra
          // casi horizontal en la zona de cielo abierto junto a la noria).
          if (
            cfg.id === 'pleajeune' &&
            bIdx === BUCKET_INDEX.col_stone &&
            fny > 0.92 &&
            mx > -25 &&
            mx < 60 &&
            mz > 240 &&
            mz < 325 &&
            my > 145 &&
            my < 195
          ) {
            pleajeuneSpawnCandidates.push([mx, my, mz]);
          }

          // AABB del triángulo sólido si roza la ventana del bulevar: alimenta
          // el filtro de cielo abierto (columna sobre cada candidato).
          if (cfg.id === 'pleajeune') {
            const tMinX = Math.min(ax, bx, cx);
            const tMaxX = Math.max(ax, bx, cx);
            const tMinY = Math.min(ay, by, cy);
            const tMaxY = Math.max(ay, by, cy);
            const tMinZ = Math.min(az, bz, cz);
            const tMaxZ = Math.max(az, bz, cz);
            if (tMaxX > -30 && tMinX < 65 && tMaxZ > 235 && tMinZ < 330) {
              const tIdx = openSkyTriCount++;
              openSkyTriMin.push(tMinX, tMinY, tMinZ);
              openSkyTriMax.push(tMaxX, tMaxY, tMaxZ);
              const ogx0 = Math.floor(tMinX / OS_GRID);
              const ogx1 = Math.floor(tMaxX / OS_GRID);
              const ogz0 = Math.floor(tMinZ / OS_GRID);
              const ogz1 = Math.floor(tMaxZ / OS_GRID);
              for (let ogz = ogz0; ogz <= ogz1; ogz++) {
                for (let ogx = ogx0; ogx <= ogx1; ogx++) {
                  const okey = ogx * 1000 + ogz;
                  let olist = openSkyGrid.get(okey);
                  if (!olist) {
                    olist = [];
                    openSkyGrid.set(okey, olist);
                  }
                  olist.push(tIdx);
                }
              }
            }
          }

          const gx = Math.floor(mx / cellSize);
          const gz = Math.floor(mz / cellSize);
          const tile = ensureTile(`${gx}_${gz}`);
          const bkt = tile.buckets[bIdx];

          bkt.pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
          bkt.col.push(
            metaR, metaG, metaB, metaA,
            metaR, metaG, metaB, metaA,
            metaR, metaG, metaB, metaA
          );
          bkt.tris++;
          tile.totalTris++;
        }
      }
    }

    const skipLod = detectRedundantLodChildren(gltf, nodes, meshBounds, meshTris, node);
    for (const ch of node.children || []) {
      if (skipLod && skipLod.has(ch)) {
        skippedLodTris++;
        continue;
      }
      walk(ch, world, nextVariant, meta);
    }
  }

  const rootNodes = (gltf.scenes && gltf.scenes[0] ? gltf.scenes[0].nodes : []) || [];
  const ident = new Float64Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
  for (const r of rootNodes) {
    const rname = (nodes[r].name || '').toLowerCase();
    if (SKIP_ROOT_SUBSTR.some((s) => rname.includes(s))) continue;
    walk(r, ident, 0, DEFAULT_NODE_META);
  }

  const bigTiles = [...tiles.values()].filter((t) => t.totalTris >= 700);
  const smallTiles = [...tiles.values()].filter((t) => t.totalTris < 700 && t.totalTris > 0);
  if (bigTiles.length > 0 && smallTiles.length > 0) {
    const parseCoord = (k) => k.split('_').map(Number);
    for (const st of smallTiles) {
      const [sx, sz] = parseCoord(st.key);
      let best = bigTiles[0];
      let bestDist = Infinity;
      for (const bt of bigTiles) {
        const [bx, bz] = parseCoord(bt.key);
        const d = (bx - sx) ** 2 + (bz - sz) ** 2;
        if (d < bestDist) {
          bestDist = d;
          best = bt;
        }
      }
      for (let i = 0; i < BUCKETS.length; i++) {
        if (st.buckets[i].tris === 0) continue;
        best.buckets[i].pos.push(...st.buckets[i].pos);
        best.buckets[i].col.push(...st.buckets[i].col);
        best.buckets[i].tris += st.buckets[i].tris;
        best.totalTris += st.buckets[i].tris;
      }
      tiles.delete(st.key);
    }
    }
    return tiles;
  }

  // cellSize adaptativo: si la tile más grande estima >40k tris simplificados,
  // se re-tesela con celdas más finas (mínimo 95 m) para equilibrar los
  // chunks alrededor de ~8k-25k tris (máx ~40k / ~1.5 MB por chunk).
  const estimateTileTris = (t) => {
    let s = 0;
    for (let i = 0; i < BUCKETS.length; i++) s += t.buckets[i].tris * BUCKETS[i].ratio;
    return s;
  };
  let activeCellSize = cfg.cellSize;
  let tiles = collectTiles(activeCellSize);
  let maxEstimate = 0;
  for (const t of tiles.values()) maxEstimate = Math.max(maxEstimate, estimateTileTris(t));
  while (maxEstimate > 40000 && activeCellSize > 95) {
    activeCellSize = Math.max(95, Math.round(activeCellSize * 0.8));
    tiles = collectTiles(activeCellSize);
    maxEstimate = 0;
    for (const t of tiles.values()) maxEstimate = Math.max(maxEstimate, estimateTileTris(t));
  }

  // Cielo abierto garantizado: se descarta todo candidato con CUALQUIER
  // triángulo sólido en la columna (|x-cx| < 4, |z-cz| < 4) entre cy + 1.5 y
  // cy + 18 — así el spawn nunca cae dentro de una arcade ni de un pasillo
  // techado bajo el bulevar superior.
  const openSkyKept = [];
  for (const cand of pleajeuneSpawnCandidates) {
    const cX = cand[0];
    const cY = cand[1];
    const cZ = cand[2];
    let blocked = false;
    const ogx0 = Math.floor((cX - 4) / OS_GRID);
    const ogx1 = Math.floor((cX + 4) / OS_GRID);
    const ogz0 = Math.floor((cZ - 4) / OS_GRID);
    const ogz1 = Math.floor((cZ + 4) / OS_GRID);
    for (let ogz = ogz0; ogz <= ogz1 && !blocked; ogz++) {
      for (let ogx = ogx0; ogx <= ogx1 && !blocked; ogx++) {
        const olist = openSkyGrid.get(ogx * 1000 + ogz);
        if (!olist) continue;
        for (let k = 0; k < olist.length; k++) {
          const i3 = olist[k] * 3;
          if (
            openSkyTriMax[i3] > cX - 4 &&
            openSkyTriMin[i3] < cX + 4 &&
            openSkyTriMax[i3 + 2] > cZ - 4 &&
            openSkyTriMin[i3 + 2] < cZ + 4 &&
            openSkyTriMax[i3 + 1] > cY + 1.5 &&
            openSkyTriMin[i3 + 1] < cY + 18
          ) {
            blocked = true;
            break;
          }
        }
      }
    }
    if (!blocked) openSkyKept.push(cand);
  }
  pleajeuneSpawnCandidates.length = 0;
  pleajeuneSpawnCandidates.push(...openSkyKept);

  const chunkMetas = [];
  let outDistrictTris = 0;
  let outDistrictBytes = 0;

  for (const tile of tiles.values()) {
    const primitivesData = [];
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    let chunkTris = 0;

    for (let i = 0; i < BUCKETS.length; i++) {
      const bkt = tile.buckets[i];
      if (bkt.tris === 0) continue;
      const spec = BUCKETS[i];
      const simp = simplifyBucketGeometry(bkt.pos, bkt.col, bkt.tris, spec.ratio, spec.maxError * ERR_MUL);
      if (process.env.HEK_DEBUG && simp) {
        console.log(
          `    [debug] ${spec.name}: raw=${bkt.tris} -> ${simp.triCount} (target ${(bkt.tris * spec.ratio).toFixed(0)})`
        );
      }
      if (!simp || simp.triCount === 0) continue;

      primitivesData.push({ bucketName: spec.name, ...simp });
      chunkTris += simp.triCount;
      for (let v = 0; v < simp.vertexCount; v++) {
        const x = simp.positions[v * 3];
        const y = simp.positions[v * 3 + 1];
        const z = simp.positions[v * 3 + 2];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      }
    }

    if (primitivesData.length === 0) continue;

    const cleanKey = tile.key.replace(/-/g, 'm');
    const chunkId = `${cfg.id}_${cleanKey}`;
    const fileName = `${chunkId}.glb`;
    const bytes = writeChunkGlb(path.join(OUT_DIR, fileName), primitivesData);

    const cx = (minX + maxX) * 0.5;
    const cy = (minY + maxY) * 0.5;
    const cz = (minZ + maxZ) * 0.5;
    const radius = Math.hypot(maxX - cx, maxY - cy, maxZ - cz);

    chunkMetas.push({
      id: chunkId,
      district: cfg.id,
      file: fileName,
      priority: cfg.priority,
      tris: chunkTris,
      bytes,
      boundsMin: [Number(minX.toFixed(2)), Number(minY.toFixed(2)), Number(minZ.toFixed(2))],
      boundsMax: [Number(maxX.toFixed(2)), Number(maxY.toFixed(2)), Number(maxZ.toFixed(2))],
      center: [Number(cx.toFixed(2)), Number(cy.toFixed(2)), Number(cz.toFixed(2))],
      radius: Number(radius.toFixed(2)),
    });
    outDistrictTris += chunkTris;
    outDistrictBytes += bytes;
  }

  console.log(
    `[${cfg.id}] cellSize=${activeCellSize} rawKept=${rawTris.toLocaleString()} tris (dedupedLODNodes=${skippedLodTris}) -> ${chunkMetas.length} chunks, ${outDistrictTris.toLocaleString()} tris, ${(outDistrictBytes / 1024 / 1024).toFixed(2)} MB`
  );
  return { chunkMetas, pleajeuneSpawnCandidates };
}

async function main() {
  await MeshoptSimplifier.ready;
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const old of fs.readdirSync(OUT_DIR)) {
    fs.unlinkSync(path.join(OUT_DIR, old));
  }

  const allChunks = [];
  let spawnPos = [20, 168, 285];
  let spawnYaw = Math.atan2(-(70 - spawnPos[0]), -(430 - spawnPos[2]));
  for (const cfg of DISTRICTS) {
    const { chunkMetas, pleajeuneSpawnCandidates } = processDistrict(cfg);
    allChunks.push(...chunkMetas);
    if (cfg.id === 'pleajeune' && pleajeuneSpawnCandidates.length > 0) {
      // Bulevar de cielo abierto: candidato caminable más cercano a
      // (20, 168, 285), ya filtrado sin techos sobre la cabeza.
      pleajeuneSpawnCandidates.sort((a, b) => {
        const da = (a[0] - 20) ** 2 + (a[1] - 168) ** 2 + (a[2] - 285) ** 2;
        const db = (b[0] - 20) ** 2 + (b[1] - 168) ** 2 + (b[2] - 285) ** 2;
        return da - db;
      });
      const pick = pleajeuneSpawnCandidates[0];
      spawnPos = [Number(pick[0].toFixed(2)), Number((pick[1] + 0.55).toFixed(2)), Number(pick[2].toFixed(2))];
      // Mirando al sur por el bulevar, hacia la noria de Pleajeune.
      spawnYaw = Math.atan2(-(70 - pick[0]), -(430 - pick[2]));
    }
  }

  // Prioridad 0: todos los chunks en un radio horizontal de 240 m del spawn
  // (carga concurrente completa antes de desbloquear al jugador); el resto
  // de Pleajeune es prioridad 1.
  for (const c of allChunks) {
    c.priority =
      Math.hypot(c.center[0] - spawnPos[0], c.center[2] - spawnPos[2]) <= 240 ? 0 : 1;
  }

  const totalTris = allChunks.reduce((s, c) => s + c.tris, 0);
  const totalMB = allChunks.reduce((s, c) => s + c.bytes, 0) / (1024 * 1024);

  const manifest = {
    version: 2,
    totalChunks: allChunks.length,
    totalTris,
    spawnPos,
    spawnYaw: Number(spawnYaw.toFixed(4)),
    chunks: allChunks,
  };
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`\nTOTAL: ${allChunks.length} chunks | ${totalTris.toLocaleString()} tris | ${totalMB.toFixed(2)} MB | spawn=${JSON.stringify(spawnPos)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
