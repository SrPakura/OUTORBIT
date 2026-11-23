"""
OUTORBIT — Generador de animaciones `nyx_kick_flip` y `nyx_kick_flip_drill` en Blender.

Crea dos acciones sobre `nyx_armature`:
  1. `nyx_kick_flip` (frames 0..26 @ 30 fps = 0.87 s):
     Rebote aéreo tras `gravity_kick` con anticipación, voltereta trasera
     asimétrica con movimiento secundario de pelo/mangas y apertura suave a
     la pose exacta de `zero_g_float`.
  2. `nyx_kick_flip_drill` (frames 0..38 @ 30 fps = 1.27 s):
     Rebote de alta inercia tras `spiral_drill_kick`: 1er flip ultra-rápido
     en posición fetal cerrada (-360°) + 2º flip de recuperación más abierto
     (-360° -> -720°) terminando en la pose exacta de `zero_g_float`.
"""

import math
import os
import bpy
from mathutils import Euler, Vector

FPS = 30

# Pose exacta del frame 0 de `public/models/nyx_zero_g_float.glb`
ZERO_G_POSE = {
    "hips":       {"rot": (-0.1336, -0.0003, -0.0048), "loc": (0.0, 0.1106, 0.0)},
    "spine":      {"rot": (0.2768, 0.0040, -0.0159)},
    "chest":      {"rot": (-0.1318, 0.0003, 0.0124)},
    "neck":       {"rot": (0.2936, -0.0005, 0.0124)},
    "head":       {"rot": (-0.3953, 0.0026, 0.0051)},
    "clavicle_L": {"rot": (0.0, 0.0, 0.0)},
    "clavicle_R": {"rot": (0.0, 0.0, 0.0)},
    "upperArm_L": {"rot": (0.0794, -0.1427, -1.1231)},
    "forearm_L":  {"rot": (0.0954, -0.1494, -0.0198)},
    "hand_L":     {"rot": (-0.1365, 0.2571, 0.0680)},
    "sleeve_L":   {"rot": (0.1567, 0.0, 0.0)},
    "upperArm_R": {"rot": (0.0750, 0.1375, 1.1291)},
    "forearm_R":  {"rot": (0.1115, 0.1760, 0.0179)},
    "hand_R":     {"rot": (-0.1251, -0.2372, -0.0579)},
    "sleeve_R":   {"rot": (0.1567, 0.0, 0.0)},
    "hair_1":     {"rot": (0.2439, 0.0, 0.0)},
    "hair_2":     {"rot": (0.1219, 0.0, 0.0)},
    "hair_3":     {"rot": (0.0813, 0.0, 0.0)},
    "hair_4":     {"rot": (0.0610, 0.0, 0.0)},
    "thigh_L":    {"rot": (0.1848, -0.0061, 0.0409)},
    "shin_L":     {"rot": (0.1720, 0.1278, -0.0159)},
    "foot_L":     {"rot": (0.6839, -0.0657, 0.0416)},
    "toe_L":      {"rot": (-0.9218, 0.0228, -0.0561)},
    "thigh_R":    {"rot": (-0.0842, -0.0005, 0.0122)},
    "shin_R":     {"rot": (0.1609, -0.0791, 0.0010)},
    "foot_R":     {"rot": (0.2502, 0.0295, -0.0458)},
    "toe_R":      {"rot": (-0.7177, 1.3617, -0.2045)},
}

ALL_BONES = list(ZERO_G_POSE.keys())


def clamp(v: float, lo: float, hi: float) -> float:
    return lo if v < lo else (hi if v > hi else v)


def mix(a: float, b: float, k: float) -> float:
    return a + (b - a) * k


def mix3(a, b, k: float):
    return (mix(a[0], b[0], k), mix(a[1], b[1], k), mix(a[2], b[2], k))


