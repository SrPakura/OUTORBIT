# 06 — Audio procedural, música, controles, UI/HUD, i18n, ajustes y leaderboard

Documento de extracción técnica del código real de OUTORBIT. Todos los datos provienen de
lectura directa del repositorio y fueron contrastados dos veces (lectura completa del archivo
+ segunda pasada con `grep`/scripts sobre el mismo archivo). No hay valores estimados ni
propuestas de diseño.

Rutas citadas relativas a la raíz del repo `/home/pakura/Proyectos/OUTORBIT`.

---

## 1. Alcance y método de verificación

Archivos fuente leídos íntegros (o en las secciones relevantes, indicadas):

| Archivo | Líneas | Uso en este documento |
|---|---|---|
| `src/game/audio/SynthAudio.ts` | 1303 | SFX procedurales + motor de audio continuo |
| `src/game/audio/MusicPlayer.ts` | 390 | música, rotación, fundidos, MPRIS |
| `public/audio/*` | — | pistas MP3 + portada |
| `src/game/input/GamepadInput.ts` | 181 | lectura Gamepad API |
| `src/game/input/gamepadMenuNav.ts` | 149 | navegación de menús con mando |
| `src/game/settings.ts` | 504 | ajustes persistidos |
| `src/game/localStorageState.ts` | 262 | claves de persistencia |
| `src/i18n/index.ts` | 170 | infraestructura i18n |
| `src/i18n/es.json`, `en.json`, `ja.json` | 297 c/u | diccionarios |
| `src/ui/TitleScreen.tsx` | 228 | portada |
| `src/ui/DomeGameView.tsx` | 480 | vista de la Cúpula |
| `src/ui/DomeHudSketch.tsx` | 710 | HUD |
| `src/ui/DomeYinYangHud.tsx` | 577 | vida/Edén/EXP (shader WebGL) |
| `src/ui/DomeSkillSlotsHud.tsx` | 246 | slots de habilidad |
| `src/ui/DomePauseModal.tsx` | 289 | pausa |
| `src/ui/SettingsScreen.tsx` | 875 | ajustes |
| `src/ui/LeaderboardModal.tsx` | 129 | ranking (portada) |
| `src/api/leaderboard.ts` | 35 | acceso Base44 |
| `src/ui/DomeBattleReport.tsx` (parcial) | 1026 | informe + ranking Top 5 |
| `src/game/dome/DomeRunStats.ts` (parcial) | — | score y envío al ranking |
| `src/ui/domeGameLoop.ts` (parcial) | 1497 | disparadores de SFX/música, entrada |
| `src/game/dome/NyxDomeController.ts` (parcial) | 4298 | entrada y SFX de Nyx |
| `src/game/dome/DomeCombatSystem.ts` (parcial) | — | mancha de tinta |

Comprobaciones automatizadas ejecutadas (segunda pasada):

- `GameSoundKind`: 22 variantes; `play(kind)` tiene exactamente 22 `case` (coinciden uno a uno).
- `SynthAudio`: 55 métodos públicos (48 `play*` + `play`, `updateMovementSpeed`,
  `setGravityFieldActive`, `setVolumeMultiplier`, `unlock`, `dispose`, `toggleMute`).
- i18n: 251 claves hoja por idioma en `es`, `en` y `ja`; 0 claves faltantes, 0 extra, 0 vacías.
- Diferencias de texto: `en` repite 31 cadenas idénticas al español; `ja` repite 11.

---

## 2. Audio procedural — `src/game/audio/SynthAudio.ts`

### 2.1 Arquitectura y bus

| Constante / campo | Valor | Efecto |
|---|---|---|
| `MASTER_VOLUME` (L44) | `0.65` | ganancia base del bus de SFX |
| `masterGain` (getter) | `MASTER_VOLUME * volumeMultiplier` | ganancia efectiva del `GainNode` maestro |
| `volumeMultiplier` | por defecto `1`, se satura a `0..1.5` | multiplicador del ajuste |
| `noiseBuffer` | ruido blanco de `sampleRate * 0.5` s, creado perezosamente | base de `noise()` |
| `pinkBuffer` | ruido rosa de `sampleRate * 3` s (Paul Kellet) | base del viento y de varios `play*` |
| `levelUpEcho` | `DelayNode` de `0.11 s` con realimentación `0.28` | eco del arpegio de subida de nivel |

Métodos de ciclo de vida:

- `unlock()`: crea `AudioContext` (`window.AudioContext ?? webkitAudioContext`), crea el maestro,
  conecta a `destination` e inicializa el motor gravitacional. Si ya existe y está
  `suspended`, hace `resume()`.
- `dispose()`: `stop()` de viento y osciladores de gravedad, cierre del contexto (`ctx.close()`),
  limpieza de todos los buffers. Lo llama el bucle de la Cúpula al desmontar
  (`src/ui/domeGameLoop.ts:1482`).
- `toggleMute()`: alterna `_muted` y aplica `master.gain.setTargetAtTime(0 o masterGain, now, 0.01)`.
  Devuelve el nuevo estado.
- `needsUnlock` (getter): `ctx === null`.
- `audible` (getter privado): `false` si está muteado o sin contexto; si `ctx.state === 'suspended'`
  hace `resume()` antes de devolver `true`.

### 2.2 Primitivas de síntesis

- `tone(type, fromFreq, toFreq, duration, volume, delay = 0)`: `OscillatorNode` con barrido
  **exponencial** `fromFreq -> max(toFreq, 1)`; envolvente ADSR corta: `0 -> volume` en
  `min(0.02, duration*0.3)` (lineal) y `-> 0.0001` exponencial al final. `stop()` a
  `duration + 0.02`.
- `noise(duration, volume, cutoff)`: `BufferSource` del ruido blanco compartido, en bucle, con
  `BiquadFilter` **lowpass** que barre `cutoff -> max(cutoff*0.15, 60)` en exponencial; envolvente
  `volume -> 0.0001` exponencial.
- `getNoiseBuffer()`: buffer de ruido blanco compartido (una sola creación).

### 2.3 Motor gravitacional continuo (capa de ambiente)

`initGravityEngine()` monta dos capas permanentes colgadas del bus maestro:

1. **Viento**: `BufferSource` de ruido rosa en bucle → `BiquadFilter` **bandpass**
   (`frequency 130`, `Q 1.2`) → `BiquadFilter` **peaking** (`frequency 260`, `gain +5`) →
   `GainNode` (arranca en `0`).
2. **Zumbido de campo gravitacional**: `OscillatorNode` **sine 55 Hz** + **triangle 110.5 Hz** →
   `BiquadFilter` **lowpass 180 Hz** → `GainNode` (arranca en `0`).

`updateMovementSpeed(normalizedSpeed)` — llamado desde el bucle con
`Math.min(1, controller.getCurrentSpeed() / 30)` (`domeGameLoop.ts:1150`):

- Ignora cambios menores a `0.01` (`windSpeed` cacheado).
- `curve = speed^1.65`; `targetFreq = 130 + curve*1520`; `targetQ = 1.2 + curve*2.4`;
  `targetWindVol = speed < 0.02 ? 0 : 0.12 + curve*0.5` (tope 0.62).
- La resonancia sigue a `targetFreq * 1.45`.
- Suavizado `setTargetAtTime` con constantes `0.06` (frecuencias) y `0.08` (Q y ganancia).
- Si el campo gravitacional está activo, los osciladores suben con la velocidad:
  `55 + curve*24` y `110.5 + curve*48` (constante `0.1`).

`setGravityFieldActive(active)` — encendido por `hasActiveGravityRocks() || hasActiveBlackHole()`
(`domeGameLoop.ts:1151`):

- Sube/baja la ganancia a `0.24 / 0` con `setTargetAtTime(..., 0.15)`.
- Al apagarse devuelve los osciladores a `55` y `110.5` (constante `0.1`).

### 2.4 One-shots enrutados por `play(kind)` — 22 tipos

`GameSoundKind` (22) y el `switch` de `play()` coinciden exactamente:
`jump, anchor, stasisGrab, stasisThrow, parry, gravityShift, explosion, alert, warning,
bossHit, victory, keycard, switchClick, gateOpen, step, land, melee, hurt, telegraph,
wallBreak, npcTalk, bounce`.

