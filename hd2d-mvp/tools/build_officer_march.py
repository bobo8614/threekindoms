"""Build a star officer's war-map march strip from his painted 单挑 strips, so he rides the war map in his own
armour and horse instead of his side's generic general.

  python3 hd2d-mvp/tools/build_officer_march.py [officer_id ...]   (no ids: every officer in duel/index.json)

In:  assets/ai/sprites/duel/<id>.png / .json      — side profile (slice_duel_frames.py): idle_a, walk_1..4
     assets/ai/sprites/duel/<id>-turn.png / .json — straight front / back (slice_troop_frames.py --duel):
                                                     <front|back>_idle, _walk_1..4
     Both strips are cut at the same rider height (figH), so the frames join without resampling.
Out: assets/ai/sprites/march/<id>.png  — one row of equal cells, frames <side|front|back>_<stand|walk_1..4>,
     every frame on the cell's bottom baseline with the horse anchor at the same x.
     assets/ai/sprites/march/<id>.json — cell, anchor, frames, standHeight (the side stand's height, so the game
     draws him at the generic general's on-screen size).
     assets/ai/sprites/march/index.json — the officers that have a strip.
The war map shows front / back only for headings within ~35° of the camera axis (src/warview.js pose()), where
the straight-on views read right; the generic generals keep their three-quarter sheets (slice_march_frames.py).
"""
import json, os, sys
from PIL import Image

MVP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DUEL, OUT = os.path.join(MVP, 'assets/ai/sprites/duel'), os.path.join(MVP, 'assets/ai/sprites/march')
WALK = ['walk_1', 'walk_2', 'walk_3', 'walk_4']
ROWS = {'side': ('', 'idle_a', ''), 'front': ('-turn', 'idle', 'front_'), 'back': ('-turn', 'idle', 'back_')}

def load(key):
    return Image.open(os.path.join(DUEL, f'{key}.png')).convert('RGBA'), json.load(open(os.path.join(DUEL, f'{key}.json')))

# The duel strips share one small palette and on / off alpha, so an indexed PNG holds them exactly at a
# fraction of the RGBA size (checked: the decoded pixels are compared before writing).
def pixels(im): return list((getattr(im, 'get_flattened_data', None) or im.getdata)())
def save_indexed(im, path):
    colors = im.getcolors(256)
    if not colors or {p[3] for _, p in colors} - {0, 255}: return im.save(path, optimize=True)
    opaque = [p[:3] for _, p in colors if p[3] == 255]
    pal = Image.new('P', (1, 1)); pal.putpalette([0, 0, 0] + [v for c in opaque for v in c])
    idx = {c: k + 1 for k, c in enumerate(opaque)}
    out = Image.new('P', im.size); out.putpalette(pal.getpalette())
    out.putdata([idx[p[:3]] if p[3] == 255 else 0 for p in pixels(im)])
    out.info['transparency'] = 0
    if pixels(out.convert('RGBA')) != [p if p[3] == 255 else (0, 0, 0, 0) for p in pixels(im)]: raise SystemExit(f'{path}: indexed copy differs')
    out.save(path, optimize=True, transparency=0)

def build(oid):
    strips = {s: load(f'{oid}{s}') for s in ('', '-turn')}
    if strips[''][1]['figH'] != strips['-turn'][1]['figH']: raise SystemExit(f'{oid}: side and turn strips differ in height')
    names, cuts = [], []  # (frame image, its anchor x)
    for row, (suffix, stand, pre) in ROWS.items():
        img, meta = strips[suffix]; cw, chh = meta['cell']
        for col, src in [('stand', stand), *((w, w) for w in WALK)]:
            i = meta['frames'].index(pre + src)
            names.append(f'{row}_{col}'); cuts.append((img.crop((i * cw, 0, (i + 1) * cw, chh)), meta['anchor']))
    # Trim each frame to its pixels, keeping its anchor and its baseline (strips are bottom-aligned).
    trimmed = []
    for im, ax in cuts:
        l, t, r, b = im.getchannel('A').getbbox()
        trimmed.append((im.crop((l, t, r, b)), ax - l, im.height - b))
    left = max(ax for _, ax, _ in trimmed) + 2; right = max(f.width - ax for f, ax, _ in trimmed) + 2
    cellW, cellH = int(left + right), max(f.height + gap for f, _, gap in trimmed) + 2
    strip = Image.new('RGBA', (cellW * len(trimmed), cellH))
    for k, (f, ax, gap) in enumerate(trimmed):
        strip.alpha_composite(f, (k * cellW + left - ax, cellH - gap - f.height))
    save_indexed(strip, os.path.join(OUT, f'{oid}.png'))
    stand = trimmed[0][0].height
    json.dump({'cell': [cellW, cellH], 'anchor': left, 'frames': names, 'standHeight': stand}, open(os.path.join(OUT, f'{oid}.json'), 'w'), indent=1)
    return f'{oid}: {len(names)} frames, cell {cellW}×{cellH}, stand {stand}px'

ids = sys.argv[1:] or [k for k in json.load(open(os.path.join(DUEL, 'index.json'))) if k.isdigit()]
os.makedirs(OUT, exist_ok=True)
for oid in ids: print(build(oid))
have = sorted({f[:-5] for f in os.listdir(OUT) if f.endswith('.json') and f[:-5].isdigit()}, key=int)
json.dump(have, open(os.path.join(OUT, 'index.json'), 'w'))
