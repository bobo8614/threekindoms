// On a short phone screen the six-row command lists (军, 町) ran past the list's edge: 任命, the last of 军, sat below
// it, and a WebView shows no scrollbar, so it looked gone (APK 0.4.3). The rows now grow shorter to fit (phone.css).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startGame, newCampaign, openCmds, cmdRow } from './game.mjs';

const fits = (page) => page.evaluate(() => {
  const a = document.querySelector('.dock .acts'), r = a.getBoundingClientRect();
  return { rows: [...a.querySelectorAll('.cmd')].filter((b) => b.getBoundingClientRect().bottom > r.bottom + 0.5).map((b) => b.querySelector('b').textContent),
    more: a.classList.contains('more'), h: Math.round(a.querySelector('.cmd').getBoundingClientRect().height) };
});

test('phone: every row of 军 and 町 shows on a 360 px high screen', async () => {
  const game = await startGame({ width: 800, height: 360 });
  try {
    const page = await game.open('&phone');
    await newCampaign(page);
    for (const t of ['军', '町']) {
      await openCmds(page, t);
      const f = await fits(page);
      assert.deepEqual(f.rows, [], `${t}: rows below the list's edge`);
      assert.equal(f.more, false);
      assert.ok(f.h >= 34, `${t}: rows ${f.h} px high`);
    }
    await openCmds(page, '军');
    assert.ok(await cmdRow(page, '任命').isVisible());
    assert.deepEqual(page.errors, []);
  } finally {
    await game.close();
  }
});

test('phone: rows keep their full height where they fit, and fade at the foot where even short rows do not', async () => {
  const game = await startGame({ width: 915, height: 412 });
  try {
    const page = await game.open('&phone');
    await newCampaign(page);
    await openCmds(page, '军');
    let f = await fits(page);
    assert.deepEqual(f.rows, []); assert.equal(f.h, 44);
    await page.setViewportSize({ width: 700, height: 300 });
    await page.locator('.dock .tabs .btn', { hasText: '军' }).click(); await openCmds(page, '军');
    f = await fits(page);
    assert.equal(f.h, 34); assert.ok(f.rows.length > 0); assert.equal(f.more, true);
    await page.locator('.dock .acts').evaluate((a) => { a.scrollTop = a.scrollHeight; });
    await page.waitForFunction(() => !document.querySelector('.dock .acts').classList.contains('more'));
    assert.deepEqual(page.errors, []);
  } finally {
    await game.close();
  }
});
