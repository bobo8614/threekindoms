// Battlefield general roster (src/warroster.js, 远逝的夏日@devblog):
// Covers 3D desktop (including integer-row snapping at 1024×600), 2D flat desktop (never shrinks board; shifts right
// when horizontal margin can clear the roster, defaults collapsed when width-limited), and phone pull-down drawer
// (outside-tap swallow, dynamic --roster-w toast clearance, auto-close on pick, Esc closes drawer first).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { startGame, newCampaign, closeMessages, warRest } from './game.mjs';

let game;
after(async () => { await game?.close(); });

async function openBattle({ width, height, query = '', side = 'att', count = 10 }) {
  game = await startGame({ width, height });
  const p = await game.open(query);
  await p.evaluate(async (isFlat) => {
    const { warView } = await import('./src/quality.js');
    if (!isFlat) warView.set('3d');
    (await import('./src/pace.js')).setPace(4);
    (await import('./src/vignette.js')).setVignettes(false);
    try { localStorage.removeItem('hd2d-war-roster'); localStorage.removeItem('hd2d-minimap'); } catch {}
  }, query.includes('flat'));
  await newCampaign(p, '曹操');
  await p.evaluate(({ side, count }) => {
    const { g, G, debug } = window.__game, home = g.factions[g.player].city;
    const to = G.roads(home).map((c) => g.cities[c]).filter((c) => c.faction !== g.player && c.faction !== G.NONE && c.officers.length).sort((a, b) => b.officers.length - a.officers.length)[0];
    // Pack up to `count` generals into the player's city so the 10-general crowded case is exercised.
    const pool = [...g.cities[home].officers];
    for (const c of g.cities) {
      if (pool.length >= count) break;
      if (c.id === home || c.id === to.id || c.faction !== g.player) continue;
      for (const id of c.officers) if (pool.length < count && !pool.includes(id)) pool.push(id);
    }
    const ids = pool.slice(0, count);
    const foePool = [...to.officers];
    for (const c of g.cities) {
      if (foePool.length >= count) break;
      if (c.id === home || c.id === to.id || c.faction === g.player || c.faction === G.NONE) continue;
      for (const id of c.officers) if (foePool.length < count && !foePool.includes(id)) foePool.push(id);
    }
    const foes = foePool.slice(0, count);
    for (const id of [...ids, ...foes]) { g.officers[id].soldiers = Math.max(g.officers[id].soldiers || 0, 700); }
    g.officers[ids[ids.length - 1]].soldiers = 150; // low-troop highlight check
    const w = side === 'att'
      ? { city: to.id, from: home, attacker: g.player, defender: to.faction, day: 1, att: { ids, gold: 100, rice: 800 }, def: { ids: foes.slice(0, 4), gold: 100, rice: 800 } }
      : { city: home, from: to.id, attacker: to.faction, defender: g.player, day: 1, att: { ids: foes, gold: 100, rice: 800 }, def: { ids, gold: 100, rice: 800 } };
    debug.fieldWar(w, side);
  }, { side, count });
  await p.waitForFunction(() => window.__game.war?.finishDeploy && document.body.dataset.screen === 'war', null, { timeout: 30000 });
  return p;
}

const waitMyTurn = async (p) => {
  const stop = closeMessages(p);
  try {
    await p.waitForFunction(() => {
      const w = window.__game.war, f = w?.field;
      return f && f.turn === f.human && !w.st.busy && !w.st.deploying && !document.querySelector('.banner, .panel.msg, .shade, #fade.on');
    }, null, { timeout: 60000 });
  } finally { stop(); }
};

