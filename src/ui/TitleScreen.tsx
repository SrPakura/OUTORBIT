import { useEffect, useRef, useState, type CSSProperties } from 'react';
import * as THREE from 'three';
import { fetchTopLeaderboard } from '@/api/leaderboard';
import type { LeaderboardEntryRecord } from '@/game/types';
import { createSpaceBackdrop } from '@/game/render/toonMaterials';
import { buildCharacterModel, buildKronosModel, buildPlanetModel } from '@/game/render/proceduralModels';
import { orientObjectOnSphere } from '@/game/math/spherical';

const STAR_FIELD_STYLE: CSSProperties = {
  backgroundImage:
    'radial-gradient(2px 2px at 20% 30%, #fff 50%, transparent 51%),' +
    'radial-gradient(1px 1px at 40% 70%, #c4b5fd 50%, transparent 51%),' +
    'radial-gradient(2px 2px at 60% 20%, #fff 50%, transparent 51%),' +
    'radial-gradient(1px 1px at 80% 50%, #67e8f9 50%, transparent 51%),' +
    'radial-gradient(1px 1px at 10% 80%, #fff 50%, transparent 51%),' +
    'radial-gradient(2px 2px at 90% 85%, #fff 50%, transparent 51%),' +
    'radial-gradient(1px 1px at 50% 45%, #fff 50%, transparent 51%),' +
    'radial-gradient(1px 1px at 33% 55%, #fbbf24 50%, transparent 51%)',
  backgroundSize: '450px 450px',
};

function formatTime(totalSec: number): string {
  const minutes = Math.floor(totalSec / 60);
  const seconds = Math.floor(totalSec % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

interface TitleScreenProps {
  onPlay: () => void;
}

/** Spec del planeta miniatura del diorama (Verdant reducido, con anillos). */
const DIORAMA_PLANET = {
  id: 'title-verdant',
  order: 0,
  name: 'Verdant',
  subtitle: 'Diorama',
  biome: 'verdant' as const,
  center: [0, 0, 0] as [number, number, number],
  radius: 6,
  gravityStrength: 22,
  surfaceColor: '#4ade80',
  patchColor: '#166534',
  atmosphereColor: '#7dd3fc',
  hasOrbitalRings: true,
  ringColor: '#c4b5fd',
  unlockedByPlanetId: null,
};

/**
 * Diorama 3D en vivo detrás de la portada: planeta miniatura con anillos y
 * asteroides, Kitsune en la cima y KRONOS en el horizonte opuesto, todo
 * rotando suavemente. Sin interacción de puntero (pointer-events: none) y
 * con limpieza total de recursos WebGL al desmontar.
 */
function useTitleDiorama(): React.RefObject<HTMLCanvasElement | null> {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight, false);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 4000);
    camera.position.set(0, 4, 24);
    camera.lookAt(0, 0, 0);

    const backdrop = createSpaceBackdrop(scene, '#05010f', '#6d28d9');

    // Luz direccional suave para los materiales cel (usan uSunDir global).
    const sun = new THREE.DirectionalLight(0xfff3d6, 1.4);
    sun.position.set(12, 18, 10);
    scene.add(sun);
    scene.add(new THREE.AmbientLight(0x8b7bd8, 0.55));

    // Conjunto rotatorio: planeta + personajes.
    const diorama = new THREE.Group();
    scene.add(diorama);

    const planet = buildPlanetModel(DIORAMA_PLANET);
    diorama.add(planet.group);

    // Kitsune en la cima del planeta, mirando tangencialmente.
    const kitsune = buildCharacterModel('kitsune');
    kitsune.scale.setScalar(1.15);
    orientObjectOnSphere(kitsune, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), DIORAMA_PLANET.radius);
    diorama.add(kitsune);

    // KRONOS en el horizonte opuesto (mitad inferior-trasera de la esfera).
    const kronos = buildKronosModel();
    kronos.group.scale.multiplyScalar(0.55);
    orientObjectOnSphere(
      kronos.group,
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.25, -0.75, -0.6).normalize(),
      DIORAMA_PLANET.radius
    );
    diorama.add(kronos.group);

    const onResize = (): void => {
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);

    let rafId = 0;
    let lastTime = performance.now();
    const animate = (): void => {
      rafId = requestAnimationFrame(animate);
      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      diorama.rotation.y += dt * 0.12;
      diorama.rotation.x = Math.sin(now * 0.00012) * 0.06;
      planet.animTick(dt);
      backdrop.update(dt, camera.position);
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      backdrop.dispose();
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else if (material) material.dispose();
      });
      renderer.dispose();
    };
  }, []);

  return canvasRef;
}

/**
 * Portada estilizada de OUTORBIT (estética cómic espacial) con diorama 3D en
 * vivo de fondo, botón JUGAR (sin login) y panel lateral con el Top 5 del
 * leaderboard de Base44.
 */
