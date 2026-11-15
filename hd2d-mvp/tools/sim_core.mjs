// Headless soak test of the strategic core: every faction AI-driven, N years.
//   node hd2d-mvp/tools/sim_core.mjs [years=10] [seed=1]
import { readFileSync } from 'node:fs';
import { setData, newGame, run, citiesOf, checkFactions, factionName, name, cityName } from '../src/core/game.js';
import { aiTurn } from '../src/core/ai.js';
import { autoBattle } from '../src/core/warcore.js';
setData(JSON.parse(readFileSync(new URL('../data/game-data.json', import.meta.url))));
const years = Number(process.argv[2] || 10), g = newGame(4, 1, Number(process.argv[3] || 1));
g.factions.forEach((f) => (f.ai = true));
const stats = { wars: 0, events: {} };
const io = {
  async event(e) { stats.events[e.type] = (stats.events[e.type] || 0) + 1; if (e.type === 'autobattle' && e.res.attWins) stats.taken = (stats.taken || 0) + 1; if (e.type === 'autobattle' && g.year < 194) stats.w5 = (stats.w5 || 0) + 1; if (g.year >= 189 + years) g.over = { type: 'stop' }; },
  async aiTurn(f) { await aiTurn(g, f, io); },
  async war(war) { stats.wars++; const r = autoBattle(g, war); if (r.attWins) stats.taken = (stats.taken || 0) + 1; await checkFactions(g, io); },
  async afterWar() { stats.wars++; await checkFactions(g, io); },
  async chooseHeir(f, c) { return c[0]; },
  async allianceOffer() { return true; },
  async playerTurn() { g.books = 0; },
};
const t0 = Date.now();
await run(g, io).catch((e) => { console.error('CRASH', e); process.exit(1); });
console.log('ended', g.over, `${g.year}/${g.month + 1}`, Date.now() - t0, 'ms');
console.log(stats);
for (const f of g.factions) console.log(factionName(g, f.id), f.ruler == null ? '覆灭' : `${name(f.ruler)} ${citiesOf(g, f.id).length}城 ${citiesOf(g, f.id).map((c) => cityName(c.id)).join('')}`);
const off = g.officers.filter((o) => o.status === 2).length, ron = g.officers.filter((o) => o.status === 0).length, dead = g.officers.filter((o) => o.status === 3).length;
console.log({ serving: off, ronin: ron, dead });
for (const c of g.cities) if (c.officers.length > 10 || new Set(c.officers).size !== c.officers.length) console.log('BAD ROSTER', c.id, c.officers);
const seen = new Map(); for (const c of g.cities) for (const id of c.officers) { if (seen.has(id)) console.log('DUP', id, seen.get(id), c.id); seen.set(id, c.id); if (g.officers[id].status !== 2) console.log('NOT SERVING IN CITY', id, g.officers[id].status); }
