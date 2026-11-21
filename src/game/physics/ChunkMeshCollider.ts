import * as THREE from 'three';
import type { CityDistrictId } from '../types';
import type { CityCollisionResult } from '../math/flatCityPhysics';
import type { HeksevilleDistrictId } from '../render/heksevilleChunkMaterials';

// ============================================================================
// ChunkMeshCollider — Colisión de malla triangular real por chunk Hekseville.
//
// Rejilla espacial 3D uniforme (celdas de 8 m) por chunk cargado, horneada en
// typed arrays compactos (offsets + lista de triángulos por celda): CERO
// allocations por frame en `resolvePlayer` y `raycast`. Cada triángulo de
// colisión se guarda plano en espacio mundo como v0(3) v1(3) v2(3) n(3) =
// 12 floats. Solo se indexan las mallas `col_*` (los buckets `vis_glow` y
// `vis_foliage` son decorativos y nunca colisionan).
// ============================================================================

const CELL_SIZE = 8;
const CELL_INV = 1 / CELL_SIZE;
/** Techo de celdas densas por chunk (si se excede: celda única con todo el chunk). */
const MAX_GRID_CELLS = 1_000_000;
/** Banda de asentamiento sobre suelos/escaleras/pendientes caminables. */
const SURFACE_SNAP_BAND = 0.55;
/** Margen del test AABB cápsula-vs-chunk. */
const CHUNK_AABB_MARGIN = 2;
/** Holgura extra del AABB de la cápsula del jugador. */
const CAPSULE_PAD = 0.5;
const SOLVER_ITERATIONS = 3;
/** dot(normalTriángulo, up) por encima del cual la superficie es caminable. */
const WALKABLE_DOT = 0.48;
/** dot(normalTriángulo, up) por debajo del cual la superficie es techo. */
const CEILING_DOT = -0.5;
const DEFAULT_PLAYER_HEIGHT = 1.65;

// ----------------------------------------------------------------------------
// Distritos: Hekseville 1:1
// ----------------------------------------------------------------------------

export function heksevilleToCityDistrict(d: HeksevilleDistrictId): CityDistrictId {
  return d === 'pilar' ? 'pillar' : d;
}

interface DistrictInfoEntry {
  id: CityDistrictId;
  name: string;
  subtitle: string;
  /** Centro representativo XZ para el fallback por cercanía. */
  x: number;
  z: number;
}

const DISTRICT_ANCHORS: readonly DistrictInfoEntry[] = [
  { id: 'pleajeune', name: 'Pleajeune', subtitle: 'Bulevares de Neón y Noria', x: 20, z: 320 },
  { id: 'vendecentre', name: 'Vendecentre', subtitle: 'Rascacielos y Viaducto', x: -290, z: -110 },
];

/** Devuelve la info del distrito real de Hekseville bajo `pos` (coordenadas mundo). */
export function getHeksevilleDistrictInfo(pos: THREE.Vector3): {
  id: CityDistrictId;
  name: string;
  subtitle: string;
} {
  const x = pos.x;
  const z = pos.z;
  if (z >= 55 && x > -265) {
    return { id: 'pleajeune', name: 'Pleajeune', subtitle: 'Bulevares de Neón y Noria' };
  }
  // Fallback: distrito representativo más cercano (Pleajeune (20, 320) vs
  // Vendecentre (-290, -110)); solo existen estos dos distritos.
  let best = DISTRICT_ANCHORS[0];
  let bestDist = Infinity;
  for (let i = 0; i < DISTRICT_ANCHORS.length; i++) {
    const entry = DISTRICT_ANCHORS[i];
    const d = (entry.x - x) * (entry.x - x) + (entry.z - z) * (entry.z - z);
    if (d < bestDist) {
      bestDist = d;
      best = entry;
    }
  }
  return { id: best.id, name: best.name, subtitle: best.subtitle };
}

// ----------------------------------------------------------------------------
// Registro por chunk
// ----------------------------------------------------------------------------

interface ChunkGridRecord {
  id: string;
  district: HeksevilleDistrictId;
  triCount: number;
  /** Triángulos planos: v0(3) v1(3) v2(3) n(3) por triángulo (espacio mundo). */
  tris: Float32Array;
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  /** Origen de la rejilla (esquina de celda) en metros y en unidades de celda. */
  originX: number;
  originY: number;
  originZ: number;
  gx0: number;
  gy0: number;
  gz0: number;
  dimX: number;
  dimY: number;
  dimZ: number;
  /** Offsets acumulados por celda (dimX*dimY*dimZ + 1) hacia `cellTris`. */
  cellStart: Int32Array;
  /** Índices de triángulo concatenados por celda. */
  cellTris: Int32Array;
  /** Sello de visita por triángulo para deduplicar candidatos sin GC. */
  visitStamp: Int32Array;
}

