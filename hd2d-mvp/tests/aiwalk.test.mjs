// The war AI's sidestep round its own officer (the remake's N07 deviation from `A60C`, src/core/field.js approach())
// must get the walker past, not walk him to and fro. A player's recording of 冀州 (2026-11-17) showed 曹丕 and 田丰
// spending the whole day's 机动力 stepping one cell aside and back, every day until the 30-day limit. Rules only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as G from '../src/core/game.js';
import { Field, PLAIN, RIVER } from '../src/core/field.js';
const D = JSON.parse(readFileSync(new URL('../data/game-data.json', import.meta.url)));
G.setData(D);
const JI = D.cities.findIndex((c) => c.name === '冀州'), oid = (n) => D.officers.findIndex((o) => o.name === n);

// 冀州 attacked from the south-west: 曹丕 commands with 田丰, six defenders stay in their castle (the player ended each day).
function war(more = []) {
  const g = G.newGame(4, 1, 1);
  const def = ['黄忠', '曹彰', '王双', '颜良', '周仓', '蒋干'].map(oid), att = ['曹丕', '田丰', ...more].map(oid);
  for (const id of def) g.officers[id].soldiers = 1100;
  for (const id of att) Object.assign(g.officers[id], { soldiers: 1000, hp: 100 });
  const f = new Field(g, { city: JI, from: 11, attacker: 2, defender: 3, att: { ids: att, gold: 0, rice: 866 }, def: { ids: def, gold: 6627, rice: 8351 } }, 'def');
  const lead = f.units.find((u) => u.id === att[0]), aide = f.units.find((u) => u.id === att[1]), third = f.units.find((u) => u.id === att[2]);
  f.adjustRoles = () => {}; // the roles under test are set by hand
  return { f, lead, aide, third, foe: f.units.find((u) => u.side === 'def' && u.commander) };
}
// Three attacker days on 30 机动力 each (the commander waits out a quarter of his decisions, so one day may be idle):
// every move, and the moves that took an officer back onto a cell he had stood on.
function days(f, n = 3) {
  const seen = new Map(f.units.map((u) => [u, new Set([`${u.x},${u.y}`])])), back = [], moves = [];
  for (let d = 0; d < n; d++) {
    f.pool.att = 30; f.turn = 'att';
    for (const a of f.aiActions('att')) {
      if (a.type !== 'move') continue;
      const k = `${a.u.x},${a.u.y}`; moves.push(`${D.officers[a.u.id].name}→${k}`);
      if (seen.get(a.u).has(k)) back.push(`${D.officers[a.u.id].name}→${k}`);
      seen.get(a.u).add(k);
    }
  }
  return { moves, back };
}
const gap = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

for (const role of [3, 4]) {
  test(`an escort (role ${role}) standing in his commander's way lets him past: nobody steps back and forth, the commander closes in`, () => {
    const { f, lead, aide, foe } = war();
    Object.assign(lead, { x: 2, y: 14 }); Object.assign(aide, { x: 3, y: 14, role }); // as in the recording
    const was = gap(lead, foe);
    const { moves, back } = days(f);
    assert.deepEqual(back, [], `no cell is entered twice (${moves.join(' ')})`);
    assert.ok(gap(lead, foe) <= was - 4, `曹丕 is at least 4 cells nearer 黄忠 (${was} → ${gap(lead, foe)}; ${moves.join(' ')})`);
    assert.ok(Math.max(Math.abs(aide.x - lead.x), Math.abs(aide.y - lead.y)) <= 2, 'and 田丰 still follows him');
  });
}

// Two escorts can box the commander in after his sidestep: one holds the cell ahead, the cell he left is behind him.
// The idle escort then steps off his line (makeWay()). Layouts: both ahead on his row; one ahead, one on the sidestep's row.
for (const [name, a, b] of [['both ahead of him', [3, 14], [4, 14]], ['ahead and beside his way round', [3, 14], [3, 15]], ['ahead and above', [3, 14], [3, 13]]]) {
  test(`a commander with two escorts in his way (${name}) is not boxed in`, () => {
    const { f, lead, aide, third, foe } = war(['许褚']);
    Object.assign(lead, { x: 2, y: 14 }); Object.assign(aide, { x: a[0], y: a[1], role: 3 }); Object.assign(third, { x: b[0], y: b[1], role: 4 });
    const was = gap(lead, foe);
    const { moves } = days(f, 4);
    assert.ok(gap(lead, foe) <= was - 4, `曹丕 is at least 4 cells nearer 黄忠 (${was} → ${gap(lead, foe)}; ${moves.join(' ')})`);
    const turns = moves.filter((m, i) => moves.indexOf(m) !== i);
    assert.ok(turns.length <= 1, `nobody walks to and fro (${moves.join(' ')})`);
  });
}

test('a walker who sidestepped a standing officer does not step back onto the cell he left, though it is the cheaper one', () => {
  const { f, lead, aide, foe } = war();
  // 曹丕 (山军: 平 3, 水 6) at (3,15) walks east along row 15; 田丰 has finished his errand (role 7) and stands on (4,15).
  // The only cheap sidestep is north to (3,14), from where east is 水 (6) and back south is 平 (3).
  assert.deepEqual([f.terr(3, 15), f.terr(3, 14), f.terr(4, 14), f.terr(3, 16)], [PLAIN, PLAIN, RIVER, RIVER], 'the terrain this case relies on');
  Object.assign(lead, { x: 3, y: 15, role: 1 }); Object.assign(aide, { x: 4, y: 15, role: 7 });
  f.castle = () => [20, 15];
  const { moves, back } = days(f);
  assert.deepEqual(back, [], `no cell is entered twice (${moves.join(' ')})`);
  assert.ok(lead.x >= 6, `曹丕 is past 田丰 (${moves.join(' ')})`);
  assert.equal(foe.gone, false);
});

test('two officers walking toward each other on one line still get past each other (N07)', () => {
  const { f, lead, aide } = war();
  Object.assign(lead, { x: 6, y: 14 }); // east to 黄忠 in the castle at (20,14)
  Object.assign(aide, { x: 8, y: 14, role: 5, mission: { kind: 'rice', x: 0, y: 14, home: 1 } }); // west along the same row
  const { moves, back } = days(f);
  assert.deepEqual(back, [], `no cell is entered twice (${moves.join(' ')})`);
  assert.ok(lead.x > aide.x, `they have passed each other (${moves.join(' ')})`);
});
