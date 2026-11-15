#!/bin/zsh
# Generate one star officer's battle sprite through the Codex CLI's built-in imagegen (GPT image,
# ChatGPT login, no API key). Prompt from sprite_prompts.mjs; the officer's portrait is the identity
# reference and the attacker general sprite is the style anchor.
#   hd2d-mvp/tools/gen_sprites_codex.sh <officer_id>
# The magenta background is keyed out (flood fill from the border), then pixelize.py reduces it to
# 128 px (a little taller than the side sprites, so star officers read as heroes in close-up).
# Output: assets/ai/sprites/officers/<id>.png (game sprite) and sprites/source/officers/<id>.webp.
set -e
MVP=${0:A:h:h}; ROOT=${MVP:h}
id=$1
work=$(mktemp -d); trap 'rm -rf $work' EXIT
portrait=$MVP/assets/ai/portraits/$id.png; [[ -f $portrait ]] || portrait=$MVP/assets/ai/portraits/$id.webp
python3 -c "from PIL import Image;Image.open('$portrait').convert('RGB').save('$work/portrait.png')"
python3 -c "from PIL import Image;Image.open('$MVP/assets/ai/sprites/source/attacker-general.webp').convert('RGBA').save('$work/style.png')"
raw=$work/raw.png
body=$(node $MVP/tools/sprite_prompts.mjs $id)
task="Use the \$imagegen skill with the built-in image_gen tool (not the CLI) to create ONE image from the spec below, then copy the final PNG to $raw. Do not modify any other file. Reply with only the saved path.

$body"
codex exec --skip-git-repo-check -C $ROOT -s workspace-write --add-dir $work -i $work/portrait.png -i $work/style.png -- "$task" < /dev/null
mkdir -p $MVP/assets/ai/sprites/source/officers $MVP/assets/ai/sprites/officers
python3 - $raw $MVP/assets/ai/sprites/source/officers/$id.webp $work/keyed.png <<'EOF'
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
# Despill: pink fringe left on the outline turns into the neighbouring dark outline colour.
for y in range(h):
    for x in range(w):
        r, g, b, a = px[x, y]
        if a and r > 120 and b > 120 and g < r - 60 and g < b - 60: px[x, y] = (40, 24, 32, 255)
bbox = im.getchannel('A').getbbox(); im = im.crop(bbox)
im.save(keyed)
s = 512 / im.height; im.resize((round(im.width * s), 512), Image.LANCZOS).save(webp, quality=90)
EOF
python3 $MVP/tools/pixelize.py $work/keyed.png $MVP/assets/ai/sprites/officers/$id.png --height 128 --colors 48
# index.json lists the ids the game may load (src/app.js loadOfficerSprites).
python3 -c "import os,json;d='$MVP/assets/ai/sprites/officers';json.dump(sorted(int(f[:-4]) for f in os.listdir(d) if f.endswith('.png')),open(d+'/index.json','w'))"
