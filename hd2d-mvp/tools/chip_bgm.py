"""Render the original BGM scores (tools/chip_scores.py) to seamless-loop audio.

  python3 hd2d-mvp/tools/chip_bgm.py [bgm-strategy ...] [--guide | --orch SOUNDFONT] [--wav]

Chip mode, after the FC + Namco 163 palette: two 32-step 4-bit wavetable voices (lead with a
dotted-eighth echo, counter-line), a 25 % pulse arpeggio on open fifths, a stepped triangle bass and
LFSR noise drums. Volumes step at 60 Hz in 16 levels, like the hardware.
Output: hd2d-mvp/assets/audio/<key>.chip.mp3 (listed first for that slot in assets/manifest.json).

--guide renders <key>.guide.mp3 instead: the melody alone on a smooth voice with erhu-style slides,
vibrato and slightly humanized timing over a light plucked bass, no drums, arpeggios or held drone. It is the audio
reference for gen_audio.mjs --ref, so the AI arrangement hears the tune, not a quantized groove.
--orch SOUNDFONT renders <key>.orch.mp3: the same score played by a small orchestra through
FluidSynth (flute or violin lead, horn counter-line, string chords, harp, pizzicato bass, timpani),
humanized. The AI conditioning copies a reference's timbre, so a thin synth guide gives a thin
result; an orchestral guide carries both the tune and the orchestra (gen_audio.mjs --guide orch).
Tested with MuseScore_General.sf3 (MIT, S. Christian Collins / FluidR3); keep the SoundFont out
of the repo.
Everything that rings past the end wraps to the start, so the files loop without a seam.
Needs numpy and ffmpeg; --orch also needs fluidsynth.
"""
import re, subprocess, sys, wave
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).parent))
from chip_scores import SCORES

SR = 44100
OUT = Path(__file__).resolve().parents[1] / 'assets/audio'
NOTE = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
QUAL = {'': (0, 4, 7), 'm': (0, 3, 7), '7': (0, 4, 7, 10)}

def midi(name):
    m = re.fullmatch(r'([A-G])(#|b)?(-?\d)', name)
    return 12 * (int(m[3]) + 1) + NOTE[m[1]] + {'#': 1, 'b': -1, None: 0}[m[2]]

def chord(name):
    m = re.fullmatch(r'([A-G][#b]?)(m|7)?', name)
    root = midi(m[1] + '3') % 12
    return [(root + i) % 12 for i in QUAL[m[2] or '']]

def wavetable(samples):  # 4-bit steps, centred, -1..1
    w = np.array(samples, float)
    return (np.round((w - w.min()) / (w.max() - w.min()) * 15) - 7.5) / 7.5

x = np.arange(32) / 32
WAVES = {
    'bright': wavetable(np.where(x < .5, x * 2, 0) * .7 + (x < .25) * .6),  # saw/pulse blend: reedy lead
    'soft': wavetable(np.sin(2 * np.pi * x) + .25 * np.sin(4 * np.pi * x)),   # flute-like
    'mellow': wavetable(np.abs(2 * x - 1) * 2 - 1 + .3 * np.sin(2 * np.pi * x)),
    'pulse': np.where(np.arange(8) < 2, 1.0, -1.0),                           # 25 % duty
    'tri': wavetable(np.abs(np.arange(32) - 15.5)),
}
rng = np.random.default_rng(7)
NOISE = rng.choice([-1.0, 1.0], SR)

def env(n, attack, decay, sustain, release, gate, stepped=True):
    """ADSR over n samples with the key held for gate samples; stepped = 60 Hz frames, 16 levels."""
    t = np.arange(n) / SR
    if stepped:
        t = np.floor(t * 60) / 60
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    d = sustain + (1 - sustain) * np.exp(-np.maximum(t - attack, 0) / max(decay, 1e-4))
    v = np.minimum(a, d)
    off = gate / SR
    rel = np.where(t > off, np.exp(-(t - off) / max(release, 1e-4)), 1)
    return np.round(v * rel * 15) / 15 if stepped else v * rel

