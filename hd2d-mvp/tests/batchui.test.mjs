// Several at once from one confirmation, through the real dock (宙斯之刃@bilibili, 2026-11-16; rules in tests/batch.test.mjs):
// 医馆, 书馆 and 赏赐 take others along ("一并") and can go until full; 赈济, 离间 and 搜索 take a count. One officer once is
// the command as it always was.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { startGame, newCampaign, cmd, openCmds } from './game.mjs';

const SHOTS = process.env.BATCH_SHOTS; // a folder to keep the dialogs in, for looking at them
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
let game, page;
before(async () => {
  game = await startGame(); page = await game.open();
  await page.evaluate(async () => { (await import('./src/pace.js')).setPace(4); (await import('./src/vignette.js')).setVignettes(false); });
  await newCampaign(page);
  await page.waitForFunction(() => !document.querySelector('.banner'), null, { timeout: 20000 });
});
after(() => game?.close());

const shot = (n) => (SHOTS ? page.locator('.modal').last().screenshot({ path: `${SHOTS}/${n}.png` }) : null);
const idle = () => page.waitForFunction(() => !document.querySelector('.shade, .vig, .banner'), null, { timeout: 20000 });
const closeAll = async () => { for (let i = 0; i < 30; i++) { if (await page.evaluate(() => !document.querySelector('.shade, .vig, .banner, .panel.msg'))) return; await page.evaluate(() => document.querySelector('.panel.msg')?.click()); await page.waitForTimeout(150); } };
// The home city with a 医馆 and a 书馆, gold, books and four officers; returns their ids.
const stock = () => page.evaluate(async () => {
  const { g } = window.__game, D = (await import('./src/core/game.js')).data(), cid = g.factions[g.player].city, c = g.cities[cid];
  Object.assign(D.cities[cid].facilities, { hospital: true, school: true });
  for (const x of g.cities) if (x !== c && x.faction === g.player && c.officers.length < 4) { c.officers.push(...x.officers.splice(0, 4 - c.officers.length)); }
  c.gold = 3000; c.rice = 3000; g.books = 20;
  return { cid, ids: c.officers.slice(0, 4) };
});
const books = () => page.evaluate(() => window.__game.g.books);
const offs = (ids, k) => page.evaluate(({ ids, k }) => ids.map((id) => window.__game.g.officers[id][k]), { ids, k });
const toastText = () => page.evaluate(() => [...document.querySelectorAll('.toast, .log li, .log p')].map((x) => x.textContent).join('|'));

test('医馆: the one picked, two pressed in, until full — books for every heal, all three full; next time it opens on one alone', async () => {
  const { ids } = await stock();
  assert.ok(ids.length >= 3, 'three officers to work with');
  const [a, b, c3] = ids;
  await page.evaluate((ids) => { for (const id of ids) window.__game.g.officers[id].hp = 5; }, [a, b, c3]);
  await cmd(page, '町', '医馆');
  await page.locator(`.modal tr[data-id="${a}"]`).click();
  assert.equal(await page.locator('.modal .batchwho .chip').count() >= 2, true, 'the other hurt officers are offered');
  assert.match(await page.locator('.modal p').first().textContent(), /需要金 50。（消耗一张命令书）/, 'one officer once reads as it always did');
  await page.locator(`.modal .batchwho .chip[data-id="${b}"]`).click();
  await page.locator(`.modal .batchwho .chip[data-id="${c3}"]`).click();
  await page.locator('.modal .untilfull').click();
  assert.equal(await page.locator('.modal .untilfull').getAttribute('aria-pressed'), 'true');
  assert.match(await page.locator('.modal p').first().textContent(), /每人治到体力满为止/);
  assert.match(await page.locator('.modal .batchnote').textContent(), /最多用 \d+ 张命令书、金 \d+/);
  await shot('heal-until');
  const was = await books();
  await page.locator('.modal .runok').click();
  await idle(); await closeAll();
  const hp = await offs([a, b, c3], 'hp'), max = await page.evaluate((ids) => ids.map((id) => window.__game.G.maxHp(window.__game.g.officers[id])), [a, b, c3]);
  assert.deepEqual(hp, max, 'all three full');
  const spent = was - (await books());
  assert.ok(spent >= 3 * Math.ceil((max[0] - 5) / 45) && spent <= 3 * Math.ceil((max[0] - 5) / 35) + 3, `${spent} books for three heals each`);

  await page.evaluate((ids) => { for (const id of ids) window.__game.g.officers[id].hp = 50; }, [a, b]);
  await openCmds(page, '城'); await cmd(page, '町', '医馆'); // the list is drawn afresh
  await page.locator(`.modal tr[data-id="${a}"]`).click();
  assert.equal(await page.locator(`.modal .batchwho .chip[data-id="${b}"]`).getAttribute('aria-pressed'), 'false', 'each time opens on the one picked alone: Enter never spends more than one book');
  assert.equal(await page.locator('.modal .untilfull').getAttribute('aria-pressed'), 'false');
  await page.keyboard.press('Escape');
  assert.deepEqual(page.errors, []);
});

