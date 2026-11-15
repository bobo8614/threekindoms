#!/bin/zsh
# Batch-generate the 单挑 action strips for every star officer with a battle sprite: sheet A, then sheet B
# (A as its reference), slice, check — N officers in parallel. An officer is skipped only when both source
# sheets, the strip PNG and JSON are all there and the strip passes check_duel_strips.py; a sheet already on
# disk is reused, so the script can be re-run to resume. Delete a source sheet to have it drawn again.
# Exits 1 if any officer failed (drawing, slicing or the check), listing which.
#   hd2d-mvp/tools/gen_all_duel_frames.sh [parallel=3] [id ...]
zmodload zsh/parameter
MVP=${0:A:h:h}
par=${1:-3}; shift 2>/dev/null
src=$MVP/assets/ai/sprites/source/duel; duel=$MVP/assets/ai/sprites/duel
ids=(${@:-${=$(node -e "process.stdout.write(require('$MVP/assets/ai/sprites/officers/index.json').join(' '))")}})
done_ok() { [[ -f $src/$1.png && -f $src/$1-b.png && -f $duel/$1.png && -f $duel/$1.json ]] && python3 $MVP/tools/check_duel_strips.py $1 >/dev/null; }
todo=(); for id in $ids; do done_ok $id || todo+=$id; done
echo "${#todo} strips to make"
res=$(mktemp -d); trap 'rm -rf $res' EXIT
one() {
  local id=$1
  [[ -f $src/$id.png ]] || $MVP/tools/gen_duel_frames_codex.sh $id >/dev/null 2>&1 && [[ -f $src/$id.png ]] || { echo "fail $id sheet A" | tee $res/$id; return 1; }
  [[ -f $src/$id-b.png ]] || $MVP/tools/gen_duel_frames_codex.sh $id --b >/dev/null 2>&1 && [[ -f $src/$id-b.png ]] || { echo "fail $id sheet B" | tee $res/$id; return 1; }
  python3 $MVP/tools/slice_duel_frames.py $id >/dev/null || { echo "fail $id slice" | tee $res/$id; return 1; }
  python3 $MVP/tools/check_duel_strips.py $id || { echo "fail $id check" > $res/$id; return 1; }
}
for id in $todo; do
  while (( ${#jobstates} >= par )); do sleep 2; done
  one $id &
done
wait
# The slicer rewrites duel/index.json per officer; rebuild it once more in case parallel runs raced.
python3 -c "import json,os;d='$duel';json.dump(sorted(f[:-5] for f in os.listdir(d) if f.endswith('.json') and f!='index.json' and not f.endswith(('-turn.json','-wheel.json'))),open(d+'/index.json','w'))"
failed=($res/*(N:t))
(( ${#failed} )) && { echo "${#failed} failed: $failed"; exit 1; }
exit 0
