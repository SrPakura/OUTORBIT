import * as THREE from 'three';
import { raycastSlabs } from '@/game/dome/DomeSlabs';
import type { NyxMovementMode, SlabCollider, SlabRaycastHit } from '@/game/dome/domeTypes';

// ============================================================================
// MotionVfx — lectura espacial del movimiento de Nyx en la cúpula.
//
// Pools preasignados (CERO allocations por frame; solo se crean objetos en los
// eventos de spawn, nunca en el bucle caliente):
// - `sparks`: puntos aditivos (impactos, chispas, destellos de habilidad).
// - `dust`: puntos opacos blanco-crema con blending normal (polvo anime de
//   aterrizaje/despegue/derrape, motas de la estela gravitatoria).
// - `rings`: anillos expansivos (rebote de cúpula, ruptura sónica, área).
// - `streaks`: `LineSegments` con trazos de viento 3D que pasan junto a Nyx.
// - `aura`: cáscara translúcida alrededor del cuerpo a velocidad terminal.
// - `telemetry`: disco de sombra + anillo telémetro proyectados por raycast
//   sobre el slab de aterrizaje (lectura de profundidad en 3D).
//
// Ambos pools de partículas usan un shader propio con `aAlpha`/`aSize` por
// vértice: el polvo puede desvanecerse sin volverse negro (blending normal) y
// las chispas pueden crecer sin tocar el material.
// ============================================================================

const MAX_SPARKS = 360;
const MAX_DUST = 240;
const MAX_RINGS = 10;
const MAX_STREAKS = 64;

const RING_FORWARD = new THREE.Vector3(0, 0, 1);
const WORLD_UP = new THREE.Vector3(0, 1, 0);

/** Velocidad a la que arrancan los trazos de viento 3D. */
const STREAK_MIN_SPEED = 10;
/** Velocidad terminal: aura + anillo de ruptura sónica + rayos 2D del HUD. */
const TERMINAL_SPEED = 18;
/** Alcance del telémetro de aterrizaje. */
const TELEMETRY_RANGE = 14;

const particleVertexShader = /* glsl */ `
  attribute vec3 aColor;
  attribute float aAlpha;
  attribute float aSize;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4( position, 1.0 );
    gl_PointSize = aSize * ( 320.0 / max( -mv.z, 0.1 ) );
    gl_Position = projectionMatrix * mv;
  }
`;

const particleFragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = length( d );
    if ( r > 0.5 ) discard;
    float soft = smoothstep( 0.5, 0.16, r );
    gl_FragColor = vec4( vColor, vAlpha * soft );
  }
