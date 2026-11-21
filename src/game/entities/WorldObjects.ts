import * as THREE from 'three';
import type {
  EnemySpawnSpec,
  GrassZoneSpec,
  InteractableKind,
  LevelSpec,
  PlanetRuntime,
  WaterBubbleSpec,
  WorldObjectSpec,
} from '../types';
import { addComicOutline, createToonMaterial } from '../render/toonMaterials';
import { buildGuardModel } from '../render/proceduralModels';
import { findStrongestGravityPlanet } from '../math/spherical';

// ============================================================================
// Constantes de simulación de los objetos del mundo
// ============================================================================
const OBJ_GRAVITY = 16;
const THROW_SPEED = 36;
const EXPLOSION_RADIUS = 6.5;
const EXPLOSION_DURATION = 0.45;
const STASIS_GRAB_RANGE = 9;
const MELEE_RANGE = 3.0;
const KNOCKOUT_RANGE = 2.9;
const PARRY_RANGE = 4.4;
const GUARD_DETECT_RANGE = 15;
const GUARD_ATTACK_RANGE = 2.6;
const GUARD_WINDUP = 0.45;
const GUARD_ATTACK_CD = 1.5;
const GUARD_GIVEUP_DIST = 24;
const GUARD_PATROL_SPEED = 2.0;
const GUARD_CHASE_SPEED = 4.5;
const LASER_GATE_RADIUS = 3.0;
const LASER_GATE_CD = 1.3;
const GRASS_BLADES_PER_ZONE = 170;

const GRAB_STATE_IDLE = 0;
const GRAB_STATE_HELD = 1;
const GRAB_STATE_FLYING = 2;

const GUARD_STATE_PATROL = 0;
const GUARD_STATE_CHASE = 1;
const GUARD_STATE_WINDUP = 2;
const GUARD_STATE_KO = 3;

type GrabKind = 'rock' | 'barrel_explosive' | 'snowball' | 'crate';

const GRAB_RADIUS: Record<GrabKind, number> = {
  rock: 0.55,
  barrel_explosive: 0.55,
  snowball: 0.5,
  crate: 0.62,
};

// ============================================================================
// Temporales preasignados: CERO allocations dentro del loop de renderizado.
// ============================================================================
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _upAxis = new THREE.Vector3(0, 1, 0);
const _dummy = new THREE.Object3D();

// ============================================================================
// Estructuras internas (creadas solo al construir el nivel)
// ============================================================================
interface GrabObject {
  kind: GrabKind;
  mesh: THREE.Group;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  radius: number;
  state: number;
  spin: number;
}

interface GeneratorObj {
  mesh: THREE.Group;
  core: THREE.Mesh;
  coreMaterial: THREE.MeshBasicMaterial;
  pos: THREE.Vector3;
  planet: PlanetRuntime;
  hp: number;
  destroyed: boolean;
}

interface LaserGateObj {
  mesh: THREE.Group;
  planeMaterial: THREE.MeshBasicMaterial;
  pos: THREE.Vector3;
  planet: PlanetRuntime;
  cooldown: number;
  phase: number;
}

interface WaterBubbleObj {
  center: THREE.Vector3;
  radius: number;
  mesh: THREE.Group;
  phase: number;
}

interface GrassZoneObj {
  planetId: string;
  dir: THREE.Vector3;
  cosThreshold: number;
}

interface GuardObj {
  planet: PlanetRuntime;
  mesh: THREE.Group;
  pos: THREE.Vector3;
  dir: THREE.Vector3; // unit desde el centro del planeta
  forward: THREE.Vector3; // tangente de avance
  waypoints: THREE.Vector3[];
  waypointIdx: number;
  state: number;
  windupT: number;
  attackCd: number;
}

interface ExplosionFx {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  active: boolean;
  t: number;
  radius: number;
}

/** Estado del jugador que el mundo necesita cada frame (vectores preasignados). */
export interface WorldPlayerState {
  pos: THREE.Vector3;
  up: THREE.Vector3;
  forward: THREE.Vector3;
  disguised: boolean;
  inGrass: boolean;
  burrowing: boolean;
  swimming: boolean;
  parryActive: boolean;
  stealthMul: number;
}

export type PlayerDamageFn = (
  amount: number,
  pushX: number,
  pushY: number,
  pushZ: number
) => void;

