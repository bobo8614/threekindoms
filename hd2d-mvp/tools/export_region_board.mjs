// An overseas region's procedural board (src/worldmap.js with src/regions/<name>.js), exported for its sand-table bake as
// tools/export_strategy_board.mjs exports the original's: board.json (ground heightfield with its UVs, water, trees), ground.png
// and mask.png. A region has no cities and no roads (docs/战略地图数据包扩展设计_2026-11-17.md §5.5): packs place them at run time.
//   node hd2d-mvp/tools/export_region_board.mjs <name> [out_dir] [--shot <png>]
// out_dir defaults to the main checkout's ignored assets/ai/sandtable/source/regions/<name>/board (never the original's board).
// --shot also saves a top-down picture of the procedural board, for the first look at the region's geography.
import { startGame } from '../tests/game.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2), opt = (k) => { const i = args.indexOf(k); return i < 0 ? null : args.splice(i, 2)[1]; };
const shot = opt('--shot');
const [name, outArg] = args;
if (!/^[a-z0-9-]+$/.test(name ?? '')) throw Error('usage: export_region_board.mjs <name> [out_dir] [--shot png]');
// The main checkout (a worktree's ignored source/ is empty): the shared --git-common-dir is its .git.
const main = dirname(resolve(execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: new URL('.', import.meta.url).pathname, encoding: 'utf8' }).trim()));
const out = resolve(outArg ?? join(main, 'hd2d-mvp/assets/ai/sandtable/source/regions', name, 'board'));
mkdirSync(out, { recursive: true });

const game = await startGame({ width: 1440, height: 900 });
try {
  const page = await game.open('&pack=none');
  const res = await page.evaluate(async (name) => {
    const THREE = await import('three');
    const { buildWorld } = await import('./src/worldmap.js');
    const geo = (await import(`./src/regions/${name}.js`)).default;
    const S = new THREE.Scene();
    buildWorld(S, [], 5, geo);
    S.updateMatrixWorld(true);
    const r3 = (v) => Math.round(v * 1e4) / 1e4;
    const meshOf = (m) => {
      const g = m.geometry, p = g.attributes.position, uv = g.attributes.uv, v = [], t = [], e = m.matrixWorld.elements;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        v.push(r3(e[0] * x + e[4] * y + e[8] * z + e[12]), r3(e[1] * x + e[5] * y + e[9] * z + e[13]), r3(e[2] * x + e[6] * y + e[10] * z + e[14]));
        if (uv) t.push(r3(uv.getX(i)), r3(uv.getY(i)));
      }
      return { v, uv: t, i: g.index ? Array.from(g.index.array) : null };
    };
    const png = (canvas) => canvas.toDataURL('image/png');
    const dataPng = (tex) => {
      const { data, width, height } = tex.image, c = document.createElement('canvas'); c.width = width; c.height = height;
      const im = c.getContext('2d').createImageData(width, height);
      for (let y = 0; y < height; y++) im.data.set(data.subarray((height - 1 - y) * width * 4, (height - y) * width * 4), y * width * 4);
      c.getContext('2d').putImageData(im, 0, 0); return png(c);
    };
    const outp = { region: name, box: geo.box, water: [], roads: [], trees: [], cities: [] };
    S.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      const m = o.material;
      if (m.customProgramCacheKey?.() === 'strategyGround') { outp.ground = meshOf(o); outp.groundPng = png(m.map.image); outp.maskPng = dataPng(o.userData.mask); return; }
      if (o.isInstancedMesh && (o.userData.tree === 'broad' || o.userData.tree === 'pine')) {
        const a = o.instanceMatrix.array;
        for (let i = 0; i < o.count; i++) { const e = a.subarray(i * 16, i * 16 + 16), s = Math.hypot(e[0], e[1], e[2]); outp.trees.push({ k: o.userData.tree, x: r3(e[12]), y: r3(e[13]), z: r3(e[14]), s: r3(s), ry: r3(Math.atan2(-e[8], e[0])) }); }
        return;
      }
      if (m.transparent && m.depthWrite === false && m.map && !m.vertexColors && o.renderOrder <= 1 && (o.geometry.type === 'PlaneGeometry' || o.geometry.type === 'CircleGeometry' || o.renderOrder === 1))
        outp.water.push({ kind: o.geometry.type === 'PlaneGeometry' ? 'sea' : o.geometry.type === 'CircleGeometry' ? 'lake' : 'river', ...meshOf(o) });
    });
    return outp;
  }, name);
  if (!res.ground) throw Error('no ground mesh in the region scene');
  res.trees = res.trees.filter((t, i, a) => i === a.findIndex((u) => u.x === t.x && u.z === t.z));
  const b64 = (s) => Buffer.from(s.split(',')[1], 'base64');
  writeFileSync(join(out, 'ground.png'), b64(res.groundPng)); writeFileSync(join(out, 'mask.png'), b64(res.maskPng));
  if (shot) writeFileSync(shot, b64(res.groundPng));
  delete res.groundPng; delete res.maskPng;
  writeFileSync(join(out, 'board.json'), JSON.stringify(res));
  console.log(`${name}: ground ${res.ground.v.length / 3} verts, water ${res.water.length} (${res.water.map((w) => w.kind).join(' ')}), trees ${res.trees.length} → ${out}`);
  if (page.errors.length) console.log('page errors:', page.errors);
} finally { await game.close(); }
