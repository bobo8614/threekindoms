#!/usr/bin/env python3
"""Cut the Codex equipment sheets (assets/ai/icon/source/equip-weapons.png 4x6, equip-armor.png 4x2, on flat
magenta) into assets/ai/icon/equip/<id>.webp, 64x64 with alpha, and write index.json ([{id, name}]).
A piece named in `--single` is taken whole from source/equip-<id>.png instead (re-painted cell).
  python3 hd2d-mvp/tools/slice_equip_icons.py
"""
import json, subprocess, sys
from pathlib import Path
import numpy as np
from PIL import Image

MVP = Path(__file__).resolve().parent.parent
SRC = MVP / 'assets/ai/icon/source'
OUT = MVP / 'assets/ai/icon/equip'
SIZE, PAD = 64, 4
# The long-handled pieces lie on a diagonal, tip to the upper right: whole, their heads would be a few pixels wide
# at 64 px. They keep the head and the upper part of the shaft (KEEP of the length along the diagonal), the shaft
# fading out at the cut, so the head and its tassel read at card size.
POLEARMS = [i for i in range(8, 24) if i != 17]            # 双戟 (17) is a compact crossed pair: whole
KEEP, FADE = 0.58, 0.16

def head(piece):
    h, w = piece.shape[:2]
    ys, xs = np.mgrid[0:h, 0:w]
    t = ((xs / w) - (ys / h)) / 2 + 0.5                   # 1 at the upper right, 0 at the lower left
    a = np.clip((t - (1 - KEEP)) / FADE, 0, 1)             # 0 below the cut, 1 above it
    piece = piece.copy(); piece[..., 3] = (piece[..., 3] * a).astype(np.uint8)
    keep = piece[..., 3] > 8
    ys, xs = np.nonzero(keep)
    return piece[ys.min():ys.max() + 1, xs.min():xs.max() + 1]

def key(im):
    """RGBA from an image on flat magenta: alpha from how magenta each pixel is, magenta spill removed."""
    a = np.asarray(im.convert('RGB')).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    m = np.minimum(r, b) - g                       # 0 for most paint, ~255 for the backdrop
    alpha = np.clip(1.0 - (m - 60.0) / 110.0, 0, 1)
    spill = np.clip(m - 20.0, 0, None) * (alpha < 1)
    r = np.minimum(r, np.maximum(g + 20, r - spill)); b = np.minimum(b, np.maximum(g + 20, b - spill))
    return np.dstack([r, g, b, alpha * 255]).clip(0, 255).astype(np.uint8)

