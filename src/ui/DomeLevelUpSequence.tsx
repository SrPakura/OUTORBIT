import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import * as THREE from 'three';
import { useI18n, SKILL_I18N_KEYS } from '@/i18n';
import type { LevelUpCardOption } from '@/game/dome/DomeProgression';
import type { SynthAudio } from '@/game/audio/SynthAudio';
import { useGamepadListNav } from '@/game/input/gamepadMenuNav';
import SkillIcon from '@/ui/SkillIcon';

// ============================================================================
// Subida de nivel cinemática — secuencia completa de pantalla completa:
//
//   1. PLANETA  · Transición 3D en canvas transparente sobre la partida en
//                vivo (sin fondo negro ni estrellas): punto blanco → zoom-in
//                continuo del planeta hasta cubrir el viewport y blanquearlo
//                al papel #f1f1ed de la interfaz de cartas.
//   2. CARTAS   · La pantalla de cartas de levelup-preview: título brutal,
//                slams con shake, carta elegida que vuela al centro temblando
//                y ranuras de reemplazo.
//   3. IRIS     · Cierre simétrico: el papel colapsa en un círculo con filo
//                carmesí que se reduce hasta un punto que parpadea y se apaga.
// ============================================================================

const TIMING = {
  PHASE1_END: 0.3, // Punto blanco + pulso
  PHASE2_END: 1.55, // Zoom-in continuo hasta cubrir el viewport
};

const ROLL_ANGLE = -27 * (Math.PI / 180);
const PITCH_ANGLE = 25 * (Math.PI / 180);
const PLANET_RADIUS = 1.0;
const RING_INNER = 1.42;
const RING_OUTER = 3.25;
const RING_THICKNESS = 0.11;

// Paleta del menú (la misma que levelup-preview / character-sheet).
const COL = {
  paper: new THREE.Color('#f1f1ed'),
  crimson: new THREE.Color('#e11d48'),
  cyan: new THREE.Color('#22d3ee'),
  gold: new THREE.Color('#fbbf24'),
};

export interface DomeLevelUpSequenceProps {
  isOpen: boolean;
  newLevel: number;
  /** true si hay más subidas de nivel en cola tras la actual (omite iris). */
  hasNextLevel?: boolean;
  choices: LevelUpCardOption[] | null;
  equippedSlots: Array<{ skillId?: string | null; name: string | null; level: number }>;
  requiresSlotReplacement: boolean;
  /** Selección inicial de la partida: salta la animación del planeta y
   *  muestra el papel y las cartas desde el primer frame. */
  skipPlanetAnimation?: boolean;
  audioRef: { current: SynthAudio | null };
  onSelect: (option: LevelUpCardOption, replaceSlotIndex?: 0 | 1 | 2) => void;
}

function pad2(n: number): string {
  return (n < 10 ? '0' : '') + n;
}

// ============================================================================
// FASE 1-3 · PLANETA (Three.js, coreografía de la referencia recoloreada)
// ============================================================================

const dotVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const dotFragmentShader = /* glsl */ `
  uniform float uOpacity;
  uniform float uPulse;
  varying vec2 vUv;

  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float d = length(p);

    float coreRadius = mix(0.055, 0.145, uPulse);
    float core = 1.0 - smoothstep(coreRadius * 0.72, coreRadius, d);

    float flareX = exp(-abs(p.y) * 26.0) * exp(-abs(p.x) * 3.4);
    float flareY = exp(-abs(p.x) * 26.0) * exp(-abs(p.y) * 3.4);
    float starFlare = (flareX + flareY) * uPulse;

    float ringR = mix(0.12, 0.62, 1.0 - uPulse * 0.45);
    float pulseRing = smoothstep(0.035, 0.0, abs(d - ringR)) * uPulse * 0.85;

    vec3 paper = vec3(0.945, 0.945, 0.929);
    vec3 cyan = vec3(0.133, 0.827, 0.933);
    vec3 col = paper;
    col = mix(col, cyan, pulseRing * 0.65);

    float alpha = clamp(core + starFlare * 0.95 + pulseRing, 0.0, 1.0) * uOpacity;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(col, alpha);
  }
`;

const planetVertexShader = /* glsl */ `
  varying vec3 vNormalView;
  varying vec3 vViewDir;
  varying vec3 vLocalPos;

  void main() {
    vLocalPos = position;
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vNormalView = normalize(normalMatrix * normal);
    vViewDir = normalize(-mvPos.xyz);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const planetFragmentShader = /* glsl */ `
  uniform float uWhiteout;
  uniform float uEnergyPulse;
  uniform vec3 uAccentColor;
  varying vec3 vNormalView;
  varying vec3 vViewDir;
  varying vec3 vLocalPos;

  void main() {
    vec3 N = normalize(vNormalView);
    vec3 V = normalize(vViewDir);
    float ndotv = clamp(dot(N, V), 0.0, 1.0);
    float fresnel = 1.0 - ndotv;

    // Paleta del menú: base tinta, bordes cian→carmesí, blanco = papel.
    vec3 baseDark = vec3(0.043, 0.051, 0.071);
    vec3 paper = vec3(0.945, 0.945, 0.929);
    vec3 cyan = vec3(0.133, 0.827, 0.933);
    vec3 crimson = vec3(0.882, 0.114, 0.282);

    vec3 lightDir = normalize(vec3(0.55, 0.72, 0.42));
    float ndotl = dot(N, lightDir);

    vec2 cell = mod(gl_FragCoord.xy, 7.0) - 3.5;
    float dotDist = length(cell);
    float halftoneMask = step(dotDist, 1.9);

    vec3 color = baseDark;

    if (ndotl > 0.25 && ndotl < 0.62) {
      color = mix(color, vec3(0.165, 0.184, 0.239), halftoneMask * 0.75);
    }

    float angle = atan(vLocalPos.z, vLocalPos.x);
    float meridian = smoothstep(0.955, 0.985, abs(sin(angle * 4.0)));
    float equator = smoothstep(0.055, 0.02, abs(vLocalPos.y));
    color = mix(color, cyan, meridian * 0.22 * smoothstep(0.15, 0.7, fresnel));
    color = mix(color, paper, equator * 0.35 * smoothstep(0.2, 0.75, fresnel));

    float accentRim = smoothstep(0.56, 0.66, fresnel);
    vec3 rimTint = mix(cyan, crimson, smoothstep(-0.3, 0.4, N.y));
    color = mix(color, rimTint, accentRim * 0.65);

    float whiteRim = smoothstep(0.67, 0.75, fresnel);
    color = mix(color, paper, whiteRim);

    float specBand = smoothstep(0.76, 0.80, ndotl);
    color = mix(color, paper, specBand * 0.92);

    color = mix(color, uAccentColor, uEnergyPulse * (0.35 + fresnel * 0.65));
    color = mix(color, paper, uWhiteout);

    gl_FragColor = vec4(color, 1.0);
  }