def osc(table, hz, n, vibrato=0.0, glide_from=None, glide=.09):
    """Wavetable oscillator; a table of None plays a smooth sine-plus-overtones voice instead."""
    t = np.arange(n) / SR
    frames = t if table is None else np.floor(t * 60) / 60
    cents = vibrato * np.sin(2 * np.pi * 5.5 * frames) * np.clip((frames - .22) / .2, 0, 1)
    if glide_from:  # slide in from the previous note, like an erhu shift
        cents = cents + 1200 * np.log2(glide_from / hz) * np.clip(1 - t / glide, 0, 1) ** 2
    phase = np.cumsum(hz * 2 ** (cents / 1200)) / SR
    if table is None:
        w = 2 * np.pi * phase
        return (np.sin(w) + .35 * np.sin(2 * w) + .12 * np.sin(3 * w)) / 1.3
    return table[(np.floor(phase * len(table)) % len(table)).astype(int)]

class Mix:
    def __init__(self, n):
        self.buf = np.zeros((n, 2))

    def add(self, start, sig, vol, pan=0.0):
        idx = (start + np.arange(len(sig))) % len(self.buf)  # wrap tails for a seamless loop
        np.add.at(self.buf[:, 0], idx, sig * vol * (1 - max(pan, 0)))
        np.add.at(self.buf[:, 1], idx, sig * vol * (1 + min(pan, 0)))

def parse(line):
    out, t = [], 0.0
    for tok in line.replace('|', ' ').split():
        name, _, dur = tok.partition('/')
        dur = float(dur or 1)
        if name != 'r':
            out.append((t, dur, midi(name)))
        t += dur
    return out

def hz(m):
    return 440 * 2 ** ((m - 69) / 12)

def pentatonic(score):
    g = NOTE[score['gong']]
    return {(g + i) % 12 for i in (0, 2, 4, 7, 9)}

def counter_note(m, tones, penta):
    """Third, fourth or sixth under the lead that is both pentatonic and in the chord."""
    for d in (3, 4, 5, 8, 9):
        if (m - d) % 12 in tones and (m - d) % 12 in penta:
            return m - d
    return m - 12

def render_guide(score):
    beat = 60 / score['bpm']
    bars = [b for s in score['sections'] for b in s['bars']]
    mix = Mix(round(len(bars) * 4 * beat * SR))
    S = lambda beats: round(beats * beat * SR)
    jitter = np.random.default_rng(11)
    prev = None
    for bar0, (line, chords) in enumerate(bars):
        base = bar0 * 4
        for t, dur, m in parse(line):
            gate = S(dur) - S(.03)
            L = gate + S(.8)
            vel = .26 * (1 + jitter.uniform(-.12, .12)) * (1.1 if t == 0 else 1)
            slide = prev and abs(m - prev) <= 7 and jitter.random() < .55
            sig = osc(None, hz(m), L, vibrato=22, glide_from=hz(prev) if slide else None) * env(L, .04, 1.2, .7, .25, gate, stepped=False)
            start = S(base + t) + int(jitter.normal(0, .008) * SR)
            mix.add(start, sig, vel)
            mix.add(start + S(.75), sig, vel * .22, pan=.4)            # room echo
            prev = m
        for h, c in enumerate(chords.split()):                          # light plucked root-fifth bass, no held drone
            root = 38 + (chord(c)[0] - 2) % 12
            for i, m in enumerate((root, root + 7)):
                L = S(1.2)
                mix.add(S(base + h * 2 + i), osc(None, hz(m), L) * env(L, .005, .25, .0, .1, L, stepped=False), .13)
    out = mix.buf - mix.buf.mean(axis=0)
    return out / np.abs(out).max() * 10 ** (-1 / 20)

