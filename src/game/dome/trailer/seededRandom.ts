// ============================================================================
// seededRandom — PRNG determinista (Mulberry32) con parche temporal de
// Math.random para sesiones de grabación y reproducción de tráiler.
// ============================================================================

/**
 * Crea un generador pseudoaleatorio Mulberry32 determinista en `[0, 1)`.
 * Rápido, sin asignaciones y suficiente para replicar exactamente la
 * simulación de la Cúpula dada la misma semilla y paso de tiempo fijo.
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Genera una semilla de 32 bits usando el Math.random actual del navegador. */
export function generateRandomSeed(): number {
  return (Math.floor(Math.random() * 0xffffffff) >>> 0) || 1;
}

/**
 * Sustituye `Math.random` temporalmente por `mulberry32(seed)` y devuelve
 * una función idempotente para restaurar el `Math.random` original.
 */
export function installScopedRandom(seed: number): () => void {
  const originalRandom = Math.random;
  const rng = mulberry32(seed);
  Math.random = rng;
  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    if (Math.random === rng) {
      Math.random = originalRandom;
    }
  };
}
