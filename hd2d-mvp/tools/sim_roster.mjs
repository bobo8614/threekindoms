// Regression checks for war settlement and the war AI (from the adversarial reviews), plus a roster
// invariant: after every war each serving officer sits in exactly one city roster and every roster
// entry is serving.
//   node hd2d-mvp/tools/sim_roster.mjs [wars=300]
import { readFileSync } from 'node:fs';
import { setData, newGame, roads, SERVING, UNAPPEARED, officerCity, run, buyEquip, data } from '../src/core/game.js';
import { Tactical } from '../src/core/tactical.js';
import { setupWar, resolveWar, autoBattle } from '../src/core/warcore.js';
import { Field } from '../src/core/field.js';
import { Duel } from '../src/core/skirmish.js';
setData(JSON.parse(readFileSync(new URL('../data/game-data.json', import.meta.url))));
const N = Number(process.argv[2] || 300);
let bad = 0;
const fail = (...m) => { bad++; if (bad <= 12) console.log('BAD', ...m); };

function roster(g, tag) {
  const seen = new Map();
  for (const c of g.cities) for (const id of c.officers) {
    if (g.officers[id].status !== SERVING) fail(tag, `${id} in ${c.id} but status ${g.officers[id].status}`);
    seen.set(id, (seen.get(id) || 0) + 1);
  }
  for (const o of g.officers) if (o.status === SERVING && seen.get(o.id) !== 1) fail(tag, `serving ${o.id} in ${seen.get(o.id) || 0} rosters`);
}
const fieldWar = (g, war) => {
  const f = new Field(g, war, null);
  for (let k = 0; !f.over && k < 200; k++) { for (const _ of f.aiActions(f.turn)); f.endTurn(); }
  return f;
};

// R1: 并州 → 冀州 AI-vs-AI field wars, many seeds; prisoners taken by the later loser must not vanish.
let loserHeld = 0;
for (let i = 0; i < N; i++) {
  const g = newGame(4, 1, i + 1), src = g.cities[2];
  const ids = src.officers.slice(0, 3);
  const war = setupWar(g, { from: 2, to: 4, ids, commander: ids[0], gold: Math.min(300, src.gold), rice: Math.min(400, src.rice) });
  const f = fieldWar(g, war), res = f.result();
  const lose = res.loser === 'att' ? res.captured.byAtt : res.captured.byDef;
  loserHeld += lose.length;
  resolveWar(g, war, res);
  roster(g, `R1 seed ${i + 1}`);
}

// Random AI field wars and auto battles across the map.
for (let i = 0; i < N; i++) {
  const g = newGame(4, 1, 1000 + i), src = g.cities[i % 30];
  if (src.officers.length < 2) continue;
  const to = roads(src.id).find((n) => g.cities[n].faction !== src.faction && g.cities[n].officers.length);
  if (to == null) continue;
  const ids = src.officers.slice(0, Math.min(4, src.officers.length));
  const war = setupWar(g, { from: src.id, to, ids, commander: ids[0], gold: Math.min(300, src.gold), rice: Math.min(400, src.rice) });
  if (i % 2) autoBattle(g, war); else { const f = fieldWar(g, war); resolveWar(g, war, f.result()); }
  roster(g, `mix ${i}`);
}

// R2: an attacker beside an empty castle walks in and takes it.
{
  const g = newGame(4, 1, 7), src = g.cities[2], ids = src.officers.slice(0, 3);
  const war = setupWar(g, { from: 2, to: 4, ids, commander: ids[0], gold: 300, rice: 400 });
  const f = new Field(g, war, null), [cx, cy] = f.castle();
  const u = f.units.find((x) => x.side === 'att' && !x.commander) || f.units.find((x) => x.side === 'att');
  for (const d of f.units.filter((x) => x.side === 'def')) { d.x = 0; d.y = 0; } // everyone off the castle (stacking is fine for this check)
  u.x = cx - 1; u.y = cy; u.role = 1; f.pool.att = 60; f.turn = 'att';
  f.aiDecide(u);
  if (!(f.over && f.over.loser === 'def' && f.over.why === 'castle')) fail('R2 empty castle not taken', JSON.stringify(f.over), u.x, u.y, cx, cy);
}