test('书馆: one officer once spends one book, as before', async () => {
  const { ids } = await stock();
  await page.evaluate((id) => { window.__game.g.officers[id].int = 40; }, ids[1]);
  const was = await books();
  await cmd(page, '町', '书馆');
  await page.locator(`.modal tr[data-id="${ids[1]}"]`).click();
  assert.match(await page.locator('.modal p').first().textContent(), /入书馆学习，需要金 20。（消耗一张命令书）/);
  await page.locator('.modal .runok').click();
  await idle(); await closeAll();
  assert.equal(await books(), was - 1);
  assert.ok((await offs([ids[1]], 'int'))[0] >= 48);
});

test('赏赐: 赏金 to two until 90', async () => {
  const { ids } = await stock();
  const [, b, c3] = ids;
  await page.evaluate((ids) => { for (const id of ids) window.__game.g.officers[id].loyalty = 70; }, [b, c3]);
  await cmd(page, '仓', '赏赐');
  await page.locator(`.modal tr[data-id="${b}"]`).click();
  await page.locator('.modal .btn', { hasText: '赏金' }).click();
  await page.locator('.modal .btn.primary').click(); // 50 金
  await page.locator(`.modal .batchwho .chip[data-id="${c3}"]`).click();
  await page.locator('.modal .untilfull').click();
  await shot('reward-until');
  await page.locator('.modal .runok').click();
  await idle(); await closeAll();
  const l = await offs([b, c3], 'loyalty');
  assert.ok(l.every((x) => x >= 90), `both at 90 or more: ${l}`);
});

// 15 金 holds one 赏金 of 10: the dialog opened on 50 with nothing to move, and 确定 asked for 金 the city did not have (西风@devblog, 2026-11-17).
test('赏赐 with 15 金: 赏金 10, and 5 金 left', async () => {
  const { cid, ids } = await stock();
  const b = ids[1];
  await page.evaluate(({ cid, b }) => { const { g } = window.__game; g.cities[cid].gold = 15; g.officers[b].loyalty = 70; }, { cid, b });
  await cmd(page, '仓', '赏赐');
  await page.locator(`.modal tr[data-id="${b}"]`).click();
  await page.locator('.modal .btn', { hasText: '赏金' }).click();
  assert.equal(await page.locator('.modal .amount').inputValue(), '10');
  assert.match(await page.locator('.modal .hint').first().textContent(), /只能赏10/);
  await shot('reward-15');
  await page.locator('.modal .btn.primary').click();
  if (await page.locator('.modal .runok').count()) await page.locator('.modal .runok').click();
  await idle(); await closeAll();
  assert.equal(await page.evaluate((cid) => window.__game.g.cities[cid].gold, cid), 5);
  assert.ok((await offs([b], 'loyalty'))[0] > 70, 'loyalty rose');
});

test('赈济 three times, 离间 three times, 搜索 three times: three books each', async () => {
  await stock();
  await page.evaluate(() => { const { g } = window.__game; g.cities[g.factions[g.player].city].gov = 10; });
  let was = await books();
  await cmd(page, '仓', '赈济');
  await page.locator('.modal input[type=range]').first().focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight'); // 金 50
  await page.locator('.modal .btn.primary').click();
  await page.waitForSelector('.modal .runtimes');
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
  assert.match(await page.locator('.modal p').first().textContent(), /赈济 3 次/);
  await shot('charity-3');
  await page.keyboard.press('Enter');
  await idle(); await closeAll();
  assert.equal(await books(), was - 3);

  const mark = await page.evaluate(() => { const { g, G } = window.__game; return g.cities.filter((x) => x.faction !== g.player && x.faction !== G.NONE).flatMap((x) => x.officers).find((id) => !G.isRuler(g, id)); });
  was = await books();
  await cmd(page, '谋', '离间');
  await page.locator(`.shade .tc:has(tr[data-id="${mark}"])`).evaluate((d) => { d.open = true; }); await page.locator(`.shade tr[data-id="${mark}"]`).first().click(); // cities start folded
  await page.locator('.modal tr[data-id]').first().click();
  await page.locator('.modal .runtimes .btn[aria-label="多一次"]').click(); await page.locator('.modal .runtimes .btn[aria-label="多一次"]').click();
  assert.match(await page.locator('.modal p').first().textContent(), /连续 3 次/);
  await page.locator('.modal .runok').click();
  await idle(); await closeAll();
  assert.equal(await books(), was - 3);

  // Nothing to find: three times, nothing, three books.
  await page.evaluate(async () => { const D = (await import('./src/core/game.js')).data(), rows = D.search_outcomes; window.__keep = structuredClone(rows); for (const k of Object.keys(rows)) rows[k] = Array(8).fill(8); });
  was = await books();
  await cmd(page, '城', '搜索');
  await page.locator('.modal tr[data-id]').first().click();
  await page.locator('.modal .runtimes .btn.ghost').click(); // 最多
  for (let i = 0; i < 30 && (await page.locator('.modal .runtimes b').textContent()) !== '3'; i++) await page.keyboard.press('ArrowLeft');
  assert.match(await page.locator('.modal p').first().textContent(), /最多 3 次.*遇到人才即停/);
  await shot('search-3');
  await page.locator('.modal .runok').click();
  const said = await page.waitForFunction(() => { const m = document.querySelector('.panel.msg'); if (m?.querySelector('.more')?.hidden) m.click(); return m?.textContent.includes('什么也没找到') ? m.textContent : null; }, null, { timeout: 20000 }).then((x) => x.jsonValue());
  assert.match(said, /寻访了 3 次/);
  await closeAll();
  await page.evaluate(async () => { const D = (await import('./src/core/game.js')).data(); Object.assign(D.search_outcomes, window.__keep); });
  assert.equal(await books(), was - 3);
  assert.deepEqual(page.errors, []);
});

