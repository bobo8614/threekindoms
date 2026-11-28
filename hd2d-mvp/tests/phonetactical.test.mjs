// 白兵 on a phone (o0無名0o@bilibili, 2026-11-17: 兵弓骑的待机、前进选择霸屏遮挡，根本看不见). The orders stood open in a panel
// 200 px square in the bottom left corner, right over the attacker's lines (drawn up by the left edge), and the tactics in
// one 120 px wide in the bottom right. Now each stands folded in a strip about 50 px wide by its edge (src/tacticalhud.js
// unfold, src/phone.css "third pass"), and the camera frames the field between the strips (tacticalview.js setInsets).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startGame, skipIntro } from './game.mjs';

let game;
before(async () => { game = await startGame({ width: 667, height: 360 }); }); // the shortest phone the HUD tests use
after(() => game?.close());

// a / d: the generals (颜良 51 leads 1000 men: ten squads, every troop type); human: the player's side; query: extra page flags.
async function open({ a = 51, d = 38, t = 5, human = 'a', query = '' } = {}) {
  const page = await game.open(`&phone${query}`);
  await skipIntro(page);
  await page.evaluate(([a, d, t, human]) => { window.__game.debug.quickTactical(a, d, t, { human }); }, [a, d, t, human]);
  await page.waitForSelector('.tq-formation, .tq-start', { timeout: 60000 });
  if (await page.locator('.tq-formation').count()) { await page.locator('.tq-form').first().click(); await page.locator('.tq-deploy:not(.arming)').click(); }
  await page.waitForSelector('.tq-start button', { timeout: 30000 });
  await page.locator('.tq-start button').first().click();
  return page;
}
const box = (page, sel) => page.locator(sel).evaluateAll((l) => l.map((e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height, text: e.textContent }; }).filter((b) => b.w > 0));
const on = (page, k) => page.locator(`.tq-row:not(.tq-all) .tq-cmd.on[data-k="${k}"]`);

