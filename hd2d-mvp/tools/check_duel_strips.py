"""Check the 单挑 action strips (slice_duel_frames.py output) before they ship.

  python3 hd2d-mvp/tools/check_duel_strips.py [key ...]      (default: every key in duel/index.json)

Per strip: 31 frames (both sheets), PNG size = cell × frames, every frame a clip names exists, the
attack / feint / desperate / desperate_miss clips fire exactly one 'hit', the weapon tip of each hit
frame is above the horse's belly line (a blow landing among the legs while the foe plays a chest hit
reads wrong), every frame stands on the cell's bottom row (the hoof or wheel line), and no frame is a
sliver or overflows the idle height.
Prints one line per strip and exits 1 if any fails.
"""
import json, os, sys
from PIL import Image

MVP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DUEL = os.path.join(MVP, 'assets/ai/sprites/duel')
keys = sys.argv[1:] or json.load(open(os.path.join(DUEL, 'index.json')))
BELLY = 0.36  # tips are measured from 0.30 of the figure height up; below 0.36 is among the horse's legs
bad = 0
for key in keys:
    errs = []
    m = json.load(open(os.path.join(DUEL, f'{key}.json')))
    im = Image.open(os.path.join(DUEL, f'{key}.png')).convert('RGBA')
    n, (cw, ch) = len(m['frames']), m['cell']
    if n != 31: errs.append(f'{n} frames')
    if im.size != (cw * n, ch): errs.append(f'png {im.size} ≠ {(cw * n, ch)}')
    for name, steps in m['clips'].items():
        for st in steps:
            if st[0] not in m['frames']: errs.append(f'{name}: no frame {st[0]}')
    for name in ('attack', 'feint', 'desperate', 'desperate_miss'):
        hits = [st[0] for st in m['clips'].get(name, []) if 'hit' in st[2:]]
        if len(hits) != 1: errs.append(f'{name}: {len(hits)} hits'); continue
        tip = m['tips'].get(hits[0])
        if tip and tip[1] < m['figH'] * BELLY: errs.append(f'{name} lands low ({hits[0]} tip {tip[1] / m["figH"]:.2f} of the figure)')
    al = im.getchannel('A')
    for i, f in enumerate(m['frames']):
        box = al.crop((i * cw, 0, (i + 1) * cw, ch)).getbbox()
        if not box: errs.append(f'{f} empty'); continue
        if box[3] != ch: errs.append(f'{f} off baseline by {ch - box[3]}px')
        h = box[3] - box[1]
        if f not in ('downed',) and h < m['figH'] * 0.45: errs.append(f'{f} only {h}px tall')
    bad += bool(errs)
    print(('FAIL ' if errs else 'ok   ') + f"{key:>9} {m['weapon']:6} {n} frames cell {cw}×{ch}" + (' — ' + '; '.join(errs) if errs else ''))
sys.exit(1 if bad else 0)
