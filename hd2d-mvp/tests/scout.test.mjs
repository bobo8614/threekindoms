// 侦察 (虚名如浮云@小红书): one 命令书 opens a session in which any number of cities can be inspected.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startGame, newCampaign, cmd } from './game.mjs';

let game, page, cities;
before(async () => {
  game = await startGame({ width: 1440, height: 900 });
  page = await game.open('', { setup: (ctx) => ctx.addInitScript(() => {
    const pad = { id: 'Xbox Wireless Controller', index: 0, mapping: 'standard', connected: true, timestamp: 0,
      axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
    Object.defineProperty(navigator, 'getGamepads', { value: () => [pad, null, null, null] });
    window.__scoutPad = { set(i, on) { pad.buttons[i] = { pressed: on, touched: on, value: on ? 1 : 0 }; pad.timestamp = performance.now(); } };
  }) });
  await page.evaluate(async () => { (await import('./src/pace.js')).setPace(4); (await import('./src/vignette.js')).setVignettes(false); });
  await newCampaign(page);
  cities = await page.evaluate(() => {
    const { g, G } = window.__game, home = g.factions[g.player].city;
    const foes = g.cities.filter((c) => c.faction !== g.player && c.faction !== G.NONE && c.officers.length);
    const near = foes.find((c) => G.roads(home).includes(c.id)) ?? foes[0];
    const far = foes.find((c) => c.id !== near.id && !G.roads(home).includes(c.id));
    const empty = g.cities.find((c) => c.faction === G.NONE);
    return Object.fromEntries(Object.entries({ home: g.cities[home], near, far, empty }).map(([key, c]) => [key, c && { id: c.id, name: G.cityName(c.id) }]));
  });
  assert.ok(cities.near && cities.far && cities.empty, JSON.stringify(cities));
});
after(async () => { await game?.close(); });

const books = () => page.evaluate(() => window.__game.g.books);
// Off the phone the city panel on the left is the report (霸王之王@devblog, 2026-11-25): the picker stays up for the whole
// session, a city picked shows in the panel, and no window repeats its numbers and officers over the map.
const picker = () => page.getByRole('dialog', { name: '侦察中', exact: true });
const shows = (city) => page.waitForFunction((n) => document.querySelector('.citypanel h2')?.textContent === n, city.name);
// With the mouse the picker has no list (app.js pickOnMap list: false, 阿拉神丁@qq 2026-11-19): a key brings it back, as for a player on the keys.
const choose = async (city) => {
  await page.keyboard.press('Tab');
  const b = picker().getByRole('button', { name: city.name, exact: true });
  await b.focus(); await page.keyboard.press('Enter'); await shows(city);
};
const begin = async () => {
  await cmd(page, '军', '侦察');
  // Wait for either the old picker or the intended confirmation so the red test fails on behavior, not timing.
  await page.locator('.mappick, .modal[aria-label="侦察"]').first().waitFor({ timeout: 10000 });
  assert.equal(await page.locator('.modal[aria-label="侦察"]').count(), 1, 'the command is confirmed before a city is chosen');
};
const ended = () => page.waitForFunction(() => !document.querySelector('.shade, .mappick') && !document.body.classList.contains('scouting'));
const endButton = () => picker().getByRole('button', { name: /^结束侦察/ });

// The ROM charges before selecting a city. Each city can be inspected, including an unconnected enemy, our own city and an empty one.
test('one scout command can inspect several cities in the city panel, with no window over the map', async () => {
  await page.evaluate(() => { window.__game.g.books = 3; });
  await begin();
  assert.match(await page.locator('.modal[aria-label="侦察"] p').first().textContent(), /消耗一张命令书/);
  await page.locator('.modal[aria-label="侦察"] .btn', { hasText: '取消' }).click();
  assert.equal(await books(), 3, 'cancelling before confirmation costs nothing');
  await begin();
  await page.locator('.modal[aria-label="侦察"] .btn.primary').click();
  await picker().waitFor();
  assert.equal(await books(), 2, 'the one book is spent before the first city');
  assert.equal(await page.locator('body > .toast').count(), 0, 'the payment toast does not cover the city picker');

  for (const [i, city] of [cities.near, cities.far, cities.home, cities.empty].entries()) {
    await choose(city);
    assert.equal(await books(), 2, `${city.name} costs no additional book`);
    assert.equal(await page.locator('.shade').count(), 0, `${city.name} opens no window of its own`);
    assert.equal(await picker().count(), 1, 'the picker stays up for the next city');
    const panel = page.locator('.citypanel');
    assert.ok(await panel.locator('.stats [data-k="金"]').count(), `${city.name} shows its city stats in the panel`);
    assert.ok(await panel.locator('.scouting-tag').count(), 'the panel says it is the scout report');
    assert.equal(await panel.evaluate((e) => getComputedStyle(e).opacity), '1', 'the report is not dimmed with the rest of the HUD');
    assert.match(await picker().textContent(), new RegExp(`${city.name}的情报在左侧`));
    if (i === 0) {
      const row = panel.locator('.roster .off').first();
      assert.ok(await row.count(), 'the enemy roster is visible');
      assert.match(await row.locator('.army').textContent(), /^.军$/, 'each officer row names his 军');
      await row.click();
      assert.equal(await page.locator('.shade').count(), 1, 'an officer can be inspected without ending the session');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('.shade'));
      assert.equal(await picker().count(), 1, 'closing the officer leaves the session open');
    }
    if (city === cities.empty) assert.equal(await panel.locator('.roster .off').count(), 0);
  }
  await endButton().click();
  await ended();
  assert.equal(await books(), 2);
  assert.equal(await page.evaluate(() => window.__game.g.current === window.__game.g.player), true);
  assert.equal(await page.locator('.citypanel .scouting-tag').count(), 0, 'the panel is an ordinary one again');
  const revealed = await page.evaluate(([a, b]) => [window.__game.g.scouted?.[a], window.__game.g.scouted?.[b]], [cities.near.id, cities.far.id]);
  assert.ok(revealed.every((x) => Number.isInteger(x)), `both enemy cities are remembered: ${revealed}`);
});

