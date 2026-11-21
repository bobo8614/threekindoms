import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startGame, newCampaign, cmd } from './game.mjs';
import { XBOX, NINTENDO, padTap, padHold, focused, walkTo } from './pad.mjs';

const shot = (p, name) => process.env.PAD_SHOTS && p.screenshot({ path: process.env.PAD_SHOTS + '/' + name + '.png' });
let game;
before(async () => { game = await startGame({ width: 1024, height: 600 }); });
after(() => game?.close());

async function campaign(family) {
  const p = await game.open('', { setup: family });
  p.setDefaultTimeout(6500);
  await p.evaluate(async () => { (await import('./src/vignette.js')).setVignettes(false); });
  await newCampaign(p);
  await p.waitForFunction(() => !document.querySelector('.banner, .shade'));
  await p.evaluate(() => { window.__game.g.books = 12; });
  return p;
}

for (const [command, family, ok] of [['离间', XBOX, 'a'], ['诱纳', NINTENDO, 'b']]) {
  test('pad chooses a general below the fold and carries out ' + command, async () => {
    const p = await campaign(family);
    const press = k => padTap(p, k, { wait: 220 });
    await press(ok);
    await press(ok);
    await press('lb'); // 城 → 谋, the focus on its first row
    await walkTo(p, 'down', new RegExp(command));
    await press(ok);
    assert.ok(await p.locator('.tc > summary:focus').count(), 'opens on a city');
    // Open a city reached below the initial viewport, including a closed branch.
    const city = await p.locator('.tc').evaluateAll(nodes => nodes.findLastIndex(n => n.querySelector('tr[tabindex]')));
    const target = p.locator('.tc').nth(city);
    for (let i = 0; i < 300 && !(await target.locator('> summary:focus').count()); i++) await padTap(p, 'down', { wait: 45 });
    assert.ok(await target.locator('> summary:focus').count());
    if (await target.evaluate(n => n.open)) await press('left');
    await press(ok);
    await press('right');
    assert.ok(await target.locator('tr[data-id]:focus').count());
    assert.ok(await p.locator(':focus').evaluate(row => {
      const bounds = row.getBoundingClientRect(), tree = row.closest('.otree').getBoundingClientRect();
      const dialog = row.closest('.modal');
      return bounds.top >= tree.top && bounds.bottom <= tree.bottom &&
        dialog.querySelector('.foot button').getBoundingClientRect().bottom <= dialog.getBoundingClientRect().bottom;
    }), 'the selected general and the cancel button are both visible');
    await shot(p, command);
    await press('left');
    await press('right');
    await press(ok);
    await p.locator('.modal tr[data-id]').first().waitFor();
    await press(ok);
    await p.locator('.runok').waitFor();
    await press(ok);
    await p.waitForFunction(() => window.__game.g.books === 11);
    assert.deepEqual(p.errors, []);
    await p.close();
  });
}

for (const [familyName, family, ok, back] of [['Xbox', XBOX, 'a', 'b'], ['Switch Pro', NINTENDO, 'b', 'a']]) {
  test(familyName + ' opens numbered slots in two/three presses and edits a general through reload', async () => {
    const p = await campaign(family);
    const tap = k => padTap(p, k, { wait: 240 });
    await tap('start');
    assert.equal(await focused(p), '记录进度');
    await shot(p, 'menu');
    await tap(ok);
    await p.locator('.slot:focus').waitFor();
    await tap(ok);
    await p.waitForFunction(() => window.__game.G.load(1)?.books === 11);
    await p.waitForFunction(() => !document.querySelector('.shade,.vig,.banner'));
    await p.evaluate(() => { window.__beforeLoad = true; window.__game.g.books = 4; });
    await tap('start'); await tap('right'); await tap(ok);
    await p.locator('.slot:focus').waitFor();
    await tap(ok); await tap(ok);
    await p.waitForFunction(() => !window.__beforeLoad && window.__game?.g?.books === 11 &&
      document.body.dataset.screen === 'strategy' && document.querySelector('.dock .tabs') &&
      !document.querySelector('#fade.on,.banner,.shade,.vig'));
    await tap('start'); await tap('lb');
    await walkTo(p, 'down', /回到标题/);
    await tap(ok);
    await p.locator('.modal').waitFor();
    await walkTo(p, 'left', /不记录.*返回|不记录.*标题/);
    await tap(ok);
    await p.waitForFunction(() => document.body.dataset.screen === 'title');
    await p.waitForSelector('.tt.done, .tt.instant');
    await tap('start');
    await walkTo(p, 'right', /记录编辑/);
    await tap(ok);
    await p.waitForFunction(() => !!window.__editor);
    await tap(ok);
    await p.locator('.rows .row:focus').waitFor();
    await tap('down'); await tap(ok);
    const range = p.locator('.detail input[type=range]:focus');
    const before = Number(await range.inputValue());
    const delta = before > Number(await range.getAttribute('min')) ? -1 : 1;
    const id = await p.locator('.row.on').getAttribute('data-id');
    await tap(delta < 0 ? 'left' : 'right');
    assert.equal(Number(await range.inputValue()), before + delta);
    await shot(p, 'editor');
    await tap(back);
    assert.equal(await p.locator('.row:focus').getAttribute('data-id'), id);
    await tap(back); // out of the list, onto the selected slot
    await tap(back); // leave with edits still pending
    await p.locator('.modal', { hasText: '未写回' }).waitFor();
    await tap(back);
    assert.equal(await p.evaluate(() => window.__editor.changes().length), 1);
    await tap(ok); // selected slot to roster
    await tap(ok); await tap('start');
    await p.locator('.modal').waitFor(); await tap(ok);
    await p.waitForFunction(() => !window.__editor.changes().length);
    await tap(back);
    await p.waitForFunction(() => !!window.__game && document.body.dataset.screen === 'title');
    await p.waitForSelector('.tt.done, .tt.instant');
    await tap('start'); await tap(ok); await tap(ok);
    await p.waitForFunction(() => !!window.__game?.g);
    assert.equal(await p.evaluate(id => window.__game.g.officers[id].war, id), before + delta);
    assert.deepEqual(p.errors, []);
    await p.close();
  });
}

