import { useEffect, useRef } from 'react';

export interface FluidInkButtonProps {
  label: string;
  hint?: string;
  stops?: string[];
  vbHeight?: number;
  cornerRadius?: number;
  core?: string;
  textColor?: string;
  amplitude?: number;
  href?: string;
  target?: string;
  onClick?: () => void;
  className?: string;
}

const VB_W = 340;

interface BasePoint {
  x: number;
  y: number;
  nx: number;
  ny: number;
  angle: number;
}

function buildRoundedRectPoints(vbH: number, cornerRadius: number, n: number): BasePoint[] {
  const halfH = vbH / 2 - 18;
  const halfW = VB_W / 2 - 22;
  const r = Math.min(cornerRadius, halfH, halfW);
  const cx = VB_W / 2;
  const cy = vbH / 2;

  const straightW = 2 * (halfW - r);
  const straightH = 2 * (halfH - r);
  const arcLen = (Math.PI * r) / 2;
  const total = 2 * straightW + 2 * straightH + 4 * arcLen;

  const points: BasePoint[] = [];
  for (let i = 0; i < n; i++) {
    let d = (i / n) * total;
    let x = 0;
    let y = 0;
    let nx = 0;
    let ny = 0;

    if (d < straightW) {
      x = cx - halfW + r + d;
      y = cy - halfH;
      ny = -1;
    } else if ((d -= straightW) < arcLen) {
      const ang = -Math.PI / 2 + (d / arcLen) * (Math.PI / 2);
      x = cx + halfW - r + Math.cos(ang) * r;
      y = cy - halfH + r + Math.sin(ang) * r;
      nx = Math.cos(ang);
      ny = Math.sin(ang);
    } else if ((d -= arcLen) < straightH) {
      x = cx + halfW;
      y = cy - halfH + r + d;
      nx = 1;
    } else if ((d -= straightH) < arcLen) {
      const ang = (d / arcLen) * (Math.PI / 2);
      x = cx + halfW - r + Math.cos(ang) * r;
      y = cy + halfH - r + Math.sin(ang) * r;
      nx = Math.cos(ang);
      ny = Math.sin(ang);
    } else if ((d -= arcLen) < straightW) {
      x = cx + halfW - r - d;
      y = cy + halfH;
      ny = 1;
    } else if ((d -= straightW) < arcLen) {
      const ang = Math.PI / 2 + (d / arcLen) * (Math.PI / 2);
      x = cx - halfW + r + Math.cos(ang) * r;
      y = cy + halfH - r + Math.sin(ang) * r;
      nx = Math.cos(ang);
      ny = Math.sin(ang);
    } else if ((d -= arcLen) < straightH) {
      x = cx - halfW;
      y = cy + halfH - r - d;
      nx = -1;
    } else {
      d -= straightH;
      const ang = Math.PI + (d / arcLen) * (Math.PI / 2);
      x = cx - halfW + r + Math.cos(ang) * r;
      y = cy - halfH + r + Math.sin(ang) * r;
      nx = Math.cos(ang);
      ny = Math.sin(ang);
    }

    points.push({ x, y, nx, ny, angle: (i / n) * Math.PI * 2 });
  }
  return points;
}

