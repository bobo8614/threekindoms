// Phones with mixed inputs use the touch layout without reclassifying small-screen touch PCs.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { skipIntro, startGame } from './game.mjs';

let game;
before(async () => { game = await startGame({ width: 854, height: 384 }); });
after(() => game?.close());

async function open(profile, query = '') {
  return game.open(query, { setup: async (ctx) => {
    await ctx.addInitScript(({ width, height, primary, anyTouch, anyFine, ua, mobileHint }) => {
      Object.defineProperty(screen, 'width', { configurable: true, value: width });
      Object.defineProperty(screen, 'height', { configurable: true, value: height });
      Object.defineProperty(navigator, 'userAgent', { configurable: true, value: ua });
      Object.defineProperty(navigator, 'userAgentData', { configurable: true, value: mobileHint === undefined ? undefined : { mobile: mobileHint } });
      const match = window.matchMedia.bind(window);
      const pointers = { '(pointer: coarse)': primary, '(any-pointer: coarse)': anyTouch, '(any-pointer: fine)': anyFine };
      window.matchMedia = (q) => Object.hasOwn(pointers, q) ? { matches: pointers[q] } : match(q);
    }, profile);
  } });
}

const android = 'Mozilla/5.0 (Linux; Android 15; iQOO) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36';
const windows = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36';
const phoneWithMouse = { width: 854, height: 384, primary: true, anyTouch: true, anyFine: true, ua: android };

test('a phone with touch and mouse shows its rulers on the opening screen and can start', async () => {
  const page = await open(phoneWithMouse);
  try {
    assert.equal(await page.evaluate(() => document.body.classList.contains('phone')), true, 'mixed input must use the phone layout');
    await page.waitForFunction(() => [...document.styleSheets].some((s) => s.href?.includes('phone.css')), null, { timeout: 10000 });
    await skipIntro(page);
    await page.getByText('新的征程').click();
    await page.locator('.level', { hasText: 'LEVEL 3' }).click();
    const ruler = page.locator('.ruler').first(), rect = await ruler.boundingBox();
    assert.ok(rect && rect.y >= 0 && rect.y < 384, `the first ruler must be visible: ${JSON.stringify(rect)}`);
    const start = page.locator('.setup-foot .primary');
    assert.equal(await start.isDisabled(), true, 'choosing a ruler is still required');
    await ruler.click();
    assert.equal(await start.isEnabled(), true);
    await start.click();
    await page.waitForFunction(() => document.body.dataset.screen === 'strategy', null, { timeout: 30000 });
    assert.deepEqual(page.errors, []);
  } finally { await page.context().close(); }
});

for (const [label, profile, query, expected] of [
  ['touch phone without a fine pointer', { width: 854, height: 384, primary: true, anyTouch: true, anyFine: false, ua: android }, '', true],
  ['the original touch-only detection does not require a mobile UA', { width: 854, height: 384, primary: true, anyTouch: true, anyFine: false, ua: 'Mozilla/5.0' }, '', true],
  ['Android remains a phone with mouse as primary and a false mobile hint', { width: 854, height: 384, primary: false, anyTouch: true, anyFine: true, ua: android, mobileHint: false }, '', true],
  ['iPhone with a fine pointer still uses the phone layout', { width: 854, height: 384, primary: true, anyTouch: true, anyFine: true, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' }, '', true],
  ['mobile client hint can identify mixed input when the UA is generic', { width: 854, height: 384, primary: true, anyTouch: true, anyFine: true, ua: 'Mozilla/5.0', mobileHint: true }, '', true],
  ['mouse-only small screen', { width: 854, height: 384, primary: false, anyTouch: false, anyFine: true, ua: windows }, '', false],
  ['Windows touch PC with mouse as primary stays desktop', { width: 960, height: 540, primary: false, anyTouch: true, anyFine: true, ua: windows }, '', false],
  ['Windows touch PC with touch as primary stays desktop', { width: 960, height: 540, primary: true, anyTouch: true, anyFine: true, ua: windows }, '', false],
  ['touch tablet at the size boundary', { width: 1024, height: 600, primary: true, anyTouch: true, anyFine: true, ua: android }, '', false],
  ['phone=0 overrides mixed input', phoneWithMouse, '&phone=0', false],
  ['phone override on a desktop', { width: 1440, height: 900, primary: false, anyTouch: false, anyFine: true, ua: windows }, '&phone', true],
]) test(label, async () => {
  const page = await open(profile, query);
  try { assert.equal(await page.evaluate(() => document.body.classList.contains('phone')), expected); }
  finally { await page.context().close(); }
});

// Touch handling (body.touch: the maps' touch-action none, the flat maps' pinch and slide, 低 to start) goes with a finger, not
// with the phone's layout: an Android tablet, short side 800, kept the desktop layout and lost the touch handling with it (2026-11-20).
const tablet = { width: 1280, height: 800, primary: true, anyTouch: true, anyFine: false, ua: 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 Chrome/131 Safari/537.36' };
for (const [label, profile, query, want] of [
  ['an Android tablet is touch with the desktop layout, on 低', tablet, '', { touch: true, phone: false, canvas: 'none', quality: 'low' }],
  ['an Android tablet that also reports a mouse is still touch', { ...tablet, anyFine: true }, '', { touch: true, phone: false, canvas: 'none', quality: 'low' }],
  ['a phone is touch too', phoneWithMouse, '', { touch: true, phone: true, canvas: 'none', quality: 'low' }],
  ['a Windows touch PC stays a desktop, on 高', { width: 960, height: 540, primary: true, anyTouch: true, anyFine: true, ua: windows }, '', { touch: false, phone: false, canvas: 'auto', quality: 'high' }],
  ['touch=0 turns it off on a tablet', tablet, '&touch=0', { touch: false, phone: false, canvas: 'auto', quality: 'high' }],
]) test(label, async () => {
  const page = await open(profile, query);
  try {
    await page.waitForFunction(() => window.__game?.debug?.quality, null, { timeout: 30000 });
    assert.deepEqual(await page.evaluate(() => ({ touch: document.body.classList.contains('touch'), phone: document.body.classList.contains('phone'),
      canvas: getComputedStyle(document.querySelector('#stage canvas')).touchAction, quality: window.__game.debug.quality.level })), want);
  } finally { await page.context().close(); }
});
