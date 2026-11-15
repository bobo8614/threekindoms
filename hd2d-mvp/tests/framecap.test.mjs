// The frame cap (src/framecap.js): how many frames a second each display refresh rate draws under 60 and 不限.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pacer } from '../src/framecap.js';

// Frames drawn in one second of a display refreshing at `refresh` Hz, with a little jitter on each vsync.
const drawn = (refresh, hz) => {
  const due = pacer(); let n = 0;
  for (let i = 0; i < refresh; i++) if (due(i * (1000 / refresh) + Math.sin(i) * 0.3, hz)) n++;
  return n;
};

test('60 cap: a 60 Hz display keeps every refresh', () => assert.equal(drawn(60, 60), 60));
test('60 cap: 120 Hz draws every other refresh', () => assert.equal(drawn(120, 60), 60));
test('60 cap: 144 Hz and 165 Hz stay at or under 60', () => {
  for (const r of [144, 165]) { const n = drawn(r, 60); assert.ok(n <= 61 && n >= 48, `${r} Hz drew ${n}`); }
});
test('不限 (hz 0) draws every refresh', () => assert.equal(drawn(120, 0), 120));
test('a hidden window at 30 draws half of 60 Hz', () => assert.equal(drawn(60, 30), 30));
test('a stalled frame does not bunch the next ones up', () => {
  const due = pacer();
  assert.ok(due(0, 60));
  assert.ok(due(500, 60)); // half a second late
  assert.equal(due(508, 60), false); // the next 120 Hz refresh is skipped, not drawn to catch up
  assert.ok(due(517, 60));
});
