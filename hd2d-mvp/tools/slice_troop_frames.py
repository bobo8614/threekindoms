"""Slice a 白兵 troop action sheet (tools/gen_troop_frames_codex.sh) into the strip src/tacticalview.js plays.

  python3 hd2d-mvp/tools/slice_troop_frames.py <side>-<kind>[-v2][-turn] [--height N]
  python3 hd2d-mvp/tools/slice_troop_frames.py --duel <officer_id|attacker|defender>   (a general's -turn sheet)
  python3 hd2d-mvp/tools/slice_troop_frames.py --wheel <officer_id|attacker|defender>  (a general's -wheel sheet)

In:  assets/ai/sprites/source/troops/<key>.png — 4×4 poses on magenta, order = FRAMES[kind] below.
Out: assets/ai/sprites/troops/<key>.png  — one row of equal cells, every frame on the same foot baseline
     (cell bottom) and the same anchor x (the feet for a man on foot, the barrel for a horse), one shared
     scale and one shared palette so the man never jumps in size or colour between frames.
     assets/ai/sprites/troops/<key>.json — cell size, anchor, idle figure height, rest (pixels the lying
     DEAD pose sinks), and the clips (frame, hold ms, event) the field plays.
A <key>-turn sheet (front / back views, troop_frame_prompts.mjs --turn) is sliced the same way at the same
height; its clips are named '<front|back>:<clip>' and it stays out of index.json (the side strip loads it).
A general's <key>-wheel sheet (three-quarter views, duel_frame_prompts.mjs --wheel) is sliced at his side strip's
scale too, and likewise stays out of the index.
An idle man is --height pixels tall (default 69 spearman with his tall 戟, 57 archer, 73 mounted): one man stands for a whole
squad at about 0.9 world units, so this keeps ~67 texels per unit, crisp at that size and close to the ground's
chunky texels.
"""
import argparse, json, os
from collections import deque
from PIL import Image, ImageFilter

FRAMES = {
    'soldier': ['idle_a', 'idle_b', 'walk_1', 'walk_2', 'walk_3', 'walk_4', 'run', 'windup', 'strike', 'follow', 'guard', 'hurt', 'stagger', 'fall', 'dead', 'cheer'],
    'archer': ['idle_a', 'idle_b', 'walk_1', 'walk_2', 'walk_3', 'walk_4', 'run', 'draw', 'aim', 'loose', 'windup', 'strike', 'hurt', 'fall', 'dead', 'cheer'],
    'cavalry': ['idle_a', 'idle_b', 'walk_1', 'walk_2', 'walk_3', 'walk_4', 'gallop_1', 'gallop_2', 'gallop_3', 'gallop_4', 'windup', 'strike', 'hurt', 'fall', 'dead', 'cheer'],
}
# Clip names match the 单挑 strips' (idle, walk, attack, hurt) so generals and troops share one player.
# 'hit' marks the frame whose end lands the blow; 'loose' the frame whose end lets an arrow fly.
def clips(kind):
    walk = [['walk_1', 130], ['walk_2', 130], ['walk_3', 130], ['walk_4', 130]]
    c = {
        'idle': [['idle_a', 900], ['idle_b', 520]],
        'walk': walk,
        'hurt': [['hurt', 170]] + ([['stagger', 170]] if kind == 'soldier' else []),
        'fall': [['hurt', 90], ['fall', 220]],
        'cheer': [['cheer', 600]],
    }
    if kind == 'cavalry':
        c['charge'] = [['gallop_1', 80], ['gallop_2', 80], ['gallop_3', 80], ['gallop_4', 80]]
        c['attack'] = [['windup', 150], ['strike', 80, 'hit'], ['strike', 140], ['idle_a', 120]]
    else:
        c['charge'] = [['walk_1', 90], ['run', 90], ['walk_3', 90], ['run', 90]]
        c['attack'] = [['windup', 150], ['strike', 80, 'hit'], ['strike', 130]] + ([['follow', 150]] if kind == 'soldier' else [])
    if kind == 'soldier': c['guard'] = [['guard', 300]]
    if kind == 'archer': c['volley'] = [['draw', 150], ['aim', 220], ['loose', 50, 'loose'], ['loose', 180]]
    return c

