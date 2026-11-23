"""
OUTORBIT — Genera el set de animacion de correr de Nyx (start / bucle / end / full).

Pipeline:
  1. Importa un clip continuo de Kimodo (SOMA30): parado -> correr -> parado.
  2. Retarget al rig de 27 huesos de Nyx (in-place, sin root motion).
  3. Mejoras sobre el bake:
       - apoyo en el suelo (el retarget hereda la altura de cadera de SOMA y
         deja a Nyx flotando ~12 cm),
       - inclinacion de torso hacia delante proporcional a la velocidad,
       - motion secundario en pelo (hair_1..4) y mangas (sleeve_L/R).
  4. Corta en start / bucle / end con cierre de bucle exacto (el ultimo frame
     del bucle es identico al primero, y start/end empalman con el).
  5. Exporta GLB (solo animacion) y previews MP4.

Uso:
  blender -b animaciones_generadas/nyx_animaciones.blend \
      --python scripts/blender_nyx_run.py -- \
      --gltf animaciones_generadas/en_espera/kimodo_correr_completo_seed123.gltf \
      --out animaciones_generadas/procesadas \
      --previews animaciones_generadas/previews \
      --loop-start 45 --loop-period 20 --end-start 105 --end-end 150
"""

import argparse
import math
import os
import sys

import bpy
from mathutils import Matrix, Quaternion, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from blender_kimodo_retarget_nyx import retarget_soma_to_nyx  # noqa: E402

FPS = 30
NYX = "nyx_armature"
MESHES = ("nyx_body", "nyx_hair", "nyx_face", "nyx_eyes")

# Mejoras
LEAN_MAX_DEG = 10.0      # inclinacion total del torso a velocidad maxima
LEAN_SPINE = 0.45        # reparto spine / chest
LEAN_NECK = -0.35        # contra-rotacion del cuello para mantener la mirada
HAIR_TRAIL_DEG = 16.0    # arrastre constante del pelo hacia atras
HAIR_BOUNCE_DEG = 5.0    # rebote del pelo por aceleracion vertical de la cabeza
SLEEVE_TRAIL_DEG = 10.0
SLEEVE_BOUNCE_DEG = 4.0
END_BLEND_FRAMES = 6     # frames de mezcla al inicio del clip final

# Kimodo deja los brazos con los codos abiertos hacia fuera y las manos
# pegadas al pecho; con el brazo superior de Nyx (0.16 m frente a los 0.287 m
# de SOMA) el gesto se colapsa. Se rehace el braceo con un swing de corredor
# derivado del angulo del muslo del mismo lado (brazo y pierna en oposicion).
ARM_FIX = True
ARM_SWING_RATIO = 0.85   # amplitud del braceo respecto al muslo
ARM_OUT = 0.16           # separacion lateral del brazo respecto al torso
ARM_ELBOW_DEG = 85.0     # flexion del codo corriendo
ARM_ELBOW_IDLE_DEG = 18.0  # flexion del codo parada


def log(msg):
    print(f"[nyx_run] {msg}")


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--gltf", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--previews", default=None)
    p.add_argument("--loop-start", type=int, required=True)
    p.add_argument("--loop-period", type=int, required=True)
    p.add_argument("--end-start", type=int, required=True)
    p.add_argument("--end-end", type=int, required=True)
    p.add_argument("--start-begin", type=int, default=0)
    p.add_argument("--preview-res", type=int, default=640)
    p.add_argument("--stills", default=None,
                   help="frames sueltos a renderizar, ej. '60,70,80'")
    p.add_argument("--still-view", default="side", choices=("side", "front", "3q"))
    p.add_argument("--no-export", action="store_true")
    p.add_argument("--no-preview", action="store_true")
    return p.parse_args(argv)


# --------------------------------------------------------------------------
# escena
# --------------------------------------------------------------------------

def clean_scene():
    for ac in list(bpy.data.actions):
        bpy.data.actions.remove(ac)
    for ob in list(bpy.data.objects):
        if ob.name.startswith("skin") or ob.name.startswith("SOMA"):
            bpy.data.objects.remove(ob, do_unlink=True)
    sc = bpy.context.scene
    sc.render.fps = FPS
    sc.render.fps_base = 1.0


