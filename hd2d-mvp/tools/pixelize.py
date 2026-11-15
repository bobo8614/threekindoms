"""Turn a high-res generated image (GPT / any painter) into an HD-2D game sprite.

  python3 hd2d-mvp/tools/pixelize.py in.png out.png --height 48 --colors 16 [--palette ref.png]

Steps: crop to the alpha bounding box → box-downscale to the target sprite height → hard alpha
threshold (no semi-transparent fringe, which breaks alphaTest billboards) → quantize to N colours,
optionally to the palette of a reference sprite so a whole cast shares one palette.
This is the fallback path when PixelLab/Retro Diffusion is not used; animation frames still need
a dedicated tool or hand cleanup in Aseprite.
"""
import argparse
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('src'); ap.add_argument('dst')
ap.add_argument('--height', type=int, default=48)
ap.add_argument('--colors', type=int, default=16)
ap.add_argument('--alpha', type=int, default=128)
ap.add_argument('--palette')
a = ap.parse_args()

im = Image.open(a.src).convert('RGBA')
bbox = im.getchannel('A').getbbox()
if bbox: im = im.crop(bbox)
w = max(1, round(im.width * a.height / im.height))
small = im.resize((w, a.height), Image.BOX)
mask = small.getchannel('A').point(lambda v: 255 if v >= a.alpha else 0)
rgb = small.convert('RGB')
if a.palette:
    pal = Image.open(a.palette).convert('RGB').quantize(colors=a.colors, method=Image.MEDIANCUT)
    q = rgb.quantize(palette=pal, dither=Image.Dither.NONE)
else:
    q = rgb.quantize(colors=a.colors, method=Image.MEDIANCUT, dither=Image.Dither.NONE)
out = q.convert('RGBA'); out.putalpha(mask)
out.save(a.dst)
print(a.dst, out.size, 'colours', len(set(p for p, m in zip(out.convert('RGB').getdata(), mask.getdata()) if m)))
