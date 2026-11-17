// A data pack on the 战略地图 (docs/战略地图数据包扩展设计_2026-11-17.md, 第 2 期): the test pack (tools/fixtures/packs/test-faction,
// served as mods/test-faction) adds three towns, six roads and a ninth house, 越. Its towns stand on the 3D sand table and the 2D
// map, its house can be played, a war on a new town is fought on the borrowed battlefield, and its records keep to their own slots.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startGame, newCampaign, skipIntro } from './game.mjs';

const FIX = new URL('../tools/fixtures/packs/test-faction/', import.meta.url);
const servePack = (ctx) => ctx.route(/\/mods\/test-faction\/[a-z]+\.json$/, (r) => {
  const f = new URL(r.request().url().split('/').pop(), FIX);
  return fs.existsSync(f) ? r.fulfill({ path: f.pathname, contentType: 'application/json' }) : r.fulfill({ status: 404 });
});

let game;
before(async () => { game = await startGame(); });
after(() => game?.close());

// Every city on screen once the view is brought to it, at a finite place.
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

test('the sand table: 越 is played, its towns stand on the board and its land is tinted', async () => {
  const page = await game.open('&pack=test-faction', { setup: servePack });
  await newCampaign(page, '勾践');
  const r = await page.evaluate(() => {
    const { g, G } = window.__game;
    return { cities: g.cities.length, player: g.player, pack: g.pack, home: G.cityName(g.factions[g.player].city), mine: g.cities.filter((c) => c.faction === 8).length };
  });
  assert.deepEqual(r, { cities: 33, player: 8, pack: { id: 'test-faction', version: '1.2.0' }, home: '会稽', mine: 3 });
  assert.deepEqual(await everyCityShown(page), []);
  assert.deepEqual(page.errors, []);
});

test('the 2D map: a tag and a seat for every city, the new ones included', async () => {
  const page = await game.open('&flat&pack=test-faction', { setup: servePack });
  await newCampaign(page, '刘备');
  const tags = await page.evaluate(() => document.querySelectorAll('.flatstrategy .labels .ctag').length);
  assert.equal(tags, 33);
  assert.deepEqual(await everyCityShown(page), []);
  assert.deepEqual(page.errors, []);
});

test('a war on a new town is fought on the battlefield it borrows', async () => {
  const page = await game.open('&pack=test-faction', { setup: servePack });
  await page.evaluate(async () => { (await import('./src/pace.js')).setPace(4); (await import('./src/vignette.js')).setVignettes(false); });
  await newCampaign(page, '孙策');
  const war = await page.evaluate(() => {
    const { g, G, debug } = window.__game, to = 30; // 会稽, held by 越, on the road from 建业
    const home = g.cities.find((c) => c.faction === g.player && c.officers.length && G.roads(c.id).includes(to))?.id;
    if (home == null) return { road: false };
    for (const id of [...g.cities[home].officers, ...g.cities[to].officers]) g.officers[id].soldiers ||= 500;
    const ids = g.cities[home].officers.slice(0, 3);
    debug.fieldWar(debug.setupWar(g, { from: home, to, ids, commander: ids[0], gold: 100, rice: 400 }), 'att');
    return { road: true, field: G.cityName(G.fieldArtOf(to)) };
  });
  assert.deepEqual(war, { road: true, field: '建安' });
  await page.waitForFunction(() => window.__game.war?.finishDeploy && document.body.dataset.screen === 'war', null, { timeout: 30000 });
  const f = await page.evaluate(() => {
    const { war, G } = window.__game, f = war.field, D = G.data(), like = D.cities[30].like;
    return { city: f.war.city, map: JSON.stringify(f.map) === JSON.stringify(D.maps[like]), att: f.units.filter((u) => u.side === 'att').length, def: f.units.filter((u) => u.side === 'def').length };
  });
  assert.equal(f.city, 30);
  assert.ok(f.map, 'the war map is 建安\'s');
  assert.ok(f.att > 0 && f.def > 0, JSON.stringify(f));
  assert.deepEqual(page.errors, []);
});

test('a pack\'s record keeps to its own slots, and loads back on the pack only', async () => {
  const page = await game.open('&pack=test-faction', { setup: servePack });
  await newCampaign(page, '勾践');
  const saved = await page.evaluate(() => { const { g, G } = window.__game; G.save(g, 1); return Object.keys(localStorage).filter((k) => k.startsWith('haou-hd2d-save')); });
  assert.deepEqual(saved, ['haou-hd2d-save@test-faction:1']);
  const record = await page.evaluate(() => localStorage.getItem('haou-hd2d-save@test-faction:1'));
  const seed = (ctx) => ctx.addInitScript((s) => localStorage.setItem('haou-hd2d-save@test-faction:1', s), record);

  // The base game sees no record.
  const base = await game.open('&pack=none', { setup: seed });
  await skipIntro(base);
  assert.equal(await base.getByText('继续记录').count(), 0);

  // The pack continues it, on 越's turn with the three towns.
  const back = await game.open('&pack=test-faction', { setup: async (ctx) => { await servePack(ctx); await seed(ctx); } });
  await skipIntro(back);
  await back.getByText('继续记录').click();
  await back.waitForFunction(() => document.body.dataset.screen === 'strategy' && window.__game.g?.current === window.__game.g.player, null, { timeout: 60000 });
  assert.deepEqual(await back.evaluate(() => { const g = window.__game.g; return [g.player, g.cities.length, g.pack.id]; }), [8, 33, 'test-faction']);
  assert.deepEqual([...base.errors, ...back.errors], []);
});
