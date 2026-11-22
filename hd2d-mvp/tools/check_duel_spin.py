"""Check the sliced 单挑 spin / leap cards (slice_duel_spin.py) and lay them out for a visual check.

  python3 hd2d-mvp/tools/check_duel_spin.py [--sheet OUT.png] [key ...]

Spin: spin_1..4 loop three times while the horse stands still, so a horse that moves between those frames jitters.
For each spin frame the horse band (the lower 45 % of the idle figure, above the ground line) is compared with
spin_1's, aligned on the anchor and the ground line; more than 18 % of it differing is flagged. A ground line
(meta.base) that moves by more than 3 px between grounded frames is flagged too.
Leap: leap_apex must be the highest figure; leap_slam and leap_miss must stand on the ground.
--sheet writes a contact sheet of every card (one row per rider and kind, led by the shipped strip's idle frame)
on a grass-grey background.
"""
import argparse, json, os
from PIL import Image

ap = argparse.ArgumentParser(); ap.add_argument('keys', nargs='*'); ap.add_argument('--sheet'); a = ap.parse_args()
MVP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(MVP, 'assets/ai/sprites/duel')


def frames(key, kind):
    m = json.load(open(os.path.join(D, f'{key}-{kind}.json'))); im = Image.open(os.path.join(D, f'{key}-{kind}.png')).convert('RGBA')
    cw, ch = m['cell']
    return m, {n: im.crop((i * cw, 0, (i + 1) * cw, ch)) for i, n in enumerate(m['frames'])}


def horse_mask(f, base, figH):
    w, h = f.size; gy = h - base; al = f.getchannel('A').load()
    return {(x, y - gy) for y in range(max(0, int(gy - figH * 0.45)), gy) for x in range(w) if al[x, y]}


keys = a.keys or sorted({f.split('-')[0] for f in os.listdir(D) if f.endswith('-spin.json') or f.endswith('-leap.json')})
problems, rows = [], []
for k in keys:
    for kind in ('spin', 'leap'):
        if not os.path.exists(os.path.join(D, f'{k}-{kind}.json')): continue
        m, fr = frames(k, kind); base = m['base']
        # the shipped strip's idle first, so a costume or colour that drifted from it shows in the same row
        sm = json.load(open(os.path.join(D, f'{k}.json'))); sw, sh = sm['cell']
        rows.append((k, kind, {'shipped': Image.open(os.path.join(D, f'{k}.png')).convert('RGBA').crop((0, 0, sw, sh)), **fr}))
        if kind == 'spin':
            # against spin_1, not idle_ref: an idle blade hanging below the horse (孙权 137) differs without any jitter
            ref = horse_mask(fr['spin_1'], base['spin_1'], m['figH'])
            for n in ('spin_2', 'spin_3', 'spin_4'):
                cur = horse_mask(fr[n], base[n], m['figH'])
                diff = len(ref ^ cur) / max(1, len(ref | cur))
                if diff > 0.18: problems.append(f'{k} spin {n}: horse differs from idle by {diff:.0%}')
                # a horse that sits a few px to the side jitters even when its shape matches
                lo = lambda f, b: f.crop((0, f.height - b - int(m['figH'] * 0.45), f.width, f.height - b))
                r0, c0 = lo(fr['spin_1'], base['spin_1']).getchannel('A'), lo(fr[n], base[n]).getchannel('A')
                import numpy as np
                ra, ca = np.asarray(r0) > 0, np.asarray(c0) > 0
                dx = max(range(-10, 11), key=lambda d: ((np.roll(ca, d, 1) & ra).sum(), -abs(d)))
                if abs(dx) > 2: problems.append(f'{k} spin {n}: horse sits {dx:+d} px off spin_1')
            gl = [base[n] for n in m['frames']]
            if max(gl) - min(gl) > 3: problems.append(f'{k} spin: ground line moves {min(gl)}..{max(gl)} px')
        else:
            top = {n: f.getchannel('A').getbbox() for n, f in fr.items()}
            lift = {n: f.height - b[3] for n, f in fr.items() for b in [top[n]]}  # px of air under the figure in its cell
            if base['leap_slam'] > 6 or base['leap_miss'] > 12: problems.append(f'{k} leap: slam/miss ground line high ({base["leap_slam"]}, {base["leap_miss"]})')
            h = {n: top[n][3] - top[n][1] for n in fr}
            if h['leap_apex'] < h['idle_ref'] * 0.6: problems.append(f'{k} leap: apex figure only {h["leap_apex"]} px tall (idle {h["idle_ref"]})')
print('\n'.join(problems) or 'no problems flagged')

if a.sheet and rows:
    W = max(sum(f.width for f in fr.values()) for _, _, fr in rows) + 70
    H = sum(max(f.height for f in fr.values()) + 6 for _, _, fr in rows)
    out = Image.new('RGBA', (W, H), (92, 108, 88, 255)); y = 0
    from PIL import ImageDraw
    d = ImageDraw.Draw(out)
    for k, kind, fr in rows:
        d.text((4, y + 4), f'{k}\n{kind}', fill=(255, 255, 255, 255)); x = 70
        for f in fr.values(): out.alpha_composite(f, (x, y)); x += f.width
        y += max(f.height for f in fr.values()) + 6
    out.save(a.sheet); print('sheet', a.sheet, out.size)
