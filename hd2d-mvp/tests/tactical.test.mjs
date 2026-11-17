// 白兵 rules in Node (no browser): the archers' four rays (T08 of the 2026-10-30 playtest: the original's left-ray
// quirk left the attacker's archers, who face right, walking past foes in range).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as G from '../src/core/game.js';
import { Tactical, GW, GH } from '../src/core/tactical.js';
import { Field } from '../src/core/field.js';
import { setupWar, resolveWar } from '../src/core/warcore.js';
G.setData(JSON.parse(readFileSync(new URL('../data/game-data.json', import.meta.url))));

// An empty plain (terrain 2 is open ground) with one archer of `side` at (7,4) and the given foes.
function board(side, foes, { xbow = false, walls = [] } = {}) {
  const g = G.newGame(4, 1, 1), ids = g.officers.filter((o) => o.status === 2).map((o) => o.id);
  const t = new Tactical(g, ids[0], ids[1], 2, () => 0);
  t.map = Array.from({ length: GH }, (_, y) => Array.from({ length: GW }, (_, x) => (walls.some(([wx, wy]) => wx === x && wy === y) ? 1 : 0)));
  const foe = side === 'a' ? 'd' : 'a';
  const arc = { side, kind: 'arc', idx: 1, x: 7, y: 4, hp: 100 };
  t.units = [arc, ...foes.map(([x, y], i) => ({ side: foe, kind: 'inf', idx: i + 1, x, y, hp: 100 }))];
  if (xbow) t.side[side].fx.xbow = 1;
  return { t, arc };
}

for (const side of ['a', 'd']) for (const [name, dx, dy] of [['up', 0, -1], ['down', 0, 1], ['left', -1, 0], ['right', 1, 0]]) {
  test(`an archer of side ${side} shoots a foe 3 squares ${name}`, () => {
    const { t, arc } = board(side, [[7 + dx * 3, 4 + dy * 3]]);
    const p = t.pickTarget(arc, 'advance');
    assert.ok(p?.ranged, 'a ranged shot'); assert.equal(p.unit.x, 7 + dx * 3); assert.equal(p.unit.y, 4 + dy * 3);
  });
}

test('out of range (5 squares) there is no shot; 强弩 reaches 6', () => {
  const plain = board('a', [[12, 4]]), xbow = board('a', [[12, 4]], { xbow: true });
  assert.equal(plain.t.pickTarget(plain.arc, 'advance'), null);
  assert.ok(xbow.t.pickTarget(xbow.arc, 'advance')?.ranged);
});

test('a wall in the way stops the arrow', () => {
  const { t, arc } = board('a', [[10, 4]], { walls: [[9, 4]] });
  assert.equal(t.pickTarget(arc, 'advance'), null);
});

test('a foe alongside is fought hand to hand, not shot', () => {
  const { t, arc } = board('a', [[8, 4]]);
  const p = t.pickTarget(arc, 'advance');
  assert.equal(p?.ranged, false); assert.equal(p.unit.x, 8);
});

test('with a foe alongside on the left, a foe further right is still shot', () => {
  const { t, arc } = board('a', [[6, 4], [10, 4]]);
  const p = t.pickTarget(arc, 'advance');
  assert.ok(p?.ranged); assert.equal(p.unit.x, 10);
});

// 火矢 (S12): only an archer's shot while it lasts is a fire arrow (the view burns those); hand to hand is not.
test('火矢 marks the archers\' shots as fire arrows while it lasts', () => {
  const { t, arc } = board('a', [[10, 4], [8, 4]]);
  const melee = t.attack(arc, t.units[2], false), plain = t.attack(arc, t.units[1], true);
  assert.equal(melee.fire, false); assert.equal(plain.fire, false);
  t.side.a.fx.fire = 3;
  assert.equal(t.attack(arc, t.units[1], true).fire, true);
  assert.equal(t.attack(arc, t.units[2], false).fire, false);
});

