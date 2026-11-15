#!/usr/bin/env python3
"""Cut the Codex controller glyph sheets (assets/ai/pad/source/<family>.png, 5x3 on flat magenta, the cells in
CELLS order of pad_glyph_prompts.mjs) into assets/ai/pad/<family>/<cell>.webp: alpha, trimmed, each H px tall (the width
follows the shape, so bumpers stay wide), and each one's size to assets/ai/pad/index.json for pad.js. A cell re-painted alone (source/<family>-<cell>.png) wins over its sheet cell.
Writes a contact sheet on the UI's panel green to source/contact-<family>.png (local only) for the visual check.
  python3 hd2d-mvp/tools/slice_pad_glyphs.py [xbox ps nintendo]
  python3 hd2d-mvp/tools/slice_pad_glyphs.py --pictures      (the help's controller and mouse pictures: offset, sym, mouse)
"""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image
from slice_equip_icons import key, blobs, pieces

MVP = Path(__file__).resolve().parent.parent
SRC = MVP / 'assets/ai/pad/source'
OUT = MVP / 'assets/ai/pad'
CELLS = ['south', 'east', 'west', 'north', 'lb', 'rb', 'lt', 'rt', 'view', 'start', 'l3', 'r3', 'dpad', 'lstick', 'rstick']
H, PAD = 64, 1  # 20 px on screen at up to 3x

def single(path):
    rgba = key(Image.open(path)); lab, n = blobs(rgba[..., 3] > 40)
    big = np.argmax(np.bincount(lab[lab > 0])); sel = lab == big
    ys, xs = np.nonzero(sel); y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    piece = rgba[y0:y1, x0:x1].copy(); piece[~sel[y0:y1, x0:x1], 3] = 0
    return piece

def glyph(piece, scale):
    """Resize premultiplied (no magenta fringe) by the sheet-wide scale, so all glyphs of a family keep their sizes."""
    h, w = piece.shape[:2]; nw, nh = max(1, round(w * scale)), max(1, round(h * scale))
    p = piece.astype(np.float32); p[..., :3] *= p[..., 3:] / 255
    q = np.dstack([np.asarray(Image.fromarray(p[..., i]).resize((nw, nh), Image.LANCZOS)) for i in range(4)])
    a = q[..., 3:4]; rgb = np.where(a > 0.5, q[..., :3] / np.maximum(a, 1) * 255, 0)
    out = Image.new('RGBA', (nw + 2 * PAD, nh + 2 * PAD), (0, 0, 0, 0))
    out.paste(Image.fromarray(np.dstack([rgb, a]).clip(0, 255).astype(np.uint8), 'RGBA'), (PAD, PAD))
    return out

def family(name):
    pcs = pieces(SRC / f'{name}.png', 5, 3, grow=1)
    for i, c in enumerate(CELLS):
        one = SRC / f'{name}-{c}.png'
        if one.exists(): pcs[i] = single(one)
    # Each glyph H tall: the game shows them all at one height (ui.css, 20 px), so a bumper is drawn as tall as a face button.
    (OUT / name).mkdir(parents=True, exist_ok=True)
    ims = [glyph(p, (H - 2 * PAD) / p.shape[0]) for p in pcs]
    for c, im in zip(CELLS, ims): im.save(OUT / name / f'{c}.webp', 'WEBP', lossless=True, quality=100, method=6)
    # Contact sheet: each glyph at full size and at the 20 px it is shown at, on the panel green.
    sheet = Image.new('RGBA', (len(CELLS) * 140, 120), (24, 38, 28, 255))
    for i, im in enumerate(ims):
        sheet.alpha_composite(im, (i * 140 + 4, 6))
        sm = im.resize((max(1, round(im.width * 20 / im.height)), 20), Image.LANCZOS); sheet.alpha_composite(sm, (i * 140 + 4, 90))
    sheet.save(SRC / f'contact-{name}.png')
    idx = OUT / 'index.json'; j = json.loads(idx.read_text()) if idx.exists() else {}
    j[name] = {c: [im.width, im.height] for c, im in zip(CELLS, ims)}
    idx.write_text(json.dumps(j, sort_keys=True) + '\n')
    print(name, [f'{c}:{im.width}x{im.height}' for c, im in zip(CELLS, ims)])

def picture(name, width):
    """A help picture (source/<name>.png: offset, sym, mouse): keyed, trimmed to the piece, width px wide."""
    p = single(SRC / f'{name}.png'); h, w = p.shape[:2]
    glyph(p, width / w).save(OUT / f'{name}.webp', 'WEBP', quality=90, method=6)
    print(name, 'picture', width)

if sys.argv[1:2] == ['--pictures']:
    for n, w in (('offset', 880), ('sym', 880), ('mouse', 360)):
        if (SRC / f'{n}.png').exists(): picture(n, w)
    sys.exit()
for f in sys.argv[1:] or ['xbox', 'ps', 'nintendo']:
    if (SRC / f'{f}.png').exists(): family(f)
    else: print(f'{f}: no sheet yet')
