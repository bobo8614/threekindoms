#!/bin/zsh
# Paint one storyboard 演出 sheet (3×3 frames, tools/storyboard_prompts.mjs) through the Codex CLI's built-in imagegen
# (ChatGPT login, no API key); gen_storyboard_api.py is the API route for the same prompt.
#   hd2d-mvp/tools/gen_storyboard_codex.sh <scene> [take]
# Output: assets/ai/vignettes/source/v2/<scene>/sheet[-take].png (full size, local only). References are read from
# SANDBOX_SRC (default: this checkout), since the source folders are not in git and a worktree has none.
set -e
MVP=${0:A:h:h}
scene=$1; take=${2:+-$2}
src=${SANDBOX_SRC:-$MVP}
out=$src/assets/ai/vignettes/source/v2/$scene/sheet$take.png
[[ -e $out ]] && { echo "$out exists: pass a take name"; exit 1; }
work=$(mktemp -d); trap 'rm -rf $work' EXIT
refs=(); i=0
for r in $(node $MVP/tools/storyboard_prompts.mjs $scene --refs); do
  i=$((i+1)); in=$src/${r%%#*}; [[ -f $in ]] || in=$MVP/${r%%#*}
  [[ -f $in ]] || { echo "missing reference $r"; exit 1; }
  python3 -c "from PIL import Image;Image.open('$in').convert('RGB').save('$work/ref$i.png')"; refs+=($work/ref$i.png)
done
spec="$(node $MVP/tools/storyboard_prompts.mjs $scene)

OUTPUT SIZE: landscape 3:2, the largest size the tool allows (ask for 3504x2336 or the nearest it supports)."
# Codex runs sandboxed to this checkout, so it paints into a scratch file here, moved to the source folder after.
tmp=$MVP/assets/ai/vignettes/.codex-$scene$take.png; rm -f $tmp
$MVP/tools/gen_image_codex.sh $tmp "$spec" "${refs[@]}"
mkdir -p ${out:h}; mv $tmp $out
python3 -c "from PIL import Image;print('saved', '$out', Image.open('$out').size)"