// 武将不战死 (T16/T17): a general at 0 HP is taken at SPARED_HP; off, he dies as before. A ruler, who cannot be
// taken, dies as in the original either way (Desktop 0.2.3: one kept at 30 HP with nowhere to fall back to stood on
// his last city for good, and the war could only be lost on day 30).
function duelBoard(noWarDeath, defRuler = false) {
  const g = G.newGame(4, 1, 1); g.noWarDeath = noWarDeath;
  const rulers = new Set(g.factions.map((f) => f.ruler));
  const plain = g.officers.filter((o) => o.status === 2 && !rulers.has(o.id)).map((o) => o.id);
  const dId = defRuler ? g.factions.find((f) => f.ruler != null).ruler : plain[1];
  const t = new Tactical(g, plain[0], dId, 2, () => 0);
  t.map = Array.from({ length: GH }, () => Array(GW).fill(0));
  t.units = [{ side: 'a', kind: 'gen', idx: 0, x: 5, y: 4, hp: 50, id: plain[0] }, { side: 'd', kind: 'gen', idx: 0, x: 9, y: 4, hp: 1, id: dId },
    { side: 'a', kind: 'inf', idx: 1, x: 8, y: 4, hp: 100 }];
  t.side.d.hp = 1; t.side.a.F = 99;
  return { t, g, dId };
}
test('off: a general struck to 0 HP dies', () => {
  const { t } = duelBoard(false);
  const ev = t.attack(t.units[2], t.units[1], false);
  assert.ok(ev.kill); assert.equal(t.side.d.fate, 'dead'); assert.equal(t.result().d.fate, 'dead');
});
test('不战死: a general struck to 0 HP is captured and comes out with 30 HP', () => {
  const { t } = duelBoard(true);
  const ev = t.attack(t.units[2], t.units[1], false);
  assert.equal(ev.kill, false); assert.equal(ev.spared, 'captured');
  const r = t.result(); assert.equal(r.d.fate, 'captured'); assert.equal(r.d.hp, G.SPARED_HP); assert.equal(r.why, 'capture');
});
test('不战死: a ruler struck to 0 HP dies, as in the original', () => {
  const { t } = duelBoard(true, true);
  const ev = t.attack(t.units[2], t.units[1], false);
  assert.ok(ev.kill); assert.equal(ev.spared, undefined);
  const r = t.result(); assert.equal(r.d.fate, 'dead'); assert.equal(r.d.hp, 0); assert.equal(r.why, 'dead');
});
test('不战死: a ruler slain in a 单挑 stays slain', () => {
  const { t, dId } = duelBoard(true, true);
  t.duel = { result: { dead: dId, winner: t.side.a.id } };
  const end = t.resolveDuel();
  assert.equal(end.res.dead, dId); assert.equal(end.res.captured, undefined); assert.equal(t.result().d.fate, 'dead');
});
test('不战死: a 单挑 fall becomes a capture', () => {
  const { t, dId } = duelBoard(true);
  t.duel = { result: { dead: dId, winner: t.side.a.id } };
  const end = t.resolveDuel();
  assert.equal(end.res.dead, null); assert.equal(end.res.captured, dId); assert.equal(t.result().d.fate, 'captured');
});


// On the war map a ruler brought to 0 HP under 武将不战死 dies, by a 计略 or a 白兵, enemy or the player's own,
// commanding or not: he does not stay on the field at 30 HP, and the log says 阵亡.
function rulerWar(commander, human = null) {
  const g = G.newGame(4, 1, 1); g.noWarDeath = true;
  const foeNear = (i, c) => G.roads(c).find((n) => g.cities[n].faction !== i && g.cities[n].faction !== G.NONE && g.cities[n].officers.length);
  const f = g.factions.findIndex((x, i) => {
    const c = x?.ruler != null && g.cities.find((c) => c.faction === i && c.officers.includes(x.ruler));
    return c && c.officers.length >= 2 && foeNear(i, c.id) != null;
  });
  const ruler = g.factions[f].ruler, home = g.cities.find((c) => c.officers.includes(ruler)).id, to = foeNear(f, home);
  const ids = [g.cities[to].officers[0]], other = g.cities[home].officers.find((x) => x !== ruler);
  for (const id of [...ids, ruler, other]) g.officers[id].soldiers = 800;
  // the ruler defends his city; the attacker comes from the neighbour
  const w = setupWar(g, { from: to, to: home, ids, commander: ids[0], gold: 100, rice: 400 });
  const lead = commander ? ruler : other; w.def.ids = [lead, ...w.def.ids.filter((x) => x !== lead)]; // the first one commands
  const field = new Field(g, w, human);
  return { g, field, ruler: field.units.find((u) => u.id === ruler), foe: field.units.find((u) => u.side === 'att') };
}
for (const [commander, human] of [[true, null], [false, null], [false, 'def']]) {
  test(`不战死: ${human ? "the player's" : 'a'} ruler ${commander ? 'commanding' : 'not commanding'} felled by 落石 dies`, () => {
    const { g, field, ruler, foe } = rulerWar(commander, human);
    g.officers[ruler.id].hp = 1; field.r = () => 0; foe.x = ruler.x; foe.y = ruler.y + (ruler.y > 0 ? -1 : 1); // within reach
    const res = field.cast(foe, 9, ruler, true);
    assert.ok(res.hit, '落石 hit');
    assert.equal(g.officers[ruler.id].status, G.DEAD); assert.equal(ruler.gone, true); assert.equal(ruler.fate, 'dead');
    assert.match(res.lines.join(' '), /阵亡/); assert.doesNotMatch(res.lines.join(' '), /负伤|坚守/);
    assert.equal(field.woundedPick, undefined, 'no city to pick');
    if (commander) assert.deepEqual(field.over, { loser: 'def', why: 'commander' }); else { assert.equal(field.over, null); field.end('att', 'timeout'); }
    assert.ok(field.result().dead.includes(ruler.id), 'settled as a death');
  });
}
test('不战死: a ruler felled in a 白兵 dies and the war ends with his command', () => {
  const { g, field, ruler, foe } = rulerWar(true);
  field.applySkirmish(foe, ruler, { a: { soldiers: 500, hp: 40, fate: null }, d: { soldiers: 300, hp: 0, fate: 'dead' } });
  assert.equal(g.officers[ruler.id].status, G.DEAD); assert.equal(ruler.fate, 'dead');
  assert.deepEqual(field.over, { loser: 'def', why: 'commander' });
});
// A whole 白兵 played out on a real field: the ruler's 0 HP reaches the war map as 阵亡, not as a wound.
test('不战死: a 白兵 that brings a ruler to 0 HP settles as his death on the war map', () => {
  const { g, field, ruler, foe } = rulerWar(true);
  g.officers[ruler.id].hp = 1; g.officers[foe.id].war = 100; g.officers[foe.id].hp = 100;
  foe.x = ruler.x; foe.y = ruler.y + (ruler.y > 0 ? -1 : 1);
  const res = field.attack(foe, ruler);
  if (res.pending) res.auto();
  assert.equal(res.d.fate, 'dead'); assert.equal(g.officers[ruler.id].status, G.DEAD); assert.equal(ruler.gone, true);
});