test('stored pad shortcuts open numbered slots, quick-save and quick-load, and can be cleared', async () => {
  const p = await campaign(NINTENDO), ok = 'b', back = 'a';
  const tap = k => padTap(p, k, { wait: 250 });
  const settings = async () => {
    await tap('start'); await tap('lb'); await tap('lb');
    assert.equal(await p.locator('.pad-page-tabs [aria-selected=true]').textContent(), '手柄');
  };
  const bind = async (action, steps) => {
    await walkTo(p, 'down', new RegExp(action));
    await tap(ok);
    for (let i = 0; i < steps; i++) await tap('down');
    await tap(ok);
    await p.locator('.modal', { hasText: '当前用于' }).waitFor();
    await tap(ok);
  };
  await settings();
  await bind('记录进度', 0); // west
  await bind('读取记录', 1); // View
  await bind('快捷存档', 2); // L3
  await bind('快捷读档', 3); // R3
  assert.equal(await p.locator('.topbar .record-hints kbd').count(), 4);
  await shot(p, 'bindings');
  // Try moving quick-load onto the key already used for quick-save; cancelling keeps both.
  await tap(ok);
  await tap('up'); await tap(ok);
  assert.match(await p.locator('.modal').innerText(), /当前用于「快捷存档」/);
  await tap(back);
  await tap(back);
  await tap('x'); await p.locator('.modal .slot:focus').waitFor();
  await tap('r3'); // a shortcut inside the slot picker must leave the picker in place
  assert.equal(await p.locator('.modal h3').textContent(), '记录');
  await tap(ok);
  await p.waitForFunction(() => window.__game.G.load(1)?.books === 11);
  await p.waitForFunction(() => !document.querySelector('.shade,.vig,.banner'));
  await tap('l3'); await p.locator('.modal', { hasText: '消耗一张命令书' }).waitFor(); await tap(ok);
  await p.waitForFunction(() => window.__game.G.loadQuick()?.books === 10);
  await p.waitForFunction(() => !document.querySelector('.shade,.vig,.banner'));
  await tap('view'); await p.locator('.modal .slot:focus').waitFor(); await tap(ok);
  await tap(back); // cancel load confirmation, stay in this campaign
  assert.equal(await p.evaluate(() => window.__game.g.books), 10);
  await p.evaluate(() => { window.__oldGame = true; window.__game.g.books = 6; });
  await tap('r3'); await p.locator('.modal', { hasText: '快捷存档' }).waitFor(); await tap(ok);
  await p.waitForFunction(() => !window.__oldGame && window.__game?.g?.books === 10 && document.querySelector('.dock .tabs') && !document.querySelector('.shade,#fade.on,.banner'));
  await tap('x'); await p.locator('.modal .slot:focus').waitFor(); await tap(back);
  await settings(); await walkTo(p, 'down', /记录进度/); await tap(ok);
  await walkTo(p, 'down', /清除绑定/); await tap(ok);
  await tap(back); await tap('x'); await p.locator('.wikitable').waitFor(); await tap(back);
  await settings(); await walkTo(p, 'down', /恢复默认/); await tap(ok); await tap(ok);
  assert.equal(await p.locator('.sysmenu-group[data-tab=手柄]').getByText('未绑定', { exact: false }).count(), 4);
  assert.equal(await p.locator('.topbar .record-hints').isVisible(), false);
  assert.deepEqual(p.errors, []);
  await p.close();
});

