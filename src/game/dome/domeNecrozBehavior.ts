import * as THREE from 'three';
import { createComicCelMaterial } from '@/game/render/toonMaterials';
import { DOME_PLAYER_BOUND_RADIUS, type SlabCollider } from './domeTypes';

// ============================================================================
// Prisma Necroz — Fortaleza estacionaria de IA Perfecta & Pereza extrema
// ============================================================================

const NECROZ_ROT_SPEED_RAD = THREE.MathUtils.degToRad(25); // 25°/s = 0.4363 rad/s
const NECROZ_SHIELD_PAD = 1.1; // shieldRadius = enemy.radius (3.8) + 1.1 = 4.9 m
const NECROZ_INITIAL_BUILD_SEC = 1.0;
const NECROZ_REBUILD_SEC = 4.0;
const NECROZ_REBUILD_MIN_BROKEN_FRAC = 0.45; // No reconstruye por agujeros < 45%

const NECROZ_DEF_SPIKE_HEIGHT = 1.5;
const NECROZ_DEF_SPIKE_GROW_RATE = 8.0;
const NECROZ_DEF_SPIKE_RANGE = 11.0;
const NECROZ_DEF_IMPATIENCE_SEC = 1.5;
const NECROZ_DEF_RELUCTANCE_DELAY_SEC = 0.35;
const NECROZ_DEF_SPIKE_DAMAGE = 12;
const NECROZ_DEF_SPIKE_PUSH = 24;

// Esfera Blanca exterior (80–88.6 m): pirámides de 75 m de altura.
const DOME_SPIKE_BASE_RADIUS = DOME_PLAYER_BOUND_RADIUS - 3.6; // ~85 m
const DOME_SPIKE_HEIGHT = 75.0;
const DOME_SPIKE_GROW_SEC = 2.3;
const DOME_SPIKE_HOLD_SEC = 2.0;
const DOME_SPIKE_RETRACT_SEC = 0.5;
const DOME_SPIKE_POOL_SIZE = 32;
const DOME_SPIKE_BASE_HALF = 5.4;
const DOME_SPIKE_PAIR_DELAY_SEC = 0.9;
const DOME_SPIKE_WAVE_INTERVAL_SEC = 2.8;
const DOME_SPIKE_DAMAGE = 10;
const DOME_SPIKE_PUSH = 22;

// Púas teledirigidas (rastro a 5 m/s con 1.0 m de separación mínima).
const HOMING_SPIKE_SPEED = 5.0;
const HOMING_SPIKE_MIN_SEP = 1.0;
const HOMING_SPIKE_INTERVAL = 0.45;

// Sistema de Pereza (0 -> 100)
const LAZINESS_DRAIN_PER_SEC = 8.0;
const LAZINESS_DEF_ACTIVATE = 12.0;
const LAZINESS_DEF_HOLD_PER_SEC = 10.0;
const LAZINESS_HOMING_COST = 4.0;
const LAZINESS_OFFENSIVE_PAIR_COST = 6.0;
const LAZINESS_REBUILD_COST = 45.0;
const LAZINESS_SLOTH_DURATION_SEC = 5.0;

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _v5 = new THREE.Vector3();
const _invQ = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

export interface ShieldTriangle {
  v0: THREE.Vector3;
  v1: THREE.Vector3;
  v2: THREE.Vector3;
  center: THREE.Vector3;
  normal: THREE.Vector3;
  /** Orden de propagación desde +Z local hacia -Z local (0..1). */
  buildOrder: number;
  intact: boolean;
  spikeH: number;
}

export interface DomeSpikeSlot {
  active: boolean;
  homing: boolean;
  phase: 'grow' | 'hold' | 'retract';
  timer: number;
  height: number;
  /** Centro de la base sobre la esfera exterior (dir * DOME_SPIKE_BASE_RADIUS). */
  baseCenter: THREE.Vector3;
  /** Normal hacia el interior de la cúpula (-baseCenter.normalize()). */
  inward: THREE.Vector3;
  /** Los 3 vértices del triángulo base en mundo. */
  b0: THREE.Vector3;
  b1: THREE.Vector3;
  b2: THREE.Vector3;
  /** Punta actual en mundo (orientada hacia Nyx pero clampeada al triángulo base). */
  apex: THREE.Vector3;
  hitCooldown: number;
  mesh: THREE.Mesh;
  posAttr: THREE.BufferAttribute;
}

export interface NecrozBossState {
  laziness: number;
  slothTimer: number;
  /** Ángulo Y acumulado (25°/s, se congela a 0°/s en Pasotismo Total). */
  yawRad: number;

  // Escudo triangulado personal
  shieldRadius: number;
  shieldMesh: THREE.Mesh;
  shieldPosAttr: THREE.BufferAttribute;
  shieldEdgePosAttr: THREE.BufferAttribute;
  shieldTriangles: ShieldTriangle[];
  building: boolean;
  buildProgress: number;
  buildDuration: number;
  defensiveSpikesOut: boolean;
  defensiveHoldTimer: number;
  defensiveDelayTimer: number;
  defensiveHitCd: number;

