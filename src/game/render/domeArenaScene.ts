import * as THREE from 'three';
import { addComicOutline, sharedShaderState } from './toonMaterials';

// ============================================================================
// OUTORBIT — "Hades 3D de Gravedad": escenario de la arena bajo cúpula.
//
// createDomeArenaBackdrop monta todo el backdrop en un único THREE.Group:
//   1. Cúpula de cristal de 50 m (caras translúcidas + retícula geodésica +
//      anillo ecuatorial y dos meridianos luminosos).
//   2. Escenario exterior (R = 60..300 m) con MENOS objetos y MUCHO más
//      carácter: Pilar del Mundo con anillos de energía fluida, Singularidad
//      cenital y dos agujeros negros de horizonte con shader de lente
//      gravitacional + disco de acreción GLSL, 14 monolitos monumentales,
//      8 arcos rúnicos, 36 fragmentos, 22 asteroides y 32 prismas de cristal
//      galáctico, más el agujero negro abisal de niebla morada (Y = -125 m) y
//      la bóveda espacial con shader propio.
//
// Todos los cuerpos sólidos llevan shader propio (cel-shading de 3 bandas +
// halftone + vetas de galaxia / grietas de maná / iridiscencia de cristal) y
// contorno de tinta brillante por Inverted Hull (BackSide), incluidos los
// InstancedMesh (el hull aplica instanceMatrix en el vertex shader).
//
// update(dt, elapsed) NO reserva memoria: reutiliza objetos temporales
// declarados en el closure y sólo escribe uniforms y matrices de instancia.
// dispose() libera geometrías, materiales y buffers de instancias del grupo.
// ============================================================================

export interface DomeArenaBackdrop {
  group: THREE.Group;
  domeRadius: number;
  update: (dt: number, elapsed: number) => void;
  dispose: () => void;
}

const DOME_RADIUS = 50;

// Menos objetos, más grandes y legibles: el escenario respira.
const MONOLITH_COUNT = 14;
const ARC_COUNT = 8;
const FRAGMENT_COUNT = 36;
const ASTEROID_COUNT = 22;
const STAR_COUNT = 260;
const PRISM_COUNT = 32;

/** Altura del vórtice abisal: el "fin del mundo" bajo la arena. */
const ABYSS_Y = -125;

// ----------------------------------------------------------------------------
// Utilidades deterministas (solo en construcción, nunca por frame)
// ----------------------------------------------------------------------------

/** PRNG determinista para que el escenario sea idéntico en cada sesión. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash estable por posición: vértices duplicados (costuras) se desplazan igual. */
function posHash(x: number, y: number, z: number, seed: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 53.37) * 43758.5453;
  return s - Math.floor(s);
}

/** Fractura una geometría desplazando vértices con ruido determinista. */
function fractureGeometry(geo: THREE.BufferGeometry, amount: number, seed: number): void {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    pos.setXYZ(
      i,
      x + (posHash(x, y, z, seed) - 0.5) * amount,
      y + (posHash(x, y, z, seed + 1) - 0.5) * amount,
      z + (posHash(x, y, z, seed + 2) - 0.5) * amount
    );
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

/** Punto uniforme en una corona esférica [rMin, rMax]. */
function shellPoint(
  rng: () => number,
  rMin: number,
  rMax: number,
  out: THREE.Vector3
): THREE.Vector3 {
  const u = rng() * 2 - 1;
  const theta = rng() * Math.PI * 2;
  const s = Math.sqrt(1 - u * u);
  const r = rMin + rng() * (rMax - rMin);
  return out.set(s * Math.cos(theta) * r, u * r, s * Math.sin(theta) * r);
}

/** Cuaternión aleatorio uniforme (Shoemake). */
function randomQuat(rng: () => number, out: THREE.Quaternion): THREE.Quaternion {
  const u1 = rng();
  const u2 = rng() * Math.PI * 2;
  const u3 = rng() * Math.PI * 2;
  const s1 = Math.sqrt(1 - u1);
  const s2 = Math.sqrt(u1);
  return out.set(
    s1 * Math.sin(u2),
    s1 * Math.cos(u2),
    s2 * Math.sin(u3),
    s2 * Math.cos(u3)
  );
}

// ----------------------------------------------------------------------------
// Librería GLSL compartida: ruido de valor 3D/2D, fbm y trama halftone
// ----------------------------------------------------------------------------

const GLSL_NOISE = /* glsl */ `
  float hash13( vec3 p3 ) {
    p3 = fract( p3 * 0.1031 );
    p3 += dot( p3, p3.yzx + 33.33 );
    return fract( ( p3.x + p3.y ) * p3.z );
  }

  float vnoise( vec3 p ) {
    vec3 i = floor( p );
    vec3 f = fract( p );
    f = f * f * ( 3.0 - 2.0 * f );
    float a = hash13( i );
    float b = hash13( i + vec3( 1.0, 0.0, 0.0 ) );
    float c = hash13( i + vec3( 0.0, 1.0, 0.0 ) );
    float d = hash13( i + vec3( 1.0, 1.0, 0.0 ) );
    float e = hash13( i + vec3( 0.0, 0.0, 1.0 ) );
    float g = hash13( i + vec3( 1.0, 0.0, 1.0 ) );
    float h = hash13( i + vec3( 0.0, 1.0, 1.0 ) );
    float k = hash13( i + vec3( 1.0, 1.0, 1.0 ) );
    return mix(
      mix( mix( a, b, f.x ), mix( c, d, f.x ), f.y ),
      mix( mix( e, g, f.x ), mix( h, k, f.x ), f.y ),
      f.z
    );
  }

  float fbm( vec3 p ) {
    float sum = 0.0;
    float amp = 0.5;
    for ( int i = 0; i < 4; i++ ) {
      sum += amp * vnoise( p );
      p = p * 2.17 + vec3( 11.3, 7.1, 5.9 );
      amp *= 0.5;
    }
    return sum;
  }

  float hash12( vec2 p ) {
    vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
    p3 += dot( p3, p3.yzx + 33.33 );
    return fract( ( p3.x + p3.y ) * p3.z );
  }

  float vnoise2( vec2 p ) {
    vec2 i = floor( p );
    vec2 f = fract( p );
    f = f * f * ( 3.0 - 2.0 * f );
    float a = hash12( i );
    float b = hash12( i + vec2( 1.0, 0.0 ) );
    float c = hash12( i + vec2( 0.0, 1.0 ) );
    float d = hash12( i + vec2( 1.0, 1.0 ) );
    return mix( mix( a, b, f.x ), mix( c, d, f.x ), f.y );
  }

  float fbm2( vec2 p ) {
    float sum = 0.0;
    float amp = 0.5;
    for ( int i = 0; i < 5; i++ ) {
      sum += amp * vnoise2( p );
      p = p * 2.03 + vec2( 7.3, 11.7 );
      amp *= 0.5;
    }
    return sum;
  }

  // Trama de puntos halftone en espacio de pantalla (impresión cómic).
  float halftoneDots( vec2 fragCoord, float scale ) {
    float angle = 0.523599; // 30 grados
    mat2 rot = mat2( cos( angle ), -sin( angle ), sin( angle ), cos( angle ) );
    vec2 uv = ( rot * fragCoord ) / scale;
    vec2 grid = fract( uv ) - 0.5;
    return length( grid );
  }
`;

// ----------------------------------------------------------------------------
// Bóveda espacial: gradiente profundo + nebulosa fluida + estrellas nítidas
// ----------------------------------------------------------------------------

const SKY_VERTEX = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  }
`;

const SKY_FRAGMENT = /* glsl */ `
  uniform float uTime;
  varying vec3 vDir;

  ${GLSL_NOISE}

  void main() {
    vec3 dir = normalize( vDir );
    float h = clamp( dir.y * 0.5 + 0.5, 0.0, 1.0 );

    // Gradiente profundo #040510 -> #0c1430 -> #1e1038
    vec3 deep = vec3( 0.0157, 0.0196, 0.0627 );
    vec3 mid  = vec3( 0.0471, 0.0784, 0.1882 );
    vec3 top  = vec3( 0.1176, 0.0627, 0.2196 );
    vec3 col = mix( deep, mid, smoothstep( 0.0, 0.55, h ) );
    col = mix( col, top, smoothstep( 0.52, 1.0, h ) );

    // Nebulosa fluida y sutil (dos campos fbm derivando con el tiempo)
    float n1 = fbm( dir * 2.6 + vec3( 0.0, uTime * 0.006, uTime * 0.004 ) );
    float n2 = fbm( dir * 4.2 + vec3( -uTime * 0.005, 0.0, 3.7 ) );
    vec3 nebA = vec3( 0.10, 0.05, 0.22 );
    vec3 nebB = vec3( 0.02, 0.14, 0.18 );
    col += mix( nebA, nebB, n2 ) * pow( n1, 2.0 ) * 0.6;

    // Estrellas nítidas: capa densa pequeña + capa escasa brillante
    vec3 sp = dir * 55.0;
    vec3 cell = floor( sp );
    vec3 fr = fract( sp ) - 0.5;
    float rnd = hash13( cell );
    vec3 off = vec3( hash13( cell + 1.7 ), hash13( cell + 3.1 ), hash13( cell + 5.3 ) ) - 0.5;
    float d = length( fr - off * 0.6 );
    float star = smoothstep( 0.10, 0.015, d ) * step( 0.86, rnd );
    float tw = 0.7 + 0.3 * sin( uTime * 1.7 + rnd * 90.0 );
    col += vec3( 0.85, 0.92, 1.0 ) * star * tw * ( 0.35 + rnd * 0.8 );

    vec3 sp2 = dir * 26.0;
    vec3 cell2 = floor( sp2 );
    vec3 fr2 = fract( sp2 ) - 0.5;
    float rnd2 = hash13( cell2 + 13.7 );
    vec3 off2 = vec3( hash13( cell2 + 7.7 ), hash13( cell2 + 9.1 ), hash13( cell2 + 11.3 ) ) - 0.5;
    float d2 = length( fr2 - off2 * 0.5 );
    float star2 = smoothstep( 0.16, 0.03, d2 ) * step( 0.965, rnd2 );
    float tw2 = 0.75 + 0.25 * sin( uTime * 2.3 + rnd2 * 130.0 );
    vec3 starTint = mix( vec3( 1.0, 0.85, 0.7 ), vec3( 0.7, 0.85, 1.0 ), hash13( cell2 + 21.1 ) );
    col += starTint * star2 * tw2 * 1.4;

    gl_FragColor = vec4( col, 1.0 );
  }
