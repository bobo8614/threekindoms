"""Key the magenta background out of a generated troop sprite and fit it on the 512×341 canvas the
original troop sprites (sprites/source/<side>-<kind>.webp) use.
  python3 hd2d-mvp/tools/key_troop_sprite.py raw.png out.webp keyed.png
"""
import sys
from collections import deque
from PIL import Image

src, webp, keyed = sys.argv[1:]
im = Image.open(src).convert('RGBA'); w, h = im.size; px = im.load()
def bg(p): r, g, b, _ = p; return r > 150 and b > 150 and g < 120 and abs(r - b) < 90
seen = bytearray(w * h); q = deque()
for x in range(w): q.extend([(x, 0), (x, h - 1)])
for y in range(h): q.extend([(0, y), (w - 1, y)])
while q:
    x, y = q.popleft()
    if x < 0 or y < 0 or x >= w or y >= h or seen[y * w + x] or not bg(px[x, y]): continue
    seen[y * w + x] = 1; px[x, y] = (0, 0, 0, 0)
    q.extend([(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)])
# Enclosed magenta holes (between legs, under a spear) and pink fringe on the outline.
for y in range(h):
    for x in range(w):
        r, g, b, a = px[x, y]
        if not a: continue
        if r > 200 and b > 200 and g < 80: px[x, y] = (0, 0, 0, 0)
        elif r > 120 and b > 120 and g < r - 60 and g < b - 60: px[x, y] = (40, 24, 32, 255)
im = im.crop(im.getchannel('A').getbbox())
im.save(keyed)
W, H, M = 512, 341, 16
s = min((W - 2 * M) / im.width, (H - 2 * M) / im.height)
fit = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
out.alpha_composite(fit, ((W - fit.width) // 2, H - M - fit.height))
out.save(webp, quality=90)
