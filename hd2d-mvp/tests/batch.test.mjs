// Commands carried out several times from one confirmation (宙斯之刃@bilibili, 2026-11-16; src/core/batch.js): each time is the
// command itself, so a run leaves the game exactly as giving the same commands one by one would, and stops where the next could
// not be given. Rules only, in Node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as G from '../src/core/game.js';
import * as B from '../src/core/batch.js';

const D = JSON.parse(readFileSync(new URL('../data/game-data.json', import.meta.url)));
G.setData(D);

// A game whose home city has a 书馆 and a 病院, three officers in it besides the ruler.
function setup(seed = 7) {
  const g = G.newGame(4, 1, 1), cid = D.cities.findIndex((c) => c.facilities.school && c.facilities.hospital);
  const c = g.cities[cid], ruler = g.factions[g.player].ruler, home = g.cities[g.factions[g.player].city];
  // The ruler, and three officers taken from another faction's cities, moved here.
  const others = g.cities.filter((x) => x.faction !== g.player && x.faction !== G.NONE && x.id !== cid).flatMap((x) => x.officers.filter((id) => !G.isRuler(g, id)).map((id) => [x, id])).slice(0, 3);
  for (const [x, id] of others) x.officers = x.officers.filter((y) => y !== id);
  home.officers = home.officers.filter((y) => y !== ruler); if (!home.officers.length) home.faction = G.NONE;
  for (const id of c.officers) { const x = g.cities.find((y) => y !== c && y.faction === c.faction); if (x) x.officers.push(id); }
  c.faction = g.player; c.officers = [ruler, ...others.map(([, id]) => id)]; g.factions[g.player].city = cid;
  c.gold = 2000; c.rice = 2000; g.books = 12; g.seed = seed;
  return { g, cid, c, ids: c.officers.slice(1, 4) };
}
const state = (g) => JSON.stringify({ seed: g.seed, cities: g.cities, officers: g.officers.map((o) => [o.hp, o.int, o.loyalty]) });

test('病院 until full, three officers: the same as healing each by hand until he is full', () => {
  const a = setup(), b = setup();
  for (const x of [a, b]) for (const id of x.ids) x.g.officers[id].hp = 10;
  const res = B.healRun(a.g, a.cid, a.ids, { until: true });
  let n = 0; for (const id of b.ids) while (G.heal(b.g, b.cid, id).ok) n++;
  assert.equal(state(a.g), state(b.g));
  assert.equal(res.books, n, `one book a time: ${res.msg}`);
  assert.equal(res.lines.length, 3);
  assert.ok(a.ids.every((id) => a.g.officers[id].hp === G.maxHp(a.g.officers[id])), 'all three full');
  assert.match(res.msg, /体力 \+\d+（\d 次）/);
});

test('病院 once each stops when the books run out, and tells one officer once as it always did', () => {
  const { g, cid, ids } = setup();
  for (const id of ids) g.officers[id].hp = 10;
  const res = B.healRun(g, cid, ids, { books: 2 });
  assert.equal(res.books, 2); assert.equal(res.lines.length, 2);
  assert.equal(g.officers[ids[2]].hp, 10, 'the third was not reached');
  const one = B.healRun(g, cid, [ids[2]]);
  assert.match(one.msg, /^\S+ 体力 \+\d+$/);
});

test('书馆 until 80 stops at the gold, and says so', () => {
  const a = setup(), b = setup();
  for (const x of [a, b]) { for (const id of x.ids) x.g.officers[id].int = 30; x.c.gold = 100; }
  const res = B.studyRun(a.g, a.cid, a.ids, { until: true });
  for (const id of b.ids) { let r; while ((r = G.study(b.g, b.cid, id)).ok); if (r.msg === '金不足') break; }
  assert.equal(state(a.g), state(b.g));
  assert.match(res.msg, /金不足，其余未执行/);
  assert.match(res.msg, /共花费\d+金/);
  const s = setup(); s.g.officers[s.ids[0]].int = 30;
  // 30 +5 (30 金), 35 → 67 by +8 four times (20 金 each), 67 → 85 by +6 three times (10 金 each): the dice at their lowest.
  assert.deepEqual(B.studyNeed(s.g, s.ids[0], true), { n: 8, gold: 140 });
  assert.deepEqual(B.studyNeed(s.g, s.ids[0], false), { n: 1, gold: 30 });
});

test('赏赐 until 90: the same as rewarding by hand, and nobody past 90 is given more', () => {
  const a = setup(), b = setup();
  for (const x of [a, b]) for (const id of x.ids) x.g.officers[id].loyalty = 60;
  const res = B.rewardRun(a.g, a.cid, a.ids, { gold: 100, until: true });
  for (const id of b.ids) while (G.reward(b.g, b.cid, id, 100).ok);
  assert.equal(state(a.g), state(b.g));
  assert.ok(a.ids.every((id) => a.g.officers[id].loyalty >= 90));
  assert.ok(res.lines.every((l) => l.n >= 1));
});

