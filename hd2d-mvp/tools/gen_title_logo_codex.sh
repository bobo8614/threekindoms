#!/bin/zsh
# The title's 三国志 lettering on its leafy plate, painted through the Codex CLI's imagegen (ChatGPT login, no API key).
# Reference 1 is the three characters set in heavy brush lettering (Weibei, below), so the painting keeps every stroke;
# reference 2 is the title band, for the pixel look. tools/build_title_logo.py keys out the flat magenta ground and
# publishes assets/ai/title-logo.webp; src/titlescreen.js draws it in its stone, flash and gold looks.
#   hd2d-mvp/tools/gen_title_logo_codex.sh [take]      output: assets/ai/title-source/logo[-take].png (local)
#   REF_ONLY=ref.png hd2d-mvp/tools/gen_title_logo_codex.sh x      only writes the lettering reference
set -e
MVP=${0:A:h:h}; OUT=$MVP/assets/ai/title-source; mkdir -p $OUT
out=$OUT/logo${1:+-$1}.png
[[ -e $out ]] && { echo "$out exists: pass another take"; exit 1; }
work=$(mktemp -d); trap 'rm -rf $work' EXIT
# Weibei SC Bold (macOS 魏碑, a downloadable system font; LETTER_FONT=Baoli.ttc for 报隶): heavy brush letters with
# swelling strokes, the closest at hand to a hand-lettered 1990s game title. Set a little bolder, widened and packed close.
face=${LETTER_FONT:-WeibeiSC-Bold.otf}
font=$(ls /System/Library/AssetsV2/com_apple_MobileAsset_Font*/*/AssetData/$face 2>/dev/null | head -1)
[[ -n $font ]] || { echo "$face not found: download it in Font Book"; exit 1; }
python3 - $font $work <<'E2'
import sys
from PIL import Image, ImageDraw, ImageFont
f = ImageFont.truetype(sys.argv[1], 300)
ch = []
for c in '三国志':
    g = Image.new('RGBA', (600, 600)); d = ImageDraw.Draw(g)
    d.text((100, 60), c, font=f, fill=(240, 200, 120), stroke_width=3, stroke_fill=(240, 200, 120))
    g = g.crop(g.getbbox()); ch.append(g.resize((round(g.width * 1.18), round(g.height * 0.94))))
mask = Image.new('RGBA', (sum(c.width for c in ch) - 2 * 18 + 80, max(c.height for c in ch) + 80))
x = 40
for c in ch: mask.alpha_composite(c, (x, 40 + (mask.height - 80 - c.height) // 2)); x += c.width - 18
# the dark outline round every stroke, then the letters again on top
a = mask.getchannel('A').point(lambda v: 255 if v > 100 else 0)
from PIL import ImageFilter
ring = a.filter(ImageFilter.MaxFilter(15))
out = Image.new('RGB', mask.size, (128, 128, 128)); out.paste((50, 20, 6), mask=ring); out.paste((240, 200, 120), mask=a)
im = Image.new('RGB', (1536, 1024), (128, 128, 128)); s = min(1300 / out.width, 600 / out.height)
out = out.resize((round(out.width * s), round(out.height * s)), Image.LANCZOS)
im.paste(out, ((1536 - out.width) // 2, (1024 - out.height) // 2)); im.save(f'{sys.argv[2]}/glyphs.png')
E2
[[ -n $REF_ONLY ]] && { cp $work/glyphs.png $REF_ONLY; echo "reference: $REF_ONLY"; exit 0; }  # REF_ONLY=<png>: write the lettering reference only
python3 -c "from PIL import Image;Image.open('$MVP/assets/ai/title-band.webp').convert('RGB').save('$work/band.png')"
spec="The title logo of a strategy game set in Three Kingdoms China: the three Chinese characters 三国志, nothing else.
Lettering (critical): exactly the three characters of reference image 1, in the same order, size and spacing, every stroke present and in place. Keep the inside of 国 (the 玉 inside its box) and every stroke of 志 clearly separated, with open gaps of dark outline between strokes, so each character reads at a glance from far away. Letterforms (critical): follow reference image 1 closely, heavy hand-painted brush lettering: squat, wide characters packed close together, very thick strokes of uneven width that swell and taper, flared rounded stroke ends, the dots of 心 in 志 as fat curved brush drops and its hook a big sweeping curve. Never a clean geometric font, never ruler-straight bars of even width. The brush strokes are carved out of sandstone, with a little chiselled irregularity and a few fine cracks. Each character is warm golden sandstone: light cream-gold top faces, amber and orange sides, lit from the upper left, with a thick dark brown outline around every stroke.
Plate (critical): behind all three characters, one single continuous plate of dense green ivy and vine leaves, joined into one mass that holds the three characters together, reaching about a third of the letter height beyond them on every side, with a lumpy leafy silhouette, small leaves and a few curling tendrils at its edge, darker greens in the gaps and a dark green outline round the whole plate. The plate is behind the letters, never over them.
Style: crisp pixel art like reference image 2: large clear pixels, a limited palette, no blur, no gradients beyond pixel dithering, no glow.
Ground: the whole background is one flat solid magenta #FF00FF, with no shadow, texture or other colour, filling everything around the plate. Landscape canvas 1536x1024, the plate centred and about 85% of the width.
No other text, no Roman numeral, no arrow, no frame, no border."
codex exec --skip-git-repo-check -C $MVP -s workspace-write --add-dir $work -i $work/glyphs.png -i $work/band.png -- "Use the \$imagegen skill with the built-in image_gen tool (not the CLI) to create ONE image from the spec below, then copy the final PNG to $out. Do not modify any other file. Reply with only the saved path.

$spec" < /dev/null > $work/log 2>&1 || cat $work/log
ls -la $out
