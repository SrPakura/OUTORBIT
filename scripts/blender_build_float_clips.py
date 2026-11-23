"""Genera las variantes de flotación 0G a partir del clip aprobado.

El clip base (`nyx_float_fwd.glb`) tiene el torso casi quieto (hips 4.2° de
recorrido sagital, chest 2.4°) y los brazos muy vivos (76° de excursión). Además
NO cierra en bucle: el último frame queda a 13.8° del primero y la cadera deriva
2.5 cm. De ahí salen cuatro clips:

  nyx_float_fwd      base + overlay dinámico (banco a su derecha)
  nyx_float_fwd_mir  espejo exacto de `fwd` (banco a su izquierda)
  nyx_float_fwd_mid  `fwd` desbanqueado — el centro, para cambiar entre las dos
  nyx_float_back     centro + inclinación atrás

Tres decisiones que no son obvias:

1. El bucle se cierra quitando la deriva: se reparte entre todos los frames la
   corrección que lleva el último al primero. El gesto se conserva y el clip
   pasa a ser repetible.

2. `mid` NO es el promedio de `fwd` y `mir`. Las piernas y los brazos van en
   contrafase, así que sus poses están a ~115° y el punto medio sale deformado
   (laterales de 60°). En su lugar se desbanquea `fwd` rotando el cuerpo entero
   alrededor de Y por el banco medio de la cadera: el resultado queda centrado
   pero conserva la tijera y la ondulación.

3. El espejo se hace sobre la rotación de mundo: `(w, x, -y, -z)` con
   intercambio L↔R. Es exacto porque el plano sagital de Nyx es x=0 y los huesos
   L/R tienen direcciones de reposo espejadas.

El overlay añade la undulación del torso, el vaivén de brazos, la tijera de
piernas y la onda del pelo que le faltan al clip original. Todos los ciclos son
múltiplos enteros de la duración del clip, así que sigue cerrando en bucle.
"""

import argparse
import math
import os
import sys

import bpy
from mathutils import Quaternion, Vector

_HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(_HERE)

ARM_NAME = "nyx_armature"
BASE_GLB = os.path.join(ROOT, "public", "models", "nyx_float_fwd.glb")
FPS = 30

# Intercambio L/R para el espejo. Los huesos centrales se quedan en su sitio.
_SWAP = {
    "thigh_L": "thigh_R", "shin_L": "shin_R",
    "foot_L": "foot_R", "toe_L": "toe_R",
    "upperArm_L": "upperArm_R", "forearm_L": "forearm_R",
    "hand_L": "hand_R", "sleeve_L": "sleeve_R",
    "clavicle_L": "clavicle_R",
}
for _a, _b in list(_SWAP.items()):
    _SWAP[_b] = _a

# --- Overlay dinámico -------------------------------------------------------
# Ciclos enteros sobre la duración del clip para no romper el bucle.
UNDUL_CYCLES = 2.0
ARM_CYCLES = 1.0
LEG_CYCLES = 1.0
HAIR_CYCLES = 2.0

UNDUL_SAG = 2.5
UNDUL_LAT = 3.5
ARM_SAG = 11.0
ARM_LAT = 7.0
FOREARM_SAG = 9.0
THIGH_SAG = 7.0
SHIN_SAG = 5.0
HAIR_BASE = 2.0
HAIR_STEP = 1.5
BOB = 0.025

# Inclinación atrás del clip `back`, en grados (negativo = hacia atrás).
BACK_TILT = -14.0

IDENTITY = Quaternion((1.0, 0.0, 0.0, 0.0))


def _delta(sag_deg, lat_deg):
    """Rotación de mundo extra: sagital alrededor de X, lateral alrededor de Y."""
    return (Quaternion((1.0, 0.0, 0.0), math.radians(sag_deg))
            @ Quaternion((0.0, 1.0, 0.0), math.radians(lat_deg)))


def overlay(p):
    """Rotaciones de mundo extra por hueso en la fase `p` (0..1)."""
    w = 2.0 * math.pi * p
    out = {}

    # Undulación: una onda que sube por el torso.
    for i, name in enumerate(("hips", "spine", "chest")):
        ph = w * UNDUL_CYCLES - 0.7 * i
        out[name] = _delta(UNDUL_SAG * math.sin(ph),
                           UNDUL_LAT * math.sin(ph + 0.9))

    # Cabeza: contrarresta para que la mirada no se mueva con el torso.
    out["neck"] = _delta(-1.5 * math.sin(w * UNDUL_CYCLES - 2.1),
                         -2.0 * math.sin(w * UNDUL_CYCLES - 1.2))
    out["head"] = _delta(-1.0 * math.sin(w * UNDUL_CYCLES - 2.8),
                         -1.5 * math.sin(w * UNDUL_CYCLES - 1.9))

    # Brazos: deriva en contrafase, como si flotaran en agua.
    for side, sgn in (("L", 1.0), ("R", -1.0)):
        ph = w * ARM_CYCLES + (0.0 if side == "L" else math.pi)
        out["upperArm_" + side] = _delta(ARM_SAG * math.sin(ph),
                                         sgn * ARM_LAT * math.sin(ph + 0.6))
        out["forearm_" + side] = _delta(FOREARM_SAG * math.sin(ph + 0.8), 0.0)

    # Piernas: tijera lenta.
    for side in ("L", "R"):
        ph = w * LEG_CYCLES + (0.0 if side == "L" else math.pi)
        out["thigh_" + side] = _delta(THIGH_SAG * math.sin(ph), 0.0)
        out["shin_" + side] = _delta(SHIN_SAG * math.sin(ph + 0.5), 0.0)

    # Pelo: onda con amplitud creciente hacia la punta.
    for i in range(1, 5):
        ph = w * HAIR_CYCLES - 0.6 * (i - 1)
        amp = HAIR_BASE + HAIR_STEP * i
        out["hair_%d" % i] = _delta(amp * math.sin(ph),
                                    0.6 * amp * math.sin(ph + 0.4))
    return out