test('holding confirm while swapping sides keeps the hand settings open', async () => {
  const p = await campaign(XBOX);
  const tap = k => padTap(p, k, { wait: 225 });
  await tap('start'); await tap('lb'); await tap('lb');
  assert.match(await focused(p), /手柄确定键 下/);
  await padHold(p, 'a', 700);
  assert.match(await focused(p), /手柄确定键 右/);
  await tap('a'); // the physical bottom button now backs out
  await tap('start'); await tap('b'); // physical right now opens the slots
  await p.locator('.modal .slot:focus').waitFor();
  assert.deepEqual(p.errors, []);
  await p.close();
});

test('bound keys on the strategy HUD and in the map city picker follow the displayed actions', async () => {
  const p = await campaign(async ctx => {
    await XBOX(ctx);
    await ctx.addInitScript(() => localStorage.setItem('hd2d-pad-record-keys',
      JSON.stringify({ x: 'save', view: 'load', l3: 'quickSave', r3: 'quickLoad' })));
  });
  try {
    await padTap(p, 'home');
    const hints = p.locator('.topbar .record-hints');
    for (const width of [1440, 1024]) {
      await p.setViewportSize({ width, height: width === 1440 ? 900 : 600 });
      assert.ok(await hints.evaluate(el => {
        const r = el.getBoundingClientRect(), bar = el.parentElement.getBoundingClientRect();
        return r.width > 0 && r.top >= el.previousElementSibling.getBoundingClientRect().bottom &&
          r.bottom <= bar.bottom && bar.right <= document.querySelector('.sysmenu-btn').getBoundingClientRect().left;
      }), 'shortcut legend fits below the buttons and clear of System');
      await shot(p, 'map-shortcuts-' + width);
    }
    await cmd(p, '军', '调遣');
    await p.locator('.mappick').waitFor();
    await padTap(p, 'home');
    const roads = await p.locator('.roadsbtn').getAttribute('aria-pressed');
    for (const key of ['x', 'view']) await padTap(p, key);
    assert.equal(await p.locator('.wikitable, .slots').count(), 0);
    assert.equal(await p.locator('.roadsbtn').getAttribute('aria-pressed'), roads);
    assert.ok(await p.locator('.mappick :focus').count());
    assert.ok(await p.getByText('请先完成或取消当前命令').first().isVisible());
    await padTap(p, 'b');
    await p.locator('.mappick').waitFor({ state: 'detached' });
    for (const action of ['诱纳', '离间']) {
      await cmd(p, '谋', action);
      await padTap(p, 'home');
      await padTap(p, 'x'); await padTap(p, 'view');
      assert.ok(await p.locator('.otree :focus').count());
      assert.equal(await p.locator('.wikitable, .slots').count(), 0);
      assert.equal(await p.locator('.roadsbtn').getAttribute('aria-pressed'), roads);
      await padTap(p, 'b');
    }
    assert.equal(await hints.isVisible(), true);
    assert.deepEqual(await hints.locator('kbd').evaluateAll(keys => keys.map(k => k.dataset.glyph)), ['x', 'view', 'l3', 'r3']);
    assert.match(await hints.innerText(), /记录进度.*读取记录.*快捷存档.*快捷读档/s);
    assert.equal(await hints.locator('button, [tabindex]').count(), 0);
    await padTap(p, 'x');
    await p.locator('.slots').waitFor();
    assert.deepEqual(p.errors, []);
  } finally { await p.close(); }
});

test('the open system menu follows a switch from the pad to the mouse and back', async () => {
  const p = await campaign(XBOX);
  try {
    await padTap(p, 'start');
    const menu = p.locator('.sysmenu-list:visible');
    await menu.locator('.pad-page-tabs').waitFor();
    await p.mouse.move(14, 420); await p.mouse.move(28, 420);
    await menu.locator('.sysmenu-col').first().waitFor();
    await padTap(p, 'home');
    await menu.locator('.pad-page-tabs').waitFor();
    assert.equal(await focused(p), '记录进度');
    // A parked pointer can click Load while the pad focus is on Save. A held mouse press must
    // finish on the same DOM node even though pressing it moves focus away from Save.
    await p.evaluate(() => window.__game.G.save(window.__game.g, 1));
    const load = await menu.locator('[data-record=load]').boundingBox();
    await p.mouse.move(load.x + 8, load.y + 8);
    await padTap(p, 'home');
    await p.mouse.down(); await p.waitForTimeout(180); await p.mouse.up();
    await p.locator('.modal[aria-label="读取记录"] .slots').waitFor();
    assert.deepEqual(p.errors, []);
  } finally { await p.close(); }
});
