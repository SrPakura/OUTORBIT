import * as THREE from 'three';
import type {
  EnemySpawnSpec,
  GalaxySpec,
  GrassZoneSpec,
  InteractableKind,
  PlanetSpec,
  StructureKind,
  StructureSpec,
  WaterBubbleSpec,
  WorldObjectSpec,
} from '../types';

// ============================================================================
// OUTORBIT 2.0 — Galaxia Continua: un único Sistema Solar vivo donde los 5
// planetas coexisten a la vez. Contrato principal: GALAXY_SPEC.
// ============================================================================

// ----------------------------------------------------------------------------
// Utilidades de definición (solo se ejecutan al cargar el módulo)
// ----------------------------------------------------------------------------

const _up = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();

function vec(dir: [number, number, number]): THREE.Vector3 {
  return new THREE.Vector3(dir[0], dir[1], dir[2]).normalize();
}

/**
 * Marco tangente de una base sobre un planeta: `n` es la normal en el centro,
 * `t1`/`t2` los ejes del plano tangente. Las coordenadas (ax, az) del layout
 * están en METROS sobre ese plano (proyección gnomónica).
 */
interface BaseFrame {
  planetId: string;
  radius: number;
  n: THREE.Vector3;
  t1: THREE.Vector3;
  t2: THREE.Vector3;
}

function baseFrame(
  planetId: string,
  dir: [number, number, number],
  radius: number,
  t1Override?: THREE.Vector3
): BaseFrame {
  const n = vec(dir);
  let axis = t1Override ?? new THREE.Vector3(0, 1, 0).cross(n);
  if (axis.lengthSq() < 1e-6) axis = new THREE.Vector3(1, 0, 0).cross(n);
  axis.normalize();
  const t2 = new THREE.Vector3().crossVectors(n, axis).normalize();
  return { planetId, radius, n, t1: axis, t2 };
}

/** Dir de superficie a (ax, az) metros del centro del marco tangente. */
function frameDir(f: BaseFrame, axM: number, azM: number): [number, number, number] {
  const k = 1 / f.radius;
  const d = new THREE.Vector3()
    .copy(f.n)
    .addScaledVector(f.t1, axM * k)
    .addScaledVector(f.t2, azM * k)
    .normalize();
  return [d.x, d.y, d.z];
}

/**
 * Yaw que alinea el eje X local de la estructura con el tangente `along`.
 * Debe usar la MISMA convención que createStructureCollider /
 * buildStructureMesh (setFromUnitVectors(up, dir) * yaw) para que el layout
 * del plano tangente y la colisión coincidan.
 */
function yawAlongX(dir: [number, number, number], along: THREE.Vector3): number {
  _q.setFromUnitVectors(_up, vec(dir)).invert();
  _v.copy(along).applyQuaternion(_q);
  return Math.atan2(-_v.z, _v.x);
}

interface StructOptions {
  altitudeOffset?: number;
  passableUnderground?: boolean;
  yaw?: number;
}

function struct(
  f: BaseFrame,
  id: string,
  kind: StructureKind,
  axM: number,
  azM: number,
  along: 't1' | 't2' | null,
  size: [number, number, number],
  color: string,
  options: StructOptions = {}
): StructureSpec {
  const dir = frameDir(f, axM, azM);
  let yaw = options.yaw ?? 0;
  if (along === 't1') yaw = yawAlongX(dir, f.t1);
  else if (along === 't2') yaw = yawAlongX(dir, f.t2);
  return {
    id,
    kind,
    planetId: f.planetId,
    sphericalDir: dir,
    altitudeOffset: options.altitudeOffset,
    yaw,
    size,
    color,
    passableUnderground: options.passableUnderground,
  };
}

/** Segmento de muralla: `along` es la dirección en la que corre el muro. */
function wallSeg(
  f: BaseFrame,
  id: string,
  axM: number,
  azM: number,
  along: 't1' | 't2',
  lengthM: number,
  heightM: number,
  color: string,
  passUnder = true
): StructureSpec {
  return struct(f, id, 'wall', axM, azM, along, [lengthM / 2, heightM, 0.7], color, {
    passableUnderground: passUnder,
  });
}

/**
 * Arco de entrada: el collider es el DINTEL flotante a 4.2 m (se pasa andando
 * o por debajo); los pilares son el marco visual del builder.
 */
function archGate(
  f: BaseFrame,
  id: string,
  axM: number,
  azM: number,
  along: 't1' | 't2',
  spanM: number,
  color: string
): StructureSpec {
  return struct(f, id, 'arch_gate', axM, azM, along, [spanM / 2, 1.6, 0.8], color, {
    altitudeOffset: 4.2,
    passableUnderground: true,
  });
}

function towerAt(
  f: BaseFrame,
  id: string,
  axM: number,
  azM: number,
  color: string,
  height = 9
): StructureSpec {
  return struct(f, id, 'tower', axM, azM, null, [2.4, height, 2.4], color);
}

