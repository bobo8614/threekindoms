// 阿会喃 bug (原版漏洞 mode, research/ahuinan-bug-evidence.md): a faction with no attackable neighbour marches on
// 王莆, and the 阿会喃 copies that walk away land in 幽州/辽东/青州/并州 as officers of their own. Rules only, in Node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as G from '../src/core/game.js';
import { aiTurn } from '../src/core/ai.js';
import { PHANTOM_ROADS } from '../src/core/ahuinan.js';
const D = JSON.parse(readFileSync(new URL('../data/game-data.json', import.meta.url)));
G.setData(D);

// Every faction allied with every other: no AI ever has a legal target. Rich cities so supplies never stop it.
function boxedIn(seed, bug = true) {
  const g = G.newGame(4, 2, seed); g.year = 194;
  for (const a of g.factions) for (const b of g.factions) if (a !== b) a.alliance[b.id] = 12;
  for (const c of g.cities) if (c.faction !== G.NONE) { c.gold = 9999; c.rice = 9999; }
  if (bug) g.bugs = { ahuinan: true };
  return g;
}
async function months(g, n) {
  const events = [], io = new Proxy({ event: async (e) => { events.push(e); } }, { get: (t, k) => t[k] ?? (async () => true) });
  for (let m = 0; m < n; m++) {
    for (const f of g.factions) if (f.ai && f.ruler != null) { for (const x of g.factions) for (const y of g.factions) if (x !== y) x.alliance[y.id] = 12; await aiTurn(g, f.id, io); }
  }
  return events.filter((e) => e.type === 'phantom');
}

test('without the bug a boxed-in faction never marches', async () => {
  const g = boxedIn(1, false), n = g.officers.length;
  assert.equal((await months(g, 12)).length, 0);
  assert.equal(g.officers.length, n); assert.equal(g.clones, undefined);
});

test('with the bug it marches on 王莆 and copies land only in 幽州/辽东/青州/并州', async () => {
  let wars = 0, placed = 0;
  for (const seed of [1, 2, 3, 4, 5]) {
    const g = boxedIn(seed), n0 = g.officers.length;
    const ev = await months(g, 12);
    wars += ev.length;
    for (const e of ev) {
      assert.ok(e.att >= 6 && e.att <= 9 && e.att + e.def === 10, `sides ${e.att}/${e.def}`);
      for (const p of e.placed) { placed++; if (p.city != null) assert.ok(PHANTOM_ROADS.includes(p.city), `placed in ${p.city}`); }
    }
    // Officers stay contiguous; every copy is registered, named 阿会喃 and sits in exactly one roster (or is ronin).
    assert.deepEqual(g.officers.map((o) => o.id), g.officers.map((_, i) => i));
    assert.equal(g.officers.length, n0 + (g.clones?.length ?? 0));
    for (const id of g.clones ?? []) {
      assert.equal(G.name(id), '阿会喃');
      const homes = g.cities.filter((c) => c.officers.includes(id)).length, o = g.officers[id];
      assert.ok(homes === 1 || o.status === G.RONIN || o.status === G.DEAD, `copy ${id}: ${homes} rosters, status ${o.status}`);
    }
    for (const c of g.cities) assert.ok(c.officers.length <= 10, `${c.id} over full`);
  }
  assert.ok(wars > 0, 'some faction marched on 王莆'); assert.ok(placed > 0, 'some copies came out');
});

test('copies are made from 阿会喃 as edited, and a won march changes 王莆\'s owner', async () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const g = boxedIn(seed);
    Object.assign(g.officers[0], { war: 99, int: 99, virtue: 99 });
    const ev = await months(g, 12);
    const won = ev.filter((e) => e.attWins);
    assert.equal(g.phantom?.owner ?? 0, won.length ? won.at(-1).attacker : 0, '王莆 belongs to the last attacker that won it');
    for (const id of g.clones ?? []) { assert.equal(g.officers[id].int, 99); assert.equal(g.officers[id].war, 99); }
    if (g.clones?.length) return;
  }
  assert.fail('no copy came out in six seeds');
});

test('registerClones restores copies after a JSON round trip', async () => {
  const g = boxedIn(2); await months(g, 12);
  if (!g.clones?.length) return;
  const back = JSON.parse(JSON.stringify(g)); for (const id of back.clones) delete D.officers[id];
  G.registerClones(back);
  for (const id of back.clones) {
    assert.equal(G.name(id), '阿会喃');
    const d = G.debutInfo(id); // a copy came out of 王莆 in its own year, not 阿会喃's debut
    assert.equal(d.kind, 'phantom'); assert.equal(d.year, back.officers[id].debut);
  }
});
