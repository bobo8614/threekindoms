// 「敌军来袭」: when an AI faction marches on the player, the struck city's governor brings the news, not the
// attacker's commander (已试玩中@devblog #592), and the window says who leads, with how many, from where.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startGame, newCampaign } from './game.mjs';

let game, page;
before(async () => { game = await startGame(); page = await game.open(); await newCampaign(page); });
after(() => game?.close());

test('the governor of the city attacked tells of the attack', async () => {
  const want = await page.evaluate(() => {
    const { g, G, io, debug } = window.__game, P = g.player, home = g.factions[P].city;
    const from = G.roads(home).map((c) => g.cities[c]).find((c) => c.faction !== P && c.faction != null && c.officers.length)
      ?? g.cities.find((c) => c.faction !== P && c.faction != null && c.officers.length);
    const ids = from.officers.slice(0, 2);
    ids.forEach((id, i) => (g.officers[id].soldiers = 300 + 100 * i));
    const nm = (id) => G.name(id), want = { gov: nm(g.cities[home].officers[0]), lead: nm(ids[0]), troops: 300 + 400 };
    const w = debug.setupWar(g, { from: from.id, to: home, ids, commander: ids[0], gold: 100, rice: 400 });
    io.war(w); // left at its window: the test ends on it
    return want;
  });
  const box = page.locator('.panel.msg[aria-label="敌军来袭"]');
  await box.waitFor({ timeout: 5000 });
  await box.click(); // the text typed whole
  assert.equal(await box.locator('img').getAttribute('alt'), want.gov, 'the portrait is our governor\'s');
  const text = await box.locator('p').textContent();
  assert.match(text, new RegExp(`由${want.lead}统率`));
  assert.match(text, new RegExp(`合计兵力 ${want.troops}`));
  assert.match(text, new RegExp(`${want.gov}率军守城`));
});

test('no page errors', () => assert.deepEqual(page.errors, []));
