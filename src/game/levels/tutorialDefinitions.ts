import * as THREE from 'three';
import type {
  CharacterId,
  EnemySpawnSpec,
  GalaxySpec,
  GrassZoneSpec,
  InteractableKind,
  NpcSpec,
  PlanetSpec,
  PropKind,
  PropSpec,
  RestrictedZoneSpec,
  StructureKind,
  StructureSpec,
  WaterBubbleSpec,
  WorldObjectSpec,
} from '../types';

// ============================================================================
// PASO B — MINI-NIVELES DE TUTORIAL JUGABLES.
//
// Cinco niveles cortos y autocontenidos, uno por mecánica central del juego:
//   1 · Parkour, Combate y Parry      (movimiento + torreta + parry)
//   2 · Estasis, Fijado y Explosivos  (R/C, Q, Clic Izq.)
//   3 · Sigilo, Advertencia y Disfraces (hierba, zona restringida, [E])
//   4 · Digger y Axel                 (subsuelo, agua, flores)
//   5 · Gravity Shift                 (salto interplanetario)
//
// Cada spec trae su PROPIA GalaxySpec: un sistema mínimo (1 o 2 planetas) con
// el mismo contrato que la campaña, de modo que GameEngine lo carga con el
// mismo código (initPlanetTerrain, WorldObjectsManager, PlayerController).
// El layout se escribe en METROS sobre el plano tangente de un `BaseFrame`
// (proyección gnomónica), igual que en levelDefinitions.ts.
// ============================================================================

export type TutorialId =
  | 'tut-movement'
  | 'tut-stasis'
  | 'tut-stealth'
  | 'tut-squad'
  | 'tut-gravity';

export interface TutorialSpec {
  id: TutorialId;
  order: number;
  title: string;
  badge: string;
  summary: string;
  recommendedCharacter: CharacterId;
  lessonSteps: string[];
  goalMode: 'generators' | 'reach_target_planet';
  targetPlanetId?: string;
  galaxy: GalaxySpec;
}

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

/** Tangente que va del punto (fromAx, fromAz) al punto (toAx, toAz) del frame. */
function tangentTo(
  f: BaseFrame,
  fromAx: number,
  fromAz: number,
  toAx: number,
  toAz: number
): THREE.Vector3 {
  return new THREE.Vector3()
    .addScaledVector(f.t1, toAx - fromAx)
    .addScaledVector(f.t2, toAz - fromAz)
    .normalize();
}

/**
 * Yaw que alinea el eje X local de la estructura con el tangente `along`.
 * Misma convención que createStructureCollider / buildStructureMesh
 * (setFromUnitVectors(up, dir) * yaw).
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

/** Almena caminable sobre una plataforma elevada (borde del fuerte). */
function battlement(
  f: BaseFrame,
  id: string,
  axM: number,
  azM: number,
  along: 't1' | 't2',
  lengthM: number,
  altitudeOffset: number,
  color: string
): StructureSpec {
  return struct(f, id, 'wall', axM, azM, along, [lengthM / 2, 1.2, 0.5], color, {
    altitudeOffset,
    passableUnderground: true,
  });
}

function towerAt(
  f: BaseFrame,
  id: string,
  axM: number,
  azM: number,
  color: string,
  height = 8
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

/** Compuerta bloqueada encajada en un hueco de muralla. */
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

/** Pared rompible que sustituye un tramo de muralla (hueco sellado). */
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

/** Palanca de pedestal: con `linkedGateId` abre su compuerta. */
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

/** Prop ambiental temático (flora, rocas, cajas, faros...). */
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

/** Línea determinista de props entre dos puntos del plano tangente. */
function propLine(
  f: BaseFrame,
  out: PropSpec[],
  prefix: string,
  kind: PropKind,
  from: [number, number],
  to: [number, number],
  count: number,
  options: { scale?: number } = {}
): void {
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const ax = from[0] + (to[0] - from[0]) * t;
    const az = from[1] + (to[1] - from[1]) * t;
    out.push(
      prop(f.planetId, `${prefix}-${i + 1}`, kind, frameDir(f, ax, az), {
        scale: options.scale,
      })
    );
  }
}

/** Anillo determinista de props alrededor del centro de un frame. */
function propRing(
  f: BaseFrame,
  out: PropSpec[],
  prefix: string,
  kind: PropKind,
  count: number,
  radiusM: number,
  options: { scale?: number; offsetAngle?: number } = {}
): void {
  for (let i = 0; i < count; i++) {
    const a = (options.offsetAngle ?? 0) + (i / count) * Math.PI * 2;
    out.push(
      prop(f.planetId, `${prefix}-${i + 1}`, kind, frameDir(f, Math.cos(a) * radiusM, Math.sin(a) * radiusM), {
        scale: options.scale,
      })
    );
  }
}

/** Waypoints de una patrulla circular sobre la superficie del planeta. */
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

/** Vigía estacionario sobre una torre o plataforma elevada. */
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

// ============================================================================
// 1 · PARKOUR, COMBATE Y PARRY — Arena Esmeralda (r = 42)
// ============================================================================