// 白兵 retreat pursuit on a real war (docs/原版白兵撤退追击逻辑与修复交接_2026-11-07.md): the player's commander
// withdraws, is pursued at his edge, and the war map gets the HP the pursuit left (and a record round trip keeps it);
// a pursuit to 0 is his death, and a commander's death ends the war.
for (const [label, draws, alive] of [['survives', [50, 8], true], ['dies', [50, 9], false]]) {
  test(`白兵 retreat pursuit on the war map: the commander ${label}`, () => {
    const { g, field, ruler, foe } = rulerWar(true, 'def');
    g.officers[ruler.id].hp = alive ? 40 : 14;
    foe.x = ruler.x; foe.y = ruler.y + (ruler.y > 0 ? -1 : 1);
    const res = field.attack(foe, ruler), b = res.pending;
    assert.ok(b, 'the player fights it');
    b.deploy(); b.withdrawAll('d'); b.aiCommands('a');
    const orig = b.pursue.bind(b); let n = 0;
    b.pursue = (s) => { n++; const r0 = b.r, q = [...draws]; b.r = (k) => (q.length ? q.shift() % k : r0(k)); try { return orig(s); } finally { b.r = r0; } };
    b.gen('d').x = GW - 1; for (const u of b.units) if (u.side === 'a') u.x = 0; // the foe far off: no 单挑 on the way
    for (let i = 0; i < 2000 && !b.over; i++) { const ev = b.step(); if (b.duel) b.autoDuel(); else if (!ev && !b.over) break; }
    assert.equal(b.over.why, alive ? 'retreat' : 'dead'); assert.equal(n, 1);
    res.settle();
    const o = g.officers[ruler.id];
    if (alive) {
      assert.equal(o.hp, 27); assert.notEqual(o.status, G.DEAD); assert.ok(!ruler.gone); assert.equal(field.over, null);
      assert.equal(JSON.parse(JSON.stringify(g)).officers[ruler.id].hp, 27, 'the record keeps it');
    } else {
      assert.equal(o.hp, 0); assert.equal(o.status, G.DEAD); assert.equal(ruler.fate, 'dead');
      assert.deepEqual(field.over, { loser: 'def', why: 'commander' });
    }
  });
}

// A ruler under 武将不战死 still 退却s by the AI rule only into a city with room (adversarial review R6): an overflow
// there would turn him 下野 after the war.
test('不战死: an AI ruler does not 退却 into a full city', () => {
  const g = G.newGame(4, 1, 1); g.noWarDeath = true;
  const f = g.factions.findIndex((x, i) => x?.ruler != null && g.cities.some((c) => c.faction === i && c.officers.includes(x.ruler)
    && G.roads(c.id).some((n) => g.cities[n].faction !== i && g.cities[n].faction !== G.NONE && g.cities[n].officers.length)));
  const ruler = g.factions[f].ruler, home = g.cities.find((c) => c.officers.includes(ruler)).id;
  const to = G.roads(home).find((n) => g.cities[n].faction !== f && g.cities[n].faction !== G.NONE && g.cities[n].officers.length);
  for (const id of [ruler, g.cities[to].officers[0]]) g.officers[id].soldiers = 800;
  const w = setupWar(g, { from: home, to, ids: [ruler], commander: ruler, gold: 100, rice: 400 });
  const field = new Field(g, w, null), u = field.units.find((x) => x.id === ruler);
  let n = 0;
  for (const c of new Set([home, ...G.roads(to)])) for (let i = g.cities[c].officers.length; i < 10; i++) field.units.push({ id: -1 - n++, side: 'att', gone: true, fate: 'retreat', to: c });
  assert.ok(field.retreatTargets(u).includes(home), 'the AI rule alone would send him home');
  assert.deepEqual(field.roomTargets(u), [], 'every city he could go to is full');
  g.officers[ruler].soldiers = 200; g.officers[ruler].hp = 30; // weak enough for the AI's 退却
  const act = field.aiDecide(u);
  assert.notEqual(act?.type, 'retreat', 'no 退却 into a full city');
  assert.equal(u.gone, false);
});

