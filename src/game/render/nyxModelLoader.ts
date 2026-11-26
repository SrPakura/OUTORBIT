import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { NyxAnimator } from '@/game/render/nyxAnimator';
import { NyxWalkPlayer, type WalkClips } from '@/game/render/nyxWalkPlayer';
import { NyxRunPlayer, type RunClips } from '@/game/render/nyxRunPlayer';
import { NyxFloatPlayer, type FloatClips } from '@/game/render/nyxFloatPlayer';
import { NyxLoopPlayer } from '@/game/render/nyxLoopPlayer';

// ============================================================================
// Shader Nebula Cósmica: piel de NYX como nebulosa viva con estrellas titilantes
// ============================================================================

const nyxVert = /* glsl */ `
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

const nyxFrag = /* glsl */ `
  uniform vec3 uDeepColor;
  uniform vec3 uNebulaA;
  uniform vec3 uNebulaB;
  uniform vec3 uRimColor;
  uniform float uTime;
  // Gravity Shift: 0 = grounded (contorno blanco limpio), 1 = poder
  // gravitatorio encendido (rim cian-violeta + núcleo brillante + estrellas
  // interiores aceleradas por la velocidad).
  uniform float uGravityShift;
  uniform float uSpeed01;
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
    if ( h < 0.82 ) return 0.0;
    vec2 offset = vec2( hash21( id + 7.1 ), hash21( id + 13.7 ) ) - 0.5;
    float d = length( gv - offset * 0.65 );
    float tw = 0.55 + 0.45 * sin( uTime * speed + h * 40.0 );
    return smoothstep( mix( 0.04, 0.14, fract( h * 19.3 ) ), 0.0, d ) * tw;
  }
  void main() {
    vec3 N = normalize( vNormalWorld );
    vec3 V = normalize( vViewDir );
    vec2 uv = gl_FragCoord.xy * 0.0042;
    vec2 drift = vec2( uTime * 0.045, -uTime * 0.03 );
    float n1 = fbm( uv * 1.4 + drift );
    float n2 = fbm( uv * 2.2 - drift * 1.3 + n1 * 0.85 );
    vec3 col = mix( uDeepColor, uNebulaA, smoothstep( 0.34, 0.78, n1 ) * 0.85 );
    col = mix( col, uNebulaB, smoothstep( 0.44, 0.86, n2 ) * 0.75 );

    // Estrellas interiores: el pulso se acelera con la velocidad y el shift.
    float starSpeed = mix( 2.4, 2.4 + 7.0 * uSpeed01, uGravityShift );
    float stars = starLayer( uv + drift * 0.35, 16.0, starSpeed ) * 0.9
                + starLayer( uv - drift * 0.20, 28.0, starSpeed * 1.5 ) * 1.25;
    col += mix( vec3( 1.0 ), uRimColor, 0.35 ) * stars;

    // Rim Light Fresnel: blanco limpio en suelo, cian-violeta intenso en vuelo.
    float fresnel = pow( 1.0 - max( dot( N, V ), 0.0 ), 2.6 );
    vec3 shiftRim = mix(
      vec3( 0.13, 0.83, 0.93 ),
      vec3( 0.66, 0.33, 0.97 ),
      0.5 + 0.5 * sin( uTime * 1.7 )
    );
    float rimStrength = mix( 0.65, 2.15, uGravityShift );
    col += mix( uRimColor, shiftRim, uGravityShift )
         * smoothstep( 0.25, 0.9, fresnel ) * rimStrength;

    // Núcleo: el emblema del cinturón y el halo brillan con el poder encendido.
    float corePulse = 0.5 + 0.5 * sin( uTime * ( 3.0 + 6.0 * uSpeed01 ) );
    col += shiftRim * uGravityShift * ( 0.10 + 0.16 * corePulse );
    col = mix( col, col * 1.22, uGravityShift );

    gl_FragColor = vec4( col, 0.90 );
  }
