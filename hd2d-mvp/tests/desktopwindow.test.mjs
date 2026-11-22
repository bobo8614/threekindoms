// The desktop game's window, as the page sees it (desktop/preload.js gives window.desktop; here a stand-in that records
// what the page asks): 系统 → 全屏 and 退出游戏, 退出游戏 on the title, the keys on the 操作 page, and the word to the shell
// that a game is on, so that closing the window asks first. Players could find neither fullscreen nor a way out (2026-11-17).
// What the shell does with it (the real window, the system dialogs) is desktop/main.js and is not run here.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startGame, newCampaign, closeMessages, skipIntro } from './game.mjs';

const SIZES = [[1600, 900], [1366, 768], [1280, 800], [1024, 600]]; // 1024x600 is the desktop window's minimum (desktop/main.js)
let game, page;

const shell = (ctx) => ctx.addInitScript(() => {
  const d = window.__desk = { calls: [], on: false, tell: null };
  window.desktop = { mac: false,
    toggleFullscreen() { d.calls.push('fullscreen'); d.on = !d.on; d.tell?.(d.on); },
    isFullscreen: async () => d.on, onFullscreen(f) { d.tell = f; },
    setUnsaved(on) { d.calls.push(`unsaved:${on}`); }, quit() { d.calls.push('quit'); },
    setUiSize: async (size) => { d.firstUi ??= size; d.calls.push(`ui:${size}`); return size === 'small' ? 1 : 1.25; } };
  sessionStorage.setItem('hd2d-title-seen', '1');
  // A pad, untouched until the war below: once one has been used the menu's left column has two more rows (小地图, 确定键).
  const pad = { id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)', index: 0, mapping: 'standard', connected: true, timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  Object.defineProperty(navigator, 'getGamepads', { value: () => [pad, null, null, null] });
  window.__padButton = (i, on) => { pad.buttons[i] = { pressed: on, touched: on, value: on ? 1 : 0 }; pad.timestamp = performance.now(); };
});
const calls = (p = page) => p.evaluate(() => window.__desk.calls.splice(0));

before(async () => {
  game = await startGame({ width: 1600, height: 900 }); page = await game.open('', { setup: shell });
  // Both music sets, as the shipped build has them (their folders are git-ignored): 曲目 is then in the menu, and with the pad
  // in a war it once ran 9px past the 1024x600 window only where the music was on the disk (2026-11-18).
  await page.evaluate(() => { const a = window.__game.audio; if (a.sets.length < 2) { a.sets = [{ id: 'remix', label: 'Remix' }, { id: 'original', label: '原版' }]; a.set = 'remix'; } });
});
after(() => game?.close());

const openMenu = async () => { if (await page.locator('.sysmenu-list').isHidden()) await page.click('.sysmenu-btn'); };
const closeMenu = async () => { if (await page.locator('.sysmenu-list').isVisible()) await page.click('.sysmenu-btn'); };
const row = (text) => page.locator('.sysmenu-list button', { hasText: text });
// Each of sel wholly inside the window and on top where it stands; the list itself with nothing to scroll.
const lost = (sel, list) => page.evaluate(([sel, list]) => {
  const out = [];
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect(), name = el.textContent.trim().slice(0, 12);
    const inside = r.width > 0 && r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth;
    const top = inside && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (!inside) out.push(`${name} outside (${Math.round(r.left)},${Math.round(r.top)})-(${Math.round(r.right)},${Math.round(r.bottom)})`);
    else if (!top || !el.contains(top)) out.push(`${name} covered`);
    else if (el.scrollWidth > el.clientWidth + 1) out.push(`${name} cut short`);
  }
  const l = list && document.querySelector(list);
  if (l && l.scrollHeight > l.clientHeight + 1) out.push(`${list} scrolls ${l.scrollHeight - l.clientHeight}px`);
  return out;
}, [sel, list]);
const menuFits = async (where) => {
  for (const [width, height] of SIZES) {
    await page.setViewportSize({ width, height }); await page.waitForTimeout(150);
    await openMenu();
    assert.deepEqual(await lost('.sysmenu-list button, .sysmenu-list label', '.sysmenu-list'), [], `${where} ${width}x${height}`);
    await closeMenu();
  }
  await page.setViewportSize({ width: 1600, height: 900 }); await page.waitForTimeout(150);
};