const MOVEMENT_PLANET: PlanetSpec = {
  id: 'tut-mov-planeta',
  order: 0,
  name: 'Arena Esmeralda',
  subtitle: 'Parkour, Combate y Parry',
  biome: 'tutorial',
  center: [0, 0, 0],
  radius: 42,
  gravityStrength: 1.0,
  surfaceColor: '#34d399',
  patchColor: '#7c3aed',
  atmosphereColor: '#a7f3d0',
  hasOrbitalRings: true,
  ringColor: '#a78bfa',
  unlockedByPlanetId: null,
};

function movementGalaxy(): GalaxySpec {
  const planet = MOVEMENT_PLANET;
  const f = baseFrame(planet.id, [0.15, 0.92, 0.36], planet.radius);
  const PLATFORM_ALT = 3.5;
  const PLATFORM_TOP = PLATFORM_ALT + 1; // techo caminable de la plataforma
  const STONE = '#475569';
  const STONE_DARK = '#334155';

  // Fuerte elevado: plataforma de piedra 14 x 14 m con almenas en tres bordes
  // (el borde sur queda abierto a la cadena de flores gigantes).
  const structures: StructureSpec[] = [
    struct(f, 'tut-mov-plataforma', 'platform', 0, 0, null, [7, 1, 7], STONE, {
      altitudeOffset: PLATFORM_ALT,
    }),
    battlement(f, 'tut-mov-almena-n', 0, -7, 't1', 14, PLATFORM_ALT, STONE_DARK),
    battlement(f, 'tut-mov-almena-o', -7, 0, 't2', 14, PLATFORM_ALT, STONE_DARK),
    battlement(f, 'tut-mov-almena-e', 7, 0, 't2', 14, PLATFORM_ALT, STONE_DARK),
    towerAt(f, 'tut-mov-torre-no', -7, -7, STONE, 6),
    towerAt(f, 'tut-mov-torre-ne', 7, -7, STONE, 6),
  ];

  const objects: WorldObjectSpec[] = [
    // Generador de entrenamiento sobre el fuerte (objetivo del tutorial).
    obj(planet.id, 'tut-mov-generador', 'generator', frameDir(f, 0, 2), {
      altitudeOffset: PLATFORM_TOP,
    }),
    // Rocas y cajas de práctica para Estasis y melee.
    obj(planet.id, 'tut-mov-roca-1', 'rock', frameDir(f, 12, 16)),
    obj(planet.id, 'tut-mov-roca-2', 'rock', frameDir(f, -12, 14)),
    obj(planet.id, 'tut-mov-caja-1', 'crate', frameDir(f, 8, 20)),
    obj(planet.id, 'tut-mov-caja-2', 'crate', frameDir(f, -8, 22)),
    obj(planet.id, 'tut-mov-caja-3', 'crate', frameDir(f, 6, 16)),
    obj(planet.id, 'tut-mov-caja-4', 'crate', frameDir(f, -6, 14)),
  ];

  const enemies: EnemySpawnSpec[] = [
    // Torreta de entrenamiento: sus proyectiles se DEVUELVEN con [F] Parry.
    {
      kind: 'turret',
      planetId: planet.id,
      patrolDirs: [frameDir(f, 0, -2)],
      altitudeOffset: PLATFORM_TOP,
    },
    // Dron de práctica orbitando el fuerte.
    {
      kind: 'drone',
      planetId: planet.id,
      patrolDirs: patrolCircle(...frameDir(f, 0, 0), 0.14, 4),
      altitudeOffset: 6.5,
    },
  ];

  const grass: GrassZoneSpec[] = [
    {
      id: 'tut-mov-hierba',
      planetId: planet.id,
      sphericalDir: frameDir(f, 14, 22),
      angularRadius: 0.1,
    },
  ];

  const npcs: NpcSpec[] = [
    {
      id: 'tut-mov-aria',
      name: 'Instructor Aria',
      role: 'Instructora de Combate',
      planetId: planet.id,
      sphericalDir: frameDir(f, 4, 21),
      yaw: yawFace(f, 4, 21, tangentTo(f, 4, 21, 0, 24)),
      accentColor: '#34d399',
      dialogue: [
        'Bienvenido a la Arena Esmeralda. Salta la cadena de flores gigantes: cada una te lanza 10 m hacia arriba.',
        'La torreta del fuerte dispara proyectiles lentos. Pulsa [F] justo cuando el proyectil te toque: el Parry lo devuelve y revienta a quien lo disparó.',
        'El dron te persigue en el aire: usa el doble salto y el Ancla (ESPACIO) para no perder altura. El generador del fuerte es tu objetivo.',
      ],
    },
  ];

  const props: PropSpec[] = [
    // Cadena de flores gigantes: del spawn al borde sur del fuerte.
    ...(() => {
      const out: PropSpec[] = [];
      propLine(f, out, 'tut-mov-flor', 'giant_flower', [0, 20], [0, 9], 3);
      return out;
    })(),
    prop(planet.id, 'tut-mov-seta-1', 'glow_mushroom', frameDir(f, 10, 18)),
    prop(planet.id, 'tut-mov-seta-2', 'glow_mushroom', frameDir(f, -10, 20)),
    prop(planet.id, 'tut-mov-seta-3', 'glow_mushroom', frameDir(f, -8, 8)),
    prop(planet.id, 'tut-mov-roca-3', 'rock', frameDir(f, 14, 10), { scale: 1.2 }),
    prop(planet.id, 'tut-mov-roca-4', 'rock', frameDir(f, -14, 10), { scale: 1.1 }),
    prop(planet.id, 'tut-mov-roca-5', 'rock', frameDir(f, 0, 30)),
    prop(planet.id, 'tut-mov-foco-1', 'spotlight', frameDir(f, 12, 4)),
    prop(planet.id, 'tut-mov-foco-2', 'spotlight', frameDir(f, -12, 4)),
    prop(planet.id, 'tut-mov-antena-1', 'antenna', frameDir(f, 0, -14)),
  ];

  return {
    skyTopColor: '#05010f',
    skyBottomColor: '#4c1d95',
    planets: [planet],
    structures,
    waterBubbles: [],
    grassZones: grass,
    restrictedZones: [],
    objects,
    enemies,
    npcs,
    props,
    spawnPlanetId: planet.id,
    spawnDir: frameDir(f, 0, 24),
  };
}

