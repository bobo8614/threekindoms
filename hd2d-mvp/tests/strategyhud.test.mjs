// The 战略地图's information, as 阿拉神丁@qq laid it out (2026-11-19, docs/玩家反馈汇总与修复判断_2026-11-19_v0.3.8_战略界面信息.md): city tags give the
// name in its owner's ink and no rival's officer count; the city panel gives 武将 and 正规军, the 市集 and its prices on the tooltip;
// the standings sit over the log, a ruler there shows his land alone, the log folds to its newest line; 侦察, 出阵 and 运输 pick
// on the map without a list for the mouse, the keys and the pad keeping theirs.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startGame, newCampaign, cmd } from './game.mjs';

let game, page;
before(async () => { game = await startGame({ width: 1440, height: 900 }); page = await game.open(); await newCampaign(page, '孙策'); }, { timeout: 180000 });
after(() => game?.close());

const clickCity = (id) => page.evaluate((id) => [...document.querySelectorAll('.ctag')].find((e) => e.firstChild?.textContent === window.__game.G.cityName(id)).click(), id);

test('a tag names its city in the owner\'s ink; a rival\'s officer count is gone, 无主 stays in sight', async () => {
  const r = await page.evaluate(() => {
    const { g, G } = window.__game, tag = (c) => [...document.querySelectorAll('.ctag')].find((e) => e.firstChild?.textContent === G.cityName(c.id));
    const own = g.cities.find((c) => c.faction === g.player), foe = g.cities.find((c) => c.faction !== g.player && c.faction !== G.NONE && c.officers.length), none = g.cities.find((c) => c.faction === G.NONE);
    const look = (c) => { const el = tag(c), s = el.querySelector('small'); return { text: s.textContent, shown: getComputedStyle(s).display !== 'none', far: el.classList.contains('far'), ink: getComputedStyle(el).color }; };
    return { own: look(own), foe: look(foe), none: look(none), n: own.officers.length };
  });
  assert.equal(r.own.text, `孙策·${r.n}将`);
  assert.ok(!r.foe.text.includes('将'), r.foe.text);
  assert.equal(r.own.shown, false); assert.equal(r.foe.shown, false, 'the owner shows only when pointed at');
  assert.equal(r.none.text, '无主'); assert.equal(r.none.shown, !r.none.far, 'in sight, but for the names-only far form');
  assert.notEqual(r.own.ink, r.foe.ink, 'each house its own ink');
});

test('the city panel gives 武将 and 正规军, and the 市集 keeps its prices on the tooltip', async () => {
  const want = await page.evaluate(() => { const { g, G } = window.__game, c = g.cities[g.factions[g.player].city]; return { id: c.id, n: c.officers.length, troops: G.troopsOf(g, c) }; });
  await clickCity(want.id);
  const stat = (k) => page.locator(`.citypanel .stats > div[data-k="${k}"] b`).textContent();
  assert.equal(Number(await stat('武将')), want.n);
  assert.equal(Number(await stat('正规军')), want.troops);
  const facs = await page.locator('.citypanel .facs').textContent();
  assert.ok(!facs.includes('米价') && !facs.includes('米市'), facs);
  const market = await page.evaluate((id) => window.__game.G.data().cities[id].facilities.market, want.id);
  if (market) assert.match(await page.locator('.citypanel .facs i', { hasText: '市集' }).getAttribute('title'), /100金买米\d+/);
  // a rival not scouted: neither the numbers nor the count
  const foe = await page.evaluate(() => { const { g, G } = window.__game; return g.cities.find((c) => c.faction !== g.player && c.faction !== G.NONE && c.officers.length).id; });
  await clickCity(foe);
  assert.equal(await page.locator('.citypanel .stats').count(), 0);
  assert.match(await page.locator('.citypanel').textContent(), /使用「侦察」可查看详细情报/);
  // the hover tip keeps the same secret, and gives it once the city is scouted
  await page.evaluate((id) => window.__game.strategy.focusCity(id), foe); await page.waitForTimeout(2500);
  const at = await page.evaluate((id) => window.__game.strategy.screenOfCity(id), foe);
  await page.mouse.move(at.x - 30, at.y + 20); await page.mouse.move(at.x, at.y + 4, { steps: 3 });
  await page.locator('#tip').waitFor({ state: 'visible', timeout: 5000 });
  const txt = await page.locator('#tip').textContent();
  assert.ok(txt.includes('未侦察') && !/\d将/.test(txt), txt);
  await page.evaluate((id) => { const { g } = window.__game; (g.scouted ||= {})[id] = g.year * 12 + g.month; }, foe);
  await clickCity(foe);
  assert.equal(Number(await stat('武将')), await page.evaluate((id) => window.__game.g.cities[id].officers.length, foe), 'a scouted rival gives 武将 too');
  await clickCity(want.id);
});

