"""
OUTORBIT — Prepara los clips de caminar de NYX para el juego.

Lee los tres clips aprobados de `animaciones_generadas/procesadas/`
(`nyx_caminar_start/bucle/end.glb`), corrige la altura de la cadera y los
escribe en `public/models/` con los nombres que carga el juego:

    nyx_walk_start.glb   arranque  (LoopOnce)
    nyx_walk_loop.glb    bucle     (LoopRepeat)
    nyx_walk_end.glb     frenada   (LoopOnce)

El retargeting de Kimodo dejó la cadera ~11 cm alta respecto al rig del
juego, así que los pies flotaban sobre el suelo. El script mide la Y mínima
de la malla skinneada en todos los frames de los tres clips y resta ese
valor a la pista de traslación de `hips`: el punto más bajo de la suela
queda en Y = 0 y la continuidad entre clips se mantiene, porque el
desplazamiento es el mismo para los tres.

Los clips no tienen root motion (la traslación de `hips` solo varía en Y),
así que el avance lo sigue poniendo el controlador del juego.

Uso:
  python3 scripts/nyx_walk_clips.py [--src DIR] [--dst DIR]
"""

import argparse
import json
import os
import struct

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_SRC = os.path.join(ROOT, 'animaciones_generadas', 'procesadas')
DEFAULT_DST = os.path.join(ROOT, 'public', 'models')
GAME_MODEL = os.path.join(DEFAULT_DST, 'nyx_rigged.glb')

# (archivo de origen, nombre de destino, nombre del clip dentro del GLB)
CLIPS = [
    ('nyx_caminar_start.glb', 'nyx_walk_start.glb', 'walk_start'),
    ('nyx_caminar_bucle.glb', 'nyx_walk_loop.glb', 'walk_loop'),
    ('nyx_caminar_end.glb', 'nyx_walk_end.glb', 'walk_end'),
]

COMPONENT = {5120: ('b', 1), 5121: ('B', 1), 5122: ('h', 2), 5123: ('H', 2),
             5125: ('I', 4), 5126: ('f', 4)}
NCOMP = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


# --- Lectura / escritura de GLB ---------------------------------------------

def read_glb(path):
    with open(path, 'rb') as f:
        data = f.read()
    _, _, length = struct.unpack_from('<III', data, 0)
    off, js, bin_ = 12, None, None
    while off < length:
        clen, ctype = struct.unpack_from('<II', data, off)
        off += 8
        chunk = data[off:off + clen]
        off += clen
        if ctype == 0x4E4F534A:
            js = json.loads(chunk.decode('utf-8'))
        elif ctype == 0x004E4942:
            bin_ = bytearray(chunk)
    return js, bin_


def write_glb(path, js, bin_):
    raw = json.dumps(js, separators=(',', ':')).encode('utf-8')
    raw += b' ' * (-len(raw) % 4)
    blob = bytes(bin_)
    blob += b'\0' * (-len(blob) % 4)
    total = 12 + 8 + len(raw) + 8 + len(blob)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(raw), 0x4E4F534A))
        f.write(raw)
        f.write(struct.pack('<II', len(blob), 0x004E4942))
        f.write(blob)


def read_accessor(js, bin_, index):
    acc = js['accessors'][index]
    view = js['bufferViews'][acc['bufferView']]
    fmt, size = COMPONENT[acc['componentType']]
    n = NCOMP[acc['type']]
    base = view.get('byteOffset', 0) + acc.get('byteOffset', 0)
    stride = view.get('byteStride', size * n)
    out = np.zeros((acc['count'], n), dtype=np.float32)
    for k in range(acc['count']):
        out[k] = struct.unpack_from('<' + fmt * n, bin_, base + k * stride)
    return out


def accessor_slice(js, index):
    """(byteOffset absoluto, stride, count, ncomp) de un accessor float32."""
    acc = js['accessors'][index]
    view = js['bufferViews'][acc['bufferView']]
    n = NCOMP[acc['type']]
    base = view.get('byteOffset', 0) + acc.get('byteOffset', 0)
    stride = view.get('byteStride', 4 * n)
    return base, stride, acc['count'], n


# --- Cinemática directa + skinning ------------------------------------------

def quat_to_mat(q):
    x, y, z, w = q
    return np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ])


def local_matrices(js, bin_, anim, frame):
    """Matrices locales de cada nodo en `frame` (las animadas pisan el reposo)."""
    names = [n.get('name', '?') for n in js['nodes']]
    over = {}
    for ch in anim['channels']:
        node = names[ch['target']['node']]
        path = ch['target']['path']
        values = read_accessor(js, bin_, anim['samplers'][ch['sampler']]['output'])
        over[(node, path)] = values[min(frame, len(values) - 1)]
    mats = []
    for node in js['nodes']:
        name = node.get('name', '?')
        t = np.array(over.get((name, 'translation'), node.get('translation', [0, 0, 0])), dtype=np.float64)
        r = np.array(over.get((name, 'rotation'), node.get('rotation', [0, 0, 0, 1])), dtype=np.float64)
        s = np.array(over.get((name, 'scale'), node.get('scale', [1, 1, 1])), dtype=np.float64)
        m = np.eye(4)
        m[:3, :3] = quat_to_mat(r) * s
        m[:3, 3] = t
        mats.append(m)
    return names, mats


