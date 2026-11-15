#!/usr/bin/env python3
# Reference pictures for the Blender battlefield's set pieces (tools/blender_warmap.py): one object each, in the
# A2 style, alone on a plain background from about 45 degrees above, for image-to-3D (Tripo Studio). The models
# made from them go to assets/ai/warground/source/blender/models/<name>.glb.
#   python3 hd2d-mvp/tools/gen_asset_refs.py [name ...]
import base64, io, os, sys
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

MVP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, f'{MVP}/tools')
from gen_warmap_api import edit, png

STYLE = f'{MVP}/docs/review-assets/2026-10-29/war-style/A2-disciplined-hd2d.png'
OUT = f'{MVP}/assets/ai/warground/source/blender/refs'
ASSETS = {
    'castle': 'a small walled Han-dynasty Chinese fortress town: square rammed-earth and grey brick walls with crenellations, a gate tower with a two-tier dark tiled roof over the front gate, small corner towers, a hall with a red-lacquered roof inside',
    'hamlet': 'a tiny farming hamlet: three small Chinese farmhouses with thatched and dark-tiled roofs, a wooden fence, a haystack and a cart, on a small patch of trodden earth',
    'tree-broad-a': 'one broadleaf tree with a big round dense crown made of clumps of leaves, lit tops and dark undersides, short brown trunk',
    'tree-broad-b': 'one broadleaf tree, taller and narrower than usual, irregular crown of several leaf clumps, short brown trunk',
    'tree-pine': 'one Chinese pine tree: tiered flat clumps of dark green needles on a slightly leaning reddish trunk',
    'tree-bare': 'one broadleaf tree in winter: bare dark branches, no leaves at all, short brown trunk',
    'rocks': 'a cluster of three brown-grey boulders with stratified faces and a little moss on top',
    'bush': 'one low round leafy bush, about knee high, with a few lighter leaf clumps on top',
}
PROMPT = """Draw {what}, as a single isolated game asset for image-to-3D conversion.
Art style, palette, light and level of detail exactly as in the image given (our approved battle-map concept):
hand-painted HD-2D look, muted warm palette, soft light from the upper left.
The object alone, whole and centred, seen from about 45 degrees above and slightly from the side (three-quarter view),
on a plain flat light grey background. No ground plane, no cast shadow, no other objects, no text, no frame.
Clean readable shapes and colours (not pixelated), so its form and colours can be rebuilt in 3D."""


def one(name):
    out = f'{OUT}/{name}.png'
    if os.path.exists(out): return print('kept', out)
    r = edit([png(Image.open(STYLE).convert('RGB'))], PROMPT.format(what=ASSETS[name]), 1, 'gpt-image-2.5-sunburst', 'high', size='1024x1024')
    Image.open(io.BytesIO(base64.b64decode(r['data'][0]['b64_json']))).save(out); print('saved', out, flush=True)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    names = sys.argv[1:] or list(ASSETS)
    with ThreadPoolExecutor(4) as ex: list(ex.map(one, names))
