// 出阵 plays its own 命令演出, depart (82游戏电影圈的TONY老师@devblog #818): the book blinks and burns once, the picture
// opens with 出阵's phrase on its first frame (the original's `$B263`, once, no longer before the commander's window too),
// and the war's 出阵 window follows. The original writes that phrase (`$B263`) before it tells an empty city from a war
// (`$B5B5`), so taking an empty city plays the picture and phrase too, then 占领's banner. Shots go to OUT when it is set.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startGame, newCampaign, cmd } from './game.mjs';

const OUT = process.env.OUT;
let game, page;
before(async () => { game = await startGame({ width: 1440, height: 900 }); page = await game.open(); await newCampaign(page, '曹操'); }, { timeout: 180000 });
after(() => game?.close());

const spy = () => page.evaluate(() => { const a = window.__game.audio; a.__cue ||= a.cue.bind(a); window.__cues = []; a.cue = (k, ...r) => { window.__cues.push(k); return a.__cue(k, ...r); }; });
const own = () => page.evaluate(() => window.__game.g.factions[window.__game.g.player].city);
const openCity = (id) => page.evaluate((id) => [...document.querySelectorAll('.ctag')].find((e) => e.firstChild?.textContent === window.__game.G.cityName(id)).click(), id);
// past each show: a key jumps to its last frame, and at 原版 it then waits for another (▼)
async function pastShow() { for (let i = 0; i < 20 && (await page.locator('.vig.floating, .vig-book').count()); i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(400); } }

// First, so the war test after it still has officers at home: one officer goes.
test('出阵 on an empty city plays the depart picture and phrase once, spends one book, then 占领', { timeout: 60000 }, async () => {
  const at = await own();
  const { to, books } = await page.evaluate((at) => {
    const { g, G, strategy } = window.__game, to = G.roads(at).find((n) => g.cities[n].faction !== g.player);
    Object.assign(g.cities[to], { faction: G.NONE, officers: [] }); strategy.refresh(g);
    return { to: G.cityName(to), books: g.books };
  }, at);
  await spy(); await openCity(at);
  await cmd(page, '军', '出阵');
  await page.locator('.mappick .chips .btn', { hasText: to }).first().evaluate((b) => b.click());
  const ruler = await page.evaluate(() => window.__game.g.factions[window.__game.g.player].ruler); // he stays: the war test sets out from here
  await page.locator(`.otable-wrap tbody tr:not([data-id="${ruler}"])`).first().click(); await page.getByRole('button', { name: '确定' }).click();
  await page.locator('.modal .btn.primary', { hasText: '出阵' }).click();
  await page.waitForSelector('.vig.floating[data-scene="depart"]', { timeout: 10000 });
  await pastShow();
  await page.waitForSelector('.banner', { timeout: 5000 });
  const r = await page.evaluate(() => ({ cues: window.__cues, books: window.__game.g.books, banner: document.querySelector('.banner')?.textContent }));
  assert.deepEqual(r.cues, ['cue-sortie']);
  assert.equal(r.books, books - 1);
  assert.equal(r.banner, `占领${to}`);
  await page.waitForFunction(() => !document.querySelector('.banner'));
});

test('出阵 plays the depart picture with its phrase once, spends one book, then the war opens', { timeout: 90000 }, async () => {
  const at = await own();
  const { to, books } = await page.evaluate((at) => {
    const { g, G } = window.__game;
    return { to: G.cityName(G.roads(at).find((n) => g.cities[n].faction !== g.player && g.cities[n].faction !== G.NONE)), books: g.books };
  }, at);
  await spy(); await openCity(at);
  await cmd(page, '军', '出阵');
  await page.locator('.mappick .chips .btn', { hasText: to }).first().evaluate((b) => b.click()); // the list is there for the keys
  await page.getByRole('button', { name: '全选' }).click(); await page.getByRole('button', { name: '确定' }).click();
  const chief = page.getByRole('button', { name: '确定' }); // 任命总大将: the first offered
  if (await page.locator('.shade', { hasText: '任命总大将' }).count()) { await page.locator('.shade .btn:not(.primary)').first().click(); await chief.click(); }
  await page.locator('.modal .btn.primary', { hasText: '出阵' }).click();
  await page.waitForSelector('.vig-book');
  assert.deepEqual(await page.evaluate(() => window.__cues), [], 'no phrase during the book\'s blink');
  await page.waitForSelector('.vig.floating[data-scene="depart"]', { timeout: 10000 });
  await page.waitForTimeout(400);
  if (OUT) await page.screenshot({ path: `${OUT}/depart-open.png` });
  const during = await page.evaluate(() => ({ cues: window.__cues, books: window.__game.g.books, shown: document.querySelector('.topbar .books + b')?.textContent, cap: document.querySelector('.vig-cap')?.textContent }));
  assert.ok('出阵……'.startsWith(during.cap), during.cap);
  assert.deepEqual(during.cues, ['cue-sortie']);
  assert.equal(String(during.shown), String(books - 1), 'the counter told the book spent');
  assert.equal(during.books, books, 'the book is taken once the picture has played, as spend() does');
  await page.waitForTimeout(3500);
  if (OUT) await page.screenshot({ path: `${OUT}/depart-late.png` });
  await pastShow();
  await page.waitForSelector('.panel.msg', { timeout: 15000 });
  const after = await page.evaluate(() => ({ cues: window.__cues, books: window.__game.g.books, vig: !!document.querySelector('.vig.floating'), msg: document.querySelector('.panel.msg')?.textContent }));
  assert.equal(after.vig, false);
  assert.equal(after.books, books - 1);
  assert.deepEqual(after.cues, ['cue-sortie'], 'the phrase is not played again for the commander\'s window');
  assert.match(after.msg, new RegExp(`向${to}进军`));
});