def render(score):
    beat, penta = 60 / score['bpm'], pentatonic(score)
    bars = [b for s in score['sections'] for b in s['bars']]
    n = round(len(bars) * 4 * beat * SR)
    mix = Mix(n)
    S = lambda beats: round(beats * beat * SR)
    bar0 = 0
    for sec in score['sections']:
        lead = WAVES['bright' if sec['lead'] == 'A' else 'soft']
        for line, chords in sec['bars']:
            halves = [chord(c) for c in chords.split()]
            base = bar0 * 4
            for t, dur, m in parse(line):
                gate = S(dur) - S(.06)
                L = gate + S(.6)
                e = env(L, .01, .9, .55, .12, gate)
                sig = osc(lead, hz(m), L, vibrato=18) * e
                mix.add(S(base + t), sig, .30)
                mix.add(S(base + t + .75), sig, .11, pan=.5)        # echo voice
                if sec['counter']:
                    c = counter_note(m, halves[int(t >= 2)], penta)
                    mix.add(S(base + t), osc(WAVES['mellow'], hz(c), L) * e, .14, pan=-.35)
            for h, tones in enumerate(halves):
                root = 50 + (tones[0] - 2) % 12                       # bass root around D3
                arp = [root + 12 + i for i in (0, 7, 12, 7, 0, 7, 14 if (root + 2) % 12 in penta else 12, 7)]
                for i, m in enumerate(arp):                            # 16th-note guzheng-style open fifths
                    L = S(.25)
                    mix.add(S(base + h * 2 + i * .25), osc(WAVES['pulse'], hz(m), L) * env(L, .002, .07, .25, .03, L), .07, pan=-.25)
                for i, m in enumerate((root - 12, root, root - 5, root)):  # bouncing 8th bass
                    L = S(.5)
                    mix.add(S(base + h * 2 + i * .5), osc(WAVES['tri'], hz(m), L) * env(L, .002, .3, .8, .02, L - S(.08)), .28)
            for b in range(4):                                         # drums
                k = S(.12)
                f = np.linspace(160, 45, k)
                kick = WAVES['tri'][(np.floor(np.cumsum(f) / SR * 32) % 32).astype(int)] * env(k, .001, .05, 0, .01, k)
                if b % 2 == 0:
                    mix.add(S(base + b), kick, .35)
                if b % 2 == 1 and sec['lead'] == 'A':
                    s = S(.14)
                    mix.add(S(base + b), NOISE[:s] * env(s, .001, .05, 0, .02, s), .13)
                for off in (0, .5):
                    h = S(.04)
                    mix.add(S(base + b + off), NOISE[::7][:h] * env(h, .001, .012, 0, .005, h), .045 if off else .03, pan=.2)
            bar0 += 1
    out = mix.buf - mix.buf.mean(axis=0)
    return out / np.abs(out).max() * 10 ** (-1 / 20)

def midi_file(tracks, bpm, ppq=480):
    """Type-1 SMF from {channel: (program, [(beat, beats, note, velocity), ...])}."""
    def vlq(n):
        out = [n & 0x7F]
        while n > 0x7F:
            n >>= 7; out.insert(0, (n & 0x7F) | 0x80)
        return bytes(out)
    def chunk(tag, data):
        return tag + len(data).to_bytes(4, 'big') + data
    tempo = round(60e6 / bpm).to_bytes(3, 'big')
    blobs = [chunk(b'MTrk', b'\x00\xff\x51\x03' + tempo + b'\x00\xff\x2f\x00')]
    for ch, (program, notes) in tracks.items():
        ev = [(0, 0, bytes([0xC0 | ch, program]))]
        for beat, beats, note, vel in notes:
            on, off = round(beat * ppq), round((beat + beats) * ppq)
            ev += [(max(on, 0), 1, bytes([0x90 | ch, note, vel])), (max(off, 1), 0, bytes([0x80 | ch, note, 0]))]
        ev.sort(key=lambda e: (e[0], e[1]))
        data, t = b'', 0
        for tick, _, msg in ev:
            data += vlq(tick - t) + msg; t = tick
        blobs.append(chunk(b'MTrk', data + b'\x00\xff\x2f\x00'))
    return chunk(b'MThd', (1).to_bytes(2, 'big') + len(blobs).to_bytes(2, 'big') + ppq.to_bytes(2, 'big')) + b''.join(blobs)

