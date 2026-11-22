// 数据包校验 (docs/战略地图数据包扩展设计_2026-11-17.md §5.6): the same merge and checks the game makes when it loads a pack
// (src/core/pack.js), plus the geography only the board can tell: every new seat on land of the original sand table or of a
// region the pack declares, its town's footprint clear of the water.
//   node hd2d-mvp/tools/check_pack.mjs hd2d-mvp/mods/<id>      one pack; exit 1 and every problem listed
//   node hd2d-mvp/tools/check_pack.mjs --all [--index]         every pack under mods/; --index rewrites mods/index.json (the
//                                                               list the title screen offers, as a static server cannot list a folder)
// Only the pack's fixed files are read (pack.json, cities.json, roads.json, factions.json, officers.json): nothing else in or out of it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withBaseMap, mergePack, PACK_FILES } from '../src/core/pack.js';
import { regionHeights, gridHeightAt } from '../src/regionseam.js';

const MVP = fileURLToPath(new URL('..', import.meta.url)), MODS = path.join(MVP, 'mods');
const json = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const base = withBaseMap(json(path.join(MVP, 'data/game-data.json')), json(path.join(MVP, 'data/base-map.json')));
const REGIONS_DIR = path.join(MVP, 'assets/ai/sandtable/regions');
const regionIndex = fs.existsSync(path.join(REGIONS_DIR, 'index.json')) ? json(path.join(REGIONS_DIR, 'index.json')) : {};
// A town's half footprint by tier (tools/blender_sandtable.py SIZE): its whole model must stand on land.
const HALF = { capital: 0.58, major: 0.45, county: 0.34, pass: 0.43 };
const toX = (lon) => (lon - 111.5) * 0.9, toZ = (lat) => -(lat - 31.5); // src/worldmap.js

// A baked board's ground height (src/sandtable.js heightAt), from its board.json and height.bin.
function readBoard(dir) {
  const meta = json(path.join(dir, 'board.json')), raw = fs.readFileSync(path.join(dir, 'height.bin'));
  return { meta, height: new Uint16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2) };
}
const shape = ({ meta }, heightAt) => { const [X0, X1, Z0, Z1] = meta.box; return { meta, inside: (x, z) => x >= X0 && x <= X1 && z >= Z0 && z <= Z1, heightAt, sea: meta.sea }; };
const baseBoard = (() => { const b = readBoard(path.join(MVP, 'assets/ai/sandtable/board')); return shape(b, gridHeightAt(b.meta, Float32Array.from(b.height, (v) => b.meta.h[0] + v / 65535 * (b.meta.h[1] - b.meta.h[0])))); })();
// The boards a pack stands on (its data.pack.boards) with the original, each region's heights eased into the boards it lies flush
// against as both maps stand them (src/regionseam.js): land the easing sinks under the sea there is sea to the check too.
const boardSets = new Map();
export function boardsFor(names) {
  const key = names.join(',');
  if (!boardSets.has(key)) {
    const rs = names.filter((n) => fs.existsSync(path.join(REGIONS_DIR, n, 'board.json'))).map((n) => ({ name: n, ...readBoard(path.join(REGIONS_DIR, n)) }));
    const at = regionHeights(rs, baseBoard), set = { base: baseBoard };
    rs.forEach((r, k) => { set[r.name] = shape(r, at[k]); });
    boardSets.set(key, set);
  }
  return boardSets.get(key);
}

