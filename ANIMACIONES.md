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
| Correr — arranque | `nyx_run_start.glb` | 1.00 s | Procedural | Aprobado |
| Correr — bucle | `nyx_run_loop.glb` | 0.67 s | Procedural | Aprobado |
| Correr — frenada | `nyx_run_end.glb` | 1.07 s | Procedural | Aprobado |
| Flotación 0G | `nyx_zero_g_float.glb` | 2.63 s | BlendCap | Aprobado |
| Flotación — banco derecha | `nyx_float_fwd.glb` | 2.57 s | Derivado | Aprobado |
| Flotación — banco izquierda | `nyx_float_fwd_mir.glb` | 2.57 s | Derivado | Aprobado |
| Flotación — centrada | `nyx_float_fwd_mid.glb` | 2.57 s | Derivado | Aprobado |
| Flotación — atrás | `nyx_float_back.glb` | 2.57 s | Derivado | Aprobado |

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

## 4. La carrera se construye a mano

La carrera **no** sale de mocap. Se probaron las dos vías y ninguna sirve:

- **BlendCap** (`run_lean.bvh`): el vídeo de origen no contiene una carrera,
  contiene un balanceo. Medido sobre el propio BVH, en el tramo limpio, el muslo
  izquierdo oscila solo **-8.5° .. +5.9°** (un caminar mueve ±25°), el brazo se
  queda abierto **45°** respecto al plano sagital y el clip entero se dobla de
  lado a partir del frame ~100. El retarget es fiel (error de dirección 0.0°
  verificado con `--verify`); el problema es la fuente.
- **Kimodo** (16 muestras, `soma30`, seed 7): las piernas y el torso salen
  bien, pero **los brazos no**. El clavículo gira 240° (−120° .. +125°) y la
  mano sube hasta la altura del hombro: en las 16 muestras el braceo queda en
  guardia de boxeo. Además el clip flota 11 cm (SOMA tiene la cadera a 0.989 m
  y NYX a 0.88 m, y el copy de world Z arrastra el desfase) y el periodo del
  ciclo es irregular (18/18/21/18 frames), así que no cierra en bucle.

Por eso la carrera se genera con `scripts/blender_build_run_clips.py`, que
construye el ciclo entero de forma procedural y lo divide en arranque, bucle y
frenada.

### Cómo funciona el script

Las poses se escriben como **ángulos sagitales absolutos en espacio de mundo**
por hueso y se convierten a cuaterniones locales con
`(world_padre @ rest_padre⁻¹ @ rest_hueso)⁻¹ @ world_hueso`. Eso deja las curvas
legibles y editables sin pelearse con los espacios locales.

| Constante | Valor | Qué hace |
|-----------|-------|----------|
| `LOOP_FRAMES` | 20 | Un ciclo (dos pasos) en 0.667 s = 3 pasos/s. |
| `STANCE_END` | 0.35 | Apoyo izquierdo 0..0.35, vuelo 0.35..0.50, apoyo derecho 0.50..0.85, vuelo 0.85..1.00. |
| `FLIGHT_LIFT` | 0.05 m | Arco de vuelo sobre la altura de apoyo. |
| `ARM_SWING` | 32° | Balanceo del brazo. |
| `ELBOW_BASE` / `ELBOW_SWING` | 45 / 35 | Codo: 45° con el brazo atrás, 80° al frente. |
| `LEAN_SPINE` + `LEAN_CHEST` + `LEAN_HIPS` | 6 + 5 + 3 | Inclinación adelante del torso (~14°). |

Tres detalles que costaron encontrar:

- **El codo va desfasado respecto al brazo.** Con el codo más cerrado cuando el
  brazo va atrás, la mano nunca rebasa la cadera y el braceo se lee como si
  llevara una bandeja. La flexión tiene que abrirse con el brazo atrás y
  cerrarse al frente.
- **El apoyo se mide sobre el pie de apoyo, no sobre la malla entera.** Medir
  todo el cuerpo ancla la cadera al pie que va por el aire y sale un rebote
  nervioso. Por frame se mide el vértice más bajo del pie de apoyo (grupos
  `foot_L/toe_L` o `foot_R/toe_R`) con la cadera a 0 y se pone la cadera en
  `-ese_valor`; los frames de vuelo interpolan entre las dos alturas de apoyo
  más un bulto de coseno de 5 cm.
- **Blender 5.3 usa acciones con slots.** `keyframe_insert` descarta en
  silencio la localización de la cadera en el frame 0. Hay que escribir las
  fcurves a mano con
  `act.layers[0].strips[0].channelbag(slot, ensure=True).fcurves.new(...)`.

```bash
blender -b animaciones_generadas/nyx_animaciones.blend \
  --python scripts/blender_build_run_clips.py -- --out public/models
```

