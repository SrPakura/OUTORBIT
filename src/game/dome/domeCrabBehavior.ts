// ============================================================================
// DOME CRAB BEHAVIOR — IA del Cangrejo Cañón (modo Cúpula)
// ============================================================================
// Comportamiento del cangrejo extraído de DomeWaveManager (P6): la FSM de
// suelos flotantes (agarre, salto parabólico entre slabs, aterrizaje suave y
// deslizamiento por knockback), la torreta que rastrea a Nyx, el guiñeo de
// vuelo y el aleteo procedural de patas. Incluye los helpers de colocación
// sobre slabs compartidos con el spawn del manager.
//
// Solo updateCrabEnemy necesita contexto (flotación compartida); el resto
// son funciones puras sobre el estado del enemigo. Scratch de módulo: cero
// allocations por frame.
// ============================================================================

import * as THREE from 'three';
import type { SlabCollider } from './domeTypes';
import { lookAtQuat } from './domeEnemyOrient';
import type { EnemyInternal, ManagedWaveEnemy } from './DomeWaveManager';

// ============================================================================
// Constantes del Cangrejo Cañón
// ============================================================================

const CRAB_TURN_RATE = 4.0; // Giro del cuerpo sobre el slab (slerp/seg).
const CRAB_TURRET_TURN_RATE = 6.0; // Giro del cañón hacia Nyx (slerp/seg).
const CANNON_MUZZLE_DISTANCE = 1.4; // Boca del cañón desde el hueso turret.
const CRAB_SLAB_MARGIN = 1.1; // Margen para no salirse del borde del slab.
const CRAB_ATTACH_BLEND_TIME = 0.45; // Aterrizaje suave al cambiar de slab.
// --- Cangrejo Artillero: spawn sobre suelos + salto entre ellos ---
const CRAB_SPAWN_MAX_R = 70.0; // Radio preferido del slab de spawn.
const CRAB_LEAVE_R = 72.0; // El slab flotante sale de la cúpula: saltar.
const CRAB_JUMP_TARGET_MAX_R = 68.0; // Radio preferido del slab de aterrizaje.
const CRAB_JUMP_DURATION = 0.75; // Duración base del arco del salto (s).
const CRAB_JUMP_DURATION_MAX = 2.4; // Techo de duración en saltos largos (s).
const CRAB_JUMP_H_SPEED = 22.0; // Velocidad horizontal de referencia (m/s).
const CRAB_JUMP_ARC_MIN = 2.5; // Altura mínima del arco (m).
const CRAB_JUMP_ARC_MAX = 9.0; // Altura máxima del arco (m).
const CRAB_GRAB_RANGE = 55.0; // Alcance del salto de agarre desde el aire (m).
const CRAB_SKID_DAMPING = 6.0; // Fricción del deslizamiento por knockback (1/s).
const CRAB_AIR_DAMPING = 3.0; // Fricción del desvío por knockback en vuelo (1/s).
const CRAB_LEG_WAVE_SPEED = 14.0; // Velocidad del aleteo de patas en vuelo.
const CRAB_FLIGHT_WOBBLE = 0.12; // Guiñeo ligero del cuerpo en vuelo (rad).
const CRAB_FLIGHT_WOBBLE_SPEED = 2.7; // Frecuencia del guiñeo de vuelo (rad/s).

// ============================================================================
// Tipos, helpers de slab y scratch
// ============================================================================
/** Salto parabólico del cangrejo entre suelos (estado en vuelo). */
export interface CrabJump {
  /** Punto de despegue en espacio mundo. */
  from: THREE.Vector3;
  /** Id del slab de aterrizaje. */
  targetSlabId: string;
  /** Offset local (lx, lz) de aterrizaje dentro del slab destino. */
  targetLocal: THREE.Vector2;
  /** Duración total del salto (s). */
  duration: number;
  /** Segundos de vuelo transcurridos. */
  time: number;
  /** Altura del vértice del arco sobre la línea despegue→aterrizaje (m). */
  arcHeight: number;
  /** Desvío acumulado por knockback durante el vuelo (m). */
  offset: THREE.Vector3;
}

/** Punto mundial sobre la cara superior (+Y local) del slab para un offset local. */
export function slabTopPoint(slab: SlabCollider, local: THREE.Vector2, out: THREE.Vector3): THREE.Vector3 {
  _localOffset.set(local.x, slab.halfExtents.y, local.y).applyQuaternion(slab.quaternion);
  return out.copy(slab.center).add(_localOffset);
}

