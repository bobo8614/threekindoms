// The sound's own state, in Node with a stand-in AudioContext (nothing plays):
// - 声音 关 outlives a reload, as the volume and the music set do: 读取记录 reloads the page (WeaselHuang@bilibili).
// - ?mute (tools, tests) silences this page only and never writes the player's choice.
// - A context the system took away is started again by the next touch, whatever it calls the state: iOS Safari leaves a page
//   that comes back from the background 'interrupted', not 'suspended' (我还在线@bilibili).
// - Each scene's BGM has its own track in each music set: the 原版 set had no 君主选择 track, so choosing a ruler fell back to
//   the title's (2026-11-17).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.fetch = async () => ({ ok: true, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) });
class FakeCtx {
  constructor() { this.state = 'running'; this.resumes = 0; this.currentTime = 0; this.destination = {}; FakeCtx.last = this; }
  createGain() { return { gain: { value: 1, setTargetAtTime() {} }, connect: (x) => x }; }
  resume() { this.resumes++; this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
}
globalThis.AudioContext = FakeCtx;
const { Audio } = await import('../src/audio.js');

test('声音 关 is kept for the next page, and 开 again too', () => {
  mem.clear();
  const a = new Audio({}, {}); a.setMuted(true);
  assert.equal(new Audio({}, {}).muted, true, 'after a reload');
  new Audio({}, {}).setMuted(false);
  assert.equal(new Audio({}, {}).muted, false);
});

test('a muted page starts its context silent', () => {
  mem.clear();
  new Audio({}, {}).setMuted(true);
  const a = new Audio({}, {}); a.unlock();
  assert.equal(a.master.gain.value, 0);
});

test('?mute silences this page without writing the choice', () => {
  mem.clear();
  const a = new Audio({}, {}); a.setMuted(true, { keep: false });
  assert.equal(a.muted, true);
  assert.equal(new Audio({}, {}).muted, false, 'the next page without ?mute has its sound');
});

test('a touch starts again a context the system interrupted', () => {
  mem.clear();
  const a = new Audio({}, {}); a.unlock();
  const c = FakeCtx.last; c.state = 'interrupted'; const n = c.resumes;
  a.unlock();
  assert.equal(c.resumes, n + 1);
  assert.equal(c.state, 'running');
});

test('a running context is left alone', () => {
  mem.clear();
  const a = new Audio({}, {}); a.unlock();
  const c = FakeCtx.last, n = c.resumes; a.unlock();
  assert.equal(c.resumes, n);
});

test('every BGM plays its own track in each music set', () => {
  mem.clear();
  const m = JSON.parse(readFileSync(new URL('../assets/manifest.json', import.meta.url))).audio;
  const music = Object.fromEntries(Object.entries(m).filter(([k]) => k.startsWith('bgm-')).map(([k, v]) => [k, [].concat(v)]));
  const a = new Audio({}, music);
  assert.deepEqual(a.sets.map((t) => t.id), ['remix', 'original']);
  for (const { id } of a.sets) {
    a.setMusicSet(id);
    for (const k of Object.keys(music)) assert.equal(a.url(k), `assets/audio/${id}/${k}.mp3`, `${id} ${k}`);
  }
});
