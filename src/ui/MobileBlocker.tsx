import { useEffect, useState } from 'react';

function detectMobileBlock(): boolean {
  const coarsePointer =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: coarse)').matches
      : false;
  return coarsePointer || window.innerWidth < 768;
}

/**
 * Aviso elegante para dispositivos táctiles o pantallas pequeñas:
 * OUTORBIT es exclusivo para PC (Teclado + Ratón).
 */
export default function MobileBlocker() {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const update = () => setBlocked(detectMobileBlock());
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  if (!blocked) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0b0618]/97 p-6">
      <div className="max-w-md rounded-2xl border-4 border-yellow-400 bg-[#1a1033] p-8 text-center shadow-[10px_10px_0_#000]">
        <div className="mx-auto mb-5 h-16 w-16 rounded-full border-4 border-black bg-gradient-to-br from-yellow-300 via-orange-400 to-violet-600 shadow-[4px_4px_0_#000]" />
        <h1 className="mb-2 text-3xl font-black tracking-wide text-yellow-300">
          SOLO PARA PC
        </h1>
        <p className="mb-4 text-sm leading-relaxed text-slate-300">
          OUTORBIT es una experiencia de <strong>gravedad esférica</strong> pensada
          exclusivamente para <strong>Teclado + Ratón</strong> (Pointer Lock, WASD,
          Gravity Shift con clic derecho).
        </p>
        <p className="text-xs text-slate-400">
          Abre el juego desde un ordenador de escritorio para pilotar al escuadrón.
        </p>
      </div>
    </div>
  );
}
