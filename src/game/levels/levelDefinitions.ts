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
// Nivel 2 — Planeta Cryo-Drop: glaciar resbaladizo, bolas de nieve y burbujas
// ============================================================================

export const CRYO_LEVEL: LevelSpec = {
  id: 'cryo',
  order: 2,
  title: 'PLANETA 2',
  subtitle: 'Cryo-Drop · Glaciar y Burbujas',
  skyTopColor: '#020617',
  skyBottomColor: '#38bdf8',
  planets: [
    {
      id: 'cryo-glaciar',
      name: 'Cryo-Drop',
      biome: 'cryo',
      center: [0, 0, 0],
      radius: 64,
      gravityStrength: 0.95,
      surfaceColor: '#bae6fd',
      patchColor: '#f8fafc',
      atmosphereColor: '#e0f2fe',
      hasIcePatches: true,
    },
    {
      id: 'luna-cristal',
      name: 'Luna Cristal',
      biome: 'cryo',
      center: [240, 70, -130],
      radius: 22,
      gravityStrength: 1.2,
      surfaceColor: '#7dd3fc',
      patchColor: '#a78bfa',
      atmosphereColor: '#cffafe',
      hasOrbitalRings: true,
      ringColor: '#bae6fd',
    },
  ],
  // Burbujas de agua en órbita: ruta de nado de Axel hacia la Luna Cristal.
  waterBubbles: [
    { id: 'cryo-burbuja-1', center: [118, 34, -64], radius: 17 },
    { id: 'cryo-burbuja-2', center: [178, 52, -98], radius: 15 },
    { id: 'cryo-burbuja-3', center: [225, 66, -122], radius: 13 },
  ],
  grassZones: [],
  objects: [
    // Generadores de la guarnición glacial.
    { id: 'cryo-gen-1', kind: 'generator', planetId: 'cryo-glaciar', sphericalDir: [0.2, 0.95, 0.2] },
    { id: 'cryo-gen-2', kind: 'generator', planetId: 'cryo-glaciar', sphericalDir: [-0.55, 0.55, 0.62] },
    { id: 'cryo-gen-3', kind: 'generator', planetId: 'cryo-glaciar', sphericalDir: [0.82, 0.15, -0.55] },
    // Bolas de nieve gigantes agarrables para la Estasis.
    { id: 'cryo-bola-1', kind: 'snowball', planetId: 'cryo-glaciar', sphericalDir: [0.3, 0.88, 0.35] },
    { id: 'cryo-bola-2', kind: 'snowball', planetId: 'cryo-glaciar', sphericalDir: [0.15, 0.95, 0.28] },
    { id: 'cryo-bola-3', kind: 'snowball', planetId: 'cryo-glaciar', sphericalDir: [-0.5, 0.6, 0.6] },
    { id: 'cryo-bola-4', kind: 'snowball', planetId: 'cryo-glaciar', sphericalDir: [0.75, 0.25, -0.55] },
    // Rocas y barriles para lanzar.
    { id: 'cryo-roca-1', kind: 'rock', planetId: 'cryo-glaciar', sphericalDir: [0.6, 0.6, 0.5] },
    { id: 'cryo-roca-2', kind: 'rock', planetId: 'cryo-glaciar', sphericalDir: [-0.2, 0.9, -0.4] },
    { id: 'cryo-barril-1', kind: 'barrel_explosive', planetId: 'cryo-glaciar', sphericalDir: [0.25, 0.9, 0.3] },
    { id: 'cryo-barril-2', kind: 'barrel_explosive', planetId: 'cryo-glaciar', sphericalDir: [0.8, 0.2, -0.5] },
    { id: 'cryo-caja-1', kind: 'crate', planetId: 'cryo-glaciar', sphericalDir: [0.35, 0.85, 0.4] },
    { id: 'cryo-caja-2', kind: 'crate', planetId: 'cryo-glaciar', sphericalDir: [-0.65, 0.45, 0.6] },
  ],
  // Patrullas base del glaciar + oficial detector de disfraces.
  enemies: [
    {
      kind: 'guard',
      planetId: 'cryo-glaciar',
      patrolDirs: patrolCircle(0.25, 0.85, 0.45, 0.12, 4),
    },
    {
      kind: 'guard',
      planetId: 'cryo-glaciar',
      patrolDirs: patrolCircle(-0.6, 0.5, 0.6, 0.12, 4),
    },
    {
      kind: 'guard',
      planetId: 'cryo-glaciar',
      patrolDirs: patrolCircle(0.82, 0.1, -0.55, 0.12, 5),
    },
    {
      kind: 'officer',
      planetId: 'cryo-glaciar',
      patrolDirs: patrolCircle(0.2, 0.95, 0.2, 0.08, 4),
    },
  ],
  spawnPlanetId: 'cryo-glaciar',
  spawnDir: [0.25, 0.85, 0.45],
  portalPlanetId: 'luna-cristal',
  portalDir: [0.35, 0.9, 0.25],
  objectiveSummary:
    'Destruye los generadores del glaciar, deslízate por el hielo y nada entre burbujas hasta la Luna Cristal.',
};

