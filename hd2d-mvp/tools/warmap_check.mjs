// Every battlefield has its painting for every season it is fought in (assets/ai/warground/maps), on the
// board frame the war view lays the cells over. Exit 1 lists what is missing.
//   node --import ./hd2d-mvp/tools/node_imports.mjs hd2d-mvp/tools/warmap_check.mjs
import { existsSync, readFileSync } from 'node:fs';
import { seasonsOf } from '../src/warseason.js';

const DIR = new URL('../assets/ai/warground/maps/', import.meta.url).pathname;
const BOARD = { x: 60, y: 110, w: 1654, h: 707 };
const fields = JSON.parse(readFileSync(new URL('../data/game-data.json', import.meta.url))).maps;
const CITY_SITES = JSON.parse(readFileSync(new URL('../data/base-map.json', import.meta.url))).cities; // the original 30's seats
const bad = [];
for (const city of Object.keys(fields).map(Number)) {
  const want = seasonsOf(CITY_SITES[city].lat), f = `${DIR}${city}.json`;
  if (!existsSync(f)) { bad.push(`${city}: no ${city}.json (wants ${want})`); continue; }
  const m = JSON.parse(readFileSync(f));
  for (const k of ['x', 'y', 'w', 'h']) if (m.board?.[k] !== BOARD[k]) bad.push(`${city}: board.${k} ${m.board?.[k]} ≠ ${BOARD[k]}`);
  for (const s of want) {
    if (!m.images?.[s]) bad.push(`${city}: no ${s} picture`);
    else if (!existsSync(DIR + m.images[s])) bad.push(`${city}: ${m.images[s]} missing`);
  }
}
console.log(bad.length ? bad.join('\n') : `all ${Object.keys(fields).length} battlefields painted for every season`);
process.exit(bad.length ? 1 : 0);
