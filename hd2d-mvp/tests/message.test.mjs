// The story message box (src/ui.js message): a click anywhere on the screen continues, as Enter does and as any button did in
// the original, and that click presses nothing under the pointer. A drag still moves the camera, the release of a press from
// before the box does not count, and a dialog opened over the box keeps its own clicks.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startGame, newCampaign } from './game.mjs';

let game, page;
before(async () => { game = await startGame(); page = await game.open(); await newCampaign(page); });
after(() => game?.close());

// Opens a box; window.__msg is 'open' until it resolves. plain: all the text at once (as a timed box or reduced motion shows it).
const open = (text = '很遗憾，什么也没找到。'.repeat(6)) => page.evaluate(async (text) => {
  const ui = await import('/hd2d-mvp/src/ui.js');
  window.__msg = 'open'; ui.message('搜索', text).then(() => { window.__msg = 'closed'; });
}, text);
const state = () => page.evaluate(() => ({ msg: window.__msg, box: !!document.querySelector('.panel.msg'), typing: document.querySelector('.panel.msg .more')?.hidden ?? null }));
const settle = () => page.waitForTimeout(60);

test('a click away from the box finishes the text, the next one continues', async () => {
  await open();
  assert.deepEqual(await state(), { msg: 'open', box: true, typing: true });
  await page.mouse.click(640, 200); await settle();
  assert.deepEqual(await state(), { msg: 'open', box: true, typing: false }, 'the first click shows the whole text');
  await page.mouse.click(40, 300); await settle();
  assert.deepEqual(await state(), { msg: 'closed', box: false, typing: null });
});

test('the click that continues presses nothing under the pointer', async () => {
  await open();
  const r = await page.locator('.endturn').boundingBox();
  const at = [r.x + r.width / 2, r.y + r.height / 2];
  await page.mouse.click(...at); await page.mouse.click(...at); await settle();
  assert.equal((await state()).msg, 'closed');
  await page.waitForTimeout(400);
  assert.ok(await page.evaluate(() => { const g = window.__game.g; return g.current === g.player && !document.querySelector('.aiturn') && window.__game.debug && document.querySelector('#ui-top').childElementCount === 0; }), 'the turn did not end and no dialog opened');
});

test('a drag across the map moves the camera and leaves the box up', async () => {
  await open();
  await page.mouse.move(500, 250); await page.mouse.down(); await page.mouse.move(640, 300, { steps: 6 }); await page.mouse.up(); await settle();
  assert.deepEqual(await state(), { msg: 'open', box: true, typing: true });
  await page.keyboard.press('Escape'); await settle();
  assert.equal((await state()).msg, 'closed');
});

test('the release of a press that began before the box does not count', async () => {
  await page.mouse.move(640, 200); await page.mouse.down();
  await open(); await page.mouse.up(); await settle();
  assert.deepEqual(await state(), { msg: 'open', box: true, typing: true });
  await page.waitForTimeout(200); // the box hears keys 150 ms after it opens
  await page.keyboard.press('Escape'); await settle();
  assert.equal((await state()).msg, 'closed');
});

test('a dialog opened over the box keeps its own clicks', async () => {
  await open();
  await page.evaluate(async () => { const ui = await import('/hd2d-mvp/src/ui.js'); window.__confirm = 'open'; ui.confirmBox('确认', '要这样做吗？').then((v) => { window.__confirm = v; }); });
  await page.locator('.modal .btn.primary').click(); await settle();
  assert.equal(await page.evaluate(() => window.__confirm), true);
  assert.equal((await state()).msg, 'open', 'the box under the dialog is still waiting');
  await page.mouse.click(640, 200); await page.mouse.click(640, 200); await settle();
  assert.equal((await state()).msg, 'closed');
  assert.deepEqual(page.errors, []);
});

test('a click on the box itself still continues', async () => {
  await open();
  await page.locator('.panel.msg').click(); await page.locator('.panel.msg').click(); await settle();
  assert.equal((await state()).msg, 'closed');
});
