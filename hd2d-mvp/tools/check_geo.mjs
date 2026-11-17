// Check the strategy map's geography: every seat on land, on its stated bank, which side of the 长江 and
// 黄河 it lies, how far drawing moved it, and the closest pairs of cities on the board.
//   node hd2d-mvp/tools/check_geo.mjs
import { readFileSync } from 'node:fs';
import { RIVERS, placeCities, isLand, nearest } from '../src/china.js';

// The seats and banks are data/base-map.json (hand-kept; core/pack.js merges them into the game's cities).
const data = JSON.parse(readFileSync(new URL('../data/game-data.json', import.meta.url)));
const CITY_SITES = JSON.parse(readFileSync(new URL('../data/base-map.json', import.meta.url))).cities;
const BANKS = Object.fromEntries(CITY_SITES.filter((s) => s.bank).map((s) => [s.id, s.bank]));
const drawn = placeCities(CITY_SITES);
const river = (n) => RIVERS.find((r) => r.name === n);
const KM = 111;
let bad = 0;
const side = (rv, c) => {
  const n = nearest(river(rv).pts, c.lon, c.lat);
  // Past either end the side is meaningless.
  return n.t <= 0 || n.t >= 1 ? '—' : rv === '长江' ? (n.side > 0 ? '北' : '南') : (n.side > 0 ? '左' : '右');
};
console.log('id 城     治所                         真实经纬       绘制经纬       偏移km 长江 陆地 岸');
data.cities.forEach((c, i) => {
  const s = CITY_SITES[i], d = drawn[i];
  const moved = Math.hypot((d.lon - s.lon) * Math.cos(s.lat * Math.PI / 180), d.lat - s.lat) * KM;
  const land = isLand(d.lon, d.lat);
  let bank = '';
  if (BANKS[i]) {
    const [rv, want] = BANKS[i], n = nearest(river(rv).pts, d.lon, d.lat), got = n.side > 0 ? 'left' : 'right';
    bank = `${rv}${want === 'left' ? '左' : '右'}岸${got === want ? '✓' : '✗'}`;
    if (got !== want) bad++;
  }
  if (!land) bad++;
  console.log(`${String(i).padStart(2)} ${c.name.padEnd(4, '　')} ${s.seat.padEnd(16, '　')} ${s.lon.toFixed(2)},${s.lat.toFixed(2)}  ${d.lon.toFixed(2)},${d.lat.toFixed(2)}  ${moved.toFixed(0).padStart(4)}  ${side('长江', d)}   ${land ? '✓' : '✗'}  ${bank}`);
});
// Closest pairs on the board (x is 0.9 units per degree of longitude, z 1 per degree of latitude).
const pairs = [];
for (let a = 0; a < 30; a++) for (let b = a + 1; b < 30; b++) pairs.push([Math.hypot((drawn[a].lon - drawn[b].lon) * 0.9, drawn[a].lat - drawn[b].lat), a, b]);
pairs.sort((p, q) => p[0] - q[0]);
console.log('\n最近的城市对（棋盘单位）:', pairs.slice(0, 5).map(([d, a, b]) => `${data.cities[a].name}-${data.cities[b].name} ${d.toFixed(2)}`).join('，'));
// Spot checks of well-known relations.
const north = (a, b) => drawn[a].lat > drawn[b].lat;
const checks = [
  ['建业在长江以南', side('长江', drawn[15]) === '南'], ['江陵在长江以北', side('长江', drawn[21]) === '北'],
  ['寿春在建业西北', drawn[16].lon < drawn[15].lon && north(16, 15)], ['长沙在衡阳以北', north(23, 22)],
  ['新野在江陵以北', north(13, 21)], ['成都在汉中西南', drawn[26].lon < drawn[25].lon && north(25, 26)],
  ['邺在洛阳东北', drawn[4].lon > drawn[12].lon && north(4, 12)], ['番禺在建安西南', drawn[18].lon < drawn[17].lon && north(17, 18)],
];
for (const [k, ok] of checks) { console.log(`${ok ? '✓' : '✗'} ${k}`); if (!ok) bad++; }
process.exit(bad ? 1 : 0);
