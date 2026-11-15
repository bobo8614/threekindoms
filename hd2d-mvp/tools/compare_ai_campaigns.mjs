// Reproducible before/after campaign experiment, without rendering, audio or player saves.
// node hd2d-mvp/tools/compare_ai_campaigns.mjs --before /path/to/before/core --after /path/to/after/core --out /path/results.json
// Optional: --seeds 32 --player-seeds 12 --months 120. Before/after are frozen module graphs,
// so both use the same game/field rules and differ only in the intended AI/tactical changes.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const args = process.argv.slice(2), arg = (name, fallback) => { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args[i + 1]; };
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const outPath = arg('out');
if (!arg('before') || !arg('after') || !outPath) throw Error('--before, --after and --out are required');
const seeds = Number(arg('seeds', 32)), playerSeeds = Number(arg('player-seeds', 12)), months = Number(arg('months', 120));
assert.ok([seeds, playerSeeds, months].every((x) => Number.isInteger(x) && x > 0));
const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/game-data.json')));
const variants = {};
for (const name of ['before', 'after']) {
  const dir = path.resolve(arg(name));
  variants[name] = {
    G: await import(pathToFileURL(path.join(dir, 'game.js'))),
    A: await import(pathToFileURL(path.join(dir, 'ai.js'))),
    W: await import(pathToFileURL(path.join(dir, 'warcore.js'))),
    F: await import(pathToFileURL(path.join(dir, 'field.js'))),
    T: await import(pathToFileURL(path.join(dir, 'tactical.js'))),
  };
}
const STOP = Symbol('completed requested months');

async function campaign(engine, level, seed, policy) {
  const { G, A, W, F } = engine;
  G.setData(structuredClone(D));
  // -1 is a spectator identity; actual faction scheduling/deaths/income still run through G.run.
  const g = G.newGame(policy === 'spectator' ? -1 : 4, level, seed);
  let active = null, aiTurns = 0, studies = 0, knowledgeGain = 0, wars = 0, playerWars = 0, playerLosses = 0, fireUses = 0;
  const trained = new Set(), annual = [], events = {}, firstAttack = { month: null }, actionCounts = {};
  // Observe real successful fire decisions; preserve the return value and every side effect.
  const tactic = engine.T.Tactical.prototype.tactic;
  engine.T.Tactical.prototype.tactic = function (side, id) {
    const res = tactic.call(this, side, id); if (id === 'fire' && res.ok) fireUses++; return res;
  };
  for (const o of g.officers) {
    let value = o.int;
    Object.defineProperty(o, 'int', { enumerable: true, get: () => value, set: (v) => {
      if (active === 'ai' && v > value) { studies++; knowledgeGain += v - value; trained.add(o.id); }
      value = v;
    } });
  }
  const elapsed = () => (g.year - 189) * 12 + g.month;
  function snapshot() {
    const mine = G.citiesOf(g, g.player), aiCities = g.cities.filter((c) => c.faction !== G.NONE && c.faction !== g.player);
    const ids = aiCities.flatMap((c) => c.officers), officers = ids.map((id) => g.officers[id]);
    return {
      month: elapsed() + 1, studies, knowledgeGain, aiTurns, wars, playerWars, playerLosses, fireUses,
      trainedEver: trained.size, trainedStillServingAI: ids.filter((id) => trained.has(id)).length,
      aiCities: aiCities.length, aiOfficers: ids.length, aiIntMean: officers.length ? officers.reduce((s, o) => s + o.int, 0) / officers.length : 0,
      aiInt80: officers.filter((o) => o.int >= 80).length, aiInt85: officers.filter((o) => o.int >= 85).length,
      aiTroops: officers.reduce((s, o) => s + o.soldiers, 0), aiFullTroopOfficers: officers.filter((o) => o.soldiers === 1000).length,
      aiMeanLevel: officers.length ? officers.reduce((s, o) => s + o.level, 0) / officers.length : 0,
      aiEquipmentPower: officers.reduce((s, o) => s + D.equipment[o.weapon].atk + D.equipment[24 + o.armor].dfn, 0),
      aiGold: aiCities.reduce((s, c) => s + c.gold, 0), playerCities: mine.length,
      playerTroops: mine.reduce((s, c) => s + G.troopsOf(g, c), 0), livingFactions: g.factions.filter((f) => f.ruler != null).length,
    };
  }
  function finishTurn() {
    const order = D.rules.turn_orders[g.order];
    if (order.slice(g.turnIdx + 1).some((f) => G.alive(g, f))) return;
    if ((elapsed() + 1) % 12 === 0) annual.push(snapshot());
    if (elapsed() + 1 >= months) throw STOP;
  }
  async function fieldWar(war) {
    wars++; playerWars++;
    if (firstAttack.month == null) firstAttack.month = elapsed() + 1;
    // A fixed tactical policy: both armies use the same shipped Field/Tactical AI. The strategic
    // player policy below is held constant. This is a pressure proxy, not a skilled human playtest.
    const field = new F.Field(g, war, null);
    while (!field.over) {
      for (const ev of field.aiActions(field.turn)) { /* consume each actual field action */ }
      field.endTurn();
    }
    const res = field.result();
    if ((res.loser === 'att' ? war.attacker : war.defender) === g.player) playerLosses++;
    W.resolveWar(g, war, res);
    await G.checkFactions(g, io);
  }
  // Stable development/defence policy: no attacks on occupied enemy cities. Spend real command
  // books on healing, neutral expansion, learning, loyalty, reserves, search, grain sale or industry.
  function playerAction() {
    const cities = G.citiesOf(g, g.player);
    for (const c of cities) for (const id of c.officers) while (c.reserve >= 100 && g.officers[id].soldiers < 1000) G.assignTroops(g, c.id, id, 100);
    for (const c of cities) {
      const ids = [...c.officers].sort((a, b) => g.officers[b].war - g.officers[a].war || a - b);
      const hurt = ids.find((id) => g.officers[id].hp <= D.officers[id].hp - 35);
      if (hurt != null && D.cities[c.id].facilities.hospital && c.gold >= 50) return ['heal', G.heal(g, c.id, hurt)];
      const empty = G.roads(c.id).find((id) => g.cities[id].faction === G.NONE && !g.cities[id].officers.length);
      if (empty != null && ids.length >= 5) return ['expand', G.moveOfficers(g, c.id, empty, ids.filter((id) => id !== g.factions[g.player].ruler).slice(-2))];
      const student = ids.find((id) => g.officers[id].war >= 80 && g.officers[id].int < 80);
      if (student != null && D.cities[c.id].facilities.school && c.gold >= 30) return ['study', G.study(g, c.id, student)];
      const disloyal = ids.find((id) => g.officers[id].loyalty < 70);
      if (disloyal != null && c.gold >= 50) return ['reward', G.reward(g, c.id, disloyal, 50)];
      if (c.gold >= 100 && G.troopsOf(g, c) + c.reserve < ids.length * 1000) return ['conscript', G.conscript(g, c.id, Math.min(10, G.conscriptMax(c)))];
      if (D.cities[c.id].facilities.market && c.gold < 100 && c.rice > 1500) return ['sellRice', G.sellRice(g, c.id, 500)];
      if (ids.length < 6) {
        const executor = [...ids].sort((a, b) => g.officers[b].int - g.officers[a].int || a - b)[0];
        const res = G.search(g, c.id, executor);
        if (res.offer != null && c.gold >= res.price) G.hire(g, c.id, res.offer, res.price);
        return ['search', res];
      }
      if (c.gold >= 50 && c.industry < 999) return ['industry', G.develop(g, c.id, ids[0], 'industry', G.devCost(g, ids[0]))];
    }
    return null;
  }
  const io = {
    event: async (e) => { events[e.type] = (events[e.type] || 0) + 1; if (e.type === 'autobattle') wars++; },
    chooseHeir: async (f) => G.autoHeir(g, f),
    allianceOffer: async () => false,
    war: fieldWar,
    afterWar: async () => G.checkFactions(g, io),
    aiTurn: async (f) => { active = 'ai'; aiTurns++; await A.aiTurn(g, f, io); active = null; finishTurn(); },
    playerTurn: async () => {
      active = 'player';
      while (g.books > 0 && !g.over) {
        const next = playerAction(); if (!next || !next[1].ok) break;
        const [kind, res] = next; actionCounts[kind] = (actionCounts[kind] || 0) + 1;
        if (!res.noBook) g.books--;
      }
      g.endTurn = true; active = null; finishTurn();
    },
  };
  try { await G.run(g, io); } catch (e) { if (e !== STOP) throw e; }
  finally { engine.T.Tactical.prototype.tactic = tactic; }
  const result = snapshot();
  const unique = g.cities.flatMap((c) => c.officers);
  assert.equal(unique.length, new Set(unique).size, 'an officer cannot occupy two cities');
  assert.ok(g.cities.every((c) => c.officers.length <= 10), 'roster capacity');
  assert.ok(g.officers.every((o) => Number.isFinite(o.int) && Number.isFinite(o.soldiers)), 'finite campaign state');
  return { level: level + 1, seed, policy, ...result, firstPlayerAttackMonth: firstAttack.month, over: g.over, annual, events, actionCounts };
}