// ============================================================================
// 2 · ESTASIS, FIJADO Y EXPLOSIVOS — Bóveda de Cristal (r = 44)
// ============================================================================

const STASIS_PLANET: PlanetSpec = {
  id: 'tut-stasis-planeta',
  order: 0,
  name: 'Bóveda de Cristal',
  subtitle: 'Estasis, Fijado y Explosivos',
  biome: 'tutorial',
  center: [0, 0, 0],
  radius: 44,
  gravityStrength: 1.0,
  surfaceColor: '#22d3ee',
  patchColor: '#4c1d95',
  atmosphereColor: '#c4b5fd',
  hasIcePatches: true,
  unlockedByPlanetId: null,
};

function stasisGalaxy(): GalaxySpec {
  const planet = STASIS_PLANET;
  const f = baseFrame(planet.id, [-0.32, 0.88, 0.36], planet.radius);
  const WALL = '#5b21b6';
  const WALL_DARK = '#3b0764';

  // Bóveda cerrada 16 x 12 m: compuerta frontal (palanca) + muro agrietado
  // trasero (barril). El generador vive DENTRO.
  const structures: StructureSpec[] = [
    // Frontal (az = +6): 5.5 + 5 (compuerta) + 5.5 = 16 m exactos.
    wallSeg(f, 'tut-stasis-wall-f-l', -5.25, 6, 't1', 5.5, 4.5, WALL),
    wallSeg(f, 'tut-stasis-wall-f-r', 5.25, 6, 't1', 5.5, 4.5, WALL),
    // Trasera (az = -6): 5.5 + 5 (muro agrietado) + 5.5 = 16 m exactos.
    wallSeg(f, 'tut-stasis-wall-b-l', -5.25, -6, 't1', 5.5, 4.5, WALL),
    wallSeg(f, 'tut-stasis-wall-b-r', 5.25, -6, 't1', 5.5, 4.5, WALL),
    // Laterales completos (12 m).
    wallSeg(f, 'tut-stasis-wall-e', 8, 0, 't2', 12, 4.5, WALL),
    wallSeg(f, 'tut-stasis-wall-o', -8, 0, 't2', 12, 4.5, WALL),
    towerAt(f, 'tut-stasis-torre', 8, 6, WALL_DARK, 7),
  ];

  const objects: WorldObjectSpec[] = [
    // Compuerta frontal: la abre la palanca (o una roca lanzada a la palanca).
    lockedGate(f, 'tut-stasis-compuerta', 0, 6, 't1', [2.5, 3.6, 0.6]),
    // Muro agrietado trasero: 1 barril explosivo lo revienta.
    breakableWall(f, 'tut-stasis-muro', 0, -6, 't1', [2.5, 3.6, 0.6]),
    // Palanca a distancia, fuera del alcance del cuerpo a cuerpo.
    switchLever(f, 'tut-stasis-palanca', 12, 8, { linkedGateId: 'tut-stasis-compuerta' }),
    // Generador dentro de la bóveda.
    obj(planet.id, 'tut-stasis-generador', 'generator', frameDir(f, 0, -2)),
    // Munición de Estasis: rocas y barriles alrededor del spawn.
    obj(planet.id, 'tut-stasis-roca-1', 'rock', frameDir(f, 5, 18)),
    obj(planet.id, 'tut-stasis-roca-2', 'rock', frameDir(f, -5, 18)),
    obj(planet.id, 'tut-stasis-roca-3', 'rock', frameDir(f, 2, 20)),
    obj(planet.id, 'tut-stasis-roca-4', 'rock', frameDir(f, -2, 21)),
    obj(planet.id, 'tut-stasis-barril-1', 'barrel_explosive', frameDir(f, 8, 14)),
    obj(planet.id, 'tut-stasis-barril-2', 'barrel_explosive', frameDir(f, -8, 14)),
    obj(planet.id, 'tut-stasis-barril-3', 'barrel_explosive', frameDir(f, 0, -10)),
    obj(planet.id, 'tut-stasis-caja-1', 'crate', frameDir(f, 10, 20)),
    obj(planet.id, 'tut-stasis-caja-2', 'crate', frameDir(f, 12, 22)),
    obj(planet.id, 'tut-stasis-caja-3', 'crate', frameDir(f, -12, 22)),
  ];

  const enemies: EnemySpawnSpec[] = [
    // Guardia de prácticas patrullando la entrada de la bóveda.
    {
      kind: 'guard',
      planetId: planet.id,
      patrolDirs: patrolCircle(...frameDir(f, 0, 10), 0.05, 4),
    },
  ];

  const npcs: NpcSpec[] = [
    {
      id: 'tut-stasis-vega',
      name: 'Técnico Vega',
      role: 'Especialista en Estasis',
      planetId: planet.id,
      sphericalDir: frameDir(f, -6, 20),
      yaw: yawFace(f, -6, 20, tangentTo(f, -6, 20, 0, 22)),
      accentColor: '#22d3ee',
      dialogue: [
        'La Bóveda de Cristal se abre con la palanca del flanco este... pero está demasiado lejos para llegar andando sin que te vean.',
        'Pulsa [R] o [C] para capturar rocas y barriles en Estasis (hasta 4). Con [Q] fijas el objetivo: palanca, muro agrietado o generador.',
        'Lanza con Clic Izquierdo: una roca lanzada a la palanca la activa a distancia. Un barril explosivo revienta el muro agrietado trasero.',
      ],
    },
  ];

  const props: PropSpec[] = [
    prop(planet.id, 'tut-stasis-seta-1', 'glow_mushroom', frameDir(f, 14, 16)),
    prop(planet.id, 'tut-stasis-seta-2', 'glow_mushroom', frameDir(f, -14, 12)),
    prop(planet.id, 'tut-stasis-roca-5', 'rock', frameDir(f, 16, 8), { scale: 1.15 }),
    prop(planet.id, 'tut-stasis-roca-6', 'rock', frameDir(f, -16, 6), { scale: 1.05 }),
    prop(planet.id, 'tut-stasis-foco-1', 'spotlight', frameDir(f, 6, 8)),
    prop(planet.id, 'tut-stasis-foco-2', 'spotlight', frameDir(f, -6, 8)),
    prop(planet.id, 'tut-stasis-antena-1', 'antenna', frameDir(f, 0, -14)),
  ];

  return {
    skyTopColor: '#05010f',
    skyBottomColor: '#1e1b4b',
    planets: [planet],
    structures,
    waterBubbles: [],
    grassZones: [],
    restrictedZones: [],
    objects,
    enemies,
    npcs,
    props,
    spawnPlanetId: planet.id,
    spawnDir: frameDir(f, 0, 22),
  };
}

