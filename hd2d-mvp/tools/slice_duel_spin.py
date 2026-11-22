"""Slice a rider's 3×2 普通攻击 spin or 舍身 leap sheet (gen_duel_frames_codex.sh --spin / --leap) into a duel card.

  python3 hd2d-mvp/tools/slice_duel_spin.py <key> [spin|leap] [--out DIR]

Like slice_duel_extra.py, the shipped strip assets/ai/sprites/duel/<key>.png is never re-sliced; this sheet is cut
into a separate card that matches it:
- cells: each connected part of the sheet goes whole to the cell that holds most of it (a spin trail or a smear arc
  that runs over the grid line is not cut off), and only specks are dropped, so trails and arcs survive;
- scale: the first cell repeats IDLE, so it is scaled to the shipped strip's idle figure height (figH);
- palette: every pixel near a shipped strip colour is snapped to it, so the cards never shift in colour; colours
  the strip never had (a trail's glow, a smear arc's orange-gold) are kept as drawn;
- ground: each grounded frame finds its own ground line (lowest row with two hooves, or one run two hooves wide,
  or for 诸葛亮 the wheels), and meta.base[frame] is its height above the frame's bottom edge, so a blade tip
  hanging below the hooves sinks under the ground instead of lifting the horse; airborne frames (leap_up,
  leap_apex, leap_dive) get base 0 and the duel's arc lifts them;
- anchor: the horse's barrel centroid in a band fixed above that ground line (a trail or a hanging weapon does not
  shift it).
--out DIR writes the card to DIR instead (to compare a re-slice with the shipped card) and leaves the index alone.

In:  assets/ai/sprites/source/duel/<key>-<kind>.png (magenta background)
Out: assets/ai/sprites/duel/<key>-<kind>.png and .json ({frames, cell, anchor, figH, base}), and <kind>.json
"""
import argparse, json, os, sys
from collections import deque
import numpy as np
from PIL import Image

SNAP = 16  # RGB distance within which a pixel takes the shipped strip's colour; 28+ washed 关羽's smear arc to cream

PRESETS = {
    'spin': ['idle_ref', 'spin_1', 'spin_2', 'spin_3', 'spin_4', 'spin_cleave'],
    'leap': ['idle_ref', 'leap_up', 'leap_apex', 'leap_dive', 'leap_slam', 'leap_miss'],
}
AIRBORNE = {'leap_up', 'leap_apex', 'leap_dive'}
COLS, ROWS = 3, 2

ap = argparse.ArgumentParser(); ap.add_argument('key'); ap.add_argument('kind', nargs='?', default='spin', choices=PRESETS)
ap.add_argument('--out'); a = ap.parse_args()
FRAMES = PRESETS[a.kind]
MVP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = os.path.join(MVP, f'assets/ai/sprites/source/duel/{a.key}-{a.kind}.png')
ship = os.path.join(MVP, f'assets/ai/sprites/duel/{a.key}')
if not os.path.exists(src) or not os.path.exists(ship + '.json'): sys.exit(f'need {src} and {ship}.json')
M = json.load(open(ship + '.json'))


def bg(p): r, g, b, _ = p; return r > 140 and b > 140 and g < 130 and abs(r - b) < 100


def load(path):
    sheet = Image.open(path).convert('RGBA'); px = sheet.load()
    for y in range(sheet.height):
        for x in range(sheet.width):
            if bg(px[x, y]): px[x, y] = (0, 0, 0, 0)
            else:
                r, g, b, _ = px[x, y]
                if r > 120 and b > 120 and g < r - 60 and g < b - 60: px[x, y] = (40, 24, 32, 255)  # pink fringe → outline
    return sheet


def components(img):
    w, h = img.size; al = img.getchannel('A').load(); seen = bytearray(w * h); comps = []
    for y0 in range(h):
        for x0 in range(w):
            if seen[y0 * w + x0] or al[x0, y0] < 128: continue
            q = deque([(x0, y0)]); seen[y0 * w + x0] = 1; pts = []
            while q:
                x, y = q.popleft(); pts.append((x, y))
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and al[nx, ny] >= 128:
                            seen[ny * w + nx] = 1; q.append((nx, ny))
            comps.append(pts)
    comps.sort(key=len, reverse=True)
    return comps


