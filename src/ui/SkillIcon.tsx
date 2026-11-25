import { useId, type CSSProperties } from 'react';
import type { ActiveSkillId, PassiveId } from '@/game/dome/DomeProgression';

export type SkillIconId = ActiveSkillId | PassiveId;

export interface SkillIconProps {
  id?: SkillIconId;
  size?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * Icono SVG vectorial (72×72) para cada habilidad activa y pasiva de la Cúpula.
 * Usa `currentColor` para adaptarse al tema del contenedor (tinta oscura sobre
 * papel en cartas, o color de rareza/cian sobre fondo oscuro en HUD).
 */
export function SkillIcon({ id, size = 72, className, style }: SkillIconProps) {
  const uid = useId().replace(/:/g, '');
  const m = (name: string) => `${uid}-${name}`;

  const common = {
    xmlns: 'http://www.w3.org/2000/svg',
    viewBox: '0 0 72 72',
    width: size,
    height: size,
    fill: 'none',
    className,
    style,
    'aria-hidden': true as const,
  };

  switch (id) {
    // Campo Gravitacional — A (Órbita en estasis)
    case 'gravity_field': {
      const maskId = m('cg-a');
      return (
        <svg {...common}>
          <defs>
            <mask id={maskId}>
              <rect width="72" height="72" fill="white" />
              <polygon points="49,24 56,16 64,22 61,32 51,32" fill="black" />
              <polygon points="9,49 16,39 29,43 28,55 16,58" fill="black" />
              <polygon points="14,29 20,23 27,27 25,35 17,35" fill="black" />
            </mask>
          </defs>
          <ellipse
            cx="36"
            cy="36"
            rx="25"
            ry="13"
            transform="rotate(-28 36 36)"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeDasharray="7 4"
            opacity="0.8"
            mask={`url(#${maskId})`}
          />
          <circle cx="36" cy="36" r="10" stroke="currentColor" strokeWidth="1.8" opacity="0.32" />
          <circle cx="36" cy="36" r="5.5" fill="currentColor" />
          <polygon points="50,24 56,18 63,23 60,31 52,31" fill="currentColor" />
          <polygon points="11,49 17,41 28,44 27,54 17,57" fill="currentColor" />
          <polygon points="15,29 20,24 26,27 24,34 17,34" fill="currentColor" opacity="0.9" />
        </svg>
      );
    }

    // Empuje — B (Choque contra la Barrera)
    case 'repulse_push':
      return (
        <svg {...common}>
          <path
            d="M10 23 Q19 36 10 49"
            stroke="currentColor"
            strokeWidth="2.8"
            strokeLinecap="round"
            opacity="0.45"
          />
          <path
            d="M17 17 Q29 36 17 55"
            stroke="currentColor"
            strokeWidth="4.2"
            strokeLinecap="round"
          />
          <path
            d="M27 31 H32 M26 36 H29 M27 41 H32"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            opacity="0.55"
          />
          <polygon points="39,25 48,36 39,47 31,36" fill="currentColor" />
          <path
            d="M54 36 L47 26 M54 36 L47 46 M54 36 L50 19 M54 36 L50 53"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <rect x="57" y="10" width="6" height="52" rx="2" fill="currentColor" />
        </svg>
      );

    // Absorción de Edén — B (Convergencia dual)
    case 'eden_absorb': {
      const maskId = m('abs-b');
      return (
        <svg {...common}>
          <defs>
            <mask id={maskId}>
              <rect width="72" height="72" fill="white" />
              <rect x="33.8" y="29" width="4.4" height="14" rx="1" fill="black" />
              <rect x="29" y="33.8" width="14" height="4.4" rx="1" fill="black" />
            </mask>
          </defs>
          <polygon points="36,16 51,36 36,56 21,36" fill="currentColor" mask={`url(#${maskId})`} />
          <g stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.88">
            <g>
              <path d="M12 15 Q22 12 24.5 21.5" />
              <polygon points="25.5,25.5 20,20.2 28,19.2" fill="currentColor" stroke="none" />
            </g>
            <g transform="rotate(90 36 36)">
              <path d="M12 15 Q22 12 24.5 21.5" />
              <polygon points="25.5,25.5 20,20.2 28,19.2" fill="currentColor" stroke="none" />
            </g>
            <g transform="rotate(180 36 36)">
              <path d="M12 15 Q22 12 24.5 21.5" />
              <polygon points="25.5,25.5 20,20.2 28,19.2" fill="currentColor" stroke="none" />
            </g>
            <g transform="rotate(270 36 36)">
              <path d="M12 15 Q22 12 24.5 21.5" />
              <polygon points="25.5,25.5 20,20.2 28,19.2" fill="currentColor" stroke="none" />
            </g>
          </g>
        </svg>
      );
    }

    // Pozo de Atracción — B (Pinza gravitatoria)
    case 'attraction_well':
      return (
        <svg {...common}>
          <path
            d="M10 15 Q36 33 62 15 L62 57 Q36 39 10 57 Z"
            fill="currentColor"
            opacity="0.16"
          />
          <path
            d="M10 15 Q36 33 62 15 M10 57 Q36 39 62 57"
            stroke="currentColor"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
          <polygon points="11,25 23,29 27,36 22,44 11,47 14,36" fill="currentColor" />
          <polygon points="61,25 49,29 45,36 50,44 61,47 58,36" fill="currentColor" />
          <polygon points="36,27 40.5,36 36,45 31.5,36" fill="currentColor" />
        </svg>
      );

    // Horizonte de Rebote — A (Ondas cortantes)
    case 'bounce_horizon': {
      const maskId = m('hor-a');
      return (
        <svg {...common}>
          <defs>
            <mask id={maskId}>
              <rect width="72" height="72" fill="white" />
              <path
                d="M33 14 Q57 15 58 39 Q50 22 33 14 Z"
                fill="black"
                stroke="black"
                strokeWidth="4.5"
                strokeLinejoin="round"
              />
              <path
                d="M24 25 Q46 26 47 48 Q40 32 24 25 Z"
                fill="black"
                stroke="black"
                strokeWidth="4.5"
                strokeLinejoin="round"
              />
              <path
                d="M16 36 Q35 37 36 56 Q30 42 16 36 Z"
                fill="black"
                stroke="black"
                strokeWidth="4.5"
                strokeLinejoin="round"
              />
            </mask>
          </defs>
          <g
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            opacity="0.45"
            mask={`url(#${maskId})`}
          >
            <circle cx="36" cy="36" r="18" />
            <path d="M36 12 V20 M36 52 V60 M12 36 H20 M52 36 H60" />
          </g>
          <path d="M33 14 Q57 15 58 39 Q50 22 33 14 Z" fill="currentColor" />
          <path d="M24 25 Q46 26 47 48 Q40 32 24 25 Z" fill="currentColor" opacity="0.88" />
          <path d="M16 36 Q35 37 36 56 Q30 42 16 36 Z" fill="currentColor" opacity="0.65" />
        </svg>
      );
    }

    // Agujero Negro — A (Singularidad clásica)
    case 'black_hole': {
      const maskBack = m('bh-a-back');
      const maskRing = m('bh-a-ring');
      return (
        <svg {...common}>
          <defs>
            <mask id={maskBack}>
              <rect width="72" height="72" fill="white" />
              <circle cx="36" cy="36" r="13.8" fill="black" />
            </mask>
            <mask id={maskRing}>
              <rect width="72" height="72" fill="white" />
              <path
                d="M7 36 Q36 53 65 36 Q36 42.5 7 36 Z"
                transform="rotate(-22 36 36)"
                fill="black"
                stroke="black"
                strokeWidth="3.6"
                strokeLinejoin="round"
              />
            </mask>
          </defs>
          <g mask={`url(#${maskBack})`}>
            <path
              d="M21 35 A15 15 0 0 1 51 35"
              stroke="currentColor"
              strokeWidth="5.2"
              strokeLinecap="round"
              opacity="0.68"
            />
            <path
              d="M23 39 A13 13 0 0 0 49 39"
              stroke="currentColor"
              strokeWidth="2.8"
              strokeLinecap="round"
              opacity="0.38"
            />
            <ellipse
              cx="36"
              cy="36"
              rx="27"
              ry="7.2"
              transform="rotate(-22 36 36)"
              stroke="currentColor"
              strokeWidth="2.6"
              opacity="0.52"
            />
          </g>
          <circle
            cx="36"
            cy="36"
            r="12.5"
            stroke="currentColor"
            strokeWidth="2.6"
            mask={`url(#${maskRing})`}
          />
          <path
            d="M7 36 Q36 53 65 36 Q36 42.5 7 36 Z"
            transform="rotate(-22 36 36)"
            fill="currentColor"
          />
          <circle cx="15" cy="23" r="1.8" fill="currentColor" opacity="0.75" />
          <circle cx="57" cy="49" r="1.6" fill="currentColor" opacity="0.65" />
        </svg>
      );
    }

    // Implosión — A (Colapso interno)
    case 'implosion': {
      const maskId = m('imp-a');
      return (
        <svg {...common}>
          <defs>
            <mask id={maskId}>
              <rect width="72" height="72" fill="white" />
              <path
                d="M36 22 L34 33 L38 39 L36 50 M23 36 L33 34.5 L39 37.5 L49 36"
                stroke="black"
                strokeWidth="3.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </mask>
          </defs>
          <g>
            <line
              x1="11"
              y1="11"
              x2="21"
              y2="21"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <polygon points="25.5,25.5 23.5,15.5 15.5,23.5" fill="currentColor" />
          </g>
          <g transform="rotate(90 36 36)">
            <line
              x1="11"
              y1="11"
              x2="21"
              y2="21"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <polygon points="25.5,25.5 23.5,15.5 15.5,23.5" fill="currentColor" />
          </g>
          <g transform="rotate(180 36 36)">
            <line
              x1="11"
              y1="11"
              x2="21"
              y2="21"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <polygon points="25.5,25.5 23.5,15.5 15.5,23.5" fill="currentColor" />
          </g>
          <g transform="rotate(270 36 36)">
            <line
              x1="11"
              y1="11"
              x2="21"
              y2="21"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <polygon points="25.5,25.5 23.5,15.5 15.5,23.5" fill="currentColor" />
          </g>
          <polygon
            points="36,24.5 46,30.2 46,41.8 36,47.5 26,41.8 26,30.2"
            fill="currentColor"
            mask={`url(#${maskId})`}
          />
          <circle cx="36" cy="36" r="2.2" fill="currentColor" />
        </svg>
      );
    }

    // Velocidad (+Fuerza física) — B (Flecha alada)
    case 'speed_force':
      return (
        <svg {...common}>
          <polygon points="21,31 36,11 51,31 44,31 36,20.5 28,31" fill="currentColor" />
          <polygon points="24,46 36,29 48,46 42,46 36,37.5 30,46" fill="currentColor" />
          <g fill="currentColor" opacity="0.88">
            <polygon points="24,28 9,20 13,29 23,33" />
            <polygon points="23,36 11,32 15,40 24,41" />
            <polygon points="25,45 16,44 20,51 27,50" />
            <polygon points="48,28 63,20 59,29 49,33" />
            <polygon points="49,36 61,32 57,40 48,41" />
            <polygon points="47,45 56,44 52,51 45,50" />
          </g>
          <path
            d="M36 46 V61 M30 52 V59 M42 52 V59"
            stroke="currentColor"
            strokeWidth="2.8"
            strokeLinecap="round"
            opacity="0.52"
          />
        </svg>
      );

    // Regeneración de Edén — A (Cristal anclado)
    case 'eden_regen': {
      const maskId = m('eden-a');
      return (
        <svg {...common}>
          <defs>
            <mask id={maskId}>
              <rect width="72" height="72" fill="white" />
              <polygon points="36,21 41.5,30 36,39 30.5,30" fill="black" />
            </mask>
          </defs>
          <polygon points="36,11 49,30 36,49 23,30" fill="currentColor" mask={`url(#${maskId})`} />
          <polygon points="36,24.5 39.5,30 36,35.5 32.5,30" fill="currentColor" opacity="0.7" />
          <rect x="13" y="54" width="46" height="5.5" rx="2.5" fill="currentColor" />
          <rect x="22" y="61.5" width="28" height="2.4" rx="1.2" fill="currentColor" opacity="0.45" />
          <path
            d="M15 17 V27 M10 22 H20"
            stroke="currentColor"
            strokeWidth="2.8"
            strokeLinecap="round"
          />
          <path
            d="M57 14 V22 M53 18 H61"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            opacity="0.85"
          />
          <circle cx="55" cy="34" r="2" fill="currentColor" opacity="0.65" />
        </svg>
      );
    }

    // Regeneración de Vida — B (Cruz en ciclo)
    case 'hp_regen':
      return (
        <svg {...common}>
          <rect x="31.5" y="23" width="9" height="26" rx="1.8" fill="currentColor" />
          <rect x="23" y="31.5" width="26" height="9" rx="1.8" fill="currentColor" />
          <g>
            <path
              d="M13.8 30 A23 23 0 0 1 56.8 26.3"
              stroke="currentColor"
              strokeWidth="3.6"
              strokeLinecap="round"
            />
            <polygon points="59.5,32.5 52,26.5 61.5,23" fill="currentColor" />
          </g>
          <g transform="rotate(180 36 36)">
            <path
              d="M13.8 30 A23 23 0 0 1 56.8 26.3"
              stroke="currentColor"
              strokeWidth="3.6"
              strokeLinecap="round"
            />
            <polygon points="59.5,32.5 52,26.5 61.5,23" fill="currentColor" />
          </g>
          <circle cx="13" cy="14" r="2.2" fill="currentColor" opacity="0.7" />
          <circle cx="59" cy="13" r="1.8" fill="currentColor" opacity="0.65" />
        </svg>
      );

    default:
      return null;
  }
}

export default SkillIcon;