  // Oleadas de púas ofensivas (75 m) y teledirigidas (5 m/s)
  offensiveWavesLeft: number;
  offensivePairStep: 0 | 1 | 2;
  offensiveTimer: number;
  homingLeft: number;
  homingTimer: number;
  lastHomingBase: THREE.Vector3;
  hasLastHoming: boolean;
  lastAttackWasHoming: boolean;
  aiPauseTimer: number;

  // Clips / feedback
  hitTimer: number;
  defClipTimer: number;
  currentClip: THREE.AnimationAction | null;
}

export interface NecrozBehaviorContext {
  scene: THREE.Scene;
  domeSpikes: DomeSpikeSlot[];
  playerVelocity: THREE.Vector3;
  speedMult: number;
  activeSlabs?: readonly SlabCollider[];
  onGolemSmash?: (damage: number, pushDir: THREE.Vector3, pushSpeed?: number) => void;
}

export function createNecrozBossState(
  scene: THREE.Scene,
  enemyRadius: number,
  mesh: THREE.Object3D,
): NecrozBossState {
  const shieldRadius = enemyRadius + NECROZ_SHIELD_PAD;
  const ico = new THREE.IcosahedronGeometry(shieldRadius, 0);
  const nonIdx = ico.index ? ico.toNonIndexed() : ico;
  const pos = nonIdx.getAttribute('position');
  const triCount = Math.floor(pos.count / 3);
  const triangles: ShieldTriangle[] = [];

  for (let i = 0; i < triCount; i++) {
    const v0 = new THREE.Vector3().fromBufferAttribute(pos, i * 3 + 0);
    const v1 = new THREE.Vector3().fromBufferAttribute(pos, i * 3 + 1);
    const v2 = new THREE.Vector3().fromBufferAttribute(pos, i * 3 + 2);
    const center = new THREE.Vector3().add(v0).add(v1).add(v2).multiplyScalar(1 / 3);
    const normal = center.clone().normalize();
    triangles.push({
      v0,
      v1,
      v2,
      center,
      normal,
      buildOrder: 0,
      intact: false, // Empieza sin escudo; tarda 1.0 s en construirse al iniciar
      spikeH: 0,
    });
  }
  ico.dispose();
  if (nonIdx !== ico) nonIdx.dispose();

  // Ordenar de +Z (frontal) hacia -Z (trasera) para la propagación triángulo a triángulo.
  const orderIndices = triangles.map((_, idx) => idx);
  orderIndices.sort((a, b) => triangles[b].center.z - triangles[a].center.z);
  for (let rank = 0; rank < orderIndices.length; rank++) {
    triangles[orderIndices[rank]].buildOrder = rank / Math.max(1, orderIndices.length - 1);
  }

  // Cada triángulo del escudo = 3 sub-triángulos (9 vértices) para extrusión 4.º vértice,
  // con colores por cara (tonos variados de cristal) para distinguir cada triángulo.
  const buf = new Float32Array(triCount * 9 * 3);
  const colBuf = new Float32Array(triCount * 9 * 3);
  const PALETTE = [
    new THREE.Color(0x6d28d9), // violeta profundo
    new THREE.Color(0x9333ea), // púrpura vivo
    new THREE.Color(0xc026d3), // fucsia cristalino
    new THREE.Color(0x4338ca), // índigo oscuro
    new THREE.Color(0xa855f7), // amatista brillante
  ];
  for (let i = 0; i < triCount; i++) {
    const c = PALETTE[i % PALETTE.length];
    for (let v = 0; v < 9; v++) {
      const o = (i * 9 + v) * 3;
      colBuf[o + 0] = c.r;
      colBuf[o + 1] = c.g;
      colBuf[o + 2] = c.b;
    }
  }
  const shieldGeo = new THREE.BufferGeometry();
  const shieldPosAttr = new THREE.BufferAttribute(buf, 3);
  shieldPosAttr.setUsage(THREE.DynamicDrawUsage);
  shieldGeo.setAttribute('position', shieldPosAttr);
  shieldGeo.setAttribute('color', new THREE.BufferAttribute(colBuf, 3));
  shieldGeo.computeVertexNormals();

  const shieldMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.72,
    side: THREE.FrontSide,
    depthWrite: false,
  });
  const shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
  shieldMesh.name = 'necroz_crystal_shield';
  // Se añade como hijo de mesh para rotar solidariamente a 25°/s.
  mesh.add(shieldMesh);

  // Tinta exterior limpia SOLO en los 3 bordes de cada triángulo (6 vértices/tri).
  const edgeBuf = new Float32Array(triCount * 6 * 3);
  const edgeGeo = new THREE.BufferGeometry();
  const shieldEdgePosAttr = new THREE.BufferAttribute(edgeBuf, 3);
  shieldEdgePosAttr.setUsage(THREE.DynamicDrawUsage);
  edgeGeo.setAttribute('position', shieldEdgePosAttr);
  const edgeMat = new THREE.LineBasicMaterial({
    color: 0xf5d0fe,
    transparent: true,
    opacity: 0.92,
  });
  const edgeLines = new THREE.LineSegments(edgeGeo, edgeMat);
  shieldMesh.add(edgeLines);

  void scene;

  return {
    laziness: 0,
    slothTimer: 0,
    yawRad: 0,
    shieldRadius,
    shieldMesh,
    shieldPosAttr,
    shieldEdgePosAttr,
    shieldTriangles: triangles,
    building: true,
    buildProgress: 0,
    buildDuration: NECROZ_INITIAL_BUILD_SEC,
    defensiveSpikesOut: false,
    defensiveHoldTimer: 0,
    defensiveDelayTimer: 0,
    defensiveHitCd: 0,
    offensiveWavesLeft: 0,
    offensivePairStep: 0,
    offensiveTimer: 0,
    homingLeft: 0,
    homingTimer: 0,
    lastHomingBase: new THREE.Vector3(),
    hasLastHoming: false,
    lastAttackWasHoming: false,
    aiPauseTimer: 0,
    hitTimer: 0,
    defClipTimer: 0,
    currentClip: null,
  };
}

