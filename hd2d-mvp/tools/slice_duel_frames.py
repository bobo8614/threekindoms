"""Slice a 单挑 action sheet (tools/gen_duel_frames_codex.sh) into the strip src/duelview.js plays.

  python3 hd2d-mvp/tools/slice_duel_frames.py <key> [--weapon blade|spear|sword] [--height 112]

In:  assets/ai/sprites/source/duel/<key>.png — 4×4 poses on magenta, order = FRAMES below; and, when
     present, <key>-b.png — the second sheet (FRAMES_B), whose first cell repeats idle_a so it is
     scaled to the same rider height before its frames join the strip.
Out: assets/ai/sprites/duel/<key>.png  — one row of equal cells, every frame on the same hoof
     baseline (cell bottom) and the same horse anchor x, one shared scale and one shared palette so
     armour, face and horse never jump in size or colour between frames.
     assets/ai/sprites/duel/<key>.json — cell size, anchor, idle figure height, per-frame weapon tip,
     and the clips (frame, hold ms, event) for the rider's weapon class.
"""
import argparse, json, os
from collections import deque
from PIL import Image, ImageFilter

FRAMES = ['idle_a', 'idle_b', 'gallop_1', 'gallop_2', 'gallop_3', 'gallop_4', 'windup', 'strike',
          'follow', 'hurt', 'taunt', 'fall', 'dodge', 'downed', 'loose_1', 'loose_2']
FRAMES_B = ['idle_ref', 'walk_1', 'walk_2', 'walk_3', 'walk_4', 'swing_mid', 'swing_late', 'recover',
            'feint_ready', 'feint_jab', 'feint_back', 'allin_windup', 'allin_strike', 'off_balance', 'hit_light', 'recoil_step']
# Clip timings are a tuning start (see docs/审美与单挑动作优化交接.md D5), not measured from the original.
# Frame flags: 'go' — the rider lunges toward the contact point during this frame; 'hit' — the lunge
# arrives at the end of this frame and contact fires: hit-stop, sparks, sound, the foe's hurt pose,
# damage number and HP bar together.
WIND = {'blade': 160, 'spear': 140, 'sword': 120}
LUNGE = {'blade': 100, 'spear': 80, 'sword': 70}
def clips(w, full):
    common = {
        'stagger':   [['hurt', 260], ['dodge', 200]],
        'dodge':     [['dodge', 260]],
        'taunt':     [['taunt', 700]],
        'idle':      [['idle_a', 900], ['idle_b', 520]],
        'gallop':    [['gallop_1', 90], ['gallop_2', 90], ['gallop_3', 90], ['gallop_4', 90]],
        'loose':     [['loose_1', 110], ['loose_2', 110]],
    }
    if not full:
        return {**common,
            'attack':    [['windup', WIND[w]], ['strike', LUNGE[w], 'hit'], ['strike', 140], ['follow', 210]],
            'feint':     [['idle_b', 70], ['strike', 60, 'hit'], ['strike', 70], ['follow', 120]],
            'desperate': [['windup', WIND[w] + 200], ['strike', LUNGE[w] + 20, 'hit'], ['strike', 200], ['follow', 320]],
            'hurt':      [['hurt', 150], ['gallop_2', 90], ['gallop_3', 90]],
            'walk':      [['gallop_2', 160], ['idle_b', 160]],
        }
    third = LUNGE[w] // 3
    return {**common,
        # 攻击: full wind-up, the weapon travels over and through in three poses, a normal recovery.
        'attack':    [['windup', WIND[w]], ['swing_mid', third, 'go'], ['swing_late', third, 'go'], ['strike', third, 'hit'],
                      ['strike', 110], ['follow', 110], ['recover', 120]],
        # 牵制: a small cock, a short jab that stops at the horse's chest, snatched straight back.
        'feint':     [['feint_ready', 90], ['feint_jab', 60, 'hit'], ['feint_jab', 50], ['feint_back', 130]],
        # 舍身: the deepest wind-up, rider up in the stirrups, everything thrown forward, a long recovery.
        'desperate': [['allin_windup', WIND[w] + 220], ['swing_mid', 50, 'go'], ['allin_strike', 50, 'hit'],
                      ['allin_strike', 180], ['follow', 150], ['recover', 220]],
        # A 舍身 that misses leaves him over-extended before he can recover.
        'desperate_miss': [['allin_windup', WIND[w] + 220], ['swing_mid', 50, 'go'], ['allin_strike', 50, 'hit'],
                      ['off_balance', 380], ['recover', 260]],
        'hurt_light': [['hit_light', 140], ['recoil_step', 140]],
        'hurt':      [['hurt', 150], ['recoil_step', 160]],
        'hurt_heavy': [['hurt', 260], ['recoil_step', 200]],
        'walk':      [['walk_1', 160], ['walk_2', 160], ['walk_3', 160], ['walk_4', 160]],
    }

