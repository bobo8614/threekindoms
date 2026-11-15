// Capture the boot splash (src/bootsplash.js) for review and check that the picture lands on the chime:
//  1. sync: the splash as it plays; the frame where the cartridge seats is compared with when the chime's first sample
//     reaches the speakers (the scheduled start plus the file's lead-in, on the output clock).
//  2. stills with the splash clock pinned (window.__splashAt) across the cue.
//  3. held: a browser that blocks sound until a gesture shows 「按任意键」, and a key starts the splash.
//   node hd2d-mvp/tools/boot_capture.mjs [out_dir] [--size 1440x900] [--url …]
// Needs the dev server (python3 hd2d-mvp/tools/serve.py <port>). Headless and muted (tools/headless.mjs).
import { launchChrome } from './headless.mjs';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'boot-capture');
const [W, H] = arg('--size', '1440x900').split('x').map(Number);
const URL = arg('--url', 'http://localhost:8642/hd2d-mvp/?mute');
mkdirSync(out, { recursive: true });
const errors = [];
const watch = (page) => {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/404/.test(m.text()) && errors.push(m.text()));
};

// Every buffer source started: when it was asked to sound, on the context clock.
const spyStarts = () => {
  window.__starts = [];
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (when = 0, ...rest) { window.__starts.push({ when, dur: this.buffer?.duration }); return start.call(this, when, ...rest); };
};

let browser = await launchChrome(URL, ['--autoplay-policy=no-user-gesture-required']);
let page = await browser.newPage({ viewport: { width: W, height: H } }); watch(page);
await page.addInitScript(spyStarts); await page.addInitScript(() => { window.__splash = true; });
await page.goto(URL);
await page.waitForFunction(() => window.__bootSplash?.state === 'run', null, { timeout: 30000 });
// At the first frame drawn at or past the cue: how late that frame is (under one frame is on the beat), whether the chime was
// scheduled ahead (its start still in the future when it was asked for) and how far behind the context clock the speakers are.
const sync = await page.evaluate(() => new Promise((done) => {
  const look = () => {
    const s = window.__bootSplash, ctx = window.__game.audio.ctx;
    if (s.t >= s.cue) {
      const chime = window.__starts.find((x) => x.dur > 0.5 && x.dur < 1);
      return done({ late: s.t - s.cue, chime, latency: ctx.currentTime - s.heard });
    }
    requestAnimationFrame(look);
  };
  look();
}));
console.log('sync:', sync.chime ? `chime scheduled for context ${sync.chime.when.toFixed(3)} s` : 'NO CHIME SCHEDULED',
  `· seat drawn ${(sync.late * 1000).toFixed(1)} ms past the cue · output latency allowed for ${(sync.latency * 1000).toFixed(1)} ms`);
await page.waitForSelector('.tt-canvas', { timeout: 15000 });
console.log('title follows the splash:', await page.evaluate(() => !document.querySelector('.boot') && document.body.dataset.screen === 'title'));
await page.close();

// Pinned stills.
page = await browser.newPage({ viewport: { width: W, height: H } }); watch(page);
await page.addInitScript(() => { window.__splash = true; window.__splashAt = 0; });
await page.goto(URL); await page.waitForSelector('.boot canvas');
for (const [name, at] of [['0-hover', 0.3], ['1-dust', 0.45], ['2-push', 0.72], ['3-seat', 0.8], ['4-flash', 0.83], ['5-zero', 0.9], ['6-twist', 1.12], ['7-infinity', 1.5], ['8-hearts', 1.8], ['9-final', 2.4]]) {
  await page.evaluate((t) => { window.__splashAt = t; }, at);
  await page.waitForTimeout(120);
  await page.screenshot({ path: join(out, `${name}.png`) });
}
await page.close();
await browser.close();

// Sound held back until a gesture.
// Playwright's Chrome lets audio start on its own, so a context that stays suspended until a key or click is emulated.
browser = await launchChrome(URL);
page = await browser.newPage({ viewport: { width: W, height: H } }); watch(page);
await page.addInitScript(() => {
  window.__splash = true;
  let ok = false; for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, () => { ok = true; }, true);
  const Real = window.AudioContext;
  window.AudioContext = class extends Real {
    constructor(...a) { super(...a); if (!ok) super.suspend(); }
    resume() { return ok ? super.resume() : Promise.resolve(); }
  };
});
await page.goto(URL); await page.waitForSelector('.boot canvas');
await page.waitForTimeout(1500);
const held = await page.locator('.boot-press.on').count();
await page.screenshot({ path: join(out, 'held.png') });
await page.keyboard.press('Space');
await page.waitForFunction(() => window.__bootSplash?.state === 'run', null, { timeout: 5000 }).catch(() => {});
console.log('held prompt', held ? 'shown' : 'MISSING', '· after key:', await page.evaluate(() => `${window.__bootSplash?.state} · context ${window.__game?.audio.ctx?.state}`));
await page.waitForSelector('.tt-canvas', { timeout: 15000 });
console.log('title held again:', await page.evaluate(async () => { await new Promise((r) => setTimeout(r, 2000)); return !!document.querySelector('.tt-press.on'); }));
await browser.close();
if (errors.length) { console.log('errors:\n' + errors.join('\n')); process.exitCode = 1; }
console.log('saved to', out);
