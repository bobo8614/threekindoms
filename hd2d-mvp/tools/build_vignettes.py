"""Publish the 命令演出 vignettes: key and reduce the generated layers into game assets.

  python3 hd2d-mvp/tools/build_vignettes.py [scene ...]

Input:  assets/ai/vignettes/source/<scene>/<layer>.png (full-size GPT output, gen_vignette_codex.sh)
Output: assets/ai/vignettes/<scene>/<layer>.png   pixel assets in the 320×213 picture space
        assets/ai/vignettes/source/<scene>/<layer>.webp   reduced source copy (committed)
        assets/ai/vignettes/index.json            layout the game reads (src/vignette.js)

The background is box-downscaled to 320×213 and quantized; cut-outs are keyed (flood fill of the
flat key colour from the border, then despill), and every frame of a loop is scaled by ONE factor so
the figure does not breathe, then placed so its feet land on the scene's anchor point.
"""
import json, sys
from collections import deque
from pathlib import Path
from PIL import Image

MVP = Path(__file__).resolve().parents[1]
SRC, OUT = MVP / 'assets/ai/vignettes/source', MVP / 'assets/ai/vignettes'
PW, PH = 320, 213

# Scene layout in picture pixels. anchor = where the actor's left foot stands (or its centre of mass
# with 'align': 'mass'); height = height of the
# first frame (every frame of the loop is scaled by that same factor).
LAYOUT = {
    'land': {'actor': {'frames': ['actor-0', 'actor-1'], 'hold': [0.42, 0.3], 'anchor': [118, 186], 'height': 122},
             'fx': [{'type': 'ripple', 'at': [[121, 186], [186, 185]]}, {'type': 'clods', 'on': 'actor-1', 'at': [218, 181]}]},
    'industry': {'actor': {'frames': ['actor-0', 'actor-1'], 'hold': [0.4, 0.28], 'anchor': [150, 200], 'height': 128}, 'fx': [{'type': 'glow', 'at': [76, 72], 'r': 30}, {'type': 'glow', 'at': [262, 58], 'r': 38}, {'type': 'sparks', 'on': 'actor-1', 'at': [256, 116]}]},
    'pop': {'actor': {'frames': ['actor-0', 'actor-1'], 'hold': [0.6, 0.45], 'anchor': [140, 196], 'height': 112}},
    'disaster': {'actor': {'frames': ['actor-0', 'actor-1'], 'hold': [0.5, 0.35], 'anchor': [120, 196], 'height': 112}, 'fx': [{'type': 'rain'}]},
    'conscript': {'actor': {'frames': ['actor-0', 'actor-1'], 'hold': [0.45, 0.3], 'anchor': [110, 196], 'height': 112}, 'fx': [{'type': 'dust', 'on': 'actor-1', 'at': [212, 193], 'dir': 1}]},
    'move': {'actor': {'frames': ['actor-0', 'actor-1'], 'hold': [0.32, 0.32], 'anchor': [150, 206], 'height': 96, 'align': 'massx'}, 'fx': [{'type': 'dust', 'at': [72, 196]}]},
    'march': {'actor': {'frames': ['actor-0', 'actor-1'], 'hold': [0.3, 0.3], 'anchor': [150, 206], 'height': 108, 'align': 'massx'}, 'fx': [{'type': 'dust', 'at': [80, 198]}]},
    'scout': {'actor': {'frames': ['actor-0', 'actor-1'], 'hold': [0.6, 0.45], 'anchor': [120, 200], 'height': 92}},
    'alms': {'actor': {'frames': ['actor-0', 'actor-1'], 'hold': [0.5, 0.4], 'anchor': [130, 200], 'height': 116, 'fit': 'each', 'haze': True}, 'fx': [{'type': 'steam', 'at': [178, 152]}]},
    'search': {'actor': {'frames': ['actor-0', 'actor-1'], 'hold': [0.38, 0.38], 'anchor': [130, 196], 'height': 108}},
    'reward': {'actor': {'frames': ['actor-0', 'actor-1'], 'hold': [0.55, 0.4], 'anchor': [130, 198], 'height': 104}, 'fx': [{'type': 'glint', 'on': 'actor-0', 'at': [190, 132]}, {'type': 'glint', 'on': 'actor-1', 'at': [193, 96]}]},
    'market': {'actor': {'frames': ['actor-0', 'actor-1'], 'hold': [0.5, 0.5], 'anchor': [120, 198], 'height': 116, 'fit': 'each'}},
    'tax': {'actor': {'frames': ['actor-0', 'actor-1'], 'hold': [0.5, 0.42], 'anchor': [130, 198], 'height': 112, 'fit': 'each'}, 'fx': [{'type': 'glint', 'on': 'actor-1', 'at': [174, 104]}]},
    'harvest': {'actor': {'frames': ['actor-0', 'actor-1'], 'hold': [0.42, 0.32], 'anchor': [130, 200], 'height': 108}},
    'hospital': {'actor': {'frames': ['actor-0', 'actor-1'], 'hold': [0.4, 0.35], 'anchor': [110, 198], 'height': 112}, 'fx': [{'type': 'steam', 'at': [272, 86]}]},
    'school': {'actor': {'frames': ['actor-0', 'actor-1'], 'hold': [0.9, 0.5], 'anchor': [130, 198], 'height': 112, 'fit': 'each'}, 'fx': [{'type': 'glow', 'at': [162, 66], 'r': 22}, {'type': 'glow', 'at': [60, 77], 'r': 22}]},
    'weapons': {'actor': {'frames': ['actor-0', 'actor-1'], 'hold': [0.36, 0.26], 'anchor': [150, 201], 'height': 116, 'align': 'massx'}, 'fx': [{'type': 'glow', 'at': [62, 70], 'r': 48}, {'type': 'sparks', 'on': 'actor-1', 'at': [182, 154]}]},
    'envoy': {'actor': {'frames': ['actor-0', 'actor-1'], 'hold': [0.24, 0.24], 'anchor': [176, 160], 'height': 92, 'align': 'mass'}, 'fx': [{'type': 'dust', 'at': [135, 176]}]},
    # AI 间战争 (src/app.js showEvent 'autobattle'): two riders gallop across the field.
    'sortie': {'actor': {'frames': ['actor-0', 'actor-1'], 'hold': [0.24, 0.24], 'anchor': [168, 154], 'height': 128, 'align': 'mass'}, 'fx': [{'type': 'dust', 'at': [104, 198]}]},
    # 旱灾 / 洪水 (src/app.js showEvent 'disaster'): a farmer in the cracked paddies, a villager wading the flood.
    'drought': {'actor': {'frames': ['actor-0', 'actor-1'], 'hold': [0.6, 0.45], 'anchor': [104, 204], 'height': 112, 'holes': True, 'rescale': {'actor-1': 0.92}}, 'fx': [{'type': 'glow', 'at': [255, 12], 'r': 46, 'color': '255,236,190'}]},
    'flood': {'actor': {'frames': ['actor-0', 'actor-1'], 'hold': [0.5, 0.4], 'anchor': [196, 172], 'height': 92, 'align': 'base'},
              'fx': [{'type': 'wade', 'at': [196, 172, 48]}, {'type': 'ripple', 'at': [[196, 173]]}, {'type': 'rain'}]},
    # 计略演出 (war-map strategies, src/warview.js STRAT_SCENE).
    'st-fire': {'actor': {'frames': ['actor-0', 'actor-1'], 'hold': [0.4, 0.28], 'anchor': [70, 204], 'height': 118},
                'fx': [{'type': 'flames', 'at': [[214, 104], [246, 98], [280, 106], [300, 96]], 'grow': 1.4}]},
    'st-water': {'actor': {'frames': ['actor-0', 'actor-1'], 'hold': [0.45, 0.32], 'anchor': [150, 206], 'height': 116},
                 'fx': [{'type': 'rain'}]},  # the breach and the flood are painted; drawn foam bands read as stray dashes
    'st-ambush': {'actor': {'frames': ['actor-0', 'actor-1'], 'hold': [0.35, 0.3], 'anchor': [104, 204], 'height': 100},
                  'fx': [{'type': 'dust', 'on': 'actor-1', 'at': [112, 200]}]},
    'st-rock': {'actor': {'frames': ['actor-0', 'actor-1'], 'hold': [0.5, 0.3], 'anchor': [80, 150], 'height': 86},
                'fx': [{'type': 'rocks', 'on': 'actor-1', 'at': [196, 118, 95]}]},
    'st-ruse': {'actor': {'frames': ['actor-0', 'actor-1'], 'hold': [0.7, 0.5], 'anchor': [110, 204], 'height': 120},
                'fx': [{'type': 'glow', 'at': [76, 72], 'r': 32}]},
    'st-bow': {'actor': {'frames': ['actor-0', 'actor-1'], 'hold': [0.4, 0.22], 'anchor': [90, 204], 'height': 96, 'fit': 'each'},
               'fx': [{'type': 'bolts', 'on': 'actor-1', 'at': [170, 140]}]},
    'st-magic': {'actor': {'frames': ['actor-0', 'actor-1'], 'hold': [0.6, 0.45], 'anchor': [130, 196], 'height': 116},
                 'fx': [{'type': 'swirl', 'at': [160, 150]}]},
    'st-trap': {'actor': {'frames': ['actor-0', 'actor-1'], 'hold': [0.5, 0.26], 'anchor': [104, 200], 'height': 100, 'holes': True},
                'fx': [{'type': 'dust', 'on': 'actor-1', 'at': [236, 126]}]},
    # waist-deep in the rapids: the figure's flat lower edge is its waterline, hidden under ripples
    'st-rapids': {'actor': {'frames': ['actor-0', 'actor-1'], 'hold': [0.38, 0.3], 'anchor': [128, 158], 'height': 76, 'holes': True, 'align': 'massx'},
                  'fx': [{'type': 'ripple', 'at': [[108, 158], [130, 159], [152, 157]]}]},
    'st-firearrow': {'actor': {'frames': ['actor-0', 'actor-1'], 'hold': [0.45, 0.22], 'anchor': [80, 204], 'height': 112, 'holes': True},
                     'fx': [{'type': 'flames', 'at': [[232, 88], [268, 92], [302, 82]], 'grow': 1.1}]},
    'st-feint': {'actor': {'frames': ['actor-0', 'actor-1'], 'hold': [0.45, 0.3], 'anchor': [96, 202], 'height': 104, 'holes': True, 'rescale': {'actor-1': 1.17}},
                 'fx': [{'type': 'glow', 'at': [232, 112], 'r': 26}, {'type': 'flames', 'at': [[236, 126]], 'grow': 0.8}]},
    'st-strife': {'actor': {'frames': ['actor-0', 'actor-1'], 'hold': [0.4, 0.3], 'anchor': [84, 204], 'height': 108, 'holes': True},
                  'fx': [{'type': 'flames', 'at': [[248, 122], [290, 112]], 'grow': 1.0}]},
    'st-lure': {'actor': {'frames': ['actor-0', 'actor-1'], 'hold': [0.7, 0.45], 'anchor': [170, 202], 'height': 118, 'fit': 'each', 'holes': True},
                'fx': [{'type': 'glow', 'at': [100, 92], 'r': 20}, {'type': 'glow', 'at': [242, 92], 'r': 18}, {'type': 'glint', 'at': [36, 110]}]},
    'st-chain': {'actor': {'frames': ['actor-0', 'actor-1'], 'hold': [0.5, 0.26], 'anchor': [104, 200], 'height': 112, 'holes': True, 'rescale': {'actor-1': 1.18}},
                 'fx': [{'type': 'sparks', 'on': 'actor-1', 'at': [150, 178]}]},
    'st-encircle': {'actor': {'frames': ['actor-0', 'actor-1'], 'hold': [0.32, 0.26], 'anchor': [96, 204], 'height': 104, 'holes': True},
                    'fx': [{'type': 'dust', 'at': [250, 150], 'dir': -1}]},
    'st-firestorm': {'actor': {'frames': ['actor-0', 'actor-1'], 'hold': [0.4, 0.3], 'anchor': [40, 204], 'height': 92, 'holes': True},
                     'fx': [{'type': 'flames', 'at': [[196, 92], [236, 82], [276, 90], [306, 78]], 'grow': 1.4}]},
    # Columns stand upright like the original's, stepping right to left along the paper's upper edge.
    'record': {'prop': {'layer': 'brush', 'height': 64}, 'text': {'x': 190, 'y': 76, 'dx': 32, 'dy': -15, 'size': 19, 'delay': 0.35, 'perColumn': 0.5}},
}

