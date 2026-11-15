// War general cards (feedback 2026-11-13: the foe's card, squeezed beside ours, let its figures and bars run past its
// edge): at every width, 3D and flat, nothing spills out of a card and every attribute pair stays on one row.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { startGame, newCampaign, closeMessages } from './game.mjs';

let game, p;
after(() => game?.close());
const fit = () => p.evaluate(() => [...document.querySelectorAll('.unitpanel')].filter((e) => e.getClientRects().length).map((card) => {
  const inner = card.getBoundingClientRect().right - parseFloat(getComputedStyle(card).borderRightWidth);
  const spill = [...card.querySelectorAll('*')].filter((el) => el.getClientRects().length && el.getBoundingClientRect().right > inner + 0.5).map((el) => el.className || el.tagName);
  const split = [...card.querySelectorAll('dl dt')].filter((dt) => Math.abs(dt.nextElementSibling.getBoundingClientRect().top - dt.getBoundingClientRect().top) > 2).map((dt) => dt.textContent);
  return { card: card.classList.contains('compare') ? 'foe' : 'ours', spill, split };
}));

for (const [view, q] of [['3D', ''], ['flat', '&flat']]) {
  test(`${view}: the attack's two general cards keep everything inside at every width`, async () => {
    game ??= await startGame({ width: 1280, height: 720 });
    p = await game.open(q);
    await p.evaluate(async () => { (await import('./src/pace.js')).setPace(4); (await import('./src/vignette.js')).setVignettes(false); });
    await newCampaign(p, '曹操');
    await p.evaluate(() => {
      const { g, G, debug } = window.__game, home = g.factions[g.player].city;
      const to = G.roads(home).map((c) => g.cities[c]).filter((c) => c.faction !== g.player && c.faction !== G.NONE && c.officers.length).sort((a, b) => b.officers.length - a.officers.length)[0];
      for (const id of [...g.cities[home].officers, ...to.officers]) g.officers[id].soldiers ||= 500;
      const ids = g.cities[home].officers.slice(0, 4);
      debug.fieldWar(debug.setupWar(g, { from: home, to: to.id, ids, commander: ids[0], gold: 100, rice: 400 }), 'att');
    });
    await p.waitForFunction(() => window.__game.war?.finishDeploy && document.body.dataset.screen === 'war', null, { timeout: 30000 });
    const stop = closeMessages(p);
    try {
      await p.waitForTimeout(2500); await p.evaluate(() => window.__game.war.finishDeploy());
      await p.waitForFunction(() => { const f = window.__game.war.field; return f.turn === f.human && !document.querySelector('.banner, .panel.msg'); }, null, { timeout: 30000 });
    } finally { stop(); }
    // a general of ours with two enemies beside him (the commander one of them), on plain ground
    await p.evaluate(async () => {
      const F = await import('./src/core/field.js'), wv = window.__game.war, f = wv.field;
      const me = f.alive.find((u) => u.side === f.human), foes = f.alive.filter((u) => u.side !== f.human).sort((a, b) => Number(!!b.commander) - Number(!!a.commander));
      const free = (x, y) => f.inside(x, y) && !f.unitAt(x, y) && f.terr(x, y) === F.PLAIN;
      let s = null;
      for (let y = 4; y < F.H - 4 && !s; y++) for (let x = 6; x < F.W - 6 && !s; x++) if ([[x, y], [x + 1, y], [x, y + 1]].every(([a, b]) => free(a, b))) s = [x, y];
      [me.x, me.y] = s; [foes[0].x, foes[0].y] = [s[0] + 1, s[1]]; [foes[1].x, foes[1].y] = [s[0], s[1] + 1];
      const top = wv.probe().top;
      for (const u of f.alive) wv.spriteOf(u)?.position.set(u.x - F.W / 2 + 0.5, top(u.x, u.y), u.y - F.H / 2 + 0.5);
      f.pool[f.human] = 30; wv.clickCell(me.x, me.y); if (!wv.flat) wv.frame(me.x, me.y, 14);
    });
    await p.waitForTimeout(1500);
    await p.locator('.unitpanel:not(.compare) .acts button', { hasText: '攻击' }).click();
    await p.locator('.actpanel [data-target]').first().click();
    await p.waitForSelector('.unitpanel.compare');
    for (const [width, height] of [[1024, 600], [1201, 675], [1280, 720], [1440, 900], [1920, 1080]]) {
      await p.setViewportSize({ width, height }); await p.waitForTimeout(300);
      const cards = await fit();
      assert.equal(cards.length, 2, `${width}×${height}: both cards`);
      for (const c of cards) assert.deepEqual([c.spill, c.split], [[], []], `${view} ${width}×${height} ${c.card}`);
    }
    await p.context().close();
  });
}
