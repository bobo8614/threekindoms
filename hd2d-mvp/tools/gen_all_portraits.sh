#!/bin/zsh
# Batch-generate every missing officer portrait through gen_portraits_codex.sh, N in parallel.
#   hd2d-mvp/tools/gen_all_portraits.sh [parallel=5] [style_ref=assets/ai/portraits/38.png]
# Order: rulers, initial officers, faction auto-join, then city search officers. Existing .webp
# files are skipped, so the script can be re-run to resume.
MVP=${0:A:h:h}
par=${1:-5}; style=${2:-$MVP/assets/ai/portraits/38.png}
ids=$(python3 - "$MVP" <<'EOF'
import json, sys, os
mvp = sys.argv[1]; d = json.load(open(f'{mvp}/data/game-data.json'))
rank = {'initial': 1, 'automatic_faction': 2, 'search_city': 3}
rulers = {f['ruler'] for f in d['factions']}
order = sorted(d['officers'], key=lambda o: (0 if o['id'] in rulers else rank[o['appear']], o['year'], o['id']))
print(' '.join(str(o['id']) for o in order if not os.path.exists(f"{mvp}/assets/ai/portraits/{o['id']}.webp")))
EOF
)
echo "${#${=ids}} portraits to generate"
print -l ${=ids} | xargs -P $par -I{} sh -c "'$MVP/tools/gen_portraits_codex.sh' {} '$style' >/dev/null 2>&1 && echo ok {} || echo fail {}"
