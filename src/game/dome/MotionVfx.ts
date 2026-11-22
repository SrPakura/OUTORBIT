import * as THREE from 'three';
import type { NyxMovementMode } from '@/game/dome/domeTypes';

// ============================================================================
// MotionVfx — efectos de partículas del movimiento de Nyx en la cúpula.
//
// Tres pools preasignados (cero allocations por frame salvo en los eventos):
// - Puntos aditivos (`THREE.Points`) para ráfagas de aterrizaje / impactos y
//   para las motas de túnel (speed motes) que pasan junto a la cámara a alta
//   velocidad. El fade se hace llevando el color a negro (aditivo = invisible).
// - Anillos (`RingGeometry`) para el rebote contra la barrera blanca.
// - Aros de barrena (`TorusGeometry`) que envuelven a Nyx cuando el taladro
//   espiral está listo, girando a toda velocidad sobre su rumbo.
// ============================================================================

const MAX_PARTICLES = 320;
const MAX_RINGS = 6;
const RING_LIFETIME = 0.7;
const RING_MAX_SCALE = 8;
const RING_FORWARD = new THREE.Vector3(0, 0, 1);

// --- Motas de túnel / caída libre (Gravity Rush speed motes)
const MOTE_MIN_SPEED = 11; // m/s a partir de los cuales aparecen
const MOTE_SPAWN_BASE = 0.03; // s entre motas a la velocidad mínima
const MOTE_FORWARD_DIST = 7; // spawnean delante de Nyx, alrededor de su rumbo
const MOTE_RADIUS_MIN = 0.8;
const MOTE_RADIUS_MAX = 3.0;
const MOTE_MAX_PER_FRAME = 6;

// --- Aros de barrena (drill spiral rings)
const DRILL_SPIN_BASE = 14; // rad/s de giro sobre el rumbo (+ speed * 0.9)

export class MotionVfxSystem {
  private readonly scene: THREE.Scene;
  private readonly points: THREE.Points;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly velocities: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly baseColor: Float32Array;
  private cursor = 0;

  private readonly rings: THREE.Mesh[] = [];
  private readonly ringLife: Float32Array;
  private ringCursor = 0;

  private readonly drillGroup: THREE.Group;
  private readonly drillMatA: THREE.MeshBasicMaterial;
  private readonly drillMatB: THREE.MeshBasicMaterial;
  private drillAlpha = 0;
  private moteAcc = 0;
  private readonly tmpRight = new THREE.Vector3();
  private readonly tmpUp = new THREE.Vector3();
  private readonly tmpDir = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    this.positions = new Float32Array(MAX_PARTICLES * 3);
    this.colors = new Float32Array(MAX_PARTICLES * 3);
    this.velocities = new Float32Array(MAX_PARTICLES * 3);
    this.life = new Float32Array(MAX_PARTICLES);
    this.maxLife = new Float32Array(MAX_PARTICLES);
    this.baseColor = new Float32Array(MAX_PARTICLES * 3);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    const material = new THREE.PointsMaterial({
      size: 0.25,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    scene.add(this.points);

    this.ringLife = new Float32Array(MAX_RINGS);
    for (let i = 0; i < MAX_RINGS; i++) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.55, 1, 48),
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      ring.visible = false;
      ring.frustumCulled = false;
      this.rings.push(ring);
      scene.add(ring);
    }

