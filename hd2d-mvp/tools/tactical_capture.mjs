// Capture the 白兵 field for review: stills at deployment (under the 开始交战 prompt) and, once it is pressed, during the first rounds (with the HUD, and a
// close-up without it), plus a video of the opening clashes.
//   node hd2d-mvp/tools/tactical_capture.mjs [out_dir] [--a 38 --d 51 --t 2] [--size 1440x900] [--url …] [--prefix after] [--side d]
// --side d: the player defends (the AI attacks); check both sides, the HUD cards must stand over their own troops.
// Needs the dev server (python3 hd2d-mvp/tools/serve.py) and Playwright (global @playwright/mcp works).
import { launchChrome } from './headless.mjs';
import { mkdirSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'tactical-capture');
const A = Number(arg('--a', 38)), D = Number(arg('--d', 51)), TER = Number(arg('--t', 2)), [W, H] = arg('--size', '1440x900').split('x').map(Number);
const URL = arg('--url', 'http://localhost:8642/hd2d-mvp/'), P = arg('--prefix', 'after');
mkdirSync(out, { recursive: true });

const browser = await launchChrome(URL);
const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: out, size: { width: W / 2, height: H / 2 } } });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.error('pageerror', e.message));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && console.error('console', m.text()));
await page.goto(URL + (URL.includes('mute') ? '' : (URL.includes('?') ? '&' : '?') + 'mute')); await page.waitForFunction(() => window.__game?.debug);
await page.evaluate(([a, d, t, human]) => { window.__run = window.__game.debug.quickTactical(a, d, t, { human }); }, [A, D, TER, arg('--side', 'a')]);
await page.waitForSelector('.tq-form'); await page.click('.tq-form'); await page.locator('.tq-deploy:not(.arming)').click();
await page.waitForFunction(() => window.__tq && !document.querySelector('.tq-formation'));
await page.waitForSelector('.tq-start button:not(.arming)', { timeout: 30000 });
await page.waitForTimeout(1800);
const shot = (n) => page.screenshot({ path: join(out, `${P}-${n}.jpg`), quality: 88 });
await shot('deploy');
// Close-up: the camera pulled in on the attacker's line, HUD hidden.
const close = async (n) => {
  await page.evaluate(() => { document.querySelector('.tq')?.style.setProperty('visibility', 'hidden'); const v = window.__game.tview; v.setInsets(0, 0); v.zoom(-560); });
  await page.waitForTimeout(1200); await shot(n);
  await page.evaluate(() => { document.querySelector('.tq')?.style.removeProperty('visibility'); window.__game.tview.zoom(1300); });
};
await close('deploy-close');
// The battle opens paused under the 开始交战 prompt (src/tacticalhud.js): nothing moves until it is pressed, and the button
// only takes a press once it has armed. Without this the rounds below were four stills of the same deployed field.
await page.locator('.tq-start button:not(.arming)').click();
await page.waitForFunction(() => !document.querySelector('.tq-start'));
for (let i = 1; i <= 4; i++) {
  await page.waitForTimeout(2600);
  await shot(`round${i}`);
}
await close('fight-close');
// --burst: a close-up frame every 120 ms through the next clashes, to check strike, flinch and fall timing.
if (process.argv.includes('--burst')) {
  await page.evaluate(() => { document.querySelector('.tq')?.style.setProperty('visibility', 'hidden'); window.__game.tview.setInsets(0, 0); window.__game.tview.zoom(-560); });
  await page.waitForTimeout(800);
  for (let i = 0; i < 32; i++) { await shot(`burst-${String(i).padStart(2, '0')}`); await page.waitForTimeout(120); }
  await page.evaluate(() => { document.querySelector('.tq')?.style.removeProperty('visibility'); window.__game.tview.zoom(1300); });
}
await page.waitForTimeout(4000); await shot('later');
const v = page.video(); await ctx.close(); renameSync(await v.path(), join(out, `${P}.webm`));
await browser.close();
console.log('saved', out);
