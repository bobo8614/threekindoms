// Choosing a 计略's target on a phone (player feedback of 2026-11-17, a 0.3.6 phone video: 要击 and 陷阱 on 文丑 "could not be
// used"). Two faults: the map's first tap after the quick second tap that chose the 计略 was taken for a double click
// (src/commitguard.js read the click count of the tap before, the finger's mouse events coming after its pointerup); and the
// panel's hint was hidden on a short screen while the lone target's row, focused, looked picked and 施展 sat greyed, saying nothing.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startGame, newCampaign, closeMessages } from './game.mjs';

let game;
before(async () => { game = await startGame({ width: 854, height: 384 }); });
after(() => game?.close());

// A war on the player's turn on the phone layout, one enemy two cells from our best mind, his 计略 list open.
async function choosing() {
  const page = await game.open('&phone');
  await newCampaign(page);
  await page.evaluate(() => {
    const { g, G, debug } = window.__game, home = g.factions[g.player].city;
    const to = G.roads(home).map((c) => g.cities[c]).filter((c) => c.faction !== g.player && c.faction !== G.NONE && c.officers.length)[0];
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
  assert.equal(await page.evaluate(() => document.body.classList.contains('phone')), true);
  await page.evaluate(() => {
    const w = window.__game.war, f = w.field;
    const me = f.alive.filter((u) => u.side === f.human).sort((a, b) => f.O(b.id).int - f.O(a.id).int)[0];
    const e = f.alive.find((u) => u.side !== f.human);
    for (const [dx, dy] of [[2, 0], [0, 2], [-2, 0], [0, -2], [3, 0], [0, 3]]) { const x = me.x + dx, y = me.y + dy; if (f.inside(x, y) && !f.unitAt(x, y)) { e.x = x; e.y = y; break; } }
    f.pool[f.human] = 30; w.clickCell(me.x, me.y);
  });
  await page.waitForTimeout(800);
  await page.locator('.unitpanel:not(.compare) .acts button', { hasText: '计略' }).first().click();
  await page.waitForTimeout(500);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const tap = async (pt, rest = 400) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt] }); await page.waitForTimeout(60);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(rest);
  };
  const centre = async (loc) => { const b = await loc.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  // A 计略 with a target in reach, chosen as a phone does it: a tap to read it, a quick second tap to take it.
  const sid = await page.evaluate(() => [...document.querySelectorAll('.actpanel [data-sid]')].find((b) => b.getAttribute('aria-disabled') !== 'true' && b.dataset.sid !== '11')?.dataset.sid);
  assert.ok(sid != null, 'a 计略 with a target');
  const strat = await centre(page.locator(`.actpanel [data-sid="${sid}"]`));
  await tap(strat, 150); await tap(strat, 800);
  await page.waitForFunction(() => document.querySelector('.actpanel.targets'), null, { timeout: 5000 });
  return { page, tap, centre };
}
const panel = (page) => page.evaluate(() => {
  const go = document.querySelector('.actpanel .ap-go'), hint = document.querySelector('.actpanel .ap-sum .hint');
  return { confirm: !!window.__game.war.st.confirm, go: go.textContent, off: go.disabled || go.getAttribute('aria-disabled') === 'true', hint: hint && getComputedStyle(hint).display !== 'none' };
});

test('phone: the first tap on a target on the map picks it, right after the quick second tap that chose the 计略', async () => {
  const { page, tap } = await choosing();
  try {
    const pt = await page.evaluate(() => { const w = window.__game.war, f = w.field, st = w.st; const e = f.alive.find((e) => e.side !== f.human && f.legal(st.sel, st.cast, e)); const c = w.screenOf(e.x, e.y); return { x: c.x, y: c.y }; });
    await tap(pt, 700);
    const s = await panel(page);
    assert.equal(s.confirm, true, 'one tap on the purple cell asks to cast');
    assert.equal(s.off, false); assert.match(s.go, /^施展/);
    assert.deepEqual(page.errors, []);
  } finally { await page.context().close(); }
});

test('phone: before a pick the panel says to tap the target, and the greyed 施展 lights the list; the row picks on one tap', async () => {
  const { page, tap, centre } = await choosing();
  try {
    let s = await panel(page);
    assert.equal(s.confirm, false);
    assert.equal(s.hint, true, 'the hint shows on a phone');
    assert.equal(s.off, true); assert.equal(s.go, '先点上面的目标');
    await tap(await centre(page.locator('.actpanel .ap-go')), 100);
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('.actpanel [data-target]')].every((b) => b.classList.contains('nudge'))), true, 'the rows light up');
    assert.equal((await panel(page)).confirm, false, 'the greyed button picks nothing');
    await page.waitForTimeout(600);
    await tap(await centre(page.locator('.actpanel [data-target]').first()), 700);
    s = await panel(page);
    assert.equal(s.confirm, true); assert.equal(s.off, false); assert.match(s.go, /^施展/);
    assert.deepEqual(page.errors, []);
  } finally { await page.context().close(); }
});
