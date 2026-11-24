import * as THREE from 'three';

// ============================================================================
// ComicImpactVfx — VFX procedurales de materia oscura (estilo Gravity Rush)
// ============================================================================
// Puerto 3D de la referencia impacto_y_explosión.html, adaptado al combate de
// la cúpula para que RESPONDA al golpe, la velocidad y la habilidad:
//
// - `spawnComicHit(pos, normal, intensity)`: patada/taladro contra un enemigo
//   o daño de habilidad con impulso. Destello estrella + picos rombo whose
//   cantidad, largo y velocidad escalan con `intensity` (velocidad de impacto
//   o magnitud del impulso de la skill), sesgados hacia `normal`.
// - `spawnComicExplosion(pos, radius)`: muerte de enemigo. Humo rosa cel-shaded
//   (atlas de 8 frames pre-renderizados con halftone, erosión y tinta) +
//   estrella grande + andanada de picos ×1.5 escalada por el radio del bicho.
//
// Optimización (mismo contrato que MotionVfx: CERO allocations por frame):
// - Picos: TODOS los rombos viven en un único BufferGeometry (una draw call);
//   cada pico es un quad de 4 vértices con color por vértice, entintado en
//   el plano que contiene su dirección y mira a cámara. Desaparecen por
//   estrechamiento (ancho → 0), así que el material es OPACO: sin blending
//   ni problemas de orden.
// - Estrellas: pool de sprites con 2 texturas canvas pre-generadas (7 y 10
//   puntas, relleno blanco + contorno de tinta).
// - Humo: pool de 4 sprites que comparten imagen de atlas y animan el frame
//   con `texture.offset` (la nube entera —sombras de tinta, halftone, banda
//   cel, agujero de erosión— viene horneada por frame).
// ============================================================================

const MAX_SHARDS = 96;
const MAX_STARS = 6;
const MAX_SMOKES = 4;

const SMOKE_FRAMES = 8;
const SMOKE_FRAME_SIZE = 160;
const SMOKE_LIFETIME = 0.66; // 40 frames de la referencia a ~60 fps

// Paleta de materia oscura de la referencia.
const COLOR_RED = 0xff1e42;
const COLOR_WHITE = 0xf8fafc;
const COLOR_INK = 0x09070d;

const _shardDir = new THREE.Vector3();
const _shardRight = new THREE.Vector3();
const _shardView = new THREE.Vector3();
const _tmpColor = new THREE.Color();

interface SmokeLobe {
  angle: number;
  force: number;
  width: number;
}

/** Ruido angular del humo (puerto de NubeHumoRosa.ruidoHumo). */
function smokeNoise(angle: number, t: number, seed: number, lobes: SmokeLobe[]): number {
  let val =
    Math.sin(angle * 5 + seed) * 0.35 +
    Math.cos(angle * 11 - seed * 1.7 + t) * 0.25 +
    Math.sin(angle * 19 + t * 1.4) * 0.15;
  for (const lob of lobes) {
    const diff = Math.atan2(Math.sin(angle - lob.angle), Math.cos(angle - lob.angle));
    const bell = Math.exp(-(diff * diff) * lob.width);
    val += bell * lob.force;
  }
  return val;
}

export class ComicImpactVfxSystem {
  private readonly scene: THREE.Scene;

  // --- Picos rombo (una draw call)
  private readonly shardMesh: THREE.Mesh;
  private readonly shardPositions: Float32Array;
  private readonly shardColors: Float32Array;
  private readonly shardDir: Float32Array;
  private readonly shardOrigin: Float32Array;
  private readonly shardSpeed: Float32Array;
  private readonly shardDist: Float32Array;
  private readonly shardLenMax: Float32Array;
  private readonly shardWidthMax: Float32Array;
  private readonly shardLife: Float32Array;
  private readonly shardMaxLife: Float32Array;
  private shardCursor = 0;

  // --- Destellos estrella de cómic
  private readonly stars: THREE.Sprite[] = [];
  private readonly starLife: Float32Array;
  private readonly starMaxLife: Float32Array;
  private readonly starMaxScale: Float32Array;
  private readonly starTextures: THREE.Texture[];
  private starCursor = 0;

