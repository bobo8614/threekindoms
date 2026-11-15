// The live flat-map territory grid comes from the same ground projection as the picture, including its sea mask.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const board = JSON.parse(readFileSync(new URL('../assets/ai/sandtable/flat/board.json', import.meta.url)));

// Reconstruct bakeView's fixed camera and the installed ground without starting a browser.
function installedProjection() {
  const sand = JSON.parse(readFileSync(new URL('../assets/ai/sandtable/board/board.json', import.meta.url)));
  const bytes = readFileSync(new URL('../assets/ai/sandtable/board/height.bin', import.meta.url));
  const [X0, X1, Z0, Z1] = sand.box, [GW, GH] = sand.grid, [dx, dz] = sand.step, H = new Float32Array(GW * GH);
  for (let i = 0; i < H.length; i++) H[i] = sand.h[0] + bytes.readUInt16LE(i * 2) / 65535 * (sand.h[1] - sand.h[0]);
  const at = (k, j) => H[Math.min(GH - 1, Math.max(0, j)) * GW + Math.min(GW - 1, Math.max(0, k))];
  const height = (x, z) => {
    const fk = (x - X0) / dx, fj = (z - Z0) / dz, k = Math.floor(fk), j = Math.floor(fj), a = fk - k, b = fj - j;
    return (at(k, j) * (1 - a) + at(k + 1, j) * a) * (1 - b) + (at(k, j + 1) * (1 - a) + at(k + 1, j + 1) * a) * b;
  };
  const W = 3900, V = 3200, pitch = 1.05, distance = 144, sin = Math.sin(pitch), cos = Math.cos(pitch);
  const x = (X0 + X1) / 2, z = (Z0 + Z1) / 2 + 1.5, cameraY = sin * distance, cameraZ = z + cos * distance, lens = V / 2 / Math.tan(10 * Math.PI / 360);
  const framePoint = (px, py, pz) => {
    const dy = py - cameraY, zz = pz - cameraZ, forward = -dy * sin - zz * cos;
    return [W / 2 + lens * (px - x) / forward, V / 2 - lens * (dy * cos - zz * sin) / forward];
  };
  const offsets = sand.cities.map((c) => { const [px, py] = framePoint(c.mx, c.y, c.mz), flat = board.cities.find((p) => p.id === c.id); return [px - flat.cx, py - flat.cy]; });
  const crop = [0, 1].map((axis) => Math.round(offsets.reduce((sum, p) => sum + p[axis], 0) / offsets.length));
  const cropError = Math.max(...offsets.flatMap((p) => [Math.abs(p[0] - crop[0]), Math.abs(p[1] - crop[1])]));
  const ground = (px, py) => {
    const ux = (px + crop[0] - W / 2) / lens, uy = (V / 2 - py - crop[1]) / lens;
    const vx = ux, vy = -sin + uy * cos, vz = -cos - uy * sin;
    let gx = 0, gz = 0, gy = sand.sea;
    for (let i = 0; i < 4; i++) {
      const t = (gy - cameraY) / vy; gx = x + vx * t; gz = cameraZ + vz * t;
      if (gx < X0 || gx > X1 || gz < Z0 || gz > Z1) return null;
      gy = Math.max(sand.sea, height(gx, gz));
    }
    return [gx, gz];
  };
  const project = (px, py, pz) => { const p = framePoint(px, py, pz); return [p[0] - crop[0], p[1] - crop[1]]; };
  return { sand, height, project, ground, crop, cropError };
}

function territoryCells(t) {
  const packed = Buffer.from(t.city, 'base64'); if (t.encoding !== 'rle8') return packed;
  assert.equal(packed.length % 2, 0); const cells = Buffer.alloc(t.w * t.h); let at = 0;
  for (let i = 0; i < packed.length; i += 2) {
    const n = packed[i + 1]; assert.ok(n > 0 && at + n <= cells.length); cells.fill(packed[i], at, at + n); at += n;
  }
  assert.equal(at, cells.length); return cells;
}

