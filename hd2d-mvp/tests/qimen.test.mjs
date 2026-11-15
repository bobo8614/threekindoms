// 奇门遁甲 day tick in Node (no browser): the target loses 80–150 a day while 诸葛亮 (109) is on the field, and he
// gains the original's experience (bank9 $CE94 sums each target's left-soldiers low byte, $D7FB halves it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as G from '../src/core/game.js';
import { Field } from '../src/core/field.js';
import { setupWar } from '../src/core/warcore.js';
G.setData(JSON.parse(readFileSync(new URL('../data/game-data.json', import.meta.url))));

// A field on the first hostile neighbouring pair (with `minDef` defenders): 诸葛亮 is the attacker's first unit.
function make(minDef = 1) {
  const g = G.newGame(4, 1, 1);
  for (const c of g.cities) {
    if (c.faction === G.NONE || !c.officers.length) continue;
    const to = G.roads(c.id).find((n) => g.cities[n].faction !== c.faction && g.cities[n].faction !== G.NONE && g.cities[n].officers.length >= minDef);
    if (to == null) continue;
    for (const id of [...c.officers, ...g.cities[to].officers]) g.officers[id].soldiers = 1000;
    const w = setupWar(g, { from: c.id, to, ids: [c.officers[0]], commander: c.officers[0], gold: 100, rice: 900000 });
    const f = new Field(g, w, null);
    const kong = f.units.find((u) => u.side === 'att'); kong.id = 109;
    g.officers[109].soldiers = 1000; g.officers[109].level = 8; g.officers[109].exp = 0;
    const foes = f.units.filter((u) => u.side === 'def');
    return { g, f, kong, foes, O: (u) => g.officers[typeof u === 'number' ? u : u.id] };
  }
  throw new Error('no suitable war');
}
const day = (f) => { f.endTurn(); return f.endTurn(); }; // two endTurn() calls make a day; the second reports it

test('奇门: every day 诸葛亮 is on the field the target loses 80–150 and he gains floor(Σ(left & 255) / 2)', () => {
  const { f, foes: [foe], O } = make();
  foe.qimen = 6; O(foe).soldiers = 1000;
  for (let d = 0; d < 6; d++) {
    const s0 = O(foe).soldiers, e0 = O(109).exp, n0 = foe.qimen;
    const rep = day(f);
    const left = O(foe).soldiers, loss = s0 - left;
    assert.equal(foe.qimen, n0 - 1);
    assert.ok(loss >= 80 && loss <= 150, `loss ${loss}`);
    assert.deepEqual(rep.qimen.map((x) => [x.u, x.loss]), [[foe, loss]]);
    assert.equal(O(109).exp - e0, Math.floor((left & 255) / 2));
  }
  // the day the count reached 0 still took soldiers; the day after takes none
  const s0 = O(foe).soldiers, e0 = O(109).exp, rep = day(f);
  assert.equal(foe.qimen, 0); assert.equal(O(foe).soldiers, s0); assert.deepEqual(rep.qimen, []); assert.equal(O(109).exp, e0);
});

test('奇门: with 诸葛亮 off the field nothing is taken, the count stays, and the target still cannot move', () => {
  const { f, foes: [foe], O } = make();
  foe.qimen = 6; O(foe).soldiers = 1000; f.kongmingOn = () => false;
  const e0 = O(109).exp, rep = day(f);
  assert.equal(O(foe).soldiers, 1000); assert.equal(foe.qimen, 6); assert.deepEqual(rep.qimen, []); assert.equal(O(109).exp, e0);
  assert.equal(f.reach(foe).dist.size, 1);
});

test('奇门: 诸葛亮 won over to the other side still drains it', () => {
  const { f, kong, foes: [foe], O } = make();
  kong.side = 'def'; foe.side = 'att'; foe.qimen = 6; O(foe).soldiers = 1000;
  assert.ok(f.kongmingOn());
  const rep = day(f), loss = 1000 - O(foe).soldiers;
  assert.ok(loss >= 80 && loss <= 150); assert.deepEqual(rep.qimen.map((x) => [x.u, x.loss]), [[foe, loss]]);
});

test('奇门: a target at 0 soldiers loses 0, the count still drops, and the report lists loss 0', () => {
  const { f, foes: [foe], O } = make();
  foe.qimen = 3; O(foe).soldiers = 0;
  const e0 = O(109).exp, rep = day(f);
  assert.equal(foe.qimen, 2); assert.deepEqual(rep.qimen.map((x) => [x.u, x.loss]), [[foe, 0]]);
  assert.equal(O(109).exp, e0); // left & 255 = 0
});

test('奇门: two targets add their low bytes before the halving', () => {
  const { f, foes: [a, b], O } = make(2);
  a.qimen = b.qimen = 5; O(a).soldiers = 1000; O(b).soldiers = 700;
  const e0 = O(109).exp, rep = day(f);
  assert.equal(rep.qimen.length, 2);
  assert.equal(O(109).exp - e0, Math.floor(((O(a).soldiers & 255) + (O(b).soldiers & 255)) / 2));
});