`;

const ringVertexShader = /* glsl */ `
  varying vec3 vLocalPos;
  void main() {
    vLocalPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ringFragmentShader = /* glsl */ `
  uniform float uInnerR;
  uniform float uOuterR;
  uniform float uWhiteout;
  uniform float uEnergyPulse;
  uniform vec3 uAccentColor;
  varying vec3 vLocalPos;

  void main() {
    float r = length(vLocalPos.xz);
    float rn = clamp((r - uInnerR) / (uOuterR - uInnerR), 0.0, 1.0);
    float theta = atan(vLocalPos.z, vLocalPos.x);

    vec3 paper = vec3(0.945, 0.945, 0.929);
    vec3 cyan = vec3(0.133, 0.827, 0.933);
    vec3 crimson = vec3(0.882, 0.114, 0.282);
    vec3 inkDark = vec3(0.043, 0.051, 0.071);

    vec3 col = paper;

    float arc1 = smoothstep(0.15, 0.22, sin(theta * 3.0 + rn * 2.5));
    float band1 = smoothstep(0.03, 0.0, abs(rn - 0.22)) * arc1;

    float arc2 = smoothstep(0.25, 0.35, sin(theta * 5.0 - 1.2));
    float band2 = smoothstep(0.028, 0.0, abs(rn - 0.68)) * arc2;

    float cutArc = smoothstep(0.65, 0.72, sin(theta * 4.0 + 0.8));
    float inkCut = smoothstep(0.014, 0.0, abs(rn - 0.45)) * cutArc;

    float outerEdgeCyan = smoothstep(0.91, 0.985, rn);
    float innerEdgeCyan = smoothstep(0.07, 0.0, rn);
    float speedTick = smoothstep(0.92, 0.96, sin(theta * 8.0)) * smoothstep(0.035, 0.0, abs(rn - 0.82));

    col = mix(col, cyan, clamp(band1 * 0.85 + band2 * 0.7 + outerEdgeCyan * 0.65 + innerEdgeCyan * 0.55, 0.0, 1.0));
    col = mix(col, crimson, speedTick * 0.95);
    col = mix(col, inkDark, inkCut * 0.85);

    col = mix(col, uAccentColor, uEnergyPulse * 0.72);
    col = mix(col, paper, uWhiteout);

    gl_FragColor = vec4(col, 1.0);
  }
`;

const wipeVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const wipeFragmentShader = /* glsl */ `
  uniform float uAspect;
  uniform float uRoll;
  uniform float uThreshold;
  uniform float uActive;
  uniform float uMode;
  uniform float uHalftoneAlpha;
  uniform vec3 uEdgeAccent;
  varying vec2 vUv;

  void main() {
    if (uActive < 0.5) discard;

    vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
    vec2 nDir = vec2(-sin(uRoll), cos(uRoll));
    float s = dot(p, nDir);

    float diff = (uMode < 0.5) ? (s - uThreshold) : (uThreshold - s);

    float edgeWidth = (uMode < 0.5) ? 0.055 : 0.075;
    if (diff < -edgeWidth) discard;

    vec3 paper = vec3(0.945, 0.945, 0.929);
    vec3 cyan = vec3(0.133, 0.827, 0.933);
    vec3 crimson = vec3(0.882, 0.114, 0.282);

    // Trama de semitonos sutil sobre el papel
    vec2 dotCell = mod(gl_FragCoord.xy, 14.0) - 7.0;
    float ht = 1.0 - smoothstep(1.1, 1.6, length(dotCell));
    vec3 whitePaper = mix(paper, vec3(0.886, 0.886, 0.871), ht * uHalftoneAlpha);

    if (diff >= 0.0) {
      gl_FragColor = vec4(whitePaper, 1.0);
    } else {
      float edgeT = clamp((diff + edgeWidth) / edgeWidth, 0.0, 1.0);
      vec3 primaryCut = (uMode < 0.5) ? cyan : uEdgeAccent;
      vec3 secondaryCut = (uMode < 0.5) ? crimson : mix(cyan, crimson, 0.5);
      vec3 edgeCol = mix(secondaryCut, primaryCut, smoothstep(0.25, 0.78, edgeT));
      edgeCol = mix(edgeCol, paper, smoothstep(0.76, 1.0, edgeT));
      float edgeAlpha = smoothstep(0.0, 0.32, edgeT);
      gl_FragColor = vec4(edgeCol, edgeAlpha);
    }
  }
`;

function computeResponsiveFov(aspect: number): number {
  if (aspect < 0.72) return 68;
  if (aspect < 1.0) return 60;
  return 54;
}

function computeDiagonalBounds(aspect: number): number {
  const nx = Math.abs(-Math.sin(ROLL_ANGLE));
  const ny = Math.abs(Math.cos(ROLL_ANGLE));
  return 0.5 * aspect * nx + 0.5 * ny;
}

function PlanetTransition({
  audioRef,
  onDone,
}: {
  audioRef: { current: SynthAudio | null };
  onDone: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const audio = audioRef.current;

    let disposed = false;
    let raf = 0;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0);
    renderer.autoClear = false;

    const scene = new THREE.Scene();

    const aspect0 = window.innerWidth / Math.max(window.innerHeight, 1);
    const camera = new THREE.PerspectiveCamera(computeResponsiveFov(aspect0), aspect0, 0.08, 1200);
    camera.position.set(0, 0, 0);
    camera.lookAt(0, 0, -1);

    // --- Punto blanco inicial (Fase 1) ---
    const dotMaterial = new THREE.ShaderMaterial({
      vertexShader: dotVertexShader,
      fragmentShader: dotFragmentShader,
      uniforms: { uOpacity: { value: 0.0 }, uPulse: { value: 0.0 } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const dotMesh = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 5.5), dotMaterial);
    dotMesh.position.set(0, 0, -45);
    scene.add(dotMesh);

    // --- Rig del planeta con anillo inclinado ---
    const planetPositionGroup = new THREE.Group();
    const planetRollGroup = new THREE.Group();
    const planetPitchGroup = new THREE.Group();
    const planetSpinGroup = new THREE.Group();
    planetRollGroup.rotation.z = ROLL_ANGLE;
    planetPitchGroup.rotation.x = -PITCH_ANGLE;
    planetPositionGroup.add(planetRollGroup);
    planetRollGroup.add(planetPitchGroup);
    planetPitchGroup.add(planetSpinGroup);
    scene.add(planetPositionGroup);

    const planetMat = new THREE.ShaderMaterial({
      vertexShader: planetVertexShader,
      fragmentShader: planetFragmentShader,
      uniforms: {
        uWhiteout: { value: 0.0 },
        uEnergyPulse: { value: 0.0 },
        uAccentColor: { value: COL.crimson.clone() },
      },
    });
    planetSpinGroup.add(new THREE.Mesh(new THREE.SphereGeometry(PLANET_RADIUS, 64, 48), planetMat));

    const outlineMat = new THREE.MeshBasicMaterial({ color: COL.paper, side: THREE.BackSide });
    planetSpinGroup.add(new THREE.Mesh(new THREE.SphereGeometry(PLANET_RADIUS * 1.045, 48, 32), outlineMat));

    const halfT = RING_THICKNESS * 0.5;
    const bevel = 0.025;
    const ringProfile = [
      new THREE.Vector2(RING_INNER, -halfT + bevel),
      new THREE.Vector2(RING_INNER + bevel, -halfT),
      new THREE.Vector2(RING_OUTER - bevel, -halfT),
      new THREE.Vector2(RING_OUTER, -halfT + bevel),
      new THREE.Vector2(RING_OUTER, halfT - bevel),
      new THREE.Vector2(RING_OUTER - bevel, halfT),
      new THREE.Vector2(RING_INNER + bevel, halfT),
      new THREE.Vector2(RING_INNER, halfT - bevel),
      new THREE.Vector2(RING_INNER, -halfT + bevel),
    ];
    const ringMat = new THREE.ShaderMaterial({
      vertexShader: ringVertexShader,
      fragmentShader: ringFragmentShader,
      uniforms: {
        uInnerR: { value: RING_INNER },
        uOuterR: { value: RING_OUTER },
        uWhiteout: { value: 0.0 },
        uEnergyPulse: { value: 0.0 },
        uAccentColor: { value: COL.crimson.clone() },
      },
      side: THREE.DoubleSide,
    });
    planetSpinGroup.add(new THREE.Mesh(new THREE.LatheGeometry(ringProfile, 96), ringMat));

    // Partículas orbitales doradas, solidarias al planeta
    const orbitalCount = 48;
    const orbitalPos = new Float32Array(orbitalCount * 3);
    for (let i = 0; i < orbitalCount; i++) {
      const ang = (i / orbitalCount) * Math.PI * 2 + Math.random() * 0.25;
      const rad = RING_OUTER + 0.18 + Math.random() * 0.45;
      orbitalPos[i * 3] = Math.cos(ang) * rad;
      orbitalPos[i * 3 + 1] = (Math.random() - 0.5) * 0.18;
      orbitalPos[i * 3 + 2] = Math.sin(ang) * rad;
    }
    const orbitalGeo = new THREE.BufferGeometry();
    orbitalGeo.setAttribute('position', new THREE.BufferAttribute(orbitalPos, 3));
    planetSpinGroup.add(
      new THREE.Points(orbitalGeo, new THREE.PointsMaterial({ color: COL.gold, size: 0.11, sizeAttenuation: true })),
    );

    // --- Escena ortográfica del barrido diagonal ---
    const orthoScene = new THREE.Scene();
    const orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const wipeMaterial = new THREE.ShaderMaterial({
      vertexShader: wipeVertexShader,
      fragmentShader: wipeFragmentShader,
      uniforms: {
        uAspect: { value: aspect0 },
        uRoll: { value: ROLL_ANGLE },
        uThreshold: { value: 2.0 },
        uActive: { value: 0.0 },
        uMode: { value: 0.0 },
        uHalftoneAlpha: { value: 0.0 },
        uEdgeAccent: { value: COL.crimson.clone() },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    orthoScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), wipeMaterial));

    // --- Resize ---
    const onResize = () => {
      const w = window.innerWidth;
      const h = Math.max(window.innerHeight, 1);
      renderer.setSize(w, h);
      const aspect = w / h;
      camera.aspect = aspect;
      camera.fov = computeResponsiveFov(aspect);
      camera.updateProjectionMatrix();
      wipeMaterial.uniforms.uAspect.value = aspect;
    };
    window.addEventListener('resize', onResize);

    // --- Coreografía de entrada (Fases 1 → 3) ---
    const zStart = -155.0;

    let currentPhase = 0;
    let spinAngle = 0;
    let slashPlayed = false;
    let finished = false;

    const start = performance.now();
    let last = start;

    const loop = (now: number) => {
      if (disposed) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const elapsed = (now - start) / 1000;
      const aspect = window.innerWidth / Math.max(window.innerHeight, 1);
      const sMax = computeDiagonalBounds(aspect);

      if (elapsed < TIMING.PHASE1_END) {
        if (currentPhase !== 1) {
          currentPhase = 1;
          audio?.playLevelUpSpark();
        }
        const t1 = elapsed / TIMING.PHASE1_END;
        const pulse =
          t1 < 0.45 ? Math.sin((t1 / 0.45) * (Math.PI * 0.5)) : Math.cos(((t1 - 0.45) / 0.55) * (Math.PI * 0.5));

        dotMesh.visible = true;
        dotMaterial.uniforms.uOpacity.value = Math.min(1.0, t1 * 5.0);
        dotMaterial.uniforms.uPulse.value = Math.max(0.0, pulse);

        planetPositionGroup.visible = t1 > 0.55;
        planetPositionGroup.position.set(0, 0, zStart);
        const emergeScale = Math.max(0.01, (t1 - 0.55) / 0.45);
        planetPositionGroup.scale.setScalar(emergeScale);

        spinAngle += dt * 4.5;
        planetSpinGroup.rotation.y = spinAngle;

        planetMat.uniforms.uWhiteout.value = 1.0 - emergeScale * 0.65;
        ringMat.uniforms.uWhiteout.value = 1.0 - emergeScale * 0.55;

        wipeMaterial.uniforms.uActive.value = 0.0;
      } else if (elapsed < TIMING.PHASE2_END) {
        if (currentPhase !== 2) {
          currentPhase = 2;
          audio?.playLevelUpApproach();
        }
        const t2 = (elapsed - TIMING.PHASE1_END) / (TIMING.PHASE2_END - TIMING.PHASE1_END);

        if (t2 < 0.14) {
          dotMesh.visible = true;
          dotMaterial.uniforms.uOpacity.value = 1.0 - t2 / 0.14;
          dotMaterial.uniforms.uPulse.value = 0.25 * (1.0 - t2 / 0.14);
        } else {
          dotMesh.visible = false;
        }

        planetPositionGroup.visible = true;
        planetPositionGroup.scale.setScalar(1.0);

        // Zoom-in único y continuo: interpolación exponencial desde el fondo
        // hasta la distancia a la que la esfera cubre el viewport completo.
        // Sin pausas intermedias ni desplazamiento vertical.
        const fovRad = camera.fov * (Math.PI / 180);
        const zCover = (PLANET_RADIUS * 0.92) / (Math.tan(fovRad * 0.5) * Math.max(1, aspect));
        const ease = Math.pow(t2, 1.45);
        const z = -Math.abs(zStart) * Math.pow(zCover / Math.abs(zStart), ease);
        planetPositionGroup.position.set(0, 0, z);

        const spinSpeed = 5.5 + Math.pow(t2, 1.8) * 11.0;
        spinAngle += dt * spinSpeed;
        planetSpinGroup.rotation.y = spinAngle;

        // Al final del acercamiento el planeta se blanquea y pinta la
        // pantalla del papel de la interfaz de cartas.
        const wT = Math.min(1, Math.max(0, (t2 - 0.72) / 0.28));
        const whiteout = wT * wT * (3 - 2 * wT);
        if (whiteout > 0 && !slashPlayed) {
          slashPlayed = true;
          audio?.playLevelUpSlash();
        }

        const introFade = Math.max(0.0, 1.0 - t2 * 5.0);
        planetMat.uniforms.uWhiteout.value = Math.max(introFade * 0.35, whiteout);
        ringMat.uniforms.uWhiteout.value = Math.max(introFade * 0.35, whiteout);

        wipeMaterial.uniforms.uActive.value = 0.0;
      } else {
        // Fase 3: pantalla 100% papel → la UI de cartas toma el relevo.
        currentPhase = 3;
        dotMesh.visible = false;
        planetPositionGroup.visible = false;
        wipeMaterial.uniforms.uActive.value = 1.0;
        wipeMaterial.uniforms.uMode.value = 0.0;
        wipeMaterial.uniforms.uThreshold.value = -sMax - 0.5;
        wipeMaterial.uniforms.uHalftoneAlpha.value = 1.0;

        renderer.clear();
        renderer.render(scene, camera);
        renderer.render(orthoScene, orthoCamera);

        if (!finished) {
          finished = true;
          window.setTimeout(() => {
            if (!disposed) onDoneRef.current();
          }, 240);
        }
        return; // congela el último frame (papel completo) hasta el desmontaje
      }

      renderer.clear();
      renderer.render(scene, camera);
      renderer.render(orthoScene, orthoCamera);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = (mesh as unknown as { material?: THREE.Material | THREE.Material[] }).material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else if (mat) mat.dispose();
      });
      orthoScene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
      });
      wipeMaterial.dispose();
      renderer.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <canvas ref={canvasRef} className="lu-planet" />;
}

