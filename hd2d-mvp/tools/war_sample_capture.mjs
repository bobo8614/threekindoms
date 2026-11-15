// Stills of the 冀州 war map for the art sample's before/after: the whole-board overview, a close-up on the
// commander, and a low three-quarter angle turned 90°.
//   node hd2d-mvp/tools/war_sample_capture.mjs [out_dir] [--size 1600x900] [--url …] [--plain]
// --plain also saves each view with the HD-2D post stack off (H key), to tell lighting from materials.
// --eval "<js>" runs in the page once the war is up (e.g. to try post settings via window.__game.debug.post).
// --views board,close picks which stills to take (yaw0..yaw3: the overview at each angle; tactical: Tab's view from straight above). castle / village / unit / unitlow are 800×450 crops around that cell
// (sharpest with --dpr 2); --hide-units hides the unit sprites so the set pieces can be judged.
// Needs the dev server (python3 hd2d-mvp/tools/serve.py) and Playwright, like map_capture.mjs.
import { launchChrome } from './headless.mjs';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'war-sample');
const [W, H] = arg('--size', '1600x900').split('x').map(Number);
const URL = arg('--url', 'http://localhost:8642/hd2d-mvp/');
mkdirSync(out, { recursive: true });

const browser = await launchChrome(URL);
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: Number(arg('--dpr', 1)) });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack || e.message));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && errors.push(m.text()));

// Same route into the war as map_capture.mjs: 曹操 marches on the first neighbour offered (冀州 on a new game).
await page.goto(URL); await page.waitForFunction(() => window.__game?.debug);
await page.getByText('新的征程').click(); await page.waitForTimeout(800);
await page.locator('.ruler', { hasText: '曹操' }).click(); await page.locator('.ruler', { hasText: '曹操' }).click();
await page.waitForFunction(() => document.body.dataset.screen === 'strategy'); await page.waitForTimeout(2500);
for (let i = 0; i < 4; i++) { await page.mouse.click(W / 2, H - 120); await page.waitForTimeout(600); }
await page.keyboard.press('2'); await page.waitForTimeout(400);
await page.locator('button', { hasText: '出阵' }).first().click(); await page.waitForTimeout(600);
// The target is picked on the map's glowing cities; every officer goes, then the supplies dialog (a command
// vignette may play on the way, Enter skips it).
await page.locator('.mappick *').filter({ hasText: /^冀州/ }).last().click(); await page.waitForTimeout(800);
await page.getByRole('button', { name: '全选' }).click(); await page.getByRole('button', { name: '确定' }).click(); await page.waitForTimeout(700);
for (let i = 0; i < 20 && await page.evaluate(() => document.body.dataset.screen !== 'war'); i++) {
  const b = page.locator('.modal button.primary, .shade button.primary, .modal button:has-text("确定"), .modal button:has-text("出阵")').last();
  if (await b.count()) await b.click().catch(() => {}); else await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);
}
await page.waitForFunction(() => document.body.dataset.screen === 'war', null, { timeout: 30000 });
await page.waitForTimeout(3000);
await page.evaluate(() => window.__game.war.finishDeploy()).catch((e) => { console.log(errors.join('\n')); throw e; });
await page.waitForFunction(() => { const w = window.__game.war; return w && w.field.turn === w.field.human && !w.st.busy; }, null, { timeout: 60000 });
await page.waitForTimeout(1200);