ap = argparse.ArgumentParser()
ap.add_argument('key'); ap.add_argument('--weapon'); ap.add_argument('--height', type=int, default=112)
ap.add_argument('--colors', type=int, default=48)
a = ap.parse_args()
MVP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if not a.weapon:
    if a.key in ('attacker', 'defender'): a.weapon = 'blade'
    else:
        D = json.load(open(os.path.join(MVP, 'data/game-data.json')))
        a.weapon = ['sword', 'blade', 'spear'][D['officers'][int(a.key)]['weapon'] // 8]

def bg(p): r, g, b, _ = p; return r > 140 and b > 140 and g < 130 and abs(r - b) < 100
def load(path):
    sheet = Image.open(path).convert('RGBA'); W, H = sheet.size; px = sheet.load()
    for y in range(H):
        for x in range(W):
            if bg(px[x, y]): px[x, y] = (0, 0, 0, 0)
            else:
                r, g, b, al = px[x, y]
                if r > 120 and b > 120 and g < r - 60 and g < b - 60: px[x, y] = (40, 24, 32, 255)  # pink fringe → outline
    return sheet

def components(cell):
    """The cell's 8-connected opaque parts, largest first."""
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
    return comps

def main_figure(cell):
    """Keep the cell's large connected parts (rider + horse + weapon); drop specks and neighbours' tips."""
    w, h = cell.size; comps = components(cell)
    keep = set()
    for c in comps:
        # A neighbour's tail, weapon tip or the blade of the cell below poking across the side or bottom edge is
        # small; a rider thrown clear of his horse (FALL) can touch the edge too, but he is a large part of the
        # figure and stays. The top edge is left alone: a weapon flung upward in FALL reaches it.
        edge = any(x <= 1 or x >= w - 2 or y >= h - 2 for x, y in c)
        if c is comps[0] or (len(c) >= max(40, len(comps[0]) * 0.02) and (not edge or len(c) >= len(comps[0]) * 0.25)): keep.update(c)
    out = Image.new('RGBA', cell.size); src = cell.load(); dst = out.load()
    for x, y in keep: dst[x, y] = src[x, y]
    return out

def rest_px(s):
    """DOWNED lies as an upright plane on its bottom row, but that row is often the dropped weapon drawn in front
    of (below) the body, which would hold the body up off the ground. The body rests on the lowest row that is
    at least half as wide as its widest, measured after opening the alpha (erode, then dilate) so thin shafts
    and blades lying under him do not count. The duel sinks the lying man by this many pixels."""
    al = s.getchannel('A').filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(5)); px = al.load()
    rows = [sum(1 for x in range(s.width) if px[x, y]) for y in range(s.height)]
    return next((s.height - 1 - y for y in range(s.height - 1, -1, -1) if rows[y] >= max(rows) * 0.5), 0)