test('the standings sit over the log, which folds to its newest line and is remembered folded', async () => {
  await page.evaluate(() => { for (const t of ['一', '二', '三']) window.__game.debug.addLog(`第${t}条`); window.__game.debug.hud(); });
  const order = await page.evaluate(() => [...document.querySelector('.rightcol').children].map((e) => e.className));
  assert.match(order[0], /legend/); assert.match(order[1], /logwrap/);
  await page.locator('.logfold').click();
  const shown = () => page.evaluate(() => [...document.querySelectorAll('.logbox p')].filter((p) => p.offsetParent).map((p) => p.textContent));
  assert.deepEqual(await shown(), ['第三条']);
  assert.equal(await page.evaluate(() => localStorage.getItem('hd2d-log-fold')), '1');
  await page.evaluate(() => { window.__game.debug.addLog('第四条'); window.__game.debug.hud(); });
  assert.deepEqual(await shown(), ['第四条'], 'still folded after the HUD is drawn again');
  await page.locator('.logfold').click();
  assert.ok((await shown()).length >= 4);
});

test('a ruler in the standings shows his land alone, without touching the 势力 setting', async () => {
  const before = await page.evaluate(() => localStorage.getItem('hd2d-territory'));
  const lg = page.locator('.legend .lg').nth(1), f = Number(await lg.getAttribute('data-f'));
  await lg.click();
  assert.deepEqual(await page.evaluate(() => [window.__game.strategy.territoryOn, window.__game.strategy.territoryOnly]), [true, f]);
  assert.equal(await page.locator('.legend .lg.only').count(), 1);
  assert.equal(await page.locator('.terrbtn').getAttribute('aria-pressed'), 'false');
  await lg.click();
  assert.equal(await page.evaluate(() => window.__game.strategy.territoryOnly), null);
  assert.equal(await page.evaluate(() => localStorage.getItem('hd2d-territory')), before);
  await lg.click(); await page.locator('.terrbtn').click(); // 势力 from one ruler's view: every house's
  assert.deepEqual(await page.evaluate(() => [window.__game.strategy.territoryOn, window.__game.strategy.territoryOnly]), [true, null]);
  assert.equal(await page.locator('.terrbtn').getAttribute('aria-pressed'), 'true');
  await page.locator('.terrbtn').click();
  assert.deepEqual(page.errors, []);
});

test('出阵 picks on the map without a list for the mouse; the keys bring the list back', async () => {
  const own = await page.evaluate(() => window.__game.g.factions[window.__game.g.player].city);
  await clickCity(own);
  await page.mouse.move(700, 500); await page.mouse.move(710, 505);
  await cmd(page, '军', '出阵');
  await page.waitForSelector('.mappick.nolist');
  const names = () => page.evaluate(() => [...document.querySelectorAll('.mappick .chips .btn')].filter((b) => b.offsetParent).map((b) => b.textContent));
  assert.deepEqual((await names()).map((t) => t.replace(/Esc$/, '')), ['取消']);
  assert.match(await page.locator('.mappick').textContent(), /点选地图上发光的城市/);
  await page.keyboard.press('Tab');
  const listed = await names();
  assert.ok(listed.length > 1 && listed.every((t) => !/\d将/.test(t)), listed.join(' | '));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.mappick'));
});
