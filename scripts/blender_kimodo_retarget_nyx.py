"""
OUTORBIT — Retargeting SOMA (NVIDIA Kimodo) -> Rig de 27 Huesos de NYX

Uso en Blender (Text Editor o Blender MCP):
  retarget_soma_to_nyx(
      source_armature_name="SOMA_Armature",
      target_armature_name="Armature",
      in_place=True,         # elimina desplazamiento XZ del Root/hips
      time_scale=1.0,        # < 1.0 acelera ataques (ej. 0.75), > 1.0 ralentiza
      bake_and_clean=True,
  )
"""

import bpy

# Mapeo SOMA (Kimodo) -> NYX (27 huesos exactos de nyxAnimator.ts)
# Se preservan intactos hair_1..4 y sleeve_L/R para física secundaria en Three.js.
SOMA_TO_NYX_BONE_MAP = {
    "Hips": "hips",
    "Spine": "spine",
    "Spine1": "spine",
    "Chest": "chest",
    "Spine2": "chest",
    "UpperChest": "chest",
    "Neck": "neck",
    "Head": "head",
    "LeftShoulder": "clavicle_L",
    "LeftArm": "upperArm_L",
    "LeftForeArm": "forearm_L",
    "LeftHand": "hand_L",
    "RightShoulder": "clavicle_R",
    "RightArm": "upperArm_R",
    "RightForeArm": "forearm_R",
    "RightHand": "hand_R",
    "LeftUpLeg": "thigh_L",
    "LeftLeg": "shin_L",
    "LeftFoot": "foot_L",
    "LeftToeBase": "toe_L",
    "RightUpLeg": "thigh_R",
    "RightLeg": "shin_R",
    "RightFoot": "foot_R",
    "RightToeBase": "toe_R",
}


def retarget_soma_to_nyx(
    source_armature_name: str,
    target_armature_name: str = "Armature",
    in_place: bool = True,
    time_scale: float = 1.0,
    bake_and_clean: bool = True,
) -> None:
    src = bpy.data.objects.get(source_armature_name)
    dst = bpy.data.objects.get(target_armature_name)
    if not src or src.type != "ARMATURE":
        raise ValueError(f"Rig SOMA origen no encontrado: {source_armature_name}")
    if not dst or dst.type != "ARMATURE":
        raise ValueError(f"Rig NYX destino no encontrado: {target_armature_name}")

    # Limpiar constraints previos en NYX
    bpy.context.view_layer.objects.active = dst
    bpy.ops.object.mode_set(mode="POSE")
    for pb in dst.pose.bones:
        for c in list(pb.constraints):
            pb.constraints.remove(c)

    # Construir mapa inverso prefiriendo coincidencia exacta prioritaria
    src_bone_names = {b.name for b in src.data.bones}
    nyx_to_soma = {}
    for soma_name, nyx_name in SOMA_TO_NYX_BONE_MAP.items():
        if soma_name in src_bone_names:
            nyx_to_soma[nyx_name] = soma_name

    mapped = 0
    for nyx_name, soma_name in nyx_to_soma.items():
        pb = dst.pose.bones.get(nyx_name)
        if not pb:
            continue
        con_rot = pb.constraints.new("COPY_ROTATION")
        con_rot.target = src
        con_rot.subtarget = soma_name
        con_rot.target_space = "WORLD"
        con_rot.owner_space = "WORLD"

        if nyx_name == "hips":
            con_loc = pb.constraints.new("COPY_LOCATION")
            con_loc.target = src
            con_loc.subtarget = soma_name
            con_loc.use_x = not in_place
            con_loc.use_y = not in_place
            con_loc.use_z = True  # conserva altura vertical (saltos/flotación)
        mapped += 1

    bpy.ops.object.mode_set(mode="OBJECT")

    # Determinar rango de frames
    f_start, f_end = 1, 60
    if src.animation_data and src.animation_data.action:
        f_start = int(src.animation_data.action.frame_range[0])
        f_end = int(src.animation_data.action.frame_range[1])

    if bake_and_clean:
        bpy.context.view_layer.objects.active = dst
        bpy.ops.nla.bake(
            frame_start=f_start,
            frame_end=f_end,
            only_selected=False,
            visual_keying=True,
            clear_constraints=True,
            use_current_action=True,
            bake_types={"POSE"},
        )

        # Ajustar timing (p.ej. acelerar frames de ataque con time_scale < 1.0)
        action = dst.animation_data.action if dst.animation_data else None
        if action and hasattr(action, "fcurves") and abs(time_scale - 1.0) > 1e-4:
            for fc in action.fcurves:
                for kp in fc.keyframe_points:
                    kp.co.x = f_start + (kp.co.x - f_start) * time_scale
                    kp.handle_left.x = f_start + (kp.handle_left.x - f_start) * time_scale
                    kp.handle_right.x = f_start + (kp.handle_right.x - f_start) * time_scale
                fc.update()
            f_end = int(round(f_start + (f_end - f_start) * time_scale))

    bpy.context.scene.frame_start = f_start
    bpy.context.scene.frame_end = f_end
    print(
        f"[KimodoRetarget] Retarget SOMA->NYX listo ({mapped} huesos, "
        f"in_place={in_place}, time_scale={time_scale}, frames={f_start}..{f_end})."
    )
