import type { GalaxySpec } from '../types';

/**
 * Modo Sandbox — Hekseville 1:1 (estilo Gravity Rush × OUTORBIT).
 *
 * Un único mapa continuo multinivel (sin planetas esféricos) reconstruido a
 * partir de los 60 chunks `.glb` reales servidos desde
 * `/chunks/hekseville/` (ver `manifest.json`). La geometría, los materiales
 * cel por distrito y la colisión de triángulos viven en
 * `GameEngine.streamHeksevilleChunks()` + `ChunkMeshCollider`; aquí solo se
 * declara el spec raíz y un ancla virtual `'hekseville'` para compatibilidad
 * con `WorldObjectsManager`.
 */
export const SANDBOX_GALAXY_SPEC: GalaxySpec = {
  // Atmósfera de crepúsculo cósmico: violeta profundo arriba, ámbar abajo.
  skyTopColor: '#130b2e',
  skyBottomColor: '#f97316',
  isSandbox: true,
  isFlatCity: true,
  planets: [
    {
      id: 'hekseville',
      order: 1,
      name: 'Outorbit City',
      subtitle: 'Isla Flotante · Modo Exploración',
      biome: 'verdant',
      center: [0, -1000, 0],
      radius: 1000,
      gravityStrength: 22,
      surfaceColor: '#e07a5f',
      patchColor: '#f4a261',
      atmosphereColor: '#38bdf8',
      unlockedByPlanetId: null,
    },
  ],
  structures: [],
  waterBubbles: [],
  grassZones: [],
  objects: [],
  enemies: [],
  // Coordenadas en el espacio 1:1 de Hekseville (mismo origen que los chunks).
  // Sin NPCs: el sandbox es exploración pura de Pleajeune, y los antiguos
  // vecinos flotaban en coordenadas de distritos ya retirados.
  npcs: [],
  props: [],
  collectibles: [],
  anchorNodes: [],
  challenges: [],
  spawnPlanetId: 'hekseville',
  spawnDir: [0, 1, 0],
};
