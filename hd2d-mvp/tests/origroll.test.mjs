// The player's 离间, 诱纳 and 同盟 make the original's percent roll (`$E843`: `JSR $E87A; CMP #100; BCS` back — table
// bytes from the moving cursor, those of 100 and over thrown away; core/origrng.js), which comes under p more often
// than p times in 100 (50 → 55.1%). A uniform 0..99 draw made them fail more than the original does (2026-11-14). Rules only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as G from '../src/core/game.js';
import { realChance } from '../src/core/origrng.js';
G.setData(JSON.parse(readFileSync(new URL('../data/game-data.json', import.meta.url))));

const N = 4000;
// The share of N seeded tries of `cmd` that pass the percent check, on a game put back as it was before each.
function share(setup, cmd, passed) {
  let n = 0;
  for (let i = 0; i < N; i++) { const g = G.newGame(4, 1, 1), x = setup(g); g.seed = (0x9e3779b9 * (i + 1)) >>> 0; if (passed(cmd(g, x), g, x)) n++; }
  return (100 * n) / N;
}
const mine = (g) => g.cities[g.factions[g.player].city];
const theirs = (g) => g.cities.find((c) => c.faction !== G.NONE && c.faction !== g.player && c.officers.some((id) => !G.isRuler(g, id)));
const near = (got, p) => assert.ok(Math.abs(got - realChance(p)) < 2.5 && got > p + 2, `${got}% of ${N}: the original gives ${realChance(p).toFixed(1)}%, a uniform draw ${p}%`);

test('离间 passes its check as often as the original (p 50 → 55.1%)', () => {
  near(share((g) => { const c = mine(g), actor = c.officers[0], id = theirs(g).officers.find((x) => !G.isRuler(g, x));
    Object.assign(g.officers[actor], { int: 60, virtue: 40 }); g.officers[id].loyalty = 48; return { actor, id }; }, // (60+40)×(98−48)/100 = 50
  (g, { actor, id }) => G.sow(g, actor, id), (res) => !res.failed), 50);
});

test('诱纳 passes its check as often as the original (p 23 → 29.3%)', () => {
  near(share((g) => { const c = mine(g), actor = c.officers[0], id = theirs(g).officers.find((x) => !G.isRuler(g, x));
    c.officers.length = Math.min(c.officers.length, 5);
    Object.assign(g.officers[actor], { int: 80, virtue: 80, level: 1 }); g.officers[id].loyalty = 35; return { cid: c.id, actor, id }; }, // loyalty 31–40: (80×80+4000)/450 = 23
  (g, { cid, actor, id }) => G.lure(g, cid, actor, id), (res) => !!res.joined), 23);
});

test('同盟 is taken up as often as the original (p 20 → 25.8%)', () => {
  near(share((g) => { const c = mine(g), actor = c.officers[0], target = theirs(g).faction, tr = g.officers[g.factions[target].ruler];
    const edge = Math.max(G.citiesOf(g, g.player).length - G.citiesOf(g, target).length, 0);
    Object.assign(g.officers[actor], { int: 90, virtue: 70 }); tr.int = 160 - 4 * (20 - edge); return { cid: c.id, actor, target }; }, // (160 − ruler int)/4 + edge = 20
  (g, { cid, actor, target }) => G.allianceOffer(g, cid, actor, target), (res) => res.quote != null), 20);
});