// devblog #786 (黑色风车): before the fight the 开始交战 prompt stood over the orders unfolded beside it and took the taps on 围;
// 全军's 待 and 围 lay under the controls. Every option of every unfolded row, and every tactic, takes its own tap.
for (const [w, h, safe] of [[667, 360, ''], [568, 320, '&safe=44,0,34,0']]) test(`phone 白兵 ${w}×${h}${safe ? ' with a notch' : ''}: the 开始交战 prompt is small and never covers an unfolded order or tactic`, async () => {
  const page = await game.open(`&phone${safe}`);
  if (w !== 667) { await page.setViewportSize({ width: w, height: h }); await page.reload(); await page.waitForFunction(() => window.__game?.debug, null, { timeout: 60000 }); }
  await skipIntro(page);
  await page.evaluate(() => { window.__game.debug.quickTactical(51, 38, 5, { human: 'a' }); });
  await page.waitForSelector('.tq-formation, .tq-start', { timeout: 60000 });
  if (await page.locator('.tq-formation').count()) { await page.locator('.tq-form').first().click(); await page.locator('.tq-deploy:not(.arming)').click(); }
  await page.waitForSelector('.tq-start button:not(.arming)', { timeout: 30000 });
  const [ask] = await box(page, '.tq-start'), [btn] = await box(page, '.tq-start .tq-btn');
  assert.ok(ask.w <= 210, `the prompt is ${ask.w} px wide`);
  assert.ok(btn.h >= 40, `its button is a thumb's size (${btn.h} px)`);
  const covered = () => page.evaluate(() => [...document.querySelectorAll('.tq-row.open .tq-cmd, .tq-tactics.open .tq-tac')].filter((e) => {
    const b = e.getBoundingClientRect(), t = document.elementFromPoint((b.left + b.right) / 2, (b.top + b.bottom) / 2); return !(e === t || e.contains(t));
  }).map((e) => e.textContent));
  const n = await page.locator('.tq-orders .tq-row:not(.none)').count();
  for (let i = 0; i <= n; i++) {
    if (i < n) await page.locator('.tq-orders .tq-row:not(.none)').nth(i).locator('.tq-cmd.on, .tq-fold').first().click();
    else await page.locator('.tq-tacfold').click();
    await page.waitForTimeout(250);
    assert.ok(await page.locator('.tq-row.open, .tq-tactics.open').count(), `${i}: unfolded`);
    assert.deepEqual(await covered(), [], `${i}: every option takes its tap`);
    if (i < n) await page.locator('.tq-orders .tq-row.open .tq-kind, .tq-orders .tq-row.open .tq-fold').first().click(); else await page.locator('.tq-tacfold').click();
    await page.waitForTimeout(200);
  }
  // a choice of order: given, folded, and the prompt is back to start the fight
  await on(page, '弓').click(); await page.locator('.tq-row.open .tq-cmd[aria-label="待机"]').click();
  assert.equal(await on(page, '弓').textContent(), '■待');
  await page.locator('.tq-start button').click();
  await page.waitForFunction(() => !document.querySelector('.tq-start'), null, { timeout: 5000 });
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('phone 白兵: five folded order cells stand in a narrow strip under the cards; the camera frames the field beside it', async () => {
  const page = await open({ query: '&safe=59,0,0,0' }); // a notch on the left only: the strips are not alike
  assert.equal(await page.evaluate(() => document.body.classList.contains('phone')), true);
  const rows = await box(page, '.tq-orders .tq-row');
  assert.deepEqual(rows.map((r) => r.text.slice(0, 1)), ['将', '骑', '弓', '步', '全'], 'every troop type of ours, then 全军');
  for (const r of rows) assert.ok(r.w <= 60, `folded row ${r.text} is ${r.w} px wide`);
  assert.equal((await box(page, '.tq-orders .tq-row:not(.tq-all) .tq-cmd')).length, 4, 'only the standing orders show');
  const cards = await box(page, '.tq-card');
  assert.ok(rows[0].t >= Math.max(...cards.map((c) => c.b)), `the strip (from y=${rows[0].t}) keeps under the cards (to y=${Math.max(...cards.map((c) => c.b))})`);
  // the camera centres the lines between the strips (left one 59 px further in), and none of ours stands under the strip
  const strip = Math.max(...rows.map((r) => r.r)), [fold] = await box(page, '.tq-tacfold');
  await page.waitForFunction(([l, r]) => {
    const v = window.__game.tview.camera.view, want = innerWidth / 2 - (l + r) / 2;
    return v?.enabled && Math.abs(v.offsetX - want) < 6;
  }, [strip + 4, fold.l - 4], { timeout: 15000 });
  await page.waitForFunction((strip) => { const t = [...document.querySelectorAll('.tk.attacker')].map((e) => e.getBoundingClientRect()).filter((b) => b.width); return t.length > 3 && t.every((b) => b.left >= strip - 2); }, strip, { timeout: 15000 });
  await page.close();
});

test('phone 白兵: a tap unfolds a troop type\'s orders beside its cell, a choice folds them; a quick second tap never lands on an order', async () => {
  const page = await open();
  // a quick double tap on the folded cell's right half: the first unfolds, the second lands on the name (kept in the cell's
  // place) and folds it again; the order stays
  const [cell] = await box(page, '.tq-row:not(.tq-all):has(.tq-cmd.on[data-k="弓"])');
  await page.mouse.click(cell.r - 6, cell.t + cell.h / 2); await page.waitForTimeout(150); await page.mouse.click(cell.r - 6, cell.t + cell.h / 2);
  await page.waitForTimeout(200);
  assert.equal(await on(page, '弓').textContent(), '▶进');
  assert.equal(await page.locator('.tq-row.open').count(), 0);
  // a tap unfolds its four orders, beside the cell; a choice gives the order and folds it
  await on(page, '弓').click();
  const cmds = await box(page, '.tq-row.open .tq-cmd');
  assert.equal(cmds.length, 4);
  assert.ok(cmds[0].l >= cell.r - 2, `the orders start right of the cell (${cmds[0].l} < ${cell.r})`);
  await page.locator('.tq-row.open .tq-cmd[aria-label="待机"]').click();
  assert.equal(await page.locator('.tq-row.open').count(), 0);
  assert.equal(await on(page, '弓').textContent(), '■待');
  assert.equal(await page.evaluate(() => window.__tq.side.a.cmd.arc), 'wait');
  // 全军 unfolds 待 / 围 the same way
  await page.locator('.tq-fold').click();
  assert.deepEqual((await box(page, '.tq-all.open .tq-allcmd')).map((b) => b.text), ['■待', '◎围']);
  await page.locator('.tq-allcmd[data-all="wait"]').click();
  assert.equal(await page.locator('.tq-all.open').count(), 0);
  assert.equal(await page.locator('.tq-row:not(.tq-all) .tq-cmd.on').evaluateAll((l) => l.every((b) => b.textContent === '■待')), true);
  await page.close();
});

test('phone 白兵: tactics fold behind 战术; it unfolds them, the first tap on one tells, the second casts and folds them', async () => {
  const page = await open({ a: 38, d: 51, human: 'd' }); // the defender's side too: its HUD once went untested
  const [fold] = await box(page, '.tq-tacfold');
  assert.ok(fold && fold.w <= 66, `战术 is ${fold?.w} px wide`);
  assert.equal((await box(page, '.tq-tactics .tq-tac:not(.tq-tacfold)')).length, 0);
  await page.locator('.tq-tacfold').click();
  assert.equal((await box(page, '.tq-tactics.open .tq-tac:not(.tq-tacfold)')).length, 6);
  const tp = await page.evaluate(() => window.__tq.side.d.tp);
  const t = page.locator('.tq-tactics.open .tq-tac:not(.tq-tacfold):not([disabled])').first();
  await t.click();
  assert.equal(await page.locator('.tq-told').count(), 1);
  assert.equal(await page.locator('.tq-tactics.open').count(), 1);
  await t.click();
  await page.waitForFunction((tp) => window.__tq.side.d.tp < tp, tp, { timeout: 15000 });
  assert.equal(await page.locator('.tq-tactics.open').count(), 0);
  // our lines (the defender's, by the right edge) stay clear of the folded 战术
  await page.waitForFunction((f) => [...document.querySelectorAll('.tk.attacker')].map((e) => e.getBoundingClientRect()).filter((b) => b.width)
    .every((b) => b.right <= f.l + 2 || b.top >= f.b || b.bottom <= f.t), fold, { timeout: 15000 });
  await page.close();
});
