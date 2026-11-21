// No general on the 3D war board is hidden by the ground (docs/战场3D矮台地修改计划_2026-11-21.md): on every battlefield, from each
// of the four corner views, a box of sample points a general's size (3 across × 5 up) stands on each cell he can stand on, and a
// point is hidden when the board's ground between it and the camera rises above the line of sight. The heights are the board's own
// (src/war/heights.js); the castle's plinth counts, the woods and pictures do not. No browser: the cells' heights alone, a few seconds.
// The lip of a mesa may touch the hooves of a horse below it, so the limit is a fifth of the box, not none.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PLAIN_Y, CASTLE_Y, RIVER_BED_Y, hillTop } from '../src/war/heights.js';

const D = JSON.parse(readFileSync(new URL('../data/game-data.json', import.meta.url), 'utf8'));
const W = 32, H = 19, PITCH = 0.663, YAWS = [1, 3, 5, 7].map((k) => k * Math.PI / 4); // src/war/shared.js, src/core/field.js
const FOREST = 0, SAND = 1, PLAIN = 2, RIVER = 3, MOUNT = 4, CASTLE = 5;
const UP = [0.1, 0.35, 0.6, 0.85, 1.1], ACROSS = [-0.35, 0, 0.35], LIMIT = 0.2;

function hidden(map, yaw, hillH = hillTop) {
  const terr = (x, y) => map[Math.max(0, Math.min(H - 1, y))][Math.max(0, Math.min(W - 1, x))]; // a range runs on past the edge
  const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const hill = (x, y) => terr(x, y) === MOUNT;
  const top = (x, y) => { const t = terr(x, y); return t === MOUNT ? hillH(hill, x, y) : t === RIVER ? RIVER_BED_Y : t === CASTLE ? CASTLE_Y : PLAIN_Y; };
  // the ground at a point: the board, and two cells of a range carried on level past its edge (src/war/board.js apron)
  const ground = (px, py) => {
    const x = Math.floor(px), y = Math.floor(py);
    if (inside(x, y)) return top(x, y);
    return Math.max(-x, x - W + 1, -y, y - H + 1) <= 2 && hill(x, y) ? top(Math.max(0, Math.min(W - 1, x)), Math.max(0, Math.min(H - 1, y))) : PLAIN_Y;
  };
  let highest = CASTLE_Y; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) highest = Math.max(highest, top(x, y));
  const sp = Math.sin(PITCH), cp = Math.cos(PITCH), cx = Math.sin(yaw) * cp, cy = Math.cos(yaw) * cp, sx = Math.cos(yaw), sy = -Math.sin(yaw);
  const out = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (map[y][x] === RIVER || map[y][x] === CASTLE) continue;
    let n = 0;
    for (const h of UP) for (const s of ACROSS) {
      const px = x + 0.5 + sx * s, py = y + 0.5 + sy * s, ph = top(x, y) + h, reach = (highest - ph) / sp;
      for (let k = 0.03; k < reach; k += 0.015) if (ground(px + cx * k, py + cy * k) > ph + sp * k + 1e-6) { n++; break; }
    }
    out.push({ x, y, hid: n / (UP.length * ACROSS.length) });
  }
  return out;
}

test('on every battlefield and from every corner, the ground hides no general by a fifth or more', () => {
  const bad = [];
  let cells = 0, worst = 0;
  D.maps.forEach((map, c) => {
    if (!map.flat().includes(MOUNT) && !map.flat().includes(CASTLE)) return;
    YAWS.forEach((yaw, k) => { for (const r of hidden(map, yaw)) { cells++; worst = Math.max(worst, r.hid); if (r.hid >= LIMIT) bad.push(`${D.cities[c]?.name ?? c} (${r.x},${r.y}) view ${k}: ${(r.hid * 100).toFixed(0)}%`); } });
  });
  assert.ok(cells > 50000, `${cells} cells × views measured`);
  assert.deepEqual(bad.slice(0, 20), [], `${bad.length} cells hidden by a fifth or more (worst ${(worst * 100).toFixed(0)}%)`);
});

// The measure itself still sees a mesa that stands too high: at the old heights (a step of 0.75, two in a range's core) the same
// count finds thousands of generals hidden by a fifth or more (4,575 when it was written).
test('the occlusion measure catches the old, tall mesas', () => {
  const old = (hill, x, y) => PLAIN_Y + 0.75 * ([[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => hill(x + dx, y + dy)) ? 2 : 1);
  let n = 0; for (const map of D.maps) for (const yaw of YAWS) n += hidden(map, yaw, old).filter((r) => r.hid >= LIMIT).length;
  assert.ok(n > 4000, `${n} cells hidden at the old heights`);
});
