import * as THREE from 'three';
import type {
  CityBoxCollider,
  CityCylinderCollider,
  CityDistrictId,
} from '../types';

// ============================================================================
// Físicas de Ciudad Plana / Multinivel (Hekseville estilo Gravity Rush).
// CERO allocations por frame: todos los temporales viven a nivel de módulo.
// ============================================================================

const _localPos = new THREE.Vector3();
const _localUp = new THREE.Vector3();
const _localNormal = new THREE.Vector3();
const _worldNormal = new THREE.Vector3();
const _rayOriginLocal = new THREE.Vector3();
const _rayDirLocal = new THREE.Vector3();

const SURFACE_SNAP_BAND = 0.55;
const HEAD_CLEARANCE = 0.45;

export interface CityCollisionResult {
  grounded: boolean;
  hitWall: boolean;
  groundNormal: THREE.Vector3;
}

const _collisionResult: CityCollisionResult = {
  grounded: false,
  hitWall: false,
  groundNormal: new THREE.Vector3(0, 1, 0),
};

function rotateYInv(x: number, y: number, z: number, yaw: number, out: THREE.Vector3): void {
  if (yaw === 0) {
    out.set(x, y, z);
    return;
  }
  const c = Math.cos(-yaw);
  const s = Math.sin(-yaw);
  out.set(x * c + z * s, y, -x * s + z * c);
}

function rotateY(x: number, y: number, z: number, yaw: number, out: THREE.Vector3): void {
  if (yaw === 0) {
    out.set(x, y, z);
    return;
  }
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  out.set(x * c + z * s, y, -x * s + z * c);
}

/**
 * Resuelve la colisión del jugador contra todas las cajas OBB y cilindros de la
 * ciudad bajo cualquier vector `up` de gravedad (suelo normal +Y, paredes
 * laterales de rascacielos o cara inferior de las islas).
 *
 * Modifica `pos` in-place y actualiza `velAlongUp` si aterriza o choca contra
 * un techo. Devuelve un objeto reutilizable (leer inmediatamente).
 */
