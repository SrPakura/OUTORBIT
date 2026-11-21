import type { PlanetAdaptationConfig, PlayerBehaviorVector } from '../types';
import { computeBehaviorPercentages } from './BehaviorTracker';

// ============================================================================
// IA Inter-planeta (Hito 3B): motor estadístico de contramedidas
// ============================================================================
//
// Reglas de Idea_base.md aplicadas sobre el vector acumulado de la run:
// - Fuerza bruta / alarmas   -> alerta base, patrullas extra, cascos, drones.
// - Abuso de sigilo/disfraces -> patrullas en parejas + escáneres en puertas.
// - Abuso de excavación       -> minas sísmicas subterráneas.
// - Abuso aéreo              -> torretas antiaéreas + predicción de trayectoria.

/** Umbral de porcentaje de agresión que dispara la respuesta a fuerza bruta. */
const AGGRESSION_THRESHOLD = 28;
/** Umbral de porcentaje de sigilo que dispara la respuesta anti-disfraz. */
const STEALTH_THRESHOLD = 32;
/** Umbral de porcentaje de subsuelo que dispara las minas sísmicas. */
const SUBTERRANEAN_THRESHOLD = 22;
/** Umbral de porcentaje aéreo que dispara las torretas antiaéreas. */
const AERIAL_THRESHOLD = 28;

/**
 * Calcula la configuración de adaptación que el planeta `targetOrder`
 * (0 prólogo, 1 Verdant, 2 Cryo-Drop, 3 Iron Bastion) despliega contra el
 * jugador, a partir del comportamiento acumulado en los planetas previos.
 */
export function computePlanetAdaptation(
  accumulated: PlayerBehaviorVector,
  targetOrder: number
): PlanetAdaptationConfig {
  const pct = computeBehaviorPercentages(accumulated);
  const reasons: string[] = [];

  // La alerta base crece con la profundidad en la campaña (0 en prólogo/Verdant).
  let baseAlertLevel = Math.min(0.45, 0.12 * Math.max(0, targetOrder - 1));
  let extraPatrolCount = 0;
  let armoredHelmets = false;
  let pairGuardPatrols = false;
  let doorScanners = false;
  let seismicMines = false;
  let antiAirTurrets = false;
  let predictiveShields = false;

  // --- Fuerza bruta / alarmas ---------------------------------------------
  if (pct.aggression >= AGGRESSION_THRESHOLD || accumulated.alarmsTriggered >= 2) {
    baseAlertLevel = Math.min(1, baseAlertLevel + 0.3);
    extraPatrolCount = targetOrder >= 3 ? 3 : 2; // 2-3 patrullas extra
    armoredHelmets = true;
    reasons.push(
      `Agresión detectada (${Math.round(pct.aggression)}% / ${accumulated.alarmsTriggered} alarmas): ` +
        'nivel de alerta elevado, patrullas reforzadas y cascos blindados que resisten el primer golpe.'
    );
    reasons.push('Drones rápidos desplegados para cazar a un intruso violento.');
  }

  // --- Abuso de sigilo / disfraces ------------------------------------------
  if (pct.stealth >= STEALTH_THRESHOLD || accumulated.stealthKnockouts >= 2) {
    pairGuardPatrols = true;
    doorScanners = true;
    reasons.push(
      `Sigilo detectado (${Math.round(pct.stealth)}% / ${accumulated.stealthKnockouts} noqueos): ` +
        'los guardias patrullan en parejas y hay escáneres que rompen disfraces.'
    );
  }

  // --- Abuso de excavación ---------------------------------------------------
  if (pct.subterranean >= SUBTERRANEAN_THRESHOLD || accumulated.burrowDistance >= 40) {
    seismicMines = true;
    reasons.push(
      `Excavación detectada (${Math.round(pct.subterranean)}% / ${Math.round(accumulated.burrowDistance)} m): ` +
        'minas sísmicas enterradas que expulsan a quien excave cerca de la superficie.'
    );
  }

  // --- Abuso aéreo ------------------------------------------------------------
  if (pct.aerial >= AERIAL_THRESHOLD || accumulated.aerialAttacks >= 4) {
    antiAirTurrets = true;
    predictiveShields = true;
    reasons.push(
      `Ataques aéreos detectados (${Math.round(pct.aerial)}% / ${accumulated.aerialAttacks} saltos): ` +
        'torretas antiaéreas con proyectiles parreables y predicción de trayectoria.'
    );
  }

  if (reasons.length === 0) {
    reasons.push(
      'Sin patrones claros en tu ficha: la guarnición mantiene el despliegue estándar.'
    );
  }

  return {
    baseAlertLevel,
    extraPatrolCount,
    armoredHelmets,
    pairGuardPatrols,
    doorScanners,
    seismicMines,
    antiAirTurrets,
    predictiveShields,
    summaryReasons: reasons,
  };
}