# --- Utilidades de rotación -------------------------------------------------

def lateral_angle(q):
    """Cuánto se aparta del plano sagital la dirección del hueso, en grados."""
    d = (q @ Vector((0.0, 1.0, 0.0))).normalized()
    return math.degrees(math.atan2(d.x, d.z))


def mirror_world(world):
    out = {}
    for name, q in world.items():
        tgt = _SWAP.get(name, name)
        out[tgt] = Quaternion((q.w, q.x, -q.y, -q.z))
    return out


# --- Rig --------------------------------------------------------------------

class Rig:
    def __init__(self, arm):
        self.arm = arm
        self.rest = {}
        self.parent = {}
        self.order = []
        for b in arm.data.bones:
            self.rest[b.name] = b.matrix_local.to_quaternion()
            self.parent[b.name] = b.parent.name if b.parent else None

        def walk(bone):
            self.order.append(bone.name)
            for c in bone.children:
                walk(c)

        for r in [b for b in arm.data.bones if b.parent is None]:
            walk(r)

    def to_local(self, world):
        local = {}
        for nm in self.order:
            pn = self.parent[nm]
            if pn is not None:
                local[nm] = (world[pn] @ self.rest[pn].inverted()
                             @ self.rest[nm]).inverted() @ world[nm]
            else:
                local[nm] = self.rest[nm].inverted() @ world[nm]
        return local


# --- Lectura del clip base --------------------------------------------------

def read_base(src, n_frames):
    """Rotaciones de mundo y localización de cadera por frame."""
    world = []
    locs = []
    for f in range(n_frames):
        bpy.context.scene.frame_set(f)
        dg = bpy.context.evaluated_depsgraph_get()
        dg.update()
        ev = src.evaluated_get(dg)
        world.append({pb.name: pb.matrix.to_quaternion().copy()
                      for pb in ev.pose.bones})
        locs.append(ev.pose.bones["hips"].location.copy())
    return world, locs


def close_loop(world, locs, n_frames):
    """Reparte la deriva entre todos los frames para que el último cierre."""
    drift = {b: world[0][b] @ world[-1][b].inverted() for b in world[0]}
    dloc = locs[-1] - locs[0]
    out_w, out_l = [], []
    for f in range(n_frames):
        t = f / float(n_frames - 1)
        out_w.append({b: IDENTITY.slerp(drift[b], t) @ world[f][b]
                      for b in world[f]})
        out_l.append(locs[f] - dloc * t)
    return out_w, out_l


# --- Variantes --------------------------------------------------------------

def build_variants(base_world, base_locs, n_frames, hips_rest):
    """Devuelve {variante: [(world, loc), ...]}."""
    out = {n: [] for n in ("fwd", "mir", "mid", "back")}
    tilt = Quaternion((1.0, 0.0, 0.0), math.radians(BACK_TILT))
    hips_inv = hips_rest.inverted()

    # Banco medio de la cadera: el ángulo que deja el cuerpo centrado.
    mean_bank = sum(lateral_angle(w["hips"]) for w in base_world) / n_frames
    unbank = Quaternion((0.0, 1.0, 0.0), math.radians(-mean_bank))
    print("[FloatClips] banco medio de cadera: %.2f deg" % mean_bank)

    for f in range(n_frames):
        # Fase periódica: en el último frame vuelve a 0, así el overlay cierra.
        p = (f % (n_frames - 1)) / float(n_frames - 1)
        W = base_world[f]
        L = base_locs[f]

        ov = overlay(p)
        bob = BOB * math.sin(2.0 * math.pi * p * UNDUL_CYCLES)

        # fwd = base + overlay
        Wf = {n: (ov[n] @ W[n] if n in ov else W[n]) for n in W}
        Lf = L + (hips_inv @ Vector((0.0, 0.0, bob)))

        # mir = espejo exacto de fwd
        Wm = mirror_world(Wf)
        Lm = Vector((-Lf.x, Lf.y, Lf.z))

        # mid = fwd desbanqueado (conserva tijera y ondulación)
        Wc = {n: unbank @ Wf[n] for n in Wf}

        # back = mid inclinado atrás
        Wb = {n: tilt @ Wc[n] for n in Wc}

        out["fwd"].append((Wf, Lf))
        out["mir"].append((Wm, Lm))
        out["mid"].append((Wc, Lf))
        out["back"].append((Wb, Lf))
    return out


