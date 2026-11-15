// 镜头复位 on the strategy map centres the selected city (group feedback G02, 2026-11-04): it restored the turn and the
// distance but left the view wherever a far-off event or a pan had taken it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startGame, newCampaign, closeMessages } from './game.mjs';

let game, page;
test.before(async () => { game = await startGame({ width: 1440, height: 900 }); page = await game.open(); await newCampaign(page, '董卓'); }, { timeout: 180000 });
test.after(async () => { await game?.close(); });

const reset = async () => {
  await page.getByRole('button', { name: '☰ 系统', exact: true }).click();
  await page.getByText('镜头复位（C）', { exact: true }).click();
  await page.waitForTimeout(1800);
};
// The same reset from the keyboard (C).
const resetKey = async () => { await page.keyboard.press('c'); await page.waitForTimeout(1800); };
const camera = () => page.evaluate(() => window.__game.strategy.camera.position.toArray());
// The ruler's crowns shown on the 3D map: the small pale-gold octahedra over the cities rulers hold.
const crowns = () => page.evaluate(() => { let n = 0; window.__game.strategy.scene.traverse((o) => { if (o.geometry?.type === 'OctahedronGeometry' && o.visible) n++; }); return n; });
const away = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
// The camera at rest looking at this city from the default turn and distance.
const homeShot = async (cid) => {
  await page.evaluate((c) => { const s = window.__game.strategy; s.select(c); s.resetView(c); s.focusCity(c); }, cid);
  await page.waitForTimeout(1800);
  return camera();
};
const city = (n) => page.evaluate((n) => window.__game.g.cities.find((c) => window.__game.G.cityName(c.id) === n).id, n);
const home = () => page.evaluate(() => window.__game.g.factions[window.__game.g.player].city);

test('after an event far away it comes back to the selected city', async () => {
  const c = await home(), want = await homeShot(c), far = await city('辽东');
  await page.evaluate((f) => window.__game.strategy.focusCity(f), far); await page.waitForTimeout(1800);
  assert.ok(away(await camera(), want) > 5, 'the event took the view away');
  await reset();
  assert.ok(away(await camera(), want) < 0.05, `back over the selected city: ${away(await camera(), want)}`);
});

test('after a framed event its zoom goes too', async () => {
  const c = await home(), want = await homeShot(c), [a, b] = [await city('辽东'), await city('交州')];
  await page.evaluate(([a, b]) => window.__game.strategy.frame([a, b]), [a, b]); await page.waitForTimeout(1800);
  assert.ok(away(await camera(), want) > 5);
  await reset();
  assert.ok(away(await camera(), want) < 0.05);
});

test('after a pan by hand it comes back to the selected city', async () => {
  const c = await home(), want = await homeShot(c);
  await page.evaluate(() => { const s = window.__game.strategy; s.pan(14, -9); s.orbit(180, 0); s.zoom(600); }); await page.waitForTimeout(1800);
  assert.ok(away(await camera(), want) > 5);
  await reset();
  assert.ok(away(await camera(), want) < 0.05);
});

test('C does the same from the keyboard, in 欣赏模式 too', async () => {
  const c = await home(), want = await homeShot(c);
  await page.evaluate(() => { const s = window.__game.strategy; s.pan(14, -9); s.orbit(180, 0); s.zoom(600); }); await page.waitForTimeout(1800);
  assert.ok(away(await camera(), want) > 5);
  await resetKey();
  assert.ok(away(await camera(), want) < 0.05, `C brought it back: ${away(await camera(), want)}`);
  await page.keyboard.press('v'); await page.waitForTimeout(300);
  assert.ok(await page.evaluate(() => document.body.classList.contains('scenic')), 'in 欣赏模式');
  // The rulers' crowns sit under the city tags; with the tags away they must go too, and come back after.
  assert.equal(await crowns(), 0, 'no ruler crown shows in 欣赏模式');
  await page.evaluate(() => window.__game.strategy.pan(14, -9)); await page.waitForTimeout(1800);
  await resetKey();
  assert.ok(away(await camera(), want) < 0.05, 'C works with the HUD away');
  await page.keyboard.press('v'); await page.waitForTimeout(300);
  assert.ok(await crowns() > 0, 'the crowns are back after 欣赏模式');
});

test('the selected city is the one centred, not the capital', async () => {
  const c = await city('成都'), want = await homeShot(c);
  await page.evaluate((f) => window.__game.strategy.focusCity(f), await city('辽东')); await page.waitForTimeout(1800);
  await reset();
  assert.ok(away(await camera(), want) < 0.05);
});

test('with no city selected it falls back to the ruler\'s city', async () => {
  const c = await home(), want = await homeShot(c);
  await page.evaluate((far) => { const s = window.__game.strategy; s.focusCity(far); s.select(null); }, await city('辽东'));
  await page.waitForTimeout(1800);
  await reset();
  assert.ok(away(await camera(), want) < 0.05);
});