| `kind` | Método | Síntesis exacta |
|---|---|---|
| `jump` | `playJump` | sine 320→620 Hz, 0.12 s, 0.7 |
| `anchor` | `playAnchor` | triangle 240→110, 0.2 s, 0.8; sine 480→240, 0.12 s, 0.35, delay 0.02 |
| `stasisGrab` | `playStasisGrab` | sine 520→760, 0.08 s, 0.6; sine 760→980, 0.08 s, 0.45, delay 0.06 |
| `stasisThrow` | `playStasisThrow` | sawtooth 720→180, 0.16 s, 0.5 |
| `parry` | `playParry` | square 880→880, 0.05 s, 0.5; square 1320→1180, 0.1 s, 0.4, delay 0.02 |
| `gravityShift` | `playGravityShift` | sine 420→150, 0.42 s, 0.7; sine 632→226, 0.42 s, 0.4, delay 0.03 |
| `explosion` | `playExplosion` | `noise(0.34, 0.9, 900)` + sine 120→40, 0.3 s, 0.8 |
| `alert` | `playAlert` | square 660→660, 0.09 s, 0.45; square 880→880, 0.12 s, 0.45, delay 0.11 |
| `warning` | `playWarning` | square 587→587, 0.07 s, 0.3; square 880→880, 0.11 s, 0.26, delay 0.085 |
| `bossHit` | `playBossHit` | square 150→85, 0.16 s, 0.85; `noise(0.1, 0.35, 500)` |
| `victory` | `playVictory` | triangle 523.25/659.25/783.99/1046.5 Hz, 0.22 s, 0.7, pasos de 0.13 s; sine 1046.5, 0.5 s, 0.5 al final |
| `keycard` | `playKeycard` | sine 990→1320, 0.09 s, 0.7; sine 1320→1760, 0.12 s, 0.55, delay 0.07 |
| `switchClick` | `playSwitchClick` | square 220→160, 0.05 s, 0.55; sine 660→990, 0.12 s, 0.5, delay 0.04 |
| `gateOpen` | `playGateOpen` | sawtooth 140→420, 0.3 s, 0.45; sine 560→840, 0.18 s, 0.35, delay 0.08 |
| `step` | `playStep` | sine 150→95, 0.045 s, 0.16; `noise(0.03, 0.06, 420)` |
| `land` | `playLand` | sine 190→60, 0.14 s, 0.5; `noise(0.07, 0.16, 380)` |
| `melee` | `playMelee` | `noise(0.12, 0.4, 1600)` + triangle 340→120, 0.1 s, 0.5, delay 0.02 |
| `hurt` | `playHurt` | square 190→52, 0.17 s, 0.95; sine 105→36, 0.24 s, 0.9; `noise(0.11, 0.42, 650)`; sawtooth 640→170, 0.26 s, 0.5, delay 0.02; square 320→96, 0.2 s, 0.3, delay 0.05 |
| `telegraph` | `playTelegraph` | square 880→1320, 0.07 s, 0.34; sine 1320→1760, 0.06 s, 0.22, delay 0.05 |
| `wallBreak` | `playWallBreak` | `noise(0.28, 0.7, 750)` + sine 110→42, 0.26 s, 0.7 + sawtooth 90→55, 0.12 s, 0.3, delay 0.03 |
| `npcTalk` | `playNpcTalk` | sine 640→900, 0.07 s, 0.55; sine 900→1180, 0.08 s, 0.4, delay 0.07 |
| `bounce` | `playBounce` | sine 240→620, 0.18 s, 0.7; triangle 240→620, 0.16 s, 0.4, delay 0.02; sine 620→880, 0.08 s, 0.3, delay 0.12 |

Estos 22 one-shots son la ruta de la **campaña** (`!tutorialId`), no la de la Cúpula:
`GameEngine` los emite desde `world.onSound` / `player.onSound`
(`src/game/GameEngine.ts:408`, `:427`) y en `GameEngine.ts:484`; los emisores concretos son
`src/game/entities/PlayerController.ts` (`hurt`, `bounce`, `land`, `step`, `gravityShift`,
`alert`, `jump`, `anchor`), `src/game/entities/enemyAI.ts` (`warning`, `telegraph`, `alert`,
`keycard`) y `src/game/entities/WorldObjects.ts` (`bossHit`, `explosion`, `telegraph`,
`npcTalk`, `gateOpen`, `switchClick`, `wallBreak`).

### 2.5 One-shots adicionales (invocados directamente, fuera del `switch`)

| Método | Síntesis | Disparador verificado |
|---|---|---|
| `playSideDash(direction: -1 \| 0 \| 1)` | noise rosa con `StereoPanner`: `-dir*0.65 -> dir*0.85` en 0.24 s; bandpass `Q 3.2`, `600 -> 2600` (0.08 s) `-> 450`; gain `0.01 -> 0.7 -> 0.001`; triangle 480→160, 0.24 s, 0.24 | dash lateral de Nyx, `NyxDomeController.ts:2212` y `:2263` |
| `playSpinKick()` | noise rosa bandpass `Q 6.5` `280 -> 3200` (0.34 s) `-> 520`; LFO 26 Hz con profundidad `180 -> 10` sobre la frecuencia del filtro; gain `0.05 -> 0.9 -> 0.001`; más `sawtooth` 140→780 por lowpass `400 -> 2800`, gain `0.01 -> 0.25 -> 0.001` | patada taladro / dash de parry: `:2534`, `:2566`, `:2620` |
| `playKineticImpact()` | sine 190→36, 0.25 s, 0.85; square 150→60, 0.12 s, 0.4; `noise(0.12, 0.5, 900)` | impacto real del taladro contra enemigo, `:2671` |
| `playVoidFall()` | noise rosa bandpass `Q 1.6` `2200 -> 320` en 0.5 s, gain `0.05 -> 0.55` (0.08 s) `-> 0.001`; sine 240→70, 0.4 s, 0.4 | Caída al Vacío, `:2567` |
| `playRepulsePush()` | noise rosa lowpass `3200 -> 180` en 0.35 s, gain 0.75; sine 95→42, 0.3 s, 0.7 | skill `repulse_push`, `domeGameLoop.ts:780` |
| `playEdenAbsorb()` | sine 392 / 523.25 / 659.25 Hz con `toFreq = nota*1.5`, 0.4 s, 0.4, pasos de 0.09 s; sine 1568→2093, 0.3 s, 0.2 al final | skill `eden_absorb`, `domeGameLoop.ts:783` |
| `playAttractionWell()` | dos `sawtooth` con `detune ±9`, 70→240 Hz en 1.2 s, lowpass 120→520, gain `0.0001 -> 0.32` (0.66 s) `-> 0.0001` | skill `attraction_well`, `domeGameLoop.ts:786` |
| `playBounceHorizon()` | square 1900→700, 0.14 s, 0.4; sawtooth 2600→1100, 0.1 s, 0.22, delay 0.02; `noise(0.1, 0.3, 4200)` | skill `bounce_horizon`, `domeGameLoop.ts:789` |
| `playBlackHoleCast()` | sine 70→28, 0.9 s, 0.85; noise rosa bandpass `Q 2.2` `200 -> 1600` (0.7 s), gain `0.0001 -> 0.4` (0.25 s) `-> 0.001` (0.8 s) | skill `black_hole`, `domeGameLoop.ts:792` |
| `playImplosion()` | noise rosa bandpass `Q 3.5` `300 -> 2600` (0.28 s), gain `0.5` a 0.22 s; colapso: sine 170→32, 0.3 s, 0.9, delay 0.26 + square 220→70, 0.14 s, 0.35, delay 0.27 | skill `implosion`, `domeGameLoop.ts:795` |
| `playLowHpPulse(urgent = false)` | sine 125→48, 0.14 s, 0.9; sine 105→42, 0.14 s, 0.6, delay 0.18 (urgente 0.14); triangle 880 Hz (urgente 1040), 0.09 s, 0.5 | HUD, `DomeYinYangHud.tsx:381`; urgencia `hp <= 0.12`, periodo `0.65 s` urgente / `0.95 s` normal |
| `playLowEdenPulse()` | dos `sawtooth` `detune ±12`, 540→190 en 0.18 s, bandpass 900 `Q 3`, gain 0.45 a 0.015 s; noise con `highpass 3200`, gain 0.28 durante 0.04 s | HUD, `DomeYinYangHud.tsx:392`, periodo `1.15 s`, umbral `eden <= 0.25` |
| `playLevelUp()` | triangle 523.25 / 783.99 / 1174.66 Hz, pasos de 0.065 s, 0.6 de pico, decay a 0.35 s, ruteado también al eco (`delay 0.11`, feedback `0.28`) | `DomeYinYangHud.tsx:368` al detectar `level` creciente |
| `playNewWave()` | sine 140→42, 0.24 s, 0.9; square 1800 Hz 0.02 s, 0.35; square 2400 Hz 0.02 s, 0.35, delay 0.06 | `DomeYinYangHud.tsx:371` al detectar `wave` creciente |
| `playLevelUpSpark()` | triangle 1480→2960, 0.09 s, 0.26; triangle 2960→880, 0.2 s, 0.2, delay 0.09 | fase 1 del planeta, `DomeLevelUpSequence.tsx:466` |
| `playLevelUpApproach()` | sawtooth 55→210 en 0.9 s por lowpass `Q 7` `220 -> 1600`; gain `0.0001 -> 0.3` (0.35 s) `-> 0.0001` (1.0 s) | fase 2, `DomeLevelUpSequence.tsx:491` |
| `playLevelUpSlash()` | noise en bucle, bandpass `Q 1.1` `3200 -> 240` (0.42 s), gain 0.34 | fase 3 (barrido blanco), `DomeLevelUpSequence.tsx:525` |
| `playCardSlam()` | sine 120→38, 0.16 s, 0.5; `noise(0.09, 0.26, 1400)` | entrada de cartas (340 ms, 480+i*130+430 ms) `:655`, `:662` |
| `playCardTremble()` | sawtooth 46 Hz con LFO 13 Hz profundidad 16, lowpass 220, gain 0.2 durante 0.5 s | carta en el centro, `:765` |
| `playCardStamp()` | square 880→110, 0.12 s, 0.18 + `playCardSlam()` | sello de carta elegida, `:699` |
| `playInkWipe()` | noise en bucle, bandpass `Q 1.1` `240 -> 2600` (0.42 s), gain 0.22 | vuelo de carta al centro, `:761` |
| `playIrisWink()` | sine 640→90, 0.5 s, 0.24; sine 2200, 0.03 s, 0.2, delay 0.5; sine 2900, 0.05 s, 0.16, delay 0.56 | cierre en iris, `:676` |
| `playSparrowShriek()` | sawtooth 1650→3250 (0.14 s) →1380 (0.72 s); triangle 2480→3900 (0.16 s) →1820; LFO 34 Hz profundidad 180 sobre ambas frecuencias; bandpass 2400 `Q 1.8`; gain 0.28 (0.05 s), 0.26 (0.42 s), `-> 0.0001` (0.78 s); `noise(0.55, 0.35, 2200)` | `waveMgr.consumeSparrowShriekPulse()`, `domeGameLoop.ts:1228` |
| `playElectricDash()` | sawtooth 1400→320 en 0.14 s, pico 0.16 | `bflySfx.dash`, `domeGameLoop.ts:1231` |
| `playElectricBall()` | triangle 880→1760 (0.06 s) →520 (0.18 s), pico 0.15 | `bflySfx.ball`, `domeGameLoop.ts:1232` |
| `playElectricBeamTick()` | square 440→980 en 0.08 s, pico 0.11 | `bflySfx.beam`, `domeGameLoop.ts:1233` |

