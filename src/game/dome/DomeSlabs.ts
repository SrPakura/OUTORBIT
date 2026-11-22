import * as THREE from 'three';
import { addComicOutline, createComicCelMaterial } from '@/game/render/toonMaterials';
import type { SlabCollider, SlabRaycastHit } from './domeTypes';

// ============================================================================
// Colisiones y raycasts contra los slabs (cajas orientadas) de la cúpula.
//
// Todos los helpers trabajan en el espacio local del slab (via `invQuaternion`)
// y devuelven normales/puntos en espacio mundo. Usan scratch vectors a nivel
// de módulo: sin allocations por frame.
// ============================================================================

/** Contacto esfera-slab resuelto (normal mundial, profundidad y punto de contacto). */
export interface SlabContact {
  slab: SlabCollider | null;
  normal: THREE.Vector3;
  depth: number;
  point: THREE.Vector3;
}

const _local = new THREE.Vector3();
const _closest = new THREE.Vector3();
const _delta = new THREE.Vector3();
const _bestNormal = new THREE.Vector3();
const _bestPoint = new THREE.Vector3();
const _bobAxis = new THREE.Vector3();
const _rayOrigin = new THREE.Vector3();
const _rayDir = new THREE.Vector3();
const _triOut = { x: 0, z: 0, inside: false };

/** Punto más cercano en un triángulo 2D (plano XZ local) sin allocations. */
function closestPointOnTriangle2D(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
): void {
  const abx = bx - ax;
  const abz = bz - az;
  const acx = cx - ax;
  const acz = cz - az;
  const apx = px - ax;
  const apz = pz - az;

  const d1 = abx * apx + abz * apz;
  const d2 = acx * apx + acz * apz;
  if (d1 <= 0 && d2 <= 0) {
    _triOut.x = ax;
    _triOut.z = az;
    _triOut.inside = false;
    return;
  }

  const bpx = px - bx;
  const bpz = pz - bz;
  const d3 = abx * bpx + abz * bpz;
  const d4 = acx * bpx + acz * bpz;
  if (d3 >= 0 && d4 <= d3) {
    _triOut.x = bx;
    _triOut.z = bz;
    _triOut.inside = false;
    return;
  }

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    _triOut.x = ax + v * abx;
    _triOut.z = az + v * abz;
    _triOut.inside = false;
    return;
  }

  const cpx = px - cx;
  const cpz = pz - cz;
  const d5 = abx * cpx + abz * cpz;
  const d6 = acx * cpx + acz * cpz;
  if (d6 >= 0 && d5 <= d6) {
    _triOut.x = cx;
    _triOut.z = cz;
    _triOut.inside = false;
    return;
  }

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    _triOut.x = ax + w * acx;
    _triOut.z = az + w * acz;
    _triOut.inside = false;
    return;
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    _triOut.x = bx + w * (cx - bx);
    _triOut.z = bz + w * (cz - bz);
    _triOut.inside = false;
    return;
  }

  _triOut.x = px;
  _triOut.z = pz;
  _triOut.inside = true;
}

/**
 * Anima el "bob" senoidal de cada slab a lo largo de su eje local +Y y
 * sincroniza `center` y `mesh.position`. Los slabs con `bobAmplitude <= 0`
 * se quedan fijos en `basePos`.
 */
export function updateSlabMotion(slabs: SlabCollider[], time: number): void {
  for (const slab of slabs) {
    if (slab.bobAmplitude <= 0) continue;
    _bobAxis.set(0, 1, 0).applyQuaternion(slab.quaternion);
    slab.center
      .copy(slab.basePos)
      .addScaledVector(_bobAxis, Math.sin(time * 0.9 + slab.phase) * slab.bobAmplitude);
    slab.mesh.position.copy(slab.center);
  }
}

/**
 * Resuelve la colisión de una esfera (posición + radio) contra todos los
 * slabs y deja en `out` el contacto MÁS PROFUNDO. Devuelve `true` si hubo
 * contacto. La normal apunta SIEMPRE hacia fuera de la superficie del slab
 * (lista para empujar al jugador), y `point` es el punto de contacto sobre
 * la superficie.
 */
