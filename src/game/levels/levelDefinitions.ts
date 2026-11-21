import * as THREE from 'three';
import type { LevelId, LevelObjective, LevelSpec } from '../types';

// ============================================================================
// Utilidades de definición de niveles (solo se ejecutan al cargar un nivel)
// ============================================================================

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

// ============================================================================
// Nivel 0 — Prólogo: Luna Tutorial + Satélite Cristal + burbuja intermedia
// ============================================================================

export const PROLOGUE_LEVEL: LevelSpec = {
  id: 'prologue',
  order: 0,
  title: 'PRÓLOGO',
  subtitle: 'Luna Tutorial · Satélite Cristal',
  skyTopColor: '#05010f',
  skyBottomColor: '#6d28d9',
  planets: [
    {
      id: 'luna-tutorial',
      name: 'Luna Tutorial',
      biome: 'tutorial',
      center: [0, 0, 0],
      radius: 60,
      gravityStrength: 1.0,
      surfaceColor: '#cbd5e1',
      patchColor: '#94a3b8',
      atmosphereColor: '#93c5fd',
      hasIcePatches: true,
    },
    {
      id: 'satelite-cristal',
      name: 'Satélite Cristal',
      biome: 'tutorial',
      center: [235, 60, -120],
      radius: 26,
      gravityStrength: 1.35,
      surfaceColor: '#7dd3fc',
      patchColor: '#a78bfa',
      atmosphereColor: '#c4b5fd',
      hasOrbitalRings: true,
      ringColor: '#c4b5fd',
    },
  ],
  // Burbuja intermedia sobre la ruta orbital Luna -> Satélite para probar el nado.
  waterBubbles: [
    { id: 'burbuja-ruta', center: [135, 42, -66], radius: 20 },
  ],
  grassZones: [],
  objects: [
    { id: 'luna-roca-1', kind: 'rock', planetId: 'luna-tutorial', sphericalDir: [0.5, 0.8, 0.3] },
    { id: 'luna-roca-2', kind: 'rock', planetId: 'luna-tutorial', sphericalDir: [0.7, 0.5, -0.4] },
    { id: 'luna-roca-3', kind: 'rock', planetId: 'luna-tutorial', sphericalDir: [0.2, 0.9, -0.35] },
    { id: 'luna-barril-1', kind: 'barrel_explosive', planetId: 'luna-tutorial', sphericalDir: [0.6, 0.7, 0.35] },
    { id: 'luna-caja-1', kind: 'crate', planetId: 'luna-tutorial', sphericalDir: [0.3, 0.85, 0.5] },
    { id: 'luna-bola-1', kind: 'snowball', planetId: 'luna-tutorial', sphericalDir: [0.45, 0.75, -0.5] },
  ],
  enemies: [],
  spawnPlanetId: 'luna-tutorial',
  spawnDir: [0.25, 0.85, 0.45],
  portalPlanetId: 'satelite-cristal',
  portalDir: [0.35, 0.9, 0.25],
  objectiveSummary: 'Domina la gravedad esférica, prueba la Estasis y usa GRAVITY SHIFT para alcanzar el portal.',
};

// ============================================================================
// Nivel 1 — Planeta Verdant: pradera, hierba alta, láser, generadores, guardias
// ============================================================================

