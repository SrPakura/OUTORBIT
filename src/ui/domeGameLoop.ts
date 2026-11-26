// ============================================================================
// DOME GAME LOOP — runtime del modo Cúpula
// ============================================================================
// Encapsula el bucle de juego del modo Cúpula (renderer, escena, oleadas,
// entrenamiento, input y sincronización del HUD) que antes vivía como un
// useEffect de ~730 líneas dentro de DomeGameView. El cuerpo se mueve
// verbatim: DomeGameView conserva solo el estado de React y la UI, y este
// módulo recibe refs y setters por parámetro. Devuelve la función de
// disposición (cleanup) que el useEffect de React devuelve tal cual.
// ============================================================================

import * as THREE from 'three';
import { createDomeArenaBackdrop } from '@/game/render/domeArenaScene';
import { loadNyxRigged, type LoadedNyx } from '@/game/render/nyxModelLoader';
import { DomeFloatingSlabManager } from '@/game/dome/DomeFloatingSlabs';
import { DomeSphereTileManager } from '@/game/dome/DomeSphereTiles';
import { DomeWaveManager, type ManagedWaveEnemy, type WaveFloorMode } from '@/game/dome/DomeWaveManager';
import { MotionVfxSystem } from '@/game/dome/MotionVfx';
import { ComicImpactVfxSystem } from '@/game/dome/ComicImpactVfx';
import { NyxDomeController } from '@/game/dome/NyxDomeController';
import { GamepadInput, readConnectedGamepad } from '@/game/input/GamepadInput';
import {
  ACTIVE_SKILLS_CATALOG,
  DomeProgressionManager,
  type ActiveSkillId,
  type LevelUpCardOption,
  type PassiveId,
} from '@/game/dome/DomeProgression';
import { DomePickupManager } from '@/game/dome/DomePickups';
import { DomeSkillExecutor, type SkillTargetEnemy } from '@/game/dome/DomeSkills';
import { DomeCombatSystem, INK_COUNTER_OPACITY, THORNS_DAMAGE_TO_NYX, type EnemyArchetype } from '@/game/dome/DomeCombatSystem';
import { DomeRunTracker } from '@/game/dome/DomeRunStats';
import { DOME_PLAYER_BOUND_RADIUS, type DomeHudState, type SlabCollider, type TestEnemySphere } from '@/game/dome/domeTypes';
import type { GameSettings } from '@/game/settings';
import { SynthAudio } from '@/game/audio/SynthAudio';
import { musicPlayer } from '@/game/audio/MusicPlayer';
import type { DomeBattleReportData } from '@/ui/DomeBattleReport';

/**
 * Puente del panel de entrenamiento hacia el loop: el panel debug muta el
 * juego en vivo a través de estos métodos (se rellena al arrancar el loop).
 */
export interface DomeTrainingBridge {
  setEnemyArchetype: (archetype: EnemyArchetype) => void;
  respawnEnemy: () => void;
  setEnemyPassive: (passive: boolean) => void;
  equipSkill: (slot: 0 | 1 | 2, skillId: ActiveSkillId) => void;
  clearSlot: (slot: 0 | 1 | 2) => void;
  upgradeSlot: (slot: 0 | 1 | 2) => void;
  setPassiveLevel: (id: PassiveId, level: number) => void;
  refillResources: () => void;
}

/** Estado de React del modal de subida de nivel (elección de carta). */
export interface DomeLevelUpUiState {
  isOpen: boolean;
  newLevel: number;
  /** Niveles pendientes tras el actual cuando se sube varios niveles a la vez. */
  pendingLevels: number[];
  choices: LevelUpCardOption[] | null;
  requiresSlotReplacement: boolean;
  /** true en la elección inicial de la partida: sin animación de planeta. */
  skipPlanetAnimation?: boolean;
  /**
   * Identificador de apertura: se incrementa en cada apertura del modal.
   * DomeGameView lo usa en el `key` de la secuencia para REMONTAR el
   * componente en cada apertura: sin él, la elección inicial (newLevel 1,
   * igual al estado por defecto) reutiliza el montaje previo con la fase
   * `planet` ya inicializada y el planeta anima aunque llegue el flag.
   */
  openId: number;
}

/** Dependencias que DomeGameView inyecta al runtime del loop. */
export interface DomeGameLoopParams {
  canvas: HTMLCanvasElement;
  settingsRef: { current: GameSettings };
  training: boolean;
  trainingUiRef: { current: { archetype: EnemyArchetype; passive: boolean } };
  trainingBridgeRef: { current: DomeTrainingBridge | null };
  controllerRef: { current: NyxDomeController | null };
  audioRef: { current: SynthAudio | null };
  progressionRef: { current: DomeProgressionManager | null };
  runTrackerRef: { current: DomeRunTracker | null };
  setHud: (hud: DomeHudState) => void;
  setLevelUpState: (state: DomeLevelUpUiState) => void;
  setBattleReport: (report: DomeBattleReportData | null) => void;
  setIsPauseOpen: (open: boolean) => void;
  setDebugPanelOpen: (open: boolean) => void;
  levelUpOpenRef: { current: boolean };
  battleReportOpenRef: { current: boolean };
  pauseOpenRef: { current: boolean };
  settingsOpenRef: { current: boolean };
  debugPanelOpenRef: { current: boolean };
  tutorialOpenRef: { current: boolean };
  hadPointerLockRef: { current: boolean };
}

/**
 * Arranca el runtime del modo Cúpula sobre el canvas dado: crea renderer,
 * escena, managers y listeners, lanza el requestAnimationFrame y devuelve
 * la función de disposición que limpia todo (la que el useEffect devuelve).
 */