// ============================================================================
// Nivel 3 — Planeta Iron Bastion: fortaleza mecánica de élite
// ============================================================================

export const BASTION_LEVEL: LevelSpec = {
  id: 'bastion',
  order: 3,
  title: 'PLANETA 3',
  subtitle: 'Iron Bastion · Fortaleza Mecánica',
  skyTopColor: '#0a0a0f',
  skyBottomColor: '#f97316',
  planets: [
    {
      id: 'bastion-fortaleza',
      name: 'Iron Bastion',
      biome: 'bastion',
      center: [0, 0, 0],
      radius: 66,
      gravityStrength: 1.15,
      surfaceColor: '#475569',
      patchColor: '#1e293b',
      atmosphereColor: '#fdba74',
    },
    {
      id: 'torre-mando',
      name: 'Torre de Mando',
      biome: 'bastion',
      center: [255, 85, -150],
      radius: 20,
      gravityStrength: 1.3,
      surfaceColor: '#334155',
      patchColor: '#f97316',
      atmosphereColor: '#fdba74',
      hasOrbitalRings: true,
      ringColor: '#f97316',
    },
  ],
  waterBubbles: [
    { id: 'bastion-burbuja-1', center: [126, 42, -74], radius: 16 },
    { id: 'bastion-burbuja-2', center: [196, 66, -116], radius: 14 },
  ],
  grassZones: [],
  objects: [
    // Generadores blindados del bastión.
    { id: 'bastion-gen-1', kind: 'generator', planetId: 'bastion-fortaleza', sphericalDir: [0.2, 0.95, 0.2] },
    { id: 'bastion-gen-2', kind: 'generator', planetId: 'bastion-fortaleza', sphericalDir: [-0.6, 0.5, 0.62] },
    { id: 'bastion-gen-3', kind: 'generator', planetId: 'bastion-fortaleza', sphericalDir: [0.82, 0.1, -0.55] },
    // Tarjetas de acceso: habilitan el portal de la Torre de Mando.
    { id: 'bastion-keycard-1', kind: 'keycard', planetId: 'bastion-fortaleza', sphericalDir: [0.4, 0.3, 0.85] },
    { id: 'bastion-keycard-2', kind: 'keycard', planetId: 'bastion-fortaleza', sphericalDir: [-0.7, 0.5, -0.5] },
    // Arcos escáner: rompen disfraces al cruzar.
    { id: 'bastion-scanner-1', kind: 'scanner_gate', planetId: 'bastion-fortaleza', sphericalDir: [0.78, 0.18, -0.58] },
    { id: 'bastion-scanner-2', kind: 'scanner_gate', planetId: 'bastion-fortaleza', sphericalDir: [-0.35, 0.75, 0.55] },
    // Vallas láser perimetrales.
    { id: 'bastion-laser-1', kind: 'laser_gate', planetId: 'bastion-fortaleza', sphericalDir: [0.55, 0.6, 0.55] },
    { id: 'bastion-laser-2', kind: 'laser_gate', planetId: 'bastion-fortaleza', sphericalDir: [-0.2, 0.9, -0.4] },
    // Tuberías de teletransporte conectadas entre puntos del planeta.
    { id: 'bastion-pipe-1', kind: 'teleport_pipe', planetId: 'bastion-fortaleza', sphericalDir: [0.3, 0.88, 0.35] },
    { id: 'bastion-exit-1', kind: 'teleporter_exit', planetId: 'bastion-fortaleza', sphericalDir: [0.82, 0.1, -0.55] },
    { id: 'bastion-pipe-2', kind: 'teleport_pipe', planetId: 'bastion-fortaleza', sphericalDir: [-0.65, 0.45, 0.6] },
    { id: 'bastion-exit-2', kind: 'teleporter_exit', planetId: 'bastion-fortaleza', sphericalDir: [0.2, 0.95, 0.2] },
    // Minas sísmicas de superficie.
    { id: 'bastion-mina-1', kind: 'seismic_mine', planetId: 'bastion-fortaleza', sphericalDir: [0.6, 0.6, 0.5] },
    { id: 'bastion-mina-2', kind: 'seismic_mine', planetId: 'bastion-fortaleza', sphericalDir: [-0.5, 0.6, 0.6] },
    // Agarrables para la Estasis.
    { id: 'bastion-roca-1', kind: 'rock', planetId: 'bastion-fortaleza', sphericalDir: [0.15, 0.95, 0.28] },
    { id: 'bastion-roca-2', kind: 'rock', planetId: 'bastion-fortaleza', sphericalDir: [-0.55, 0.55, 0.62] },
    { id: 'bastion-roca-3', kind: 'rock', planetId: 'bastion-fortaleza', sphericalDir: [0.75, 0.25, -0.55] },
    { id: 'bastion-barril-1', kind: 'barrel_explosive', planetId: 'bastion-fortaleza', sphericalDir: [0.25, 0.9, 0.3] },
    { id: 'bastion-barril-2', kind: 'barrel_explosive', planetId: 'bastion-fortaleza', sphericalDir: [0.8, 0.2, -0.5] },
    { id: 'bastion-barril-3', kind: 'barrel_explosive', planetId: 'bastion-fortaleza', sphericalDir: [-0.35, 0.75, 0.55] },
    { id: 'bastion-caja-1', kind: 'crate', planetId: 'bastion-fortaleza', sphericalDir: [0.35, 0.85, 0.4] },
    { id: 'bastion-caja-2', kind: 'crate', planetId: 'bastion-fortaleza', sphericalDir: [-0.65, 0.45, 0.6] },
  ],
  // Guarnición de élite: guardias en parejas, oficiales, brutes y torreta.
  enemies: [
    {
      kind: 'guard',
      planetId: 'bastion-fortaleza',
      patrolDirs: patrolCircle(0.25, 0.85, 0.45, 0.12, 4),
      pairedWithNext: true,
    },
    {
      kind: 'guard',
      planetId: 'bastion-fortaleza',
      patrolDirs: patrolCircle(0.25, 0.85, 0.45, 0.14, 4),
    },
    {
      kind: 'guard',
      planetId: 'bastion-fortaleza',
      patrolDirs: patrolCircle(-0.6, 0.5, 0.6, 0.12, 4),
    },
    {
      kind: 'guard',
      planetId: 'bastion-fortaleza',
      patrolDirs: patrolCircle(0.82, 0.1, -0.55, 0.12, 5),
    },
    {
      kind: 'officer',
      planetId: 'bastion-fortaleza',
      patrolDirs: patrolCircle(0.2, 0.95, 0.2, 0.08, 4),
    },
    {
      kind: 'officer',
      planetId: 'bastion-fortaleza',
      patrolDirs: patrolCircle(-0.35, 0.75, 0.55, 0.08, 4),
    },
    {
      kind: 'brute',
      planetId: 'bastion-fortaleza',
      patrolDirs: patrolCircle(0.55, 0.6, 0.55, 0.1, 3),
    },
    {
      kind: 'brute',
      planetId: 'bastion-fortaleza',
      patrolDirs: patrolCircle(-0.2, 0.9, -0.4, 0.1, 3),
    },
    {
      kind: 'turret',
      planetId: 'bastion-fortaleza',
      patrolDirs: [[0.6, 0.6, 0.5]],
    },
  ],
  spawnPlanetId: 'bastion-fortaleza',
  spawnDir: [0.25, 0.85, 0.45],
  portalPlanetId: 'torre-mando',
  portalDir: [0.35, 0.9, 0.25],
  objectiveSummary:
    'Roba una tarjeta de acceso, destruye los generadores blindados y cruza las tuberías hasta el portal de la Torre de Mando.',
};

