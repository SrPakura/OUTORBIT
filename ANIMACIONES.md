# Animaciones de Nyx

Estado del pipeline de animación de Nyx: de dónde sale cada clip, cómo se
regenera y qué queda pendiente. Complementa la sección de build del
[README](README.md).

---

## 1. Estado de los clips

Todos viven en `public/models/` y son **armature solo** (sin malla): el cuerpo
lo pone `nyx_rigged.glb` y los clips se enlazan por nombre de hueso.

| Clip | Fichero | Duración | Origen | Estado |
|------|---------|----------|--------|--------|
| Caminar — arranque | `nyx_walk_start.glb` | 1.73 s | BlendCap | Aprobado |
| Caminar — bucle | `nyx_walk_loop.glb` | 2.40 s | BlendCap | Aprobado |
| Caminar — frenada | `nyx_walk_end.glb` | 1.77 s | BlendCap | Aprobado |
| Correr — bucle | `nyx_run_loop.glb` | 1.40 s | Caminar + 1.7x | Aprobado |
| Flotación 0G | `nyx_zero_g_float.glb` | 2.63 s | BlendCap | Aprobado |
| Flotación avanzando | `nyx_float_fwd.glb` | 2.57 s | BlendCap | Aprobado |

Los clips de caminar se generan con `scripts/nyx_walk_clips.py` a partir de los
GLB de `animaciones_generadas/procesadas/`: corrige la altura de la cadera para
que la suela toque el suelo y renombra los clips.

`animaciones_generadas/` está **gitignorado** a propósito: son los brutos de
Blender, los BVH de BlendCap y los vídeos de preview, no forman parte del
build.

---

## 2. El rig

`nyx_armature` tiene **27 huesos** y tres particularidades que hay que tener
presentes antes de tocar nada:

- **Todos apuntan a +Z.** La longitud del hueso no significa nada; lo único
  anatómico es la **posición de la cabeza** de cada hueso. Para sacar la
  dirección de un miembro hay que ir de `head` del padre a `head` del hijo,
  nunca al `tail`.
- **El rig está desconectado.** Mover un hueso no arrastra a sus hijos por
  cinemática; cada uno lleva su propia rotación.
- **Nyx mira a -Y** en el mundo de Blender. X es siempre el eje lateral y YZ el
  plano sagital. Un giro **positivo** alrededor de X echa el torso hacia
  adelante.

Posiciones de cabeza (metros, mundo de Blender):

```
hips (0, 0, 0.880)      spine (0, 0, 1.100)     chest (0, 0, 1.320)
neck (0, 0, 1.440)      head  (0, 0, 1.520)

clavicle_L (0.050, 0.020, 1.400)   upperArm_L (0.160, 0.055, 1.400)
forearm_L  (0.320, 0.055, 1.400)   hand_L     (0.600, 0.055, 1.400)
sleeve_L   (0.440, 0.055, 1.400)

thigh_L (0.090, 0, 0.840)   shin_L (0.090, 0, 0.440)
foot_L  (0.090, 0, 0.080)   toe_L  (0.090, -0.060, 0.060)

hair_1..4  y ≈ +0.17 .. +0.20
```

`clavicle_L/R` **no se retargetizan**: su offset es diagonal por diseño y en
los vídeos baila con el hombro, lo que arrastraba todo el brazo. Se quedan en
rest.

---

## 3. Pipeline de mocap: BlendCap → BVH → GLB

BlendCap (extensión de Blender, markerless video→BVH) vive en
`~/.config/blender/5.3/extensions/user_default/blendcap`, con venv CUDA.

```
vídeo  →  BlendCap  →  .bvh  →  blender_blendcap_retarget_nyx.py  →  .glb
```

El BVH importa con el mapeo `(x, y, z) → (x, -z, y)`; el personaje del BVH mira
a +Z y en Blender acaba mirando a -Y, así que las direcciones se pueden usar
tal cual.

### `scripts/blender_blendcap_retarget_nyx.py`

```bash
blender -b animaciones_generadas/nyx_animaciones.blend \
  --python scripts/blender_blendcap_retarget_nyx.py -- \
  --bvh animaciones_generadas/blendcap/run_lean.bvh \
  --name nyx_run_loop --out animaciones_generadas/blendcap/glb \
  --ground --loop --loop-min 30 --loop-window 16:78 \
  --video animaciones_generadas/previews/nyx_run_loop_3q.mp4 --video-view 3q
```

| Flag | Para qué |
|------|----------|
| `--ground` | Apoya la suela en Z=0 midiendo la malla en todo el clip. |
| `--loop` | Exporta solo el sub-segmento que cierra en bucle. |
| `--loop-window A:B` | Limita la búsqueda del bucle a un tramo limpio del BVH. |
| `--verify 40,50` | Compara la dirección pedida por el BVH con la que acaba teniendo la malla. |
| `--analyze` | Estima periodo, zancada y velocidad de suelo. |
| `--stills` / `--video` | PNGs de control y MP4 de preview. |

Dos correcciones que se aplican siempre:

- **`clamp_arm_splay()`** — tope de 14° (brazo) y 12° (antebrazo) de apertura
  lateral respecto al plano sagital. BlendCap lee los brazos desde una cámara
  frontal y convierte el vaivén de carrera en apertura lateral; sin el tope el
  clip sale "daleado". Baja el vaivén lateral de las manos un 57%.
- **Motion secundario** — pelo (`hair_1..4`) y mangas (`sleeve_L/R`) no vienen
  en el BVH: se generan con un arrastre constante más un rebote por aceleración
  vertical de la cabeza.

---

## 4. La carrera no sale de BlendCap

El BVH de `run_lean` **no sirve**. Medido sobre el propio BVH, en el tramo
limpio:

