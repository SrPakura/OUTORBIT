import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { setHalftonesEnabled } from '@/game/render/toonMaterials';
import { createMenuFluidDivider, type MenuFluidDivider } from '@/game/render/menuShaders';
import { NyxAnimator } from '@/game/render/nyxAnimator';
import type { GameSettings } from '@/game/settings';

// ============================================================================
// Portada Limpia de OUTORBIT: Fondo Crepuscular (Azul/Naranja) + NYX de Cerca
// ============================================================================
//
// - Fondo sencillo y limpio: gradiente crepuscular oscuro pero colorido
//   (azul noche/índigo arriba -> naranja/ámbar cálido en el horizonte inferior,
//   como en referencia_visual-bitmap.png) con estrellas sutiles, sin cúpulas
//   wireframe ni cubos ni planetas gigantes que recarguen la derecha.
// - NYX más cerca de cámara, usando EXACTAMENTE el mismo shader Cosmic Nebula
//   (fbm + starLayer en screen-space, colores sRGB directos sin oscurecer por
//   gamma), contornos blancos y la misma pose 'float' + físicas de pelo que en
//   public/character-sheet.html.

/** Convierte un hex '#rrggbb' a vec3 sRGB literal (0..1) sin conversión linear de Three.js. */
function srgbVec3(hex: string): THREE.Vector3 {
  const n = parseInt(hex.replace('#', ''), 16);
  return new THREE.Vector3(
    ((n >> 16) & 255) / 255,
    ((n >> 8) & 255) / 255,
    (n & 255) / 255
  );
}

/** Dirección fija de la cámara del diorama (plano 3/4, constante cada frame). */
const TITLE_CAM_DIR = new THREE.Vector3(0.30, 0.14, 1.0).normalize();

// ---------------------------------------------------------------------------
// Fondo limpio crepuscular (azul noche / cobalto -> naranja cálido abajo)
// ---------------------------------------------------------------------------

const backdropVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4( position.xy, 0.9999, 1.0 );
  }
`;

const backdropFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uAspect;
  varying vec2 vUv;

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
    float v = 0.0;
    float a = 0.5;
    mat2 rot = mat2( 0.8, 0.6, -0.6, 0.8 );
    for ( int i = 0; i < 4; i++ ) {
      v += a * noise2( p );
      p = rot * p * 2.02;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 uv = vUv;
    vec2 p = vec2( ( uv.x - 0.62 ) * uAspect, uv.y - 0.50 );
    float t = uTime * 0.16;

    // Domain warping (fluido líquido real en movimiento continuo)
    vec2 q = vec2(
      fbm( p * 1.45 + vec2( t * 0.7, -t * 0.4 ) ),
      fbm( p * 1.45 + vec2( 5.2 - t * 0.5, 1.3 + t * 0.6 ) )
    );
    vec2 r = vec2(
      fbm( p * 1.85 + 2.4 * q + vec2( 1.7 + t * 0.45, 9.2 ) ),
      fbm( p * 1.85 + 2.4 * q + vec2( 8.3, 2.8 - t * 0.55 ) )
    );
    float f = fbm( p * 1.6 + 2.2 * r );

    // Paleta fluida profunda (azul abisal -> petróleo eléctrico -> toque coral/violeta)
    vec3 abyss     = vec3( 0.020, 0.024, 0.062 );
    vec3 deepTeal  = vec3( 0.045, 0.240, 0.360 );
    vec3 elecCyan  = vec3( 0.080, 0.520, 0.680 );
    vec3 warmSilk  = vec3( 0.520, 0.140, 0.340 );

    vec3 col = mix( abyss, deepTeal, smoothstep( 0.20, 0.75, f ) );
    col = mix( col, elecCyan, smoothstep( 0.52, 0.92, length( q ) * 0.72 ) * 0.58 );
    col = mix( col, warmSilk, smoothstep( 0.48, 0.88, r.y ) * 0.42 );

    // Venas fluidas brillantes siguiendo los pliegues del líquido
    float vein = smoothstep( 0.48, 0.53, f ) * ( 1.0 - smoothstep( 0.53, 0.60, f ) );
    col += vec3( 0.22, 0.75, 0.92 ) * vein * 0.25;

    // Estrellas finas sutiles
    vec2 suv = vec2( uv.x * uAspect, uv.y ) * 24.0;
    vec2 id = floor( suv );
    vec2 gv = fract( suv ) - 0.5;
    float h = hash21( id );
    if ( h > 0.88 ) {
      vec2 off = vec2( hash21( id + 3.1 ), hash21( id + 9.7 ) ) - 0.5;
      float d = length( gv - off * 0.6 );
      float tw = 0.55 + 0.45 * sin( uTime * 2.0 + h * 30.0 );
      float star = smoothstep( 0.07, 0.0, d ) * tw;
      col += vec3( 0.90, 0.96, 1.0 ) * star * 0.65;
    }

    gl_FragColor = vec4( col, 1.0 );
  }
`;

