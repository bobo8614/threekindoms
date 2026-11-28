// Browser regression for the strategy turn's two exits (adversarial review R1/R2), muted:
//   fall-books  刘备 marches every officer out of his only city and loses them all with books left:
//               the game must reach the 霸业成空 screen (no HUD error, the player's turn released).
//   fall-last   the same with the expedition spending the last book.
//   handoff     the last book goes on 开发 (the city stays selected); while the 命令书用尽 banner plays, 分兵 (free) must not open
//               and the AI's turn must begin.
//   node hd2d-mvp/tools/endgame_check.mjs [--url http://localhost:8677/hd2d-mvp/] [--only fall-books,handoff] [--shots dir]
// Needs the dev server (python3 hd2d-mvp/tools/serve.py <port>) and Playwright, like tactical_capture.mjs.
import { launchChrome } from './headless.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const URL = arg('--url', 'http://localhost:8677/hd2d-mvp/');
const only = arg('--only', 'fall-books,fall-last,handoff').split(','), shots = arg('--shots'); // --shots <dir>: stills of each check's last screen
const shot = (page, n) => shots && page.screenshot({ path: `${shots}/${n}.jpg`, quality: 85 });
const browser = await launchChrome(URL);
let bad = 0;

async function open() {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && errors.push(m.text()));
  await page.goto(URL + (URL.includes('?') ? '&' : '?') + 'mute'); await page.waitForFunction(() => window.__game?.debug);
  await page.getByText('新的征程').click(); await page.waitForTimeout(600);
  await page.locator('.ruler', { hasText: '刘备' }).click(); await page.locator('.ruler', { hasText: '刘备' }).click();
  // The 出征 message, then the player's turn with the dock up.
  // The 出征 message and anything the factions moving first raise, until the player's dock is up.
  await until(page, () => { const G = window.__game; return G.g?.current === G.g?.player && !!document.querySelector('.dock'); });
  await page.waitForTimeout(2500); // the turn banner
  return { page, errors };
}
// Waits for pred in the page, reading past story messages (.msg) and 命令演出 (.vig: 出阵 plays one, and at 原版 it waits
// for a key) on the way; false on timeout.
async function until(page, pred, arg, ms = 60000) {
  for (const end = Date.now() + ms; Date.now() < end;) {
    if (!(await page.locator('.msg, .vig').count()) && (await page.evaluate(pred, arg))) return true;
    if (await page.locator('.msg, .vig').count()) await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }
  return false;
}
// Press the dock tab keys until the command's button shows, then click it.
async function dock(page, act) {
  for (let i = 1; i <= 5; i++) {
    const b = page.locator('.dock .acts button', { hasText: act });
    if (await b.count()) return b.first().click();
    await page.keyboard.press(String(i)); await page.waitForTimeout(150);
  }
  throw new Error(`no ${act} in the dock`);
}
const report = (name, ok, detail) => { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'BAD '} ${name}${detail ? `  ${detail}` : ''}`); };

async function fall(name, books) {
  const { page, errors } = await open();
  await page.evaluate((n) => { window.__game.g.books = n; }, books);
  await dock(page, '出阵');
  await page.locator('.mappick .chips button', { hasText: '将' }).first().click();
  await page.locator('.modal button', { hasText: /全选|选前/ }).click(); await page.locator('.modal .btn.primary', { hasText: '确定' }).click();
  if (await page.locator('.modal', { hasText: '任命总大将' }).count()) await page.locator('.modal tr[data-id]').first().click();
  await page.locator('.modal .btn.primary', { hasText: '出阵' }).click();
  if (!(await until(page, () => !!window.__game.war?.st))) throw new Error('the war did not open');
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__game.war.finishDeploy());
  await until(page, () => { const w = window.__game.war; return w.field.turn === w.field.human && !w.st.busy; });
  // Every one of ours falls on the field and the war is lost.
  await page.evaluate(() => { const w = window.__game.war, f = w.field; for (const u of f.side(f.human)) { u.fate = 'dead'; u.gone = true; } f.end(f.human, 'commander'); w.endTurn(); });
  await page.locator('.modal .btn.primary', { hasText: '返回大地图' }).click({ timeout: 30000 });
  const ended = await until(page, () => [...document.querySelectorAll('.end-fall h2')].some((e) => e.textContent.includes('霸业成空')), null, 30000);
  await shot(page, name);
  const st = await page.evaluate(() => ({ over: window.__game.g?.over?.type, books: window.__game.g?.books }));
  report(name, ended && !errors.length, `ending=${ended} over=${st.over} books=${st.books}${errors.length ? ` errors: ${errors.join(' | ')}` : ''}`);
  await page.context().close();
}

async function handoff() {
  const { page, errors } = await open();
  await page.evaluate(() => { window.__game.g.books = 1; });
  await dock(page, '开发');
  await page.locator('.modal .cities button').first().click();
  await page.locator('.modal tr[data-id]').first().click();
  await page.locator('.modal .btn.primary').first().click(); // 开发 confirm: the last book
  await page.waitForFunction(() => window.__game.g.books === 0, null, { timeout: 15000 });
  // Inside the ~2 s hand-off: try the free 分兵.
  await page.waitForTimeout(300);
  const tried = await dock(page, '分兵').then(() => true, () => false);
  await page.waitForTimeout(300); await shot(page, 'handoff');
  const opened = await page.locator('.modal', { hasText: '分兵' }).count();
  const ai = await until(page, () => window.__game.g.current !== window.__game.g.player, null, 20000);
  const stillOpen = await page.locator('.modal', { hasText: '分兵' }).count();
  report('handoff', tried && !opened && !stillOpen && ai && !errors.length, `分兵 clicked=${tried} opened=${opened} still=${stillOpen} AI turn=${ai}${errors.length ? ` errors: ${errors.join(' | ')}` : ''}`);
  await page.context().close();
}

if (only.includes('fall-books')) await fall('fall-books', 5);
if (only.includes('fall-last')) await fall('fall-last', 1);
if (only.includes('handoff')) await handoff();
await browser.close();
process.exit(bad ? 1 : 0);
