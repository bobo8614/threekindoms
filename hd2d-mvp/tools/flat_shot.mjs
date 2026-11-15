// Screenshot the flat painted war map (src/warmap2d.js) for review: a new game, 曹操's side marched on
// the city in the given month, deployment skipped, the commander selected so his reach shows.
//   node hd2d-mvp/tools/flat_shot.mjs <out.png> [--city 4] [--month 3] [--url …] [--size 1440x900] [--hover x,y]
import { launchChrome } from './headless.mjs';
import { openWar, cellPx } from './flat_setup.mjs';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = process.argv[2], URL = arg('--url', 'http://localhost:8679/hd2d-mvp/'), city = Number(arg('--city', 4)), month = Number(arg('--month', 3));
const [VW, VH] = arg('--size', '1440x900').split('x').map(Number);
const browser = await launchChrome(URL);
const page = await openWar(browser, { url: URL, city, month, size: [VW, VH], dpr: Number(arg('--dpr', 1)) });
const dump = arg('--dump', ''); if (dump) {
  const b64 = await page.evaluate(() => window.__game.war.composite().toDataURL('image/png').split(',')[1]);
  (await import('node:fs')).writeFileSync(dump, Buffer.from(b64, 'base64')); console.log('map', dump);
  if (process.argv.includes('--dump-only')) { await browser.close(); process.exit(0); }
}
// Select the commander by clicking his cell on screen, as a player would.
const at = await page.evaluate(() => { const w = window.__game.war, u = w.field.side(w.field.human).find((x) => x.commander) ?? w.field.side(w.field.human)[0]; return [u.x, u.y]; });
const [px, py] = await cellPx(page, ...at);
await page.mouse.click(px, py); await page.waitForTimeout(600);
const mv = arg('--move', ''); if (mv) {
  const [mx, my] = await cellPx(page, ...mv.split(',').map(Number)); await page.mouse.click(mx, my);
  await page.waitForFunction(() => !window.__game.war.st.busy, null, { timeout: 20000 }); await page.waitForTimeout(400);
  console.log('after move', await page.evaluate(() => { const w = window.__game.war, u = w.field.side(w.field.human).find((x) => x.commander); return [u.x, u.y, w.field.pool[w.field.human]]; }));
}
const hv = arg('--hover', ''); if (hv) { const [hx, hy] = await cellPx(page, ...hv.split(',').map(Number)); await page.mouse.move(hx, hy); await page.waitForTimeout(500); }
for (const e of page.errors) console.error(e);
await page.screenshot({ path: out });
console.log('saved', out);
await browser.close();
