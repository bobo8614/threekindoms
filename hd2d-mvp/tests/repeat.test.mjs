// Doing the same thing again (devblog #70 希洛-唯, #175): the lists start on what was chosen last time, a general's commands
// offer 再施 as soon as he has cast (he stays selected), and 开发 / 防灾 can be carried out several times in a row from one confirmation.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startGame, newCampaign, closeMessages, castGo, openCmds, cmdRow, cmd } from './game.mjs';

let game;
before(async () => { game = await startGame(); });
after(() => game?.close());

const quick = (page) => page.evaluate(async () => { (await import('./src/pace.js')).setPace(4); (await import('./src/vignette.js')).setVignettes(false); });
const focused = (page) => page.evaluate(() => { const a = document.activeElement; return { text: a?.textContent ?? '', k: a?.dataset?.k ?? null, id: a?.dataset?.id ?? null, cls: a?.className ?? '', target: a?.dataset?.target ?? null, last: a?.hasAttribute?.('data-last') ?? false, sid: a?.dataset?.sid ?? null, tag: !!a?.querySelector?.('.lasttag') }; });
const city = (page) => page.evaluate(() => { const { g } = window.__game, c = g.cities[g.factions[g.player].city]; return { books: g.books, gold: c.gold, industry: c.industry, disaster: c.disaster }; });
const idle = (page) => page.waitForFunction(() => !document.querySelector('.shade, .vig, .banner'), null, { timeout: 15000 });

test('开发 again starts on the field and the officer of last time, and a run of three is three commands told once', async () => {
  const page = await game.open();
  await quick(page);
  await newCampaign(page);
  await page.evaluate(() => { const { g } = window.__game, c = g.cities[g.factions[g.player].city]; c.gold = 600; c.industry = 100; g.books = 5; });
  const dev = cmdRow(page, '开发'); await openCmds(page, '城'); // the list stays open through the run of commands

  // The first time, by the mouse: 产业, the second officer of the list, once.
  await dev.click();
  assert.equal(await page.locator('.modal .lasttag').count(), 0, 'nothing is marked 上次 before anything was developed');
  await page.locator('.modal [data-k="industry"]').click();
  const who = await page.locator('.modal tr[data-id]').nth(1).getAttribute('data-id');
  await page.locator('.modal tr[data-id]').nth(1).click();
  assert.match(await page.locator('.modal p').first().textContent(), /开发产业，需要金 \d+。/);
  assert.equal(await page.locator('.modal .runtimes b').textContent(), '1', 'the count starts at one');
  await page.locator('.modal .runok').click();
  await page.waitForFunction(() => window.__game.g.books === 4);
  await idle(page);
  const one = await city(page);
  assert.ok(one.industry > 100 && one.gold < 600, `one 开发 was carried out: ${JSON.stringify(one)}`);

  // Again, by the keys alone: Enter on 开发, on 产业 (上次), on the same officer (上次), then three times.
  await dev.focus();
  await page.keyboard.press('Enter');
  let f = await focused(page);
  assert.equal(f.k, 'industry', `the keys start on the field of last time: ${JSON.stringify(f)}`);
  assert.ok(f.tag, 'marked 上次');
  await page.keyboard.press('Enter');
  f = await focused(page);
  assert.equal(f.id, who, `and on the officer of last time: ${JSON.stringify(f)}`);
  assert.match(f.text, /上次/);
  await page.keyboard.press('Enter');
  f = await focused(page);
  assert.match(f.cls, /runok/, 'the confirmation starts on 确定');
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('.modal .runtimes b').textContent(), '3');
  assert.match(await page.locator('.modal p').first().textContent(), /连续 3 次：第一次需要金 \d+，之后每次 \d+–\d+，共用 3 张命令书。/);
  assert.equal(await page.locator('.modal .runout').count(), 0, 'four books are left: three do not end the month');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__game.g.books === 1);
  await idle(page);
  const three = await city(page);
  assert.ok(three.industry - one.industry >= 3, `three more 开发: ${one.industry} → ${three.industry}`);
  const [lo, hi] = await page.evaluate((id) => window.__game.G.devCostRange(window.__game.g, Number(id)), who);
  assert.ok(one.gold - three.gold >= lo * 3 && one.gold - three.gold <= hi * 3, `their three costs: ${one.gold - three.gold} within ${lo * 3}–${hi * 3}`);
  assert.match(await page.evaluate(() => document.querySelector('body > .toast')?.textContent ?? ''), new RegExp(`产业 \\+${three.industry - one.industry}（3 次）`));

  // The last book: no count to choose, and the confirmation says the month ends with it.
  await dev.click(); await page.locator('.modal [data-k="industry"]').click(); await page.locator(`.modal tr[data-id="${who}"]`).click();
  assert.equal(await page.locator('.modal .runtimes').count(), 0, 'one book left: nothing to count');
  assert.equal(await page.locator('.modal .runout').count(), 1, 'the last book is named');
  await page.keyboard.press('Escape');
  assert.equal((await city(page)).books, 1, '取消 spends nothing');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('a key held down does not run through the dialogs of a command', async () => {
  const page = await game.open();
  await quick(page);
  await newCampaign(page);
  await page.evaluate(() => { const { g } = window.__game, c = g.cities[g.factions[g.player].city]; c.gold = 600; g.books = 5; });
  const dev = cmdRow(page, '开发'); await openCmds(page, '城'); // the list stays open through the run of commands
  await dev.click(); await page.locator('.modal [data-k="land"]').click(); await page.locator('.modal tr[data-id]').first().click(); await page.locator('.modal .runok').click();
  await page.waitForFunction(() => window.__game.g.books === 4);
  await idle(page);
  await dev.focus();
  await page.keyboard.press('Enter'); // the field picker, on 土地
  for (let i = 0; i < 6; i++) await page.keyboard.down('Enter'); // one press, then its repeats
  await page.keyboard.up('Enter');
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.modal table.otable').count(), 1, 'the held key chose the field and stopped at the officers');
  assert.equal((await city(page)).books, 4, 'nothing was spent');
  await page.keyboard.press('Escape');
  await page.context().close();
});