function obj(
  planetId: string,
  id: string,
  kind: InteractableKind,
  dir: [number, number, number],
  options: { altitudeOffset?: number; yaw?: number } = {}
): WorldObjectSpec {
  return {
    id,
    kind,
    planetId,
    sphericalDir: dir,
    altitudeOffset: options.altitudeOffset,
    yaw: options.yaw,
  };
}

/** Burbuja de agua en órbita: centro absoluto = planetCenter + dir * (R + alt). */
function orbitBubble(
  id: string,
  planet: PlanetSpec,
  dir: [number, number, number],
  altitude: number,
  radius: number
): WaterBubbleSpec {
  const d = vec(dir);
  const c = new THREE.Vector3(
    planet.center[0],
    planet.center[1],
    planet.center[2]
  ).addScaledVector(d, planet.radius + altitude);
  return { id, center: [c.x, c.y, c.z], radius };
}

/**
 * Genera los waypoints de una patrulla circular sobre la superficie del
 * planeta: `count` puntos alrededor de `dir` a `angularRadius` radianes.
 */
function patrolCircle(
  dirX: number,
  dirY: number,
  dirZ: number,
  angularRadius: number,
  count: number
): [number, number, number][] {
  const center = new THREE.Vector3(dirX, dirY, dirZ).normalize();
  let t1 = new THREE.Vector3(0, 1, 0).cross(center);
  if (t1.lengthSq() < 1e-6) t1 = new THREE.Vector3(1, 0, 0).cross(center);
  t1.normalize();
  const t2 = new THREE.Vector3().crossVectors(center, t1).normalize();
  const out: [number, number, number][] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const d = new THREE.Vector3()
      .copy(center)
      .addScaledVector(t1, Math.cos(a) * angularRadius)
      .addScaledVector(t2, Math.sin(a) * angularRadius)
      .normalize();
    out.push([d.x, d.y, d.z]);
  }
  return out;
}

// ----------------------------------------------------------------------------
// Los 5 planetas del sistema (coexisten en el mismo espacio)
// ----------------------------------------------------------------------------

export const GALAXY_PLANETS: PlanetSpec[] = [
  {
    id: 'luna-tutorial',
    order: 0,
    name: 'Luna Tutorial',
    subtitle: 'Micro-base de entrenamiento',
    biome: 'tutorial',
    center: [0, 0, 0],
    radius: 56,
    gravityStrength: 1.0,
    surfaceColor: '#cbd5e1',
    patchColor: '#94a3b8',
    atmosphereColor: '#93c5fd',
    hasIcePatches: true,
    unlockedByPlanetId: null,
  },
  {
    id: 'verdant-pradera',
    order: 1,
    name: 'Verdant',
    subtitle: 'Pradera de los complejos militares',
    biome: 'verdant',
    center: [280, 35, -140],
    radius: 105,
    gravityStrength: 1.1,
    surfaceColor: '#4ade80',
    patchColor: '#16a34a',
    atmosphereColor: '#bbf7d0',
    hasWaterShell: true,
    waterRadius: 106.5,
    unlockedByPlanetId: 'luna-tutorial',
  },
  {
    id: 'cryo-glaciar',
    order: 2,
    name: 'Cryo-Drop',
    subtitle: 'Glaciar de burbujas orbitales',
    biome: 'cryo',
    center: [-150, 115, -420],
    radius: 112,
    gravityStrength: 0.95,
    surfaceColor: '#bae6fd',
    patchColor: '#f8fafc',
    atmosphereColor: '#e0f2fe',
    hasIcePatches: true,
    unlockedByPlanetId: 'verdant-pradera',
  },
  {
    id: 'bastion-fortaleza',
    order: 3,
    name: 'Iron Bastion',
    subtitle: 'Fortaleza mecánica de doble muralla',
    biome: 'bastion',
    center: [180, -85, -730],
    radius: 120,
    gravityStrength: 1.15,
    surfaceColor: '#475569',
    patchColor: '#1e293b',
    atmosphereColor: '#fdba74',
    unlockedByPlanetId: 'cryo-glaciar',
  },
  {
    id: 'kronos-trono',
    order: 4,
    name: 'Trono de KRONOS',
    subtitle: 'Arena volcánica blindada',
    biome: 'kronos',
    center: [0, 210, -1040],
    radius: 82,
    gravityStrength: 1.2,
    surfaceColor: '#3f1d2e',
    patchColor: '#7f1d1d',
    atmosphereColor: '#fb7185',
    hasOrbitalRings: true,
    ringColor: '#ef4444',
    unlockedByPlanetId: 'bastion-fortaleza',
  },
];

// ----------------------------------------------------------------------------
// Luna Tutorial: micro-base frente al spawn (arco + 2 muros + generador con
// baliza). Rutas: hierba alta en el flanco, barril explosivo, roca de
// distracción o excavar con Digger. Al caer el generador, cae el escudo de
// Verdant.
// ----------------------------------------------------------------------------

