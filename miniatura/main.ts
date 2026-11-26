import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { NyxAnimator } from '@/game/render/nyxAnimator';

// ============================================================================
// Generador de Miniatura 1920×1080 para OUTORBIT
// - Fondo espacial oscuro puro con Nyx 3D (/models/nyx_rigged.glb) + shader
//   nebulosa cósmica y contornos blancos exactos de TitleDioramaSandbox.
// - Marco blanco de papel en los 4 bordes + franja diagonal izquierda
//   inspirada en el boceto del usuario.
// - Logo idéntico al del juego (OUT negro + ORBIT carmesí con sombra dura)
//   y textos 100% editables / ocultables sin ningún texto forzado.
// ============================================================================

const W = 1920;
const H = 1080;

const glCanvas = document.getElementById('gl-canvas') as HTMLCanvasElement;
const uiCanvas = document.getElementById('ui-canvas') as HTMLCanvasElement;
const uiCtx = uiCanvas.getContext('2d')!;

const inpLogo = document.getElementById('inp-logo') as HTMLInputElement;
const inpTag = document.getElementById('inp-tag') as HTMLInputElement;
const inpSub = document.getElementById('inp-sub') as HTMLInputElement;
const inpVer = document.getElementById('inp-ver') as HTMLInputElement;
const inpTextAngle = document.getElementById('inp-text-angle') as HTMLInputElement;
const inpTextScale = document.getElementById('inp-text-scale') as HTMLInputElement;
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
    mat2 m = mat2(0.8, 0.6, -0.6, 0.8);
    for (int i = 0; i < 4; i++) {
      v += a * noise2(p);
      p = m * p * 2.02;
      a *= 0.5;
    }
    return v;
  }

  float starLayer(vec2 uv, float scale, float speed) {
    vec2 gv = fract(uv * scale) - 0.5;
    vec2 id = floor(uv * scale);
    float h = hash21(id);
    if (h < 0.84) return 0.0;
    vec2 offset = vec2(hash21(id + 7.1), hash21(id + 13.7)) - 0.5;
    float d = length(gv - offset * 0.65);
    float twinkle = 0.65 + 0.35 * sin(uTime * speed + h * 40.0);
    float size = mix(0.04, 0.13, fract(h * 19.3));
    return smoothstep(size, 0.0, d) * twinkle;
  }

  void main() {
    vec2 uv = vUv;
    vec2 p = vec2(uv.x * uAspect, uv.y);

    // Espacio cósmico profundo (azul oscuro -> magenta/cian nebuloso)
    vec3 skyTop = vec3(0.03, 0.04, 0.14);
    vec3 skyBot = vec3(0.11, 0.04, 0.16);
    vec3 col = mix(skyBot, skyTop, smoothstep(0.0, 1.0, uv.y));

    float n1 = fbm(p * 1.6 + vec2(uTime * 0.015, -uTime * 0.01));
    float n2 = fbm(p * 2.6 - vec2(uTime * 0.01, uTime * 0.018) + n1 * 0.7);
    col += vec3(0.04, 0.38, 0.55) * smoothstep(0.38, 0.85, n1) * 0.45;
    col += vec3(0.45, 0.08, 0.32) * smoothstep(0.42, 0.88, n2) * 0.42;

    float stars = starLayer(p, 14.0, 1.4) * 0.85 + starLayer(p + 0.37, 26.0, 2.2) * 0.9;
    col += vec3(0.88, 0.96, 1.0) * stars;

    gl_FragColor = vec4(col, 1.0);
  }
