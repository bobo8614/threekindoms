// Scene-switch attribution (PERF-05, docs/性能优化方案_2026-11-07.md): where the main thread blocks when the game
// changes scene — 战略 → 战争 (3D or the flat map), 战争 → 白兵, 改布阵, 白兵 → 单挑, back to 白兵 and the war,
// 战后结算 and back to the strategy map — cold, a second time, and after a change of season, for the player as
// attacker and as defender.
//
// Muted headless Chrome (tools/headless.mjs, ?mute). Per transition it records Long Animation Frames (and longtasks),
// the game's phase measures (performance.measure 'war:*', 'tac:*', 'duel:*' in src/warview.js, tacticalview.js,
// warplate.js, duelview.js), every post.render() call with the shader programs it added, and a CDP CPU profile; the
// profile's samples are put on the page clock so each long frame gets its phases, cost categories (shader compile,
// texture / buffer upload, 2D canvas, GC, JS) and hottest functions with file and line.
//
//   python3 hd2d-mvp/tools/serve.py 8793 &
//   node hd2d-mvp/tools/scene_switch_trace.mjs /tmp/sst-high --url 'http://localhost:8793/hd2d-mvp/?mute' --quality high
//   node hd2d-mvp/tools/scene_switch_trace.mjs /tmp/sst-flat --url 'http://localhost:8793/hd2d-mvp/?mute&flat' --quality high
//   node hd2d-mvp/tools/scene_switch_trace.mjs /tmp/sst-low  --url 'http://localhost:8793/hd2d-mvp/?mute' --quality low
// Options: --size 1600x900 --dpr 2 --interval 200 (µs between profile samples) --only war,tac (step groups).
// Writes <out>/trace.json (everything) and <out>/summary.md. Timing runs share the GPU with other sessions: take the
// bench lock (mkdir /tmp/sangguo-gpu-bench.lock) around a run.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { launchChrome } from './headless.mjs';
import { newCampaign, closeMessages } from '../tests/game.mjs';

const argv = process.argv.slice(2), out = argv[0];
if (!out || out.startsWith('--')) { console.error('usage: scene_switch_trace.mjs <outdir> --url <game url with ?mute> [--quality high|medium|low] [--size WxH] [--dpr N] [--interval µs] [--only war,tac,def,season]'); process.exit(2); }
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i > 0 ? argv[i + 1] : d; };
const URL_ = opt('url', 'http://localhost:8793/hd2d-mvp/?mute'), QUALITY = opt('quality', 'high');
const [VW, VH] = opt('size', '1600x900').split('x').map(Number), DPR = Number(opt('dpr', '2')), INTERVAL = Number(opt('interval', '200'));
const ONLY = new Set(opt('only', 'war,tac,def,season').split(','));
if (!/[?&]mute\b/.test(URL_)) { console.error('the url must carry ?mute (AGENTS.md)'); process.exit(2); }
mkdirSync(out, { recursive: true });

// ---------- In-page recorders ----------
function pageInit() {
  const S = window.__sst = { loaf: [], lt: [], frames: [], ev: {}, renders: [], recording: false };
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) S.loaf.push({ start: e.startTime, dur: e.duration, block: e.blockingDuration, renderStart: e.renderStart, styleStart: e.styleAndLayoutStart,
      scripts: e.scripts.map((s) => ({ start: s.startTime, dur: s.duration, inv: s.invoker, type: s.invokerType, fn: s.sourceFunctionName, url: s.sourceURL, pos: s.sourceCharPosition, forced: s.forcedStyleAndLayoutDuration, pause: s.pauseDuration })) }); })
      .observe({ type: 'long-animation-frame', buffered: true });
  } catch {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) S.lt.push({ start: e.startTime, dur: e.duration }); }).observe({ type: 'longtask', buffered: true }); } catch {}
  const tick = (t) => { S.frames.push(t); if (S.frames.length > 4000) S.frames.splice(0, 2000); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  // When the game itself leaves a scene: the 单挑 panel goes, the 白兵 letterbox lifts, the screen changes.
  const watch = () => new MutationObserver(() => {
    const now = performance.now(), duel = !!document.querySelector('.tq-duel'), cine = document.body.classList.contains('cine'), screen = document.body.dataset.screen;
    if (S.duel && !duel) S.ev.duelOff = now; S.duel = duel;
    if (S.cine && !cine) S.ev.cineOff = now; S.cine = cine;
    if (S.screen !== screen) { S.ev[`screen:${screen}`] = now; S.screen = screen; }
  }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'data-screen'] });
  if (document.body) watch(); else addEventListener('DOMContentLoaded', watch);
}
// Wraps post.render(): each call's time and the shader programs it added, while a window records.
function hookRender() {
  const { post, renderer } = window.__game.debug, S = window.__sst, orig = post.render.bind(post);
  post.render = (...a) => {
    if (!S.recording) return orig(...a);
    const p0 = renderer.info.programs?.length ?? 0, t = performance.now(); orig(...a);
    S.renders.push({ start: t, dur: performance.now() - t, programs: (renderer.info.programs?.length ?? 0) - p0 });
  };
}

