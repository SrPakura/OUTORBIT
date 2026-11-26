export interface NyxPaletteSpec {
  id: 'raven_nebula' | 'void_cosmos' | 'solar_rift';
  name: string;
  deep: string;
  nebulaA: string;
  nebulaB: string;
  rim: string;
}

export const NYX_PALETTES: NyxPaletteSpec[] = [
  {
    id: 'raven_nebula',
    name: 'RAVEN NEBULA',
    deep: '#090314',
    nebulaA: '#7e22ce',
    nebulaB: '#06b6d4',
    rim: '#f8fafc',
  },
  {
    id: 'void_cosmos',
    name: 'VOID COSMOS',
    deep: '#070518',
    nebulaA: '#4c1d95',
    nebulaB: '#e11d48',
    rim: '#ffffff',
  },
  {
    id: 'solar_rift',
    name: 'SOLAR RIFT',
    deep: '#120614',
    nebulaA: '#be123c',
    nebulaB: '#f59e0b',
    rim: '#ffffff',
  },
];

export const NYX_SPEED_PRESETS = [
  { id: 'walk', speed: 2.0 },
  { id: 'run', speed: 7.4 },
  { id: 'bounce', speed: 12.0 },
  { id: 'drill', speed: 18.0 },
  { id: 'gravity_kick', speed: 23.5 },
  { id: 'dash', speed: 31.0 },
  { id: 'spiral_drill', speed: 34.0 },
] as const;

export const NYX_PHYSICS = {
  domeArenaRadius: 90,
  playerBoundRadius: 88.6,
  barrierNyxDamage: 10,
  kineticTriggerSpeed: 12.0,
  kineticTriggerMaxDist: 42.0,
  drillSpeedThreshold: 18.0,
  drillForceMultiplier: 1.55,
  starPenetrationMult: 2.2,
  fleshWearMult: 0.18,
  maxHpPctFloor: 0.34,
  squatSec: 0.16,
  launchSec: 0.12,
  touchAndGoMinSpeed: 3.0,
  touchAndGoEdenGain: 12,
  touchAndGoCooldown: 2.5,
  reticleSizePx: 120,
} as const;

export const NYX_CLIPS_INFO = [
  'nyx_zero_g_float.glb',
  'nyx_float_fwd.glb',
  'nyx_float_back.glb',
  'nyx_walk_loop.glb',
  'nyx_run_loop.glb',
  'nyx_gravity_kick.glb',
  'nyx_spiral_drill_kick.glb',
  'nyx_kick_flip_drill.glb',
  'nyx_kinetic_squat.glb',
  'nyx_gravity_fall.glb',
] as const;
