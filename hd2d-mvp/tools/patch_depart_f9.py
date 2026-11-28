#!/usr/bin/env python3
"""depart (出阵) frame 9: Codex kept drawing a file of small soldiers on the hill road ahead of the general (two takes),
where he is to lead. This takes that stretch from frame 8, where the road is still empty, through a soft-edged mask
that stops short of his horse's head.
  python3 hd2d-mvp/tools/patch_depart_f9.py <sheet-b.png> <sheet.png>"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image
sys.path.insert(0, str(Path(__file__).parent))
import build_storyboards as B

src, out = sys.argv[1:3]
im = Image.open(src).convert('RGB'); L = np.asarray(im.convert('L'), dtype=np.float32)
xs, ys = B.bands(np.median(L, axis=0), 3), B.bands(np.median(L, axis=1), 3)
a = np.asarray(im, dtype=np.float32)
(x8, _), (x9, x9e), (y, ye) = xs[1], xs[2], ys[2]
f8, f9 = a[y:ye, x8:x8 + (x9e - x9)], a[y:ye, x9:x9e]
h, w = f9.shape[:2]; yy, xx = np.mgrid[0:h, 0:w]
ramp = lambda v, a0, a1: np.clip((v - a0) / (a1 - a0), 0, 1)
# panel coordinates: the road ahead of him (right of x 452 down to his horse's head, above y 250) and the far bend over his head
near = ramp(xx, 452, 457) * (1 - ramp(yy, 244, 252)) * ramp(yy, 150, 156)
far = ramp(xx, 436, 446) * (1 - ramp(yy, 200, 206)) * ramp(yy, 150, 156)
m = np.maximum(near, far)[..., None]
a[y:ye, x9:x9e] = f9 * (1 - m) + f8[:h, :w] * m
Image.fromarray(a.round().astype(np.uint8)).save(out)