- el muslo izquierdo oscila solo **-8.5° .. +5.9°** (un caminar mueve ±25°);
- el brazo izquierdo se queda abierto **45°** respecto al plano sagital y el
  antebrazo llega a 66°;
- el clip entero se dobla de lado a partir del frame ~100.

Es decir: el vídeo de origen no contiene una carrera, contiene un balanceo. El
retarget es fiel (error de dirección 0.0° verificado con `--verify`), el
problema es la fuente.

Por eso la carrera se construye desde el ciclo de caminar ya aprobado con
`scripts/blender_build_run_from_walk.py`, que aplica las tres diferencias entre
caminar y correr:

| Constante | Valor | Qué hace |
|-----------|-------|----------|
| `RUN_SPEEDUP` | 1.70 | Cadencia: 2.40 s → 1.40 s por ciclo. |
| `LEAN_SPINE_DEG` + `LEAN_CHEST_DEG` | 3.0 + 2.5 | Inclinación adelante del torso (queda en 7-10°). |
| `ARM_SWING_DEG` | 42.0 | Balanceo del brazo, sintetizado desde la fase del muslo. |
| `ELBOW_BASE_DEG` / `ELBOW_SWING_DEG` | 72 / 16 | Codo plegado, más cerrado al frente del braceo. |
| `BOUNCE_EXTRA` | 0.022 m | Rebote vertical extra de la cadera. |

El braceo **se sintetiza**, no se amplifica: el clip de caminar mueve el brazo
apenas ±2°, así que multiplicarlo no daba nada. La fase sale del ángulo sagital
del muslo izquierdo, que en el caminar sí es una sinusoide limpia; el brazo
derecho va adelante cuando la pierna izquierda va adelante.

```bash
blender -b animaciones_generadas/nyx_animaciones.blend \
  --python scripts/blender_build_run_from_walk.py -- \
  --walk public/models/nyx_walk_loop.glb \
  --name nyx_run_loop --out animaciones_generadas/blendcap/glb \
  --video animaciones_generadas/previews/nyx_run_loop_3q.mp4 --video-view 3q
```

### Retocar la carrera a mano

El `.blend` de trabajo ya trae la acción `rw_walk_loop` asignada a
`nyx_armature`, con el rango 0..42 a 30 fps:

```bash
blender animaciones_generadas/nyx_animaciones.blend
```

Tras mover los huesos y guardar, se reexporta con:

```bash
blender -b animaciones_generadas/nyx_animaciones.blend \
  --python scripts/blender_export_run_from_blend.py -- \
  --out public/models/nyx_run_loop.glb
```

Ojo con dos cosas al exportar: hay que **seleccionar solo el armature** (si se
cuelan las mallas el GLB pasa de 40 KB a 370 KB) y hay que **borrar la acción
importada del caminar** antes, o el GLB sale con dos animaciones y el juego
carga la primera que encuentra.

---

## 5. Integración en el juego

| Pieza | Fichero | Notas |
|-------|---------|-------|
| Carga de clips | `src/game/render/nyxModelLoader.ts` | `loadClip()` se queda con `gltf.animations[0]`. |
| Reproductor de bucle | `src/game/render/nyxLoopPlayer.ts` | `rate = clamp(speed / groundSpeed * cadenceScale, minRate, maxRate)`. |
| Marcha (3 clips) | `src/game/render/nyxWalkPlayer.ts` | `CADENCE_SCALE = 0.75`. |
| Animator procedural | `src/game/render/nyxAnimator.ts` | Fallback si falta un GLB; se empaqueta aparte con esbuild. |
| Controlador de la Cúpula | `src/game/dome/NyxDomeController.ts` | `WALK_SPEED = 2.0`, `WALK_ANIM_MAX_SPEED = 5.6`. |

Ajustes actuales del reproductor de carrera:

```ts
{ groundSpeed: 1.6, cadenceScale: 0.28, minRate: 0.9, maxRate: 1.25, blend: 0.16 }
```

El deslizamiento de pies está asumido: a 7.4 m/s el ritmo exacto pediría un
ciclo de 0.30 s, que no se lee.

### El bug de la pose de reposo

`playOneShot()` guardaba `animLock = state` y solo lo soltaba con
`animator.isFinished()`, que **nunca** es cierto en los estados sostenidos
(`stasis_cast`, `eden_absorb`, `DURATION = INF`). Al coger la carta "Campo
Gravitacional" el personaje se quedaba congelado en la pose del casteo: piernas
abiertas, torso girado. Ahora el lock lleva su propio temporizador
(`SUSTAINED_ONESHOT_HOLD`) y se suelta solo.

---

## 6. Lo que queda

- **`nyxAnimator.ts` tiene código muerto.** Los métodos privados `poseIdle`,
  `poseRun`, `poseJumpLand` y `poseLandRecover` (líneas ~599, 619, 656, 861)
  duplican las funciones importadas de `nyxAnimsGrounded.ts` que sí se usan en
  el `switch` de la línea ~570. Nadie los llama; el riesgo es editar el que no
  toca.
- **La carrera se inclina un poco de más.** Bajada de 13° a 5.5° de inclinación
  añadida (queda en 7-10° medidos), pero sigue sin ser la referencia. Pendiente
  de retoque a mano en el `.blend`.
- **No hay clips de salto ni de aterrizaje** con mocap: siguen siendo
  procedurales en `nyxAnimsGrounded.ts`.
- **Los clips de BlendCap que sí funcionan** (caminar, flotaciones) dependen de
  que el vídeo de origen tenga el cuerpo entero visible y sin oclusiones. El de
  correr falló por eso; conviene revisar el vídeo antes de grabar el BVH.
