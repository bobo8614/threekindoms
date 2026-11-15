"""Publish the standard waist-up portraits (tools/gen_halfbody_codex.sh) for the game.

  python3 hd2d-mvp/tools/build_halfbody.py [--guides OUT.png]

In:  assets/ai/halfbody/source/<id>.png (full-size GPT output, local only) and the optional
     assets/ai/halfbody/align.json {"<id>": {"dy": px, "scale": k}} that nudges a picture whose eye line or
     head size drifted from the template (eyes at 22% of the height, head about 26%), in output pixels.
Out: assets/ai/halfbody/<id>.webp (768x1152) and assets/ai/halfbody/index.json (ids, read by src/app.js).
--guides writes a contact sheet with the template lines (crown 6%, eyes 22%, chin 32%) for checking by eye.
"""
import argparse, json
from pathlib import Path
from PIL import Image, ImageDraw

MVP = Path(__file__).resolve().parents[1]
SRC, OUT = MVP / 'assets/ai/halfbody/source', MVP / 'assets/ai/halfbody'
W, H = 768, 1152
ap = argparse.ArgumentParser(); ap.add_argument('--guides'); a = ap.parse_args()
align = json.loads((OUT / 'align.json').read_text()) if (OUT / 'align.json').exists() else {}
ids, pics = [], []
for src in sorted(SRC.glob('*.png'), key=lambda p: int(p.stem)):
    im = Image.open(src).convert('RGB').resize((W, H), Image.LANCZOS)
    adj = align.get(src.stem, {})
    dy = adj.get('dy', 0)
    k = max(adj.get('scale', 1), 1 + 2 * abs(dy) / H + 0.005)  # zoom just enough that the shift leaves no gap
    if k != 1 or dy:
        big = im.resize((round(W * k), round(H * k)), Image.LANCZOS)
        x0, y0 = (big.width - W) // 2, (big.height - H) // 2 - dy
        im = big.crop((x0, y0, x0 + W, y0 + H))
    im.save(OUT / f'{src.stem}.webp', 'WEBP', quality=90, method=6)
    ids.append(src.stem); pics.append(im)
(OUT / 'index.json').write_text(json.dumps(ids))
print(len(ids), 'waist-up portraits:', ' '.join(ids))
if a.guides and pics:
    t = 256; sheet = Image.new('RGB', (t * len(pics), int(t * 1.5)))
    for i, im in enumerate(pics):
        sm = im.resize((t, int(t * 1.5))); d = ImageDraw.Draw(sm)
        for f, c in ((0.06, '#ffffff'), (0.22, '#ff4040'), (0.32, '#40ff40')): d.line([(0, f * sm.height), (t, f * sm.height)], fill=c)
        sheet.paste(sm, (i * t, 0))
    sheet.save(a.guides); print('guides →', a.guides)
