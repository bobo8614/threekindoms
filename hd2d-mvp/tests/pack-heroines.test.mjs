// A data pack's women generals (core/pack.js HEROINE_LOOKS): "look": "f-sword" on a new officer dresses her in that look's 白兵
// sprite, 单挑 strips and war-map march strip, her portrait and rules staying her `like` officer's. The pictures ship with the
// open-source repository only: in a release package (no sprites/heroines.json) she fights in the `like` officer's look, quietly.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startGame, newCampaign } from './game.mjs';

// The sprite files a scene draws from, by folder: duel/<key>, march/<key>, officers/<key>.
const drawn = (page, scene) => page.evaluate((scene) => {
  const seen = new Set(), root = scene === 'war' ? window.__game.war.scene : window.__game.tview.scene;
  root.traverse((o) => { const m = o.material?.map?.image?.src?.match(/sprites\/((?:duel|march|officers)\/[a-z0-9-]+)\.png$/); if (m) seen.add(m[1]); });
  return [...seen].sort();
}, scene);
const pickFormation = async (page) => {
  await page.waitForSelector('.tq-form', { timeout: 60000 });
  await page.locator('.tq-form').first().click(); await page.locator('.tq-deploy:not(.arming)').click();
  await page.waitForSelector('.tq-start button', { timeout: 30000 });
};

const dir = new URL('../tools/fixtures/packs/test-heroines/', import.meta.url);
const servePack = async (ctx) => {
  await ctx.route(/\/mods\/test-heroines\/[a-z]+\.json$/, (r) => {
    const f = new URL(r.request().url().split('/').pop(), dir);
    return fs.existsSync(f) ? r.fulfill({ path: f.pathname, contentType: 'application/json' }) : r.fulfill({ status: 404 });
  });
};
// As a release package: the list of looks is not there.
const released = async (ctx) => { await servePack(ctx); await ctx.route(/\/sprites\/heroines\.json$/, (r) => r.fulfill({ status: 404 })); };

let game;
before(async () => { game = await startGame(); });
after(() => game?.close());

// 越女 (look f-sword, like 甘宁) attacks 文丑 (191) on open ground.
async function fight(setup) {
  const page = await game.open('&pack=test-heroines', { setup });
  await newCampaign(page, '刘备');
  const art = await page.evaluate(() => {
    const { g, G } = window.__game, her = g.cities[30].officers.find((id) => G.name(id) === '越女');
    window.__game.debug.quickTactical(her, 191, 2, { human: 'a' });
    return String(G.artOf(her));
  });
  await pickFormation(page);
  return { page, art, strips: await drawn(page, 'tactical') };
}

test('a pack officer with a woman-general look fights in it in the 白兵; the foe in his own', async () => {
  const { page, strips } = await fight(servePack);
  assert.ok(strips.includes('duel/f-sword-turn') || strips.includes('duel/f-sword'), strips.join(' '));
  assert.ok(strips.some((s) => /^duel\/191(-|$)/.test(s)), `文丑: ${strips.join(' ')}`);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('without the looks (a release package) she fights in her like officer\'s look, with nothing said', async () => {
  const { page, strips, art } = await fight(released);
  assert.ok(strips.every((s) => !/\/f-/.test(s)), strips.join(' '));
  assert.ok(strips.some((s) => s.startsWith(`duel/${art}`)), `甘宁 (${art}): ${strips.join(' ')}`);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

// The war map: 越 marches from 会稽 on 建业 with 越女 and 西施; each rides in her own look's march strip.
test('on the war map the women generals ride in their own march strips', async () => {
  const page = await game.open('&pack=test-heroines', { setup: servePack });
  await page.evaluate(async () => { (await import('./src/pace.js')).setPace(4); (await import('./src/vignette.js')).setVignettes(false); });
  await newCampaign(page, '勾践');
  await page.evaluate(() => {
    const { g, G, debug } = window.__game, home = 30, to = g.cities.findIndex((c, i) => G.cityName(i) === '建业');
    for (const id of [...g.cities[home].officers, ...g.cities[to].officers]) g.officers[id].soldiers ||= 500;
    const ids = g.cities[home].officers.slice(0, 3);
    debug.fieldWar(debug.setupWar(g, { from: home, to, ids, commander: ids[0], gold: 100, rice: 400 }), 'att');
  });
  await page.waitForFunction(() => window.__game.war?.finishDeploy && document.body.dataset.screen === 'war', null, { timeout: 30000 });
  const strips = await drawn(page, 'war');
  assert.ok(strips.includes('march/f-sword') && strips.includes('march/f-spear'), strips.join(' '));
  assert.deepEqual(page.errors, []);
  await page.context().close();
});