`;

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
    #include <project_vertex>

    vec4 wp = modelMatrix * vec4(transformed, 1.0);
    vNormalWorld = normalize(mat3(modelMatrix) * objectNormal);
    vViewDir = normalize(cameraPosition - wp.xyz);
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
    mat2 m = mat2(0.8, 0.6, -0.6, 0.8);
    for (int i = 0; i < 4; i++) {
      v += a * noise2(p);
      p = m * p * 2.02;
      a *= 0.5;
    }
    return v;
  }

  float starLayer(vec2 uv, float scale, float speed) {
    vec2 gv = fract(uv * scale) - 0.5;
    vec2 id = floor(uv * scale);
    float h = hash21(id);
    if (h < 0.82) return 0.0;
    vec2 offset = vec2(hash21(id + 7.1), hash21(id + 13.7)) - 0.5;
    float d = length(gv - offset * 0.65);
    float twinkle = 0.55 + 0.45 * sin(uTime * speed + h * 40.0);
    float size = mix(0.04, 0.14, fract(h * 19.3));
    return smoothstep(size, 0.0, d) * twinkle;
  }

  void main() {
    vec3 N = normalize(vNormalWorld);
    vec3 V = normalize(vViewDir);
    vec2 uv = gl_FragCoord.xy * 0.0028;
    vec2 drift = vec2(uTime * 0.045, -uTime * 0.03);

    float n1 = fbm(uv * 1.4 + drift);
    float n2 = fbm(uv * 2.2 - drift * 1.3 + n1 * 0.85);

    vec3 col = uDeepColor;
    col = mix(col, uNebulaA, smoothstep(0.34, 0.78, n1) * 0.85);
    col = mix(col, uNebulaB, smoothstep(0.44, 0.86, n2) * 0.75);

    float stars = starLayer(uv + drift * 0.35, 16.0, 2.4) * 0.9
                + starLayer(uv - drift * 0.20, 28.0, 3.6) * 1.25;
    col += mix(vec3(1.0), uRimColor, 0.35) * stars;

    float fresnel = pow(1.0 - max(dot(N, V), 0.0), 2.6);
    col += uRimColor * smoothstep(0.25, 0.9, fresnel) * 0.65;

    gl_FragColor = vec4(col, uOpacity);
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
        float brushVar = sin(transformed.x * 7.3 + transformed.y * 5.1) * cos(transformed.z * 6.7 - transformed.y * 4.2);
        float width = max(0.002, uThickness * (1.0 + brushVar * uNoiseAmp));
        vec3 extruded = transformed + normalize(objectNormal) * width;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(extruded, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      void main() {
        gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
      }
    `,
  });

  const outline = new THREE.SkinnedMesh(mesh.geometry, outlineMat);
  outline.bind(mesh.skeleton, mesh.bindMatrix);
  outline.frustumCulled = false;
  if (mesh.parent) mesh.parent.add(outline);
  else mesh.add(outline);
}

const renderer = new THREE.WebGLRenderer({
  canvas: glCanvas,
  antialias: true,
  alpha: false,
  preserveDrawingBuffer: true,
});
renderer.setSize(W, H, false);
renderer.setPixelRatio(1);
renderer.setClearColor(0x0a0e25, 1);
renderer.autoClear = false;

const frameDividerVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const frameDividerFrag = /* glsl */ `
  uniform float uTime;
  uniform float uAspect;
  varying vec2 vUv;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float valueNoise(vec2 p) {
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
    float sum = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 4; i++) {
      sum += amp * valueNoise(p);
      p = p * 2.03 + vec2(1.7, 9.2);
      amp *= 0.5;
    }
    return sum;
  }

  float halftoneDots(vec2 fragCoord, float scale) {
    float angle = 0.523599;
    mat2 rot = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
    vec2 uv = (rot * fragCoord) / scale;
    vec2 grid = fract(uv) - 0.5;
    return length(grid);
  }

  void main() {
    vec2 uv = vUv;
    vec2 q = vec2(uv.x * uAspect, uv.y);

    // Ventana espacial con los 4 bordes y esquinas redondeadas + corte diagonal izquierdo
    float padY = 0.032;
    float padX = 0.018;
    float r = 0.036;

    vec2 pBot = vec2(0.24 * uAspect, 0.0);
    vec2 pTop = vec2(0.40 * uAspect, 1.0);
    vec2 edgeDir = normalize(pTop - pBot);
    vec2 nL = vec2(edgeDir.y, -edgeDir.x); // Normal interior hacia la derecha

    float sLeft = dot(q - pBot, nL);
    float sRight = (1.0 - padX) * uAspect - q.x;
    float sTop = (1.0 - padY) - q.y;
    float sBot = q.y - padY;

    float dBox = min(min(sLeft, sRight), min(sTop, sBot));
    float oX = max(max(r - sLeft, r - sRight), 0.0);
    float oY = max(max(r - sTop, r - sBot), 0.0);
    float dWindow = (oX > 0.0 && oY > 0.0) ? (r - length(vec2(oX, oY))) : dBox;

    // Onda líquida orgánica idéntica a MenuFluidDivider aplicada a los 4 bordes
    float t = uTime;
    float n1 = fbm(vec2(q.y * 3.0 + t * 0.22, q.x * 2.2 - t * 0.12));
    float n2 = fbm(vec2(q.y * 6.2 - t * 0.28, q.x * 3.6 + t * 0.16));
    float wave = sin((q.y + q.x) * 8.0 + t * 1.2) * 0.35
               + (n1 - 0.5) * 1.25
               + (n2 - 0.5) * 0.55;
    float d = dWindow - (wave / 1.5) * 0.014;

    vec3 col;
    float alpha;

    if (d < 0.0) {
      // Marco/panel blanco #f1f1ed con rejilla sutil
      vec3 paper = vec3(0.945, 0.945, 0.929);
      vec2 gp = gl_FragCoord.xy / 96.0;
      vec2 gf = abs(fract(gp) - 0.5);
      float lineMask = smoothstep(0.485, 0.5, max(gf.x, gf.y));
      col = mix(paper, paper * 0.93, lineMask * 0.55);
      alpha = 1.0;
    } else if (d < 0.004) {
      // Filo de tinta oscura en todo el perímetro redondeado
      col = vec3(0.043, 0.051, 0.071);
      alpha = 0.92;
    } else if (d < 0.060) {
      // Estela líquida + puntos halftone en los 4 bordes
      float f = (d - 0.004) / 0.056;
      float swirl = fbm(vec2((q.y + q.x) * 4.5 + t * 0.3, f * 3.5 - t * 0.45));
      vec3 ink = vec3(0.043, 0.051, 0.071);
      vec3 crimson = vec3(0.88, 0.11, 0.28);
      vec3 plum = vec3(0.42, 0.19, 0.90);
      vec3 cian = vec3(0.13, 0.83, 0.93);
      vec3 liquid = mix(crimson, plum, smoothstep(0.2, 0.85, swirl));
      liquid = mix(liquid, cian, smoothstep(0.55, 1.0, swirl) * 0.45);
      col = mix(ink, liquid, smoothstep(0.0, 0.4, f));
      float dots = halftoneDots(gl_FragCoord.xy, 6.5);
      float dotMask = smoothstep(0.7, 0.1, f) * 0.45;
      alpha = (dots < dotMask ? 0.42 : 0.20) * (1.0 - smoothstep(0.0, 1.0, f));
    } else {
      col = vec3(0.0);
      alpha = 0.0;
    }

    gl_FragColor = vec4(col, alpha);
  }
`;

const scene = new THREE.Scene();
const dividerScene = new THREE.Scene();
const dividerMat = new THREE.ShaderMaterial({
  vertexShader: frameDividerVert,
  fragmentShader: frameDividerFrag,
  uniforms: {
    uTime: { value: 0 },
    uAspect: { value: W / H },
  },
  transparent: true,
  depthTest: false,
  depthWrite: false,
  fog: false,
});
const dividerMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), dividerMat);
dividerMesh.frustumCulled = false;
dividerMesh.renderOrder = 10;
dividerScene.add(dividerMesh);
const dividerCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
dividerCamera.position.z = 1;

const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 100);
// Desplaza el encuadre para centrar a Nyx dentro de la ventana espacial a la derecha
camera.setViewOffset(W, H, -W * 0.14, 0, W, H);