/**
 * Solo colisionan las mallas cuyo nombre (o el de su material) identifica un
 * bucket de colisión `col_*`. Se acepta también el nombre de material de la
 * librería (`hekseville:<distrito>:col_*`); `vis_glow`/`vis_foliage` nunca
 * empiezan por `col_` y quedan fuera.
 */
function isCollisionSource(mesh: THREE.Mesh): boolean {
  if (mesh.name.startsWith('col_')) return true;
  const material = mesh.material;
  if (!material) return false;
  if (Array.isArray(material)) {
    for (let i = 0; i < material.length; i++) {
      const name = material[i].name;
      if (name.startsWith('col_') || name.includes(':col_')) return true;
    }
    return false;
  }
  return material.name.startsWith('col_') || material.name.includes(':col_');
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// ----------------------------------------------------------------------------
// Scratch de módulo (cero allocations por frame)
// ----------------------------------------------------------------------------

const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _vC = new THREE.Vector3();

const _result: CityCollisionResult = {
  grounded: false,
  hitWall: false,
  groundNormal: new THREE.Vector3(0, 1, 0),
};

/** Contador de consultas para los sellos de deduplicación. */
let _queryId = 0;

// Buffers de candidatos de `resolvePlayer` (crecen solo al registrar chunks más grandes).
let _candChunk = new Int32Array(256);
let _candTri = new Int32Array(256);

// Buffers de candidatos de `raycast`.
let _rayChunk = new Int32Array(64);
let _rayTMin = new Float64Array(64);
let _rayTMax = new Float64Array(64);

// Salida escalar de `closestPointOnTriangle`.
let _cpX = 0;
let _cpY = 0;
let _cpZ = 0;

function growInt32(src: Int32Array, minLen: number): Int32Array<ArrayBuffer> {
  const next = new Int32Array(Math.max(minLen, src.length * 2));
  next.set(src);
  return next;
}

/**
 * Punto más cercano del triángulo (v0, v1, v2 de `tris[base..base+8]`) al punto
 * (px, py, pz). Escribe el resultado en `_cpX/_cpY/_cpZ` (Ericson, Real-Time
 * Collision Detection). Cero allocations.
 */
function closestPointOnTriangle(
  tris: Float32Array,
  base: number,
  px: number,
  py: number,
  pz: number
): void {
  const ax = tris[base];
  const ay = tris[base + 1];
  const az = tris[base + 2];
  const bx = tris[base + 3];
  const by = tris[base + 4];
  const bz = tris[base + 5];
  const cx = tris[base + 6];
  const cy = tris[base + 7];
  const cz = tris[base + 8];

  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const acx = cx - ax;
  const acy = cy - ay;
  const acz = cz - az;

  const apx = px - ax;
  const apy = py - ay;
  const apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) {
    _cpX = ax;
    _cpY = ay;
    _cpZ = az;
    return;
  }

  const bpx = px - bx;
  const bpy = py - by;
  const bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) {
    _cpX = bx;
    _cpY = by;
    _cpZ = bz;
    return;
  }

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const denom = d1 - d3;
    const v = denom > 1e-12 ? d1 / denom : 0;
    _cpX = ax + abx * v;
    _cpY = ay + aby * v;
    _cpZ = az + abz * v;
    return;
  }

  const cpx = px - cx;
  const cpy = py - cy;
  const cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) {
    _cpX = cx;
    _cpY = cy;
    _cpZ = cz;
    return;
  }

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const denom = d2 - d6;
    const w = denom > 1e-12 ? d2 / denom : 0;
    _cpX = ax + acx * w;
    _cpY = ay + acy * w;
    _cpZ = az + acz * w;
    return;
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const denom = d4 - d3 + (d5 - d6);
    const v = denom > 1e-12 ? (d4 - d3) / denom : 0;
    _cpX = bx + (cx - bx) * v;
    _cpY = by + (cy - by) * v;
    _cpZ = bz + (cz - bz) * v;
    return;
  }

  const denom = va + vb + vc;
  if (denom < 1e-12) {
    _cpX = ax;
    _cpY = ay;
    _cpZ = az;
    return;
  }
  const v = vb / denom;
  const w = vc / denom;
  _cpX = ax + abx * v + acx * w;
  _cpY = ay + aby * v + acy * w;
  _cpZ = az + abz * v + acz * w;
}