/**
 * Offset local (lx, lz) aleatorio dentro de la zona pisable del slab: el
 * polígono real de la tapa superior si es un suelo flotante arrancado
 * (colisión exacta: nunca flota en el aire junto al borde visible), el
 * rectángulo OBB con margen, o un punto baricéntrico del triángulo 2D si el
 * slab es un triángulo de la esfera (Miniboss/Boss).
 */
export function pickSlabLocalPoint(slab: SlabCollider, rng: () => number, out: THREE.Vector2): void {
  const tri = slab.localTriangle2D;
  if (tri) {
    let u = rng();
    let v = rng();
    if (u + v > 1) {
      u = 1 - u;
      v = 1 - v;
    }
    const w = 1 - u - v;
    const gx = (tri[0] + tri[2] + tri[4]) / 3;
    const gz = (tri[1] + tri[3] + tri[5]) / 3;
    // Contraído hacia el centroide para respetar el margen del borde.
    out.set(
      gx + (u * tri[0] + v * tri[2] + w * tri[4] - gx) * 0.65,
      gz + (u * tri[1] + v * tri[3] + w * tri[5] - gz) * 0.65,
    );
    return;
  }
  const contour = slab.exactMesh?.capContour;
  if (contour) {
    // Muestreo por abanico de triángulos (centro, v[i], v[i+1]) ponderado por
    // área: el punto cae siempre DENTRO del polígono visible de la tapa.
    const n = contour.length / 2;
    let totalArea = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      totalArea +=
        Math.abs(contour[i * 2] * contour[j * 2 + 1] - contour[j * 2] * contour[i * 2 + 1]) * 0.5;
    }
    let pick = rng() * totalArea;
    let bi = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const area =
        Math.abs(contour[i * 2] * contour[j * 2 + 1] - contour[j * 2] * contour[i * 2 + 1]) * 0.5;
      if (pick <= area) {
        bi = i;
        break;
      }
      pick -= area;
    }
    const bj = (bi + 1) % n;
    let u = rng();
    let v = rng();
    if (u + v > 1) {
      u = 1 - u;
      v = 1 - v;
    }
    const px = u * contour[bi * 2] + v * contour[bj * 2];
    const pz = u * contour[bi * 2 + 1] + v * contour[bj * 2 + 1];
    // Contraído hacia el centroide para respetar el margen del borde.
    const cx = contourCentroidX(contour);
    const cz = contourCentroidZ(contour);
    const s = slab.mesh.scale.x || 1;
    const margin = CRAB_SLAB_MARGIN / s;
    out.set(
      (cx + (px - cx) * contourContraction(cx, cz, px, pz, margin)) * s,
      (cz + (pz - cz) * contourContraction(cx, cz, px, pz, margin)) * s,
    );
    return;
  }
  const mx = Math.max(0, slab.halfExtents.x - CRAB_SLAB_MARGIN);
  const mz = Math.max(0, slab.halfExtents.z - CRAB_SLAB_MARGIN);
  out.set((rng() * 2 - 1) * mx, (rng() * 2 - 1) * mz);
}

/** Centroide X de los vértices del polígono de la tapa. */
function contourCentroidX(contour: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < contour.length; i += 2) sum += contour[i];
  return sum / (contour.length / 2);
}

/** Centroide Z de los vértices del polígono de la tapa. */
function contourCentroidZ(contour: Float32Array): number {
  let sum = 0;
  for (let i = 1; i < contour.length; i += 2) sum += contour[i];
  return sum / (contour.length / 2);
}

/**
 * Factor de contracción hacia el centroide que deja el punto a `margin`
 * (unidades locales sin escala) del borde a lo largo de su propio rayo.
 */
function contourContraction(cx: number, cz: number, px: number, pz: number, margin: number): number {
  const dx = px - cx;
  const dz = pz - cz;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-4) return 0;
  return Math.max(0.1, 1 - margin / dist);
}

