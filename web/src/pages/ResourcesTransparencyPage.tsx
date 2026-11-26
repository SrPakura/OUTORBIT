import { useWebI18n } from '../i18n/useWebI18n';
import OstPlayer from '../components/common/OstPlayer';
import AuthorshipSplit from '../components/resources/AuthorshipSplit';
import ProjectManifesto from '../components/resources/ProjectManifesto';
import ShaderLayerInspector from '../components/resources/ShaderLayerInspector';
import SynthAudioDemo from '../components/resources/SynthAudioDemo';

export default function ResourcesTransparencyPage() {
  const { t } = useWebI18n();

  return (
    <main className="pt-20">
      {/* Manifiesto + Mapa de Autoría Humano vs IA */}
      <section className="paper-grid px-4 py-14 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="font-kicker text-xs text-[#e11d48]">{t.resources.kicker}</div>
          <h1 className="mt-1 font-comic text-4xl uppercase sm:text-6xl hollow-ink-title">
            {t.resources.title}
          </h1>

          <div className="mt-8">
            <ProjectManifesto />
          </div>

          <AuthorshipSplit />
        </div>
      </section>

      {/* Inspector de Shaders GLSL & Blender */}
      <ShaderLayerInspector />

      {/* Reproductor OST + SynthAudio Demo en vivo */}
      <section className="paper-grid-fine border-t-4 border-[#0b0d12] px-4 py-16 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="font-kicker text-xs text-[#e11d48]">{t.resources.audioKicker}</div>
          <h2 className="mt-1 font-comic text-4xl uppercase text-[#0b0d12] sm:text-5xl">
            {t.resources.audioTitle}
          </h2>

          <div className="mt-8 grid gap-8 lg:grid-cols-2 lg:items-start">
            <div>
              <div className="mb-2 font-kicker text-[10px] text-[#2a2f3d]">
                {t.resources.ostHeader}
              </div>
              <OstPlayer />
            </div>

            <div>
              <div className="mb-2 font-kicker text-[10px] text-[#2a2f3d]">
                SYNTHAUDIO.TS · WEBAUDIO API
              </div>
              <SynthAudioDemo />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
