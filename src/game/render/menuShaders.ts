import * as THREE from 'three';

// ============================================================================
// Divisor líquido del menú — identidad Cosmic Nebula
// ============================================================================
//
// Un quad a pantalla completa (cámara ortográfica) que pinta el "blade"
// diagonal de la portada: panel de OBSIDIANA ASTRAL a la izquierda (#080414 ->
// #120926) con trama estelar y líneas diagonales finas violeta/cian, borde de
// tinta BLANCO puro brillante y una franja de nebulosa líquida (violeta ->
// carmesí -> cian) con puntos halftone que se funde hacia el diorama cósmico
// de la derecha. Sobre el panel oscuro, el logo 3D y los botones resaltan
// con sus bordes blancos/cian/carmesí.
//
// La silueta SIEMPRE es la misma diagonal (arriba ~42% del ancho, abajo ~25%):
// el borde se desplaza con una onda líquida continua (senos + FBM que fluye
// con `uTime`) de amplitud ~0.016, así que ripples como fluido vivo sin perder
// nunca el corte limpio tipo cuchilla.

export interface MenuFluidDivider {
  /** Quad a pantalla completa (PlaneGeometry 2x2) con el shader del divisor. */
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  /** Cámara ortográfica que encuadra el quad (-1..1). */
  camera: THREE.OrthographicCamera;
  /** Avanza el reloj y ajusta el aspecto del ruido. */
  update: (time: number, aspect: number) => void;
  dispose: () => void;
}

const dividerVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  }
`;

const dividerFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uAspect;
  varying vec2 vUv;

  // --- Ruido de valor 2D + FBM: advección líquida del borde ---
  float hash21( vec2 p ) {
    p = fract( p * vec2( 123.34, 456.21 ) );
    p += dot( p, p + 45.32 );
    return fract( p.x * p.y );
  }

  float valueNoise( vec2 p ) {
    vec2 i = floor( p );
    vec2 f = fract( p );
    f = f * f * ( 3.0 - 2.0 * f );
    float a = hash21( i );
    float b = hash21( i + vec2( 1.0, 0.0 ) );
    float c = hash21( i + vec2( 0.0, 1.0 ) );
    float d = hash21( i + vec2( 1.0, 1.0 ) );
    return mix( mix( a, b, f.x ), mix( c, d, f.x ), f.y );
  }

  float fbm( vec2 p ) {
    float sum = 0.0;
    float amp = 0.5;
    for ( int i = 0; i < 4; i++ ) {
      sum += amp * valueNoise( p );
      p = p * 2.03 + vec2( 1.7, 9.2 );
      amp *= 0.5;
    }
    return sum;
  }

  // Trama de puntos halftone (impresión cómic, 30 grados).
  float halftoneDots( vec2 fragCoord, float scale ) {
    float angle = 0.523599;
    mat2 rot = mat2( cos( angle ), -sin( angle ), sin( angle ), cos( angle ) );
    vec2 uv = ( rot * fragCoord ) / scale;
    vec2 grid = fract( uv ) - 0.5;
    return length( grid );
  }

  void main() {
    vec2 uv = vUv;

    // Silueta diagonal con onda líquida suave y orgánica
    float baseEdgeX = mix( 0.40, 0.24, 1.0 - uv.y );
    vec2 flow = vec2( uv.x * uAspect, uv.y );
    float t = uTime;
    float n1 = fbm( vec2( flow.y * 3.0 + t * 0.22, flow.x * 1.5 - t * 0.12 ) );
    float n2 = fbm( vec2( flow.y * 6.2 - t * 0.28, flow.x * 2.6 + t * 0.16 ) );
    float wave = sin( uv.y * 9.0 + t * 1.2 ) * 0.40
               + ( n1 - 0.5 ) * 1.25
               + ( n2 - 0.5 ) * 0.55;
    float fluidEdgeX = baseEdgeX + ( wave / 1.5 ) * 0.022;
    float d = uv.x - fluidEdgeX;

    vec3 col;
    float alpha;

    if ( d < 0.0 ) {
      // --- Panel izquierdo: velo oscuro translúcido que deja pasar el fluido ---
      vec3 topCol = vec3( 0.020, 0.022, 0.055 );
      vec3 botCol = vec3( 0.040, 0.025, 0.075 );
      col = mix( botCol, topCol, uv.y );
      alpha = 0.72;
    } else if ( d < 0.0028 ) {
      // --- Borde fluido fino cian/blanco sutil (no compite con el contorno de Nyx) ---
      col = mix( vec3( 0.133, 0.827, 0.933 ), vec3( 0.85, 0.96, 1.0 ), 0.35 );
      alpha = 0.60;
    } else if ( d < 0.055 ) {
      // --- Estela líquida translúcida con halftone sutil ---
      float f = ( d - 0.0028 ) / 0.0522;
      float swirl = fbm( vec2( uv.y * 5.0 + t * 0.3, f * 3.5 - t * 0.45 ) );
      vec3 cian = vec3( 0.08, 0.62, 0.82 );
      vec3 plum = vec3( 0.48, 0.16, 0.62 );
      col = mix( cian, plum, smoothstep( 0.2, 0.85, swirl ) );
      float dots = halftoneDots( gl_FragCoord.xy, 6.5 );
      float dotMask = smoothstep( 0.7, 0.1, f ) * 0.45;
      float a = ( dots < dotMask ? 0.36 : 0.14 ) * ( 1.0 - smoothstep( 0.0, 1.0, f ) );
      alpha = a;
    } else {
      col = vec3( 0.0 );
      alpha = 0.0;
    }

    gl_FragColor = vec4( col, alpha );
  }
`;

/**
 * Crea el divisor líquido del menú: quad a pantalla completa + ShaderMaterial
 * transparente (sin depth test/write) que se dibuja DESPUÉS del diorama para
 * superponer el blade de obsidiana astral sobre el cosmos vivo de la derecha.
 */
export function createMenuFluidDivider(): MenuFluidDivider {
  const material = new THREE.ShaderMaterial({
    vertexShader: dividerVertexShader,
    fragmentShader: dividerFragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uAspect: { value: 1 },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    fog: false,
  });

  const geometry = new THREE.PlaneGeometry(2, 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'menuFluidDivider';
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 1;

  return {
    mesh,
    material,
    camera,
    update(time: number, aspect: number): void {
      material.uniforms.uTime.value = time;
      material.uniforms.uAspect.value = aspect > 0 ? aspect : 1;
    },
    dispose(): void {
      geometry.dispose();
      material.dispose();
    },
  };
}
