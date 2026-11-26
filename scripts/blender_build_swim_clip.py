"""Genera el clip de nado en 0G (`public/models/nyx_swim.glb`) cuando Edén < 5.5.

Autoría limpia sobre el esqueleto `nyx_armature` de `nyx_rigged.glb`:
- 37 frames a 30 FPS (1.20 s, frame 36 == frame 0 -> bucle perfecto sin saltos).
- Estilo crol espacial en gravedad cero: torso inclinado hacia delante (~26°),
  balanceo de hombros/cadera acompañando la brazada alterna L/R, codos doblados
  durante el recobro/empuje, patada alterna rápida (2 ciclos por brazada) con
  punteras extendidas y onda fluida en el pelo.

Uso:
  blender -b --python scripts/blender_build_swim_clip.py
  blender -b --python scripts/blender_build_swim_clip.py -- --preview /tmp/swim_preview.png
"""

import argparse
import math
import os
import sys

import bpy
from mathutils import Euler, Quaternion, Vector

_HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(_HERE)

RIGGED_GLB = os.path.join(ROOT, "public", "models", "nyx_rigged.glb")
OUT_GLB = os.path.join(ROOT, "public", "models", "nyx_swim.glb")
FPS = 30
N_FRAMES = 37  # 0..36 inclusive (36 == 0 -> 1.20 s exactos de bucle)


def euler_deg(x_deg, y_deg, z_deg):
    return Euler(
        (math.radians(x_deg), math.radians(y_deg), math.radians(z_deg)),
        "XYZ",
    ).to_quaternion()


def mirror_euler(x_deg, y_deg, z_deg):
    """Espeja convención L -> R (invierte Y y Z en el esqueleto de Nyx)."""
    return euler_deg(x_deg, -y_deg, -z_deg)


def arm_rot_L(sag_deg, drop_deg, twist_deg):
    """Compone en orden físico: primero baja el brazo desde T-pose (Z<0),
    luego gira el hombro en sagital (X<0 adelante/arriba, X>0 atrás) y torsión Y."""
    qx = Quaternion((1.0, 0.0, 0.0), math.radians(sag_deg))
    qz = Quaternion((0.0, 0.0, 1.0), math.radians(drop_deg))
    qy = Quaternion((0.0, 1.0, 0.0), math.radians(twist_deg))
    return qx @ qz @ qy


def mirror_quat(q):
    """Espeja una rotación local L -> R (invierte Y y Z)."""
    return Quaternion((q.w, q.x, -q.y, -q.z))


def arm_cycle(p):
    """Brazada de crol en 0G para brazo L en fase p (0..1).

    Fases:
      p ~ 0.00 : brazo estirado ADELANTE por encima de la cabeza buscando empuje
      p ~ 0.25 : barrido FUERTE hacia abajo/atrás bajo el torso (codo flexionado)
      p ~ 0.50 : empuje final pasando la cadera
      p ~ 0.75 : recobro abierto hacia delante con codo flexionado
    """
    w = 2.0 * math.pi * p
    # sag_deg: oscila entre -148° (estirado adelante) y +22° (empuje atrás)
    sag_deg = -63.0 - 85.0 * math.cos(w) + 14.0 * math.sin(2.0 * w)
    # drop_deg (<0): más pegado al cuerpo en el empuje (-74°), más abierto en recobro (-32°)
    drop_deg = -54.0 + 22.0 * math.sin(w)
    twist_deg = 12.0 * math.sin(w)
    ua_q = arm_rot_L(sag_deg, drop_deg, twist_deg)

    # Codo: forearm_L.y < 0 dobla el codo hacia delante.
    # Casi extendido en alcance (-18°), flexionado a -70° durante tirón/recobro.
    fa_bend = -22.0 - 48.0 * (0.5 - 0.5 * math.cos(w))
    fa_q = euler_deg(0.0, fa_bend, -4.0 * math.sin(w))

    # Mano: palma plana empujando en tirón
    hd_q = euler_deg(-6.0 + 14.0 * math.sin(w), -10.0 * math.cos(w), -6.0)

    clav_q = euler_deg(0.0, -12.0 * math.cos(w), 6.0 + 8.0 * math.cos(w))
    return ua_q, fa_q, hd_q, clav_q


