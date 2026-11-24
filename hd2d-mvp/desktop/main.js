// Electron shell for the playtest build: serves desktop/app/ (made by build-app.mjs) from app://game/.
// A fixed custom origin lets ES modules and fetch() work (file:// would not) and keeps localStorage saves
// in the user's profile across reinstalls. F11 toggles fullscreen, Alt+Enter too, and so does 系统 → 全屏 in the game,
// which also has 退出游戏: preload.js is what the page may ask of the window.
//   --smoke=<dir>  load, screenshot, log console errors and missing files to <dir>, then quit (for CI / checks)
const { app, BrowserWindow, Menu, crashReporter, dialog, ipcMain, net, protocol, screen, session, shell } = require('electron');
const { zoomFor, screenZoom, SIZES: UI_SIZES } = require('./uiscale.js');
const Updater = require('./updater.js');
const { appendFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, 'app');
// The window's own questions in the page's 简体 / 繁體 (系统 → 文字): the page says which (preload setLang), and 繁體 uses the
// game's own converter and table from the snapshot (src/zh.js, src/zhtable.js). Before the page has said, 简体.
let zh = (s) => s;
async function useLang(lang) {
  if (lang !== 'hant') { if (zh.hant) { zh = (s) => s; if (process.platform === 'darwin') Menu.setApplicationMenu(appMenu()); } return; }
  try {
    const [{ makeConverter }, { default: table }] = await Promise.all(['src/zh.js', 'src/zhtable.js'].map((f) => import(pathToFileURL(path.join(ROOT, f)).href)));
    zh = makeConverter(table); zh.hant = true;
  } catch { /* an older snapshot without them: 简体 */ }
  if (process.platform === 'darwin') Menu.setApplicationMenu(appMenu()); // its 退出游戏
}
const ORIGIN = 'app://game';
const smokeDir = (process.argv.find((a) => a.startsWith('--smoke=')) || '').slice(8) || null;
const devTools = !app.isPackaged || process.argv.includes('--devtools');
const BOOT_LIMIT = 90; // seconds to the title before the player is told; a slow disk with software GL takes long, not this long

// One process per profile, taken before anything below touches it. Two would share Local Storage/leveldb: the one that
// finds it locked has Chromium destroy the database, which succeeds if the holder exits within seconds, and every save
// is gone (a double double-click on Windows, 2026-11-06). Past the deletion window it runs on an empty in-memory store.
if (!app.requestSingleInstanceLock()) {
  if (smokeDir) console.error('another instance holds this profile; smoke did not run');
  app.exit(smokeDir ? 1 : 0);
  return; // app.exit does not stop this script
}
app.on('second-instance', () => {
  const win = BrowserWindow.getAllWindows()[0]; // none yet while starting up: the window on its way is the answer
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
});

// The startup record: a player whose game does not start has only this file and the crash dumps to send (devblog #100,
// 2026-11-03: Win10, double-click, nothing). The previous run's is kept beside it. No file at all means the process never
// got as far as this line, which points away from the game (the system, a security tool, the unpacked files).
const logFile = (() => {
  for (const dir of [path.join(app.getPath('userData'), 'logs'), path.join(os.tmpdir(), 'Three Kingdoms HD-2D')]) {
    try {
      mkdirSync(dir, { recursive: true });
      const f = path.join(dir, 'startup.log');
      if (existsSync(f)) renameSync(f, path.join(dir, 'startup.prev.log'));
      writeFileSync(f, '');
      return f;
    } catch { /* a profile that cannot be written: the next place */ }
  }
  return null;
})();
let logLines = 0;
const log = (line) => {
  if (!logFile || logLines > 500) return; // a page that repeats an error must not fill the disk
  try { appendFileSync(logFile, `${new Date().toISOString()} ${line}\n`); logLines++; } catch { /* nothing more can be done */ }
};
// Tells the player once what failed and where the record is (AGENTS.md: never a silent black window), and opens its folder.
let told = false;
function fail(what, detail = '') {
  log(`FAIL ${what}${detail ? `: ${detail}` : ''}`);
  if (smokeDir || told) return;
  told = true;
  dialog.showErrorBox('三国 HD-2D 未能正常运行', `${what}${detail ? `\n\n${detail}` : ''}\n\n${logFile ? `详细记录在：\n${logFile}\n反馈问题时请附上这个文件。` : '无法写入日志文件。'}`);
  if (logFile) shell.showItemInFolder(logFile);
}
process.on('uncaughtException', (err) => {
  fail('程序内部错误', err?.stack || String(err));
  if (!app.isReady() || !BrowserWindow.getAllWindows().length) app.exit(1); // no window to fall back on: a process left running shows nothing
});
process.on('unhandledRejection', (err) => log(`unhandled rejection: ${err?.stack || err}`));

