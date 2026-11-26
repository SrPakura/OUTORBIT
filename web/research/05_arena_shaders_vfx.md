# OUTORBIT — Arena de la cúpula: escenario, shaders GLSL, iluminación, materiales toon/cómic y VFX

Extracción pura de datos del código fuente en `/home/pakura/Proyectos/OUTORBIT`.
Cada valor de este documento se leyó íntegro en el archivo indicado y se volvió a confirmar con
búsqueda literal sobre el árbol de trabajo (dos pasadas). No hay valores inferidos ni estimados:
donde el código contradice un comentario del propio archivo, se indica expresamente.

Fecha de extracción: sesión de análisis sobre el commit `fb610ec`.

---

## 0. Archivos fuente obligatorios (leídos íntegros)

| Archivo | Líneas | Contenido extraído |
|---|---|---|
| `src/game/render/domeArenaScene.ts` | 1804 | Cúpula, bóveda espacial, abismo, singularidad, agujeros negros, pilar, monolitos, arcos, fragmentos, asteroides, prismas, 10 shaders GLSL |
| `src/game/dome/DomeSlabs.ts` | 665 | Colisión esfera/OBB/malla exacta, `updateSlabMotion`, `SLAB_SPECS`, `createDomeSlabs` |
| `src/game/dome/DomeFloatingSlabs.ts` | 463 | Pool de 10 suelos flotantes, cuerdas orbitales, transiciones, rotura, separación |
| `src/game/dome/DomeSlabGeometry.ts` | 467 | Geometría de trozo arrancado + shader del damero de baldosas |
| `src/game/dome/DomeSphereTiles.ts` | 475 | 320 baldosas triangulares de la cúpula geodésica, modos miniboss/boss |
| `src/game/render/toonMaterials.ts` | 657 | Estado global de shaders, cel-shading de 3 bandas, Inverted Hull, cielo dreamscape |
| `src/game/render/menuShaders.ts` | 176 | Divisor líquido del menú |
| `src/game/dome/ComicImpactVfx.ts` | 506 | VFX de impacto cómic (picos rombo + estrellas) |
| `src/game/dome/MotionVfx.ts` | 969 | Partículas, anillos, estelas, destellos, telémetro |
| `src/ui/DomeDarkMatterRings.tsx` | 236 | Overlay 2D de aros de materia oscura |
| `src/ui/TitleDioramaSandbox.ts` | 483 | Portada: fondo crepuscular, shader Cosmic Nebula, contornos blancos |
| `src/game/dome/DomeEnemyModels.ts` | 1310 | Shaders de carne nebular, Cuarzo Eléctrico, contornos vibrantes, SOLAR RIFT / VOID COSMOS |

Archivos auxiliares consultados para completar datos citados en la tarea:
`src/ui/domeGameLoop.ts` (luces, renderer, cámara, wiring de VFX), `src/game/dome/domeTypes.ts`
(radios), `src/game/dome/DomeSkills.ts` (shaders de bolas capturadas y cúpula de área, escombros),
`src/game/dome/DomeWaveManager.ts` (shaders de bolas de tinta y bolas eléctricas),
`src/game/render/nyxModelLoader.ts` (material Cosmic Nebula de NYX), `src/game/GameEngine.ts`
(luces del nivel de ciudad, para contraste).

---

## 1. Escenario: la cúpula esférica

### 1.1 Dimensiones exactas

| Constante | Valor | Archivo:línea |
|---|---|---|
| `DOME_RADIUS` (malla de cristal del backdrop) | `90` | `domeArenaScene.ts:36` |
| `DOME_ARENA_RADIUS` | `90` | `domeTypes.ts:203` |
| `DOME_PLAYER_BOUND_RADIUS` (barrera de gameplay) | `88.6` | `domeTypes.ts:204` |
| `TILE_SURFACE_RADIUS` (cara pisable de las baldosas) | `DOME_PLAYER_BOUND_RADIUS - 1.1` = **87.5** | `DomeSphereTiles.ts:21` |
| `TILE_THICKNESS` (prisma hacia fuera) | `2.2` → cara exterior a **89.7** | `DomeSphereTiles.ts:23` |
| `ABYSS_Y` (plano del vórtice abisal) | `-125` | `domeArenaScene.ts:47` |

Nota verificada: el comentario de cabecera de `domeArenaScene.ts` habla de «cúpula de cristal de
50 m» y el de `DomeSlabs.ts` de «cúpula de 50 m», pero el valor real en código es `DOME_RADIUS = 90`
en ambos módulos (`domeArenaScene.ts:36`, `DomeFloatingSlabs.ts:28`). El dato válido es 90 m de radio.

### 1.2 Iluminación y estado del renderer (modo cúpula)

Todo el modo cúpula se monta en `startDomeGameLoop` (`src/ui/domeGameLoop.ts`).

| Elemento | Valor verificado | Línea |
|---|---|---|
| Renderer | `new THREE.WebGLRenderer({ canvas, antialias: true })` | `domeGameLoop.ts:128` |
| Pixel ratio | `Math.min(window.devicePixelRatio, 2)` | `:129` |
| Escena | `new THREE.Scene()` — **sin** `scene.fog` | `:132` |
| Cámara | `PerspectiveCamera(settingsRef.current.baseFov, aspect, 0.1, 2500)` | `:133-138` |
| FOV por defecto / límites | `baseFov: 70`, límites `min 55`, `max 85` | `settings.ts:174`, `:126` |
| Luz principal | `DirectionalLight(0xdbeafe, 1.5)`, `position.set(60, 120, 40)` | `:141-143` |
| Luz ambiente | `AmbientLight(0x818cf8, 0.65)` | `:144` |

Estado global de iluminación de los materiales cel (`src/game/render/toonMaterials.ts:7-21`):

```ts
const globalShaderState = {
  uSunDir: { value: new THREE.Vector3(0.48, 0.42, -0.78).normalize() },
  uHalftoneEnabled: { value: 1.0 },
  uTime: { value: 0.0 },
};
export const sharedShaderState = globalShaderState;
```

Es decir: el «sol» de los shaders cel apunta a **norte (-Z)** con elevación positiva
(`0.48, 0.42, -0.78` normalizado) y **no coincide** con la `DirectionalLight` de la escena
(`60, 120, 40`): los materiales cel son shaders propios que no leen luces de Three.js.

Para contraste, el nivel de ciudad (`GameEngine.ts:275-285`) usa otra iluminación:
`DirectionalLight(0xfff2d8, 2.4)` en `(320, 420, 220)`, `DirectionalLight(0x8b5cf6, 0.7)` en
`(-260, -120, -300)`, `HemisphereLight(0x9d7bff, 0x0b0618, 0.55)` y `AmbientLight(0xffffff, 0.32)`.

### 1.3 Niebla: inexistente

Verificado con búsqueda literal: no existe ninguna aparición de `new THREE.Fog`, `FogExp2`,
`scene.fog` ni `.fog =` en `src/`. Todos los materiales que podrían verse afectados declaran
explícitamente `fog: false` (cielo, discos de acreción, anillos de guía, divisor del menú, backdrop
de ciudad). La profundidad atmosférica se resuelve **solo** con shaders (rim Fresnel, gradientes y
halftone), no con niebla de escena.

Tampoco hay sombras ni post-proceso: cero apariciones de `castShadow`, `receiveShadow`, `shadowMap`,
`EffectComposer`, `UnrealBloom`, `renderer.toneMapping` u `outputColorSpace` en `src/`.

### 1.4 Cúpula de cristal (`domeArenaScene.ts:1023-1064`)

| Pieza | Definición exacta |
|---|---|
| Geometría | `new THREE.IcosahedronGeometry(90, 3)` |
| Material | `MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false, fog: false })` |
| Nombre | `'dome-crystal'` |
| Retícula | `new THREE.EdgesGeometry(domeGeo, 6)` (umbral 6°) sobre la misma geometría |
| Material de retícula | `LineBasicMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0.22, fog: false })` |
| Nombre de la retícula | `'dome-geodesic'` |
| Pulse por frame | `domeLineMat.opacity = 0.22 + 0.035 * (0.5 + 0.5 * Math.sin(elapsed * 0.8))` |
| Anillos guía | `TorusGeometry(90.1, 0.08, 6, 96)`, `MeshBasicMaterial({ color: 0x22d3ee, opacity: 0.25, depthWrite: false, fog: false })` |
| Guías | anillo ecuatorial (`rotation.x = π/2`), meridiano A (sin rotar), meridiano B (`rotation.y = π/2`) |

### 1.5 Barrera de juego (88.6 m)

No existe malla de barrera. El límite es puramente numérico: `DOME_PLAYER_BOUND_RADIUS = 88.6`
(`domeTypes.ts:204`) usado por `NyxDomeController.ts:3640-3643` (rebote del jugador),
`DomeCombatSystem.checkDomeBarrierKill` / `computeBarrierImpact`, y `DomeWaveManager.ts:341`
(`DOME_BARRIER_RADIUS_SQ`). El único indicador visual del rebote es el VFX
`MotionVfxSystem.spawnDomeBounceRing` (§9.3).

---

## 2. Cuerpos celestes y arquitectura orbital del backdrop

`createDomeArenaBackdrop(scene)` (`domeArenaScene.ts:995`) monta todo en un único `THREE.Group`
llamado `'dome-arena-backdrop'`, con PRNG determinista `mulberry32(20250601)`.

| Constante | Valor | Línea |
|---|---|---|
| `MONOLITH_COUNT` | 14 | `:39` |
| `ARC_COUNT` | 8 | `:40` |
| `FRAGMENT_COUNT` | 36 | `:41` |
| `ASTEROID_COUNT` | 11 | `:42` |
| `STAR_COUNT` (estrellas de 4 puntas) | 260 | `:43` |
| `PRISM_COUNT` | 16 | `:44` |
| `ABYSS_Y` | -125 | `:47` |

### 2.1 Bóveda espacial — shader `SKY_*` (`:189-248`)

- Malla: `SphereGeometry(800, 48, 32)`, `ShaderMaterial` con `side: BackSide`, `depthWrite: false`,
  nombre `'space-vault'`.
- Uniforms: `uTime`.
- Gradiente de altura `h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0)`:
  - `deep  = vec3(0.0157, 0.0196, 0.0627)` → **#040510**
  - `mid   = vec3(0.0471, 0.0784, 0.1882)` → **#0c1430**
  - `top   = vec3(0.1176, 0.0627, 0.2196)` → **#1e1038**
  - Mezclas: `mix(deep, mid, smoothstep(0.0, 0.55, h))`, luego `mix(col, top, smoothstep(0.52, 1.0, h))`.
- Nebulosa: dos campos `fbm` derivando (`dir * 2.6` con `uTime * 0.006 / 0.004`; `dir * 4.2` con
  `uTime * 0.005`); `nebA = vec3(0.10, 0.05, 0.22)`, `nebB = vec3(0.02, 0.14, 0.18)`;
  aporte `mix(nebA, nebB, n2) * pow(n1, 2.0) * 0.6`.
- Estrellas nítidas en dos capas de rejilla:
  - Capa densa: `dir * 55.0`, umbral `step(0.86, rnd)`, radio `smoothstep(0.10, 0.015, d)`,
    titileo `0.7 + 0.3 * sin(uTime * 1.7 + rnd * 90.0)`, color `vec3(0.85, 0.92, 1.0)`,
    ganancia `(0.35 + rnd * 0.8)`.
  - Capa escasa brillante: `dir * 26.0`, umbral `step(0.965, rnd2)`, radio
    `smoothstep(0.16, 0.03, d2)`, titileo `0.75 + 0.25 * sin(uTime * 2.3 + rnd2 * 130.0)`,
    tinte `mix(vec3(1.0, 0.85, 0.7), vec3(0.7, 0.85, 1.0), hash13(cell2 + 21.1))`, ganancia `1.4`.

### 2.2 Estrellas de 4 puntas — shaders `STAR_*` (`:316-361`)

- `THREE.Points` con atributos `aSize`, `aColor`, `aPhase`, `aSpeed`; material
  `ShaderMaterial({ uniforms: { uTime, uPixelScale: { value: 520 } }, transparent: true,
  depthWrite: false, blending: AdditiveBlending })`; nombre `'four-point-stars'`,
  `frustumCulled = false`.
- Distribución: `shellPoint(rng, 105, 250, ...)` (corona esférica de 105 a 250 m).
  `aSize = 1.1 + rng()*1.9`; `aSpeed = 0.6 + rng()*2.2`; `aPhase = rng()*2π`.
- Paleta: `[0x22d3ee, 0xf8fafc, 0xfbbf24, 0xf43f5e]`.
- Vertex: `vTwinkle = 0.55 + 0.45 * sin(uTime * aSpeed + aPhase)`;
  `gl_PointSize = aSize * uPixelScale / max(1.0, -mv.z)`.
