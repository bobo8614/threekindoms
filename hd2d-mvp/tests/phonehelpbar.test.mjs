// Two phone fixes of 2026-11-17. The 说明 filled a phone's screen with no button to leave it: it closed only on Esc or a click on
// the backdrop, and a phone has neither (Wrz0903@bilibili); it also opened on the mouse's page. And the 战略地图's top bar lay
// over the north of the map: the view was centred on the whole window, not on what the bar leaves of it (both maps).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startGame, newCampaign } from './game.mjs';

let game;
before(async () => { game = await startGame({ width: 727, height: 335 }); });
after(() => game?.close());
const open = (quality = 'low') => game.open('&phone', { setup: (c) => c.addInitScript((v) => { localStorage.setItem('hd2d-quality', v); localStorage.setItem('hd2d-quality-asked', '1'); }, quality) });

test('phone: the 说明 opens on the 触屏 page and its 关闭 is in view from top to bottom and closes it', async () => {
  const page = await open();
  try {
    await newCampaign(page);
    await page.click('.sysmenu-btn');
    await page.evaluate(() => [...document.querySelectorAll('.sysmenu-list [role=menuitem]')].find((b) => b.textContent.trim() === '说明').click());
    await page.waitForSelector('.modal .ctl');
    assert.equal(await page.locator('.ctl-kind .on').textContent(), '触屏');
    assert.ok(await page.locator('.ctl-touch .ctl-key').count() >= 4, 'the touch page lists its gestures');
    const inView = () => page.evaluate(() => { const b = document.querySelector('.modal .foot .btn'), r = b.getBoundingClientRect(), at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return r.top >= 0 && r.bottom <= innerHeight && (at === b || b.contains(at)); });
    assert.equal(await inView(), true, '关闭 at the top of the help');
    await page.evaluate(() => { document.querySelector('.modal').scrollTop = 1e6; }); await page.waitForTimeout(200);
    assert.equal(await inView(), true, '关闭 at the bottom of the help');
    await page.locator('.modal .foot .btn', { hasText: '关闭' }).click();
    await page.waitForFunction(() => !document.querySelector('.modal'));
    assert.deepEqual(page.errors, []);
  } finally { await page.context().close(); }
});

// A city's place on screen with the bar there and with it gone: the view's middle goes down by half the bar.
for (const quality of ['low', 'high']) test(`phone, ${quality === 'low' ? 'flat' : '3D'} 战略地图: the view is centred below the top bar`, async () => {
  const page = await open(quality);
  try {
    await newCampaign(page); await page.waitForTimeout(2500);
    assert.equal(await page.evaluate(() => !!window.__game.strategy.flat), quality === 'low');
    // the town nearest the middle of the picture (off it the 3D map's perspective stretches the shift)
    const id = await page.evaluate(() => { const s = window.__game.strategy, mid = (innerHeight + document.querySelector('.topbar').getBoundingClientRect().bottom) / 2;
      return window.__game.g.cities.map((c) => ({ id: c.id, d: Math.hypot(s.screenOfCity(c.id).x - innerWidth / 2, s.screenOfCity(c.id).y - mid) })).sort((a, b) => a.d - b.d)[0].id; });
    const at = () => page.evaluate((id) => window.__game.strategy.screenOfCity(id).y, id);
    const bar = await page.evaluate(() => document.querySelector('.topbar').getBoundingClientRect().bottom);
    const shown = await at();
    await page.addStyleTag({ content: '.topbar { display: none !important; }' }); await page.waitForTimeout(2000);
    const gone = await at();
    assert.ok(Math.abs(shown - gone - bar / 2) < 4, `down by half the bar (${bar}px): ${shown} with it, ${gone} without`);
    assert.deepEqual(page.errors, []);
  } finally { await page.context().close(); }
});
