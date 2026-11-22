// Data packs in the rules core (core/pack.js, docs/战略地图数据包扩展设计_2026-11-17.md): the merge, its errors, and whole
// AI campaigns on a pack's map. Node only, no browser. The no-pack side (every record unchanged) is tools/pack_parity.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as P from '../src/core/pack.js';
import * as G from '../src/core/game.js';
import * as A from '../src/core/ai.js';
import * as W from '../src/core/warcore.js';
import * as F from '../src/core/field.js';
import { checkRecord } from '../src/core/saveedit.js';

const MVP = fileURLToPath(new URL('..', import.meta.url));
const json = (f) => JSON.parse(fs.readFileSync(MVP + f));
const BASE = P.withBaseMap(json('data/game-data.json'), json('data/base-map.json'));
const readDir = (dir) => {
  const rd = (f) => (fs.existsSync(MVP + dir + f) ? json(dir + f) : undefined);
  return { meta: rd('pack.json'), cities: rd('cities.json'), roads: rd('roads.json'), factions: rd('factions.json'), officers: rd('officers.json') };
};
const FIX = readDir('tools/fixtures/packs/test-faction/'), SAMPLE = readDir('mods/sample-cities/');
const merge = (pack) => P.mergePack(BASE, pack);
const edit = (fn) => { const p = structuredClone(FIX); fn(p); return merge(p); };

test('the sample pack and the fixture merge cleanly', () => {
  for (const p of [SAMPLE, FIX]) assert.deepEqual(merge(p).errors, []);
  const { data: D } = merge(FIX);
  assert.equal(D.factions.length, 9);
  assert.deepEqual(D.factions[7], { id: 7, name: '', ruler: null, placeholder: true });
  assert.equal(D.cities.length, 33);
  assert.deepEqual(D.cities[30].roads, [15, 17]);
  assert.ok(D.cities[15].roads.includes(30), 'roads go both ways');
  assert.equal(D.cities[17].faction, 8, '建安 edited to 越');
  assert.equal(D.officers[37 + 200].name, '勾践');
  assert.equal(D.cities[30].officers[0], 237, 'the ruler leads his city');
  assert.equal(D.officers[237].art, 138, 'a new officer borrows his like officer\'s pictures');
  assert.deepEqual(D.maps[30], BASE.maps[17], 'a new city borrows its like city\'s field');
  assert.ok(D.rules.turn_orders.every((row) => row.length === 8 && row[7] === 8));
  assert.ok(D.rules.flood_cities.includes(30) && D.rules.drought_cities.includes(32));
  assert.deepEqual(BASE.rules.turn_orders[0], [0, 1, 2, 3, 6, 5, 4], 'the base data is never touched');
  assert.equal(BASE.cities.length, 30);
});