// ---------- Profile on the page clock ----------
const CANVAS2D = new Set(['drawImage', 'fill', 'fillRect', 'stroke', 'getImageData', 'putImageData', 'createPattern', 'fillText', 'strokeText', 'clip', 'createImageData', 'arc', 'lineTo', 'moveTo', 'beginPath', 'closePath', 'rect', 'save', 'restore', 'setTransform', 'translate', 'rotate', 'scale', 'quadraticCurveTo', 'bezierCurveTo', 'ellipse', 'measureText', 'createRadialGradient', 'createLinearGradient', 'addColorStop', 'toDataURL', 'getContext']);
function category(stack) { // leaf first
  for (const f of stack) {
    const n = f.functionName, u = f.url;
    if (n === '(garbage collector)') return 'gc';
    if (n === '(idle)') return 'idle';
    if (n === '(program)') return 'program';
    if (!u) {
      if (/^(compileShader|linkProgram|getProgramParameter|getShaderParameter|getProgramInfoLog|getShaderInfoLog|shaderSource|attachShader|createProgram|createShader|getUniformLocation|getActiveUniform|getActiveAttrib|getAttribLocation)$/.test(n)) return 'shader';
      if (/^(texImage2D|texSubImage2D|texImage3D|texSubImage3D|texStorage2D|texStorage3D|generateMipmap|compressedTexImage2D|compressedTexSubImage2D)$/.test(n)) return 'texture-upload';
      if (/^(bufferData|bufferSubData)$/.test(n)) return 'buffer-upload';
      if (/^(readPixels|clientWaitSync|getError|finish)$/.test(n)) return 'gpu-sync';
      if (/^(drawElements|drawArrays|drawElementsInstanced|drawArraysInstanced|drawBuffers|clear|blitFramebuffer|framebufferTexture2D|bindFramebuffer|uniformMatrix4fv|uniform\w+)$/.test(n)) return 'gl-draw';
      if (CANVAS2D.has(n)) return 'canvas2d';
      continue; // other natives: judge by the caller
    }
    if (/three\.module/.test(u) && /^(WebGLProgram|fetchUniformLocations|fetchAttributeLocations|getProgram|compile|compileAsync|onFirstUse)$/.test(n)) return 'shader';
    if (/three\.module/.test(u) && /^(uploadTexture|setTexture2D|setTexture|initTexture|uploadImage)$/.test(n)) return 'texture-upload';
    return 'js';
  }
  return 'js';
}
const short = (f) => `${f.functionName || '(anon)'} ${f.url ? `${basename(f.url.split('?')[0])}:${f.lineNumber + 1}` : '(native)'}`;
function placeProfile(profile, perfAtStart) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n])), parent = new Map();
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const stackOf = new Map();
  const stack = (id) => { if (stackOf.has(id)) return stackOf.get(id); const s = []; for (let x = id; x != null; x = parent.get(x)) { const cf = byId.get(x).callFrame; if (cf.functionName !== '(root)') s.push(cf); } stackOf.set(id, s); return s; };
  const samples = []; let t = profile.startTime;
  for (let i = 0; i < profile.samples.length; i++) {
    t += profile.timeDeltas[i];
    const dt = (profile.timeDeltas[i + 1] ?? INTERVAL) / 1000;
    samples.push({ t: perfAtStart + (t - profile.startTime) / 1000, dt, stack: stack(profile.samples[i]) });
  }
  return samples;
}
function attribute(samples, from, to, measures) {
  const inside = samples.filter((s) => s.t >= from && s.t < to);
  const cats = {}, self = new Map(), incl = new Map(), phases = {};
  for (const s of inside) {
    const c = category(s.stack); cats[c] = (cats[c] ?? 0) + s.dt;
    if (c === 'idle') continue;
    const leaf = s.stack.find((f) => f.url || !['(program)'].includes(f.functionName)) ?? s.stack[0];
    if (leaf) self.set(short(leaf), (self.get(short(leaf)) ?? 0) + s.dt);
    const seen = new Set();
    for (const f of s.stack) if (/\/src\//.test(f.url)) { const k = short(f); if (!seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) ?? 0) + s.dt); } }
    // innermost game phase measure holding the sample
    const m = measures.filter((x) => x.start <= s.t && s.t < x.start + x.dur).sort((a, b) => a.dur - b.dur)[0];
    const p = m ? m.name : 'outside measures';
    phases[p] ??= {}; phases[p][c] = (phases[p][c] ?? 0) + s.dt;
  }
  const top = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => [k, +v.toFixed(1)]);
  const round = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'number' ? +v.toFixed(1) : round(v)]));
  return { sampledMs: +inside.reduce((a, s) => a + s.dt, 0).toFixed(1), categories: round(cats), phases: round(phases), self: top(self, 12), inclusive: top(incl, 15) };
}

