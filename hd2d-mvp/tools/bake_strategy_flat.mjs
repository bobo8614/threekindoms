// The low-quality 战略地图's four board pictures, photographed from the 3D sand table (the season colours live in its
// shaders), and the coordinates the 2D map draws by, projected through the same camera.
//   node hd2d-mvp/tools/bake_strategy_flat.mjs <scratch_dir> [--dest assets/ai/sandtable/flat] [--ss 1.5] [--only spring] [--metadata-only]
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
  const metadataOnly = process.argv.includes('--metadata-only'); // refresh ownership after a border warp change, without photographing the seasons again
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
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    page.on('pageerror', (e) => console.error('page error:', e.message));
    await page.goto(url); await page.waitForFunction(() => window.__game?.debug, null, { timeout: 120000 });
    await page.addScriptTag({ content: `window.__flatTintGrid = ${buildTintGrid.toString()};` });
    if (metadataOnly) {
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

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