export function createDomeSpikePool(scene: THREE.Scene): DomeSpikeSlot[] {
  const slots: DomeSpikeSlot[] = [];
  const mat = createComicCelMaterial(0xf8fafc, {
    rimColor: 0x7dd3fc,
    rimStrength: 1.35,
    emissiveBoost: 0.85,
  });
  mat.side = THREE.DoubleSide;

  for (let i = 0; i < DOME_SPIKE_POOL_SIZE; i++) {
    // 3 caras laterales de la pirámide (9 vértices)
    const buf = new Float32Array(9 * 3);
    const geo = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(buf, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', posAttr);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    mesh.frustumCulled = false;
    scene.add(mesh);

    slots.push({
      active: false,
      homing: false,
      phase: 'grow',
      timer: 0,
      height: 0,
      baseCenter: new THREE.Vector3(),
      inward: new THREE.Vector3(0, -1, 0),
      b0: new THREE.Vector3(),
      b1: new THREE.Vector3(),
      b2: new THREE.Vector3(),
      apex: new THREE.Vector3(),
      hitCooldown: 0,
      mesh,
      posAttr,
    });
  }
  return slots;
}

export function resetNecrozState(n: NecrozBossState, ctx: NecrozBehaviorContext): void {
  n.laziness = 0;
  n.slothTimer = 0;
  n.defensiveSpikesOut = false;
  n.defensiveHoldTimer = 0;
  n.defensiveDelayTimer = 0;
  n.offensiveWavesLeft = 0;
  n.homingLeft = 0;
  n.hitTimer = 0;
  n.defClipTimer = 0;
  for (const s of ctx.domeSpikes) {
    s.active = false;
    s.mesh.visible = false;
  }
}

export function disposeNecrozState(n: NecrozBossState): void {
  n.shieldMesh.geometry.dispose();
  (n.shieldMesh.material as THREE.Material).dispose();
  for (const child of n.shieldMesh.children) {
    const obj = child as THREE.Mesh | THREE.LineSegments;
    obj.geometry?.dispose();
    const m = obj.material;
    if (m && !Array.isArray(m)) m.dispose();
  }
  n.shieldMesh.removeFromParent();
}

export function disposeDomeSpikePool(slots: DomeSpikeSlot[]): void {
  const mats = new Set<THREE.Material>();
  for (const s of slots) {
    s.mesh.geometry.dispose();
    const m = s.mesh.material;
    if (m && !Array.isArray(m)) mats.add(m);
    s.mesh.removeFromParent();
  }
  for (const m of mats) m.dispose();
}

function writeTri(arr: Float32Array, offset: number, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): void {
  arr[offset + 0] = a.x; arr[offset + 1] = a.y; arr[offset + 2] = a.z;
  arr[offset + 3] = b.x; arr[offset + 4] = b.y; arr[offset + 5] = b.z;
  arr[offset + 6] = c.x; arr[offset + 7] = c.y; arr[offset + 8] = c.z;
}

function syncShieldGeometry(n: NecrozBossState, dt: number): void {
  const arr = n.shieldPosAttr.array as Float32Array;
  const edgeArr = n.shieldEdgePosAttr.array as Float32Array;
  const targetH = n.defensiveSpikesOut ? NECROZ_DEF_SPIKE_HEIGHT : 0;

  for (let i = 0; i < n.shieldTriangles.length; i++) {
    const tri = n.shieldTriangles[i];
    const base = i * 27;
    const eBase = i * 18;
    if (!tri.intact) {
      tri.spikeH = 0;
      arr.fill(0, base, base + 27);
      edgeArr.fill(0, eBase, eBase + 18);
      continue;
    }
    tri.spikeH += (targetH - tri.spikeH) * Math.min(1, dt * NECROZ_DEF_SPIKE_GROW_RATE);
    _v1.copy(tri.center).addScaledVector(tri.normal, tri.spikeH);
    writeTri(arr, base + 0, tri.v0, tri.v1, _v1);
    writeTri(arr, base + 9, tri.v1, tri.v2, _v1);
    writeTri(arr, base + 18, tri.v2, tri.v0, _v1);

    // Tinta exterior del triángulo (v0->v1, v1->v2, v2->v0) ligeramente por fuera
    const s = 1.005;
    edgeArr[eBase + 0] = tri.v0.x * s; edgeArr[eBase + 1] = tri.v0.y * s; edgeArr[eBase + 2] = tri.v0.z * s;
    edgeArr[eBase + 3] = tri.v1.x * s; edgeArr[eBase + 4] = tri.v1.y * s; edgeArr[eBase + 5] = tri.v1.z * s;
    edgeArr[eBase + 6] = tri.v1.x * s; edgeArr[eBase + 7] = tri.v1.y * s; edgeArr[eBase + 8] = tri.v1.z * s;
    edgeArr[eBase + 9] = tri.v2.x * s; edgeArr[eBase + 10] = tri.v2.y * s; edgeArr[eBase + 11] = tri.v2.z * s;
    edgeArr[eBase + 12] = tri.v2.x * s; edgeArr[eBase + 13] = tri.v2.y * s; edgeArr[eBase + 14] = tri.v2.z * s;
    edgeArr[eBase + 15] = tri.v0.x * s; edgeArr[eBase + 16] = tri.v0.y * s; edgeArr[eBase + 17] = tri.v0.z * s;
  }
  n.shieldPosAttr.needsUpdate = true;
  n.shieldEdgePosAttr.needsUpdate = true;
  n.shieldMesh.geometry.computeVertexNormals();
}

/** Devuelve la fracción de triángulos destruidos (0..1). */
function getBrokenFraction(n: NecrozBossState): number {
  let broken = 0;
  for (const t of n.shieldTriangles) {
    if (!t.intact) broken++;
  }
  return broken / Math.max(1, n.shieldTriangles.length);
}

/** Encuentra el triángulo del escudo más alineado con una dirección mundial. */
function findTriangleInDirection(
  n: NecrozBossState,
  meshQuat: THREE.Quaternion,
  worldDir: THREE.Vector3,
): ShieldTriangle | null {
  _invQ.copy(meshQuat).invert();
  _v1.copy(worldDir).normalize().applyQuaternion(_invQ);
  let best: ShieldTriangle | null = null;
  let bestDot = -Infinity;
  for (const t of n.shieldTriangles) {
    const d = t.normal.dot(_v1);
    if (d > bestDot) {
      bestDot = d;
      best = t;
    }
  }
  return best;
}

/**
 * Comprueba si un ataque cuerpo a cuerpo de Nyx choca contra un triángulo
 * intacto del escudo o entra limpio por un hueco destruido.
 */
export function checkNecrozShieldBlock(
  n: NecrozBossState,
  enemyPos: THREE.Vector3,
  meshQuat: THREE.Quaternion,
  playerPos: THREE.Vector3,
): 'blocked' | 'passed_hole' {
  _v2.subVectors(playerPos, enemyPos);
  if (_v2.lengthSq() < 1e-6) return 'passed_hole';
  const tri = findTriangleInDirection(n, meshQuat, _v2);
  if (tri && tri.intact) {
    return 'blocked';
  }
  return 'passed_hole';
}

/**
 * 1 roca pequeña (o habilidad a distancia) destruye 1 triángulo intacto del
 * escudo, abriendo un hueco físico real que rota con Necroz.
 * Devuelve true si un triángulo intacto absorbió el impacto.
 */
export function tryBreakNecrozShieldTriangle(
  n: NecrozBossState,
  enemyPos: THREE.Vector3,
  meshQuat: THREE.Quaternion,
  fromPos: THREE.Vector3,
  onBreakPos?: THREE.Vector3,
): boolean {
  _v2.subVectors(fromPos, enemyPos);
  if (_v2.lengthSq() < 1e-6) return false;
  const tri = findTriangleInDirection(n, meshQuat, _v2);
  if (tri && tri.intact) {
    tri.intact = false;
    tri.spikeH = 0;
    if (onBreakPos) {
      onBreakPos.copy(tri.center).applyQuaternion(meshQuat).add(enemyPos);
    }
    // Si estaba reconstruyendo y le rompen triángulos, se harta y aborta a medias.
    if (n.building && n.buildDuration > 1.5) {
      n.building = false;
    }
    return true;
  }
  return false;
}

const SPHERE_TILE_MIN_R = 72.0;
const SPHERE_TILE_EXCLUDE_DIST = 15.5;

/** Comprueba si una dirección de la esfera está ocupada por un suelo esférico activo. */
function isCoveredBySphereTile(
  dirOnSphere: THREE.Vector3,
  activeSlabs?: readonly SlabCollider[],
): boolean {
  if (!activeSlabs || activeSlabs.length === 0) return false;
  _v5.copy(dirOnSphere).normalize().multiplyScalar(DOME_SPIKE_BASE_RADIUS);
  for (const slab of activeSlabs) {
    // Solo los suelos de la esfera exterior (radio > 72 m); los suelos flotantes
    // interiores de Entrenamiento no bloquean las pirámides de la Esfera Blanca.
    if (slab.center.lengthSq() < SPHERE_TILE_MIN_R * SPHERE_TILE_MIN_R) continue;
    if (_v5.distanceTo(slab.center) < SPHERE_TILE_EXCLUDE_DIST) {
      return true;
    }
  }
  return false;
}

/** Busca una dirección libre (sin suelo esférico) cerca de `dirOnSphere`. */
function findFreeSphereDir(
  dirOnSphere: THREE.Vector3,
  activeSlabs?: readonly SlabCollider[],
): THREE.Vector3 | null {
  _v1.copy(dirOnSphere).normalize();
  if (!isCoveredBySphereTile(_v1, activeSlabs)) return _v1;

  _v2.crossVectors(_v1, _up);
  if (_v2.lengthSq() < 1e-4) _v2.set(1, 0, 0);
  _v2.normalize();
  _v3.crossVectors(_v1, _v2).normalize();

  for (let ring = 1; ring <= 4; ring++) {
    const step = ring * 0.24;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      _v4
        .copy(_v1)
        .addScaledVector(_v2, Math.cos(a) * step)
        .addScaledVector(_v3, Math.sin(a) * step)
        .normalize();
      if (!isCoveredBySphereTile(_v4, activeSlabs)) {
        return _v1.copy(_v4);
      }
    }
  }
  return null;
}

