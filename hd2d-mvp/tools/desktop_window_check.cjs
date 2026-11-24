// Checks the desktop shell's window (desktop/main.js, desktop/preload.js) without showing one: where it opens, 全屏 from
// the page, the question before a game is closed, 记录编辑's unwritten changes, 退出游戏. The window is never shown, the
// system dialogs are answered by the script, audio is muted and the profile is a temporary folder, so the player's own
// saves and window place are not touched (AGENTS.md: 不出声, 不抢前台).
// Online updates too (desktop/updater.js): with a stand-in CNB on this machine and a key made for the run, an update is checked,
// downloaded, applied by reloading the page (the new code runs, not a cached copy), one that does not start is rolled back,
// and with 启动时自动检查更新 off (the default) nothing reaches the network at all; --smoke loads no update.
//   node hd2d-mvp/tools/desktop_window_check.cjs        # needs desktop/app (node hd2d-mvp/desktop/build-app.mjs)
//   node hd2d-mvp/tools/desktop_window_check.cjs --updates-only
//   node hd2d-mvp/tools/desktop_window_check.cjs --drill <apply|revert> --manifest <raw URL> --key <public pem> --profile <dir> [--mark M]
//     one step of the CNB drill (§7.6) against the real host: the profile is kept between steps; prints the step's report
// It runs here on the machine it is run on: what Windows does with a window (the title bar, DPI scaling) it cannot tell.
const path = require('node:path');
const { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const desktop = path.join(__dirname, '..', 'desktop');

if (!process.versions.electron) {
  const { spawnSync } = require('node:child_process');
  const assert = require('node:assert/strict');
  const os = require('node:os');
  if (!existsSync(path.join(desktop, 'app', 'index.html'))) { console.error('desktop/app is missing: run node hd2d-mvp/desktop/build-app.mjs first'); process.exit(1); }
  const dir = mkdtempSync(path.join(os.tmpdir(), 'hd2d-window-check-')), state = path.join(dir, 'profile', 'window-state.json');
  const electronBin = path.join(desktop, 'node_modules', '.bin', 'electron');
  const report = (step, r) => {
    const file = path.join(dir, `report-${step}.json`);
    assert.ok(existsSync(file), `${step}: no report (exit ${r.status})\n${r.stderr}`);
    const rep = JSON.parse(readFileSync(file, 'utf8'));
    assert.ok(rep.quit && !rep.timeout && !rep.error, `${step}: ${rep.error ?? 'the game did not close'}\n${rep.log ?? ''}`);
    return rep;
  };
  const run = (step, env = {}) => report(step, spawnSync(electronBin, [__filename], { env: { ...process.env, CHECK_DIR: dir, CHECK_STEP: step, ...env }, encoding: 'utf8', timeout: 90000 }));
  // The update steps: run while this process serves the stand-in CNB, so not with spawnSync.
  const runAsync = (step, env = {}) => new Promise((done) => {
    const { spawn } = require('node:child_process');
    const c = spawn(electronBin, [__filename, ...(env.ARGS ? [env.ARGS] : [])], { env: { ...process.env, CHECK_DIR: dir, CHECK_STEP: step, ...env }, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = ''; c.stderr.on('data', (d) => { stderr += d; });
    const kill = setTimeout(() => c.kill(), step.startsWith('drill-') ? 250000 : 120000);
    c.on('exit', (status) => { clearTimeout(kill); done({ status, stderr }); });
  }).then((r) => report(step, r));
  const inside = (b, a) => b.x >= a.x && b.y >= a.y && b.x + b.width <= a.x + a.width && b.y + b.height <= a.y + a.height;
  const ask = (rep) => rep.asked.map((a) => `${a.title}:${a.response}`);
  (async () => { try {
    if (process.argv.includes('--drill')) {
      const a = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
      const r = await runAsync(`drill-${a('--drill')}`, { CHECK_PROFILE: path.resolve(a('--profile')), DRILL_MARK: a('--mark') ?? '',
        HD2D_UPDATES_TEST: JSON.stringify({ manifestUrl: a('--manifest'), keys: { k1: readFileSync(a('--key'), 'utf8') } }) });
      const st = JSON.parse(readFileSync(path.join(path.resolve(a('--profile')), 'updates', 'state.json'), 'utf8'));
      console.log(JSON.stringify({ check: r.check, download: r.download?.phase, applied: r.applied, reverted: r.reverted, before: r.before, after: r.after, state: st, errors: r.calls.filter((c) => c.startsWith('error:')),
        log: r.log.split('\n').filter((l) => /update|rolled|confirmed|game up|missing|failed/.test(l)) }, null, 1));
      return;
    }
    if (process.argv.includes('--updates-only')) { await updateSteps(dir, runAsync); console.log('desktop window (updates only): ok'); return; } // while working on them
    let r = run('first');
    assert.ok(inside(r.options, r.primary), `the first window is on the screen: ${JSON.stringify(r.options)} in ${JSON.stringify(r.primary)}`);
    assert.ok(r.options.width <= 1600 && r.options.height <= 900 && r.options.minWidth <= r.primary.width && r.options.minHeight <= r.primary.height);
    assert.equal(r.calls.includes('maximize'), r.primary.width < 1600 || r.primary.height < 900, 'maximized only on a screen too small for 1600x900');
    assert.deepEqual(Object.keys(r.page.desktop).sort(), ['isFullscreen', 'mac', 'onFullscreen', 'onUiZoom', 'quit', 'setLang', 'setUiSize', 'setUnsaved', 'toggleFullscreen', 'updater'], 'what the page is given');
    assert.deepEqual(r.page.desktop.updater, { enabled: false, getState: 'function', check: 'function', download: 'function', cancel: 'function', apply: 'function', revert: 'function', setAutoCheck: 'function', openDownloadPage: 'function', onEvent: 'function' },
      'the updater, off in a build that is not the release one');
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

    // Full screen in startup.log (一光年的距离@devblog #655: black in full screen, the game running on): the window and its display
    // on each change, and the page looked at 1 and 3 seconds in. A quick F11 F11 leaves no probe behind.
    r = run('fullscreen');
    const lines = r.log.split('\n');
    assert.match(r.log, /^\S+ displays \d+x\d+ at -?\d+,-?\d+ scale [\d.]+/m, 'the screens at start');
    const enter = lines.filter((l) => / window enter-full-screen: content \d+x\d+ at -?\d+,-?\d+, display \d of \d \d+x\d+ at -?\d+,-?\d+ scale [\d.]+.*, zoom [\d.]+$/.test(l));
    assert.equal(enter.length, 2, `two entries logged:\n${r.log}`);
    assert.equal(lines.filter((l) => / window leave-full-screen: content /.test(l)).length, 2);
    const probes = lines.filter((l) => / fullscreen \+\ds: /.test(l));
    assert.deepEqual(probes.map((l) => / fullscreen \+(\d)s/.exec(l)[1]), ['1', '3'], `one probe each at 1 and 3 seconds, none from the quick entry:\n${r.log}`);
    for (const l of probes) {
      assert.match(l, /frames \d+\/0\.5s, screen \S+, visible, page \d+x\d+ dpr [\d.]+, canvas \d+x\d+, context ok, picture (none|\d+x\d+ lit \d+% mean \d+|error .*)$/, l);
      assert.ok(Number(/frames (\d+)/.exec(l)[1]) > 0, `the page draws: ${l}`);
    }

    r = run('quit');
    assert.deepEqual(r.asked, [], '退出游戏 from the page has asked already');
    if (process.platform === 'darwin') assert.deepEqual(r.menu?.[0]?.sub, ['退出游戏/quit'], '⌘Q is kept on a Mac');
    else assert.equal(r.menu, null);
    await updateSteps(dir, runAsync);
    console.log('desktop window: ok');
  } catch (err) { console.error(err); process.exitCode = 1; } finally { rmSync(dir, { recursive: true, force: true }); } })();
  return;
}

// The update steps (§7.3): a stand-in CNB here (the manifest by its fixed address, the packages behind a 302 as CNB's are), a key
// made for this run, and layers made from desktop/app itself with one line added to src/app.js. Both layers' src/app.js are the
// same length, so a reload that ran a cached copy of the old code would show the old mark.
async function updateSteps(dir, runAsync) {
  const assert = require('node:assert/strict');
  const http = require('node:http');
  const U = require(path.join(desktop, 'updater.js'));
  const { privateKey, publicKey } = require('node:crypto').generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const priv = privateKey.export({ type: 'pkcs8', format: 'pem' }), pub = publicKey.export({ type: 'spki', format: 'pem' });
  const appDir = path.join(desktop, 'app'), build = JSON.parse(readFileSync(path.join(appDir, 'build.json'), 'utf8'));
  const base = { version: build.version, commit: String(build.commit) }, [ma, mi, pa] = base.version.split('.').map(Number);
  const A = `${ma}.${mi}.${pa + 1}`, B = `${ma}.${mi}.${pa + 2}`, C = `${ma}.${mi}.${pa + 3}`;
  const codeFiles = U.walk(appDir).filter((p) => U.CODE_PATH.test(p));
  const layer = (version, mark, drop = []) => codeFiles.filter((p) => !drop.includes(p)).map((p) => {
    let data = readFileSync(path.join(appDir, p));
    if (p === 'src/app.js') data = Buffer.concat([Buffer.from(`window.__mark = '${mark}';\n`), data]); // first: the module's end waits on its top-level awaits
    if (p === 'build.json') data = Buffer.from(JSON.stringify({ ...build, version }));
    return { path: p, data };
  });
  const profile = (name, st, layers = [], settings = null) => {
    const updates = path.join(dir, name, 'updates');
    for (const [version, mark, drop] of layers) for (const e of layer(version, mark, drop)) { const f = path.join(updates, 'code', version, e.path); mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, e.data); }
    if (st) U.saveState(updates, { ...U.emptyState(base), ...st });
    if (settings) mkdirSync(updates, { recursive: true }), writeFileSync(path.join(updates, 'settings.json'), JSON.stringify(settings));
    return path.join(dir, name);
  };
  const read = (f) => JSON.parse(readFileSync(f, 'utf8'));
  // The stand-in CNB.
  const routes = {}, hits = [];
  const server = http.createServer((req, res) => {
    hits.push(req.url);
    if (req.url.startsWith('/m/')) { res.writeHead(302, { location: `/a/${req.url.slice(3)}` }); return res.end(); }
    if (routes[req.url] == null) { res.writeHead(404); return res.end('{"errcode":404}'); }
    res.writeHead(200); res.end(routes[req.url]);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    const code = U.packTarGz(layer(B, 'BBBB')), pack = U.packTarGz([{ path: 'assets/update-probe.txt', data: Buffer.from(`pack ${B}`) }]);
    routes[`/a/v${B}/code-desktop-${B}.tar.gz`] = code; routes[`/a/v${B}/assets-desktop-${B}.tar.gz`] = pack;
    routes['/desktop-latest.json'] = U.signManifest({ schema: 1, channel: 'desktop', version: B, commit: 'check', releasedAt: new Date().toISOString(), minShellApi: 1, minBaseVersion: base.version,
      downloadPageUrl: 'https://example.com/releases', mirrors: [`${url}/m/`], notes: ['检查用的更新'],
      code: { path: `v${B}/code-desktop-${B}.tar.gz`, sha256: U.sha256(code), size: code.length },
      assetPacks: [{ id: `desktop-${A}`, introducedIn: A }, { id: `desktop-${B}`, introducedIn: B, path: `v${B}/assets-desktop-${B}.tar.gz`, sha256: U.sha256(pack), size: pack.length }] }, priv, 'k1');
    // C, a version that cannot start (src/ui.js missing), under a manifest of its own for the in-process rollback.
    const broken = U.packTarGz(layer(C, 'CCCC', ['src/ui.js']));
    routes[`/a/v${C}/code-desktop-${C}.tar.gz`] = broken;
    routes['/broken-latest.json'] = U.signManifest({ schema: 1, channel: 'desktop', version: C, commit: 'check', releasedAt: new Date().toISOString(), minShellApi: 1, minBaseVersion: base.version,
      downloadPageUrl: 'https://example.com/releases', mirrors: [`${url}/m/`], notes: ['启动不了的更新'],
      code: { path: `v${C}/code-desktop-${C}.tar.gz`, sha256: U.sha256(broken), size: broken.length }, assetPacks: [] }, priv, 'k1');
    const env = (p, extra = {}, manifest = 'desktop-latest.json') => ({ CHECK_PROFILE: p, HD2D_UPDATES_TEST: JSON.stringify({ manifestUrl: `${url}/${manifest}`, keys: { k1: pub } }), ...extra });

    // Check, download, apply: the page is loaded again in the same process and runs B's code and B's pack.
    let p = profile('p-update', { active: { version: A, packs: [], confirmed: true } }, [[A, 'AAAA']]);
    let r = await runAsync('update', env(p));
    assert.deepEqual(r.before, { mark: 'AAAA', probe: 404, version: A, enabled: true }, 'the active update is what the page runs');
    assert.equal(r.check.phase, 'update'); assert.equal(r.check.version, B); assert.equal(r.check.bytes, code.length + pack.length, 'the exact size before downloading');
    assert.equal(r.download.phase, 'ready', JSON.stringify(r.download));
    assert.equal(r.applied, true);
    assert.deepEqual(r.after, { mark: 'BBBB', probe: `pack ${B}`, version: B, enabled: true }, 'reloaded: the new code (same URL, same length), the new pack, the new version');
    let st = read(path.join(p, 'updates', 'state.json'));
    assert.deepEqual([st.active.version, st.active.confirmed, st.previous.version], [B, true, A]);
    assert.ok(hits.includes(`/m/v${B}/code-desktop-${B}.tar.gz`) && hits.includes(`/a/v${B}/code-desktop-${B}.tar.gz`), 'by the entry address, through its 302');
    assert.ok(!r.calls.some((c) => c.startsWith('error:')), r.calls.join('\n'));

    // An update that does not start (a module missing): back to the version before, which starts, so the update is marked bad.
    p = profile('p-rollback', { active: { version: A, packs: [], confirmed: true }, pending: { version: B, packs: [] } }, [[A, 'AAAA'], [B, 'BBBB', ['src/ui.js']]]);
    r = await runAsync('rollback', env(p));
    st = read(path.join(p, 'updates', 'state.json'));
    assert.equal(r.mark, 'AAAA', 'the title is up on the version before');
    assert.deepEqual([st.active.version, st.active.confirmed, st.badVersions], [A, true, [B]], r.log);
    assert.match(r.log, new RegExp(`rolled back to ${A.replace(/\./g, '\\.')}`));
    assert.ok(!r.calls.some((c) => c.startsWith('error:')), `no 未能启动 dialog: ${r.calls.join('; ')}`);

    // The same, applied from the title in this process: the old page's latch must not confirm C, C goes back to A in the same process.
    p = profile('p-inproc', { active: { version: A, packs: [], confirmed: true } }, [[A, 'AAAA']]);
    r = await runAsync('inproc-rollback', env(p, {}, 'broken-latest.json'));
    st = read(path.join(p, 'updates', 'state.json'));
    assert.equal(r.check.version, C); assert.equal(r.applied, true);
    assert.equal(r.mark, 'AAAA', 'the title is up again on the version before');
    assert.deepEqual([st.active.version, st.active.confirmed, st.badVersions], [A, true, [C]], r.log);
    assert.doesNotMatch(r.log, new RegExp(`update ${C.replace(/\./g, '\\.')} confirmed`), 'C never confirmed');
    assert.match(r.log, new RegExp(`rolled back to ${A.replace(/\./g, '\\.')}`));
    assert.ok(!r.calls.some((c) => c.startsWith('error:')), `no 未能启动 dialog: ${r.calls.join('; ')}`);

    // 启动时自动检查更新 off (the default): from the start through the title into a battle, nothing goes out.
    hits.length = 0;
    r = await runAsync('quiet', env(profile('p-quiet', null)));
    assert.equal(r.enabled, true);
    assert.deepEqual([r.netFetches, r.requests, hits], [[], [], []], 'no request off this machine');
    assert.ok(r.played, 'and the battle came up');
    // On: one look at the manifest a while after the title.
    r = await runAsync('autocheck', env(profile('p-auto', null, [], { autoCheck: true })));
    assert.deepEqual(r.netFetches, [`${url}/desktop-latest.json`]);
    // --smoke: no update loaded, nothing fetched, whatever the profile holds.
    hits.length = 0;
    p = profile('p-smoke', { active: { version: A, packs: [], confirmed: true } }, [[A, 'AAAA']], { autoCheck: true });
    r = await runAsync('smoke', env(p, { ARGS: `--smoke=${path.join(dir, 'smoke-out')}` }));
    assert.deepEqual([r.mark, r.enabled, r.netFetches, hits], [null, false, [], []]);
  } finally { await new Promise((r) => server.close(r)); }
}

// ---- inside Electron: one run of the shell ----
const Module = require('node:module');
const electron = require('electron');
const { app, BrowserWindow } = electron;
app.setPath('userData', process.env.CHECK_PROFILE || path.join(process.env.CHECK_DIR, 'profile'));
app.commandLine.appendSwitch('mute-audio');
app.dock?.hide();
const report = { step: process.env.CHECK_STEP, asked: [], calls: [], netFetches: [] };
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
  // net.fetch as main.js uses it: every address it asks for off app:// is noted (the updater's only way out).
  const net = (real) => new Proxy(real, { get: (t, k) => (k === 'fetch' ? (u, o) => { if (/^https?:/.test(String(u))) report.netFetches.push(String(u)); return t.fetch(u, o); } : typeof t[k] === 'function' ? t[k].bind(t) : t[k]) });
  return request === 'electron' ? new Proxy(m, { get: (t, k) => (k === 'BrowserWindow' ? Hidden : k === 'dialog' ? dialog : k === 'net' ? net(t.net) : k === 'screen' && report.step === 'zoom' ? bigScreen(t.screen) : t[k]) }) : m;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// Requests off this machine the page's session makes (the page's own, or the shell's through it).
app.whenReady().then(() => {
  report.requests = [];
  electron.session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (d, cb) => { report.requests.push(d.url); cb({}); });
});
const until = async (fn, ms, what) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn().catch(() => false)) return; await wait(250); } throw new Error(`no ${what} after ${ms / 1000}s`); };
async function updateStep(win, js) {
  // index.html opens with data-screen="title": the game's own title is the one its title screen is drawn on (.tt-canvas).
  const title = () => until(() => js('!!document.querySelector(".tt-canvas") && document.body?.dataset.screen === "title"'), 80000, 'title');
  const look = () => js(`(async () => ({ mark: window.__mark ?? null, probe: await fetch('assets/update-probe.txt').then((r) => (r.ok ? r.text() : r.status)),
    version: (await fetch('build.json').then((r) => r.json())).version, enabled: window.desktop.updater.enabled }))()`);
  await title();
  if (report.step === 'update') {
    report.before = await look();
    report.check = await js('window.desktop.updater.check()');
    report.download = await js('window.desktop.updater.download()');
    report.applied = await js('window.desktop.updater.apply()');
    await until(() => js('window.__mark === "BBBB"'), 30000, 'reload').catch(async (err) => { report.after = await look(); throw err; }); await title(); await wait(1500); // the confirmation is a second's look away
    report.after = await look();
  } else if (report.step === 'rollback') {
    await until(() => js('window.__mark === "AAAA" && !!document.querySelector(".tt-canvas") && document.body?.dataset.screen === "title"'), 60000, 'rollback to the version before');
    await wait(1500);
    report.mark = await js('window.__mark ?? null');
  } else if (report.step === 'inproc-rollback') {
    report.check = await js('window.desktop.updater.check()');
    report.download = await js('window.desktop.updater.download()');
    await js('window.__old = true; 0'); // the page applying C: the one A comes back on is another
    report.applied = await js('window.desktop.updater.apply()');
    await until(() => js('!window.__old && window.__mark === "AAAA" && !!document.querySelector(".tt-canvas") && document.body?.dataset.screen === "title"'), 60000, 'rollback to the version before')
      .catch(async (err) => { report.mark = await js('window.__mark ?? null'); throw err; });
    await wait(1500);
    report.mark = await js('window.__mark ?? null');
  } else if (report.step === 'drill-apply' || report.step === 'drill-revert') {
    // The CNB drill: what the page runs before, the step, and what it runs once a new page has come up to its title.
    report.before = await look();
    if (report.step === 'drill-apply') {
      report.check = await js('window.desktop.updater.check({ manual: true })');
      report.download = await js('window.desktop.updater.download()');
    }
    await js('window.__old = true; 0');
    if (report.step === 'drill-apply') report.applied = await js('window.desktop.updater.apply()');
    else report.reverted = await js('window.desktop.updater.revert()');
    const mark = process.env.DRILL_MARK || null;
    await until(() => js(`!window.__old && (window.__mark ?? null) === ${JSON.stringify(mark)} && !!document.querySelector(".tt-canvas") && document.body?.dataset.screen === "title"`), 90000, `the title on mark ${mark}`)
      .catch(async (err) => { report.after = await look().catch(() => null); throw err; });
    await wait(1500);
    report.after = await look();
  } else if (report.step === 'quiet') {
    report.enabled = await js('window.desktop.updater.enabled');
    await wait(9000); // past the 8 seconds an automatic check would wait
    await js('window.__run = window.__game.debug.quickTactical(38, 51, 2); 0');
    await until(() => js('!!document.querySelector(".tq-form")'), 20000, 'battle');
    report.played = true; await wait(2000);
  } else if (report.step === 'autocheck') {
    await until(async () => report.netFetches.length > 0, 20000, 'automatic check');
    await wait(1500);
  } else if (report.step === 'smoke') {
    report.mark = await js('window.__mark ?? null'); report.enabled = await js('window.desktop.updater.enabled');
  }
  report.log = readFileSync(path.join(app.getPath('userData'), 'logs', 'startup.log'), 'utf8');
}
app.on('will-quit', () => { report.quit = true; done(); });
const UPDATE_STEPS = ['update', 'rollback', 'inproc-rollback', 'drill-apply', 'drill-revert', 'quiet', 'autocheck', 'smoke'];
setTimeout(() => { report.timeout = true; done(); app.exit(2); }, report.step.startsWith('drill-') ? 240000 : UPDATE_STEPS.includes(report.step) ? 110000 : 60000);
require(path.join(desktop, 'main.js'));

