import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TIERS, tier, searchOdds, extraPoints, sourceExtra, giveDrop, keepDrop, devK, aiRecruitLoyalty } from '../src/core/warlike.js';

test('tier is null when off and follows g.level when on', () => {
  assert.equal(tier({ level: 2 }), null);
  assert.equal(tier({ warlike: true, level: 1 }), TIERS[1]);
});
test('off returns the original constants', () => {
  const g = { level: 2 };
  assert.deepEqual(searchOdds(g), { search: 10, miss: 10, ronin: 10, roninMiss: 10 });
  assert.equal(sourceExtra(g), 3); assert.equal(giveDrop(g), 0); assert.equal(keepDrop(g), 0);
  assert.equal(extraPoints(g), 0); assert.equal(devK(g, 18), 18); assert.equal(aiRecruitLoyalty(g, 88), 88);
});
test('上级 tier values', () => {
  const g = { warlike: true, level: 2 };
  assert.equal(sourceExtra(g), 2); assert.equal(extraPoints(g), 10); assert.equal(devK(g, 18), 22);
  assert.equal(aiRecruitLoyalty(g, 88), 95); assert.equal(aiRecruitLoyalty(g, 60), 70);
  assert.equal(aiRecruitLoyalty({ warlike: true, level: 1 }, 88), 88);
});

// ---- Task 2: talent search and ronin recruiting by tier (C5D2 / C6CC) ----
import { readFileSync } from 'node:fs';
import * as G from '../src/core/game.js';
import { housekeeping } from '../src/core/ai.js';
const D2 = JSON.parse(readFileSync(new URL('../data/game-data.json', import.meta.url)));
G.setData(D2);
const oid = (n) => D2.officers.findIndex((o) => o.name === n);
// 荆州 in 194 for a faction that does not favour 徐庶; 伊籍/周仓 already out, so 徐庶 heads the queue.
function searchWith(opt, draws) {
  const g = G.newGame(4, opt.level, 1), jing = D2.cities.find((c) => c.name === '荆州').id;
  g.warlike = !!opt.warlike;
  const f = g.factions.findIndex((x, i) => i !== g.player && x && !(D2.rules.search_preference[String(i)] || []).includes(oid('徐庶')));
  for (const c of g.cities) if (c.faction === f) c.faction = G.NONE;
  const c = g.cities[jing]; c.faction = f; c.officers = c.officers.slice(0, 3);
  g.year = 194;
  for (const n of ['伊籍', '周仓']) g.officers[oid(n)].status = G.SERVING;
  for (const n of ['徐庶', '诸葛亮']) g.officers[oid(n)].status = G.UNAPPEARED;
  const r = () => (draws.length ? draws.shift() : 99);
  housekeeping(g, f, r, () => true);
  return ['徐庶'].filter((n) => c.officers.includes(oid(n)));
}
test('上级 searches every city every pass, non-favoured success 40%', () => {
  assert.deepEqual(searchWith({ warlike: true, level: 2 }, [99, 39]), ['徐庶']);
  assert.deepEqual(searchWith({ warlike: true, level: 2 }, [99, 40]), []);
});
test('off keeps 10% / 10%', () => {
  assert.deepEqual(searchWith({ level: 2 }, [99, 30]), []);
  assert.deepEqual(searchWith({ level: 2 }, [0, 5]), ['徐庶']);
});
test('初级 searches 20%, non-favoured success 10%', () => {
  assert.deepEqual(searchWith({ warlike: true, level: 0 }, [19, 9]), ['徐庶']);
  assert.deepEqual(searchWith({ warlike: true, level: 0 }, [0, 10]), []);
  assert.deepEqual(searchWith({ warlike: true, level: 0 }, [20, 0]), []);
});
test('上级 ronin join with loyalty +10 capped at 95', () => {
  const g = G.newGame(4, 2, 1); g.warlike = true;
  const f = g.factions.findIndex((x, i) => i !== g.player && x);
  const c = G.citiesOf(g, f)[0];
  c.officers = c.officers.slice(0, 3);
  for (const o of g.officers) if (o.status === G.RONIN) o.status = G.UNAPPEARED;
  const v = g.officers.find((o) => o.status === G.SERVING && !c.officers.includes(o.id));
  v.status = G.RONIN; v.loc = c.id; v.loyalty = 60;
  const old = v.loyalty, ruler = g.factions[f].ruler;
  g.year = 150; // before every queue entry's year, so the search pass draws only its gate
  const draws = [99, 99, 30]; // search gate, ronin gate (99 < 100), ronin affinity (30 < 40)
  const r = () => (draws.length ? draws.shift() : 99);
  housekeeping(g, f, r, () => true);
  assert.ok(c.officers.includes(v.id));
  assert.equal(v.loyalty, Math.min(95, G.recruitLoyalty(g.officers[ruler].virtue, old) + 10));
});

