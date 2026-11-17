// The war map's look as numbers, for the A2 rework (docs/review-assets/2026-10-29/war-style): a calm board on
// which the generals are the first thing the eye finds, every terrain still tells apart (each costs its own
// mobility, core/field.js cost()), a camera that rests only on the four corner views, in every month and weather, on all 30 battlefields.
// It measures the 3D diorama view, the war map's default; the flat painted one (?flat, the 低 preset) is checked by tools/flat_check.mjs.
//   node hd2d-mvp/tools/war_look_check.mjs [--url …] [--size 1440x900] [--only maps|seasons] [--cities 0,12] [--jobs 3] [--measure] [--shots dir] [--write-base] [--json file]
// Each scenario starts a new game, marches 曹操's side on the city in the given month and skips deployment,
// then measures the overview with the HUD, tags and weather hidden. --measure prints the numbers without
// judging them; --shots saves each measured frame and one as the player sees it (-weather.png). Exit code 1 when any check fails.
// Noise and saturation depend on the month (snow, autumn woods), so they are judged against the same scenario
// before the rework: tools/fixtures/war_look_base.json, recorded with --write-base against a server on HEAD
// 0eacef4 (e.g. --url http://localhost:8680/hd2d-mvp/ --measure --write-base).
import { launchChrome } from './headless.mjs';
import { newCampaign, warRest } from '../tests/game.mjs';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const URL = arg('--url', 'http://localhost:8679/hd2d-mvp/');
const [VW, VH] = arg('--size', '1440x900').split('x').map(Number);
const only = arg('--only', ''), jobs = Number(arg('--jobs', 3)), measure = process.argv.includes('--measure');
const jsonOut = arg('--json', '') && resolve(arg('--json'));
const shots = arg('--shots', '') && resolve(arg('--shots'));
if (shots) mkdirSync(shots, { recursive: true });

// Thresholds. Baseline (HEAD 0eacef4, 1440×900) in brackets where it fails today.
const T = {
  spritePx: 40, // shortest general on screen at the overview, px (1.3 cells tall since war-3d Task 5; 70 at 2.25)
  noise: 0.85, // mean |Laplacian| of the board's luminance, at most this share of the same scenario on HEAD
  sat: [0.45, 0.9], // mean HSV saturation of the board: at most the A2 concept's (0.45) or this share of HEAD's [≈0.12–0.74]
  apron: 0.62, // mean luminance just outside the board ÷ on it [≈0.8]
  terrainDE: 10, // smallest colour distance (CIE76) between two terrain kinds that both appear on the board
  blossom: 0.001, // share of the board's pixels that are blossom on trees (pink / white crowns), weather hidden
  tagH: 26, // a general's tag when not selected or hovered, px
};
const KIND = ['森林', '沙地', '平原', '河流', '山地', '城'];

const maps = only === 'seasons' ? [] : arg('--cities', [...Array(30).keys()].join(',')).split(',').map(Number).map((city) => ({ city, month: city % 12, set: 'maps' }));
const seasons = only === 'maps' ? [] : [
  ...[...Array(12).keys()].map((month) => ({ city: 12, month, set: 'seasons' })), // 洛阳 34.7°N: every month, blossom in spring
  ...[0, 10, 11].map((month) => ({ city: 1, month, set: 'seasons' })), // 幽州 39.9°N: thaw and snow
  ...[1, 5, 9, 11].map((month) => ({ city: 18, month, set: 'seasons' })), // 南海 23.1°N: evergreen south, storms
];
const scenarios = [...maps, ...seasons];
const baseFile = new globalThis.URL('./fixtures/war_look_base.json', import.meta.url), writeBase = process.argv.includes('--write-base');
const base = !writeBase && existsSync(baseFile) ? JSON.parse(readFileSync(baseFile, 'utf8')) : {};
const keyOf = (sc) => `${sc.set} ${sc.city} ${sc.month}`;

const browser = await launchChrome(URL);
const results = [];

