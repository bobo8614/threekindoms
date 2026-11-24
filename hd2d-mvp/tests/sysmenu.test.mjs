// The 系统 menu at every window the desktop build allows: each row can be reached on the strategy map and in a war,
// also with both music sets installed (the shipped build), which adds the 曲目 row. It once ran off the bottom of the window.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startGame, newCampaign, closeMessages, skipIntro } from './game.mjs';

const SIZES = [[1600, 900], [1366, 768], [1280, 800], [1024, 600]]; // 1024x600 is the desktop window's minimum (desktop/main.js)
const ROWS = '.sysmenu-list button, .sysmenu-list label';
let game, page;

before(async () => {
  game = await startGame({ width: 1600, height: 900 });
  page = await game.open();
  await page.evaluate(() => { // the local music folders are git-ignored; the row must count whether or not they are here
    const a = window.__game.audio;
    if (a.sets.length < 2) { a.sets = [{ id: 'remix', label: '重制' }, { id: 'original', label: '原版' }]; a.set = 'remix'; }
  });
});
after(() => game?.close());

const openMenu = async () => { if (await page.locator('.sysmenu-list').isHidden()) await page.click('.sysmenu-btn'); };
const closeMenu = async () => { if (await page.locator('.sysmenu-list').isVisible()) await page.click('.sysmenu-btn'); };
// Each row wholly inside the window, on top where it stands and showing all of its text, with nothing to scroll.
const lostRows = () => page.evaluate((sel) => {
  const lost = [], list = document.querySelector('.sysmenu-list');
  for (const el of list.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect(), name = el.textContent.trim();
    const inside = r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth;
    const top = inside && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2), hit = !!top && el.contains(top);
    if (!inside) lost.push(`${name} outside (${Math.round(r.left)},${Math.round(r.top)})-(${Math.round(r.right)},${Math.round(r.bottom)})`);
    else if (!hit) lost.push(`${name} covered by ${top?.tagName}.${top?.className} in .${top?.parentElement?.className}`);
    else if (el.scrollWidth > el.clientWidth + 1) lost.push(`${name} clipped`);
  }
  if (list.scrollHeight > list.clientHeight + 1 || list.scrollWidth > list.clientWidth + 1) lost.push('the menu needs scrolling');
  return lost;
}, ROWS);

async function everySize(rows) {
  await openMenu();
  for (const [width, height] of SIZES) {
    await page.setViewportSize({ width, height }); await page.waitForTimeout(150);
    assert.equal(await page.locator(ROWS).count(), rows, `${width}x${height}`);
    assert.deepEqual(await lostRows(), [], `${width}x${height}`);
    for (const last of ['说明', '欣赏模式', '回到标题']) { // a real click would leave the screen, so this one only checks it could land
      const el = page.locator('.sysmenu-list button', { hasText: last });
      if (await el.count()) await el.click({ trial: true, timeout: 2000 });
    }
  }
  await closeMenu();
}

// Below the window the desktop build allows (a browser tab can be any size) the menu scrolls, and focus brings each row into view.
async function tabThroughSmallWindow() {
  await page.setViewportSize({ width: 360, height: 300 }); await page.waitForTimeout(150);
  await openMenu();
  const box = page.locator('.sysmenu-list');
  assert.ok(await box.evaluate((l) => l.scrollHeight > l.clientHeight), 'this window is too small to show it all');
  await page.locator('.sysmenu-btn').focus();
  const n = await page.locator('.sysmenu-list button, .sysmenu-list input').count();
  for (let i = 0; i < n; i++) {
    await page.keyboard.press('Tab');
    const seen = await page.evaluate(() => {
      const a = document.activeElement, r = a.getBoundingClientRect(), l = a.closest('.sysmenu-list')?.getBoundingClientRect();
      return { name: a.closest('button, label')?.textContent, in: !!l && r.top >= l.top - 1 && r.bottom <= l.bottom + 1 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth };
    });
    assert.ok(seen.in, `Tab ${i + 1}: ${seen.name} is out of view`);
  }
  await closeMenu();
}

test('on the title every row is in the window', async () => {
  await skipIntro(page);
  await everySize(await (async () => { await openMenu(); return page.locator(ROWS).count(); })());
});

test('on the strategy map all 29 rows can be clicked at every window size', async () => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await newCampaign(page, '曹操');
  await everySize(29); // 地图标签 (073fbd62) shares 帧率's row, 文字 说明's
  await tabThroughSmallWindow();
  await page.setViewportSize({ width: 1600, height: 900 });
});

test('in a war all 30 rows (中断战斗 too) can be clicked at every window size', async () => {
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
    await page.waitForFunction(() => { const f = window.__game.war.field; return f.turn === f.human && !document.querySelector('.banner, .panel.msg'); }, null, { timeout: 30000 });
  } finally { stop(); }
  await everySize(30);
  await tabThroughSmallWindow();
  assert.deepEqual(page.errors, []);
});

// A phone shows one group at a time as a two-column grid (src/phone.css): the desktop's shared rows (声音｜曲目, 地名｜欣赏模式)
// once sat in one cell there, both buttons in half of it and 曲目 Remix on two lines (2026-11-18). Each button is a whole cell.
test('phone: every row of every tab of the menu is at least one cell of its grid wide', async () => {
  const p = await game.open('&phone', { setup: (c) => c.addInitScript(() => { localStorage.setItem('hd2d-quality', 'low'); localStorage.setItem('hd2d-quality-asked', '1'); }) });
  await p.setViewportSize({ width: 727, height: 335 });
  await p.evaluate(() => { const a = window.__game.audio; if (a.sets.length < 2) { a.sets = [{ id: 'remix', label: 'Remix' }, { id: 'original', label: '原版' }]; a.set = 'remix'; } });
  await newCampaign(p, '曹操');
  await p.click('.sysmenu-btn');
  const tabs = await p.locator('.sysmenu-tabs .btn').allTextContents();
  assert.ok(tabs.includes('声音') && tabs.includes('其他'), tabs.join());
  for (const t of tabs) {
    await p.locator('.sysmenu-tabs .btn', { hasText: t }).click();
    const narrow = await p.evaluate(() => {
      const g = document.querySelector('.sysmenu-group.on'), cell = (g.getBoundingClientRect().width - 6) / 2;
      return [...g.querySelectorAll('.btn')].filter((b) => !b.closest('.sysrange') || b.matches('.sysrange'))
        .filter((b) => b.getBoundingClientRect().width < cell - 1).map((b) => `${b.textContent.trim()} ${Math.round(b.getBoundingClientRect().width)}px < ${Math.round(cell)}px`);
    });
    assert.deepEqual(narrow, [], t);
  }
  assert.ok(await p.locator('.sysmenu-group.on .btn', { hasText: '欣赏模式' }).count(), 'the last tab is 其他');
  assert.deepEqual(p.errors, []);
  await p.context().close();
});
