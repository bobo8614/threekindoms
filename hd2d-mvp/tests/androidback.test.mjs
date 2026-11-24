// The Android package's way out (kofwinner@devblog #612 / #641, 2026-11-22): ☰ 系统 and the title have 退出游戏 there too,
// and the phone's back key, once nothing is left to step back from, asks 退出游戏？ instead of doing nothing. The shell
// (apk/.../MainActivity.java) gives window.NativeShell and calls window.__nativeBack from its back key; here a stand-in
// records quit(), and the back key is that call. The shell's own side (the real back key, finish()) is the emulator's.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startGame, newCampaign, closeMessages, skipIntro, openCmds } from './game.mjs';

let game, page;
const shell = (ctx) => ctx.addInitScript(() => {
  const d = window.__shell = { calls: [] };
  window.NativeShell = { quit() { d.calls.push('quit'); }, enter() {} };
  sessionStorage.setItem('hd2d-title-seen', '1');
});
const calls = () => page.evaluate(() => window.__shell.calls.splice(0));
const back = () => page.evaluate(() => { window.__nativeBack(); }); // as the shell calls it: nothing waits for the answer
const asked = () => page.locator('.modal', { hasText: '确定退出游戏吗' });
const openMenu = async () => { if (await page.locator('.sysmenu-list').isHidden()) await page.click('.sysmenu-btn'); };
const closeMenu = async () => { if (await page.locator('.sysmenu-list').isVisible()) await page.click('.sysmenu-btn'); };
const row = (text) => page.locator('.sysmenu-list button', { hasText: text });
// Every row of the open 系统 menu wholly in the window and on top where it stands.
const lost = () => page.evaluate(() => [...document.querySelectorAll('.sysmenu-list button')].filter((el) => {
  const r = el.getBoundingClientRect(); if (!r.width) return false;
  const top = r.top >= 0 && r.bottom <= innerHeight && r.right <= innerWidth && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return !top || !el.contains(top);
}).map((el) => el.textContent.trim()));

before(async () => { game = await startGame({ width: 800, height: 360 }); page = await game.open('&phone', { setup: shell }); });
after(() => game?.close());

test('without the shell, a browser has no 退出游戏 and the back function only steps back', async () => {
  const p = await game.open('&phone');
  try {
    await skipIntro(p);
    assert.equal(await p.locator('.tt-menu .btn', { hasText: '退出游戏' }).count(), 0);
    await p.evaluate(() => { window.__nativeBack(); });
    assert.equal(await p.locator('.modal').count(), 0);
  } finally { await p.context().close(); }
});

test('on the title: 退出游戏 is a button; the back key asks, a second back closes the question, 退出游戏 quits', async () => {
  await skipIntro(page);
  assert.equal(await page.locator('.tt-menu .btn').last().textContent(), '退出游戏');
  await openMenu(); assert.equal(await row('退出游戏').count(), 1); assert.deepEqual(await lost(), []); await closeMenu();
  await back(); await asked().waitFor();
  await back(); await asked().waitFor({ state: 'detached' });
  assert.deepEqual(await calls(), [], 'the second back only closed the question');
  await back(); await asked().locator('button', { hasText: '退出游戏' }).click();
  assert.deepEqual(await calls(), ['quit']);
  // 新的征程: back is its 返回, to the title.
  await page.locator('.tt-menu .btn', { hasText: '新的征程' }).click();
  await page.waitForFunction(() => document.body.dataset.screen === 'setup');
  await back();
  await page.waitForFunction(() => document.body.dataset.screen === 'title');
  await skipIntro(page);
  // The title's button is a choice already made: no question, as on the desktop.
  await page.locator('.tt-menu .btn', { hasText: '退出游戏' }).click();
  assert.deepEqual(await calls(), ['quit']);
  assert.equal(await page.locator('.modal').count(), 0);
});

test('on the strategy map: back puts away the command list first, then asks with 先记录', async () => {
  await newCampaign(page, '曹操');
  await openMenu();
  assert.equal(await row('退出游戏').count(), 1);
  assert.match(await row('退出游戏').getAttribute('title'), /未记录的进度会丢失.*（返回键）/);
  assert.deepEqual(await lost(), []);
  await closeMenu(); // the shell closes the menu itself before calling the page (BACK_JS)
  // A command list open: back puts it away, no question.
  await openCmds(page, '城');
  await back();
  await page.waitForSelector('.dock .acts:not([hidden])', { state: 'detached' }).catch(() => {});
  assert.equal(await asked().count(), 0);
  assert.equal(await page.locator('.modal').count(), 0);
  // Nothing left: the question, with 先记录 as 回到标题 has it.
  await back();
  const q = page.locator('.modal', { hasText: '未记录的进度会丢失。确定退出游戏吗？' });
  await q.waitFor();
  assert.equal(await q.locator('button', { hasText: '先记录' }).count(), 1);
  await back(); await q.waitFor({ state: 'detached' });
  assert.deepEqual(await calls(), []);
  await back(); await q.locator('button', { hasText: '不记录，退出' }).click();
  assert.deepEqual(await calls(), ['quit']);
});

test('on the war map: back is 返回 while a general is picked, then asks; 中断战斗 is the way to keep it', async () => {
  await page.evaluate(() => {
    const { g, debug } = window.__game, c = g.cities[14], to = g.cities[12];
    for (const id of [...c.officers, ...to.officers]) g.officers[id].soldiers ||= 500;
    const ids = c.officers.slice(0, 3);
    debug.fieldWar(debug.setupWar(g, { from: 14, to: 12, ids, commander: ids[0], gold: 100, rice: 400 }), 'att');
  });
  await page.waitForFunction(() => window.__game.war?.finishDeploy && document.body.dataset.screen === 'war', null, { timeout: 30000 });
  const stop = closeMessages(page);
  try {
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.__game.war.finishDeploy());
    await page.waitForFunction(() => window.__game.war.myTurn && !window.__game.war.st.busy && !document.querySelector('.shade, .panel.msg'), null, { timeout: 30000 });
  } finally { stop(); }
  // A general picked: back is 返回, one step, no question.
  await page.evaluate(() => { const { war } = window.__game, u = war.field.alive.find((x) => x.side === war.field.human); war.clickCell(u.x, u.y); });
  await page.waitForFunction(() => window.__game.war.st.sel);
  await back();
  assert.equal(await page.evaluate(() => window.__game.war.st.sel), null);
  assert.equal(await page.locator('.modal').count(), 0);
  // Nothing picked: the question. In a war no record can be made, and it says why.
  await back();
  const q = page.locator('.modal', { hasText: '确定退出游戏吗' });
  await q.waitFor();
  assert.equal(await q.locator('button', { hasText: '先记录' }).count(), 0);
  assert.match(await q.textContent(), /中断战斗/);
  await back(); await q.waitFor({ state: 'detached' });
  assert.deepEqual(await calls(), []);
});

// A tablet (short side >= 600dp) gets the desktop layout, where a city can be put away: back does that first, as the pad's B.
test('in the tablet layout the picked city is put away first, then the question', async () => {
  const t = await game.open('', { setup: shell });
  try {
    await t.setViewportSize({ width: 1280, height: 800 });
    await newCampaign(t, '曹操');
    await t.evaluate(() => { window.__nativeBack(); });
    await t.waitForTimeout(300);
    assert.equal(await t.locator('.modal').count(), 0, 'the first back only put the city away');
    await t.evaluate(() => { window.__nativeBack(); });
    await t.locator('.modal', { hasText: '确定退出游戏吗' }).waitFor();
  } finally { await t.context().close(); }
});
