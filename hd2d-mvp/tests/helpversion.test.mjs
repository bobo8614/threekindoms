// The 说明 shows the game's version at the right of its title (天使之翼723@devblog, 2026-11-21): a package reads it from build.json
// (desktop/build-app.mjs writes version and commit), the dev server has none and falls back to desktop/package.json.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startGame, newCampaign } from './game.mjs';

let game;
before(async () => { game = await startGame(); });
after(() => game?.close());
const { version } = JSON.parse(readFileSync(new URL('../desktop/package.json', import.meta.url), 'utf8'));

async function helpVersion(page) {
  await newCampaign(page);
  await page.click('.sysmenu-btn');
  await page.evaluate(() => [...document.querySelectorAll('.sysmenu-list [role=menuitem]')].find((b) => b.textContent.trim() === '说明').click());
  await page.waitForFunction(() => document.querySelector('.modal > .help-version')?.textContent);
  return page.locator('.modal > .help-version').textContent();
}

test('dev server: the 说明 shows desktop/package.json\'s version as 开发版', async () => {
  const page = await game.open();
  try {
    assert.equal(await helpVersion(page), `版本 ${version} 开发版`);
    assert.deepEqual(page.errors, []);
  } finally { await page.context().close(); }
});

test('package: the 说明 shows build.json\'s version and commit', async () => {
  const page = await game.open('', { setup: (c) => c.route(/\/build\.json(\?|$)/, (r) => r.fulfill({ json: { version: '9.8.7', commit: 'abc1234' } })) });
  try {
    assert.equal(await helpVersion(page), '版本 9.8.7（abc1234）');
  } finally { await page.context().close(); }
});
