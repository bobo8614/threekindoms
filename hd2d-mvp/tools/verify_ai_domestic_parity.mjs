// node --experimental-vm-modules hd2d-mvp/tools/verify_ai_domestic_parity.mjs fixtures.json [result.json]
// Executes the unchanged production aiTurn body with the original RNG dependency. Only the prelude
// and main-dispatch draws are prefixed to isolate the ROM's BEC7 entry; all domestic calls use the ROM table.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import * as G from '../src/core/game.js';
const fixtures = JSON.parse(fs.readFileSync(process.argv[2]));
const original = JSON.parse(fs.readFileSync(new URL('../data/game-data.json', import.meta.url)));
let draw;
const source = new vm.SourceTextModule(fs.readFileSync(new URL('../src/core/ai.js', import.meta.url), 'utf8'));
await source.link(async (specifier) => {
  const values = specifier === './game.js' ? { ...G, rng: () => draw } : await import(new URL(`../src/core/${specifier.slice(2)}`, import.meta.url));
  return new vm.SyntheticModule(Object.keys(values), function () { for (const [k, v] of Object.entries(values)) this.setExport(k, v); });
});
await source.evaluate();
let passed = 0;
for (const f of fixtures.cases) {
  const D = structuredClone(original);
  for (const row of D.rules.ai_dispatch) row.weights = [0, 0, 1];
  for (const c of D.cities) c.facilities.market = false; // no prelude grain sale when isolating BEC7
  G.setData(D);
  const g = G.newGame(0, f.level, 0);
  for (const o of g.officers) Object.assign(o, { status: G.SERVING, int: 65, loyalty: 100, weapon: 23, armor: 7 });
  for (const c of g.cities) Object.assign(c, { faction: G.NONE, officers: [] });
  for (const c of f.initial) { const { int, loyalty, ...fields } = c; Object.assign(g.cities[c.id], fields, { faction: 4, officers: [20 + c.id] }); }
  g.factions[4].ruler = 20; g.aiCursor[4] = f.cursor;
  let prefix = 2 * 2 * f.n + 1, cursor = f.randomCursor;
  draw = (n) => {
    if (prefix > 0) { prefix--; return prefix ? 99 : 0; } // two prelude passes of search + ronin per own city, then main dispatch
    for (let guard = 0; guard < 256; guard++) {
      const value = fixtures.rngTable[cursor] & (n < 15 ? 15 : 255); cursor = (cursor + 1) & 255;
      if (value < n) return value;
    }
    throw Error(`invalid original RNG bound ${n}`);
  };
  await source.namespace.aiTurn(g, 4, { event: async () => {}, war: async () => assert.fail('unexpected war') });
  const actual = f.initial.map(({ id }) => ({ ...Object.fromEntries(Object.keys(f.initial[0]).filter((k) => !['int', 'loyalty'].includes(k)).map((k) => [k, g.cities[id][k]])), int: g.officers[20 + id].int, loyalty: g.officers[20 + id].loyalty }));
  assert.deepEqual(actual, f.expected, JSON.stringify({ ...f, initial: undefined, expected: undefined }));
  assert.equal(g.aiCursor[4], f.expectedCursor, 'persistent city cursor');
  assert.equal(cursor, f.expectedRandomCursor, 'all domestic RNG draws and retries');
  passed++;
}
const result = { cases: fixtures.cases.length, passed, romSHA256: fixtures.romSHA256, scope: 'Production aiTurn body, original domestic RNG, all own-city resources/attributes/officer knowledge/loyalty and both final cursors; no PPU/APU or full original campaign.' };
if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
