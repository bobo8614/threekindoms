// Frame-cost probe of the 战略地图, the war map and a live 白兵, silent and headless (AGENTS.md), for before /
// after checks of rendering changes (docs/性能分析与优化方案_2026-10-28.md).
//   node hd2d-mvp/tools/perf_bench.mjs [out_dir] [--url …] [--size 1600x900] [--dpr 1] [--rounds 5] [--quality high|medium|low]
// Per screen it reports (results.json, a screenshot and the top JS self-time per screen):
//  - frame: wall time of one composed frame with the GPU drained (1 px readback of the default framebuffer — reading
//    a half-float target that way is an invalid call and would not wait), median and range over interleaved rounds;
//  - save*: what switching one stage off saves against that, measured in the same rounds through the game's own
//    pipeline: AO, bloom, the vertical DoF pass (the horizontal one is also the copy out of the scene target, so
//    the depth of field costs about twice that), the shadow map frozen;
//  - cpuSubmit: the render call alone after a drained GPU (JS plus GL command encoding);
//  - the natural rAF loop, before and after the readbacks above, uncapped (loopFirst, loop): every run forces 帧率 不限 (hd2d-fps off), so these are not comparable with runs from before that (a cap held them at the display's rate); draw calls, meshes, shadow casters, GPU resources, pointer-hover cost, long tasks;
//  - process: the footprint of Chrome's GPU process and of all its processes; marks.title: page start to the title's boot done;
//  - tacticalRebuild: GPU geometries / textures before and after rebuilding the 白兵 field ten times.
// Headless numbers swing with machine load (up to ~2× between runs); compare within a run, or two builds back to
// back on the same machine (e.g. a HEAD worktree served on its own port). GPU timer queries are exposed headless
// but report overlapping, inflated spans on ANGLE / Metal, so stage costs come from the switch-off deltas.
// Needs the dev server (python3 hd2d-mvp/tools/serve.py) and Playwright, like map_capture.mjs.
import { launchChrome } from './headless.mjs';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'perf-bench');
const [W, H] = arg('--size', '1600x900').split('x').map(Number);
const DPR = Number(arg('--dpr', 1)), ROUNDS = Number(arg('--rounds', 5)), QUALITY = arg('--quality', 'high');
const URL = arg('--url', 'http://localhost:8642/hd2d-mvp/?mute');
mkdirSync(out, { recursive: true });

const browser = await launchChrome(URL, ['--disable-gpu-vsync', '--disable-frame-rate-limit']);
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && errors.push(m.text()));
await page.addInitScript((q) => {
  try { localStorage.setItem('hd2d-quality', q); localStorage.setItem('hd2d-fps', 'off'); } catch {} // uncapped, or the natural loop only says a light screen reached the cap
  window.__lt = [];
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push([Math.round(e.startTime), Math.round(e.duration), document.body?.dataset.screen]); }).observe({ type: 'longtask', buffered: true });
}, QUALITY);
const cdp = await ctx.newCDPSession(page);