El script deja `nyx_run_start` (31 frames), `nyx_run_loop` (21, con el frame 20
idéntico al 0) y `nyx_run_end` (33) en el `.blend`, y exporta los tres GLB.

### Verificación

Las cuatro fronteras cierran con error **0.000°** en los 27 huesos:

| Empalme | Error |
|---------|-------|
| `loop` f0 vs f20 | 0.000° |
| `start` f30 vs `loop` f0 | 0.000° |
| `end` f0 vs `loop` f0 | 0.000° |
| `start` f0 vs `end` f32 | 0.000° |

Y el pie de apoyo queda clavado en **0.000 m** durante todo el apoyo, con los
dos pies a 0.102 m en el vuelo.

### Regenerar desde Blender

```bash
blender animaciones_generadas/nyx_animaciones.blend
```

Con el `.blend` abierto, en el Text Editor o por el MCP:

```python
import importlib.util
spec = importlib.util.spec_from_file_location(
    "runclips", "scripts/blender_build_run_clips.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
mod.build_all()
```

Ojo: `build_all()` crea acciones nuevas, así que si ya existen las renombra a
`.001`. Hay que borrar las viejas y renombrar las nuevas, o el juego seguirá
cargando las de antes.

---

## 5. La flotación 0G se deriva del clip aprobado

El clip de flotación que venía de BlendCap tenía dos problemas medidos:

- **El torso estaba casi quieto.** La cadera recorría 4.2° en sagital y el pecho
  2.4°; todo el movimiento estaba en los brazos (76° de excursión) y los pies.
  De ahí la sensación de estatismo.
- **No cerraba en bucle.** El último frame quedaba a 13.8° del primero y la
  cadera derivaba 2.5 cm, así que el `LoopRepeat` del juego pegaba un salto cada
  2.6 s.

En vez de rehacerlo desde cero se conserva la pose aprobada y se derivan cuatro
clips con `scripts/blender_build_float_clips.py`:

| Clip | Qué es |
|------|--------|
| `nyx_float_fwd` | Base + overlay dinámico. Banco a su derecha. |
| `nyx_float_fwd_mir` | Espejo exacto de `fwd`. Banco a su izquierda. |
| `nyx_float_fwd_mid` | `fwd` desbanqueado. El centro, para cambiar entre las dos. |
| `nyx_float_back` | `mid` inclinado 14° atrás. |

### Tres decisiones que no son obvias

**El bucle se cierra quitando la deriva, no recortando.** Se reparte entre todos
los frames la corrección que lleva el último al primero
(`IDENTITY.slerp(drift, t) @ q[f]`). El gesto se conserva y el clip pasa a ser
repetible. El overlay usa fases periódicas (`f % (n-1) / (n-1)`) para que su
último frame coincida con el primero.

**`mid` no es el promedio de `fwd` y `mir`.** Las piernas y los brazos van en
contrafase, así que sus poses están a ~115° y el punto medio sale deformado
(laterales de 60° en la espinilla). En su lugar se rota el cuerpo entero
alrededor de Y por el banco medio de la cadera (−13.26°): queda centrado pero
conserva la tijera y la ondulación.

**El espejo es `(w, x, -y, -z)` con intercambio L↔R.** Es exacto porque el plano
sagital de Nyx es x=0 y los huesos L/R tienen direcciones de reposo espejadas.
Verificado: 0.06° de desviación máxima entre `mir` y el espejo de `fwd`.

### Verificación

| Medida | Base | `fwd` |
|--------|------|-------|
| Cadera sagital / lateral | 4.2° / 4.8° | 6.9° / 9.5° |
| Pecho sagital / lateral | 2.4° / 4.3° | 6.4° / 9.0° |
| Pelo `hair_4` sagital / lateral | 5.1° / 4.6° | 18.5° / 10.8° |
| Bob de cadera | 7 cm | 8.5 cm |
| Cierre de bucle | 13.8° | 0.04° |

Banco medio de cadera por clip: `fwd` −13.2°, `mir` +13.2°, `mid` +0.03°,
`back` +0.02° con −11.0° de inclinación sagital.

### Regenerar desde Blender

```python
import importlib.util
spec = importlib.util.spec_from_file_location(
    "floatclips", "scripts/blender_build_float_clips.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
mod.main()               # crea las cuatro acciones y exporta los GLB
```

`main()` borra las acciones anteriores antes de crearlas, así que no hace falta
renombrar nada a mano. El script importa `nyx_float_fwd.glb` como base y limpia
el armature temporal que trae la importación.

---

## 6. Integración en el juego

