// ============================================================================
// ENEMY AI — Red de IA intra-planeta de la Galaxia Continua
// ============================================================================
// Sistema extraído de WorldObjects.ts (P5 de la modularización): contiene toda
// la lógica de comportamiento de los enemigos — FSM del caminante (patrulla,
// aviso, búsqueda, persecución, windup, KO), drones, torretas y sus
// proyectiles, visión con oclusión por curvatura, sospecha gradual con
// disfraces, alertas por radio, LOCKDOWN de compuertas y steering tangente
// multi-rayo sobre la esfera.
//
// El sistema no posee estado propio relevante: opera sobre los arrays y
// campos compartidos del WorldObjectsManager (su `host`) — spawns, colliders,
// reloj, banner de VIGILANCIA y callbacks del GameEngine — a través de la
// interfaz `EnemyAIHost`. Cero allocations por frame.
// ============================================================================

import * as THREE from 'three';
import type { PlanetRuntime, RestrictedZoneSpec } from '../types';
import {
  animateEnemyRig,
  createEmptyEnemyRig,
  GUARD_STATE_CHASE,
  GUARD_STATE_KO,
  GUARD_STATE_PATROL,
  GUARD_STATE_SEARCH,
  GUARD_STATE_WARNING,
  GUARD_STATE_WINDUP,
  type EnemyAnimParams,
} from '../render/enemyAnimator';
import {
  findStrongestGravityPlanet,
  isLineBlockedByStructures,
  resolvePlayerProps,
  resolvePlayerStructures,
  type PropCollider,
  type StructureCollider,
} from '../math/spherical';
import { getPlanetTerrainOffsetVec } from '../math/terrain';
import type { GameSoundKind } from '../audio/SynthAudio';
import type {
  EnemyObj,
  HitSource,
  LockedGateObj,
  PlayerDamageFn,
  RestrictedZoneRuntime,
  TurretProjectile,
  WorldPlayerState,
} from './WorldObjects';

// ============================================================================
// Constantes de la IA enemiga
// ============================================================================
// Las 7 marcadas con `export` también las usa WorldObjectsManager al hacer
// spawn (ENEMY_PARAMS, conos de visión y escáneres); el resto son privadas
// de este módulo.
// ============================================================================

const GUARD_GIVEUP_DIST = 24;
const GUARD_PATROL_SPEED = 2.0;

// --- Red de IA intra-planeta (Hito 3B) ---
export const VISION_MIN_DOT = 0.25; // semicírculo frontal (~75° de semiángulo)
const GRASS_HIDE_DIST = 2.5; // la hierba alta oculta salvo a quemarropa
const CURVATURE_CLEARANCE = 0.25; // margen del horizonte esférico
const OFFICER_UNMASK_RANGE = 6.0; // el oficial delata al disfrazado cerca
const SUSPICION_DECAY = 0.22;
const SEARCH_DURATION = 7.0; // segundos buscando antes de volver a patrullar
export const RADIO_ALERT_RANGE = 22.0; // alcance de la alerta por radio
const RADIO_CHECKIN_DELAY = 7.0; // sin respuesta de un compañero -> búsqueda
const BODY_SPOT_RANGE = 14.0; // avistamiento de un compañero noqueado
// HITO 4: altura de hover reducida (el halo de sombra + propulsor hacen que
// el vuelo se lea sin alejar tanto al dron del suelo).
const DRONE_HOVER_ALT = 1.9;
const DRONE_PATROL_SPEED = 5.0;
export const DRONE_ZAP_RANGE = 1.9;
export const TURRET_RANGE = 26.0;
export const TURRET_FIRE_CD = 1.6;
const TURRET_FIRE_CD_PREDICTIVE = 1.0;
const PROJECTILE_SPEED = 18.0;
const PROJECTILE_SPEED_PREDICTIVE = 26.0;
const PROJECTILE_LIFE = 4.0;
const PROJECTILE_HIT_RADIUS = 1.2;

// --- HITO 1: IA justa y orgánica (aviso, zonas, sospecha gradual) ---
const WARNING_SUSPICION_THRESHOLD = 0.38; // PATROL -> WARNING (cono ámbar)
const WARNING_SUSPICION_CAP = 0.78; // tope sin infracción: avisa, no ataca
const WARNING_IGNORE_DIST = 5.5; // ignoró el aviso a quemarropa...
const WARNING_IGNORE_TIME = 1.8; // ...demasiado tiempo -> sin tope
const WARNING_MELEE_PUSH_DIST = 5.2; // se mete en distancia melee...
const WARNING_MELEE_PUSH_TIME = 1.5; // ...más de 1.5s -> combate
const WARNING_GAZE_HOLD = 0.6; // mirada breve al perderlo de vista
const WARNING_SEARCH_TIME = 3.5; // búsqueda corta tras un aviso
const WARNING_SOUND_COOLDOWN = 3.5; // el chirp de aviso no spamea
const WARNING_BANNER_HOLD = 0.5; // banner HUD activo tras refrescar
const CALM_SUSPICION_RAMP = 0.42; // rampa suave sin infracción (aviso)
const INFRACTION_SUSPICION_RAMP = 1.25; // rampa rápida con infracción
const CALM_DISGUISED_DECAY = 0.32; // disfrazado calmado: el guardia relaja
export const CONE_COLOR_WARNING = 0xf59e0b; // ámbar del modo WARNING
export const WINDUP_WHIFF_MARGIN = 0.9; // esquivado: fuera de attackRange + 0.9
const WINDUP_WHIFF_AIR_MIN_DIST = 2.2; // ...o saltando con margen > 2.2 m

// --- HITO 1: steering tangente multi-rayo anti "chunk cuadrado" ---
const STEER_LOOKAHEAD = 3.2; // m de sondeo por delante
const STEER_LIFT = 0.9; // m sobre la superficie (la curvatura no da falsos)
const STEER_PROBE_ANGLES = [0, 0.45, -0.45, 0.9, -0.9, 1.45, -1.45]; // rad
const ENEMY_MAX_TURN_RAD_PER_SEC = 3.4; // giro suave del forward (caminantes)
const DRONE_MAX_TURN_RAD_PER_SEC = 5.0; // los drones giran más rápido
const ENEMY_SEPARATION_RANGE = 2.8; // m de separación tangente enemigo-enemigo
const ENEMY_SEPARATION_STRENGTH = 0.42; // desvío lateral del objetivo
const FLANK_MILD_ANGLE = 0.22; // rad de flanqueo suave (solo a media distancia)
const FLANK_MIN_DIST = 5;
const FLANK_MAX_DIST = 11;

const LOOKOUT_SWING = Math.PI / 3; // ±60º barriendo el patio
const LOOKOUT_SWING_SPEED = 0.55;

const GUARD_STRUCTURE_RADIUS = 0.6; // radio de colisión guardia vs edificios
const CONE_COLOR_PATROL = 0x4ade80;
const CONE_COLOR_SEARCH = 0xfacc15;
const CONE_COLOR_COMBAT = 0xf87171;

const ENEMY_STRIKE_ANIM_TIME = 0.28;

/** Mesh placeholder del animador hasta que syncEnemyTransform asigna el real. */
const _dummy = new THREE.Object3D();

// Vectores scratch de módulo (cero allocations por frame): se escriben y
// leen dentro de un mismo método, nunca a través de llamadas.
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _v5 = new THREE.Vector3();
const _v6 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _upAxis = new THREE.Vector3(0, 1, 0);
const _steerTangent = new THREE.Vector3();
const _steerProbe = new THREE.Vector3();
const _steerStart = new THREE.Vector3();
const _steerEnd = new THREE.Vector3();
const _steerGoal = new THREE.Vector3();
const _sepGoal = new THREE.Vector3();
const _sep = new THREE.Vector3();
const _chaseGoal = new THREE.Vector3();
const _propMid = new THREE.Vector3();
const _propD1 = new THREE.Vector3();
const _propD2 = new THREE.Vector3();
const _propR = new THREE.Vector3();
const _propQ = new THREE.Vector3();
const _animDelta = new THREE.Vector3();

/** Nombre legible del atacante para la tarjeta de daño del HUD. */
function enemyAttackerName(enemy: EnemyObj): string {
  switch (enemy.skin) {
    case 'panther':
      return 'Pantera';
    case 'monkey':
      return 'Mono vigía';
    case 'gorilla':
      return 'Gorila';
    case 'samurai':
      return 'Samurái';
    case 'oni':
      return 'Oni acorazado';
    case 'cyber_guard':
      return 'Ciber-guardia';
    case 'cyber_officer':
      return 'Ciber-oficial';
    case 'cyber_mech':
      return 'Ciber-mecha';
    case 'wasp':
      return 'Avispa gigante';
    case 'cyber_drone':
      return 'Ciber-dron';
    default:
      break;
  }
  switch (enemy.kind) {
    case 'officer':
      return 'Oficial';
    case 'brute':
      return 'Coloso';
    case 'drone':
      return 'Dron vigía';
    default:
      return 'Guardia';
  }
}