// ============================================================================
// SECUENCIA COMPLETA
// ============================================================================

export default function DomeLevelUpSequence({
  isOpen,
  newLevel,
  hasNextLevel = false,
  choices,
  equippedSlots,
  requiresSlotReplacement,
  skipPlanetAnimation,
  audioRef,
  onSelect,
}: DomeLevelUpSequenceProps) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<'planet' | 'cards' | 'closing'>(
    skipPlanetAnimation ? 'cards' : 'planet',
  );
  const [showReplace, setShowReplace] = useState(false);
  const [flashKey, setFlashKey] = useState(0);

  const sheetRef = useRef<HTMLDivElement | null>(null);
  const cardEls = useRef(new Map<string, HTMLDivElement>());
  const flyingRef = useRef<LevelUpCardOption | null>(null);
  const lockedRef = useRef(false);
  const returningRef = useRef(false);
  const timersRef = useRef<number[]>([]);
  const pendingRef = useRef<{ option: LevelUpCardOption; slotIndex?: 0 | 1 | 2 } | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const hasNextLevelRef = useRef(hasNextLevel);
  hasNextLevelRef.current = hasNextLevel;

  const schedule = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timersRef.current = timersRef.current.filter((tId) => tId !== id);
      fn();
    }, ms);
    timersRef.current.push(id);
    return id;
  }, []);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((id) => window.clearTimeout(id));
      timersRef.current = [];
    };
  }, []);

  const audio = () => audioRef.current;

  const shake = useCallback(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    sheet.classList.remove('is-shaking');
    void sheet.offsetWidth;
    sheet.classList.add('is-shaking');
  }, []);

  const flash = useCallback(() => setFlashKey((k) => k + 1), []);

  // Impactos escalonados de la entrada de las cartas
  useEffect(() => {
    if (phase !== 'cards' || !choices) return;
    const timers: number[] = [];
    timers.push(
      window.setTimeout(() => {
        audio()?.playCardSlam();
        shake();
      }, 340),
    );
    choices.forEach((_, i) => {
      timers.push(
        window.setTimeout(() => {
          audio()?.playCardSlam();
          shake();
        }, 480 + i * 130 + 430),
      );
    });
    return () => timers.forEach((id) => window.clearTimeout(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, choices, newLevel]);

  // Cierre: iris de papel que colapsa en un punto que parpadea y se apaga
  const beginClosing = useCallback(
    (option: LevelUpCardOption, slotIndex?: 0 | 1 | 2) => {
      pendingRef.current = { option, slotIndex };
      setPhase('closing');
      audio()?.playIrisWink();
      schedule(() => {
        const pending = pendingRef.current;
        pendingRef.current = null;
        if (pending) onSelectRef.current(pending.option, pending.slotIndex);
      }, 1180);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [schedule],
  );

  const finish = useCallback(
    (option: LevelUpCardOption, slotIndex?: 0 | 1 | 2) => {
      if (lockedRef.current || returningRef.current) return;
      lockedRef.current = true;
      const el = cardEls.current.get(option.id);
      if (el) {
        el.classList.remove('is-trembling');
        el.classList.add('is-stamped');
      }
      setShowReplace(false);
      flash();
      shake();
      audio()?.playCardStamp();
      schedule(() => {
        if (hasNextLevelRef.current) {
          onSelectRef.current(option, slotIndex);
        } else {
          beginClosing(option, slotIndex);
        }
      }, 520);
    },
    [beginClosing, flash, schedule, shake],
  );

  const closeReplace = useCallback(() => {
    const option = flyingRef.current;
    if (!option || returningRef.current || lockedRef.current) return;
    const el = cardEls.current.get(option.id);
    returningRef.current = true;
    flyingRef.current = null;
    setShowReplace(false);
    if (!el) {
      returningRef.current = false;
      return;
    }
    el.classList.remove('is-trembling');
    el.style.transition = 'transform 320ms cubic-bezier(.3, 1, .3, 1), box-shadow 320ms ease';
    el.style.transform = 'skewX(-5deg) scale(1)';
    el.style.boxShadow = `9px 9px 0 ${option.accentColor}`;
    schedule(() => {
      el.classList.remove('is-flying');
      el.style.cssText = '';
      el.style.setProperty('--accent', option.accentColor);
      cardEls.current.forEach((sibling) => sibling.classList.remove('is-out'));
      returningRef.current = false;
    }, 330);
  }, [schedule]);

  const flyToCenter = useCallback(
    (option: LevelUpCardOption) => {
      const el = cardEls.current.get(option.id);
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const unskewedWidth = el.offsetWidth || rect.width;
      const left = rect.left + (rect.width - unskewedWidth) / 2;
      el.style.left = `${left}px`;
      el.style.top = `${rect.top}px`;
      el.style.width = `${unskewedWidth}px`;
      el.classList.add('is-flying');

      const cx = window.innerWidth / 2 - (rect.left + rect.width / 2);
      const cy = window.innerHeight * 0.44 - (rect.top + rect.height / 2);
      const fly = `translate(${cx}px, ${cy}px) skewX(-5deg) scale(1.1)`;
      el.style.setProperty('--fly-transform', fly);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.style.transform = fly;
          el.style.boxShadow = `18px 18px 0 ${option.accentColor}`;
        });
      });
      cardEls.current.forEach((sibling) => {
        if (sibling !== el) sibling.classList.add('is-out');
      });
      flyingRef.current = option;
      audio()?.playInkWipe();
      schedule(() => {
        if (flyingRef.current !== option) return;
        el.classList.add('is-trembling');
        audio()?.playCardTremble();
        shake();
        setShowReplace(true);
      }, 430);
    },
    [schedule, shake],
  );

  const pick = useCallback(
    (option: LevelUpCardOption) => {
      if (lockedRef.current || flyingRef.current || returningRef.current) return;
      if (requiresSlotReplacement && option.kind === 'active_new') {
        flyToCenter(option);
        return;
      }
      finish(option);
    },
    [finish, flyToCenter, requiresSlotReplacement],
  );

  // Mando — cartas: D-Pad/stick izq-der mueve, Cruz (A) elige.
  const [padCardIndex, setPadCardIndex] = useGamepadListNav(choices?.length ?? 0, {
    enabled: isOpen && phase === 'cards' && !showReplace,
    columns: choices?.length ?? 1,
    onConfirm: (i) => {
      const option = choices?.[i];
      if (option) pick(option);
    },
  });

  // Mando — ranuras de reemplazo: Cruz (A) confirma, Círculo (B) vuelve.
  const [padSlotIndex, setPadSlotIndex] = useGamepadListNav(equippedSlots.length, {
    enabled: isOpen && showReplace,
    columns: equippedSlots.length,
    onConfirm: (i) => {
      if (flyingRef.current) finish(flyingRef.current, i as 0 | 1 | 2);
    },
    onBack: closeReplace,
  });

  // Al encadenar al siguiente nivel dentro de la misma secuencia, limpia refs y foco.
  useEffect(() => {
    lockedRef.current = false;
    flyingRef.current = null;
    returningRef.current = false;
    setShowReplace(false);
    setPadCardIndex(0);
    setPadSlotIndex(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newLevel]);

  // Al abrir el panel de reemplazo, el foco del mando empieza en la ranura 1.
  useEffect(() => {
    if (showReplace) setPadSlotIndex(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showReplace]);

  // Foco visual de las cartas: imperativo para no pisar las clases de
  // vuelo/sello que se gestionan con classList.
  useEffect(() => {
    if (phase !== 'cards') return;
    const focusedId = showReplace ? null : choices?.[padCardIndex]?.id ?? null;
    cardEls.current.forEach((el, id) => {
      el.classList.toggle('is-pad-focus', id === focusedId);
    });
  }, [phase, showReplace, choices, padCardIndex, newLevel]);

  // Teclado: [1..N] elige carta · con carta en vuelo [1..3] elige ranura · ESC vuelve
  useEffect(() => {
    if (phase !== 'cards' || !choices) return;
    const onKey = (e: KeyboardEvent) => {
      if (lockedRef.current) return;
      const flying = flyingRef.current;
      if (flying) {
        if (e.key === 'Escape') {
          closeReplace();
          return;
        }
        const idx = Number(e.key) - 1;
        if (Number.isInteger(idx) && idx >= 0 && idx < equippedSlots.length) {
          finish(flying, idx as 0 | 1 | 2);
        }
        return;
      }
      const idx = Number(e.key) - 1;
      if (Number.isInteger(idx) && idx >= 0 && idx < choices.length) {
        pick(choices[idx]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, choices, equippedSlots.length, closeReplace, finish, pick]);

  if (!isOpen || !choices) return null;

  const closing = phase === 'closing';

  return (
    <div className={`lu-root${closing ? ' is-closing' : ''}`}>
      {phase === 'planet' && <PlanetTransition audioRef={audioRef} onDone={() => setPhase('cards')} />}

      {phase !== 'planet' && (
        <div key={newLevel} ref={sheetRef} className="lu-sheet is-in">
          <div className="lu-speedlines" />
          <div className="lu-burst" />

          <div className="lu-title">
            <span className="lu-title__num">{pad2(newLevel)}</span>
            <span className="lu-title__banner">
              {t('levelUp.banner')}
              <span className="lu-title__slash" />
            </span>
          </div>

          <main className="lu-stage">
            {choices.map((option, i) => {
              const skillKey = option.skillId
                ? SKILL_I18N_KEYS[option.skillId]
                : option.passiveId
                  ? SKILL_I18N_KEYS[option.passiveId]
                  : null;
              const cardTitle = skillKey ? t(`skills.${skillKey}`) : option.title;
              const cardDesc =
                option.skillId && skillKey
                  ? t(`skillDescriptions.${skillKey}`)
                  : option.passiveId && skillKey
                    ? t(`skillDescriptions.${skillKey}${option.nextLevel}`)
                    : option.description;

              return (
                <div key={option.id} className="lu-card-slot">
                  <div
                    ref={(el) => {
                      if (el) cardEls.current.set(option.id, el);
                      else cardEls.current.delete(option.id);
                    }}
                    className="lu-card"
                    style={{ '--accent': option.accentColor } as CSSProperties}
                    role="button"
                    tabIndex={0}
                    onClick={() => pick(option)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        pick(option);
                      }
                    }}
                  >
                    <span className="lu-card__ghost">{pad2(i + 1)}</span>
                    <span className="lu-card__rarity">{t(`levelUp.rarity.${option.rarity}`)}</span>
                    <div className="lu-card__icon">
                      <div className="ring" />
                      <SkillIcon
                        id={option.skillId ?? option.passiveId}
                        size={68}
                        className="lu-card__svg"
                      />
                    </div>
                    <p className="lu-card__name">{cardTitle}</p>
                    <p className="lu-card__level">
                      {t('levelUp.levelShort')} {option.currentLevel}{' '}
                      <span className="arrow">→ {t('levelUp.levelShort')} {option.nextLevel}</span>
                    </p>
                    {option.edenCost != null && (
                      <span className="lu-card__cost">
                        {t('levelUp.edenCost', { n: option.edenCost })}
                      </span>
                    )}
                    <p className="lu-card__desc">{cardDesc}</p>
                    <span className="lu-card__key">[{i + 1}]</span>
                    <div className="lu-shock" />
                    <div className="lu-stamp">{t('levelUp.chosen')}</div>
                  </div>
                </div>
              );
            })}
          </main>
        </div>
      )}

      {showReplace && flyingRef.current && (
        <div className="lu-replace is-on">
          <div className="lu-replace__banner">{t('levelUp.replaceBanner')}</div>
          <button type="button" className="lu-replace__esc" onClick={closeReplace}>
            {t('levelUp.escBack')}
          </button>
          <div className="lu-replace__slots">
            {equippedSlots.map((slot, i) => {
              const slotSkillKey = slot.skillId ? SKILL_I18N_KEYS[slot.skillId] : null;
              const slotDisplayName = slotSkillKey ? t(`skills.${slotSkillKey}`) : (slot.name ?? t('levelUp.emptySlot'));

              return (
                <button
                  key={i}
                  type="button"
                  className={`lu-slot${padSlotIndex === i ? ' is-pad-focus' : ''}`}
                  onClick={() => flyingRef.current && finish(flyingRef.current, i as 0 | 1 | 2)}
                >
                  <span className="lu-slot__idx">R{i + 1}</span>
                  <p className="lu-slot__name">{slotDisplayName}</p>
                  <p className="lu-slot__lv">
                    {t('levelUp.levelShort')} {slot.level}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {flashKey > 0 && <div key={flashKey} className="lu-flash is-on" />}

      {closing && (
        <>
          <div className="lu-iris-ring" />
          <div className="lu-iris-dot" />
        </>
      )}

      <style>{`
        .lu-root {
          position: fixed;
          inset: 0;
          z-index: 50;
          overflow: hidden;
          /* Transparente: durante el planeta se ve la partida detrás y el
             papel lo aporta .lu-sheet. */
          background: transparent;
          font-family: "Helvetica Neue", Helvetica, Arial, "Noto Sans JP", "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif;
          -webkit-font-smoothing: antialiased;
        }
        .lu-planet { position: absolute; inset: 0; width: 100%; height: 100%; }

        /* ---- hoja de papel ---- */
        .lu-sheet {
          position: absolute;
          inset: 0;
          overflow: hidden;
          background-color: #f1f1ed;
          background-image:
            linear-gradient(rgba(11,13,18,0.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(11,13,18,0.06) 1px, transparent 1px);
          background-size: 96px 96px;
          color: #0b0d12;
        }
        .lu-sheet.is-shaking { animation: luShake 300ms linear; }
        @keyframes luShake {
          0%   { transform: translate(0, 0) rotate(0deg); }
          15%  { transform: translate(-7px, 4px) rotate(-0.35deg); }
          30%  { transform: translate(6px, -5px) rotate(0.3deg); }
          45%  { transform: translate(-5px, -3px) rotate(-0.2deg); }
          60%  { transform: translate(4px, 4px) rotate(0.15deg); }
          75%  { transform: translate(-3px, 1px) rotate(0deg); }
          100% { transform: translate(0, 0) rotate(0deg); }
        }

        .lu-speedlines {
          position: absolute;
          inset: -12%;
          pointer-events: none;
          background: repeating-conic-gradient(
            from 0deg at 50% 46%,
            transparent 0deg 5.2deg,
            rgba(11, 13, 18, 0.05) 5.2deg 5.9deg
          );
          -webkit-mask-image: radial-gradient(circle at 50% 46%, transparent 26%, #000 78%);
          mask-image: radial-gradient(circle at 50% 46%, transparent 26%, #000 78%);
          opacity: 0;
          animation: luLinesIn 900ms ease-out 200ms forwards;
        }
        @keyframes luLinesIn { to { opacity: 1; } }

        .lu-burst {
          position: absolute;
          left: 50%;
          top: 52%;
          width: 130vmin;
          height: 130vmin;
          transform: translate(-50%, -50%);
          pointer-events: none;
          background-image: radial-gradient(rgba(11,13,18,0.16) 2.4px, transparent 2.6px);
          background-size: 15px 15px;
          -webkit-mask-image: radial-gradient(circle, #000 0%, transparent 62%);
          mask-image: radial-gradient(circle, #000 0%, transparent 62%);
          opacity: 0;
          animation: luBurstIn 700ms cubic-bezier(.2, .9, .3, 1) 350ms forwards;
        }
        @keyframes luBurstIn {
          from { opacity: 0; transform: translate(-50%, -50%) scale(0.4) rotate(-8deg); }
          to   { opacity: 1; transform: translate(-50%, -50%) scale(1) rotate(0deg); }
        }

        /* ---- título ---- */
        .lu-title {
          position: absolute;
          top: 7vh;
          left: 50%;
          transform: translateX(-50%);
          text-align: center;
          z-index: 2;
          white-space: nowrap;
        }
        .lu-title__num {
          display: block;
          font-size: clamp(90px, 17vw, 230px);
          font-weight: 900;
          font-style: italic;
          letter-spacing: -0.06em;
          line-height: 0.82;
          color: transparent;
          -webkit-text-stroke: 3px #0b0d12;
          opacity: 0;
          animation: luNumIn 460ms cubic-bezier(.2, 1.3, .4, 1) 120ms forwards;
        }
        @keyframes luNumIn {
          from { opacity: 0; transform: translateY(60px) skewX(-14deg) scale(1.25); }
          to   { opacity: 1; transform: translateY(0) skewX(-14deg) scale(1); }
        }
        .lu-title__banner {
          position: absolute;
          left: 50%;
          top: 38%;
          transform: translate(-50%, -50%) rotate(-3.5deg);
          background: #0b0d12;
          color: #fff;
          font-weight: 900;
          font-style: italic;
          font-size: clamp(22px, 3.4vw, 44px);
          letter-spacing: 0.02em;
          padding: 8px 30px 13px;
          box-shadow: 7px 7px 0 #e11d48;
          clip-path: inset(0 100% 0 0);
          white-space: nowrap;
          animation: luBannerIn 380ms cubic-bezier(.2, .9, .25, 1) 300ms forwards;
        }
        @keyframes luBannerIn {
          from { clip-path: inset(0 100% 0 0); }
          to   { clip-path: inset(0 0 0 0); }
        }
        .lu-title__slash {
          position: absolute;
          left: -60px;
          top: -18px;
          width: 130%;
          height: 10px;
          background: #e11d48;
          transform: rotate(-3.5deg) scaleX(0);
          transform-origin: left center;
          z-index: -1;
          animation: luSlashIn 260ms cubic-bezier(.6, 0, .2, 1) 560ms forwards;
        }
        @keyframes luSlashIn { to { transform: rotate(-3.5deg) scaleX(1); } }

        /* ---- cartas ---- */
        .lu-stage {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4vw;
          padding-top: 16vh;
        }
        .lu-card-slot {
          position: relative;
          width: min(300px, 26vw);
          opacity: 0;
          animation: luCardSlam 520ms cubic-bezier(.16, 1.2, .3, 1) forwards;
        }
        .lu-card-slot:nth-child(1) { animation-delay: 480ms; }
        .lu-card-slot:nth-child(2) { animation-delay: 610ms; }
        .lu-card-slot:nth-child(3) { animation-delay: 740ms; }
        @keyframes luCardSlam {
          0%   { opacity: 0; transform: translateY(72vh) rotate(9deg) scale(0.9); }
          62%  { opacity: 1; transform: translateY(-14px) rotate(0deg) scale(1.04); }
          100% { opacity: 1; transform: translateY(0) rotate(0deg) scale(1); }
        }
        .lu-card {
          position: relative;
          width: 100%;
          background: #fbfbf8;
          border: 3px solid #0b0d12;
          box-shadow: 9px 9px 0 var(--accent, #0b0d12);
          padding: 46px 18px 18px;
          cursor: pointer;
          transform: skewX(-5deg);
          transition: transform 150ms cubic-bezier(.2, .9, .3, 1), box-shadow 150ms ease, opacity 260ms ease, filter 260ms ease;
          color: #0b0d12;
        }
        .lu-card:hover {
          transform: skewX(-5deg) translateY(-12px) scale(1.05);
          box-shadow: 14px 14px 0 var(--accent, #0b0d12);
          z-index: 2;
        }
        .lu-card.is-pad-focus {
          transform: skewX(-5deg) translateY(-12px) scale(1.05);
          box-shadow: 14px 14px 0 var(--accent, #0b0d12);
          outline: 4px solid #22d3ee;
          outline-offset: 4px;
          z-index: 2;
        }
        .lu-card:focus-visible { outline: 3px solid #22d3ee; outline-offset: 4px; }
        .lu-card::before {
          content: "";
          position: absolute;
          inset: 0;
          background-image: radial-gradient(rgba(11,13,18,0.1) 1.6px, transparent 1.8px);
          background-size: 11px 11px;
          -webkit-mask-image: linear-gradient(200deg, #000 0%, transparent 42%);
          mask-image: linear-gradient(200deg, #000 0%, transparent 42%);
          pointer-events: none;
        }
        .lu-card__ghost {
          position: absolute;
          right: 2px;
          top: -14px;
          font-size: 92px;
          font-weight: 900;
          font-style: italic;
          line-height: 1;
          color: transparent;
          -webkit-text-stroke: 2px rgba(11, 13, 18, 0.14);
          pointer-events: none;
          user-select: none;
        }
        .lu-card__rarity {
          position: absolute;
          top: -3px;
          left: -3px;
          background: var(--accent, #0b0d12);
          color: #fff;
          font: 800 10px/1 ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
          letter-spacing: 0.22em;
          padding: 7px 10px 6px;
          transform: skewX(-9deg);
        }
        .lu-card__icon {
          position: relative;
          width: 108px;
          height: 108px;
          margin: 10px auto 16px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .lu-card__icon::before, .lu-card__icon::after {
          content: "";
          position: absolute;
          background: rgba(11, 13, 18, 0.05);
        }
        .lu-card__icon::before { left: 50%; top: 0; bottom: 0; width: 1px; }
        .lu-card__icon::after  { top: 50%; left: 0; right: 0; height: 1px; }
        .lu-card__icon .ring {
          position: absolute;
          inset: 9px;
          border: 2px solid var(--accent, #0b0d12);
          border-right-color: transparent;
          border-bottom-color: transparent;
          border-radius: 50%;
          animation: luRingSpin 8s linear infinite;
        }
        @keyframes luRingSpin { to { transform: rotate(360deg); } }
        .lu-card__svg {
          position: relative;
          z-index: 1;
          color: #0b0d12;
          display: block;
          filter: drop-shadow(2px 2px 0 rgba(11, 13, 18, 0.14));
        }
        .lu-card__name {
          font-size: 21px;
          font-weight: 900;
          font-style: italic;
          letter-spacing: -0.02em;
          line-height: 1;
          text-transform: uppercase;
          color: #0b0d12;
          margin: 0 0 6px;
        }
        .lu-card__level {
          font: 800 12px/1 ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
          letter-spacing: 0.08em;
          margin: 0 0 10px;
          color: #0b0d12;
        }
        .lu-card__level .arrow { color: var(--accent, #e11d48); }
        .lu-card__cost {
          display: inline-block;
          background: #0b0d12;
          color: #22d3ee;
          font: 800 9px/1 ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
          letter-spacing: 0.18em;
          padding: 5px 8px 4px;
          margin-bottom: 10px;
        }
        .lu-card__upgrade {
          display: inline-block;
          background: transparent;
          color: #2a2f3d;
          font: 800 9px/1 ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
          letter-spacing: 0.18em;
          padding: 5px 0 4px;
          margin-bottom: 10px;
          margin-left: 8px;
        }
        .lu-card__desc {
          font: 400 11.5px/1.5 "Helvetica Neue", Helvetica, Arial, sans-serif;
          color: #2a2f3d;
          margin: 0;
          min-height: 66px;
        }
        .lu-card__key {
          position: absolute;
          right: 8px;
          bottom: 8px;
          background: #0b0d12;
          color: #fff;
          font: 800 10px/1 ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
          padding: 5px 8px 4px;
        }
        .lu-card.is-out {
          opacity: 0.16;
          filter: grayscale(1);
          pointer-events: none;
          transform: skewX(-5deg) translateY(16px) scale(0.96);
        }

        .lu-stamp {
          position: absolute;
          top: 44%;
          left: 50%;
          z-index: 5;
          background: #e11d48;
          color: #fff;
          font: 900 26px/1 "Helvetica Neue", Helvetica, Arial, sans-serif;
          font-style: italic;
          letter-spacing: 0.06em;
          padding: 12px 22px 14px;
          border: 3px solid #fff;
          box-shadow: 6px 6px 0 #0b0d12;
          transform: translate(-50%, -50%) rotate(-8deg) scale(2.8);
          opacity: 0;
          pointer-events: none;
          white-space: nowrap;
        }
        .lu-card.is-stamped .lu-stamp { animation: luStampSlam 280ms cubic-bezier(.2, 1.5, .4, 1) forwards; }
        @keyframes luStampSlam {
          0%   { opacity: 0; transform: translate(-50%, -50%) rotate(-8deg) scale(2.8); }
          55%  { opacity: 1; transform: translate(-50%, -50%) rotate(-8deg) scale(0.92); }
          100% { opacity: 1; transform: translate(-50%, -50%) rotate(-8deg) scale(1); }
        }
        .lu-shock {
          position: absolute;
          inset: 0;
          border: 4px solid #e11d48;
          opacity: 0;
          pointer-events: none;
        }
        .lu-card.is-stamped .lu-shock { animation: luShockwave 520ms cubic-bezier(.2, .7, .3, 1) forwards; }
        @keyframes luShockwave {
          0%   { opacity: 0.95; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.45); }
        }

        /* ---- vuelo al centro + temblor ---- */
        .lu-card.is-flying {
          position: fixed;
          margin: 0;
          z-index: 45;
          transition: transform 420ms cubic-bezier(.3, 1.1, .3, 1), box-shadow 420ms ease;
        }
        .lu-card.is-flying:hover { transform: var(--fly-transform); }
        .lu-card.is-trembling { animation: luTremble 130ms linear infinite; }
        @keyframes luTremble {
          0%   { margin-top: 0px; margin-left: 0px; }
          25%  { margin-top: -3px; margin-left: 2px; }
          50%  { margin-top: 2px; margin-left: -3px; }
          75%  { margin-top: -2px; margin-left: -1px; }
          100% { margin-top: 0px; margin-left: 0px; }
        }

        /* ---- panel de ranuras ---- */
        .lu-replace {
          position: absolute;
          inset: 0;
          z-index: 40;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-end;
          padding-bottom: 5vh;
          background: rgba(11, 13, 18, 0.82);
        }
        .lu-replace__banner {
          position: absolute;
          top: 5vh;
          left: 50%;
          transform: translateX(-50%) rotate(-2.5deg);
          background: #e11d48;
          color: #fff;
          font: 900 italic clamp(20px, 3vw, 38px)/1 "Helvetica Neue", Helvetica, Arial, sans-serif;
          letter-spacing: 0.01em;
          padding: 12px 34px 16px;
          box-shadow: 8px 8px 0 #fff;
          white-space: nowrap;
          animation: luBannerDrop 360ms cubic-bezier(.2, 1.3, .4, 1) backwards;
        }
        @keyframes luBannerDrop {
          from { opacity: 0; transform: translateX(-50%) translateY(-90px) rotate(-2.5deg); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0) rotate(-2.5deg); }
        }
        .lu-replace__slots { display: flex; gap: 2.4vw; }
        .lu-slot {
          position: relative;
          width: min(250px, 22vw);
          background: #f1f1ed;
          border: 3px solid #fff;
          box-shadow: 7px 7px 0 #22d3ee;
          padding: 16px 16px 14px;
          cursor: pointer;
          transform: skewX(-5deg);
          transition: transform 140ms cubic-bezier(.2, .9, .3, 1), box-shadow 140ms ease;
          animation: luSlotRise 380ms cubic-bezier(.2, 1.2, .35, 1) backwards;
          text-align: left;
        }
        .lu-slot:nth-child(1) { animation-delay: 120ms; }
        .lu-slot:nth-child(2) { animation-delay: 210ms; }
        .lu-slot:nth-child(3) { animation-delay: 300ms; }
        @keyframes luSlotRise {
          from { opacity: 0; transform: skewX(-5deg) translateY(70px); }
          to   { opacity: 1; transform: skewX(-5deg) translateY(0); }
        }
        .lu-slot:hover, .lu-slot.is-pad-focus {
          transform: skewX(-5deg) translateY(-10px) scale(1.05);
          box-shadow: 11px 11px 0 #e11d48;
          border-color: #e11d48;
          outline: 4px solid #22d3ee;
          outline-offset: 4px;
        }
        .lu-slot__idx {
          position: absolute;
          top: -3px;
          left: -3px;
          background: #0b0d12;
          color: #fff;
          font: 800 11px/1 ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
          padding: 6px 9px 5px;
        }
        .lu-slot__name {
          font-size: 17px;
          font-weight: 900;
          font-style: italic;
          text-transform: uppercase;
          line-height: 1.05;
          margin: 14px 0 6px;
          color: #0b0d12;
        }
        .lu-slot__lv {
          font: 800 11px/1 ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
          letter-spacing: 0.14em;
          color: #2a2f3d;
          margin: 0;
        }
        .lu-replace__esc {
          position: absolute;
          top: calc(5vh + 74px);
          left: 50%;
          transform: translateX(-50%) rotate(-2.5deg);
          background: transparent;
          border: 2px solid rgba(255, 255, 255, 0.55);
          color: rgba(255, 255, 255, 0.75);
          font: 800 10px/1 ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
          letter-spacing: 0.22em;
          padding: 7px 12px 6px;
          cursor: pointer;
        }
        .lu-replace__esc:hover { border-color: #fff; color: #fff; }

        /* ---- flash ---- */
        .lu-flash {
          position: absolute;
          inset: 0;
          z-index: 60;
          background: #fff;
          opacity: 0;
          pointer-events: none;
          animation: luFlashBang 240ms steps(3) forwards;
        }
        @keyframes luFlashBang { 0% { opacity: 0.95; } 100% { opacity: 0; } }

        /* ---- iris de cierre ---- */
        .lu-root.is-closing {
          animation: luIris 700ms cubic-bezier(.7, 0, .25, 1) forwards;
        }
        @keyframes luIris {
          from { clip-path: circle(120vmax at 50% 46%); }
          to   { clip-path: circle(2.8vmin at 50% 46%); }
        }
        .lu-iris-ring {
          position: absolute;
          left: 50%;
          top: 46%;
          width: 10vmin;
          height: 10vmin;
          margin: -5vmin 0 0 -5vmin;
          border: 0.55vmin solid #e11d48;
          border-radius: 50%;
          z-index: 65;
          pointer-events: none;
          animation: luIrisRing 700ms cubic-bezier(.7, 0, .25, 1) forwards;
        }
        @keyframes luIrisRing {
          from { transform: scale(12); opacity: 1; }
          to   { transform: scale(0.28); opacity: 1; }
        }
        .lu-iris-dot {
          position: absolute;
          left: 50%;
          top: 46%;
          width: 2.4vmin;
          height: 2.4vmin;
          margin: -1.2vmin 0 0 -1.2vmin;
          background: #f1f1ed;
          border: 0.3vmin solid #e11d48;
          border-radius: 50%;
          z-index: 66;
          pointer-events: none;
          opacity: 0;
          animation: luIrisDot 420ms ease-in 680ms forwards;
        }
        @keyframes luIrisDot {
          0%   { opacity: 0; transform: scale(0.4); }
          30%  { opacity: 1; transform: scale(1); }
          60%  { opacity: 1; transform: scale(1.55); }
          100% { opacity: 0; transform: scale(0); }
        }
      `}</style>
    </div>
  );
}