function pointsToSmoothClosedPath(pts: Array<{ x: number; y: number }>, tension = 0.12): string {
  const len = pts.length;
  if (len < 3) return '';
  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)} `;
  for (let i = 0; i < len; i++) {
    const p0 = pts[(i - 1 + len) % len];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % len];
    const p3 = pts[(i + 2) % len];
    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;
    d += `C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)} `;
  }
  return d + 'Z';
}

let uidCounter = 0;

export default function FluidInkButton({
  label,
  hint,
  stops = ['#e11d48', '#7c3aed', '#22d3ee'],
  vbHeight = 104,
  cornerRadius = 3,
  core = '#f1f1ed',
  textColor = '#0b0d12',
  amplitude = 2.3,
  href,
  target = '_blank',
  onClick,
  className = '',
}: FluidInkButtonProps) {
  const idRef = useRef<string | null>(null);
  if (!idRef.current) idRef.current = `web-fink-${++uidCounter}`;
  const uid = idRef.current;

  const auraRef = useRef<SVGPathElement | null>(null);
  const baseRef = useRef<SVGPathElement | null>(null);
  const clipRef = useRef<SVGPathElement | null>(null);
  const coreRef = useRef<SVGPathElement | null>(null);
  const gradRef = useRef<SVGLinearGradientElement | null>(null);
  const hostRef = useRef<HTMLElement | null>(null);

  const sim = useRef({
    time: 0,
    pulse: 0,
    pointerX: VB_W / 2,
    pointerY: vbHeight / 2,
    pointerActive: false,
  });

  useEffect(() => {
    const basePoints = buildRoundedRectPoints(vbHeight, cornerRadius, 64);
    const aura = auraRef.current;
    const base = baseRef.current;
    const clip = clipRef.current;
    const corePath = coreRef.current;
    const grad = gradRef.current;
    const host = hostRef.current;
    if (!aura || !base || !clip || !corePath || !grad || !host) return;

    const state = sim.current;
    let raf = 0;
    let last = performance.now();

    const onMove = (e: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      state.pointerX = ((e.clientX - rect.left) / rect.width) * VB_W;
      state.pointerY = ((e.clientY - rect.top) / rect.height) * vbHeight;
      state.pointerActive = true;
    };
    const onLeave = () => {
      state.pointerActive = false;
    };
    const onDown = () => {
      state.pulse = 1.0;
    };

    host.addEventListener('pointermove', onMove);
    host.addEventListener('pointerleave', onLeave);
    host.addEventListener('pointerdown', onDown);

    const animate = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      state.time += dt * 2.1;
      state.pulse *= 0.91;
      const t = state.time;

      const gradShift = Math.sin(t * 0.45) * 24;
      grad.setAttribute('x1', `${12 + gradShift * 0.4}%`);
      grad.setAttribute('y1', `${Math.max(0, gradShift * 0.35)}%`);
      grad.setAttribute('x2', `${88 - gradShift * 0.4}%`);
      grad.setAttribute('y2', `${Math.min(100, 100 - gradShift * 0.35)}%`);

      const deformed = basePoints.map((bp) => {
        const w1 = Math.sin(bp.angle * 3 + t * 1.15);
        const w2 = Math.cos(bp.angle * 5 - t * 0.85) * 0.55;
        const w3 = Math.sin(bp.angle * 2 + t * 1.65) * 0.35;
        let offset = ((w1 + w2 + w3) / 1.9) * amplitude;
        if (state.pulse > 0.01) {
          offset += Math.sin(bp.angle * 4 - t * 5) * state.pulse * 3.4;
        }
        if (state.pointerActive) {
          const dx = state.pointerX - bp.x;
          const dy = state.pointerY - bp.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 76) {
            const inf = Math.pow(1 - dist / 76, 2) * 3.8;
            offset += (bp.nx * dx + bp.ny * dy > 0 ? 1 : -1) * inf;
          }
        }
        return {
          x: bp.x + bp.nx * offset,
          y: bp.y + bp.ny * offset,
        };
      });

      const d = pointsToSmoothClosedPath(deformed, 0.12);
      aura.setAttribute('d', d);
      base.setAttribute('d', d);
      clip.setAttribute('d', d);
      corePath.setAttribute('d', d);
      raf = requestAnimationFrame(animate);
    };

    raf = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(raf);
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerleave', onLeave);
      host.removeEventListener('pointerdown', onDown);
    };
  }, [vbHeight, cornerRadius, amplitude]);

  const innerContent = (
    <div className="relative flex w-full items-center justify-center sm-skew-6">
      <svg
        viewBox={`0 0 ${VB_W} ${vbHeight}`}
        className="h-auto w-full overflow-visible drop-shadow-[6px_6px_0_rgba(11,13,18,0.9)] transition-transform duration-150 group-hover:-translate-y-0.5"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={`${uid}-grad`} ref={gradRef} x1="12%" y1="0%" x2="88%" y2="100%">
            {stops.map((c, idx) => (
              <stop
                key={`${c}-${idx}`}
                offset={`${(idx / Math.max(1, stops.length - 1)) * 100}%`}
                stopColor={c}
              />
            ))}
          </linearGradient>
          <filter id={`${uid}-blur`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
          <filter id={`${uid}-soft`} x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="1.4" />
          </filter>
          <clipPath id={`${uid}-clip`}>
            <path ref={clipRef} />
          </clipPath>
        </defs>

        <path
          ref={auraRef}
          fill={`url(#${uid}-grad)`}
          opacity="0.34"
          filter={`url(#${uid}-blur)`}
        />
        <path
          ref={baseRef}
          fill={`url(#${uid}-grad)`}
          stroke="#0b0d12"
          strokeWidth="3.5"
        />
        <g clipPath={`url(#${uid}-clip)`}>
          <path
            ref={coreRef}
            fill={core}
            transform="scale(0.92)"
            style={{ transformOrigin: 'center' }}
            filter={`url(#${uid}-soft)`}
          />
        </g>
      </svg>

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-3 px-6 sm-unskew-6">
        <span
          className="font-comic text-xl tracking-tight sm:text-2xl"
          style={{ color: textColor }}
        >
          {label}
        </span>
        {hint && (
          <span className="border-2 border-[#0b0d12] bg-[#0b0d12] px-2 py-0.5 font-kicker text-[10px] text-[#fbfbf8]">
            {hint}
          </span>
        )}
      </div>
    </div>
  );

  if (href) {
    return (
      <a
        ref={hostRef as React.RefObject<HTMLAnchorElement>}
        href={href}
        target={target}
        rel={target === '_blank' ? 'noopener noreferrer' : undefined}
        onClick={onClick}
        className={`group inline-block w-full max-w-[330px] cursor-pointer select-none ${className}`}
      >
        {innerContent}
      </a>
    );
  }

  return (
    <button
      ref={hostRef as React.RefObject<HTMLButtonElement>}
      type="button"
      onClick={onClick}
      className={`group inline-block w-full max-w-[330px] cursor-pointer select-none text-left ${className}`}
    >
      {innerContent}
    </button>
  );
}
