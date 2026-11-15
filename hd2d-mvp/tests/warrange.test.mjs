// The war map's range display (docs/战场范围显示实施计划_2026-11-13.md): the reach as one region on a single layer, the hovered
// route as an arrow with its cost, on the 3D board and the flat painted map. The rules are not touched: what is marked is read
// off the same cells as before (flatState().marks), and these cases hold the picture's side of it.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { startGame, newCampaign, closeMessages } from './game.mjs';

let game;
after(async () => { await game?.close(); });
// A war on the player's turn (as tests/warsplit.test.mjs opens one), one of ours selected with the pool full.
async function openWar(view) {
  game ??= await startGame(); const p = await game.open();
  await p.evaluate(async (view) => { (await import('./src/quality.js')).warView.set(view); }, view);
  await newCampaign(p);
  await p.evaluate(() => {
    const { g, G, debug } = window.__game, home = g.factions[g.player].city;
    const to = G.roads(home).map((c) => g.cities[c]).filter((c) => c.faction !== g.player && c.faction !== G.NONE && c.officers.length).sort((a, b) => b.officers.length - a.officers.length)[0];
    for (const id of [...g.cities[home].officers, ...to.officers]) g.officers[id].soldiers ||= 500;
    const ids = g.cities[home].officers.slice(0, 3);
    debug.fieldWar(debug.setupWar(g, { from: home, to: to.id, ids, commander: ids[0], gold: 100, rice: 400 }), 'att');
  });
  await p.waitForFunction(() => window.__game.war?.finishDeploy && document.body.dataset.screen === 'war', null, { timeout: 30000 });
  const stop = closeMessages(p);
  try {
    await p.waitForTimeout(2500); await p.evaluate(() => window.__game.war.st.deploying && window.__game.war.finishDeploy());
    await p.waitForFunction(() => { const w = window.__game.war, f = w?.field; return f && f.turn === f.human && !w.st.busy && !w.st.deploying && !document.querySelector('.banner, .panel.msg, .shade, #fade.on'); }, null, { timeout: 60000 });
  } finally { stop(); }
  return p;
}
const frame = (p) => p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
// The dearest cell he can reach, hovered: the route to it and what the view says of it.
const hoverFar = (p) => p.evaluate(() => {
  const w = window.__game.war, f = w.field, me = f.side(f.human)[0]; f.pool[f.human] = 20; w.cancel(); w.clickCell(me.x, me.y);
  w.update(0.016); const count = () => { if (w.flat) return null; const post = window.__game.debug.post, r = post.composer.renderer; for (let i = 0; i < 3; i++) post.render(); r.info.autoReset = false; r.info.reset(); post.render(); const n = r.info.render.calls; r.info.autoReset = true; return n; }, selCalls = count();
  const [key, cost] = [...w.st.reach.dist].filter(([k]) => k !== `${me.x},${me.y}`).sort((a, b) => b[1] - a[1])[0], [x, y] = key.split(',').map(Number);
  w.hoverCell({ x, y }, true); w.update(0.016); // the page's own pointer handling may clear a scripted hover by the next frame: all is read here, at once
  const s = w.flatState(); let label = null; w.scene.traverse((o) => { if (o.isCSS2DObject && o.element.className === 'route-cost') label = o.visible ? o.element.textContent : null; });
  const calls = count();
  return { label, calls, selCalls, me: [me.x, me.y], to: [x, y], cost, want: f.path(w.st.reach, x, y), got: s.marks.filter((m) => m.kind === 'path').map((m) => [m.x, m.y]), from: s.routeFrom,
    reach: [...w.st.reach.dist.keys()].filter((k) => k !== `${me.x},${me.y}`).sort(), marked: s.marks.filter((m) => m.kind === 'move' || m.kind === 'castle').map((m) => `${m.x},${m.y}`).sort(), layer: w.probe().rangeMeshes, range: s.marks.filter((m) => m.kind !== 'path').length };
});

test('3D: selecting a general draws his range in a few calls, and the hovered route is the rules\' path with its cost', async () => {
  const p = await openWar('3d');
  try {
    const calls = () => p.evaluate(() => { const post = window.__game.debug.post, r = post.composer.renderer; for (let i = 0; i < 3; i++) post.render(); r.info.autoReset = false; r.info.reset(); post.render(); const n = r.info.render.calls; r.info.autoReset = true; return n; });
    await p.evaluate(() => { const w = window.__game.war; w.cancel(); w.hoverCell(null); }); await frame(p);
    const idle = await calls();
    const h = await hoverFar(p);
    assert.ok(h.selCalls - idle <= 5, `selecting adds ${h.selCalls - idle} draw calls (V06: at most 5; each range cell was three before)`);
    assert.ok(h.calls - h.selCalls <= 5, `the hovered route, its cursor and what the hover lights add ${h.calls - h.selCalls} more (each route cell was one before)`);
    assert.deepEqual(h.marked, h.reach, 'the marked cells are his reach, less his own');
    assert.equal(h.layer, h.range, 'the layer shows every range cell');
    assert.deepEqual(h.got, h.want, 'the route is field.path (V04)');
    assert.deepEqual([h.from.x, h.from.y], h.me, 'and sets out from where he stands');
    assert.equal(h.label, `−${h.cost}`, 'the cost stands over where the route ends');
    // Put away, nothing of it stays.
    assert.equal(await p.evaluate(() => { const w = window.__game.war; w.hoverCell(null); w.cancel(); w.update(0.016); return w.probe().rangeMeshes; }), 0);
    assert.equal(await calls(), idle, 'and the frame is drawn as before he was selected');
    assert.equal(await p.evaluate(() => { let v = false; window.__game.war.scene.traverse((o) => { if (o.isCSS2DObject && o.element.className === 'route-cost') v = o.visible; }); return v; }), false, 'the cost is put away');
    await p.evaluate(() => { const w = window.__game.war, me = w.field.side(w.field.human)[0]; w.clickCell(me.x, me.y); w.update(0.016); });
    // The overview and the ground view keep the layer (V07).
    for (const on of ['tactical', 'setTerrainView']) {
      assert.equal(await p.evaluate((on) => { const w = window.__game.war; w[on](true); w.update(0.016); return w.probe().rangeMeshes; }, on), h.range, `${on}: the range still shows`);
      await p.evaluate((on) => window.__game.war[on](false), on);
    }
    assert.deepEqual(p.errors, []);
  } finally { await p.close(); }
});

test('flat: the same cells and the same route, drawn by the painted map', async () => {
  const p = await openWar('flat');
  try {
    const h = await hoverFar(p); await frame(p);
    assert.equal(await p.evaluate(() => !!window.__game.war.flat || !!window.__game.war.flatState), true);
    assert.deepEqual(h.marked, h.reach, 'the marked cells are his reach, less his own');
    assert.deepEqual(h.got, h.want, 'the route is field.path');
    assert.deepEqual([h.from.x, h.from.y], h.me);
    assert.equal(h.layer, 0, 'no 3D layer on the flat map');
    assert.deepEqual(p.errors, []);
  } finally { await p.close(); }
});
