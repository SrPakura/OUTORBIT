"""
OUTORBIT — Retargeting BlendCap (BVH) -> Rig de 27 huesos de NYX.

BlendCap exporta un BVH con esqueleto estilo Mixamo (54 joints: Hips, Spine..
Spine3, Neck, Head, LeftUpLeg.., dedos). Este script lo importa, lo hornea
sobre `nyx_armature` y deja el clip listo para el juego.

El retargeting no copia rotaciones. NYX tiene los 27 huesos orientados a +Z
aunque el miembro vaya hacia abajo o hacia el lado (el `thigh_L` va de Z=0.84 a
Z=1.24 mientras la espinilla arranca en Z=0.44), asi que su rest no codifica la
direccion del miembro: copiar rotaciones WORLD o locales lo deja en T-pose o lo
invierte. Y el `matrix_local` de un BVH importado lleva un roll arbitrario, asi
que el delta world respecto al rest tampoco sirve (sale girado 90 grados).

Lo que si funciona: construir el frame de cada hueso con DOS direcciones
anatomicas, la del miembro y la del hijo,

    F = [d1, d2 x d1, d1 x d2]

y rotar el frame de rest de NYX hasta el del origen:

    M         = F_origen * F_rest^T
    W_destino = M * R_destino

Eso fija punteria y twist a la vez. El twist importa: con un simple swing
minimo el giro del torso en carrera rotaba toda la cadena del brazo 15-17
grados. Los huesos sin dos direcciones fiables (cuello, manos, pies, dedos)
caen a swing minimo, donde el twist no se nota.

La direccion de cada miembro se toma de un hijo anatomico explicito (ver
BONE_MAP): `bone.children[0]` no sirve, porque en `hips` puede ser una pierna y
en `chest` una clavicula, y el torso sale arqueado.

Uso:
  blender -b animaciones_generadas/nyx_animaciones.blend \
      --python scripts/blender_blendcap_retarget_nyx.py -- \
      --bvh animaciones_generadas/blendcap/run_lean.bvh \
      --name run_lean \
      --out animaciones_generadas/blendcap/glb \
      --ground
"""

import argparse
import math
import os
import sys

import bpy
from mathutils import Matrix, Quaternion, Vector

FPS = 30
NYX = "nyx_armature"
MESHES = ("nyx_body", "nyx_hair", "nyx_face", "nyx_eyes")

# (origen, hijo origen, nieto origen, NYX, hijo NYX, nieto NYX).
# El hijo da la direccion del miembro; el nieto, el plano del twist. None en el
# nieto = swing minimo.
#
# `Hips` apunta a `Spine1`, no a `Spine`: el OFFSET Hips->Spine del BVH mide
# 3.5 cm y su direccion es ruido, asi que el torso salia arqueado. Dos joints
# arriba (13 cm) si es un eje de pelvis estable.
#
# Las claviculas no se retargetizan: su OFFSET es diagonal por diseno y en el
# video baila con el hombro, lo que arrastraba todo el brazo. Se quedan en rest.
BONE_MAP = [
    ("Hips",         "Spine1",        "Spine2",   "hips",       "spine",      "chest"),
    ("Spine",        "Spine1",        "Spine2",   "spine",      "chest",      "neck"),
    ("Spine2",       "Spine3",        "Neck",     "chest",      "neck",       "head"),
    ("Neck",         "Head",          None,       "neck",       "head",       None),
    ("Head",         None,            None,       "head",       None,         None),
    ("LeftArm",      "LeftForeArm",   "LeftHand", "upperArm_L", "forearm_L",  "hand_L"),
    ("LeftForeArm",  "LeftHand",      None,       "forearm_L",  "hand_L",     None),
    ("LeftHand",     "LeftHandMiddle1", None,     "hand_L",     None,         None),
    ("LeftUpLeg",    "LeftLeg",       "LeftFoot", "thigh_L",    "shin_L",     "foot_L"),
    ("LeftLeg",      "LeftFoot",      "LeftToe",  "shin_L",     "foot_L",     "toe_L"),
    ("LeftFoot",     "LeftToe",       None,       "foot_L",     "toe_L",      None),
    ("LeftToe",      None,            None,       "toe_L",      None,         None),
    ("RightArm",     "RightForeArm",  "RightHand", "upperArm_R", "forearm_R", "hand_R"),
    ("RightForeArm", "RightHand",     None,       "forearm_R",  "hand_R",     None),
    ("RightHand",    "RightHandMiddle1", None,    "hand_R",     None,         None),
    ("RightUpLeg",   "RightLeg",      "RightFoot", "thigh_R",   "shin_R",     "foot_R"),
    ("RightLeg",     "RightFoot",     "RightToe", "shin_R",     "foot_R",     "toe_R"),
    ("RightFoot",    "RightToe",      None,       "foot_R",     "toe_R",      None),
    ("RightToe",     None,            None,       "toe_R",      None,         None),
]

