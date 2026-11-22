#!/usr/bin/env python3
# ============================================================================
# scripts/blender_build_nyx.py — Blender 5.3 headless
#
#   blender --background --python scripts/blender_build_nyx.py
#
# Genera `public/models/nyx_rigged.glb` limpio con los 25 huesos exactos de
# `NyxAnimator` (src/game/render/nyxAnimator.ts), conservando las proporciones
# anime, manos, botas y rostro de la base Raven (`cro01_base.glb`) pero
# eliminando por completo las dos señas de identidad del copy de Raven:
#
#   1. El cinturón / hebilla / faldones de la cadera  (Z_blender 0.70..1.00)
#   2. Las mangas gigantes abombadas de los antebrazos (|X| 0.24..0.60)
#
# y también la capa/plumas traseras flotantes (Y_blender > 0.25).
#
# Pipeline:
#   [1] Reset de escena + import de cro01_base.glb. El glb fuente NO trae
#       materiales, así que primero se le hace una "cirugía" mínima en /tmp:
#       4 materiales (nyx_hair_mat/nyx_body_mat/nyx_face_mat/nyx_eyes_mat)
#       asignados 1:1 a sus 4 primitivas, para que el importador cree los 4
#       slots y `bpy.ops.mesh.separate(type='MATERIAL')` funcione tal cual.
#       El slot 0 (pelo viejo) se descarta.
#   [2] Import de public/models/nyx_rigged.glb (copia temporal en /tmp) para
#       reutilizar SOLO su malla `nyx_hair` volumétrica 3D (casquete + 7
#       mechones); su body/face/eyes, armature temporal e "Icosphere" se
#       borran. Se limpian sus vertex groups.
#   [3] Limpieza de `nyx_body` con bmesh (Blender Z-up, el personaje mira a
#       -Y; glTF Y-up <-> Blender Z-up los convierte el importador/exportador
#       con export_yup=True):
#         a) borrar caras de plumas traseras (algún vértice Y > 0.25)
#         b) borrar componentes conexas flotantes de la franja del cinturón
#            (caja Z 0.66..1.10, |X|<=0.20, |Y|<=0.25: hebillas, correas,
#            faldones) — la piel/pierna principal sobresale de la caja y se
#            conserva intacta
#         c) comprimir radialmente las mangas hacia el eje del brazo
#            (Y=0.055, Z=1.40) con radio máx 0.048 m + smooth_vert
#         d) suavizado fuerte (smooth_vert) de la franja Z 0.68..1.02 +
#            compresión radial ligera hacia el perfil elíptico (p90 por
#            slice, suavizado) => cintura/cadera lisas de bodysuit
#         e) remove_doubles(1e-4) + Shade Smooth en body/face/hair/eyes
#   [4] Armature de 25 huesos en el orden y jerarquía EXACTOS de
#       NyxAnimator. Todos los huesos apuntan a +Z_blender (roll 0) para que
#       el exporter glTF escriba TODOS los joints con rotación IDENTIDAD
#       (solo traslación, como el nyx_rigged.glb procedural): el animator
#       hace `bone.rotation.set(...)` cada frame con convención de ejes
#       mundo, así que cualquier rotación bind != identidad rompería las
#       poses.
#   [5] Vertex groups con los nombres exactos de los 25 huesos y pesos
#       suaves top-4 normalizados a 1.0 (falloff 1/(d²+0.005) sobre segmentos
#       óseos, el mismo esquema probado de scripts/build_nyx_rigged.mjs; el
#       pelo se pondera por longitud de arco sobre la cadena hair_1..hair_4)
#       + modificador ARMATURE en las 4 mallas.
#   [6] Export GLB (export_yup=True, export_skins=True, use_selection=True,
#       export_apply=False) + verificación in-situ del archivo escrito:
#       4 nodos mesh con skin, 25 joints con nombres/padres exactos,
#       rotaciones identidad, pesos que suman 1, posiciones de mundo clave.
#   [7] Render de comprobación 600x800 (EEVEE_NEXT -> WORKBENCH -> CYCLES)
#       a /tmp/nyx_blender_preview.png + análisis de píxeles del silueteado.
# ============================================================================
import bpy
import bmesh
import json
import math
import os
import shutil
import struct
import sys
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else os.getcwd()
ROOT = os.path.dirname(HERE) if os.path.basename(HERE) == 'scripts' else os.getcwd()
CRO01 = os.path.join(ROOT, 'referencias y base', 'Blender_exports', 'raven', 'cro01_base.glb')
HAIR_SRC = os.path.join(ROOT, 'public', 'models', 'nyx_rigged.glb')
OUT = os.path.join(ROOT, 'public', 'models', 'nyx_rigged.glb')
TMP_CRO01 = '/tmp/cro01_mats.glb'
TMP_HAIR = '/tmp/nyx_hair_source.glb'
PREVIEW = '/tmp/nyx_blender_preview.png'