/** Invoca una pirámide de 75 m sobre la Esfera Blanca exterior (85 m), excluyendo suelos. */
function spawnDomeSpike(
  slots: DomeSpikeSlot[],
  dirOnSphere: THREE.Vector3,
  playerPos: THREE.Vector3,
  homing: boolean,
  activeSlabs?: readonly SlabCollider[],
): boolean {
  const freeDir = findFreeSphereDir(dirOnSphere, activeSlabs);
  if (!freeDir) return false;
  const slot = slots.find((s) => !s.active);
  if (!slot) return false;

  slot.active = true;
  slot.homing = homing;
  slot.phase = 'grow';
  slot.timer = DOME_SPIKE_GROW_SEC;
  slot.height = 0.5;
  slot.hitCooldown = 0;

  slot.baseCenter.copy(freeDir).multiplyScalar(DOME_SPIKE_BASE_RADIUS);
  slot.inward.copy(freeDir).negate();

  // Construir triángulo base equilátero tangente a la esfera exterior.
  _v2.crossVectors(slot.inward, _up);
  if (_v2.lengthSq() < 1e-4) _v2.set(1, 0, 0);
  _v2.normalize();
  _v3.crossVectors(slot.inward, _v2).normalize();

  const r = DOME_SPIKE_BASE_HALF;
  slot.b0.copy(slot.baseCenter).addScaledVector(_v2, r);
  slot.b1.copy(slot.baseCenter).addScaledVector(_v2, -0.5 * r).addScaledVector(_v3, 0.866 * r);
  slot.b2.copy(slot.baseCenter).addScaledVector(_v2, -0.5 * r).addScaledVector(_v3, -0.866 * r);

  // Punta orientada hacia Nyx pero clampeada estrictamente al área del triángulo base.
  computeClampedApex(slot, playerPos);
  slot.mesh.visible = true;
  return true;
}

