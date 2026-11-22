// The low-quality 战略地图's four board pictures, photographed from the 3D sand table (the season colours live in its
// shaders), and the coordinates the 2D map draws by, projected through the same camera.
//   node hd2d-mvp/tools/bake_strategy_flat.mjs <scratch_dir> [--dest assets/ai/sandtable/flat] [--ss 1.5] [--only spring] [--metadata-only]
//   node hd2d-mvp/tools/bake_strategy_flat.mjs <scratch_dir> --towns    the town pictures a data pack's new cities stand in on the 2D map:
//     each tier's model alone, photographed by the same camera in each season at three latitudes (snow), into towns-<season>.webp and towns.json
//   node hd2d-mvp/tools/bake_strategy_flat.mjs <scratch_dir> --towns --style japan    the same in a building style (core/pack.js STYLES), into
//     towns-<style>-<season>.webp and towns-<style>.json; a tier the style has no model for yet is photographed as the Han one
//   node hd2d-mvp/tools/bake_strategy_flat.mjs <scratch_dir> --region <name>    an extension region's pictures for the 2D map
//     (docs/战略地图数据包扩展设计_2026-11-17.md §5.5): the board with the region on one table, photographed by the original pictures'
//     own camera through a window over the region (setViewOffset, a margin all round so occlusion and bloom do not seam), into
//     assets/ai/sandtable/regions/<name>/flat-<season>.webp and flat.json: where the window lies on the original pictures, and its land.
//     The original board's own frame is held out (depth, no colour) and its ground left transparent, so the original pictures show there.
// Full-size PNGs stay in scratch_dir (AGENTS.md, "Large source art"); <dest> gets {spring,summer,autumn,winter}.webp and board.json.
// One large frame rather than setViewOffset tiles: occlusion and bloom would seam at tile edges. Rendered at --ss times the picture and
// scaled down, which antialiases the outline and settles the woods' sub-pixel speckle (Chrome caps a canvas at about 33 Mpx, so 1.5).
// The table and background come out transparent: the alpha is the board's own silhouette, frame and anything standing over it included.
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Both bake modes use the same samples and encoding; metadata-only must not retain the old distance falloff.
export function buildTintGrid(tintAt, { x, y, width, height, w, h, scale, runMax }) {
  const near = [], k = [], land = [];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const t = tintAt(x + (i + .5) / w * width, y + (j + .5) / h * height);
    near.push(t.near); k.push(Math.round(t.k * 1000) / 1000); land.push(t.land);
  }
  const ow = w * scale, oh = h * scale, cells = new Uint8Array(ow * oh), runs = [];
  for (let j = 0; j < oh; j++) for (let i = 0; i < ow; i++) {
    const t = tintAt(x + (i + .5) / ow * width, y + (j + .5) / oh * height);
    cells[j * ow + i] = t.land && t.near >= 0 ? t.near + 1 : 0;
  }
  for (let i = 0; i < cells.length;) {
    let n = 1; while (n < runMax && i + n < cells.length && cells[i + n] === cells[i]) n++;
    runs.push(cells[i], n); i += n;
  }
  let packed = ''; for (let i = 0; i < runs.length; i += 8192) packed += String.fromCharCode(...runs.slice(i, i + 8192));
  return { w, h, near, k, land, territory: { w: ow, h: oh, encoding: 'rle8', city: btoa(packed) } };
}

