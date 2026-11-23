import { useEffect, useRef } from 'react';

// ============================================================================
// FluidInkButton — botón orgánico de tinta viva, port del
// "referencia_boton.html": cápsula (o rectángulo redondeado) cuyo borde se
// deforma con ondas armónicas superpuestas, núcleo de papel difuminado hacia
// los bordes, aura líquida exterior, atracción magnética hacia el cursor y
// onda elástica al pulsar. Todo en un SVG animado a 60 FPS.
// ============================================================================

export interface FluidInkButtonProps {
  label: string;
  /** Chip pequeño a la derecha (p. ej. "[DEBUG]"). */
  hint?: string;
  /** Parada de color del degradado del borde (2..5, de izquierda a derecha). */
  stops: string[];
  /** Altura del viewBox (la anchura es fija 340). Define lo mollar del botón. */
  vbHeight?: number;
  /** Radio de esquina en unidades viewBox; por defecto cápsula completa. */
  cornerRadius?: number;
  /** Relleno del núcleo (papel por defecto). */
  core?: string;
  /** Color del texto (tinta por defecto). */
  textColor?: string;
  /** Amplitud de la ondulación (4.5 = media, como la referencia). */
  amplitude?: number;
  /** Resaltado de foco (navegación con mando / teclado). */
  focused?: boolean;
  ariaLabel?: string;
  onClick?: () => void;
}

const VB_W = 340;

interface BasePoint {
  x: number;
  y: number;
  nx: number;
  ny: number;
  angle: number;
}

/** Puntos base repartidos por el perímetro de un rectángulo redondeado. */
function buildRoundedRectPoints(vbH: number, cornerRadius: number | undefined, n: number): {
  points: BasePoint[];
  halfH: number;
} {
  const halfH = vbH / 2 - 20; // margen para aura + deformación
  const halfW = VB_W / 2 - 26;
  const r = Math.min(cornerRadius ?? halfH, halfH, halfW);
  const cx = VB_W / 2;
  const cy = vbH / 2;

  const straightW = 2 * (halfW - r); // largo de los lados horizontales
  const straightH = 2 * (halfH - r); // largo de los lados verticales
  const arcLen = (Math.PI * r) / 2; // cuarto de arco
  const total = 2 * straightW + 2 * straightH + 4 * arcLen;

  const points: BasePoint[] = [];
  for (let i = 0; i < n; i++) {
    let d = (i / n) * total;
    let x = 0;
    let y = 0;
    let nx = 0;
    let ny = 0;

    // Lado superior (izquierda → derecha)
    if (d < straightW) {
      x = cx - halfW + r + d;
      y = cy - halfH;
      nx = 0;
      ny = -1;
    } else if ((d -= straightW) < arcLen) {
      // Arco superior-derecho (-90° → 0°)
      const ang = -Math.PI / 2 + (d / arcLen) * (Math.PI / 2);
      x = cx + halfW - r + Math.cos(ang) * r;
      y = cy - halfH + r + Math.sin(ang) * r;
      nx = Math.cos(ang);
      ny = Math.sin(ang);
    } else if ((d -= arcLen) < straightH) {
      // Lado derecho (arriba → abajo)
      x = cx + halfW;
      y = cy - halfH + r + d;
      nx = 1;
      ny = 0;
    } else if ((d -= straightH) < arcLen) {
      // Arco inferior-derecho (0° → 90°)
      const ang = (d / arcLen) * (Math.PI / 2);
      x = cx + halfW - r + Math.cos(ang) * r;
      y = cy + halfH - r + Math.sin(ang) * r;
      nx = Math.cos(ang);
      ny = Math.sin(ang);
    } else if ((d -= arcLen) < straightW) {
      // Lado inferior (derecha → izquierda)
      x = cx + halfW - r - d;
      y = cy + halfH;
      nx = 0;
      ny = 1;
    } else if ((d -= straightW) < arcLen) {
      // Arco inferior-izquierdo (90° → 180°)
      const ang = Math.PI / 2 + (d / arcLen) * (Math.PI / 2);
      x = cx - halfW + r + Math.cos(ang) * r;
      y = cy + halfH - r + Math.sin(ang) * r;
      nx = Math.cos(ang);
      ny = Math.sin(ang);
    } else if ((d -= arcLen) < straightH) {
      // Lado izquierdo (abajo → arriba)
      x = cx - halfW;
      y = cy + halfH - r - d;
      nx = -1;
      ny = 0;
    } else {
      // Arco superior-izquierdo (180° → 270°)
      d -= straightH;
      const ang = Math.PI + (d / arcLen) * (Math.PI / 2);
      x = cx - halfW + r + Math.cos(ang) * r;
      y = cy - halfH + r + Math.sin(ang) * r;
      nx = Math.cos(ang);
      ny = Math.sin(ang);
    }

    points.push({ x, y, nx, ny, angle: (i / n) * Math.PI * 2 });
  }
  return { points, halfH };
}

