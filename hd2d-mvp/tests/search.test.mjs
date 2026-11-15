// An AI faction's 搜索 reads a city's queue as the original's C5D2 does: each entry whose year has come gets its own
// draw, up to the first whose year has not. With the head alone (F23, 2026-10-31) an entry the ruler does not favour
// held back those he does (devblog #98/#102, 2026-11-03). The player's 搜索 stays on the head. Rules only, in Node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as G from '../src/core/game.js';
import { housekeeping } from '../src/core/ai.js';
const D = JSON.parse(readFileSync(new URL('../data/game-data.json', import.meta.url)));
G.setData(D);

const id = (n) => D.officers.findIndex((o) => o.name === n);
// 荆州 in 194, its only city for a faction that favours neither man (10% each); 伊籍 and 周仓 already out, so the
// queue reads 徐庶 192, 诸葛亮 194. `draws` are the RNG results in turn, 99 after them.
function search(draws, year = 194) {
  const g = G.newGame(4, 1, 1), jing = D.cities.find((c) => c.name === '荆州').id;
  const f = g.factions.findIndex((x, i) => i !== g.player && x && !(D.rules.search_preference[String(i)] || []).includes(id('徐庶')));
  for (const c of g.cities) if (c.faction === f) c.faction = G.NONE;
  const c = g.cities[jing]; c.faction = f; c.officers = c.officers.slice(0, 3);
  g.year = year;
  for (const n of ['伊籍', '周仓']) g.officers[id(n)].status = G.SERVING;
  for (const n of ['徐庶', '诸葛亮']) g.officers[id(n)].status = G.UNAPPEARED;
  const r = () => (draws.length ? draws.shift() : 99);
  housekeeping(g, f, r, () => true);
  return ['徐庶', '诸葛亮'].filter((n) => c.officers.includes(id(n)));
}

test('the queue in 荆州 reads 伊籍, 周仓, 徐庶 192, 诸葛亮 194', () => {
  const q = G.searchQueue(D.cities.find((c) => c.name === '荆州').id).map((i) => D.officers[i].name);
  assert.deepEqual(q.slice(0, 4), ['伊籍', '周仓', '徐庶', '诸葛亮']);
});
test('when 徐庶\'s draw fails, 诸葛亮 behind him gets his own draw', () => {
  assert.deepEqual(search([0, 50, 0]), ['诸葛亮']);
});
test('both draws failing, nobody comes out', () => {
  assert.deepEqual(search([0, 50, 50]), []);
});
test('an entry whose year has not come ends the scan', () => {
  assert.deepEqual(search([0, 50, 0], 193), []);
});
test('甘宁, favouring 孙策, is not held back in 江夏 by 吕范 ahead of him, who does not', () => {
  const g = G.newGame(4, 1, 1), f = g.factions.findIndex((x) => x && x.ruler === id('孙策')), jx = D.cities.find((c) => c.name === '江夏').id;
  assert.ok(D.rules.search_preference[String(f)].includes(id('甘宁')));
  assert.ok(!D.rules.search_preference[String(f)].includes(id('吕范')));
  for (const c of g.cities) if (c.faction === f) c.faction = G.NONE;
  const c = g.cities[jx]; c.faction = f; c.officers = [id('孙策')]; g.officers[id('孙策')].city = jx; g.factions[f].city = jx; g.year = 191;
  const draws = [0, 50, 50]; // into the search; 吕范 at 50 fails his 10%; 甘宁 at 50 passes his 90%
  housekeeping(g, f, () => (draws.length ? draws.shift() : 99), () => true);
  assert.ok(c.officers.includes(id('甘宁'))); assert.ok(!c.officers.includes(id('吕范')));
});
test('when 徐庶\'s draw passes, 徐庶 comes out and 诸葛亮 waits', () => {
  assert.deepEqual(search([0, 0, 0]), ['徐庶']);
});

// 三顾模式 (g.sangu, a new-game / 系统 option): the player's 搜索 in a city whose queue head is ready counts one visit
// for him (g.visits, kept in the record), whatever the search turns up; the third brings him in, whatever faction
// he favours. Here 徐庶 heads the queue and favours 刘备; the player is 曹操, and every draw finds gold.
function visits({ sangu = true, n = 3, full = false } = {}) {
  const g = G.newGame(2, 1, 1), jing = D.cities.find((c) => c.name === '荆州').id, c = g.cities[jing];
  const pf = Number(Object.entries(D.rules.search_preference).find(([, ids]) => ids.includes(id('徐庶')))[0]);
  assert.notEqual(g.player, pf, '徐庶 favours someone else');
  c.faction = g.player; c.officers = g.officers.filter((o) => o.status === G.SERVING).slice(0, full ? 10 : 3).map((o) => o.id);
  g.year = 194; if (sangu) g.sangu = true;
  for (const n of ['伊籍', '周仓']) g.officers[id(n)].status = G.SERVING;
  for (const n of ['徐庶', '诸葛亮']) g.officers[id(n)].status = G.UNAPPEARED;
  // every outcome row reads 发现了金 for these searches, so the draws never reach him (a full city redraws anything ≥ 5)
  const rows = D.search_outcomes; D.search_outcomes = Object.fromEntries(Object.keys(rows).map((k) => [k, Array(8).fill(1)]));
  const out = [];
  try { for (let i = 0; i < n; i++) out.push(G.search(g, jing, c.officers[0])); } finally { D.search_outcomes = rows; }
  return { g, c, out, xu: id('徐庶') };
}
test('三顾: the third search in his city brings the queue head in, even one who favours another ruler', () => {
  const { g, c, out, xu } = visits();
  assert.equal(out[0].joined, undefined); assert.equal(out[1].joined, undefined);
  assert.equal(out[2].joined, xu); assert.match(out[2].msg, /三顾/);
  assert.ok(c.officers.includes(xu)); assert.equal(g.officers[xu].status, G.SERVING);
  assert.equal(g.visits[xu], undefined, 'the count is cleared once he joins');
});
test('三顾: the count is kept per officer in the game, so it survives a save', () => {
  const { g, xu } = visits({ n: 2 });
  assert.equal(JSON.parse(JSON.stringify(g)).visits[xu], 2);
});
test('三顾 off: three searches that find only gold bring nobody', () => {
  const { c, out, xu } = visits({ sangu: false });
  assert.ok(out.every((r) => r.joined == null)); assert.ok(!c.officers.includes(xu));
});
test('三顾: a full city does not count a visit', () => {
  const { g, out, xu } = visits({ full: true });
  assert.ok(out.every((r) => r.joined == null)); assert.equal(g.visits?.[xu], undefined);
});