test('each kind of mistake is named', () => {
  const has = (r, s) => assert.ok(r.errors.some((e) => e.includes(s)), `${s} in ${r.errors.join(' | ')}`);
  assert.equal(edit(() => {}).data != null, true);
  has(edit((p) => { p.meta.id = 'Bad Id'; }), 'id 只能用');
  has(edit((p) => { p.meta.game = 2; }), 'game 应为 1');
  has(edit((p) => { p.cities.add[0].name = '<b>x</b>'; }), 'name 必填');
  has(edit((p) => { p.cities.add[0].name = '洛阳'; }), '城名「洛阳」重复');
  has(edit((p) => { p.cities.add[0].like = '会稽'; }), '城「会稽」不存在于原版');
  has(edit((p) => { p.cities.add[0].lon = 140; }), '落在原版沙盘之外');
  has(edit((p) => { p.cities.add[1].lon = 120.4; p.cities.add[1].lat = 30.1; }), '离会稽太近');
  has(edit((p) => { p.cities.add[0].tier = 'huge'; }), 'tier 只能是');
  has(edit((p) => { p.cities.add[0].style = 'french'; }), 'style 只能是');
  has(edit((p) => { p.cities.add[0].gold = 20000; }), 'gold 应为 0–9999');
  has(edit((p) => { p.cities.edit.push({ city: '洛阳', lon: 112 }); }), '不能改原版城的经纬度');
  has(edit((p) => { p.roads.push(['会稽', '会稽']); }), '同一座城');
  has(edit((p) => { p.roads.push(['会稽', '建业']); }), '已经有路');
  has(edit((p) => { p.roads.push(['会稽', '长沙城']); }), '城「长沙城」不存在');
  has(edit((p) => { p.roads = p.roads.filter((r) => !r.includes('合浦')); }), '没有道路相连：合浦');
  has(edit((p) => { p.factions[0].colors.flag = 'red'; }), 'colors 应为');
  has(edit((p) => { p.factions[0].ruler = '刘备'; }), '已是别的势力的君主');
  has(edit((p) => { p.factions[0].like = '越'; }), '不存在于原版');
  has(edit((p) => { p.factions = Array.from({ length: 9 }, (_, i) => ({ ...p.factions[0], name: `势${i}` })); }), '最多 8 个新势力');
  has(edit((p) => { p.officers.add[0].like = '貂蝉'; }), '武将「貂蝉」不存在');
  has(edit((p) => { p.officers.add[0].name = '关羽'; }), '与已有武将重复');
  has(edit((p) => { p.officers.add[2].city = '会稽'; }), '有归属却没有武将');
  has(edit((p) => { p.cities.edit.push({ city: '并州', faction: '越' }); }), '原版势力 刘备');
  has(edit((p) => { p.officers.add[0].city = '合浦'; }), '所在的合浦不属于本势力');
  has(edit((p) => { p.officers.edit.push({ officer: '曹操', year: 200 }); }), '不能改原版武将的登场年');
  has(edit((p) => { p.officers.add[4].faction = null; }), 'faction 必填');
  has(edit((p) => { p.officers.add.push(...Array.from({ length: 9 }, (_, i) => ({ name: `兵${i}`, like: '程普', city: '会稽' }))); }), '开局武将 11 人');
  has(edit((p) => { p.cities.oops = []; }), '不认识 oops');
  has(edit((p) => { p.meta.regions = ['japan']; }), '不是已开放的官方扩展地块');
});

// A whole campaign on a pack's map, every house by the AI: no throw, and the record stays sound.
async function campaign(D, seed, player, months) {
  G.setData(structuredClone(D));
  const g = G.newGame(player, seed % 3, seed);
  const io = {
    event: async () => {}, chooseHeir: async (f) => G.autoHeir(g, f), allianceOffer: async () => true,
    war: async (war) => { const field = new F.Field(g, war, null); while (!field.over) { for (const _ of field.aiActions(field.turn)); field.endTurn(); } W.resolveWar(g, war, field.result()); await G.checkFactions(g, io); },
    afterWar: async () => G.checkFactions(g, io),
    aiTurn: async (f) => { await A.aiTurn(g, f, io); if ((g.year - 189) * 12 + g.month >= months) throw g; },
    playerTurn: async () => { g.endTurn = true; if ((g.year - 189) * 12 + g.month >= months) throw g; },
  };
  try { await G.run(g, io); } catch (x) { if (x !== g) throw x; }
  return g;
}
test('a new city\'s building style is looks only: kept on the record when not han, and nothing else changes', () => {
  // docs/城池风格模型_方案_2026-11-22.md: the sand table and the 2D map draw it; no rule reads it, so the save format is as before.
  const plain = merge(FIX).data, styled = edit((p) => { p.cities.add[0].style = 'japan'; p.cities.add[1].style = 'han'; });
  assert.deepEqual(styled.errors, []);
  assert.equal(styled.data.cities[30].style, 'japan');
  assert.ok(!('style' in styled.data.cities[31]) && !('style' in plain.cities[30]), 'han, written or not, leaves the record as it was');
  const { style, ...rest } = styled.data.cities[30];
  assert.deepEqual(rest, plain.cities[30]);
  assert.equal(P.PACK_FORMAT, 1);
});

test('the AI plays twenty years on a pack with a new house', async () => {
  const { data: D } = merge(FIX);
  let houseWon = 0;
  for (let s = 1; s <= 8; s++) {
    const g = await campaign(D, 1000 + s, s % 2 ? -1 : 8, 240);
    const seat = g.cities.flatMap((c) => c.officers);
    assert.equal(seat.length, new Set(seat).size, 'an officer in two cities');
    assert.ok(g.cities.every((c) => c.officers.length <= 10 && (c.faction === G.NONE) === !c.officers.length));
    assert.ok(g.cities.every((c) => Number.isFinite(c.gold) && c.gold >= 0 && c.gold <= 9999));
    assert.equal(g.factions[7].ruler, null, 'the placeholder never rules');
    assert.ok(g.aiCursor.every((i) => i >= 0 && i <= g.cities.length));
    assert.ok(g.cities.every((c) => c.faction === G.NONE || g.factions[c.faction]));
    if (g.cities.some((c) => c.faction === 8)) houseWon++;
    assert.equal(G.upgrade(JSON.parse(JSON.stringify(g))) != null, true, 'the record reloads');
  }
  assert.ok(houseWon > 0, 'the new house held a city somewhere');
});

