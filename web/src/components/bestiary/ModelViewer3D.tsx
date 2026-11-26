import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Zap } from 'lucide-react';
import type { EntityArchiveSpec } from '../../data/enemiesData';
import { NYX_PALETTES, type NyxPaletteSpec } from '../../data/nyxData';
import { useWebI18n } from '../../i18n/useWebI18n';
import {
  BUTTERFLY_QUARTZ_FRAG,
  BUTTERFLY_QUARTZ_VERT,
  ENEMY_NEBULA_FRAG,
  ENEMY_NEBULA_VERT,
  INVERTED_HULL_FRAG,
  INVERTED_HULL_VERT,
  NYX_FRAG,
  NYX_VERT,
  STAR_CORE_FRAG,
  srgbVec3,
} from '../../shaders/cosmicShaders';

interface ModelViewer3DProps {
  entity: EntityArchiveSpec;
  activeClip: string;
  onSelectClip: (clip: string) => void;
}

export default function ModelViewer3D({ entity, activeClip, onSelectClip }: ModelViewer3DProps) {
  const { t } = useWebI18n();
  const hostRef = useRef<HTMLDivElement | null>(null);

  const [paletteId, setPaletteId] = useState<NyxPaletteSpec['id']>('raven_nebula');
  const [whiteInk, setWhiteInk] = useState(true);
  const [autoRotate, setAutoRotate] = useState(true);
  const [xrayActive, setXrayActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [speedlinesFlash, setSpeedlinesFlash] = useState(false);

  const uniformsRef = useRef<{
    fleshMats: THREE.ShaderMaterial[];
    nyxMat: THREE.ShaderMaterial | null;
    outlineMeshes: THREE.Object3D[];
    mixer: THREE.AnimationMixer | null;
    actions: Map<string, THREE.AnimationAction>;
    currentAction: THREE.AnimationAction | null;
  }>({
    fleshMats: [],
    nyxMat: null,
    outlineMeshes: [],
    mixer: null,
    actions: new Map(),
    currentAction: null,
  });

  const autoRotateRef = useRef(autoRotate);
  autoRotateRef.current = autoRotate;
  const xrayRef = useRef(xrayActive);
  xrayRef.current = xrayActive;

  useEffect(() => {
    setXrayActive(false);
  }, [entity.id]);

  // Actualiza paleta de Nyx sin recargar el GLB
  useEffect(() => {
    const nyxMat = uniformsRef.current.nyxMat;
    if (!nyxMat) return;
    const p = NYX_PALETTES.find((x) => x.id === paletteId) ?? NYX_PALETTES[0];
    nyxMat.uniforms.uDeepColor.value.copy(srgbVec3(p.deep));
    nyxMat.uniforms.uNebulaA.value.copy(srgbVec3(p.nebulaA));
    nyxMat.uniforms.uNebulaB.value.copy(srgbVec3(p.nebulaB));
    nyxMat.uniforms.uRimColor.value.copy(srgbVec3(p.rim));
  }, [paletteId]);

  // Toggle de tinta blanca
  useEffect(() => {
    for (const m of uniformsRef.current.outlineMeshes) {
      m.visible = whiteInk;
    }
  }, [whiteInk]);

  // Reproduce clip seleccionado con crossfade 0.12s
  useEffect(() => {
    const { actions, currentAction } = uniformsRef.current;
    if (!activeClip || actions.size === 0) return;
    const next = actions.get(activeClip);
    if (!next || next === currentAction) return;
    next.reset();
    next.play();
    if (currentAction) {
      currentAction.crossFadeTo(next, 0.12, true);
    }
    uniformsRef.current.currentAction = next;
  }, [activeClip]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(host.clientWidth || 560, host.clientHeight || 460);
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      30,
      Math.max(1, host.clientWidth) / Math.max(1, host.clientHeight),
      0.1,
      200,
    );
    camera.position.set(0, 1.4, 5.2);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.enablePan = false;
    controls.minPolarAngle = 0.25;
    controls.maxPolarAngle = Math.PI - 0.25;
    controls.minDistance = 2.0;
    controls.maxDistance = 12.0;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.6;

    scene.add(new THREE.AmbientLight(0x818cf8, 0.9));
    const key = new THREE.DirectionalLight(0xdbeafe, 1.6);
    key.position.set(5, 8, 6);
    scene.add(key);

    let disposed = false;
    const disposables: { geos: THREE.BufferGeometry[]; mats: THREE.Material[] } = {
      geos: [],
      mats: [],
    };
    uniformsRef.current.fleshMats = [];
    uniformsRef.current.nyxMat = null;
    uniformsRef.current.outlineMeshes = [];
    uniformsRef.current.actions = new Map();
    uniformsRef.current.currentAction = null;
    uniformsRef.current.mixer = null;

    setLoading(true);
    const loader = new GLTFLoader();
    loader
      .loadAsync(entity.modelPath)
      .then((gltf) => {
        if (disposed) return;
        const root = gltf.scene;

        const isNyx = entity.id === 'nyx';
        const isButterfly = entity.id === 'lightning_butterfly';
        const p = NYX_PALETTES.find((x) => x.id === paletteId) ?? NYX_PALETTES[0];

        const nyxMat = isNyx
          ? new THREE.ShaderMaterial({
              vertexShader: NYX_VERT,
              fragmentShader: NYX_FRAG,
              uniforms: {
                uDeepColor: { value: srgbVec3(p.deep) },
                uNebulaA: { value: srgbVec3(p.nebulaA) },
                uNebulaB: { value: srgbVec3(p.nebulaB) },
                uRimColor: { value: srgbVec3(p.rim) },
                uTime: { value: 0 },
                uGravityShift: { value: 0.75 },
                uSpeed01: { value: 0.5 },
              },
              transparent: true,
              depthWrite: true,
            })
          : null;

        if (nyxMat) {
          uniformsRef.current.nyxMat = nyxMat;
          disposables.mats.push(nyxMat);
        }

        const starCoreMat = new THREE.ShaderMaterial({
          vertexShader: NYX_VERT,
          fragmentShader: STAR_CORE_FRAG,
          uniforms: { uTime: { value: 0 } },
        });
        disposables.mats.push(starCoreMat);

        const eyeMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });
        const detailMat = new THREE.MeshStandardMaterial({
          color: 0x241d38,
          emissive: 0x1e1b4b,
          roughness: 0.45,
        });
        disposables.mats.push(eyeMat, detailMat);

        const outlinePairs: Array<{ mesh: THREE.Mesh; thickness: number; inkColor: number }> = [];

        root.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.frustumCulled = false;
          disposables.geos.push(mesh.geometry);
          const name = mesh.name.toLowerCase();

          if (isNyx) {
            if (name === 'nyx_eyes') {
              mesh.material = eyeMat;
            } else if (nyxMat) {
              mesh.material = nyxMat;
              const th = name === 'nyx_body' ? 0.015 : name === 'nyx_hair' ? 0.011 : 0.008;
              outlinePairs.push({ mesh, thickness: th, inkColor: 0xffffff });
            }
          } else if (name.includes('star_core')) {
            mesh.material = starCoreMat;
            mesh.renderOrder = 2;
          } else if (name.includes('detail')) {
            mesh.material = detailMat;
          } else {
            const fleshMat = isButterfly
              ? new THREE.ShaderMaterial({
                  vertexShader: BUTTERFLY_QUARTZ_VERT,
                  fragmentShader: BUTTERFLY_QUARTZ_FRAG,
                  uniforms: {
                    uTime: { value: 0 },
                    uCharge: { value: 0.65 },
                    uFleshPeel: { value: 0 },
                  },
                  transparent: true,
                  depthWrite: true,
                })
              : new THREE.ShaderMaterial({
                  vertexShader: ENEMY_NEBULA_VERT,
                  fragmentShader: ENEMY_NEBULA_FRAG,
                  uniforms: {
                    uColorA: { value: new THREE.Color(entity.colorHex) },
                    uColorB: { value: new THREE.Color(entity.rimHex) },
                    uRimColor: { value: new THREE.Color(entity.rimHex) },
                    uTime: { value: 0 },
                    uOpacity: { value: entity.id === 'abyssal_cell' ? 0.62 : 0.78 },
                    uFleshPeel: { value: 0 },
                  },
                  transparent: true,
                  depthWrite: true,
                });
            mesh.material = fleshMat;
            uniformsRef.current.fleshMats.push(fleshMat);
            disposables.mats.push(fleshMat);
            outlinePairs.push({ mesh, thickness: 0.032, inkColor: 0xffffff });
          }
        });

        for (const pair of outlinePairs) {
          const outMat = new THREE.ShaderMaterial({
            side: THREE.BackSide,
            uniforms: {
              uThickness: { value: pair.thickness },
              uNoiseAmp: { value: 0.25 },
              uInkColor: { value: new THREE.Color(pair.inkColor) },
            },
            vertexShader: INVERTED_HULL_VERT,
            fragmentShader: INVERTED_HULL_FRAG,
          });
          disposables.mats.push(outMat);
          const sk = pair.mesh as THREE.SkinnedMesh;
          const outMesh = sk.isSkinnedMesh
            ? (() => {
                const clone = new THREE.SkinnedMesh(sk.geometry, outMat);
                clone.bind(sk.skeleton, sk.bindMatrix);
                return clone;
              })()
            : new THREE.Mesh(pair.mesh.geometry, outMat);
          outMesh.frustumCulled = false;
          outMesh.visible = whiteInk;
          uniformsRef.current.outlineMeshes.push(outMesh);
          (pair.mesh.parent ?? root).add(outMesh);
        }

        // Encuadra automáticamente cualquier modelo según su caja envolvente
        const box = new THREE.Box3().setFromObject(root);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);
        const maxDim = Math.max(size.x, size.y, size.z, 0.5);
        const normScale = 2.4 / maxDim;
        root.scale.setScalar(normScale);
        root.position.copy(center).multiplyScalar(-normScale);
        scene.add(root);

        if (gltf.animations && gltf.animations.length > 0) {
          const mixer = new THREE.AnimationMixer(root);
          uniformsRef.current.mixer = mixer;
          for (const clip of gltf.animations) {
            uniformsRef.current.actions.set(clip.name, mixer.clipAction(clip));
          }
          const initialName = activeClip && uniformsRef.current.actions.has(activeClip)
            ? activeClip
            : gltf.animations[0].name;
          const act = uniformsRef.current.actions.get(initialName);
          if (act) {
            act.play();
            uniformsRef.current.currentAction = act;
          }
        }
        setLoading(false);
      })
      .catch(() => {
        if (!disposed) setLoading(false);
      });

    let visible = true;
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    io.observe(host);

    const onResize = () => {
      const w = host.clientWidth || 560;
      const h = host.clientHeight || 460;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    let raf = 0;
    let last = performance.now();
    const startClock = last;
    let currentPeel = 0;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (!visible) {
        last = now;
        return;
      }
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const elapsed = (now - startClock) / 1000;

      controls.autoRotate = autoRotateRef.current;
      controls.update();

      const targetPeel = xrayRef.current ? 0.94 : 0.0;
      currentPeel += (targetPeel - currentPeel) * Math.min(1, dt * 8);

      if (uniformsRef.current.nyxMat) {
        uniformsRef.current.nyxMat.uniforms.uTime.value = elapsed;
      }
      for (const mat of uniformsRef.current.fleshMats) {
        if (mat.uniforms.uTime) mat.uniforms.uTime.value = elapsed;
        if (mat.uniforms.uFleshPeel) mat.uniforms.uFleshPeel.value = currentPeel;
      }
      if (uniformsRef.current.mixer) {
        uniformsRef.current.mixer.update(dt);
      }

      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      io.disconnect();
      controls.dispose();
      uniformsRef.current.mixer?.stopAllAction();
      disposables.geos.forEach((g) => g.dispose());
      disposables.mats.forEach((m) => m.dispose());
      renderer.dispose();
      if (renderer.domElement.parentNode === host) {
        host.removeChild(renderer.domElement);
      }
    };
  }, [entity.id, entity.modelPath]);

  const toggleXray = () => {
    const next = !xrayActive;
    setXrayActive(next);
    if (next) {
      setSpeedlinesFlash(true);
      window.setTimeout(() => setSpeedlinesFlash(false), 650);
      if (entity.hitClip) onSelectClip(entity.hitClip);
    } else if (entity.clips[0]) {
      onSelectClip(entity.clips[0]);
    }
  };

  return (
    <div className="border-4 border-[#0b0d12] bg-[#05010f] shadow-[10px_10px_0_#22d3ee]">
      <div className="relative h-[38vh] min-h-[280px] w-full overflow-hidden lg:h-[460px]">
        <div
          ref={hostRef}
          className="cosmic-grid h-full w-full touch-pan-y"
          style={{ touchAction: 'pan-y' }}
        />

        {speedlinesFlash && (
          <div className="speedlines-overlay pointer-events-none absolute inset-0 border-4 border-[#22d3ee] opacity-90" />
        )}

        {loading && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#05010f]/75">
            <span className="border-2 border-[#22d3ee] bg-[#0d0a1f] px-4 py-2 font-kicker text-xs text-[#22d3ee]">
              {t.bestiary.loadingModel} ({entity.id}.glb)
            </span>
          </div>
        )}

        <div className="pointer-events-none absolute left-3 top-3 border border-slate-700 bg-[#05010f]/80 px-2.5 py-1 font-kicker text-[10px] text-slate-300">
          {entity.fileNo} · {entity.modelPath.replace('/models/', '')}
        </div>
        <div className="pointer-events-none absolute bottom-3 right-3 border border-slate-700 bg-[#05010f]/80 px-2.5 py-1 font-kicker text-[10px] text-slate-400">
          {t.bestiary.dragHint}
        </div>
      </div>

      {/* Controles del visor */}
      <div className="flex flex-col gap-3 border-t-[3px] border-[#0b0d12] bg-[#0d0a1f] p-3 text-white sm:p-4">
        {entity.id === 'nyx' ? (
          <div className="flex flex-wrap items-center gap-2">
            {NYX_PALETTES.map((p) => {
              const active = paletteId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPaletteId(p.id)}
                  className={`flex items-center gap-2 border-2 px-2.5 py-1.5 font-kicker text-[10px] transition ${
                    active
                      ? 'border-[#22d3ee] bg-[#1e1038] text-white'
                      : 'border-slate-700 bg-[#05010f] text-slate-300 hover:border-slate-500'
                  }`}
                >
                  <span
                    className="inline-block h-3 w-3 border border-white"
                    style={{ background: `linear-gradient(135deg, ${p.nebulaA}, ${p.nebulaB})` }}
                  />
                  <span>{p.name}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <button
            type="button"
            onClick={toggleXray}
            className={`flex w-full items-center justify-center gap-2 border-2 px-4 py-2.5 font-comic text-base transition ${
              xrayActive
                ? 'border-[#fbbf24] bg-[#fbbf24] text-[#0b0d12] shadow-[4px_4px_0_#e11d48]'
                : 'border-[#22d3ee] bg-[#05010f] text-[#22d3ee] hover:bg-[#1e1038]'
            }`}
          >
            <Zap className="h-4 w-4" />
            <span>{xrayActive ? t.bestiary.xrayOn : t.bestiary.xrayOff}</span>
          </button>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setWhiteInk((v) => !v)}
              className={`border-2 px-2.5 py-1 font-kicker text-[10px] ${
                whiteInk ? 'border-white bg-white text-[#0b0d12]' : 'border-slate-600 text-slate-400'
              }`}
            >
              {t.bestiary.whiteInk}
            </button>
            <button
              type="button"
              onClick={() => setAutoRotate((v) => !v)}
              className={`border-2 px-2.5 py-1 font-kicker text-[10px] ${
                autoRotate ? 'border-[#22d3ee] bg-[#22d3ee]/20 text-[#22d3ee]' : 'border-slate-600 text-slate-400'
              }`}
            >
              {t.bestiary.autoRotate}
            </button>
          </div>
          {activeClip && (
            <span className="font-kicker text-[10px] text-[#fbbf24]">▶ {activeClip}</span>
          )}
        </div>
      </div>
    </div>
  );
}
