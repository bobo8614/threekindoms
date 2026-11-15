// Record the 单挑 performances for review: each command and result played through the real duel view,
// one short video per case plus a contact sheet of stills. Presentation-only: the cases feed crafted
// Duel results to the view (the rules are exercised by the natural run, see --natural).
//   node hd2d-mvp/tools/duel_capture.mjs [out_dir] [--a 38 --d 37] [--size 1440x900] [--only attack-hit,feint] [--bare] [--url …]
//   … --natural    the 白兵 runs at 4× until the two generals meet on their own; the HUD's buttons fight the duel
//   … --campaign   new game as 曹操 → 出阵 → war map, the commander rides to the nearest enemy and attacks →
//                  白兵 → (a duel if the generals meet) → back to the war map
// --bare turns the duel's sparks, arcs, flashes, shake, dust and numbers off, to judge the motion alone.
// Needs the dev server (python3 hd2d-mvp/tools/serve.py) and Playwright (global @playwright/mcp works).
import { launchChrome } from './headless.mjs';
import { mkdirSync, renameSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execSync } from 'node:child_process';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'duel-capture');
const A = Number(arg('--a', 38)), D = Number(arg('--d', 37)), [W, H] = arg('--size', '1440x900').split('x').map(Number);
const URL = arg('--url', 'http://localhost:8642/hd2d-mvp/');
mkdirSync(out, { recursive: true });

const BARE = process.argv.includes('--bare');
const CASES = [
  ['attack-hit', [{ by: A, cmd: 'attack', hit: true, dmg: 18 }]],
  ['attack-miss', [{ by: D, cmd: 'attack', hit: false, dmg: 0 }]],
  ['feint', [{ by: A, cmd: 'feint', hit: true, dmg: 6 }]],
  ['desperate-hit', [{ by: D, cmd: 'desperate', hit: true, dmg: 42 }]],
  ['desperate-miss', [{ by: A, cmd: 'desperate', hit: false, dmg: 0, self: 22 }]],
  ['taunt', [{ by: A, cmd: 'taunt', hit: true, dmg: 0 }, { by: D, cmd: 'taunt', hit: false, dmg: 0 }]],
  ['persuade', [{ by: A, cmd: 'persuade', hit: false, dmg: 0, out: 1 }, { by: D, cmd: 'persuade', hit: true, dmg: 0, out: 2 }]],
  ['retreat-chased', [{ by: D, cmd: 'retreat', hit: true, dmg: 9 }]],
  ['retreat', [{ by: A, cmd: 'retreat', hit: false, dmg: 0 }]],
  ['death', [{ by: A, cmd: 'attack', hit: true, dmg: 30 }], D],
];

const browser = await launchChrome(URL);
const trim = {}; // video name → seconds into the recording where the action starts
async function session(name, fn) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: out, size: { width: W / 2, height: H / 2 } } });
  const t0 = Date.now(); const mark = () => { trim[name] = Math.max(0, (Date.now() - t0) / 1000 - 0.6); };
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error(name, 'pageerror', e.message));
  await page.goto(URL + (URL.includes('mute') ? '' : (URL.includes('?') ? '&' : '?') + 'mute')); await page.waitForFunction(() => window.__game?.debug);
  await fn(page, mark);
  const v = page.video(); await ctx.close(); renameSync(await v.path(), join(out, `${name}.webm`));
}
// The 白兵 opens paused until the player presses 开始交战 (or Space); press it when it shows. A field with no
// opening pause (a defended castle skips the formation pick) goes on without it.
async function startBattle(page) {
  const start = page.locator('.tq-start .tq-btn.primary:not(.arming)');
  if (await start.waitFor({ timeout: 5000 }).then(() => true, () => false)) await start.click();
}
// Enter a duel from a 白兵 (formation pick first). natural: no forced start — the field plays at 4×
// until the generals meet; resolves false if the 白兵 ends without a duel.
async function enterDuel(page, natural = false) {
  await page.evaluate(([a, d]) => { window.__run = window.__game.debug.quickTactical(a, d, 2); }, [A, D]);
  await page.waitForSelector('.tq-form'); await page.click('.tq-form'); await page.locator('.tq-deploy:not(.arming)').click();
  await page.waitForFunction(() => window.__tq && !document.querySelector('.tq-formation'));
  await page.waitForTimeout(1500);
  await startBattle(page);
  if (natural) {
    await page.locator('.tq-speed .tq-btn', { hasText: '4×' }).click();
    const got = await page.waitForFunction(() => document.querySelector('.tq-duel') || document.querySelector('.tq-result'), null, { timeout: 180000 });
    if (await page.$('.tq-result')) return false;
  } else await page.evaluate(() => window.__tq.startDuel('a'));
  await page.evaluate((bare) => window.__game.debug.duelView.setFx(!bare), BARE);
  await page.waitForSelector('.tq-duel-acts', { timeout: 60000 });
  await page.waitForTimeout(400);
  return true;
}
// Fight the duel with the HUD's own buttons (攻击, 牵制, 舍身 in turn) until it ends.
async function fightDuel(page) {
  for (let i = 0; i < 80 && await page.$('.tq-duel'); i++) {
    const b = await page.$$('.tq-duel-acts .dcmd:not([disabled])');
    if (b.length) { await b[i % 3].click().catch(() => {}); await page.waitForTimeout(200); } else await page.waitForTimeout(300);
  }
  await page.waitForFunction(() => !document.querySelector('.tq-duel'), null, { timeout: 90000 });
}
const fps = async (page) => page.evaluate(() => new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => { n++; performance.now() - t0 < 1000 ? requestAnimationFrame(f) : r(n); }; requestAnimationFrame(f); }));