TURN_POSES = ['idle', 'walk_1', 'walk_2', 'walk_3', 'walk_4', 'windup', 'strike', 'hurt']
TURN_FRAMES = [f'{d}_{p}' for d in ('front', 'back') for p in TURN_POSES]
WHEEL_FRAMES = [f'quarter_front_{i}' for i in range(1, 5)] + [f'quarter_back_{i}' for i in range(1, 5)] + [f'quarter_flee_{i}' for i in range(1, 5)] \
    + ['loose_quarter_1', 'loose_quarter_2', 'loose_front_1', 'loose_front_2']
def turn_clips(kind):
    c = {}
    for d in ('front', 'back'):
        f = lambda p: f'{d}_{p}'
        walk = [[f(f'walk_{i}'), 130] for i in range(1, 5)]
        c[f'{d}:idle'] = [[f('idle'), 1400]]
        c[f'{d}:walk'] = walk
        c[f'{d}:charge'] = [[x, 80 if kind == 'cavalry' else 90] for x, _ in walk]
        c[f'{d}:hurt'] = [[f('hurt'), 300]]
        c[f'{d}:attack'] = [[f('windup'), 150], [f('strike'), 80, 'hit'], [f('strike'), 140], [f('idle'), 100]]
        if kind == 'archer': c[f'{d}:volley'] = [[f('windup'), 370], [f('strike'), 50, 'loose'], [f('strike'), 180]]
    return c

LOOK_KIND = {'elephant': 'cavalry', 'hillman': 'soldier', 'ashigaru': 'soldier', 'steppe': 'cavalry'}  # = BORROW in troop_sprite_prompts.mjs

ap = argparse.ArgumentParser()
ap.add_argument('key'); ap.add_argument('--height', type=int); ap.add_argument('--colors', type=int)
ap.add_argument('--duel', action='store_true', help="key is a 单挑 rider (officer id / attacker / defender): slice its -turn sheet")
ap.add_argument('--wheel', action='store_true', help="key is a 单挑 rider: slice its -wheel sheet")
a = ap.parse_args()
MVP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
wheel = a.wheel; a.duel = a.duel or wheel
if a.duel:
    # A general's front / back strip rides with his 单挑 strip: same idle height, so one scale fits both.
    side_meta = json.load(open(os.path.join(MVP, f'assets/ai/sprites/duel/{a.key}.json')))
    a.key, kind, turn = f'{a.key}-{"wheel" if wheel else "turn"}', 'cavalry', True
    a.height = a.height or side_meta['figH']; a.colors = a.colors or 48
    SRC, OUT = 'assets/ai/sprites/source/duel', 'assets/ai/sprites/duel'
else:
    look = a.key.split('-')[1]; turn = a.key.endswith('-turn')
    # An extended look (troop_look_prompts.mjs) borrows an original kind's frame order and clips; its idle height is its own:
    # the war elephant towers over a horse, the ashigaru's height counts his upright spear and banner, the hillman crouches (his head
    # sits a little below a standing spearman's helmet); checked against the original strips' idle frames on one baseline.
    kind = LOOK_KIND.get(look, look)
    IDLE_H = {'soldier': 69, 'archer': 57, 'cavalry': 73, 'elephant': 100, 'hillman': 47, 'ashigaru': 72, 'steppe': 76}
    a.height = a.height or IDLE_H[look]; a.colors = a.colors or 40
    SRC, OUT = 'assets/ai/sprites/source/troops', 'assets/ai/sprites/troops'
names = WHEEL_FRAMES if wheel else TURN_FRAMES if turn else FRAMES[kind]
ext = not a.duel and look != kind

def bg(p): r, g, b, _ = p; return r > 140 and b > 140 and g < 130 and abs(r - b) < 100
# The extended looks' sheets sometimes come with a thin dark-purple ground shadow under the feet (magenta in shade); it
# must not survive as a stripe under the figure. Only for them: the original strips are never re-sliced (docs/dev/art.md).
def shade(p): r, g, b, _ = p; return r > 50 and b > 50 and g < min(r, b) * 0.35 and abs(r - b) < 50
def load(path):
    sheet = Image.open(path).convert('RGBA'); W, H = sheet.size; px = sheet.load()
    for y in range(H):
        for x in range(W):
            if bg(px[x, y]) or (ext and shade(px[x, y])): px[x, y] = (0, 0, 0, 0)
            else:
                r, g, b, al = px[x, y]
                if r > 120 and b > 120 and g < r - 60 and g < b - 60: px[x, y] = (40, 24, 32, 255)  # pink fringe → outline
    return sheet