// ============================================================================
// Contrato del host: estado compartido del WorldObjectsManager
// ============================================================================
// El WorldObjectsManager implementa esta interfaz; la IA lee y escribe sus
// arrays y campos directamente (cero copias, cero allocations por frame).
// ============================================================================
export interface EnemyAIHost {
  /** Enemigos vivos del nivel (spawneados por el host). */
  readonly enemies: EnemyObj[];
  /** Pool de proyectiles de torretas (también usado por los orbes de KRONOS). */
  readonly projectiles: TurretProjectile[];
  /** Colliders de edificios/estructuras del planeta dado (visión y steering). */
  getStructureColliders(planetId: string): StructureCollider[];
  /** Colliders físicos de props del planeta dado (flora, rocas). */
  getPropColliders(planetId: string): PropCollider[];
  /** Planetas de la galaxia continua. */
  readonly planets: PlanetRuntime[];
  /** Zonas restringidas instanciadas en buildGalaxy. */
  readonly restrictedZones: RestrictedZoneRuntime[];
  /** Compuertas con LOCKDOWN (la IA las cierra al alertarse). */
  readonly lockedGates: LockedGateObj[];
  /** Reloj maestro del mundo (segundos). */
  clock: number;
  /** Alerta global del planeta activo. */
  globalAlert: boolean;
  /** Escudo predictivo de torretas (adaptación de la Red de IA). */
  predictiveShields: boolean;
  /** Escalado de detección por baseAlertLevel. */
  alertBoost: number;
  /** Cache por frame/planeta de la zona restringida bajo el jugador. */
  zoneCachePlanetId: string | null;
  /** Banner de VIGILANCIA preasignado (sin GC por frame). */
  readonly warningBannerData: { speaker: string; text: string };
  warningBannerT: number;
  /** Cambia al aparecer/cambiar/caducar el banner (clave discreta del HUD). */
  warningBannerSeq: number;
  /** LOCKDOWN de compuertas activo. */
  lockdownActive: boolean;
  /** Contadores de objetivos (leídos por el HUD y los objetivos de planeta). */
  guardsKnockedOut: number;
  keycardsCollected: number;
  /** Callbacks cableados por el GameEngine. */
  onGlobalAlert: (() => void) | null;
  onSound: ((kind: GameSoundKind) => void) | null;
  onGateLockdown: (() => void) | null;
  /** Reacciones del mundo que siguen viviendo en el host. */
  spawnExplosion(pos: THREE.Vector3, radius: number, color: number): void;
  setGateOpen(gate: LockedGateObj, open: boolean): void;
}

// ============================================================================
// EnemyAISystem — actualización por frame de toda la red enemiga
// ============================================================================
export class EnemyAISystem {
  constructor(private readonly host: EnemyAIHost) {}

  // HITO 4: parámetros preasignados del animador procedural (cero
  // allocations por frame: se mutan los campos escalares y se reutiliza).
  private readonly enemyAnim: EnemyAnimParams = {
    rig: createEmptyEnemyRig(),
    kind: 'guard',
    skin: 'default',
    state: GUARD_STATE_PATROL,
    stationaryLookout: false,
    walkPhase: 0,
    hoverPhase: 0,
    windupProgress: 0,
    strikeDecay: 0,
    speedRatio: 0,
    turnRate: 0,
    clock: 0,
    dt: 0,
    enemyMesh: _dummy,
  };
  /** Resultado cacheado de la zona restringida del frame. */
  private zoneCacheResult: RestrictedZoneSpec | null = null;

  /** Invalida la cache de zona restringida (reset de galaxia del host). */
  resetZoneCache(): void {
    this.zoneCacheResult = null;
  }

  // --------------------------------------------------------------------------
  // Red de IA intra-planeta: visión curva, sospecha, disfraces y radio
  // --------------------------------------------------------------------------
  updateEnemies(
    dt: number,
    state: WorldPlayerState,
    onPlayerDamage: PlayerDamageFn
  ): void {
    for (const enemy of this.host.enemies) {
      enemy.attackCd -= dt;
      if (enemy.warningCooldown > 0) enemy.warningCooldown -= dt;
      if (enemy.state === GUARD_STATE_KO) {
        // Check-in por radio: demasiado tiempo sin respuesta de un compañero.
        enemy.koTimer += dt;
        if (!enemy.koRadioSent && enemy.koTimer > RADIO_CHECKIN_DELAY) {
          enemy.koRadioSent = true;
          this.radioMissingGuard(enemy);
        }
      } else if (enemy.kind === 'turret') {
        this.updateTurret(enemy, dt, state);
      } else if (enemy.kind === 'drone') {
        this.updateDrone(enemy, dt, state, onPlayerDamage);
      } else {
        this.updateWalker(enemy, dt, state, onPlayerDamage);
      }
      this.syncEnemyTransform(enemy, dt);
    }
    this.updateProjectiles(dt, state, onPlayerDamage);
  }

  /**
   * Oclusión por curvatura de la esfera: la línea de visión entre dos puntos
   * de la superficie queda cortada por el horizonte esférico cuando el punto
   * medio del arco se hunde bajo el radio del planeta.
   */
  curvatureLOS(
    fromPos: THREE.Vector3,
    toPos: THREE.Vector3,
    planet: PlanetRuntime
  ): boolean {
    _v5.copy(fromPos).sub(planet.centerVec).normalize();
    _v6.copy(toPos).sub(planet.centerVec).normalize();
    const cosTheta = THREE.MathUtils.clamp(_v5.dot(_v6), -1, 1);
    const half = Math.sqrt(Math.max(0, (1 + cosTheta) * 0.5)); // cos(theta/2)
    return (planet.spec.radius + 1.4) * half >= planet.spec.radius + CURVATURE_CLEARANCE;
  }

  /**
   * Cono de visión curvo: distancia + ángulo frontal + oclusión por la
   * curvatura de la esfera + muros/edificios en la línea de visión (LoS real
   * contra los colliders de estructuras) + hierba alta (a quemarropa se ve).
   */
  private enemyCanSeePlayer(
    enemy: EnemyObj,
    state: WorldPlayerState,
    range: number,
    playerDist: number
  ): boolean {
    if (playerDist > range) return false;
    _v5.copy(state.pos).sub(enemy.pos).divideScalar(Math.max(playerDist, 1e-6));
    if (enemy.forward.dot(_v5) < VISION_MIN_DOT) return false;
    if (!this.curvatureLOS(enemy.pos, state.pos, enemy.planet)) return false;
    // Un muro o edificio en medio corta la línea de visión.
    if (
      isLineBlockedByStructures(
        enemy.pos,
        state.pos,
        this.host.getStructureColliders(enemy.planet.spec.id),
        enemy.planet.spec.id
      )
    ) {
      return false;
    }
    if (state.inGrass && playerDist > GRASS_HIDE_DIST) return false;
    if (state.burrowing || state.swimming) return false;
    return true;
  }

  /**
   * HITO 1 — ¿La dirección radial cae dentro de una zona restringida del
   * planeta? (patios fortificados, templos sellados, reactores, arena).
   * Test por punto (dot > cos) SIN allocations.
   */
  isPosInRestrictedZone(dir: THREE.Vector3, planetId: string): RestrictedZoneSpec | null {
    for (let i = 0; i < this.host.restrictedZones.length; i++) {
      const zone = this.host.restrictedZones[i];
      if (zone.planetId !== planetId) continue;
      if (dir.dot(zone.dir) > zone.cosThreshold) return zone.spec;
    }
    return null;
  }

  /** Zona restringida bajo el jugador (cacheada por frame y planeta). */
  private cachedPlayerZone(
    planet: PlanetRuntime,
    state: WorldPlayerState
  ): RestrictedZoneSpec | null {
    if (this.host.zoneCachePlanetId !== planet.spec.id) {
      this.host.zoneCachePlanetId = planet.spec.id;
      _v5.copy(state.pos).sub(planet.centerVec);
      this.zoneCacheResult =
        _v5.lengthSq() > 1e-6
          ? this.isPosInRestrictedZone(_v5.normalize(), planet.spec.id)
          : null;
    }
    return this.zoneCacheResult;
  }

