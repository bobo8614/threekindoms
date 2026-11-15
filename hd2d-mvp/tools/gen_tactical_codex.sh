#!/bin/zsh
# Paint one of the 白兵 field's set pieces through the Codex CLI's built-in imagegen (GPT image, ChatGPT login,
# no API key). Prompt from tactical_art_prompts.mjs; the style reference is a crop of the approved 白兵 concept
# (assets/ai/tactical/source/ref/<ref>.png, local only).
#   hd2d-mvp/tools/gen_tactical_codex.sh <name>
# Output: assets/ai/tactical/source/<name>.png (full size, local only); tools/bake_tactical.py reduces it to
# what the game loads.
set -e
MVP=${0:A:h:h}; ROOT=${MVP:h}
name=$1
src=$MVP/assets/ai/tactical/source; mkdir -p $src
ref=$src/ref/$(node $MVP/tools/tactical_art_prompts.mjs --ref $name).png
out=$src/$name.png
task="Use the \$imagegen skill with the built-in image_gen tool (not the CLI) to create ONE image from the spec below, then copy the final PNG to $out. Do not modify any other file. Reply with only the saved path.

$(node $MVP/tools/tactical_art_prompts.mjs $name)"
codex exec --skip-git-repo-check -C $ROOT -s workspace-write -i $ref -- "$task" < /dev/null
ls -la $out
