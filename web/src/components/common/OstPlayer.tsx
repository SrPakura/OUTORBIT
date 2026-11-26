import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { OST_TRACKS, type OstTrackSpec } from '../../data/audioData';

interface OstContextValue {
  tracks: OstTrackSpec[];
  currentIndex: number;
  isPlaying: boolean;
  volume: number;
  currentTime: number;
  duration: number;
  togglePlay: () => void;
  selectTrack: (idx: number, autoPlay?: boolean) => void;
  setVolume: (v: number) => void;
  seek: (sec: number) => void;
}

const OstContext = createContext<OstContextValue | null>(null);

export function OstProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolumeState] = useState(0.32);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(OST_TRACKS[0].durationSec);

  useEffect(() => {
    const audio = new Audio(OST_TRACKS[0].src);
    audio.volume = 0.32;
    audio.preload = 'metadata';
    audioRef.current = audio;

    const onTime = () => setCurrentTime(audio.currentTime || 0);
    const onMeta = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
    };
    const onEnded = () => {
      setCurrentIndex((prev) => {
        const next = (prev + 1) % OST_TRACKS.length;
        audio.src = OST_TRACKS[next].src;
        audio.play().catch(() => setIsPlaying(false));
        return next;
      });
    };

    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('ended', onEnded);
      audioRef.current = null;
    };
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }, []);

  const selectTrack = useCallback((idx: number, autoPlay = true) => {
    const audio = audioRef.current;
    const track = OST_TRACKS[idx];
    if (!audio || !track) return;
    setCurrentIndex(idx);
    setCurrentTime(0);
    setDuration(track.durationSec);
    audio.src = track.src;
    if (autoPlay) {
      audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }, []);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    setVolumeState(clamped);
    if (audioRef.current) audioRef.current.volume = clamped;
  }, []);

  const seek = useCallback((sec: number) => {
    if (audioRef.current && Number.isFinite(sec)) {
      audioRef.current.currentTime = Math.max(0, sec);
      setCurrentTime(audioRef.current.currentTime);
    }
  }, []);

  const value = useMemo(
    () => ({
      tracks: OST_TRACKS,
      currentIndex,
      isPlaying,
      volume,
      currentTime,
      duration,
      togglePlay,
      selectTrack,
      setVolume,
      seek,
    }),
    [currentIndex, isPlaying, volume, currentTime, duration, togglePlay, selectTrack, setVolume, seek],
  );

  return <OstContext.Provider value={value}>{children}</OstContext.Provider>;
}

export function useOstAudio(): OstContextValue {
  const ctx = useContext(OstContext);
  if (!ctx) throw new Error('useOstAudio must be used inside OstProvider');
  return ctx;
}

function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

export default function OstPlayer() {
  const { tracks, currentIndex, isPlaying, volume, currentTime, duration, togglePlay, selectTrack, setVolume, seek } =
    useOstAudio();
  const active = tracks[currentIndex];

  return (
    <div className="border-[3px] border-[#0b0d12] bg-[#0d0a1f] p-5 text-slate-100 shadow-[8px_8px_0_#22d3ee]">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="relative h-28 w-28 shrink-0 overflow-hidden border-[3px] border-[#0b0d12] bg-[#05010f] shadow-[4px_4px_0_#e11d48]">
          <img
            src="/audio/covers/cover.webp"
            alt="OUTORBIT OST Cover"
            className="h-full w-full object-cover"
          />
          {isPlaying && (
            <span className="absolute bottom-1 right-1 bg-[#e11d48] px-1.5 py-0.5 font-kicker text-[9px] text-white">
              ON AIR
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="font-kicker text-[11px] text-[#3be8ff]">{active.contextTag}</div>
          <div className="font-comic text-3xl uppercase text-white">{active.id}</div>

          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={togglePlay}
              className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-[#fbfbf8] bg-[#e11d48] text-white transition hover:bg-[#fbbf24] hover:text-[#0b0d12]"
              aria-label={isPlaying ? 'Pause OST' : 'Play OST'}
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>

            <div className="flex-1">
              <input
                type="range"
                min={0}
                max={Math.max(1, Math.round(duration))}
                value={Math.round(currentTime)}
                onChange={(e) => seek(Number(e.target.value))}
                className="w-full accent-[#22d3ee]"
                aria-label="Seek track"
              />
              <div className="mt-1 flex justify-between font-hud text-xs text-slate-400">
                <span>{formatClock(currentTime)}</span>
                <span>{active.duration}</span>
              </div>
            </div>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setVolume(volume > 0 ? 0 : 0.35)}
              className="text-slate-300 hover:text-[#22d3ee]"
              aria-label="Toggle mute"
            >
              {volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(volume * 100)}
              onChange={(e) => setVolume(Number(e.target.value) / 100)}
              className="w-28 accent-[#e11d48]"
              aria-label="Volume"
            />
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {tracks.map((tr, idx) => {
          const isCurrent = idx === currentIndex;
          return (
            <button
              key={tr.id}
              type="button"
              onClick={() => selectTrack(idx, true)}
              className={`flex items-center justify-between border-2 px-3 py-2 text-left transition ${
                isCurrent
                  ? 'border-[#22d3ee] bg-[#1b1138] text-white'
                  : 'border-slate-700/80 bg-[#070416] text-slate-300 hover:border-slate-400'
              }`}
            >
              <div>
                <div className="font-kicker text-[10px] text-[#3be8ff]">{tr.contextTag}</div>
                <div className="font-comic text-lg uppercase">{tr.id}</div>
              </div>
              <span className="font-hud text-sm font-bold text-slate-300">{tr.duration}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
