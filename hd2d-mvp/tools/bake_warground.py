#!/usr/bin/env python3
# Reduce the war map's painted materials (tools/gen_warground_codex.sh) to what the game loads:
#   swatches → assets/ai/warground/<name>.webp, 512 px, made seamless (the image model's edges do not quite meet:
#              the half-offset copy is blended in over a ragged band along the edges);
#   cliff    → cliff.webp, 1024 x 320, seamless left to right;
#   cliff-tier → cliff-tier.webp, 1024 x 427, the mesa faces (a unit tall, moss lip on top), seamless left to right;
#   castle, village → keyed and cropped props (the 2D war map, src/warmap2d.js);
#   trees*   → trees*.webp atlas + trees*.json ({w, h, rects: [[x, y, w, h, kind], ...]}), magenta keyed out,
#              each tree cropped from its cell of the 4 x 3 sheet (kind: 'broad' or 'pine' for the last row).
#   python3 hd2d-mvp/tools/bake_warground.py [name ...]
import json, os, sys
from collections import deque
import numpy as np
from PIL import Image, ImageFilter

MVP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC, OUT = f'{MVP}/assets/ai/warground/source', f'{MVP}/assets/ai/warground'
SWATCHES = ['grass', 'grass-spring', 'grass-autumn', 'snow', 'dirt', 'sand', 'hilltop', 'forest-floor', 'paving', 'fields', 'bank', 'water']
TREES = ['trees', 'trees-spring', 'trees-autumn', 'trees-winter']
PROPS = {'castle': 560, 'village': 520} # width the game loads