def blobs(mask, grow=2, step=4):
    """Label connected blobs of a mask, merged across gaps of about grow*step px (tassels, glows, crossed
    shafts stay with their weapon). Returns a label image at full size, 0 = background, and the count."""
    H, W = mask.shape; h, w = -(-H // step), -(-W // step)
    pad = np.zeros((h * step, w * step), bool); pad[:H, :W] = mask
    small = pad.reshape(h, step, w, step).any(axis=(1, 3))
    big = small.copy()
    for _ in range(grow):
        t = big.copy(); t[1:] |= big[:-1]; t[:-1] |= big[1:]; t[:, 1:] |= big[:, :-1]; t[:, :-1] |= big[:, 1:]; big = t
    lab = np.zeros((h, w), np.int32); n = 0
    for y, x in zip(*np.nonzero(big)):
        if lab[y, x]: continue
        n += 1; lab[y, x] = n; stack = [(y, x)]
        while stack:
            cy, cx = stack.pop()
            for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                if 0 <= ny < h and 0 <= nx < w and big[ny, nx] and not lab[ny, nx]: lab[ny, nx] = n; stack.append((ny, nx))
    full = np.kron(lab, np.ones((step, step), np.int32))[:H, :W]
    return full * mask, n

def pieces(path, cols, rows, grow=2):
    """The pieces of a sheet as RGBA arrays in reading order: connected blobs (tassels and glows stay with
    their weapon), each put in the grid cell its centre falls in."""
    im = Image.open(path); rgba = key(im); W, H = im.size
    mask = rgba[..., 3] > 40
    lab, n = blobs(mask, grow)
    cells = {}
    for i in range(1, n + 1):
        ys, xs = np.nonzero(lab == i)
        if len(ys) < 400: continue                   # specks
        cell = (min(rows - 1, int(ys.mean() * rows / H)), min(cols - 1, int(xs.mean() * cols / W)))
        cells.setdefault(cell, []).append(i)
    out = []
    for r in range(rows):
        for c in range(cols):
            ids = cells.get((r, c))
            if not ids: sys.exit(f'{path.name}: no piece in row {r + 1} col {c + 1}')
            sel = np.isin(lab, ids)
            ys, xs = np.nonzero(sel); y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
            piece = rgba[y0:y1, x0:x1].copy(); piece[~sel[y0:y1, x0:x1], 3] = 0
            out.append(piece)
    return out

def icon(piece):
    h, w = piece.shape[:2]; k = (SIZE - 2 * PAD) / max(h, w)
    nw, nh = max(1, round(w * k)), max(1, round(h * k))
    p = piece.astype(np.float32); p[..., :3] *= p[..., 3:] / 255          # premultiplied, so no pink fringe
    big = Image.fromarray(p.clip(0, 255).astype(np.uint8), 'RGBA')
    # resize each channel in float via PIL 'F' to keep precision
    chans = [np.asarray(Image.fromarray(p[..., i]).resize((nw, nh), Image.LANCZOS)) for i in range(4)]
    q = np.dstack(chans); a = q[..., 3:4]
    rgb = np.where(a > 0.5, q[..., :3] / np.maximum(a, 1) * 255, 0)
    q = np.dstack([rgb, a]).clip(0, 255).astype(np.uint8)
    canvas = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    canvas.paste(Image.fromarray(q, 'RGBA'), ((SIZE - nw) // 2, (SIZE - nh) // 2))
    return canvas

def main():
    names = json.loads(subprocess.check_output(['node', str(MVP / 'tools/equip_icon_prompts.mjs'), '--names']))
    OUT.mkdir(parents=True, exist_ok=True)
    pcs = pieces(SRC / 'equip-weapons.png', 4, 6) + pieces(SRC / 'equip-armor.png', 4, 2, grow=0)
    for i in range(len(pcs)):                        # a re-painted single piece wins over its sheet cell
        one = SRC / f'equip-{i}.png'
        if one.exists():
            im = Image.open(one); rgba = key(im); mask = rgba[..., 3] > 40
            lab, n = blobs(mask)
            big = np.argmax(np.bincount(lab[lab > 0])); sel = lab == big
            ys, xs = np.nonzero(sel); piece = rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1].copy()
            piece[~sel[ys.min():ys.max() + 1, xs.min():xs.max() + 1], 3] = 0; pcs[i] = piece
    assert len(pcs) == len(names) == 32
    for i in POLEARMS: pcs[i] = head(pcs[i])
    for i, p in enumerate(pcs): icon(p).save(OUT / f'{i}.webp', 'WEBP', lossless=True, quality=100, method=6)
    (OUT / 'index.json').write_text(json.dumps([{'id': i, 'name': n} for i, n in enumerate(names)], ensure_ascii=False, indent=1) + '\n')
    sheet = Image.new('RGBA', (8 * 72, 4 * 72), (58, 40, 24, 255))      # contact sheet on the card's wood, local only
    for i in range(32):
        im = Image.open(OUT / f'{i}.webp'); sheet.alpha_composite(im, (i % 8 * 72 + 4, i // 8 * 72 + 4))
    (SRC / 'contact.png').write_bytes(b''); sheet.save(SRC / 'contact.png')
    print('wrote 32 icons')

if __name__ == '__main__': main()
