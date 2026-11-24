import * as THREE from 'three';

// ============================================================================
// ComicImpactVfx — VFX procedurales de materia oscura (estilo Gravity Rush)
// ============================================================================
// Puerto 3D de la referencia impacto_y_explosión.html, adaptado al combate de
// la cúpula para que RESPONDA al golpe, la velocidad y la habilidad:
//
// - `spawnComicHit(pos, normal, intensity, enemyRadius)`: patada/taladro
//   contra un enemigo o daño de habilidad con impulso. Destello estrella +
//   picos rombo whose cantidad, largo y velocidad escalan con `intensity`
//   (velocidad de impacto o magnitud del impulso de la skill) y con el radio
//   de la hitbox del bicho, sesgados hacia `normal`.
// - `spawnComicExplosion(pos, radius)`: muerte de enemigo. Ráfaga de 0.8 s
//   de estrella grande + andanada de picos de nebulosa (el shader del
//   enemigo), escalada por el radio del bicho.
//
// Optimización (mismo contrato que MotionVfx: CERO allocations por frame):
// - Picos: TODOS los rombos viven en un único BufferGeometry (una draw call);
//   cada pico es un quad de 4 vértices con color por vértice, entintado en
//   el plano que contiene su dirección y mira a cámara. Desaparecen por
//   estrechamiento (ancho → 0), así que el material es OPACO: sin blending
//   ni problemas de orden. Un único ShaderMaterial cubre los dos modos:
//   color plano (golpes, paleta cómic) o nebulosa del enemigo en espacio
//   de pantalla (explosiones), elegido por el atributo aVoid por vértice.
// - Estrellas: pool de sprites con 2 texturas canvas pre-generadas (7 y 10
//   puntas, relleno blanco + contorno de tinta).
// ============================================================================

const MAX_SHARDS = 128;
const MAX_STARS = 6;
// Paleta de materia oscura de la referencia (golpes).
const COLOR_RED = 0xff1e42;
const COLOR_WHITE = 0xf8fafc;
const COLOR_INK = 0x09070d;
// Paleta de vacío/gravedad (explosiones): violeta espacial + brillo cian.
const COLOR_VOID = 0x7c3aed;
const COLOR_GLOW = 0x8ff5ff;

// ============================================================================
// Shader de nebulosa de los enemigos (puerto de enemyNebulaFrag de
// DomeEnemyModels): los cachos de la explosión son fragmentos del mismo
// universo interior — FBM en espacio de pantalla + estrellas titilantes.
// Los picos de golpe (paleta cómic) salen planos: el atributo aVoid decide.
// ============================================================================
const SHARD_VERT = /* glsl */ `
  attribute vec3 color;
  attribute float aVoid;
  varying vec3 vColor;
  varying float vVoid;
  void main() {
    vColor = color;
    vVoid = aVoid;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  }
`;

// Funciones de ruido compartidas por los picos y la nube de vacío (mismas
// que la carne del enemigo: hash → value noise → FBM + capa de estrellas).
const NOISE_GLSL = /* glsl */ `
  float hash21( vec2 p ) {
    p = fract( p * vec2( 234.34, 435.345 ) );
    p += dot( p, p + 34.23 );
    return fract( p.x * p.y );
  }
  float noise2( vec2 p ) {
    vec2 i = floor( p );
    vec2 f = fract( p );
    f = f * f * ( 3.0 - 2.0 * f );
    return mix(
      mix( hash21( i ), hash21( i + vec2( 1.0, 0.0 ) ), f.x ),
      mix( hash21( i + vec2( 0.0, 1.0 ) ), hash21( i + vec2( 1.0, 1.0 ) ), f.x ),
      f.y
    );
  }
  float fbm( vec2 p ) {
    float v = 0.0; float a = 0.5;
    mat2 m = mat2( 0.8, 0.6, -0.6, 0.8 );
    for ( int i = 0; i < 4; i++ ) { v += a * noise2( p ); p = m * p * 2.02; a *= 0.5; }
    return v;
  }
  float starLayer( vec2 uv, float scale, float speed ) {
    vec2 gv = fract( uv * scale ) - 0.5;
    vec2 id = floor( uv * scale );
    float h = hash21( id );
    if ( h < 0.70 ) return 0.0;
    vec2 offset = vec2( hash21( id + 7.1 ), hash21( id + 13.7 ) ) - 0.5;
    float d = length( gv - offset * 0.65 );
    float tw = 0.6 + 0.4 * sin( uTime * speed + h * 40.0 );
    return smoothstep( mix( 0.05, 0.16, fract( h * 19.3 ) ), 0.0, d ) * tw;
  }
`;

