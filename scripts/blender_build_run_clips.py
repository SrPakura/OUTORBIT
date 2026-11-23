"""Construye desde cero los tres clips de carrera de NYX.

    nyx_run_start.glb   arranque   (LoopOnce)
    nyx_run_loop.glb    bucle      (LoopRepeat)
    nyx_run_end.glb     frenada    (LoopOnce)

El clip de carrera anterior (`nyx_correr*`) salia de acelerar el caminar 1,7x y
sintetizar el braceo: los brazos acababan cruzados delante del pecho y las
piernas apenas se separaban. Aqui el ciclo se escribe de cero con mecanica de
carrera de verdad:

  * apoyo del 35% del ciclo por pie y **fase de vuelo** entre apoyos (en el
    caminar nunca hay vuelo, por eso acelerarlo no daba una carrera);
  * rodilla con 115 grados de flexion en el recobro (talon al gluteo);
  * braceo de +-32 grados con codo a 80-88 grados, en fase con la pierna
    contraria;
  * inclinacion del torso de 14 grados repartida entre cadera, columna y pecho,
    con la cabeza contrarrotando para no perder la mirada;
  * cadera y hombros girando en contrafase (7 y 9 grados).

La altura de la cadera no se inventa: para cada frame se mide el punto mas bajo
de la malla skinneada con la cadera a cero y se sube justo eso, de modo que la
suela toca Z=0. En la fase de vuelo se suma un arco de 5 cm para que el cuerpo
despegue. Asi no hay ni pies hundidos ni flotando.

Uso:
    blender -b animaciones_generadas/nyx_animaciones.blend \
        --python scripts/blender_build_run_clips.py -- \
        --out public/models --preview animaciones_generadas/previews
"""

import argparse
import math
import os
import sys

import bpy
from mathutils import Quaternion, Vector

ARM_NAME = "nyx_armature"
BODY_NAME = "nyx_body"
FPS = 30

# Un ciclo completo (dos pasos) en 20 frames = 0,667 s = 3 pasos/s. Es cadencia
# de carrera y, a 7,4 m/s, deja una zancada de 2,47 m por paso: casi sin
# deslizamiento de pies.
LOOP_FRAMES = 20

# Reparto del ciclo: apoyo izquierdo 0..0.35, vuelo 0.35..0.50, apoyo derecho
# 0.50..0.85, vuelo 0.85..1.00.
STANCE_END = 0.35
FLIGHT_LIFT = 0.05

# --- Curvas del ciclo (fase 0 = contacto del pie izquierdo) -----------------
# Angulos sagitales absolutos en grados: 0 = colgando recto, + = adelante.
THIGH_KEYS = [(0.00, 28), (0.08, 14), (0.18, -4), (0.28, -22), (0.35, -32),
              (0.45, -24), (0.55, 0), (0.70, 26), (0.85, 38), (0.95, 40)]
SHIN_KEYS = [(0.00, 6), (0.08, -22), (0.18, -38), (0.28, -28), (0.35, -48),
             (0.45, -98), (0.55, -115), (0.70, -80), (0.85, -40), (0.95, -8)]
# Tobillo relativo a la espinilla: 71,6 es la posicion de reposo del pie.
ANKLE_KEYS = [(0.00, 70), (0.08, 88), (0.18, 90), (0.28, 70), (0.35, 42),
              (0.45, 75), (0.55, 88), (0.70, 85), (0.85, 80), (0.95, 74)]

# Postura de pie: la del primer frame del caminar aprobado.
STAND = dict(thigh=-4.0, shin=-6.0, ankle=77.0,
             arm=-3.0, elbow=24.0, splay=11.0,
             spine=0.0, chest=2.0, neck=-2.0, head=0.0)