test('a record knows its pack', async () => {
  const { data: D } = merge(FIX);
  G.setData(structuredClone(D));
  const g = G.newGame(8, 0, 7);
  assert.deepEqual(g.pack, { id: 'test-faction', version: '1.2.0' });
  assert.equal(g.factions.length, 9); assert.equal(g.factions[8].alliance.length, 9);
  assert.equal(G.packMismatch(g), null);
  assert.equal(checkRecord(g), null);
  const later = { ...structuredClone(g), pack: { id: 'test-faction', version: '2.0.0' } };
  assert.match(G.packMismatch(later), /主版本号不同/);
  assert.equal(G.upgrade(later), null);
  assert.equal(G.upgrade({ ...structuredClone(g), pack: { id: 'test-faction', version: '1.9' } }) != null, true, 'a minor version loads');
  G.setData(structuredClone(BASE));
  assert.match(G.packMismatch(g), /数据包「test-faction」/);
  assert.equal(G.upgrade(structuredClone(g)), null);
  const plain = G.newGame(4, 0, 7);
  assert.equal('pack' in plain, false, 'no pack, no field: the record is as before');
  assert.equal(plain.factions.length, 7);
  G.setData(structuredClone(D));
  assert.match(G.packMismatch(plain), /本体/);
});

test('a realm past 30 cities keeps the last command-book entry', () => {
  const { data: D } = merge(FIX);
  G.setData(structuredClone(D));
  const g = G.newGame(8, 0, 1);
  for (const c of g.cities) c.faction = 8;
  assert.equal(G.books(g, 8), D.rules.books.at(-1));
});

test('the author\'s checker: the shipped packs pass, a seat in the sea or on a river does not', async () => {
  const { checkPack } = await import('../tools/check_pack.mjs');
  const os = await import('node:os'), path = await import('node:path');
  assert.deepEqual(checkPack(MVP + 'mods/sample-cities').errors, []);
  assert.deepEqual(checkPack(MVP + 'tools/fixtures/packs/test-faction').errors, []);
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pack-')), 'wet-town');
  fs.mkdirSync(dir);
  const write = (f, v) => fs.writeFileSync(path.join(dir, f), JSON.stringify(v));
  write('pack.json', { ...SAMPLE.meta, id: 'wet-town' });
  write('roads.json', SAMPLE.roads);
  write('cities.json', { add: [{ ...SAMPLE.cities.add[0], lon: 122.5, lat: 29.0 }, { ...SAMPLE.cities.add[1], lon: 115.89, lat: 28.68 }] });
  const { errors } = checkPack(dir);
  assert.ok(errors.some((e) => e.includes('会稽') && e.includes('在水里')), errors.join(' | '));
  assert.ok(errors.some((e) => e.includes('豫章') && /压在(河|湖)上/.test(e)), errors.join(' | '));
  // A town in the sand table's mountains is allowed, with a warning (its walls would show through the range).
  assert.deepEqual(checkPack(MVP + 'mods/sample-cities').warnings, []);
  write('cities.json', { add: [SAMPLE.cities.add[0], { ...SAMPLE.cities.add[1], lon: 116.17, lat: 27.8 }] });
  const hill = checkPack(dir);
  assert.deepEqual(hill.errors, []);
  assert.ok(hill.warnings.some((w) => w.includes('豫章') && w.includes('山脉')), hill.warnings.join(' | '));
  // A town on the japan board with no style is told the styles exist; with one, nothing is said.
  const jp = checkPack(MVP + 'tools/fixtures/packs/test-japan').warnings, st = checkPack(MVP + 'tools/fixtures/packs/test-styles').warnings;
  assert.ok(jp.some((w) => w.includes('江户') && w.includes('"style"')), jp.join(' | '));
  assert.ok(!st.some((w) => w.includes('"style"') && !w.includes('博多')) && st.some((w) => w.includes('博多') && w.includes('"style"')), st.join(' | '));
});
