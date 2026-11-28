// Which sounds play, as the original's sound driver calls them (D42–D44, 2026-11-11). Traced on the unmodified ROM in a muted
// FCEUmm (docs/review-assets/2026-11-11/original-audio-trace, duel/ for the 单挑): a 单挑 action plays the same sounds whether it
// lands or misses — 牵制 98, 攻击 97 then 105, 舍身 97 then 104, every gallop 96 — and 骂倒, 说得, a pursuit's strike and the
// entry play none; a 白兵 volley plays 90 as it looses and 93 as the arrows land; no turn of the strategy or war map plays the
// war-start phrase (123, sfx-horn).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startGame, newCampaign, closeMessages, skipIntro } from './game.mjs';

let game, page;
before(async () => { game = await startGame(); page = await game.open(); await skipIntro(page); }); // the title's own arrow is not in the test
after(() => game?.close());

// Every audio.sfx call from here on, in order.
const spy = (p) => p.evaluate(() => { const a = window.__game.audio; window.__sounds = []; a.sfx = (k) => window.__sounds.push(k); });
const heard = (p) => p.evaluate(() => window.__sounds.splice(0));
const RIDE = 'sfx-duel-ride';
const HIT = 'HIT'; // where ctx.onHit lands among the sounds
const weapon = (list) => list.filter((k) => k !== RIDE);
const blows = (list) => weapon(list).filter((k) => k !== HIT);

test('a 单挑 plays the original sound of each action, the same on a hit and a miss', async () => {
  await spy(page);
  const r = await page.evaluate(async () => {
    const { debug, G } = window.__game, dv = debug.duelView, out = {};
    const { Tactical } = await import('./src/core/tactical.js');
    (await import('./src/pace.js')).setPace(4);
    const g = G.newGame(4, 1, 3), battle = new Tactical(g, 38, 51, 2, G.rng(g), { human: 'a' });
    dv.setPlace({ month: 2, city: 12, siege: null }); debug.show('dview');
    const take = () => window.__sounds.splice(0);
    await dv.enter(battle, { a: 'attacker', d: 'defender' }); out.enter = take();
    const A = battle.side.a.id, ctx = { hp: { [A]: 50, [battle.side.d.id]: 50 }, onHit: () => window.__sounds.push('HIT') };
    const run = async (name, a) => { await dv.act({ by: A, ...a }, ctx); out[name] = take(); };
    await run('feintHit', { cmd: 'feint', hit: true, dmg: 4 });
    await run('feintMiss', { cmd: 'feint', hit: false, dmg: 0 });
    await run('attackHit', { cmd: 'attack', hit: true, dmg: 20 });
    await run('attackMiss', { cmd: 'attack', hit: false, dmg: 0 });
    await run('desperateHit', { cmd: 'desperate', hit: true, dmg: 40 });
    await run('desperateMiss', { cmd: 'desperate', hit: false, dmg: 0, self: 15 });
    await run('taunt', { cmd: 'taunt', hit: true });
    await run('tauntMiss', { cmd: 'taunt', hit: false });
    await run('persuade', { cmd: 'persuade', out: 1 });
    await run('chased', { cmd: 'retreat', hit: true, dmg: 6 });
    (await import('./src/pace.js')).setPace(1);
    return out;
  });
  assert.deepEqual(r.enter, [], `the riders come in under the duel theme alone: ${r.enter}`);
  // The original's rhythms (docs/单挑动作全面优化_交接_2026-11-21.md): 牵制 three clashes (98×3), 攻击 three overhead
  // spins and the cleave (97×3, 105), 舍身 the leap and the blow (97, 104). The blow lands on the last sound alone: the
  // clashes and spins before it take no hp.
  assert.deepEqual(weapon(r.feintHit), ['sfx-chime', 'sfx-chime', 'sfx-chime', HIT], `牵制: ${r.feintHit}`);
  assert.deepEqual(weapon(r.attackHit), ['sfx-duel-swing', 'sfx-duel-swing', 'sfx-duel-swing', 'sfx-duel-blow', HIT], `攻击: ${r.attackHit}`);
  assert.deepEqual(weapon(r.desperateHit), ['sfx-duel-swing', 'sfx-duel-desperate', HIT], `舍身: ${r.desperateHit}`);
  for (const k of ['feint', 'attack', 'desperate']) {
    assert.ok(!r[`${k}Miss`].includes(HIT), `${k}: a miss takes no hp: ${r[`${k}Miss`]}`);
    assert.deepEqual(blows(r[`${k}Miss`]), blows(r[`${k}Hit`]), `${k} sounds the same when it misses`);
    assert.equal(r[`${k}Hit`][0], RIDE, `${k} starts with the horse driving in: ${r[`${k}Hit`]}`);
    assert.ok(r[`${k}Hit`].filter((x) => x === RIDE).length >= 2, `${k}: in and back again: ${r[`${k}Hit`]}`);
  }
  for (const k of ['taunt', 'tauntMiss', 'persuade']) assert.deepEqual(r[k], [], `${k} is silent: ${r[k]}`);
  assert.ok(r.chased.length && r.chased.every((x) => x === RIDE || x === HIT), `a pursuit is gallops only, no blow: ${r.chased}`);
});

