import * as THREE from 'three';
import type {
  EnemySpawnSpec,
  GalaxySpec,
  GrassZoneSpec,
  InteractableKind,
  NpcSpec,
  PlanetSpec,
  PropKind,
  PropSpec,
  StructureKind,
  StructureSpec,
  WaterBubbleSpec,
  WorldObjectSpec,
} from '../types';

// ============================================================================
// OUTORBIT 2.0 — FASE C: Diseño artesanal de los 5 planetas.
// Un único Sistema Solar vivo donde cada objetivo vive tras una progresión:
// recintos CERRADOS (muro + compuerta + pared rompible), vigías en torres,
// palancas escondidas, llaves robadas al oficial correcto, rutas aéreas de
// burbujas y subsuelo de Digger. Contrato principal: GALAXY_SPEC.
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

/** Yaw de una compuerta/pared rompible que corre sobre el eje `along`. */
function yawAlong(f: BaseFrame, axM: number, azM: number, along: 't1' | 't2'): number {
  return yawAlongX(frameDir(f, axM, azM), along === 't1' ? f.t1 : f.t2);
}

/** Yaw que orienta el +Z local (la cara de un NPC) hacia el tangente `along`. */
function yawFace(f: BaseFrame, axM: number, azM: number, along: THREE.Vector3): number {
  _q.setFromUnitVectors(_up, vec(frameDir(f, axM, azM))).invert();
  _v.copy(along).applyQuaternion(_q);
  return Math.atan2(_v.x, _v.z);
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

/**
 * FASE C — Compuerta bloqueada encajada en un hueco de muralla: su `halfX`
 * más los segmentos laterales deben cubrir EXACTAMENTE el lado del recinto
 * (sin rendjas). Se abre con su palanca vinculada o con tarjeta robada.
 */
function lockedGate(
  f: BaseFrame,
  id: string,
  axM: number,
  azM: number,
  along: 't1' | 't2',
  size: [number, number, number],
  options: { requiresKeycard?: boolean; lockdownOnAlert?: boolean } = {}
): WorldObjectSpec {
  return {
    id,
    kind: 'locked_gate',
    planetId: f.planetId,
    sphericalDir: frameDir(f, axM, azM),
    yaw: yawAlong(f, axM, azM, along),
    size,
    requiresKeycard: options.requiresKeycard,
    lockdownOnAlert: options.lockdownOnAlert,
  };
}

/** FASE C — Pared rompible que sustituye un tramo de muralla (hueco sellado). */
function breakableWall(
  f: BaseFrame,
  id: string,
  axM: number,
  azM: number,
  along: 't1' | 't2',
  size: [number, number, number]
): WorldObjectSpec {
  return {
    id,
    kind: 'breakable_wall',
    planetId: f.planetId,
    sphericalDir: frameDir(f, axM, azM),
    yaw: yawAlong(f, axM, azM, along),
    size,
  };
}

/**
 * FASE C — Palanca de pedestal. Con `linkedGateId` abre su compuerta; sin él
 * apaga la valla láser más cercana de su planeta (barrera del patio).
 */
function switchLever(
  f: BaseFrame,
  id: string,
  axM: number,
  azM: number,
  options: { altitudeOffset?: number; linkedGateId?: string } = {}
): WorldObjectSpec {
  return {
    id,
    kind: 'switch_lever',
    planetId: f.planetId,
    sphericalDir: frameDir(f, axM, azM),
    altitudeOffset: options.altitudeOffset,
    linkedGateId: options.linkedGateId,
  };
}

/** FASE C — Valla láser encajada en el hueco de una muralla. */
function laserGate(
  f: BaseFrame,
  id: string,
  axM: number,
  azM: number,
  along: 't1' | 't2'
): WorldObjectSpec {
  return {
    id,
    kind: 'laser_gate',
    planetId: f.planetId,
    sphericalDir: frameDir(f, axM, azM),
    yaw: yawAlong(f, axM, azM, along),
  };
}

/** FASE C — Vigía estacionario sobre una torre o plataforma elevada. */
function lookout(
  planetId: string,
  dir: [number, number, number],
  altitudeOffset: number,
  lookAtDir?: [number, number, number]
): EnemySpawnSpec {
  return {
    kind: 'guard',
    planetId,
    patrolDirs: lookAtDir ? [dir, lookAtDir] : [dir],
    stationaryLookout: true,
    altitudeOffset,
  };
}

/** Prop ambiental temático (torii, pagoda, farolillo, cristal, reactor...). */
function prop(
  planetId: string,
  id: string,
  kind: PropKind,
  dir: [number, number, number],
  options: { yaw?: number; scale?: number } = {}
): PropSpec {
  return {
    id,
    kind,
    planetId,
    sphericalDir: dir,
    yaw: options.yaw,
    scale: options.scale,
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
    subtitle: 'Puesto Avanzado Vigía',
    biome: 'tutorial',
    center: [0, 0, 0],
    radius: 72,
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
    subtitle: 'Shogunato del Bosque — Aldea Feudal y Castillo Cerrado',
    biome: 'verdant',
    center: [300, 40, -150],
    radius: 135,
    gravityStrength: 1.1,
    surfaceColor: '#4ade80',
    patchColor: '#16a34a',
    atmosphereColor: '#bbf7d0',
    hasWaterShell: true,
    waterRadius: 136.5,
    unlockedByPlanetId: 'luna-tutorial',
  },
  {
    id: 'cryo-glaciar',
    order: 2,
    name: 'Cryo-Drop',
    subtitle: 'Santuario Glacial y Archipiélago Abisal',
    biome: 'cryo',
    center: [-160, 125, -450],
    radius: 145,
    gravityStrength: 0.95,
    surfaceColor: '#bae6fd',
    patchColor: '#f8fafc',
    atmosphereColor: '#e0f2fe',
    hasWaterShell: true,
    waterRadius: 146.5,
    hasIcePatches: true,
    unlockedByPlanetId: 'verdant-pradera',
  },
  {
    id: 'bastion-fortaleza',
    order: 3,
    name: 'Iron Bastion',
    subtitle: 'Ciudadela Industrial de Kronos',
    biome: 'bastion',
    center: [195, -90, -780],
    radius: 156,
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
    subtitle: 'Núcleo Carmesí',
    biome: 'kronos',
    center: [0, 225, -1110],
    radius: 106,
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
// Planeta 0 — Luna Tutorial: PUESTO AVANZADO VIGÍA (r = 72).
// Recinto amurallado CERRADO por los 4 lados: portón `locked_gate` al frente,
// `breakable_wall` agrietada atrás (con barriles junto a ella), torre lateral
// con la palanca escondida en la hierba y 1 guardia en el pasillo de entrada.
// El generador vive DENTRO del recinto: palanca, barril o Digger.
// ----------------------------------------------------------------------------

function lunaContent(): {
  structures: StructureSpec[];
  objects: WorldObjectSpec[];
  enemies: EnemySpawnSpec[];
  grass: GrassZoneSpec[];
  npcs: NpcSpec[];
} {
  const planet = GALAXY_PLANETS[0];
  const WALL = '#64748b';
  const f = baseFrame(planet.id, [0.5, 0.68, 0.4], planet.radius);
  // La puerta del Puesto Vigía mira al spawn: eje t1 = tangente hacia el
  // punto de aparición del jugador.
  const spawn = vec([0.25, 0.85, 0.45]);
  const toSpawn = new THREE.Vector3().copy(spawn).addScaledVector(f.n, -spawn.dot(f.n));
  if (toSpawn.lengthSq() < 1e-6) toSpawn.copy(f.t1);
  toSpawn.normalize();
  const gf = baseFrame(planet.id, [0.5, 0.68, 0.4], planet.radius, toSpawn);

  // Recinto cerrado 20 x 14 (x -10..10, z -7..7). Frontal x=+10 (hacia el
  // spawn), trasera x=-10 con la pared agrietada.
  const structures: StructureSpec[] = [
    // Frontal: 5 + 5 (muro) + 4 (compuerta) = 14 m exactos.
    wallSeg(gf, 'luna-wall-front-l', 10, -4.5, 't2', 5, 4.5, WALL),
    wallSeg(gf, 'luna-wall-front-r', 10, 4.5, 't2', 5, 4.5, WALL),
    // Trasera: 4.5 + 4.5 (muro) + 5 (pared agrietada) = 14 m exactos.
    wallSeg(gf, 'luna-wall-back-l', -10, -4.75, 't2', 4.5, 4.5, WALL),
    wallSeg(gf, 'luna-wall-back-r', -10, 4.75, 't2', 4.5, 4.5, WALL),
    // Laterales completos.
    wallSeg(gf, 'luna-wall-side-n', 0, -7, 't1', 20, 4.5, WALL),
    wallSeg(gf, 'luna-wall-side-s', 0, 7, 't1', 20, 4.5, WALL),
    // Torre lateral en la esquina frontal (la palanca se esconde tras ella).
    towerAt(gf, 'luna-torre-vigia', 10, 7, WALL, 8),
  ];

  const objects: WorldObjectSpec[] = [
    // Compuerta frontal: se abre con la palanca de la torre.
    lockedGate(gf, 'luna-puesto-compuerta', 10, 0, 't2', [2, 3.6, 0.6]),
    // Pared trasera agrietada: barriles explosivos justo detrás.
    breakableWall(gf, 'luna-muro-agrietado', -10, 0, 't2', [2.5, 3.6, 0.6]),
    // Palanca tras la torre, escondida en la hierba del flanco.
    switchLever(gf, 'luna-palanca-torre', 14, 10, { linkedGateId: 'luna-puesto-compuerta' }),
    // El generador vive DENTRO del recinto cerrado.
    obj(planet.id, 'luna-gen-1', 'generator', frameDir(gf, -2, 0)),
    // Barriles para reventar la pared agrietada trasera.
    obj(planet.id, 'luna-barril-1', 'barrel_explosive', frameDir(gf, -14, 2)),
    obj(planet.id, 'luna-barril-2', 'barrel_explosive', frameDir(gf, -15, -2)),
    // Rocas de distracción/Estasis y cajas por la luna.
    obj(planet.id, 'luna-roca-1', 'rock', frameDir(gf, 16, -8)),
    obj(planet.id, 'luna-roca-2', 'rock', frameDir(gf, 6, -12)),
    obj(planet.id, 'luna-roca-3', 'rock', [0.7, 0.5, 0.3]),
    obj(planet.id, 'luna-roca-4', 'rock', [-0.3, 0.8, -0.4]),
    obj(planet.id, 'luna-caja-1', 'crate', [0.15, 0.95, 0.28]),
  ];

  const enemies: EnemySpawnSpec[] = [
    // Guardia patrullando el pasillo de entrada frente a la compuerta.
    { kind: 'guard', planetId: planet.id, patrolDirs: patrolCircle(...frameDir(gf, 14, 0), 0.06, 4) },
  ];

  const grass: GrassZoneSpec[] = [
    // Hierba del flanco: ruta sigilosa hasta la palanca de la torre.
    { id: 'luna-hierba-flanco', planetId: planet.id, sphericalDir: frameDir(gf, 14, 13), angularRadius: 0.22 },
    { id: 'luna-hierba-spawn', planetId: planet.id, sphericalDir: frameDir(gf, 20, -6), angularRadius: 0.18 },
  ];

  const npcs: NpcSpec[] = [
    {
      id: 'kuro',
      name: 'Kuro',
      role: 'Explorador',
      planetId: planet.id,
      sphericalDir: frameDir(gf, 17, 3),
      yaw: yawFace(gf, 17, 3, gf.t1),
      accentColor: '#38bdf8',
      dialogue: [
        'La compuerta del Puesto Vigía está cerrada. Puedes colarte por la hierba de la izquierda hasta la palanca de la torre, o reventar el muro agrietado trasero con el barril explosivo.',
        'Si un guardia te ve, corre a la hierba alta: ahí dentro no te encuentran... salvo a quemarropa.',
        'Con Digger puedes excavar (Shift) y colarte bajo la muralla sin que nadie se entere.',
      ],
    },
  ];

  return { structures, objects, enemies, grass, npcs };
}

// ----------------------------------------------------------------------------
// Planeta 1 — Verdant: SHOGUNATO DEL BOSQUE (r = 135).
// Acto 1: Aldea Feudal del Valle (pagoda central, Capitán con la llave maestra
// y el Almacén del generador 1 tras su valla láser + palanca en la casa
// lateral). Acto 2: Castillo del Shogunato con doble recinto CERRADO: portón
// con llave, pared agrietada trasera, vigías en las torres, escalera de
// burbujas al tejado, patio interior con LOCKDOWN y santuario del Shogun.
// ----------------------------------------------------------------------------

function verdantContent(): {
  structures: StructureSpec[];
  objects: WorldObjectSpec[];
  enemies: EnemySpawnSpec[];
  grass: GrassZoneSpec[];
  bubbles: WaterBubbleSpec[];
  props: PropSpec[];
  npcs: NpcSpec[];
} {
  const planet = GALAXY_PLANETS[1];
  const WALL = '#3e4c3a';
  const GATE = '#55684d';

  // ==================== Acto 1: Aldea Feudal del Valle ====================
  const fV = baseFrame(planet.id, [0.05, 0.3, 0.95], planet.radius);

  // ==================== Acto 2: Castillo del Shogunato ====================
  // Recinto exterior 44 x 34 (x -22..22, z -17..17) + interior 24 x 20.
  const fA = baseFrame(planet.id, [0.35, 0.8, 0.42], planet.radius);

  const structures: StructureSpec[] = [
    // --- Almacén de la aldea (generador 1): patio 8 x 5 abierto al oeste,
    // cerrado por la valla láser (Digger la cruza por debajo). ---
    wallSeg(fV, 'vd-almacen-wall-back', 38, 2.5, 't2', 5, 3.5, WALL),
    wallSeg(fV, 'vd-almacen-wall-n', 34, 5, 't1', 8, 3.5, WALL),
    wallSeg(fV, 'vd-almacen-wall-s', 34, 0, 't1', 8, 3.5, WALL),
    // Arco decorativo de entrada a la aldea (se pasa por debajo).
    archGate(fV, 'vd-arco-aldea', 0, -20, 't1', 10, GATE),

    // --- Muralla exterior del castillo (h=5): CERRADA en los 4 lados. ---
    // Norte: 19 + 19 (muro) + 6 (pared agrietada) = 44 m exactos.
    wallSeg(fA, 'vd-cast-wall-n-l', -12.5, -17, 't1', 19, 5, WALL),
    wallSeg(fA, 'vd-cast-wall-n-r', 12.5, -17, 't1', 19, 5, WALL),
    // Sur: 19 + 19 (muro) + 6 (portón principal) = 44 m exactos.
    wallSeg(fA, 'vd-cast-wall-s-l', -12.5, 17, 't1', 19, 5, WALL),
    wallSeg(fA, 'vd-cast-wall-s-r', 12.5, 17, 't1', 19, 5, WALL),
    wallSeg(fA, 'vd-cast-wall-e', 22, 0, 't2', 34, 5, WALL),
    wallSeg(fA, 'vd-cast-wall-w', -22, 0, 't2', 34, 5, WALL),
    // Torres de las esquinas con vigías oteando el patio.
    towerAt(fA, 'vd-cast-tower-ne', 22, -17, WALL, 8),
    towerAt(fA, 'vd-cast-tower-se', 22, 17, WALL, 8),
    towerAt(fA, 'vd-cast-tower-nw', -22, -17, WALL, 8),
    towerAt(fA, 'vd-cast-tower-sw', -22, 17, WALL, 8),

    // --- Muralla interior (h=4): CERRADA en los 4 lados. ---
    wallSeg(fA, 'vd-cast-wall-in-n', 0, -10, 't1', 24, 4, WALL),
    // Sur interior: 9.5 + 9.5 (muro) + 5 (compuerta) = 24 m exactos.
    wallSeg(fA, 'vd-cast-wall-in-s-l', -7.25, 10, 't1', 9.5, 4, WALL),
    wallSeg(fA, 'vd-cast-wall-in-s-r', 7.25, 10, 't1', 9.5, 4, WALL),
    wallSeg(fA, 'vd-cast-wall-in-e', 12, 0, 't2', 20, 4, WALL),
    // Oeste interior: 7.5 + 7.5 (muro) + 5 (pared agrietada) = 20 m exactos.
    wallSeg(fA, 'vd-cast-wall-in-w-n', -12, 6.25, 't2', 7.5, 4, WALL),
    wallSeg(fA, 'vd-cast-wall-in-w-s', -12, -6.25, 't2', 7.5, 4, WALL),

    // --- Ruta aérea de Axel (flanco derecho): escalera de burbujas hasta
    // la plataforma del tejado que sobrevuela el patio de armas. ---
    struct(fA, 'vd-cast-plataforma-1', 'platform', 32, 0, null, [4, 1, 4], GATE, {
      altitudeOffset: 14,
    }),
    struct(fA, 'vd-cast-tejado', 'platform', 8, 6, null, [4.5, 1, 4.5], GATE, {
      altitudeOffset: 15,
    }),
  ];

  const objects: WorldObjectSpec[] = [
    // ==================== Acto 1: Aldea Feudal ====================
    // Generador 1 dentro del almacén, tras la valla láser.
    obj(planet.id, 'vd-gen-1', 'generator', frameDir(fV, 35, 2.5)),
    laserGate(fV, 'vd-laser-almacen', 30, 2.5, 't2'),
    // Palanca en la casa lateral del almacén (apaga la valla láser).
    switchLever(fV, 'vd-palanca-almacen', 26, -4),

    // ==================== Acto 2: Castillo del Shogunato ====================
    // Portón principal: requiere la llave maestra del Capitán de la aldea.
    lockedGate(fA, 'vd-castillo-porton', 0, 17, 't1', [3, 4.2, 0.7], {
      requiresKeycard: true,
    }),
    // Pared trasera agrietada, escondida tras los barriles y los pinos.
    breakableWall(fA, 'vd-castillo-muro-norte', 0, -17, 't1', [3, 4.5, 0.7]),
    // Compuerta interior con LOCKDOWN: se cierra de golpe si salta la alarma.
    lockedGate(fA, 'vd-castillo-puerta-interior', 0, 10, 't1', [2.5, 3.8, 0.6], {
      lockdownOnAlert: true,
    }),
    // Pared agrietada del patio hacia el santuario del Shogun.
    breakableWall(fA, 'vd-castillo-muro-santuario', -12, 0, 't2', [2.5, 3.8, 0.6]),
    // Palanca lateral del patio exterior (ruta normal a la compuerta interior).
    switchLever(fA, 'vd-castillo-palanca-interior', 16, 13, {
      linkedGateId: 'vd-castillo-puerta-interior',
    }),
    // Generador 2: patio de armas, tras la compuerta interior.
    obj(planet.id, 'vd-gen-2', 'generator', frameDir(fA, 4, 5)),
    // Generador 3: dentro de la Pagoda/Santuario del Shogun.
    obj(planet.id, 'vd-gen-3', 'generator', frameDir(fA, -5, -5)),

    // Barriles: emboscada al Capitán en la aldea + pared agrietada trasera
    // del castillo + pared del santuario en el patio.
    obj(planet.id, 'vd-barril-plaza', 'barrel_explosive', frameDir(fV, 12, 12)),
    obj(planet.id, 'vd-barril-castillo-1', 'barrel_explosive', frameDir(fA, 0, -21)),
    obj(planet.id, 'vd-barril-castillo-2', 'barrel_explosive', frameDir(fA, -3.5, -20)),
    obj(planet.id, 'vd-barril-castillo-3', 'barrel_explosive', frameDir(fA, 3.5, -20)),
    obj(planet.id, 'vd-barril-santuario', 'barrel_explosive', frameDir(fA, -15, 2.5)),
    // Rocas para distraer a los guardias del Capitán y para la Estasis.
    obj(planet.id, 'vd-roca-plaza-1', 'rock', frameDir(fV, -9, 8)),
    obj(planet.id, 'vd-roca-plaza-2', 'rock', frameDir(fV, 9, 8)),
    obj(planet.id, 'vd-roca-castillo-1', 'rock', frameDir(fA, 26, 14)),
    obj(planet.id, 'vd-roca-castillo-2', 'rock', frameDir(fA, -26, -10)),
    obj(planet.id, 'vd-roca-patio', 'rock', frameDir(fA, 6, -6)),
    obj(planet.id, 'vd-roca-1', 'rock', [0.3, 0.88, 0.35]),
    obj(planet.id, 'vd-roca-2', 'rock', [-0.2, 0.95, 0.25]),
    obj(planet.id, 'vd-roca-3', 'rock', [0.6, 0.55, 0.55]),
    obj(planet.id, 'vd-roca-4', 'rock', [-0.4, 0.75, -0.5]),
    obj(planet.id, 'vd-caja-1', 'crate', frameDir(fV, -15, -10)),
    obj(planet.id, 'vd-caja-2', 'crate', frameDir(fA, 18, 20)),
    obj(planet.id, 'vd-caja-3', 'crate', [0.1, 0.9, 0.4]),
  ];

  const enemies: EnemySpawnSpec[] = [
    // ==================== Acto 1: Aldea Feudal ====================
    // Oficial Capitán del Shogunato: lleva la LLAVE MAESTRA del castillo.
    {
      kind: 'officer',
      planetId: planet.id,
      patrolDirs: patrolCircle(...frameDir(fV, 0, 6), 0.045, 4),
      dropsKeycard: true,
    },
    // Sus 2 guardias de escolta en la plaza de la pagoda.
    { kind: 'guard', planetId: planet.id, patrolDirs: patrolCircle(...frameDir(fV, -5, 4), 0.035, 4) },
    { kind: 'guard', planetId: planet.id, patrolDirs: patrolCircle(...frameDir(fV, 5, 4), 0.035, 4) },

    // ==================== Acto 2: Castillo del Shogunato ====================
    // Vigías en las torres traseras: barren el patio desde las almenas.
    lookout(planet.id, frameDir(fA, 22, -17), 7.6, frameDir(fA, 0, 4)),
    lookout(planet.id, frameDir(fA, -22, -17), 7.6, frameDir(fA, 0, 4)),
    // Patrullas del patio exterior (entre las dos murallas).
    { kind: 'guard', planetId: planet.id, patrolDirs: patrolCircle(...frameDir(fA, 8, 13), 0.05, 4) },
    { kind: 'guard', planetId: planet.id, patrolDirs: patrolCircle(...frameDir(fA, -8, 13), 0.05, 4) },
    // Brute del Shogun custodiando el patio de armas interior.
    { kind: 'brute', planetId: planet.id, patrolDirs: patrolCircle(...frameDir(fA, 0, -3), 0.05, 3) },
    // Guardia del patio de armas (generador 2).
    { kind: 'guard', planetId: planet.id, patrolDirs: patrolCircle(...frameDir(fA, 4, 1), 0.035, 4) },
    // Guardia errante por la pradera.
    { kind: 'guard', planetId: planet.id, patrolDirs: patrolCircle(0.15, 0.9, 0.35, 0.1, 4) },
  ];

  const grass: GrassZoneSpec[] = [
    { id: 'vd-grass-spawn', planetId: planet.id, sphericalDir: [0.15, 0.9, 0.35], angularRadius: 0.2 },
    { id: 'vd-grass-aldea', planetId: planet.id, sphericalDir: frameDir(fV, 0, -22), angularRadius: 0.2 },
    { id: 'vd-grass-mid', planetId: planet.id, sphericalDir: [0.05, 0.72, 0.62], angularRadius: 0.18 },
    // Cobertura sigilosa frente al portón y en los flancos del castillo.
    { id: 'vd-grass-castillo-frente', planetId: planet.id, sphericalDir: frameDir(fA, 0, 24), angularRadius: 0.2 },
    { id: 'vd-grass-castillo-este', planetId: planet.id, sphericalDir: frameDir(fA, 30, -14), angularRadius: 0.18 },
    { id: 'vd-grass-castillo-oeste', planetId: planet.id, sphericalDir: frameDir(fA, -28, 0), angularRadius: 0.18 },
  ];

  // Escalera de burbujas del flanco derecho (Axel) hasta el tejado.
  const bubbles: WaterBubbleSpec[] = [
    orbitBubble('vd-bub-c1', planet, frameDir(fA, 26, -11), 6, 8),
    orbitBubble('vd-bub-c2', planet, frameDir(fA, 29, -6), 11, 7.5),
    orbitBubble('vd-bub-c3', planet, frameDir(fA, 27, 6), 16, 7),
    orbitBubble('vd-bub-aldea', planet, frameDir(fV, 14, 14), 5, 7),
  ];

  // --- Aldea Feudal: torii, pagoda central, casas, farolillos, caminos,
  // puentes de madera y arboledas de bambú/pino alrededor. ---
  const props: PropSpec[] = [
    prop(planet.id, 'vd-torii-1', 'torii_gate', frameDir(fV, 0, -18)),
    prop(planet.id, 'vd-torii-2', 'torii_gate', frameDir(fV, 22, -6), { yaw: 1.2 }),
    prop(planet.id, 'vd-pagoda-1', 'pagoda_house', frameDir(fV, 0, 0)),
    prop(planet.id, 'vd-pagoda-2', 'pagoda_house', frameDir(fV, -26, 16), { scale: 0.8 }),
    prop(planet.id, 'vd-casa-1', 'village_house', frameDir(fV, -13, -7), { yaw: 0.4 }),
    prop(planet.id, 'vd-casa-2', 'village_house', frameDir(fV, 13, -7), { yaw: -0.4 }),
    prop(planet.id, 'vd-casa-3', 'village_house', frameDir(fV, -13, 9), { yaw: -0.3 }),
    prop(planet.id, 'vd-casa-4', 'village_house', frameDir(fV, 13, 9), { yaw: 0.3 }),
    prop(planet.id, 'vd-casa-5', 'village_house', frameDir(fV, 0, 18), { yaw: Math.PI }),
    prop(planet.id, 'vd-casa-6', 'village_house', frameDir(fV, 28, 10), { yaw: 0.9 }),
    // Casa lateral del almacén (junto a su palanca).
    prop(planet.id, 'vd-casa-almacen', 'village_house', frameDir(fV, 26, -7), { yaw: 0.5 }),
    // Farolillos de papel flanqueando el camino de entrada y la plaza.
    prop(planet.id, 'vd-farol-1', 'paper_lantern', frameDir(fV, -2.5, -15)),
    prop(planet.id, 'vd-farol-2', 'paper_lantern', frameDir(fV, 2.5, -15)),
    prop(planet.id, 'vd-farol-3', 'paper_lantern', frameDir(fV, -2.5, -9)),
    prop(planet.id, 'vd-farol-4', 'paper_lantern', frameDir(fV, 2.5, -9)),
    prop(planet.id, 'vd-farol-5', 'paper_lantern', frameDir(fV, -2.5, -3)),
    prop(planet.id, 'vd-farol-6', 'paper_lantern', frameDir(fV, 2.5, -3)),
    prop(planet.id, 'vd-farol-7', 'paper_lantern', frameDir(fV, -6, 5)),
    prop(planet.id, 'vd-farol-8', 'paper_lantern', frameDir(fV, 6, 5)),
    // Caminos de piedra: acceso al torii y plaza de la pagoda.
    prop(planet.id, 'vd-camino-1', 'stone_path', frameDir(fV, 0, -12)),
    prop(planet.id, 'vd-camino-2', 'stone_path', frameDir(fV, 0, 12), { yaw: Math.PI }),
    prop(planet.id, 'vd-camino-3', 'stone_path', frameDir(fV, -20, -2), { yaw: Math.PI / 2 }),
    // Puentes de madera entre la aldea y los complejos.
    prop(planet.id, 'vd-puente-1', 'wood_bridge', frameDir(fV, 19, 0), { yaw: Math.PI / 2 }),
    prop(planet.id, 'vd-puente-2', 'wood_bridge', frameDir(fV, -19, 0), { yaw: Math.PI / 2 }),
    // Bambú y árboles alrededor de la aldea y el castillo.
    prop(planet.id, 'vd-bambu-1', 'bamboo_cluster', frameDir(fV, 17, -13)),
    prop(planet.id, 'vd-bambu-2', 'bamboo_cluster', frameDir(fV, -17, -13)),
    prop(planet.id, 'vd-bambu-3', 'bamboo_cluster', frameDir(fV, 9, 20)),
    prop(planet.id, 'vd-bambu-4', 'bamboo_cluster', frameDir(fV, -9, 20)),
    prop(planet.id, 'vd-bambu-5', 'bamboo_cluster', frameDir(fA, 24, 16)),
    prop(planet.id, 'vd-bambu-6', 'bamboo_cluster', frameDir(fA, -24, -20)),
    prop(planet.id, 'vd-pino-1', 'pine_tree', frameDir(fV, 24, -16), { scale: 1.4 }),
    prop(planet.id, 'vd-pino-2', 'pine_tree', frameDir(fV, -24, -16), { scale: 1.4 }),
    prop(planet.id, 'vd-pino-3', 'pine_tree', frameDir(fV, 26, 6), { scale: 1.2 }),
    prop(planet.id, 'vd-pino-4', 'pine_tree', frameDir(fV, -26, -8), { scale: 1.2 }),
    // Pinos que esconden la pared agrietada trasera del castillo.
    prop(planet.id, 'vd-pino-castillo-1', 'pine_tree', frameDir(fA, -6, -21), { scale: 1.5 }),
    prop(planet.id, 'vd-pino-castillo-2', 'pine_tree', frameDir(fA, 6, -21), { scale: 1.5 }),
    prop(planet.id, 'vd-pino-castillo-3', 'pine_tree', frameDir(fA, 0, -24), { scale: 1.6 }),
    prop(planet.id, 'vd-pino-castillo-4', 'pine_tree', frameDir(fA, 30, -12), { scale: 1.5 }),
    prop(planet.id, 'vd-pino-castillo-5', 'pine_tree', frameDir(fA, -26, 12), { scale: 1.5 }),
    prop(planet.id, 'vd-pino-castillo-6', 'pine_tree', frameDir(fA, 20, 14), { scale: 1.3 }),
    prop(planet.id, 'vd-pino-castillo-7', 'pine_tree', frameDir(fA, -20, -14), { scale: 1.3 }),
    prop(planet.id, 'vd-pino-11', 'pine_tree', [0.3, 0.6, 0.5], { scale: 1.6 }),
    prop(planet.id, 'vd-pino-12', 'pine_tree', [-0.1, 0.5, 0.8], { scale: 1.6 }),
    prop(planet.id, 'vd-pino-13', 'pine_tree', [0.7, 0.4, 0.2], { scale: 1.5 }),
    prop(planet.id, 'vd-pino-14', 'pine_tree', [-0.5, 0.2, 0.7], { scale: 1.5 }),
    prop(planet.id, 'vd-pino-15', 'pine_tree', [0.2, 0.15, 0.9], { scale: 1.7 }),
    prop(planet.id, 'vd-pino-16', 'pine_tree', [-0.8, 0.5, -0.2], { scale: 1.6 }),
    // Torii ceremonial frente al portón principal del castillo.
    prop(planet.id, 'vd-torii-castillo', 'torii_gate', frameDir(fA, 0, 22)),
    // Farolillos sueltos junto al castillo.
    prop(planet.id, 'vd-farol-9', 'paper_lantern', frameDir(fA, 8, 18)),
    prop(planet.id, 'vd-farol-10', 'paper_lantern', frameDir(fA, -8, 18)),
  ];

  const npcs: NpcSpec[] = [
    {
      id: 'takeshi',
      name: 'Maestro Takeshi',
      role: 'Sabio del Shogunato',
      planetId: planet.id,
      sphericalDir: frameDir(fV, 0, -15),
      yaw: yawFace(fV, 0, -15, fV.t2.clone().negate()),
      accentColor: '#f97316',
      dialogue: [
        'El Castillo del Shogunato selló sus portones. El Capitán que patrulla la Pagoda Central lleva la llave maestra; si prefieres no enfrentarlo, busca la pared agrietada detrás del santuario o sube por las burbujas hasta las almenas.',
        'El almacén del pueblo guarda un generador tras su valla láser. La palanca está en la casa lateral... o cava por debajo con Digger.',
        'Noquea al Capitán por la espalda con [E] para robarle la llave y quedarte con su disfraz.',
      ],
    },
  ];

  return { structures, objects, enemies, grass, bubbles, props, npcs };
}

// ----------------------------------------------------------------------------
// Planeta 2 — Cryo-Drop: SANTUARIO GLACIAL Y ARCHIPIÉLAGO ABISAL (r = 145).
// Océano helado con cristales gigantes e iglús. 3 desafíos distintos:
// (1) Isla-Fortaleza central amurallada con la palanca tras el iglú norte,
// (2) Búnker Criogénico con LOCKDOWN + pared rompible lateral y ruta
// subterránea, (3) Plataforma Orbital a 22 m con cadena de 3 burbujas.
// ----------------------------------------------------------------------------

function cryoContent(): {
  structures: StructureSpec[];
  objects: WorldObjectSpec[];
  enemies: EnemySpawnSpec[];
  bubbles: WaterBubbleSpec[];
  props: PropSpec[];
  npcs: NpcSpec[];
} {
  const planet = GALAXY_PLANETS[2];
  const WALL = '#5b7f99';
  const GATE = '#7dd3fc';
  const f = baseFrame(planet.id, [0.3, 0.82, 0.42], planet.radius);

  const structures: StructureSpec[] = [
    // --- Isla-Fortaleza central (20 x 16, h=4.5): CERRADA en los 4 lados. ---
    wallSeg(f, 'cy-isla-wall-n', 0, -8, 't1', 20, 4.5, WALL),
    // Sur: 7.5 + 7.5 (muro) + 5 (compuerta) = 20 m exactos.
    wallSeg(f, 'cy-isla-wall-s-l', -6.25, 8, 't1', 7.5, 4.5, WALL),
    wallSeg(f, 'cy-isla-wall-s-r', 6.25, 8, 't1', 7.5, 4.5, WALL),
    wallSeg(f, 'cy-isla-wall-e', 10, 0, 't2', 16, 4.5, WALL),
    wallSeg(f, 'cy-isla-wall-w', -10, 0, 't2', 16, 4.5, WALL),
    towerAt(f, 'cy-isla-tower-ne', 10, -8, WALL, 7),
    towerAt(f, 'cy-isla-tower-se', 10, 8, WALL, 7),
    towerAt(f, 'cy-isla-tower-nw', -10, -8, WALL, 7),
    towerAt(f, 'cy-isla-tower-sw', -10, 8, WALL, 7),

    // --- Búnker Criogénico (14 x 12, h=4): CERRADO en los 4 lados. ---
    wallSeg(f, 'cy-bunker-wall-n', -24, 0, 't1', 14, 4, WALL),
    // Sur: 4.5 + 4.5 (muro) + 5 (compuerta) = 14 m exactos.
    wallSeg(f, 'cy-bunker-wall-s-l', -28.75, 12, 't1', 4.5, 4, WALL),
    wallSeg(f, 'cy-bunker-wall-s-r', -19.25, 12, 't1', 4.5, 4, WALL),
    wallSeg(f, 'cy-bunker-wall-w', -31, 6, 't2', 12, 4, WALL),
    // Este: 3.5 + 3.5 (muro) + 5 (pared agrietada) = 12 m exactos.
    wallSeg(f, 'cy-bunker-wall-e-n', -17, 1.75, 't2', 3.5, 4, WALL),
    wallSeg(f, 'cy-bunker-wall-e-s', -17, 10.25, 't2', 3.5, 4, WALL),
    // Núcleo blindado del búnker (decorativo, el generador queda al lado).
    struct(f, 'cy-bunker-nucleo', 'bunker', -27.5, 3.5, null, [3, 3.8, 3], WALL),

    // --- Torre glacial + Plataforma Orbital del núcleo 3 (Axel). ---
    towerAt(f, 'cy-torre-glacial', 22, -12, GATE, 14),
    struct(f, 'cy-plataforma-orbital', 'platform', 30, -18, null, [5, 1.2, 5], GATE, {
      altitudeOffset: 22,
    }),
    struct(f, 'cy-orb-platform-2', 'platform', -28, -14, null, [4, 1.1, 4], GATE, {
      altitudeOffset: 18,
    }),
  ];

  const objects: WorldObjectSpec[] = [
    // ==================== Desafío 1: Isla-Fortaleza ====================
    obj(planet.id, 'cy-gen-1', 'generator', frameDir(f, 0, -2)),
    lockedGate(f, 'cy-isla-compuerta', 0, 8, 't1', [2.5, 3.6, 0.6]),
    // Palanca escondida tras el iglú norte (o roca de Estasis a distancia).
    switchLever(f, 'cy-isla-palanca', 3, -12.5, { linkedGateId: 'cy-isla-compuerta' }),

    // ==================== Desafío 2: Búnker Criogénico ====================
    obj(planet.id, 'cy-gen-2', 'generator', frameDir(f, -21, 9)),
    // Compuerta con LOCKDOWN: si salta la alarma se sella de golpe.
    lockedGate(f, 'cy-bunker-compuerta', -24, 12, 't1', [2.5, 3.6, 0.6], {
      lockdownOnAlert: true,
    }),
    switchLever(f, 'cy-bunker-palanca', -20, 15, { linkedGateId: 'cy-bunker-compuerta' }),
    // Pared rompible lateral, junto a las bolas de nieve y el barril.
    breakableWall(f, 'cy-bunker-muro-lateral', -17, 6, 't2', [2.5, 3.4, 0.6]),
    obj(planet.id, 'cy-bola-bunker-1', 'snowball', frameDir(f, -13, 6)),
    obj(planet.id, 'cy-bola-bunker-2', 'snowball', frameDir(f, -14, 8)),
    obj(planet.id, 'cy-barril-bunker', 'barrel_explosive', frameDir(f, -14, 4)),

    // ==================== Desafío 3: Plataforma Orbital ====================
    obj(planet.id, 'cy-gen-3', 'generator', frameDir(f, 30, -18), { altitudeOffset: 23.2 }),

    // Bolas de nieve gigantes para la Estasis y provisiones del campamento.
    obj(planet.id, 'cy-bola-1', 'snowball', frameDir(f, 16, 14)),
    obj(planet.id, 'cy-bola-2', 'snowball', frameDir(f, 8, 16)),
    obj(planet.id, 'cy-bola-3', 'snowball', [0.15, 0.95, 0.28]),
    obj(planet.id, 'cy-bola-4', 'snowball', [0.6, 0.6, 0.5]),
    obj(planet.id, 'cy-bola-5', 'snowball', [-0.4, 0.8, -0.4]),
    obj(planet.id, 'cy-roca-1', 'rock', frameDir(f, 16, 8)),
    obj(planet.id, 'cy-roca-2', 'rock', [-0.2, 0.9, -0.4]),
    obj(planet.id, 'cy-roca-3', 'rock', [0.45, 0.75, -0.5]),
    obj(planet.id, 'cy-barril-isla', 'barrel_explosive', frameDir(f, 4, 12)),
    obj(planet.id, 'cy-caja-1', 'crate', [0.25, 0.85, 0.45]),
    obj(planet.id, 'cy-caja-2', 'crate', frameDir(f, -16, -8)),
  ];

  const enemies: EnemySpawnSpec[] = [
    // Isla central: brute + guardias custodiando el núcleo 1.
    { kind: 'brute', planetId: planet.id, patrolDirs: patrolCircle(...frameDir(f, 4, 3), 0.05, 3) },
    { kind: 'guard', planetId: planet.id, patrolDirs: patrolCircle(...frameDir(f, -4, 3), 0.05, 4) },
    { kind: 'guard', planetId: planet.id, patrolDirs: patrolCircle(...frameDir(f, 0, 12), 0.05, 4) },
    // Búnker criogénico: guardia interior del núcleo 2.
    { kind: 'guard', planetId: planet.id, patrolDirs: patrolCircle(...frameDir(f, -22, 4), 0.04, 4) },
    // Vigía sobre la plataforma orbital del núcleo 3.
    lookout(planet.id, frameDir(f, 28.5, -17), 23.2, frameDir(f, 22, -10)),
    // Dron de reconocimiento sobre el hielo y guardia del camino del puente.
    { kind: 'drone', planetId: planet.id, patrolDirs: patrolCircle(0.25, 0.85, 0.45, 0.1, 4) },
    { kind: 'guard', planetId: planet.id, patrolDirs: patrolCircle(...frameDir(f, 14, 10), 0.06, 4) },
  ];

  // Cadena de 3 burbujas de agua espaciales hasta la plataforma orbital.
  const bubbles: WaterBubbleSpec[] = [
    orbitBubble('cy-bub-o1', planet, frameDir(f, 25, -14), 6, 8),
    orbitBubble('cy-bub-o2', planet, frameDir(f, 28, -16), 12, 7.5),
    orbitBubble('cy-bub-o3', planet, frameDir(f, 29.5, -17.5), 18, 7),
    orbitBubble('cy-bub-oeste', planet, frameDir(f, -18, -9), 10, 8),
  ];

  // --- Ambientación glaciar: cristales gigantes, iglús del campamento,
  // puentes congelados hacia la isla y farolillos congelados. ---
  const props: PropSpec[] = [
    // Campamento de iglús inicial (con la Dra. Vex).
    prop(planet.id, 'cy-iglu-camp-1', 'igloo', frameDir(f, 20, 18)),
    prop(planet.id, 'cy-iglu-camp-2', 'igloo', frameDir(f, 16, 20)),
    prop(planet.id, 'cy-iglu-camp-3', 'igloo', frameDir(f, 22, 14)),
    // Iglú del norte: esconde la palanca de la isla.
    prop(planet.id, 'cy-iglu-norte', 'igloo', frameDir(f, 2, -14)),
    prop(planet.id, 'cy-iglu-4', 'igloo', [-0.5, 0.6, 0.55], { scale: 0.85 }),
    // Camino congelado del campamento a la isla.
    prop(planet.id, 'cy-camino-1', 'stone_path', frameDir(f, 12, 13)),
    prop(planet.id, 'cy-camino-2', 'stone_path', frameDir(f, 8, 11)),
    prop(planet.id, 'cy-puente-hielo', 'wood_bridge', frameDir(f, 4, 10), { yaw: Math.PI / 2 }),
    // Farolillos congelados marcando la entrada de la isla.
    prop(planet.id, 'cy-farol-1', 'paper_lantern', frameDir(f, 3, 10)),
    prop(planet.id, 'cy-farol-2', 'paper_lantern', frameDir(f, -3, 10)),
    // Cristales de hielo gigantes repartidos por el glaciar.
    prop(planet.id, 'cy-cristal-1', 'ice_crystal', frameDir(f, 16, 14), { scale: 1.8 }),
    prop(planet.id, 'cy-cristal-2', 'ice_crystal', frameDir(f, -14, -18), { scale: 2.2 }),
    prop(planet.id, 'cy-cristal-3', 'ice_crystal', frameDir(f, 26, 4), { scale: 1.5 }),
    prop(planet.id, 'cy-cristal-4', 'ice_crystal', frameDir(f, -30, 10), { scale: 2.0 }),
    prop(planet.id, 'cy-cristal-5', 'ice_crystal', frameDir(f, 8, -22), { scale: 1.7 }),
    prop(planet.id, 'cy-cristal-6', 'ice_crystal', [0.1, 0.9, 0.2], { scale: 2.4 }),
    prop(planet.id, 'cy-cristal-7', 'ice_crystal', [-0.3, 0.7, -0.5], { scale: 2.0 }),
    prop(planet.id, 'cy-cristal-8', 'ice_crystal', [0.55, 0.5, -0.6], { scale: 1.6 }),
    prop(planet.id, 'cy-cristal-9', 'ice_crystal', [0.85, 0.3, 0.3], { scale: 1.9 }),
    prop(planet.id, 'cy-cristal-10', 'ice_crystal', [-0.6, 0.1, 0.75], { scale: 2.1 }),
  ];

  const npcs: NpcSpec[] = [
    {
      id: 'vex',
      name: 'Dra. Vex',
      role: 'Investigadora Polar',
      planetId: planet.id,
      sphericalDir: frameDir(f, 18, 16),
      yaw: yawFace(
        f,
        18,
        16,
        new THREE.Vector3().addScaledVector(f.t1, -18).addScaledVector(f.t2, -16).normalize()
      ),
      accentColor: '#7dd3fc',
      dialogue: [
        'Los 3 núcleos criogénicos están protegidos: uno en la Isla Central tras el puente, otro dentro del Búnker Sellado (si salta la alarma se cierra la compuerta!) y el tercero flotando en la Plataforma Orbital superior.',
        'La palanca de la isla está escondida tras el iglú del norte. Lánzale una roca con Estasis si no quieres acercarte.',
        'Para la plataforma orbital: sube a la torre glacial y sigue las burbujas de agua. Axel lo borda nadando.',
      ],
    },
  ];

  return { structures, objects, enemies, bubbles, props, npcs };
}

// ----------------------------------------------------------------------------
// Planeta 3 — Iron Bastion: CIUDADELA INDUSTRIAL DE KRONOS (r = 156).
// Megafortaleza de doble muralla con escáneres anti-disfraz, Ala Oeste con el
// Comandante que porta la Tarjeta Maestra (y su bóveda con tarjeta extra tras
// un muro agrietado), pasadizo secreto con tubería de teletransporte al Patio
// de Reactores y 3 reactores: patio de láseres con palanca en la pasarela,
// búnker blindado con Brute y torre del reactor norte con vigías y drones.
// ----------------------------------------------------------------------------

function bastionContent(): {
  structures: StructureSpec[];
  objects: WorldObjectSpec[];
  enemies: EnemySpawnSpec[];
  bubbles: WaterBubbleSpec[];
  props: PropSpec[];
  npcs: NpcSpec[];
} {
  const planet = GALAXY_PLANETS[3];
  const WALL = '#334155';
  const GATE = '#475569';
  const f = baseFrame(planet.id, [0.32, 0.78, 0.5], planet.radius);

  const structures: StructureSpec[] = [
    // --- Pilares del aterrizaje (tras ellos aguarda Zero-7). ---
    struct(f, 'bs-pilar-aterrizaje-1', 'pillar', 7, 30, null, [1, 5, 1], WALL),
    struct(f, 'bs-pilar-aterrizaje-2', 'pillar', 11, 30, null, [1, 5, 1], WALL),

    // --- Ala Oeste (12 x 16, h=5): CERRADA, entrada por valla láser. ---
    wallSeg(f, 'bs-ala-wall-w', -46, 0, 't2', 16, 5, WALL),
    wallSeg(f, 'bs-ala-wall-n', -40, -8, 't1', 12, 5, WALL),
    wallSeg(f, 'bs-ala-wall-s', -40, 8, 't1', 12, 5, WALL),
    // Este: 5.5 + 5.5 (muro) + 5.4 (valla láser) = 16 m (rendja de 0.3).
    wallSeg(f, 'bs-ala-wall-e-n', -34, -5.25, 't2', 5.5, 5, WALL),
    wallSeg(f, 'bs-ala-wall-e-s', -34, 5.25, 't2', 5.5, 5, WALL),
    towerAt(f, 'bs-torre-ala-oeste', -44, -8, WALL, 11),
    // Bóveda de la tarjeta extra (6 x 4) cerrada por muro agrietado.
    wallSeg(f, 'bs-boveda-wall-n', -43, 2, 't1', 6, 4, WALL),
    wallSeg(f, 'bs-boveda-wall-s', -43, 6, 't1', 6, 4, WALL),

    // --- Muralla exterior (64 x 48, h=6): CERRADA en los 4 lados. ---
    wallSeg(f, 'bs-wall-n', 0, -24, 't1', 64, 6, WALL),
    // Sur: 29 + 29 (muro) + 6 (portón principal) = 64 m exactos.
    wallSeg(f, 'bs-wall-s-l', -17.5, 24, 't1', 29, 6, WALL),
    wallSeg(f, 'bs-wall-s-r', 17.5, 24, 't1', 29, 6, WALL),
    wallSeg(f, 'bs-wall-w', -32, 0, 't2', 48, 6, WALL),
    // Este: 21.5 + 21.5 (muro) + 5 (pared agrietada del pasadizo) = 48 m.
    wallSeg(f, 'bs-wall-e-n', 32, -13.25, 't2', 21.5, 6, WALL),
    wallSeg(f, 'bs-wall-e-s', 32, 13.25, 't2', 21.5, 6, WALL),
    towerAt(f, 'bs-tower-ne', 32, -24, WALL, 11),
    towerAt(f, 'bs-tower-se', 32, 24, WALL, 11),
    towerAt(f, 'bs-tower-nw', -32, -24, WALL, 11),
    towerAt(f, 'bs-tower-sw', -32, 24, WALL, 11),

    // --- Muralla interior (36 x 28, h=5): CERRADA en los 4 lados. ---
    wallSeg(f, 'bs-wall-in-n', 0, -14, 't1', 36, 5, WALL),
    // Sur: 15.5 + 15.5 (muro) + 5 (compuerta de la ciudadela) = 36 m exactos.
    wallSeg(f, 'bs-wall-in-s-l', -10.25, 14, 't1', 15.5, 5, WALL),
    wallSeg(f, 'bs-wall-in-s-r', 10.25, 14, 't1', 15.5, 5, WALL),
    wallSeg(f, 'bs-wall-in-e', 18, 0, 't2', 28, 5, WALL),
    wallSeg(f, 'bs-wall-in-w', -18, 0, 't2', 28, 5, WALL),
    towerAt(f, 'bs-tower-in-ne', 18, -14, WALL, 9),
    towerAt(f, 'bs-tower-in-se', 18, 14, WALL, 9),
    towerAt(f, 'bs-tower-in-nw', -18, -14, WALL, 9),
    towerAt(f, 'bs-tower-in-sw', -18, 14, WALL, 9),

    // --- Puentes entre los adarves de las dos murallas. ---
    struct(f, 'bs-bridge-e', 'bridge', 25, 0, 't1', [7, 0.8, 1.5], GATE, {
      altitudeOffset: 5.2,
      passableUnderground: true,
    }),
    struct(f, 'bs-bridge-s', 'bridge', 0, 19, 't2', [5, 0.8, 1.5], GATE, {
      altitudeOffset: 5.2,
      passableUnderground: true,
    }),

    // --- Reactor 1: patio de láseres con la palanca en la pasarela elevada. ---
    wallSeg(f, 'bs-reactor1-wall-n', 9, -12, 't1', 14, 4, WALL),
    wallSeg(f, 'bs-reactor1-wall-e', 16, -7, 't2', 10, 4, WALL),
    wallSeg(f, 'bs-reactor1-wall-w', 2, -7, 't2', 10, 4, WALL),
    // Sur: 4.3 + 4.3 (muro) + 5.4 (valla láser) = 14 m exactos.
    wallSeg(f, 'bs-reactor1-wall-s-l', 4.15, -2, 't1', 4.3, 4, WALL),
    wallSeg(f, 'bs-reactor1-wall-s-r', 13.85, -2, 't1', 4.3, 4, WALL),
    struct(f, 'bs-pasarela-reactor', 'bridge', 9, 2, 't1', [5, 0.8, 1.5], GATE, {
      altitudeOffset: 4.2,
      passableUnderground: true,
    }),

    // --- Reactor 2: búnker blindado (10 x 9) con su Brute. ---
    wallSeg(f, 'bs-reactor2-wall-n', -9, -10, 't1', 10, 4, WALL),
    wallSeg(f, 'bs-reactor2-wall-s', -9, -1, 't1', 10, 4, WALL),
    wallSeg(f, 'bs-reactor2-wall-w', -14, -5.5, 't2', 9, 4, WALL),
    struct(f, 'bs-bunker-blindado', 'bunker', -10.5, -7.2, null, [2.8, 3.8, 2.8], WALL),

    // --- Reactor 3: torre del reactor norte (entre las dos murallas). ---
    towerAt(f, 'bs-torre-reactor-norte', 0, -19, WALL, 12),

    // --- Búnkers decorativos del patio exterior. ---
    struct(f, 'bs-bunker-1', 'bunker', -26, 16, null, [4, 4.5, 4], WALL),
    struct(f, 'bs-bunker-2', 'bunker', 26, -16, null, [4, 4.5, 4], WALL),
  ];

  const objects: WorldObjectSpec[] = [
    // ==================== Ala Oeste ====================
    // Tarjeta Maestra extra, tras el muro agrietado de la bóveda.
    obj(planet.id, 'bs-tarjeta-maestra', 'keycard', frameDir(f, -43.5, 4)),
    breakableWall(f, 'bs-muro-boveda', -40, 4, 't2', [2, 3.4, 0.6]),
    laserGate(f, 'bs-laser-ala-oeste', -34, 0, 't2'),
    obj(planet.id, 'bs-barril-boveda', 'barrel_explosive', frameDir(f, -36.5, 4)),

    // ==================== Ciudadela Interior ====================
    // Portón principal con escáner anti-disfraz y LOCKDOWN.
    lockedGate(f, 'bs-porton-principal', 0, 24, 't1', [3, 4.5, 0.8], {
      requiresKeycard: true,
      lockdownOnAlert: true,
    }),
    obj(planet.id, 'bs-scanner-principal', 'scanner_gate', frameDir(f, 0, 27)),
    // Compuerta interior de la ciudadela, también con tarjeta y LOCKDOWN.
    lockedGate(f, 'bs-compuerta-ciudadela', 0, 14, 't1', [2.5, 4, 0.7], {
      requiresKeycard: true,
      lockdownOnAlert: true,
    }),
    obj(planet.id, 'bs-scanner-interior', 'scanner_gate', frameDir(f, 0, 17)),
    // Pasadizo secreto: pared agrietada del muro este + tubería que te
    // teletransporta directamente al Patio de Reactores.
    breakableWall(f, 'bs-muro-pasadizo', 32, 0, 't2', [2.5, 4.5, 0.7]),
    obj(planet.id, 'bs-tuberia-teleport', 'teleport_pipe', frameDir(f, 38, 0)),
    obj(planet.id, 'bs-salida-reactores', 'teleporter_exit', frameDir(f, 10, 8)),
    obj(planet.id, 'bs-barril-pasadizo-1', 'barrel_explosive', frameDir(f, 35.5, 1.5)),
    obj(planet.id, 'bs-barril-pasadizo-2', 'barrel_explosive', frameDir(f, 35.5, -1.5)),

    // ==================== 3 Reactores ====================
    // Reactor 1: patio de láseres; la palanca está en la pasarela elevada.
    obj(planet.id, 'bs-gen-1', 'generator', frameDir(f, 9, -7)),
    laserGate(f, 'bs-laser-reactor', 9, -2, 't1'),
    switchLever(f, 'bs-palanca-reactor', 9, 2, { altitudeOffset: 5.0 }),
    // Reactor 2: búnker blindado custodiado por el Brute.
    obj(planet.id, 'bs-gen-2', 'generator', frameDir(f, -7, -3)),
    // Reactor 3: torre del reactor norte (burbujas / Ancla / vuelo).
    obj(planet.id, 'bs-gen-3', 'generator', frameDir(f, 0, -19), { altitudeOffset: 11.7 }),

    // Agarrables y explosivos repartidos por la ciudadela.
    obj(planet.id, 'bs-barril-patio', 'barrel_explosive', frameDir(f, 12, 20)),
    obj(planet.id, 'bs-barril-norte', 'barrel_explosive', frameDir(f, -4, -20)),
    obj(planet.id, 'bs-roca-1', 'rock', frameDir(f, 28, 8)),
    obj(planet.id, 'bs-roca-2', 'rock', frameDir(f, -28, -8)),
    obj(planet.id, 'bs-roca-3', 'rock', [0.15, 0.95, 0.28]),
    obj(planet.id, 'bs-caja-1', 'crate', frameDir(f, 12, 8)),
    obj(planet.id, 'bs-caja-2', 'crate', frameDir(f, -12, 18)),
  ];

  const enemies: EnemySpawnSpec[] = [
    // ==================== Ala Oeste ====================
    // Comandante del Ala Oeste: porta una Tarjeta de acceso.
    {
      kind: 'officer',
      planetId: planet.id,
      patrolDirs: patrolCircle(...frameDir(f, -40, 0), 0.05, 4),
      dropsKeycard: true,
    },
    // Patrulla en pareja custodiando el patio del ala.
    {
      kind: 'guard',
      planetId: planet.id,
      patrolDirs: patrolCircle(...frameDir(f, -40, 4.5), 0.05, 4),
      pairedWithNext: true,
    },
    { kind: 'guard', planetId: planet.id, patrolDirs: patrolCircle(...frameDir(f, -40, 4.5), 0.07, 4) },
    // Vigía de la torre del ala oeste.
    lookout(planet.id, frameDir(f, -44, -8), 10.65, frameDir(f, -34, 4)),

    // ==================== Puerta principal ====================
    {
      kind: 'guard',
      planetId: planet.id,
      patrolDirs: patrolCircle(...frameDir(f, 0, 30), 0.05, 4),
      pairedWithNext: true,
    },
    { kind: 'guard', planetId: planet.id, patrolDirs: patrolCircle(...frameDir(f, 0, 30), 0.07, 4) },

    // ==================== Patio exterior ====================
    { kind: 'guard', planetId: planet.id, patrolDirs: patrolCircle(...frameDir(f, 24, 18), 0.05, 4) },
    { kind: 'guard', planetId: planet.id, patrolDirs: patrolCircle(...frameDir(f, -24, -18), 0.05, 4) },
    { kind: 'brute', planetId: planet.id, patrolDirs: patrolCircle(...frameDir(f, 20, 18), 0.06, 3) },
    { kind: 'drone', planetId: planet.id, patrolDirs: patrolCircle(...frameDir(f, 24, 8), 0.08, 4) },
    { kind: 'drone', planetId: planet.id, patrolDirs: patrolCircle(...frameDir(f, -24, -8), 0.08, 4) },

    // ==================== Torre del Reactor Norte ====================
    { kind: 'drone', planetId: planet.id, patrolDirs: patrolCircle(...frameDir(f, -10, -19), 0.07, 4) },
    { kind: 'drone', planetId: planet.id, patrolDirs: patrolCircle(...frameDir(f, 5, -19), 0.09, 4) },
    { kind: 'turret', planetId: planet.id, patrolDirs: [frameDir(f, 26, -20)] },
    // Vigías de las torres de la muralla norte oteando el patio.
    lookout(planet.id, frameDir(f, 32, -24), 10.65, frameDir(f, 0, -4)),
    lookout(planet.id, frameDir(f, -32, -24), 10.65, frameDir(f, 0, -4)),

    // ==================== Ciudadela interior ====================
    // Oficial de la compuerta interior (delata disfraces).
    { kind: 'officer', planetId: planet.id, patrolDirs: patrolCircle(...frameDir(f, 0, 18), 0.04, 4) },
    { kind: 'guard', planetId: planet.id, patrolDirs: patrolCircle(...frameDir(f, 8, 8), 0.05, 4) },
    { kind: 'guard', planetId: planet.id, patrolDirs: patrolCircle(...frameDir(f, -8, 8), 0.05, 4) },
    // Brute del búnker blindado del reactor 2.
    { kind: 'brute', planetId: planet.id, patrolDirs: patrolCircle(...frameDir(f, -8, -5), 0.05, 3) },
    // Guardia del patio de láseres del reactor 1.
    { kind: 'guard', planetId: planet.id, patrolDirs: patrolCircle(...frameDir(f, 12.5, -10), 0.035, 4) },
    // Vigías de las torres interiores.
    lookout(planet.id, frameDir(f, 18, -14), 8.65, frameDir(f, 0, -2)),
    lookout(planet.id, frameDir(f, -18, -14), 8.65, frameDir(f, 0, -2)),
  ];

  // Burbujas: pasarela del reactor 1 y cadena hasta la torre del reactor 3.
  const bubbles: WaterBubbleSpec[] = [
    orbitBubble('bs-bub-pasarela', planet, frameDir(f, 9, 6), 2.5, 6),
    orbitBubble('bs-bub-n1', planet, frameDir(f, 7, -17), 5, 8),
    orbitBubble('bs-bub-n2', planet, frameDir(f, 3.5, -18.5), 9.5, 7.5),
  ];

  // --- Ambientación mecánica: tuberías, antenas, reactores y focos. ---
  const props: PropSpec[] = [
    prop(planet.id, 'bs-tuberia-teleport', 'pipe', frameDir(f, 38, 2), { yaw: 0.3 }),
    prop(planet.id, 'bs-tuberia-2', 'pipe', frameDir(f, -40, 0), { yaw: -0.8 }),
    prop(planet.id, 'bs-tuberia-3', 'pipe', frameDir(f, 12, 26), { yaw: 1.6 }),
    prop(planet.id, 'bs-tuberia-4', 'pipe', frameDir(f, -12, -26), { yaw: 2.4 }),
    prop(planet.id, 'bs-tuberia-5', 'pipe', frameDir(f, 36, -12)),
    prop(planet.id, 'bs-tuberia-6', 'pipe', frameDir(f, -36, 12)),
    prop(planet.id, 'bs-antena-1', 'antenna', frameDir(f, 30, -26)),
    prop(planet.id, 'bs-antena-2', 'antenna', frameDir(f, -30, 26)),
    prop(planet.id, 'bs-antena-3', 'antenna', frameDir(f, 20, 30)),
    prop(planet.id, 'bs-antena-4', 'antenna', [0.15, 0.9, 0.25]),
    prop(planet.id, 'bs-reactor-prop-1', 'reactor', frameDir(f, 28, -6)),
    prop(planet.id, 'bs-reactor-prop-2', 'reactor', frameDir(f, -28, 6)),
    prop(planet.id, 'bs-reactor-prop-3', 'reactor', frameDir(f, 0, -30)),
    prop(planet.id, 'bs-reactor-prop-4', 'reactor', [0.5, 0.75, -0.3]),
    prop(planet.id, 'bs-foco-1', 'spotlight', frameDir(f, 0, 29)),
    prop(planet.id, 'bs-foco-2', 'spotlight', frameDir(f, 20, -22)),
    prop(planet.id, 'bs-foco-3', 'spotlight', frameDir(f, -20, 22)),
    prop(planet.id, 'bs-foco-4', 'spotlight', frameDir(f, -8, -28)),
    prop(planet.id, 'bs-foco-5', 'spotlight', [0.35, 0.8, 0.45]),
  ];

  const npcs: NpcSpec[] = [
    {
      id: 'zero7',
      name: 'Zero-7',
      role: 'Hacker de la Resistencia',
      planetId: planet.id,
      sphericalDir: frameDir(f, 9, 32),
      yaw: yawFace(
        f,
        9,
        32,
        new THREE.Vector3().addScaledVector(f.t1, -9).addScaledVector(f.t2, -8).normalize()
      ),
      accentColor: '#a78bfa',
      dialogue: [
        '¡Cuidado con los escáneres de la puerta principal: queman cualquier disfraz y cierran las compuertas! Roba la Tarjeta Maestra al Comandante del Ala Oeste o vuela el muro agrietado para colarte por la tubería de mantenimiento.',
        'La bóveda del Ala Oeste esconde una tarjeta extra tras su muro agrietado. Un barril bien colocado y listo.',
        'El pasadizo de la tubería te deja en pleno Patio de Reactores... si encuentras el muro agrietado del flanco este.',
      ],
    },
  ];

  return { structures, objects, enemies, bubbles, props, npcs };
}

// ----------------------------------------------------------------------------
// Planeta 4 — Trono de KRONOS: NÚCLEO CARMESÍ (r = 106).
// Arena épica con 6 pilares de cobertura, 2 plataformas laterales elevadas
// con barriles, rocas para Estasis bien repartidas y 2 burbujas de agua en
// órbita para flanquear por el aire al Comandante KRONOS.
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
    // 6 pilares de cobertura repartidos por la arena.
    struct(f, 'kr-pillar-1', 'pillar', 14, 10, null, [1.4, 4.5, 1.4], PILLAR),
    struct(f, 'kr-pillar-2', 'pillar', -14, 10, null, [1.4, 4.5, 1.4], PILLAR),
    struct(f, 'kr-pillar-3', 'pillar', 14, -10, null, [1.4, 4.5, 1.4], PILLAR),
    struct(f, 'kr-pillar-4', 'pillar', -14, -10, null, [1.4, 4.5, 1.4], PILLAR),
    struct(f, 'kr-pillar-5', 'pillar', 0, 18, null, [1.4, 4.5, 1.4], PILLAR),
    struct(f, 'kr-pillar-6', 'pillar', 0, -18, null, [1.4, 4.5, 1.4], PILLAR),
    // 2 plataformas laterales elevadas con barriles explosivos.
    struct(f, 'kr-platform-e', 'platform', 26, 0, null, [5, 1.1, 5], PLATFORM, {
      altitudeOffset: 7,
    }),
    struct(f, 'kr-platform-w', 'platform', -26, 0, null, [5, 1.1, 5], PLATFORM, {
      altitudeOffset: 7,
    }),
  ];

  const objects: WorldObjectSpec[] = [
    // Barriles: 4 cuadrantes de la arena + uno sobre cada plataforma.
    obj(planet.id, 'kr-barril-1', 'barrel_explosive', frameDir(f, 10, 4)),
    obj(planet.id, 'kr-barril-2', 'barrel_explosive', frameDir(f, -10, -4)),
    obj(planet.id, 'kr-barril-3', 'barrel_explosive', frameDir(f, 18, -12)),
    obj(planet.id, 'kr-barril-4', 'barrel_explosive', frameDir(f, -18, 12)),
    obj(planet.id, 'kr-barril-5', 'barrel_explosive', frameDir(f, 26, 0), { altitudeOffset: 7 }),
    obj(planet.id, 'kr-barril-6', 'barrel_explosive', frameDir(f, -26, 0), { altitudeOffset: 7 }),
    // Rocas para Estasis intercaladas con los barriles.
    obj(planet.id, 'kr-roca-1', 'rock', frameDir(f, 8, -12)),
    obj(planet.id, 'kr-roca-2', 'rock', frameDir(f, -8, 12)),
    obj(planet.id, 'kr-roca-3', 'rock', frameDir(f, 22, 6)),
    obj(planet.id, 'kr-roca-4', 'rock', frameDir(f, -22, -6)),
    obj(planet.id, 'kr-roca-5', 'rock', frameDir(f, 0, 24)),
    obj(planet.id, 'kr-roca-6', 'rock', frameDir(f, 0, -24)),
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
// GALAXY_SPEC: contrato principal de la Fase C
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
  waterBubbles: [...verdant.bubbles, ...cryo.bubbles, ...bastion.bubbles, ...kronos.bubbles],
  grassZones: [...luna.grass, ...verdant.grass],
  props: [...verdant.props, ...cryo.props, ...bastion.props],
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
  npcs: [...luna.npcs, ...verdant.npcs, ...cryo.npcs, ...bastion.npcs],
  spawnPlanetId: 'luna-tutorial',
  spawnDir: [0.25, 0.85, 0.45],
};