test('the city picker isolates the rest of the HUD and returns from an overlapping dialog safely', async () => {
  await page.evaluate((name) => {
    window.__game.g.books = 3;
    [...document.querySelectorAll('.ctag')].find((e) => e.textContent.includes(name)).click();
  }, cities.home.name);
  await begin(); await page.locator('.modal[aria-label="侦察"] .btn.primary').click();
  await picker().waitFor();
  const sys = await page.locator('.sysbtns').first().boundingBox();
  await page.mouse.click(sys.x + sys.width / 2, sys.y + sys.height / 2);
  assert.equal(await page.locator('.sysmenu-list:not([hidden])').count(), 0, 'the rest of the HUD waits while picking a city');
  assert.equal(await picker().count(), 1);
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => !!(document.querySelector('.mappick')?.contains(document.activeElement) || document.querySelector('.citypanel')?.contains(document.activeElement))), true,
      'Tab stays inside the picker and the report instead of reaching 系统');
  }
  await page.evaluate(async () => {
    const { h, modal } = await import('./src/ui.js');
    modal('上层窗口', (close) => h('button', { class: 'btn', onclick: () => close() }, '关闭'));
  });
  await page.getByRole('dialog', { name: '上层窗口' }).waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog', { name: '上层窗口' }).count(), 0, 'Escape closes the topmost dialog');
  assert.equal(await picker().count(), 1, 'the picker remains open underneath');
  assert.equal(await page.getByRole('dialog', { name: '结束侦察' }).count(), 0, 'the picker did not intercept that Escape');
  await page.mouse.move(5, 890); // the mouse again, so the picker hides its list of names
  const reachable = () => page.evaluate((home) => {
    const { g, G } = window.__game;
    for (const el of document.querySelectorAll('.ctag.cand')) {
      const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight || !el.contains(document.elementFromPoint(x, y))) continue;
      const c = g.cities.find((c) => el.textContent.startsWith(G.cityName(c.id)));
      if (c && c.id !== home) return { id: c.id, name: G.cityName(c.id), x, y };
    }
    return null;
  }, cities.home.id);
  let mapCity = await reachable();
  assert.ok(mapCity, 'a highlighted city is reachable on the map');
  // A drag that begins on a highlighted tag moves the map and picks nothing (D52).
  await page.mouse.move(mapCity.x, mapCity.y); await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(mapCity.x + 15 * i, mapCity.y + 8 * i);
  await page.mouse.up(); await page.waitForTimeout(300);
  assert.equal(await page.locator('.citypanel h2').textContent(), cities.home.name, 'a drag from a candidate picks nothing');
  assert.equal(await picker().count(), 1);
  await page.waitForTimeout(1200);
  mapCity = await reachable(); // the drag moved the map: a tag may now be under the log or off screen
  assert.ok(mapCity);
  await page.mouse.click(mapCity.x, mapCity.y);
  await shows(mapCity);
  assert.equal(await page.locator('.ctag.cand').count() > 1, true, 'the cities still glow for the next pick');
  await endButton().click();
  await ended();
  assert.equal(await books(), 2);
  await page.evaluate((name) => [...document.querySelectorAll('.ctag')].find((e) => e.textContent.includes(name)).click(), cities.home.name);
  await page.locator('.citypanel .roster .off').first().click();
  assert.equal(await page.locator('.shade').count(), 1, 'the HUD works again after the picker closes');
  await page.keyboard.press('Escape');
});