# Braceo. Los brazos de Nyx son cortos (0,44 m del hombro a la muneca) y el
# hombro queda 0,52 m por encima de la cadera, asi que con el codo a 90 grados
# la mano no llega a la cadera: se queda a la altura del pecho. Con el codo a
# 60-76 grados la mano recorre cadera -> pecho, que es el arco que se lee.
ARM_SWING = 32.0
ELBOW_BASE = 45.0
ELBOW_SWING = 35.0

LEAN_SPINE = 6.0
LEAN_CHEST = 5.0
LEAN_HIPS = 3.0
LEAN_NECK = -4.0
LEAN_HEAD = -5.0

TWIST_HIPS = 7.0
TWIST_SPINE = 3.0
TWIST_CHEST = 9.0
TWIST_HEAD = -4.0
SIDE_HIPS = 4.0

HAIR_TRAIL = (4.0, 6.0, 8.0, 10.0)
HAIR_AMP = (1.5, 2.5, 3.5, 4.5)


# --- Interpolacion ----------------------------------------------------------

def catmull(keys, p, periodic):
    """Catmull-Rom sobre `keys` [(fase, valor)]."""
    n = len(keys)
    if periodic:
        p = p % 1.0
    else:
        p = min(max(p, keys[0][0]), keys[-1][0])
    if periodic:
        ext = ([(keys[-1][0] - 1.0, keys[-1][1])] + list(keys)
               + [(keys[0][0] + 1.0, keys[0][1]),
                  (keys[1][0] + 1.0, keys[1][1])])
    else:
        ext = ([(keys[0][0] - 1.0, keys[0][1])] + list(keys)
               + [(keys[-1][0] + 1.0, keys[-1][1])])
    i = 1
    for k in range(1, len(ext) - 2):
        if ext[k][0] <= p <= ext[k + 1][0]:
            i = k
            break
    p0, v0 = ext[i - 1]
    p1, v1 = ext[i]
    p2, v2 = ext[i + 1]
    p3, v3 = ext[i + 2]
    span = p2 - p1
    if span <= 1e-9:
        return v1
    t = (p - p1) / span
    m1 = (v2 - v0) / (p2 - p0) * span
    m2 = (v3 - v1) / (p3 - p1) * span
    t2 = t * t
    t3 = t2 * t
    return ((2 * t3 - 3 * t2 + 1) * v1 + (t3 - 2 * t2 + t) * m1
            + (-2 * t3 + 3 * t2) * v2 + (t3 - t2) * m2)


# --- Rig --------------------------------------------------------------------

class Rig:
    def __init__(self, arm):
        self.arm = arm
        self.rest = {}
        self.parent = {}
        self.order = []
        self.anat = {}
        for b in arm.data.bones:
            self.rest[b.name] = b.matrix_local.to_quaternion()
            self.parent[b.name] = b.parent.name if b.parent else None

        def walk(bone):
            self.order.append(bone.name)
            for c in bone.children:
                walk(c)

        for r in [b for b in arm.data.bones if b.parent is None]:
            walk(r)

        for b in arm.data.bones:
            if b.children:
                d = b.children[0].head_local - b.head_local
            else:
                d = b.tail_local - b.head_local
            if d.length < 1e-6:
                d = Vector((0.0, 0.0, 1.0))
            self.anat[b.name] = d.normalized()

    def limb_world(self, name, sag, splay, side):
        s = math.radians(sag)
        f = math.radians(splay)
        d = Vector((side * math.sin(f),
                    -math.sin(s) * math.cos(f),
                    -math.cos(s) * math.cos(f)))
        return self.anat[name].rotation_difference(d) @ self.rest[name]

    def torso_world(self, name, lean, twist, side):
        return (Quaternion((0.0, 0.0, 1.0), math.radians(twist))
                @ Quaternion((1.0, 0.0, 0.0), math.radians(lean))
                @ Quaternion((0.0, 1.0, 0.0), math.radians(side))
                @ self.rest[name])

    def apply(self, world, hips_offset):
        for name in self.order:
            pn = self.parent[name]
            wq = world[name]
            if pn is not None:
                local = (world[pn] @ self.rest[pn].inverted()
                         @ self.rest[name]).inverted() @ wq
            else:
                local = self.rest[name].inverted() @ wq
            pb = self.arm.pose.bones[name]
            pb.rotation_quaternion = local
            if name == "hips":
                pb.location = self.rest[name].inverted() @ hips_offset