// The package's own build.json (not an update's: that one is laid over app/ for the page, desktop/updater.js): what the package is,
// and whether it is the release build that may update itself.
let baseBuild = {};
try { baseBuild = JSON.parse(readFileSync(path.join(ROOT, 'build.json'), 'utf8')); } catch { /* reported below by the missing files */ }
const buildCommit = baseBuild.commit ?? 'unknown';
log(`start ${app.getVersion()} (${buildCommit}) electron ${process.versions.electron} chrome ${process.versions.chrome} ${process.platform} ${process.arch} ${os.release()} packaged=${app.isPackaged}`);
log(`exe ${process.execPath}`);
log(`cpu ${os.cpus()[0]?.model} x${os.cpus().length}, memory ${Math.round(os.totalmem() / 2 ** 20)} MB`);
try { crashReporter.start({ uploadToServer: false }); log(`crash dumps ${app.getPath('crashDumps')}`); } catch (err) { log(`crash reporter: ${err}`); } // kept on this machine, sent nowhere

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true } }]);
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('force_high_performance_gpu');
// After a GPU process crash Chromium may refuse WebGL to the page it blames, so the context never comes back and the
// game stays white (a Windows AMD player, 2026-11-08: two crashes two minutes apart, white after the second). The game
// is the only page here and recovers its context itself (src/app.js), so it is never blocked.
app.disableDomainBlockingFor3DAPIs();
if (smokeDir) app.commandLine.appendSwitch('mute-audio'); // checks run silent (AGENTS.md)

// Online updates (docs/在线增量更新方案与开发交接_2026-11-23.md): only in the release build (build-app.mjs --official), never in a
// check (--smoke), a development or an open-source build. Off, nothing here goes online and app/ is served as it is. On, the
// network is used only when the player asks (更新 dialog) or has turned 启动时自动检查更新 on; downloads go to userData/updates/
// and are laid over app/ by serve() below. SHELL_API rises when this shell gains something an update needs (§2 Layer 2).
const SHELL_API = 1;
// The channel: a public CNB repository (manifest by its raw-file address, packages as Release assets). The open-source mirror
// has none of its own (tools/opensource/public.json empties this), so a build from it never updates.
const UPDATES_REPO = '';
const UPDATE_MANIFEST = `${UPDATES_REPO}/-/git/raw/main/desktop-latest.json`, DOWNLOAD_PAGE = `${UPDATES_REPO}/-/releases`;
// A check of this shell (tools/desktop_window_check.cjs) turns them on in an unpackaged run with its own server and keys; a
// package ignores this.
const updateTest = (() => { if (app.isPackaged || !process.env.HD2D_UPDATES_TEST) return null; try { return JSON.parse(process.env.HD2D_UPDATES_TEST); } catch { return null; } })();
const updatesOn = !smokeDir && (baseBuild.updates === 'official' || !!updateTest) && (!!UPDATES_REPO || !!updateTest);
let updater = null;
let overlay = { version: null, lookup: () => ({ base: true }) }; // what serve() reads: the package alone until an update is active
function rebuildOverlay() {
  for (let i = 0; i < 3; i++) {
    try { overlay = updater ? updater.index() : { version: null, lookup: () => ({ base: true }) }; if (overlay.version) log(`update ${overlay.version} in use (${overlay.codeFiles} code files, ${overlay.files} asset files)`); return; }
    catch (err) { log(`update layer unusable: ${err.message || err}`); if (!updater?.bootFailed('hard')) { updater?.revert(); } } // an incomplete layer: back a step, else to the package
  }
  overlay = { version: null, lookup: () => ({ base: true }) };
}
function startUpdater(send) {
  if (!updatesOn) return;
  try {
    let keys = updateTest?.keys;
    if (!keys) try { keys = JSON.parse(readFileSync(path.join(__dirname, 'update-keys.json'), 'utf8')); } catch { keys = null; }
    if (!keys || !Object.keys(keys).length) { log('updates: no public key in this package; off'); return; }
    if (!Updater.isVersion(baseBuild.version ?? '')) { log(`updates: package version ${baseBuild.version}; off`); return; }
    updater = Updater.createUpdater({
      dir: path.join(app.getPath('userData'), 'updates'), base: { version: baseBuild.version, commit: String(buildCommit) }, channel: 'desktop', shellApi: SHELL_API,
      keys, manifestUrl: updateTest?.manifestUrl ?? UPDATE_MANIFEST, allowHttp: !!updateTest, fetch: (url, o) => net.fetch(url, o), log, emit: send,
    });
    const b = updater.boot();
    if (b.promoted) log(`update ${updater.state.active?.version} takes effect`);
    rebuildOverlay();
  } catch (err) { log(`updates: off after ${err?.stack || err}`); updater = null; overlay = { version: null, lookup: () => ({ base: true }) }; } // never in the way of the game
}