await page.goto(URL); await page.waitForFunction(() => window.__game?.debug, null, { timeout: 120000 });
const titleMs = Math.round(await page.evaluate(() => performance.now())); // navigation to the title's boot done: maps built, first picture in
await page.waitForTimeout(1500);
await page.addScriptTag({ content: `
window.__perf = async (rounds) => {
  const post = __game.debug.post, comp = post.composer, r = comp.renderer, gl = r.getContext(), scene = comp.passes[0].scene;
  const px = new Uint8Array(4), finish = () => { const rfb = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING); gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); gl.bindFramebuffer(gl.READ_FRAMEBUFFER, rfb); };
  const med = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];
  // The flat war map (src/warmap2d.js) draws on its own 2D canvas and renders no 3D frame at all (app.js): its
  // frame is the view's update with that canvas read back (drained) instead; the stage switches change nothing.
  // The flat 战略地图 (src/strategyflat.js) is the same, on its canvas.
  const screen = document.body.dataset.screen, flat = screen === 'war' && __game.war?.flat ? __game.war : screen === 'strategy' && __game.strategy.flat ? __game.strategy : null;
  const cv2 = flat && document.querySelector(flat === __game.war ? '.flatwar canvas' : '.flatstrategy canvas').getContext('2d');
  const one = flat ? () => { flat.update(1 / 60); cv2.getImageData(0, 0, 1, 1); } : () => { post.render(); finish(); };
  // The natural loop; the first two callbacks still carry the synchronous work before it.
  const natural = () => new Promise((done) => { const ts = []; let last = 0, n = 0; const end = performance.now() + 3000; const f = () => { const t = performance.now(); if (n++ >= 2) ts.push(t - last); last = t; if (t < end) requestAnimationFrame(f); else { ts.sort((a, b) => a - b); done({ fps: +(1000 / (ts.reduce((a, b) => a + b, 0) / ts.length)).toFixed(1), p50: +ts[ts.length >> 1].toFixed(1), p95: +ts[Math.floor(ts.length * 0.95)].toFixed(1), max: +ts[ts.length - 1].toFixed(1) }); } }; requestAnimationFrame(f); });
  const loopFirst = await natural(); // before any readback below, which may move a 2D canvas to software
  const frames = (n = 16) => { for (let i = 0; i < 4; i++) one(); const ts = []; for (let i = 0; i < n; i++) { const a = performance.now(); one(); ts.push(performance.now() - a); } return med(ts); };
  const bloom = comp.passes[3], dofV = comp.passes[2], gtaoRender = post.gtao.render;
  const V = { frame: [], noAO: [], noBloom: [], noDofV: [], frozenShadow: [] };
  for (let k = 0; k < rounds; k++) {
    V.frame.push(frames());
    post.gtao.render = () => {}; V.noAO.push(frames()); post.gtao.render = gtaoRender;
    bloom.enabled = false; V.noBloom.push(frames()); bloom.enabled = true;
    dofV.enabled = false; V.noDofV.push(frames()); dofV.enabled = true;
    r.shadowMap.autoUpdate = false; r.shadowMap.needsUpdate = false; V.frozenShadow.push(frames()); r.shadowMap.autoUpdate = true;
  }
  const sum = (a) => ({ med: +med(a).toFixed(1), min: +Math.min(...a).toFixed(1), max: +Math.max(...a).toFixed(1) });
  const save = (k) => sum(V[k].map((x, i) => V.frame[i] - x));
  const cpu = []; for (let i = 0; i < 4; i++) post.render(); for (let i = 0; i < 20; i++) { finish(); const a = performance.now(); post.render(); cpu.push(performance.now() - a); } finish();
  r.info.autoReset = false; r.info.reset(); post.render(); finish(); const calls = r.info.render.calls, tris = r.info.render.triangles; r.info.autoReset = true;
  let meshes = 0, shadowCasters = 0; scene.traverse((o) => { if (!o.isMesh) return; for (let p = o; p; p = p.parent) if (!p.visible) return; meshes++; if (o.castShadow) shadowCasters++; });
  await new Promise((d) => setTimeout(d, 500));
  const loop = await natural();
  return { flat: !!flat, canvas: flat ? [cv2.canvas.width, cv2.canvas.height] : [gl.drawingBufferWidth, gl.drawingBufferHeight], frame: sum(V.frame), saveAO: save('noAO'), saveBloom: save('noBloom'), saveDofV: save('noDofV'), saveFrozenShadow: save('frozenShadow'),
    cpuSubmit: +med(cpu).toFixed(2), calls, tris, meshes, shadowCasters, memory: { ...r.info.memory }, programs: r.info.programs.length, loopFirst, loop };
};` });
// Chrome's own memory, GPU process apart (physical footprint: textures and canvases count there, and three's r.info.memory does not see a 2D canvas).
function chromeMemory() {
  const procs = execSync('ps -axo pid=,ppid=,command=', { maxBuffer: 1 << 26 }).toString().split('\n').map((l) => l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/)).filter(Boolean).map((m) => ({ pid: +m[1], ppid: +m[2], cmd: m[3] }));
  const mine = new Set([process.pid]); for (let again = true; again;) { again = false; for (const p of procs) if (mine.has(p.ppid) && !mine.has(p.pid)) { mine.add(p.pid); again = true; } }
  const mb = (pid) => { try { const m = execSync(`top -l 1 -stats mem -pid ${pid}`).toString().trim().split('\n').at(-1).trim().match(/^([\d.]+)([KMG])/); return +m[1] * { K: 1 / 1024, M: 1, G: 1024 }[m[2]]; } catch { return 0; } };
  const chrome = procs.filter((p) => mine.has(p.pid) && p.pid !== process.pid && /chrome/i.test(p.cmd));
  const gpu = chrome.find((p) => p.cmd.includes('--type=gpu-process'));
  return { gpuMB: gpu ? Math.round(mb(gpu.pid)) : null, allMB: Math.round(chrome.reduce((a, p) => a + mb(p.pid), 0)) };
}

