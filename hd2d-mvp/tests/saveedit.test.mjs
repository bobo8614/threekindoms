// Save editor rules (save-editor.html): edits stay inside the game's own ranges, alliances change on both sides,
// and an edited record still runs a strategic month. Rules only, in Node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as G from '../src/core/game.js';
import { setOfficer, setCity, setAlliance, checkRecord, hpText, officerFields } from '../src/core/saveedit.js';
import { mergePack, withBaseMap } from '../src/core/pack.js';
import { aiTurn } from '../src/core/ai.js';
const D = JSON.parse(readFileSync(new URL('../data/game-data.json', import.meta.url)));
G.setData(D);

test('officer and city values are clamped to the game ranges', () => {
  const g = G.newGame(4, 1, 1);
  assert.equal(setOfficer(g, 0, 'war', 250), 99);
  assert.equal(setOfficer(g, 0, 'loyalty', -5), 0);
  assert.equal(setOfficer(g, 0, 'soldiers', 5000), 1000);
  assert.equal(setOfficer(g, 0, 'armor', 7), 7);
  assert.equal(setOfficer(g, 0, 'status', 2), null, 'status is not editable');
  assert.equal(setOfficer(g, 0, 'war', 'abc'), null);
  assert.equal(setCity(g, 2, 'gold', 123456), 9999);
  assert.equal(setCity(g, 2, 'industry', 5000), 999);
  assert.equal(setCity(g, 2, 'gov', 150), 100); // 统治 up to 100, as 开发 and 施舍 reach
  assert.equal(setCity(g, 2, 'reserve', 20000), 10000); // 后备兵 up to 10000, as 征兵 fills it
  assert.equal(g.officers[0].war, 99); assert.equal(g.cities[2].gold, 9999); assert.equal(g.edited, true);
});

test('a dead officer keeps hp 0', () => {
  const g = G.newGame(4, 1, 1); g.officers[0].status = G.DEAD; g.officers[0].hp = 0;
  assert.equal(setOfficer(g, 0, 'hp', 80), null); assert.equal(g.officers[0].hp, 0);
});

test('editing 体力 sets 体力上限 to the same value, and the 病院 heals to the edited cap', () => {
  const g = G.newGame(4, 1, 1), cid = g.cities.findIndex((c) => D.cities[c.id].facilities.hospital && c.officers.length);
  const id = g.cities[cid].officers[0], o = g.officers[id];
  assert.equal(G.maxHp(o), D.officers[id].hp, 'no edit: the ROM template');
  assert.equal(setOfficer(g, id, 'hp', 99), 99); assert.equal(G.maxHp(o), 99); assert.equal(hpText(o), '99/99');
  assert.equal(setOfficer(g, id, 'hp', 40), 40); assert.equal(G.maxHp(o), 40, 'the cap follows down too');
  assert.equal(G.maxHp(JSON.parse(JSON.stringify(g)).officers[id]), 40, 'kept in the record');
  g.cities[cid].gold = 999;
  assert.equal(G.heal(g, cid, id).ok, false, 'full at the edited cap');
  setOfficer(g, id, 'hp', 99); o.hp = 60;
  assert.ok(G.heal(g, cid, id).ok); assert.ok(o.hp > 60 && o.hp <= 99, '病院 heals toward the edited cap');
});

test('alliances are set on both sides and capped at 12 months', () => {
  const g = G.newGame(4, 1, 1);
  assert.equal(setAlliance(g, 4, 1, 30), 12);
  assert.equal(g.factions[4].alliance[1], 12); assert.equal(g.factions[1].alliance[4], 12);
  assert.equal(setAlliance(g, 4, 4, 5), null);
});

test('records are checked before import', () => {
  assert.ok(checkRecord(null)); assert.ok(checkRecord({ officers: [], cities: [], factions: [] }));
  assert.equal(checkRecord(JSON.parse(JSON.stringify(G.newGame(4, 1, 1)))), null);
});

test('a maxed-out record survives a JSON round trip and a month of AI turns', async () => {
  const g = G.newGame(4, 2, 3);
  for (const o of g.officers) for (const [k, v] of [['war', 99], ['int', 99], ['virtue', 99], ['soldiers', 1000]]) setOfficer(g, o.id, k, v);
  for (const c of g.cities) { setCity(g, c.id, 'gold', 9999); setCity(g, c.id, 'rice', 9999); }
  const back = JSON.parse(JSON.stringify(g)); back.year = 191;
  const io = new Proxy({}, { get: () => async () => true });
  for (const f of back.factions) if (f.id !== back.player && f.ruler != null) await aiTurn(back, f.id, io);
  for (const c of back.cities) assert.ok(c.gold >= 0 && c.gold <= 9999 && c.officers.every((id) => back.officers[id]), `city ${c.id}`);
});

// D172: a data pack may give 武力、智力、人德、体力 100 (core/pack.js OFFICER_NUM), and the game keeps them through a new
// game and every save. The editor held all four to the base scenario's 99, so 还原此人 or a typed 100 lowered a legal
// pack officer and the write-back saved it. The ranges now follow the data in play. Here the test-faction fixture gives 关羽 武力 100.
test('on a pack that allows 100, the editor sets, keeps and restores 100', () => {
  const MVP = new URL('..', import.meta.url), json = (f) => JSON.parse(readFileSync(new URL(f, MVP)));
  const rd = (f) => { try { return json(`tools/fixtures/packs/test-faction/${f}`); } catch { return undefined; } };
  const pack = { meta: rd('pack.json'), cities: rd('cities.json'), roads: rd('roads.json'), factions: rd('factions.json'), officers: rd('officers.json') };
  const { data: PD, errors } = mergePack(withBaseMap(json('data/game-data.json'), json('data/base-map.json')), pack);
  assert.deepEqual(errors, []);
  G.setData(PD);
  try {
    const g = G.newGame(4, 1, 1), guan = PD.officers.findIndex((o) => o.name === '关羽'), o = g.officers[guan];
    assert.equal(o.war, 100, 'the pack\'s 100 comes through a new game');
    assert.deepEqual(officerFields().filter(([k]) => ['war', 'int', 'virtue', 'hp'].includes(k)).map(([, , , hi]) => hi), [100, 100, 100, 100]);
    assert.equal(setOfficer(g, guan, 'war', 100), 100, 'restoring his own value keeps it');
    assert.equal(setOfficer(g, guan, 'int', 250), 100);
    assert.equal(setOfficer(g, guan, 'virtue', 100), 100);
    assert.equal(setOfficer(g, guan, 'hp', 100), 100); assert.equal(G.maxHp(o), 100); assert.equal(hpText(o), '100/100');
    const back = JSON.parse(JSON.stringify(g)).officers[guan];
    assert.deepEqual([back.war, back.int, back.virtue, back.hp, G.maxHp(back)], [100, 100, 100, 100, 100], 'kept in the record');
  } finally { G.setData(D); }
  assert.equal(setOfficer(G.newGame(4, 1, 1), 0, 'war', 100), 99, 'the base scenario stays at 99');
});