const EXPECTED_MISS = /^assets\/audio\/(original|remix)\/|^assets\/audio\/(sfx|bgm|cue)-[\w-]+\.mp3$/; // manifest fallbacks probed in order
const missing = [];
let bootError = null, bootErrorAt = 0, bootMissing = false; // the first thing that stops the game reaching its title; a module missing?
const noteBootError = (msg, missing = false) => { if (!bootError) { bootError = msg; bootErrorAt = Date.now(); bootMissing = missing; } };
// The player's own data packs (docs/战略地图数据包扩展设计_2026-11-17.md §5.6): folders under 文稿/Three Kingdoms HD-2D/mods, served
// at mods/<id>/ beside the shipped ones, which win on a clash. Only a pack's fixed JSON files (src/core/pack.js PACK_FILES) are
// read, never through a link; mods/index.json is the shipped list plus every folder here with a readable pack.json.
const USER_MODS = path.join(app.getPath('documents'), 'Three Kingdoms HD-2D', 'mods');
const PACK_FILE = /^mods\/([a-z0-9][a-z0-9-]{0,39})\/(pack|cities|roads|factions|officers)\.json$/;
const plainFile = (f) => { try { return lstatSync(f).isFile(); } catch { return false; } };
// A file of the game as the page sees it: from the active update, else from app/; null when there is none (or an update removed it).
function gameFile(rel) {
  const hit = overlay.lookup(rel);
  if (hit.file) return hit.file;
  if (hit.gone) return null;
  const file = path.join(ROOT, rel);
  return file.startsWith(ROOT + path.sep) && existsSync(file) ? file : null;
}
function packIndex() {
  let list = [];
  try { list = JSON.parse(readFileSync(gameFile('mods/index.json'), 'utf8')); } catch {}
  const have = new Set(list.map((p) => p.id));
  let dirs = [];
  try { dirs = readdirSync(USER_MODS); } catch {}
  for (const id of dirs.sort()) {
    const f = path.join(USER_MODS, id, 'pack.json');
    if (have.has(id) || !PACK_FILE.test(`mods/${id}/pack.json`) || !plainFile(f)) continue;
    try { const m = JSON.parse(readFileSync(f, 'utf8')); list.push({ id, name: String(m.name ?? id).slice(0, 24), version: String(m.version ?? ''), author: String(m.author ?? '').slice(0, 24), local: true }); }
    catch { list.push({ id, name: id, version: '', author: '', local: true }); } // listed, so choosing it says what is wrong
  }
  return new Response(JSON.stringify(list), { headers: { 'content-type': 'application/json' } });
}
function serve(request) {
  const url = new URL(request.url);
  if (url.host !== 'game') return new Response('not found', { status: 404 });
  const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
  if (rel === 'mods/index.json') return packIndex();
  const own = PACK_FILE.exec(rel);
  if (own && !gameFile(`mods/${own[1]}/pack.json`)) {
    const f = path.join(USER_MODS, own[1], `${own[2]}.json`);
    return plainFile(f) ? net.fetch(pathToFileURL(f).toString()) : new Response('not found', { status: 404 });
  }
  const file = gameFile(rel);
  if (!file) {
    missing.push(rel);
    if (!EXPECTED_MISS.test(rel)) log(`missing file ${rel}`);
    if (rel.endsWith('.js')) noteBootError(`缺少游戏文件 ${rel}。请重新完整解压压缩包。`, true); // every module is a static import: the game cannot come up without it
    return new Response('not found', { status: 404 });
  }
  return net.fetch(pathToFileURL(file).toString());
}

