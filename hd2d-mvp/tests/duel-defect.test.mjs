// 单挑 说得 结果 4 is a change of side, not a capture (research/death-succession-events-evidence.md §4, `$C766` code 4):
// the persuaded general stays on the war map where he stood, with the men the 白兵 left him, under the persuader's
// banner, and his loyalty is recomputed at once by the new ruler's 人德 (`11:$CF3F`, 8-bit subtraction, then 10..90).
// A FC ROM replay (2026-11-13) kept 文丑 at (10,8) with 800 men and turned 30 → 49 under 刘备 (人德 99). The remake took
// him off the field as a prisoner (MrYue66@bilibili: 吕布 for 董卓, 忠诚 76 → 25 here, 90 in the original).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as G from '../src/core/game.js';
import { Field } from '../src/core/field.js';
import { setupWar, resolveWar } from '../src/core/warcore.js';
G.setData(JSON.parse(readFileSync(new URL('../data/game-data.json', import.meta.url))));

// A war between the player's capital and a neighbour with ≥2 officers; `human` is the player's side, `p` the side that
// persuades, `target` 'commander' or 'other' (whom on the other side he persuades).
function war(human, p, target) {
  const g = G.newGame(4, 1, 1), f = g.player, home = g.factions[f].city;
  const to = G.roads(home).find((n) => g.cities[n].faction !== f && g.cities[n].faction !== G.NONE && g.cities[n].officers.length >= 2);
  assert.ok(to != null, 'a neighbour to fight');
  const ids = g.cities[home].officers.slice(0, 2);
  const [attF, defF] = human === 'att' ? [f, g.cities[to].faction] : [g.cities[to].faction, f];
  // the player is the attacker, or the neighbour attacks the player's capital
  const w = human === 'att' ? setupWar(g, { from: home, to, ids, commander: ids[0], gold: 100, rice: 900 })
    : setupWar(g, { from: to, to: home, ids: g.cities[to].officers.slice(0, 2), commander: g.cities[to].officers[0], gold: 100, rice: 900 });
  assert.equal(w.attacker, attF); assert.equal(w.defender, defF);
  const field = new Field(g, w, human);
  const q = p === 'att' ? 'def' : 'att';
  const notRuler = (u) => !G.isRuler(g, u.id);
  const foes = field.units.filter((u) => u.side === q && notRuler(u));
  const v = target === 'commander' ? field.units.find((u) => u.side === q && u.commander) : foes.find((u) => !u.commander);
  assert.ok(v && notRuler(v), `a ${target} to persuade who is not a ruler`);
  const a = field.units.find((u) => u.side === p && u.commander);
  return { g, field, a, v, p, q };
}

// The persuader attacks or is attacked, and 说得 draws result 4 in the duel.
function persuade(field, a, v, p) {
  const [att, def] = field.turn === p ? [a, v] : [v, a];
  field.turn = att.side; field.pool[att.side] = 99;
  v.x = a.x + 1; v.y = a.y;
  const res = field.attack(att, def), t = res.battle;
  t.deploy();
  const s = att === a ? 'a' : 'd', o = s === 'a' ? 'd' : 'a';
  Object.assign(t.side[s].o, { int: 99, virtue: 99 }); Object.assign(t.side[o].o, { loyalty: 20 }); t.side[o].hp = 40;
  const d = t.startDuel(s).duel, i = d.persuadeTable(s).indexOf(4);
  assert.ok(i >= 0, 'result 4 in the table');
  d.r = () => i; assert.equal(d.act(s, 'persuade').out, 4);
  assert.equal(d.result.defected, v.id);
  t.resolveDuel();
  assert.equal(t.over.why, 'defect', 'the 白兵 ends');
  assert.equal(t.result()[o].fate, 'defected');
  return res.pending ? res.settle() : res;
}

for (const human of ['att', 'def']) for (const p of ['att', 'def']) {
  test(`player ${human}, ${p} persuades: the general stays where he stood and turns his coat`, () => {
    const { g, field, a, v, q } = war(human, p, 'other');
    const ruler = g.factions[field.faction(p)].ruler;
    const res = persuade(field, a, v, p);
    assert.equal(res.d.fate ?? res.a.fate, 'defected');
    assert.equal(v.gone, false, 'not taken off the field');
    assert.equal(v.side, p, 'his banner turns');
    assert.equal(v.commander, false);
    assert.deepEqual([v.x, v.y], [a.x + 1, a.y], 'where he stood');
    assert.notEqual(v.fate, 'captured');
    const info = res.a.fate === 'defected' ? res.a : res.d;
    assert.equal(g.officers[v.id].soldiers, info.soldiers, 'the men the 白兵 left him');
    assert.equal(g.officers[v.id].loyalty, G.recruitLoyalty(g.officers[ruler].virtue, 20), 'loyalty by the new ruler’s 人德');
    assert.equal(field.over, null, 'the war goes on');
    // the persuader's side may give him orders
    field.turn = p; field.pool[p] = 99;
    assert.ok(field.alive.includes(v) && v.side === field.turn);
    // when the war is settled he joins the persuader's faction, not its prisoners
    field.end(q, 'commander');
    const r = field.result();
    assert.ok(r.survivors[p].includes(v.id)); assert.ok(!r.captured.byAtt.includes(v.id) && !r.captured.byDef.includes(v.id));
  });
}

test('the 8-bit subtraction: 董卓 (人德 11) wins over a general of 忠诚 76 at 90, not 25', () => {
  assert.equal(G.recruitLoyalty(11, 76), 90);
  assert.equal(G.capturedLoyalty(76), 25);
});

for (const p of ['att', 'def']) {
  test(`${p} persuades the other side's commander: the war is lost for that side`, () => {
    const { g, field, a, v, q } = war(p, p, 'commander');
    persuade(field, a, v, p);
    assert.equal(v.side, p); assert.equal(v.gone, false);
    assert.deepEqual(field.over, { loser: q, why: 'commander' });
    const w = field.war, r = field.result(), winF = p === 'att' ? w.attacker : w.defender;
    resolveWar(g, w, r);
    assert.equal(g.officers[v.id].status, G.SERVING);
    assert.ok(G.citiesOf(g, winF).some((c) => c.officers.includes(v.id)), 'placed with the winner');
  });
}

test('an AI general won over during the AI turn takes no further action for it', () => {
  const { field, v } = war('att', 'att', 'other'); // v: an AI defender the player will win over
  field.turn = 'def'; field.pool.def = 99;
  const it = field.aiActions('def'), first = it.next(); // the AI's slots are taken as its turn begins
  assert.ok(!first.done);
  v.side = 'att'; // as if 说得 had turned him in that first action's 白兵
  let n = 0;
  for (let x; n < 200 && !(x = it.next()).done; n++) assert.notEqual(x.value.u, v, 'he no longer acts for the AI');
  assert.ok(n > 0, 'the AI goes on with the others');
});

test('主动降参 is still a capture: off the field, a prisoner', () => {
  const { field, a, v } = war('att', 'att', 'other');
  field.turn = 'att'; field.pool.att = 99; v.x = a.x + 1; v.y = a.y;
  const res = field.attack(a, v), t = res.battle; t.deploy();
  const d = t.startDuel('a').duel; d.act('d', 'surrender'); t.resolveDuel(); // the non-ruler defender gives himself up
  assert.equal(t.over.why, 'capture'); assert.equal(t.result().d.fate, 'captured');
  res.settle();
  assert.equal(v.gone, true); assert.equal(v.fate, 'captured'); assert.equal(v.capturedBy, 'att'); assert.equal(v.side, 'def');
});
