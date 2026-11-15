"""Reduce the 白兵 set pieces painted by tools/gen_tactical_codex.sh (assets/ai/tactical/source/*.png, local
only) to what the game loads (assets/ai/tactical/*.webp): the magenta keyed out to alpha, sized down.
  python3 hd2d-mvp/tools/bake_tactical.py
banners.webp is the two cloths cropped to their bounds side by side; banners.json gives each one's rect.
"""
import json
from pathlib import Path
from PIL import Image

MVP = Path(__file__).resolve().parents[1]
SRC, OUT = MVP / 'assets/ai/tactical/source', MVP / 'assets/ai/tactical'


def keyed(im):
    """Magenta (and its anti-aliased fringe) to transparent; the fringe's pink spill taken back out."""
    im = im.convert('RGBA')
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, _ = px[x, y]
            m = min(r, b) - g  # how magenta
            if m > 90:
                px[x, y] = (0, 0, 0, 0)
            elif m > 40:
                px[x, y] = (min(r, g + 30), g, min(b, g + 30), 255)
    return im


def main():
    face = keyed(Image.open(SRC / 'wall-face.png')).resize((1024, 342), Image.LANCZOS)
    face.putalpha(face.getchannel('A').point(lambda a: 255 if a > 127 else 0))
    face.save(OUT / 'wall-face.webp', quality=88)
    Image.open(SRC / 'wall-top.png').convert('RGB').resize((512, 512), Image.LANCZOS).save(OUT / 'wall-top.webp', quality=88)
    b = keyed(Image.open(SRC / 'banners.png'))
    half = b.width // 2
    parts = [b.crop((0, 0, half, b.height)), b.crop((half, 0, b.width, b.height))]
    parts = [p.crop(p.getchannel('A').getbbox()) for p in parts]
    k = 360 / max(p.height for p in parts)
    parts = [p.resize((round(p.width * k), round(p.height * k)), Image.LANCZOS) for p in parts]
    sheet = Image.new('RGBA', (sum(p.width for p in parts) + 4, max(p.height for p in parts)), (0, 0, 0, 0))
    rects, x = {}, 0
    for name, p in zip(['attacker', 'defender'], parts):
        sheet.paste(p, (x, 0)); rects[name] = [x, 0, p.width, p.height]; x += p.width + 4
    sheet.putalpha(sheet.getchannel('A').point(lambda a: 255 if a > 127 else 0))
    sheet.save(OUT / 'banners.webp', quality=90)
    (OUT / 'banners.json').write_text(json.dumps({'w': sheet.width, 'h': sheet.height, 'rects': rects}))
    print('baked', [p.name for p in OUT.glob('*.webp')])


if __name__ == '__main__':
    main()