// ============================================================================
// Builders de mallas (solo al construir el nivel)
// ============================================================================
function buildGrabMesh(kind: GrabKind): THREE.Group {
  const group = new THREE.Group();
  if (kind === 'rock') {
    const mesh = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.5, 0),
      createToonMaterial('#94a3b8')
    );
    addComicOutline(mesh, 0.014);
    mesh.position.y = 0.3;
    mesh.rotation.y = 0.6;
    group.add(mesh);
  } else if (kind === 'barrel_explosive') {
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.42, 1.0, 12),
      createToonMaterial('#dc2626')
    );
    addComicOutline(barrel, 0.014);
    barrel.position.y = 0.5;
    group.add(barrel);
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(0.44, 0.44, 0.18, 12),
      createToonMaterial('#facc15')
    );
    addComicOutline(band, 0.012);
    band.position.y = 0.5;
    group.add(band);
  } else if (kind === 'snowball') {
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 14, 10),
      createToonMaterial('#f8fafc')
    );
    addComicOutline(ball, 0.014);
    ball.position.y = 0.45;
    group.add(ball);
  } else {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.85, 0.85, 0.85),
      createToonMaterial('#b45309')
    );
    addComicOutline(box, 0.014);
    box.position.y = 0.45;
    group.add(box);
  }
  return group;
}

function buildGeneratorMesh(): { group: THREE.Group; core: THREE.Mesh } {
  const group = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 1.2, 1.2),
    createToonMaterial('#334155')
  );
  addComicOutline(base, 0.016);
  base.position.y = 0.6;
  group.add(base);
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xfbbf24 })
  );
  core.position.set(0, 1.35, 0);
  group.add(core);
  const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 1.1, 6),
    createToonMaterial('#64748b')
  );
  addComicOutline(antenna, 0.012);
  antenna.position.set(0.5, 1.7, 0);
  group.add(antenna);
  return { group, core };
}

function buildLaserGateMesh(): {
  group: THREE.Group;
  planeMaterial: THREE.MeshBasicMaterial;
} {
  const group = new THREE.Group();
  const postGeometry = new THREE.CylinderGeometry(0.18, 0.22, 3.2, 8);
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(postGeometry, createToonMaterial('#475569'));
    addComicOutline(post, 0.014);
    post.position.set(2.7 * side, 1.6, 0);
    group.add(post);
  }
  const planeMaterial = new THREE.MeshBasicMaterial({
    color: 0xf87171,
    transparent: true,
    opacity: 0.4,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const plane = new THREE.Mesh(new THREE.BoxGeometry(5.4, 3.0, 0.12), planeMaterial);
  plane.position.y = 1.6;
  group.add(plane);
  return { group, planeMaterial };
}

function buildBubbleMesh(radius: number): THREE.Group {
  const group = new THREE.Group();
  const waterMaterial = createToonMaterial('#7dd3fc');
  waterMaterial.transparent = true;
  waterMaterial.opacity = 0.24;
  waterMaterial.depthWrite = false;
  const water = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 24), waterMaterial);
  group.add(water);
  const rim = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.02, 32, 24),
    new THREE.MeshBasicMaterial({
      color: '#a5f3fc',
      transparent: true,
      opacity: 0.16,
      side: THREE.BackSide,
      depthWrite: false,
    })
  );
  group.add(rim);
  return group;
}

// ============================================================================
// Gestor de objetos interactivos del mundo esférico
// ============================================================================
export class WorldObjectsManager {
  private readonly group: THREE.Group;
  private readonly planets: PlanetRuntime[];
  private readonly grabs: GrabObject[] = [];
  private readonly generators: GeneratorObj[] = [];
  private readonly gates: LaserGateObj[] = [];
  private readonly bubbles: WaterBubbleObj[] = [];
  private readonly grassZones: GrassZoneObj[] = [];
  private readonly guards: GuardObj[] = [];
  private readonly explosions: ExplosionFx[] = [];
  private heldCount = 0;
  private clock = 0;

  generatorsDestroyed = 0;
  guardsKnockedOut = 0;

  constructor(group: THREE.Group, planets: PlanetRuntime[]) {
    this.group = group;
    this.planets = planets;
  }

  get held(): number {
    return this.heldCount;
  }

