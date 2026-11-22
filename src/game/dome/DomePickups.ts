import * as THREE from 'three';

// ============================================================================
// DomePickups — Partículas flotantes de EXP y Edén/Vida.
//
// Al morir, cada enemigo se deshace en orbes octaédricos brillantes que
// flotan con inercia y bob senoidal. Cuando Nyx entra en el radio de
// magnetismo (que escala con su nivel), los orbes aceleran hacia ella con
// una interpolación suave y se recogen al contacto.
// ============================================================================

export type DomePickupKind = 'exp' | 'eden' | 'hp';

export interface DomePickupGains {
  expGained: number;
  edenGained: number;
  hpGained: number;
}

interface PickupItem {
  mesh: THREE.Mesh;
  kind: DomePickupKind;
  active: boolean;
  value: number;
  velocity: THREE.Vector3;
  phase: number;
  life: number;
}

const MAX_PICKUPS = 160;
const PICKUP_RADIUS = 0.32;
const COLLECT_DISTANCE = 1.5;
const BASE_LIFETIME = 30;
const FADE_TIME = 4;
/** Suavizado de la velocidad hacia el objetivo magnético (1/s). */
const MAGNET_LERP = 3.2;
/** Fricción del flotador cuando está fuera del radio magnético (1/s). */
const DRIFT_DAMPING = 0.8;

const KIND_COLORS: Record<DomePickupKind, number> = {
  exp: 0x7ae8dc,  // aqua-menta
  eden: 0xdf9fff, // lavanda-rosa
  hp: 0x7dffa8,   // verde vida
};

// --- Scratch a nivel de módulo: sin allocations por frame ---
const _toPlayer = new THREE.Vector3();
const _magnetTarget = new THREE.Vector3();

