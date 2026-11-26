import { useRef, useState } from 'react';
import { Volume2 } from 'lucide-react';
import { useWebI18n } from '../../i18n/useWebI18n';

export default function SynthAudioDemo() {
  const { t } = useWebI18n();
  const ctxRef = useRef<AudioContext | null>(null);
  const [lastPlayed, setLastPlayed] = useState<string>('');

  const ensureCtx = (): AudioContext | null => {
    if (typeof window === 'undefined') return null;
    if (!ctxRef.current) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctxRef.current = new AC();
    }
    if (ctxRef.current.state === 'suspended') {
      ctxRef.current.resume().catch(() => undefined);
    }
    return ctxRef.current;
  };

  const playDemo = (id: string) => {
    const ctx = ensureCtx();
    if (!ctx) return;
    setLastPlayed(id);
    const now = ctx.currentTime;

    if (id === 'wind') {
      // Paul Kellet pink noise approximation through dynamic bandpass filter
      const sampleRate = ctx.sampleRate;
      const length = Math.floor(sampleRate * 0.9);
      const buffer = ctx.createBuffer(1, length, sampleRate);
      const data = buffer.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.06;
        b6 = white * 0.115926;
      }
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(160, now);
      filter.frequency.exponentialRampToValueAtTime(1450, now + 0.45);
      filter.frequency.exponentialRampToValueAtTime(280, now + 0.9);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.45, now + 0.2);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
      src.connect(filter).connect(gain).connect(ctx.destination);
      src.start(now);
      src.stop(now + 0.9);
    } else if (id === 'gravity') {
      // 55 Hz sine + 110.5 Hz triangle -> 180 Hz lowpass
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(55, now);
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(110.5, now);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(180, now);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.24, now + 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.95);
      osc1.connect(lp);
      osc2.connect(lp);
      lp.connect(gain).connect(ctx.destination);
      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.95);
      osc2.stop(now + 0.95);
    } else if (id === 'star') {
      // Crystalline impact + resonant chime
      const osc = ctx.createOscillator();
      const chime = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(48, now + 0.25);
      chime.type = 'sine';
      chime.frequency.setValueAtTime(1046.5, now);
      chime.frequency.exponentialRampToValueAtTime(1568, now + 0.14);
      const g1 = ctx.createGain();
      g1.gain.setValueAtTime(0.25, now);
      g1.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.18, now);
      g2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc.connect(g1).connect(ctx.destination);
      chime.connect(g2).connect(ctx.destination);
      osc.start(now);
      chime.start(now);
      osc.stop(now + 0.3);
      chime.stop(now + 0.45);
    } else {
      // Slow-mo 0.25x pitch-down drop
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(480, now);
      osc.frequency.exponentialRampToValueAtTime(75, now + 0.65);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.7);
    }
  };

  return (
    <div className="border-[3px] border-[#0b0d12] bg-[#fbfbf8] p-5 text-[#0b0d12] shadow-[8px_8px_0_#e11d48]">
      <div className="font-kicker text-[10px] text-[#e11d48]">{t.resources.synthHeader}</div>
      <p className="mt-2 text-sm leading-relaxed text-[#2a2f3d]">{t.resources.synthDesc}</p>

      <div className="mt-5 grid gap-3">
        {t.resources.synthButtons.map((btn) => {
          const active = lastPlayed === btn.id;
          return (
            <button
              key={btn.id}
              type="button"
              onClick={() => playDemo(btn.id)}
              className={`flex items-center justify-between border-2 border-[#0b0d12] px-4 py-3 text-left font-kicker text-[11px] transition ${
                active
                  ? 'bg-[#0b0d12] text-[#22d3ee] shadow-[4px_4px_0_#e11d48]'
                  : 'bg-[#f1f1ed] text-[#0b0d12] hover:bg-[#e5e5df]'
              }`}
            >
              <span>{btn.label}</span>
              <Volume2 className="h-4 w-4 shrink-0" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