// ---------- Run ----------
const browser = await launchChrome(URL_, ['--disable-gpu-vsync']);
const result = { url: URL_, quality: QUALITY, size: [VW, VH], dpr: DPR, interval: INTERVAL, started: new Date().toISOString(), chrome: browser.version(), windows: [], memory: [], errors: [] };
let page, cdp;
const save = () => writeFileSync(join(out, 'trace.json'), JSON.stringify(result, null, 1));
try {
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: DPR });
  await ctx.addInitScript((q) => { try { localStorage.setItem('hd2d-quality', q); } catch {} }, QUALITY);
  await ctx.addInitScript(pageInit);
  page = await ctx.newPage();
  page.on('pageerror', (e) => result.errors.push(e.message));
  cdp = await ctx.newCDPSession(page);
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: INTERVAL });
  await page.goto(URL_); await page.waitForFunction(() => window.__game?.debug, null, { timeout: 90000 });
  await page.evaluate(hookRender);
  const stop = closeMessages(page);
  await newCampaign(page, '曹操');
  result.flatWar = null;
  await page.evaluate(() => { window.__snap = JSON.stringify(window.__game.g); });
  const memory = async (label) => result.memory.push({ label, ...(await page.evaluate(() => { const r = window.__game.debug.renderer; return { ...r.info.memory, programs: r.info.programs?.length ?? 0, jsHeapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null }; })) });
  await memory('strategy, before any war');

  // One window: mark, profile, act, wait; then the long frames from `from` (the action, or a game event) to 1.5 s after the end.
  async function win(name, act, { until, event = null, settle = 1500, timeout = 60000 } = {}) {
    const t0 = await page.evaluate(() => { const S = window.__sst; S.recording = true; S.renders = []; S.ev = {}; return performance.now(); });
    await cdp.send('Profiler.start');
    const perfAtStart = await page.evaluate(() => performance.now());
    let error = null;
    try { await act(); if (until) await page.waitForFunction(until, null, { timeout, polling: 50 }); await page.waitForTimeout(settle); } catch (e) { error = e.message.split('\n')[0]; }
    const { profile } = await cdp.send('Profiler.stop');
    const r = await page.evaluate(({ t0, event }) => {
      const S = window.__sst; S.recording = false;
      const end = performance.now(), from = event ? (S.ev[event] ?? t0) - 1000 : t0;
      const measures = performance.getEntriesByType('measure').filter((m) => m.startTime >= t0 - 1).map((m) => ({ name: m.name, start: m.startTime, dur: m.duration }));
      performance.clearMeasures();
      const loaf = S.loaf.filter((f) => f.start >= from && f.start < end), lt = S.lt.filter((f) => f.start >= from && f.start < end);
      const fr = S.frames.filter((t) => t >= from && t <= end), gaps = fr.slice(1).map((t, i) => t - fr[i]);
      const evAt = event ? S.ev[event] ?? null : null;
      // the first second after the scene is up (the window's end less its settle): the longest gap between frames
      return { t0, from, end, evAt, events: S.ev, measures, loaf, lt, renders: S.renders, frameCount: fr.length, maxGap: gaps.length ? Math.max(...gaps) : null };
    }, { t0, event });
    const samples = placeProfile(profile, perfAtStart);
    const settleFrom = r.end - settle, after = await page.evaluate(({ a, b }) => { const fr = window.__sst.frames.filter((t) => t >= a && t <= b); const g = fr.slice(1).map((t, i) => t - fr[i]); return { frames: fr.length, maxGap: g.length ? +Math.max(...g).toFixed(1) : null }; }, { a: settleFrom, b: r.end });
    const longs = r.loaf.filter((f) => f.dur >= 50).sort((a, b) => b.dur - a.dur);
    const w = {
      name, error, wallMs: +(r.end - r.t0).toFixed(0), from: r.from - r.t0, eventAt: r.evAt != null ? +(r.evAt - r.t0).toFixed(0) : null,
      longFrames: longs.length, longestMs: longs[0] ? +longs[0].dur.toFixed(0) : 0, blockingMs: +r.loaf.reduce((a, f) => a + f.block, 0).toFixed(0),
      longtasks: r.lt.map((x) => +x.dur.toFixed(0)), maxFrameGap: r.maxGap != null ? +r.maxGap.toFixed(0) : null, afterSettle: after,
      measures: r.measures.map((m) => ({ name: m.name, at: +(m.start - r.t0).toFixed(0), ms: +m.dur.toFixed(1) })),
      renders: { count: r.renders.length, first: r.renders[0] ? { at: +(r.renders[0].start - r.t0).toFixed(0), ms: +r.renders[0].dur.toFixed(1), programs: r.renders[0].programs } : null,
        slow: r.renders.filter((x) => x.dur > 16).map((x) => ({ at: +(x.start - r.t0).toFixed(0), ms: +x.dur.toFixed(1), programs: x.programs })), programsAdded: r.renders.reduce((a, x) => a + x.programs, 0) },
      frames: longs.slice(0, 4).map((f) => ({ at: +(f.start - r.t0).toFixed(0), ms: +f.dur.toFixed(0), blockMs: +f.block.toFixed(0), renderMs: f.renderStart ? +(f.start + f.dur - f.renderStart).toFixed(0) : null,
        scripts: f.scripts.sort((a, b) => b.dur - a.dur).slice(0, 4).map((s) => ({ ms: +s.dur.toFixed(0), inv: s.inv, fn: s.fn, src: s.url ? `${basename(s.url.split('?')[0])}@${s.pos}` : '' })),
        phases: r.measures.filter((m) => m.start < f.start + f.dur && m.start + m.dur > f.start).map((m) => `${m.name} ${m.dur.toFixed(0)}`),
        profile: attribute(samples, f.start, f.start + f.dur, r.measures) })),
      whole: attribute(samples, r.from, r.end, r.measures),
    };
    result.windows.push(w); save();
    console.log(`${name.padEnd(34)} wall ${String(w.wallMs).padStart(6)} ms  long ${w.longFrames}  longest ${String(w.longestMs).padStart(4)} ms  blocking ${w.blockingMs} ms${error ? `  ERROR ${error}` : ''}`);
    return w;
  }

  // ---------- Steps ----------
  const restore = () => page.evaluate(() => { const g = window.__game.g, s = JSON.parse(window.__snap); for (const k of Object.keys(g)) delete g[k]; Object.assign(g, s); window.__game.strategy.refresh(g); });
  // human 'att': the player's home attacks its strongest AI neighbour; 'def': that neighbour attacks the home.
  const enterWar = (human) => page.evaluate((human) => {
    const { g, G, debug } = window.__game, home = g.factions[g.player].city;
    const foe = G.roads(home).map((c) => g.cities[c]).filter((c) => c.faction !== g.player && c.faction !== G.NONE && c.officers.length).sort((a, b) => b.officers.length - a.officers.length)[0];
    for (const id of [...g.cities[home].officers, ...foe.officers]) g.officers[id].soldiers ||= 500;
    const [from, to] = human === 'att' ? [home, foe.id] : [foe.id, home];
    const ids = g.cities[from].officers.slice(0, 3);
    const w = debug.setupWar(g, { from, to, ids, commander: ids[0], gold: 100, rice: 400 });
    window.__warDone = false; debug.fieldWar(w, human).then(() => { window.__warDone = true; });
    return { human, city: to, from, month: g.month };
  }, human).then((x) => { (result.wars ??= []).push(x); return x; });
  const warUp = () => window.__game.war?.finishDeploy && document.body.dataset.screen === 'war' && !document.querySelector('.banner') && !document.querySelector('#fade.on');
  const toTurn = async () => {
    await page.evaluate(() => window.__game.war.finishDeploy());
    await page.waitForFunction(() => { const f = window.__game.war.field; return f.turn === f.human && !document.querySelector('.banner, .panel.msg'); }, null, { timeout: 90000 });
  };
  const flatNow = () => page.evaluate(() => !!window.__game.war?.flat);
  // A 白兵 from the war: hs 'a' — our first general attacks the nearest foe; 'd' — the foe attacks him.
  const cutIn = (hs) => page.evaluate((hs) => {
    const w = window.__game.war, f = w.field, me = f.alive.find((u) => u.side === f.human), foe = f.alive.find((u) => u.side !== f.human);
    const [a, d] = hs === 'a' ? [me, foe] : [foe, me], res = f.attack(a, d);
    window.__cutDone = false; window.__game.debug.cutIn(f, a, d, res, f.terr(d.x, d.y)).then(() => { window.__cutDone = true; });
  }, hs);
  const speed4 = () => page.evaluate(() => [...document.querySelectorAll('.tq-btn')].find((b) => /^4/.test(b.textContent.trim()))?.click());
  async function skirmish(tag, hs, { duel = true } = {}) {
    // An enemy 挑发 asks the player (应战 / 拒绝) and holds the battle until answered: the tool declines, so the
    // 单挑 it times is the one it starts itself.
    const decline = setInterval(() => page.evaluate(() => [...document.querySelectorAll('.tq-ask:not(.tq-start) .tq-btn')].find((b) => b.textContent === '拒绝')?.click()).catch(() => {}), 300);
    try { await skirmishSteps(tag, hs, { duel }); } finally { clearInterval(decline); }
  }
  async function skirmishSteps(tag, hs, { duel }) {
    await win(`战争→白兵 ${tag}`, () => cutIn(hs), { until: () => !!document.querySelector('.tq-form, .tq-start button') });
    if (await page.evaluate(() => !!document.querySelector('.tq-form'))) await win(`改布阵(选阵形) ${tag}`, async () => { await page.locator('.tq-form').first().click(); await page.locator('.tq-deploy:not(.arming)').click(); }, { until: () => !!document.querySelector('.tq-start button') });
    await page.locator('.tq-start button:not(.arming)').click(); await speed4();
    if (duel) {
      await win(`白兵→单挑 ${tag}`, () => page.evaluate((hs) => window.__tq.startDuel(hs), hs), { until: () => !!document.querySelector('.tq-duel') });
      // the duel plays itself out (自动, T)
      await win(`单挑→白兵 ${tag}`, () => page.keyboard.press('t'), { until: () => !document.querySelector('.tq-duel'), event: 'duelOff', timeout: 120000 });
    }
    // the 白兵 is called off as at its 30-round limit (Tactical.over), so its end comes at once instead of a withdrawal's minute
    await page.evaluate(() => { window.__tq.over ||= { why: 'time' }; });
    await page.locator('.tq-result .tq-btn', { hasText: '返回战场' }).waitFor({ timeout: 60000 });
    await win(`白兵→战争 ${tag}`, () => page.locator('.tq-result .tq-btn', { hasText: '返回战场' }).click(), { until: () => window.__cutDone, event: 'cineOff', timeout: 60000 });
  }
  async function endWar(tag) {
    // 战后安置 (more than ten officers for a city) waits for the player: the tool takes the placement it proposes.
    const settle = setInterval(() => page.evaluate(() => { const m = [...document.querySelectorAll('.modal, .panel')].find((e) => e.textContent.includes('战后安置')); [...(m?.querySelectorAll('button.primary') ?? [])].find((b) => b.textContent === '确定' && !b.disabled)?.click(); }).catch(() => {}), 300);
    try { await endWarSteps(tag); } finally { clearInterval(settle); }
  }
  async function endWarSteps(tag) {
    await win(`战后结算 ${tag}`, () => page.evaluate(() => { const w = window.__game.war, f = w.field; f.end(f.human === 'att' ? 'def' : 'att', 'test'); w.endTurn(); }),
      { until: () => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('返回大地图')), timeout: 90000 });
    await win(`结算→战略 ${tag}`, () => page.locator('button', { hasText: '返回大地图' }).click(), { until: () => window.__warDone && document.body.dataset.screen === 'strategy' && !document.querySelector('#fade.on'), timeout: 90000 });
    await page.waitForTimeout(500);
    await memory(`after ${tag}`);
    await restore();
  }

  if (ONLY.has('war')) {
    await win('战略→战争 冷 攻', () => enterWar('att'), { until: warUp });
    result.flatWar = await flatNow();
    await toTurn();
    if (ONLY.has('tac')) await skirmish('冷 攻', 'a');
    await endWar('第1场');
    await win('战略→战争 第二次 攻', () => enterWar('att'), { until: warUp });
    await toTurn();
    if (ONLY.has('tac')) await skirmish('第二次 攻', 'a');
    await endWar('第2场');
  }
  if (ONLY.has('def')) {
    await win('战略→战争 守', () => enterWar('def'), { until: warUp });
    await toTurn();
    if (ONLY.has('tac')) await skirmish('守', 'd', { duel: false });
    await endWar('守');
  }
  if (ONLY.has('season')) {
    await page.evaluate(() => { const g = window.__game.g; g.month = ((g.month + 5) % 12) + 1; window.__snap = JSON.stringify(g); window.__game.strategy.setSeason?.(g.month, true); });
    await win('战略→战争 换季后 攻', () => enterWar('att'), { until: warUp });
    await toTurn();
    if (ONLY.has('tac')) await skirmish('换季后 攻', 'a', { duel: false });
    await endWar('换季');
  }
  stop();
} catch (e) {
  result.errors.push(`tool: ${e.stack ?? e.message}`); console.error(e);
} finally {
  result.finished = new Date().toISOString(); save();
  writeFileSync(join(out, 'summary.md'), summary(result));
  await browser.close().catch(() => {});
}

