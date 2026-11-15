// Shoot every war map (all 30 battlefields) for a visual check of the diorama terrain: for each city an
// overview of the whole board and a close-up of its castle (units hidden), then two contact sheets.
//   node hd2d-mvp/tools/war_maps_capture.mjs [out_dir] [--size 1280x720] [--url …] [--cities 0,5,12] [--sheets-only]
// Each map starts from a fresh new game: 曹操's side marches on the city from any city of another faction
// (the city gets a borrowed garrison when it is empty), then deployment is skipped. Needs the dev server,
// Playwright and ffmpeg (for the contact sheets).
import { launchChrome } from './headless.mjs';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execSync } from 'node:child_process';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'war-maps');
const [W, H] = arg('--size', '1280x720').split('x').map(Number);
const URL = arg('--url', 'http://localhost:8642/hd2d-mvp/');
const cities = arg('--cities', [...Array(30).keys()].join(',')).split(',').map(Number);
mkdirSync(out, { recursive: true });

const sheetsOnly = process.argv.includes('--sheets-only');
const browser = sheetsOnly ? null : await launchChrome(URL);
const report = [];
for (const k of sheetsOnly ? [] : cities) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && errors.push(m.text()));
  try {
    await page.goto(URL); await page.waitForFunction(() => window.__game?.debug);
    await page.getByText('新的征程').click(); await page.waitForTimeout(600);
    await page.locator('.ruler', { hasText: '曹操' }).click(); await page.locator('.ruler', { hasText: '曹操' }).click();
    await page.waitForFunction(() => document.body.dataset.screen === 'strategy'); await page.waitForTimeout(1200);
    for (let i = 0; i < 4; i++) { await page.mouse.click(W / 2, H - 120); await page.waitForTimeout(300); }
    await page.evaluate((k) => {
      const { g, debug } = window.__game, cs = g.cities, to = cs[k];
      const from = cs.findIndex((c, i) => i !== k && c.officers.length > 1 && c.faction !== to.faction && c.faction !== 0);
      if (!to.officers.length) { // borrow a garrison from a third city
        const donor = cs.find((c, i) => i !== k && i !== from && c.officers.length > 1 && c.faction !== cs[from].faction && c.faction !== 0);
        to.faction = donor.faction; to.officers = donor.officers.splice(0, 2);
      }
      const ids = cs[from].officers.slice(0, 3);
      const w = debug.setupWar(g, { from, to: k, ids, commander: ids[0], gold: 0, rice: Math.min(cs[from].rice, 600) });
      debug.fieldWar(w, 'att');
    }, k);
    await page.waitForFunction(() => document.body.dataset.screen === 'war' && window.__game.war, null, { timeout: 30000 });
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.__game.war.finishDeploy());
    await page.waitForFunction(() => { const w = window.__game.war; return w.field.turn === w.field.human && !w.st.busy; }, null, { timeout: 60000 });
    await page.evaluate(() => window.__game.war.overview()); await page.waitForTimeout(1800);
    const name = String(k).padStart(2, '0');
    await page.screenshot({ path: join(out, `${name}-board.png`) });
    await page.evaluate(() => {
      const w = window.__game.war, [x, y] = w.field.castle();
      w.scene.traverse((o) => { if (o.userData.unit) o.parent.parent.visible = false; });
      w.resetView(); w.zoom(-640); w.orbit(0, -60); w.pan(x - 15.5, y - 9 - 0.3);
    });
    await page.waitForTimeout(1800);
    const clip = await page.evaluate(([W, H]) => {
      const w = window.__game.war, [x, y] = w.field.castle(), v = w.camera.position.clone().set(x - 15.5, 0.6, y - 9).project(w.camera);
      const cx = (v.x + 1) / 2 * W, cy = (1 - v.y) / 2 * H;
      return { x: Math.max(0, Math.min(W - 640, cx - 320)), y: Math.max(0, Math.min(H - 360, cy - 180)), width: 640, height: 360 };
    }, [W, H]);
    await page.screenshot({ path: join(out, `${name}-castle.png`), clip });
    const city = await page.evaluate(() => document.querySelector('.war-top, .hud-top, #ui-top')?.textContent?.match(/(\S+)之战/)?.[1] || '');
    report.push(`${name} ${city} ${errors.length ? 'ERRORS: ' + errors.join(' | ') : 'ok'}`);
  } catch (e) {
    const screen = await page.evaluate(() => `${document.body.dataset.screen} war=${!!window.__game?.war}`).catch(() => '?');
    report.push(`${String(k).padStart(2, '0')} FAILED (${screen}): ${e.message.split('\n')[0]} ${errors.filter((x) => !x.includes('ERR_CONNECTION')).join(' | ')}`);
  }
  console.log(report.at(-1));
  await ctx.close();
}
await browser?.close();
// Contact sheets: 5 columns, tiles in city order (left to right, top to bottom), scaled down.
const tile = (kind, w, h) => {
  const list = cities.map((k) => join(out, `${String(k).padStart(2, '0')}-${kind}.png`));
  const inputs = list.map((f) => `-i "${f}"`).join(' ');
  const scaled = list.map((_, i) => `[${i}:v]scale=${w}:${h}[v${i}]`).join(';');
  const cols = 5, rows = Math.ceil(list.length / cols);
  try {
    execSync(`ffmpeg -loglevel error -y ${inputs} -filter_complex "${scaled};${list.map((_, i) => `[v${i}]`).join('')}xstack=inputs=${list.length}:layout=${list.map((_, i) => `${(i % cols) * w}_${Math.floor(i / cols) * h}`).join('|')}:fill=black" -frames:v 1 "${join(out, `sheet-${kind}.jpg`)}"`);
  } catch (e) { console.log(`sheet-${kind} failed: ${e.message.split('\n')[0]}`); }
};
if (cities.length > 1) { tile('board', 384, 216); tile('castle', 320, 180); }
console.log(report.filter((l) => !l.endsWith(' ok')).length ? 'some maps had problems' : 'all maps ok');