def main_figure(cell, inner=None):
    """Keep the cell's large connected parts (man, horse, weapon); drop specks and neighbours' tips.
    inner: the cell's own box when `cell` was cropped with a margin; a part counts only if its centre lies
    in it, so a foot or bow tip that strays over the grid line stays with its own figure."""
    w, h = cell.size; al = cell.getchannel('A').load(); seen = bytearray(w * h); comps = []
    for y0 in range(h):
        for x0 in range(w):
            if seen[y0 * w + x0] or al[x0, y0] < 128: continue
            q = deque([(x0, y0)]); seen[y0 * w + x0] = 1; pts = []
            while q:
                x, y = q.popleft(); pts.append((x, y))
                for nx in (x - 1, x, x + 1):
                    for ny in (y - 1, y, y + 1):
                        if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and al[nx, ny] >= 128:
                            seen[ny * w + nx] = 1; q.append((nx, ny))
            comps.append(pts)
    if inner:
        x0, y0, x1, y1 = inner
        comps = [c for c in comps if x0 <= sum(x for x, _ in c) / len(c) < x1 and y0 <= sum(y for _, y in c) / len(c) < y1]
    comps.sort(key=len, reverse=True)
    keep = set()
    for c in comps:
        edge = any(x <= 1 or x >= w - 2 or y <= 1 or y >= h - 2 for x, y in c)
        if c is comps[0] or (len(c) >= max(40, len(comps[0]) * 0.02) and (not edge or len(c) >= len(comps[0]) * 0.25)): keep.update(c)
    out = Image.new('RGBA', cell.size); src = cell.load(); dst = out.load()
    for x, y in keep: dst[x, y] = src[x, y]
    return out

