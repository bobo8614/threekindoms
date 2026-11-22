// D159 (冰@devblog #590/#611): an AI ruler behind another officer, beaten on his last city with nowhere to retreat,
// goes 下野 alive as in the original (`bank8:$BD3E` overwrites the ruler ID kept in $02) and can be found by 搜索.
// docs/原版非太守君主下野兼容_交接_2026-11-21.md
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as G from '../src/core/game.js';
import { housekeeping } from '../src/core/ai.js';
import { Field } from '../src/core/field.js';
import { setupWar, resolveWar, autoBattle } from '../src/core/warcore.js';
import { warFate } from '../src/warreport.js';
G.setData(JSON.parse(readFileSync(new URL('../data/game-data.json', import.meta.url))));

const SUN = 138, CHEN = 158, CHENG = 164, LIU = 222, ZHAO = 144;
const YANG = 16, JIANAN = 17; // 扬州 → 建安; 建安's roads: 建业 15, 扬州 16, 江夏 20, 交州 18
const quiet = { event: async () => {}, chooseHeir: async (_, ids) => ids[0] };

function world(player, { jianan = [CHEN, CHENG, SUN], open = null } = {}) {
  const g = G.newGame(player, 1, 1);
  for (const c of g.cities) { c.faction = G.NONE; c.officers = []; }
  const put = (id, f, ids) => { g.cities[id].faction = f; g.cities[id].officers = ids; for (const i of ids) { g.officers[i].status = G.SERVING; g.officers[i].soldiers = 500; } };
  put(YANG, 4, [LIU, ZHAO]); put(JIANAN, 3, jianan);
  for (const [c, id] of [[15, 131], [20, 86], [18, 99]]) if (c !== open) put(c, 2, [id]);
  g.factions[3].city = JIANAN;
  return g;
}
// 扬州 attacks 建安; a 火箭 on the defending commander burns his last rice and the defence falls on rice (#611).
function battle(g, human) {
  const war = setupWar(g, { from: YANG, to: JIANAN, ids: [LIU], commander: LIU, gold: 0, rice: 500 });
  const field = new Field(g, war, human);
  const caster = field.side('att')[0], target = field.side('def')[0];
  caster.x = target.x + 1; caster.y = target.y;
  field.chest('def').rice = 5;
  assert.ok(Array.from({ length: 100 }).some(() => field.cast(caster, 5, target, true).hit));
  field.turn = 'def'; field.endTurn();
  assert.deepEqual(field.over, { loser: 'def', why: 'rice' });
  const res = field.result();
  resolveWar(g, war, res);
  return { war, res, fate: (id) => warFate(g, war, res, id)[0] };
}
const record = (g) => G.upgrade(JSON.parse(JSON.stringify({ ...g, version: G.SAVE_VERSION })));

test('the AI ruler retreat (C50E) leaves 孙策 behind 建安\'s 太守 only when one ahead of him already has loyalty 100 (C9A5)', () => {
  for (const [loyal, roster] of [[100, [CHEN, CHENG, SUN]], [null, [SUN, CHENG, CHEN]]]) {
    const g = G.newGame(4, 1, 1);
    for (const c of g.cities) { c.faction = G.NONE; c.officers = []; }
    const put = (id, f, ids) => { g.cities[id].faction = f; g.cities[id].officers = ids; for (const i of ids) g.officers[i].status = G.SERVING; };
    put(YANG, 3, [SUN, 67]); put(JIANAN, 3, [CHEN, CHENG]); put(20, 3, [140]); put(18, 3, [141]); put(15, 3, [142]); put(11, 4, [LIU]);
    g.factions[3].city = YANG;
    if (loyal) g.officers[CHEN].loyalty = loyal;
    housekeeping(g, 3, G.rng(g), () => {});
    assert.equal(g.factions[3].city, JIANAN);
    assert.deepEqual(g.cities[JIANAN].officers, roster);
  }
});

