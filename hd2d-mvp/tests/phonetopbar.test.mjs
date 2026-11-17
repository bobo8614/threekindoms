// The phone 战略地图 top bar keeps every figure in view (会吹管的松鼠@bilibili, D88, 2026-11-17): at 667×360 兵, 金 and 米 were
// cut off under the bar's edge, because the turn's words and 「命令书」, meant to be put away on a phone (src/phone.css), were
// bare text that a selector cannot hide. Short of room the figures break onto a second line, 金 米 under 城 将 兵.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startGame, newCampaign } from './game.mjs';

let game, page;
before(async () => {
  game = await startGame({ width: 667, height: 360 }); page = await game.open('&phone'); await newCampaign(page);
  // six-figure totals, about the most a realm reaches (a city holds at most 9999 gold)
  await page.evaluate(() => {
    const { g, G } = window.__game, mine = G.citiesOf(g, g.player);
    mine.forEach((c, i) => { c.gold = i ? 0 : 409959; c.rice = i ? 0 : 409959; });
    mine.flatMap((c) => c.officers).forEach((id, i) => { g.officers[id].soldiers = i ? 0 : 999999; });
  });
});
after(() => game?.close());

for (const [w, h] of [[568, 320], [667, 360], [730, 360]]) test(`at ${w}×${h} every figure and button of the top bar is in full view`, async () => {
  await page.setViewportSize({ width: w, height: h });
  await page.evaluate(() => window.__game.debug.hud());
  await page.waitForTimeout(150);
  const m = await page.evaluate(() => {
    const bar = document.querySelector('.topbar'), b = bar.getBoundingClientRect(), r = bar.querySelector('.res').getBoundingClientRect();
    const out = (el, box) => { const q = el.getBoundingClientRect(); return q.right > box.right + 0.5 || q.bottom > box.bottom + 0.5 || q.left < box.left - 0.5; };
    return { cut: [...bar.querySelectorAll('.res [data-k], .res .resg > span')].filter((s) => out(s, r) || out(s, b)).map((s) => s.textContent),
      buttons: [...bar.querySelectorAll('.tbtns .btn')].filter((s) => out(s, b)).map((s) => s.textContent),
      height: Math.round(b.height), turnShown: !!bar.querySelector('.who.turn')?.offsetWidth, sys: document.querySelector('.sysbtns').getBoundingClientRect().left - b.right };
  });
  assert.deepEqual(m.cut, [], 'no figure under the edge');
  assert.deepEqual(m.buttons, []);
  assert.ok(m.height <= 40, `the bar stays low: ${m.height} px`);
  assert.equal(m.turnShown, false, "the turn's words are put away on a phone");
  assert.ok(m.sys >= 0, 'clear of ☰ 系统');
  assert.deepEqual(page.errors, []);
});