// ---- Task 3: monthly conscription, refilling and free refill after a battle (上级) ----
import { conscriptCity, warlikePrelude, markFought, marchReserve } from '../src/core/warlike.js';
import { aiTurn } from '../src/core/ai.js';
import { autoBattle, setupWar } from '../src/core/warcore.js';
function cityOf4(level, n, { gold = 0, reserve = 0, soldiers = 0 } = {}) {
  const g = G.newGame(4, level, 1); g.warlike = true;
  const f = g.factions.findIndex((x, i) => i !== g.player && x);
  const c = G.citiesOf(g, f)[0];
  c.officers = c.officers.slice(0, n); c.gold = gold; c.reserve = reserve;
  for (const id of c.officers) g.officers[id].soldiers = soldiers;
  return { g, f, c };
}
test('conscript respects gold floor, march reserve and reserve cap', () => {
  // 中级, 2 officers: floor max(200, march reserve 2×100+100) = 300
  const { g, c } = cityOf4(1, 2, { gold: 300 });
  assert.equal(conscriptCity(g, c, tier(g), () => true), false); // above goldFloor 200, not above the march reserve
  c.gold = 350;
  assert.equal(conscriptCity(g, c, tier(g), () => true), true);
  assert.equal(c.reserve, 200); assert.equal(c.gold, 310);
  c.reserve = 10000; const gold = c.gold;
  assert.equal(conscriptCity(g, c, tier(g), () => true), false);
  assert.equal(c.gold, gold);
  c.reserve = 0; c.gold = 100; // below the floor
  assert.equal(conscriptCity(g, c, tier(g), () => true), false);
  c.gold = 9999;
  assert.equal(conscriptCity(g, c, tier(g), () => false), null);
});
test('初级 conscripts half the shortfall and refills at most 2 officers', () => {
  const { g, f, c } = cityOf4(0, 4, { gold: 9999 });
  warlikePrelude(g, f, () => true);
  assert.equal(c.reserve, 0);
  assert.deepEqual(c.officers.map((id) => g.officers[id].soldiers).sort(), [0, 0, 1000, 1000]);
});
function fought(level, gold) {
  const { g, f, c } = cityOf4(level, 3, { gold, soldiers: 1000 });
  const a = c.officers[0]; g.officers[a].soldiers = 300;
  markFought(g, { att: { ids: [a] }, def: { ids: [c.officers[1]] } });
  return { g, f, c, a };
}
test('上级 refills fought officers free at the start of the next turn', () => {
  const { g, f, a } = fought(2, 0);
  warlikePrelude(g, f, () => true);
  assert.equal(g.officers[a].soldiers, 1000);
  assert.equal(g.warlikeFought.includes(a), false);
});
test('中级 does not refill fought officers for free', () => {
  const { g, f, a } = fought(1, 0);
  warlikePrelude(g, f, () => true);
  assert.equal(g.officers[a].soldiers, 300);
});
test('fought officers refill next turn after a save round-trip', () => {
  let { g, f, a } = fought(2, 0);
  g = JSON.parse(JSON.stringify(g));
  warlikePrelude(g, f, () => true);
  assert.equal(g.officers[a].soldiers, 1000);
});
test('markFought de-duplicates; prelude drops ids that no longer serve', () => {
  const { g, f, a } = fought(2, 0);
  markFought(g, { att: { ids: [a] }, def: { ids: [] } });
  assert.equal(g.warlikeFought.filter((x) => x === a).length, 1);
  g.warlikeFought.push(g.officers.findIndex((o) => o.status !== G.SERVING));
  warlikePrelude(g, f, () => true);
  assert.ok(g.warlikeFought.every((id) => g.officers[id].status === G.SERVING));
});
test('old record without warlikeFought', async () => {
  const { g, f } = cityOf4(2, 3, { gold: 500 });
  delete g.warlikeFought;
  const gold = G.citiesOf(g, f)[0].gold; // aiTurn's own prelude must conscript (domestic work keeps the march reserve)
  await aiTurn(g, f, { event: async () => {}, war: async () => {}, afterWar: async () => {} });
  assert.ok(Array.isArray(g.warlikeFought));
  assert.ok(G.citiesOf(g, f)[0].reserve > 0 || G.citiesOf(g, f)[0].gold < gold, 'the prelude conscripted');
});
test('markFought skips the human player side', () => {
  const { g, c } = cityOf4(2, 2, { gold: 0 });
  const p = G.citiesOf(g, g.player)[0].officers[0];
  markFought(g, { att: { ids: [p, c.officers[0]] }, def: { ids: [] } });
  assert.deepEqual(g.warlikeFought, [c.officers[0]]);
});
test('another faction\'s fought id stays after this prelude; a spent turn stops at the first city', () => {
  const { g, f, c } = cityOf4(2, 2, { gold: 9999 });
  const o = g.factions.findIndex((x, i) => i !== f && x), oc = G.citiesOf(g, o)[0];
  markFought(g, { att: { ids: [oc.officers[0]] }, def: { ids: [] } });
  warlikePrelude(g, f, () => true);
  assert.ok(g.warlikeFought.includes(oc.officers[0]));
  const cs = G.citiesOf(g, f); if (cs.length < 2) return;
  for (const x of cs) { x.reserve = 0; x.gold = 9999; for (const id of x.officers) g.officers[id].soldiers = 0; }
  warlikePrelude(g, f, () => false);
  assert.ok(cs[0].reserve > 0 || cs[0].officers.some((id) => g.officers[id].soldiers));
  assert.ok(cs.slice(1).every((x) => x.reserve === 0 && x.gold === 9999), 'later cities untouched');
});
test('resolveWar marks both sides only when warlike', () => {
  let resolved = 0;
  for (const on of [false, true]) {
    const g = G.newGame(4, 1, 3); if (on) g.warlike = true;
    const f = g.factions.findIndex((x, i) => i !== g.player && x), src = G.citiesOf(g, f)[0];
    const to = G.roads(src.id).map((i) => g.cities[i]).find((c) => c.faction !== f && c.officers.length);
    assert.ok(to, 'fixture has an enemy neighbour');
    const war = setupWar(g, { from: src.id, to: to.id, ids: src.officers.slice(0, 2), commander: src.officers[0], gold: 0, rice: 0 });
    autoBattle(g, war);
    if (on) { resolved++;  assert.ok(war.att.ids.every((id) => g.warlikeFought.includes(id))); assert.ok(war.def.ids.every((id) => g.warlikeFought.includes(id))); }
    else assert.equal(g.warlikeFought, undefined);
  }
  assert.equal(resolved, 1);
});

