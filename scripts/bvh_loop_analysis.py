"""
Analiza un BVH de BlendCap: busca el periodo de bucle y mide la zancada.

Lee la jerarquia y las canales de rotacion, hace cinematica directa y compara
la pose completa (posiciones de todos los joints, normalizadas por la cadera)
de cada frame con la de `P` frames despues. El minimo de la diferencia media da
el periodo. Se hace fuera de Blender porque iterar aqui es mucho mas rapido.

Uso:
  python3 scripts/bvh_loop_analysis.py animaciones_generadas/blendcap/run_lean.bvh
"""

import sys

import numpy as np

FPS = 24.0


def parse_bvh(path):
    with open(path, "r", errors="replace") as fh:
        lines = fh.read().splitlines()

    joints = []          # (name, parent_index, offset, channel_order)
    stack = []
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if line.startswith("ROOT") or line.startswith("JOINT"):
            name = line.split()[1]
            parent = stack[-1] if stack else -1
            joints.append({"name": name, "parent": parent, "offset": None, "channels": []})
            stack.append(len(joints) - 1)
        elif line.startswith("End Site"):
            # Saltar el bloque completo: End Site { OFFSET ... }. Si no se
            # consume entero, su `}` cierra un JOINT de la pila y la jerarquia
            # queda corrupta.
            while i < len(lines) and "{" not in lines[i]:
                i += 1
            depth = 0
            while i < len(lines):
                if "{" in lines[i]:
                    depth += 1
                if "}" in lines[i]:
                    depth -= 1
                    if depth == 0:
                        break
                i += 1
        elif line.startswith("OFFSET"):
            joints[stack[-1]]["offset"] = np.array([float(v) for v in line.split()[1:4]])
        elif line.startswith("CHANNELS"):
            parts = line.split()
            joints[stack[-1]]["channels"] = parts[2:2 + int(parts[1])]
        elif line == "}":
            if stack:
                stack.pop()
        elif line.startswith("MOTION"):
            break
        i += 1

    while not lines[i].startswith("Frames:"):
        i += 1
    frame_count = int(lines[i].split()[1])
    i += 1
    # Tras `Frames:` viene `Frame Time:` y luego ya los datos numericos.
    while i < len(lines) and lines[i].strip()[:1] not in "-0123456789":
        i += 1
    motion = np.array([[float(v) for v in lines[j].split()]
                       for j in range(i, i + frame_count)])
    return joints, motion


def euler_matrix(order, angles):
    """Rotacion XYZ en el orden que declara el BVH (grados)."""
    out = np.eye(3)
    for axis in order:
        a = np.radians(angles[axis])
        c, s = np.cos(a), np.sin(a)
        if axis == "X":
            r = np.array([[1, 0, 0], [0, c, -s], [0, s, c]])
        elif axis == "Y":
            r = np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
        else:
            r = np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])
        out = out @ r
    return out


def forward_kinematics(joints, motion):
    """Posiciones world de cada joint por frame (n_frames, n_joints, 3)."""
    n_frames = motion.shape[0]
    positions = np.zeros((n_frames, len(joints), 3))
    rotations = [None] * len(joints)

    for f in range(n_frames):
        cursor = 0
        for j, joint in enumerate(joints):
            chans = joint["channels"]
            values = motion[f, cursor:cursor + len(chans)]
            cursor += len(chans)
            chan = dict(zip(chans, values))

            local = np.eye(3)
            order = [c[0] for c in chans if c.endswith("rotation")]
            if order:
                local = euler_matrix(order, {c[0]: chan[c] for c in chans
                                             if c.endswith("rotation")})
            parent = joint["parent"]
            if parent < 0:
                rotations[j] = local
                positions[f, j] = [chan.get("Xposition", 0.0),
                                   chan.get("Yposition", 0.0),
                                   chan.get("Zposition", 0.0)]
            else:
                rotations[j] = rotations[parent] @ local
                # `Hips` trae 6 canales: su traslacion animada sustituye al
                # OFFSET. Ignorarla dejaba la cadera clavada en su altura de
                # bind y el ciclo parecia no tener bob.
                if "Xposition" in chan:
                    local_pos = np.array([chan["Xposition"], chan["Yposition"],
                                          chan["Zposition"]])
                else:
                    local_pos = joint["offset"]
                positions[f, j] = positions[f, parent] + rotations[parent] @ local_pos
    return positions


def main():
    path = sys.argv[1]
    skip = int(sys.argv[2]) if len(sys.argv) > 2 else 0
    joints, motion = parse_bvh(path)
    names = [j["name"] for j in joints]
    pos = forward_kinematics(joints, motion)
    n = pos.shape[0]
    print(f"{path}: {n} frames, {len(joints)} joints, skip {skip}")

    li = names.index("LeftFoot") if "LeftFoot" in names else None
    ri = names.index("RightFoot") if "RightFoot" in names else None
    hi = names.index("Hips")
    if li is not None and ri is not None:
        print("\nframe  sep    hipsY   lfY     rfY")
        for f in range(skip, n, 2):
            s = np.linalg.norm(pos[f, li, [0, 2]] - pos[f, ri, [0, 2]])
            print(f"{f:5d}  {s:.3f}  {pos[f, hi, 1]:.3f}  "
                  f"{pos[f, li, 1]:.3f}  {pos[f, ri, 1]:.3f}")

    # Firma de pose: posiciones relativas a la cadera, aplanadas.
    sig = (pos - pos[:, hi:hi + 1, :]).reshape(n, -1)
    sig = sig[skip:]
    m = sig.shape[0]

    print("\nperiodo  error_medio(m)")
    scores = []
    for period in range(8, m // 2):
        diff = np.linalg.norm(sig[:m - period] - sig[period:], axis=1).mean()
        scores.append((diff, period))
    scores.sort()
    print("\nmejores periodos:")
    for diff, period in scores[:8]:
        print(f"  {period:3d} frames ({period / FPS:.2f}s)  error {diff:.4f} m")

    # ¿Cierra el clip? Se compara el primer frame con el ultimo y se mide
    # contra el paso medio entre frames consecutivos: un ratio bajo significa
    # que el clip se puede reproducir en bucle sin costura visible.
    step = np.linalg.norm(np.diff(sig, axis=0), axis=1).mean()
    close = np.linalg.norm(sig[0] - sig[-1])
    print(f"\ncierre: primer vs ultimo frame {close:.4f} m "
          f"(paso medio {step:.4f} m, ratio {close / step:.1f})")

    # Mejor sub-segmento que cierra: par (i, j) con la pose mas parecida y al
    # menos `min_len` frames de separacion. Es lo que se recorta para tener un
    # bucle sin costura cuando el clip entero no cierra.
    min_len = max(12, m // 4)
    best = None
    for i in range(m - min_len):
        d = np.linalg.norm(sig[i + min_len:] - sig[i], axis=1)
        j = int(np.argmin(d)) + i + min_len
        if best is None or d[j - i - min_len] < best[0]:
            best = (float(d[j - i - min_len]), i, j)
    if best is not None:
        err, i, j = best
        print(f"mejor sub-segmento: {i}..{j} ({j - i} frames, "
              f"{(j - i) / FPS:.2f}s) error {err:.4f} m "
              f"(ratio {err / step:.1f})")


main()