// ----------------------------------------------------------------------------
// Collider principal
// ----------------------------------------------------------------------------

export class ChunkMeshCollider {
  private chunks: ChunkGridRecord[] = [];
  private _triangleCount = 0;

  /** Indexa los triángulos `col_*` de un chunk ya cargado en la rejilla espacial. */
  registerChunk(id: string, district: HeksevilleDistrictId, meshes: readonly THREE.Mesh[]): void {
    const sources: THREE.Mesh[] = [];
    for (let i = 0; i < meshes.length; i++) {
      if (isCollisionSource(meshes[i])) sources.push(meshes[i]);
    }
    if (sources.length === 0) return;

    let triCapacity = 0;
    for (let i = 0; i < sources.length; i++) {
      const geo = sources[i].geometry;
      const posAttr = geo.getAttribute('position');
      if (!posAttr) continue;
      const index = geo.getIndex();
      triCapacity += index ? Math.floor(index.count / 3) : Math.floor(posAttr.count / 3);
    }
    if (triCapacity === 0) return;

    const tris = new Float32Array(triCapacity * 12);
    let triCount = 0;
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;

    for (let i = 0; i < sources.length; i++) {
      const mesh = sources[i];
      mesh.updateMatrixWorld(true);
      const geo = mesh.geometry;
      const posAttr = geo.getAttribute('position');
      if (!posAttr) continue;
      const index = geo.getIndex();
      const meshTriCount = index ? Math.floor(index.count / 3) : Math.floor(posAttr.count / 3);

      for (let t = 0; t < meshTriCount; t++) {
        const i0 = index ? index.getX(t * 3) : t * 3;
        const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
        const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
        _vA.fromBufferAttribute(posAttr, i0).applyMatrix4(mesh.matrixWorld);
        _vB.fromBufferAttribute(posAttr, i1).applyMatrix4(mesh.matrixWorld);
        _vC.fromBufferAttribute(posAttr, i2).applyMatrix4(mesh.matrixWorld);

        const e1x = _vB.x - _vA.x;
        const e1y = _vB.y - _vA.y;
        const e1z = _vB.z - _vA.z;
        const e2x = _vC.x - _vA.x;
        const e2y = _vC.y - _vA.y;
        const e2z = _vC.z - _vA.z;
        let nx = e1y * e2z - e1z * e2y;
        let ny = e1z * e2x - e1x * e2z;
        let nz = e1x * e2y - e1y * e2x;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        // Área = len / 2: descartar degenerados (área < 1e-5).
        if (len < 2e-5) continue;
        nx /= len;
        ny /= len;
        nz /= len;

        const base = triCount * 12;
        tris[base] = _vA.x;
        tris[base + 1] = _vA.y;
        tris[base + 2] = _vA.z;
        tris[base + 3] = _vB.x;
        tris[base + 4] = _vB.y;
        tris[base + 5] = _vB.z;
        tris[base + 6] = _vC.x;
        tris[base + 7] = _vC.y;
        tris[base + 8] = _vC.z;
        tris[base + 9] = nx;
        tris[base + 10] = ny;
        tris[base + 11] = nz;
        triCount++;

        if (_vA.x < minX) minX = _vA.x;
        if (_vA.x > maxX) maxX = _vA.x;
        if (_vA.y < minY) minY = _vA.y;
        if (_vA.y > maxY) maxY = _vA.y;
        if (_vA.z < minZ) minZ = _vA.z;
        if (_vA.z > maxZ) maxZ = _vA.z;
        if (_vB.x < minX) minX = _vB.x;
        if (_vB.x > maxX) maxX = _vB.x;
        if (_vB.y < minY) minY = _vB.y;
        if (_vB.y > maxY) maxY = _vB.y;
        if (_vB.z < minZ) minZ = _vB.z;
        if (_vB.z > maxZ) maxZ = _vB.z;
        if (_vC.x < minX) minX = _vC.x;
        if (_vC.x > maxX) maxX = _vC.x;
        if (_vC.y < minY) minY = _vC.y;
        if (_vC.y > maxY) maxY = _vC.y;
        if (_vC.z < minZ) minZ = _vC.z;
        if (_vC.z > maxZ) maxZ = _vC.z;
      }
    }
    if (triCount === 0) return;

    const finalTris = triCount === triCapacity ? tris : tris.slice(0, triCount * 12);

    const gx0 = Math.floor(minX * CELL_INV);
    const gy0 = Math.floor(minY * CELL_INV);
    const gz0 = Math.floor(minZ * CELL_INV);
    const dimX = Math.floor(maxX * CELL_INV) - gx0 + 1;
    const dimY = Math.floor(maxY * CELL_INV) - gy0 + 1;
    const dimZ = Math.floor(maxZ * CELL_INV) - gz0 + 1;
    const cellCount = dimX * dimY * dimZ;

    let cellStart: Int32Array;
    let cellTris: Int32Array;
    if (cellCount > MAX_GRID_CELLS) {
      // Rejilla demasiado densa: una sola celda con todo el chunk.
      cellStart = new Int32Array([0, triCount]);
      cellTris = new Int32Array(triCount);
      for (let t = 0; t < triCount; t++) cellTris[t] = t;
    } else {
      // Map temporal (solo al registrar) -> horneado a Int32Array compacto.
      const cellMap = new Map<number, number[]>();
      for (let t = 0; t < triCount; t++) {
        const base = t * 12;
        const tx0 = Math.min(tris[base], tris[base + 3], tris[base + 6]);
        const tx1 = Math.max(tris[base], tris[base + 3], tris[base + 6]);
        const ty0 = Math.min(tris[base + 1], tris[base + 4], tris[base + 7]);
        const ty1 = Math.max(tris[base + 1], tris[base + 4], tris[base + 7]);
        const tz0 = Math.min(tris[base + 2], tris[base + 5], tris[base + 8]);
        const tz1 = Math.max(tris[base + 2], tris[base + 5], tris[base + 8]);
        const cx0 = clamp(Math.floor(tx0 * CELL_INV) - gx0, 0, dimX - 1);
        const cx1 = clamp(Math.floor(tx1 * CELL_INV) - gx0, 0, dimX - 1);
        const cy0 = clamp(Math.floor(ty0 * CELL_INV) - gy0, 0, dimY - 1);
        const cy1 = clamp(Math.floor(ty1 * CELL_INV) - gy0, 0, dimY - 1);
        const cz0 = clamp(Math.floor(tz0 * CELL_INV) - gz0, 0, dimZ - 1);
        const cz1 = clamp(Math.floor(tz1 * CELL_INV) - gz0, 0, dimZ - 1);
        for (let cz = cz0; cz <= cz1; cz++) {
          const czOff = cz * dimX * dimY;
          for (let cy = cy0; cy <= cy1; cy++) {
            const cyOff = cy * dimX + czOff;
            for (let cx = cx0; cx <= cx1; cx++) {
              const key = cx + cyOff;
              let list = cellMap.get(key);
              if (!list) {
                list = [];
                cellMap.set(key, list);
              }
              list.push(t);
            }
          }
        }
      }

      let total = 0;
      cellMap.forEach((list) => {
        total += list.length;
      });
      cellStart = new Int32Array(cellCount + 1);
      cellMap.forEach((list, key) => {
        cellStart[key + 1] = list.length;
      });
      for (let c = 0; c < cellCount; c++) {
        cellStart[c + 1] += cellStart[c];
      }
      cellTris = new Int32Array(total);
      cellMap.forEach((list, key) => {
        let o = cellStart[key];
        for (let k = 0; k < list.length; k++) {
          cellTris[o++] = list[k];
        }
      });
    }

    this.chunks.push({
      id,
      district,
      triCount,
      tris: finalTris,
      minX,
      minY,
      minZ,
      maxX,
      maxY,
      maxZ,
      originX: gx0 * CELL_SIZE,
      originY: gy0 * CELL_SIZE,
      originZ: gz0 * CELL_SIZE,
      gx0,
      gy0,
      gz0,
      dimX,
      dimY,
      dimZ,
      cellStart,
      cellTris,
      visitStamp: new Int32Array(triCount),
    });
    this._triangleCount += triCount;
  }