test('3D desktop: deploy selection, battle pick, hover, re-click centre, .actpanel yield, N toggle, whole-row snap, and no HUD overlap', async () => {
  const p = await openBattle({ width: 1440, height: 900, side: 'att', count: 10 });
  try {
    await p.waitForFunction(() => window.__game.war?.st.deploying && !document.querySelector('.banner, #fade.on'), null, { timeout: 30000 });
    await p.waitForTimeout(300);

    const dep = await p.evaluate(() => {
      const r = window.__game.warRoster.probe(), f = window.__game.war.field;
      const mine = f.alive.filter((u) => u.side === f.human);
      const firstRow = document.querySelector('.warroster .wr-row .wr-name')?.textContent;
      return { r, expected: mine.map((u) => u.id), firstRow };
    });
    assert.equal(dep.r.open, true, 'opens expanded on 3D desktop');
    assert.equal(dep.r.visible, true, 'visible during deploy');
    assert.deepEqual(dep.r.ids, dep.expected, 'lists every friendly general');
    assert.ok(dep.firstRow?.startsWith('★'), `commander sits first (${dep.firstRow})`);

    // Click the 4th general during deploy → selected for placement.
    const pickDeployId = dep.expected[3];
    await p.locator(`.warroster .wr-row[data-unit="${pickDeployId}"]`).click();
    await p.waitForTimeout(150);
    assert.equal(await p.evaluate(() => window.__game.war.st.sel?.id), pickDeployId, 'clicking a roster row during deploy selects him');

    // Finish deploy and wait for our turn.
    await p.evaluate(() => window.__game.war.finishDeploy());
    await waitMyTurn(p);
    await p.waitForTimeout(300);

    // Click 2nd general → selected, card shown, row marked .sel.
    const id2 = dep.expected[1], id5 = dep.expected[4];
    await p.locator(`.warroster .wr-row[data-unit="${id2}"]`).click();
    await p.waitForTimeout(250);
    const selState = await p.evaluate(() => ({
      sel: window.__game.war.st.sel?.id,
      card: document.querySelector('.unitpanel:not(.compare)')?.dataset.unit,
      rowSel: document.querySelector('.warroster .wr-row.sel')?.dataset.unit,
    }));
    assert.equal(selState.sel, id2);
    assert.equal(Number(selState.card), id2);
    assert.equal(Number(selState.rowSel), id2);

    // Hovering another row highlights his cell on the map; leaving clears hoverCell.
    const row5 = p.locator(`.warroster .wr-row[data-unit="${id5}"]`);
    await row5.hover();
    await p.waitForTimeout(150);
    const hov = await p.evaluate((id) => {
      const w = window.__game.war, u = w.field.alive.find((x) => x.id === id);
      return { hover: w.st.hoverCell, expected: { x: u.x, y: u.y } };
    }, id5);
    assert.deepEqual(hov.hover, hov.expected, 'hovering a roster row highlights his cell');
    await p.mouse.move(720, 450);
    await p.waitForTimeout(150);

    // Re-clicking the already-selected row centres the 3D camera on him.
    await p.evaluate(() => {
      const w = window.__game.war, u = w.st.sel;
      w.centreOn(u.x > 16 ? u.x - 10 : u.x + 10, u.y);
    });
    await warRest(p);
    const distBefore = await p.evaluate(() => {
      const w = window.__game.war, u = w.st.sel, t = w.probe().view.target;
      return Math.hypot(t[0] - (u.x - 15.5), t[2] - (u.y - 9.5 + 1));
    });
    await p.locator(`.warroster .wr-row[data-unit="${id2}"]`).click();
    await warRest(p);
    const distAfter = await p.evaluate(() => {
      const w = window.__game.war, u = w.st.sel, t = w.probe().view.target;
      return Math.hypot(t[0] - (u.x - 15.5), t[2] - (u.y - 9.5 + 1));
    });
    assert.ok(distBefore > 3 && distAfter < 1.5, `re-clicking selected row centred camera (${distBefore.toFixed(2)} -> ${distAfter.toFixed(2)})`);

    // Opening 计略 (.actpanel) hides the roster; Esc brings it back.
    await p.evaluate(() => { window.__game.war.field.pool[window.__game.war.field.human] = 20; window.__game.war.openStrategies(); });
    await p.waitForSelector('.actpanel');
    await p.waitForTimeout(100);
    assert.equal(await p.evaluate(() => window.__game.warRoster.probe().visible), false, 'hidden while .actpanel is up');
    await p.keyboard.press('Escape');
    await p.waitForFunction(() => !document.querySelector('.actpanel'), null, { timeout: 5000 });
    await p.waitForTimeout(150);
    assert.equal(await p.evaluate(() => window.__game.warRoster.probe().visible), true, 'restored after .actpanel closes');

    // No HUD overlap at 1440×900 and 1024×600; on 1024×600 the scrolling list snaps to whole rows (no half-row clipped).
    for (const [width, height] of [[1440, 900], [1024, 600]]) {
      await p.setViewportSize({ width, height });
      await p.waitForTimeout(300);
      const check = await p.evaluate(() => {
        const rr = document.querySelector('.warroster').getBoundingClientRect();
        const hits = [...document.querySelectorAll('.sysmenu-btn, .warbar, .unitpanel, .wardock, .warmini')]
          .filter((e) => e.offsetParent && e.getBoundingClientRect().width)
          .map((e) => [e.className, e.getBoundingClientRect()])
          .filter(([, b]) => b.left < rr.right - 0.5 && b.right > rr.left + 0.5 && b.top < rr.bottom - 0.5 && b.bottom > rr.top + 0.5)
          .map(([c]) => c);
        const list = document.querySelector('.warroster .wr-list');
        const lr = list.getBoundingClientRect();
        const sliced = [...list.querySelectorAll('.wr-row')].filter((el) => {
          const b = el.getBoundingClientRect();
          return b.top < lr.bottom - 1 && b.bottom > lr.bottom + 1;
        }).map((el) => el.dataset.unit);
        return { hits, sliced, overflow: list.scrollHeight > list.clientHeight + 1, more: list.classList.contains('more') };
      });
      assert.deepEqual(check.hits, [], `3D ${width}×${height}: roster overlaps ${check.hits.join(', ')}`);
      assert.deepEqual(check.sliced, [], `3D ${width}×${height}: no half-clipped row at bottom`);
      if (height === 600 && check.overflow) assert.equal(check.more, true, '3D 1024×600: scrolling list shows bottom fade');
    }

    // N key toggles collapsed / expanded and persists.
    await p.keyboard.press('n');
    await p.waitForTimeout(100);
    assert.deepEqual(await p.evaluate(() => [window.__game.warRoster.open, localStorage.getItem('hd2d-war-roster')]), [false, '0']);
    await p.keyboard.press('n');
    await p.waitForTimeout(100);
    assert.deepEqual(await p.evaluate(() => [window.__game.warRoster.open, localStorage.getItem('hd2d-war-roster')]), [true, '1']);
    assert.deepEqual(p.errors, []);
  } finally { await p.close(); await game.close(); game = null; }
});

