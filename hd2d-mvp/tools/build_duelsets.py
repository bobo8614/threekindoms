#!/usr/bin/env python3
"""Publish the far side of the field for the 单挑 scene on open ground (tools/gen_duelsets_codex.sh).

    python3 hd2d-mvp/tools/build_duelsets.py [key ...]

Input:  assets/ai/duelsets/source/<key>[-snow].png   full-size GPT output on a flat magenta key, a tileable strip
Output: assets/ai/duelsets/<key>.webp         keyed cut-out, box-reduced to HEIGHT[key] world units at UNIT px each
        assets/ai/duelsets/index.json         { key: { size: [w, h], unit, seam, filler? } } for src/duelview.js

The strip keeps its full width (it tiles left to right); only the empty key above it and any key strip under
its ground line are cropped. seam: 'mirror' when the two edges' silhouettes do not meet, so the view lays every
other tile mirrored and the edges always match; 'tile' when they loop.
"""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

from build_citygate import key  # the same magenta flood fill and despill

MVP = Path(__file__).resolve().parents[1]
SRC, OUT = MVP / 'assets/ai/duelsets/source', MVP / 'assets/ai/duelsets'
UNIT = 75  # published px per world unit, as the city wall (240 px for its 3.2 units)
# World height of each strip, ground line to its highest point (the riders are 2.1 tall, the city wall 3.2;
# the strip stands ~10 units behind them, so it reads a good deal taller than it measures).
HEIGHT = {'plain': 3.6, 'forest': 4.8, 'river': 3.2, 'mount': 6.4, 'sand': 3.2}
# Sheets with one landmark that must not repeat side by side: the share of the width, from the left edge, that
# is free of it (the beacon tower of the wasteland stands right of centre).
FILLER = {'sand': 0.46}


def unmix(im, reach=6):
    """Take the key back out of the outline. Fine detail painted against the magenta (bare twigs, willow
    fronds, grass tips) is anti-aliased into it, so it keeps a magenta cast the flat-key test misses and reads
    lavender once the key is gone. Near the cut (within `reach` px), each pixel's share of key is how far red
    and blue both stand above green; that share of (255, 0, 255) is subtracted to recover the colour under it,
    and a pixel that is mostly key is dropped."""
    a = np.asarray(im).astype(np.float32); rgb, alpha = a[..., :3], a[..., 3]
    near = np.asarray(im.getchannel('A').point(lambda v: 255 if v < 128 else 0).filter(ImageFilter.MaxFilter(2 * reach + 1))) > 0
    k = np.clip((np.minimum(rgb[..., 0], rgb[..., 2]) - rgb[..., 1] - 6) / 249, 0, 1) * (near & (alpha >= 128))
    keep = k < 0.6
    rgb = (rgb - k[..., None] * np.array([255, 0, 255], np.float32)) / np.maximum(1 - k, 0.4)[..., None]
    out = np.dstack([np.clip(rgb, 0, 255), np.where(keep, alpha, 0)]).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


def edges_meet(im):
    """Whether the left and right columns' silhouettes are within 4 % of the height of each other."""
    a = im.getchannel('A').load(); w, h = im.size
    def top(x):
        y = 0
        while y < h and a[x, y] < 128: y += 1
        return y
    return all(abs(top(x) - top(w - 1 - x)) <= 0.04 * h for x in range(3))


meta = json.loads((OUT / 'index.json').read_text()) if (OUT / 'index.json').exists() else {}
for k in sys.argv[1:] or [k + v for k in HEIGHT for v in ('', '-snow')]:
    f = SRC / f'{k}.png'
    if not f.exists(): print('missing', f); continue
    im = unmix(key(Image.open(f), full_width=True))
    H = HEIGHT[k.removesuffix('-snow')]  # the winter strip at its green twin's scale
    s = H * UNIT / im.height
    im = im.resize((round(im.width * s), round(H * UNIT)), Image.BOX)
    # Alpha stays binary so the cut-out keeps a crisp pixel outline under alphaTest.
    im.putalpha(im.getchannel('A').point(lambda v: 255 if v >= 128 else 0))
    OUT.mkdir(parents=True, exist_ok=True)
    im.save(OUT / f'{k}.webp', quality=90, alpha_quality=100, method=6)
    meta[k] = {'size': list(im.size), 'unit': UNIT, 'seam': 'tile' if edges_meet(im) else 'mirror'}
    if k.removesuffix('-snow') in FILLER: meta[k]['filler'] = FILLER[k.removesuffix('-snow')]
    print(k, meta[k])
(OUT / 'index.json').write_text(json.dumps(dict(sorted(meta.items())), indent=1) + '\n')
