// 离间 / 诱纳 target tree (试着提交留言@devblog #591): the cities start folded, one open at a time, and the last target's
// city reopens with his row in view — for either command — so a city far down is not a long scroll past open tables each time.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startGame, newCampaign, cmd } from './game.mjs';

let game, page;
before(async () => {
  game = await startGame(); page = await game.open();
  await page.evaluate(async () => { (await import('./src/pace.js')).setPace(4); (await import('./src/vignette.js')).setVignettes(false); });
  await newCampaign(page);
  await page.waitForFunction(() => !document.querySelector('.banner'), null, { timeout: 20000 });
  await page.evaluate(() => { window.__game.g.books = 12; });
});
after(() => game?.close());

const cancel = () => page.keyboard.press('Escape');
const openCities = () => page.locator('.shade .tc[open]').evaluateAll((n) => n.map((x) => Number(x.dataset.city)));

test('folded at first, one city open at a time, the last target reopened by the other command', async () => {
  await cmd(page, '谋', '离间');
  await page.locator('.otree').waitFor();
  assert.deepEqual(await openCities(), [], 'no city opens with its table the first time');
  const cities = page.locator('.shade .tc > summary'), n = await cities.count();
  assert.ok(n >= 3, 'several enemy cities to fold');
  await cities.nth(0).click(); await cities.nth(n - 1).click();
  await page.waitForTimeout(50);
  const last = await page.locator('.shade .tc').nth(n - 1).getAttribute('data-city');
  assert.deepEqual(await openCities(), [Number(last)], 'opening a city folds the one open before');
  // The lowest city's first officer who is not a ruler: picked, then the executor list given up.
  const row = page.locator('.shade .tc[open] tr[tabindex][data-id]').first(), mark = Number(await row.getAttribute('data-id'));
  await row.click();
  await page.locator('.modal').filter({ hasText: '派谁执行' }).waitFor();
  await cancel();
  await page.waitForFunction(() => !document.querySelector('.shade'));

  await cmd(page, '谋', '诱纳');
  await page.locator('.otree').waitFor();
  assert.deepEqual(await openCities(), [Number(last)], 'his city is the one open');
  const focused = page.locator(`.shade tr[data-id="${mark}"]`);
  await page.waitForFunction((id) => document.activeElement?.dataset?.id === String(id), mark);
  assert.match(await focused.textContent(), /上次/);
  await page.waitForFunction((id) => { // scrolled there a frame after the dialog opens
    const r = document.querySelector(`.shade tr[data-id="${id}"]`), a = r.getBoundingClientRect(), b = r.closest('.otree').getBoundingClientRect();
    return a.top >= b.top && a.bottom <= b.bottom;
  }, mark, { timeout: 3000 });
  await cancel();
  assert.deepEqual(page.errors ?? [], []);
});