  // --- Humo rosa cel-shaded (atlas de frames)
  private readonly smokes: THREE.Sprite[] = [];
  private readonly smokeTextures: THREE.Texture[] = [];
  private readonly smokeLife: Float32Array;
  private readonly smokeMaxLife: Float32Array;
  private smokeCursor = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // --- Picos: geometría indexada compartida, color por vértice.
    this.shardPositions = new Float32Array(MAX_SHARDS * 4 * 3);
    this.shardColors = new Float32Array(MAX_SHARDS * 4 * 3);
    this.shardDir = new Float32Array(MAX_SHARDS * 3);
    this.shardOrigin = new Float32Array(MAX_SHARDS * 3);
    this.shardSpeed = new Float32Array(MAX_SHARDS);
    this.shardDist = new Float32Array(MAX_SHARDS);
    this.shardLenMax = new Float32Array(MAX_SHARDS);
    this.shardWidthMax = new Float32Array(MAX_SHARDS);
    this.shardLife = new Float32Array(MAX_SHARDS);
    this.shardMaxLife = new Float32Array(MAX_SHARDS);

    const indices = new Uint16Array(MAX_SHARDS * 6);
    for (let i = 0; i < MAX_SHARDS; i++) {
      const v = i * 4;
      const o = i * 6;
      indices[o] = v;
      indices[o + 1] = v + 1;
      indices[o + 2] = v + 2;
      indices[o + 3] = v;
      indices[o + 4] = v + 2;
      indices[o + 5] = v + 3;
    }
    const shardGeometry = new THREE.BufferGeometry();
    shardGeometry.setAttribute('position', new THREE.BufferAttribute(this.shardPositions, 3));
    shardGeometry.setAttribute('color', new THREE.BufferAttribute(this.shardColors, 3));
    shardGeometry.setIndex(new THREE.BufferAttribute(indices, 1));
    this.shardMesh = new THREE.Mesh(
      shardGeometry,
      new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    );
    this.shardMesh.frustumCulled = false;
    scene.add(this.shardMesh);