# ---------------------------------------------------------------------------
# Los 25 huesos en el orden EXACTO de NyxAnimator.BONE_NAMES.
# (nombre, padre, cabeza_en_coords_Blender_Z_up). El personaje mira a -Y.
# Colas: todas a +Z (ver cabecera) — no afectan al glTF (solo la cabeza del
# hueso es la traslación del joint).
# ---------------------------------------------------------------------------
BONE_DEFS = [
    ('hips',       None,        (0.00,  0.000, 0.88)),
    ('spine',      'hips',      (0.00,  0.000, 1.10)),
    ('chest',      'spine',     (0.00,  0.000, 1.32)),
    ('neck',       'chest',     (0.00,  0.000, 1.44)),
    ('head',       'neck',      (0.00,  0.000, 1.52)),
    ('hair_1',     'head',      (0.00,  0.170, 1.50)),
    ('hair_2',     'hair_1',    (0.00,  0.200, 1.36)),
    ('hair_3',     'hair_2',    (0.00,  0.190, 1.22)),
    ('upperArm_L', 'clavicle_L', (0.16, 0.055, 1.40)),
    ('forearm_L',  'upperArm_L', (0.32, 0.055, 1.40)),
    ('hand_L',     'forearm_L', (0.60,  0.055, 1.40)),
    ('upperArm_R', 'clavicle_R', (-0.16, 0.055, 1.40)),
    ('forearm_R',  'upperArm_R', (-0.32, 0.055, 1.40)),
    ('hand_R',     'forearm_R', (-0.60, 0.055, 1.40)),
    ('thigh_L',    'hips',      (0.09,  0.000, 0.84)),
    ('shin_L',     'thigh_L',   (0.09,  0.000, 0.44)),
    ('thigh_R',    'hips',      (-0.09, 0.000, 0.84)),
    ('shin_R',     'thigh_R',   (-0.09, 0.000, 0.44)),
    ('hair_4',     'hair_3',    (0.00,  0.160, 1.10)),
    ('clavicle_L', 'chest',     (0.05,  0.020, 1.40)),
    ('clavicle_R', 'chest',     (-0.05, 0.020, 1.40)),
    ('foot_L',     'shin_L',    (0.09,  0.000, 0.08)),
    ('toe_L',      'foot_L',    (0.09, -0.060, 0.06)),
    ('foot_R',     'shin_R',    (-0.09, 0.000, 0.08)),
    ('toe_R',      'foot_R',    (-0.09, -0.060, 0.06)),
]
BONE_ORDER = [d[0] for d in BONE_DEFS]
BONE_PARENT = {d[0]: d[1] for d in BONE_DEFS}

# Posiciones de mundo esperadas en glTF (Y-up) tras export_yup: Blender
# (x, y, z) -> glTF (x, z, -y).
WORLD_EXPECT = {
    'hips': (0.00, 0.88, 0.00), 'spine': (0.00, 1.10, 0.00),
    'chest': (0.00, 1.32, 0.00), 'neck': (0.00, 1.44, 0.00),
    'head': (0.00, 1.52, 0.00), 'hair_1': (0.00, 1.50, -0.17),
    'hair_2': (0.00, 1.36, -0.20), 'hair_3': (0.00, 1.22, -0.19),
    'hair_4': (0.00, 1.10, -0.16), 'clavicle_L': (0.05, 1.40, -0.02),
    'clavicle_R': (-0.05, 1.40, -0.02), 'upperArm_L': (0.16, 1.40, -0.055),
    'upperArm_R': (-0.16, 1.40, -0.055), 'forearm_L': (0.32, 1.40, -0.055),
    'forearm_R': (-0.32, 1.40, -0.055), 'hand_L': (0.60, 1.40, -0.055),
    'hand_R': (-0.60, 1.40, -0.055), 'thigh_L': (0.09, 0.84, 0.00),
    'thigh_R': (-0.09, 0.84, 0.00), 'shin_L': (0.09, 0.44, 0.00),
    'shin_R': (-0.09, 0.44, 0.00), 'foot_L': (0.09, 0.08, 0.00),
    'foot_R': (-0.09, 0.08, 0.00), 'toe_L': (0.09, 0.06, 0.06),
    'toe_R': (-0.09, 0.06, 0.06),
}

# ---------------------------------------------------------------------------
# Skinning: falloff suave 1/(d²+SOFT) sobre segmentos óseos (esquema probado
# de scripts/build_nyx_rigged.mjs), top-4 normalizado a 1.0.
# ---------------------------------------------------------------------------
SOFT = 0.005
BODY_SEGS = [
    ('hips',       (0.00, 0.000, 0.90), (0.00, 0.000, 0.78)),
    ('spine',      (0.00, 0.000, 1.12), (0.00, 0.000, 0.90)),
    ('chest',      (0.00, 0.000, 1.34), (0.00, 0.000, 1.12)),
    ('neck',       (0.00, 0.000, 1.45), (0.00, 0.000, 1.34)),
    ('head',       (0.00, 0.000, 1.64), (0.00, 0.000, 1.45)),
    ('clavicle_L', (0.05, 0.020, 1.40), (0.00, 0.000, 1.34)),
    ('clavicle_R', (-0.05, 0.020, 1.40), (0.00, 0.000, 1.34)),
    ('upperArm_L', (0.16, 0.055, 1.40), (0.32, 0.055, 1.40)),
    ('upperArm_R', (-0.16, 0.055, 1.40), (-0.32, 0.055, 1.40)),
    ('forearm_L',  (0.32, 0.055, 1.40), (0.60, 0.055, 1.40)),
    ('forearm_R',  (-0.32, 0.055, 1.40), (-0.60, 0.055, 1.40)),
    ('hand_L',     (0.76, 0.050, 1.41), (0.60, 0.055, 1.40)),
    ('hand_R',     (-0.76, 0.050, 1.41), (-0.60, 0.055, 1.40)),
    ('thigh_L',    (0.09, 0.000, 0.84), (0.09, 0.000, 0.44)),
    ('thigh_R',    (-0.09, 0.000, 0.84), (-0.09, 0.000, 0.44)),
    ('shin_L',     (0.09, 0.000, 0.44), (0.09, 0.000, 0.08)),
    ('shin_R',     (-0.09, 0.000, 0.44), (-0.09, 0.000, 0.08)),
    ('foot_L',     (0.10, -0.050, 0.03), (0.10, 0.000, 0.09)),
    ('foot_R',     (-0.10, -0.050, 0.03), (-0.10, 0.000, 0.09)),
    ('toe_L',      (0.10, -0.115, 0.015), (0.10, -0.020, 0.045)),
    ('toe_R',      (-0.10, -0.115, 0.015), (-0.10, -0.020, 0.045)),
]
# Cadena del pelo: nuca -> punta de la melena (coords Blender).
HAIR_CHAIN = [
    (0.00, 0.170, 1.50), (0.00, 0.200, 1.36), (0.00, 0.190, 1.22),
    (0.00, 0.160, 1.10), (0.00, 0.130, 0.98),
]
HAIR_FAR = 0.20  # más lejos de la cadena => casquete/flequillo => 100% head