function computeClampedApex(slot: DomeSpikeSlot, playerPos: THREE.Vector3): void {
  // Proyectar vector (playerPos - baseCenter) sobre la normal hacia dentro y el plano base.
  _v4.subVectors(playerPos, slot.baseCenter);
  const along = Math.max(0, _v4.dot(slot.inward));
  _v5.copy(_v4).addScaledVector(slot.inward, -along); // desplazamiento lateral hacia Nyx
  const maxLateral = DOME_SPIKE_BASE_HALF * 0.48; // nunca sale del triángulo base
  const latLen = _v5.length();
  if (latLen > maxLateral) {
    _v5.multiplyScalar(maxLateral / latLen);
  }
  slot.apex
    .copy(slot.baseCenter)
    .addScaledVector(slot.inward, slot.height)
    .add(_v5);
}

/** Distancia de un punto P al segmento AB. */
function distPointToSegment(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): number {
  _v1.subVectors(b, a);
  const lenSq = _v1.lengthSq();
  if (lenSq < 1e-6) return p.distanceTo(a);
  const t = THREE.MathUtils.clamp(_v2.subVectors(p, a).dot(_v1) / lenSq, 0, 1);
  _v3.copy(a).addScaledVector(_v1, t);
  return p.distanceTo(_v3);
}

