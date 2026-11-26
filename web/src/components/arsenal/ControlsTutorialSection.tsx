import { useWebI18n } from '../../i18n/useWebI18n';

export default function ControlsTutorialSection() {
  const { t } = useWebI18n();

  return (
    <section className="cosmic-grid border-t-4 border-[#0b0d12] px-4 py-16 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="font-kicker text-xs text-[#22d3ee]">{t.arsenal.controlsKicker}</div>
        <h2 className="mt-1 font-comic text-4xl uppercase text-white drop-shadow-[4px_4px_0_#e11d48] sm:text-5xl">
          {t.arsenal.controlsTitle}
        </h2>

        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {t.arsenal.controlsCards.map((card) => (
            <article
              key={card.num}
              className="border-[3px] border-[#0b0d12] bg-[#fbfbf8] p-6 text-[#0b0d12]"
              style={{ boxShadow: `8px 8px 0 ${card.accent}` }}
            >
              <div className="flex items-center justify-between border-b-2 border-[#0b0d12] pb-3">
                <h3 className="font-comic text-2xl uppercase">{card.title}</h3>
                <span
                  className="border-2 border-[#0b0d12] px-2 py-0.5 font-hud text-xl font-extrabold"
                  style={{ backgroundColor: card.accent }}
                >
                  {card.num}
                </span>
              </div>

              <ul className="mt-4 space-y-2.5 text-sm font-medium text-[#2a2f3d]">
                {card.lines.map((line) => (
                  <li key={line} className="flex items-start gap-2">
                    <span className="mt-1 inline-block h-2 w-2 shrink-0 bg-[#0b0d12]" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
