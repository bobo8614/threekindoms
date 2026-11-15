#!/bin/zsh
# Generate officer portraits through the Codex CLI's built-in imagegen skill (GPT image, ChatGPT
# login, no OPENAI_API_KEY needed). Prompts come from portrait_prompts.mjs.
#   hd2d-mvp/tools/gen_portraits_codex.sh <officer_id> [style_ref.png]
# The officer's NES portrait is enlarged 12x (nearest) as identity reference; style_ref is an
# approved portrait used for rendering style only. Output: hd2d-mvp/assets/ai/portraits/<id>.webp
# (768x1152, q88) plus the full-size PNG kept next to it for use as a later style reference.
set -e
MVP=${0:A:h:h}; ROOT=${MVP:h}
id=$1; style=$2
work=$(mktemp -d); trap 'rm -rf $work' EXIT
src=$(python3 -c "import json;print(json.load(open('$MVP/data/game-data.json'))['officers'][$id]['portrait'])")
python3 -c "from PIL import Image;im=Image.open('$ROOT/$src').convert('RGB');im.resize((im.width*12,im.height*12),Image.NEAREST).save('$work/ref.png')"
out=$MVP/assets/ai/portraits/$id.png
imgs=(-i $work/ref.png); [[ -n $style ]] && imgs+=(-i $style)
body=$(node $MVP/tools/portrait_prompts.mjs $id $style)
task="Use the \$imagegen skill with the built-in image_gen tool (not the CLI) to create ONE image from the spec below, then copy the final PNG to $out (create the folder if needed). Do not modify any other file. Reply with only the saved path.

$body"
codex exec --skip-git-repo-check -C $ROOT -s workspace-write "${imgs[@]}" -- "$task" < /dev/null
python3 -c "from PIL import Image;Image.open('$out').convert('RGB').resize((768,1152),Image.LANCZOS).save('${out:r}.webp',quality=88)"
ls -la $out ${out:r}.webp