function lunaContent(): {
  structures: StructureSpec[];
  objects: WorldObjectSpec[];
  enemies: EnemySpawnSpec[];
  grass: GrassZoneSpec[];
} {
  const planet = GALAXY_PLANETS[0];
  const f = baseFrame(planet.id, [0.5, 0.68, 0.4], planet.radius);
  // La puerta de la micro-base mira al spawn: eje t1 = dirección tangente
  // hacia el punto de aparición del jugador.
  const spawn = vec([0.25, 0.85, 0.45]);
  const toSpawn = new THREE.Vector3().copy(spawn).addScaledVector(f.n, -spawn.dot(f.n));
  if (toSpawn.lengthSq() < 1e-6) toSpawn.copy(f.t1);
  toSpawn.normalize();
  const gf = baseFrame(planet.id, [0.5, 0.68, 0.4], planet.radius, toSpawn);

  const structures: StructureSpec[] = [
    archGate(gf, 'luna-gate', 9, 0, 't2', 12, '#94a3b8'),
    wallSeg(gf, 'luna-wall-l', 0, 6.7, 't1', 15, 4.5, '#64748b'),
    wallSeg(gf, 'luna-wall-r', 0, -6.7, 't1', 15, 4.5, '#64748b'),
  ];

  const objects: WorldObjectSpec[] = [
    obj(planet.id, 'luna-gen-1', 'generator', frameDir(gf, -3, 0)),
    obj(planet.id, 'luna-barril-1', 'barrel_explosive', frameDir(gf, 7, 9)),
    obj(planet.id, 'luna-roca-1', 'rock', frameDir(gf, 11, -8)),
    obj(planet.id, 'luna-roca-2', 'rock', [0.7, 0.5, 0.3]),
    obj(planet.id, 'luna-roca-3', 'rock', [-0.3, 0.8, -0.4]),
    obj(planet.id, 'luna-caja-1', 'crate', [0.15, 0.95, 0.28]),
  ];

  const enemies: EnemySpawnSpec[] = [
    {
      kind: 'guard',
      planetId: planet.id,
      patrolDirs: patrolCircle(...frameDir(gf, 12, 0), 0.05, 4),
    },
  ];

  const grass: GrassZoneSpec[] = [
    {
      id: 'luna-hierba-flanco',
      planetId: planet.id,
      sphericalDir: frameDir(gf, 2, 20),
      angularRadius: 0.2,
    },
  ];

  return { structures, objects, enemies, grass };
}

// ----------------------------------------------------------------------------
// Verdant: gran pradera con 2 complejos militares amurallados + 1 recinto de
// generador. Hierba alta para Kitsune, vallas láser para Digger, burbujas en
// escalera hacia plataformas altas/satélites para Axel, barriles junto a las
// patrullas. 3 Generadores de Escudo -> cae el escudo de Cryo-Drop.
// ----------------------------------------------------------------------------

