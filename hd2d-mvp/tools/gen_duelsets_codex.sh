#!/bin/zsh
# The far side of the field for the 单挑 scene on open ground (src/duelview.js), one per 白兵 terrain, painted
# with GPT image through the Codex CLI's imagegen (ChatGPT login, no API key). Each is a horizontally tileable
# front elevation on a flat magenta key, cut out and reduced by tools/build_duelsets.py. Painted in early
# summer green: the duel view recolours foliage for the month (seasons.js), as it does the trees and grass.
#   plain forest river mount sand          (city walls: tools/gen_citygate_codex.sh)
#   <key>-snow   the same strip in a northern winter, painted from the green one (the shader's snow would only
#                dither over it); the view uses it untinted where snow lies.
#   hd2d-mvp/tools/gen_duelsets_codex.sh [key ...]
# Output: assets/ai/duelsets/source/<key>.png (full size, local only).
set -e
MVP=${0:A:h:h}; ROOT=${MVP:h}; OUT=$MVP/assets/ai/duelsets/source; mkdir -p $OUT
work=$(mktemp -d); trap 'rm -rf $work' EXIT
python3 -c "from PIL import Image;Image.open('$MVP/assets/ai/title.webp').convert('RGB').save('$work/title.png')"
# The approved city wall sheet sets the scale, viewpoint and finish the new sets have to sit beside.
python3 -c "from PIL import Image;Image.open('$MVP/assets/ai/citygate/wall.webp').convert('RGB').save('$work/wall.png')"

STYLE='Style (critical): match reference image 1 (the approved key art of the remake) and the finish of reference image 2 (an approved set piece from the same scene: same pixel density, outline weight and light): HD-2D look as in Octopath Traveler / Triangle Strategy — detailed 16-bit pixel-art textures with crisp pixel clusters and a clean dark outline, soft sunlight from the upper LEFT, gentle ambient occlusion, rich but natural colours, bright and readable, not dark. Foliage in fresh early-summer greens. Not photographic, not anime cel. No text, no people, no soldiers, no animals, no UI, no border, no frame, no vignette.'
KEY='Background (critical): everything that is not the scenery itself (the sky above and between the tree tops / peaks) is ONE perfectly flat solid magenta (#FF00FF) — no gradient, no clouds, no haze, no distant mountains, no shadow on the background. Do not use magenta or pink anywhere on the scenery (no pink blossom).'
TILE='Composition (critical): landscape 3:2 canvas (1536x1024), a front elevation seen straight on from a horseman'"'"'s eye height, with no vanishing perspective to the sides. It is a horizontally TILEABLE strip: the left and right edges continue seamlessly into each other (the ground line, the tree line or ridge line and the colours loop), no single dominant feature cut by either edge. The bottom edge of the canvas is a straight horizontal ground line across the whole width: the scenery stands on it.'

