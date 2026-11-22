// An official extension region on the 战略地图 (docs/战略地图数据包扩展设计_2026-11-17.md §5.5, 第 3 期): the test pack
// (tools/fixtures/packs/test-region, served as mods/test-region) names the strip east of the original board (east, 战略地图右侧扩展_方案_2026-11-17.md)
// and puts three towns on it. The region is not yet open to packs (it is not in regions/index.json), so the tests open it by serving
// an index that lists it. Its towns stand on the region's own board in 3D and on its pictures in 2D, one rectangular frame goes round
// both boards, the whole strip shows clear (no fog: the user's call, 2026-11-17), the land is tinted across both, and a game without a
// pack asks for nothing of any region.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startGame, newCampaign } from './game.mjs';

const FIX = new URL('../tools/fixtures/packs/test-region/', import.meta.url);
const serve = async (ctx) => {
  await ctx.route(/\/mods\/test-region\/[a-z]+\.json$/, (r) => {
    const f = new URL(r.request().url().split('/').pop(), FIX);
    return fs.existsSync(f) ? r.fulfill({ path: f.pathname, contentType: 'application/json' }) : r.fulfill({ status: 404 });
  });
  await ctx.route(/\/assets\/ai\/sandtable\/regions\/index\.json$/, (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ east: { lon: [125.0, 132.4], lat: [20.0, 43.0] } }) }));
};
// The pack served, and every request under the regions' folder (by path from it) put in `seen`, from before the game boots.
const serveWatched = (seen, how = serve) => async (ctx) => { await how(ctx); ctx.on('request', (q) => { const m = q.url().match(/\/sandtable\/regions\/(.+)$/); if (m) seen.push(m[1]); }); };
// japan (docs/战略地图日本地块_方案_2026-11-17.md) opens two boards together: the north strip and the east of the table to 146°E, 46°N.
// Its test pack (tools/fixtures/packs/test-japan) has eight towns: 江户 京都 仙台 札幌 博多 汉城 哈尔滨 on japan, 锡林郭勒 on the north strip.
const JFIX = new URL('../tools/fixtures/packs/test-japan/', import.meta.url);
const JAPAN = { japan: { boards: { north: { lon: [97.5, 125.0], lat: [43.0, 46.0] }, japan: { lon: [125.0, 146.0], lat: [20.0, 46.0] } } }, east: { lon: [125.0, 132.4], lat: [20.0, 43.0] } };
const serveJapan = async (ctx) => {
  await ctx.route(/\/mods\/test-japan\/[a-z]+\.json$/, (r) => {
    const f = new URL(r.request().url().split('/').pop(), JFIX);
    return fs.existsSync(f) ? r.fulfill({ path: f.pathname, contentType: 'application/json' }) : r.fulfill({ status: 404 });
  });
  await ctx.route(/\/assets\/ai\/sandtable\/regions\/index\.json$/, (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(JAPAN) }));
};

// The sea's materials (sandtable.js waterMat): which map their depth reads, 'joint' (the boards' maps joined, sandregions.js
// jointShelf) or 'own' (the board's sea.png), and the joint map's uuid. A far line down the Yellow Sea where each board read its own.
const seaShelves = (page) => page.evaluate(() => {
  const out = new Map(); window.__game.strategy.scene.traverse((o) => { const m = o.material; if (m?.userData?.shelf) out.set(m.uuid, [m.userData.shelf, m.userData.shelfMap ?? null]); });
  return [...out.values()];
});

let game;
before(async () => { game = await startGame(); });
after(() => game?.close());

const everyCityShown = (page) => page.evaluate(async () => {
  const { g, strategy } = window.__game, out = [];
  for (const c of g.cities) {
    strategy.focusCity(c.id);
    await new Promise((r) => setTimeout(r, 400));
    const p = strategy.screenOfCity(c.id);
    if (!(p && Number.isFinite(p.x) && p.x > 0 && p.y > 0 && p.x < innerWidth && p.y < innerHeight)) out.push(c.id);
  }
  return out;
});