- Fragment (cruz de 4 puntas):
  `vSpike = smoothstep(0.075, 0.0, ax) * pow(max(0.0, 1.0 - ay * 2.0), 1.5)` (y su simétrico
  `hSpike` en X), `core = smoothstep(0.20, 0.0, d)`, `glow = smoothstep(0.5, 0.0, d) * 0.22`;
  `a = clamp(vSpike + hSpike + core + glow, 0.0, 1.0) * vTwinkle`; `discard` si `a < 0.004`;
  color final `vColor * (0.85 + 0.6 * core)`.

### 2.3 Agujero negro abisal — shaders `ABYSS_*` (`:251-313`)

- Grupo `'abyss-singularity'` en `y = -125`; malla `PlaneGeometry(850, 850)` rotada `-π/2`,
  nombre `'abyss-vortex'`; `ShaderMaterial` transparente, `depthWrite: false`, `DoubleSide`,
  uniform `uTime`.
- Espiral polar: `spiral = ang * 2.0 + lr * 3.2 - uTime * 0.055` con `lr = log(max(r, 0.0008))`.
- Dos `fbm2` (`sp * 1.6 + vec2(0.0, uTime * 0.011)` y `sp * 3.2 - vec2(uTime * 0.008, 0.0)`);
  `mist = pow(clamp(n1 * 0.8 + n2 * 0.45, 0.0, 1.0), 1.6)`.
- Rampa morada documentada en el shader `#090218 -> #2e1065 -> #6b21a8 -> #c026d3`:
  - `c0 = vec3(0.0353, 0.0078, 0.0941)`
  - `c1 = vec3(0.1804, 0.0627, 0.3961)`
  - `c2 = vec3(0.4196, 0.1294, 0.6588)`
  - `c3 = vec3(0.7529, 0.1490, 0.8275)`
- Hebras: `threadA = pow(max(0.0, sin(spiral * 3.0 + n1 * 4.5)), 16.0)` teñida
  `vec3(0.55, 0.28, 1.0) * 0.7`; `threadB = pow(max(0.0, sin(spiral * 5.0 - n2 * 5.5 + 1.7)), 24.0)`
  teñida `vec3(1.0, 0.22, 0.55) * 0.55`.
- Pozo: `throat = smoothstep(0.30, 0.06, r)`, mezcla a negro absoluto `vec3(0.0)`.
- Aro de horizonte: `rim = smoothstep(0.28, 0.33, r) * smoothstep(0.46, 0.34, r)`,
  color `vec3(0.62, 0.35, 1.0) * rim * 0.55`.
- Alpha: `smoothstep(1.0, 0.30, r)` modulado por `mist`; `discard` si `alpha < 0.004`.
- Anillos del abismo (3 `TorusGeometry(1, 0.016, 4, 128)` con `MeshBasicMaterial` aditivo):

| Radio | Color | Opacidad | `y` | Tilt | Velocidad de giro |
|---|---|---|---|---|---|
| 58 | `0x8b5cf6` | 0.55 | 1.4 | 0.05 | 0.09 |
| 96 | `0xc026d3` | 0.40 | 3.2 | -0.07 | -0.06 |
| 148 | `0x6d28d9` | 0.30 | 5.6 | 0.04 | 0.04 |

El grupo rota `abyssGroup.rotation.y += dt * 0.008` y cada anillo `rotation.z = elapsed * speed`.

### 2.4 Pilar del Mundo (`world-pillar`, posición `110, -40, -140`)

- Material `GALAXY_CEL` con `baseColor 0x1a1236`, `shadowTint 0x0a0718`, `veinA 0x22d3ee`,
  `veinB 0xa855f7`, `rimColor 0x7dd3fc`, `veinStrength 1.15`, `rimStrength 0.95`.
- 5 segmentos `CylinderGeometry(6.2, 7.4, 40, 8, 1)` fracturados (`fractureGeometry(geo, 0.35, 7)`),
  en `y = 20 + i * 50` (de y=-40 a y=200), jitter XZ `±1.5`, rotación aleatoria pequeña,
  `taper = 1 - (i / 4) * 0.22`, contorno `addComicOutline(seg, 0.4, 0xa5f3fc)`.
- Anillos de energía: `TorusGeometry(11.5, 0.45, 6, 48)` en alturas `[5, 55, 105, 155]`,
  alternando `createEnergyRingMaterial(0xfbbf24, 0xfff7d6, 2.4)` (oro) y
  `createEnergyRingMaterial(0x22d3ee, 0xe0fbff, 3.1)` (cian); inclinación
  `π/2 + (i - 1.5) * 0.16`, `rotation.y = i * 0.5`, precesión
  `speed = (i % 2 === 0 ? 1 : -1) * (0.05 + i * 0.018)`.

### 2.5 Singularidad / Eclipse Cenital (`singularity`, posición `0, 175, -60`)

- Núcleo: `SphereGeometry(13, 48, 32)` con `createGravityLensMaterial(0x22d3ee, 0xa855f7, 0xffffff, 1.15)`,
  nombre `'singularity-lens'`.
- Disco interior: `RingGeometry(15, 34, 128, 4)`, `spin 0.55`, `opacity 1.0`,
  `colA 0x3b0764`, `colB 0x22d3ee`, `colC 0xf43f5e`, `colD 0xfbbf24`;
  `diskA.rotation.x = π/2`, wrapper `rotation.x = 0.42`, precesión `rotation.y = elapsed * 0.32`.
- Disco exterior: `RingGeometry(20, 46, 128, 4)`, `spin -0.34`, `opacity 0.55`,
  `colA 0x1e1b4b`, `colB 0x6d28d9`, `colC 0x22d3ee`, `colD 0xc4b5fd`;
  wrapper `rotation.set(-0.75, 0.6, 0)`, precesión `rotation.y = -elapsed * 0.21`.

### 2.6 Agujeros negros del horizonte (`horizon-black-hole-0/1`)

| # | Posición | Núcleo | Anillo | Tilt | Velocidad | `rimA`/`rimB` | `colA..colD` |
|---|---|---|---|---|---|---|---|
| 0 | `-185, 45, -150` | r 9.5 (esfera 40×28) | 13 → 30 | 0.55 | 0.24 | `0xa855f7` / `0x22d3ee` | `0x2e1065`, `0xa855f7`, `0xf0abfc`, `0xfbbf24` |
| 1 | `195, -20, 130` | r 7.5 (esfera 40×28) | 10.5 → 24 | -0.42 | -0.19 | `0x22d3ee` / `0x6366f1` | `0x0e7490`, `0x22d3ee`, `0x818cf8`, `0xffffff` |

Materiales: núcleo `createGravityLensMaterial(rimA, rimB, 0xffffff, 1.0)`; disco
`createAccretionMaterial({ inner, outer, spin: 0.48, opacity: 0.9, ... })` con
`RingGeometry(inner, outer, 96, 4)` y `rotation.x = π/2`.

### 2.7 Archipiélago de ruinas en órbita

**14 monolitos** (`InstancedMesh`, nombre `'monoliths'`): `CylinderGeometry(0.75, 1.6, 11, 5, 1)`
fracturado (`fractureGeometry(geo, 0.55, 3)`); material `GALAXY_CEL` con `baseColor 0x2b2150`,
`shadowTint 0x0d0a1e`, `veinA 0x22d3ee`, `veinB 0xa855f7`, `rimColor 0x9df3ff`, `veinStrength 1.0`,
`rimStrength 0.85`. Distribución en espiral de Fibonacci con ángulo dorado
`Math.PI * (3 - Math.sqrt(5))`, radio `120 + rng()*140`, escala `x/z = 2.4 + rng()*2.2`,
`y = 3.0 + rng()*3.0`, cuaternión uniforme (Shoemake). Paleta de instancia
`[0x231b45, 0x1a1533, 0x2b2150, 0x151d38]` multiplicada por `0.85 + rng()*0.35`.
Contorno: `createInkOutlineMaterial(makeTime(), 0.5, 0x9df3ff)`.

**8 arcos rúnicos**: `TorusGeometry(7, 0.55, 5, 26, π * 1.3)` + núcleo
`TorusGeometry(7, 0.13, 4, 40, π * 1.3)`. Material arco `GALAXY_CEL` (`baseColor 0x332a5e`,
`shadowTint 0x0d0a1e`, `veinA 0x22d3ee`, `veinB 0xf0abfc`, `rimColor 0x7dd3fc`, `veinStrength 1.1`,
`rimStrength 0.9`); material núcleo (`baseColor 0x86efff`, `shadowTint 0x0e7490`, `veinA 0xffffff`,
`veinB 0x22d3ee`, `rimColor 0xffffff`, `veinStrength 2.2`, `rimStrength 1.3`).
Azimut `(i / 8) * 2π + (rng() - 0.5) * 0.3`; elevación `-0.5 + (i % 4) * 0.42 + (rng() - 0.5) * 0.18`;
radio `120 + rng()*95`; escala `1.8 + rng()*1.2`; paleta `[0x2a2350, 0x332a5e, 0x1e2a4d]`;
contorno `0.3, 0x7dd3fc`.

**36 fragmentos**: `IcosahedronGeometry(1.15, 0)` fracturado `0.45`; material `COSMIC_ROCK`
(`rockColor 0x3b3266`, `shadowTint 0x0b0a14`, `crackA 0xa855f7`, `crackB 0x22d3ee`,
`rimColor 0xd8fbff`, `crackStrength 1.2`); órbitas planas con base ortonormal (`u`,`v` ⊥ normal),
radio `85 + rng()*135`, velocidad `(0.008 + rng()*0.04) * ±1`, escala `1.4 + rng()*2.4`,
giro `0.1 + rng()*0.4`; paleta `[0x3b3266, 0x2a2350, 0x1e2f4a, 0x4b3f7a]`;
contorno `0.12, 0xd8fbff`. Las matrices se recalculan por frame (`applyFragmentMatrices`).

**11 asteroides** (`'asteroid-current'`): `DodecahedronGeometry(1, 0)` fracturado `0.22`;
material `COSMIC_ROCK` (`rockColor 0x1b1533`, `shadowTint 0x07060f`, `crackA 0xa855f7`,
`crackB 0x22d3ee`, `rimColor 0xd8fbff`, `crackStrength 1.7`); radio `68 + rng()*107`,
velocidad `(0.012 + rng()*0.05) * ±1`, escala base `2.2 + rng()*4.0` con variación por eje,
giro `0.12 + rng()*0.55`; paleta `[0x0b0a14, 0x141026, 0x1b1533, 0x241a3d]`;
contorno `0.18, 0xd8fbff`.

**16 prismas de cristal galáctico** (`'floating-prisms'`): `OctahedronGeometry(1, 0)` escalado
`(1, 2.3, 1)`; material `CRYSTAL_PRISM` (`uCrystalTint 0x22d3ee`, `uRimColor 0xffffff`,
`uPulse 1.0`); radio `105 + rng()*150`, velocidad `(0.01 + rng()*0.035) * ±1`, escala
`1.4 + rng()*2.2`, giro `0.15 + rng()*0.5`, bob vertical `amp 1.5 + rng()*4.5` con
`speed 0.25 + rng()*0.7`; paleta `[0x22d3ee, 0xf8fafc, 0xfbbf24, 0xf43f5e]`;
atributo instanciado `aPhase` aleatorio; contorno `0.1, 0xffffff`.

---

## 3. Anillos de materia oscura (overlay 2D) — `src/ui/DomeDarkMatterRings.tsx`

Canvas 2D a pantalla completa con bucle `requestAnimationFrame` propio (sin estado de React),
montado junto al canvas de juego; lee `controllerRef.current.getDarkMatterRings()` por frame.

| Constante / parámetro | Valor | Línea |
|---|---|---|
| `RING_VERTICES` | 72 | `:21` |
| `REF_RADIUS` | 133 (unidades de referencia) | `:23` |
| `TIME_SPEED` | 0.9 (referencia +0.015/frame ≈ 0.9/s) | `:25` |
| `ROT_SPEED` | 0.85 (referencia +0.014/frame ≈ 0.84/s) | `:26` |
| DPR | `Math.min(window.devicePixelRatio \|\| 1, 2)` | `:131` |
| `dt` máximo por frame | `0.05` | `:153` |

Ruido angular `darkNoise(angle, t, freq, instability)` (`:35-56`): armónicos
`f1..f4 = round(3,7,13,29 * freq)` con pesos `0.4, 0.3, 0.2, 0.1` y espina
`pow(max(0, sin(angle*(f2+2) + t*3.5) * cos(angle*f3 - t*2.1)), 3) * instability * 1.4`.

Forma del polígono (`traceRingPath`, `:79-125`): `scale = ring.radius / 133`;
magnitud `pow(abs(raw), sign > 0 ? 3.1 * 0.75 : 3.1 * 1.2)`; `dirMult = 1.25 / 0.65`;
jitter por vértice `sin(i * 19.3 + t * 15 + ring.phase) * instability * 4` (solo si
`instability > 0.2`); radio mínimo `15` unidades de referencia; clamp en píxeles
**72 %..135 %** del radio del aro.

