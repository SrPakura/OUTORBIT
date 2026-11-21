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
  void main() {
    vec4 worldPos = modelMatrix * vec4( position, 1.0 );
    vNormalWorld = normalize( mat3( modelMatrix ) * normal );
    vViewDir = normalize( cameraPosition - worldPos.xyz );
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

    // 3 bandas marcadas de iluminación tipo cómic.
    vec3 litColor = uColor * 1.12;
    vec3 midColor = mix( uColor, uShadowTint, 0.28 );
    vec3 darkColor = mix( uColor, uShadowTint, 0.62 );

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

    // Luz de contorno Fresnel (Rim Light) para separar siluetas.
    float fresnel = pow( 1.0 - max( dot( N, V ), 0.0 ), uRimPower );
    finalColor += uRimColor * fresnel * uRimStrength;

    // Emisión extra opcional (energía, cristales, portal).
    finalColor += uColor * uEmissiveBoost;

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
const STAR_COUNT = 700;
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
  varying vec3 vWorldDir;

  void main() {
    // Gradiente diagonal suave (de arriba-derecha a abajo-izquierda).
    float diag = clamp( ( -vWorldDir.y * 0.72 - vWorldDir.x * 0.35 + 0.55 ), 0.0, 1.0 );
    vec3 col = mix( uTopRightColor, uMidMagenta, smoothstep( 0.0, 0.48, diag ) );
    col = mix( col, uHorizonCoral, smoothstep( 0.45, 0.82, diag ) );
    col = mix( col, uSunGlow, smoothstep( 0.78, 1.0, diag ) );
    gl_FragColor = vec4( col, 1.0 );
  }
`;

const starVertexShader = /* glsl */ `
  attribute float aPhase;
  uniform float uTime;
  varying float vTwinkle;
  void main() {
    #ifdef USE_INSTANCING
      vec4 transformed = instanceMatrix * vec4( position, 1.0 );
    #else
      vec4 transformed = vec4( position, 1.0 );
    #endif
    vTwinkle = 0.6 + 0.4 * sin( uTime * 2.3 + aPhase );
    gl_Position = projectionMatrix * modelViewMatrix * transformed;
  }
`;

const starFragmentShader = /* glsl */ `
  varying float vTwinkle;
  void main() {
    gl_FragColor = vec4( vec3( 1.0, 0.972, 0.92 ) * vTwinkle, 0.95 );
  }
`;

/**
 * Crea el fondo del nivel: cielo cósmico con gradiente diagonal (índigo
 * espacial -> violeta crepuscular -> salmón/coral cálido, colores derivados
 * del nivel) y un campo de estrellas instanciadas que titilan por fase propia.
 * El grupo sigue la posición de la cámara cada frame (`update(dt, cameraPos)`)
 * para que el jugador NUNCA salga de la esfera del cielo al volar lejos.
 * Devuelve handle con update/dispose.
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
    },
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 32, 24), skyMaterial);
  skyMesh.frustumCulled = false;
  group.add(skyMesh);

  // --- Estrellas instanciadas con titileo por fase ---
  const starGeometry = new THREE.OctahedronGeometry(1.4, 0);
  const starMaterial = new THREE.ShaderMaterial({
    vertexShader: starVertexShader,
    fragmentShader: starFragmentShader,
    uniforms: { uTime: globalShaderState.uTime },
    transparent: true,
    fog: false,
  });
  const stars = new THREE.InstancedMesh(starGeometry, starMaterial, STAR_COUNT);
  stars.frustumCulled = false;

  const phases = new Float32Array(STAR_COUNT);
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
  }
  stars.instanceMatrix.needsUpdate = true;
  starGeometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
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
