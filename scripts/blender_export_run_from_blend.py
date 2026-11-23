"""Exporta a GLB la accion de carrera que este abierta en el .blend.

Pensado para el ciclo de retoque a mano: abres `nyx_animaciones.blend`, mueves
los huesos en la accion `rw_walk_loop`, guardas y lanzas esto. Solo exporta el
armature, igual que los clips de caminar: la malla la pone `nyx_rigged.glb` en
el juego.

Uso:
    blender -b animaciones_generadas/nyx_animaciones.blend \
        --python scripts/blender_export_run_from_blend.py -- \
        --out public/models/nyx_run_loop.glb
"""

import argparse
import os
import sys

import bpy

NYX = "nyx_armature"


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--out", default="public/models/nyx_run_loop.glb")
    p.add_argument("--action", default="", help="nombre de la accion (def. la activa)")
    return p.parse_args(argv)


def main():
    args = parse_args()
    arm = bpy.data.objects[NYX]
    act = arm.animation_data.action if arm.animation_data else None
    if args.action:
        act = bpy.data.actions.get(args.action)
    if act is None:
        raise RuntimeError("no hay accion activa en nyx_armature")

    arm.animation_data.action = act
    f0, f1 = (int(x) for x in act.frame_range)
    sc = bpy.context.scene
    sc.frame_start, sc.frame_end = f0, f1

    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.export_scene.gltf(
        filepath=os.path.abspath(args.out),
        export_format="GLB",
        use_selection=True,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_bake_animation=True,
        export_optimize_animation_size=True,
        export_apply=False,
    )
    print(f"[ExportRun] {act.name}: frames {f0}..{f1} -> {args.out} "
          f"({os.path.getsize(args.out)} bytes)")


main()