/** Curva cúbica Catmull-Rom cerrada ultra-suave (tension 0.21, como la ref). */
function pointsToSmoothClosedPath(pts: Array<{ x: number; y: number }>, tension = 0.21): string {
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
  stops,
  vbHeight = 96,
  cornerRadius,
  core = '#f1f1ed',
  textColor = '#0b0d12',
  amplitude = 4.5,
  focused = false,
  ariaLabel,
  onClick,
}: FluidInkButtonProps) {
  const idRef = useRef<string | null>(null);
  if (!idRef.current) idRef.current = `fink-${++uidCounter}`;
  const uid = idRef.current;

  const auraRef = useRef<SVGPathElement | null>(null);
  const baseRef = useRef<SVGPathElement | null>(null);
  const clipRef = useRef<SVGPathElement | null>(null);
  const coreRef = useRef<SVGPathElement | null>(null);
  const gradRef = useRef<SVGLinearGradientElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  // Estado de la simulación líquida (la referencia, tal cual)
  const sim = useRef({
    time: 0,
    pulse: 0,
    pointerX: VB_W / 2,
    pointerY: vbHeight / 2,
    pointerActive: false,
  });

  useEffect(() => {
    const NUM_POINTS = 32;
    const { points: basePoints } = buildRoundedRectPoints(vbHeight, cornerRadius, NUM_POINTS);
    const aura = auraRef.current;
    const base = baseRef.current;
    const clip = clipRef.current;
    const corePath = coreRef.current;
    const grad = gradRef.current;
    const btn = btnRef.current;
    if (!aura || !base || !clip || !corePath || !grad || !btn) return;

    const state = sim.current;
    let raf = 0;
    let last = performance.now();

    const updatePointer = (clientX: number, clientY: number): void => {
      const rect = btn.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      state.pointerX = ((clientX - rect.left) / rect.width) * VB_W;
      state.pointerY = ((clientY - rect.top) / rect.height) * vbHeight;
      state.pointerActive = true;
    };

    const onMove = (e: PointerEvent): void => updatePointer(e.clientX, e.clientY);
    const onLeave = (): void => {
      state.pointerActive = false;
    };
    const onClickPulse = (): void => {
      state.pulse = 1.0;
    };

    btn.addEventListener('pointermove', onMove);
    btn.addEventListener('pointerleave', onLeave);
    btn.addEventListener('click', onClickPulse);

    const animate = (now: number): void => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      state.time += dt * 2.1;
      state.pulse *= 0.91;

      const t = state.time;

      // Oscilación suave del ángulo del degradado
      const gradShift = Math.sin(t * 0.45) * 24;
      grad.setAttribute('x1', `${12 + gradShift * 0.4}%`);
      grad.setAttribute('y1', `${Math.max(0, gradShift * 0.35)}%`);
      grad.setAttribute('x2', `${88 - gradShift * 0.4}%`);
      grad.setAttribute('y2', `${Math.min(100, 100 - gradShift * 0.35)}%`);

      // Desplazamiento orgánico de cada vértice del borde
      const deformed = basePoints.map((bp) => {
        const w1 = Math.sin(bp.angle * 3 + t * 1.15);
        const w2 = Math.cos(bp.angle * 5 - t * 0.85) * 0.55;
        const w3 = Math.sin(bp.angle * 2 + t * 1.65) * 0.35;
        let offset = ((w1 + w2 + w3) / 1.9) * amplitude;

        // Onda elástica al pulsar
        if (state.pulse > 0.01) {
          offset += Math.sin(bp.angle * 4 - t * 5) * state.pulse * 5.0;
        }

        // Atracción magnética hacia el cursor
        if (state.pointerActive) {
          const dx = state.pointerX - bp.x;
          const dy = state.pointerY - bp.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 68) {
            const pull = (1 - dist / 68) * 6.5;
            const align = (dx * bp.nx + dy * bp.ny) / (dist || 1);
            offset += pull * Math.max(0.25, align);
          }
        }

        return { x: bp.x + bp.nx * offset, y: bp.y + bp.ny * offset, nx: bp.nx, ny: bp.ny };
      });

      const pillD = pointsToSmoothClosedPath(deformed, 0.21);
      const inset = deformed.map((p) => ({ x: p.x - p.nx * 6.2, y: p.y - p.ny * 6.2 }));
      const coreD = pointsToSmoothClosedPath(inset, 0.21);

      aura.setAttribute('d', pillD);
      base.setAttribute('d', pillD);
      clip.setAttribute('d', pillD);
      corePath.setAttribute('d', coreD);

      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(raf);
      btn.removeEventListener('pointermove', onMove);
      btn.removeEventListener('pointerleave', onLeave);
      btn.removeEventListener('click', onClickPulse);
    };
  }, [vbHeight, cornerRadius, amplitude]);

  return (
    <div className={`fink-wrap${focused ? ' is-focused' : ''}`}>
      <svg viewBox={`0 0 ${VB_W} ${vbHeight}`} className="fink-svg" aria-hidden="true">
        <defs>
          <filter id={`${uid}-aura`} x="-35%" y="-35%" width="170%" height="170%" colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blurAura" />
            <feComponentTransfer in="blurAura">
              <feFuncA type="linear" slope="1.05" />
            </feComponentTransfer>
          </filter>
          <filter id={`${uid}-feather`} x="-40%" y="-40%" width="180%" height="180%" colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceGraphic" stdDeviation="9.5" />
          </filter>
          <linearGradient ref={gradRef} id={`${uid}-grad`} x1="10%" y1="0%" x2="90%" y2="100%">
            {stops.map((color, i) => (
              <stop
                key={color + i}
                offset={`${Math.round((i / Math.max(1, stops.length - 1)) * 100)}%`}
                stopColor={color}
              />
            ))}
          </linearGradient>
          <clipPath id={`${uid}-clip`}>
            <path ref={clipRef} d="" />
          </clipPath>
        </defs>

        <path ref={auraRef} d="" fill={`url(#${uid}-grad)`} filter={`url(#${uid}-aura)`} opacity="0.58" />
        <path ref={baseRef} d="" fill={`url(#${uid}-grad)`} />
        <g clipPath={`url(#${uid}-clip)`}>
          <path ref={coreRef} d="" fill={core} filter={`url(#${uid}-feather)`} />
        </g>
      </svg>

      <button
        ref={btnRef}
        type="button"
        aria-label={ariaLabel ?? label}
        onClick={onClick}
        className="fink-btn"
      >
        <span className="fink-label" style={{ color: textColor }}>
          {label}
        </span>
        {hint && (
          <span className="fink-hint" style={{ color: textColor, borderColor: `${textColor}55` }}>
            {hint}
          </span>
        )}
      </button>

      <style>{`
        .fink-wrap { position: relative; width: 100%; transition: transform 0.16s cubic-bezier(0.22, 1, 0.36, 1), filter 0.16s ease; }
        .fink-wrap.is-focused {
          transform: scale(1.035) translateX(6px);
          filter: drop-shadow(0 0 16px rgba(225, 29, 72, 0.5));
        }
        .fink-svg { display: block; width: 100%; height: auto; overflow: visible; }
        .fink-btn {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 0 9%;
          cursor: pointer;
          border: none;
          background: transparent;
          font-family: inherit;
          touch-action: manipulation;
          transition: transform 0.2s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .fink-btn:active { transform: scale(0.965); }
        .fink-btn:focus-visible { outline: 3px solid #e11d48; outline-offset: 4px; border-radius: 999px; }
        .fink-label {
          font-size: clamp(15px, 1.7vw, 21px);
          font-weight: 900;
          font-style: italic;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          white-space: nowrap;
        }
        .fink-hint {
          font: 800 10px/1 ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
          letter-spacing: 0.14em;
          padding: 5px 8px 4px;
          border: 2px solid;
          background: rgba(255, 255, 255, 0.35);
          transform: skewX(-8deg);
          white-space: nowrap;
        }
      `}</style>
    </div>
  );
}