// ---------------------------------------------------------------------------
// Shader Cosmic Nebula EXACTO de public/character-sheet.html (con skinning)
// ---------------------------------------------------------------------------

const nyxVertexShader = /* glsl */ `
  #include <common>
  #include <skinning_pars_vertex>
  varying vec3 vNormalWorld;
  varying vec3 vViewDir;
  void main() {
    #include <beginnormal_vertex>
    #include <skinbase_vertex>
    #include <skinnormal_vertex>
    #include <begin_vertex>
    #include <skinning_vertex>
    vec4 worldPos = modelMatrix * vec4( transformed, 1.0 );
    vNormalWorld = normalize( mat3( modelMatrix ) * objectNormal );
    vViewDir = normalize( cameraPosition - worldPos.xyz );
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const nyxUniverseFragmentShader = /* glsl */ `
  uniform vec3 uDeepColor;
  uniform vec3 uNebulaA;
  uniform vec3 uNebulaB;
  uniform vec3 uRimColor;
  uniform float uTime;
  uniform float uOpacity;

  varying vec3 vNormalWorld;
  varying vec3 vViewDir;

  float hash21( vec2 p ) {
    p = fract( p * vec2( 234.34, 435.345 ) );
    p += dot( p, p + 34.23 );
    return fract( p.x * p.y );
  }

  float noise2( vec2 p ) {
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
    float v = 0.0;
    float a = 0.5;
    mat2 m = mat2( 0.8, 0.6, -0.6, 0.8 );
    for ( int i = 0; i < 4; i++ ) {
      v += a * noise2( p );
      p = m * p * 2.02;
      a *= 0.5;
    }
    return v;
  }

  float starLayer( vec2 uv, float scale, float speed ) {
    vec2 gv = fract( uv * scale ) - 0.5;
    vec2 id = floor( uv * scale );
    float h = hash21( id );
    if ( h < 0.82 ) return 0.0;
    vec2 offset = vec2( hash21( id + 7.1 ), hash21( id + 13.7 ) ) - 0.5;
    float d = length( gv - offset * 0.65 );
    float twinkle = 0.55 + 0.45 * sin( uTime * speed + h * 40.0 );
    float size = mix( 0.04, 0.14, fract( h * 19.3 ) );
    return smoothstep( size, 0.0, d ) * twinkle;
  }

  void main() {
    vec3 N = normalize( vNormalWorld );
    vec3 V = normalize( vViewDir );

    vec2 uv = gl_FragCoord.xy * 0.0042;
    vec2 drift = vec2( uTime * 0.045, -uTime * 0.03 );

    float n1 = fbm( uv * 1.4 + drift );
    float n2 = fbm( uv * 2.2 - drift * 1.3 + n1 * 0.85 );

    vec3 col = uDeepColor;
    col = mix( col, uNebulaA, smoothstep( 0.34, 0.78, n1 ) * 0.85 );
    col = mix( col, uNebulaB, smoothstep( 0.44, 0.86, n2 ) * 0.75 );

    float stars = starLayer( uv + drift * 0.35, 16.0, 2.4 ) * 0.9
                + starLayer( uv - drift * 0.20, 28.0, 3.6 ) * 1.25;
    col += mix( vec3( 1.0 ), uRimColor, 0.35 ) * stars;

    float fresnel = pow( 1.0 - max( dot( N, V ), 0.0 ), 2.6 );
    col += uRimColor * smoothstep( 0.25, 0.9, fresnel ) * 0.65;

    gl_FragColor = vec4( col, uOpacity );
  }
