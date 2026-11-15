#!/bin/zsh
# Paint the controller button glyphs through the Codex CLI's built-in imagegen (GPT image, ChatGPT login, no API key).
# Prompts from pad_glyph_prompts.mjs; the style reference is a strategy-map screenshot (assets/ai/pad/source/ref.png,
# local only). One cell to re-paint: pass its name (see CELLS).
#   hd2d-mvp/tools/gen_pad_glyphs_codex.sh xbox|ps|nintendo [cell]
#   hd2d-mvp/tools/gen_pad_glyphs_codex.sh offset|sym|mouse    (the help's controller pictures, with the xbox glyph sheet as a second reference)
# Output: assets/ai/pad/source/<family>.png or <family>-<cell>.png (full size, local only);
# tools/slice_pad_glyphs.py cuts and reduces them to what the game loads.
set -e
MVP=${0:A:h:h}; ROOT=${MVP:h}
family=$1; cell=$2
src=$MVP/assets/ai/pad/source; mkdir -p $src
imgs=(); [[ -f $src/ref.png ]] && imgs+=(-i $src/ref.png)
[[ $family == (offset|sym|mouse) && -f $src/xbox.png ]] && imgs+=(-i $src/xbox.png)
out=$src/$family${cell:+-$cell}.png
task="Use the \$imagegen skill with the built-in image_gen tool (not the CLI) to create ONE image from the spec below, then copy the final PNG to $out. Do not modify any other file. Reply with only the saved path.

$(node $MVP/tools/pad_glyph_prompts.mjs $family $cell)"
codex exec --skip-git-repo-check -C $ROOT -s workspace-write "${imgs[@]}" -- "$task" < /dev/null
ls -la $out