Estilo de dibujo:

- Aro principal: `spike = 0.85 + 0.4 * ring.t`, `freq 1.6`, `instability 0.55`, `radiusScale 1`.
  Halo `strokeStyle 'rgba(255, 255, 255, 0.16)'`, `lineWidth = 2.5 * strokeScale * 3.2`;
  trazo `'#ffffff'` con `lineWidth = 2.5 * strokeScale`; `lineJoin 'miter'`, `miterLimit 10`.
- Eco: 75 % de vértices (`Math.max(12, floor(72 * 0.75))` = 54), `radiusScale 0.88`,
  contrarrotación `-rotation * 1.3`, `freq * 1.15`, `instability * 1.1`, `tOffset 10.5`,
  `lineWidth = max(1, 1.125 * strokeScale)`, opacidad `baseAlpha * 0.45`.
- `strokeScale = clamp(radius / 133, 0.8, 1.2)`.
- Opacidad en estado pasivo (`ring.pulse === true`):
  `0.35 + 0.05 * sin(pulseTime * 9.4 + ring.phase)` → flujo **30 %..40 %**;
  con radar de Tab (`pulse === false`) alpha = 1.
- Los aros con `alpha <= 0.01` se saltan; si no hay aros, se limpia el canvas una sola vez.

---

## 4. Suelos: losas, suelos flotantes y baldosas de la cúpula

### 4.1 `DomeSlabs.ts` — colisión y losas estáticas

Modelo de colisión compartido por todos los suelos (`SlabCollider`, `domeTypes.ts`):

1. **OBB con triángulo 2D opcional** (`localTriangle2D`): punto más cercano en el plano XZ local
   (`closestPointOnTriangle2D`, Ericson) con clamp en Y por `halfExtents.y`; si el centro queda
   dentro, se expulsa por la cara de menor penetración.
2. **Malla exacta** (`exactMesh`): colisión contra los triángulos reales de la malla visible
   (tapa + raíz iceberg) escalados por `mesh.scale`; culling por esfera envolvente
   `exact.boundRadius`; margen de expulsión `ICEBERG_EXPEL_MARGIN = 0.06` (m de mundo).
3. **Raycast**: Möller–Trumbore para `exactMesh`; slab test por ejes para OBB
   (`raycastSlabs`, con `out` reutilizable y `t` en distancia de mundo).

`updateSlabMotion(slabs, time)` (`:135-144`): bob senoidal
`center = basePos + (0,1,0 rotado por quaternion) * sin(time * 0.9 + phase) * bobAmplitude`;
salta los slabs con `exactMesh` (los gestiona `DomeFloatingSlabManager.update`) y los de
`bobAmplitude <= 0`. Consumido por `NyxDomeController.ts:1402`.

`SLAB_SPECS` (`:593-613`), 10 losas, formato `pos / size / rot / bob / rim`:

| # | pos | size | rot | bob | rim |
|---|---|---|---|---|---|
| 0 | `0, -3.0, 0` | `22, 1.4, 22` | `0, 0.15, 0` | 0.18 | `#22d3ee` |
| 1 | `-30, 9.0, -20` | `15, 1.2, 15` | `0.35, 0.4, 1.15` | 0.35 | `#a855f7` |
| 2 | `32, 15.0, -16` | `16, 1.2, 12` | `-0.25, -0.5, -0.95` | 0.32 | `#22d3ee` |
| 3 | `0, 18.0, -42` | `18, 1.2, 14` | `π*0.48, 0.1, 0` | 0.28 | `#f43f5e` |
| 4 | `-38, -4.0, 28` | `14, 1.2, 16` | `0.2, -0.3, 1.35` | 0.38 | `#a855f7` |
| 5 | `6, 36.0, -24` | `20, 1.3, 15` | `π, 0.3, 0.12` (techo, boca abajo) | 0.25 | `#22d3ee` |
| 6 | `-20, -22.0, 24` | `14, 1.2, 14` | `0.42, -0.25, 0.35` | 0.40 | `#22d3ee` |
| 7 | `28, -16.0, 30` | `15, 1.2, 15` | `-0.65, 0.2, 0.48` | 0.36 | `#a855f7` |
| 8 | `42, 4.0, 30` | `13, 1.2, 13` | `0.55, 0.8, -0.45` | 0.42 | `#22d3ee` |
| 9 | `-24, 28.0, 26` | `15, 1.2, 14` | `-2.6, 0.4, 0.25` | 0.30 | `#a855f7` |

Materiales: `createComicCelMaterial('#1e1b4b', { rimColor: '#22d3ee', rimStrength: 0.78 })` y
`createComicCelMaterial('#17153b', { rimColor: '#a855f7', rimStrength: 0.78 })`; contorno
`addComicOutline(mesh, 0.055, color)` con color `0xa855f7` / `0xf43f5e` / `0x22d3ee` según spec;
`phase = idx * 1.15`; `halfExtents = size * 0.5`.
`createDomeSlabs` (línea 620) está exportado pero **no tiene ningún call site en `src/`**
(verificado por búsqueda); el sistema activo en el bucle de juego es `DomeFloatingSlabManager`
+ `DomeSphereTileManager` (`domeGameLoop.ts:146-148`).

### 4.2 `DomeFloatingSlabs.ts` — suelos arrancados que cruzan la cúpula

Bucle descrito en la cabecera del módulo: cada suelo activo recorre una **cuerda** que cruza la
esfera de parte a parte, nace fuera de la cúpula donde la cámara no mira, la atraviesa a
2.2..4.2 m/s con bob y rotación suaves, y al salir se desvanece y re-entra desde el borde.

| Constante | Valor | Línea |
|---|---|---|
| `POOL_SIZE` | 10 | `:17` |
| `ENTER_SPEED` | 1.5 (0→1 en ~0.7 s) | `:19` |
| `EXIT_SPEED` | 2.2 (0→1 en ~0.45 s) | `:21` |
| `SHATTER_SPEED` | 6.0 (0→1 en ~0.17 s) | `:23` |
| `ACTIVE_THRESHOLD` | 0.5 | `:25` |
| `DOME_RADIUS` | 90 | `:28` |
| `CHORD_SPAWN_R_MIN` / `MAX` | 96 / 102 | `:30-31` |
| `REENTRY_SPAWN_R` | 98 | `:33` |
| `CHORD_END_R` | 96 | `:35` |
| `EXIT_RADIUS` | 93 | `:37` |
| `CHORD_SPEED_MIN` / `MAX` | 2.2 / 4.2 m/s | `:39-40` |
| `MIN_GAP` | 5 m | `:42` |
| `ENTRY_CHECK_DIST` | 15 m | `:44` |
| `SPAWN_ATTEMPTS` | 12 | `:46` |
| `OFFSCREEN_DOT` | 0.2 | `:48` |
| `SEPARATION_RATE` | 5 (1/s) | `:50` |

Generación por instancia (`constructor`, `:99-160`), con PRNG `mulberry32(0x9e3779b9)`:
`seed = 1000 + i * 137`; `radiusX = 7 + rand()*6`; `radiusZ = 6 + rand()*6`;
`thickness = 1.6 + rand()*1.0`; orientación inicial
`rotation.set(±π*0.9, rand()*2π, ±1.2)`; `bobAmplitude = 0.22 + rand()*0.3`;
`spinSpeed = (rand()*2 - 1) * 0.12` rad/s; `phase = rand() * 2π`;
contorno `addComicOutline(mesh, 0.05, 0x090b14)`; material `createDameroTileMaterial()` propio
por instancia; `mesh.visible = false`, `mesh.scale.setScalar(0.0001)`.

Asignación de cuerda (`assignChord`, `:183-239`): dirección de nacimiento aleatoria en la esfera
exterior, radio `96..102` (o `18..56` en materialización inmediata, `98..98` al reciclar);
punto final con desviación aleatoria ×0.35 + opuesto ×96; valida separación
`sepRadiusA + sepRadiusB + 5` en el nacimiento **y** a 15 m del tramo de entrada; exige
`dot(normalize(spawnPos - camPos), camFwd) < 0.2` (fuera de vista) y corta en cuanto ambas
condiciones se cumplen.

Ciclo por frame (`update`, `:322-403`):

1. Activación: si `active && !hasChord` → `assignChord`.
2. Avance: `basePos += chordDir * speed * dt`.
3. Reciclaje: marca `enteredInside` al pasar `r < 90`; `exiting = true` cuando
   `enteredInside && r > 93`.
4. Transición: `target = active && !exiting ? 1 : 0`;
   `speed = target === 1 ? 1.5 : (shattered ? 6.0 : 2.2)`; `moveTowards`.
5. Al llegar a 0 con `exiting` → nueva cuerda desde `R = 98` (y `shattered = false`).
6. Escala con easing `eased = t*t*(3-2t)`, mínimo `0.0001`; `halfExtents` escalados igual.
7. `mesh.rotateY(spinSpeed * dt)`; quaternion e inverso del collider sincronizados.
8. Bob sobre el eje local `+Y`: `sin(elapsed * 0.9 + phase) * bobAmplitude`.
9. Uniforms: `uOpacity = transition`, `uTime = elapsed`, `uWarning = warningLevel`.

Rotura (`shatterSlab(slabId)`, `:304-315`): solo si `active && !exiting`; pone
`exiting = true` y `shattered = true` (fade a `SHATTER_SPEED`) y devuelve el collider para que el
llamador genere escombros. Uso real: `domeGameLoop.ts:480-486` (`onSlabSmash` →
`shatterSlab` + `skillExecutor.spawnSlabDebris(shattered.center, 4)`).

Separación mutua (`resolveSeparation`, `:405-440`): si dos suelos visibles están a menos de
`sepRadiusA + sepRadiusB + 5`, se empujan a lo largo de la línea que los une con
`push = (minDist - dist) * min(1, 5 * dt) * 0.5` (mitad cada uno, vía `shiftSlab`).

`setTargetCount(count)` (0..10): oleadas básicas piden 4..7
(`domeGameLoop.ts:206-208`: `4 + floor(random()*4)`), miniboss y boss ponen 0.
`materializeActiveImmediate` materializa al instante (transition = 1) para que el Cangrejo
Artillero nazca anclado a un suelo.
`getActiveColliders()` devuelve los colliders con `transition >= 0.5` en un array reutilizado.

### 4.3 `DomeSlabGeometry.ts` — geometría del trozo y shader del damero

**Geometría** (`createTornSlabGeometry(seed, radiusX, radiusZ, thickness)`):

| Parámetro | Valor |
|---|---|
| `CONTOUR_VERTS` | 20 (contorno irregular, jitter angular acotado a `0.55` de medio paso) |
| `ICEBERG_RINGS` | 5 anillos de raíz (el 0 es el borde de la tapa) |
| Jitter radial del contorno | `0.78 + rand()*0.42 + 0.12 * sin(i * 2.399 + seed * 0.71)` |
| Profundidad de raíz | `(radiusX + radiusZ) * (0.26 + rand()*0.16)` (≈4-7.5 m) |
| Desplazamiento del ápice | `±radiusX * 0.38`, `±radiusZ * 0.38` |
| Taper de anillos | `1 - 0.5 * pow(t, 1.25)`; deriva `pow(t, 1.6)` |
| Ruido radial | `fbm3` con `radialAmp = 0.36 * pow(t, 1.3)` |
| Espolones | `spur > 0.4 ? (spur - 0.4) * 0.85 * t : 0` |
| Ruido vertical | `yBase - yNoise * depth * 0.09 * pow(t, 1.4)` |
| Tapa | abanico desde el centro en `Y = +thickness/2`, normal exacta `(0, 1, 0)`, `aIsTop = 1` |
| UVs de la tapa | `(x * 0.35, z * 0.35)` |
| Roca | triángulos **no indexados**, normal por cara (flat shading), `aIsTop = 0` |

Salida: `{ geometry, halfExtents: Vector3(maxX, thickness/2, maxZ), boundRadius, capContour }`.
La cara superior del collider coincide con la tapa (`Y = +halfExtents.y`), de modo que la raíz
colgante es solo visual salvo en la colisión exacta por malla.

**Shader del damero** (`tileVertexShader` / `tileFragmentShader`, `:75-206`):

- Uniforms: `uWarning`, `uOpacity`, `uTime`, `uSunDir` (propio, **no** compartido:
  `new THREE.Vector3(0.35, 0.8, 0.45).normalize()`, `:235`).
- Atributo de vértice: `aIsTop` (**solo** este atributo decide si una cara es baldosa; con flat
  shading, crestas que miran arriba no se pintan como baldosas).
