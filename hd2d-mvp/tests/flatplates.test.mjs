import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startGame, newCampaign } from './game.mjs';

// The flat war map's name plaques keep out of one another's way (src/warmap2d.js draw): on a phone a cell is about 20px wide and
// a plaque wider, so generals side by side had one's plaque over the other's name, worst at 系统 → 地图标签 大 (2026-11-20).
const overlaps = (page) => page.evaluate(() => {
  const ps = window.__game.war.flatDebug().plates, hit = [];
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
    const a = ps[i], b = ps[j], ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (ox > 0.5 && oy > 0.5) hit.push([a.id, b.id, Math.round(ox), Math.round(oy)]);
  }
  return { n: ps.length, hit, up: ps.filter((p) => p.up > 2).length };
});

for (const size of ['normal', 'large']) {
  test(`on a phone no plaque covers another (地图标签 ${size}), a general selected or not`, async () => {
    const game = await startGame({ width: 667, height: 360 });
    try {
      const page = await game.open('&phone', { setup: (ctx) => ctx.addInitScript((s) => localStorage.setItem('hd2d-label-size', s), size) });
      await newCampaign(page, '曹操');
      await page.evaluate(() => {
        const { g, debug } = window.__game, cs = g.cities, k = 4;
        const from = cs.findIndex((c, i) => i !== k && c.officers.length > 2 && c.faction !== cs[k].faction && c.faction !== 0);
        const ids = cs[from].officers.slice(0, 3);
        debug.fieldWar(debug.setupWar(g, { from, to: k, ids, commander: ids[0], gold: 0, rice: Math.min(cs[from].rice, 600) }), 'att');
      });
      await page.waitForFunction(() => document.body.dataset.screen === 'war' && window.__game.war?.finishDeploy, null, { timeout: 30000 });
      await page.waitForTimeout(2000);
      await page.evaluate(() => window.__game.war.finishDeploy());
      await page.waitForFunction(() => { const w = window.__game.war; return w.field.turn === w.field.human && !w.st.busy; }, null, { timeout: 60000 });
      await page.waitForTimeout(1200); // the offsets ease in
      const rest = await overlaps(page);
      assert.ok(rest.n >= 6, `both sides' plaques are drawn (${rest.n})`);
      assert.deepEqual(rest.hit, []);
      assert.ok(rest.up >= 1, 'two generals stand side by side here: one plaque has stepped up');
      // Selected, his plaque grows by the numbers' line and keeps its place; the neighbours' make room.
      const at = await page.evaluate(() => { const w = window.__game.war, u = w.field.side(w.field.human)[1], p = w.screenOf(u.x, u.y); return [p.x, p.y]; });
      await page.mouse.click(...at); await page.waitForTimeout(1200);
      assert.deepEqual((await overlaps(page)).hit, []);
      assert.deepEqual(page.errors, []);
    } finally {
      await game.close();
    }
  });
}
