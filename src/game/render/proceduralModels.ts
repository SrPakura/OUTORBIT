// ============================================================================
// PROCEDURAL MODELS — barril de la fábrica de modelos procedurales
// ============================================================================
// Punto de entrada único que conserva la API histórica de la fábrica: todos
// los consumidores (WorldObjects, GameEngine, PlayerController,
// enemyAnimator) siguen importando desde aquí sin cambios.
//
// Desde la modularización (P8) la implementación vive en módulos temáticos
// bajo src/game/render/models/:
//   modelParts        — ojos/limbs compartidos, halo de sombra y propulsor
//   characterModel    — escuadrón cabezón + skins temáticas
//   verdantProps      — Aldea Feudal y Selva Tropical de Verdant
//   cryoIronProps     — Cryo-Drop e Iron Bastion
//   cyberProps        — Metrópolis cyberpunk de Neon Bastion
//   propRegistry      — buildPropMesh (despachador de props por tipo)
//   planetModel       — planetas procedurales, atmósfera y anillos
//   guardFaction      — guardia, oficial, dron, torreta y brute
//   beastEnemies      — pantera, mono, gorila y avispa
//   shogunateEnemies  — samurái y oni (Kurogane)
//   cyberEnemies      — ciber-guardia, ciber-dron y ciber-mecha
//   enemyRegistry     — buildEnemyModelBySkin (despachador por skin)
//   bossKronos        — Comandante KRONOS y overlay de disfraz
//   structures        — murallas, torres, búnkers, arcos y puentes
//   signaling         — escudo, balizas y conos de visión
//   puzzleObjects     — compuertas, palancas y muros rompibles
//   npcModel          — NPC amigable cabezón
// ============================================================================

export { buildCharacterModel } from './models/characterModel';
export { buildPropMesh } from './models/propRegistry';
export { buildPlanetModel } from './models/planetModel';
export {
  buildGuardModel,
  buildOfficerModel,
  buildDroneModel,
  buildTurretModel,
  buildBruteModel,
} from './models/guardFaction';
export {
  buildPantherModel,
  buildMonkeyModel,
  buildGorillaModel,
  buildWaspModel,
} from './models/beastEnemies';
export { buildSamuraiModel, buildOniModel } from './models/shogunateEnemies';
export {
  buildCyberGuardModel,
  buildCyberDroneModel,
  buildCyberMechModel,
} from './models/cyberEnemies';
export { buildEnemyModelBySkin } from './models/enemyRegistry';
export { buildKronosModel, buildDisguiseOverlay } from './models/bossKronos';
export { buildStructureMesh } from './models/structures';
export {
  buildInterceptorBelt,
  buildBeaconBeam,
  buildVisionConeMesh,
} from './models/signaling';
export {
  buildLockedGateMesh,
  buildSwitchLeverMesh,
  buildBreakableWallMesh,
  type LockedGateMesh,
  type SwitchLeverMesh,
  type BreakableWallMesh,
} from './models/puzzleObjects';
export { buildNpcModel } from './models/npcModel';
