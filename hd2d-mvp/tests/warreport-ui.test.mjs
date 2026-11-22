// D40: the actual field-war ledger must agree with the faction check after returning to the map.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { startGame, newCampaign, closeMessages } from './game.mjs';
let game;
before(async () => { game = await startGame({ width: 1440, height: 900 }); });
after(() => game?.close());
for (const side of ['def', 'att']) test(`${side}: rice defeat without escape reports death and ronin before returning to the map`, async () => {
  const page = await game.open('&flat');
  const stop = closeMessages(page);
  try {
    await newCampaign(page, '曹操');
    const ids = await page.evaluate(side => {
      const { g, G, debug } = window.__game, ruler = g.factions[2].ruler, general = g.cities.flatMap(c => c.officers).find(id => id !== ruler && !G.isRuler(g, id)), enemy = g.factions[1].ruler;
      for (const c of g.cities) { c.faction = 1; c.officers = []; }
      g.cities[12].faction = side === 'att' ? 2 : 1; g.cities[12].officers = side === 'att' ? [ruler, general] : [enemy];
      g.cities[14].faction = side === 'def' ? 2 : 1; g.cities[14].officers = side === 'def' ? [ruler, general] : [enemy]; g.cities[14].rice = 500;
      for (const id of [ruler, general, enemy]) Object.assign(g.officers[id], { status: G.SERVING, soldiers: 500 });
      const army = [...g.cities[12].officers], war = debug.setupWar(g, { from: 12, to: 14, ids: army, commander: army[0], gold: 50, rice: 500 });
      g.cities[12].faction = 1;
      debug.fieldWar(war, side);
      return { ruler, general, rulerName: G.name(ruler), generalName: G.name(general) };
    }, side);
    await page.waitForFunction(() => window.__game.war?.st.deploying, null, { timeout: 30000 });
    await page.evaluate(() => window.__game.war.finishDeploy());
    await page.waitForFunction(() => { const w = window.__game.war; return w.field.turn === w.field.human && !w.st.busy && !document.querySelector('.banner, .panel.msg'); }, null, { timeout: 30000 });
    await page.evaluate(() => {
      const w = window.__game.war, f = w.field;
      f.chest(f.human).rice = 0;
      // The real daily rice check, then release the presentation's waiting human turn.
      f.turn = 'def'; f.endTurn(); f.turn = f.human; w.endTurn();
    });
    await page.locator('.ledgers').waitFor({ timeout: 30000 });
    const rulerRow = page.locator('.lrow').filter({ hasText: ids.rulerName }), generalRow = page.locator('.lrow').filter({ hasText: ids.generalName });
    assert.match(await rulerRow.locator('.fate').textContent(), /无路可退.*身亡/);
    assert.match(await generalRow.locator('.fate').textContent(), /下野.*豫州/);
    assert.match(await rulerRow.locator('.tr').textContent(), /500 → 0/);
    if (process.env.REPORT_CAPTURE) {
      mkdirSync(process.env.REPORT_CAPTURE, { recursive: true });
      await page.screenshot({ path: `${process.env.REPORT_CAPTURE}/report-${side}-1440x900.png` });
      await page.setViewportSize({ width: 800, height: 600 });
      await page.screenshot({ path: `${process.env.REPORT_CAPTURE}/report-${side}-800x600.png` });
    }
    await page.getByRole('button', { name: '返回大地图', exact: true }).click();
    await page.waitForFunction(id => window.__game.g.officers[id].status === window.__game.G.DEAD, ids.ruler, { timeout: 30000 });
    const actual = await page.evaluate(ids => { const { g, G } = window.__game; return { dead: g.officers[ids.ruler].status === G.DEAD, ronin: g.officers[ids.general].status === G.RONIN, loc: G.cityName(g.officers[ids.general].loc) }; }, ids);
    assert.deepEqual(actual, { dead: true, ronin: true, loc: '豫州' });
    assert.deepEqual(page.errors, []);
  } finally { stop(); await page.close(); }
});

// D159 (冰@devblog #611): 扬州 → 建安, 孙策 behind 陈武 on his last city with no way out. The report says 下野 and where,
// and back on the map he is still 下野 there while his house has fallen.
test('AI ruler behind his 太守 on his last city: the report and the map both keep him 下野', async () => {
  const page = await game.open('&flat');
  const stop = closeMessages(page);
  try {
    await newCampaign(page, '刘备');
    await page.evaluate(() => {
      const { g, G, debug } = window.__game;
      for (const c of g.cities) { c.faction = G.NONE; c.officers = []; }
      const put = (id, f, ids) => { g.cities[id].faction = f; g.cities[id].officers = ids; for (const i of ids) Object.assign(g.officers[i], { status: G.SERVING, soldiers: 500 }); };
      put(16, 4, [222, 144]); put(17, 3, [158, 164, 138]); put(15, 2, [131]); put(20, 2, [86]); put(18, 2, [99]);
      g.factions[3].city = 17; g.cities[17].rice = 500;
      const war = debug.setupWar(g, { from: 16, to: 17, ids: [222], commander: 222, gold: 0, rice: 500 });
      debug.fieldWar(war, 'att');
    });
    await page.waitForFunction(() => window.__game.war?.st.deploying, null, { timeout: 30000 });
    await page.evaluate(() => window.__game.war.finishDeploy());
    await page.waitForFunction(() => { const w = window.__game.war; return w.field.turn === w.field.human && !w.st.busy && !document.querySelector('.banner, .panel.msg'); }, null, { timeout: 30000 });
    await page.evaluate(() => {
      const w = window.__game.war, f = w.field;
      f.chest('def').rice = 0;
      f.turn = 'def'; f.endTurn(); f.turn = f.human; w.endTurn();
    });
    await page.locator('.ledgers').waitFor({ timeout: 30000 });
    const fate = (n) => page.locator('.lrow').filter({ hasText: n }).locator('.fate').textContent();
    assert.equal(await fate('孙策'), '下野（建安）');
    assert.equal(await fate('陈武'), '下野（建安）');
    if (process.env.REPORT_CAPTURE) {
      mkdirSync(process.env.REPORT_CAPTURE, { recursive: true });
      await page.screenshot({ path: `${process.env.REPORT_CAPTURE}/report-ronin-ruler-1440x900.png` });
    }
    await page.getByRole('button', { name: '返回大地图', exact: true }).click();
    await page.waitForFunction(() => window.__game.g.factions[3].ruler == null, null, { timeout: 30000 });
    const actual = await page.evaluate(() => { const { g, G } = window.__game; return { ronin: g.officers[138].status === G.RONIN, loc: G.cityName(g.officers[138].loc), fallen: g.factions[3].fallen, city: g.cities[17].faction }; });
    assert.deepEqual(actual, { ronin: true, loc: '建安', fallen: 138, city: 4 });
    if (process.env.REPORT_CAPTURE) await page.screenshot({ path: `${process.env.REPORT_CAPTURE}/map-after-ronin-ruler-1440x900.png` });
    assert.deepEqual(page.errors, []);
  } finally { stop(); await page.close(); }
});
