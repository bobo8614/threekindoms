// The flat painted war map (src/warmap2d.js) as the player meets it, at the common window sizes: the HUD never
// covers a playable cell, every general stands on the board, a click on a gold cell moves the selected general
// there (with dust kicked up on the way), and a 白兵 cut-in is not hidden under the map. Exit 1 on a failure.
//   node hd2d-mvp/tools/flat_check.mjs [--url http://localhost:8679/hd2d-mvp/] [--city 4] [--month 5] [--shots dir]
import { launchChrome } from './headless.mjs';
import { openWar, myTurn, cellPx } from './flat_setup.mjs';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const URL = arg('--url', 'http://localhost:8679/hd2d-mvp/'), city = Number(arg('--city', 4)), month = Number(arg('--month', 5)), shots = arg('--shots', '');
const SIZES = [[1440, 900], [1280, 720], [1920, 1080]];
const browser = await launchChrome(URL);
const fails = [], fail = (m) => { fails.push(m); console.log('FAIL', m); };

for (const [i, size] of SIZES.entries()) {
  const tag = size.join('x'), page = await openWar(browser, { url: URL, city, month, size });
  if (!(await page.evaluate(() => window.__game.war.flat))) { fail(`${tag}: the war map is not flat`); await page.close(); continue; }
  // The board against every HUD strip on screen.
  const hud = await page.evaluate(() => {
    const w = window.__game.war, a = w.screenOf(0, 0), b = w.screenOf(31, 18);
    const board = { l: a.x - a.cw / 2, t: a.y - a.ch / 2, r: b.x + b.cw / 2, b: b.y + b.ch / 2 };
    const over = [...document.querySelectorAll('.warbar, .sysbtns, .unitpanel, .wardock, .logbox, .deploybtn')].filter((e) => e.offsetParent).map((e) => {
      const r = e.getBoundingClientRect(); return { cls: e.className, l: r.left, t: r.top, r: r.right, b: r.bottom };
    }).filter((r) => r.l < board.r - 1 && r.r > board.l + 1 && r.t < board.b - 1 && r.b > board.t + 1);
    return { board, over };
  });
  for (const o of hud.over) fail(`${tag}: ${o.cls} covers the board (${Math.round(o.l)},${Math.round(o.t)})-(${Math.round(o.r)},${Math.round(o.b)})`);
  const off = await page.evaluate(() => window.__game.war.flatState().units.filter((v) => v.visible && (v.x < -0.01 || v.y < -0.01 || v.x > 31.01 || v.y > 18.01)).length);
  if (off) fail(`${tag}: ${off} generals off the board`);
  // Select the commander and ride to the farthest gold cell.
  const at = await page.evaluate(() => { const w = window.__game.war, u = w.field.side(w.field.human).find((x) => x.commander); return [u.x, u.y]; });
  await page.mouse.click(...(await cellPx(page, ...at))); await page.waitForTimeout(500);
  const to = await page.evaluate(([x, y]) => window.__game.war.flatState().marks.filter((m) => m.kind === 'move').sort((a, b) => Math.hypot(b.x - x, b.y - y) - Math.hypot(a.x - x, a.y - y))[0], at);
  if (!to) fail(`${tag}: no gold cells after selecting the commander`);
  else {
    await page.mouse.click(...(await cellPx(page, to.x, to.y)));
    await page.waitForFunction(() => window.__game.war.st.busy, null, { timeout: 3000 }).catch(() => {});
    const dust = await page.waitForFunction(() => window.__game.war.flatState().fx.some((f) => f.kind === 'dust'), null, { timeout: 4000 }).then(() => true, () => false);
    await page.waitForFunction(() => !window.__game.war.st.busy, null, { timeout: 20000 });
    const now = await page.evaluate(() => { const u = window.__game.war.field.side(window.__game.war.field.human).find((x) => x.commander); return [u.x, u.y]; });
    if (now[0] !== to.x || now[1] !== to.y) fail(`${tag}: clicked ${to.x},${to.y}, the commander is at ${now}`);
    if (!dust) fail(`${tag}: no dust on the ride`);
  }
  if (shots) await page.screenshot({ path: `${shots}/flat-${tag}.png` });
  // Once: end the days until the enemy attacks; the cut-in must show with the map layer hidden, and the map come back.
  if (i === 0) {
    // At 4× (the 白兵 takes the game speed as it opens): at the original's pace it runs past the wait.
    await page.evaluate(async () => (await import('./src/pace.js')).setPace(4));
    let seen = false;
    for (let day = 0; day < 8 && !seen; day++) {
      await page.evaluate(() => window.__game.war.endTurn());
      seen = await page.waitForFunction(() => document.body.classList.contains('cine') && !document.body.classList.contains('flat2d') && document.body.dataset.screen === 'war', null, { timeout: 45000, polling: 100 }).then(() => true, () => false);
      if (!seen) await myTurn(page).catch(() => {});
    }
    if (!seen) console.log(`${tag}: no attack within 8 days (cut-in not checked)`);
    else {
      await page.waitForTimeout(2500);
      const shown = await page.evaluate(() => getComputedStyle(document.querySelector('.flatwar')).display);
      if (shown !== 'none') fail(`${tag}: the map layer covers the 白兵 cut-in`);
      if (shots) await page.screenshot({ path: `${shots}/flat-cutin.png` });
      // Fight it on 自动 to its end (as tools/pace_capture.mjs does); the flat map must be back.
      let back = false;
      for (const t0 = Date.now(); !back && Date.now() - t0 < 240000;) {
        if (await page.locator('.tq-form').count()) { await page.locator('.tq-form').first().click().catch(() => {}); await page.locator('.tq-deploy:not(.arming)').click().catch(() => {}); }
        if (await page.locator('.tq-start button').count()) { await page.locator('.tq-btn', { hasText: '自动' }).click().catch(() => {}); await page.locator('.tq-start button:not(.arming)').click().catch(() => {}); }
        if (await page.locator('.tq-result button').count()) await page.locator('.tq-result button').click().catch(() => {});
        if (await page.locator('.tq-ask .primary').count() && !(await page.locator('.tq-start').count())) await page.locator('.tq-ask .primary').first().click().catch(() => {});
        back = await page.evaluate(() => document.body.classList.contains('flat2d') && !document.body.classList.contains('cine'));
        await page.waitForTimeout(200);
      }
      await page.evaluate(async () => (await import('./src/pace.js')).setPace(1));
      if (back) {
        await page.waitForTimeout(1200);
        // The board is what shows round whatever comes next (the next day, or the settlement if the war ended).
        if (!(await page.evaluate(() => { const e = document.querySelector('.flatwar'); return !!e && getComputedStyle(e).display !== 'none'; }))) fail(`${tag}: no map under the screen after the cut-in`);
        if (shots) await page.screenshot({ path: `${shots}/flat-after-cutin.png` });
      }
      if (!back) {
        fail(`${tag}: the flat map did not come back after the cut-in (${await page.evaluate(() => `${document.body.dataset.screen} ${document.body.className}`)})`);
        if (shots) await page.screenshot({ path: `${shots}/flat-stuck.png` });
      }
    }
  }
  for (const e of page.errors) fail(`${tag}: ${e}`);
  await page.close();
  console.log(tag, 'checked');
}
await browser.close();
console.log(fails.length ? `${fails.length} failures` : 'flat war map ok');
process.exit(fails.length ? 1 : 0);
