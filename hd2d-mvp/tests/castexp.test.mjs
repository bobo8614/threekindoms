// A 计略 that hurts several generals pays its experience and checks the level after each of them, as the original does
// (bank12 $B68B → $D7FB once a target, research/war-strategies-evidence.md §6), and each target's loss is worked out
// with the caster's level as it then stands ($B070 and $B1E3 read record byte 0B anew for every target). Rules only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as G from '../src/core/game.js';
import { Field, FOREST } from '../src/core/field.js';
import { RNG_TABLE, roll100, realChance } from '../src/core/origrng.js';
import { setupWar } from '../src/core/warcore.js';
G.setData(JSON.parse(readFileSync(new URL('../data/game-data.json', import.meta.url))));

// A field where the caster stands at (10,10) and `n` foes stand in a row from (12,10) on forest, every roll 0 (a hit, the least loss).
function row(n) {
  const g = G.newGame(4, 1, 1);
  const to = g.cities.find((c) => c.faction !== G.NONE && c.faction !== g.player && c.officers.length >= n);
  const from = g.cities[g.factions[g.player].city], id = from.officers[0];
  const f = new Field(g, setupWar(g, { from: from.id, to: to.id, ids: [id], commander: id, gold: 100, rice: 9000 }), 'att');
  f.r = () => 0; f.terr = () => FOREST;
  const me = f.alive.find((u) => u.side === 'att'), foes = f.alive.filter((u) => u.side === 'def');
  me.x = 10; me.y = 10;
  foes.forEach((e, i) => { if (i < n) { e.x = 12 + i; e.y = 10; f.O(e.id).soldiers = 1000; } else { e.x = 30 + i; e.y = 30; } });
  Object.assign(f.O(me.id), { level: 1, int: 90, war: 60 });
  f.pool.att = 99;
  return { g, f, me, foes: foes.slice(0, n), o: f.O(me.id) };
}

test('劫火 across four generals crosses two levels in the one cast', () => {
  const { g, f, me, foes, o } = row(4);
  o.exp = 990;
  const res = f.cast(me, 14, foes[0], true);
  assert.ok(res.hit);
  assert.deepEqual(res.hits.map((h) => -h.soldiers), [270, 270, 270, 270]); // floor(90×30/10), 知力 only
  assert.equal(o.exp, 990 + 135 + 270 + 405 + 540, 'floor(a/2) + floor((a+b)/2) + …');
  assert.equal(o.level, 3, 'level 2 after the first general, level 3 after the fourth');
  assert.deepEqual(G.takeLevelUps(g).map((l) => [l.from, l.to]), [[1, 3]], 'told once, with the whole gain');
});

test('共杀: a level gained on one general raises the loss of the next', () => {
  const { f, me, foes, o } = row(3);
  o.exp = 900;
  // The target in the middle, then its neighbours left and right: 111 each at level 1, +10 for each level above it.
  const res = f.cast(me, 7, foes[1], true);
  assert.deepEqual(res.hits.map((h) => -h.soldiers), [111, 111, 121], '55 then 111 experience pass 1000 before the third general');
  assert.equal(o.level, 2);
  assert.equal(o.exp, 900 + 55 + 111 + 171);
});

test('a 计略 on one general is paid as before', () => {
  const { f, me, foes, o } = row(1);
  o.exp = 0;
  const res = f.cast(me, 0, foes[0], true);
  assert.deepEqual(res.hits.map((h) => -h.soldiers), [111]);
  assert.equal(o.exp, 55); assert.equal(o.level, 1);
});

// The percent roll of a 计略 is the original's (core/origrng.js): bytes of the fixed table from a moving cursor, those of
// 100 and over thrown away. Checked here against that loop run from every one of the 256 cursors (2026-11-14: players
// found 计略 landing less often than in the original; a uniform 0..99 draw gave 20% where the original gives 25.8%).
test('a 计略 rolls as the original does: more often under the number than a uniform draw', () => {
  assert.deepEqual([...RNG_TABLE].sort((a, b) => a - b), Array.from({ length: 256 }, (_, i) => i), 'the table is a permutation of 0..255');
  const walk = (c) => { while (RNG_TABLE[c & 255] >= 100) c++; return RNG_TABLE[c & 255]; };
  const orig = Array.from({ length: 256 }, (_, c) => walk(c)).sort((a, b) => a - b), ours = Array.from({ length: 256 }, (_, c) => roll100(() => c));
  assert.deepEqual(ours, orig, 'one roll for each cursor, the same 256 results');
  for (const [p, want] of [[5, 6.25], [20, 25.78], [39, 44.14], [50, 55.08], [95, 95.31], [0, 0], [100, 100], [130, 100]]) assert.ok(Math.abs(realChance(p) - want) < 0.01, `p ${p}: ${realChance(p)}`);
  for (let p = 5; p <= 95; p++) assert.ok(realChance(p) >= p, `never worse than ${p}%`);
});

test('a cast hits as often as the panel says, and the panel gives the real chance', () => {
  const { f, me, foes } = row(1);
  Object.assign(f.O(me.id), { int: 80, level: 3 }); Object.assign(f.O(foes[0].id), { int: 80, level: 3 });
  foes[0].x = 11; // adjacent: 10 for the distance + 10 for the player = 20
  assert.equal(f.hitChance(me, foes[0]), 20); assert.equal(f.odds(me, 0, foes[0]), 26);
  let hits = 0;
  for (let c = 0; c < 256; c++) { f.r = (n) => (n === 256 ? c : 0); f.pool.att = 99; f.O(foes[0].id).soldiers = 1000; Object.assign(f.O(me.id), { level: 3, exp: 0 }); hits += f.cast(me, 0, foes[0], true).hit ? 1 : 0; }
  assert.equal(hits, 66, '66 of the 256 cursors (25.8%), not 51 (20%)');
});
