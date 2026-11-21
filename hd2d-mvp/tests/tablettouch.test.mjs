// Two fingers on an Android tablet (2026-11-20): a tablet keeps the desktop layout (short side ≥ 600) but is a touch device
// (src/phone.js TOUCH). Before, the touch handling went with the phone's layout: the flat war map neither zoomed nor slid under
// a finger, and the 3D war map's pinch stepped once for every 10% the fingers moved, end to end in one small gesture.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startGame, newCampaign, closeMessages, warRest } from './game.mjs';

let game;
before(async () => { game = await startGame({ width: 1280, height: 800 }); });
after(() => game?.close());

const ua = 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 Chrome/131 Safari/537.36';
const open = (store = {}) => game.open('', { setup: async (ctx) => {
  await ctx.addInitScript(({ ua, store }) => {
    Object.defineProperty(screen, 'width', { configurable: true, value: 1280 });
    Object.defineProperty(screen, 'height', { configurable: true, value: 800 });
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: ua });
    const match = window.matchMedia.bind(window), pointers = { '(pointer: coarse)': true, '(any-pointer: coarse)': true, '(any-pointer: fine)': false };
    window.matchMedia = (q) => Object.hasOwn(pointers, q) ? { matches: pointers[q] } : match(q);
    if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); for (const [k, v] of Object.entries(store)) localStorage.setItem(k, v); }
  }, { ua, store });
} });

// A war on the player's turn, the camera at rest.
async function war(store) {
  const page = await open(store);
  await newCampaign(page);
  assert.deepEqual(await page.evaluate(() => [document.body.classList.contains('touch'), document.body.classList.contains('phone')]), [true, false]);
  await page.evaluate(() => {
    const { g, G, debug } = window.__game, home = g.factions[g.player].city;
    const to = G.roads(home).map((c) => g.cities[c]).filter((c) => c.faction !== g.player && c.faction !== G.NONE && c.officers.length)[0];
    for (const id of [...g.cities[home].officers, ...to.officers]) g.officers[id].soldiers ||= 500;
    const ids = g.cities[home].officers.slice(0, 3);
    debug.fieldWar(debug.setupWar(g, { from: home, to: to.id, ids, commander: ids[0], gold: 100, rice: 400 }), 'att');
  });
  await page.waitForFunction(() => window.__game.war?.finishDeploy && document.body.dataset.screen === 'war', null, { timeout: 30000 });
  const stop = closeMessages(page);
  try {
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.__game.war.finishDeploy());
    await page.waitForFunction(() => { const f = window.__game.war.field; return f.turn === f.human && !document.querySelector('.banner, .panel.msg'); }, null, { timeout: 30000 });
  } finally { stop(); }
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  return { page, cdp };
}

// Two fingers at (cx ± from, cy) drawn to (cx ± to, cy) in steps, as a pinch.
async function pinch(page, cdp, { cx, cy, from, to, steps = 8, dx = 0 }) {
  const pts = (d, s = 0) => [{ x: cx - d + s, y: cy, id: 1 }, { x: cx + d + s, y: cy, id: 2 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(from) }); await page.waitForTimeout(40);
  for (let i = 1; i <= steps; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(from + (to - from) * i / steps, dx * i / steps) }); await page.waitForTimeout(30); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(300);
}

test('a tablet starts on the flat war map, which two fingers zoom and one finger slides, and the board opens whole', async () => {
  const { page, cdp } = await war();
  try {
    assert.equal(await page.evaluate(() => !!window.__game.war.flatHud), true, '低 by default on a tablet: the flat war map');
    const cell = () => page.evaluate(() => window.__game.war.screenOf(16, 9));
    const a = await cell();
    // Opened whole: the corner cells sit between the HUD's strips, not slid to centre a general as on a phone.
    const corner = await page.evaluate(() => [window.__game.war.screenOf(0, 0), window.__game.war.screenOf(31, 18)].map((c) => [c.x, c.y]).flat());
    assert.ok(corner.every((v) => v > 0 && v < 1280) && corner[1] >= 46 && corner[3] <= 800 - 128, `the whole board is on screen: ${corner}`);
    await pinch(page, cdp, { cx: 640, cy: 400, from: 80, to: 160 });
    const b = await cell();
    assert.ok(b.cw > a.cw * 1.6, `two fingers twice as far apart zoom the board in: ${a.cw} → ${b.cw}`);
    await pinch(page, cdp, { cx: 640, cy: 400, from: 100, to: 100, dx: 150 });
    const c = await cell();
    assert.ok(Math.abs(c.x - b.x - 150) < 20 && Math.abs(c.cw - b.cw) < 0.5, `the pair moved together slides the board: ${b.x} → ${c.x}`);
    // One finger drags it too.
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 700, y: 420, id: 3 }] });
    for (let i = 1; i <= 6; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 700 - i * 20, y: 420, id: 3 }] }); await page.waitForTimeout(30); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(300);
    const d = await cell();
    assert.ok(c.x - d.x > 80, `one finger slides the board: ${c.x} → ${d.x}`);
    assert.deepEqual(page.errors, []);
  } finally { await page.context().close(); }
});

test('the 3D war map steps once for a pinch of 1.5×, not for a nudge, and the wheel still steps at 100', async () => {
  const { page, cdp } = await war({ 'hd2d-war-view': '3d' });
  try {
    assert.equal(await page.evaluate(() => !!window.__game.war.flatHud), false);
    await warRest(page);
    const z0 = await page.evaluate(() => window.__game.war.viewState().zoom);
    await pinch(page, cdp, { cx: 640, cy: 400, from: 100, to: 125 }); // 1.25×
    await warRest(page);
    assert.equal(await page.evaluate(() => window.__game.war.viewState().zoom), z0, 'a small pinch does not step');
    await page.waitForTimeout(700); // the step's tally clears after 600 ms
    await pinch(page, cdp, { cx: 640, cy: 400, from: 80, to: 136 }); // 1.7×
    await warRest(page);
    const z1 = await page.evaluate(() => window.__game.war.viewState().zoom);
    const STEPS = ['whole', 'far', 'mid', 'near'];
    assert.equal(STEPS.indexOf(z1), STEPS.indexOf(z0) + 1, `a pinch of 1.7× is one step in: ${z0} → ${z1}`);
    await page.waitForTimeout(700);
    await page.evaluate(() => window.__game.war.zoom(-120));
    await warRest(page);
    assert.equal(STEPS.indexOf(await page.evaluate(() => window.__game.war.viewState().zoom)), STEPS.indexOf(z1) + 1, 'the wheel steps as before');
    assert.deepEqual(page.errors, []);
  } finally { await page.context().close(); }
});