  clear(): void {
    this.chunks.length = 0;
    this._triangleCount = 0;
  }

  get chunkCount(): number {
    return this.chunks.length;
  }

  get triangleCount(): number {
    return this._triangleCount;
  }

  /**
   * Recolecta (con deduplicación por sello) los triángulos de las celdas que
   * toca el AABB dado. Devuelve el número de candidatos en `_candChunk/_candTri`.
   */
  private gatherCandidates(
    loX: number,
    loY: number,
    loZ: number,
    hiX: number,
    hiY: number,
    hiZ: number
  ): number {
    _queryId++;
    let count = 0;
    for (let ch = 0; ch < this.chunks.length; ch++) {
      const chunk = this.chunks[ch];
      if (
        hiX < chunk.minX - CHUNK_AABB_MARGIN ||
        loX > chunk.maxX + CHUNK_AABB_MARGIN ||
        hiY < chunk.minY - CHUNK_AABB_MARGIN ||
        loY > chunk.maxY + CHUNK_AABB_MARGIN ||
        hiZ < chunk.minZ - CHUNK_AABB_MARGIN ||
        loZ > chunk.maxZ + CHUNK_AABB_MARGIN
      ) {
        continue;
      }

      const cx0 = clamp(Math.floor(loX * CELL_INV) - chunk.gx0, 0, chunk.dimX - 1);
      const cx1 = clamp(Math.floor(hiX * CELL_INV) - chunk.gx0, 0, chunk.dimX - 1);
      const cy0 = clamp(Math.floor(loY * CELL_INV) - chunk.gy0, 0, chunk.dimY - 1);
      const cy1 = clamp(Math.floor(hiY * CELL_INV) - chunk.gy0, 0, chunk.dimY - 1);
      const cz0 = clamp(Math.floor(loZ * CELL_INV) - chunk.gz0, 0, chunk.dimZ - 1);
      const cz1 = clamp(Math.floor(hiZ * CELL_INV) - chunk.gz0, 0, chunk.dimZ - 1);

      for (let cz = cz0; cz <= cz1; cz++) {
        const czOff = cz * chunk.dimX * chunk.dimY;
        for (let cy = cy0; cy <= cy1; cy++) {
          const cyOff = cy * chunk.dimX + czOff;
          for (let cx = cx0; cx <= cx1; cx++) {
            const cell = cx + cyOff;
            const s = chunk.cellStart[cell];
            const e = chunk.cellStart[cell + 1];
            for (let k = s; k < e; k++) {
              const tri = chunk.cellTris[k];
              if (chunk.visitStamp[tri] === _queryId) continue;
              chunk.visitStamp[tri] = _queryId;
              if (count === _candChunk.length) {
                _candChunk = growInt32(_candChunk, count + 1);
                _candTri = growInt32(_candTri, count + 1);
              }
              _candChunk[count] = ch;
              _candTri[count] = tri;
              count++;
            }
          }
        }
      }
    }
    return count;
  }

