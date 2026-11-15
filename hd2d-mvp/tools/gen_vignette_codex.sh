#!/bin/zsh
# Generate one layer of a 命令演出 vignette through the Codex CLI's built-in imagegen (GPT image,
# ChatGPT login, no API key). Prompt and references come from vignette_prompts.mjs.
#   hd2d-mvp/tools/gen_vignette_codex.sh <scene> <layer>
#   hd2d-mvp/tools/gen_vignette_codex.sh <scene>          (all layers of the scene, in order)
# Output: assets/ai/vignettes/source/<scene>/<layer>.png (full size, local only); then run
# tools/build_vignettes.py to key, reduce and publish the game assets.
set -e
MVP=${0:A:h:h}; ROOT=${MVP:h}
scene=$1
if [[ -z $2 ]]; then
  for l in $(node $MVP/tools/vignette_prompts.mjs --list | awk -v s=$scene '$1==s{print $2}'); do $0 $scene $l; done
  exit 0
fi
layer=$2
src=$MVP/assets/ai/vignettes/source/$scene; mkdir -p $src
work=$(mktemp -d); trap 'rm -rf $work' EXIT
imgs=(); i=0
for r in $(node $MVP/tools/vignette_prompts.mjs $scene $layer --refs); do
  i=$((i+1)); f=$work/ref$i.png
  case $r in
    title) in=$MVP/assets/ai/title.webp ;;
    sprite) in=$MVP/assets/ai/sprites/source/attacker-soldier.webp ;;
    fc:*) in=$ROOT/reference-assets/graphics/vignettes/${r#fc:}.png ;;
    layer:*) in=$src/${r#layer:}.png ;;
  esac
  [[ -f $in ]] || { echo "missing reference $r ($in)"; exit 1; }
  python3 -c "from PIL import Image;Image.open('$in').convert('RGB').save('$f')"
  imgs+=(-i $f)
done
body=$(node $MVP/tools/vignette_prompts.mjs $scene $layer)
task="Use the \$imagegen skill with the built-in image_gen tool (not the CLI) to create ONE image from the spec below, then copy the final PNG to $src/$layer.png. Do not modify any other file. Reply with only the saved path.

$body"
codex exec --skip-git-repo-check -C $ROOT -s workspace-write --add-dir $work "${imgs[@]}" -- "$task" < /dev/null
ls -la $src/$layer.png
