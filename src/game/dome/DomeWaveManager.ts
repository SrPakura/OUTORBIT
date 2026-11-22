import * as THREE from 'three';
import { addComicOutline, createComicCelMaterial } from '@/game/render/toonMaterials';
import type { TestEnemySphere } from './domeTypes';
import {
  createDomeEnemyEntity,
  DOME_ENEMY_ARCHETYPES,
  type DomeEnemyEntity,
  type EnemyArchetype,
} from './DomeCombatSystem';
import {
  instantiateEnemyVisual,
  onEnemyModelLoaded,
  preloadEnemyModels,
} from './DomeEnemyModels';

// ============================================================================
// DomeWaveManager — ciclo infinito de oleadas de la cúpula.
//
// Estructura del ciclo (15 rondas, repetido infinito):
//   1–4   Básicos (4 → 8 enemigos)            suelos 'basic'
//   5     Miniboss/Épico 1: giant_sparrow     suelos 'miniboss'
//   6–9   Básicos (7 → 11)                    suelos 'basic'
//   10    Miniboss/Épico 2: prisma_necrozma   suelos 'miniboss'
//   11–14 Básicos (9 → 13)                    suelos 'basic'
//   15    Boss: kronos_leviathan              suelos 'boss'
//   16+   Repite el ciclo con +2*cycle enemigos y velocidad 1 + cycle*0.2.
//
// Cada enemigo es un `ManagedWaveEnemy` (extiende `TestEnemySphere`), así que
// el array `enemies` es 100% compatible con lo que espera `NyxDomeController`
// para lock-on/patadas, y a la vez lleva su `DomeEnemyEntity` para el
// `DomeCombatSystem` (carne/estrella/puntos débiles).
// ============================================================================

export type WaveFloorMode = 'basic' | 'miniboss' | 'boss';

export interface ManagedWaveEnemy extends TestEnemySphere {
  /** Entidad de combate (HP, carne, estrella, puntos débiles) para DomeCombatSystem. */
  entity: DomeEnemyEntity;
  /** Fase del bob senoidal de flotación. */
  phase: number;
  /** Segundos restantes del dash evasivo (sin freno durante el brusco). */
  dashTimer: number;
  /** Signo del próximo dash lateral (alterna izquierda/derecha). */
  dashSign: 1 | -1;
  /** Cuenta atrás del próximo ataque (proyectil o embestida). */
  attackTimer: number;
}

export interface WaveInfo {
  wave: number;
  label: string;
  floorMode: WaveFloorMode;
  remaining: number;
}

// ---------------------------------------------------------------------------
// Constantes de comportamiento (heredadas del feel de TestEnemySpheres)
// ---------------------------------------------------------------------------

const FLOAT_SPRING = 2.4;
const FLOAT_DAMPING = 1.6;
const FLOAT_BOB_AMPLITUDE = 0.9;
const FLOAT_BOB_SPEED = 0.9;
const LEASH_RADIUS = 9.0;
const HOME_PULL = 6.5;
const DOME_KEEP_RADIUS = 78.0;
const DOME_KEEP_PULL = 9.0;

const EVASIVE_DASH_SPEED = 28.0;
const EVASIVE_DASH_TIME = 0.38;
const EVASIVE_DASH_LIFT = 5.5;
const EVASIVE_COOLDOWN = 3.0;
const EVADE_TRIGGER_ATTACK_TIME = 0.85;
const EVADE_TRIGGER_DISTANCE = 14.0;

const HIT_KNOCKBACK = 14.0;
const HIT_KNOCKBACK_DRILL = 26.0;
const HIT_FLASH_DECAY = 3.2;
const HIT_FLASH_SCALE = 0.35;
const HIT_FLASH_EMISSIVE = 0.85;

/** Arquetipos con dash evasivo al ser lockeados/atacados. */
const EVASIVE_ARCHETYPES: ReadonlySet<EnemyArchetype> = new Set([
  'spiral_octopus',
  'lightning_butterfly',
  'giant_sparrow',
  'prisma_necrozma',
]);

const BASIC_ARCHETYPES: readonly EnemyArchetype[] = [
  'abyssal_cell',
  'crab_gunner',
  'spiral_octopus',
  'lightning_butterfly',
  'ground_golem',
];

const CYCLE_LENGTH = 15;

// Pinchos del Prisma Necrozma: ciclos on/off visibles en emissive/rim.
const NECROZMA_SPIKES_ON_SEC = 3.4;
const NECROZMA_SPIKES_OFF_SEC = 2.6;
const NECROZMA_SPIKES_RIM = 0xff3b3b;
const NECROZMA_BASE_RIM = 0xd9baff;

