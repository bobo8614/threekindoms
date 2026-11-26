#!/bin/zsh
# Generate one rider's 单挑 action sheet (4×4 poses, see duel_frame_prompts.mjs) through the Codex CLI's
# built-in imagegen, with the rider's approved battle sprite (and portrait) as references. --b makes the
# second sheet (walk, swing in-betweens, 牵制/舍身 poses) with the approved first sheet as the reference; --c the
# third (舍身 charge and leap, crushing hit, falls, surrender, triumph), also from the first sheet;
# --turn the front / back sheet for the 白兵 board, also from the first sheet; --wheel the three-quarter views
# that a horse wheels round through in the duel, from the first sheet and the turn sheet; --spin / --leap the 3×2
# 普通攻击 overhead spin and 舍身 high leap sheets, from the first sheet and 关羽's approved 38-spin / 38-leap (layout only).
#   hd2d-mvp/tools/gen_duel_frames_codex.sh <officer_id|attacker|defender>[-spear|-sword] [--b|--c|--turn|--wheel|--spin|--leap] [take]
# Output: assets/ai/sprites/source/duel/<key>.png (or <key>-b.png / <key>-c.png / <key>-turn.png / <key>-wheel.png); then run
# slice_duel_frames.py <key> (a -turn sheet: slice_troop_frames.py --duel <key>; a -wheel one: --wheel <key>;
# -spin / -leap: slice_duel_spin.py <key> spin|leap).
set -e
MVP=${0:A:h:h}; ROOT=${MVP:h}
key=$1; b=$2
work=$(mktemp -d); trap 'rm -rf $work' EXIT
if [[ $key =~ ^(attacker|defender)(-spear|-sword)?$ ]]; then  # the generic generals, in each weapon class (duel_frame_prompts.mjs genericOf)
  ref=$MVP/assets/ai/sprites/source/$key-general.webp; refs=(-i $work/ref.png)
else
  ref=$MVP/assets/ai/sprites/source/officers/$key.webp; refs=(-i $work/ref.png -i $work/portrait.png)
  if [[ $key == f-* ]]; then refs=(-i $work/ref.png)  # a woman general's look (heroine_prompts.mjs) has no portrait
  else
    portrait=$MVP/assets/ai/portraits/$key.png; [[ -f $portrait ]] || portrait=$MVP/assets/ai/portraits/$key.webp
    python3 -c "from PIL import Image;Image.open('$portrait').convert('RGB').save('$work/portrait.png')"
  fi
fi
[[ $b == --b || $b == --c || $b == --turn || $b == --wheel || $b == --spin || $b == --leap ]] && ref=$MVP/assets/ai/sprites/source/duel/$key.png
[[ $b == --turn ]] && refs=(-i $work/ref.png)
if [[ $b == --spin || $b == --leap ]]; then  # 诸葛亮's carriage has no horse to copy the layout from
  sample=$MVP/assets/ai/sprites/source/duel/38-${b#--}.png
  [[ $key != 38 && $key != 109 && -f $sample ]] && { cp $sample $work/sample.png; refs=(-i $work/ref.png -i $work/sample.png); } || refs=(-i $work/ref.png)
fi
[[ $b == --wheel ]] && { cp $MVP/assets/ai/sprites/source/duel/$key-turn.png $work/turn.png; refs=(-i $work/ref.png -i $work/turn.png); }
python3 -c "from PIL import Image;im=Image.open('$ref').convert('RGBA');bg=Image.new('RGBA',im.size,(255,0,255,255));bg.alpha_composite(im);bg.convert('RGB').save('$work/ref.png')"
mkdir -p $MVP/assets/ai/sprites/source/duel
out=$MVP/assets/ai/sprites/source/duel/$key${b:+-${b#--}}$3.png  # $3: a take number, so a redraw keeps the earlier take (38-c2.png)
body=$(node $MVP/tools/duel_frame_prompts.mjs $key $b)
task="Use the \$imagegen skill with the built-in image_gen tool (not the CLI) to create ONE landscape 1536x1024 image from the spec below, then copy the final PNG to $out. Do not modify any other file. Reply with only the saved path.

$body"
codex exec --skip-git-repo-check -C $ROOT -s workspace-write --add-dir $MVP/assets/ai/sprites/source/duel $refs -- "$task" < /dev/null
ls -la $out
