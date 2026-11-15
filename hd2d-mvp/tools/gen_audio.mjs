// Generate the remake's BGM and SFX with ElevenLabs, from text prompts only.
//   ELEVENLABS_API_KEY=... node hd2d-mvp/tools/gen_audio.mjs [key ...] [--dry-run] [--force] [--model music_v1] [--tag t]
//     [--ref [--strength high] [--guide guide|orch]]
// BGM: POST /v1/music (composition_plan, model_id); needs a paid plan. With --ref (music_v2 / v2_5
// only) the key's own melody guide, assets/audio/<key>.<guide>.mp3 from chip_bgm.py --guide or --orch, is sent
// to POST /v1/music/upload and each plan section is conditioned on the same span of the guide, so
// the arrangement follows our tune. Only guides rendered from tools/chip_scores.py may be uploaded.
// SFX: POST /v1/sound-generation (text, duration_seconds 0.5–30, prompt_influence, loop, model_id).
// Key scopes: music_generation + sound_generation. Output: hd2d-mvp/assets/audio/<key>.mp3, which
// manifest.json prefers over the local original-game placeholders; existing files are skipped
// unless --force; --tag t writes <key>.t.mp3 instead, for side-by-side candidates. Each request and its response ids are appended to assets/audio/generated.json.
//
// The prompts take only scene, mood, tempo and phrase structure from the original cues (measured with
// librosa on reference-assets/music/repaired-experimental/previews; numbers in the `orig` notes). No
// original audio, melody or title is sent, and none may be: the new pieces must stand on their own.
import { writeFile, readFile, mkdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../assets/audio');
const LOG = join(OUT, 'generated.json');
const API = 'https://api.elevenlabs.io/v1';

// What made the original cues stick (measured on the local renders): a short 2–4 bar hook that
// returns almost exactly (beat-chroma self-similarity 0.8–0.98) in a 30–50 s loop. We keep that shape
// but not the original's western diatonic idiom: the target is a live-sounding HD-2D era orchestral
// score with a Three Kingdoms voice (pentatonic melody, Chinese soloists, no MIDI or chiptune feel).
// BGM is therefore sent as a composition plan (A A' B A sections) rather than a free prompt.
const GLOBAL = ['instrumental video game soundtrack', 'modern cinematic symphonic game score, HD-2D era JRPG',
  'large symphony orchestra recorded on a scoring stage: full string section, French horns, trumpets, trombones, timpani, cymbals, harp, celesta',
  'epic Three Kingdoms ancient China atmosphere', 'Chinese pentatonic melody, no western leading-tone cadences',
  'melody-first: one clear, singable, memorable lead melody built on a short motif that returns often',
  'featured Chinese soloists over the orchestra: erhu and dizi with slides, grace notes and vibrato, pipa and guzheng, tanggu and gongs',
  'polished modern production: wide stereo, bright detailed highs, deep low end, lush hall reverb', 'original composition'];
const NEGATIVE = ['vocals', 'choir lyrics', 'MIDI sound', 'General MIDI', 'quantized robotic timing', 'chiptune', '8-bit', 'synthesizer',
  'retro game music', 'small ensemble', 'thin arrangement', 'lo-fi', 'narrow mono mix',
  'ambient drone', 'static held bass pad', 'dark muffled mix', 'meandering texture without a tune', 'long intro', 'fade out', 'sound effects'];
// Busy, layered and rhythmic, never a sparse pad (what the user liked in bgm-strategy.hd2-high), but
// voiced for the full symphony: that take copied the guide's thin timbre (centroid 869 Hz, no energy
// above 4 kHz) because it was conditioned at 'high', so the orchestra has to be asked for explicitly.
const DENSE = 'dense symphonic arrangement: several counter-lines at once, string ostinato and harp or guzheng runs, brass swells, driving timpani and percussion';
const bars = (bpm, n) => Math.min(120000, Math.max(3000, Math.round(n * 4 * 60000 / bpm)));

// sections: [name, bars, local styles] and must match tools/chip_scores.py, whose guide the --ref
// sections condition on; the first section states the hook at once, the last returns to it and
// cadences back into the first, so the file loops. avoid: extra negative styles for that track.
export const BGM = {
  'bgm-title': { orig: 'NSF1 ~49s, ~100 bpm, minor, sparse 1.5 onsets/s, 8-beat motif, wide leaps', bpm: 100, avoid: ['sparse arrangement'],
    styles: ['title theme of a Three Kingdoms war game', 'grand, solemn, heroic', 'A yu pentatonic mode', '100 bpm', DENSE, 'broad war drums and gongs, horns'],
    sections: [['Main theme', 8, ['dizi states the heroic main motif over war drums and a rolling guzheng ostinato']],
      ['Main theme answered', 8, ['erhu and horns repeat the motif higher, strings add a counter-line, drums build']],
      ['Bridge', 8, ['lyrical erhu passage over moving pizzicato strings and pipa, lighter drums']],
      ['Main theme return', 8, ['full orchestra with dizi and erhu brings the motif back with gongs, cadence leads back to the start']]] },
  'bgm-strategy': { orig: 'NSF3 ~37s, ~112 bpm, major, busy 6 onsets/s, 16-beat phrase repeats (0.96), bright', bpm: 112, avoid: ['sparse arrangement'],
    styles: ['strategy map theme while governing cities in the Three Kingdoms', 'hopeful, noble, lively, catchy', 'D gong pentatonic', '112 bpm', DENSE,
      'busy 16th-note guzheng and pipa ostinato, pizzicato strings, walking bass, snare and tanggu groove on every bar'],
    sections: [['Theme A', 8, ['dizi plays the catchy pentatonic hook with grace notes over the busy guzheng ostinato and drums, then restates it higher']],
      ['Theme A variation', 8, ['erhu takes the hook with slides, horns and strings answer with a counter-melody, drums build']],
      ['Theme B', 8, ['yu-mode passage, erhu and strings sing in harmony over moving pizzicato and lighter drums']],
      ['Theme A return', 8, ['full orchestra, dizi and erhu bring the hook back with fast ornamented runs, ends on a cadence that leads back to the start']]] },
  'bgm-battle': { orig: 'NSF4 ~39s, ~100 bpm, minor, driving 4.9 onsets/s, short repeated motif', bpm: 100, avoid: ['sparse arrangement'],
    styles: ['war map march while armies manoeuvre', 'tense, determined, marching', 'E yu pentatonic mode', '100 bpm', DENSE,
      'snare and tanggu march on every beat, low string ostinato, horn calls'],
    sections: [['March theme', 8, ['suona states the dotted, punchy march motif over snare and tanggu']],
      ['March theme answered', 8, ['horns and erhu answer the motif higher, strings drive 8th notes, drums intensify']],
      ['Bridge', 8, ['strings and pipa climb in a tense sequence, dizi counter-line, taiko rolls']],
      ['March theme return', 8, ['motif returns tutti with gongs, cadence leads back to the start']]] },
  'bgm-skirmish': { orig: 'NSF5 ~32s, ~152 bpm, minor, fast, 8-beat motif, mostly stepwise lead', bpm: 152, avoid: ['sparse arrangement'],
    styles: ['close-quarters infantry and cavalry clash', 'fast, furious, exciting', 'B yu pentatonic mode', '152 bpm', DENSE,
      'galloping tanggu and taiko, staccato strings, pipa tremolo'],
    sections: [['Battle riff', 8, ['suona and dizi play the fast stepwise riff over galloping drums']],
      ['Battle riff repeated', 8, ['riff repeats with pipa doubling and a string counter-line, gong accents']],
      ['Climb', 8, ['rising sequence on strings and erhu, drums build, tension rises']],
      ['Battle riff return', 8, ['riff returns tutti, cadence leads back to the start']]] },
  'bgm-duel': { orig: 'NSF6 ~41s, ~100 bpm, major-leaning, 10-beat phrase, mostly stepwise lead', bpm: 100, avoid: ['sparse arrangement'],
    styles: ['one-on-one duel between two legendary generals on horseback', 'heroic, dramatic, rousing', 'G gong pentatonic with E yu turns', '100 bpm', DENSE,
      'pounding tanggu, pipa tremolo, string ostinato'],
    sections: [['Duel theme', 8, ['erhu plays the heroic stepwise theme over pounding drums and pipa tremolo']],
      ['Duel theme answered', 8, ['dizi answers the erhu as if duelling, call and response, horns underneath']],
      ['Clash', 8, ['tense E yu passage, strings and drums trade blows with sharp accents']],
      ['Duel theme return', 8, ['theme returns triumphant tutti, cadence leads back to the start']]] },
  'bgm-result': { orig: 'NSF7 ~39s, ~150 bpm feel, major, sparse 2.5 onsets/s, long 32-beat phrase', bpm: 150,
    styles: ['battle aftermath, tallying captured officers and spoils', 'relieved, dignified, warm', 'C gong pentatonic', '150 bpm pulse under a slow singing melody',
      'flowing guzheng arpeggios, light pizzicato, soft hand drums'],
    sections: [['Theme', 16, ['erhu sings the slow, memorable melody over flowing guzheng arpeggios']],
      ['Theme return', 16, ['dizi and strings take the melody with a horn counter-line, cadence leads back to the start']]] },
  'bgm-gameover': { orig: 'NSF8 ~52s, ~76 bpm, sparse, 16-beat phrase, wide leaps', bpm: 76,
    styles: ['game over, the realm has fallen', 'slow, sorrowful lament', 'D yu pentatonic mode', '76 bpm', 'intimate, spacious texture'],
    sections: [['Lament', 8, ['solo erhu sings the slow lament with slides over soft strings and guzheng']],
      ['Lament answered', 8, ['dizi takes the lament an octave higher, distant gong, ends softly leading back to the start']]] },
  'bgm-ending': { orig: 'NSF9 ~43s, ~112 bpm, major, triumphant, 8-beat motif, wide register', bpm: 112, avoid: ['sparse arrangement'],
    styles: ['ending theme after unifying China', 'triumphant, moving, beautiful', 'A gong pentatonic', '112 bpm', DENSE, 'full orchestra, suona fanfares'],
    sections: [['Ending theme', 8, ['dizi states the soaring theme over guzheng ostinato and strings']],
      ['Ending theme grows', 8, ['full orchestra and suona fanfares carry the theme higher, drums build']],
      ['Reflection', 8, ['gentler guzheng and erhu interlude over pizzicato, nostalgic']],
      ['Finale', 8, ['theme returns tutti with gongs, broad cadence that leads back to the start']]] },
};

// music_v1 takes a MusicPrompt with sections; music_v2* take chunks.
const plan = (c, v1, ref, strength) => v1
  ? { positive_global_styles: [...GLOBAL, ...c.styles], negative_global_styles: [...NEGATIVE, ...c.avoid || []],
      sections: c.sections.map(([name, n, st]) => ({ section_name: name, positive_local_styles: st, negative_local_styles: [], duration_ms: bars(c.bpm, n), lines: [] })) }
  : { chunks: c.sections.map(([name, n, st], i) => {
      // ranges in the guide, floored so the last one never runs past the rendered file
      const beatsBefore = c.sections.slice(0, i).reduce((sum, [, m]) => sum + m * 4, 0), msPerBeat = 60000 / c.bpm;
      const at = Math.floor(beatsBefore * msPerBeat), end = Math.floor((beatsBefore + n * 4) * msPerBeat), duration_ms = bars(c.bpm, n);
      return { text: `[${name}] {instrumental}`, duration_ms, positive_styles: i ? st : [...GLOBAL, ...c.styles, ...st], negative_styles: [...NEGATIVE, ...c.avoid || []],
        ...ref && { conditioning_ref: { song_id: ref, range: { start_ms: at, end_ms: end } }, condition_strength: strength } };
    }) };

export const SFX = {
  'sfx-select': { orig: 'slot30 0.3s, noisy rising chirp', duration_seconds: 0.5,
    text: 'Short bright UI confirm sound: a crisp wooden tap with a quick rising pluck, dry, no reverb' },
  'sfx-cancel': { orig: 'slot29 0.14s, tonal falling blip', duration_seconds: 0.5,
    text: 'Short UI cancel sound: a soft falling pluck on a muted string, dry, no reverb' },
  'sfx-step': { orig: 'slot31 0.2s, short noisy tick', duration_seconds: 0.5,
    text: 'Single quick march step of an armoured soldier on dirt, short and tight, light armour jingle' },
  'sfx-clash': { orig: 'slot32 0.44s, noise burst peaking at 0.16s', duration_seconds: 1,
    text: 'Ancient Chinese battle: bronze halberd and sword clash with a shield hit, close and punchy, short tail' },
  // The 单挑 sounds (sfx-duel-*) and sfx-volley-land are the original's own (tools/original_audio_placeholders.py) or audio.js stand-ins.
  'sfx-horn': { orig: 'slot21 1.8s, bright major phrase ~152 bpm', duration_seconds: 2.5,
    text: 'Battle start signal: a short bright fanfare on ancient Chinese war horn and suona over a big war drum hit, outdoor echo' },
  // 爆炎 (no cue in the original, which plays the battle's own hit): the remake's thrown bomb going off (2026-11-07)
  'sfx-blast': { orig: 'none', duration_seconds: 2.5,
    text: 'A black-powder bomb explodes on an ancient battlefield: the blast starts at once with a sharp crack and a deep boom, then a rolling fire whoosh and falling dirt and debris, outdoor echo, short tail' }, // played the moment it bursts: no fuse before the boom
  'sfx-victory': { orig: 'slot20 7.3s result jingle, ~118 bpm', duration_seconds: 4,
    text: 'Short resolute victory fanfare on suona and brass with gongs and a final drum hit, video game result sting' },
};

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i < 0 ? d : args.splice(i, 2)[1]; };
const flag = (n) => { const i = args.indexOf(n); return i >= 0 && !!args.splice(i, 1); };
const model = opt('--model', 'music_v1'), tag = opt('--tag', ''), strength = opt('--strength', 'high'), guideKind = opt('--guide', 'guide');
const dry = flag('--dry-run'), force = flag('--force'), useRef = flag('--ref');
if (useRef && model === 'music_v1') { console.error('--ref needs --model music_v2 or music_v2_5'); process.exit(1); }
const want = args;
const key = process.env.ELEVENLABS_API_KEY;
if (!key && !dry) { console.error('ELEVENLABS_API_KEY is not set (scopes: music_generation, sound_generation)'); process.exit(1); }