// Proyectiles oscuros lentos (pool fijo, sin allocations por frame).
const PROJECTILE_POOL_SIZE = 32;
const PROJECTILE_LIFE_SEC = 9.0;
const PROJECTILE_PLAYER_RADIUS = 1.6;
const PROJECTILE_BOUND_RADIUS = 88.0;

// Embestidas (gólem, gorrión): carga directa contra Nyx.
const CHARGE_TRIGGER_DISTANCE = 26.0;
const CHARGE_CONTACT_PADDING = 1.9;

// --- Scratch vectors a nivel de módulo: sin allocations por frame --- 
const _toHome = new THREE.Vector3();
const _toEnemy = new THREE.Vector3();
const _perp = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _flat = new THREE.Vector3();
const _shotDir = new THREE.Vector3();

// ---------------------------------------------------------------------------
// Plan de oleada
// ---------------------------------------------------------------------------

/** Arquetipo concreto o mezcla rotada de básicos. */
type WaveSpawnArchetype = EnemyArchetype | 'basic_mix';

interface WaveSpawn {
  archetype: WaveSpawnArchetype;
  count: number;
}

interface WavePlan {
  wave: number;
  label: string;
  floorMode: WaveFloorMode;
  spawns: WaveSpawn[];
  /** Multiplicador de velocidad/agresividad (1 + cycle * 0.2). */
  speedMult: number;
}

/** Cantidad escalonada de básicos entre `from` y `to` a lo largo de la banda. */
function rampCount(bandIndex: number, bandSize: number, from: number, to: number): number {
  const t = bandSize <= 1 ? 1 : bandIndex / (bandSize - 1);
  return Math.round(from + (to - from) * t);
}

function getWavePlan(waveNumber: number): WavePlan {
  const cycle = Math.floor((waveNumber - 1) / CYCLE_LENGTH);
  const inCycle = ((waveNumber - 1) % CYCLE_LENGTH) + 1;
  const speedMult = 1 + cycle * 0.2;
  const extra = 2 * cycle;
  const spawns: WaveSpawn[] = [];

  let label = 'BÁSICOS';
  let floorMode: WaveFloorMode = 'basic';

  if (inCycle === 5) {
    label = 'MINIBOSS';
    floorMode = 'miniboss';
    spawns.push({ archetype: 'giant_sparrow', count: 1 });
  } else if (inCycle === 10) {
    label = 'MINIBOSS';
    floorMode = 'miniboss';
    spawns.push({ archetype: 'prisma_necrozma', count: 1 });
  } else if (inCycle === 15) {
    label = 'BOSS';
    floorMode = 'boss';
    spawns.push({ archetype: 'kronos_leviathan', count: 1 });
  } else {
    // Bandas de básicos: 1–4 (4→8), 6–9 (7→11), 11–14 (9→13).
    let bandStart = 1;
    let bandEnd = 4;
    let from = 4;
    let to = 8;
    if (inCycle >= 6 && inCycle <= 9) {
      bandStart = 6;
      bandEnd = 9;
      from = 7;
      to = 11;
    } else if (inCycle >= 11 && inCycle <= 14) {
      bandStart = 11;
      bandEnd = 14;
      from = 9;
      to = 13;
    }
    const count = rampCount(inCycle - bandStart, bandEnd - bandStart + 1, from, to) + extra;
    spawns.push({ archetype: 'basic_mix', count });
  }

  // En ciclos avanzados, los miniboss/boss traen escoltas básicos (+2*cycle).
  if (extra > 0 && (floorMode === 'miniboss' || floorMode === 'boss')) {
    spawns.push({ archetype: 'basic_mix', count: extra });
  }

  return { wave: waveNumber, label, floorMode, spawns, speedMult };
}

// ---------------------------------------------------------------------------
// RNG determinista por oleada (posiciones reproducibles)
// ---------------------------------------------------------------------------

