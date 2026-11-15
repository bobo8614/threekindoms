// A number box on every slider row (group feedback G03, 2026-11-04): 运输 and 征兵 of an exact amount took long drags. It keeps
// the row's rules: the minimum, the maximum, its step and the odd amount at the top end.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startGame, newCampaign } from './game.mjs';

let game, page, n = 0;
test.before(async () => { game = await startGame({ width: 1280, height: 800 }); page = await game.open(); await newCampaign(page, '董卓'); }, { timeout: 180000 });
test.after(async () => { await game?.close(); });

// Opens a dialog; the answer lands in window.__ans[id].
const open = async (fields, opts = {}) => {
  const id = ++n;
  await page.evaluate(async ({ id, fields, opts }) => {
    const U = await import('./src/ui.js'); window.__ans ??= {};
    window.__ans[id] = 'open';
    U.sliders('试', fields, opts.needSome ? { validate: (v) => Object.values(v).some(Boolean) } : {}).then((v) => { window.__ans[id] = v; });
  }, { id, fields, opts });
  return id;
};
const ans = (id) => page.evaluate((id) => window.__ans[id], id);
const box = (i = 0) => page.locator('.modal .amount').nth(i);
const range = (i = 0) => page.locator('.modal input[type=range]').nth(i);
const okBtn = () => page.locator('.modal .foot .btn.primary');
const GOLD = { key: 'gold', label: '金', min: 0, max: 137, step: 10 };
const type = async (t, i = 0) => { await box(i).click(); await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.type(t); };
const cancel = () => page.locator('.modal .foot .btn', { hasText: '取消' }).click();

test('typing a legal amount moves the slider at once', async () => {
  const id = await open([GOLD]);
  await type('120');
  assert.equal(await range().inputValue(), '120');
  await page.keyboard.press('Tab');
  await okBtn().click();
  assert.deepEqual(await ans(id), { gold: 120 });
});

test('a click selects the whole amount, ready to be typed over', async () => {
  const id = await open([{ ...GOLD, value: 70 }]);
  await box().click();
  assert.equal(await box().evaluate((e) => e.value.slice(e.selectionStart, e.selectionEnd)), '70');
  await page.keyboard.type('80');
  assert.equal(await box().inputValue(), '80');
  await page.keyboard.press('Enter');
  assert.deepEqual(await ans(id), { gold: 80 });
});

test('the slider and 最多 write into the box', async () => {
  const id = await open([GOLD]);
  await range().focus(); await page.keyboard.press('ArrowRight');
  assert.equal(await box().inputValue(), '10');
  await page.locator('.modal .btn.mini', { hasText: '最多' }).click();
  assert.equal(await box().inputValue(), '137');
  await okBtn().click();
  assert.deepEqual(await ans(id), { gold: 137 });
});

test('over the top comes back to the most, in sight, and is not confirmed behind the player\'s back', async () => {
  const id = await open([GOLD]);
  await type('999');
  assert.equal(await okBtn().isDisabled(), true, '确定 waits while the box holds no legal amount');
  await page.keyboard.press('Enter');
  assert.equal(await box().inputValue(), '137', 'corrected');
  assert.equal(await ans(id), 'open', 'Enter on a corrected amount does not close the dialog');
  await page.keyboard.press('Enter');
  assert.deepEqual(await ans(id), { gold: 137 });
});

test('off the step it takes the nearest step, the odd top end included', async () => {
  const id = await open([GOLD]);
  await type('74'); await page.keyboard.press('Tab');
  assert.equal(await box().inputValue(), '70');
  await type('135'); await page.keyboard.press('Tab');
  assert.equal(await box().inputValue(), '137', 'the top end is nearer than 130');
  await type('132'); await page.keyboard.press('Tab');
  assert.equal(await box().inputValue(), '130');
  await cancel();
});

test('under the least comes back to it, and a partly typed number is left alone', async () => {
  const id = await open([{ key: 'q', label: '米', min: 10, max: 500, step: 10, value: 50 }]);
  await box().click(); await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.type('1');
  assert.equal(await box().inputValue(), '1', 'on the way to 100 the box is not rewritten');
  await page.keyboard.type('00');
  assert.equal(await box().inputValue(), '100');
  assert.equal(await okBtn().isDisabled(), false);
  await type('3'); await page.keyboard.press('Tab');
  assert.equal(await box().inputValue(), '10');
  await okBtn().click();
  assert.deepEqual(await ans(id), { q: 10 });
});

test('an empty box goes back to the last amount, and letters are not taken', async () => {
  const id = await open([GOLD]);
  await type('50'); await page.keyboard.press('Tab');
  await box().click(); await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.press('Backspace');
  assert.equal(await okBtn().isDisabled(), true);
  await page.keyboard.press('Tab');
  assert.equal(await box().inputValue(), '50');
  await type('a-1.e2x');
  assert.equal(await box().inputValue(), '12', 'only digits');
  await box().fill('１２０'); // a Chinese IME's full-width digits
  assert.equal(await box().inputValue(), '120');
  await page.keyboard.press('Tab');
  await okBtn().click();
  assert.deepEqual(await ans(id), { gold: 120 });
});

test('a click on the greyed 确定 corrects the box and does not confirm', async () => {
  const id = await open([GOLD]);
  await type('999');
  const b = await okBtn().boundingBox();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  assert.equal(await box().inputValue(), '137');
  assert.equal(await ans(id), 'open');
  await okBtn().click();
  assert.deepEqual(await ans(id), { gold: 137 });
});

test('the keys: arrows step, Enter walks to the next box and then confirms, Esc cancels', async () => {
  const id = await open([GOLD, { key: 'rice', label: '米', min: 0, max: 80, step: 10 }]);
  await box(0).focus(); await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp');
  assert.equal(await box(0).inputValue(), '20');
  await page.keyboard.press('ArrowDown');
  assert.equal(await box(0).inputValue(), '10');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement === document.querySelectorAll('.modal .amount')[1]), true);
  await page.keyboard.type('30'); await page.keyboard.press('Enter');
  assert.deepEqual(await ans(id), { gold: 10, rice: 30 });
  const id2 = await open([GOLD]);
  await type('40'); await page.keyboard.press('Escape');
  assert.equal(await ans(id2), null);
});

test('Enter does not confirm what the dialog refuses', async () => {
  const id = await open([GOLD], { needSome: true });
  await type('0'); await page.keyboard.press('Enter');
  assert.equal(await ans(id), 'open');
  await cancel();
});

test('a row with nothing to choose has its box disabled', async () => {
  const id = await open([{ key: 't', label: '宝', min: 0, max: 0 }, GOLD]);
  assert.equal(await box(0).isDisabled(), true);
  await type('10', 1); await page.keyboard.press('Enter');
  assert.deepEqual(await ans(id), { t: 0, gold: 10 });
  assert.deepEqual(page.errors, []);
});

test('typing does not reach the map keys', async () => {
  const before = await page.evaluate(() => window.__game.strategy.camera.position.toArray());
  const id = await open([GOLD]);
  await box().click(); await page.keyboard.type('wasd5');
  await page.waitForTimeout(300);
  assert.equal(await box().inputValue(), '5');
  // A key that reached the map would pan it by whole units; the camera's own ease may still be finishing its last 1e-12.
  const after = await page.evaluate(() => window.__game.strategy.camera.position.toArray());
  assert.ok(after.every((v, i) => Math.abs(v - before[i]) < 1e-6), `the camera stayed: ${JSON.stringify([before, after])}`);
  await cancel();
  await ans(id);
});
