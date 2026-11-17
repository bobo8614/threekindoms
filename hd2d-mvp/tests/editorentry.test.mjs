// The save editor is reached from the title's 系统 → 记录编辑 and leads back with 返回游戏, as the desktop
// package has no address bar. Unwritten changes are asked about in the page (the desktop shell blocks a
// beforeunload without a dialog), and the title's opening is not replayed on the way back.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startGame, skipIntro, newCampaign } from './game.mjs';

let game, page;
before(async () => { game = await startGame(); page = await game.open(); });
after(() => game?.close());

test('系统 → 记录编辑 opens the editor and 返回游戏 comes back to the title without its opening', async () => {
  await page.evaluate(() => { const { G } = window.__game; G.save(G.newGame(4, 1, 1), 1); });
  await skipIntro(page);
  await page.click('.sysmenu-btn');
  await page.locator('.sysmenu-list button', { hasText: '记录编辑' }).click();
  await page.waitForFunction(() => location.pathname.endsWith('/save-editor.html') && window.__editor?.g, null, { timeout: 30000 });
  assert.match(page.url(), /\?mute/, 'the query (mute) is kept');

  // an unwritten change: 返回游戏 asks first, and 取消 stays
  await page.evaluate(() => { window.__editor.g.officers[0].war = 1; });
  await page.click('#back');
  await page.locator('.modal', { hasText: '会丢失' }).waitFor();
  await page.locator('.modal button', { hasText: '取消' }).click();
  assert.ok(page.url().includes('save-editor.html'), '取消 stays in the editor');

  await page.click('#back');
  await page.locator('.modal button', { hasText: '放弃并返回' }).click();
  await page.waitForFunction(() => window.__game?.debug && document.querySelector('.tt'), null, { timeout: 60000 });
  assert.match(page.url(), /\/index\.html\?mute$/);
  assert.ok(await page.evaluate(() => !!document.querySelector('.tt.done, .tt.instant')), 'the title shows at once');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('haou-hd2d-save:1')).officers[0].war !== 1), true, 'the change was not written');
});

test('the in-game 系统 menu has no 记录编辑 (a running game would be lost)', async () => {
  await page.click('.sysmenu-btn');
  assert.equal(await page.locator('.sysmenu-list button', { hasText: '记录编辑' }).count(), 1, 'on the title it is there');
  await page.click('.sysmenu-btn');
  await page.getByText('新的征程').click(); await page.waitForTimeout(800);
  await page.locator('.level', { hasText: 'LEVEL 1' }).click();
  await page.locator('.ruler', { hasText: '刘备' }).click(); await page.locator('.ruler', { hasText: '刘备' }).click();
  await page.waitForFunction(() => document.body.dataset.screen === 'strategy');
  await page.waitForFunction(() => !!document.querySelector('.sysmenu-btn'));
  await page.evaluate(() => document.querySelector('.sysmenu-btn').click());
  assert.equal(await page.locator('.sysmenu-list button', { hasText: '记录编辑' }).count(), 0);
});