export function startDomeGameLoop(params: DomeGameLoopParams): () => void {
  const {
    canvas,
    settingsRef,
    training,
    trainingUiRef,
    trainingBridgeRef,
    controllerRef,
    audioRef,
    progressionRef,
    runTrackerRef,
    setHud,
    setLevelUpState,
    setBattleReport,
    setIsPauseOpen,
    setDebugPanelOpen,
    levelUpOpenRef,
    battleReportOpenRef,
    pauseOpenRef,
    settingsOpenRef,
    debugPanelOpenRef,
    tutorialOpenRef,
    hadPointerLockRef,
  } = params;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    settingsRef.current.baseFov,
    window.innerWidth / window.innerHeight,
    0.1,
    2500,
  );

  const sun = new THREE.DirectionalLight(0xdbeafe, 1.5);
  sun.position.set(60, 120, 40);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x818cf8, 0.65));

  const backdrop = createDomeArenaBackdrop(scene);
  const floatingSlabs = new DomeFloatingSlabManager(scene);
  const sphereTiles = new DomeSphereTileManager(scene);
  const waveMgr = new DomeWaveManager(scene);
  // (V_base de KRONOS se fija al crear el controller con getBaseMaxSpeed();
  // el manager ya usa FLOAT_MAX_SPEED = 28 m/s como valor por defecto.)
  const pickups = new DomePickupManager(scene);
  const skillExecutor = new DomeSkillExecutor(scene);
  // Bolas de tinta capturadas gastadas (impacto/expiración/cancelación):
  // vuelven al pool de proyectiles del waveMgr (sin fugas de capacidad).
  skillExecutor.onCapturedInkBallFreed = (mesh) => waveMgr.recycleInkBallMesh(mesh);
  const progression = new DomeProgressionManager();
  progressionRef.current = progression;
  const combat = new DomeCombatSystem(progression.maxHp);
  const runTracker = new DomeRunTracker();
  runTrackerRef.current = runTracker;
  const vfx = new MotionVfxSystem(scene);
  // VFX cómic de materia oscura: picos entintados, estrellas de impacto y
  // humo rosa cel-shaded que responden a la velocidad del golpe y la skill.
  const comicVfx = new ComicImpactVfxSystem(scene);
  // Dirección de impulso reutilizada por los VFX de daño de habilidad.
  const skillImpulseDir = new THREE.Vector3();
  let lastSkillComicTime = -1;
  // Llamarada de absorción: recoger EXP/Edén en pleno vuelo se siente jugoso.
  pickups.onCollect = (kind, position) => {
    vfx.spawnAbsorbFlare(position, kind);
  };
  // Muerte de enemigo: la malla vibra y estalla; aquí van chispas y anillos.
  waveMgr.onEnemyExplode = (position, radius, color) => {
    vfx.spawnEnemyExplosion(position, radius, color);
    comicVfx.spawnComicExplosion(position, radius);
  };
  // Muerte por daño interno de la IA (fuego amigo del láser del cangrejo o
  // detonación kamikaze): suelta la EXP restante (25 % en la autoinmolación)
  // y contabiliza la kill igual que una patada de Nyx.
  waveMgr.onInternalKill = (enemy) => {
    pickups.spawnFromEnemy(enemy.position, enemy.entity.expValue, 6);
    runTracker.recordKill({
      isElite: enemy.entity.isElite,
      isBoss: enemy.entity.isBoss,
    });
    controller?.punchCamera(0.75);
  };
  waveMgr.onDestroySkillProjectiles = (center, radius) => {
    const removed = skillExecutor.destroyProjectilesInSphere(center, radius);
    if (removed > 0) {
      comicVfx.spawnComicHit(center, null, 0.85, radius * 0.45);
    }
  };
  const audio = new SynthAudio();
  audio.setVolumeMultiplier(settingsRef.current.masterVolume);
  audioRef.current = audio;
  musicPlayer.setVolumeMultiplier(settingsRef.current.masterVolume);

  // Música: la oleada de jefe usa su pista; las básicas y de miniboss rotan
  // entre las dos restantes para que la repetición no se note.
  let waveTrackToggle = 0;
  const syncWaveMusic = (label: string | undefined) => {
    if (label === 'BOSS') {
      musicPlayer.play('boss');
      return;
    }
    musicPlayer.play(waveTrackToggle % 2 === 0 ? 'waveA' : 'waveB');
    waveTrackToggle += 1;
  };
  // Lector de mando (Gamepad API): se actualiza cada frame en el loop, sin
  // depender del pointer lock, para poder jugar con mando y ratón libre.
  const gamepad = new GamepadInput(settingsRef.current);

  const applyFloorMode = (mode: WaveFloorMode) => {
    if (mode === 'basic') {
      // Suelos básicos reducidos un 30%: antes 5..10, ahora 4..7.
      floatingSlabs.setTargetCount(4 + Math.floor(Math.random() * 4));
      sphereTiles.setMode('none');
    } else if (mode === 'miniboss') {
      floatingSlabs.setTargetCount(0);
      sphereTiles.setMode('miniboss');
    } else {
      floatingSlabs.setTargetCount(0);
      sphereTiles.setMode('boss');
    }
  };

  // Arrays persistentes del bucle caliente: se rellenan in-place cada frame
  // (cero allocations; antes eran spreads y filters nuevos por frame).
  const activeSlabs: SlabCollider[] = [];
  const refillActiveSlabs = () => {
    activeSlabs.length = 0;
    for (const slab of floatingSlabs.getActiveColliders()) activeSlabs.push(slab);
    for (const slab of sphereTiles.getActiveColliders()) activeSlabs.push(slab);
  };
  const activeEnemies: ManagedWaveEnemy[] = [];
  if (training) {
    // Modo Entrenamiento: sin oleadas automáticas ni elección inicial de
    // cartas; suelos básicos para el Cangrejo Artillero y los escombros del
    // Campo Gravitacional. El enemigo único lo spawnea el puente de abajo.
    progression.pendingInitialPick = false;
    applyFloorMode('basic');
    musicPlayer.play('waveA');
  } else {
    waveMgr.startWave(1, activeSlabs);
    runTracker.recordWave(1);
    applyFloorMode(waveMgr.getWaveInfo().floorMode);
    syncWaveMusic(waveMgr.getWaveInfo().label);
  }
  let nextWaveDelay = 0;

  // Cada apertura del modal tiene su propio id: fuerza el remount de la
  // secuencia (fase y refs internas limpias) incluso para el mismo nivel.
  let levelUpOpenCount = 0;
  // Ventana de gracia tras cerrar la pausa con teclado: si un keydown de ESC
  // llegara duplicado (teclado/VM/escritorio remoto) o el navegador
  // retrasara un unlock, no puede reabrir la pausa al instante.
  let pauseResumeGraceUntil = 0;

  const openLevelUpModal = (levels: number[], skipPlanetAnimation = false) => {
    if (levels.length === 0) return;
    if (document.pointerLockElement === canvas) {
      document.exitPointerLock?.();
    }
    // Marca síncrona: el `pointerlockchange` del exitPointerLock llega antes
    // del re-render de React; sin esto, onPointerLockChange vería el ref a
    // false y abriría la pausa DEBAJO del modal de subida de nivel.
    levelUpOpenRef.current = true;
    const [firstLevel, ...restLevels] = levels;
    const choices = progression.generateLevelUpChoices(firstLevel);
    const allSlotsFull = progression.slots.every((s) => s.skillId !== null);
    setLevelUpState({
      isOpen: true,
      newLevel: firstLevel,
      pendingLevels: restLevels,
      choices,
      requiresSlotReplacement: allSlotsFull,
      skipPlanetAnimation,
      openId: ++levelUpOpenCount,
    });
  };

  // Nivel 1: abre elección inicial en el segundo 1 (Carta 1 fija Campo Gravitacional)
  if (progression.pendingInitialPick) {
    openLevelUpModal([1], true);
  }

  let loadedNyx: LoadedNyx | null = null;
  let controller: NyxDomeController | null = null;
  let disposed = false;

  // --- Modo Entrenamiento: enemigo único delante de Nyx + puente del panel ---
  const trainingState: { archetype: EnemyArchetype; passive: boolean } = {
    archetype: trainingUiRef.current.archetype,
    passive: trainingUiRef.current.passive,
  };
  const trainingSpawnPos = new THREE.Vector3();
  const getTrainingSpawnPos = (): THREE.Vector3 => {
    if (controller) {
      trainingSpawnPos
        .copy(controller.getPosition())
        .addScaledVector(controller.getAimForward(), 18);
      trainingSpawnPos.y = THREE.MathUtils.clamp(trainingSpawnPos.y, 2, 30);
    } else {
      trainingSpawnPos.set(0, 5, -18);
    }
    return trainingSpawnPos;
  };
  const spawnTrainingEnemy = () => {
    waveMgr.spawnSingleEnemy(trainingState.archetype, getTrainingSpawnPos());
  };
  // Daño a Nyx con la regla de inmortalidad del entrenamiento: si un golpe
  // la deja por debajo de 1 HP, se regenera al instante para poder seguir
  // probando golpes enemigos y trampas sin morir.
  const applyDamageToNyx = (amount: number) => {
    if (!controller || amount <= 0) return;
    controller.applyDamage(amount);
    if (training && controller.getHp() < 1) {
      controller.restoreResources(progression.maxHp, 0);
    }
  };
  if (training) {
    waveMgr.setEnemiesPassive(trainingState.passive);
    trainingBridgeRef.current = {
      setEnemyArchetype: (archetype) => {
        trainingState.archetype = archetype;
        spawnTrainingEnemy();
      },
      respawnEnemy: () => spawnTrainingEnemy(),
      setEnemyPassive: (passive) => {
        trainingState.passive = passive;
        waveMgr.setEnemiesPassive(passive);
      },
      equipSkill: (slot, skillId) => {
        const def = ACTIVE_SKILLS_CATALOG[skillId];
        progression.slots[slot] = {
          skillId,
          level: 1,
          cooldownRemaining: 0,
          maxCooldown: def.cooldown,
        };
      },
      clearSlot: (slot) => {
        progression.slots[slot] = {
          skillId: null,
          level: 0,
          cooldownRemaining: 0,
          maxCooldown: 0,
        };
      },
      upgradeSlot: (slot) => {
        const slotState = progression.slots[slot];
        if (!slotState.skillId) return;
        slotState.level = Math.min(
          ACTIVE_SKILLS_CATALOG[slotState.skillId].maxLevel,
          slotState.level + 1,
        );
      },
      setPassiveLevel: (id, level) => {
        // Via pública: marca modifiersDirty para que getModifiers() refleje
        // el cambio (escribir progression.passives a mano no invalida el cache).
        progression.setPassiveLevel(id, level);
      },
      refillResources: () => {
        controller?.restoreResources(progression.maxHp, progression.maxEden);
      },
    };
    spawnTrainingEnemy();
  }

  const killWaveEnemy = (enemy: ManagedWaveEnemy, viaBarrier: boolean) => {
    // El combate (impacto cinético, barrera) ya puso `entity.alive = false`
    // antes de llegar aquí: la idempotencia la marca killEnemy (true sólo la
    // primera vez), no el flag de vida.
    if (!waveMgr.killEnemy(enemy)) return;
    pickups.spawnFromEnemy(enemy.position, enemy.entity.expValue, 6);
    runTracker.recordKill({
      isElite: enemy.entity.isElite,
      isBoss: enemy.entity.isBoss,
    });
    if (viaBarrier) runTracker.recordBarrierKill();
  };

  const handleSkillDamageEnemy = (
    target: SkillTargetEnemy,
    amount: number,
    impulse: THREE.Vector3,
    bypassFlesh = false,
  ) => {
    const enemy = waveMgr.getActiveEnemies().find((e) => e.id === target.id);
    if (!enemy || !enemy.entity.alive) return;

    // VFX cómic del golpe de habilidad: intensidad según el impulso y el
    // daño, con throttle para que las skills de daño continuo (agujero
    // negro, pozo) no spameen picos en cada tick.
    if (elapsed - lastSkillComicTime >= 0.12) {
      lastSkillComicTime = elapsed;
      const impulseLen = impulse.length();
      comicVfx.spawnComicHit(
        enemy.position,
        impulseLen > 0.01
          ? skillImpulseDir.copy(impulse).multiplyScalar(1 / impulseLen)
          : null,
        Math.min(1.3, 0.45 + impulseLen / 22 + amount * 0.004),
        enemy.radius,
      );
      // Juice de cámara: tambaleo + zoom puntual escalado con el impulso y
      // el daño de la skill (el agujero negro pega más fuerte que un tick
      // de pozo), con el mismo throttle que los picos.
      controller?.punchCamera(Math.min(1.3, 0.35 + impulseLen / 26 + amount * 0.003));
    }

    // Leviatán KRONOS: las habilidades gravitatorias (Campo Gravitacional,
    // agujero negro, Implosión legendaria...) rompen UNA Estrella Dorsal a
    // lo sumo por uso — con la invulnerabilidad de transición del manager
    // limitando a las skills de daño continuo. Sin daño genérico de HP.
    if (enemy.entity.archetype === 'kronos_leviathan') {
      waveMgr.tryBreakKronosStarFromSkill(enemy);
      runTracker.recordDamage(amount);
      return;
    }
    // Prisma Necroz: 1 roca pequeña (o skill a distancia) destruye 1 triángulo
    // del escudo cristalino, abriendo un hueco físico real. Si esa cara ya
    // tiene hueco, la habilidad/roca impacta a Necroz directamente.
    if (enemy.entity.archetype === 'prisma_necroz') {
      const hitFrom =
        impulse.lengthSq() > 0.01
          ? skillImpulseDir.copy(enemy.position).sub(impulse)
          : (controller?.getPosition() ?? enemy.position);
      if (waveMgr.tryBreakNecrozShieldTriangle(enemy, hitFrom)) {
        return;
      }
    }
    enemy.entity.position.copy(enemy.position);
    const res = combat.computeKineticImpact(
      enemy.entity,
      Math.max(12, amount * 0.4),
      progression.getModifiers().forceMultiplier,
      false,
      bypassFlesh,
    );
    if (enemy.entity.archetype !== 'prisma_necroz') {
      enemy.velocity.add(impulse);
    } else {
      waveMgr.notifyNecrozHit(enemy);
    }
    if (enemy.entity.archetype === 'giant_sparrow') {
      waveMgr.notifySparrowSkillHit(enemy);
    }
    enemy.hitFlash = 1;
    runTracker.recordDamage(Math.max(amount, res.damage));
    if (enemy.entity.hp <= 0 || res.killed) {
      killWaveEnemy(enemy, false);
    }
  };

  // --- Callbacks estables del waveMgr: cero closures nuevas por frame ---
  const onWavePlayerHit = (dmg: number) => applyDamageToNyx(dmg);
  // Tinta Ácida del Pulpo Espiral: mancha en pantalla con opacidad/duración
  // dadas (bola base 3 s/55 %, contra-parry a bocajarro 5-10 s/65 %) y DoT.
  const onOctopusInk = (durationSec: number, opacity: number) =>
    combat.applyOctopusInkAttack(durationSec, opacity);
  // Manotazo brutal del Gólem: daño + empuje con hit_stagger.
  // (Los Anillos de Contención de KRONOS lo reutilizan con daño 0 y
  // un empuje radial más fuerte hacia la Barrera Blanca.)
  const onGolemSmash = (dmg: number, pushDir: THREE.Vector3, pushSpeed?: number) => {
    applyDamageToNyx(dmg);
    controller?.applySmashKnockback(pushDir, pushSpeed ?? 22);
  };
  // El manotazo rompe un suelo flotante: se destroza y suelta
  // escombros agarrables por el Campo Gravitacional.
  const onSlabSmash = (slab: SlabCollider) => {
    const shattered = floatingSlabs.shatterSlab(slab.id);
    if (shattered) {
      skillExecutor.spawnSlabDebris(shattered.center, 4);
    }
  };
  // Impacto de Nyx contra un enemigo (patada/taladro): aplica el daño
  // cinético del DomeCombatSystem. Event-driven, no cada frame.
  const onControllerHitEnemy = (
    enemy: TestEnemySphere,
    hitDir: THREE.Vector3,
    isDrill: boolean,
    impactSpeed?: number,
  ) => {
    // Contra-Parry del Pulpo Espiral (ventana de alerta, dashTimer <= 1.0 s):
    // el pulpo ANULA el impacto (0 daño, 0 knockback), escupe un chorro de
    // tinta ácida a bocajarro (65 % de opacidad, 5-10 s aleatorios) y escapa
    // con su dash reiniciando el ciclo. La patada de Nyx NO se corta ni
    // rebota: sigue su trayectoria pasando de largo (octopusCounterParry).
    const counterInkSec = waveMgr.tryOctopusCounterParry(enemy);
    if (counterInkSec > 0) {
      controller?.octopusCounterParry();
      onOctopusInk(counterInkSec, INK_COUNTER_OPACITY);
      comicVfx.spawnComicHit(enemy.position, hitDir, 1.1, enemy.radius);
      controller?.punchCamera(0.55);
      return;
    }
    const hitRes = waveMgr.onHitEnemy(enemy, hitDir, isDrill, impactSpeed);
    // VFX cómic del impacto cinético: la intensidad escala con la velocidad
    // real del golpe (el taladro pega más fuerte) y los picos salen sesgados
    // hacia la dirección del hit.
    comicVfx.spawnComicHit(
      enemy.position,
      hitDir,
      Math.min(1.3, Math.max(0.4, (impactSpeed ?? 14) / 26)) * (isDrill ? 1.2 : 1),
      enemy.radius,
    );
    const managed = waveMgr.getActiveEnemies().find((e) => e.id === enemy.id);
    if (managed) {
      // Remate de parry del Gólem (Fase 2): hace exactamente el 35% de la
      // vida máxima sin sumar computeKineticImpact en este mismo impacto
      // (`vulnerableTimer` queda abierto solo para los golpes posteriores).
      if (hitRes.parryCritDamage > 0) {
        runTracker.recordDamage(hitRes.parryCritDamage);
        if (managed.entity.hp <= 0 || !managed.entity.alive) {
          killWaveEnemy(managed, false);
        }
        return;
      }
      if (!managed.entity.alive) return;
      // Leviatán KRONOS: su vida son 4 Estrellas Dorsales, no HP genérico.
      // Un impacto de alta velocidad (Patada Taladro o velocidad > umbral
      // cinético) rompe UNA estrella con las puertas anti-skip del manager
      // (nunca más de 1 por uso: el daño cinético clásico no se aplica).
      if (managed.entity.archetype === 'kronos_leviathan') {
        waveMgr.tryBreakKronosStar(
          managed,
          impactSpeed ?? 14,
          isDrill,
        );
        return;
      }
      // Prisma Necroz: escudo triangulado — bloquea si el triángulo en esa
      // dirección está intacto (0 daño + rebote); si hay hueco, entra limpio.
      if (managed.entity.archetype === 'prisma_necroz') {
        const playerPos = controller?.getPosition() ?? enemy.position;
        if (waveMgr.checkNecrozShieldBlock(managed, playerPos) === 'blocked') {
          controller?.punchCamera(0.25);
          skillImpulseDir.subVectors(playerPos, enemy.position);
          if (skillImpulseDir.lengthSq() < 1e-4) skillImpulseDir.set(0, 0.3, 1);
          else skillImpulseDir.normalize();
          controller?.applySmashKnockback(skillImpulseDir, 26);
          return;
        }
      }
      // Gólem Rompesuelos: la pared maciza del bloqueo absorbe los impactos
      // frontales (0 daño) y DEVUELVE la patada con la MISMA mecánica y
      // animación que el rebote de pared (Sentadilla Cinética, ver
      // NyxDomeController.bounceOffGolemGuard) — como estrellarse contra
      // 300 kg de brazo (obliga a flanquear, provocar o rematar desde arriba).
      if (waveMgr.isGolemGuardBlocking(enemy)) {
        controller?.punchCamera(0.3);
        controller?.bounceOffGolemGuard(enemy.position, enemy.radius);
        return;
      }
      const res = combat.computeKineticImpact(
        managed.entity,
        impactSpeed ?? 14,
        progression.getModifiers().forceMultiplier,
        isDrill,
      );
      // Pinchos del Prisma Necroz: el golpe queda mitigado y Nyx recibe
      // daño de represalia (la repulsión la da el recoilBounce).
      if (res.reason === 'thorns_repel') {
        applyDamageToNyx(THORNS_DAMAGE_TO_NYX);
      }
      runTracker.recordDamage(res.damage);
      if (managed.entity.hp <= 0 || res.killed) {
        killWaveEnemy(managed, false);
      } else if (managed.entity.archetype === 'prisma_necroz') {
        // Tras colar un golpe por el hueco del escudo: rebote muy largo hacia
        // fuera y giro rápido de Necroz para evitar spam en el mismo hueco.
        waveMgr.notifyNecrozHit(managed);
        const playerPos = controller?.getPosition() ?? enemy.position;
        skillImpulseDir.subVectors(playerPos, enemy.position);
        if (skillImpulseDir.lengthSq() < 1e-4) {
          skillImpulseDir.set(0, 0.3, 1);
        } else {
          skillImpulseDir.normalize();
          skillImpulseDir.y += 0.25;
          skillImpulseDir.normalize();
        }
        controller?.applySmashKnockback(skillImpulseDir, 34);
      }
    }
  };

  // --- Cinemática de Implosión (pausa el mundo y hace zoom dinámico al objetivo) ---
  type ImplosionMode = 'one_hit' | 'miniboss_repel' | 'kronos_crystal';
  interface ImplosionCinematicState {
    mode: ImplosionMode;
    enemy: ManagedWaveEnemy;
    elapsed: number;
    duration: number;
    resolved: boolean;
    savedCamPos: THREE.Vector3;
    savedCamQuat: THREE.Quaternion;
    savedFov: number;
    savedEnemyScale: THREE.Vector3;
    savedEnemyPos: THREE.Vector3;
    orbitBaseAngle: number;
    startDist: number;
    startHeight: number;
  }
  let implosionCinematic: ImplosionCinematicState | null = null;
  let kronosImplosionUsedOnId: string | null = null;

  // --- Payload persistente de syncProgression (cero objetos por frame) ---
  const syncPayload: Parameters<NyxDomeController['syncProgression']>[0] = {
    level: 1,
    exp: 0,
    expToNext: 1,
    maxHp: 100,
    maxEden: 100,
    speedMultiplier: 1,
    edenRegenFrac: 0,
    hpRegenFrac: 0,
    inkOverlayIntensity: 0,
    waveNumber: undefined,
    waveLabel: undefined,
    slots: [
      { skillId: null, name: null, level: 0, cooldownRemaining: 0, maxCooldown: 0, isActive: false },
      { skillId: null, name: null, level: 0, cooldownRemaining: 0, maxCooldown: 0, isActive: false },
      { skillId: null, name: null, level: 0, cooldownRemaining: 0, maxCooldown: 0, isActive: false },
    ],
  };

  loadNyxRigged()
    .then((nyx) => {
      if (disposed) {
        nyx.dispose();
        return;
      }
      loadedNyx = nyx;
      // Posicionada justo sobre la plataforma central para aterrizar o flotar desde el inicio
      nyx.root.position.set(0, -1.8, 0);
      scene.add(nyx.root);
      controller = new NyxDomeController(
        nyx.root,
        nyx.animator,
        nyx.clips.walk,
        nyx.clips,
        vfx,
        settingsRef.current,
        audio,
        gamepad,
      );
      controller.setViewportSize(window.innerWidth, window.innerHeight);
      // KRONOS lee la física del mundo: V_base = velocidad máxima de Nyx
      // SIN pasivas (getBaseMaxSpeed() = FLOAT_MAX_SPEED = 28 m/s). Las
      // fases del boss se escalan sobre ese valor exacto.
      waveMgr.setKronosBaseMaxSpeed(controller.getBaseMaxSpeed());
      // Gravity Shift: el material de nebulosa de Nyx se enciende en vuelo.
      controller.attachNyxMaterial(nyx.universeMat);
      controller.onDomeBounceDamage = () => {
        combat.applyDomeBarrierDamageToNyx();
      };
      controller.onRedirectionSuccess = () => {
        runTracker.recordRedirection();
      };
      controller.onLeftClickAttackOverride = () => {
        if (!controller || !skillExecutor.hasActiveGravityRocks()) return false;
        const target = controller.getLockedEnemy() ?? controller.getCandidateEnemy();
        const fired = skillExecutor.fireOneGravityRock(
          controller.getPosition(),
          controller.getAimForward(),
          target,
        );
        if (fired) {
          controller.triggerSkillAnim('stasis_throw');
          audio.playStasisThrow();
          if (!skillExecutor.hasActiveGravityRocks()) {
            const gSlot = progression.slots.find((s) => s.skillId === 'gravity_field');
            if (gSlot) gSlot.cooldownRemaining = ACTIVE_SKILLS_CATALOG.gravity_field.cooldown;
          }
        }
        return fired;
      };
      controller.onSlotTriggered = (slotIdx) => {
        if (levelUpOpenRef.current || battleReportOpenRef.current || pauseOpenRef.current || !controller) return;
        const slot = progression.slots[slotIdx];
        if (!slot.skillId) return;
        // Si pulsa el slot de Campo Gravitacional teniendo rocas activas -> cancela y las suelta
        if (slot.skillId === 'gravity_field' && skillExecutor.hasActiveGravityRocks()) {
          skillExecutor.cancelGravityField();
          return;
        }
        if (slot.cooldownRemaining > 0) return;
        const def = ACTIVE_SKILLS_CATALOG[slot.skillId];
        if (controller.getEden() < def.edenCost) return;

        const activeTargets = waveMgr.getActiveEnemies();
        const locked = controller.getLockedEnemy();
        const res = skillExecutor.triggerSkill(slot.skillId, slot.level, {
          playerPos: controller.getPosition(),
          forwardDir: controller.getAimForward(),
          isGrounded: controller.isPlayerGrounded(),
          isStill: controller.isPlayerStill(),
          lockedEnemy: locked && activeTargets.some((e) => e.id === locked.id) ? locked : null,
          enemies: activeTargets,
          slabs: activeSlabs,
          onDamageEnemy: handleSkillDamageEnemy,
          onHealPlayer: (hp, eden) => controller?.restoreResources(hp, eden),
          // Bolas de Doble Filo: el Campo Gravitacional captura las bolas de
          // tinta ácida del pulpo dentro de su radio EN VEZ de coger rocas.
          captureEnemyProjectiles: (center, radius) =>
            waveMgr.captureInkBallsInRadius(center, radius),
          onStartImplosion: (target) => {
            if (implosionCinematic !== null) return false;
            const managed = waveMgr.getActiveEnemies().find((e) => e.id === target.id);
            if (!managed || !managed.entity.alive) return false;

            let mode: ImplosionMode = 'one_hit';
            let duration = 1.15;
            if (managed.entity.archetype === 'kronos_leviathan') {
              if (kronosImplosionUsedOnId === managed.id || waveMgr.isKronosPhase4Active()) {
                return false;
              }
              kronosImplosionUsedOnId = managed.id;
              mode = 'kronos_crystal';
              duration = 1.2;
            } else if (managed.entity.isElite) {
              const hpRatio = managed.entity.hp / Math.max(1, managed.entity.maxHp);
              if (hpRatio >= 0.5) {
                mode = 'miniboss_repel';
                duration = 1.25;
              }
            }

            const dx = camera.position.x - managed.position.x;
            const dz = camera.position.z - managed.position.z;
            const horizDist = Math.hypot(dx, dz);
            const startDist = Math.max(4, managed.position.distanceTo(camera.position));

            implosionCinematic = {
              mode,
              enemy: managed,
              elapsed: 0,
              duration,
              resolved: false,
              savedCamPos: camera.position.clone(),
              savedCamQuat: camera.quaternion.clone(),
              savedFov: camera.fov,
              savedEnemyScale: managed.mesh.scale.clone(),
              savedEnemyPos: managed.mesh.position.clone(),
              orbitBaseAngle: horizDist > 0.01 ? Math.atan2(dz, dx) : 0,
              startDist,
              startHeight: camera.position.y - managed.position.y,
            };
            return true;
          },
        });
        if (res.triggered) {
          controller.spendEden(def.edenCost);
          // El cooldown de gravity_field empieza al gastar/cancelar la última roca
          if (slot.skillId !== 'gravity_field') {
            slot.cooldownRemaining = def.cooldown;
          }
          if (res.animOverride) controller.triggerSkillAnim(res.animOverride);
          // Firma sonora por habilidad: viento, gravedad y energía propias.
          switch (slot.skillId) {
            case 'gravity_field':
              audio.playStasisGrab();
              break;
            case 'repulse_push':
              audio.playRepulsePush();
              break;
            case 'eden_absorb':
              audio.playEdenAbsorb();
              break;
            case 'attraction_well':
              audio.playAttractionWell();
              break;
            case 'bounce_horizon':
              audio.playBounceHorizon();
              break;
            case 'black_hole':
              audio.playBlackHoleCast();
              break;
            case 'implosion':
              audio.playImplosion();
              break;
          }
        }
      };
      controllerRef.current = controller;
      setHud(controller.getHudState());
    })
    .catch((err) => {
      console.error('Failed to load NYX model:', err);
    });

  const onCanvasClick = () => {
    audio.unlock();
    if (tutorialOpenRef.current) return;
    if (document.pointerLockElement !== canvas) {
      canvas.requestPointerLock?.();
    }
  };

  // El AudioContext de los SFX se desbloquea con CUALQUIER gesto: con el mando
  // se puede jugar entero sin tocar el ratón, y antes los efectos quedaban
  // mudos porque solo se desbloqueaba el contexto en el clic del lienzo.
  const onUnlockAudio = () => audio.unlock();
  window.addEventListener('pointerdown', onUnlockAudio, { passive: true });
  window.addEventListener('keydown', onUnlockAudio);

  const onPointerLockChange = () => {
    const locked = document.pointerLockElement === canvas;
    if (locked) {
      hadPointerLockRef.current = true;
      // Entrenamiento: al recapturar el ratón (clic en el lienzo) el panel
      // debug se oculta solo para devolver el control completo del juego.
      if (training && debugPanelOpenRef.current) {
        debugPanelOpenRef.current = false;
        setDebugPanelOpen(false);
      }
    } else if (
      hadPointerLockRef.current &&
      !levelUpOpenRef.current &&
      !battleReportOpenRef.current &&
      !pauseOpenRef.current &&
      !debugPanelOpenRef.current &&
      !tutorialOpenRef.current
    ) {
      // El navegador consumió ESC para soltar el pointer lock: abre la pausa.
      setIsPauseOpen(true);
    }
    controller?.setPointerLocked(locked);
    if (controller) setHud(controller.getHudState());
  };

  const onMouseMove = (e: MouseEvent) => {
    if (document.pointerLockElement !== canvas) return;
    controller?.onMouseMove(e.movementX, e.movementY);
  };

  const onMouseDown = (e: MouseEvent) => {
    if (document.pointerLockElement !== canvas) return;
    controller?.onMouseDown(e.button);
  };

  const onMouseUp = (e: MouseEvent) => {
    controller?.onMouseUp(e.button);
  };

  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    // M: silencia SFX y música a la vez (mismo atajo que en la campaña).
    if (e.code === 'KeyM') {
      musicPlayer.setMuted(audio.toggleMute());
      return;
    }
    // Entrenamiento: F2/Tab muestran u ocultan el panel debug; T recarga
    // Vida + Edén al instante (tecla rápida de recarga).
    if (training && (e.code === 'F2' || e.code === 'Tab')) {
      e.preventDefault();
      const next = !debugPanelOpenRef.current;
      debugPanelOpenRef.current = next;
      setDebugPanelOpen(next);
      if (next) {
        document.exitPointerLock?.();
      } else {
        const activeCanvas = canvas;
        if (
          activeCanvas &&
          !levelUpOpenRef.current &&
          !battleReportOpenRef.current &&
          !pauseOpenRef.current
        ) {
          activeCanvas.requestPointerLock?.();
        }
      }
      return;
    }
    if (training && e.code === 'KeyT') {
      trainingBridgeRef.current?.refillResources();
      return;
    }
    if (e.code === 'Escape' || e.code === 'KeyP') {
      // Con la pantalla de ajustes abierta, ESC la cierra a ella (su propio
      // listener); el menú de pausa que hay debajo no debe moverse.
      if (settingsOpenRef.current || tutorialOpenRef.current) return;
      if (levelUpOpenRef.current || battleReportOpenRef.current) return;
      if (pauseOpenRef.current) {
        // Cerrar la pausa con teclado: NO se pide el pointer lock aquí. La
        // tecla ESC no es un gesto válido de activación para el navegador
        // (o deshace el lock concedido en pleno keydown), y el
        // `pointerlockchange` de salida resultante reabría la pausa en bucle
        // sin dejar de cerrarla jamás. La marca queda limpia para que ningún
        // unlock rezagado pueda reabrirla: el ratón se recaptura con un clic
        // en el lienzo (gesto válido, siempre funciona), igual que REANUDAR.
        hadPointerLockRef.current = false;
        pauseResumeGraceUntil = performance.now() + 250;
        setIsPauseOpen(false);
      } else if (performance.now() >= pauseResumeGraceUntil) {
        setIsPauseOpen(true);
        document.exitPointerLock?.();
      }
      return;
    }
    if (pauseOpenRef.current || tutorialOpenRef.current) return;
    // Tab (Radar de enemigos, fuera de Training Mode): sin preventDefault el
    // navegador robaría el foco del canvas al pulsarla.
    if (e.code === 'Tab') e.preventDefault();
    controller?.onKeyDown(e.code);
  };

  const onKeyUp = (e: KeyboardEvent) => {
    if (pauseOpenRef.current) return;
    controller?.onKeyUp(e.code);
  };

  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    controller?.setViewportSize(window.innerWidth, window.innerHeight);
  };

  canvas.addEventListener('click', onCanvasClick);
  canvas.addEventListener('contextmenu', onContextMenu);
  document.addEventListener('pointerlockchange', onPointerLockChange);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('resize', onResize);

  let last = performance.now();
  let elapsed = 0;
  let hudTimer = 0;
  let raf = 0;
  let gameOverTriggered = false;
  const parryStarScratch = new THREE.Vector3();
  const parryHeadScratch = new THREE.Vector3();

  const tick = () => {
    raf = requestAnimationFrame(tick);
    const now = performance.now();
    const rawDt = Math.min((now - last) / 1000, 0.05);
    last = now;

    // --- Mando (Gamepad API): se lee SIEMPRE cada frame, incluso en pausa,
    // para poder abrir/cerrar DomePauseModal con Options y cerrarla con
    // Círculo (B). El resto de botones los consume el controlador al jugar.
    gamepad.update();
    // Cualquier botón del mando también desbloquea el AudioContext (se puede
    // jugar una run entera sin tocar el ratón ni el teclado).
    const rawPad = readConnectedGamepad();
    if (rawPad) {
      for (const button of rawPad.buttons) {
        if (button && button.pressed) {
          audio.unlock();
          break;
        }
      }
    }
    if (gamepad.justPressedAction('pause')) {
      if (
        !levelUpOpenRef.current &&
        !battleReportOpenRef.current &&
        !settingsOpenRef.current &&
        !tutorialOpenRef.current
      ) {
        if (pauseOpenRef.current) {
          // Reanudar con mando NO captura el ratón: se puede seguir jugando
          // solo con el mando y el puntero libre.
          setIsPauseOpen(false);
        } else {
          setIsPauseOpen(true);
          if (document.pointerLockElement === canvas) {
            document.exitPointerLock?.();
          }
        }
      }
    } else if (pauseOpenRef.current && !settingsOpenRef.current && gamepad.justPressed(1)) {
      setIsPauseOpen(false);
    }

    const menuPaused =
      levelUpOpenRef.current ||
      battleReportOpenRef.current ||
      pauseOpenRef.current ||
      tutorialOpenRef.current;
    const isPaused = menuPaused || implosionCinematic !== null;
    const effRawDt = isPaused ? 0 : rawDt;
    const timeScale = controller ? controller.getTimeScale() : 1.0;
    const worldDt = effRawDt * timeScale;
    elapsed += worldDt;

    if (loadedNyx) {
      loadedNyx.universeMat.uniforms.uTime.value = elapsed;
    }

    backdrop.update(worldDt, elapsed);

    if (controller && !isPaused) {
      progression.updateCooldowns(effRawDt);
      // Entrenamiento: el Edén se regenerá rapidísimo (+25/s) para poder
      // probar habilidades en cadena sin farmear.
      if (training) {
        controller.restoreResources(0, 25 * effRawDt);
      }
      const mods = progression.getModifiers();
      const playerStatus = combat.updatePlayerStatus(effRawDt);
      if (playerStatus.inkDamageThisFrame > 0 && controller) {
        // DoT ácido silencioso: drena HP sin sacudir la cámara cada 0.25 s.
        controller.restoreResources(-playerStatus.inkDamageThisFrame, 0);
        if (training && controller.getHp() < 1) {
          controller.restoreResources(progression.maxHp, 0);
        }
      }

      // Suelos activos según oleada (flotantes arrancados en básicas / triángulos de esfera en Miniboss y Boss).
      // Se pasa la posición y dirección de la cámara para que los suelos
      // reciclados re-entren desde fuera del campo de visión del jugador.
      floatingSlabs.update(worldDt, elapsed, camera.position, controller.getAimForward());
      sphereTiles.update(worldDt, elapsed);
      refillActiveSlabs();

      waveMgr.setSkillProjectiles(skillExecutor.getActiveProjectiles());

      const {
        didEnemyEvadeDash,
        golemParryTarget,
        golemParryStarPos,
        golemParryHeadPos,
      } = waveMgr.update(
        worldDt,
        elapsed,
        controller.getPosition(),
        controller.getLockedEnemy(),
        controller.getAttackAccelTime(),
        controller.getVelocity(),
        controller.getAimForward(),
        controller.isPlayerDashing(),
        controller.isPlayerInKickAnim(),
        controller.getGroundedSlab(),
        activeSlabs,
        onWavePlayerHit,
        onOctopusInk,
        onGolemSmash,
        onSlabSmash,
        controller.getHp() / controller.getMaxHp(),
        controller.getEden() / controller.getMaxEden(),
        controller.isParryDashUsed(),
        controller.isParryDashInFlight(),
      );
      if (didEnemyEvadeDash) {
        controller.notifyEnemyEvaded();
      }
      // El MANAGER es la única fuente de verdad de la ventana del parry:
      // si su FSM la cerró en este update (Nyx llegó a α+2 sin dash, se fue
      // de α+9, el gólem bajó la guardia, caducó el margen del remate o
      // murió), el slow-mo se apaga EN ESTE MISMO FRAME — antes de que el
      // controller vuelva a leer su timeScale. El controller nunca decide
      // cierres.
      if (waveMgr.consumeGolemParryClose()) {
        controller.closeParryWindow();
      }
      if (golemParryTarget && golemParryStarPos) {
        // Parry del Gólem (FASE 1 — apertura por DISTANCIA: Nyx cruzó α+9
        // con la guardia alzada): slow-mo propio con latigazo de cámara
        // hacia la estrella y ventaja de dash directo al punto del remate.
        controller.openParryWindow(
          golemParryTarget,
          golemParryStarPos,
          golemParryHeadPos ?? undefined,
        );
      }
      if (
        controller.isParryWindowActive() &&
        waveMgr.getGolemParryTargets(parryStarScratch, parryHeadScratch)
      ) {
        controller.syncParryTargets(parryStarScratch, parryHeadScratch);
      }

      waveMgr.fillActiveEnemies(activeEnemies);

      // Regla de Barrera Blanca para enemigos
      for (const enemy of activeEnemies) {
        if (!enemy.entity.alive) continue;
        // El cangrejo en pleno salto entre suelos no muere por la barrera.
        if (waveMgr.isEnemyJumping(enemy)) continue;
        if (combat.checkDomeBarrierKill(enemy.entity, DOME_PLAYER_BOUND_RADIUS)) {
          killWaveEnemy(enemy, true);
        }
      }

      // Avance automático al completar oleada. En Entrenamiento no existen
      // oleadas: el enemigo único reaparece al instante con la vida llena.
      if (training) {
        if (waveMgr.getActiveEnemyCount() === 0) {
          spawnTrainingEnemy();
        }
      } else if (waveMgr.getActiveEnemyCount() === 0) {
        if (nextWaveDelay <= 0) nextWaveDelay = 1.6;
        else {
          nextWaveDelay -= worldDt;
          if (nextWaveDelay <= 0) {
            const nextWave = waveMgr.getWaveInfo().wave + 1;
            waveMgr.startWave(nextWave, activeSlabs);
            runTracker.recordWave(nextWave);
            applyFloorMode(waveMgr.getWaveInfo().floorMode);
            syncWaveMusic(waveMgr.getWaveInfo().label);
          }
        }
      } else {
        nextWaveDelay = 0;
      }

      // Actualizar habilidades activas (rocas orbitando frente a Nyx, agujero negro, ondas, pozo)
      skillExecutor.update(
        worldDt,
        activeEnemies,
        handleSkillDamageEnemy,
        controller.getPosition(),
        controller.getAimForward(),
      );

      // VFX cómic de materia oscura (picos, estrellas, humo).
      comicVfx.update(worldDt, camera);

      // Motor gravitacional: el viento sigue la velocidad real de Nyx (30
      // m/s = tope de dash/taladro) y el zumbido grave acompaña a las rocas
      // en órbita y a cualquier agujero negro vivo.
      audio.updateMovementSpeed(Math.min(1, controller.getCurrentSpeed() / 30));
      audio.setGravityFieldActive(
        skillExecutor.hasActiveGravityRocks() || skillExecutor.hasActiveBlackHole(),
      );

      // Actualizar partículas de EXP / Edén con magnetismo por nivel
      const pickupGains = pickups.update(
        worldDt,
        controller.getPosition(),
        mods.magnetRadius,
        mods.magnetSpeed,
      );
      if (pickupGains.hpGained > 0 || pickupGains.edenGained > 0) {
        controller.restoreResources(pickupGains.hpGained, pickupGains.edenGained);
      }
      if (pickupGains.expGained > 0) {
        const gainedLevels = progression.addExp(pickupGains.expGained);
        if (gainedLevels.length > 0) {
          // Si al subir de nivel ya hay suficiente EXP en un radio de 30 m
          // para encadenar otra subida, se contabiliza por adelantado para
          // abrir 1 -> 2 -> 2 -> 3. Los orbes siguen vivos y vuelan hasta Nyx
          // igual que los de Edén/Vida, marcados como `counted` para no sumar
          // su EXP por duplicado al tocarla.
          const nearbyExp = pickups.peekExpInRadius(controller.getPosition(), 30);
          if (nearbyExp > 0 && progression.exp + nearbyExp >= progression.expToNext) {
            const countedExp = pickups.markExpCountedInRadius(controller.getPosition(), 30);
            const extraLevels = progression.addExp(countedExp);
            gainedLevels.push(...extraLevels);
          }
          runTracker.recordLevel(progression.level);
          openLevelUpModal(gainedLevels);
        } else {
          runTracker.recordLevel(progression.level);
        }
      }

      const waveInfo = waveMgr.getWaveInfo();
      // Sincronizar estadísticas/slots con NyxDomeController (payload
      // persistente mutado in-place: cero objetos nuevos por frame).
      syncPayload.level = progression.level;
      syncPayload.exp = progression.exp;
      syncPayload.expToNext = progression.expToNext;
      syncPayload.maxHp = progression.maxHp;
      syncPayload.maxEden = progression.maxEden;
      syncPayload.speedMultiplier = mods.speedMultiplier;
      syncPayload.edenRegenFrac = mods.edenRegenPctPerSec;
      syncPayload.hpRegenFrac = mods.hpRegenPctPerSec;
      syncPayload.inkOverlayIntensity = playerStatus.inkIntensity;
      syncPayload.waveNumber = training ? undefined : waveInfo.wave;
      syncPayload.waveLabel = training ? undefined : waveInfo.label;
      for (let i = 0; i < 3; i++) {
        const slot = progression.slots[i];
        syncPayload.slots[i].skillId = slot.skillId;
        syncPayload.slots[i].name = slot.skillId
          ? ACTIVE_SKILLS_CATALOG[slot.skillId].name
          : null;
        syncPayload.slots[i].level = slot.level;
        syncPayload.slots[i].cooldownRemaining = slot.cooldownRemaining;
        syncPayload.slots[i].maxCooldown = slot.maxCooldown;
        syncPayload.slots[i].isActive = slot.skillId
          ? slot.skillId === 'implosion'
            ? implosionCinematic !== null || skillExecutor.isSkillActive('implosion')
            : skillExecutor.isSkillActive(slot.skillId)
          : false;
      }
      controller.syncProgression(syncPayload);

      // --- Leviatán KRONOS → controller: efectos de cosmos_fusion sobre
      // Nyx (Fase 4) y el slow-mo global continuo (timeScale 0.75). El
      // manager es la única fuente de verdad; el controller solo aplica.
      const kronosFx = waveMgr.getKronosNyxEffects();
      controller.setKronosDeformed(kronosFx.deformActive);
      controller.setKronosCameraShake(Math.max(kronosFx.cameraShake, waveMgr.getSparrowCameraShake()));
      if (waveMgr.consumeSparrowShriekPulse()) {
        audio.playSparrowShriek();
      }
      controller.setKronosControlsInverted(kronosFx.controlsInverted);
      controller.setKronosSlowMoScale(
        Math.min(kronosFx.phase4 ? 0.75 : 1, waveMgr.getSparrowSlowMoScale()),
      );
      if (kronosFx.shakePulse > 0) {
        // Rugido/apertura de portal de KRONOS: sacudida puntual + señal sonora.
        controller.punchCamera(Math.min(1.3, kronosFx.shakePulse));
        audio.playWarning();
        kronosFx.shakePulse = 0;
      }
      if (kronosFx.voidFlashPulse > 0) {
        // cosmos_fusion: destello void cosmos en HUD/pantalla + impacto seco.
        controller.punchCamera(1.2);
        audio.playBossHit();
        kronosFx.voidFlashPulse = 0;
      }

      controller.update(
        effRawDt,
        activeSlabs,
        camera,
        activeEnemies,
        onControllerHitEnemy,
      );

      // Segunda encuesta del MISMO evento: los golpes conectados DURANTE
      // controller.update (el remate del parry en onHitEnemy) cierran la
      // ventana del manager y marcan golemParryClosed — aquí se consume y el
      // slow-mo se apaga EN ESTE MISMO FRAME, nunca en el siguiente.
      // (α+2 sin dash, alejamiento de α+9, guardia baja o remate conectado).
      if (waveMgr.consumeGolemParryClose()) {
        controller.closeParryWindow();
      }

      runTracker.tick(worldDt);
      runTracker.recordSpeed(controller.getCurrentSpeed());

      // Entrenamiento: Nyx es inmortal, nunca se muestra el Battle Report.
      if (!training && controller.getHp() <= 0 && !gameOverTriggered) {
        gameOverTriggered = true;
        musicPlayer.stop();
        if (document.pointerLockElement === canvas) {
          document.exitPointerLock?.();
        }
        // Misma marca síncrona que openLevelUpModal: sin ella, la pausa se
        // abriría debajo del Battle Report.
        battleReportOpenRef.current = true;
        const equippedIds = progression.slots
          .filter((s) => s.skillId !== null)
          .map((s) => ({ id: s.skillId as string, level: s.level }));
        const summary = runTracker.getSummary(equippedIds, progression.passives);
        setBattleReport({
          score: summary.score,
          wave: summary.wave,
          level: summary.maxLevelReached,
          kills: summary.kills,
          barrierKills: summary.barrierKills,
          maxSpeed: summary.maxSpeedReached,
          survivalTimeSec: summary.survivalTimeSec,
          perfectRedirections: summary.perfectRedirections,
          equippedSkills: progression.slots
            .filter((s) => s.skillId !== null)
            .map((s) => ({
              id: s.skillId!,
              name: ACTIVE_SKILLS_CATALOG[s.skillId!].name,
              level: s.level,
            })),
        });
      }

      hudTimer += rawDt;
      if (hudTimer >= 1 / 30) {
        hudTimer = 0;
        setHud(controller.getHudState());
      }
    } else if (!controller) {
      camera.position.set(0, 2.8, 7.5);
      camera.lookAt(0, 1.0, 0);
    }

    // --- Cinemática de Implosión: cámara dinámica + compresión/repulsión/cristal ---
    if (implosionCinematic !== null && !menuPaused) {
      const cin = implosionCinematic;
      cin.elapsed += rawDt;
      const t = Math.min(1, cin.elapsed / cin.duration);
      const enemy = cin.enemy;
      const targetPos = enemy.position;

      // Zoom orbital dinámico sobre el enemigo + estrechamiento de FOV
      const zoomEase = 1 - Math.pow(1 - Math.min(1, t * 1.35), 2.5);
      const targetDist = Math.max(4.6, enemy.radius * 2.45);
      const dist = cin.startDist + (targetDist - cin.startDist) * zoomEase;
      const angle = cin.orbitBaseAngle + 0.55 * t;
      const targetHeight = Math.max(0.8, enemy.radius * 0.45);
      const height = cin.startHeight + (targetHeight - cin.startHeight) * zoomEase;

      camera.position.set(
        targetPos.x + Math.cos(angle) * dist,
        targetPos.y + height,
        targetPos.z + Math.sin(angle) * dist,
      );
      camera.lookAt(targetPos);
      // Ligero ángulo holandés durante la compresión para dar tensión dramática
      camera.rotateZ(0.055 * Math.sin(t * Math.PI));

      const fovTarget = cin.savedFov - 11 * Math.sin(Math.min(1, t * 1.2) * Math.PI * 0.85);
      if (Math.abs(camera.fov - fovTarget) > 0.05) {
        camera.fov = fovTarget;
        camera.updateProjectionMatrix();
      }

      if (cin.mode === 'one_hit') {
        const crushAt = 0.88;
        if (cin.elapsed < crushAt) {
          const u = cin.elapsed / crushAt;
          const s = Math.max(0.015, 1 - Math.pow(u, 1.85));
          enemy.mesh.scale.copy(cin.savedEnemyScale).multiplyScalar(s);
          enemy.mesh.rotation.y += rawDt * (3.5 + 22 * u);
          enemy.hitFlash = 0.5 + 0.5 * Math.sin(u * 26);
        } else {
          if (!cin.resolved) {
            cin.resolved = true;
            enemy.mesh.scale.setScalar(0.0001);
            audio.playBossHit();
            comicVfx.spawnComicExplosion(targetPos, Math.max(2.5, enemy.radius * 1.2));
            killWaveEnemy(enemy, false);
          }
          // Sacudida breve de cámara en el instante del colapso
          const shake = Math.max(0, 1 - (cin.elapsed - crushAt) / 0.22) * 0.28;
          if (shake > 0.005) {
            camera.position.x += Math.sin(cin.elapsed * 95) * shake;
            camera.position.y += Math.cos(cin.elapsed * 83) * shake;
          }
        }
      } else if (cin.mode === 'miniboss_repel') {
        const repelAt = 0.65;
        if (cin.elapsed < repelAt) {
          const u = cin.elapsed / repelAt;
          const s = 1 - 0.52 * Math.sin(u * Math.PI * 0.5);
          enemy.mesh.scale.copy(cin.savedEnemyScale).multiplyScalar(s);
          enemy.mesh.position.set(
            cin.savedEnemyPos.x + Math.sin(cin.elapsed * 72) * 0.14 * u,
            cin.savedEnemyPos.y + Math.cos(cin.elapsed * 64) * 0.12 * u,
            cin.savedEnemyPos.z + Math.sin(cin.elapsed * 58) * 0.14 * u,
          );
          enemy.hitFlash = 0.4 + 0.4 * Math.sin(u * 22);
        } else {
          if (!cin.resolved) {
            cin.resolved = true;
            const dmg = enemy.entity.maxHp * 0.2;
            enemy.entity.hp = Math.max(1, enemy.entity.hp - dmg);
            runTracker.recordDamage(dmg);
            enemy.hitFlash = 1;
            audio.playBossHit();
            comicVfx.spawnComicHit(targetPos, null, 1.35, enemy.radius);
          }
          const v = Math.min(1, (cin.elapsed - repelAt) / 0.42);
          const bounce = 0.48 + 0.52 * (1 + Math.sin(v * Math.PI) * 0.48);
          enemy.mesh.scale.copy(cin.savedEnemyScale).multiplyScalar(bounce);
          enemy.mesh.position.set(
            cin.savedEnemyPos.x,
            cin.savedEnemyPos.y + Math.sin(v * Math.PI) * 1.1,
            cin.savedEnemyPos.z,
          );
          const shake = Math.max(0, 1 - (cin.elapsed - repelAt) / 0.24) * 0.35;
          if (shake > 0.005) {
            camera.position.x += Math.sin(cin.elapsed * 90) * shake;
            camera.position.y += Math.cos(cin.elapsed * 78) * shake;
          }
        }
      } else {
        // kronos_crystal: comprime y rompe 1 cristal dorsal para pasar de fase
        const breakAt = 0.68;
        if (cin.elapsed < breakAt) {
          const u = cin.elapsed / breakAt;
          const s = 1 - 0.2 * Math.sin(u * Math.PI * 0.5);
          enemy.mesh.scale.copy(cin.savedEnemyScale).multiplyScalar(s);
          enemy.mesh.position.set(
            cin.savedEnemyPos.x + Math.sin(cin.elapsed * 68) * 0.16 * u,
            cin.savedEnemyPos.y + Math.cos(cin.elapsed * 60) * 0.14 * u,
            cin.savedEnemyPos.z,
          );
          enemy.hitFlash = 0.5 + 0.4 * Math.sin(u * 24);
        } else {
          if (!cin.resolved) {
            cin.resolved = true;
            waveMgr.tryBreakKronosStarFromSkill(enemy);
            runTracker.recordDamage(1);
            enemy.hitFlash = 1;
            audio.playBossHit();
            comicVfx.spawnComicExplosion(targetPos, Math.max(3.5, enemy.radius * 1.4));
          }
          const v = Math.min(1, (cin.elapsed - breakAt) / 0.32);
          const recoil = 0.8 + 0.2 * (1 + Math.sin(v * Math.PI) * 0.25);
          enemy.mesh.scale.copy(cin.savedEnemyScale).multiplyScalar(recoil);
          enemy.mesh.position.copy(cin.savedEnemyPos);
          const shake = Math.max(0, 1 - (cin.elapsed - breakAt) / 0.26) * 0.4;
          if (shake > 0.005) {
            camera.position.x += Math.sin(cin.elapsed * 92) * shake;
            camera.position.y += Math.cos(cin.elapsed * 80) * shake;
          }
        }
      }

      // Anima los VFX activos durante el freeze cinemático
      skillExecutor.update(rawDt, [], handleSkillDamageEnemy);
      comicVfx.update(rawDt, camera);

      if (cin.elapsed >= cin.duration) {
        if (cin.mode !== 'one_hit' && enemy.entity.alive) {
          enemy.mesh.scale.copy(cin.savedEnemyScale);
          enemy.mesh.position.copy(cin.savedEnemyPos);
        }
        camera.position.copy(cin.savedCamPos);
        camera.quaternion.copy(cin.savedCamQuat);
        if (camera.fov !== cin.savedFov) {
          camera.fov = cin.savedFov;
          camera.updateProjectionMatrix();
        }
        implosionCinematic = null;
      }
    }

    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(tick);

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    if (document.pointerLockElement === canvas) {
      document.exitPointerLock?.();
    }
    canvas.removeEventListener('click', onCanvasClick);
    canvas.removeEventListener('contextmenu', onContextMenu);
    document.removeEventListener('pointerlockchange', onPointerLockChange);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('pointerdown', onUnlockAudio);
    window.removeEventListener('keydown', onUnlockAudio);
    controllerRef.current = null;
    audioRef.current = null;
    // El motor gravitacional tiene capas continuas (viento/zumbido): sin esto
    // el AudioContext huérfano seguiría sonando tras desmontar la vista.
    audio.dispose();
    musicPlayer.stop();
    progressionRef.current = null;
    trainingBridgeRef.current = null;
    loadedNyx?.dispose();
    pickups.dispose();
    skillExecutor.dispose();
    waveMgr.dispose();
    sphereTiles.dispose();
    floatingSlabs.dispose();
    vfx.dispose();
    comicVfx.dispose();
    backdrop.dispose();
    renderer.dispose();
  };
}