  /**
   * HITO 1 — Sospecha 0..1 GRADUAL Y JUSTA: eliminado el aggro injusto de
   * 1 frame (`suspicion = 1` al vernos sin disfraz).
   *
   * - Sin infracción (zona pública, calmado): rampa suave 0.42·df con tope
   *   0.78 — el cono se vuelve ámbar, aparece '?' y el guardia AVISA; solo
   *   si ignoras el aviso a quemarropa (>1.8s a <5.5m) se quita el tope.
   * - Con infracción (zona restringida, alarma global, ataque reciente,
   *   contrabando de Estasis, sprint cerca, oficial que desmonta el
   *   disfraz): rampa rápida 1.25·df — ~0.4s a quemarropa, 0.9-1.2s a
   *   distancia, pasando brevemente por WARNING antes del combate.
   * - Disfrazado calmado: el guardia se relaja (decae).
   * - Sin línea de visión: decae limpio (SUSPICION_DECAY).
   */
  private updateSuspicion(enemy: EnemyObj, dt: number, state: WorldPlayerState, playerDist: number, range: number): boolean {
    const sees = this.enemyCanSeePlayer(enemy, state, range, playerDist);
    const distanceFactor = THREE.MathUtils.clamp(
      1.35 - playerDist / Math.max(range, 1),
      0.35,
      1.5
    );
    if (sees) {
      const trespassing = this.cachedPlayerZone(enemy.planet, state) !== null;
      const infraction =
        trespassing ||
        this.host.globalAlert ||
        state.hostileRecent ||
        state.holdingContraband ||
        (state.sprinting && playerDist < 10) ||
        (enemy.kind === 'officer' && playerDist < OFFICER_UNMASK_RANGE);
      if (infraction) {
        // Infracción: escalada rápida pero gradual (jamás = 1 en un frame).
        enemy.suspicion += dt * INFRACTION_SUSPICION_RAMP * distanceFactor;
      } else if (state.disguised) {
        // Disfrazado y calmado: el guardia baja la guardia poco a poco.
        enemy.suspicion -= dt * CALM_DISGUISED_DECAY;
      } else {
        // Sospechoso sin infracción: aviso amable con tope (modo WARNING).
        enemy.suspicion += dt * CALM_SUSPICION_RAMP * distanceFactor;
        const ignoresWarning =
          playerDist < WARNING_IGNORE_DIST && enemy.warningT > WARNING_IGNORE_TIME;
        if (!ignoresWarning && enemy.suspicion > WARNING_SUSPICION_CAP) {
          enemy.suspicion = WARNING_SUSPICION_CAP;
        }
      }
    } else {
      enemy.suspicion -= dt * SUSPICION_DECAY;
    }
    enemy.suspicion = THREE.MathUtils.clamp(enemy.suspicion, 0, 1);
    return sees;
  }

  /**
   * HITO 1 — Entrada en modo WARNING: el enemigo se detiene, encara al
   * jugador, suena el chirp crisp (una vez por entrada, con cooldown) y el
   * HUD muestra el banner de VIGILANCIA. Sin alarma global: solo avisa.
   */
  private enterWarning(enemy: EnemyObj, state: WorldPlayerState): void {
    enemy.state = GUARD_STATE_WARNING;
    enemy.warningT = 0;
    enemy.warningGazeT = 0;
    enemy.warningCloseT = 0;
    // La búsqueda posterior (si pierde al jugador) va hacia su posición.
    _v5.copy(state.pos).sub(enemy.planet.centerVec).normalize();
    enemy.lastSeenDir.copy(_v5);
    if (enemy.warningCooldown <= 0) {
      enemy.warningCooldown = WARNING_SOUND_COOLDOWN;
      this.host.onSound?.('warning');
    }
    this.refreshWarningBanner(enemy, state);
  }

  /** Sale del modo WARNING limpiando sus temporizadores. */
  private exitWarning(enemy: EnemyObj, nextState: number): void {
    enemy.state = nextState;
    enemy.warningT = 0;
    enemy.warningGazeT = 0;
    enemy.warningCloseT = 0;
  }

  /**
   * HITO 1 — Banner de VIGILANCIA del HUD: texto según el contexto (zona
   * restringida vs. actitud sospechosa) y altavoz según la skin del enemigo.
   */
  private refreshWarningBanner(enemy: EnemyObj, state: WorldPlayerState): void {
    const trespassing = this.cachedPlayerZone(enemy.planet, state) !== null;
    const text = trespassing
      ? 'Zona restringida — no te acerques'
      : '¡Alto! Actitud sospechosa — retrocede despacio';
    const speaker = this.enemyDisplayName(enemy);
    if (
      this.host.warningBannerT <= 0 ||
      this.host.warningBannerData.text !== text ||
      this.host.warningBannerData.speaker !== speaker
    ) {
      this.host.warningBannerData.speaker = speaker;
      this.host.warningBannerData.text = text;
      this.host.warningBannerSeq++;
    }
    this.host.warningBannerT = WARNING_BANNER_HOLD;
  }

  /** Nombre visible del enemigo (banner de aviso y Lock-On). */
  enemyDisplayName(enemy: EnemyObj): string {
    switch (enemy.skin) {
      case 'panther':
        return enemy.kind === 'officer' ? 'Alfa de la Ruina' : 'Pantera';
      case 'monkey':
        return 'Mono vigía';
      case 'gorilla':
        return 'Gorila lomo plateado';
      case 'wasp':
        return 'Avispa gigante';
      case 'samurai':
        return enemy.kind === 'officer' ? 'Capitán Samurái' : 'Samurái';
      case 'oni':
        return 'Oni acorazado';
      case 'cyber_guard':
        return 'Cyber Guardia';
      case 'cyber_officer':
        return 'Oficial Cyber';
      case 'cyber_drone':
        return 'Dron de reconocimiento';
      case 'cyber_mech':
        return 'Mech pesado';
      default:
        break;
    }
    switch (enemy.kind) {
      case 'officer':
        return 'Oficial';
      case 'drone':
        return 'Dron';
      case 'turret':
        return 'Torreta';
      case 'brute':
        return 'Brute élite';
      default:
        return 'Guardia';
    }
  }