test('on the title 退出游戏 is the last button, fits beside the footer at every window, and leaves at once', async () => {
  await skipIntro(page);
  for (const [width, height] of SIZES) {
    await page.setViewportSize({ width, height }); await page.waitForTimeout(250);
    assert.deepEqual(await lost('.tt-menu .btn'), [], `${width}x${height}`);
    const gap = await page.evaluate(() => document.querySelector('.tt-foot').getBoundingClientRect().top - [...document.querySelectorAll('.tt-menu .btn')].pop().getBoundingClientRect().bottom);
    assert.ok(gap >= 0, `${width}x${height}: the menu runs ${-gap}px into the footer`);
  }
  await page.setViewportSize({ width: 1600, height: 900 });
  assert.equal(await page.locator('.tt-menu .btn').last().textContent(), '退出游戏');
  await calls();
  await page.locator('.tt-menu .btn', { hasText: '退出游戏' }).click();
  assert.deepEqual(await calls(), ['quit'], 'nothing to lose on the title: no question');
  assert.equal(await page.locator('.modal').count(), 0);
});

test('the title\'s 系统 menu has 全屏 and 退出游戏, all rows in the window', async () => {
  await openMenu();
  assert.equal(await row('全屏 关').count(), 1);
  assert.equal(await row('退出游戏').count(), 1);
  await closeMenu();
  await menuFits('title');
});

test('系统 → 界面大小 sits beside 全屏 and cycles 标准 → 大 → 小, told to the shell and remembered', async () => {
  // The page told the shell its size as it loaded, before the first paint (src/uiscale.js).
  assert.equal(await page.evaluate(() => window.__desk.firstUi), 'normal');
  await calls();
  await openMenu();
  const [fs, ui] = await Promise.all([row('全屏 关').boundingBox(), row('界面大小 标准').boundingBox()]);
  assert.ok(Math.abs(fs.y - ui.y) < 1 && ui.x > fs.x, 'one row');
  await row('界面大小 标准').click();
  assert.equal(await row('界面大小 大').count(), 1);
  await page.locator('.toast', { hasText: '按 125% 显示' }).waitFor();
  await row('界面大小 大').click();
  // 小 is never zoomed (desktop/uiscale.js): its toast says it is 0.4.1's size, not that the window is too small
  await page.locator('.toast', { hasText: '不放大，与 0.4.1 及以前相同' }).waitFor(); // the stand-in shell answers 1 for 小
  assert.deepEqual(await calls(), ['ui:large', 'ui:small']);
  assert.equal(await page.evaluate(() => localStorage.getItem('hd2d-ui-size')), 'small');
  await row('界面大小 小').click();
  assert.deepEqual(await calls(), ['ui:normal']);
  await closeMenu();
});

test('the 操作 page names the window\'s keys', async () => {
  await openMenu(); await row('说明').click();
  const keys = page.locator('.modal .ctl');
  await keys.locator('button', { hasText: '键鼠' }).click();
  await keys.locator('.ctl-tabs button', { hasText: '通用' }).click();
  const text = await keys.textContent();
  for (const t of ['F11', 'Alt+Enter', '全屏开关', 'Alt+F4', '退出游戏']) assert.ok(text.includes(t), `${t} is missing: ${text}`);
  assert.deepEqual(await lost('.modal .ctl kbd'), []);
  await page.setViewportSize({ width: 1024, height: 600 }); await page.waitForTimeout(200);
  assert.deepEqual(await lost('.modal .ctl kbd'), [], '1024x600');
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.keyboard.press('Escape');
});

test('a game tells the shell it is on; 系统 → 全屏 switches, follows F11, and says how to come back', async () => {
  await calls();
  await newCampaign(page, '曹操');
  assert.ok((await calls()).includes('unsaved:true'), 'closing the window must ask from here on');
  await openMenu();
  await row('全屏 关').click();
  assert.deepEqual(await calls(), ['fullscreen']);
  assert.equal(await row('全屏 开').count(), 1, 'the row follows');
  await page.locator('.toast', { hasText: '已全屏' }).waitFor();
  assert.match(await page.locator('.toast', { hasText: '已全屏' }).textContent(), /F11.*Alt\+Enter.*系统/);
  await page.evaluate(() => window.__desk.tell(false)); // F11 in the shell
  assert.equal(await row('全屏 关').count(), 1, 'the row follows the key too');
  await closeMenu();
});

test('on the strategy map every row of the menu is in the window, 回到标题 and 退出游戏 on one row', async () => {
  await menuFits('strategy');
  await openMenu();
  const [a, b] = await Promise.all(['回到标题', '退出游戏'].map((t) => row(t).boundingBox()));
  assert.ok(Math.abs(a.y - b.y) < 1 && b.x > a.x + a.width - 1, 'side by side');
  await closeMenu();
});

