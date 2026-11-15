#!/usr/bin/env python3
"""Publish the ending's paintings (tools/gen_ending_codex.sh) as assets/ai/ending/<key>.webp at their full size.
    python3 hd2d-mvp/tools/build_ending.py
"""
from pathlib import Path
from PIL import Image

MVP = Path(__file__).resolve().parent.parent
SRC, OUT = MVP / 'assets/ai/ending/source', MVP / 'assets/ai/ending'
for f in sorted(SRC.glob('*.png')):
    Image.open(f).convert('RGB').save(OUT / f'{f.stem}.webp', quality=86, method=6)
    print(f.stem, (OUT / f'{f.stem}.webp').stat().st_size // 1024, 'KB')
