import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startGame, newCampaign, skipIntro } from './game.mjs';

// 系统 → 地图标签 (src/labelsize.js): the city tags follow the tier at once, the choice outlives a restart, and on a phone
// the finger's target round a tag keeps its size on screen when the tag itself is drawn small.
const tags = (page) => page.evaluate(() => [...document.querySelectorAll('.ctag')].filter((e) => e.getClientRects().length).map((e) => {
  const r = e.getBoundingClientRect(), b = getComputedStyle(e, '::before'), s = Number(e.style.getPropertyValue('--s'));
  return { s, h: r.height, hitH: r.height - 2 * parseFloat(b.top) * s, hitW: r.width - 2 * parseFloat(b.left) * s };
}));
const row = (page) => page.locator('.sysmenu-list .btn', { hasText: '地图标签' });

test('地图标签 resizes the city tags on a phone, keeps their touch target, and is remembered', async () => {
  const game = await startGame({ width: 667, height: 360 });
  try {
    const page = await game.open('&phone');
    await newCampaign(page);
    await page.waitForFunction(() => document.querySelector('.ctag')?.style.getPropertyValue('--s'));
    const normal = await tags(page);
    assert.ok(normal.length >= 30, 'every city has its tag');
    await page.click('.sysmenu-btn');
    await page.locator('.sysmenu-tabs .btn', { hasText: '画面' }).click();
    assert.match(await row(page).textContent(), /地图标签 标准/);
    await row(page).click(); // 标准 → 大
    assert.match(await row(page).textContent(), /地图标签 大/);
    await page.waitForFunction((s) => Number(document.querySelector('.ctag').style.getPropertyValue('--s')) > s * 1.1, normal[0].s);
    const large = await tags(page);
    assert.ok(Math.abs(large[0].s / normal[0].s - 1.2) < 0.01, `大 is 1.2 of 标准 (${large[0].s} / ${normal[0].s})`);
    await row(page).click(); // 大 → 小
    assert.match(await row(page).textContent(), /地图标签 小/);
    await page.waitForFunction((s) => Number(document.querySelector('.ctag').style.getPropertyValue('--s')) < s * 0.9, normal[0].s);
    const small = await tags(page);
    assert.ok(Math.abs(small[0].s / normal[0].s - 0.85) < 0.01, `小 is 0.85 of 标准 (${small[0].s} / ${normal[0].s})`);
    // The tag is slimmer than a finger at every tier; the unseen box round it is what a tap lands on.
    for (const [name, list] of [['小', small], ['标准', normal], ['大', large]]) {
      assert.ok(Math.min(...list.map((t) => t.hitH)) >= 30, `${name}: a tag's target is at least 30px tall (${Math.min(...list.map((t) => t.hitH))})`);
      assert.ok(Math.min(...list.map((t) => t.hitW)) >= 38, `${name}: and 38px wide (${Math.min(...list.map((t) => t.hitW))})`);
    }
    assert.equal(await page.evaluate(() => localStorage.getItem('hd2d-label-size')), 'small');
    assert.equal(await page.evaluate(() => document.body.style.getPropertyValue('--label-k')), '0.85');
    await page.reload(); await page.waitForFunction(() => window.__game?.debug, null, { timeout: 60000 });
    assert.equal(await page.evaluate(() => document.body.style.getPropertyValue('--label-k')), '0.85', 'the tier is back after a restart');
    assert.deepEqual(page.errors, []);
  } finally {
    await game.close();
  }
});

// The 白兵 squads' bars follow the tier too: the bar with its kind glyph, badges and numbers scales as one (src/ui.css .tk .sb).
test('地图标签 大 draws the 白兵 squads\' bars 1.2 times as large on a phone', async () => {
  const game = await startGame({ width: 667, height: 360 });
  try {
    const bars = async (size) => {
      const page = await game.open('&phone', { setup: (ctx) => ctx.addInitScript((s) => localStorage.setItem('hd2d-label-size', s), size) });
      await skipIntro(page);
      await page.evaluate(() => { window.__game.debug.quickTactical(51, 38, 5, { human: 'a' }); });
      await page.waitForSelector('.tq-formation, .tq-start', { timeout: 60000 });
      if (await page.locator('.tq-formation').count()) { await page.locator('.tq-form').first().click(); await page.locator('.tq-deploy:not(.arming)').click(); }
      await page.waitForSelector('.tq-start button', { timeout: 30000 });
      await page.waitForFunction(() => [...document.querySelectorAll('.tk .sb')].filter((e) => e.getBoundingClientRect().width).length > 3, null, { timeout: 15000 });
      const w = await page.evaluate(() => [...document.querySelectorAll('.tk:not(.gen) .sb')].map((e) => e.getBoundingClientRect().width).filter(Boolean));
      assert.deepEqual(page.errors, []);
      await page.context().close();
      return w;
    };
    const normal = await bars('normal'), large = await bars('large');
    assert.ok(normal.length > 3 && normal.every((w) => Math.abs(w - 28) < 0.5), `标准: the phone's 28px bar (${normal[0]})`);
    assert.ok(large.every((w) => Math.abs(w - 33.6) < 0.5), `大: 33.6px (${large[0]})`);
  } finally {
    await game.close();
  }
});
