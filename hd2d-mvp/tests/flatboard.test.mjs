// The pre-rendered 战略地图 (tools/bake_strategy_flat.mjs): the four season pictures and the coordinates the 2D map
// draws by, read from disk with no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';

const dir = new URL('../assets/ai/sandtable/flat/', import.meta.url);
const board = JSON.parse(readFileSync(new URL('board.json', dir)));
const data = JSON.parse(readFileSync(new URL('../data/game-data.json', import.meta.url)));
const inside = ([x, y]) => x >= 0 && y >= 0 && x <= board.size[0] && y <= board.size[1];

test('every city sits inside the picture, its parts where the 2D layers will draw them', () => {
  assert.equal(board.cities.length, 30);
  assert.deepEqual(board.cities.map((c) => c.id).sort((a, b) => a - b), Array.from({ length: 30 }, (_, i) => i));
  for (const c of board.cities) {
    for (const p of [[c.cx, c.cy], c.flag, c.tag]) assert.ok(inside(p), `city ${c.id}: ${p}`);
    assert.ok(c.flag[1] < c.cy && c.tag[1] < c.cy, `city ${c.id}: pole top and tag stand above its centre`);
    assert.ok(c.rx > c.ry && c.ry > 0, `city ${c.id}: its ring is an ellipse lying on the ground`);
  }
});

test('no two cities share a spot', () => {
  for (const a of board.cities) for (const b of board.cities) {
    if (a.id < b.id) assert.ok(Math.hypot(a.cx - b.cx, a.cy - b.cy) >= 12, `cities ${a.id} and ${b.id}`);
  }
});

test('every road of the game is there once, a polyline inside the picture', () => {
  const want = new Set();
  for (const [i, c] of data.cities.entries()) for (const n of c.roads) want.add(`${Math.min(i, n)}-${Math.max(i, n)}`);
  assert.deepEqual(new Set(board.roads.map((r) => `${r.a}-${r.b}`)), want);
  assert.equal(board.roads.length, want.size);
  for (const r of board.roads) {
    assert.ok(r.a < r.b && r.p.length >= 4 && r.p.length % 2 === 0);
    assert.equal(r.sea.length, r.p.length / 2);
    for (let k = 0; k < r.p.length; k += 2) assert.ok(inside([r.p[k], r.p[k + 1]]), `road ${r.a}-${r.b}`);
  }
  assert.ok(board.roads.some((r) => r.sea.includes(true)), 'the 辽东–青州 crossing is by sea');
});

test('the owners\' tint grid covers the whole land and leaves the sea clear', () => {
  const { w, h, near, k, land } = board.tint;
  assert.equal(near.length, w * h); assert.equal(k.length, w * h); assert.equal(land.length, w * h);
  assert.deepEqual(k, land); assert.ok(k.includes(0) && k.includes(1), 'both sea and fully covered land are present');
  for (const c of board.cities) {
    const at = Math.floor(c.cy / board.size[1] * h) * w + Math.floor(c.cx / board.size[0] * w);
    assert.equal(near[at], c.id, `the cell under city ${c.id}`);
  }
});

test('bounds are the board\'s extent in the picture', () => {
  const { x0, y0, x1, y1 } = board.bounds;
  assert.ok(x0 >= 0 && y0 >= 0 && x1 <= board.size[0] && y1 <= board.size[1] && x1 > x0 && y1 > y0);
  for (const c of board.cities) assert.ok(c.cx > x0 && c.cx < x1 && c.cy > y0 && c.cy < y1);
});

for (const season of ['spring', 'summer', 'autumn', 'winter']) {
  test(`${season}.webp is there, under 3 MB, with a transparent outer edge`, () => {
    const file = new URL(`${season}.webp`, dir);
    assert.ok(existsSync(file));
    assert.ok(statSync(file).size < 3 * 1024 * 1024, `${statSync(file).size} bytes`);
    const b = readFileSync(file);
    assert.equal(b.toString('latin1', 12, 16), 'VP8X', 'an extended WebP');
    assert.ok(b[20] & 0x10, 'carries alpha');
    assert.equal(1 + b.readUIntLE(24, 3), board.size[0]); assert.equal(1 + b.readUIntLE(27, 3), board.size[1]);
  });
}
