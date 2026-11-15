"""Cut an expression sheet (tools/gen_faces_codex.sh) into the four busts the game loads.

  python3 hd2d-mvp/tools/slice_faces.py <officer_id> [...]

In:  assets/ai/faces/source/<id>.png — 2×2 panels split by white gutters: calm, angry / joy, grief.
Out: assets/ai/faces/<id>-<mood>.webp — 384×512 (3:4) busts, cut from the top of each panel and
     centred, the shape every face slot in the UI shows (object-fit: cover, top-weighted).
The gutters are found by scanning for the brightest row and column near the middle, so a sheet that
drifts a few pixels off the exact halves still cuts cleanly.
"""
import sys
from pathlib import Path
from PIL import Image, ImageStat

MVP = Path(__file__).resolve().parents[1]
MOODS = [['calm', 'angry'], ['joy', 'grief']]
W, H = 384, 512


def gutter(im, axis):
    """Centre of the whitest band within ±12% of the middle (axis 0: a column, 1: a row)."""
    g = im.convert('L')
    n = g.width if axis == 0 else g.height
    best, at = -1, n // 2
    for i in range(int(n * .38), int(n * .62)):
        box = (i, 0, i + 1, g.height) if axis == 0 else (0, i, g.width, i + 1)
        v = ImageStat.Stat(g.crop(box)).mean[0]
        if v > best: best, at = v, i
    # widen to the whole bright band so neither panel keeps a white edge
    lo = hi = at
    line = lambda i: ImageStat.Stat(g.crop((i, 0, i + 1, g.height) if axis == 0 else (0, i, g.width, i + 1))).mean[0]
    while lo > 0 and line(lo - 1) > best - 12: lo -= 1
    while hi < n - 1 and line(hi + 1) > best - 12: hi += 1
    return lo, hi + 1, best


def trim(p):
    """Drop white margin rows/columns left at the sheet's outer edges."""
    g = p.convert('L'); x0, y0, x1, y1 = 0, 0, g.width, g.height
    col = lambda x: ImageStat.Stat(g.crop((x, 0, x + 1, g.height))).mean[0]
    row = lambda y: ImageStat.Stat(g.crop((0, y, g.width, y + 1))).mean[0]
    while x0 < x1 - 1 and col(x0) > 245: x0 += 1
    while x1 > x0 + 1 and col(x1 - 1) > 245: x1 -= 1
    while y0 < y1 - 1 and row(y0) > 245: y0 += 1
    while y1 > y0 + 1 and row(y1 - 1) > 245: y1 -= 1
    return p.crop((x0, y0, x1, y1))


def cut(oid):
    im = Image.open(MVP / f'assets/ai/faces/source/{oid}.png').convert('RGB')
    (cx0, cx1, vb), (ry0, ry1, hb) = gutter(im, 0), gutter(im, 1)
    if vb < 200 or hb < 200: print(f'{oid}: weak gutter (col {vb:.0f}, row {hb:.0f}); check the sheet')
    for r, (y0, y1) in enumerate([(0, ry0), (ry1, im.height)]):
        for c, (x0, x1) in enumerate([(0, cx0), (cx1, im.width)]):
            p = trim(im.crop((x0, y0, x1, y1)))
            # widest 3:4 window, top-aligned, horizontally centred
            w = min(p.width, p.height * 3 // 4); h = w * 4 // 3
            x = (p.width - w) // 2
            p = p.crop((x, 0, x + w, h)).resize((W, H), Image.LANCZOS)
            p.save(MVP / f'assets/ai/faces/{oid}-{MOODS[r][c]}.webp', quality=86)
    print(f'{oid}: sliced')


if __name__ == '__main__':
    for a in sys.argv[1:]: cut(int(a))