// 系统 → 回到标题 (devblog #97/#101, 2026-11-03): the way to the title, and so to 记录编辑, without closing the game.
test('回到标题 warns, 取消 stays in the game, and it offers a record first only when one can be made', async () => {
  const p = await game.open(); await newCampaign(p);
  const year = await p.evaluate(() => { window.__game.g.year = 199; return window.__game.g.year; });
  const ask = async () => { await p.click('.sysmenu-btn'); await p.locator('.sysmenu-list button', { hasText: '回到标题' }).click(); await p.locator('.modal', { hasText: '未记录的进度会丢失' }).waitFor(); };
  await ask();
  await p.locator('.modal button', { hasText: '取消' }).click();
  assert.equal(await p.evaluate(() => window.__game.g?.year), year, '取消 keeps the running game');

  await ask();
  await p.keyboard.press('Escape');
  assert.equal(await p.evaluate(() => window.__game.g?.year), year, 'Esc keeps it too');

  // 先记录 then backing out of the slots stays as well, with nothing written
  await ask();
  await p.locator('.modal button', { hasText: '先记录' }).click();
  await p.locator('.modal .slot').first().waitFor();
  await p.locator('.modal button', { hasText: '取消' }).click();
  assert.equal(await p.evaluate(() => window.__game.g?.year), year);
  assert.equal(await p.evaluate(() => window.__game.G.saves().some(Boolean)), false);

  // a record cannot be made now: the dialog says why and has no 先记录
  await p.evaluate(() => window.__game.debug.holdCommand(true));
  await ask();
  assert.equal(await p.locator('.modal button', { hasText: '先记录' }).count(), 0);
  await p.locator('.modal', { hasText: '请先完成当前命令' }).waitFor();
  await p.locator('.modal button', { hasText: '取消' }).click();
  await p.evaluate(() => window.__game.debug.holdCommand(false));
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

const atTitle = (p) => p.waitForFunction(() => document.body.dataset.screen === 'title' && document.querySelector('.tt.done, .tt.instant') && !window.__game.g, null, { timeout: 60000 });
test('先记录 writes the record, then the title shows at once with 记录编辑', async () => {
  const p = await game.open(); await newCampaign(p);
  const year = await p.evaluate(() => { const { g } = window.__game; g.year = 199; return g.year; });
  await p.click('.sysmenu-btn'); await p.locator('.sysmenu-list button', { hasText: '回到标题' }).click();
  await p.locator('.modal button', { hasText: '先记录' }).click();
  await p.locator('.modal .slot').nth(2).click();
  await atTitle(p);
  const rec = await p.evaluate(() => window.__game.G.saves()[2]);
  assert.equal(rec.year, year, 'the record holds the game as it was');
  await p.click('.sysmenu-btn');
  assert.equal(await p.locator('.sysmenu-list button', { hasText: '记录编辑' }).count(), 1);
  assert.equal(await p.locator('.sysmenu-list button', { hasText: '回到标题' }).count(), 0, 'not offered on the title itself');
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

test('不记录 leaves the game for the title with nothing written', async () => {
  const p = await game.open(); await newCampaign(p);
  await p.click('.sysmenu-btn'); await p.locator('.sysmenu-list button', { hasText: '回到标题' }).click();
  await p.locator('.modal button', { hasText: '不记录' }).click();
  await atTitle(p);
  assert.equal(await p.evaluate(() => window.__game.G.saves().some(Boolean)), false);
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

test('no page errors', () => assert.deepEqual(page.errors, []));

// A mouse's side buttons go history back/forward in Chromium and Electron, and a game is never saved on its own:
// a brushed side button after 记录编辑 → 返回游戏 used to drop the running game for the editor page.
test('a mouse side button does not leave a running game', async () => {
  const p = await game.open(); await skipIntro(p);
  await p.click('.sysmenu-btn');
  await p.locator('.sysmenu-list button', { hasText: '记录编辑' }).click();
  await p.waitForFunction(() => location.pathname.endsWith('/save-editor.html') && window.__editor, null, { timeout: 30000 });
  await p.click('#back');
  await p.waitForFunction(() => window.__game?.debug && document.querySelector('.tt'), null, { timeout: 60000 });
  assert.equal(await p.evaluate(() => history.length), 2, 'the trip to the editor and back leaves no history entries (the first is about:blank)');
  await newCampaign(p);
  // an entry to go back to, as a page with history would have: the side buttons must not use it
  await p.evaluate(() => { history.pushState({}, '', location.href); window.__popped = 0; addEventListener('popstate', () => window.__popped++); window.__alive = true; });
  const cdp = await p.context().newCDPSession(p);
  for (const button of ['back', 'forward']) {
    for (const type of ['mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', { type, x: 400, y: 300, button, clickCount: 1 });
  }
  await p.waitForTimeout(1000);
  assert.equal(await p.evaluate(() => window.__alive && window.__popped), 0, 'still in the same game, history untouched');
  assert.equal(await p.evaluate(() => document.body.dataset.screen), 'strategy');
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

// On short screens a number box is read-only and opens the page's keypad (the system keyboard would cover it in
// the full-screen Android package).
async function typeOnKeypad(p, box, digits) {
  await box.click();
  await p.locator('.modal .kp').waitFor();
  for (const d of digits) await p.locator('.modal .kp button', { hasText: new RegExp(`^${d}$`) }).click();
  await p.locator('.modal .foot button', { hasText: '确定' }).click();
  await p.locator('.modal .kp').waitFor({ state: 'detached' });
}

// devblog #356 (D66, 冷如枫@devblog): on a phone held sideways the editor's bottom action bar sat over record slots
// and stat sliders. On short landscape screens the bar is a rail on the right with a gutter of its own, so every
// slot, slider and box is reachable where it lies, and the buttons still work.
test('on short landscape screens nothing in the editor lies under the action bar', async () => {
  const p = await game.open();
  await p.evaluate(() => { const { G } = window.__game; for (let s = 1; s <= 8; s++) G.save(G.newGame(4, 1, 1), s); });
  await p.goto(new URL('save-editor.html?mute&phone', p.url()).href);
  await p.waitForFunction(() => window.__editor?.g, null, { timeout: 30000 });
  for (const [width, height] of [[844, 390], [812, 375], [667, 375], [568, 320]]) {
    await p.setViewportSize({ width, height });
    for (const tab of ['武将', '城市', '同盟', '原版漏洞']) {
      await p.locator('#tabs .btn', { hasText: tab }).click();
      const r = await p.evaluate(() => {
        const dock = document.querySelector('#dock').getBoundingClientRect();
        const items = [...document.querySelectorAll('.ed button, .ed input, .ed select, .ed .slotc')].filter((el) => el.offsetParent);
        // the part of a control that shows: clipped by boxes that scroll (the 同盟 table scrolls sideways in its own box)
        const shown = (el) => { const b = el.getBoundingClientRect(); let l = b.left, r = b.right;
          for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) if (getComputedStyle(a).overflowX !== 'visible') { const c = a.getBoundingClientRect(); l = Math.max(l, c.left); r = Math.min(r, c.right); }
          return { l, r }; };
        const over = items.filter((el) => { const { l, r } = shown(el); return r > l && r > dock.left && l < dock.right; })
          .map((el) => el.getAttribute('aria-label') || el.textContent.trim().slice(0, 12) || el.tagName);
        return { over, dock: { left: dock.left, right: dock.right, top: dock.top, bottom: dock.bottom }, sw: document.documentElement.scrollWidth, w: innerWidth, h: innerHeight };
      });
      assert.deepEqual(r.over, [], `${width}×${height} ${tab}: controls in the action bar's column`);
      assert.ok(r.dock.top >= 0 && r.dock.bottom <= r.h && r.dock.right <= r.w, `${width}×${height}: the bar is on screen`);
      assert.ok(r.sw <= r.w, `${width}×${height}: no sideways scroll`);
    }
    await p.locator('#tabs .btn', { hasText: '武将' }).click();
    if (!(await p.locator('.detail').isVisible())) await p.locator('.rows .row.on').click(); // one pane at a time below 780 px
    const box = p.locator('.stats-ed input[type="number"]').first();
    await box.scrollIntoViewIfNeeded();
    const before = await box.inputValue();
    await typeOnKeypad(p, box, before === '87' ? '86' : '87');
    await p.locator('#write').click();
    await p.locator('.modal .foot button', { hasText: '写回' }).click();
    await p.waitForFunction(() => window.__editor.changes().length === 0);
  }
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

// The page as one screen on a phone held sideways (2026-11-16): nothing scrolls but the boxes inside it, every control
// is big enough for a finger, the record slots are behind the 记录 button, and below 780 px the list and the detail take
// turns (a row opens the detail; ‹ 列表 and Esc, which is the Android back key, go back). − and + change a number
// without the keyboard.
test('on short landscape screens the editor fits the screen and every control is finger-sized', async () => {
  const p = await game.open();
  await p.evaluate(() => { const { G } = window.__game; G.save(G.newGame(4, 1, 1), 1); G.save(G.newGame(2, 0, 1), 2); });
  await p.goto(new URL('save-editor.html?mute&phone', p.url()).href);
  await p.waitForFunction(() => window.__editor?.g, null, { timeout: 30000 });
  for (const [width, height] of [[844, 390], [812, 375], [667, 375], [568, 320]]) {
    await p.setViewportSize({ width, height });
    const at = `${width}×${height}`;
    for (const tab of ['武将', '城市', '同盟', '原版漏洞']) {
      await p.locator('#tabs .btn', { hasText: tab }).click();
      if (tab === '武将' || tab === '城市') { const row = p.locator('.rows .row').nth(1); if (await row.isVisible()) await row.click(); }
      const r = await p.evaluate(() => {
        const small = [...document.querySelectorAll('.ed button, .ed input, .ed select, #dock button')]
          .filter((el) => el.offsetParent && el.type !== 'file')
          .filter((el) => { const b = el.getBoundingClientRect(); return Math.min(b.width, b.height) < 31.5; })
          .map((el) => `${el.getAttribute('aria-label') || el.textContent.trim().slice(0, 8) || el.tagName} ${Math.round(el.getBoundingClientRect().height)}`);
        return { small, sh: document.documentElement.scrollHeight, h: innerHeight };
      });
      assert.deepEqual(r.small, [], `${at} ${tab}: controls under 32 px`);
      assert.ok(r.sh <= r.h, `${at} ${tab}: the page itself does not scroll (${r.sh} > ${r.h})`);
    }
    await p.locator('#tabs .btn', { hasText: '武将' }).click();
    const onePane = width < 780;
    assert.equal(await p.locator('.detail').isVisible(), !onePane, `${at}: the detail beside the list from 780 px only`);
    await p.locator('.rows .row').nth(2).click();
    assert.ok(await p.locator('.detail').isVisible(), `${at}: a row shows its detail`);
    assert.equal(await p.locator('.list').isVisible(), !onePane);
    const int = p.getByLabel('智力数值'), was = Number(await int.inputValue());
    await p.getByLabel('智力加').click(); await p.getByLabel('智力加').click(); await p.getByLabel('智力减').click();
    assert.equal(Number(await int.inputValue()), was + 1, `${at}: − and + step the number`);
    assert.ok(await int.evaluate((el) => el.readOnly), `${at}: the box does not call up the system keyboard`);
    await int.click();
    const kp = await p.locator('.modal').evaluate((el) => { const b = el.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, h: innerHeight, scroll: el.scrollHeight - el.clientHeight }; });
    assert.ok(kp.top >= 0 && kp.bottom <= kp.h && kp.scroll <= 1, `${at}: the keypad fits the screen (${JSON.stringify(kp)})`);
    await p.keyboard.press('Escape');
    await typeOnKeypad(p, int, '42');
    assert.equal(await int.inputValue(), '42', `${at}: the keypad sets the number`);
    if (onePane) {
      await p.keyboard.press('Escape');
      assert.ok(await p.locator('.list').isVisible() && !(await p.locator('.detail').isVisible()), `${at}: Esc (the back key) returns to the list`);
      await p.locator('.rows .row').nth(2).click();
      await p.locator('.se-back').click();
      assert.ok(await p.locator('.list').isVisible(), `${at}: ‹ 列表 returns to the list`);
    }
    await p.locator('#revert').click(); await p.locator('.modal .foot button', { hasText: '放弃' }).click();
    // the slots behind 记录: the dialog shows them and switches
    const from = await p.evaluate(() => window.__editor.slot), to = from === 1 ? 2 : 1;
    await p.locator('#tabs .slotpick').click();
    const card = p.locator('.modal .slotc', { hasText: `记录${'一二'[to - 1]}` });
    assert.ok(await card.isVisible(), `${at}: the 记录 dialog shows the slots`);
    await card.click();
    await p.waitForFunction((n) => window.__editor.slot === n, to);
  }
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

// The Android package's WebView drops <a download> and blob: links, and its file chooser hides files not typed as
// JSON, so there 导出 and 导入 go through the shell's NativeFiles (apk/.../MainActivity.java), answering through
// window.__nativeFile. A stand-in here; the shell's own sheets were tried in the emulator.
test('in the Android package 导出 and 导入 use the shell\'s file sheets and say where the file went', async () => {
  const p = await game.open();
  await p.evaluate(() => { const { G } = window.__game; G.save(G.newGame(4, 1, 1), 1); });
  await p.addInitScript(() => {
    window.__calls = []; window.__answer = null;
    window.NativeFiles = {
      save: (name, text) => { window.__calls.push({ save: name, text }); setTimeout(() => window.__nativeFile(window.__answer), 30); },
      open: () => { window.__calls.push({ open: true }); setTimeout(() => window.__nativeFile(window.__answer), 30); },
    };
  });
  await p.goto(new URL('save-editor.html?mute&phone', p.url()).href);
  await p.waitForFunction(() => window.__editor?.g, null, { timeout: 30000 });
  await p.setViewportSize({ width: 812, height: 375 });
  let downloads = 0; p.on('download', () => downloads++);
  const toast = () => p.locator('body > .toast').last().innerText();

  await p.evaluate(() => { window.__answer = { ok: true, name: 'threekindoms-记录一-189年1月.json', where: 'Download' }; });
  await p.click('#export');
  await p.locator('body > .toast', { hasText: '已导出' }).waitFor();
  assert.match(await toast(), /threekindoms-记录一-189年1月\.json[\s\S]*Download/, 'the toast names the file and its folder');
  const sent = await p.evaluate(() => window.__calls[0]);
  assert.match(sent.save, /^threekindoms-记录一-189年1月\.json$/);
  assert.equal(JSON.parse(sent.text).year, 189, 'the record itself goes to the shell');

  await p.evaluate(() => { window.__answer = { ok: false }; document.querySelectorAll('body > .toast').forEach((t) => t.remove()); });
  await p.click('#export'); await p.waitForTimeout(300);
  assert.equal(await p.locator('body > .toast').count(), 0, 'a cancelled sheet says nothing');
  await p.evaluate(() => { window.__answer = { error: 'write' }; });
  await p.click('#export');
  await p.locator('body > .toast', { hasText: '导出失败' }).waitFor();

  // 导入: the shell hands back the file's text; the record goes to the slot picked
  const rec = await p.evaluate(() => { const r = JSON.parse(window.__calls[0].text); r.year = 199; return JSON.stringify(r); });
  await p.evaluate((text) => { window.__answer = { ok: true, name: '从微信收到的.json', text }; }, rec);
  await p.click('#import');
  await p.locator('.modal', { hasText: '从微信收到的.json' }).waitFor();
  await p.locator('.modal .slotc', { hasText: '记录二' }).click();
  await p.waitForFunction(() => window.__editor.slot === 2 && window.__editor.g.year === 199);
  await p.evaluate(() => { window.__answer = { ok: true, name: 'x.txt', text: 'not json' }; });
  await p.click('#import');
  await p.locator('body > .toast', { hasText: '无法导入' }).waitFor();
  assert.equal(await p.evaluate(() => window.__calls.filter((c) => c.open).length), 2);
  assert.equal(downloads, 0, 'no browser download in the package');
  assert.deepEqual(p.errors, []);
  await p.context().close();
});
