// Strategy roads: receives the scene, board, city positions and ground height; owns the paths and road meshes.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SEA_Y } from './worldmap.js';
import { courseOf, waterIndex, wetCostOf, crossings } from './packgeo.js';

// Quiet road ink follows the bake at roughly three CSS pixels wide; fresh water keeps its own surface.
const ROAD_HALF_PX = 1.4, ROAD_CORE = 0.45, ROAD_ALPHA = 0.55, ROAD_SEA_ALPHA = 0.18, ROAD_END_ALPHA = 0.7, ROAD_LIFT = 0.012;
const ROAD_WATER_CELL = 0.5, ROAD_WATER_MARGIN = 0.09, ROAD_BRIDGE_RADIUS = 0.12, ROAD_SIMPLIFY_XZ = 0.00025, ROAD_SIMPLIFY_Y = 0.003, ROAD_MAX_STEP = 0.2;
const ROAD_EDGE = '#b39569', ROAD_LAND = '#d8bd8f', ROAD_SEA = '#b6d4d6', ROAD_NEAR_OPACITY = 0.45, ROAD_ZOOM = [10, 45.6]; // warm earth; BasicMaterial does not receive owner tint
const ROAD_FAR_ZOOM = [24, 45.6], ROAD_FAR_ALPHA = 0.4, ROAD_FAR_HALF_PX = 1;