const backdropMat = new THREE.ShaderMaterial({
  vertexShader: backdropVert,
  fragmentShader: backdropFrag,
  uniforms: {
    uTime: { value: 2.0 },
    uAspect: { value: W / H },
  },
  depthTest: false,
  depthWrite: false,
});
const bgQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), backdropMat);
bgQuad.frustumCulled = false;
bgQuad.renderOrder = -10;
scene.add(bgQuad);

const universeMat = new THREE.ShaderMaterial({
  vertexShader: nyxVertexShader,
  fragmentShader: nyxUniverseFragmentShader,
  uniforms: {
    uDeepColor: { value: srgbVec3('#090314') },
    uNebulaA: { value: srgbVec3('#7e22ce') },
    uNebulaB: { value: srgbVec3('#06b6d4') },
    uRimColor: { value: srgbVec3('#f8fafc') },
    uTime: { value: 0 },
    uOpacity: { value: 0.92 },
  },
  transparent: true,
  depthWrite: true,
  side: THREE.FrontSide,
});

const center = new THREE.Vector3(0, 0.92, 0);
let pivot: THREE.Group | null = null;
let animator: NyxAnimator | null = null;
let autoSpin = false;
let autoRotY = parseFloat(inpRot.value);

const loader = new GLTFLoader();
loader.load('/models/nyx_rigged.glb', (gltf) => {
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
      if (mesh.name === 'nyx_body') {
        addSkinnedWhiteOutline(mesh, 0.016);
      } else if (mesh.name === 'nyx_hair') {
        addSkinnedWhiteOutline(mesh, 0.012);
      } else if (mesh.name === 'nyx_face') {
        addSkinnedWhiteOutline(mesh, 0.009);
      }
    }
  });

  animator = new NyxAnimator(model);
  animator.setState('zero_g_float');

  pivot = new THREE.Group();
  pivot.position.copy(center);
  model.position.sub(center);
  pivot.add(model);
  scene.add(pivot);
});

function drawGameLogo(
  ctx: CanvasRenderingContext2D,
  text: string,
  fontSize: number,
  shadowOffset: number,
): { width: number } {
  const splitIdx = text.indexOf('|');
  const partA = splitIdx >= 0 ? text.slice(0, splitIdx) : text.slice(0, 3);
  const partB = splitIdx >= 0 ? text.slice(splitIdx + 1) : text.slice(3);

  ctx.font = `italic 900 ${fontSize}px "Barlow Condensed", sans-serif`;
  ctx.textBaseline = 'top';
  // Emula letter-spacing negativo de .title-logo
  const wA = ctx.measureText(partA).width;
  const wB = ctx.measureText(partB).width;

  // OUT -> negro con sombra carmesí
  ctx.fillStyle = '#e11d48';
  ctx.fillText(partA, shadowOffset, shadowOffset);
  ctx.fillStyle = '#0b0d12';
  ctx.fillText(partA, 0, 0);

  // ORBIT -> carmesí con sombra negra
  if (partB.length > 0) {
    ctx.fillStyle = '#0b0d12';
    ctx.fillText(partB, wA + shadowOffset, shadowOffset);
    ctx.fillStyle = '#e11d48';
    ctx.fillText(partB, wA, 0);
  }
  return { width: wA + wB };
}