// ============================================================================
// 3 · SIGILO, MODO ADVERTENCIA Y DISFRACES — Jardín de Sombras (r = 46)
// ============================================================================

const STEALTH_PLANET: PlanetSpec = {
  id: 'tut-stealth-planeta',
  order: 0,
  name: 'Jardín de Sombras',
  subtitle: 'Sigilo, Advertencia y Disfraces',
  biome: 'tutorial',
  center: [0, 0, 0],
  radius: 46,
  gravityStrength: 1.0,
  surfaceColor: '#4ade80',
  patchColor: '#065f46',
  atmosphereColor: '#bbf7d0',
  unlockedByPlanetId: null,
};

function stealthGalaxy(): GalaxySpec {
  const planet = STEALTH_PLANET;
  const f = baseFrame(planet.id, [0.42, 0.82, 0.38], planet.radius);
  const WALL = '#3f6212';
  const WALL_DARK = '#1a2e05';

  // Patio del Templo 20 x 16 m (x -10..10, z -14..2), cerrado, con compuerta
  // de tarjeta al frente. El generador vive dentro.
  const structures: StructureSpec[] = [
    // Frontal (az = +2): 7.5 + 5 (compuerta) + 7.5 = 20 m exactos.
    wallSeg(f, 'tut-stealth-wall-f-l', -6.25, 2, 't1', 7.5, 5, WALL),
    wallSeg(f, 'tut-stealth-wall-f-r', 6.25, 2, 't1', 7.5, 5, WALL),
    // Trasera (az = -14) y laterales (16 m).
    wallSeg(f, 'tut-stealth-wall-b', 0, -14, 't1', 20, 5, WALL),
    wallSeg(f, 'tut-stealth-wall-e', 10, -6, 't2', 16, 5, WALL),
    wallSeg(f, 'tut-stealth-wall-o', -10, -6, 't2', 16, 5, WALL),
    towerAt(f, 'tut-stealth-torre-e', 10, 2, WALL_DARK, 8),
    towerAt(f, 'tut-stealth-torre-o', -10, 2, WALL_DARK, 8),
  ];

  const objects: WorldObjectSpec[] = [
    // Compuerta de tarjeta: se abre con [E] si llevas una tarjeta robada.
    lockedGate(f, 'tut-stealth-compuerta', 0, 2, 't1', [2.5, 3.8, 0.6], {
      requiresKeycard: true,
    }),
    // Generador del templo.
    obj(planet.id, 'tut-stealth-generador', 'generator', frameDir(f, 0, -8)),
    // Rocas y cajas del jardín público (Estasis y distracciones).
    obj(planet.id, 'tut-stealth-roca-1', 'rock', frameDir(f, 8, 20)),
    obj(planet.id, 'tut-stealth-roca-2', 'rock', frameDir(f, -8, 18)),
    obj(planet.id, 'tut-stealth-caja-1', 'crate', frameDir(f, 12, 24)),
  ];

  const enemies: EnemySpawnSpec[] = [
    // Guardia aislado del jardín: [E] por la espalda -> tarjeta + disfraz.
    {
      kind: 'guard',
      planetId: planet.id,
      patrolDirs: patrolCircle(...frameDir(f, 0, 16), 0.05, 4),
      dropsKeycard: true,
    },
    // Guardia del patio interior (patrulla alrededor del generador).
    {
      kind: 'guard',
      planetId: planet.id,
      patrolDirs: patrolCircle(...frameDir(f, 0, -8), 0.05, 4),
    },
    // Oficial del patio: desenmascara si te acercas demasiado con disfraz.
    {
      kind: 'officer',
      planetId: planet.id,
      patrolDirs: patrolCircle(...frameDir(f, 0, -2), 0.06, 4),
    },
    // Vigía sobre la torre este, oteando el patio.
    lookout(planet.id, frameDir(f, 10, 2), 7.6, frameDir(f, 0, -6)),
  ];

  const grass: GrassZoneSpec[] = [
    {
      id: 'tut-stealth-hierba-spawn',
      planetId: planet.id,
      sphericalDir: frameDir(f, 0, 22),
      angularRadius: 0.16,
    },
    {
      id: 'tut-stealth-hierba-o',
      planetId: planet.id,
      sphericalDir: frameDir(f, -9, 14),
      angularRadius: 0.13,
    },
    {
      id: 'tut-stealth-hierba-e',
      planetId: planet.id,
      sphericalDir: frameDir(f, 9, 12),
      angularRadius: 0.13,
    },
    {
      id: 'tut-stealth-hierba-acceso',
      planetId: planet.id,
      sphericalDir: frameDir(f, 0, 7),
      angularRadius: 0.11,
    },
  ];

  const zones: RestrictedZoneSpec[] = [
    {
      id: 'tut-stealth-patio',
      planetId: planet.id,
      sphericalDir: frameDir(f, 0, -6),
      angularRadius: 0.3,
      label: 'Patio del Templo',
    },
  ];

  const npcs: NpcSpec[] = [
    {
      id: 'tut-stealth-sombra',
      name: 'Sombra-0',
      role: 'Mentora de Sigilo',
      planetId: planet.id,
      sphericalDir: frameDir(f, 5, 22),
      yaw: yawFace(f, 5, 22, tangentTo(f, 5, 22, 0, 26)),
      accentColor: '#a3e635',
      dialogue: [
        'Este jardín es zona PÚBLICA: camina tranquilo, nadie te mira mal. La hierba alta y los helechos te ocultan de las miradas.',
        'Cruza el arco hacia el Patio del Templo y entrarás en zona RESTRINGIDA: el aviso pasa a ámbar y cualquier guardia que te vea dará la alarma.',
        'El guardia del sendero va solo: acércate por la espalda y pulsa [E] para noquearlo. Soltará su tarjeta y podrás usar su uniforme... pero el oficial del patio te desenmascara si te acercas.',
      ],
    },
  ];

  const props: PropSpec[] = [
    // Setos de helechos: cobertura de sigilo a ambos lados del sendero.
    ...(() => {
      const out: PropSpec[] = [];
      propLine(f, out, 'tut-stealth-helecho-o', 'fern_cluster', [-6, 24], [-6, 10], 4);
      propLine(f, out, 'tut-stealth-helecho-e', 'fern_cluster', [6, 24], [6, 10], 4);
      return out;
    })(),
    prop(planet.id, 'tut-stealth-palmera-1', 'palm_tree', frameDir(f, 14, 20)),
    prop(planet.id, 'tut-stealth-palmera-2', 'palm_tree', frameDir(f, -14, 16)),
    prop(planet.id, 'tut-stealth-palmera-3', 'palm_tree', frameDir(f, 16, 8)),
    prop(planet.id, 'tut-stealth-seta-1', 'glow_mushroom', frameDir(f, -12, 24)),
    prop(planet.id, 'tut-stealth-seta-2', 'glow_mushroom', frameDir(f, 12, 16)),
    prop(planet.id, 'tut-stealth-roca-3', 'rock', frameDir(f, 18, 22), { scale: 1.1 }),
    prop(planet.id, 'tut-stealth-roca-4', 'rock', frameDir(f, -18, 20), { scale: 1.05 }),
    prop(planet.id, 'tut-stealth-estatua-1', 'ancient_statue', frameDir(f, 0, 4)),
    prop(planet.id, 'tut-stealth-foco-1', 'spotlight', frameDir(f, 8, 4)),
    prop(planet.id, 'tut-stealth-foco-2', 'spotlight', frameDir(f, -8, 4)),
  ];

  return {
    skyTopColor: '#05010f',
    skyBottomColor: '#064e3b',
    planets: [planet],
    structures,
    waterBubbles: [],
    grassZones: grass,
    restrictedZones: zones,
    objects,
    enemies,
    npcs,
    props,
    spawnPlanetId: planet.id,
    spawnDir: frameDir(f, 0, 26),
  };
}

