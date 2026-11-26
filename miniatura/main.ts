import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createMenuFluidDivider } from '@/game/render/menuShaders';
import { NyxAnimator } from '@/game/render/nyxAnimator';

// ============================================================================
// Generador de Miniatura 1920×1080 para OUTORBIT
// Combina la escena 3D real de Nyx + shader cósmico + divisor fluido de tinta
// con tipografía cómic Barlow Condensed nítida a resolución nativa 1080p.
// ============================================================================

const W = 1920;
const H = 1080;

const glCanvas = document.getElementById('gl-canvas') as HTMLCanvasElement;
const uiCanvas = document.getElementById('ui-canvas') as HTMLCanvasElement;
const uiCtx = uiCanvas.getContext('2d')!;

const inpSub = document.getElementById('inp-sub') as HTMLInputElement;
const inpVer = document.getElementById('inp-ver') as HTMLInputElement;
const inpRot = document.getElementById('inp-rot') as HTMLInputElement;
const inpTilt = document.getElementById('inp-tilt') as HTMLInputElement;
const inpZoom = document.getElementById('inp-zoom') as HTMLInputElement;
const btnPause = document.getElementById('btn-pause') as HTMLButtonElement;
const btnDownload = document.getElementById('btn-download') as HTMLButtonElement;

function srgbVec3(hex: string): THREE.Vector3 {
  const n = parseInt(hex.replace('#', ''), 16);
  return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

const backdropVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.9999, 1.0);
  }
`;

const backdropFrag = /* glsl */ `
  uniform float uTime;
  uniform float uAspect;
  varying vec2 vUv;

  float hash21(vec2 p) {
    p = fract(p * vec2(234.34, 435.345));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
  }

  float noise2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise2(p);
      p *= 2.02;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 uv = vUv;
    vec3 col = mix(vec3(0.035, 0.02, 0.10), vec3(0.06, 0.07, 0.24), smoothstep(0.0, 0.9, uv.y));
    float neb = fbm(vec2(uv.x * uAspect * 1.4, uv.y * 1.4) + vec2(uTime * 0.02, -uTime * 0.015));
    col += vec3(0.10, 0.40, 0.65) * smoothstep(0.35, 0.85, neb) * 0.45;
    col += vec3(0.55, 0.08, 0.36) * smoothstep(0.45, 0.95, 1.0 - neb) * 0.35;

    // Estrellas nítidas
    vec2 st = vec2(uv.x * uAspect, uv.y) * 42.0;
    vec2 cell = floor(st);
    vec2 loc = fract(st) - 0.5;
    float rnd = hash21(cell);
    if (rnd > 0.94) {
      float d = length(loc);
      col += vec3(0.85, 0.96, 1.0) * smoothstep(0.14, 0.01, d) * 0.9;
    }
    gl_FragColor = vec4(col, 1.0);
  }
`;

const nyxVert = /* glsl */ `
  #include <skinning_pars_vertex>
  varying vec2 vScreenUv;
  void main() {
    #include <skinbase_vertex>
    #include <begin_vertex>
    #include <skinning_vertex>
    #include <project_vertex>
    vScreenUv = (gl_Position.xy / max(gl_Position.w, 0.0001)) * 0.5 + 0.5;
  }
`;

const nyxFrag = /* glsl */ `
  uniform float uTime;
  uniform float uAspect;
  uniform vec3 uColorVoid;
  uniform vec3 uColorNebA;
  uniform vec3 uColorNebB;
  uniform vec3 uColorCore;
  varying vec2 vScreenUv;

  float hash21(vec2 p) {
    p = fract(p * vec2(234.34, 435.345));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
  }

  float noise2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
      mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise2(p);
      p *= 2.02;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 p = vec2(vScreenUv.x * uAspect, vScreenUv.y) * 2.1;
    float n1 = fbm(p + vec2(uTime * 0.06, -uTime * 0.04));
    float n2 = fbm(p * 1.8 - vec2(uTime * 0.04, uTime * 0.05) + n1 * 0.7);
    vec3 col = uColorVoid;
    col = mix(col, uColorNebA, smoothstep(0.28, 0.72, n1));
    col = mix(col, uColorNebB, smoothstep(0.35, 0.80, n2) * 0.85);
    col = mix(col, uColorCore, smoothstep(0.62, 0.94, n1 * n2 * 1.65));
    gl_FragColor = vec4(col, 1.0);
  }