function makeRng(seed: number): () => number {
  let s = (seed * 2654435761 + 1013904223) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Aspecto provisional por arquetipo (hasta los GLBs de Nevi)
// ---------------------------------------------------------------------------

interface ArchetypeVisual {
  geometry: THREE.BufferGeometry;
  color: number;
  rim: number;
  outlineThickness: number;
  starColor: number;
  starScale: number;
}

function buildArchetypeVisuals(): Record<EnemyArchetype, ArchetypeVisual> {
  return {
    // Célula Abisal: icosaedro pequeño translúcido aqua.
    abyssal_cell: {
      geometry: new THREE.IcosahedronGeometry(1.5, 1),
      color: 0x7ae8dc,
      rim: 0xbafff2,
      outlineThickness: 0.05,
      starColor: 0xfff6c8,
      starScale: 0.45,
    },
    // Pulpo Espiral: toro en espiral (tentáculos enroscados) magenta.
    spiral_octopus: {
      geometry: new THREE.TorusKnotGeometry(1.5, 0.42, 64, 8),
      color: 0xff5f9e,
      rim: 0xffb3d4,
      outlineThickness: 0.05,
      starColor: 0xfff0a3,
      starScale: 0.5,
    },
    // Cangrejo Artillero: caja chata ancha naranja (torreta).
    crab_gunner: {
      geometry: new THREE.BoxGeometry(2.6, 1.2, 1.9),
      color: 0xff8c42,
      rim: 0xffd0a3,
      outlineThickness: 0.05,
      starColor: 0xfff0b0,
      starScale: 0.4,
    },
    // Gólem Rompesuelos: dodecaedro macizo piedra.
    ground_golem: {
      geometry: new THREE.DodecahedronGeometry(2.9),
      color: 0x9c8f7a,
      rim: 0xd8c9a8,
      outlineThickness: 0.06,
      starColor: 0xffe27a,
      starScale: 0.42,
    },
    // Mariposa Relámpago: tetraedro pequeño amarillo eléctrico.
    lightning_butterfly: {
      geometry: new THREE.TetrahedronGeometry(1.3),
      color: 0xfff45f,
      rim: 0xffffffa8,
      outlineThickness: 0.06,
      starColor: 0xffffff,
      starScale: 0.5,
    },
    // Gorrión Gigante (Élite): elipsoide alargado carmesí (cuerpo de ave).
    giant_sparrow: {
      geometry: new THREE.SphereGeometry(2.4, 20, 14),
      color: 0xff4d5e,
      rim: 0xffb0b8,
      outlineThickness: 0.06,
      starColor: 0x9ff0ff,
      starScale: 0.4,
    },
    // Prisma Necrozma (Élite): octaedro prismático violeta.
    prisma_necrozma: {
      geometry: new THREE.OctahedronGeometry(3.4),
      color: 0xb06bff,
      rim: NECROZMA_BASE_RIM,
      outlineThickness: 0.06,
      starColor: 0xbafff2,
      starScale: 0.38,
    },
    // Leviatán KRONOS (Boss): cápsula serpentante azul abisal.
    kronos_leviathan: {
      geometry: new THREE.CapsuleGeometry(2.6, 9.5, 8, 14),
      color: 0x2f6bff,
      rim: 0x9fc0ff,
      outlineThickness: 0.07,
      starColor: 0xfff0a3,
      starScale: 0.35,
    },
  };
}

// ---------------------------------------------------------------------------
// Internos por enemigo (materiales y estado de comportamiento)
// ---------------------------------------------------------------------------

interface EnemyInternal {
  enemy: ManagedWaveEnemy;
  material: THREE.ShaderMaterial | null;
  outlineMaterial: THREE.ShaderMaterial | null;
  starCores: THREE.Object3D[];
  mixer?: THREE.AnimationMixer;
  isGlb?: boolean;
  /** Timer del ciclo de pinchos (Necrozma). */
  spikeTimer: number;
  /** Segundos restantes de embestida en curso (0 = libre). */
  chargeTimer: number;
  chargeSpeed: number;
  chargeDamage: number;
  chargeDir: THREE.Vector3;
}

interface WaveProjectile {
  mesh: THREE.Mesh;
  active: boolean;
  kind: 'dark' | 'ink';
  damage: number;
  velocity: THREE.Vector3;
  life: number;
}

// ---------------------------------------------------------------------------
// DomeWaveManager
// ---------------------------------------------------------------------------

export class DomeWaveManager {
  /** Enemigos vivos de la oleada (compatibles con TestEnemySphere[]). */
  readonly enemies: ManagedWaveEnemy[] = [];

  private readonly scene: THREE.Scene;
  private readonly internals = new Map<string, EnemyInternal>();
  private readonly visuals: Record<EnemyArchetype, ArchetypeVisual>;
  private readonly starGeometry = new THREE.OctahedronGeometry(1, 0);
  private readonly projectiles: WaveProjectile[] = [];
  private readonly projectileGeometry = new THREE.SphereGeometry(0.55, 12, 10);
  private readonly darkProjectileMaterial: THREE.ShaderMaterial;
  private readonly inkProjectileMaterial: THREE.ShaderMaterial;

  private currentWave = 0;
  private waveTime = 0;
  private speedMult = 1;

  private readonly unsubModelLoaded: () => void;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.visuals = buildArchetypeVisuals();
    this.unsubModelLoaded = onEnemyModelLoaded((archetype) => {
      this.upgradeSpawnedVisuals(archetype);
    });
    preloadEnemyModels();

    this.darkProjectileMaterial = createComicCelMaterial(0x1c1030, {
      rimColor: 0x6b4bff,
      rimStrength: 0.9,
      emissiveBoost: 0.35,
    });
    this.inkProjectileMaterial = createComicCelMaterial(0x0a0a12, {
      rimColor: 0x4a2a6a,
      rimStrength: 0.8,
      emissiveBoost: 0.2,
    });

    for (let i = 0; i < PROJECTILE_POOL_SIZE; i++) {
      const mesh = new THREE.Mesh(this.projectileGeometry, this.darkProjectileMaterial);
      addComicOutline(mesh, 0.05);
      mesh.visible = false;
      this.scene.add(mesh);
      this.projectiles.push({
        mesh,
        active: false,
        kind: 'dark',
        damage: 0,
        velocity: new THREE.Vector3(),
        life: 0,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Ciclo de oleadas
  // -------------------------------------------------------------------------

  /** Limpia la oleada anterior y despliega la composición de `waveNumber`. */
  startWave(waveNumber: number): void {
    this.clearEnemies();
    this.deactivateAllProjectiles();

    this.currentWave = waveNumber;
    this.waveTime = 0;

    const plan = getWavePlan(waveNumber);
    this.speedMult = plan.speedMult;

    const rng = makeRng(waveNumber * 7919 + 13);
    let spawnIndex = 0;

    for (const spawn of plan.spawns) {
      for (let i = 0; i < spawn.count; i++) {
        const archetype =
          spawn.archetype === 'basic_mix'
            ? BASIC_ARCHETYPES[spawnIndex % BASIC_ARCHETYPES.length]
            : spawn.archetype;
        this.spawnEnemy(archetype, spawnIndex, rng);
        spawnIndex++;
      }
    }
  }

  private upgradeSpawnedVisuals(archetype: EnemyArchetype): void {
    for (const enemy of this.enemies) {
      if (enemy.entity.archetype !== archetype || !enemy.entity.alive) continue;
      const internal = this.internals.get(enemy.id);
      if (!internal || internal.isGlb) continue;
      const glbVisual = instantiateEnemyVisual(archetype);
      if (!glbVisual) continue;

      const oldMesh = enemy.mesh;
      glbVisual.root.name = oldMesh.name;
      glbVisual.root.position.copy(oldMesh.position);
      glbVisual.root.quaternion.copy(oldMesh.quaternion);
      this.scene.remove(oldMesh);
      this.scene.add(glbVisual.root);

      internal.material?.dispose();
      internal.outlineMaterial?.dispose();

      let nextMat: THREE.ShaderMaterial | null = null;
      glbVisual.root.traverse((child) => {
        if ((child as THREE.Mesh).isMesh && !nextMat) {
          const m = (child as THREE.Mesh).material;
          if (m instanceof THREE.ShaderMaterial && m.uniforms.uEmissiveBoost) {
            nextMat = m;
          }
        }
      });

      enemy.mesh = glbVisual.root;
      enemy.position = glbVisual.root.position;
      enemy.entity.mesh = glbVisual.root;
      internal.material = nextMat;
      internal.outlineMaterial = null;
      internal.starCores = glbVisual.starCores;
      internal.mixer = glbVisual.mixer;
      internal.isGlb = true;
    }
  }

  private spawnEnemy(archetype: EnemyArchetype, index: number, rng: () => number): void {
    const stats = DOME_ENEMY_ARCHETYPES[archetype];
    const visual = this.visuals[archetype];
    const glbVisual = instantiateEnemyVisual(archetype);

    let mesh: THREE.Object3D;
    let material: THREE.ShaderMaterial | null = null;
    let outlineMaterial: THREE.ShaderMaterial | null = null;
    let starCores: THREE.Object3D[] = [];
    let mixer: THREE.AnimationMixer | undefined;

    if (glbVisual) {
      mesh = glbVisual.root;
      mesh.name = `waveEnemy_${this.currentWave}_${archetype}_${index}`;
      starCores = glbVisual.starCores;
      mixer = glbVisual.mixer;
      mesh.traverse((child) => {
        if ((child as THREE.Mesh).isMesh && !material) {
          const m = (child as THREE.Mesh).material;
          if (m instanceof THREE.ShaderMaterial && m.uniforms.uEmissiveBoost) {
            material = m;
          }
        }
      });
    } else {
      material = createComicCelMaterial(visual.color, {
        rimColor: visual.rim,
        rimStrength: 0.7,
        emissiveBoost: 0.0,
      });
      const fallbackMesh = new THREE.Mesh(visual.geometry, material);
      fallbackMesh.name = `waveEnemy_${this.currentWave}_${archetype}_${index}`;
      const outline = addComicOutline(fallbackMesh, visual.outlineThickness);
      outlineMaterial = outline.material as THREE.ShaderMaterial;

      // Estrella interior de prueba: núcleo brillante visible a través del cuerpo.
      const starMaterial = createComicCelMaterial(visual.starColor, {
        rimColor: visual.starColor,
        rimStrength: 1.0,
        emissiveBoost: 0.95,
      });
      const star = new THREE.Mesh(this.starGeometry, starMaterial);
      star.scale.setScalar(visual.starScale);
      fallbackMesh.add(star);
      starCores = [star];
      mesh = fallbackMesh;
    }

    // Posición de aparición: anillo distribuido + jitter determinista.
    const angle = (index / Math.max(1, this.enemies.length + 6)) * Math.PI * 2 + rng() * 1.2;
    const dist = 26 + rng() * 30;
    const homePos = new THREE.Vector3(
      Math.cos(angle) * dist,
      6 + rng() * 30,
      Math.sin(angle) * dist,
    );
    mesh.position.copy(homePos);
    this.scene.add(mesh);

    const entity = createDomeEnemyEntity(mesh.name, archetype, mesh, homePos);
    entity.evasive = EVASIVE_ARCHETYPES.has(archetype);

    const enemy: ManagedWaveEnemy = {
      id: mesh.name,
      mesh,
      position: mesh.position,
      velocity: new THREE.Vector3(),
      homePos,
      radius: stats.radius,
      evasive: entity.evasive,
      evadeCooldown: 0,
      hitFlash: 0,
      entity,
      phase: rng() * Math.PI * 2,
      dashTimer: 0,
      dashSign: index % 2 === 0 ? 1 : -1,
      attackTimer: 1.2 + rng() * 1.8,
    };

    this.enemies.push(enemy);
    this.internals.set(enemy.id, {
      enemy,
      material,
      outlineMaterial,
      starCores,
      mixer,
      isGlb: glbVisual !== null,
      spikeTimer: NECROZMA_SPIKES_OFF_SEC,
      chargeTimer: 0,
      chargeSpeed: 0,
      chargeDamage: 0,
      chargeDir: new THREE.Vector3(),
    });
  }

  // -------------------------------------------------------------------------
  // API pública
  // -------------------------------------------------------------------------

  getWaveInfo(): WaveInfo {
    const plan = getWavePlan(Math.max(1, this.currentWave));
    return {
      wave: this.currentWave,
      label: plan.label,
      floorMode: plan.floorMode,
      remaining: this.getActiveEnemies().length,
    };
  }

  getActiveEnemies(): ManagedWaveEnemy[] {
    return this.enemies.filter((e) => e.entity.alive);
  }

  /**
   * Impacto de patada/taladro de Nyx: knockback físico + flash, sincronizado
   * con la entidad de combate. Acepta cualquier `TestEnemySphere` (el
   * controller no necesita conocer `ManagedWaveEnemy`).
   */
  onHitEnemy(enemy: TestEnemySphere, hitDir: THREE.Vector3, isDrill: boolean, impactSpeed?: number): void {
    const internal = this.internals.get(enemy.id);
    if (!internal) {
      return;
    }
    const kineticMult = Math.max(0.6, Math.pow((impactSpeed ?? 16) / 14, 1.35));
    const baseKnockback = isDrill ? HIT_KNOCKBACK_DRILL : HIT_KNOCKBACK;
    internal.enemy.velocity.addScaledVector(hitDir, baseKnockback * kineticMult);
    internal.enemy.hitFlash = Math.min(1.8, kineticMult);
    internal.enemy.entity.hitFlash = internal.enemy.hitFlash;
    // Un golpe interrumpe la embestida en curso.
    internal.chargeTimer = 0;
  }

  /** Elimina un enemigo (escena + materiales + listas). Idempotente. */
  killEnemy(enemy: ManagedWaveEnemy): void {
    const internal = this.internals.get(enemy.id);
    if (!internal) {
      return;
    }
    enemy.entity.alive = false;
    enemy.entity.hp = 0;
    this.scene.remove(enemy.mesh);
    internal.material?.dispose();
    internal.outlineMaterial?.dispose();
    // Estrella interior: material propio por enemigo, geometría compartida.
    for (const child of enemy.mesh.children) {
      if (child instanceof THREE.Mesh) {
        (child.material as THREE.Material).dispose();
      }
    }
    this.internals.delete(enemy.id);
    const idx = this.enemies.indexOf(enemy);
    if (idx >= 0) {
      this.enemies.splice(idx, 1);
    }
  }

  /**
   * Update por frame: flotación, dashes evasivos, ataques (proyectiles
   * oscuros / tinta / embestidas), pinchos de Necrozma y proyectiles en vuelo.
   */
  update(
    dt: number,
    elapsed: number,
    playerPos: THREE.Vector3,
    lockedEnemy: TestEnemySphere | null,
    playerAttackTime: number,
    onPlayerHit: (damage: number) => void,
    onOctopusInk: () => void,
  ): { didEnemyEvadeDash: boolean } {
    let didEnemyEvadeDash = false;
    this.waveTime += dt;
    const lockedId = lockedEnemy?.id ?? null;

    // Copia: killEnemy puede mutar this.enemies durante el bucle.
    for (const enemy of [...this.enemies]) {
      const internal = this.internals.get(enemy.id);
      if (!internal) {
        continue;
      }
      // Limpieza defensiva: si el DomeCombatSystem ya lo mató, lo retiramos.
      if (!enemy.entity.alive) {
        this.killEnemy(enemy);
        continue;
      }

      enemy.evadeCooldown = Math.max(0, enemy.evadeCooldown - dt);
      enemy.entity.evadeCooldown = enemy.evadeCooldown;
      if (enemy.hitFlash > 0) {
        enemy.hitFlash = Math.max(0, enemy.hitFlash - dt * HIT_FLASH_DECAY);
        enemy.entity.hitFlash = enemy.hitFlash;
      }
      enemy.dashTimer = Math.max(0, enemy.dashTimer - dt);
      enemy.attackTimer -= dt;

      // Rotación continua de la estrella interior en 2 ejes + vibración de energía
      for (const star of internal.starCores) {
        star.rotation.y += dt * 2.8;
        star.rotation.x += dt * 2.0;
        star.position.set(
          Math.sin(elapsed * 29 + enemy.phase) * 0.035,
          Math.cos(elapsed * 34 + enemy.phase) * 0.035,
          Math.sin(elapsed * 23 + enemy.phase * 1.4) * 0.035,
        );
      }
      internal.mixer?.update(dt);

      // --- Dash evasivo: rompe el lock-in de los arquetipos escurridizos ---
      if (
        enemy.evasive &&
        enemy.id === lockedId &&
        enemy.evadeCooldown <= 0 &&
        (playerAttackTime >= EVADE_TRIGGER_ATTACK_TIME ||
          enemy.position.distanceTo(playerPos) < EVADE_TRIGGER_DISTANCE)
      ) {
        _toEnemy.subVectors(enemy.position, playerPos);
        const dist = _toEnemy.length();
        if (dist > 1e-4) {
          _toEnemy.divideScalar(dist);
          _perp.crossVectors(_toEnemy, _up);
          if (_perp.lengthSq() < 1e-4) {
            _perp.set(1, 0, 0);
          } else {
            _perp.normalize();
          }
          _perp.multiplyScalar(enemy.dashSign);
          enemy.dashSign = enemy.dashSign === 1 ? -1 : 1;

          enemy.velocity
            .copy(_perp)
            .multiplyScalar(EVASIVE_DASH_SPEED * this.speedMult)
            .addScaledVector(_up, EVASIVE_DASH_LIFT);
          enemy.dashTimer = EVASIVE_DASH_TIME;
          enemy.evadeCooldown = EVASIVE_COOLDOWN;
          enemy.hitFlash = Math.max(enemy.hitFlash, 0.35);
          didEnemyEvadeDash = true;
        }
      }

      // --- Comportamiento ofensivo por arquetipo ---
      this.updateEnemyBehavior(enemy, internal, dt, playerPos, onPlayerHit, onOctopusInk);

      // --- Flotación: bob + muelle hacia homePos (salvo dash/embestida) ---
      const bob = Math.sin(elapsed * FLOAT_BOB_SPEED + enemy.phase) * FLOAT_BOB_AMPLITUDE;
      _toHome.subVectors(enemy.homePos, enemy.position);
      const homeDist = _toHome.length();
      _toHome.y += bob * 0.35;

      if (internal.chargeTimer > 0) {
        // Embestida: velocidad constante hacia Nyx, sin freno ni muelle.
        enemy.velocity.copy(internal.chargeDir).multiplyScalar(internal.chargeSpeed);
        internal.chargeTimer = Math.max(0, internal.chargeTimer - dt);
      } else if (enemy.dashTimer <= 0) {
        enemy.velocity.addScaledVector(_toHome, FLOAT_SPRING * dt);
        if (homeDist > LEASH_RADIUS) {
          _toHome.normalize();
          enemy.velocity.addScaledVector(_toHome, HOME_PULL * dt);
        }
        _flat.set(enemy.position.x, 0, enemy.position.z);
        const flatDist = _flat.length();
        if (flatDist > DOME_KEEP_RADIUS) {
          _flat.normalize();
          enemy.velocity.addScaledVector(_flat, -DOME_KEEP_PULL * dt);
        }
        enemy.velocity.multiplyScalar(Math.exp(-FLOAT_DAMPING * dt));
      } else {
        enemy.velocity.multiplyScalar(Math.exp(-0.25 * dt));
      }

      enemy.position.addScaledVector(enemy.velocity, dt);
      enemy.entity.position.copy(enemy.position);
      enemy.entity.velocity.copy(enemy.velocity);

      // --- Flash de impacto + vibración de energía descontrolada + pinchos ---
      const flash = enemy.hitFlash;
      const baseScale = 1 + flash * HIT_FLASH_SCALE;
      enemy.mesh.scale.set(
        baseScale + Math.sin(elapsed * 27 + enemy.phase) * 0.026,
        baseScale + Math.cos(elapsed * 31 + enemy.phase) * 0.026,
        baseScale + Math.sin(elapsed * 24 + enemy.phase * 1.7) * 0.026,
      );
      let emissive = flash * HIT_FLASH_EMISSIVE;
      if (internal.material) {
        if (enemy.entity.spikesActive) {
          emissive += 0.5;
          internal.material.uniforms.uRimColor.value.setHex(NECROZMA_SPIKES_RIM);
        } else if (enemy.entity.archetype === 'prisma_necrozma') {
          internal.material.uniforms.uRimColor.value.setHex(NECROZMA_BASE_RIM);
        }
        internal.material.uniforms.uEmissiveBoost.value = emissive;
      }
    }

    this.updateProjectiles(dt, playerPos, onPlayerHit, onOctopusInk);

    return { didEnemyEvadeDash };
  }

  dispose(): void {
    this.unsubModelLoaded();
    this.clearEnemies();
    this.deactivateAllProjectiles();
    for (const projectile of this.projectiles) {
      this.scene.remove(projectile.mesh);
    }
    this.projectileGeometry.dispose();
    this.darkProjectileMaterial.dispose();
    this.inkProjectileMaterial.dispose();
    for (const visual of Object.values(this.visuals)) {
      visual.geometry.dispose();
    }
    this.starGeometry.dispose();
    this.projectiles.length = 0;
  }

  // -------------------------------------------------------------------------
  // Comportamiento ofensivo
  // -------------------------------------------------------------------------

  private updateEnemyBehavior(
    enemy: ManagedWaveEnemy,
    internal: EnemyInternal,
    dt: number,
    playerPos: THREE.Vector3,
    onPlayerHit: (damage: number) => void,
    onOctopusInk: () => void,
  ): void {
    const archetype = enemy.entity.archetype;

    // Prisma Necrozma: alterna pinchos periódicamente (repelen cuerpo a cuerpo).
    if (archetype === 'prisma_necrozma') {
      internal.spikeTimer -= dt;
      if (internal.spikeTimer <= 0) {
        const nextActive = !enemy.entity.spikesActive;
        enemy.entity.spikesActive = nextActive;
        internal.spikeTimer = nextActive ? NECROZMA_SPIKES_ON_SEC : NECROZMA_SPIKES_OFF_SEC;
      }
    }

    // Contacto de embestida en curso: daño a Nyx y fin de la carga.
    if (internal.chargeTimer > 0) {
      const dist = enemy.position.distanceTo(playerPos);
      if (dist < enemy.radius + CHARGE_CONTACT_PADDING) {
        onPlayerHit(internal.chargeDamage);
        internal.chargeTimer = 0;
        enemy.attackTimer = 3.2 / this.speedMult;
        // Rebote del propio enemigo tras embestir.
        enemy.velocity.copy(internal.chargeDir).multiplyScalar(-8);
      }
      return;
    }

    if (enemy.attackTimer > 0) {
      return;
    }

    const distToPlayer = enemy.position.distanceTo(playerPos);
    const mult = this.speedMult;

    switch (archetype) {
      case 'crab_gunner':
        // Torreta: dispara esferas oscuras lentas a distancia.
        this.fireProjectile(enemy, playerPos, 'dark', 8, 10 * mult);
        enemy.attackTimer = 2.8 / mult;
        break;

      case 'spiral_octopus':
        // Chorro de tinta: mancha la pantalla de Nyx al impactar.
        this.fireProjectile(enemy, playerPos, 'ink', 0, 8 * mult);
        enemy.attackTimer = 4.5 / mult;
        break;

      case 'ground_golem':
        // Rompesuelos: embiste si Nyx se acerca.
        if (distToPlayer < CHARGE_TRIGGER_DISTANCE) {
          this.startCharge(enemy, internal, playerPos, 17 * mult, 14);
          enemy.attackTimer = 3.5 / mult;
        } else {
          enemy.attackTimer = 0.5;
        }
        break;

      case 'giant_sparrow':
        // Élite: alterna picado (cerca) y esferas oscuras (lejos).
        if (distToPlayer < 20) {
          this.startCharge(enemy, internal, playerPos, 21 * mult, 12);
        } else {
          this.fireProjectile(enemy, playerPos, 'dark', 12, 12 * mult);
        }
        enemy.attackTimer = 3.2 / mult;
        break;

      case 'prisma_necrozma':
        // Élite: bombardeo prismático constante.
        this.fireProjectile(enemy, playerPos, 'dark', 10, 11 * mult);
        enemy.attackTimer = 2.4 / mult;
        break;

      case 'kronos_leviathan':
        // Boss: abanico de 3 esferas oscuras.
        this.fireProjectile(enemy, playerPos, 'dark', 9, 12 * mult, -0.22);
        this.fireProjectile(enemy, playerPos, 'dark', 9, 12 * mult);
        this.fireProjectile(enemy, playerPos, 'dark', 9, 12 * mult, 0.22);
        enemy.attackTimer = 2.0 / mult;
        break;

      case 'lightning_butterfly':
      case 'abyssal_cell':
      default:
        // Pasivos/escurridizos: sin ataque ofensivo propio.
        enemy.attackTimer = 1.0;
        break;
    }
  }

  private startCharge(
    enemy: ManagedWaveEnemy,
    internal: EnemyInternal,
    playerPos: THREE.Vector3,
    speed: number,
    damage: number,
  ): void {
    internal.chargeDir.subVectors(playerPos, enemy.position);
    if (internal.chargeDir.lengthSq() < 1e-4) {
      internal.chargeDir.set(0, 0, 1);
    } else {
      internal.chargeDir.normalize();
    }
    internal.chargeSpeed = speed;
    internal.chargeDamage = damage;
    internal.chargeTimer = 1.2;
    enemy.hitFlash = Math.max(enemy.hitFlash, 0.25);
  }

  private fireProjectile(
    enemy: ManagedWaveEnemy,
    playerPos: THREE.Vector3,
    kind: 'dark' | 'ink',
    damage: number,
    speed: number,
    spreadRad = 0,
  ): void {
    const projectile = this.projectiles.find((p) => !p.active);
    if (!projectile) {
      return;
    }
    _shotDir.subVectors(playerPos, enemy.position);
    if (_shotDir.lengthSq() < 1e-4) {
      _shotDir.set(0, 0, 1);
    } else {
      _shotDir.normalize();
    }
    if (spreadRad !== 0) {
      _perp.crossVectors(_shotDir, _up);
      if (_perp.lengthSq() < 1e-4) {
        _perp.set(1, 0, 0);
      } else {
        _perp.normalize();
      }
      _shotDir.addScaledVector(_perp, spreadRad).normalize();
    }

    projectile.active = true;
    projectile.kind = kind;
    projectile.damage = damage;
    projectile.life = PROJECTILE_LIFE_SEC;
    projectile.velocity.copy(_shotDir).multiplyScalar(speed);
    projectile.mesh.material = kind === 'ink' ? this.inkProjectileMaterial : this.darkProjectileMaterial;
    projectile.mesh.position.copy(enemy.position).addScaledVector(_shotDir, enemy.radius + 0.6);
    projectile.mesh.visible = true;
  }

  private updateProjectiles(
    dt: number,
    playerPos: THREE.Vector3,
    onPlayerHit: (damage: number) => void,
    onOctopusInk: () => void,
  ): void {
    for (const projectile of this.projectiles) {
      if (!projectile.active) {
        continue;
      }
      projectile.life -= dt;
      projectile.mesh.position.addScaledVector(projectile.velocity, dt);

      const hitPlayer =
        projectile.mesh.position.distanceTo(playerPos) <
        PROJECTILE_PLAYER_RADIUS + projectile.mesh.scale.x * 0.55;
      const outOfBounds = projectile.mesh.position.length() > PROJECTILE_BOUND_RADIUS;

      if (hitPlayer) {
        if (projectile.kind === 'ink') {
          onOctopusInk();
        } else {
          onPlayerHit(projectile.damage);
        }
        this.deactivateProjectile(projectile);
      } else if (projectile.life <= 0 || outOfBounds) {
        this.deactivateProjectile(projectile);
      }
    }
  }

  private deactivateProjectile(projectile: WaveProjectile): void {
    projectile.active = false;
    projectile.mesh.visible = false;
    projectile.life = 0;
  }

  private deactivateAllProjectiles(): void {
    for (const projectile of this.projectiles) {
      this.deactivateProjectile(projectile);
    }
  }

  private clearEnemies(): void {
    for (const enemy of [...this.enemies]) {
      this.killEnemy(enemy);
    }
    this.enemies.length = 0;
    this.internals.clear();
  }
}