/** Actualiza todas las pirámides de la Esfera Blanca y aplica daño al tocar cualquier cara/arista. */
export function updateDomeSpikes(
  ctx: NecrozBehaviorContext,
  dt: number,
  playerPos: THREE.Vector3,
): void {
  for (const slot of ctx.domeSpikes) {
    if (!slot.active) continue;

    if (slot.hitCooldown > 0) {
      slot.hitCooldown = Math.max(0, slot.hitCooldown - dt);
    }

    // Si un suelo esférico rotado (ciclo de 10 s) cubre esta púa, se retrae.
    if (slot.phase !== 'retract') {
      _v4.copy(slot.baseCenter).normalize();
      if (isCoveredBySphereTile(_v4, ctx.activeSlabs)) {
        slot.phase = 'retract';
        slot.timer = Math.min(slot.timer, DOME_SPIKE_RETRACT_SEC);
      }
    }

    // Púas teledirigidas: se deslizan sobre la esfera persiguiendo a Nyx a 5 m/s.
    if (slot.homing && slot.phase !== 'retract') {
      _v1.subVectors(playerPos, slot.baseCenter);
      _v1.addScaledVector(slot.inward, -_v1.dot(slot.inward));
      const d = _v1.length();
      if (d > 0.2) {
        _v1.divideScalar(d);
        slot.baseCenter.addScaledVector(_v1, HOMING_SPIKE_SPEED * dt);
        slot.baseCenter.normalize().multiplyScalar(DOME_SPIKE_BASE_RADIUS);
        slot.inward.copy(slot.baseCenter).normalize().negate();
        _v2.crossVectors(slot.inward, _up);
        if (_v2.lengthSq() < 1e-4) _v2.set(1, 0, 0);
        _v2.normalize();
        _v3.crossVectors(slot.inward, _v2).normalize();
        const r = DOME_SPIKE_BASE_HALF;
        slot.b0.copy(slot.baseCenter).addScaledVector(_v2, r);
        slot.b1.copy(slot.baseCenter).addScaledVector(_v2, -0.5 * r).addScaledVector(_v3, 0.866 * r);
        slot.b2.copy(slot.baseCenter).addScaledVector(_v2, -0.5 * r).addScaledVector(_v3, -0.866 * r);
      }
    }

    slot.timer -= dt;
    if (slot.phase === 'grow') {
      const p = 1 - Math.max(0, slot.timer) / DOME_SPIKE_GROW_SEC;
      slot.height = THREE.MathUtils.lerp(0.5, DOME_SPIKE_HEIGHT, p);
      if (slot.timer <= 0) {
        slot.phase = 'hold';
        slot.timer = DOME_SPIKE_HOLD_SEC;
        slot.height = DOME_SPIKE_HEIGHT;
      }
    } else if (slot.phase === 'hold') {
      slot.height = DOME_SPIKE_HEIGHT;
      if (slot.timer <= 0) {
        slot.phase = 'retract';
        slot.timer = DOME_SPIKE_RETRACT_SEC;
      }
    } else {
      const p = Math.max(0, slot.timer) / DOME_SPIKE_RETRACT_SEC;
      slot.height = DOME_SPIKE_HEIGHT * p;
      if (slot.timer <= 0) {
        slot.active = false;
        slot.mesh.visible = false;
        continue;
      }
    }

    computeClampedApex(slot, playerPos);

    const arr = slot.posAttr.array as Float32Array;
    writeTri(arr, 0, slot.b0, slot.b1, slot.apex);
    writeTri(arr, 9, slot.b1, slot.b2, slot.apex);
    writeTri(arr, 18, slot.b2, slot.b0, slot.apex);
    slot.posAttr.needsUpdate = true;
    slot.mesh.geometry.computeVertexNormals();

    // Colisión con CUALQUIER parte de la pirámide (eje + aristas -> radio interpolado).
    if (slot.hitCooldown <= 0) {
      const dAxis = distPointToSegment(playerPos, slot.baseCenter, slot.apex);
      const dE0 = distPointToSegment(playerPos, slot.b0, slot.apex);
      const dE1 = distPointToSegment(playerPos, slot.b1, slot.apex);
      const dE2 = distPointToSegment(playerPos, slot.b2, slot.apex);
      const minDist = Math.min(dAxis, dE0, dE1, dE2);
      if (minDist < 2.2) {
        slot.hitCooldown = 0.75;
        _v1.subVectors(playerPos, slot.baseCenter).normalize();
        if (_v1.lengthSq() < 1e-4) _v1.copy(slot.inward);
        ctx.onGolemSmash?.(DOME_SPIKE_DAMAGE, _v1, DOME_SPIKE_PUSH);
      }
    }
  }
}

function addLaziness(n: NecrozBossState, ctx: NecrozBehaviorContext, amount: number): void {
  n.laziness = Math.min(100, n.laziness + amount);
  if (n.laziness >= 100 && n.slothTimer <= 0) {
    // Colapso de Pereza (Pasotismo Total 5.0 s): deja de girar, baja defensas y cancela ataques.
    n.slothTimer = LAZINESS_SLOTH_DURATION_SEC;
    n.defensiveSpikesOut = false;
    n.defensiveDelayTimer = 0;
    n.building = false;
    n.offensiveWavesLeft = 0;
    n.homingLeft = 0;
    void ctx;
  }
}

