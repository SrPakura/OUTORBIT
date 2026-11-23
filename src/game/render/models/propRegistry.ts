// ============================================================================
// PROP REGISTRY — despachador de props por tipo
// ============================================================================
// buildPropMesh: construye el mesh de un prop ambiental por su PropKind, combinando los módulos de props temáticos y cityModels. Extraído de proceduralModels.ts (P8).
// ============================================================================

import * as THREE from 'three';
import { type PropKind } from '../../types';
import { buildCityPropMesh } from '../cityModels';

import {
  buildRock,
  buildToriiGate,
  buildVillageHouse,
  buildPagodaHouse,
  buildPaperLantern,
  buildBambooCluster,
  buildStonePath,
  buildWoodBridge,
  buildCherrySnowTree,
  buildPalmTree,
  buildFernCluster,
  buildGiantFlower,
  buildGlowMushroom,
  buildAncientStatue,
  buildVineArch,
} from './verdantProps';
import {
  buildIceCrystal,
  buildIgloo,
  buildPipe,
  buildAntenna,
  buildReactor,
  buildSpotlight,
} from './cryoIronProps';
import {
  buildNeonBillboard,
  buildCyberTower,
  buildHoloPillar,
  buildPineTreeProp,
} from './cyberProps';

/**
 * Construye el mesh de un prop ambiental por su tipo. Desde el Hito 2 los
 * props tienen colisión física real (troncos, techos, trampolines, follaje).
 */
export function buildPropMesh(kind: PropKind): THREE.Group {
  switch (kind) {
    case 'torii_gate':
      return buildToriiGate();
    case 'pagoda_house':
      return buildPagodaHouse();
    case 'village_house':
      return buildVillageHouse();
    case 'paper_lantern':
      return buildPaperLantern();
    case 'bamboo_cluster':
      return buildBambooCluster();
    case 'pine_tree':
      return buildPineTreeProp();
    case 'stone_path':
      return buildStonePath();
    case 'wood_bridge':
      return buildWoodBridge();
    case 'palm_tree':
      return buildPalmTree();
    case 'fern_cluster':
      return buildFernCluster();
    case 'ancient_statue':
      return buildAncientStatue();
    case 'vine_arch':
      return buildVineArch();
    case 'cherry_snow_tree':
      return buildCherrySnowTree();
    case 'neon_billboard':
      return buildNeonBillboard();
    case 'cyber_tower':
      return buildCyberTower();
    case 'holo_pillar':
      return buildHoloPillar();
    case 'ice_crystal':
      return buildIceCrystal();
    case 'igloo':
      return buildIgloo();
    case 'pipe':
      return buildPipe();
    case 'antenna':
      return buildAntenna();
    case 'reactor':
      return buildReactor();
    case 'spotlight':
      return buildSpotlight();
    case 'giant_flower':
      return buildGiantFlower();
    case 'glow_mushroom':
      return buildGlowMushroom();
    case 'rock':
      return buildRock();
    // --- Ciudad Sandbox (estilo OUTORBIT) ---
    case 'city_house':
    case 'city_shop':
    case 'street_lamp':
    case 'bench':
    case 'market_stall':
    case 'clock_tower':
    case 'crane':
    case 'awning_arch':
    case 'comic_billboard':
    case 'fountain':
      return buildCityPropMesh(kind);
  }
}
