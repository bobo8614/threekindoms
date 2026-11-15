// Headless 白兵 soak: random officer pairs on every terrain, AI on both sides.
import { readFileSync } from 'node:fs';
import * as G from '../src/core/game.js';
import { Tactical } from '../src/core/tactical.js';
G.setData(JSON.parse(readFileSync(new URL('../data/game-data.json', import.meta.url))));
const N = Number(process.argv[2] || 200), stats = { why: {}, rounds: 0, lossA: 0, lossD: 0, duels: 0 };
for (let i = 0; i < N; i++) {
  const g = G.newGame(4, 1, i + 1), r = G.rng(g);
  const ids = g.officers.filter((o) => o.status === 2).map((o) => o.id);
  const a = ids[r(ids.length)], d = ids[r(ids.length)]; if (a === d) continue;
  g.officers[a].soldiers = 100 * (1 + r(10)); g.officers[d].soldiers = 100 * (1 + r(10));
  const t = new Tactical(g, a, d, r(6), r);
  const res = t.runAuto();
  stats.why[res.why] = (stats.why[res.why] || 0) + 1; stats.rounds += res.rounds; stats.lossA += res.lossA; stats.lossD += res.lossD; stats.duels += res.duels;
  if (res.lossA < 0 || res.lossD < 0 || res.a.soldiers > g.officers[a].soldiers) console.log('BAD', res);
}
stats.rounds /= N; stats.lossA = Math.round(stats.lossA / N); stats.lossD = Math.round(stats.lossD / N);
console.log(stats);
