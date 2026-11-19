import assert from 'node:assert/strict';

const STD = ['a', 'b', 'x', 'y', 'lb', 'rb', 'lt', 'rt', 'view', 'start', 'l3', 'r3', 'up', 'down', 'left', 'right', 'home'];
// A fake pad on the page: window.__fakePad.set(name, on), .axes[i] = v.
const fakePad = (id) => (ctx) => ctx.addInitScript((id) => {
  const pad = { id, index: 0, mapping: 'standard', connected: true, timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  Object.defineProperty(navigator, 'getGamepads', { value: () => [pad, null, null, null] });
  window.__fakePad = { pad, set(i, on) { pad.buttons[i] = { pressed: on, touched: on, value: on ? 1 : 0 }; pad.timestamp = performance.now(); } };
}, id);
export const XBOX = fakePad('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)');
export const NINTENDO = fakePad('Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)');
export const btn = (page, k, on) => page.evaluate(([i, on]) => window.__fakePad.set(i, on), [STD.indexOf(k), on]);
// A press of a few frames.
export async function padTap(page, k, { wait = 120 } = {}) { await btn(page, k, true); await page.waitForTimeout(70); await btn(page, k, false); await page.waitForTimeout(wait); }
export async function padHold(page, k, ms = 800) { await btn(page, k, true); await page.waitForTimeout(ms); await btn(page, k, false); await page.waitForTimeout(150); }
export const state = (page) => page.evaluate(() => window.__game.pad.state);
export const focused = (page) => page.evaluate(() => { const a = document.activeElement; return a && a !== document.body ? a.textContent.trim() : null; });
// Walks the focus (d-pad) until the focused control's text matches, at most n steps that way.
export async function walkTo(page, dir, re, n = 12) {
  for (let i = 0; i < n; i++) { if (re.test((await focused(page)) ?? '')) return; await padTap(page, dir, { wait: 60 }); }
  assert.match((await focused(page)) ?? '', re);
}
