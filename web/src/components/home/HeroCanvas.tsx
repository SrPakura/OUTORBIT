import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { NYX_PALETTES } from '../../data/nyxData';
import {
  DIVIDER_FRAG,
  DIVIDER_VERT,
  INVERTED_HULL_FRAG,
  INVERTED_HULL_VERT,
  NYX_FRAG,
  NYX_VERT,
  SKY_FRAG,
  SKY_VERT,
  STARS_FRAG,
  STARS_VERT,
  srgbVec3,
} from '../../shaders/cosmicShaders';

export default function HeroCanvas() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.autoClear = false;
    renderer.setSize(host.clientWidth || 640, host.clientHeight || 560);
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      34,
      Math.max(1, host.clientWidth) / Math.max(1, host.clientHeight),
      0.1,
      2000,
    );
    camera.position.set(0.35, 1.05, 4.1);
    camera.lookAt(0, 0.85, 0);

    // Bóveda espacial
    const skyGeo = new THREE.SphereGeometry(700, 24, 16);
    const skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
    });
    scene.add(new THREE.Mesh(skyGeo, skyMat));

    // Estrellas de 4 puntas (0x22d3ee, 0xf8fafc, 0xfbbf24, 0xf43f5e)
    const starCount = 180;
    const starPos = new Float32Array(starCount * 3);
    const starCol = new Float32Array(starCount * 3);
    const starSize = new Float32Array(starCount);
    const starSeed = new Float32Array(starCount);
    const palette = [
      new THREE.Color(0x22d3ee),
      new THREE.Color(0xf8fafc),
      new THREE.Color(0xfbbf24),
      new THREE.Color(0xf43f5e),
    ];
    for (let i = 0; i < starCount; i++) {
      const r = 18 + Math.random() * 85;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = r * Math.cos(phi);
      starPos[i * 3 + 2] = -Math.abs(r * Math.sin(phi) * Math.sin(theta)) - 6;
      const c = palette[i % palette.length];
      starCol[i * 3] = c.r;
      starCol[i * 3 + 1] = c.g;
      starCol[i * 3 + 2] = c.b;
      starSize[i] = 0.7 + Math.random() * 1.4;
      starSeed[i] = Math.random() * 10;
    }
    const starsGeo = new THREE.BufferGeometry();
    starsGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    starsGeo.setAttribute('aColor', new THREE.BufferAttribute(starCol, 3));
    starsGeo.setAttribute('aSize', new THREE.BufferAttribute(starSize, 1));
    starsGeo.setAttribute('aSeed', new THREE.BufferAttribute(starSeed, 1));
    const starsMat = new THREE.ShaderMaterial({
      vertexShader: STARS_VERT,
      fragmentShader: STARS_FRAG,
      uniforms: { uTime: { value: 0 }, uPixelScale: { value: 420 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    scene.add(new THREE.Points(starsGeo, starsMat));

    // Divisor Líquido en borde izquierdo (visible en escritorio para fundir Papel -> Cosmos)
    const divScene = new THREE.Scene();
    const divCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    divCam.position.z = 1;
    const divGeo = new THREE.PlaneGeometry(2, 2);
    const divMat = new THREE.ShaderMaterial({
      vertexShader: DIVIDER_VERT,
      fragmentShader: DIVIDER_FRAG,
      uniforms: { uTime: { value: 0 }, uAspect: { value: 1 } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    divScene.add(new THREE.Mesh(divGeo, divMat));

    const p = NYX_PALETTES[0];
    const nyxMat = new THREE.ShaderMaterial({
      vertexShader: NYX_VERT,
      fragmentShader: NYX_FRAG,
      uniforms: {
        uDeepColor: { value: srgbVec3(p.deep) },
        uNebulaA: { value: srgbVec3(p.nebulaA) },
        uNebulaB: { value: srgbVec3(p.nebulaB) },
        uRimColor: { value: srgbVec3(p.rim) },
        uTime: { value: 0 },
        uGravityShift: { value: 0.85 },
        uSpeed01: { value: 0.65 },
      },
      transparent: true,
      depthWrite: true,
    });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });

    const loader = new GLTFLoader();
    let disposed = false;
    let modelRoot: THREE.Group | null = null;
    let mixer: THREE.AnimationMixer | null = null;
    const extraGeos: THREE.BufferGeometry[] = [];
    const extraMats: THREE.Material[] = [nyxMat, eyeMat];

    Promise.all([
      loader.loadAsync('/models/nyx_rigged.glb'),
      loader.loadAsync('/models/nyx_zero_g_float.glb').catch(() => null),
    ])
      .then(([gltf, floatGltf]) => {
        if (disposed) return;
        modelRoot = gltf.scene;
        modelRoot.traverse((obj) => {
          const mesh = obj as THREE.SkinnedMesh;
          if (!mesh.isMesh) return;
          mesh.frustumCulled = false;
          extraGeos.push(mesh.geometry);
          if (mesh.name === 'nyx_eyes') {
            mesh.material = eyeMat;
          } else {
            mesh.material = nyxMat;
            const thickness =
              mesh.name === 'nyx_body' ? 0.015 : mesh.name === 'nyx_hair' ? 0.011 : 0.008;
            const outlineMat = new THREE.ShaderMaterial({
              side: THREE.BackSide,
              uniforms: {
                uThickness: { value: thickness },
                uNoiseAmp: { value: 0.2 },
                uInkColor: { value: new THREE.Color(0xffffff) },
              },
              vertexShader: INVERTED_HULL_VERT,
              fragmentShader: INVERTED_HULL_FRAG,
            });
            extraMats.push(outlineMat);
            const outline = mesh.isSkinnedMesh
              ? (() => {
                  const sk = new THREE.SkinnedMesh(mesh.geometry, outlineMat);
                  sk.bind(mesh.skeleton, mesh.bindMatrix);
                  return sk;
                })()
              : new THREE.Mesh(mesh.geometry, outlineMat);
            outline.frustumCulled = false;
            (mesh.parent ?? modelRoot!).add(outline);
          }
        });

        modelRoot.position.set(0.25, -0.05, 0);
        scene.add(modelRoot);

        if (floatGltf?.animations?.[0]) {
          mixer = new THREE.AnimationMixer(modelRoot);
          mixer.clipAction(floatGltf.animations[0]).play();
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));

    let visible = true;
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    io.observe(host);

    const onResize = () => {
      const w = host.clientWidth || 640;
      const h = host.clientHeight || 560;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    let raf = 0;
    let last = performance.now();
    const clockStart = last;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (!visible) {
        last = now;
        return;
      }
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const elapsed = (now - clockStart) / 1000;

      starsMat.uniforms.uTime.value = elapsed;
      nyxMat.uniforms.uTime.value = elapsed;
      const w = host.clientWidth || 640;
      const h = host.clientHeight || 560;
      divMat.uniforms.uTime.value = elapsed;
      divMat.uniforms.uAspect.value = w / Math.max(1, h);

      if (mixer) mixer.update(dt);
      if (modelRoot) {
        modelRoot.position.y = -0.05 + Math.sin(elapsed * 1.4) * 0.08;
        modelRoot.rotation.y = -0.35 + Math.sin(elapsed * 0.55) * 0.22;
      }

      renderer.clear();
      renderer.render(scene, camera);
      if (w >= 768) {
        renderer.clearDepth();
        renderer.render(divScene, divCam);
      }
    };
    raf = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      io.disconnect();
      skyGeo.dispose();
      skyMat.dispose();
      starsGeo.dispose();
      starsMat.dispose();
      divGeo.dispose();
      divMat.dispose();
      extraGeos.forEach((g) => g.dispose());
      extraMats.forEach((m) => m.dispose());
      renderer.dispose();
      if (renderer.domElement.parentNode === host) {
        host.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div ref={hostRef} className="relative h-full min-h-[340px] w-full bg-[#05010f]">
      {!loaded && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="border-2 border-[#22d3ee] bg-[#05010f]/90 px-3 py-1.5 font-kicker text-[11px] text-[#22d3ee]">
            NYX_RIGGED.GLB // 0G SHADER...
          </span>
        </div>
      )}
      <div className="pointer-events-none absolute bottom-4 right-4 border border-[#22d3ee]/40 bg-[#05010f]/80 px-3 py-1 font-kicker text-[10px] text-[#3be8ff]">
        COSMIC NEBULA SHADER · REALTIME GLB
      </div>
    </div>
  );
}
