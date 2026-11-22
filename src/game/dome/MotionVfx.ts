import * as THREE from 'three';

// ============================================================================
// MotionVfx — efectos de partículas del movimiento de Nyx en la cúpula.
//
// Dos pools preasignados (cero allocations por frame salvo en los eventos):
// - Puntos aditivos (`THREE.Points`) para chispas puntuales: impactos contra
//   enemigos, aterrizajes fuertes y golpes laterales. El fade se hace llevando
//   el color a negro (aditivo = invisible).
// - Anillos (`RingGeometry`) para el rebote contra la barrera blanca.
// ============================================================================

const MAX_PARTICLES = 320;
const MAX_RINGS = 6;
const RING_LIFETIME = 0.7;
const RING_MAX_SCALE = 8;
const RING_FORWARD = new THREE.Vector3(0, 0, 1);

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

  /**
   * Integra los pools. Los argumentos extra del controlador (posición,
   * velocidad, rumbo, modo, taladro listo) ya no alimentan ningún efecto:
   * se aceptan y se ignoran para mantener la firma estable.
   */
  update(dt: number, ..._unused: unknown[]): void {
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
  }
}