// ============================================================================
// Nivel 4 — Clímax: Arena del Comandante KRONOS (jefe final, Hito 4)
// ============================================================================

export const KRONOS_LEVEL: LevelSpec = {
  id: 'kronos',
  order: 4,
  title: 'CLÍMAX',
  subtitle: 'Arena de Kronos · Núcleo Volcánico',
  skyTopColor: '#0b0208',
  skyBottomColor: '#dc2626',
  planets: [
    {
      id: 'arena-kronos',
      name: 'Arena de Kronos',
      biome: 'kronos',
      center: [0, 0, 0],
      radius: 54,
      gravityStrength: 1.2,
      surfaceColor: '#3f1d2e',
      patchColor: '#7f1d1d',
      atmosphereColor: '#fb7185',
      hasOrbitalRings: true,
      ringColor: '#ef4444',
    },
  ],
  // Burbujas de agua en órbita: maniobras de nado de Axel para esquivar a Kronos.
  waterBubbles: [
    { id: 'kronos-burbuja-1', center: [0, 86, 0], radius: 13 },
    { id: 'kronos-burbuja-2', center: [58, 42, -34], radius: 11 },
  ],
  grassZones: [],
  objects: [
    // Rocas para el Campo de Estasis.
    { id: 'kronos-roca-1', kind: 'rock', planetId: 'arena-kronos', sphericalDir: [0.3, 0.88, 0.35] },
    { id: 'kronos-roca-2', kind: 'rock', planetId: 'arena-kronos', sphericalDir: [-0.55, 0.55, 0.62] },
    { id: 'kronos-roca-3', kind: 'rock', planetId: 'arena-kronos', sphericalDir: [0.75, 0.25, -0.55] },
    { id: 'kronos-roca-4', kind: 'rock', planetId: 'arena-kronos', sphericalDir: [-0.2, 0.9, -0.4] },
    // Barriles explosivos: la forma rápida de abrirle la guardia a Kronos.
    { id: 'kronos-barril-1', kind: 'barrel_explosive', planetId: 'arena-kronos', sphericalDir: [0.25, 0.9, 0.3] },
    { id: 'kronos-barril-2', kind: 'barrel_explosive', planetId: 'arena-kronos', sphericalDir: [0.8, 0.2, -0.5] },
    { id: 'kronos-barril-3', kind: 'barrel_explosive', planetId: 'arena-kronos', sphericalDir: [-0.35, 0.75, 0.55] },
    { id: 'kronos-barril-4', kind: 'barrel_explosive', planetId: 'arena-kronos', sphericalDir: [-0.65, 0.45, 0.6] },
    // Cajas agarrables.
    { id: 'kronos-caja-1', kind: 'crate', planetId: 'arena-kronos', sphericalDir: [0.35, 0.85, 0.4] },
    { id: 'kronos-caja-2', kind: 'crate', planetId: 'arena-kronos', sphericalDir: [-0.6, 0.5, 0.62] },
  ],
  // El Comandante KRONOS aguarda en el lado opuesto al spawn.
  enemies: [
    {
      kind: 'kronos',
      planetId: 'arena-kronos',
      patrolDirs: [[-0.25, -0.85, -0.45]],
    },
  ],
  spawnPlanetId: 'arena-kronos',
  spawnDir: [0.25, 0.85, 0.45],
  // El portal no decide el final: la victoria llega al derrotar a KRONOS.
  portalPlanetId: 'arena-kronos',
  portalDir: [0, 1, 0],
  objectiveSummary:
    'Sobrevive a la lectura en tiempo real de la red MLP de KRONOS: flanquea su escudo, parrea su maza y devuélvele sus orbes.',
};