test('退出游戏 in a game asks first: 取消 and Esc stay, 不记录 leaves, 先记录 writes the record and then leaves', async () => {
  const ask = async () => { await openMenu(); await row('退出游戏').click(); await page.locator('.modal', { hasText: '确定退出游戏吗' }).waitFor(); };
  await calls();
  await ask(); await page.locator('.modal button', { hasText: '取消' }).click();
  await ask(); await page.keyboard.press('Escape');
  await ask(); await page.locator('.modal button', { hasText: '先记录' }).click();
  await page.locator('.modal .slot').first().waitFor();
  await page.locator('.modal button', { hasText: '取消' }).click();
  assert.deepEqual(await calls(), [], 'still in the game');
  assert.equal(await page.evaluate(() => window.__game.G.saves().some(Boolean)), false);

  await ask(); await page.locator('.modal button', { hasText: '先记录' }).click();
  await page.locator('.modal .slot').first().click();
  await page.waitForFunction(() => window.__desk.calls.includes('quit'), null, { timeout: 10000 });
  assert.equal(await page.evaluate(() => window.__game.G.saves().filter(Boolean).length), 1, 'recorded before leaving');
  await calls();

  await ask(); await page.locator('.modal button', { hasText: '不记录，退出' }).click();
  await page.waitForFunction(() => window.__desk.calls.includes('quit'), null, { timeout: 10000 });
});

test('with a pad alone: Start opens the menu, the shoulder buttons and d-pad reach 全屏, 回到标题 and 退出游戏, and 退出游戏 can be answered', async () => {
  const tap = async (i, wait = 150) => { await page.evaluate((i) => window.__padButton(i, true), i); await page.waitForTimeout(70); await page.evaluate((i) => window.__padButton(i, false), i); await page.waitForTimeout(wait); };
  const START = 9, DOWN = 13;
  const focused = () => page.evaluate(() => document.activeElement?.textContent.trim() ?? '');
  const south = await page.evaluate(() => window.__game.pad.state.confirm !== 'east'); // which face button confirms
  await tap(START, 300);
  assert.ok(await page.evaluate(() => document.querySelector('.sysmenu-list:not([hidden])')?.contains(document.activeElement)), 'the menu is open and focused');
  const until = async (dir, text, n) => { for (let i = 0; i < n && (await focused()) !== text; i++) await tap(dir, 60); assert.equal(await focused(), text); };
  await tap(5); // RB to 画面
  await until(DOWN, '全屏 关', 8);
  await tap(4); await tap(4); // 常用, then 其他
  await until(DOWN, '回到标题', 8);
  await tap(DOWN);
  assert.equal(await focused(), '退出游戏');
  await calls();
  await tap(south ? 0 : 1, 400);
  await page.locator('.modal', { hasText: '确定退出游戏吗' }).waitFor();
  await tap(south ? 1 : 0, 400);
  assert.equal(await page.locator('.modal').count(), 0, 'cancel closes the question');
  assert.deepEqual(await calls(), [], 'and the game goes on');
  await page.mouse.move(700, 300); await page.mouse.move(710, 310);
});

test('in a war the menu still fits the smallest window, and 退出游戏 says why no record can be made', async () => {
  await calls();
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
    await page.waitForTimeout(1500);
  } finally { stop(); }
  await menuFits('war');
  await page.evaluate(() => window.__padButton(10, true)); await page.waitForTimeout(120); // L3, a look at the terrain
  await page.evaluate(() => window.__padButton(10, false)); await page.waitForTimeout(300);
  await openMenu();
  assert.equal(await row('确定键').count(), 1, 'the pad was seen');
  await page.mouse.move(700, 300); // back to the mouse: the rows stay
  await menuFits('war, a pad used');
  await openMenu(); await row('退出游戏').click();
  await page.locator('.modal', { hasText: '中断战斗' }).waitFor();
  assert.equal(await page.locator('.modal button', { hasText: '先记录' }).count(), 0);
  await page.locator('.modal button', { hasText: '取消' }).click();
  assert.deepEqual(await calls(), []);
});

test('back on the title nothing is at risk any more', async () => {
  await openMenu(); await row('回到标题').click();
  await page.locator('.modal button', { hasText: '不记录，回到标题' }).click();
  await page.waitForFunction(() => document.body.dataset.screen === 'title' && !window.__game?.g && window.__desk?.calls.includes('unsaved:false'), null, { timeout: 60000 });
});

test('no page errors', () => assert.deepEqual(page.errors, []));

test('a browser has neither row, nor the button on the title, nor the keys', async () => {
  const p = await game.open();
  await skipIntro(p);
  assert.equal(await p.locator('.tt-menu .btn', { hasText: '退出游戏' }).count(), 0);
  await p.click('.sysmenu-btn');
  assert.equal(await p.locator('.sysmenu-list button', { hasText: /全屏|退出游戏/ }).count(), 0);
  await p.locator('.sysmenu-list button', { hasText: '说明' }).click();
  assert.ok(!(await p.locator('.modal').textContent()).includes('F11'));
  assert.deepEqual(p.errors, []);
  await p.context().close();
});
