// ============================================================================
// ENEMY REGISTRY — despachador de enemigos por skin
// ============================================================================
// buildEnemyModelBySkin: instancia el modelo de un enemigo por su tipo y skin temática, cayendo al modelo de su kind si la skin no tiene builder. Extraído de proceduralModels.ts (P8).
// ============================================================================

import * as THREE from 'three';
import {
  type EnemyKind,
  type EnemySkin,
} from '../../types';
import { buildGuardModel, buildOfficerModel, buildDroneModel, buildTurretModel, buildBruteModel } from './guardFaction';
import { buildPantherModel, buildMonkeyModel, buildGorillaModel, buildWaspModel } from './beastEnemies';
import { buildSamuraiModel, buildOniModel } from './shogunateEnemies';
import { buildCyberGuardModel, buildCyberDroneModel, buildCyberMechModel } from './cyberEnemies';

/**
 * Instancia el modelo de un enemigo por su tipo y skin temática: los animales
 * de la selva (pantera, mono, gorila, avispa), los samuráis/onis del
 * Shogunato Nevado y los cibernéticos de Neon Bastion sustituyen al modelo
 * uniformado por defecto; cualquier skin sin builder propio cae al modelo de
 * su `kind`.
 */
export function buildEnemyModelBySkin(kind: EnemyKind, skin?: EnemySkin): THREE.Group {
  switch (skin) {
    case 'panther':
      return buildPantherModel();
    case 'monkey':
      return buildMonkeyModel();
    case 'gorilla':
      return buildGorillaModel();
    case 'wasp':
      return buildWaspModel();
    case 'samurai':
      return buildSamuraiModel(kind === 'officer');
    case 'oni':
      return buildOniModel();
    case 'cyber_guard':
      return buildCyberGuardModel(kind === 'officer');
    case 'cyber_officer':
      return buildCyberGuardModel(true);
    case 'cyber_drone':
      return buildCyberDroneModel();
    case 'cyber_mech':
      return buildCyberMechModel();
    default:
      break;
  }
  switch (kind) {
    case 'officer':
      return buildOfficerModel();
    case 'drone':
      return buildDroneModel();
    case 'turret':
      return buildTurretModel();
    case 'brute':
      return buildBruteModel();
    default:
      return buildGuardModel();
  }
}

