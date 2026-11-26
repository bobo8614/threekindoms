// A data pack's troop looks (docs/扩展兵种_方案_2026-11-24.md): "troops": { "soldier": "ashigaru", "cavalry": "steppe" } on a
// new faction dresses its squads in the 白兵 as 足轻 and 铁骑, the rules staying those of the kinds they dress. The strips ship
// with the open-source repository only: in a release package (no troops/looks.json) the squads wear the original kinds, quietly.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startGame, newCampaign } from './game.mjs';

const drawn = (page) => page.evaluate(() => {
  const seen = new Set();
  window.__game.tview.scene.traverse((o) => { const m = o.material?.map?.image?.src?.match(/sprites\/troops\/([a-z0-9-]+)\.png$/); if (m) seen.add(m[1]); });
  return [...seen].sort();
});
const pickFormation = async (page) => {
  await page.waitForSelector('.tq-form', { timeout: 60000 });
  await page.locator('.tq-form').first().click(); await page.locator('.tq-deploy:not(.arming)').click();
  await page.waitForSelector('.tq-start button', { timeout: 30000 });
};

const dir = new URL('../tools/fixtures/packs/test-troops/', import.meta.url);
const servePack = async (ctx) => {
  await ctx.route(/\/mods\/test-troops\/[a-z]+\.json$/, (r) => {
    const f = new URL(r.request().url().split('/').pop(), dir);
    return fs.existsSync(f) ? r.fulfill({ path: f.pathname, contentType: 'application/json' }) : r.fulfill({ status: 404 });
  });
};
// As a release package: the list of looks is not there.
const released = async (ctx) => { await servePack(ctx); await ctx.route(/\/sprites\/troops\/looks\.json$/, (r) => r.fulfill({ status: 404 })); };

let game;
before(async () => { game = await startGame(); });
after(() => game?.close());

// 勾践 of 越 (the pack's house, troops 足轻 and 铁骑) attacks 文丑 (191, an original house) on open ground; the strips each
// side's men are drawn from, once the formation is picked.
async function fight(setup, att = '勾践', def = 191) {
  const page = await game.open('&pack=test-troops', { setup });
  await newCampaign(page, '刘备');
  await page.evaluate(([att, def]) => {
    const { g, G } = window.__game, who = (n) => (typeof n === 'number' ? n : g.officers.findIndex((_, id) => G.name(id) === n));
    window.__game.debug.quickTactical(who(att), who(def), 2, { human: 'a' });
  }, [att, def]);
  await pickFormation(page);
  const strips = await drawn(page);
  return { page, strips };
}

test("the pack's house fights in its own troop looks; the other side in the original kinds", async () => {
  const { page, strips } = await fight(servePack);
  const mine = strips.filter((s) => s.startsWith('attacker-')), theirs = strips.filter((s) => s.startsWith('defender-'));
  assert.ok(mine.length && theirs.length, strips.join(' '));
  assert.ok(mine.every((s) => /-(ashigaru|steppe|archer)(-v2)?(-turn)?$/.test(s)), `越: ${mine.join(' ')}`);
  assert.ok(mine.some((s) => /ashigaru|steppe/.test(s)), `越: ${mine.join(' ')}`);
  assert.ok(theirs.every((s) => /-(soldier|archer|cavalry)(-v2)?(-turn)?$/.test(s)), `文丑: ${theirs.join(' ')}`);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

// officers.json troops: 范蠡 of 越 (山岳蛮兵 over his house's 足轻; his 铁骑 from the house) against 关羽 of 刘备, an original
// officer of an original house the pack dressed as 山岳蛮兵 and 战象: the looks go with the officer, not with a pack house.
test("an officer's own troop looks, over his house's or in an original house", async () => {
  const { page, strips } = await fight(servePack, '范蠡', '关羽');
  const mine = strips.filter((s) => s.startsWith('attacker-')), theirs = strips.filter((s) => s.startsWith('defender-'));
  assert.ok(mine.length && theirs.length, strips.join(' '));
  assert.ok(mine.every((s) => /-(hillman|steppe|archer)(-v2)?(-turn)?$/.test(s)) && mine.some((s) => /hillman/.test(s)), `范蠡: ${mine.join(' ')}`);
  assert.ok(theirs.every((s) => /-(hillman|elephant|archer)(-v2)?(-turn)?$/.test(s)) && theirs.some((s) => /hillman|elephant/.test(s)), `关羽: ${theirs.join(' ')}`);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('without the looks (a release package) the squads wear the original kinds, with nothing said', async () => {
  const { page, strips } = await fight(released);
  assert.ok(strips.length, 'troop strips drawn');
  assert.ok(strips.every((s) => /-(soldier|archer|cavalry)(-v2)?(-turn)?$/.test(s)), strips.join(' '));
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

// The way a player gets there: 越 marches from 会稽 on 建业 and its first squad attacks, so the 白兵 is cut in from the war map
// (app.js cutIn, which reads the looks of the war's two houses).
test('from the war map, the cut-in dresses the pack house as well', async () => {
  const page = await game.open('&pack=test-troops', { setup: servePack });
  await page.evaluate(async () => { (await import('./src/pace.js')).setPace(4); (await import('./src/vignette.js')).setVignettes(false); });
  await newCampaign(page, '勾践');
  await page.evaluate(() => {
    const { g, G, debug } = window.__game, home = 30, to = g.cities.findIndex((c, i) => G.cityName(i) === '建业');
    for (const id of [...g.cities[home].officers, ...g.cities[to].officers]) g.officers[id].soldiers ||= 500;
    const ids = g.cities[home].officers.slice(0, 3);
    debug.fieldWar(debug.setupWar(g, { from: home, to, ids, commander: ids[0], gold: 100, rice: 400 }), 'att');
  });
  await page.waitForFunction(() => window.__game.war?.finishDeploy && document.body.dataset.screen === 'war', null, { timeout: 30000 });
  await page.evaluate(() => {
    const f = window.__game.war.field, a = f.side('att')[0], d = f.alive.find((u) => u.side === 'def');
    window.__game.debug.cutIn(f, a, d, f.attack(a, d), f.terr(d.x, d.y));
  });
  await pickFormation(page);
  const strips = await drawn(page), mine = strips.filter((s) => s.startsWith('attacker-'));
  assert.ok(mine.some((s) => /ashigaru|steppe/.test(s)), strips.join(' '));
  assert.ok(mine.every((s) => !/-(soldier|cavalry)(-v2)?(-turn)?$/.test(s)), `越: ${mine.join(' ')}`);
  assert.ok(strips.filter((s) => s.startsWith('defender-')).every((s) => /-(soldier|archer|cavalry)(-v2)?(-turn)?$/.test(s)), strips.join(' '));
  assert.deepEqual(page.errors, []);
  await page.context().close();
});
