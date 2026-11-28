// D40: a report must describe settlement, not just survival on the battlefield.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as G from '../src/core/game.js';
import { Field } from '../src/core/field.js';
import { setupWar, resolveWar } from '../src/core/warcore.js';
import { warFate } from '../src/warreport.js';
G.setData(JSON.parse(readFileSync(new URL('../data/game-data.json', import.meta.url))));

function battle(side = 'def', { fire = false } = {}) {
  const g = G.newGame(2, 1, 1), ruler = g.factions[2].ruler;
  const general = g.cities.flatMap(c => c.officers).find(id => id !== ruler && !G.isRuler(g, id));
  const enemy = g.factions[1].ruler;
  for (const c of g.cities) { c.faction = 1; c.officers = []; }
  const from = 12, to = 14;
  g.cities[from].faction = side === 'att' ? 2 : 1;
  g.cities[from].officers = side === 'att' ? [ruler, general] : [enemy];
  g.cities[to].faction = side === 'def' ? 2 : 1;
  g.cities[to].officers = side === 'def' ? [ruler, general] : [enemy];
  g.cities[to].rice = 500;
  for (const id of [ruler, general, enemy]) { g.officers[id].status = G.SERVING; g.officers[id].soldiers = 500; }
  const ids = [...g.cities[from].officers];
  const war = setupWar(g, { from, to, ids, commander: ids[0], gold: 50, rice: 500 });
  // No neutral source city to escape to, even for an attacker.
  g.cities[from].faction = 1;
  const field = new Field(g, war, side);
  field.chest(side).rice = fire ? 5 : 0;
  if (fire) {
    const caster = field.side(side === 'att' ? 'def' : 'att')[0], target = field.side(side)[0];
    caster.x = target.x + 1; caster.y = target.y;
    // Controlled successful 火箭 through the real effect, with the seeded RNG (AI admission skips player menus).
    let hit = false;
    for (let i = 0; i < 100 && !hit; i++) hit = field.cast(caster, 5, target, true).hit;
    assert.ok(hit); assert.equal(field.chest(side).rice, 0);
  }
  field.turn = 'def'; field.endTurn();
  assert.deepEqual(field.over, { loser: side, why: 'rice' });
  return { g, war, res: field.result(), ruler, general, enemy };
}
const settle = (b) => resolveWar(b.g, b.war, b.res);
const fate = (b, id) => warFate(b.g, b.war, b.res, id)[0];

for (const side of ['att', 'def']) test(`${side}: no escape reports the ruler's death and the general's ronin location before faction events`, async () => {
  const b = battle(side); settle(b);
  const before = JSON.stringify(b.g);
  assert.match(fate(b, b.ruler), /无路可退.*身亡/);
  assert.equal(warFate(b.g, b.war, b.res, b.ruler)[2], true, 'the ledger must not show surviving troops for a dead ruler');
  assert.match(fate(b, b.general), /下野.*豫州/);
  assert.equal(JSON.stringify(b.g), before, 'reading the report changes no rules or random draws');
  await G.checkFactions(b.g, { event: async () => {}, chooseHeir: async (_, ids) => ids[0] });
  assert.equal(b.g.officers[b.ruler].status, G.DEAD);
  assert.equal(b.g.officers[b.general].status, G.RONIN);
});

test('an automatic retreat reports the actual destination', () => {
  const b = battle(), dest = G.roads(b.war.city)[0];
  b.g.cities[dest].faction = 2; settle(b);
  assert.equal(fate(b, b.ruler), `退往${G.cityName(dest)}`);
  assert.equal(fate(b, b.general), `退往${G.cityName(dest)}`);
});

test('manual ronin placement overrides the earlier battlefield survival', () => {
  const b = battle(), dest = G.roads(b.war.city)[0];
  b.g.cities[dest].faction = 2;
  b.res.placementSide = 'def'; b.res.placement = { [b.ruler]: dest, [b.general]: 'ronin' }; settle(b);
  assert.match(fate(b, b.general), /下野/);
  assert.ok(fate(b, b.general).includes(G.cityName(b.g.officers[b.general].loc)));
});