// ============================================================================
// 4 · DIGGER Y AXEL — Taller Subterráneo (r = 48)
// ============================================================================

const SQUAD_PLANET: PlanetSpec = {
  id: 'tut-squad-planeta',
  order: 0,
  name: 'Taller Subterráneo',
  subtitle: 'Digger y Axel: Subsuelo, Agua y Flores',
  biome: 'tutorial',
  center: [0, 0, 0],
  radius: 48,
  gravityStrength: 1.0,
  surfaceColor: '#f59e0b',
  patchColor: '#0e7490',
  atmosphereColor: '#fde68a',
  hasOrbitalRings: true,
  ringColor: '#22d3ee',
  unlockedByPlanetId: null,
};

function squadGalaxy(): GalaxySpec {
  const planet = SQUAD_PLANET;
  const f = baseFrame(planet.id, [0.3, 0.86, 0.42], planet.radius);
  const WALL = '#78716c';
  const WALL_DARK = '#44403c';
  const SKY_ALT = 14;
  const SKY_TOP = SKY_ALT + 1; // techo caminable de la plataforma orbital

  const structures: StructureSpec[] = [
    // --- Parte 1: recinto fortificado 24 x 12 m con muros de 7 m. La muralla
    // frontal es `passableUnderground`: Digger entra excavando por debajo. ---
    wallSeg(f, 'tut-squad-muralla', 0, 12, 't1', 24, 7, WALL, true),
    wallSeg(f, 'tut-squad-muralla-o', -12, 6, 't2', 12, 7, WALL),
    wallSeg(f, 'tut-squad-muralla-e', 12, 6, 't2', 12, 7, WALL),
    wallSeg(f, 'tut-squad-muralla-fondo', 0, 0, 't1', 24, 7, WALL),
    towerAt(f, 'tut-squad-torre-o', -12, 12, WALL_DARK, 9),
    towerAt(f, 'tut-squad-torre-e', 12, 12, WALL_DARK, 9),
    // --- Parte 2: corredor aéreo cerrado, con la compuerta de la palanca ---
    wallSeg(f, 'tut-squad-corredor-o', -4, -6, 't2', 8, 4, WALL),
    wallSeg(f, 'tut-squad-corredor-e', 4, -6, 't2', 8, 4, WALL),
    wallSeg(f, 'tut-squad-corredor-n', 0, -10, 't1', 8, 4, WALL),
    // Plataforma orbital (fuerte del cielo) donde vive el generador 2.
    struct(f, 'tut-squad-plataforma', 'platform', 0, -18, null, [6, 1, 6], WALL_DARK, {
      altitudeOffset: SKY_ALT,
    }),
  ];

  const objects: WorldObjectSpec[] = [
    // Generador 1: tras la muralla, solo alcanzable excavando.
    obj(planet.id, 'tut-squad-generador-1', 'generator', frameDir(f, 0, 6)),
    // Palanca que abre el corredor aéreo.
    switchLever(f, 'tut-squad-palanca', 8, 8, { linkedGateId: 'tut-squad-compuerta' }),
    // Compuerta del corredor (8 m, encaja con las paredes laterales).
    lockedGate(f, 'tut-squad-compuerta', 0, -2, 't1', [4, 3.8, 0.6]),
    // Generador 2: en la plataforma orbital.
    obj(planet.id, 'tut-squad-generador-2', 'generator', frameDir(f, 0, -18), {
      altitudeOffset: SKY_TOP,
    }),
    // Mina sísmica delante de la muralla: aviso de peligro del subsuelo.
    obj(planet.id, 'tut-squad-mina', 'seismic_mine', frameDir(f, 0, 16)),
    // Rocas y cajas de práctica.
    obj(planet.id, 'tut-squad-roca-1', 'rock', frameDir(f, 10, 20)),
    obj(planet.id, 'tut-squad-roca-2', 'rock', frameDir(f, -10, 20)),
    obj(planet.id, 'tut-squad-caja-1', 'crate', frameDir(f, 6, 22)),
    obj(planet.id, 'tut-squad-caja-2', 'crate', frameDir(f, 14, 24)),
    obj(planet.id, 'tut-squad-caja-3', 'crate', frameDir(f, -14, 24)),
  ];

  const enemies: EnemySpawnSpec[] = [
    // Guardia patrullando el patio interior de la muralla.
    {
      kind: 'guard',
      planetId: planet.id,
      patrolDirs: patrolCircle(...frameDir(f, 0, 8), 0.05, 4),
    },
  ];

  const npcs: NpcSpec[] = [
    {
      id: 'tut-squad-taller',
      name: 'Capataz Bruno',
      role: 'Jefe de Taller',
      planetId: planet.id,
      sphericalDir: frameDir(f, -6, 22),
      yaw: yawFace(f, -6, 22, tangentTo(f, -6, 22, 0, 26)),
      accentColor: '#f59e0b',
      dialogue: [
        'La muralla del perímetro es demasiado alta para saltarla. Pulsa [2] para ser Digger y mantén [SHIFT] para excavar por debajo.',
        'Con Digger en el suelo también puedes cruzar el planeta entero: [ESPACIO] inicia el cruce del núcleo y sales por el otro lado.',
        'La palanca abre el corredor aéreo. Dentro, la flor gigante te lanza a la primera burbuja: cambia a Axel con [3] y nada a 2.35x hasta la plataforma orbital.',
      ],
    },
  ];

  const props: PropSpec[] = [
    // Flor trampolín del corredor aéreo (lanzadera a la burbuja 1).
    prop(planet.id, 'tut-squad-flor', 'giant_flower', frameDir(f, 0, -7)),
    prop(planet.id, 'tut-squad-seta-1', 'glow_mushroom', frameDir(f, 12, 18)),
    prop(planet.id, 'tut-squad-seta-2', 'glow_mushroom', frameDir(f, -12, 16)),
    prop(planet.id, 'tut-squad-roca-3', 'rock', frameDir(f, 16, 12), { scale: 1.2 }),
    prop(planet.id, 'tut-squad-roca-4', 'rock', frameDir(f, -16, 10), { scale: 1.1 }),
    prop(planet.id, 'tut-squad-reactor-1', 'reactor', frameDir(f, 10, 4)),
    prop(planet.id, 'tut-squad-reactor-2', 'reactor', frameDir(f, -10, 4)),
    prop(planet.id, 'tut-squad-antena-1', 'antenna', frameDir(f, 0, 30)),
  ];

  // Dos burbujas de agua encadenadas: suelo -> plataforma orbital.
  const bubbles: WaterBubbleSpec[] = [
    orbitBubble('tut-squad-burbuja-1', planet, frameDir(f, 0, -8), 6, 4.5),
    orbitBubble('tut-squad-burbuja-2', planet, frameDir(f, 0, -13), 11.5, 4.5),
  ];

  return {
    skyTopColor: '#05010f',
    skyBottomColor: '#0e7490',
    planets: [planet],
    structures,
    waterBubbles: bubbles,
    grassZones: [],
    restrictedZones: [],
    objects,
    enemies,
    npcs,
    props,
    spawnPlanetId: planet.id,
    spawnDir: frameDir(f, 0, 26),
  };
}