def noise(h, w, seed, cell=48):
    r = np.random.default_rng(seed)
    g = Image.fromarray((r.random((h // cell + 2, w // cell + 2)) * 255).astype(np.uint8)).resize((w + cell * 2, h + cell * 2), Image.BICUBIC)
    return np.asarray(g, float)[cell:cell + h, cell:cell + w] / 255


def seamless(a, axes=(0, 1), band=0.22, seed=1):
    """Blend the half-offset copy in near the edges along the given axes; the band edge wanders with noise."""
    h, w = a.shape[:2]
    rolled = np.roll(a, (h // 2 if 0 in axes else 0, w // 2 if 1 in axes else 0), axis=(0, 1))
    n = noise(h, w, seed)
    d = np.ones((h, w))
    if 1 in axes: x = np.arange(w) / w; d = np.minimum(d, np.minimum(x, 1 - x)[None, :] * 2)
    if 0 in axes: y = np.arange(h) / h; d = np.minimum(d, np.minimum(y, 1 - y)[:, None] * 2)
    # d: 0 at an edge, 1 at the centre; keep the original where d is past the (noisy) band.
    k = np.clip((d - band * (0.6 + 0.8 * n)) / 0.12 + 0.5, 0, 1)[..., None]
    return a * k + rolled * (1 - k)


def desaturate(im, k):
    """Pull colours toward their own luminance (k = 1 keeps them): the image model runs warmer than the concept."""
    a = np.asarray(im, float); y = (a[..., :3] @ [0.299, 0.587, 0.114])[..., None]
    a[..., :3] = y + (a[..., :3] - y) * k
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), im.mode)


def swatch(name):
    im = Image.open(f'{SRC}/{name}.png').convert('RGB')
    if name in SATURATION: im = desaturate(im, SATURATION[name])
    a = np.asarray(im, float)
    s = Image.fromarray(seamless(a, seed=len(name)).astype(np.uint8))
    s.resize((512, 512), Image.LANCZOS).save(f'{OUT}/{name}.webp', quality=92)


def cliff():
    a = np.asarray(Image.open(f'{SRC}/cliff.png').convert('RGB'), float)
    s = Image.fromarray(seamless(a, axes=(1,), seed=3).astype(np.uint8))
    s.resize((1024, 320), Image.LANCZOS).save(f'{OUT}/cliff.webp', quality=92)


def cliff_tier():
    a = np.asarray(Image.open(f'{SRC}/cliff-tier.png').convert('RGB'), float)
    s = Image.fromarray(seamless(a, axes=(1,), seed=5).astype(np.uint8))
    s.resize((1024, 427), Image.LANCZOS).save(f'{OUT}/cliff-tier.webp', quality=92)


def keyed(im):
    im = im.convert('RGBA'); a = np.asarray(im).copy()
    r, g, b = (a[..., i].astype(int) for i in range(3))
    mag = (r > 150) & (b > 150) & (g < 120) & (np.abs(r - b) < 90)
    h, w = mag.shape; bg = np.zeros_like(mag); q = deque()
    for x in range(w): q.extend([(0, x), (h - 1, x)])
    for y in range(h): q.extend([(y, 0), (y, w - 1)])
    while q:
        y, x = q.popleft()
        if 0 <= y < h and 0 <= x < w and mag[y, x] and not bg[y, x]:
            bg[y, x] = True; q.extend([(y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)])
    a[bg, 3] = 0
    # Magenta caught between bare branches is not connected to the border: anything clearly magenta goes too.
    lo = np.minimum(r, b)
    a[(lo - g > 70) & (lo > 110), 3] = 0
    # Despill: a purple cast left on outline and branch pixels falls back to the green channel's level.
    r, g, b = (a[..., i].astype(int) for i in range(3))
    spill = (a[..., 3] > 0) & (np.minimum(r, b) - g > 18)
    a[..., 0] = np.where(spill, np.minimum(r, g + 12), r); a[..., 2] = np.where(spill, np.minimum(b, g), b)
    return Image.fromarray(a)


def blobs(alpha, step=4):
    """Bounding boxes of the opaque islands (found on a step-reduced mask; a tip may cross its grid cell)."""
    m = np.asarray(alpha)[::step, ::step] > 128; h, w = m.shape
    seen = np.zeros_like(m); out = []
    for sy in range(h):
        for sx in range(w):
            if not m[sy, sx] or seen[sy, sx]: continue
            q = deque([(sy, sx)]); seen[sy, sx] = True; box = [sx, sy, sx, sy]; n = 0
            while q:
                y, x = q.popleft(); n += 1
                box = [min(box[0], x), min(box[1], y), max(box[2], x), max(box[3], y)]
                for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                    if 0 <= yy < h and 0 <= xx < w and m[yy, xx] and not seen[yy, xx]: seen[yy, xx] = True; q.append((yy, xx))
            if n > 200: out.append((box[0] * step, box[1] * step, (box[2] + 1) * step, (box[3] + 1) * step))
    return out


SATURATION = {'trees-autumn': 0.78, 'grass-autumn': 0.85, 'sand': 0.8}


def trees(name, scale=0.5):
    im = keyed(Image.open(f'{SRC}/{name}.png')); W, H = im.size
    if name in SATURATION: im = desaturate(im, SATURATION[name])
    # Reading order by the cell each island's centre falls in (row 3 holds the conifers).
    boxes = sorted(blobs(im.getchannel('A')), key=lambda b: (int((b[1] + b[3]) / 2 / (H / 3)), (b[0] + b[2]) / 2))
    crops = []
    for b in boxes:
        p = im.crop(b); p = p.crop(p.getchannel('A').getbbox())
        p = p.resize((round(p.width * scale), round(p.height * scale)), Image.LANCZOS)
        a = np.asarray(p, int); op = a[..., 3] > 128
        pink = ((a[..., 0] > 170) & (a[..., 2] > 140)) | (a[..., :3].min(-1) > 170)
        # A crown in blossom (pink or white flowers over much of it) is marked so the game can use it sparingly.
        kind = 'pine' if (b[1] + b[3]) / 2 > H * 2 / 3 else 'bloom' if name == 'trees-spring' and (pink & op).sum() > 0.08 * op.sum() else 'broad'
        crops.append((p, kind))
    # Shelf-pack into a 1024-wide atlas with 2 px gutters (edge pixels repeated so mipmaps do not bleed magenta).
    x = y = row = 0; rects = []
    for p, kind in crops:
        if x + p.width + 4 > 1024: x, y, row = 0, y + row + 4, 0
        rects.append([x + 2, y + 2, p.width, p.height, kind]); x += p.width + 4; row = max(row, p.height)
    atlas = Image.new('RGBA', (1024, 1 << (y + row + 4 - 1).bit_length()), (0, 0, 0, 0))
    for (p, _), (rx, ry, *_r) in zip(crops, rects): atlas.alpha_composite(p, (rx, ry))
    # Fill transparent texels with the nearest opaque colour (alpha stays 0): no dark fringe when filtered.
    rgb = atlas.convert('RGB'); a = atlas.getchannel('A')
    grown = rgb
    for _ in range(4): grown = Image.composite(grown, grown.filter(ImageFilter.MaxFilter(3)), a.point(lambda v: 255 if v > 0 else 0))
    out = grown.convert('RGBA'); out.putalpha(a)
    out.save(f'{OUT}/{name}.webp', lossless=True)
    json.dump({'w': out.width, 'h': out.height, 'rects': rects}, open(f'{OUT}/{name}.json', 'w'))


def prop(name):
    im = keyed(Image.open(f'{SRC}/{name}.png')); im = im.crop(im.getchannel('A').point(lambda v: 255 if v > 128 else 0).getbbox())
    w = PROPS[name]; im.resize((w, round(im.height * w / im.width)), Image.LANCZOS).save(f'{OUT}/{name}.webp', lossless=True)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for n in sys.argv[1:] or SWATCHES + ['cliff', 'cliff-tier'] + TREES + list(PROPS):
        if not os.path.exists(f'{SRC}/{n}.png'): print('missing', n); continue
        ((lambda: prop(n)) if n in PROPS else cliff if n == 'cliff' else cliff_tier if n == 'cliff-tier' else (lambda: trees(n)) if n.startswith('trees') else (lambda: swatch(n)))()
        print('baked', n)
