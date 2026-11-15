#!/bin/zsh
# The 战略地图 sand table's set pieces as 3D models: each reference picture from tools/gen_sandtable_refs.sh goes
# through Tripo image-to-model (the tripo CLI, its key in ~/.tripo; v3.1 with detailed texture, about 40 credits
# each) and lands in assets/ai/sandtable/source/models/<name>.glb. Models already there are kept.
#   hd2d-mvp/tools/gen_sandtable_models.sh [name ...]     (default: every reference picture; 3 at a time)
zmodload zsh/parameter
MVP=${0:A:h:h}; cd $MVP
REFS=assets/ai/sandtable/source/refs; OUT=assets/ai/sandtable/source/models; mkdir -p $OUT
one() {
  local n=$1 dir=$OUT/$1.tripo
  [[ -f $OUT/$n.glb ]] && { echo "keep $n"; return; }
  # A 1536 px JPEG goes up: the 2048 px PNGs (5–6 MB) timed out uploading on 2026-10-30.
  mkdir -p $REFS/up; python3 -c "from PIL import Image; Image.open('$REFS/$n.png').convert('RGB').resize((1536, 1536)).save('$REFS/up/$n.jpg', quality=92)"
  # Tripo shares one concurrency pool between images and models: when it is full, wait and try again.
  for try in 1 2 3 4 5 6 7 8 9 10; do
    tripo make $REFS/up/$n.jpg --model v3.1 -p texture=true -p pbr=false -p texture_quality=detailed \
      --name sand-$n -o $dir --yes --no-open --json > $OUT/$n.log 2>&1
    grep -q 'concurrency limit\|timed out' $OUT/$n.log || break
    sleep 60
  done
  local glb=$(find $dir -name '*.glb' | head -1)
  [[ -n $glb ]] && cp $glb $OUT/$n.glb && echo "done $n" || echo "FAILED $n"
}
names=(${@:-${${(f)"$(ls $REFS/*.png)"}:t:r}})
for n in $names; do
  while (( ${#${(M)jobstates:#running*}} >= 3 )); do sleep 5; done
  one $n &
done
wait
tripo balance
