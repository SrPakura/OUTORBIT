import { useEffect, useRef } from 'react';
import type { NyxDomeController } from '@/game/dome/NyxDomeController';

// ============================================================================
// DomeDarkMatterRings — overlay 2D de los aros de materia oscura
// ============================================================================
// Dibuja en un canvas 2D propio (con bucle rAF independiente) los aros que
// NyxDomeController proyecta cada frame: un aro inestable de tinta blanca
// que ABRAZA la hitbox proyectada del enemigo (+5 px de padding por lado),
// con la opacidad fluyendo entre el 30% y el 40% en estado pasivo (parpadeo
// sutil que no distrae) y a tope cuando el radar de Tab los fuerza. Al
// vivir fuera de React (sin estado, sin re-render), el coste por frame es
// solo el trazado de los polígonos de los enemigos visibles.
//
// Ruido "oscuro" portado de la referencia encontrar_enemigos.html: armónicos
// disonantes + espina cúbica + jitter por vértice, generado en unidades de
// la referencia (radio 133) y escalado al radio real de cada aro.
// ============================================================================

/** Vértices del aro principal (el eco usa el 75%). */
const RING_VERTICES = 72;
/** Radio base de la referencia: todas las magnitudes de ruido van a esta escala. */
const REF_RADIUS = 133;
/** Multiplicador de tiempo/rotación respecto al incremento por-frame de la referencia (60 fps). */
const TIME_SPEED = 0.9; // referencia: +0.015/frame ≈ 0.9/s
const ROT_SPEED = 0.85; // referencia: +0.014/frame ≈ 0.84/s

/**
 * Ruido angular con armónicos disonantes y picos repentinos (idéntico a la
 * referencia, en unidades de radio 133).
 */
function darkNoise(angle: number, t: number, freq: number, instability: number): number {
  const f1 = Math.round(3 * freq);
  const f2 = Math.round(7 * freq);
  const f3 = Math.round(13 * freq);
  const f4 = Math.round(29 * freq);

  const base =
    Math.sin(angle * f1 + t) * 0.4 +
    Math.cos(angle * f2 - t * 1.7) * 0.3 +
    Math.sin(angle * f3 + t * 2.9) * 0.2 +
    Math.cos(angle * f4 - t * 4.3) * 0.1;

  const spike = Math.pow(
    Math.max(0, Math.sin(angle * (f2 + 2) + t * 3.5) * Math.cos(angle * f3 - t * 2.1)),
    3,
  );

  return base + spike * instability * 1.4;
}

interface RingShape {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  pulse: boolean;
  t: number;
  phase: number;
}

/**
 * Traza el polígono del aro en el contexto, escalado de la referencia (radio
 * 133) al radio real. `tOffset` desfasa el ruido (eco) y `dir` invierte el
 * giro para que el eco contrarrote. Clamp RELATIVO al radio del aro: nunca
 * por debajo del 72% (el aro no "encoge" visualmente) ni por encima del
 * 135% (los picos más largos no desbordan la silueta en pantalla).
 */
function traceRingPath(
  ctx: CanvasRenderingContext2D,
  ring: RingShape,
  t: number,
  rot: number,
  vertices: number,
  radiusScale: number,
  intensityScale: number,
  freq: number,
  instability: number,
  tOffset: number,
): void {
  const scale = ring.radius / REF_RADIUS;
  const cx = ring.x;
  const cy = ring.y;
  const minPx = ring.radius * 0.72;
  const maxPx = ring.radius * 1.35;
  ctx.beginPath();
  for (let i = 0; i < vertices; i++) {
    const baseAngle = (i / vertices) * Math.PI * 2;
    const angle = baseAngle + rot;
    const raw = darkNoise(baseAngle, t + tOffset + ring.phase, freq, instability);
    const sign = raw >= 0 ? 1 : -1;
    const magnitude = Math.pow(Math.abs(raw), sign > 0 ? 3.1 * 0.75 : 3.1 * 1.2);
    const dirMult = sign > 0 ? 1.25 : 0.65;
    const jitter = instability > 0.2 ? Math.sin(i * 19.3 + t * 15 + ring.phase) * instability * 4 : 0;
    const r = Math.max(
      15,
      REF_RADIUS * radiusScale +
        magnitude * sign * dirMult * 91 * intensityScale +
        jitter,
    );
    // Clamp estricto en píxeles de pantalla (no en unidades de referencia).
    const rPx = Math.min(maxPx, Math.max(minPx, r * scale));
    const px = cx + Math.cos(angle) * rPx;
    const py = cy + Math.sin(angle) * rPx;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

interface DomeDarkMatterRingsProps {
  controllerRef: { current: NyxDomeController | null };
}

/**
 * Overlay a pantalla completa de los aros de materia oscura. Se monta una
 * vez junto al canvas del juego; lee el controller por ref cada frame.
 */
function DomeDarkMatterRings({ controllerRef }: DomeDarkMatterRingsProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    let raf = 0;
    let last = performance.now();
    let noiseTime = 0;
    let rotation = 0;
    let pulseTime = 0;
    let hadContent = false;

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      noiseTime += dt * TIME_SPEED;
      rotation += dt * ROT_SPEED;
      pulseTime += dt;

      const controller = controllerRef.current;
      const rings = controller?.getDarkMatterRings();
      const count = rings ? rings.length : 0;

      if (count === 0) {
        if (hadContent) {
          ctx.clearRect(0, 0, width, height);
          hadContent = false;
        }
        return;
      }
      hadContent = true;
      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < count; i++) {
        const ring = rings![i];
        if (ring.alpha <= 0.01) continue;
        const strokeScale = Math.max(0.8, Math.min(1.2, ring.radius / REF_RADIUS));
        // Intensidad de las espinas: t=1 (enemigo pequeño en pantalla, lejos)
        // espinas agresivas; t=0 (al borde del umbral) contenidas.
        const spike = 0.85 + 0.4 * ring.t;
        // Opacidad: en estado pasivo fluye entre el 30% y el 40% (parpadeo
        // sutil con fase propia por aro); con Tab (pulse=false), del tirón.
        const pulseAlpha = ring.pulse
          ? 0.35 + 0.05 * Math.sin(pulseTime * 9.4 + ring.phase)
          : 1;
        const baseAlpha = Math.max(0, Math.min(1, ring.alpha * pulseAlpha));

        // --- Anillo principal agresivo: halo ancho tenue + trazo blanco.
        ctx.globalAlpha = baseAlpha;
        traceRingPath(ctx, ring, noiseTime, rotation, RING_VERTICES, 1, spike, 1.6, 0.55, 0);
        ctx.lineJoin = 'miter';
        ctx.miterLimit = 10;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
        ctx.lineWidth = 2.5 * strokeScale * 3.2;
        ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5 * strokeScale;
        ctx.stroke();

        // --- Eco inestable: 88% del radio, contrarrotando, más nervioso.
        ctx.globalAlpha = baseAlpha * 0.45;
        traceRingPath(
          ctx,
          ring,
          noiseTime,
          -rotation * 1.3,
          Math.max(12, Math.floor(RING_VERTICES * 0.75)),
          0.88,
          spike * 0.85,
          1.6 * 1.15,
          0.55 * 1.1,
          10.5,
        );
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1, 1.125 * strokeScale);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [controllerRef]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
    />
  );
}

export default DomeDarkMatterRings;