Uso de `playBossHit` en la Cúpula: pulsos de cosmos de KRONOS (`domeGameLoop.ts:1247`),
colapso de Implosión `one_hit` (`:1357`), repulsión de miniboss (`:1387`) y ruptura de cristal
de KRONOS (`:1423`). `playWarning` se usa para el rugido / apertura de portal de KRONOS
(`:1241`).

### 2.6 Niveles de volumen observados en la Cúpula

- `SynthAudio` aplica `masterVolume * sfxVolume` desde el efecto de `DomeGameView`
  (`DomeGameView.tsx:154`).
- `startDomeGameLoop` vuelve a fijar, al montar el bucle, `audio.setVolumeMultiplier(masterVolume)`
  (`domeGameLoop.ts:199`) y `musicPlayer.setVolumeMultiplier(masterVolume)` (`:201`).
- Consecuencia verificada en el orden de ejecución: al primer montaje de la Cúpula manda el valor
  del bucle (solo `masterVolume`); `sfxVolume` y `musicVolume` entran en cuanto cambia
  `settings` y se re-ejecuta el efecto de `DomeGameView`.

---

## 3. Música — `src/game/audio/MusicPlayer.ts`

### 3.1 Pistas y archivos reales

`public/audio/` contiene exactamente:

| ID (`MusicTrackId`) | Archivo | Tamaño | Título en Media Session (`TRACK_TITLES`) |
|---|---|---|---|
| `menu` | `/audio/menu.mp3` | 3 705 098 B | `Menú` |
| `waveA` | `/audio/wave-nocturnal.mp3` | 4 024 555 B | `Nocturnal` |
| `waveB` | `/audio/wave-singularity.mp3` | 3 614 503 B | `Singularity` |
| `boss` | `/audio/boss.mp3` | 3 613 562 B | `Boss` |

Portada única del OST: `public/audio/covers/cover.webp` (637 644 B). Se publica en
`navigator.mediaSession.metadata` con URL **absoluta**
(`new URL('/audio/covers/cover.webp', window.location.origin).href`), `artist: 'OUTORBIT'`,
`album: 'OUTORBIT OST'`, `sizes: '512x512'`, `type: 'image/webp'`.

### 3.2 Constantes de reproducción

| Constante | Valor |
|---|---|
| `BASE_VOLUME` | `0.2` (por debajo de los SFX para que las alertas del HUD destaquen) |
| `FADE_STEP` | `0.05` por tick |
| `FADE_TICK_MS` | `50` ms (fundido completo ≈ 1 s) |
| `GAP_MIN_MS` / `GAP_MAX_MS` | `3000` / `6000` (silencio aleatorio entre pistas) |
| `NATURAL_NEXT` | `menu→menu`, `waveA→waveB`, `waveB→waveA`, `boss→boss` |
| `setVolumeMultiplier` | satura a `0..1.5`; volumen objetivo = `BASE_VOLUME * multiplier` |

### 3.3 Reglas de `play(track)` (verificadas en el código)

- Si hay un silencio entre pistas activo (`gapTimer`), se cancela y la pista arranca ya.
- Misma pista pedida y sin `pendingSwitch`: no hace nada (y limpia la cola).
- Interrumpe con fundido cuando: la pedida es `boss`, la actual es `boss`, o cambia el contexto
  menú ↔ juego (`(track === 'menu') !== (this.current === 'menu')`).
- Si no interrumpe, la pista va a **cola** (`queued`) y suena al terminar la actual, tras el
  silencio de 3-6 s.
- `stop()`: funde a cero, pausa y publica `playbackState = 'none'`.

### 3.4 Disparadores reales

| Punto del código | Llamada |
|---|---|
| `TitleScreen.tsx:81` (montaje) | `musicPlayer.play('menu')` |
| `TitleScreen.tsx:74` | `setVolumeMultiplier(masterVolume * musicVolume)` |
| `domeGameLoop.ts:206-214` (`syncWaveMusic`) | `label === 'BOSS'` → `play('boss')`; resto → alterna `waveA` / `waveB` con `waveTrackToggle++` |
| `domeGameLoop.ts:250` (modo entrenamiento) | `play('waveA')` |
| `domeGameLoop.ts:257` (oleada 1) y `:1128` (oleadas siguientes) | `syncWaveMusic(waveMgr.getWaveInfo().label)` |
| `domeGameLoop.ts:869` | tecla `M`: `musicPlayer.setMuted(audio.toggleMute())` |
| `domeGameLoop.ts:1274` (muerte de Nyx) y `:1483` (desmontaje) | `musicPlayer.stop()` |

Las oleadas de miniboss usan la rotación `waveA`/`waveB` (no tienen pista propia): el único caso
con pista dedicada es `label === 'BOSS'`. Los labels provienen de
`src/game/dome/DomeWaveManager.ts:436-461`: `'BÁSICOS'`, `'MINIBOSS'`, `'BOSS'`.

### 3.5 Elemento `<audio>` y MPRIS

- Un **único** `HTMLAudioElement` creado con `new Audio()`, `loop = false`, `preload = 'auto'`,
  `hidden = true`, montado en `document.body`. Cambia de `src` entre pistas (reciclar el elemento
  mantiene viva la sesión MPRIS en Firefox/Linux).
- `ended` → `onTrackEnded()` → silencio aleatorio → siguiente (`queued ?? NATURAL_NEXT[track]`).
- `loadedmetadata` → `publishPositionState(el)` (`setPositionState` con `duration`,
  `playbackRate`, `position`).
- Acciones del widget registradas una vez: `play` → `setMuted(false)`, `pause` → `setMuted(true)`.
  No se registran `previoustrack` ni `nexttrack`.
- Muteado **no** pausa: la pista sigue avanzando a volumen 0.
- Autoplay bloqueado: se guarda `blocked` y se reintenta en el primer `pointerdown`/`keydown`.
- Instancia única exportada: `export const musicPlayer = new MusicPlayer()`.

