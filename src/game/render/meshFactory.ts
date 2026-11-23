import * as THREE from 'three';
import {
  addComicOutline,
  createComicCelMaterial,
  createToonMaterial,
  type ComicCelOptions,
} from './toonMaterials';

// ============================================================================
// Fábrica compartida de mallas y utilidades deterministas
// ============================================================================
// Único hogar de los helpers que proceduralModels.ts, cityModels.ts,
// WorldObjects.ts y domeArenaScene.ts duplicaban por separado: PRNG
// deterministas, hash de cadenas, mallas cel/toon con contorno cómic,
// piezas autoiluminadas y materiales aditivos de brillo.
// ============================================================================

/** PRNG determinista (LCG) para que cada planeta/objeto sea siempre igual. */
export function makeSeededRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

/** PRNG determinista mulberry32 (cúpula, slabs y escenarios de la arena). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash FNV-1a de una cadena: semilla estable para makeSeededRandom. */
export function hashString(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Mesh toon con contorno cómic en un solo paso. */
export function toonMesh(
  geometry: THREE.BufferGeometry,
  color: string | number,
  outlineThickness: number,
  emissive?: string | number
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, createToonMaterial(color, emissive));
  addComicOutline(mesh, outlineThickness);
  return mesh;
}

/** Mesh cel de 3 bandas con contorno cómic fino (tinta limpia). */
export function celMesh(
  geometry: THREE.BufferGeometry,
  color: string | number,
  outlineThickness: number,
  options?: ComicCelOptions
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, createComicCelMaterial(color, options));
  addComicOutline(mesh, outlineThickness);
  return mesh;
}

/** Pieza autoiluminada (neón, cristal luminoso, agua mágica): sin sombreado. */
export function glowMesh(geometry: THREE.BufferGeometry, color: string | number): THREE.Mesh {
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color }));
}

/** Opciones de los materiales aditivos de brillo. */
export interface AdditiveGlowOptions {
  /** Dibuja por ambas caras (cortes de energía, barreras). */
  doubleSide?: boolean;
  /** No escribe en el z-buffer (brillos que se solapan). */
  depthWrite?: boolean;
}

/** Material aditivo translúcido: destellos, auras y filos brillantes. */
export function additiveGlowMaterial(
  color: string | number,
  opacity: number,
  options?: AdditiveGlowOptions
): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: options?.depthWrite ?? true,
    side: options?.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
  });
}

/** Color de acento: mismo tono, más luminoso (bandas, barandillas, remates). */
export function lighten(color: string | number, amount = 0.18): number {
  return new THREE.Color(color).offsetHSL(0, 0.04, amount).getHex();
}