const results = {};
const bench = async (label) => {
  await page.waitForTimeout(1500);
  results[label] = await page.evaluate((n) => window.__perf(n), ROUNDS);
  results[label].process = chromeMemory();
  await page.screenshot({ path: join(out, `${label}.png`) });
  // JS self-time while the game runs on its own.
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start');
  await page.waitForTimeout(4000);
  const { profile: p } = await cdp.send('Profiler.stop');
  const self = {}, byId = new Map(p.nodes.map((n) => [n.id, n]));
  p.samples.forEach((id, i) => { const f = byId.get(id).callFrame, k = `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber + 1}`; self[k] = (self[k] || 0) + (p.timeDeltas[i] || 0) / 1000; });
  const total = Object.values(self).reduce((a, b) => a + b, 0);
  results[label].cpuTop = Object.entries(self).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${(v / total * 100).toFixed(1)}%  ${k}`);
  console.log(label, JSON.stringify({ frame: results[label].frame, saveAO: results[label].saveAO, cpuSubmit: results[label].cpuSubmit, calls: results[label].calls, fps: results[label].loop.fps }));
};
const hover = () => page.evaluate(() => {
  const c = document.querySelector('#stage canvas'), ts = [];
  for (let i = 0; i < 60; i++) { const a = performance.now(); c.dispatchEvent(new PointerEvent('pointermove', { clientX: 200 + i * 20, clientY: 300 + (i % 7) * 30, bubbles: true })); ts.push(performance.now() - a); }
  ts.sort((a, b) => a - b); return { med: +ts[30].toFixed(2), max: +ts[59].toFixed(2) };
});
const marks = { title: titleMs }, mark = async (k) => { marks[k] = Math.round(await page.evaluate(() => performance.now())); };

// 战略地图: a new game as 曹操 (the title's button is clicked through the DOM; its intro overlay takes pointer clicks).
await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('新的征程')));
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('新的征程')).click()); await page.waitForTimeout(800);
await page.locator('.ruler', { hasText: '曹操' }).click(); await page.locator('.ruler', { hasText: '曹操' }).click();
await page.waitForFunction(() => document.body.dataset.screen === 'strategy', null, { timeout: 60000 });
await page.waitForTimeout(2500);
for (let i = 0; i < 4; i++) { await page.mouse.click(W / 2, H - 120); await page.waitForTimeout(600); }
await bench('strategy'); results.strategy.hover = await hover();

// War: 曹操 marches on 冀州 with every officer, through deployment to the player's first turn.
await mark('warStart');
await page.keyboard.press('2'); await page.waitForTimeout(400);
await page.locator('button', { hasText: '出阵' }).first().click(); await page.waitForTimeout(600);
await page.locator('.mappick *').filter({ hasText: /^冀州/ }).last().click(); await page.waitForTimeout(800);
await page.getByRole('button', { name: '全选' }).click(); await page.getByRole('button', { name: '确定' }).click(); await page.waitForTimeout(700);
for (let i = 0; i < 20 && await page.evaluate(() => document.body.dataset.screen !== 'war'); i++) {
  const b = page.locator('.modal button.primary, .shade button.primary, .modal button:has-text("确定"), .modal button:has-text("出阵")').last();
  if (await b.count()) await b.click().catch(() => {}); else await page.keyboard.press('Enter'); // Enter skips a command vignette
  await page.waitForTimeout(1500);
}
await page.waitForFunction(() => document.body.dataset.screen === 'war', null, { timeout: 60000 });
await page.waitForTimeout(3000);
await page.evaluate(() => window.__game.war.finishDeploy());
await page.waitForFunction(() => { const w = window.__game.war; return w && w.field.turn === w.field.human && !w.st.busy; }, null, { timeout: 90000 });
await mark('warReady');
await bench('war'); results.war.hover = await hover();

// 白兵, live: a formation picked and 开始交战 pressed (the opening pause would measure a still field).
await page.evaluate(() => { const tv = window.__game.tview, build = tv.build; tv.build = (b, l) => { window.__tb = [b, l]; return build(b, l); }; });
await mark('tacStart');
await page.evaluate(() => { window.__tac = window.__game.debug.quickTactical(38, 51, 2); });
await page.locator('.tq-form').first().waitFor({ timeout: 30000 }); await page.locator('.tq-form').first().click(); await page.locator('.tq-deploy:not(.arming)').click();
await page.waitForTimeout(1500);
const start = page.getByRole('button', { name: /开始交战/ }); await start.waitFor({ timeout: 15000 }); await start.click();
await mark('tacLive');
await page.waitForTimeout(2000);
await bench('tactical');

// GPU resources held after the 白兵 field is rebuilt ten times (each formation pick and each new battle rebuilds it).
results.tacticalRebuild = await page.evaluate(async () => {
  const r = window.__game.debug.post.composer.renderer, tv = window.__game.tview, [b, l] = window.__tb;
  const snap = () => ({ geometries: r.info.memory.geometries, textures: r.info.memory.textures });
  const before = snap();
  for (let i = 0; i < 10; i++) { tv.build(b, l); await new Promise((d) => requestAnimationFrame(d)); }
  return { before, after10: snap() };
});
console.log('tacticalRebuild', JSON.stringify(results.tacticalRebuild));

results.longtasks = (await page.evaluate(() => window.__lt)).filter((x) => x[1] > 150);
results.marks = marks;
writeFileSync(join(out, 'results.json'), JSON.stringify({ W, H, DPR, ROUNDS, QUALITY, url: URL, results, errors }, null, 1));
console.log(`→ ${join(out, 'results.json')}`, errors.length ? `errors: ${errors.slice(0, 3).join(' | ')}` : 'no page errors');
await page.goto('about:blank'); await browser.close();