export class DomePickupManager {
  private readonly scene: THREE.Scene;
  private readonly pool: PickupItem[] = [];
  private readonly geometry = new THREE.OctahedronGeometry(PICKUP_RADIUS, 0);
  private readonly materials: Record<DomePickupKind, THREE.MeshBasicMaterial>;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.materials = {
      exp: DomePickupManager.createKindMaterial(KIND_COLORS.exp),
      eden: DomePickupManager.createKindMaterial(KIND_COLORS.eden),
      hp: DomePickupManager.createKindMaterial(KIND_COLORS.hp),
    };
    for (let i = 0; i < MAX_PICKUPS; i++) {
      const mesh = new THREE.Mesh(this.geometry, this.materials.exp);
      mesh.visible = false;
      scene.add(mesh);
      this.pool.push({
        mesh,
        kind: 'exp',
        active: false,
        value: 0,
        velocity: new THREE.Vector3(),
        phase: 0,
        life: 0,
      });
    }
  }

  /**
   * Deshace a un enemigo en orbes de EXP (y de Edén/Vida si procede).
   * `expValue` está en "enemigos básicos" (1.0 = un enemigo) y se reparte
   * entre varios orbes; `edenValue` en puntos de reserva de Edén.
   */
  spawnFromEnemy(position: THREE.Vector3, expValue: number, edenValue?: number): void {
    const expOrbCount = THREE.MathUtils.clamp(Math.round(expValue * 4), 3, 8);
    for (let i = 0; i < expOrbCount; i++) {
      this.spawnOrb(position, 'exp', expValue / expOrbCount);
    }
    if (edenValue !== undefined && edenValue > 0) {
      const edenOrbCount = 4;
      for (let i = 0; i < edenOrbCount; i++) {
        this.spawnOrb(position, 'eden', edenValue / edenOrbCount);
      }
      // A veces el enemigo suelta también orbes de Vida.
      if (Math.random() < 0.35) {
        this.spawnOrb(position, 'hp', 5);
        this.spawnOrb(position, 'hp', 5);
      }
    }
  }

  /**
   * Avanza flotación, bob y atracción magnética de todos los orbes y
   * devuelve lo recogido por Nyx en este frame.
   */
  update(
    dt: number,
    playerPos: THREE.Vector3,
    magnetRadius: number,
    magnetSpeed: number
  ): DomePickupGains {
    const gains: DomePickupGains = { expGained: 0, edenGained: 0, hpGained: 0 };

    for (const item of this.pool) {
      if (!item.active) continue;

      item.life -= dt;
      item.phase += dt * 3.0;
      if (item.life <= 0) {
        this.deactivate(item);
        continue;
      }

      _toPlayer.subVectors(playerPos, item.mesh.position);
      const dist = _toPlayer.length();
      if (dist > 1e-4 && dist < magnetRadius) {
        // Atracción magnética: más fuerte cuanto más cerca está Nyx.
        _toPlayer.divideScalar(dist);
        const proximity = 1 - dist / magnetRadius;
        _magnetTarget.copy(_toPlayer).multiplyScalar(magnetSpeed * (0.6 + 0.9 * proximity));
        item.velocity.lerp(_magnetTarget, 1 - Math.exp(-MAGNET_LERP * dt));
      } else {
        item.velocity.multiplyScalar(Math.exp(-DRIFT_DAMPING * dt));
      }

      item.mesh.position.addScaledVector(item.velocity, dt);
      // Bob senoidal suave sobre la deriva actual.
      item.mesh.position.y += Math.sin(item.phase) * 0.25 * dt;
      item.mesh.rotation.x += dt * 2.2;
      item.mesh.rotation.y += dt * 3.1;

      // Pulso de escala + desvanecido en los últimos segundos de vida.
      const pulse = 1 + Math.sin(item.phase * 1.7) * 0.18;
      const fade = Math.min(1, item.life / FADE_TIME);
      item.mesh.scale.setScalar(pulse * (0.35 + 0.65 * fade));

      if (dist <= COLLECT_DISTANCE) {
        if (item.kind === 'exp') gains.expGained += item.value;
        else if (item.kind === 'eden') gains.edenGained += item.value;
        else gains.hpGained += item.value;
        this.deactivate(item);
      }
    }

    return gains;
  }

  /** Desactiva todos los orbes activos (p. ej. al reiniciar la oleada). */
  clear(): void {
    for (const item of this.pool) {
      if (item.active) this.deactivate(item);
    }
  }

  dispose(): void {
    this.clear();
    for (const item of this.pool) this.scene.remove(item.mesh);
    this.pool.length = 0;
    this.geometry.dispose();
    for (const id of Object.keys(this.materials) as DomePickupKind[]) {
      this.materials[id].dispose();
    }
  }

  // ------------------------------------------------------------------

  private spawnOrb(position: THREE.Vector3, kind: DomePickupKind, value: number): void {
    const item = this.acquireFreeItem();
    if (item === null) return;
    item.kind = kind;
    item.value = value;
    item.active = true;
    item.life = BASE_LIFETIME;
    item.phase = Math.random() * Math.PI * 2;
    item.mesh.material = this.materials[kind];
    item.mesh.position.set(
      position.x + (Math.random() - 0.5) * 1.2,
      position.y + (Math.random() - 0.5) * 1.2,
      position.z + (Math.random() - 0.5) * 1.2
    );
    item.velocity.set(
      (Math.random() - 0.5) * 6,
      (Math.random() - 0.5) * 5 + 1.5,
      (Math.random() - 0.5) * 6
    );
    item.mesh.scale.setScalar(1);
    item.mesh.visible = true;
  }

  /** Hueco libre del pool; si está lleno, recicla el orbe más antiguo. */
  private acquireFreeItem(): PickupItem | null {
    for (const item of this.pool) {
      if (!item.active) return item;
    }
    let oldest: PickupItem | null = null;
    for (const item of this.pool) {
      if (oldest === null || item.life < oldest.life) oldest = item;
    }
    return oldest;
  }

  private deactivate(item: PickupItem): void {
    item.active = false;
    item.mesh.visible = false;
  }

  private static createKindMaterial(color: number): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }
}
