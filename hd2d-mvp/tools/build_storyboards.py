#!/usr/bin/env python3
"""Publish storyboard 演出 (tools/gen_storyboard_api.py) as a frame atlas the game plays (src/vignette.js).

  python3 hd2d-mvp/tools/build_storyboards.py <scene> [--w 640] [--colors 192] [--dry out_dir]

Input:  assets/ai/vignettes/source/v2/<scene>/sheet.png, a 3×3 sheet with black gutters
Output: assets/ai/vignettes/v2/<scene>/story.webp and its entry in assets/ai/vignettes/index.json

The image model holds a shot almost still, not perfectly: panels are aligned on the static part of the picture and
every pixel that barely differs from frame 1 is taken from frame 1, so the ground does not shimmer as frames change.
"""
import json, subprocess, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

MVP = Path(__file__).resolve().parents[1]
BASE = MVP / 'assets/ai/vignettes'
COLS, ROWS = 3, 3
RATIO = 213 / 320
LOCK = 20  # how much a quarter-size pixel must change (0–255) to count as a real change


def bands(profile, n):
    """The n panels' (start, end) along one axis, from the dark gutters in a mean-brightness profile."""
    size = len(profile); dark = profile < 22; panels = []; start = None
    for i, d in enumerate(dark):
        if not d and start is None: start = i
        if d and start is not None:
            if i - start > size / (n * 2): panels.append((start, i))
            start = None
    if start is not None and size - start > size / (n * 2): panels.append((start, size))
    if len(panels) != n: sys.exit(f'expected {n} panels, found {panels}: check the sheet')
    return panels


def slice_sheet(path):
    im = Image.open(path).convert('RGB'); a = np.asarray(im.convert('L'), dtype=np.float32)
    xs, ys = bands(np.median(a, axis=0), COLS), bands(np.median(a, axis=1), ROWS)
    w = min(e - s for s, e in xs) - 6; h = min(e - s for s, e in ys) - 6
    return [im.crop((x0 + 3, y0 + 3, x0 + 3 + w, y0 + 3 + h)) for y0, _ in ys for x0, _ in xs]


def shift_to(ref, im):
    """Integer offset of im against ref, by phase correlation over the upper left, which rarely moves."""
    def part(p):
        g = np.asarray(p.convert('L'), dtype=np.float32); h, w = g.shape
        g = g[:int(h * 0.42), :int(w * 0.45)]; return g - g.mean()
    A, B = part(ref), part(im)
    r = np.fft.ifft2(np.fft.fft2(A) * np.conj(np.fft.fft2(B))); r = np.abs(r)
    y, x = np.unravel_index(np.argmax(r), r.shape)
    if y > r.shape[0] / 2: y -= r.shape[0]
    if x > r.shape[1] / 2: x -= r.shape[1]
    return int(x), int(y)


def align(frames):
    out = [frames[0]]; moves = []
    for f in frames[1:]:
        dx, dy = shift_to(frames[0], f); moves.append((dx, dy))
        if abs(dx) > 24 or abs(dy) > 24: dx, dy = 0, 0  # a false match (the sky changed), not a drift
        g = Image.new('RGB', f.size); g.paste(f, (dx, dy)); out.append(g)
    print('offsets', moves)
    m = max(max(abs(x), abs(y)) for x, y in moves if abs(x) <= 24 and abs(y) <= 24) if moves else 0
    return [g.crop((m, m, g.width - m, g.height - m)) for g in out]