`;

// ----------------------------------------------------------------------------
// Agujero negro abisal: pozo negro + niebla morada en espiral (plano Y = -125)
// ----------------------------------------------------------------------------

const ABYSS_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  }
`;

const ABYSS_FRAGMENT = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;

  ${GLSL_NOISE}

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length( p );
    float ang = atan( p.y, p.x );

    // Espiral polar: log(r) enrosca las hebras hacia el centro del abismo.
    float lr = log( max( r, 0.0008 ) );
    float spiral = ang * 2.0 + lr * 3.2 - uTime * 0.055;

    vec2 sp = vec2( cos( spiral ), sin( spiral ) ) * ( 0.5 + r * 2.1 );
    float n1 = fbm2( sp * 1.6 + vec2( 0.0, uTime * 0.011 ) );
    float n2 = fbm2( sp * 3.2 - vec2( uTime * 0.008, 0.0 ) );
    float mist = pow( clamp( n1 * 0.8 + n2 * 0.45, 0.0, 1.0 ), 1.6 );

    // Rampa morada: #090218 -> #2e1065 -> #6b21a8 -> #c026d3
    vec3 c0 = vec3( 0.0353, 0.0078, 0.0941 );
    vec3 c1 = vec3( 0.1804, 0.0627, 0.3961 );
    vec3 c2 = vec3( 0.4196, 0.1294, 0.6588 );
    vec3 c3 = vec3( 0.7529, 0.1490, 0.8275 );
    vec3 col = mix( c0, c1, smoothstep( 0.0, 0.34, mist ) );
    col = mix( col, c2, smoothstep( 0.30, 0.72, mist ) );
    col = mix( col, c3, smoothstep( 0.70, 1.0, mist ) );

    // Hebras de luz violeta y fucsia cayendo en espiral.
    float threadA = pow( max( 0.0, sin( spiral * 3.0 + n1 * 4.5 ) ), 16.0 );
    col += vec3( 0.55, 0.28, 1.0 ) * threadA * 0.7 * smoothstep( 0.05, 0.45, r );
    float threadB = pow( max( 0.0, sin( spiral * 5.0 - n2 * 5.5 + 1.7 ) ), 24.0 );
    col += vec3( 1.0, 0.22, 0.55 ) * threadB * 0.55 * smoothstep( 0.08, 0.60, r );

    // Pozo negro absoluto: da vértigo mirar hacia abajo.
    float throat = smoothstep( 0.30, 0.06, r );
    col = mix( col, vec3( 0.0 ), throat );

    // Aro de horizonte: borde violeta brillante justo fuera del pozo.
    float rim = smoothstep( 0.28, 0.33, r ) * smoothstep( 0.46, 0.34, r );
    col += vec3( 0.62, 0.35, 1.0 ) * rim * 0.55;

    // Difuminado hacia el vacío en el borde exterior.
    float alpha = smoothstep( 1.0, 0.30, r );
    alpha *= mix( 1.0, 0.45 + 0.55 * mist, smoothstep( 0.34, 0.92, r ) );
    alpha = max( alpha, throat );

    if ( alpha < 0.004 ) discard;
    gl_FragColor = vec4( col, alpha );
  }
`;

// ----------------------------------------------------------------------------
// Estrellas de 4 puntas: 1 núcleo brillante + destello vertical y horizontal
// ----------------------------------------------------------------------------

const STAR_VERTEX = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aPhase;
  attribute float aSpeed;

  uniform float uTime;
  uniform float uPixelScale;

  varying vec3 vColor;
  varying float vTwinkle;

  void main() {
    vColor = aColor;
    vTwinkle = 0.55 + 0.45 * sin( uTime * aSpeed + aPhase );
    vec4 mv = modelViewMatrix * vec4( position, 1.0 );
    gl_PointSize = aSize * uPixelScale / max( 1.0, -mv.z );
    gl_Position = projectionMatrix * mv;
  }
`;

const STAR_FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vTwinkle;

  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float ax = abs( p.x );
    float ay = abs( p.y );
    float d = length( p );

    // Cruz de 4 puntas: dos destellos ortogonales que se afilan hacia las puntas.
    float vSpike = smoothstep( 0.075, 0.0, ax ) * pow( max( 0.0, 1.0 - ay * 2.0 ), 1.5 );
    float hSpike = smoothstep( 0.075, 0.0, ay ) * pow( max( 0.0, 1.0 - ax * 2.0 ), 1.5 );
    float core = smoothstep( 0.20, 0.0, d );
    float glow = smoothstep( 0.5, 0.0, d ) * 0.22;

    float a = clamp( vSpike + hSpike + core + glow, 0.0, 1.0 ) * vTwinkle;
    if ( a < 0.004 ) discard;
    gl_FragColor = vec4( vColor * ( 0.85 + 0.6 * core ), a );
  }
