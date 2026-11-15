#!/bin/zsh
# Generate one officer's expression busts through Codex imagegen (ChatGPT login, no API key).
#   hd2d-mvp/tools/gen_faces_codex.sh <officer_id>
# References: the approved full-body portrait (identity and style) and the original five-expression
# pixel strip (how strongly each face reads). The 2×2 sheet lands in assets/ai/faces/source/<id>.png
# (local only) and slice_faces.py cuts it into assets/ai/faces/<id>-{calm,angry,joy,grief}.webp.
set -e
MVP=${0:A:h:h}; ROOT=${MVP:h}
id=$1
work=$(mktemp -d); trap 'rm -rf $work' EXIT
ref=$MVP/assets/ai/portraits/$id.png; [[ -f $ref ]] || ref=$MVP/assets/ai/portraits/$id.webp
src=$(python3 -c "import json;print(json.load(open('$MVP/data/game-data.json'))['officers'][$id]['portrait'].replace('.png','-expressions.png'))")
python3 -c "from PIL import Image;im=Image.open('$ROOT/$src').convert('RGB');im.resize((im.width*8,im.height*8),Image.NEAREST).save('$work/strip.png')"
python3 -c "from PIL import Image;Image.open('$ref').convert('RGB').save('$work/portrait.png')"
out=$MVP/assets/ai/faces/source/$id.png
body=$(node $MVP/tools/face_prompts.mjs $id)
task="Use the \$imagegen skill with the built-in image_gen tool (not the CLI) to create ONE image from the spec below, then copy the final PNG to $out (create the folder if needed). Do not modify any other file. Reply with only the saved path.

$body"
codex exec --skip-git-repo-check -C $ROOT -s workspace-write -i $work/portrait.png -i $work/strip.png -- "$task" < /dev/null
python3 $MVP/tools/slice_faces.py $id