def render_orch(score, soundfont):
    beat, penta = 60 / score['bpm'], pentatonic(score)
    rnd = np.random.default_rng(5)
    hum = lambda b: b + rnd.normal(0, .012 / beat)               # ~12 ms timing spread
    vel = lambda v: int(np.clip(v + rnd.integers(-8, 9), 1, 127))
    T = {0: (73, []), 1: (40, []), 2: (60, []), 3: (48, []), 4: (46, []), 5: (45, []), 6: (47, []), 9: (0, [])}
    bar0 = 0
    for sec in score['sections']:
        loud = sec['lead'] == 'A'
        for line, chords in sec['bars']:
            base = bar0 * 4
            halves = [chord(c) for c in chords.split()]
            for t, dur, m in parse(line):                         # lead: flute (dizi), violin (erhu) in B / doubling
                if loud:
                    T[0][1].append((hum(base + t), dur * .95, m, vel(96 if t == 0 else 86)))
                if not loud or sec['counter']:
                    T[1][1].append((hum(base + t), dur * .97, m - (12 if loud else 0), vel(84 if not loud else 66)))
                if sec['counter']:
                    T[2][1].append((hum(base + t), dur * .95, counter_note(m, halves[int(t >= 2)], penta) - 12, vel(64)))
            for h, tones in enumerate(halves):
                root = 50 + (tones[0] - 2) % 12
                for n in sorted({root - 12 + (x - tones[0]) % 12 + 12 for x in tones}):   # string chord around D3–D4
                    T[3][1].append((base + h * 2, 2, n, vel(58 if loud else 50)))
                harp = (0, 7, 12, 14 if (root + 2) % 12 in penta else 12)
                for i, d in enumerate(harp):                      # harp 8ths, an upper run in loud bars
                    T[4][1].append((hum(base + h * 2 + i * .5), .5, root + 12 + d, vel(62)))
                    if loud:
                        T[4][1].append((hum(base + h * 2 + 1 + i * .25), .25, root + 24 + d, vel(40)))
                for i, d in enumerate((0, 7)):                    # pizzicato bass on the beat
                    T[5][1].append((hum(base + h * 2 + i), .9, root - 12 + d, vel(80)))
                T[6][1].append((base + h * 2, 1, root - 12 if root - 12 >= 41 else root, vel(78 if loud else 55)))  # timpani
            if loud:                                              # light orchestral kit: bass drum, snare backbeat
                for b in range(4):
                    T[9][1].append((hum(base + b), .5, 36 if b % 2 == 0 else 38, vel(60 if b % 2 == 0 else 38)))
            bar0 += 1
        T[9][1].append((bar0 * 4 - len(sec['bars']) * 4, 2, 49, vel(70)))   # cymbal at each section start
    total = bar0 * 4 * beat
    import tempfile
    with tempfile.TemporaryDirectory() as tmp:
        mid, wav = Path(tmp) / 'g.mid', Path(tmp) / 'g.wav'
        mid.write_bytes(midi_file(T, score['bpm']))
        subprocess.run(['fluidsynth', '-ni', '-q', '-g', '0.5', '-r', str(SR), '-o', 'synth.reverb.room-size=0.75', '-o', 'synth.reverb.level=0.6',
                        '-o', 'synth.reverb.width=1', '-T', 'wav', '-F', str(wav), soundfont, str(mid)], check=True)
        with wave.open(str(wav)) as w:
            pcm = np.frombuffer(w.readframes(w.getnframes()), '<i2').reshape(-1, w.getnchannels()).astype(float) / 32768
    n = round(total * SR)
    out = pcm[:n].copy()
    tail = pcm[n:]
    out[:len(tail)] += tail[:n]                                   # fold the reverb tail into the start
    out -= out.mean(axis=0)
    return out / np.abs(out).max() * 10 ** (-1 / 20)

def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    sf = sys.argv[sys.argv.index('--orch') + 1] if '--orch' in sys.argv else None
    args = [a for a in args if a != sf]
    kind = 'orch' if sf else 'guide' if '--guide' in sys.argv else 'chip'
    for key in args or SCORES:
        pcm = render_orch(SCORES[key], sf) if sf else (render_guide if kind == 'guide' else render)(SCORES[key])
        wav = OUT / f'{key}.{kind}.wav'
        with wave.open(str(wav), 'wb') as w:
            w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
            w.writeframes((pcm * 32767).astype('<i2').tobytes())
        mp3 = OUT / f'{key}.{kind}.mp3'
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(wav), '-b:a', '192k', str(mp3)], check=True)
        if '--wav' not in sys.argv:
            wav.unlink()
        print('ok', key, f'{len(pcm) / SR:.1f}s ->', mp3.relative_to(OUT.parents[1]))

if __name__ == '__main__':
    main()