export function updateNecrozEnemy(
  ctx: NecrozBehaviorContext,
  enemyPos: THREE.Vector3,
  enemyVel: THREE.Vector3,
  mesh: THREE.Object3D,
  actions: Map<string, THREE.AnimationAction> | null,
  n: NecrozBossState,
  dt: number,
  playerPos: THREE.Vector3,
  enemiesPassive: boolean,
): void {
  // Anclaje fijo en el centro (0, 0, 0).
  enemyPos.set(0, 0, 0);
  enemyVel.set(0, 0, 0);
  mesh.position.set(0, 0, 0);

  if (n.hitTimer > 0) n.hitTimer = Math.max(0, n.hitTimer - dt);
  if (n.defClipTimer > 0) n.defClipTimer = Math.max(0, n.defClipTimer - dt);
  if (n.defensiveHitCd > 0) n.defensiveHitCd = Math.max(0, n.defensiveHitCd - dt);

  // Pasotismo Total (100/100): quieto (0°/s), sin defensas ni ataques durante 5.0 s.
  if (n.slothTimer > 0) {
    n.slothTimer = Math.max(0, n.slothTimer - dt);
    n.laziness = Math.max(0, (n.slothTimer / LAZINESS_SLOTH_DURATION_SEC) * 100);
    syncShieldGeometry(n, dt);
    updateNecrozAnimation(actions, n);
    return;
  }

  // Rotación constante a 25°/s sobre su eje Y.
  n.yawRad = (n.yawRad + NECROZ_ROT_SPEED_RAD * dt) % (Math.PI * 2);
  mesh.rotation.set(0, n.yawRad, 0);

  // Construcción del escudo triángulo a triángulo (1.0 s inicial, 4.0 s reconstrucción).
  if (n.building) {
    n.buildProgress += dt / Math.max(0.1, n.buildDuration);
    for (const tri of n.shieldTriangles) {
      if (!tri.intact && tri.buildOrder <= n.buildProgress) {
        tri.intact = true;
      }
    }
    if (n.buildDuration > 1.5 && n.laziness > 80) {
      // Pereza > 80: aborta reconstrucción a medias.
      n.building = false;
    } else if (n.buildProgress >= 1) {
      n.building = false;
    }
  }

  if (enemiesPassive) {
    syncShieldGeometry(n, dt);
    updateNecrozAnimation(actions, n);
    return;
  }

  const distToNyx = playerPos.length();
  const nyxSpeed = ctx.playerVelocity.length();

  // --- 3.1 Púas Defensivas (1.5 m) ---
  const nyxNear = distToNyx <= NECROZ_DEF_SPIKE_RANGE;
  if (nyxNear && !n.defensiveSpikesOut && !n.building) {
    if (n.laziness > 65 && n.defensiveDelayTimer <= 0) {
      n.defensiveDelayTimer = NECROZ_DEF_RELUCTANCE_DELAY_SEC;
    } else if (n.defensiveDelayTimer > 0) {
      n.defensiveDelayTimer -= dt;
      if (n.defensiveDelayTimer <= 0) {
        n.defensiveSpikesOut = true;
        n.defensiveHoldTimer = 0;
        n.defClipTimer = 0.4;
        addLaziness(n, ctx, LAZINESS_DEF_ACTIVATE);
      }
    } else {
      n.defensiveSpikesOut = true;
      n.defensiveHoldTimer = 0;
      n.defClipTimer = 0.4;
      addLaziness(n, ctx, LAZINESS_DEF_ACTIVATE);
    }
  } else if (n.defensiveSpikesOut) {
    n.defensiveHoldTimer += dt;
    addLaziness(n, ctx, LAZINESS_DEF_HOLD_PER_SEC * dt);
    if (!nyxNear || n.defensiveHoldTimer >= NECROZ_DEF_IMPATIENCE_SEC) {
      // Se cansa de esperar amagos (1.5 s) -> retrae las púas.
      n.defensiveSpikesOut = false;
      n.defensiveDelayTimer = 0;
    }
  } else {
    n.defensiveDelayTimer = 0;
  }

  // Daño/repulsión si Nyx toca una púa defensiva extendida (solo triángulos intactos).
  if (n.defensiveSpikesOut && n.defensiveHitCd <= 0 && distToNyx <= n.shieldRadius + NECROZ_DEF_SPIKE_HEIGHT + 0.8) {
    if (checkNecrozShieldBlock(n, enemyPos, mesh.quaternion, playerPos) === 'blocked') {
      n.defensiveHitCd = 0.65;
      _v1.copy(playerPos).normalize();
      if (_v1.lengthSq() < 1e-4) _v1.set(0, 0, 1);
      ctx.onGolemSmash?.(NECROZ_DEF_SPIKE_DAMAGE, _v1, NECROZ_DEF_SPIKE_PUSH);
    }
  }

  // --- 3.2 Oleadas de Púas Ofensivas (75 m, de 2 en 2, 10–15 oleadas) ---
  if (n.offensiveWavesLeft > 0) {
    n.offensiveTimer -= dt;
    if (n.offensiveTimer <= 0) {
      if (n.laziness > 80) {
        n.offensiveWavesLeft = 0;
      } else {
        // Dirección predicha desde el centro hacia la cúpula tras Nyx
        _v1.copy(playerPos).addScaledVector(ctx.playerVelocity, 0.85);
        if (_v1.lengthSq() < 1e-4) _v1.set(0, 1, 0);
        // Pequeño desvío angular para la pareja
        const jitter = n.offensivePairStep === 0 ? 0.14 : -0.14;
        _v1.x += jitter * 14;
        _v1.z -= jitter * 14;
        spawnDomeSpike(ctx.domeSpikes, _v1, playerPos, false, ctx.activeSlabs);

        if (n.offensivePairStep === 0) {
          n.offensivePairStep = 1;
          n.offensiveTimer = DOME_SPIKE_PAIR_DELAY_SEC;
          addLaziness(n, ctx, LAZINESS_OFFENSIVE_PAIR_COST);
        } else {
          n.offensivePairStep = 0;
          n.offensiveWavesLeft--;
          n.offensiveTimer = DOME_SPIKE_WAVE_INTERVAL_SEC;
        }
      }
    }
  }

  // --- 3.3 Púas Teledirigidas (5 m/s detrás de Nyx con ≥ 1.0 m de separación) ---
  if (n.homingLeft > 0) {
    n.homingTimer -= dt;
    if (n.homingTimer <= 0) {
      _v1.copy(playerPos).addScaledVector(_up, -4).normalize();
      const basePt = _v2.copy(_v1).multiplyScalar(DOME_SPIKE_BASE_RADIUS);
      if (!n.hasLastHoming || basePt.distanceTo(n.lastHomingBase) >= HOMING_SPIKE_MIN_SEP) {
        if (spawnDomeSpike(ctx.domeSpikes, _v1, playerPos, true, ctx.activeSlabs)) {
          n.lastHomingBase.copy(basePt);
          n.hasLastHoming = true;
          n.homingLeft--;
          addLaziness(n, ctx, LAZINESS_HOMING_COST);
        }
      }
      n.homingTimer = HOMING_SPIKE_INTERVAL;
    }
  }

  // --- Toma de decisiones IA Perfecta (gobernada por Pereza, sin spam) ---
  const busy =
    n.building ||
    n.defensiveSpikesOut ||
    n.offensiveWavesLeft > 0 ||
    n.homingLeft > 0;

  if (!busy) {
    // Drena pereza pasivamente (-8/s) solo cuando no ejecuta acciones.
    n.laziness = Math.max(0, n.laziness - LAZINESS_DRAIN_PER_SEC * dt);

    if (n.aiPauseTimer > 0) {
      n.aiPauseTimer = Math.max(0, n.aiPauseTimer - dt);
    } else {
      const brokenFrac = getBrokenFraction(n);
      if (brokenFrac >= NECROZ_REBUILD_MIN_BROKEN_FRAC && n.laziness <= 55) {
        // Reconstruir escudo (4.0 s, +45 Pereza) solo si faltan >= 45% triángulos.
        n.building = true;
        n.buildProgress = 0;
        n.buildDuration = NECROZ_REBUILD_SEC;
        addLaziness(n, ctx, LAZINESS_REBUILD_COST);
        n.aiPauseTimer = 1.6;
      } else if (n.laziness < 75) {
        if (nyxSpeed < 14.0 || !n.lastAttackWasHoming) {
          // Púas Teledirigidas (5 m/s detrás de Nyx): alterna con ofensivas o castiga lentitud.
          n.homingLeft = 4 + Math.floor(Math.random() * 3);
          n.homingTimer = 0;
          n.hasLastHoming = false;
          n.lastAttackWasHoming = true;
          n.aiPauseTimer = 2.4;
        } else {
          // Nyx rápida por la cúpula: ráfaga legible de Púas Ofensivas (6–10 oleadas de 2 en 2)
          n.offensiveWavesLeft = 6 + Math.floor(Math.random() * 5);
          n.offensivePairStep = 0;
          n.offensiveTimer = 0;
          n.lastAttackWasHoming = false;
          n.aiPauseTimer = 2.8;
        }
      }
    }
  }

  syncShieldGeometry(n, dt);
  updateNecrozAnimation(actions, n);
}

