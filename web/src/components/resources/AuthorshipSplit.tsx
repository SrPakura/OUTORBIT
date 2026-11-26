import { Cpu, UserCheck } from 'lucide-react';
import { useWebI18n } from '../../i18n/useWebI18n';

export default function AuthorshipSplit() {
  const { t } = useWebI18n();

  return (
    <section className="mt-14">
      <div className="font-kicker text-xs text-[#e11d48]">{t.resources.authorKicker}</div>
      <h2 className="mt-1 font-comic text-4xl uppercase text-[#0b0d12] sm:text-5xl">
        {t.resources.authorTitle}
      </h2>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Columna Izquierda: 100 % Humano */}
        <div className="border-[3px] border-[#0b0d12] bg-[#fbfbf8] p-6 shadow-[8px_8px_0_#e11d48]">
          <div className="flex items-center gap-2 border-b-2 border-[#0b0d12] pb-3">
            <UserCheck className="h-5 w-5 text-[#e11d48]" />
            <h3 className="font-comic text-2xl uppercase text-[#0b0d12]">
              {t.resources.humanTitle}
            </h3>
          </div>

          <div className="mt-5 space-y-4">
            {t.resources.humanItems.map((item) => (
              <div key={item.title} className="border-l-4 border-[#e11d48] bg-[#f1f1ed] p-3.5">
                <h4 className="font-comic text-lg uppercase text-[#0b0d12]">{item.title}</h4>
                <p className="mt-1 text-xs leading-relaxed text-[#2a2f3d]">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Columna Derecha: Generado / Implementado con IA */}
        <div className="border-[3px] border-[#0b0d12] bg-[#0d0a1f] p-6 text-slate-100 shadow-[8px_8px_0_#22d3ee]">
          <div className="flex items-center gap-2 border-b-2 border-[#22d3ee]/40 pb-3">
            <Cpu className="h-5 w-5 text-[#22d3ee]" />
            <h3 className="font-comic text-2xl uppercase text-white">{t.resources.aiTitle}</h3>
          </div>

          <div className="mt-5 space-y-4">
            {t.resources.aiItems.map((item) => (
              <div key={item.title} className="border-l-4 border-[#22d3ee] bg-[#05010f] p-3.5">
                <h4 className="font-comic text-lg uppercase text-[#3be8ff]">{item.title}</h4>
                <p className="mt-1 text-xs leading-relaxed text-slate-300">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