export const VERDANT_LEVEL: LevelSpec = {
  id: 'verdant',
  order: 1,
  title: 'PLANETA 1',
  subtitle: 'Verdant · Bosque/Pradera',
  skyTopColor: '#04150e',
  skyBottomColor: '#34d399',
  planets: [
    {
      id: 'verdant-pradera',
      name: 'Verdant',
      biome: 'verdant',
      center: [0, 0, 0],
      radius: 68,
      gravityStrength: 1.1,
      surfaceColor: '#4ade80',
      patchColor: '#16a34a',
      atmosphereColor: '#bbf7d0',
    },
    {
      id: 'islote-satelite',
      name: 'Islote Satélite',
      biome: 'verdant',
      center: [250, 80, -140],
      radius: 20,
      gravityStrength: 1.25,
      surfaceColor: '#a3e635',
      patchColor: '#4d7c0f',
      atmosphereColor: '#f0fdf4',
      hasOrbitalRings: true,
      ringColor: '#bbf7d0',
    },
  ],
  // Burbujas de agua en órbita hacia el islote (ruta de nado de Axel).
  waterBubbles: [
    { id: 'verdant-burbuja-1', center: [122, 38, -67], radius: 16 },
    { id: 'verdant-burbuja-2', center: [187, 60, -105], radius: 15 },
  ],
  grassZones: [
    { id: 'hierba-spawn', planetId: 'verdant-pradera', sphericalDir: [0.1, 0.9, 0.4], angularRadius: 0.18 },
    { id: 'hierba-este', planetId: 'verdant-pradera', sphericalDir: [0.4, 0.3, 0.85], angularRadius: 0.22 },
    { id: 'hierba-oeste', planetId: 'verdant-pradera', sphericalDir: [-0.7, 0.5, -0.5], angularRadius: 0.2 },
  ],
  objects: [
    // Generadores a destruir (objetivo del nivel).
    { id: 'gen-1', kind: 'generator', planetId: 'verdant-pradera', sphericalDir: [0.2, 0.95, 0.2] },
    { id: 'gen-2', kind: 'generator', planetId: 'verdant-pradera', sphericalDir: [-0.6, 0.5, 0.62] },
    { id: 'gen-3', kind: 'generator', planetId: 'verdant-pradera', sphericalDir: [0.82, 0.1, -0.55] },
    // Vallas láser: dañan de pie, pero Digger las cruza por debajo (Shift).
    { id: 'laser-1', kind: 'laser_gate', planetId: 'verdant-pradera', sphericalDir: [0.78, 0.18, -0.58] },
    { id: 'laser-2', kind: 'laser_gate', planetId: 'verdant-pradera', sphericalDir: [-0.35, 0.75, 0.55] },
    // Agarrables para el Campo de Estasis.
    { id: 'roca-1', kind: 'rock', planetId: 'verdant-pradera', sphericalDir: [0.3, 0.88, 0.35] },
    { id: 'roca-2', kind: 'rock', planetId: 'verdant-pradera', sphericalDir: [0.15, 0.95, 0.28] },
    { id: 'roca-3', kind: 'rock', planetId: 'verdant-pradera', sphericalDir: [-0.55, 0.55, 0.62] },
    { id: 'roca-4', kind: 'rock', planetId: 'verdant-pradera', sphericalDir: [0.75, 0.25, -0.55] },
    { id: 'roca-5', kind: 'rock', planetId: 'verdant-pradera', sphericalDir: [-0.2, 0.9, -0.4] },
    { id: 'roca-6', kind: 'rock', planetId: 'verdant-pradera', sphericalDir: [0.6, 0.6, 0.5] },
    { id: 'barril-1', kind: 'barrel_explosive', planetId: 'verdant-pradera', sphericalDir: [0.25, 0.9, 0.3] },
    { id: 'barril-2', kind: 'barrel_explosive', planetId: 'verdant-pradera', sphericalDir: [-0.5, 0.6, 0.6] },
    { id: 'barril-3', kind: 'barrel_explosive', planetId: 'verdant-pradera', sphericalDir: [0.8, 0.2, -0.5] },
    { id: 'caja-1', kind: 'crate', planetId: 'verdant-pradera', sphericalDir: [0.35, 0.85, 0.4] },
    { id: 'caja-2', kind: 'crate', planetId: 'verdant-pradera', sphericalDir: [-0.65, 0.45, 0.6] },
  ],
  // Centinelas de prueba: 3 guardias patrullando en círculos.
  enemies: [
    {
      kind: 'guard',
      planetId: 'verdant-pradera',
      patrolDirs: patrolCircle(0.25, 0.85, 0.45, 0.12, 4),
    },
    {
      kind: 'guard',
      planetId: 'verdant-pradera',
      patrolDirs: patrolCircle(0.2, 0.95, 0.2, 0.1, 4),
    },
    {
      kind: 'guard',
      planetId: 'verdant-pradera',
      patrolDirs: patrolCircle(0.82, 0.1, -0.55, 0.12, 5),
    },
  ],
  spawnPlanetId: 'verdant-pradera',
  spawnDir: [0.25, 0.85, 0.45],
  portalPlanetId: 'islote-satelite',
  portalDir: [0.4, 0.85, 0.3],
  objectiveSummary: 'Destruye los generadores, cruza las vallas láser y nada hasta el portal del islote.',
};

// ============================================================================
// Campaña progresiva del Hito 2
// ============================================================================

export const LEVELS: LevelSpec[] = [PROLOGUE_LEVEL, VERDANT_LEVEL];

export function getLevelSpec(id: LevelId): LevelSpec {
  const level = LEVELS.find((l) => l.id === id);
  if (!level) throw new Error(`levelDefinitions: nivel desconocido "${id}"`);
  return level;
}

/** Objetivos iniciales (copiados por el GameEngine para no mutar la plantilla). */
export function createLevelObjectives(id: LevelId): LevelObjective[] {
  if (id === 'verdant') {
    return [
      {
        id: 'generators',
        description: 'Destruye los 3 generadores (Estasis o golpe)',
        completed: false,
        currentCount: 0,
        targetCount: 3,
      },
      {
        id: 'bubbles',
        description: 'Alcanza el Islote Satélite nadando entre burbujas',
        completed: false,
        currentCount: 0,
        targetCount: 1,
      },
      {
        id: 'portal',
        description: 'Cruza el portal del islote',
        completed: false,
        currentCount: 0,
        targetCount: 1,
      },
    ];
  }
  return [
    {
      id: 'explore',
      description: 'Muévete con WASD y salta con ESPACIO',
      completed: false,
      currentCount: 0,
      targetCount: 1,
    },
    {
      id: 'gravity-shift',
      description: 'GRAVITY SHIFT (Clic Derecho): salta hasta el Satélite Cristal',
      completed: false,
      currentCount: 0,
      targetCount: 1,
    },
    {
      id: 'portal',
      description: 'Alcanza el portal orbital',
      completed: false,
      currentCount: 0,
      targetCount: 1,
    },
  ];
}