// ---- Task 4: domestic work by need (pickDomestic, §4.4) ----
import { pickDomestic } from '../src/core/warlike.js';
import { DO } from '../src/core/ai.js';
// A city with three officers who need nothing: loyal, int 90, and no shortfall anywhere.
function needCity(level) {
  const g = G.newGame(4, level, 1); g.warlike = true; g.month = 9;
  const f = g.factions.findIndex((x, i) => i !== g.player && x);
  const c = G.citiesOf(g, f)[0];
  c.officers = c.officers.slice(0, 3);
  for (const id of c.officers) Object.assign(g.officers[id], { loyalty: 100, int: 90 });
  Object.assign(c, { gold: 500, rice: 9999, disaster: 99, gov: 99, pop: 5000, land: 500, industry: 500 });
  return { g, f, c, o: c.officers.map((id) => g.officers[id]) };
}
// needCity: 3 officers; a frontier city (march reserve 400, which only conscription keeps).
test('reward first, then equip, flood, charity, study, develop', () => {
  const { g, f, c, o } = needCity(0);
  o[1].loyalty = 69;
  assert.equal(pickDomestic(g, f, c, 50), 'reward');
  c.gold = 28; assert.equal(pickDomestic(g, f, c, 28), 'equip', 'reward needs 29');
  c.gold = 500; o[1].loyalty = 70;
  assert.equal(pickDomestic(g, f, c, 100), 'equip');
  c.disaster = 49; assert.equal(pickDomestic(g, f, c, null), 'flood');
  c.disaster = 50; c.gov = 59; c.rice = 3 * 120;
  assert.equal(pickDomestic(g, f, c, null), 'charity');
  c.rice = 3 * 120 - 1; o[2].int = 79;
  assert.equal(pickDomestic(g, f, c, null), 'study', 'no charity while rice is short of officers × 120');
  c.gov = 60; o[2].int = 80;
  assert.equal(pickDomestic(g, f, c, null), 'industry');
});
test('every job only needs its largest cost: no march reserve (2026-11-18, 开发优先)', () => {
  const { g, f, c, o } = needCity(0);
  const at = (gold) => { c.gold = gold; return pickDomestic(g, f, c, null); };
  o[0].loyalty = 10; assert.equal(at(29), 'reward'); assert.equal(at(28), 'industry');
  o[0].loyalty = 100; c.disaster = 0; assert.equal(at(19), 'flood'); assert.equal(at(18), null, 'and development needs 23');
  c.disaster = 99; c.gov = 0; assert.equal(at(59), 'charity'); assert.equal(at(58), 'industry');
  c.gov = 99; o[0].int = 60; assert.equal(at(29), 'study'); assert.equal(at(28), 'industry');
  o[0].int = 90; assert.equal(at(23), 'industry'); assert.equal(at(22), null, 'nothing affordable: do nothing');
  c.gold = 100; assert.equal(pickDomestic(g, f, c, 100), 'equip'); assert.equal(pickDomestic(g, f, c, 101), 'industry');
  c.officers = c.officers.slice(0, 1); assert.equal(at(23), 'industry', 'the officer count does not matter');
  for (const lv of [1, 2]) { const z = needCity(lv); z.c.gold = 23; assert.equal(pickDomestic(z.g, z.f, z.c, null), 'industry', 'goldFloor is not read'); }
});
test('noStudy never picks study', () => {
  const { g, f, c, o } = needCity(0);
  o[0].int = 60; g.noStudy = true;
  assert.notEqual(pickDomestic(g, f, c, null), 'study');
  g.noStudy = false; assert.equal(pickDomestic(g, f, c, null), 'study');
});
test('develop picks pop when pop is low, land in months 3–7, industry otherwise, pop when the field is 999', () => {
  const { g, f, c } = needCity(0);
  assert.ok(TIERS.every((t) => t.popFloor === 250), 'shipped tiers: pop first below 250 (hundreds; cities start at 150–350)');
  c.pop = 249; assert.equal(pickDomestic(g, f, c, null), 'pop');
  c.pop = 250; assert.equal(pickDomestic(g, f, c, null), 'industry');
  c.pop = 3000; g.month = 3; assert.equal(pickDomestic(g, f, c, null), 'land');
  g.month = 7; assert.equal(pickDomestic(g, f, c, null), 'land');
  g.month = 8; assert.equal(pickDomestic(g, f, c, null), 'industry');
  c.industry = 999; assert.equal(pickDomestic(g, f, c, null), 'pop');
  g.month = 5; c.land = 999; assert.equal(pickDomestic(g, f, c, null), 'pop');
});
// R13: the march reserve is kept on the frontier only (a road to another faction's city; neutral ones do not count).
// A rear city keeps 100 for domestic work, and conscription there keeps max(goldFloor, 100).
function rearCity(level) {
  const r = needCity(level);
  for (const n of G.roads(r.c.id)) if (r.g.cities[n].faction !== r.f) r.g.cities[n].faction = G.NONE;
  return r;
}
test('march reserve (conscription only): 100 in a rear city, officers × 100 + 100 on the frontier', () => {
  const { g, f, c } = rearCity(0);
  assert.equal(marchReserve(g, c), 100);
  c.gold = 23; assert.equal(pickDomestic(g, f, c, null), 'industry');
  const fr = needCity(0);
  assert.equal(marchReserve(fr.g, fr.c), 400);
  fr.c.gold = 23; assert.equal(pickDomestic(fr.g, fr.f, fr.c, null), 'industry', 'domestic work keeps no reserve');
});
test('conscription in a rear city keeps max(goldFloor, 100)', () => {
  const { g, c } = rearCity(1); // 中级 goldFloor 200
  for (const id of c.officers) g.officers[id].soldiers = 0;
  c.reserve = 0; c.gold = 240;
  assert.equal(conscriptCity(g, c, tier(g), () => true), true);
  assert.equal(c.gold, 200); assert.equal(c.reserve, 200);
});
test('population at 9999 is never developed: the other field, else nothing', () => {
  const { g, f, c } = needCity(0);
  c.pop = 9999; c.industry = 999; g.month = 9; assert.equal(pickDomestic(g, f, c, null), 'land');
  c.land = 999; assert.equal(pickDomestic(g, f, c, null), null);
  c.industry = 500; assert.equal(pickDomestic(g, f, c, null), 'industry');
});
test('上级 development uses multiplier 2.2', () => {
  const { g, c } = needCity(2);
  const land = c.land, gold = c.gold;
  assert.equal(DO.land(g, c, () => 5), true); // cost 10 + 5
  assert.equal(c.land - land, Math.floor(15 * 22 / 10));
  assert.equal(gold - c.gold, 15);
  c.gold = 10; assert.equal(DO.land(g, c, () => 5), false, 'short of gold: no change');
  assert.equal(c.gold, 10);
});

