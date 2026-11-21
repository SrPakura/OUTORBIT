import * as THREE from 'three';
import type {
  EnemySkin,
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
  lookAtDir?: [number, number, number],
  skin?: EnemySkin
): EnemySpawnSpec {
  return {
    kind: 'guard',
    skin,
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
  options: { yaw?: number; scale?: number; altitudeOffset?: number } = {}
): PropSpec {
  return {
    id,
    kind,
    planetId,
    sphericalDir: dir,
    yaw: options.yaw,
    scale: options.scale,
    altitudeOffset: options.altitudeOffset,
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
 * Interpolación esférica (slerp) entre dos direcciones de superficie: sirve
 * para encadenar lagunas de agua a lo largo del sendero entre dos zonas.
 */
function midDir(
  a: [number, number, number],
  b: [number, number, number],
  t: number
): [number, number, number] {
  const va = vec(a);
  const vb = vec(b);
  const dot = THREE.MathUtils.clamp(va.dot(vb), -1, 1);
  const ang = Math.acos(dot);
  if (ang < 1e-6) return [va.x, va.y, va.z];
  const s = Math.sin(ang);
  const d = new THREE.Vector3()
    .addScaledVector(va, Math.sin((1 - t) * ang) / s)
    .addScaledVector(vb, Math.sin(t * ang) / s)
    .normalize();
  return [d.x, d.y, d.z];
}

/**
 * Tangente del geodésico que va de `a` hacia `b` (dirección de marcha sobre
 * la superficie): sirve para orientar puentes y senderos entre dos zonas.
 */
function geodesicTangent(
  a: [number, number, number],
  b: [number, number, number]
): THREE.Vector3 {
  const va = vec(a);
  const vb = vec(b);
  return new THREE.Vector3().copy(vb).addScaledVector(va, -vb.dot(va)).normalize();
}

/** Yaw que orienta el +Z local de un objeto en `dir` hacia el tangente `along`. */
function yawFaceDir(dir: [number, number, number], along: THREE.Vector3): number {
  _q.setFromUnitVectors(_up, vec(dir)).invert();
  _v.copy(along).applyQuaternion(_q);
  return Math.atan2(_v.x, _v.z);
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
    subtitle: 'Selva Tropical · Templos de Jade',
    biome: 'verdant',
    center: [300, 40, -150],
    radius: 135,
    gravityStrength: 1.1,
    surfaceColor: '#22c55e',
    patchColor: '#15803d',
    atmosphereColor: '#bbf7d0',
    unlockedByPlanetId: 'luna-tutorial',
  },
  {
    id: 'cryo-glaciar',
    order: 2,
    name: 'Kurogane',
    subtitle: 'Shogunato Feudal Nevado · Castillo y Aldea',
    biome: 'cryo',
    center: [-160, 125, -450],
    radius: 145,
    gravityStrength: 0.95,
    surfaceColor: '#e0f2fe',
    patchColor: '#93c5fd',
    atmosphereColor: '#e0f2fe',
    hasWaterShell: true,
    waterRadius: 146.5,
    hasIcePatches: true,
    unlockedByPlanetId: 'verdant-pradera',
  },
  {
    id: 'bastion-fortaleza',
    order: 3,
    name: 'Neon Bastion',
    subtitle: 'Metrópolis Cyberpunk · Ciudadela de Reactores',
    biome: 'bastion',
    center: [195, -90, -780],
    radius: 156,
    gravityStrength: 1.15,
    surfaceColor: '#0f172a',
    patchColor: '#1e1b4b',
    atmosphereColor: '#ec4899',
    hasOrbitalRings: true,
    ringColor: '#22d3ee',
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
// Planeta 1 — Verdant: SELVA TROPICAL · TEMPLOS DE JADE (r = 135).
// Selva densa y viva con 3 zonas interconectadas por senderos de hierba alta,
// lagunas de agua conectadas cruzadas por puentes de madera y arcos de liana:
// (1) Campamento del Botánico y Valle de Palmeras (spawn, Dr. Solís),
// (2) Ruinas del Altar Oeste: generador 1 tras su valla láser y el Alfa
//     pantera que porta el Ídolo-Llave del Gran Zigurat,
// (3) El Gran Zigurat: templo escalonado CERRADO con portón de llave, muro
//     trasero agrietado cubierto de musgo, monos vigía en las torres, gorila
//     lomo plateado, avispas gigantes y terraza superior por burbujas (Axel).
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
  const WALL = '#57534e'; // piedra musgosa de las ruinas
  const WALL_DARK = '#44403c';

  // ==================== Zona 1: Campamento del Botánico ====================
  const fV = baseFrame(planet.id, [0.05, 0.3, 0.95], planet.radius);

  // ==================== Zona 2: Ruinas del Altar Oeste ====================
  const fR = baseFrame(planet.id, [0.68, 0.42, 0.42], planet.radius);

  // ==================== Zona 3: El Gran Zigurat ====================
  const fA = baseFrame(planet.id, [0.35, 0.8, 0.42], planet.radius);

  const structures: StructureSpec[] = [
    // --- Zona 2: Ruina del Altar Oeste (16 x 12, h=4): CERRADA en los 4
    // lados; la valla láser sur es la entrada (Digger la cruza por debajo).
    wallSeg(fR, 'vd-ruina-wall-n', 0, -6, 't1', 16, 4, WALL),
    // Sur: 5.3 + 5.3 (muro) + 5.4 (valla láser) = 16 m exactos.
    wallSeg(fR, 'vd-ruina-wall-s-l', -5.35, 6, 't1', 5.3, 4, WALL),
    wallSeg(fR, 'vd-ruina-wall-s-r', 5.35, 6, 't1', 5.3, 4, WALL),
    wallSeg(fR, 'vd-ruina-wall-e', 8, 0, 't2', 12, 4, WALL),
    wallSeg(fR, 'vd-ruina-wall-w', -8, 0, 't2', 12, 4, WALL),
    towerAt(fR, 'vd-ruina-torre-e', 8, -6, WALL, 7),
    towerAt(fR, 'vd-ruina-torre-w', -8, -6, WALL, 7),
    // Plataforma lateral que sostiene la palanca de la valla láser.
    struct(fR, 'vd-ruina-plataforma', 'platform', 12, 0, null, [3, 1, 3], WALL_DARK, {
      altitudeOffset: 3,
    }),

    // --- Zona 3: Gran Zigurat, recinto exterior (40 x 30, h=5): CERRADO. ---
    // Norte: 17 + 17 (muro) + 6 (pared agrietada) = 40 m exactos.
    wallSeg(fA, 'vd-zig-wall-n-l', -11.5, -15, 't1', 17, 5, WALL),
    wallSeg(fA, 'vd-zig-wall-n-r', 11.5, -15, 't1', 17, 5, WALL),
    // Sur: 17 + 17 (muro) + 6 (portón de llave) = 40 m exactos.
    wallSeg(fA, 'vd-zig-wall-s-l', -11.5, 15, 't1', 17, 5, WALL),
    wallSeg(fA, 'vd-zig-wall-s-r', 11.5, 15, 't1', 17, 5, WALL),
    wallSeg(fA, 'vd-zig-wall-e', 20, 0, 't2', 30, 5, WALL),
    wallSeg(fA, 'vd-zig-wall-w', -20, 0, 't2', 30, 5, WALL),
    // Torres de piedra flanqueando el portón: los monos vigía las ocupan.
    towerAt(fA, 'vd-zig-tower-ne', 20, -15, WALL, 8),
    towerAt(fA, 'vd-zig-tower-se', 20, 15, WALL, 8),
    towerAt(fA, 'vd-zig-tower-nw', -20, -15, WALL, 8),
    towerAt(fA, 'vd-zig-tower-sw', -20, 15, WALL, 8),

    // --- Zona 3: santuario interior escalonado (20 x 14, h=4): CERRADO. ---
    wallSeg(fA, 'vd-zig-wall-in-n', 0, -7, 't1', 20, 4, WALL),
    // Sur interior: 7.5 + 7.5 (muro) + 5 (compuerta) = 20 m exactos.
    wallSeg(fA, 'vd-zig-wall-in-s-l', -6.25, 7, 't1', 7.5, 4, WALL),
    wallSeg(fA, 'vd-zig-wall-in-s-r', 6.25, 7, 't1', 7.5, 4, WALL),
    wallSeg(fA, 'vd-zig-wall-in-e', 10, 0, 't2', 14, 4, WALL),
    wallSeg(fA, 'vd-zig-wall-in-w', -10, 0, 't2', 14, 4, WALL),

    // --- Nivel 2 del Zigurat: terraza superior flotante (cadena de
    // burbujas para Axel) sobre el santuario escalonado. ---
    struct(fA, 'vd-zig-terraza', 'platform', 0, 0, null, [6, 1, 6], WALL_DARK, {
      altitudeOffset: 9,
    }),
  ];

  const objects: WorldObjectSpec[] = [
    // ==================== Zona 2: Ruinas del Altar Oeste ====================
    // Generador 1 dentro de la ruina, tras la valla láser.
    obj(planet.id, 'vd-gen-1', 'generator', frameDir(fR, 0, -2)),
    laserGate(fR, 'vd-ruina-laser', 0, 6, 't1'),
    // Palanca sobre la plataforma lateral (apaga la valla láser).
    switchLever(fR, 'vd-ruina-palanca', 12, 0, { altitudeOffset: 4.0 }),

    // ==================== Zona 3: El Gran Zigurat ====================
    // Portón frontal: se abre con el Ídolo-Llave del Alfa de la Ruina Oeste.
    lockedGate(fA, 'vd-zig-porton', 0, 15, 't1', [3, 4.2, 0.7], {
      requiresKeycard: true,
    }),
    // Muro trasero agrietado cubierto de musgo (barriles justo detrás).
    breakableWall(fA, 'vd-zig-muro-norte', 0, -15, 't1', [3, 4.5, 0.7]),
    // Compuerta interior con LOCKDOWN + palanca lateral del patio.
    lockedGate(fA, 'vd-zig-puerta-interior', 0, 7, 't1', [2.5, 3.8, 0.6], {
      lockdownOnAlert: true,
    }),
    switchLever(fA, 'vd-zig-palanca-interior', 15, 11, {
      linkedGateId: 'vd-zig-puerta-interior',
    }),
    // Generadores 2 y 3 dentro del santuario escalonado.
    obj(planet.id, 'vd-gen-2', 'generator', frameDir(fA, 4, 2)),
    obj(planet.id, 'vd-gen-3', 'generator', frameDir(fA, -4, -2)),

    // Barriles explosivos junto al muro agrietado trasero del Zigurat.
    obj(planet.id, 'vd-barril-zig-1', 'barrel_explosive', frameDir(fA, 0, -19)),
    obj(planet.id, 'vd-barril-zig-2', 'barrel_explosive', frameDir(fA, -3.5, -19)),
    obj(planet.id, 'vd-barril-zig-3', 'barrel_explosive', frameDir(fA, 3.5, -19)),
    // Barril de emboscada junto a la entrada de la Ruina Oeste (el Alfa).
    obj(planet.id, 'vd-barril-ruina', 'barrel_explosive', frameDir(fR, 4, 14)),
    // Rocas de Estasis y cajas repartidas por la selva.
    obj(planet.id, 'vd-roca-camp-1', 'rock', frameDir(fV, 8, -16)),
    obj(planet.id, 'vd-roca-camp-2', 'rock', frameDir(fV, -8, -16)),
    obj(planet.id, 'vd-roca-ruina', 'rock', frameDir(fR, 10, 12)),
    obj(planet.id, 'vd-roca-zig-1', 'rock', frameDir(fA, 16, 13)),
    obj(planet.id, 'vd-roca-zig-2', 'rock', frameDir(fA, -16, 13)),
    obj(planet.id, 'vd-roca-1', 'rock', [0.3, 0.88, 0.35]),
    obj(planet.id, 'vd-roca-2', 'rock', [-0.2, 0.95, 0.25]),
    obj(planet.id, 'vd-caja-camp', 'crate', frameDir(fV, 2, -6)),
    obj(planet.id, 'vd-caja-zig', 'crate', frameDir(fA, 10, 10)),
    obj(planet.id, 'vd-caja-1', 'crate', [0.1, 0.9, 0.4]),
  ];

  const enemies: EnemySpawnSpec[] = [
    // ==================== Valle de Palmeras: panteras entre los helechos ====
    { kind: 'guard', skin: 'panther', planetId: planet.id, patrolDirs: patrolCircle(0.15, 0.9, 0.35, 0.08, 4) },
    { kind: 'guard', skin: 'panther', planetId: planet.id, patrolDirs: patrolCircle(0.05, 0.72, 0.62, 0.08, 4) },

    // ==================== Zona 2: Ruinas del Altar Oeste ====================
    // Pantera patrullando el interior de la ruina (generador 1).
    { kind: 'guard', skin: 'panther', planetId: planet.id, patrolDirs: patrolCircle(...frameDir(fR, 0, 0), 0.03, 4) },
    // Oficial Alfa de la Ruina: custodia la entrada y porta el Ídolo-Llave.
    { kind: 'officer', skin: 'panther', planetId: planet.id, patrolDirs: patrolCircle(...frameDir(fR, 0, 10), 0.05, 4), dropsKeycard: true },

    // ==================== Zona 3: El Gran Zigurat ====================
    // Monos vigía en las torres frontales, barriendo el patio con la mirada.
    lookout(planet.id, frameDir(fA, 20, 15), 7.6, frameDir(fA, 0, 0), 'monkey'),
    lookout(planet.id, frameDir(fA, -20, 15), 7.6, frameDir(fA, 0, 0), 'monkey'),
    // Gorila lomo plateado custodiando el patio del Zigurat.
    { kind: 'brute', skin: 'gorilla', planetId: planet.id, patrolDirs: patrolCircle(...frameDir(fA, 0, 11), 0.05, 3) },
    // Avispas gigantes patrullando los alrededores del templo.
    { kind: 'drone', skin: 'wasp', planetId: planet.id, patrolDirs: patrolCircle(...frameDir(fA, 24, 0), 0.07, 4) },
    { kind: 'drone', skin: 'wasp', planetId: planet.id, patrolDirs: patrolCircle(...frameDir(fA, -24, 0), 0.07, 4) },
    // Panteras del patio exterior del Zigurat.
    { kind: 'guard', skin: 'panther', planetId: planet.id, patrolDirs: patrolCircle(...frameDir(fA, 12, 11), 0.05, 4) },
    { kind: 'guard', skin: 'panther', planetId: planet.id, patrolDirs: patrolCircle(...frameDir(fA, -12, 11), 0.05, 4) },
  ];

  const grass: GrassZoneSpec[] = [
    // Zona 1: parches amplios de hierba alta para ocultarse como un ninja.
    { id: 'vd-jungla-spawn', planetId: planet.id, sphericalDir: frameDir(fV, 0, -26), angularRadius: 0.22 },
    { id: 'vd-jungla-valle-e', planetId: planet.id, sphericalDir: frameDir(fV, 16, 6), angularRadius: 0.2 },
    { id: 'vd-jungla-valle-o', planetId: planet.id, sphericalDir: frameDir(fV, -16, 6), angularRadius: 0.2 },
    // Valle intermedio entre zonas (las panteras cazan aquí).
    { id: 'vd-jungla-mid', planetId: planet.id, sphericalDir: [0.05, 0.72, 0.62], angularRadius: 0.18 },
    // Zona 2: aproximación sigilosa a la entrada de las ruinas.
    { id: 'vd-jungla-ruinas', planetId: planet.id, sphericalDir: frameDir(fR, 0, 14), angularRadius: 0.2 },
    // Zona 3: cobertura frente al portón y en el flanco oeste del Zigurat.
    { id: 'vd-jungla-zig-frente', planetId: planet.id, sphericalDir: frameDir(fA, 0, 22), angularRadius: 0.2 },
    { id: 'vd-jungla-zig-oeste', planetId: planet.id, sphericalDir: frameDir(fA, -26, 0), angularRadius: 0.18 },
  ];

  // Lagunas de agua conectadas entre zonas (el agua rodea los templos, nunca
  // los inunda) + cadena de burbujas hasta la terraza superior (Axel).
  const lagR = (t: number) => midDir([0.05, 0.3, 0.95], [0.68, 0.42, 0.42], t);
  const lagZ = (t: number) => midDir([0.05, 0.3, 0.95], [0.35, 0.8, 0.42], t);
  const bubbles: WaterBubbleSpec[] = [
    // Sendero del campamento a las Ruinas del Altar Oeste.
    orbitBubble('vd-laguna-r-1', planet, lagR(0.4), 2, 10),
    orbitBubble('vd-laguna-r-2', planet, lagR(0.5), 2, 10),
    orbitBubble('vd-laguna-r-3', planet, lagR(0.6), 2, 9),
    // Sendero del campamento al Gran Zigurat.
    orbitBubble('vd-laguna-z-1', planet, lagZ(0.4), 2, 10),
    orbitBubble('vd-laguna-z-2', planet, lagZ(0.5), 2, 10),
    orbitBubble('vd-laguna-z-3', planet, lagZ(0.6), 2, 9),
    // Cadena de burbujas hasta la terraza superior del Zigurat.
    orbitBubble('vd-bub-z1', planet, frameDir(fA, 24, -8), 5, 8),
    orbitBubble('vd-bub-z2', planet, frameDir(fA, 26, -2), 9, 7.5),
    orbitBubble('vd-bub-z3', planet, frameDir(fA, 14, 0), 12, 7),
    // Burbuja del campamento, junto a la tienda del botánico.
    orbitBubble('vd-bub-camp', planet, frameDir(fV, 16, 14), 5, 7),
  ];

  // --- Densidad visual de la selva: palmeras, helechos, tótems, arcos de
  // liana, puentes de madera sobre las lagunas y senderos de piedra. ---
  const toRuinas = geodesicTangent([0.05, 0.3, 0.95], [0.68, 0.42, 0.42]);
  const toZigurat = geodesicTangent([0.05, 0.3, 0.95], [0.35, 0.8, 0.42]);
  const props: PropSpec[] = [
    // ==================== Zona 1: Campamento del Botánico ====================
    // Arcos de liana flanqueando el sendero del valle.
    prop(planet.id, 'vd-arco-liana-1', 'vine_arch', frameDir(fV, 0, -16)),
    prop(planet.id, 'vd-arco-liana-2', 'vine_arch', frameDir(fV, 0, 4)),
    // Palmeras del valle a ambos lados del sendero.
    prop(planet.id, 'vd-palma-1', 'palm_tree', frameDir(fV, 6, -20), { scale: 1.3 }),
    prop(planet.id, 'vd-palma-2', 'palm_tree', frameDir(fV, -6, -20), { scale: 1.3 }),
    prop(planet.id, 'vd-palma-3', 'palm_tree', frameDir(fV, 7, -10), { scale: 1.2 }),
    prop(planet.id, 'vd-palma-4', 'palm_tree', frameDir(fV, -7, -10), { scale: 1.2 }),
    prop(planet.id, 'vd-palma-5', 'palm_tree', frameDir(fV, 8, 0), { scale: 1.25 }),
    prop(planet.id, 'vd-palma-6', 'palm_tree', frameDir(fV, -8, 0), { scale: 1.25 }),
    prop(planet.id, 'vd-palma-7', 'palm_tree', frameDir(fV, 7, 10), { scale: 1.2 }),
    prop(planet.id, 'vd-palma-8', 'palm_tree', frameDir(fV, -7, 10), { scale: 1.2 }),
    prop(planet.id, 'vd-palma-9', 'palm_tree', frameDir(fV, 6, 20), { scale: 1.3 }),
    prop(planet.id, 'vd-palma-10', 'palm_tree', frameDir(fV, -6, 20), { scale: 1.3 }),
    prop(planet.id, 'vd-palma-11', 'palm_tree', frameDir(fV, 12, -6), { scale: 1.4 }),
    prop(planet.id, 'vd-palma-12', 'palm_tree', frameDir(fV, -12, -6), { scale: 1.4 }),
    prop(planet.id, 'vd-palma-13', 'palm_tree', frameDir(fV, 13, 12), { scale: 1.35 }),
    prop(planet.id, 'vd-palma-14', 'palm_tree', frameDir(fV, -13, 12), { scale: 1.35 }),
    // Helechos exóticos entre las palmeras.
    prop(planet.id, 'vd-helecho-1', 'fern_cluster', frameDir(fV, 3, -14)),
    prop(planet.id, 'vd-helecho-2', 'fern_cluster', frameDir(fV, -3, -14)),
    prop(planet.id, 'vd-helecho-3', 'fern_cluster', frameDir(fV, 4, -4)),
    prop(planet.id, 'vd-helecho-4', 'fern_cluster', frameDir(fV, -4, -4)),
    prop(planet.id, 'vd-helecho-5', 'fern_cluster', frameDir(fV, 3.5, 8)),
    prop(planet.id, 'vd-helecho-6', 'fern_cluster', frameDir(fV, -3.5, 8)),
    prop(planet.id, 'vd-helecho-7', 'fern_cluster', frameDir(fV, 10, 4)),
    prop(planet.id, 'vd-helecho-8', 'fern_cluster', frameDir(fV, -10, -12)),
    // Tótems antiguos velando el sendero del campamento.
    prop(planet.id, 'vd-totem-1', 'ancient_statue', frameDir(fV, 5, -2)),
    prop(planet.id, 'vd-totem-2', 'ancient_statue', frameDir(fV, -5, -2)),
    // Sendero de piedra del campamento.
    prop(planet.id, 'vd-sendero-1', 'stone_path', frameDir(fV, 0, -8)),
    prop(planet.id, 'vd-sendero-2', 'stone_path', frameDir(fV, 0, 8)),

    // ==================== Zona 2: Ruinas del Altar Oeste ====================
    prop(planet.id, 'vd-ruina-arco', 'vine_arch', frameDir(fR, 0, 12)),
    prop(planet.id, 'vd-ruina-palma-1', 'palm_tree', frameDir(fR, 10, 8), { scale: 1.3 }),
    prop(planet.id, 'vd-ruina-palma-2', 'palm_tree', frameDir(fR, -10, 8), { scale: 1.3 }),
    prop(planet.id, 'vd-ruina-palma-3', 'palm_tree', frameDir(fR, 12, -4), { scale: 1.25 }),
    prop(planet.id, 'vd-ruina-palma-4', 'palm_tree', frameDir(fR, -12, -4), { scale: 1.25 }),
    prop(planet.id, 'vd-ruina-helecho-1', 'fern_cluster', frameDir(fR, 4, 10)),
    prop(planet.id, 'vd-ruina-helecho-2', 'fern_cluster', frameDir(fR, -4, 10)),
    prop(planet.id, 'vd-ruina-helecho-3', 'fern_cluster', frameDir(fR, 11, 2)),
    prop(planet.id, 'vd-ruina-helecho-4', 'fern_cluster', frameDir(fR, -11, 2)),
    prop(planet.id, 'vd-ruina-helecho-5', 'fern_cluster', frameDir(fR, 2, -4)),
    prop(planet.id, 'vd-ruina-helecho-6', 'fern_cluster', frameDir(fR, -2, -4)),
    prop(planet.id, 'vd-ruina-totem-1', 'ancient_statue', frameDir(fR, 5, -4)),
    prop(planet.id, 'vd-ruina-totem-2', 'ancient_statue', frameDir(fR, -5, -4)),

    // ==================== Zona 3: El Gran Zigurat ====================
    prop(planet.id, 'vd-zig-arco-1', 'vine_arch', frameDir(fA, 0, 20)),
    prop(planet.id, 'vd-zig-arco-2', 'vine_arch', frameDir(fA, 0, -20)),
    prop(planet.id, 'vd-zig-palma-1', 'palm_tree', frameDir(fA, 24, 10), { scale: 1.4 }),
    prop(planet.id, 'vd-zig-palma-2', 'palm_tree', frameDir(fA, -24, 10), { scale: 1.4 }),
    prop(planet.id, 'vd-zig-palma-3', 'palm_tree', frameDir(fA, 26, -6), { scale: 1.3 }),
    prop(planet.id, 'vd-zig-palma-4', 'palm_tree', frameDir(fA, -26, -6), { scale: 1.3 }),
    prop(planet.id, 'vd-zig-palma-5', 'palm_tree', frameDir(fA, 16, 18), { scale: 1.3 }),
    prop(planet.id, 'vd-zig-palma-6', 'palm_tree', frameDir(fA, -16, 18), { scale: 1.3 }),
    prop(planet.id, 'vd-zig-helecho-1', 'fern_cluster', frameDir(fA, 6, 12)),
    prop(planet.id, 'vd-zig-helecho-2', 'fern_cluster', frameDir(fA, -6, 12)),
    prop(planet.id, 'vd-zig-helecho-3', 'fern_cluster', frameDir(fA, 14, 4)),
    prop(planet.id, 'vd-zig-helecho-4', 'fern_cluster', frameDir(fA, -14, 4)),
    prop(planet.id, 'vd-zig-helecho-5', 'fern_cluster', frameDir(fA, 4, -12)),
    prop(planet.id, 'vd-zig-helecho-6', 'fern_cluster', frameDir(fA, -4, -12)),
    // Helechos que esconden el muro agrietado trasero.
    prop(planet.id, 'vd-zig-helecho-7', 'fern_cluster', frameDir(fA, 3, -18)),
    prop(planet.id, 'vd-zig-helecho-8', 'fern_cluster', frameDir(fA, -3, -18)),
    // Tótems flanqueando la compuerta interior y el patio.
    prop(planet.id, 'vd-zig-totem-1', 'ancient_statue', frameDir(fA, 8, 11)),
    prop(planet.id, 'vd-zig-totem-2', 'ancient_statue', frameDir(fA, -8, 11)),
    prop(planet.id, 'vd-zig-totem-3', 'ancient_statue', frameDir(fA, 0, -11)),

    // ==================== Puentes de madera sobre las lagunas ====================
    prop(planet.id, 'vd-puente-laguna-r', 'wood_bridge', lagR(0.5), {
      yaw: yawFaceDir(lagR(0.5), toRuinas),
    }),
    prop(planet.id, 'vd-puente-laguna-z', 'wood_bridge', lagZ(0.5), {
      yaw: yawFaceDir(lagZ(0.5), toZigurat),
    }),

    // ==================== Selva dispersa alrededor del planeta ====================
    prop(planet.id, 'vd-palma-libre-1', 'palm_tree', [0.3, 0.6, 0.5], { scale: 1.5 }),
    prop(planet.id, 'vd-palma-libre-2', 'palm_tree', [-0.1, 0.5, 0.8], { scale: 1.5 }),
    prop(planet.id, 'vd-palma-libre-3', 'palm_tree', [0.7, 0.4, 0.2], { scale: 1.4 }),
    prop(planet.id, 'vd-palma-libre-4', 'palm_tree', [-0.5, 0.2, 0.7], { scale: 1.4 }),
    prop(planet.id, 'vd-helecho-libre-1', 'fern_cluster', [0.2, 0.15, 0.9]),
    prop(planet.id, 'vd-helecho-libre-2', 'fern_cluster', [-0.8, 0.5, -0.2]),
    prop(planet.id, 'vd-totem-libre', 'ancient_statue', [0.6, 0.55, 0.55]),
    prop(planet.id, 'vd-arco-libre', 'vine_arch', [0.45, 0.75, 0.5]),
  ];

  const npcs: NpcSpec[] = [
    {
      id: 'solis',
      name: 'Dr. Solís',
      role: 'Botánico',
      planetId: planet.id,
      sphericalDir: frameDir(fV, 0, -12),
      yaw: yawFace(fV, 0, -12, fV.t2),
      accentColor: '#4ade80',
      dialogue: [
        '¡Cuidado con las panteras entre los helechos! Para abrir el Gran Zigurat necesitas el Ídolo-Llave del Alfa de la Ruina Oeste, o volar el muro agrietado cubierto de musgo por la espalda.',
        'La hierba alta de la selva es tu aliada: dentro de ella los vigías del templo pierden tu rastro... salvo a quemarropa. Noquea por la espalda con [E] y quédate el disfraz.',
        'El Altar Oeste guarda su generador tras una valla láser: la palanca está en la plataforma lateral, o cava por debajo con Digger. Y Axel puede subir a la terraza del Zigurat siguiendo las burbujas sobre la laguna.',
      ],
    },
  ];

  return { structures, objects, enemies, grass, bubbles, props, npcs };
}

// ----------------------------------------------------------------------------
// Planeta 2 — Kurogane: SHOGUNATO FEUDAL NEVADO · CASTILLO Y ALDEA (r = 145).
// Planeta nevado con Aldea Feudal densa (casas, pagodas, torii, farolillos y
// cerezos nevados) y 3 zonas interconectadas:
// (1) Aldea Feudal + Dojo: recinto con valla láser y palanca tras la casa
//     lateral; el Capitán Samurái (sashimono dorado) porta la llave maestra,
// (2) Castillo del Shogun de Hielo: doble recinto CERRado (portón de llave,
//     muro trasero agrietado, vigías samurái en torres y un Oni con kanabo)
//     con Santuario Interior con LOCKDOWN + palanca lateral + segunda pared
//     rompible para Digger,
// (3) Santuario Flotante en Órbita a 22 m: plataforma con Torii y farolillos
//     vigilada por un vigía, alcanzada desde la torre norte con 3 burbujas.
// ----------------------------------------------------------------------------

function cryoContent(): {
  structures: StructureSpec[];
  objects: WorldObjectSpec[];
  enemies: EnemySpawnSpec[];
  grass: GrassZoneSpec[];
  bubbles: WaterBubbleSpec[];
  props: PropSpec[];
  npcs: NpcSpec[];
} {
  const planet = GALAXY_PLANETS[2];
  const WALL = '#5b7f99'; // muros de hielo lacado del Shogunato
  const GATE = '#7dd3fc';
  const f = baseFrame(planet.id, [0.3, 0.82, 0.42], planet.radius);

  const structures: StructureSpec[] = [
    // --- Zona 1: Dojo de la Aldea (18 x 14, h=4): CERRADO, valla láser sur. ---
    wallSeg(f, 'kg-dojo-wall-n', -28, 13, 't1', 18, 4, WALL),
    // Sur: 6.3 + 6.3 (muro) + 5.4 (valla láser) = 18 m exactos.
    wallSeg(f, 'kg-dojo-wall-s-l', -33.85, 27, 't1', 6.3, 4, WALL),
    wallSeg(f, 'kg-dojo-wall-s-r', -22.15, 27, 't1', 6.3, 4, WALL),
    wallSeg(f, 'kg-dojo-wall-e', -19, 20, 't2', 14, 4, WALL),
    wallSeg(f, 'kg-dojo-wall-w', -37, 20, 't2', 14, 4, WALL),
    towerAt(f, 'kg-dojo-torre', -37, 13, WALL, 7),

    // --- Zona 2: Castillo del Shogun (44 x 34, h=5): CERRADO en los 4 lados. ---
    // Sur: 19 + 19 (muro) + 6 (portón de llave) = 44 m exactos.
    wallSeg(f, 'kg-castillo-wall-s-l', -12.5, -3, 't1', 19, 5, WALL),
    wallSeg(f, 'kg-castillo-wall-s-r', 12.5, -3, 't1', 19, 5, WALL),
    // Norte: 19 + 19 (muro) + 6 (pared agrietada) = 44 m exactos.
    wallSeg(f, 'kg-castillo-wall-n-l', -12.5, -37, 't1', 19, 5, WALL),
    wallSeg(f, 'kg-castillo-wall-n-r', 12.5, -37, 't1', 19, 5, WALL),
    wallSeg(f, 'kg-castillo-wall-e', 22, -20, 't2', 34, 5, WALL),
    wallSeg(f, 'kg-castillo-wall-w', -22, -20, 't2', 34, 5, WALL),
    // Torres de las esquinas: los vigías samurái otean el patio.
    towerAt(f, 'kg-castillo-tower-se', 22, -3, WALL, 9),
    towerAt(f, 'kg-castillo-tower-sw', -22, -3, WALL, 9),
    towerAt(f, 'kg-castillo-tower-ne', 22, -37, WALL, 9),
    towerAt(f, 'kg-castillo-tower-nw', -22, -37, WALL, 9),

    // --- Zona 2: Santuario Interior del Castillo (18 x 12, h=4): CERRADO. ---
    // Sur: 6.5 + 6.5 (muro) + 5 (compuerta lockdown) = 18 m exactos.
    wallSeg(f, 'kg-santuario-wall-s-l', -5.75, -16, 't1', 6.5, 4, WALL),
    wallSeg(f, 'kg-santuario-wall-s-r', 5.75, -16, 't1', 6.5, 4, WALL),
    wallSeg(f, 'kg-santuario-wall-n', 0, -28, 't1', 18, 4, WALL),
    wallSeg(f, 'kg-santuario-wall-e', 9, -22, 't2', 12, 4, WALL),
    // Oeste: 3.5 + 3.5 (muro) + 5 (pared agrietada) = 12 m exactos.
    wallSeg(f, 'kg-santuario-wall-w-n', -9, -26.25, 't2', 3.5, 4, WALL),
    wallSeg(f, 'kg-santuario-wall-w-s', -9, -17.75, 't2', 3.5, 4, WALL),

    // --- Zona 3: Torre norte + Santuario Flotante en órbita (Generador 3). ---
    towerAt(f, 'kg-torre-norte', 8, -41, GATE, 12),
    struct(f, 'kg-santuario-orbital', 'platform', 0, -58, null, [6, 1.2, 6], GATE, {
      altitudeOffset: 22,
    }),
  ];

  const objects: WorldObjectSpec[] = [
    // ==================== Zona 1: Dojo de la Aldea ====================
    obj(planet.id, 'kg-gen-1', 'generator', frameDir(f, -28, 18)),
    laserGate(f, 'kg-dojo-laser', -28, 27, 't1'),
    // Palanca tras la casa lateral del Dojo (apaga la valla láser).
    switchLever(f, 'kg-dojo-palanca', -42, 27),

    // ==================== Zona 2: Castillo del Shogun ====================
    // Portón principal: se abre con la llave maestra del Capitán del Dojo.
    lockedGate(f, 'kg-castillo-porton', 0, -3, 't1', [3, 4.5, 0.8], {
      requiresKeycard: true,
    }),
    // Pared trasera agrietada: bolas de nieve gigantes y barriles fuera.
    breakableWall(f, 'kg-castillo-muro-norte', 0, -37, 't1', [3, 4.5, 0.7]),
    // Santuario Interior: compuerta con LOCKDOWN + palanca lateral del patio.
    lockedGate(f, 'kg-santuario-compuerta', 0, -16, 't1', [2.5, 3.8, 0.6], {
      lockdownOnAlert: true,
    }),
    switchLever(f, 'kg-santuario-palanca', 14, -11, {
      linkedGateId: 'kg-santuario-compuerta',
    }),
    // Segunda pared rompible del Santuario (acceso subterráneo de Digger).
    breakableWall(f, 'kg-santuario-muro-oeste', -9, -22, 't2', [2.5, 3.6, 0.6]),
    obj(planet.id, 'kg-gen-2', 'generator', frameDir(f, 0, -22)),

    // ==================== Zona 3: Santuario Flotante ====================
    obj(planet.id, 'kg-gen-3', 'generator', frameDir(f, 0, -59), { altitudeOffset: 23.2 }),

    // Bolas de nieve gigantes y barriles junto al muro trasero agrietado.
    obj(planet.id, 'kg-bola-norte-1', 'snowball', frameDir(f, 3.5, -41)),
    obj(planet.id, 'kg-bola-norte-2', 'snowball', frameDir(f, -3.5, -41)),
    obj(planet.id, 'kg-bola-norte-3', 'snowball', frameDir(f, 0, -43.5)),
    obj(planet.id, 'kg-barril-norte-1', 'barrel_explosive', frameDir(f, -6, -41)),
    obj(planet.id, 'kg-barril-norte-2', 'barrel_explosive', frameDir(f, 6, -41)),
    // Barril y bola junto a la pared rompible del Santuario Interior.
    obj(planet.id, 'kg-barril-santuario', 'barrel_explosive', frameDir(f, -13, -22)),
    obj(planet.id, 'kg-bola-santuario', 'snowball', frameDir(f, -13, -18)),
    // Agarrables repartidos por la aldea, el lago helado y el patio.
    obj(planet.id, 'kg-bola-lago', 'snowball', frameDir(f, 24, 8)),
    obj(planet.id, 'kg-bola-aldea-1', 'snowball', frameDir(f, 10, 42)),
    obj(planet.id, 'kg-bola-aldea-2', 'snowball', frameDir(f, -12, 42)),
    obj(planet.id, 'kg-roca-1', 'rock', frameDir(f, 18, 20)),
    obj(planet.id, 'kg-roca-2', 'rock', frameDir(f, -16, 4)),
    obj(planet.id, 'kg-roca-3', 'rock', frameDir(f, 30, -6)),
    obj(planet.id, 'kg-roca-4', 'rock', [0.15, 0.95, 0.28]),
    obj(planet.id, 'kg-roca-5', 'rock', [-0.4, 0.8, -0.4]),
    obj(planet.id, 'kg-caja-1', 'crate', frameDir(f, 12, 28)),
    obj(planet.id, 'kg-caja-2', 'crate', frameDir(f, -10, 36)),
    obj(planet.id, 'kg-caja-3', 'crate', frameDir(f, 20, -8)),
    obj(planet.id, 'kg-barril-aldea', 'barrel_explosive', frameDir(f, 6, 30)),
  ];

  const enemies: EnemySpawnSpec[] = [
    // ==================== Zona 1: Aldea y Dojo ====================
    // Capitán Samurái del Dojo (sashimono dorado): porta la llave maestra.
    {
      kind: 'officer',
      skin: 'samurai',
      planetId: planet.id,
      patrolDirs: patrolCircle(...frameDir(f, -28, 20), 0.035, 4),
      dropsKeycard: true,
    },
    // Samuráis patrullando la puerta del Dojo y la calle mayor de la aldea.
    { kind: 'guard', skin: 'samurai', planetId: planet.id, patrolDirs: patrolCircle(...frameDir(f, -28, 33), 0.04, 4) },
    { kind: 'guard', skin: 'samurai', planetId: planet.id, patrolDirs: patrolCircle(...frameDir(f, 0, 24), 0.06, 4) },

    // ==================== Zona 2: Castillo del Shogun ====================
    // Vigías samurái en las torres frontales, barriendo el patio con la mirada.
    lookout(planet.id, frameDir(f, 22, -3), 8.65, frameDir(f, 0, -20), 'samurai'),
    lookout(planet.id, frameDir(f, -22, -3), 8.65, frameDir(f, 0, -20), 'samurai'),
    // Oni acorazado con kanabo custodiando el patio del Castillo.
    { kind: 'brute', skin: 'oni', planetId: planet.id, patrolDirs: patrolCircle(...frameDir(f, 0, -10), 0.04, 3) },
    // Samuráis patrullando el patio entre el portón y el Santuario Interior.
    { kind: 'guard', skin: 'samurai', planetId: planet.id, patrolDirs: patrolCircle(...frameDir(f, 12, -9), 0.04, 4) },
    { kind: 'guard', skin: 'samurai', planetId: planet.id, patrolDirs: patrolCircle(...frameDir(f, -12, -9), 0.04, 4) },

    // ==================== Zona 3: Santuario Flotante ====================
    // Vigía samurái sobre la plataforma orbital, oteando hacia el Castillo.
    lookout(planet.id, frameDir(f, -3, -60), 23.2, frameDir(f, 0, -30), 'samurai'),
    // Dron de reconocimiento sobrevolando el lago helado de la aldea.
    { kind: 'drone', planetId: planet.id, patrolDirs: patrolCircle(...frameDir(f, 26, 16), 0.08, 4) },
  ];

  // Arbustos nevados para el sigilo de Kitsune: Dojo, aldea, frente del
  // Castillo y lago helado.
  const grass: GrassZoneSpec[] = [
    { id: 'kg-hierba-dojo', planetId: planet.id, sphericalDir: frameDir(f, -42, 31), angularRadius: 0.2 },
    { id: 'kg-hierba-aldea', planetId: planet.id, sphericalDir: frameDir(f, 14, 34), angularRadius: 0.2 },
    { id: 'kg-hierba-castillo-e', planetId: planet.id, sphericalDir: frameDir(f, 16, 2), angularRadius: 0.18 },
    { id: 'kg-hierba-castillo-o', planetId: planet.id, sphericalDir: frameDir(f, -16, 2), angularRadius: 0.18 },
    { id: 'kg-hierba-lago', planetId: planet.id, sphericalDir: frameDir(f, 31, 20), angularRadius: 0.18 },
  ];

  // Cadena de 3 burbujas de agua espaciales desde la torre norte hasta el
  // Santuario Flotante (Axel / Gravity Dash / Ancla) + burbuja del lago helado.
  const bubbles: WaterBubbleSpec[] = [
    orbitBubble('kg-bub-1', planet, frameDir(f, 10, -45), 13, 7),
    orbitBubble('kg-bub-2', planet, frameDir(f, 7, -49), 16.5, 6.5),
    orbitBubble('kg-bub-3', planet, frameDir(f, 4, -53), 19.5, 6),
    orbitBubble('kg-bub-lago', planet, frameDir(f, 26, 12), 3, 8),
  ];

  // --- Densidad visual del Shogunato: aldea feudal densa con torii, casas,
  // pagodas, farolillos cálidos, cerezos nevados, pinos, puentes de madera,
  // senderos de piedra, lago helado con cristales y castillo decorado. ---
  const toCenter = (axM: number, azM: number): THREE.Vector3 =>
    new THREE.Vector3().addScaledVector(f.t1, -axM).addScaledVector(f.t2, 28 - azM).normalize();
  const props: PropSpec[] = [
    // ==================== Zona 1: Aldea Feudal Nevada ====================
    // Torii de la entrada + farolillos junto al Maestro Takeshi.
    prop(planet.id, 'kg-torii-entrada', 'torii_gate', frameDir(f, 0, 42), { scale: 1.2 }),
    prop(planet.id, 'kg-farol-entrada-e', 'paper_lantern', frameDir(f, 2, 38)),
    prop(planet.id, 'kg-farol-entrada-o', 'paper_lantern', frameDir(f, -2, 38)),
    // Casas de madera de la aldea flanqueando la calle mayor.
    prop(planet.id, 'kg-casa-1', 'village_house', frameDir(f, 9, 30), { yaw: yawFace(f, 9, 30, toCenter(9, 30)) }),
    prop(planet.id, 'kg-casa-2', 'village_house', frameDir(f, -9, 30), { yaw: yawFace(f, -9, 30, toCenter(-9, 30)) }),
    prop(planet.id, 'kg-casa-3', 'village_house', frameDir(f, 15, 36), { yaw: yawFace(f, 15, 36, toCenter(15, 36)) }),
    prop(planet.id, 'kg-casa-4', 'village_house', frameDir(f, -15, 36), { yaw: yawFace(f, -15, 36, toCenter(-15, 36)) }),
    prop(planet.id, 'kg-casa-5', 'village_house', frameDir(f, 8, 20), { yaw: yawFace(f, 8, 20, toCenter(8, 20)) }),
    prop(planet.id, 'kg-casa-6', 'village_house', frameDir(f, -8, 20), { yaw: yawFace(f, -8, 20, toCenter(-8, 20)) }),
    prop(planet.id, 'kg-casa-7', 'village_house', frameDir(f, 16, 14), { yaw: yawFace(f, 16, 14, toCenter(16, 14)) }),
    prop(planet.id, 'kg-casa-8', 'village_house', frameDir(f, -16, 14), { yaw: yawFace(f, -16, 14, toCenter(-16, 14)) }),
    prop(planet.id, 'kg-casa-9', 'village_house', frameDir(f, 22, 26), { yaw: yawFace(f, 22, 26, toCenter(22, 26)) }),
    prop(planet.id, 'kg-casa-10', 'village_house', frameDir(f, -14, 40), { yaw: yawFace(f, -14, 40, toCenter(-14, 40)) }),
    // Casa lateral que esconde la palanca del Dojo.
    prop(planet.id, 'kg-casa-palanca', 'village_house', frameDir(f, -42, 23), { yaw: yawFace(f, -42, 23, f.t2) }),
    // Pagodas de la aldea: plaza central y flancos.
    prop(planet.id, 'kg-pagoda-1', 'pagoda_house', frameDir(f, 0, 34)),
    prop(planet.id, 'kg-pagoda-2', 'pagoda_house', frameDir(f, 24, 34)),
    prop(planet.id, 'kg-pagoda-3', 'pagoda_house', frameDir(f, -24, 40)),
    // Farolillos cálidos marcando la calle mayor nevada.
    prop(planet.id, 'kg-farol-1', 'paper_lantern', frameDir(f, 2, 30)),
    prop(planet.id, 'kg-farol-2', 'paper_lantern', frameDir(f, -2, 30)),
    prop(planet.id, 'kg-farol-3', 'paper_lantern', frameDir(f, 2, 18)),
    prop(planet.id, 'kg-farol-4', 'paper_lantern', frameDir(f, -2, 18)),
    prop(planet.id, 'kg-farol-5', 'paper_lantern', frameDir(f, 2, 10)),
    prop(planet.id, 'kg-farol-6', 'paper_lantern', frameDir(f, -2, 10)),
    // Cerezos nevados de la aldea.
    prop(planet.id, 'kg-cerezo-1', 'cherry_snow_tree', frameDir(f, 12, 26), { scale: 1.2 }),
    prop(planet.id, 'kg-cerezo-2', 'cherry_snow_tree', frameDir(f, -12, 26), { scale: 1.2 }),
    prop(planet.id, 'kg-cerezo-3', 'cherry_snow_tree', frameDir(f, 18, 30), { scale: 1.15 }),
    prop(planet.id, 'kg-cerezo-4', 'cherry_snow_tree', frameDir(f, -18, 30), { scale: 1.15 }),
    prop(planet.id, 'kg-cerezo-5', 'cherry_snow_tree', frameDir(f, 6, 38)),
    prop(planet.id, 'kg-cerezo-6', 'cherry_snow_tree', frameDir(f, -6, 38)),
    prop(planet.id, 'kg-cerezo-7', 'cherry_snow_tree', frameDir(f, 20, 18)),
    prop(planet.id, 'kg-cerezo-8', 'cherry_snow_tree', frameDir(f, -20, 18)),
    // Pinos invernales alrededor de la aldea.
    prop(planet.id, 'kg-pino-1', 'pine_tree', frameDir(f, 30, 26), { scale: 1.3 }),
    prop(planet.id, 'kg-pino-2', 'pine_tree', frameDir(f, -30, 38), { scale: 1.3 }),
    prop(planet.id, 'kg-pino-3', 'pine_tree', frameDir(f, 34, 8), { scale: 1.25 }),
    prop(planet.id, 'kg-pino-4', 'pine_tree', frameDir(f, -32, 2), { scale: 1.25 }),
    prop(planet.id, 'kg-pino-5', 'pine_tree', frameDir(f, 12, 44), { scale: 1.2 }),
    prop(planet.id, 'kg-pino-6', 'pine_tree', frameDir(f, -12, 44), { scale: 1.2 }),
    // Senderos de piedra de la calle mayor y acceso al Dojo.
    prop(planet.id, 'kg-sendero-1', 'stone_path', frameDir(f, 0, 40)),
    prop(planet.id, 'kg-sendero-2', 'stone_path', frameDir(f, 0, 32)),
    prop(planet.id, 'kg-sendero-3', 'stone_path', frameDir(f, 0, 24)),
    prop(planet.id, 'kg-sendero-4', 'stone_path', frameDir(f, 0, 14)),
    prop(planet.id, 'kg-sendero-5', 'stone_path', frameDir(f, 0, 6)),
    prop(planet.id, 'kg-sendero-dojo', 'stone_path', frameDir(f, -34, 32), { yaw: Math.PI / 2 }),
    // Puente de madera de la entrada sur de la aldea.
    prop(planet.id, 'kg-puente-entrada', 'wood_bridge', frameDir(f, 0, 46)),
    // Bambú nevado entre las casas del flanco este.
    prop(planet.id, 'kg-bambu-1', 'bamboo_cluster', frameDir(f, 28, 34)),
    prop(planet.id, 'kg-bambu-2', 'bamboo_cluster', frameDir(f, -28, 34)),
    prop(planet.id, 'kg-bambu-3', 'bamboo_cluster', frameDir(f, 32, 30)),
    prop(planet.id, 'kg-bambu-4', 'bamboo_cluster', frameDir(f, -30, 28)),

    // ==================== Lago helado (flanco este) ====================
    prop(planet.id, 'kg-puente-lago', 'wood_bridge', frameDir(f, 26, 12), { yaw: Math.PI / 2 }),
    prop(planet.id, 'kg-cristal-lago-1', 'ice_crystal', frameDir(f, 22, 8), { scale: 1.6 }),
    prop(planet.id, 'kg-cristal-lago-2', 'ice_crystal', frameDir(f, 30, 16), { scale: 1.8 }),
    prop(planet.id, 'kg-cristal-lago-3', 'ice_crystal', frameDir(f, 24, 17), { scale: 1.4 }),
    prop(planet.id, 'kg-cristal-lago-4', 'ice_crystal', frameDir(f, 31, 7), { scale: 1.5 }),

    // ==================== Zona 2: Castillo del Shogun ====================
    // Torii monumental delante del portón principal + farolillos del guardia.
    prop(planet.id, 'kg-torii-monumental', 'torii_gate', frameDir(f, 0, 3), { scale: 1.7 }),
    prop(planet.id, 'kg-farol-porton-e', 'paper_lantern', frameDir(f, 4, 0)),
    prop(planet.id, 'kg-farol-porton-o', 'paper_lantern', frameDir(f, -4, 0)),
    // Cerezos nevados flanqueando la aproximación al Castillo.
    prop(planet.id, 'kg-cerezo-castillo-e', 'cherry_snow_tree', frameDir(f, 18, 2), { scale: 1.25 }),
    prop(planet.id, 'kg-cerezo-castillo-o', 'cherry_snow_tree', frameDir(f, -18, 2), { scale: 1.25 }),
    // Sendero del patio interior + cerezos y farolillos del patio.
    prop(planet.id, 'kg-sendero-patio', 'stone_path', frameDir(f, 0, -10)),
    prop(planet.id, 'kg-cerezo-patio-e', 'cherry_snow_tree', frameDir(f, 16, -8)),
    prop(planet.id, 'kg-cerezo-patio-o', 'cherry_snow_tree', frameDir(f, -16, -8)),
    // Pinos y cristales tras los muros del Castillo.
    prop(planet.id, 'kg-pino-castillo-e', 'pine_tree', frameDir(f, 28, -24), { scale: 1.3 }),
    prop(planet.id, 'kg-pino-castillo-o', 'pine_tree', frameDir(f, -28, -24), { scale: 1.3 }),
    prop(planet.id, 'kg-cristal-castillo-e', 'ice_crystal', frameDir(f, 34, -28), { scale: 2.0 }),
    prop(planet.id, 'kg-cristal-castillo-o', 'ice_crystal', frameDir(f, -32, -30), { scale: 1.9 }),
    prop(planet.id, 'kg-cristal-torre-norte', 'ice_crystal', frameDir(f, 14, -44), { scale: 1.6 }),

    // ==================== Zona 3: Santuario Flotante ====================
    prop(planet.id, 'kg-torii-orbital', 'torii_gate', frameDir(f, 0, -62), { altitudeOffset: 23.2, scale: 1.1 }),
    prop(planet.id, 'kg-farol-orbital-e', 'paper_lantern', frameDir(f, 2.5, -61), { altitudeOffset: 23.2 }),
    prop(planet.id, 'kg-farol-orbital-o', 'paper_lantern', frameDir(f, -2.5, -61), { altitudeOffset: 23.2 }),
  ];

  const npcs: NpcSpec[] = [
    {
      id: 'takeshi',
      name: 'Maestro Takeshi',
      role: 'Ronin Retirado',
      planetId: planet.id,
      sphericalDir: frameDir(f, 3, 40.5),
      yaw: yawFace(f, 3, 40.5, toCenter(3, 40.5)),
      accentColor: '#f87171',
      dialogue: [
        'El Shogunato selló su Castillo en la nieve. El Capitán Samurái del Dojo guarda la llave maestra; si prefieres las sombras, usa los arbustos nevados, rompe el muro trasero del castillo o escala por las burbujas al Santuario Celestial.',
        'El Dojo de la aldea está cerrado por una valla láser: la palanca se esconde tras la casa lateral del oeste, o excava por debajo con Digger. ¡El Capitán porta el estandarte dorado en la espalda, no lo confundas con un samurái cualquiera!',
        'El patio del Castillo lo custodia un Oni acorazado con su kanabo y dos vigías en las torres. Noquea por la espalda con [E] y cruza la hierba nevada; si salta la alarma, la compuerta del Santuario Interior se sella de golpe.',
      ],
    },
  ];

  return { structures, objects, enemies, grass, bubbles, props, npcs };
}

// ----------------------------------------------------------------------------
// Planeta 3 — Neon Bastion: METRÓPOLIS CYBERPUNK · CIUDADELA DE REACTORES
// (r = 156). Metrópolis nocturna de rascacielos de neón con 3 zonas:
// (1) Bulevar Neón y Plaza de Acceso (spawn, Zero-7 el Netrunner): bulevar
//     denso de cyber_towers, carteles de neón, terminales holográficas y
//     focos de vigilancia,
// (2) Ala Corporativa Oeste: recinto sellado custodiado por el Oficial
//     Cyber (porta la Tarjeta Maestra), patrulla en pareja de cyber guardias
//     y vigía elevado; su bóveda secundaria esconde una tarjeta extra tras
//     un muro agrietado,
// (3) Ciudadela de Reactores: portón exterior e interior con escáneres
//     anti-disfraz y compuertas con LOCKDOWN, pasadizo secreto (muro
//     agrietado + conducto de teletransporte) y 3 reactores protegidos por
//     pasarelas con palancas, vallas láser, drones, mechas y torretas.
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
  const WALL = '#1e293b'; // hormigón nocturno de la metrópolis
  const GATE = '#334155';
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
    // ==================== Ala Corporativa Oeste ====================
    // Oficial Cyber del Ala Corporativa: porta la Tarjeta Maestra.
    {
      kind: 'officer',
      skin: 'cyber_officer',
      planetId: planet.id,
      patrolDirs: patrolCircle(...frameDir(f, -40, 0), 0.05, 4),
      dropsKeycard: true,
    },
    // Patrulla en pareja de cyber guardias custodiando el patio del ala.
    {
      kind: 'guard',
      skin: 'cyber_guard',
      planetId: planet.id,
      patrolDirs: patrolCircle(...frameDir(f, -40, 4.5), 0.05, 4),
      pairedWithNext: true,
    },
    {
      kind: 'guard',
      skin: 'cyber_guard',
      planetId: planet.id,
      patrolDirs: patrolCircle(...frameDir(f, -40, 4.5), 0.07, 4),
    },
    // Vigía cyber de la torre del ala oeste.
    lookout(planet.id, frameDir(f, -44, -8), 10.65, frameDir(f, -34, 4), 'cyber_guard'),

    // ==================== Bulevar Neón / Puerta principal ====================
    {
      kind: 'guard',
      skin: 'cyber_guard',
      planetId: planet.id,
      patrolDirs: patrolCircle(...frameDir(f, 0, 30), 0.05, 4),
      pairedWithNext: true,
    },
    {
      kind: 'guard',
      skin: 'cyber_guard',
      planetId: planet.id,
      patrolDirs: patrolCircle(...frameDir(f, 0, 30), 0.07, 4),
    },

    // ==================== Patio exterior ====================
    {
      kind: 'guard',
      skin: 'cyber_guard',
      planetId: planet.id,
      patrolDirs: patrolCircle(...frameDir(f, 24, 18), 0.05, 4),
    },
    {
      kind: 'guard',
      skin: 'cyber_guard',
      planetId: planet.id,
      patrolDirs: patrolCircle(...frameDir(f, -24, -18), 0.05, 4),
    },
    // Mech pesado aplastando el patio exterior.
    {
      kind: 'brute',
      skin: 'cyber_mech',
      planetId: planet.id,
      patrolDirs: patrolCircle(...frameDir(f, 20, 18), 0.06, 3),
    },
    {
      kind: 'drone',
      skin: 'cyber_drone',
      planetId: planet.id,
      patrolDirs: patrolCircle(...frameDir(f, 24, 8), 0.08, 4),
    },
    {
      kind: 'drone',
      skin: 'cyber_drone',
      planetId: planet.id,
      patrolDirs: patrolCircle(...frameDir(f, -24, -8), 0.08, 4),
    },

    // ==================== Torre del Reactor Norte ====================
    {
      kind: 'drone',
      skin: 'cyber_drone',
      planetId: planet.id,
      patrolDirs: patrolCircle(...frameDir(f, -10, -19), 0.07, 4),
    },
    {
      kind: 'drone',
      skin: 'cyber_drone',
      planetId: planet.id,
      patrolDirs: patrolCircle(...frameDir(f, 5, -19), 0.09, 4),
    },
    { kind: 'turret', planetId: planet.id, patrolDirs: [frameDir(f, 26, -20)] },
    // Vigías cyber de las torres de la muralla norte oteando el patio.
    lookout(planet.id, frameDir(f, 32, -24), 10.65, frameDir(f, 0, -4), 'cyber_guard'),
    lookout(planet.id, frameDir(f, -32, -24), 10.65, frameDir(f, 0, -4), 'cyber_guard'),

    // ==================== Ciudadela de Reactores (interior) ====================
    // Oficial Cyber de la compuerta interior (delata disfraces).
    {
      kind: 'officer',
      skin: 'cyber_officer',
      planetId: planet.id,
      patrolDirs: patrolCircle(...frameDir(f, 0, 18), 0.04, 4),
    },
    {
      kind: 'guard',
      skin: 'cyber_guard',
      planetId: planet.id,
      patrolDirs: patrolCircle(...frameDir(f, 8, 8), 0.05, 4),
    },
    {
      kind: 'guard',
      skin: 'cyber_guard',
      planetId: planet.id,
      patrolDirs: patrolCircle(...frameDir(f, -8, 8), 0.05, 4),
    },
    // Mech del búnker blindado del reactor 2.
    {
      kind: 'brute',
      skin: 'cyber_mech',
      planetId: planet.id,
      patrolDirs: patrolCircle(...frameDir(f, -8, -5), 0.05, 3),
    },
    // Cyber guardia del patio de láseres del reactor 1.
    {
      kind: 'guard',
      skin: 'cyber_guard',
      planetId: planet.id,
      patrolDirs: patrolCircle(...frameDir(f, 12.5, -10), 0.035, 4),
    },
    // Dron cibernético sobrevolando el patio de reactores.
    {
      kind: 'drone',
      skin: 'cyber_drone',
      planetId: planet.id,
      patrolDirs: patrolCircle(...frameDir(f, 0, 4), 0.06, 4),
    },
    // Vigías cyber de las torres interiores.
    lookout(planet.id, frameDir(f, 18, -14), 8.65, frameDir(f, 0, -2), 'cyber_guard'),
    lookout(planet.id, frameDir(f, -18, -14), 8.65, frameDir(f, 0, -2), 'cyber_guard'),
  ];

  // Burbujas: pasarela del reactor 1 y cadena hasta la torre del reactor 3.
  const bubbles: WaterBubbleSpec[] = [
    orbitBubble('bs-bub-pasarela', planet, frameDir(f, 9, 6), 2.5, 6),
    orbitBubble('bs-bub-n1', planet, frameDir(f, 7, -17), 5, 8),
    orbitBubble('bs-bub-n2', planet, frameDir(f, 3.5, -18.5), 9.5, 7.5),
  ];

  // --- Densidad visual de la metrópolis: rascacielos de neón, carteles
  // holográficos, terminales, tuberías, reactores, antenas y focos. ---
  const props: PropSpec[] = [
    // ==================== Zona 1: Bulevar Neón y Plaza de Acceso ====================
    // Rascacielos futuristas flanqueando el bulevar de acceso.
    prop(planet.id, 'bs-torre-bulevar-1', 'cyber_tower', frameDir(f, 18, 36)),
    prop(planet.id, 'bs-torre-bulevar-2', 'cyber_tower', frameDir(f, -18, 36)),
    prop(planet.id, 'bs-torre-bulevar-3', 'cyber_tower', frameDir(f, 26, 44), { scale: 1.15 }),
    prop(planet.id, 'bs-torre-bulevar-4', 'cyber_tower', frameDir(f, -26, 44), { scale: 1.15 }),
    prop(planet.id, 'bs-torre-plaza-1', 'cyber_tower', frameDir(f, 34, 30), { scale: 0.9 }),
    prop(planet.id, 'bs-torre-plaza-2', 'cyber_tower', frameDir(f, -34, 30), { scale: 0.9 }),
    prop(planet.id, 'bs-torre-fondo-1', 'cyber_tower', frameDir(f, 14, 48), { scale: 1.2 }),
    prop(planet.id, 'bs-torre-fondo-2', 'cyber_tower', frameDir(f, -14, 48), { scale: 1.2 }),
    // Carteles de neón cian/magenta del bulevar.
    prop(planet.id, 'bs-neon-bulevar-1', 'neon_billboard', frameDir(f, 10, 40)),
    prop(planet.id, 'bs-neon-bulevar-2', 'neon_billboard', frameDir(f, -10, 40)),
    prop(planet.id, 'bs-neon-bulevar-3', 'neon_billboard', frameDir(f, 24, 33)),
    prop(planet.id, 'bs-neon-bulevar-4', 'neon_billboard', frameDir(f, -24, 33)),
    prop(planet.id, 'bs-neon-bulevar-5', 'neon_billboard', frameDir(f, 0, 46)),
    prop(planet.id, 'bs-neon-plaza-1', 'neon_billboard', frameDir(f, 32, 40)),
    prop(planet.id, 'bs-neon-plaza-2', 'neon_billboard', frameDir(f, -32, 40)),
    prop(planet.id, 'bs-neon-puerta-e', 'neon_billboard', frameDir(f, 30, 26)),
    prop(planet.id, 'bs-neon-puerta-o', 'neon_billboard', frameDir(f, -30, 26)),
    // Terminales holográficas de la plaza de acceso.
    prop(planet.id, 'bs-holo-plaza-1', 'holo_pillar', frameDir(f, 4, 34)),
    prop(planet.id, 'bs-holo-plaza-2', 'holo_pillar', frameDir(f, -4, 34)),
    prop(planet.id, 'bs-holo-plaza-3', 'holo_pillar', frameDir(f, 16, 30)),
    prop(planet.id, 'bs-holo-plaza-4', 'holo_pillar', frameDir(f, -16, 30)),
    prop(planet.id, 'bs-holo-plaza-5', 'holo_pillar', frameDir(f, 0, 38)),
    prop(planet.id, 'bs-holo-plaza-6', 'holo_pillar', frameDir(f, 22, 48)),
    prop(planet.id, 'bs-holo-plaza-7', 'holo_pillar', frameDir(f, -22, 48)),
    // Focos de vigilancia barriendo el bulevar.
    prop(planet.id, 'bs-foco-1', 'spotlight', frameDir(f, 0, 29)),
    prop(planet.id, 'bs-foco-bulevar-1', 'spotlight', frameDir(f, 12, 34)),
    prop(planet.id, 'bs-foco-bulevar-2', 'spotlight', frameDir(f, -12, 34)),
    prop(planet.id, 'bs-foco-bulevar-3', 'spotlight', frameDir(f, 6, 44)),
    prop(planet.id, 'bs-foco-bulevar-4', 'spotlight', frameDir(f, -6, 44)),
    // Tuberías y antenas del bulevar.
    prop(planet.id, 'bs-tuberia-3', 'pipe', frameDir(f, 12, 26), { yaw: 1.6 }),
    prop(planet.id, 'bs-tuberia-bulevar-1', 'pipe', frameDir(f, 40, 34)),
    prop(planet.id, 'bs-tuberia-bulevar-2', 'pipe', frameDir(f, -40, 34)),
    prop(planet.id, 'bs-antena-3', 'antenna', frameDir(f, 20, 30)),
    prop(planet.id, 'bs-antena-bulevar-1', 'antenna', frameDir(f, 36, 44)),
    prop(planet.id, 'bs-antena-bulevar-2', 'antenna', frameDir(f, -36, 44)),

    // ==================== Zona 2: Ala Corporativa Oeste ====================
    // Rascacielos corporativos flanqueando el recinto sellado.
    prop(planet.id, 'bs-torre-ala-1', 'cyber_tower', frameDir(f, -40, -16), { scale: 1.1 }),
    prop(planet.id, 'bs-torre-ala-2', 'cyber_tower', frameDir(f, -40, 14), { scale: 1.1 }),
    // Cartel corporativo magenta sobre la valla láser de entrada.
    prop(planet.id, 'bs-neon-ala-1', 'neon_billboard', frameDir(f, -38, -12)),
    prop(planet.id, 'bs-neon-ala-2', 'neon_billboard', frameDir(f, -42, 12)),
    // Terminales holográficas dentro del ala corporativa.
    prop(planet.id, 'bs-holo-ala-1', 'holo_pillar', frameDir(f, -40, -5)),
    prop(planet.id, 'bs-holo-ala-2', 'holo_pillar', frameDir(f, -36, 6)),
    // Focos y tuberías de mantenimiento del ala.
    prop(planet.id, 'bs-foco-ala-1', 'spotlight', frameDir(f, -36, -10)),
    prop(planet.id, 'bs-foco-ala-2', 'spotlight', frameDir(f, -44, 10)),
    prop(planet.id, 'bs-tuberia-2', 'pipe', frameDir(f, -40, 0), { yaw: -0.8 }),
    prop(planet.id, 'bs-tuberia-ala-1', 'pipe', frameDir(f, -46, -14)),

    // ==================== Patio exterior (entre las dos murallas) ====================
    // Rascacielos de la periferia asomándose sobre la muralla.
    prop(planet.id, 'bs-torre-patio-e', 'cyber_tower', frameDir(f, 26, 8), { scale: 0.85 }),
    prop(planet.id, 'bs-torre-patio-o', 'cyber_tower', frameDir(f, -26, 8), { scale: 0.85 }),
    prop(planet.id, 'bs-torre-patio-n-e', 'cyber_tower', frameDir(f, 14, -20), { scale: 0.8 }),
    prop(planet.id, 'bs-torre-patio-n-o', 'cyber_tower', frameDir(f, -14, -20), { scale: 0.8 }),
    // Carteles de neón del patio.
    prop(planet.id, 'bs-neon-patio-1', 'neon_billboard', frameDir(f, 28, -2)),
    prop(planet.id, 'bs-neon-patio-2', 'neon_billboard', frameDir(f, -28, 2)),
    prop(planet.id, 'bs-neon-patio-3', 'neon_billboard', frameDir(f, 8, -21)),
    prop(planet.id, 'bs-neon-patio-4', 'neon_billboard', frameDir(f, -8, -21)),
    // Terminales holográficas entre búnkers y pasarelas.
    prop(planet.id, 'bs-holo-patio-1', 'holo_pillar', frameDir(f, 24, 4)),
    prop(planet.id, 'bs-holo-patio-2', 'holo_pillar', frameDir(f, -24, 4)),
    prop(planet.id, 'bs-holo-patio-3', 'holo_pillar', frameDir(f, 10, -22)),
    prop(planet.id, 'bs-holo-patio-4', 'holo_pillar', frameDir(f, -10, -22)),
    // Focos de vigilancia del patio.
    prop(planet.id, 'bs-foco-2', 'spotlight', frameDir(f, 20, -22)),
    prop(planet.id, 'bs-foco-3', 'spotlight', frameDir(f, -20, 22)),
    prop(planet.id, 'bs-foco-patio-1', 'spotlight', frameDir(f, 16, 16)),
    prop(planet.id, 'bs-foco-patio-2', 'spotlight', frameDir(f, -16, 16)),
    prop(planet.id, 'bs-foco-patio-3', 'spotlight', frameDir(f, 30, 14)),
    prop(planet.id, 'bs-foco-patio-4', 'spotlight', frameDir(f, -30, -14)),
    // Tuberías, antenas y reactores auxiliares del patio.
    prop(planet.id, 'bs-tuberia-4', 'pipe', frameDir(f, -12, -26), { yaw: 2.4 }),
    prop(planet.id, 'bs-tuberia-5', 'pipe', frameDir(f, 36, -12)),
    prop(planet.id, 'bs-tuberia-6', 'pipe', frameDir(f, -36, 12)),
    prop(planet.id, 'bs-tuberia-patio-1', 'pipe', frameDir(f, 44, 8)),
    prop(planet.id, 'bs-tuberia-patio-2', 'pipe', frameDir(f, -44, -8)),
    prop(planet.id, 'bs-antena-1', 'antenna', frameDir(f, 30, -26)),
    prop(planet.id, 'bs-antena-2', 'antenna', frameDir(f, -30, 26)),
    prop(planet.id, 'bs-antena-patio-1', 'antenna', frameDir(f, 34, 16)),
    prop(planet.id, 'bs-antena-patio-2', 'antenna', frameDir(f, -34, -16)),
    prop(planet.id, 'bs-reactor-prop-1', 'reactor', frameDir(f, 28, -6)),
    prop(planet.id, 'bs-reactor-prop-2', 'reactor', frameDir(f, -28, 6)),

    // ==================== Ciudadela de Reactores (interior) ====================
    // Carteles de neón flanqueando la compuerta interior.
    prop(planet.id, 'bs-neon-ciudadela-1', 'neon_billboard', frameDir(f, 16, 12)),
    prop(planet.id, 'bs-neon-ciudadela-2', 'neon_billboard', frameDir(f, -16, 12)),
    // Terminales holográficas del patio de reactores.
    prop(planet.id, 'bs-holo-ciudadela-1', 'holo_pillar', frameDir(f, 14, 10)),
    prop(planet.id, 'bs-holo-ciudadela-2', 'holo_pillar', frameDir(f, -14, 10)),
    prop(planet.id, 'bs-holo-ciudadela-3', 'holo_pillar', frameDir(f, 0, -8)),
    // Reactores auxiliares y focos entre las pasarelas.
    prop(planet.id, 'bs-reactor-ciudadela-1', 'reactor', frameDir(f, 16, 4)),
    prop(planet.id, 'bs-reactor-ciudadela-2', 'reactor', frameDir(f, -16, -10)),
    prop(planet.id, 'bs-foco-ciudadela-1', 'spotlight', frameDir(f, 6, 12)),
    prop(planet.id, 'bs-foco-ciudadela-2', 'spotlight', frameDir(f, -6, 12)),

    // ==================== Periferia norte y flancos exteriores ====================
    // Skyline de la metrópolis tras la muralla norte.
    prop(planet.id, 'bs-torre-norte-1', 'cyber_tower', frameDir(f, 0, -34), { scale: 1.25 }),
    prop(planet.id, 'bs-torre-norte-2', 'cyber_tower', frameDir(f, 20, -34), { scale: 1.05 }),
    prop(planet.id, 'bs-torre-norte-3', 'cyber_tower', frameDir(f, -20, -34), { scale: 1.05 }),
    prop(planet.id, 'bs-torre-flanco-e', 'cyber_tower', frameDir(f, 40, -20), { scale: 0.95 }),
    prop(planet.id, 'bs-torre-flanco-o', 'cyber_tower', frameDir(f, -40, 20), { scale: 0.95 }),
    // Carteles de neón iluminando el muro agrietado del pasadizo.
    prop(planet.id, 'bs-neon-norte-1', 'neon_billboard', frameDir(f, 10, -30)),
    prop(planet.id, 'bs-neon-norte-2', 'neon_billboard', frameDir(f, -10, -30)),
    prop(planet.id, 'bs-neon-pasadizo-e', 'neon_billboard', frameDir(f, 44, -4)),
    prop(planet.id, 'bs-neon-pasadizo-o', 'neon_billboard', frameDir(f, -44, 4)),
    // Terminales holográficas junto a los muros agrietados.
    prop(planet.id, 'bs-holo-pasadizo-e', 'holo_pillar', frameDir(f, 36, 6)),
    prop(planet.id, 'bs-holo-pasadizo-o', 'holo_pillar', frameDir(f, -36, -6)),
    // Tubería de mantenimiento junto al conducto de teletransporte.
    prop(planet.id, 'bs-tuberia-teleport', 'pipe', frameDir(f, 38, 2), { yaw: 0.3 }),
    // Tuberías, antenas, reactores y focos de la periferia.
    prop(planet.id, 'bs-tuberia-periferia-1', 'pipe', frameDir(f, 0, -36)),
    prop(planet.id, 'bs-tuberia-periferia-2', 'pipe', frameDir(f, 24, -34)),
    prop(planet.id, 'bs-tuberia-periferia-3', 'pipe', frameDir(f, -24, -34)),
    prop(planet.id, 'bs-antena-norte-1', 'antenna', frameDir(f, 10, -32)),
    prop(planet.id, 'bs-antena-norte-2', 'antenna', frameDir(f, -10, -32)),
    prop(planet.id, 'bs-reactor-prop-3', 'reactor', frameDir(f, 0, -30)),
    prop(planet.id, 'bs-reactor-periferia-1', 'reactor', frameDir(f, 16, -28)),
    prop(planet.id, 'bs-reactor-periferia-2', 'reactor', frameDir(f, -16, -28)),
    prop(planet.id, 'bs-foco-4', 'spotlight', frameDir(f, -8, -28)),
    prop(planet.id, 'bs-foco-periferia-1', 'spotlight', frameDir(f, 20, -28)),
    prop(planet.id, 'bs-foco-periferia-2', 'spotlight', frameDir(f, -20, -28)),
    prop(planet.id, 'bs-foco-periferia-3', 'spotlight', frameDir(f, 36, 2)),
    prop(planet.id, 'bs-foco-periferia-4', 'spotlight', frameDir(f, -36, -2)),
    // Maquinaria dispersa por la cara oculta del planeta.
    prop(planet.id, 'bs-antena-4', 'antenna', [0.15, 0.9, 0.25]),
    prop(planet.id, 'bs-reactor-prop-4', 'reactor', [0.5, 0.75, -0.3]),
    prop(planet.id, 'bs-foco-5', 'spotlight', [0.35, 0.8, 0.45]),
    prop(planet.id, 'bs-torre-oculta-1', 'cyber_tower', [-0.4, 0.6, -0.6], { scale: 1.1 }),
    prop(planet.id, 'bs-neon-oculto-1', 'neon_billboard', [0.7, 0.3, 0.6]),
    prop(planet.id, 'bs-holo-oculto-1', 'holo_pillar', [-0.6, 0.2, 0.75]),
  ];

  const npcs: NpcSpec[] = [
    {
      id: 'zero7',
      name: 'Zero-7',
      role: 'Netrunner',
      planetId: planet.id,
      sphericalDir: frameDir(f, 9, 32),
      yaw: yawFace(
        f,
        9,
        32,
        new THREE.Vector3().addScaledVector(f.t1, -9).addScaledVector(f.t2, -8).normalize()
      ),
      accentColor: '#22d3ee',
      dialogue: [
        'Bienvenido a Neon Bastion. Los escáneres de la avenida queman cualquier disfraz y activan el lockdown. Roba la Tarjeta Maestra al Oficial del Ala Corporativa Oeste o vuela el muro agrietado hacia el conducto de teletransporte.',
        'La bóveda del Ala Corporativa esconde una tarjeta extra tras su muro agrietado: un barril bien colocado y la IA nunca sabrá que estuviste ahí. El Oficial es el de las líneas magenta y la antena holográfica.',
        'El conducto del flanco este te deja en pleno Patio de Reactores. Allí dentro: vallas láser con la palanca en la pasarela, un mech pesado junto al búnker y drones sobre la torre norte. Si salta la alarma, las compuertas se sellan de golpe.',
      ],
    },
  ];

  return { structures, objects, enemies, bubbles, props, npcs };
}

// ----------------------------------------------------------------------------
// Planeta 4 — Trono de KRONOS: NÚCLEO CARMESÍ (r = 106).
// Arena épica con 6 pilares de cobertura, 2 plataformas laterales elevadas
// con barriles, rocas para Estasis bien repartidas, 2 burbujas de agua en
// órbita para flanquear por el aire al Comandante KRONOS y un perímetro
// imperial de tronos-holograma, reactores, focos y antenas lejos del centro
// de pelea para no estorbar el combate.
// ----------------------------------------------------------------------------

function kronosContent(): {
  structures: StructureSpec[];
  objects: WorldObjectSpec[];
  enemies: EnemySpawnSpec[];
  bubbles: WaterBubbleSpec[];
  props: PropSpec[];
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

  // --- Perímetro imperial del Trono: terminales holográficas, reactores,
  // focos y antenas en el anillo exterior de la arena, lejos del centro de
  // pelea (pilares a 14-18 m, plataformas a 26 m) para no estorbar. ---
  const props: PropSpec[] = [
    // Tronos-holograma custodiando las diagonales de la arena.
    prop(planet.id, 'kr-holo-1', 'holo_pillar', frameDir(f, 30, 22)),
    prop(planet.id, 'kr-holo-2', 'holo_pillar', frameDir(f, -30, 22)),
    prop(planet.id, 'kr-holo-3', 'holo_pillar', frameDir(f, 30, -22)),
    prop(planet.id, 'kr-holo-4', 'holo_pillar', frameDir(f, -30, -22)),
    // Reactores del Núcleo Carmesí marcando los ejes cardinales.
    prop(planet.id, 'kr-reactor-1', 'reactor', frameDir(f, 0, 34), { scale: 1.3 }),
    prop(planet.id, 'kr-reactor-2', 'reactor', frameDir(f, 0, -34), { scale: 1.3 }),
    prop(planet.id, 'kr-reactor-3', 'reactor', frameDir(f, 34, 0), { scale: 1.3 }),
    prop(planet.id, 'kr-reactor-4', 'reactor', frameDir(f, -34, 0), { scale: 1.3 }),
    // Focos de la guardia imperial bañando de luz el perímetro.
    prop(planet.id, 'kr-foco-1', 'spotlight', frameDir(f, 24, 28)),
    prop(planet.id, 'kr-foco-2', 'spotlight', frameDir(f, -24, 28)),
    prop(planet.id, 'kr-foco-3', 'spotlight', frameDir(f, 24, -28)),
    prop(planet.id, 'kr-foco-4', 'spotlight', frameDir(f, -24, -28)),
    // Antenas del Núcleo transmitiendo la voluntad de KRONOS.
    prop(planet.id, 'kr-antena-1', 'antenna', frameDir(f, 36, 12)),
    prop(planet.id, 'kr-antena-2', 'antenna', frameDir(f, -36, 12)),
    prop(planet.id, 'kr-antena-3', 'antenna', frameDir(f, 36, -12)),
    prop(planet.id, 'kr-antena-4', 'antenna', frameDir(f, -36, -12)),
  ];

  return { structures, objects, enemies, bubbles, props };
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
  grassZones: [...luna.grass, ...verdant.grass, ...cryo.grass],
  props: [...verdant.props, ...cryo.props, ...bastion.props, ...kronos.props],
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
