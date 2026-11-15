import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as G from '../src/core/game.js';

const D = JSON.parse(readFileSync(new URL('../data/game-data.json', import.meta.url)));
G.setData(D);

test('study reports the same 智力 attribute shown on officer cards', () => {
  const g = G.newGame(4, 1, 1);
  const cid = D.cities.findIndex((c) => c.facilities.school);
  const id = g.cities[cid].officers[0] ?? g.factions[g.player].ruler;
  g.cities[cid].gold = 100;
  g.officers[id].int = 50;
  const result = G.study(g, cid, id);
  assert.equal(result.ok, true);
  assert.match(result.msg, /智力 \+\d+/);
  g.officers[id].int = 80;
  assert.match(G.study(g, cid, id).msg, /智力80/);
});