---

## 4. Controles

### 4.1 Teclado — acciones rebindables (`ControlAction`, 14)

Defaults en `src/game/settings.ts` (`DEFAULT_BINDINGS`):

| Acción | Tecla por defecto | Alias secundario (solo si el primario sigue siendo el de fábrica) |
|---|---|---|
| `forward` | `KeyW` | + `ArrowUp` (fallback, ver abajo) |
| `back` | `KeyS` | + `ArrowDown` |
| `left` | `KeyA` | + `ArrowLeft` |
| `right` | `KeyD` | + `ArrowRight` |
| `jump` | `Space` | — |
| `sprint` | `ShiftLeft` | `ShiftRight` |
| `interact` | `KeyE` | — |
| `parry` | `KeyF` | — |
| `stasis` | `KeyR` | `KeyC` |
| `lockOn` | `KeyQ` | `Tab`, `KeyV` |
| `radar` | `Tab` | — |
| `slot1` | `Digit1` | — |
| `slot2` | `Digit2` | — |
| `slot3` | `Digit3` | — |

`resolveActionCodes(bindings)` construye por acción la lista `primario + alias + flechas`:

- Los alias solo se aceptan si `primary === DEFAULT_BINDINGS[action]`; tras un rebind se descartan.
- Las flechas (`ArrowUp/Down/Left/Right`) solo se añaden a movimiento si ningún binding las ocupa.
- `NyxDomeController` invierte el mapa en `actionByCode` recorriendo `CONTROL_ACTIONS` en orden;
  como `radar` va después de `lockOn`, `Tab` termina resolviendo a `radar` en la Cúpula.

### 4.2 Acciones realmente consumidas en la Cúpula

Comprobado en `src/game/dome/NyxDomeController.ts`:

| Acción | Consumo |
|---|---|
| `forward`, `back`, `left`, `right` | `isDown(...)` en `update()`, líneas 1463-1464 (fusionadas con el stick izquierdo) |
| `sprint` | `isDown('sprint')` línea 1475 → `updateGrounded(simDt, f, r, sprintHeld, hasMoveInput)` |
| `jump` | `onKeyDown`: `wantJump = true` (línea 972) |
| `slot1`, `slot2`, `slot3` | `onKeyDown`: `wantSlot = 1/2/3` (líneas 973-975) |
| `radar` | `onKeyDown`: `radarEnabled = !radarEnabled` (línea 976) |
| `interact`, `parry`, `stasis`, `lockOn` | sin consumo en el controlador de la Cúpula (sí en la campaña, `PlayerController.ts:775-782`) |

`onKeyDown` ignora auto-repeat (`codesDown.has(code)`), y `setPointerLocked(false)` limpia
`codesDown`, `attackHeld` y `dashHeld`.

### 4.3 Ratón

| Elemento | Comportamiento verificado |
|---|---|
| Captura de puntero | clic en el canvas → `canvas.requestPointerLock()` (`domeGameLoop.ts:812`); overlay del HUD pide “HAZ CLIC EN LA ARENA PARA CAPTURAR EL RATÓN · ESC PARA SOLTAR” |
| `mousemove` | solo con lock; `controller.onMouseMove(e.movementX, e.movementY)` |
| Botón izquierdo (0) | `wantAttack = true`, `attackHeld = true` → Ataque de Velocidad |
| Botón derecho (2) | `wantDash = true`, `dashHeld = true` → Dash / Redirección / Rebote cinético |
| `contextmenu` | `preventDefault()` en el canvas |
| Sensibilidad | `sens = 0.0023 * settings.mouseSensitivity` (rad/píxel), `NyxDomeController.ts:908` |
| Inversión Y | `pitch = -dy * steerScale * (invertY ? -1 : 1)`, `:923` |
| Amortiguación | `VOID_FALL_STEER_DAMP = 0.16` durante `void_fall` |
| Límites | `CAM_PITCH_LIMIT = 1.15` rad (cámara en suelo), `AIM_PITCH_MAX_DOT = 0.985` (vuelo) |

### 4.4 Teclas de sistema en la Cúpula (`domeGameLoop.ts:864-925`)

| Tecla | Efecto |
|---|---|
| `M` | mute simultáneo de SFX y música |
| `Escape` o `KeyP` | abre la pausa (y `exitPointerLock`); si ya está abierta, la cierra sin pedir lock, con gracia de 250 ms (`pauseResumeGraceUntil`) |
| `Tab` | `preventDefault()` (radar) para no perder el foco del canvas |
| `F2` o `Tab` | solo en modo entrenamiento: mostrar/ocultar el panel debug |
| `T` | solo en entrenamiento: recarga Vida + Edén |
| `Escape` (con ajustes o tutorial abiertos) | lo consume el propio modal, la pausa no se mueve |
| Clic en canvas | desbloquea el `AudioContext` y captura el ratón |
| Cualquier `pointerdown` / `keydown` / botón de mando pulsado | desbloquea el `AudioContext` |

### 4.5 Mando — Gamepad API estándar W3C

`src/game/input/GamepadInput.ts`:

- `MAX_STANDARD_BUTTONS = 18` (índices 0..17).
- `readConnectedGamepad()`: devuelve el primer mando con `connected === true`; tolera la excepción
  de navegadores que lanzan sin gesto.
- `applyRadialDeadzone(x, y, deadzone)`: dentro del radio → `(0,0)`; fuera se reescala
  `min(1, (mag - deadzone) / (1 - deadzone)) / mag` (sin salto en el borde).
- `update()` (una vez por frame, antes de física): copia flancos (`currButtons` → `prevButtons`),
  lee botones con `pressed || value > 0.5` y ejes 0..3.
- `justPressed`, `held`, `justPressedAction`, `heldAction`, `getAnyJustPressed`,
  `getLeftStick` (Y negativa = adelante), `getRightStick` (Y negativa = arriba),
  `isConnected`, `getGamepadId`.

Defaults (`DEFAULT_GAMEPAD_BINDINGS`), acciones `GamepadAction` (9):

| Acción | Botón W3C |
|---|---|
| `attack` | 7 (R2) |
| `attackAlt` | 5 (R1) |
| `dash` | 4 (L1) |
| `dashAlt` | 6 (L2) |
| `jump` | 0 (Cruz / A) |
| `slot1` | 2 (Cuadrado / X) |
| `slot2` | 3 (Triángulo / Y) |
| `slot3` | 1 (Círculo / B) |
| `pause` | 9 (Options / Start) |

Etiquetas usadas en Ajustes (`GAMEPAD_BUTTON_LABELS`, 0..17): `Cruz (A)`, `Círculo (B)`,
`Cuadrado (X)`, `Triángulo (Y)`, `L1`, `R1`, `L2`, `R2`, `Share (Select)`, `Options (Start)`,
`L3`, `R3`, `D-Pad Arriba/Abajo/Izquierda/Derecha`, `PS`, `Touchpad`.

Uso en la Cúpula:

- Stick derecho: `rate = GAMEPAD_LOOK_RATE (2.6) * settings.gamepadSensitivity`, aplicado como
  `rotateLook(rs.x * rate * rawDt, rs.y * rate * rawDt)` (`NyxDomeController.ts:1022`).
- Stick izquierdo: se suma a WASD con `clamp(..., -1, 1)`.
- Botones: flanco → `wantAttack` / `wantDash` / `wantJump` / `wantSlot`; mantenido → `heldAction`
  para ataque y dash continuos.
- `pause` (9) abre/cierra la pausa; **Círculo (B, índice 1)** también la cierra
  (`domeGameLoop.ts:978`, `:996`). Reanudar con mando no captura el ratón.
- El mando funciona sin pointer lock; `gamepad.update()` se ejecuta incluso en pausa.

### 4.6 Navegación de menús con mando — `src/game/input/gamepadMenuNav.ts`

`useGamepadMenuNav({ enabled, onDirection, onConfirm, onBack })`:

- Poll con `requestAnimationFrame` (≈60 FPS) del primer mando conectado; se detiene con
  `enabled = false`.
- `STICK_THRESHOLD = 0.55`; direcciones por D-Pad 12/13/14/15 **o** stick izquierdo.
- Repetición: `REPEAT_DELAY_MS = 320` inicial, luego `REPEAT_RATE_MS = 130`.
- Confirmar = botón `0` (Cruz/A) por flanco; volver = botón `1` (Círculo/B) por flanco.

`useGamepadListNav(count, { enabled, columns, initialIndex, onConfirm, onBack })`:

- `columns === 1` → lista vertical (`up`/`down` con wrap); `columns > 1` → fila horizontal
  (`left`/`right` con wrap). Devuelve `[index, setIndex]` con clamp a `0..count-1`.