def owners(sheet, cw, ch):
    """Each opaque pixel's cell, by the centre of the connected part it belongs to over the whole sheet, so
    a neighbour's figure reaching over the grid line (a long-legged walker above a lunge) is never kept as
    a part of this cell just because the cell's crop cut it in two."""
    w, h = sheet.size; al = sheet.getchannel('A').load(); own = [-1] * (w * h)
    for y0 in range(h):
        for x0 in range(w):
            if own[y0 * w + x0] != -1 or al[x0, y0] < 128: continue
            q = deque([(x0, y0)]); own[y0 * w + x0] = -2; pts = []
            while q:
                x, y = q.popleft(); pts.append((x, y))
                for nx in (x - 1, x, x + 1):
                    for ny in (y - 1, y, y + 1):
                        if 0 <= nx < w and 0 <= ny < h and own[ny * w + nx] == -1 and al[nx, ny] >= 128:
                            own[ny * w + nx] = -2; q.append((nx, ny))
            cx, cy = sum(x for x, _ in pts) / len(pts), sum(y for _, y in pts) / len(pts)
            cell = min(3, int(cy // ch)) * 4 + min(3, int(cx // cw))
            for x, y in pts: own[y * w + x] = cell
    return own

sheet = load(os.path.join(MVP, SRC, f'{a.key}.png'))
W, H = sheet.size; cw, ch = W // 4, H // 4; figs = []
own = owners(sheet, cw, ch)
m = ch // 8  # figures may stray this far over the grid line
for i, _ in enumerate(names):
    x0, y0 = (i % 4) * cw, (i // 4) * ch
    bx0, by0, bx1, by1 = max(0, x0 - m), max(0, y0 - m), min(W, x0 + cw + m), min(H, y0 + ch + m)
    crop = sheet.crop((bx0, by0, bx1, by1)); cp = crop.load()
    for y in range(by0, by1):
        for x in range(bx0, bx1):
            if own[y * W + x] not in (-1, i): cp[x - bx0, y - by0] = (0, 0, 0, 0)
    c = main_figure(crop, (x0 - bx0, y0 - by0, x0 - bx0 + cw, y0 - by0 + ch))
    figs.append(c.crop(c.getchannel('A').getbbox()))
scale = a.height / figs[0].height
small = []
for f in figs:
    s = f.resize((max(1, round(f.width * scale)), max(1, round(f.height * scale))), Image.BOX)
    s.putalpha(s.getchannel('A').point(lambda v: 255 if v >= 110 else 0))
    small.append(s)
# Shared palette across the strip so colours never flicker between poses.
joint = Image.new('RGB', (sum(s.width for s in small), max(s.height for s in small))); x = 0
for s in small: joint.paste(s.convert('RGB'), (x, 0), s); x += s.width
pal = joint.quantize(colors=a.colors, method=Image.MEDIANCUT)
def q(s):
    rgb = s.convert('RGB').quantize(palette=pal, dither=Image.NONE).convert('RGBA'); rgb.putalpha(s.getchannel('A')); return rgb
small = [q(s) for s in small]

def anchor_x(s, name):
    """Feet (bottom fifth) for a man on foot, the barrel band for a horse; the lying pose is centred."""
    if name == 'dead': return s.width / 2
    al = s.getchannel('A').load(); xs = n = 0
    band = range(int(s.height * 0.45), int(s.height * 0.75)) if kind == 'cavalry' else range(int(s.height * 0.8), s.height)
    for y in band:
        for x in range(s.width):
            if al[x, y]: xs += x; n += 1
    return xs / n if n else s.width / 2

def rest_px(s):
    """The lying pose rests on its lowest row at least half as wide as its widest (thin shafts don't count)."""
    al = s.getchannel('A').filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3)); px = al.load()
    rows = [sum(1 for x in range(s.width) if px[x, y]) for y in range(s.height)]
    return next((s.height - 1 - y for y in range(s.height - 1, -1, -1) if rows[y] >= max(rows) * 0.5), 0)

anchors = [anchor_x(s, n) for s, n in zip(small, names)]
left = max(anchors) + 1; right = max(s.width - ax for s, ax in zip(small, anchors)) + 1
cellW = int(left + right) + 1; cellH = max(s.height for s in small) + 1; A = int(left)
strip = Image.new('RGBA', (cellW * len(names), cellH))
for i, (s, ax) in enumerate(zip(small, anchors)):
    strip.alpha_composite(s, (i * cellW + A - round(ax), cellH - s.height))
out = os.path.join(MVP, OUT); os.makedirs(out, exist_ok=True)
strip.save(os.path.join(out, f'{a.key}.png'))
meta = {'kind': kind, **({'look': look} if not a.duel and look != kind else {}), 'frames': names, 'cell': [cellW, cellH], 'anchor': A, 'figH': small[0].height,
        # an extended look is drawn at its borrowed kind's pixel scale (tacticalview.js card): ref is that kind's idle height, so the
        # elephant stands taller than a horse and the hillman shorter than a spearman, as drawn
        **({'ref': IDLE_H[kind]} if ext else {}),
        'rest': 0 if turn else rest_px(small[names.index('dead')]), 'clips': {} if wheel else turn_clips(kind) if turn else clips(kind)}
json.dump(meta, open(os.path.join(out, f'{a.key}.json'), 'w'), ensure_ascii=False, indent=1)
if not a.duel:  # the duel index belongs to slice_duel_frames.py
    # The boot loads every strip in the index; an extended look stays out of it (loaded only for a pack that uses it).
    keys = sorted(f[:-5] for f in os.listdir(out) if f.endswith('.json') and f not in ('index.json', 'looks.json') and not f.endswith('-turn.json')
                  and f[:-5].split('-')[1] in FRAMES)
    json.dump(keys, open(os.path.join(out, 'index.json'), 'w'))
    # The extended looks have their own list, read only when a pack's faction wears one (src/app.js loadTroopLooks); the
    # release packages leave it and the strips out (desktop/build-app.mjs), so there the squads wear the original kinds.
    looks = sorted(f[:-5] for f in os.listdir(out) if f.endswith('.json') and f not in ('index.json', 'looks.json') and not f.endswith('-turn.json')
                   and f[:-5].split('-')[1] in LOOK_KIND)
    if looks: json.dump(looks, open(os.path.join(out, 'looks.json'), 'w'))
print(a.key, len(names), 'frames', 'cell', cellW, cellH, 'figH', small[0].height)
