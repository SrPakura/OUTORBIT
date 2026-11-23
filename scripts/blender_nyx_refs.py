"""
OUTORBIT — Renders de referencia de NYX (Pack 1 flow + Pack 2 bones).

Genera en output_nyx_refs/:
  PACK 1 — referencia para vídeo AI / mocap (sin huesos ni gizmos):
    nyx_flow_front.png     vista frontal recta
    nyx_flow_3quarter.png  vista 3/4 (cámara girada 40°)
    nyx_flow_back.png      vista trasera recta
  PACK 2 — revisión de rig (modelo completo + esqueleto en X-Ray):
    nyx_bones_front.png    frontal recta con huesos
    nyx_bones_side.png     lateral con huesos
  bones_hierarchy.txt      nombres y jerarquía padre->hijo de los dos rigs

Uso:
  blender -b animaciones_generadas/nyx_animaciones.blend \
      --python scripts/blender_nyx_refs.py -- [--out DIR] [--res 1024] [--samples 128]

Escena:
  - Fondo gris estudio claro plano #DCDCDC exacto (view transform Standard).
  - Sin suelo, sin sombras duras, sin UI ni texto.
  - Cámara 60 mm (FOV vertical 33.4°), cuerpo entero al 80 % de la altura.
  - Pose: rest pose + A-pose neutra (brazos a 30° del torso).
  - Pack 1 oculta pelo y mangas anchas; el brazo completo (hombro -> muñeca)
    se reconstruye como una sola pieza orgánica con Shade Smooth.
  - Materiales: mono deportivo oscuro mate en torso/brazos/piernas y tono
    piel neutro en cabeza, cuello y manos.
"""

import bmesh
import bpy
import importlib.util
import math
import os
import sys
from datetime import datetime

from mathutils import Matrix, Vector

# ---------------------------------------------------------------------------
# Constantes de escena
# ---------------------------------------------------------------------------
BG_SRGB = 0xDC                  # #DCDCDC — gris estudio claro
LENS_MM = 60.0
SENSOR_MM = 36.0
FILL_HEIGHT = 0.80              # cuerpo entero al 80 % de la altura del frame
FILL_WIDTH = 0.86
A_POSE_DEG = 30.0               # brazos a 30° respecto al torso

ARM_AXIS_Y, ARM_AXIS_Z = 0.055, 1.40    # eje del brazo en rest pose
ARM_DELETE_MIN_X = 0.17         # se borran las piezas del brazo entre estos |x|
ARM_DELETE_MAX_X = 0.605        # (mangas, segmentos y puños); las manos se quedan

# Perfil anatómico del brazo: (x, radio). Hombro -> bíceps -> codo -> antebrazo -> muñeca.
ARM_PROFILE = (
    (0.120, 0.026),
    (0.140, 0.031),
    (0.160, 0.037),
    (0.180, 0.045),
    (0.200, 0.049),
    (0.230, 0.048),
    (0.260, 0.045),
    (0.290, 0.041),
    (0.320, 0.037),
    (0.350, 0.038),
    (0.380, 0.040),
    (0.410, 0.041),
    (0.440, 0.039),
    (0.470, 0.036),
    (0.500, 0.033),
    (0.530, 0.030),
    (0.560, 0.027),
    (0.600, 0.023),
)
ARM_X0, ARM_X1 = ARM_PROFILE[0][0], ARM_PROFILE[-1][0]

FLOW_SUIT_SRGB = 0x222222       # mono deportivo oscuro mate
FLOW_SUIT_ROUGHNESS = 0.65
FLOW_SUIT_SPECULAR = 0.55
FLOW_SKIN_SRGB = 0xE5C2A8       # tono piel neutro suave
FLOW_SKIN_ROUGHNESS = 0.55
FLOW_SKIN_SPECULAR = 0.35
FLOW_EYES_SRGB = 0xC9A184       # sombra suave de boca: sin parche claro en la barbilla
FLOW_EYES_ROUGHNESS = 0.60
FLOW_HAIR_SRGB = 0x1E1E24       # casquete corto que queda al quitar el pelo largo
FLOW_HAIR_ROUGHNESS = 0.70
HAIR_CAP_MIN_Z = 1.40           # las madejas que bajan de aquí son el pelo largo
GHOST_BODY = (0.280, 0.290, 0.320, 1.0)
GHOST_ALPHA = 0.50
AMBIENT_LINEAR = 0.18           # relleno de estudio suave (no fija el fondo)
BONE_EMIT = (0.150, 0.850, 1.000, 1.0)
BONE_EMIT_STRENGTH = 1.4
BONE_STICK_R = 0.010
BONE_JOINT_R = 0.020