typeset -A SPEC
SPEC[plain]="The far edge of an open farming plain of Eastern Han China (c. 190 AD), where a mounted duel is fought: a low grassy earthen field bank along the bottom with a few wildflowers, behind it a line of tall poplars and round willows, and among the trees a small farming hamlet of rammed-earth houses with thatched roofs and one grey-tiled roof, a haystack, a wooden well sweep. The scenery fills the bottom ~45% of the canvas; the tallest poplar tops reach about 40% from the top."
SPEC[forest]="The edge of a deep old forest in Eastern Han China, where a mounted duel is fought in a clearing: a dense wall of tall pines, cypresses and broadleaf trees with trunks and dark shaded depths between them, ferns, bracken and low shrubs along the foot. The forest fills the bottom ~70% of the canvas; the canopy line undulates, its highest crowns about 15% from the top."
SPEC[river]="The far bank of a broad river in Eastern Han China, seen across the water: along the bottom a waterline with reeds and rushes standing in the shallows, a low sandy bank above it, weeping willows and a few poplars, a small wooden jetty with a moored flat-bottomed wooden boat. The bottom edge of the canvas is the waterline (water itself is NOT painted, it is added in 3D in front). The scenery fills the bottom ~45% of the canvas; the tallest trees reach about 45% from the top."
SPEC[mount]="A rugged mountain pass in Eastern Han China, where a mounted duel is fought on a level stretch of the pass: behind it rise steep layered grey-brown rock cliffs and crags, gnarled pines growing from clefts and ledges, a narrow stone-stepped path climbing across the face, scree and boulders along the foot. The cliffs fill the bottom ~75% of the canvas; the highest crags about 10% from the top, the ridge line jagged but looping seamlessly at the edges."
SPEC[sand]="An arid loess wasteland on the north-western frontier of Eastern Han China, where a mounted duel is fought: low wind-carved yellow loess bluffs and soft dunes along the back, dry scrub, tamarisk and camel-thorn tufts, a couple of bare dead trees, and a weathered ruined rammed-earth beacon tower (烽燧) standing on one bluff off-centre. The scenery fills the bottom ~40% of the canvas; the beacon tower top about 45% from the top."

# Winter twins: the same layout as the green sheet (reference image 2), with the snow placed per scene.
typeset -A SNOWED
SNOWED[plain]='fresh snow lying on the ground, the field bank, the thatched and tiled roofs, the haystack and the tops of bushes; poplars and willows bare (dark grey-brown branches and long bare twigs, no leaves)'
SNOWED[forest]='fresh snow on the forest floor, rocks and the tops of bushes; broadleaf trees bare (dark grey-brown branches and twigs, no leaves), pines and cypresses staying dark green with snow on their boughs'
SNOWED[river]='fresh snow on the bank, the jetty planks, the boat'"'"'s cover and the tops of bushes; willows and poplars bare (dark grey-brown branches and long bare hanging twigs, no leaves); reeds dry and pale straw-coloured. The bottom edge stays the waterline: do NOT paint water or ice below it'
SNOWED[mount]='fresh snow lying on ledges, crag tops, the stepped path, boulders and the scree at the foot; the pines staying dark green with snow on their boughs; any broadleaf shrubs bare'
SNOWED[sand]='a thin layer of fresh snow on the bluff tops, the dune crests, the beacon tower'"'"'s top and ledges, drifted in the hollows, the yellow loess still showing on the steep faces; scrub and tamarisk bare and pale'
snow_spec() { print -r -- "The SAME scenery as reference image 2 — identical layout, silhouettes, every tree, rock, building and object in the same place and size on the canvas, still horizontally tileable with the same edges — but in deep winter in North China: ${SNOWED[$1]}; dry pale straw-coloured grass poking through, the light cooler and paler. Same magenta background, same canvas, same style." }

for key in ${@:-plain forest river mount sand}; do
  ref=$work/wall.png style=$STYLE
  if [[ $key == *-snow ]]; then
    python3 -c "from PIL import Image;Image.open('$OUT/${key%-snow}.png').convert('RGB').save('$work/base.png')"; ref=$work/base.png
    SPEC[$key]=$(snow_spec ${key%-snow}) style=${STYLE/ Foliage in fresh early-summer greens./}
  fi
  spec="Painted set piece for the duel scene of an HD-2D remake of the 1992 Famicom game Sangokushi II: it stands behind two mounted generals fighting, across the battlefield.
${SPEC[$key]}
$TILE
$KEY
$style"
  codex exec --skip-git-repo-check -C $ROOT -s workspace-write --add-dir $work -i $work/title.png -i $ref -- "Use the \$imagegen skill with the built-in image_gen tool (not the CLI) to create ONE image from the spec below, then copy the final PNG to $OUT/$key.png. Do not modify any other file. Reply with only the saved path.

$spec" < /dev/null > $work/$key.log 2>&1 || cat $work/$key.log
  ls -la $OUT/$key.png
done
