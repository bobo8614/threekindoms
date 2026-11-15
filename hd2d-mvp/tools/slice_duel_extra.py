"""Slice a rider's third 单挑 sheet (舍身 and defeat poses, gen_duel_frames_codex.sh --c) into its own strip.

  python3 hd2d-mvp/tools/slice_duel_extra.py <key>

The shipped strip assets/ai/sprites/duel/<key>.png is never re-sliced (reslicing changes its scale and can empty
frames); this sheet is cut into a separate card that matches it:
- scale: the sheet's first cell repeats IDLE A, so it is scaled to the shipped strip's idle figure height (figH);
- palette: every frame is snapped to the shipped strip's own colours, so nothing shifts in colour between cards;
- ground: Codex does not keep one ground line across a sheet's cells (the idle hooves touch the cell edge, lying
  men sit higher), so each frame finds its own: the lowest row where the figure stands. For a horse that is the
  lowest row with two separate hooves or one run two hooves wide; for a man alone, the lowest row as wide as a third of his body
  (DOWNED-style, so a weapon or hand reaching below does not hold him up). meta.base[frame] is that line's height
  above the frame's bottom edge in strip px (0 or more): the duel sinks the frame by it, so a hanging blade tip
  goes below the ground instead of lifting the horse. Airborne cells get base 0: the duel's arc lifts them;
- anchor: the horse's barrel centroid, measured in a band fixed above the ground line (a hanging weapon does not
  shift it); man/weapon-alone cells are centred on their body instead.

In:  assets/ai/sprites/source/duel/<key>-c.png (FRAMES_C order, magenta background)
Out: assets/ai/sprites/duel/<key>-c.png and <key>-c.json ({frames, cell, anchor, figH, base, tips, picks}),
     and extra.json, the keys that have one
"""
import argparse, json, os, sys
from collections import deque
from PIL import Image, ImageFilter

FRAMES_C = ['idle_ref', 'allin_charge_1', 'allin_charge_2', 'allin_leap', 'allin_smear', 'allin_impact', 'allin_land',
            'hurt_crush', 'slump', 'man_fly', 'man_hit', 'man_struggle', 'horse_rear', 'weapon', 'man_kneel', 'triumph']
ALONE = {'man_fly', 'man_hit', 'man_struggle', 'weapon', 'man_kneel'}  # no horse: centre the part instead of the barrel
ONLY_LARGEST = {'man_fly', 'man_hit', 'man_struggle', 'horse_rear', 'weapon', 'man_kneel'}  # drop a stray weapon beside him
AIRBORNE = {'allin_leap', 'allin_smear', 'man_fly'}  # drawn above the ground line on purpose
# --take c2: slice <key>-c2.png (a later draw of the same layout) instead of <key>-c.png; the earlier take stays on disk.
# --pick name=sheet: take just that cell from <key>-<sheet>.png.

ap = argparse.ArgumentParser(); ap.add_argument('key'); ap.add_argument('--take', default='c'); ap.add_argument('--pick', nargs='*', default=[]); a = ap.parse_args()
picks = dict(p.split('=') for p in a.pick)
MVP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = os.path.join(MVP, f'assets/ai/sprites/source/duel/{a.key}-{a.take}.png')
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

def components(cell):
    w, h = cell.size; al = cell.getchannel('A').load(); seen = bytearray(w * h); comps = []
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

def figure(cell, name):
    """The cell's figure: its large parts (specks and neighbours' tips across the side/bottom edge dropped)."""
    w, h = cell.size; comps = components(cell); keep = set(comps[0])
    if name not in ONLY_LARGEST:
        for c in comps[1:]:
            edge = any(x <= 1 or x >= w - 2 or y >= h - 2 for x, y in c)
            if len(c) >= max(40, len(comps[0]) * 0.02) and not edge: keep.update(c)
    else:  # dust puffs drawn under a landing man are small separate parts; keep them when they sit under him
        for c in comps[1:]:
            if name == 'man_hit' and len(c) >= 40: keep.update(c)
            # a pair of weapons (151's twin halberds) is drawn as two pieces of about the same size: keep both
            if name == 'weapon' and len(c) >= len(comps[0]) * 0.5: keep.update(c)
    out = Image.new('RGBA', cell.size); s, d = cell.load(), out.load()
    for x, y in keep: d[x, y] = s[x, y]
    return out

def stand_px(s, name):
    """How many px of the (scaled) frame lie below the line it stands on (see the docstring)."""
    if name in AIRBORNE or name == 'weapon': return 0
    al = s.getchannel('A').load(); w, h = s.size
    rows = [[x for x in range(w) if al[x, y]] for y in range(h)]
    if name in ALONE:
        wide = max(len(r) for r in rows)
        return next(h - 1 - y for y in range(h - 1, -1, -1) if len(rows[y]) >= wide / 3)
    for y in range(h - 1, -1, -1):
        runs, prev = [], None
        for x in rows[y]:
            if prev is None or x > prev + 1: runs.append([x, x])
            else: runs[-1][1] = x
            prev = x
        # two hooves side by side, or one run two hooves wide (front hooves landing together); a blade or spear tip is thinner
        if sum(1 for r0, r1 in runs if r1 - r0 >= 1) >= 2 or any(r1 - r0 >= 7 for r0, r1 in runs): return h - 1 - y
    return 0