def leg_cycle(p):
    """Patada alterna rápida (2 batidos por cada brazada completa) en convención L."""
    w = 4.0 * math.pi * p
    # Muslo: oscila suave adelante/atrás con piernas largas
    th_x = 8.0 + 20.0 * math.sin(w)
    th_y = 2.0 * math.cos(w)
    th_z = -4.5 + 2.0 * math.cos(w)

    # Rodilla siempre >= 0: látigo atrás
    sh_x = 20.0 + 22.0 * math.sin(w - 0.75)

    # Pie extendido (flexión plantar < 0)
    ft_x = -38.0 - 10.0 * math.sin(w - 1.1)
    toe_x = -14.0 - 8.0 * math.sin(w - 1.3)
    return (th_x, th_y, th_z), (sh_x, 0.0, 0.0), (ft_x, 0.0, 0.0), (toe_x, 0.0, 0.0)


def sample_pose(p):
    """Calcula rotaciones locales y offset de cadera para la fase p in [0, 1]."""
    w = 2.0 * math.pi * p
    q = {}

    # Torso inclinado en postura clara de nado (~42°) con roll de hombros
    roll = 16.0 * math.sin(w)
    hips_pitch = 42.0 + 3.0 * math.sin(2.0 * w)
    q["hips"] = euler_deg(hips_pitch, roll, 2.5 * math.cos(w))
    q["spine"] = euler_deg(8.0 + 2.0 * math.cos(2.0 * w), 8.0 * math.sin(w - 0.3), -2.0 * math.cos(w))
    q["chest"] = euler_deg(6.0, 10.0 * math.sin(w - 0.5), -2.0 * math.cos(w))

    # Cuello y cabeza compensan la inclinación para mantener la mirada hacia delante
    q["neck"] = euler_deg(-20.0, -6.0 * math.sin(w), 0.0)
    q["head"] = euler_deg(-22.0 - 2.0 * math.sin(2.0 * w), -8.0 * math.sin(w), -3.0 * math.cos(w))

    # Brazos alternos (R a contrafase +0.5)
    uaL, faL, hdL, clL = arm_cycle(p)
    uaR, faR, hdR, clR = arm_cycle((p + 0.5) % 1.0)
    q["clavicle_L"] = clL
    q["upperArm_L"] = uaL
    q["forearm_L"] = faL
    q["hand_L"] = hdL
    q["sleeve_L"] = euler_deg(4.0 * math.sin(w), -5.0 * math.cos(w), 0.0)

    q["clavicle_R"] = mirror_quat(clR)
    q["upperArm_R"] = mirror_quat(uaR)
    q["forearm_R"] = mirror_quat(faR)
    q["hand_R"] = mirror_quat(hdR)
    q["sleeve_R"] = mirror_euler(4.0 * math.sin(w + math.pi), -5.0 * math.cos(w + math.pi), 0.0)

    # Piernas alternas (R a +0.25 en ciclo rápido = 0.5 de medio ciclo)
    thL, shL, ftL, toL = leg_cycle(p)
    thR, shR, ftR, toR = leg_cycle((p + 0.25) % 1.0)
    q["thigh_L"] = euler_deg(*thL)
    q["shin_L"] = euler_deg(*shL)
    q["foot_L"] = euler_deg(*ftL)
    q["toe_L"] = euler_deg(*toL)

    q["thigh_R"] = mirror_euler(*thR)
    q["shin_R"] = mirror_euler(*shR)
    q["foot_R"] = mirror_euler(*ftR)
    q["toe_R"] = mirror_euler(*toR)

    # Pelo flotando hacia atrás con onda progresiva
    for idx in range(1, 5):
        ph = 2.0 * w - 0.65 * (idx - 1)
        base_pitch = 8.0 if idx == 1 else 4.0
        amp = 4.0 + 3.0 * idx
        q[f"hair_{idx}"] = euler_deg(
            base_pitch + amp * math.sin(ph),
            -4.0 * math.sin(w - 0.4 * idx),
            0.6 * amp * math.cos(ph),
        )

    # Ligero vaivén en cadera por cada brazada (sin deriva)
    hip_offset = Vector((
        0.015 * math.sin(w),
        0.025 * math.cos(2.0 * w),
        0.020 * math.sin(2.0 * w),
    ))
    return q, hip_offset


def clear_scene():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for act in list(bpy.data.actions):
        bpy.data.actions.remove(act)