test('full and metadata-only bakes can rebuild the same complete territory grid without a browser', () => {
  const module = new URL('../tools/bake_strategy_flat.mjs', import.meta.url).href;
  const script = `import assert from 'node:assert/strict'; import { runInNewContext } from 'node:vm';
    import { buildTintGrid } from ${JSON.stringify(module)};
    const sample = (x, y) => ({ near: x < 4 ? 0 : 1, k: y < 5 ? 1 : 0, land: y < 5 ? 1 : 0 });
    const options = { x: 1, y: 1, width: 8, height: 8, w: 4, h: 4, scale: 2, runMax: 255 };
    const full = buildTintGrid(sample, options), refreshed = buildTintGrid(sample, options);
    assert.deepEqual(refreshed, full);
    const context = { window: {}, btoa }; runInNewContext('window.__flatTintGrid = ' + buildTintGrid.toString() + ';', context);
    assert.deepEqual(JSON.parse(JSON.stringify(context.window.__flatTintGrid(sample, options))), full, 'the injected browser function has no Node-only dependencies');
    assert.deepEqual(Object.keys(full), ['w', 'h', 'near', 'k', 'land', 'territory']);
    assert.ok(full.k.some(k => k === 1) && full.k.some(k => k === 0));
    assert.deepEqual(full.k, full.land);
    assert.deepEqual(full.near, [0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1]);
    const packed = Buffer.from(full.territory.city, 'base64');
    const cells = []; for (let i = 0; i < packed.length; i += 2) cells.push(...Array(packed[i + 1]).fill(packed[i]));
    assert.equal(cells.length, full.territory.w * full.territory.h);
    assert.deepEqual(cells.slice(0, 8), [1, 1, 1, 2, 2, 2, 2, 2]);
    assert.deepEqual(cells.slice(-8), Array(8).fill(0));`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

test('the packed territory grid keeps the original land and nearest-city samples', () => {
  const t = board.tint, fine = t.territory, scale = fine.w / t.w, cells = territoryCells(fine);
  assert.ok(Number.isInteger(scale) && scale > 1 && fine.h === t.h * scale);
  assert.equal(cells.length, fine.w * fine.h); assert.equal(t.land.length, t.w * t.h);
  assert.equal(t.k.length, t.land.length); assert.ok(t.k.every((k, i) => k === t.land[i]), 'the full bake writes the current land strength');
  assert.ok(cells.some((n) => n === 0) && cells.some((n) => n > 0));
  assert.ok(cells.every((n) => n <= board.cities.length));
  let compared = 0;
  for (let j = 0; j < t.h; j++) for (let i = 0; i < t.w; i++) {
    const first = cells[(j * scale) * fine.w + i * scale]; let uniform = true;
    for (let y = 0; y < scale && uniform; y++) for (let x = 0; x < scale; x++) if (cells[(j * scale + y) * fine.w + i * scale + x] !== first) { uniform = false; break; }
    if (!uniform) continue; // a coast or border can cross the coarse cell
    const n = j * t.w + i; compared++;
    assert.equal(first, t.land[n] ? t.near[n] + 1 : 0, `cell ${i},${j}`);
  }
  assert.ok(compared > t.w * t.h / 2, 'most cells agree away from coasts and borders');
  if (t.k.some((k) => k > 0 && k < 1)) assert.ok(t.land.some((land, i) => land && t.k[i] === 0), 'legacy zero falloff includes distant land');
});

test('the installed flat territory comes from the installed 3D board', async () => {
  const { buildTintGrid } = await import('../tools/bake_strategy_flat.mjs');
  const { sand, height, ground, crop, cropError } = installedProjection(); assert.ok(cropError < .1);
  const tintAt = (px, py) => {
    const q = ground(px - crop[0], py - crop[1]); if (!q) return { near: -1, k: 0, land: 0 };
    const [x, z] = q, wx = x + .48 * (Math.sin(z * .47 + x * .13) + .4 * Math.sin(z * .88 - x * .26));
    const wz = z + .48 * (Math.sin(x * .43 - z * .15) + .4 * Math.sin(x * .8 + z * .31));
    let best = 0, distance = Infinity;
    for (let i = 0; i < sand.cities.length; i++) {
      const c = sand.cities[i], d = (wx - c.x) ** 2 + (wz - c.z) ** 2;
      if (d < distance) { distance = d; best = i; }
    }
    const land = height(x, z) >= sand.sea ? 1 : 0;
    return { near: sand.cities[best].id, k: land, land };
  };
  const t = board.tint, got = buildTintGrid(tintAt, { x: crop[0], y: crop[1], width: board.size[0], height: board.size[1],
    w: t.w, h: t.h, scale: t.territory.w / t.w, runMax: 255 });
  assert.deepEqual(got, t, 'full and metadata-only sampling reproduce all six fields of the installed grid');
});

test('the flat road points project the installed courses and sea spans', () => {
  const { sand, height, project, cropError } = installedProjection();
  assert.ok(cropError < .1, `flat picture and installed city projection differ by ${cropError}px`);
  const roads = new Map(sand.roads.map((r) => [`${r.a}-${r.b}`, r]));
  assert.equal(board.roads.length, roads.size);
  let maxError = 0;
  for (const r of board.roads) {
    const source = roads.get(`${r.a}-${r.b}`); assert.ok(source, `road ${r.a}-${r.b} exists`);
    assert.equal(r.p.length / 2, source.p.length / 3); assert.equal(r.sea.length, r.p.length / 2);
    for (let i = 0; i < r.sea.length; i++) {
      const [x, y, z] = source.p.slice(i * 3, i * 3 + 3), h = height(x, z), sea = h < sand.sea + .01;
      assert.equal(r.sea[i], sea, `road ${r.a}-${r.b} sea sample ${i}`);
      const [px, py] = project(x, Math.max(y, sea ? sand.sea : h), z);
      maxError = Math.max(maxError, Math.abs(px - r.p[i * 2]), Math.abs(py - r.p[i * 2 + 1]));
    }
  }
  assert.ok(maxError < .1, `road projection differs by ${maxError}px`);
});

test('the distant flat-map test samples are beyond the former 2.8-world-unit radius', () => {
  const { sand, ground, cropError } = installedProjection(); assert.ok(cropError < .1);
  const T = board.tint, id = 28, city = board.cities.find((c) => c.id === id), seat = sand.cities.find((c) => c.id === id);
  const fine = T.territory, cells = territoryCells(fine), scale = fine.w / T.w; let samples = 0;
  for (let j = 1; j < T.h - 1 && samples < 20; j++) for (let i = 1; i < T.w - 1 && samples < 20; i++) {
    const n = j * T.w + i, q = (j * scale + Math.floor(scale / 2)) * fine.w + i * scale + Math.floor(scale / 2);
    const x = (i + .5) / T.w * board.size[0], y = (j + .5) / T.h * board.size[1];
    if (T.near[n] !== id || !T.land[n] || cells[q] !== id + 1 || Math.hypot(x - city.cx, y - city.cy) < 500) continue;
    if ([q - scale, q + scale, q - scale * fine.w, q + scale * fine.w].some((p) => cells[p] !== id + 1)) continue;
    const world = ground(x, y); assert.ok(world, `sample ${i},${j} projects onto the board`);
    assert.ok(Math.hypot(world[0] - seat.x, world[1] - seat.z) > 2.8, `sample ${i},${j} exceeds the old cutoff`); samples++;
  }
  assert.equal(samples, 20, 'the browser test has 20 distant land samples');
});