// What the page does on the way to the title goes in the record, and a page that never gets there says so: a game
// that cannot start WebGL or load a module otherwise leaves a black window and no word. The first screen the game's code
// shows counts as started: the title, or the map when back from 记录编辑 (startup-error is src/app.js saying WebGL did not
// come up; boot is its splash, on the way). preload.js tells each as it is set, so none is missed between two looks.
// An update not yet confirmed that fails here is rolled back and the page loaded again (desktop/updater.js, §5.4): a failure
// of the page itself (not loaded, a module missing, startup-error) at once, one that is often the machine (the page's process
// gone, the time limit) only the second time running. The player is told only when the package itself does not start.
function watchPage(win, { onUp = () => {} } = {}) {
  const wc = win.webContents;
  // The first screen the page's own code shows (preload.js tells each) is the game up: not index.html's own data-screen.
  // fresh: this load's document is in (did-navigate); until then a word from the page on its way out is not taken.
  // splash: the page got as far as its opening splash, so a close now is the player's, not a failed start.
  let t0 = Date.now(), up = false, fresh = false, splash = false, failed = false, timer = null, gpuLogged = false;
  const secs = () => (Date.now() - t0) / 1000;
  const trial = () => !!updater?.state.active && !updater.state.active.confirmed;
  // A boot failure before the title: an update on trial is rolled back and the page loaded again, else the player told.
  const bootFail = (kind, what, detail, { tell = true } = {}) => {
    failed = true;
    if (updater?.bootFailed(kind)) { log(`${what}${detail ? `: ${detail}` : ''}; rolled back to ${updater.state.active?.version ?? 'the package'}`); rebuildOverlay(); reload(); return; }
    if (kind === 'soft' && trial()) log(`${what}: counted against update ${updater.state.active.version}`);
    if (tell) fail(what, detail); else log(`${what}${detail ? `: ${detail}` : ''}`);
  };
  // Same URLs, other contents: a plain load in this renderer ran the old src/app.js from its memory cache (seen in
  // tools/desktop_window_check.cjs), so the caches are cleared and the page reloaded bypassing them, as Shift+reload does.
  const reload = () => {
    clearInterval(timer); up = false; fresh = false;
    Promise.all([session.defaultSession.clearCodeCaches({}), session.defaultSession.clearCache()]).catch(() => {}).then(() => {
      if (win.isDestroyed()) return;
      arm();
      if (wc.getURL().startsWith(`${ORIGIN}/index.html`)) wc.reloadIgnoringCache();
      else wc.loadURL(`${ORIGIN}/index.html`, { extraHeaders: 'pragma: no-cache\n' }).catch(() => {});
    });
  };
  const onScreen = (e, screen) => {
    if (e.sender !== wc || !fresh || up || typeof screen !== 'string') return;
    if (screen === 'boot') { splash = true; return; }
    up = true; clearInterval(timer);
    // startup-error is the page saying WebGL did not come up, and it says so itself: an update on trial goes back, the package logs it.
    if (screen === 'startup-error') return bootFail('hard', '游戏画面未能启动', 'WebGL 初始化失败', { tell: false });
    log(`game up after ${secs()}s (${screen})${gpuLogged ? '' : `, features ${JSON.stringify(app.getGPUFeatureStatus())}`}`); gpuLogged = true;
    // Only the title confirms an update (§5.4): the map back from 记录编辑 comes after a title in this version anyway.
    if (screen === 'title') try { if (updater?.title()) log(`update ${updater.state.active?.version ?? '(none)'} confirmed`); } catch (err) { log(`updates: ${err}`); }
    onUp();
  };
  ipcMain.on('page:screen', onScreen);
  win.on('closed', () => ipcMain.removeListener('page:screen', onScreen));
  function arm() {
    clearInterval(timer); t0 = Date.now(); up = false; splash = false; failed = false; bootError = null; bootMissing = false;
    timer = setInterval(() => {
      if (win.isDestroyed() || up) return clearInterval(timer);
      // A module missing from an update on trial: no grace, the title cannot come. Anything else waits its moment: the title may still come.
      if (bootError && ((bootMissing && trial()) || Date.now() >= bootErrorAt + 10000)) { clearInterval(timer); up = true; bootFail('hard', '游戏未能启动', bootError); }
      // The package's code that got to its splash is running: as before updates, it is not timed then (a splash may wait for
      // the sound, autoplay-policy notwithstanding). An update on trial still is: one that hangs after its splash goes back.
      else if (secs() >= BOOT_LIMIT && (!splash || trial())) { clearInterval(timer); up = true; bootFail('soft', `${BOOT_LIMIT} 秒后游戏仍未进入标题画面`, '若画面随后正常出现，可以继续游玩。'); }
    }, 1000);
  }
  win.once('ready-to-show', () => log(`window ready after ${secs()}s`));
  win.on('unresponsive', () => log('window unresponsive'));
  win.on('responsive', () => log('window responsive again'));
  // Closed during the opening splash with nothing failed: the player's choice, not a failed start of the update on trial.
  win.on('close', () => { if (!up && splash && !failed && trial()) { updater.uncount(); log(`closed before the title: start of update ${updater.state.active.version} not counted`); } });
  wc.on('did-navigate', () => { fresh = true; });
  wc.on('did-finish-load', () => log(`page loaded after ${secs()}s`));
  wc.on('did-fail-load', (_e, code, desc, url, isMain) => {
    log(`load failed ${code} ${desc} ${url}`);
    if (!isMain) return;
    if (up) fail('游戏页面加载失败', `${desc} (${code})`);
    else { up = true; clearInterval(timer); bootFail('hard', '游戏页面加载失败', `${desc} (${code})`); }
  });
  wc.on('render-process-gone', (_e, d) => {
    if (d.reason === 'clean-exit') return;
    if (up) fail('游戏页面进程意外退出', `${d.reason} (退出码 ${d.exitCode})`);
    else { up = true; clearInterval(timer); bootFail('soft', '游戏页面进程意外退出', `${d.reason} (退出码 ${d.exitCode})`); }
  });
  wc.on('console-message', (e) => {
    if (e.level !== 'error' && e.level !== 'warning') return;
    log(`page ${e.level}: ${e.message} (${e.sourceId}:${e.lineNumber})`);
    if (!up && /Uncaught|module script/i.test(e.message)) noteBootError(e.message);
  });
  arm();
  return { reload };
}

