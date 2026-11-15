#!/bin/zsh
# City wall set for the 单挑 scene under a besieged city (src/duelview.js), painted with GPT image through the
# Codex CLI's imagegen (ChatGPT login, no API key). Front elevations on a flat magenta key, cut out and
# reduced by tools/build_citygate.py:
#   gate         the gate tower over its gateway, with a stretch of wall to both edges
#   wall         a straight stretch of the same wall, tileable left/right, to run the wall out past the frame
#   gate-snow / wall-snow   the same in winter, snow on roofs, merlons and ledges
#   hd2d-mvp/tools/gen_citygate_codex.sh [key ...]
# Output: assets/ai/citygate/source/<key>.png (full size, local only).
set -e
MVP=${0:A:h:h}; ROOT=${MVP:h}; OUT=$MVP/assets/ai/citygate/source; mkdir -p $OUT
work=$(mktemp -d); trap 'rm -rf $work' EXIT
python3 -c "from PIL import Image;Image.open('$MVP/assets/ai/title.webp').convert('RGB').save('$work/title.png')"

STYLE='Style (critical): match reference image 1 (the approved key art of the remake): HD-2D look as in Octopath Traveler / Triangle Strategy — detailed 16-bit pixel-art textures with crisp pixel clusters and a clean dark outline, real-time-looking soft sunlight from the upper LEFT, gentle ambient occlusion in the recesses, rich but natural colours, bright and readable, not dark. Not photographic, not anime cel. No text, no characters, no soldiers, no animals, no UI, no border, no frame, no vignette.'
KEY='Background (critical): everything that is not the structure (the sky above it and around it) is ONE perfectly flat solid magenta (#FF00FF) — no gradient, no clouds, no haze, no ground, no shadow on the background. Do not use magenta or pink anywhere on the structure itself.'
ERA='An Eastern Han dynasty (c. 190 AD) Chinese city wall: massive battered rammed-earth core faced with weathered grey-brown fired brick, a crenellated parapet (rectangular merlons with gaps) along the top, a dark timber walkway rail behind the merlons.'

typeset -A SPEC
SPEC[gate]="Front elevation of the main city gate of a walled Han city, seen straight on from ground level at a horseman's eye height a little way off, so the facade is square to the viewer with only a hint of perspective (no vanishing to the sides).
$ERA
Composition (critical): landscape 3:2 canvas (1536x1024). In the CENTRE stands the gate: a deep arched (or square-lintel timber) gateway at the bottom with heavy closed double doors of dark iron-studded wood, a slightly projecting brick bastion around it, and on top a two-storey timber gate tower (城楼) with red lacquered columns, white plaster and lattice panels, dark grey glazed tile hip-and-gable roofs with upturned eaves and a ridge with small ornaments. To the left and right, the plain crenellated city wall runs out straight and level to BOTH edges of the canvas and is cut off cleanly by the edges at full height. The wall occupies the bottom ~42% of the canvas height; the gate tower roof reaches to about 8% from the top. The bottom edge of the canvas is the foot of the wall, a straight horizontal line across the whole width: a little worn earth berm at the foot, cut straight by the bottom edge. A few short weathered pennant poles on the merlons, no flags (flags are added separately).
Season: neutral dry weather, no snow, no vegetation except a little moss and a few small weeds in the brick joints."
SPEC[wall]="Front elevation of a straight stretch of the SAME city wall as reference image 2 (identical brick, colour, merlon shape and size, parapet height, outline weight and pixel-art style), seen straight on with no perspective.
$ERA
Composition (critical): landscape 3:2 canvas (1536x1024). The wall runs straight and level across the WHOLE width and is horizontally TILEABLE: its left and right edges continue seamlessly into each other (same brick course heights, the merlon rhythm loops). No gate, no tower, no buttress at either edge; at most one low brick buttress in the middle. The wall top (merlons) at exactly the same height as the wall in reference image 2 relative to the canvas: the wall occupies the bottom ~42% of the canvas height and its foot is the straight bottom edge of the canvas.
Season: neutral dry weather, no snow."
SPEC[gate-snow]="The SAME gate as reference image 2 — identical structure, outline, layout, size and position on the canvas, pixel for pixel where nothing changes — but in deep winter: a layer of fresh snow on every roof slope and eave, on the merlons, on ledges and the top of the bastion, a little snow drifted at the foot of the wall, icicles on a few eaves, the light cooler and paler. Landscape 3:2 canvas (1536x1024)."
SPEC[wall-snow]="The SAME wall stretch as reference image 2 — identical structure, outline, layout, size and position on the canvas, still horizontally tileable left/right — but in deep winter: fresh snow capping every merlon and the parapet, snow on ledges, a little drifted at the foot, cooler paler light. Landscape 3:2 canvas (1536x1024)."

for key in ${@:-gate wall gate-snow wall-snow}; do
  refs=(-i $work/title.png)
  case $key in
    wall) python3 -c "from PIL import Image;Image.open('$OUT/gate.png').convert('RGB').save('$work/ref.png')"; refs+=(-i $work/ref.png) ;;
    *-snow) python3 -c "from PIL import Image;Image.open('$OUT/${key%-snow}.png').convert('RGB').save('$work/ref.png')"; refs+=(-i $work/ref.png) ;;
  esac
  spec="Painted set piece for the duel scene of an HD-2D remake of the 1992 Famicom game Sangokushi II (Eastern Han China, c. 190 AD): it stands behind two mounted generals fighting in front of a besieged city.
${SPEC[$key]}
$KEY
$STYLE"
  codex exec --skip-git-repo-check -C $ROOT -s workspace-write --add-dir $work $refs -- "Use the \$imagegen skill with the built-in image_gen tool (not the CLI) to create ONE image from the spec below, then copy the final PNG to $OUT/$key.png. Do not modify any other file. Reply with only the saved path.

$spec" < /dev/null > $work/$key.log 2>&1 || cat $work/$key.log
  ls -la $OUT/$key.png
done