// An AI war's show clears the map's own selection (app.js) while the player's city stays in play.
test('with the map\'s selection cleared the city in play is the one centred', async () => {
  const tag = page.locator('.ctag.mine').first(), nm = (await tag.evaluate((e) => e.firstChild.textContent)).trim();
  await tag.click(); await page.waitForTimeout(200);
  const c = await city(nm), want = await homeShot(c);
  await page.evaluate((far) => { const s = window.__game.strategy; s.focusCity(far); s.select(null); }, await city('交州'));
  await page.waitForTimeout(1800);
  await reset();
  assert.ok(away(await camera(), want) < 0.05);
  assert.deepEqual(page.errors, []);
});

// The player's next turn gives the view back (晚风和远方丶@bilibili, 2026-11-08): the AI turns' events had left it on
// their own cities, zoomed out by frame(). It comes back over the city the player had selected, at their zoom and turn.
test('the next turn comes back over the city in play, at the player\'s own zoom and turn', async () => {
  // Not the ruler's city, picked as a player does; the earlier tests may have left it off screen, so the view goes to it first.
  const nm = await page.evaluate(() => { const { g, G } = window.__game, own = g.cities.filter((c) => c.faction === g.player && c.id !== g.factions[g.player].city); return G.cityName((own[0] ?? g.cities[g.factions[g.player].city]).id); });
  const c = await city(nm);
  await page.evaluate((c) => window.__game.strategy.resetView(c), c); await page.waitForTimeout(1800);
  await page.locator('.ctag.mine', { hasText: nm }).first().click(); await page.waitForTimeout(200);
  await page.evaluate((c) => { const s = window.__game.strategy; s.zoom(-300); s.orbit(60, 0); s.focusCity(c); }, c); await page.waitForTimeout(1800);
  const shot = await camera();
  await page.getByRole('button', { name: '结束本月行动' }).click();
  await page.locator('.shade .btn.primary', { hasText: '确定' }).click();
  // An AI turn's event takes the view to the far side of the map, as an AI war or a disaster does.
  await page.waitForSelector('.aiturn', { timeout: 30000 });
  const [a, b] = [await city('辽东'), await city('交州')];
  await page.evaluate(([a, b]) => window.__game.strategy.frame([a, b]), [a, b]); await page.waitForTimeout(600);
  assert.ok(away(await camera(), shot) > 5, 'the AI turn took the view away');
  const stop = closeMessages(page);
  try { await page.waitForFunction(() => { const g = window.__game.g; return g.current === g.player && !document.querySelector('.aiturn, .panel.msg, body > .banner'); }, null, { timeout: 120000 }); } finally { stop(); }
  await page.waitForTimeout(1800);
  assert.ok(away(await camera(), shot) < 0.05, `back over ${nm} at the player's view: ${away(await camera(), shot)}`);
  assert.deepEqual(page.errors, []);
});

// A city the player was working in and lost meanwhile is not where the turn comes back to: the ruler's city is.
test('a city lost in the AI turns gives way to the ruler\'s, still at the player\'s zoom', async () => {
  const cap = await home();
  const c = await page.evaluate(() => { const { g } = window.__game; return g.cities.find((x) => x.faction === g.player && x.id !== g.factions[g.player].city)?.id ?? null; });
  assert.ok(c != null, '董卓 starts with a second city');
  const nm = await page.evaluate((c) => window.__game.G.cityName(c), c);
  await page.evaluate((c) => window.__game.strategy.resetView(c), c); await page.waitForTimeout(1800);
  await page.locator('.ctag.mine', { hasText: nm }).first().click(); await page.waitForTimeout(200);
  await page.evaluate((cap) => { const s = window.__game.strategy; s.zoom(-200); s.orbit(-40, 0); s.focusCity(cap); }, cap); await page.waitForTimeout(1800);
  const shot = await camera(); // what the player should see: the ruler's city at this zoom and turn
  await page.evaluate((c) => window.__game.strategy.focusCity(c), c); await page.waitForTimeout(1800);
  await page.getByRole('button', { name: '结束本月行动' }).click();
  await page.locator('.shade .btn.primary', { hasText: '确定' }).click();
  await page.waitForSelector('.aiturn', { timeout: 30000 });
  // As if an AI war had taken it: the city goes to another faction (a living one) while the AI turns run.
  await page.evaluate((c) => { const { g } = window.__game, f = g.factions.find((x) => x.id !== g.player && x.ruler != null); g.cities[c].faction = f.id; }, c);
  const stop = closeMessages(page);
  try { await page.waitForFunction(() => { const g = window.__game.g; return g.current === g.player && !document.querySelector('.aiturn, .panel.msg, body > .banner'); }, null, { timeout: 120000 }); } finally { stop(); }
  await page.waitForTimeout(1800);
  assert.ok(away(await camera(), shot) < 0.05, `over the ruler's city at the player's view: ${away(await camera(), shot)}`);
  assert.deepEqual(page.errors, []);
});