// Full screen in startup.log: a Windows player's screen went black in full screen while the game ran on, and a window dragged
// to the screen's size was fine (一光年的距离@devblog #655, 2026-11-23). Each change of the window's state is one line (its
// content, the display it is on and the page's zoom), and full screen is looked at again 1 and 3 seconds in: does the page
// still draw frames, is its WebGL context alive, and is the picture Chromium made black too. A lit picture on a black screen
// points past the game (the GPU, its driver, the system's compositor); a black one, or no frames, at the page.
const PAGE_PROBE = `new Promise((done) => {
  let n = 0; const t0 = performance.now();
  const tick = () => { n++; if (performance.now() - t0 < 500) requestAnimationFrame(tick); else done(n); };
  requestAnimationFrame(tick); setTimeout(() => done(n), 1500);
}).then((frames) => {
  const c = document.querySelector('#stage canvas'), gl = c && (c.getContext('webgl2') || c.getContext('webgl'));
  return { frames, screen: document.body?.dataset.screen || '-', shown: document.visibilityState, inner: [innerWidth, innerHeight],
    dpr: Math.round(devicePixelRatio * 100) / 100, canvas: c ? [c.width, c.height] : null, lost: gl ? gl.isContextLost() : null };
})`;
// How much of the picture Chromium made is lit, from a 48-pixel-wide copy: enough to tell black from a game.
async function pictureOf(wc) {
  try {
    const img = await wc.capturePage();
    if (img.isEmpty()) return 'none';
    const { width, height } = img.getSize(), px = img.resize({ width: 48 }).toBitmap();
    let lit = 0, sum = 0;
    const n = px.length / 4;
    for (let i = 0; i < px.length; i += 4) { const v = Math.max(px[i], px[i + 1], px[i + 2]); sum += v; if (v > 24) lit++; }
    return `${width}x${height} lit ${Math.round(lit / n * 100)}% mean ${Math.round(sum / n)}`;
  } catch (err) { return `error ${err?.message || err}`; }
}
function watchFullscreen(win) {
  const wc = win.webContents;
  const where = () => {
    const c = win.getContentBounds(), d = screen.getDisplayMatching(win.getBounds()), all = screen.getAllDisplays();
    return `content ${c.width}x${c.height} at ${c.x},${c.y}, display ${all.findIndex((a) => a.id === d.id) + 1} of ${all.length} `
      + `${d.size.width}x${d.size.height} at ${d.bounds.x},${d.bounds.y} scale ${d.scaleFactor}${d.internal ? ' internal' : ''}, zoom ${Math.round(wc.getZoomFactor() * 100) / 100}`;
  };
  let entered = 0; // which entry a probe belongs to: one left behind by a quick F11 F11 says nothing
  const probe = (k, s) => setTimeout(() => {
    if (win.isDestroyed() || k !== entered || !win.isFullScreen()) return;
    Promise.all([wc.executeJavaScript(PAGE_PROBE).catch((err) => ({ error: String(err?.message || err) })), pictureOf(wc)]).then(([p, pic]) => {
      if (win.isDestroyed() || k !== entered) return;
      const page = p.error ? `page error ${p.error}` : `frames ${p.frames}/0.5s, screen ${p.screen}, ${p.shown}, page ${p.inner.join('x')} dpr ${p.dpr}, `
        + `canvas ${p.canvas ? p.canvas.join('x') : 'none'}, context ${p.lost === null ? 'none' : p.lost ? 'LOST' : 'ok'}`;
      log(`fullscreen +${s}s: ${page}, picture ${pic}`);
    });
  }, s * 1000);
  win.on('enter-full-screen', () => { const k = ++entered; log(`window enter-full-screen: ${where()}`); probe(k, 1); probe(k, 3); });
  win.on('leave-full-screen', () => { entered++; log(`window leave-full-screen: ${where()}`); });
  for (const ev of ['maximize', 'unmaximize']) win.on(ev, () => log(`window ${ev}: ${where()}`));
}

// Where the window stood last time (its place, maximized, fullscreen), kept beside the saves. The first run asks for
// 1600x900 and gets no more than the screen has: on a 1920x1080 laptop at 150% the work area is 1280x680, and a window
// made larger than that has its title bar and ✕ off the top and the game's bottom row under the taskbar. A place that
// is on no screen any more (an unplugged monitor) is moved onto the nearest one.
const STATE_FILE = path.join(app.getPath('userData'), 'window-state.json');
const SIZE = [1600, 900], MIN = [1024, 600]; // MIN: the smallest window the game's layout is checked at (tests/sysmenu.test.mjs)
function windowPlace() {
  let saved = null;
  try { saved = JSON.parse(readFileSync(STATE_FILE, 'utf8')); } catch { /* the first run, or a file that cannot be read */ }
  const b = saved?.bounds;
  if (b && [b.x, b.y, b.width, b.height].every(Number.isFinite)) {
    const area = screen.getDisplayMatching(b).workArea;
    const width = Math.min(b.width, area.width), height = Math.min(b.height, area.height);
    const x = Math.min(Math.max(b.x, area.x), area.x + area.width - width), y = Math.min(Math.max(b.y, area.y), area.y + area.height - height);
    return { bounds: { x, y, width, height }, area, maximized: !!saved.maximized, fullscreen: !!saved.fullscreen };
  }
  const area = screen.getPrimaryDisplay().workArea;
  const width = Math.min(SIZE[0], area.width), height = Math.min(SIZE[1], area.height);
  return { bounds: { x: area.x + Math.floor((area.width - width) / 2), y: area.y + Math.floor((area.height - height) / 2), width, height },
    area, maximized: width < SIZE[0] || height < SIZE[1], fullscreen: false }; // a screen too small for it: every pixel there is
}