// After the war, units that walked off are placed in their cities, an overflow turning 下野. Under 武将不战死 a
// ruler is placed first and is never the one pushed out, whoever retreated after him (adversarial review, round 5).
for (const on of [true, false]) {
  test(`${on ? '不战死' : 'off'}: settling two retreats into a city with one free place, the ruler ${on ? 'keeps it' : 'goes by unit order'}`, () => {
    const g = G.newGame(4, 1, 1); g.noWarDeath = on;
    const f = g.factions.findIndex((x, i) => x?.ruler != null && g.cities.some((c) => c.faction === i && c.officers.includes(x.ruler) && c.officers.length >= 2
      && G.roads(c.id).some((n) => g.cities[n].faction !== i && g.cities[n].faction !== G.NONE && g.cities[n].officers.length)));
    const ruler = g.factions[f].ruler, home = g.cities.find((c) => c.officers.includes(ruler)).id;
    const other = g.cities[home].officers.find((x) => x !== ruler);
    const to = G.roads(home).find((n) => g.cities[n].faction !== f && g.cities[n].faction !== G.NONE && g.cities[n].officers.length);
    const w = setupWar(g, { from: home, to, ids: [other, ruler], commander: other, gold: 100, rice: 400 });
    // fill the home city to 9: one place left for the two who walk back
    for (const c of g.cities) if (c.id !== home) for (let i = 0; g.cities[home].officers.length < 9 && i < c.officers.length; ) {
      const id = c.officers[i]; if (g.officers[id].faction === f && !G.isRuler(g, id)) { c.officers.splice(i, 1); g.cities[home].officers.push(id); } else i++;
    }
    while (g.cities[home].officers.length < 9) g.cities[home].officers.push(g.cities[home].officers[0]); // padding, never settled
    assert.equal(g.cities[home].officers.length, 9);
    resolveWar(g, w, { loser: 'att', survivors: { att: [other, ruler], def: [...w.def.ids] }, dead: [], captured: { byAtt: [], byDef: [] },
      retreated: [{ id: other, city: home }, { id: ruler, city: home }], chests: { att: w.att, def: w.def } });
    if (on) { assert.ok(g.cities[home].officers.includes(ruler), 'the ruler is in his city'); assert.notEqual(g.officers[ruler].status, G.RONIN); }
    else assert.equal(g.officers[ruler].status, G.RONIN, 'the original rule: placed in unit order, the overflow 下野');
  });
}