export function resolveSphereSlabCollision(
  slabs: SlabCollider[],
  position: THREE.Vector3,
  radius: number,
  out: SlabContact,
): boolean {
  let bestDepth = 0;
  let bestSlab: SlabCollider | null = null;

  for (const slab of slabs) {
    _local.copy(position).sub(slab.center).applyQuaternion(slab.invQuaternion);
    const he = slab.halfExtents;
    if (slab.localTriangle2D) {
      const t = slab.localTriangle2D;
      closestPointOnTriangle2D(_local.x, _local.z, t[0], t[1], t[2], t[3], t[4], t[5]);
      _closest.set(
        _triOut.x,
        Math.min(he.y, Math.max(-he.y, _local.y)),
        _triOut.z,
      );
    } else {
      _closest.set(
        Math.min(he.x, Math.max(-he.x, _local.x)),
        Math.min(he.y, Math.max(-he.y, _local.y)),
        Math.min(he.z, Math.max(-he.z, _local.z)),
      );
    }
    _delta.copy(_local).sub(_closest);
    const distSq = _delta.lengthSq();

    if (distSq > 1e-10) {
      // Esfera por fuera: contacto clásico punto-más-cercano.
      const dist = Math.sqrt(distSq);
      const depth = radius - dist;
      if (depth > bestDepth) {
        bestDepth = depth;
        bestSlab = slab;
        _bestNormal.copy(_delta).multiplyScalar(1 / dist);
        _bestPoint.copy(_closest);
      }
    } else {
      // Centro DENTRO del slab: expulsa por la cara de menor penetración.
      const px = he.x - Math.abs(_local.x);
      const py = he.y - Math.abs(_local.y);
      const pz = he.z - Math.abs(_local.z);
      let axis = 0;
      let pen = px;
      if (py < pen) {
        axis = 1;
        pen = py;
      }
      if (pz < pen) {
        axis = 2;
        pen = pz;
      }
      const depth = radius + pen;
      if (depth > bestDepth) {
        bestDepth = depth;
        bestSlab = slab;
        _bestPoint.copy(_local);
        if (axis === 0) {
          _bestNormal.set(Math.sign(_local.x) || 1, 0, 0);
          _bestPoint.x = (Math.sign(_local.x) || 1) * he.x;
        } else if (axis === 1) {
          _bestNormal.set(0, Math.sign(_local.y) || 1, 0);
          _bestPoint.y = (Math.sign(_local.y) || 1) * he.y;
        } else {
          _bestNormal.set(0, 0, Math.sign(_local.z) || 1);
          _bestPoint.z = (Math.sign(_local.z) || 1) * he.z;
        }
      }
    }
  }

  if (!bestSlab) return false;
  out.slab = bestSlab;
  out.depth = bestDepth;
  out.normal.copy(_bestNormal).applyQuaternion(bestSlab.quaternion);
  out.point
    .copy(bestSlab.center)
    .add(_bestPoint.applyQuaternion(bestSlab.quaternion));
  return true;
}

/**
 * Raycast contra todos los slabs. Devuelve el impacto MÁS CERCANO dentro de
 * `maxDistance` (o `null`). El origen dentro de un slab no cuenta como
 * impacto (evita auto-apuntado al suelo que pisa la propia Nyx).
 */
export function raycastSlabs(
  slabs: SlabCollider[],
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  maxDistance: number,
): SlabRaycastHit | null {
  let bestT = maxDistance;
  let best: SlabRaycastHit | null = null;

  for (const slab of slabs) {
    _rayOrigin.copy(origin).sub(slab.center).applyQuaternion(slab.invQuaternion);
    _rayDir.copy(direction).applyQuaternion(slab.invQuaternion);
    const he = slab.halfExtents;

    let tmin = 0;
    let tmax = bestT;
    let axis = -1;
    let normalSign = 1;
    let miss = false;

    for (let a = 0; a < 3; a++) {
      const o = _rayOrigin.getComponent(a);
      const d = _rayDir.getComponent(a);
      const h = he.getComponent(a);
      if (Math.abs(d) < 1e-9) {
        if (o < -h || o > h) {
          miss = true;
          break;
        }
        continue;
      }
      const inv = 1 / d;
      let t1 = (-h - o) * inv;
      let t2 = (h - o) * inv;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      if (t1 > tmin) {
        tmin = t1;
        axis = a;
        normalSign = d > 0 ? -1 : 1;
      }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) {
        miss = true;
        break;
      }
    }

    if (miss || axis === -1 || tmin <= 0 || tmin >= bestT) continue;
    if (slab.localTriangle2D) {
      const t = slab.localTriangle2D;
      const hx = _rayOrigin.x + _rayDir.x * tmin;
      const hz = _rayOrigin.z + _rayDir.z * tmin;
      closestPointOnTriangle2D(hx, hz, t[0], t[1], t[2], t[3], t[4], t[5]);
      if (!_triOut.inside && Math.hypot(hx - _triOut.x, hz - _triOut.z) > 0.35) {
        continue;
      }
    }
    bestT = tmin;
    if (!best) {
      best = {
        slab,
        point: new THREE.Vector3(),
        normal: new THREE.Vector3(),
        distance: tmin,
      };
    }
    best.slab = slab;
    best.distance = tmin;
    best.point.copy(direction).multiplyScalar(tmin).add(origin);
    best.normal.set(0, 0, 0).setComponent(axis, normalSign);
    best.normal.applyQuaternion(slab.quaternion);
  }

  return best;
}

