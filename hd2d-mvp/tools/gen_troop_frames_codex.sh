#!/bin/zsh
# Generate one 白兵 troop action sheet (4×4 poses, see troop_frame_prompts.mjs) through the Codex CLI's
# built-in imagegen, with the troop's approved battle sprite as the reference. --v2 makes the second look.
#   hd2d-mvp/tools/gen_troop_frames_codex.sh <attacker|defender>-<soldier|archer|cavalry> [--v2]
# Output: assets/ai/sprites/source/troops/<key>[-v2].png; then run slice_troop_frames.py <key>.
set -e
MVP=${0:A:h:h}; ROOT=${MVP:h}
key=$1; shift; v2=; turn=
for f in "$@"; do [[ $f == --v2 ]] && v2=--v2; [[ $f == --turn ]] && turn=--turn; done
work=$(mktemp -d); trap 'rm -rf $work' EXIT
mkdir -p $MVP/assets/ai/sprites/source/troops
if [[ -n $turn ]]; then cp $MVP/assets/ai/sprites/source/troops/$key${v2:+-v2}.png $work/ref.png
else python3 -c "from PIL import Image;im=Image.open('$MVP/assets/ai/sprites/source/$key.webp').convert('RGBA');bg=Image.new('RGBA',im.size,(255,0,255,255));bg.alpha_composite(im);bg.convert('RGB').save('$work/ref.png')"; fi
out=$MVP/assets/ai/sprites/source/troops/$key${v2:+-v2}${turn:+-turn}.png
body=$(node $MVP/tools/troop_frame_prompts.mjs $key $v2 $turn)
task="Use the \$imagegen skill with the built-in image_gen tool (not the CLI) to create ONE landscape 1536x1024 image from the spec below, then copy the final PNG to $out. Do not modify any other file. Reply with only the saved path.

$body"
codex exec --skip-git-repo-check -C $ROOT -s workspace-write --add-dir $MVP/assets/ai/sprites/source/troops -i $work/ref.png -- "$task" < /dev/null
ls -la $out
