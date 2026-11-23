#!/usr/bin/env python3
"""Limpia metadatos de un GLB sin tocar geometria, materiales ni animaciones.

Que elimina:
  - asset.copyright, asset.extras, asset.generator (o lo normaliza)
  - extras / extensions de nodos, mallas, materiales, skins, animaciones
  - nombres no-ASCII (opcional, con --ascii-names)

Que NO toca:
  - buffers, accessors, meshes, skins, animations, materials
  - la estructura de nodos ni el orden

Uso:
    python3 glb_strip_metadata.py entrada.glb salida.glb
    python3 glb_strip_metadata.py entrada.glb salida.glb --ascii-names
    python3 glb_strip_metadata.py *.glb --in-place --ascii-names
"""

import argparse
import json
import os
import re
import struct
import sys

GLB_MAGIC = 0x46546C67
CHUNK_JSON = 0x4E4F534A
CHUNK_BIN = 0x004E4942

# Claves de metadatos que se eliminan de cualquier objeto glTF.
STRIP_KEYS = ("extras",)

# Nombres de nodo que Blender usa como marcadores internos y que conviene
# dejar intactos aunque no sean ASCII.
KEEP_NAMES = {"Armature", "Root"}


def read_glb(path):
    with open(path, "rb") as f:
        data = f.read()

    if len(data) < 12:
        raise ValueError("fichero demasiado corto para ser un GLB")

    magic, version, total = struct.unpack_from("<III", data, 0)
    if magic != GLB_MAGIC:
        raise ValueError("no es un GLB (magic incorrecto)")
    if version != 2:
        raise ValueError(f"version glTF no soportada: {version}")
    if total != len(data):
        raise ValueError(f"longitud declarada ({total}) != real ({len(data)})")

    offset = 12
    json_chunk = None
    bin_chunk = None

    while offset < len(data):
        if offset + 8 > len(data):
            raise ValueError("chunk truncado")
        clen, ctype = struct.unpack_from("<II", data, offset)
        offset += 8
        payload = data[offset:offset + clen]
        if len(payload) != clen:
            raise ValueError("chunk truncado")
        offset += clen

        if ctype == CHUNK_JSON:
            json_chunk = payload
        elif ctype == CHUNK_BIN:
            bin_chunk = payload

    if json_chunk is None:
        raise ValueError("GLB sin chunk JSON")

    return json.loads(json_chunk), bin_chunk


def write_glb(path, gltf, bin_chunk):
    json_bytes = json.dumps(gltf, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    # El chunk JSON se rellena con espacios, el BIN con ceros.
    json_pad = (4 - len(json_bytes) % 4) % 4
    json_bytes += b" " * json_pad

    chunks = [(CHUNK_JSON, json_bytes)]
    if bin_chunk is not None:
        bin_pad = (4 - len(bin_chunk) % 4) % 4
        chunks.append((CHUNK_BIN, bin_chunk + b"\x00" * bin_pad))

    body = b""
    for ctype, payload in chunks:
        body += struct.pack("<II", len(payload), ctype) + payload

    total = 12 + len(body)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", GLB_MAGIC, 2, total))
        f.write(body)


def ascii_name(name, used, prefix):
    """Convierte un nombre a ASCII seguro y unico.

    Si el nombre queda vacio o solo numerico tras quitar los caracteres no-ASCII,
    se usa el prefijo de la coleccion para que siga siendo identificable.
    """
    if name in KEEP_NAMES:
        return name
    cleaned = name.encode("ascii", "ignore").decode("ascii")
    cleaned = re.sub(r"[^A-Za-z0-9_.-]+", "_", cleaned).strip("_")
    if not cleaned or cleaned.isdigit():
        cleaned = prefix
    candidate = cleaned
    n = 1
    while candidate in used:
        n += 1
        candidate = f"{cleaned}_{n}"
    used.add(candidate)
    return candidate


def strip(gltf, ascii_names=False, generator=None):
    stats = {"extras": 0, "renamed": 0}

    # --- asset ---------------------------------------------------------
    asset = gltf.setdefault("asset", {})
    for key in ("copyright", "extras"):
        if key in asset:
            del asset[key]
            stats["extras"] += 1
    if generator is not None:
        asset["generator"] = generator
    elif "generator" in asset:
        del asset["generator"]
        stats["extras"] += 1

    # --- extras en cualquier coleccion de objetos ----------------------
    for collection in (
        "nodes", "meshes", "materials", "skins", "animations",
        "textures", "images", "samplers", "accessors", "bufferViews",
        "buffers", "cameras", "scenes",
    ):
        for item in gltf.get(collection, []):
            for key in STRIP_KEYS:
                if key in item:
                    del item[key]
                    stats["extras"] += 1

    # --- nombres no-ASCII ---------------------------------------------
    if ascii_names:
        used = set()
        prefixes = {
            "nodes": "node", "meshes": "mesh", "materials": "material",
            "animations": "anim", "skins": "skin",
        }
        for collection, prefix in prefixes.items():
            for item in gltf.get(collection, []):
                name = item.get("name")
                if name is None:
                    continue
                if name.isascii():
                    used.add(name)
                    continue
                item["name"] = ascii_name(name, used, prefix)
                stats["renamed"] += 1

    return stats


def main():
    ap = argparse.ArgumentParser(description="Limpia metadatos de ficheros GLB.")
    ap.add_argument("inputs", nargs="+", help="ficheros .glb de entrada")
    ap.add_argument("-o", "--output", default=None,
                    help="fichero de salida (solo con una entrada)")
    ap.add_argument("--in-place", action="store_true", help="sobrescribe la entrada")
    ap.add_argument("--ascii-names", action="store_true",
                    help="renombra nodos/mallas/materiales a ASCII")
    ap.add_argument("--generator", default=None,
                    help="valor fijo para asset.generator (por defecto se elimina)")
    args = ap.parse_args()

    if args.in_place and args.output:
        ap.error("--in-place y --output son excluyentes")
    if not args.in_place and not args.output:
        ap.error("falta -o/--output (o usa --in-place)")
    if not args.in_place and len(args.inputs) > 1:
        ap.error("con varias entradas usa --in-place")

    for src in args.inputs:
        dst = src if args.in_place else args.output
        try:
            gltf, bin_chunk = read_glb(src)
            stats = strip(gltf, ascii_names=args.ascii_names, generator=args.generator)
            write_glb(dst, gltf, bin_chunk)
            print(f"{os.path.basename(src)} -> {os.path.basename(dst)}  "
                  f"extras={stats['extras']} renombrados={stats['renamed']}")
        except Exception as exc:
            print(f"{os.path.basename(src)}: ERROR {exc}", file=sys.stderr)
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
