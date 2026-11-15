// Capture the title opening for review: stills at the stone, the arrow in flight, the strike, the gold,
// the subtitle and the finished title, each with the opening's clock pinned (window.__titleAt), plus
// the held "按任意键" state a browser that blocks autoplay sees.
//   node hd2d-mvp/tools/title_capture.mjs [out_dir] [--size 1440x900] [--url …]
// Times follow the title music's clock (src/titlescreen.js): whoosh 4.42 s, strike 4.85 s.
// Needs the dev server (python3 hd2d-mvp/tools/serve.py) and Playwright (global @playwright/mcp works).
import { launchChrome } from './headless.mjs';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'title-capture');
const [W, H] = arg('--size', '1440x900').split('x').map(Number);
const URL = arg('--url', 'http://localhost:8642/hd2d-mvp/');
mkdirSync(out, { recursive: true });

const browser = await launchChrome(URL);
const errors = [];
async function open() {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  // Headless Chrome plays media without a gesture; emulate a browser that blocks it until one.
  await page.addInitScript(() => {
    let ok = false; const play = HTMLMediaElement.prototype.play;
    for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, () => { ok = true; }, true);
    HTMLMediaElement.prototype.play = function () { return ok ? play.call(this) : Promise.reject(new DOMException('blocked', 'NotAllowedError')); };
  });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/404/.test(m.text()) && errors.push(m.text()));  // 404s are the manifest's optional-asset probes
  await page.goto(URL); await page.waitForSelector('.tt-canvas');
  return page;
}
// Autoplay blocked (headless default): the stone holds with the prompt.
let page = await open();
await page.waitForTimeout(2500);
await page.screenshot({ path: join(out, '0-held.png') });
console.log('held prompt', await page.locator('.tt-press.on').count() ? 'shown' : 'MISSING');
// A key releases the hold and the music starts.
await page.keyboard.press('Space'); await page.waitForTimeout(600);
console.log('after key: prompt', await page.locator('.tt-press.on').count() ? 'still shown' : 'gone', '· music', await page.evaluate(() => !window.__game.audio.bgm?.el?.paused), '· sfx context', await page.evaluate(() => window.__game.audio.ctx?.state));
for (const [name, at, wait] of [['1-stone', 3.0, 300], ['2-flight-a', 4.55, 60], ['2-flight-b', 4.75, 60], ['3-strike', 4.86, 30], ['3-flash', 4.95, 30], ['4-gold', 5.3, 200], ['5-sub', 6.0, 900], ['6-band', 6.6, 1200], ['7-title', 9.0, 1500]]) {
  await page.evaluate((t) => { window.__titleAt = t; }, at);
  await page.waitForTimeout(wait);
  await page.screenshot({ path: join(out, `${name}.png`) });
}
await page.close();
await browser.close();
if (errors.length) { console.log('errors:\n' + errors.join('\n')); process.exitCode = 1; }
console.log('saved to', out);
