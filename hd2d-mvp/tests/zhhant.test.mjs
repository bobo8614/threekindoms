// 系统 → 文字 繁體（台湾标准，src/lang.js）: the converter on the names and words it must get right, and the game in 繁體 with
// no 简体 character left on the screens a player passes (title, 选择君主, the 战略地图, 系统 menu, 人物志), CSS text
// included; the 人物志 search takes 繁體 typed; in 简体 nothing is patched.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import TABLE from '../src/zhtable.js';
import { makeConverter, makeReverse } from '../src/zh.js';
import { startGame, skipIntro, closeMessages } from './game.mjs';

const zh = makeConverter(TABLE), back = makeReverse(TABLE);

test('converter: names and words as 台湾 writes them, the overrides over OpenCC', () => {
  const want = {
    刘备: '劉備', 关羽: '關羽', 赵云: '趙雲', 于禁: '于禁', 淳于琼: '淳于瓊', 钟会: '鍾會', 凌统: '凌統', 文丑: '文醜',
    高干: '高幹', 姜维: '姜維', 并州: '并州', 郁林: '鬱林', 云南: '雲南', 方天画戟: '方天畫戟',
    '体力回复至30': '體力回復至30', 默认: '預設', 鼠标: '滑鼠', 搜索: '搜索', '不是只能继续一次': '不是只能繼續一次',
    '按占城数发放': '按佔城數發放', 地图标签: '地圖標籤', 系统: '系統', '游戏速度': '遊戲速度',
  };
  for (const [s, t] of Object.entries(want)) assert.equal(zh(s), t, s);
  assert.equal(zh('HD-2D 开 (Tab)'), 'HD-2D 開 (Tab)');
  assert.equal(back('劉備'), '刘备');
  assert.equal(back('趙雲'), '赵云');
});

// Text on screen that 繁體 would still change (lang.js zh, the page's own converter): a 简体 character left behind. Covers text
// nodes, the attributes a player reads, ::before / ::after and the page title; players' own names (rawText) are left out.
const leftovers = (page) => page.evaluate(async () => {
  const { zh, isRaw } = await import(new URL('src/lang.js', location.href).href);
  const bad = new Set();
  const note = (s, where) => { if (s && zh(s) !== s) bad.add(`${where}: ${s.trim().slice(0, 40)} → ${zh(s).trim().slice(0, 40)}`); };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (isRaw(n) || el?.closest('script, style')) continue;
    note(n.data, `${el?.tagName}.${el?.className}`);
  }
  for (const el of document.querySelectorAll('*')) {
    for (const k of ['title', 'placeholder', 'aria-label', 'alt', 'data-label', 'data-news']) note(el.getAttribute(k), `${el.tagName}[${k}]`);
    if (el.matches('.tq-cmd')) note(el.dataset.k, 'tq-cmd[data-k]');
    for (const p of ['::before', '::after']) { const c = getComputedStyle(el, p).content; if (c && c !== 'none' && c !== 'normal') note(c, `${el.className}${p}`); }
  }
  note(document.title, 'title');
  return [...bad];
});

let game, page;
before(async () => { game = await startGame({ width: 1366, height: 768 }); });
after(() => game?.close());

test('简体 (default): nothing patched, the menu row says 文字 简体', async () => {
  const p = await game.open();
  await skipIntro(p);
  assert.equal(await p.evaluate(() => document.documentElement.lang), 'zh-CN');
  await p.click('.sysmenu-btn');
  assert.equal(await p.locator('.sysmenu-list button', { hasText: /^文字 / }).textContent(), '文字 简体');
  await p.close();
});

test('繁體: title, 选择君主 and the 战略地图 show no 简体 character', async () => {
  page = await game.open('&lang=hant');
  await skipIntro(page);
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'zh-Hant-TW');
  assert.deepEqual(await leftovers(page), [], 'title');
  assert.match(await page.locator('.maker').textContent(), /tianlin/, 'the makers are players\' own names, as written');
  await page.click('.sysmenu-btn');
  assert.equal(await page.locator('.sysmenu-list button', { hasText: /^文字 / }).first().textContent().then((t) => t.startsWith('文字 繁體')), true);
  assert.deepEqual(await leftovers(page), [], 'title 系统');
  await page.click('.sysmenu-btn');
  await page.getByText(zh('新的征程')).click();
  await page.locator('.level', { hasText: 'LEVEL 1' }).click();
  assert.deepEqual(await leftovers(page), [], '选择君主');
  const ruler = page.locator('.ruler', { hasText: zh('刘备') });
  await ruler.click(); await ruler.click();
  await page.waitForFunction(() => document.body.dataset.screen === 'strategy');
  const stop = closeMessages(page, { aiTurns: true });
  try { await page.waitForFunction(() => { const g = window.__game.g; return g.current === g.player && !document.querySelector('.aiturn, .panel.msg'); }, null, { timeout: 90000 }); } finally { stop(); }
  assert.deepEqual(await leftovers(page), [], '战略地图');
  await page.click('.sysmenu-btn');
  assert.deepEqual(await leftovers(page), [], '战略地图 系统');
  await page.click('.sysmenu-btn');
  assert.deepEqual(page.errors, []);
});