# Motion secundario: el pelo y las mangas no vienen en el BVH, se generan a
# partir de la aceleracion de la cabeza.
HAIR_TRAIL_DEG = 14.0
HAIR_BOUNCE_DEG = 5.0
SLEEVE_TRAIL_DEG = 9.0
SLEEVE_BOUNCE_DEG = 4.0


def log(msg):
    print(f"[BlendCapRetarget] {msg}")


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--bvh", required=True)
    p.add_argument("--name", required=True, help="nombre del clip de salida")
    p.add_argument("--out", required=True, help="carpeta de GLBs")
    p.add_argument("--ground", action="store_true",
                   help="apoya la suela en Z=0 (clips de suelo)")
    p.add_argument("--no-secondary", action="store_true")
    p.add_argument("--no-export", action="store_true")
    p.add_argument("--stills", default="",
                   help="frames separados por comas para renderizar PNG de control")
    p.add_argument("--stills-dir", default="")
    p.add_argument("--verify", default="",
                   help="frames separados por comas donde comparar direcciones origen/destino")
    p.add_argument("--analyze", action="store_true",
                   help="estima periodo de bucle, zancada y velocidad de suelo del clip")
    p.add_argument("--loop", action="store_true",
                   help="exporta solo el mejor sub-segmento que cierra en bucle")
    p.add_argument("--loop-min", type=int, default=40,
                   help="duracion minima del bucle en frames (def. 40)")
    p.add_argument("--loop-window", default="",
                   help="rango 'A:B' de frames del BVH donde buscar el bucle. "
                        "Necesario cuando el video mezcla el ciclo con otra "
                        "accion (p. ej. `run_lean` acaba inclinandose de lado) "
                        "y el mejor cierre cae fuera del tramo limpio.")
    p.add_argument("--video", default="",
                   help="ruta MP4 donde renderizar el clip completo")
    p.add_argument("--video-view", default="3q", choices=("3q", "side", "front"))
    return p.parse_args(argv)


# --------------------------------------------------------------------------
# escena
# --------------------------------------------------------------------------

def clean_scene():
    """Quita armatures y acciones de capturas anteriores, deja NYX intacto."""
    for ob in list(bpy.data.objects):
        if ob.type == "ARMATURE" and ob.name != NYX:
            bpy.data.objects.remove(ob, do_unlink=True)
    for ac in list(bpy.data.actions):
        bpy.data.actions.remove(ac)
    sc = bpy.context.scene
    sc.render.fps = FPS
    sc.render.fps_base = 1.0


def import_bvh(path):
    before = set(bpy.data.objects)
    bpy.ops.import_anim.bvh(
        filepath=path,
        global_scale=1.0,
        use_fps_scale=True,   # 24 fps del BVH -> 30 fps de la escena
        update_scene_fps=False,
    )
    new = [o for o in bpy.data.objects if o not in before]
    arms = [o for o in new if o.type == "ARMATURE"]
    if not arms:
        raise RuntimeError("el BVH no trae armature")
    src = arms[0]
    act = src.animation_data.action if src.animation_data else None
    log(f"importado {os.path.basename(path)}: {src.name} "
        f"{len(src.data.bones)} huesos, frames {tuple(act.frame_range) if act else None}")
    return src


