import * as THREE from 'three';

// ============================================================================
// DomePickups — Partículas flotantes de EXP y Edén/Vida.
//
// Al morir, cada enemigo se deshace en orbes esféricos brillantes (verde lima
// para la EXP) con un halo aditivo que los hace legibles a
// cualquier distancia. Flotan con inercia y bob senoidal; pasado un margen
// persiguen a Nyx desde cualquier punto y se recogen al contacto.
// ============================================================================

export type DomePickupKind = 'exp' | 'eden' | 'hp';

export interface DomePickupGains {
  expGained: number;
  edenGained: number;
  hpGained: number;
}

interface PickupItem {
  mesh: THREE.Mesh;
  /** Halo billboard: mantiene el orbe visible a distancia. */
  glow: THREE.Sprite;
  kind: DomePickupKind;
  active: boolean;
  value: number;
  /** True si su EXP ya se contabilizó por adelantado para encadenar nivel (el orbe sigue volando hasta Nyx). */
  counted: boolean;
  velocity: THREE.Vector3;
  phase: number;
  life: number;
  /** Tiempo desde que se soltó el orbe (s). */
  age: number;
}

const MAX_PICKUPS = 160;
/** Radio del núcleo del orbe de EXP (~0,25 m). */
const PICKUP_RADIUS = 0.2;
/** Tamaño del halo: sólo un cerco, el núcleo sólido manda en la lectura. */
const GLOW_SCALE = 0.62;
const COLLECT_DISTANCE = 1.5;
const BASE_LIFETIME = 30;
const FADE_TIME = 4;
/** Suavizado de la velocidad hacia el objetivo magnético (1/s). */
const MAGNET_LERP = 3.2;
/** Fricción del flotador cuando está fuera del radio magnético (1/s). */
const DRIFT_DAMPING = 0.8;
/**
 * Nyx vuela a 20-25 u/s: con un radio de imán corto los orbes se quedaban
 * atrás y la EXP nunca se recogía. Pasado este margen el orbe persigue a Nyx
 * desde cualquier distancia.
 */
const HOMING_DELAY = 0.35;
/** Velocidad extra por unidad de distancia, para que alcance a Nyx. */
const HOMING_CATCHUP = 6;
/** Tope de velocidad del orbe (u/s). */
const HOMING_MAX_SPEED = 60;

const KIND_COLORS: Record<DomePickupKind, number> = {
  exp: 0x8cff3a,  // verde lima de EXP
  eden: 0xc77dff, // lavanda
  hp: 0x5cff8a,   // verde vida
};

// --- Scratch a nivel de módulo: sin allocations por frame ---
const _toPlayer = new THREE.Vector3();
const _magnetTarget = new THREE.Vector3();

