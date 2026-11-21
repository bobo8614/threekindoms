import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startGame, newCampaign } from './game.mjs';

test('the folded phone city panel shows the full officer and troop counts', async () => {
  const game = await startGame({ width: 667, height: 360 });
  try {
    const page = await game.open('&phone');
    await newCampaign(page);
    const panel = page.locator('.citypanel');
    const counts = panel.locator('[data-k="武将"], [data-k="正规军"]');
    const clipped = () => counts.evaluateAll((nodes) => nodes.filter((node) => {
      const row = node.getBoundingClientRect(), panel = node.closest('.citypanel').getBoundingClientRect();
      return row.height === 0 || row.top < panel.top - 1 || row.bottom > panel.bottom + 1;
    }).map((node) => node.dataset.k));

    assert.equal(await counts.count(), 2);
    assert.equal(await page.locator('body.city-open').count(), 0);
    assert.deepEqual(await clipped(), []);
    await panel.locator('header').click();
    assert.equal(await page.locator('body.city-open').count(), 1);
    assert.ok(await panel.locator('.roster .off').first().isVisible());
    assert.deepEqual(await clipped(), []);
    await panel.locator('header').click();
    assert.equal(await page.locator('body.city-open').count(), 0);
    assert.deepEqual(await clipped(), []);
    assert.deepEqual(page.errors, []);
  } finally {
    await game.close();
  }
});