const VIEWS = {
  board: (w) => { w.overview(); },
  close: (w) => { const me = w.field.side(w.field.human)[0]; w.clickCell(me.x, me.y); w.resetView(); w.zoom(-500); },
  low: (w) => { w.resetView(); w.rotate(1); w.zoom(-350); w.orbit(0, -110); },
  // Close-ups of the castle and the first village (the camera target is centred on the cell; yaw is 0).
  castle: (w) => { const [x, y] = w.field.castle(); w.st.sel = null; w.resetView(); w.orbit(0, -60); w.frame(x, y, 9); },
  // Close-ups of the player's commander: from the default pitch, and turned 45° from a low angle.
  unit: (w) => { const me = w.field.side(w.field.human)[0]; w.clickCell(me.x, me.y); w.resetView(); w.frame(me.x, me.y, 8); },
  unitlow: (w) => { const me = w.field.side(w.field.human)[0]; w.clickCell(me.x, me.y); w.resetView(); w.orbit(-130, -110); w.frame(me.x, me.y, 8); },
  // The enemy commander (stands in open sun on 冀州, unlike ours), from a low angle.
  foe: (w) => { const u = w.field.side(w.field.human === 'att' ? 'def' : 'att')[0]; w.st.sel = null; w.resetView(); w.orbit(-90, -90); w.frame(u.x, u.y, 8); },
  // Any cell set by --eval as window.__cell = [x, y] (e.g. after moving a unit's model there for a lighting check);
  // window.__turns = n turns the camera n × 90° first (to see a unit's facings).
  cell: (w) => { const [x, y] = window.__cell; w.st.sel = null; w.resetView(); for (let i = 0; i < (window.__turns || 0); i++) w.rotate(1); w.orbit(window.__turns == null ? -90 : 0, -90); w.frame(x, y, 8); },
  // The overview from each of the four angles (Q/E turns), and Tab's straight-down tactical view (war-3d Task 9).
  yaw0: (w) => { w.resetView(); w.overview(); }, yaw1: (w) => { w.resetView(); w.overview(); w.rotate(1); }, yaw2: (w) => { w.resetView(); w.overview(); w.rotate(1); w.rotate(1); }, yaw3: (w) => { w.resetView(); w.overview(); w.rotate(-1); },
  tactical: (w) => { w.resetView(); w.overview(); w.tactical(true); },
  village: (w) => { const v = w.field.villages[0]; w.st.sel = null; w.resetView(); w.orbit(0, -60); w.frame(v.x, v.y, 9); },
};
if (arg('--eval')) await page.evaluate(arg('--eval'));
if (process.argv.includes('--hide-units')) await page.evaluate(() => window.__game.war.scene.traverse((o) => { if (o.userData.unit) o.parent.parent.visible = false; }));
// Screen position of a cell's centre, for the close-up crops.
const cellClip = (x, y) => page.evaluate(([x, y, W, H]) => {
  const w = window.__game.war, v = w.camera.position.clone().set(x - 15.5, 0.6, y - 9).project(w.camera);
  const cx = (v.x + 1) / 2 * W, cy = (1 - v.y) / 2 * H;
  return { x: Math.max(0, Math.min(W - 800, cx - 400)), y: Math.max(0, Math.min(H - 450, cy - 225)), width: 800, height: 450 };
}, [x, y, W, H]);
const CROP = { castle: (f) => f.castle(), village: (f) => [f.villages[0].x, f.villages[0].y], unit: (f) => { const u = f.side(f.human)[0]; return [u.x, u.y]; }, unitlow: (f) => { const u = f.side(f.human)[0]; return [u.x, u.y]; }, foe: (f) => { const u = f.side(f.human === 'att' ? 'def' : 'att')[0]; return [u.x, u.y]; }, cell: () => window.__cell };
const only = arg('--views', Object.keys(VIEWS).join(',')).split(',');
for (const [nm, fn] of Object.entries(VIEWS).filter(([k]) => only.includes(k))) {
  await page.evaluate(`(${fn})(window.__game.war)`); await page.waitForTimeout(1800);
  const clip = CROP[nm] && !process.argv.includes('--no-crop') && await cellClip(...await page.evaluate(`(${CROP[nm]})(window.__game.war.field)`));
  await page.screenshot({ path: join(out, `war-${nm}.png`), ...(clip ? { clip } : {}) });
  if (process.argv.includes('--plain')) {
    await page.evaluate(() => window.__game.debug.post.setEnabled(false)); await page.waitForTimeout(400);
    await page.screenshot({ path: join(out, `war-${nm}-plain.png`) });
    await page.evaluate(() => window.__game.debug.post.setEnabled(true));
  }
}
console.log('war fps', await page.evaluate(() => new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => { n++; performance.now() - t0 < 2000 ? requestAnimationFrame(f) : r(n / 2); }; requestAnimationFrame(f); })));
console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no page errors');
await browser.close();