function drawOverlay(): void {
  uiCtx.clearRect(0, 0, W, H);

  // ------------------------------------------------------------------------
  // Bloque de textos grande sobre la franja blanca izquierda (100% configurable)
  // El marco blanco redondeado + efecto líquido halftone de los 4 lados lo
  // dibuja frameDividerFrag en WebGL justo debajo.
  // ------------------------------------------------------------------------
  const logoText = inpLogo.value;
  const tagText = inpTag.value;
  const subText = inpSub.value;
  const verText = inpVer.value;
  const angleRad = (parseFloat(inpTextAngle.value) * Math.PI) / 180;
  const scale = parseFloat(inpTextScale.value);

  uiCtx.save();
  uiCtx.translate(W * 0.165, H * 0.51);
  uiCtx.rotate(angleRad);
  uiCtx.scale(scale, scale);

  const logoSize = 205;
  const hasTag = tagText.trim().length > 0;
  const hasLogo = logoText.trim().length > 0;
  const hasSub = subText.trim().length > 0;
  const hasVer = verText.trim().length > 0;

  const blockH =
    (hasTag ? 54 : 0) +
    (hasLogo ? logoSize * 0.90 : 0) +
    (hasSub ? 78 : 0) +
    (hasVer ? 50 : 0);
  let cursorY = -blockH * 0.5;
  const startX = -420;

  // Tag superior estilo .title-tag + línea carmesí (solo si tiene texto)
  if (hasTag) {
    uiCtx.save();
    uiCtx.translate(startX, cursorY);
    uiCtx.font = '800 24px ui-monospace, "SF Mono", Menlo, monospace';
    const tw = uiCtx.measureText(tagText.toUpperCase()).width + 30;
    uiCtx.save();
    uiCtx.transform(1, 0, -0.14, 1, 0, 0);
    uiCtx.fillStyle = '#0b0d12';
    uiCtx.fillRect(5, 5, tw, 38);
    uiCtx.fillStyle = '#ffffff';
    uiCtx.fillRect(0, 0, tw, 38);
    uiCtx.strokeStyle = '#0b0d12';
    uiCtx.lineWidth = 2.5;
    uiCtx.strokeRect(0, 0, tw, 38);
    uiCtx.fillStyle = '#0b0d12';
    uiCtx.textBaseline = 'middle';
    uiCtx.fillText(tagText.toUpperCase(), 15, 20);
    uiCtx.restore();

    uiCtx.fillStyle = '#e11d48';
    uiCtx.fillRect(tw + 18, 17, Math.max(160, 820 - tw), 6);
    uiCtx.restore();
    cursorY += 54;
  }

  // Logo idéntico al del juego (solo si tiene texto)
  if (hasLogo) {
    uiCtx.save();
    uiCtx.translate(startX, cursorY);
    drawGameLogo(uiCtx, logoText, logoSize, 10);
    uiCtx.restore();
    cursorY += logoSize * 0.90;
  }

  // Subtítulo libre grande y legible (solo si tiene texto)
  if (hasSub) {
    uiCtx.save();
    uiCtx.translate(startX + 12, cursorY + 12);
    uiCtx.font = 'italic 800 66px "Barlow Condensed", sans-serif';
    uiCtx.textBaseline = 'top';
    uiCtx.fillStyle = '#0b0d12';
    uiCtx.fillText(subText, 0, 0);
    uiCtx.restore();
    cursorY += 78;
  }

  // Texto extra libre (solo si el usuario escribe algo)
  if (hasVer) {
    uiCtx.save();
    uiCtx.translate(startX + 14, cursorY + 14);
    uiCtx.font = '800 40px "Barlow Condensed", sans-serif';
    uiCtx.textBaseline = 'top';
    uiCtx.fillStyle = '#e11d48';
    uiCtx.fillText(verText, 0, 0);
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
    pivot.rotation.set(0.0, autoRotY, parseFloat(inpTilt.value));
  }

  dividerMat.uniforms.uTime.value = elapsed;
  dividerMat.uniforms.uAspect.value = W / H;
  renderer.clear();
  renderer.render(scene, camera);
  renderer.clearDepth();
  renderer.render(dividerScene, dividerCamera);
}

btnPause.addEventListener('click', () => {
  autoSpin = !autoSpin;
  btnPause.textContent = autoSpin ? 'Pausar giro' : 'Reanudar giro';
});

for (const el of [inpLogo, inpTag, inpSub, inpVer, inpTextAngle, inpTextScale]) {
  el.addEventListener('input', drawOverlay);
}

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
  a.download = `miniatura_outorbit_${(inpVer.value || 'custom').replace(/\s+/g, '_')}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
});

document.fonts.ready.then(drawOverlay);
drawOverlay();
tick();
