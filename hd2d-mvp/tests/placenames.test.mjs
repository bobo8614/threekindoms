// 地名 原版／考据 (佛砸米兰@qq, 2026-11-18): the switch shows thirteen cities under the name of the place their seat stands in.
// Only the name shown changes: ids, records and what a pack refers to stay as they were, and the row, the 说明 and the city
// panel say which names are on.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as P from '../src/core/pack.js';
import * as G from '../src/core/game.js';
import { startGame, newCampaign } from './game.mjs';

const MVP = fileURLToPath(new URL('..', import.meta.url));
const json = (f) => JSON.parse(fs.readFileSync(MVP + f));
const base = () => P.withBaseMap(json('data/game-data.json'), json('data/base-map.json'));
const WANT = { 幽州: '北平', 并州: '晋阳', 冀州: '邺', 兖州: '陈留', 豫州: '许昌', 青州: '北海', 徐州: '下邳', 扬州: '寿春', 荆州: '南郡', 凉州: '武威', 交州: '南海', 西平关: '金城', 西安阳: '五原' };
const readDir = (dir) => {
  const rd = (f) => (fs.existsSync(MVP + dir + f) ? json(dir + f) : undefined);
  return { meta: rd('pack.json'), cities: rd('cities.json'), roads: rd('roads.json'), factions: rd('factions.json'), officers: rd('officers.json') };
};

test('off, the data is as loaded; on, thirteen cities change their name and nothing else; off again, they are back', () => {
  const D = G.setData(base()), before = structuredClone(D), names = D.cities.map((c) => c.name);
  assert.equal(G.placeNames(), false);
  assert.deepEqual(D, before, 'nothing is touched while the switch has never been on');
  G.setPlaceNames(true);
  assert.deepEqual(Object.fromEntries(D.cities.filter((c, i) => c.name !== names[i]).map((c, i) => [c.orig, c.name])), WANT);
  assert.equal(new Set(D.cities.map((c) => c.name)).size, 30, 'no two cities share a name');
  assert.equal(G.cityName(1), '北平'); assert.equal(G.cityOrigName(1), '幽州'); assert.equal(G.cityOrigName(0), null);
  assert.deepEqual(G.placeNamePairs(), Object.entries(WANT).map(([a, b]) => [a, b]).sort((x, y) => names.indexOf(x[0]) - names.indexOf(y[0])));
  for (const [i, c] of D.cities.entries()) { const { name, orig, ...rest } = c, { name: n0, ...was } = before.cities[i]; assert.deepEqual(rest, was, `${n0}: only the name`); }
  G.setPlaceNames(false);
  assert.deepEqual(D.cities.map((c) => c.name), names); assert.equal(G.cityOrigName(1), null);
  assert.equal(G.placeNamePairs().length, 13, 'the 说明 can list the pairs whichever way the switch stands');
  for (const n of ['北平', '陈留', '许昌']) assert.ok(G.placeNamePairs().some(([, b]) => b === n), `${n}: the 说明 names it as chosen for its fame (app.js PLACE_NOTE)`);
});

test('a new game\'s state holds no city name (cities go by id), so a record made under either setting reads under the other', () => {
  G.setData(base()); G.setPlaceNames(true);
  const text = JSON.stringify(G.newGame(4, 1, 1));
  for (const n of [...Object.keys(WANT), ...Object.values(WANT)]) assert.ok(!text.includes(`"${n}"`), n);
  G.setPlaceNames(false);
});

test('a pack is read against the original names with the switch on, and its own city keeps a name the switch would give', () => {
  const B = base(), sample = readDir('mods/sample-cities/');
  G.setData(structuredClone(B)); G.setPlaceNames(true);
  const { data: D, errors } = P.mergePack(B, sample); // 会稽 like 建安, roads to 建业 and 建安: all by original name
  assert.deepEqual(errors, []);
  G.setData(D);
  assert.equal(D.cities[1].name, '北平'); assert.equal(D.cities[30].name, '会稽');
  const own = structuredClone(sample); own.cities.add[0] = { ...own.cities.add[0], name: '寿春', like: '扬州' }; own.roads = [['寿春', '建业'], ['寿春', '扬州'], ['豫章', '江夏']];
  const r = P.mergePack(B, own); assert.deepEqual(r.errors, []);
  G.setData(r.data);
  assert.equal(r.data.cities[30].name, '寿春', 'the pack\'s city, made like 扬州, is not renamed');
  assert.equal(r.data.cities[16].name, '扬州', 'and the original stays 扬州 beside it');
  assert.equal(new Set(r.data.cities.map((c) => c.name)).size, r.data.cities.length);
  G.setPlaceNames(false);
});

