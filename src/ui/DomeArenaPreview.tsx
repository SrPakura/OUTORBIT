import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createDomeArenaBackdrop } from '@/game/render/domeArenaScene';
import { createComicCelMaterial, addComicOutline } from '@/game/render/toonMaterials';
import { NyxAnimator } from '@/game/render/nyxAnimator';

interface DomeArenaPreviewProps {
  onExit: () => void;
}

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
    float stars = starLayer( uv + drift * 0.35, 16.0, 2.4 ) * 0.9
                + starLayer( uv - drift * 0.20, 28.0, 3.6 ) * 1.25;
    col += mix( vec3( 1.0 ), uRimColor, 0.35 ) * stars;
    float fresnel = pow( 1.0 - max( dot( N, V ), 0.0 ), 2.6 );
    col += uRimColor * smoothstep( 0.25, 0.9, fresnel ) * 0.65;
    gl_FragColor = vec4( col, 0.90 );
  }
`;

function srgbVec3(hex: string): THREE.Vector3 {
  const n = parseInt(hex.replace('#', ''), 16);
  return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

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

/**
 * Vista previa interactiva de la Cúpula de Cristal (50 m) y el Escenario 3D.
 * Cámara libre: WASD para volar, Espacio/Shift subir/bajar, arrastrar ratón para mirar.
 */
export default function DomeArenaPreview({ onExit }: DomeArenaPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight, false);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 2500);
    camera.position.set(0, 3.2, 11);

    const sun = new THREE.DirectionalLight(0xdbeafe, 1.5);
    sun.position.set(60, 120, 40);
    scene.add(sun);
    scene.add(new THREE.AmbientLight(0x818cf8, 0.65));

    const backdrop = createDomeArenaBackdrop(scene);

    // Primeras plataformas/suelos de referencia a distintas inclinaciones dentro de R=50
    const slabs: Array<{ mesh: THREE.Mesh; base: THREE.Vector3; phase: number }> = [];
    const slabMat = createComicCelMaterial('#1e1b4b', { rimColor: '#22d3ee', rimStrength: 0.75 });
    const slabSpecs: Array<{ pos: [number, number, number]; size: [number, number, number]; rot: [number, number, number] }> = [
      { pos: [0, -2.5, 0], size: [12, 1.2, 12], rot: [0, 0.2, 0] },
      { pos: [-16, 6, -12], size: [9, 1.0, 9], rot: [0.35, 0.4, 1.15] },
      { pos: [18, 10, -8], size: [10, 1.0, 7], rot: [-0.25, -0.5, -0.95] },
      { pos: [4, 19, -20], size: [11, 1.1, 8], rot: [Math.PI, 0.3, 0.15] },
      { pos: [-12, -14, 14], size: [8, 1.0, 8], rot: [0.45, -0.3, 0.4] },
      { pos: [15, -10, 18], size: [9, 1.0, 9], rot: [-0.7, 0.2, 0.5] },
    ];
    slabSpecs.forEach((s, i) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(s.size[0], s.size[1], s.size[2]), slabMat);
      m.position.set(s.pos[0], s.pos[1], s.pos[2]);
      m.rotation.set(s.rot[0], s.rot[1], s.rot[2]);
      addComicOutline(m, 0.06, 0x22d3ee);
      scene.add(m);
      slabs.push({ mesh: m, base: m.position.clone(), phase: i * 1.1 });
    });

    // NYX flotando en el centro para apreciar la escala real de 50m
    const universeMat = new THREE.ShaderMaterial({
      vertexShader: nyxVert,
      fragmentShader: nyxFrag,
      uniforms: {
        uDeepColor: { value: srgbVec3('#090314') },
        uNebulaA: { value: srgbVec3('#7e22ce') },
        uNebulaB: { value: srgbVec3('#06b6d4') },
        uRimColor: { value: srgbVec3('#f8fafc') },
        uTime: { value: 0 },
      },
      transparent: true,
      depthWrite: true,
    });

    let animator: NyxAnimator | null = null;
    let nyxRoot: THREE.Group | null = null;
    let disposed = false;

    new GLTFLoader().load('/models/nyx_rigged.glb', (gltf) => {
      if (disposed) return;
      const model = gltf.scene;
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
      animator = new NyxAnimator(model);
      animator.setState('zero_g_float');
      nyxRoot = model;
      nyxRoot.position.set(0, 0, 0);
      scene.add(nyxRoot);
    });

    // Controles de cámara libre (arrastrar ratón + WASD + Espacio/Shift)
    let yaw = 0;
    let pitch = -0.15;
    let dragging = false;
    const keys = new Set<string>();

    const onDown = (e: MouseEvent) => { if (e.button === 0 || e.button === 2) dragging = true; };
    const onUp = () => { dragging = false; };
    const onMove = (e: MouseEvent) => {
      if (!dragging) return;
      yaw -= e.movementX * 0.0035;
      pitch = THREE.MathUtils.clamp(pitch - e.movementY * 0.0035, -1.45, 1.45);
    };
    const onKeyDown = (e: KeyboardEvent) => { keys.add(e.code); };
    const onKeyUp = (e: KeyboardEvent) => { keys.delete(e.code); };
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight, false);
    };

    window.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', onResize);

    let last = performance.now();
    let elapsed = 0;
    let raf = 0;
    const fwd = new THREE.Vector3();
    const right = new THREE.Vector3();
    const euler = new THREE.Euler(0, 0, 0, 'YXZ');

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      elapsed += dt;

      euler.set(pitch, yaw, 0, 'YXZ');
      camera.quaternion.setFromEuler(euler);
      fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
      right.set(1, 0, 0).applyQuaternion(camera.quaternion);

      const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight')) ? 34 : 18;
      if (keys.has('KeyW')) camera.position.addScaledVector(fwd, speed * dt);
      if (keys.has('KeyS')) camera.position.addScaledVector(fwd, -speed * dt);
      if (keys.has('KeyD')) camera.position.addScaledVector(right, speed * dt);
      if (keys.has('KeyA')) camera.position.addScaledVector(right, -speed * dt);
      if (keys.has('Space')) camera.position.y += speed * dt;
      if (keys.has('KeyC') || keys.has('ControlLeft')) camera.position.y -= speed * dt;

      universeMat.uniforms.uTime.value = elapsed;
      animator?.update(dt);
      backdrop.update(dt, elapsed);

      for (const s of slabs) {
        s.mesh.position.y = s.base.y + Math.sin(elapsed * 0.55 + s.phase) * 0.55;
      }

      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', onResize);
      backdrop.dispose();
      universeMat.dispose();
      slabMat.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#040510]">
      <canvas ref={canvasRef} className="block h-full w-full cursor-grab active:cursor-grabbing" />
      <button
        type="button"
        onClick={onExit}
        className="absolute left-4 top-4 z-10 -skew-x-12 cursor-pointer border-2 border-white bg-[#090314]/85 px-4 py-2 text-xs font-black uppercase tracking-[0.15em] text-white shadow-[4px_4px_0_#000] hover:border-cyan-300"
      >
        <span className="block skew-x-12">← Menú</span>
      </button>
      <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-cyan-300/40 bg-[#090314]/75 px-4 py-1.5 text-[11px] font-bold tracking-[0.1em] text-cyan-100 backdrop-blur">
        ARRASTRAR RATÓN: Mirar · WASD: Volar · ESPACIO / CTRL: Subir / Bajar · SHIFT: Turbo
      </div>
    </div>
  );
}
