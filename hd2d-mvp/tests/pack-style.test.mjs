// A data pack's town in another building style (docs/城池风格模型_方案_2026-11-22.md): "style": "japan" or "korea" on a new city
// stands it as city-<tier>-<style>.glb on the sand table and in its style's pictures on the 2D map. The test pack
// (tools/fixtures/packs/test-styles) has the four Japanese tiers, the four Korean ones (the capital and major city not made yet: they
// stand as the Han ones, quietly) and one town with no style. A game without a pack, or with a pack that names no style, fetches
// none of it.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startGame, newCampaign } from './game.mjs';

const MADE = ['city-capital-japan', 'city-major-japan', 'city-county-japan', 'pass-japan', 'city-county-korea', 'pass-korea'];
const fixture = (id) => {
  const dir = new URL(`../tools/fixtures/packs/${id}/`, import.meta.url);
  return async (ctx) => {
    await ctx.route(new RegExp(`/mods/${id}/[a-z]+\\.json$`), (r) => {
      const f = new URL(r.request().url().split('/').pop(), dir);
      return fs.existsSync(f) ? r.fulfill({ path: f.pathname, contentType: 'application/json' }) : r.fulfill({ status: 404 });
    });
  };
};
// Every request for a city model or a town picture, by file name, from before the game boots.
const watched = (seen, how) => async (ctx) => {
  await how?.(ctx);
  ctx.on('request', (q) => { const m = q.url().match(/\/sandtable\/(?:board\/models|flat)\/((?:city-|pass|towns)[^/?]*)$/); if (m) seen.push(m[1]); });
};

let game;
before(async () => { game = await startGame(); });
after(() => game?.close());

test('no pack, or a pack with no style, fetches no styled model or picture', async () => {
  for (const [q, how] of [['&pack=none', null], ['&pack=test-japan', fixture('test-japan')], ['&pack=none&flat', null], ['&flat&pack=test-japan', fixture('test-japan')]]) {
    const seen = [], page = await game.open(q, { setup: watched(seen, how) });
    await newCampaign(page, '刘备');
    assert.ok(!seen.some((f) => /-(japan|korea)/.test(f)), `${q}: ${seen.join(' ')}`);
    assert.deepEqual(page.errors, []);
    await page.close();
  }
});

test('3D: each styled town stands as its style\'s model, a style\'s tier not made yet as the Han one', async () => {
  const seen = [], page = await game.open('&pack=test-styles', { setup: watched(seen, fixture('test-styles')) });
  const logged = []; page.on('console', (m) => { if (m.type() === 'error') logged.push(m.text()); });
  await newCampaign(page, '刘备');
  // Only the models the pack's towns use, and none that is not on the server.
  assert.deepEqual(seen.filter((f) => /-(japan|korea)/.test(f)).sort(), MADE.map((k) => `${k}.glb`).sort());
  const r = await page.evaluate(() => {
    const { strategy: { world, scene } } = window.__game, mat = new Map();
    // Which model a material came from: cityModel hands out the same materials to every town of a kind (a tier not made in a
    // style hands out the Han ones, listed first). strategycities merges the towns' meshes by material, so a town is told by
    // which model's materials have geometry at its seat.
    for (const tier of ['capital', 'major', 'county', 'pass']) for (const st of ['han', 'japan', 'korea'])
      for (const { mat: m } of world.cityModel(tier, st === 'han' ? undefined : st)) if (!mat.has(m)) mat.set(m, `${tier}/${st}`);
    const meshes = []; scene.traverse((o) => { if (o.isMesh && mat.has(o.material)) meshes.push(o); });
    return world.cities.slice(30).map((w) => {
      const ks = new Set();
      for (const o of meshes) {
        const p = o.geometry.attributes.position; o.updateWorldMatrix(true, false);
        const e = o.matrixWorld.elements; // merged meshes sit at the origin; their vertices are in world units
        for (let i = 0; i < p.count; i++) if (Math.hypot(p.getX(i) + e[12] - w.mx, p.getZ(i) + e[14] - w.mz) < 0.12) { ks.add(mat.get(o.material)); break; }
      }
      return [w.name, [...ks].join(',') || null];
    });
  });
  assert.deepEqual(r, [['江户', 'capital/japan'], ['京都', 'major/japan'], ['仙台', 'county/japan'], ['箱根', 'pass/japan'],
    ['汉城', 'capital/han'], ['平壤', 'major/han'], ['庆州', 'county/korea'], ['铁岭', 'pass/korea'], ['博多', 'major/han']]);
  assert.deepEqual(logged.filter((t) => /city model/.test(t)), [], 'a tier not made yet is not an error');
  assert.deepEqual(page.errors, []);
});

test('3D: a styled model that will not load stands as the Han one, and says so', async () => {
  const page = await game.open('&pack=test-styles', { setup: async (ctx) => { await fixture('test-styles')(ctx); await ctx.route(/\/board\/models\/city-capital-japan\.glb$/, (q) => q.fulfill({ status: 404 })); } });
  const logged = []; page.on('console', (m) => { if (m.type() === 'error') logged.push(m.text()); });
  await newCampaign(page, '刘备');
  const same = await page.evaluate(() => { const w = window.__game.strategy.world; return w.cityModel('capital', 'japan') === w.cityModel('capital'); });
  assert.equal(same, true);
  assert.ok(logged.some((t) => t.includes('city-capital-japan')), logged.join(' | '));
  assert.deepEqual(page.errors, []);
});

test('2D: the styled towns are drawn from their style\'s pictures', async () => {
  const seen = [], page = await game.open('&flat&pack=test-styles', { setup: watched(seen, fixture('test-styles')) });
  await newCampaign(page, '刘备');
  assert.equal(await page.evaluate(() => document.querySelectorAll('.flatstrategy .labels .ctag').length), 39);
  for (const f of ['towns.json', 'towns-japan.json', 'towns-korea.json']) assert.ok(seen.includes(f), seen.join(' '));
  for (const st of ['', 'japan-', 'korea-']) assert.ok(seen.some((f) => new RegExp(`^towns-${st}(spring|summer|autumn|winter)\\.webp$`).test(f)), seen.join(' '));
  assert.deepEqual(page.errors, []);
});
