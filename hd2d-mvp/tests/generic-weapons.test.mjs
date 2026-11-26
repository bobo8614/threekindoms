// The generic generals in the weapon they hold (core/pack.js genericArt): an officer without strips of his own rides as his side's
// general with a 剑 (0–7), 刀 (8–15) or 枪 (16–23) — in the 白兵, the 单挑 and on the war map — and a 武器店 purchase of another class
// changes his figure on the spot. Without a set's pictures he keeps the glaive (the 刀 set), quietly.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startGame, newCampaign, closeMessages } from './game.mjs';
import { genericArt } from '../src/core/pack.js';

const MVP = new URL('../', import.meta.url);
const json = (p) => JSON.parse(fs.readFileSync(new URL(p, MVP), 'utf8'));
const D = json('data/game-data.json');
const ARMED = ['attacker-spear', 'attacker-sword', 'defender-spear', 'defender-sword'];
const own = new Set([...json('assets/ai/sprites/officers/index.json').map(String), ...json('assets/ai/sprites/duel/index.json')]);
const plain = D.officers.filter((o) => !own.has(String(o.id))).map((o) => o.id);

test('the weapon groups pick the look: 剑 and 枪 their own sets, 刀 the glaive', () => {
  assert.deepEqual([0, 7, 8, 15, 16, 23].map((w) => genericArt('attacker', w)), ['attacker-sword', 'attacker-sword', 'attacker', 'attacker', 'attacker-spear', 'attacker-spear']);
  assert.equal(genericArt('defender', undefined), 'defender');
});

test('each armed set is whole: every 单挑 strip, its lists, the march strip, and the weapon it is drawn with', () => {
  const lists = Object.fromEntries(['index', 'extra', 'spin', 'leap'].map((k) => [k, json(`assets/ai/sprites/duel/${k}.json`)]));
  const march = json('assets/ai/sprites/march/index.json');
  // slice_duel_frames.py rebuilds index.json from the folder: only side strips, never the sheets beside one, the lists or the women's looks.
  const heroines = new Set(json('assets/ai/sprites/heroines.json'));
  assert.deepEqual(lists.index.filter((k) => /-(turn|wheel|c|spin|leap)$|^(extra|spin|leap)$/.test(k) || heroines.has(k)), []);
  for (const k of ARMED) {
    for (const s of ['', '-turn', '-wheel', '-c', '-spin', '-leap']) for (const ext of ['png', 'json']) assert.ok(fs.existsSync(new URL(`assets/ai/sprites/duel/${k}${s}.${ext}`, MVP)), `duel/${k}${s}.${ext}`);
    for (const [l, have] of Object.entries(lists)) assert.ok(have.includes(k), `${k} in duel/${l}.json`);
    assert.equal(json(`assets/ai/sprites/duel/${k}.json`).weapon, k.split('-')[1], `${k} strikes as its weapon`);
    assert.ok(march.includes(k) && fs.existsSync(new URL(`assets/ai/sprites/march/${k}.png`, MVP)), `march/${k}`);
  }
});

// The sprite files a scene draws from: duel/<key>, march/<key>.
const drawn = (page, scene) => page.evaluate((scene) => {
  const seen = new Set(), { war, tview, debug } = window.__game, root = { war: war?.scene, tactical: tview.scene, duel: debug.duelView.scene }[scene];
  root.traverse((o) => { const m = o.material?.map?.image?.src?.match(/sprites\/((?:duel|march|officers)\/[a-z0-9-]+)\.png$/); if (m) seen.add(m[1]); });
  return [...seen].sort();
}, scene);
const pickFormation = async (page) => {
  await page.waitForSelector('.tq-form', { timeout: 60000 });
  await page.locator('.tq-form').first().click(); await page.locator('.tq-deploy:not(.arming)').click();
  await page.waitForSelector('.tq-start button', { timeout: 30000 });
};

let game;
before(async () => { game = await startGame(); });
after(() => game?.close());

// Two generic officers meet on open ground: the player's (attacker look) with a 枪, the foe (defender look) with a 剑.
async function fight(setup) {
  const page = await game.open('', { setup });
  await newCampaign(page, '刘备');
  await page.evaluate(([a, d]) => {
    const { g, debug } = window.__game; g.officers[a].weapon = 16; g.officers[d].weapon = 2;
    debug.quickTactical(a, d, 2, { human: 'a' });
  }, plain.slice(0, 2));
  await pickFormation(page);
  return page;
}