// 单挑斩杀的宝物 (research/death-succession-events-evidence.md §5): the winner of a duel that slew 曹操/董卓/马腾/
// 刘备 or another ruler is handed 倚天剑/七星剑/青釭剑/龙鳞之铠/龙牙刀 over what he wore.
function slay(deadId, { draw = 0, level = 3, noWarDeath = false, g = G.newGame(4, 1, 1) } = {}) {
  g.noWarDeath = noWarDeath;
  const rulers = new Set(g.factions.map((f) => f?.ruler));
  const win = g.officers.find((o) => o.status === 2 && !rulers.has(o.id) && ![131, 173, 182, 222].includes(o.id) && o.id !== deadId).id;
  g.officers[win].level = level; g.officers[win].weapon = 0; g.officers[win].armor = 0;
  const t = new Tactical(g, win, deadId, 2, () => draw);
  t.units = [{ side: 'a', kind: 'gen', idx: 0, x: 5, y: 4, hp: 50, id: win }, { side: 'd', kind: 'gen', idx: 0, x: 6, y: 4, hp: 0, id: deadId }];
  t.duel = { result: { dead: deadId, winner: win } };
  return { res: t.resolveDuel().res, o: g.officers[win], g };
}
test('单挑斩杀: 马腾 青釭剑, 刘备 龙鳞之铠 (armour only), always', () => {
  let { res, o } = slay(182, { draw: 99 }); assert.deepEqual(res.loot, { id: o.id, eq: 5 }); assert.equal(o.weapon, 5);
  ({ res, o } = slay(222, { draw: 99 })); assert.equal(res.loot.eq, 31); assert.equal(o.armor, 7); assert.equal(o.weapon, 0);
});
test('单挑斩杀: 曹操 倚天剑 below 30 only', () => {
  assert.equal(slay(131, { draw: 29 }).o.weapon, 6);
  const miss = slay(131, { draw: 30 }); assert.equal(miss.res.loot, undefined); assert.equal(miss.o.weapon, 0);
});
test('单挑斩杀: 董卓 七星剑 only for a Lv1–2 winner', () => {
  assert.equal(slay(173, { level: 1 }).o.weapon, 7); assert.equal(slay(173, { level: 2 }).o.weapon, 7);
  assert.equal(slay(173, { level: 3 }).res.loot, undefined);
});
test('单挑斩杀: another ruler gives 龙牙刀 below 50, once a game; a plain officer nothing', () => {
  const g = G.newGame(4, 1, 1), other = g.factions.find((f) => f && f.ruler != null && ![131, 173, 182, 222].includes(f.ruler)).ruler;
  assert.equal(slay(other, { draw: 50, g }).res.loot, undefined); assert.ok(!g.dragonFang);
  assert.equal(slay(other, { draw: 49, g }).o.weapon, 14); assert.equal(g.dragonFang, true);
  assert.equal(slay(other, { draw: 0, g }).res.loot, undefined);
  const rulers = new Set(g.factions.map((f) => f?.ruler));
  const plain = g.officers.find((o) => o.status === 2 && !rulers.has(o.id) && ![131, 173, 182, 222].includes(o.id)).id;
  assert.equal(slay(plain, { g: G.newGame(4, 1, 1) }).res.loot, undefined);
});
test('单挑斩杀: under 不战死 a ruler is still slain, so 马腾 still gives 青釭剑', () => {
  const { res, o } = slay(182, { noWarDeath: true }); assert.equal(res.dead, 182); assert.deepEqual(res.loot, { id: o.id, eq: 5 });
});

// Contact between the generals (feedback R02, 2026-11-02): a 退却 order on the foe's side, his AI withdrawal or a
// 咒缚 on him does not shield him from a 单挑; only a general who has just broken off a duel gets his own next
// action to fall back, so the foe's next step does not pull him straight back into it.
function contact({ foeCmd = 'advance', bind = false } = {}) {
  const g = G.newGame(4, 1, 1), ids = g.officers.filter((o) => o.status === 2).map((o) => o.id);
  const t = new Tactical(g, ids[0], ids[1], 2, () => 0);
  t.map = Array.from({ length: GH }, () => Array(GW).fill(0));
  const a = { side: 'a', kind: 'gen', idx: 0, x: 7, y: 4, hp: 80, id: ids[0] }, d = { side: 'd', kind: 'gen', idx: 0, x: 8, y: 4, hp: 80, id: ids[1] };
  t.units = [a, d];
  t.side.a.cmd.gen = 'advance'; t.side.d.cmd.gen = foeCmd;
  if (bind) t.side.a.fx.bind = 3; // 咒缚 cast by a on d
  return { t, a, d };
}
for (const [label, o] of [['first contact', {}], ['the foe under 退却 orders', { foeCmd: 'retreat' }], ['the foe bound while retreating', { foeCmd: 'retreat', bind: true }], ['the foe waiting', { foeCmd: 'wait' }]]) {
  test(`contact with ${label} starts a 单挑`, () => {
    const { t, a } = contact(o);
    assert.equal(t.act(a).type, 'duel');
  });
}
test('contact with a withdrawing AI side starts a 单挑', () => {
  const { t, a } = contact();
  t.side.d.withdraw = true; t.aiCommands('d');
  assert.equal(t.side.d.cmd.gen, 'retreat');
  assert.equal(t.act(a).type, 'duel');
});
test('the mover under 退却 orders does not start one himself', () => {
  const { t, d } = contact({ foeCmd: 'retreat' });
  assert.notEqual(t.act(d).type, 'duel');
});
// A chase is not contact (devblog #99, 2026-11-03): A519 picks a target only as an action starts, and a step ends the action
// (A5F3 → A9BD → A606) with no second look, so a general who only catches a foe withdrawing at his own pace never meets him.
test('a step that ends beside a withdrawing general does not start a 单挑, as in the original', () => {
  const { t, a, d } = contact();
  t.side.d.withdraw = true; t.aiCommands('d');
  a.x = d.x - 2; a.y = d.y; t.side.a.cmd.gen = 'advance';
  assert.equal(t.act(a).type, 'move');
  assert.equal(Math.abs(a.x - d.x) + Math.abs(a.y - d.y), 1, 'he stands beside him');
  assert.equal(t.act(d).type, 'move', 'and the foe walks off on his own action');
});
test('a general who broke off a 单挑 falls back first; once his action has passed, contact starts one again', () => {
  const { t, a, d } = contact();
  t.startDuel('a'); t.duel.result = { retreated: t.side.d.id };
  t.resolveDuel();
  assert.equal(t.side.d.cmd.gen, 'retreat');
  assert.notEqual(t.act(a).type, 'duel', 'the foe\'s very next step does not re-enter the duel');
  a.x = 7; a.y = 4; // and stands beside him again
  t.side.a.fx.bind = 3; // 咒缚 on him: he cannot get away
  assert.equal(t.act(d).bound, true, 'his own action passes bound in place');
  assert.equal(t.act(a).type, 'duel', 'still beside him after his own action: contact starts a duel');
});

