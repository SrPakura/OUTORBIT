import { useEffect, useRef } from 'react';

interface Shockwave {
  x: number;
  y: number;
  age: number;
}

export default function GravityWaveGrid() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pointer = { x: -9999, y: -9999, active: false };
    const waves: Shockwave[] = [];
    let raf = 0;
    let visible = true;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener('resize', resize);

    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
      },
      { threshold: 0.05 },
    );
    io.observe(canvas);

    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
      pointer.active = true;
    };
    const onLeave = () => {
      pointer.active = false;
    };
    const onDown = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      waves.push({ x: e.clientX - rect.left, y: e.clientY - rect.top, age: 0 });
    };

    const host = canvas.parentElement || canvas;
    host.addEventListener('pointermove', onMove);
    host.addEventListener('pointerleave', onLeave);
    host.addEventListener('pointerdown', onDown);

    let last = performance.now();
    const render = (now: number) => {
      raf = requestAnimationFrame(render);
      if (!visible) return;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      for (let i = waves.length - 1; i >= 0; i--) {
        waves[i].age += dt;
        if (waves[i].age > 1.1) waves.splice(i, 1);
      }

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);

      const step = w < 640 ? 44 : 52;
      const cols = Math.ceil(w / step) + 2;
      const rows = Math.ceil(h / step) + 2;
      const t = now * 0.0012;

      const displace = (gx: number, gy: number) => {
        let px = gx;
        let py = gy + Math.sin(gx * 0.014 + t) * 2.5 + Math.cos(gy * 0.015 - t * 0.8) * 2.0;

        // Pozo de atracción suave hacia el cursor
        if (pointer.active) {
          const dx = pointer.x - px;
          const dy = pointer.y - py;
          const dist = Math.hypot(dx, dy);
          const radius = 165;
          if (dist > 1 && dist < radius) {
            const pull = Math.pow(1 - dist / radius, 2) * 26;
            px += (dx / dist) * pull;
            py += (dy / dist) * pull;
          }
        }

        // Onda expansiva de Empuje al pulsar
        for (const sw of waves) {
          const dx = px - sw.x;
          const dy = py - sw.y;
          const dist = Math.hypot(dx, dy);
          const waveR = sw.age * 420;
          const band = Math.exp(-Math.pow((dist - waveR) / 48, 2));
          if (dist > 1 && band > 0.02) {
            const push = band * (1 - sw.age / 1.1) * 24;
            px += (dx / dist) * push;
            py += (dy / dist) * push;
          }
        }
        return [px, py] as const;
      };

      const pts: Array<readonly [number, number]> = new Array(rows * cols);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          pts[r * cols + c] = displace((c - 0.5) * step, (r - 0.5) * step);
        }
      }

      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(11, 13, 18, 0.13)';
      ctx.beginPath();
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const [x, y] = pts[r * cols + c];
          if (c < cols - 1) {
            const [nx, ny] = pts[r * cols + (c + 1)];
            ctx.moveTo(x, y);
            ctx.lineTo(nx, ny);
          }
          if (r < rows - 1) {
            const [bx, by] = pts[(r + 1) * cols + c];
            ctx.moveTo(x, y);
            ctx.lineTo(bx, by);
          }
        }
      }
      ctx.stroke();

      // Nodos destacados en las intersecciones cercanas al cursor/ondas
      for (let i = 0; i < pts.length; i++) {
        const [x, y] = pts[i];
        const nearCursor = pointer.active && Math.hypot(x - pointer.x, y - pointer.y) < 120;
        if (nearCursor) {
          ctx.fillStyle = '#22d3ee';
          ctx.fillRect(x - 2, y - 2, 4, 4);
        }
      }

      // Anillo de Empuje visual
      for (const sw of waves) {
        const radius = sw.age * 420;
        const alpha = Math.max(0, 1 - sw.age / 1.1);
        ctx.beginPath();
        ctx.arc(sw.x, sw.y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(225, 29, 72, ${(alpha * 0.65).toFixed(2)})`;
        ctx.lineWidth = 3 * alpha;
        ctx.stroke();
      }
    };

    raf = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      io.disconnect();
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerleave', onLeave);
      host.removeEventListener('pointerdown', onDown);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
    />
  );
}