  /** Guardias, oficiales y brutes: patrulla, aviso, búsqueda, caza y melee. */
  private updateWalker(
    enemy: EnemyObj,
    dt: number,
    state: WorldPlayerState,
    onPlayerDamage: PlayerDamageFn
  ): void {
    _v1.copy(state.pos).sub(enemy.pos);
    const playerDist = _v1.length();
    const detectRange =
      enemy.params.detectRange * state.stealthMul * (1 + this.host.alertBoost) *
      (this.host.globalAlert ? 1.35 : 1);
    const sees = this.updateSuspicion(enemy, dt, state, playerDist, detectRange);

    if (enemy.state === GUARD_STATE_PATROL) {
      // Cuerpo de un compañero descubierto: aviso por radio y búsqueda.
      if (this.checkBodyDiscovery(enemy)) return;
      if (enemy.suspicion >= WARNING_SUSPICION_THRESHOLD) {
        // HITO 1: sospecha suficiente -> AVISA (cono ámbar, '?', banner);
        // nunca más aggro instantáneo por el mero hecho de ser visto.
        this.enterWarning(enemy, state);
      } else if (enemy.stationaryLookout) {
        // FASE B: vigía en su puesto — barre ±60º oteando el patio.
        this.updateLookoutScan(enemy, dt);
      } else {
        const target = enemy.waypoints[enemy.waypointIdx];
        _v2.copy(target);
        this.steerAndMoveEnemy(enemy, _v2, GUARD_PATROL_SPEED * (this.host.globalAlert ? 1.5 : 1), dt);
        if (enemy.dir.angleTo(target) < 0.02) {
          enemy.waypointIdx = (enemy.waypointIdx + 1) % enemy.waypoints.length;
        }
      }
      // Eventos instantáneos legítimos (escáner, habilidad delante de un
      // guardia, casco golpeado): la sospecha ya llegó a 1 por el suceso.
      if (enemy.state === GUARD_STATE_PATROL && enemy.suspicion >= 1) {
        this.enterCombat(enemy, state);
      }
    } else if (enemy.state === GUARD_STATE_WARNING) {
      // HITO 1 — Modo aviso: se detiene y encara al jugador dándole una
      // oportunidad de retirarse; solo escala si el jugador la ignora.
      enemy.warningT += dt;
      if (sees) {
        enemy.warningGazeT = 0;
        this.faceEnemyTowardsPlayer(enemy, state, dt);
        this.refreshWarningBanner(enemy, state);
        if (playerDist < WARNING_MELEE_PUSH_DIST) {
          // Se mete en distancia melee demasiado tiempo -> combate.
          enemy.warningCloseT += dt;
          if (enemy.warningCloseT > WARNING_MELEE_PUSH_TIME) enemy.suspicion = 1;
        } else {
          enemy.warningCloseT = Math.max(0, enemy.warningCloseT - dt);
        }
        if (enemy.suspicion >= 1) {
          this.enterCombat(enemy, state);
        } else if (enemy.suspicion < WARNING_SUSPICION_THRESHOLD * 0.6) {
          // Se calmó / se puso el disfraz: vuelve a patrullar en paz.
          this.exitWarning(enemy, GUARD_STATE_PATROL);
        }
      } else {
        // Perdido de vista: sostiene la mirada 0.6s y decide sin alarma.
        enemy.warningGazeT += dt;
        if (enemy.warningGazeT >= WARNING_GAZE_HOLD) {
          if (enemy.suspicion >= 0.5) {
            _v1.copy(state.pos).sub(enemy.planet.centerVec).normalize();
            enemy.lastSeenDir.copy(_v1);
            this.exitWarning(enemy, GUARD_STATE_SEARCH);
            enemy.searchT = WARNING_SEARCH_TIME;
          } else {
            this.exitWarning(enemy, GUARD_STATE_PATROL);
          }
        }
      }
    } else if (enemy.state === GUARD_STATE_SEARCH) {
      enemy.searchT -= dt;
      if (enemy.stationaryLookout) {
        this.updateLookoutScan(enemy, dt);
      } else {
        _v2.copy(enemy.lastSeenDir);
        this.steerAndMoveEnemy(enemy, _v2, GUARD_PATROL_SPEED * 1.3, dt);
      }
      if (this.checkBodyDiscovery(enemy)) return;
      if (enemy.suspicion >= 1) {
        this.enterCombat(enemy, state);
      } else if (enemy.searchT <= 0) {
        enemy.state = GUARD_STATE_PATROL;
        enemy.suspicion = Math.min(enemy.suspicion, 0.35);
      }
    } else if (enemy.state === GUARD_STATE_CHASE) {
      if (enemy.stationaryLookout) {
        // FASE B: el vigía no abandona su torre: apunta al jugador y da la
        // voz de alarma por radio (sigue atacando si suben a su puesto).
        _v2.copy(state.pos).sub(enemy.pos);
        _v2.addScaledVector(enemy.dir, -_v2.dot(enemy.dir));
        if (_v2.lengthSq() > 1e-6) this.turnEnemyForwardTowards(enemy, _v2.normalize(), dt);
      } else {
        _chaseGoal.copy(state.pos).sub(enemy.planet.centerVec).normalize();
        // HITO 1: flanqueo suave (±0.22 rad) SOLO a media distancia y con la
        // ruta verificada — el órbita constante anterior los lanzaba de
        // lado contra los muros en chunk cuadrado.
        if (playerDist > FLANK_MIN_DIST && playerDist < FLANK_MAX_DIST) {
          _q1.setFromAxisAngle(enemy.dir, FLANK_MILD_ANGLE * enemy.flankSide);
          _v3.copy(_chaseGoal).applyQuaternion(_q1).normalize();
          if (this.enemyTangentClear(enemy, _v3)) _chaseGoal.copy(_v3);
        }
        this.steerAndMoveEnemy(enemy, _chaseGoal, enemy.params.chaseSpeed, dt);
      }
      const lostTrack =
        playerDist > GUARD_GIVEUP_DIST ||
        (state.disguised && !sees && playerDist > GUARD_GIVEUP_DIST * 0.45);
      if (lostTrack) {
        enemy.state = GUARD_STATE_SEARCH;
        enemy.searchT = SEARCH_DURATION;
        enemy.lastSeenDir.copy(_chaseGoal);
      } else if (playerDist < enemy.params.attackRange && enemy.attackCd <= 0) {
        enemy.state = GUARD_STATE_WINDUP;
        enemy.windupT = enemy.params.windupTime;
        // HITO 1: el anillo arranca en su estado p=0 (sin opacidad/scale
        // heredados de un windup anterior).
        this.updateWindupRing(enemy);
        // HITO 1: cue crisp de telegraph junto al anillo del suelo.
        this.host.onSound?.('warning');
      }
    } else if (enemy.state === GUARD_STATE_WINDUP) {
      if (playerDist > GUARD_GIVEUP_DIST) {
        enemy.state = GUARD_STATE_CHASE;
      }
      enemy.windupT -= dt;
      this.updateWindupRing(enemy);
      if (enemy.windupT <= 0) {
        enemy.state = GUARD_STATE_CHASE;
        enemy.attackCd = enemy.params.attackCdTime;
        // HITO 4: follow-through visible del barrido (brazo que cruza).
        enemy.strikeAnimT = ENEMY_STRIKE_ANIM_TIME;
        // HITO 1 — Esquiva justa: fuera de alcance (> attackRange + 0.9) o
        // saltando con margen (> 2.2 m), el barrido falla sin daño.
        const outOfRange = playerDist > enemy.params.attackRange + WINDUP_WHIFF_MARGIN;
        const jumpedOver = state.airborne && playerDist > WINDUP_WHIFF_AIR_MIN_DIST;
        if (!outOfRange && !jumpedOver) {
          _v1.divideScalar(Math.max(playerDist, 1e-6));
          _v1.multiplyScalar(9).addScaledVector(state.up, 4);
          // HITO 3: atribución completa — quién golpeó y por qué (zona
          // restringida = asalto a una instalación, no un simple zarpazo).
          onPlayerDamage(
            1,
            _v1.x,
            _v1.y,
            _v1.z,
            enemyAttackerName(enemy),
            this.cachedPlayerZone(enemy.planet, state) !== null
              ? 'Ataque en zona restringida'
              : 'Golpe cuerpo a cuerpo',
            enemy.pos.x,
            enemy.pos.y,
            enemy.pos.z
          );
        }
      }
    }
  }

  /** Dron rápido: flota sobre la superficie persiguiendo al jugador. */
  private updateDrone(
    enemy: EnemyObj,
    dt: number,
    state: WorldPlayerState,
    onPlayerDamage: PlayerDamageFn
  ): void {
    _v1.copy(state.pos).sub(enemy.pos);
    const playerDist = _v1.length();
    const detectRange =
      enemy.params.detectRange * state.stealthMul * (1 + this.host.alertBoost) *
      (this.host.globalAlert ? 1.35 : 1);
    const sees = this.updateSuspicion(enemy, dt, state, playerDist, detectRange);

    if (enemy.state === GUARD_STATE_PATROL) {
      const target = enemy.waypoints[enemy.waypointIdx];
      // HITO 1: separación tangente — los drones se reparten en abanico
      // en vez de apilarse sobre el mismo waypoint (vuelan, no chocan muros).
      _v2.copy(target);
      this.applyEnemySeparation(enemy, _v2);
      this.moveEnemyTowards(enemy, _v2, DRONE_PATROL_SPEED, dt);
      if (enemy.dir.angleTo(target) < 0.02) {
        enemy.waypointIdx = (enemy.waypointIdx + 1) % enemy.waypoints.length;
      }
      if (enemy.suspicion >= 1) this.enterCombat(enemy, state);
    } else if (enemy.state === GUARD_STATE_CHASE) {
      _chaseGoal.copy(state.pos).sub(enemy.planet.centerVec).normalize();
      this.applyEnemySeparation(enemy, _chaseGoal);
      this.moveEnemyTowards(enemy, _chaseGoal, enemy.params.chaseSpeed, dt);
      const lostTrack =
        playerDist > GUARD_GIVEUP_DIST + 4 ||
        (state.disguised && !sees && playerDist > 12);
      if (lostTrack) {
        enemy.state = GUARD_STATE_PATROL;
        enemy.suspicion = 0.4;
      } else if (playerDist < DRONE_ZAP_RANGE && enemy.attackCd <= 0) {
        // HITO 3 — Telegraph justo: el dron CARGA 0.35s con su anillo/halo
        // de windup + click de carga antes de soltar el zap (nada de daño
        // instantáneo sin aviso en distancia de contacto).
        enemy.state = GUARD_STATE_WINDUP;
        enemy.windupT = enemy.params.windupTime;
        this.updateWindupRing(enemy);
        this.host.onSound?.('telegraph');
      }
    } else if (enemy.state === GUARD_STATE_WINDUP) {
      // HITO 3 — Windup del zap: halo pulsante 0.35s; si el jugador se
      // aleja del área del anillo antes del final, el zap falla en vacío.
      if (playerDist > GUARD_GIVEUP_DIST + 4) {
        enemy.state = GUARD_STATE_CHASE;
      }
      enemy.windupT -= dt;
      this.updateWindupRing(enemy);
      if (enemy.windupT <= 0) {
        enemy.state = GUARD_STATE_CHASE;
        enemy.attackCd = enemy.params.attackCdTime;
        // HITO 4: follow-through del zap (embestida eléctrica hacia delante).
        enemy.strikeAnimT = ENEMY_STRIKE_ANIM_TIME;
        const outOfRange = playerDist > DRONE_ZAP_RANGE + WINDUP_WHIFF_MARGIN;
        if (!outOfRange) {
          // _v1 pudo ser sobreescrito: se recalcula el empuje del zap desde
          // el offset real jugador-dron.
          _v1.copy(state.pos).sub(enemy.pos);
          _v1.divideScalar(Math.max(playerDist, 1e-6));
          _v1.multiplyScalar(7).addScaledVector(state.up, 4);
          onPlayerDamage(
            1,
            _v1.x,
            _v1.y,
            _v1.z,
            enemyAttackerName(enemy),
            enemy.skin === 'wasp' ? 'Aguijonazo eléctrico' : 'Descarga eléctrica',
            enemy.pos.x,
            enemy.pos.y,
            enemy.pos.z
          );
        }
      }
    }
  }