test('2D flat desktop: board never shrinks when toggling roster; defaults collapsed when width-limited and shifts right when margin suffices', async () => {
  const p = await openBattle({ width: 1440, height: 900, query: '&flat', side: 'def', count: 8 });
  try {
    await p.waitForFunction(() => !document.querySelector('.banner, #fade.on') && (window.__game.war?.st.deploying || window.__game.war?.field.turn === window.__game.war?.field.human), null, { timeout: 30000 });
    await p.evaluate(() => { const w = window.__game.war; w.field.pool.att = 0; if (w.st.deploying) w.finishDeploy(); });
    await waitMyTurn(p);
    await p.waitForTimeout(300);

    // At 1440×900 (width-limited painted 2.34:1 board): starts collapsed in the top HUD strip, clearing the board and all HUD.
    const init1440 = await p.evaluate(() => ({
      roster: window.__game.warRoster.probe(),
      board: window.__game.war.flatDebug().box,
      inline: document.querySelector('.warroster').classList.contains('inline-top'),
    }));
    assert.equal(init1440.roster.open, false, '1440×900 2D starts collapsed when horizontal margin cannot clear roster');
    assert.equal(init1440.inline, true, '1440×900 collapsed pill sits inline beside ☰ 系统 in the top strip');
    assert.ok(init1440.roster.rect.b <= init1440.board.y + 0.5, `1440×900 collapsed pill (${init1440.roster.rect.b.toFixed(1)}) clears board top (${init1440.board.y.toFixed(1)})`);

    // Across all four standard desktop sizes, expanding vs collapsing the roster MUST keep board width identical (< 0.5 px).
    for (const [width, height] of [[1024, 768], [1280, 800], [1440, 900], [1920, 1080]]) {
      await p.setViewportSize({ width, height });
      await p.waitForTimeout(250);
      if (await p.evaluate(() => window.__game.warRoster.open)) { await p.keyboard.press('n'); await p.waitForTimeout(150); }
      const shut = await p.evaluate(() => ({
        roster: window.__game.warRoster.probe(),
        board: window.__game.war.flatDebug().box,
        hits: [...document.querySelectorAll('.sysmenu-btn, .warbar, .unitpanel, .wardock')]
          .filter((e) => e.offsetParent && e.getBoundingClientRect().width)
          .map((e) => [e.className, e.getBoundingClientRect()])
          .filter(([, b]) => { const rr = document.querySelector('.warroster').getBoundingClientRect(); return b.left < rr.right - 0.5 && b.right > rr.left + 0.5 && b.top < rr.bottom - 0.5 && b.bottom > rr.top + 0.5; })
          .map(([c]) => c),
      }));
      assert.deepEqual(shut.hits, [], `2D ${width}×${height} shut: overlaps HUD ${shut.hits.join(', ')}`);

      await p.keyboard.press('n');
      await p.waitForTimeout(200);
      const open = await p.evaluate(() => ({
        roster: window.__game.warRoster.probe(),
        board: window.__game.war.flatDebug().box,
        hits: [...document.querySelectorAll('.sysmenu-btn, .warbar, .unitpanel, .wardock')]
          .filter((e) => e.offsetParent && e.getBoundingClientRect().width)
          .map((e) => [e.className, e.getBoundingClientRect()])
          .filter(([, b]) => { const rr = document.querySelector('.warroster').getBoundingClientRect(); return b.left < rr.right - 0.5 && b.right > rr.left + 0.5 && b.top < rr.bottom - 0.5 && b.bottom > rr.top + 0.5; })
          .map(([c]) => c),
      }));
      assert.equal(open.roster.open, true);
      assert.deepEqual(open.hits, [], `2D ${width}×${height} open: overlaps HUD ${open.hits.join(', ')}`);
      assert.ok(Math.abs(open.board.w - shut.board.w) < 0.5, `2D ${width}×${height}: board width unchanged (${shut.board.w.toFixed(1)} vs ${open.board.w.toFixed(1)})`);
      await p.keyboard.press('n');
      await p.waitForTimeout(150);
    }

    // Select a defender general via expanded roster and verify .actpanel hides roster cleanly.
    await p.setViewportSize({ width: 1440, height: 900 });
    await p.waitForTimeout(200);
    await p.keyboard.press('n');
    await p.waitForTimeout(150);
    const pickId = await p.evaluate(() => window.__game.warRoster.probe().ids[2]);
    await p.locator(`.warroster .wr-row[data-unit="${pickId}"]`).click();
    await p.waitForTimeout(200);
    assert.equal(await p.evaluate(() => window.__game.war.st.sel?.id), pickId, 'defender general selected via roster');
    await p.evaluate(() => { window.__game.war.field.pool[window.__game.war.field.human] = 20; window.__game.war.openStrategies(); });
    await p.waitForSelector('.actpanel');
    await p.waitForTimeout(150);
    assert.equal(await p.evaluate(() => window.__game.warRoster.probe().visible), false, '2D: roster hides under .actpanel');
    await p.keyboard.press('Escape');
    await p.waitForFunction(() => !document.querySelector('.actpanel'), null, { timeout: 5000 });
    await p.waitForTimeout(150);

    // Wide viewport with enough horizontal margin (2360×1080): board shifts right without shrinking so roster clears board.
    await p.setViewportSize({ width: 2360, height: 1080 });
    await p.waitForTimeout(250);
    if (!(await p.evaluate(() => window.__game.warRoster.open))) { await p.keyboard.press('n'); await p.waitForTimeout(150); }
    const wideOpen = await p.evaluate(() => ({ roster: window.__game.warRoster.probe(), board: window.__game.war.flatDebug().box }));
    assert.ok(wideOpen.roster.rect.r <= wideOpen.board.x + 0.5, `2360×1080: roster right (${wideOpen.roster.rect.r.toFixed(1)}) clears shifted board (${wideOpen.board.x.toFixed(1)})`);
    assert.ok(wideOpen.board.x + wideOpen.board.w <= 2360 - 11.5, `2360×1080: shifted board stays inside viewport`);
    await p.keyboard.press('n');
    await p.waitForTimeout(150);
    const wideShut = await p.evaluate(() => ({ roster: window.__game.warRoster.probe(), board: window.__game.war.flatDebug().box }));
    assert.ok(wideShut.board.x < wideOpen.board.x - 40, `2360×1080: collapsing recentres board (${wideOpen.board.x.toFixed(1)} -> ${wideShut.board.x.toFixed(1)})`);
    assert.ok(Math.abs(wideOpen.board.w - wideShut.board.w) < 0.5, `2360×1080: board width identical (${wideOpen.board.w.toFixed(1)} vs ${wideShut.board.w.toFixed(1)})`);

    assert.deepEqual(p.errors, []);
  } finally { await p.close(); await game.close(); game = null; }
});

