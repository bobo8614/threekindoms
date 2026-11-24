// D176 (一光年的距离@devblog #642, 2026-11-22): a city whose 防灾 is full (99) takes no loss from a 旱灾 / 洪水, and the
// original says so (18:4D 「しかし ゴアンシンください／ヒガイは ありませんでした」, the governor glad). The settlement skipped the
// loss but wrote the city into the event as [cid, 0], and the window reads 10 as "held" (src/app.js showEvent), so the
// player was told 「大事不好」 with a grieving governor. Rule layer: the real settlement at 防灾 99, 98 and 0 for both
// kinds; what the window makes of it is tests/moods.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as G from '../src/core/game.js';
const D = JSON.parse(readFileSync(new URL('../data/game-data.json', import.meta.url)));
G.setData(D);

const LIST = { drought: D.rules.drought_cities, flood: D.rules.flood_cities };
const fields = (g, c) => ({ pop: c.pop, land: c.land, industry: c.industry, rice: c.rice, soldiers: c.officers.map((id) => g.officers[id].soldiers) });

// Every city of the kind's list held at the given 防灾 and stocked so that any loss shows; seeds walked until each is hit.
function strikes(kind, level) {
  const out = new Map();
  for (let seed = 1; seed < 400 && out.size < LIST[kind].length; seed++) {
    const g = G.newGame(0, 0, seed);
    for (const cid of LIST[kind]) {
      const c = g.cities[cid];
      if (c.faction === G.NONE) continue;
      Object.assign(c, { pop: 4000, land: 800, industry: 800, rice: 4000, disaster: level });
      for (const id of c.officers) g.officers[id].soldiers = 2000;
    }
    const before = new Map(LIST[kind].map((cid) => [cid, fields(g, g.cities[cid])]));
    for (const [cid, k] of G.disaster(g, kind)) if (!out.has(cid)) out.set(cid, { k, before: before.get(cid), after: fields(g, g.cities[cid]), disaster: g.cities[cid].disaster });
  }
  return out;
}

for (const kind of ['drought', 'flood']) {
  test(`${kind} at 防灾 99: no loss, reported as held (10), 防灾 still falls 10..15`, () => {
    const hit = strikes(kind, 99);
    assert.ok(hit.size >= 3, `struck ${hit.size} cities`);
    for (const [cid, s] of hit) {
      assert.equal(s.k, 10, `city ${cid} is reported as held`);
      assert.deepEqual(s.after, s.before, `city ${cid} lost nothing`);
      assert.ok(s.disaster >= 84 && s.disaster <= 89, `city ${cid} 防灾 99 → ${s.disaster}`);
    }
  });
  for (const level of [98, 0]) test(`${kind} at 防灾 ${level}: a loss, and not reported as held`, () => {
    const hit = strikes(kind, level);
    assert.ok(hit.size >= 3, `struck ${hit.size} cities`);
    for (const [cid, s] of hit) {
      assert.equal(s.k, level === 98 ? 8 : 0, `city ${cid}'s k`);
      assert.ok(s.after.pop < s.before.pop, `city ${cid} lost people`);
      if (kind === 'drought') assert.ok(s.after.land < s.before.land && s.after.soldiers.every((n, i) => n < s.before.soldiers[i]), `city ${cid} lost land and soldiers`);
      else assert.ok(s.after.industry < s.before.industry && s.after.rice < s.before.rice, `city ${cid} lost industry and rice`);
    }
  });
}
