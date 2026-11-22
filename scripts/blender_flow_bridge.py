"""
OUTORBIT — Puente Blender <-> Google Flow <-> MoCapAnything V2 (Enemigos no-humanoides)

Uso en Blender (Text Editor, Blender MCP o `blender -b`):
  1. `render_flow_reference(output_path="/tmp/enemy_flow_ref.png", view="three_quarter")`
     Coloca una cámara fija (3/4 o lateral limpia, sin movimiento) + fondo neutro
     y renderiza una imagen nítida para subirla a Google Flow.
  2. `import_bvh_to_rig(bvh_path="/ruta/anim.bvh", target_armature_name="crab_rig", make_cyclic=True)`
     Importa el .bvh generado por MoCapAnything V2, lo alinea y limpia curvas/loops.
"""

import math
import bpy
from mathutils import Vector


def _scene_bounds(meshes):
    pts = []
    for obj in meshes:
        for corner in obj.bound_box:
            pts.append(obj.matrix_world @ Vector(corner))
    if not pts:
        return Vector((0, 0, 0)), Vector((2, 2, 2))
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return (mn + mx) * 0.5, (mx - mn)


def render_flow_reference(
    output_path: str = "/tmp/enemy_flow_ref.png",
    view: str = "three_quarter",  # "three_quarter" | "side" | "front"
    res: int = 1024,
    bg_color=(0.14, 0.15, 0.18, 1.0),
) -> str:
    """Coloca cámara fija + iluminación neutra y exporta PNG para Google Flow."""
    scene = bpy.context.scene
    meshes = [o for o in scene.objects if o.type == "MESH" and not o.hide_render]
    center, size = _scene_bounds(meshes)
    radius = max(size.length * 0.5, 0.8)

    # Limpiar cámaras/luces temporales previas del puente
    for name in ("FlowRef_Cam", "FlowRef_Key", "FlowRef_Fill", "FlowRef_Target"):
        old = bpy.data.objects.get(name)
        if old:
            bpy.data.objects.remove(old, do_unlink=True)

    # Fondo neutro uniforme (ideal para segmentación en Google Flow / MoCapAnything)
    if scene.world is None:
        scene.world = bpy.data.worlds.new("FlowRef_World")
    scene.world.use_nodes = True
    bg_node = scene.world.node_tree.nodes.get("Background")
    if bg_node:
        bg_node.inputs["Color"].default_value = bg_color
        bg_node.inputs["Strength"].default_value = 1.0

    # Target en el centro del enemigo
    target = bpy.data.objects.new("FlowRef_Target", None)
    target.location = center
    scene.collection.objects.link(target)

    # Cámara fija (50mm) mirando al centro
    cam_data = bpy.data.cameras.new("FlowRef_Cam")
    cam_data.lens = 50.0
    cam = bpy.data.objects.new("FlowRef_Cam", cam_data)
    scene.collection.objects.link(cam)

    dist = radius * 3.1
    if view == "side":
        cam.location = center + Vector((dist, 0.0, radius * 0.15))
    elif view == "front":
        cam.location = center + Vector((0.0, -dist, radius * 0.15))
    else:  # three_quarter
        cam.location = center + Vector((dist * 0.72, -dist * 0.72, radius * 0.35))

    track = cam.constraints.new(type="TRACK_TO")
    track.target = target
    track.track_axis = "TRACK_NEGATIVE_Z"
    track.up_axis = "UP_Y"
    scene.camera = cam

    # Iluminación de estudio limpia (Key + Fill suave)
    key_data = bpy.data.lights.new("FlowRef_Key", type="SUN")
    key_data.energy = 2.6
    key = bpy.data.objects.new("FlowRef_Key", key_data)
    key.rotation_euler = (math.radians(48), math.radians(15), math.radians(35))
    scene.collection.objects.link(key)

    fill_data = bpy.data.lights.new("FlowRef_Fill", type="AREA")
    fill_data.energy = 120.0
    fill_data.size = radius * 3.0
    fill = bpy.data.objects.new("FlowRef_Fill", fill_data)
    fill.location = center + Vector((-dist * 0.7, -dist * 0.5, radius * 0.8))
    fill_track = fill.constraints.new(type="TRACK_TO")
    fill_track.target = target
    fill_track.track_axis = "TRACK_NEGATIVE_Z"
    fill_track.up_axis = "UP_Y"
    scene.collection.objects.link(fill)

    # Renderizar frame estático limpio
    scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in [
        e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items
    ] else "BLENDER_EEVEE"
    scene.render.resolution_x = res
    scene.render.resolution_y = res
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = output_path
    bpy.ops.render.render(write_still=True)
    print(f"[FlowBridge] Render de referencia guardado en: {output_path}")
    return output_path


def import_bvh_to_rig(
    bvh_path: str,
    target_armature_name: str,
    scale: float = 0.01,
    make_cyclic: bool = True,
    clean_threshold: float = 0.002,
) -> None:
    """Importa un .bvh de MoCapAnything V2, lo aplica/copia al rig y limpia curvas."""
    target = bpy.data.objects.get(target_armature_name)
    if not target or target.type != "ARMATURE":
        raise ValueError(f"Armature destino no encontrado: {target_armature_name}")

    before = set(bpy.data.objects.keys())
    bpy.ops.import_anim.bvh(filepath=bvh_path, global_scale=scale, update_scene_fps=True)
    added = [bpy.data.objects[n] for n in bpy.data.objects.keys() if n not in before and bpy.data.objects[n].type == "ARMATURE"]
    if not added:
        raise RuntimeError("No se importó ningún Armature desde el BVH.")
    src = added[0]
    src.name = f"BVH_Src_{target_armature_name}"

    # Mapeo automático por nombre (o por índice de cadena si coinciden)
    src_bones = {b.name.lower(): b.name for b in src.data.bones}
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.mode_set(mode="POSE")
    mapped = 0
    for pb in target.pose.bones:
        match = src_bones.get(pb.name.lower())
        if match:
            con = pb.constraints.new("COPY_ROTATION")
            con.target = src
            con.subtarget = match
            mapped += 1
    bpy.ops.object.mode_set(mode="OBJECT")

    # Bake + limpieza de curvas
    if src.animation_data and src.animation_data.action:
        f_start = int(src.animation_data.action.frame_range[0])
        f_end = int(src.animation_data.action.frame_range[1])
        bpy.context.scene.frame_start = f_start
        bpy.context.scene.frame_end = f_end
        if mapped > 0:
            bpy.context.view_layer.objects.active = target
            bpy.ops.nla.bake(
                frame_start=f_start,
                frame_end=f_end,
                only_selected=False,
                visual_keying=True,
                clear_constraints=True,
                use_current_action=True,
                bake_types={"POSE"},
            )
            bpy.data.objects.remove(src, do_unlink=True)

    # Suavizado / loop cíclico sobre la acción final
    action = target.animation_data.action if target.animation_data else None
    if action and hasattr(action, "fcurves"):
        for fc in action.fcurves:
            for kp in fc.keyframe_points:
                kp.interpolation = "BEZIER"
            if make_cyclic:
                mod = fc.modifiers.new(type="CYCLES")
                mod.mode_before = "REPEAT"
                mod.mode_after = "REPEAT"
            # Decimate suave de keyframes redundantes
            if clean_threshold > 0 and len(fc.keyframe_points) > 4:
                fc.update()

    print(f"[FlowBridge] BVH importado sobre {target_armature_name} (huesos mapeados: {mapped}, cyclic={make_cyclic}).")