// ============================================================================
// 5 · GRAVITY SHIFT Y SALTO INTERPLANETARIO — Sistema Gemelo
// ============================================================================

const GRAVITY_ORIGIN: PlanetSpec = {
  id: 'tut-grav-origen',
  order: 0,
  name: 'Orbe Origen',
  subtitle: 'Gravity Shift y Salto Interplanetario',
  biome: 'tutorial',
  center: [0, 0, 0],
  radius: 36,
  gravityStrength: 1.0,
  surfaceColor: '#a78bfa',
  patchColor: '#4c1d95',
  atmosphereColor: '#ddd6fe',
  unlockedByPlanetId: null,
};

const GRAVITY_DESTINATION: PlanetSpec = {
  id: 'tut-grav-destino',
  order: 1,
  name: 'Orbe Destino',
  subtitle: 'Planeta de Aterrizaje',
  biome: 'tutorial',
  center: [0, 0, -128],
  radius: 40,
  gravityStrength: 1.0,
  surfaceColor: '#22d3ee',
  patchColor: '#0e7490',
  atmosphereColor: '#a5f3fc',
  hasOrbitalRings: true,
  ringColor: '#67e8f9',
  unlockedByPlanetId: null,
};

function gravityGalaxy(): GalaxySpec {
  const origin = GRAVITY_ORIGIN;
  const destination = GRAVITY_DESTINATION;
  // Origen: el spawn mira al Destino (que vive en -Z).
  const fA = baseFrame(origin.id, [0, 0, -1], origin.radius);
  // Destino: la cara que mira al Origen (+Z).
  const fB = baseFrame(destination.id, [0, 0, 1], destination.radius);

  const structures: StructureSpec[] = [
    // Faro del Origen: referencia visual del punto de salto.
    towerAt(fA, 'tut-grav-faro-origen', 0, -12, '#6d28d9', 7),
    // Baliza del Destino: torre junto al generador de aterrizaje.
    towerAt(fB, 'tut-grav-faro-destino', 0, -10, '#0e7490', 8),
  ];

  const objects: WorldObjectSpec[] = [
    // Generador-baliza del Destino: aterrizar o destruirlo completa el tutorial.
    obj(destination.id, 'tut-grav-generador', 'generator', frameDir(fB, 0, 0)),
    // Rocas y cajas del Origen (práctica de Estasis antes del salto).
    obj(origin.id, 'tut-grav-roca-1', 'rock', frameDir(fA, 8, 6)),
    obj(origin.id, 'tut-grav-roca-2', 'rock', frameDir(fA, -8, 5)),
    obj(origin.id, 'tut-grav-caja-1', 'crate', frameDir(fA, 10, 10)),
    // Rocas del Destino (por si aterrizas lejos de la baliza).
    obj(destination.id, 'tut-grav-roca-3', 'rock', frameDir(fB, 10, 8)),
    obj(destination.id, 'tut-grav-roca-4', 'rock', frameDir(fB, -10, 6)),
  ];

  const npcs: NpcSpec[] = [
    {
      id: 'tut-grav-lyra',
      name: 'Navegante Lyra',
      role: 'Piloto Orbital',
      planetId: origin.id,
      sphericalDir: frameDir(fA, 4, 4),
      yaw: yawFace(fA, 4, 4, tangentTo(fA, 4, 4, 0, 0)),
      accentColor: '#a78bfa',
      dialogue: [
        'El Orbe Destino está a 128 m: demasiado lejos para un salto normal, perfecto para el Gravity Shift.',
        'Mantén el Clic Derecho pulsado: el tiempo cae a 0.2x y la cámara apunta. Mira el planeta Destino hasta que el HUD lo marque como objetivo.',
        'Suelta el Clic Derecho para surfear el espacio. Si aterrizas en el Destino (o destruyes su generador-baliza) el tutorial queda completado.',
      ],
    },
  ];

  const props: PropSpec[] = [
    prop(origin.id, 'tut-grav-seta-1', 'glow_mushroom', frameDir(fA, -4, 3)),
    prop(origin.id, 'tut-grav-seta-2', 'glow_mushroom', frameDir(fA, 5, -3)),
    prop(origin.id, 'tut-grav-seta-3', 'glow_mushroom', frameDir(fA, -6, -6)),
    prop(origin.id, 'tut-grav-roca-5', 'rock', frameDir(fA, 12, 2), { scale: 1.1 }),
    prop(origin.id, 'tut-grav-roca-6', 'rock', frameDir(fA, -12, 0), { scale: 1.05 }),
    prop(destination.id, 'tut-grav-seta-4', 'glow_mushroom', frameDir(fB, 6, 6)),
    prop(destination.id, 'tut-grav-seta-5', 'glow_mushroom', frameDir(fB, -6, 4)),
    prop(destination.id, 'tut-grav-roca-7', 'rock', frameDir(fB, 14, -4), { scale: 1.15 }),
    prop(destination.id, 'tut-grav-roca-8', 'rock', frameDir(fB, -14, -6), { scale: 1.05 }),
  ];

  return {
    skyTopColor: '#05010f',
    skyBottomColor: '#312e81',
    planets: [origin, destination],
    structures,
    waterBubbles: [],
    grassZones: [],
    restrictedZones: [],
    objects,
    enemies: [],
    npcs,
    props,
    spawnPlanetId: origin.id,
    spawnDir: frameDir(fA, 0, 0),
  };
}