`;

/** Estilo de una ráfaga: se reutiliza (mutable) para no crear objetos. */
interface BurstStyle {
  color: number;
  count: number;
  speedMin: number;
  speedMax: number;
  lifeMin: number;
  lifeMax: number;
  drag: number;
  gravity: number;
  spread: number;
  size: number;
  alpha: number;
}

const STYLE_SPARK: BurstStyle = {
  color: 0xffc24d,
  count: 22,
  speedMin: 2,
  speedMax: 6.5,
  lifeMin: 0.35,
  lifeMax: 0.8,
  drag: 3,
  gravity: 0,
  spread: 1,
  size: 0.25,
  alpha: 1,
};

const STYLE_DUST_LAND: BurstStyle = {
  color: 0xf6efe0,
  count: 16,
  speedMin: 1.6,
  speedMax: 4.2,
  lifeMin: 0.45,
  lifeMax: 0.95,
  drag: 4.2,
  gravity: -1.2,
  spread: 1,
  size: 0.62,
  alpha: 0.85,
};

const STYLE_DUST_TAKEOFF: BurstStyle = {
  color: 0xf3ead6,
  count: 12,
  speedMin: 1.2,
  speedMax: 3.4,
  lifeMin: 0.35,
  lifeMax: 0.7,
  drag: 5,
  gravity: -0.6,
  spread: 1,
  size: 0.5,
  alpha: 0.7,
};

const STYLE_DUST_SLIDE: BurstStyle = {
  color: 0xfff6e6,
  count: 10,
  speedMin: 2.4,
  speedMax: 5.6,
  lifeMin: 0.3,
  lifeMax: 0.65,
  drag: 3.4,
  gravity: -0.8,
  spread: 1,
  size: 0.55,
  alpha: 0.8,
};

const STYLE_WAKE: BurstStyle = {
  color: 0xd9e6ff,
  count: 8,
  speedMin: 0.4,
  speedMax: 1.8,
  lifeMin: 0.55,
  lifeMax: 0.85,
  drag: 1.1,
  gravity: 0,
  spread: 1,
  size: 0.34,
  alpha: 0.55,
};

const STYLE_ABSORB: BurstStyle = {
  color: 0xc084fc,
  count: 14,
  speedMin: 1.4,
  speedMax: 3.6,
  lifeMin: 0.2,
  lifeMax: 0.4,
  drag: 6,
  gravity: 0,
  spread: 1,
  size: 0.3,
  alpha: 0.95,
};

/** Scratch de módulo: nada de allocations dentro de los spawns. */
const _color = new THREE.Color();
const _sRight = new THREE.Vector3();
const _sUp = new THREE.Vector3();
const _sDir = new THREE.Vector3();
const _sOffset = new THREE.Vector3();
const _ringNormal = new THREE.Vector3();
const _telemetryHit: SlabRaycastHit = {
  slab: null as unknown as SlabCollider,
  point: new THREE.Vector3(),
  normal: new THREE.Vector3(),
  distance: 0,
};

/**
 * Pool de partículas con shader propio (alpha y tamaño por vértice).
 * `spawn` escribe en arrays tipados reutilizados; `update` integra y sube los
 * buffers una sola vez por frame.
 */
class ParticlePool {
  readonly points: THREE.Points;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly alphas: Float32Array;
  private readonly sizes: Float32Array;
  private readonly velocities: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly baseColor: Float32Array;
  private readonly baseAlpha: Float32Array;
  private readonly baseSize: Float32Array;
  private readonly drag: Float32Array;
  private readonly gravity: Float32Array;
  private readonly max: number;
  private cursor = 0;

  constructor(scene: THREE.Scene, max: number, blending: THREE.Blending) {
    this.max = max;
    this.positions = new Float32Array(max * 3);
    this.colors = new Float32Array(max * 3);
    this.alphas = new Float32Array(max);
    this.sizes = new Float32Array(max);
    this.velocities = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.baseColor = new Float32Array(max * 3);
    this.baseAlpha = new Float32Array(max);
    this.baseSize = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.gravity = new Float32Array(max);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3));
    geometry.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));

    const material = new THREE.ShaderMaterial({
      vertexShader: particleVertexShader,
      fragmentShader: particleFragmentShader,
      transparent: true,
      depthWrite: false,
      blending,
    });

    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  spawn(position: THREE.Vector3, normal: THREE.Vector3 | null, style: BurstStyle): void {
    _color.setHex(style.color);
    for (let i = 0; i < style.count; i++) {
      const idx = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      const i3 = idx * 3;

      this.positions[i3] = position.x;
      this.positions[i3 + 1] = position.y;
      this.positions[i3 + 2] = position.z;

      let vx = Math.random() * 2 - 1;
      let vy = Math.random() * 2 - 1;
      let vz = Math.random() * 2 - 1;
      const len = Math.hypot(vx, vy, vz) || 1;
      const speed = style.speedMin + Math.random() * (style.speedMax - style.speedMin);
      vx = (vx / len) * speed;
      vy = (vy / len) * speed;
      vz = (vz / len) * speed;
      if (normal) {
        const push = speed * 0.9;
        vx += normal.x * push;
        vy += normal.y * push;
        vz += normal.z * push;
      }
      this.velocities[i3] = vx;
      this.velocities[i3 + 1] = vy;
      this.velocities[i3 + 2] = vz;

      const l = style.lifeMin + Math.random() * (style.lifeMax - style.lifeMin);
      this.life[idx] = l;
      this.maxLife[idx] = l;

      const tint = 0.78 + Math.random() * 0.22;
      this.baseColor[i3] = _color.r * tint;
      this.baseColor[i3 + 1] = _color.g * tint;
      this.baseColor[i3 + 2] = _color.b * tint;
      this.baseAlpha[idx] = style.alpha;
      this.baseSize[idx] = style.size * (0.7 + Math.random() * 0.6);
      this.drag[idx] = style.drag;
      this.gravity[idx] = style.gravity;
    }
  }

  update(dt: number): void {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const i3 = i * 3;
      if (this.life[i] <= 0) {
        this.alphas[i] = 0;
        continue;
      }
      const drag = Math.exp(-this.drag[i] * dt);
      this.positions[i3] += this.velocities[i3] * dt;
      this.positions[i3 + 1] += this.velocities[i3 + 1] * dt;
      this.positions[i3 + 2] += this.velocities[i3 + 2] * dt;
      this.velocities[i3] *= drag;
      this.velocities[i3 + 1] = this.velocities[i3 + 1] * drag + this.gravity[i] * dt;
      this.velocities[i3 + 2] *= drag;
      const fade = this.life[i] / this.maxLife[i];
      this.colors[i3] = this.baseColor[i3];
      this.colors[i3 + 1] = this.baseColor[i3 + 1];
      this.colors[i3 + 2] = this.baseColor[i3 + 2];
      this.alphas[i] = this.baseAlpha[i] * fade * fade;
      this.sizes[i] = this.baseSize[i] * (0.6 + 0.4 * fade);
    }
    const geometry = this.points.geometry;
    (geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (geometry.getAttribute('aColor') as THREE.BufferAttribute).needsUpdate = true;
    (geometry.getAttribute('aAlpha') as THREE.BufferAttribute).needsUpdate = true;
    (geometry.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.points.removeFromParent();
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}

export class MotionVfxSystem {
  private readonly scene: THREE.Scene;
  private readonly sparks: ParticlePool;
  private readonly dust: ParticlePool;

  // --- Anillos expansivos
  private readonly rings: THREE.Mesh[] = [];
  private readonly ringLife: Float32Array;
  private readonly ringMaxLife: Float32Array;
  private readonly ringMaxScale: Float32Array;
  private readonly ringOpacity: Float32Array;
  private ringCursor = 0;

  // --- Trazos de viento 3D (LineSegments)
  private readonly streaks: THREE.LineSegments;
  private readonly streakVerts: Float32Array;
  private readonly streakColors: Float32Array;
  private readonly streakPos: Float32Array;
  private readonly streakDir: Float32Array;
  private readonly streakSpeed: Float32Array;
  private readonly streakLen: Float32Array;
  private readonly streakLife: Float32Array;
  private readonly streakMaxLife: Float32Array;
  private streakCursor = 0;
  private streakAccum = 0;

  // --- Aura de velocidad terminal
  private readonly aura: THREE.Mesh;
  private auraIntensity = 0;

  // --- Telémetro de aterrizaje (disco de sombra + anillo)
  private readonly telemetry: THREE.Group;
  private readonly telemetryDisc: THREE.Mesh;
  private readonly telemetryRing: THREE.Mesh;
  private telemetryOpacity = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    this.sparks = new ParticlePool(scene, MAX_SPARKS, THREE.AdditiveBlending);
    this.dust = new ParticlePool(scene, MAX_DUST, THREE.NormalBlending);

    // --- Anillos
    this.ringLife = new Float32Array(MAX_RINGS);
    this.ringMaxLife = new Float32Array(MAX_RINGS);
    this.ringMaxScale = new Float32Array(MAX_RINGS);
    this.ringOpacity = new Float32Array(MAX_RINGS);
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

    // --- Trazos de viento
    this.streakVerts = new Float32Array(MAX_STREAKS * 6);
    this.streakColors = new Float32Array(MAX_STREAKS * 6);
    this.streakPos = new Float32Array(MAX_STREAKS * 3);
    this.streakDir = new Float32Array(MAX_STREAKS * 3);
    this.streakSpeed = new Float32Array(MAX_STREAKS);
    this.streakLen = new Float32Array(MAX_STREAKS);
    this.streakLife = new Float32Array(MAX_STREAKS);
    this.streakMaxLife = new Float32Array(MAX_STREAKS);

    const streakGeometry = new THREE.BufferGeometry();
    streakGeometry.setAttribute('position', new THREE.BufferAttribute(this.streakVerts, 3));
    streakGeometry.setAttribute('color', new THREE.BufferAttribute(this.streakColors, 3));
    this.streaks = new THREE.LineSegments(
      streakGeometry,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.streaks.frustumCulled = false;
    scene.add(this.streaks);

    // --- Aura de velocidad terminal
    this.aura = new THREE.Mesh(
      new THREE.SphereGeometry(1, 18, 12),
      new THREE.MeshBasicMaterial({
        color: 0x9be8ff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.aura.visible = false;
    this.aura.frustumCulled = false;
    scene.add(this.aura);

    // --- Telémetro de aterrizaje
    this.telemetry = new THREE.Group();
    this.telemetry.visible = false;
    this.telemetryDisc = new THREE.Mesh(
      // CircleGeometry mira a +Z: se gira a +Y para tumbarlo sobre el suelo.
      new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: 0x05030f,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );
    this.telemetryRing = new THREE.Mesh(
      new THREE.RingGeometry(0.82, 1, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: 0x67e8f9,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.telemetry.add(this.telemetryDisc);
    this.telemetry.add(this.telemetryRing);
    this.telemetry.frustumCulled = false;
    scene.add(this.telemetry);
  }

  // ------------------------------------------------------------------
  // Spawns de evento
  // ------------------------------------------------------------------

  /**
   * Ráfaga de chispas. Si se pasa `normal`, las partículas salen sesgadas
   * hacia esa dirección (impactos contra superficies).
   */
  spawnBurst(
    position: THREE.Vector3,
    normal?: THREE.Vector3,
    color = 0xffc24d,
    count = 22,
  ): void {
    STYLE_SPARK.color = color;
    STYLE_SPARK.count = count;
    this.sparks.spawn(position, normal ?? null, STYLE_SPARK);
  }

  /** Anillo expansivo en el punto de rebote contra la barrera blanca. */
  spawnDomeBounceRing(position: THREE.Vector3, normal: THREE.Vector3): void {
    this.spawnRing(position, normal, 0xffffff, 8, 0.7, 0.9);
  }

  /**
   * Anillo de ruptura sónica: la condensación blanco/cian que Nyx atraviesa al
   * arrancar un Dash o al cruzar el umbral del taladro espiral.
   */
  spawnSonicBoomRing(position: THREE.Vector3, direction: THREE.Vector3): void {
    this.spawnRing(position, direction, 0x9be8ff, 5.5, 0.55, 0.85);
    this.spawnRing(position, direction, 0xffffff, 3.2, 0.4, 0.7);
    this.auraIntensity = Math.max(this.auraIntensity, 0.85);
  }

  /**
   * Polvo estilizado anime: bocanadas blanco-crema opacas + chispas cian y
   * ámbar + pequeñas líneas cinéticas diagonales (los trazos de viento ya
   * cubren la lectura de velocidad; aquí van las chispas de fricción).
   */
  spawnDustBurst(
    position: THREE.Vector3,
    normal: THREE.Vector3,
    kind: 'land' | 'takeoff' | 'slide' | 'glance',
  ): void {
    if (kind === 'land') {
      this.dust.spawn(position, normal, STYLE_DUST_LAND);
      STYLE_SPARK.color = 0x67e8f9;
      STYLE_SPARK.count = 8;
      this.sparks.spawn(position, normal, STYLE_SPARK);
    } else if (kind === 'takeoff') {
      this.dust.spawn(position, normal, STYLE_DUST_TAKEOFF);
      STYLE_SPARK.color = 0xfbbf24;
      STYLE_SPARK.count = 6;
      this.sparks.spawn(position, normal, STYLE_SPARK);
    } else if (kind === 'slide') {
      this.dust.spawn(position, normal, STYLE_DUST_SLIDE);
      STYLE_SPARK.color = 0xfde68a;
      STYLE_SPARK.count = 10;
      this.sparks.spawn(position, normal, STYLE_SPARK);
    } else {
      this.dust.spawn(position, normal, STYLE_DUST_TAKEOFF);
      STYLE_SPARK.color = 0xe2e8f0;
      STYLE_SPARK.count = 6;
      this.sparks.spawn(position, normal, STYLE_SPARK);
    }
  }

  /**
   * Estela gravitatoria: al despegar con Dash o lanzar el ataque de velocidad,
   * la onda arrastra motas de polvo/piedrecitas en la estela durante ~0.8 s.
   */
  spawnGravityWake(position: THREE.Vector3, direction: THREE.Vector3): void {
    _sDir.copy(direction);
    if (_sDir.lengthSq() < 1e-6) _sDir.set(0, 0, -1);
    else _sDir.normalize();
    this.dust.spawn(position, _sDir, STYLE_WAKE);
    this.spawnRing(position, _sDir, 0xbfe9ff, 2.6, 0.45, 0.45);
  }

  /**
   * Llamarada de absorción: cuando un orbe de EXP/Edén llega a Nyx por
   * magnetismo, el torso se envuelve 0.25 s en un destello espiral
   * violeta/cian.
   */
  spawnAbsorbFlare(position: THREE.Vector3, kind: 'exp' | 'eden' | 'hp'): void {
    STYLE_ABSORB.color = kind === 'exp' ? 0x7ae8dc : kind === 'eden' ? 0xdf9fff : 0x7dffa8;
    this.dust.spawn(position, null, STYLE_ABSORB);
    STYLE_SPARK.color = kind === 'exp' ? 0x22d3ee : kind === 'eden' ? 0xa855f7 : 0x4ade80;
    STYLE_SPARK.count = 10;
    this.sparks.spawn(position, null, STYLE_SPARK);
    this.spawnRing(position, WORLD_UP, STYLE_ABSORB.color, 1.7, 0.28, 0.8);
  }

  /** Pulso cian de recarga de Edén (touch-and-go sobre un suelo). */
  spawnEdenPulse(position: THREE.Vector3, normal: THREE.Vector3): void {
    this.spawnRing(position, normal, 0x22d3ee, 3.4, 0.5, 0.75);
    STYLE_SPARK.color = 0x67e8f9;
    STYLE_SPARK.count = 12;
    this.sparks.spawn(position, normal, STYLE_SPARK);
  }

  // ------------------------------------------------------------------
  // Bucle
  // ------------------------------------------------------------------

  update(
    dt: number,
    playerPos: THREE.Vector3,
    velocity: THREE.Vector3,
    facing: THREE.Vector3,
    mode: NyxMovementMode,
    isDrillReady: boolean,
    slabs: SlabCollider[],
    up: THREE.Vector3,
  ): void {
    const speed = velocity.length();
    this.sparks.update(dt);
    this.dust.update(dt);
    this.updateRings(dt);
    this.updateStreaks(dt, playerPos, velocity, speed);
    this.updateAura(dt, playerPos, velocity, facing, speed, mode, isDrillReady, up);
    this.updateTelemetry(dt, playerPos, velocity, speed, mode, slabs, up);
  }

  private updateRings(dt: number): void {
    for (let i = 0; i < MAX_RINGS; i++) {
      if (this.ringLife[i] <= 0) continue;
      this.ringLife[i] -= dt;
      const ring = this.rings[i];
      if (this.ringLife[i] <= 0) {
        ring.visible = false;
        continue;
      }
      const t = 1 - this.ringLife[i] / this.ringMaxLife[i];
      ring.scale.setScalar(0.8 + t * this.ringMaxScale[i]);
      (ring.material as THREE.MeshBasicMaterial).opacity =
        (1 - t) * (1 - t) * this.ringOpacity[i];
    }
  }

  private updateStreaks(
    dt: number,
    playerPos: THREE.Vector3,
    velocity: THREE.Vector3,
    speed: number,
  ): void {
    // Spawn proporcional al exceso de velocidad sobre el umbral.
    if (speed > STREAK_MIN_SPEED) {
      this.streakAccum += dt * (speed - STREAK_MIN_SPEED) * 1.9;
      const spawnCount = Math.min(6, Math.floor(this.streakAccum));
      if (spawnCount > 0) {
        this.streakAccum -= spawnCount;
        _sDir.copy(velocity).multiplyScalar(1 / speed);
        this.spawnStreaks(playerPos, _sDir, speed, spawnCount);
      }
    } else {
      this.streakAccum = 0;
    }

    for (let i = 0; i < MAX_STREAKS; i++) {
      const i3 = i * 3;
      const i6 = i * 6;
      if (this.streakLife[i] <= 0) {
        // Vértices colapsados: la línea no dibuja nada.
        this.streakVerts[i6] = 0;
        this.streakVerts[i6 + 1] = 0;
        this.streakVerts[i6 + 2] = 0;
        this.streakVerts[i6 + 3] = 0;
        this.streakVerts[i6 + 4] = 0;
        this.streakVerts[i6 + 5] = 0;
        this.streakColors[i6] = 0;
        this.streakColors[i6 + 1] = 0;
        this.streakColors[i6 + 2] = 0;
        this.streakColors[i6 + 3] = 0;
        this.streakColors[i6 + 4] = 0;
        this.streakColors[i6 + 5] = 0;
        continue;
      }
      this.streakLife[i] -= dt;
      const px = this.streakPos[i3] + this.streakDir[i3] * this.streakSpeed[i] * dt;
      const py = this.streakPos[i3 + 1] + this.streakDir[i3 + 1] * this.streakSpeed[i] * dt;
      const pz = this.streakPos[i3 + 2] + this.streakDir[i3 + 2] * this.streakSpeed[i] * dt;
      this.streakPos[i3] = px;
      this.streakPos[i3 + 1] = py;
      this.streakPos[i3 + 2] = pz;

      const len = this.streakLen[i];
      this.streakVerts[i6] = px;
      this.streakVerts[i6 + 1] = py;
      this.streakVerts[i6 + 2] = pz;
      this.streakVerts[i6 + 3] = px - this.streakDir[i3] * len;
      this.streakVerts[i6 + 4] = py - this.streakDir[i3 + 1] * len;
      this.streakVerts[i6 + 5] = pz - this.streakDir[i3 + 2] * len;

      const fade = Math.max(0, this.streakLife[i] / this.streakMaxLife[i]);
      const r = 0.82 * fade;
      const g = 0.95 * fade;
      const b = 1.0 * fade;
      this.streakColors[i6] = r;
      this.streakColors[i6 + 1] = g;
      this.streakColors[i6 + 2] = b;
      this.streakColors[i6 + 3] = r * 0.15;
      this.streakColors[i6 + 4] = g * 0.15;
      this.streakColors[i6 + 5] = b * 0.15;
    }

    const geometry = this.streaks.geometry;
    (geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  private spawnStreaks(
    playerPos: THREE.Vector3,
    velDir: THREE.Vector3,
    speed: number,
    count: number,
  ): void {
    // Base perpendicular estable para repartir los trazos en un cilindro.
    _sUp.copy(WORLD_UP);
    if (Math.abs(velDir.dot(_sUp)) > 0.95) _sUp.set(1, 0, 0);
    _sRight.crossVectors(velDir, _sUp).normalize();
    _sUp.crossVectors(_sRight, velDir).normalize();

    for (let n = 0; n < count; n++) {
      const idx = this.streakCursor;
      this.streakCursor = (this.streakCursor + 1) % MAX_STREAKS;
      const i3 = idx * 3;

      const radius = 1.2 + Math.random() * 4.2;
      const angle = Math.random() * Math.PI * 2;
      const ahead = 2 + Math.random() * 9;
      _sOffset
        .copy(_sRight)
        .multiplyScalar(Math.cos(angle) * radius)
        .addScaledVector(_sUp, Math.sin(angle) * radius)
        .addScaledVector(velDir, ahead);

      this.streakPos[i3] = playerPos.x + _sOffset.x;
      this.streakPos[i3 + 1] = playerPos.y + _sOffset.y;
      this.streakPos[i3 + 2] = playerPos.z + _sOffset.z;

      // Pasan junto a Nyx en dirección opuesta a su velocidad.
      this.streakDir[i3] = -velDir.x;
      this.streakDir[i3 + 1] = -velDir.y;
      this.streakDir[i3 + 2] = -velDir.z;

      this.streakSpeed[idx] = speed * 0.85 + 5;
      this.streakLen[idx] = 1.2 + speed * 0.11;
      const life = 0.32 + Math.random() * 0.26;
      this.streakLife[idx] = life;
      this.streakMaxLife[idx] = life;
    }
  }

  private updateAura(
    dt: number,
    playerPos: THREE.Vector3,
    velocity: THREE.Vector3,
    facing: THREE.Vector3,
    speed: number,
    mode: NyxMovementMode,
    isDrillReady: boolean,
    up: THREE.Vector3,
  ): void {
    const terminal = speed >= TERMINAL_SPEED || isDrillReady;
    const target = terminal && mode !== 'grounded' ? 1 : 0;
    const lambda = target > this.auraIntensity ? 10 : 6;
    this.auraIntensity += (target - this.auraIntensity) * (1 - Math.exp(-lambda * dt));
    if (this.auraIntensity < 0.01) {
      this.aura.visible = false;
      return;
    }
    this.aura.visible = true;
    // Centrada en el torso (el root de Nyx está a los pies).
    this.aura.position.copy(playerPos).addScaledVector(up, 0.95);
    _sDir.copy(velocity);
    if (_sDir.lengthSq() < 1e-4) _sDir.copy(facing);
    if (_sDir.lengthSq() < 1e-4) _sDir.set(0, 0, -1);
    _sDir.normalize();
    this.aura.quaternion.setFromUnitVectors(RING_FORWARD, _sDir);
    const stretch = 1.6 + Math.min(1.6, speed * 0.05);
    this.aura.scale.set(0.95, 0.95, stretch);
    (this.aura.material as THREE.MeshBasicMaterial).opacity = 0.16 * this.auraIntensity;
  }

  private updateTelemetry(
    dt: number,
    playerPos: THREE.Vector3,
    velocity: THREE.Vector3,
    speed: number,
    mode: NyxMovementMode,
    slabs: SlabCollider[],
    up: THREE.Vector3,
  ): void {
    // Solo en vuelo con algo de velocidad: en suelo o flotando quieta el
    // telémetro no aporta lectura y el raycast no se paga.
    if (mode === 'grounded' || slabs.length === 0 || speed < 2.5) {
      this.telemetryOpacity = Math.max(0, this.telemetryOpacity - dt * 6);
      this.telemetry.visible = this.telemetryOpacity > 0.01;
      return;
    }

    // Dirección de aproximación: en picado manda el vector de velocidad; en
    // vuelo normal, la "abajo" del cuerpo (la que va a tocar el suelo).
    if (mode === 'speed_attack' && speed > 6) _sDir.copy(velocity).multiplyScalar(1 / speed);
    else _sDir.copy(up).multiplyScalar(-1);

    const hit = raycastSlabs(slabs, playerPos, _sDir, TELEMETRY_RANGE, _telemetryHit);
    if (!hit) {
      this.telemetryOpacity = Math.max(0, this.telemetryOpacity - dt * 6);
      this.telemetry.visible = this.telemetryOpacity > 0.01;
      return;
    }

    const dist = hit.distance;
    // Se define al acercarse: entra desde 14 m y se cierra a 1.5 m.
    const near = 1 - Math.min(1, Math.max(0, (dist - 1.5) / (TELEMETRY_RANGE - 1.5)));
    const target = near * near;
    this.telemetryOpacity += (target - this.telemetryOpacity) * (1 - Math.exp(-12 * dt));
    if (this.telemetryOpacity < 0.01) {
      this.telemetry.visible = false;
      return;
    }

    this.telemetry.visible = true;
    this.telemetry.position.copy(hit.point).addScaledVector(hit.normal, 0.03);
    this.telemetry.quaternion.setFromUnitVectors(WORLD_UP, hit.normal);
    const radius = 0.55 + (1 - near) * 1.15;
    this.telemetryDisc.scale.setScalar(radius);
    this.telemetryRing.scale.setScalar(radius * (0.55 + near * 0.45));
    (this.telemetryDisc.material as THREE.MeshBasicMaterial).opacity =
      0.34 * this.telemetryOpacity;
    (this.telemetryRing.material as THREE.MeshBasicMaterial).opacity =
      0.85 * this.telemetryOpacity;
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  private spawnRing(
    position: THREE.Vector3,
    normal: THREE.Vector3,
    color: number,
    maxScale: number,
    lifetime: number,
    opacity: number,
  ): void {
    // setFromUnitVectors exige vectores UNITARIOS: se normaliza aquí para que
    // cualquier llamada (velocidad sin normalizar, normal de contacto) valga.
    _ringNormal.copy(normal);
    if (_ringNormal.lengthSq() < 1e-8) _ringNormal.copy(WORLD_UP);
    else _ringNormal.normalize();
    const idx = this.ringCursor;
    this.ringCursor = (this.ringCursor + 1) % MAX_RINGS;
    const ring = this.rings[idx];
    ring.position.copy(position);
    ring.quaternion.setFromUnitVectors(RING_FORWARD, _ringNormal);
    ring.scale.setScalar(0.8);
    ring.visible = true;
    (ring.material as THREE.MeshBasicMaterial).color.setHex(color);
    this.ringLife[idx] = lifetime;
    this.ringMaxLife[idx] = lifetime;
    this.ringMaxScale[idx] = maxScale;
    this.ringOpacity[idx] = opacity;
  }

  dispose(): void {
    this.sparks.dispose();
    this.dust.dispose();
    for (const ring of this.rings) {
      this.scene.remove(ring);
      ring.geometry.dispose();
      (ring.material as THREE.MeshBasicMaterial).dispose();
    }
    this.scene.remove(this.streaks);
    this.streaks.geometry.dispose();
    (this.streaks.material as THREE.LineBasicMaterial).dispose();
    this.scene.remove(this.aura);
    this.aura.geometry.dispose();
    (this.aura.material as THREE.MeshBasicMaterial).dispose();
    this.scene.remove(this.telemetry);
    this.telemetryDisc.geometry.dispose();
    (this.telemetryDisc.material as THREE.MeshBasicMaterial).dispose();
    this.telemetryRing.geometry.dispose();
    (this.telemetryRing.material as THREE.MeshBasicMaterial).dispose();
  }
}