  /** Torreta antiaérea: dispara proyectiles parreables al jugador aéreo. */
  private updateTurret(enemy: EnemyObj, dt: number, state: WorldPlayerState): void {
    if (!state.airborne || state.swimming) return;
    _v1.copy(state.pos).sub(enemy.pos);
    const dist = _v1.length();
    if (dist > TURRET_RANGE) return;
    if (!this.curvatureLOS(enemy.pos, state.pos, enemy.planet)) return;
    if (enemy.attackCd > 0) return;
    enemy.attackCd = this.host.predictiveShields ? TURRET_FIRE_CD_PREDICTIVE : TURRET_FIRE_CD;
    this.spawnTurretProjectile(enemy, state);
  }

  private spawnTurretProjectile(enemy: EnemyObj, state: WorldPlayerState): void {
    for (const proj of this.host.projectiles) {
      if (proj.active) continue;
      proj.active = true;
      proj.reflected = false;
      proj.life = PROJECTILE_LIFE;
      proj.material.color.set(0xfb923c);
      proj.pos.copy(enemy.pos).addScaledVector(enemy.dir, 1.6);
      proj.vel.copy(state.pos).addScaledVector(state.up, 0.6).sub(proj.pos).normalize();
      const speed = this.host.predictiveShields ? PROJECTILE_SPEED_PREDICTIVE : PROJECTILE_SPEED;
      proj.vel.multiplyScalar(speed);
      proj.mesh.position.copy(proj.pos);
      proj.mesh.visible = true;
      return;
    }
  }

  private updateProjectiles(
    dt: number,
    state: WorldPlayerState,
    onPlayerDamage: PlayerDamageFn
  ): void {
    for (const proj of this.host.projectiles) {
      if (!proj.active) continue;
      proj.life -= dt;
      proj.pos.addScaledVector(proj.vel, dt);
      proj.mesh.position.copy(proj.pos);

      // Impacto contra el jugador.
      if (proj.pos.distanceToSquared(state.pos) < PROJECTILE_HIT_RADIUS * PROJECTILE_HIT_RADIUS) {
        // HITO 3: posición mundial del proyectil capturada ANTES de
        // desactivarlo (fuente limpia del chevron direccional).
        const srcX = proj.pos.x;
        const srcY = proj.pos.y;
        const srcZ = proj.pos.z;
        this.deactivateProjectile(proj);
        _v1.copy(proj.vel).normalize().multiplyScalar(8).addScaledVector(state.up, 4);
        onPlayerDamage(
          1,
          _v1.x,
          _v1.y,
          _v1.z,
          'Torreta antiaérea',
          'Proyectil láser mientras volabas',
          srcX,
          srcY,
          srcZ
        );
        continue;
      }

      // Proyectil parreado: destruye su torreta al volver.
      if (proj.reflected) {
        let hit = false;
        for (const enemy of this.host.enemies) {
          if (enemy.kind !== 'turret' || enemy.state === GUARD_STATE_KO) continue;
          if (proj.pos.distanceToSquared(enemy.pos) < 4) {
            this.destroyTurret(enemy);
            hit = true;
            break;
          }
        }
        if (hit) {
          this.deactivateProjectile(proj);
          continue;
        }
      }

      // Impacto contra el terreno o fin de vida útil.
      const planet = findStrongestGravityPlanet(proj.pos, this.host.planets, null);
      // HITO 2: superficie real = radio nominal + terreno local.
      _v2.copy(proj.pos).sub(planet.centerVec);
      const projDist = _v2.length();
      if (projDist > 1e-6) _v2.divideScalar(projDist);
      const projSurface =
        planet.spec.radius + getPlanetTerrainOffsetVec(planet.spec.id, _v2) + 0.3;
      if (projDist <= projSurface) {
        this.deactivateProjectile(proj);
      } else if (proj.life <= 0) {
        this.deactivateProjectile(proj);
      }
    }
  }

  deactivateProjectile(proj: TurretProjectile): void {
    proj.active = false;
    proj.mesh.visible = false;
  }

  /** Un guardia avista a un compañero noqueado: radio + búsqueda global. */
  private checkBodyDiscovery(enemy: EnemyObj): boolean {
    for (const other of this.host.enemies) {
      if (other === enemy || other.state !== GUARD_STATE_KO) continue;
      if (other.pos.distanceToSquared(enemy.pos) > BODY_SPOT_RANGE * BODY_SPOT_RANGE) continue;
      _v5.copy(other.pos).sub(enemy.pos).normalize();
      if (enemy.forward.dot(_v5) < 0.1) continue;
      if (!this.curvatureLOS(enemy.pos, other.pos, enemy.planet)) continue;
      this.startSearch(enemy, other.dir);
      this.radioAlert(enemy.pos, '¡Intruso disfrazado!');
      return true;
    }
    return false;
  }

  /** Sin respuesta por radio de un compañero cercano: búsqueda coordinada. */
  private radioMissingGuard(koEnemy: EnemyObj): void {
    for (const enemy of this.host.enemies) {
      if (enemy.state !== GUARD_STATE_PATROL) continue;
      if (enemy.kind === 'turret' || enemy.kind === 'drone') continue;
      if (enemy.pos.distanceToSquared(koEnemy.pos) > RADIO_ALERT_RANGE * RADIO_ALERT_RANGE) {
        continue;
      }
      this.startSearch(enemy, koEnemy.dir);
    }
    this.triggerGlobalAlert(koEnemy.planet);
  }

  private startSearch(enemy: EnemyObj, targetDir: THREE.Vector3): void {
    enemy.state = GUARD_STATE_SEARCH;
    enemy.searchT = SEARCH_DURATION;
    enemy.lastSeenDir.copy(targetDir);
    enemy.suspicion = Math.max(enemy.suspicion, 0.6);
  }

  /** Radio: alerta a los compañeros cercanos ("¡Intruso disfrazado!"). */
  radioAlert(pos: THREE.Vector3, _message: string): void {
    for (const enemy of this.host.enemies) {
      if (enemy.state === GUARD_STATE_KO) continue;
      if (enemy.kind === 'turret') continue;
      if (enemy.pos.distanceToSquared(pos) > RADIO_ALERT_RANGE * RADIO_ALERT_RANGE) continue;
      if (enemy.state === GUARD_STATE_PATROL) this.startSearch(enemy, enemy.lastSeenDir);
      enemy.suspicion = Math.max(enemy.suspicion, 0.75);
    }
    this.triggerGlobalAlert(findStrongestGravityPlanet(pos, this.host.planets, null));
  }

  private enterCombat(enemy: EnemyObj, state: WorldPlayerState): void {
    enemy.state = GUARD_STATE_CHASE;
    _v2.copy(state.pos).sub(enemy.planet.centerVec).normalize();
    enemy.lastSeenDir.copy(_v2);
    this.radioAlert(enemy.pos, '¡Intruso disfrazado!');
  }

  private triggerGlobalAlert(planet: PlanetRuntime | null = null): void {
    if (this.host.globalAlert) return;
    this.host.globalAlert = true;
    this.host.onSound?.('alert');
    this.host.onGlobalAlert?.();
    this.applyGateLockdown(planet);
  }

