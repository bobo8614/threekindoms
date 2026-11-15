#!/bin/zsh
# Generate one officer's standard waist-up portrait (halfbody_prompts.mjs) through the Codex CLI's built-in
# imagegen, with his approved portrait and calm bust as references.
#   hd2d-mvp/tools/gen_halfbody_codex.sh <officer_id>
# Output: assets/ai/halfbody/source/<id>.png (full size, local only); then run build_halfbody.py.
set -e
MVP=${0:A:h:h}; ROOT=${MVP:h}
id=$1
work=$(mktemp -d); trap 'rm -rf $work' EXIT
portrait=$MVP/assets/ai/portraits/$id.png; [[ -f $portrait ]] || portrait=$MVP/assets/ai/portraits/$id.webp
python3 -c "from PIL import Image;Image.open('$portrait').convert('RGB').save('$work/portrait.png');Image.open('$MVP/assets/ai/faces/$id-calm.webp').convert('RGB').save('$work/bust.png')"
mkdir -p $MVP/assets/ai/halfbody/source
out=$MVP/assets/ai/halfbody/source/$id.png
body=$(node $MVP/tools/halfbody_prompts.mjs $id)
task="Use the \$imagegen skill with the built-in image_gen tool (not the CLI) to create ONE vertical 1024x1536 image from the spec below, then copy the final PNG to $out. Do not modify any other file. Reply with only the saved path.

$body"
codex exec --skip-git-repo-check -C $ROOT -s workspace-write --add-dir $MVP/assets/ai/halfbody/source -i $work/portrait.png -i $work/bust.png -- "$task" < /dev/null
ls -la $out
