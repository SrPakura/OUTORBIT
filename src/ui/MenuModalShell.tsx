import { useEffect, type ReactNode } from 'react';

interface MenuModalShellProps {
  title: string;
  subtitle?: string;
  /** Color de acento del subtítulo y del offset del título. */
  accent?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Marco común de los modales de la portada: vidrio cósmico de alto contraste
 * con borde de tinta y sombra offset tipo cómic. Cierra con Escape o con el
 * botón CERRAR.
 */
export default function MenuModalShell({
  title,
  subtitle,
  accent = '#22d3ee',
  onClose,
  children,
  footer,
}: MenuModalShellProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.code === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#05010f]/85 p-4 backdrop-blur-sm">
      <div className="relative flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border-4 border-[#0b0b14] bg-[#0d0a1f]/95 shadow-[10px_10px_0_#0b0b14]">
        <div className="flex items-start justify-between gap-4 border-b-2 border-white/10 px-6 py-4">
          <div>
            <h2
              className="text-2xl font-black italic tracking-[0.14em] text-white"
              style={{ textShadow: `3px 3px 0 ${accent}` }}
            >
              {title}
            </h2>
            {subtitle && (
              <p
                className="mt-1 text-[11px] font-black uppercase tracking-[0.26em]"
                style={{ color: accent }}
              >
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 cursor-pointer rounded-lg border-2 border-[#0b0b14] bg-white/10 px-3 py-1.5 text-[11px] font-black tracking-[0.18em] text-white transition-colors hover:bg-white/20"
          >
            CERRAR
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {footer && <div className="border-t-2 border-white/10 px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}