def import_source(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    arms = [o for o in new if o.type == "ARMATURE"]
    if not arms:
        raise RuntimeError("el glTF no trae armature")
    src = arms[0]
    log(f"importado {os.path.basename(path)}: armature={src.name} bones={len(src.data.bones)}")
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


# --------------------------------------------------------------------------
# velocidad del clip origen (antes del retarget, que borra el root motion)
# --------------------------------------------------------------------------

def speed_profile(src, f0, f1):
    sc = bpy.context.scene
    hips = src.pose.bones["Hips"]
    pos = []
    for f in range(f0, f1 + 1):
        sc.frame_set(f)
        pos.append((src.matrix_world @ hips.head).copy())
    speed = [0.0] * len(pos)
    for i in range(1, len(pos) - 1):
        speed[i] = (pos[i + 1] - pos[i - 1]).length * FPS / 2.0
    speed[0] = speed[1]
    speed[-1] = speed[-2]
    return speed


# --------------------------------------------------------------------------
# snapshot del bake
# --------------------------------------------------------------------------

def snapshot(arm, f0, f1, pre_frame=None):
    """Lee (location, quaternion, scale) de cada hueso y la altura de la cabeza."""
    sc = bpy.context.scene
    out = []
    head_z = []
    for f in range(f0, f1 + 1):
        sc.frame_set(f)
        if pre_frame is not None:
            pre_frame(arm, f)
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
    """Crea una accion nueva a partir de un snapshot."""
    if arm.animation_data is None:
        arm.animation_data_create()
    act = bpy.data.actions.new(name)
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


def iter_fcurves(act):
    """Blender 5.x: las fcurves viven en layers/strips/channelbags."""
    if hasattr(act, "fcurves"):
        return list(act.fcurves)
    out = []
    for layer in act.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                out.extend(bag.fcurves)
    return out


# --------------------------------------------------------------------------
# mejoras
# --------------------------------------------------------------------------

def rot_local_x(quat, angle):
    """Rota un quaternion local alrededor del eje X del hueso."""
    return Quaternion((1.0, 0.0, 0.0), angle) @ quat


def apply_lean(frames, speed):
    """Inclina el torso hacia delante segun la velocidad (doc: sprint inclinado)."""
    vmax = max(speed) or 1.0
    for i, frame in enumerate(frames):
        s01 = min(1.0, speed[i] / vmax) if i < len(speed) else 0.0
        total = math.radians(LEAN_MAX_DEG) * s01
        if total <= 0.0:
            continue
        for bone, share in (("spine", LEAN_SPINE), ("chest", 1.0 - LEAN_SPINE),
                            ("neck", LEAN_NECK)):
            loc, quat, scale = frame[bone]
            frame[bone] = (loc, rot_local_x(quat, total * share), scale)


def apply_secondary(frames, speed, head_z):
    """Pelo y mangas: arrastre por velocidad + rebote por aceleracion vertical."""
    vmax = max(speed) or 1.0
    n = len(frames)

    for i, frame in enumerate(frames):
        s01 = min(1.0, speed[i] / vmax) if i < len(speed) else 0.0
        i0, i1 = max(0, i - 1), min(n - 1, i + 1)
        acc = head_z[i1] - 2.0 * head_z[i] + head_z[i0]
        for k, bone in enumerate(("hair_1", "hair_2", "hair_3", "hair_4")):
            # la punta del pelo se mueve mas
            w = 0.45 + 0.25 * k
            ang = math.radians(HAIR_TRAIL_DEG * s01 * w - HAIR_BOUNCE_DEG * acc * 300.0 * w)
            loc, quat, scale = frame[bone]
            frame[bone] = (loc, rot_local_x(quat, ang), scale)
        for bone in ("sleeve_L", "sleeve_R"):
            ang = math.radians(SLEEVE_TRAIL_DEG * s01 - SLEEVE_BOUNCE_DEG * acc * 300.0)
            loc, quat, scale = frame[bone]
            frame[bone] = (loc, rot_local_x(quat, ang), scale)


def apply_ground_offset(frames, offset):
    """Baja la cadera para que el personaje apoye en el suelo."""
    for frame in frames:
        loc, quat, scale = frame["hips"]
        # el eje Y local del hueso hips apunta a +Z mundo
        frame["hips"] = (Vector((loc.x, loc.y + offset, loc.z)), quat, scale)


def aim_bone(pb, child, target):
    """Orienta el hueso para que la direccion hacia `child` apunte a `target`.

    En el rig de Nyx TODOS los huesos apuntan hacia arriba en rest (el tail
    esta por encima del head), asi que la direccion del miembro es
    child.head - pb.head, no tail - head.
    """
    cur = (child.head - pb.head).normalized()
    q = cur.rotation_difference(target.normalized())
    m = pb.matrix.copy()
    head = m.translation.copy()
    pb.matrix = (Matrix.Translation(head) @ q.to_matrix().to_4x4()
                 @ Matrix.Translation(-head) @ m)


def make_arm_fixer(speed, f0):
    """Devuelve el callback por frame que rehace el braceo.

    El swing va en oposicion al muslo del mismo lado y el codo se relaja al
    bajar la velocidad, para que el arranque empiece con los brazos colgando
    en vez de con la pose de carrera.

    Ojo: en el rig de Nyx los huesos de la pierna apuntan hacia arriba en rest
    (tail por encima de head), asi que la direccion real del muslo es
    shin.head - thigh.head, no tail - head.
    """
    vmax = max(speed) or 1.0

    def fix(arm, f):
        i = f - f0
        s01 = min(1.0, speed[i] / vmax) if 0 <= i < len(speed) else 0.0
        t = s01 * s01 * (3.0 - 2.0 * s01)          # smoothstep
        elbow = math.radians(ARM_ELBOW_IDLE_DEG
                             + (ARM_ELBOW_DEG - ARM_ELBOW_IDLE_DEG) * t)
        for side, sgn in (("L", 1.0), ("R", -1.0)):
            thigh = arm.pose.bones[f"thigh_{side}"]
            shin = arm.pose.bones[f"shin_{side}"]
            d = (shin.head - thigh.head).normalized()
            leg_ang = math.atan2(-d.y, -d.z)      # + = pierna adelante
            swing = -ARM_SWING_RATIO * leg_ang * t
            ua = Vector((ARM_OUT * sgn, -math.sin(swing), -math.cos(swing)))
            fa = Vector((ARM_OUT * 0.5 * sgn, -math.sin(swing + elbow),
                         -math.cos(swing + elbow)))
            aim_bone(arm.pose.bones[f"upperArm_{side}"],
                     arm.pose.bones[f"forearm_{side}"], ua)
            bpy.context.view_layer.update()
            aim_bone(arm.pose.bones[f"forearm_{side}"],
                     arm.pose.bones[f"hand_{side}"], fa)
            bpy.context.view_layer.update()

    return fix


# --------------------------------------------------------------------------
# corte en segmentos
# --------------------------------------------------------------------------

def close_loop(frames, a, p):
    """Fuerza frames[a+p] == frames[a] repartiendo el residuo linealmente."""
    start = frames[a]
    end = frames[a + p]
    out = []
    for k in range(p + 1):
        t = k / float(p)
        frame = {}
        for bone in frames[a].keys():
            l0, q0, s0 = start[bone]
            l1, q1, s1 = frames[a + k][bone]
            # residuo que hay que anular al final del ciclo
            dq = q1.rotation_difference(q0)          # q0 = q1 @ dq
            dl = l0 - l1
            q = q1 @ Quaternion((1.0, 0.0, 0.0, 0.0)).slerp(dq, t)
            frame[bone] = (l1 + dl * t, q, s1)
        out.append(frame)
    return out


def blend_into(frames, target, count):
    """Mezcla los primeros `count` frames hacia `target` (empalme start/end)."""
    out = list(frames)
    for k in range(min(count, len(out))):
        t = k / float(count - 1) if count > 1 else 1.0
        frame = {}
        for bone in out[k].keys():
            l0, q0, s0 = target[bone]
            l1, q1, s1 = out[k][bone]
            frame[bone] = (l0.lerp(l1, t), q0.slerp(q1, t), s0.lerp(s1, t))
        out[k] = frame
    return out


# --------------------------------------------------------------------------
# export / preview
# --------------------------------------------------------------------------

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


def render_still(arm, action, path, frame, view="side", res=900, samples=48):
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


def render_preview(arm, action, path, view="3q", res=(640, 360), samples=24):
    sc = bpy.context.scene
    arm.animation_data.action = action
    f0, f1 = int(action.frame_range[0]), int(action.frame_range[1])
    sc.frame_start, sc.frame_end = f0, f1

    cam = bpy.data.objects["PreviewCam"]
    target = bpy.data.objects["PreviewTarget"]
    old_loc = cam.location.copy()
    old_lens = cam.data.lens
    if view == "side":
        cam.location = (3.4, 0.0, 1.05)
        cam.data.lens = 50.0
    else:
        cam.location = (3.1, -1.6, 1.35)
        cam.data.lens = 33.0
    target.location = (0.0, 0.0, 0.92)

    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = "PNG"
    sc.eevee.taa_render_samples = samples
    tmp = os.path.join(os.path.dirname(path), "_frames_" + os.path.basename(path).replace(".mp4", ""))
    os.makedirs(tmp, exist_ok=True)
    sc.render.filepath = os.path.join(tmp, "f_")
    bpy.ops.render.render(animation=True)

    import subprocess
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-framerate", str(FPS),
        "-i", os.path.join(tmp, "f_%04d.png"),
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20",
        path,
    ]
    subprocess.run(cmd, check=True)
    for f in os.listdir(tmp):
        os.remove(os.path.join(tmp, f))
    os.rmdir(tmp)
    cam.location = old_loc
    cam.data.lens = old_lens
    log(f"preview {os.path.basename(path)} ({f1 - f0 + 1} frames)")


