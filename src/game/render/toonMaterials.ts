import * as THREE from 'three';

// ============================================================================
// Estado global de shaders (compartido por todos los materiales cel del juego)
// ============================================================================

const globalShaderState = {
  uSunDir: { value: new THREE.Vector3(0.55, 0.72, 0.42).normalize() },
  uHalftoneEnabled: { value: 1.0 },
  uTime: { value: 0.0 },
};

// ============================================================================
// Cel-Shading GLSL: 3 bandas + trama halftone + Rim Light Fresnel
// (portado de referencia_visual.html :: createComicCelMaterial)
// ============================================================================

export interface ComicCelOptions {
  rimColor?: string | number;
  rimPower?: number;
  rimStrength?: number;
  emissiveBoost?: number;
  /** Tinte de sombra: azul/índigo, NUNCA negro sucio. */
  shadowTint?: string | number;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
}

const celVertexShader = /* glsl */ `
  varying vec3 vNormalWorld;
  varying vec3 vViewDir;
  #ifdef USE_COLOR
    varying vec3 vVertexColor;
  #endif
  void main() {
    vec4 worldPos = modelMatrix * vec4( position, 1.0 );
    vNormalWorld = normalize( mat3( modelMatrix ) * normal );
    vViewDir = normalize( cameraPosition - worldPos.xyz );
    #ifdef USE_COLOR
      vVertexColor = color;
    #endif
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const celFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uShadowTint;
  uniform vec3 uRimColor;
  uniform float uRimPower;
  uniform float uRimStrength;
  uniform float uEmissiveBoost;
  uniform float uOpacity;
  uniform vec3 uSunDir;
  uniform float uHalftoneEnabled;

  varying vec3 vNormalWorld;
  varying vec3 vViewDir;
  #ifdef USE_COLOR
    varying vec3 vVertexColor;
  #endif

  // Patrón de puntos halftone en espacio de pantalla (estilo cómic impreso).
  float halftonePattern( vec2 fragCoord, float scale ) {
    float angle = 0.523599; // 30 grados
    mat2 rot = mat2( cos( angle ), -sin( angle ), sin( angle ), cos( angle ) );
    vec2 uv = ( rot * fragCoord ) / scale;
    vec2 grid = fract( uv ) - 0.5;
    return length( grid );
  }

  void main() {
    vec3 N = normalize( vNormalWorld );
    vec3 V = normalize( vViewDir );
    float NdotL = dot( N, normalize( uSunDir ) );

    // Color base: uniforme o sombreado por vértice (terreno del Hito 2).
    vec3 baseColor = uColor;
    #ifdef USE_COLOR
      baseColor *= vVertexColor;
    #endif

    // 3 bandas marcadas de iluminación tipo cómic.
    vec3 litColor = baseColor * 1.12;
    vec3 midColor = mix( baseColor, uShadowTint, 0.28 );
    vec3 darkColor = mix( baseColor, uShadowTint, 0.62 );

    vec3 finalColor = litColor;
    if ( NdotL < 0.12 ) {
      finalColor = darkColor;
    } else if ( NdotL < 0.48 ) {
      finalColor = midColor;
    }

    // Puntos halftone en la transición hacia la sombra.
    if ( uHalftoneEnabled > 0.5 && NdotL > -0.25 && NdotL < 0.34 ) {
      float dots = halftonePattern( gl_FragCoord.xy, 6.5 );
      float threshold = smoothstep( 0.34, -0.20, NdotL ) * 0.42;
      if ( dots < threshold ) {
        finalColor = mix( finalColor, uShadowTint * 0.85, 0.55 );
      }
    }

    // Luz de contorno Fresnel (Rim Light) para separar siluetas. El borde se
    // agudiza con un smoothstep para que el personaje recorte limpio contra
    // los fondos cósmicos oscuros.
    float fresnelRaw = 1.0 - max( dot( N, V ), 0.0 );
    float fresnel = pow( fresnelRaw, uRimPower );
    fresnel = smoothstep( 0.10, 0.82, fresnel ) * ( 0.72 + 0.28 * fresnel );
    finalColor += uRimColor * fresnel * uRimStrength;

    // Rebote iridiscente del cielo: la cara en sombra recibe un baño de color
    // frío del hemisferio opuesto al sol (nunca queda muerta ni negra).
    float skyBounce = max( -NdotL, 0.0 );
    finalColor += uRimColor * skyBounce * 0.08;

    // Emisión extra opcional (energía, cristales, portal).
    finalColor += baseColor * uEmissiveBoost;

    gl_FragColor = vec4( finalColor, uOpacity );
  }
`;

