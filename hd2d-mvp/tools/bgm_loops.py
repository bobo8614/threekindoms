"""Find seamless loop points for every BGM file and write hd2d-mvp/assets/audio/loops.json.

  python3 hd2d-mvp/tools/bgm_loops.py [--audition DIR]

The remix and generated tracks are finished songs (soft intro, fade-out tail); the original NSF renders are
cut at a flat 120 s, mid-phrase. Looping either whole file (HTMLAudio loop=true) leaves a fade, a gap or a
jump every couple of minutes. For each file this tracks the beat, then tries every pair of beats A < B a
whole number of bars apart (loop >= 40 s, inside the un-faded body) and keeps the pair whose 16 beats either
side match best in harmony (beat-synchronous chroma) and sound (log-band spectra), with only a slight lean
towards longer loops: the ear judged a tight 50 s loop at the song's own section repeat smoother than a 100 s
one that only nearly matched (remix strategy, 2026-10-28). The cut sits just before the shared beat, with an
80 ms equal-power blend that ends as the note starts. A song with nothing close to a repeat instead fades its
last 1.2 s under its untouched opening ('head'). src/audio.js plays x[0:B] + blend(x[B:B+X] out, x[A:A+X] in)
and loops [A+X, B+X].
--audition writes each seam as a stereo wav, 10 s either side of the cut, for listening (never in dev runs).
"""
import json, subprocess, sys
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
AUDIO = ROOT / 'assets/audio'
OUT = AUDIO / 'loops.json'
SR = 22050
CTX = 16               # beats compared on each side of a candidate cut
MIN_LOOP = 40.0        # s; shorter loops repeat too often to sit under hours of play
XF = 0.08              # s; blend at a shared attack
XF_HEAD = 1.2          # s; tail of the song fading under its own opening (start untouched)


def decode(path, sr=SR):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-ac', '1', '-ar', str(sr), '-f', 'f32le', '-'],
                         check=True, capture_output=True).stdout
    return np.frombuffer(raw, np.float32).copy()


def bands(x, n=2048, hop=512, nb=48):
    win = np.hanning(n).astype(np.float32)
    frames = np.lib.stride_tricks.sliding_window_view(x, n)[::hop] * win
    mag = np.abs(np.fft.rfft(frames, axis=1))
    freqs = np.fft.rfftfreq(n, 1 / SR)
    edges = np.geomspace(60, 10000, nb + 1)
    idx = np.digitize(freqs, edges) - 1
    out = np.zeros((len(mag), nb), np.float32)
    for b in range(nb): out[:, b] = mag[:, idx == b].sum(1)
    return np.log1p(out * 10), hop / SR