function verdantContent(): {
  structures: StructureSpec[];
  objects: WorldObjectSpec[];
  enemies: EnemySpawnSpec[];
  grass: GrassZoneSpec[];
  bubbles: WaterBubbleSpec[];
} {
  const planet = GALAXY_PLANETS[1];
  const WALL = '#3e4c3a';
  const GATE = '#55684d';

  // --- Complejo militar A (36 x 28, dos entradas) ---
  const fA = baseFrame(planet.id, [0.35, 0.8, 0.42], planet.radius);
  const structures: StructureSpec[] = [
    wallSeg(fA, 'vd-a-wall-n', 0, -14, 't1', 36, 5, WALL),
    wallSeg(fA, 'vd-a-wall-s-l', -11.5, 14, 't1', 13, 5, WALL),
    wallSeg(fA, 'vd-a-wall-s-r', 11.5, 14, 't1', 13, 5, WALL),
    archGate(fA, 'vd-a-gate-s', 0, 14, 't1', 12, GATE),
    wallSeg(fA, 'vd-a-wall-e', 18, 0, 't2', 28, 5, WALL),
    wallSeg(fA, 'vd-a-wall-w-n', -18, 8.5, 't2', 11, 5, WALL),
    wallSeg(fA, 'vd-a-wall-w-s', -18, -8.5, 't2', 11, 5, WALL),
    archGate(fA, 'vd-a-gate-w', -18, 0, 't2', 8, GATE),
    towerAt(fA, 'vd-a-tower-ne', 18, -14, WALL),
    towerAt(fA, 'vd-a-tower-se', 18, 14, WALL),
    towerAt(fA, 'vd-a-tower-nw', -18, -14, WALL),
    towerAt(fA, 'vd-a-tower-sw', -18, 14, WALL),
    struct(fA, 'vd-a-platform', 'platform', 10, -7, null, [4, 1.1, 4], GATE, {
      altitudeOffset: 7.5,
    }),
  ];

  // --- Complejo militar B (30 x 24, una entrada + torres) ---
  const fB = baseFrame(planet.id, [-0.6, 0.45, 0.62], planet.radius);
  structures.push(
    wallSeg(fB, 'vd-b-wall-n', 0, -12, 't1', 30, 5, WALL),
    wallSeg(fB, 'vd-b-wall-s-l', -10, 12, 't1', 10, 5, WALL),
    wallSeg(fB, 'vd-b-wall-s-r', 10, 12, 't1', 10, 5, WALL),
    archGate(fB, 'vd-b-gate-s', 0, 12, 't1', 10, GATE),
    wallSeg(fB, 'vd-b-wall-e', 15, 0, 't2', 24, 5, WALL),
    wallSeg(fB, 'vd-b-wall-w', -15, 0, 't2', 24, 5, WALL),
    towerAt(fB, 'vd-b-tower-ne', 15, -12, WALL),
    towerAt(fB, 'vd-b-tower-se', 15, 12, WALL),
    towerAt(fB, 'vd-b-tower-nw', -15, -12, WALL),
    towerAt(fB, 'vd-b-tower-sw', -15, 12, WALL)
  );

  // --- Recinto C del tercer generador (U abierta con valla láser) ---
  const fC = baseFrame(planet.id, [0.8, 0.15, -0.55], planet.radius);
  structures.push(
    wallSeg(fC, 'vd-c-wall-back', 0, -8, 't1', 20, 4.5, WALL),
    wallSeg(fC, 'vd-c-wall-l', -10, -2, 't2', 12, 4.5, WALL),
    wallSeg(fC, 'vd-c-wall-r', 10, -2, 't2', 12, 4.5, WALL)
  );

  // --- Plataformas satélite orbitales (ruta de burbujas de Axel) ---
  structures.push(
    struct(fA, 'vd-orb-platform-1', 'platform', 30, 12, null, [5, 1.2, 5], GATE, {
      altitudeOffset: 26,
    }),
    struct(fB, 'vd-orb-platform-2', 'platform', 24, 0, null, [4.5, 1.1, 4.5], GATE, {
      altitudeOffset: 20,
    })
  );

  const objects: WorldObjectSpec[] = [
    obj(planet.id, 'vd-gen-1', 'generator', frameDir(fA, -6, -5)),
    obj(planet.id, 'vd-gen-2', 'generator', frameDir(fB, 0, 0)),
    obj(planet.id, 'vd-gen-3', 'generator', frameDir(fC, 0, -3)),
    // Vallas láser: dañan de pie, Digger las cruza por debajo (Shift).
    obj(planet.id, 'vd-laser-c', 'laser_gate', frameDir(fC, 0, 3)),
    obj(planet.id, 'vd-laser-mid', 'laser_gate', [-0.25, 0.68, 0.65]),
    // Barriles explosivos junto a las patrullas.
    obj(planet.id, 'vd-barril-1', 'barrel_explosive', frameDir(fA, 8, 12)),
    obj(planet.id, 'vd-barril-2', 'barrel_explosive', frameDir(fB, 4, 8)),
    obj(planet.id, 'vd-barril-3', 'barrel_explosive', frameDir(fC, 3, 8)),
    obj(planet.id, 'vd-barril-4', 'barrel_explosive', [0.2, 0.92, 0.3]),
    // Agarrables para la Estasis.
    obj(planet.id, 'vd-roca-1', 'rock', frameDir(fA, 26, -6)),
    obj(planet.id, 'vd-roca-2', 'rock', frameDir(fB, -20, 8)),
    obj(planet.id, 'vd-roca-3', 'rock', [0.3, 0.88, 0.35]),
    obj(planet.id, 'vd-roca-4', 'rock', [-0.2, 0.95, 0.25]),
    obj(planet.id, 'vd-roca-5', 'rock', [0.6, 0.55, 0.55]),
    obj(planet.id, 'vd-roca-6', 'rock', [-0.4, 0.75, -0.5]),
    obj(planet.id, 'vd-caja-1', 'crate', [0.1, 0.9, 0.4]),
    obj(planet.id, 'vd-caja-2', 'crate', frameDir(fB, 8, -6)),
    obj(planet.id, 'vd-caja-3', 'crate', frameDir(fC, -6, 6)),
  ];

  const enemies: EnemySpawnSpec[] = [
    { kind: 'guard', planetId: planet.id, patrolDirs: patrolCircle(...frameDir(fA, 5, 5), 0.05, 4) },
    { kind: 'guard', planetId: planet.id, patrolDirs: patrolCircle(...frameDir(fA, -8, 6), 0.05, 4) },
    { kind: 'officer', planetId: planet.id, patrolDirs: patrolCircle(...frameDir(fA, 0, 10), 0.04, 4) },
    { kind: 'guard', planetId: planet.id, patrolDirs: patrolCircle(...frameDir(fB, 6, -5), 0.05, 4) },
    { kind: 'brute', planetId: planet.id, patrolDirs: patrolCircle(...frameDir(fB, -6, 5), 0.06, 3) },
    { kind: 'guard', planetId: planet.id, patrolDirs: patrolCircle(...frameDir(fC, 4, 6), 0.05, 4) },
    { kind: 'guard', planetId: planet.id, patrolDirs: patrolCircle(0.15, 0.9, 0.35, 0.1, 4) },
  ];

  const grass: GrassZoneSpec[] = [
    { id: 'vd-grass-spawn', planetId: planet.id, sphericalDir: [0.15, 0.9, 0.35], angularRadius: 0.2 },
    { id: 'vd-grass-flank-a', planetId: planet.id, sphericalDir: frameDir(fA, 34, 10), angularRadius: 0.22 },
    { id: 'vd-grass-mid', planetId: planet.id, sphericalDir: [0.05, 0.72, 0.62], angularRadius: 0.18 },
    { id: 'vd-grass-c', planetId: planet.id, sphericalDir: frameDir(fC, 0, 18), angularRadius: 0.16 },
  ];

  // Burbujas de agua en escalera hacia las plataformas satélite (Axel).
  const bubbles: WaterBubbleSpec[] = [
    orbitBubble('vd-bub-1', planet, frameDir(fA, 10, 4), 8, 9),
    orbitBubble('vd-bub-2', planet, frameDir(fA, 18, 8), 15, 8),
    orbitBubble('vd-bub-3', planet, frameDir(fA, 24, 10), 21, 7.5),
    orbitBubble('vd-bub-4', planet, frameDir(fB, 8, 0), 7, 8),
    orbitBubble('vd-bub-5', planet, frameDir(fB, 16, 0), 14, 7),
  ];

  return { structures, objects, enemies, grass, bubbles };
}

