// The 战略地图's UI takes the season's colours (春夏秋冬, as the 季节 chip in the top bar); the war keeps its own lacquer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startGame, newCampaign, closeMessages } from './game.mjs';

// Browsers without @property (Safari before 16.4, Firefox before 128) drop those rules: a colour defined only there leaves .panel and .btn transparent, in save-editor.html too.
test('each registered colour has the same value in :root, so the two cannot drift', () => {
  const css = readFileSync(new URL('../src/ui.css', import.meta.url), 'utf8');
  const registered = [...css.matchAll(/@property (--[\w-]+)\s*\{[^}]*initial-value:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]);
  const root = css.match(/:root\s*\{([^}]*)\}/)[1];
  const declared = Object.fromEntries([...root.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
  assert.equal(registered.length, 14);
  for (const [name, value] of registered) assert.equal(declared[name], value, name);
  // Every colour the seasons change is among them, or it would not ease.
  for (const m of css.matchAll(/body\[data-screen=strategy\]\[data-season=s\d\]\s*\{([^}]*)\}/g)) for (const [, name] of m[1].matchAll(/(--[\w-]+):/g)) assert.ok(registered.some(([n]) => n === name), name);
});

let game, page;
test.before(async () => { game = await startGame({ width: 1440, height: 900 }); page = await game.open(); await newCampaign(page, '董卓'); await closeMessages(page); }, { timeout: 180000 });
test.after(async () => { await game?.close(); });

// The colours a panel is painted with, as the browser computes them.
const paint = () => page.evaluate(() => {
  const el = document.querySelector('.topbar'), css = getComputedStyle(el);
  return { panel: css.backgroundColor, rule: css.getPropertyValue('--rule').trim(), btn: css.getPropertyValue('--btn-a').trim(), season: document.body.dataset.season };
});
const toMonth = async (m) => {
  await page.evaluate((m) => { const { g, strategy } = window.__game; g.month = m; strategy.refresh(g); }, m);
  await page.waitForTimeout(2800); // the 2.5 s turn of the season
  return paint();
};

test('each season has its own colours, and months of one season share them', async () => {
  const seen = [];
  for (const m of [0, 3, 6, 9]) seen.push(await toMonth(m));
  assert.deepEqual(seen.map((s) => s.season), ['s0', 's1', 's2', 's3']);
  for (const k of ['panel', 'rule', 'btn']) assert.equal(new Set(seen.map((s) => s[k])).size, 4, `${k}: ${seen.map((s) => s[k])}`);
  const end = await toMonth(11);
  assert.deepEqual(end, seen[3], '十二月 is winter, as 十月');
});

test('the text stays readable on every season', async () => {
  const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const rgb = (s) => s.match(/[\d.]+/g).slice(0, 3).map(Number);
  for (const m of [0, 3, 6, 9]) {
    const { panel } = await toMonth(m), ink = await page.evaluate(() => getComputedStyle(document.querySelector('.topbar')).color);
    const a = lum(rgb(ink)), b = lum(rgb(panel));
    assert.ok((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 7, `month ${m}: ${ink} on ${panel}`);
  }
});

test('the war screen keeps every colour of the lacquer, whatever the month', async () => {
  await toMonth(3);
  const war = await page.evaluate(() => {
    document.body.dataset.screen = 'war';
    const css = getComputedStyle(document.body), probe = document.createElement('i'); document.body.append(probe);
    const out = Object.fromEntries(['--panel', '--lacquer', '--lacquer2', '--gold2', '--rule', '--btn-a', '--btn-b', '--btn-hi-a', '--btn-hi-b', '--btn-on', '--tag-bg', '--th-bg', '--menu-bg'].map((k) => {
      probe.style.color = css.getPropertyValue(k); return [k, getComputedStyle(probe).color];
    }));
    probe.remove(); document.body.dataset.screen = 'strategy';
    return out;
  });
  assert.deepEqual(war, {
    '--panel': 'rgba(22, 15, 10, 0.9)', '--lacquer': 'rgb(26, 18, 12)', '--lacquer2': 'rgb(36, 24, 15)', '--gold2': 'rgb(138, 106, 52)', '--rule': 'rgb(90, 68, 40)',
    '--btn-a': 'rgb(58, 42, 26)', '--btn-b': 'rgb(36, 24, 15)', '--btn-hi-a': 'rgb(76, 56, 32)', '--btn-hi-b': 'rgb(44, 30, 18)', '--btn-on': 'rgb(90, 58, 28)',
    '--tag-bg': 'rgba(18, 12, 8, 0.72)', '--th-bg': 'rgb(30, 21, 13)', '--menu-bg': 'rgba(14, 10, 8, 0.92)',
  });
});

test('a new season eases in, and a season already set does not', async () => {
  await toMonth(3);
  const turning = () => page.evaluate(() => document.body.classList.contains('season-turning'));
  await page.evaluate(() => { const { g, strategy } = window.__game; g.month = 4; strategy.refresh(g); });
  assert.equal(await turning(), false, 'another month of the same season');
  await page.evaluate(() => { const { g, strategy } = window.__game; g.month = 6; strategy.refresh(g); });
  assert.equal(await turning(), true, 'the season changed');
  await page.waitForTimeout(2800);
  assert.equal(await turning(), false, 'the easing is over');
});