  /**
   * Resuelve la colisión de la cápsula del jugador contra los triángulos de los
   * chunks cargados, bajo cualquier vector `up` de gravedad. Modifica `pos`
   * in-place y actualiza `velAlongUp` al aterrizar o chocar contra un techo.
   * Devuelve un objeto reutilizable (leer inmediatamente).
   */
  resolvePlayer(
    pos: THREE.Vector3,
    velAlongUp: { value: number },
    up: THREE.Vector3,
    isBurrowing: boolean,
    playerRadius: number,
    playerHeight = DEFAULT_PLAYER_HEIGHT
  ): CityCollisionResult {
    _result.grounded = false;
    _result.hitWall = false;
    _result.groundNormal.copy(up);
    // Excavando (Digger) se atraviesa el terreno de los chunks.
    if (isBurrowing || this.chunks.length === 0) return _result;

    // AABB de la cápsula: pies `pos` -> cabeza `pos + up * playerHeight`.
    const headX = pos.x + up.x * playerHeight;
    const headY = pos.y + up.y * playerHeight;
    const headZ = pos.z + up.z * playerHeight;
    const pad = playerRadius + CAPSULE_PAD;
    const loX = Math.min(pos.x, headX) - pad;
    const loY = Math.min(pos.y, headY) - pad;
    const loZ = Math.min(pos.z, headZ) - pad;
    const hiX = Math.max(pos.x, headX) + pad;
    const hiY = Math.max(pos.y, headY) + pad;
    const hiZ = Math.max(pos.z, headZ) + pad;

    const candidateCount = this.gatherCandidates(loX, loY, loZ, hiX, hiY, hiZ);
    if (candidateCount === 0) return _result;

    let grounded = false;
    let hitWall = false;
    let gnX = 0;
    let gnY = 0;
    let gnZ = 0;

    for (let iter = 0; iter < SOLVER_ITERATIONS; iter++) {
      // Dos esferas de cápsula (pies y cabeza) + muestra al centro del cuerpo.
      for (let s = 0; s < 3; s++) {
        const along =
          s === 0 ? playerRadius : s === 1 ? playerHeight * 0.5 : playerHeight - playerRadius;
        const isHead = s === 2;
        // Menor brecha walkable (medida a lo largo de `up`) ya asentada en
        // esta esfera: los contactos de arista/coplanales vecinos con mayor
        // brecha no deben volver a atraer al jugador.
        let walkGapApplied = Infinity;

        for (let ci = 0; ci < candidateCount; ci++) {
          // El centro de la esfera se re-deriva de `pos` en cada contacto: un
          // empuje anterior ya resolvió la penetración y los triángulos
          // coplanares vecinos no deben volver a empujar con el centro viejo.
          const sx = pos.x + up.x * along;
          const sy = pos.y + up.y * along;
          const sz = pos.z + up.z * along;
          const chunk = this.chunks[_candChunk[ci]];
          const tris = chunk.tris;
          const base = _candTri[ci] * 12;

          closestPointOnTriangle(tris, base, sx, sy, sz);
          let dx = sx - _cpX;
          let dy = sy - _cpY;
          let dz = sz - _cpZ;
          let dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist > playerRadius + SURFACE_SNAP_BAND) continue;

          const nx = tris[base + 9];
          const ny = tris[base + 10];
          const nz = tris[base + 11];
          const dUp = nx * up.x + ny * up.y + nz * up.z;

          if (dist < 1e-6) {
            // Centro sobre la superficie: empujar según la normal del triángulo.
            dx = nx;
            dy = ny;
            dz = nz;
            dist = 1;
          } else {
            const inv = 1 / dist;
            dx *= inv;
            dy *= inv;
            dz *= inv;
          }

          if (dUp > WALKABLE_DOT && velAlongUp.value <= 0) {
            // Suelo/escalera/pendiente/tejado/puente caminable: asentar dentro
            // de la banda de snap y clavar la velocidad de caída. Solo se
            // considera el contacto con MENOR brecha a lo largo de `up` (el
            // punto de contacto debe estar bajo la esfera) y solo la esfera
            // de los PIES puede atraer hacia la superficie (snap negativo).
            const dAlongUp = dx * up.x + dy * up.y + dz * up.z;
            if (dAlongUp <= 0.2) continue;
            const gapAlongUp = dist / dAlongUp;
            if (gapAlongUp >= walkGapApplied) continue;
            const move = playerRadius - dist;
            if (move < 0 && s !== 0) continue;
            pos.x += dx * move;
            pos.y += dy * move;
            pos.z += dz * move;
            if (velAlongUp.value < 0) velAlongUp.value = 0;
            grounded = true;
            gnX += nx;
            gnY += ny;
            gnZ += nz;
            walkGapApplied = playerRadius;
          } else if (dist < playerRadius) {
            // Penetración: empujar fuera limpiamente.
            const move = playerRadius - dist;
            pos.x += dx * move;
            pos.y += dy * move;
            pos.z += dz * move;
            if (dUp < CEILING_DOT && isHead) {
              // Techo sobre la esfera de la cabeza: anular velocidad ascendente.
              if (velAlongUp.value > 0) velAlongUp.value = 0;
            } else if (dUp <= WALKABLE_DOT) {
              hitWall = true;
            }
          }
        }
      }
    }

