// Checks the desktop shell's window (desktop/main.js, desktop/preload.js) without showing one: where it opens, 全屏 from
// the page, the question before a game is closed, 记录编辑's unwritten changes, 退出游戏. The window is never shown, the
// system dialogs are answered by the script, audio is muted and the profile is a temporary folder, so the player's own
// saves and window place are not touched (AGENTS.md: 不出声, 不抢前台).
//   node hd2d-mvp/tools/desktop_window_check.cjs        # needs desktop/app (node hd2d-mvp/desktop/build-app.mjs)
// It runs here on the machine it is run on: what Windows does with a window (the title bar, DPI scaling) it cannot tell.
const path = require('node:path');
const { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const desktop = path.join(__dirname, '..', 'desktop');

if (!process.versions.electron) {
  const { spawnSync } = require('node:child_process');
  const assert = require('node:assert/strict');
  const os = require('node:os');
  if (!existsSync(path.join(desktop, 'app', 'index.html'))) { console.error('desktop/app is missing: run node hd2d-mvp/desktop/build-app.mjs first'); process.exit(1); }
  const dir = mkdtempSync(path.join(os.tmpdir(), 'hd2d-window-check-')), state = path.join(dir, 'profile', 'window-state.json');
  const run = (step) => {
    const r = spawnSync(path.join(desktop, 'node_modules', '.bin', 'electron'), [__filename], { env: { ...process.env, CHECK_DIR: dir, CHECK_STEP: step }, encoding: 'utf8', timeout: 90000 });
    const file = path.join(dir, `report-${step}.json`);
    assert.ok(existsSync(file), `${step}: no report (exit ${r.status})\n${r.stderr}`);
    const rep = JSON.parse(readFileSync(file, 'utf8'));
    assert.ok(rep.quit && !rep.timeout, `${step}: the game did not close`);
    return rep;
  };
  const inside = (b, a) => b.x >= a.x && b.y >= a.y && b.x + b.width <= a.x + a.width && b.y + b.height <= a.y + a.height;
  const ask = (rep) => rep.asked.map((a) => `${a.title}:${a.response}`);
  try {
    let r = run('first');
    assert.ok(inside(r.options, r.primary), `the first window is on the screen: ${JSON.stringify(r.options)} in ${JSON.stringify(r.primary)}`);
    assert.ok(r.options.width <= 1600 && r.options.height <= 900 && r.options.minWidth <= r.primary.width && r.options.minHeight <= r.primary.height);
    assert.equal(r.calls.includes('maximize'), r.primary.width < 1600 || r.primary.height < 900, 'maximized only on a screen too small for 1600x900');
    assert.deepEqual(Object.keys(r.page.desktop).sort(), ['isFullscreen', 'mac', 'onFullscreen', 'quit', 'setUiSize', 'setUnsaved', 'toggleFullscreen'], 'what the page is given');
    assert.equal(r.page.node, 'undefined', 'and nothing of Node');
    assert.deepEqual(r.fullscreen, { now: true, heard: [true], back: { now: false, heard: [true, false] } }, '全屏 from the page, and the page told');
    assert.deepEqual(ask(r), ['退出游戏:0', '退出游戏:1'], 'a game on: closing asks, 取消 stays, the second time leaves');
    assert.equal(r.afterCancel, true);
    const kept = JSON.parse(readFileSync(state, 'utf8'));
    assert.deepEqual([kept.bounds.width, kept.bounds.height, kept.fullscreen], [1100, 700, false], 'the place is remembered');

    r = run('second');
    assert.deepEqual([r.options.x, r.options.y, r.options.width, r.options.height], [kept.bounds.x, kept.bounds.y, 1100, 700], 'and used the next time');
    assert.deepEqual(ask(r), ['记录编辑:0', '记录编辑:1'], 'a page holding the window (记录编辑): asked, not silently refused; no 退出游戏 question on a page with no game');
    assert.equal(r.afterCancel, true);

    writeFileSync(state, JSON.stringify({ bounds: { x: -9000, y: -9000, width: 5000, height: 4000 }, maximized: false, fullscreen: false }));
    r = run('offscreen');
    assert.ok(inside(r.options, r.workArea), `a place on no screen is brought back: ${JSON.stringify(r.options)}`);
    assert.deepEqual(r.asked, [], 'no game, no question');

    // 系统 → 界面大小 (desktop/uiscale.js) on a 2560x1440 screen (a stand-in display: this machine's own is whatever it is): the page
    // zoomed for the screen in the game's 1600x900 window too, as far as the window holds, and sharp (devicePixelRatio rises with it).
    r = run('zoom');
    const zs = r.zoom.map((z) => [z.size, z.content.width, z.content.height, Math.round(z.z * 100) / 100, ...z.page]);
    for (const [, w, h, k, iw, ih, dpr] of zs) {
      assert.ok(Math.abs(iw - w / k) < 1.5 && Math.abs(ih - h / k) < 1.5, `the page is laid out ${iw}x${ih} at ${k}: ${JSON.stringify(zs)}`);
      assert.ok(Math.abs(dpr / k - r.zoom[0].page[2] / r.zoom[0].z) < 1e-6, 'devicePixelRatio follows the zoom');
    }
    assert.deepEqual(zs.map((z) => z[3]), r.zoom.map((z) => z.expect), `zoom per window and size: ${JSON.stringify(zs)}`);
    assert.equal(Math.round(r.reload * 100) / 100, r.zoom.at(-1).expect, 'kept over a reload of the page');

    r = run('quit');
    assert.deepEqual(r.asked, [], '退出游戏 from the page has asked already');
    if (process.platform === 'darwin') assert.deepEqual(r.menu?.[0]?.sub, ['退出游戏/quit'], '⌘Q is kept on a Mac');
    else assert.equal(r.menu, null);
    console.log('desktop window: ok');
  } finally { rmSync(dir, { recursive: true, force: true }); }
  return;
}

// ---- inside Electron: one run of the shell ----
const Module = require('node:module');
const electron = require('electron');
const { app, BrowserWindow } = electron;
app.setPath('userData', path.join(process.env.CHECK_DIR, 'profile'));
app.commandLine.appendSwitch('mute-audio');
app.dock?.hide();
const report = { step: process.env.CHECK_STEP, asked: [], calls: [] };
const done = () => writeFileSync(path.join(process.env.CHECK_DIR, `report-${report.step}.json`), JSON.stringify(report, null, 1));
let answers = [], made = null;
class Hidden extends BrowserWindow { // never shown: maximize and fullscreen are only noted
  constructor(o) { super({ ...o, show: false }); made = this; this.full = false; report.options = { x: o.x, y: o.y, width: o.width, height: o.height, minWidth: o.minWidth, minHeight: o.minHeight }; }
  maximize() { report.calls.push('maximize'); }
  setFullScreen(on) { report.calls.push(`fullscreen:${on}`); this.full = on; setImmediate(() => this.emit(on ? 'enter-full-screen' : 'leave-full-screen')); }
  isFullScreen() { return this.full; }
}
const answer = (o, sync) => { const response = answers.shift() ?? 0; report.asked.push({ title: o.title, message: o.message, buttons: o.buttons, response, sync }); return response; };
const dialog = { showMessageBox: async (_w, o) => ({ response: answer(o, false) }), showMessageBoxSync: (_w, o) => answer(o, true), showErrorBox: (t, m) => { report.calls.push(`error:${t}:${m}`); } };
// The zoom step's screen: 2560x1440 at Windows' 100%, whatever this machine's is.
const bigScreen = (real) => {
  const d = () => ({ ...real.getPrimaryDisplay(), scaleFactor: 1, size: { width: 2560, height: 1440 }, bounds: { x: 0, y: 0, width: 2560, height: 1440 }, workArea: { x: 0, y: 0, width: 2560, height: 1392 } });
  return new Proxy(real, { get: (t, k) => (k === 'getDisplayMatching' || k === 'getPrimaryDisplay' ? d : typeof t[k] === 'function' ? t[k].bind(t) : t[k]) });
};
const load = Module._load;
Module._load = function (request, ...rest) {
  const m = load.call(this, request, ...rest);
  return request === 'electron' ? new Proxy(m, { get: (t, k) => (k === 'BrowserWindow' ? Hidden : k === 'dialog' ? dialog : k === 'screen' && report.step === 'zoom' ? bigScreen(t.screen) : t[k]) }) : m;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
app.on('will-quit', () => { report.quit = true; done(); });
setTimeout(() => { report.timeout = true; done(); app.exit(2); }, 60000);
require(path.join(desktop, 'main.js'));

app.whenReady().then(async () => {
  while (!made) await wait(50);
  const win = made, wc = win.webContents, js = (code, gesture = false) => wc.executeJavaScript(code, gesture);
  report.workArea = electron.screen.getDisplayMatching(win.getBounds()).workArea;
  report.primary = electron.screen.getPrimaryDisplay().workArea;
  report.menu = electron.Menu.getApplicationMenu()?.items.map((i) => ({ label: i.label, sub: i.submenu?.items.map((s) => `${s.label}/${s.role}`) })) ?? null;
  await new Promise((r) => (wc.isLoading() ? wc.once('did-finish-load', r) : r()));
  report.page = await js(`({ desktop: window.desktop ? Object.fromEntries(Object.entries(window.desktop).map(([k, v]) => [k, typeof v === 'function' ? 'function' : v])) : null, node: typeof require })`);
  if (report.step === 'first') {
    await js(`window.__fs = []; window.desktop.onFullscreen((on) => window.__fs.push(on)); window.desktop.toggleFullscreen(); 0`); await wait(300);
    report.fullscreen = { now: await js('window.desktop.isFullscreen()'), heard: await js('window.__fs') };
    await js('window.desktop.toggleFullscreen(); 0'); await wait(300);
    report.fullscreen.back = { now: await js('window.desktop.isFullscreen()'), heard: await js('window.__fs') };
    await js('window.desktop.setUnsaved(true); 0'); await wait(200);
    answers = [0]; win.close(); await wait(400);
    report.afterCancel = !win.isDestroyed();
    win.setBounds({ x: report.workArea.x + 40, y: report.workArea.y + 60, width: 1100, height: 700 });
    answers = [1]; win.close();
  } else if (report.step === 'second') {
    await js(`addEventListener('beforeunload', (e) => { e.preventDefault(); }); 0`, true); // as 记录编辑 does with changes unwritten
    answers = [0]; win.close(); await wait(500);
    report.afterCancel = !win.isDestroyed();
    answers = [1]; win.close();
  } else if (report.step === 'zoom') {
    report.zoom = [];
    for (const [w, h, size, expect] of [[1600, 900, 'normal', 1.25], [2560, 1377, 'normal', 1.75], [2000, 1125, 'normal', 1.5], [2560, 1377, 'large', 1.75], [1600, 900, 'large', 1.25], [2560, 1377, 'small', 1.5], [1100, 700, 'small', 1], [2560, 1377, 'normal', 1.75]]) {
      win.setContentSize(w, h); await js(`window.desktop.setUiSize(${JSON.stringify(size)})`); await wait(400);
      report.zoom.push({ size, expect, content: win.getContentBounds(), z: wc.getZoomFactor(), page: await js('[innerWidth, innerHeight, devicePixelRatio]') });
    }
    wc.reload(); await new Promise((r) => wc.once('did-finish-load', r)); await wait(400);
    report.reload = wc.getZoomFactor();
    win.close();
  } else if (report.step === 'quit') await js('window.desktop.setUnsaved(true); window.desktop.quit(); 0');
  else win.close();
  await wait(3000);
  if (!win.isDestroyed()) { done(); app.exit(3); }
});
