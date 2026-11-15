#!/usr/bin/env python3
"""Desktop app icons from one square artwork (GPT image via Codex, full-bleed 1024x1024).

    python3 hd2d-mvp/tools/make_icons.py <art.png>

Writes hd2d-mvp/desktop/build/:
  icon.png   the artwork as given (1024, reference)
  icon.icns  macOS: Apple's icon grid — an 824px superellipse tile centred on a 1024 canvas with a soft
             shadow — at every iconset size, via iconutil
  icon.ico   Windows: the artwork with slightly rounded corners at 16…256 px (embedded into the exe by
             desktop/build/after-pack.cjs)
"""
import subprocess, sys, tempfile
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parent.parent / 'desktop/build'
art = Image.open(sys.argv[1]).convert('RGBA').resize((1024, 1024), Image.LANCZOS)
OUT.mkdir(exist_ok=True)
art.save(OUT / 'icon.png')

def superellipse(size, n=5.0):
    """Mask of a superellipse (|x|^n + |y|^n <= 1), Apple's squircle-like tile, drawn 4x and reduced."""
    big = size * 4
    m = Image.new('L', (big, big), 0)
    px = m.load()
    r = big / 2
    for y in range(big):
        yy = abs((y + 0.5 - r) / r) ** n
        if yy > 1: continue
        x = r * (1 - yy) ** (1 / n)
        for xi in range(int(r - x), int(r + x)):
            px[xi, y] = 255
    return m.resize((size, size), Image.LANCZOS)

# macOS tile: 824 px in a 1024 canvas, a little lower than centre to leave room for the shadow.
tile = 824
mask = superellipse(tile)
mac = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
shadow = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
shadow.paste((0, 0, 0, 110), (100, 112), mask)
mac = Image.alpha_composite(mac, shadow.filter(ImageFilter.GaussianBlur(14)))
body = art.resize((tile, tile), Image.LANCZOS); body.putalpha(mask)
mac.alpha_composite(body, (100, 100))
with tempfile.TemporaryDirectory() as d:
    iconset = Path(d) / 'icon.iconset'; iconset.mkdir()
    for s in (16, 32, 128, 256, 512):
        for k in (1, 2):
            mac.resize((s * k, s * k), Image.LANCZOS).save(iconset / f'icon_{s}x{s}{"@2x" if k == 2 else ""}.png')
    subprocess.run(['iconutil', '-c', 'icns', str(iconset), '-o', str(OUT / 'icon.icns')], check=True)

# Windows: full tile, gently rounded corners (Windows 11 style).
win = art.copy()
rm = Image.new('L', (4096, 4096), 0); ImageDraw.Draw(rm).rounded_rectangle((0, 0, 4095, 4095), 4096 * 0.12, fill=255)
win.putalpha(rm.resize((1024, 1024), Image.LANCZOS))
win.save(OUT / 'icon.ico', sizes=[(s, s) for s in (16, 24, 32, 48, 64, 128, 256)])
print('icons:', *(p.name for p in sorted(OUT.glob('icon.*'))))
