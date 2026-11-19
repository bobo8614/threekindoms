// 电脑好战 (g.warlike, src/core/ai.js) against the original rules, without rendering or sound: five-year campaigns for
// every ruler at each level, the player scripted (defend: conscript and fill only; expand: also sends two officers
// into an adjacent empty city). Wars on the player are fought on the field by the shipped AI for both sides.
//   node hd2d-mvp/tools/sim_warlike.mjs [stats] [seeds=8]      the table quoted in README.md (about 10 seconds)
//   node hd2d-mvp/tools/sim_warlike.mjs digest [seeds=6] [core]  a hash of the end states with the option off; pass
//     another checkout's src/core as the third argument to check that a change leaves the option-off game as it was
import fs from 'node:fs'; import { pathToFileURL, fileURLToPath } from 'node:url'; import crypto from 'node:crypto';
const [mode = 'stats', N = mode === 'digest' ? 6 : 8, dir = fileURLToPath(new URL('../src/core', import.meta.url))] = process.argv.slice(2);
const imp = (f) => import(pathToFileURL(`${dir}/${f}`));
const D = JSON.parse(fs.readFileSync(new URL('../data/game-data.json', import.meta.url)));
const G = await imp('game.js'), A = await imp('ai.js'), W = await imp('warcore.js'), F = await imp('field.js');
const STOP = Symbol(), MONTHS = 60;
async function run(level, seed, player, warlike, policy) {
  G.setData(structuredClone(D)); const g = G.newGame(player, level, seed); if (warlike) g.warlike = true;
  const el = () => (g.year - 189) * 12 + g.month; const out = { pw: 0, plost: 0, aw: 0, conq: 0, march: 0, pmarch: 0, poor: 0, starved: 0 };
  let prev = g.cities.map((c) => c.faction), lastM = 0, sol = null;
  const aiCities = () => g.cities.filter((c) => c.faction !== G.NONE && g.factions[c.faction].ai);
  // Read only: nothing below writes g, so the digest (which hashes g) does not see these counters.
  const snap = () => { if (el() === lastM) return; lastM = el(); g.cities.forEach((c, i) => { if (c.faction !== prev[i] && prev[i] !== G.NONE && c.faction !== G.NONE) out.conq++; }); prev = g.cities.map((c) => c.faction);
    out.poor += aiCities().filter((c) => c.gold < 50).length; if (el() >= MONTHS) throw STOP; };
  // A defender beaten for want of rice (warcore.js fight: rice below the projected use). The attacker's turn touches no
  // defender's soldiers before the battle, so the soldiers taken at the start of that turn are the ones fought with.
  const starved = (w) => { if (!w.def.ids.length) return false; const s = w.def.ids.reduce((a, id) => a + sol[id], 0); return w.def.rice < Math.floor((Math.floor(s / 100) * (w.day * 4)) / 10); };
  const io = { event: async (e) => { if (e.type === 'autobattle') { out.aw++; out.march += e.war.att.ids.length; if (starved(e.war)) out.starved++; } }, chooseHeir: async (f) => G.autoHeir(g, f), allianceOffer: async () => false,
    war: async (war) => { out.pw++; out.pmarch += war.att.ids.length; const field = new F.Field(g, war, null); let n = 0; while (!field.over && n++ < 200) { for (const ev of field.aiActions(field.turn)) if (ev.res?.pending) ev.res.auto(); field.endTurn(); } const res = field.result(); if (res.loser === 'def') out.plost++; W.resolveWar(g, war, res); await G.checkFactions(g, io); },
    afterWar: async () => G.checkFactions(g, io), aiTurn: async (f) => { snap(); sol = g.officers.map((o) => o.soldiers); await A.aiTurn(g, f, io); },
    playerTurn: async () => { snap();
      for (const c of G.citiesOf(g, g.player)) {
        if (policy === 'expand' && g.books > 0 && c.officers.length >= 5) { const empty = G.roads(c.id).find((id) => g.cities[id].faction === G.NONE && !g.cities[id].officers.length); if (empty != null) { const r = G.moveOfficers(g, c.id, empty, c.officers.filter((id) => id !== g.factions[g.player].ruler).slice(-2)); if (r.ok) g.books--; } }
        if (c.gold >= 100 && G.troopsOf(g, c) + c.reserve < c.officers.length * 1000 && g.books > 0) { const r = G.conscript(g, c.id, Math.min(10, G.conscriptMax(c))); if (r.ok) g.books--; }
        for (const id of c.officers) while (c.reserve >= 100 && g.officers[id].soldiers < 1000) G.assignTroops(g, c.id, id, 100); }
      g.endTurn = true; } };
  try { await G.run(g, io); } catch (e) { if (e !== STOP) throw e; }
  out.dead = g.over ? 1 : 0; out.g = g;
  // Five-year end state of the AI factions: officers, troops (led + reserve), mean land + industry of their cities.
  const ai = aiCities(); out.off = ai.reduce((a, c) => a + c.officers.length, 0);
  out.troops = ai.reduce((a, c) => a + c.reserve + c.officers.reduce((b, id) => b + g.officers[id].soldiers, 0), 0);
  out.dev = ai.length ? ai.reduce((a, c) => a + c.land + c.industry, 0) / ai.length : 0;
  out.pop = ai.length ? ai.reduce((a, c) => a + c.pop, 0) / ai.length : 0; return out;
}
if (mode === 'digest') { const h = crypto.createHash('sha256');
  for (let L = 0; L < 3; L++) for (const p of [-1, 2, 4]) for (let s = 1; s <= N; s++) h.update(JSON.stringify((await run(L, s, p, false, 'idle')).g));
  console.log(h.digest('hex'));
} else for (const policy of ['defend', 'expand']) for (const wl of [false, true]) for (let L = 0; L < 3; L++) { const rs = [];
  for (let p = 0; p < 7; p++) for (let s = 1; s <= N; s++) rs.push(await run(L, s, p, wl, policy));
  const sum = (k) => rs.reduce((a, r) => a + r[k], 0), m = (k) => (sum(k) / rs.length).toFixed(2);
  console.log(`${policy} ${wl ? '好战' : '原版'} L${L + 1} 玩家5年被攻 ${m('pw')} 未被攻局 ${(100 * rs.filter((r) => !r.pw).length / rs.length).toFixed(0)}% 守败 ${m('plost')} 玩家灭亡 ${m('dead')} | 电脑间开战 ${m('aw')} 攻占 ${m('conq')} | 出兵将数 ${((sum('march') + sum('pmarch')) / Math.max(1, sum('aw') + sum('pw'))).toFixed(2)} | 电脑武将 ${m('off')} 兵力 ${Math.round(sum('troops') / rs.length)} 城开发 ${Math.round(sum('dev') / rs.length)} 人口 ${Math.round(sum('pop') / rs.length)} 缺金城月 ${m('poor')} 守城断粮 ${m('starved')}`); }
