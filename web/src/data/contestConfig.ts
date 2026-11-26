export interface SocialLink {
  id: string;
  label: string;
  url: string;
}

export const CONTEST_URLS = {
  game: 'https://outorbit-68425086.base44.app',
  launchpad: 'https://base44.com',
  github: 'https://github.com/SrPakura/OUTORBIT',
  portfolio: 'https://portfolio.pakura.dev',
  officialWeb: 'https://outorbit.pakura.dev',
} as const;

export const TRAILER_CONFIG = {
  // Configurable para MP4 local (/video/trailer-v1.mp4) o embed YouTube/Vimeo.
  videoUrl: '',
  embedType: 'mp4' as 'mp4' | 'iframe',
  label: 'FRECUENCIA 01 // CONTEST CUT (BASE44 EDITION)',
};

// Preparado para añadir perfiles sociales en el futuro sin tocar el footer.
export const SOCIAL_LINKS: SocialLink[] = [];

export const CODE_METRICS = {
  totalSrcLines: 70220,
  domeLines: 26160,
  renderLines: 13517,
  uiLines: 11822,
  glslBlocks: 60,
  nyxGlbCount: 18,
  enemyGlbCount: 8,
  enemyClipsCount: 61,
  nyxStatesCount: 21,
  i18nKeysPerLang: 251,
  synthAudioLines: 1303,
  synthMethodsCount: 48,
} as const;
