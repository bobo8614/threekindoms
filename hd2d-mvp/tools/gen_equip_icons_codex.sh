#!/bin/zsh
# Paint the equipment icons through the Codex CLI's built-in imagegen (GPT image, ChatGPT login, no API key).
# Prompts from equip_icon_prompts.mjs; style reference is a strip of shipped portraits (assets/ai/icon/source/ref/,
# local only). Single pieces to re-paint a bad cell: pass the id.
#   hd2d-mvp/tools/gen_equip_icons_codex.sh weapons|armor [id]
# Output: assets/ai/icon/source/equip-<weapons|armor>.png or equip-<id>.png (full size, local only);
# tools/slice_equip_icons.py cuts and reduces them to what the game loads.
set -e
MVP=${0:A:h:h}; ROOT=${MVP:h}
kind=$1; id=$2
src=$MVP/assets/ai/icon/source; mkdir -p $src/ref
imgs=(-i $src/ref/portraits.png)
[[ -f $src/ref/card.png ]] && imgs+=(-i $src/ref/card.png)
out=$src/equip-${id:-$kind}.png
task="Use the \$imagegen skill with the built-in image_gen tool (not the CLI) to create ONE image from the spec below, then copy the final PNG to $out. Do not modify any other file. Reply with only the saved path.

$(node $MVP/tools/equip_icon_prompts.mjs $kind $id)"
codex exec --skip-git-repo-check -C $ROOT -s workspace-write "${imgs[@]}" -- "$task" < /dev/null
ls -la $out
