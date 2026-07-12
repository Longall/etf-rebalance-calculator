#!/usr/bin/env python3
"""Generate dependency-free PNG icons for ETF Rebalance."""

import struct
import zlib
from pathlib import Path


BG = (23, 35, 31, 255)
WHITE = (255, 255, 255, 255)
GREEN = (104, 179, 140, 255)


def inside_polygon(x, y, points):
    odd = False
    j = len(points) - 1
    for i, (xi, yi) in enumerate(points):
        xj, yj = points[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            odd = not odd
        j = i
    return odd


def make_png(size, path):
    scale = size / 512
    upper = [(128, 153), (312, 153), (277, 118), (307, 88), (393, 174),
             (307, 260), (277, 230), (312, 195), (128, 195)]
    lower = [(384, 359), (200, 359), (235, 394), (205, 424), (119, 338),
             (205, 252), (235, 282), (200, 317), (384, 317)]
    rows = []
    for py in range(size):
        row = bytearray([0])
        y = (py + 0.5) / scale
        for px in range(size):
            x = (px + 0.5) / scale
            color = BG
            if inside_polygon(x, y, upper) or (108 <= x <= 152 and 105 <= y <= 215):
                color = WHITE if inside_polygon(x, y, upper) else GREEN
            elif inside_polygon(x, y, lower) or (360 <= x <= 404 and 297 <= y <= 407):
                color = GREEN if inside_polygon(x, y, lower) else WHITE
            row.extend(color)
        rows.append(bytes(row))
    raw = b''.join(rows)

    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))

    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(raw, 9))
    png += chunk(b'IEND', b'')
    path.write_bytes(png)


root = Path(__file__).resolve().parents[1]
icons = root / 'icons'
icons.mkdir(exist_ok=True)
for filename, size in [('icon-192.png', 192), ('icon-512.png', 512), ('apple-touch-icon.png', 180)]:
    make_png(size, icons / filename)