const jobs = [
  ...Object.entries(BGM).map(([name, c]) => [name, c, 'music', { model_id: model }]),
  ...Object.entries(SFX).map(([name, c]) => [name, c, 'sound-generation', { model_id: 'eleven_text_to_sound_v2', prompt_influence: 0.6, text: c.text, duration_seconds: c.duration_seconds }]),
].filter(([name]) => !want.length || want.includes(name));

await mkdir(OUT, { recursive: true });
const log = await readFile(LOG, 'utf8').then(JSON.parse, () => []);
const exists = (p) => access(p).then(() => true, () => false);
// Upload our own melody guide; the returned song_id is what plan sections condition on. An upload
// costs as much as a generation, so an unchanged guide (same SHA-256) reuses the logged song_id.
async function upload(guide) {
  const sha = createHash('sha256').update(await readFile(guide)).digest('hex');
  const seen = log.findLast((e) => e.reference_sha256 === sha && e.upload_song_id);
  if (seen) return [seen.upload_song_id, sha];
  const fd = new FormData();
  fd.append('file', new Blob([await readFile(guide)], { type: 'audio/mpeg' }), guide.split('/').pop());
  const res = await fetch(`${API}/music/upload`, { method: 'POST', headers: { 'xi-api-key': key }, body: fd });
  if (!res.ok) throw new Error(`upload ${res.status} ${await res.text()}`);
  return [(await res.json()).song_id, sha];
}

