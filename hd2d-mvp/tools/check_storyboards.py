#!/usr/bin/env python3
"""Where a published storyboard frame is not what was painted (tools/build_storyboards.py lock()).

  python3 hd2d-mvp/tools/check_storyboards.py [scene ...] [--out dir] [--t 22] [--min 2]

The lock keeps the frame before's pixels wherever a frame barely differs from it, so the ground does not shimmer. It
compares at quarter size, and a small or low-contrast change is kept from the frame before as well: a hand that has moved
stays behind, a head against a dark doorway never appears (引拔, 2026-11-10). This builds each scene's frames as
build_storyboards.py does, compares every locked frame with its own painting in 8 px block means, and lists the patches
that still differ by more than --t in at least --min touching blocks. With --out it writes one sheet a scene: each patch
as published (left) and as painted (right), to look at. A patch is not always a fault (the lock also keeps the first
frame's foliage and dither where the painter redrew them): look, then add a `fine` box in storyboard_prompts.mjs BUILD.
Needs the local full-size sheets (assets/ai/vignettes/source/v2/<scene>/sheet.png)."""
import contextlib, io, json, subprocess, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).parent))
import build_storyboards as B

W = 640; H = round(W * B.RATIO)


def frames(scene):
    with contextlib.redirect_stdout(io.StringIO()):
        src = [B.fit(f, W, H) for f in B.align(B.slice_sheet(B.BASE / f'source/v2/{scene}/sheet.png'))]
        how = json.loads(subprocess.check_output(['node', str(B.MVP / 'tools/storyboard_prompts.mjs'), scene, '--build'], text=True))
        return src, B.lock(src, fresh=how.get('fresh', ()), fine=how.get('fine', ()))


patches = lambda a, b, t, least: B.patches(a, b, t, least)[0]


if __name__ == '__main__':
    a = sys.argv[1:]
    opt = lambda k, d: (a.pop(a.index(k) + 1), a.remove(k))[0] if k in a else d
    out, t, least = opt('--out', None), int(opt('--t', 22)), int(opt('--min', 2))
    scenes = a or subprocess.check_output(['node', str(B.MVP / 'tools/storyboard_prompts.mjs'), '--list'], text=True).split()
    for s in scenes:
        if not (B.BASE / f'source/v2/{s}/sheet.png').exists(): print(s, 'no sheet'); continue
        src, locked = frames(s); found = []
        for i, (l, p) in enumerate(zip(locked, src)):
            for box in patches(l, p, t, least): found.append((i, box))
        print(s, len(found), ' '.join(f'f{i + 1}:{b[0]},{b[1]}-{b[2]},{b[3]}({b[4]})' for i, b in found))
        if out and found:
            Path(out).mkdir(parents=True, exist_ok=True); cells = []
            for i, (x0, y0, x1, y1, n, worst) in found:
                box = (max(0, x0 - 40), max(0, y0 - 40), min(W, x1 + 40), min(H, y1 + 40)); k = max(1, min(4, 320 // max(box[2] - box[0], box[3] - box[1])))
                pair = Image.new('RGB', ((box[2] - box[0]) * k * 2 + 6, (box[3] - box[1]) * k + 14), (20, 20, 20))
                for j, im in enumerate((locked[i], src[i])): pair.paste(im.crop(box).resize(((box[2] - box[0]) * k, (box[3] - box[1]) * k), Image.NEAREST), (j * ((box[2] - box[0]) * k + 6), 14))
                ImageDraw.Draw(pair).text((2, 1), f'f{i + 1} {x0},{y0}-{x1},{y1} n{n} d{worst}', fill=(255, 220, 120)); cells.append(pair)
            x = y = rowh = 0; place = []
            for c in cells:
                if x and x + c.width > 2000: x = 0; y += rowh + 6; rowh = 0
                place.append((c, x, y)); x += c.width + 10; rowh = max(rowh, c.height)
            sheet = Image.new('RGB', (2000, y + rowh), (0, 0, 0))
            for c, x, y in place: sheet.paste(c, (x, y))
            sheet.save(Path(out) / f'{s}.png')
