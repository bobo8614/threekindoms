// Guard for visual work on the war map: the terrain rules must not move. For every one of the 30 battlefields,
// each army kind (平 / 水 / 山) at both troop sizes (≥600 large, else small), it records what every cell
// costs (core/field.js cost(), the ROM's move_cost table) and the cells a general reaches from each of a
// spread of starting cells with a full mobility pool, then compares that against the committed fixture.
//   node hd2d-mvp/tools/war_reach_check.mjs          check against tools/fixtures/war_reach.json
//   node hd2d-mvp/tools/war_reach_check.mjs --write  record the fixture (only when the rules are meant to change)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { setData, newGame, data } from '../src/core/game.js';
import { Field, W, H } from '../src/core/field.js';
setData(JSON.parse(readFileSync(new URL('../data/game-data.json', import.meta.url))));
const fixture = new URL('./fixtures/war_reach.json', import.meta.url);

const g = newGame(4, 1, 1);
const out = {};
for (let city = 0; city < 30; city++) {
  const war = { city, from: (city + 1) % 30, attacker: 1, defender: 2, day: 1, att: { ids: [], gold: 0, rice: 0 }, def: { ids: [], gold: 0, rice: 0 } };
  let f;
  try { f = new Field(g, war, null); } catch (e) { out[city] = `ERROR ${e.message}`; continue; }
  const id = 0, o = g.officers[id], keep = { army: o.army, soldiers: o.soldiers };
  const lines = [];
  for (const army of ['平', '水', '山']) for (const soldiers of [1000, 300]) {
    Object.assign(o, { army, soldiers });
    const u = { id, side: 'att', x: 0, y: 0 };
    f.units = [u];
    const cost = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) cost.push(f.cost(u, x, y));
    lines.push(`${army}${soldiers} cost ${cost.join('')}`);
    for (let y = 1; y < H; y += 6) for (let x = 1; x < W; x += 7) {
      Object.assign(u, { x, y }); u.stop = u.qimen = false;
      const r = f.reach(u, data().rules.mobility_cap.at(-1));
      lines.push(`${army}${soldiers} @${x},${y} ${[...r.dist].sort().map(([k, d]) => `${k}=${d}`).join(' ')}`);
    }
  }
  Object.assign(o, keep);
  out[city] = createHash('sha256').update(lines.join('\n')).digest('hex').slice(0, 16);
}

if (process.argv.includes('--write')) {
  mkdirSync(new URL('./fixtures/', import.meta.url), { recursive: true });
  writeFileSync(fixture, JSON.stringify(out, null, 1) + '\n');
  console.log('wrote', fixture.pathname);
} else {
  const want = JSON.parse(readFileSync(fixture, 'utf8'));
  const bad = Object.keys(want).filter((k) => want[k] !== out[k]);
  console.log(bad.length ? `terrain costs or reach changed on battlefields ${bad.join(', ')}` : `terrain costs and reach unchanged on all ${Object.keys(want).length} battlefields`);
  process.exit(bad.length ? 1 : 0);
}
