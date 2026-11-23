"""
OUTORBIT — Generador de loops `nyx_gravity_kick` y `nyx_spiral_drill_kick` en Blender.

Ambas acciones comparten exactamente la misma pose base de "lanza horizontal"
(cuerpo horizontal boca arriba, pies al frente, pierna derecha extendida en
punta de lanza, rodilla izquierda recogida, brazos en flecha atrás y cabeza
mirando al objetivo) para que el juego pueda transicionar de `gravity_kick` a
`spiral_drill_kick` en pleno vuelo sin saltos.

  1. `nyx_gravity_kick` (frames 0..24 @ 30 fps = 0.80 s, BUCLE):
     Pose de lanza con turbulencia/vibración de alta velocidad en cuerpo,
     brazos, pelo y mangas (frame 0 == frame 24).
  2. `nyx_spiral_drill_kick` (frames 0..15 @ 30 fps = 0.50 s, BUCLE):
     Misma pose de lanza + giro longitudinal continuo de 360° (2*pi en `hips.y`)
     sin arranque ni parada (frame 0 == frame 15 mod 2*pi).
"""

import math
import os
import bpy
from mathutils import Euler, Quaternion, Vector

FPS = 30

BONES = [
    "hips", "spine", "chest", "neck", "head",
    "clavicle_L", "clavicle_R",
    "upperArm_L", "forearm_L", "hand_L", "sleeve_L",
    "upperArm_R", "forearm_R", "hand_R", "sleeve_R",
    "hair_1", "hair_2", "hair_3", "hair_4",
    "thigh_L", "shin_L", "foot_L", "toe_L",
    "thigh_R", "shin_R", "foot_R", "toe_R",
]


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


def _apply_frame(arm, frame: int, rots: dict, hips_loc: tuple, hips_quat=None):
    pb_hips = arm.pose.bones["hips"]
    pb_hips.location = Vector(hips_loc)
    pb_hips.keyframe_insert(data_path="location", frame=frame)
    for bname in BONES:
        pb = arm.pose.bones[bname]
        if bname == "hips" and hips_quat is not None:
            pb.rotation_mode = "QUATERNION"
            pb.rotation_quaternion = hips_quat
            pb.keyframe_insert(data_path="rotation_quaternion", frame=frame)
        else:
            pb.rotation_mode = "XYZ"
            pb.rotation_euler = Euler(rots.get(bname, (0.0, 0.0, 0.0)), "XYZ")
            pb.keyframe_insert(data_path="rotation_euler", frame=frame)


def _base_lance_pose(phase: float, spin_y: float = 0.0, is_drill: bool = False):
    """Pose base compartida en bucle perfecto (phase in [0, 1])."""
    tau = 2.0 * math.pi * phase
    # Armónicos periódicos (frecuencias enteras sobre 2*pi -> frame 0 == frame N)
    vib1 = math.sin(tau * 3.0)
    vib2 = math.cos(tau * 2.0)
    vib3 = math.sin(tau * 4.0 + 0.7)
    flutter = math.sin(tau * 2.0 + 0.4)

    amp = 1.0 if not is_drill else 0.75
    hips_loc = (
        0.008 * vib2 * amp,
        0.02 + 0.012 * vib1 * amp,
        0.16 + 0.010 * vib3 * amp,
    )

    rots = {
        # Cuerpo horizontal boca arriba, pies al frente (-1.46 rad en X)
        "hips": (-1.46 + 0.025 * vib2 * amp, spin_y, 0.035 * vib1 * amp),
        "spine": (-0.08 + 0.020 * vib1 * amp, 0.0, 0.020 * vib2 * amp),
        "chest": (-0.06 + 0.018 * vib3 * amp, -0.06 + 0.015 * vib2 * amp, 0.0),
        "neck": (0.08, 0.0, 0.0),
        # Cabeza levantada mirando al frente por encima de la bota derecha
        "head": (0.56 + 0.025 * vib2 * amp, 0.03 * vib1 * amp, 0.0),
        "clavicle_L": (0.06, 0.16, -0.06),
        "clavicle_R": (0.06, -0.16, 0.06),
        # Brazos atrás en flecha aerodinámica con ligera asimetría y vibración de aire
        "upperArm_L": (-0.04 + 0.045 * vib1 * amp, 0.12, 1.12 + 0.035 * flutter * amp),
        "forearm_L": (0.0, -0.08 + 0.03 * vib3 * amp, 0.04),
        "hand_L": (-0.52, 0.0, 0.0),
        "upperArm_R": (-0.04 - 0.045 * vib1 * amp, -0.12, -1.08 - 0.035 * flutter * amp),
        "forearm_R": (0.0, 0.08 - 0.03 * vib3 * amp, -0.04),
        "hand_R": (-0.52, 0.0, 0.0),
        # Pierna derecha: punta de lanza totalmente extendida
        "thigh_R": (-0.03 + 0.012 * vib2 * amp, 0.0, 0.06),
        "shin_R": (0.05 + 0.018 * vib3 * amp, 0.0, 0.0),
        "foot_R": (-0.85, 0.0, 0.0),
        "toe_R": (-0.45, 0.0, 0.0),
        # Pierna izquierda: rodilla recogida/levantada con ligera vibración
        "thigh_L": (-1.02 + 0.025 * vib1 * amp, 0.05, 0.14),
        "shin_L": (1.85 + 0.030 * vib2 * amp, 0.0, 0.0),
        "foot_L": (-0.32, 0.0, 0.04),
        "toe_L": (-0.20, 0.0, 0.0),
        # Pelo y mangas: estela recta hacia atrás con ondeo rápido de viento
        "hair_1": (0.35 + 0.07 * vib1, 0.06 * vib2 + (0.14 if is_drill else 0.0), 0.0),
        "hair_2": (0.28 + 0.09 * vib3, 0.08 * flutter + (0.12 if is_drill else 0.0), 0.0),
        "hair_3": (0.22 + 0.11 * flutter, 0.09 * vib1 + (0.10 if is_drill else 0.0), 0.0),
        "hair_4": (0.16 + 0.12 * vib2, 0.10 * vib3, 0.0),
        "sleeve_L": (0.24 + 0.08 * vib1, 0.06 * flutter, 0.0),
        "sleeve_R": (0.24 + 0.08 * vib2, -0.06 * flutter, 0.0),
    }
    return rots, hips_loc