test('in the 白兵 and the 单挑 a generic officer rides with the weapon he holds', async () => {
  const page = await fight();
  const field = await drawn(page, 'tactical');
  assert.ok(field.some((s) => /^duel\/attacker-spear(-|$)/.test(s)) && field.some((s) => /^duel\/defender-sword(-|$)/.test(s)), field.join(' '));
  assert.ok(!field.some((s) => /^duel\/(attacker|defender)(-turn|-wheel)?$/.test(s)), `no glaive: ${field.join(' ')}`);
  const duel = await page.evaluate(async ([a, d]) => {
    const { debug, G, g } = window.__game, dv = debug.duelView, { Tactical } = await import('./src/core/tactical.js');
    dv.setPlace({ month: 2, city: 12, siege: null }); debug.show('dview');
    await dv.enter(new Tactical(g, a, d, 2, G.rng(g), { human: 'a' }), { a: 'attacker', d: 'defender' });
  }, plain.slice(0, 2)).then(() => drawn(page, 'duel'));
  assert.ok(duel.includes('duel/attacker-spear') && duel.includes('duel/defender-sword'), duel.join(' '));
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('without the armed sets the generic officers keep the glaive, with nothing said', async () => {
  const page = await fight((ctx) => ctx.route(/\/sprites\/(duel|march)\/(attacker|defender)-(spear|sword)[-a-z]*\.(png|json)$/, (r) => r.fulfill({ status: 404 })));
  const field = await drawn(page, 'tactical');
  assert.ok(field.some((s) => /^duel\/attacker(-turn)?$/.test(s)) && field.some((s) => /^duel\/defender(-turn)?$/.test(s)), field.join(' '));
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

// The war map: a generic officer of the player's marches with his glaive, buys a 枪 at the field 武器店 and rides on with it.
test('on the war map a generic officer marches with his weapon and changes it at the 武器店', async () => {
  const c = D.cities.find((x) => (D.villages[x.id] || []).some((v) => v.kind === '武器店') && (x.field_shop || []).some((e) => e >= 16 && e < 24 && e !== 22));
  const spear = c.field_shop.find((e) => e >= 16 && e < 24 && e !== 22); // 22 狼牙枪 wants 武力 90
  const page = await game.open();
  await page.evaluate(async () => { (await import('./src/pace.js')).setPace(4); (await import('./src/vignette.js')).setVignettes(false); });
  await newCampaign(page, '刘备');
  const me = await page.evaluate(([cid, plain]) => {
    const { g, debug } = window.__game, home = g.factions[g.player].city;
    const foe = g.cities.find((x) => x.faction !== g.player && x.faction != null && g.factions[x.faction] && x.officers.length);
    const def = [foe.officers[0]], rulers = new Set(g.factions.map((x) => x?.ruler));
    // 刘备's own men all have figures of their own: a generic officer from elsewhere joins him first.
    let id = g.cities[home].officers.find((i) => plain.includes(i));
    if (id == null) {
      const from = g.cities.find((x) => x.id !== foe.id && x.officers.some((i) => plain.includes(i) && !rulers.has(i)));
      id = from.officers.find((i) => plain.includes(i) && !rulers.has(i));
      from.officers = from.officers.filter((i) => i !== id); g.cities[home].officers.push(id);
    }
    g.officers[id].weapon = 9; g.officers[id].soldiers ||= 500; g.officers[def[0]].soldiers ||= 500;
    debug.fieldWar({ city: cid, from: home, attacker: g.player, defender: foe.faction, day: 1, att: { ids: [id], gold: 2000, rice: 400 }, def: { ids: def, gold: 0, rice: 400 } }, 'att');
    return id;
  }, [c.id, plain]);
  assert.ok(me != null, 'the player has a generic officer at home');
  await page.waitForFunction(() => window.__game.war?.finishDeploy && document.body.dataset.screen === 'war', null, { timeout: 30000 });
  assert.ok((await drawn(page, 'war')).includes('march/attacker'), 'the glaive first');
  const stop = closeMessages(page);
  try {
    await page.locator('.deploybtn .btn', { hasText: '布阵完成' }).click({ timeout: 30000 });
    await page.waitForFunction(() => { const f = window.__game.war.field; return f.turn === f.human && !document.querySelector('.banner, .panel.msg'); }, null, { timeout: 30000 });
  } finally { stop(); }
  const res = await page.evaluate(([id, eq]) => {
    const { war, g } = window.__game, f = war.field, v = f.villages.find((x) => x.kind === '武器店'), u = f.alive.find((x) => x.id === id);
    const there = f.unitAt(v.x, v.y);
    if (there && there !== u) { const free = [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [0, 2]].map(([dx, dy]) => [v.x + dx, v.y + dy]).find(([x, y]) => f.inside(x, y) && !f.unitAt(x, y)); [there.x, there.y] = free; }
    [u.x, u.y] = [v.x, v.y]; war.shop(u, eq);
    return g.officers[id].weapon;
  }, [me, spear]);
  assert.equal(res, spear, 'the 枪 is bought');
  const after = await drawn(page, 'war');
  assert.ok(after.includes('march/attacker-spear'), after.join(' '));
  assert.deepEqual(page.errors, []);
  await page.context().close();
});