export function resolvePlayerCityColliders(
  pos: THREE.Vector3,
  velAlongUp: { value: number },
  up: THREE.Vector3,
  isBurrowing: boolean,
  boxes: readonly CityBoxCollider[],
  cylinders: readonly CityCylinderCollider[],
  playerRadius: number,
  playerHeight = 1.65
): CityCollisionResult {
  let grounded = false;
  let hitWall = false;
  _collisionResult.groundNormal.copy(up);

  // 1. Cajas OBB (islas, calles, puentes, edificios, tejados, paredes).
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (isBurrowing && b.passableUnderground) continue;

    // AABB rápido en mundo antes de rotar (margen máximo = sqrt(hx^2 + hz^2) + r + h).
    const maxR = b.hx + b.hz + playerRadius + playerHeight + 1;
    if (
      Math.abs(pos.x - b.cx) > maxR ||
      Math.abs(pos.z - b.cz) > maxR ||
      Math.abs(pos.y - b.cy) > b.hy + playerRadius + playerHeight + 1
    ) {
      continue;
    }

    const dx = pos.x - b.cx;
    const dy = pos.y - b.cy;
    const dz = pos.z - b.cz;
    rotateYInv(dx, dy, dz, b.yaw, _localPos);
    rotateYInv(up.x, up.y, up.z, b.yaw, _localUp);

    // Proyección del segmento jugador [pies=pos, cabeza=pos + up*playerHeight]
    // aproximado con centro en pies + radio esférico en base y cuerpo.
    const cx = _localPos.x + _localUp.x * playerRadius;
    const cy = _localPos.y + _localUp.y * playerRadius;
    const cz = _localPos.z + _localUp.z * playerRadius;

    // ¿Está dentro o tocando la caja expandida por playerRadius?
    const ex = b.hx + playerRadius;
    const ey = b.hy + playerRadius;
    const ez = b.hz + playerRadius;

    if (
      cx < -ex || cx > ex ||
      cy < -ey || cy > ey ||
      cz < -ez || cz > ez
    ) {
      // Comprobar también banda de aterrizaje justo encima de la cara alineada a `up`.
      const penX = b.hx + playerRadius * 0.65 - Math.abs(_localPos.x);
      const penY = b.hy + playerRadius * 0.65 - Math.abs(_localPos.y);
      const penZ = b.hz + playerRadius * 0.65 - Math.abs(_localPos.z);
      if (penX < 0 && _localUp.x < 0.7) continue;
      if (penY < 0 && _localUp.y < 0.7) continue;
      if (penZ < 0 && _localUp.z < 0.7) continue;
    }

    // Penetración en las 6 caras tomando la posición de los PIES (`_localPos`)
    // respecto al volumen expandido lateralmente por `playerRadius` y por `0` en la dirección de apoyo.
    const dPosX = b.hx - _localPos.x;
    const dNegX = _localPos.x + b.hx;
    const dPosY = b.hy - _localPos.y;
    const dNegY = _localPos.y + b.hy;
    const dPosZ = b.hz - _localPos.z;
    const dNegZ = _localPos.z + b.hz;

    // Si estamos apoyados encima de una cara cuya normal apunta con `up` (dot > 0.65):
    if (
      Math.abs(_localPos.x) <= b.hx + playerRadius * 0.5 &&
      Math.abs(_localPos.z) <= b.hz + playerRadius * 0.5
    ) {
      if (_localUp.y > 0.65 && _localPos.y >= b.hy - SURFACE_SNAP_BAND && _localPos.y <= b.hy + 0.2 && velAlongUp.value <= 0) {
        _localPos.y = b.hy;
        rotateY(_localPos.x, _localPos.y, _localPos.z, b.yaw, _worldNormal);
        pos.set(b.cx + _worldNormal.x, b.cy + _worldNormal.y, b.cz + _worldNormal.z);
        velAlongUp.value = 0;
        grounded = true;
        rotateY(0, 1, 0, b.yaw, _collisionResult.groundNormal);
        continue;
      }
      if (_localUp.y < -0.65 && _localPos.y <= -b.hy + SURFACE_SNAP_BAND && _localPos.y >= -b.hy - 0.2 && velAlongUp.value <= 0) {
        _localPos.y = -b.hy;
        rotateY(_localPos.x, _localPos.y, _localPos.z, b.yaw, _worldNormal);
        pos.set(b.cx + _worldNormal.x, b.cy + _worldNormal.y, b.cz + _worldNormal.z);
        velAlongUp.value = 0;
        grounded = true;
        rotateY(0, -1, 0, b.yaw, _collisionResult.groundNormal);
        continue;
      }
    }

    if (
      Math.abs(_localPos.y) <= b.hy + playerRadius * 0.5 &&
      Math.abs(_localPos.z) <= b.hz + playerRadius * 0.5
    ) {
      if (_localUp.x > 0.65 && _localPos.x >= b.hx - SURFACE_SNAP_BAND && _localPos.x <= b.hx + 0.2 && velAlongUp.value <= 0) {
        _localPos.x = b.hx;
        rotateY(_localPos.x, _localPos.y, _localPos.z, b.yaw, _worldNormal);
        pos.set(b.cx + _worldNormal.x, b.cy + _worldNormal.y, b.cz + _worldNormal.z);
        velAlongUp.value = 0;
        grounded = true;
        rotateY(1, 0, 0, b.yaw, _collisionResult.groundNormal);
        continue;
      }
      if (_localUp.x < -0.65 && _localPos.x <= -b.hx + SURFACE_SNAP_BAND && _localPos.x >= -b.hx - 0.2 && velAlongUp.value <= 0) {
        _localPos.x = -b.hx;
        rotateY(_localPos.x, _localPos.y, _localPos.z, b.yaw, _worldNormal);
        pos.set(b.cx + _worldNormal.x, b.cy + _worldNormal.y, b.cz + _worldNormal.z);
        velAlongUp.value = 0;
        grounded = true;
        rotateY(-1, 0, 0, b.yaw, _collisionResult.groundNormal);
        continue;
      }
    }

    if (
      Math.abs(_localPos.x) <= b.hx + playerRadius * 0.5 &&
      Math.abs(_localPos.y) <= b.hy + playerRadius * 0.5
    ) {
      if (_localUp.z > 0.65 && _localPos.z >= b.hz - SURFACE_SNAP_BAND && _localPos.z <= b.hz + 0.2 && velAlongUp.value <= 0) {
        _localPos.z = b.hz;
        rotateY(_localPos.x, _localPos.y, _localPos.z, b.yaw, _worldNormal);
        pos.set(b.cx + _worldNormal.x, b.cy + _worldNormal.y, b.cz + _worldNormal.z);
        velAlongUp.value = 0;
        grounded = true;
        rotateY(0, 0, 1, b.yaw, _collisionResult.groundNormal);
        continue;
      }
      if (_localUp.z < -0.65 && _localPos.z <= -b.hz + SURFACE_SNAP_BAND && _localPos.z >= -b.hz - 0.2 && velAlongUp.value <= 0) {
        _localPos.z = -b.hz;
        rotateY(_localPos.x, _localPos.y, _localPos.z, b.yaw, _worldNormal);
        pos.set(b.cx + _worldNormal.x, b.cy + _worldNormal.y, b.cz + _worldNormal.z);
        velAlongUp.value = 0;
        grounded = true;
        rotateY(0, 0, -1, b.yaw, _collisionResult.groundNormal);
        continue;
      }
    }

    // Colisión sólida del cuerpo (esfera en centro del torso `pos + up * 0.75`).
    const bodyX = _localPos.x + _localUp.x * 0.75;
    const bodyY = _localPos.y + _localUp.y * 0.75;
    const bodyZ = _localPos.z + _localUp.z * 0.75;
    const bxEx = b.hx + playerRadius;
    const byEx = b.hy + playerRadius;
    const bzEx = b.hz + playerRadius;
    if (
      bodyX > -bxEx && bodyX < bxEx &&
      bodyY > -byEx && bodyY < byEx &&
      bodyZ > -bzEx && bodyZ < bzEx
    ) {
      const penX = bxEx - Math.abs(bodyX);
      const penY = byEx - Math.abs(bodyY);
      const penZ = bzEx - Math.abs(bodyZ);
      let pushX = 0;
      let pushY = 0;
      let pushZ = 0;
      _localNormal.set(0, 0, 0);
      if (penX <= penY && penX <= penZ) {
        const s = bodyX >= 0 ? 1 : -1;
        pushX = s * penX;
        _localNormal.x = s;
      } else if (penY <= penX && penY <= penZ) {
        const s = bodyY >= 0 ? 1 : -1;
        pushY = s * penY;
        _localNormal.y = s;
      } else {
        const s = bodyZ >= 0 ? 1 : -1;
        pushZ = s * penZ;
        _localNormal.z = s;
      }
      // Si la normal de empuje coincide con `up` (aterrizaje brusco), se considera suelo.
      if (_localNormal.dot(_localUp) > 0.6 && velAlongUp.value <= 0) {
        grounded = true;
        velAlongUp.value = 0;
        rotateY(_localNormal.x, _localNormal.y, _localNormal.z, b.yaw, _collisionResult.groundNormal);
      } else if (_localNormal.dot(_localUp) < -0.6 && velAlongUp.value > 0) {
        velAlongUp.value = 0;
      } else {
        hitWall = true;
      }
      rotateY(pushX, pushY, pushZ, b.yaw, _worldNormal);
      pos.add(_worldNormal);
    }

    // Evitar warnings por variables no usadas en chequeo previo.
    void dPosX; void dNegX; void dPosY; void dNegY; void dPosZ; void dNegZ; void HEAD_CLEARANCE;
  }

  // 2. Cilindros verticales (Pilar Central del Mundo: caminable en pared lateral o tapa).
  for (let i = 0; i < cylinders.length; i++) {
    const c = cylinders[i];
    const dy = pos.y - c.cy;
    if (Math.abs(dy) > c.halfHeight + playerRadius + 1) continue;
    const dx = pos.x - c.cx;
    const dz = pos.z - c.cz;
    const rSq = dx * dx + dz * dz;
    const rad = Math.sqrt(rSq);

    // Tapa superior del pilar.
    if (rad <= c.radius + playerRadius * 0.5 && up.y > 0.65 && dy >= c.halfHeight - SURFACE_SNAP_BAND && dy <= c.halfHeight + 0.25 && velAlongUp.value <= 0) {
      pos.y = c.cy + c.halfHeight;
      velAlongUp.value = 0;
      grounded = true;
      _collisionResult.groundNormal.set(0, 1, 0);
      continue;
    }

    // Superficie lateral del pilar cuando el jugador shiftó gravedad hacia la pared.
    if (Math.abs(dy) <= c.halfHeight && rad > 1e-4) {
      const nx = dx / rad;
      const nz = dz / rad;
      const radialUpDot = nx * up.x + nz * up.z;
      if (radialUpDot > 0.6 && rad >= c.radius - SURFACE_SNAP_BAND && rad <= c.radius + 0.25 && velAlongUp.value <= 0) {
        pos.x = c.cx + nx * c.radius;
        pos.z = c.cz + nz * c.radius;
        velAlongUp.value = 0;
        grounded = true;
        _collisionResult.groundNormal.set(nx, 0, nz);
        continue;
      }
      const bx = dx + up.x * 0.75;
      const bz = dz + up.z * 0.75;
      const bRad = Math.sqrt(bx * bx + bz * bz);
      if (bRad < c.radius + playerRadius && bRad > 1e-4) {
        const push = c.radius + playerRadius - bRad;
        pos.x += (bx / bRad) * push;
        pos.z += (bz / bRad) * push;
        hitWall = true;
      }
    }
  }

  _collisionResult.grounded = grounded;
  _collisionResult.hitWall = hitWall;
  return _collisionResult;
}