test('without a pack, nothing of any region is fetched, in 3D or 2D', async () => {
  for (const q of ['&pack=none', '&pack=none&flat']) {
    let seen;
    const page = await game.open(q, { setup: (ctx) => { seen = []; ctx.on('request', (r) => { if (/\/sandtable\/regions\//.test(r.url())) seen.push(r.url()); }); } });
    await newCampaign(page, '刘备');
    assert.deepEqual(seen, [], q);
    assert.equal(await page.evaluate(() => window.__game.strategy.world?.boards ?? null), null, q);
    if (!q.includes('flat')) { const sh = await seaShelves(page); assert.ok(sh.length >= 1 && sh.every(([k, map]) => k === 'own' && map === null), JSON.stringify(sh)); }
    assert.deepEqual(page.errors, []);
  }
});

test('3D: the region\'s towns stand on its own board, one frame goes round both boards, the whole strip shows clear, and its land takes its owners\' tint', async () => {
  const seen = [], page = await game.open('&pack=test-region', { setup: serveWatched(seen) });
  await newCampaign(page, '刘备');
  const r = await page.evaluate(() => {
    const { g, strategy: { world } } = window.__game;
    const towns = [30, 31, 32].map((id) => { const c = world.cities.find((w) => w.id === id); return { id, name: c.name, away: !!c.away, high: c.y > world.sea, onRegion: c.x > world.boards[1].box[0] }; });
    const frame = []; window.__game.strategy.scene.traverse((o) => { if (o.geometry?.type === 'BoxGeometry' && o.userData.mainFrame != null) frame.push(o.userData.mainFrame); });
    return { cities: g.cities.length, boards: world.boards.length, towns, frame: frame.length, mainRuns: frame.filter(Boolean).length,
      sea: world.heightAt(12.4, -2) < world.sea, land: world.heightAt(world.cities[30].x, world.cities[30].z) > world.sea,
      // No fog: no ground carries it, and the strip's trees stand in Korea far from any town (north of 元山, lat 39.5–42).
      fog: (() => { let n = 0; window.__game.strategy.scene.traverse((o) => { if (o.geometry?.attributes?.landFog) n++; }); return n; })(),
      northTrees: (() => { let n = 0; window.__game.strategy.scene.traverse((o) => { if (o.isInstancedMesh && /^tree/.test(o.userData.sandKind ?? '') && o.userData.sandLod === 'near') { const e = o.instanceMatrix.array; for (let i = 0; i < o.count; i++) { const x = e[i * 16 + 12], z = e[i * 16 + 14]; if (x > 13.95 && x < 16.2 && z > -10.5 && z < -8) n++; } } }); return n; })() };
  });
  assert.equal(r.cities, 33);
  assert.equal(r.boards, 2);
  assert.deepEqual(r.towns.map((t) => [t.name, t.away, t.high, t.onRegion]), [['福冈', false, true, true], ['宫崎', false, true, true], ['济州', false, true, true]]);
  // One rectangle: north, south and west run on from the original's own sides; the east side is the strip's.
  assert.equal(r.frame, 4, JSON.stringify(r)); assert.equal(r.mainRuns, 3, JSON.stringify(r));
  assert.ok(r.sea && r.land, JSON.stringify(r));
  assert.ok(r.fog === 0 && r.northTrees > 0, JSON.stringify(r)); // the woods there are thin; under the old fog there were none
  assert.ok(['board.json', 'albedo.webp', 'light.webp', 'height.bin'].every((f) => seen.includes(`east/${f}`)), seen.join(' '));
  assert.deepEqual(await everyCityShown(page), []);
  // Owners: 福冈 the player's, 济州 another house's; the tint field gives each its own land on the region's board.
  const tint = await page.evaluate(() => {
    const { g, strategy: s } = window.__game, w = s.world;
    g.cities[30].faction = g.player; g.cities[32].faction = 1; s.refresh(g); s.territory(true);
    return [30, 32].map((id) => w.tintAt(w.cities[id].x + 0.2, w.cities[id].z).near);
  });
  assert.deepEqual(tint, [30, 32]);
  assert.deepEqual(page.errors, []);
});

test('2D: the region\'s pictures lie beside the original\'s, with a tag and a seat for every town', async () => {
  const seen = [], page = await game.open('&flat&pack=test-region', { setup: serveWatched(seen) });
  await newCampaign(page, '刘备');
  assert.equal(await page.evaluate(() => document.querySelectorAll('.flatstrategy .labels .ctag').length), 33);
  assert.ok(seen.some((f) => /^east\/flat-(spring|summer|autumn|winter)\.webp$/.test(f)) && seen.includes('east/flat.json'), seen.join(' '));
  assert.deepEqual(await everyCityShown(page), []);
  // The towns on the region stand right of the original pictures' board.
  const xs = await page.evaluate(() => { const s = window.__game.strategy; s.zoom(99999); return [20, 30, 31, 32].map((id) => s.screenAtRest(id).x); });
  assert.ok(xs.slice(1).every((x) => x > xs[0]), JSON.stringify(xs));
  assert.deepEqual(page.errors, []);
});

test('3D japan: two boards join the original in one rectangle, every town stands on its board, the seams are eased', async () => {
  const seen = [], page = await game.open('&pack=test-japan', { setup: serveWatched(seen, serveJapan) });
  await newCampaign(page, '刘备');
  const r = await page.evaluate(() => {
    const { g, strategy: { world, scene } } = window.__game, inB = (b, c) => c.x >= b.box[0] - 0.05 && c.x <= b.box[1] && c.z >= b.box[2] && c.z <= b.box[3];
    const towns = g.cities.slice(30).map((c0) => { const c = world.cities.find((w) => w.id === c0.id); return [c.name, world.boards.find((b) => inB(b, c))?.name ?? 'base', c.y > world.sea]; });
    const frame = []; scene.traverse((o) => { if (o.geometry?.type === 'BoxGeometry' && o.userData.mainFrame != null) frame.push(o.userData.mainFrame); });
    const [n, j] = [world.boards[1], world.boards[2]], step = (b, x, z) => Math.abs(b.heightAt(x, z) - world.boards[0].heightAt(x, z));
    let worst = 0; for (let x = -12.3; x < 12; x += 0.5) worst = Math.max(worst, step(n, x, -11.5));
    for (let z = -11.3; z < 11.3; z += 0.5) worst = Math.max(worst, step(j, 12.12, z));
    let cross = 0; for (let z = -14.4; z < -11.6; z += 0.2) cross = Math.max(cross, Math.abs(j.heightAt(12.12, z) - n.heightAt(12.12, z)));
    return { cities: g.cities.length, names: world.boards.map((b) => b.name ?? 'base'), box: world.box, towns, frame: frame.length, mainRuns: frame.filter(Boolean).length, worst, cross };
  });
  assert.equal(r.cities, 38);
  assert.deepEqual(r.names, ['base', 'north', 'japan']);
  assert.deepEqual(r.box.map((v) => Math.round(v * 100) / 100), [-12.6, 31.05, -14.5, 11.5]);
  assert.deepEqual(r.towns, [['江户', 'japan', true], ['京都', 'japan', true], ['仙台', 'japan', true], ['札幌', 'japan', true], ['博多', 'japan', true], ['汉城', 'japan', true], ['哈尔滨', 'japan', true], ['锡林郭勒', 'north', true]]);
  // One rectangle: the west and south sides run on from the original's own; north and east are the new boards'.
  assert.equal(r.frame, 4, JSON.stringify(r)); assert.equal(r.mainRuns, 2, JSON.stringify(r));
  assert.ok(r.worst < 1e-3 && r.cross < 1e-3, JSON.stringify(r));
  // Every board's sea reads its depth from the one joint map (docs/战略地图海面拼缝_修复指南_2026-11-21.md).
  const sh = await seaShelves(page);
  assert.ok(sh.length >= 3 && sh.every(([k]) => k === 'joint') && new Set(sh.map(([, map]) => map)).size === 1 && sh[0][1], JSON.stringify(sh));
  // east lies inside japan's box: a pack naming japan loads north and japan and never east.
  assert.ok(['north', 'japan'].every((b) => ['board.json', 'albedo.webp', 'light.webp', 'height.bin'].every((f) => seen.includes(`${b}/${f}`))), seen.join(' '));
  assert.ok(!seen.some((f) => f.startsWith('east/')), seen.join(' '));
  assert.deepEqual(await everyCityShown(page), []);
  const tint = await page.evaluate(() => {
    const { g, strategy: s } = window.__game, w = s.world;
    g.cities[33].faction = g.player; g.cities[37].faction = 1; s.refresh(g); s.territory(true);
    return [33, 37].map((id) => { const c = w.cities.find((t) => t.id === id); return w.tintAt(c.x + 0.2, c.z).near; });
  });
  assert.deepEqual(tint, [33, 37]);
  assert.deepEqual(page.errors, []);
});

test('2D japan: each board\'s pictures lie beside the original\'s, with a tag and a seat for every town', async () => {
  const seen = [], page = await game.open('&flat&pack=test-japan', { setup: serveWatched(seen, serveJapan) });
  await newCampaign(page, '刘备');
  assert.equal(await page.evaluate(() => document.querySelectorAll('.flatstrategy .labels .ctag').length), 38);
  for (const b of ['north', 'japan']) assert.ok(seen.some((f) => new RegExp(`^${b}/flat-(spring|summer|autumn|winter)\\.webp$`).test(f)) && seen.includes(`${b}/flat.json`), seen.join(' '));
  assert.deepEqual(await everyCityShown(page), []);
  // 札幌 right of 辽东, 锡林郭勒 above 幽州 (north is up on the map).
  const p = await page.evaluate(() => { const s = window.__game.strategy; s.zoom(99999); return [0, 1, 33, 37].map((id) => s.screenAtRest(id)); });
  assert.ok(p[2].x > p[0].x && p[3].y < p[1].y, JSON.stringify(p));
  assert.deepEqual(page.errors, []);
});
