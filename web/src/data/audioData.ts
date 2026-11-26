export interface OstTrackSpec {
  id: string;
  src: string;
  duration: string;
  durationSec: number;
  contextTag: string;
}

export const OST_TRACKS: OstTrackSpec[] = [
  {
    id: 'menu',
    src: '/audio/menu.mp3',
    duration: '2:53',
    durationSec: 173,
    contextTag: 'TITLE / MENU',
  },
  {
    id: 'nocturnal',
    src: '/audio/wave-nocturnal.mp3',
    duration: '3:01',
    durationSec: 181,
    contextTag: 'WAVES 01–14',
  },
  {
    id: 'singularity',
    src: '/audio/wave-singularity.mp3',
    duration: '2:53',
    durationSec: 173,
    contextTag: 'WAVES 01–14',
  },
  {
    id: 'boss',
    src: '/audio/boss.mp3',
    duration: '2:50',
    durationSec: 170,
    contextTag: 'WAVE 15 · KRONOS',
  },
];