PART_COLORS = {
    'nyx_hair': (0.760, 0.807, 0.871, 1.0),
    'nyx_body': (0.010, 0.012, 0.026, 1.0),
    'nyx_face': (0.982, 0.791, 0.687, 1.0),
    'nyx_eyes': (0.005, 0.009, 0.023, 1.0),
}


def log(msg):
    print(f'[nyx_build] {msg}', flush=True)


def fail(msg):
    raise RuntimeError(msg)


# ---------------------------------------------------------------------------
# glb IO mínimo (para la cirugía de materiales y la verificación del export)
# ---------------------------------------------------------------------------
def glb_read(path):
    with open(path, 'rb') as f:
        data = f.read()
    if data[:4] != b'glTF':
        fail(f'{path} no es un GLB')
    json_len = struct.unpack_from('<I', data, 12)[0]
    js = json.loads(data[20:20 + json_len].decode('utf8'))
    bin_start = 20 + json_len + (4 - json_len % 4) % 4 + 8
    return js, data[bin_start:]


def glb_write(path, js, bin_data):
    jstr = json.dumps(js, separators=(',', ':')).encode('utf8')
    jstr += b' ' * ((4 - len(jstr) % 4) % 4)
    bin_chunk = bin_data + b'\x00' * ((4 - len(bin_data) % 4) % 4)
    total = 12 + 8 + len(jstr) + 8 + len(bin_chunk)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(jstr), 0x4E4F534A))
        f.write(jstr)
        f.write(struct.pack('<II', len(bin_chunk), 0x004E4942))
        f.write(bin_chunk)


def glb_accessor(js, bin_data, acc_idx):
    """Devuelve (componentType, type, lista de valores planos) de un accessor."""
    acc = js['accessors'][acc_idx]
    bv = js['bufferViews'][acc['bufferView']]
    off = bv.get('byteOffset', 0) + acc.get('byteOffset', 0)
    ncomp = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[acc['type']]
    if acc['componentType'] == 5126:
        size, fmt = 4, 'f'
    elif acc['componentType'] == 5123:
        size, fmt = 2, 'H'
    elif acc['componentType'] == 5125:
        size, fmt = 4, 'I'
    else:
        size, fmt = 1, 'B'
    stride = bv.get('byteStride', 0) or size * ncomp
    out = []
    for i in range(acc['count']):
        base = off + i * stride
        for c in range(ncomp):
            out.append(struct.unpack_from('<' + fmt, bin_data, base + c * size)[0])
    return acc['componentType'], acc['type'], out


# ---------------------------------------------------------------------------
# Utilidades de escena
# ---------------------------------------------------------------------------
def select_only(obs, active=None):
    bpy.ops.object.select_all(action='DESELECT')
    for ob in obs:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = active or obs[0]


def bake_world_transform(ob):
    """Aplana la jerarquía: des-parenta conservando el mundo y aplica los
    transforms al mesh (los glTF importados ya vienen horneados; esto es
    defensivo)."""
    select_only([ob])
    if ob.parent:
        bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    if ob.matrix_world != Matrix.Identity(4):
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def remove_objects(obs):
    for ob in obs:
        try:
            bpy.data.objects.remove(ob, do_unlink=True)
        except Exception:
            pass


