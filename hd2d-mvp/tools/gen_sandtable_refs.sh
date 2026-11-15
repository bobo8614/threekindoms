#!/bin/zsh
# Reference pictures for the 战略地图 sand table's set pieces (direction B, docs/review-assets/2026-10-30/
# strategy-style/B.png): one object each in that mock-up's style, alone on a plain background from about 45 degrees
# above, for image-to-3D (tools/gen_sandtable_models.sh, Tripo). The capital (made first, with Codex imagegen from the
# B mock-up) sets the look; the rest are Tripo image-to-image (chat_image_2, 10 credits each) from it and a crop of
# the mock-up — steadier than Codex here, whose connection kept dropping on 2026-10-30.
#   hd2d-mvp/tools/gen_sandtable_refs.sh [name ...]     (default: all; 3 at a time; existing pictures are kept)
zmodload zsh/parameter
MVP=${0:A:h:h}; cd $MVP
OUT=assets/ai/sandtable/source/refs; B=docs/review-assets/2026-10-30/strategy-style/B.png
typeset -A WHAT CROP
WHAT[city-capital]='a large walled imperial capital of the Han dynasty: a wide square double wall of pale rammed earth and grey stone with crenellations, a two-tier gate tower with dark tiled hip roofs over the gate in the middle of each side, square corner towers, inside a big palace hall with a double-eaved dark tiled hip roof on a stone platform, and dense rows of small tiled houses and courtyards'
CROP[city-capital]=capital
WHAT[city-major]='a walled provincial city of the Han dynasty: a square wall of pale rammed earth and grey stone with crenellations, one big two-tier gate tower with dark tiled hip roofs over the front gate, small corner towers, a main hall with a dark tiled hip roof inside and several smaller tiled houses'
CROP[city-major]=cities
WHAT[city-county]='a small walled county town of the Han dynasty: a low square wall of pale rammed earth and grey stone with crenellations and one gate with a small tiled roof, inside one hall with a dark tiled hip roof and two or three small houses'
CROP[city-county]=cities
WHAT[pass]='a Chinese mountain pass fortress: a thick crenellated stone wall running straight between two steep stratified rock cliffs, a two-tier gate tower with dark tiled hip roofs over the gate in the middle, a few small barracks with tiled roofs behind the wall'
CROP[pass]=peaks
WHAT[hamlet]='a tiny farming hamlet: three small Chinese farmhouses with dark tiled and thatched roofs, a short wooden fence, a haystack, on a small patch of trodden earth'
CROP[hamlet]=cities
WHAT[tree-broad]='one broadleaf tree with a round dense crown made of clumps of leaves, lit tops and darker undersides, short brown trunk, like a hand-made scale-model tree'
CROP[tree-broad]=south
WHAT[tree-pine]='one compact Chinese pine tree as a hand-made scale-model tree: a dense cone of three or four tiered dark green needle clumps close together, short straight reddish trunk, no thin bare branches'
CROP[tree-pine]=peaks
WHAT[grove]='a small grove of six scale-model trees of different heights standing close together (broadleaf and pine), crowns touching, on no base'
CROP[grove]=south
WHAT[crag]='one tall craggy mountain peak sculpted in clay and painted: steep stratified grey-brown rock faces with horizontal bedding, a few ledges with small green shrubs and pines, a pointed summit'
CROP[crag]=peaks
WHAT[ridge]='a long mountain ridge sculpted in clay and painted, about three times as long as it is wide: a chain of five jagged grey-brown rock peaks of different heights joined by a sharp crest, steep stratified faces with horizontal bedding, small pines and green scrub on the lower slopes and ledges, like the mountain ranges of a Chinese landscape painting'
CROP[ridge]=peaks
WHAT[massif]='a broad mountain massif sculpted in clay and painted, about twice as long as it is wide: great blocks of stratified grey-brown rock with sheer cliff faces cut by vertical joints and horizontal bedding, stepped flat-topped shoulders rising to two or three jagged summits, scree and boulders round its foot, a few small pines on the ledges, bare of snow'
CROP[massif]=peaks
WHAT[hill]='a low rounded hill sculpted in clay and painted: a small crown of grey stratified rock on top, its slopes covered in dense small round trees in several greens and a few autumn ones, a little scree at its foot'
CROP[hill]=south
WHAT[crag-low]='a low ridge of three rounded rocky hills sculpted in clay and painted: grey-brown stratified rock with green moss and small shrubs on top'
CROP[crag-low]=south
WHAT[boat]='one small Chinese wooden junk sailing boat with two brown battened sails, painted hull'
CROP[boat]=coast
WHAT[bridge]='one short arched wooden plank bridge with simple railings, for crossing a small river'
CROP[bridge]=cities

gen() {
  local n=$1 out=$OUT/$1.png
  [[ -f $out ]] && { echo "keep $n"; return; }
  local spec="Using exactly the art style, materials, palette, level of detail and warm lamplight of image[1] (a hand-made
painted scale model for a war-room sand table of China) and of the sand table in image[2]: draw $WHAT[$n].
Single isolated object for image-to-3D conversion, whole and centred, filling most of the picture, the same
three-quarter view from about 45 degrees above as image[1], plain flat light grey background. No ground plane, no
base, no cast shadow, no other objects, no flags or banners, no text, no frame. Square picture."
  rm -rf $OUT/i2i/$n
  # Small JPEG copies of the style pictures go up (full-size PNGs timed out uploading).
  [[ -f $OUT/crops/style-capital.jpg ]] || python3 -c "
from PIL import Image; import glob
Image.open('$OUT/city-capital.png').convert('RGB').resize((1024, 1024)).save('$OUT/crops/style-capital.jpg', quality=90)
for f in glob.glob('$OUT/crops/*.png'): Image.open(f).convert('RGB').save(f[:-4] + '.jpg', quality=90)"
  # Tripo shares one concurrency pool between images and models: when it is full, wait and try again.
  for try in 1 2 3 4 5 6 7 8 9 10; do
    tripo generate image-to-image $OUT/crops/style-capital.jpg $OUT/crops/$CROP[$n].jpg --model chat_image_2 --prompt "$spec" \
      -o $OUT/i2i/$n --yes --no-open --json > $OUT/$n.log 2>&1
    grep -q 'concurrency limit\|timed out' $OUT/$n.log || break
    sleep 60
  done
  local img=$(find $OUT/i2i/$n -name generated_image.png | head -1)
  [[ -n $img ]] && cp $img $out && echo "done $n" || echo "FAILED $n"
}
names=(${@:-${(k)WHAT}})
for n in $names; do
  while (( ${#${(M)jobstates:#running*}} >= 4 )); do sleep 5; done
  gen $n &
done
wait