/** ¿Está (x, z) dentro del polígono de la tapa? (test par-impar) */
function pointInContour(contour: Float32Array, x: number, z: number): boolean {
  let inside = false;
  const n = contour.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = contour[i * 2];
    const zi = contour[i * 2 + 1];
    const xj = contour[j * 2];
    const zj = contour[j * 2 + 1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Fija el offset local dentro de los bordes del slab (el knockback desliza).
 * En suelos flotantes arrancados: dentro del polígono visible de la tapa,
 * contraído al borde más cercano si el deslizamiento salió de la tapa.
 */
function clampSlabLocalPoint(slab: SlabCollider, local: THREE.Vector2): void {
  const tri = slab.localTriangle2D;
  if (tri) {
    // Triángulo: si el deslizamiento salió del triángulo, tira al centroide.
    const s1 = (tri[2] - tri[0]) * (local.y - tri[1]) - (tri[3] - tri[1]) * (local.x - tri[0]);
    const s2 = (tri[4] - tri[2]) * (local.y - tri[3]) - (tri[5] - tri[3]) * (local.x - tri[2]);
    const s3 = (tri[0] - tri[4]) * (local.y - tri[5]) - (tri[1] - tri[5]) * (local.x - tri[4]);
    if ((s1 < 0 || s2 < 0 || s3 < 0) && (s1 > 0 || s2 > 0 || s3 > 0)) {
      local.set((tri[0] + tri[2] + tri[4]) / 3, (tri[1] + tri[3] + tri[5]) / 3);
    }
    return;
  }
  const contour = slab.exactMesh?.capContour;
  if (contour) {
    const s = slab.mesh.scale.x || 1;
    const ux = local.x / s;
    const uz = local.y / s;
    if (pointInContour(contour, ux, uz)) return;
    // Fuera de la tapa visible: al punto más cercano del borde del polígono,
    // contraído hacia el centroide para conservar el margen del cangrejo.
    const n = contour.length / 2;
    let bestD2 = Infinity;
    let bx = 0;
    let bz = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = contour[i * 2];
      const az = contour[i * 2 + 1];
      const bxx = contour[j * 2];
      const bzz = contour[j * 2 + 1];
      const ex = bxx - ax;
      const ez = bzz - az;
      const lenSq = ex * ex + ez * ez;
      const t = lenSq > 1e-9 ? Math.min(1, Math.max(0, ((ux - ax) * ex + (uz - az) * ez) / lenSq)) : 0;
      const qx = ax + ex * t;
      const qz = az + ez * t;
      const dx = ux - qx;
      const dz = uz - qz;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) {
        bestD2 = d2;
        bx = qx;
        bz = qz;
      }
    }
    const cx = contourCentroidX(contour);
    const cz = contourCentroidZ(contour);
    const k = contourContraction(cx, cz, bx, bz, CRAB_SLAB_MARGIN / s);
    local.set((cx + (bx - cx) * k) * s, (cz + (bz - cz) * k) * s);
    return;
  }
  const mx = Math.max(0, slab.halfExtents.x - CRAB_SLAB_MARGIN);
  const mz = Math.max(0, slab.halfExtents.z - CRAB_SLAB_MARGIN);
  local.x = THREE.MathUtils.clamp(local.x, -mx, mx);
  local.y = THREE.MathUtils.clamp(local.y, -mz, mz);
}

/**
 * Slab de spawn del cangrejo: uno aleatorio dentro de R < 70 m; si todos están
 * lejos, el más cercano al centro de la cúpula.
 */
export function pickCrabSpawnSlab(activeSlabs: SlabCollider[], rng: () => number): SlabCollider | null {
  if (activeSlabs.length === 0) {
    return null;
  }
  let nearCount = 0;
  for (const slab of activeSlabs) {
    if (slab.center.length() < CRAB_SPAWN_MAX_R) {
      nearCount++;
    }
  }
  if (nearCount > 0) {
    let pick = Math.floor(rng() * nearCount);
    for (const slab of activeSlabs) {
      if (slab.center.length() < CRAB_SPAWN_MAX_R && pick-- === 0) {
        return slab;
      }
    }
  }
  let best = activeSlabs[0];
  for (const slab of activeSlabs) {
    if (slab.center.length() < best.center.length()) {
      best = slab;
    }
  }
  return best;
}

/**
 * Destino del salto del cangrejo: el slab disponible más cercano al cangrejo
 * con center < 68 m o, si todos están lejos, el más cercano al centro de la
 * cúpula. Excluye el slab que está abandonando.
 */
function pickCrabJumpSlab(
  activeSlabs: SlabCollider[] | undefined,
  leavingSlabId: string | null,
  fromPos: THREE.Vector3,
): SlabCollider | null {
  if (!activeSlabs || activeSlabs.length === 0) {
    return null;
  }
  let best: SlabCollider | null = null;
  let bestScore = Infinity;
  for (const slab of activeSlabs) {
    if (slab.id === leavingSlabId) {
      continue;
    }
    if (slab.center.length() < CRAB_JUMP_TARGET_MAX_R) {
      const score = fromPos.distanceTo(slab.center);
      if (score < bestScore) {
        best = slab;
        bestScore = score;
      }
    }
  }
  if (best) {
    return best;
  }
  for (const slab of activeSlabs) {
    if (slab.id === leavingSlabId) {
      continue;
    }
    const score = slab.center.length();
    if (score < bestScore) {
      best = slab;
      bestScore = score;
    }
  }
  return best;
}

