#!/bin/zsh
# The ending's full-screen paintings, through the Codex CLI's imagegen (ChatGPT login, no API key), one at a time.
# src/ending.js shows them full screen with its text over the lower part, so that part stays quiet, and the sides may be
# cropped on a wide window. The ruler can be anyone, so no figure has a readable face.
#   hd2d-mvp/tools/gen_ending_codex.sh [key ...]     keys: dusk dawn hall fallen
# Output: assets/ai/ending/source/<key>.png (full size, local); tools/build_ending.py publishes webp.
set -e
MVP=${0:A:h:h}; OUT=$MVP/assets/ai/ending/source; mkdir -p $OUT
work=$(mktemp -d); trap 'rm -rf $work' EXIT
python3 -c "from PIL import Image;Image.open('$MVP/assets/ai/title.webp').convert('RGB').save('$work/title.png');Image.open('$MVP/assets/ai/ending.webp').convert('RGB').save('$work/ending.png')"
typeset -A SCENE
SCENE[dusk]='The last evening of a long war, seen from a low hillside. A long column of tired soldiers walks home along a dirt road toward a walled Han-dynasty town in the middle distance, spears carried low on their shoulders, wounded helped along by comrades, a few horses led by the reins, all seen small and from behind. In the left foreground a broken spear and a torn, faded banner lie in trampled autumn grass. Thin threads of smoke rise from a far battlefield and from the first kitchen fires of the town. Cool violet shadows, a huge soft amber dusk sky with long clouds. The mood is quiet relief and exhaustion, not triumph. The bottom quarter of the picture is calm dark grass and road.'
SCENE[dawn]='The first dawn of peace. A lone rider on a horse stands at the crest of a high grassy ridge, placed a little right of centre and small in the frame, a pure dark silhouette with a long cloak moving in the wind and no face or insignia visible. Far below, a great river winds through misty valleys and scattered villages all the way to the horizon, the whole realm laid out, catching the first light. Enormous sky going from deep blue overhead through rose to pale gold where the sun has just cleared the far mountains, with light rays through the mist. No army, no raised weapons: one person looking at what was won. The bottom quarter of the picture is the dark shadowed slope of the ridge.'
SCENE[hall]='Inside a vast Eastern Han palace hall at the end of an audience, seen from the floor near the great doors looking up the length of the hall. Massive red lacquered timber columns recede in two rows, bronze braziers burn along them, tall pale silk hangings stir, warm late-afternoon sunlight falls in long shafts through high lattice windows onto dark polished stone. Far away at the top of a stepped dais stands a low wide throne under a canopy, with one tiny robed figure seated there, too distant to have a face, and two lines of tiny court officials in dark robes along the sides. No dragons, no gold excess: solemn, spacious, warm. The bottom third of the picture is plain dark polished floor reflecting the light.'
SCENE[fallen]='The end of a defeated house. A burnt-out hilltop fortress gate on a rainy grey-blue evening: charred timber, a collapsed watchtower, wet stone. In the foreground a single tattered banner on a leaning pole, its cloth rain-soaked and colourless, and an abandoned helmet on the wet ground beside it. Beyond the ruined gate, lines of distant enemy torches move away along a valley road, very small. Rain falls softly, low cloud lies on the hills, a thin cold band of light remains at the horizon. Sorrowful and still, no bodies, no blood, no people close to the viewer. The bottom quarter of the picture is dark wet ground.'
keys=("$@"); (( $#keys )) || keys=(dusk dawn hall fallen)
for key in $keys; do
  [[ -e $OUT/$key.png ]] && { echo "$OUT/$key.png exists: skipped"; continue; }
  spec="A full-screen painted scene for a strategy game set in Eastern Han China, about 190 AD.
Scene: ${SCENE[$key]}
Composition: landscape 3:2 canvas (1536x1024). A deep diorama view with clear foreground, middle ground and far distance. Keep the main subject within the central 80% of the width. Nothing important in the bottom quarter, where captions will be set.
Style (critical): match reference images 1 and 2, the approved art of this game: an HD-2D look with detailed pixel-art textures and crisp pixel clusters, real-time-looking light, soft atmospheric haze and gentle depth of field at the near and far edges. Rich natural colours, readable. Not photographic, not anime cel, not toy-like. Eastern Han architecture and dress only.
No text, no writing on banners, no UI, no border, no frame, no vignette."
  codex exec --skip-git-repo-check -C $MVP -s workspace-write --add-dir $work -i $work/title.png -i $work/ending.png -- "Use the \$imagegen skill with the built-in image_gen tool (not the CLI) to create ONE image from the spec below, then copy the final PNG to $OUT/$key.png. Do not modify any other file. Reply with only the saved path.

$spec" < /dev/null > $work/$key.log 2>&1 || cat $work/$key.log
  ls -la $OUT/$key.png
done
