// An extension region's geography (src/regions/, made by tools/region_geo.py from Natural Earth): known seats fall on its land,
// its straits and open water on the sea, and it lies against the original board without overlapping it
// (docs/战略地图数据包扩展设计_2026-11-17.md §5.5, docs/战略地图右侧扩展_方案_2026-11-17.md, docs/战略地图日本地块_方案_2026-11-17.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { landOf, isLand } from '../src/china.js';
import { readFileSync } from 'node:fs';
import east from '../src/regions/east.js';
import japan from '../src/regions/japan.js';
import north from '../src/regions/north.js';

test('the east strip: towns on land, straits at sea, flush against the original board', () => {
  const land = landOf(east.land);
  for (const [name, lon, lat] of [['福冈', 130.42, 33.58], ['熊本', 130.71, 32.8], ['宫崎', 131.4, 31.92], ['大分', 131.58, 33.21], ['长崎', 129.88, 32.76],
    ['严原', 129.28, 34.21], ['济州', 126.53, 33.45], ['晋州', 128.08, 35.19], ['釜山', 129.04, 35.18], ['庆州', 129.21, 35.84], ['首尔', 126.98, 37.57],
    ['平壤', 125.75, 39.02], ['咸兴', 127.54, 39.92], ['延吉', 129.5, 42.9], ['下关', 130.93, 33.96]])
    assert.ok(land(lon, lat), `${name} ${lon}, ${lat} is on land`);
  for (const [name, lon, lat] of [['对马海峡东水道', 129.8, 33.95], ['朝鲜海峡西水道', 128.9, 34.6], ['玄界滩', 130.4, 34.0], ['有明海', 130.3, 33.05],
    ['鹿儿岛湾', 130.68, 31.45], ['济州海峡', 126.6, 33.9], ['东海', 128.0, 32.0], ['黄海', 125.3, 36.0], ['日本海', 131.0, 38.0], ['西朝鲜湾', 125.0, 39.2]])
    assert.ok(!land(lon, lat), `${name} ${lon}, ${lat} is at sea`);
  const [x0, x1, y0, y1] = east.box;
  // The original board's extent in degrees, from its bake (board.json box is in world units: x = (lon − 111.5)·0.9, z = 31.5 − lat).
  const [X0, X1, Z0, Z1] = JSON.parse(readFileSync(new URL('../assets/ai/sandtable/board/board.json', import.meta.url))).box;
  const LON1 = X1 / 0.9 + 111.5, LAT1 = 31.5 - Z0, LAT0 = 31.5 - Z1;
  assert.ok(Math.abs(x0 - LON1) < 1e-6, 'the strip starts at the original board\'s east edge');
  assert.ok(Math.abs(y0 - LAT0) < 1e-6 && Math.abs(y1 - LAT1) < 1e-6, 'and runs the original\'s north to south');
  for (const p of east.land) for (const [lon, lat] of p) assert.ok(lon >= x0 && lon <= x1 && lat >= y0 && lat <= y1, 'outlines inside the box');
  assert.ok(isLand(116.4, 39.9)); // the original board's own outline still answers through the same rule
});

// 黄海道's west tip reaches lon 125, where the original board has open sea; the strip's heights ease into the original's there, and
// some of that land sinks under the sea on both maps. The pack check reads the same eased heights, so a town cannot pass it there
// and then stand in the sea (src/regionseam.js, tools/check_pack.mjs).
test('the pack check sees the east strip\'s seam as both maps stand it', async () => {
  const { boardsFor } = await import('../tools/check_pack.mjs');
  const { gridHeightAt } = await import('../src/regionseam.js');
  const A = new URL('../assets/ai/sandtable/', import.meta.url).pathname;
  const eased = boardsFor(['east']).east, meta = JSON.parse(readFileSync(`${A}regions/east/board.json`)), h = new Uint16Array(readFileSync(`${A}regions/east/height.bin`).buffer.slice(0));
  const raw = { sea: meta.sea, heightAt: gridHeightAt(meta, Float32Array.from(h.subarray(0, meta.grid[0] * meta.grid[1]), (v) => meta.h[0] + v / 65535 * (meta.h[1] - meta.h[0]))) };
  const at = (b, lon, lat) => b.heightAt((lon - 111.5) * 0.9, 31.5 - lat) - b.sea;
  assert.ok(at(raw, 125.26, 38.5) > 0.05 && at(eased, 125.26, 38.5) < 0, 'sunk by the seam: land in the bake, sea to the check');
  for (const [lon, lat] of [[126.98, 37.57], [125.75, 39.02], [130.42, 33.58]]) assert.ok(at(eased, lon, lat) > 0.02, `${lon}, ${lat} still land`);
  // Off the seam band the heights are the bake's own.
  assert.equal(eased.heightAt(16, 0), raw.heightAt(16, 0));
});

