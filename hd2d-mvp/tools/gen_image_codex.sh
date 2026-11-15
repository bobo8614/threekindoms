#!/bin/zsh
# Generic Codex imagegen call (built-in GPT image tool, ChatGPT login, no API key).
#   hd2d-mvp/tools/gen_image_codex.sh <out.png> "<image spec>" [reference.png ...]
set -e
MVP=${0:A:h:h}; ROOT=${MVP:h}
out=${1:A}; spec=$2; shift 2
imgs=(); for r in "$@"; do imgs+=(-i ${r:A}); done
task="Use the \$imagegen skill with the built-in image_gen tool (not the CLI) to create ONE image from the spec below, then copy the final PNG to $out (create the folder if needed). Do not modify any other file. Reply with only the saved path.

$spec"
codex exec --skip-git-repo-check -C $ROOT -s workspace-write "${imgs[@]}" -- "$task" < /dev/null
ls -la $out
