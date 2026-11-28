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

// 分兵's 清空 (82游戏电影圈的TONY老师@devblog #816): 补满's mirror sends all of one officer's men back to the reserve.
test('分兵 清空 sends all of an officer\'s men to the reserve, 补满 brings them back', async () => {
  const state = () => page.evaluate(() => { const { g } = window.__game, c = g.cities[g.factions[g.player].city], id = c.officers[0];
    return { soldiers: g.officers[id].soldiers, reserve: c.reserve }; });
  const before0 = await state();
  assert.ok(before0.soldiers > 0, 'the first officer leads men to send back');
  await cmd(page, '军', '分兵');
  const row = page.locator('.shade .row').first();
  await row.locator('button', { hasText: /^清空$/ }).click();
  const cleared = await state();
  assert.equal(cleared.soldiers, 0);
  assert.equal(cleared.reserve, before0.reserve + before0.soldiers);
  assert.equal(await row.locator('.val').textContent(), '0');
  await row.locator('button', { hasText: /^补满$/ }).click();
  assert.equal((await state()).soldiers, Math.min(1000, cleared.reserve));
  await settle();
});