def smooth(a: float, b: float, v: float) -> float:
    t = clamp((v - a) / (b - a), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def smoother(a: float, b: float, v: float) -> float:
    t = clamp((v - a) / (b - a), 0.0, 1.0)
    return t * t * t * (t * (t * 6.0 - 15.0) + 10.0)


def _prepare_action(arm, action_name: str):
    if action_name in bpy.data.actions:
        bpy.data.actions.remove(bpy.data.actions[action_name])
    action = bpy.data.actions.new(name=action_name)
    if not arm.animation_data:
        arm.animation_data_create()
    arm.animation_data.action = action
    for pb in arm.pose.bones:
        pb.rotation_mode = "XYZ"
        pb.rotation_euler = Euler((0.0, 0.0, 0.0), "XYZ")
        pb.location = Vector((0.0, 0.0, 0.0))
    return action


def _apply_frame(arm, frame: int, rots: dict, hips_loc: tuple):
    pb_hips = arm.pose.bones["hips"]
    pb_hips.location = Vector(hips_loc)
    pb_hips.keyframe_insert(data_path="location", frame=frame)
    for bname in ALL_BONES:
        pb = arm.pose.bones[bname]
        pb.rotation_euler = Euler(rots.get(bname, (0.0, 0.0, 0.0)), "XYZ")
        pb.keyframe_insert(data_path="rotation_euler", frame=frame)


def build_kick_flip(arm):
    """1. Kick flip normal: mismo estilo fluido y abierto del 2º flip -> zero_g_float."""
    _prepare_action(arm, "nyx_kick_flip")
    total_frames = 26
    dur = total_frames / float(FPS)  # ~0.87 s

    for frame in range(0, total_frames + 1):
        t = frame / float(FPS)
        p = t / dur

        # Curva continua de giro (-2*pi + zero_g_hips.x) con arranque vivo y desaceleración suave
        ease_in = smooth(0.0, 0.05, t)
        spin_u = (1.0 - (1.0 - p) ** 1.85) * (0.18 + 0.82 * ease_in)
        zg_hips = ZERO_G_POSE["hips"]["rot"]
        flip_x = (-2.0 * math.pi + zg_hips[0]) * spin_u

        # Fases:
        #   open_flip (0..0.68 s): recogida abierta y asimétrica (estilo 2º flip del drill)
        #   open_zg   (0.45..0.87 s): transición natural a zero_g_float
        open_flip = smooth(0.0, 0.14, t) * (1.0 - smooth(0.45, 0.74, t))
        open_zg = smoother(0.46, dur, t)

        arc = math.sin(clamp(p ** 0.85, 0.0, 1.0) * math.pi)
        hips_loc = (
            0.0,
            mix(0.04 + 0.24 * arc, ZERO_G_POSE["hips"]["loc"][1], open_zg),
            mix(-0.22 * arc, ZERO_G_POSE["hips"]["loc"][2], open_zg),
        )

        wob_y = math.sin(p * math.pi) * 0.07 * (1.0 - open_zg)
        roll_z = math.sin(p * math.pi * 2.0) * 0.04 * (1.0 - open_zg)
        spin_vel = open_flip * 0.75

        flip_pose = {
            "hips": (flip_x, mix(wob_y, zg_hips[1], open_zg), mix(roll_z, zg_hips[2], open_zg)),
            "spine": (0.18 * open_flip, 0.02 * open_flip, 0.0),
            "chest": (0.12 * open_flip, -0.06 * open_flip, 0.0),
            "neck": (0.09 * open_flip, 0.0, 0.0),
            "head": (0.20 * open_flip, 0.0, 0.0),
            "clavicle_L": (0.02 * open_flip, -0.05 * open_flip, 0.07 * open_flip),
            "clavicle_R": (0.02 * open_flip, 0.05 * open_flip, -0.07 * open_flip),
            # Brazos fluidos y ligeramente abiertos
            "upperArm_L": (0.18 * open_flip, -0.24 * open_flip, -0.88 * open_flip),
            "forearm_L": (0.08 * open_flip, -0.45 * open_flip, -0.10),
            "hand_L": (-0.10 * open_flip, 0.12 * open_flip, 0.05),
            "upperArm_R": (0.16 * open_flip, 0.22 * open_flip, 0.88 * open_flip),
            "forearm_R": (0.08 * open_flip, 0.40 * open_flip, 0.10),
            "hand_R": (-0.10 * open_flip, -0.12 * open_flip, -0.05),
            # Piernas semi-abiertas y asimétricas (sin posición fetal)
            "thigh_L": (-0.60 * open_flip, 0.04 * open_flip, 0.06),
            "shin_L": (0.85 * open_flip, 0.0, 0.0),
            "foot_L": (-0.26 * open_flip, 0.0, 0.03),
            "toe_L": (-0.16 * open_flip, 0.0, 0.0),
            "thigh_R": (-0.80 * open_flip, -0.04 * open_flip, -0.06),
            "shin_R": (1.08 * open_flip, 0.0, 0.0),
            "foot_R": (-0.32 * open_flip, 0.0, -0.03),
            "toe_R": (-0.20 * open_flip, 0.0, 0.0),
            # Pelo y mangas: estela suave
            "hair_1": (-0.36 * spin_vel, 0.06 * math.sin(p * math.pi), 0.0),
            "hair_2": (-0.28 * spin_vel, 0.05 * math.sin(p * math.pi), 0.0),
            "hair_3": (-0.22 * spin_vel, 0.03 * math.sin(p * math.pi), 0.0),
            "hair_4": (-0.16 * spin_vel, 0.0, 0.0),
            "sleeve_L": (-0.25 * spin_vel, 0.0, 0.0),
            "sleeve_R": (-0.25 * spin_vel, 0.0, 0.0),
        }

        rots = {}
        for b in ALL_BONES:
            if b == "hips":
                rots[b] = flip_pose[b]
            else:
                rots[b] = mix3(flip_pose[b], ZERO_G_POSE[b]["rot"], open_zg)

        _apply_frame(arm, frame, rots, hips_loc)


def build_kick_flip_drill(arm):
    """2. Kick flip drill: 1er flip fetal ultra-rápido + 2º flip abierto y más lento -> zero_g_float."""
    _prepare_action(arm, "nyx_kick_flip_drill")
    total_frames = 40
    dur = total_frames / float(FPS)  # ~1.33 s

    for frame in range(0, total_frames + 1):
        t = frame / float(FPS)
        p = t / dur

        # Curva continua de giro (-4*pi + zero_g_hips.x) SIN pausa entre el 1er y 2º flip:
        # 1 - (1 - p)^2.15 arranca muy rápido (1er flip ~0..0.42 s, u=0.5 en p≈0.28 -> ~0.37 s)
        # y desacelera de forma continua durante un 2º flip más largo y lento (0.37..1.33 s).
        # Aplicamos un suave ease-in solo en los primeros ~0.04 s para evitar tirón inicial.
        ease_in = smooth(0.0, 0.05, t)
        spin_u = (1.0 - (1.0 - p) ** 2.15) * (0.15 + 0.85 * ease_in)
        zg_hips = ZERO_G_POSE["hips"]["rot"]
        flip_x = (-4.0 * math.pi + zg_hips[0]) * spin_u

        # Fases solapadas y continuas (sin cortes):
        #   fetal    (0..0.44 s): bola fetal muy cerrada en el 1er flip
        #   open_2nd (0.32..1.05 s): 2º flip mucho más abierto y fluido
        #   open_zg  (0.78..1.33 s): transición natural a zero_g_float
        fetal = smooth(0.0, 0.08, t) * (1.0 - smooth(0.28, 0.56, t))
        open_2nd = smooth(0.26, 0.52, t) * (1.0 - smooth(0.84, 1.18, t))
        open_zg = smoother(0.76, dur, t)

        # Leve balanceo residual del taladro que se disipa suavemente
        drill_twist = 0.09 * math.sin(p * math.pi * 1.5) * (1.0 - smooth(0.35, 0.90, t))
        roll_z = 0.04 * math.sin(p * math.pi * 2.0) * (1.0 - open_zg)

        # Arco único continuo (sin doble rebote entre flips)
        arc = math.sin(clamp(p ** 0.78, 0.0, 1.0) * math.pi)
        hips_loc = (
            0.0,
            mix(0.06 + 0.34 * arc, ZERO_G_POSE["hips"]["loc"][1], open_zg),
            mix(-0.30 * arc, ZERO_G_POSE["hips"]["loc"][2], open_zg),
        )

        spin_vel = fetal * 1.45 + open_2nd * 0.45

        flip_pose = {
            "hips": (flip_x, mix(drill_twist, zg_hips[1], open_zg), mix(roll_z, zg_hips[2], open_zg)),
            "spine": (0.58 * fetal + 0.16 * open_2nd, 0.03 * fetal, 0.0),
            "chest": (0.52 * fetal + 0.10 * open_2nd, -0.05 * open_2nd, 0.0),
            "neck": (0.25 * fetal + 0.08 * open_2nd, 0.0, 0.0),
            "head": (0.62 * fetal + 0.18 * open_2nd, 0.0, 0.0),
            "clavicle_L": (0.08 * fetal, -0.22 * fetal - 0.04 * open_2nd, 0.25 * fetal + 0.06 * open_2nd),
            "clavicle_R": (0.08 * fetal, 0.22 * fetal + 0.04 * open_2nd, -0.25 * fetal - 0.06 * open_2nd),
            # Brazos: abrazando en fetal -> abriéndose con gracia en el 2º flip hacia fuera
            "upperArm_L": (
                0.85 * fetal + 0.16 * open_2nd,
                -0.88 * fetal - 0.22 * open_2nd,
                -1.22 * fetal - 0.85 * open_2nd,
            ),
            "forearm_L": (0.18 * fetal + 0.08 * open_2nd, -1.72 * fetal - 0.42 * open_2nd, -0.10),
            "hand_L": (-0.32 * fetal - 0.10 * open_2nd, 0.20 * fetal + 0.12 * open_2nd, 0.05),
            "upperArm_R": (
                0.82 * fetal + 0.14 * open_2nd,
                0.84 * fetal + 0.20 * open_2nd,
                1.22 * fetal + 0.85 * open_2nd,
            ),
            "forearm_R": (0.18 * fetal + 0.08 * open_2nd, 1.68 * fetal + 0.38 * open_2nd, 0.10),
            "hand_R": (-0.32 * fetal - 0.10 * open_2nd, -0.20 * fetal - 0.12 * open_2nd, -0.05),
            # Piernas: bola fetal cerrada en el 1º -> semi-abiertas y asimétricas en el 2º
            "thigh_L": (-2.05 * fetal - 0.58 * open_2nd, 0.04 * fetal, 0.06),
            "shin_L": (2.45 * fetal + 0.82 * open_2nd, 0.0, 0.0),
            "foot_L": (-0.65 * fetal - 0.25 * open_2nd, 0.0, 0.03),
            "toe_L": (-0.42 * fetal - 0.15 * open_2nd, 0.0, 0.0),
            "thigh_R": (-2.08 * fetal - 0.78 * open_2nd, -0.04 * fetal, -0.06),
            "shin_R": (2.48 * fetal + 1.05 * open_2nd, 0.0, 0.0),
            "foot_R": (-0.68 * fetal - 0.30 * open_2nd, 0.0, -0.03),
            "toe_R": (-0.44 * fetal - 0.18 * open_2nd, 0.0, 0.0),
            # Pelo y mangas: fuerte fuerza centrífuga en el giro fetal, suavizándose en el 2º
            "hair_1": (-0.42 * spin_vel, 0.08 * math.sin(p * math.pi * 2.0), 0.0),
            "hair_2": (-0.34 * spin_vel, 0.06 * math.sin(p * math.pi * 2.0), 0.0),
            "hair_3": (-0.26 * spin_vel, 0.04 * math.sin(p * math.pi * 2.0), 0.0),
            "hair_4": (-0.20 * spin_vel, 0.0, 0.0),
            "sleeve_L": (-0.30 * spin_vel, 0.0, 0.0),
            "sleeve_R": (-0.30 * spin_vel, 0.0, 0.0),
        }

        rots = {}
        for b in ALL_BONES:
            if b == "hips":
                rots[b] = flip_pose[b]
            else:
                rots[b] = mix3(flip_pose[b], ZERO_G_POSE[b]["rot"], open_zg)

        _apply_frame(arm, frame, rots, hips_loc)


def export_clip(arm, action_name: str, frame_end: int, out_path: str):
    scene = bpy.context.scene
    arm.animation_data.action = bpy.data.actions[action_name]
    scene.frame_start = 0
    scene.frame_end = frame_end
    scene.frame_set(0)

    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm

    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
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
    print(f"Exportado {out_path} ({os.path.getsize(out_path)} bytes)")


def main():
    arm = bpy.data.objects.get("nyx_armature")
    if not arm:
        raise RuntimeError("No se encontró 'nyx_armature' en la escena.")
    build_kick_flip(arm)
    build_kick_flip_drill(arm)

    models_dir = "/home/pakura/Proyectos/OUTORBIT/public/models"
    bpy.context.scene.render.fps = FPS
    export_clip(arm, "nyx_kick_flip", 26, os.path.join(models_dir, "nyx_kick_flip.glb"))
    export_clip(arm, "nyx_kick_flip_drill", 40, os.path.join(models_dir, "nyx_kick_flip_drill.glb"))

    # Dejar activa nyx_kick_flip_drill en el timeline
    arm.animation_data.action = bpy.data.actions["nyx_kick_flip_drill"]
    bpy.context.scene.frame_start = 0
    bpy.context.scene.frame_end = 40
    bpy.context.scene.frame_set(0)


if __name__ == "__main__":
    main()
