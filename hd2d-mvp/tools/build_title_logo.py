#!/usr/bin/env python3
"""Publish the title lettering (tools/gen_title_logo_codex.sh) for src/titlescreen.js.

Keys out the flat magenta ground, crops to the plate, scales it to the title's pixel grid (HEIGHT pixels tall,
the opening scales them up crisp) with a hard alpha edge, and writes assets/ai/title-logo.webp plus
title-logo.json: its size, where the arrow strikes 志 and the band the letters fill (for the Ⅱ and the arrow),
both as fractions of the image.
    python3 hd2d-mvp/tools/build_title_logo.py [take] [--hit x,y] [--letters top,bottom]
"""
import json, sys
from pathlib import Path
from PIL import Image

MVP = Path(__file__).resolve().parent.parent
HEIGHT = 104
a = sys.argv[1:]
opt = lambda k, d: (a.pop(a.index(k) + 1), a.remove(k))[0] if k in a else d
hit = [float(v) for v in opt('--hit', '0.80,0.42').split(',')]
letters = [float(v) for v in opt('--letters', '0.2,0.8').split(',')]
take = a[0] if a else ''
src = Image.open(MVP / f'assets/ai/title-source/logo{"-" + take if take else ""}.png').convert('RGBA')

# The ground: anything near magenta (high red and blue, low green) goes; the fringe it leaves is cut by the alpha step.
px = src.load()
for y in range(src.height):
    for x in range(src.width):
        r, g, b, _ = px[x, y]
        if r > 150 and b > 150 and g < 120 and abs(r - b) < 90: px[x, y] = (0, 0, 0, 0)
src = src.crop(src.getbbox())
w = round(src.width * HEIGHT / src.height)
im = src.resize((w, HEIGHT), Image.LANCZOS)
p = im.load()
for y in range(im.height):
    for x in range(im.width):
        r, g, b, al = p[x, y]
        p[x, y] = (round(r * 255 / al), round(g * 255 / al), round(b * 255 / al), 255) if al >= 128 else (0, 0, 0, 0)
im.save(MVP / 'assets/ai/title-logo.webp', lossless=True)
(MVP / 'assets/ai/title-logo.json').write_text(json.dumps({'w': w, 'h': HEIGHT, 'hit': hit, 'letters': letters}) + '\n')
print('title-logo', w, 'x', HEIGHT, 'hit', hit, 'letters', letters)