function summary(r) {
  const L = [`# 切场景归因 ${r.quality}${/[?&]flat\b/.test(r.url) ? ' &flat' : ''}（${r.size.join('×')} DPR ${r.dpr}，平面战场 ${r.flatWar}）`, '', `${r.url}　${r.chrome}　${r.started}`, ''];
  L.push(`战争：${(r.wars ?? []).map((x) => `${x.human} ${x.from}→${x.city} ${x.month}月`).join('；')}`, '');
  L.push('| 路径 | 墙钟 ms | ≥50 ms 帧 | 最长帧 ms | 阻塞 ms | 新 program | 过场后 1.5 s 最大帧间隔 |', '|---|---:|---:|---:|---:|---:|---:|');
  for (const w of r.windows) L.push(`| ${w.name}${w.error ? ' ⚠' : ''} | ${w.wallMs} | ${w.longFrames} | ${w.longestMs} | ${w.blockingMs} | ${w.renders.programsAdded} | ${w.afterSettle.maxGap ?? '-'} |`);
  L.push('');
  for (const w of r.windows) {
    if (!w.frames.length) continue;
    L.push(`## ${w.name}`, '', `阶段：${w.measures.filter((m) => m.ms >= 5).map((m) => `${m.name} ${m.ms}`).join('，') || '无'}`, '');
    for (const f of w.frames.slice(0, 2)) {
      L.push(`- 帧 @${f.at} ms，${f.ms} ms（阻塞 ${f.blockMs}，渲染段 ${f.renderMs ?? '-'}）；脚本：${f.scripts.map((s) => `${s.inv} ${s.ms}`).join('；')}`);
      L.push(`  - 类别：${Object.entries(f.profile.categories).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join('，')}`);
      L.push(`  - 阶段×类别：${Object.entries(f.profile.phases).map(([p, c]) => `${p}{${Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${v}`).join(' ')}}`).join('；')}`);
      L.push(`  - 自身热点：${f.profile.self.slice(0, 8).map(([k, v]) => `${k} ${v}`).join('；')}`);
      L.push(`  - 源码包含：${f.profile.inclusive.slice(0, 8).map(([k, v]) => `${k} ${v}`).join('；')}`);
    }
    L.push('');
  }
  L.push('## 资源', '', '| 时点 | geometries | textures | programs | JS 堆 MB |', '|---|---:|---:|---:|---:|', ...r.memory.map((m) => `| ${m.label} | ${m.geometries} | ${m.textures} | ${m.programs} | ${m.jsHeapMB} |`), '');
  if (r.errors.length) L.push('## 错误', '', ...r.errors.map((e) => `- ${e}`));
  return L.join('\n');
}