async function main() {
  const { launchChrome } = await import('./headless.mjs');

  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
  const scratch = process.argv[2];
  if (!scratch || scratch.startsWith('--')) { console.error('usage: bake_strategy_flat.mjs <scratch_dir> [--dest assets/ai/sandtable/flat] [--ss 1.5] [--only spring]'); process.exit(2); }
  const HD2D = join(dirname(fileURLToPath(import.meta.url)), '..'), ROOT = join(HD2D, '..');
  const dest = resolve(HD2D, arg('--dest', 'assets/ai/sandtable/flat')), SS = Number(arg('--ss', 1.5)), only = arg('--only');
  const metadataOnly = process.argv.includes('--metadata-only'), towns = process.argv.includes('--towns'), region = arg('--region'), style = arg('--style');
  if (style != null && !(towns && ['japan', 'korea'].includes(style))) throw Error(`--style ${style}: japan or korea, with --towns`);
  if (region != null && !/^[a-z0-9-]+$/.test(region)) throw Error(`region name ${region}`); // refresh ownership after a border warp change, without photographing the seasons again
  // Season files and the month each is shot in: 二月, 四月, 九月, 十一月 (floor(month / 3) picks the picture in play).
  const SEASONS = [['spring', 1], ['summer', 3], ['autumn', 8], ['winter', 10]].filter(([s]) => !only || s === only);
  const FRAME = [3900, 3200], CELL = 32, PAD = 8, TERRITORY_GRID_SCALE = 4, TERRITORY_RUN_MAX = 255; // finer ownership cells keep the live tint off the sea without changing the pictures
  mkdirSync(scratch, { recursive: true }); mkdirSync(dest, { recursive: true });

  const port = await new Promise((res, rej) => { const s = createServer().once('error', rej).listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); }); });
  const url = `http://localhost:${port}/hd2d-mvp/?mute`;
  const server = spawn('python3', ['hd2d-mvp/tools/serve.py', String(port)], { cwd: ROOT, stdio: 'ignore' });
  let browser;
  try {
    for (let i = 0; ; i++) { try { if ((await fetch(url)).ok) break; } catch {} if (i > 100) throw new Error('dev server did not start'); await new Promise((r) => setTimeout(r, 100)); }
    browser = await launchChrome(url, ['--disable-gpu-watchdog']); // a frame this large outlasts the watchdog's patience
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    if (region) await regionRoutes(context, region, HD2D);
    const page = await context.newPage();
    page.on('pageerror', (e) => console.error('page error:', e.message));
    await page.goto(region ? `${url}&pack=region-bake` : url); await page.waitForFunction(() => window.__game?.debug, null, { timeout: 120000 });
    await page.addScriptTag({ content: `window.__flatTintGrid = ${buildTintGrid.toString()};` });
    if (region) await bakeRegion(page, { region, scratch, HD2D, SEASONS, FRAME, SS, TERRITORY_GRID_SCALE, TERRITORY_RUN_MAX });
    else if (towns) {
      // A cell per tier (columns) and latitude band (rows); the seat projects to ANCHOR in its cell. The towns stand in one frame,
      // spread over the board's middle: at this lens (10°) the view of a town hardly changes across the board.
      const TIERS = ['capital', 'major', 'county', 'pass'], BANDS = [-7, 0, 6], XS = [-6, -2, 2, 6], CELL = [260, 230], ANCHOR = [130, 135];
      const spots = BANDS.flatMap((z, b) => TIERS.map((tier, t) => ({ tier, style, band: b, x: XS[t], z })));
      if (style) await page.evaluate((st) => window.__game.strategy.loadCityStyle(st), style);
      const name = style ? `towns-${style}` : 'towns';
      let meta = null;
      for (const [season, month] of SEASONS) {
        const res = await page.evaluate(async ({ W, H, SS, month, spots, CELL, ANCHOR, first }) => {
          const { strategy, debug: { renderer, post, show } } = window.__game, SW = Math.round(W * SS), SH = Math.round(H * SS);
          if (first) {
            show('strategy'); renderer.setAnimationLoop(null);
            post.setQuality({ ao: 'auto', msaa: false }); renderer.setPixelRatio(1); renderer.setSize(SW, SH, false); post.setSize(SW, SH);
            post.setProfile('strategy'); post.setDof({ strength: 0, band: 1 }); post.setFocus(60);
            const grade = post.composer.passes.find((p) => p.uniforms?.vignette).uniforms; grade.vignette.value = 0; grade.grain.value = 0;
            renderer.localClippingEnabled = true;
          }
          const view = strategy.bakeView({ month, size: [W, H] });
          window.__townSpots = strategy.bakeTowns(spots);
          const placed = window.__townSpots;
          const grab = () => { const c = new OffscreenCanvas(SW, SH); c.getContext('2d').drawImage(renderer.domElement, 0, 0); return c.getContext('2d').getImageData(0, 0, SW, SH).data; };
          const plain = (clear) => { renderer.setRenderTarget(null); renderer.setClearColor(clear, 1); renderer.render(strategy.scene, strategy.camera); return grab(); };
          const black = plain(0), white = plain(0xffffff);
          renderer.setClearColor(0, 1); post.render(); const lit = grab();
          // The background alone through the grade, to take out of the edge pixels.
          const bg = (() => { const hidden = strategy.scene.children.filter((o) => o.visible && !o.isLight && o !== strategy.camera); hidden.forEach((o) => { o.visible = false; }); post.render(); const d = grab(); hidden.forEach((o) => { o.visible = true; }); return d; })();
          const atlas = new OffscreenCanvas(CELL[0] * 4, CELL[1] * 3), ag = atlas.getContext('2d'); ag.imageSmoothingQuality = 'high';
          const cw = Math.round(CELL[0] * SS), ch = Math.round(CELL[1] * SS);
          const out = placed.map((s, i) => {
            const [px, py] = view.project(s.x, s.y, s.z), x0 = Math.round(px * SS - ANCHOR[0] * SS), y0 = Math.round(py * SS - ANCHOR[1] * SS);
            const cell = new ImageData(cw, ch), d = cell.data;
            for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
              const X = x0 + x, Y = y0 + y, o = (y * cw + x) * 4; if (X < 0 || Y < 0 || X >= SW || Y >= SH) continue;
              const q = (Y * SW + X) * 4, a = 1 - Math.max(white[q] - black[q], white[q + 1] - black[q + 1], white[q + 2] - black[q + 2]) / 255;
              if (a <= 0.004) continue;
              for (let k = 0; k < 3; k++) d[o + k] = Math.max(0, Math.min(255, (lit[q + k] - (1 - a) * bg[q + k]) / a));
              d[o + 3] = Math.round(a * 255);
            }
            const c = new OffscreenCanvas(cw, ch); c.getContext('2d').putImageData(cell, 0, 0);
            const t = ['capital', 'major', 'county', 'pass'].indexOf(s.tier);
            ag.drawImage(c, 0, 0, cw, ch, t * CELL[0], s.band * CELL[1], CELL[0], CELL[1]);
            // The tag and the flag as offsets from the seat in picture px, by the same camera.
            const [tx, ty] = view.project(s.x, s.y + s.top, s.z), ph = s.tier === 'capital' ? 0.56 : 0.44, [fx, fy] = view.project(s.x + s.half * 0.92, s.y + ph, s.z - s.half * 0.4);
            const r = s.half * 1.28 + 0.1, rx = (view.project(s.x + r, s.y, s.z)[0] - view.project(s.x - r, s.y, s.z)[0]) / 2, ry = (view.project(s.x, s.y, s.z + r)[1] - view.project(s.x, s.y, s.z - r)[1]) / 2;
            const n = (v) => Math.round(v * 10) / 10;
            return { tier: s.tier, band: s.band, z: s.z, tag: [n(tx - px), n(ty - py)], flag: [n(fx - px), n(fy - py)], rx: n(rx), ry: n(ry) };
          });
          const png = await new Promise(async (res) => { const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.readAsDataURL(await atlas.convertToBlob({ type: 'image/png' })); });
          return { png, out };
        }, { W: FRAME[0], H: FRAME[1], SS, month, spots, CELL, ANCHOR, first: !meta });
        meta = { cell: CELL, anchor: ANCHOR, tiers: TIERS, bands: BANDS, towns: res.out };
        const png = join(scratch, `${name}-${season}.png`), webp = join(dest, `${name}-${season}.webp`);
        writeFileSync(png, Buffer.from(res.png, 'base64'));
        execFileSync('cwebp', ['-quiet', '-q', '88', '-m', '6', '-alpha_q', '100', png, '-o', webp]);
        console.log(`towns ${season}: month ${month}`);
      }
      writeFileSync(join(dest, `${name}.json`), JSON.stringify(meta));
    } else if (metadataOnly) {
      const board = JSON.parse(readFileSync(join(dest, 'board.json'), 'utf8'));
      board.tint = await page.evaluate(({ board, frame, scale, runMax }) => {
        const { strategy, debug: { renderer, show } } = window.__game;
        show('strategy'); renderer.setAnimationLoop(null);
        const view = strategy.bakeView({ month: 1, size: frame }), old = board.tint, [W, H] = board.size;
        // Recover the original picture crop from every saved city; reject a different camera or board instead of shifting its mask.
        const offsets = view.cities.map((c) => [c.cx - board.cities[c.id].cx, c.cy - board.cities[c.id].cy]);
        const x = Math.round(offsets.reduce((s, p) => s + p[0], 0) / offsets.length), y = Math.round(offsets.reduce((s, p) => s + p[1], 0) / offsets.length);
        if (Math.max(...offsets.flatMap((p) => [Math.abs(p[0] - x), Math.abs(p[1] - y)])) > .1) throw new Error('flat map crop no longer matches the bake camera');
        return window.__flatTintGrid(view.tintAt, { x, y, width: W, height: H, w: old.w, h: old.h, scale, runMax });
      }, { board, frame: FRAME, scale: TERRITORY_GRID_SCALE, runMax: TERRITORY_RUN_MAX });
      writeFileSync(join(dest, 'board.json'), JSON.stringify(board)); console.log('updated flat ownership metadata; seasonal pictures were not changed');
    } else {
      await page.evaluate(async ([W, H, SS, CELL, PAD, TERRITORY_GRID_SCALE, TERRITORY_RUN_MAX]) => {
        const { strategy, debug: { renderer, post, show } } = window.__game, SW = Math.round(W * SS), SH = Math.round(H * SS);
        show('strategy'); renderer.setAnimationLoop(null);
        renderer.domElement.addEventListener('webglcontextlost', () => { window.__contextLost = true; });
        post.setQuality({ ao: 'auto', msaa: false }); // the supersampling is the antialiasing
        renderer.setPixelRatio(1); renderer.setSize(SW, SH, false); post.setSize(SW, SH);
        const gl = renderer.getContext(); // Chrome caps a canvas's drawing buffer by area (about 33 Mpx here), silently: a capped frame would be cropped
        if (gl.drawingBufferWidth !== SW || gl.drawingBufferHeight !== SH) throw new Error(`the canvas holds only ${gl.drawingBufferWidth}×${gl.drawingBufferHeight}: lower --ss`);
        post.setProfile('strategy'); post.setDof({ strength: 0, band: 1 }); post.setFocus(60);
        // The grade's colour stays; a vignette and grain belong to a screen, not to a picture that pans and cross-fades.
        const grade = post.composer.passes.find((p) => p.uniforms?.vignette).uniforms; grade.vignette.value = 0; grade.grain.value = 0;
        // Each copy is taken in the task that drew it, before the browser may clear the drawing buffer.
        const copy = () => { const c = new OffscreenCanvas(SW, SH), g = c.getContext('2d'); g.drawImage(renderer.domElement, 0, 0); return c; };
        renderer.localClippingEnabled = true; // bakeView clips the pieces to the board
        let mask = null, crop = null;
        // The board's silhouette, as alpha: what stays the same on black and on white. Every month has the same one.
        const makeMask = () => {
          const plain = (clear) => { renderer.setRenderTarget(null); renderer.setClearColor(clear, 1); renderer.render(strategy.scene, strategy.camera); return copy(); };
          mask = plain(0); const on = plain(0xffffff);
          const g = mask.getContext('2d'), im = g.getImageData(0, 0, SW, SH), d = im.data, e = on.getContext('2d').getImageData(0, 0, SW, SH).data;
          let x0 = SW, y0 = SH, x1 = -1, y1 = -1;
          for (let y = 0, i = 0; y < SH; y++) for (let x = 0; x < SW; x++, i += 4) {
            const a = d[i] === e[i] ? 255 : 0; d[i + 3] = a;
            if (a) { if (x < x0) x0 = x; if (x >= x1) x1 = x + 1; if (y < y0) y0 = y; if (y >= y1) y1 = y + 1; }
          }
          g.putImageData(im, 0, 0);
          if (x0 === 0 || y0 === 0 || x1 === SW || y1 === SH) throw new Error('the board does not fit the view');
          const X0 = Math.max(0, Math.floor(x0 / SS) - PAD), Y0 = Math.max(0, Math.floor(y0 / SS) - PAD);
          crop = { x: X0, y: Y0, w: Math.min(W, Math.ceil(x1 / SS) + PAD) - X0, h: Math.min(H, Math.ceil(y1 / SS) + PAD) - Y0, x0: x0 / SS - X0, y0: y0 / SS - Y0, x1: x1 / SS - X0, y1: y1 / SS - Y0 };
        };
        window.__shoot = async (month) => {
          const view = strategy.bakeView({ month, size: [W, H] });
          if (!mask) makeMask();
          renderer.setClearColor('#1a0c06', 1); post.render();
          const cut = copy(), g = cut.getContext('2d');
          g.globalCompositeOperation = 'destination-in'; g.drawImage(mask, 0, 0);
          const pic = new OffscreenCanvas(crop.w, crop.h), pg = pic.getContext('2d');
          pg.imageSmoothingQuality = 'high'; pg.drawImage(cut, crop.x * SS, crop.y * SS, crop.w * SS, crop.h * SS, 0, 0, crop.w, crop.h);
          const png = await new Promise(async (res) => { const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.readAsDataURL(await pic.convertToBlob({ type: 'image/png' })); });
          // Picture coordinates: the same camera, less the crop.
          const n = (v) => Math.round(v * 10) / 10, X = (v) => n(v - crop.x), Y = (v) => n(v - crop.y), P = ([x, y]) => [X(x), Y(y)];
          const tw = Math.round(crop.w / CELL), th = Math.round(crop.h / CELL);
          const tint = window.__flatTintGrid(view.tintAt, { x: crop.x, y: crop.y, width: crop.w, height: crop.h,
            w: tw, h: th, scale: TERRITORY_GRID_SCALE, runMax: TERRITORY_RUN_MAX });
          return { png, lost: !!window.__contextLost, board: {
            size: [crop.w, crop.h], bounds: { x0: n(crop.x0), y0: n(crop.y0), x1: n(crop.x1), y1: n(crop.y1) },
            cities: view.cities.map((c) => ({ id: c.id, cx: X(c.cx), cy: Y(c.cy), flag: P(c.flag), tag: P(c.tag), rx: n(c.rx), ry: n(c.ry) })),
            roads: view.roads.map((r) => ({ a: r.a, b: r.b, sea: r.sea, p: r.p.map((v, i) => (i % 2 ? Y(v) : X(v))) })),
            tint,
          } };
        };
      }, [...FRAME, SS, CELL, PAD, TERRITORY_GRID_SCALE, TERRITORY_RUN_MAX]);
      let board;
      for (const [season, month] of SEASONS) {
        const t0 = Date.now(), res = await page.evaluate((m) => window.__shoot(m), month);
        if (res.lost) throw new Error('WebGL context lost: the frame is too large for this GPU, lower --ss');
        board = res.board;
        const png = join(scratch, `${season}.png`), webp = join(dest, `${season}.webp`);
        writeFileSync(png, Buffer.from(res.png, 'base64'));
        execFileSync('cwebp', ['-quiet', '-q', '82', '-m', '6', '-alpha_q', '100', png, '-o', webp]);
        console.log(`${season}: month ${month}, ${board.size.join('×')}, ${Math.round(Date.now() - t0)} ms`);
      }
      writeFileSync(join(dest, 'board.json'), JSON.stringify(board));
    }
  } finally { await browser?.close(); server.kill(); }
}

