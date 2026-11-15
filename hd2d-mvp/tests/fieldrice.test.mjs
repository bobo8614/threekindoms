// 战场米店 buys and sells (D30, PepperLoveSalt@devblog #216, 2026-11-10). The original's field shop has both menus: bank9
// `$C0BB` state 1 buys through `$C21B`, state 2 sells through `$C2C0` → `$C2F2`, which takes q rice from the side's 军粮 and
// adds floor(q × s / 100) to its 军资金 (research/war-maps-movement-evidence.md §5). The figures are those the original
// gave for three cities and both sides (docs/review-assets/2026-11-10/devblog-213-219/native-results.json). Rules only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as G from '../src/core/game.js';
import { Field } from '../src/core/field.js';
import { setupWar } from '../src/core/warcore.js';
const D = JSON.parse(readFileSync(new URL('../data/game-data.json', import.meta.url)));
G.setData(D);

// A war for city `to` with the player on `human`, one of the player's generals standing on its 米店.
function at(to, human) {
  const g = G.newGame(4, 1, 1), city = g.cities[to];
  const from = g.cities.find((c) => c.faction !== G.NONE && c.faction !== city.faction && c.officers.length);
  if (city.faction === G.NONE || !city.officers.length) { city.faction = g.cities.find((c) => c.faction !== G.NONE && c.faction !== from.faction).faction; city.officers = [g.cities.find((c) => c.faction === city.faction && c.officers.length > 1).officers.pop()]; }
  const id = from.officers[0];
  const f = new Field(g, setupWar(g, { from: from.id, to, ids: [id], commander: id, gold: 50, rice: 400 }), human);
  const shop = f.villages.find((v) => v.kind === '米店'), u = f.alive.find((x) => x.side === human);
  Object.assign(f.chest(human), { gold: 50, rice: 400 });
  return { f, u, shop, ch: f.chest(human), put: () => { u.x = shop.x; u.y = shop.y; } };
}

for (const [city, gold] of [[2, 125], [4, 146], [12, 136]]) for (const side of ['att', 'def']) {
  test(`${D.cities[city].name}, ${side}: 100 rice sold from 金50 米400 leaves 金${gold} 米300, as in the original`, () => {
    const { f, u, ch, put } = at(city, side); put();
    assert.equal(f.sellRice(u, 100), '卖米 100');
    assert.deepEqual({ gold: ch.gold, rice: ch.rice }, { gold, rice: 300 });
    const other = f.chest(side === 'att' ? 'def' : 'att'), was = { ...other };
    f.sellRice(u, 50);
    assert.deepEqual({ ...other }, was, 'the other side\'s chest is untouched');
  });
}

test('no more than the rice held is sold, the gold stops at 9999, and nothing is sold away from the shop', () => {
  const { f, u, ch, put } = at(2, 'att');
  assert.equal(f.sellRice(u, 100), '无法卖米', 'not on the 米店');
  assert.deepEqual({ gold: ch.gold, rice: ch.rice }, { gold: 50, rice: 400 });
  put();
  assert.equal(f.sellRice(u, 0), '军粮不足');
  assert.equal(f.sellRice(u, 5000), '卖米 400');
  assert.deepEqual({ gold: ch.gold, rice: ch.rice }, { gold: 50 + 300, rice: 0 });
  Object.assign(ch, { gold: 9990, rice: 400 });
  f.sellRice(u, 400);
  assert.deepEqual({ gold: ch.gold, rice: ch.rice }, { gold: 9999, rice: 0 }, 'the gold over 9999 is lost, as on the strategy map');
});

test('buying at the same shop is unchanged: 100 gold buys the city\'s rate', () => {
  const { f, u, ch, put } = at(2, 'att'); put();
  assert.equal(f.buyRice(u, 43), '买米 43');
  assert.deepEqual({ gold: ch.gold, rice: ch.rice }, { gold: 50 - Math.floor(4300 / 86), rice: 443 });
});
