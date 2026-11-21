import * as THREE from 'three';
import type { GalaxySpec, InteractableKind, PlanetRuntime } from '../types';

// ============================================================================
// HITO 2 — Terreno esférico procedural determinista.
//
// Heightfield continuo sobre la esfera: cada dirección unitaria (nx, ny, nz)
// desde el centro del planeta produce una altura en metros. Es suave en TODA
// la superficie (sin cortes ni costuras), determinista (misma dirección =>
// misma altura, sin estado mutable) y con CERO allocations por frame.
//
// Los "flatten pads" aplanan el terreno alrededor de estructuras, compuertas,
// NPCs, el punto de aparición y la arena de KRONOS para que todo lo
// construido descanse sobre suelo firme y jugable.
// ============================================================================

/** Pad de aplanado: el terreno se anula dentro de `flatAngle` y se recupera
 *  suavemente (smoothstep) hasta `blendAngle` alrededor de la dirección dada. */
export interface TerrainFlattenPad {
  dirX: number;
  dirY: number;
  dirZ: number;
  cosFlat: number;
  cosBlend: number;
  flatAngle: number;
  blendAngle: number;
}

interface PlanetTerrainEntry {
  pads: TerrainFlattenPad[];
  flat: boolean;
}

/** Terreno por planeta, inicializado por `initPlanetTerrain`. */
const planetTerrain = new Map<string, PlanetTerrainEntry>();

/** Kinds de objeto interactivo que aplanan su entorno inmediato. */
const FLATTEN_OBJECT_KINDS: ReadonlySet<InteractableKind> = new Set<InteractableKind>([
  'locked_gate',
  'breakable_wall',
  'switch_lever',
  'laser_gate',
  'scanner_gate',
  'teleport_pipe',
  'teleporter_exit',
  'generator',
]);

const STRUCTURE_PAD_MARGIN = 0.045;
const STRUCTURE_PAD_BLEND = 0.075;
const OBJECT_PAD_FLAT = 0.06;
const OBJECT_PAD_BLEND = 0.13;
const NPC_PAD_FLAT = 0.05;
const NPC_PAD_BLEND = 0.12;
const SPAWN_PAD_FLAT = 0.07;
const SPAWN_PAD_BLEND = 0.14;
const KRONOS_ARENA_FLAT = 0.34;
const KRONOS_ARENA_BLEND = 0.48;
/** Pad literal del polo norte + centro real de la arena (frame de niveles):
 *  ambos aplanados para que el anillo del jefe quede limpio y plano. */
const KRONOS_ARENA_DIRS: ReadonlyArray<readonly [number, number, number]> = [
  [0, 1, 0],
  [0.25, 0.85, 0.45],
];

/**
 * Octava suave de campo trigonométrico 3D: continua y diferenciable en toda
 * la esfera (sin polos problemáticos). Rango aproximado [-1, 1].
 */
function oct3(nx: number, ny: number, nz: number, freq: number, phase: number): number {
  const a = Math.sin(nx * freq + phase) * Math.cos(ny * freq * 0.83 + phase * 1.7);
  const b = Math.sin(ny * freq * 1.21 + phase * 0.6) * Math.cos(nz * freq * 0.94 + phase * 2.3);
  const c = Math.sin(nz * freq * 1.07 + phase * 1.1) * Math.cos(nx * freq * 0.77 + phase * 0.4);
  return (a + b + c) / 3;
}

/**
 * Bump suave y SATURANTE: reescala el campo base (cuyo máximo empírico ronda
 * ~0.6) con un smoothstep 1.7x, de modo que las crestas y depresiones alcanzan
 * la amplitud completa de cada bioma. C1 en 0 y en la saturación (t=1), y
 * acotada en [0, 1] por construcción: las envolventes por planeta quedan
 * garantizadas pase lo que pase del campo trigonométrico.
 */
