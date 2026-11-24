#!/bin/zsh
# Generate one extended troop look's battle sprite (troop_sprite_prompts.mjs) through the Codex CLI's
# built-in imagegen. Attacker: the original attacker sprite of the borrowed kind is the style anchor.
# Defender: the approved attacker sprite of the same look is the reference (same man, recoloured).
#   hd2d-mvp/tools/gen_troop_sprite_codex.sh <attacker|defender>-<elephant|hillman|ashigaru|steppe>
# Output: sprites/source/<key>.png (raw, not committed), sprites/source/<key>.webp (keyed, 512×341 like
# the original troop sprites) and sprites/<key>.png (64 px game sprite).
set -e
MVP=${0:A:h:h}; ROOT=${MVP:h}
key=$1; side=${key%%-*}; look=${key#*-}
src=$MVP/assets/ai/sprites/source
work=$(mktemp -d); trap 'rm -rf $work' EXIT
if [[ $side == attacker ]]; then
  kind=$(node -e "import('$MVP/tools/troop_sprite_prompts.mjs').then(m=>process.stdout.write(m.BORROW['$look']))")
  ref=$src/attacker-$kind.webp
else ref=$src/attacker-$look.webp; fi
[[ -f $ref ]] || { echo "missing reference $ref"; exit 1; }
python3 -c "from PIL import Image;im=Image.open('$ref').convert('RGBA');bg=Image.new('RGBA',im.size,(255,0,255,255));bg.alpha_composite(im);bg.convert('RGB').save('$work/ref.png')"
raw=$src/$key.png
body=$(node $MVP/tools/troop_sprite_prompts.mjs $key)
task="Use the \$imagegen skill with the built-in image_gen tool (not the CLI) to create ONE landscape 1536x1024 image from the spec below, then copy the final PNG to $raw. Do not modify any other file. Reply with only the saved path.

$body"
rm -f $raw
codex exec --skip-git-repo-check -C $ROOT -s workspace-write --add-dir $src -i $work/ref.png -- "$task" < /dev/null
[[ -f $raw ]] || { echo "codex produced no $raw"; exit 1; }
python3 $MVP/tools/key_troop_sprite.py $raw $src/$key.webp $work/keyed.png
python3 $MVP/tools/pixelize.py $work/keyed.png $MVP/assets/ai/sprites/$key.png --height 64 --colors 48
ls -la $raw $src/$key.webp $MVP/assets/ai/sprites/$key.png