function createWindow() {
  const place = smokeDir ? null : windowPlace(); // a check always runs in the same window and leaves no state behind
  const win = new BrowserWindow({
    ...(place ? place.bounds : { width: SIZE[0], height: SIZE[1] }), backgroundColor: '#000000',
    minWidth: Math.min(MIN[0], place?.area.width ?? MIN[0]), minHeight: Math.min(MIN[1], place?.area.height ?? MIN[1]),
    title: '三国 HD-2D', autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, devTools, backgroundThrottling: false, preload: path.join(__dirname, 'preload.js') },
  });
  const wc = win.webContents;
  if (place?.maximized) win.maximize();
  if (place?.fullscreen) win.setFullScreen(true);
  const saveState = () => {
    if (!place) return;
    try { writeFileSync(STATE_FILE, JSON.stringify({ bounds: win.getNormalBounds(), maximized: win.isMaximized(), fullscreen: win.isFullScreen() })); }
    catch (err) { log(`window state not saved: ${err}`); }
  };
  // Fullscreen has no title bar and the game has no menu bar, so the way back must be in the game too: F11, Alt+Enter
  // and 系统 → 全屏 are one switch, and the page is told of every change to keep its row and its hint right.
  const toggleFullscreen = () => win.setFullScreen(!win.isFullScreen());
  ipcMain.on('desktop:fullscreen', (e) => { if (e.sender === wc) toggleFullscreen(); });
  ipcMain.handle('desktop:is-fullscreen', (e) => e.sender === wc && win.isFullScreen());
  win.on('enter-full-screen', () => wc.send('desktop:fullscreen', true));
  win.on('leave-full-screen', () => wc.send('desktop:fullscreen', false));
  wc.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11' || (input.alt && input.key === 'Enter')) { toggleFullscreen(); e.preventDefault(); }
    if (devTools && input.key === 'F12') { wc.toggleDevTools(); e.preventDefault(); }
  });
  // 系统 → 界面大小: the page zoomed for its screen, as far as the window holds (desktop/uiscale.js), again whenever the window
  // changes size or screen (maximize, fullscreen, a monitor of another Windows 缩放). The page says which size the player chose (setUiSize),
  // before its first paint; until then, and for a check (smokeDir: its shots are of the page at 1:1), 标准 / none.
  // The page is told the zoom in use and what the screen alone asks for ({ zoom, screen }), as it asks and whenever the window
  // changes it, so 系统 → 界面大小 can show the percent and say when the window holds a size back.
  let uiSize = 'normal';
  const applyZoom = () => {
    if (win.isDestroyed()) return { zoom: 1, screen: 1 };
    const { width, height } = win.getContentBounds(), { size: sc } = screen.getDisplayMatching(win.getBounds());
    const k = smokeDir ? 1 : zoomFor(width, height, sc.width, sc.height, uiSize);
    const z = { zoom: k, screen: smokeDir ? 1 : screenZoom(sc.width, sc.height, uiSize) };
    if (Math.abs(wc.getZoomFactor() - k) > 1e-3) { wc.setZoomFactor(k); wc.send('desktop:ui-zoom', z); }
    return z;
  };
  for (const ev of ['resize', 'maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen', 'moved']) win.on(ev, applyZoom);
  screen.on('display-metrics-changed', applyZoom);
  win.on('closed', () => screen.off('display-metrics-changed', applyZoom));
  wc.on('dom-ready', applyZoom);
  ipcMain.handle('desktop:ui-size', (e, size) => { if (e.sender !== wc) return null; if (Object.hasOwn(UI_SIZES, size)) uiSize = size; return applyZoom(); });
  // Closing the window (✕, Alt+F4, ⌘Q) with a game on asks first: nothing is saved automatically, and players lost
  // hours to a stray click (feedback F03, 2026-11-02). The page says when a game is on (setUnsaved); a page that has
  // gone, or a new one, has nothing to lose. The dialog is the system's, so it also shows over a page that is stuck.
  // 退出游戏 in the game has asked already, in its own dialog (which can record first), and closes at once.
  let unsaved = false, closing = false, asking = false;
  ipcMain.on('desktop:unsaved', (e, on) => { if (e.sender === wc) unsaved = !!on; });
  ipcMain.on('desktop:lang', (e, lang) => { if (e.sender === wc) useLang(lang); });
  ipcMain.on('desktop:quit', (e) => { if (e.sender === wc) { closing = true; win.close(); } });
  wc.on('did-navigate', () => { unsaved = false; });
  wc.on('render-process-gone', () => { unsaved = false; });
  win.on('session-end', () => { closing = true; }); // Windows is shutting down or logging off: it must not wait on a question
  win.on('close', (e) => {
    if (closing || !unsaved || smokeDir) return saveState();
    e.preventDefault();
    if (asking) return;
    asking = true;
    dialog.showMessageBox(win, { type: 'warning', title: zh('退出游戏'), message: zh('未记录的进度会丢失。确定退出游戏吗？'),
      detail: zh('要先记录，请选「取消」，再用「☰ 系统 → 记录进度」；战争中用「☰ 系统 → 中断战斗」。'), buttons: [zh('取消'), zh('不记录，退出')], defaultId: 0, cancelId: 0, noLink: true })
      .then(({ response }) => { asking = false; if (response === 1 && !win.isDestroyed()) { closing = true; win.close(); } }, () => { asking = false; });
  });
  // 记录编辑 holds the window open while changes are unwritten (its beforeunload). Electron then cancels the close without
  // a word, so ✕ and Alt+F4 seemed dead there: ask, and close only on the player's word.
  wc.on('will-prevent-unload', (e) => {
    const leave = dialog.showMessageBoxSync(win, { type: 'warning', title: zh('记录编辑'), message: zh('还有未写回的改动，关闭后会丢失。仍要关闭吗？'),
      buttons: [zh('取消'), zh('放弃改动并关闭')], defaultId: 0, cancelId: 0, noLink: true }) === 1;
    if (leave) e.preventDefault(); // preventDefault here lets the page unload
  });
  // Stay on the game origin; anything else opens in the user's browser.
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(ORIGIN)) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  // No back or forward in a game window: a mouse's side button, a swipe or Alt+← would otherwise leave an unsaved
  // game for the page before it (the save editor). The pages swallow the side buttons too (src/ui.js).
  win.webContents.on('did-navigate', () => win.webContents.navigationHistory?.clear());
  // 更新 (src/app.js updateDialog): every request checked to come from this page, as the rows above. The version changes only on
  // the title with no game on (the page asks only there; this checks again), by loading the page again in this process: a new
  // process would overlap this one on the same profile, the very case that empties Local Storage (see the lock at the top).
  const send = (st) => { if (!wc.isDestroyed()) wc.send('updater:event', st); };
  startUpdater(send);
  const mine = (e) => e.sender === wc && !!updater;
  const onTitle = async () => !unsaved && (await wc.executeJavaScript('document.body?.dataset.screen || ""').catch(() => '')) === 'title';
  let autoChecked = false;
  ipcMain.on('updater:enabled', (e) => { e.returnValue = e.sender === wc && !!updater; });
  ipcMain.handle('updater:get-state', (e) => (mine(e) ? { info: updater.info(), status: updater.status() } : null));
  ipcMain.handle('updater:check', (e) => (mine(e) ? updater.check({ manual: true }) : null));
  ipcMain.handle('updater:download', (e) => (mine(e) ? updater.download() : null));
  ipcMain.on('updater:cancel', (e) => { if (mine(e)) updater.cancel(); });
  ipcMain.handle('updater:set-auto', (e, on) => (mine(e) ? updater.setAutoCheck(on === true) : null));
  ipcMain.handle('updater:apply', async (e) => {
    if (!mine(e) || !updater.state.pending || !(await onTitle())) return false;
    updater.apply(); updater.boot(); rebuildOverlay(); log(`update ${updater.state.active?.version} applied: page reloaded`);
    watch.reload(); return true;
  });
  ipcMain.handle('updater:revert', async (e) => {
    if (!mine(e) || !updater.state.active || !(await onTitle())) return false;
    log(`update ${updater.revert()} reverted by the player: back to the package ${baseBuild.version}`); rebuildOverlay();
    watch.reload(); return true;
  });
  ipcMain.on('updater:open-download-page', (e) => { if (mine(e)) shell.openExternal(DOWNLOAD_PAGE); });
  // 启动时自动检查更新 (off unless the player turned it on): once a run, a while after the title, silent when it fails.
  const watch = watchPage(win, { onUp: () => {
    if (autoChecked || !updater?.settings().autoCheck) return;
    autoChecked = true;
    setTimeout(() => { if (updater && !win.isDestroyed()) updater.check({ manual: false }).catch(() => {}); }, 8000);
  } });
  watchFullscreen(win);
  win.loadURL(`${ORIGIN}/index.html`).catch(() => {}); // did-fail-load has already told it
  return win;
}

