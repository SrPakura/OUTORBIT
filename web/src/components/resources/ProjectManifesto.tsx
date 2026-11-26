import { useWebI18n } from '../../i18n/useWebI18n';

export default function ProjectManifesto() {
  const { t } = useWebI18n();

  return (
    <section className="border-4 border-[#0b0d12] bg-[#fbfbf8] p-6 shadow-[10px_10px_0_#e11d48] sm:p-8">
      <div className="inline-block border-2 border-[#0b0d12] bg-[#0b0d12] px-3 py-1 font-kicker text-[10px] text-[#fbbf24] sm-skew-6">
        <span className="inline-block sm-unskew-6">{t.resources.manifestoBadge}</span>
      </div>
      <h2 className="mt-4 font-comic text-3xl uppercase text-[#0b0d12] sm:text-5xl">
        {t.resources.manifestoTitle}
      </h2>

      <div className="mt-6 grid gap-5 md:grid-cols-3">
        {t.resources.manifestoPoints.map((pt, idx) => (
          <div
            key={pt.title}
            className="border-2 border-[#0b0d12] bg-[#f1f1ed] p-4 shadow-[4px_4px_0_#0b0d12]"
          >
            <div className="font-hud text-3xl font-extrabold italic text-[#e11d48]">
              0{idx + 1}
            </div>
            <h3 className="mt-1 font-comic text-xl uppercase text-[#0b0d12]">{pt.title}</h3>
            <p className="mt-2 text-xs leading-relaxed text-[#2a2f3d]">{pt.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
