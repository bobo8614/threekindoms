// The boot splash (src/bootsplash.js): the 0-BIT cartridge seats on the original's boot chime (98×3, sfx-chime), scheduled
// on the audio clock ahead of the picture, and the title with its music follows it; a key skips it before the chime sounds.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startGame } from './game.mjs';

let game;
before(async () => { game = await startGame(); });
after(() => game?.close());

// Every buffer source asked to start: when, on the context clock, and its length (the chime file is 0.68 s).
// Playwright pages start at the title (src/app.js): ask for the splash.
const spy = (ctx) => ctx.addInitScript(() => {
  window.__splash = true; window.__starts = [];
  const start = AudioBufferSourceNode.prototype.start, stop = AudioBufferSourceNode.prototype.stop;
  AudioBufferSourceNode.prototype.start = function (when = 0, ...r) { this.__log = { when, dur: this.buffer?.duration, now: this.context.currentTime }; window.__starts.push(this.__log); return start.call(this, when, ...r); };
  AudioBufferSourceNode.prototype.stop = function (...r) { if (this.__log) this.__log.stopped = true; return stop.call(this, ...r); };
});
const chime = (p) => p.evaluate(() => window.__starts.find((s) => s.dur > 0.5 && s.dur < 1) ?? null);

test('the cartridge seats on the chime, then the title and its music begin', async () => {
  const page = await game.open('', { setup: spy });
  await page.waitForFunction(() => document.body.dataset.screen === 'boot' && document.querySelector('.boot'));
  const seat = await page.evaluate(() => new Promise((done) => {
    const look = () => { const s = window.__bootSplash; if (s?.state === 'run' && s.t >= s.cue) return done({ late: s.t - s.cue }); requestAnimationFrame(look); };
    look();
  }));
  // A build without the original file plays the stand-in tone at the cue instead (audio.js); the timing is the wall clock's.
  if (await page.evaluate(() => !!window.__game.audio.files['sfx-chime'])) {
    const c = await chime(page);
    assert.ok(c, 'the chime is played');
    assert.ok(c.when > c.now + 0.3, `scheduled ahead on the audio clock, not fired from a frame: at ${c.when}, asked at ${c.now}`);
  }
  assert.ok(seat.late < 0.05, `the seat is drawn on the chime: ${(seat.late * 1000).toFixed(0)} ms after it`);
  assert.equal(await page.evaluate(() => !!document.querySelector('.tt')), false, 'no title (nor its music) under the splash');
  await page.waitForFunction(() => document.body.dataset.screen === 'title' && document.querySelector('.tt') && !document.querySelector('.boot'), null, { timeout: 10000 });
  assert.equal(await page.evaluate(() => window.__game.audio.bgmKey), 'bgm-title');
  assert.deepEqual(page.errors, []);
});

test('a key skips the splash, and a chime not yet heard never sounds', async () => {
  const page = await game.open('', { setup: spy });
  await page.waitForFunction(() => window.__bootSplash?.state === 'run' && window.__bootSplash.t > 0.3 && window.__bootSplash.t < 0.6);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelector('.tt') && !document.querySelector('.boot'), null, { timeout: 3000 });
  const c = await chime(page);
  assert.ok(!c || c.stopped, 'the scheduled chime is cancelled');
  assert.deepEqual(page.errors, []);
});

// Before the first scene is set up (the splash, the title still loading) no war map exists: a pointer leaving the canvas, a
// right click and a double click there must not reach into one (思念漂泊凛冬@bilibili, D86: `mode === war` held while both were
// null, and a mouse leaving the canvas threw from war.hoverCell).
test('pointer events on the canvas during the boot throw nothing, and the title still comes', async () => {
  const page = await game.open('', { setup: spy });
  await page.waitForFunction(() => document.body.dataset.screen === 'boot' && document.querySelector('.boot'));
  await page.evaluate(() => {
    const c = document.querySelector('#stage canvas') ?? document.querySelector('canvas');
    const at = { clientX: 200, clientY: 200, bubbles: true, pointerId: 7, isPrimary: true };
    c.dispatchEvent(new PointerEvent('pointerleave', { ...at, pointerType: 'mouse' }));
    c.dispatchEvent(new PointerEvent('pointerdown', { ...at, pointerType: 'mouse', button: 2, buttons: 2 }));
    c.dispatchEvent(new PointerEvent('pointerup', { ...at, pointerType: 'mouse', button: 2 }));
    c.dispatchEvent(new MouseEvent('dblclick', { ...at }));
    c.dispatchEvent(new PointerEvent('pointerleave', { ...at, pointerType: 'mouse' }));
  });
  await page.waitForTimeout(100);
  assert.deepEqual(page.errors, []);
  await page.waitForFunction(() => document.body.dataset.screen === 'title' && document.querySelector('.tt') && !document.querySelector('.boot'), null, { timeout: 10000 });
  assert.deepEqual(page.errors, []);
});