# --- Pose -------------------------------------------------------------------

def run_pose(p, stride, lean):
    """Pose completa del ciclo de carrera en la fase `p`."""
    c = math.cos(2.0 * math.pi * p)
    s = math.sin(2.0 * math.pi * p)

    def leg(ph):
        th = catmull(THIGH_KEYS, ph, True)
        sh = catmull(SHIN_KEYS, ph, True)
        an = catmull(ANKLE_KEYS, ph, True)
        return (STAND["thigh"] + stride * (th - STAND["thigh"]),
                STAND["shin"] + stride * (sh - STAND["shin"]),
                STAND["ankle"] + stride * (an - STAND["ankle"]))

    def arm(ph):
        cc = math.cos(2.0 * math.pi * ph)
        a = -ARM_SWING * cc
        # El codo se abre (menos flexion) cuando el brazo va atras, para que la
        # mano pase por detras de la cadera, y se cierra al venir al frente. Al
        # reves la mano nunca rebasa la cadera y parece que lleva una bandeja.
        back = 0.5 + 0.5 * cc
        e = ELBOW_BASE + ELBOW_SWING * ((1.0 - back) ** 1.5)
        return (STAND["arm"] + stride * (a - STAND["arm"]),
                STAND["elbow"] + stride * (e - STAND["elbow"]))

    thL, shL, anL = leg(p)
    thR, shR, anR = leg(p + 0.5)
    aL, eL = arm(p)
    aR, eR = arm(p + 0.5)

    # Puntera: se extiende en el impulso (fase 0.30..0.40) y se recoge en vuelo.
    toeL = 22.0 * stride * max(0.0, math.sin(math.pi * (p - 0.26) / 0.16)) \
        if 0.26 <= p <= 0.42 else 0.0
    toeR = 22.0 * stride * max(0.0, math.sin(math.pi * (p - 0.76) / 0.16)) \
        if 0.76 <= p <= 0.92 else 0.0

    pose = {
        "hips_lean": LEAN_HIPS * lean,
        "hips_twist": -TWIST_HIPS * c * stride,
        "hips_side": SIDE_HIPS * s * stride,
        "spine": LEAN_SPINE * lean,
        "spine_twist": TWIST_SPINE * c * stride,
        "spine_side": -SIDE_HIPS * 0.4 * s * stride,
        "chest": LEAN_CHEST * lean,
        "chest_twist": TWIST_CHEST * c * stride,
        "chest_side": -SIDE_HIPS * 0.3 * s * stride,
        "neck": LEAN_NECK * lean,
        "neck_twist": 0.0,
        "head": LEAN_HEAD * lean,
        "head_twist": TWIST_HEAD * c * stride,
        "arm_L": aL, "elbow_L": eL, "splay_L": STAND["splay"], "wrist_L": 0.0,
        "arm_R": aR, "elbow_R": eR, "splay_R": STAND["splay"], "wrist_R": 0.0,
        "thigh_L": thL, "shin_L": shL, "ankle_L": anL, "toe_L": toeL,
        "thigh_R": thR, "shin_R": shR, "ankle_R": anR, "toe_R": toeR,
        "leg_splay": 2.0,
        "sleeve_L": 0.0, "sleeve_R": 0.0,
    }
    for i in range(1, 5):
        pose["hair_%d" % i] = (HAIR_TRAIL[i - 1] * lean
                               + HAIR_AMP[i - 1]
                               * math.sin(4.0 * math.pi * p - 0.6 * (i - 1)))
    return pose