# ---------------------------------------------------------------------------
# [1] Base Raven: cirugía de materiales + import + separate(MATERIAL)
# ---------------------------------------------------------------------------
def import_base():
    js, bin_data = glb_read(CRO01)
    mat_names = ['nyx_hair_mat', 'nyx_body_mat', 'nyx_face_mat', 'nyx_eyes_mat']
    js['materials'] = [
        {'name': n, 'pbrMetallicRoughness': {'baseColorFactor': [0.5, 0.5, 0.5, 1.0]}}
        for n in mat_names
    ]
    for i, prim in enumerate(js['meshes'][0]['primitives']):
        prim['material'] = i
    glb_write(TMP_CRO01, js, bin_data)
    log(f'cirugía glb: 4 materiales -> {TMP_CRO01}')

    bpy.ops.import_scene.gltf(filepath=TMP_CRO01)
    base = bpy.data.objects.get('cro01_base_n24')
    if base is None or base.type != 'MESH':
        fail('no se encontró la malla cro01_base_n24 tras el import')
    if len(base.data.materials) != 4:
        fail(f'cro01_base_n24 debería tener 4 slots, tiene {len(base.data.materials)}')

    select_only([base])
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.separate(type='MATERIAL')
    bpy.ops.object.mode_set(mode='OBJECT')

    parts = {}
    for ob in list(bpy.data.objects):
        if ob.type != 'MESH' or not ob.data.materials:
            continue
        mat = ob.data.materials[0]
        if mat and mat.name in mat_names:
            parts[mat.name] = ob
    if set(parts) != set(mat_names):
        fail(f'separate(MATERIAL) incompleto: {sorted(parts)}')

    hair_old = parts['nyx_hair_mat']
    body = parts['nyx_body_mat']
    face = parts['nyx_face_mat']
    eyes = parts['nyx_eyes_mat']
    for ob in (body, face, eyes):
        bake_world_transform(ob)
    remove_objects([hair_old])
    remove_objects([o for o in bpy.data.objects if o.type == 'EMPTY'])

    body.name = 'nyx_body'; body.data.name = 'nyx_body'
    face.name = 'nyx_face'; face.data.name = 'nyx_face'
    eyes.name = 'nyx_eyes'; eyes.data.name = 'nyx_eyes'
    log(f'base separada: body={len(body.data.vertices)}v face={len(face.data.vertices)}v '
        f'eyes={len(eyes.data.vertices)}v (pelo viejo descartado)')
    return body, face, eyes


# ---------------------------------------------------------------------------
# [2] Pelo volumétrico del nyx_rigged.glb actual
# ---------------------------------------------------------------------------
def import_hair():
    shutil.copyfile(HAIR_SRC, TMP_HAIR)
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=TMP_HAIR)
    new = [o for o in bpy.data.objects if o not in before]
    hair = next((o for o in new if o.name == 'nyx_hair' and o.type == 'MESH'), None)
    if hair is None:
        fail('no se encontró la malla nyx_hair en el nyx_rigged.glb actual')
    for m in list(hair.modifiers):
        hair.modifiers.remove(m)
    for g in list(hair.vertex_groups):
        hair.vertex_groups.remove(g)
    bake_world_transform(hair)
    remove_objects([o for o in new if o != hair])
    log(f'nyx_hair reutilizada: {len(hair.data.vertices)}v {len(hair.data.polygons)} caras '
        f'(body/face/eyes/armature/Icosphere del import descartados)')
    return hair


# ---------------------------------------------------------------------------
# [3] Limpieza de nyx_body (bmesh, coords Blender Z-up, personaje mira -Y)
# ---------------------------------------------------------------------------
def smoothstep(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3.0 - 2.0 * t)


def remove_orphan_verts(bm):
    orphans = [v for v in bm.verts if not v.link_faces]
    if orphans:
        bmesh.ops.delete(bm, geom=orphans, context='VERTS')
    return len(orphans)


def connected_components(bm):
    parent = {}
    for v in bm.verts:
        parent[v] = v

    def find(v):
        r = v
        while parent[r] != r:
            r = parent[r]
        while parent[v] != r:
            parent[v], v = r, parent[v]
        return r

    for f in bm.faces:
        rv = find(f.verts[0])
        for v in f.verts[1:]:
            ru = find(v)
            if ru != rv:
                parent[ru] = rv
    comps = {}
    for v in bm.verts:
        comps.setdefault(find(v), []).append(v)
    return list(comps.values())


def delete_back_feathers(bm):
    """Caras con algún vértice muy atrás (Y_blender > 0.25 == Z_gltf < -0.25)."""
    faces = [f for f in bm.faces if any(v.co.y > 0.25 for v in f.verts)]
    if faces:
        bmesh.ops.delete(bm, geom=faces, context='FACES')
    orphans = remove_orphan_verts(bm)
    log(f'plumas traseras: {len(faces)} caras borradas, {orphans} vértices huérfanos')
    return len(faces)


def delete_belt_accessories(bm):
    """Componentes conexas flotantes dentro de la caja del cinturón
    (Z 0.66..1.10, |X|<=0.20, |Y|<=0.25): hebillas, correas, faldones.
    La piel principal (pelvis/cintura) sobresale de la caja y se conserva."""
    box_z0, box_z1 = 0.66, 1.10
    box_x, box_y = 0.20, 0.25
    doomed = set()
    n_comps = 0
    for comp in connected_components(bm):
        xs = [v.co.x for v in comp]
        ys = [v.co.y for v in comp]
        zs = [v.co.z for v in comp]
        inside = (min(zs) >= box_z0 and max(zs) <= box_z1
                  and max(abs(min(xs)), abs(max(xs))) <= box_x
                  and max(abs(min(ys)), abs(max(ys))) <= box_y)
        if inside:
            doomed.update(comp)
            n_comps += 1
    if not doomed:
        log('cinturón: 0 accesorios flotantes')
        return 0
    faces = [f for f in bm.faces if f.verts[0] in doomed]
    bmesh.ops.delete(bm, geom=faces, context='FACES')
    remove_orphan_verts(bm)
    log(f'cinturón: {n_comps} accesorios flotantes borrados ({len(faces)} caras, '
        f'{len(doomed)} verts)')
    return len(faces)