Dónde se usa:

| Pantalla | Modo |
|---|---|
| `TitleScreen` | lista de 5 entradas: `play`, `training` (si existe), `settings`, `leaderboard`, `language`; `enabled` solo sin modal |
| `DomePauseModal` | lista de botones; `onConfirm` ejecuta, `onBack` = reanudar |
| `DomeLevelUpSequence` | cartas en fila (`columns = choices.length`) y ranuras de reemplazo (`columns = equippedSlots.length`, `onBack` = volver) |

Navegación de teclado en menús:

- Portada: selector de idioma con tres botones (`ESPAÑOL` / `ENGLISH` / `日本語`).
- Pausa: `[1]..[N]` dispara el botón N — etiquetas visibles `[1]`… en cada botón.
- Level-up: `[1..N]` elige carta; con carta en vuelo `[1..3]` elige ranura; `Escape` vuelve.
- Battle Report: `1` / `r` / `R` = jugar de nuevo, `2` = menú (ignorado si se está escribiendo en
  el input).
- Ajustes: `Escape` cierra (salvo mientras se captura tecla o botón).
- Modales de portada (`MenuModalShell`): `Escape` cierra.

### 4.7 Rebinding

- Teclado: al pulsar una fila se entra en captura (`PULSA TECLA...`), se asigna cualquier
  `event.code` al instante y `Escape` cancela.
- Mando: captura por flanco real (estado actual vs poll anterior, índices 0..17); `Escape` cancela.
- Etiquetas de tecla: `formatKeyCode` (`Space → ESPACIO`, `ShiftLeft → SHIFT`, `KeyW → W`,
  `Digit1 → 1`, `ArrowUp → ↑`, `Numpad5 → NUM 5`).
- Botón `RESTAURAR MANDO POR DEFECTO` y `RESTAURAR TODO POR DEFECTO`.

---

## 5. Ajustes — `src/game/settings.ts`

Interfaz `GameSettings` completa (11 campos + bindings):

| Campo | Tipo | Default | Rango / valores (`SETTINGS_LIMITS`) |
|---|---|---|---|
| `language` | `'es' \| 'en' \| 'ja'` | `'en'` | — |
| `mouseSensitivity` | number | `1.0` | 0.25 – 2.5 |
| `invertY` | boolean | `false` | — |
| `baseFov` | number | `70` | 55 – 85 |
| `masterVolume` | number | `1.0` | 0 – 1.5 |
| `musicVolume` | number | `1.0` | 0 – 1.5 |
| `sfxVolume` | number | `1.0` | 0 – 1.5 |
| `halftonesEnabled` | boolean | `true` | — |
| `easyMode` | boolean | `false` | duplica Vida/Edén (`easyMult = 2`) y desactiva `setDifficultyScaling` |
| `bindings` | `Record<ControlAction, string>` | `DEFAULT_BINDINGS` | códigos `KeyboardEvent.code` |
| `gamepadSensitivity` | number | `1.4` | 0.5 – 3.0 |
| `gamepadDeadzone` | number | `0.14` | 0.05 – 0.35 |
| `gamepadBindings` | `Record<GamepadAction, GamepadButtonIndex>` | `DEFAULT_GAMEPAD_BINDINGS` | enteros 0..17 |

Persistencia:

- Clave principal versionada `outorbit.settings.v1` (`STORAGE_KEY`).
- Además, estructuras paralelas en `src/game/localStorageState.ts`:
  `outorbit_language`, `outorbit_nickname`, `outorbit_pilot_name` (legacy),
  `outorbit_best_score`, `outorbit_button_mapping` (array `{device, action, binding}`),
  `outorbit_other_settings` (array `{key, value}` con 10 claves), `outorbit_tutorial`
  (3 ids: `tutorial_de_movimiento`, `tutorial_de_rebotes`, `tutorial_de_slow_mo`).
- `sanitizeSettings` sanea TODO al cargar: números fuera de rango → clamp, tipos inválidos →
  default, idioma distinto de `es`/`ja` → `en`, binding vacío → default. Un JSON corrupto o de
  versión vieja nunca rompe la partida (`try/catch`).
- `saveGameSettings` sanea antes de guardar y escribe las tres estructuras + la clave versionada;
  si `localStorage` falla (modo privado, cuota) los ajustes viven solo en la sesión.
- `resetGameSettings()` / botón de la UI → `cloneGameSettings(DEFAULT_SETTINGS)` y guardado.
- `cloneGameSettings` copia profunda de `bindings` y `gamepadBindings`.

Cómo llegan al juego: `App.tsx` es la fuente de verdad (`useState(() => loadGameSettings())`),
`handleUpdateSettings` hace `saveGameSettings({ ...next, language })` y `setSettings(next)`;
`DomeGameView` propaga a `controllerRef.applySettings`, al audio y a la música en un efecto sobre
`settings`, y el `TitleDioramaSandbox` recibe `setSettings` para el diorama.

---

## 6. UI / HUD

### 6.1 Flujo de pantallas (`src/App.tsx`)

- `screen: 'title' | 'game'`; `runKey` remonta la partida; `trainingMode` activa el panel debug.
- `screen === 'title'` → `TitleScreen` (`onPlay` = `JUGAR`, `onPlayTraining` = `Entrenamiento`).
- `screen === 'game'` con `activeTutorialId` → canvas + `GameHUD` + `BattleReportScreen`
  (ruta de campaña/tutorial).
- `screen === 'game'` sin `activeTutorialId` → `DomeGameView` (la Cúpula).
- En el código actual, `handlePlay` y `handlePlayTraining` fijan `activeTutorialId = null`, y solo
  `handleNextTutorial` cambia ese id (alcanzable únicamente desde `GameHUD`, que se pinta en la
  rama de tutorial). Es decir: la ruta jugable desde la portada es la Cúpula.
- `MobileBlocker` se monta siempre; bloquea con `pointer: coarse` **o** `innerWidth < 768`
  (`mobile.title` / `mobile.body` / `mobile.footer`).

### 6.2 Portada — `src/ui/TitleScreen.tsx`

- Fondo: canvas WebGL del diorama (`TitleDioramaSandbox`) `pointer-events-none`, `aria-hidden`.
- Panel izquierdo (25 % del ancho, `min 230px`, `max 380px`): tag `t('menu.tagline')` +
  logo `OUT` + `ORBIT` (itálica, acento carmesí `#e11d48`).
- Botones `FluidInkButton` con paleta `MENU_STOPS = ['#e11d48', '#7c3aed', '#22d3ee']`:
  `t('menu.play')` (alto 116, 1.5rem), `t('menu.training')` (84, 0.875rem, opcional),
  `t('menu.controls')` (abre Ajustes), `t('menu.leaderboard')` (abre Leaderboard).
  `focused` ligado a `padIndex` del mando.
- Selector de idioma abajo a la izquierda: tres botones con `aria-label` `Español` / `English` /
  `日本語`; el activo en `#0e7490`; el chip se resalta con borde y sombra `#e11d48` cuando el mando
  está en esa fila.
- Modales: `SettingsScreen` y `LeaderboardModal` (`MenuModalShell`, vidrio, `Escape` cierra).

### 6.3 HUD de la Cúpula — `src/ui/DomeHudSketch.tsx`

Contenedor: `absolute inset-0 z-20 pointer-events-none select-none overflow-hidden font-mono
text-white`. Capas, en orden de pintado:

1. **Screentones halftone manga** (bordes): opacidad
   `min(0.88, max(0, (speed - 7)/14) + impactFlash*0.45)`; dos `radial-gradient` cian
   `rgba(34,211,238,0.85)` 2.2 px y violeta `rgba(168,85,247,0.75)` 1.8 px, rejilla 12 px,
   máscara radial (transparente al 48 %, negro al 96 %).
2. **Rayos radiales anime 2D** a velocidad terminal: `radialLines = max(0, (speedLinesIntensity -
   0.5)/0.5)`; `repeating-conic-gradient` blanco 0.32° / oscuro 2.4-2.9°, escala
   `1 + radialLines*0.06`, opacidad `min(0.85, radialLines)`.
3. **Corona de presión G** en esquinas, solo en `speed_attack` o `dashing`; opacidad
   `min(0.72, 0.24 + halftone*0.55)`; rojo `rgba(244,63,94,0.55)` + negro, rejilla 16 px.
4. **Flash de rebote contra la cúpula**: `boxShadow inset 0 0 120px 30px rgba(244,63,94,0.45)`
   con opacidad `min(1, domeBounceFlash)`.
