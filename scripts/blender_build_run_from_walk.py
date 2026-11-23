"""Construye el ciclo de carrera a partir del ciclo de caminar ya aprobado.

El BVH de BlendCap para `run_lean` no sirve: medido sobre el propio BVH, el
muslo izquierdo oscila solo -8.5..+5.9 grados dentro del tramo limpio y el
brazo izquierdo se queda abierto 45 grados respecto al plano sagital. El clip
salia como un balanceo, no como una carrera, y el braceo se quedaba cruzado
delante del pecho.

En vez de pelear con esa captura se parte de `nyx_walk_loop.glb`, que esta
cerrado y aprobado, y se le aplican las tres diferencias que separan caminar de
correr:

  * cadencia: el ciclo se reproduce `RUN_SPEEDUP` veces mas rapido;
  * inclinacion: el torso se echa adelante;
  * braceo: el balanceo sagital de los brazos se amplifica y el codo se pliega.

El braceo se amplifica sobre el que ya trae el clip, no se sintetiza: asi la
fase sigue siendo la del paso y los brazos siguen yendo a contra-pierna.

Uso:
    blender -b animaciones_generadas/nyx_animaciones.blend \
        --python scripts/blender_build_run_from_walk.py -- \
        --walk public/models/nyx_walk_loop.glb \
        --name nyx_run_loop --out animaciones_generadas/blendcap/glb
"""

import argparse
import math
import os
import subprocess
import sys

import bpy
from mathutils import Quaternion, Vector

NYX = "nyx_armature"
FPS = 30

# Cuanto mas rapido que el ciclo de caminar. El clip de caminar dura 1.20 s por
# ciclo completo (dos pasos); a 1.55x se queda en 0.77 s, que es cadencia de
# carrera y encaja con el `maxRate` del reproductor del juego.
RUN_SPEEDUP = 1.7

# Inclinacion adelante repartida entre los dos huesos del torso. Nyx mira a -Y,
# asi que un giro positivo alrededor de X echa el torso hacia adelante.
LEAN_SPINE_DEG = 7.0
LEAN_CHEST_DEG = 6.0

# Braceo. El clip de caminar mueve el brazo apenas +-2 grados, asi que
# amplificarlo no sirve: el balanceo se sintetiza a partir de la fase del muslo
# izquierdo, que en el caminar si es una sinusoide limpia. El brazo derecho va
# adelante cuando la pierna izquierda va adelante.
ARM_SWING_DEG = 42.0
ELBOW_BASE_DEG = 72.0
ELBOW_SWING_DEG = 16.0

# Rebote vertical extra de la cadera, en metros de amplitud.
BOUNCE_EXTRA = 0.022

ARM_BONES = ("upperArm_L", "upperArm_R", "forearm_L", "forearm_R")