def build_world(rig, pose):
    world = {}
    world["hips"] = rig.torso_world("hips", pose["hips_lean"],
                                    pose["hips_twist"], pose["hips_side"])
    world["spine"] = rig.torso_world("spine", pose["spine"],
                                     pose["spine_twist"], pose["spine_side"])
    world["chest"] = rig.torso_world("chest", pose["chest"],
                                     pose["chest_twist"], pose["chest_side"])
    world["neck"] = rig.torso_world("neck", pose["neck"],
                                    pose["neck_twist"], 0.0)
    world["head"] = rig.torso_world("head", pose["head"],
                                    pose["head_twist"], 0.0)
    for n in ("clavicle_L", "clavicle_R"):
        world[n] = rig.rest[n]

    for side, sfx in ((1.0, "L"), (-1.0, "R")):
        ua = pose["arm_" + sfx]
        fa = ua + pose["elbow_" + sfx]
        spl = pose["splay_" + sfx]
        world["upperArm_" + sfx] = rig.limb_world("upperArm_" + sfx, ua, spl, side)
        world["forearm_" + sfx] = rig.limb_world("forearm_" + sfx, fa, spl * 0.8, side)
        world["hand_" + sfx] = (Quaternion((1.0, 0.0, 0.0),
                                          math.radians(pose["wrist_" + sfx]))
                                @ world["forearm_" + sfx])
        world["sleeve_" + sfx] = (Quaternion((1.0, 0.0, 0.0),
                                             math.radians(pose["sleeve_" + sfx]))
                                  @ world["forearm_" + sfx])

        th = pose["thigh_" + sfx]
        sh = pose["shin_" + sfx]
        an = pose["ankle_" + sfx]
        ls = pose["leg_splay"]
        world["thigh_" + sfx] = rig.limb_world("thigh_" + sfx, th, ls, side)
        world["shin_" + sfx] = rig.limb_world("shin_" + sfx, sh, ls, side)
        world["foot_" + sfx] = rig.limb_world("foot_" + sfx, sh + an, ls, side)
        world["toe_" + sfx] = (Quaternion((1.0, 0.0, 0.0),
                                          math.radians(pose["toe_" + sfx]))
                               @ world["foot_" + sfx])

    for i in range(1, 5):
        n = "hair_%d" % i
        world[n] = rig.torso_world(n, pose[n], 0.0, 0.0)
    return world


# --- Medicion y horneado ----------------------------------------------------

def mesh_min_z():
    dg = bpy.context.evaluated_depsgraph_get()
    ob = bpy.data.objects[BODY_NAME]
    ev = ob.evaluated_get(dg)
    me = ev.to_mesh()
    mw = ob.matrix_world
    lo = min((mw @ v.co).z for v in me.vertices)
    ev.to_mesh_clear()
    return lo


_FOOT_VERTS = {}


def foot_verts(side):
    """Vertices cuya influencia dominante es el pie o la puntera de ese lado."""
    if side in _FOOT_VERTS:
        return _FOOT_VERTS[side]
    ob = bpy.data.objects[BODY_NAME]
    names = {"foot_" + side, "toe_" + side}
    idx = {g.index for g in ob.vertex_groups if g.name in names}
    out = []
    for v in ob.data.vertices:
        if not v.groups:
            continue
        g = max(v.groups, key=lambda x: x.weight)
        if g.group in idx:
            out.append(v.index)
    _FOOT_VERTS[side] = out
    return out


def foot_min_z(side):
    dg = bpy.context.evaluated_depsgraph_get()
    ob = bpy.data.objects[BODY_NAME]
    ev = ob.evaluated_get(dg)
    me = ev.to_mesh()
    mw = ob.matrix_world
    lo = min((mw @ me.vertices[i].co).z for i in foot_verts(side))
    ev.to_mesh_clear()
    return lo