// AI withdrawal counts the men on the field (D32A: a squad that has left the board is not counted; devblog #99, 2026-11-03):
// the player's general alone, his squads off the board with their men kept, is no threat. The kept men still count at the
// end (troops): a squad's 退却 does not lose them.
function standoff({ mine = [[100, false]], foe = [[100, false]], round = 4 } = {}) {
  const g = G.newGame(4, 1, 1), ids = g.officers.filter((o) => o.status === 2).map((o) => o.id);
  const t = new Tactical(g, ids[0], ids[1], 2, () => 0), squad = (side) => ([hp, out, dead], i) => ({ side, kind: 'inf', idx: i + 1, x: out ? -1 : 2 + i, y: side === 'a' ? 1 : 8, hp, out, dead });
  t.human = 'a'; t.round = round;
  t.units = [{ side: 'a', kind: 'gen', idx: 0, x: 0, y: 0, id: ids[0] }, { side: 'd', kind: 'gen', idx: 0, x: GW - 1, y: GH - 1, id: ids[1] }, ...foe.map(squad('a')), ...mine.map(squad('d'))];
  return t;
}
const tens = (n, flag) => Array.from({ length: n }, () => [100, flag]);
const withdraws = (o) => { const t = standoff(o); t.endRound(); return !!t.side.d.withdraw; };
test('an AI side does not withdraw from squads that have left the board', () => {
  assert.equal(withdraws({ foe: tens(10, true) }), false);
});
test('an AI side withdraws from the same men on the board', () => {
  assert.equal(withdraws({ foe: tens(10, false) }), true);
});
test('only the squads still on the board make up the 400 margin', () => {
  assert.equal(withdraws({ foe: [...tens(5, true), ...tens(5, false)] }), false); // 500 is not over 100+400
  assert.equal(withdraws({ foe: [...tens(4, true), ...tens(6, false)] }), true);
});
test("an AI side's own squads off the board do not count as its strength", () => {
  assert.equal(withdraws({ mine: [[100, false], ...tens(2, true)], foe: tens(6, false) }), true);
});
test('a squad off the board still counts in the men kept at the end; a dead one does not', () => {
  const t = standoff({ foe: [[100, true], [60, false], [40, false, true]] });
  assert.equal(t.troops('a'), 160); assert.equal(t.fielded('a'), 60);
});
test('the AI 咒缚 reads the men on the board too', () => {
  const t = standoff({ mine: tens(6, false), foe: tens(9, true) });
  t.side.d.tp = 3; t.aiTactic('d');
  assert.equal(t.side.d.tp, 0, 'a general alone on the board, 900 men off it: under 200, so the 3 points go on 咒缚');
});