/**
 * Material cel-shaded de 3 bandas con trama halftone en el terminador de
 * sombra y Rim Light Fresnel, portado de `referencia_visual.html`.
 * Sombra con tinte azul/índigo (`0x161b33`), nunca negro sucio.
 */
export function createComicCelMaterial(
  color: string | number,
  options: ComicCelOptions = {}
): THREE.ShaderMaterial {
  const {
    rimColor = 0x7dd3fc,
    rimPower = 3.2,
    rimStrength = 0.55,
    emissiveBoost = 0.0,
    shadowTint = 0x161b33,
    transparent = false,
    opacity = 1,
    side = THREE.FrontSide,
  } = options;

  return new THREE.ShaderMaterial({
    vertexShader: celVertexShader,
    fragmentShader: celFragmentShader,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uShadowTint: { value: new THREE.Color(shadowTint) },
      uRimColor: { value: new THREE.Color(rimColor) },
      uRimPower: { value: rimPower },
      uRimStrength: { value: rimStrength },
      uEmissiveBoost: { value: emissiveBoost },
      uOpacity: { value: opacity },
      uSunDir: globalShaderState.uSunDir,
      uHalftoneEnabled: globalShaderState.uHalftoneEnabled,
    },
    transparent,
    side,
  });
}

/**
 * Activa/desactiva la trama halftone de TODOS los materiales cel del juego y
 * del cielo cósmico (ajuste persistente `halftonesEnabled`). El uniform es
 * compartido, así que el cambio es inmediato y no reconstruye materiales.
 */
export function setHalftonesEnabled(enabled: boolean): void {
  globalShaderState.uHalftoneEnabled.value = enabled ? 1.0 : 0.0;
}

/**
 * Material toon vibrante (API conservada del Hito 1). Ahora delega en el
 * shader cel de 3 bandas; el `emissive` legacy se mapea a rim + boost.
 */
export function createToonMaterial(
  color: string | number,
  emissive?: string | number
): THREE.ShaderMaterial {
  if (emissive === undefined || emissive === 0x000000) {
    return createComicCelMaterial(color);
  }
  return createComicCelMaterial(color, {
    rimColor: emissive,
    emissiveBoost: 0.32,
  });
}

// ============================================================================
// Contorno de tinta orgánica (Inverted Hull BackSide con extrusión por normal)
// (portado de referencia_visual.html :: addInkOutline)
// ============================================================================

/**
 * Añade un contorno de tinta a `mesh` mediante Inverted Hull: malla BackSide
 * que comparte geometría y extruye los vértices a lo largo de la normal en el
 * vertex shader, con variación de grosor tipo pincel. Grosores finos y limpios
 * en personajes (0.015-0.024). Devuelve la malla de contorno (hija de `mesh`).
 */
export function addComicOutline(
  mesh: THREE.Mesh,
  thickness = 0.045,
  color: number = 0x090b14
): THREE.Mesh {
  const outlineMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      uThickness: { value: thickness },
      uNoiseAmp: { value: 0.35 },
      uInkColor: { value: new THREE.Color(color) },
    },
    vertexShader: /* glsl */ `
      uniform float uThickness;
      uniform float uNoiseAmp;
      void main() {
        // Ruido determinista según posición para simular trazo de pincel irregular.
        float brushVar = sin( position.x * 7.3 + position.y * 5.1 ) * cos( position.z * 6.7 - position.y * 4.2 );
        float width = max( 0.008, uThickness * ( 1.0 + brushVar * uNoiseAmp ) );
        vec3 extruded = position + normalize( normal ) * width;
        gl_Position = projectionMatrix * modelViewMatrix * vec4( extruded, 1.0 );
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uInkColor;
      void main() {
        gl_FragColor = vec4( uInkColor, 1.0 );
      }
    `,
  });

  const outline = new THREE.Mesh(mesh.geometry, outlineMat);
  mesh.add(outline);
  return outline;
}

