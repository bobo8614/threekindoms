#!/bin/zsh
# Generate one side's war-map march sheet (4×3: side / three-quarter front / three-quarter back, each standing
# and walking; see march_frame_prompts.mjs) through the Codex CLI's built-in imagegen, with the side's approved
# general sprite as the reference.
#   hd2d-mvp/tools/gen_march_frames_codex.sh <attacker|defender> [pose_ref.png]
# pose_ref: an approved sheet of the other side, passed as reference image 2 for the rows' viewing angles.
# Output: assets/ai/sprites/source/march/<side>.png; then run slice_march_frames.py <side>.
set -e
MVP=${0:A:h:h}; ROOT=${MVP:h}
side=$1; pose=$2
[[ $side == attacker || $side == defender ]] || { echo "usage: $0 <attacker|defender>"; exit 1; }
work=$(mktemp -d); trap 'rm -rf $work' EXIT
python3 -c "from PIL import Image;im=Image.open('$MVP/assets/ai/sprites/source/$side-general.webp').convert('RGBA');bg=Image.new('RGBA',im.size,(255,0,255,255));bg.alpha_composite(im);bg.convert('RGB').save('$work/ref.png')"
mkdir -p $MVP/assets/ai/sprites/source/march
out=$MVP/assets/ai/sprites/source/march/$side.png
body=$(node $MVP/tools/march_frame_prompts.mjs $side)
refs=(-i $work/ref.png)
if [[ -n $pose ]]; then
  python3 -c "from PIL import Image;Image.open('${pose:A}').convert('RGB').save('$work/pose.png')"; refs+=(-i $work/pose.png)
  body+="
Reference image 2 is the approved sheet of the OTHER army's general: match its grid, the viewing angle of each row (especially the clearly frontal three-quarter view in row 2) and the leg poses of each column, but NOT its colours, armour or horse. In row 3 the horse faces to the viewer's RIGHT."
fi
task="Use the \$imagegen skill with the built-in image_gen tool (not the CLI) to create ONE landscape 1536x1024 image from the spec below, then copy the final PNG to $out. Do not modify any other file. Reply with only the saved path.

$body"
codex exec --skip-git-repo-check -C $ROOT -s workspace-write --add-dir $MVP/assets/ai/sprites/source/march $refs -- "$task" < /dev/null
ls -la $out