- Paleta literal del shader: `TILE_LIGHT vec3(0.910, 0.933, 0.969)` (**#e8eef7** marfil),
  `TILE_DARK vec3(0.106, 0.145, 0.220)` (**#1b2538** azul-gris),
  `GROUT vec3(0.043, 0.078, 0.125)`, `ACCENT_A vec3(0.204, 0.827, 0.600)` (**#34d399**),
  `ACCENT_B vec3(0.133, 0.827, 0.933)` (**#22d3ee**), `ROCK_DARK vec3(0.094, 0.067, 0.149)`
  (**#181126**), `ROCK_LIT vec3(0.169, 0.114, 0.239)` (**#2b1d3d**),
  `WARN_RED vec3(1.0, 0.145, 0.106)`, `WARN_AMBER vec3(1.0, 0.522, 0.106)`,
  `RIM_INK vec3(0.490, 0.408, 0.839)`.
- Cel de 3 bandas: `celBands(ndl)`: `> 0.62 → 1.0`, `> 0.18 → 0.66`, resto `0.38`.
- Damero: `cell = vUv * 2.0`, `check = mod(id.x + id.y, 2.0)`, juntas
  `smoothstep(0.028, 0.05, g)`; franjas de acento cada 4 baldosas
  (`mod(id.x, 4.0) < 0.5`) con pulso `0.72 + 0.28 * sin(uTime * 1.8 + (id.x + id.y) * 0.6)`;
  color de acento `mix(ACCENT_A, ACCENT_B, 0.5 + 0.5 * sin(id.x*1.7 + id.y*2.3))`.
- Rim de baldosa `pow(1 - abs(dot(normalW, vViewDir)), 3.0) * 0.16`.
- Roca: `mix(ROCK_DARK, ROCK_LIT, band)` con grietas
  `crackNoise(vLocalPos * 1.35)` (`1 - smoothstep(0.0, 0.055, abs(n))`, oscurece 32 %),
  labio rasgado `smoothstep(0.12, 0.6, vLocalNormal.y) * 0.22` y rim violeta
  `pow(1 - abs(dot(normalW, vViewDir)), 2.6) * 0.30`.
- Aviso: `pulse = 0.5 + 0.5 * sin(uTime * 7.0)`, `warnAmt = uWarning * (0.42 + 0.38 * pulse)`,
  mezcla a `mix(WARN_RED, WARN_AMBER, pulse) * (0.95 + 0.5 * pulse)`.
- Material `transparent: true`, sale con `alpha = uOpacity`.

### 4.4 `DomeSphereTiles.ts` — baldosas triangulares de la cúpula geodésica

- Fuente: `new THREE.IcosahedronGeometry(DOME_ARENA_RADIUS = 90, 3)` convertida a no indexada.
  El comentario del módulo fija **320 triángulos** (20 caras × 16 sub-triángulos); el código
  deriva `triangleCount = pos.count / 3` de la geometría real.
- Cada triángulo se convierte en un prisma triangular: marco ortonormal con `+Y = inward` (normal
  hacia el centro), centro a `-(TILE_SURFACE_RADIUS + TILE_THICKNESS/2)` → cara interior pisable a
  **87.5 m**, espesor `2.2`.
- Geometría (`buildTileGeometry`): 9 triángulos, `addGroup(0, 3, 0)` (cara interior, material 0) y
  `addGroup(3, 21, 1)` (resto del prisma, material 1); UVs de la cara superior
  `1 / CHECKER_TILE_METERS = 1/4`.
- Material 0: `MeshStandardMaterial` con texturas canvas 256×256
  (`map`: `#f5f7ff` / `#152a6e` / juntas `#3b4a6b`; `emissiveMap`: junta horizontal `#22d3ee`,
  vertical `#34d399`), `emissive 0xffffff`, `emissiveIntensity 0.85`, `roughness 0.55`,
  `metalness 0.05`, `RepeatWrapping`, `SRGBColorSpace`, `anisotropy 4`.
- Material 1: `createComicCelMaterial('#141a2e', { rimColor: '#38bdf8', rimStrength: 0.5 })`.
- `TILE_POOL_SIZE = 120` mallas reutilizadas.

Modos (`setMode`):

| Modo | Comportamiento | Constantes |
|---|---|---|
| `'none'` | todo desactivado | — |
| `'miniboss'` | 10..20 triángulos aleatorios; rotan cada 10 s; aviso 2,2 s antes | `MINIBOSS_ROTATE_PERIOD = 10.0`, `MINIBOSS_WARN_LEAD = 2.2` |
| `'boss'` | 120 triángulos fijos elegidos con Fisher-Yates sin reemplazo sobre los 320 | `TILE_POOL_SIZE = 120` |

Aviso pre-rotación (`applyWarning`, `:454-467`): `pulse = 0.5 + 0.5 * sin(elapsed * 9.0)`,
`flicker = sin(elapsed * 47.0) > 0 ? 1 : 0.25`, tinte `warnRed (0xff2a1a) ↔ warnAmber (0xffb020)`
con `0.5 + 0.5 * sin(elapsed * 5.5)`, `emissiveIntensity = 0.85 + (1.4 + pulse * 1.8) * flicker`,
vibración a lo largo de la normal interior `sin(elapsed * 62.0) * 0.07 * (0.4 + 0.6 * pulse)`.
Colliders: `oneSidedTop: true`, `localTriangle2D` = proyección XZ del triángulo,
`phase = tileIndex * 0.37`, `bobAmplitude = 0`, `id = 'dome-tile-<n>'`.

### 4.5 Escombros y regeneración

- `DomeFloatingSlabManager.shatterSlab` saca el suelo de la colisión de inmediato (fade a 6.0) y
  luego lo recicla con una cuerda **nueva** desde `R = 98` — no reaparece en el mismo sitio.
- `domeGameLoop.ts:480-486`: `onSlabSmash` → `shatterSlab` + `spawnSlabDebris(center, 4)`.
- `DomeSkillExecutor.spawnSlabDebris(origin, count)` (`DomeSkills.ts:1020-1053`): crea rocas
  `small`/`medium` (`sizeKind = i % 3 === 0 ? 'medium' : 'small'`) con `velocity` aleatoria
  normalizada × `2.5 + random()*3.5` y `spinAxis` aleatorio.
- Límites y succión (`DomeSkills.ts:96-102`): `MAX_LOOSE_DEBRIS = 12` (se descarta el más antiguo),
  `DEBRIS_ABSORB_RADIUS = 9` m, `DEBRIS_ABSORB_DISTANCE = 0.7` m,
  `DEBRIS_DRIFT_DAMPING = 0.8` (1/s). Los escombros absorbidos pasan a fragmentos orbitantes del
  Campo Gravitacional (`absorbDebrisIntoField`).
- Las baldosas de la cúpula (`DomeSphereTiles`) no generan escombros: solo rotan de set.

---

## 5. Inventario completo de shaders GLSL personalizados

| # | Shader (constantes / función) | Archivo | Uniforms principales | Técnica |
|---|---|---|---|---|
| 1 | `GLSL_NOISE` (librería) | `domeArenaScene.ts:110` | — | `hash13`, `vnoise`, `fbm` (4 octavas), `hash12`, `vnoise2`, `fbm2` (5 octavas), `halftoneDots` (30°) |
| 2 | `SKY_VERTEX` / `SKY_FRAGMENT` | `:189` / `:197` | `uTime` | Gradiente vertical de 3 colores + nebulosa fbm doble + 2 capas de estrellas de rejilla |
| 3 | `ABYSS_VERTEX` / `ABYSS_FRAGMENT` | `:251` / `:259` | `uTime` | Espiral polar `log(r)`, rampa morada de 4 pasos, hebras, pozo negro, aro de horizonte |
| 4 | `STAR_VERTEX` / `STAR_FRAGMENT` | `:316` / `:337` | `uTime`, `uPixelScale` (520) | Puntos procedurales con cruz de 4 puntas, núcleo y glow |
| 5 | `GALAXY_CEL_VERTEX` / `GALAXY_CEL_FRAGMENT` | `:364` / `:394` | `uBaseColor`, `uShadowTint`, `uVeinA`, `uVeinB`, `uRimColor`, `uSunDir`, `uTime`, `uVeinStrength`, `uRimStrength`, `uHalftoneEnabled` | Cel 3 bandas + halftone + vetas fbm de galaxia + rim Fresnel; soporta `USE_INSTANCING` / `USE_INSTANCING_COLOR` |
| 6 | `INK_OUTLINE_VERTEX` / `INK_OUTLINE_FRAGMENT` | `:461` / `:487` | `uThickness`, `uTime`, `uInkColor` | Inverted Hull BackSide con grosor tipo pincel |
| 7 | `COSMIC_ROCK_FRAGMENT` (vertex reutiliza `GALAXY_CEL_VERTEX`) | `:498` | `uRockColor`, `uShadowTint`, `uCrackA`, `uCrackB`, `uRimColor`, `uSunDir`, `uTime`, `uCrackStrength`, `uHalftoneEnabled` | Cel 3 bandas + halftone + crestas de grieta (`1 - abs(2n-1)`) con pulso |
| 8 | `CRYSTAL_PRISM_VERTEX` / `CRYSTAL_PRISM_FRAGMENT` | `:564` / `:598` | `uCrystalTint`, `uRimColor`, `uSunDir`, `uTime`, `uPulse`, atributo `aPhase` | Arcoíris iridiscente por `dot(N,V)` + facetas cel + pulso por instancia |
| 9 | `GRAVITY_LENS_VERTEX` / `GRAVITY_LENS_FRAGMENT` | `:648` / `:662` | `uTime`, `uRimA`, `uRimB`, `uRimC`, `uIntensity` | Interior negro absoluto, horizonte de sucesos ardiente, photon ring, filo `pow(fres, 18)` |
| 10 | `ACCRETION_VERTEX` / `ACCRETION_FRAGMENT` | `:704` / `:712` | `uTime`, `uInner`, `uSpin`, `uOpacity`, `uColA..uColD` | Ring UV polar, espiral `fbm2` doble, hebras `pow(..., 14)`, aditivo |
| 11 | `ENERGY_RING_VERTEX` / `ENERGY_RING_FRAGMENT` | `:761` / `:775` | `uColorA`, `uColorB`, `uSunDir`, `uTime`, `uFlowSpeed` | Flujo circunferencial `uv.x * 2π * 3`, doble pulso, cel 3 bandas, rim mágico |
| 12 | `tileVertexShader` / `tileFragmentShader` | `DomeSlabGeometry.ts:75` / `:99` | `uWarning`, `uOpacity`, `uTime`, `uSunDir` | Damero de baldosas + roca iceberg, cel 3 bandas, grietas, rim, aviso rojo/ámbar |
| 13 | `celVertexShader` / `celFragmentShader` | `toonMaterials.ts:40` / `:67` | `uColor`, `uShadowTint`, `uRimColor`, `uRimPower`, `uRimStrength`, `uEmissiveBoost`, `uOpacity`, `uSunDir`, `uHalftoneEnabled` | Cel-shading estándar del juego + halftone + rim + rebote de cielo |
| 14 | Inline de `addComicOutline` | `toonMaterials.ts:229` | `uThickness`, `uNoiseAmp`, `uInkColor`, `uDistanceScale` | Inverted Hull con skinning y engorde por distancia |
| 15 | `skyVertexShader` / `skyFragmentShader` | `toonMaterials.ts:302` / `:310` | `uSunDir`, `uTime`, `uHalftoneEnabled` | Cosmic Dreamscape: 5 colores, sol de cómic, planeta anillado, nubes cel-stepped, auroras, estrellas |
| 16 | `starVertexShader` / `starFragmentShader` | `toonMaterials.ts:513` / `:534` | `uTime`, atributos `aPhase`, `aTint` | Titileo + sparkle `pow(..., 6)` en octaedros instanciados |
| 17 | `dividerVertexShader` / `dividerFragmentShader` | `menuShaders.ts:30` / `:38` | `uTime`, `uAspect` | Blade diagonal líquido + papel + filo de tinta + estela carmesí/violeta/cian + halftone |
| 18 | `SHARD_VERT` / `SHARD_FRAG` + `NOISE_GLSL` | `ComicImpactVfx.ts:46` / `:94` / `:60` | `uTime`, `uColorA` (0x8b5cf6), `uColorB` (0x4c1d95), atributos `color`, `aVoid` | Picos planos o nebulosa de pantalla según `aVoid` |
| 19 | `particleVertexShader` / `particleFragmentShader` | `MotionVfx.ts:37` / `:52` | atributos `aColor`, `aAlpha`, `aSize` | Puntos suaves con tamaño `aSize * 320 / -mv.z` |
| 20 | `enemyNebulaVert` / `enemyNebulaFrag` | `DomeEnemyModels.ts:120` / `:145` | `uColorA`, `uColorB`, `uRimColor`, `uTime`, `uOpacity`, `uEmissiveBoost` | Universo interior fbm + `starLayer` + wobble de energía + alpha Fresnel |
| 21 | `createButterflyQuartzMaterial` (vertex+frag inline) | `DomeEnemyModels.ts:262` | `uTime`, `uCharge` (0.45), `uEmissiveBoost` | Cuarzo facetado + arcos piezoeléctricos en ranuras + fresnel cristalino |
| 22 | `addVibratingInkOutline` (vertex+frag inline) | `DomeEnemyModels.ts:362` | `uThickness`, `uNoiseAmp`, `uInkColor`, `uTime`, `uDistanceScale` | Inverted Hull que vibra con `energyWobble` igual que la carne |
| 23 | `kronosCosmosVert` / `kronosCosmosFrag` | `DomeEnemyModels.ts:1102 / :1121` | `uDeepColor`, `uNebulaA`, `uNebulaB`, `uRimColor`, `uTime`, `uOpacity`, `uEmissiveBoost` | Cosmos de pantalla (portado de `character-sheet.html`) para SOLAR RIFT / VOID COSMOS |
| 24 | `capturedInkBallMaterial` (inline) | `DomeSkills.ts:594` | `uDeepColor`, `uNebulaA`, `uNebulaB`, `uRimColor`, `uTime` | Nebulosa cósmica de bola de tinta capturada |
| 25 | `capturedElectricBallMaterial` (inline) | `DomeSkills.ts:669` | `uDeepColor`, `uNebulaA`, `uElectricCyan`, `uRimColor`, `uTime` | Cosmos + arcos voltaicos (híbrido Nyx/Mariposa) |
| 26 | `AREA_DOME_VERT` / `AREA_DOME_FRAG` → `createAreaDomeMaterial` | `DomeSkills.ts:409` | `uColorA` (0x22d3ee), `uColorB` (0xa855f7), `uOpacity` (0.55) | Cúpula de área con rim `smoothstep(0.35, 1.0, f)` y alpha `uOpacity * (0.10 + rim * 0.90)` |
| 27 | `inkProjectileMaterial` (inline) | `DomeWaveManager.ts:1173` | `uTime` | Galaxia/plasma carmesí con pulso de vértices (`wobble * 0.085`) y motas estelares |
| 28 | `makeElectricBallShader` | `DomeWaveManager.ts:1259` | `uTime`, `uCoreCol`, `uArcCol`, `uHaloCol` | Plasma de alto voltaje con dos bolts ortogonales y halo Fresnel |
| 29 | `nyxVert` / `nyxFrag` (Cosmic Nebula de NYX) | `nyxModelLoader.ts:13` / `:31` | `uDeepColor` `#090314`, `uNebulaA` `#7e22ce`, `uNebulaB` `#06b6d4`, `uRimColor` `#f8fafc`, `uTime`, `uGravityShift`, `uSpeed01` | Nebulosa + estrellas interiores; rim cian-violeta al activar Gravity Shift |
| 30 | `backdropVertexShader` / `backdropFragmentShader` | `TitleDioramaSandbox.ts:38` / `:47` | `uTime`, `uAspect` | Fondo líquido con domain warping y estrellas finas |
| 31 | `nyxVertexShader` / `nyxUniverseFragmentShader` | `TitleDioramaSandbox.ts:171` / `:186` | `uDeepColor`, `uNebulaA`, `uNebulaB`, `uRimColor`, `uTime`, `uOpacity` (0.90) | Copia literal del Cosmic Nebula de portada con skinning |
| 32 | `addSkinnedWhiteOutline` (inline) | `TitleDioramaSandbox.ts:289` | `uThickness`, `uNoiseAmp` (0.2) | Inverted Hull blanco puro con skinning |

---

## 6. Ficha por shader: constantes exactas

### 6.1 Cel-shading de galaxia — `GALAXY_CEL_FRAGMENT` (`domeArenaScene.ts:394-458`)

```
lit  = base * 1.18
mid  = mix(base, uShadowTint, 0.30)
dark = mix(base, uShadowTint, 0.66)
NdotL < 0.10 -> dark ; NdotL < 0.46 -> mid ; resto -> lit
```

- Halftone solo en el terminador: activo si `uHalftoneEnabled > 0.5 && NdotL > -0.30 && NdotL < 0.36`;
  `halftoneDots(gl_FragCoord.xy, 6.0)`; `threshold = (1.0 - smoothstep(-0.22, 0.36, NdotL)) * 0.45`;
  si `dots < threshold` → `mix(col, uShadowTint * 0.9, 0.5)`.
- Vetas: `q = vWorldPos * 0.055 + vec3(0.0, -uTime * 0.14, uTime * 0.05)`;
  `n1 = fbm(q)`, `n2 = fbm(q * 2.35 + vec3(uTime * 0.08, 0.0, 0.0))`;
  `vein = smoothstep(0.50, 0.80, n1*0.62 + n2*0.58)`;
  `veinCol = mix(uVeinA, uVeinB, smoothstep(0.30, 0.85, n2))`;
  aporte `veinCol * vein * uVeinStrength * (0.40 + 0.60 * smoothstep(-0.25, 0.70, NdotL))`.
- Rim: `fres = pow(1 - max(dot(N,V),0), 2.6)` → `smoothstep(0.08, 0.85, fres)`.
- Defaults del factory (`:829-848`): `uShadowTint 0x161b33`, `uVeinA 0x22d3ee`,
  `uVeinB 0xa855f7`, `uRimColor 0x7dd3fc`, `uVeinStrength 0.85`, `uRimStrength 0.7`.

### 6.2 Roca cósmica — `COSMIC_ROCK_FRAGMENT` (`:498-561`)

```
lit  = base * 1.25 ; mid = mix(base, uShadowTint, 0.32) ; dark = mix(base, uShadowTint, 0.70)
NdotL < 0.08 -> dark ; NdotL < 0.44 -> mid
halftone: escala 5.5, rango -0.30..0.34, threshold (1 - smoothstep(-0.20, 0.34, NdotL)) * 0.40
```

- Grietas de maná: `q = vWorldPos * 0.17 + vec3(0.0, uTime * 0.03, 0.0)`;
  `n2 = fbm(q * 2.7 + vec3(3.1, uTime * 0.05, 0.0))`; `ridge = 1 - abs(n1*2 - 1)`;
  `crack = smoothstep(0.80, 0.99, ridge*0.65 + n2*0.45)`;
  `pulse = 0.65 + 0.35 * sin(uTime * 1.7 + n1 * 14.0)`;
  `crackCol = mix(uCrackA, uCrackB, smoothstep(0.30, 0.80, n2))`.
- Rim: `pow(1 - max(dot(N,V),0), 3.0)`, `smoothstep(0.10, 0.90, fres) * 0.55`.
- Defaults (`:877-895`): `uShadowTint 0x0b0a14`, `uCrackA 0xa855f7`, `uCrackB 0x22d3ee`,
  `uRimColor 0xd8fbff`, `uCrackStrength 1.5`.

### 6.3 Contorno de tinta del backdrop — `INK_OUTLINE_*` (`:461-495`)

- `trazo = sin(position.x * 7.3 + position.y * 5.1) * cos(position.z * 6.7 - position.y * 4.2)`;
  `width = max(0.008, uThickness * (1.0 + trazo * 0.35))`; extrusión por normal en espacio local;
  `vInk = uInkColor * (0.82 + 0.18 * sin(uTime * 2.1 + position.y * 0.7))`.
- Soporta `USE_INSTANCING` (aplica `instanceMatrix` a posición y normal).
- Grosores usados: pilar `0.4` (`0xa5f3fc`), monolitos `0.5` (`0x9df3ff`), arcos `0.3`
  (`0x7dd3fc`), fragmentos `0.12` (`0xd8fbff`), asteroides `0.18` (`0xd8fbff`), prismas `0.1`
  (`0xffffff`).

### 6.4 Prisma de cristal — `CRYSTAL_PRISM_FRAGMENT` (`:598-645`)

```
rainbow = 0.5 + 0.5 * cos(6.28318 * (vec3(0.0, 0.33, 0.67) + ndv * 1.45 + uTime * 0.05 + vPhase * 0.12))
irid    = mix(rainbow, uCrystalTint * vTint, 0.42)
band    = 0.55 ; NdotL > 0.46 -> 1.15 ; NdotL > 0.10 -> 0.85
pulse   = 0.72 + 0.28 * sin(uTime * 1.9 + vPhase * 6.28318) ; col *= pulse * uPulse
rim     = pow(1.0 - ndv, 2.2) -> + uRimColor * smoothstep(0.10, 0.95, fres) * 1.15
```

### 6.5 Lente gravitacional — `GRAVITY_LENS_FRAGMENT` (`:662-701`)

```
col = vec3(0.0)                                  // interior negro absoluto
swirl    = 0.5 + 0.5 * sin(atan(N.z, N.x) * 3.0 + uTime * 0.85 + fres * 9.0)
ring     = smoothstep(0.42, 0.92, fres)
col     += mix(uRimA, uRimB, swirl) * ring * (0.85 + 0.75 * swirl) * uIntensity
photon   = smoothstep(0.30, 0.42, fres) * (1.0 - smoothstep(0.42, 0.55, fres))
col     += uRimC * photon * 0.35
filo     = pow(fres, 18.0) * 2.2 * uIntensity
```

### 6.6 Disco de acreción — `ACCRETION_FRAGMENT` (`:712-758`)

- `spiral = ang * 2.0 + log(max(r, 0.0015)) * 4.2 - uTime * uSpin`; muestreo
  `(cos, sin) * (0.55 + r * 2.6)`.
- `n1 = fbm2(sp * 1.7 + vec2(0.0, uTime * 0.02))`, `n2 = fbm2(sp * 3.4 - vec2(uTime * 0.015, 0.0))`,
  `plasma = clamp(n1 * 0.72 + n2 * 0.52, 0.0, 1.0)`.
- Rampa de 4 colores con `smoothstep` en `0.12..0.52`, `0.48..0.78`, `0.76..1.0`.
- Hebra: `pow(max(0.0, sin(spiral * 3.0 + n1 * 5.0)), 14.0) * 0.9` teñida `uColD`.
- Borde: `smoothstep(uInner, uInner + 0.14, r) * (1.0 - smoothstep(0.70, 1.0, r))`;
  `alpha = edge * (0.30 + 0.70 * plasma) * uOpacity`; `discard` si `< 0.004`.
  `uInner` se normaliza como `inner / outer` en el factory (`:947-970`).
- Material: `transparent`, `depthWrite: false`, `DoubleSide`, `AdditiveBlending`, `fog: false`.

### 6.7 Anillos de energía — `ENERGY_RING_FRAGMENT` (`:775-816`)

```
flow   = vUv.x * 6.28318 * 3.0 - uTime * uFlowSpeed
pulse  = pow(0.5 + 0.5 * sin(flow), 3.0)
pulse2 = pow(0.5 + 0.5 * sin(flow * 2.0 + 1.7), 6.0)
col    = mix(uColorA, uColorB, pulse) * (0.55 + 0.85 * pulse + 0.60 * pulse2)
band   = 0.62 ; NdotL > 0.46 -> 1.15 ; NdotL > 0.10 -> 0.88
rim    = pow(1 - max(dot(N,V),0), 2.4) -> + uColorB * smoothstep(0.10, 0.90, fres) * 0.9
```

### 6.8 Cel-shading estándar del juego — `celFragmentShader` (`toonMaterials.ts:67-147`)

```
litColor = baseColor * 1.12 ; midColor = mix(baseColor, uShadowTint, 0.28) ; darkColor = mix(baseColor, uShadowTint, 0.62)
NdotL < 0.12 -> darkColor ; NdotL < 0.48 -> midColor
halftone: uHalftoneEnabled > 0.5 && NdotL > -0.25 && NdotL < 0.34
          halftonePattern(gl_FragCoord.xy, 6.5)
          threshold = smoothstep(0.34, -0.20, NdotL) * 0.42
          dots < threshold -> mix(finalColor, uShadowTint * 0.85, 0.55)
fresnelRaw = 1 - max(dot(N,V),0) ; fresnel = pow(fresnelRaw, uRimPower)
fresnel = smoothstep(0.10, 0.82, fresnel) * (0.72 + 0.28 * fresnel)
finalColor += uRimColor * fresnel * uRimStrength
skyBounce = max(-NdotL, 0.0) ; finalColor += uRimColor * skyBounce * 0.08
finalColor += baseColor * uEmissiveBoost
```

Defaults de `createComicCelMaterial` (`:150-186`): `rimColor 0x7dd3fc`, `rimPower 3.2`,
`rimStrength 0.55`, `emissiveBoost 0.0`, `shadowTint 0x161b33`, `transparent false`,
`opacity 1`, `side FrontSide`; `uSunDir` y `uHalftoneEnabled` **compartidos**.
`setHalftonesEnabled(enabled)` escribe `globalShaderState.uHalftoneEnabled.value` (afecta a todos
los materiales cel y al cielo cómic). `createToonMaterial(color, emissive)` delega en el cel y mapea
`emissive` a `rimColor` + `emissiveBoost 0.32`.

### 6.9 Inverted Hull del juego — `addComicOutline(mesh, thickness = 0.045, color = 0x090b14, distanceScale = 0)`

- Uniforms: `uThickness`, `uNoiseAmp` (0.35), `uInkColor`, `uDistanceScale`.
- `brushVar = sin(x*7.3 + y*5.1) * cos(z*6.7 - y*4.2)`;
  `width = max(0.008, uThickness * (1.0 + brushVar * uNoiseAmp))`;
  `distScale = 1.0 + clamp(-modelViewMatrix[3].z / 18.0, 0.0, 1.0) * uDistanceScale`.
- Si la malla es `SkinnedMesh`, el contorno se crea como `SkinnedMesh` con el mismo
  `skeleton`/`bindMatrix` (si no, el trazo queda congelado en bind pose).
- Grosores usados: suelos estáticos `0.055`; suelos flotantes `0.05` (`0x090b14`);
  enemigos carne `0.05` (`0xffffff`), `detail_*` `0.04` (tinta blanca), `star_core` `0.035`
  (`0xffe58f`), mariposa/cuarzo `0.04` (`0x7dd3fc`); todos con `INK_DISTANCE_SCALE = 2.6`.
- Multiplicador por oleada (`DomeEnemyModels.ts:102-112`):
  `enemyInkScaleForWave(wave) = 1 + 0.25 * floor((max(1, wave) - 1) / 10)` →
  oleadas 1-10 x1, 11-20 x1.25, 21-30 x1.5, 31-40 x1.75.

### 6.10 Cielo cómic del nivel de ciudad — `skyFragmentShader` (`toonMaterials.ts:310-511`)

Aunque pertenece al modo ciudad, es el otro cielo del juego y comparte `uSunDir`/`uHalftoneEnabled`:
`SKY_RADIUS = 1800`, `STAR_COUNT = 900`, `STAR_SHELL_RADIUS = 1650`.
Paleta documentada y fijada en shader: zafiro `#2258cc`, turquesa `#42bde8`, aqua-menta `#7ae8dc`,
lavanda-rosa `#df9fff`, melocotón dorado `#ffd992`; abismo bajo `h < 0.36` en
`vec3(0.08, 0.05, 0.22)`. Sol: disco `smoothstep(0.9955, 0.9985, sd)`, halo `pow(sd, 220.0)`,
anillos cel `fract(ang * 7.0)`. Planeta: dirección `normalize(vec3(-0.36, 0.24, -0.90))`,
`pUV = (dot(offset, right), dot(offset, up)) / 0.30`, bandas
`sin(pUV.y * 9.0 + sin(pUV.x * 2.0) * 0.6)`, anillos perla-oro/cian con `sin(ringR * 30.0)`.
Estrellas de 4 puntas por rejilla `vec2(az * 22.0, el * 44.0)`, umbral `step(0.86, sHash)`.
Halftone solo en las transiciones de banda (`h 0.40-0.52` y `0.62-0.74`), escala `7.0`.
Tintes de estrellas (`STAR_TINTS`): `[1.0, 0.88, 0.62]`, `[0.62, 0.92, 1.0]`, `[1.0, 0.72, 0.85]`,
`[1.0, 0.98, 0.95]`. El grupo sigue la posición de la cámara cada frame y las estrellas rotan
`y += dt * 0.004`, `x += dt * 0.0015`.

---

## 7. Menú: divisor líquido y portada

### 7.1 `menuShaders.ts` — divisor líquido «Cosmic Nebula»

- Quad a pantalla completa (`PlaneGeometry(2, 2)`), `renderOrder = 10`, `depthTest/depthWrite false`,
  `fog: false`, cámara `OrthographicCamera(-1, 1, 1, -1, 0.1, 10)` en `z = 1`.
- Uniforms: `uTime`, `uAspect`.
- Silueta: `baseEdgeX = mix(0.40, 0.24, 1.0 - uv.y)` (arriba ~42 % del ancho, abajo ~25 %);
  onda `sin(uv.y * 9.0 + t * 1.2) * 0.40 + (n1 - 0.5) * 1.25 + (n2 - 0.5) * 0.55`,
  amplitud final `(wave / 1.5) * 0.022`.
- Bandas por `d = uv.x - fluidEdgeX`:
  - `d < 0` → papel `vec3(0.945, 0.945, 0.929)` (**#f1f1ed**) con rejilla de 96 px al 55 %.
  - `0 <= d < 0.003` → filo de tinta `vec3(0.043, 0.051, 0.071)`, alpha `0.92`.
  - `0.003 <= d < 0.055` → estela líquida: tinta → `crimson vec3(0.88, 0.11, 0.28)` /
    `plum vec3(0.42, 0.19, 0.90)` / `cian vec3(0.13, 0.83, 0.93)`, halftone `6.5` con
    `dotMask = smoothstep(0.7, 0.1, f) * 0.45`, alpha `0.42` en punto / `0.2` fuera.
  - resto → transparente.

### 7.2 `TitleDioramaSandbox.ts` — portada

| Dato | Valor |
|---|---|
| Renderer | `antialias: true`, `alpha: false`, `setPixelRatio(min(dpr, 2))`, `setClearColor(0x0a0e25, 1)`, `autoClear = false` |
| Cámara | `PerspectiveCamera(30, 1, 0.1, 100)` a **3.85 m** del centro `(0, 0.92, 0)` |
| Dirección de cámara | `TITLE_CAM_DIR = normalize(0.30, 0.14, 1.0)` |
| Desplazamiento de proyección | `setViewOffset(w, h, -shift * w, 0, w, h)` con `shift = clamp((w - 640) / 900, 0, 1) * 0.17` |
| Fondo | shader `backdrop*`, `depthTest/Write false`, `renderOrder = -10`; `t = uTime * 0.16` |
| Paleta del fondo | `abyss (0.020, 0.024, 0.062)`, `deepTeal (0.045, 0.240, 0.360)`, `elecCyan (0.080, 0.520, 0.680)`, `warmSilk (0.520, 0.140, 0.340)`; vena `vec3(0.22, 0.75, 0.92) * 0.25`; estrellas con `h > 0.88`, rejilla `24.0` |
| Material de NYX | Cosmic Nebula: `uDeepColor #090314`, `uNebulaA #7e22ce`, `uNebulaB #06b6d4`, `uRimColor #f8fafc`, `uOpacity 0.90`, `transparent`, `depthWrite: true`, `FrontSide` |
| Ojos | `MeshBasicMaterial({ color: 0x0f172a, toneMapped: false })` |
| Contornos blancos | cuerpo `0.015`, pelo `0.011`, cara `0.008`; `uNoiseAmp 0.2`; `width = max(0.002, ...)`; fragment blanco puro |
| Giro | `180°/min` en X e Y (`radPerSec = degToRad(180) / 60`), `rotY` inicial `-0.34`, `rotZ = -0.10 + sin(t * 0.13) * 0.06` |
| Pase del divisor | `renderer.clear()` → escena → `clearDepth()` → `dividerScene` con su cámara ortográfica |

---

## 8. VFX de impacto estilo cómic — `ComicImpactVfx`

### 8.1 Estructura y paletas

| Constante | Valor | Línea |
|---|---|---|
| `MAX_SHARDS` | 128 (rombos) | `:30` |
| `MAX_STARS` | 6 (sprites) | `:31` |
| `COLOR_RED` | `0xff1e42` | `:33` |
| `COLOR_WHITE` | `0xf8fafc` | `:34` |
| `COLOR_INK` | `0x09070d` | `:35` |
| `COLOR_VOID` | `0x7c3aed` | `:37` |
| `COLOR_GLOW` | `0x8ff5ff` | `:38` |

- **Picos**: un único `BufferGeometry` de 128 quads (4 vértices, 6 índices) = **una draw call**;
  atributos `position`, `color`, `aVoid`; material `ShaderMaterial({ side: DoubleSide })` con
  `uTime`, `uColorA 0x8b5cf6`, `uColorB 0x4c1d95`. Material **opaco**: los picos desaparecen por
  estrechamiento, sin blending.
- **Estrellas**: pool de 6 `Sprite` con 2 texturas canvas de 128 px (7 y 10 puntas; relleno
  `#ffffff`, contorno `#09070d` con `lineWidth 6`, `miterLimit 10`, `rExt = size * 0.46`,
  `rInt = rExt * 0.28`), `SpriteMaterial` transparente, `depthWrite: false`.

### 8.2 API y escalados

`spawnComicHit(position, normal, intensity, enemyRadius = 1.6)`:

```
clamped    = clamp(intensity, 0.35, 1.3)
sizeScale  = 0.8 + enemyRadius * 0.38
estrella   = textura 0 (7 puntas), maxScale (2.3 + clamped * 2.0) * sizeScale, vida 0.1
picos      = 12 + round(clamped * 10 + enemyRadius * 2), factor 1.3 * sizeScale, paleta cómic
```

`spawnComicExplosion(position, radius)`:

```
estrella = textura 1 (10 puntas), maxScale 2.6 + radius * 1.9, vida 0.18, color final COLOR_VOID
picos    = 18 + floor(radius * 5 + random() * 8), intensity 1.3, factor 1.55, voidPalette, lifeScale 2.2
```

Por pico (`spawnShard`): `dist 0.1..0.35`, `speed (9 + rand*9) * (0.7 + intensity*0.5) * factor`,
`lenMax (0.9 + rand*1.6) * (0.75 + intensity*0.55) * factor`,
`widthMax (0.12 + rand*0.16) * factor`,
`life (0.16 + rand*0.14) * (factor > 1.2 ? 1.25 : 1) * lifeScale`.
Dirección sesgada a la normal: `d = normalize(d * 0.55 + normal * 0.75)`.
Paleta: golpes `roll > 0.25 -> RED`, `> 0.12 -> WHITE`, resto `INK`;
explosiones `roll > 0.42 -> VOID`, `> 0.2 -> GLOW`, resto `INK`.

### 8.3 Envolventes por frame (`updateShards`)

```
p        = 1 - life / maxLife
dist    += speed * pow(1 - p, 1.6) * dt
len      = lenMax * sin(min(1, p * 2.8) * (PI / 2)) * (1 - pow(p, 2.2))
width    = widthMax * (1 - pow(p, 1.3))
colapso  -> 12 ceros si len <= 0.02 o width <= 0.015
rombo    -> vértices: arranque (dist), costado+ (dist + len*0.2), punta (dist + len), costado-
billboard-> right = normalize(dir x (origin - cameraPos)), escalado por width
```

Estrellas: `scale = max(0.01, maxScale * sin(p * PI))`; color `COLOR_WHITE` mientras `p < 0.5`,
después `starEndColor` (`COLOR_RED` en golpes, `COLOR_VOID` en explosiones).
Shader de picos de vacío: `uv = gl_FragCoord.xy * 0.0048`, `drift = (uTime*0.045, -uTime*0.03)`,
`fbm(uv * 1.6 + drift)` y `fbm(uv * 2.5 - drift * 1.3 + n1 * 0.9)`, base
`vec3(0.02, 0.008, 0.035)`, estrellas
`starLayer(...14.0, 2.6) * 1.3 + starLayer(...24.0, 3.8) * 1.6` (umbral `h < 0.70` descarta).

---

## 9. VFX de movimiento — `MotionVfx`

### 9.1 Pools y shader de partículas

| Pool | Capacidad | Blending | Línea |
|---|---|---|---|
| `sparks` | `MAX_SPARKS = 360` | `AdditiveBlending` | `:23` |
| `dust` | `MAX_DUST = 240` | `NormalBlending` | `:24` |
| `rings` | `MAX_RINGS = 10` | `AdditiveBlending` | `:25` |
| `streaks` | `MAX_STREAKS = 64` | `AdditiveBlending` | `:26` |
| `flashes` | `MAX_FLASHES = 8` | `AdditiveBlending` | `:27` |

Vertex de partículas: `gl_PointSize = aSize * (320.0 / max(-mv.z, 0.1))`.
Fragment: `soft = smoothstep(0.5, 0.16, r)`, `discard` si `r > 0.5`, salida
`vec4(vColor, vAlpha * soft)`.
Integración: `pos += v * dt`; `v *= exp(-drag * dt)`; `v.y = v.y * drag + gravity * dt`;
`alpha = baseAlpha * fade²`; `size = baseSize * (0.6 + 0.4 * fade)`.

### 9.2 Estilos de ráfaga (valores exactos)

| Estilo | Color | Count | speed min/max | life min/max | drag | gravity | size | alpha |
|---|---|---|---|---|---|---|---|---|
| `STYLE_SPARK` | `0xffc24d` | 22 | 2 / 6.5 | 0.35 / 0.8 | 3 | 0 | 0.25 | 1 |
| `STYLE_DUST_LAND` | `0xf6efe0` | 16 | 1.6 / 4.2 | 0.45 / 0.95 | 4.2 | -1.2 | 0.62 | 0.85 |
| `STYLE_DUST_TAKEOFF` | `0xf3ead6` | 12 | 1.2 / 3.4 | 0.35 / 0.7 | 5 | -0.6 | 0.5 | 0.7 |
| `STYLE_DUST_SLIDE` | `0xfff6e6` | 10 | 2.4 / 5.6 | 0.3 / 0.65 | 3.4 | -0.8 | 0.55 | 0.8 |
| `STYLE_DUST_ROCK` | `0x8d99ae` | 14 | 2.2 / 5.4 | 0.4 / 0.85 | 3.6 | -1.6 | 0.5 | 0.9 |
| `STYLE_WAKE` | `0xd9e6ff` | 8 | 0.4 / 1.8 | 0.55 / 0.85 | 1.1 | 0 | 0.34 | 0.55 |
| `STYLE_ABSORB` | `0xc084fc` | 14 | 1.4 / 3.6 | 0.2 / 0.4 | 6 | 0 | 0.3 | 0.95 |

Todos comparten `spread: 1`; el tinte por partícula se multiplica por `0.78 + random()*0.22` y el
tamaño por `0.7 + random()*0.6`.

### 9.3 Eventos y anillos

| Método | Composición exacta |
|---|---|
| `spawnBurst(pos, normal?, color = 0xffc24d, count = 22)` | `STYLE_SPARK` con color/count sobreescritos |
| `spawnDomeBounceRing(pos, normal)` | anillo `0xffffff` max 8 / vida 0.7 / op 0.9 + anillo `0xff4d6d` max 4.5 / 0.32 / 0.95 + 26 chispas `0x9be8ff` |
| `spawnEnemyExplosion(pos, radius, color)` | color aclarado `lerp(WHITE, 0.6)`; flash del color (escala `1.4 + radius`, vida 0.3) + flash blanco (`0.9 + radius*0.6`, 0.2); 46 chispas (speed 3..10, size 0.34) + 18 chispas blancas (speed 6..14, size 0.22); `STYLE_DUST_LAND`; anillo color `radius * 1.5` / 0.5 / 0.95 + anillo blanco `radius * 0.95` / 0.34 / 0.9 |
| `spawnFlash(pos, color, maxScale, lifetime)` | sprite billboard; escala `maxScale * (0.35 + 0.65 * sqrt(k))`; opacidad `(1-k)²` |
| `spawnImpactRing(pos, normal)` | `0xffc24d` 4.2 / 0.42 / 0.95 + `0xffffff` 2.4 / 0.3 / 0.8 |
| `spawnIcebergImpact(pos, normal)` | `STYLE_DUST_ROCK` + `STYLE_DUST_LAND` + 16 chispas `0xdbeafe` |
| `spawnVoidImpactRing(pos, normal)` | `0xa855f7` 7.5 / 0.6 / 0.9 + `0x22d3ee` 4.6 / 0.42 / 0.85 |
| `spawnSonicBoomRing(pos, direction)` | `0x9be8ff` 5.5 / 0.55 / 0.85 + `0xffffff` 3.2 / 0.4 / 0.7 |
| `spawnDustBurst(pos, normal, kind)` | `land`: dust LAND + 8 chispas `0x67e8f9`; `takeoff`: dust TAKEOFF + 6 `0xfbbf24`; `slide`: dust SLIDE + 10 `0xfde68a`; `glance`: dust TAKEOFF + 6 `0xe2e8f0` |
| `spawnGravityWake(pos, direction)` | `STYLE_WAKE` + anillo `0xbfe9ff` 2.6 / 0.45 / 0.45 |
| `spawnAbsorbFlare(pos, kind)` | color dust: `exp 0x7ae8dc`, `eden 0xdf9fff`, `hp 0x7dffa8`; chispas: `exp 0x22d3ee`, `eden 0xa855f7`, `hp 0x4ade80` (10); anillo del color del dust, 1.7 / 0.28 / 0.8 |
| `spawnEdenPulse(pos, normal)` | anillo `0x22d3ee` 3.4 / 0.5 / 0.75 + 12 chispas `0x67e8f9` |

Geometría de anillos: `RingGeometry(0.8, 1, 48)`, `MeshBasicMaterial` blanco, `DoubleSide`,
aditivo, `depthWrite: false`. Animación: `scale = 0.8 + t * maxScale`,
`opacity = (1 - t)² * opacity0`; orientación `quaternion.setFromUnitVectors(RING_FORWARD, normal)`
con `RING_FORWARD = (0,0,1)` y normal normalizada (fallback `WORLD_UP`).
Textura de flash: canvas 64 px con gradiente radial y paradas `1`, `0.85` (0.3), `0.22` (0.62), `0`.

### 9.4 Estelas de viento y telémetro

**Estelas** (`LineSegments` con `vertexColors`, aditivo, `depthWrite: false`):

- Umbral y ritmo: solo si `speed > STREAK_MIN_SPEED = 10`;
  `accum += dt * (speed - 10) * 1.9`, máximo **6 estelas por frame**; si no, `accum = 0`.
- Reparto en cilindro: base `(_sRight, _sUp)` perpendicular a la velocidad (con fallback si
  `|velDir·up| > 0.95`); `radius = 1.2 + random()*4.2`; `angle = random() * 2π`;
  `ahead = 2 + random()*9`.
- Dirección **opuesta** a la velocidad; `streakSpeed = speed * 0.85 + 5`;
  `len = 1.2 + speed * 0.11`; `life = 0.32 + random()*0.26`.
- Color por vértice: cabeza `(0.82, 0.95, 1.0) * fade`, cola x `0.15`.
- Las estelas muertas se colapsan a 6 ceros (no dibujan).

**Telémetro de aterrizaje** (grupo `telemetry`, `visible = false` por defecto):

- Se activa solo si `mode !== 'grounded'`, hay slabs y `speed >= 2.5`.
- Dirección: en `speed_attack` con `speed > 6` usa la velocidad; si no, `-up` del cuerpo.
- `raycastSlabs(slabs, playerPos, dir, TELEMETRY_RANGE = 14, _telemetryHit)`.
- `near = 1 - clamp((dist - 1.5) / (14 - 1.5), 0, 1)`; `target = near²`;
  `opacity += (target - opacity) * (1 - exp(-12 * dt))`.
- Posición `hit.point + hit.normal * 0.03`; orientación `WORLD_UP -> hit.normal`;
  `radius = 0.55 + (1 - near) * 1.15`; disco escala `radius`, anillo `radius * (0.55 + near * 0.45)`.
- Disco: `CircleGeometry(1, 32).rotateX(-π/2)`, color `0x05030f`, `polygonOffset` factor/unidades
  `-2`; opacidad `0.34 * opacity`.
- Anillo: `RingGeometry(0.82, 1, 40).rotateX(-π/2)`, color `0x67e8f9`, aditivo;
  opacidad `0.85 * opacity`.

---

## 10. Shaders de enemigos y proyectiles

### 10.1 Carne nebular — `enemyNebulaVert` / `enemyNebulaFrag` (`DomeEnemyModels.ts:120-218`)

- Wobble compartido (`ENERGY_WOBBLE_GLSL`, `:77`):
  `energyWobble(pos, uTime) = sin(pos.x * 9.0 + uTime * 22.0) * cos(pos.y * 7.0 - uTime * 19.0)`;
  aplicado como `transformed + objectNormal * wobble * 0.045`.
- Fragment: `uv = gl_FragCoord.xy * 0.0048`, `drift = (uTime*0.045, -uTime*0.03)`,
  `n1 = fbm(uv * 1.6 + drift)`, `n2 = fbm(uv * 2.5 - drift * 1.3 + n1 * 0.9)`;
  base `vec3(0.02, 0.008, 0.035)`;
  `col = mix(col, uColorA * 0.48, smoothstep(0.36, 0.80, n1))`;
  `col = mix(col, uColorB * 0.62, smoothstep(0.48, 0.88, n2))`;
  estrellas `starLayer(+drift*0.35, 14.0, 2.6) * 1.3 + starLayer(-drift*0.22, 24.0, 3.8) * 1.6`
  (`starLayer` descarta `h < 0.70`);
  rim `pow(1 - max(dot(N,V),0), 2.2) -> smoothstep(0.25, 0.9, fresnel) * 0.65`;
  `alpha = mix(uOpacity * 0.45, min(0.92, uOpacity * 1.15), fresnel)`.
- Paletas por arquetipo (`:224-260`):
  - `abyssal_cell`: `FLESH_SLIME_STOPS [0x7f1d1d, 0x9a3412, 0x854d0e]` y
    `FLESH_SLIME_NEBULA [0xb91c1c, 0xd97706, 0xca8a04]` con muestreo aleatorio y desplazamiento
    `(t + 0.25) % 1`; `uOpacity 0.62`.
  - `spiral_octopus`: `0x2e1065 -> 0x581c87` y `0x6b21a8 -> 0x9333ea`; `uOpacity 0.76`.
  - resto: `0x7f152e -> 0x3b0d63` (carmesí oscuro a morado abisal) y
    `0xa12045 -> 0x5b21b6`; `uOpacity 0.76`.
- `rimColor` por arquetipo: `abyssal_cell 0xf59e0b`, `spiral_octopus 0xc084fc`,
  `lightning_butterfly 0x38bdf8`, resto `0xff2a9d`.

### 10.2 Cuarzo Eléctrico — `createButterflyQuartzMaterial` (`:262-428`)

Material de las placas de la Mariposa Relámpago: cristal facetado translúcido con arcos
piezoeléctricos que saltan entre las ranuras de las placas al vibrar.

- Uniforms: `uTime`, `uCharge` (**0.45** inicial), `uEmissiveBoost`. `transparent: true`,
  `depthWrite: true`. La lista de materiales con `uCharge` se recoge en `collectButterflyRig`
  (`:910-931`) como `quartzMaterials`.
- Facetado: `facet = floor(abs(dot(N, vec3(0.42, 0.78, 0.46))) * 4.5) / 4.5`.
- Colores: `quartzDeep vec3(0.08, 0.22, 0.48)`, `quartzMid vec3(0.16, 0.62, 0.88)`,
  `quartzSpec vec3(0.76, 0.96, 1.0)`; `col = mix(quartzDeep, quartzMid, 0.35 + facet * 0.65)`.
- Ranuras: `p = vLocalPos * 7.5`;
  `n1 = qNoise(p + vec3(uTime*7.0, -uTime*5.2, uTime*3.8))`;
  `n2 = qNoise(p*2.3 - vec3(uTime*11.5, uTime*8.4, -uTime*6.0))`;
  `ridge = 1 - abs(n1*2 - 1)`; `groove = smoothstep(0.82, 0.985, ridge * (0.6 + 0.4 * n2))`;
  `pulse = 0.55 + 0.45 * sin(uTime * 28.0 + vLocalPos.x * 9.0 + vLocalPos.y * 11.0)`;
  `arcIntensity = groove * pulse * (0.65 + uCharge * 1.45)`.
- Aportes: `vec3(0.32, 0.86, 1.0) * arcIntensity * 1.35`;
  `quartzSpec * pow(groove, 3.0) * (0.5 + uCharge)`.
- Fresnel cristalino: `pow(1 - max(dot(N,V),0), 2.0)`;
  `mix(vec3(0.25, 0.88, 1.0), vec3(0.68, 0.48, 1.0), fresnel * 0.45) * (0.65 + uCharge * 0.6) * fresnel`;
  `+ vec3(0.4, 0.9, 1.0) * uEmissiveBoost`.
- Alpha `mix(0.74, 0.96, clamp(fresnel + arcIntensity * 0.4, 0.0, 1.0))`.

### 10.3 Contorno vibrante de enemigos — `addVibratingInkOutline` (`:362-431`)

Idéntico al Inverted Hull global pero con `uTime` y `energyWobble` aplicados a la posición antes de
extruir: la tinta vibra exactamente igual que la carne. Uniforms: `uThickness`, `uNoiseAmp 0.35`,
`uInkColor`, `uTime`, `uDistanceScale` (`INK_DISTANCE_SCALE = 2.6`); `renderOrder = 2`;
comparte esqueleto si es `SkinnedMesh`.

### 10.4 Cosmos + electricidad: KRONOS (`:1088-1250`)

| Paleta | `deep` | `nebulaA` | `nebulaB` | `rim` | Uso |
|---|---|---|---|---|---|
| `KRONOS_SOLAR_RIFT_PALETTE` | `0x120614` | `0xbe123c` | `0xf59e0b` | `0xfde68a` | discos de Portales Cósmicos (Fase 3+), `uOpacity 0.92`, `DoubleSide` |
| `KRONOS_VOID_COSMOS_PALETTE` | `0x070518` | `0x4c1d95` | `0xe11d48` | `0xa5f3fc` | cuerpo del boss en Fase 4, `uOpacity 0.9`, `FrontSide` |

`kronosCosmosFrag` (portado de `character-sheet.html`): `uv = gl_FragCoord.xy * 0.0042`,
`n1 = fbm(uv * 1.4 + drift)`, `n2 = fbm(uv * 2.2 - drift * 1.3 + n1 * 0.85)`,
`mix(col, uNebulaA, smoothstep(0.34, 0.78, n1) * 0.85)`,
`mix(col, uNebulaB, smoothstep(0.44, 0.86, n2) * 0.75)`,
estrellas `starLayer(...16.0, 2.4) * 0.9 + starLayer(...28.0, 3.6) * 1.25` (`h < 0.82` descarta),
fresnel `pow(..., 2.6) -> smoothstep(0.25, 0.9) * 0.65`, flash `uRimColor * uEmissiveBoost * 0.4`.
`swapKronosFleshToVoidCosmos(root, animatedMaterials)` sustituye la carne y **conserva el `uTime`**
en la lista de materiales animados.
Portal: `CircleGeometry(1, 64)` (renderOrder 3) + aro `TorusGeometry(1, 0.045, 10, 72)` con
`MeshBasicMaterial({ color: 0xffd27a, opacity: 0.9, AdditiveBlending, DoubleSide })` (renderOrder 4).

### 10.5 Estrellas interiores (star_core) y detalles

| Constante | Valor | Línea |
|---|---|---|
| `STAR_CORE_COLOR` | `0xffcc33` | `:41` |
| `STAR_CORE_RIM` | `0xfff3b0` | `:42` |
| `STAR_CORE_EMISSIVE` | `1.45` | `:43` |
| `STAR_CORE_OUTLINE_THICKNESS` | `0.035` | `:44` |
| `STAR_CORE_INK` | `0xffe58f` | `:45` |
| `FLESH_INK_WHITE` | `0xffffff` | `:67` |
| `FLESH_OUTLINE_THICKNESS` | `0.05` | `:68` |
| `INK_DISTANCE_SCALE` | `2.6` | `:74` |
| `DETAIL_COLOR` / `DETAIL_RIM` | `0x241d38` / `0x6b5f8a` | `:87-88` |
| `DETAIL_OUTLINE_THICKNESS` | `0.04` | `:89` |

Los `star_core` se visten con
`createComicCelMaterial(0xffcc33, { rimColor: 0xfff3b0, rimStrength: 1.0, emissiveBoost: 1.45 })`,
`renderOrder = 0`, contorno `0.035 x enemyInkScale` en `0xffe58f`; la carne va con
`renderOrder = 1` y su contorno con `renderOrder = 2` (`depthWrite: true` oculta el interior del
BackSide blanco).
`ENEMY_MODEL_COLORS` (`:29-38`): `abyssal_cell 0x6b143b/0xff2a9d`,
`spiral_octopus 0x4b1369/0x2563eb`, `crab_gunner 0x7c192d/0xff2a9d`,
`ground_golem 0x3b0f54/0x1e40af`, `lightning_butterfly 0x164e63/0x38bdf8`,
`giant_sparrow 0x7f1d1d/0x2563eb`, `prisma_necroz 0x4c1d95/0xff2a9d`,
`kronos_leviathan 0x31105c/0x1d4ed8`.
`GLB_CACHE_VERSION = 10` (sufijo `?v=` en la URL de `/models/enemies/<archetype>.glb`).

### 10.6 Bolas de tinta ácida — `inkProjectileMaterial` (`DomeWaveManager.ts:1173-1225`)

- Uniforms: `uTime`. Sin texturas: shader procedural 3D (cero costuras UV).
- Vertex: `wobble = sin(x*7.5 + uTime*9.0) * cos(y*7.5 - uTime*7.5) * sin(z*7.5 + uTime*8.0)`;
  desplazamiento `normal * (wobble * 0.085)`.
- Fragment: `turb3D` de tres armónicos (`sin(x*3.2 + sin(y*2.7 + uTime*3.8)) * 0.5`,
  `cos(y*4.1 - sin(z*3.5 - uTime*4.6)) * 0.35`, `sin(z*5.3 + cos(x*4.4 + uTime*5.2)) * 0.25`);
  `swirl = turb3D(dir * 2.4 + ...)`, `veins = turb3D(dir * 5.2 + ...)`;
  `coreBand = smoothstep(0.48, 0.88, swirl * 0.65 + veins * 0.45)`,
  `crackle = smoothstep(0.80, 0.96, veins)`; motas estelares
  `step(0.955, hash31(floor(dir * 16.0 + vec3(0.0, uTime * 0.4, 0.0))))`.
- Colores: `voidCol vec3(0.035, 0.004, 0.015)`, `darkCrimson vec3(0.52, 0.02, 0.09)`,
  `acidRed vec3(1.0, 0.08, 0.20)`, `hotCore vec3(1.0, 0.58, 0.42)`;
  estrellas `vec3(1.0, 0.82, 0.78) * 0.9`; rim `vec3(1.0, 0.14, 0.28) * fresnel * 1.65`
  con `pow(..., 2.1)`.

### 10.7 Bolas eléctricas de plasma — `makeElectricBallShader` (`DomeWaveManager.ts:1259-1301`)

- Uniforms: `uTime`, `uCoreCol`, `uArcCol`, `uHaloCol`.
- Vertex: `spike = sin(x*18.0 + uTime*28.0) * sin(y*16.0 - uTime*24.0) * 0.055`;
  `displaced = position + normal * spike` (superficie que vibra).
- Fragment: `a1 = abs(sin(d.x*16.0 + uTime*25.0 + cos(d.y*14.0 - uTime*19.0)))`,
  `a2 = abs(cos(d.z*19.0 - uTime*31.0 + sin(d.y*11.0 + uTime*14.0)))`,
  `bolt = smoothstep(0.18, 0.0, a1) + smoothstep(0.14, 0.0, a2) * 0.85`;
  `col = mix(uCoreCol, uArcCol, clamp(bolt, 0, 1))`,
  `+ vec3(0.95, 0.99, 1.0) * pow(clamp(bolt, 0, 1), 2.2) * 1.45`,
  `+ uHaloCol * pow(1 - max(dot(N,V),0), 1.9) * 1.5`.
- Instancias: `electricProjectileMaterial` = (`0x091a45`, `0x38bdf8`, `0x7dd3fc`);
  `reflectedElectricMaterial` = (`0x064e3b`, `0x34d399`, `0x67e8f9`).

### 10.8 Bolas capturadas por el Campo Gravitacional (`DomeSkills.ts`)

- `capturedInkBallMaterial` (`:594`): `uDeepColor 0x090314`, `uNebulaA 0x7e22ce`,
  `uNebulaB 0x06b6d4`, `uRimColor 0xf8fafc`, `uTime`. `uv = gl_FragCoord.xy * 0.02`,
  `drift = (uTime*0.05, -uTime*0.03)`, `mix(col, uNebulaA * 0.85, smoothstep(0.42, 0.85, n))` y
  `mix(col, uNebulaB * 0.9, smoothstep(0.55, 0.95, fbm(uv * 1.7 - drift)))`; estrellas
  `fract(uv * 9.0)` con `h > 0.72` (radio `smoothstep(0.12, 0.0, d)`, titileo
  `0.6 + 0.4 * sin(uTime * 3.0 + h * 40.0)`, ganancia `1.4`); rim `pow(..., 2.0) * 0.85`;
  alpha `0.96`.
- `capturedElectricBallMaterial` (`:669`): `uDeepColor 0x0b0420`, `uNebulaA 0x7e22ce`,
  `uElectricCyan 0x22d3ee`, `uRimColor 0xe0f2fe`, `uTime`. `uv = gl_FragCoord.xy * 0.022`,
  `drift = (uTime*0.08, -uTime*0.05)`; arcos
  `boltWave = abs(sin(p.x*16.0 + uTime*22.0 + sin(p.y*12.0 - uTime*15.0)))`,
  `boltMask = smoothstep(0.16, 0.0, boltWave)`,
  `bolt2 = smoothstep(0.12, 0.0, abs(cos(p.z*19.0 - uTime*27.0 + sin(p.x*14.0))))`,
  `spark = clamp(boltMask + bolt2 * 0.85, 0.0, 1.0)`;
  `col = mix(col, uElectricCyan, spark * 0.85) + vec3(0.92, 0.98, 1.0) * pow(spark, 2.5) * 1.6`;
  rim `pow(..., 1.8) -> smoothstep(0.18, 0.9) * 1.25`; alpha `0.98`.
- Proyectiles cel del wave manager: `laserProjectileMaterial`
  `createComicCelMaterial(0xff2233, { rimColor: 0xffd9d9, rimStrength: 1.0, emissiveBoost: 1.3 })`;
  `windProjectileMaterial` `(0xbff4ff, { rimColor: 0xffffff, rimStrength: 1.0, emissiveBoost: 0.78 })`;
  `darkProjectileMaterial` `(0x1c1030, { rimColor: 0x6b4bff, rimStrength: 0.9, emissiveBoost: 0.35 })`;
  `kronosRingMaterial` `(0x9fd8ff, { rimColor: 0x66e0ff, rimStrength: 1.0, emissiveBoost: 0.9 })`.

---

## 11. Tabla resumen de colores hex verificados

| Hex | Uso |
|---|---|
| `0x22d3ee` | cian de marca: vetas de galaxia, anillos guía de la cúpula, `ACCENT_B`, rim de suelos |
| `0xa855f7` | violeta: `veinB`, rim de suelos, grietas de maná, anillo de impacto del vacío |
| `0x7dd3fc` | rim cel por defecto y tinta de arcos |
| `0xd8fbff` | tinta de fragmentos, asteroides y `uRimColor` de la roca cósmica |
| `0x9df3ff` | tinta de monolitos |
| `0x161b33` | tinte de sombra cel por defecto (nunca negro sucio) |
| `0x090b14` | tinta por defecto de `addComicOutline` y contorno de suelos flotantes |
| `0xfbbf24` / `0xfff7d6` | anillo de energía dorado del Pilar del Mundo |
| `0xf43f5e` | `colC` del disco interior de la singularidad; paleta de estrellas |
| `0x3b0764` / `0x1e1b4b` | violetas profundos de los discos de acreción |
| `0x6d28d9` / `0xc4b5fd` | `colB`/`colD` del disco exterior y anillo abisal |
| `0xff1e42` / `0xf8fafc` / `0x09070d` | paleta cómic de impacto (rojo / blanco / tinta) |
| `0x7c3aed` / `0x8ff5ff` | paleta de vacío (violeta / brillo cian) de explosiones |
| `0x8b5cf6` / `0x4c1d95` | `uColorA`/`uColorB` de la nebulosa de los picos |
| `0xf6efe0`, `0xf3ead6`, `0xfff6e6`, `0x8d99ae`, `0xd9e6ff`, `0xc084fc` | polvo de aterrizaje, despegue, derrape, roca, estela y absorción |
| `0xffc24d` | chispas por defecto y anillo de impacto de patada |
| `0x67e8f9` | anillo del telémetro y chispas de aterrizaje/Edén |
| `0x090314`, `0x7e22ce`, `0x06b6d4`, `0xf8fafc` | Cosmic Nebula de NYX (`uDeepColor`, `uNebulaA`, `uNebulaB`, `uRimColor`) |
| `0x0f172a` | ojos de NYX (plano, `toneMapped: false`) |
| `0x0a0e25` | clear color de la portada |
| `#e8eef7` / `#1b2538` / `#34d399` / `#181126` / `#2b1d3d` | damero de baldosas del suelo flotante (comentarios del shader `DomeSlabGeometry`) |
| `0xff2a1a` / `0xffb020` | aviso rojo/ámbar de baldosas de la cúpula |
| `0xffcc33` / `0xfff3b0` / `0xffe58f` | estrella interior `star_core` (base, rim, tinta) |

---

## 12. Datos confirmados como ausentes

| Elemento | Comprobación |
|---|---|
| Niebla de escena (`Fog`, `FogExp2`, `scene.fog`) | 0 apariciones en `src/`; todos los materiales sensibles declaran `fog: false` |
| Sombras (`castShadow`, `receiveShadow`, `shadowMap`) | 0 apariciones en `src/` |
| Post-proceso (`EffectComposer`, `UnrealBloom`, passes) | 0 apariciones en `src/` |
| `renderer.toneMapping` / `outputColorSpace` explícitos | 0 apariciones en `src/` (se usa el comportamiento por defecto de Three.js) |
| Malla de barrera de la cúpula a 88.6 m | Solo el radio numérico y el VFX de rebote; no hay geometría |
| Planetas en el modo cúpula | El planeta anillado vive en el shader del cielo cómic (`toonMaterials.ts`) y hay planetas 3D en el nivel de ciudad (`planetModel.ts`), no en el backdrop de la cúpula |
| `createDomeSlabs` | Exportado en `DomeSlabs.ts:620` sin call site en `src/`; el sistema activo es `DomeFloatingSlabManager` + `DomeSphereTileManager` |
| Escombros generados por baldosas de cúpula | No existen: solo los suelos flotantes rotos generan escombros (`spawnSlabDebris`, 4 por rotura, máx. 12 sueltos) |