test('a 白兵 volley sounds as it looses and again as the arrows land', async () => {
  await spy(page);
  const r = await page.evaluate(async () => {
    const { tview, G, debug } = window.__game;
    const { Tactical } = await import('./src/core/tactical.js');
    const g = G.newGame(4, 1, 3); g.officers[38].soldiers = g.officers[51].soldiers = 900; const b = new Tactical(g, 38, 51, 2, G.rng(g), { human: 'a' }); b.deploy();
    tview.setPlace({ month: 2, city: 12 }); await tview.ready(); debug.show('tview');
    tview.build(b, { a: 'attacker', d: 'defender' });
    await new Promise((f) => setTimeout(f, 300));
    const u = b.units.find((x) => x.kind === 'arc'), t = b.units.find((x) => x.side !== u?.side && x.kind !== 'gen');
    if (!u || !t) return { kinds: b.units.map((x) => x.side + x.kind) };
    const sounds = [], marks = [];
    await tview.play({ type: 'attack', u, t, dmg: 12, ranged: true, fire: false, kill: false }, { sfx: (k) => { sounds.push(k); marks.push(performance.now()); }, update() {} });
    return { sounds, gap: marks[1] - marks[0] };
  });
  assert.ok(r.sounds, `no archers to shoot: ${r.kinds}`);
  assert.deepEqual(r.sounds, ['sfx-select', 'sfx-volley-land']);
  assert.ok(r.gap > 100, `the landing follows the flight (${Math.round(r.gap)} ms)`);
});

