// A battle on the flat painted war map for the review tools (flat_shot.mjs, flat_check.mjs): a new game,
// 曹操's side marched on the given city in the given month, deployment finished, the player's first turn.
// Muted, seeded; page errors are collected in page.errors.
export async function openWar(browser, { url, city = 4, month = 3, size = [1440, 900], dpr = 1 }) {
  const [VW, VH] = size;
  const page = await (await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: dpr })).newPage();
  page.errors = [];
  await page.addInitScript((seed) => { let s = seed; Math.random = () => (s = (s * 16807) % 2147483647) / 2147483647; }, 1 + city * 97 + month * 7);
  page.on('pageerror', (e) => page.errors.push(`pageerror ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && page.errors.push(`console ${m.text()}`));
  page.on('response', (r) => r.status() >= 400 && !r.url().includes('/audio/') && page.errors.push(`http ${r.status()} ${r.url()}`));
  await page.goto(`${url}?mute`); await page.waitForFunction(() => window.__game?.debug);
  await page.getByText('新的征程').click(); await page.waitForTimeout(600);
  await page.locator('.ruler', { hasText: '曹操' }).click(); await page.locator('.ruler', { hasText: '曹操' }).click();
  await page.waitForFunction(() => document.body.dataset.screen === 'strategy'); await page.waitForTimeout(800);
  // The factions before the player's take their turns first, at the original's pace (src/pace.js); the war is
  // set up on the player's own turn, or that turn would open over it (tests/game.mjs newCampaign does the same).
  const close = setInterval(() => page.evaluate(() => document.querySelector('.panel.msg')?.click()).catch(() => {}), 250);
  try { await page.waitForFunction(() => { const g = window.__game.g; return g.current === g.player && !document.querySelector('.aiturn, .panel.msg'); }, null, { timeout: 120000 }); }
  finally { clearInterval(close); }
  await page.evaluate(({ k, month }) => {
    const { g, debug } = window.__game, cs = g.cities, to = cs[k];
    g.month = month;
    const from = cs.findIndex((c, i) => i !== k && c.officers.length > 2 && c.faction !== to.faction && c.faction !== 0);
    if (!to.officers.length) {
      const donor = cs.find((c, i) => i !== k && i !== from && c.officers.length > 1 && c.faction !== cs[from].faction && c.faction !== 0);
      to.faction = donor.faction; to.officers = donor.officers.splice(0, 2);
    }
    const ids = cs[from].officers.slice(0, 3);
    debug.fieldWar(debug.setupWar(g, { from, to: k, ids, commander: ids[0], gold: 0, rice: Math.min(cs[from].rice, 600) }), 'att');
  }, { k: city, month });
  await page.waitForFunction(() => document.body.dataset.screen === 'war' && window.__game.war, null, { timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.__game.war.finishDeploy());
  await myTurn(page);
  return page;
}
export const myTurn = (page, timeout = 60000) => page.waitForFunction(() => { const w = window.__game.war; return w.field.turn === w.field.human && !w.st.busy; }, null, { timeout }).then(() => page.waitForTimeout(800));
// A cell's centre on screen (the painted board's cells are wider than tall).
export const cellPx = (page, x, y) => page.evaluate(([x, y]) => { const p = window.__game.war.screenOf(x, y); return [p.x, p.y]; }, [x, y]);