def support_side(p):
    """Pie que carga el peso en esa fase, o None si es vuelo."""
    p = p % 1.0
    if p < STANCE_END:
        return "L"
    if p < 0.50:
        return None
    if p < 0.85:
        return "R"
    return None


def iter_fcurves(act):
    if hasattr(act, "fcurves") and len(act.fcurves):
        return list(act.fcurves)
    out = []
    for layer in act.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                out.extend(bag.fcurves)
    return out


def build_clip(rig, name, specs):
    """`specs`: lista de (fase, zancada, inclinacion) por frame."""
    poses = [run_pose(p, s, l) for (p, s, l) in specs]

    heights = []
    for pose, (p, _, _) in zip(poses, specs):
        side = support_side(p)
        if side is None:
            heights.append(None)
            continue
        rig.apply(build_world(rig, pose), Vector((0.0, 0.0, 0.0)))
        bpy.context.view_layer.update()
        heights.append(-foot_min_z(side))

    # El vuelo no se apoya en nada: se interpola entre el despegue y el
    # aterrizaje con un arco. Si se midiera la suela mas baja, el cuerpo se
    # quedaria pegado al pie que recobra y el rebote saldria a tirones.
    stance = list(heights)
    n = len(heights)
    for i in range(n):
        if stance[i] is not None:
            continue
        a = i - 1
        while a >= 0 and stance[a] is None:
            a -= 1
        b = i + 1
        while b < n and stance[b] is None:
            b += 1
        if a < 0 and b >= n:
            heights[i] = 0.0
        elif a < 0:
            heights[i] = stance[b]
        elif b >= n:
            heights[i] = stance[a]
        else:
            t = (i - a) / float(b - a)
            heights[i] = (stance[a] * (1.0 - t) + stance[b] * t
                          + FLIGHT_LIFT * 0.5
                          * (1.0 - math.cos(2.0 * math.pi * t)))

    # Valores locales por frame, calculados sin tocar el estado de Blender.
    samples = []
    for pose, h in zip(poses, heights):
        world = build_world(rig, pose)
        local = {}
        for nm in rig.order:
            pn = rig.parent[nm]
            if pn is not None:
                local[nm] = (world[pn] @ rig.rest[pn].inverted()
                             @ rig.rest[nm]).inverted() @ world[nm]
            else:
                local[nm] = rig.rest[nm].inverted() @ world[nm]
        samples.append((local,
                        rig.rest["hips"].inverted() @ Vector((0.0, 0.0, h))))

    # Continuidad de signo: un quaternion y su negado son la misma rotacion,
    # pero interpolados por componentes dan un giro de 360 grados.
    for i in range(1, len(samples)):
        prev = samples[i - 1][0]
        cur = samples[i][0]
        for nm in rig.order:
            if prev[nm].dot(cur[nm]) < 0.0:
                cur[nm].negate()

    if rig.arm.animation_data is None:
        rig.arm.animation_data_create()
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    rig.arm.animation_data.action = act
    layer = act.layers[0] if len(act.layers) else act.layers.new("Layer")
    strip = (layer.strips[0] if len(layer.strips)
             else layer.strips.new(type="KEYFRAME"))
    slot = (act.slots[0] if len(act.slots)
            else act.slots.new(id_type="OBJECT", name=rig.arm.name))
    bag = strip.channelbag(slot, ensure=True)

    n = len(samples)
    for nm in rig.order:
        path = 'pose.bones["%s"].rotation_quaternion' % nm
        for idx in range(4):
            fc = bag.fcurves.new(path, index=idx, group_name=nm)
            fc.keyframe_points.add(n)
            for f, (local, _) in enumerate(samples):
                kp = fc.keyframe_points[f]
                kp.co = (float(f), local[nm][idx])
                kp.interpolation = "LINEAR"
            fc.update()
    for idx in range(3):
        fc = bag.fcurves.new('pose.bones["hips"].location', index=idx,
                             group_name="hips")
        fc.keyframe_points.add(n)
        for f, (_, loc) in enumerate(samples):
            kp = fc.keyframe_points[f]
            kp.co = (float(f), loc[idx])
            kp.interpolation = "LINEAR"
        fc.update()

    print("[RunClips] %-16s %2d frames (%.2f s)  cadera %.3f..%.3f"
          % (name, n, n / FPS, min(heights), max(heights)))
    return act


