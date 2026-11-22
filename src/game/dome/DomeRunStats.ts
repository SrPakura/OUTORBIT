import { submitLeaderboardEntry } from '@/api/leaderboard';
import type { LeaderboardEntryRecord } from '@/game/types';

// ============================================================================
// DomeRunStats — métricas de una run Arcade Roguelike en la cúpula.
//
// El tracker acumula en vivo los eventos de la partida (oleadas, kills,
// redirecciones, velocidad...) y `getSummary()` congela un `DomeRunSummary`
// listo para el Battle Report. `submitDomeRunToLeaderboard()` adapta ese
// resumen al formato exacto de `LeaderboardEntryRecord` de Base44.
// ============================================================================

export interface DomeRunSummary {
  score: number;
  wave: number;
  kills: number;
  elitesKilled: number;
  bossesKilled: number;
  barrierKills: number;
  maxSpeedReached: number;
  maxLevelReached: number;
  survivalTimeSec: number;
  damageDealt: number;
  perfectRedirections: number;
  equippedSkills: Array<{ id: string; level: number }>;
  passives: Record<string, number>;
}

/** Info mínima de un enemigo muerto para clasificar el kill. */
export interface DomeKillInfo {
  isElite?: boolean;
  isBoss?: boolean;
}

/** Pesos de la fórmula de score (documentados para balancear en caliente). */
export const DOME_SCORE_WEIGHTS = {
  /** Progresión de oleadas: el motor principal del score. */
  wave: 500,
  kill: 100,
  elite: 750,
  boss: 2500,
  /** Kill por empujar al enemigo contra la Barrera Blanca. */
  barrierKill: 125,
  /** Redirección perfecta (kick_flip cancelado a tiempo / horizonte de rebote). */
  redirection: 150,
  /** Por cada punto de velocidad máxima alcanzada. */
  speed: 10,
  /** Por cada segundo sobrevivido. */
  survival: 5,
  /** Por cada 10 puntos de daño infligido. */
  damage: 0.1,
  /** Por cada nivel alcanzado en caliente. */
  level: 250,
} as const;

export class DomeRunTracker {
  private wave = 1;
  private kills = 0;
  private elitesKilled = 0;
  private bossesKilled = 0;
  private barrierKills = 0;
  private maxSpeedReached = 0;
  private maxLevelReached = 1;
  private survivalTimeSec = 0;
  private damageDealt = 0;
  private perfectRedirections = 0;

  /** Registra la oleada actual (se queda con la más alta vista). */
  recordWave(wave: number): void {
    this.wave = Math.max(this.wave, wave);
  }

  /** Registra la muerte de un enemigo (élite/boss se contabilizan aparte). */
  recordKill(info: DomeKillInfo = {}): void {
    this.kills += 1;
    if (info.isBoss) {
      this.bossesKilled += 1;
    } else if (info.isElite) {
      this.elitesKilled += 1;
    }
  }

  /** Kill instantáneo por la Regla de la Barrera Blanca (cuenta también como kill). */
  recordBarrierKill(): void {
    this.kills += 1;
    this.barrierKills += 1;
  }

  recordSpeed(speed: number): void {
    this.maxSpeedReached = Math.max(this.maxSpeedReached, speed);
  }

  recordDamage(dmg: number): void {
    this.damageDealt += Math.max(0, dmg);
  }

  recordRedirection(): void {
    this.perfectRedirections += 1;
  }

  /** Registra el nivel alcanzado con la progresión en caliente. */
  recordLevel(level: number): void {
    this.maxLevelReached = Math.max(this.maxLevelReached, level);
  }

  tick(dt: number): void {
    this.survivalTimeSec += Math.max(0, dt);
  }

  /**
   * Fórmula de score (entero):
   * oleada·500 + kills·100 + élites·750 + jefes·2500 + redirecciones·150
   * + velocidad·10 + supervivencia·5 + daño/10 + nivel·250.
   */
  getScore(): number {
    const w = DOME_SCORE_WEIGHTS;
    const raw =
      this.wave * w.wave +
      this.kills * w.kill +
      this.elitesKilled * w.elite +
      this.bossesKilled * w.boss +
      this.barrierKills * w.barrierKill +
      this.perfectRedirections * w.redirection +
      Math.floor(this.maxSpeedReached) * w.speed +
      Math.floor(this.survivalTimeSec) * w.survival +
      this.damageDealt * w.damage +
      this.maxLevelReached * w.level;
    return Math.max(0, Math.round(raw));
  }