export function createStrategyRoads({ scene, data, sand, world, cityPos, groundY }) {
  // Roads: packed-earth ribbons draped on the land, bowing round any city that sits on the straight line;
  // a crossing by sea (辽东–青州 over the 渤海) is a dashed sea lane. The selected city's roads light up (select()).
  const paths = new Map();
  let wetCost = null; // the sand table's, for a pack's roads (set below): how much of a course runs over fresh water
  const pathOf = (a, b) => {
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (!paths.has(key) && sand && world.roadPath(Math.min(a, b), Math.max(a, b))) paths.set(key, world.roadPath(Math.min(a, b), Math.max(a, b)));
    if (!paths.has(key)) paths.set(key, courseOf(Math.min(a, b), Math.max(a, b), cityPos, groundY, wetCost));
    const pts = paths.get(key);
    return a < b ? pts : [...pts].reverse();
  };
  const roadMat = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, roughness: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const dirt = new THREE.Color('#8e7650'), lane = new THREE.Color('#efe4c8');
  // A ribbon of half-width w along a road, lifted by `lift`, its colour and alpha per point: (atSea, run, end) → [Color, alpha].
  const ribbon = (pts, w, lift, paint) => {
    const pos = [], col = [], idx = [];
    let run = 0;
    pts.forEach((p, k) => {
      const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)], dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1;
      const ox = -dz / L * w, oz = dx / L * w;
      if (k) run += p.distanceTo(pts[k - 1]);
      const ground = world.heightAt(p.x, p.z), atSea = ground < SEA_Y + 0.01, end = Math.min(run, 99) < 0.35 || k > pts.length - 8;
      const y = Math.max(p.y, atSea ? SEA_Y : ground) + lift; // baked paths can run under the surface
      const [cc, alpha] = paint(atSea, run, end);
      pos.push(p.x + ox, y, p.z + oz, p.x - ox, y, p.z - oz); col.push(cc.r, cc.g, cc.b, alpha, cc.r, cc.g, cc.b, alpha);
      if (k) { const v = k * 2; idx.push(v - 2, v, v - 1, v - 1, v, v + 1); }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  };
  const dash = (run) => Math.floor(run / 0.12) % 2 === 0;
  if (!sand) for (const c of data.cities) for (const n of c.roads) if (c.id < n) { // the sand table's roads are in its bake
    const g = ribbon(pathOf(c.id, n), 0.03, 0.02, (atSea, run, end) => [atSea ? lane : dirt, atSea ? (dash(run) ? 0.75 : 0) : end ? 0.4 : 0.8]);
    const road = new THREE.Mesh(g, roadMat); road.receiveShadow = true; road.renderOrder = 2; scene.add(road);
  }
  // Four vertices across each ribbon feather the edge; one mesh and an offset attribute keep its width adjustable.
  const baseRoadMat = sand ? new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }) : null;
  const roadWidth = { value: 0 };
  let baseRoad = null, roadDist = NaN, roadHeight = NaN, roadFov = NaN;
  if (sand) {
    const edge = new THREE.Color(ROAD_EDGE), land = new THREE.Color(ROAD_LAND), sea = new THREE.Color(ROAD_SEA), pieces = [];
    const widths = [1, ROAD_CORE, -ROAD_CORE, -1], bridges = sand.meta.pieces.bridge ?? [];
    const waterAt = waterIndex(sand.meta.water, { cell: ROAD_WATER_CELL, margin: ROAD_WATER_MARGIN });
    // Remove only points within a sub-pixel lateral tolerance and the local ground relief.
    const thin = (pts) => {
      const kept = [pts[0]]; let start = 0;
      for (let i = 2; i < pts.length; i++) {
        const a = pts[start], b = pts[i], dx = b.x - a.x, dz = b.z - a.z, len2 = dx * dx + dz * dz;
        let fits = b.alpha === a.alpha && len2 <= ROAD_MAX_STEP * ROAD_MAX_STEP;
        for (let j = start + 1; fits && j < i; j++) {
          const q = pts[j], t = len2 ? Math.min(1, Math.max(0, ((q.x - a.x) * dx + (q.z - a.z) * dz) / len2)) : 0;
          fits = q.alpha === a.alpha && (q.x - a.x - t * dx) ** 2 + (q.z - a.z - t * dz) ** 2 <= ROAD_SIMPLIFY_XZ ** 2 && Math.abs(q.y - a.y - t * (b.y - a.y)) <= ROAD_SIMPLIFY_Y;
        }
        if (!fits) { kept.push(pts[i - 1]); start = i - 1; }
      }
      if (pts.length > 1) kept.push(pts[pts.length - 1]);
      return kept;
    };
    baseRoadMat.onBeforeCompile = (sh) => {
      sh.uniforms.uRoadWidth = roadWidth;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 roadOffset; uniform float uRoadWidth;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.xz += roadOffset * uRoadWidth;');
    };
    baseRoadMat.customProgramCacheKey = () => 'sandRoadInk';
    const packEarth = new THREE.Color('#d2c29c'); // the baked roads' packed earth in the albedo
    const trackMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
    // A pack road's crossings: each run of points over fresh water gets one baked bridge piece along the road, stretched to
    // the run's length, and those points count as bridge (the ink goes over it). Returns the bridged point indices.
    const bridgeParts = world.pieceModel?.('bridge') ?? [], BRIDGE_LEN = sand.meta.size.bridge ?? 0.2;
    if (data.pack) wetCost = wetCostOf(waterAt);
    const spans = (course) => {
      const on = new Set();
      for (const [k, e] of crossings(course, waterAt)) {
        const a = course[Math.max(0, k - 1)], b = course[Math.min(course.length - 1, e + 1)], len = a.distanceTo(b);
        for (let q = Math.max(0, k - 1); q <= Math.min(course.length - 1, e + 1); q++) on.add(q);
        const mid = course[(k + e) >> 1], ry = Math.atan2(-(b.z - a.z), b.x - a.x), sc = Math.max(1, len / BRIDGE_LEN);
        const y = Math.max(world.surfaceAt(a.x, a.z), world.surfaceAt(b.x, b.z));
        for (const { geo, mat } of bridgeParts) {
          const m = new THREE.Mesh(geo, mat); m.position.set(mid.x, y, mid.z); m.rotation.y = ry; m.scale.set(sc, 1, Math.min(sc, 1.5)); m.userData.packBridge = true; scene.add(m);
        }
      }
      return on;
    };
    for (const c of data.cities) for (const n of c.roads) if (c.id < n) {
      // A road the bake drew has its course and its earth in the picture; never invent a second course beside it. A pack's
      // road (one end or both at a city the bake never saw, or a new pair) takes the drawn curve, an earth track under the ink,
      // and a bridge wherever it crosses a river or lake.
      const baked = world.roadPath(c.id, n), course = baked?.length ? baked : data.pack ? pathOf(c.id, n) : null;
      if (!course?.length) continue;
      const span = baked?.length ? null : spans(course);
      if (span) {
        const g = ribbon(course, 0.032, 0.006, (atSea, run, end) => [packEarth, atSea ? 0 : end ? 0.5 : 0.85]);
        const track = new THREE.Mesh(g, trackMat); track.renderOrder = 2; scene.add(track);
      }
      let run = 0;
      const pts = thin(course.map((p, k) => {
        if (k) run += p.distanceTo(course[k - 1]);
        let bridge = !!span?.has(k);
        const atSea = !bridge && world.heightAt(p.x, p.z) < SEA_Y + 0.01, wet = waterAt(p.x, p.z);
        if (wet && !atSea) for (let i = 0; i < bridges.length; i += 6) if ((p.x - bridges[i]) ** 2 + (p.z - bridges[i + 2]) ** 2 <= ROAD_BRIDGE_RADIUS ** 2) { bridge = true; break; }
        const alpha = wet && !bridge ? 0 : atSea ? (dash(run) ? ROAD_SEA_ALPHA : 0) : ROAD_ALPHA * (run < 0.35 || k > course.length - 8 ? ROAD_END_ALPHA : 1);
        return { x: p.x, y: (bridge ? Math.max(world.surfaceAt(p.x, p.z), p.y) : world.surfaceAt(p.x, p.z)) + ROAD_LIFT, z: p.z, atSea, alpha };
      }));
      const pos = [], offset = [], col = [], idx = [];
      pts.forEach((p, k) => {
        const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)], dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1;
        for (let j = 0; j < widths.length; j++) {
          const core = j === 1 || j === 2, color = core ? (p.atSea ? sea : land) : edge;
          pos.push(p.x, p.atSea ? Math.max(p.y, SEA_Y + ROAD_LIFT) : p.y, p.z); offset.push(-dz / L * widths[j], dx / L * widths[j]);
          col.push(color.r, color.g, color.b, core ? p.alpha : 0);
          if (k && j < widths.length - 1) { const v = k * widths.length + j; idx.push(v - widths.length, v, v - widths.length + 1, v - widths.length + 1, v, v + 1); }
        }
      });
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('roadOffset', new THREE.Float32BufferAttribute(offset, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4)); g.setIndex(idx); pieces.push(g);
    }
    const merged = mergeGeometries(pieces); merged.computeBoundingSphere(); merged.boundingSphere.radius += 0.5; // offsets also remain visible at the screen edge
    baseRoad = new THREE.Mesh(merged, baseRoadMat); baseRoad.renderOrder = 2; scene.add(baseRoad);
    for (const g of pieces) g.dispose();
  }
  // 道路 overview (playtest of 2026-10-30, T15): every road at once, a bright lacquer-gold line on a dark edge so it
  // reads over sand, snow and water alike; sea lanes dashed. Built on first use; roads(on) shows it.
  let overview = null;
  const buildOverview = () => {
    const grp = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, fog: false });
    const edge = new THREE.Color('#2a1606'), gold = new THREE.Color('#ffd878'), sea = new THREE.Color('#e8f4ff');
    for (const c of data.cities) for (const n of c.roads) if (c.id < n) {
      const pts = pathOf(c.id, n);
      const under = new THREE.Mesh(ribbon(pts, 0.075, 0.035, (atSea, run) => [edge, atSea ? (dash(run) ? 0.5 : 0) : 0.55]), mat);
      const line = new THREE.Mesh(ribbon(pts, 0.036, 0.04, (atSea, run) => [atSea ? sea : gold, atSea ? (dash(run) ? 0.95 : 0) : 0.95]), mat);
      under.renderOrder = 3; line.renderOrder = 4; grp.add(under, line);
    }
    scene.add(grp); return grp;
  };
  let roadsOn = false;
  return {
    pathOf,
    roads(on) { roadsOn = on; if (on) overview ??= buildOverview(); if (overview) overview.visible = on; },
    get roadsOn() { return roadsOn; },
    hideBase() { if (baseRoad) baseRoad.visible = false; },
    update(view, camera) {
      if (baseRoadMat && (roadDist !== view.dist || roadHeight !== innerHeight || roadFov !== camera.fov)) {
        roadDist = view.dist; roadHeight = innerHeight; roadFov = camera.fov;
        const far = THREE.MathUtils.smoothstep(roadDist, ROAD_FAR_ZOOM[0], ROAD_FAR_ZOOM[1]);
        roadWidth.value = THREE.MathUtils.lerp(ROAD_HALF_PX, ROAD_FAR_HALF_PX, far) * 2 * Math.tan(THREE.MathUtils.degToRad(roadFov / 2)) * roadDist / Math.max(1, roadHeight);
        baseRoadMat.opacity = THREE.MathUtils.lerp(ROAD_NEAR_OPACITY, 1, THREE.MathUtils.smoothstep(roadDist, ROAD_ZOOM[0], ROAD_ZOOM[1])) * THREE.MathUtils.lerp(1, ROAD_FAR_ALPHA / ROAD_ALPHA, far);
      }
    },
  };
}