def specs_from_keys(keys, n_frames):
    """Interpola (frame, fase, zancada, inclinacion) a un spec por frame."""
    fk = [(k[0], k[1]) for k in keys]
    sk = [(k[0], k[2]) for k in keys]
    lk = [(k[0], k[3]) for k in keys]
    out = []
    for f in range(n_frames):
        out.append((catmull(fk, f, False) % 1.0,
                    catmull(sk, f, False),
                    catmull(lk, f, False)))
    return out


# --- Clips ------------------------------------------------------------------

def start_keys():
    # De pie -> carga el peso -> primer apoyo corto -> ciclo completo.
    return [(0, 0.00, 0.00, 0.00),
            (4, 0.00, 0.00, 0.35),
            (10, 0.00, 0.50, 0.80),
            (14, 0.20, 0.65, 0.90),
            (18, 0.40, 0.80, 1.00),
            (22, 0.60, 0.90, 1.00),
            (26, 0.80, 0.97, 1.00),
            (30, 1.00, 1.00, 1.00)]


def end_keys():
    # Ciclo completo -> zancada cada vez mas corta -> pies juntos -> de pie.
    return [(0, 0.00, 1.00, 1.00),
            (5, 0.25, 0.92, 1.00),
            (10, 0.50, 0.80, 0.90),
            (15, 0.75, 0.62, 0.75),
            (20, 0.95, 0.40, 0.55),
            (25, 1.00, 0.12, 0.25),
            (32, 1.00, 0.00, 0.00)]


def build_all():
    arm = bpy.data.objects[ARM_NAME]
    rig = Rig(arm)
    sc = bpy.context.scene
    sc.render.fps = FPS
    sc.render.fps_base = 1.0

    loop_specs = [(i / LOOP_FRAMES, 1.0, 1.0) for i in range(LOOP_FRAMES + 1)]
    start_specs = specs_from_keys(start_keys(), 31)
    end_specs = specs_from_keys(end_keys(), 33)

    acts = {}
    acts["start"] = build_clip(rig, "nyx_run_start", start_specs)
    acts["loop"] = build_clip(rig, "nyx_run_loop", loop_specs)
    acts["end"] = build_clip(rig, "nyx_run_end", end_specs)
    return rig, acts


def export_glb(arm, act, path):
    arm.animation_data.action = act
    f0, f1 = (int(x) for x in act.frame_range)
    sc = bpy.context.scene
    sc.frame_start, sc.frame_end = f0, f1
    # Un objeto oculto no se puede seleccionar y el export sale vacio.
    arm.hide_set(False)
    arm.hide_viewport = False
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.export_scene.gltf(
        filepath=os.path.abspath(path),
        export_format="GLB",
        use_selection=True,
        export_animations=True,
        export_animation_mode="ACTIVE_ACTIONS",
        export_bake_animation=True,
        export_optimize_animation_size=True,
        export_apply=False,
    )
    print("[RunClips] exportado %s (%d bytes)"
          % (os.path.basename(path), os.path.getsize(path)))


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--out", default="public/models")
    p.add_argument("--no-export", action="store_true")
    args = p.parse_args(argv)

    rig, acts = build_all()
    if not args.no_export:
        os.makedirs(args.out, exist_ok=True)
        for key, fname in (("start", "nyx_run_start.glb"),
                           ("loop", "nyx_run_loop.glb"),
                           ("end", "nyx_run_end.glb")):
            export_glb(rig.arm, acts[key], os.path.join(args.out, fname))
    print("[RunClips] listo")


if __name__ == "__main__":
    main()