    // --- Estrellas: 2 texturas (golpe 7 puntas / explosión 10 puntas).
    this.starTextures = [
      ComicImpactVfxSystem.createStarTexture(7),
      ComicImpactVfxSystem.createStarTexture(10),
    ];
    this.starLife = new Float32Array(MAX_STARS);
    this.starMaxLife = new Float32Array(MAX_STARS);
    this.starMaxScale = new Float32Array(MAX_STARS);
    for (let i = 0; i < MAX_STARS; i++) {
      const star = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.starTextures[i % 2],
          transparent: true,
          depthWrite: false,
        }),
      );
      star.visible = false;
      star.frustumCulled = false;
      this.stars.push(star);
      scene.add(star);
    }

    // --- Humo: atlas pre-renderizado; cada sprite clona la textura para
    // animar su `offset` de frame de forma independiente.
    const atlas = ComicImpactVfxSystem.createSmokeAtlas();
    this.smokeLife = new Float32Array(MAX_SMOKES);
    this.smokeMaxLife = new Float32Array(MAX_SMOKES);
    for (let i = 0; i < MAX_SMOKES; i++) {
      const texture = atlas.clone();
      texture.needsUpdate = true;
      this.smokeTextures.push(texture);
      const smoke = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: texture,
          transparent: true,
          depthWrite: false,
        }),
      );
      smoke.visible = false;
      smoke.frustumCulled = false;
      this.smokes.push(smoke);
      scene.add(smoke);
    }
  }

  // ------------------------------------------------------------------
  // Spawns
  // ------------------------------------------------------------------

  /**
   * Impacto de golpe/taladro/habilidad sobre un enemigo: estrella de cómic +
   * picos rojos/blancos/tinta que salen sesgados hacia `normal`, con cantidad,
   * largo y velocidad proporcionales a `intensity` (0.35..1.3).
   */
  spawnComicHit(position: THREE.Vector3, normal: THREE.Vector3 | null, intensity: number): void {
    const clamped = Math.max(0.35, Math.min(1.3, intensity));
    this.spawnStar(position, 0, 1.5 + clamped * 1.3, 0.1);
    const count = 10 + Math.round(clamped * 10);
    for (let i = 0; i < count; i++) {
      this.spawnShard(position, normal, clamped, 1.0);
    }
  }

  /**
   * Explosión de muerte de enemigo: humo rosa cel-shaded + estrella grande de
   * 10 puntas + andanada de picos ×1.5, todo escalado por el radio del bicho.
   */
  spawnComicExplosion(position: THREE.Vector3, radius: number): void {
    this.spawnSmoke(position, radius);
    this.spawnStar(position, 1, 2.2 + radius * 1.7, 0.15);
    const count = 24 + Math.floor(Math.random() * 8);
    for (let i = 0; i < count; i++) {
      this.spawnShard(position, null, 1.3, 1.55);
    }
  }

  private spawnShard(
    position: THREE.Vector3,
    normal: THREE.Vector3 | null,
    intensity: number,
    factor: number,
  ): void {
    const idx = this.shardCursor;
    this.shardCursor = (this.shardCursor + 1) % MAX_SHARDS;
    const i3 = idx * 3;

    // Dirección: esfera aleatoria sesgada hacia la normal del golpe.
    let dx = Math.random() * 2 - 1;
    let dy = Math.random() * 2 - 1;
    let dz = Math.random() * 2 - 1;
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len;
    dy /= len;
    dz /= len;
    if (normal) {
      dx = dx * 0.55 + normal.x * 0.75;
      dy = dy * 0.55 + normal.y * 0.75;
      dz = dz * 0.55 + normal.z * 0.75;
      const nlen = Math.hypot(dx, dy, dz) || 1;
      dx /= nlen;
      dy /= nlen;
      dz /= nlen;
    }
    this.shardOrigin[i3] = position.x;
    this.shardOrigin[i3 + 1] = position.y;
    this.shardOrigin[i3 + 2] = position.z;
    this.shardDir[i3] = dx;
    this.shardDir[i3 + 1] = dy;
    this.shardDir[i3 + 2] = dz;

    this.shardDist[idx] = 0.1 + Math.random() * 0.25;
    this.shardSpeed[idx] = (9 + Math.random() * 9) * (0.7 + intensity * 0.5) * factor;
    this.shardLenMax[idx] = (0.9 + Math.random() * 1.6) * (0.75 + intensity * 0.55) * factor;
    this.shardWidthMax[idx] = (0.12 + Math.random() * 0.16) * factor;
    const life = (0.16 + Math.random() * 0.14) * (factor > 1.2 ? 1.25 : 1);
    this.shardLife[idx] = life;
    this.shardMaxLife[idx] = life;

    // Mezcla de tinta cómic: rojo dominante, blanco y tinta de contraste.
    const roll = Math.random();
    _tmpColor.setHex(roll > 0.25 ? COLOR_RED : roll > 0.12 ? COLOR_WHITE : COLOR_INK);
    for (let v = 0; v < 4; v++) {
      const c = (idx * 4 + v) * 3;
      this.shardColors[c] = _tmpColor.r;
      this.shardColors[c + 1] = _tmpColor.g;
      this.shardColors[c + 2] = _tmpColor.b;
    }
  }

  private spawnStar(position: THREE.Vector3, textureIndex: number, maxScale: number, lifetime: number): void {
    const idx = this.starCursor;
    this.starCursor = (this.starCursor + 1) % MAX_STARS;
    const star = this.stars[idx];
    star.position.copy(position);
    star.material.map = this.starTextures[textureIndex];
    star.material.rotation = Math.random() * Math.PI;
    star.material.opacity = 1;
    star.scale.setScalar(0.01);
    star.visible = true;
    this.starLife[idx] = lifetime;
    this.starMaxLife[idx] = lifetime;
    this.starMaxScale[idx] = maxScale;
  }

  private spawnSmoke(position: THREE.Vector3, radius: number): void {
    const idx = this.smokeCursor;
    this.smokeCursor = (this.smokeCursor + 1) % MAX_SMOKES;
    const smoke = this.smokes[idx];
    smoke.position.copy(position);
    smoke.material.rotation = Math.random() * Math.PI * 2;
    smoke.material.opacity = 1;
    smoke.scale.setScalar(Math.max(2.6, Math.min(7.5, radius * 3.2)));
    smoke.visible = true;
    this.smokeLife[idx] = SMOKE_LIFETIME;
    this.smokeMaxLife[idx] = SMOKE_LIFETIME;
  }

  // ------------------------------------------------------------------
  // Bucle
  // ------------------------------------------------------------------

  update(dt: number, cameraPos: THREE.Vector3): void {
    if (dt <= 0) return;
    this.updateShards(dt, cameraPos);
    this.updateStars(dt);
    this.updateSmokes(dt);
  }

  private updateShards(dt: number, cameraPos: THREE.Vector3): void {
    let dirty = false;
    for (let i = 0; i < MAX_SHARDS; i++) {
      if (this.shardLife[i] <= 0) continue;
      this.shardLife[i] -= dt;
      const base = i * 4 * 3;
      if (this.shardLife[i] <= 0) {
        // Colapsa el quad: 12 ceros y no rasteriza nada.
        for (let v = 0; v < 12; v++) this.shardPositions[base + v] = 0;
        dirty = true;
        continue;
      }
      const p = 1 - this.shardLife[i] / this.shardMaxLife[i];
      const i3 = i * 3;

      // Avance con frenado progresivo (envolvente de la referencia).
      this.shardDist[i] += this.shardSpeed[i] * Math.pow(1 - p, 1.6) * dt;

      // Envolventes de la referencia: el largo abre rápido y cae, el ancho
      // se estrecha hasta colapsar (por eso el material puede ser opaco).
      const len =
        this.shardLenMax[i] * Math.sin(Math.min(1, p * 2.8) * (Math.PI / 2)) * (1 - Math.pow(p, 2.2));
      const width = this.shardWidthMax[i] * (1 - Math.pow(p, 1.3));
      if (len <= 0.02 || width <= 0.015) {
        for (let v = 0; v < 12; v++) this.shardPositions[base + v] = 0;
        dirty = true;
        continue;
      }
      dirty = true;

      // Billboard: el rombo vive en el plano (dir, right) con right
      // perpendicular a la vista, de modo que siempre se lee entero.
      _shardDir.set(this.shardDir[i3], this.shardDir[i3 + 1], this.shardDir[i3 + 2]);
      _shardView
        .set(
          this.shardOrigin[i3] - cameraPos.x,
          this.shardOrigin[i3 + 1] - cameraPos.y,
          this.shardOrigin[i3 + 2] - cameraPos.z,
        )
        .normalize();
      _shardRight.crossVectors(_shardDir, _shardView);
      if (_shardRight.lengthSq() < 1e-6) _shardRight.set(0, 1, 0);
      _shardRight.normalize().multiplyScalar(width);

      const ox = this.shardOrigin[i3];
      const oy = this.shardOrigin[i3 + 1];
      const oz = this.shardOrigin[i3 + 2];
      const dist = this.shardDist[i];
      const midD = dist + len * 0.2;
      const tipD = dist + len;

      // Rombo: arranque, costado+, punta, costado-.
      const corners = [
        ox + _shardDir.x * dist, oy + _shardDir.y * dist, oz + _shardDir.z * dist,
        ox + _shardDir.x * midD + _shardRight.x, oy + _shardDir.y * midD + _shardRight.y, oz + _shardDir.z * midD + _shardRight.z,
        ox + _shardDir.x * tipD, oy + _shardDir.y * tipD, oz + _shardDir.z * tipD,
        ox + _shardDir.x * midD - _shardRight.x, oy + _shardDir.y * midD - _shardRight.y, oz + _shardDir.z * midD - _shardRight.z,
      ];
      for (let v = 0; v < 12; v++) this.shardPositions[base + v] = corners[v];
    }

    if (dirty) {
      const geometry = this.shardMesh.geometry;
      (geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      (geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  private updateStars(dt: number): void {
    for (let i = 0; i < MAX_STARS; i++) {
      if (this.starLife[i] <= 0) continue;
      this.starLife[i] -= dt;
      const star = this.stars[i];
      if (this.starLife[i] <= 0) {
        star.visible = false;
        continue;
      }
      const p = 1 - this.starLife[i] / this.starMaxLife[i];
      // Abre y cierra en sin(p): blanca la primera mitad, roja después.
      star.scale.setScalar(Math.max(0.01, this.starMaxScale[i] * Math.sin(p * Math.PI)));
      star.material.color.setHex(p < 0.5 ? COLOR_WHITE : COLOR_RED);
    }
  }

  private updateSmokes(dt: number): void {
    for (let i = 0; i < MAX_SMOKES; i++) {
      if (this.smokeLife[i] <= 0) continue;
      this.smokeLife[i] -= dt;
      const smoke = this.smokes[i];
      if (this.smokeLife[i] <= 0) {
        smoke.visible = false;
        continue;
      }
      const p = 1 - this.smokeLife[i] / this.smokeMaxLife[i];
      // Atlas: cada frame hornea la expansión, la erosión y la disipación.
      const frame = Math.min(SMOKE_FRAMES - 1, Math.floor(p * SMOKE_FRAMES));
      this.smokeTextures[i].offset.x = frame / SMOKE_FRAMES;
      smoke.material.opacity = p > 0.72 ? 1 - (p - 0.72) / 0.28 : 1;
    }
  }

  // ------------------------------------------------------------------
  // Texturas pre-generadas (canvas 2D, una sola vez)
  // ------------------------------------------------------------------

  /** Estrella de impacto de cómic: relleno blanco + contorno de tinta. */
  private static createStarTexture(points: number): THREE.Texture {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const cx = size / 2;
      const cy = size / 2;
      const rExt = size * 0.46;
      const rInt = rExt * 0.28;
      ctx.beginPath();
      for (let i = 0; i < points * 2; i++) {
        const ang = (i / (points * 2)) * Math.PI * 2;
        const r = i % 2 === 0 ? rExt : rInt;
        const px = cx + Math.cos(ang) * r;
        const py = cy + Math.sin(ang) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineJoin = 'miter';
      ctx.miterLimit = 10;
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#09070d';
      ctx.stroke();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  /**
   * Atlas del humo rosa: SMOKE_FRAMES evoluciones de la nube cel-shaded
   * (sombra de tinta desplazada, cuerpo rosa plano, trama halftone, banda
   * interior y agujero de erosión que crece), horneadas de una vez.
   */
  private static createSmokeAtlas(): THREE.Texture {
    // Lóbulos fijos: todas las explosiones comparten silueta, pero la
    // rotación aleatoria por sprite la disimula.
    const lobes: SmokeLobe[] = [];
    const tongues = 7 + Math.floor(Math.random() * 4);
    for (let i = 0; i < tongues; i++) {
      lobes.push({
        angle: (i / tongues) * Math.PI * 2 + (Math.random() - 0.5) * 0.45,
        force: 0.45 + Math.random() * 0.8,
        width: 2.8 + Math.random() * 4.2,
      });
    }
    const seed = Math.random() * 100;

    // Trama halftone de la referencia (puntos rosas en diagonal de cómic).
    const patternCanvas = document.createElement('canvas');
    patternCanvas.width = 12;
    patternCanvas.height = 12;
    const pctx = patternCanvas.getContext('2d');
    let halftone: CanvasPattern | null = null;
    if (pctx) {
      pctx.fillStyle = 'rgba(225, 29, 72, 0.38)';
      pctx.beginPath();
      pctx.arc(3, 3, 1.7, 0, Math.PI * 2);
      pctx.fill();
      pctx.beginPath();
      pctx.arc(9, 9, 1.7, 0, Math.PI * 2);
      pctx.fill();
    }

    const canvas = document.createElement('canvas');
    canvas.width = SMOKE_FRAME_SIZE * SMOKE_FRAMES;
    canvas.height = SMOKE_FRAME_SIZE;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      halftone = ctx.createPattern(patternCanvas, 'repeat');
      const half = SMOKE_FRAME_SIZE / 2;
      const radiusMax = half * 0.78;
      const vertices = 84;

      for (let f = 0; f < SMOKE_FRAMES; f++) {
        const p = f / (SMOKE_FRAMES - 1);
        const expansion = 1 - Math.pow(1 - p, 4);
        const radius = radiusMax * expansion;
        const cx = f * SMOKE_FRAME_SIZE + half;
        const cy = half;

        // Trazado de la nube (con agujero de erosión a partir de p > 0.24).
        const tracePath = (offsetX: number, offsetY: number, tScale: number) => {
          ctx.beginPath();
          for (let i = 0; i <= vertices; i++) {
            const ang = (i / vertices) * Math.PI * 2;
            const n = smokeNoise(ang, p * 2.2 * tScale, seed, lobes);
            const r = radius * (0.55 + Math.max(0.28, n) * 0.55);
            const px = cx + Math.cos(ang) * r + offsetX;
            const py = cy + Math.sin(ang) * r + offsetY;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          if (p > 0.24) {
            const holeProgress = (p - 0.24) / 0.76;
            const holeRadius = radius * Math.pow(holeProgress, 1.1) * 0.96;
            for (let i = vertices; i >= 0; i--) {
              const ang = (i / vertices) * Math.PI * 2;
              const n = smokeNoise(ang + 1.2, p * 2.8 * tScale, seed, lobes);
              const r = holeRadius * (0.65 + Math.max(0, n) * 0.55);
              const hx = cx + Math.cos(ang) * r + offsetX;
              const hy = cy + Math.sin(ang) * r + offsetY;
              if (i === vertices) ctx.moveTo(hx, hy);
              else ctx.lineTo(hx, hy);
            }
            ctx.closePath();
          }
        };

        // 1. Sombra dura de tinta desplazada.
        tracePath(4, 4, 1);
        ctx.fillStyle = '#09070d';
        ctx.fill('evenodd');

        // 2. Cuerpo rosa plano (blanco el primer instante).
        tracePath(0, 0, 1);
        ctx.fillStyle = p < 0.14 ? '#fff1f2' : '#fda4af';
        ctx.fill('evenodd');

        // 3. Trama halftone sobre el humo.
        if (halftone) {
          tracePath(0, 0, 1);
          ctx.fillStyle = halftone;
          ctx.fill('evenodd');
        }

        // 4. Banda cel interior más clara.
        if (p < 0.65) {
          const bandScale = (1 - p * 0.4) * 0.72;
          ctx.beginPath();
          for (let i = 0; i <= 54; i++) {
            const ang = (i / 54) * Math.PI * 2;
            const n = smokeNoise(ang, p * 3.2, seed, lobes);
            const r = radius * bandScale * (0.5 + Math.max(0.22, n) * 0.5);
            const px = cx + Math.cos(ang) * r;
            const py = cy + Math.sin(ang) * r;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fillStyle = p < 0.25 ? '#ffffff' : '#fecdd3';
          ctx.fill();
        }

        // 5. Entintado exterior grueso.
        tracePath(0, 0, 1);
        ctx.lineJoin = 'round';
        ctx.lineWidth = Math.max(2, 4.5 * (1 - p * 0.45));
        ctx.strokeStyle = '#09070d';
        ctx.stroke();
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.repeat.set(1 / SMOKE_FRAMES, 1);
    texture.wrapS = THREE.RepeatWrapping;
    return texture;
  }

  dispose(): void {
    this.scene.remove(this.shardMesh);
    this.shardMesh.geometry.dispose();
    (this.shardMesh.material as THREE.MeshBasicMaterial).dispose();
    for (const star of this.stars) {
      this.scene.remove(star);
      star.material.dispose();
    }
    for (const texture of this.starTextures) texture.dispose();
    for (const smoke of this.smokes) {
      this.scene.remove(smoke);
      smoke.material.dispose();
    }
    for (const texture of this.smokeTextures) texture.dispose();
  }
}
