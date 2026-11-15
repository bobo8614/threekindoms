#!/bin/zsh
# Rebuild assets/ai/portraits/index.json (ids that have a generated .webp) for the game to load.
cd ${0:A:h:h}/assets/ai/portraits && print -l *.webp(N) | sed 's/\.webp$//' | sort -n | python3 -c "import sys,json;print(json.dumps([int(x) for x in sys.stdin.read().split()]))" > index.json && echo "$(python3 -c "import json;print(len(json.load(open('index.json'))))") portraits indexed"