def sleeve_band_verts(bm):
    return [v for v in bm.verts
            if 0.24 <= abs(v.co.x) <= 0.60 and 1.15 <= v.co.z <= 1.48]


def compress_sleeves(bm):
    """Comprime las mangas abombadas hacia el eje del brazo (Y=0.055, Z=1.40)
    con radio máximo 0.048 m, sin tocar las manos (|X| >= 0.60)."""
    axis_y, axis_z, r_max = 0.055, 1.40, 0.048
    moved = 0
    for v in sleeve_band_verts(bm):
        s = smoothstep(0.24, 0.30, abs(v.co.x))
        if s <= 0.0:
            continue
        dy, dz = v.co.y - axis_y, v.co.z - axis_z
        d = math.hypot(dy, dz)
        if d > r_max:
            r_new = d + (r_max - d) * s  # s=1 -> r_max; nunca expande
            k = r_new / d
            v.co.y = axis_y + dy * k
            v.co.z = axis_z + dz * k
            moved += 1
    log(f'mangas: {moved} vértices comprimidos al radio 0.048')
    return moved


def smooth_zone(bm, zmin, zmax, xmax, factor, iters):
    for _ in range(iters):
        verts = [v for v in bm.verts
                 if zmin <= v.co.z <= zmax and abs(v.co.x) <= xmax and abs(v.co.y) <= 0.30]
        if not verts:
            break
        bmesh.ops.smooth_vert(bm, verts=verts, factor=factor)


def belt_profile(bm, n_bins=20, z0=0.66, z1=1.06):
    """Perfil radial p90 por slice de altura en la franja de la cadera."""
    bin_w = (z1 - z0) / n_bins
    radii = [[] for _ in range(n_bins)]
    for v in bm.verts:
        if z0 <= v.co.z <= z1 and abs(v.co.x) <= 0.20 and abs(v.co.y) <= 0.25:
            b = min(n_bins - 1, int((v.co.z - z0) / bin_w))
            radii[b].append(math.hypot(v.co.x, v.co.y))
    prof = []
    for rs in radii:
        if not rs:
            prof.append(None)
        else:
            rs = sorted(rs)
            prof.append(rs[int(len(rs) * 0.9)])
    # interpola huecos
    for i in range(n_bins):
        if prof[i] is None:
            j = i
            while j < n_bins and prof[j] is None:
                j += 1
            lo = prof[i - 1] if i > 0 else (prof[j] if j < n_bins else 0.15)
            hi = prof[j] if j < n_bins else lo
            for k in range(i, j):
                t = (k - i + 1) / (j - i + 1)
                prof[k] = lo + (hi - lo) * t
    # suavizado del perfil (3 pasadas de media móvil)
    for _ in range(3):
        new = []
        for i in range(n_bins):
            vals = [prof[j] for j in (i - 1, i, i + 1) if 0 <= j < n_bins]
            new.append(sum(vals) / len(vals))
        prof = new
    return prof, bin_w, z0


def compress_belt(bm):
    """Compresión radial ligera (60% del exceso) hacia el perfil elíptico
    suavizado de la cadera/cintura."""
    prof, bin_w, z0 = belt_profile(bm)
    moved = 0
    for v in bm.verts:
        if 0.66 <= v.co.z <= 1.06 and abs(v.co.x) <= 0.20 and abs(v.co.y) <= 0.25:
            b = min(len(prof) - 1, int((v.co.z - z0) / bin_w))
            r = math.hypot(v.co.x, v.co.y)
            t = prof[b]
            if r > t:
                k = (t + (r - t) * 0.4) / r
                v.co.x *= k
                v.co.y *= k
                moved += 1
    log(f'cintura/cadera: {moved} vértices comprimidos al perfil p90 suavizado')
    return moved


def tuck_pelvis_rim(bm):
    """Mete hacia dentro el aro superior de la piel de la pelvis (donde la
    banda del cinturón tapaba el escalón hacia la piel de la cintura, más
    estrecha) para dejar una transición cadera->cintura continua."""
    moved = 0
    for v in bm.verts:
        if 0.93 <= v.co.z <= 1.06 and abs(v.co.x) <= 0.20 and abs(v.co.y) <= 0.25:
            v.co.x *= 0.85
            v.co.y *= 0.85
            moved += 1
    log(f'cadera: {moved} vértices del borde superior metidos al 85% radial')
    return moved


