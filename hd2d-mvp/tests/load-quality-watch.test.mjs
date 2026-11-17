// The real frame-rate watch runs during a read/reload; webdriver normally disables it in browser tests.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { skipIntro, startGame } from './game.mjs';

let game;
before(async () => { game = await startGame(); });
after(() => game?.close());

test('the frame-rate watch does not throw while a quick record reloads', async () => {
  const page = await game.open('', { setup: async (ctx) => {
    await ctx.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      window.__splash = false;
    });
  } });
  try {
    await page.evaluate(() => {
      const { G } = window.__game;
      const g = G.newGame(4, 1, 3);
      g.cities[g.factions[g.player].city].gold = 1234;
      G.saveQuick(g);
    });
    await skipIntro(page);
    page.errors.length = 0;
    await page.keyboard.press('F8');
    const dialog = page.locator('.shade .modal');
    await dialog.waitFor({ timeout: 10000 });
    await Promise.all([page.waitForEvent('load', { timeout: 30000 }), dialog.locator('.btn.primary').click()]);
    await page.waitForFunction(() => document.body.dataset.screen === 'strategy' && window.__game?.g, null, { timeout: 60000 });
    await page.waitForTimeout(500);
    const gold = await page.evaluate(() => { const g = window.__game.g; return g.cities[g.factions[g.player].city].gold; });
    assert.equal(gold, 1234, 'the chosen quick record was opened');
    assert.deepEqual(page.errors, [], 'the live watch must not dereference an unready war during reload');
  } finally { await page.context().close(); }
});