app.whenReady().then(async () => {
  while (!made) await wait(50);
  const win = made, wc = win.webContents, js = (code, gesture = false) => wc.executeJavaScript(code, gesture);
  report.workArea = electron.screen.getDisplayMatching(win.getBounds()).workArea;
  report.primary = electron.screen.getPrimaryDisplay().workArea;
  report.menu = electron.Menu.getApplicationMenu()?.items.map((i) => ({ label: i.label, sub: i.submenu?.items.map((s) => `${s.label}/${s.role}`) })) ?? null;
  await new Promise((r) => (wc.isLoading() ? wc.once('did-finish-load', r) : r()));
  report.page = await js(`(() => { const shape = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'function' ? 'function' : v && typeof v === 'object' ? shape(v) : v]));
    return { desktop: window.desktop ? shape(window.desktop) : null, node: typeof require }; })()`);
  if (UPDATE_STEPS.includes(report.step)) {
    try { await updateStep(win, js); } catch (err) {
      report.error = `${err?.message || err} (so far: ${JSON.stringify({ check: report.check?.phase, download: report.download?.phase, applied: report.applied, after: report.after })})`;
      try { report.log = readFileSync(path.join(app.getPath('userData'), 'logs', 'startup.log'), 'utf8'); } catch {}
    }
    report.quit = true; done(); app.exit(0); return;
  }
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
    for (const [w, h, size, expect] of [[1600, 900, 'normal', 1.25], [2560, 1377, 'normal', 1.75], [2000, 1125, 'normal', 1.5], [2560, 1377, 'large', 1.75], [1600, 900, 'large', 1.25], [2560, 1377, 'medium', 1.5], [2560, 1440, 'medium', 1.5], [2560, 1377, 'small', 1], [1100, 700, 'small', 1], [2560, 1377, 'normal', 1.75]]) {
      win.setContentSize(w, h); await js(`window.desktop.setUiSize(${JSON.stringify(size)})`); await wait(400);
      report.zoom.push({ size, expect, content: win.getContentBounds(), z: wc.getZoomFactor(), page: await js('[innerWidth, innerHeight, devicePixelRatio]') });
    }
    wc.reload(); await new Promise((r) => wc.once('did-finish-load', r)); await wait(400);
    report.reload = wc.getZoomFactor();
    win.close();
  } else if (report.step === 'fullscreen') {
    await js('window.desktop.toggleFullscreen(); 0'); await wait(150); await js('window.desktop.toggleFullscreen(); 0'); await wait(1500); // F11 F11
    await js('window.desktop.toggleFullscreen(); 0'); await wait(4500);
    await js('window.desktop.toggleFullscreen(); 0'); await wait(300);
    report.log = readFileSync(path.join(process.env.CHECK_DIR, 'profile', 'logs', 'startup.log'), 'utf8');
    win.close();
  } else if (report.step === 'quit') await js('window.desktop.setUnsaved(true); window.desktop.quit(); 0');
  else win.close();
  await wait(3000);
  if (!win.isDestroyed()) { done(); app.exit(3); }
});