// devblog #786 #787 (黑色风车): every 白兵 tactic played the war-start phrase as it was cast, which is the original's 升级 phrase (123×4),
// a failure 取消 after it and 爆炎 a burst. The original plays nothing of its own from the cast to the outcome (all six traced on the
// ROM, 咒缚 and 挑发 failing too: docs/白兵音效与开始交战提示框交接_2026-11-26_devblog786-787.md); the 白兵 theme plays on.
test('a 白兵 tactic is cast, lands or fails without a sound of its own', async () => {
  const p = await game.open();
  await p.evaluate(() => { window.__game.debug.quickTactical(153, 191, 2, { human: 'a' }); });
  await p.waitForSelector('.tq-form', { timeout: 60000 });
  await p.locator('.tq-form').first().click(); await p.locator('.tq-deploy:not(.arming)').click();
  await p.waitForSelector('.tq-start button:not(.arming)', { timeout: 30000 });
  await spy(p);
  const out = {};
  // cast before the fight starts (a cast does not start it), one at a time: each run anew, 咒缚 made to fail
  for (const [name, fail] of [['咒缚', true], ['强弩', false], ['爆炎', false]]) {
    await p.evaluate(([fail]) => { const b = window.__tq, S = b.side.a; S.tp = 40; S.fx = {}; S.usedThisRound = false; window.__r = b.r; if (fail) b.r = () => 0; }, [fail]);
    await p.locator('.tq-speed .tq-btn', { hasText: '1×' }).click(); // the console drawn anew with the points given
    await heard(p);
    const n = await p.locator('.tq-feed p', { hasText: `施展 ${name}` }).count();
    await p.locator('.tq-tac:not([disabled])', { hasText: name }).click();
    await p.waitForFunction(([name, n]) => [...document.querySelectorAll('.tq-feed p')].filter((e) => e.textContent.includes(`施展 ${name}`)).length > n, [name, n], { timeout: 30000 });
    await p.waitForSelector('.banner', { state: 'detached', timeout: 10000 }).catch(() => {});
    out[name] = { said: await p.locator('.tq-feed p').first().textContent(), heard: await heard(p) };
    await p.evaluate(() => { window.__tq.r = window.__r; });
  }
  assert.match(out['咒缚'].said, /失败/);
  assert.match(out['爆炎'].said, /成功/, `爆炎 lands on the field: ${out['爆炎'].said}`);
  for (const [k, v] of Object.entries(out)) assert.deepEqual(v.heard, [], `${k}: ${v.heard}`);
  assert.equal(await p.evaluate(() => window.__tq.over || !!document.querySelector('.tq-start')), true, 'the fight is still to start');
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

// The 白兵 pursuit at the edge (bank14 $A407–$A4F6) plays nothing of its own, a hit or an escape: traced on the ROM from the natural
// retreat chain, 13 and 5 points and an escape (docs/review-assets/2026-11-26/pursuit-audio). The remake had played the 升级 phrase
// (sfx-horn) and an attack sound (sfx-clash) on a hit.
for (const hit of [true, false]) test(`a 白兵 general pursued at his edge ${hit ? 'and hit' : 'who gets away'} hears nothing of it`, async () => {
  const p = await game.open();
  await p.evaluate(() => { window.__game.debug.quickTactical(153, 191, 2, { human: 'a' }); });
  await p.waitForSelector('.tq-form', { timeout: 60000 });
  await p.locator('.tq-form').first().click(); await p.locator('.tq-deploy:not(.arming)').click();
  await p.waitForSelector('.tq-start button:not(.arming)', { timeout: 30000 });
  // our general on our edge, ordered back, the first to act: his step leaves the field, and the pursuit draws U(100) (≥ 32:
  // pursued) and U(10); the battle's own loop plays it
  await p.evaluate((hit) => {
    const b = window.__tq, gu = b.gen('a'), r = b.r;
    gu.x = 0; b.side.a.cmd.gen = 'retreat'; b.queue = [gu];
    b.r = (n) => (n === 100 ? (hit ? 99 : 0) : n === 10 ? 4 : r(n));
  }, hit);
  await spy(p);
  await p.locator('.tq-start button:not(.arming)').click();
  await p.waitForSelector('.tq-result', { timeout: 30000 });
  const [pursuit, hp] = await p.evaluate(() => [window.__tq.side.a.pursuit, window.__tq.side.a.hp]);
  assert.deepEqual(pursuit, hit ? { hit: true, dmg: 9, rolled: 9, from: hp + 9 } : { hit: false, dmg: 0 });
  assert.match(await p.locator('.tq-feed').textContent(), hit ? /遭到追击，体力 −9/ : /成功脱身/, 'the pursuit was played');
  assert.deepEqual(await heard(p), []);
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

test('the player\'s month and war day begin without the war-start phrase', async () => {
  const p = await game.open();
  await spy(p);
  await p.evaluate(async () => { (await import('./src/pace.js')).setPace(4); (await import('./src/vignette.js')).setVignettes(false); });
  await newCampaign(p);
  await p.waitForSelector('.banner', { state: 'detached', timeout: 10000 }).catch(() => {});
  assert.ok(!(await heard(p)).includes('sfx-horn'), 'the month banner is silent');
  await p.evaluate(() => {
    const { g, G, debug } = window.__game, home = g.factions[g.player].city;
    const to = G.roads(home).map((c) => g.cities[c]).filter((c) => c.faction !== g.player && c.faction !== G.NONE && c.officers.length)[0];
    for (const id of [...g.cities[home].officers, ...to.officers]) g.officers[id].soldiers ||= 500;
    const ids = g.cities[home].officers.slice(0, 2);
    debug.fieldWar(debug.setupWar(g, { from: home, to: to.id, ids, commander: ids[0], gold: 100, rice: 400 }), 'att');
  });
  await p.waitForFunction(() => window.__game.war?.finishDeploy && document.body.dataset.screen === 'war', null, { timeout: 30000 });
  const stop = closeMessages(p);
  try {
    await p.waitForTimeout(1500);
    await heard(p);
    await p.evaluate(() => window.__game.war.finishDeploy());
    await p.waitForFunction(() => { const f = window.__game.war.field; return f.turn === f.human && f.day === 1; }, null, { timeout: 30000 });
    await p.waitForTimeout(500);
    assert.ok(!(await heard(p)).includes('sfx-horn'), 'day 1 begins without it');
    await p.evaluate(() => { const f = window.__game.war.field; window.__day = f.day; window.__game.war.endTurn(); });
    await p.waitForFunction(() => { const f = window.__game.war.field; return f.turn === f.human && f.day > window.__day; }, null, { timeout: 60000 });
    await p.waitForTimeout(500);
    assert.ok(!(await heard(p)).includes('sfx-horn'), 'nor does day 2');
  } finally { stop(); }
  assert.deepEqual(p.errors, []);
});

test('a 单挑 that ends in a death plays the result phrase whoever fell; a retreat plays nothing', async () => {
  const r = await page.evaluate(async () => {
    const { duelEndSound } = await import('./src/tacticalhud.js');
    return { mineDied: duelEndSound({ dead: 1, winner: 2 }, false), foeDied: duelEndSound({ dead: 2, winner: 1 }, true), captured: duelEndSound({ captured: 1, winner: 2 }, false),
      fled: duelEndSound({ retreated: 1, winner: 2 }, false), foeFled: duelEndSound({ retreated: 2, winner: 1 }, true) };
  });
  assert.deepEqual(r, { mineDied: 'sfx-victory', foeDied: 'sfx-victory', captured: 'sfx-victory', fled: null, foeFled: null });
});

test('every sound with only an original file has a stand-in when the file is missing', async () => {
  const r = await page.evaluate(async () => {
    const { Audio } = await import('./src/audio.js'), m = await (await fetch('assets/manifest.json')).json(), a = new Audio({}, {});
    a.ctx = new AudioContext(); a.sfxGain = a.ctx.createGain();
    const out = {};
    for (const [k, list] of Object.entries(m.audio)) {
      if (!k.startsWith('sfx-') || ![].concat(list).every((f) => f.startsWith('assets/audio/original/'))) continue;
      let n = 0; for (const f of ['tone', 'noise', 'sweep']) a[f] = () => n++;
      a.sfx(k); out[k] = n;
    }
    return out;
  });
  assert.deepEqual(Object.keys(r).sort(), ['sfx-chime', 'sfx-duel-blow', 'sfx-duel-desperate', 'sfx-duel-ride', 'sfx-duel-swing', 'sfx-volley-land']);
  for (const [k, n] of Object.entries(r)) assert.ok(n > 0, `${k} has no stand-in`);
});

// The original plays 98×3 (the chime of the Namcot logo, 牵制's clash) the frame the ruler-select 秘技's twelfth key goes in
// (bank9 $DB30, traced: original-audio-trace/cheat.json); the remake had played the victory phrase.
test('the ruler-select 秘技 rings the original chime', async () => {
  const p = await game.open(); await spy(p);
  await skipIntro(p);
  await p.getByText('新的征程').click();
  await p.waitForSelector('.level'); await heard(p);
  for (let k = 0; k < 3; k++) for (const d of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) await p.keyboard.press(d);
  assert.deepEqual(await heard(p), ['sfx-chime']);
  assert.deepEqual(p.errors, []);
});

test('no page errors', () => assert.deepEqual(page.errors, []));
