import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { createDomeArenaBackdrop } from '@/game/render/domeArenaScene';
import { loadNyxRigged, type LoadedNyx } from '@/game/render/nyxModelLoader';
import { createDomeSlabs } from '@/game/dome/DomeSlabs';
import { createTestEnemySpheres } from '@/game/dome/TestEnemySpheres';
import { MotionVfxSystem } from '@/game/dome/MotionVfx';
import { NyxDomeController } from '@/game/dome/NyxDomeController';
import type { DomeHudState } from '@/game/dome/domeTypes';
import type { GameSettings } from '@/game/settings';
import { SynthAudio } from '@/game/audio/SynthAudio';
import DomeHudSketch from '@/ui/DomeHudSketch';

interface DomeGameViewProps {
  settings: GameSettings;
  onExit: () => void;
}

const INITIAL_HUD: DomeHudState = {
  hp: 100,
  maxHp: 100,
  eden: 100,
  maxEden: 100,
  exp: 0,
  expToNext: 1,
  level: 1,
  speed: 0,
  drillThreshold: 14.5,
  isDrillReady: false,
  speedLinesIntensity: 0,
  mode: 'floating',
  speedAttackKind: null,
  pointerLocked: false,
  reticleLockState: 'none',
  lockedEnemyScreenPos: null,
  bulletTimeActive: false,
  bulletTimeRemaining: 0,
  activeSlot: 1,
  slots: [
    { keyLabel: '1', name: null, level: 0 },
    { keyLabel: '2', name: null, level: 0 },
    { keyLabel: '3', name: null, level: 0 },
  ],
  domeBounceFlash: 0,
  impactFlash: 0,
  cameraRollDeg: 0,
  gyroSpinRad: 0,
};

export default function DomeGameView({ settings, onExit }: DomeGameViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const controllerRef = useRef<NyxDomeController | null>(null);
  const audioRef = useRef<SynthAudio | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const [hud, setHud] = useState<DomeHudState>(INITIAL_HUD);

  useEffect(() => {
    controllerRef.current?.applySettings(settings);
    audioRef.current?.setVolumeMultiplier(settings.masterVolume);
  }, [settings]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight, false);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      settingsRef.current.baseFov,
      window.innerWidth / window.innerHeight,
      0.1,
      2500,
    );

    const sun = new THREE.DirectionalLight(0xdbeafe, 1.5);
    sun.position.set(60, 120, 40);
    scene.add(sun);
    scene.add(new THREE.AmbientLight(0x818cf8, 0.65));

    const backdrop = createDomeArenaBackdrop(scene);
    const slabRig = createDomeSlabs(scene);
    const enemyMgr = createTestEnemySpheres(scene);
    const vfx = new MotionVfxSystem(scene);
    const audio = new SynthAudio();
    audio.setVolumeMultiplier(settingsRef.current.masterVolume);
    audioRef.current = audio;

    let loadedNyx: LoadedNyx | null = null;
    let controller: NyxDomeController | null = null;
    let disposed = false;

    loadNyxRigged()
      .then((nyx) => {
        if (disposed) {
          nyx.dispose();
          return;
        }
        loadedNyx = nyx;
        // Posicionada justo sobre la plataforma central para aterrizar o flotar desde el inicio
        nyx.root.position.set(0, -1.8, 0);
        scene.add(nyx.root);
        controller = new NyxDomeController(
          nyx.root,
          nyx.animator,
          vfx,
          settingsRef.current,
          audio,
        );
        controllerRef.current = controller;
        setHud(controller.getHudState());
      })
      .catch((err) => {
        console.error('Failed to load NYX model:', err);
      });

    const onCanvasClick = () => {
      audio.unlock();
      if (document.pointerLockElement !== canvas) {
        canvas.requestPointerLock?.();
      }
    };

    const onPointerLockChange = () => {
      const locked = document.pointerLockElement === canvas;
      controller?.setPointerLocked(locked);
      if (controller) setHud(controller.getHudState());
    };

    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvas) return;
      controller?.onMouseMove(e.movementX, e.movementY);
    };

    const onMouseDown = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvas) return;
      controller?.onMouseDown(e.button);
    };

    const onMouseUp = (e: MouseEvent) => {
      controller?.onMouseUp(e.button);
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      controller?.onKeyDown(e.code);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      controller?.onKeyUp(e.code);
    };

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight, false);
    };

    canvas.addEventListener('click', onCanvasClick);
    canvas.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', onResize);

    let last = performance.now();
    let elapsed = 0;
    let hudTimer = 0;
    let raf = 0;

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const now = performance.now();
      const rawDt = Math.min((now - last) / 1000, 0.05);
      last = now;

      const timeScale = controller ? controller.getTimeScale() : 1.0;
      const worldDt = rawDt * timeScale;
      elapsed += worldDt;

      if (loadedNyx) {
        loadedNyx.universeMat.uniforms.uTime.value = elapsed;
      }

      backdrop.update(worldDt, elapsed);

      if (controller) {
        const { didEnemyEvadeDash } = enemyMgr.update(
          worldDt,
          elapsed,
          controller.getPosition(),
          controller.getLockedEnemy(),
          controller.getAttackAccelTime(),
        );
        if (didEnemyEvadeDash) {
          controller.notifyEnemyEvaded();
        }
        controller.update(
          rawDt,
          slabRig.slabs,
          camera,
          enemyMgr.enemies,
          (enemy, hitDir, isDrill, impactSpeed) =>
            enemyMgr.onHitEnemy(enemy, hitDir, isDrill, impactSpeed),
        );
        hudTimer += rawDt;
        if (hudTimer >= 1 / 30) {
          hudTimer = 0;
          setHud(controller.getHudState());
        }
      } else {
        camera.position.set(0, 2.8, 7.5);
        camera.lookAt(0, 1.0, 0);
      }

      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      if (document.pointerLockElement === canvas) {
        document.exitPointerLock?.();
      }
      canvas.removeEventListener('click', onCanvasClick);
      canvas.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', onResize);
      controllerRef.current = null;
      audioRef.current = null;
      loadedNyx?.dispose();
      enemyMgr.dispose();
      vfx.dispose();
      slabRig.dispose();
      backdrop.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#040510]">
      <canvas ref={canvasRef} className="block h-full w-full cursor-none" />
      <DomeHudSketch hud={hud} onExit={onExit} />
    </div>
  );
}
