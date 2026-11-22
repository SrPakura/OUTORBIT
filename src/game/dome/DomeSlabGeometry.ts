import * as THREE from 'three';

// ============================================================================
// Geometría y material de los suelos arrancados de la cúpula (estética Persona
// 3 Reload / Tartarus): tapa superior 100% plana con damero de baldosas
// cel-shaded y masa de roca/tierra irregular por debajo, como arrancada del
// suelo con la mano.
// ============================================================================

/**
 * PRNG determinista (mulberry32). Todas las perturbaciones de la geometría y
 * del pool de suelos son reproducibles a partir de una seed.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash entero 3D -> [0, 1). Base del value-noise determinista. */
function hash3(ix: number, iy: number, iz: number, seed: number): number {
  let h =
    Math.imul(ix, 374761393) ^
    Math.imul(iy, 668265263) ^
    Math.imul(iz, 1440662683) ^
    Math.imul(seed, 974711);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Value-noise 3D con interpolación suave (smoothstep por eje). */
function valueNoise3(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const sz = fz * fz * (3 - 2 * fz);

  const c000 = hash3(ix, iy, iz, seed);
  const c100 = hash3(ix + 1, iy, iz, seed);
  const c010 = hash3(ix, iy + 1, iz, seed);
  const c110 = hash3(ix + 1, iy + 1, iz, seed);
  const c001 = hash3(ix, iy, iz + 1, seed);
  const c101 = hash3(ix + 1, iy, iz + 1, seed);
  const c011 = hash3(ix, iy + 1, iz + 1, seed);
  const c111 = hash3(ix + 1, iy + 1, iz + 1, seed);

  const x00 = c000 + (c100 - c000) * sx;
  const x10 = c010 + (c110 - c010) * sx;
  const x01 = c001 + (c101 - c001) * sx;
  const x11 = c011 + (c111 - c011) * sx;
  const y0 = x00 + (x10 - x00) * sy;
  const y1 = x01 + (x11 - x01) * sy;
  return y0 + (y1 - y0) * sz;
}

/** FBM determinista 3D (3 octavas), rango aproximado [-0.9, 0.9]. */
function fbm3(x: number, y: number, z: number, seed: number): number {
  let v = 0;
  let amp = 0.5;
  let freq = 1;
  for (let octave = 0; octave < 3; octave++) {
    v += amp * (valueNoise3(x * freq, y * freq, z * freq, seed + octave * 101) * 2 - 1);
    amp *= 0.5;
    freq *= 2.07;
  }
  return v;
}

// ============================================================================
// Material cel-shaded de baldosas P3R (Tartarus)
// ============================================================================

const tileVertexShader = /* glsl */ `
  attribute float aIsTop;

  varying vec3 vLocalPos;
  varying vec3 vLocalNormal;
  varying vec2 vUv;
  varying float vIsTop;
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;

  void main() {
    vLocalPos = position;
    vLocalNormal = normal;
    vUv = uv;
    vIsTop = aIsTop;

    vec4 worldPos = modelMatrix * vec4( position, 1.0 );
    vWorldNormal = normalize( mat3( modelMatrix ) * normal );
    vViewDir = normalize( cameraPosition - worldPos.xyz );

    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const tileFragmentShader = /* glsl */ `
  uniform float uWarning;
  uniform float uOpacity;
  uniform float uTime;
  uniform vec3 uSunDir;

  varying vec3 vLocalPos;
  varying vec3 vLocalNormal;
  varying vec2 vUv;
  varying float vIsTop;
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;

  // Paleta P3R / Tartarus
  const vec3 TILE_LIGHT = vec3( 0.910, 0.933, 0.969 ); // #e8eef7 marfil
  const vec3 TILE_DARK  = vec3( 0.106, 0.145, 0.220 ); // #1b2538 azul-gris
  const vec3 GROUT       = vec3( 0.043, 0.078, 0.125 ); // juntas finas oscuras
  const vec3 ACCENT_A    = vec3( 0.204, 0.827, 0.600 ); // #34d399 verde
  const vec3 ACCENT_B    = vec3( 0.133, 0.827, 0.933 ); // #22d3ee cian
  const vec3 ROCK_DARK   = vec3( 0.094, 0.067, 0.149 ); // #181126
  const vec3 ROCK_LIT    = vec3( 0.169, 0.114, 0.239 ); // #2b1d3d
  const vec3 WARN_RED    = vec3( 1.0, 0.145, 0.106 );
  const vec3 WARN_AMBER  = vec3( 1.0, 0.522, 0.106 );
  const vec3 RIM_INK     = vec3( 0.490, 0.408, 0.839 ); // rim índigo/violeta

  // Cel-shading de 3 bandas: luz / media / sombra.
  float celBands( float ndl ) {
    if ( ndl > 0.62 ) return 1.0;
    if ( ndl > 0.18 ) return 0.66;
    return 0.38;
  }

  // Ruido barato determinista para las grietas de la roca.
  float crackNoise( vec3 p ) {
    return sin( p.x * 3.7 + sin( p.z * 2.9 ) * 1.7 )
         * sin( p.y * 4.3 + 1.3 )
         * sin( p.z * 3.1 + sin( p.x * 2.3 ) * 1.9 );
  }

  void main() {
    vec3 normalW = normalize( vWorldNormal );
    float ndl = dot( normalW, normalize( uSunDir ) );
    float band = celBands( ndl );
    float topFace = ( vIsTop > 0.5 || vLocalNormal.y > 0.65 ) ? 1.0 : 0.0;

    vec3 color;
    if ( topFace > 0.5 ) {
      // --- Damero nítido de baldosas de cocina (P3R) ---
      vec2 cell = vUv * 2.0;
      vec2 id = floor( cell );
      vec2 f = fract( cell );

      float check = mod( id.x + id.y, 2.0 );
      vec3 tile = mix( TILE_DARK, TILE_LIGHT, check );

      // Juntas finas oscuras entre baldosas.
      float g = min( min( f.x, f.y ), min( 1.0 - f.x, 1.0 - f.y ) );
      float grout = smoothstep( 0.028, 0.05, g );
      vec3 base = mix( GROUT, tile, grout );

      // Franjas luminosas verde-cian en los bordes de patrón cada 4 baldosas.
      vec2 acc = vec2( 0.0 );
      if ( mod( id.x, 4.0 ) < 0.5 ) acc.x = 1.0 - smoothstep( 0.015, 0.09, f.x );
      if ( mod( id.y, 4.0 ) < 0.5 ) acc.y = 1.0 - smoothstep( 0.015, 0.09, f.y );
      float accent = max( acc.x, acc.y );
      float accentPulse = 0.72 + 0.28 * sin( uTime * 1.8 + ( id.x + id.y ) * 0.6 );
      vec3 accentCol = mix( ACCENT_A, ACCENT_B, 0.5 + 0.5 * sin( id.x * 1.7 + id.y * 2.3 ) );
      base = mix( base, accentCol * ( 0.9 + 0.45 * accentPulse ), accent * accentPulse );

      // Las baldosas casi no se ensucian: sombreado cel muy suave.
      color = base * ( 0.74 + 0.26 * band );

      float rim = pow( 1.0 - abs( dot( normalW, vViewDir ) ), 3.0 );
      color += accentCol * rim * 0.16;
    } else {
      // --- Roca / tierra arrancada, cel-shading de 3 bandas ---
      vec3 rock = mix( ROCK_DARK, ROCK_LIT, band );

      // Grietas sutiles que recorren la masa de roca.
      float n = crackNoise( vLocalPos * 1.35 );
      float crack = 1.0 - smoothstep( 0.0, 0.055, abs( n ) );
      rock *= 1.0 - crack * 0.32;

      // Labio rasgado: las caras laterales que miran casi hacia arriba (borde
      // de la rotura) se oscurecen, marcando la transicion tapa -> roca.
      float lip = smoothstep( 0.12, 0.6, vLocalNormal.y );
      rock *= 1.0 - lip * 0.22;

      // Rim light fresnel violeta, coherente con el resto del juego.
      float rim = pow( 1.0 - abs( dot( normalW, vViewDir ) ), 2.6 );
      rock += RIM_INK * rim * 0.30;

      color = rock;
    }

    // Pulsos rojo/amber de aviso (suelo de Miniboss a punto de desaparecer).
    float pulse = 0.5 + 0.5 * sin( uTime * 7.0 );
    vec3 warnCol = mix( WARN_RED, WARN_AMBER, pulse );
    float warnAmt = uWarning * ( 0.42 + 0.38 * pulse );
    color = mix( color, warnCol * ( 0.95 + 0.5 * pulse ), warnAmt );

    gl_FragColor = vec4( color, uOpacity );
  }
`;

/**
 * Material cel-shaded con estética de baldosas de Persona 3 Reload (Tartarus):
 * tapa superior de damero marfil/azul-gris con juntas finas y acentos
 * verde-cian cada 4 baldosas; laterales y fondo de roca arrancada con 3 bandas
 * de cel y grietas sutiles.
 *
 * Uniforms:
 * - `uWarning` (0..1): pulso rojo/ámbar cuando un suelo de Miniboss está a
 *   punto de desaparecer.
 * - `uOpacity` (0..1): aparición/desaparición suave al entrar/salir de la
 *   cúpula.
 * - `uTime`: reloj para los pulsos de acentos y de aviso.
 *
 * @param options.warningColor si es `true`, el material nace con `uWarning = 1`
 *   (variante de aviso para suelos de Miniboss).
 */
export function createP3RTileMaterial(
  options: { warningColor?: boolean } = {}
): THREE.ShaderMaterial {
  const { warningColor = false } = options;

  return new THREE.ShaderMaterial({
    vertexShader: tileVertexShader,
    fragmentShader: tileFragmentShader,
    uniforms: {
      uWarning: { value: warningColor ? 1 : 0 },
      uOpacity: { value: 1 },
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.35, 0.8, 0.45).normalize() },
    },
    transparent: true,
  });
}

// ============================================================================
// Geometría de trozo arrancado del suelo
// ============================================================================

const CONTOUR_VERTS = 20;
const RING_COUNT = 4;

/**
 * Contorno irregular 2D (20 vértices) alrededor del origen: elipse base con
 * jitter angular y radial determinista. Nunca es un cuadrado ni un círculo
 * perfecto, y al ser radialmente estrella respecto al centro se puede
 * triangular en abanico.
 */
function buildContour(
  seed: number,
  radiusX: number,
  radiusZ: number
): Array<{ x: number; z: number }> {
  const rand = mulberry32((seed * 2654435761 + 12345) >>> 0);
  const contour: Array<{ x: number; z: number }> = [];

  for (let i = 0; i < CONTOUR_VERTS; i++) {
    const t = (i / CONTOUR_VERTS) * Math.PI * 2;
    // Jitter angular acotado (< medio paso) para mantener el polígono
    // estrella y monotónico en ángulo.
    const angle = t + (rand() - 0.5) * (Math.PI * 2 / CONTOUR_VERTS) * 0.55;
    const radial = 0.78 + rand() * 0.42 + 0.12 * Math.sin(i * 2.399 + seed * 0.71);
    contour.push({
      x: Math.cos(angle) * radiusX * radial,
      z: Math.sin(angle) * radiusZ * radial,
    });
  }

  return contour;
}

/**
 * Genera un trozo de suelo arrancado:
 *
 * - Tapa superior (`Y = +thickness/2`): polígono irregular de 20 vértices
 *   triangulado en abanico, 100% plano y liso, con UVs planas
 *   `(x * 0.35, z * 0.35)` para el damero y atributo `aIsTop = 1`.
 * - Laterales y fondo: el contorno se extruye en 4 anillos hacia abajo hasta
 *   cerrar en un vértice inferior (apex). Los vértices del anillo superior NO
 *   se mueven (coinciden exactamente con el borde de la tapa); los demás se
 *   perturban con FBM determinista 3D para parecer piedra/tierra arrancada,
 *   con `aIsTop = 0`.
 *
 * La tapa usa vértices propios (no compartidos con el lateral), así que
 * `computeVertexNormals()` le deja la normal exacta `(0, 1, 0)`.
 */
export function createTornSlabGeometry(
  seed: number,
  radiusX: number,
  radiusZ: number,
  thickness: number
): { geometry: THREE.BufferGeometry; halfExtents: THREE.Vector3 } {
  const halfH = thickness * 0.5;
  const contour = buildContour(seed, radiusX, radiusZ);
  const n = contour.length;

  const positions: number[] = [];
  const uvs: number[] = [];
  const isTop: number[] = [];
  const indices: number[] = [];

  // --- Tapa superior: abanico desde el centro, plano en Y = +halfH ---
  const capCenter = positions.length / 3;
  positions.push(0, halfH, 0);
  uvs.push(0, 0);
  isTop.push(1);

  const capRing: number[] = [];
  for (const p of contour) {
    capRing.push(positions.length / 3);
    positions.push(p.x, halfH, p.z);
    uvs.push(p.x * 0.35, p.z * 0.35);
    isTop.push(1);
  }
  for (let i = 0; i < n; i++) {
    // (centro, v[i+1], v[i]): winding CCW visto desde +Y -> normal (0, 1, 0).
    indices.push(capCenter, capRing[(i + 1) % n], capRing[i]);
  }

  // --- Laterales: 4 anillos de extrusión hacia abajo ---
  const rings: number[][] = [];
  for (let k = 0; k < RING_COUNT; k++) {
    const ring: number[] = [];
    const depth = k / (RING_COUNT - 1); // 0 en el borde superior, 1 abajo
    for (let i = 0; i < n; i++) {
      const c = contour[i];
      let x = c.x;
      let y = halfH;
      let z = c.z;
      if (k > 0) {
        // Ruido FBM 3D creciente con la profundidad: el borde superior queda
        // intacto y encaja con la tapa; abajo la roca se hincha y se muerde.
        const swell = fbm3(c.x * 0.4, k * 1.4, c.z * 0.4, seed);
        const lateral = fbm3(c.z * 0.5 + 7.7, k * 1.2, c.x * 0.5 - 3.1, seed + 77);
        const yNoise = fbm3(c.x * 0.6 - 5.5, k * 2.1, c.z * 0.6 + 8.8, seed + 133);
        const bite = Math.max(0, lateral) * 0.5 * depth;
        const s = 1 + swell * 0.22 * depth - bite;
        x = c.x * s;
        z = c.z * s;
        y = halfH - thickness * depth * (0.94 + yNoise * 0.12);
      }
      ring.push(positions.length / 3);
      positions.push(x, y, z);
      uvs.push(x * 0.35, z * 0.35);
      isTop.push(0);
    }
    rings.push(ring);
  }

  // --- Fondo: cono hacia un vértice inferior (apex) ---
  const apex = positions.length / 3;
  const apexX = fbm3(3.7, 1.1, 2.4, seed + 512) * 0.9;
  const apexZ = fbm3(-1.6, 5.2, 0.8, seed + 913) * 0.9;
  positions.push(apexX, -halfH, apexZ);
  uvs.push(apexX * 0.35, apexZ * 0.35);
  isTop.push(0);

  for (let k = 0; k < RING_COUNT - 1; k++) {
    const upper = rings[k];
    const lower = rings[k + 1];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      indices.push(upper[i], upper[j], lower[j]);
      indices.push(upper[i], lower[j], lower[i]);
    }
  }
  const last = rings[RING_COUNT - 1];
  for (let i = 0; i < n; i++) {
    indices.push(last[i], last[(i + 1) % n], apex);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('aIsTop', new THREE.Float32BufferAttribute(isTop, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  // Half extents reales del trozo (incluye el ruido de los laterales).
  let maxX = 0;
  let maxZ = 0;
  for (let i = 0; i < positions.length; i += 3) {
    maxX = Math.max(maxX, Math.abs(positions[i]));
    maxZ = Math.max(maxZ, Math.abs(positions[i + 2]));
  }
  const halfExtents = new THREE.Vector3(maxX, halfH, maxZ);

  return { geometry, halfExtents };
}