test('赏赐 until 90 stops at a gift that raised nothing, rather than spending every book on +0', () => {
  const { g, cid, ids } = setup();
  g.officers[g.factions[g.player].ruler].virtue = 5; g.officers[ids[0]].loyalty = 50; // (0 + 10/20) × (7–10) / 10 = 0
  const res = B.rewardRun(g, cid, ids.slice(0, 1), { gold: 10, until: true });
  assert.equal(res.books, 1, res.msg);
  assert.match(res.msg, /这次没有提高，其余未执行/);
});

test('a run the books cut short says so; one that ends with the last book on the last one does not', () => {
  const { g, cid, ids } = setup();
  for (const id of ids) g.officers[id].hp = 10;
  assert.match(B.healRun(g, cid, ids, { books: 2 }).msg, /命令书已用完，其余未执行/);
  const h = setup(); h.g.officers[h.ids[0]].hp = G.maxHp(h.g.officers[h.ids[0]]) - 20;
  assert.doesNotMatch(B.healRun(h.g, h.cid, h.ids.slice(0, 1), { until: true, books: 1 }).msg, /命令书已用完/);
});

test('赈济 several times stops at 统治度 100', () => {
  const { g, cid, c } = setup();
  c.gov = 95;
  const res = B.charityRun(g, cid, 100, 100, 5);
  assert.equal(c.gov, 100);
  assert.ok(res.books < 5 && /统治度已满，其余未执行/.test(res.msg), res.msg);
});

test('离间 n times: the same as by hand; 诱纳 stops at the one that takes', () => {
  const pick = (g) => { const t = g.cities.find((x) => x.faction !== G.NONE && x.faction !== g.player && x.officers.some((id) => !G.isRuler(g, id))); return t.officers.find((id) => !G.isRuler(g, id)); };
  const a = setup(), b = setup();
  const actor = a.c.officers[0], tid = pick(a.g);
  for (const x of [a, b]) { Object.assign(x.g.officers[actor], { int: 90, virtue: 90 }); x.g.officers[tid].loyalty = 70; }
  const res = B.sowRun(a.g, actor, tid, 4);
  for (let i = 0; i < 4; i++) G.sow(b.g, actor, tid);
  assert.equal(state(a.g), state(b.g));
  assert.equal(res.books, 4);
  const l = setup(3); l.g.officers[tid].loyalty = 0; Object.assign(l.g.officers[actor], { int: 100, virtue: 100, level: 5 });
  const lr = B.lureRun(l.g, l.cid, actor, tid, 10);
  assert.equal(lr.joined, tid, lr.msg);
  assert.match(lr.msg, /（第 \d+ 次）$/);
  assert.ok(l.c.officers.includes(tid));
});

test('搜索 n times adds up the finds and stops at the first who is met', () => {
  const { g, cid, c, ids } = setup();
  const before = { gold: c.gold, rice: c.rice };
  const res = B.searchRun(g, cid, ids[0], 6);
  assert.equal(res.steps.length, res.books);
  const met = (r) => r.joined != null || r.offer != null || r.refused != null;
  assert.ok(res.steps.slice(0, -1).every((r) => !met(r)), 'no one met before the last');
  assert.ok(res.books === 6 || met(res.last));
  assert.deepEqual([c.gold - before.gold, c.rice - before.rice], [res.found.gold, res.found.rice]);
});

// ---------- 计略 several times in a row (羽之@devblog, 2026-11-18; B.castRun) ----------
// Each time is field.cast itself: the same rolls in the same order, the same mobility, experience and levels as casting one by one.
import { Field, FOREST } from '../src/core/field.js';
import { setupWar } from '../src/core/warcore.js';

// A field where the caster stands at (10,10) on forest and one foe at (12,10) with plenty of soldiers; a second foe beside him.
function war(seed = 11) {
  const g = G.newGame(4, 1, 1);
  const to = g.cities.find((c) => c.faction !== G.NONE && c.faction !== g.player && c.officers.length >= 2);
  const from = g.cities[g.factions[g.player].city], id = from.officers[0];
  g.seed = seed;
  const f = new Field(g, setupWar(g, { from: from.id, to: to.id, ids: [id], commander: id, gold: 100, rice: 9000 }), 'att');
  f.terr = () => FOREST;
  const me = f.alive.find((u) => u.side === 'att'), foes = f.alive.filter((u) => u.side === 'def');
  me.x = 10; me.y = 10;
  foes.forEach((e, i) => { if (i < 2) { e.x = 12; e.y = 10 + i; f.O(e.id).soldiers = 3000; e.commander = i === 1; } else { e.x = 30 - i; e.y = 1; } });
  Object.assign(f.O(me.id), { level: 1, exp: 0, int: 90, war: 70 }); // ten 计略 known (stratCount)
  f.turn = 'att'; f.pool.att = 40;
  return { g, f, me, t: foes[0], o: f.O(me.id) };
}
const fieldState = (x) => JSON.stringify({ seed: x.g.seed, pool: x.f.pool, units: x.f.units.map((u) => [u.id, u.side, u.gone, u.stop ?? 0, u.qimen ?? 0]), officers: x.g.officers.map((o) => [o.soldiers, o.hp, o.exp, o.level, o.loyalty]), log: x.f.log });