// 爆炎 is an instant blow, so the player may throw it while another tactic of theirs runs (devblog #131, 2026-11-04);
// the other tactics still wait for it to lapse, and the AI keeps the original's rule (AAF0: nothing while one runs).
function blastField() {
  const g = G.newGame(4, 1, 1), ids = g.officers.filter((o) => o.status === 2).map((o) => o.id);
  const t = new Tactical(g, ids[0], ids[1], 2, () => 0);
  t.side.a.tp = t.side.d.tp = 24;
  t.units = [
    { side: 'a', kind: 'gen', idx: 0, x: 4, y: 4, hp: 80, id: ids[0] }, { side: 'd', kind: 'gen', idx: 0, x: 11, y: 4, hp: 80, id: ids[1] },
    { side: 'a', kind: 'inf', idx: 1, x: 9, y: 3, hp: 100 }, { side: 'a', kind: 'inf', idx: 2, x: 9, y: 4, hp: 100 }, { side: 'a', kind: 'inf', idx: 3, x: 9, y: 5, hp: 100 },
    { side: 'd', kind: 'inf', idx: 1, x: 6, y: 3, hp: 100 }, { side: 'd', kind: 'inf', idx: 2, x: 6, y: 4, hp: 100 }, { side: 'd', kind: 'inf', idx: 3, x: 6, y: 5, hp: 100 },
  ];
  return t;
}
for (const fx of ['bind', 'xbow', 'fire', 'morale']) test(`爆炎 can be thrown while our ${fx} runs, and it leaves the effect running`, () => {
  const t = blastField(); t.side.a.fx[fx] = 3;
  assert.equal(t.canTactic('a', 'blast'), true);
  const ev = t.tactic('a', 'blast');
  assert.equal(ev.ok, true); assert.equal(ev.hits.length, 3, 'the 3×3 two cells ahead holds three squads');
  assert.equal(t.side.a.tp, 12); assert.equal(t.side.a.fx[fx], 3);
});
test('the other tactics still wait while one runs', () => {
  const t = blastField(); t.side.a.fx.bind = 3;
  for (const id of ['bind', 'taunt', 'xbow', 'morale', 'fire']) {
    assert.equal(t.canTactic('a', id), false, id);
    assert.equal(t.tactic('a', id).ok, false, id);
  }
  assert.equal(t.side.a.tp, 24, 'nothing spent');
});
test('爆炎 still needs its 12 points while another tactic runs', () => {
  const t = blastField(); t.side.a.fx.bind = 3; t.side.a.tp = 11;
  assert.equal(t.tactic('a', 'blast').ok, false); assert.equal(t.side.a.tp, 11);
});
test('the AI keeps the rule: no 爆炎 while its own tactic runs, the same field draws one when none does', () => {
  const free = blastField(); free.aiTactic('d');
  assert.equal(free.side.d.tp, 12, 'three squads in reach: the AI throws 爆炎');
  const held = blastField(); held.side.d.fx.bind = 3; held.aiTactic('d');
  assert.equal(held.side.d.tp, 24, 'under its own 咒缚 the AI casts nothing');
  assert.equal(held.events?.length ?? 0, 0);
});

// 爆炎 flies along the general's facing (Angurvadel@bilibili, D87; the original's B211→B25B, replayed by
// tools/replay_skirmish_blast_facing_probes.py): two cells from where he stands, up, down, left or right; a march sets the
// facing and keeps it, a blow or a shot turns him for the stroke alone (A61D / A75B write the byte back). The attacker
// starts facing right, the defender left (B548). A landing off the board is no blast (B440): the points go, nothing bursts.
function faceField(side, at = [8, 5]) {
  const g = G.newGame(4, 1, 1), ids = g.officers.filter((o) => o.status === 2).map((o) => o.id);
  const t = new Tactical(g, ids[0], ids[1], 2, () => 0);
  t.map = Array.from({ length: GH }, () => Array(GW).fill(0));
  t.side.a.tp = t.side.d.tp = 24;
  const foe = side === 'a' ? 'd' : 'a';
  t.units = [{ side, kind: 'gen', idx: 0, x: at[0], y: at[1], hp: 80, id: t.side[side].id }, { side: foe, kind: 'gen', idx: 0, x: 0, y: 0, hp: 80, id: t.side[foe].id }];
  return { t, gen: t.units[0] };
}
for (const side of ['a', 'd']) {
  test(`爆炎 of side ${side} lands where the general faces, two cells off`, () => {
    for (const [face, at] of [[[0, -1], [8, 3]], [[0, 1], [8, 7]], [[-1, 0], [6, 5]], [[1, 0], [10, 5]]]) {
      const { t, gen } = faceField(side); gen.face = face;
      const ev = t.tactic(side, 'blast');
      assert.equal(ev.ok, true); assert.deepEqual(ev.center, at, String(face));
    }
  });
  test(`side ${side} starts facing ${side === 'a' ? 'right' : 'left'}, as the original deploys`, () => {
    const g = G.newGame(4, 1, 1), ids = g.officers.filter((o) => o.status === 2).map((o) => o.id);
    const t = new Tactical(g, ids[0], ids[1], 2, () => 0);
    for (const u of t.units.filter((x) => x.side === side)) assert.deepEqual(u.face, side === 'a' ? [1, 0] : [-1, 0]);
  });
}
test('a march turns the general and he keeps facing that way; a blow turns him only for the stroke', () => {
  const { t, gen } = faceField('a'); t.units[1].x = 8; t.units[1].y = 0; // the foe general straight up
  t.side.a.cmd.gen = 'advance';
  const ev = t.act(gen);
  assert.equal(ev.type, 'move'); assert.deepEqual(ev.to, [8, 4]); assert.deepEqual(gen.face, [0, -1]);
  assert.deepEqual(t.tactic('a', 'blast').center, [8, 2], 'thrown up the column he marched');
  const foe = { side: 'd', kind: 'inf', idx: 1, x: 9, y: 4, hp: 100 }; t.units.push(foe);
  assert.equal(t.act(gen).type, 'attack'); assert.deepEqual(gen.face, [0, -1], 'striking the squad on his right leaves him facing up');
});
test('爆炎 landing off the board bursts nowhere: the 12 points go, no squad is hit', () => {
  const { t, gen } = faceField('a', [8, 1]); gen.face = [0, -1];
  t.units.push({ side: 'd', kind: 'inf', idx: 1, x: 8, y: 0, hp: 100 });
  assert.equal(t.blastAt('a'), null, 'no landing cell');
  const ev = t.tactic('a', 'blast');
  assert.equal(ev.ok, true); assert.equal(ev.center, null); assert.deepEqual(ev.hits, []); assert.equal(t.side.a.tp, 12);
  gen.y = 2; assert.deepEqual(t.blastAt('a'), [8, 0], 'the top row is still on the board');
});
test('the AI counts the 3×3 one to three cells before its general, by his facing, as the original (D4AA)', () => {
  // the original's tables for up and down are each other's: facing up it counts the squads below him (and throws up)
  for (const [face, cells, want] of [
    [[1, 0], [[9, 5], [10, 4], [11, 6]], true], [[1, 0], [[12, 5], [10, 7]], false], // right: x+1..3, y−1..1; x+4 or y+2 is out
    [[-1, 0], [[7, 5], [5, 4]], true], [[0, -1], [[8, 6], [7, 8]], true], [[0, -1], [[8, 4], [7, 2]], false], [[0, 1], [[8, 4], [9, 2]], true],
  ]) {
    const { t, gen } = faceField('d'); gen.face = face; t.units[1].x = 15; t.units[1].y = 9;
    cells.forEach(([x, y], i) => t.units.push({ side: 'a', kind: 'inf', idx: i + 1, x, y, hp: 100 }));
    t.aiTactic('d');
    assert.equal(t.events?.[0]?.id === 'blast', want, `${face} ${JSON.stringify(cells)}`);
  }
});