def reset_pose(arm):
    for pb in arm.pose.bones:
        pb.location = (0.0, 0.0, 0.0)
        pb.rotation_quaternion = (1.0, 0.0, 0.0, 0.0)
        pb.scale = (1.0, 1.0, 1.0)
    bpy.context.view_layer.update()


def mesh_min_z():
    dg = bpy.context.evaluated_depsgraph_get()
    lo = 1e9
    for name in MESHES:
        ob = bpy.data.objects.get(name)
        if ob is None:
            continue
        ev = ob.evaluated_get(dg)
        me = ev.to_mesh()
        mw = ev.matrix_world
        for v in me.vertices:
            z = (mw @ v.co).z
            if z < lo:
                lo = z
        ev.to_mesh_clear()
    return lo


def bone_dir(arm, name, child, posed):
    """Direccion del miembro en world: head -> head del hijo (o tail si hoja)."""
    if posed:
        pb = arm.pose.bones[name]
        a = arm.matrix_world @ pb.head
        if child is not None:
            b = arm.matrix_world @ arm.pose.bones[child].head
        else:
            b = arm.matrix_world @ pb.tail
    else:
        bone = arm.data.bones[name]
        a = arm.matrix_world @ bone.head_local
        if child is not None:
            b = arm.matrix_world @ arm.data.bones[child].head_local
        else:
            b = arm.matrix_world @ bone.tail_local
    v = b - a
    if v.length < 1e-6:
        return Vector((0.0, 0.0, 1.0))
    return v.normalized()


def nyx_rest_dir(dst, name, child):
    """Direccion del miembro en la rest de NYX.

    En las hojas (`hand_L/R`, `toe_L/R`, `head`) el `tail` no sirve: NYX los
    tiene todos apuntando a +Z, asi que `hand_L` saldria hacia arriba en vez de
    continuar el brazo. Se usa la direccion del padre, que si es anatomica.
    """
    bone = dst.data.bones[name]
    a = dst.matrix_world @ bone.head_local
    if child is not None:
        b = dst.matrix_world @ dst.data.bones[child].head_local
    elif bone.parent is not None:
        b = a
        a = dst.matrix_world @ bone.parent.head_local
    else:
        b = dst.matrix_world @ bone.tail_local
    v = b - a
    if v.length < 1e-6:
        return Vector((0.0, 0.0, 1.0))
    return v.normalized()


def frame_from(d1, d2):
    """Base ortonormal con d1 como eje X y d2 fijando el plano del twist."""
    x = d1.normalized()
    z = x.cross(d2)
    if z.length < 1e-4:
        return None
    z.normalize()
    y = z.cross(x)
    return Matrix((x, y, z)).transposed()


# --------------------------------------------------------------------------
# retargeting
# --------------------------------------------------------------------------

