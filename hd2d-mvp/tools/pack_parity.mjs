// No pack ⇒ nothing changes (AGENTS.md rule 4, docs/战略地图数据包扩展设计_2026-11-17.md §2): the same seeded campaigns on a
// frozen copy of the rules core from before a change and on src/core now, compared as whole game records after every turn.
//   git archive <commit> hd2d-mvp/src hd2d-mvp/data | tar -x -C /tmp/before
//   node hd2d-mvp/tools/pack_parity.mjs --before /tmp/before/hd2d-mvp [--seeds 12] [--months 72]
// Both sides play every house by the AI, and in a second run the player's 刘备 ends each turn at once (so AI wars on him go
// through the war map's own Field AI). Exit code 1 and the first differing turn on any mismatch.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const args = process.argv.slice(2), arg = (k, d) => { const i = args.indexOf(`--${k}`); return i < 0 ? d : args[i + 1]; };
const MVP = fileURLToPath(new URL('..', import.meta.url));
const before = arg('before'); if (!before) throw Error('--before <dir with src/ and data/> is required');
const seeds = Number(arg('seeds', 12)), months = Number(arg('months', 72));

async function engine(root, mergeMap) {
  const core = path.join(root, 'src/core'), imp = (f) => import(pathToFileURL(path.join(core, f)));
  const [G, A, W, F] = await Promise.all(['game.js', 'ai.js', 'warcore.js', 'field.js'].map(imp));
  const D = JSON.parse(fs.readFileSync(path.join(root, 'data/game-data.json')));
  if (mergeMap) (await imp('pack.js')).withBaseMap(D, JSON.parse(fs.readFileSync(path.join(root, 'data/base-map.json'))));
  return { G, A, W, F, D };
}
const STOP = Symbol('done');
// The record as the game would save it, minus the fields the new layout may add only with a pack.
async function play(e, seed, level, player) {
  const { G, A, W, F } = e;
  G.setData(structuredClone(e.D));
  const g = G.newGame(player, level, seed), trail = [];
  const mark = (what) => { trail.push(`${what} ${JSON.stringify(g)}`); if ((g.year - 189) * 12 + g.month >= months) throw STOP; };
  const io = {
    event: async () => {}, chooseHeir: async (f) => G.autoHeir(g, f), allianceOffer: async () => false,
    war: async (war) => {
      const field = new F.Field(g, war, null);
      while (!field.over) { for (const _ of field.aiActions(field.turn)); field.endTurn(); }
      W.resolveWar(g, war, field.result()); await G.checkFactions(g, io);
    },
    afterWar: async () => G.checkFactions(g, io),
    aiTurn: async (f) => { await A.aiTurn(g, f, io); mark(`ai ${f}`); },
    playerTurn: async () => { g.endTurn = true; mark('player'); },
  };
  try { await G.run(g, io); } catch (x) { if (x !== STOP) throw x; }
  trail.push(`end ${JSON.stringify(g)}`);
  return trail;
}

const old = await engine(path.resolve(before), false), now = await engine(MVP, true);
let bad = 0, turns = 0;
for (const player of [-1, 4]) for (let s = 0; s < seeds; s++) {
  const seed = 0x5eed0000 + s * 7919, level = s % 3;
  const [a, b] = [await play(old, seed, level, player), await play(now, seed, level, player)];
  turns += a.length;
  const i = a.findIndex((x, k) => x !== b[k]);
  if (i >= 0 || a.length !== b.length) {
    bad++;
    const k = i >= 0 ? i : Math.min(a.length, b.length);
    console.log(`MISMATCH player ${player} seed ${seed} level ${level} at turn ${k}: ${(a[k] ?? '—').slice(0, 40)} | ${(b[k] ?? '—').slice(0, 40)}`);
  }
}
console.log(`${2 * seeds} campaigns, ${turns} turns compared, ${bad} differing`);
process.exit(bad ? 1 : 0);