const SHARD_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  varying vec3 vColor;
  varying float vVoid;
  ${NOISE_GLSL}
  void main() {
    // Picos de golpe: color plano de paleta cómic.
    if ( vVoid < 0.5 ) {
      gl_FragColor = vec4( vColor, 1.0 );
      return;
    }
    // Cachos de vacío: nebulosa del enemigo en espacio de pantalla, con el
    // color por vértice (violeta/cian/tinta) como tinte del fragmento.
    vec2 uv = gl_FragCoord.xy * 0.0048;
    vec2 drift = vec2( uTime * 0.045, -uTime * 0.03 );
    float n1 = fbm( uv * 1.6 + drift );
    float n2 = fbm( uv * 2.5 - drift * 1.3 + n1 * 0.9 );
    vec3 col = vec3( 0.02, 0.008, 0.035 );
    col = mix( col, uColorA * 0.48, smoothstep( 0.36, 0.80, n1 ) );
    col = mix( col, uColorB * 0.62, smoothstep( 0.48, 0.88, n2 ) );
    float stars = starLayer( uv + drift * 0.35, 14.0, 2.6 ) * 1.3
                + starLayer( uv - drift * 0.22, 24.0, 3.8 ) * 1.6;
    col += mix( vec3( 1.0 ), vColor, 0.3 ) * stars;
    col += vColor * 0.3;
    gl_FragColor = vec4( col, 1.0 );
  }