// ----------------------------------------------------------------------------
// Cryo-Drop: glaciar con parches de hielo resbaladizo, complejo con muros,
// torres, búnkers conectados por un puente y plataformas satélite orbitales
// alcanzables con burbujas de agua flotantes. 3 Generadores -> cae el escudo
// de Iron Bastion.
// ----------------------------------------------------------------------------

function cryoContent(): {
  structures: StructureSpec[];
  objects: WorldObjectSpec[];
  enemies: EnemySpawnSpec[];
  bubbles: WaterBubbleSpec[];
} {
  const planet = GALAXY_PLANETS[2];
  const WALL = '#5b7f99';
  const GATE = '#7dd3fc';

  const f = baseFrame(planet.id, [0.3, 0.82, 0.42], planet.radius);
  const structures: StructureSpec[] = [
    // Complejo glaciar principal (24 x 20).
    wallSeg(f, 'cy-wall-n', 0, -10, 't1', 24, 5, WALL),
    wallSeg(f, 'cy-wall-s-l', -11.5, 10, 't1', 13, 5, WALL),
    wallSeg(f, 'cy-wall-s-r', 11.5, 10, 't1', 13, 5, WALL),
    archGate(f, 'cy-gate-s', 0, 10, 't1', 12, GATE),
    wallSeg(f, 'cy-wall-e', 12, 0, 't2', 20, 5, WALL),
    wallSeg(f, 'cy-wall-w', -12, 0, 't2', 20, 5, WALL),
    towerAt(f, 'cy-tower-ne', 12, -10, WALL, 8),
    towerAt(f, 'cy-tower-se', 12, 10, WALL, 8),
    towerAt(f, 'cy-tower-nw', -12, -10, WALL, 8),
    towerAt(f, 'cy-tower-sw', -12, 10, WALL, 8),
    struct(f, 'cy-bunker-main', 'bunker', 0, 0, null, [4, 4.5, 4], WALL),
    // Búnker oeste conectado por pasarela elevada.
    struct(f, 'cy-bunker-west', 'bunker', -24, 6, null, [3.5, 4, 3.5], WALL),
    struct(f, 'cy-bridge-west', 'bridge', -18, 6, 't1', [6, 0.8, 1.5], GATE, {
      altitudeOffset: 4.2,
      passableUnderground: true,
    }),
    // Plataformas satélite orbitales (burbujas flotantes de Axel).
    struct(f, 'cy-orb-platform-1', 'platform', 30, -18, null, [5, 1.2, 5], GATE, {
      altitudeOffset: 24,
    }),
    struct(f, 'cy-orb-platform-2', 'platform', -28, -14, null, [4, 1.1, 4], GATE, {
      altitudeOffset: 18,
    }),
  ];

  const objects: WorldObjectSpec[] = [
    obj(planet.id, 'cy-gen-1', 'generator', frameDir(f, 6, -5)),
    obj(planet.id, 'cy-gen-2', 'generator', frameDir(f, -24, 11)),
    // Generador 3 sobre la plataforma satélite orbital.
    obj(planet.id, 'cy-gen-3', 'generator', frameDir(f, 30, -18), { altitudeOffset: 25.2 }),
    // Bolas de nieve gigantes para la Estasis.
    obj(planet.id, 'cy-bola-1', 'snowball', frameDir(f, 8, 16)),
    obj(planet.id, 'cy-bola-2', 'snowball', frameDir(f, -8, -16)),
    obj(planet.id, 'cy-bola-3', 'snowball', [0.15, 0.95, 0.28]),
    obj(planet.id, 'cy-bola-4', 'snowball', [0.6, 0.6, 0.5]),
    obj(planet.id, 'cy-bola-5', 'snowball', [-0.4, 0.8, -0.4]),
    obj(planet.id, 'cy-roca-1', 'rock', frameDir(f, 16, 8)),
    obj(planet.id, 'cy-roca-2', 'rock', [-0.2, 0.9, -0.4]),
    obj(planet.id, 'cy-roca-3', 'rock', [0.45, 0.75, -0.5]),
    obj(planet.id, 'cy-barril-1', 'barrel_explosive', frameDir(f, 4, 14)),
    obj(planet.id, 'cy-barril-2', 'barrel_explosive', frameDir(f, -20, 10)),
    obj(planet.id, 'cy-caja-1', 'crate', [0.25, 0.85, 0.45]),
    obj(planet.id, 'cy-caja-2', 'crate', frameDir(f, -16, -8)),
  ];

  const enemies: EnemySpawnSpec[] = [
    { kind: 'guard', planetId: planet.id, patrolDirs: patrolCircle(...frameDir(f, 4, 4), 0.05, 4) },
    { kind: 'guard', planetId: planet.id, patrolDirs: patrolCircle(...frameDir(f, -6, 5), 0.05, 4) },
    { kind: 'guard', planetId: planet.id, patrolDirs: patrolCircle(...frameDir(f, -20, 8), 0.05, 4) },
    { kind: 'officer', planetId: planet.id, patrolDirs: patrolCircle(...frameDir(f, 0, 14), 0.04, 4) },
    { kind: 'guard', planetId: planet.id, patrolDirs: patrolCircle(0.25, 0.85, 0.45, 0.1, 4) },
  ];

  // Burbujas flotantes en escalera hacia las plataformas satélite.
  const bubbles: WaterBubbleSpec[] = [
    orbitBubble('cy-bub-1', planet, frameDir(f, 10, -6), 8, 9),
    orbitBubble('cy-bub-2', planet, frameDir(f, 17, -10), 15, 8),
    orbitBubble('cy-bub-3', planet, frameDir(f, 24, -14), 21, 7.5),
    orbitBubble('cy-bub-4', planet, frameDir(f, -18, -9), 10, 8),
  ];

  return { structures, objects, enemies, bubbles };
}

