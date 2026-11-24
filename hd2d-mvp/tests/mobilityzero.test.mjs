// 机动力用尽即结束本日（霸王之王@devblog, 2026-11-23）: in the original, once an action leaves the side's shared mobility at 0 its
// turn is over and the enemy moves (research/war-ai-evidence.md: A05E/A068 take 0 or less as the end of the side's turn). The
// player used to have to press 待机·结束本日 with nothing left to spend. A move that leaves points over keeps the turn.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startGame, newCampaign, closeMessages } from './game.mjs';

let game;
async function war() {
  const page = await game.open();
  await newCampaign(page);
  await page.evaluate(() => {
    const { g, G, debug } = window.__game, home = g.factions[g.player].city;
    const to = G.roads(home).map((c) => g.cities[c]).find((c) => c.faction !== g.player && c.faction !== G.NONE && c.officers.length);
    for (const id of [...g.cities[home].officers, ...to.officers]) g.officers[id].soldiers ||= 500;
    const ids = g.cities[home].officers.slice(0, 3);
    debug.fieldWar(debug.setupWar(g, { from: home, to: to.id, ids, commander: ids[0], gold: 100, rice: 400 }), 'att');
  });
  await page.waitForFunction(() => window.__game.war?.finishDeploy && document.body.dataset.screen === 'war', null, { timeout: 30000 });
  const stop = closeMessages(page);
  try {
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.__game.war.finishDeploy());
    await page.waitForFunction(() => { const f = window.__game.war.field; return f.turn === f.human && !document.querySelector('.banner, .panel.msg'); }, null, { timeout: 30000 });
  } finally { stop(); }
  return page;
}
// Gives the player's turn `left` points more than a move of his first general costs, and makes that move.
const moveLeaving = (page, left) => page.evaluate((left) => {
  const w = window.__game.war, f = w.field, u = f.side(f.human)[0];
  const [key, cost] = [...f.reach(u, 99).dist].filter(([k, d]) => d > 0 && !f.unitAt(...k.split(',').map(Number))).sort((a, b) => a[1] - b[1])[0];
  f.pool[f.human] = cost + left; w.clickCell(u.x, u.y);
  const [x, y] = key.split(',').map(Number); w.clickCell(x, y);
  return { day: f.day, cost };
}, left);

before(async () => { game = await startGame(); });
after(() => game?.close());

test('a move that spends the last of the mobility ends the day: the enemy moves without 待机', async () => {
  const page = await war();
  const { day } = await moveLeaving(page, 0);
  await page.waitForFunction(() => { const f = window.__game.war.field; return f.turn !== f.human; }, null, { timeout: 15000 });
  const log = await page.evaluate(() => document.querySelector('.logbox')?.textContent ?? '');
  assert.match(log, /机动力用尽/, 'the log says why the turn passed');
  assert.equal(await page.evaluate(() => window.__game.war.field.day), day, 'the attacker\'s turn passes to the defender the same day');
  await page.close();
});

test('a move that leaves mobility over keeps the turn', async () => {
  const page = await war();
  await moveLeaving(page, 1);
  await page.waitForFunction(() => !window.__game.war.st.busy, null, { timeout: 15000 });
  await page.waitForTimeout(800);
  const s = await page.evaluate(() => { const f = window.__game.war.field; return { mine: f.turn === f.human, pool: f.pool[f.human] }; });
  assert.deepEqual(s, { mine: true, pool: 1 });
  await page.close();
});