for (const [name, c, endpoint, body] of jobs) {
  const file = join(OUT, `${name}${tag && `.${tag}`}.mp3`);
  if (!force && await exists(file)) { console.log('skip', name, '(exists; --force to redo)'); continue; }
  let ref = null, sha;
  if (endpoint === 'music') {
    const guide = join(OUT, `${name}.${guideKind}.mp3`);
    if (useRef && !await exists(guide)) { console.error('skip', name, '(no guide; run chip_bgm.py --guide)'); continue; }
    if (useRef) [ref, sha] = dry ? ['<upload song_id>'] : await upload(guide);
    body.composition_plan = plan(c, model === 'music_v1', ref, strength);
    if (ref) body.reference = `${name}.${guideKind}.mp3`;
  }
  if (dry) { console.log(`POST ${API}/${endpoint}`, JSON.stringify(body)); continue; }
  const { reference, ...payload } = body;
  const res = await fetch(`${API}/${endpoint}?output_format=mp3_44100_128`, {
    method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  if (!res.ok) { console.error('fail', name, res.status, await res.text()); continue; }
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
  const log = await readFile(LOG, 'utf8').then(JSON.parse, () => []);  // re-read: another run may have appended
  log.push({ name, file: file.slice(OUT.length + 1), endpoint, body: payload, reference, reference_sha256: sha, upload_song_id: ref || undefined, orig_features: c.orig, song_id: res.headers.get('song-id'), request_id: res.headers.get('request-id'), at: new Date().toISOString() });
  await writeFile(LOG, JSON.stringify(log, null, 1) + '\n');
  console.log('ok', name);
}
