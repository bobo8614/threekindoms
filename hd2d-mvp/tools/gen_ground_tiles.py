#!/usr/bin/env python3
# Seamless ground textures for the Blender battlefield (tools/blender_warmap.py), painted in the A2 style:
# grass, dry grass, earth, sand, cliff rock, water, river-bank pebbles and snow, seen from straight above. The image
# model does not tile on its own, so each picture is made seamless here (its halves swapped and the seams
# blended from a mirrored copy) and kept at 1024 px under assets/ai/warground/source/blender/tiles/.
#   python3 hd2d-mvp/tools/gen_ground_tiles.py [name ...]
import base64, io, os, sys
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from PIL import Image

MVP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, f'{MVP}/tools')
from gen_warmap_api import edit, png

STYLE = f'{MVP}/docs/review-assets/2026-10-29/war-style/A2-disciplined-hd2d.png'
OUT = f'{MVP}/assets/ai/warground/source/blender/tiles'
TILES = {
    'grass': 'lush meadow grass: dense small grass tufts in several greens, lighter lit tips and darker gaps, a few tiny yellow and white flowers',
    'drygrass': 'dry trampled grass: olive and straw-coloured tufts with small patches of bare brown earth showing through',
    'earth': 'bare packed brown earth with small pebbles, cracks and a few sparse grass tufts',
    'rock': 'a weathered brown-grey cliff face of stratified sandstone: horizontal layers of blocky stone, cracks, small ledges with moss',
    'water': 'deep river water: blue water with small ripples and short white glints of light, no foam lines, no objects',
    'pebbles': 'a river bank of rounded grey and brown pebbles and gravel, a little damp, with a few grass blades',
    'sand': 'dry sandy ground: pale tan and ochre sand with small pebbles, faint wind-smoothed ripples and a few sparse dry grass tufts',
    'snow': 'a thin layer of snow on the ground, soft bluish shading in the hollows, a few dry grass tips and dark earth showing through',
}
PROMPT = """Paint a square, seamless, tileable ground texture of {what}, seen from straight above (orthographic, no
perspective, no horizon). Art style and palette exactly as the ground in the image given (our approved battle-map
concept): hand-painted HD-2D pixel art, crisp 2-4 px clusters, fine dithering, muted warm palette, soft light from
the upper left. Even detail over the whole square, no single large feature, no vignette, no border, no text."""


def seamless(im):
    """Swaps the halves so the old edges meet in the middle, then blends a soft cross over that seam from the
    picture as it was (whose middle is seamless)."""
    a = np.asarray(im, float); h, w = a.shape[:2]
    b = np.roll(np.roll(a, h // 2, 0), w // 2, 1)
    y = np.abs(np.arange(h) - h / 2)[:, None] / (h / 2); x = np.abs(np.arange(w) - w / 2)[None, :] / (w / 2)
    k = np.clip(1 - np.minimum(y, x) * 5, 0, 1)[..., None]   # 1 on the seam cross, 0 a tenth of the way out
    return Image.fromarray((b * (1 - k) + a * k).astype(np.uint8))


def one(name):
    out = f'{OUT}/{name}.png'
    if os.path.exists(out): return print('kept', out)
    r = edit([png(Image.open(STYLE).convert('RGB'))], PROMPT.format(what=TILES[name]), 1, 'gpt-image-2.5-sunburst', 'high', size='1024x1024')
    im = Image.open(io.BytesIO(base64.b64decode(r['data'][0]['b64_json']))).convert('RGB')
    im.save(out.replace('.png', '-raw.png')); seamless(im).save(out); print('saved', out, flush=True)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    with ThreadPoolExecutor(4) as ex: list(ex.map(one, sys.argv[1:] or list(TILES)))