// R4: loser commander dead → the loser's chest stays in the battle city.
{
  const g = newGame(4, 1, 3), src = g.cities[2], ids = src.officers.slice(0, 3);
  const war = setupWar(g, { from: 2, to: 4, ids, commander: ids[0], gold: 100, rice: 300 });
  const battle = g.cities[4], before = { gold: battle.gold, rice: battle.rice }, home = { gold: src.gold, rice: src.rice };
  const res = { loser: 'att', survivors: { att: ids.slice(1), def: [...war.def.ids] }, dead: [ids[0]], captured: { byAtt: [], byDef: [] }, retreated: [],
    chests: { att: { gold: 100, rice: 300 }, def: { gold: 0, rice: 0 } } };
  resolveWar(g, war, res);
  if (battle.gold - before.gold !== 100 || battle.rice - before.rice !== 300 || src.gold !== home.gold || src.rice !== home.rice)
    fail('R4 chest went home with a dead commander', battle.gold - before.gold, battle.rice - before.rice, src.gold - home.gold, src.rice - home.rice);
  roster(g, 'R4');
}

// R5: 200 troops with 0 rice run out at the day tick even though the day's use is 0.
{
  const g = newGame(4, 1, 5), src = g.cities[2], ids = src.officers.slice(0, 1);
  g.officers[ids[0]].soldiers = 200;
  const war = setupWar(g, { from: 2, to: 4, ids, commander: ids[0], gold: 0, rice: 0 });
  const f = new Field(g, war, null);
  f.endTurn(); f.endTurn();
  if (!(f.over && f.over.loser === 'att' && f.over.why === 'rice')) fail('R5 zero rice did not run out', JSON.stringify(f.over), f.day);
}

