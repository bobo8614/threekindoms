// A quick record must never take a numbered record's place, even when a write fails.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as G from '../src/core/game.js';

G.setData(JSON.parse(readFileSync(new URL('../data/game-data.json', import.meta.url))));
const store = new Map();
let failKey = null;
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (k) => store.has(k) ? store.get(k) : null,
  setItem: (k, v) => { if (k === failKey) throw new Error('storage full'); store.set(k, String(v)); },
  removeItem: (k) => store.delete(k),
} });
beforeEach(() => { store.clear(); failKey = null; });

const KEY = 'haou-hd2d-save:quick';

test('quick saving leaves all numbered records and the current numbered slot alone', () => {
  const g = G.newGame(4, 1, 123);
  g.books = 3;
  assert.equal(G.save(g, 2), true);
  const numbered = store.get('haou-hd2d-save:2');
  g.year = 195;
  assert.equal(G.saveQuick(g), true);
  assert.equal(g.slot, 2);
  assert.equal(g.books, 3);
  assert.equal(store.get('haou-hd2d-save:2'), numbered);
  assert.equal(G.saves().filter(Boolean).length, 1);
  const quick = G.loadQuick();
  assert.equal(quick.year, 195);
  assert.equal(quick.slot, null, 'an old numbered slot must not be silently overwritten after loading');
  assert.equal(quick.quickId, g.quickId);
});

test('a corrupt quick record falls back to the previous valid quick record', () => {
  const g = G.newGame(4, 1, 123);
  g.year = 191; assert.equal(G.saveQuick(g), true);
  g.year = 192; assert.equal(G.saveQuick(g), true);
  store.set(KEY, '{');
  const quick = G.loadQuick();
  assert.equal(quick.year, 191);
  assert.equal(G.restored(quick), true);
  store.delete(KEY);
  assert.equal(G.loadQuick(), null, 'an empty slot must not resurrect its backup');
});

test('a newer-version quick record is not mistaken for damage and silently replaced by its backup', () => {
  const g = G.newGame(4, 1, 123);
  assert.equal(G.saveQuick(g), true);
  assert.equal(G.saveQuick(g), true);
  store.set(KEY, JSON.stringify({ ...g, version: G.SAVE_VERSION + 1 }));
  assert.equal(G.hasQuick(), true);
  assert.equal(G.loadQuick(), null);
});

test('a syntactically valid quick record with an invalid player falls back to its safe backup', () => {
  const g = G.newGame(4, 1, 123);
  g.year = 190; assert.equal(G.saveQuick(g), true);
  g.year = 191; assert.equal(G.saveQuick(g), true);
  store.set(KEY, JSON.stringify({ ...g, player: 999 }));
  const quick = G.loadQuick();
  assert.equal(quick.year, 190);
  assert.equal(G.restored(quick), true);
});

test('a quick record with a missing referenced officer falls back before the game can be opened', () => {
  const g = G.newGame(4, 1, 123);
  g.year = 190; assert.equal(G.saveQuick(g), true);
  g.year = 191; assert.equal(G.saveQuick(g), true);
  const bad = JSON.parse(store.get(KEY));
  const city = bad.cities[bad.factions[bad.player].city];
  const id = city.officers.find((i) => i !== bad.factions[bad.player].ruler);
  assert.notEqual(id, undefined);
  bad.officers[id] = null;
  store.set(KEY, JSON.stringify(bad));
  const quick = G.loadQuick();
  assert.equal(quick.year, 190);
  assert.equal(G.restored(quick), true);
});

for (const [name, corrupt] of [
  ['missing original officers', (g) => { g.officers.length = 223; }],
  ['invalid turn order', (g) => { g.order = 99; g.books = 0; }],
  ['invalid turn cursor', (g) => { g.turnIdx = -9; g.books = 0; }],
  ['invalid current faction', (g) => { g.current = 999; }],
  ['missing AI cursors', (g) => { delete g.aiCursor; }],
  ['invalid difficulty', (g) => { g.level = 99; }],
  ['invalid month', (g) => { g.month = 99; }],
]) {
  test(`a quick record with ${name} falls back to its backup`, () => {
    const g = G.newGame(4, 1, 123);
    g.year = 190; assert.equal(G.saveQuick(g), true);
    g.year = 191; assert.equal(G.saveQuick(g), true);
    const bad = JSON.parse(store.get(KEY)); corrupt(bad); store.set(KEY, JSON.stringify(bad));
    const quick = G.loadQuick();
    assert.equal(quick.year, 190);
    assert.equal(G.restored(quick), true);
  });
}

test('storage failure keeps the old quick record and does not change the running game', () => {
  const old = G.newGame(4, 1, 123);
  old.year = 190; assert.equal(G.saveQuick(old), true);
  const raw = store.get(KEY);
  const g = G.newGame(4, 1, 456);
  g.books = 3; g.slot = 4; g.year = 200;
  failKey = KEY;
  assert.equal(G.saveQuick(g), false);
  assert.equal(store.get(KEY), raw);
  assert.equal(g.books, 3);
  assert.equal(g.slot, 4);
  assert.equal(g.quickId, undefined);
});

test('quick save identifiers distinguish campaigns without advancing the game RNG', () => {
  const a = G.newGame(4, 1, 123), b = G.newGame(4, 1, 123);
  const seed = a.seed;
  assert.equal(G.saveQuick(a), true);
  assert.equal(a.seed, seed);
  assert.equal(G.saveQuick(b), true);
  assert.notEqual(a.quickId, b.quickId);
});

test('a quick record retains legacy saves and restores legitimate copied officers', () => {
  const g = G.newGame(4, 1, 123), id = g.officers.length;
  g.clones = [id]; g.officers.push({ ...g.officers[0], id });
  g.cities[g.factions[g.player].city].officers.push(id);
  delete g.version; delete g.quickId;
  assert.equal(G.saveQuick(g), true);
  G.setData(JSON.parse(readFileSync(new URL('../data/game-data.json', import.meta.url))));
  const loaded = G.loadQuick();
  assert.ok(loaded);
  assert.equal(loaded.officers[id].id, id);
  assert.ok(loaded.cities[loaded.factions[loaded.player].city].officers.includes(id));
});