/** Altura del arco del salto según la distancia al slab destino. */
function crabJumpArc(dist: number): number {
  return Math.min(CRAB_JUMP_ARC_MAX, CRAB_JUMP_ARC_MIN + dist * 0.22);
}

/** Busca un slab por id dentro de la lista de suelos activos. */
function findSlabById(slabs: SlabCollider[], id: string): SlabCollider | null {
  for (const slab of slabs) {
    if (slab.id === id) {
      return slab;
    }
  }
  return null;
}

/** Duración del salto: ~0.75 s en saltos cortos, algo más en saltos largos. */
function crabJumpDuration(dist: number): number {
  return Math.min(CRAB_JUMP_DURATION_MAX, Math.max(CRAB_JUMP_DURATION, dist / CRAB_JUMP_H_SPEED));
}

// Vectores scratch de módulo (cero allocations por frame).
const _up = new THREE.Vector3(0, 1, 0);
const _lookDir = new THREE.Vector3();
const _aimDir = new THREE.Vector3();
const _basisX = new THREE.Vector3();
const _basisMat = new THREE.Matrix4();
const _targetQuat = new THREE.Quaternion();
const _rollQuat = new THREE.Quaternion();
const _invQuat = new THREE.Quaternion();
const _turretWorldQuat = new THREE.Quaternion();
const _slabUp = new THREE.Vector3();
const _slabForward = new THREE.Vector3();
const _localOffset = new THREE.Vector3();
const _targetPos = new THREE.Vector3();
const _muzzlePos = new THREE.Vector3();
const _muzzleDir = new THREE.Vector3();
const _legWaveQuat = new THREE.Quaternion();
const _legWaveAxis = new THREE.Vector3(1, 0, 0);

// ============================================================================
// Contexto compartido con el DomeWaveManager
// ============================================================================
export interface CrabBehaviorContext {
  /** Flotación con muelle hacia homePos (vive en el manager). */
  applyFloatMovement(
    enemy: ManagedWaveEnemy,
    internal: EnemyInternal,
    dt: number,
    elapsed: number,
  ): void;
}

export function updateCrabEnemy(
  ctx: CrabBehaviorContext,
  enemy: ManagedWaveEnemy,
  internal: EnemyInternal,
  dt: number,
  elapsed: number,
  playerPos: THREE.Vector3,
  activeSlabs: SlabCollider[] | undefined,
): void {
  const slab =
    internal.attachedSlabId && activeSlabs
      ? findSlabById(activeSlabs, internal.attachedSlabId)
      : null;

  // El slab salió de la cúpula (>72 m) o desapareció: salta hacia otro.
  if (internal.attachedSlabId && (!slab || slab.center.length() > CRAB_LEAVE_R)) {
    startCrabJump(enemy, internal, activeSlabs, internal.attachedSlabId);
  }

  if (internal.jump) {
    updateCrabJump(enemy, internal, dt, activeSlabs);
    flapCrabLegs(enemy, internal, elapsed);
    return;
  }

  if (internal.attachedSlabId && slab) {
    updateCrabOnSlab(enemy, internal, slab, dt, playerPos);
    return;
  }

  // Sin slab: flotación suave + guiñeo de vuelo + agarre de suelos cercanos.
  ctx.applyFloatMovement(enemy, internal, dt, elapsed);
  orientCrabInFlight(enemy, dt, elapsed, playerPos);
  flapCrabLegs(enemy, internal, elapsed);
  if (activeSlabs && activeSlabs.length > 0) {
    const target = pickCrabJumpSlab(activeSlabs, null, enemy.position);
    if (target && enemy.position.distanceTo(target.center) <= CRAB_GRAB_RANGE) {
      startCrabJump(enemy, internal, activeSlabs, null);
    }
  }
}

/**
 * Arranca el salto parabólico hacia el mejor slab disponible (center < 68 m
 * o el más cercano al centro). Sin destino, el cangrejo pasa a flotación
 * suave anclada donde está.
 */
