import * as THREE from 'three';

// ============================================================================
// Estado global de shaders (compartido por todos los materiales cel del juego)
// ============================================================================

const globalShaderState = {
  // Sol cálido y luminoso al Norte (-Z), delante del spawn de la Isla
  // Flotante: el disco de cómic y su halo quedan en el encuadre inicial.
  uSunDir: { value: new THREE.Vector3(0.48, 0.42, -0.78).normalize() },
  uHalftoneEnabled: { value: 1.0 },
  uTime: { value: 0.0 },
};

/**
 * Uniforms compartidos por TODOS los materiales cel del juego (sol, halftone y
 * reloj). La librería de materiales de Hekseville reutiliza `uSunDir` y
 * `uHalftoneEnabled` para que el ajuste de halftones y la dirección del sol
 * sean globales; su `uTime` es propio (lo avanza `chunkMatLib.update`).
 */
export const sharedShaderState = globalShaderState;

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
// Fondo espacial: OUTORBIT Cosmic Dreamscape + estrellas titilantes
// (cielo de fantasía alegre: gradiente dreamscape, planeta anillado, nubes
// cel, auroras pastel y destellos de 4 puntas)
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
  uniform vec3 uSunDir;
  uniform float uTime;
  uniform float uHalftoneEnabled;
  varying vec3 vWorldDir;

  // --- Ruido de valor 3D + FBM: nubes y nebulosa pintadas a mano ---
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

    // Altura normalizada: 0.0 = nadir, 0.5 = horizonte, 1.0 = cenit.
    float h = clamp( dir.y * 0.5 + 0.5, 0.0, 1.0 );

    // --- OUTORBIT Cosmic Dreamscape: gradiente de fantasía alegre que envuelve
    // TODO el horizonte detrás de la ciudad (h 0.36..0.96) ---
    vec3 zenith = vec3( 0.133, 0.345, 0.800 );      // #2258cc zafiro de ensueño
    vec3 turquoise = vec3( 0.259, 0.741, 0.910 );   // #42bde8 turquesa luminoso
    vec3 aquaMint = vec3( 0.478, 0.910, 0.863 );     // #7ae8dc aqua-menta pastel
    vec3 lavenderPink = vec3( 0.875, 0.624, 1.0 );  // #df9fff lavanda-rosa pastel
    vec3 peachGold = vec3( 1.0, 0.851, 0.573 );     // #ffd992 melocotón dorado

    // h < 0.36: abismo púrpura-azul profundo, a juego con el mar de niebla
    // del vacío. Nunca un bloque cálido bajo el horizonte.
    vec3 col = vec3( 0.08, 0.05, 0.22 );
    // h 0.36..0.60: línea de tejados iridiscente; melocotón dorado soleado y
    // lavanda-rosa pastel para que el skyline brille mágico y alegre.
    col = mix( col, peachGold, smoothstep( 0.36, 0.42, h ) );
    col = mix( col, lavenderPink, smoothstep( 0.44, 0.54, h ) );
    // Cielo medio-alto: turquesa luminoso -> aqua-menta pastel.
    col = mix( col, turquoise, smoothstep( 0.56, 0.68, h ) );
    col = mix( col, aquaMint, smoothstep( 0.68, 0.80, h ) );
    // Cenit: zafiro de ensueño rico y luminoso.
    col = mix( col, zenith, smoothstep( 0.82, 0.96, h ) );

    // Iridiscencia pastel de la banda del horizonte (h 0.39..0.60): un FBM
    // suave pasea lavanda-rosa y turquesa detrás de los tejados.
    float irid = fbm( dir * 2.1 + vec3( 0.0, uTime * 0.008, 0.0 ) );
    float iridMask = smoothstep( 0.39, 0.46, h ) * ( 1.0 - smoothstep( 0.54, 0.60, h ) );
    col += mix( lavenderPink, turquoise, smoothstep( 0.35, 0.75, irid ) ) * iridMask * 0.16;

    // --- Sol de cómic: disco nítido + anillos cel concéntricos ---
    vec3 sunDir = normalize( uSunDir );
    float sd = dot( dir, sunDir );
    float disk = smoothstep( 0.9955, 0.9985, sd );
    float halo = pow( max( sd, 0.0 ), 220.0 );
    float ang = acos( clamp( sd, -1.0, 1.0 ) );
    float ring = fract( ang * 7.0 );
    float ringMask = smoothstep( 0.62, 0.98, ring ) * ( 1.0 - smoothstep( 0.55, 1.15, ang ) );
    col += mix( peachGold, lavenderPink, 0.5 ) * ringMask * 0.22;
    col += peachGold * halo * 0.55;
    col += vec3( 1.0, 0.97, 0.88 ) * disk * 1.25;

    // --- Planeta gigante de fantasía con anillos, alto en el skyline ---
    // Encuadre: el spawn de la Isla Flotante mira al Norte (-Z), así que el
    // planeta se coloca delante de la cámara, ligeramente a la izquierda y
    // por encima del horizonte, para que domine la vista nada más aparecer.
    vec3 planetDir = normalize( vec3( -0.36, 0.24, -0.90 ) );
    vec3 pRight = normalize( cross( planetDir, vec3( 0.0, 1.0, 0.0 ) ) );
    vec3 pUp = cross( pRight, planetDir );
    float pd = dot( dir, planetDir );
    vec3 pOffset = dir - planetDir * pd;
    vec2 pUV = vec2( dot( pOffset, pRight ), dot( pOffset, pUp ) ) / 0.30;
    float pr = length( pUV );

    // Anillos inclinados: elipse comprimida en el eje vertical del planeta,
    // con bandas concéntricas perla-oro y cian que pasan por delante de la
    // esfera en la mitad inferior y quedan ocultas detrás en la superior.
    float ringR = length( vec2( pUV.x, pUV.y * 2.6 ) );
    float ringBand = smoothstep( 1.32, 1.50, ringR ) * ( 1.0 - smoothstep( 2.05, 2.30, ringR ) );
    float ringStripe = 0.5 + 0.5 * sin( ringR * 30.0 );
    vec3 ringCol = mix( vec3( 1.0, 0.92, 0.72 ), vec3( 0.55, 0.92, 0.98 ), ringStripe );
    float planetRingMask = ringBand * ( 0.55 + 0.45 * ringStripe );
    if ( pUV.y > 0.0 && pr < 1.0 ) planetRingMask = 0.0;

    // Esfera cel-shaded: bandas de gas pastel (rosa perla, lavanda, crema).
    if ( pr < 1.0 ) {
      float pz = sqrt( max( 1.0 - pr * pr, 0.0 ) );
      vec3 pNormal = normalize( pRight * pUV.x + pUp * pUV.y + planetDir * pz );
      float pLight = dot( pNormal, sunDir );
      float gasBands = 0.5 + 0.5 * sin( pUV.y * 9.0 + sin( pUV.x * 2.0 ) * 0.6 );
      vec3 pBase = mix( vec3( 0.98, 0.84, 0.90 ), vec3( 0.85, 0.78, 0.98 ), gasBands );
      pBase = mix( pBase, vec3( 0.99, 0.93, 0.82 ), smoothstep( 0.75, 1.0, gasBands ) * 0.5 );
      vec3 pCol = pBase * 1.12;
      if ( pLight < 0.12 ) {
        pCol = mix( pBase, vec3( 0.42, 0.34, 0.62 ), 0.60 );
      } else if ( pLight < 0.48 ) {
        pCol = mix( pBase, vec3( 0.55, 0.46, 0.76 ), 0.30 );
      }
      col = mix( col, pCol, 1.0 - smoothstep( 0.96, 1.0, pr ) );
      // Limbo luminoso pastel en el borde del disco.
      col += vec3( 1.0, 0.92, 0.96 ) * smoothstep( 0.84, 0.99, pr ) * 0.35;
    }

    // Anillos: halo suave + banda sólida cel-stepped.
    col += ringCol * planetRingMask * 0.35;
    col = mix( col, ringCol * 1.08, smoothstep( 0.35, 0.75, planetRingMask ) );

    // --- Nubes cel-stepped esponjosas: crema-dorado soleado y rosa
    // algodón-de-azúcar a lo largo de h 0.40..0.88 ---
    vec2 cuv = dir.xz / max( abs( dir.y ) + 0.35, 0.18 );
    float drift = uTime * 0.012;
    float cloudN = fbm( vec3( cuv * 0.55 + vec2( drift, drift * 0.6 ), drift * 0.5 ) );
    float cel = floor( cloudN * 4.0 ) / 4.0;
    float bandMask = smoothstep( 0.40, 0.48, h ) * ( 1.0 - smoothstep( 0.84, 0.88, h ) );
    float cloudMask = smoothstep( 0.40, 0.62, cel ) * bandMask;
    vec3 cloudCol = mix( vec3( 1.0, 0.94, 0.80 ), vec3( 1.0, 0.80, 0.88 ), smoothstep( 0.55, 0.85, cel ) );
    cloudCol = mix( cloudCol, peachGold, smoothstep( 0.40, 0.48, h ) * 0.30 );
    col = mix( col, cloudCol, cloudMask * 0.55 );

    // Segunda capa baja pegada al horizonte, detrás de los tejados.
    float lowN = fbm( vec3( cuv * 1.15 + vec2( -drift * 1.4, drift ), drift * 0.8 ) );
    float lowCel = floor( lowN * 3.0 ) / 3.0;
    float lowMask = smoothstep( 0.40, 0.46, h ) * ( 1.0 - smoothstep( 0.52, 0.60, h ) );
    col = mix( col, mix( lavenderPink, vec3( 1.0, 0.95, 0.88 ), 0.55 ), smoothstep( 0.45, 0.72, lowCel ) * lowMask * 0.40 );

    // --- Nebulosa y cintas de aurora arcoíris pastel SOLO en el cielo alto ---
    float highMask = smoothstep( 0.720, 0.980, h );
    float nebula = fbm( dir * 2.35 + vec3( 0.0, uTime * 0.010, uTime * 0.007 ) );
    col = mix(
      col,
      mix( lavenderPink, turquoise, 0.5 ) * 1.10,
      smoothstep( 0.55, 0.95, nebula ) * highMask * 0.20
    );
    float ribbonBand = dir.y * 3.15 + dir.x * 1.75 + uTime * 0.05;
    float ribbon = pow( 0.5 + 0.5 * sin( ribbonBand * 2.0 ), 3.0 );
    float hueWalk = fract( ribbonBand * 0.25 + uTime * 0.02 );
    vec3 auroraCol = mix( vec3( 0.62, 0.95, 0.80 ), vec3( 0.98, 0.74, 0.90 ), smoothstep( 0.0, 0.5, hueWalk ) );
    auroraCol = mix( auroraCol, vec3( 0.72, 0.86, 1.0 ), smoothstep( 0.5, 1.0, hueWalk ) );
    col += auroraCol * ribbon * 0.12 * highMask;

    // --- Destellos de estrella de 4 puntas repartidos por la bóveda ---
    float az = atan( dir.z, dir.x );
    float el = asin( clamp( dir.y, -1.0, 1.0 ) );
    vec2 sGrid = vec2( az * 22.0, el * 44.0 );
    vec2 sCell = floor( sGrid );
    vec2 sUv = fract( sGrid ) - 0.5;
    float sHash = hash31( vec3( sCell, 7.0 ) );
    float twinkle = 0.5 + 0.5 * sin( uTime * 2.2 + sHash * 40.0 );
    float starCross = max( exp( -abs( sUv.x ) * 24.0 ), exp( -abs( sUv.y ) * 24.0 ) );
    float starCore = exp( -length( sUv ) * 20.0 );
    float glint = ( starCross * 0.7 + starCore ) * step( 0.86, sHash ) * twinkle;
    col += vec3( 1.0, 0.98, 0.92 ) * glint * 0.55 * smoothstep( 0.42, 0.70, h );

    // --- Halftone cómic SOLO en las transiciones de banda ---
    float transition =
      smoothstep( 0.40, 0.46, h ) * ( 1.0 - smoothstep( 0.46, 0.52, h ) ) +
      smoothstep( 0.62, 0.68, h ) * ( 1.0 - smoothstep( 0.68, 0.74, h ) );
    if ( uHalftoneEnabled > 0.5 && transition > 0.02 ) {
      float dots = halftoneDots( gl_FragCoord.xy, 7.0 );
      if ( dots < transition * 0.5 ) {
        col = mix( col, lavenderPink * 0.9 + vec3( 0.05, 0.02, 0.10 ), 0.18 );
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
 * Crea el fondo del nivel: el OUTORBIT Cosmic Dreamscape, un cielo de fantasía
 * alegre de cúpula completa (cenit zafiro de ensueño #2258cc -> turquesa
 * luminoso #42bde8 -> aqua-menta pastel #7ae8dc, y una banda de horizonte
 * iridiscente con lavanda-rosa pastel #df9fff y melocotón dorado #ffd992 que
 * envuelve el skyline entre h 0.39..0.60; bajo h 0.36 se funde en el abismo
 * púrpura-azul a juego con el mar de niebla del vacío), con un planeta gigante
 * pastel con anillos inclinados perla-oro y cian alto en el skyline, sol de
 * cómic con anillos cel concéntricos, nubes cel-stepped crema-dorado y rosa
 * algodón-de-azúcar (h 0.40..0.88), cintas de aurora arcoíris pastel,
 * destellos de estrella de 4 puntas y halftone cómic únicamente en las
 * transiciones de banda; más un campo de 900 estrellas instanciadas con tinte
 * propio (oro pálido, cian hielo, cuarzo rosa, blanco) que titilan y
 * destellan por fase. La paleta del dreamscape vive fijada en el shader: es la
 * identidad del cielo de OUTORBIT y no depende de los colores del nivel, así
 * que `topColor`/`bottomColor` se conservan solo por compatibilidad de firma.
 * El grupo sigue la posición de la cámara cada frame (`update(dt,
 * cameraPos)`) para que el jugador NUNCA salga de la esfera del cielo al volar
 * lejos. Devuelve handle con update/dispose.
 */
export function createSpaceBackdrop(
  scene: THREE.Scene,
  topColor: string,
  bottomColor: string
): { update: (dt: number, cameraPos: THREE.Vector3) => void; dispose: () => void } {
  const group = new THREE.Group();
  group.name = 'spaceBackdrop';

  const skyMaterial = new THREE.ShaderMaterial({
    vertexShader: skyVertexShader,
    fragmentShader: skyFragmentShader,
    uniforms: {
      uSunDir: globalShaderState.uSunDir,
      // Reloj compartido: nubes, nebulosa y auroras derivan con el tiempo.
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