export class DomePickupManager {
  private readonly scene: THREE.Scene;
  private readonly pool: PickupItem[] = [];
  private readonly geometry = new THREE.SphereGeometry(PICKUP_RADIUS, 10, 8);
  private readonly materials: Record<DomePickupKind, THREE.MeshBasicMaterial>;
  private readonly glowMaterials: Record<DomePickupKind, THREE.SpriteMaterial>;
  private readonly glowTexture: THREE.Texture;
  /**
   * Callback al recoger un orbe: la vista lo usa para la llamarada de
   * absorción (destello espiral violeta/cian de 0.25 s en el torso de Nyx).
   */
  onCollect?: (kind: DomePickupKind, position: THREE.Vector3) => void;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.glowTexture = DomePickupManager.createGlowTexture();
    this.materials = {
      exp: DomePickupManager.createKindMaterial(KIND_COLORS.exp),
      eden: DomePickupManager.createKindMaterial(KIND_COLORS.eden),
      hp: DomePickupManager.createKindMaterial(KIND_COLORS.hp),
    };
    this.glowMaterials = {
      exp: DomePickupManager.createGlowMaterial(this.glowTexture, KIND_COLORS.exp),
      eden: DomePickupManager.createGlowMaterial(this.glowTexture, KIND_COLORS.eden),
      hp: DomePickupManager.createGlowMaterial(this.glowTexture, KIND_COLORS.hp),
    };
    for (let i = 0; i < MAX_PICKUPS; i++) {
      const mesh = new THREE.Mesh(this.geometry, this.materials.exp);
      mesh.visible = false;
      // Halo billboard: el orbe se lee a 40 m aunque el núcleo sea diminuto.
      const glow = new THREE.Sprite(this.glowMaterials.exp);
      glow.scale.setScalar(GLOW_SCALE);
      mesh.add(glow);
      scene.add(mesh);
      this.pool.push({
        mesh,
        glow,
        kind: 'exp',
        active: false,
        value: 0,
        counted: false,
        velocity: new THREE.Vector3(),
        phase: 0,
        life: 0,
        age: 0,
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
      item.age += dt;
      item.phase += dt * 3.0;
      if (item.life <= 0) {
        this.deactivate(item);
        continue;
      }

      _toPlayer.subVectors(playerPos, item.mesh.position);
      const dist = _toPlayer.length();
      // Dentro del radio magnético va directo; fuera, persigue tras el margen
      // inicial para que la EXP no se pierda cuando Nyx cruza la cúpula a toda
      // velocidad.
      if (dist > 1e-4 && (dist < magnetRadius || item.age >= HOMING_DELAY)) {
        _toPlayer.divideScalar(dist);
        const proximity = 1 - Math.min(1, dist / magnetRadius);
        const speed = Math.min(
          HOMING_MAX_SPEED,
          magnetSpeed * (0.6 + 0.9 * proximity) + dist * HOMING_CATCHUP,
        );
        _magnetTarget.copy(_toPlayer).multiplyScalar(speed);
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

      // La distancia se recalcula tras mover el orbe: a 60 u/s el hueco de un
      // frame es mayor que el radio de recogida.
      _toPlayer.subVectors(playerPos, item.mesh.position);
      if (_toPlayer.lengthSq() <= COLLECT_DISTANCE * COLLECT_DISTANCE) {
        if (item.kind === 'exp') {
          if (!item.counted) gains.expGained += item.value;
        } else if (item.kind === 'eden') gains.edenGained += item.value;
        else gains.hpGained += item.value;
        this.onCollect?.(item.kind, item.mesh.position);
        this.deactivate(item);
      }
    }

    return gains;
  }

  /**
   * Suma la EXP de los orbes activos sin contabilizar dentro de `radius` m
   * alrededor de `playerPos` (no consume ni oculta los orbes).
   */
  peekExpInRadius(playerPos: THREE.Vector3, radius: number): number {
    const rSq = radius * radius;
    let total = 0;
    for (const item of this.pool) {
      if (!item.active || item.kind !== 'exp' || item.counted) continue;
      if (item.mesh.position.distanceToSquared(playerPos) <= rSq) {
        total += item.value;
      }
    }
    return total;
  }

  /**
   * Contabiliza por adelantado la EXP de los orbes dentro de `radius` m y los
   * marca como `counted` para que sigan volando hacia Nyx y disparen su VFX
   * al llegar sin sumar EXP por duplicado.
   */
  markExpCountedInRadius(playerPos: THREE.Vector3, radius: number): number {
    const rSq = radius * radius;
    let total = 0;
    for (const item of this.pool) {
      if (!item.active || item.kind !== 'exp' || item.counted) continue;
      if (item.mesh.position.distanceToSquared(playerPos) <= rSq) {
        item.counted = true;
        total += item.value;
      }
    }
    return total;
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
      this.glowMaterials[id].dispose();
    }
    this.glowTexture.dispose();
  }

  // ------------------------------------------------------------------

  private spawnOrb(position: THREE.Vector3, kind: DomePickupKind, value: number): void {
    const item = this.acquireFreeItem();
    if (item === null) return;
    item.kind = kind;
    item.value = value;
    item.counted = false;
    item.active = true;
    item.life = BASE_LIFETIME;
    item.age = 0;
    item.phase = Math.random() * Math.PI * 2;
    item.mesh.material = this.materials[kind];
    item.glow.material = this.glowMaterials[kind];
    item.mesh.position.set(
      position.x + (Math.random() - 0.5) * 2.2,
      position.y + (Math.random() - 0.5) * 2.2,
      position.z + (Math.random() - 0.5) * 2.2
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
    item.counted = false;
    item.mesh.visible = false;
  }

  /** Halo radial suave generado una sola vez (sin assets externos). */
  private static createGlowTexture(): THREE.Texture {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const gradient = ctx.createRadialGradient(
        size / 2,
        size / 2,
        0,
        size / 2,
        size / 2,
        size / 2,
      );
      gradient.addColorStop(0, 'rgba(255,255,255,1)');
      gradient.addColorStop(0.18, 'rgba(255,255,255,0.78)');
      gradient.addColorStop(0.45, 'rgba(255,255,255,0.14)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private static createGlowMaterial(
    map: THREE.Texture,
    color: number,
  ): THREE.SpriteMaterial {
    return new THREE.SpriteMaterial({
      map,
      color,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }

  /**
   * Núcleo opaco y saturado: con blending aditivo el orbe se leía como una
   * mancha translúcida y perdía el color. Sin blending mantiene el verde lima
   * plano de los orbes de EXP y recorta silueta contra el fondo.
   */
  private static createKindMaterial(color: number): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      color,
      transparent: false,
      depthWrite: true,
    });
  }
}