def clean_body(body):
    bm = bmesh.new()
    bm.from_mesh(body.data)
    delete_back_feathers(bm)
    delete_belt_accessories(bm)
    compress_sleeves(bm)
    smooth_zone(bm, 1.15, 1.48, 0.60, factor=0.5, iters=3)   # mangas
    smooth_zone(bm, 0.68, 1.02, 0.20, factor=0.6, iters=5)   # franja cinturón
    compress_belt(bm)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bm.to_mesh(body.data)
    bm.free()
    body.data.update()

    # medidas de control post-limpieza
    r_max_sleeve = 0.0
    for v in body.data.vertices:
        if 0.28 <= abs(v.co.x) <= 0.56 and 1.20 <= v.co.z <= 1.46:
            r_max_sleeve = max(r_max_sleeve, math.hypot(v.co.y - 0.055, v.co.z - 1.40))
    log(f'control: radio máx manga post-limpieza = {r_max_sleeve:.4f} (objetivo <= 0.056)')
    if r_max_sleeve > 0.056:
        fail(f'las mangas siguen abombadas: radio {r_max_sleeve:.4f}')
    log(f'nyx_body limpio: {len(body.data.vertices)}v {len(body.data.polygons)} caras')


def weld_and_smooth(obs):
    for ob in obs:
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
        bm.to_mesh(ob.data)
        bm.free()
        ob.data.update()
        select_only([ob])
        bpy.ops.object.shade_smooth()


# ---------------------------------------------------------------------------
# [4] Armature de 25 huesos
# ---------------------------------------------------------------------------
def build_armature():
    arm_data = bpy.data.armatures.new('nyx_armature')
    arm_ob = bpy.data.objects.new('nyx_armature', arm_data)
    bpy.context.collection.objects.link(arm_ob)
    select_only([arm_ob])
    bpy.ops.object.mode_set(mode='EDIT')
    ebs = arm_data.edit_bones
    made = {}
    for name, _parent, head in BONE_DEFS:
        eb = ebs.new(name)
        eb.head = head
        eb.tail = (head[0], head[1], head[2] + 0.1)  # +Z => rotación identidad al exportar
        eb.roll = 0.0
        made[name] = eb
    for name, parent, _head in BONE_DEFS:
        if parent:
            made[name].parent = made[parent]
            made[name].use_connect = False
    bpy.ops.object.mode_set(mode='OBJECT')
    bones = [b.name for b in arm_ob.data.bones]
    if len(bones) != len(BONE_ORDER) or set(bones) != set(BONE_ORDER):
        fail(f'huesos del armature != BONE_ORDER: {bones}')
    log(f'armature: {len(bones)} huesos verificados')
    return arm_ob


# ---------------------------------------------------------------------------
# [5] Pesos top-4 normalizados
# ---------------------------------------------------------------------------
def seg_dist(p, a, b):
    ax, ay, az = b[0] - a[0], b[1] - a[1], b[2] - a[2]
    len2 = ax * ax + ay * ay + az * az or 1e-12
    t = ((p[0] - a[0]) * ax + (p[1] - a[1]) * ay + (p[2] - a[2]) * az) / len2
    t = 0.0 if t < 0.0 else (1.0 if t > 1.0 else t)
    dx = p[0] - (a[0] + ax * t)
    dy = p[1] - (a[1] + ay * t)
    dz = p[2] - (a[2] + az * t)
    return math.sqrt(dx * dx + dy * dy + dz * dz)


def top_weights(cands):
    scored = sorted(((1.0 / (d * d + SOFT), n) for n, d in cands), reverse=True)[:4]
    s = sum(w for w, _ in scored)
    return [(n, w / s) for w, n in scored]


def body_weights(co):
    return top_weights([(name, seg_dist(co, a, b)) for name, a, b in BODY_SEGS])


HAIR_CUM = [0.0]
for _i in range(1, len(HAIR_CHAIN)):
    a, b = HAIR_CHAIN[_i - 1], HAIR_CHAIN[_i]
    HAIR_CUM.append(HAIR_CUM[-1] + math.dist(a, b))
HAIR_TOTAL = HAIR_CUM[-1]


def hair_weights(co):
    best_d, best_s = 1e9, 0.0
    for i in range(len(HAIR_CHAIN) - 1):
        a, b = HAIR_CHAIN[i], HAIR_CHAIN[i + 1]
        seg_len = HAIR_CUM[i + 1] - HAIR_CUM[i]
        t = 0.0
        if seg_len > 1e-12:
            t = ((co[0] - a[0]) * (b[0] - a[0]) + (co[1] - a[1]) * (b[1] - a[1])
                 + (co[2] - a[2]) * (b[2] - a[2])) / (seg_len * seg_len)
            t = 0.0 if t < 0.0 else (1.0 if t > 1.0 else t)
        d = math.dist(co, (a[0] + (b[0] - a[0]) * t,
                           a[1] + (b[1] - a[1]) * t,
                           a[2] + (b[2] - a[2]) * t))
        if d < best_d:
            best_d, best_s = d, HAIR_CUM[i] + t * seg_len
    if best_d > HAIR_FAR:
        return [('head', 1.0)]
    t = min(1.0, 0.12 + 0.8866 * (best_s / HAIR_TOTAL))
    if t <= 0.12:
        return [('head', 1.0)]
    if t <= 0.38:
        k = (t - 0.12) / 0.26
        return [('head', 1.0 - k), ('hair_1', k)]
    if t <= 0.60:
        k = (t - 0.38) / 0.22
        return [('hair_1', 1.0 - k), ('hair_2', k)]
    if t <= 0.80:
        k = (t - 0.60) / 0.20
        return [('hair_2', 1.0 - k), ('hair_3', k)]
    k = min(1.0, (t - 0.80) / 0.20)
    return [('hair_3', 1.0 - k), ('hair_4', k)]