# --------------------------------------------------------------------------

def main():
    args = parse_args()
    clean_scene()
    src = import_source(args.gltf)
    act_src = src.animation_data.action
    f0, f1 = int(act_src.frame_range[0]), int(act_src.frame_range[1])
    log(f"clip origen {f0}..{f1} ({f1 - f0 + 1} frames, {(f1 - f0 + 1) / FPS:.2f}s)")

    speed = speed_profile(src, f0, f1)
    log(f"velocidad max {max(speed):.2f} m/s  inicio {speed[0]:.2f}  fin {speed[-1]:.2f}")

    dst = bpy.data.objects[NYX]
    retarget_soma_to_nyx(
        source_armature_name=src.name,
        target_armature_name=NYX,
        in_place=True,
        time_scale=1.0,
    )
    baked = dst.animation_data.action
    log(f"bake {baked.name} {tuple(baked.frame_range)}")

    # offset de suelo: el personaje debe apoyar como en rest pose
    bpy.context.scene.frame_set(f0)
    float_z = mesh_min_z()
    log(f"flotacion en reposo del clip: {float_z:.4f} m")
    offset = -float_z

    frames, head_z = snapshot(dst, f0, f1,
                              pre_frame=make_arm_fixer(speed, f0) if ARM_FIX else None)
    apply_ground_offset(frames, offset)
    apply_lean(frames, speed)
    apply_secondary(frames, speed, head_z)
    log(f"mejoras aplicadas (offset {offset:+.4f} m, lean {LEAN_MAX_DEG} deg)")

    a, p = args.loop_start - f0, args.loop_period
    e0, e1 = args.end_start - f0, args.end_end - f0
    sb = args.start_begin - f0
    log(f"corte: start {sb}..{a}  bucle {a}..{a + p}  end {e0}..{e1}")

    loop = close_loop(frames, a, p)
    start = frames[sb:a + 1]
    end = blend_into(frames[e0:e1 + 1], loop[-1], END_BLEND_FRAMES)

    # full = clip continuo natural (parado -> correr -> parado), sin costuras
    full = frames[sb:e1 + 1]
    log(f"segmentos: start {len(start)}  bucle {len(loop)}  end {len(end)}  full {len(full)}")

    os.makedirs(args.out, exist_ok=True)
    specs = [
        ("nyx_correr_start", start),
        ("nyx_correr_bucle", loop),
        ("nyx_correr_end", end),
        ("nyx_correr_full", full),
    ]
    actions = {}
    for name, seg in specs:
        actions[name] = write_action(dst, name, seg)
        log(f"accion {name}: {len(seg)} frames ({len(seg) / FPS:.2f}s)")

    if not args.no_export:
        for name, _ in specs:
            export_glb(dst, actions[name], os.path.join(args.out, name + ".glb"))

    if args.previews and not args.no_preview:
        os.makedirs(args.previews, exist_ok=True)
        for name, _ in specs:
            render_preview(dst, actions[name], os.path.join(args.previews, name + ".mp4"),
                           view="3q", res=(args.preview_res, args.preview_res * 9 // 16))
        render_preview(dst, actions["nyx_correr_full"],
                       os.path.join(args.previews, "nyx_correr_full_side.mp4"),
                       view="side", res=(args.preview_res, args.preview_res * 9 // 16))

    if args.stills:
        os.makedirs(args.out, exist_ok=True)
        for f in [int(x) for x in args.stills.split(",")]:
            render_still(dst, actions["nyx_correr_full"],
                         os.path.join(args.out, f"still_{f:03d}.png"), f, view=args.still_view)

    log("listo")


main()