  /**
   * FASE B — LOCKDOWN: al saltar la alarma en un planeta, sus compuertas con
   * `lockdownOnAlert` se cierran de golpe (aunque estuvieran abiertas por
   * palanca o tarjeta), bloqueando la ruta directa y obligando al jugador a
   * buscar una alternativa: pared rompible, subsuelo de Digger, tejado o
   * palanca de desbloqueo.
   */
  private applyGateLockdown(planet: PlanetRuntime | null): void {
    let closed = 0;
    for (const gate of this.host.lockedGates) {
      if (!gate.lockdownOnAlert) continue;
      if (planet !== null && gate.planet !== planet) continue;
      if (gate.closed) continue;
      this.host.setGateOpen(gate, false);
      closed++;
    }
    if (closed > 0) {
      this.host.lockdownActive = true;
      this.host.onGateLockdown?.();
    }
  }

  /**
   * FASE B — Barrido de vigilancia del vigía estacionario: rota suavemente
   * su tangente de mirada ±60º alrededor de la normal del planeta,
   * oteando el patio desde su torre o muralla. Cero allocations.
   */
  private updateLookoutScan(enemy: EnemyObj, dt: number): void {
    enemy.lookoutPhase += dt;
    const swing = Math.sin(enemy.lookoutPhase * LOOKOUT_SWING_SPEED) * LOOKOUT_SWING;
    _v1.copy(enemy.baseForward);
    _q1.setFromAxisAngle(enemy.dir, swing);
    enemy.forward.copy(_v1.applyQuaternion(_q1)).normalize();
  }

  /** Rota `enemy.dir` sobre la esfera hacia `targetDir` a velocidad tangente. */
  private moveEnemyTowards(
    enemy: EnemyObj,
    targetDir: THREE.Vector3,
    speed: number,
    dt: number
  ): void {
    const dot = THREE.MathUtils.clamp(enemy.dir.dot(targetDir), -1, 1);
    const angle = Math.acos(dot);
    if (angle < 1e-5) return;
    const step = Math.min((speed / enemy.planet.spec.radius) * dt, angle);
    _v1.copy(enemy.dir).cross(targetDir);
    if (_v1.lengthSq() < 1e-10) {
      _v1.set(1, 0, 0).cross(enemy.dir);
      if (_v1.lengthSq() < 1e-10) _v1.set(0, 1, 0).cross(enemy.dir);
    }
    _v1.normalize();
    _q1.setFromAxisAngle(_v1, step);
    enemy.dir.applyQuaternion(_q1).normalize();
    // Avance tangente = componente tangencial de targetDir, con giro SUAVE
    // (HITO 1): sin snap instantáneo al cambiar de waypoint o perseguir.
    _v2.copy(targetDir).addScaledVector(enemy.dir, -THREE.MathUtils.clamp(targetDir.dot(enemy.dir), -1, 1));
    if (_v2.lengthSq() > 1e-10) this.turnEnemyForwardTowards(enemy, _v2.normalize(), dt);
  }

  /**
   * HITO 1 — Giro suave del forward hacia un tangente objetivo con velocidad
   * angular máxima (rad/s): el cono de visión barre de forma orgánica en vez
   * de teletransportarse al cambiar de rumbo. `turnVel` guarda la velocidad
   * aplicada (rad/s) para depurar/afinar el amortiguado.
   */
  private turnEnemyForwardTowards(enemy: EnemyObj, target: THREE.Vector3, dt: number): void {
    const dot = THREE.MathUtils.clamp(enemy.forward.dot(target), -1, 1);
    const angle = Math.acos(dot);
    if (angle < 1e-5) {
      enemy.turnVel = 0;
      return;
    }
    const maxRate =
      enemy.kind === 'drone' ? DRONE_MAX_TURN_RAD_PER_SEC : ENEMY_MAX_TURN_RAD_PER_SEC;
    const step = Math.min(maxRate * dt, angle);
    _v6.copy(enemy.forward).cross(target);
    if (_v6.lengthSq() < 1e-10) {
      // Antiparalelo: gira hacia cualquier lado del plano tangente.
      _v6.set(1, 0, 0).cross(enemy.forward);
      if (_v6.lengthSq() < 1e-10) _v6.set(0, 1, 0).cross(enemy.forward);
    }
    _v6.normalize();
    _q2.setFromAxisAngle(_v6, step);
    enemy.forward.applyQuaternion(_q2);
    // Reproyección al plano tangente (el eje de giro puede tener componente
    // radial) + renormalizado contra la deriva numérica.
    enemy.forward.addScaledVector(enemy.dir, -enemy.forward.dot(enemy.dir));
    if (enemy.forward.lengthSq() > 1e-10) enemy.forward.normalize();
    enemy.turnVel = step / Math.max(dt, 1e-4);
  }

  /**
   * HITO 1 — Steering tangente multi-rayo: elige la dirección de marcha
   * sobre la esfera esquivando muros ANTES de chocar con ellos (fin del
   * movimiento en "chunk cuadrado" contra las paredes).
   *
   * Sondea el tangente hacia el objetivo rotado por
   * [0, ±0.45, ±0.9, ±1.45]·steerBias rad (el lado del bias se prueba
   * primero), con lookahead 3.2 m y elevado +0.9 m sobre la superficie
   * para que la curvatura del planeta no dé falsos positivos. El primer
   * sondeo libre gana; `steerBias` persiste hacia el lado que quedó libre
   * para rodear esquinas con suavidad en vez de vibrar. Escribe en
   * `outDir` el punto de la esfera a STEER_LOOKAHEAD metros por el
   * tangente elegido. SIN allocations.
   */
  private steerDirectionOnSphere(
    enemy: EnemyObj,
    goalDir: THREE.Vector3,
    outDir: THREE.Vector3
  ): void {
    // Tangente del geodésico hacia el objetivo en la posición actual.
    _steerTangent.copy(goalDir).addScaledVector(enemy.dir, -goalDir.dot(enemy.dir));
    if (_steerTangent.lengthSq() < 1e-10) {
      outDir.copy(goalDir);
      return;
    }
    _steerTangent.normalize();
    // Punto de partida del sondeo: elevado sobre la superficie local.
    _steerStart.copy(enemy.pos).addScaledVector(enemy.dir, STEER_LIFT);
    const angularStep = STEER_LOOKAHEAD / enemy.planet.spec.radius;
    for (let i = 0; i < STEER_PROBE_ANGLES.length; i++) {
      const probeAngle = STEER_PROBE_ANGLES[i] * enemy.steerBias;
      if (probeAngle === 0) {
        _steerProbe.copy(_steerTangent);
      } else {
        _q1.setFromAxisAngle(enemy.dir, probeAngle);
        _steerProbe.copy(_steerTangent).applyQuaternion(_q1);
      }
      _steerEnd.copy(_steerStart).addScaledVector(_steerProbe, STEER_LOOKAHEAD);
      if (
        !isLineBlockedByStructures(
          _steerStart,
          _steerEnd,
          this.host.getStructureColliders(enemy.planet.spec.id),
          enemy.planet.spec.id
        ) &&
        !this.isSegmentBlockedByProps(
          _steerStart,
          _steerEnd,
          enemy.planet.spec.id,
          GUARD_STRUCTURE_RADIUS
        )
      ) {
        if (i > 0) enemy.steerBias = probeAngle > 0 ? 1 : -1;
        outDir.copy(enemy.dir).addScaledVector(_steerProbe, angularStep).normalize();
        return;
      }
    }
    // Todos los sondeos bloqueados: rumbo directo — el deslizamiento de
    // colisión de syncEnemyTransform lo lleva junto al muro sin atravesarlo.
    outDir.copy(enemy.dir).addScaledVector(_steerTangent, angularStep).normalize();
  }

  /** ¿El camino tangente hacia `targetDir` está libre de muros y props? */
  private enemyTangentClear(enemy: EnemyObj, targetDir: THREE.Vector3): boolean {
    _steerTangent.copy(targetDir).addScaledVector(enemy.dir, -targetDir.dot(enemy.dir));
    if (_steerTangent.lengthSq() < 1e-10) return true;
    _steerTangent.normalize();
    _steerStart.copy(enemy.pos).addScaledVector(enemy.dir, STEER_LIFT);
    _steerEnd.copy(_steerStart).addScaledVector(_steerTangent, STEER_LOOKAHEAD);
    return (
      !isLineBlockedByStructures(
        _steerStart,
        _steerEnd,
        this.host.getStructureColliders(enemy.planet.spec.id),
        enemy.planet.spec.id
      ) &&
      !this.isSegmentBlockedByProps(_steerStart, _steerEnd, enemy.planet.spec.id, GUARD_STRUCTURE_RADIUS)
    );
  }

