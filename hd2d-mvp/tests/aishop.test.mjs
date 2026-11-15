// The AI buys from its own stock table (ROM 0x164E0/0x164FE), not the player's shop (devblog #130, 2026-11-04). The two
// differ at 建业 and 涪陵, the only city shops with 关王刀 and 蛇矛, which the AI's table does not hold.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as G from '../src/core/game.js';
import { equip } from '../src/core/ai.js';
G.setData(JSON.parse(readFileSync(new URL('../data/game-data.json', import.meta.url))));
const D = G.data(), SPECIAL = [15, 22, 23, 30], JIANYE = 15, FULING = 27;

// A city with one officer holding `weapon`, rich enough to buy all it may.
function shopper(cid, weapon) {
  const g = G.newGame(4, 1, 1), c = g.cities[cid], id = g.officers.find((o) => o.status === G.SERVING).id;
  for (const x of g.cities) x.officers = x.officers.filter((o) => o !== id);
  c.officers = [id]; c.gold = 9999;
  Object.assign(g.officers[id], { weapon, armor: 7 }); // top armour: only the weapon can move
  equip(g, c, () => 0, () => true);
  return g.officers[id].weapon;
}

test('the AI table holds 16 items in every city with a weapon shop, none of them special', () => {
  for (const c of D.cities) {
    assert.equal(c.ai_shop.length, c.facilities.weapons ? 16 : 0, c.name);
    assert.deepEqual(c.ai_shop.filter((e) => SPECIAL.includes(e)), [], c.name);
  }
});
test('only 建业 and 涪陵 sell the player anything the AI table lacks', () => {
  const differ = D.cities.filter((c) => JSON.stringify(c.ai_shop) !== JSON.stringify(c.shop)).map((c) => c.id);
  assert.deepEqual(differ, [JIANYE, FULING]);
});
test('the AI at 建业 does not buy 关王刀, and its 枪 stop at 战斧', () => {
  assert.equal(shopper(JIANYE, 8), 11, '刀 up to 钩镰刀, the last on its table');
  assert.equal(shopper(JIANYE, 11), 11, '钩镰刀 stays: 关王刀 is not for sale');
  assert.equal(shopper(JIANYE, 16), 19, '枪 up to 战斧, not the player\'s 双钩枪');
});
test('the AI at 涪陵 does not buy 蛇矛', () => {
  assert.equal(shopper(FULING, 16), 19);
  assert.equal(shopper(FULING, 19), 19);
});
test('elsewhere the AI buys as before', () => {
  assert.equal(shopper(4, 10), 13, '冀州 sells the upper table');
  assert.equal(shopper(1, 0), 3, '幽州 the lower one');
});