`;

const _shardDir = new THREE.Vector3();
const _shardRight = new THREE.Vector3();
const _shardView = new THREE.Vector3();
const _tmpColor = new THREE.Color();

export class ComicImpactVfxSystem {
  private readonly scene: THREE.Scene;

  // --- Picos rombo (una draw call)
  private readonly shardMesh: THREE.Mesh;
  private readonly shardMaterial: THREE.ShaderMaterial;
  private readonly shardPositions: Float32Array;
  private readonly shardColors: Float32Array;
  private readonly shardVoid: Float32Array;
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
  private readonly starEndColor: number[] = [];
  private readonly starTextures: THREE.Texture[];
  private starCursor = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // --- Picos: geometría indexada compartida, color por vértice.
    this.shardPositions = new Float32Array(MAX_SHARDS * 4 * 3);
    this.shardColors = new Float32Array(MAX_SHARDS * 4 * 3);
    this.shardVoid = new Float32Array(MAX_SHARDS * 4);
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
    shardGeometry.setAttribute('aVoid', new THREE.BufferAttribute(this.shardVoid, 1));
    shardGeometry.setIndex(new THREE.BufferAttribute(indices, 1));
    // Paleta de nebulosa abisal violeta (la misma familia que la carne de
    // los enemigos): los cachos de la explosión son trozos de su universo.
    this.shardMaterial = new THREE.ShaderMaterial({
      vertexShader: SHARD_VERT,
      fragmentShader: SHARD_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uColorA: { value: new THREE.Color(0x8b5cf6) },
        uColorB: { value: new THREE.Color(0x4c1d95) },
      },
      side: THREE.DoubleSide,
    });
    this.shardMesh = new THREE.Mesh(shardGeometry, this.shardMaterial);
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
      this.starEndColor.push(COLOR_RED);
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

  }

  // ------------------------------------------------------------------
  // Spawns
  // ------------------------------------------------------------------

  /**
   * Impacto de golpe/taladro/habilidad sobre un enemigo: estrella de cómic +
   * picos rojos/blancos/tinta que salen sesgados hacia `normal`, con cantidad,
   * largo y velocidad proporcionales a `intensity` (0.35..1.3) y al radio de
   * la hitbox del enemigo (`enemyRadius`, en m): un golpe al KRONOS lee el
   * doble de grande que el mismo golpe a una mariposa.
   */
  spawnComicHit(
    position: THREE.Vector3,
    normal: THREE.Vector3 | null,
    intensity: number,
    enemyRadius = 1.6,
  ): void {
    const clamped = Math.max(0.35, Math.min(1.3, intensity));
    const sizeScale = 0.8 + enemyRadius * 0.38;
    this.spawnStar(position, 0, (2.3 + clamped * 2.0) * sizeScale, 0.1);
    const count = 12 + Math.round(clamped * 10 + enemyRadius * 2);
    for (let i = 0; i < count; i++) {
      this.spawnShard(position, normal, clamped, 1.3 * sizeScale, false);
    }
  }

  /**
   * Explosión de muerte de enemigo: ráfaga de 0.8 s de estrella grande de 10
   * puntas + andanada de picos de nebulosa (el shader del enemigo), todo
   * escalado por el radio del bicho.
   */
  spawnComicExplosion(position: THREE.Vector3, radius: number): void {
    this.spawnStar(position, 1, 2.6 + radius * 1.9, 0.18, COLOR_VOID);
    const count = 18 + Math.floor(radius * 5 + Math.random() * 8);
    for (let i = 0; i < count; i++) {
      this.spawnShard(position, null, 1.3, 1.55, true, 2.2);
    }
  }

  private spawnShard(
    position: THREE.Vector3,
    normal: THREE.Vector3 | null,
    intensity: number,
    factor: number,
    voidPalette: boolean,
    lifeScale = 1,
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
    const life = (0.16 + Math.random() * 0.14) * (factor > 1.2 ? 1.25 : 1) * lifeScale;
    this.shardLife[idx] = life;
    this.shardMaxLife[idx] = life;

    // Mezcla de tinta: golpes en paleta cómic (rojo dominante), explosiones
    // y cachitos en paleta de vacío (violeta + brillo cian + tinta).
    const roll = Math.random();
    _tmpColor.setHex(
      voidPalette
        ? roll > 0.42
          ? COLOR_VOID
          : roll > 0.2
            ? COLOR_GLOW
            : COLOR_INK
        : roll > 0.25
          ? COLOR_RED
          : roll > 0.12
            ? COLOR_WHITE
            : COLOR_INK,
    );
    for (let v = 0; v < 4; v++) {
      const c = (idx * 4 + v) * 3;
      this.shardColors[c] = _tmpColor.r;
      this.shardColors[c + 1] = _tmpColor.g;
      this.shardColors[c + 2] = _tmpColor.b;
      this.shardVoid[idx * 4 + v] = voidPalette ? 1 : 0;
    }
  }

  private spawnStar(
    position: THREE.Vector3,
    textureIndex: number,
    maxScale: number,
    lifetime: number,
    endColor = COLOR_RED,
  ): void {
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
    this.starEndColor[idx] = endColor;
  }

  // ------------------------------------------------------------------
  // Bucle
  // ------------------------------------------------------------------

  update(dt: number, camera: THREE.Camera): void {
    if (dt <= 0) return;
    this.shardMaterial.uniforms.uTime.value += dt;
    this.updateShards(dt, camera.position);
    this.updateStars(dt);
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
      (geometry.getAttribute('aVoid') as THREE.BufferAttribute).needsUpdate = true;
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
      // Abre y cierra en sin(p): blanca la primera mitad, después el color
      // final del destello (rojo en golpes, violeta en explosiones).
      star.scale.setScalar(Math.max(0.01, this.starMaxScale[i] * Math.sin(p * Math.PI)));
      star.material.color.setHex(p < 0.5 ? COLOR_WHITE : this.starEndColor[i]);
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

  dispose(): void {
    this.scene.remove(this.shardMesh);
    this.shardMesh.geometry.dispose();
    this.shardMaterial.dispose();
    for (const star of this.stars) {
      this.scene.remove(star);
      star.material.dispose();
    }
    for (const texture of this.starTextures) texture.dispose();
  }
}