// ---- Task 5: attack weight, target choice and strength check (§4.3) ----
import { adjustWeights, pickTarget, strongEnough } from '../src/core/warlike.js';
test('中级 and 上级 add 4 to the attack weight; off unchanged', () => {
  const w = [6, 4, 6];
  assert.equal(adjustWeights({ level: 2 }, w), w, 'off returns the same array');
  assert.deepEqual(adjustWeights({ warlike: true, level: 0 }, w), [6, 4, 6]);
  assert.deepEqual(adjustWeights({ warlike: true, level: 1 }, w), [10, 4, 6]);
  assert.deepEqual(adjustWeights({ warlike: true, level: 2 }, w), [10, 4, 6]);
  assert.deepEqual(w, [6, 4, 6], 'the data row is never written');
});
// Faction 4 holds city 2 alone; its first two road neighbours belong to faction 0, the rest are neutral.
function targetFixture(level) {
  const g = G.newGame(4, level, 1); g.warlike = true;
  for (const c of g.cities) Object.assign(c, { faction: G.NONE, officers: [], reserve: 0 });
  const src = g.cities[2], [a, b] = G.roads(2).map((i) => g.cities[i]);
  Object.assign(src, { faction: 4, officers: [20, 21, 22] });
  const put = (c, ids, soldiers) => { Object.assign(c, { faction: 0, officers: ids }); for (const id of ids) g.officers[id].soldiers = soldiers; };
  put(a, [100, 101], 1000); put(b, [102, 103, 104], 200);
  return { g, src, a, b };
}
test('上级 picks like 中级: fewest officers first, reserves not counted', () => {
  const { g, src, a, b } = targetFixture(2);
  assert.deepEqual(pickTarget(g, 4), { target: a.id, source: src.id }, '2 officers before 3, whatever they lead');
  b.officers.pop(); a.reserve = 0; b.reserve = 3000;
  assert.equal(pickTarget(g, 4).target, b.id, '2 × 200 against 2 × 1000; the reserve does not count');
  g.factions[4].alliance[0] = 5;
  assert.equal(pickTarget(g, 4), null, 'allies are never targets, neutral cities never');
});
test('中级 picks the fewest officers, then the fewest defending soldiers', () => {
  const { g, a, b } = targetFixture(1);
  assert.equal(pickTarget(g, 4).target, a.id);
  b.officers.pop(); for (const id of a.officers) g.officers[id].soldiers = 300;
  assert.equal(pickTarget(g, 4).target, b.id, '2 × 200 against 2 × 300');
});
test('pickTarget source: the own city on a road to the target with the most officers, later on ties', () => {
  const { g, src, a, b } = targetFixture(2);
  Object.assign(a, { faction: G.NONE, officers: [] }); // b is then the only target
  const other = g.cities[G.roads(b.id).find((i) => i !== src.id && g.cities[i].faction === G.NONE)];
  Object.assign(other, { faction: 4, officers: [30, 31, 32] });
  const want = other.id > src.id ? other.id : src.id;
  assert.equal(pickTarget(g, 4).source, want, 'three each: the later city');
  other.officers.push(33);
  assert.equal(pickTarget(g, 4).source, other.id);
});
test('pickTarget on a 31-city map', () => {
  const D = structuredClone(D2);
  try {
    D.cities.push({ ...structuredClone(D.cities[2]), id: 30, roads: [2] });
    D.cities[2].roads.push(30);
    G.setData(D);
    const { g } = targetFixture(2);
    assert.equal(g.cities.length, 31);
    Object.assign(g.cities[30], { faction: 0, officers: [105] });
    g.officers[105].soldiers = 10;
    const p = pickTarget(g, 4);
    assert.ok(p && p.target < g.cities.length);
    assert.equal(p.target, 30, 'the weakest is the new city');
  } finally { G.setData(D2); }
});
test('strongEnough: n marchers at 1000 (after A481) against the defenders\' soldiers × strength, no reserves', () => {
  const { g, a } = targetFixture(1); // 中级 50%
  for (const id of a.officers) g.officers[id].soldiers = 2000; // 4000 × 0.5 = 2000
  assert.equal(strongEnough(g, a, 2), true, '2000 ≥ 2000');
  g.officers[a.officers[0]].soldiers = 2001;
  assert.equal(strongEnough(g, a, 2), false, '2000 < 2000.5');
  a.reserve = 0; assert.equal(strongEnough(g, a, 3), true);
  a.reserve = 9999; assert.equal(strongEnough(g, a, 3), true, 'the target reserve does not count');
  const up = targetFixture(2); // 上级 100%
  assert.equal(strongEnough(up.g, up.a, 2), true); assert.equal(strongEnough(up.g, up.a, 1), false);
});