async function smoke(win) {
  const log = [];
  win.webContents.on('console-message', (e) => log.push(`[${e.level}] ${e.message}`));
  win.webContents.on('render-process-gone', (_e, d) => log.push(`[crash] ${d.reason}`));
  await new Promise((r) => win.webContents.once('did-finish-load', r));
  const shot = async (name, wait) => {
    await new Promise((r) => setTimeout(r, wait));
    writeFileSync(path.join(smokeDir, name), (await win.webContents.capturePage()).toPNG());
  };
  const js = (code) => win.webContents.executeJavaScript(code);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // Real mouse input at the centre of the first element matching selector (and text, if given).
  const click = async (selector, text = '') => {
    const r = await js(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(selector)})].filter((e) => e.textContent.includes(${JSON.stringify(text)}) && e.getClientRects().length)
      .sort((a, b) => a.textContent.length - b.textContent.length)[0]; // innermost match
      if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) }; })()`);
    if (!r) throw new Error(`no ${selector} ${text}`);
    for (const type of ['mouseDown', 'mouseUp']) win.webContents.sendInputEvent({ type, x: r.x, y: r.y, button: 'left', clickCount: 1 });
    await wait(700);
  };
  const probe = () => js(`({
    screen: document.body.dataset.screen,
    fonts: ['112px "Ma Shan Zheng"', '20px "Noto Serif SC"'].map((f) => document.fonts.check(f, '三国')),
    webgl: !!document.querySelector('#stage canvas'),
    sfx: Object.fromEntries(Object.entries(window.__game?.audio?.files || {}).filter(([k]) => k.startsWith('sfx-')).map(([k, v]) => [k, v.split('/').slice(-2).join('/')])),
    bgm: (() => { const a = window.__game?.audio, b = a?.bgm; return a?.bgmKey ? { src: a.url(a.bgmKey), state: a.bgmState(), at: a.bgmTime(), loop: b?.buf ? [b.buf.start, b.buf.end] : null } : null; })(),
  })`);
  const steps = {};
  const step = async (name, fn) => {
    try { await fn(); steps[name] = await probe(); } catch (err) { steps[name] = { error: String(err) }; }
    await shot(`${Object.keys(steps).length}-${name}.png`, 0);
  };
  await step('title', () => wait(10000));
  await step('strategy', async () => {
    // A click during the title animation only skips it, so retry until the ruler picker opens.
    for (let i = 0; i < 8 && !(await js('!!document.querySelector(".ruler")')); i++) await click('*', '新的征程').catch(() => wait(700));
    await click('.ruler', '曹操'); await click('.ruler', '曹操');
    for (let i = 0; i < 40 && (await js('document.body.dataset.screen')) !== 'strategy'; i++) await wait(250);
    await wait(2500);
    const { width, height } = win.getContentBounds();
    for (let i = 0; i < 4; i++) { for (const type of ['mouseDown', 'mouseUp']) win.webContents.sendInputEvent({ type, x: width / 2, y: height - 120, button: 'left', clickCount: 1 }); await wait(600); }
  });
  await step('tactical', async () => {
    await js('window.__run = window.__game.debug.quickTactical(38, 51, 2); 0');
    for (let i = 0; i < 40 && !(await js('!!document.querySelector(".tq-form")')); i++) await wait(250);
    await click('.tq-form'); await wait(400); await click('.tq-deploy'); await wait(5000); // picked, then deployed (D32 phase 2)
  });
  const miss = [...new Set(missing)];
  writeFileSync(path.join(smokeDir, 'report.json'), JSON.stringify({
    steps, missing: miss.filter((m) => !EXPECTED_MISS.test(m)), fallbackProbes: miss.filter((m) => EXPECTED_MISS.test(m)).length,
    console: log.filter((l) => !l.includes('Electron Security Warning')),
  }, null, 1));
  app.quit();
}

// No menu bar. On a Mac that would also take ⌘Q away, so the application menu keeps the one item.
const appMenu = () => (process.platform === 'darwin' ? Menu.buildFromTemplate([{ label: app.name, submenu: [{ role: 'quit', label: zh('退出游戏') }] }]) : null);
if (process.platform !== 'darwin') Menu.setApplicationMenu(null);
app.on('child-process-gone', (_e, d) => log(`child process gone: ${d.type} ${d.reason} (exit ${d.exitCode})`)); // the GPU process among them
app.whenReady().then(() => {
  log('app ready');
  if (!existsSync(path.join(ROOT, 'index.html'))) { fail('游戏文件不完整', '找不到游戏页面。请把压缩包完整解压后，再运行解压目录里的程序。'); return app.exit(1); }
  log(`displays ${screen.getAllDisplays().map((d) => `${d.size.width}x${d.size.height} at ${d.bounds.x},${d.bounds.y} scale ${d.scaleFactor}${d.internal ? ' internal' : ''}`).join('; ')}`);
  app.getGPUInfo('basic').then((info) => log(`gpu ${JSON.stringify(info.gpuDevice)} features ${JSON.stringify(app.getGPUFeatureStatus())}`), (err) => log(`gpu info: ${err}`));
  protocol.handle('app', serve);
  if (process.platform === 'darwin') Menu.setApplicationMenu(appMenu());
  const win = createWindow();
  log('window created');
  if (smokeDir) { mkdirSync(smokeDir, { recursive: true }); smoke(win); }
});
app.on('window-all-closed', () => app.quit());
