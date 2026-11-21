// Slaying a general in a 白兵 or its 单挑 pays the slayer floor((the dead's 武力 + 智力) / 2) stored experience, whatever
// the dead had of his own; a general taken alive pays nothing (fanxibaby@devblog). The original: bank13 $C766 write-back
// → $C799 → bank14 $A009 → bank15 $D8B0 → $D7FB, which halves its input. Natural runs: 文丑 1019 → 1087 slaying 刘备
// (71 + 65) in a 单挑 (analysis/runtime/duel-natural duel-fight-11 → 13), 1352 → 1411 slaying 张飞 (98 + 20, own exp 1213)
// in a 白兵 (analysis/runtime/skirmish-natural battle-flow-5 → battle-loss-exit-0); controlled at $C766 with the dead at
// 90 / 80 and 150 or 1500 exp of his own, the winner 200 → 285 both times, and a capture +0. Rules only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as G from '../src/core/game.js';
import { Field } from '../src/core/field.js';
import { setupWar } from '../src/core/warcore.js';
G.setData(JSON.parse(readFileSync(new URL('../data/game-data.json', import.meta.url))));

// The player's first officer attacks the nearest held enemy city's first; the 白兵 comes back pending (human attacker),
// so the battle can be fought to its end before Field settles it.
function clash(seed, { noWarDeath = false } = {}) {
  const g = G.newGame(4, 1, seed); g.noWarDeath = noWarDeath;
  const to = g.cities.find((c) => c.faction !== G.NONE && c.faction !== g.player && c.officers.some((id) => !G.isRuler(g, id)));
  const from = g.cities[g.factions[g.player].city], id = from.officers[0];
  const f = new Field(g, setupWar(g, { from: from.id, to: to.id, ids: [id], commander: id, gold: 100, rice: 9000 }), 'att');
  const a = f.alive.find((u) => u.side === 'att'), d = f.alive.find((u) => u.side === 'def' && !G.isRuler(g, u.id));
  Object.assign(f.O(a.id), { exp: 200, level: 1, hp: 100, war: 99, soldiers: 1000, loyalty: 100 });
  Object.assign(f.O(d.id), { war: 90, int: 80, exp: 1500, hp: 1, soldiers: 0, loyalty: 100 });
  const res = f.attack(a, d), b = res.pending;
  b.deploy();
  return { g, f, a, d, res, b, o: f.O(a.id), dead: f.O(d.id) };
}
const award = (dead) => Math.floor((dead.war + dead.int) / 2);

function fight(b) {
  for (let i = 0; i < 2000 && !b.over; i++) { const ev = b.step(); if (b.duel) b.autoDuel(); else if (!ev && !b.over) break; }
}

test('a 白兵 kill pays floor((武力 + 智力) / 2), not the dead man\'s own experience', () => {
  let seen = 0;
  for (let seed = 1; seed <= 40 && seen < 3; seed++) {
    const { res, b, o, dead } = clash(seed);
    fight(b);
    if (b.duels || b.side.d.fate !== 'dead') continue;
    const before = o.exp, want = award(dead);
    res.settle();
    assert.equal(o.exp - before, want, `seed ${seed}: +${want} for slaying him`);
    assert.equal(want, 85, '90 + 80, halved');
    seen++;
  }
  assert.ok(seen, 'some seed ends in a 白兵 kill');
});

test('a 单挑 kill pays the same once, when the 白兵 is settled', () => {
  let seen = 0;
  for (let seed = 1; seed <= 40 && seen < 3; seed++) {
    const { res, b, o, dead } = clash(seed);
    b.side.d.hp = 1; b.gen('d').hp = 1;
    b.startDuel('a'); b.autoDuel();
    if (b.side.d.fate !== 'dead') continue;
    const before = o.exp;
    res.settle();
    assert.equal(o.exp - before, award(dead), `seed ${seed}`);
    assert.equal(res.d.fate, 'dead');
    seen++;
  }
  assert.ok(seen, 'some seed ends in a 单挑 kill');
});

test('a general taken alive pays nothing (武将不战死 turns his fall into a capture)', () => {
  let seen = 0;
  for (let seed = 1; seed <= 40 && seen < 3; seed++) {
    const { res, b, o } = clash(seed, { noWarDeath: true });
    b.side.d.hp = 1; b.gen('d').hp = 1;
    b.startDuel('a'); b.autoDuel();
    if (b.side.d.fate !== 'captured') continue;
    const before = o.exp;
    res.settle();
    assert.equal(o.exp - before, 0, `seed ${seed}`);
    seen++;
  }
  assert.ok(seen, 'some seed ends in a capture');
});
