"""Genera clips de carrera con el servidor MMCP local de Kimodo.

Uso:
  python3 scripts/kimodo_generate_run.py --prompt "..." --frames 60 --samples 8 \
      --seed 42 --out animaciones_generadas/en_espera/kimodo_correr_s42.gltf

El servidor devuelve un glTF con una animacion `sample_N` por muestra y los
contactos de pie en la extension del documento.
"""

import argparse
import json
import os
import sys
import urllib.request

SERVER = "http://localhost:8000"
PROTOCOL = "1.4"
MODEL = "soma30"
FPS = 30.0

DEFAULT_PROMPT = (
    "a person running forward at a fast, steady, even pace, "
    "athletic sprint, arms pumping at the sides"
)


def get_capabilities(server=SERVER):
    with urllib.request.urlopen(server + "/capabilities", timeout=30) as r:
        return json.load(r)


def build_request(skeleton, prompt, frames, samples, seed, steps, guidance=None):
    req = {
        "protocol_version": PROTOCOL,
        "model": MODEL,
        "skeleton": skeleton,
        "segments": [
            {"type": "text", "prompt": prompt, "duration_frames": frames,
             "language": "en"}
        ],
        "constraints": [],
        "timing": {"fps": FPS},
        "options": {
            "num_samples": samples,
            "diffusion_steps": steps,
            "post_processing": True,
        },
    }
    if seed is not None:
        req["options"]["seed"] = seed
    if guidance is not None:
        req["options"]["guidance"] = guidance
    return req


def generate(req, server=SERVER, timeout=1800):
    body = json.dumps(req).encode()
    r = urllib.request.Request(
        server + "/generate", data=body,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(r, timeout=timeout) as resp:
        return resp.read()


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--prompt", default=DEFAULT_PROMPT)
    ap.add_argument("--frames", type=int, default=60)
    ap.add_argument("--samples", type=int, default=8)
    ap.add_argument("--seed", type=int, default=None)
    ap.add_argument("--steps", type=int, default=100)
    ap.add_argument("--out", required=True)
    ap.add_argument("--server", default=SERVER)
    args = ap.parse_args(argv)

    caps = get_capabilities(args.server)
    model = next(m for m in caps["models"] if m["id"] == MODEL)
    skeleton = model["canonical_skeleton"]

    req = build_request(skeleton, args.prompt, args.frames, args.samples,
                        args.seed, args.steps)
    print(f"[kimodo] {args.samples} muestras x {args.frames} frames "
          f"({args.frames / FPS:.2f} s) seed={args.seed}", flush=True)
    data = generate(req, args.server)

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "wb") as f:
        f.write(data)

    doc = json.loads(data)
    anims = [a.get("name") for a in doc.get("animations", [])]
    print(f"[kimodo] {len(data)} bytes -> {args.out}")
    print(f"[kimodo] animaciones: {anims}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
