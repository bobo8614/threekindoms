#!/bin/zsh
# Paint one battlefield as a single finished picture (the A2 look) through the Codex CLI's built-in imagegen.
# Image 1 is the layout guide (tools/flat_shot.mjs --dump, squashed to the oblique board by tools/warmap_guide.py):
# every river, wood, hill, castle and village must stay where it is, since each cell's terrain is a rule
# (tools/warmap_align.py checks it). Image 2 is the approved A2 concept (style only); an optional image 3
# is an earlier painting of the same field to keep (season variants).
#   hd2d-mvp/tools/gen_warmap_codex.sh <guide.png> <out.png> <style.png> [season words] [same-field.png]
set -e
MVP=${0:A:h:h}; ROOT=${MVP:h}
guide=${1:A}; out=${2:A}; style=${3:A}; season=${4:-late spring, fresh green}; keep=$5
imgs=(-i $guide -i $style); [[ -n $keep ]] && imgs+=(-i ${keep:A})
# Codex goes on without an attachment it cannot find (and paints without the style): stop here instead.
for f in $guide $style ${keep:+${keep:A}}; do [[ -f $f ]] || { print -u2 "missing input: $f"; exit 2; }; done
task="Use the \$imagegen skill with the built-in image_gen tool (not the CLI) to create ONE image from the spec below, then copy the final PNG to $out (create the folder if needed). Do not modify any other file. Reply with only the saved path.

Repaint the FIRST attached image as a finished, richly detailed painted battle map for a Three Kingdoms tactics game,
in exactly the art style of the SECOND attached image (our approved concept): hand-painted HD-2D pixel art, crisp
2-4 px clusters, fine dithering, muted warm palette, soft light from the upper left, round dense tree crowns with lit
tops, rock outcrops with brown-grey stratified cliff faces and grassy tops, a natural river with stony banks and small
white glints, worn earth patches, the odd small rock or bush.
LAYOUT IS FIXED: keep the same framing and aspect (2:1, wide) as the first image. The bright rectangle is the
battlefield: every river and lake, every wood, every rocky hill, the walled castle and each small village must stay at
exactly the same position, outline and size as in the first image (you may only make their edges more natural and
detailed, never move them, grow them or add new ones inside the rectangle). Open grass stays open grass.
Outside the rectangle: the surrounding countryside, darker and quieter (dense dark forest, farm fields, a few houses),
continuing the terrain at the rectangle's edge.
View: as in the second image, seen from about 50 degrees above (trees, rocks, castle and houses drawn standing up),
but the battlefield rectangle stays a rectangle (no perspective taper).
Season: $season.
No grid lines, no units or figures, no UI, no text, no frame."
[[ -n $keep ]] && task+="
The THIRD attached image is this same battlefield already painted: keep its drawing as closely as possible and change only the season."
codex exec --skip-git-repo-check -C $ROOT -s workspace-write "${imgs[@]}" -- "$task" < /dev/null
ls -la $out