// ============================================================================
// Fondo espacial: cielo cósmico gradiente diagonal + estrellas titilantes
// (portado de referencia_visual.html :: createCosmicSky, adaptado por nivel)
// ============================================================================

const SKY_RADIUS = 1800;
const STAR_COUNT = 900;
const STAR_SHELL_RADIUS = 1650;

const skyVertexShader = /* glsl */ `
  varying vec3 vWorldDir;
  void main() {
    vWorldDir = normalize( position );
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  }
`;

const skyFragmentShader = /* glsl */ `
  uniform vec3 uTopRightColor;
  uniform vec3 uMidMagenta;
  uniform vec3 uHorizonCoral;
  uniform vec3 uSunGlow;
  uniform float uTime;
  uniform float uHalftoneEnabled;
  varying vec3 vWorldDir;

  // --- Ruido de valor 3D + FBM: nebulosa pintada a mano (Epic Mickey) ---
  float hash31( vec3 p ) {
    p = fract( p * 0.3183099 + vec3( 0.11, 0.17, 0.13 ) );
    p *= 17.0;
    return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) );
  }

  float valueNoise( vec3 x ) {
    vec3 i = floor( x );
    vec3 f = fract( x );
    f = f * f * ( 3.0 - 2.0 * f );
    float n000 = hash31( i + vec3( 0.0, 0.0, 0.0 ) );
    float n100 = hash31( i + vec3( 1.0, 0.0, 0.0 ) );
    float n010 = hash31( i + vec3( 0.0, 1.0, 0.0 ) );
    float n110 = hash31( i + vec3( 1.0, 1.0, 0.0 ) );
    float n001 = hash31( i + vec3( 0.0, 0.0, 1.0 ) );
    float n101 = hash31( i + vec3( 1.0, 0.0, 1.0 ) );
    float n011 = hash31( i + vec3( 0.0, 1.0, 1.0 ) );
    float n111 = hash31( i + vec3( 1.0, 1.0, 1.0 ) );
    float nx00 = mix( n000, n100, f.x );
    float nx10 = mix( n010, n110, f.x );
    float nx01 = mix( n001, n101, f.x );
    float nx11 = mix( n011, n111, f.x );
    return mix( mix( nx00, nx10, f.y ), mix( nx01, nx11, f.y ), f.z );
  }

  float fbm( vec3 p ) {
    float sum = 0.0;
    float amp = 0.55;
    for ( int i = 0; i < 3; i++ ) {
      sum += amp * valueNoise( p );
      p = p * 2.03 + vec3( 1.7, 9.2, 3.4 );
      amp *= 0.5;
    }
    return sum;
  }

  float fbmLow( vec3 p ) {
    float sum = 0.0;
    float amp = 0.6;
    for ( int i = 0; i < 2; i++ ) {
      sum += amp * valueNoise( p );
      p = p * 2.11 + vec3( 4.3, 2.1, 7.7 );
      amp *= 0.5;
    }
    return sum;
  }

  // Trama de puntos halftone (impresión cómic Persona 5).
  float halftoneDots( vec2 fragCoord, float scale ) {
    float angle = 0.523599; // 30 grados
    mat2 rot = mat2( cos( angle ), -sin( angle ), sin( angle ), cos( angle ) );
    vec2 uv = ( rot * fragCoord ) / scale;
    vec2 grid = fract( uv ) - 0.5;
    return length( grid );
  }

  void main() {
    vec3 dir = normalize( vWorldDir );

    // Gradiente diagonal base (de arriba-derecha a abajo-izquierda).
    float diag = clamp( ( -dir.y * 0.72 - dir.x * 0.35 + 0.55 ), 0.0, 1.0 );
    vec3 col = mix( uTopRightColor, uMidMagenta, smoothstep( 0.0, 0.48, diag ) );
    col = mix( col, uHorizonCoral, smoothstep( 0.45, 0.82, diag ) );
    col = mix( col, uSunGlow, smoothstep( 0.78, 1.0, diag ) );

    // --- Nebulosa pintada: FBM 3D que deriva muy despacio con uTime ---
    float nebula = fbm( dir * 2.35 + vec3( 0.0, uTime * 0.010, uTime * 0.007 ) );
    float warp = fbmLow( dir * 4.60 + vec3( uTime * 0.016, -uTime * 0.011, 0.0 ) );

    vec3 painted = mix(
      vec3( 0.24, 0.09, 0.55 ),
      vec3( 0.95, 0.24, 0.65 ),
      smoothstep( 0.30, 0.86, nebula )
    );
    painted = mix(
      painted,
      vec3( 0.15, 0.92, 0.96 ),
      smoothstep( 0.52, 0.94, warp ) * 0.55
    );
    col = mix( col, painted, smoothstep( 0.40, 0.92, nebula ) * 0.45 );

    // --- Cintas de aurora de maná (Frieren): cian, lavanda y oro ---
    float band = dir.y * 3.15 + dir.x * 1.75 + warp * 2.7 + uTime * 0.05;
    float ribbonCyan = pow( 0.5 + 0.5 * sin( band * 2.0 ), 3.0 );
    float ribbonLavender = pow( 0.5 + 0.5 * sin( band * 3.0 + 1.7 - uTime * 0.03 ), 4.0 );
    float ribbonGold = pow( 0.5 + 0.5 * sin( band * 1.3 - 2.1 + uTime * 0.02 ), 5.0 );
    float auroraMask = smoothstep( 0.10, 0.95, nebula * 0.65 + warp * 0.55 );

    col += vec3( 0.15, 0.92, 0.96 ) * ribbonCyan * 0.30 * auroraMask;
    col += vec3( 0.75, 0.55, 1.00 ) * ribbonLavender * 0.26 * auroraMask;
    col += vec3( 1.00, 0.82, 0.42 ) * ribbonGold * 0.22 * auroraMask;
    col += vec3( 0.95, 0.24, 0.65 ) * ribbonCyan * ribbonLavender * 0.16;

    // --- Halftone cómic en el resplandor atmosférico bajo ---
    float glowBand = smoothstep( 0.58, 1.0, diag );
    if ( uHalftoneEnabled > 0.5 && glowBand > 0.02 ) {
      float dots = halftoneDots( gl_FragCoord.xy, 7.0 );
      if ( dots < glowBand * 0.55 ) {
        col = mix( col, uSunGlow * 1.05 + vec3( 0.06, 0.02, 0.14 ), 0.20 );
      }
    }

    gl_FragColor = vec4( col, 1.0 );
  }
`;