test('a gamepad can pick cities, read the officers in the panel and end scouting', async () => {
  await page.evaluate((name) => {
    window.__game.g.books = 3;
    [...document.querySelectorAll('.ctag')].find((e) => e.textContent.includes(name)).click();
  }, cities.home.name);
  await begin(); await page.locator('.modal[aria-label="侦察"] .btn.primary').click();
  await picker().waitFor(); await choose(cities.near);
  const tap = async (i) => {
    await page.evaluate((i) => window.__scoutPad.set(i, true), i); await page.waitForTimeout(80);
    await page.evaluate((i) => window.__scoutPad.set(i, false), i); await page.waitForTimeout(240);
  };
  await page.waitForTimeout(250); await tap(3); // Y: 看武将
  await page.waitForFunction(() => document.activeElement?.matches('.citypanel .roster .off'));
  await tap(13); // down
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('.citypanel .roster .off')].indexOf(document.activeElement)), 1, 'the pad walks the officers');
  await tap(0); // A: his card
  await page.locator('.shade').waitFor();
  await tap(1); // B: the card closes
  await page.waitForFunction(() => !document.querySelector('.shade'));
  await page.waitForTimeout(200); await tap(1); // B: back to the picker
  await page.waitForFunction(() => document.querySelector('.mappick')?.contains(document.activeElement));
  assert.equal(await picker().count(), 1, 'B from the officers does not end the session');
  const next = await page.evaluate(() => {
    const names = [...document.querySelectorAll('.mappick .chips .btn:not(.ghost):not(.keep-in)')], here = document.querySelector('.citypanel h2').textContent;
    const b = names.find((x) => x.textContent.trim() !== here); b.focus(); return b.textContent.trim();
  });
  await page.waitForTimeout(200); await tap(0); // A selects the focused city
  await shows({ name: next });
  assert.equal(await books(), 2);
  await endButton().focus();
  await page.waitForTimeout(200); await tap(0);
  await ended();
  assert.equal(await books(), 2);
});

test('the scout vignette plays once for a session even when several cities are inspected', async () => {
  await page.evaluate(async (name) => {
    (await import('./src/vignette.js')).setVignettes(true);
    window.__game.g.books = 3;
    [...document.querySelectorAll('.ctag')].find((e) => e.textContent.includes(name)).click();
    window.__scoutShows = 0;
    window.__scoutObserver = new MutationObserver((changes) => {
      for (const change of changes) for (const n of change.addedNodes) if (n.matches?.('.vig[data-scene="scout"]')) window.__scoutShows++;
    });
    window.__scoutObserver.observe(document.body, { childList: true });
  }, cities.home.name);
  try {
    await begin(); await page.locator('.modal[aria-label="侦察"] .btn.primary').click();
    await page.waitForSelector('.vig[data-scene="scout"]', { timeout: 10000 });
    await picker().waitFor({ timeout: 10000 });
    await choose(cities.near); await choose(cities.far);
    assert.equal(await page.evaluate(() => window.__scoutShows), 1, 'the picture is not replayed for another city');
    assert.equal(await books(), 2);
    await endButton().click(); await ended();
  } finally {
    await page.evaluate(async () => { window.__scoutObserver.disconnect(); (await import('./src/vignette.js')).setVignettes(false); });
  }
});