  /** Congela el estado actual de la run en un resumen inmutable. */
  getSummary(
    equippedSkills: Array<{ id: string; level: number }>,
    passives: Record<string, number>,
  ): DomeRunSummary {
    return {
      score: this.getScore(),
      wave: this.wave,
      kills: this.kills,
      elitesKilled: this.elitesKilled,
      bossesKilled: this.bossesKilled,
      barrierKills: this.barrierKills,
      maxSpeedReached: this.maxSpeedReached,
      maxLevelReached: this.maxLevelReached,
      survivalTimeSec: this.survivalTimeSec,
      damageDealt: this.damageDealt,
      perfectRedirections: this.perfectRedirections,
      equippedSkills: equippedSkills.map((skill) => ({ id: skill.id, level: skill.level })),
      passives: { ...passives },
    };
  }

  reset(): void {
    this.wave = 1;
    this.kills = 0;
    this.elitesKilled = 0;
    this.bossesKilled = 0;
    this.barrierKills = 0;
    this.maxSpeedReached = 0;
    this.maxLevelReached = 1;
    this.survivalTimeSec = 0;
    this.damageDealt = 0;
    this.perfectRedirections = 0;
  }
}

// ---------------------------------------------------------------------------
// Adaptación al Leaderboard de Base44
// ---------------------------------------------------------------------------

/** Velocidad de referencia (m/s) para mapear `maxSpeedReached` a `aerial_pct`. */
const AERIAL_SPEED_REFERENCE = 80;

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

/** Etiqueta de estilo dominante derivada de cómo se jugó la run. */
function computeDominantStyle(summary: DomeRunSummary): string {
  if (summary.bossesKilled > 0) {
    return 'boss_slayer';
  }
  if (summary.barrierKills * 3 >= summary.kills && summary.kills > 0) {
    return 'barrier_trickster';
  }
  if (summary.perfectRedirections * 2 >= summary.kills && summary.kills > 0) {
    return 'redirector';
  }
  return 'kinetic_duelist';
}

/**
 * Adapta un `DomeRunSummary` al formato exacto de `LeaderboardEntryRecord` y
 * lo envía al leaderboard de Base44. Devuelve el registro creado o null si el
 * envío falló (sin conexión/sesión).
 *
 * Mapeo de campos del modo infiltración que no existen en la cúpula:
 * - `clear_time_sec` <- `survivalTimeSec` (la run termina al caer Nyx).
 * - `dominant_style` <- estilo derivado de barrierKills/redirecciones/jefes.
 * - `aggression_pct` <- % de kills cinéticas directas (no vía barrera).
 * - `aerial_pct` <- velocidad máxima relativa a la referencia de vuelo.
 * - `stealth_pct` / `subterranean_pct` / `stasis_pct` <- 0 (no aplican en cúpula).
 * - `alarms_triggered` <- oleada alcanzada (análogo de presión superada).
 */
export async function submitDomeRunToLeaderboard(
  summary: DomeRunSummary,
  playerName: string,
): Promise<LeaderboardEntryRecord | null> {
  const entry: Omit<LeaderboardEntryRecord, 'id' | 'created_date'> = {
    player_name: playerName,
    clear_time_sec: Math.round(summary.survivalTimeSec),
    score: Math.round(summary.score),
    dominant_style: computeDominantStyle(summary),
    stealth_pct: 0,
    aggression_pct: summary.kills > 0 ? clampPercent(100 * (1 - summary.barrierKills / summary.kills)) : 0,
    aerial_pct: clampPercent((100 * summary.maxSpeedReached) / AERIAL_SPEED_REFERENCE),
    subterranean_pct: 0,
    stasis_pct: 0,
    alarms_triggered: summary.wave,
  };
  return submitLeaderboardEntry(entry);
}