test('繁體: the 人物志 takes 繁體 typed, and switching in a game waits for 回到标题', async () => {
  await page.keyboard.press('r');
  await page.waitForSelector('input[type=search]');
  assert.deepEqual(await leftovers(page), [], '人物志');
  await page.fill('input[type=search]', '關羽');
  await page.waitForTimeout(200);
  assert.ok(await page.locator('.panel').getByText('關羽').count() > 0, '關羽 is found');
  await page.keyboard.press('Escape');
  await page.click('.sysmenu-btn');
  const row = page.locator('.sysmenu-list button', { hasText: /^文字 / }).first();
  await row.click();
  assert.equal(await row.textContent(), zh('文字 简体（回到标题后）'));
  for (const [width, height] of [[1024, 600], [1366, 768]]) { // the longer label, in its half of the row at the smallest window
    await page.setViewportSize({ width, height }); await page.waitForTimeout(150);
    assert.ok(await row.evaluate((b) => b.scrollWidth <= b.clientWidth + 1 && b.getBoundingClientRect().right <= innerWidth), `${width}x${height}: 文字 row clipped`);
  }
  // 记录消耗 → 免费 marks the 城 list's 记录 row, found by its text on the page (app.js markFreeSave, zh('记录')).
  // Clicked in the page (no pointerdown), so the open 系统 menu and the 城 list stay up together, as the comment there has it.
  await page.evaluate((t) => {
    document.querySelector('.dock .tabs .btn[data-tab="城"]').click();
    [...document.querySelectorAll('.sysmenu-list button')].find((b) => b.textContent.startsWith(t)).click();
  }, zh('记录消耗'));
  assert.equal(await page.locator('.dock .acts .cmd em.free').count(), 1, '记录 marked 免');
  assert.equal(await page.evaluate(() => localStorage.getItem('hd2d-lang')), 'hans');
  assert.equal(await page.evaluate(() => document.body.dataset.screen), 'strategy', 'the game goes on');
  assert.deepEqual(page.errors, []);
});

test('繁體: the 说明 and a war (deploy, HUD, 系统) show no 简体 character', async () => {
  if (await page.locator('.sysmenu-list').isHidden()) await page.click('.sysmenu-btn');
  await page.locator('.sysmenu-list button', { hasText: zh('说明') }).click();
  await page.waitForTimeout(300);
  assert.deepEqual(await leftovers(page), [], '说明');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  await page.evaluate(() => {
    const { g, G, debug } = window.__game, from = g.factions[g.player].city, c = g.cities[from];
    const to = g.cities[G.data().cities[from].roads[0]];
    for (const id of [...c.officers, ...to.officers]) g.officers[id].soldiers ||= 500;
    const ids = c.officers.slice(0, 3);
    debug.fieldWar(debug.setupWar(g, { from, to: G.data().cities[from].roads[0], ids, commander: ids[0], gold: 100, rice: 400 }), 'att');
  });
  await page.waitForFunction(() => window.__game.war?.finishDeploy && document.body.dataset.screen === 'war', null, { timeout: 30000 });
  const stop = closeMessages(page);
  try {
    await page.waitForTimeout(2500);
    assert.deepEqual(await leftovers(page), [], '布阵');
    await page.evaluate(() => window.__game.war.finishDeploy());
    await page.waitForFunction(() => { const f = window.__game.war.field; return f.turn === f.human && !document.querySelector('.banner, .panel.msg'); }, null, { timeout: 30000 });
  } finally { stop(); }
  assert.deepEqual(await leftovers(page), [], '战场');
  await page.click('.sysmenu-btn');
  assert.deepEqual(await leftovers(page), [], '战场 系统');
  await page.click('.sysmenu-btn');
  assert.deepEqual(page.errors, []);
});

test('繁體: the 记录编辑 page', async () => {
  const p = await game.open('&lang=hant');
  await p.goto(new URL('save-editor.html?mute&lang=hant', p.url()).href);
  await p.waitForTimeout(1500);
  assert.equal(await p.evaluate(() => document.documentElement.lang), 'zh-Hant-TW');
  assert.deepEqual(await leftovers(p), [], '记录编辑');
  assert.deepEqual(p.errors, []);
  await p.close();
});
