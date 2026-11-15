#!/usr/bin/env python3
# Paint the hand that writes the date on the 记录 scroll (src/vignette.js write()), a prop over the storyboard.
#   python3 hd2d-mvp/tools/gen_record_hand.py [--take a]   paint assets/ai/vignettes/source/v2/record/hand[-take].png
#   python3 hd2d-mvp/tools/gen_record_hand.py --build      publish v2/record/hand.webp from it
# The full-size painting stays local (see AGENTS.md). The key is read as in gen_warmap_api.py.
import base64, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

MVP = Path(__file__).resolve().parents[1]
SOURCE = MVP / 'assets/ai/vignettes/source/v2/record'
PROMPT = """One right hand and forearm in a dark red embroidered sleeve holding a Chinese writing brush, as if writing on a table, seen from slightly above, in exactly the art style and sleeve of the first attached picture: hand-painted HD-2D pixel art, warm light from the upper right.
The forearm comes in from the bottom right corner of the picture and runs diagonally up and to the left, the sleeve cut off by the bottom and right edges of the picture. The hand is in the upper middle, an adult's hand with natural proportions, fingers gripping the brush upright. The brush has a red-brown lacquered handle with a white ferrule, the same as the brush in the first picture. It stands nearly upright with its bristle tip pointing straight down, wet with red cinnabar ink, and the very tip is in the left part of the picture, well inside the frame.
The second attached picture is the exact background: the whole background is that one perfectly flat, uniform, bright pure green (#00FF00), right up to the edges of the hand, sleeve and brush. There is no glow, halo, outer light, shadow, table, paper, gradient, black or dark area around them, and nothing else appears. No green anywhere on the hand, the sleeve or the brush."""


def paint(take):
    sys.path.insert(0, str(Path(__file__).parent))
    from gen_warmap_api import edit, png
    out = SOURCE / f'hand{"-" + take if take else ""}.png'
    if out.exists(): sys.exit(f'{out} exists: pass --take to keep it')
    sheet = Image.open(SOURCE / 'sheet.png').convert('RGB')
    w, h = sheet.width // 3, sheet.height // 3
    panel = sheet.crop((2 * w, h, 3 * w, 2 * h))  # frame 6: the hand lifting the brush
    r = edit([png(panel), png(Image.new('RGB', (512, 512), (0, 255, 0)))], PROMPT, 1, 'gpt-image-2.6-sunburst', 'high', size='1536x1536')
    out.write_bytes(base64.b64decode(r['data'][0]['b64_json']))  # as returned: it may carry its own alpha
    print('saved', out)


def build(size=224, grow=536, along=(0.8, 0.6)):
    """Reduce the painting (the API paints it on real transparency), run the sleeve on past its cut edges so the arm
    always reaches the edge of the frame, and lay a soft shadow under it."""
    im = Image.open(SOURCE / 'hand.png').convert('RGBA').resize((size, size), Image.BOX)
    a = np.asarray(im, dtype=np.float32) / 255
    m = a[..., 3] > 0.5
    ys, xs = np.nonzero(m)
    left = xs < size * 0.3  # the brush is out here, the sleeve is not
    y = int(ys[left].max()); x = int(round(xs[left][ys[left] == y].mean()))
    N = size + grow; out = np.zeros((N, N, 4), dtype=np.float32); out[:size, :size] = a
    for yy in range(N):  # each new pixel takes the colour where a line back along the arm leaves the painting
        for xx in range(N):
            if xx < size and yy < size: continue
            k = max((xx - (size - 2)) / along[0], (yy - (size - 2)) / along[1])
            sx, sy = int(round(xx - k * along[0])), int(round(yy - k * along[1]))
            if 0 <= sx < size and 0 <= sy < size and a[sy, sx, 3] > 0.5:
                out[yy, xx] = a[sy, sx]; out[yy, xx, :3] *= max(0.3, 1 - k / 240)  # falls off into the dark of the room
    arm = Image.fromarray(np.uint8(out * 255 + 0.5), 'RGBA')
    soft = arm.filter(ImageFilter.GaussianBlur(5))  # the run-on is a plain dim sleeve, not stretched embroidery
    yy, xx = np.mgrid[:N, :N]
    fade = np.clip((np.maximum(xx, yy) - (size - 14)) / 12, 0, 1)
    keep = np.asarray(arm.getchannel('A'), dtype=np.float32)
    merged = np.asarray(arm, dtype=np.float32) * (1 - fade[..., None]) + np.asarray(soft, dtype=np.float32) * fade[..., None]
    merged[..., 3] = keep
    arm = Image.fromarray(np.uint8(merged + 0.5), 'RGBA')
    shadow = Image.new('RGBA', arm.size, (20, 8, 4, 0)); shadow.putalpha(arm.getchannel('A').point(lambda v: v * 0.42).filter(ImageFilter.GaussianBlur(5)))
    sheet = Image.new('RGBA', arm.size); sheet.paste(shadow, (9, 12)); sheet.alpha_composite(arm)
    dst = MVP / 'assets/ai/vignettes/v2/record/hand.webp'
    sheet.save(dst, lossless=True, method=6)
    print(dst, dst.stat().st_size // 1024, 'KB', 'size', sheet.size, 'tip', (x, y))


a = sys.argv[1:]
if '--build' in a: build()
else: paint(a[a.index('--take') + 1] if '--take' in a else '')
