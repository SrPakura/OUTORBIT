export type SkillRarity = 'base' | 'common' | 'epic' | 'legendary';

export interface ActiveSkillSpec {
  id: string;
  index: string;
  rarity: SkillRarity;
  edenCost: number;
  cooldownSec: number;
  maxLevel: number;
  accent: string;
  icon: string;
  synergiesCount: number;
}

export const ACTIVE_SKILLS: ActiveSkillSpec[] = [
  {
    id: 'gravity_field',
    index: '01',
    rarity: 'base',
    edenCost: 8,
    cooldownSec: 5,
    maxLevel: 5,
    accent: '#7ae8dc',
    icon: '/icons/skills/gravity_field.webp',
    synergiesCount: 3,
  },
  {
    id: 'repulse_push',
    index: '02',
    rarity: 'common',
    edenCost: 12,
    cooldownSec: 7,
    maxLevel: 5,
    accent: '#42bde8',
    icon: '/icons/skills/repulse_push.webp',
    synergiesCount: 2,
  },
  {
    id: 'eden_absorb',
    index: '03',
    rarity: 'common',
    edenCost: 0,
    cooldownSec: 6,
    maxLevel: 3,
    accent: '#7dffa8',
    icon: '/icons/skills/eden_absorb.webp',
    synergiesCount: 0,
  },
  {
    id: 'attraction_well',
    index: '04',
    rarity: 'common',
    edenCost: 18,
    cooldownSec: 10,
    maxLevel: 3,
    accent: '#42bde8',
    icon: '/icons/skills/attraction_well.webp',
    synergiesCount: 1,
  },
  {
    id: 'bounce_horizon',
    index: '05',
    rarity: 'epic',
    edenCost: 22,
    cooldownSec: 8,
    maxLevel: 3,
    accent: '#df9fff',
    icon: '/icons/skills/bounce_horizon.webp',
    synergiesCount: 0,
  },
  {
    id: 'black_hole',
    index: '06',
    rarity: 'epic',
    edenCost: 30,
    cooldownSec: 16,
    maxLevel: 3,
    accent: '#df9fff',
    icon: '/icons/skills/black_hole.webp',
    synergiesCount: 0,
  },
  {
    id: 'implosion',
    index: '07',
    rarity: 'legendary',
    edenCost: 45,
    cooldownSec: 25,
    maxLevel: 1,
    accent: '#ffd992',
    icon: '/icons/skills/implosion.webp',
    synergiesCount: 1,
  },
];

export interface PassiveSkillSpec {
  id: 'speed_force' | 'eden_regen' | 'hp_regen';
  accent: string;
}

export const PASSIVE_SKILLS: PassiveSkillSpec[] = [
  { id: 'speed_force', accent: '#ffd992' },
  { id: 'eden_regen', accent: '#df9fff' },
  { id: 'hp_regen', accent: '#7dffa8' },
];