if (process.argv.includes('--natural')) {
  // The generals meet on their own; the HUD's buttons fight; the rules settle each turn; the 白兵 resumes.
  let met = false;
  for (let attempt = 1; attempt <= 4 && !met; attempt++) await session('natural', async (page, mark) => {
    mark();
    if (!(met = await enterDuel(page, true))) { console.log('attempt', attempt, '白兵 ended without a duel'); return; }
    console.log('generals met on attempt', attempt);
    await fightDuel(page);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(out, 'natural-back-to-field.png') });
  });
} else if (process.argv.includes('--campaign')) {
  // Strategy map → 出阵 → war map → attack → 白兵 → duel (when the generals meet) → back to the war map.
  await session('campaign', async (page, mark) => {
    mark();
    // The title's intro overlay takes pointer clicks, so its button is pressed through the DOM.
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('新的征程')));
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('新的征程')).click()); await page.waitForTimeout(800);
    await page.locator('.ruler', { hasText: '曹操' }).click(); await page.locator('.ruler', { hasText: '曹操' }).click();
    await page.waitForFunction(() => document.body.dataset.screen === 'strategy');
    // The factions before 曹操 take their turns first, at the original's pace (src/pace.js): wait for his own.
    const close = setInterval(() => page.evaluate(() => document.querySelector('.panel.msg')?.click()).catch(() => {}), 250);
    try { await page.waitForFunction(() => { const g = window.__game.g; return g.current === g.player && !document.querySelector('.aiturn, .panel.msg'); }, null, { timeout: 120000 }); }
    finally { clearInterval(close); }
    await page.waitForTimeout(1500);
    // 出阵: the target is picked on the map's glowing cities (冀州 on a new game), then every officer, then the
    // supplies dialog; a command vignette may play on the way (Enter skips it).
    await page.keyboard.press('2'); await page.waitForTimeout(400);
    await page.locator('button', { hasText: '出阵' }).first().click(); await page.waitForTimeout(600);
    await page.locator('.mappick *').filter({ hasText: /^冀州/ }).last().click(); await page.waitForTimeout(800);
    await page.getByRole('button', { name: '全选' }).click(); await page.getByRole('button', { name: '确定' }).click(); await page.waitForTimeout(700);
    for (let i = 0; i < 20 && await page.evaluate(() => document.body.dataset.screen !== 'war'); i++) {
      const b = page.locator('.modal button.primary, .shade button.primary, .modal button:has-text("确定"), .modal button:has-text("出阵")').last();
      if (await b.count()) await b.click().catch(() => {}); else await page.keyboard.press('Enter');
      await page.waitForTimeout(1500);
    }
    await page.waitForFunction(() => document.body.dataset.screen === 'war', null, { timeout: 30000 });
    await page.waitForTimeout(3000);
    await page.evaluate(() => window.__game.war.finishDeploy());
    await page.screenshot({ path: join(out, 'campaign-1-war.png') });
    // Each day: ride the commander toward the nearest enemy; attack once adjacent (that opens the 白兵).
    let attacked = false;
    for (let day = 0; day < 30 && !attacked; day++) {
      // Our turn, unless an enemy strikes first on his: then his 白兵 (formation pick) is the one recorded.
      const now = await (await page.waitForFunction(() => { const w = window.__game.war; return document.querySelector('.tq-form') ? 'skirmish' : w && w.field.turn === w.field.human && !w.st.busy && 'ours'; }, null, { timeout: 120000 })).jsonValue();
      if (now === 'skirmish') { console.log('the enemy struck first on day', day); attacked = true; break; }
      attacked = await page.evaluate(async () => {
        const w = window.__game.war, f = w.field, me = f.side(f.human)[0], foes = f.alive.filter((u) => u.side !== f.human);
        const near = foes.sort((a, b) => f.dist(me, a) - f.dist(me, b))[0];
        const strike = () => { w.clickCell(me.x, me.y); w.clickCell(near.x, near.y); return true; }; // not awaited: it runs the whole 白兵
        if (f.adjacent(me, near)) return strike();
        await w.clickCell(me.x, me.y);
        let best = null; for (const k of w.st.reach?.dist.keys() || []) { const [x, y] = k.split(',').map(Number); if (f.unitAt(x, y)) continue; const d = Math.abs(x - near.x) + Math.abs(y - near.y); if (!best || d < best.d) best = { x, y, d }; }
        if (best) await w.clickCell(best.x, best.y);
        await new Promise((r) => setTimeout(r, 1200));
        if (f.adjacent(me, near) && f.pool[f.human] >= 2) return strike();
        w.endTurn(); return false;
      });
      await page.waitForTimeout(attacked ? 0 : 2500);
    }
    console.log('attacked', attacked);
    await page.waitForSelector('.tq-form', { timeout: 60000 }); await page.screenshot({ path: join(out, 'campaign-2-skirmish.png') });
    await page.click('.tq-form'); await page.locator('.tq-deploy:not(.arming)').click();
    await page.waitForTimeout(1500);
    await startBattle(page);
    await page.locator('.tq-speed .tq-btn', { hasText: '4×' }).click();
    // Fight every duel the 白兵 throws up (a general who retreated from one can meet his foe again).
    let duels = 0;
    for (let t0 = Date.now(); !(await page.$('.tq-result')) && Date.now() - t0 < 300000; ) {
      if (await page.$('.tq-duel-acts')) {
        duels++; console.log('duel', duels, 'in campaign');
        if (duels === 1) await page.screenshot({ path: join(out, 'campaign-3-duel.png') });
        await fightDuel(page);
        await page.waitForTimeout(1200); if (duels === 1) await page.screenshot({ path: join(out, 'campaign-4-after-duel.png') });
      } else await page.waitForTimeout(500);
    }
    if (!duels) console.log('白兵 ended without a duel');
    await page.waitForSelector('.tq-result', { timeout: 10000 });
    await page.locator('.tq-result .tq-btn').click();
    await page.waitForFunction(() => document.body.dataset.screen === 'war' && !document.querySelector('.tq'), null, { timeout: 30000 });
    await page.waitForTimeout(2000); await page.screenshot({ path: join(out, 'campaign-5-back-to-war.png') });
  });
} else {
  const only = arg('--only', '');
  for (const [name, acts, dead] of CASES.filter(([n]) => !only || only.split(',').includes(n))) {
    await session(BARE ? `${name}-bare` : name, async (page, mark) => {
      await enterDuel(page); mark();
      if (name === 'attack-hit') console.log('fps', await fps(page));
      const tag = BARE ? `${name}-bare` : name;
      await page.screenshot({ path: join(out, `${tag}-0.png`) });
      for (const [ai, a] of acts.entries()) {
        // Stills sampled back to back for as long as the action plays (each still takes ~60–100 ms).
        let done = false;
        const run = page.evaluate((x) => window.__game.debug.duelView.act(x, {}), a).then(() => { done = true; });
        for (let n = 0; !done && n < 60; n++) await page.screenshot({ path: join(out, `${tag}-${ai}-${String(n).padStart(2, '0')}.png`), clip: { x: 0, y: H * 0.18, width: W, height: H * 0.6 } });
        await run;
      }
      if (dead) await page.evaluate((id) => window.__game.debug.duelView.fall(id), dead);
      await page.waitForTimeout(500);
      await page.screenshot({ path: join(out, `${tag}-end.png`) });
    });
    console.log('recorded', name);
  }
}
await browser.close();
// From the action on, 720 px wide, small enough to keep beside the review notes. Each mp4 is checked
// with ffprobe (a video stream, frames, a duration) before its webm is removed; a failed conversion
// keeps the webm and fails the run, so an empty file is never taken for a finished recording.
let failed = 0;
const probe = (f) => { const [frames, dur] = execSync(`ffprobe -v error -select_streams v:0 -count_frames -show_entries stream=nb_read_frames:format=duration -of csv=p=0 "${f}"`).toString().trim().split(/\s+/).map(Number); return { frames: frames || 0, dur: dur || 0 }; };
for (const [name, ss] of Object.entries(trim)) {
  const src = `${join(out, name)}.webm`, dst = `${join(out, name)}.mp4`;
  try {
    execSync(`ffmpeg -loglevel error -y -ss ${ss.toFixed(2)} -i "${src}" -vf scale=720:-2 -c:v libx264 -crf 28 -pix_fmt yuv420p "${dst}"`);
    const { frames, dur } = probe(dst);
    if (!(frames > 0 && dur > 0)) throw new Error(`${dst}: ${frames} frames, ${dur} s`);
    rmSync(src); console.log('encoded', name, frames, 'frames', dur.toFixed(2), 's');
  } catch (e) { failed++; console.error('ffmpeg', name, e.message, '— kept', src); }
}
if (failed) { console.error(failed, 'recording(s) failed'); process.exit(1); }