const results = { months, seeds, playerSeeds, scope: 'Actual G.run scheduling/income/disasters/search/deaths/succession. Spectator and fixed development/defence policy; AI-vs-AI wars use original simplified autoBattle, player wars use shipped Field/Tactical AI for both armies. No PPU/NES full-campaign comparison, graphics, audio, saved games or human difficulty claims.', pairs: [], summaries: [] };
for (const policy of ['spectator', 'defence']) for (let level = 0; level < 3; level++) {
  const count = policy === 'spectator' ? seeds : playerSeeds;
  for (let seed = 0; seed < count; seed++) {
    const pair = { policy, level: level + 1, seed };
    for (const [name, engine] of Object.entries(variants)) pair[name] = await campaign(engine, level, seed, policy);
    results.pairs.push(pair);
  }
  const group = results.pairs.filter((p) => p.policy === policy && p.level === level + 1), row = { policy, level: level + 1, pairs: group.length };
  for (const name of ['before', 'after']) {
    const xs = group.map((p) => p[name]), mean = (k) => xs.reduce((s, x) => s + x[k], 0) / xs.length;
    row[name] = Object.fromEntries(['month', 'studies', 'knowledgeGain', 'trainedEver', 'trainedStillServingAI', 'aiIntMean', 'aiInt80', 'aiInt85', 'aiTroops', 'aiFullTroopOfficers', 'aiMeanLevel', 'aiEquipmentPower', 'aiGold', 'wars', 'playerWars', 'playerLosses', 'playerCities', 'fireUses'].map((k) => [k, mean(k)]));
    row[name].survivedToLimit = xs.filter((x) => x.month >= months && !x.over).length;
    row[name].unattacked = xs.filter((x) => x.firstPlayerAttackMonth == null).length;
  }
  results.summaries.push(row);
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(row));
}