def build_swim_action(arm):
    if arm.animation_data is None:
        arm.animation_data_create()
    act = bpy.data.actions.new("nyx_swim")
    act.use_fake_user = True
    arm.animation_data.action = act

    layer = act.layers[0] if len(act.layers) else act.layers.new("Layer")
    strip = layer.strips[0] if len(layer.strips) else layer.strips.new(type="KEYFRAME")
    slot = act.slots[0] if len(act.slots) else act.slots.new(id_type="OBJECT", name=arm.name)
    arm.animation_data.action_slot = slot
    bag = strip.channelbag(slot, ensure=True)

    rest_hip = arm.pose.bones["hips"].location.copy()
    bone_names = [b.name for b in arm.data.bones]

    samples = []
    for f in range(N_FRAMES):
        p = (f % (N_FRAMES - 1)) / float(N_FRAMES - 1)
        samples.append(sample_pose(p))

    # Asegurar continuidad de signo en cuaterniones
    for f in range(1, N_FRAMES):
        prev_q, _ = samples[f - 1]
        cur_q, _ = samples[f]
        for nm in bone_names:
            if nm in prev_q and nm in cur_q and prev_q[nm].dot(cur_q[nm]) < 0.0:
                cur_q[nm].negate()

    for nm in bone_names:
        if nm not in samples[0][0]:
            continue
        path = f'pose.bones["{nm}"].rotation_quaternion'
        for idx in range(4):
            fc = bag.fcurves.new(path, index=idx, group_name=nm)
            fc.keyframe_points.add(N_FRAMES)
            for f in range(N_FRAMES):
                kp = fc.keyframe_points[f]
                kp.co = (float(f), samples[f][0][nm][idx])
                kp.interpolation = "LINEAR"
            fc.update()

    for idx in range(3):
        fc = bag.fcurves.new('pose.bones["hips"].location', index=idx, group_name="hips")
        fc.keyframe_points.add(N_FRAMES)
        for f in range(N_FRAMES):
            kp = fc.keyframe_points[f]
            kp.co = (float(f), rest_hip[idx] + samples[f][1][idx])
            kp.interpolation = "LINEAR"
        fc.update()

    return act


def render_preview(arm, preview_dir):
    os.makedirs(preview_dir, exist_ok=True)
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.render.resolution_x = 512
    sc.render.resolution_y = 512
    sc.render.film_transparent = True
    sc.display.shading.light = "STUDIO"

    cam_data = bpy.data.cameras.new("PreviewCam")
    cam_obj = bpy.data.objects.new("PreviewCam", cam_data)
    sc.collection.objects.link(cam_obj)
    sc.camera = cam_obj

    # Vista lateral-tres cuartos para leer brazos, piernas, torso y pelo a la vez
    cam_obj.location = Vector((2.3, -2.3, 1.35))
    direction = Vector((0.0, 0.0, 0.95)) - cam_obj.location
    cam_obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()

    for idx, f in enumerate((0, 6, 12, 18, 24, 30)):
        sc.frame_set(f)
        bpy.context.view_layer.update()
        out_png = os.path.join(preview_dir, f"swim_f{f:02d}.png")
        sc.render.filepath = out_png
        bpy.ops.render.render(write_still=True)


def export_glb(arm, act, out_path):
    arm.animation_data.action = act
    sc = bpy.context.scene
    sc.frame_start = 0
    sc.frame_end = N_FRAMES - 1
    sc.render.fps = FPS
    arm.hide_set(False)
    arm.hide_viewport = False
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.export_scene.gltf(
        filepath=os.path.abspath(out_path),
        export_format="GLB",
        use_selection=True,
        export_animations=True,
        export_animation_mode="ACTIVE_ACTIONS",
        export_bake_animation=True,
        export_optimize_animation_size=False,
        export_apply=False,
    )
    print(f"[SwimClip] exportado {os.path.basename(out_path)} ({os.path.getsize(out_path)} bytes)")


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--out", default=OUT_GLB)
    p.add_argument("--preview-dir", default="")
    args = p.parse_args(argv)

    clear_scene()
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(RIGGED_GLB))
    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    act = build_swim_action(arm)

    if args.preview_dir:
        render_preview(arm, args.preview_dir)

    export_glb(arm, act, args.out)


if __name__ == "__main__":
    main()