def retarget(src, dst):
    src_bones = {b.name for b in src.data.bones}
    pairs = [row for row in BONE_MAP
             if row[0] in src_bones and row[3] in dst.pose.bones]
    missing = [row[0] for row in BONE_MAP if row[0] not in src_bones]
    if missing:
        log(f"AVISO: el BVH no trae {missing}")

    dst_rest = {b.name: (dst.matrix_world @ b.matrix_local).to_quaternion()
                for b in dst.data.bones}
    dst_dir_rest = {r[3]: nyx_rest_dir(dst, r[3], r[4]) for r in pairs}
    dst_twist_rest = {r[3]: (nyx_rest_dir(dst, r[4], r[5]) if r[5] else None)
                      for r in pairs}
    dst_frame_rest = {}
    for r in pairs:
        d2 = dst_twist_rest[r[3]]
        dst_frame_rest[r[3]] = frame_from(dst_dir_rest[r[3]], d2) if d2 else None

    # Orden jerarquico completo: los huesos no mapeados (claviculas, pelo,
    # mangas) no se retargetizan pero SI heredan el giro de su padre, asi que
    # hay que propagarles el world antes de resolver a sus hijos.
    mapped = {r[3]: r for r in pairs}
    order = []

    def walk(bone):
        order.append(bone.name)
        for child in bone.children:
            walk(child)

    walk(dst.data.bones["hips"])

    act_src = src.animation_data.action
    f0, f1 = int(act_src.frame_range[0]), int(act_src.frame_range[1])

    reset_pose(dst)
    if dst.animation_data is None:
        dst.animation_data_create()
    act = bpy.data.actions.new(name=f"bc_{act_src.name}")
    act.use_fake_user = True
    dst.animation_data.action = act

    sc = bpy.context.scene
    hips_rest_mat = dst_rest["hips"].to_matrix()
    hips_rest_z = (dst.matrix_world @ dst.data.bones["hips"].matrix_local).translation.z

    for f in range(f0, f1 + 1):
        sc.frame_set(f)
        dst_world = {}
        for name in order:
            pb = dst.pose.bones[name]
            pn = pb.parent.name if pb.parent is not None else None
            parent_world = dst_world[pn] if pn else None
            row = mapped.get(name)
            if row is not None:
                s, s_child, s_grand, _, _, _ = row
                want = bone_dir(src, s, s_child, posed=True)
                rest_frame = dst_frame_rest[name]
                src_frame = None
                if rest_frame is not None:
                    src_frame = frame_from(
                        want, bone_dir(src, s_child, s_grand, posed=True))
                if src_frame is not None:
                    world = (src_frame @ rest_frame.transposed()
                             @ dst_rest[name].to_matrix()).to_quaternion()
                else:
                    world = dst_dir_rest[name].rotation_difference(want) @ dst_rest[name]
            elif pn is not None:
                # No mapeado: hereda el delta del padre, basis identidad.
                world = parent_world @ dst_rest[pn].inverted() @ dst_rest[name]
            else:
                world = dst_rest[name]
            dst_world[name] = world
            if row is None:
                continue
            if pn is not None:
                local = (parent_world @ dst_rest[pn].inverted()
                         @ dst_rest[name]).inverted() @ world
            else:
                local = dst_rest[name].inverted() @ world
            pb.rotation_quaternion = local
            pb.keyframe_insert("rotation_quaternion", frame=f, group=name)
            if name == "hips":
                # Solo la componente vertical: el avance horizontal lo pone el
                # controlador del juego, no el clip.
                src_z = (src.matrix_world @ src.pose.bones[s].head).z
                pb.location = hips_rest_mat.inverted() @ Vector(
                    (0.0, 0.0, src_z - hips_rest_z))
                pb.keyframe_insert("location", frame=f, group=name)

    for fc in iter_fcurves(act):
        for kp in fc.keyframe_points:
            kp.interpolation = "LINEAR"

    log(f"retarget: {len(pairs)} huesos mapeados, frames {f0}..{f1}")
    return act, f0, f1


# --------------------------------------------------------------------------
# post-proceso
# --------------------------------------------------------------------------

def iter_fcurves(act):
    if hasattr(act, "fcurves"):
        return list(act.fcurves)
    out = []
    for layer in act.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                out.extend(bag.fcurves)
    return out


def snapshot(arm, f0, f1):
    sc = bpy.context.scene
    out = []
    head_z = []
    for f in range(f0, f1 + 1):
        sc.frame_set(f)
        frame = {}
        for pb in arm.pose.bones:
            frame[pb.name] = (
                pb.location.copy(),
                pb.rotation_quaternion.copy(),
                pb.scale.copy(),
            )
        out.append(frame)
        head_z.append((arm.matrix_world @ arm.pose.bones["head"].head).z)
    return out, head_z


def write_action(arm, name, frames, start_frame=0):
    if arm.animation_data is None:
        arm.animation_data_create()
    act = bpy.data.actions.new(name=name)
    act.use_fake_user = True
    arm.animation_data.action = act
    for i, frame in enumerate(frames):
        f = start_frame + i
        for pb in arm.pose.bones:
            loc, quat, scale = frame[pb.name]
            pb.location = loc
            pb.rotation_quaternion = quat
            pb.scale = scale
            pb.keyframe_insert("location", frame=f, group=pb.name)
            pb.keyframe_insert("rotation_quaternion", frame=f, group=pb.name)
            pb.keyframe_insert("scale", frame=f, group=pb.name)
    for fc in iter_fcurves(act):
        for kp in fc.keyframe_points:
            kp.interpolation = "LINEAR"
    return act