function startCrabJump(
  enemy: ManagedWaveEnemy,
  internal: EnemyInternal,
  activeSlabs: SlabCollider[] | undefined,
  leavingSlabId: string | null,
): CrabJump | null {
  const target = pickCrabJumpSlab(activeSlabs, leavingSlabId, enemy.position);
  if (!target) {
    internal.attachedSlabId = null;
    internal.jump = null;
    enemy.homePos.copy(enemy.position);
    return null;
  }
  const targetLocal = new THREE.Vector2();
  pickSlabLocalPoint(target, Math.random, targetLocal);
  slabTopPoint(target, targetLocal, _targetPos);
  _slabUp.set(0, 1, 0).applyQuaternion(target.quaternion);
  _targetPos.addScaledVector(_slabUp, internal.standHeight);
  const dist = enemy.position.distanceTo(_targetPos);
  internal.jump = {
    from: enemy.position.clone(),
    targetSlabId: target.id,
    targetLocal,
    duration: crabJumpDuration(dist),
    time: 0,
    arcHeight: crabJumpArc(dist),
    offset: new THREE.Vector3(),
  };
  internal.attachedSlabId = null;
  return internal.jump;
}

/** Progresa el arco del salto en curso hasta aterrizar pegado al destino. */
function updateCrabJump(
  enemy: ManagedWaveEnemy,
  internal: EnemyInternal,
  dt: number,
  activeSlabs: SlabCollider[] | undefined,
): void {
  const jump = internal.jump;
  if (!jump) {
    return;
  }

  // El knockback en vuelo desvía el arco; el amortiguador de aire lo frena.
  jump.offset.addScaledVector(enemy.velocity, dt);
  enemy.velocity.multiplyScalar(Math.exp(-CRAB_AIR_DAMPING * dt));

  const targetSlab = activeSlabs ? findSlabById(activeSlabs, jump.targetSlabId) : null;
  if (!targetSlab) {
    // El slab destino desapareció en pleno vuelo: re-objetiva o flota.
    const next = startCrabJump(enemy, internal, activeSlabs, jump.targetSlabId);
    if (next) {
      next.offset.add(jump.offset);
    }
    return;
  }

  jump.time += dt;
  const t = Math.min(1, jump.time / jump.duration);

  // Aterrizaje sobre la cara superior del slab destino (sigue su bob).
  slabTopPoint(targetSlab, jump.targetLocal, _targetPos);
  _slabUp.set(0, 1, 0).applyQuaternion(targetSlab.quaternion);
  _targetPos.addScaledVector(_slabUp, internal.standHeight);

  // Arco parabólico: línea despegue→aterrizaje más la altura del salto.
  enemy.position.lerpVectors(jump.from, _targetPos, t);
  enemy.position.y += jump.arcHeight * 4 * t * (1 - t);
  enemy.position.add(jump.offset);

  if (t >= 1) {
    // Aterrizaje pegado al slab destino, con blend suave desde donde tocó.
    internal.jump = null;
    internal.attachedSlabId = jump.targetSlabId;
    internal.slabLocalOffset.copy(jump.targetLocal);
    internal.attachBlend = 0;
    internal.attachFrom.copy(enemy.position);
  }
}

/** Cangrejo pegado a su slab: anclaje, deslizamiento por knockback y apuntado. */
function updateCrabOnSlab(
  enemy: ManagedWaveEnemy,
  internal: EnemyInternal,
  slab: SlabCollider,
  dt: number,
  playerPos: THREE.Vector3,
): void {
  // El knockback desliza el offset local, fijado dentro de los bordes.
  if (enemy.velocity.lengthSq() > 1e-6) {
    _localOffset.copy(enemy.velocity).applyQuaternion(slab.invQuaternion);
    internal.slabLocalOffset.x += _localOffset.x * dt;
    internal.slabLocalOffset.y += _localOffset.z * dt;
    clampSlabLocalPoint(slab, internal.slabLocalOffset);
    enemy.velocity.multiplyScalar(Math.exp(-CRAB_SKID_DAMPING * dt));
  }

  // Anclaje a la cara superior (+Y local) del slab: el origen sube la altura
  // de apoyo medida sobre el modelo ya skinneado, así las almohadillas de las
  // 5 patas tocan la tapa sin flotar ni hundirse.
  slabTopPoint(slab, internal.slabLocalOffset, _targetPos);
  _slabUp.set(0, 1, 0).applyQuaternion(slab.quaternion);
  _targetPos.addScaledVector(_slabUp, internal.standHeight);
  if (internal.attachBlend < 1) {
    internal.attachBlend = Math.min(1, internal.attachBlend + dt / CRAB_ATTACH_BLEND_TIME);
    const t = internal.attachBlend;
    enemy.position.lerpVectors(internal.attachFrom, _targetPos, t * t * (3 - 2 * t));
  } else {
    enemy.position.copy(_targetPos);
  }

  // El cuerpo gira sobre el slab para encarar a Nyx.
  _aimDir.subVectors(playerPos, enemy.position);
  if (_aimDir.lengthSq() > 1e-6) {
    _aimDir.normalize();
    _slabForward.copy(_aimDir).addScaledVector(_slabUp, -_aimDir.dot(_slabUp));
    if (_slabForward.lengthSq() > 1e-4) {
      _slabForward.normalize();
      _basisX.crossVectors(_slabUp, _slabForward).normalize();
      _basisMat.makeBasis(_basisX, _slabUp, _slabForward);
      _targetQuat.setFromRotationMatrix(_basisMat);
      enemy.mesh.quaternion.slerp(_targetQuat, 1 - Math.exp(-CRAB_TURN_RATE * dt));
    }
  }

  // El cañón apunta fino hacia Nyx por encima del giro del cuerpo.
  aimCrabTurret(internal, dt, playerPos);
}