function bump(x: number): number {
  const t = x * 1.7;
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

/**
 * Hash determinista del id de planeta (FNV-1a de 32 bits). Siembra el relieve
 * de los planetas sin bioma propio (los mini-planetas de tutorial `tut-*`):
 * cada id obtiene sus propias colinas, siempre las mismas entre ejecuciones.
 */
function hashPlanetId(planetId: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < planetId.length; i++) {
    hash ^= planetId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Altura cruda (sin pads) por planeta, en metros. Envolventes garantizadas:
 *  luna [-0.65, +0.85] · verdant [-1.5, +1.65] · cryo [-1.0, +1.9]
 *  bastion [-1.05, +1.45] · kronos [-0.35, +1.25] · tutorial [-0.5, +0.6].
 */
function rawTerrainHeight(planetId: string, nx: number, ny: number, nz: number): number {
  switch (planetId) {
    case 'luna-tutorial': {
      // Cráteres lunares suaves (depresiones hasta -0.65) y crestas bajas (+0.85).
      const ridge = oct3(nx, ny, nz, 3.1, 0.7);
      const crater = oct3(nx, ny, nz, 4.6, 2.9);
      return 0.85 * bump(ridge) - 0.65 * bump(-crater);
    }
    case 'verdant-pradera': {
      // Colinas ondulantes (+1.65), cuencas de valle serpenteantes (-1.05) y
      // cerros-templo nítidos (±1.5) solo donde no dominan colinas ni valles.
      const hill = oct3(nx, ny, nz, 2.4, 0.4);
      const valley = oct3(nx, ny, nz, 3.3, 1.8);
      const knoll = oct3(nx, ny, nz, 5.6, 3.3);
      const room = 1 - Math.max(bump(hill), bump(-valley));
      return 1.65 * bump(hill) - 1.05 * bump(-valley) + 1.5 * (bump(knoll) - bump(-knoll)) * room;
    }
    case 'cryo-glaciar': {
      // Depresiones glaciales (-1.0), acumulaciones de nieve y cordilleras (+1.9).
      const drift = oct3(nx, ny, nz, 2.2, 1.3);
      const peak = oct3(nx, ny, nz, 5.1, 4.2);
      const basin = oct3(nx, ny, nz, 3.7, 2.4);
      return 1.9 * bump(drift) + 0.6 * bump(peak) * (1 - bump(drift)) - 1.0 * bump(-basin);
    }
    case 'bastion-fortaleza': {
      // Berms elevadas de autopista cibernética (+1.45): bandas industriales
      // largas y regulares; zanjas industriales hundidas (-1.05).
      const berm = Math.cos(nx * 2.1 + nz * 1.4 + 0.6) * Math.cos(ny * 2.7 + nz * 0.8 + 1.1);
      const trench = oct3(nx, ny, nz, 3.6, 1.2);
      return 1.45 * bump(berm) - 1.05 * bump(-trench);
    }
    case 'kronos-trono': {
      // Cresta de basalto exterior (+1.25) alrededor del anillo aplanado del
      // jefe; leve depresión interior (-0.35) para el foso del combate.
      const ridge = oct3(nx, ny, nz, 2.8, 5.1);
      const dip = oct3(nx, ny, nz, 4.4, 0.9);
      return 1.25 * bump(ridge) - 0.35 * bump(-dip);
    }
    default: {
      // Planetas de tutorial (`tut-*`) y cualquier id sin bioma propio: colinas
      // suaves y deterministas sembradas por hash del id, de modo que cada
      // mini-planeta tiene su propio relieve (siempre el mismo) sin depender
      // del bioma. Envolvente garantizada [-0.5, +0.6] m.
      const seed = hashPlanetId(planetId);
      const phase = ((seed % 997) / 997) * Math.PI * 2;
      const freq = 2.6 + ((seed >>> 10) % 5) * 0.35;
      const o = oct3(nx, ny, nz, freq, phase);
      return 0.6 * bump(o) - 0.5 * bump(-o);
    }
  }
}

/**
 * Construye los flatten pads de toda la galaxia. DEBE llamarse al inicio de
 * la carga de nivel, ANTES de construir los modelos de planeta y de colocar
 * estructuras, objetos, props, enemigos o NPCs: todo el mundo se apoya en el
 * terreno que este módulo define.
 */
export function initPlanetTerrain(galaxy: GalaxySpec): void {
  planetTerrain.clear();
  const isFlat = Boolean(galaxy.isSandbox);
  for (const planet of galaxy.planets) {
    planetTerrain.set(planet.id, { pads: [], flat: isFlat });
  }
  if (isFlat) return;

  const addPad = (
    planetId: string,
    dir: readonly [number, number, number],
    flatAngle: number,
    blendAngle: number
  ): void => {
    const entry = planetTerrain.get(planetId);
    if (entry === undefined) return;
    const dx = dir[0];
    const dy = dir[1];
    const dz = dir[2];
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1e-9) return;
    entry.pads.push({
      dirX: dx / len,
      dirY: dy / len,
      dirZ: dz / len,
      cosFlat: Math.cos(flatAngle),
      cosBlend: Math.cos(blendAngle),
      flatAngle,
      blendAngle,
    });
  };

  // Estructuras: pad que cubre su huella máxima (halfX/halfZ mayor).
  for (const structure of galaxy.structures) {
    const planet = galaxy.planets.find((p) => p.id === structure.planetId);
    if (planet === undefined) continue;
    const flatAngle =
      Math.max(structure.size[0], structure.size[2]) / planet.radius + STRUCTURE_PAD_MARGIN;
    addPad(structure.planetId, structure.sphericalDir, flatAngle, flatAngle + STRUCTURE_PAD_BLEND);
  }

  // Objetos interactivos con presencia física en el suelo.
  for (const object of galaxy.objects) {
    if (!FLATTEN_OBJECT_KINDS.has(object.kind)) continue;
    addPad(object.planetId, object.sphericalDir, OBJECT_PAD_FLAT, OBJECT_PAD_BLEND);
  }

  // NPCs amigables: pequeña plataforma firme bajo sus pies.
  for (const npc of galaxy.npcs ?? []) {
    addPad(npc.planetId, npc.sphericalDir, NPC_PAD_FLAT, NPC_PAD_BLEND);
  }

  // Punto de aparición: aterrizaje limpio al iniciar la partida.
  addPad(galaxy.spawnPlanetId, galaxy.spawnDir, SPAWN_PAD_FLAT, SPAWN_PAD_BLEND);

  // Arena de KRONOS: pad de combate limpio y plano; el anillo exterior
  // (fuera del blend) sube orgánicamente formando la grada de basalto.
  for (const dir of KRONOS_ARENA_DIRS) {
    addPad('kronos-trono', dir, KRONOS_ARENA_FLAT, KRONOS_ARENA_BLEND);
  }
}

/**
 * Desplazamiento del terreno (metros) en la dirección unitaria (nx, ny, nz)
 * del planeta dado. Sin inicializar el planeta devuelve 0 (superficie plana
 * coherente). CERO allocations por frame.
 */
export function getPlanetTerrainOffset(
  planetId: string,
  nx: number,
  ny: number,
  nz: number
): number {
  const entry = planetTerrain.get(planetId);
  if (entry === undefined || entry.flat) return 0;
  const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (len < 1e-9) return 0;
  const ux = nx / len;
  const uy = ny / len;
  const uz = nz / len;
  const raw = rawTerrainHeight(planetId, ux, uy, uz);

  // Atenuación mínima entre todos los pads del planeta: 0 dentro de flat,
  // smoothstep t*t*(3-2t) hasta 1 en el borde del blend.
  const pads = entry.pads;
  let attenuation = 1;
  for (let i = 0; i < pads.length; i++) {
    const pad = pads[i];
    const dot = ux * pad.dirX + uy * pad.dirY + uz * pad.dirZ;
    if (dot >= pad.cosFlat) {
      attenuation = 0;
      break;
    }
    if (dot <= pad.cosBlend) continue;
    const t = (pad.cosFlat - dot) / (pad.cosFlat - pad.cosBlend);
    const padAttenuation = t * t * (3 - 2 * t);
    if (padAttenuation < attenuation) attenuation = padAttenuation;
  }
  return raw * attenuation;
}

const _terrainDir = new THREE.Vector3();

/** Variante con THREE.Vector3 (normaliza internamente). CERO allocations. */
export function getPlanetTerrainOffsetVec(planetId: string, dir: THREE.Vector3): number {
  _terrainDir.copy(dir);
  const len = _terrainDir.length();
  if (len < 1e-9) return 0;
  _terrainDir.divideScalar(len);
  return getPlanetTerrainOffset(planetId, _terrainDir.x, _terrainDir.y, _terrainDir.z);
}

/** Altitud absoluta de la superficie (radio nominal + terreno) en una dirección. */
export function getSurfaceAltitude(planet: PlanetRuntime, dir: THREE.Vector3): number {
  return planet.spec.radius + getPlanetTerrainOffsetVec(planet.spec.id, dir);
}

/**
 * Pista de relieve para IA y gameplay: el desplazamiento actual del terreno
 * (negativo = hondonada, positivo = cresta/vantage).
 */
export function getTerrainSlopeHint(planetId: string, dir: THREE.Vector3): number {
  return getPlanetTerrainOffsetVec(planetId, dir);
}

const LOW_BASIN_THRESHOLD = -0.35;

/** ¿La dirección cae en una cuenca/cráter profundo (offset < -0.35 m)?
 *  Da cobertura de sigilo ligera (stealthMul * 0.85) al jugador escondido. */
export function isInLowBasin(planetId: string, dir: THREE.Vector3): boolean {
  return getPlanetTerrainOffsetVec(planetId, dir) < LOW_BASIN_THRESHOLD;
}