async function run(sc) {
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH } });
  const page = await ctx.newPage(), errors = [];
  // The same game every run (deployment, officers): a seeded Math.random per scenario.
  await page.addInitScript((seed) => { let s = seed; Math.random = () => (s = (s * 16807) % 2147483647) / 2147483647; }, 1 + sc.city * 97 + sc.month * 7);
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/404|ERR_/.test(m.text()) && errors.push(m.text()));
  const res = { ...sc, fails: [], m: {} };
  try {
    await page.goto(URL + (URL.includes('?') ? '&' : '?') + 'mute'); await page.waitForFunction(() => window.__game?.debug);
    await newCampaign(page); // skips the title opening and plays up to the player's first turn
    await page.evaluate(({ city: k, month }) => {
      const { g, debug } = window.__game, cs = g.cities, to = cs[k];
      g.month = month;
      const from = cs.findIndex((c, i) => i !== k && c.officers.length > 2 && c.faction !== to.faction && c.faction !== 0);
      if (!to.officers.length) {
        const donor = cs.find((c, i) => i !== k && i !== from && c.officers.length > 1 && c.faction !== cs[from].faction && c.faction !== 0);
        to.faction = donor.faction; to.officers = donor.officers.splice(0, 2);
      }
      const ids = cs[from].officers.slice(0, 3);
      const w = debug.setupWar(g, { from, to: k, ids, commander: ids[0], gold: 0, rice: Math.min(cs[from].rice, 600) });
      debug.fieldWar(w, 'att');
    }, sc);
    await page.waitForFunction(() => document.body.dataset.screen === 'war' && window.__game.war, null, { timeout: 30000 });
    await page.waitForTimeout(2000);
    await page.evaluate(() => window.__game.war.finishDeploy());
    await page.waitForFunction(() => { const w = window.__game.war; return w.field.turn === w.field.human && !w.st.busy; }, null, { timeout: 60000 });

    // --- Camera: the board turns a quarter at a time (Q / E, or a right-drag that snaps to the nearest quarter) and always comes
    // to rest on one of the four corner views (probe().view.yaws). Angles are compared round the circle: yawGoal is not wrapped. ---
    await page.evaluate(() => window.__game.war.overview());
    await warRest(page);
    const view = () => page.evaluate(() => window.__game.war.probe().view);
    const TAU = 2 * Math.PI, apart = (a, b) => { const d = (((a - b) % TAU) + TAU) % TAU; return Math.min(d, TAU - d); };
    const onCorner = (v) => v.yaws.some((y) => apart(v.yaw, y) < 0.01);
    const v0 = await view();
    await page.keyboard.press('e');
    const v1 = await view();
    res.m.turn = +apart(v1.yawGoal, v0.yawGoal).toFixed(4);
    if (apart(v1.yawGoal, v0.yawGoal + Math.PI / 2) > 0.01) res.fails.push(`E set the turn's goal ${(v1.yawGoal - v0.yawGoal).toFixed(3)} rad on, not a quarter`);
    await warRest(page);
    const v2 = await view();
    if (!onCorner(v2)) res.fails.push(`after E the board rests at yaw ${v2.yaw.toFixed(3)}, between the corner views`);
    await page.mouse.move(VW / 2, VH / 2); await page.mouse.down({ button: 'right' }); await page.mouse.move(VW / 2 + 220, VH / 2 + 90, { steps: 6 }); await page.mouse.up({ button: 'right' });
    await warRest(page);
    const v3 = await view();
    if (!onCorner(v3)) res.fails.push(`after a right-drag the board rests at yaw ${v3.yaw.toFixed(3)}, between the corner views`);
    // Back to the opening corner with Q, so everything below is measured from the angle the war opens at (as the base was).
    for (let i = 0; i < 4 && apart((await view()).yawGoal, v0.yawGoal) > 0.01; i++) { await page.keyboard.press('q'); await warRest(page); }
    if (apart((await view()).yawGoal, v0.yawGoal) > 0.01) res.fails.push('Q never turned the board back to its opening corner');
    await page.evaluate(() => window.__game.war.overview()); await page.waitForTimeout(1500);

    // --- Units: on-screen size, a base in the side's colour, compact tags. ---
    const units = await page.evaluate(() => {
      const w = window.__game.war, f = w.field, cam = w.camera, THREE = w.camera.position.constructor;
      const out = [];
      for (const u of f.alive) {
        const g = w.spriteOf(u); if (!g) continue;
        let body = null; g.traverse((o) => { if (o.userData.unit === u) body = o; });
        // The figure itself stands probe().figure cells (warview.js FIGURE; 1.3); the quad around it is padded. His ring is a flat band, read by colour.
        body.updateWorldMatrix(true, false);
        const k = w.probe?.().figure ?? 1.7, top = new THREE(0, k, 0).applyMatrix4(body.matrixWorld).project(cam), bot = new THREE(0, 0, 0).applyMatrix4(body.matrixWorld).project(cam);
        const base = w.probe?.().bases?.find((b) => b.id === u.id);
        out.push({ id: u.id, mine: u.side === f.human, px: Math.abs(top.y - bot.y) / 2 * innerHeight, base: base?.color ?? null });
      }
      const tags = [...document.querySelectorAll('.tag')].filter((t) => !t.classList.contains('full') && t.isConnected && t.offsetParent).map((t) => t.offsetHeight);
      return { out, tags };
    });
    const minPx = Math.min(...units.out.map((u) => u.px));
    res.m.spritePx = +minPx.toFixed(1);
    if (minPx < T.spritePx) res.fails.push(`smallest general ${minPx.toFixed(0)} px < ${T.spritePx}`);
    const hue = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return -1; const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return (h * 60 + 360) % 360; };
    for (const u of units.out) {
      if (!u.base) { res.fails.push(`general ${u.id} has no side-coloured base`); continue; }
      const h = hue(u.base), ok = u.mine ? h >= 195 && h <= 235 : h <= 15 || h >= 345;
      if (!ok) res.fails.push(`general ${u.id} base ${u.base} is not ${u.mine ? 'blue' : 'red'}`);
    }
    res.m.tagH = Math.max(0, ...units.tags);
    if (res.m.tagH > T.tagH) res.fails.push(`unselected tag ${res.m.tagH} px tall > ${T.tagH}`);

    // --- Pixels of the bare board: HUD, tags and weather hidden; with and without the generals. ---
    const shotName = `${sc.set}-${String(sc.city).padStart(2, '0')}-m${sc.month + 1}`;
    if (shots) await page.screenshot({ path: join(shots, `${shotName}-weather.png`) }); // as the player sees it, weather and all
    // The cells are projected from the camera, so wait until it has come to rest (the drag above pans it).
    await page.evaluate(async () => {
      const c = window.__game.war.camera, at = () => c.position.toArray().map((v) => v.toFixed(4)).join();
      for (let i = 0, a = at(); i < 60; i++) { await new Promise((r) => setTimeout(r, 250)); const n = at(); if (n === a) return; a = n; }
      throw new Error('the camera never came to rest');
    });
    const geo = await page.evaluate(() => {
      const w = window.__game.war, f = w.field, cam = w.camera, V = cam.position.constructor, W = f.map[0].length, H = f.map.length;
      document.body.classList.add('look-probe');
      try { w.hover({ x: 9, y: 9 }); } catch {} // the cell cursor off the board
      const st = document.createElement('style'); st.id = 'look-probe'; st.textContent = 'body.look-probe > *:not(canvas):not(script) { visibility: hidden !important; } body.look-probe canvas { visibility: visible !important; } .tag, .vtag { display: none !important; }';
      document.head.append(st);
      // The weather sets .visible every frame; pin it off for the rest of the scenario.
      w.scene.traverse((o) => { if (o.isPoints || o.isLineSegments) Object.defineProperty(o, 'visible', { get: () => false, set: () => {}, configurable: true }); });
      const proj = (x, y, h) => { const p = new V(x - W / 2 + 0.5, h, y - H / 2 + 0.5).project(cam); return [(p.x + 1) / 2 * innerWidth, (1 - p.y) / 2 * innerHeight]; };
      const cells = [];
      const top = w.probe?.().top, base = [0.3, 0.25, 0.3, 0.2, 0.9, 0.55]; // HEAD has no probe: its fixed heights
      const ground = (t, x, y) => (top ? top(x, y) : base[t]);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (f.villages.some((v) => v.x === x && v.y === y)) continue;
        const t = f.map[y][x]; const [cx, cy] = proj(x, y, ground(t, x, y)); const [ex] = proj(x + 0.5, y, ground(t, x, y));
        cells.push({ t, cx, cy, r: Math.abs(ex - cx) * 0.45 });
      }
      const corners = [proj(-0.5, -0.5, 0.3), proj(W - 0.5, -0.5, 0.3), proj(W - 0.5, H - 0.5, 0.3), proj(-0.5, H - 0.5, 0.3)];
      return { cells, corners, W: innerWidth, H: innerHeight };
    });
    Object.assign(geo, await page.evaluate(async (sc) => {
      const { MONTHS } = await import('./src/seasons.js'), { data } = await import('./src/core/game.js');
      return { snowing: data().cities[sc.city].lat > MONTHS[sc.month].snow - 0.6, blossomMonth: MONTHS[sc.month].blossom > 0 };
    }, sc));
    await page.waitForTimeout(700);
    const png = await page.screenshot();
    // Terrain colours are read without the generals (where they were deployed, and their shadows, would move
    // the means from run to run); blossom on trees alone, also without the ground (pale rock is not white
    // blossom, red armour is not pink).
    const stage = (units, ground) => page.evaluate(async ([units, ground]) => {
      const w = window.__game.war, THREE = await import('three');
      for (const u of w.field.alive) { const g = w.spriteOf(u); if (g) g.visible = units; }
      // The ground goes flat black rather than hidden (the sky behind it would read as white).
      const black = (window.__lookBlack ||= new THREE.MeshBasicMaterial({ color: 0 }));
      w.scene.traverse((o) => { if (!o.userData.terrain) return; if (!ground) { o.userData.lookMat ||= o.material; o.material = black; } else if (o.userData.lookMat) o.material = o.userData.lookMat; });
    }, [units, ground]);
    await stage(false, true); await page.waitForTimeout(300);
    const pngGround = await page.screenshot();
    await stage(false, false); await page.waitForTimeout(300);
    const pngBare = await page.screenshot();
    await stage(true, true);
    if (shots) { await page.screenshot({ path: join(shots, `${shotName}.png`) }); writeFileSync(join(shots, `${shotName}.cells.json`), JSON.stringify(geo)); }
    const px = await page.evaluate(async ({ b64, b64Ground, b64Bare, geo, T }) => {
      const pixels = async (b) => { const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b}`)).blob());
        const c = new OffscreenCanvas(img.width, img.height), g = c.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, img.width, img.height); };
      const im = await pixels(b64), d = im.data, bare = (await pixels(b64Bare)).data, ground = (await pixels(b64Ground)).data, W = im.width, H = im.height, sx = W / geo.W;
      const at = (x, y) => (Math.round(y) * W + Math.round(x)) * 4;
      const lum = (i) => (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
      // Board polygon (screen), shrunk a little so the rim's step down in light is not counted either way.
      const poly = geo.corners.map(([x, y]) => [x * sx, y * sx]);
      const cxp = poly.reduce((s, p) => s + p[0], 0) / 4, cyp = poly.reduce((s, p) => s + p[1], 0) / 4;
      const shrink = (k) => poly.map(([x, y]) => [cxp + (x - cxp) * k, cyp + (y - cyp) * k]);
      const inside = (P, x, y) => { let s = false; for (let i = 0, j = 3; i < 4; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) s = !s; } return s; };
      const inner = shrink(0.94), outer = shrink(1.12), rim = shrink(1.02);
      let n = 0, lap = 0, sat = 0, lb = 0, bl = 0, na = 0, la = 0;
      for (let y = 2; y < H - 2; y += 2) for (let x = 2; x < W - 2; x += 2) {
        const i = at(x, y);
        if (inside(inner, x, y)) {
          const l = lum(i), lp = 4 * l - lum(at(x - 1, y)) - lum(at(x + 1, y)) - lum(at(x, y - 1)) - lum(at(x, y + 1));
          const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
          n++; lap += Math.abs(lp); sat += mx ? (mx - mn) / mx : 0; lb += l;
          // Blossom, on the frame without the generals and the ground: bright pink (red above green, blue not far below green:
          // orange autumn leaves are not pink), or in a blossom month bright near-white with little saturation
          // (in other months that is frost or snow on high ground).
          const r = bare[i] / 255, gg = bare[i + 1] / 255, b = bare[i + 2] / 255, lB = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
          const spread = (Math.max(bare[i], bare[i + 1], bare[i + 2]) - Math.min(bare[i], bare[i + 1], bare[i + 2]));
          if (lB > 0.62 && ((r - gg > 0.12 && r - b > 0.02 && b > gg - 0.06 && gg < 0.85) || (geo.blossomMonth && spread < 26 && lB > 0.78))) bl++;
        } else if (inside(outer, x, y) && !inside(rim, x, y) && y < H * 0.97) { na++; la += lum(i); }
      }
      // Terrain colours: mean CIELAB of each kind's cell centres.
      const lab = (r, g, b) => {
        const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
        const R = f(r), G = f(g), B = f(b), X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047, Y = 0.2126 * R + 0.7152 * G + 0.0722 * B, Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
        const h = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
        return [116 * h(Y) - 16, 500 * (h(X) - h(Y)), 200 * (h(Y) - h(Z))];
      };
      const kinds = {};
      for (const c of geo.cells) {
        const k = (kinds[c.t] ||= { n: 0, s: [0, 0, 0] }), rr = Math.max(2, c.r * sx);
        for (let y = c.cy * sx - rr; y <= c.cy * sx + rr; y += 2) for (let x = c.cx * sx - rr; x <= c.cx * sx + rr; x += 2) {
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          const i = at(x, y), L = lab(ground[i], ground[i + 1], ground[i + 2]); k.n++; k.s[0] += L[0]; k.s[1] += L[1]; k.s[2] += L[2];
        }
      }
      const mean = Object.fromEntries(Object.entries(kinds).filter(([, k]) => k.n > 40).map(([t, k]) => [t, k.s.map((v) => v / k.n)]));
      let worst = { de: Infinity };
      const keys = Object.keys(mean);
      for (let a = 0; a < keys.length; a++) for (let b = a + 1; b < keys.length; b++) {
        const [p, q] = [mean[keys[a]], mean[keys[b]]], de = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
        if (de < worst.de) worst = { de, a: +keys[a], b: +keys[b] };
      }
      return { noise: lap / n, sat: sat / n, apron: na ? (la / na) / (lb / n) : 1, blossom: bl / n, worst, kinds: Object.fromEntries(Object.entries(mean).map(([t, v]) => [t, v.map((x) => Math.round(x))])) };
    }, { b64: png.toString('base64'), b64Ground: pngGround.toString('base64'), b64Bare: pngBare.toString('base64'), geo, T });
    Object.assign(res.m, { noise: +px.noise.toFixed(4), sat: +px.sat.toFixed(3), apron: +px.apron.toFixed(3), blossom: +px.blossom.toFixed(4), terrainDE: +px.worst.de.toFixed(1), closest: `${KIND[px.worst.a]}/${KIND[px.worst.b]}` });
    if (measure) res.m.lab = Object.fromEntries(Object.entries(px.kinds).map(([t, v]) => [KIND[t], v]));
    const b = base[keyOf(sc)];
    if (!b) res.fails.push(`no HEAD numbers for ${keyOf(sc)} in fixtures/war_look_base.json`);
    else {
      if (px.noise > b.noise * T.noise) res.fails.push(`board noise ${px.noise.toFixed(3)} > ${T.noise}× HEAD's ${b.noise}`);
      const satMax = Math.max(T.sat[0], b.sat * T.sat[1]);
      if (px.sat > satMax) res.fails.push(`board saturation ${px.sat.toFixed(2)} > ${satMax.toFixed(2)} (HEAD ${b.sat})`);
    }
    if (px.apron > T.apron) res.fails.push(`outside the board ${px.apron.toFixed(2)}× as bright as on it > ${T.apron}`);
    if (!geo.snowing && px.blossom > T.blossom) res.fails.push(`blossom ${(px.blossom * 100).toFixed(2)}% of the board > ${(T.blossom * 100).toFixed(1)}%`);
    if (px.worst.de < T.terrainDE) res.fails.push(`${KIND[px.worst.a]} and ${KIND[px.worst.b]} only ΔE ${px.worst.de.toFixed(1)} apart < ${T.terrainDE}`);
    await page.evaluate(() => { document.body.classList.remove('look-probe'); });
    // --- Reach overlay: warm gold, so blue and red stay the two sides' colours. ---
    const marks = await page.evaluate(() => { const w = window.__game.war, me = w.field.side(w.field.human)[0]; w.clickCell(me.x, me.y); return w.probe?.().marks ?? null; });
    if (!marks) res.fails.push('war view has no probe() for the overlay colours');
    else {
      res.m.move = marks.move;
      const h = hue(marks.move);
      if (!(h >= 32 && h <= 52)) res.fails.push(`move cells ${marks.move} are not warm gold`);
      if (marks.castle && Math.abs(hue(marks.castle) - h) < 12) res.fails.push(`castle cells ${marks.castle} read as move cells ${marks.move}`);
    }

  } catch (e) {
    res.fails.push(`ERROR ${e.message.split('\n')[0]}`);
  }
  if (errors.length) res.fails.push(`page errors: ${errors.slice(0, 3).join(' | ')}`);
  await ctx.close();
  return res;
}

