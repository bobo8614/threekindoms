#!/usr/bin/env python3
"""Cut the shipped 爆炎 set from the chosen takes of tools/gen_blast_fx_api.py (src/blastfx.js plays it).

  python3 hd2d-mvp/tools/build_blast_fx.py [--bomb bomb-1] [--burst burst-0] [--scorch scorch-0]

Input:  assets/ai/tactical/source/blast/<take>.png (local only)
Output: assets/ai/tactical/blast-bomb.webp (the pot, 64 px), blast-burst.webp (8 frames, 4 × 2 cells of 192 × 256,
        the blast's foot at the same point of every cell) and blast-scorch.webp (256 px), all with alpha.
"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image

MVP = Path(__file__).resolve().parents[1]
SRC, OUT = MVP / 'assets/ai/tactical/source/blast', MVP / 'assets/ai/tactical'
CW, CH = 192, 256  # one burst cell as shipped: the explosion fills about 3 × 3 cells of the field, ~150 px at play size


def bbox(im, t=8):
    a = np.asarray(im)[..., 3]; ys, xs = np.nonzero(a > t)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def square(im, size, pad=0.04):
    """The opaque part centred on a square transparent canvas, scaled to size."""
    x0, y0, x1, y1 = bbox(im); w, h = x1 - x0, y1 - y0; s = int(max(w, h) * (1 + pad * 2))
    c = Image.new('RGBA', (s, s)); c.alpha_composite(im.crop((x0, y0, x1, y1)), ((s - w) // 2, (s - h) // 2))
    return c.resize((size, size), Image.LANCZOS)


def save(im, name):
    # the edges of a downscale carry colour under zero alpha: clear it, or the additive / linear filter bleeds a fringe
    # the API's transparent ground still carries alpha 1–4 over much of the sheet: clear that haze too
    a = np.asarray(im).copy(); a[a[..., 3] <= 6] = 0
    Image.fromarray(a).save(OUT / name, lossless=True, method=6); print(OUT / name, (OUT / name).stat().st_size // 1024, 'KB')


def burst(take):
    im = Image.open(SRC / f'{take}.png').convert('RGBA'); W, H = im.size; cw, ch = W // 4, H // 2
    cells = [im.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch)) for r in range(2) for c in range(4)]
    # each cell's foot (lowest opaque row) and centre column, so the frames stand on one point when played
    feet = []
    for c in cells:
        a = np.asarray(c)[..., 3] > 24; ys, xs = np.nonzero(a); feet.append((int(np.median(xs)), ys.max()))
    scale = min(CW / cw, CH / ch) * 1.0
    atlas = Image.new('RGBA', (CW * 4, CH * 2))
    for i, (c, (fx, fy)) in enumerate(zip(cells, feet)):
        s = c.resize((round(cw * scale), round(ch * scale)), Image.LANCZOS)
        # put the foot at (CW / 2, CH - 8) of the cell
        ox, oy = round(CW / 2 - fx * scale), round(CH - 8 - fy * scale)
        cell = Image.new('RGBA', (CW, CH)); cell.paste(s, (ox, oy))  # onto an empty cell: a plain paste keeps alpha (a masked one squares it)
        atlas.alpha_composite(cell, (i % 4 * CW, i // 4 * CH))
    print('feet', feet)
    save(atlas, 'blast-burst.webp')


if __name__ == '__main__':
    a = sys.argv[1:]
    opt = lambda k, d: (a.pop(a.index(k) + 1), a.remove(k))[0] if k in a else d
    bomb, bt, scorch = opt('--bomb', 'bomb-1'), opt('--burst', 'burst-0'), opt('--scorch', 'scorch-0')
    save(square(Image.open(SRC / f'{bomb}.png').convert('RGBA'), 64), 'blast-bomb.webp')
    burst(bt)
    # the painted mark keeps a ring of grass round its edge, wrong on snow or sand: fade it out from the crater
    sc = np.asarray(square(Image.open(SRC / f'{scorch}.png').convert('RGBA'), 256, pad=0.0)).astype(np.float32)
    yy, xx = np.mgrid[0:256, 0:256]; r = np.hypot(xx - 127.5, yy - 127.5) / 128
    sc[..., 3] *= np.clip((0.78 - r) / 0.42, 0, 1) ** 1.4
    save(Image.fromarray(sc.round().astype(np.uint8)), 'blast-scorch.webp')