// The tactic badges (暴力倾向@devblog, 2026-11-13) read effects(): what works on a side, whoever cast it. 咒缚's counter is kept on
// the caster (act() reads it there), so the bound general's side is the other one; 强弩 and 火矢 are the side's own archers', 士气向上
// every unit's; a counter that has run out is gone.
test('effects() names what works on each side: the foe\'s 咒缚 on its general, its own 强弩 / 火矢 / 士气向上', () => {
  const { t } = board('a', []);
  assert.deepEqual([t.effects('a'), t.effects('d')], [[], []], 'nothing runs at first');
  t.side.a.fx.bind = 4; t.side.d.fx.xbow = 3;
  assert.deepEqual(t.effects('a'), [], 'the caster of 咒缚 wears nothing for it');
  assert.deepEqual(t.effects('d'), [{ id: 'bind', n: 4, on: 'gen', bad: true }, { id: 'xbow', n: 3, on: 'arc' }]);
  t.side.a.fx = { bind: 0, fire: 2 }; t.side.d.fx = { xbow: 0, morale: 1 };
  assert.deepEqual(t.effects('a'), [{ id: 'fire', n: 2, on: 'arc' }]);
  assert.deepEqual(t.effects('d'), [{ id: 'morale', n: 1, on: 'all' }]);
  // an AI cast settles at the round's end and is told by its queued event: nothing shows until that event has gone out
  t.side.a.fx = { bind: 4 }; t.side.d.fx = { xbow: 3 }; t.events = [{ type: 'tactic', side: 'a', id: 'bind', ok: true }, { type: 'tactic', side: 'd', id: 'xbow', ok: true }];
  assert.deepEqual([t.effects('a'), t.effects('d')], [[], []], 'not before the banner');
  t.events.shift();
  assert.deepEqual(t.effects('d'), [{ id: 'bind', n: 4, on: 'gen', bad: true }], 'the 咒缚 once told; the 强弩 still waits');
  t.events.shift();
  assert.deepEqual(t.effects('d').map((e) => e.id), ['bind', 'xbow']);
});

// 全军待机 / 全军包围 (the console's 全军 buttons): one order for every troop type; 全军撤退 is the same call.
test('commandAll gives every troop type the one order', () => {
  const g = G.newGame(4, 1, 1), ids = g.officers.filter((o) => o.status === 2).map((o) => o.id), b = new Tactical(g, ids[0], ids[1], 2, () => 0);
  b.side.a.cmd.gen = 'retreat';
  for (const c of ['wait', 'surround']) { b.commandAll('a', c); assert.deepEqual(Object.values(b.side.a.cmd), ['wait', 'wait', 'wait', 'wait'].map(() => c)); }
  assert.ok(Object.values(b.side.d.cmd).every((c) => c !== 'surround'), "the foe's orders are his own");
  b.withdrawAll('a'); assert.ok(Object.values(b.side.a.cmd).every((c) => c === 'retreat'));
  assert.throws(() => b.commandAll('a', 'charge'), /unknown command/);
});
