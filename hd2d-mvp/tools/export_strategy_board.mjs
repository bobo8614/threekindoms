// The 战略地图 as the game builds it (src/worldmap.js, src/strategy.js), exported for the Blender sand table
// (tools/blender_sandtable.py): one source for the geography, so the baked board and the game always agree.
//   node hd2d-mvp/tools/export_strategy_board.mjs [out_dir] [--url http://localhost:8677/hd2d-mvp/?mute]
// Writes <out>/board.json (ground heightfield with its UVs, water, roads, cities with their tier, trees) and
// <out>/ground.png / mask.png (the ground's painted texture and its vegetation mask: r grass, g forest, b farm,
// a tone), all in the game's world units (x east, y up, z south).
import { launchChrome } from './headless.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'hd2d-mvp/assets/ai/sandtable/source/board');
const URL = arg('--url', 'http://localhost:8677/hd2d-mvp/?mute');
mkdirSync(out, { recursive: true });

const browser = await launchChrome(URL);
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
// A new game as 曹操 (as tools/map_capture.mjs), so the cities carry the opening owners' banners.
await page.goto(URL); await page.waitForFunction(() => window.__game?.debug);
await page.getByText('新的征程').click(); await page.waitForTimeout(800);
await page.locator('.ruler', { hasText: '曹操' }).click(); await page.locator('.ruler', { hasText: '曹操' }).click();
await page.waitForFunction(() => document.body.dataset.screen === 'strategy'); await page.waitForTimeout(2500);
// The game's own cameras (1440×900) for the review renders: mid as map_capture's strategy-mid, near zoomed in.
const cams = {};
for (const [nm, z] of [['mid', 0], ['near', -600], ['far', 900]]) {
  await page.evaluate((z) => { const s = window.__game.strategy; s.resetView(); s.focusCity(window.__game.g.factions[window.__game.g.player].city); if (z) s.zoom(z); }, z);
  await page.waitForTimeout(2500);
  cams[nm] = await page.evaluate(() => { const c = window.__game.strategy.camera; c.updateMatrixWorld(); return { pos: c.position.toArray(), quat: c.quaternion.toArray(), fov: c.fov, aspect: c.aspect }; });
}

const res = await page.evaluate(() => {
  const S = window.__game.strategy.scene, r3 = (v) => Math.round(v * 1e4) / 1e4;
  S.updateMatrixWorld(true);
  const meshOf = (m) => {
    const g = m.geometry, p = g.attributes.position, uv = g.attributes.uv, v = [], t = [];
    for (let i = 0; i < p.count; i++) {
      const w = { x: p.getX(i), y: p.getY(i), z: p.getZ(i), isVector3: true };
      const e = m.matrixWorld.elements, x = e[0] * w.x + e[4] * w.y + e[8] * w.z + e[12], y = e[1] * w.x + e[5] * w.y + e[9] * w.z + e[13], z = e[2] * w.x + e[6] * w.y + e[10] * w.z + e[14];
      v.push(r3(x), r3(y), r3(z)); if (uv) t.push(r3(uv.getX(i)), r3(uv.getY(i)));
    }
    return { v, uv: t, i: g.index ? Array.from(g.index.array) : null };
  };
  const png = (canvas) => canvas.toDataURL('image/png');
  const dataPng = (tex) => {
    const { data, width, height } = tex.image, c = document.createElement('canvas'); c.width = width; c.height = height;
    const im = c.getContext('2d').createImageData(width, height);
    for (let y = 0; y < height; y++) im.data.set(data.subarray((height - 1 - y) * width * 4, (height - y) * width * 4), y * width * 4); // DataTexture rows are bottom-up
    c.getContext('2d').putImageData(im, 0, 0); return png(c);
  };
  const outp = { water: [], roads: [], trees: [], cities: [] };
  const seen = new Set();
  S.traverse((o) => {
    if (o.userData.city) {
      const c = o.userData.city, g = o.parent; seen.add(g);
      const flag = g.children.find((k) => k.isMesh && k.geometry.type === 'PlaneGeometry');
      outp.cities.push({ id: c.id, name: c.name, x: r3(g.position.x), y: r3(g.position.y), z: r3(g.position.z), owner: '#' + flag.material.color.getHexString(), faction: window.__game.g.cities[c.id].faction });
    }
    if (!o.isMesh || !o.visible) return;
    const m = o.material;
    if (m.customProgramCacheKey?.() === 'strategyGround') { outp.ground = meshOf(o); outp.groundPng = png(m.map.image); outp.maskPng = dataPng(o.userData.mask); return; }
    if (o.isInstancedMesh && (o.userData.tree === 'broad' || o.userData.tree === 'pine')) {
      const a = o.instanceMatrix.array;
      for (let i = 0; i < o.count; i++) { const e = a.subarray(i * 16, i * 16 + 16), s = Math.hypot(e[0], e[1], e[2]); outp.trees.push({ k: o.userData.tree, x: r3(e[12]), y: r3(e[13]), z: r3(e[14]), s: r3(s), ry: r3(Math.atan2(-e[8], e[0])) }); }
      return;
    }
    if (m.vertexColors && m.transparent && o.geometry.attributes.color?.itemSize === 4) { outp.roads.push(meshOf(o)); return; }
    if (m.transparent && m.depthWrite === false && m.map && !m.vertexColors && o.renderOrder <= 1 && (o.geometry.type === 'PlaneGeometry' || o.geometry.type === 'CircleGeometry' || o.renderOrder === 1))
      outp.water.push({ kind: o.geometry.type === 'PlaneGeometry' ? 'sea' : o.geometry.type === 'CircleGeometry' ? 'lake' : 'river', ...meshOf(o) });
  });
  return outp;
});
await browser.close();

// Tiers fixed for the whole game (the user's choice, 2026-10-30): 都城, 州治大城, 普通郡城, 关隘.
const CAPITAL = new Set([8, 12]), MAJOR = new Set([1, 4, 15, 21, 26]), PASS = new Set([9, 25]);
for (const c of res.cities) c.tier = CAPITAL.has(c.id) ? 'capital' : MAJOR.has(c.id) ? 'major' : PASS.has(c.id) ? 'pass' : 'county';
res.cams = cams;
res.trees = res.trees.filter((t, i, a) => i === a.findIndex((u) => u.x === t.x && u.z === t.z)); // crown and card layers share spots
const b64 = (s) => Buffer.from(s.split(',')[1], 'base64');
writeFileSync(join(out, 'ground.png'), b64(res.groundPng)); writeFileSync(join(out, 'mask.png'), b64(res.maskPng));
delete res.groundPng; delete res.maskPng;
writeFileSync(join(out, 'board.json'), JSON.stringify(res));
console.log(`ground ${res.ground.v.length / 3} verts, water ${res.water.length}, roads ${res.roads.length}, trees ${res.trees.length}, cities ${res.cities.length}`);
console.log(res.cities.map((c) => `${c.name}:${c.tier}`).join(' '));
if (errors.length) console.log('page errors:', errors);