test('防灾 can be run several times too, and stops at what the gold surely covers', async () => {
  const page = await game.open();
  await quick(page);
  await newCampaign(page);
  await page.evaluate(() => { const { g } = window.__game, c = g.cities[g.factions[g.player].city]; c.gold = 40; c.disaster = 10; g.books = 5; });
  await cmd(page, '城', '防灾');
  await page.locator('.modal tr[data-id]').first().click();
  const max = await page.evaluate(() => Number(document.querySelector('.modal .runtimes')?.textContent.match(/最多 (\d+)/)?.[1] ?? 1));
  assert.ok(max >= 2 && max <= 3, `40 金 covers two or three at 10–19 each, never five: ${max}`);
  await page.locator('.modal .runtimes .btn.ghost').click();
  assert.equal(await page.locator('.modal .runtimes b').textContent(), String(max));
  await page.locator('.modal .runok').click();
  await page.waitForFunction((n) => window.__game.g.books === 5 - n, max);
  await idle(page);
  const c = await city(page);
  assert.ok(c.disaster >= 10 + max && c.gold >= 0, `防灾 rose ${max} times within the gold: ${JSON.stringify(c)}`);
  await page.context().close();
});

// A war on the player's turn, the enemy in a knot the player's best mind can 火计 (as tests/casttarget.test.mjs).
async function knot(query = '') {
  const page = await game.open(query);
  await quick(page);
  await newCampaign(page);
  await page.evaluate(() => {
    const { g, G, debug } = window.__game, home = g.factions[g.player].city;
    const to = G.roads(home).map((c) => g.cities[c]).filter((c) => c.faction !== g.player && c.faction !== G.NONE && c.officers.length).sort((a, b) => b.officers.length - a.officers.length)[0];
    for (const id of [...g.cities[home].officers, ...to.officers]) g.officers[id].soldiers = 900;
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
  const ok = await page.evaluate(async () => {
    const F = await import('./src/core/field.js'), w = window.__game.war, f = w.field;
    const me = f.alive.filter((u) => u.side === f.human).sort((a, b) => f.O(b.id).int - f.O(a.id).int)[0], foes = f.alive.filter((u) => u.side !== f.human);
    const free = (x, y) => { if (!f.inside(x, y) || f.unitAt(x, y) || Math.max(Math.abs(x - me.x), Math.abs(y - me.y)) < 2) return false; const e = foes[0], [hx, hy] = [e.x, e.y]; e.x = x; e.y = y; const r = f.legal(me, 0, e); e.x = hx; e.y = hy; return r; };
    let cells = null;
    for (let y = 0; y < F.H && !cells; y++) for (let x = 0; x < F.W && !cells; x++) {
      const c = [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1], [x + 2, y], [x + 2, y + 1]].slice(0, foes.length);
      if (c.every(([cx, cy]) => free(cx, cy))) cells = c;
    }
    if (!cells) return false;
    foes.slice(0, cells.length).forEach((e, i) => { [e.x, e.y] = cells[i]; });
    if (!w.flat) {
      const top = w.probe().top;
      for (const u of f.alive) w.spriteOf(u)?.position.set(u.x - F.W / 2 + 0.5, top(u.x, u.y), u.y - F.H / 2 + 0.5);
    }
    f.pool[f.human] = 30; w.clickCell(me.x, me.y);
    window.__k = { me };
    return true;
  });
  assert.ok(ok, 'a knot of 火计 targets near the player\'s general');
  await page.waitForTimeout(600);
  return page;
}
const acts = (page) => page.evaluate(() => [...document.querySelectorAll('.unitpanel:not(.compare) .acts button')].map((b) => ({ text: b.textContent, key: b.dataset.key ?? null, off: b.disabled, title: b.title })));
// The cast has played out (after it he is back in the target choice while he can cast it again, or on his commands).
const castDone = (page) => page.waitForFunction(() => { const w = window.__game.war; return !w.st.busy && !w.st.confirm && !document.querySelector('.shade, .vig, .panel.msg'); }, null, { timeout: 40000 });

test('再施: after a cast he is back on the targets of the same 计略, the one cast on under the keys; Esc to his commands, 再施 brings it back; F and X press the commands', async () => {
  const page = await knot();
  assert.ok(!(await acts(page)).some((b) => b.key === 'x'), 'no 再施 before he has cast anything');

  // F opens his 计略; 火计 on the second target of the list.
  await page.keyboard.press('f');
  await page.waitForSelector('.actpanel.strats');
  assert.equal(await page.locator('.actpanel.strats .lasttag').count(), 0);
  await page.locator('.actpanel.strats [data-sid="0"]').click();
  await page.waitForSelector('.actpanel [data-target]');
  const second = await page.locator('.actpanel [data-target]').nth(1).getAttribute('data-target');
  await page.locator('.actpanel [data-target]').nth(1).click();
  await page.waitForSelector('.actpanel.confirm');
  const stop = closeMessages(page);
  try {
    await castGo(page);
    await castDone(page);
    // With the mobility for another, he is back in 火计's target choice (羽之@devblog, 2026-11-18), the keys on the one cast on.
    assert.deepEqual(await page.evaluate(() => { const w = window.__game.war; return [w.st.sel === window.__k.me, w.st.stage, w.st.cast]; }), [true, 'targets', 0], 'still selected, on the targets of 火计');
    await page.waitForFunction(() => document.activeElement?.dataset?.target != null);
    let f = await focused(page);
    assert.equal(f.target, second, `the target of last time has the keys: ${JSON.stringify(f)}`);
    assert.ok(f.last && f.tag, 'marked 上次');
    // Esc: back to the list, then to his commands, where 再施 names the 计略 without picking him again.
    await page.keyboard.press('Escape'); await page.waitForSelector('.actpanel.strats');
    await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('.actpanel'));
    assert.equal(await page.evaluate(() => window.__game.war.st.stage), 'cmds');
    const again = (await acts(page)).find((b) => b.key === 'x');
    assert.ok(again && !again.off, `再施 is offered: ${JSON.stringify(await acts(page))}`);
    assert.equal(again.text, '再施火计');
    assert.ok((await acts(page)).some((b) => b.text === '计略'), 'beside 计略, whose text is unchanged');
    await page.keyboard.press('f');
    await page.waitForSelector('.actpanel.strats');
    f = await focused(page);
    assert.equal(f.sid, '0', `the 计略 list starts on the one cast last: ${JSON.stringify(f)}`);
    assert.ok(f.tag, 'marked 上次');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.actpanel.strats'));

    // X: the same 计略, its targets up with the keys on the one it was cast on; Enter asks, Enter casts.
    await page.keyboard.press('x');
    await page.waitForSelector('.actpanel [data-target]');
    assert.equal(await page.evaluate(() => window.__game.war.st.cast), 0);
    await page.waitForFunction(() => document.activeElement?.dataset?.target != null);
    f = await focused(page);
    assert.equal(f.target, second, `the target of last time has the keys: ${JSON.stringify(f)}`);
    assert.ok(f.last && f.tag, 'marked 上次');
    const pool = await page.evaluate(() => { const w = window.__game.war; return w.field.pool[w.field.human]; });
    await page.keyboard.press('Enter');
    await page.waitForSelector('.actpanel.confirm');
    assert.equal(await page.evaluate(() => window.__game.war.field.pool[window.__game.war.field.human]), pool, 'nothing is cast until it is confirmed');
    assert.equal((await focused(page)).target, second, 'the confirmation keeps the keys on the target, not on 施展 (D32 §9.2)');
    await page.waitForTimeout(400); // past the guard (src/commitguard.js)
    await page.keyboard.press('Enter');
    await castDone(page);
    assert.ok(await page.evaluate((p) => window.__game.war.field.pool[window.__game.war.field.human] < p, pool), 'the second 火计 was cast');

    // Back on the targets straight after that cast; Esc out of them: nothing was spent, he is still the one selected.
    await page.waitForSelector('.actpanel.targets [data-target]');
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.actpanel'));
    assert.ok(await page.evaluate(() => window.__game.war.st.sel === window.__k.me));

    // Without the mobility for it, 再施 is greyed and says why; he stays selected all the same.
    await page.evaluate(() => { const w = window.__game.war; w.field.pool[w.field.human] = 1; w.clickCell(window.__k.me.x, window.__k.me.y); });
    await page.waitForTimeout(300);
    const poor = (await acts(page)).find((b) => b.key === 'x');
    assert.ok(poor?.off && /现在不能再施火计/.test(poor.title), `greyed with its reason: ${JSON.stringify(poor)}`);
  } finally { stop(); }
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

// 连续 N 次 (羽之@devblog, 2026-11-18; docs/战场计略连续施放方案_2026-11-18.md): the confirmation counts how many times in a row,
// from 1 every time it comes up, at most the pool ÷ the cost; a run is one show and one window; between casts the camera holds
// the framing of the choice, and Esc out of the choice gives the view back as it was before it.
const view = (page) => page.evaluate(() => { const v = window.__game.war.viewState(); return { yaw: v.yaw, dist: v.dist, zoom: v.zoom }; });
const run = (page) => page.evaluate(() => { const r = document.querySelector('.actpanel .ap-run'); return r ? { label: r.querySelector('.ap-runlabel').textContent, n: Number(r.querySelector('.ap-runn').textContent), sum: document.querySelector('.actpanel .ap-foot').textContent } : null; });
const still = (page) => page.waitForFunction(() => window.__game.war.viewState().still, null, { timeout: 20000 });

for (const query of ['', '&flat']) test(`Enter casts the count just set with the mouse (#527, ${query ? 'flat' : '3D'})`, async () => {
  const page = await knot(query);
  const stop = closeMessages(page);
  try {
    const read = () => page.evaluate(() => {
      const w = window.__game.war, f = w.field;
      return { pool: f.pool[f.human], day: f.day, stage: w.st.stage, focus: document.activeElement.dataset.run };
    });
    await page.evaluate((flat) => {
      const w = window.__game.war;
      if (!!w.flat !== flat) throw new Error('unexpected war map view');
      w.field.pool[w.field.human] = 36;
    }, !!query);
    const { day } = await read();
    await page.keyboard.press('f');
    await page.locator('.actpanel.strats [data-sid="0"]').click();
    const rows = page.locator('.actpanel.targets [data-target]');
    await rows.first().waitFor();
    const targets = await rows.evaluateAll((buttons) => buttons.map((b) => b.dataset.target));
    assert.ok(targets.length >= 3, 'three different 火计 targets');
    const count = (key) => page.locator(`.actpanel.confirm [data-run="${key}"]`);
    const choose = async (id) => {
      await page.locator(`.actpanel.targets [data-target="${id}"]`).click();
      await page.locator('.actpanel.confirm .ap-go:not(.arming)').waitFor();
    };

    await choose(targets[0]);
    await page.locator('.actpanel.confirm .ap-back').focus();
    await page.keyboard.press('Enter');
    assert.deepEqual(await read(), { pool: 36, day, stage: 'targets', focus: undefined }, 'Enter on 返回 just backs out');

    for (const [i, key] of ['less', 'more', 'max'].entries()) {
      await choose(targets[i]);
      if (key === 'less') {
        await count('more').click();
        await page.keyboard.press('Space');
        assert.equal((await run(page)).n, 3, 'Space still adjusts the focused count button');
      }
      await count(key).click();
      assert.equal((await run(page)).n, 2, `selected two casts with ${key}`);
      assert.equal((await read()).focus, key, 'focus is still on the clicked count button');
      const remaining = 36 - (i + 1) * 12;
      await page.keyboard.down('Enter');
      try {
        const after = await read();
        assert.equal(after.pool, remaining, `Enter on ${key} spent exactly two casts`);
        assert.equal(after.stage, 'busy', 'the cast has started');
        // The last run spends the pool to 0: once it has played out the turn passes by itself (霸王之王@devblog, src/war/play.js check()).
        if (!remaining) { await page.waitForFunction(() => { const f = window.__game.war.field; return f.turn !== f.human; }, null, { timeout: 40000 }); continue; }
        await castDone(page);
        await page.keyboard.down('Enter'); // a repeat from the same press, now on the next step
        const repeated = await read();
        assert.equal(repeated.pool, remaining, 'the held key did not spend more mobility');
        assert.equal(repeated.day, day, 'the held key did not end the day');
        assert.equal(repeated.stage, 'targets', 'the held key did not pick another target');
      } finally { await page.keyboard.up('Enter'); }
    }
    assert.deepEqual(page.errors, []);
  } finally { stop(); await page.context().close(); }
});

test('连续 N 次: 1 to pool ÷ cost, a run of 3 is three casts in one window, the camera holds between casts and comes back on Esc', async () => {
  const page = await knot();
  const pool = () => page.evaluate(() => window.__game.war.field.pool[window.__game.war.field.human]);
  await still(page);
  const before = await view(page);
  await page.keyboard.press('f'); await page.waitForSelector('.actpanel.strats');
  await page.locator('.actpanel.strats [data-sid="0"]').click();
  await page.waitForSelector('.actpanel [data-target]');
  const first = await page.locator('.actpanel [data-target]').first().getAttribute('data-target');
  await page.locator('.actpanel [data-target]').first().click();
  await page.waitForSelector('.actpanel.confirm');
  let r = await run(page);
  assert.deepEqual([r?.label, r?.n], ['连续', 1], `the count starts at 1: ${JSON.stringify(r)}`);
  assert.match(r.sum, /消耗 6，全军余 24（还够攻击 12 次）/, 'at 1 the summary is as it always was');
  // A quick double click on ＋ is two times more (the buttons' own clicks); 最多 goes to the end.
  await page.waitForTimeout(400);
  await page.locator('.actpanel .ap-run [data-run="more"]').dblclick();
  assert.equal((await run(page)).n, 3, '＋ clicked twice in a row');
  await page.locator('.actpanel .ap-run [data-run="max"]').click();
  assert.equal((await run(page)).n, 5, '最多: 30 ÷ 6');
  await page.locator('.actpanel [data-target]').first().focus();
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft');
  r = await run(page);
  assert.equal(r.n, 3, '← twice from 5');
  assert.match(r.sum, /共耗 18，全军余 12（还够攻击 6 次）/);
  assert.match(r.sum, /第一次命中率约/);
  assert.equal(await page.evaluate(() => document.activeElement?.dataset?.target), first, 'the keys stay on the target');
  await still(page);
  const framed = await view(page);
  // The window of the run, read as it comes up.
  await page.evaluate(() => { window.__msgs = []; new MutationObserver(() => { for (const m of document.querySelectorAll('.panel.msg')) { const t = m.querySelector('h4')?.textContent; if (t && !window.__msgs.some((x) => x.t === t)) window.__msgs.push({ t, text: m.querySelector('p')?.innerText ?? '' }); } }).observe(document.body, { childList: true, subtree: true }); });
  const stop = closeMessages(page);
  try {
    await castGo(page);
    await castDone(page);
    const msgs = await page.evaluate(() => window.__msgs);
    const told = msgs.find((m) => /火计/.test(m.t));
    assert.ok(told, `a window told the run: ${JSON.stringify(msgs)}`);
    assert.equal(msgs.filter((m) => /火计/.test(m.t)).length, 1, 'one window for the three');
    const casts = (told.text.match(/第 \d 次/g) ?? []).length;
    assert.match(told.t, new RegExp(`^火计 ×${casts}$`));
    assert.equal(await pool(), 30 - 6 * casts, `each time paid its own 6: ${told.text}`);
    assert.ok(casts === 3 || /其余 \d 次未施（机动力未扣）/.test(told.text), `three casts, or the reason it stopped: ${told.text}`);
    // Back on the targets with the camera as it framed the choice.
    assert.equal(await page.evaluate(() => window.__game.war.st.stage), 'targets');
    await still(page);
    const after = await view(page);
    assert.equal(after.yaw, framed.yaw, 'the turn held'); assert.ok(Math.abs(after.dist - framed.dist) < 0.01, `the distance held: ${framed.dist} → ${after.dist}`); assert.equal(after.zoom, framed.zoom);
    // Asked again: the count is back at 1, its most what the pool now holds.
    await page.locator(`.actpanel [data-target="${first}"]`).click();
    await page.waitForSelector('.actpanel.confirm');
    const left = await pool();
    r = await run(page);
    if (Math.floor(left / 6) > 1) assert.equal(r?.n, 1, 'from 1 again'); else assert.equal(r, null, 'one cast left: no count');
    // Esc out of the confirmation and the choice: the view as it was before the 计略 was chosen.
    // (全景 is fitted again to the field as it stands, as unframeCast always did, so it is held to 全景's own fit, as tests/casttarget.test.mjs does.)
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    await page.waitForSelector('.actpanel.strats');
    assert.equal((await view(page)).zoom, before.zoom, 'out of the choice, the step it had');
    await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('.actpanel'));
    await still(page);
    const back = await page.evaluate(() => { const p = window.__game.war.probe(), v = p.view; return { yaw: v.yaw, zoom: v.zoom, atFit: v.atFit, dist: v.dist, fit: p.fitDist() }; });
    assert.ok(back.zoom === before.zoom && back.yaw === before.yaw && back.atFit && Math.abs(back.dist - back.fit) < 0.5, `the view given back, at 全景's own distance: ${JSON.stringify([before, back])}`);
    // With the mobility for one cast only: no count; cast, he is back on his commands.
    await page.evaluate(() => { const w = window.__game.war; w.field.pool[w.field.human] = 7; w.clickCell(window.__k.me.x, window.__k.me.y); }); // 7: at 0 the turn would pass by itself (src/war/play.js check())
    await page.keyboard.press('x'); await page.waitForSelector('.actpanel [data-target]');
    await page.locator('.actpanel [data-target]').first().click(); await page.waitForSelector('.actpanel.confirm');
    assert.equal(await run(page), null, 'N = 1: no count row');
    await castGo(page); await castDone(page);
    assert.deepEqual(await page.evaluate(() => [window.__game.war.st.stage, window.__game.war.field.pool[window.__game.war.field.human]]), ['cmds', 1], 'no mobility for another: back on his commands');
    // 十面埋伏 has no count (one ambush to an army).
    await page.evaluate(() => { const w = window.__game.war, f = w.field; window.__cc = f.canCast; f.canCast = () => true; f.pool[f.human] = 30; w.chooseStrategy(11); });
    await page.waitForSelector('.actpanel.confirm');
    assert.equal(await run(page), null, '十面埋伏: no count row');
    await page.evaluate(() => { const w = window.__game.war; w.cancel(); w.field.canCast = window.__cc; });
  } finally { stop(); }
  assert.deepEqual(page.errors, []);
  await page.context().close();
});
