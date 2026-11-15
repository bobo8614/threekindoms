#!/usr/bin/env python3
# Paint one storyboard 演出 sheet (3×3 frames, tools/storyboard_prompts.mjs) through the OpenAI Images API.
# Output: assets/ai/vignettes/source/v2/<scene>/sheet[-take].png (full size, local only, see AGENTS.md).
# The key is read as in gen_warmap_api.py. Run one scene at a time.
#   python3 hd2d-mvp/tools/gen_storyboard_api.py <scene> [--take a] [--model gpt-image-2.6-sunburst] [--quality high]
import base64, io, json, subprocess, sys, time
from pathlib import Path
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from gen_warmap_api import edit, png

MVP = Path(__file__).resolve().parents[1]
SIZE = '3504x2336'  # 3:2, sides divisible by 16, within the API's pixel limit: panels of about 1150×765

a = sys.argv[1:]
opt = lambda k, d: (a.pop(a.index(k) + 1), a.remove(k))[0] if k in a else d
take, model, quality = opt('--take', ''), opt('--model', 'gpt-image-2.6-sunburst'), opt('--quality', 'high')
scene = a[0]
prompts = MVP / 'tools/storyboard_prompts.mjs'
text = subprocess.check_output(['node', str(prompts), scene], text=True)
refs = subprocess.check_output(['node', str(prompts), scene, '--refs'], text=True).split()
out = MVP / f'assets/ai/vignettes/source/v2/{scene}/sheet{"-" + take if take else ""}.png'
out.parent.mkdir(parents=True, exist_ok=True)
if out.exists(): sys.exit(f'{out} exists: pass --take to keep it')

def ref(f):
    """A reference image; 'sheet.png#n' is cell n of a duel sprite sheet, enlarged on a plain ground."""
    path, _, cell = f.partition('#')
    im = Image.open(MVP / path).convert('RGBA')
    if cell:
        w = im.width // len(json.loads((MVP / path).with_suffix('.json').read_text())['frames'])
        im = im.crop((int(cell) * w, 0, (int(cell) + 1) * w, im.height)); im = im.resize((im.width * 5, im.height * 5), Image.NEAREST)
    ground = Image.new('RGBA', im.size, (128, 128, 128, 255)); ground.alpha_composite(im)
    return png(ground.convert('RGB'))


t0 = time.time()
r = edit([ref(f) for f in refs], text, 1, model, quality, size=SIZE)
Image.open(io.BytesIO(base64.b64decode(r['data'][0]['b64_json']))).convert('RGB').save(out)
print('saved', out, f'{time.time() - t0:.0f} s', 'usage', json.dumps(r.get('usage', {})))