const starVertexShader = /* glsl */ `
  attribute float aPhase;
  attribute vec3 aTint;
  uniform float uTime;
  varying float vTwinkle;
  varying vec3 vTint;
  void main() {
    #ifdef USE_INSTANCING
      vec4 transformed = instanceMatrix * vec4( position, 1.0 );
    #else
      vec4 transformed = vec4( position, 1.0 );
    #endif
    // Titileo lento + destello agudo (sparkle) desfasado por estrella.
    float slow = 0.5 + 0.5 * sin( uTime * 1.7 + aPhase );
    float sparkle = pow( 0.5 + 0.5 * sin( uTime * 3.9 + aPhase * 2.3 ), 6.0 );
    vTwinkle = 0.55 + 0.45 * slow + sparkle * 0.9;
    vTint = aTint;
    gl_Position = projectionMatrix * modelViewMatrix * transformed;
  }
`;

const starFragmentShader = /* glsl */ `
  varying float vTwinkle;
  varying vec3 vTint;
  void main() {
    gl_FragColor = vec4( vTint * vTwinkle, 0.95 );
  }
`;

/** Paleta de estrellas: oro pálido, cian hielo, cuarzo rosa y blanco. */
const STAR_TINTS: ReadonlyArray<readonly [number, number, number]> = [
  [1.0, 0.88, 0.62],
  [0.62, 0.92, 1.0],
  [1.0, 0.72, 0.85],
  [1.0, 0.98, 0.95],
];