5. **Mancha de Tinta Ácida** (ver 6.5).
6. **Viñeta de Caída al Vacío** (modo `speed_attack` con `speedAttackKind === 'void_fall'`):
   `inset 0 0 220px 70px rgba(109,40,217,0.40)` + `inset 0 0 130px 36px rgba(79,70,229,0.30)`.
7. **Alerta crítica de Edén** (`eden/maxEden < 0.2`): animación `domeHudCritical 0.7s` con
   `inset 0 0 120px 26px rgba(59,232,255,0.26)` + `inset 0 0 40px 10px rgba(168,85,247,0.24)`.
8. **Tinte de cámara lenta** cuando `bulletTimeActive`: `inset 0 0 180px 40px rgba(34,211,238,0.22)`
   + `inset 0 0 90px 24px rgba(168,85,247,0.18)`.
9. **Visor central** (`RETICLE_SIZE_PX = 120` px, `viewBox 0 0 512 512`):
   - Octógono exterior (trazo 2, opacidad 0.8) que se cierra con la velocidad:
     `scale(1 - min(0.08, speed*0.003))`.
   - Octógono interior (trazo 5).
   - 4 arcos giroscópicos (trazo 1.75, opacidad 0.5) rotados `gyroSpinRad`.
   - 4 ticks cardinales (trazo 2.5, opacidad 0.7) contra-rotados `-cameraRollDeg`.
   - Anillo de cuenta atrás de slow-mo (`r = 150`): cian `#22d3ee`, dorado `#ffd54f` en fases de
     parry; `strokeDasharray` proporcional a `bulletTimeRemaining / (isParrySlowMo ? 16.0 : 2.2)`.
   - Estrella central de 4 puntas, color según estado: `#00d0ff` (rebote cinético adjudicado),
     `#ffd54f` (estrella de parry bajo la mira), `#7fd8ff` (rebote disponible sin lock),
     `#ffffff` (sin lock), `#ff4040` (`can_lock`), `#ff0000` (`locked`, con glow rojo).
   - Punto de mira `r = 3` con el mismo color.
   - Escala del visor por `impactFlash`: `scale(1 + impactFlash*0.1)`.
   - Etiqueta bajo el visor con `hud.parryStrikeHint` (stage `strike`), `hud.parryDashHint`
     (stage `decide`) o `hud.bulletTimeHint`; pulsos `domeHudBulletPulse 0.9s`.
10. **Marcador romboidal** de 22×22 sobre el enemigo lockeado/lockeable (rojo `#ff2a55`,
    animación `domeHudPulse 0.9s`).
11. **Radar de enemigos** (`hud.radarDots`): círculos `r 4.5` rojo `#ff1f3d` con borde blanco y
    glow; los fuera de encuadre van al borde con `edgeAngleDeg` y una flecha `9,-4 16,0 9,4`.
12. **Yin-Yang de vida/Edén/EXP/nivel/oleada** (ver 6.4).
13. **3 ranuras de habilidad** (ver 6.6).
14. **Overlay de captura de ratón** cuando `!hud.pointerLocked` y `hidePointerLockPrompt` es falso:
    `hud.clickToCapture` + tres líneas de guía `hud.groundControls`, `hud.floatControls`,
    `hud.speedAttackControls`.
15. **Aviso de mando conectado** (`hud.gamepadConnected`) arriba a la derecha, chip cian:
    `hud.gamepadConnected`.
16. Keyframes propios: `domeHudPulse`, `domeHudBulletPulse`, `domeHudCritical`, `domeHudInkCrawl`.

Props: `hud`, `hidePointerLockPrompt`, `audioRef`, `alertsEnabled`. En `DomeGameView`,
`hidePointerLockPrompt` es true con level-up, battle report, pausa, tutorial o panel debug abierto;
`alertsEnabled` es false con pausa, level-up, battle report o tutorial.

### 6.4 Yin-Yang de vida y Edén — `src/ui/DomeYinYangHud.tsx`

- Lienzo lógico `420 x 200`, símbolo centrado en `(100,100)`, `R_OUTER = 76.5`, `R_INNER = 65.5`,
  `TICK_COUNT = 96` marcas radiales (mayores cada 12).
- Canvas WebGL de 320×320 px superpuesto, dimensionado con `calc(134 / 420 * 100%)` y
  `calc(134 / 200 * 100%)`.
- Shader (fragment):
  - Mitad superior = **Vida**, mitad inferior = **Edén**; cada mitad se llena de abajo arriba con
    `hpFill`/`edenFill`, con menisco ondulado:
    `sin(uv.x*11 + t*2.1)*0.010 + sin(uv.x*23 - t*3.3)*0.005`.
  - Vida por bandas: verde `vec3(0.11,0.86,0.36)` > 65 %, naranja `(1.00,0.50,0.07)` en 45-65 %,
    rojo `(0.94,0.10,0.22)` < 35 % (transiciones suaves).
  - Edén: degradado `deepVoid (0.09,0.04,0.22)` → `nebula (0.48,0.09,0.45)`, screentone y dos capas
    de estrellas en remolino; se oscurece al bajar el Edén (`mix(0.5, 1.0, smoothstep(0, 0.7, eden))`).
  - `emptyCol = vec3(0.03,0.03,0.05)` para la parte vacía.
  - Rim light cian `(0.35,0.85,1.0)` respirando a `sin(t*1.7)`.
  - Onda de choque al subir de nivel (`u_levelPulse`).
  - Puntos críticos (`<= 0.25`): halo + parpadeo `sin(t*9.0)`; rojo `(1.0,0.12,0.22)` arriba,
    cian `(0.15,0.92,1.0)` abajo.
  - Grano `hash21` de amplitud `0.022`.
- Barra superior NV./OLEADA dentro de polígonos recortados por el anillo: `t('hud.levelPrefix')` +
  nivel a 2 dígitos y `t('hud.wave', { n: pad2(wave) })`. Color de la oleada:
  `#ff4d6d` si `BOSS`, `#ffc857` si `MINIBOSS`, `#ffffff` resto. Sin `waveNumber` (entrenamiento)
  muestra `t('hud.training')`.
- Anillo de EXP: pista `rgba(59,232,255,0.25)` (trazo 10) en `r 71` + cuña de progreso horaria
  (`expWedgePath`, arranca a las 12) con ticks activos blancos/cian y `drop-shadow`.
- Audio del HUD (bucle `requestAnimationFrame`): `playLevelUp()` cuando sube `level` (y dispara el
  pulso), `playNewWave()` cuando sube `wave` (siempre, sin depender de `alertsEnabled`);
  con `alertsEnabled`: `playLowHpPulse(urgent)` si `0 < hp01 <= 0.25` (urgente `<= 0.12`,
  periodo 0.95 s / 0.65 s) y `playLowEdenPulse()` si `0 < eden01 <= 0.25` (periodo 1.15 s).
- Colores del texto de estado usados por el HUD: `ACCENT = '#3be8ff'`.
- Se re-renderiza a 30 Hz (`domeGameLoop.ts:1304-1306`: `hudTimer >= 1/30`).

### 6.5 Mancha de Tinta Ácida (overlay)

- Intensidad `hud.inkOverlayIntensity` viene de `DomeCombatSystem.updatePlayerStatus`:
  `inkStainOpacity * fadeIn * fadeOut`, con `INK_FADE_IN_SEC = 0.12` y `INK_FADE_OUT_SEC = 0.45`.
- Parámetros del combate: `INK_DOT_PER_SEC = 4.0` HP/s, `INK_STAIN_SEC = 3.0`,
  `INK_STAIN_OPACITY = 0.55`, `INK_COUNTER_OPACITY = 0.65`, `INK_COUNTER_MIN_SEC = 5.0`,
  `INK_COUNTER_MAX_SEC = 10.0`.
- Dibujo (SOLO SVG, procedural): salpicadura generada con LCG determinista
  (`makeInkRng(seed)`), lienzo virtual `1600 x 900`, `fill = rgba(4,2,8,0.97)`:
  - 2 blobs principales (`inkMainSplatPath`): 28-38 anclas, brazos con probabilidad 0.38, huecos
    internos 4-8 con `fillRule="evenodd"`.
  - 8-12 rayos radiales afilados (`inkStreakPath`).
  - 55 gotas elípticas.
  - 3-5 chorretes (`inkDripPath`).
  - Filtro `domeInkUnifiedRim`: `feMorphology dilate radius 2.2` + `feFlood rgba(165,18,56,0.72)`.
- Se regenera cuando la intensidad sube más de `0.12` o pasa de 0 a >0.005 (semilla nueva por
  impacto); visible con intensidad `> 0.005`.

### 6.6 Slots de habilidad — `src/ui/DomeSkillSlotsHud.tsx`

