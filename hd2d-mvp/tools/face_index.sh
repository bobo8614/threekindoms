#!/bin/zsh
# Rebuild assets/ai/faces/index.json ("<id>-<mood>" for every generated bust) for the game to load.
cd ${0:A:h:h}/assets/ai/faces && print -l *.webp(N) | sed 's/\.webp$//' | python3 -c "import sys,json;k=sorted(sys.stdin.read().split(),key=lambda s:(int(s.split('-')[0]),s));print(json.dumps(k))" > index.json && echo "$(python3 -c "import json;print(len(json.load(open('index.json'))))") faces indexed"
