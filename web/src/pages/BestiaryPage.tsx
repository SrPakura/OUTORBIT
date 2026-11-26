import { useState } from 'react';
import { BESTIARY_ENTITIES, type ArchetypeId } from '../data/enemiesData';
import { useWebI18n } from '../i18n/useWebI18n';
import CharacterCard from '../components/bestiary/CharacterCard';
import ModelViewer3D from '../components/bestiary/ModelViewer3D';

export default function BestiaryPage() {
  const { t } = useWebI18n();
  const [selectedId, setSelectedId] = useState<ArchetypeId>('nyx');
  const entity = BESTIARY_ENTITIES.find((e) => e.id === selectedId) ?? BESTIARY_ENTITIES[0];
  const [activeClip, setActiveClip] = useState<string>(entity.clips[0] ?? '');

  const handleSelectEntity = (id: ArchetypeId) => {
    const next = BESTIARY_ENTITIES.find((e) => e.id === id) ?? BESTIARY_ENTITIES[0];
    setSelectedId(id);
    setActiveClip(next.clips[0] ?? '');
  };

  const groups: Array<{ title: string; items: typeof BESTIARY_ENTITIES }> = [
    { title: t.bestiary.groupProtag, items: BESTIARY_ENTITIES.filter((e) => e.tier === 'protagonist') },
    { title: t.bestiary.groupBasic, items: BESTIARY_ENTITIES.filter((e) => e.tier === 'basic') },
    {
      title: t.bestiary.groupBoss,
      items: BESTIARY_ENTITIES.filter((e) => e.tier === 'elite' || e.tier === 'boss'),
    },
  ];

  return (
    <main className="cosmic-grid min-h-screen px-4 pb-20 pt-24 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <div className="font-kicker text-xs text-[#22d3ee]">{t.bestiary.kicker}</div>
          <h1 className="mt-1 font-comic text-4xl uppercase text-white drop-shadow-[4px_4px_0_#e11d48] sm:text-6xl">
            {t.bestiary.title}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-300 sm:text-base">{t.bestiary.subtitle}</p>
        </div>

        {/* Selector de mazo superior (deslizable horizontal en móvil) */}
        <div className="mb-8 space-y-3 border-[3px] border-[#0b0d12] bg-[#0d0a1f] p-4 shadow-[6px_6px_0_#e11d48]">
          {groups.map((grp) => (
            <div key={grp.title}>
              <div className="mb-1.5 font-kicker text-[10px] text-slate-400">{grp.title}</div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {grp.items.map((item) => {
                  const active = item.id === entity.id;
                  const label = t.bestiary.entities[item.id].name;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectEntity(item.id)}
                      className={`shrink-0 border-2 px-3 py-1.5 font-comic text-sm uppercase transition ${
                        active
                          ? 'border-[#0b0d12] bg-[#fbbf24] text-[#0b0d12] shadow-[3px_3px_0_#e11d48]'
                          : 'border-slate-700 bg-[#05010f] text-slate-200 hover:border-[#22d3ee]'
                      }`}
                    >
                      <span className="mr-1.5 font-hud text-xs opacity-60">{item.fileNo}</span>
                      {label}
                      {item.waveBadge && (
                        <span className="ml-1.5 bg-[#e11d48] px-1 text-[10px] text-white">
                          {item.waveBadge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Escenario 3D Acoplado + Card Coleccionable */}
        <div className="grid gap-8 lg:grid-cols-12 lg:items-start">
          <div className="lg:sticky lg:top-24 lg:col-span-6">
            <ModelViewer3D
              entity={entity}
              activeClip={activeClip}
              onSelectClip={(clip) => setActiveClip(clip)}
            />
          </div>

          <div className="lg:col-span-6">
            <CharacterCard
              entity={entity}
              activeClip={activeClip}
              onSelectClip={(clip) => setActiveClip(clip)}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