test('搜索 several times that meets someone who names a price: the finds before are told, and paying him is still asked', async () => {
  await stock();
  const ronin = await page.evaluate(async () => {
    const { g } = window.__game, D = (await import('./src/core/game.js')).data(), home = g.factions[g.player].city;
    const taken = new Set(Object.values(D.rules.search_preference).flat());
    const o = g.officers.find((x) => x.status === 1 && !taken.has(x.id)); o.status = 0; o.loc = home;
    // The first two times turn up coin, the third someone who names a price.
    const rows = D.search_outcomes; let n = 0;
    D.search_outcomes = new Proxy(rows, { get: (t, k) => (typeof k === 'string' && k.includes(',') ? Array(8).fill(n++ < 2 ? 1 : 6) : t[k]) });
    window.__keep = rows;
    return o.id;
  });
  const was = await books();
  await cmd(page, '城', '搜索');
  await page.locator('.modal tr[data-id]').first().click();
  for (let i = 0; i < 4; i++) await page.locator('.modal .runtimes .btn[aria-label="多一次"]').click();
  await page.locator('.modal .runok').click();
  const said = await page.waitForFunction(() => { const m = document.querySelector('.panel.msg'); if (m?.querySelector('.more')?.hidden) m.click(); return m?.textContent.includes('颇有可取之处') ? m.textContent : null; }, null, { timeout: 20000 }).then((x) => x.jsonValue());
  assert.match(said, /前 2 次发现了金 \d+；第 3 次：/, said);
  assert.match(said, /颇有可取之处/);
  await page.evaluate(() => document.querySelector('.panel.msg')?.click());
  await page.waitForSelector('.shade .btn', { hasText: '取消' });
  assert.match(await page.locator('.modal').last().textContent(), /是否支付/, 'paying him is asked');
  await page.locator('.shade .btn', { hasText: '取消' }).click();
  await closeAll();
  assert.equal(await books(), was - 3, 'a run of five stopped at the third, who was met');
  await page.evaluate(async ({ ronin }) => { const D = (await import('./src/core/game.js')).data(); D.search_outcomes = window.__keep; window.__game.g.officers[ronin].status = 1; }, { ronin });
  assert.deepEqual(page.errors, []);
});

test('诱纳 until he comes over: the books stop at the one that took', async () => {
  await stock();
  const { mark, me } = await page.evaluate(() => {
    const { g, G } = window.__game, c = g.cities[g.factions[g.player].city];
    const mark = g.cities.filter((x) => x.faction !== g.player && x.faction !== G.NONE).flatMap((x) => x.officers).find((id) => !G.isRuler(g, id));
    g.officers[mark].loyalty = 0; Object.assign(g.officers[c.officers[0]], { int: 100, virtue: 100 });
    return { mark, me: c.officers[0] };
  });
  const was = await books();
  await cmd(page, '谋', '诱纳');
  await page.locator(`.shade .tc:has(tr[data-id="${mark}"])`).evaluate((d) => { d.open = true; }); await page.locator(`.shade tr[data-id="${mark}"]`).first().click(); // cities start folded
  await page.locator(`.modal tr[data-id="${me}"]`).click();
  await page.locator('.modal .runtimes .btn.ghost').click(); // 最多
  assert.match(await page.locator('.modal p').first().textContent(), /直到成功为止，最多 \d+ 次/);
  await page.locator('.modal .runok').click();
  await page.waitForFunction((id) => window.__game.g.cities[window.__game.g.factions[window.__game.g.player].city].officers.includes(id), mark, { timeout: 20000 });
  await closeAll();
  const spent = was - (await books());
  assert.ok(spent >= 1 && spent < was, `${spent} books, not all ${was}`);
  assert.deepEqual(page.errors, []);
});
