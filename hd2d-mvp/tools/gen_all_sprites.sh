#!/bin/zsh
# Batch-generate every missing star-officer sprite (武力/智力/人德 ≥ 90) through gen_sprites_codex.sh,
# N in parallel. Existing sprites are skipped, so the script can be re-run to resume.
#   hd2d-mvp/tools/gen_all_sprites.sh [parallel=4]
MVP=${0:A:h:h}
par=${1:-4}
ids=(); for id in ${=$(node $MVP/tools/sprite_prompts.mjs --stars)}; do [[ -f $MVP/assets/ai/sprites/officers/$id.png ]] || ids+=$id; done
echo "${#ids} sprites to generate"
print -l $ids | xargs -P $par -I{} sh -c "'$MVP/tools/gen_sprites_codex.sh' {} >/dev/null 2>&1 && echo ok {} || echo fail {}"
