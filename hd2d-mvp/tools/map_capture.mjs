// Capture the strategy map and the war map for before/after review of the depth, grain and movement work.
//   node hd2d-mvp/tools/map_capture.mjs [out_dir] [--size 1440x900] [--url …] [--no-video]
// Stills: strategy-near / -mid / -far (camera reset, then zoomed in or out), strategy-narrow (800×600),
// war-close (zoomed onto the commander). Video: war-move — a long multi-cell move with turns, an undo,
// then a full AI day — as war-move.mp4 (720 px wide).
// Needs the dev server (python3 hd2d-mvp/tools/serve.py) and Playwright (global @playwright/mcp works).
import { launchChrome } from './headless.mjs';
import { mkdirSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execSync } from 'node:child_process';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'map-capture');
const [W, H] = arg('--size', '1440x900').split('x').map(Number);
const URL = arg('--url', 'http://localhost:8642/hd2d-mvp/');
mkdirSync(out, { recursive: true });

const browser = await launchChrome(URL);
const fps = (page) => page.evaluate(() => new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => { n++; performance.now() - t0 < 2000 ? requestAnimationFrame(f) : r(n / 2); }; requestAnimationFrame(f); }));

async function newGame(page) {
  await page.goto(URL + (URL.includes('mute') ? '' : (URL.includes('?') ? '&' : '?') + 'mute')); await page.waitForFunction(() => window.__game?.debug);
  await page.getByText('新的征程').click(); await page.waitForTimeout(800);
  await page.locator('.ruler', { hasText: '曹操' }).click(); await page.locator('.ruler', { hasText: '曹操' }).click();
  await page.waitForFunction(() => document.body.dataset.screen === 'strategy'); await page.waitForTimeout(2500);
  for (let i = 0; i < 4; i++) { await page.mouse.click(page.viewportSize().width / 2, page.viewportSize().height - 120); await page.waitForTimeout(600); }
}
const errors = [];
async function context(w, h, video) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, ...(video ? { recordVideo: { dir: out, size: { width: w / 2, height: h / 2 } } } : {}) });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.stack || e.message));
  page.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && errors.push(m.text())); // optional assets probe with HEAD
  return { ctx, page };
}

// --- Strategy stills ---
{
  const { ctx, page } = await context(W, H);
  await newGame(page);
  const shot = async (nm, zoom) => {
    await page.evaluate((z) => { const s = window.__game.strategy; s.resetView(); s.focusCity(window.__game.g.factions[window.__game.g.player].city); if (z) s.zoom(z); }, zoom);
    await page.waitForTimeout(1500); await page.screenshot({ path: join(out, `strategy-${nm}.png`) });
  };
  await shot('mid', 0); await shot('near', -600); await shot('far', 900);
  await shot('mid', 0);
  console.log('strategy fps', await fps(page));
  await page.setViewportSize({ width: 800, height: 600 }); await page.waitForTimeout(1200);
  await page.screenshot({ path: join(out, 'strategy-narrow.png') });
  await ctx.close();
}

// --- War map: close-up still and the movement video ---
{
  const video = !process.argv.includes('--no-video');
  const { ctx, page } = await context(W, H, video);
  await newGame(page);
  // 出阵 as in duel_capture.mjs: the target is picked on the map's glowing cities (冀州 on a new game), then
  // every officer, then the supplies dialog; a command vignette may play on the way (Enter skips it).
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
  await page.waitForFunction(() => { const w = window.__game.war; return w && w.field.turn === w.field.human && !w.st.busy; }, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__game.war.zoom(-500)); await page.waitForTimeout(1500);
  await page.screenshot({ path: join(out, 'war-close.png') });
  console.log('war fps', await fps(page));
  // Frame the move: default view pulled in a little, centred on the commander (pan by the camera's own controls).
  await page.evaluate(() => {
    const w = window.__game.war, f = w.field, me = f.side(f.human)[0];
    w.clickCell(me.x, me.y); w.resetView(); w.zoom(-280);
    w.pan((me.x - 15.5) * 0.4, (me.y - 9) * 0.4); // resetView only leans 60% toward the unit
  });
  await page.waitForTimeout(1500);
  const t0 = Date.now();
  // The farthest reachable cell whose route turns at least once, then undo, then a long move and the AI's day.
  const moved = await page.evaluate(async () => {
    const w = window.__game.war, f = w.field, me = f.side(f.human)[0];
    await w.clickCell(me.x, me.y);
    let best = null;
    for (const k of w.st.reach?.dist.keys() || []) {
      const [x, y] = k.split(',').map(Number); if (f.unitAt(x, y)) continue;
      const p = f.path(w.st.reach, x, y), turns = p.filter((c, i) => i > 1 && (c[0] - p[i - 1][0]) !== (p[i - 1][0] - p[i - 2][0])).length;
      const score = p.length + (turns ? 3 : 0); if (!best || score > best.score) best = { x, y, score, n: p.length, turns };
    }
    if (!best) return null;
    await w.clickCell(best.x, best.y); await new Promise((r) => setTimeout(r, 600));
    w.undo(); await new Promise((r) => setTimeout(r, 1200));
    await w.clickCell(best.x, best.y); await new Promise((r) => setTimeout(r, 800));
    w.endTurn(); return best;
  });
  console.log('move', JSON.stringify(moved));
  await page.waitForFunction(() => { const w = window.__game.war; return w.field.turn === w.field.human && !w.st.busy; }, null, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(800);
  const v = video && page.video(); await ctx.close();
  if (v) {
    const src = join(out, 'war-move.webm'), dst = join(out, 'war-move.mp4');
    renameSync(await v.path(), src);
    execSync(`ffmpeg -loglevel error -y -sseof -${Math.ceil((Date.now() - t0) / 1000) + 1} -i "${src}" -vf scale=720:-2 -c:v libx264 -crf 26 -pix_fmt yuv420p "${dst}"`);
  }
}
console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no page errors');
await browser.close();
