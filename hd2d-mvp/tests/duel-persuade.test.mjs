// 单挑 说得 结果 2「退出单挑」(bank23 `$BF43`, research/skirmish-duel-evidence.md D08): the persuaded general is given
// result code 1, the code a retreat leaves, and back on the 白兵 field (`CDCF`) his general order turns to 退却. The remake
// left both orders as they were, so the two generals, still side by side, met in a new duel at the next general's action.
// Both seats, the player persuading the AI and the AI persuading the player. Results 3 and 4 end the 白兵 outright.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as G from '../src/core/game.js';
import { Tactical, GW, GH } from '../src/core/tactical.js';
G.setData(JSON.parse(readFileSync(new URL('../data/game-data.json', import.meta.url))));

// The two generals side by side mid-field, both ordered forward; side p persuades and the draw picks result `out`.
function persuaded(p, out, human) {
  const g = G.newGame(4, 1, 1), live = g.officers.filter((o) => o.status === 2 && !G.isRuler(g, o.id));
  const t = new Tactical(g, live[0].id, live[1].id, 2, () => 0, { human });
  t.map = Array.from({ length: GH }, () => Array(GW).fill(0));
  const f = p === 'a' ? 'd' : 'a';
  Object.assign(t.side[p].o, { int: 99, virtue: 99 }); Object.assign(t.side[f].o, { loyalty: 20, hp: 40 });
  t.units = [{ side: 'a', kind: 'gen', idx: 0, x: 7, y: 4, hp: t.side.a.hp, id: t.side.a.id }, { side: 'd', kind: 'gen', idx: 0, x: 8, y: 4, hp: t.side.d.hp, id: t.side.d.id }];
  t.side.a.cmd.gen = t.side.d.cmd.gen = 'advance';
  const first = p === 'a' ? t.units[0] : t.units[1], second = first === t.units[0] ? t.units[1] : t.units[0];
  t.queue = [first, second, first, second];
  const ev = t.step(); assert.equal(ev.type, 'duel');
  const i = ev.duel.persuadeTable(p).indexOf(out); assert.ok(i >= 0, `result ${out} in the table`);
  ev.duel.r = () => i; assert.equal(ev.duel.act(p, 'persuade').out, out);
  return { t, f, end: t.resolveDuel(), gens: { a: t.units[0], d: t.units[1] } };
}

for (const human of ['a', 'd']) for (const p of ['a', 'd']) {
  test(`human ${human}, ${p} persuades: 退出单挑 turns the other general to 退却 and no duel follows`, () => {
    const { t, f, end, gens } = persuaded(p, 2, human);
    assert.equal(end.res.withdrew, t.side[f].id); assert.equal(end.res.retreated, undefined, 'not a 败走');
    assert.equal(t.over, null, 'the 白兵 goes on');
    assert.equal(t.side[f].cmd.gen, 'retreat'); assert.equal(t.side[p].cmd.gen, 'advance');
    const x0 = gens[f].x, seen = [];
    for (let k = 0; k < 2; k++) seen.push(t.step().type);
    assert.ok(!seen.includes('duel'), `no new duel: ${seen}`);
    assert.equal(gens[f].x, x0 + (f === 'a' ? -1 : 1), 'he falls back toward his own edge');
  });
}
test('不为所动 keeps the duel going; 投降 ends the 白兵', () => {
  for (const p of ['a', 'd']) {
    const g = G.newGame(4, 1, 1), live = g.officers.filter((o) => o.status === 2 && !G.isRuler(g, o.id));
    const t = new Tactical(g, live[0].id, live[1].id, 2, () => 0, { human: p }), f = p === 'a' ? 'd' : 'a';
    const d = t.startDuel(p).duel; Object.assign(t.side[f].o, { loyalty: 90, hp: 90 });
    d.r = () => d.persuadeTable(p).indexOf(1); d.act(p, 'persuade'); assert.equal(d.result, null);
    const e4 = persuaded(p, 4, p); assert.equal(e4.t.over.why, 'defect');
  }
});