// japan opens two boards together (docs/战略地图日本地块_方案_2026-11-17.md): the east of the table to 146°E and 46°N, and the north strip
// over the original's longitudes from 43° to 46°, so the table stays one rectangle.
test('japan and the north strip: towns on land, seas at sea, the two boards and the original filling one rectangle', () => {
  const land = landOf(japan.land);
  for (const [name, lon, lat] of [['东京', 139.69, 35.69], ['大阪', 135.5, 34.69], ['京都', 135.77, 35.01], ['名古屋', 136.91, 35.18], ['仙台', 140.87, 38.27],
    ['青森', 140.74, 40.82], ['札幌', 141.35, 43.06], ['旭川', 142.36, 43.77], ['稚内', 141.68, 45.4], ['钏路', 144.38, 42.98], ['函馆', 140.73, 41.77],
    ['新潟', 139.05, 37.85], ['金泽', 136.63, 36.56], ['广岛', 132.46, 34.4], ['高知', 133.53, 33.56], ['鹿儿岛', 130.56, 31.6], ['那霸', 127.68, 26.21],
    ['福冈', 130.42, 33.58], ['首尔', 126.98, 37.57], ['哈尔滨', 126.63, 45.75], ['海参崴', 131.9, 43.12]])
    assert.ok(land(lon, lat), `${name} ${lon}, ${lat} is on land`);
  for (const [name, lon, lat] of [['东京湾', 139.8, 35.4], ['濑户内海', 133.5, 34.3], ['津轻海峡', 140.7, 41.45], ['宗谷海峡', 142.0, 45.7], ['日本海', 135.0, 40.0],
    ['太平洋', 143.0, 35.0], ['对马海峡东水道', 129.8, 33.95], ['伊势湾', 136.75, 34.75]])
    assert.ok(!land(lon, lat), `${name} ${lon}, ${lat} is at sea`);
  const [X0, X1, Z0, Z1] = JSON.parse(readFileSync(new URL('../assets/ai/sandtable/board/board.json', import.meta.url))).box;
  const LON0 = X0 / 0.9 + 111.5, LON1 = X1 / 0.9 + 111.5, LAT1 = 31.5 - Z0, LAT0 = 31.5 - Z1;
  const near = (a, b) => Math.abs(a - b) < 1e-6;
  assert.ok(near(japan.box[0], LON1) && near(japan.box[2], LAT0) && near(japan.box[3], north.box[3]), 'japan starts at the original\'s east edge, from its south to the north strip\'s north');
  assert.ok(near(north.box[0], LON0) && near(north.box[1], LON1) && near(north.box[2], LAT1), 'the north strip sits on the original\'s north edge, as wide');
  assert.ok(japan.box[1] >= 145.8 && north.box[3] >= 45.5, 'all of 北海道 (知床, 稚内) is on the table');
  for (const L of japan.lakes) assert.ok(land(L.lon, L.lat), `${L.name} lies inland`);
});

// The two boards are eased into the original and into each other where they meet (src/regionseam.js): on the north seam (43°N) and
// on japan's west seam beside the north strip, the heights either side agree, as both maps and the pack check stand them.
test('the pack check sees japan\'s seams as both maps stand them', async () => {
  const { boardsFor } = await import('../tools/check_pack.mjs');
  const B = boardsFor(['north', 'japan']);
  for (let x = -12.4; x < 12; x += 0.37) assert.ok(Math.abs(B.north.heightAt(x, -11.5) - B.base.heightAt(x, -11.5)) < 1e-3, `north seam at x ${x.toFixed(2)}`);
  for (let z = -14.4; z < -11.6; z += 0.13) assert.ok(Math.abs(B.japan.heightAt(12.12, z) - B.north.heightAt(12.12, z)) < 1e-3, `japan against the north strip at z ${z.toFixed(2)}`);
  for (let z = -11.4; z < 11.4; z += 0.53) assert.ok(Math.abs(B.japan.heightAt(12.12, z) - B.base.heightAt(12.12, z)) < 1e-3, `japan against the original at z ${z.toFixed(2)}`);
  const at = (b, lon, lat) => b.heightAt((lon - 111.5) * 0.9, 31.5 - lat) - b.sea;
  for (const [lon, lat] of [[139.69, 35.69], [141.35, 43.06], [126.63, 45.75], [116.08, 43.93]]) assert.ok(at(B[lon < 125 ? 'north' : 'japan'], lon, lat) > 0.02, `${lon}, ${lat} on land`);
});
