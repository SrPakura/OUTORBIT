import { useWebI18n } from '../../i18n/useWebI18n';

export default function MechanicsGrid() {
  const { t } = useWebI18n();
  const accents = ['#22d3ee', '#e11d48', '#10b981', '#fbbf24'];

  return (
    <div className="mt-12">
      <div className="font-kicker text-xs text-[#e11d48]">{t.arsenal.lawsKicker}</div>
      <div className="mt-4 grid gap-6 md:grid-cols-2">
        {t.arsenal.laws.map((law, idx) => (
          <article
            key={law.title}
            className="border-[3px] border-[#0b0d12] bg-[#fbfbf8] p-6"
            style={{ boxShadow: `8px 8px 0 ${accents[idx % accents.length]}` }}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-comic text-2xl uppercase text-[#0b0d12]">{law.title}</h3>
              <span className="font-hud text-3xl font-extrabold italic text-[#0b0d12]/20">
                0{idx + 1}
              </span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-[#2a2f3d]">{law.body}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