/**
 * Crea el fondo del nivel: cielo cósmico con gradiente diagonal (índigo
 * espacial -> violeta crepuscular -> salmón/coral cálido, colores derivados
 * del nivel) enriquecido con una nebulosa pintada por FBM, cintas de aurora
 * de maná (cian, lavanda, oro y magenta) que derivan con `uTime` y halftone
 * cómic en el resplandor bajo; más un campo de 900 estrellas instanciadas con
 * tinte propio (oro pálido, cian hielo, cuarzo rosa, blanco) que titilan y
 * destellan por fase. El grupo sigue la posición de la cámara cada frame
 * (`update(dt, cameraPos)`) para que el jugador NUNCA salga de la esfera del
 * cielo al volar lejos. Devuelve handle con update/dispose.
 */
export function createSpaceBackdrop(
  scene: THREE.Scene,
  topColor: string,
  bottomColor: string
): { update: (dt: number, cameraPos: THREE.Vector3) => void; dispose: () => void } {
  const group = new THREE.Group();
  group.name = 'spaceBackdrop';

  // --- Cielo cósmico: deriva las 4 paradas del gradiente de los colores del nivel ---
  const top = new THREE.Color(topColor);
  const coral = new THREE.Color(bottomColor);
  const midMagenta = top.clone().lerp(coral, 0.52);
  const sunGlow = coral.clone().lerp(new THREE.Color(0xffe1b5), 0.55);

  const skyMaterial = new THREE.ShaderMaterial({
    vertexShader: skyVertexShader,
    fragmentShader: skyFragmentShader,
    uniforms: {
      uTopRightColor: { value: top },
      uMidMagenta: { value: midMagenta },
      uHorizonCoral: { value: coral },
      uSunGlow: { value: sunGlow },
      // Reloj compartido: la nebulosa y las auroras derivan con el tiempo.
      uTime: globalShaderState.uTime,
      uHalftoneEnabled: globalShaderState.uHalftoneEnabled,
    },
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 32, 24), skyMaterial);
  skyMesh.frustumCulled = false;
  group.add(skyMesh);

  // --- Estrellas instanciadas: tinte propio + titileo y destello por fase ---
  const starGeometry = new THREE.OctahedronGeometry(1.4, 0);
  const starMaterial = new THREE.ShaderMaterial({
    vertexShader: starVertexShader,
    fragmentShader: starFragmentShader,
    uniforms: { uTime: globalShaderState.uTime },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const stars = new THREE.InstancedMesh(starGeometry, starMaterial, STAR_COUNT);
  stars.frustumCulled = false;

  const phases = new Float32Array(STAR_COUNT);
  const tints = new Float32Array(STAR_COUNT * 3);
  const dummy = new THREE.Object3D();
  const dir = new THREE.Vector3();
  for (let i = 0; i < STAR_COUNT; i++) {
    // Distribución uniforme sobre la esfera (u,phi)
    const u = Math.random();
    const phi = Math.random() * Math.PI * 2;
    const cosTheta = 1 - 2 * u;
    const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);
    dir.set(sinTheta * Math.cos(phi), cosTheta, sinTheta * Math.sin(phi));
    dummy.position.copy(dir).multiplyScalar(STAR_SHELL_RADIUS);
    const scale = 0.35 + Math.random() * 1.1;
    dummy.scale.setScalar(scale);
    dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    dummy.updateMatrix();
    stars.setMatrixAt(i, dummy.matrix);
    phases[i] = Math.random() * Math.PI * 2;
    const tint = STAR_TINTS[Math.floor(Math.random() * STAR_TINTS.length)];
    tints[i * 3] = tint[0];
    tints[i * 3 + 1] = tint[1];
    tints[i * 3 + 2] = tint[2];
  }
  stars.instanceMatrix.needsUpdate = true;
  starGeometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
  starGeometry.setAttribute('aTint', new THREE.InstancedBufferAttribute(tints, 3));
  group.add(stars);

  scene.add(group);

  return {
    update(dt: number, cameraPos: THREE.Vector3): void {
      globalShaderState.uTime.value += dt;
      // Cielo infinito: el backdrop acompaña a la cámara para que el jugador
      // jamás atraviese la esfera del cielo al volar lejos del origen.
      group.position.copy(cameraPos);
      stars.rotation.y += dt * 0.004;
      stars.rotation.x += dt * 0.0015;
    },
    dispose(): void {
      scene.remove(group);
      skyMesh.geometry.dispose();
      skyMaterial.dispose();
      starGeometry.dispose();
      starMaterial.dispose();
      stars.dispose();
    },
  };
}
