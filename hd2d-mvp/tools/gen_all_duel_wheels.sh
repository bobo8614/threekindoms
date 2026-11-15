#!/bin/zsh
# Batch-generate the 单挑 wheel strips (three-quarter views, duel_frame_prompts.mjs --wheel) for every rider in
# duel/index.json, N in parallel. A sheet already on disk is reused, so the script can be re-run to resume; delete
# a source sheet to have it drawn again. Exits 1 if any rider failed, listing which.
#   hd2d-mvp/tools/gen_all_duel_wheels.sh [parallel=3] [key ...]
zmodload zsh/parameter
MVP=${0:A:h:h}
par=${1:-3}; shift 2>/dev/null
src=$MVP/assets/ai/sprites/source/duel
keys=(${@:-${=$(node -e "process.stdout.write(require('$MVP/assets/ai/sprites/duel/index.json').join(' '))")}})
res=$(mktemp -d); trap 'rm -rf $res' EXIT
one() {
  local k=$1
  [[ -f $src/$k-wheel.png ]] || $MVP/tools/gen_duel_frames_codex.sh $k --wheel >/dev/null 2>&1
  [[ -f $src/$k-wheel.png ]] || { echo "fail $k sheet" | tee $res/$k; return 1; }
  python3 $MVP/tools/slice_troop_frames.py --wheel $k || { echo "fail $k slice" | tee $res/$k; return 1; }
}
for k in $keys; do
  while (( ${#jobstates} >= par )); do sleep 2; done
  one $k &
done
wait
failed=($res/*(N:t))
(( ${#failed} )) && { echo "${#failed} failed: $failed"; exit 1; }
exit 0
