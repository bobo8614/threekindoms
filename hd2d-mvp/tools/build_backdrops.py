#!/usr/bin/env python3
"""Publish the seasonal horizon panoramas (tools/gen_backdrops_codex.sh) for the battle scenes.

Each source plate is mirrored onto itself (plate | flipped plate) so the ring around the diorama closes
without a seam, then written as assets/ai/backdrops/<key>.webp (3072x768: two 1536-wide halves) and listed in
index.json.
    python3 hd2d-mvp/tools/build_backdrops.py
"""
import json
from pathlib import Path
from PIL import Image, ImageOps

MVP = Path(__file__).resolve().parent.parent
SRC, OUT = MVP / 'assets/ai/backdrops/source', MVP / 'assets/ai/backdrops'
keys = []
for f in sorted(SRC.glob('*.png')):
    im = Image.open(f).convert('RGB').resize((1536, 768), Image.LANCZOS)
    ring = Image.new('RGB', (3072, 768))
    ring.paste(im, (0, 0)); ring.paste(ImageOps.mirror(im), (1536, 0))
    ring.save(OUT / f'{f.stem}.webp', quality=82, method=6)
    keys.append(f.stem)
(OUT / 'index.json').write_text(json.dumps(keys) + '\n')
print('backdrops:', keys)
