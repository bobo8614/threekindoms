// Every command in the strategy dock answers when pressed. e6dbcf49 (batch commands, 2026-11-16) dropped the cases for
// 出阵 征兵 分兵 侦察 任命 运输 记录 快捷记录 from command() in src/app.js: their rows stayed lit (blocked() still knew them),
// and a press did nothing at all, with no dialog and no error (B站 Toy 392a13f3, desktop and phone alike).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startGame, newCampaign, cmd } from './game.mjs';

const SRC = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('command() has a case for every dock command and for 快捷记录', () => {
  const tabs = Function(`return ${SRC.match(/^const TABS = (\{.*\});$/m)[1]}`)();
  const body = SRC.slice(SRC.indexOf('async function command(cid, act)'), SRC.indexOf('\nfunction troopsDialog('));
  const missing = [...Object.values(tabs).flat(), '快捷记录'].filter((a) => !body.includes(`case '${a}':`));
  assert.deepEqual(missing, [], 'commands the dock offers but command() does not carry out');
});

let game, page;
before(async () => {
  game = await startGame(); page = await game.open();
  await page.evaluate(async () => { (await import('./src/pace.js')).setPace(4); (await import('./src/vignette.js')).setVignettes(false); });
  await newCampaign(page);
  await page.waitForFunction(() => !document.querySelector('.banner'), null, { timeout: 20000 });
});
after(() => game?.close());

// A press opens something: a dialog, the map's city picker or a toast that says why not.
const answered = () => page.waitForFunction(() => document.querySelector('.shade, .mappick, body > .toast'), null, { timeout: 5000 });
const settle = async () => {
  for (let i = 0; i < 10 && (await page.evaluate(() => !!document.querySelector('.shade, .mappick'))); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(200); }
  await page.waitForFunction(() => !document.querySelector('.shade, .mappick'), null, { timeout: 5000 });
};

test('each 军 command opens its dialog or picker (刘备 in 并州, first month)', async () => {
  for (const act of ['出阵', '征兵', '分兵', '侦察', '任命']) {
    await cmd(page, '军', act);
    await answered().catch(() => assert.fail(`${act}: nothing opened`));
    await settle();
  }
});

test('记录 opens the slot picker', async () => {
  await cmd(page, '城', '记录');
  await answered().catch(() => assert.fail('记录: nothing opened'));
  await settle();
});