def apply_ground_offset(frames, offset):
    if abs(offset) < 1e-6:
        return
    for frame in frames:
        loc, quat, scale = frame["hips"]
        frame["hips"] = (loc + Vector((0.0, 0.0, offset)), quat, scale)


def rot_local_x(quat, angle):
    """Rota `quat` alrededor del eje X local del hueso."""
    return quat @ Quaternion((1.0, 0.0, 0.0), angle)


def apply_secondary(frames, head_z):
    """Pelo y mangas: arrastre constante + rebote por aceleracion vertical."""
    n = len(frames)
    vel = [0.0] * n
    for i in range(1, n):
        vel[i] = head_z[i] - head_z[i - 1]
    acc = [0.0] * n
    for i in range(1, n):
        acc[i] = vel[i] - vel[i - 1]

    for i, frame in enumerate(frames):
        bounce = max(-1.0, min(1.0, acc[i] * 40.0))
        hair = math.radians(HAIR_TRAIL_DEG + HAIR_BOUNCE_DEG * bounce)
        sleeve = math.radians(SLEEVE_TRAIL_DEG + SLEEVE_BOUNCE_DEG * bounce)
        for j in range(1, 5):
            name = f"hair_{j}"
            if name in frame:
                loc, quat, scale = frame[name]
                frame[name] = (loc, rot_local_x(quat, hair / j), scale)
        for side in ("L", "R"):
            name = f"sleeve_{side}"
            if name in frame:
                loc, quat, scale = frame[name]
                frame[name] = (loc, rot_local_x(quat, sleeve), scale)


def nyx_mesh_dir(dst, name, rest_dir):
    """Direccion que toma la malla: (W * R^-1) aplicado a la direccion de rest."""
    pb = dst.pose.bones[name]
    w = (dst.matrix_world @ pb.matrix).to_quaternion()
    r = (dst.matrix_world @ dst.data.bones[name].matrix_local).to_quaternion()
    return ((w @ r.inverted()) @ rest_dir).normalized()


def verify(src, dst, frames):
    """Compara la direccion que pide el BVH con la que acaba teniendo la malla."""
    sc = bpy.context.scene
    rest = {r[3]: nyx_rest_dir(dst, r[3], r[4]) for r in BONE_MAP}
    worst = 0.0
    for f in frames:
        sc.frame_set(f)
        print(f"--- frame {f} ---")
        for s, s_child, _, n, _, _ in BONE_MAP:
            if s not in src.pose.bones or n not in dst.pose.bones:
                continue
            want = bone_dir(src, s, s_child, posed=True)
            got = nyx_mesh_dir(dst, n, rest[n])
            err = math.degrees(want.angle(got))
            worst = max(worst, err)
            flag = "  <<<" if err > 12.0 else ""
            print(f"  {n:12s} want={tuple(round(v, 2) for v in want)} "
                  f"got={tuple(round(v, 2) for v in got)} err={err:5.1f}deg{flag}")
    log(f"error maximo de direccion: {worst:.1f}deg")


