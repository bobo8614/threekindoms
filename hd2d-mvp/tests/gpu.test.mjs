// GPU memory across battles: every war, 白兵 and 单挑 builds its scene anew, and what the last one uploaded must
// go when the next one comes. A war left ~260 geometries and ~15 textures behind (its scene, sky and shadow map),
// a 白兵 a 1904×1568 cliff texture: hundreds of MB by the end of a campaign.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startGame, newCampaign } from './game.mjs';

let game;
before(async () => { game = await startGame(); });
after(async () => { await game?.close(); });

const memory = (p) => p.evaluate(() => { const { geometries, textures } = window.__game.debug.renderer.info.memory; return { geometries, textures }; });

// A war ends with its range cells cleared off the board, so their materials are no longer in the scene it frees.
for (const [how, cleared] of [['with its range cells up', false], ['with its range cells cleared', true]]) test(`the same war fought again, ${how}, leaves nothing more on the GPU`, async () => {
  const p = await game.open();
  await newCampaign(p);
  const seen = [];
  for (let i = 0; i < 3; i++) {
    await p.evaluate(() => {
      const { g, debug } = window.__game; // each round starts from the same campaign, so the war is the same
      if (!window.__snap) window.__snap = structuredClone(g); else { for (const k of Object.keys(g)) delete g[k]; Object.assign(g, structuredClone(window.__snap)); }
      const cs = g.cities, k = 2, to = cs[k];
      const from = cs.findIndex((c, j) => j !== k && c.officers.length > 2 && c.faction !== to.faction && c.faction !== 0);
      if (!to.officers.length) { const donor = cs.find((c, j) => j !== k && j !== from && c.officers.length > 1 && c.faction !== cs[from].faction && c.faction !== 0); to.faction = donor.faction; to.officers = donor.officers.splice(0, 2); }
      const ids = cs[from].officers.slice(0, 2);
      debug.fieldWar(debug.setupWar(g, { from, to: k, ids, commander: ids[0], gold: 0, rice: Math.min(cs[from].rice, 600) }), 'att');
    });
    await p.waitForFunction(() => document.body.dataset.screen === 'war' && window.__game.war, null, { timeout: 60000 });
    await p.waitForTimeout(2500); // the board has rendered: its sky, shadow map and pieces are uploaded
    if (cleared) await p.evaluate(() => window.__game.war.finishDeploy());
    await p.evaluate(() => { const { war, debug } = window.__game; war.dispose(); debug.show('strategy'); document.body.dataset.screen = 'strategy'; });
    await p.waitForTimeout(1000);
    seen.push(await memory(p));
  }
  assert.deepEqual(seen[2], seen[1], `after each war: ${JSON.stringify(seen)}`);
  assert.deepEqual(p.errors, []);
});

test('a 白兵 and a 单挑 staged again leave nothing more on the GPU', async () => {
  const p = await game.open();
  const r = await p.evaluate(async () => {
    const { debug, tview, G } = window.__game, out = { t: [], d: [] }, R = debug.renderer, dv = debug.duelView;
    const { Tactical } = await import('./src/core/tactical.js');
    const g = G.newGame(4, 1, 3), looks = { a: 'attacker', d: 'defender' };
    const mem = () => [R.info.memory.geometries, R.info.memory.textures];
    tview.setPlace({ month: 2, city: 12 }); await tview.ready(); debug.show('tview');
    for (let i = 0; i < 4; i++) { tview.build(new Tactical(g, 38, 51, 2, G.rng(g), { human: 'a' }), looks); await new Promise((f) => setTimeout(f, 300)); out.t.push(mem()); }
    dv.setPlace({ month: 2, city: 12, siege: null }); debug.show('dview');
    for (let i = 0; i < 3; i++) { await dv.enter(new Tactical(g, 38, 51, 2, G.rng(g), { human: 'a' }), looks); await new Promise((f) => setTimeout(f, 300)); out.d.push(mem()); }
    return out;
  });
  assert.deepEqual(r.t.at(-1), r.t[1], `白兵 after each build: ${JSON.stringify(r.t)}`);
  assert.deepEqual(r.d.at(-1), r.d[1], `单挑 after each entry: ${JSON.stringify(r.d)}`);
  assert.deepEqual(p.errors, []);
});