`;

function srgbVec3(hex: string): THREE.Vector3 {
  const n = parseInt(hex.replace('#', ''), 16);
  return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/**
 * Contorno blanco Inverted Hull que sigue el esqueleto de una SkinnedMesh,
 * con grosor de pincel irregular.
 */
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

// ============================================================================
// Carga del modelo riggeado de NYX con materiales cósmicos
// ============================================================================

export interface NyxClips {
  /** Marcha con clips horneados; `null` si los GLB no están disponibles. */
  walk: NyxWalkPlayer | null;
  /** Carrera con clips horneados; `null` si los GLB no están disponibles. */
  run: NyxRunPlayer | null;
  /** Flotación en 0G sin input (BlendCap `zero_g_float`). */
  floatIdle: NyxLoopPlayer | null;
  /** Flotación en 0G con input, direccional (banco derecha/izquierda/centro/atrás). */
  float: NyxFloatPlayer | null;
  /** Nado físico en 0G cuando Edén < 5.5 (sin gasto de Edén). */
  swim: NyxLoopPlayer | null;
}

export interface LoadedNyx {
  root: THREE.Group;
  animator: NyxAnimator;
  clips: NyxClips;
  universeMat: THREE.ShaderMaterial;
  dispose: () => void;
}

function loadClip(loader: GLTFLoader, url: string): Promise<THREE.AnimationClip> {
  return loader.loadAsync(url).then((gltf) => {
    const clip = gltf.animations[0];
    if (!clip) throw new Error(`sin clip de animación: ${url}`);
    return clip;
  });
}

/**
 * Carga los tres clips de la marcha (arranque, bucle y frenada). Si alguno
 * falta, la marcha se desactiva y el juego se queda con el ciclo procedural:
 * un asset ausente nunca bloquea el arranque de la partida.
 */
async function loadWalkClips(loader: GLTFLoader): Promise<WalkClips | null> {
  try {
    const [start, loop, end] = await Promise.all([
      loadClip(loader, '/models/nyx_walk_start.glb'),
      loadClip(loader, '/models/nyx_walk_loop.glb'),
      loadClip(loader, '/models/nyx_walk_end.glb'),
    ]);
    return { start, loop, end };
  } catch (error) {
    console.warn('[nyx] marcha desactivada, se usa el ciclo procedural', error);
    return null;
  }
}

/**
 * Carga los tres clips de la carrera (arranque, bucle y frenada). Igual que la
 * marcha, un asset ausente no bloquea la partida: se devuelve `null` y el
 * estado cae al ciclo procedural.
 */
async function loadRunClips(loader: GLTFLoader): Promise<RunClips | null> {
  try {
    const [start, loop, end] = await Promise.all([
      loadClip(loader, '/models/nyx_run_start.glb'),
      loadClip(loader, '/models/nyx_run_loop.glb'),
      loadClip(loader, '/models/nyx_run_end.glb'),
    ]);
    return { start, loop, end };
  } catch (error) {
    console.warn('[nyx] carrera desactivada, se usa el ciclo procedural', error);
    return null;
  }
}

/**
 * Carga los cuatro clips de la flotación direccional. Salen del mismo base, así
 * que comparten duración y fase y se pueden mezclar sin saltos. Si falta
 * cualquiera de ellos se desactiva la flotación con clip y el estado cae al
 * ciclo procedural, igual que la marcha y la carrera.
 */
async function loadFloatClips(loader: GLTFLoader): Promise<FloatClips | null> {
  try {
    const [fwd, mir, mid, back] = await Promise.all([
      loadClip(loader, '/models/nyx_float_fwd.glb'),
      loadClip(loader, '/models/nyx_float_fwd_mir.glb'),
      loadClip(loader, '/models/nyx_float_fwd_mid.glb'),
      loadClip(loader, '/models/nyx_float_back.glb'),
    ]);
    return { fwd, mir, mid, back };
  } catch (error) {
    console.warn('[nyx] flotación direccional desactivada, se usa el ciclo procedural', error);
    return null;
  }
}

/**
 * Carga un clip de bucle de BlendCap. Igual que la marcha, un asset ausente no
 * bloquea la partida: se devuelve `null` y el estado cae al ciclo procedural.
 */
async function loadLoopClip(
  loader: GLTFLoader,
  url: string,
  label: string,
): Promise<THREE.AnimationClip | null> {
  try {
    return await loadClip(loader, url);
  } catch (error) {
    console.warn(`[nyx] ${label} desactivado, se usa el ciclo procedural`, error);
    return null;
  }
}

/**
 * Carga `/models/nyx_rigged.glb` y lo viste con el shader Nebula Cósmica:
 * `nyx_eyes` recibe un MeshBasicMaterial oscuro plano; `nyx_body`,
 * `nyx_hair` y `nyx_face` reciben el material de nebulosa y un contorno
 * blanco skinned (grosores 0.015 / 0.011 / 0.008). Devuelve la raíz, el
 * `NyxAnimator` listo para `update(dt)`, el reproductor de la marcha y el
 * material para avanzar `uniforms.uTime` desde el bucle de render.
 */
export async function loadNyxRigged(): Promise<LoadedNyx> {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync('/models/nyx_rigged.glb');
  const model = gltf.scene;

  const universeMat = new THREE.ShaderMaterial({
    vertexShader: nyxVert,
    fragmentShader: nyxFrag,
    uniforms: {
      uDeepColor: { value: srgbVec3('#090314') },
      uNebulaA: { value: srgbVec3('#7e22ce') },
      uNebulaB: { value: srgbVec3('#06b6d4') },
      uRimColor: { value: srgbVec3('#f8fafc') },
      uTime: { value: 0 },
      uGravityShift: { value: 0 },
      uSpeed01: { value: 0 },
    },
    transparent: true,
    depthWrite: true,
  });

  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x0f172a, toneMapped: false });

  model.traverse((obj) => {
    const mesh = obj as THREE.SkinnedMesh;
    if (!mesh.isMesh) return;
    mesh.frustumCulled = false;
    if (mesh.name === 'nyx_eyes') {
      mesh.material = eyeMat;
    } else {
      mesh.material = universeMat;
      if (mesh.name === 'nyx_body') addSkinnedWhiteOutline(mesh, 0.015);
      else if (mesh.name === 'nyx_hair') addSkinnedWhiteOutline(mesh, 0.011);
      else if (mesh.name === 'nyx_face') addSkinnedWhiteOutline(mesh, 0.008);
    }
  });

  const animator = new NyxAnimator(model);
  const walkClips = await loadWalkClips(loader);
  const walk = walkClips ? new NyxWalkPlayer(model, animator, walkClips) : null;
  const runClips = await loadRunClips(loader);
  const run = runClips ? new NyxRunPlayer(model, animator, runClips) : null;

  // La flotación sin input es un movimiento lento sin cadencia que escalar, así
  // que va a ritmo fijo. La direccional mezcla cuatro clips en un solo mixer.
  // El nado físico (`nyx_swim.glb`) entra en 0G cuando el Edén baja de 5.5.
  const [floatIdleClip, floatClips, swimClip] = await Promise.all([
    loadLoopClip(loader, '/models/nyx_zero_g_float.glb', 'flotación 0G'),
    loadFloatClips(loader),
    loadLoopClip(loader, '/models/nyx_swim.glb', 'nado 0G'),
  ]);

  const clips: NyxClips = {
    walk,
    run,
    floatIdle: floatIdleClip
      ? new NyxLoopPlayer(model, animator, floatIdleClip, { blend: 0.3 })
      : null,
    float: floatClips ? new NyxFloatPlayer(model, animator, floatClips) : null,
    swim: swimClip
      ? new NyxLoopPlayer(model, animator, swimClip, { blend: 0.25 })
      : null,
  };

  const dispose = (): void => {
    walk?.dispose();
    clips.run?.dispose();
    clips.floatIdle?.dispose();
    clips.float?.dispose();
    clips.swim?.dispose();
    const materials = new Set<THREE.Material>();
    model.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[];
      if (Array.isArray(mat)) mat.forEach((m) => materials.add(m));
      else materials.add(mat);
    });
    materials.forEach((m) => m.dispose());
    model.removeFromParent();
  };

  return { root: model, animator, clips, universeMat, dispose };
}
