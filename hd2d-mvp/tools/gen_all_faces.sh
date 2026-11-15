#!/bin/zsh
# Batch-generate every missing officer expression sheet through gen_faces_codex.sh, N in parallel.
#   hd2d-mvp/tools/gen_all_faces.sh [parallel=5]
# Same order as gen_all_portraits.sh (rulers, initial, auto-join, search). Officers that already
# have all four busts are skipped, so the script can be re-run to resume; the index is rebuilt at the end.
MVP=${0:A:h:h}
par=${1:-5}
ids=$(python3 - "$MVP" <<'PY'
import json, sys, os
mvp = sys.argv[1]; d = json.load(open(f'{mvp}/data/game-data.json'))
rank = {'initial': 1, 'automatic_faction': 2, 'search_city': 3}
rulers = {f['ruler'] for f in d['factions']}
order = sorted(d['officers'], key=lambda o: (0 if o['id'] in rulers else rank[o['appear']], o['year'], o['id']))
done = lambda i: all(os.path.exists(f'{mvp}/assets/ai/faces/{i}-{m}.webp') for m in ('calm', 'angry', 'joy', 'grief'))
print(' '.join(str(o['id']) for o in order if not done(o['id'])))
PY
)
echo "${#${=ids}} expression sheets to generate"
print -l ${=ids} | xargs -P $par -I{} sh -c "'$MVP/tools/gen_faces_codex.sh' {} >/dev/null 2>&1 && echo ok {} || echo fail {}"
$MVP/tools/face_index.sh