// Third review. R1: a second retreat cannot pick a city the first one already filled to 10.
{
  const g = newGame(4, 1, 11), src = g.cities[2], ids = src.officers.slice(0, 3);
  const war = setupWar(g, { from: 2, to: 4, ids, commander: ids[0], gold: 300, rice: 400 });
  const f = new Field(g, war, null), defF = g.cities[4].faction;
  const n = roads(4).find((c) => g.cities[c].faction === defF);
  const spare = g.officers.filter((o) => o.status === UNAPPEARED).slice(0, 9 - g.cities[n].officers.length);
  for (const o of spare) { o.status = SERVING; g.cities[n].officers.push(o.id); }
  const [u1, u2] = f.units.filter((u) => u.side === 'def' && !u.commander);
  if (n == null || !u2) fail('R1 setup');
  else {
    f.retreat(u1, n);
    if (f.retreatTargets(u2).includes(n)) fail('R1 full city still offered after a retreat filled it');
    f.end('att', 'test'); resolveWar(g, war, f.result());
    roster(g, 'R1 retreat');
  }
}
// Playtest 0.1.1: a human attacker may retreat to any own or empty city on a road from the battlefield
// (not only home); the AI attacker still goes home.
for (const human of ['att', null]) {
  const g = newGame(4, 1, 13), src = g.cities[2], ids = src.officers.slice(0, 2), P = src.faction;
  const empty = roads(4).find((c) => c !== 2);
  g.cities[empty].faction = 7; g.cities[empty].officers.length = 0;
  const war = setupWar(g, { from: 2, to: 4, ids, commander: ids[0], gold: 0, rice: 400 });
  const f = new Field(g, war, human), t = f.retreatTargets(f.units.find((x) => x.side === 'att'));
  if (human && !(t.includes(empty) && t.every((c) => roads(4).includes(c) && [P, 7].includes(g.cities[c].faction)))) fail('human attacker retreat targets', t, empty);
  if (!human && (t.length > 1 || (t.length && t[0] !== 2))) fail('AI attacker should only go home', t);
}
// R2: a player holding all 30 cities with no books left is unified before the month rolls over.
{
  const g = newGame(4, 1, 47), P = g.player;
  for (const c of g.cities) c.faction = P;
  g.current = P; g.books = 0;
  const seen = [], month = [g.year, g.month];
  const io = { event: async (e) => { seen.push(e.type); }, aiTurn: async () => { seen.push('aiTurn'); }, playerTurn: async () => { g.endTurn = true; }, chooseHeir: async (f, c) => c[0], allianceOffer: async () => false, war: async () => null, afterWar: async () => {} };
  await run(g, io);
  if (g.over?.type !== 'unify' || seen.length !== 1 || g.year !== month[0] || g.month !== month[1]) fail('R2 unify', JSON.stringify(g.over), seen.slice(0, 5), g.year, g.month);
}
// R3: one AI challenge is answered exactly once.
{
  const g = newGame(4, 1, 73), T = new Tactical(g, 222, 138, 2, () => 0, { human: 'd' });
  T.deploy();
  T.events = [{ type: 'tactic', side: 'a', id: 'taunt', name: '挑发', ok: true, ask: true }]; T.awaitTaunt = 'a';
  const ev = T.step();
  if (!ev?.ask) fail('R3 ask event not delivered first', JSON.stringify(ev?.type));
  const r1 = T.answerTaunt(false), r2 = T.answerTaunt(false);
  if (r1?.type !== 'refuse' || r2 !== null || T.awaitTaunt) fail('R3 challenge answered twice', r1?.type, r2);
  const next = T.step();
  if (next?.ask) fail('R3 ask event repeated');
}
// R4: 关王刀 only for 关羽 (38), once per game.
{
  const g = newGame(4, 1, 5), c = g.cities[15]; c.gold = 9999;
  if (!data().cities[15].shop.includes(15)) fail('R4 setup: 建业 does not sell 关王刀');
  if (buyEquip(g, 15, c.officers[0], 15).ok) fail('R4 non-关羽 bought 关王刀');
  if (!buyEquip(g, 15, 38, 15).ok) fail('R4 关羽 could not buy 关王刀');
  if (buyEquip(g, 15, 38, 15).ok) fail('R4 关王刀 bought twice');
}
// Playtest 0.1.3 (N01): attackers who wait out day 31 without fighting go home; nobody is captured.
for (let s = 1; s <= 20; s++) {
  const g = newGame(4, 1, s), src = g.cities[2], ids = src.officers.slice(0, 3);
  for (const id of ids) g.officers[id].loyalty = 50;
  const war = setupWar(g, { from: 2, to: 4, ids, commander: ids[0], gold: 300, rice: 400 });
  const f = new Field(g, war, null);
  f.day = 31; f.turn = 'def'; f.endTurn();
  const res = f.result();
  if (f.over?.why !== 'timeout' || res.captured.byDef.length) fail('N01 timeout captured untouched attackers', JSON.stringify(f.over), res.captured.byDef);
  resolveWar(g, war, res);
  if (ids.some((id) => g.officers[id].status !== SERVING || officerCity(g, id)?.faction !== src.faction)) fail('N01 timed-out attacker changed sides', ids.map((id) => officerCity(g, id)?.faction));
  roster(g, `N01 seed ${s}`);
}
// Playtest 0.1.3 (N02): the 战场武器店 sells the battle city's field stock from the war chest.
{
  const g = newGame(4, 1, 3), src = g.cities.find((c) => c.faction !== 7 && c.faction !== g.cities[6].faction && c.officers.length >= 2); // stock is by battle city, any road will do
  const ids = src.officers.slice(0, 2);
  const war = setupWar(g, { from: src.id, to: 6, ids, commander: ids[0], gold: 300, rice: 400 });
  const f = new Field(g, war, null), u = f.units.find((x) => x.side === 'att'), shopAt = f.villages.find((v) => v.kind === '武器店');
  const o = g.officers[u.id], cityGold = src.gold;
  if (f.buyEquip(u, 0).ok) fail('N02 bought away from the shop');
  u.x = shopAt.x; u.y = shopAt.y;
  if (f.buyEquip(u, 15).ok) fail('N02 sold an item outside the field stock');
  o.war = 89; if (f.buyEquip(u, 22).ok) fail('N02 狼牙枪 sold below 武力90');
  o.war = 90; war.att.gold = 349; if (f.buyEquip(u, 22).ok) fail('N02 狼牙枪 sold without the gold');
  war.att.gold = 400; const r1 = f.buyEquip(u, 22);
  if (!r1.ok || o.weapon !== 22 || war.att.gold !== 50 || src.gold !== cityGold) fail('N02 狼牙枪 at 武力90', JSON.stringify(r1), o.weapon, war.att.gold);
  war.att.gold = 400; if (f.buyEquip(u, 22).ok) fail('N02 狼牙枪 sold twice');
}
// Playtest 0.1.3 (N03): the human side may 降参 in a 单挑 unless he is one of the seven rulers.
{
  const g = newGame(4, 1, 9), ruler = g.factions.find((f) => f?.ruler != null).ruler, plain = g.officers.find((o) => o.status === SERVING && !g.factions.some((f) => f?.ruler === o.id)).id;
  const mk = (id) => ({ id, o: g.officers[id], hp: g.officers[id].hp, F: 50, eq: { atk: 0, def: 0, wgrp: 0, weight: 0 } });
  const d1 = new Duel({ a: mk(ruler), d: mk(plain) }, () => 0, g);
  if (d1.canSurrender('a')) fail('N03 ruler may surrender');
  try { d1.act('a', 'surrender'); fail('N03 ruler surrender accepted'); } catch { /* refused */ }
  const d2 = new Duel({ a: mk(plain), d: mk(ruler) }, () => 0, g);
  d2.act('a', 'surrender');
  if (d2.result?.surrendered !== plain || d2.result.winner !== ruler) fail('N03 surrender result', JSON.stringify(d2.result));
}

console.log({ wars: N * 2, loserHeldPrisoners: loserHeld, bad });
process.exit(bad ? 1 : 0);