  /**
   * HITO 2 — ¿Algún prop sólido del planeta bloquea el segmento a->b?
   * Distancia segmento-segmento (Ericson, Real-Time Collision Detection)
   * contra el eje del prop (base -> techo), con rechazo previo por esfera
   * envolvente en el punto medio del sondeo. SIN allocations.
   */
  private isSegmentBlockedByProps(
    a: THREE.Vector3,
    b: THREE.Vector3,
    planetId: string,
    radius: number
  ): boolean {
    _propMid.copy(a).add(b).multiplyScalar(0.5);
    const halfLen = a.distanceTo(b) * 0.5;
    const propColliders = this.host.getPropColliders(planetId);
    for (let i = 0; i < propColliders.length; i++) {
      const c = propColliders[i];
      if (c.softFoliage) continue;
      const bound = c.height + c.radius + radius + halfLen + 0.6;
      if (c.center.distanceToSquared(_propMid) > bound * bound) continue;

      // Segmento del sondeo (d1) contra el eje del prop (d2).
      _propD1.copy(b).sub(a);
      _propD2.copy(c.upDir).multiplyScalar(c.height);
      _propR.copy(a).sub(c.center);
      const aa = _propD1.dot(_propD1);
      const ee = _propD2.dot(_propD2);
      const ff = _propD2.dot(_propR);
      let s = 0;
      let t = 0;
      if (aa > 1e-10 && ee > 1e-10) {
        const cc = _propD1.dot(_propR);
        const bb = _propD1.dot(_propD2);
        const denom = aa * ee - bb * bb;
        s = denom > 1e-10 ? Math.min(1, Math.max(0, (bb * ff - cc * ee) / denom)) : 0;
        t = (bb * s + ff) / ee;
        if (t < 0) {
          t = 0;
          s = Math.min(1, Math.max(0, -cc / aa));
        } else if (t > 1) {
          t = 1;
          s = Math.min(1, Math.max(0, (bb - cc) / aa));
        }
      }
      _propQ.copy(c.center).addScaledVector(_propD2, t);
      _propR.copy(a).addScaledVector(_propD1, s).sub(_propQ);
      const hitR = c.radius + radius;
      if (_propR.lengthSq() < hitR * hitR) return true;
    }
    return false;
  }

  /**
   * HITO 1 — Separación tangente enemigo-enemigo: en patrulla y caza se
   * reparten en abanico en vez de apilarse sobre un mismo punto. Empuje
   * mayor cuanto más cerca (1 en contacto, 0 en el radio), proyectado al
   * plano tangente del enemigo y aplicado al objetivo antes del steering.
   */
  private applyEnemySeparation(enemy: EnemyObj, goalDir: THREE.Vector3): void {
    _sep.set(0, 0, 0);
    for (let i = 0; i < this.host.enemies.length; i++) {
      const other = this.host.enemies[i];
      if (other === enemy || other.state === GUARD_STATE_KO) continue;
      if (other.planet !== enemy.planet) continue;
      _v6.copy(enemy.pos).sub(other.pos);
      const distSq = _v6.lengthSq();
      if (distSq >= ENEMY_SEPARATION_RANGE * ENEMY_SEPARATION_RANGE || distSq < 1e-8) {
        continue;
      }
      const dist = Math.sqrt(distSq);
      _v6.multiplyScalar((1 - dist / ENEMY_SEPARATION_RANGE) / dist);
      _sep.add(_v6);
    }
    if (_sep.lengthSq() < 1e-10) return;
    _sep.addScaledVector(enemy.dir, -_sep.dot(enemy.dir));
    if (_sep.lengthSq() < 1e-10) return;
    _sep.normalize();
    goalDir.addScaledVector(_sep, ENEMY_SEPARATION_STRENGTH).normalize();
  }

  /**
   * Movimiento de caminante con steering multi-rayo + separación: copia el
   * objetivo a scratch dedicado, lo desplaza para no apilarse y esquiva los
   * muros por el lado libre persistente.
   */
  private steerAndMoveEnemy(
    enemy: EnemyObj,
    goalDir: THREE.Vector3,
    speed: number,
    dt: number
  ): void {
    _sepGoal.copy(goalDir);
    this.applyEnemySeparation(enemy, _sepGoal);
    this.steerDirectionOnSphere(enemy, _sepGoal, _steerGoal);
    this.moveEnemyTowards(enemy, _steerGoal, speed, dt);
  }

  /** HITO 1 — Modo WARNING: encara suavemente al jugador sin moverse. */
  private faceEnemyTowardsPlayer(enemy: EnemyObj, state: WorldPlayerState, dt: number): void {
    _v5.copy(state.pos).sub(enemy.pos);
    _v5.addScaledVector(enemy.dir, -_v5.dot(enemy.dir));
    if (_v5.lengthSq() < 1e-6) return;
    this.turnEnemyForwardTowards(enemy, _v5.normalize(), dt);
  }

  /** HITO 1 — Anillo de telegraph del windup: expande y pulsa en el suelo. */
  private updateWindupRing(enemy: EnemyObj): void {
    const ring = enemy.windupRing;
    const material = enemy.windupRingMaterial;
    if (!ring || !material) return;
    const windupTime = Math.max(enemy.params.windupTime, 0.001);
    const p = THREE.MathUtils.clamp(1 - Math.max(enemy.windupT, 0) / windupTime, 0, 1);
    const expand = 0.55 + 0.45 * p;
    ring.scale.setScalar(expand * (1 + Math.sin(this.host.clock * 20) * 0.05));
    material.opacity = 0.3 + 0.3 * p + Math.sin(this.host.clock * 22) * 0.08;
  }