sheet = load(src); cw, ch = sheet.width // COLS, sheet.height // ROWS
mx, my = cw // 4, ch // 4  # a part may reach this far out of its cell
cells = [Image.new('RGBA', (cw + 2 * mx, ch + 2 * my)) for _ in FRAMES]; spx = sheet.load()
for pts in components(sheet):
    if len(pts) < 12: continue  # specks
    per = {}
    for x, y in pts: k = min(ROWS - 1, y // ch) * COLS + min(COLS - 1, x // cw); per[k] = per.get(k, 0) + 1
    own = max(per, key=per.get); whole = per[own] >= len(pts) * 0.85
    for x, y in pts:
        k = own if whole else min(ROWS - 1, y // ch) * COLS + min(COLS - 1, x // cw)
        u, v = x - (k % COLS) * cw + mx, y - (k // COLS) * ch + my
        if 0 <= u < cw + 2 * mx and 0 <= v < ch + 2 * my: cells[k].load()[u, v] = spx[x, y]
boxes = [c.getchannel('A').getbbox() for c in cells]
if any(b is None for b in boxes): sys.exit(f'empty cell: {[n for n, b in zip(FRAMES, boxes) if b is None]}')
scale = M['figH'] / (boxes[0][3] - boxes[0][1])

shipped = Image.open(ship + '.png').convert('RGBA')
cols = np.array(sorted({p[:3] for p in np.asarray(shipped).reshape(-1, 4) if p[3] >= 128 for p in [tuple(int(v) for v in p)]}), dtype=np.int32)


def snap(s):
    """Snap each pixel to the nearest shipped colour, unless none is near (a trail's glow, a smear arc's
    orange-gold): those the shipped strip never had, and snapping them washed 关羽's arc out to cream."""
    a = np.asarray(s.convert('RGBA')).astype(np.int32); rgb = a[..., :3].reshape(-1, 1, 3)
    d = ((rgb - cols[None]) ** 2).sum(-1); i = d.argmin(1); near = d[np.arange(len(i)), i] <= SNAP ** 2
    out = rgb[:, 0].copy(); out[near] = cols[i[near]]
    a[..., :3] = out.reshape(a.shape[:2] + (3,)); a[..., 3] = np.where(a[..., 3] >= 128, 255, 0)
    return Image.fromarray(a.astype(np.uint8), 'RGBA')


def stand_px(s, name):
    """How many px of the frame lie below the line it stands on (0 for an airborne frame)."""
    if name in AIRBORNE: return 0
    al = s.getchannel('A').load(); w, h = s.size
    for y in range(h - 1, -1, -1):
        runs, prev = [], None
        for x in range(w):
            if not al[x, y]: continue
            if prev is None or x > prev + 1: runs.append([x, x])
            else: runs[-1][1] = x
            prev = x
        # two hooves side by side, or one run two hooves wide; a blade or spear tip is thinner
        if sum(1 for r0, r1 in runs if r1 - r0 >= 1) >= 2 or any(r1 - r0 >= 7 for r0, r1 in runs): return h - 1 - y
    return 0


frames, base = [], {}
for n, c, b in zip(FRAMES, cells, boxes):
    f = c.crop(b); s = f.resize((max(1, round(f.width * scale)), max(1, round(f.height * scale))), Image.BOX)
    s = snap(s); frames.append(s); base[n] = stand_px(s, n)


def anchor_x(s, gy):
    """The horse's barrel: 25–55 % of the idle figure's height above the ground line."""
    al = s.getchannel('A').load(); xs = k = 0; h = M['figH']
    for y in range(max(0, int(gy - h * 0.55)), min(s.height, int(gy - h * 0.25))):
        for x in range(s.width):
            if al[x, y]: xs += x; k += 1
    return xs / k if k else s.width / 2


anchors = [anchor_x(s, s.height - base[n]) for s, n in zip(frames, FRAMES)]


def legs(s, n):
    """The lower 45 % of the idle figure above the ground line, as a bool array (rows up from the ground)."""
    a = np.asarray(s.getchannel('A')) > 0; gy = s.height - base[n]; h = int(M['figH'] * 0.45)
    out = np.zeros((h, s.width), bool); part = a[max(0, gy - h):gy]; out[h - len(part):] = part
    return out


if a.kind == 'spin':
    # The horse stands still through the spin, so its frames are registered on spin_1's legs by best overlap: the
    # barrel band takes in the robe and the trailing cloak, which move with the spin (程昱 161's spin_3 sat 5 px off).
    ref, rx = legs(frames[1], FRAMES[1]), anchors[1]
    for i in range(2, len(frames)):
        cur = legs(frames[i], FRAMES[i])

        def overlap(dx):  # dx: extra px to shift frame i right, in the strip, relative to its barrel anchor
            off = round(rx - anchors[i]) + dx; w = ref.shape[1]
            x0, x1 = max(0, off), min(w, off + cur.shape[1])
            return (ref[:, x0:x1] & cur[:, x0 - off:x1 - off]).sum() if x1 > x0 else 0
        anchors[i] -= max(range(-10, 11), key=lambda dx: (overlap(dx), -abs(dx)))
left =max(anchors) + 2; right = max(s.width - ax for s, ax in zip(frames, anchors)) + 2
cellW, cellH, A = int(left + right), max(s.height for s in frames) + 2, int(left)
strip = Image.new('RGBA', (cellW * len(frames), cellH))
for i, (s, ax) in enumerate(zip(frames, anchors)):
    strip.alpha_composite(s, (i * cellW + A - round(ax), cellH - s.height))

out_dir = a.out or os.path.dirname(ship)
os.makedirs(out_dir, exist_ok=True)
out = os.path.join(out_dir, f'{a.key}-{a.kind}')
strip.save(out + '.png')
json.dump({'frames': FRAMES, 'cell': [cellW, cellH], 'anchor': A, 'figH': M['figH'], 'base': base},
          open(out + '.json', 'w'), ensure_ascii=False, indent=1)
if not a.out:  # the riders who have this card, for the game's loader (src/app.js asks only for these)
    d = os.path.dirname(ship); suf = f'-{a.kind}.json'
    json.dump(sorted({f[:-len(suf)] for f in os.listdir(d) if f.endswith(suf)}), open(os.path.join(d, f'{a.kind}.json'), 'w'))
print(a.key, a.kind, 'cell', cellW, cellH, 'base', {k: v for k, v in base.items() if v}, 'colours', len(cols))
