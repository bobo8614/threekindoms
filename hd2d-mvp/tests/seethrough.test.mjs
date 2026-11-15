// Seeing a general through what stands in front of him on the 3D war map (src/seethrough.js). A player's report of
// 2026-11-09: at the near step the woods in front of a general flickered, were speckled with dots, and parts of him
// (the horse's head, the banner) showed as a blue stain on the crowns. The cause was the cutout as it was then: a
// screen-door dither on trees and rocks, an ellipse narrower than his picture with the x-ray ghost tinting what
// the ellipse left covered, and an ellipse that breathed with his idle animation. Now everything set up on the board
// is blended away over him (woods, rocks and cottages to nothing, the castle and village houses to 0.45), nothing of
// it is ever tinted by the ghost, the ellipse is fitted to his own pixels, and it holds still while he breathes.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startGame, newCampaign, closeMessages } from './game.mjs';

let game, page;
before(async () => {
  game = await startGame(); page = await game.open();
  await newCampaign(page);
  await page.evaluate(() => {
    const { g, G, debug } = window.__game, home = g.factions[g.player].city;
    const to = G.roads(home).map((c) => g.cities[c]).filter((c) => c.faction !== g.player && c.faction !== G.NONE && c.officers.length).sort((a, b) => b.officers.length - a.officers.length)[0];
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
  await page.evaluate(() => {
    window.__put = (u, x, y) => { const w = window.__game.war; u.x = x; u.y = y; w.spriteOf(u).position.set(x - 16 + 0.5, w.probe().top(x, y), y - 9.5 + 0.5); };
    // One of the player's generals alone on a cell, everyone else lined up along the near edge, the camera on him at `dist`.
    window.__alone = (x, y, dist) => { const w = window.__game.war, f = w.field, me = f.side(f.human)[0]; f.alive.forEach((u, i) => { if (u !== me) window.__put(u, 1 + 3 * i, 18); }); window.__put(me, x, y); w.frame(x, y, dist); return me.id; };
  });
});
after(() => game?.close());

// The camera has arrived and two frames have been drawn since.
async function settled() {
  await page.mouse.move(1270, 70);
  await page.waitForFunction(() => { const v = window.__game.war.probe().view; return v.now.every((t, i) => Math.abs(t - v.target[i]) < 0.01) && Math.abs(v.yaw - v.yawGoal) < 1e-4; }, null, { timeout: 5000 }).catch(() => {});
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); await page.waitForTimeout(600);
}
// A wood cell with wood on the two cells toward the camera, away from the board's edge.
const inWood = () => page.evaluate(() => {
  const w = window.__game.war, f = w.field, v = w.probe().view, fx = Math.round(Math.sin(v.yaw)), fy = Math.round(Math.cos(v.yaw)), out = [];
  for (let y = 3; y < 16; y++) for (let x = 3; x < 29; x++) if ([0, 1, 2].every((k) => f.map[y + fy * k]?.[x + fx * k] === 0)) out.push([x, y]);
  return out[out.length >> 1] ?? null;
});

test('whatever is set up on the board is blended away over a general, never dithered: woods, rocks and cottages whole, landmarks to 0.45', async () => {
  const kept = await page.evaluate(() => window.__game.war.probe().kept);
  assert.deepEqual(kept.landmark, [0.45]);
  assert.deepEqual(kept.other, [0], 'a tree, a rock or a cottage keeps nothing in the ellipse\'s core');
  assert.deepEqual(kept.blended, [true]);
  assert.deepEqual(kept.dithered, [false], 'no material discards against a noise pattern');
});

test('a general in the middle of a wood is seen through the crowns, with no ghost tinting them', async () => {
  const spot = await inWood();
  assert.ok(spot, 'this field has a wood three cells deep');
  for (const dist of [9, 14]) {
    const id = await page.evaluate(([x, y, d]) => window.__alone(x, y, d), [...spot, dist]);
    await settled();
    const r = await page.evaluate((id) => {
      const w = window.__game.war, post = window.__game.debug.post, cv = post.composer.renderer.domElement, g = w.spriteOf(w.field.alive.find((u) => u.id === id)), ghosts = [];
      g.traverse((o) => { if (o.material?.depthFunc === 6) ghosts.push(o); }); // the x-ray quad (GreaterDepth)
      const shot = () => { post.render(); const c = new OffscreenCanvas(cv.width, cv.height), q = c.getContext('2d'); q.drawImage(cv, 0, 0); return q.getImageData(0, 0, cv.width, cv.height).data; };
      const diff = (A, B) => { let n = 0; for (let i = 0; i < A.length; i += 4) if (Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]) > 30) n++; return n; };
      const on = shot(); ghosts.forEach((o) => { o.visible = false; }); const off = shot();
      // and what he himself changes on screen: his picture hidden, against shown (the ghost off both times)
      const body = ghosts[0].parent; body.visible = false; const gone = shot(); body.visible = true; ghosts.forEach((o) => { o.visible = true; });
      return { ghost: diff(on, off), seen: diff(off, gone), fig: w.probe().figures().find((f) => f.id === id) ?? null };
    }, id);
    assert.ok(r.ghost < 12, `at ${dist}: the ghost changes ${r.ghost} pixels of the wood`);
    assert.ok(r.seen > 1500, `at ${dist}: he shows through the crowns (${r.seen} pixels are his)`);
  }
});

test('the cleared ellipse holds still while a general stands and breathes, and covers all of his picture', async () => {
  const spot = await inWood();
  await page.evaluate(([x, y]) => window.__alone(x, y, 9), spot);
  await settled();
  const cuts = [];
  for (let i = 0; i < 6; i++) { cuts.push(await page.evaluate(() => window.__game.war.probe().cuts())); await page.waitForTimeout(170); } // a second: a third of a breath (2.2 rad/s)
  assert.ok(cuts[0].length > 0, 'the generals on the board each have an ellipse');
  // (a breath stretched the old ellipse by 1.4% of his height; the camera's last easing moves these in the fifth decimal)
  for (const c of cuts) { assert.equal(c.length, cuts[0].length); c.forEach((r, i) => r.forEach((x, k) => assert.ok(Math.abs(x - cuts[0][i][k]) <= 1e-4 * Math.max(1, Math.abs(x)), `ellipse ${i} moved: ${r} against ${cuts[0][i]}`))); }
  // Over every frame of his strip: none of his opaque pixels lies outside the ellipse, and nine in ten lie in the part cleared in full (its core).
  const fit = await page.evaluate(() => window.__game.war.probe().cutFit());
  assert.ok(fit.length > 0);
  for (const f of fit) {
    assert.ok(f.worst <= 1, `general ${f.id}: his farthest opaque pixel is at ${f.worst.toFixed(2)} of the ellipse`);
    assert.ok(f.inCore >= 0.9, `general ${f.id}: ${(f.inCore * 100).toFixed(0)}% of his pixels are in the core`);
  }
  assert.deepEqual(page.errors, []);
});