/** Boca del cañón en espacio mundo (hueso `turret` o mesh `detail_cannon`). */
export function computeCrabMuzzle(internal: EnemyInternal, out: THREE.Vector3): boolean {
  const node = internal.turretNode;
  if (!node) {
    return false;
  }
  node.updateWorldMatrix(true, false);
  node.getWorldPosition(out);
  node.getWorldQuaternion(_turretWorldQuat);
  _muzzleDir.copy(internal.turretForward).applyQuaternion(_turretWorldQuat);
  out.addScaledVector(_muzzleDir, CANNON_MUZZLE_DISTANCE);
  return true;
}

/** Gira el hueso del cañón para apuntar su eje de disparo hacia Nyx. */
function aimCrabTurret(internal: EnemyInternal, dt: number, playerPos: THREE.Vector3): void {
  const node = internal.turretNode;
  if (!node) {
    return;
  }
  node.updateWorldMatrix(true, false);
  node.getWorldPosition(_muzzlePos);
  _lookDir.subVectors(playerPos, _muzzlePos);
  if (_lookDir.lengthSq() < 1e-6) {
    return;
  }
  _lookDir.normalize();
  // Orientación mundial deseada: el eje local del cañón apunta a Nyx.
  _targetQuat.setFromUnitVectors(internal.turretForward, _lookDir);
  const parent = node.parent;
  if (parent) {
    parent.getWorldQuaternion(_invQuat).invert();
    _targetQuat.premultiply(_invQuat);
  }
  node.quaternion.slerp(_targetQuat, 1 - Math.exp(-CRAB_TURRET_TURN_RATE * dt));
}

/** Cangrejo en el aire sin slab: encara a Nyx con un guiñeo ligero. */
function orientCrabInFlight(
  enemy: ManagedWaveEnemy,
  dt: number,
  elapsed: number,
  playerPos: THREE.Vector3,
): void {
  _lookDir.subVectors(playerPos, enemy.position);
  if (_lookDir.lengthSq() < 1e-6) {
    _lookDir.set(0, 0, 1);
  } else {
    _lookDir.normalize();
  }
  lookAtQuat(_lookDir, _up, _targetQuat);
  _rollQuat.setFromAxisAngle(
    _up,
    Math.sin(elapsed * CRAB_FLIGHT_WOBBLE_SPEED + enemy.phase) * CRAB_FLIGHT_WOBBLE,
  );
  _targetQuat.premultiply(_rollQuat);
  enemy.mesh.quaternion.slerp(_targetQuat, 1 - Math.exp(-CRAB_TURN_RATE * dt));
}

/** Aleteo procedural de las patas (`leg_*`) mientras el cangrejo vuela. */
function flapCrabLegs(enemy: ManagedWaveEnemy, internal: EnemyInternal, elapsed: number): void {
  for (let i = 0; i < internal.legs.length; i++) {
    const leg = internal.legs[i];
    _legWaveQuat.setFromAxisAngle(
      _legWaveAxis,
      Math.sin(elapsed * CRAB_LEG_WAVE_SPEED + enemy.phase + i * 0.8) * leg.amplitude,
    );
    leg.bone.quaternion.copy(leg.rest).multiply(_legWaveQuat);
  }
}
