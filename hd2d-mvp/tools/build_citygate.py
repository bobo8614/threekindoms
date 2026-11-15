#!/usr/bin/env python3
"""Publish the city wall set for the 单挑 scene under a besieged city (tools/gen_citygate_codex.sh).

    python3 hd2d-mvp/tools/build_citygate.py

Input:  assets/ai/citygate/source/<key>.png   full-size GPT output on a flat magenta key
Output: assets/ai/citygate/<key>.webp         keyed cut-out, box-reduced so the wall is WALL_PX tall
        assets/ai/citygate/index.json         per sheet: size, and for the gate the rows/columns
                                              src/duelview.js lines the wall tiles, archers and flags up on

Measured on the gate sheet (px in the published image, from its top-left):
  top     the parapet's merlon tops where the wall leaves the sheet at the left and right edges
  crenel  the bottom of the gaps between merlons (the walkway sits a little below it)
  tower   [x0, x1] the columns the gate tower rises over (no archers or flags in front of it)
  poles   the bare poles standing on the parapet, where the banners are hung
The wall tile's colours are matched to the gate sheet's own stretch of wall.
The wall tile is cropped to its merlon tops, so its top is 0 and its height is the wall's.
"""
import json
from collections import deque
from pathlib import Path
from PIL import Image

MVP = Path(__file__).resolve().parents[1]
SRC, OUT = MVP / 'assets/ai/citygate/source', MVP / 'assets/ai/citygate'
WALL_PX = 240  # the wall's height, foot to merlon top, in published pixels (≈ 50 px per world unit)


def key(im, full_width=False):
    """Flood-fill the magenta key from the border, despill the outline, crop to the structure (full_width: crop
    the rows only, so a tileable strip keeps its edges)."""
    im = im.convert('RGBA'); w, h = im.size; px = im.load()
    bg = lambda p: p[0] > 150 and p[2] > 150 and p[1] < 120 and abs(p[0] - p[2]) < 90
    seen = bytearray(w * h); q = deque()
    for x in range(w): q.extend([(x, 0), (x, h - 1)])
    for y in range(h): q.extend([(0, y), (w - 1, y)])
    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h or seen[y * w + x] or not bg(px[x, y]): continue
        seen[y * w + x] = 1; px[x, y] = (0, 0, 0, 0)
        q.extend([(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)])
    # Magenta pockets the flood could not reach (enclosed gaps between merlons and the walkway rail).
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a and bg((r, g, b)): px[x, y] = (0, 0, 0, 0)
            elif a and r > 120 and b > 120 and g < r - 60 and g < b - 60: px[x, y] = (40, 24, 32, 255)
    box = im.getchannel('A').getbbox()
    return im.crop((0, box[1], w, box[3]) if full_width else box)


def tops(im):
    """Topmost opaque row of every column (height when the column is empty)."""
    a = im.getchannel('A').load(); w, h = im.size
    out = []
    for x in range(w):
        y = 0
        while y < h and a[x, y] < 128: y += 1
        out.append(y)
    return out


def match(im, ref):
    """Shift and scale each channel of the wall tile to the gate sheet's own stretch of wall (mean and spread),
    so the two sheets meet without a change of brick colour."""
    def stats(x):
        b = x.tobytes(); px = [b[i:i + 4] for i in range(0, len(b), 4) if b[i + 3] >= 128]
        n = len(px); out = []
        for c in range(3):
            m = sum(p[c] for p in px) / n; out.append((m, (sum((p[c] - m) ** 2 for p in px) / n) ** 0.5 or 1))
        return out
    a, b = stats(im), stats(ref)
    bands = im.split()
    lut = [[max(0, min(255, round((v - a[c][0]) * b[c][1] / a[c][1] + b[c][0]))) for v in range(256)] for c in range(3)]
    return Image.merge('RGBA', [bands[c].point(lut[c]) for c in range(3)] + [bands[3]])


def reduce(im, f):
    return im.resize((max(1, round(im.width * f)), max(1, round(im.height * f))), Image.BOX)


def main():
    meta = {}
    for snow in ('', '-snow'):
        g_src, w_src = SRC / f'gate{snow}.png', SRC / f'wall{snow}.png'
        if not g_src.exists() or not w_src.exists(): continue
        gate, wall = key(Image.open(g_src)), key(Image.open(w_src))
        t = tops(gate); w, h = gate.size; edge = max(8, w // 30)
        side = t[:edge] + t[-edge:]
        top = min(side); crenel = sorted(side)[int(len(side) * 0.9)]
        rise = [x for x in range(w) if t[x] < top - 0.12 * h]
        # Bare poles the painter stood on the parapet rise a little above the merlons, outside the tower: banners
        # hang from them (alone they read as crosses).
        rise_pole = [x for x in range(w) if top - 0.12 * h <= t[x] < top - 0.02 * h and not (rise and rise[0] <= x <= rise[-1])]
        poles = []
        for x in rise_pole:
            if poles and x - poles[-1][-1] <= 3: poles[-1].append(x)
            else: poles.append([x])
        f = WALL_PX / (h - top)
        gate, wall = reduce(gate, f), reduce(wall, WALL_PX / wall.height)
        wall = match(wall, gate.crop((0, round((top + 0.06 * h) * f), round(w * f * 0.2), gate.height)))
        # Alpha stays binary so the cut-out keeps a crisp pixel outline under alphaTest.
        for im in (gate, wall): im.putalpha(im.getchannel('A').point(lambda v: 255 if v >= 128 else 0))
        OUT.mkdir(parents=True, exist_ok=True)
        gate.save(OUT / f'gate{snow}.webp', quality=90, alpha_quality=100, method=6); wall.save(OUT / f'wall{snow}.webp', quality=90, alpha_quality=100, method=6)
        meta[f'gate{snow}'] = {'size': list(gate.size), 'top': round(top * f), 'crenel': round(crenel * f), 'tower': [round(rise[0] * f), round(rise[-1] * f)] if rise else None,
                               'poles': [round((p[0] + p[-1]) / 2 * f) for p in poles]}
        meta[f'wall{snow}'] = {'size': list(wall.size)}
    (OUT / 'index.json').write_text(json.dumps(meta, indent=1) + '\n')
    print(json.dumps(meta))


if __name__ == '__main__':
    main()