# --- Escritura de acciones --------------------------------------------------

def write_action(rig, name, samples):
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

    locals_ = [rig.to_local(w) for (w, _) in samples]

    # Continuidad de signo: q y -q son la misma rotación, pero interpoladas por
    # componentes dan un giro de 360°.
    for i in range(1, len(locals_)):
        prev, cur = locals_[i - 1], locals_[i]
        for nm in rig.order:
            if prev[nm].dot(cur[nm]) < 0.0:
                cur[nm].negate()

    n = len(samples)
    for nm in rig.order:
        path = 'pose.bones["%s"].rotation_quaternion' % nm
        for idx in range(4):
            fc = bag.fcurves.new(path, index=idx, group_name=nm)
            fc.keyframe_points.add(n)
            for f in range(n):
                kp = fc.keyframe_points[f]
                kp.co = (float(f), locals_[f][nm][idx])
                kp.interpolation = "LINEAR"
            fc.update()
    for idx in range(3):
        fc = bag.fcurves.new('pose.bones["hips"].location', index=idx,
                             group_name="hips")
        fc.keyframe_points.add(n)
        for f in range(n):
            kp = fc.keyframe_points[f]
            kp.co = (float(f), samples[f][1][idx])
            kp.interpolation = "LINEAR"
        fc.update()

    print("[FloatClips] %-20s %2d frames (%.2f s)" % (name, n, n / FPS))
    return act


def export_glb(arm, act, path):
    arm.animation_data.action = act
    f0, f1 = (int(x) for x in act.frame_range)
    sc = bpy.context.scene
    sc.frame_start, sc.frame_end = f0, f1
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
        export_optimize_animation_size=False,
        export_apply=False,
    )
    print("[FloatClips] exportado %s (%d bytes)"
          % (os.path.basename(path), os.path.getsize(path)))


def load_base(glb_path):
    """Importa el GLB base y devuelve (armature importado, acción, frames)."""
    before = set(bpy.data.objects.keys())
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(glb_path))
    new = sorted(set(bpy.data.objects.keys()) - before)
    src = None
    for n in new:
        ob = bpy.data.objects[n]
        if ob.type == "ARMATURE":
            src = ob
            break
    if src is None:
        raise RuntimeError("el GLB base no trae armature")
    act = src.animation_data.action
    n_frames = int(act.frame_range[1]) + 1
    print("[FloatClips] base %s: %d frames" % (act.name, n_frames))
    return src, act, n_frames, new


def build_all(base_glb=BASE_GLB):
    arm = bpy.data.objects[ARM_NAME]
    src, act, n_frames, new_objs = load_base(base_glb)

    raw_world, raw_locs = read_base(src, n_frames)
    base_world, base_locs = close_loop(raw_world, raw_locs, n_frames)
    hips_rest = arm.data.bones["hips"].matrix_local.to_quaternion()
    variants = build_variants(base_world, base_locs, n_frames, hips_rest)

    # Reconstruir desde cero si ya existían.
    for nm in ("nyx_float_fwd", "nyx_float_fwd_mir",
               "nyx_float_fwd_mid", "nyx_float_back"):
        old = bpy.data.actions.get(nm)
        if old is not None:
            bpy.data.actions.remove(old)

    rig = Rig(arm)
    acts = {}
    for key, name in (("fwd", "nyx_float_fwd"),
                      ("mir", "nyx_float_fwd_mir"),
                      ("mid", "nyx_float_fwd_mid"),
                      ("back", "nyx_float_back")):
        acts[key] = write_action(rig, name, variants[key])

    # Limpieza de lo que trajo la importación.
    for n in new_objs:
        ob = bpy.data.objects.get(n)
        if ob is not None:
            bpy.data.objects.remove(ob, do_unlink=True)
    return rig, acts


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--out", default=os.path.join(ROOT, "public", "models"))
    p.add_argument("--base", default=BASE_GLB)
    p.add_argument("--no-export", action="store_true")
    args = p.parse_args(argv)

    rig, acts = build_all(args.base)
    if not args.no_export:
        os.makedirs(args.out, exist_ok=True)
        for key, fname in (("fwd", "nyx_float_fwd.glb"),
                           ("mir", "nyx_float_fwd_mir.glb"),
                           ("mid", "nyx_float_fwd_mid.glb"),
                           ("back", "nyx_float_back.glb")):
            export_glb(rig.arm, acts[key], os.path.join(args.out, fname))
    print("[FloatClips] listo")


if __name__ == "__main__":
    main()