export function checkPack(dir) {
  const id = path.basename(dir), read = (f) => {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) return undefined;
    if (fs.lstatSync(p).isSymbolicLink()) throw Error(`${f} 是符号链接：数据包里只能放 JSON 文件本身`);
    return json(p);
  };
  const pack = {}, errors = [], warnings = [];
  try { pack.meta = read('pack.json'); } catch (e) { return { errors: [`pack.json：${e.message}`], warnings }; }
  if (pack.meta === undefined) return { errors: ['找不到 pack.json'], warnings };
  for (const f of PACK_FILES) { try { pack[f.replace('.json', '')] = read(f); } catch (e) { errors.push(`${f}：${e.message}`); } }
  const extra = fs.readdirSync(dir).filter((f) => !['pack.json', ...PACK_FILES, 'README.md'].includes(f));
  if (extra.length) warnings.push(`游戏不会读这些文件：${extra.join('、')}`);
  if (pack.meta?.id !== id) errors.push(`pack.json 的 id「${pack.meta?.id}」与文件夹名「${id}」不一致`);
  const { data, errors: bad } = mergePack(base, pack, { regions: regionIndex });
  errors.push(...bad);
  if (!data) return { errors, warnings };
  // Geography: on land, the whole footprint, on a board the pack may use.
  const boards = boardsFor(data.pack.boards ?? []), allowed = ['base', ...(data.pack.boards ?? [])];
  for (const c of data.cities.slice(base.cities.length)) {
    const x = toX(c.lon), z = toZ(c.lat), r = HALF[c.tier];
    const on = allowed.find((k) => boards[k]?.inside(x, z)), b = boards[on];
    if (!b) { errors.push(`城 ${c.name}：${c.lon}, ${c.lat} 不在原版沙盘${allowed.length > 1 ? '或所声明的地块' : ''}上`); continue; }
    // The style is the author's choice (a Han garrison may stand in Japan): only a reminder that it exists.
    if (on === 'japan' && !c.style) warnings.push(`城 ${c.name}：在 japan 地块上，模型是汉式城池；要日式或朝鲜式的，写 "style": "japan" 或 "korea"`);
    const pts = [[0, 0], ...Array.from({ length: 12 }, (_, k) => [Math.cos(k * Math.PI / 6) * r, Math.sin(k * Math.PI / 6) * r])];
    const wet = pts.filter(([ox, oz]) => b.heightAt(x + ox, z + oz) < b.sea + 0.02).length;
    if (b.heightAt(x, z) < b.sea + 0.02) errors.push(`城 ${c.name}：治所 ${c.lon}, ${c.lat} 在水里`);
    else if (wet) errors.push(`城 ${c.name}：城的占地（半径 ${r}）有 ${wet} 处压到水面，往内陆挪一点`);
    const rivers = (b.meta.water ?? []).filter((w) => w.kind !== 'sea');
    for (const w of rivers) for (let k = 0; k < w.v.length; k += 3) if (Math.hypot(w.v[k] - x, w.v[k + 2] - z) < r) { errors.push(`城 ${c.name}：压在${w.kind === 'lake' ? '湖' : '河'}上`); k = w.v.length; }
    // The sand table lifts the trees and hamlets under a new town, but its long ranges and massifs stay (src/sandtable.js STAY):
    // a town standing in one shows its walls through the mountain.
    const hills = new Set();
    for (const kind of ['range-a', 'range-b', 'massif', 'ridge']) {
      const arr = b.meta.pieces?.[kind] ?? [], reach = r + (b.meta.size?.[kind] ?? 0) * 0.4;
      for (let i = 0; i < arr.length; i += 6) if (Math.hypot(arr[i] - x, arr[i + 2] - z) < reach) hills.add(kind === 'ridge' ? '山脊' : kind === 'massif' ? '山岳' : '山脉');
    }
    if (hills.size) warnings.push(`城 ${c.name}：贴着沙盘上的${[...hills].join('、')}，城墙会和山体穿插，最好挪到平地上`);
  }
  // Pictures: a borrowed officer without his own painted portrait falls back to 阿会喃's; say so.
  const portraits = new Set((fs.existsSync(path.join(MVP, 'assets/ai/portraits/index.json')) ? json(path.join(MVP, 'assets/ai/portraits/index.json')) : []).map(Number));
  for (const o of data.officers.slice(base.officers.length)) if (!portraits.has(o.art)) warnings.push(`武将 ${o.name}：借用的 ${base.officers[o.art].name} 没有画好的头像，会显示默认头像`);
  return { errors, warnings, data };
}

const run = (dir) => {
  const { errors, warnings, data } = checkPack(dir);
  const id = path.basename(dir);
  for (const w of warnings) console.log(`  提示 ${id}：${w}`);
  if (errors.length) { console.log(`✗ ${id}：${errors.length} 处问题`); for (const e of errors) console.log(`  ${e}`); return null; }
  console.log(`✓ ${id}：${data.cities.length} 城（新 ${data.cities.length - base.cities.length}），${data.factions.filter((f) => !f.placeholder).length} 个势力，${data.officers.length} 名武将`);
  return data.pack;
};
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes('--all')) {
    const ids = fs.existsSync(MODS) ? fs.readdirSync(MODS).filter((f) => fs.statSync(path.join(MODS, f)).isDirectory()).sort() : [];
    const ok = ids.map((id) => [id, run(path.join(MODS, id))]);
    if (args.includes('--index')) {
      const list = ok.filter(([, p]) => p).map(([id, p]) => ({ id, name: p.name, version: p.version, author: p.author }));
      fs.writeFileSync(path.join(MODS, 'index.json'), `${JSON.stringify(list, null, 2)}\n`);
      console.log(`mods/index.json：${list.length} 个数据包`);
    }
    process.exit(ok.every(([, p]) => p) ? 0 : 1);
  }
  if (!args[0]) { console.log('用法：node hd2d-mvp/tools/check_pack.mjs hd2d-mvp/mods/<包名>  或  --all [--index]'); process.exit(2); }
  process.exit(run(path.resolve(args[0])) ? 0 : 1);
}