- Tres ranuras circulares apiladas, `clamp(68px, 5.8vw, 86px)`, opacidad 0.3 si vacía.
- SVG `viewBox 0 0 120 120`: núcleo abisal con gradiente radial (`#1b1138 → #090418 → #040408`,
  activo `#0f2d46`), bisel con 12 muescas (mayores cada 3), retícula heptagonal interior.
- Aro de cooldown: `RING_RADIUS = 46`, `strokeWidth 6.5`, pista `rgba(228,228,236,0.12)`,
  progreso con gradiente `#00e5ff → #818cf8 → #e879f9`, `#00e5ff` sólido si activa.
- Icono `/icons/skills/<skillId>.webp` al 46 %, invertido a blanco (`invert(1)`), opacidad 0.42 en
  cooldown; iconos existentes: `attraction_well`, `black_hole`, `bounce_horizon`, `eden_absorb`,
  `gravity_field`, `implosion`, `repulse_push`.
- Etiqueta de tecla biselada (`slot.keyLabel`) abajo-derecha.
- Pips de nivel (rombos de 5×5) bajo el círculo, uno por nivel.

### 6.7 Aros de materia oscura — `src/ui/DomeDarkMatterRings.tsx`

- Overlay en canvas 2D propio con bucle `requestAnimationFrame` independiente (sin estado React);
  lee `controller.getDarkMatterRings()` cada frame (`NyxDomeController.getDarkMatterRings`, L2013).
- Los aros los proyecta `updateDarkMatterRings(camera, enemies)` (L1947) cada frame:
  centro y radio proyectados de la hitbox del enemigo + `DARK_RING_PADDING_PX * 2`.
- Descartados: por debajo de `DARK_RING_NEAR_CUTOFF_M` de distancia (con fundido de 1.5 m) y, sin
  radar, los que superan `DARK_RING_APPEAR_RADIUS_PX` (fundido en la banda de 12 px). Con el radar
  de `Tab` activo se muestran todos y `alpha = 1`.
- Dibujo: anillo de 72 vértices con ruido angular de armónicos disonantes (`darkNoise`, escala de
  referencia `REF_RADIUS = 133`), `TIME_SPEED = 0.9`, `ROT_SPEED = 0.85`, `globalAlpha =
  baseAlpha * 0.45`, pulso `0.35 + 0.05 * sin(t * 9.4 + phase)` en pasivo.

### 6.8 Pausa — `src/ui/DomePauseModal.tsx`

- Fondo papel `#f1f1ed` con rejilla de 96 px, tinta `#0b0d12`, animación `pauseIn 260ms`.
- Kicker `t('pause.subtitle')` y título `t('pause.title')` con `-webkit-text-stroke: 4px` y sombra
  `rgba(225,29,72,0.3)`.
- Chips: `t('pause.wave', {n})` + etiqueta traducida de oleada (`waveLabelKey`) o
  `t('pause.orbitStable')` sin oleada; `t('pause.level', {n})`.
- Botones (con `hotkey` visible `[1]`, `[2]`, …) y acentos: `pause.resume` (`#22d3ee`),
  `pause.settings` (`#fbbf24`), `pause.restart` (`#e11d48`, oculto en entrenamiento),
  `pause.exit` (`#0b0d12`).
- Teclado `[1]..[N]` ejecuta; mando: lista + Cruz confirma + Círculo reanuda.
- Montaje condicional: `isOpen && !settingsOpen`.

### 6.9 Subida de nivel — `src/ui/DomeLevelUpSequence.tsx`

- Fases: `planet` (transición 3D del planeta) → `cards` → `closing` (iris).
- Sonidos por fase: `playLevelUpSpark` (fase 1), `playLevelUpApproach` (fase 2),
  `playLevelUpSlash` (blanqueo al 72-100 % de la fase 2), `playCardSlam` (340 ms y
  `480 + i*130 + 430` ms), `playInkWipe` (carta vuela al centro), `playCardTremble` (430 ms
  después), `playCardStamp` (sello) y `playIrisWink` (cierre, con 1180 ms antes de aplicar).
- Textos: `levelUp.banner` / `levelUp.replaceBanner`, `levelUp.title` (`LEVEL {{n}}`),
  `levelUp.rarity.*` (`base`, `common`, `epic`, `legendary`), `levelUp.kind.*`
  (`activeNew`, `activeUpgrade`, `passive`), `levelUp.edenCost` (`COSTE: {{n}} EDÉN`),
  `levelUp.chooseHint`, `levelUp.slotReplacement`, `levelUp.emptySlot`, `levelUp.levelShort`,
  `levelUp.escBack`.
- Nombre y descripción por `skills.*` y `skillDescriptions.*` a través de `SKILL_I18N_KEYS`
  (pasivas con sufijo de nivel: `skillDescriptions.hpRegen2`, etc.).

### 6.10 Battle Report y ranking de la Cúpula — `src/ui/DomeBattleReport.tsx`

- Preview del ranking con `fetchTopLeaderboard(BOARD_PREVIEW_LIMIT = 5)`.
- Nombre de piloto recordado (`loadPilotNickname`), récord personal (`loadPersonalBestScore`) y
  **auto-subida** si el jugador ya tiene apodo y supera su récord (`beatRecordOnMount`).
- Estados de guardado: `idle` / `saving` / `saved` / `error`, con claves
  `battleReport.saveIdle`, `saveSaving`, `saveSaved`, `saveError`, `saveErrorHint`,
  `saveHint`, `autoUploadingHint`, `autoUploadedHint`, `belowRecordHint`, `savedOutOfTop`.
- Tras guardar: persiste apodo, actualiza récord, recarga el ranking y resalta la fila propia
  (`boardYou`).
- Atajos: `1` / `r` / `R` jugar de nuevo; `2` menú principal.
- Formato de número por idioma: `ja-JP` / `es-ES` / `en-US` vía `toLocaleString`.

---

## 7. Localización (`es`, `en`, `ja`)

### 7.1 Infraestructura — `src/i18n/index.ts`

- `DICTIONARIES = { es, en, ja }`; `LanguageProvider` envuelve la app en `src/main.jsx`.
- `t(key, params)`: resuelve ruta con puntos (`resolvePath`), sustituye `{{param}}` con
  `interpolate` (los parámetros ausentes se dejan como `{{param}}`).
- Fallback real: diccionario del idioma → `en` → `es` → la propia clave (la UI nunca rompe).
- Contexto por defecto sin provider: `language: 'en'`, `setLanguage`/`toggleLanguage` no-op,
  `t` resolviendo contra `en`→`es`→clave.
- `setLanguage` guarda en `outorbit_language` y en `saveGameSettings({...loadGameSettings(),
  language})`; `toggleLanguage` cicla `es → en → ja → es`.
- Toques de idioma inicial: `loadStoredLanguage() ?? loadGameSettings().language`, y `'en'` como
  último recurso.
- `waveLabelKey(label)`: `'BÁSICOS' → enemies.waveBasic`, `'MINIBOSS' → enemies.waveMiniboss`,
  `'BOSS' → enemies.waveBoss`; cualquier otro label se muestra tal cual.
- `SKILL_I18N_KEYS` (10): `gravity_field→gravityField`, `repulse_push→push`,
  `eden_absorb→edenAbsorption`, `attraction_well→attractionWell`, `bounce_horizon→bounceHorizon`,
  `black_hole→blackHole`, `implosion→implosion`, `speed_force→speed`, `eden_regen→edenRegen`,
  `hp_regen→hpRegen`.
- `ENEMY_I18N_KEYS` (8): `abyssal_cell→enemies.abyssalCell`, `spiral_octopus→spiralOctopus`,
  `crab_gunner→crabGunner`, `ground_golem→groundGolem`,
  `lightning_butterfly→lightningButterfly`, `giant_sparrow→giantSparrow`,
  `prisma_necroz→prismaNecroz`, `kronos_leviathan→kronosLeviathan`.

### 7.2 Cobertura

| Idioma | Claves hoja | Secciones de primer nivel | Faltantes vs `es` | Extras vs `es` | Vacías |
|---|---|---|---|---|---|
| `es` (base) | 251 | 15 | 0 | 0 | 0 |
| `en` | 251 | 15 | 0 | 0 | 0 |
| `ja` | 251 | 15 | 0 | 0 | 0 |

Secciones: `menu`, `controls`, `hud`, `pause`, `levelUp`, `settings`, `skills`, `enemies`,
`battleReport`, `leaderboard`, `tutorials`, `domeTutorial`, `mobile`, `skillDescriptions`,
`trainingPanel`.