function updateNecrozAnimation(
  actions: Map<string, THREE.AnimationAction> | null,
  n: NecrozBossState,
): void {
  if (!actions || actions.size === 0) return;

  let targetName = n.laziness >= 50 ? 'necroz_idle_lazy' : 'necroz_idle_fresh';
  if (n.slothTimer > 0) {
    targetName = 'necroz_sloth_collapse';
  } else if (n.hitTimer > 0) {
    targetName = 'necroz_hit';
  } else if (n.defClipTimer > 0) {
    targetName = 'necroz_defensive_spikes';
  } else if (n.building) {
    targetName = 'necroz_shield_build';
  } else if (n.offensiveWavesLeft > 0 || n.homingLeft > 0) {
    targetName = 'necroz_summon_dome_spikes';
  }

  const next = actions.get(targetName) ?? actions.get('necroz_idle_fresh') ?? null;
  if (!next) return;

  if (n.currentClip !== next) {
    const prev = n.currentClip;
    if (
      targetName === 'necroz_sloth_collapse' ||
      targetName === 'necroz_hit' ||
      targetName === 'necroz_defensive_spikes'
    ) {
      next.reset();
    }
    next.enabled = true;
    next.play();
    if (prev) {
      prev.crossFadeTo(next, 0.15, true);
    }
    n.currentClip = next;
  }
}