def fade_start(x):
    # Last point where the 1 s RMS is within 6 dB of the track's typical level; tails below that are the fade.
    hop = SR // 10
    rms = np.sqrt(np.convolve(x ** 2, np.ones(SR) / SR, 'same')[::hop] + 1e-12)
    db = 20 * np.log10(rms)
    ref = np.median(db[len(db) // 4: 3 * len(db) // 4])
    loud = np.nonzero(db > ref - 6)[0]
    return min(len(x) / SR, loud[-1] * hop / SR)


def onset(x, hop=256):
    F, _ = bands(x, 1024, hop, 32)
    return np.maximum(0, np.diff(F, axis=0)).sum(1), hop / SR


def ncc(u, v):
    u = u - u.mean(); v = v - v.mean()
    return float(u @ v / (np.linalg.norm(u) * np.linalg.norm(v) + 1e-9))


def chroma(x, n=8192, hop=512):
    win = np.hanning(n).astype(np.float32)
    frames = np.lib.stride_tricks.sliding_window_view(x, n)[::hop] * win
    mag = np.abs(np.fft.rfft(frames, axis=1))
    f = np.fft.rfftfreq(n, 1 / SR)
    sel = (f > 60) & (f < 2500)
    pc = (np.round(12 * np.log2(f[sel] / 440)) % 12).astype(int)
    out = np.zeros((len(mag), 12), np.float32)
    for k in range(12): out[:, k] = mag[:, sel][:, pc == k].sum(1)
    return unit(np.log1p(out)), hop / SR


def unit(m): return m / (np.linalg.norm(m, axis=1, keepdims=True) + 1e-9)


def beats(x):
    # Beat period from the onset autocorrelation (75–200 bpm), then a grid that snaps to the nearest onset
    # peak each beat so it follows a performance that drifts.
    o, dt = onset(x)
    oc = o - o.mean()
    step = max((ncc(oc[:-l], oc[l:]), l) for l in range(round(0.3 / dt), round(0.8 / dt)))[1]
    t = max(range(step), key=lambda i: o[i::step].sum()) * dt
    w, out = round(0.06 / dt), []
    while t < len(o) * dt - 0.1:
        i = round(t / dt)
        j = i - w + int(np.argmax(o[i - w: i + w + 1])) if i > w else i
        out.append(j * dt); t = j * dt + step * dt
    return np.array(out), step * dt


def per_beat(m, mdt, bt):
    return unit(np.array([m[round(bt[i] / mdt): max(round(bt[i] / mdt) + 1, round(bt[i + 1] / mdt))].mean(0) for i in range(len(bt) - 1)]))


def analyse(path):
    x = decode(path)
    total = len(x) / SR
    body = fade_start(x) - 0.5
    bt, T = beats(x)
    F, fdt = bands(x)
    C, cdt = chroma(x)
    Cb, Fb = per_beat(C, cdt, bt), per_beat(F - F.mean(1, keepdims=True), fdt, bt)
    last = min(len(Cb) - CTX, int(np.searchsorted(bt, body - XF - 0.2)) - CTX)
    best = None
    for j in range(CTX, last):
        i = np.arange(CTX, j - int(MIN_LOOP / T) + 1)
        i = i[(j - i) % 4 == 0]   # whole bars, so the cut lands on the same beat of the bar
        if not len(i): continue
        k = np.arange(-CTX, CTX)
        hc = (Cb[i[:, None] + k] * Cb[j + k]).sum(2).mean(1)
        sp = (Fb[i[:, None] + k] * Fb[j + k]).sum(2).mean(1)
        score = 0.6 * hc + 0.4 * sp
        val = score + 0.02 * (bt[j] - bt[i]) / total
        n = int(np.argmax(val))
        if best is None or val[n] > best[0]: best = (val[n], score[n], hc[n], sp[n], i[n], j)
    info = {'total': total, 'body': body, 'bpm': 60 / T}
    if best is None or best[1] < 0.85:
        # Nothing in the song repeats closely: close the whole body onto the opening instead.
        return {'start': 0.0, 'end': round(body - XF_HEAD, 5), 'xfade': XF_HEAD, 'head': True}, {**info, 'how': 'head', 'score': best[1] if best else 0, 'harmony': 0, 'sound': 0}
    _, score, hc, sp, i, j = best
    edge = lambda t: round(float(t) - XF - 0.005, 5)
    return {'start': edge(bt[i]), 'end': edge(bt[j]), 'xfade': XF}, {**info, 'how': 'bars', 'score': score, 'harmony': hc, 'sound': sp}


def audition(path, loop, out):
    sr = 44100
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-ac', '2', '-ar', str(sr), '-f', 'f32le', '-'], check=True, capture_output=True).stdout
    x = np.frombuffer(raw, np.float32).reshape(-1, 2)
    a, b, xf = (round(loop[k] * sr) for k in ('start', 'end', 'xfade'))
    t = np.linspace(0, np.pi / 2, xf)[:, None]
    blend = x[b: b + xf] * np.cos(t) + x[a: a + xf] * (1 if loop.get('head') else np.sin(t))
    m = 10 * sr
    seam = np.concatenate([x[max(0, b - m): b], blend, x[a + xf: a + xf + m]]).astype(np.float32)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(sr), '-ac', '2', '-i', '-', str(out)], input=seam.tobytes(), check=True)


def main():
    aud = Path(sys.argv[sys.argv.index('--audition') + 1]) if '--audition' in sys.argv else None
    if aud: aud.mkdir(parents=True, exist_ok=True)
    loops = json.loads(OUT.read_text()) if OUT.exists() else {}
    for path in sorted([*AUDIO.glob('bgm-*.mp3'), *AUDIO.glob('original/bgm-*.mp3'), *AUDIO.glob('remix/bgm-*.mp3')]):
        key = str(path.relative_to(ROOT))
        loop, info = analyse(path)
        loops[key] = loop
        print(f"{key:42s} {info['total']:6.1f}s body {info['body']:6.1f}  loop {loop['start']:7.3f}→{loop['end']:7.3f}"
              f"  {info['how']:5s} {info['bpm']:5.1f}bpm  score {info['score']:.3f} harmony {info['harmony']:.3f} sound {info['sound']:.3f}")
        if aud: audition(path, loop, aud / (path.relative_to(AUDIO).with_suffix('').as_posix().replace('/', '_') + '.wav'))
    OUT.write_text(json.dumps(dict(sorted(loops.items())), indent=1, ensure_ascii=False) + '\n')


if __name__ == '__main__':
    main()