HELPER_OBJECTS = (
    'skin.001', 'PreviewGround', 'PreviewCam', 'PreviewFill', 'PreviewRim',
    'PreviewSun', 'PreviewTarget', 'Esfera geodésica', 'Esfera geodésica.001',
)
GENERATED_OBJECTS = (
    'nyx_body_flow', 'nyx_hair_flow', 'nyx_forearm_L', 'nyx_forearm_R', 'RefSkeleton',
    'RefCam', 'RefKey', 'RefFill', 'RefRim',
)


def log(msg):
    print(f'[nyx_refs] {msg}')


def srgb_to_linear(value):
    v = value / 255.0
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4


def hex_to_linear(hex_rgb):
    """#RRGGBB (0xRRGGBB) -> tupla lineal RGBA para Base Color."""
    return (
        srgb_to_linear((hex_rgb >> 16) & 0xFF),
        srgb_to_linear((hex_rgb >> 8) & 0xFF),
        srgb_to_linear(hex_rgb & 0xFF),
        1.0,
    )


BG_LINEAR = srgb_to_linear(BG_SRGB)


# ---------------------------------------------------------------------------
# Geometría
# ---------------------------------------------------------------------------
def loose_parts(bm):
    """Componentes conexas del bmesh (lista de listas de BMVert)."""
    seen = set()
    parts = []
    for vert in bm.verts:
        if vert in seen:
            continue
        stack = [vert]
        comp = []
        seen.add(vert)
        while stack:
            cur = stack.pop()
            comp.append(cur)
            for edge in cur.link_edges:
                other = edge.other_vert(cur)
                if other not in seen:
                    seen.add(other)
                    stack.append(other)
        parts.append(comp)
    return parts


def smoothstep(a, b, v):
    if b <= a:
        return 0.0 if v < a else 1.0
    t = max(0.0, min(1.0, (v - a) / (b - a)))
    return t * t * (3.0 - 2.0 * t)


def catmull_rom(points, x):
    """Interpola la lista de (x, y) con Catmull-Rom: perfil continuo sin anillos."""
    n = len(points)
    if x <= points[0][0]:
        return points[0][1]
    if x >= points[-1][0]:
        return points[-1][1]
    i = 0
    while i < n - 2 and x > points[i + 1][0]:
        i += 1
    x0, y0 = points[i]
    x1, y1 = points[i + 1]
    u = (x - x0) / (x1 - x0)
    ym1 = points[i - 1][1] if i > 0 else y0
    y2 = points[i + 2][1] if i + 2 < n else y1
    u2 = u * u
    u3 = u2 * u
    return 0.5 * (
        2.0 * y0
        + (-ym1 + y1) * u
        + (2.0 * ym1 - 5.0 * y0 + 4.0 * y1 - y2) * u2
        + (-ym1 + 3.0 * y0 - 3.0 * y1 + y2) * u3
    )


def arm_ellipse(x):
    """Sección casi circular en el hombro, aplanada hacia la muñeca (mano plana)."""
    s = smoothstep(0.32, ARM_X1, x)
    return 1.0 + 0.30 * s, 1.0 - 0.13 * s


