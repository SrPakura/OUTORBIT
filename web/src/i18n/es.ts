import type { ArchetypeId } from '../data/enemiesData';

export const es = {
  nav: {
    home: 'INICIO',
    bestiary: 'BESTIARIO 3D',
    arsenal: 'COMBATE & ARSENAL',
    resources: 'RECURSOS & IA',
    play: 'JUGAR →',
    ostPlay: 'OST',
    ostMute: 'SILENCIO',
  },
  home: {
    kicker: '3D ZERO-G KINETIC ARENA ROGUELITE · BASE44 CONTEST',
    pitch:
      'Combate espacial arcade en 3D dentro de una cúpula geodésica de 90 metros en gravedad cero. Pilota a Nyx, encadena dashes, rebotes cinéticos en pared y patadas taladro a más de 34 m/s para atravesar la carne nebulosa de las oleadas y destruir la estrella interior de cada enemigo.',
    chips: ['ARENA ESFÉRICA 90M', 'FÍSICA CINÉTICA 0G', 'OPEN SOURCE · THREE.JS'],
    ctaPlay: 'JUGAR AHORA',
    ctaVote: 'VOTAR EN BASE44 ★',
    ctaTrailer: 'VER TRÁILER ↓',
    gridHint: 'Mueve el cursor (Pozo de Atracción) o haz clic (Empuje) sobre la malla',
    trailerKicker: 'SEÑAL DE LA CÚPULA · TRÁILER OFICIAL',
    trailerTitle: 'EMISIÓN DEL CONCURSO',
    trailerFreq: 'FRECUENCIA 01 // CONTEST CUT (BASE44 EDITION)',
    trailerPendingTitle: 'SEÑAL PREPARADA PARA ESTRENO',
    trailerPendingDesc:
      'Tráiler oficial del Base44 x Nitro Web Game Contest listo para vincularse en contestConfig.ts (/video/trailer-v1.mp4 o YouTube/Vimeo).',
    pillarsKicker: 'CÓMO SE JUEGA · LOS 3 PILARES',
    pillarsTitle: '¿DE QUÉ VA OUTORBIT?',
    pillars: [
      {
        num: '01',
        title: 'GRAVEDAD CERO EN 90 METROS',
        body: 'Arena esférica cerrada con 10 losas orbitales destructibles. Corre por paredes y techos incluso boca abajo, despega al vacío y aterriza a > 3 m/s (Touch-and-Go) para recargar +12 % de Edén al instante.',
      },
      {
        num: '02',
        title: 'CARNE NEBULOSA VS. ESTRELLA INTERIOR',
        body: 'Cada enemigo protege su núcleo dorado (star_core) bajo una capa de carne nebulosa (grosor 8 a 90). Supera los 18 m/s para activar la Patada Taladro (×1.55), perforar la carne y romper su estrella (×2.2 daño).',
      },
      {
        num: '03',
        title: 'ROGUELITE CINÉTICO DE 15 OLEADAS',
        body: 'Desbloquea 7 habilidades activas y 3 pasivas por partida. Usa slow-mo táctico (0.25×), captura proyectiles enemigos para devolvérselos, estampa rivales contra la Barrera Blanca (88.6 m) y vence a KRONOS.',
      },
    ],
    portalsKicker: 'EXPLORA LA DOCUMENTACIÓN INTERACTIVA',
    portalsTitle: 'SIGUIENTE DESTINO',
    portals: [
      {
        num: '01',
        route: '/bestiary' as const,
        tag: '9 MODELOS GLB · RAYOS-X',
        title: 'PERSONAJES Y BESTIARIO 3D',
        desc: 'Inspecciona a Nyx y los 8 arquetipos en 3D real, activa Rayos-X Cinéticos para ver la estrella interior bajo la carne y dispara sus 61 clips de animación.',
        cta: 'ABRIR BESTIARIO →',
      },
      {
        num: '02',
        route: '/arsenal' as const,
        tag: 'SIMULADOR · 7 HABILIDADES',
        title: 'LABORATORIO CINÉTICO Y ARSENAL',
        desc: 'Prueba el simulador de velocidad (0–34 m/s), calcula penetración física contra cada enemigo, explora las cartas .lu-card y sus sinergias ocultas.',
        cta: 'ABRIR LABORATORIO →',
      },
      {
        num: '03',
        route: '/resources' as const,
        tag: 'BASE44 · SHADERS · AUDIO',
        title: 'RECURSOS, TRANSPARENCIA IA Y SHADERS',
        desc: 'Mapa honesto de autoría humana (SrPakura) vs. generación IA, manifiesto de obra abierta sin monetización, inspector GLSL y demos en vivo de SynthAudio.',
        cta: 'VER RECURSOS →',
      },
    ],
    contestKicker: 'BASE44 × NITRO WEB GAME CONTEST',
    contestTitle: 'JUEGA Y VOTA EN BASE44',
    contestDesc:
      'Disponible gratis directamente en navegador, sin descargas ni registro obligatorio. Votaciones comunitarias abiertas en Base44 Launchpad.',
    contestPlayBtn: 'JUGAR EN NAVEGADOR',
    contestPlayNote: 'Requiere navegador de escritorio (≥ 768px) con ratón (Pointer Lock) o mando conectado.',
    contestVoteBtn: 'VOTAR EN BASE44 LAUNCHPAD ★',
    contestVoteNote: 'Tu voto impulsa a OUTORBIT hacia el Top 25 comunitario del concurso.',
    mobileShareBtn: 'ENVIAR ENLACE A MI PC PARA JUGAR',
    mobileCopied: '¡ENLACE COPIADO! ÁBRELO EN TU PC',
    mobileNote:
      'OUTORBIT se juega en ordenador con ratón o mando. ¡Vota desde tu móvil aquí y envíate el enlace para probarlo en PC!',
  },
  bestiary: {
    kicker: 'BESTIARIO DE LA CÚPULA · 9 MODELOS GLB VERIFICADOS',
    title: 'PROTAGONISTA Y AMENAZAS',
    subtitle: 'Un único visor WebGL 3D con carga bajo demanda, paletas reales y Rayos-X Cinéticos.',
    groupProtag: 'PROTAGONISTA',
    groupBasic: 'OLEADAS BÁSICAS',
    groupBoss: 'ÉLITES Y BOSS FINAL',
    xrayOn: '⚡ RAYOS-X ACTIVOS (ESTRELLA VISIBLE)',
    xrayOff: '⚡ SIMULAR IMPACTO TALADRO (RAYOS-X CARNE → ESTRELLA)',
    whiteInk: 'TINTA BLANCA',
    autoRotate: 'ROTACIÓN AUTO',
    loadingModel: 'CARGANDO MODELO 3D...',
    dragHint: 'ARRASTRAR · ORBITAR · ZOOM',
    clipsTitle: 'CLIPS DE ANIMACIÓN GLB (CLIC PARA REPRODUCIR)',
    noClipsNyx: 'Nyx usa pose armada en visor rápido + sus 18 archivos GLB de locomoción y combate en el juego.',
    statsHp: 'HP BASE',
    statsFlesh: 'GROSOR CARNE',
    statsRadius: 'RADIO',
    statsExp: 'EXP',
    statsWeak: 'PUNTOS DÉBILES',
    statsBarrier: 'INMUNE A BARRERA',
    yes: 'SÍ (Élite/Boss)',
    no: 'NO (Muere al choque)',
    aiFlowTitle: 'ARQUITECTURA DE IA Y ESTADOS',
    counterTitle: 'CÓMO CONTRARRESTARLO (COUNTER)',
    penetrationNeeded: 'Requiere fuerza cinética ≥',
    entities: {
      nyx: {
        name: 'NYX',
        role: 'PROTAGONISTA CINÉTICA 0G',
        summary:
          'Piloto de combate gravitatorio con shader Cosmic Nebula y tinta blanca (grosores 0.015 / 0.011 / 0.008). Transforma velocidad pura en poder de perforación y alterna 6 estados entre suelo omnidireccional, vacío 0G y Sentadilla Cinética.',
        aiFlow: ['GROUNDED (ADHERIDA A LOSA)', 'FLOATING 0G (HASTA 28 m/s)', 'DASH (31 m/s · 0.36s)', 'PATADA TALADRO (≥ 18 m/s · ×1.55)', 'SENTADILLA CINÉTICA (0 EDÉN)'],
        counter:
          'Sus propios fallos de trayectoria se corrigen con Kick Recover (frenada aérea perfecta) y Slow-Mo de redirección a 0.25×. Cuidado con rozar la Barrera Blanca (88.6 m): inflige 20 HP.',
      },
      abyssal_cell: {
        name: 'CÉLULA ABISAL',
        role: 'EMBOSCADOR DE OLEADA BÁSICA',
        summary:
          'Depredador nervioso de oleada básica con poca carne (15) pero reflejos reactivos: acecha por la espalda, huye despavorida si Nyx la mira de frente a menos de 6.5 m y puede duplicarse por mitosis.',
        aiFlow: ['IDLE FLOAT', 'SNEAK LOOP (ACECHO)', 'FLEE (< 6.5m EN MIRA)', 'WINDUP → LUNGE', 'DUPLICATE (MITOSIS)'],
        counter:
          'Un simple dash o Gravity Kick supera sobradamente su grosor de carne (15). Si huye al mirarla, intercepta su línea con dash a 31 m/s o lánzala contra la Barrera Blanca con Empuje.',
      },
      crab_gunner: {
        name: 'CANGREJO ARTILLERO',
        role: 'TORRETA DE LOSAS ORBITALES',
        summary:
          'Se ancla encima de las 10 losas flotantes y salta entre ellas. Alterna ráfagas de proyectiles parryables, un láser continuo devastador de 40 HP/s con 2.0 s de telegrafiado y carga kamikaze al límite.',
        aiFlow: ['SCUTTLE EN LOSA', 'JUMP ENTRE LOSAS', 'LASER CHARGE (2.0s)', 'LASER FIRE (40 HP/s)', 'KAMIKAZE PRIME'],
        counter:
          'Usa las propias losas orbitales como cobertura física real para cortar la línea de visión del láser. Devuelve su ráfaga de 3 proyectiles con parry o derríbalo de la losa con Patada Taladro (≥ 22.6 m/s para perforar 35 de carne).',
      },
      spiral_octopus: {
        name: 'PULPO ESPIRAL',
        role: 'HOSTIGADOR TÁCTICO Y CONTRA-PARRY',
        summary:
          'Sigue un ciclo libre de 5.0 s disparando bolas de tinta ácida (16 HP + mancha HUD al 55 % durante 3 s y DoT de 4 HP/s) y Bola Gigante de Dispersión (15×8 fragmentos). Su último tramo entra en ventana roja de Contra-Parry.',
        aiFlow: ['OBSERVE EN BANDA 2–80m', 'PRE-DASH READY (4.0s)', 'VENTANA CONTRA-PARRY (ÚLT. 1.5s)', 'INK BALL / GIANT CHARGE', 'FUGA A 48 m/s'],
        counter:
          'No lo golpees de frente cuando brille en rojo durante su Contra-Parry (te mancha 5–10 s al 65 % y huye a 48 m/s). Captura sus bolas de tinta con Campo Gravitacional y devuélveselas para infligir 90 de daño.',
      },
      ground_golem: {
        name: 'GÓLEM ROMPESUELOS',
        role: 'COLOSO BLINDADO · DESTRUCTOR DE LOSAS',
        summary:
          'Enorme masa con 80 de carne y barra de stamina (100). Levanta pared frontal reactiva (block), ejecuta puñetazos de 32 HP que aturden y cargas en espiral capaces de partir las losas flotantes en escombros.',
        aiFlow: ['HELICOPTER CHASE', 'BLOCK WALL (FRONTAL)', 'BRUTE PUNCH / SPIRAL CHARGE', 'PARRY WINDOW (0.10×)', 'EXHAUSTED LOOP (5.0s)'],
        counter:
          'Evita atacar frontalmente su muro defensivo. Hazle parry en el momento del impacto para activar el Slow-Mo de 0.10×, rodea con dash hacia su estrella y remata la cabeza (-35 % HP), o aprovéchate de sus 5.0 s de fatiga.',
      },
      lightning_butterfly: {
        name: 'MARIPOSA RELÁMPAGO',
        role: 'HOSTIGADORA PIEZOELÉCTRICA HIPER-EVASIVA',
        summary:
          'Cristal de Cuarzo Eléctrico con poca vida (31 HP) pero IA evasiva extrema: encadena ráfagas de 1–5 dashes amplios (45 m/s en evasión) rompiendo el auto-aim de rocas y habilidades. Recarga energía al aletear a 10 m/s para disparar bolas eléctricas (auto-aim según tu velocidad) o rayo cercano.',
        aiFlow: ['FAST FLAP (10 m/s · RECARGA)', 'RÁFAGA 1–5 DASHES + ROMPE AUTO-AIM', 'COOLDOWN DE RÁFAGA (1.5–2.0s)', 'ELECTRIC BALL (TECHO 22.95 m/s · 5s)', 'LIGHTNING BEAM (< CORTO ALCANCE)'],
        counter:
          'Aguanta 2 rocas pequeñas (30 dmg), pero muere con 1 mediana (32 dmg) o cazando su cooldown de 1.5–2.0 s. Su counter definitivo es capturar su propia Bola Eléctrica con Campo Gravitacional: al lanzarla adquiere 140 de daño e imán 100 % irrompible que la alcanza incluso en pleno dash.',
      },
      giant_sparrow: {
        name: 'GORRIÓN GIGANTE',
        role: 'ÉLITE AÉREO DE OLEADA 5 · 2 PUNTOS DÉBILES',
        summary:
          'Cazador aéreo de 416 HP y carne de 85 con 2 cristales débiles (pecho y boca interior). Dispara bolas de aire sin daño que empujan fuerte (32.3 m/s), ejecuta chillido con sacudida de cámara y picado taladro a 49.4 m/s.',
        aiFlow: ['CHASE FLY (27.5–35.1 m/s)', 'AIR BALL / WILD FLAP', 'SHRIEK (CAM SHAKE)', 'DRILL DIVE (49.4 m/s)', 'CRASH STUN (2.5s · 2 CRISTALES)'],
        counter:
          'Cuando lance su Drill Dive, sitúate detrás de una losa flotante para que se estrelle contra ella: sufre 55 de autodaño y entra en Crash Stun de 2.5 s con slow-mo 0.75× exponiendo ambos cristales.',
      },
      prisma_necroz: {
        name: 'PRISMA NECROZ',
        role: 'ÉLITE DE OLEADA 10 · ESCUDO ICOSAÉDRICO',
        summary:
          'Entidad geométrica anclada en (0, 0, 0) girando a 25°/s, protegida por un escudo de 20 triángulos a 4.9 m. Invoca pinchos defensivos, pirámides de 75 m sobre la esfera y gestiona una barra propia de Pereza (0–100) hasta colapsar en Pasotismo Total (5 s).',
        aiFlow: ['SHIELD BUILD (20 TRIÁNGULOS)', 'DEFENSIVE SPIKES (24 m/s)', 'DOME PYRAMIDS (75m)', 'LAZY IDLE (PEREZA 0→100)', 'SLOTH COLLAPSE (5s)'],
        counter:
          'Destruye al menos el 45 % de su escudo de 20 triángulos o agota su barra de Pereza esquivando sus pirámides para provocar su colapso de 5 segundos y perforar sus 65 de carne.',
      },
      kronos_leviathan: {
        name: 'LEVIATÁN KRONOS',
        role: 'BOSS FINAL DE OLEADA 15 · 4 ESTRELLAS DORSALES',
        summary:
          'Leviatán de cadena segmentada de 13 puntos (90 de carne). No usa HP clásico: se derrota rompiendo sus 4 Estrellas Dorsales (`star_core_1..4`) con puertas anti-skip a través de 4 fases que culminan en 60 s de supervivencia bajo VOID COSMOS y Supernova.',
        aiFlow: ['FASE 1–3 (0.5× → 1.35× VEL.)', 'RINGS TELEGRAPH', 'TAIL WHIP', 'PORTAL BITE (SOLAR RIFT)', 'FASE 4: SUPERNOVA 60s'],
        counter:
          'Atraviesa sus Estrellas Dorsales una a una en velocidad Taladro (≥ 18 m/s) o usa Implosión Legendaria (máx. 1 estrella por Leviatán, desactivada en Fase 4). Esquiva los portales SOLAR RIFT y sobrevive los 60 segundos finales.',
      },
    } satisfies Record<ArchetypeId, { name: string; role: string; summary: string; aiFlow: string[]; counter: string }>,
  },
  arsenal: {
    kicker: 'LABORATORIO CINÉTICO · MOTOR NYXDOMECONTROLLER',
    title: 'VELOCIDAD ES PENETRACIÓN',
    meterTitle: 'SIMULADOR EN VIVO DEL VISOR Y PENETRACIÓN',
    meterLabel: 'VELOCIDAD DE NYX',
    forceLabel: 'FUERZA CINÉTICA',
    reticleNormal: 'PATADA NORMAL (< 12 m/s)',
    reticleBounce: 'SENTADILLA CINÉTICA DISPONIBLE (12.0–17.9 m/s)',
    reticleDrill: 'PATADA TALADRO ACTIVA (≥ 18.0 m/s · ×1.55 FUERZA)',
    penetrateTag: 'PENETRA ESTRELLA ×2.2',
    wearTag: 'DESGASTA CARNE ×0.18',
    presets: {
      walk: 'Caminar 2.0',
      run: 'Sprint 7.4',
      bounce: 'Rebote mín. 12.0',
      drill: 'Umbral Taladro 18.0',
      gravity_kick: 'Gravity Kick 23.5',
      dash: 'Dash 31.0',
      spiral_drill: 'Taladro Espiral 34.0',
    },
    lawsKicker: 'LAS 4 LEYES DE LA CÚPULA',
    laws: [
      {
        title: '6 MODOS DE MOVIMIENTO',
        body: 'grounded (boca abajo en losas: 2.0/7.4/10.0 m/s), floating (0G tope 28 m/s), dashing (31 m/s, 0.36 s, 4.5 Edén), speed_attack (23.5–34 m/s), kick_recover y kinetic_bounce (Sentadilla ≤ 42 m y ≥ 12 m/s: conserva 100 % de velocidad a 0 Edén).',
      },
      {
        title: 'SLOW-MO TÁCTICO Y HIT-STOP',
        body: 'Redirección automática a 0.25× (1.25–2.6 s) si un rival esquiva, Bullet-Time de 1.6 s reales al cancelar con dash lateral, Parry al Gólem a 0.10× (-35 % HP en cabeza) y congelación física hit-stop de 42–120 ms.',
      },
      {
        title: 'VIDA, EDÉN Y TOUCH-AND-GO',
        body: '100 HP / 100 Edén base (+5 % y curación completa al subir nivel; ×2 en Modo Fácil). Aterrizar a > 3 m/s sobre cualquier losa activa Touch-and-Go: recupera +12 % de Edén (cooldown de 2.5 s por losa).',
      },
      {
        title: 'CÚPULA DE 90M Y BARRERA BLANCA',
        body: 'Arena esférica de 90 m con 10 losas orbitales móviles (2.2–4.2 m/s). Chocar contra la Barrera Blanca a 88.6 m quita 20 HP a Nyx, pero mata al instante a todo enemigo básico empujado contra ella.',
      },
    ],
    skillsKicker: 'PROGRESIÓN ROGUELITE · 3 RANURAS ACTIVAS',
    skillsTitle: 'ARSENAL DE LA CÚPULA',
    skillsNote: 'Subir de nivel escala daño, radio o cantidad; el coste de Edén y el cooldown son siempre constantes.',
    costLabel: 'COSTE',
    edenUnit: 'EDÉN',
    cdLabel: 'CD',
    maxLvLabel: 'NV MÁX',
    passivesTitle: '3 PASIVAS & MODO FÁCIL',
    easyModeTitle: 'MODO FÁCIL (OPCIONAL EN AJUSTES)',
    easyModeDesc: 'Duplica Vida y Edén máximos (×2) y desactiva el escalado de velocidad y enemigos extra por ciclo de 15 oleadas.',
    rarity: {
      base: 'BASE',
      common: 'COMÚN',
      epic: 'ÉPICA',
      legendary: 'LEGENDARIA',
    },
    skillsCopy: {
      gravity_field: {
        name: 'Campo Gravitacional',
        desc: 'Orbita rocas (15 / 32 / 58 daño) que se lanzan con Clic Izquierdo (40–64 m/s, homing 10.5).',
        synergy: 'Absorbe escombros de losas + Bolas de Tinta (90 dmg) + Bolas Eléctricas (140 dmg, imán 100 % irrompible hacia la Mariposa).',
      },
      repulse_push: {
        name: 'Empuje',
        desc: 'Onda radial (12–24 m) con fuerza 23–51 y daño 7–19 que despeja amenazas alrededor de Nyx.',
        synergy: 'Estampa básicos contra la Barrera Blanca (muerte instantánea) y refleja Bolas Eléctricas (38 dmg, 46 m/s, auto-aim).',
      },
      eden_absorb: {
        name: 'Absorción de Edén',
        desc: 'Canalización estática (< 1.25 m/s). Recupera 9 / 13 / 17 HP y 32 / 44 / 56 de Edén al instante.',
        synergy: 'Sin coste de Edén: clave para sostener partidas largas sin depender solo de pickups.',
      },
      attraction_well: {
        name: 'Pozo de Atracción',
        desc: 'Alcance 52–76 m. Atrae 2 enemigos para hacerlos chocar entre sí (22 / 29 / 36 daño a cada uno).',
        synergy: 'Si solo hay 1 objetivo, lo aplasta entre las 2 losas flotantes más cercanas (26 / 34 / 42 daño por losa).',
      },
      bounce_horizon: {
        name: 'Horizonte de Rebote',
        desc: 'Ráfaga secuencial de 1 / 2 / 3 ondas media luna perforantes a 42 m/s (10 / 13 / 16 daño).',
        synergy: 'Gana auto-aim progresivo desde Nivel 2 (homing 4.5 en Nv2 y 6.5 en Nv3).',
      },
      black_hole: {
        name: 'Agujero Negro',
        desc: 'Vórtice que avanza 4.5 s a 7 m/s (radio 10.5 / 13 / 15.5 m) succionando enemigos en cadena.',
        synergy: 'Inflige hasta 9 ticks de daño de área (7 / 9 / 11 cada 0.5 s) mientras activa el zumbido gravitatorio de SynthAudio.',
      },
      implosion: {
        name: 'Implosión',
        desc: 'Cinemática orbital sin límite de distancia que colapsa el objetivo fijado.',
        synergy: 'Aniquila básicos al instante, inflige -20 % HP máx. a élites o rompe 1 Estrella Dorsal de KRONOS (solo en Fases 2 y 3).',
      },
    },
    passivesCopy: {
      speed_force: { name: 'Velocidad + Fuerza Física', desc: '+20 % / +50 % / +75 % velocidad de vuelo y penetración cinética.' },
      eden_regen: { name: 'Regeneración de Edén', desc: '2 % / 3 % / 5 % de Edén por segundo en reposo o sobre losas.' },
      hp_regen: { name: 'Regeneración de Vida', desc: '1 % base · Pasiva: 1.5 % / 2 % / 3 % de HP por segundo de forma constante.' },
    },
    controlsKicker: 'GUÍA RÁPIDA DE CONTROLES',
    controlsTitle: 'DOMETUTORIALCARD',
    controlsCards: [
      {
        num: '01',
        accent: '#f59e0b',
        title: 'MOVIMIENTO 0G',
        lines: ['WASD · Desplazamiento 3D en cúpula y losas', 'ESPACIO · Despegar al vacío / Frenar en aire', 'CLIC IZQ. · Ataque Cinético / Caída al Vacío', 'CLIC DER. · Dash de impulso (31 m/s)'],
      },
      {
        num: '02',
        accent: '#22d3ee',
        title: 'REBOTES CINÉTICOS',
        lines: ['Alcanza ≥ 12 m/s para iluminar la mira azul (#7fd8ff)', 'Apunta a una losa a ≤ 42 m de distancia', 'Pulsa CLIC DER. para ejecutar Sentadilla Cinética', 'Conserva 100 % de velocidad con 0 coste de Edén'],
      },
      {
        num: '03',
        accent: '#e11d48',
        title: 'SLOW-MO & HABILIDADES',
        lines: ['1 / 2 / 3 · Disparar ranuras de habilidades activas', 'Cámara entra en Slow-Mo 0.25× si pierdes el lock', 'TAB · Radar y panel de entrenamiento / telemetría', 'Ratón (Pointer Lock) y mando W3C Gamepad API'],
      },
    ],
  },
  resources: {
    kicker: 'TRANSPARENCIA · ARQUITECTURA · INGENIERÍA SONORA',
    title: 'RECURSOS Y AUTORÍA',
    manifestoBadge: 'PROYECTO OFICIAL · BASE44 × NITRO WEB GAME CONTEST',
    manifestoTitle: 'MANIFIESTO DE OBRA ABIERTA Y CERRADA',
    manifestoPoints: [
      {
        title: 'PROYECTO PUNTUAL DE COMPETICIÓN',
        body: 'OUTORBIT ha sido concebido y desarrollado específicamente para participar en el Base44 x Nitro Web Game Contest.',
      },
      {
        title: '100 % GRATUITO Y OPEN SOURCE PARA SIEMPRE',
        body: 'Todo el código fuente (70.220 líneas), los 60 bloques GLSL y los 26 modelos .glb están publicados abiertamente en GitHub sin pagos ni registros.',
      },
      {
        title: 'OBRA CERRADA SIN MONETIZACIÓN NI SECUELAS',
        body: 'No hay anuncios, microtransacciones, DLCs ni secuelas planeadas. Es un experimento técnico y artístico completo de principio a fin.',
      },
    ],
    authorKicker: 'EL FILO DE LA AUTORÍA',
    authorTitle: 'DISEÑO HUMANO VS. IMPLEMENTACIÓN IA',
    humanTitle: '100 % AUTORÍA Y DISEÑO HUMANO (SRPAKURA)',
    humanItems: [
      { title: 'Ideación y Dirección Creativa', desc: 'Concepto original, inspiración gravitatoria (Gravity Daze) y dualidad cómic papel-tinta frente al cosmos.' },
      { title: 'Game Design y Reglas Cinéticas', desc: 'Matemática conceptual velocidad → penetración, carne vs. star_core, Sentadilla Cinética, slow-mo y captura de proyectiles.' },
      { title: 'Level Design y la Cúpula', desc: 'Arena esférica de 90 m, Barrera Blanca letal a 88.6 m, 10 losas orbitales y mecánica Touch-and-Go.' },
      { title: 'UI/UX y Dirección de Arte / 3D', desc: 'Identidad de TitleScreen, visor giroscópico de 120px, HUD Yin-Yang, cartas .lu-card y dirección de modelos Blender.' },
    ],
    aiTitle: 'GENERADO / IMPLEMENTADO CON IA',
    aiItems: [
      { title: 'Implementación del Código Fuente', desc: 'Escritura en TypeScript, React 18, Three.js 0.187.0 y los 60 bloques GLSL (70.220 líneas en src/) bajo dirección y revisión humana.' },
      { title: 'Música In-Game (4 Pistas OST)', desc: 'Las 4 pistas ambientales y de combate dentro de la Cúpula (menu.mp3, wave-nocturnal.mp3, wave-singularity.mp3, boss.mp3).' },
      { title: 'Andamiaje de Esta Web Oficial', desc: 'Maquetación de los componentes web a partir de la especificación técnica y enciclopedia verificada del repositorio.' },
    ],
    shaderKicker: '60 FPS SIN POST-PROCESADO PESADO',
    shaderTitle: 'INSPECTOR DE CAPAS SHADER & BLENDER',
    shaderLayers: [
      { id: '01', name: 'GEOMETRÍA Y RIGGING BLENDER', detail: '26 archivos .glb optimizados (18 Nyx + 8 enemigos), 61 clips de animación de enemigos y 21 estados en Nyx.' },
      { id: '02', name: 'TINTA BLANCA (INVERTED HULL)', detail: 'Malla clonada con THREE.BackSide extruida por la normal (0.008–0.032) y ruido de pincel orgánico a coste mínimo.' },
      { id: '03', name: 'NEBULOSAS PROCEDURALES FBM', detail: 'Shaders nyxCosmicNebula y enemyNebula en espacio de pantalla con 4 octavas FBM y estrellas dinámicas, sin texturas pesadas.' },
      { id: '04', name: 'FRESNEL RIM LIGHT Y STAR CORE', detail: 'Rim Fresnel dependiente de gravedad/velocidad + núcleo 0xffcc33 visible a través de la carne translúcida.' },
    ],
    audioKicker: '1.303 LÍNEAS · 0 ARCHIVOS MP3 DE EFECTOS',
    audioTitle: 'BANDA SONORA Y MOTOR SYNTHAUDIO',
    ostHeader: '4 PISTAS REALES DE LA CÚPULA',
    synthHeader: '48 MÉTODOS WEBAUDIO PROCEDURALES',
    synthDesc: 'Cada efecto de sonido del juego se sintetiza en tiempo real en navegador mediante WebAudio API. Pulsa cualquier botón para escuchar la síntesis en directo:',
    synthButtons: [
      { id: 'wind', label: 'PROBAR VIENTO CINÉTICO (RUIDO ROSA PAUL KELLET)' },
      { id: 'gravity', label: 'PROBAR ZUMBIDO GRAVITATORIO (55 Hz + 110.5 Hz)' },
      { id: 'star', label: 'PROBAR IMPACTO / RUPTURA DE ESTRELLA' },
      { id: 'slomo', label: 'PROBAR ACTIVACIÓN SLOW-MO (0.25×)' },
    ],
  },
  footer: {
    tag: '3D ZERO-G KINETIC ARENA ROGUELITE · BASE44 CONTEST ENTRY',
    authorLabel: 'Creado y diseñado por',
    authorName: 'SrPakura (Alejandro Pérez)',
    portfolioBtn: 'VER PORTFOLIO DE SRPAKURA →',
    repoBtn: 'CÓDIGO OPEN SOURCE (GITHUB)',
    playBtn: 'JUGAR EN BASE44',
    socialZero: 'REDES SOCIALES: 0 · 100% CÓDIGO, FÍSICA 0G Y DISEÑO',
  },
};

export type WebDictionary = typeof es;