def cut_sheet(path):
    """Cells, their bboxes, each row's ground line and the sheet's scale (by its own IDLE A cell).
    Codex does not keep every figure inside its quarter of the sheet: a weapon raised in triumph, a rearing horse's head
    or a smear's arc runs over the line into the next cell, and a cut along the grid took it off (关羽's blade, 2026-11-14).
    So each connected part of the sheet goes whole to the cell that holds most of it, and a cell is cut with a margin
    wide enough to take what reaches out of it. A part shared more evenly between cells (two figures touching) is still
    cut along the grid, as before. The scale is still measured on the IDLE A cell as the grid cuts it, so no frame
    changes size."""
    sheet = load(path); cw, ch = sheet.width // 4, sheet.height // 4
    grid = lambda i: ((i % 4) * cw, (i // 4) * ch, (i % 4 + 1) * cw, (i // 4 + 1) * ch)
    mx, my = cw * 2 // 5, ch * 2 // 5
    wide = [Image.new('RGBA', (cw + 2 * mx, ch + 2 * my)) for _ in FRAMES_C]; src_px = sheet.load()
    for pts in components(sheet):
        per = {}
        for x, y in pts: k = min(3, y // ch) * 4 + min(3, x // cw); per[k] = per.get(k, 0) + 1
        own = max(per, key=per.get)
        whole = per[own] >= len(pts) * 0.85
        for x, y in pts:
            k = own if whole else min(3, y // ch) * 4 + min(3, x // cw)
            x0, y0 = grid(k)[:2]; u, v = x - x0 + mx, y - y0 + my
            if 0 <= u < cw + 2 * mx and 0 <= v < ch + 2 * my: wide[k].load()[u, v] = src_px[x, y]
    cells = [figure(c, n) for c, n in zip(wide, FRAMES_C)]
    boxes = [c.getchannel('A').getbbox() for c in cells]
    idle = figure(sheet.crop(grid(0)), FRAMES_C[0]).getchannel('A').getbbox()
    return cells, boxes, M['figH'] / (idle[3] - idle[1])

sheets = {a.take: cut_sheet(src)}
for n, sh in picks.items():
    if n not in FRAMES_C: sys.exit(f'--pick: no frame {n}')
    if sh not in sheets: sheets[sh] = cut_sheet(os.path.join(MVP, f'assets/ai/sprites/source/duel/{a.key}-{sh}.png'))

# The shipped strip's palette (its opaque colours) — every new pixel snaps to the nearest of them.
shipped = Image.open(ship + '.png').convert('RGBA')
cols = sorted({p[:3] for p in shipped.get_flattened_data() if p[3] >= 128}) if hasattr(shipped, 'get_flattened_data') else sorted({p[:3] for p in shipped.getdata() if p[3] >= 128})
pal_img = Image.new('P', (1, 1)); flat = [v for c in cols for v in c]; pal_img.putpalette(flat + flat[:3] * (256 - len(cols)))

frames, base, ground_px = [], {}, []
for i, n in enumerate(FRAMES_C):
    cells, boxes, scale = sheets[picks.get(n, a.take)]
    c, b = cells[i], boxes[i]
    f = c.crop(b); s = f.resize((max(1, round(f.width * scale)), max(1, round(f.height * scale))), Image.BOX)
    alpha = s.getchannel('A').point(lambda v: 255 if v >= 128 else 0)
    s = s.convert('RGB').quantize(palette=pal_img, dither=Image.NONE).convert('RGBA'); s.putalpha(alpha)
    frames.append(s)
    base[n] = stand_px(s, n)
    ground_px.append(s.height - base[n])  # the ground line, in px down from the frame's top

def anchor_x(s, name, gy):
    if name in ALONE:  # the body's centre, on the opened alpha so a hand or weapon reaching out does not pull it
        al = s.getchannel('A').filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(5)); b = al.getbbox()
        return (b[0] + b[2]) / 2 if b else s.width / 2
    al = s.getchannel('A').load(); xs = k = 0
    h = M['figH']  # the barrel band: 25–55 % of the idle figure's height above the ground line
    for y in range(max(0, int(gy - h * 0.55)), min(s.height, int(gy - h * 0.25))):
        for x in range(s.width):
            if al[x, y]: xs += x; k += 1
    return xs / k if k else s.width / 2
anchors = [anchor_x(s, n, gy) for s, n, gy in zip(frames, FRAMES_C, ground_px)]
left = max(anchors) + 2; right = max(s.width - ax for s, ax in zip(frames, anchors)) + 2
cellW, cellH, A = int(left + right), max(s.height for s in frames) + 2, int(left)
strip = Image.new('RGBA', (cellW * len(frames), cellH)); tips = {}
for i, (s, ax, n) in enumerate(zip(frames, anchors, FRAMES_C)):
    strip.alpha_composite(s, (i * cellW + A - round(ax), cellH - s.height))
    if n.startswith('allin_') or n == 'triumph':  # forward-most weapon pixel above the belly line, like the shipped strip
        al = s.getchannel('A').load(); best = None
        for y in range(0, int(s.height * 0.7)):
            for x in range(s.width - 1, -1, -1):
                if al[x, y]:
                    if best is None or x > best[0]: best = (x, y)
                    break
        if best: tips[n] = [best[0] - round(ax), s.height - best[1] - base[n]]  # height above the ground line
strip.save(ship + '-c.png')
json.dump({'frames': FRAMES_C, 'cell': [cellW, cellH], 'anchor': A, 'figH': M['figH'], 'base': base, 'tips': tips, 'take': a.take, 'picks': picks},
          open(ship + '-c.json', 'w'), ensure_ascii=False, indent=1)
# The riders who have this sheet, for the game's loader (src/app.js asks only for these).
lst = os.path.join(MVP, 'assets/ai/sprites/duel/extra.json')
keys = sorted({f[:-7] for f in os.listdir(os.path.dirname(lst)) if f.endswith('-c.json')})
json.dump(keys, open(lst, 'w'))
print(a.key, 'cell', cellW, cellH, 'base', {k: v for k, v in base.items() if v}, 'picks', picks, 'colours', len(cols))
