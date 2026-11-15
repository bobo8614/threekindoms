// Headless war-map soak: AI vs AI on the field engine for N random wars.
import { readFileSync } from 'node:fs';
import { setData, newGame, citiesOf } from '../src/core/game.js';
import { setupWar, resolveWar } from '../src/core/warcore.js';
import { Field } from '../src/core/field.js';
setData(JSON.parse(readFileSync(new URL('../data/game-data.json', import.meta.url))));
const N = Number(process.argv[2] || 50), why = {}, days = [];
let duels = 0, deaths = 0, caps = 0;
for (let i = 0; i < N; i++) {
  const g = newGame(4, 1, i + 1);
  const src = g.cities[i % 30];
  if (src.faction === 7 || src.officers.length < 2) continue;
  const tgt = src.id && g.cities[(src.id + 1) % 30];
  const to = (await import('../src/core/game.js')).roads(src.id).find((n) => g.cities[n].faction !== src.faction && g.cities[n].officers.length);
  if (to == null) continue;
  const ids = src.officers.slice(0, Math.min(3, src.officers.length));
  const war = setupWar(g, { from: src.id, to, ids, commander: ids[0], gold: Math.min(300, src.gold), rice: Math.min(400, src.rice) });
  const f = new Field(g, war, null);
  let guard = 0;
  while (!f.over && guard++ < 200) {
    for (const a of f.aiActions(f.turn)) { if (a.type === 'attack') { duels += a.res.duels || 0; if (a.res.a.fate === 'dead' || a.res.d.fate === 'dead') { deaths++; why[a.res.duel?.dead ? 'duelDeath' : 'fieldDeath'] = (why[a.res.duel?.dead ? 'duelDeath' : 'fieldDeath'] || 0) + 1; } if (a.res.a.fate === 'captured' || a.res.d.fate === 'captured') caps++; } }
    f.endTurn();
  }
  why[f.over?.why] = (why[f.over?.why] || 0) + 1; days.push(f.day);
  resolveWar(g, war, f.result());
  for (const c of g.cities) if (c.officers.length > 10 || new Set(c.officers).size !== c.officers.length) console.log('BAD', c.id, c.officers);
}
console.log({ why, avgDay: days.reduce((a, b) => a + b, 0) / days.length, duels, deaths, caps });