def apply_weights(ob, weight_fn):
    for g in list(ob.vertex_groups):
        ob.vertex_groups.remove(g)
    groups = {}
    for v in ob.data.vertices:
        for name, w in weight_fn(v.co):
            g = groups.get(name)
            if g is None:
                g = ob.vertex_groups.new(name=name)
                groups[name] = g
            g.add([v.index], w, 'REPLACE')
    return sorted(groups)


# ---------------------------------------------------------------------------
# Materiales (colores del pipeline procedural; el juego los sustituye en runtime)
# ---------------------------------------------------------------------------
def assign_material(meshes):
    for ob in meshes:
        mat = bpy.data.materials.new(name=f'{ob.name}_mat')
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get('Principled BSDF')
        bsdf.inputs['Base Color'].default_value = PART_COLORS[ob.name]
        bsdf.inputs['Roughness'].default_value = 0.9
        bsdf.inputs['Metallic'].default_value = 0.0
        mat.use_backface_culling = False  # doubleSided
        ob.data.materials.clear()
        ob.data.materials.append(mat)


# ---------------------------------------------------------------------------
# [6] Export + verificación del GLB escrito
# ---------------------------------------------------------------------------
def export_glb(arm_ob, meshes):
    select_only([arm_ob] + list(meshes), active=arm_ob)
    bpy.ops.export_scene.gltf(
        filepath=OUT, export_format='GLB', use_selection=True,
        export_yup=True, export_skins=True, export_apply=False,
    )
    log(f'export: {OUT} ({os.path.getsize(OUT)} bytes)')


