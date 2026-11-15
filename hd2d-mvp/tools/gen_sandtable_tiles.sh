#!/bin/zsh
# Ground tiles for the 战略地图 sand table (tools/blender_sandtable.py): top-down painted surfaces in the B mock-up's
# style, laid in world space and mixed by the game's vegetation mask — meadow, patchwork fields, forest floor, dry
# loess earth, and cliff rock for the steep faces. Tripo image-to-image (chat_image_2, 10 credits each) from a crop
# of the mock-up; each is made tileable afterwards (blender_sandtable.py, mirrored-offset blend).
#   hd2d-mvp/tools/gen_sandtable_tiles.sh [name ...]
MVP=${0:A:h:h}; cd $MVP
OUT=assets/ai/sandtable/source/tiles; CROPS=assets/ai/sandtable/source/refs/crops; mkdir -p $OUT
typeset -A WHAT CROP
WHAT[meadow]='a grassy meadow on a sculpted sand-table model: short painted grass in warm olive and fresh greens with small lighter tufts, a few tiny shrubs and wildflowers, very subtle clay relief'
CROP[meadow]=cities
WHAT[fields]='a patchwork of small farm fields on a sculpted sand-table model: irregular plots of green young rice, yellow ripe grain and brown ploughed earth with painted furrows, separated by thin raised earth bunds and a few tiny trees along them'
CROP[fields]=cities
WHAT[forest]='a dense forest floor seen from above on a sculpted sand-table model: dark green moss and fallen leaves with many small round painted tree crowns packed together, deep shadow between them'
CROP[forest]=south
WHAT[loess]='dry loess and earth on a sculpted sand-table model: ochre and tan clay ground with eroded painted gullies, sparse dry grass and scattered pebbles'
CROP[loess]=peaks
WHAT[rock]='a cliff face on a sculpted sand-table model seen straight on: grey-brown stratified rock with horizontal bedding planes and vertical joints, a few ledges with moss and tiny shrubs, carved and painted clay'
CROP[rock]=peaks
WHAT[frame]='the carved top of a war-room table frame: a straight band of ornate Chinese woodcarving running left to right, gold-leaf cloud scrolls and key-fret borders in relief on dark red-brown lacquered wood, worn gilt catching warm lamplight'
CROP[frame]=frame
gen() {
  local n=$1 out=$OUT/$1.png
  [[ -f $out ]] && { echo "keep $n"; return; }
  local spec="Using exactly the art style, materials, palette and painted detail of the sand table in image[1]: a seamless
tileable square texture of $WHAT[$n], filling the whole picture edge to edge, seen straight from above (orthographic,
no perspective), even soft light with no cast shadows across it, no objects cut by the edges in a way that breaks
tiling, no buildings, no water, no text, no border. Square picture."
  for try in 1 2 3 4 5 6 7 8 9 10; do
    rm -rf $OUT/i2i/$n
    tripo generate image-to-image $CROPS/$CROP[$n].jpg --model chat_image_2 --prompt "$spec" -o $OUT/i2i/$n --yes --no-open --json > $OUT/$n.log 2>&1
    grep -q 'concurrency limit\|timed out' $OUT/$n.log || break
    sleep 60
  done
  local img=$(find $OUT/i2i/$n -name generated_image.png | head -1)
  [[ -n $img ]] && cp $img $out && echo "done $n" || echo "FAILED $n"
}
for n in ${@:-${(k)WHAT}}; do gen $n; done
