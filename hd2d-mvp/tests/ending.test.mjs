// The ending: what the 统一度 lets the player see, in order, with the people thanked whatever the score; and the two
// other ways a game ends. Played through the real end of turn, with clicks.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startGame, newCampaign, saveCampaign } from './game.mjs';

let game;
before(async () => { game = await startGame(); });
after(() => game?.close());

// Ends the game with the whole realm the player's and this result, up to the congratulation; returns the page.
async function finish(over) {
  const p = await game.open('&flat'); await newCampaign(p);
  await p.evaluate((o) => { const { g } = window.__game; for (const c of g.cities) c.faction = g.player; g.over = o; }, over);
  await p.locator('.endturn .btn').click();
  await p.locator('.shade .btn.primary').last().click();
  return p;
}
const click = (p) => p.mouse.click(640, 400);
// Everything shown from here to the title: the paintings in order, what appeared on them.
async function playThrough(p) {
  const seen = { shots: [], cards: [], wall: new Set(), hall: null, credits: null, msg: null };
  for (let i = 0; i < 1200; i++) {
    const now = await p.evaluate(() => {
      const m = document.querySelector('.panel.msg'), e = document.querySelector('.ending'), shots = [...document.querySelectorAll('.end-shot')];
      return { title: document.body.dataset.screen === 'title' && !e, msg: m && { text: m.textContent, src: m.querySelector('img')?.getAttribute('src') }, shot: shots.at(-1)?.style.backgroundImage.match(/ending[^")]*\.webp/)?.[0],
        card: document.querySelector('.end-card')?.dataset.id, wall: [...document.querySelectorAll('.end-wall-one')].map((n) => +n.dataset.id),
        hall: document.querySelector('.end-result')?.textContent, score: document.querySelector('.end-result')?.dataset.score, credits: document.querySelector('.end-credits')?.textContent, fin: !!document.querySelector('.end-fin.in') };
    });
    if (now.title) return seen;
    if (now.msg) { seen.msg ||= now.msg; await p.evaluate(() => document.querySelector('.panel.msg')?.click()); await p.waitForTimeout(120); continue; }
    if (now.shot && seen.shots.at(-1) !== now.shot) seen.shots.push(now.shot);
    if (now.card != null && seen.cards.at(-1) !== +now.card) seen.cards.push(+now.card);
    now.wall.forEach((id) => seen.wall.add(id));
    seen.hall ||= now.hall; seen.credits ||= now.credits;
    await click(p); await p.waitForTimeout(150);
  }
  throw new Error(`the ending did not reach the title: ${JSON.stringify(seen)}`);
}
const thanks = readFileSync(new URL('../data/thanks.txt', import.meta.url), 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
function checkThanks(credits) {
  for (const line of thanks) assert.ok(credits.includes(line), `${line} is thanked`);
  assert.ok(credits.lastIndexOf('tianlin@GitHub') > credits.indexOf(thanks.at(-1)), 'the maker comes last');
}

test('under 40: the hall, then the thanks', async () => {
  const p = await finish({ type: 'unify', score: 30 }), seen = await playThrough(p);
  assert.deepEqual(seen.shots, ['ending/hall.webp']);
  assert.deepEqual(seen.cards, []);
  assert.match(seen.hall, /统一度30/); assert.match(seen.hall, /40 分/);
  checkThanks(seen.credits);
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

test('from 40: the dawn and the court first, still no roll', async () => {
  const p = await finish({ type: 'unify', score: 40 }), seen = await playThrough(p);
  assert.deepEqual(seen.shots, ['ending/dawn.webp', 'ending.webp', 'ending/hall.webp']);
  assert.deepEqual(seen.cards, []);
  assert.match(seen.hall, /70 分/);
  checkThanks(seen.credits);
  await p.context().close();
});

test('from 70: everything, and every officer is seen, the ruler first', async () => {
  const p = await finish({ type: 'unify', score: 70 });
  const { ruler, officers, smart } = await p.evaluate(() => { const { g, G } = window.__game, r = g.factions[g.player].ruler; return { ruler: r, officers: [...new Set(g.cities.flatMap((c) => c.officers))].filter((id) => id !== r), smart: G.evaluator(g) }; });
  const seen = await playThrough(p);
  assert.deepEqual(seen.shots, ['ending/dusk.webp', 'ending/dawn.webp', 'ending.webp', 'ending/hall.webp']);
  assert.match(seen.msg.src, new RegExp(`faces/${smart}-joy`), 'the sharpest officer congratulates');
  assert.equal(seen.cards[0], ruler);
  assert.equal(seen.cards.length, 13);
  assert.deepEqual([...new Set([...seen.cards.slice(1), ...seen.wall])].sort((a, b) => a - b), [...officers].sort((a, b) => a - b));
  assert.doesNotMatch(seen.hall, /结局还有更多/);
  checkThanks(seen.credits);
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

test('the result waits for the player: no click, no thanks', async () => {
  const p = await finish({ type: 'unify', score: 30 });
  await p.waitForFunction(() => { const m = document.querySelector('.panel.msg'); if (m) m.click(); return document.querySelector('.end-result.in'); }, null, { timeout: 30000 });
  await p.waitForTimeout(9000);
  assert.ok(await p.locator('.end-result').count(), 'still on the result');
  await p.context().close();
});

for (const [type, heading] of [['gameover', '霸业成空'], ['talent', '人才凋零']]) test(`${type}: its painting, then the title`, async () => {
  const p = await finish({ type });
  await p.waitForFunction(() => document.querySelector('.end-fall.in'), null, { timeout: 30000 });
  assert.match(await p.locator('.end-fall').textContent(), new RegExp(heading));
  for (let i = 0; i < 40 && await p.locator('.ending').count(); i++) { await click(p); await p.waitForTimeout(250); }
  await p.waitForFunction(() => document.body.dataset.screen === 'title' && !document.querySelector('.ending'), null, { timeout: 15000 });
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

// After an ending the title's 继续记录 starts the record afresh: the log of the game just finished (its wars, the
// factions it saw fall) must not carry over into it.
test('a record continued after an ending does not show the finished game\'s log', async () => {
  const p = await game.open('&flat'); await newCampaign(p);
  await saveCampaign(p);
  await p.evaluate(() => window.__game.io.event({ type: 'aiAlliance', faction: 1, target: 2 }));
  await p.waitForFunction(() => document.querySelector('.logbox')?.textContent.includes('结盟'));
  await p.evaluate(() => { const { g } = window.__game; for (const c of g.cities) c.faction = g.player; g.over = { type: 'gameover' }; });
  await p.locator('.endturn .btn').click();
  await p.locator('.shade .btn.primary').last().click();
  await p.waitForFunction(() => document.querySelector('.end-fall.in'), null, { timeout: 30000 });
  for (let i = 0; i < 40 && await p.locator('.ending').count(); i++) { await click(p); await p.waitForTimeout(250); }
  await p.waitForFunction(() => document.body.dataset.screen === 'title' && !document.querySelector('.ending'), null, { timeout: 15000 });
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  await p.getByText('继续记录').click();
  await p.waitForFunction(() => { const g = window.__game.g; return document.body.dataset.screen === 'strategy' && g?.current === g.player && !document.querySelector('.aiturn, .panel.msg'); }, null, { timeout: 30000 });
  assert.doesNotMatch(await p.locator('.logbox').textContent(), /结盟/);
  assert.deepEqual(p.errors, []);
  await p.context().close();
});