test('a full city keeps the report readable and the picker usable in a small window', async () => {
  await page.setViewportSize({ width: 800, height: 600 });
  const previous = await page.evaluate(({ home, target }) => {
    const { g } = window.__game, city = g.cities[target], before = city.officers.slice();
    city.officers = [...new Set([...city.officers, ...g.cities.flatMap((c) => c.officers)])].slice(0, 10);
    g.books = 3;
    [...document.querySelectorAll('.ctag')].find((e) => e.textContent.includes(home)).click();
    return before;
  }, { home: cities.home.name, target: cities.near.id });
  try {
    await begin(); await page.locator('.modal[aria-label="侦察"] .btn.primary').click();
    await picker().waitFor(); await choose(cities.near);
    await page.mouse.move(400, 590); // the mouse: the names fold away
    const layout = await page.evaluate(() => {
      const r = (e) => { const b = e.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom }; };
      const panel = document.querySelector('.citypanel'), end = [...document.querySelectorAll('.mappick .btn')].find((b) => b.textContent.startsWith('结束侦察'));
      const last = [...panel.querySelectorAll('.roster .off')].at(-1);
      return { panel: r(panel), picker: r(document.querySelector('.mappick')), end: r(end), scroll: [panel, panel.querySelector('.roster')].some((e) => e.scrollHeight > e.clientHeight) || r(last).bottom <= innerHeight, rows: panel.querySelectorAll('.roster .off').length, h: innerHeight, w: innerWidth };
    });
    assert.ok(layout.end.bottom <= layout.h && layout.end.right <= layout.w, `结束侦察 stays in view: ${JSON.stringify(layout)}`);
    assert.ok(layout.picker.left >= layout.panel.right - 1 || layout.picker.top >= layout.panel.bottom - 1, `the picker does not cover the report: ${JSON.stringify(layout)}`);
    assert.ok(layout.rows === 10 && layout.scroll, `all ten officers can be reached: ${JSON.stringify(layout)}`);
  } finally {
    await page.evaluate(({ id, previous }) => {
      [...document.querySelectorAll('.mappick .btn')].find((b) => b.textContent.startsWith('结束侦察'))?.click();
      window.__game.g.cities[id].officers = previous;
    }, { id: cities.near.id, previous });
    await ended();
    await page.setViewportSize({ width: 1440, height: 900 });
  }
});

// A spent last book must not hand the turn to AI until the player explicitly finishes the scout session.
test('the last book holds the turn throughout scouting and asks before Esc quits the city picker', async () => {
  await page.evaluate((name) => {
    const { g } = window.__game; g.books = 1;
    [...document.querySelectorAll('.ctag')].find((e) => e.textContent.includes(name)).click();
  }, cities.home.name);
  await begin(); await page.locator('.modal[aria-label="侦察"] .btn.primary').click();
  await picker().waitFor();
  assert.equal(await books(), 0);
  const stillMine = () => page.evaluate(() => window.__game.g.current === window.__game.g.player && !document.body.classList.contains('handoff'));
  assert.equal(await stillMine(), true, 'the player can still choose a city after spending the last book');
  await choose(cities.near);
  assert.equal(await stillMine(), true);
  await page.keyboard.press('Escape');
  const quit = page.getByRole('dialog', { name: '结束侦察', exact: true });
  await quit.waitFor();
  await quit.getByRole('button', { name: '取消', exact: true }).click();
  await picker().waitFor();
  assert.equal(await stillMine(), true, 'cancel keeps the session open');
  await choose(cities.far);
  await endButton().click();
  await page.waitForFunction(() => document.body.classList.contains('handoff') || window.__game.g.current !== window.__game.g.player, null, { timeout: 10000 });
  assert.deepEqual(page.errors, []);
});

// The phone keeps the 侦察 window: its city panel folds away while a city is picked (phone.css), so the window is the report there.
test('on the phone each city still opens the scout window, and the session goes on until 结束侦察', async () => {
  const phone = await startGame({ width: 812, height: 375 });
  try {
    const p = await phone.open('&phone');
    await p.evaluate(async () => { (await import('./src/pace.js')).setPace(4); (await import('./src/vignette.js')).setVignettes(false); });
    await newCampaign(p);
    await p.evaluate(() => { window.__game.g.books = 1; });
    await cmd(p, '军', '侦察');
    await p.locator('.modal[aria-label="侦察"] .btn.primary').click();
    const pick = p.getByRole('dialog', { name: '侦察哪座城？', exact: true });
    const view = (c) => p.getByRole('dialog', { name: `侦察：${c.name}`, exact: true });
    await pick.waitFor();
    assert.equal(await p.locator('body.scouting').count(), 0, 'the desktop session is not used on the phone');
    await pick.getByRole('button', { name: cities.near.name, exact: true }).click();
    await view(cities.near).waitFor();
    assert.ok(await view(cities.near).locator('.stats [data-k="金"]').count(), 'the window shows the city stats');
    assert.ok(await view(cities.near).locator('tr[data-id]').count(), 'and its officers');
    await view(cities.near).getByRole('button', { name: '继续侦察', exact: true }).click();
    await pick.waitFor();
    assert.equal(await p.evaluate(() => window.__game.g.current === window.__game.g.player), true, 'the last book holds the turn');
    await pick.getByRole('button', { name: cities.far.name, exact: true }).click();
    await view(cities.far).waitFor();
    await view(cities.far).getByRole('button', { name: '结束侦察', exact: true }).click();
    await p.waitForFunction(() => document.body.classList.contains('handoff') || window.__game.g.current !== window.__game.g.player, null, { timeout: 10000 });
    assert.deepEqual(p.errors, []);
  } finally { await phone.close(); }
});
