#!/usr/bin/env python3
"""Blend an extension region's baked pictures into the boards it lies flush against.

  python3 -I tools/region_seam_blend.py <region bake dest> <original board dir> <installed region dir> [<installed neighbour dir> ...]

The region (docs/战略地图右侧扩展_方案_2026-11-17.md, docs/战略地图日本地块_方案_2026-11-17.md) is baked on its own, so along a seam
its light map has the bake's own edge shadow, its sea map other shallows, its albedo and masks other ground than the neighbour's
edge. Over a narrow band from each seam each picture eases from the neighbour's ground mirrored across the seam to its own, as sandtable.js eases the heights (opts.seams): from its west side into the last column of the board west of it (the
original, or the north strip already installed), and from its south side into the first row of the original.

The original's bake shaded its own frame into the rows along its north edge, which were the board's edge until the north strip
came. For a region flush north of it, the gains that lift those rows to the rows past them are measured here and written into the
region's board.json (mainEdge): the game applies them to the original's pictures when that region is loaded (sandregions.js
liftEdge), and the seams here ease into the lifted rows. Neighbours read later (japan against the original's top corner) lift
the original the same way from any installed neighbour's mainEdge.

Reads the bake's pictures and board.json from the dest dir, never changes them, and writes the blended ones into the installed
dir, so it can run again after a re-bake. Run the neighbours first (north before japan).
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

# World units over which each picture eases in: the light map's edge shadow and the sea's shallows want a wider band than
# the ground's colour, which would smear the neighbour's edge across the region's own coast.
BANDS = {'light.webp': 0.5, 'sea.png': 0.7, 'albedo.webp': 0.25, 'mask.png': 0.25}
LIFT = {'light.webp': 'light', 'albedo.webp': 'albedo'}  # the original's pictures whose frame shade is lifted (S.light, S.albedo)
SHADE, REF = 0.2, 0.35  # world units: the shaded band along the original's north edge, and the rows past it it is measured against


def picture(path):
    im = Image.open(path)
    mode = 'RGBA' if im.mode == 'RGBA' else 'RGB'
    return np.asarray(im.convert(mode)).astype(np.float32), mode


def edge_gains(a, box):
    """Per row (from the north edge) and channel, the gain that lifts the shaded band to the mean of the rows past it."""
    ppu = a.shape[0] / (box[3] - box[2])
    n, ref = round(SHADE * ppu), a[round(SHADE * ppu):round(REF * ppu), :, :3].mean(axis=(0, 1))
    g = []
    for r in range(n):
        m = a[r, :, :3].mean(axis=0)
        g.append([float(np.clip(ref[c] / m[c], 1, 2)) if m[c] >= 1 else 1.0 for c in range(3)])
    while g and max(abs(v - 1) for v in g[-1]) < 0.01: g.pop()
    return [[round(v, 4) for v in row] for row in g]


def lifted(a, gains):
    a = a.copy()
    for r, row in enumerate(gains): a[r, :, :3] = np.minimum(255, a[r, :, :3] * np.asarray(row, np.float32))
    return a


def sample(p, box, x, z):
    """Picture p (rows north first) over the world box, bilinear at world points x, z (arrays of one shape)."""
    h, w = p.shape[:2]
    fx = np.clip((x - box[0]) / (box[1] - box[0]) * w - 0.5, 0, w - 1.001); fz = np.clip((z - box[2]) / (box[3] - box[2]) * h - 0.5, 0, h - 1.001)
    k, j = fx.astype(int), fz.astype(int); tx, tz = (fx - k)[..., None], (fz - j)[..., None]
    return (p[j, k] * (1 - tx) + p[j, k + 1] * tx) * (1 - tz) + (p[j + 1, k] * (1 - tx) + p[j + 1, k + 1] * tx) * tz


def main(dest, original, out, *others):
    dest, out = Path(dest), Path(out)
    meta = json.loads((dest / 'board.json').read_text())
    rb = meta['box']
    near = lambda a, b: abs(a - b) < 1e-6
    boards = [{'dir': Path(d), 'meta': json.loads((Path(d) / 'board.json').read_text()), 'original': i == 0} for i, d in enumerate((original, *others))]
    west = [b for b in boards if near(b['meta']['box'][1], rb[0]) and b['meta']['box'][3] > rb[2] and b['meta']['box'][2] < rb[3]]
    south = [b for b in boards if near(b['meta']['box'][2], rb[3]) and b['meta']['box'][1] > rb[0] and b['meta']['box'][0] < rb[1]]
    if any(not b['original'] for b in south): sys.exit('only the original board can lie south of a region')
    if not west and not south: sys.exit(f'region box {rb} lies flush against none of the boards given')
    # The original's frame shade: measured here for a region north of it, else taken from an installed neighbour that was.
    o = boards[0]
    if south:
        meta['mainEdge'] = {LIFT[k]: edge_gains(picture(o['dir'] / k)[0], o['meta']['box']) for k in LIFT}
        gains = meta['mainEdge']
    else:
        gains = next((b['meta']['mainEdge'] for b in boards if b['meta'].get('mainEdge')), {})
    X0, X1, Z0, Z1 = rb
    for name, band in BANDS.items():
        r, mode = picture(dest / name)
        h, w = r.shape[:2]
        pics = {}
        for b in west + south:
            p = picture(b['dir'] / name)[0]
            if b['original'] and LIFT.get(name) in gains: p = lifted(p, gains[LIFT[name]])
            pics[id(b)] = p[:, :, :r.shape[2]] if p.shape[2] >= r.shape[2] else np.concatenate([p, np.full(p.shape[:2] + (1,), 255, np.float32)], axis=2)
        # Each pixel within the band takes in the neighbour's ground the same distance the other side of the seam (mirrored), so
        # the two meet at the seam with no step and the band keeps its grain, where a copied edge column would draw streaks.
        X = X0 + (np.arange(w) + 0.5) / w * (X1 - X0)
        Z = Z0 + (np.arange(h) + 0.5) / h * (Z1 - Z0)
        XX, ZZ = np.meshgrid(X, Z)
        if west:
            d = XX - X0
            mir = np.zeros_like(r)
            for b in west:
                bx = b['meta']['box']
                sel = ((ZZ >= bx[2] - 1e-6) & (ZZ <= bx[3] + 1e-6)) if len(west) > 1 else np.ones(ZZ.shape, bool)
                mir[sel] = sample(pics[id(b)], bx, bx[1] - d[sel], ZZ[sel])
            t = np.clip(d / band, 0, 1)
            k = (t * t * (3 - 2 * t))[..., None]
            r = mir * (1 - k) + r * k
        if south:
            b = south[0]
            bx = b['meta']['box']
            d = Z1 - ZZ
            mir = sample(pics[id(b)], bx, XX, bx[2] + d)
            t = np.clip(d / band, 0, 1)
            k = (t * t * (3 - 2 * t))[..., None]
            r = mir * (1 - k) + r * k
        img = Image.fromarray(np.clip(r + 0.5, 0, 255).astype(np.uint8), mode)
        target = out / name
        if name.endswith('.webp'):
            img.save(target, quality=92 if name == 'albedo.webp' else 95, method=6)
        else:
            img.save(target, optimize=True)
        print(f'{name}: {w}×{h}, band {band}{" west" if west else ""}{" south" if south else ""}')
    (out / 'board.json').write_text(json.dumps(meta, ensure_ascii=False, separators=(',', ':')))
    if south: print('mainEdge rows:', {k: len(v) for k, v in meta['mainEdge'].items()})


if __name__ == '__main__':
    if len(sys.argv) < 4:
        sys.exit(__doc__)
    main(*sys.argv[1:])
