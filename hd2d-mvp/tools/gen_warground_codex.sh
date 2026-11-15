#!/bin/zsh
# Paint one of the war map's materials through the Codex CLI's built-in imagegen (GPT image, ChatGPT login,
# no API key). Prompt from warground_prompts.mjs; the style reference is a crop of the approved A2 concept
# (assets/ai/warground/source/ref/<ref>.png, local only), and season variants of the tree sheet also get the
# summer sheet so the shapes stay put.
#   hd2d-mvp/tools/gen_warground_codex.sh <name>
# Output: assets/ai/warground/source/<name>.png (full size, local only); tools/bake_warground.py reduces it
# to what the game loads.
set -e
MVP=${0:A:h:h}; ROOT=${MVP:h}
name=$1
src=$MVP/assets/ai/warground/source; mkdir -p $src
ref=$src/ref/$(node $MVP/tools/warground_prompts.mjs --ref $name).png
imgs=(-i $ref)
[[ $name == trees-* ]] && imgs+=(-i $src/trees.png)
out=$src/$name.png
task="Use the \$imagegen skill with the built-in image_gen tool (not the CLI) to create ONE image from the spec below, then copy the final PNG to $out. Do not modify any other file. Reply with only the saved path.

$(node $MVP/tools/warground_prompts.mjs $name)"
codex exec --skip-git-repo-check -C $ROOT -s workspace-write "${imgs[@]}" -- "$task" < /dev/null
ls -la $out
