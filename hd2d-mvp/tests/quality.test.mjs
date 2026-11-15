// 画质 presets (src/quality.js): the 3D canvas is held to a count of pixels as well as to a pixel ratio, so a large or dense
// screen does not draw more than the preset's frame can carry (4K at 2×: 8.3 M pixels at 高, 21–26 frames a second on an M4).
import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, pixelRatioFor } from '../src/quality.js';

const drawn = (level, w, h, dpr) => { const r = pixelRatioFor(level, w, h, dpr); return w * h * r * r; };
// Windows a player has: the desktop shell's default, a MacBook Pro's panel, a 4K screen at 2× and at 1.5×, a 5K one.
const DENSE = [[1600, 900, 2], [1512, 982, 2], [1920, 1080, 2], [2560, 1440, 1.5], [2560, 1440, 2]];

test('高 and 中 never draw more than their pixels on a dense screen (or one per CSS pixel, where that is more)', () => {
  for (const level of ['high', 'medium']) for (const [w, h, dpr] of DENSE) {
    const n = drawn(level, w, h, dpr);
    assert.ok(n <= Math.max(PRESETS[level].pixels, w * h) * 1.001, `${level} ${w}×${h}@${dpr}: ${Math.round(n)}`);
  }
});

test('a 4K screen at 2× is held under the ratio the preset alone would give', () => {
  assert.ok(pixelRatioFor('high', 1920, 1080, 2) < 2);
  assert.ok(pixelRatioFor('medium', 1920, 1080, 2) < 1.5);
  assert.ok(drawn('medium', 1920, 1080, 2) < drawn('high', 1920, 1080, 2), '中 is still lighter than 高');
});

test('a small window keeps the preset ratio: the pixel count only ever lowers it', () => {
  assert.equal(pixelRatioFor('high', 1024, 600, 2), 2);
  assert.equal(pixelRatioFor('medium', 1024, 600, 2), 1.5);
  for (const level of ['high', 'medium']) for (const [w, h, dpr] of DENSE) assert.ok(pixelRatioFor(level, w, h, dpr) <= Math.min(dpr, PRESETS[level].ratio));
});

test('never under one pixel per CSS pixel, nor over the screen ratio', () => {
  assert.equal(pixelRatioFor('high', 3840, 2160, 1), 1);
  assert.equal(pixelRatioFor('medium', 3840, 2160, 1), 1);
  assert.equal(pixelRatioFor('high', 1280, 720, 1), 1);
  assert.equal(pixelRatioFor('high', 1280, 720, 0.8), 0.8); // a browser zoomed out
});

test('低 is ratio 1 whatever the window', () => {
  for (const [w, h, dpr] of DENSE) assert.equal(pixelRatioFor('low', w, h, dpr), 1);
});
