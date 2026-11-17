// Switches the player sets stay set after the game is closed and opened again (素月墨羽小尘尘@bilibili, 2026-11-17: HD-2D 关
// came back 开 on every start). The page is reloaded in the same browser profile, as a restart is. Covered here: 系统 → HD-2D,
// the 战略地图's 道路总览 and 势力范围, the war map's 威胁 pin, and the new-game screen's rule switches. The rest of 系统 was
// remembered before (画质, 战场, 帧率, 声音, 速度, 演出, 震屏, …) and the desktop window keeps its fullscreen (desktop/main.js).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { startGame, skipIntro, closeMessages } from './game.mjs';

let game;
after(async () => { await game?.close(); });

// 新的征程 as newCampaign does it, with a look at the 武将不老 switch on the way: is it pressed as left?
async function campaign(page) {
  await skipIntro(page);
  await page.getByText('新的征程').click();
  const ageless = page.locator('.cheat.opt', { hasText: '武将不老' });
  const pressed = await ageless.getAttribute('aria-pressed');
  await page.locator('.level', { hasText: 'LEVEL 1' }).click();
  await page.locator('.ruler', { hasText: '刘备' }).click(); await page.locator('.ruler', { hasText: '刘备' }).click();
  await page.waitForFunction(() => document.body.dataset.screen === 'strategy');
  const stop = closeMessages(page, { aiTurns: true });
  try { await page.waitForFunction(() => { const g = window.__game.g; return g.current === g.player && !document.querySelector('.aiturn, .panel.msg'); }, null, { timeout: 90000 }); } finally { stop(); }
  return pressed;
}
// A war on the player's turn, past the deployment (as war.test.mjs toWar), on the 3D map, where the 威胁 button is.
async function toWar(page, { flat = false } = {}) {
  await page.evaluate(() => {
    const { g, G, debug } = window.__game, home = g.factions[g.player].city;
    const to = G.roads(home).map((c) => g.cities[c]).filter((c) => c.faction !== g.player && c.faction !== G.NONE && c.officers.length).sort((a, b) => b.officers.length - a.officers.length)[0];
    for (const id of [...g.cities[home].officers, ...to.officers]) g.officers[id].soldiers ||= 500;
    const ids = g.cities[home].officers.slice(0, 3);
    debug.fieldWar(debug.setupWar(g, { from: home, to: to.id, ids, commander: ids[0], gold: 100, rice: 400 }), 'att');
  });
  await page.waitForFunction(() => window.__game.war?.finishDeploy && document.body.dataset.screen === 'war', null, { timeout: 30000 });
  const stop = closeMessages(page);
  try {
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.__game.war.finishDeploy());
    await page.waitForFunction(() => { const f = window.__game.war.field; return f.turn === f.human && !document.querySelector('.banner, .panel.msg'); }, null, { timeout: 30000 });
  } finally { stop(); }
  if (!flat) await page.locator('.wardock .threatbtn').waitFor();
}
const restart = async (page) => { await page.reload(); await page.waitForFunction(() => window.__game?.debug, null, { timeout: 60000 }); };
const hd2dRow = async (page) => { await page.locator('.sysmenu-btn').click(); const t = await page.locator('.hd2d-row').textContent(); await page.locator('.sysmenu-btn').click(); return t; };

test('HD-2D, the map switches, the 威胁 pin and the new-game rule switches are as left after a restart', async () => {
  game ??= await startGame({ width: 1440, height: 900 }); const page = await game.open();
  try {
    // Untouched, everything is as it always was.
    await skipIntro(page);
    assert.equal(await page.evaluate(() => window.__game.debug.post.enabled), true, 'HD-2D starts 开');
    // 系统 → HD-2D 关, from the title.
    await page.locator('.sysmenu-btn').click(); await page.locator('.hd2d-row').click();
    assert.equal(await page.evaluate(() => window.__game.debug.post.enabled), false);
    // 武将不老 pressed on the new-game screen, and the game started with it.
    await page.getByText('新的征程').click();
    const ageless = page.locator('.cheat.opt', { hasText: '武将不老' });
    assert.equal(await ageless.getAttribute('aria-pressed'), 'false', 'the rule switches start off');
    await ageless.click();
    await restart(page);
    assert.equal(await page.evaluate(() => window.__game.debug.post.enabled), false, 'HD-2D 关 after a restart');
    assert.equal(await campaign(page), 'true', '武将不老 is pressed as left');
    assert.equal(await page.evaluate(() => window.__game.g.ageless), true, 'and the game is started with it');
    assert.equal(await page.evaluate(() => window.__game.g.noWarDeath ?? false), false, 'the switches not pressed stay off');
    assert.match(await hd2dRow(page), /HD-2D 关/);
    assert.equal(await page.evaluate(() => window.__game.strategy.roadsOn), false, '道路总览 starts off');
    // 道路总览 and 势力范围 on, the 威胁 pin on in a war.
    await page.locator('.roadsbtn').click(); await page.locator('.terrbtn').click();
    await toWar(page);
    assert.equal(await page.locator('.wardock .threatbtn').getAttribute('aria-pressed'), 'false', 'the 威胁 pin starts off');
    await page.locator('.wardock .threatbtn').click();
    assert.equal(await page.evaluate(() => document.body.classList.contains('threat-view')), true);

    await restart(page);
    await campaign(page);
    assert.deepEqual(await page.evaluate(() => ({ roads: window.__game.strategy.roadsOn, territory: window.__game.strategy.territoryOn })), { roads: true, territory: true }, '道路总览 and 势力范围 are on');
    assert.equal(await page.locator('.roadsbtn').getAttribute('aria-pressed'), 'true', 'and their buttons say so');
    assert.equal(await page.locator('.terrbtn').getAttribute('aria-pressed'), 'true');
    await toWar(page);
    assert.equal(await page.locator('.wardock .threatbtn').getAttribute('aria-pressed'), 'true', 'the 威胁 pin is on');
    assert.equal(await page.evaluate(() => document.body.classList.contains('threat-view')), true, 'and the range is shown');
    // Unpinned, it is stored off.
    await page.locator('.wardock .threatbtn').click();
    assert.equal(await page.evaluate(() => localStorage.getItem('hd2d-threat')), '0');
    // Pinned on the 3D map, it is not brought to the flat one, which has no button to put it away (R held only).
    await page.locator('.wardock .threatbtn').click();
    await page.evaluate(() => localStorage.setItem('hd2d-war-view', 'flat')); // 系统 → 战场 平面
    await restart(page);
    await campaign(page);
    await toWar(page, { flat: true });
    assert.equal(await page.evaluate(() => window.__game.war.flat), true);
    assert.equal(await page.evaluate(() => document.body.classList.contains('threat-view')), false, 'no pin on the flat map');
    assert.equal(await page.evaluate(() => localStorage.getItem('hd2d-threat')), '1', 'and the 3D pin is kept for the next 3D war');
    assert.deepEqual(page.errors, []);
  } finally { await page.context().close(); }
});