def analyze(dst, f0, f1):
    """Periodo de bucle, zancada y velocidad de suelo del clip ya retargeteado.

    El periodo se busca comparando la pose completa (rotaciones locales de los
    19 huesos mapeados) de cada frame con la de `P` frames despues: el minimo
    de la diferencia media es el bucle. La zancada es la separacion horizontal
    maxima entre los dos pies, y la velocidad de suelo sale de suponer dos pasos
    por ciclo.
    """
    sc = bpy.context.scene
    names = [r[3] for r in BONE_MAP if r[3] in dst.pose.bones]
    sig = []
    sep = []
    for f in range(f0, f1 + 1):
        sc.frame_set(f)
        sig.append([dst.pose.bones[n].rotation_quaternion.copy() for n in names])
        fl = dst.matrix_world @ dst.pose.bones["foot_L"].head
        fr = dst.matrix_world @ dst.pose.bones["foot_R"].head
        sep.append(abs(fl.y - fr.y))

    n = len(sig)
    best = None
    for period in range(10, n // 2):
        tot = 0.0
        cnt = 0
        for i in range(0, n - period):
            for a, b in zip(sig[i], sig[i + period]):
                tot += a.rotation_difference(b).angle
                cnt += 1
        if cnt:
            score = tot / cnt
            if best is None or score < best[1]:
                best = (period, score)

    stride = max(sep)
    log(f"analisis: {n} frames, zancada {stride:.3f} m")
    if best is None:
        log("analisis: no hay periodo candidato")
        return
    period, score = best
    speed = 2.0 * stride / (period / FPS)
    log(f"analisis: bucle {period} frames ({period / FPS:.2f}s), "
        f"error medio {math.degrees(score):.2f}deg, "
        f"velocidad de suelo ~{speed:.2f} m/s")
    # Segundo candidato, por si el minimo cae en un multiplo del ciclo real.
    alts = []
    for period in range(10, n // 2):
        if abs(period - best[0]) < 4:
            continue
        tot = 0.0
        cnt = 0
        for i in range(0, n - period):
            for a, b in zip(sig[i], sig[i + period]):
                tot += a.rotation_difference(b).angle
                cnt += 1
        if cnt:
            alts.append((tot / cnt, period))
    alts.sort()
    for score2, period2 in alts[:3]:
        log(f"  alternativa: {period2} frames ({period2 / FPS:.2f}s), "
            f"error medio {math.degrees(score2):.2f}deg")


def find_loop(frames, min_len):
    """Mejor sub-segmento que cierra: (error, i, j) con pose(i) ~ pose(j).

    Los clips de flotacion no son ciclicos, asi que no basta con buscar un
    periodo: hay que encontrar el tramo cuyos extremos coinciden. Se compara la
    firma de rotaciones locales de los 19 huesos mapeados.
    """
    names = [r[3] for r in BONE_MAP]
    sig = []
    for frame in frames:
        row = []
        for n in names:
            q = frame[n][1]
            row.extend((q.w, q.x, q.y, q.z))
        sig.append(row)

    m = len(sig)
    best = None
    for i in range(m - min_len):
        for j in range(i + min_len, m):
            d = 0.0
            for a, b in zip(sig[i], sig[j]):
                d += (a - b) * (a - b)
            if best is None or d < best[0]:
                best = (d, i, j)
    return best


def export_glb(arm, action, path):
    arm.animation_data.action = action
    bpy.context.view_layer.objects.active = arm
    for ob in bpy.data.objects:
        ob.select_set(ob is arm)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_skins=True,
        export_apply=False,
        export_animations=True,
        export_animation_mode="ACTIVE_ACTIONS",
        export_bake_animation=False,
        export_optimize_animation_size=False,
        export_force_sampling=True,
        export_frame_range=False,
        export_morph=False,
        export_materials="NONE",
        export_cameras=False,
        export_lights=False,
    )
    log(f"exportado {os.path.basename(path)} ({os.path.getsize(path)} bytes)")


def render_video(arm, action, path, f0, f1, view="3q", res=720, samples=16):
    """Renderiza el clip a MP4 para revisarlo en movimiento."""
    import subprocess

    sc = bpy.context.scene
    arm.animation_data.action = action
    cam = bpy.data.objects["PreviewCam"]
    target = bpy.data.objects["PreviewTarget"]
    if view == "side":
        cam.location = (3.4, 0.0, 1.05)
        cam.data.lens = 50.0
    elif view == "front":
        cam.location = (0.0, -3.4, 1.05)
        cam.data.lens = 50.0
    else:
        cam.location = (3.1, -1.6, 1.35)
        cam.data.lens = 33.0
    target.location = (0.0, 0.0, 0.92)

    sc.render.resolution_x = sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = "PNG"
    sc.eevee.taa_render_samples = samples
    sc.frame_start = f0
    sc.frame_end = f1
    tmp = os.path.join(os.path.dirname(path), "_frames_" + os.path.basename(path)[:-4])
    os.makedirs(tmp, exist_ok=True)
    sc.render.filepath = os.path.join(tmp, "f_")
    bpy.ops.render.render(animation=True)

    subprocess.run([
        "ffmpeg", "-y", "-loglevel", "error",
        "-framerate", str(FPS),
        "-i", os.path.join(tmp, "f_%04d.png"),
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20",
        path,
    ], check=True)
    for f in os.listdir(tmp):
        os.remove(os.path.join(tmp, f))
    os.rmdir(tmp)
    log(f"video {os.path.basename(path)} ({f1 - f0 + 1} frames)")


def render_still(arm, action, path, frame, view="3q", res=720, samples=32):
    sc = bpy.context.scene
    arm.animation_data.action = action
    cam = bpy.data.objects["PreviewCam"]
    target = bpy.data.objects["PreviewTarget"]
    if view == "side":
        cam.location = (3.4, 0.0, 1.05)
        cam.data.lens = 50.0
    elif view == "front":
        cam.location = (0.0, -3.4, 1.05)
        cam.data.lens = 50.0
    else:
        cam.location = (3.1, -1.6, 1.35)
        cam.data.lens = 33.0
    target.location = (0.0, 0.0, 0.92)
    sc.render.resolution_x = sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = "PNG"
    sc.eevee.taa_render_samples = samples
    sc.frame_set(frame)
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    log(f"still {os.path.basename(path)}")


# --------------------------------------------------------------------------

def main():
    args = parse_args()
    clean_scene()
    src = import_bvh(args.bvh)
    dst = bpy.data.objects[NYX]

    act, f0, f1 = retarget(src, dst)

    # Antes de hornear: `write_action` renumera desde 0 y desalinearia la
    # comparacion con los frames del BVH.
    if args.verify:
        verify(src, dst, [int(x) for x in args.verify.split(",")])

    # El BVH de BlendCap deja la cadera a la altura del sujeto del video; si
    # difiere de la de NYX los pies flotan o se hunden. Se mide la malla ya
    # posada en TODO el clip y se corrige con un desplazamiento constante: el
    # punto mas bajo del clip queda en Z=0, asi ningun apoyo penetra el suelo.
    offset = 0.0
    if args.ground:
        lows = []
        for f in range(f0, f1 + 1):
            bpy.context.scene.frame_set(f)
            lows.append(mesh_min_z())
        lo = min(lows)
        offset = -lo
        log(f"punto mas bajo del clip: {lo:+.4f} m -> offset {offset:+.4f} "
            f"(por frame: {min(lows):+.3f}..{max(lows):+.3f})")

    frames, head_z = snapshot(dst, f0, f1)
    apply_ground_offset(frames, offset)
    if not args.no_secondary:
        apply_secondary(frames, head_z)

    if args.loop:
        lo, hi = 0, len(frames) - 1
        if args.loop_window:
            a, b = (int(x) for x in args.loop_window.split(":"))
            lo = max(0, a - f0)
            hi = min(len(frames) - 1, b - f0)
            log(f"bucle: buscando solo en frames {f0 + lo}..{f0 + hi} del BVH")
        found = find_loop(frames[lo:hi + 1], args.loop_min)
        if found is None:
            log("AVISO: sin sub-segmento de bucle, se exporta el clip entero")
        else:
            err, i, j = found
            i += lo
            j += lo
            log(f"bucle: frames {i}..{j} ({j - i} frames, {(j - i) / FPS:.2f}s), "
                f"error {math.sqrt(err):.4f}")
            frames = frames[i:j + 1]

    out_act = write_action(dst, args.name, frames)
    log(f"accion {args.name}: {len(frames)} frames ({len(frames) / FPS:.2f}s)")

    if args.analyze:
        analyze(dst, 0, len(frames) - 1)

    if not args.no_export:
        os.makedirs(args.out, exist_ok=True)
        export_glb(dst, out_act, os.path.join(args.out, args.name + ".glb"))

    if args.stills:
        sdir = args.stills_dir or os.path.join(args.out, "stills")
        os.makedirs(sdir, exist_ok=True)
        for f in [int(x) for x in args.stills.split(",")]:
            render_still(dst, out_act,
                         os.path.join(sdir, f"{args.name}_{f:03d}.png"), f)

    if args.video:
        os.makedirs(os.path.dirname(args.video) or ".", exist_ok=True)
        render_video(dst, out_act, args.video, 0, len(frames) - 1,
                     view=args.video_view)

    log("listo")


main()