export default function TitleScreen({ onPlay }: TitleScreenProps) {
  const [topEntries, setTopEntries] = useState<LeaderboardEntryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const canvasRef = useTitleDiorama();

  useEffect(() => {
    let cancelled = false;
    fetchTopLeaderboard(5).then((entries) => {
      if (!cancelled) {
        setTopEntries(entries);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-gradient-to-b from-[#1a0b2e] via-[#2e1065] to-[#05010f] p-6"
      style={STAR_FIELD_STYLE}
    >
      {/* --- Diorama 3D en vivo (fondo, sin capturar clics) --- */}
      <canvas
        ref={canvasRef}
        className="pointer-events-none fixed inset-0 h-full w-full"
        aria-hidden="true"
      />

      <div className="relative z-10 flex w-full max-w-5xl items-center justify-between gap-10">
        {/* --- Columna principal --- */}
        <div className="flex-1">
          <p className="mb-2 text-sm font-bold tracking-[0.5em] text-cyan-300 drop-shadow-[0_2px_0_#0b0b14]">
            GRAVEDAD ESFÉRICA · SIGILO · ESCUADRÓN
          </p>
          <h1
            className="mb-4 text-7xl font-black italic tracking-tight text-transparent md:text-8xl"
            style={{
              backgroundImage: 'linear-gradient(180deg, #fde047 0%, #f97316 55%, #dc2626 100%)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              WebkitTextStroke: '3px #0b0b14',
              filter: 'drop-shadow(8px 8px 0 #0b0b14)',
            }}
          >
            OUTORBIT
          </h1>
          <p className="mb-8 max-w-md text-sm leading-relaxed text-slate-100 drop-shadow-[0_1px_2px_rgba(5,1,15,0.9)]">
            Camina sobre planetas esféricos sin límites. Cambia entre{' '}
            <span className="font-bold text-orange-400">Kitsune</span>,{' '}
            <span className="font-bold text-yellow-400">Digger</span> y{' '}
            <span className="font-bold text-cyan-400">Axel</span>, y usa el{' '}
            <span className="font-bold text-violet-300">GRAVITY SHIFT</span> para
            saltar de un mundo al siguiente.
          </p>

          <button
            type="button"
            onClick={onPlay}
            className="cursor-pointer rounded-xl border-4 border-black bg-yellow-400 px-12 py-4 text-2xl font-black tracking-widest text-black shadow-[8px_8px_0_#000] transition-transform hover:-translate-y-1 hover:bg-yellow-300 active:translate-y-0 active:shadow-[4px_4px_0_#000]"
          >
            JUGAR
          </button>

          <div className="mt-8 flex flex-wrap gap-x-5 gap-y-1 text-xs font-semibold text-slate-200 drop-shadow-[0_1px_2px_rgba(5,1,15,0.9)]">
            <span>WASD Mover</span>
            <span>ESPACIO Salto x2</span>
            <span>SHIFT Sprint</span>
            <span>1/2/3 Escuadrón</span>
            <span>CLIC DER. Gravity Shift</span>
          </div>
        </div>

        {/* --- Panel lateral: Top 5 (vidrio espacial translúcido) --- */}
        <aside className="w-72 shrink-0 rounded-2xl border-4 border-black bg-[#160b2e]/55 p-5 shadow-[8px_8px_0_#000] backdrop-blur-md">
          <h2 className="mb-4 border-b-2 border-violet-500 pb-2 text-sm font-black tracking-[0.3em] text-violet-300">
            TOP PILOTOS
          </h2>
          {loading ? (
            <p className="py-6 text-center text-xs text-slate-300">Cargando...</p>
          ) : topEntries.length === 0 ? (
            <p className="py-6 text-center text-xs leading-relaxed text-slate-300">
              Sin registros aún.
              <br />
              Sé el primero en alcanzar el portal.
            </p>
          ) : (
            <ol className="space-y-2">
              {topEntries.map((entry, index) => (
                <li
                  key={entry.id ?? `${entry.player_name}-${index}`}
                  className="flex items-center justify-between gap-2 rounded-lg bg-violet-950/50 px-3 py-2 backdrop-blur-sm"
                >
                  <span className="text-xs font-black text-yellow-300">
                    #{index + 1}
                  </span>
                  <span className="flex-1 truncate text-xs font-bold text-slate-100">
                    {entry.player_name}
                  </span>
                  <span className="text-[10px] font-semibold text-cyan-300">
                    {formatTime(entry.clear_time_sec)}
                  </span>
                  <span className="text-[10px] font-bold text-orange-300">
                    {Math.round(entry.score)}
                  </span>
                </li>
              ))}
            </ol>
          )}
          <p className="mt-4 text-center text-[10px] text-slate-400">
            Ranking global vía Base44
          </p>
        </aside>
      </div>
    </div>
  );
}