def verify_glb():
    js, bin_data = glb_read(OUT)
    nodes = js['nodes']

    # --- 4 nodos mesh con skin ---
    mesh_nodes = [n for n in nodes if 'mesh' in n]
    mesh_names = sorted(n['name'] for n in mesh_nodes)
    if mesh_names != ['nyx_body', 'nyx_eyes', 'nyx_face', 'nyx_hair']:
        fail(f'nodos mesh = {mesh_names}')
    for n in mesh_nodes:
        if 'skin' not in n:
            fail(f"el nodo mesh '{n['name']}' no tiene skin")
        if 'rotation' in n or 'translation' in n or 'scale' in n:
            fail(f"el nodo mesh '{n['name']}' no debería tener transform")

    # --- skin: 25 joints con nombres/padres exactos y rotación identidad ---
    skin = js['skins'][0]
    joints = skin['joints']
    if len(joints) != 25:
        fail(f'el skin tiene {len(joints)} joints, se esperaban 25')
    joint_names = [nodes[j]['name'] for j in joints]
    if sorted(joint_names) != sorted(BONE_ORDER):
        fail(f'nombres de joints: {joint_names}')
    parent_of = {}
    for i, n in enumerate(nodes):
        for c in n.get('children', []):
            parent_of[c] = i
    for j in joints:
        n = nodes[j]
        if 'rotation' in n and any(abs(r) > 1e-6 for r in n['rotation']):
            fail(f"el joint '{n['name']}' exporta rotación {n['rotation']} "
                 f'(NyxAnimator exige bind identidad)')
        if 'scale' in n and any(abs(s - 1.0) > 1e-6 for s in n['scale']):
            fail(f"el joint '{n['name']}' exporta scale {n['scale']}")
    joint_by_name = {nodes[j]['name']: j for j in joints}
    for name, expect_parent in BONE_PARENT.items():
        j = joint_by_name[name]
        p = parent_of.get(j)
        actual = nodes[p]['name'] if p is not None else None
        if expect_parent is None:
            if actual is not None and actual != 'nyx_armature':
                fail(f"'{name}' debería ser raíz, su padre es '{actual}'")
        elif actual != expect_parent:
            fail(f"padre de '{name}' = '{actual}', se esperaba '{expect_parent}'")

    # --- posiciones de mundo (rotaciones identidad => suma de traslaciones) ---
    world = {}
    for name in BONE_ORDER:
        j = joint_by_name[name]
        acc = Vector((0.0, 0.0, 0.0))
        cur = j
        while cur is not None:
            n = nodes[cur]
            acc += Vector(n.get('translation', (0.0, 0.0, 0.0)))
            cur = parent_of.get(cur)
            if cur is not None and 'mesh' not in nodes[cur] and nodes[cur].get('name') == 'nyx_armature':
                break  # wrapper identity
        world[name] = acc
    for name, exp in WORLD_EXPECT.items():
        got = world[name]
        if (got - Vector(exp)).length > 5e-3:
            fail(f"posición de mundo de '{name}' = {tuple(round(c, 4) for c in got)}, "
                 f'se esperaba {exp}')

    # --- atributos de skin y pesos ---
    for mi, mesh in enumerate(js['meshes']):
        prim = mesh['primitives'][0]
        if 'JOINTS_0' not in prim['attributes'] or 'WEIGHTS_0' not in prim['attributes']:
            fail(f"la malla '{mesh['name']}' no tiene JOINTS_0/WEIGHTS_0")
        _ct, _ty, jv = glb_accessor(js, bin_data, prim['attributes']['JOINTS_0'])
        if any((not (0 <= i < 25)) or i != int(i) for i in jv):
            fail(f"JOINTS_0 fuera de rango en '{mesh['name']}'")
        _ct, _ty, wv = glb_accessor(js, bin_data, prim['attributes']['WEIGHTS_0'])
        worst = 0.0
        for q in range(len(wv) // 4):
            s = wv[q * 4] + wv[q * 4 + 1] + wv[q * 4 + 2] + wv[q * 4 + 3]
            worst = max(worst, abs(s - 1.0))
        if worst > 1e-4:
            fail(f"WEIGHTS_0 de '{mesh['name']}' no suma 1 (peor {worst})")
        pos = js['accessors'][prim['attributes']['POSITION']]
        log(f"skin ok: '{mesh['name']}' {pos['count']}v pesos|sum-1|<={worst:.2e} "
            f"bb Y {pos['min'][1]:.3f}..{pos['max'][1]:.3f}")

    log('verificación GLB: 4 mallas con skin, 25 joints exactos (bind identidad), '
        'pesos normalizados, posiciones de mundo correctas')


# ---------------------------------------------------------------------------
# [7] Render de comprobación
# ---------------------------------------------------------------------------
def render_preview():
    scene = bpy.context.scene
    cam_data = bpy.data.cameras.new('nyx_preview_cam')
    cam_data.lens = 55
    cam = bpy.data.objects.new('nyx_preview_cam', cam_data)
    cam.location = (1.7, -2.6, 1.35)
    look = Vector((0.0, 0.0, 0.85)) - cam.location
    cam.rotation_euler = look.to_track_quat('-Z', 'Y').to_euler()
    scene.collection.objects.link(cam)

    sun_data = bpy.data.lights.new('nyx_preview_sun', 'SUN')
    sun_data.energy = 3.0
    sun = bpy.data.objects.new('nyx_preview_sun', sun_data)
    sun.location = (2.0, -3.0, 4.0)
    slook = Vector((0.0, 0.0, 0.9)) - sun.location
    sun.rotation_euler = slook.to_track_quat('-Z', 'Y').to_euler()
    scene.collection.objects.link(sun)

    world = bpy.data.worlds.new('nyx_preview_world')
    world.use_nodes = True
    bg = world.node_tree.nodes.get('Background')
    bg.inputs[0].default_value = (0.88, 0.90, 0.96, 1.0)
    bg.inputs[1].default_value = 1.0
    scene.world = world

    scene.camera = cam
    scene.render.resolution_x = 600
    scene.render.resolution_y = 800
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = PREVIEW
    if os.path.exists(PREVIEW):
        os.remove(PREVIEW)

    used = None
    for engine in ('BLENDER_EEVEE_NEXT', 'BLENDER_WORKBENCH', 'CYCLES'):
        try:
            scene.render.engine = engine
            if engine == 'CYCLES':
                scene.cycles.samples = 32
            bpy.ops.render.render(write_still=True)
            used = engine
            break
        except Exception as exc:
            log(f'render con {engine} falló: {exc}')
    if used is None or not os.path.exists(PREVIEW):
        fail('no se pudo generar el render de comprobación')
    log(f'render de comprobación: {used} -> {PREVIEW}')

    # análisis de silueta: bbox de píxeles distintos del fondo
    img = bpy.data.images.load(PREVIEW)
    w, h = img.size
    px = img.pixels[:]
    bgc = (0.88, 0.90, 0.96)
    minx, miny, maxx, maxy, count = w, h, -1, -1, 0
    for y in range(h):
        for x in range(w):
            o = (y * w + x) * 4
            if abs(px[o] - bgc[0]) + abs(px[o + 1] - bgc[1]) + abs(px[o + 2] - bgc[2]) > 0.15:
                count += 1
                if x < minx: minx = x
                if x > maxx: maxx = x
                if y < miny: miny = y
                if y > maxy: maxy = y
    if count < 1000:
        fail(f'el render parece vacío ({count} px de silueta)')
    log(f'silueta: {count} px, bbox x {minx}..{maxx} / y {miny}..{maxy} '
        f'({100.0 * (maxx - minx) / w:.0f}% x {100.0 * (maxy - miny) / h:.0f}% del frame)')


# ---------------------------------------------------------------------------
def main():
    for path in (CRO01, HAIR_SRC):
        if not os.path.exists(path):
            fail(f'no existe {path}')
    os.makedirs(os.path.dirname(OUT), exist_ok=True)

    log('reset de escena')
    bpy.ops.wm.read_factory_settings(use_empty=True)

    body, face, eyes = import_base()
    hair = import_hair()
    clean_body(body)
    weld_and_smooth([body, face, hair, eyes])

    arm_ob = build_armature()
    meshes = (hair, body, face, eyes)
    log('pesos: ' + ', '.join(f"{ob.name}={apply_weights(ob, fn)}"
        for ob, fn in ((body, body_weights), (face, lambda co: [('head', 1.0)]),
                       (eyes, lambda co: [('head', 1.0)]), (hair, hair_weights))))
    assign_material(meshes)
    for ob in meshes:
        ob.parent = arm_ob
        mod = ob.modifiers.new('Armature', 'ARMATURE')
        mod.object = arm_ob

    export_glb(arm_ob, meshes)
    verify_glb()
    render_preview()
    log('BUILD OK')


try:
    main()
except Exception as exc:
    import traceback
    traceback.print_exc()
    print(f'[nyx_build] BUILD FAILED: {exc}', file=sys.stderr, flush=True)
    sys.exit(1)
