import * as THREE from 'three';

// ============================================================================
// PASO C — Divisor líquido del menú (Persona 5 x Frieren)
// ============================================================================
//
// Un quad a pantalla completa (cámara ortográfica) que pinta el "blade"
// diagonal blanco de la portada: panel de porcelana a la izquierda, trazo de
// tinta navy y una franja de maná cósmico (cian -> cobalto -> violeta) con
// trama halftone que se disuelve hacia el espacio del diorama.
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

    // Silueta fija: 42% del ancho arriba, 25% abajo (cuchilla diagonal limpia).
    float baseEdgeX = mix( 0.42, 0.25, 1.0 - uv.y );

    // --- Onda líquida continua sobre la diagonal (amplitud ~0.016) ---
    vec2 flow = vec2( uv.x * uAspect, uv.y );
    float t = uTime;
    float n1 = fbm( vec2( flow.y * 3.4 + t * 0.22, flow.x * 1.6 - t * 0.13 ) );
    float n2 = fbm( vec2( flow.y * 7.1 - t * 0.31, flow.x * 2.9 + t * 0.19 ) );
    float wave = sin( uv.y * 11.0 + t * 1.35 ) * 0.45
               + sin( uv.y * 23.0 - t * 2.10 ) * 0.22
               + ( n1 - 0.5 ) * 1.15
               + ( n2 - 0.5 ) * 0.55;
    wave /= 1.5;
    float fluidEdgeX = baseEdgeX + wave * 0.016;

    // Distancia con signo al borde: negativo = dentro del blade blanco.
    float d = uv.x - fluidEdgeX;

    vec3 col;
    float alpha;

    if ( d < 0.0 ) {
      // --- Interior: porcelana blanca con violeta pálido al fondo ---
      vec3 porcelain = vec3( 0.975, 0.985, 1.0 );
      vec3 paleViolet = vec3( 0.902, 0.878, 0.984 );
      float bottomMix = smoothstep( 0.46, 0.0, uv.y );
      col = mix( porcelain, paleViolet, bottomMix * 0.55 );

      // Líneas de velocidad diagonales finas (cómic impreso).
      float speed = sin( ( uv.x * 1.35 + uv.y * 0.85 ) * 118.0 + t * 0.55 );
      float lines = smoothstep( 0.972, 1.0, speed );
      float lineMask = smoothstep( 0.0, 0.07, -d ) * smoothstep( 0.62, 0.02, uv.y );
      col = mix( col, vec3( 0.760, 0.784, 0.918 ), lines * lineMask * 0.34 );
      alpha = 1.0;
    } else if ( d < 0.009 ) {
      // --- Trazo de tinta navy (cómic) ---
      col = vec3( 0.0588, 0.0902, 0.1647 ); // #0f172a
      alpha = 1.0;
    } else if ( d < 0.072 ) {
      // --- Franja de maná cósmico que se disuelve hacia el espacio ---
      float f = ( d - 0.009 ) / 0.063;
      vec3 cyan = vec3( 0.133, 0.827, 0.933 );   // #22d3ee
      vec3 cobalt = vec3( 0.145, 0.388, 0.922 ); // cobalto eléctrico
      vec3 violet = vec3( 0.545, 0.361, 0.965 ); // violeta iris
      vec3 fringe = mix( cyan, cobalt, smoothstep( 0.0, 0.55, f ) );
      fringe = mix( fringe, violet, smoothstep( 0.5, 1.0, f ) );

      // Remolinos de maná que fluyen a lo largo de la franja.
      float swirl = fbm( vec2( uv.y * 6.0 + t * 0.35, f * 4.0 - t * 0.5 ) );
      fringe += vec3( 0.35, 0.85, 1.0 ) * ( swirl - 0.5 ) * 0.38;

      // Halftone cómic que se disuelve suavemente hacia alpha = 0.
      float dots = halftoneDots( gl_FragCoord.xy, 7.0 );
      float dotMask = smoothstep( 0.66, 0.16, f ) * 0.55;
      if ( dots < dotMask ) {
        fringe = mix( fringe, vec3( 0.86, 0.97, 1.0 ), 0.55 );
      }

      col = fringe;
      alpha = ( 1.0 - smoothstep( 0.32, 1.0, f ) ) * 0.94;
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
 * superponer el blade blanco sobre el cosmos vivo de la derecha.
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