def evaluated_bbox(objects):
    """Bounding box en espacio de mundo de las mallas ya evaluadas (con modificadores)."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    points = []
    for ob in objects:
        if ob.type != 'MESH' or ob.hide_render:
            continue
        ev = ob.evaluated_get(depsgraph)
        mesh = ev.to_mesh()
        matrix = ev.matrix_world
        points.extend(matrix @ v.co for v in mesh.vertices)
        ev.to_mesh_clear()
    if not points:
        raise RuntimeError('bbox vacío: no hay mallas visibles')
    mn = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    mx = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    return mn, mx


# ---------------------------------------------------------------------------
# Pose
# ---------------------------------------------------------------------------
def reset_pose(armature):
    """Rest pose limpia: sin acción y sin transformaciones de pose."""
    if armature.animation_data:
        armature.animation_data.action = None
    for pb in armature.pose.bones:
        pb.location = (0.0, 0.0, 0.0)
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = (1.0, 0.0, 0.0, 0.0)
        pb.rotation_euler = (0.0, 0.0, 0.0)
        pb.scale = (1.0, 1.0, 1.0)
    bpy.context.view_layer.update()


def rotate_bone_world(pb, axis, degrees):
    """Rota un pose bone alrededor de un eje de mundo que pasa por su cabeza."""
    head = pb.matrix.translation.copy()
    m = Matrix.Translation(head) @ Matrix.Rotation(math.radians(degrees), 4, axis) @ Matrix.Translation(-head)
    pb.matrix = m @ pb.matrix
    bpy.context.view_layer.update()


def apply_a_pose(armature, degrees=A_POSE_DEG):
    """Baja los brazos desde la T-pose hasta `degrees` respecto al torso vertical."""
    drop = 90.0 - degrees
    for side, sign in (('L', 1.0), ('R', -1.0)):
        rotate_bone_world(armature.pose.bones[f'upperArm_{side}'], 'Y', drop * sign)
    log(f'A-pose: brazos a {degrees:.0f}° del torso')


# ---------------------------------------------------------------------------
# Escena
# ---------------------------------------------------------------------------
def hide_helpers():
    for name in HELPER_OBJECTS:
        ob = bpy.data.objects.get(name)
        if ob:
            ob.hide_render = True
            ob.hide_viewport = True


def setup_world(scene):
    """Fondo #787878 exacto para los rayos de cámara y ambiente tenue para la iluminación.

    Sin el split por Light Path el color del fondo fijaría también la luz ambiente
    y el cuerpo no podría quedar oscuro sobre un gris claro.
    """
    world = scene.world or bpy.data.worlds.new('RefWorld')
    scene.world = world
    world.use_nodes = True
    tree = world.node_tree
    tree.nodes.clear()

    out = tree.nodes.new('ShaderNodeOutputWorld')
    mix = tree.nodes.new('ShaderNodeMixShader')
    path = tree.nodes.new('ShaderNodeLightPath')
    bg_camera = tree.nodes.new('ShaderNodeBackground')
    bg_ambient = tree.nodes.new('ShaderNodeBackground')

    bg_camera.inputs['Color'].default_value = (BG_LINEAR, BG_LINEAR, BG_LINEAR, 1.0)
    bg_camera.inputs['Strength'].default_value = 1.0
    bg_ambient.inputs['Color'].default_value = (AMBIENT_LINEAR, AMBIENT_LINEAR, AMBIENT_LINEAR, 1.0)
    bg_ambient.inputs['Strength'].default_value = 1.0

    tree.links.new(path.outputs['Is Camera Ray'], mix.inputs['Fac'])
    tree.links.new(bg_ambient.outputs['Background'], mix.inputs[1])
    tree.links.new(bg_camera.outputs['Background'], mix.inputs[2])
    tree.links.new(mix.outputs['Shader'], out.inputs['Surface'])


def setup_render(scene, res, samples):
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = res
    scene.render.resolution_y = res
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGB'
    scene.render.image_settings.color_depth = '8'
    scene.eevee.taa_render_samples = samples
    scene.eevee.use_shadows = True
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0
    scene.display_settings.display_device = 'sRGB'


def setup_camera(scene):
    cam_data = bpy.data.cameras.new('RefCam')
    cam_data.lens = LENS_MM
    cam_data.sensor_width = SENSOR_MM
    cam_data.sensor_fit = 'AUTO'
    cam = bpy.data.objects.new('RefCam', cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    return cam


def setup_lights(center, azimuth):
    """Tres áreas grandes y suaves colocadas en el sistema de la cámara (luz de estudio)."""
    for name in ('RefKey', 'RefFill', 'RefRim'):
        ob = bpy.data.objects.get(name)
        if ob:
            bpy.data.objects.remove(ob, do_unlink=True)
    specs = (
        ('RefKey', -38.0, 30.0, 3.6, 200.0, 4.2),
        ('RefFill', 52.0, 10.0, 3.6, 110.0, 4.8),
        ('RefRim', 176.0, 36.0, 3.4, 130.0, 3.8),
    )
    for name, d_az, elev, dist, energy, size in specs:
        light_data = bpy.data.lights.new(name, 'AREA')
        light_data.energy = energy
        light_data.size = size
        light_data.shape = 'SQUARE'
        ob = bpy.data.objects.new(name, light_data)
        bpy.context.scene.collection.objects.link(ob)
        a = math.radians(azimuth + d_az)
        e = math.radians(elev)
        direction = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
        ob.location = center + direction * dist
        ob.rotation_euler = (center - ob.location).to_track_quat('-Z', 'Y').to_euler()


def fit_camera(cam, mn, mx, azimuth, elevation, res):
    """Coloca la cámara a la distancia que deja el cuerpo al FILL_HEIGHT de la altura."""
    center = (mn + mx) * 0.5
    a = math.radians(azimuth)
    e = math.radians(elevation)
    forward = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
    right = forward.cross(Vector((0.0, 0.0, 1.0)))
    if right.length < 1e-6:
        right = Vector((1.0, 0.0, 0.0))
    right.normalize()
    up = right.cross(forward).normalized()

    corners = [Vector((x, y, z)) for x in (mn.x, mx.x) for y in (mn.y, mx.y) for z in (mn.z, mx.z)]
    half_w = max(abs((c - center).dot(right)) for c in corners)
    half_h = max(abs((c - center).dot(up)) for c in corners)

    tan_half = (SENSOR_MM * 0.5) / LENS_MM
    distance = max(half_h / (FILL_HEIGHT * tan_half), half_w / (FILL_WIDTH * tan_half))

    cam.location = center + forward * distance
    cam.rotation_euler = (center - cam.location).to_track_quat('-Z', 'Y').to_euler()
    return center, distance, half_h, half_w, tan_half


# ---------------------------------------------------------------------------
# Materiales
# ---------------------------------------------------------------------------
def find_node(node_tree, bl_idname):
    """Busca un nodo por tipo: los nombres por defecto están localizados."""
    for node in node_tree.nodes:
        if node.bl_idname == bl_idname:
            return node
    return None


def make_principled(name, base, roughness=0.95, alpha=1.0, specular=0.15):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = find_node(mat.node_tree, 'ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = base
    bsdf.inputs['Roughness'].default_value = roughness
    if 'Specular IOR Level' in bsdf.inputs:
        bsdf.inputs['Specular IOR Level'].default_value = specular
    if alpha < 1.0:
        bsdf.inputs['Alpha'].default_value = alpha
        mat.surface_render_method = 'BLENDED'
        mat.use_transparent_shadow = True
        mat.use_backface_culling = True
    return mat


def make_emission(name, color, strength):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()
    out = nodes.new('ShaderNodeOutputMaterial')
    emit = nodes.new('ShaderNodeEmission')
    emit.inputs['Color'].default_value = color
    emit.inputs['Strength'].default_value = strength
    mat.node_tree.links.new(emit.outputs['Emission'], out.inputs['Surface'])
    return mat


def assign_material(ob, mat):
    ob.data.materials.clear()
    ob.data.materials.append(mat)


def assign_flow_materials(ob, suit, skin):
    """Mono oscuro en torso/brazos/piernas y piel en cabeza, cuello y manos.

    El reparto sigue los vertex groups del rig (head/neck/hand_L/hand_R) en vez
    de un umbral de altura: así el borde piel/mono cae en una arista real.
    """
    ob.data.materials.clear()
    ob.data.materials.append(suit)
    ob.data.materials.append(skin)
    index = {g.name: g.index for g in ob.vertex_groups}
    skin_groups = {index[n] for n in ('head', 'neck', 'hand_L', 'hand_R') if n in index}
    weights = [
        sum(g.weight for g in v.groups if g.group in skin_groups)
        for v in ob.data.vertices
    ]
    skin_polys = 0
    for poly in ob.data.polygons:
        w = sum(weights[i] for i in poly.vertices) / len(poly.vertices)
        poly.material_index = 1 if w > 0.5 else 0
        if w > 0.5:
            skin_polys += 1
    log(f'{ob.name}: {skin_polys}/{len(ob.data.polygons)} caras con piel')


# ---------------------------------------------------------------------------
# Pack 1: cuerpo despejado (sin pelo, sin mangas anchas)
# ---------------------------------------------------------------------------
def build_flow_body(armature, body):
    """Copia de nyx_body sin mangas ni segmentos de brazo + brazos orgánicos."""
    flow = body.copy()
    flow.data = body.data.copy()
    flow.name = 'nyx_body_flow'
    flow.data.name = 'nyx_body_flow_mesh'
    bpy.context.scene.collection.objects.link(flow)

    bm = bmesh.new()
    bm.from_mesh(flow.data)
    doomed = []
    for comp in loose_parts(bm):
        xs = [abs(v.co.x) for v in comp]
        if min(xs) >= ARM_DELETE_MIN_X and max(xs) <= ARM_DELETE_MAX_X:
            doomed.extend(comp)
            log(f'brazo/manga eliminado: {len(comp)} verts, |x| {min(xs):.3f}..{max(xs):.3f}')
    if not doomed:
        raise RuntimeError('no se han encontrado las mallas de manga/brazo')
    bmesh.ops.delete(bm, geom=doomed, context='VERTS')
    bm.to_mesh(flow.data)
    bm.free()
    flow.data.update()

    forearms = []
    for side, sign in (('L', 1.0), ('R', -1.0)):
        forearms.append(make_forearm(f'nyx_forearm_{side}', sign, armature))
    return flow, forearms


def build_flow_hair(hair):
    """Copia de nyx_hair sin las madejas largas: deja el casquete de la cabeza."""
    flow = hair.copy()
    flow.data = hair.data.copy()
    flow.name = 'nyx_hair_flow'
    flow.data.name = 'nyx_hair_flow_mesh'
    bpy.context.scene.collection.objects.link(flow)

    bm = bmesh.new()
    bm.from_mesh(flow.data)
    doomed = []
    for comp in loose_parts(bm):
        if min(v.co.z for v in comp) < HAIR_CAP_MIN_Z:
            doomed.extend(comp)
    if not doomed:
        raise RuntimeError('no se han encontrado las madejas de pelo largo')
    bmesh.ops.delete(bm, geom=doomed, context='VERTS')
    bm.to_mesh(flow.data)
    bm.free()
    flow.data.update()
    log(f'{flow.name}: {len(flow.data.vertices)} verts de casquete, '
        f'{len(doomed)} verts de pelo largo ocultos')
    return flow


def make_forearm(name, sign, armature, segs=28, rings=56):
    """Brazo continuo hombro -> bíceps -> codo -> antebrazo -> muñeca, suavizado."""
    verts = []
    for i in range(rings + 1):
        x = ARM_X0 + (ARM_X1 - ARM_X0) * (i / rings)
        r = catmull_rom(ARM_PROFILE, x)
        ey, ez = arm_ellipse(x)
        for j in range(segs):
            a = 2.0 * math.pi * j / segs
            verts.append((
                sign * x,
                ARM_AXIS_Y + r * ey * math.cos(a),
                ARM_AXIS_Z + r * ez * math.sin(a),
            ))
    faces = []
    for i in range(rings):
        for j in range(segs):
            k = (j + 1) % segs
            faces.append((i * segs + j, i * segs + k, (i + 1) * segs + k, (i + 1) * segs + j))
    # tapas en abanico: quedan ocultas dentro del torso y dentro de la mano
    cap0 = len(verts)
    verts.append((sign * ARM_X0, ARM_AXIS_Y, ARM_AXIS_Z))
    cap1 = len(verts)
    verts.append((sign * ARM_X1, ARM_AXIS_Y, ARM_AXIS_Z))
    for j in range(segs):
        k = (j + 1) % segs
        faces.append((cap0, k, j))
        faces.append((cap1, rings * segs + j, rings * segs + k))

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.validate()
    mesh.update()

    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = True
    mesh.update()

    ob = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = armature
    modifier = ob.modifiers.new('Armature', 'ARMATURE')
    modifier.object = armature

    side = 'L' if sign > 0 else 'R'
    g_upper = ob.vertex_groups.new(name=f'upperArm_{side}')
    g_fore = ob.vertex_groups.new(name=f'forearm_{side}')
    g_hand = ob.vertex_groups.new(name=f'hand_{side}')
    for i in range(rings + 1):
        x = ARM_X0 + (ARM_X1 - ARM_X0) * (i / rings)
        w_hand = smoothstep(0.54, ARM_X1, x)
        w_fore = smoothstep(0.26, 0.38, x) * (1.0 - w_hand)
        w_upper = 1.0 - w_fore - w_hand
        idxs = [i * segs + j for j in range(segs)]
        if w_upper > 1e-4:
            g_upper.add(idxs, w_upper, 'REPLACE')
        if w_fore > 1e-4:
            g_fore.add(idxs, w_fore, 'REPLACE')
        if w_hand > 1e-4:
            g_hand.add(idxs, w_hand, 'REPLACE')
    # los centros de las tapas también necesitan peso o se quedan en rest pose
    g_upper.add([cap0], 1.0, 'REPLACE')
    g_hand.add([cap1], 1.0, 'REPLACE')
    log(f'{name}: {len(verts)} verts, {len(faces)} caras, shade smooth')
    return ob


# ---------------------------------------------------------------------------
# Pack 2: esqueleto visible
# ---------------------------------------------------------------------------
def build_skeleton(armature, material):
    """Stick figure con las cabezas de hueso reales (equivalente a SkeletonHelper)."""
    heads = {}
    parents = {}
    for pb in armature.pose.bones:
        heads[pb.name] = armature.matrix_world @ pb.head
        parents[pb.name] = pb.parent.name if pb.parent else None

    verts = []
    faces = []

    def add_cylinder(p0, p1, radius, segs=8):
        delta = p1 - p0
        length = delta.length
        if length < 1e-5:
            return
        axis = delta / length
        ref = Vector((0.0, 0.0, 1.0)) if abs(axis.z) < 0.95 else Vector((1.0, 0.0, 0.0))
        u = axis.cross(ref).normalized()
        v = axis.cross(u).normalized()
        base = len(verts)
        for i in range(segs):
            a = 2.0 * math.pi * i / segs
            offset = u * (math.cos(a) * radius) + v * (math.sin(a) * radius)
            verts.append(p0 + offset)
            verts.append(p1 + offset)
        for i in range(segs):
            j = (i + 1) % segs
            faces.append((base + i * 2, base + j * 2, base + j * 2 + 1, base + i * 2 + 1))

    def add_sphere(center, radius, segs=10, rings=6):
        base = len(verts)
        for i in range(rings + 1):
            phi = math.pi * i / rings
            for j in range(segs):
                theta = 2.0 * math.pi * j / segs
                verts.append(center + Vector((
                    radius * math.sin(phi) * math.cos(theta),
                    radius * math.sin(phi) * math.sin(theta),
                    radius * math.cos(phi),
                )))
        for i in range(rings):
            for j in range(segs):
                k = (j + 1) % segs
                faces.append((
                    base + i * segs + j, base + i * segs + k,
                    base + (i + 1) * segs + k, base + (i + 1) * segs + j,
                ))

    for name, head in heads.items():
        add_sphere(head, BONE_JOINT_R)
        parent = parents[name]
        if parent:
            add_cylinder(head, heads[parent], BONE_STICK_R)

    mesh = bpy.data.meshes.new('RefSkeleton')
    mesh.from_pydata([tuple(v) for v in verts], [], faces)
    mesh.validate()
    mesh.update()
    ob = bpy.data.objects.new('RefSkeleton', mesh)
    bpy.context.scene.collection.objects.link(ob)
    ob.data.materials.append(material)
    log(f'esqueleto: {len(heads)} huesos, {len(verts)} verts')
    return ob


# ---------------------------------------------------------------------------
# Jerarquía de huesos
# ---------------------------------------------------------------------------
def tree_lines(bones):
    children = {}
    roots = []
    for bone in bones:
        if bone.parent:
            children.setdefault(bone.parent.name, []).append(bone.name)
        else:
            roots.append(bone.name)

    lines = []

    def walk(name, prefix, is_last, is_root):
        if is_root:
            lines.append(name)
            child_prefix = ''
        else:
            lines.append(prefix + ('└── ' if is_last else '├── ') + name)
            child_prefix = prefix + ('    ' if is_last else '│   ')
        kids = children.get(name, [])
        for i, kid in enumerate(kids):
            walk(kid, child_prefix, i == len(kids) - 1, False)

    for root in roots:
        walk(root, '', True, True)
    return lines


def soma_mapping():
    """Lee SOMA_TO_NYX_BONE_MAP del script de retargeting, si está disponible."""
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'blender_kimodo_retarget_nyx.py')
    if not os.path.exists(path):
        return None
    try:
        spec = importlib.util.spec_from_file_location('nyx_retarget', path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return getattr(module, 'SOMA_TO_NYX_BONE_MAP', None)
    except Exception as exc:  # noqa: BLE001
        log(f'no se pudo leer el mapeo SOMA: {exc}')
        return None


def write_hierarchy(path, armatures, blend_path):
    lines = []
    lines.append('OUTORBIT — Jerarquía de huesos de NYX')
    lines.append(f'Generado: {datetime.now().isoformat(timespec="seconds")}')
    lines.append(f'Fuente:   {blend_path}')
    lines.append('')
    lines.append('Coordenadas en espacio Blender (Z-up, el personaje mira a -Y).')
    lines.append('glTF exporta Y-up: (x, y, z)_blender -> (x, z, -y)_gltf.')
    lines.append('')

    for armature in armatures:
        bones = armature.data.bones
        lines.append('=' * 78)
        lines.append(f'ARMATURE: {armature.name}  ({len(bones)} huesos)')
        lines.append('=' * 78)
        lines.append('')
        lines.append('Árbol padre -> hijo:')
        lines.extend(tree_lines(bones))
        lines.append('')
        lines.append('Tabla (índice, nombre, padre, cabeza x/y/z):')
        lines.append(f'{"#":>3}  {"hueso":<16} {"padre":<16} {"cabeza (x, y, z)":<26} hijos')
        for i, bone in enumerate(bones):
            head = bone.head_local
            parent = bone.parent.name if bone.parent else '-'
            kids = ','.join(c.name for c in bone.children) or '-'
            lines.append(
                f'{i:>3}  {bone.name:<16} {parent:<16} '
                f'({head.x:+.3f}, {head.y:+.3f}, {head.z:+.3f})   {kids}'
            )
        lines.append('')

    mapping = soma_mapping()
    if mapping:
        lines.append('=' * 78)
        lines.append('MAPEO DE RETARGETING SOMA (Kimodo) -> NYX')
        lines.append('=' * 78)
        lines.append(f'{"SOMA":<22} -> NYX')
        for src, dst in mapping.items():
            lines.append(f'{src:<22} -> {dst}')
        lines.append('')
        lines.append('Sin mapear (se conservan para física secundaria en Three.js):')
        lines.append('  hair_1..hair_4, sleeve_L, sleeve_R')
        lines.append('')

    lines.append('=' * 78)
    lines.append('NOTAS')
    lines.append('=' * 78)
    lines.append('- nyx_armature es el rig de juego (27 huesos) que se exporta a glTF.')
    lines.append('- skin.001 es el esqueleto SOMA/Mixamo de origen usado para retargeting;')
    lines.append('  no se exporta y queda oculto en los renders.')
    lines.append('- halo_ring (índice 27 en nyxAnimator.ts) NO existe en este .blend:')
    lines.append('  no hay malla ni hueso de halo, así que no hay nada que ocultar.')
    lines.append('- Las mangas anchas (sleeve_L/R) son parte de la malla nyx_body, no')
    lines.append('  objetos separados: en el Pack 1 se eliminan por componente conexa y')
    lines.append('  se sustituyen por un antebrazo fino (nyx_forearm_L/R).')
    lines.append('')

    text = '\n'.join(lines)
    with open(path, 'w', encoding='utf-8') as fh:
        fh.write(text)
    print(text)
    log(f'jerarquía -> {path}')


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def parse_args():
    argv = sys.argv
    argv = argv[argv.index('--') + 1:] if '--' in argv else []
    out = None
    res = 1024
    samples = 128
    pack1_only = False
    i = 0
    while i < len(argv):
        if argv[i] == '--out' and i + 1 < len(argv):
            out = argv[i + 1]
            i += 2
        elif argv[i] == '--res' and i + 1 < len(argv):
            res = int(argv[i + 1])
            i += 2
        elif argv[i] == '--samples' and i + 1 < len(argv):
            samples = int(argv[i + 1])
            i += 2
        elif argv[i] == '--pack1-only':
            pack1_only = True
            i += 1
        else:
            i += 1
    if out is None:
        out = os.path.join(bpy.path.abspath('//'), 'output_nyx_refs')
    return os.path.abspath(out), res, samples, pack1_only


def main():
    out_dir, res, samples, pack1_only = parse_args()
    os.makedirs(out_dir, exist_ok=True)
    log(f'salida: {out_dir}  resolución: {res}  muestras: {samples}  '
        f'solo Pack 1: {pack1_only}')

    scene = bpy.context.scene
    armature = bpy.data.objects['nyx_armature']
    body = bpy.data.objects['nyx_body']
    face = bpy.data.objects['nyx_face']
    eyes = bpy.data.objects['nyx_eyes']
    hair = bpy.data.objects['nyx_hair']

    for name in GENERATED_OBJECTS:
        ob = bpy.data.objects.get(name)
        if ob:
            bpy.data.objects.remove(ob, do_unlink=True)

    hide_helpers()
    reset_pose(armature)
    apply_a_pose(armature)
    setup_world(scene)
    setup_render(scene, res, samples)
    cam = setup_camera(scene)

    # --- materiales ---
    flow_suit = make_principled(
        'nyx_ref_flow_suit', hex_to_linear(FLOW_SUIT_SRGB),
        roughness=FLOW_SUIT_ROUGHNESS, specular=FLOW_SUIT_SPECULAR)
    flow_skin = make_principled(
        'nyx_ref_flow_skin', hex_to_linear(FLOW_SKIN_SRGB),
        roughness=FLOW_SKIN_ROUGHNESS, specular=FLOW_SKIN_SPECULAR)
    flow_eyes = make_principled(
        'nyx_ref_flow_eyes', hex_to_linear(FLOW_EYES_SRGB), roughness=FLOW_EYES_ROUGHNESS)
    flow_hair_mat = make_principled(
        'nyx_ref_flow_hair', hex_to_linear(FLOW_HAIR_SRGB), roughness=FLOW_HAIR_ROUGHNESS)
    ghost = make_principled('nyx_ref_ghost', GHOST_BODY, roughness=0.90, alpha=GHOST_ALPHA)
    bone_mat = make_emission('nyx_ref_bones', BONE_EMIT, BONE_EMIT_STRENGTH)

    # --- Pack 1: cuerpo despejado ---
    flow_body, forearms = build_flow_body(armature, body)
    flow_hair = build_flow_hair(hair)
    assign_flow_materials(flow_body, flow_suit, flow_skin)
    for ob in forearms:
        assign_material(ob, flow_suit)
    assign_material(face, flow_skin)
    assign_material(eyes, flow_eyes)
    assign_material(flow_hair, flow_hair_mat)

    body.hide_render = True
    hair.hide_render = True
    for ob in forearms:
        ob.hide_render = False

    mn, mx = evaluated_bbox([flow_body, face, eyes, flow_hair] + forearms)
    log(f'bbox Pack 1: z {mn.z:.3f}..{mx.z:.3f}  x {mn.x:.3f}..{mx.x:.3f}')

    flow_views = (
        ('nyx_flow_front.png', 0.0),
        ('nyx_flow_3quarter.png', 40.0),
        ('nyx_flow_back.png', 180.0),
    )
    for filename, azimuth in flow_views:
        center, dist, half_h, half_w, tan_half = fit_camera(cam, mn, mx, azimuth, 0.0, res)
        setup_lights(center, azimuth)
        fill_h = half_h / (dist * tan_half)
        fill_w = half_w / (dist * tan_half)
        log(f'{filename}: azimut {azimuth:.0f}°, d {dist:.2f} m, '
            f'alto {fill_h * 100:.1f} %, ancho {fill_w * 100:.1f} %')
        scene.render.filepath = os.path.join(out_dir, filename)
        bpy.ops.render.render(write_still=True)

    if pack1_only:
        log('Pack 1 regenerado; Pack 2 y bones_hierarchy.txt intactos')
        return

    # --- Pack 2: modelo completo + esqueleto ---
    body.hide_render = False
    hair.hide_render = False
    flow_body.hide_render = True
    flow_hair.hide_render = True
    for ob in forearms:
        ob.hide_render = True
    for ob in (body, face, eyes, hair):
        assign_material(ob, ghost)
    skeleton = build_skeleton(armature, bone_mat)

    mn, mx = evaluated_bbox([body, face, eyes, hair])
    log(f'bbox Pack 2: z {mn.z:.3f}..{mx.z:.3f}  x {mn.x:.3f}..{mx.x:.3f}')

    bone_views = (
        ('nyx_bones_front.png', 0.0),
        ('nyx_bones_side.png', 90.0),
    )
    for filename, azimuth in bone_views:
        center, dist, half_h, half_w, tan_half = fit_camera(cam, mn, mx, azimuth, 0.0, res)
        setup_lights(center, azimuth)
        fill_h = half_h / (dist * tan_half)
        log(f'{filename}: azimut {azimuth:.0f}°, d {dist:.2f} m, alto {fill_h * 100:.1f} %')
        scene.render.filepath = os.path.join(out_dir, filename)
        bpy.ops.render.render(write_still=True)

    # --- jerarquía ---
    armatures = [armature]
    source = bpy.data.objects.get('skin.001')
    if source:
        armatures.append(source)
    write_hierarchy(
        os.path.join(out_dir, 'bones_hierarchy.txt'),
        armatures,
        bpy.data.filepath,
    )
    log('listo')


main()