// ----------------------------------------------------------------------------
// Iron Bastion: enorme fortaleza mecánica oscura de doble muralla, torres,
// puentes entre adarves, búnkers conectados por tuberías de teletransporte,
// escáneres en las puertas y vallas láser. 1 Tarjeta Maestra + 3 Generadores
// -> cae el escudo rojo de KRONOS.
// ----------------------------------------------------------------------------

function bastionContent(): {
  structures: StructureSpec[];
  objects: WorldObjectSpec[];
  enemies: EnemySpawnSpec[];
} {
  const planet = GALAXY_PLANETS[3];
  const WALL = '#334155';
  const GATE = '#475569';

  const f = baseFrame(planet.id, [0.32, 0.78, 0.5], planet.radius);
  const structures: StructureSpec[] = [
    // Muralla exterior (64 x 48) con puerta principal.
    wallSeg(f, 'bs-wall-n', 0, -24, 't1', 64, 6, WALL),
    wallSeg(f, 'bs-wall-s-l', -19, 24, 't1', 26, 6, WALL),
    wallSeg(f, 'bs-wall-s-r', 19, 24, 't1', 26, 6, WALL),
    archGate(f, 'bs-gate-main', 0, 24, 't1', 12, GATE),
    wallSeg(f, 'bs-wall-e', 32, 0, 't2', 48, 6, WALL),
    wallSeg(f, 'bs-wall-w', -32, 0, 't2', 48, 6, WALL),
    towerAt(f, 'bs-tower-ne', 32, -24, WALL, 11),
    towerAt(f, 'bs-tower-se', 32, 24, WALL, 11),
    towerAt(f, 'bs-tower-nw', -32, -24, WALL, 11),
    towerAt(f, 'bs-tower-sw', -32, 24, WALL, 11),
    // Muralla interior (36 x 28) con puerta escaneada.
    wallSeg(f, 'bs-wall-in-n', 0, -14, 't1', 36, 5, WALL),
    wallSeg(f, 'bs-wall-in-s-l', -11.5, 14, 't1', 13, 5, WALL),
    wallSeg(f, 'bs-wall-in-s-r', 11.5, 14, 't1', 13, 5, WALL),
    archGate(f, 'bs-gate-inner', 0, 14, 't1', 12, GATE),
    wallSeg(f, 'bs-wall-in-e', 18, 0, 't2', 28, 5, WALL),
    wallSeg(f, 'bs-wall-in-w', -18, 0, 't2', 28, 5, WALL),
    towerAt(f, 'bs-tower-in-ne', 18, -14, WALL, 9),
    towerAt(f, 'bs-tower-in-se', 18, 14, WALL, 9),
    towerAt(f, 'bs-tower-in-nw', -18, -14, WALL, 9),
    towerAt(f, 'bs-tower-in-sw', -18, 14, WALL, 9),
    // Puentes entre los adarves de las dos murallas.
    struct(f, 'bs-bridge-e', 'bridge', 25, 0, 't1', [7, 0.8, 1.5], GATE, {
      altitudeOffset: 5.2,
      passableUnderground: true,
    }),
    struct(f, 'bs-bridge-s', 'bridge', 0, 19, 't2', [5, 0.8, 1.5], GATE, {
      altitudeOffset: 5.2,
      passableUnderground: true,
    }),
    // Búnkers del patio exterior (conectados por tubería de teletransporte).
    struct(f, 'bs-bunker-1', 'bunker', -26, 16, null, [4, 4.5, 4], WALL),
    struct(f, 'bs-bunker-2', 'bunker', 26, -16, null, [4, 4.5, 4], WALL),
  ];

  const objects: WorldObjectSpec[] = [
    // Tarjeta Maestra (habilita el asalto final).
    obj(planet.id, 'bs-keycard', 'keycard', frameDir(f, 8, -6)),
    // Generadores blindados.
    obj(planet.id, 'bs-gen-1', 'generator', frameDir(f, -6, 6)),
    obj(planet.id, 'bs-gen-2', 'generator', frameDir(f, -22, 12)),
    obj(planet.id, 'bs-gen-3', 'generator', frameDir(f, 22, -12)),
    // Escáneres en las puertas principales (rompen disfraces).
    obj(planet.id, 'bs-scanner-main', 'scanner_gate', frameDir(f, 0, 26)),
    obj(planet.id, 'bs-scanner-inner', 'scanner_gate', frameDir(f, 0, 16)),
    // Vallas láser perimetrales.
    obj(planet.id, 'bs-laser-1', 'laser_gate', frameDir(f, 24, 24)),
    obj(planet.id, 'bs-laser-2', 'laser_gate', frameDir(f, -24, -24)),
    // Tuberías de teletransporte entre búnkers.
    obj(planet.id, 'bs-pipe-1', 'teleport_pipe', frameDir(f, -26, 20)),
    obj(planet.id, 'bs-exit-1', 'teleporter_exit', frameDir(f, 26, -20)),
    // Agarrables y explosivos.
    obj(planet.id, 'bs-roca-1', 'rock', frameDir(f, 28, 8)),
    obj(planet.id, 'bs-roca-2', 'rock', frameDir(f, -28, -8)),
    obj(planet.id, 'bs-roca-3', 'rock', [0.15, 0.95, 0.28]),
    obj(planet.id, 'bs-barril-1', 'barrel_explosive', frameDir(f, 4, 20)),
    obj(planet.id, 'bs-barril-2', 'barrel_explosive', frameDir(f, -20, 14)),
    obj(planet.id, 'bs-barril-3', 'barrel_explosive', frameDir(f, 20, -14)),
    obj(planet.id, 'bs-barril-4', 'barrel_explosive', frameDir(f, -4, -20)),
    obj(planet.id, 'bs-caja-1', 'crate', frameDir(f, 12, 8)),
    obj(planet.id, 'bs-caja-2', 'crate', frameDir(f, -12, -8)),
  ];

  const enemies: EnemySpawnSpec[] = [
    // Pareja de guardias en la puerta principal.
    {
      kind: 'guard',
      planetId: planet.id,
      patrolDirs: patrolCircle(...frameDir(f, 0, 30), 0.05, 4),
      pairedWithNext: true,
    },
    { kind: 'guard', planetId: planet.id, patrolDirs: patrolCircle(...frameDir(f, 0, 30), 0.07, 4) },
    // Patrullas del patio interior.
    { kind: 'guard', planetId: planet.id, patrolDirs: patrolCircle(...frameDir(f, 8, 8), 0.05, 4) },
    { kind: 'guard', planetId: planet.id, patrolDirs: patrolCircle(...frameDir(f, -8, -8), 0.05, 4) },
    // Oficiales: puerta interior + zona de la tarjeta maestra.
    { kind: 'officer', planetId: planet.id, patrolDirs: patrolCircle(...frameDir(f, 0, 18), 0.04, 4) },
    { kind: 'officer', planetId: planet.id, patrolDirs: patrolCircle(...frameDir(f, 10, -4), 0.04, 4) },
    // Drones de reconocimiento en el patio exterior.
    { kind: 'drone', planetId: planet.id, patrolDirs: patrolCircle(...frameDir(f, 24, 8), 0.08, 4) },
    { kind: 'drone', planetId: planet.id, patrolDirs: patrolCircle(...frameDir(f, -24, -8), 0.08, 4) },
    // Brutes custodiando los generadores exteriores.
    { kind: 'brute', planetId: planet.id, patrolDirs: patrolCircle(...frameDir(f, -20, 14), 0.06, 3) },
    { kind: 'brute', planetId: planet.id, patrolDirs: patrolCircle(...frameDir(f, 20, -14), 0.06, 3) },
    // Torreta antiaérea en la muralla norte.
    { kind: 'turret', planetId: planet.id, patrolDirs: [frameDir(f, 30, -18)] },
  ];

  return { structures, objects, enemies };
}