// ============================================================================
// Catálogo de tutoriales
// ============================================================================

export const TUTORIAL_SPECS: TutorialSpec[] = [
  {
    id: 'tut-movement',
    order: 1,
    title: '1 · Parkour, Combate y Parry',
    badge: 'MOVIMIENTO',
    summary:
      'Salta la cadena de flores gigantes hasta el fuerte, esquiva la torreta y devuélvele sus proyectiles con [F].',
    recommendedCharacter: 'kitsune',
    lessonSteps: [
      'Salta la cadena de flores gigantes hasta la plataforma elevada.',
      'Esquiva los proyectiles de la torreta y devuélvelos con [F] Parry.',
      'Destruye el generador de entrenamiento del fuerte.',
    ],
    goalMode: 'generators',
    galaxy: movementGalaxy(),
  },
  {
    id: 'tut-stasis',
    order: 2,
    title: '2 · Estasis, Fijado y Explosivos',
    badge: 'ESTASIS',
    summary:
      'Captura rocas y barriles, fija la palanca con [Q] y ábrete paso a lanzamientos hasta el generador de la bóveda.',
    recommendedCharacter: 'kitsune',
    lessonSteps: [
      '[R/C] Captura rocas y barriles en Estasis (hasta 4).',
      '[Q] Fija el objetivo: palanca, muro agrietado o generador.',
      'Lanza con Clic Izq. una roca a la palanca y destruye el generador.',
    ],
    goalMode: 'generators',
    galaxy: stasisGalaxy(),
  },
  {
    id: 'tut-stealth',
    order: 3,
    title: '3 · Sigilo, Modo Advertencia y Disfraces',
    badge: 'SIGILO',
    summary:
      'Cruza el jardín público entre helechos, lee el modo advertencia ámbar y roba la tarjeta del guardia aislado.',
    recommendedCharacter: 'kitsune',
    lessonSteps: [
      'Avanzas entre la hierba alta y los helechos: la zona pública es segura.',
      'En el Patio del Templo (restringido) el aviso pasa a ámbar: evita al oficial.',
      '[E] Noquea por la espalda al guardia aislado y abre la compuerta con su tarjeta.',
    ],
    goalMode: 'generators',
    galaxy: stealthGalaxy(),
  },
  {
    id: 'tut-squad',
    order: 4,
    title: '4 · Digger y Axel: Subsuelo, Agua y Flores',
    badge: 'ESCUADRÓN',
    summary:
      'Excava bajo la muralla con Digger, abre el corredor aéreo y surca las burbujas con Axel hasta la plataforma orbital.',
    recommendedCharacter: 'digger',
    lessonSteps: [
      '[2] Digger + [SHIFT]: excava bajo la muralla hasta el generador 1.',
      'La palanca abre la compuerta del corredor aéreo.',
      '[3] Axel: nada en las burbujas a 2.35x y planea hasta el generador 2.',
    ],
    goalMode: 'generators',
    galaxy: squadGalaxy(),
  },
  {
    id: 'tut-gravity',
    order: 5,
    title: '5 · Gravity Shift y Salto Interplanetario',
    badge: 'GRAVEDAD',
    summary:
      'Mantén Clic Derecho para ralentizar el tiempo, apunta al Orbe Destino y suelta para surfear el espacio.',
    recommendedCharacter: 'axel',
    lessonSteps: [
      'Mantén Clic Derecho para ralentizar el tiempo y apuntar al Destino.',
      'Suelta el Clic Derecho para surfear el espacio.',
      'Aterriza en el Destino (o destruye su generador-baliza).',
    ],
    goalMode: 'reach_target_planet',
    targetPlanetId: GRAVITY_DESTINATION.id,
    galaxy: gravityGalaxy(),
  },
];

/** Spec del tutorial pedido (lanza si el id no existe: error de programación). */
export function getTutorialSpec(id: TutorialId): TutorialSpec {
  const spec = TUTORIAL_SPECS.find((t) => t.id === id);
  if (!spec) throw new Error(`Tutorial desconocido: "${id}"`);
  return spec;
}
