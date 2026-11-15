"""Slice a war-map march sheet (tools/gen_march_frames_codex.sh) into the strip src/warview.js plays.

  python3 hd2d-mvp/tools/slice_march_frames.py <attacker|defender> [--height 96] [--colors 48] [--mirror back,front]

In:  assets/ai/sprites/source/march/<side>.png — 4×3 figures on magenta: rows side / front / back
     (three-quarter views turned to the viewer's right), columns stand / walk_1 / walk_2 / walk_3. A row the
     generator drew facing left is flipped with --mirror <row>[,<row>] so every frame faces right.
Out: assets/ai/sprites/march/<side>.png  — one row of equal cells, every frame on the same hoof baseline
     (cell bottom) and centred on its body, one shared scale (the side STAND is --height px tall, the size of
     the old single sprite) and one shared palette so the general never changes size or colour as he turns.
     assets/ai/sprites/march/<side>.json — cell size, frame names in strip order, the side STAND's height
     (the game scales the whole strip so that figure keeps the old on-screen size).
"""
import argparse, json, os
from collections import deque
from PIL import Image

ROWS = ['side', 'front', 'back']
COLS = ['stand', 'walk_1', 'walk_2', 'walk_3']
ap = argparse.ArgumentParser()
ap.add_argument('side', choices=['attacker', 'defender'])
ap.add_argument('--height', type=int, default=96); ap.add_argument('--colors', type=int, default=48)
ap.add_argument('--mirror', default='')
a = ap.parse_args()
MVP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def bg(p): r, g, b, _ = p; return r > 140 and b > 140 and g < 130 and abs(r - b) < 100
sheet = Image.open(os.path.join(MVP, 'assets/ai/sprites/source/march', f'{a.side}.png')).convert('RGBA')
W, H = sheet.size; px = sheet.load()
for y in range(H):
    for x in range(W):
        if bg(px[x, y]): px[x, y] = (0, 0, 0, 0)
        else:
            r, g, b, al = px[x, y]
            if r > 120 and b > 120 and g < r - 60 and g < b - 60: px[x, y] = (40, 24, 32, 255)  # pink fringe → outline

def main_figure(cell):
    """The cell's largest connected part plus any sizeable parts not touching the cell edge (banner, spear tip)."""
    w, h = cell.size; al = cell.getchannel('A').load(); seen = bytearray(w * h); comps = []
    for y0 in range(h):
        for x0 in range(w):
            if seen[y0 * w + x0] or al[x0, y0] < 128: continue
            q = deque([(x0, y0)]); seen[y0 * w + x0] = 1; pts = []
            while q:
                x, y = q.popleft(); pts.append((x, y))
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1), (x + 1, y + 1), (x - 1, y - 1), (x + 1, y - 1), (x - 1, y + 1)):
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and al[nx, ny] >= 128:
                        seen[ny * w + nx] = 1; q.append((nx, ny))
            comps.append(pts)
    comps.sort(key=len, reverse=True)
    keep = set()
    for c in comps:
        edge = any(x <= 1 or x >= w - 2 or y >= h - 2 for x, y in c)
        if c is comps[0] or (len(c) >= max(40, len(comps[0]) * 0.02) and not edge): keep.update(c)
    out = Image.new('RGBA', cell.size); src = cell.load(); dst = out.load()
    for x, y in keep: dst[x, y] = src[x, y]
    return out.crop(out.getchannel('A').getbbox())

cw, ch = W // 4, H // 3
names, figs = [], []
for r, row in enumerate(ROWS):
    for c, col in enumerate(COLS):
        names.append(f'{row}_{col}')
        f = main_figure(sheet.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch)))
        figs.append(f.transpose(Image.FLIP_LEFT_RIGHT) if row in a.mirror.split(',') else f)
scale = a.height / figs[0].height  # side stand sets the scale
small = []
for f in figs:
    s = f.resize((max(1, round(f.width * scale)), max(1, round(f.height * scale))), Image.BOX)
    s.putalpha(s.getchannel('A').point(lambda v: 255 if v >= 128 else 0))
    small.append(s)
# Shared palette across every frame.
joint = Image.new('RGB', (sum(s.width for s in small), max(s.height for s in small))); x = 0
for s in small: joint.paste(s.convert('RGB'), (x, 0), s); x += s.width
pal = joint.quantize(colors=a.colors, method=Image.MEDIANCUT)
def q(s):
    rgb = s.convert('RGB').quantize(palette=pal, dither=Image.NONE).convert('RGBA'); rgb.putalpha(s.getchannel('A')); return rgb
small = [q(s) for s in small]

# Anchor each frame on its body: the centroid of the lower half (horse barrel and legs), so a raised spear or a
# banner off to one side doesn't shift the figure off its cell's centre between frames.
def anchor_x(s):
    al = s.getchannel('A').load(); xs = n = 0
    for y in range(s.height // 2, s.height):
        for x in range(s.width):
            if al[x, y]: xs += x; n += 1
    return xs / n if n else s.width / 2
anchors = [anchor_x(s) for s in small]
left = max(anchors) + 2; right = max(s.width - ax for s, ax in zip(small, anchors)) + 2
cellW = int(left + right); cellH = max(s.height for s in small) + 2; A = int(left)
strip = Image.new('RGBA', (cellW * len(small), cellH))
for i, (s, ax) in enumerate(zip(small, anchors)):
    strip.alpha_composite(s, (i * cellW + A - round(ax), cellH - s.height))
out_dir = os.path.join(MVP, 'assets/ai/sprites/march'); os.makedirs(out_dir, exist_ok=True)
strip.save(os.path.join(out_dir, f'{a.side}.png'))
json.dump({'cell': [cellW, cellH], 'anchor': A, 'frames': names, 'standHeight': a.height}, open(os.path.join(out_dir, f'{a.side}.json'), 'w'), indent=1)
print(f'{a.side}: {len(names)} frames, cell {cellW}×{cellH}')