test('castRun ×N leaves the field exactly as N casts one by one: rolls, mobility, experience, level', () => {
  for (const seed of [11, 12, 13]) {
    const a = war(seed), b = war(seed);
    const run = B.castRun(a.f, a.me, 0, a.t, 6);
    const one = []; for (let i = 0; i < 6 && b.f.canCast(b.me, 0, b.t); i++) one.push(b.f.cast(b.me, 0, b.t));
    assert.equal(fieldState(a), fieldState(b), `seed ${seed}`);
    assert.deepEqual(run.steps.map((s) => [s.hit, s.lines]), one.map((s) => [s.hit, s.lines]));
    assert.equal(run.steps.length, 6); assert.equal(run.stop, null);
    assert.equal(a.f.pool.att, 40 - 36, 'each time paid its own 6');
  }
});

test('castRun: a failure does not stop the run', () => {
  const x = war(); x.f.hitChance = () => 0; // roll100 is never under 0
  const run = B.castRun(x.f, x.me, 0, x.t, 3);
  assert.deepEqual(run.steps.map((s) => s.hit), [false, false, false]);
  assert.equal(run.stop, null); assert.equal(x.f.pool.att, 40 - 18);
});

test('castRun stops at a target slain, at 笼络 and 虚兵 that took, and at a target with no soldiers left; the rest is not paid', () => {
  // 陷阱 on a target with 1 体力: the first hit slays him.
  let x = war(); x.f.r = () => 0; x.f.O(x.t.id).hp = 1;
  let run = B.castRun(x.f, x.me, 1, x.t, 4);
  assert.equal(run.steps.length, 1); assert.equal(run.stop?.why, 'gone'); assert.match(run.stop.msg, /阵亡|被擒/);
  assert.equal(x.f.pool.att, 40 - 5, 'only the one cast was paid');
  // 笼络: he comes over on the first hit.
  x = war(); x.f.r = () => 0; x.f.O(x.t.id).loyalty = 20;
  run = B.castRun(x.f, x.me, 8, x.t, 3);
  assert.equal(run.steps.length, 1); assert.equal(x.t.side, 'att'); assert.equal(run.stop?.why, 'took'); assert.match(run.stop.msg, /已倒戈/);
  // 虚兵: the first that takes ends it (the ROM would let it be cast again, resetting the days).
  x = war(); x.f.r = () => 0;
  run = B.castRun(x.f, x.me, 2, x.t, 5);
  assert.equal(run.steps.length, 1); assert.ok(x.t.stop > 0); assert.equal(run.stop?.why, 'took');
  // A miss first, then the hit: 虚兵 tried until it takes.
  x = war(); let k = 0; const real = x.f.hitChance.bind(x.f); x.f.hitChance = (...a) => (k++ ? 100 : 0);
  run = B.castRun(x.f, x.me, 2, x.t, 5);
  assert.deepEqual(run.steps.map((s) => s.hit), [false, true]); x.f.hitChance = real;
  // 火计 on 50 soldiers: the first hit takes them all, the next would take 0.
  x = war(); x.f.r = () => 0; x.f.O(x.t.id).soldiers = 50;
  run = B.castRun(x.f, x.me, 0, x.t, 4);
  assert.equal(run.steps.length, 1); assert.equal(x.f.O(x.t.id).soldiers, 0);
  assert.equal(run.stop?.why, 'nothing'); assert.match(run.stop.msg, /兵尽$/);
  assert.equal(x.f.pool.att, 40 - 6);
  // A hit that took nothing ends the run (a 火计 cast on a target already at 0).
  x = war(); x.f.r = () => 0; x.f.O(x.t.id).soldiers = 0;
  run = B.castRun(x.f, x.me, 0, x.t, 3);
  assert.equal(run.steps.length, 1); assert.equal(run.stop?.why, 'nothing');
  // One time only (n = 1) is the cast itself, as ever.
  const a = war(), b = war();
  assert.deepEqual(B.castRun(a.f, a.me, 0, a.t, 1).steps[0], b.f.cast(b.me, 0, b.t));
});

test('castRun stops at the mobility and at a target that no longer meets the condition', () => {
  let x = war(); x.f.pool.att = 13; x.f.hitChance = () => 0;
  let run = B.castRun(x.f, x.me, 0, x.t, 3);
  assert.equal(run.steps.length, 2); assert.equal(run.stop?.why, 'pool');
  x = war(); x.f.hitChance = () => 0;
  const cast = x.f.cast.bind(x.f); x.f.cast = (...a) => { const r = cast(...a); x.t.x = 20; return r; }; // he walks out of reach after the first
  run = B.castRun(x.f, x.me, 0, x.t, 3);
  assert.equal(run.steps.length, 1); assert.equal(run.stop?.why, 'illegal'); assert.match(run.stop.msg, /不符合火计的条件/);
});