// The bake's page plays a pack with nothing but the region (its towns are a pack's, laid over as the 2D map lays any pack's), and the
// region is open to it whether or not it is listed in regions/index.json yet: a region is baked before it is opened to packs.
async function regionRoutes(context, region, HD2D) {
  const spec = JSON.parse(readFileSync(join(HD2D, 'tools/regions', `${region}.json`), 'utf8')), [w, e, s, n] = spec.box;
  await context.route(/\/mods\/region-bake\/[a-z]+\.json$/, (r) => (r.request().url().endsWith('/pack.json')
    ? r.fulfill({ contentType: 'application/json', body: JSON.stringify({ id: 'region-bake', name: '地块烘焙', version: '1.0.0', game: 1, regions: [region] }) })
    : r.fulfill({ status: 404 })));
  // A region opened as several boards (its spec's `with`: japan with the north strip) has them all, as src/core/pack.js regionBoards.
  const box = (b) => ({ lon: [b[0], b[1]], lat: [b[2], b[3]] }), boards = spec.with ? Object.fromEntries([...spec.with.map((m) => [m, box(JSON.parse(readFileSync(join(HD2D, 'tools/regions', `${m}.json`), 'utf8')).box)]), [region, box(spec.box)]]) : null;
  await context.route(/\/assets\/ai\/sandtable\/regions\/index\.json$/, (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ [region]: boards ? { boards } : { lon: [w, e], lat: [s, n] } }) }));
}