test('a captured officer released during placement is reported as ronin, not newly serving', () => {
  const b = battle();
  b.res.survivors.def = [b.ruler]; b.res.captured.byAtt = [b.general];
  b.res.placementSide = 'att'; b.res.placement = { [b.general]: 'ronin' }; settle(b);
  assert.match(fate(b, b.general), /下野/);
});

test('a walked retreat that overflows reports final ronin placement', () => {
  const b = battle(), dest = G.roads(b.war.city)[0];
  b.g.cities[dest].faction = 2; b.g.cities[dest].officers = Array(10).fill(b.enemy);
  b.res.retreated = [{ id: b.general, city: dest }]; settle(b);
  assert.match(fate(b, b.general), /下野/);
});

test('battle death, capture with room and winner survival keep distinct labels', () => {
  const b = battle(); b.res.survivors.def = []; b.res.dead = [b.ruler]; b.res.captured.byAtt = [b.general]; settle(b);
  assert.equal(fate(b, b.ruler), '阵亡');
  assert.match(fate(b, b.general), /被俘归顺/);
  assert.equal(fate(b, b.enemy), '生还');
});

test('a ruler without escape may still have an heir elsewhere; the report does not start succession', async () => {
  const b = battle(), heir = 16;
  b.g.cities[0].faction = 2; b.g.cities[0].officers = [heir]; b.g.officers[heir].status = G.SERVING;
  settle(b);
  assert.match(fate(b, b.ruler), /身亡/);
  assert.equal(b.g.factions[2].ruler, b.ruler);
  const events = [];
  await G.checkFactions(b.g, { event: async e => events.push(e.type), chooseHeir: async (_, ids) => ids[0] });
  assert.equal(b.g.factions[2].ruler, heir);
  assert.ok(events.includes('heir'));
});

test('fire arrows burn the final five rice: the surviving ruler is not reported as alive after settlement', () => {
  const b = battle('def', { fire: true });
  assert.ok(b.res.survivors.def.includes(b.ruler)); assert.deepEqual(b.res.dead, []);
  settle(b); assert.match(fate(b, b.ruler), /无路可退.*身亡/);
});

test('all friendly retreat cities full is also no escape', () => {
  const b = battle();
  for (const dest of G.roads(b.war.city)) { b.g.cities[dest].faction = 2; b.g.cities[dest].officers = Array(10).fill(b.enemy); }
  settle(b); assert.match(fate(b, b.ruler), /无路可退.*身亡/); assert.match(fate(b, b.general), /下野/);
});
// 武将不战死 (2026-11-26): a ruler with nowhere to go is taken by the winner instead of lost; his officers still 下野.
test('不战死: a ruler with no escape is taken into the winner\'s city', () => {
  const b = battle(); b.g.noWarDeath = true;
  for (const dest of G.roads(b.war.city)) { b.g.cities[dest].faction = 2; b.g.cities[dest].officers = Array(10).fill(b.enemy); }
  settle(b);
  assert.equal(fate(b, b.ruler), `被俘归顺（${G.cityName(b.war.city)}）`); assert.match(fate(b, b.general), /下野/);
  assert.equal(b.g.officers[b.ruler].status, G.SERVING); assert.equal(G.factionOf(b.g, b.ruler), 1);
  assert.equal(b.g.officers[b.ruler].loyalty, G.capturedLoyalty(100));
});

test('a winner placed in another city reports that final city', () => {
  const b = battle(), dest = G.roads(b.war.city)[0];
  b.res.survivors.def = [b.ruler]; b.res.survivors.att.push(b.general);
  b.res.placementSide = 'att'; b.res.placement = { [b.enemy]: b.war.city, [b.general]: dest };
  settle(b); assert.equal(fate(b, b.general), `前往${G.cityName(dest)}`);
});

test('a protected ruler redirected from a full walked-retreat city reports his real destination, not death', () => {
  const b = battle(), full = G.roads(b.war.city)[0];
  b.g.noWarDeath = true;
  b.g.cities[full].faction = 2; b.g.cities[full].officers = Array(10).fill(b.enemy);
  b.g.cities[0].faction = 2;
  b.res.retreated = [{ id: b.ruler, city: full }];
  settle(b);
  assert.equal(fate(b, b.ruler), `退往${G.cityName(0)}`);
  assert.notEqual(warFate(b.g, b.war, b.res, b.ruler)[2], true);
});