/**
 * Raycast exacto contra todas las cajas OBB y cilindros de la ciudad para
 * Gravity Shift (`Clic Derecho`). Escribe el punto y la normal de la cara
 * golpeada en `outPoint` / `outNormal`. Devuelve el distrito o `null`.
 */
export function raycastCityColliders(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  maxDist: number,
  boxes: readonly CityBoxCollider[],
  cylinders: readonly CityCylinderCollider[],
  outPoint: THREE.Vector3,
  outNormal: THREE.Vector3
): CityDistrictId | null {
  let bestT = maxDist;
  let bestDistrict: CityDistrictId | null = null;

  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    rotateYInv(origin.x - b.cx, origin.y - b.cy, origin.z - b.cz, b.yaw, _rayOriginLocal);
    rotateYInv(dir.x, dir.y, dir.z, b.yaw, _rayDirLocal);

    let tMin = 0.8; // ignorar el bloque que tocamos justo al lado
    let tMax = bestT;
    let hitAxis = -1;
    let hitSign = 1;

    // X slab
    if (Math.abs(_rayDirLocal.x) < 1e-6) {
      if (_rayOriginLocal.x < -b.hx || _rayOriginLocal.x > b.hx) continue;
    } else {
      const inv = 1 / _rayDirLocal.x;
      let t1 = (-b.hx - _rayOriginLocal.x) * inv;
      let t2 = (b.hx - _rayOriginLocal.x) * inv;
      let s = -1;
      if (t1 > t2) {
        const tmp = t1; t1 = t2; t2 = tmp; s = 1;
      }
      if (t1 > tMin) { tMin = t1; hitAxis = 0; hitSign = s; }
      if (t2 < tMax) tMax = t2;
      if (tMin > tMax) continue;
    }

    // Y slab
    if (Math.abs(_rayDirLocal.y) < 1e-6) {
      if (_rayOriginLocal.y < -b.hy || _rayOriginLocal.y > b.hy) continue;
    } else {
      const inv = 1 / _rayDirLocal.y;
      let t1 = (-b.hy - _rayOriginLocal.y) * inv;
      let t2 = (b.hy - _rayOriginLocal.y) * inv;
      let s = -1;
      if (t1 > t2) {
        const tmp = t1; t1 = t2; t2 = tmp; s = 1;
      }
      if (t1 > tMin) { tMin = t1; hitAxis = 1; hitSign = s; }
      if (t2 < tMax) tMax = t2;
      if (tMin > tMax) continue;
    }

    // Z slab
    if (Math.abs(_rayDirLocal.z) < 1e-6) {
      if (_rayOriginLocal.z < -b.hz || _rayOriginLocal.z > b.hz) continue;
    } else {
      const inv = 1 / _rayDirLocal.z;
      let t1 = (-b.hz - _rayOriginLocal.z) * inv;
      let t2 = (b.hz - _rayOriginLocal.z) * inv;
      let s = -1;
      if (t1 > t2) {
        const tmp = t1; t1 = t2; t2 = tmp; s = 1;
      }
      if (t1 > tMin) { tMin = t1; hitAxis = 2; hitSign = s; }
      if (t2 < tMax) tMax = t2;
      if (tMin > tMax) continue;
    }

    if (hitAxis >= 0 && tMin < bestT) {
      bestT = tMin;
      bestDistrict = b.district;
      outPoint.copy(origin).addScaledVector(dir, tMin);
      const lx = hitAxis === 0 ? hitSign : 0;
      const ly = hitAxis === 1 ? hitSign : 0;
      const lz = hitAxis === 2 ? hitSign : 0;
      rotateY(lx, ly, lz, b.yaw, outNormal);
      outNormal.normalize();
    }
  }

  for (let i = 0; i < cylinders.length; i++) {
    const c = cylinders[i];
    const ox = origin.x - c.cx;
    const oz = origin.z - c.cz;
    const a = dir.x * dir.x + dir.z * dir.z;
    if (a > 1e-6) {
      const b = 2 * (ox * dir.x + oz * dir.z);
      const cc = ox * ox + oz * oz - c.radius * c.radius;
      const disc = b * b - 4 * a * cc;
      if (disc >= 0) {
        const t = (-b - Math.sqrt(disc)) / (2 * a);
        if (t > 0.8 && t < bestT) {
          const hitY = origin.y + dir.y * t - c.cy;
          if (Math.abs(hitY) <= c.halfHeight) {
            bestT = t;
            bestDistrict = c.district;
            outPoint.copy(origin).addScaledVector(dir, t);
            outNormal.set(outPoint.x - c.cx, 0, outPoint.z - c.cz).normalize();
          }
        }
      }
    }
  }

  return bestDistrict;
}

/** Devuelve el nombre legible del distrito más cercano / bajo `pos`. */
export function getCityDistrictInfo(pos: THREE.Vector3): {
  id: CityDistrictId;
  name: string;
  subtitle: string;
} {
  const r2 = pos.x * pos.x + pos.z * pos.z;
  if (r2 < 56 * 56) {
    return { id: 'pillar', name: 'Pilar Central', subtitle: 'Eje Gravitatorio de Hekseville' };
  }
  if (pos.x > 52 && pos.z > -160 && pos.z < 110) {
    return { id: 'auldnoir', name: 'Auldnoir', subtitle: 'Casco Antiguo y Terrazas' };
  }
  if (pos.z >= 75) {
    return { id: 'pleajeune', name: 'Pleajeune', subtitle: 'Avenidas Altas y Luces' };
  }
  if (pos.z <= -80 && pos.x > -95) {
    return { id: 'endestria', name: 'Endestria', subtitle: 'Sector Industrial y Tuberías' };
  }
  if (pos.x <= -90) {
    return { id: 'vendecentre', name: 'Vendecentre', subtitle: 'Rascacielos y Viaducto Oeste' };
  }
  return { id: 'auldnoir', name: 'Hekseville', subtitle: 'Ciudad Flotante' };
}