let game;
after(() => game?.close());
test('the 系统 row switches the names on the map at once, and the row, the 说明 and the city panel say so', async () => {
  game = await startGame({ width: 1440, height: 900 });
  const page = await game.open();
  {
    await newCampaign(page, '曹操');
    const row = page.locator('.sysmenu-list button', { hasText: /^地名 / }), tags = () => page.evaluate(() => document.body.innerText);
    await page.click('.sysmenu-btn');
    assert.equal(await row.textContent(), '地名 原版'); assert.match(await row.getAttribute('title'), /幽州→北平.*现在是原版$/);
    assert.ok((await tags()).includes('幽州') && !(await tags()).includes('北平'));
    await row.click();
    assert.match(await page.locator('.toast').last().textContent(), /幽州→北平等13城.*说明/);
    await page.waitForFunction(() => document.querySelector('.sysmenu-list').hidden); // closed: the map behind it is the answer
    await page.click('.sysmenu-btn');
    assert.equal(await row.textContent(), '地名 考据'); assert.match(await row.getAttribute('title'), /现在是考据$/);
    await page.click('.sysmenu-btn');
    const shown = () => page.evaluate(() => [...document.querySelectorAll('.ctag')].map((t) => t.firstChild.textContent));
    await page.waitForFunction(() => [...document.querySelectorAll('.ctag')].some((t) => t.firstChild.textContent === '北平'));
    { const t = await shown(); for (const [a, b] of Object.entries(WANT)) { assert.ok(t.includes(b), `${b} on the map`); assert.ok(!t.includes(a), `${a} gone`); } }
    assert.equal(await page.evaluate(() => localStorage.getItem('hd2d-place-names')), '1');
    const home = await page.evaluate(() => { const { g, G } = window.__game, c = g.cities.find((c) => c.faction === g.player && G.cityOrigName(c.id)); return [G.cityName(c.id), G.cityOrigName(c.id)]; });
    await page.locator('.ctag', { hasText: new RegExp(`^${home[0]}`) }).click();
    assert.equal(await page.locator('.citypanel h2').textContent(), home[0]);
    assert.equal(await page.locator('.citypanel .origname').textContent(), `原版 ${home[1]}`);
    await page.click('.sysmenu-btn'); await page.locator('.sysmenu-list button', { hasText: /^说明$/ }).click();
    const help = await page.locator('.placenames-help').textContent();
    assert.match(help, /^现在显示考据地名/); assert.match(help, /荆州→南郡/); assert.match(help, /西平关→金城/); assert.match(help, /北平、陈留、许昌取其知名/);
    await page.locator('.modal .foot button', { hasText: '关闭' }).click();
    // Kept across a restart, and read before the first name is drawn.
    await page.reload(); await page.waitForFunction(() => window.__game?.G.data());
    assert.equal(await page.evaluate(() => window.__game.G.cityName(21)), '南郡');
    assert.equal(await page.evaluate(() => window.__game.G.cityOrigName(21)), '荆州');
    // On the title the row is there too: its map is redrawn under the names chosen, and the choice is kept.
    await page.keyboard.press('Enter'); await page.waitForTimeout(300); await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.body.dataset.screen === 'title' && !!document.querySelector('.sysmenu-btn'));
    await page.click('.sysmenu-btn'); await row.click();
    assert.equal(await page.evaluate(() => localStorage.getItem('hd2d-place-names')), '0');
    await page.waitForFunction(() => { const t = [...document.querySelectorAll('.ctag')].map((e) => e.firstChild.textContent); return !t.length || (t.includes('荆州') && !t.includes('南郡')); });
    assert.equal(await page.evaluate(() => window.__game.G.cityName(21)), '荆州');
  }
});
