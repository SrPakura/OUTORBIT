import * as THREE from 'three';
import { createComicCelMaterial } from '@/game/render/toonMaterials';
import type { SlabCollider } from './domeTypes';
import type { ActiveSkillId } from './DomeProgression';

// ============================================================================
// DomeSkills — Ejecutor 3D de las 7 habilidades activas de la Cúpula.
//
// Gestiona proyectiles, ondas expansivas, pozos de atracción y singularidades
// activas en la escena. La interfaz `SkillTargetEnemy` es estructuralmente
// compatible con `TestEnemySphere` y futuros enemigos (id, position, velocity,
// radius, mesh).
// ============================================================================

export interface SkillTargetEnemy {
  id: string;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  radius: number;
  mesh: THREE.Object3D;
}

export type DamageEnemyFn = (
  enemy: SkillTargetEnemy,
  amount: number,
  impulse: THREE.Vector3,
  bypassFlesh?: boolean
) => void;

export type SkillAnimOverride =
  | 'stasis_cast'
  | 'stasis_throw'
  | 'counter_parry'
  | 'eden_absorb'
  | 'air_dash';

export interface SkillTriggerContext {
  playerPos: THREE.Vector3;
  forwardDir: THREE.Vector3;
  isGrounded: boolean;
  isStill: boolean;
  lockedEnemy: SkillTargetEnemy | null;
  enemies: SkillTargetEnemy[];
  slabs: SlabCollider[];
  onDamageEnemy: DamageEnemyFn;
  onHealPlayer: (hp: number, eden: number) => void;
}

export interface SkillTriggerResult {
  triggered: boolean;
  animOverride?: SkillAnimOverride;
}

// --- Ajustes de gameplay ---
const IMPLOSION_RANGE = 35;
const IMPLOSION_DAMAGE = 9999;
const GRAVITY_FIELD_RELEASE_RANGE = 60;
const DOME_KEEP_RADIUS = 86;
const BLACK_HOLE_DURATION = 4.5;
const BLACK_HOLE_SPEED = 7;
const BLACK_HOLE_TICK = 0.5;
const ATTRACTION_DURATION = 1.8;
const CRUSH_CONTACT_DISTANCE = 2.4;