    if (grounded) {
      const len = Math.sqrt(gnX * gnX + gnY * gnY + gnZ * gnZ);
      if (len > 1e-5) {
        _result.groundNormal.set(gnX / len, gnY / len, gnZ / len);
      }
    }
    _result.grounded = grounded;
    _result.hitWall = hitWall;
    return _result;
  }

  /**
   * Raycast exacto contra los triángulos de colisión de todos los chunks
   * (Gravity Shift, clic derecho). Escribe punto y normal del impacto en
   * `outPoint` / `outNormal` y devuelve el distrito o `null`.
   */
  raycast(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    maxDist: number,
    outPoint: THREE.Vector3,
    outNormal: THREE.Vector3
  ): CityDistrictId | null {
    const ox = origin.x;
    const oy = origin.y;
    const oz = origin.z;
    const dx = dir.x;
    const dy = dir.y;
    const dz = dir.z;
    let bestT = maxDist;
    let bestDistrict: HeksevilleDistrictId | null = null;

    // 1) Slab test por chunk; candidatos ordenados por tMin de entrada.
    let candCount = 0;
    for (let ch = 0; ch < this.chunks.length; ch++) {
      const chunk = this.chunks[ch];
      let tMin = 0;
      let tMax = Infinity;

      if (Math.abs(dx) < 1e-9) {
        if (ox < chunk.minX || ox > chunk.maxX) continue;
      } else {
        const inv = 1 / dx;
        let t1 = (chunk.minX - ox) * inv;
        let t2 = (chunk.maxX - ox) * inv;
        if (t1 > t2) {
          const tmp = t1;
          t1 = t2;
          t2 = tmp;
        }
        if (t1 > tMin) tMin = t1;
        if (t2 < tMax) tMax = t2;
        if (tMin > tMax) continue;
      }
      if (Math.abs(dy) < 1e-9) {
        if (oy < chunk.minY || oy > chunk.maxY) continue;
      } else {
        const inv = 1 / dy;
        let t1 = (chunk.minY - oy) * inv;
        let t2 = (chunk.maxY - oy) * inv;
        if (t1 > t2) {
          const tmp = t1;
          t1 = t2;
          t2 = tmp;
        }
        if (t1 > tMin) tMin = t1;
        if (t2 < tMax) tMax = t2;
        if (tMin > tMax) continue;
      }
      if (Math.abs(dz) < 1e-9) {
        if (oz < chunk.minZ || oz > chunk.maxZ) continue;
      } else {
        const inv = 1 / dz;
        let t1 = (chunk.minZ - oz) * inv;
        let t2 = (chunk.maxZ - oz) * inv;
        if (t1 > t2) {
          const tmp = t1;
          t1 = t2;
          t2 = tmp;
        }
        if (t1 > tMin) tMin = t1;
        if (t2 < tMax) tMax = t2;
        if (tMin > tMax) continue;
      }

      if (tMin >= bestT || tMax <= 0) continue;
      if (candCount === _rayChunk.length) {
        _rayChunk = growInt32(_rayChunk, candCount + 1);
        const ntMin = new Float64Array(Math.max(candCount + 1, _rayTMin.length * 2));
        ntMin.set(_rayTMin);
        _rayTMin = ntMin;
        const ntMax = new Float64Array(Math.max(candCount + 1, _rayTMax.length * 2));
        ntMax.set(_rayTMax);
        _rayTMax = ntMax;
      }
      _rayChunk[candCount] = ch;
      _rayTMin[candCount] = tMin;
      _rayTMax[candCount] = tMax;
      candCount++;
    }

    // Insertion sort ascendente por tMin (n pequeño).
    for (let i = 1; i < candCount; i++) {
      const ch = _rayChunk[i];
      const tMin = _rayTMin[i];
      const tMax = _rayTMax[i];
      let j = i - 1;
      while (j >= 0 && _rayTMin[j] > tMin) {
        _rayChunk[j + 1] = _rayChunk[j];
        _rayTMin[j + 1] = _rayTMin[j];
        _rayTMax[j + 1] = _rayTMax[j];
        j--;
      }
      _rayChunk[j + 1] = ch;
      _rayTMin[j + 1] = tMin;
      _rayTMax[j + 1] = tMax;
    }

    // 2) DDA por las celdas de cada chunk, acotado por el mejor t hallado.
    for (let i = 0; i < candCount; i++) {
      if (_rayTMin[i] >= bestT) break;
      const chunk = this.chunks[_rayChunk[i]];
      const tStart = Math.max(_rayTMin[i], 0);
      const tEnd = Math.min(_rayTMax[i], bestT);
      if (tEnd <= tStart) continue;
      const t = this.raycastChunk(chunk, ox, oy, oz, dx, dy, dz, tStart, tEnd, bestT, outPoint, outNormal);
      if (t < bestT) {
        bestT = t;
        bestDistrict = chunk.district;
      }
    }

    return bestDistrict === null ? null : heksevilleToCityDistrict(bestDistrict);
  }

  /**
   * DDA (Amanatides-Woo) por la rejilla de un chunk con test Möller–Trumbore a
   * doble cara por triángulo. Devuelve el mejor t (>= el `bestT` entrante si no
   * hay impacto); escribe `outPoint`/`outNormal` solo cuando mejora.
   */
  private raycastChunk(
    chunk: ChunkGridRecord,
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    tStart: number,
    tEnd: number,
    bestT: number,
    outPoint: THREE.Vector3,
    outNormal: THREE.Vector3
  ): number {
    const tris = chunk.tris;
    const dimX = chunk.dimX;
    const dimY = chunk.dimY;
    const dimZ = chunk.dimZ;

    let px = ox + dx * tStart;
    let py = oy + dy * tStart;
    let pz = oz + dz * tStart;
    let cx = clamp(Math.floor((px - chunk.originX) * CELL_INV), 0, dimX - 1);
    let cy = clamp(Math.floor((py - chunk.originY) * CELL_INV), 0, dimY - 1);
    let cz = clamp(Math.floor((pz - chunk.originZ) * CELL_INV), 0, dimZ - 1);

    const stepX = dx > 0 ? 1 : -1;
    const stepY = dy > 0 ? 1 : -1;
    const stepZ = dz > 0 ? 1 : -1;
    const tDeltaX = dx !== 0 ? Math.abs(CELL_SIZE / dx) : Infinity;
    const tDeltaY = dy !== 0 ? Math.abs(CELL_SIZE / dy) : Infinity;
    const tDeltaZ = dz !== 0 ? Math.abs(CELL_SIZE / dz) : Infinity;
    let tMaxX =
      dx !== 0 ? tStart + (chunk.originX + (cx + (dx > 0 ? 1 : 0)) * CELL_SIZE - px) / dx : Infinity;
    let tMaxY =
      dy !== 0 ? tStart + (chunk.originY + (cy + (dy > 0 ? 1 : 0)) * CELL_SIZE - py) / dy : Infinity;
    let tMaxZ =
      dz !== 0 ? tStart + (chunk.originZ + (cz + (dz > 0 ? 1 : 0)) * CELL_SIZE - pz) / dz : Infinity;

    const maxSteps = dimX + dimY + dimZ + 3;
    let t = tStart;

    for (let step = 0; step <= maxSteps; step++) {
      const cell = cx + cy * dimX + cz * dimX * dimY;
      const s = chunk.cellStart[cell];
      const e = chunk.cellStart[cell + 1];

      for (let k = s; k < e; k++) {
        const base = chunk.cellTris[k] * 12;
        const ax = tris[base];
        const ay = tris[base + 1];
        const az = tris[base + 2];
        const e1x = tris[base + 3] - ax;
        const e1y = tris[base + 4] - ay;
        const e1z = tris[base + 5] - az;
        const e2x = tris[base + 6] - ax;
        const e2y = tris[base + 7] - ay;
        const e2z = tris[base + 8] - az;

        const pvecX = dy * e2z - dz * e2y;
        const pvecY = dz * e2x - dx * e2z;
        const pvecZ = dx * e2y - dy * e2x;
        const det = e1x * pvecX + e1y * pvecY + e1z * pvecZ;
        if (det > -1e-10 && det < 1e-10) continue;
        const invDet = 1 / det;

        const tvecX = ox - ax;
        const tvecY = oy - ay;
        const tvecZ = oz - az;
        const u = (tvecX * pvecX + tvecY * pvecY + tvecZ * pvecZ) * invDet;
        if (u < -1e-6 || u > 1.000001) continue;

        const qvecX = tvecY * e1z - tvecZ * e1y;
        const qvecY = tvecZ * e1x - tvecX * e1z;
        const qvecZ = tvecX * e1y - tvecY * e1x;
        const v = (dx * qvecX + dy * qvecY + dz * qvecZ) * invDet;
        if (v < -1e-6 || u + v > 1.000001) continue;

        const tHit = (e2x * qvecX + e2y * qvecY + e2z * qvecZ) * invDet;
        if (tHit > 1e-4 && tHit < bestT) {
          bestT = tHit;
          outPoint.set(ox + dx * tHit, oy + dy * tHit, oz + dz * tHit);
          const nx = tris[base + 9];
          const ny = tris[base + 10];
          const nz = tris[base + 11];
          // Doble cara: si la normal almacenada mira hacia el rayo, voltear
          // (láminas finas col_cliff / col_metal / col_under).
          if (nx * dx + ny * dy + nz * dz > 0) {
            outNormal.set(-nx, -ny, -nz);
          } else {
            outNormal.set(nx, ny, nz);
          }
        }
      }

      // Avance a la siguiente celda por el menor tMax.
      if (tMaxX < tMaxY) {
        if (tMaxX < tMaxZ) {
          cx += stepX;
          t = tMaxX;
          tMaxX += tDeltaX;
          if (cx < 0 || cx >= dimX) break;
        } else {
          cz += stepZ;
          t = tMaxZ;
          tMaxZ += tDeltaZ;
          if (cz < 0 || cz >= dimZ) break;
        }
      } else if (tMaxY < tMaxZ) {
        cy += stepY;
        t = tMaxY;
        tMaxY += tDeltaY;
        if (cy < 0 || cy >= dimY) break;
      } else {
        cz += stepZ;
        t = tMaxZ;
        tMaxZ += tDeltaZ;
        if (cz < 0 || cz >= dimZ) break;
      }
      if (t > tEnd || t >= bestT) break;
    }

    return bestT;
  }
}