async function bakeRegion(page, { region, scratch, HD2D, SEASONS, FRAME, SS, TERRITORY_GRID_SCALE, TERRITORY_RUN_MAX }) {
  const flat = JSON.parse(readFileSync(join(HD2D, 'assets/ai/sandtable/flat/board.json'), 'utf8'));
  const MARGIN = 64; // picture px rendered round the window and cut away: SSAO and bloom see past the window's edge
  // Each of the region's boards has its own pictures (in its own directory), photographed with all of them on the table.
  const names = await page.evaluate(() => window.__game.strategy.world.boards?.slice(1).map((b) => b.name) ?? []);
  const metas = {};
  for (const [season, month] of SEASONS) for (const [k, board] of names.entries()) {
    const t0 = Date.now(), dest = join(HD2D, 'assets/ai/sandtable/regions', board);
    mkdirSync(dest, { recursive: true });
    const res = await page.evaluate(async ({ W, H, SS, month, flat, MARGIN, scale, runMax, first, bi }) => {
      const THREE = await import('three'), { strategy, debug: { renderer, post, show } } = window.__game, world = strategy.world;
      if (!world?.boards) throw new Error('the 3D map has no extension region (is the region baked into assets/ai/sandtable/regions/?)');
      const view = strategy.bakeView({ month, size: [W, H] }), camera = strategy.camera;
      // The original pictures' crop on this frame, from where their cities are (as --metadata-only).
      const offsets = view.cities.filter((c) => flat.cities[c.id]).map((c) => [c.cx - flat.cities[c.id].cx, c.cy - flat.cities[c.id].cy]);
      const cx = Math.round(offsets.reduce((a, p) => a + p[0], 0) / offsets.length), cy = Math.round(offsets.reduce((a, p) => a + p[1], 0) / offsets.length);
      if (Math.max(...offsets.flatMap((p) => [Math.abs(p[0] - cx), Math.abs(p[1] - cy)])) > .1) throw new Error('the original flat pictures were not taken by this camera');
      // The window: this board, frame and pieces included, on the original's tint grid. On a side flush against the original it
      // reaches EDGE over the original's edge, past the shade its old frame cast in its pictures, and fades in over the first FEATHER
      // of that, where the two pictures are the same; on any other side it takes in the frame (or the next board, drawn alike there).
      const [MX0, MX1, MZ0, MZ1] = world.boards[0].box, FW = 1.5, EDGE = 0.4, FEATHER = 0.12;
      const bb = world.boards[bi].box, eastOf = Math.abs(bb[0] - MX1) < 1e-6 && bb[2] < MZ1 && bb[3] > MZ0, northOf = Math.abs(bb[3] - MZ0) < 1e-6 && bb[0] < MX1 && bb[1] > MX0;
      const xl = bb[0] - (eastOf ? EDGE : FW), x1 = bb[1] + FW, z0 = bb[2] - FW, z1 = bb[3] + (northOf ? EDGE : FW);
      const us = [], vs = [];
      for (const x of [xl, x1]) for (const y of [-2, 2.5]) for (const z of [z0, z1]) { const [u, v] = view.project(x, y, z); us.push(u - cx); vs.push(v - cy); }
      const [FWp, FHp] = flat.size, T = flat.tint.territory, gx = FWp / T.w, gy = FHp / T.h;
      const i0 = Math.floor(Math.min(...us) / gx), j0 = Math.floor(Math.min(...vs) / gy);
      const nW = Math.ceil((Math.ceil(Math.max(...us) / gx) - i0) / scale) * scale, nH = Math.ceil((Math.ceil(Math.max(...vs) / gy) - j0) / scale) * scale;
      const ox = i0 * gx, oy = j0 * gy, ww = nW * gx, wh = nH * gy; // the window on the original pictures, in their px
      const PW = Math.round(ww), PH = Math.round(wh), SW = Math.round((ww + 2 * MARGIN) * SS), SH = Math.round((wh + 2 * MARGIN) * SS);
      if (first) {
        show('strategy'); renderer.setAnimationLoop(null);
        post.setQuality({ ao: 'auto', msaa: false }); renderer.setPixelRatio(1);
        post.setProfile('strategy'); post.setDof({ strength: 0, band: 1 }); post.setFocus(60);
        const grade = post.composer.passes.find((p) => p.uniforms?.vignette).uniforms; grade.vignette.value = 0; grade.grain.value = 0;
        renderer.localClippingEnabled = true;
        const hold = new THREE.MeshBasicMaterial({ colorWrite: false });
        // Drawn first, so what lies behind it fails the depth test rather than staying in the colour it never writes. Only the
        // top and the long sides, which the original's pictures show as they are: a run cut at the strait ends in a face its
        // old frame never had (box faces +x, −x are a run's ends), drawn here, or the original's frame top shows through there.
        // A run that reaches on past the original's frame (a strip flush against its east edge, whose north and south sides run on
        // along the original's) is drawn as it is: the window over it is the region's own frame, and its carving runs in step.
        // So is one that reaches on past it north or south (the west side beside the north strip as well as the original).
        const span = new THREE.Box3(), [OX0, OX1, OZ0, OZ1] = world.boards[0].box;
        strategy.scene.traverse((o) => {
          if (!o.userData.mainFrame) return;
          span.setFromObject(o); if (span.min.x < OX0 - FW - 1e-3 || span.max.x > OX1 + FW + 1e-3 || span.min.z < OZ0 - FW - 1e-3 || span.max.z > OZ1 + FW + 1e-3) return;
          o.material = [o.material[0], o.material[1], hold, hold, hold, hold]; o.renderOrder = -1000;
        });
      }
      renderer.setSize(SW, SH, false); post.setSize(SW, SH);
      const copy = () => { const c = new OffscreenCanvas(SW, SH); c.getContext('2d').drawImage(renderer.domElement, 0, 0); return c; };
      camera.setViewOffset(W, H, cx + ox - MARGIN, cy + oy - MARGIN, ww + 2 * MARGIN, wh + 2 * MARGIN);
      const plain = (clear) => { renderer.setRenderTarget(null); renderer.setClearColor(clear, 1); renderer.render(strategy.scene, camera); return copy(); };
      const black = plain(0), white = plain(0xffffff);
      renderer.setClearColor('#1a0c06', 1); post.render(); const lit = copy();
      camera.clearViewOffset();
      // Alpha: the silhouette (the same on black and on white), less what lies on the original board, whose own pictures show there.
      const bd = black.getContext('2d').getImageData(0, 0, SW, SH).data, wd = white.getContext('2d').getImageData(0, 0, SW, SH).data;
      const lg = lit.getContext('2d'), im = lg.getImageData(0, 0, SW, SH), d = im.data, ray = new THREE.Raycaster(), sea = world.sea;
      for (let y = 0, i = 0; y < SH; y++) {
        for (let x = 0; x < SW; x++, i += 4) {
          let a = bd[i] === wd[i] && bd[i + 1] === wd[i + 1] && bd[i + 2] === wd[i + 2] ? 255 : 0;
          if (a) {
            const px = cx + ox - MARGIN + (x + 0.5) / SS, py = cy + oy - MARGIN + (y + 0.5) / SS;
            ray.setFromCamera({ x: px / W * 2 - 1, y: 1 - py / H * 2 }, camera);
            const { origin: o, direction: dv } = ray.ray, t = (sea - o.y) / dv.y, gxw = o.x + dv.x * t, gzw = o.z + dv.z * t;
            if (gxw >= MX0 && gxw <= MX1 && gzw >= MZ0 && gzw <= MZ1) {
              const d = Math.min(eastOf ? MX1 - gxw : Infinity, northOf ? gzw - MZ0 : Infinity); // into the original from the seam
              a = Math.round(a * Math.min(1, Math.max(0, (EDGE - d) / FEATHER)));
            }
          }
          d[i + 3] = a;
        }
      }
      lg.putImageData(im, 0, 0);
      const pic = new OffscreenCanvas(PW, PH), pg = pic.getContext('2d'); pg.imageSmoothingQuality = 'high';
      pg.drawImage(lit, MARGIN * SS, MARGIN * SS, ww * SS, wh * SS, 0, 0, PW, PH);
      const png = await new Promise(async (r) => { const f = new FileReader(); f.onload = () => r(f.result.split(',')[1]); f.readAsDataURL(await pic.convertToBlob({ type: 'image/png' })); });
      // The land under the window on the original's tint grid; its cells' towns are the 2D map's to give (core of a pack's game).
      const tint = window.__flatTintGrid(view.tintAt, { x: cx + ox, y: cy + oy, width: ww, height: wh, w: nW / scale, h: nH / scale, scale, runMax });
      const n = (v) => Math.round(v * 1000) / 1000;
      return { png, meta: { rect: [n(ox), n(oy), n(ww), n(wh)], cell: [i0, j0], size: [PW, PH], land: tint.territory } };
    }, { W: FRAME[0], H: FRAME[1], SS, month, flat, MARGIN, scale: TERRITORY_GRID_SCALE, runMax: TERRITORY_RUN_MAX, first: !Object.keys(metas).length, bi: k + 1 });
    const meta = metas[board] = res.meta;
    const png = join(scratch, `${board}-${season}.png`), webp = join(dest, `flat-${season}.webp`);
    writeFileSync(png, Buffer.from(res.png, 'base64'));
    execFileSync('cwebp', ['-quiet', '-q', '82', '-m', '6', '-alpha_q', '100', png, '-o', webp]);
    console.log(`${board} ${season}: month ${month}, ${meta.size.join('×')} at ${meta.rect.join(', ')}, ${Math.round(Date.now() - t0)} ms`);
  }
  for (const [board, meta] of Object.entries(metas)) writeFileSync(join(HD2D, 'assets/ai/sandtable/regions', board, 'flat.json'), JSON.stringify(meta));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
