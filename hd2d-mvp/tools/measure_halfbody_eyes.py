"""Measure where each waist-up portrait's eyes sit, by finding the officer's calm bust face in it, and write
the shift that puts them on the template's eye line (22% of the height) into assets/ai/halfbody/align.json.

  python3 hd2d-mvp/tools/measure_halfbody_eyes.py [--ids 1,2,3] [--keep] [--report OUT.png]

The bust (assets/ai/faces/<id>-calm.webp) has the same face drawn the same way; its eye-and-nose band is
matched over the upper half of the picture at a range of scales (FFT normalised cross-correlation, numpy
only). EYE_IN_BAND, where the eyes lie inside that band, was calibrated on the seven rulers aligned by eye.
--keep leaves existing align.json entries alone (hand-tuned ones); --report writes a contact sheet with the
found eye line drawn in, for checking.
"""
import argparse, json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

MVP = Path(__file__).resolve().parents[1]
SRC, OUT = MVP / 'assets/ai/halfbody/source', MVP / 'assets/ai/halfbody'
W, H, EYE = 768, 1152, 0.22
D = 4                                     # search at 1/4 resolution
BAND = (0.22, 0.28, 0.78, 0.62)           # the bust's eye-and-nose band (x0, y0, x1, y1) as fractions
EYE_IN_BAND = 0.36                        # eyes at this fraction of the band height (calibrated)

def gray(im): return np.asarray(im.convert('L'), dtype=np.float64)

def ncc(img, tpl):
    """Normalised cross-correlation of tpl over img (valid positions), via FFT and integral images."""
    th, tw = tpl.shape; ih, iw = img.shape
    t = tpl - tpl.mean(); tn = np.sqrt((t * t).sum()) or 1
    fs = (ih + th, iw + tw)
    corr = np.fft.irfft2(np.fft.rfft2(img, fs) * np.conj(np.fft.rfft2(t, fs)), fs)[:ih - th + 1, :iw - tw + 1]
    s = np.pad(img, ((1, 0), (1, 0))).cumsum(0).cumsum(1); s2 = np.pad(img * img, ((1, 0), (1, 0))).cumsum(0).cumsum(1)
    win = lambda S: S[th:, tw:] - S[:-th, tw:] - S[th:, :-tw] + S[:-th, :-tw]
    n = th * tw; var = win(s2) - win(s) ** 2 / n
    return corr / (np.sqrt(np.maximum(var, 1e-6)) * tn)

def content_top(pic):
    """First row where the figure (headwear, hair, plume) departs from the flat background, judged
    against each row's own edge colour over the central column where the template puts the head (weapons held
    at the side may run off the top edge; that is fine to cut)."""
    a = np.asarray(pic, dtype=np.float64); w = a.shape[1]; x0, x1 = int(w * 0.32), int(w * 0.68)
    edge = (a[:, :12].mean(1) + a[:, -12:].mean(1)) / 2
    diff = np.sqrt(((a[:, x0:x1] - edge[:, None]) ** 2).sum(2)) > 60
    rows = np.nonzero(diff.mean(1) > 0.08)[0]
    return int(rows[0]) if len(rows) else 0

CUT = 20  # at most this many pixels of the topmost content may leave the frame when a picture moves up

def measure(pid):
    pic = Image.open(SRC / f'{pid}.png').convert('RGB').resize((W, H), Image.LANCZOS)
    bust = Image.open(MVP / f'assets/ai/faces/{pid}-calm.webp').convert('RGB')
    bw, bh = bust.size; x0, y0, x1, y1 = [round(f * s) for f, s in zip(BAND, (bw, bh, bw, bh))]
    band = bust.crop((x0, y0, x1, y1))
    img = gray(pic.resize((W // D, H // D), Image.BOX))[: int(H // D * 0.55)]
    best = (-2, 0, 0, 1)
    for k in np.arange(0.18, 0.62, 0.02):          # band size relative to the 1/4-scale picture
        tw, th = max(8, round(band.width * k)), max(8, round(band.height * k))
        if th >= img.shape[0] or tw >= img.shape[1]: continue
        r = ncc(img, gray(band.resize((tw, th), Image.BOX)))
        y, x = np.unravel_index(np.argmax(r), r.shape)
        if r[y, x] > best[0]: best = (r[y, x], y, x, th)
    score, y, x, th = best
    eye = (y + th * EYE_IN_BAND) * D
    return pic, eye, score

ap = argparse.ArgumentParser(); ap.add_argument('--ids'); ap.add_argument('--keep', action='store_true'); ap.add_argument('--report')
a = ap.parse_args()
ids = a.ids.split(',') if a.ids else sorted((p.stem for p in SRC.glob('*.png')), key=int)
align = json.loads((OUT / 'align.json').read_text()) if (OUT / 'align.json').exists() else {}
rows = []
for pid in ids:
    if align.get(pid, {}).get('manual'):
        print(f'{pid:>4} manual dy {align[pid]["dy"]:+d}'); continue
    pic, eye, score = measure(pid)
    # Moving the picture up must not cut the headwear: cap the shift at the free margin above it.
    dy = max(round(EYE * H - eye), -(content_top(pic) - 8) - CUT)
    rows.append((pid, pic, eye, score, dy))
    print(f'{pid:>4} eyes {eye / H * 100:5.1f}%  match {score:.2f}  dy {dy:+d}{"  (kept)" if a.keep and pid in align else ""}')
    if not (a.keep and pid in align): align[pid] = {'dy': dy}
(OUT / 'align.json').write_text(json.dumps(dict(sorted(align.items(), key=lambda kv: int(kv[0]))), indent=1))
if a.report:
    t = 192; per = 12; sheet = Image.new('RGB', (t * min(per, len(rows)), int(t * 0.75) * ((len(rows) + per - 1) // per)))
    for i, (pid, pic, eye, score, dy) in enumerate(rows):
        sm = pic.crop((0, 0, W, int(H * 0.5))).resize((t, int(t * 0.75))); d = ImageDraw.Draw(sm)
        yy = eye / (H * 0.5) * sm.height; d.line([(0, yy), (t, yy)], fill='#ff3030'); d.text((4, 4), f'{pid} {score:.2f}', fill='#ffffff')
        sheet.paste(sm, ((i % per) * t, (i // per) * int(t * 0.75)))
    sheet.save(a.report); print('report →', a.report)
