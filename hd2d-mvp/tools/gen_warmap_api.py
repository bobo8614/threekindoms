#!/usr/bin/env python3
# Paint one battlefield through the OpenAI Images API (edits), as tools/gen_warmap_codex.sh does through Codex:
# same inputs (layout guide, A2 style reference, optional earlier painting to keep) and the same picture out
# (the guide's 2:1 frame, 1774 x 887). gpt-image-2 paints any size with sides divisible by 16 up to 3840: the
# picture is painted 2:1 at 3072 x 1536 and reduced to the guide's size (sharper than enlarging a smaller one).
# The key is read from OPENAI_API_KEY, ~/.config/openai/api_key or ~/.codex/api_key (never from the repository, never printed).
#   python3 hd2d-mvp/tools/gen_warmap_api.py <guide.png> <out.png> <style.png> [season words] [same-field.png]
#       [--n 1] [--model gpt-image-2] [--quality high]
import base64, io, json, os, sys, time, urllib.request, uuid
from PIL import Image

AW, AH = 3072, 1536             # painted at, 2:1


def key():
    k = os.environ.get('OPENAI_API_KEY', '').strip()
    for f in map(os.path.expanduser, ('~/.config/openai/api_key', '~/.codex/api_key')):
        if not k and os.path.exists(f): k = open(f).read().strip()
    if not k: sys.exit('no API key: set OPENAI_API_KEY or write it to ~/.config/openai/api_key or ~/.codex/api_key')
    return k


def to_api(f):
    return Image.open(f).convert('RGB').resize((AW, AH), Image.LANCZOS)


def png(im):
    b = io.BytesIO(); im.save(b, 'PNG'); return b.getvalue()


def prompt(season, keep):
    p = f"""Repaint the FIRST image as a finished, richly detailed painted battle map for a Three Kingdoms tactics game,
in exactly the art style of the SECOND image (our approved concept): hand-painted HD-2D pixel art, crisp
2-4 px clusters, fine dithering, muted warm palette, soft light from the upper left, round dense tree crowns with lit
tops, rock outcrops with brown-grey stratified cliff faces and grassy tops, a natural river with stony banks and small
white glints, worn earth patches, the odd small rock or bush.
LAYOUT IS FIXED: keep the same framing as the first image. The bright rectangle is the battlefield: every river and
lake, every wood, every rocky hill, the walled castle and each small village must stay at exactly the same position,
outline and size as in the first image (you may only make their edges more natural and detailed, never move them,
grow them or add new ones inside the rectangle). Open grass stays open grass.
Outside the rectangle: the surrounding countryside, a little darker and quieter (dense dark forest, farm fields, a few
houses), continuing the terrain at the rectangle's edge. The blurred dark border in the first image is only a
placeholder: paint it as real, detailed countryside, and let it meet the battlefield seamlessly, with no visible frame,
edge line or change of brightness along the rectangle.
View: as in the second image, seen from about 50 degrees above (trees, rocks, castle and houses drawn standing up),
but the battlefield rectangle stays a rectangle (no perspective taper).
Season: {season}.
No grid lines, no units or figures, no UI, no text, no frame."""
    if keep: p += "\nThe THIRD image is this same battlefield already painted: keep its drawing as closely as possible and change only the season."
    return p


def season_prompt(season):
    # The image model repaints the whole field when the layout guide comes first (its drawing then drifts from
    # summer): a season is painted from the summer picture alone, as an edit of that one picture.
    return f"""Edit this painted battle map: change ONLY the season to {season}.
Keep everything else exactly as it is: the same framing, every river, lake, wood, tree, rock, cliff, castle, house,
road and field at the same position, outline and size, the same pixel-art drawing, light direction and palette
character. Recolour and add or remove seasonal detail (leaves, snow, blossom, grass colour) on the existing drawing;
do not redraw, move or add anything. No grid lines, no units, no UI, no text, no frame."""


def edit(images, text, n, model, quality, fidelity=None, size=f'{AW}x{AH}'):
    b = uuid.uuid4().hex; parts = []
    def field(name, value): parts.append(f'--{b}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
    for k, v in (('model', model), ('prompt', text), ('size', size), ('quality', quality), ('n', str(n))): field(k, v)
    if fidelity: field('input_fidelity', fidelity) # 'high': keep the input images' shapes closer (the layout guide)
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
    n, model, quality, fidelity = int(opt('--n', 1)), opt('--model', 'gpt-image-2'), opt('--quality', 'high'), opt('--fidelity', None)
    guide, out, style = a[:3]; season = a[3] if len(a) > 3 else 'late spring, fresh green'; keep = a[4] if len(a) > 4 else None
    gw, gh = Image.open(guide).size
    only = '--season-only' in a and not a.remove('--season-only') # an edit of the summer picture alone
    if keep and only: imgs, text = [png(to_api(keep))], season_prompt(season)
    else: imgs, text = [png(to_api(guide)), png(Image.open(style).convert('RGB'))] + ([png(to_api(keep))] if keep else []), prompt(season, keep)
    t0 = time.time(); r = edit(imgs, text, n, model, quality, fidelity)
    root, ext = os.path.splitext(out)
    for i, d in enumerate(r['data']):
        im = Image.open(io.BytesIO(base64.b64decode(d['b64_json']))).convert('RGB')
        im = im.resize((gw, gh), Image.LANCZOS)
        f = out if n == 1 else f'{root}-{i + 1}{ext}'; im.save(f); print('saved', f)
    print(f'{time.time() - t0:.0f} s, {n} image(s), usage {json.dumps(r.get("usage", {}))}')