`;

function addSkinnedWhiteOutline(mesh: THREE.SkinnedMesh, thickness: number): void {
  const outlineMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      uThickness: { value: thickness },
      uNoiseAmp: { value: 0.2 },
    },
    vertexShader: /* glsl */ `
      #include <common>
      #include <skinning_pars_vertex>
      uniform float uThickness;
      uniform float uNoiseAmp;
      void main() {
        #include <beginnormal_vertex>
        #include <skinbase_vertex>
        #include <skinnormal_vertex>
        #include <begin_vertex>
        #include <skinning_vertex>
        float brushVar = sin( transformed.x * 7.3 + transformed.y * 5.1 ) * cos( transformed.z * 6.7 - transformed.y * 4.2 );
        float width = max( 0.002, uThickness * ( 1.0 + brushVar * uNoiseAmp ) );
        vec3 extruded = transformed + normalize( objectNormal ) * width;
        gl_Position = projectionMatrix * modelViewMatrix * vec4( extruded, 1.0 );
      }
    `,
    fragmentShader: /* glsl */ `
      void main() {
        gl_FragColor = vec4( 1.0, 1.0, 1.0, 1.0 );
      }
    `,
  });

  const outline = new THREE.SkinnedMesh(mesh.geometry, outlineMat);
  outline.bind(mesh.skeleton, mesh.bindMatrix);
  outline.frustumCulled = false;
  if (mesh.parent) mesh.parent.add(outline);
  else mesh.add(outline);
}

export interface TitleDioramaSandboxOptions {
  canvas: HTMLCanvasElement;
  settings: GameSettings;
}

export class TitleDioramaSandbox {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly dividerScene = new THREE.Scene();
  private readonly divider: MenuFluidDivider;
  private readonly backdropMat: THREE.ShaderMaterial;
  private readonly universeMat: THREE.ShaderMaterial;

  private readonly center = new THREE.Vector3(0, 0.92, 0);
  private pivot: THREE.Group | null = null;
  private animator: NyxAnimator | null = null;

  private disposed = false;

  private width = 1;
  private height = 1;
  private elapsed = 0;
  private lastTime = 0;
  private rafId = 0;

  // Pose inicial inclinada ~23° en ingravidez (regla de tercios) + deriva hasta 20°/min
  private rotX = 0.14;
  private rotY = -0.34;
  private rotZ = -0.38;

  constructor(options: TitleDioramaSandboxOptions) {
    this.renderer = new THREE.WebGLRenderer({
      canvas: options.canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x0a0e25, 1);
    this.renderer.autoClear = false;

    // Cámara cercana (FOV 30, igual que en character-sheet.html)
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);

    // 1. Fondo crepuscular limpio (azul oscuro -> naranja cálido)
    this.backdropMat = new THREE.ShaderMaterial({
      vertexShader: backdropVertexShader,
      fragmentShader: backdropFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uAspect: { value: 1 },
      },
      depthTest: false,
      depthWrite: false,
    });
    const bgQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.backdropMat);
    bgQuad.frustumCulled = false;
    bgQuad.renderOrder = -10;
    this.scene.add(bgQuad);

    // 2. Material Cosmic Nebula (RAVEN NEBULA exacto en sRGB directo)
    this.universeMat = new THREE.ShaderMaterial({
      vertexShader: nyxVertexShader,
      fragmentShader: nyxUniverseFragmentShader,
      uniforms: {
        uDeepColor: { value: srgbVec3('#090314') },
        uNebulaA: { value: srgbVec3('#7e22ce') },
        uNebulaB: { value: srgbVec3('#06b6d4') },
        uRimColor: { value: srgbVec3('#f8fafc') },
        uTime: { value: 0 },
        uOpacity: { value: 0.90 },
      },
      transparent: true,
      depthWrite: true,
      side: THREE.FrontSide,
    });

    this.loadNyx();

    // 3. Divisor líquido a la izquierda
    this.divider = createMenuFluidDivider();
    this.dividerScene.add(this.divider.mesh);

    this.setSettings(options.settings);

    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.renderer.setSize(this.width, this.height, false);
    this.layoutCamera();

    window.addEventListener('resize', this.handleResize);

    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
  }

  private loadSeq = 0;

  private loadNyx(): void {
    const seq = ++this.loadSeq;
    const loader = new GLTFLoader();
    loader.load('/models/nyx_rigged.glb', (gltf) => {
      if (this.disposed || seq !== this.loadSeq) return;
      if (this.pivot) {
        this.scene.remove(this.pivot);
        this.pivot.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) m.geometry.dispose();
        });
        this.pivot = null;
        this.animator = null;
      }
      const model = gltf.scene;

      const eyeMat = new THREE.MeshBasicMaterial({ color: 0x0f172a, toneMapped: false });

      model.traverse((obj) => {
        const mesh = obj as THREE.SkinnedMesh;
        if (!mesh.isMesh) return;
        mesh.frustumCulled = false;

        if (mesh.name === 'nyx_eyes') {
          mesh.material = eyeMat;
        } else {
          mesh.material = this.universeMat;
          if (mesh.name === 'nyx_body') {
            addSkinnedWhiteOutline(mesh, 0.015);
          } else if (mesh.name === 'nyx_hair') {
            addSkinnedWhiteOutline(mesh, 0.011);
          } else if (mesh.name === 'nyx_face') {
            addSkinnedWhiteOutline(mesh, 0.008);
          }
        }
      });

      this.animator = new NyxAnimator(model);
      this.animator.setState('zero_g_float');

      const pivot = new THREE.Group();
      pivot.position.copy(this.center);
      model.position.sub(this.center);
      pivot.add(model);
      this.scene.add(pivot);
      this.pivot = pivot;
    });
  }

  private layoutCamera(): void {
    const w = this.width;
    const h = this.height;
    const aspect = w / Math.max(h, 1);

    this.camera.aspect = aspect;
    // Desplaza el centro de proyección hacia la derecha para encuadrar a Nyx limpia
    const shift = THREE.MathUtils.clamp((w - 640) / 900, 0, 1) * 0.17;
    this.camera.setViewOffset(w, h, -shift * w, 0, w, h);
    this.camera.updateProjectionMatrix();
    this.backdropMat.uniforms.uAspect.value = aspect;
  }

  setSettings(settings: GameSettings): void {
    setHalftonesEnabled(settings.halftonesEnabled);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this.handleResize);
    this.divider.dispose();
    this.backdropMat.dispose();
    this.universeMat.dispose();
    this.scene.clear();
    this.dividerScene.clear();
    this.renderer.dispose();
  }

  private handleResize = (): void => {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.renderer.setSize(this.width, this.height, false);
    this.layoutCamera();
  };

  private tick = (): void => {
    this.rafId = requestAnimationFrame(this.tick);
    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;
    this.elapsed += dt;
    const t = this.elapsed;

    this.backdropMat.uniforms.uTime.value = t;
    this.universeMat.uniforms.uTime.value = t;

    // Cámara fija cercana en plano 3/4 sin control de ratón (3.85 m de distancia)
    this.camera.position.copy(this.center).addScaledVector(TITLE_CAM_DIR, 3.85);
    this.camera.lookAt(this.center);

    // Rotación orgánica en los 3 ejes: máx. 180° por minuto (9x más viva)
    const maxRadPerSec = (180 * Math.PI) / (180 * 60);
    const vx = (0.55 * Math.sin(t * 0.11 + 0.4) + 0.45 * Math.cos(t * 0.23 + 1.7)) * maxRadPerSec;
    const vy = (0.55 * Math.sin(t * 0.09 + 2.1) + 0.45 * Math.cos(t * 0.19 + 0.5)) * maxRadPerSec;
    const vz = (0.55 * Math.sin(t * 0.13 + 3.8) + 0.45 * Math.cos(t * 0.27 + 2.9)) * maxRadPerSec;
    this.rotX += vx * dt;
    this.rotY += vy * dt;
    this.rotZ += vz * dt;

    this.animator?.update(dt, { turnRate: vy * 60 });

    if (this.pivot) {
      this.pivot.rotation.set(this.rotX, this.rotY, this.rotZ);
    }

    this.divider.update(t, this.width / Math.max(this.height, 1));

    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderer.clearDepth();
    this.renderer.render(this.dividerScene, this.divider.camera);
  };
}