    // Aros de barrena (drill spiral rings) alrededor de Nyx a alta velocidad
    this.drillGroup = new THREE.Group();
    this.drillGroup.visible = false;
    this.drillMatA = new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.drillMatB = new THREE.MeshBasicMaterial({
      color: 0xf43f5e,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const torusA = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.032, 8, 32), this.drillMatA);
    const torusB = new THREE.Mesh(new THREE.TorusGeometry(0.68, 0.026, 8, 28), this.drillMatB);
    torusA.rotation.x = 0.45;
    torusB.rotation.y = -0.55;
    torusB.position.z = 0.35;
    this.drillGroup.add(torusA, torusB);
    scene.add(this.drillGroup);
  }

  /**
   * Ráfaga de partículas. Si se pasa `normal`, las partículas salen
   * sesgadas hacia esa dirección (impactos contra superficies).
   */
  spawnBurst(
    position: THREE.Vector3,
    normal?: THREE.Vector3,
    color = 0xffc24d,
    count = 22,
  ): void {
    const col = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const idx = this.cursor;
      this.cursor = (this.cursor + 1) % MAX_PARTICLES;
      const i3 = idx * 3;

      this.positions[i3] = position.x;
      this.positions[i3 + 1] = position.y;
      this.positions[i3 + 2] = position.z;

      let vx = Math.random() * 2 - 1;
      let vy = Math.random() * 2 - 1;
      let vz = Math.random() * 2 - 1;
      const len = Math.hypot(vx, vy, vz) || 1;
      const speed = 2 + Math.random() * 4.5;
      vx = (vx / len) * speed;
      vy = (vy / len) * speed;
      vz = (vz / len) * speed;
      if (normal) {
        const push = 2 + Math.random() * 3;
        vx += normal.x * push;
        vy += normal.y * push;
        vz += normal.z * push;
      }
      this.velocities[i3] = vx;
      this.velocities[i3 + 1] = vy;
      this.velocities[i3 + 2] = vz;

      const l = 0.35 + Math.random() * 0.45;
      this.life[idx] = l;
      this.maxLife[idx] = l;

      const tint = 0.7 + Math.random() * 0.3;
      this.baseColor[i3] = col.r * tint;
      this.baseColor[i3 + 1] = col.g * tint;
      this.baseColor[i3 + 2] = col.b * tint;
    }
  }

  /** Anillo expansivo en el punto de rebote contra la barrera blanca. */
  spawnDomeBounceRing(position: THREE.Vector3, normal: THREE.Vector3): void {
    const idx = this.ringCursor;
    this.ringCursor = (this.ringCursor + 1) % MAX_RINGS;
    const ring = this.rings[idx];
    ring.position.copy(position);
    ring.quaternion.setFromUnitVectors(RING_FORWARD, normal);
    ring.scale.setScalar(0.8);
    ring.visible = true;
    this.ringLife[idx] = RING_LIFETIME;
  }

  update(
    dt: number,
    nyxPos?: THREE.Vector3,
    nyxVel?: THREE.Vector3,
    nyxForward?: THREE.Vector3,
    mode?: NyxMovementMode,
    isDrillReady?: boolean,
  ): void {
    if (nyxPos && nyxVel && nyxForward) {
      const speed = nyxVel.length();
      // 1. Speed motes (motas de túnel en caída al vacío / alta velocidad)
      if (speed > MOTE_MIN_SPEED && mode !== 'grounded') {
        this.tmpDir.copy(nyxVel).multiplyScalar(1 / speed);
        if (Math.abs(this.tmpDir.y) < 0.9) this.tmpUp.set(0, 1, 0);
        else this.tmpUp.set(1, 0, 0);
        this.tmpRight.crossVectors(this.tmpDir, this.tmpUp).normalize();
        this.tmpUp.crossVectors(this.tmpRight, this.tmpDir).normalize();

        const rate = MOTE_SPAWN_BASE / Math.max(1, (speed - MOTE_MIN_SPEED) * 0.25 + 1);
        this.moteAcc += dt;
        let spawned = 0;
        while (this.moteAcc >= rate && spawned < MOTE_MAX_PER_FRAME) {
          this.moteAcc -= rate;
          spawned++;
          const idx = this.cursor;
          this.cursor = (this.cursor + 1) % MAX_PARTICLES;
          const i3 = idx * 3;
          const ang = Math.random() * Math.PI * 2;
          const rad = MOTE_RADIUS_MIN + Math.random() * (MOTE_RADIUS_MAX - MOTE_RADIUS_MIN);
          const fwdDist = MOTE_FORWARD_DIST + (Math.random() - 0.3) * 4;
          const rx = Math.cos(ang) * rad;
          const ry = Math.sin(ang) * rad;

          this.positions[i3] =
            nyxPos.x + this.tmpDir.x * fwdDist + this.tmpRight.x * rx + this.tmpUp.x * ry;
          this.positions[i3 + 1] =
            nyxPos.y + this.tmpDir.y * fwdDist + this.tmpRight.y * rx + this.tmpUp.y * ry;
          this.positions[i3 + 2] =
            nyxPos.z + this.tmpDir.z * fwdDist + this.tmpRight.z * rx + this.tmpUp.z * ry;

          const backSpeed = speed * 0.45 + 4;
          this.velocities[i3] = -this.tmpDir.x * backSpeed;
          this.velocities[i3 + 1] = -this.tmpDir.y * backSpeed;
          this.velocities[i3 + 2] = -this.tmpDir.z * backSpeed;

          const l = 0.28 + Math.random() * 0.24;
          this.life[idx] = l;
          this.maxLife[idx] = l;
          const isDrillMote = isDrillReady && Math.random() < 0.45;
          this.baseColor[i3] = isDrillMote ? 0.96 : 0.22;
          this.baseColor[i3 + 1] = isDrillMote ? 0.35 : 0.85;
          this.baseColor[i3 + 2] = 0.98;
        }
      } else {
        this.moteAcc = 0;
      }

      // 2. Aros de barrena (drill spiral rings)
      const wantDrill = Boolean(isDrillReady) && mode !== 'grounded';
      const targetAlpha = wantDrill ? (mode === 'speed_attack' ? 0.88 : 0.48) : 0;
      this.drillAlpha += (targetAlpha - this.drillAlpha) * (1 - Math.exp(-12 * dt));
      if (this.drillAlpha > 0.02) {
        this.drillGroup.visible = true;
        this.drillGroup.position.copy(nyxPos).addScaledVector(nyxForward, 0.55);
        this.drillGroup.quaternion.setFromUnitVectors(RING_FORWARD, nyxForward);
        this.drillGroup.rotateZ((DRILL_SPIN_BASE + speed * 0.9) * dt);
        this.drillMatA.opacity = this.drillAlpha;
        this.drillMatB.opacity = this.drillAlpha * 0.85;
      } else {
        this.drillGroup.visible = false;
      }
    }

    const drag = Math.exp(-3 * dt);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const i3 = i * 3;
      if (this.life[i] <= 0) {
        this.colors[i3] = 0;
        this.colors[i3 + 1] = 0;
        this.colors[i3 + 2] = 0;
        continue;
      }
      this.positions[i3] += this.velocities[i3] * dt;
      this.positions[i3 + 1] += this.velocities[i3 + 1] * dt;
      this.positions[i3 + 2] += this.velocities[i3 + 2] * dt;
      this.velocities[i3] *= drag;
      this.velocities[i3 + 1] *= drag;
      this.velocities[i3 + 2] *= drag;
      const fade = this.life[i] / this.maxLife[i];
      this.colors[i3] = this.baseColor[i3] * fade;
      this.colors[i3 + 1] = this.baseColor[i3 + 1] * fade;
      this.colors[i3 + 2] = this.baseColor[i3 + 2] * fade;
    }
    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;

    for (let i = 0; i < MAX_RINGS; i++) {
      if (this.ringLife[i] <= 0) continue;
      this.ringLife[i] -= dt;
      const ring = this.rings[i];
      if (this.ringLife[i] <= 0) {
        ring.visible = false;
        continue;
      }
      const t = 1 - this.ringLife[i] / RING_LIFETIME;
      ring.scale.setScalar(0.8 + t * RING_MAX_SCALE);
      (ring.material as THREE.MeshBasicMaterial).opacity = (1 - t) * (1 - t) * 0.9;
    }
  }

  dispose(): void {
    this.scene.remove(this.points);
    this.points.geometry.dispose();
    (this.points.material as THREE.PointsMaterial).dispose();
    for (const ring of this.rings) {
      this.scene.remove(ring);
      ring.geometry.dispose();
      (ring.material as THREE.MeshBasicMaterial).dispose();
    }
    this.scene.remove(this.drillGroup);
    this.drillGroup.traverse((obj) => {
      const m = obj as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    this.drillMatA.dispose();
    this.drillMatB.dispose();
  }
}