test('phone: starts collapsed, dynamic --roster-w toast clearance, outside tap swallowed, picking closes drawer, Esc closes drawer first', async () => {
  const p = await openBattle({ width: 667, height: 360, query: '&phone', side: 'att', count: 8 });
  try {
    await p.waitForFunction(() => window.__game.war?.st.deploying && !document.querySelector('.banner, #fade.on'), null, { timeout: 30000 });
    await p.evaluate(() => window.__game.war.finishDeploy());
    await waitMyTurn(p);
    await p.waitForTimeout(300);

    const init = await p.evaluate(() => {
      const r = window.__game.warRoster.probe();
      const bar = document.querySelector('.warbar').getBoundingClientRect();
      const listVis = document.querySelector('.warroster .wr-list').getBoundingClientRect().height > 0;
      const cssW = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--roster-w'));
      return { r, barBottom: bar.bottom, listVis, cssW };
    });
    assert.equal(init.r.open, false, 'phone starts collapsed');
    assert.equal(init.listVis, false, 'collapsed phone roster hides its list completely');
    assert.ok(init.r.rect.h <= 42, `collapsed phone pill stays compact (${init.r.rect.h.toFixed(1)}px)`);
    assert.ok(init.r.rect.t >= init.barBottom - 2, `pill sits below warbar (${init.r.rect.t.toFixed(1)} vs ${init.barBottom.toFixed(1)})`);
    assert.ok(Math.abs(init.cssW - Math.ceil(init.r.rect.w)) <= 1, `collapsed --roster-w (${init.cssW}) tracks actual width (${init.r.rect.w.toFixed(1)})`);

    // Open drawer, verify 2-column layout and --roster-w updates, pick a general → selects him and auto-closes.
    await p.locator('.warroster .wr-head').click();
    await p.waitForTimeout(150);
    const opened = await p.evaluate(() => {
      const r = window.__game.warRoster.probe();
      const rows = [...document.querySelectorAll('.warroster .wr-row')].map((el) => el.getBoundingClientRect());
      const cssW = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--roster-w'));
      return { r, cssW, twoCol: rows.length >= 2 && Math.abs(rows[0].top - rows[1].top) < 2 && rows[1].left > rows[0].right - 2 };
    });
    assert.equal(opened.r.open, true);
    assert.equal(opened.twoCol, true, 'phone drawer uses 2-column grid');
    assert.ok(Math.abs(opened.cssW - Math.ceil(opened.r.rect.w)) <= 1, `open --roster-w (${opened.cssW}) tracks actual width (${opened.r.rect.w.toFixed(1)})`);

    const pickId = opened.r.ids[3];
    await p.locator(`.warroster .wr-row[data-unit="${pickId}"]`).click();
    await p.waitForTimeout(200);
    const afterPick = await p.evaluate(() => ({ open: window.__game.warRoster.open, sel: window.__game.war.st.sel?.id }));
    assert.equal(afterPick.sel, pickId);
    assert.equal(afterPick.open, false, 'phone drawer closes automatically after picking');

    // Open drawer again and tap directly on another general on the map outside the drawer → closes drawer WITHOUT selecting him!
    await p.locator('.warroster .wr-head').click();
    await p.waitForTimeout(150);
    const outsideTarget = await p.evaluate(() => {
      const w = window.__game.war, f = w.field, rr = document.querySelector('.warroster').getBoundingClientRect();
      for (const u of f.alive) {
        if (u === w.st.sel) continue;
        const s = w.screenOf(u.x, u.y);
        if (s.x > rr.right + 16 && s.x < innerWidth - 20 && s.y > 46 && s.y < innerHeight - 80) return { x: s.x, y: s.y, id: u.id };
      }
      // Fallback: an empty reachable cell outside the drawer.
      for (const k of w.st.reach?.dist.keys() ?? []) {
        const [gx, gy] = k.split(',').map(Number), s = w.screenOf(gx, gy);
        if (s.x > rr.right + 16 && s.x < innerWidth - 20 && s.y > 46 && s.y < innerHeight - 80) return { x: s.x, y: s.y, id: null };
      }
      return { x: rr.right + 40, y: 140, id: null };
    });
    await p.mouse.click(outsideTarget.x, outsideTarget.y);
    await p.waitForTimeout(200);
    const afterOutside = await p.evaluate(() => ({
      open: window.__game.warRoster.open,
      sel: window.__game.war.st.sel?.id,
      moveAsk: window.__game.war.st.moveAsk,
    }));
    assert.equal(afterOutside.open, false, 'tapping outside closes phone drawer');
    assert.equal(afterOutside.sel, pickId, 'outside tap that closed drawer did NOT change selected general on map');
    assert.equal(afterOutside.moveAsk, null, 'outside tap that closed drawer did NOT trigger a move preview on map');

    // Open again and press Esc → closes drawer while keeping selection.
    await p.locator('.warroster .wr-head').click();
    await p.waitForTimeout(100);
    assert.equal(await p.evaluate(() => window.__game.warRoster.open), true);
    await p.keyboard.press('Escape');
    await p.waitForTimeout(150);
    const afterEsc = await p.evaluate(() => ({ open: window.__game.warRoster.open, sel: window.__game.war.st.sel?.id }));
    assert.equal(afterEsc.open, false, 'Esc closes phone drawer');
    assert.equal(afterEsc.sel, pickId, 'Esc closing drawer keeps selected general');
    assert.deepEqual(p.errors, []);
  } finally { await p.close(); await game.close(); game = null; }
});