  // --------------------------------------------------------------------------
  // Construcción desde LevelSpec (allocaciones permitidas: fuera del loop)
  // --------------------------------------------------------------------------
  build(level: LevelSpec): void {
    for (const spec of level.objects) this.spawnObject(spec);
    for (const bubble of level.waterBubbles) this.spawnBubble(bubble);
    for (const zone of level.grassZones ?? []) this.spawnGrass(zone);
    for (const enemy of level.enemies) this.spawnEnemy(enemy);

    // Pool de explosiones / ondas expansivas (reutilizado, sin GC).
    for (let i = 0; i < 4; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xfb923c,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), material);
      mesh.visible = false;
      this.group.add(mesh);
      this.explosions.push({ mesh, material, active: false, t: 0, radius: 1 });
    }
  }

  private findPlanet(id: string): PlanetRuntime {
    const planet = this.planets.find((p) => p.spec.id === id);
    if (!planet) throw new Error(`WorldObjects: planeta desconocido "${id}"`);
    return planet;
  }

  private placeOnPlanet(
    mesh: THREE.Object3D,
    planet: PlanetRuntime,
    dirX: number,
    dirY: number,
    dirZ: number,
    altitudeOffset: number
  ): THREE.Vector3 {
    _v1.set(dirX, dirY, dirZ).normalize();
    mesh.position.copy(planet.centerVec).addScaledVector(_v1, planet.spec.radius + altitudeOffset);
    _q1.setFromUnitVectors(_upAxis, _v1);
    mesh.quaternion.copy(_q1);
    return mesh.position;
  }

  private spawnObject(spec: WorldObjectSpec): void {
    const planet = this.findPlanet(spec.planetId);
    const altitude = spec.altitudeOffset ?? 0;
    if (
      spec.kind === 'rock' ||
      spec.kind === 'barrel_explosive' ||
      spec.kind === 'snowball' ||
      spec.kind === 'crate'
    ) {
      const kind = spec.kind as GrabKind;
      const mesh = buildGrabMesh(kind);
      const pos = this.placeOnPlanet(mesh, planet, ...spec.sphericalDir, altitude);
      this.group.add(mesh);
      this.grabs.push({
        kind,
        mesh,
        pos: pos.clone(),
        vel: new THREE.Vector3(),
        radius: spec.radius ?? GRAB_RADIUS[kind],
        state: GRAB_STATE_IDLE,
        spin: 1.5 + (spec.id.length % 5) * 0.4,
      });
    } else if (spec.kind === 'generator') {
      const { group, core } = buildGeneratorMesh();
      const pos = this.placeOnPlanet(group, planet, ...spec.sphericalDir, altitude);
      this.group.add(group);
      this.generators.push({
        mesh: group,
        core,
        coreMaterial: core.material as THREE.MeshBasicMaterial,
        pos: pos.clone(),
        planet,
        hp: 2,
        destroyed: false,
      });
    } else if (spec.kind === 'laser_gate') {
      const { group, planeMaterial } = buildLaserGateMesh();
      const pos = this.placeOnPlanet(group, planet, ...spec.sphericalDir, altitude);
      this.group.add(group);
      this.gates.push({
        mesh: group,
        planeMaterial,
        pos: pos.clone(),
        planet,
        cooldown: 0,
        phase: spec.id.length * 1.3,
      });
    }
    // keycard / teleport_pipe / etc.: Hito 3+.
  }

  private spawnBubble(spec: WaterBubbleSpec): void {
    const mesh = buildBubbleMesh(spec.radius);
    mesh.position.set(...spec.center);
    this.group.add(mesh);
    this.bubbles.push({
      center: new THREE.Vector3(...spec.center),
      radius: spec.radius,
      mesh,
      phase: spec.id.length * 0.9,
    });
  }

  private spawnGrass(spec: GrassZoneSpec): void {
    const planet = this.findPlanet(spec.planetId);
    const center = new THREE.Vector3(...spec.sphericalDir).normalize();
    let t1 = new THREE.Vector3(0, 1, 0).cross(center);
    if (t1.lengthSq() < 1e-6) t1 = new THREE.Vector3(1, 0, 0).cross(center);
    t1.normalize();
    const t2 = new THREE.Vector3().crossVectors(center, t1).normalize();

    const bladeGeometry = new THREE.ConeGeometry(0.07, 1.1, 4);
    const bladeMaterial = createToonMaterial('#4ade80');
    const blades = new THREE.InstancedMesh(bladeGeometry, bladeMaterial, GRASS_BLADES_PER_ZONE);
    blades.name = `grass-${spec.id}`;
    const dir = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    for (let i = 0; i < GRASS_BLADES_PER_ZONE; i++) {
      const a = (i / GRASS_BLADES_PER_ZONE) * Math.PI * 2 * 3.7; // espiral determinista
      const r = spec.angularRadius * Math.sqrt((i % 17) / 17);
      dir
        .copy(center)
        .addScaledVector(t1, Math.cos(a) * r)
        .addScaledVector(t2, Math.sin(a) * r)
        .normalize();
      _dummy.position
        .copy(planet.centerVec)
        .addScaledVector(dir, planet.spec.radius + 0.5);
      quat.setFromUnitVectors(_upAxis, dir);
      _dummy.quaternion.copy(quat);
      _dummy.rotateY((i * 2.399) % (Math.PI * 2));
      const scale = 0.75 + ((i * 7) % 10) / 18;
      _dummy.scale.set(scale, scale * (0.9 + ((i * 3) % 5) / 10), scale);
      _dummy.updateMatrix();
      blades.setMatrixAt(i, _dummy.matrix);
    }
    blades.instanceMatrix.needsUpdate = true;
    this.group.add(blades);
    this.grassZones.push({
      planetId: spec.planetId,
      dir: center,
      cosThreshold: Math.cos(spec.angularRadius * 1.15),
    });
  }

  private spawnEnemy(spec: EnemySpawnSpec): void {
    if (spec.kind !== 'guard') return; // drones/torretas: Hito 3.
    const planet = this.findPlanet(spec.planetId);
    const mesh = buildGuardModel();
    const waypoints: THREE.Vector3[] = [];
    for (const dir of spec.patrolDirs) {
      waypoints.push(new THREE.Vector3(...dir).normalize());
    }
    if (waypoints.length === 0) return;
    const dir = waypoints[0];
    const pos = this.placeOnPlanet(mesh, planet, dir.x, dir.y, dir.z, 0);
    this.group.add(mesh);
    this.guards.push({
      planet,
      mesh,
      pos: pos.clone(),
      dir: dir.clone(),
      forward: new THREE.Vector3(0, 0, 1),
      waypoints,
      waypointIdx: 1 % waypoints.length,
      state: GUARD_STATE_PATROL,
      windupT: 0,
      attackCd: 0,
    });
  }

  // --------------------------------------------------------------------------
  // Consultas del mundo (usadas por PlayerController / GameEngine)
  // --------------------------------------------------------------------------
  getBubbleAt(pos: THREE.Vector3): WaterBubbleObj | null {
    for (const bubble of this.bubbles) {
      if (pos.distanceToSquared(bubble.center) < (bubble.radius - 0.6) ** 2) {
        return bubble;
      }
    }
    return null;
  }

  isInGrass(pos: THREE.Vector3, planet: PlanetRuntime): boolean {
    for (const zone of this.grassZones) {
      if (zone.planetId !== planet.spec.id) continue;
      _v1.copy(pos).sub(planet.centerVec);
      if (_v1.lengthSq() < 1e-6) continue;
      _v1.normalize();
      if (_v1.dot(zone.dir) > zone.cosThreshold) return true;
    }
    return false;
  }

  grabbableNear(pos: THREE.Vector3): boolean {
    for (const grab of this.grabs) {
      if (grab.state !== GRAB_STATE_IDLE) continue;
      if (grab.pos.distanceToSquared(pos) < STASIS_GRAB_RANGE * STASIS_GRAB_RANGE) return true;
    }
    return false;
  }

  knockoutTargetNear(pos: THREE.Vector3): boolean {
    for (const guard of this.guards) {
      if (guard.state === GUARD_STATE_KO) continue;
      if (guard.pos.distanceToSquared(pos) > KNOCKOUT_RANGE * KNOCKOUT_RANGE) continue;
      _v1.copy(pos).sub(guard.pos).normalize();
      if (guard.forward.dot(_v1) < -0.1) return true;
    }
    return false;
  }

  guardAttackingNear(pos: THREE.Vector3): boolean {
    for (const guard of this.guards) {
      if (guard.state !== GUARD_STATE_WINDUP) continue;
      if (guard.pos.distanceToSquared(pos) < (PARRY_RANGE + 1) ** 2) return true;
    }
    return false;
  }

  anyGuardInCombat(): boolean {
    for (const guard of this.guards) {
      if (guard.state === GUARD_STATE_CHASE || guard.state === GUARD_STATE_WINDUP) return true;
    }
    return false;
  }

  // --------------------------------------------------------------------------
  // Campo de Estasis
  // --------------------------------------------------------------------------
  grabNearest(pos: THREE.Vector3, forward: THREE.Vector3, range: number): void {
    let best: GrabObject | null = null;
    let bestDistSq = range * range;
    for (const grab of this.grabs) {
      if (grab.state !== GRAB_STATE_IDLE) continue;
      _v1.copy(grab.pos).sub(pos);
      const distSq = _v1.lengthSq();
      if (distSq > bestDistSq) continue;
      _v1.divideScalar(Math.max(Math.sqrt(distSq), 1e-6));
      if (_v1.dot(forward) < -0.25) continue; // acepta ligeramente detrás
      best = grab;
      bestDistSq = distSq;
    }
    if (best) {
      best.state = GRAB_STATE_HELD;
      this.heldCount++;
    }
  }

  /** Dispara los objetos en órbita en abanico hacia `aim`. Devuelve cuántos. */
  releaseThrow(aim: THREE.Vector3, up: THREE.Vector3): number {
    if (this.heldCount === 0) return 0;
    _v1.copy(aim).cross(up);
    if (_v1.lengthSq() < 1e-6) _v1.set(1, 0, 0);
    _v1.normalize();
    const total = this.heldCount;
    let n = 0;
    for (const grab of this.grabs) {
      if (grab.state !== GRAB_STATE_HELD) continue;
      grab.state = GRAB_STATE_FLYING;
      grab.vel
        .copy(aim)
        .multiplyScalar(THROW_SPEED)
        .addScaledVector(_v1, (n - (total - 1) / 2) * 2.2);
      n++;
    }
    this.heldCount = 0;
    return n;
  }

  /** Golpe cuerpo a cuerpo corto: noquea guardias / daña generadores. */
  meleeStrike(pos: THREE.Vector3, forward: THREE.Vector3): 'guard' | 'generator' | null {
    for (const guard of this.guards) {
      if (guard.state === GUARD_STATE_KO) continue;
      _v1.copy(guard.pos).sub(pos);
      const dist = _v1.length();
      if (dist > MELEE_RANGE) continue;
      _v1.divideScalar(Math.max(dist, 1e-6));
      if (_v1.dot(forward) < 0.15) continue;
      this.koGuard(guard);
      return 'guard';
    }
    for (const gen of this.generators) {
      if (gen.destroyed) continue;
      if (gen.pos.distanceToSquared(pos) < (MELEE_RANGE + 0.8) ** 2) {
        this.damageGenerator(gen, 1);
        return 'generator';
      }
    }
    return null;
  }

  /** Noqueo por la espalda (E): devuelve true si hubo noqueo (activa disfraz). */
  tryKnockoutBehind(pos: THREE.Vector3): boolean {
    for (const guard of this.guards) {
      if (guard.state === GUARD_STATE_KO) continue;
      if (guard.pos.distanceToSquared(pos) > KNOCKOUT_RANGE * KNOCKOUT_RANGE) continue;
      _v1.copy(pos).sub(guard.pos).normalize();
      if (guard.forward.dot(_v1) < -0.1) {
        this.koGuard(guard);
        return true;
      }
    }
    return false;
  }

  /** Parry: si un guardia está en windup dentro del rango, queda K.O. */
  checkParry(pos: THREE.Vector3): boolean {
    for (const guard of this.guards) {
      if (guard.state !== GUARD_STATE_WINDUP) continue;
      if (guard.pos.distanceToSquared(pos) > PARRY_RANGE * PARRY_RANGE) continue;
      this.koGuard(guard);
      return true;
    }
    return false;
  }

  /** Onda expansiva de Digger al aterrizar en Modo Júpiter. */
  shockwave(pos: THREE.Vector3, radius: number): void {
    this.spawnExplosion(pos, radius, 0x67e8f9);
    for (const guard of this.guards) {
      if (guard.state === GUARD_STATE_KO) continue;
      if (guard.pos.distanceToSquared(pos) < radius * radius) this.koGuard(guard);
    }
    for (const grab of this.grabs) {
      if (grab.state !== GRAB_STATE_IDLE) continue;
      _v1.copy(grab.pos).sub(pos);
      const dist = _v1.length();
      if (dist > radius + 2 || dist < 1e-6) continue;
      grab.state = GRAB_STATE_FLYING;
      grab.vel.copy(_v1.divideScalar(dist)).multiplyScalar(11);
    }
  }

  // --------------------------------------------------------------------------
  // Simulación por frame (cero allocations)
  // --------------------------------------------------------------------------
  update(dt: number, state: WorldPlayerState, onPlayerDamage: PlayerDamageFn): void {
    this.clock += dt;
    this.updateHeld(dt, state);
    this.updateFlying(dt, state, onPlayerDamage);
    this.updateGates(dt, state, onPlayerDamage);
    this.updateGuards(dt, state, onPlayerDamage);
    this.updateBubbles(dt);
    this.updateExplosions(dt);
  }

  private updateHeld(dt: number, state: WorldPlayerState): void {
    if (this.heldCount === 0) return;
    // Centro de órbita frente al personaje, a la altura del pecho.
    _v1.copy(state.pos).addScaledVector(state.up, 1.7).addScaledVector(state.forward, 2.2);
    _v2.copy(state.forward).cross(state.up);
    if (_v2.lengthSq() < 1e-6) _v2.set(1, 0, 0);
    _v2.normalize();
    const step = (Math.PI * 2) / this.heldCount;
    let idx = 0;
    for (const grab of this.grabs) {
      if (grab.state !== GRAB_STATE_HELD) continue;
      const angle = this.clock * 2.8 + idx * step;
      grab.pos
        .copy(_v1)
        .addScaledVector(_v2, Math.cos(angle) * 0.95)
        .addScaledVector(state.up, Math.sin(angle) * 0.95);
      grab.mesh.position.copy(grab.pos);
      grab.mesh.rotation.y += dt * 3;
      idx++;
    }
  }

  private updateFlying(
    dt: number,
    state: WorldPlayerState,
    onPlayerDamage: PlayerDamageFn
  ): void {
    for (const grab of this.grabs) {
      if (grab.state !== GRAB_STATE_FLYING) continue;
      const planet = findStrongestGravityPlanet(grab.pos, this.planets, null);
      _v1.copy(planet.centerVec).sub(grab.pos);
      const centerDist = _v1.length();
      if (centerDist > 1e-6) {
        _v1.divideScalar(centerDist);
        grab.vel.addScaledVector(_v1, OBJ_GRAVITY * dt);
      }
      grab.pos.addScaledVector(grab.vel, dt);
      grab.mesh.position.copy(grab.pos);
      grab.mesh.rotation.x += dt * grab.spin;
      grab.mesh.rotation.z += dt * grab.spin * 0.6;

      // Impacto contra guardias.
      let settled = false;
      for (const guard of this.guards) {
        if (guard.state === GUARD_STATE_KO) continue;
        if (grab.pos.distanceToSquared(guard.pos) < 3.6) {
          this.koGuard(guard);
          this.settleGrab(grab, planet);
          settled = true;
          break;
        }
      }
      if (settled) continue;

      // Impacto contra generadores (1 objeto lanzado los destruye).
      for (const gen of this.generators) {
        if (gen.destroyed) continue;
        if (grab.pos.distanceToSquared(gen.pos) < 5.6) {
          this.damageGenerator(gen, 2);
          this.settleGrab(grab, planet);
          settled = true;
          break;
        }
      }
      if (settled) continue;

      // Impacto contra el terreno.
      _v2.copy(grab.pos).sub(planet.centerVec);
      const surfaceDist = _v2.length();
      if (surfaceDist <= planet.spec.radius + grab.radius) {
        if (grab.kind === 'barrel_explosive') {
          this.explode(grab.pos, state, onPlayerDamage);
        }
        this.settleGrab(grab, planet);
      }
    }
  }

  private settleGrab(grab: GrabObject, planet: PlanetRuntime): void {
    grab.state = GRAB_STATE_IDLE;
    grab.vel.set(0, 0, 0);
    _v1.copy(grab.pos).sub(planet.centerVec);
    if (_v1.lengthSq() < 1e-6) _v1.set(0, 1, 0);
    _v1.normalize();
    grab.pos
      .copy(planet.centerVec)
      .addScaledVector(_v1, planet.spec.radius + grab.radius * 0.5);
    grab.mesh.position.copy(grab.pos);
    _q1.setFromUnitVectors(_upAxis, _v1);
    grab.mesh.quaternion.copy(_q1);
  }

  private explode(
    pos: THREE.Vector3,
    state: WorldPlayerState,
    onPlayerDamage: PlayerDamageFn
  ): void {
    this.spawnExplosion(pos, EXPLOSION_RADIUS, 0xfb923c);
    for (const guard of this.guards) {
      if (guard.state === GUARD_STATE_KO) continue;
      if (guard.pos.distanceToSquared(pos) < EXPLOSION_RADIUS * EXPLOSION_RADIUS) {
        this.koGuard(guard);
      }
    }
    for (const gen of this.generators) {
      if (gen.destroyed) continue;
      if (gen.pos.distanceToSquared(pos) < (EXPLOSION_RADIUS + 1) ** 2) {
        this.damageGenerator(gen, 2);
      }
    }
    for (const grab of this.grabs) {
      if (grab.state !== GRAB_STATE_IDLE) continue;
      _v1.copy(grab.pos).sub(pos);
      const dist = _v1.length();
      if (dist > EXPLOSION_RADIUS || dist < 1e-6) continue;
      grab.state = GRAB_STATE_FLYING;
      grab.vel.copy(_v1.divideScalar(dist)).multiplyScalar(9);
    }
    // Daño y empuje al jugador si está cerca.
    _v1.copy(state.pos).sub(pos);
    const dist = _v1.length();
    if (dist < EXPLOSION_RADIUS + 1 && dist > 1e-6) {
      _v1.divideScalar(dist).multiplyScalar(9).addScaledVector(state.up, 4);
      onPlayerDamage(1, _v1.x, _v1.y, _v1.z);
    }
  }

  private updateGates(
    dt: number,
    state: WorldPlayerState,
    onPlayerDamage: PlayerDamageFn
  ): void {
    for (const gate of this.gates) {
      gate.cooldown -= dt;
      gate.planeMaterial.opacity = 0.32 + Math.sin(this.clock * 7 + gate.phase) * 0.14;
      if (state.burrowing) continue; // Digger cruza por debajo excavando.
      _v1.copy(state.pos).sub(gate.pos);
      const dist = _v1.length();
      if (dist < LASER_GATE_RADIUS && gate.cooldown <= 0) {
        gate.cooldown = LASER_GATE_CD;
        _v1.divideScalar(Math.max(dist, 1e-6)).multiplyScalar(10).addScaledVector(state.up, 5);
        onPlayerDamage(1, _v1.x, _v1.y, _v1.z);
      }
    }
  }

  private updateGuards(
    dt: number,
    state: WorldPlayerState,
    onPlayerDamage: PlayerDamageFn
  ): void {
    const canSee =
      !state.disguised && !state.inGrass && !state.burrowing && !state.swimming;
    for (const guard of this.guards) {
      guard.attackCd -= dt;
      _v1.copy(state.pos).sub(guard.pos);
      const playerDist = _v1.length();

      if (guard.state !== GUARD_STATE_KO) {
        if (guard.state === GUARD_STATE_PATROL) {
          const target = guard.waypoints[guard.waypointIdx];
          this.moveGuardTowards(guard, target, GUARD_PATROL_SPEED, dt);
          if (guard.dir.angleTo(target) < 0.02) {
            guard.waypointIdx = (guard.waypointIdx + 1) % guard.waypoints.length;
          }
          const detectRange = GUARD_DETECT_RANGE * state.stealthMul;
          if (canSee && playerDist < detectRange) {
            // Recalcula: moveGuardTowards reutiliza los temporales del módulo.
            _v1.copy(state.pos).sub(guard.pos).divideScalar(Math.max(playerDist, 1e-6));
            if (guard.forward.dot(_v1) > 0.1) guard.state = GUARD_STATE_CHASE;
          }
        } else if (guard.state === GUARD_STATE_CHASE) {
          _v2.copy(state.pos).sub(guard.planet.centerVec).normalize();
          this.moveGuardTowards(guard, _v2, GUARD_CHASE_SPEED, dt);
          if (!canSee && playerDist > GUARD_GIVEUP_DIST) {
            guard.state = GUARD_STATE_PATROL;
          } else if (playerDist < GUARD_ATTACK_RANGE && guard.attackCd <= 0) {
            guard.state = GUARD_STATE_WINDUP;
            guard.windupT = GUARD_WINDUP;
          }
        } else if (guard.state === GUARD_STATE_WINDUP) {
          if (playerDist > GUARD_GIVEUP_DIST) {
            guard.state = GUARD_STATE_CHASE;
          }
          guard.windupT -= dt;
          if (guard.windupT <= 0) {
            guard.state = GUARD_STATE_CHASE;
            guard.attackCd = GUARD_ATTACK_CD;
            if (playerDist < GUARD_ATTACK_RANGE + 1.0) {
              _v1.divideScalar(Math.max(playerDist, 1e-6));
              _v1.multiplyScalar(9).addScaledVector(state.up, 4);
              onPlayerDamage(1, _v1.x, _v1.y, _v1.z);
            }
          }
        }
      }

      // Transform: posición sobre la esfera + yaw hacia el avance + tumbado si K.O.
      guard.pos
        .copy(guard.planet.centerVec)
        .addScaledVector(guard.dir, guard.planet.spec.radius);
      guard.mesh.position.copy(guard.pos);
      _q1.setFromUnitVectors(_upAxis, guard.dir);
      _v3.set(0, 0, 1).applyQuaternion(_q1);
      const cosYaw = _v3.dot(guard.forward);
      _v4.copy(_v3).cross(guard.forward);
      const yaw = Math.atan2(_v4.dot(guard.dir), cosYaw);
      _q2.setFromAxisAngle(guard.dir, yaw);
      guard.mesh.quaternion.copy(_q1).multiply(_q2);
      if (guard.state === GUARD_STATE_KO) {
        _q2.setFromAxisAngle(_v3.set(0, 0, 1), 1.45);
        guard.mesh.quaternion.multiply(_q2);
      }
    }
  }

  /** Rota `guard.dir` sobre la esfera hacia `targetDir` a velocidad tangente. */
  private moveGuardTowards(
    guard: GuardObj,
    targetDir: THREE.Vector3,
    speed: number,
    dt: number
  ): void {
    const dot = THREE.MathUtils.clamp(guard.dir.dot(targetDir), -1, 1);
    const angle = Math.acos(dot);
    if (angle < 1e-5) return;
    const step = Math.min((speed / guard.planet.spec.radius) * dt, angle);
    _v1.copy(guard.dir).cross(targetDir);
    if (_v1.lengthSq() < 1e-10) {
      _v1.set(1, 0, 0).cross(guard.dir);
      if (_v1.lengthSq() < 1e-10) _v1.set(0, 1, 0).cross(guard.dir);
    }
    _v1.normalize();
    _q1.setFromAxisAngle(_v1, step);
    guard.dir.applyQuaternion(_q1).normalize();
    // Avance tangente = componente tangencial de targetDir.
    _v2.copy(targetDir).addScaledVector(guard.dir, -THREE.MathUtils.clamp(targetDir.dot(guard.dir), -1, 1));
    if (_v2.lengthSq() > 1e-10) guard.forward.copy(_v2).normalize();
  }

  private koGuard(guard: GuardObj): void {
    guard.state = GUARD_STATE_KO;
    this.guardsKnockedOut++;
  }

  private damageGenerator(gen: GeneratorObj, amount: number): void {
    if (gen.destroyed) return;
    gen.hp -= amount;
    if (gen.hp <= 0) {
      gen.destroyed = true;
      this.generatorsDestroyed++;
      gen.coreMaterial.color.set(0x334155);
      gen.mesh.rotateZ(0.18);
      this.spawnExplosion(gen.pos, 3.5, 0xfbbf24);
    }
  }

  private updateBubbles(dt: number): void {
    for (const bubble of this.bubbles) {
      const pulse = 1 + Math.sin(this.clock * 1.6 + bubble.phase) * 0.03;
      bubble.mesh.scale.setScalar(pulse);
    }
  }

  private spawnExplosion(pos: THREE.Vector3, radius: number, color: number): void {
    for (const fx of this.explosions) {
      if (fx.active) continue;
      fx.active = true;
      fx.t = 0;
      fx.radius = radius;
      fx.material.color.set(color);
      fx.mesh.position.copy(pos);
      fx.mesh.scale.setScalar(radius * 0.25);
      fx.mesh.visible = true;
      return;
    }
  }

  private updateExplosions(dt: number): void {
    for (const fx of this.explosions) {
      if (!fx.active) continue;
      fx.t += dt;
      const k = fx.t / EXPLOSION_DURATION;
      if (k >= 1) {
        fx.active = false;
        fx.mesh.visible = false;
        continue;
      }
      const grow = 0.25 + 0.75 * (1 - (1 - k) * (1 - k));
      fx.mesh.scale.setScalar(fx.radius * grow);
      fx.material.opacity = 0.8 * (1 - k);
    }
  }

  /** Limpia las referencias (las mallas las dispone el GameEngine). */
  clear(): void {
    this.grabs.length = 0;
    this.generators.length = 0;
    this.gates.length = 0;
    this.bubbles.length = 0;
    this.grassZones.length = 0;
    this.guards.length = 0;
    this.explosions.length = 0;
    this.heldCount = 0;
    this.generatorsDestroyed = 0;
    this.guardsKnockedOut = 0;
  }
}
