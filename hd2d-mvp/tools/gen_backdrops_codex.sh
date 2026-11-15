#!/bin/zsh
# Seasonal horizon panoramas for the battle scenes (war map, 白兵, 单挑), painted with GPT image through
# the Codex CLI's imagegen (ChatGPT login, no API key). The plate wraps a cylinder behind the diorama;
# src/backdrop.js picks one by month and latitude (seasons.js).
#   hd2d-mvp/tools/gen_backdrops_codex.sh [key ...]     keys: spring summer rain autumn winter winter-south
# Output: assets/ai/backdrops/source/<key>.png (full size, local); tools/build_backdrops.py publishes webp.
set -e
MVP=${0:A:h:h}; ROOT=${MVP:h}; OUT=$MVP/assets/ai/backdrops/source; mkdir -p $OUT
work=$(mktemp -d); trap 'rm -rf $work' EXIT
python3 -c "from PIL import Image;Image.open('$MVP/assets/ai/title.webp').convert('RGB').save('$work/title.png')"
typeset -A SEASON
SEASON[spring]='Spring (2nd lunar month): fresh yellow-green rolling hills, groves of pink peach and white plum blossom along the lower slopes, light spring haze over the distant ranges, a soft blue sky with a few small white clouds, clear warm morning light.'
SEASON[summer]='High summer: deep saturated green hills and forests, bright sunlit terraced fields, tall white cumulus clouds towering over the far blue mountains, crisp clear air, strong midday light.'
SEASON[rain]='The plum-rain season (梅雨): lush wet green hills under a low heavy grey-blue overcast, curtains of rain veiling the far ranges, mist lying in the valleys, a pale brighter band of light breaking at the horizon, soft diffuse cool light.'
SEASON[autumn]='Autumn (9th lunar month): hills covered in maple red, amber and gold forests with a few dark green pines, golden harvested fields, a clear deep blue sky with thin high clouds, warm low golden afternoon light with long shadows.'
SEASON[winter]='Deep winter in North China: snow-covered hills and mountains, frosted pines, bare dark tree branches, a pale frozen river, a cold pale blue-white sky, soft cool light, a few snowflakes in the air.'
SEASON[winter-south]='Winter in South China (no snow): muted dark evergreen forested hills, bare grey-brown deciduous trees mixed in, pale dry winter grass on the lower slopes, a cool pale blue sky with soft grey clouds, mild hazy light.'
for key in ${@:-spring summer rain autumn winter winter-south}; do
  spec="Wide horizon panorama for the far background of a battle diorama in an HD-2D remake of the 1992 Famicom game Sangokushi II (Eastern Han China, c. 190 AD). It is wrapped around the scene as a distant backdrop seen beyond the battlefield.
Composition (critical): landscape 3:2 canvas (1536x1024). The sky fills the top ~45%; the horizon of distant mountain ranges and hills in 3-4 layers of aerial perspective (farthest palest) sits in the middle; the bottom ~30% is rolling foreground country seen from a little above — fields, groves, a winding river — with NO buildings larger than a tiny far village, NO people, NO armies, NO roads in the foreground centre. Nothing cut off at the top. The LEFT and RIGHT edges must continue seamlessly into each other (horizontally tileable panorama): no single dominant peak at either edge.
Season and weather: ${SEASON[$key]}
Style (critical): match reference image 1 (the approved key art of the remake): HD-2D look as in Octopath Traveler / Triangle Strategy — detailed 16-bit pixel-art textures with crisp pixel clusters, real-time-looking sunlight, soft atmospheric haze, rich but natural colours, bright and readable, not dark. Not photographic, not anime cel. No text, no UI, no border, no frame, no vignette."
  codex exec --skip-git-repo-check -C $ROOT -s workspace-write --add-dir $work -i $work/title.png -- "Use the \$imagegen skill with the built-in image_gen tool (not the CLI) to create ONE image from the spec below, then copy the final PNG to $OUT/$key.png. Do not modify any other file. Reply with only the saved path.

$spec" < /dev/null > $work/$key.log 2>&1 || cat $work/$key.log
  ls -la $OUT/$key.png
done