`;

const renderer = new THREE.WebGLRenderer({
  canvas: glCanvas,
  antialias: true,
  alpha: false,
  preserveDrawingBuffer: true,
});
renderer.setSize(W, H, false);
renderer.setPixelRatio(1);
renderer.autoClear = false;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(36, W / H, 0.1, 100);
camera.setViewOffset(W, H, -W * 0.14, 0, W, H);

const backdropMat = new THREE.ShaderMaterial({
  vertexShader: backdropVert,
  fragmentShader: backdropFrag,
  uniforms: {
    uTime: { value: 2.5 },
    uAspect: { value: W / H },
  },
  depthTest: false,
  depthWrite: false,
});
const backdropMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), backdropMat);
backdropMesh.frustumCulled = false;
backdropMesh.renderOrder = -1000;
scene.add(backdropMesh);

const dividerScene = new THREE.Scene();
const divider = createMenuFluidDivider();
dividerScene.add(divider.mesh);

const universeMat = new THREE.ShaderMaterial({
  vertexShader: nyxVert,
  fragmentShader: nyxFrag,
  uniforms: {
    uTime: { value: 1.5 },
    uAspect: { value: W / H },
    uColorVoid: { value: srgbVec3('#05010f') },
    uColorNebA: { value: srgbVec3('#7e22ce') },
    uColorNebB: { value: srgbVec3('#06b6d4') },
    uColorCore: { value: srgbVec3('#fbcfe8') },
  },
});

let pivot: THREE.Group | null = null;
let center = new THREE.Vector3(0, 0.9, 0);
let animator: NyxAnimator | null = null;
let autoSpin = false;
let autoRotY = parseFloat(inpRot.value);

const loader = new GLTFLoader();
loader.load('/models/nyx.glb', (gltf) => {
  const root = gltf.scene;
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = mesh.name.startsWith('outline_')
      ? new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide })
      : universeMat;
  });

  const box = new THREE.Box3().setFromObject(root);
  center = box.getCenter(new THREE.Vector3());
  pivot = new THREE.Group();
  pivot.position.copy(center);
  root.position.sub(center);
  pivot.add(root);
  scene.add(pivot);

  animator = new NyxAnimator(root, gltf.animations);
  animator.play('float', 0.01);
});

function drawOverlay(): void {
  uiCtx.clearRect(0, 0, W, H);

  // Líneas de velocidad cómic sutiles en la zona oscura derecha
  uiCtx.save();
  const cx = W * 0.64;
  const cy = H * 0.50;
  for (let i = 0; i < 42; i++) {
    const angle = (i / 42) * Math.PI * 2;
    const r0 = 330 + (i % 4) * 55;
    const r1 = 960;
    uiCtx.strokeStyle = i % 3 === 0 ? 'rgba(34, 211, 238, 0.14)' : 'rgba(255, 255, 255, 0.09)';
    uiCtx.lineWidth = i % 5 === 0 ? 3.5 : 1.5;
    uiCtx.beginPath();
    uiCtx.moveTo(cx + Math.cos(angle) * r0, cy + Math.sin(angle) * r0);
    uiCtx.lineTo(cx + Math.cos(angle) * r1, cy + Math.sin(angle) * r1);
    uiCtx.stroke();
  }
  uiCtx.restore();

  // Bloque tipográfico izquierdo sobre el lienzo blanco de cómic
  uiCtx.save();
  uiCtx.translate(105, 340);
  uiCtx.rotate(-0.075);

  // Badge superior: ZERO-G ROGUELIKE
  uiCtx.save();
  uiCtx.transform(1, 0, -0.22, 1, 0, 0);
  uiCtx.fillStyle = '#0b0d12';
  uiCtx.fillRect(0, -76, 360, 52);
  uiCtx.strokeStyle = '#0b0d12';
  uiCtx.lineWidth = 4;
  uiCtx.strokeRect(0, -76, 360, 52);
  uiCtx.fillStyle = '#22d3ee';
  uiCtx.font = '800 30px "Barlow Condensed", sans-serif';
  uiCtx.textBaseline = 'middle';
  uiCtx.fillText('ZERO-G ROGUELIKE', 22, -50);
  uiCtx.restore();

  // Título principal: OUTORBIT con sombra dura doble cómic
  uiCtx.font = 'italic 800 208px "Barlow Condensed", sans-serif';
  uiCtx.textBaseline = 'top';
  uiCtx.fillStyle = '#e11d48';
  uiCtx.fillText('OUTORBIT', 12, 12);
  uiCtx.fillStyle = '#22d3ee';
  uiCtx.fillText('OUTORBIT', 6, 6);
  uiCtx.fillStyle = '#0b0d12';
  uiCtx.fillText('OUTORBIT', 0, 0);

  // Subtítulo: GAMEPLAY SHOWCASE
  const subText = (inpSub.value || 'GAMEPLAY SHOWCASE').toUpperCase();
  uiCtx.save();
  uiCtx.translate(14, 240);
  uiCtx.transform(1, 0, -0.22, 1, 0, 0);
  uiCtx.font = 'italic 800 58px "Barlow Condensed", sans-serif';
  const metrics = uiCtx.measureText(subText);
  const pillW = Math.max(420, metrics.width + 64);

  uiCtx.fillStyle = '#e11d48';
  uiCtx.fillRect(10, 10, pillW, 92);
  uiCtx.fillStyle = '#0b0d12';
  uiCtx.fillRect(0, 0, pillW, 92);
  uiCtx.fillStyle = '#f1f1ed';
  uiCtx.textBaseline = 'middle';
  uiCtx.fillText(subText, 30, 48);
  uiCtx.restore();

  // Etiqueta de versión (v1.0.0)
  const verText = (inpVer.value || 'v1.0.0').trim();
  if (verText.length > 0) {
    uiCtx.save();
    uiCtx.translate(14, 364);
    uiCtx.transform(1, 0, -0.22, 1, 0, 0);
    uiCtx.font = '800 38px "Barlow Condensed", sans-serif';
    const vw = uiCtx.measureText(verText).width + 44;
    uiCtx.fillStyle = '#0b0d12';
    uiCtx.fillRect(6, 6, vw, 58);
    uiCtx.fillStyle = '#22d3ee';
    uiCtx.fillRect(0, 0, vw, 58);
    uiCtx.strokeStyle = '#0b0d12';
    uiCtx.lineWidth = 4;
    uiCtx.strokeRect(0, 0, vw, 58);
    uiCtx.fillStyle = '#0b0d12';
    uiCtx.textBaseline = 'middle';
    uiCtx.fillText(verText, 22, 30);
    uiCtx.restore();
  }

  uiCtx.restore();
}

const camDir = new THREE.Vector3(0.30, 0.14, 1.0).normalize();
let last = performance.now();
let elapsed = 0;

function tick(): void {
  requestAnimationFrame(tick);
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  elapsed += dt;

  backdropMat.uniforms.uTime.value = elapsed;
  universeMat.uniforms.uTime.value = elapsed;

  const dist = parseFloat(inpZoom.value);
  camera.position.copy(center).addScaledVector(camDir, dist);
  camera.lookAt(center);

  if (autoSpin) {
    autoRotY += dt * 0.45;
    inpRot.value = (((autoRotY + Math.PI) % (Math.PI * 2)) - Math.PI).toFixed(2);
  } else {
    autoRotY = parseFloat(inpRot.value);
  }

  animator?.update(dt, { turnRate: autoSpin ? 25 : 0 });
  if (pivot) {
    pivot.rotation.set(0.08, autoRotY, parseFloat(inpTilt.value));
  }

  divider.update(elapsed, W / H);
  renderer.clear();
  renderer.render(scene, camera);
  renderer.clearDepth();
  renderer.render(dividerScene, divider.camera);
}

btnPause.addEventListener('click', () => {
  autoSpin = !autoSpin;
  btnPause.textContent = autoSpin ? 'Pausar giro' : 'Reanudar giro';
});

inpSub.addEventListener('input', drawOverlay);
inpVer.addEventListener('input', drawOverlay);

btnDownload.addEventListener('click', () => {
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const ctx = out.getContext('2d')!;
  ctx.drawImage(glCanvas, 0, 0);
  ctx.drawImage(uiCanvas, 0, 0);
  const url = out.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = `miniatura_outorbit_${(inpVer.value || 'v1.0.0').replace(/\s+/g, '_')}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
});

document.fonts.ready.then(drawOverlay);
drawOverlay();
tick();
