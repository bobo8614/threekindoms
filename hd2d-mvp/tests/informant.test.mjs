// Who brings the news when an AI 离间 or 引拔 strikes the player (terry@devblog #371): the struck faction's sharpest mind, its
// ruler left out, the later city and slot on a tie, as bank 10 $BD40 scans for $3D before the E6 window. Rules only, in Node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as G from '../src/core/game.js';
import { informant } from '../src/core/ai.js';
const D = JSON.parse(readFileSync(new URL('../data/game-data.json', import.meta.url)));
G.setData(D);

// The player's realm laid out by hand: { cityId: [[officerId, int], …] }, every other city emptied of the player's men.
function realm(layout) {
  const g = G.newGame(0, 0, 1), P = g.player, ruler = g.factions[P].ruler;
  for (const c of g.cities) if (c.faction === P) { c.faction = G.NONE; c.officers = []; }
  for (const [cid, list] of Object.entries(layout)) {
    const c = g.cities[cid]; c.faction = P; c.officers = list.map(([id]) => id);
    for (const [id, int] of list) g.officers[id].int = int;
  }
  return { g, P, ruler };
}
const others = (g, P, n) => g.officers.map((o) => o.id).filter((id) => !G.isRuler(g, id)).slice(0, n);

test('the sharpest officer reports, never the ruler however sharp', () => {
  const t = realm({}), [a, b] = others(t.g, t.P, 2);
  const r = realm({ 3: [[t.ruler, 99], [a, 70]], 7: [[b, 85]] });
  assert.equal(informant(r.g, r.P), b);
});

test('on a tie the later city wins, then the later slot', () => {
  const t = realm({}), [a, b, c] = others(t.g, t.P, 3);
  let r = realm({ 3: [[t.ruler, 10], [a, 80]], 9: [[b, 80]] });
  assert.equal(informant(r.g, r.P), b, 'later city');
  r = realm({ 3: [[t.ruler, 10], [a, 80], [c, 80]] });
  assert.equal(informant(r.g, r.P), c, 'later slot');
});

test('an officer of 知力 0 still reports when he is all there is beside the ruler', () => {
  const t = realm({}), [a] = others(t.g, t.P, 1);
  const r = realm({ 3: [[t.ruler, 90], [a, 0]] });
  assert.equal(informant(r.g, r.P), a);
});

test('a ruler standing alone has no one to report: no portrait', () => {
  const t = realm({});
  const r = realm({ 3: [[t.ruler, 90]] });
  assert.equal(informant(r.g, r.P), null);
});

test('other factions’ men in the scan are not counted', () => {
  const t = realm({}), [a, b] = others(t.g, t.P, 2);
  const r = realm({ 3: [[t.ruler, 10], [a, 40]] });
  const enemy = r.g.cities.find((c) => c.faction !== r.P && c.faction !== G.NONE);
  enemy.officers.push(b); r.g.officers[b].int = 99;
  assert.equal(informant(r.g, r.P), a);
});

test('an AI turn hands the news of its 离间 and 引拔 to that reporter, never to the lured man himself', async () => {
  const { aiTurn } = await import('../src/core/ai.js');
  const seen = { aiLure: 0, aiIncite: 0 };
  for (let seed = 0; seed < 400 && !(seen.aiLure && seen.aiIncite); seed++) {
    const Dx = structuredClone(D);
    for (const row of Dx.rules.ai_dispatch) row.weights = [0, 16, 0];
    G.setData(Dx);
    const g = G.newGame(0, 0, seed), P = g.player;
    // The player's men all wavering, and one city full enough (≥6) to be a 离间 target.
    const home = g.cities.find((c) => c.faction === P);
    const spare = g.officers.filter((o) => !G.isRuler(g, o.id) && !g.cities.some((c) => c.officers.includes(o.id))).slice(0, 8);
    for (const o of spare) { home.officers.push(o.id); o.status = G.SERVING; }
    home.officers = home.officers.slice(0, 10);
    for (const c of g.cities) if (c.faction === P) for (const id of c.officers) if (!G.isRuler(g, id)) g.officers[id].loyalty = 60;
    for (const f of g.factions.filter((x) => x.ai && x.ruler != null)) {
      await aiTurn(g, f.id, { event: async (e) => {
        if ((e.type !== 'aiLure' || e.from !== P) && e.type !== 'aiIncite') return;
        seen[e.type]++;
        assert.equal(e.reporter, informant(g, P), `${e.type}: the struck faction's sharpest, ruler left out`);
        assert.notEqual(e.reporter, g.factions[P].ruler);
        if (e.type === 'aiLure') assert.notEqual(e.reporter, e.id, 'the lured man has already left');
      }, war: async () => {}, afterWar: async () => {} });
    }
  }
  G.setData(D);
  assert.ok(seen.aiLure && seen.aiIncite, `saw ${JSON.stringify(seen)}`);
});