def log(msg):
    print(f"[RunFromWalk] {msg}")


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--walk", required=True, help="GLB del ciclo de caminar")
    p.add_argument("--name", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--no-export", action="store_true")
    p.add_argument("--stills", default="")
    p.add_argument("--stills-dir", default="")
    p.add_argument("--video", default="")
    p.add_argument("--video-view", default="3q", choices=("3q", "side", "front"))
    return p.parse_args(argv)


def clean_scene():
    for ob in list(bpy.data.objects):
        if ob.type == "ARMATURE" and ob.name != NYX:
            bpy.data.objects.remove(ob, do_unlink=True)
    for ac in list(bpy.data.actions):
        bpy.data.actions.remove(ac)
    sc = bpy.context.scene
    sc.render.fps = FPS
    sc.render.fps_base = 1.0


def import_walk(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    arms = [o for o in new if o.type == "ARMATURE"]
    if not arms:
        raise RuntimeError("el GLB de caminar no trae armature")
    src = arms[0]
    act = src.animation_data.action if src.animation_data else None
    if act is None:
        raise RuntimeError("el GLB de caminar no trae accion")
    f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
    log(f"caminar: {src.name} {len(src.data.bones)} huesos, frames {f0}..{f1}")
    return src, act, f0, f1


def iter_fcurves(act):
    if hasattr(act, "fcurves"):
        return list(act.fcurves)
    out = []
    for layer in act.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                out.extend(bag.fcurves)
    return out


def hierarchy_order(arm):
    order = []

    def walk(bone):
        order.append(bone.name)
        for child in bone.children:
            walk(child)

    roots = [b for b in arm.data.bones if b.parent is None]
    for r in roots:
        walk(r)
    return order


def build(src, act, f0, f1, dst):
    """Copia el ciclo de caminar sobre NYX aplicando los deltas de carrera."""
    sc = bpy.context.scene
    src.animation_data.action = act

    rest = {b.name: (dst.matrix_world @ b.matrix_local).to_quaternion()
            for b in dst.data.bones}
    order = hierarchy_order(dst)
    names = [n for n in order if n in dst.pose.bones]

    # Muestreo del clip de caminar, con interpolacion lineal entre frames para
    # poder leer fracciones de frame al acelerar.
    n_src = f1 - f0 + 1
    samples = []
    for f in range(f0, f1 + 1):
        sc.frame_set(f)
        samples.append({pb.name: pb.rotation_quaternion.copy()
                        for pb in src.pose.bones})

    n_out = max(2, int(round(n_src / RUN_SPEEDUP)))
    log(f"caminar {n_src} frames -> carrera {n_out} frames "
        f"({n_out / FPS:.2f}s, {RUN_SPEEDUP:.2f}x)")

    def sample_at(t):
        """Pose del caminar en la posicion fraccionaria `t` (0..n_src-1)."""
        i = int(math.floor(t))
        frac = t - i
        a = samples[i % n_src]
        b = samples[(i + 1) % n_src]
        return {k: a[k].slerp(b[k], frac) for k in a}

    lean = {
        "spine": Quaternion((1.0, 0.0, 0.0), math.radians(LEAN_SPINE_DEG)),
        "chest": Quaternion((1.0, 0.0, 0.0), math.radians(LEAN_CHEST_DEG)),
    }
    # Los huesos de NYX apuntan todos a +Z en rest, asi que la direccion
    # anatomica del miembro (+X en los brazos) hay que llevarla al espacio
    # local del hueso antes de rotarla con el world.
    anat_local = {n: rest[n].inverted() @ Vector((1.0, 0.0, 0.0))
                  for n in ARM_BONES}

    def sagittal_angle(name, world_quat):
        """Angulo del miembro respecto a la vertical, positivo = adelante."""
        d = (world_quat @ anat_local[name]).normalized()
        return math.atan2(-d.y, -d.z)

    def set_sagittal(name, world_quat, target_deg):
        """Lleva el miembro al angulo sagital pedido, conservando la apertura."""
        delta = sagittal_angle(name, world_quat) - math.radians(target_deg)
        return Quaternion((1.0, 0.0, 0.0), delta) @ world_quat

    # Fase del paso: angulo sagital del muslo izquierdo en cada frame del
    # caminar, centrado en su media y normalizado a +-1.
    thigh = []
    for f in range(f0, f1 + 1):
        sc.frame_set(f)
        a = src.matrix_world @ src.pose.bones["thigh_L"].head
        b = src.matrix_world @ src.pose.bones["shin_L"].head
        d = (b - a).normalized()
        thigh.append(math.atan2(-d.y, -d.z))
    mean = sum(thigh) / len(thigh)
    amp = max(abs(x - mean) for x in thigh) or 1.0
    phase = [(x - mean) / amp for x in thigh]
    log(f"fase del paso: muslo {math.degrees(min(thigh)):+.1f}.."
        f"{math.degrees(max(thigh)):+.1f} grados")

    def phase_at(t):
        i = int(math.floor(t))
        frac = t - i
        return phase[i % len(phase)] * (1.0 - frac) + phase[(i + 1) % len(phase)] * frac

    if dst.animation_data is None:
        dst.animation_data_create()
    out = bpy.data.actions.new(name=f"rw_{act.name}")
    out.use_fake_user = True
    dst.animation_data.action = out

    hips_rest = rest["hips"].to_matrix()
    hips_z0 = (dst.matrix_world @ dst.data.bones["hips"].matrix_local).translation.z

    for i in range(n_out):
        t = i * (n_src / n_out)
        pose = sample_at(t)
        p = phase_at(t)
        world = {}
        for name in names:
            pb = dst.pose.bones[name]
            pn = pb.parent.name if pb.parent is not None else None
            parent_world = world[pn] if pn else None
            basis = pose.get(name, Quaternion((1.0, 0.0, 0.0, 0.0)))
            if pn is not None:
                inherited = (parent_world @ rest[pn].inverted()
                             @ rest[name] @ basis)
            else:
                inherited = rest[name] @ basis

            if name in lean:
                inherited = lean[name] @ inherited
            elif name in ("upperArm_L", "upperArm_R"):
                side = 1.0 if name.endswith("_L") else -1.0
                inherited = set_sagittal(name, inherited,
                                         side * ARM_SWING_DEG * p)
            elif name in ("forearm_L", "forearm_R"):
                side = 1.0 if name.endswith("_L") else -1.0
                bend = ELBOW_BASE_DEG + side * ELBOW_SWING_DEG * p
                inherited = set_sagittal(name, inherited,
                                         side * ARM_SWING_DEG * p + bend)

            world[name] = inherited
            if pn is not None:
                local = (parent_world @ rest[pn].inverted()
                         @ rest[name]).inverted() @ inherited
            else:
                local = rest[name].inverted() @ inherited
            pb.rotation_quaternion = local
            pb.keyframe_insert("rotation_quaternion", frame=i, group=name)

            if name == "hips":
                # Rebote vertical extra, dos por ciclo (uno por apoyo).
                bounce = BOUNCE_EXTRA * math.sin(
                    2.0 * math.pi * 2.0 * i / n_out)
                pb.location = hips_rest.inverted() @ Vector((0.0, 0.0, bounce))
                pb.keyframe_insert("location", frame=i, group=name)

    for fc in iter_fcurves(out):
        for kp in fc.keyframe_points:
            kp.interpolation = "LINEAR"

    log(f"accion {out.name}: {n_out} frames ({n_out / FPS:.2f}s)")

    # Diagnostico: direccion real de los brazos en el clip resultante.
    dst.animation_data.action = out
    for f in range(0, n_out, max(1, n_out // 6)):
        sc.frame_set(f)
        parts = []
        for name in ARM_BONES:
            pb = dst.pose.bones[name]
            w = (dst.matrix_world @ pb.matrix).to_quaternion()
            d = (w @ anat_local[name]).normalized()
            ang = math.degrees(math.atan2(-d.y, -d.z))
            splay = math.degrees(math.atan2(abs(d.x), math.hypot(d.y, d.z)))
            parts.append(f"{name}={ang:+6.1f}/{splay:4.1f}")
        log(f"  f{f:02d} " + "  ".join(parts))
    return out, n_out


def export_glb(arm, action, path):
    arm.animation_data.action = action
    bpy.ops.object.select_all(action="DESELECT")
    for ob in bpy.data.objects:
        if ob.type in ("ARMATURE", "MESH") and ob.name.startswith("nyx"):
            ob.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_bake_animation=True,
        export_optimize_animation_size=False,
        export_apply=False,
    )
    log(f"exportado {os.path.basename(path)} ({os.path.getsize(path)} bytes)")


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


def render_video(arm, action, path, f0, f1, view="3q", res=720, samples=16):
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
    tmp = os.path.join(os.path.dirname(path) or ".",
                       "_frames_" + os.path.basename(path)[:-4])
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


def main():
    args = parse_args()
    clean_scene()
    src, act, f0, f1 = import_walk(args.walk)
    dst = bpy.data.objects[NYX]
    out_act, n_out = build(src, act, f0, f1, dst)

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
        render_video(dst, out_act, args.video, 0, n_out - 1,
                     view=args.video_view)

    log("listo")


main()