test('扬州 → 建安: 孙策 behind 陈武 goes 下野 in 建安, his house falls, and 搜索 there brings him in', async () => {
  const g = world(4), b = battle(g, 'att');
  assert.deepEqual(b.war.def.ids.slice(0, 1), [CHEN], '陈武 commands the defence');
  assert.deepEqual(b.res.adrift, [SUN]);
  const before = JSON.stringify(g);
  assert.equal(b.fate(SUN), '下野（建安）');
  assert.equal(b.fate(CHEN), '下野（建安）');
  assert.equal(JSON.stringify(g), before, 'reading the report changes nothing');
  assert.equal(g.cities[JIANAN].faction, 4);
  const events = [];
  await G.checkFactions(g, { ...quiet, event: async (e) => events.push(e) }, b.res.adrift);
  assert.deepEqual(events.filter((e) => e.faction === 3), [{ type: 'fall', faction: 3 }]); // the others had no city in this world
  assert.equal(g.factions[3].ruler, null); assert.equal(g.factions[3].fallen, SUN);
  assert.equal(g.officers[SUN].status, G.RONIN); assert.equal(g.officers[SUN].loc, JIANAN);
  assert.equal(G.isRuler(g, SUN), false);
  assert.equal(G.factionName(g, 3), '孙策');
  // A record saved now keeps him 下野; a later faction check (an AI war, say) does not kill him.
  const saved = record(g);
  assert.equal(saved.officers[SUN].status, G.RONIN); assert.equal(saved.factions[3].fallen, SUN);
  await G.checkFactions(saved, quiet);
  assert.equal(saved.officers[SUN].status, G.RONIN);
  // 搜索 in 建安: the first ronin here or next door is him.
  let got = null;
  for (let i = 0; i < 400 && got !== SUN; i++) {
    const r = G.search(saved, JIANAN, LIU);
    got = r.joined ?? (r.offer === SUN ? G.hire(saved, JIANAN, SUN, 0).joined : null);
  }
  assert.equal(got, SUN);
  assert.equal(saved.officers[SUN].status, G.SERVING);
  assert.ok(saved.cities[JIANAN].officers.includes(SUN));
  const again = record(saved);
  assert.equal(again.officers[SUN].status, G.SERVING); assert.equal(G.officerCity(again, SUN).id, JIANAN);
  // As decided for a ruler taken prisoner (2026-11-13): the fallen house's 自动出仕 queue follows him where he serves.
  again.year = 192;
  assert.deepEqual(G.followJoin(again, 3), { id: G.joinQueue(3)[0], city: JIANAN, faction: 4, lord: SUN });
});

test('controls: 孙策 at the head, an open 交州, a human 孙策 and a house with a city left keep the old outcomes', async () => {
  // At the head of the queue (he is 太守 and commander): dies.
  let g = world(4, { jianan: [SUN, CHEN, CHENG] }), b = battle(g, 'att');
  assert.deepEqual(b.res.adrift, []);
  assert.match(b.fate(SUN), /无路可退，身亡/);
  await G.checkFactions(g, quiet, b.res.adrift);
  assert.equal(g.officers[SUN].status, G.DEAD);
  // 交州 ownerless: the whole queue retreats there, 孙策 still in office.
  g = world(4, { open: 18 }); b = battle(g, 'att');
  assert.deepEqual(b.res.adrift, []);
  assert.equal(b.fate(SUN), '退往交州');
  await G.checkFactions(g, quiet, b.res.adrift);
  assert.equal(g.officers[SUN].status, G.SERVING); assert.equal(g.factions[3].ruler, SUN);
  // The player is 孙策: the human settlement kills him (`bank13:$CDB8`).
  g = world(3); b = battle(g, 'def');
  assert.deepEqual(b.res.adrift, []);
  assert.match(b.fate(SUN), /无路可退，身亡/);
  await G.checkFactions(g, quiet, b.res.adrift);
  assert.equal(g.officers[SUN].status, G.DEAD);
  // A city left elsewhere (豫州, off 建安's roads): no ghost house with a 下野 ruler; he dies and an heir takes over.
  g = world(4); g.cities[14].faction = 3; g.cities[14].officers = [140]; g.officers[140].status = G.SERVING;
  b = battle(g, 'att');
  assert.deepEqual(b.res.adrift, []);
  await G.checkFactions(g, quiet, b.res.adrift);
  assert.equal(g.officers[SUN].status, G.DEAD); assert.equal(g.factions[3].ruler, 140);
});

test('controls: an AI-vs-AI war on 建安 is settled as before', async () => {
  const g = world(1);
  g.cities[YANG].faction = 2; g.cities[YANG].officers = [132, 133, 134]; // one stays: 扬州 is no ownerless way out
  for (const id of [CHEN, CHENG]) g.officers[id].loyalty = 100; // nobody taken: the queue stays 陈武, 程秉, 孙策
  for (const id of [132, 133, 134]) { g.officers[id].status = G.SERVING; g.officers[id].soldiers = 2000; }
  const war = setupWar(g, { from: YANG, to: JIANAN, ids: [132, 133], commander: 132, gold: 0, rice: 1000 });
  war.def.rice = 0;
  const out = autoBattle(g, war);
  assert.equal(out.attWins, true);
  assert.deepEqual(out.adrift, []);
  await G.checkFactions(g, quiet, out.adrift);
  assert.equal(g.officers[SUN].status, G.DEAD);
  assert.equal(g.officers[CHEN].status, G.RONIN);
});