def key(im, kind='magenta', holes=False, haze=False):
    """holes: also clear key colour shut in by the subject (inside a drawn bow, between an arm and a pole), which
    the flood fill from the border cannot reach; the prompts keep the key colour off the subject itself.
    haze: the subject has painted steam or smoke, see-through over the key, which comes out pink; any pixel whose
    red and blue both stand well above its green is taken back to the grey it would have been."""
    im = im.convert('RGBA'); w, h = im.size; px = im.load()
    if kind == 'green': bg = lambda p: p[1] > 150 and p[0] < 120 and p[2] < 120
    else: bg = lambda p: p[0] > 150 and p[2] > 150 and p[1] < 120 and abs(p[0] - p[2]) < 90
    seen = bytearray(w * h); q = deque()
    for x in range(w): q.extend([(x, 0), (x, h - 1)])
    for y in range(h): q.extend([(0, y), (w - 1, y)])
    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h or seen[y * w + x] or not bg(px[x, y]): continue
        seen[y * w + x] = 1; px[x, y] = (0, 0, 0, 0)
        q.extend([(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)])
    if holes:
        for y in range(h):
            for x in range(w):
                if px[x, y][3] and bg(px[x, y]): px[x, y] = (0, 0, 0, 0)
    for y in range(h):  # despill the key colour left on the outline
        for x in range(w):
            r, g, b, a = px[x, y]
            if a and kind != 'green' and r > 120 and b > 120 and g < r - 60 and g < b - 60: px[x, y] = (40, 24, 32, 255)
            if a and haze and kind != 'green' and r > g + 14 and b > g + 14:
                v = min(255, (g * 2 + min(r, b)) // 3); px[x, y] = (v, v, min(255, v + 4), a)
            if a and kind == 'green' and g > 140 and g > r + 60 and g > b + 60: px[x, y] = (24, 40, 24, 255)
    return im.crop(im.getchannel('A').getbbox())

def reduce(im, scale, colors=48):
    w, h = max(1, round(im.width * scale)), max(1, round(im.height * scale))
    small = im.resize((w, h), Image.BOX)
    mask = small.getchannel('A').point(lambda v: 255 if v >= 128 else 0)
    q = small.convert('RGB').quantize(colors=colors, method=Image.MEDIANCUT, dither=Image.Dither.NONE).convert('RGBA')
    q.putalpha(mask); return q

def left_foot(im):
    """(x, y) of the left foot: the leftmost opaque pixel low in the figure, and the lowest opaque
    pixel near it. A tool reaching below the feet (the hoe in the mud) does not move the anchor."""
    a = im.getchannel('A'); w, h = im.size
    xs = [x for y in range(int(h * 0.8), h) for x in range(w) if a.getpixel((x, y))]
    x0 = min(xs); band = range(x0, min(w, x0 + max(4, w // 8)))
    y0 = max(y for y in range(h) for x in band if a.getpixel((x, y)))
    return x0, y0

def base(im):
    """(x, y) of the middle of the figure's bottom edge: for a figure cut off by water at the waist, whose arms
    and load swing between poses while the waist stays put."""
    a = im.getchannel('A'); w, h = im.size
    y0 = max(y for y in range(h) for x in range(w) if a.getpixel((x, y)))
    xs = [x for y in range(max(0, y0 - 2), y0 + 1) for x in range(w) if a.getpixel((x, y))]
    return (min(xs) + max(xs)) / 2, y0

def mass(im):
    a = im.getchannel('A'); pts = [(x, y) for y in range(im.height) for x in range(im.width) if a.getpixel((x, y))]
    return sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)

def build(scene):
    src, out = SRC / scene, OUT / scene; out.mkdir(parents=True, exist_ok=True)
    lay = LAYOUT[scene]; entry = {'w': PW, 'h': PH, 'bg': f'{scene}/bg.png'}
    bg = Image.open(src / 'bg.png').convert('RGB')
    bg.resize((768, round(768 * bg.height / bg.width)), Image.LANCZOS).save(src / 'bg.webp', quality=90)
    # Crop to 3:2 around the centre, then reduce.
    r = bg.width / bg.height
    if r > PW / PH: cw = round(bg.height * PW / PH); bg = bg.crop(((bg.width - cw) // 2, 0, (bg.width + cw) // 2, bg.height))
    else: ch = round(bg.width * PH / PW); bg = bg.crop((0, (bg.height - ch) // 2, bg.width, (bg.height + ch) // 2))
    bg.resize((PW, PH), Image.BOX).quantize(colors=96, method=Image.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB').save(out / 'bg.png')
    if 'actor' in lay:
        A = lay['actor']; cuts = {f: key(Image.open(src / f'{f}.png'), holes=A.get('holes', False), haze=A.get('haze', False)) for f in A['frames']}
        for f, im in cuts.items(): im.resize((round(512 * im.width / im.height), 512), Image.LANCZOS).save(src / f'{f}.webp', quality=90)
        # One factor for the whole loop so the figure does not breathe; 'fit': 'each' instead scales every
        # standing pose to the same height (when the generator drew the second pose at another size).
        scale = A['height'] / cuts[A['frames'][0]].height
        frames = []
        for f, im in cuts.items():
            # 'rescale': {frame: k} evens out a pose the generator drew at another size (head to head with the first).
            px = reduce(im, (A['height'] / im.height if A.get('fit') == 'each' else scale) * A.get('rescale', {}).get(f, 1)); px.save(out / f'{f}.png')
            # 'align': 'mass' (centre of mass) for riders and carts, whose legs move but whose bulk does not.
            # 'massx': centre of mass across, bottom edge down — for things that stand on the ground (cart, anvil).
            al = A.get('align')
            fx, fy = mass(px) if al == 'mass' else (mass(px)[0], px.height - 1) if al == 'massx' else base(px) if al == 'base' else left_foot(px)
            fx, fy = round(fx), round(fy)
            frames.append({'src': f'{scene}/{f}.png', 'x': A['anchor'][0] - fx, 'y': A['anchor'][1] - fy})
        entry['loop'] = {'frames': frames, 'hold': A['hold']}
    if 'prop' in lay:
        P = lay['prop']; im = key(Image.open(src / f"{P['layer']}.png"))
        im.resize((round(512 * im.width / im.height), 512), Image.LANCZOS).save(src / f"{P['layer']}.webp", quality=90)
        px = reduce(im, P['height'] / im.height); px.save(out / f"{P['layer']}.png")
        entry['prop'] = {'src': f"{scene}/{P['layer']}.png", 'w': px.width, 'h': px.height}
    for k in ('fx', 'text'):
        if k in lay: entry[k] = lay[k]
    return entry

if __name__ == '__main__':
    idx_path = OUT / 'index.json'
    idx = json.loads(idx_path.read_text()) if idx_path.exists() else {}
    for s in sys.argv[1:] or [s for s in LAYOUT if (SRC / s / 'bg.png').exists()]:
        idx[s] = build(s); print(s, json.dumps(idx[s], ensure_ascii=False))
    idx_path.write_text(json.dumps(idx, ensure_ascii=False, indent=1))