def build_gravity_kick(arm):
    """Patada gravitatoria normal en bucle continuo (0..24 @ 30 fps = 0.80 s)."""
    _prepare_action(arm, "nyx_gravity_kick")
    total_frames = 24
    for frame in range(0, total_frames + 1):
        phase = frame / float(total_frames)
        rots, hips_loc = _base_lance_pose(phase, spin_y=0.0, is_drill=False)
        _apply_frame(arm, frame, rots, hips_loc)


def build_spiral_drill_kick(arm):
    """Patada taladro en bucle continuo con giro de 360° sobre su eje longitudinal (0..15 @ 30 fps = 0.50 s)."""
    _prepare_action(arm, "nyx_spiral_drill_kick")
    total_frames = 15
    prev_q = None
    for frame in range(0, total_frames + 1):
        phase = frame / float(total_frames)
        # Giro lineal continuo 0 -> 2*pi sobre el eje longitudinal del cuerpo (taladro)
        spin_y = 2.0 * math.pi * phase
        rots, hips_loc = _base_lance_pose(phase, spin_y=0.0, is_drill=True)
        hx, _, hz = rots["hips"]
        # Primero inclinamos horizontal (X, Z) y luego giramos sobre el eje longitudinal local (Y)
        tilt_q = Euler((hx, 0.0, hz), "XYZ").to_quaternion()
        spin_q = Quaternion(Vector((0.0, 1.0, 0.0)), spin_y)
        q = tilt_q @ spin_q
        if prev_q is not None and q.dot(prev_q) < 0.0:
            q = -q
        prev_q = q.copy()
        _apply_frame(arm, frame, rots, hips_loc, hips_quat=q)


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

    build_gravity_kick(arm)
    build_spiral_drill_kick(arm)

    models_dir = "/home/pakura/Proyectos/OUTORBIT/public/models"
    bpy.context.scene.render.fps = FPS
    export_clip(arm, "nyx_gravity_kick", 24, os.path.join(models_dir, "nyx_gravity_kick.glb"))
    export_clip(arm, "nyx_spiral_drill_kick", 15, os.path.join(models_dir, "nyx_spiral_drill_kick.glb"))

    # Dejar activa nyx_spiral_drill_kick en el timeline para revisión inmediata
    arm.animation_data.action = bpy.data.actions["nyx_spiral_drill_kick"]
    bpy.context.scene.frame_start = 0
    bpy.context.scene.frame_end = 15
    bpy.context.scene.frame_set(0)
    print("Creadas y exportadas 'nyx_gravity_kick.glb' (0..24) y 'nyx_spiral_drill_kick.glb' (0..15).")


if __name__ == "__main__":
    main()
