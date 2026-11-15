// The post stack's shortcuts (src/post.js) must look like the long way round: the occlusion read from the normals cached once a
// frame matches three's rebuild in each pass, and the depth of field with no blur gives back what its full gather would.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startGame } from './game.mjs';

let game, page;
before(async () => {
  game = await startGame();
  page = await game.open();
  // A 白兵 board, still: its sprites, shadows and ground give the occlusion edges against open field.
  await page.evaluate(async () => {
    const { debug, tview, G } = window.__game;
    const { Tactical } = await import('./src/core/tactical.js');
    const g = G.newGame(4, 1, 3);
    tview.setPlace({ month: 2, city: 12 }); await tview.ready(); debug.show('tview');
    tview.build(new Tactical(g, 38, 51, 2, G.rng(g), { human: 'a' }), { a: 'attacker', d: 'defender' });
  });
  await page.waitForTimeout(1500);
});
after(async () => { await game?.close(); });

// Renders the frozen frame (grain off its clock, nothing updated between) under each setting and compares what read() gives back.
const compare = (which) => page.evaluate((which) => {
  const post = window.__game.debug.post, r = post.composer.renderer, gl = r.getContext();
  const half = (h) => { const e = (h >> 10) & 31, f = h & 1023; return (h >> 15 ? -1 : 1) * (e ? 2 ** (e - 15) * (1 + f / 1024) : 2 ** -14 * f / 1024); };
  const ao = () => { const t = post.gtao.pdRenderTarget, b = new Uint16Array(t.width * t.height * 4); r.readRenderTargetPixels(t, 0, 0, t.width, t.height, b); return Float32Array.from({ length: t.width * t.height }, (_, i) => half(b[i * 4])); };
  const screen = () => { const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, b = new Uint8Array(w * h * 4); gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, b); return Float32Array.from(b, (v) => v / 255); };
  const dofs = [post.composer.passes[1], post.composer.passes[2]], stock = dofs.map((p) => p.material.fragmentShader);
  const LINE = /\n\s*if \(radius <= 0\.\) \{[^\n]*\}/;
  const set = {
    normals: [(on) => post.useNormalCache(on), ao],
    noBlur: [(on) => dofs.forEach((p, i) => { p.material.fragmentShader = on ? stock[i] : stock[i].replace(LINE, ''); p.material.needsUpdate = true; }), screen],
  }[which];
  if (which === 'noBlur') post.setDof({ strength: 0, band: 0.09, far: 1.3, near: 1 }); // as the war map's 战术 view (src/warview.js)
  const now = performance.now; performance.now = () => 4321;
  const grab = (on) => { set[0](on); post.render(); post.render(); return set[1](); };
  const off = grab(false), on = grab(true);
  performance.now = now; set[0](true); post.setDof(null);
  let max = 0, over = 0;
  for (let i = 0; i < on.length; i++) { const d = Math.abs(on[i] - off[i]); if (!(d <= 1)) continue; if (d > max) max = d; if (d > 4 / 255) over++; }
  return { cached: post.normalCache, patched: dofs.every((p) => LINE.test(p.material.fragmentShader)), max, overShare: over / on.length };
}, which);

test('the occlusion from the cached normals matches three\'s rebuild in each pass', async () => {
  const r = await compare('normals');
  assert.ok(r.cached, 'the cache is in use (three\'s GTAO shaders still have the line it replaces)');
  assert.ok(r.overShare < 0.001, `under 0.1% of the occlusion off by more than 4/255: ${JSON.stringify(r)}`);
  assert.deepEqual(page.errors, []);
});

test('with no blur the depth of field gives back the frame its full gather would', async () => {
  const r = await compare('noBlur');
  assert.ok(r.patched, 'the no-blur shortcut is in the shader');
  assert.ok(r.max <= 1 / 255 + 1e-6, `within rounding: ${JSON.stringify(r)}`);
  assert.deepEqual(page.errors, []);
});