`;

// ----------------------------------------------------------------------------
// Shader de galaxia: cel-shading 3 bandas + halftone + vetas mágicas + rim
// (monolitos, arcos rúnicos y Pilar del Mundo; soporta InstancedMesh)
// ----------------------------------------------------------------------------

const GALAXY_CEL_VERTEX = /* glsl */ `
  varying vec3 vNormalWorld;
  varying vec3 vViewDir;
  varying vec3 vWorldPos;
  varying vec3 vTint;

  void main() {
    vec3 objectNormal = normal;
    vec4 localPos = vec4( position, 1.0 );

    #ifdef USE_INSTANCING
      localPos = instanceMatrix * localPos;
      objectNormal = mat3( instanceMatrix ) * objectNormal;
    #endif

    vec4 worldPos = modelMatrix * localPos;
    vWorldPos = worldPos.xyz;
    vNormalWorld = normalize( mat3( modelMatrix ) * objectNormal );
    vViewDir = normalize( cameraPosition - worldPos.xyz );

    #ifdef USE_INSTANCING_COLOR
      vTint = instanceColor;
    #else
      vTint = vec3( 1.0 );
    #endif

    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const GALAXY_CEL_FRAGMENT = /* glsl */ `
  uniform vec3 uBaseColor;
  uniform vec3 uShadowTint;
  uniform vec3 uVeinA;
  uniform vec3 uVeinB;
  uniform vec3 uRimColor;
  uniform vec3 uSunDir;
  uniform float uTime;
  uniform float uVeinStrength;
  uniform float uRimStrength;
  uniform float uHalftoneEnabled;

  varying vec3 vNormalWorld;
  varying vec3 vViewDir;
  varying vec3 vWorldPos;
  varying vec3 vTint;

  ${GLSL_NOISE}

  void main() {
    vec3 N = normalize( vNormalWorld );
    vec3 V = normalize( vViewDir );
    float NdotL = dot( N, normalize( uSunDir ) );

    vec3 base = uBaseColor * vTint;

    // 3 bandas marcadas de iluminación tipo cómic.
    vec3 lit = base * 1.18;
    vec3 mid = mix( base, uShadowTint, 0.30 );
    vec3 dark = mix( base, uShadowTint, 0.66 );
    vec3 col = lit;
    if ( NdotL < 0.10 ) {
      col = dark;
    } else if ( NdotL < 0.46 ) {
      col = mid;
    }

    // Halftone sólo en el terminador de sombra.
    if ( uHalftoneEnabled > 0.5 && NdotL > -0.30 && NdotL < 0.36 ) {
      float dots = halftoneDots( gl_FragCoord.xy, 6.0 );
      float threshold = ( 1.0 - smoothstep( -0.22, 0.36, NdotL ) ) * 0.45;
      if ( dots < threshold ) {
        col = mix( col, uShadowTint * 0.9, 0.5 );
      }
    }

    // Vetas de galaxia fluyendo por la piedra (fbm 3D en espacio de mundo).
    vec3 q = vWorldPos * 0.055 + vec3( 0.0, -uTime * 0.14, uTime * 0.05 );
    float n1 = fbm( q );
    float n2 = fbm( q * 2.35 + vec3( uTime * 0.08, 0.0, 0.0 ) );
    float vein = smoothstep( 0.50, 0.80, n1 * 0.62 + n2 * 0.58 );
    vec3 veinCol = mix( uVeinA, uVeinB, smoothstep( 0.30, 0.85, n2 ) );
    col += veinCol * vein * uVeinStrength * ( 0.40 + 0.60 * smoothstep( -0.25, 0.70, NdotL ) );

    // Rim Light Fresnel brillante: recorta la silueta contra el vacío.
    float fres = pow( 1.0 - max( dot( N, V ), 0.0 ), 2.6 );
    fres = smoothstep( 0.08, 0.85, fres );
    col += uRimColor * fres * uRimStrength;

    gl_FragColor = vec4( col, 1.0 );
  }
`;

// ----------------------------------------------------------------------------
// Contorno de tinta brillante (Inverted Hull BackSide, soporta instancing)
// ----------------------------------------------------------------------------

const INK_OUTLINE_VERTEX = /* glsl */ `
  uniform float uThickness;
  uniform float uTime;
  uniform vec3 uInkColor;

  varying vec3 vInk;

  void main() {
    vec3 objectNormal = normalize( normal );
    vec4 localPos = vec4( position, 1.0 );

    #ifdef USE_INSTANCING
      localPos = instanceMatrix * localPos;
      objectNormal = normalize( mat3( instanceMatrix ) * objectNormal );
    #endif

    // Trazo de pincel irregular: el grosor respira con la posición.
    float brush = sin( position.x * 7.3 + position.y * 5.1 ) * cos( position.z * 6.7 - position.y * 4.2 );
    float width = max( 0.008, uThickness * ( 1.0 + brush * 0.35 ) );
    vec3 extruded = localPos.xyz + objectNormal * width;

    vInk = uInkColor * ( 0.82 + 0.18 * sin( uTime * 2.1 + position.y * 0.7 ) );
    gl_Position = projectionMatrix * modelViewMatrix * vec4( extruded, 1.0 );
  }
`;

const INK_OUTLINE_FRAGMENT = /* glsl */ `
  varying vec3 vInk;
  void main() {
    gl_FragColor = vec4( vInk, 1.0 );
  }
`;

// ----------------------------------------------------------------------------
// Asteroides: shader cósmico con grietas de maná/magma violeta-cian
// ----------------------------------------------------------------------------

const COSMIC_ROCK_FRAGMENT = /* glsl */ `
  uniform vec3 uRockColor;
  uniform vec3 uShadowTint;
  uniform vec3 uCrackA;
  uniform vec3 uCrackB;
  uniform vec3 uRimColor;
  uniform vec3 uSunDir;
  uniform float uTime;
  uniform float uCrackStrength;
  uniform float uHalftoneEnabled;

  varying vec3 vNormalWorld;
  varying vec3 vViewDir;
  varying vec3 vWorldPos;
  varying vec3 vTint;

  ${GLSL_NOISE}

  void main() {
    vec3 N = normalize( vNormalWorld );
    vec3 V = normalize( vViewDir );
    float NdotL = dot( N, normalize( uSunDir ) );

    vec3 base = uRockColor * vTint;

    // Cel-shading de 3 bandas.
    vec3 lit = base * 1.25;
    vec3 mid = mix( base, uShadowTint, 0.32 );
    vec3 dark = mix( base, uShadowTint, 0.70 );
    vec3 col = lit;
    if ( NdotL < 0.08 ) {
      col = dark;
    } else if ( NdotL < 0.44 ) {
      col = mid;
    }

    if ( uHalftoneEnabled > 0.5 && NdotL > -0.30 && NdotL < 0.34 ) {
      float dots = halftoneDots( gl_FragCoord.xy, 5.5 );
      float threshold = ( 1.0 - smoothstep( -0.20, 0.34, NdotL ) ) * 0.40;
      if ( dots < threshold ) {
        col = mix( col, uShadowTint * 0.9, 0.5 );
      }
    }

    // Grietas de maná: crestas de fbm que emiten violeta-cian.
    vec3 q = vWorldPos * 0.17 + vec3( 0.0, uTime * 0.03, 0.0 );
    float n1 = fbm( q );
    float n2 = fbm( q * 2.7 + vec3( 3.1, uTime * 0.05, 0.0 ) );
    float ridge = 1.0 - abs( n1 * 2.0 - 1.0 );
    float crack = smoothstep( 0.80, 0.99, ridge * 0.65 + n2 * 0.45 );
    float pulse = 0.65 + 0.35 * sin( uTime * 1.7 + n1 * 14.0 );
    vec3 crackCol = mix( uCrackA, uCrackB, smoothstep( 0.30, 0.80, n2 ) );
    col += crackCol * crack * uCrackStrength * pulse;

    // Contorno luminoso sutil.
    float fres = pow( 1.0 - max( dot( N, V ), 0.0 ), 3.0 );
    col += uRimColor * smoothstep( 0.10, 0.90, fres ) * 0.55;

    gl_FragColor = vec4( col, 1.0 );
  }
`;

// ----------------------------------------------------------------------------
// Prismas: cristal galáctico iridiscente (arcoíris cósmico según dot(N, V))
// ----------------------------------------------------------------------------

const CRYSTAL_PRISM_VERTEX = /* glsl */ `
  attribute float aPhase;

  varying vec3 vNormalWorld;
  varying vec3 vViewDir;
  varying vec3 vWorldPos;
  varying vec3 vTint;
  varying float vPhase;

  void main() {
    vec3 objectNormal = normal;
    vec4 localPos = vec4( position, 1.0 );

    #ifdef USE_INSTANCING
      localPos = instanceMatrix * localPos;
      objectNormal = mat3( instanceMatrix ) * objectNormal;
    #endif

    vec4 worldPos = modelMatrix * localPos;
    vWorldPos = worldPos.xyz;
    vNormalWorld = normalize( mat3( modelMatrix ) * objectNormal );
    vViewDir = normalize( cameraPosition - worldPos.xyz );

    #ifdef USE_INSTANCING_COLOR
      vTint = instanceColor;
    #else
      vTint = vec3( 1.0 );
    #endif

    vPhase = aPhase;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const CRYSTAL_PRISM_FRAGMENT = /* glsl */ `
  uniform vec3 uCrystalTint;
  uniform vec3 uRimColor;
  uniform vec3 uSunDir;
  uniform float uTime;
  uniform float uPulse;

  varying vec3 vNormalWorld;
  varying vec3 vViewDir;
  varying vec3 vWorldPos;
  varying vec3 vTint;
  varying float vPhase;

  void main() {
    vec3 N = normalize( vNormalWorld );
    vec3 V = normalize( vViewDir );
    float NdotL = dot( N, normalize( uSunDir ) );
    float ndv = clamp( dot( N, V ), 0.0, 1.0 );

    // Arcoíris cósmico cian/fucsia/dorado según el ángulo de vista.
    vec3 rainbow = 0.5 + 0.5 * cos(
      6.28318 * ( vec3( 0.0, 0.33, 0.67 ) + ndv * 1.45 + uTime * 0.05 + vPhase * 0.12 )
    );
    vec3 irid = mix( rainbow, uCrystalTint * vTint, 0.42 );

    // Facetas cel de 3 bandas: el octaedro lee sus planos.
    float band = 0.55;
    if ( NdotL > 0.46 ) {
      band = 1.15;
    } else if ( NdotL > 0.10 ) {
      band = 0.85;
    }
    vec3 col = irid * band;

    // Pulso brillante por instancia.
    float pulse = 0.72 + 0.28 * sin( uTime * 1.9 + vPhase * 6.28318 );
    col *= pulse * uPulse;

    // Borde blanco.
    float fres = pow( 1.0 - ndv, 2.2 );
    col += uRimColor * smoothstep( 0.10, 0.95, fres ) * 1.15;

    gl_FragColor = vec4( col, 1.0 );
  }
`;

// ----------------------------------------------------------------------------
// Lente gravitacional: interior negro absoluto + horizonte de sucesos ardiente
// ----------------------------------------------------------------------------

const GRAVITY_LENS_VERTEX = /* glsl */ `
  varying vec3 vNormalWorld;
  varying vec3 vViewDir;
  varying vec3 vWorldPos;

  void main() {
    vec4 worldPos = modelMatrix * vec4( position, 1.0 );
    vWorldPos = worldPos.xyz;
    vNormalWorld = normalize( mat3( modelMatrix ) * normal );
    vViewDir = normalize( cameraPosition - worldPos.xyz );
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const GRAVITY_LENS_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uRimA;
  uniform vec3 uRimB;
  uniform vec3 uRimC;
  uniform float uIntensity;

  varying vec3 vNormalWorld;
  varying vec3 vViewDir;
  varying vec3 vWorldPos;

  void main() {
    vec3 N = normalize( vNormalWorld );
    vec3 V = normalize( vViewDir );
    float ndv = max( dot( N, V ), 0.0 );
    float fres = 1.0 - ndv;

    // Interior: negro absoluto. Sólo el borde arde.
    vec3 col = vec3( 0.0 );

    float ang = atan( N.z, N.x );
    float swirl = 0.5 + 0.5 * sin( ang * 3.0 + uTime * 0.85 + fres * 9.0 );
    vec3 rimCol = mix( uRimA, uRimB, swirl );

    // Horizonte de sucesos vivo: anillo ardiente cian/violeta.
    float ring = smoothstep( 0.42, 0.92, fres );
    col += rimCol * ring * ( 0.85 + 0.75 * swirl ) * uIntensity;

    // Photon ring interior tenue.
    col += uRimC * smoothstep( 0.30, 0.42, fres ) * ( 1.0 - smoothstep( 0.42, 0.55, fres ) ) * 0.35;

    // Filo exterior casi blanco.
    col += uRimC * pow( fres, 18.0 ) * 2.2 * uIntensity;

    gl_FragColor = vec4( col, 1.0 );
  }
`;

// ----------------------------------------------------------------------------
// Disco de acreción: anillo plano con espirales fbm de plasma (aditivo)
// ----------------------------------------------------------------------------

const ACCRETION_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  }
`;

const ACCRETION_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uInner;
  uniform float uSpin;
  uniform float uOpacity;
  uniform vec3 uColA;
  uniform vec3 uColB;
  uniform vec3 uColC;
  uniform vec3 uColD;

  varying vec2 vUv;

  ${GLSL_NOISE}

  void main() {
    // RingGeometry mapea uv de forma planar normalizada por el radio exterior.
    vec2 p = vUv * 2.0 - 1.0;
    float r = length( p );
    float ang = atan( p.y, p.x );
    float lr = log( max( r, 0.0015 ) );
    float spiral = ang * 2.0 + lr * 4.2 - uTime * uSpin;

    vec2 sp = vec2( cos( spiral ), sin( spiral ) ) * ( 0.55 + r * 2.6 );
    float n1 = fbm2( sp * 1.7 + vec2( 0.0, uTime * 0.02 ) );
    float n2 = fbm2( sp * 3.4 - vec2( uTime * 0.015, 0.0 ) );
    float plasma = clamp( n1 * 0.72 + n2 * 0.52, 0.0, 1.0 );

    // Rampa de plasma: violeta -> cian -> carmesí -> oro.
    vec3 col = mix( uColA, uColB, smoothstep( 0.12, 0.52, plasma ) );
    col = mix( col, uColC, smoothstep( 0.48, 0.78, plasma ) );
    col = mix( col, uColD, smoothstep( 0.76, 1.0, plasma ) );

    // Hebras de luz girando en la espiral.
    float thread = pow( max( 0.0, sin( spiral * 3.0 + n1 * 5.0 ) ), 14.0 );
    col += uColD * thread * 0.9;

    // Se desvanece en ambos bordes: nada de geometría dura de toro.
    float edge = smoothstep( uInner, uInner + 0.14, r ) * ( 1.0 - smoothstep( 0.70, 1.0, r ) );
    float alpha = edge * ( 0.30 + 0.70 * plasma ) * uOpacity;
    if ( alpha < 0.004 ) discard;

    gl_FragColor = vec4( col * ( 0.75 + 0.95 * plasma ), alpha );
  }
`;

// ----------------------------------------------------------------------------
// Anillos del Pilar del Mundo: energía fluida cel-shaded con brillo mágico
// ----------------------------------------------------------------------------

const ENERGY_RING_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalWorld;
  varying vec3 vViewDir;

  void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4( position, 1.0 );
    vNormalWorld = normalize( mat3( modelMatrix ) * normal );
    vViewDir = normalize( cameraPosition - worldPos.xyz );
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const ENERGY_RING_FRAGMENT = /* glsl */ `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uSunDir;
  uniform float uTime;
  uniform float uFlowSpeed;

  varying vec2 vUv;
  varying vec3 vNormalWorld;
  varying vec3 vViewDir;

  void main() {
    vec3 N = normalize( vNormalWorld );
    vec3 V = normalize( vViewDir );
    float NdotL = dot( N, normalize( uSunDir ) );

    // Energía fluyendo a lo largo del anillo (uv.x recorre la circunferencia).
    float flow = vUv.x * 6.28318 * 3.0 - uTime * uFlowSpeed;
    float pulse = pow( 0.5 + 0.5 * sin( flow ), 3.0 );
    float pulse2 = pow( 0.5 + 0.5 * sin( flow * 2.0 + 1.7 ), 6.0 );
    vec3 col = mix( uColorA, uColorB, pulse );
    col *= 0.55 + 0.85 * pulse + 0.60 * pulse2;

    // Cel de 3 bandas sobre el tubo del anillo.
    float band = 0.62;
    if ( NdotL > 0.46 ) {
      band = 1.15;
    } else if ( NdotL > 0.10 ) {
      band = 0.88;
    }
    col *= band;

    // Rim mágico.
    float fres = pow( 1.0 - max( dot( N, V ), 0.0 ), 2.4 );
    col += uColorB * smoothstep( 0.10, 0.90, fres ) * 0.9;

    gl_FragColor = vec4( col, 1.0 );
  }
`;

// ----------------------------------------------------------------------------
// Fábricas de materiales (una sola instancia por tipo: menos draw calls)
// ----------------------------------------------------------------------------

interface GalaxyCelOptions {
  baseColor: number;
  shadowTint?: number;
  veinA?: number;
  veinB?: number;
  rimColor?: number;
  veinStrength?: number;
  rimStrength?: number;
}

function createGalaxyCelMaterial(
  uTime: { value: number },
  options: GalaxyCelOptions
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: GALAXY_CEL_VERTEX,
    fragmentShader: GALAXY_CEL_FRAGMENT,
    uniforms: {
      uBaseColor: { value: new THREE.Color(options.baseColor) },
      uShadowTint: { value: new THREE.Color(options.shadowTint ?? 0x161b33) },
      uVeinA: { value: new THREE.Color(options.veinA ?? 0x22d3ee) },
      uVeinB: { value: new THREE.Color(options.veinB ?? 0xa855f7) },
      uRimColor: { value: new THREE.Color(options.rimColor ?? 0x7dd3fc) },
      uVeinStrength: { value: options.veinStrength ?? 0.85 },
      uRimStrength: { value: options.rimStrength ?? 0.7 },
      uSunDir: sharedShaderState.uSunDir,
      uHalftoneEnabled: sharedShaderState.uHalftoneEnabled,
      uTime,
    },
  });
}

function createInkOutlineMaterial(
  uTime: { value: number },
  thickness: number,
  color: number
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: INK_OUTLINE_VERTEX,
    fragmentShader: INK_OUTLINE_FRAGMENT,
    side: THREE.BackSide,
    uniforms: {
      uThickness: { value: thickness },
      uInkColor: { value: new THREE.Color(color) },
      uTime,
    },
  });
}

interface CosmicRockOptions {
  rockColor: number;
  shadowTint?: number;
  crackA?: number;
  crackB?: number;
  rimColor?: number;
  crackStrength?: number;
}

function createCosmicRockMaterial(
  uTime: { value: number },
  options: CosmicRockOptions
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: GALAXY_CEL_VERTEX,
    fragmentShader: COSMIC_ROCK_FRAGMENT,
    uniforms: {
      uRockColor: { value: new THREE.Color(options.rockColor) },
      uShadowTint: { value: new THREE.Color(options.shadowTint ?? 0x0b0a14) },
      uCrackA: { value: new THREE.Color(options.crackA ?? 0xa855f7) },
      uCrackB: { value: new THREE.Color(options.crackB ?? 0x22d3ee) },
      uRimColor: { value: new THREE.Color(options.rimColor ?? 0xd8fbff) },
      uCrackStrength: { value: options.crackStrength ?? 1.5 },
      uSunDir: sharedShaderState.uSunDir,
      uHalftoneEnabled: sharedShaderState.uHalftoneEnabled,
      uTime,
    },
  });
}

function createCrystalPrismMaterial(
  uTime: { value: number },
  crystalTint: number,
  rimColor: number
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: CRYSTAL_PRISM_VERTEX,
    fragmentShader: CRYSTAL_PRISM_FRAGMENT,
    uniforms: {
      uCrystalTint: { value: new THREE.Color(crystalTint) },
      uRimColor: { value: new THREE.Color(rimColor) },
      uSunDir: sharedShaderState.uSunDir,
      uTime,
      uPulse: { value: 1.0 },
    },
  });
}

function createGravityLensMaterial(
  uTime: { value: number },
  rimA: number,
  rimB: number,
  rimC: number,
  intensity: number
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: GRAVITY_LENS_VERTEX,
    fragmentShader: GRAVITY_LENS_FRAGMENT,
    uniforms: {
      uRimA: { value: new THREE.Color(rimA) },
      uRimB: { value: new THREE.Color(rimB) },
      uRimC: { value: new THREE.Color(rimC) },
      uIntensity: { value: intensity },
      uTime,
    },
  });
}

interface AccretionOptions {
  inner: number;
  outer: number;
  spin: number;
  opacity: number;
  colA: number;
  colB: number;
  colC: number;
  colD: number;
}

function createAccretionMaterial(
  uTime: { value: number },
  options: AccretionOptions
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: ACCRETION_VERTEX,
    fragmentShader: ACCRETION_FRAGMENT,
    uniforms: {
      uInner: { value: options.inner / options.outer },
      uSpin: { value: options.spin },
      uOpacity: { value: options.opacity },
      uColA: { value: new THREE.Color(options.colA) },
      uColB: { value: new THREE.Color(options.colB) },
      uColC: { value: new THREE.Color(options.colC) },
      uColD: { value: new THREE.Color(options.colD) },
      uTime,
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
}

function createEnergyRingMaterial(
  uTime: { value: number },
  colorA: number,
  colorB: number,
  flowSpeed: number
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: ENERGY_RING_VERTEX,
    fragmentShader: ENERGY_RING_FRAGMENT,
    uniforms: {
      uColorA: { value: new THREE.Color(colorA) },
      uColorB: { value: new THREE.Color(colorB) },
      uFlowSpeed: { value: flowSpeed },
      uSunDir: sharedShaderState.uSunDir,
      uTime,
    },
  });
}

// ----------------------------------------------------------------------------
// Fábrica principal
// ----------------------------------------------------------------------------

export function createDomeArenaBackdrop(scene: THREE.Scene): DomeArenaBackdrop {
  const rng = mulberry32(20250601);

  const group = new THREE.Group();
  group.name = 'dome-arena-backdrop';

  // Objetos temporales reutilizables: update() nunca reserva memoria.
  const _m4 = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _v = new THREE.Vector3();
  const _u = new THREE.Vector3();
  const _w = new THREE.Vector3();
  const _n = new THREE.Vector3();
  const _axis = new THREE.Vector3();
  const _s = new THREE.Vector3();
  const _c = new THREE.Color();

  // Relojes GLSL: update() sólo escribe `.value`, sin crear objetos.
  const timeUniforms: { value: number }[] = [];
  const makeTime = (): { value: number } => {
    const uniform = { value: 0 };
    timeUniforms.push(uniform);
    return uniform;
  };

  // ==========================================================================
  // 1. Cúpula de cristal de 50 m
  // ==========================================================================

  const domeGeo = new THREE.IcosahedronGeometry(DOME_RADIUS, 3);
  const domeCrystalMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.1,
    side: THREE.DoubleSide,
    depthWrite: false,
    fog: false,
  });
  const domeCrystal = new THREE.Mesh(domeGeo, domeCrystalMat);
  domeCrystal.name = 'dome-crystal';
  group.add(domeCrystal);

  // Retícula geodésica: con umbral de 6 grados salen todas las aristas del
  // icosaedro subdividido, así la curvatura de los 50 m se lee desde dentro.
  const domeEdgesGeo = new THREE.EdgesGeometry(domeGeo, 6);
  const domeLineMat = new THREE.LineBasicMaterial({
    color: 0xe0f2fe,
    transparent: true,
    opacity: 0.22,
    fog: false,
  });
  const domeLines = new THREE.LineSegments(domeEdgesGeo, domeLineMat);
  domeLines.name = 'dome-geodesic';
  group.add(domeLines);

  // Anillo ecuatorial + dos meridianos: orientación 3D de la cúpula.
  const guideGeo = new THREE.TorusGeometry(DOME_RADIUS + 0.1, 0.08, 6, 96);
  const guideMat = new THREE.MeshBasicMaterial({
    color: 0x22d3ee,
    transparent: true,
    opacity: 0.25,
    depthWrite: false,
    fog: false,
  });
  const equatorRing = new THREE.Mesh(guideGeo, guideMat);
  equatorRing.rotation.x = Math.PI / 2;
  const meridianA = new THREE.Mesh(guideGeo, guideMat);
  const meridianB = new THREE.Mesh(guideGeo, guideMat);
  meridianB.rotation.y = Math.PI / 2;
  group.add(equatorRing, meridianA, meridianB);

  // ==========================================================================
  // 2a. El Pilar del Mundo (shader de galaxia + anillos de energía fluida)
  // ==========================================================================

  const pillar = new THREE.Group();
  pillar.name = 'world-pillar';
  pillar.position.set(110, -40, -140);
  group.add(pillar);

  const pillarMat = createGalaxyCelMaterial(makeTime(), {
    baseColor: 0x1a1236,
    shadowTint: 0x0a0718,
    veinA: 0x22d3ee,
    veinB: 0xa855f7,
    rimColor: 0x7dd3fc,
    veinStrength: 1.15,
    rimStrength: 0.95,
  });

  // 5 segmentos flotantes fracturados que ascienden 240 m (de y=-40 a y=200).
  const pillarSegGeo = new THREE.CylinderGeometry(6.2, 7.4, 40, 8, 1);
  fractureGeometry(pillarSegGeo, 0.35, 7);
  for (let i = 0; i < 5; i++) {
    const seg = new THREE.Mesh(pillarSegGeo, pillarMat);
    seg.position.set((rng() - 0.5) * 3, 20 + i * 50, (rng() - 0.5) * 3);
    seg.rotation.set((rng() - 0.5) * 0.07, rng() * Math.PI, (rng() - 0.5) * 0.07);
    const taper = 1 - (i / 4) * 0.22;
    seg.scale.set(taper, 1, taper);
    addComicOutline(seg, 0.4, 0xa5f3fc);
    pillar.add(seg);
  }

  // Anillos de energía fluida inclinados que giran despacio (precesión).
  const pillarRingGeo = new THREE.TorusGeometry(11.5, 0.45, 6, 48);
  const goldRingMat = createEnergyRingMaterial(makeTime(), 0xfbbf24, 0xfff7d6, 2.4);
  const cyanRingMat = createEnergyRingMaterial(makeTime(), 0x22d3ee, 0xe0fbff, 3.1);
  const pillarRings: { node: THREE.Group; speed: number }[] = [];
  const ringHeights = [5, 55, 105, 155];
  for (let i = 0; i < ringHeights.length; i++) {
    const wrapper = new THREE.Group();
    wrapper.position.set(0, ringHeights[i], 0);
    const ring = new THREE.Mesh(pillarRingGeo, i % 2 === 0 ? goldRingMat : cyanRingMat);
    ring.rotation.x = Math.PI / 2 + (i - 1.5) * 0.16;
    ring.rotation.y = i * 0.5;
    wrapper.add(ring);
    pillar.add(wrapper);
    pillarRings.push({
      node: wrapper,
      speed: (i % 2 === 0 ? 1 : -1) * (0.05 + i * 0.018),
    });
  }

  // ==========================================================================
  // 2b. Singularidad / Eclipse Cenital: lente gravitacional + disco de acreción
  // ==========================================================================

  const singularity = new THREE.Group();
  singularity.name = 'singularity';
  singularity.position.set(0, 175, -60);
  group.add(singularity);

  const singularityCore = new THREE.Mesh(
    new THREE.SphereGeometry(13, 48, 32),
    createGravityLensMaterial(makeTime(), 0x22d3ee, 0xa855f7, 0xffffff, 1.15)
  );
  singularityCore.name = 'singularity-lens';
  singularity.add(singularityCore);

  // Disco interior: plasma caliente violeta/cian/carmesí/oro.
  const diskAWrapper = new THREE.Group();
  const diskA = new THREE.Mesh(
    new THREE.RingGeometry(15, 34, 128, 4),
    createAccretionMaterial(makeTime(), {
      inner: 15,
      outer: 34,
      spin: 0.55,
      opacity: 1.0,
      colA: 0x3b0764,
      colB: 0x22d3ee,
      colC: 0xf43f5e,
      colD: 0xfbbf24,
    })
  );
  diskA.rotation.x = Math.PI / 2;
  diskAWrapper.rotation.x = 0.42;
  diskAWrapper.add(diskA);

  // Disco exterior: halo frío más amplio y tenue.
  const diskBWrapper = new THREE.Group();
  const diskB = new THREE.Mesh(
    new THREE.RingGeometry(20, 46, 128, 4),
    createAccretionMaterial(makeTime(), {
      inner: 20,
      outer: 46,
      spin: -0.34,
      opacity: 0.55,
      colA: 0x1e1b4b,
      colB: 0x6d28d9,
      colC: 0x22d3ee,
      colD: 0xc4b5fd,
    })
  );
  diskB.rotation.x = Math.PI / 2;
  diskBWrapper.rotation.set(-0.75, 0.6, 0);
  diskBWrapper.add(diskB);

  singularity.add(diskAWrapper, diskBWrapper);

  // ==========================================================================
  // 2c. Archipiélago de ruinas en órbita (InstancedMesh + contorno de tinta)
  // ==========================================================================

  // --- 14 monolitos monumentales, repartidos en espiral de Fibonacci --------
  const monoGeo = new THREE.CylinderGeometry(0.75, 1.6, 11, 5, 1);
  fractureGeometry(monoGeo, 0.55, 3);
  const monoMat = createGalaxyCelMaterial(makeTime(), {
    baseColor: 0x2b2150,
    shadowTint: 0x0d0a1e,
    veinA: 0x22d3ee,
    veinB: 0xa855f7,
    rimColor: 0x9df3ff,
    veinStrength: 1.0,
    rimStrength: 0.85,
  });
  const monoMesh = new THREE.InstancedMesh(monoGeo, monoMat, MONOLITH_COUNT);
  monoMesh.name = 'monoliths';
  monoMesh.frustumCulled = false;
  const monoOutlineMesh = new THREE.InstancedMesh(
    monoGeo,
    createInkOutlineMaterial(makeTime(), 0.5, 0x9df3ff),
    MONOLITH_COUNT
  );
  monoOutlineMesh.frustumCulled = false;

  const monoPalette = [0x231b45, 0x1a1533, 0x2b2150, 0x151d38].map(
    (c) => new THREE.Color(c)
  );
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < MONOLITH_COUNT; i++) {
    // Espiral de Fibonacci: reparto uniforme, cero racimos de ruido.
    const y = 1 - (i / (MONOLITH_COUNT - 1)) * 2;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = goldenAngle * i;
    const radius = 100 + rng() * 130;
    _v.set(Math.cos(theta) * ring * radius, y * radius * 0.85, Math.sin(theta) * ring * radius);
    randomQuat(rng, _q);
    _s.set(2.4 + rng() * 2.2, 3.0 + rng() * 3.0, 2.4 + rng() * 2.2);
    _m4.compose(_v, _q, _s);
    monoMesh.setMatrixAt(i, _m4);
    monoOutlineMesh.setMatrixAt(i, _m4);
    _c.copy(monoPalette[(rng() * monoPalette.length) | 0]);
    _c.multiplyScalar(0.85 + rng() * 0.35);
    monoMesh.setColorAt(i, _c);
  }
  if (monoMesh.instanceColor) monoMesh.instanceColor.needsUpdate = true;
  group.add(monoMesh, monoOutlineMesh);

  // --- 8 arcos rúnicos grandes, bien espaciados en azimut y elevación ------
  const arcGeo = new THREE.TorusGeometry(7, 0.55, 5, 26, Math.PI * 1.3);
  const arcCoreGeo = new THREE.TorusGeometry(7, 0.13, 4, 40, Math.PI * 1.3);
  const arcMat = createGalaxyCelMaterial(makeTime(), {
    baseColor: 0x332a5e,
    shadowTint: 0x0d0a1e,
    veinA: 0x22d3ee,
    veinB: 0xf0abfc,
    rimColor: 0x7dd3fc,
    veinStrength: 1.1,
    rimStrength: 0.9,
  });
  const arcCoreMat = createGalaxyCelMaterial(makeTime(), {
    baseColor: 0x86efff,
    shadowTint: 0x0e7490,
    veinA: 0xffffff,
    veinB: 0x22d3ee,
    rimColor: 0xffffff,
    veinStrength: 2.2,
    rimStrength: 1.3,
  });
  const arcMesh = new THREE.InstancedMesh(arcGeo, arcMat, ARC_COUNT);
  const arcCoreMesh = new THREE.InstancedMesh(arcCoreGeo, arcCoreMat, ARC_COUNT);
  const arcOutlineMesh = new THREE.InstancedMesh(
    arcGeo,
    createInkOutlineMaterial(makeTime(), 0.3, 0x7dd3fc),
    ARC_COUNT
  );
  arcMesh.frustumCulled = false;
  arcCoreMesh.frustumCulled = false;
  arcOutlineMesh.frustumCulled = false;
  const arcPalette = [0x2a2350, 0x332a5e, 0x1e2a4d].map((c) => new THREE.Color(c));
  for (let i = 0; i < ARC_COUNT; i++) {
    const azimuth = (i / ARC_COUNT) * Math.PI * 2 + (rng() - 0.5) * 0.3;
    const elevation = -0.5 + (i % 4) * 0.42 + (rng() - 0.5) * 0.18;
    const radius = 120 + rng() * 95;
    const ce = Math.cos(elevation);
    _v.set(
      Math.cos(azimuth) * ce * radius,
      Math.sin(elevation) * radius,
      Math.sin(azimuth) * ce * radius
    );
    randomQuat(rng, _q);
    _s.setScalar(1.8 + rng() * 1.2);
    _m4.compose(_v, _q, _s);
    arcMesh.setMatrixAt(i, _m4);
    arcCoreMesh.setMatrixAt(i, _m4);
    arcOutlineMesh.setMatrixAt(i, _m4);
    _c.copy(arcPalette[(rng() * arcPalette.length) | 0]);
    arcMesh.setColorAt(i, _c);
  }
  if (arcMesh.instanceColor) arcMesh.instanceColor.needsUpdate = true;
  group.add(arcMesh, arcCoreMesh, arcOutlineMesh);

  // --- 36 fragmentos de roca/cristal en órbita (deriva por frame) ----------
  const fragGeo = new THREE.IcosahedronGeometry(1.15, 0);
  fractureGeometry(fragGeo, 0.45, 11);
  const fragMat = createCosmicRockMaterial(makeTime(), {
    rockColor: 0x3b3266,
    shadowTint: 0x0b0a14,
    crackA: 0xa855f7,
    crackB: 0x22d3ee,
    rimColor: 0xd8fbff,
    crackStrength: 1.2,
  });
  const fragMesh = new THREE.InstancedMesh(fragGeo, fragMat, FRAGMENT_COUNT);
  fragMesh.frustumCulled = false;
  const fragOutlineMesh = new THREE.InstancedMesh(
    fragGeo,
    createInkOutlineMaterial(makeTime(), 0.12, 0xd8fbff),
    FRAGMENT_COUNT
  );
  fragOutlineMesh.frustumCulled = false;

  // Parámetros orbitales planos (Float32Array: cero allocations en update).
  const fragU = new Float32Array(FRAGMENT_COUNT * 3);
  const fragV = new Float32Array(FRAGMENT_COUNT * 3);
  const fragSpin = new Float32Array(FRAGMENT_COUNT * 3);
  const fragRadius = new Float32Array(FRAGMENT_COUNT);
  const fragSpeed = new Float32Array(FRAGMENT_COUNT);
  const fragPhase = new Float32Array(FRAGMENT_COUNT);
  const fragScale = new Float32Array(FRAGMENT_COUNT);
  const fragSpinSpeed = new Float32Array(FRAGMENT_COUNT);
  const fragPalette = [0x3b3266, 0x2a2350, 0x1e2f4a, 0x4b3f7a].map(
    (c) => new THREE.Color(c)
  );

  const applyFragmentMatrices = (elapsed: number): void => {
    for (let i = 0; i < FRAGMENT_COUNT; i++) {
      const i3 = i * 3;
      const a = fragPhase[i] + elapsed * fragSpeed[i];
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      _v
        .set(
          fragU[i3] * ca + fragV[i3] * sa,
          fragU[i3 + 1] * ca + fragV[i3 + 1] * sa,
          fragU[i3 + 2] * ca + fragV[i3 + 2] * sa
        )
        .multiplyScalar(fragRadius[i]);
      _axis.set(fragSpin[i3], fragSpin[i3 + 1], fragSpin[i3 + 2]);
      _q.setFromAxisAngle(_axis, elapsed * fragSpinSpeed[i]);
      _s.setScalar(fragScale[i]);
      _m4.compose(_v, _q, _s);
      fragMesh.setMatrixAt(i, _m4);
      fragOutlineMesh.setMatrixAt(i, _m4);
    }
    fragMesh.instanceMatrix.needsUpdate = true;
    fragOutlineMesh.instanceMatrix.needsUpdate = true;
  };

  for (let i = 0; i < FRAGMENT_COUNT; i++) {
    const i3 = i * 3;
    // Base ortonormal del plano orbital: u, v perpendiculares a la normal n.
    _n.set(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1).normalize();
    if (Math.abs(_n.y) < 0.9) {
      _u.set(0, 1, 0);
    } else {
      _u.set(1, 0, 0);
    }
    _w.crossVectors(_n, _u).normalize();
    _u.crossVectors(_n, _w);
    fragU[i3] = _w.x;
    fragU[i3 + 1] = _w.y;
    fragU[i3 + 2] = _w.z;
    fragV[i3] = _u.x;
    fragV[i3 + 1] = _u.y;
    fragV[i3 + 2] = _u.z;
    fragRadius[i] = 85 + rng() * 135;
    fragSpeed[i] = (0.008 + rng() * 0.04) * (rng() < 0.5 ? -1 : 1);
    fragPhase[i] = rng() * Math.PI * 2;
    fragScale[i] = 1.4 + rng() * 2.4;
    _n.set(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1).normalize();
    fragSpin[i3] = _n.x;
    fragSpin[i3 + 1] = _n.y;
    fragSpin[i3 + 2] = _n.z;
    fragSpinSpeed[i] = 0.1 + rng() * 0.4;
    _c.copy(fragPalette[(rng() * fragPalette.length) | 0]);
    _c.multiplyScalar(0.8 + rng() * 0.4);
    fragMesh.setColorAt(i, _c);
  }
  if (fragMesh.instanceColor) fragMesh.instanceColor.needsUpdate = true;
  applyFragmentMatrices(0);
  group.add(fragMesh, fragOutlineMesh);

  // ==========================================================================
  // 2d. Agujero negro abisal: vórtice de niebla morada (Y = -125 m)
  // ==========================================================================

  const abyssGroup = new THREE.Group();
  abyssGroup.name = 'abyss-singularity';
  abyssGroup.position.y = ABYSS_Y;
  group.add(abyssGroup);

  const abyssMat = new THREE.ShaderMaterial({
    vertexShader: ABYSS_VERTEX,
    fragmentShader: ABYSS_FRAGMENT,
    uniforms: { uTime: makeTime() },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const abyssDisk = new THREE.Mesh(new THREE.PlaneGeometry(850, 850), abyssMat);
  abyssDisk.name = 'abyss-vortex';
  abyssDisk.rotation.x = -Math.PI / 2;
  abyssGroup.add(abyssDisk);

  // Anillos de luz violeta/fucsia cayendo en espiral hacia el pozo.
  const abyssRingGeo = new THREE.TorusGeometry(1, 0.016, 4, 128);
  const abyssRings: { node: THREE.Mesh; speed: number }[] = [];
  const abyssRingSpecs = [
    { radius: 58, color: 0x8b5cf6, opacity: 0.55, y: 1.4, tilt: 0.05, speed: 0.09 },
    { radius: 96, color: 0xc026d3, opacity: 0.4, y: 3.2, tilt: -0.07, speed: -0.06 },
    { radius: 148, color: 0x6d28d9, opacity: 0.3, y: 5.6, tilt: 0.04, speed: 0.04 },
  ];
  for (let i = 0; i < abyssRingSpecs.length; i++) {
    const spec = abyssRingSpecs[i];
    const ring = new THREE.Mesh(
      abyssRingGeo,
      new THREE.MeshBasicMaterial({
        color: spec.color,
        transparent: true,
        opacity: spec.opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      })
    );
    ring.position.y = spec.y;
    ring.rotation.x = Math.PI / 2 + spec.tilt;
    ring.scale.setScalar(spec.radius);
    abyssGroup.add(ring);
    abyssRings.push({ node: ring, speed: spec.speed });
  }

  // ==========================================================================
  // 2e. 22 asteroides con carácter: grietas de maná + contorno cian sutil
  // ==========================================================================

  const asteroidGeo = new THREE.DodecahedronGeometry(1, 0);
  fractureGeometry(asteroidGeo, 0.22, 23);
  const asteroidMat = createCosmicRockMaterial(makeTime(), {
    rockColor: 0x1b1533,
    shadowTint: 0x07060f,
    crackA: 0xa855f7,
    crackB: 0x22d3ee,
    rimColor: 0xd8fbff,
    crackStrength: 1.7,
  });
  const asteroidMesh = new THREE.InstancedMesh(asteroidGeo, asteroidMat, ASTEROID_COUNT);
  asteroidMesh.name = 'asteroid-current';
  asteroidMesh.frustumCulled = false;
  const asteroidOutlineMesh = new THREE.InstancedMesh(
    asteroidGeo,
    createInkOutlineMaterial(makeTime(), 0.18, 0xd8fbff),
    ASTEROID_COUNT
  );
  asteroidOutlineMesh.frustumCulled = false;

  const astU = new Float32Array(ASTEROID_COUNT * 3);
  const astV = new Float32Array(ASTEROID_COUNT * 3);
  const astSpin = new Float32Array(ASTEROID_COUNT * 3);
  const astRadius = new Float32Array(ASTEROID_COUNT);
  const astSpeed = new Float32Array(ASTEROID_COUNT);
  const astPhase = new Float32Array(ASTEROID_COUNT);
  const astScale = new Float32Array(ASTEROID_COUNT * 3);
  const astSpinSpeed = new Float32Array(ASTEROID_COUNT);
  const astPalette = [0x0b0a14, 0x141026, 0x1b1533, 0x241a3d].map((c) => new THREE.Color(c));

  for (let i = 0; i < ASTEROID_COUNT; i++) {
    const i3 = i * 3;
    // Base ortonormal del plano orbital de la corriente.
    _n.set(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1).normalize();
    if (Math.abs(_n.y) < 0.9) {
      _u.set(0, 1, 0);
    } else {
      _u.set(1, 0, 0);
    }
    _w.crossVectors(_n, _u).normalize();
    _u.crossVectors(_n, _w);
    astU[i3] = _w.x;
    astU[i3 + 1] = _w.y;
    astU[i3 + 2] = _w.z;
    astV[i3] = _u.x;
    astV[i3 + 1] = _u.y;
    astV[i3 + 2] = _u.z;
    astRadius[i] = 68 + rng() * 107;
    astSpeed[i] = (0.012 + rng() * 0.05) * (rng() < 0.5 ? -1 : 1);
    astPhase[i] = rng() * Math.PI * 2;
    const base = 2.2 + rng() * 4.0;
    astScale[i3] = base * (0.75 + rng() * 0.5);
    astScale[i3 + 1] = base * (0.7 + rng() * 0.6);
    astScale[i3 + 2] = base * (0.75 + rng() * 0.5);
    _n.set(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1).normalize();
    astSpin[i3] = _n.x;
    astSpin[i3 + 1] = _n.y;
    astSpin[i3 + 2] = _n.z;
    astSpinSpeed[i] = 0.12 + rng() * 0.55;
    _c.copy(astPalette[(rng() * astPalette.length) | 0]);
    _c.multiplyScalar(0.85 + rng() * 0.4);
    asteroidMesh.setColorAt(i, _c);
  }
  if (asteroidMesh.instanceColor) asteroidMesh.instanceColor.needsUpdate = true;

  const applyAsteroidMatrices = (elapsed: number): void => {
    for (let i = 0; i < ASTEROID_COUNT; i++) {
      const i3 = i * 3;
      const a = astPhase[i] + elapsed * astSpeed[i];
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      _v
        .set(
          astU[i3] * ca + astV[i3] * sa,
          astU[i3 + 1] * ca + astV[i3 + 1] * sa,
          astU[i3 + 2] * ca + astV[i3 + 2] * sa
        )
        .multiplyScalar(astRadius[i]);
      _axis.set(astSpin[i3], astSpin[i3 + 1], astSpin[i3 + 2]);
      _q.setFromAxisAngle(_axis, elapsed * astSpinSpeed[i]);
      _s.set(astScale[i3], astScale[i3 + 1], astScale[i3 + 2]);
      _m4.compose(_v, _q, _s);
      asteroidMesh.setMatrixAt(i, _m4);
      asteroidOutlineMesh.setMatrixAt(i, _m4);
    }
    asteroidMesh.instanceMatrix.needsUpdate = true;
    asteroidOutlineMesh.instanceMatrix.needsUpdate = true;
  };

  applyAsteroidMatrices(0);
  group.add(asteroidMesh, asteroidOutlineMesh);

  // ==========================================================================
  // 2f. Dos agujeros negros secundarios en el horizonte lejano
  // ==========================================================================

  const horizonHoles: { spin: THREE.Group; speed: number }[] = [];
  const horizonSpecs = [
    {
      x: -185,
      y: 45,
      z: -150,
      core: 9.5,
      inner: 13,
      outer: 30,
      tilt: 0.55,
      speed: 0.24,
      rimA: 0xa855f7,
      rimB: 0x22d3ee,
      colA: 0x2e1065,
      colB: 0xa855f7,
      colC: 0xf0abfc,
      colD: 0xfbbf24,
    },
    {
      x: 195,
      y: -20,
      z: 130,
      core: 7.5,
      inner: 10.5,
      outer: 24,
      tilt: -0.42,
      speed: -0.19,
      rimA: 0x22d3ee,
      rimB: 0x6366f1,
      colA: 0x0e7490,
      colB: 0x22d3ee,
      colC: 0x818cf8,
      colD: 0xffffff,
    },
  ];
  for (let i = 0; i < horizonSpecs.length; i++) {
    const spec = horizonSpecs[i];
    const hole = new THREE.Group();
    hole.name = `horizon-black-hole-${i}`;
    hole.position.set(spec.x, spec.y, spec.z);
    group.add(hole);

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(spec.core, 40, 28),
      createGravityLensMaterial(makeTime(), spec.rimA, spec.rimB, 0xffffff, 1.0)
    );
    hole.add(core);

    const spin = new THREE.Group();
    spin.rotation.x = spec.tilt;

    const disk = new THREE.Mesh(
      new THREE.RingGeometry(spec.inner, spec.outer, 96, 4),
      createAccretionMaterial(makeTime(), {
        inner: spec.inner,
        outer: spec.outer,
        spin: 0.48,
        opacity: 0.9,
        colA: spec.colA,
        colB: spec.colB,
        colC: spec.colC,
        colD: spec.colD,
      })
    );
    disk.rotation.x = Math.PI / 2;
    spin.add(disk);

    hole.add(spin);
    horizonHoles.push({ spin, speed: spec.speed });
  }

  // ==========================================================================
  // 2g. Estrellas de 4 puntas + 32 prismas de cristal galáctico
  // ==========================================================================

  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(STAR_COUNT * 3);
  const starSize = new Float32Array(STAR_COUNT);
  const starColor = new Float32Array(STAR_COUNT * 3);
  const starPhase = new Float32Array(STAR_COUNT);
  const starSpeed = new Float32Array(STAR_COUNT);
  const starPalette = [0x22d3ee, 0xf8fafc, 0xfbbf24, 0xf43f5e].map((c) => new THREE.Color(c));
  for (let i = 0; i < STAR_COUNT; i++) {
    const i3 = i * 3;
    shellPoint(rng, 60, 210, _v);
    starPos[i3] = _v.x;
    starPos[i3 + 1] = _v.y;
    starPos[i3 + 2] = _v.z;
    starSize[i] = 1.1 + rng() * 1.9;
    _c.copy(starPalette[(rng() * starPalette.length) | 0]);
    starColor[i3] = _c.r;
    starColor[i3 + 1] = _c.g;
    starColor[i3 + 2] = _c.b;
    starPhase[i] = rng() * Math.PI * 2;
    starSpeed[i] = 0.6 + rng() * 2.2;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute('aSize', new THREE.BufferAttribute(starSize, 1));
  starGeo.setAttribute('aColor', new THREE.BufferAttribute(starColor, 3));
  starGeo.setAttribute('aPhase', new THREE.BufferAttribute(starPhase, 1));
  starGeo.setAttribute('aSpeed', new THREE.BufferAttribute(starSpeed, 1));

  const starMat = new THREE.ShaderMaterial({
    vertexShader: STAR_VERTEX,
    fragmentShader: STAR_FRAGMENT,
    uniforms: { uTime: makeTime(), uPixelScale: { value: 520 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const starField = new THREE.Points(starGeo, starMat);
  starField.name = 'four-point-stars';
  starField.frustumCulled = false;
  group.add(starField);

  // Prismas: octaedros alargados (punto arriba, cuadrado en medio, punto abajo).
  const prismGeo = new THREE.OctahedronGeometry(1, 0);
  prismGeo.scale(1, 2.3, 1);
  const prismMat = createCrystalPrismMaterial(makeTime(), 0x22d3ee, 0xffffff);
  const prismMesh = new THREE.InstancedMesh(prismGeo, prismMat, PRISM_COUNT);
  prismMesh.name = 'floating-prisms';
  prismMesh.frustumCulled = false;
  const prismOutlineMesh = new THREE.InstancedMesh(
    prismGeo,
    createInkOutlineMaterial(makeTime(), 0.1, 0xffffff),
    PRISM_COUNT
  );
  prismOutlineMesh.frustumCulled = false;

  const prismU = new Float32Array(PRISM_COUNT * 3);
  const prismV = new Float32Array(PRISM_COUNT * 3);
  const prismSpin = new Float32Array(PRISM_COUNT * 3);
  const prismRadius = new Float32Array(PRISM_COUNT);
  const prismSpeed = new Float32Array(PRISM_COUNT);
  const prismPhase = new Float32Array(PRISM_COUNT);
  const prismScale = new Float32Array(PRISM_COUNT);
  const prismSpinSpeed = new Float32Array(PRISM_COUNT);
  const prismBobAmp = new Float32Array(PRISM_COUNT);
  const prismBobSpeed = new Float32Array(PRISM_COUNT);
  const prismPalette = [0x22d3ee, 0xf8fafc, 0xfbbf24, 0xf43f5e].map((c) => new THREE.Color(c));

  for (let i = 0; i < PRISM_COUNT; i++) {
    const i3 = i * 3;
    _n.set(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1).normalize();
    if (Math.abs(_n.y) < 0.9) {
      _u.set(0, 1, 0);
    } else {
      _u.set(1, 0, 0);
    }
    _w.crossVectors(_n, _u).normalize();
    _u.crossVectors(_n, _w);
    prismU[i3] = _w.x;
    prismU[i3 + 1] = _w.y;
    prismU[i3 + 2] = _w.z;
    prismV[i3] = _u.x;
    prismV[i3 + 1] = _u.y;
    prismV[i3 + 2] = _u.z;
    prismRadius[i] = 60 + rng() * 150;
    prismSpeed[i] = (0.01 + rng() * 0.035) * (rng() < 0.5 ? -1 : 1);
    prismPhase[i] = rng() * Math.PI * 2;
    prismScale[i] = 1.4 + rng() * 2.2;
    _n.set(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1).normalize();
    prismSpin[i3] = _n.x;
    prismSpin[i3 + 1] = _n.y;
    prismSpin[i3 + 2] = _n.z;
    prismSpinSpeed[i] = 0.15 + rng() * 0.5;
    prismBobAmp[i] = 1.5 + rng() * 4.5;
    prismBobSpeed[i] = 0.25 + rng() * 0.7;
    _c.copy(prismPalette[(rng() * prismPalette.length) | 0]);
    prismMesh.setColorAt(i, _c);
  }
  if (prismMesh.instanceColor) prismMesh.instanceColor.needsUpdate = true;

  // Fase por instancia: el pulso brillante vive en el shader, sin subir buffers.
  const prismPhaseAttr = new Float32Array(PRISM_COUNT);
  for (let i = 0; i < PRISM_COUNT; i++) prismPhaseAttr[i] = rng();
  prismGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(prismPhaseAttr, 1));

  const applyPrismMatrices = (elapsed: number): void => {
    for (let i = 0; i < PRISM_COUNT; i++) {
      const i3 = i * 3;
      const a = prismPhase[i] + elapsed * prismSpeed[i];
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      _v
        .set(
          prismU[i3] * ca + prismV[i3] * sa,
          prismU[i3 + 1] * ca + prismV[i3 + 1] * sa,
          prismU[i3 + 2] * ca + prismV[i3 + 2] * sa
        )
        .multiplyScalar(prismRadius[i]);
      _v.y += Math.sin(elapsed * prismBobSpeed[i] + prismPhase[i]) * prismBobAmp[i];
      _axis.set(prismSpin[i3], prismSpin[i3 + 1], prismSpin[i3 + 2]);
      _q.setFromAxisAngle(_axis, elapsed * prismSpinSpeed[i]);
      _s.setScalar(prismScale[i]);
      _m4.compose(_v, _q, _s);
      prismMesh.setMatrixAt(i, _m4);
      prismOutlineMesh.setMatrixAt(i, _m4);
    }
    prismMesh.instanceMatrix.needsUpdate = true;
    prismOutlineMesh.instanceMatrix.needsUpdate = true;
  };

  applyPrismMatrices(0);
  group.add(prismMesh, prismOutlineMesh);

  // ==========================================================================
  // 2h. Bóveda espacial (R = 800, BackSide, shader propio)
  // ==========================================================================

  const skyMat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    uniforms: { uTime: makeTime() },
    side: THREE.BackSide,
    depthWrite: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(800, 48, 32), skyMat);
  sky.name = 'space-vault';
  group.add(sky);

  scene.add(group);

  // ==========================================================================
  // 3. Contrato: update sin allocations + dispose completo
  // ==========================================================================

  const update = (dt: number, elapsed: number): void => {
    // Un único reloj para todos los shaders del escenario.
    for (let i = 0; i < timeUniforms.length; i++) timeUniforms[i].value = elapsed;

    // Pulso muy sutil en la retícula geodésica de la cúpula.
    domeLineMat.opacity = 0.22 + 0.035 * (0.5 + 0.5 * Math.sin(elapsed * 0.8));

    // Precesión lenta de los anillos de energía del Pilar del Mundo.
    for (let i = 0; i < pillarRings.length; i++) {
      pillarRings[i].node.rotation.y = elapsed * pillarRings[i].speed;
    }

    // Precesión de los discos de acreción de la Singularidad cenital.
    diskAWrapper.rotation.y = elapsed * 0.32;
    diskBWrapper.rotation.y = -elapsed * 0.21;

    // Deriva orbital suave de los fragmentos de roca/cristal.
    applyFragmentMatrices(elapsed);

    // Vórtice abisal: niebla morada girando muy lento + anillos en espiral.
    abyssGroup.rotation.y += dt * 0.008;
    for (let i = 0; i < abyssRings.length; i++) {
      abyssRings[i].node.rotation.z = elapsed * abyssRings[i].speed;
    }

    // Asteroides viajando en sus corrientes orbitales.
    applyAsteroidMatrices(elapsed);

    // Discos de acreción de los agujeros negros del horizonte.
    for (let i = 0; i < horizonHoles.length; i++) {
      horizonHoles[i].spin.rotation.y = elapsed * horizonHoles[i].speed;
    }

    // Prismas de cristal galáctico en su órbita.
    applyPrismMatrices(elapsed);
  };

  const dispose = (): void => {
    group.traverse((obj) => {
      const instanced = obj as THREE.InstancedMesh;
      if (instanced.isInstancedMesh) instanced.dispose();
      const holder = obj as THREE.Mesh;
      if (holder.geometry) holder.geometry.dispose();
      const mat = holder.material;
      if (Array.isArray(mat)) {
        for (let i = 0; i < mat.length; i++) mat[i].dispose();
      } else if (mat) {
        (mat as THREE.Material).dispose();
      }
    });
    scene.remove(group);
  };

  return {
    group,
    domeRadius: DOME_RADIUS,
    update,
    dispose,
  };
}