// --- Scratch a nivel de módulo: sin allocations por frame ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function nearestEnemy(
  from: THREE.Vector3,
  enemies: SkillTargetEnemy[],
  maxDist: number
): SkillTargetEnemy | null {
  let best: SkillTargetEnemy | null = null;
  let bestDist = maxDist;
  for (const enemy of enemies) {
    const d = from.distanceTo(enemy.position);
    if (d <= bestDist) {
      best = enemy;
      bestDist = d;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Estados internos de los efectos activos
// ---------------------------------------------------------------------------

interface OrbitFragment {
  mesh: THREE.Mesh;
  angle: number;
  angularSpeed: number;
  dist: number;
  height: number;
  spinAxis: THREE.Vector3;
}

interface GravityFieldState {
  anchor: THREE.Vector3;
  forwardDir: THREE.Vector3;
  fragments: OrbitFragment[];
  level: number;
}

interface ProjectileState {
  mesh: THREE.Mesh;
  /** Material clonado a desechar al expirar (null si es compartido). */
  material: THREE.MeshBasicMaterial | null;
  velocity: THREE.Vector3;
  remainingLife: number;
  damage: number;
  hitRadius: number;
  homingTarget: SkillTargetEnemy | null;
  homingStrength: number;
  hitIds: Set<string>;
  pierce: boolean;
  orientToVelocity: boolean;
}

interface ExpandingWave {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  elapsed: number;
  duration: number;
  maxRadius: number;
  baseOpacity: number;
}

type AttractionWellState =
  | {
      mode: 'enemy_pair';
      level: number;
      timer: number;
      link: THREE.Mesh;
      linkMaterial: THREE.MeshBasicMaterial;
      enemyA: SkillTargetEnemy;
      enemyB: SkillTargetEnemy;
    }
  | {
      mode: 'slab_crush';
      level: number;
      timer: number;
      link: THREE.Mesh;
      linkMaterial: THREE.MeshBasicMaterial;
      crushTarget: SkillTargetEnemy;
      slabA: SlabCollider;
      slabB: SlabCollider;
      crushedA: boolean;
      crushedB: boolean;
    };

interface BlackHoleState {
  group: THREE.Group;
  core: THREE.Mesh;
  ring: THREE.Mesh;
  velocity: THREE.Vector3;
  timer: number;
  radius: number;
  level: number;
  damageTickTimer: number;
  elapsed: number;
}

interface FadingVfx {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  elapsed: number;
  duration: number;
}

// ---------------------------------------------------------------------------
// DomeSkillExecutor
// ---------------------------------------------------------------------------

export class DomeSkillExecutor {
  private readonly scene: THREE.Scene;

  private readonly projectiles: ProjectileState[] = [];
  private readonly waves: ExpandingWave[] = [];
  private readonly wells: AttractionWellState[] = [];
  private readonly blackHoles: BlackHoleState[] = [];
  private readonly implosions: FadingVfx[] = [];
  private readonly halos: FadingVfx[] = [];
  private gravityField: GravityFieldState | null = null;

  // --- Geometrías compartidas ---
  private readonly fragGeometry = new THREE.DodecahedronGeometry(0.34, 0);
  private readonly waveGeometry = new THREE.SphereGeometry(1, 20, 14);
  private readonly sliceGeometry = new THREE.TorusGeometry(0.95, 0.07, 8, 36);
  private readonly coreGeometry = new THREE.SphereGeometry(1.05, 20, 16);
  private readonly ringGeometry = new THREE.TorusGeometry(2.1, 0.2, 8, 42);
  private readonly linkGeometry = new THREE.CylinderGeometry(0.05, 0.05, 1, 6, 1, true);
  private readonly haloGeometry = new THREE.TorusGeometry(1.15, 0.06, 8, 42);
  private readonly flashGeometry = new THREE.SphereGeometry(1, 16, 12);

  // --- Materiales compartidos (los que se desvanecen se clonan por instancia) ---
  private readonly rockMaterial = createComicCelMaterial(0x8a93b8, {
    rimColor: 0x9db8ff,
    emissiveBoost: 0.18,
  });
  private readonly waveMaterial = new THREE.MeshBasicMaterial({
    color: 0x7ae8dc,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  private readonly sliceMaterial = new THREE.MeshBasicMaterial({
    color: 0xdf9fff,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  private readonly coreMaterial = new THREE.MeshBasicMaterial({ color: 0x05030f });
  private readonly accretionMaterial = new THREE.MeshBasicMaterial({
    color: 0xdf9fff,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  private readonly linkMaterial = new THREE.MeshBasicMaterial({
    color: 0x42bde8,
    transparent: true,
    opacity: 0.7,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  private readonly haloMaterial = new THREE.MeshBasicMaterial({
    color: 0x7dffa8,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  private readonly flashMaterial = new THREE.MeshBasicMaterial({
    color: 0xffd992,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  private readonly implosionMaterial = new THREE.MeshBasicMaterial({
    color: 0xdf9fff,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  // ------------------------------------------------------------------
  // Disparo de habilidades
  // ------------------------------------------------------------------

  triggerSkill(skillId: ActiveSkillId, skillLevel: number, ctx: SkillTriggerContext): SkillTriggerResult {
    switch (skillId) {
      case 'gravity_field':
        return this.triggerGravityField(skillLevel, ctx);
      case 'repulse_push':
        return this.triggerRepulsePush(skillLevel, ctx);
      case 'eden_absorb':
        return this.triggerEdenAbsorb(skillLevel, ctx);
      case 'attraction_well':
        return this.triggerAttractionWell(skillLevel, ctx);
      case 'bounce_horizon':
        return this.triggerBounceHorizon(skillLevel, ctx);
      case 'black_hole':
        return this.triggerBlackHole(skillLevel, ctx);
      case 'implosion':
        return this.triggerImplosion(ctx);
    }
  }

  /**
   * Campo Gravitacional: 1ª pulsación captura `1 + skillLevel` fragmentos de
   * roca cósmica orbitando frente a Nyx; 2ª pulsación (o esta función) los
   * lanza contra el objetivo.
   */
  private triggerGravityField(level: number, ctx: SkillTriggerContext): SkillTriggerResult {
    if (this.gravityField !== null) {
      const target =
        ctx.lockedEnemy ??
        nearestEnemy(ctx.playerPos, ctx.enemies, GRAVITY_FIELD_RELEASE_RANGE);
      const targetPos =
        target !== null
          ? target.position
          : _v1.copy(ctx.playerPos).addScaledVector(ctx.forwardDir, 30).clone();
      this.releaseGravityField(targetPos);
      return { triggered: true, animOverride: 'stasis_throw' };
    }

    const count = 1 + level;
    const anchor = ctx.playerPos.clone().addScaledVector(ctx.forwardDir, 2.4);
    const fragments: OrbitFragment[] = [];
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(this.fragGeometry, this.rockMaterial);
      mesh.scale.setScalar(0.7 + Math.random() * 0.6 + level * 0.08);
      this.scene.add(mesh);
      fragments.push({
        mesh,
        angle: (i / count) * Math.PI * 2,
        angularSpeed: 2.2 + Math.random() * 0.8,
        dist: 1.6 + Math.random() * 0.8,
        height: (Math.random() - 0.5) * 1.2,
        spinAxis: new THREE.Vector3(
          Math.random() - 0.5,
          Math.random() - 0.5,
          Math.random() - 0.5
        ).normalize(),
      });
    }
    this.gravityField = {
      anchor,
      forwardDir: ctx.forwardDir.clone().normalize(),
      fragments,
      level,
    };
    return { triggered: true, animOverride: 'stasis_cast' };
  }

  /** Lanza los fragmentos en estasis contra `targetPos` (o hacia delante). */
  releaseGravityField(targetPos?: THREE.Vector3): void {
    const gf = this.gravityField;
    if (gf === null) return;
    this.gravityField = null;

    const target =
      targetPos ?? _v1.copy(gf.anchor).addScaledVector(gf.forwardDir, 30).clone();
    const speed = 26 + gf.level * 7;
    const damage = 7 + gf.level * 4;

    for (const fragment of gf.fragments) {
      _v2.subVectors(target, fragment.mesh.position);
      if (_v2.lengthSq() < 1e-6) _v2.copy(gf.forwardDir);
      _v2.normalize();
      this.projectiles.push({
        mesh: fragment.mesh,
        material: null,
        velocity: _v2.clone().multiplyScalar(speed),
        remainingLife: 3,
        damage,
        hitRadius: 0.6,
        homingTarget: null,
        homingStrength: 0,
        hitIds: new Set<string>(),
        pierce: false,
        orientToVelocity: false,
      });
    }
  }

  /** Empuje: pulso repulsor radial + onda esférica expansiva. */
  private triggerRepulsePush(level: number, ctx: SkillTriggerContext): SkillTriggerResult {
    const radius = 9 + level * 3;
    const force = 16 + level * 7;
    const damage = 4 + level * 3;

    for (const enemy of ctx.enemies) {
      _v1.subVectors(enemy.position, ctx.playerPos);
      const dist = _v1.length();
      if (dist > radius || dist < 1e-4) continue;
      _v1.divideScalar(dist).multiplyScalar(force);
      _v1.y += force * 0.25;
      ctx.onDamageEnemy(enemy, damage, _v1.clone());
    }

    // El propio suelo flotante también se aleja... si no estás apoyada en él.
    if (!ctx.isGrounded) {
      for (const slab of ctx.slabs) {
        _v1.subVectors(slab.center, ctx.playerPos);
        const dist = _v1.length();
        if (dist > radius + 2 || dist < 1e-4) continue;
        _v1.divideScalar(dist).multiplyScalar(force * 0.12);
        slab.basePos.add(_v1);
        if (slab.basePos.length() > DOME_KEEP_RADIUS) {
          slab.basePos.setLength(DOME_KEEP_RADIUS);
        }
      }
    }

    this.spawnExpandingWave(ctx.playerPos, radius + 2.5, 0.55, this.waveMaterial);
    return { triggered: true, animOverride: 'counter_parry' };
  }

  /** Absorción de Edén: canalización quieta que cura Vida y Edén. */
  private triggerEdenAbsorb(level: number, ctx: SkillTriggerContext): SkillTriggerResult {
    if (!ctx.isStill) return { triggered: false };
    const hp = 5 + level * 4;
    const eden = 8 + level * 5;
    ctx.onHealPlayer(hp, eden);
    this.spawnHalo(ctx.playerPos);
    return { triggered: true, animOverride: 'eden_absorb' };
  }

  /** Pozo de Atracción: enlaza 2 enemigos (o 2 slabs contra 1 enemigo). */
  private triggerAttractionWell(level: number, ctx: SkillTriggerContext): SkillTriggerResult {
    const range = 22 + level * 6;
    const candidates = ctx.enemies
      .filter((enemy) => enemy.position.distanceTo(ctx.playerPos) <= range)
      .sort(
        (a, b) => a.position.distanceTo(ctx.playerPos) - b.position.distanceTo(ctx.playerPos)
      );

    if (candidates.length >= 2) {
      const link = new THREE.Mesh(this.linkGeometry, this.linkMaterial.clone());
      this.scene.add(link);
      this.wells.push({
        mode: 'enemy_pair',
        level,
        timer: ATTRACTION_DURATION,
        link,
        linkMaterial: link.material as THREE.MeshBasicMaterial,
        enemyA: candidates[0],
        enemyB: candidates[1],
      });
      return { triggered: true, animOverride: 'stasis_cast' };
    }

    // Con 1 enemigo a rango: aplastamiento con los 2 slabs más cercanos.
    if (candidates.length === 1) {
      const slabs = ctx.slabs
        .filter((slab) => slab.center.distanceTo(ctx.playerPos) <= range + 10)
        .sort(
          (a, b) => a.center.distanceTo(ctx.playerPos) - b.center.distanceTo(ctx.playerPos)
        )
        .slice(0, 2);
      if (slabs.length === 2) {
        const link = new THREE.Mesh(this.linkGeometry, this.linkMaterial.clone());
        this.scene.add(link);
        this.wells.push({
          mode: 'slab_crush',
          level,
          timer: ATTRACTION_DURATION,
          link,
          linkMaterial: link.material as THREE.MeshBasicMaterial,
          crushTarget: candidates[0],
          slabA: slabs[0],
          slabB: slabs[1],
          crushedA: false,
          crushedB: false,
        });
        return { triggered: true, animOverride: 'stasis_cast' };
      }
    }

    return { triggered: false };
  }

  /** Horizonte de Rebote: `skillLevel` ondas cortantes en arco (homing Nv2+). */
  private triggerBounceHorizon(level: number, ctx: SkillTriggerContext): SkillTriggerResult {
    const count = Math.max(1, level);
    const speed = 40;
    const damage = 7 + level * 3;
    const homingStrength = level >= 2 && ctx.lockedEnemy !== null ? 2.4 : 0;

    for (let i = 0; i < count; i++) {
      const spread = (i - (count - 1) / 2) * THREE.MathUtils.degToRad(14);
      _v1.copy(ctx.forwardDir).applyAxisAngle(UP, spread).normalize();
      const material = this.sliceMaterial.clone();
      const mesh = new THREE.Mesh(this.sliceGeometry, material);
      mesh.position.copy(ctx.playerPos).addScaledVector(_v1, 1.2);
      mesh.lookAt(_v2.copy(mesh.position).add(_v1));
      this.scene.add(mesh);
      this.projectiles.push({
        mesh,
        material,
        velocity: _v1.clone().multiplyScalar(speed),
        remainingLife: 2.2,
        damage,
        hitRadius: 1.1,
        homingTarget: homingStrength > 0 ? ctx.lockedEnemy : null,
        homingStrength,
        hitIds: new Set<string>(),
        pierce: true,
        orientToVelocity: true,
      });
    }
    return { triggered: true, animOverride: 'air_dash' };
  }

  /** Agujero Negro: singularidad lenta con disco de acreción (4.5 s). */
  private triggerBlackHole(level: number, ctx: SkillTriggerContext): SkillTriggerResult {
    const group = new THREE.Group();
    const core = new THREE.Mesh(this.coreGeometry, this.coreMaterial);
    const ring = new THREE.Mesh(this.ringGeometry, this.accretionMaterial);
    ring.rotation.x = Math.PI / 2.4;
    group.add(core);
    group.add(ring);
    group.position.copy(ctx.playerPos).addScaledVector(ctx.forwardDir, 1.5);
    this.scene.add(group);

    this.blackHoles.push({
      group,
      core,
      ring,
      velocity: ctx.forwardDir.clone().normalize().multiplyScalar(BLACK_HOLE_SPEED),
      timer: BLACK_HOLE_DURATION,
      radius: 8 + level * 2.5,
      level,
      damageTickTimer: 0,
      elapsed: 0,
    });
    return { triggered: true, animOverride: 'stasis_throw' };
  }

  /** Implosión: colapso instantáneo y letal sobre el objetivo. */
  private triggerImplosion(ctx: SkillTriggerContext): SkillTriggerResult {
    const target =
      ctx.lockedEnemy ?? nearestEnemy(ctx.playerPos, ctx.enemies, IMPLOSION_RANGE);
    if (target === null) return { triggered: false };

    this.spawnImplosion(target.position);
    ctx.onDamageEnemy(target, IMPLOSION_DAMAGE, new THREE.Vector3(0, 0, 0), true);
    return { triggered: true, animOverride: 'eden_absorb' };
  }

  // ------------------------------------------------------------------
  // Actualización por frame
  // ------------------------------------------------------------------

  update(dt: number, enemies: SkillTargetEnemy[], onDamageEnemy: DamageEnemyFn): void {
    this.updateGravityField(dt);
    this.updateProjectiles(dt, enemies, onDamageEnemy);
    this.updateWaves(dt);
    this.updateWells(dt, enemies, onDamageEnemy);
    this.updateBlackHoles(dt, enemies, onDamageEnemy);
    this.updateFadingVfx(this.implosions, dt);
    this.updateFadingVfx(this.halos, dt);
  }

  private updateGravityField(dt: number): void {
    const gf = this.gravityField;
    if (gf === null) return;
    for (const fragment of gf.fragments) {
      fragment.angle += fragment.angularSpeed * dt;
      fragment.mesh.position.set(
        gf.anchor.x + Math.cos(fragment.angle) * fragment.dist,
        gf.anchor.y + fragment.height + Math.sin(fragment.angle * 2) * 0.25,
        gf.anchor.z + Math.sin(fragment.angle) * fragment.dist
      );
      fragment.mesh.rotateOnAxis(fragment.spinAxis, dt * 2.5);
    }
  }

  private updateProjectiles(
    dt: number,
    enemies: SkillTargetEnemy[],
    onDamageEnemy: DamageEnemyFn
  ): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.remainingLife -= dt;

      // Homing suave hacia el objetivo bloqueado (Horizonte de Rebote Nv2+).
      if (p.homingTarget !== null && p.homingStrength > 0) {
        _v1.subVectors(p.homingTarget.position, p.mesh.position);
        if (_v1.lengthSq() > 1e-6) {
          const speed = p.velocity.length();
          _v1.normalize();
          p.velocity
            .addScaledVector(_v1, speed * p.homingStrength * dt)
            .normalize()
            .multiplyScalar(speed);
        }
      }

      p.mesh.position.addScaledVector(p.velocity, dt);
      if (p.orientToVelocity) {
        p.mesh.lookAt(_v2.copy(p.mesh.position).add(p.velocity));
      }

      let killed = false;
      for (const enemy of enemies) {
        if (p.hitIds.has(enemy.id)) continue;
        if (p.mesh.position.distanceTo(enemy.position) <= enemy.radius + p.hitRadius) {
          p.hitIds.add(enemy.id);
          const impulse = _v3.copy(p.velocity).normalize().multiplyScalar(9).clone();
          onDamageEnemy(enemy, p.damage, impulse);
          if (!p.pierce) {
            killed = true;
            break;
          }
        }
      }

      if (killed || p.remainingLife <= 0) {
        this.scene.remove(p.mesh);
        if (p.material !== null) p.material.dispose();
        this.projectiles.splice(i, 1);
      }
    }
  }

  private updateWaves(dt: number): void {
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const wave = this.waves[i];
      wave.elapsed += dt;
      const t = Math.min(1, wave.elapsed / wave.duration);
      // easeOutCubic para un frente expansivo que frena al final.
      const eased = 1 - Math.pow(1 - t, 3);
      wave.mesh.scale.setScalar(Math.max(0.01, wave.maxRadius * eased));
      wave.material.opacity = wave.baseOpacity * (1 - t);
      if (t >= 1) {
        this.scene.remove(wave.mesh);
        wave.material.dispose();
        this.waves.splice(i, 1);
      }
    }
  }

  private updateWells(
    dt: number,
    enemies: SkillTargetEnemy[],
    onDamageEnemy: DamageEnemyFn
  ): void {
    if (this.wells.length === 0) return;
    const aliveIds = new Set(enemies.map((enemy) => enemy.id));

    for (let i = this.wells.length - 1; i >= 0; i--) {
      const well = this.wells[i];
      well.timer -= dt;
      let done = well.timer <= 0;

      if (well.mode === 'enemy_pair') {
        if (!aliveIds.has(well.enemyA.id) || !aliveIds.has(well.enemyB.id)) {
          done = true;
        } else {
          const pullAccel = 30 + well.level * 10;
          _v1.addVectors(well.enemyA.position, well.enemyB.position).multiplyScalar(0.5);
          this.pullEnemy(well.enemyA, _v1, pullAccel, dt);
          this.pullEnemy(well.enemyB, _v1, pullAccel, dt);
          this.orientLink(well.link, well.enemyA.position, well.enemyB.position);

          const dist = well.enemyA.position.distanceTo(well.enemyB.position);
          if (dist <= well.enemyA.radius + well.enemyB.radius + 0.6) {
            const damage = 10 + well.level * 5;
            onDamageEnemy(
              well.enemyA,
              damage,
              _v2.subVectors(well.enemyB.position, well.enemyA.position)
                .normalize()
                .multiplyScalar(10)
                .clone()
            );
            onDamageEnemy(
              well.enemyB,
              damage,
              _v2.subVectors(well.enemyA.position, well.enemyB.position)
                .normalize()
                .multiplyScalar(10)
                .clone()
            );
            _v3.addVectors(well.enemyA.position, well.enemyB.position).multiplyScalar(0.5);
            this.spawnExpandingWave(_v3, 3, 0.35, this.flashMaterial);
            done = true;
          }
        }
      } else {
        if (!aliveIds.has(well.crushTarget.id)) {
          done = true;
        } else {
          const crushSpeed = 5 + well.level * 1.5;
          this.moveSlabToward(well.slabA, well.crushTarget.position, crushSpeed, dt);
          this.moveSlabToward(well.slabB, well.crushTarget.position, crushSpeed, dt);
          this.orientLink(well.link, well.slabA.center, well.slabB.center);

          const damage = 12 + well.level * 6;
          if (
            !well.crushedA &&
            well.slabA.center.distanceTo(well.crushTarget.position) <=
              well.crushTarget.radius + CRUSH_CONTACT_DISTANCE
          ) {
            well.crushedA = true;
            onDamageEnemy(
              well.crushTarget,
              damage,
              _v2.subVectors(well.slabA.center, well.crushTarget.position)
                .normalize()
                .multiplyScalar(8)
                .clone()
            );
            this.spawnExpandingWave(well.crushTarget.position, 2.5, 0.3, this.flashMaterial);
          }
          if (
            !well.crushedB &&
            well.slabB.center.distanceTo(well.crushTarget.position) <=
              well.crushTarget.radius + CRUSH_CONTACT_DISTANCE
          ) {
            well.crushedB = true;
            onDamageEnemy(
              well.crushTarget,
              damage,
              _v2.subVectors(well.slabB.center, well.crushTarget.position)
                .normalize()
                .multiplyScalar(8)
                .clone()
            );
            this.spawnExpandingWave(well.crushTarget.position, 2.5, 0.3, this.flashMaterial);
          }
          if (well.crushedA && well.crushedB) done = true;
        }
      }

      if (done) {
        this.scene.remove(well.link);
        well.linkMaterial.dispose();
        this.wells.splice(i, 1);
      }
    }
  }

  private updateBlackHoles(
    dt: number,
    enemies: SkillTargetEnemy[],
    onDamageEnemy: DamageEnemyFn
  ): void {
    for (let i = this.blackHoles.length - 1; i >= 0; i--) {
      const bh = this.blackHoles[i];
      bh.timer -= dt;
      bh.elapsed += dt;
      bh.group.position.addScaledVector(bh.velocity, dt);

      // Disco de acreción: bamboleo + pulso de escala del horizonte.
      bh.ring.rotation.x = Math.PI / 2.4 + Math.sin(bh.elapsed * 3.0) * 0.18;
      bh.ring.rotation.z += dt * 2.4;
      const horizonPulse = 1 + Math.sin(bh.elapsed * 5.0) * 0.08;
      bh.core.scale.setScalar(horizonPulse);

      // Succión gravitatoria dentro del horizonte de sucesos.
      for (const enemy of enemies) {
        _v1.subVectors(bh.group.position, enemy.position);
        const dist = _v1.length();
        if (dist < bh.radius && dist > 1e-4) {
          const pull = (26 + bh.level * 9) * (1 - dist / bh.radius) + 6;
          enemy.velocity.addScaledVector(_v1.divideScalar(dist), pull * dt);
        }
      }

      // Daño periódico a todo lo que haya caído en el horizonte.
      bh.damageTickTimer -= dt;
      if (bh.damageTickTimer <= 0) {
        bh.damageTickTimer = BLACK_HOLE_TICK;
        for (const enemy of enemies) {
          if (enemy.position.distanceTo(bh.group.position) <= bh.radius) {
            onDamageEnemy(
              enemy,
              5 + bh.level * 2,
              _v2.subVectors(bh.group.position, enemy.position)
                .normalize()
                .multiplyScalar(6)
                .clone()
            );
          }
        }
      }

      if (bh.timer <= 0) {
        this.spawnExpandingWave(bh.group.position, bh.radius * 0.8, 0.45, this.flashMaterial);
        this.scene.remove(bh.group);
        this.blackHoles.splice(i, 1);
      }
    }
  }

  private updateFadingVfx(list: FadingVfx[], dt: number): void {
    for (let i = list.length - 1; i >= 0; i--) {
      const vfx = list[i];
      vfx.elapsed += dt;
      const t = Math.min(1, vfx.elapsed / vfx.duration);
      if (list === this.halos) {
        // Halo ascendente de la Absorción de Edén.
        vfx.mesh.position.y += dt * 1.2;
        vfx.mesh.rotation.y += dt * 2.0;
        vfx.mesh.scale.setScalar(1 + t * 0.6);
      } else {
        // Implosión: esfera que se comprime hacia dentro.
        vfx.mesh.scale.setScalar(Math.max(0.05, 3.5 * (1 - t) + 0.2));
      }
      vfx.material.opacity = 0.85 * (1 - t);
      if (t >= 1) {
        this.scene.remove(vfx.mesh);
        vfx.material.dispose();
        list.splice(i, 1);
      }
    }
  }

  // ------------------------------------------------------------------
  // Spawners de VFX
  // ------------------------------------------------------------------

  private spawnExpandingWave(
    position: THREE.Vector3,
    maxRadius: number,
    duration: number,
    baseMaterial: THREE.MeshBasicMaterial
  ): void {
    const material = baseMaterial.clone();
    const mesh = new THREE.Mesh(this.waveGeometry, material);
    mesh.position.copy(position);
    mesh.scale.setScalar(0.01);
    this.scene.add(mesh);
    this.waves.push({
      mesh,
      material,
      elapsed: 0,
      duration,
      maxRadius,
      baseOpacity: material.opacity,
    });
  }

  private spawnHalo(position: THREE.Vector3): void {
    const material = this.haloMaterial.clone();
    const mesh = new THREE.Mesh(this.haloGeometry, material);
    mesh.position.copy(position);
    mesh.rotation.x = Math.PI / 2;
    this.scene.add(mesh);
    this.halos.push({ mesh, material, elapsed: 0, duration: 1.2 });
  }

  private spawnImplosion(position: THREE.Vector3): void {
    const material = this.implosionMaterial.clone();
    const mesh = new THREE.Mesh(this.flashGeometry, material);
    mesh.position.copy(position);
    mesh.scale.setScalar(3.5);
    this.scene.add(mesh);
    this.implosions.push({ mesh, material, elapsed: 0, duration: 0.6 });
    // Destello dorado de colapso además de la compresión.
    this.spawnExpandingWave(position, 4, 0.35, this.flashMaterial);
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  private pullEnemy(
    enemy: SkillTargetEnemy,
    toward: THREE.Vector3,
    accel: number,
    dt: number
  ): void {
    _v3.subVectors(toward, enemy.position);
    if (_v3.lengthSq() < 1e-6) return;
    enemy.velocity.addScaledVector(_v3.normalize(), accel * dt);
  }

  private moveSlabToward(
    slab: SlabCollider,
    toward: THREE.Vector3,
    speed: number,
    dt: number
  ): void {
    _v3.subVectors(toward, slab.center);
    const dist = _v3.length();
    if (dist < 1e-4) return;
    const step = Math.min(speed * dt, dist);
    slab.basePos.addScaledVector(_v3.normalize(), step);
    if (slab.basePos.length() > DOME_KEEP_RADIUS) {
      slab.basePos.setLength(DOME_KEEP_RADIUS);
    }
  }

  /** Orienta el cilindro de enlace entre dos puntos (geometría unitaria en Y). */
  private orientLink(link: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3): void {
    _v1.addVectors(a, b).multiplyScalar(0.5);
    link.position.copy(_v1);
    _v2.subVectors(b, a);
    const len = _v2.length();
    link.scale.set(1, Math.max(len, 0.001), 1);
    if (len > 1e-4) {
      _v2.divideScalar(len);
      link.quaternion.setFromUnitVectors(UP, _v2);
    }
  }

  // ------------------------------------------------------------------
  // Limpieza
  // ------------------------------------------------------------------

  dispose(): void {
    if (this.gravityField !== null) {
      for (const fragment of this.gravityField.fragments) this.scene.remove(fragment.mesh);
      this.gravityField = null;
    }
    for (const p of this.projectiles) {
      this.scene.remove(p.mesh);
      if (p.material !== null) p.material.dispose();
    }
    this.projectiles.length = 0;
    for (const wave of this.waves) {
      this.scene.remove(wave.mesh);
      wave.material.dispose();
    }
    this.waves.length = 0;
    for (const well of this.wells) {
      this.scene.remove(well.link);
      well.linkMaterial.dispose();
    }
    this.wells.length = 0;
    for (const bh of this.blackHoles) this.scene.remove(bh.group);
    this.blackHoles.length = 0;
    for (const list of [this.implosions, this.halos]) {
      for (const vfx of list) {
        this.scene.remove(vfx.mesh);
        vfx.material.dispose();
      }
      list.length = 0;
    }

    this.fragGeometry.dispose();
    this.waveGeometry.dispose();
    this.sliceGeometry.dispose();
    this.coreGeometry.dispose();
    this.ringGeometry.dispose();
    this.linkGeometry.dispose();
    this.haloGeometry.dispose();
    this.flashGeometry.dispose();
    this.rockMaterial.dispose();
    this.waveMaterial.dispose();
    this.sliceMaterial.dispose();
    this.coreMaterial.dispose();
    this.accretionMaterial.dispose();
    this.linkMaterial.dispose();
    this.haloMaterial.dispose();
    this.flashMaterial.dispose();
    this.implosionMaterial.dispose();
  }
}
