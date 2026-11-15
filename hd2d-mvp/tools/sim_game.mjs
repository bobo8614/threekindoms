// Headless campaign: the "player" faction is driven by the field-war AI on both sides, every
// AI faction by core/ai.js. Exercises the whole loop (events, wars, succession, endings).
//   node hd2d-mvp/tools/sim_game.mjs [player=4] [level=1] [years=30] [seed=1]
import { readFileSync } from 'node:fs';
import * as G from '../src/core/game.js';
import { aiTurn } from '../src/core/ai.js';
import { setupWar, resolveWar, occupyEmpty } from '../src/core/warcore.js';
import { Field } from '../src/core/field.js';
G.setData(JSON.parse(readFileSync(new URL('../data/game-data.json', import.meta.url))));
const [P = 4, L = 1, Y = 30, S = 1] = process.argv.slice(2).map(Number);
const g = G.newGame(P, L, S), stats = { events: {}, fieldWars: 0, playerAttacks: 0 };
async function field(w, side) {
  stats.fieldWars++;
  const f = new Field(g, w, side); let n = 0;
  while (!f.over && n++ < 100) { for (const act of f.aiActions(f.turn)) if (act.res?.pending) act.res.auto(); f.endTurn(); }
  resolveWar(g, w, f.result()); await G.checkFactions(g, io);
}
const io = {
  async event(e) { stats.events[e.type] = (stats.events[e.type] || 0) + 1; if (g.year >= 189 + Y) g.over ||= { type: 'stop' }; },
  async aiTurn(f) { await aiTurn(g, f, io); },
  async war(w) { await field(w, 'def'); },
  async afterWar() { await G.checkFactions(g, io); },
  async allianceOffer() { return true; },
  async chooseHeir(f, c) { return G.autoHeir(g, f); },
  async playerTurn() {
    // naive player: develop, conscript, and attack the weakest neighbour with the strongest city
    for (const c of G.citiesOf(g, P)) { if (g.books <= 0) break; const id = c.officers[0]; const r = G.develop(g, c.id, id, 'land', G.devCost(g, id)); if (r.ok) g.books--; }
    const src = G.citiesOf(g, P).sort((a, b) => G.troopsOf(g, b) - G.troopsOf(g, a))[0];
    if (src && g.books > 0 && src.officers.length >= 2) {
      const n = G.conscriptMax(src); if (n) { G.conscript(g, src.id, n); for (const id of src.officers) for (let k = 0; k < 10; k++) G.assignTroops(g, src.id, id, 1); }
      const t = G.roads(src.id).map((x) => g.cities[x]).filter((c) => c.faction !== P).sort((a, b) => G.troopsOf(g, a) - G.troopsOf(g, b))[0];
      if (t && !process.env.PASSIVE && G.troopsOf(g, src) > G.troopsOf(g, t) * 1.3) {
        const ids = src.officers.slice(0, -1), gold = Math.min(200, src.gold), rice = Math.min(src.rice, ids.length * 150);
        g.books--; stats.playerAttacks++;
        if (t.faction === G.NONE && !t.officers.length) occupyEmpty(g, { from: src.id, to: t.id, ids, gold, rice });
        else await field(setupWar(g, { from: src.id, to: t.id, ids, commander: ids[0], gold, rice }), 'att');
      }
    }
    g.books = 0;
  },
};
await G.run(g, io).catch((e) => { console.error('CRASH', g.year, g.month, e); process.exit(1); });
console.log('end', g.over, `${g.year}/${g.month + 1}`, stats);
console.log(g.factions.map((f) => `${G.factionName(g, f.id)}:${f.ruler == null ? '亡' : G.citiesOf(g, f.id).length}`).join(' '));
const seen = new Set();
for (const c of g.cities) for (const id of c.officers) { if (seen.has(id) || g.officers[id].status !== 2) console.log('BAD', id, c.id, g.officers[id].status); seen.add(id); }
for (const c of g.cities) if (c.officers.length > 10 || (c.faction !== G.NONE && !c.officers.length) ) console.log('BAD CITY', c.id, c.faction, c.officers.length);
