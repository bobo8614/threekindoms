// The war map's rain is light (jason at depot heights@小红书, 2026-11-13): in the storm months the streaks stood over the whole board.
// The 3D war draws fewer, shorter, fainter streaks and a softer flash than the other scenes do at the same month's level, the
// painted map likewise and without the grey wash; the level itself, which the rules' views read, is the month's.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startGame } from './game.mjs';

let game;
before(async () => { game = await startGame(); });
after(() => game?.close());

test('the war map draws less rain and a softer flash than the month gives the other scenes', async () => {
  const page = await game.open();
  const r = await page.evaluate(async () => {
    const THREE = await import('three'), { createWeather } = await import('./src/weather.js'), { WAR_RAIN } = await import('./src/war/shared.js'), { createSky2d } = await import('./src/skyfx2d.js');
    const run = (opts) => { const scene = new THREE.Scene(), w = createWeather(scene, opts); w.set({ rain: 1, thunder: 0 }); w.update(0.016, 1, new THREE.Vector3(), 20);
      const rain = scene.children.find((o) => o.isLineSegments), p = rain.geometry.attributes.position.array;
      return { n: rain.geometry.drawRange.count / 2, alpha: rain.material.opacity, len: Math.hypot(p[3] - p[0], p[4] - p[1]) }; };
    const draw = (light) => { const calls = { lines: 0, wash: 0, stroke: 0 };
      const g = { set fillStyle(v) { const a = Number(/[\d.]+\)$/.exec(v)?.[0].slice(0, -1)); if (v.startsWith('rgba(24')) calls.wash = a; }, set strokeStyle(v) { calls.stroke = Number(/[\d.]+\)$/.exec(v)[0].slice(0, -1)); },
        fillRect() {}, beginPath() {}, moveTo() { calls.lines++; }, lineTo() {}, stroke() {}, set lineWidth(v) {}, set globalAlpha(v) {} };
      createSky2d().draw(g, { rain: 1, thunder: 0 }, { width: 1280, height: 800, cell: 48, time: 1, dt: 0.016, light }); return calls; };
    return { full: run(), war: run(WAR_RAIN), flat: draw(false), flatWar: draw(true), WAR_RAIN };
  });
  assert.ok(r.war.n > 0 && r.war.n <= r.full.n * 0.5, `fewer streaks: ${r.war.n} of ${r.full.n}`);
  assert.ok(r.war.alpha <= r.full.alpha * 0.6 && r.war.len <= r.full.len * 0.7, 'fainter and shorter');
  assert.ok(r.WAR_RAIN.flashK <= 0.5, 'a softer flash');
  assert.ok(r.flatWar.lines > 0 && r.flatWar.lines <= r.flat.lines * 0.5 && r.flatWar.stroke <= r.flat.stroke * 0.6, 'the painted map: fewer and fainter');
  assert.ok(r.flatWar.wash <= 0.06 && r.flat.wash >= 0.15, 'and no grey wash over the board');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});