// ============================================================================
// Campaña progresiva del Hito 3B + clímax del Hito 4
// ============================================================================

export const LEVELS: LevelSpec[] = [
  PROLOGUE_LEVEL,
  VERDANT_LEVEL,
  CRYO_LEVEL,
  BASTION_LEVEL,
  KRONOS_LEVEL,
];

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
  if (id === 'cryo') {
    return [
      {
        id: 'generators',
        description: 'Destruye los 3 generadores del glaciar',
        completed: false,
        currentCount: 0,
        targetCount: 3,
      },
      {
        id: 'bubbles',
        description: 'Alcanza la Luna Cristal nadando entre burbujas',
        completed: false,
        currentCount: 0,
        targetCount: 1,
      },
      {
        id: 'portal',
        description: 'Cruza el portal de la Luna Cristal',
        completed: false,
        currentCount: 0,
        targetCount: 1,
      },
    ];
  }
  if (id === 'bastion') {
    return [
      {
        id: 'keycard',
        description: 'Roba una tarjeta de acceso (habilita el portal)',
        completed: false,
        currentCount: 0,
        targetCount: 1,
      },
      {
        id: 'generators',
        description: 'Destruye los 3 generadores blindados',
        completed: false,
        currentCount: 0,
        targetCount: 3,
      },
      {
        id: 'portal',
        description: 'Cruza el portal de la Torre de Mando',
        completed: false,
        currentCount: 0,
        targetCount: 1,
      },
    ];
  }
  if (id === 'kronos') {
    return [
      {
        id: 'kronos',
        description: 'Derrota al Comandante KRONOS (12 HP · parrea su maza con F/Q)',
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
