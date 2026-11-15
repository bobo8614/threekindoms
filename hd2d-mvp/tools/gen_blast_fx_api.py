#!/usr/bin/env python3
# Paint the 白兵 爆炎 set (src/fx.js blast, src/tacticalview.js tacticFx) through the OpenAI Images API, against the
# shipped troop sprites and the title art as style references, on a transparent background.
#   python3 hd2d-mvp/tools/gen_blast_fx_api.py <bomb|burst|scorch> [--take a] [--n 2] [--model gpt-image-2.6-sunburst]
# Output: assets/ai/tactical/source/blast/<part>[-take]-<i>.png (full size, local only, see AGENTS.md); the game ships
# what tools/build_blast_fx.py cuts from the chosen takes. The key is read as in gen_warmap_api.py.
import base64, io, json, sys, time, urllib.request, urllib.error, uuid
from pathlib import Path
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from gen_warmap_api import key, png

MVP = Path(__file__).resolve().parents[1]
STYLE = ('Painted HD-2D pixel art in the style of the reference sprites and title painting: crisp hand-placed pixel clusters, '
         'warm saturated palette, soft painterly shading, no outlines thicker than one pixel, no photorealism, no 3D render look. '
         'Fully transparent background (alpha), no ground, no shadow, no frame, no border, no text, no watermark.')
PARTS = {
    'bomb': ('1024x1024', 'A single small Chinese black-powder bomb of the Three Kingdoms era (火药罐 / 霹雳火球): a round dark-brown glazed '
             'earthenware pot the size of a fist, bound with a cross of hemp cord, a short twisted fuse sticking out of its clay-stopped '
             'mouth with a tiny bright spark at its tip. Seen from the side and slightly above, centred, filling about 60% of the image.'),
    'burst': ('1536x1024', 'An eight-frame animation sheet of one big explosion of a black-powder bomb on a battlefield, laid out as a grid of '
              '4 columns and 2 rows of equal cells, read left to right then top to bottom, each cell with the blast centred at the same '
              'spot near the bottom middle of the cell and plenty of empty transparent space around it, never touching the cell edges. '
              'Frame 1: a small white-hot core with a sharp star flash. Frame 2: a bright yellow-white fireball swelling. '
              'Frame 3: a huge round orange fireball with rolling flame lobes, sparks and clods of earth flying out. '
              'Frame 4: the fireball at full size, deep orange and red, turning into a mushroom of flame. '
              'Frame 5: flames break up into ragged tongues, dark smoke begins to billow on top. '
              'Frame 6: mostly thick dark-grey smoke with orange glow and embers inside. '
              'Frame 7: a column of grey smoke rising, a few dying embers. Frame 8: thin grey smoke wisps fading away. '
              'The same explosion seen from the same three-quarter top-down game camera in every frame.'),
    'scorch': ('1024x1024', 'A top-down view of a scorch mark left on grassy dirt by a bomb blast: a round blackened burnt patch with a darker '
               'crater centre, charred cracks and a few glowing embers, soot spraying outward in ragged rays, fading softly to '
               'transparent at the edges. Only the mark itself, seen straight from above, centred, filling about 80% of the image.'),
}
REFS = ['assets/ai/title.webp', 'assets/ai/sprites/attacker-soldier.png', 'assets/ai/sprites/defender-general.png']


def request(images, text, n, model, size):
    b = uuid.uuid4().hex; parts = []
    def field(name, value): parts.append(f'--{b}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
    for k, v in (('model', model), ('prompt', text), ('size', size), ('quality', 'high'), ('n', str(n)), ('background', 'transparent'), ('output_format', 'png')): field(k, v)
    for i, data in enumerate(images):
        parts.append(f'--{b}\r\nContent-Disposition: form-data; name="image[]"; filename="{i}.png"\r\nContent-Type: image/png\r\n\r\n'.encode() + data + b'\r\n')
    parts.append(f'--{b}--\r\n'.encode())
    req = urllib.request.Request('https://api.openai.com/v1/images/edits', data=b''.join(parts), method='POST',
                                 headers={'Authorization': f'Bearer {key()}', 'Content-Type': f'multipart/form-data; boundary={b}'})
    try:
        with urllib.request.urlopen(req, timeout=600) as r: return json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f'API error {e.code}: {e.read().decode(errors="replace")[:600]}')


if __name__ == '__main__':
    a = sys.argv[1:]
    opt = lambda k, d: (a.pop(a.index(k) + 1), a.remove(k))[0] if k in a else d
    take, n, model = opt('--take', ''), int(opt('--n', 2)), opt('--model', 'gpt-image-2.6-sunburst')
    part = a[0]; size, what = PARTS[part]
    out = MVP / 'assets/ai/tactical/source/blast'; out.mkdir(parents=True, exist_ok=True)
    refs = [png(Image.open(MVP / f).convert('RGB')) for f in REFS]
    text = f'{what}\n\n{STYLE}\nThe reference images show the game\'s art style only; do not copy their figures.'
    t0 = time.time(); r = request(refs, text, n, model, size)
    for i, d in enumerate(r['data']):
        raw = base64.b64decode(d['b64_json']); f = out / f'{part}{"-" + take if take else ""}-{i}.png'
        f.write_bytes(raw)  # the raw bytes: a converted copy would lose real alpha (devlog, storyboard pitfalls)
        im = Image.open(io.BytesIO(raw)); print('saved', f, im.mode, im.size)
    print(f'{time.time() - t0:.0f} s', json.dumps(r.get('usage', {})))
