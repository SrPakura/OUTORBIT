import type { WebDictionary } from './es';

export const en: WebDictionary = {
  nav: {
    home: 'HOME',
    bestiary: '3D BESTIARY',
    arsenal: 'COMBAT & ARSENAL',
    resources: 'RESOURCES & AI',
    play: 'PLAY →',
    ostPlay: 'OST',
    ostMute: 'MUTE',
  },
  home: {
    kicker: '3D ZERO-G KINETIC ARENA ROGUELITE · BASE44 CONTEST',
    pitch:
      'High-speed 3D zero-gravity arcade combat inside a 90-meter geodesic dome. Pilot Nyx, chain dashes, wall kinetic bounces, and drill kicks over 34 m/s to pierce through enemy nebula flesh and shatter their inner star core.',
    chips: ['90M SPHERICAL ARENA', '0G KINETIC PHYSICS', 'OPEN SOURCE · THREE.JS'],
    ctaPlay: 'PLAY NOW',
    ctaVote: 'VOTE ON BASE44 ★',
    ctaTrailer: 'WATCH TRAILER ↓',
    gridHint: 'Move cursor (Attraction Well) or click (Repulse Push) across the grid',
    trailerKicker: 'DOME BROADCAST · OFFICIAL TRAILER',
    trailerTitle: 'CONTEST TRANSMISSION',
    trailerFreq: 'FREQUENCY 01 // CONTEST CUT (BASE44 EDITION)',
    trailerPendingTitle: 'SIGNAL ARMED FOR LAUNCH',
    trailerPendingDesc:
      'Official Base44 x Nitro Web Game Contest trailer slot ready to link in contestConfig.ts (/video/trailer-v1.mp4 or YouTube/Vimeo).',
    pillarsKicker: 'CORE LOOP · THE 3 PILLARS',
    pillarsTitle: 'WHAT IS OUTORBIT?',
    pillars: [
      {
        num: '01',
        title: 'ZERO-GRAVITY IN 90 METERS',
        body: 'Enclosed spherical dome with 10 destructible orbital slabs. Run across walls and ceilings upside down, launch into void, and land > 3 m/s (Touch-and-Go) to restore +12% Eden instantly.',
      },
      {
        num: '02',
        title: 'NEBULA FLESH VS. INNER STAR',
        body: 'Every enemy hides a golden star_core under nebula flesh (thickness 8 to 90). Exceed 18 m/s to trigger the Drill Kick (×1.55), pierce flesh in one strike, and shatter the star (×2.2 damage).',
      },
      {
        num: '03',
        title: '15-WAVE KINETIC ROGUELITE',
        body: 'Unlock 7 active and 3 passive skills per run. Trigger tactical slow-mo (0.25×), capture enemy projectiles to hurl back, slam foes into the White Barrier (88.6 m), and survive KRONOS.',
      },
    ],
    portalsKicker: 'EXPLORE THE INTERACTIVE ARCHIVE',
    portalsTitle: 'SELECT DESTINATION',
    portals: [
      {
        num: '01',
        route: '/bestiary',
        tag: '9 GLB MODELS · X-RAY',
        title: 'CHARACTERS & 3D BESTIARY',
        desc: 'Inspect Nyx and all 8 enemy archetypes in real 3D, trigger Kinetic X-Ray to dissolve outer flesh into the inner star core, and play all 61 GLB clips.',
        cta: 'OPEN BESTIARY →',
      },
      {
        num: '02',
        route: '/arsenal',
        tag: 'SIMULATOR · 7 SKILLS',
        title: 'KINETIC LAB & ARSENAL',
        desc: 'Test the live velocity simulator (0–34 m/s), compute physical penetration against every archetype, and inspect .lu-card skills & hidden synergies.',
        cta: 'OPEN LAB →',
      },
      {
        num: '03',
        route: '/resources',
        tag: 'BASE44 · SHADERS · AUDIO',
        title: 'RESOURCES, AI TRANSPARENCY & SHADERS',
        desc: 'Transparent split of 100% human game design (SrPakura) vs. AI implementation, non-monetized open manifesto, GLSL inspector, and live SynthAudio.',
        cta: 'VIEW RESOURCES →',
      },
    ],
    contestKicker: 'BASE44 × NITRO WEB GAME CONTEST',
    contestTitle: 'PLAY & VOTE ON BASE44',
    contestDesc:
      'Playable free directly in your browser with zero downloads or mandatory sign-up. Community voting open on Base44 Launchpad.',
    contestPlayBtn: 'PLAY IN BROWSER',
    contestPlayNote: 'Requires desktop browser (≥ 768px) with mouse (Pointer Lock) or connected gamepad.',
    contestVoteBtn: 'VOTE ON BASE44 LAUNCHPAD ★',
    contestVoteNote: 'Your vote helps push OUTORBIT into the Contest Community Top 25.',
    mobileShareBtn: 'SEND LINK TO MY PC TO PLAY',
    mobileCopied: 'LINK COPIED! OPEN IT ON YOUR PC',
    mobileNote:
      'OUTORBIT is built for desktop mouse or gamepad. Vote right from your phone here and send yourself the link to play on PC!',
  },
  bestiary: {
    kicker: 'DOME BESTIARY · 9 VERIFIED GLB MODELS',
    title: 'PROTAGONIST & THREATS',
    subtitle: 'Single on-demand 3D WebGL stage with authentic shaders, palettes, and Kinetic X-Ray.',
    groupProtag: 'PROTAGONIST',
    groupBasic: 'BASIC WAVES',
    groupBoss: 'ELITES & FINAL BOSS',
    xrayOn: '⚡ X-RAY ACTIVE (STAR CORE EXPOSED)',
    xrayOff: '⚡ SIMULATE DRILL HIT (FLESH → STAR X-RAY)',
    whiteInk: 'WHITE INK',
    autoRotate: 'AUTO ROTATE',
    loadingModel: 'LOADING 3D MODEL...',
    dragHint: 'DRAG · ORBIT · SCROLL ZOOM',
    clipsTitle: 'GLB ANIMATION CLIPS (CLICK TO PLAY)',
    noClipsNyx: 'Nyx displays in rigged pose with cosmic palettes in preview, and uses 18 dedicated GLB clips in-game.',
    statsHp: 'BASE HP',
    statsFlesh: 'FLESH THICKNESS',
    statsRadius: 'RADIUS',
    statsExp: 'EXP',
    statsWeak: 'WEAK POINTS',
    statsBarrier: 'BARRIER IMMUNE',
    yes: 'YES (Elite/Boss)',
    no: 'NO (Instant KO)',
    aiFlowTitle: 'AI & STATE MACHINE ARCHITECTURE',
    counterTitle: 'HOW TO COUNTER',
    penetrationNeeded: 'Needs kinetic force ≥',
    entities: {
      nyx: {
        name: 'NYX',
        role: '0G KINETIC PROTAGONIST',
        summary:
          'Gravity combat pilot rendered in Cosmic Nebula shader with variable white ink outlines (0.015 / 0.011 / 0.008). Converts pure speed into armor penetration across 6 movement states.',
        aiFlow: ['GROUNDED (SLAB ADHESION)', 'FLOATING 0G (UP TO 28 m/s)', 'DASH (31 m/s · 0.36s)', 'DRILL KICK (≥ 18 m/s · ×1.55)', 'KINETIC BOUNCE (0 EDEN)'],
        counter:
          'Missed locks trigger 0.25× tactical redirection slow-mo and Kick Recover air braking. Avoid slamming into the White Barrier (88.6 m), which deals 20 HP.',
      },
      abyssal_cell: {
        name: 'ABYSSAL CELL',
        role: 'BASIC WAVE AMBUSHER',
        summary:
          'Skittish basic predator with thin flesh (15): stalks from behind, flees in panic whenever Nyx aims directly within 6.5 m, and can duplicate via mitosis.',
        aiFlow: ['IDLE FLOAT', 'SNEAK LOOP', 'FLEE (< 6.5m IN SIGHT)', 'WINDUP → LUNGE', 'DUPLICATE (MITOSIS)'],
        counter:
          'Any dash or Gravity Kick exceeds 15 kinetic force cleanly. If it flees your gaze, intercept with a 31 m/s dash or Repulse Push into the White Barrier.',
      },
      crab_gunner: {
        name: 'CRAB GUNNER',
        role: 'ORBITAL SLAB TURRET',
        summary:
          'Anchors atop the 10 floating slabs and leaps between them. Alternates parryable 3-shot bursts, a continuous 40 HP/s laser after a 2.0 s telegraph, and a final kamikaze charge.',
        aiFlow: ['SCUTTLE ON SLAB', 'SLAB JUMP', 'LASER CHARGE (2.0s)', 'LASER FIRE (40 HP/s)', 'KAMIKAZE PRIME'],
        counter:
          'Use floating slabs as physical cover to break laser line-of-sight. Parry its 3-orb burst or drill through its 35-thickness shell (≥ 22.6 m/s).',
      },
      spiral_octopus: {
        name: 'SPIRAL OCTOPUS',
        role: 'TACTICAL SKIRMISHER & COUNTER-PARRY',
        summary:
          'Operates on a 5.0 s loop firing acid ink balls (16 HP + 55% HUD stain for 3 s + 4 HP/s DoT) and a 15×8 Giant Scatter Ball. Glows red during the final 1.5 s Counter-Parry window.',
        aiFlow: ['OBSERVE (2–80m)', 'PRE-DASH READY (4.0s)', 'RED COUNTER-PARRY (1.5s)', 'INK / GIANT BALL', '48 m/s ESCAPE'],
        counter:
          'Hold fire during its red Counter-Parry window (triggers 5–10 s 65% ink screen stain). Capture its ink balls in Gravity Field to hurl back for 90 damage.',
      },
      ground_golem: {
        name: 'GROUND GOLEM',
        role: 'ARMORED COLOSSUS · SLAB BREAKER',
        summary:
          'Heavy 80-flesh bruiser with 100 stamina. Raises a reactive frontal block wall, throws 32 HP stun punches, and performs spiral charges that shatter floating slabs into debris.',
        aiFlow: ['HELICOPTER CHASE', 'FRONTAL BLOCK', 'BRUTE PUNCH / SPIRAL', 'PARRY WINDOW (0.10×)', 'EXHAUSTED (5.0s)'],
        counter:
          'Never ram its frontal wall. Parry at impact for 0.10× ultra-slow-mo, dash behind to strike its star (-35% HP head crit), or punish its 5.0 s exhausted state.',
      },
      lightning_butterfly: {
        name: 'LIGHTNING BUTTERFLY',
        role: 'PIEZOELECTRIC HYPER-EVASIVE SKIRMISHER',
        summary:
          'Piezoelectric quartz hunter (31 HP): chains 1–5 wide electric dashes (45 m/s evasion) breaking rock and skill auto-aim. Recharges energy flapping at 10 m/s to fire velocity-tracking electric balls or close-range lightning.',
        aiFlow: ['FAST FLAP (10 m/s · CHARGE)', '1–5 DASH BURST + HOMING BREAK', 'BURST COOLDOWN (1.5–2.0s)', 'ELECTRIC BALL (CAP 22.95 m/s · 5s)', 'LIGHTNING BEAM'],
        counter:
          'Survives 2 small rocks (30 dmg), dies to 1 medium rock (32 dmg) or during its 1.5–2.0 s cooldown. Capture its Electric Ball in Gravity Field for an unbreakable 140-dmg homing magnet.',
      },
      giant_sparrow: {
        name: 'GIANT SPARROW',
        role: 'WAVE 5 ELITE · 2 WEAK POINTS',
        summary:
          '416 HP aerial elite (85 flesh) with 2 weak crystals (chest & mouth). Fires zero-damage knockback air balls (32.3 m/s), screeches with camera shake, and dives at 49.4 m/s.',
        aiFlow: ['CHASE FLY (27.5–35.1 m/s)', 'AIR BALL / WILD FLAP', 'SHRIEK', 'DRILL DIVE (49.4 m/s)', 'CRASH STUN (2.5s)'],
        counter:
          'Bait its Drill Dive behind a floating slab so it crashes: takes 55 self-damage and enters a 2.5 s Crash Stun (0.75× slow-mo) exposing both crystals.',
      },
      prisma_necroz: {
        name: 'PRISMA NECROZ',
        role: 'WAVE 10 ELITE · ICOSAHEDRAL SHIELD',
        summary:
          'Anchored at (0, 0, 0) spinning at 25°/s behind a 20-triangle shield at 4.9 m. Summons defensive spikes, 75 m dome pyramids, and accumulates Sloth (0–100) until collapsing for 5 s.',
        aiFlow: ['SHIELD BUILD (20 TRIS)', 'DEFENSIVE SPIKES', '75m PYRAMIDS', 'SLOTH IDLE (0→100)', 'SLOTH COLLAPSE (5s)'],
        counter:
          'Break at least 45% of its 20-triangle shield or outlast its Sloth meter to trigger a 5-second collapse and pierce its 65-thickness core.',
      },
      kronos_leviathan: {
        name: 'KRONOS LEVIATHAN',
        role: 'WAVE 15 FINAL BOSS · 4 DORSAL STARS',
        summary:
          '13-segment articulated leviathan (90 flesh). Defeated by shattering its 4 Dorsal Stars (star_core_1..4) under anti-skip gates across 4 phases, ending in a 60 s VOID COSMOS Supernova survival climax.',
        aiFlow: ['PHASES 1–3 (0.5× → 1.35×)', 'RINGS TELEGRAPH', 'TAIL WHIP', 'PORTAL BITE (SOLAR RIFT)', 'PHASE 4: SUPERNOVA 60s'],
        counter:
          'Break Dorsal Stars sequentially at Drill speed (≥ 18 m/s) or via Legendary Implosion (1 star max per Leviathan, locked in Phase 4). Dodge SOLAR RIFT portals for 60 s.',
      },
    },
  },
  arsenal: {
    kicker: 'KINETIC LAB · NYXDOMECONTROLLER ENGINE',
    title: 'SPEED IS PENETRATION',
    meterTitle: 'LIVE RETICLE & PENETRATION SIMULATOR',
    meterLabel: 'NYX VELOCITY',
    forceLabel: 'KINETIC FORCE',
    reticleNormal: 'NORMAL KICK (< 12 m/s)',
    reticleBounce: 'KINETIC BOUNCE READY (12.0–17.9 m/s)',
    reticleDrill: 'DRILL KICK ACTIVE (≥ 18.0 m/s · ×1.55 FORCE)',
    penetrateTag: 'STAR PIERCE ×2.2',
    wearTag: 'FLESH WEAR ×0.18',
    presets: {
      walk: 'Walk 2.0',
      run: 'Sprint 7.4',
      bounce: 'Bounce Min 12.0',
      drill: 'Drill Threshold 18.0',
      gravity_kick: 'Gravity Kick 23.5',
      dash: 'Dash 31.0',
      spiral_drill: 'Spiral Drill 34.0',
    },
    lawsKicker: 'THE 4 LAWS OF THE DOME',
    laws: [
      {
        title: '6 MOVEMENT MODES',
        body: 'grounded (any slab face even upside down: 2.0/7.4/10.0 m/s), floating (0G soft cap 28 m/s), dashing (31 m/s, 0.36 s, 4.5 Eden), speed_attack (23.5–34 m/s), kick_recover, and kinetic_bounce (≤ 42 m, ≥ 12 m/s: 100% speed kept, 0 Eden cost).',
      },
      {
        title: 'TACTICAL SLOW-MO & HIT-STOP',
        body: 'Automatic 0.25× redirection slow-mo (1.25–2.6 s) on enemy evade, 1.6 s bullet-time on dash-cancel, 0.10× Golem parry window (-35% head crit), and 42–120 ms hit-stop freezes.',
      },
      {
        title: 'HP, EDEN & TOUCH-AND-GO',
        body: '100 HP / 100 Eden base (+5% & full heal per level; ×2 in Easy Mode). Landing > 3 m/s on any slab triggers Touch-and-Go: restores +12% Eden (2.5 s per-slab cooldown).',
      },
      {
        title: '90M DOME & WHITE BARRIER',
        body: '90 m spherical arena with 10 orbiting slabs (2.2–4.2 m/s). Hitting the White Barrier at 88.6 m deals 20 HP to Nyx, but instantly eliminates basic enemies slammed into it.',
      },
    ],
    skillsKicker: 'ROGUELITE PROGRESSION · 3 ACTIVE SLOTS',
    skillsTitle: 'ARSENAL OF THE DOME',
    skillsNote: 'Leveling scales damage, radius, count, or healing; Eden cost and cooldown remain constant.',
    costLabel: 'COST',
    edenUnit: 'EDEN',
    cdLabel: 'CD',
    maxLvLabel: 'MAX LV',
    passivesTitle: '3 PASSIVES & EASY MODE',
    easyModeTitle: 'EASY MODE (OPTIONAL IN SETTINGS)',
    easyModeDesc: 'Doubles max HP & Eden (×2) and disables speed/enemy count escalation across the 15-wave cycle.',
    rarity: {
      base: 'BASE',
      common: 'COMMON',
      epic: 'EPIC',
      legendary: 'LEGENDARY',
    },
    skillsCopy: {
      gravity_field: {
        name: 'Gravity Field',
        desc: 'Orbits rocks (15 / 32 / 58 dmg) fired on Left Click (40–64 m/s, homing 10.5).',
        synergy: 'Absorbs slab debris + Octopus Ink Balls (90 dmg) + Butterfly Electric Balls (140 dmg, 100% unbreakable magnet).',
      },
      repulse_push: {
        name: 'Repulse Push',
        desc: 'Radial blast (12–24 m) with 23–51 knockback force and 7–19 damage around Nyx.',
        synergy: 'Slams enemies into the White Barrier (instant KO) and reflects Electric Balls (38 dmg, 46 m/s homing).',
      },
      eden_absorb: {
        name: 'Eden Absorb',
        desc: 'Stationary channel (< 1.25 m/s). Restores 9 / 13 / 17 HP and 32 / 44 / 56 Eden instantly.',
        synergy: 'Zero Eden cost: essential sustain tool without relying solely on pickups.',
      },
      attraction_well: {
        name: 'Attraction Well',
        desc: '52–76 m range. Pulls 2 enemies together for mutual collision damage (22 / 29 / 36 each).',
        synergy: 'Against a single target, crushes it between the 2 nearest slabs (26 / 34 / 42 per slab).',
      },
      bounce_horizon: {
        name: 'Bounce Horizon',
        desc: 'Sequential burst of 1 / 2 / 3 piercing crescent waves at 42 m/s (10 / 13 / 16 dmg).',
        synergy: 'Unlocks progressive auto-aim starting at Lv 2 (4.5 homing at Lv2, 6.5 at Lv3).',
      },
      black_hole: {
        name: 'Black Hole',
        desc: 'Advancing vortex for 4.5 s at 7 m/s (10.5 / 13 / 15.5 m radius) pulling enemies inward.',
        synergy: 'Deals up to 9 AoE ticks (7 / 9 / 11 every 0.5 s) paired with SynthAudio 55 Hz gravity drone.',
      },
      implosion: {
        name: 'Implosion',
        desc: 'Unlimited-range orbital cinematic collapsing the locked target.',
        synergy: 'Instantly obliterates basic enemies, deals -20% max HP to elites, or breaks 1 KRONOS Dorsal Star (Phases 2 and 3 only).',
      },
    },
    passivesCopy: {
      speed_force: { name: 'Speed + Physical Force', desc: '+20% / +50% / +75% flight speed and kinetic penetration.' },
      eden_regen: { name: 'Eden Regeneration', desc: '2% / 3% / 5% Eden per second while idle or grounded.' },
      hp_regen: { name: 'HP Regeneration', desc: '1% base · Passive: 1.5% / 2% / 3% continuous HP regeneration per second.' },
    },
    controlsKicker: 'QUICK CONTROLS GUIDE',
    controlsTitle: 'DOMETUTORIALCARD',
    controlsCards: [
      {
        num: '01',
        accent: '#f59e0b',
        title: '0G MOVEMENT',
        lines: ['WASD · 3D movement in dome & on slabs', 'SPACE · Launch into void / Air brake', 'LEFT CLICK · Kinetic Kick / Void Fall', 'RIGHT CLICK · Impulse Dash (31 m/s)'],
      },
      {
        num: '02',
        accent: '#22d3ee',
        title: 'KINETIC BOUNCES',
        lines: ['Reach ≥ 12 m/s to turn the reticle blue (#7fd8ff)', 'Aim at any floating slab within ≤ 42 m', 'Press RIGHT CLICK for Kinetic Squat Bounce', 'Retains 100% velocity at 0 Eden cost'],
      },
      {
        num: '03',
        accent: '#e11d48',
        title: 'SLOW-MO & SKILLS',
        lines: ['1 / 2 / 3 · Trigger active skill slots', '0.25× Redirection slow-mo when lock breaks', 'TAB · Radar, training panel & telemetry', 'Desktop Mouse (Pointer Lock) & W3C Gamepad'],
      },
    ],
  },
  resources: {
    kicker: 'TRANSPARENCY · ARCHITECTURE · SOUND ENGINEERING',
    title: 'RESOURCES & AUTHORSHIP',
    manifestoBadge: 'OFFICIAL ENTRY · BASE44 × NITRO WEB GAME CONTEST',
    manifestoTitle: 'OPEN & CLOSED WORK MANIFESTO',
    manifestoPoints: [
      {
        title: 'CONTEST-DEDICATED PROJECT',
        body: 'OUTORBIT was conceived and built specifically as an entry for the Base44 x Nitro Web Game Contest.',
      },
      {
        title: '100% FREE & OPEN SOURCE FOREVER',
        body: 'All 70,220 lines of source code, 60 GLSL shader blocks, and 26 .glb assets are openly published on GitHub with zero paywalls.',
      },
      {
        title: 'SELF-CONTAINED WORK (NO MONETIZATION OR SEQUELS)',
        body: 'Zero ads, microtransactions, DLCs, or sequel plans. A complete standalone technical and artistic experiment.',
      },
    ],
    authorKicker: 'THE EDGE OF AUTHORSHIP',
    authorTitle: 'HUMAN DESIGN VS. AI IMPLEMENTATION',
    humanTitle: '100% HUMAN AUTHORSHIP & DESIGN (SRPAKURA)',
    humanItems: [
      { title: 'Concept & Creative Direction', desc: 'Original premise, Gravity Rush (GRAVITY DAZE) gravitational action inspiration, and paper-ink vs. cosmos visual duality.' },
      { title: 'Game Design & Kinetic Rules', desc: 'All core rules: velocity → penetration formula, flesh vs. star_core dichotomy, 0-cost Kinetic Bounce, slow-mo & skill synergies.' },
      { title: 'Level Design & Dome Arena', desc: '90 m spherical geodesic dome, lethal 88.6 m White Barrier, 10 destructible orbital slabs, and Touch-and-Go.' },
      { title: 'UI/UX & 3D Art Direction', desc: 'TitleScreen layout, 120px gyro reticle, Yin-Yang HUD, .lu-card progression cards, and Blender model direction.' },
    ],
    aiTitle: 'AI-GENERATED / IMPLEMENTED',
    aiItems: [
      { title: 'Source Code Implementation', desc: 'TypeScript, React 18, Three.js 0.187.0, and 60 GLSL shader blocks (70,220 lines in src/) written by AI agents under human architecture and review.' },
      { title: 'In-Game Music (4 OST Tracks)', desc: 'The 4 ambient and combat dome tracks (menu.mp3, wave-nocturnal.mp3, wave-singularity.mp3, boss.mp3).' },
      { title: 'Official Website Scaffolding', desc: 'Component layout code for this website built directly from the verified repository encyclopedia.' },
    ],
    shaderKicker: '60 FPS WITHOUT HEAVY POST-PROCESSING',
    shaderTitle: 'SHADER & BLENDER LAYER INSPECTOR',
    shaderLayers: [
      { id: '01', name: 'BLENDER GEOMETRY & RIGGING', detail: '26 optimized .glb models (18 Nyx + 8 enemies), 61 enemy animation clips, and 21 Nyx animation states.' },
      { id: '02', name: 'WHITE INK (INVERTED HULL)', detail: 'BackSide cloned mesh extruded along normals (0.008–0.032) with organic brush noise at near-zero GPU cost.' },
      { id: '03', name: 'PROCEDURAL FBM NEBULA SHADERS', detail: 'Screen-space 4-octave FBM shaders (nyxCosmicNebula & enemyNebula) projecting live stars without heavy textures.' },
      { id: '04', name: 'FRESNEL RIM LIGHT & STAR CORE', detail: 'Speed/gravity-driven Fresnel rim + golden 0xffcc33 core shining through semi-translucent flesh.' },
    ],
    audioKicker: '1,303 LINES · 0 SFX MP3 FILES',
    audioTitle: 'SOUNDTRACK & SYNTHAUDIO ENGINE',
    ostHeader: '4 REAL DOME TRACKS',
    synthHeader: '48 PROCEDURAL WEBAUDIO METHODS',
    synthDesc: 'Every sound effect is synthesized in real time in your browser via WebAudio API. Click any button to audition live synthesis:',
    synthButtons: [
      { id: 'wind', label: 'TEST KINETIC WIND (PAUL KELLET PINK NOISE)' },
      { id: 'gravity', label: 'TEST GRAVITY DRONE (55 Hz + 110.5 Hz)' },
      { id: 'star', label: 'TEST STAR CORE IMPACT / SHATTER' },
      { id: 'slomo', label: 'TEST SLOW-MO ACTIVATION (0.25×)' },
    ],
  },
  footer: {
    tag: '3D ZERO-G KINETIC ARENA ROGUELITE · BASE44 CONTEST ENTRY',
    authorLabel: 'Created & designed by',
    authorName: 'SrPakura (Alejandro Pérez)',
    portfolioBtn: "VIEW SRPAKURA'S PORTFOLIO →",
    repoBtn: 'OPEN SOURCE REPO (GITHUB)',
    playBtn: 'PLAY ON BASE44',
    socialZero: 'SOCIAL NETWORKS: 0 · 100% CODE, 0G PHYSICS & DESIGN',
  },
};