def world_matrices(js, mats):
    parent = {}
    for i, node in enumerate(js['nodes']):
        for child in node.get('children', []):
            parent[child] = i
    world = [None] * len(mats)

    def resolve(i):
        if world[i] is None:
            world[i] = mats[i] if i not in parent else resolve(parent[i]) @ mats[i]
        return world[i]

    for i in range(len(mats)):
        resolve(i)
    return world


def load_skin_source(path):
    """Malla + skin del modelo del juego, en el orden de joints del skin."""
    js, bin_ = read_glb(path)
    names = [n.get('name', '?') for n in js['nodes']]
    skin = js['skins'][0]
    joints = skin['joints']
    ibm = read_accessor(js, bin_, skin['inverseBindMatrices']).reshape(-1, 4, 4)
    ibm = ibm.transpose(0, 2, 1)  # column-major -> row-major
    verts, jidx, wts = [], [], []
    for mesh in js['meshes']:
        for prim in mesh['primitives']:
            attrs = prim['attributes']
            if 'JOINTS_0' not in attrs:
                continue
            verts.append(read_accessor(js, bin_, attrs['POSITION']))
            jidx.append(read_accessor(js, bin_, attrs['JOINTS_0']).astype(np.int32))
            wts.append(read_accessor(js, bin_, attrs['WEIGHTS_0']))
    return {
        'names': names,
        'joints': joints,
        'ibm': ibm,
        'verts': np.concatenate(verts),
        'joints_idx': np.concatenate(jidx),
        'weights': np.concatenate(wts),
    }


def min_skinned_y(js, bin_, anim, frame, source):
    names, mats = local_matrices(js, bin_, anim, frame)
    world = world_matrices(js, mats)
    by_name = {names[i]: world[i] for i in range(len(names))}
    joint_world = np.stack([by_name[source['names'][j]] for j in source['joints']])
    skin_mats = joint_world @ source['ibm']
    out = np.zeros_like(source['verts'])
    for k in range(4):
        m = skin_mats[source['joints_idx'][:, k]]
        p = np.einsum('nij,nj->ni', m[:, :3, :3], source['verts']) + m[:, :3, 3]
        out += source['weights'][:, k:k + 1] * p
    return float(out[:, 1].min())


# --- Corrección -------------------------------------------------------------

def hips_translation_accessor(js, anim):
    names = [n.get('name', '?') for n in js['nodes']]
    for ch in anim['channels']:
        if names[ch['target']['node']] == 'hips' and ch['target']['path'] == 'translation':
            return anim['samplers'][ch['sampler']]['output']
    raise SystemExit('el clip no anima hips.translation')


def shift_hips(bin_, js, accessor, dy):
    base, stride, count, ncomp = accessor_slice(js, accessor)
    for k in range(count):
        off = base + k * stride + 4  # componente Y
        (y,) = struct.unpack_from('<f', bin_, off)
        struct.pack_into('<f', bin_, off, y + dy)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--src', default=DEFAULT_SRC)
    parser.add_argument('--dst', default=DEFAULT_DST)
    args = parser.parse_args()

    source = load_skin_source(GAME_MODEL)

    loaded = []
    lowest = float('inf')
    for src_name, dst_name, clip_name in CLIPS:
        path = os.path.join(args.src, src_name)
        js, bin_ = read_glb(path)
        anim = js['animations'][0]
        frames = len(read_accessor(js, bin_, anim['samplers'][0]['input']))
        clip_min = min(min_skinned_y(js, bin_, anim, f, source) for f in range(frames))
        lowest = min(lowest, clip_min)
        loaded.append((src_name, dst_name, clip_name, js, bin_, anim, frames, clip_min))
        print('%-22s %3d frames  minY=%.4f' % (src_name, frames, clip_min))

    print('\ndesplazamiento global: %.4f m' % lowest)

    os.makedirs(args.dst, exist_ok=True)
    for src_name, dst_name, clip_name, js, bin_, anim, frames, clip_min in loaded:
        shift_hips(bin_, js, hips_translation_accessor(js, anim), -lowest)
        anim['name'] = clip_name
        out = os.path.join(args.dst, dst_name)
        write_glb(out, js, bin_)
        print('  %-22s -> %s  (%.1f KB)' % (src_name, dst_name, os.path.getsize(out) / 1024))

    # Verificación: el punto más bajo de la suela debe quedar en Y = 0.
    print('\nverificación:')
    for src_name, dst_name, clip_name, js, bin_, anim, frames, clip_min in loaded:
        path = os.path.join(args.dst, dst_name)
        vjs, vbin = read_glb(path)
        vanim = vjs['animations'][0]
        vframes = len(read_accessor(vjs, vbin, vanim['samplers'][0]['input']))
        lo = min(min_skinned_y(vjs, vbin, vanim, f, source) for f in range(vframes))
        print('  %-22s minY=%.5f  clip="%s"' % (dst_name, lo, vanim['name']))


if __name__ == '__main__':
    main()
