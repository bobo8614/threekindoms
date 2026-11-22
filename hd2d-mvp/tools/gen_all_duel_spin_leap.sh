#!/bin/zsh
# Draw the 单挑 spin and leap sheets (gen_duel_frames_codex.sh --spin / --leap) for every rider in duel/index.json,
# ONE AT A TIME (AGENTS.md rule 8), and slice each one (slice_duel_spin.py). 关羽 (38) is the approved sample and is
# skipped. A sheet already on disk that passes check_sheet is reused, so the script can be re-run to resume; delete
# a source sheet to have it drawn again.
#   hd2d-mvp/tools/gen_all_duel_spin_leap.sh [--limit N] [--timeout SEC] [spin|leap|both] [key ...]
# Progress: one line per sheet in docs/review-assets/2026-11-21/duel-classic-demo/gen/progress.tsv
#   (time, n/total, key, kind, class, seconds, ok|reused|timeout|fail|bad-sheet|slice-fail); full Codex output in
#   gen/logs/<key>-<kind>.log. Stops after two failures in a row (rule 10) and exits 1.
# --limit N stops after N newly drawn sheets (to run the queue in short stretches and check each one).
zmodload zsh/datetime
MVP=${0:A:h:h}
limit=0; tmo=420; kinds=(spin leap)
while [[ $1 == --* ]]; do
  case $1 in --limit) limit=$2; shift 2;; --timeout) tmo=$2; shift 2;; *) echo "unknown $1"; exit 2;; esac
done
case $1 in spin) kinds=(spin); shift;; leap) kinds=(leap); shift;; both) shift;; esac
src=$MVP/assets/ai/sprites/source/duel
dir=$MVP/docs/review-assets/2026-11-21/duel-classic-demo/gen; mkdir -p $dir/logs
prog=$dir/progress.tsv
keys=(${@:-${=$(node -e "process.stdout.write(require('$MVP/assets/ai/sprites/duel/index.json').filter(k=>k!=='38').join(' '))")}})
cls() { node --input-type=module -e "import {weaponClass} from '$MVP/tools/duel_frame_prompts.mjs'; import {officer} from '$MVP/tools/portrait_prompts.mjs'; const k='$1'; process.stdout.write(k==='attacker'||k==='defender'?'blade':weaponClass(officer(Number(k))))"; }
# A sheet is usable when it is 1536×1024, every one of the 6 cells holds a figure, and nothing touches the canvas edge.
check_sheet() { python3 - "$1" <<'EOF'
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB'); w, h = im.size
if (w, h) != (1536, 1024): sys.exit(f'size {w}x{h}')
px = im.load(); fg = lambda x, y: not (px[x, y][0] > 140 and px[x, y][2] > 140 and px[x, y][1] < 130)
for i in range(6):
    x0, y0 = (i % 3) * 512, (i // 3) * 512
    if sum(fg(x, y) for y in range(y0 + 40, y0 + 470, 4) for x in range(x0 + 40, x0 + 470, 4)) < 300: sys.exit(f'cell {i + 1} empty')
edge = sum(fg(x, y) for x in range(0, w, 2) for y in (0, 1, h - 2, h - 1)) + sum(fg(x, y) for y in range(0, h, 2) for x in (0, 1, w - 2, w - 1))
if edge > 8: sys.exit(f'{edge} figure px on the canvas edge (cropped)')
EOF
}
# Kill a process and everything it started (codex runs node / imagegen children).
kill_tree() { local p; for p in $(pgrep -P $1); do kill_tree $p; done; kill -TERM $1 2>/dev/null; }
total=$(( ${#keys} * ${#kinds} )); n=0; drawn=0; fails=0
print -r -- "# start $(date '+%F %T') total=$total timeout=${tmo}s limit=$limit" >> $prog
for k in $keys; do
  c=$(cls $k)
  for kind in $kinds; do
    n=$((n + 1)); out=$src/$k-$kind.png; log=$dir/logs/$k-$kind.log
    line() { print -r -- "$(date +%T)"$'\t'"$n/$total"$'\t'"$k"$'\t'"$kind"$'\t'"$c"$'\t'"$1"$'\t'"$2" | tee -a $prog; }
    if [[ -f $out ]] && check_sheet $out >/dev/null 2>&1; then
      [[ -f $MVP/assets/ai/sprites/duel/$k-$kind.json ]] || python3 $MVP/tools/slice_duel_spin.py $k $kind >> $log 2>&1
      line 0 reused; continue
    fi
    (( limit && drawn >= limit )) && { print -r -- "# paused at $n/$total after $drawn new sheets $(date '+%T')" >> $prog; exit 0; }
    [[ -f $out ]] && mv $out $src/$k-$kind.rejected-$(date +%H%M%S).png
    t0=$EPOCHSECONDS
    $MVP/tools/gen_duel_frames_codex.sh $k --$kind > $log 2>&1 &
    pid=$!
    while kill -0 $pid 2>/dev/null; do
      (( EPOCHSECONDS - t0 > tmo )) && { kill_tree $pid; sleep 2; break; }
      sleep 3
    done
    wait $pid 2>/dev/null; dt=$((EPOCHSECONDS - t0)); drawn=$((drawn + 1))
    if (( dt > tmo )) && [[ ! -f $out ]]; then st=timeout
    elif [[ ! -f $out ]]; then st=fail
    elif ! check_sheet $out >> $log 2>&1; then st=bad-sheet
    elif ! python3 $MVP/tools/slice_duel_spin.py $k $kind >> $log 2>&1; then st=slice-fail
    else st=ok; fi
    line $dt $st
    if [[ $st == ok ]]; then fails=0
    else
      fails=$((fails + 1))
      (( fails >= 2 )) && { print -r -- "# stopped: two failures in a row $(date '+%T')" >> $prog; exit 1; }
    fi
  done
done
print -r -- "# done $(date '+%F %T')" >> $prog