const SLAB_SPECS: ReadonlyArray<{
  pos: [number, number, number];
  size: [number, number, number];
  rot: [number, number, number];
  bob: number;
  rim: string;
}> = [
  // Plataforma central amplia para empezar de pie
  { pos: [0, -3.0, 0], size: [22, 1.4, 22], rot: [0, 0.15, 0], bob: 0.18, rim: '#22d3ee' },
  // Paredes inclinadas y verticales repartidas por la cúpula de 90 m
  { pos: [-30, 9.0, -20], size: [15, 1.2, 15], rot: [0.35, 0.4, 1.15], bob: 0.35, rim: '#a855f7' },
  { pos: [32, 15.0, -16], size: [16, 1.2, 12], rot: [-0.25, -0.5, -0.95], bob: 0.32, rim: '#22d3ee' },
  { pos: [0, 18.0, -42], size: [18, 1.2, 14], rot: [Math.PI * 0.48, 0.1, 0], bob: 0.28, rim: '#f43f5e' },
  { pos: [-38, -4.0, 28], size: [14, 1.2, 16], rot: [0.2, -0.3, 1.35], bob: 0.38, rim: '#a855f7' },
  // Techo invertido (para caminar boca abajo)
  { pos: [6, 36.0, -24], size: [20, 1.3, 15], rot: [Math.PI, 0.3, 0.12], bob: 0.25, rim: '#22d3ee' },
  // Escalones / fragmentos inferiores y laterales
  { pos: [-20, -22.0, 24], size: [14, 1.2, 14], rot: [0.42, -0.25, 0.35], bob: 0.4, rim: '#22d3ee' },
  { pos: [28, -16.0, 30], size: [15, 1.2, 15], rot: [-0.65, 0.2, 0.48], bob: 0.36, rim: '#a855f7' },
  { pos: [42, 4.0, 30], size: [13, 1.2, 13], rot: [0.55, 0.8, -0.45], bob: 0.42, rim: '#22d3ee' },
  { pos: [-24, 28.0, 26], size: [15, 1.2, 14], rot: [-2.6, 0.4, 0.25], bob: 0.3, rim: '#a855f7' },
];

/**
 * Genera las plataformas flotantes temporales dentro de la cúpula de 50 m
 * con colisionadores OBB listos para caminar/correr/saltar en cualquier ángulo.
 */
export function createDomeSlabs(scene: THREE.Scene): {
  slabs: SlabCollider[];
  dispose: () => void;
} {
  const matCyan = createComicCelMaterial('#1e1b4b', { rimColor: '#22d3ee', rimStrength: 0.78 });
  const matViolet = createComicCelMaterial('#17153b', { rimColor: '#a855f7', rimStrength: 0.78 });
  const geometries: THREE.BufferGeometry[] = [];
  const slabs: SlabCollider[] = [];

  SLAB_SPECS.forEach((spec, idx) => {
    const geo = new THREE.BoxGeometry(spec.size[0], spec.size[1], spec.size[2]);
    geometries.push(geo);
    const mat = spec.rim === '#a855f7' ? matViolet : matCyan;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(spec.pos[0], spec.pos[1], spec.pos[2]);
    mesh.rotation.set(spec.rot[0], spec.rot[1], spec.rot[2]);
    const outlineColor = spec.rim === '#a855f7' ? 0xa855f7 : spec.rim === '#f43f5e' ? 0xf43f5e : 0x22d3ee;
    addComicOutline(mesh, 0.055, outlineColor);
    scene.add(mesh);

    const quat = mesh.quaternion.clone();
    slabs.push({
      id: `slab_${idx}`,
      mesh,
      basePos: mesh.position.clone(),
      center: mesh.position.clone(),
      halfExtents: new THREE.Vector3(spec.size[0] * 0.5, spec.size[1] * 0.5, spec.size[2] * 0.5),
      quaternion: quat,
      invQuaternion: quat.clone().invert(),
      phase: idx * 1.15,
      bobAmplitude: spec.bob,
    });
  });

  return {
    slabs,
    dispose: () => {
      for (const s of slabs) {
        scene.remove(s.mesh);
      }
      for (const g of geometries) g.dispose();
      matCyan.dispose();
      matViolet.dispose();
    },
  };
}
