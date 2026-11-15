"""App icon: a white jet climbing through a dusk sky that runs purple (top) to orange (bottom).
Pure Python (zlib + struct), no image library. Usage: python3 icons2.py <out dir>
"""
import math
import os
import struct
import sys
import zlib

OUT = sys.argv[1]
SS = 4  # supersampling per axis

# Sky, top to bottom: deep violet, violet, magenta dusk, orange, amber.
STOPS = [
    (0.00, (0x3B, 0x1A, 0x8F)),
    (0.38, (0x7C, 0x3A, 0xED)),
    (0.62, (0xC9, 0x3F, 0x8E)),
    (0.82, (0xF9, 0x73, 0x16)),
    (1.00, (0xFD, 0xA0, 0x3A)),
]
WHITE = (255, 255, 255)

# Jet, plan view, nose up, in a unit box (nose y=-1, tail y=+1). Right half, top to bottom.
HALF = [
    (0.00, -1.00), (0.07, -0.86), (0.105, -0.66), (0.11, -0.20),
    (0.95, 0.30), (0.95, 0.42), (0.11, 0.18), (0.10, 0.62),
    (0.40, 0.86), (0.40, 0.95), (0.07, 0.86), (0.00, 1.00),
]
JET = HALF + [(-x, y) for x, y in reversed(HALF[1:-1])]


def sky(t):
    t = min(1.0, max(0.0, t))
    for (t0, c0), (t1, c1) in zip(STOPS, STOPS[1:]):
        if t <= t1:
            k = (t - t0) / (t1 - t0)
            return tuple(round(c0[i] + (c1[i] - c0[i]) * k) for i in range(3))
    return STOPS[-1][1]


def jet_points(size, scale, angle_deg=45):
    """Jet polygon in hi-res pixel coordinates, rotated to climb toward the upper right."""
    a = math.radians(angle_deg)
    ca, sa = math.cos(a), math.sin(a)
    half = size * scale * SS
    cx = cy = size * SS / 2
    return [(cx + (x * ca - y * sa) * half, cy + (x * sa + y * ca) * half) for x, y in JET]


def fill_mask(points, W):
    """Even-odd scanline fill of one simple polygon into a W x W mask."""
    mask = [bytearray(W) for _ in range(W)]
    n = len(points)
    for y in range(W):
        yc = y + 0.5
        xs = []
        for i in range(n):
            x0, y0 = points[i]
            x1, y1 = points[(i + 1) % n]
            if (y0 <= yc < y1) or (y1 <= yc < y0):
                xs.append(x0 + (yc - y0) * (x1 - x0) / (y1 - y0))
        xs.sort()
        row = mask[y]
        for j in range(0, len(xs) - 1, 2):
            a = max(0, math.ceil(xs[j] - 0.5))
            b = min(W, math.floor(xs[j + 1] - 0.5) + 1)
            if b > a:
                row[a:b] = b'\x01' * (b - a)
    return mask


def corner_alpha(px, py, size, r):
    """Coverage of the rounded square at this pixel (1.0 away from the corners)."""
    if r <= 0:
        return 1.0
    if r <= px < size - r or r <= py < size - r:
        return 1.0
    hit = 0
    for sy in range(SS):
        for sx in range(SS):
            x = px + (sx + 0.5) / SS
            y = py + (sy + 0.5) / SS
            cx = min(max(x, r), size - r)
            cy = min(max(y, r), size - r)
            if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
                hit += 1
    return hit / (SS * SS)


def draw(size, radius_frac, scale, transparent):
    mask = fill_mask(jet_points(size, scale), size * SS)
    r = size * radius_frac
    n = SS * SS
    rows = []
    for py in range(size):
        row = bytearray([0])
        block = mask[py * SS:(py + 1) * SS]
        for px in range(size):
            # The sky tilts a little: lighter toward the lower left, like a sun just set.
            t = (py + 0.5) / size * 0.92 + (1 - (px + 0.5) / size) * 0.08
            bg = sky(t)
            cov = sum(sum(b[px * SS:(px + 1) * SS]) for b in block) / n
            col = [round(bg[i] * (1 - cov) + WHITE[i] * cov) for i in range(3)]
            a = corner_alpha(px, py, size, r) if transparent else 1.0
            row += bytes([*col, round(255 * a)])
        rows.append(bytes(row))
    raw = b''.join(rows)

    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)

    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))


for name, size, rad, scale, tr in [
    ('icon-192.png', 192, 0.22, 0.36, True),
    ('icon-512.png', 512, 0.22, 0.36, True),
    ('maskable-512.png', 512, 0, 0.27, False),   # keeps the jet inside the maskable safe zone
    ('apple-touch-icon.png', 180, 0, 0.34, False),
]:
    path = os.path.join(OUT, name)
    with open(path, 'wb') as f:
        f.write(draw(size, rad, scale, tr))
    print(name, os.path.getsize(path))