| Pieza | Fichero | Notas |
|-------|---------|-------|
| Carga de clips | `src/game/render/nyxModelLoader.ts` | `loadClip()` se queda con `gltf.animations[0]`. |
| Reproductor de bucle | `src/game/render/nyxLoopPlayer.ts` | `rate = clamp(speed / groundSpeed * cadenceScale, minRate, maxRate)`. |
| Marcha (3 clips) | `src/game/render/nyxWalkPlayer.ts` | `CADENCE_SCALE = 0.75`. |
| Carrera (3 clips) | `src/game/render/nyxRunPlayer.ts` | `CLIP_GROUND_SPEED = 7.4`, `CADENCE_SCALE = 1.0`. |
| Flotación direccional (4 clips) | `src/game/render/nyxFloatPlayer.ts` | Un mixer, cuatro acciones, pesos por dirección de la velocidad. |
| Animator procedural | `src/game/render/nyxAnimator.ts` | Fallback si falta un GLB; se empaqueta aparte con esbuild. |
| Controlador de la Cúpula | `src/game/dome/NyxDomeController.ts` | `WALK_SPEED = 2.0`, `RUN_SPEED = 7.4`, `WALK_ANIM_MAX_SPEED = 5.6`. |

Ajustes actuales del reproductor de carrera:

```ts
{ groundSpeed: 7.4, cadenceScale: 1.0, minRate: 0.7, maxRate: 1.3, blend: 0.14 }
```

El bucle dura 0.667 s y cubre dos pasos, así que a 7.4 m/s la zancada es de
2.47 m por paso. Con `groundSpeed = 7.4` y `cadenceScale = 1.0` el ritmo sale
exactamente `speed / 7.4` y **no hay deslizamiento de pies**. La marcha sí lo
tiene asumido (`CADENCE_SCALE = 0.75`), pero en la carrera no hacía falta: el
ciclo nuevo ya está a la cadencia correcta.

La flotación no escala cadencia: los cuatro clips van a ritmo fijo y lo que
cambia es el reparto de pesos. En vuelo el cuerpo mira siempre al aim de cámara
(`updateOrientation`), así que el banco no puede seguir al vector de velocidad
completo. `NyxFloatPlayer.setDirection(forward, lateral)` reparte según la
velocidad en el marco del cuerpo:

| Dirección | Clip |
|-----------|------|
| Avance recto | `mid` |
| Hacia su derecha | `fwd` |
| Hacia su izquierda | `mir` |
| Retroceso | `back` |

Los pesos persiguen su objetivo con `WEIGHT_RATE = 5` (≈0.2 s), así que un
cambio de dirección se lee como un viraje y no como un corte.

### El bug de la pose de reposo

`playOneShot()` guardaba `animLock = state` y solo lo soltaba con
`animator.isFinished()`, que **nunca** es cierto en los estados sostenidos
(`stasis_cast`, `eden_absorb`, `DURATION = INF`). Al coger la carta "Campo
Gravitacional" el personaje se quedaba congelado en la pose del casteo: piernas
abiertas, torso girado. Ahora el lock lleva su propio temporizador
(`SUSTAINED_ONESHOT_HOLD`) y se suelta solo.

---

## 7. Lo que queda

- **`nyxAnimator.ts` tiene código muerto.** Los métodos privados `poseIdle`,
  `poseRun`, `poseJumpLand` y `poseLandRecover` (líneas ~599, 619, 656, 861)
  duplican las funciones importadas de `nyxAnimsGrounded.ts` que sí se usan en
  el `switch` de la línea ~570. Nadie los llama; el riesgo es editar el que no
  toca.
- **La carrera se inclina un poco de más.** Bajada de 13° a 5.5° de inclinación
  añadida (queda en 7-10° medidos), pero sigue sin ser la referencia. Pendiente
  de retoque a mano en el `.blend`.
- **El braceo de la carrera es procedural, no mocap.** Kimodo genera piernas y
  torso buenos pero los brazos en guardia de boxeo (clavículo girando 240°). Si
  en el futuro se quiere braceo de mocap, hay que resolver eso primero: o un
  prompt que no dispare el gesto, o filtrar el clavículo en el retarget.
- **No hay clips de salto ni de aterrizaje** con mocap: siguen siendo
  procedurales en `nyxAnimsGrounded.ts`.
- **Los clips de BlendCap que sí funcionan** (caminar) dependen de que el vídeo
  de origen tenga el cuerpo entero visible y sin oclusiones. El de correr falló
  por eso; conviene revisar el vídeo antes de grabar el BVH.
- **La flotación ya no viene de BlendCap.** El clip original se conserva como
  base, pero las cuatro variantes se derivan de él en Blender. Si algún día se
  quiere una flotación nueva de verdad, hay que sustituir el base y volver a
  lanzar `scripts/blender_build_float_clips.py`: las cuatro salen solas.