Textos idénticos al español (no traducidos, por diseño o por ser nombres propios/siglas):
`en` 31 claves — `menu.tagline`, `menu.trainingDebug`, `menu.leaderboard`, `menu.languageEs`,
`menu.languageEn`, `menu.languageJa`, `controls.actions.sprint`, `controls.actions.parry`,
`hud.hp`, `levelUp.rarity.base`, `settings.tabGeneral`, `settings.sectionAudio`,
`settings.sectionVisual`, `enemies.waveMiniboss`, `enemies.waveBoss`, `enemies.prismaNecroz`,
`battleReport.title`, `battleReport.statKills`, `leaderboard.title`, `leaderboard.colRank`,
`leaderboard.colScore`, `domeTutorial.badge`, los tres `*.number` de tutorial, `*.wasdLabel` (x2),
`legendDash`, `chipParry`, `trainingPanel.debug`, `trainingPanel.extrasSection`.
`ja` 11 claves — `menu.languageEs/En/Ja`, `hud.hp`, `battleReport.title`, `leaderboard.title`,
`leaderboard.colRank`, los tres `*.number` de tutorial y `*.wasdLabel` de movimiento.

Particularidades del japonés verificadas en el archivo: `hud.wave` usa `WAVE {{n}}` (no traduce la
palabra), `pause.title` = `PAUSE`, `levelUp.banner` = `LEVEL UP!`, `levelUp.title` =
`LEVEL {{n}}`, `domeTutorial.continueKey` = `スペース`, `settings.tabGamepad` =
`コントローラー`. Las fuentes de `DomePauseModal` / `SettingsScreen` incluyen
`"Noto Sans JP", "Hiragino Kaku Gothic ProN", "Meiryo"`; el HUD yin-yang usa `HUD_FONT =
'Barlow Condensed', 'Noto Sans JP', 'Hiragino Kaku Gothic ProN', 'Meiryo', 'Arial Narrow',
'Helvetica Neue', sans-serif`, mientras el resto del HUD se apoya en la clase `font-mono`.

### 7.3 Claves por pantalla

| Pantalla / componente | Claves usadas |
|---|---|
| `TitleScreen` | `menu.tagline`, `menu.play`, `menu.training`, `menu.controls`, `menu.leaderboard`, `menu.languageEs/En/Ja` |
| `DomeHudSketch` | `hud.clickToCapture`, `hud.groundControls`, `hud.floatControls`, `hud.speedAttackControls`, `hud.bulletTimeHint`, `hud.parryDashHint`, `hud.parryStrikeHint`, `hud.gamepadConnected` |
| `DomeYinYangHud` | `hud.levelPrefix`, `hud.wave`, `hud.training` |
| `DomePauseModal` | `pause.subtitle`, `pause.title`, `pause.wave`, `pause.orbitStable`, `pause.level`, `pause.resume`, `pause.settings`, `pause.restart`, `pause.exit` |
| `DomeLevelUpSequence` | `levelUp.*`, `skills.*`, `skillDescriptions.*` |
| `DomeBattleReport` | `battleReport.*`, `skills.*` vía `SKILL_I18N_KEYS` |
| `SettingsScreen` | `settings.*`, `controls.keyBindings`, `controls.keyboardHint`, `controls.pressKey`, `controls.pressButton`, `controls.gamepadConnected`, `controls.gamepadNone`, `controls.gamepadConnectHint`, `controls.stickSensitivity`, `controls.deadzone`, `controls.buttonBindings`, `controls.resetGamepad`, `controls.w3cMappingNote`, `controls.actions.*`, `controls.gamepadActions.*` |
| `LeaderboardModal` | `leaderboard.*` |
| `DomeTutorialCard` | `domeTutorial.badge`, `domeTutorial.<id>.number/title/paragraph1/paragraph2`, `domeTutorial.continueKey`, `domeTutorial.continueAction` |
| `DomeTrainingPanel` | `trainingPanel.*`, `enemies.*` vía `ENEMY_I18N_KEYS`, `skills.*`, `skillDescriptions.*` |
| `MobileBlocker` | `mobile.title`, `mobile.body`, `mobile.footer` |

---

## 8. Leaderboard Base44

### 8.1 Entidad

`base44/entities/LeaderboardEntry.jsonc`:

| Propiedad | Tipo | Nota |
|---|---|---|
| `player_name` | string | callsign del piloto (requerido) |
| `clear_time_sec` | number | segundos (requerido) |
| `score` | number | puntuación (requerido) |
| `dominant_style` | string | estilo táctico (requerido) |
| `stealth_pct`, `aggression_pct`, `aerial_pct`, `subterranean_pct`, `stasis_pct` | number | porcentajes |
| `alarms_triggered` | number | alarmas |

RLS: `read {}` y `create {}` abiertos; `update` y `delete` restringidos a `role: admin`.

Tipo espejo en TypeScript: `LeaderboardEntryRecord` (`src/game/types.ts:532-545`) con
`id?` y `created_date?`.

### 8.2 Acceso — `src/api/leaderboard.ts`

- `fetchTopLeaderboard(limit = 10)`: `base44.entities.LeaderboardEntry.list({ sort: '-score',
  limit })`, devuelve `page.items ?? []`; en error hace `console.warn` y devuelve `[]`.
- `submitLeaderboardEntry(entry)`: `base44.entities.LeaderboardEntry.create({...entry})`;
  devuelve el registro o `null` en error.

### 8.3 Uso en la UI

| Lugar | Límite | Notas |
|---|---|---|
| `LeaderboardModal` (portada) | 15 | carga al abrir, cachea y permite `RECARGAR`; columnas `#`, `Piloto`, `Tiempo`, `Score`, `Estilo`, `Alarmas`; `formatTime(clear_time_sec)` → `m:ss`; podio con colores ámbar/plata/bronce; `dominant_style` vacío → `—` |
| `DomeBattleReport` | 5 | preview dentro del informe; resalta la fila propia y permite recargar |

### 8.4 Score y mapeo de campos (`src/game/dome/DomeRunStats.ts`)

`DOME_SCORE_WEIGHTS` y fórmula de `getScore()`:

```
score = wave*500 + kills*100 + elites*750 + bosses*2500 + barrierKills*125
      + perfectRedirections*150 + floor(maxSpeedReached)*10
      + floor(survivalTimeSec)*5 + damageDealt*0.1 + maxLevelReached*250
```

Redondeado y con mínimo 0.

`submitDomeRunToLeaderboard(summary, playerName)` rellena:

| Campo Base44 | Origen |
|---|---|
| `player_name` | nombre introducido (o `battleReport.defaultPilotName` = `PILOTO`) |
| `clear_time_sec` | `round(survivalTimeSec)` |
| `score` | `round(score)` |
| `dominant_style` | `boss_slayer` (≥1 jefe) · `barrier_trickster` (barrierKills*3 ≥ kills) · `redirector` (redirecciones*2 ≥ kills) · `kinetic_duelist` (resto) |
| `stealth_pct`, `subterranean_pct`, `stasis_pct` | `0` (no aplican en la Cúpula) |
| `aggression_pct` | `100 * (1 - barrierKills/kills)` |
| `aerial_pct` | `100 * maxSpeedReached / AERIAL_SPEED_REFERENCE (80)`, clamp 0..100 |
| `alarms_triggered` | oleada alcanzada |

### 8.5 Persistencia local asociada

- `outorbit_nickname` (con migración desde `outorbit_pilot_name`), `outorbit_best_score`.
- `savePilotNickname` limpia espacios y escribe ambas claves de nombre; `loadPersonalBestScore`
  redondea y descarta valores no finitos o ≤ 0.

---

## 9. Notas de verificación y límites del documento

- Todos los valores numéricos de audio (frecuencias, duraciones, ganancias, delays) fueron leídos
  del código y re-extraídos con un script que enumera los 55 métodos y los 22 `case` de `play()`.
- Todos los recuentos de i18n provienen de aplanar los tres JSON y comparar conjuntos de claves.
- El documento no evalúa calidad, no propone rediseños y no incluye recomendaciones.
- Puntos donde el código tiene comportamiento contraintuitivo y se reportan tal cual, sin
  corregirlos: (1) el `fallback` real de `t()` es `en → es → clave` aunque los comentarios del
  archivo digan `es`; (2) `startDomeGameLoop` reajusta el volumen del audio y de la música solo con
  `masterVolume` al montar; (3) las acciones `interact`, `parry`, `stasis` y `lockOn` son
  rebindables y aparecen en Ajustes pero la Cúpula no las consume; (4) `Tab` queda mapeada a
  `radar` por orden de resolución, aunque `lockOn` la declare como alias.