def cut(sheet, names):
    """One figure per grid cell, all scaled by the sheet's own first (idle) cell so both sheets share a rider height."""
    W, H = sheet.size; cw, ch = W // 4, H // 4; figs = []
    for i, _ in enumerate(names):
        c = main_figure(sheet.crop(((i % 4) * cw, (i // 4) * ch, (i % 4 + 1) * cw, (i // 4 + 1) * ch)))
        figs.append(c.crop(c.getchannel('A').getbbox()))
    scale = a.height / figs[0].height
    out = []
    for f in figs:
        s = f.resize((max(1, round(f.width * scale)), max(1, round(f.height * scale))), Image.BOX)
        s.putalpha(s.getchannel('A').point(lambda v: 255 if v >= 128 else 0))
        out.append(s)
    return out

src = os.path.join(MVP, 'assets/ai/sprites/source/duel')
small = cut(load(os.path.join(src, f'{a.key}.png')), FRAMES)
full = os.path.exists(os.path.join(src, f'{a.key}-b.png'))
if full:
    small += cut(load(os.path.join(src, f'{a.key}-b.png')), FRAMES_B)[1:]  # idle_ref only calibrates the scale
    FRAMES = FRAMES + FRAMES_B[1:]
# Shared palette: quantize all frames together so colours never flicker between poses.
atlas_w = sum(s.width for s in small); atlas_h = max(s.height for s in small)
joint = Image.new('RGB', (atlas_w, atlas_h)); x = 0
for s in small: joint.paste(s.convert('RGB'), (x, 0), s); x += s.width
pal = joint.quantize(colors=a.colors, method=Image.MEDIANCUT)
def q(s):
    rgb = s.convert('RGB').quantize(palette=pal, dither=Image.NONE).convert('RGBA'); rgb.putalpha(s.getchannel('A')); return rgb
small = [q(s) for s in small]

def anchor_x(s, name):
    """Horse anchor: centroid of the horse's barrel band (25–55 % up from the hooves)."""
    if name == 'downed': return s.width / 2
    al = s.getchannel('A').load(); xs = n = 0
    for y in range(int(s.height * 0.45), int(s.height * 0.75)):
        for x in range(s.width):
            if al[x, y]: xs += x; n += 1
    return xs / n if n else s.width / 2
anchors = [anchor_x(s, n) for s, n in zip(small, FRAMES)]

def body_h(s):
    """Height of the figure's solid body in px: from the hooves to the first row with a 9 px opaque run.
    The strips are all 112 px tall including the weapon, so a raised glaive shrank the rider; duelview
    sizes riders by this instead."""
    al = s.getchannel('A').load(); bb = s.getchannel('A').getbbox()
    for y in range(bb[1], bb[3]):
        best = cur = 0
        for x in range(s.width): cur = cur + 1 if al[x, y] else 0; best = max(best, cur)
        if best >= 9: return bb[3] - y
    return bb[3] - bb[1]
left = max(ax for ax in anchors) + 2; right = max(s.width - ax for s, ax in zip(small, anchors)) + 2
cellW = int(left + right); cellH = max(s.height for s in small) + 2; A = int(left)
strip = Image.new('RGBA', (cellW * len(FRAMES), cellH))
tips = {}
for i, (s, ax, name) in enumerate(zip(small, anchors, FRAMES)):
    ox = i * cellW + A - round(ax); oy = cellH - s.height
    strip.alpha_composite(s, (ox, oy))
    # Weapon tip: the forward-most opaque pixel above the horse's belly line, relative to the anchor.
    al = s.getchannel('A').load(); best = None
    for y in range(0, int(s.height * 0.7)):
        for x in range(s.width - 1, -1, -1):
            if al[x, y]:
                if best is None or x > best[0]: best = (x, y)
                break
    if best: tips[name] = [best[0] - round(ax), s.height - best[1]]
os.makedirs(os.path.join(MVP, 'assets/ai/sprites/duel'), exist_ok=True)
strip.save(os.path.join(MVP, f'assets/ai/sprites/duel/{a.key}.png'))
meta = {'weapon': a.weapon, 'frames': FRAMES, 'cell': [cellW, cellH], 'anchor': A, 'figH': small[0].height, 'body': body_h(small[0]),
        'tips': tips, 'rest': rest_px(small[FRAMES.index('downed')]), 'clips': clips(a.weapon, full)}
json.dump(meta, open(os.path.join(MVP, f'assets/ai/sprites/duel/{a.key}.json'), 'w'), ensure_ascii=False, indent=1)
idx = os.path.join(MVP, 'assets/ai/sprites/duel/index.json')
keys = sorted({f[:-5] for f in os.listdir(os.path.dirname(idx)) if f.endswith('.json') and f != 'index.json' and not f.endswith(('-turn.json', '-wheel.json', '-c.json')) and f != 'extra.json'})
json.dump(keys, open(idx, 'w'))
print(a.key, a.weapon, len(FRAMES), 'frames', 'cell', cellW, cellH, 'tips strike', tips.get('strike'), 'allin', tips.get('allin_strike'), 'jab', tips.get('feint_jab'))