  /** Transform sobre la esfera + hover de dron + tumbado si K.O. */
  private syncEnemyTransform(enemy: EnemyObj, dt: number): void {
    // HITO 4: posición del frame anterior para medir el movimiento REAL.
    enemy.prevPos.copy(enemy.pos);
    // Telegraph del ataque: pulso de escala claro durante el windup (respeta
    // la escala base del modelo: oni 1.3, cyberMech 1.2).
    if (enemy.state === GUARD_STATE_WINDUP) {
      enemy.mesh.scale.setScalar(
        enemy.baseScale * (1 + Math.sin(this.host.clock * 22) * 0.07)
      );
    } else {
      enemy.mesh.scale.setScalar(enemy.baseScale);
    }
    // HITO 1: el anillo de telegraph del suelo solo vive durante el windup.
    if (enemy.windupRing) {
      enemy.windupRing.visible = enemy.state === GUARD_STATE_WINDUP;
    }
    const flying = enemy.kind === 'drone';
    let altitude = enemy.altitudeOffset;
    // HITO 2: el suelo real incluye el terreno esférico (colinas/cráteres).
    let terrainH = getPlanetTerrainOffsetVec(enemy.planet.spec.id, enemy.dir);
    if (flying) {
      enemy.hoverPhase += dt * 3;
      // HITO 4: altitud de terreno suavizada ASIMÉTRICA — sube rápido para
      // despejar las colinas y baja lento al entrar en los valles.
      const riseK = Math.min(1, dt * 8);
      const fallK = Math.min(1, dt * 2.2);
      enemy.smoothTerrainY +=
        (terrainH - enemy.smoothTerrainY) *
        (terrainH > enemy.smoothTerrainY ? riseK : fallK);
      terrainH = enemy.smoothTerrainY;
      // HITO 4: flotación de doble armónico (onda compuesta más orgánica).
      altitude +=
        enemy.state === GUARD_STATE_KO
          ? 0.35
          : DRONE_HOVER_ALT +
            Math.sin(enemy.hoverPhase) * 0.28 +
            Math.cos(enemy.hoverPhase * 0.5) * 0.1;
    }
    enemy.pos
      .copy(enemy.planet.centerVec)
      .addScaledVector(enemy.dir, enemy.planet.spec.radius + terrainH + altitude);
    // Colisión contra estructuras: los caminantes no atraviesan muros.
    if (
      enemy.state !== GUARD_STATE_KO &&
      enemy.kind !== 'drone' &&
      enemy.kind !== 'turret'
    ) {
      const res = resolvePlayerStructures(
        enemy.pos,
        0,
        false,
        this.host.getStructureColliders(enemy.planet.spec.id),
        enemy.planet.spec.id,
        GUARD_STRUCTURE_RADIUS
      );
      if (res.hitWall) {
        enemy.dir.copy(enemy.pos).sub(enemy.planet.centerVec).normalize();
      }
    }
    // HITO 2: colisión contra props sólidos (árboles, estatuas, casas,
    // flores): los enemigos rodean la flora en vez de atravesarla.
    if (enemy.state !== GUARD_STATE_KO && enemy.kind !== 'turret') {
      const propRes = resolvePlayerProps(
        enemy.pos,
        0,
        terrainH + altitude,
        enemy.planet,
        this.host.getPropColliders(enemy.planet.spec.id),
        GUARD_STRUCTURE_RADIUS
      );
      if (propRes.hitProp) {
        enemy.dir.copy(enemy.pos).sub(enemy.planet.centerVec).normalize();
      }
    }
    enemy.mesh.position.copy(enemy.pos);
    // HITO 4: mide el movimiento REAL de superficie entre frames — al quedar
    // plantado (aviso/parado/atascado) las piernas se detienen limpio en
    // vez de caminar en la luna — y el giro para el alabeo del volador.
    const invDt = 1 / Math.max(dt, 1e-4);
    const measured = enemy.pos.distanceTo(enemy.prevPos) * invDt;
    const targetRatio = THREE.MathUtils.clamp(
      measured / Math.max(enemy.params.chaseSpeed, 1),
      0,
      1
    );
    enemy.smoothSpeedRatio +=
      (targetRatio - enemy.smoothSpeedRatio) * Math.min(1, dt * 9);
    enemy.walkPhase += dt * measured * 2.4;
    const fd = THREE.MathUtils.clamp(enemy.prevForward.dot(enemy.forward), -1, 1);
    _animDelta.copy(enemy.prevForward).cross(enemy.forward);
    const turn = Math.atan2(_animDelta.dot(enemy.dir), fd) * invDt;
    // Alabeo hacia DENTRO del giro (como una aeronave): giro a la izquierda
    // (turn > 0) hunde el lado izquierdo (rotation.z < 0 del hoverCore).
    enemy.hoverBank +=
      (THREE.MathUtils.clamp(-turn * 0.14, -0.55, 0.55) - enemy.hoverBank) *
      Math.min(1, dt * 5);
    enemy.prevForward.copy(enemy.forward);
    // HITO 4: halo de sombra pegado al terreno bajo el volador (se VE flotar).
    if (enemy.shadowHalo) {
      enemy.shadowHalo.visible = flying && enemy.state !== GUARD_STATE_KO;
      enemy.shadowHalo.position.y = -altitude;
    }
    _q1.setFromUnitVectors(_upAxis, enemy.dir);
    if (enemy.kind === 'turret') {
      enemy.mesh.quaternion.copy(_q1);
      if (enemy.state === GUARD_STATE_KO) {
        _q2.setFromAxisAngle(_v3.set(1, 0, 0), 0.9);
        enemy.mesh.quaternion.multiply(_q2);
      }
      return;
    }
    _v3.set(0, 0, 1).applyQuaternion(_q1);
    const cosYaw = _v3.dot(enemy.forward);
    _v4.copy(_v3).cross(enemy.forward);
    const yaw = Math.atan2(_v4.dot(enemy.dir), cosYaw);
    // El yaw se post-multiplica: rota alrededor del eje LOCAL (0,1,0), que
    // _q1 ya alinea con enemy.dir. Usar enemy.dir aquí tumbaba a los guardias
    // (rotaba en el marco mundial ya alineado, no en el local).
    _q2.setFromAxisAngle(_upAxis, yaw);
    enemy.mesh.quaternion.copy(_q1).multiply(_q2);
    if (enemy.state === GUARD_STATE_KO) {
      _q2.setFromAxisAngle(_v3.set(0, 0, 1), 1.45);
      enemy.mesh.quaternion.multiply(_q2);
    }
    // HITO 4: animador procedural articulado (parámetros preasignados, cero
    // allocations): galope/bipedos/voladores + follow-through del golpe.
    if (enemy.strikeAnimT > 0) {
      enemy.strikeAnimT = Math.max(0, enemy.strikeAnimT - dt);
    }
    const anim = this.enemyAnim;
    anim.rig = enemy.rig;
    anim.kind = enemy.kind;
    anim.skin = enemy.skin;
    anim.state = enemy.state;
    anim.stationaryLookout = enemy.stationaryLookout;
    anim.walkPhase = enemy.walkPhase;
    anim.hoverPhase = enemy.hoverPhase;
    anim.windupProgress =
      enemy.state === GUARD_STATE_WINDUP
        ? THREE.MathUtils.clamp(
            1 - Math.max(enemy.windupT, 0) / Math.max(enemy.params.windupTime, 0.001),
            0,
            1
          )
        : 0;
    anim.strikeDecay =
      enemy.strikeAnimT > 0 ? enemy.strikeAnimT / ENEMY_STRIKE_ANIM_TIME : 0;
    anim.speedRatio = enemy.smoothSpeedRatio;
    anim.turnRate = enemy.hoverBank;
    anim.clock = this.host.clock;
    anim.dt = dt;
    anim.enemyMesh = enemy.mesh;
    animateEnemyRig(anim);
    this.updateVisionCone(enemy);
  }

  /**
   * Color/opacidad del cono de visión en tiempo real: verde en patrulla,
   * ÁMBAR (0xf59e0b) en modo WARNING (Hito 1), amarillo al investigar un
   * ruido y rojo en combate/alarma. Además alterna los iconos 3D de estado:
   * '?' amarillo al avisar/investigar y '!' rojo en combate.
   */
  private updateVisionCone(enemy: EnemyObj): void {
    const cone = enemy.visionCone;
    const material = enemy.visionConeMaterial;
    const ko = enemy.state === GUARD_STATE_KO;
    const combat =
      enemy.state === GUARD_STATE_CHASE || enemy.state === GUARD_STATE_WINDUP;
    const warning = enemy.state === GUARD_STATE_WARNING;
    const investigating =
      !combat && !warning && (enemy.state === GUARD_STATE_SEARCH || enemy.suspicion > 0.4);
    if (enemy.iconQuestion) enemy.iconQuestion.visible = !ko && (investigating || warning);
    if (enemy.iconAlert) enemy.iconAlert.visible = !ko && combat;
    if (!cone || !material) return;
    cone.visible = !ko;
    if (ko) return;
    let color = CONE_COLOR_PATROL;
    if (combat) {
      color = CONE_COLOR_COMBAT;
    } else if (warning) {
      color = CONE_COLOR_WARNING;
    } else if (investigating) {
      color = CONE_COLOR_SEARCH;
    }
    material.color.set(color);
    material.opacity = combat ? 0.42 : warning ? 0.34 : 0.26;
  }

  /**
   * Noquea/derriba a un enemigo según la fuente del golpe. Devuelve true solo
   * si el enemigo quedó K.O.:
   * - Brute: resiste todo salvo explosivos, parry y estasis.
   * - Casco blindado: resiste el primer golpe melee/estasis/noqueo/dash.
   */
  koEnemy(enemy: EnemyObj, source: HitSource): boolean {
    if (enemy.state === GUARD_STATE_KO) return false;
    if (enemy.kind === 'brute') {
      if (source === 'explosive' || source === 'parry' || source === 'stasis') {
        this.killEnemy(enemy);
        return true;
      }
      return false;
    }
    if (
      enemy.helmet &&
      (source === 'melee' || source === 'stasis' || source === 'knockout' || source === 'dash')
    ) {
      // El casco blindado absorbe el primer golpe... pero el enemigo YA
      // recibió daño: excepción justa de escalada instantánea (Hito 1).
      enemy.helmet = false;
      enemy.suspicion = 1;
      return false;
    }
    this.killEnemy(enemy);
    return true;
  }

  private killEnemy(enemy: EnemyObj): void {
    enemy.state = GUARD_STATE_KO;
    enemy.koTimer = 0;
    enemy.koRadioSent = false;
    this.host.guardsKnockedOut++;
    // FASE B: el vigía/portador caído entrega la llave/tarjeta del sector.
    if (enemy.dropsKeycard) {
      this.host.keycardsCollected++;
      this.host.spawnExplosion(enemy.pos, 2.2, 0xfde047);
      this.host.onSound?.('keycard');
    }
  }

  destroyTurret(enemy: EnemyObj): void {
    if (enemy.state === GUARD_STATE_KO) return;
    enemy.state = GUARD_STATE_KO;
    this.host.spawnExplosion(enemy.pos, 3.5, 0xf97316);
  }
}
