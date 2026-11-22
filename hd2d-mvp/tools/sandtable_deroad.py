#!/usr/bin/env python3
"""The sand table's ground without its baked roads (2026-11-21): the 战略地图 draws no road until asked (src/strategyroads.js).
  python3 -I hd2d-mvp/tools/sandtable_deroad.py <board dir as baked> <dest dir>
The bake (blender_sandtable.py) paints the 64 roads into the ground. This paints them out again along board.json's road courses,
in every picture the bake left a mark in:
  albedo.webp  the road earth, a ribbon about 0.065 wide
  light.webp   lamp and sky about 10% darker along the ribbon's two edges, fading out some 0.14 from the centre line (measured:
               R 78 at the edge against 92 beside), so a wider strip than the earth
  mask.png     the vegetation weights a little lower on the roads; its alpha, the bake's mark for the roads, goes opaque
Each fill is the ground either side (a normalised blur) and, for the albedo, the grain of the ground a little to the side.
<board dir as baked> must be the bake's own output: run on its own result it would only blur the strips again. Writes the three
pictures into <dest dir> (the others and board.json are not touched). A later rebake should leave the road meshes out instead
(bake(): `face`), and then this script is not needed."""
import json, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
Image.MAX_IMAGE_PIXELS = None
src, dst = sys.argv[1], sys.argv[2]
board = json.load(open(f'{src}/board.json')); X0, X1, Z0, Z1 = board['box']
ROAD = 0.11  # world units painted out across a road (the baked ribbon is about 0.065 wide, its edge soft)

def blurf(arr, r):  # Pillow blurs 8-bit pictures only: scale the plane to 0..255 and back
    top = max(float(arr.max()), 1e-6)
    return np.asarray(Image.fromarray(np.clip(arr / top * 255, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r)), dtype=np.float32) / 255 * top

def deroad(im, grainy=True, road=ROAD):
    w, h = im.size; W = max(4, round(road * w / (X1 - X0)))
    M = Image.new('L', (w, h), 0); d = ImageDraw.Draw(M)
    for r in board['roads']:
        p = np.array(r['p'], dtype=np.float64).reshape(-1, 3)
        xy = [((x - X0) / (X1 - X0) * w, (z - Z0) / (Z1 - Z0) * h) for x, _, z in p]
        d.line(xy, fill=255, width=W, joint='curve')
        for q in xy: d.ellipse([q[0] - W / 2, q[1] - W / 2, q[0] + W / 2, q[1] + W / 2], fill=255)
    m = np.asarray(M, dtype=np.float32) / 255; a = np.asarray(im, dtype=np.float32); C = a.shape[2]
    # Smooth fill: the ground either side, weighted by distance; twice, the second pass wider for the junctions.
    fill = a.copy(); known = 1 - m
    for rad in (W * 0.6, W * 1.5):
        wsum = blurf(known, rad)
        est = np.stack([blurf(fill[..., c] * known, rad) for c in range(C)], -1) / np.maximum(wsum, 1e-4)[..., None]
        ok = (wsum > 0.08) & (known < 1)
        fill[ok] = est[ok]; known = np.maximum(known, ok.astype(np.float32))
    grain = np.zeros_like(a)
    if grainy:  # the ground's fine detail from a little to the side, wherever that side is not road itself
        hf = a - np.stack([blurf(a[..., c], 3) for c in range(C)], -1)
        wide = np.asarray(M.filter(ImageFilter.MaxFilter(7)), dtype=np.float32) / 255
        got = np.zeros((h, w), bool); S = int(W * 1.6)
        for dx, dy in ((S, 0), (-S, 0), (0, S), (0, -S), (S, S), (-S, -S), (S, -S), (-S, S), (2 * S, 0), (0, 2 * S)):
            take = (np.roll(wide, (dy, dx), (0, 1)) < 0.5) & ~got
            grain[take] = np.roll(hf, (dy, dx), (0, 1))[take]; got |= take
    soft = blurf(m, max(1.0, W / 12))[..., None]
    return Image.fromarray(np.clip(a * (1 - soft) + np.clip(fill + grain, 0, 255) * soft, 0, 255).astype(np.uint8))

deroad(Image.open(f'{src}/albedo.webp').convert('RGB')).save(f'{dst}/albedo.webp', quality=88, method=6)
# The light's dark rim lies along the ribbon's edges and fades out about 0.14 from the centre line: a wider strip.
deroad(Image.open(f'{src}/light.webp').convert('RGB'), grainy=False, road=0.3).save(f'{dst}/light.webp', quality=92, method=6)
mk = deroad(Image.open(f'{src}/mask.png').convert('RGB'), grainy=False).convert('RGBA'); mk.putalpha(255); mk.save(f'{dst}/mask.png', optimize=True)
print('roads', len(board['roads']), 'painted out of albedo, light and mask')
