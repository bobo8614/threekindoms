// Checks the 人物志 / 登场情报 helpers against the data and the rules they describe.
//   node hd2d-mvp/tools/check_talent.mjs
import { readFileSync } from 'node:fs';
import { setData, data, newGame, debutInfo, cityTalent, queueHead, joinQueue, search, autoJoin, UNAPPEARED, SERVING, RONIN } from '../src/core/game.js';
setData(JSON.parse(readFileSync(new URL('../data/game-data.json', import.meta.url))));
const D = data();
let bad = 0, found = 0, joined = 0;
const fail = (...m) => { bad++; console.log('FAIL', ...m); };

// Every officer has exactly one way in, matching his `appear` tag.
const KIND = { initial: 'initial', search_city: 'search', automatic_faction: 'auto' };
for (const o of D.officers) {
  const d = debutInfo(o.id);
  if (d.kind !== KIND[o.appear]) fail(o.name, o.appear, d.kind);
  if (d.kind === 'search' && D.search_table[d.city][d.order - 1] !== o.id) fail(o.name, 'search order');
  if (d.kind === 'auto' && D.join_table[d.faction][d.order - 1] !== o.id) fail(o.name, 'join order');
}

// 搜索 only ever finds the queue head (once his year has come) or a nearby ronin.
for (let seed = 1; seed <= 400; seed++) {
  const g = newGame(4, 1, seed);
  g.year = 189 + (seed % 22);
  for (const o of g.officers) if (o.status === UNAPPEARED && D.officers[o.id].year < g.year - 2 && seed % 3) o.status = SERVING; // some already found
  if (seed % 5 === 0) { const o = g.officers.find((x) => x.status === SERVING && !g.factions.some((f) => f.ruler === x.id)); o.status = RONIN; o.loc = seed % 30; }
  const cid = seed % 30, c = g.cities[cid];
  if (c.faction === 7) { c.faction = 4; c.officers = [g.factions[4].ruler]; }
  const t = cityTalent(g, cid), exec = c.officers[0];
  const allowed = new Set([...(t.head?.ready ? [t.head.id] : []), ...t.ronin]);
  for (let i = 0; i < 6; i++) {
    const r = search(g, cid, exec);
    const got = r.joined ?? r.offer;
    if (got != null && !allowed.has(got)) fail('seed', seed, 'search found', D.officers[got].name, 'not in', [...allowed]);
    if (got != null) { found++; break; }
  }
  for (let f = 0; f < 7; f++) {
    const head = queueHead(g, joinQueue(f)), j = autoJoin(g, f);
    if (j) joined++;
    if (j && (!head?.ready || head.id !== j.id)) fail('seed', seed, 'autoJoin', f, j.id, head);
  }
}
console.log(bad ? `${bad} failures` : `ok: debutInfo covers all officers; 搜索 and 自动出仕 follow the queue heads (${found} finds, ${joined} arrivals checked)`);
process.exit(bad ? 1 : 0);