def fit(im, w, h):
    r = im.width / im.height; want = w / h
    if r > want: cw = round(im.height * want); im = im.crop(((im.width - cw) // 2, 0, (im.width + cw) // 2, im.height))
    else: ch = round(im.width / want); im = im.crop((0, (im.height - ch) // 2, im.width, (im.height + ch) // 2))
    return im.resize((w, h), Image.BOX)


def ghosts(res, f, box, threshold):
    """Where the locked frame still clearly differs from the painted one in 8 px block means (0–1, full size, inside
    box): something that has gone but stayed behind. Dither averages out over a block, a missing head does not."""
    W, H = f.size; small = (W // 8, H // 8); x0, y0, x1, y1 = box
    d = np.abs(np.asarray(res.resize(small, Image.BOX), dtype=np.int16) - np.asarray(f.resize(small, Image.BOX), dtype=np.int16)).max(axis=2)
    m = np.uint8(d > threshold) * 255
    inside = np.zeros_like(m); inside[y0 // 8:-(-y1 // 8), x0 // 8:-(-x1 // 8)] = 1; m *= inside
    m = Image.fromarray(m).filter(ImageFilter.MaxFilter(3)).resize((W, H), Image.BILINEAR)
    return np.asarray(m, dtype=np.float32)[..., None] / 255


def patches(a, b, t, least, cell=8):
    """Boxes (x0, y0, x1, y1, blocks, worst) and the block mask of touching blocks (cell px a side) whose means differ by
    more than t between two frames, for groups of at least `least` blocks."""
    W, H = a.size; sm = (W // cell, H // cell)
    d = np.abs(np.asarray(a.resize(sm, Image.BOX), dtype=np.int16) - np.asarray(b.resize(sm, Image.BOX), dtype=np.int16)).max(axis=2)
    m = d > t; seen = np.zeros_like(m); keep = np.zeros_like(m); out = []
    for y, x in zip(*np.nonzero(m)):
        if seen[y, x]: continue
        todo = [(y, x)]; seen[y, x] = True; cells = []
        while todo:
            cy, cx = todo.pop(); cells.append((cy, cx))
            for ny in (cy - 1, cy, cy + 1):
                for nx in (cx - 1, cx, cx + 1):
                    if 0 <= ny < m.shape[0] and 0 <= nx < m.shape[1] and m[ny, nx] and not seen[ny, nx]: seen[ny, nx] = True; todo.append((ny, nx))
        if len(cells) >= least:
            ys, xs = zip(*cells); keep[ys, xs] = True
            out.append((min(xs) * cell, min(ys) * cell, max(xs) * cell + cell, max(ys) * cell + cell, len(cells), int(max(d[c] for c in cells))))
    return out, keep


GHOST = ((8, 30, 2),)  # (block px, difference, touching blocks): a patch this far from the painting is never kept from the frame before


def lock(frames, threshold=LOCK, fresh=(), fine=()):
    """Keep the frame before's pixels wherever a frame only shimmers against it; a change survives if it is a real
    shape, and stays once made. Compared at quarter size: the model redraws dither and leaves between frames.
    That drops a change narrower than about 12 px, so a small head or a stick that has gone can stay behind as a ghost:
    fine lists [x0, y0, x1, y1, threshold] boxes (output pixels) where such leftovers are taken from the painting."""
    W, H = frames[0].size; small = (W // 4, H // 4); out = [frames[0]]; kept = []
    for i, f in enumerate(frames[1:], 1):
        if i in fresh: out.append(f); kept.append(100); continue
        ref = np.asarray(out[-1], dtype=np.int16); a = np.asarray(f, dtype=np.int16)
        d = np.abs(np.asarray(f.resize(small, Image.BOX), dtype=np.int16) - np.asarray(out[-1].resize(small, Image.BOX), dtype=np.int16)).max(axis=2)
        m = Image.fromarray(np.uint8(d > threshold) * 255).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(9)).resize((W, H), Image.BILINEAR)
        m = np.asarray(m, dtype=np.float32)[..., None] / 255 # a soft edge: a patch of the new frame does not show as a box
        res = a * m + ref * (1 - m)
        for *box, t in fine:
            g = ghosts(Image.fromarray(np.uint8(res + 0.5)), f, box, t); res = a * g + res * (1 - g); m = np.maximum(m, g)
        # Whatever still stands far from the painting is a ghost or a hole, wherever it is: a floating head on a gate, an arm
        # left where it was beside the one now raised, an arrow's trail that never appeared (found in a dozen scenes on
        # 2026-11-10, tools/check_storyboards.py). The boxes above are for what is fainter than this.
        for cell, t, least in GHOST:
            _, far = patches(Image.fromarray(np.uint8(res + 0.5)), f, t, least, cell)
            if far.any():
                g = np.asarray(Image.fromarray(np.uint8(far) * 255).filter(ImageFilter.MaxFilter(3)).resize((W, H), Image.BILINEAR), dtype=np.float32)[..., None] / 255
                res = a * g + res * (1 - g); m = np.maximum(m, g)
        kept.append(round(float((m > 0.5).mean()) * 100))
        out.append(Image.fromarray(np.uint8(res + 0.5)))
    print('changed % per frame', kept)
    return out


def build(scene, W, colors, dry):
    H = round(W * RATIO)
    frames = [fit(f, W, H) for f in align(slice_sheet(BASE / f'source/v2/{scene}/sheet.png'))]
    how = json.loads(subprocess.check_output(['node', str(MVP / 'tools/storyboard_prompts.mjs'), scene, '--build'], text=True))
    frames = lock(frames, fresh=how.get('fresh', ()), fine=how.get('fine', ()))
    atlas = Image.new('RGB', (W * COLS, H * ROWS))
    for i, f in enumerate(frames): atlas.paste(f, (i % COLS * W, i // COLS * H))
    # median cut alone can lose a small saturated or bright patch (pop's blue banner turned grey, the moon a flat cream
    # disc): quant 'kmeans' refines its palette, which keeps them and lowers the error everywhere else too
    km = 8 if how.get('quant') == 'kmeans' else 0
    atlas = atlas.quantize(colors=colors, method=Image.MEDIANCUT, kmeans=km, dither=Image.Dither.NONE).convert('RGB')
    out = Path(dry) if dry else BASE / f'v2/{scene}'; out.mkdir(parents=True, exist_ok=True)
    name = f'{scene}-{W}.webp' if dry else 'story.webp'; atlas.save(out / name, lossless=True, method=6)
    print(out / name, (out / name).stat().st_size // 1024, 'KB')
    if dry: return
    idx_path = BASE / 'index.json'; idx = json.loads(idx_path.read_text())
    idx[scene] = {'w': W, 'h': H, 'story': {'src': f'v2/{scene}/story.webp', 'cols': COLS, 'rows': ROWS, 'hold': how.get('hold', [1] * 8 + [1.6]), 'blend': 0.12}}
    attempt = subprocess.check_output(['node', str(MVP / 'tools/storyboard_prompts.mjs'), scene, '--attempt'], text=True).strip()
    if attempt: idx[scene]['story']['attempt'] = int(attempt)
    idx[scene].update(json.loads(subprocess.check_output(['node', str(MVP / 'tools/storyboard_prompts.mjs'), scene, '--extra'], text=True)))
    idx_path.write_text(json.dumps(idx, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    a = sys.argv[1:]
    opt = lambda k, d: (a.pop(a.index(k) + 1), a.remove(k))[0] if k in a else d
    W, colors, dry = int(opt('--w', 640)), int(opt('--colors', 192)), opt('--dry', None) # 640: shown 1:1 in the frame, the sheet's own pixel clusters stay crisp
    for s in a: build(s, W, colors, dry)
