import type { BehaviorPercentages, PlayerBehaviorVector } from '../types';

// ============================================================================
// IA Inter-planeta (Hito 3B): registro estadístico del comportamiento real
// ============================================================================

/** Vector de comportamiento en cero (plantilla para copias inmutables). */
export function createEmptyBehaviorVector(): PlayerBehaviorVector {
  return {
    stealthKnockouts: 0,
    disguiseTimeSec: 0,
    alarmsTriggered: 0,
    bruteKills: 0,
    aerialAttacks: 0,
    burrowDistance: 0,
    burrowTimeSec: 0,
    stasisThrows: 0,
    parriesLanded: 0,
    damageTaken: 0,
    totalTimeSec: 0,
  };
}

/**
 * Puntuaciones "en bruto" de cada estilo a partir del vector acumulado.
 * Los pesos convierten unidades heterogéneas (segundos, metros, conteos)
 * en una escala común comparable.
 */
function rawStyleScores(vec: PlayerBehaviorVector): BehaviorPercentages {
  return {
    stealth: vec.stealthKnockouts * 12 + vec.disguiseTimeSec * 0.35,
    aggression: vec.alarmsTriggered * 14 + vec.bruteKills * 7 + vec.damageTaken * 1.5,
    aerial: vec.aerialAttacks * 5,
    subterranean: vec.burrowDistance * 0.6 + vec.burrowTimeSec * 0.5,
    stasis: vec.stasisThrows * 4 + vec.parriesLanded * 3,
  };
}

/**
 * Normaliza las puntuaciones brutas a porcentajes 0..100 (suman 100 cuando
 * hay actividad registrada). Sin datos, todo queda a 0.
 */
export function computeBehaviorPercentages(vec: PlayerBehaviorVector): BehaviorPercentages {
  return computeBehaviorPercentagesInto(vec, {
    stealth: 0,
    aggression: 0,
    aerial: 0,
    subterranean: 0,
    stasis: 0,
  });
}

/**
 * Variante sin allocations: escribe los porcentajes 0..100 en `out`
 * preasignado (usada por la red MLP de KRONOS dentro del loop).
 */
export function computeBehaviorPercentagesInto(
  vec: PlayerBehaviorVector,
  out: BehaviorPercentages
): BehaviorPercentages {
  const raw = rawStyleScores(vec);
  const total = raw.stealth + raw.aggression + raw.aerial + raw.subterranean + raw.stasis;
  if (total <= 1e-6) {
    out.stealth = 0;
    out.aggression = 0;
    out.aerial = 0;
    out.subterranean = 0;
    out.stasis = 0;
    return out;
  }
  const clamp = (v: number) => Math.min(100, Math.max(0, (v / total) * 100));
  out.stealth = clamp(raw.stealth);
  out.aggression = clamp(raw.aggression);
  out.aerial = clamp(raw.aerial);
  out.subterranean = clamp(raw.subterranean);
  out.stasis = clamp(raw.stasis);
  return out;
}

/** Etiqueta legible del estilo dominante detectado por la IA. */
export function getDominantStyleLabel(pct: BehaviorPercentages): string {
  const entries: Array<[string, number]> = [
    ['Sigilo y disfraces', pct.stealth],
    ['Fuerza bruta', pct.aggression],
    ['Ataques aéreos', pct.aerial],
    ['Subsuelo', pct.subterranean],
    ['Estasis y parry', pct.stasis],
  ];
  let bestLabel = 'Equilibrado';
  let bestScore = 0;
  for (const [label, score] of entries) {
    if (score > bestScore) {
      bestScore = score;
      bestLabel = label;
    }
  }
  // Sin un patrón claro (nada supera el 20%), el perfil sigue siendo ilegible.
  return bestScore >= 20 ? bestLabel : 'Equilibrado';
}

/**
 * Acumula el `PlayerBehaviorVector` real del jugador: suma el vector de cada
 * planeta al total de la run al cruzar cada portal. El GameEngine posee una
 * instancia por run y la consulta al construir el informe de adaptación.
 */
export class BehaviorTracker {
  private readonly accumulated: PlayerBehaviorVector = createEmptyBehaviorVector();

  /** Suma el vector de un planeta terminado al total de la run. */
  accumulate(levelVector: PlayerBehaviorVector): void {
    this.accumulated.stealthKnockouts += levelVector.stealthKnockouts;
    this.accumulated.disguiseTimeSec += levelVector.disguiseTimeSec;
    this.accumulated.alarmsTriggered += levelVector.alarmsTriggered;
    this.accumulated.bruteKills += levelVector.bruteKills;
    this.accumulated.aerialAttacks += levelVector.aerialAttacks;
    this.accumulated.burrowDistance += levelVector.burrowDistance;
    this.accumulated.burrowTimeSec += levelVector.burrowTimeSec;
    this.accumulated.stasisThrows += levelVector.stasisThrows;
    this.accumulated.parriesLanded += levelVector.parriesLanded;
    this.accumulated.damageTaken += levelVector.damageTaken;
    this.accumulated.totalTimeSec += levelVector.totalTimeSec;
  }

  /** Copia del vector acumulado de toda la run (no mutar el interno). */
  getAccumulated(): PlayerBehaviorVector {
    return { ...this.accumulated };
  }

  /**
   * Variante sin allocations: escribe el acumulado en `out` preasignado
   * (usado por el GameEngine cada frame para la red MLP de KRONOS).
   */
  getAccumulatedInto(out: PlayerBehaviorVector): PlayerBehaviorVector {
    out.stealthKnockouts = this.accumulated.stealthKnockouts;
    out.disguiseTimeSec = this.accumulated.disguiseTimeSec;
    out.alarmsTriggered = this.accumulated.alarmsTriggered;
    out.bruteKills = this.accumulated.bruteKills;
    out.aerialAttacks = this.accumulated.aerialAttacks;
    out.burrowDistance = this.accumulated.burrowDistance;
    out.burrowTimeSec = this.accumulated.burrowTimeSec;
    out.stasisThrows = this.accumulated.stasisThrows;
    out.parriesLanded = this.accumulated.parriesLanded;
    out.damageTaken = this.accumulated.damageTaken;
    out.totalTimeSec = this.accumulated.totalTimeSec;
    return out;
  }

  /** Reinicio entre runs. */
  reset(): void {
    Object.assign(this.accumulated, createEmptyBehaviorVector());
  }
}