// ----------------------------------------------------------------------------
// Trono de KRONOS: arena volcánica blindada con pilares de cobertura,
// plataformas laterales, barriles, rocas y 2 burbujas orbitales para
// maniobrar contra el Comandante KRONOS.
// ----------------------------------------------------------------------------

function kronosContent(): {
  structures: StructureSpec[];
  objects: WorldObjectSpec[];
  enemies: EnemySpawnSpec[];
  bubbles: WaterBubbleSpec[];
} {
  const planet = GALAXY_PLANETS[4];
  const PILLAR = '#3f3f46';
  const PLATFORM = '#52525b';

  const f = baseFrame(planet.id, [0.25, 0.85, 0.45], planet.radius);
  const structures: StructureSpec[] = [
    // Pilares de cobertura por la arena.
    struct(f, 'kr-pillar-1', 'pillar', 14, 10, null, [1.4, 4.5, 1.4], PILLAR),
    struct(f, 'kr-pillar-2', 'pillar', -14, 10, null, [1.4, 4.5, 1.4], PILLAR),
    struct(f, 'kr-pillar-3', 'pillar', 14, -10, null, [1.4, 4.5, 1.4], PILLAR),
    struct(f, 'kr-pillar-4', 'pillar', -14, -10, null, [1.4, 4.5, 1.4], PILLAR),
    struct(f, 'kr-pillar-5', 'pillar', 0, 18, null, [1.4, 4.5, 1.4], PILLAR),
    struct(f, 'kr-pillar-6', 'pillar', 0, -18, null, [1.4, 4.5, 1.4], PILLAR),
    // Plataformas laterales elevadas.
    struct(f, 'kr-platform-e', 'platform', 26, 0, null, [5, 1.1, 5], PLATFORM, {
      altitudeOffset: 7,
    }),
    struct(f, 'kr-platform-w', 'platform', -26, 0, null, [5, 1.1, 5], PLATFORM, {
      altitudeOffset: 7,
    }),
  ];

  const objects: WorldObjectSpec[] = [
    obj(planet.id, 'kr-barril-1', 'barrel_explosive', frameDir(f, 10, 4)),
    obj(planet.id, 'kr-barril-2', 'barrel_explosive', frameDir(f, -10, -4)),
    obj(planet.id, 'kr-barril-3', 'barrel_explosive', frameDir(f, 18, -12)),
    obj(planet.id, 'kr-barril-4', 'barrel_explosive', frameDir(f, -18, 12)),
    obj(planet.id, 'kr-roca-1', 'rock', frameDir(f, 8, -12)),
    obj(planet.id, 'kr-roca-2', 'rock', frameDir(f, -8, 12)),
    obj(planet.id, 'kr-roca-3', 'rock', frameDir(f, 22, 6)),
    obj(planet.id, 'kr-roca-4', 'rock', frameDir(f, -22, -6)),
    obj(planet.id, 'kr-caja-1', 'crate', frameDir(f, 5, 15)),
    obj(planet.id, 'kr-caja-2', 'crate', frameDir(f, -5, -15)),
  ];

  const enemies: EnemySpawnSpec[] = [
    // El Comandante KRONOS aguarda en el lado opuesto al spawn.
    { kind: 'kronos', planetId: planet.id, patrolDirs: [[-0.25, -0.85, -0.45]] },
  ];

  // Burbujas orbitales para maniobras de nado contra el jefe.
  const bubbles: WaterBubbleSpec[] = [
    orbitBubble('kr-bub-1', planet, frameDir(f, 30, 18), 14, 10),
    orbitBubble('kr-bub-2', planet, frameDir(f, -30, -18), 14, 10),
  ];

  return { structures, objects, enemies, bubbles };
}

// ----------------------------------------------------------------------------
// GALAXY_SPEC: contrato principal de la Oleada 2
// ----------------------------------------------------------------------------

const luna = lunaContent();
const verdant = verdantContent();
const cryo = cryoContent();
const bastion = bastionContent();
const kronos = kronosContent();

export const GALAXY_SPEC: GalaxySpec = {
  skyTopColor: '#05010f',
  skyBottomColor: '#6d28d9',
  planets: GALAXY_PLANETS,
  structures: [
    ...luna.structures,
    ...verdant.structures,
    ...cryo.structures,
    ...bastion.structures,
    ...kronos.structures,
  ],
  waterBubbles: [...verdant.bubbles, ...cryo.bubbles, ...kronos.bubbles],
  grassZones: [...luna.grass, ...verdant.grass],
  objects: [
    ...luna.objects,
    ...verdant.objects,
    ...cryo.objects,
    ...bastion.objects,
    ...kronos.objects,
  ],
  enemies: [
    ...luna.enemies,
    ...verdant.enemies,
    ...cryo.enemies,
    ...bastion.enemies,
    ...kronos.enemies,
  ],
  spawnPlanetId: 'luna-tutorial',
  spawnDir: [0.25, 0.85, 0.45],
};