// ---- 上级 gold income bonus (game.js income, 5.2; 2026-11-18, user-approved 上级 resource) ----
test('上级 AI cities get the gold and rice income bonuses; player cities, 中级 and the option off do not', () => {
  const run = (warlike, level, kind) => {
    const g = G.newGame(4, level, 1); g.warlike = warlike;
    for (const c of g.cities) { c.gold = 0; c.rice = 0; }
    return { g, out: new Map(G.income(g, kind)) };
  };
  const off = run(false, 2, 'gold'), on = run(true, 2, 'gold'), mid = run(true, 1, 'gold');
  const b = TIERS[2].incomeBonus; assert.ok(b > 0);
  for (const c of off.g.cities) {
    if (c.faction === G.NONE) continue;
    const base = off.out.get(c.id), got = on.out.get(c.id);
    if (c.faction === off.g.player) assert.equal(got, base, 'player city untouched');
    else assert.equal(got, Math.floor((base * (100 + b)) / 100));
  }
  const offMid = run(false, 1, 'gold');
  for (const [id, v] of offMid.out) assert.equal(mid.out.get(id), v, '中级 has no bonus');
  const rOff = run(false, 2, 'rice'), rOn = run(true, 2, 'rice'), rb = TIERS[2].incomeRiceBonus; assert.ok(rb > 0);
  for (const c of rOff.g.cities) if (c.faction !== G.NONE) assert.equal(rOn.out.get(c.id), c.faction === rOff.g.player ? rOff.out.get(c.id) : Math.floor((rOff.out.get(c.id) * (100 + rb)) / 100), 'rice: its own bonus');
  const rMid = run(true, 1, 'rice'), rMidOff = run(false, 1, 'rice');
  for (const [id, v] of rMidOff.out) assert.equal(rMid.out.get(id), v, '中级 rice has no bonus');
  const g = G.newGame(4, 2, 1); g.warlike = true; const c = g.cities.find((x) => x.faction !== G.NONE && x.faction !== g.player);
  c.gold = 9990; G.income(g, 'gold'); assert.equal(c.gold, 9999, 'cap kept');
});
test('prelude refill terminates for an officer at 901-999 soldiers with a nearly full reserve', () => {
  const { g, f, c } = cityOf4(0, 2, { soldiers: 1000 });
  const id = c.officers[1]; g.officers[id].soldiers = 950; c.reserve = 9990; c.gold = 0;
  warlikePrelude(g, f, () => true);
  // assignTroops itself caps the reserve at 10000 and drops the 10 over the cap (950 -> 940); the point is that it returns
  assert.ok(g.officers[id].soldiers >= 900);
  assert.ok(c.reserve <= 10000);
});