const queue = [...scenarios];
await Promise.all(Array.from({ length: jobs }, async () => { for (let sc; (sc = queue.shift());) { const r = await run(sc); results.push(r); console.log(`${r.set} city ${String(r.city).padStart(2)} 月${String(r.month + 1).padStart(2)}  ${JSON.stringify(r.m)}${measure ? '' : r.fails.length ? `\n    FAIL ${r.fails.join('\n    FAIL ')}` : '  ok'}`); } }));
await browser.close();
if (writeBase) {
  const out = Object.fromEntries(results.filter((r) => r.m.noise != null).sort((p, q) => keyOf(p).localeCompare(keyOf(q))).map((r) => [keyOf(r), { noise: r.m.noise, sat: r.m.sat }]));
  writeFileSync(baseFile, JSON.stringify(out, null, 1) + '\n'); console.log('wrote', baseFile.pathname, Object.keys(out).length);
}
// --json: every scenario's checks as run, to be set beside another run's by tools/war_look_diff.py (e.g. before and after a refactor).
if (jsonOut) {
  const out = [...results].sort((p, q) => keyOf(p).localeCompare(keyOf(q))).map(({ set, city, month, fails, m }) => ({ set, city, month, fails, m }));
  writeFileSync(jsonOut, JSON.stringify(out, null, 1) + '\n'); console.log('wrote', jsonOut, out.length);
}
const bad = results.filter((r) => r.fails.length);
if (!measure) console.log(`\n${results.length - bad.length}/${results.length} scenarios pass`);
process.exit(measure || !bad.length ? 0 : 1);
