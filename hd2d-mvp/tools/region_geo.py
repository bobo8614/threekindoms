#!/usr/bin/env python3
# An overseas region's geography for the sand table (docs/战略地图数据包扩展设计_2026-11-17.md §5.5), in the shape of
# src/china.js: land polygons and rivers clipped to the region's box and thinned to the board's grain, its lakes and ranges
# from the region's spec (tools/regions/<name>.json). Writes src/regions/<name>.js.
#   python3 -I hd2d-mvp/tools/region_geo.py hd2d-mvp/tools/regions/<name>.json --land <ne_10m_land.geojson> --rivers <ne_10m_rivers_lake_centerlines.geojson>
# The Natural Earth files (public domain, naturalearthdata.com) are inputs only; they are not kept in the repository.
import json, math, os, sys

def arg(k):
    i = sys.argv.index(k); return sys.argv[i + 1]

def clip(ring, box):  # Sutherland–Hodgman against the four sides of the box
    x0, x1, y0, y1 = box
    sides = [(lambda p: p[0] >= x0, lambda a, b: (x0, a[1] + (b[1] - a[1]) * (x0 - a[0]) / (b[0] - a[0]))),
             (lambda p: p[0] <= x1, lambda a, b: (x1, a[1] + (b[1] - a[1]) * (x1 - a[0]) / (b[0] - a[0]))),
             (lambda p: p[1] >= y0, lambda a, b: (a[0] + (b[0] - a[0]) * (y0 - a[1]) / (b[1] - a[1]), y0)),
             (lambda p: p[1] <= y1, lambda a, b: (a[0] + (b[0] - a[0]) * (y1 - a[1]) / (b[1] - a[1]), y1))]
    out = ring
    for inside, cut in sides:
        src, out = out, []
        for i, b in enumerate(src):
            a = src[i - 1]
            if inside(b):
                if not inside(a): out.append(cut(a, b))
                out.append(b)
            elif inside(a): out.append(cut(a, b))
        if not out: return []
    return out

def simplify(pts, tol):  # Douglas–Peucker, iterative
    if len(pts) < 3: return pts
    keep = [False] * len(pts); keep[0] = keep[-1] = True; stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop(); (ax, ay), (bx, by) = pts[a], pts[b]; dx, dy = bx - ax, by - ay; L = math.hypot(dx, dy) or 1e-12
        best, at = -1, -1
        for i in range(a + 1, b):
            d = abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / L
            if d > best: best, at = d, i
        if best > tol: keep[at] = True; stack += [(a, at), (at, b)]
    return [p for p, k in zip(pts, keep) if k]

def area(r): return abs(sum(r[i - 1][0] * r[i][1] - r[i][0] * r[i - 1][1] for i in range(len(r)))) / 2

spec = json.load(open(sys.argv[1])); box = spec['box']; tol = spec.get('tolerance', 0.03)
# clipMargin: land is clipped this far past the box, so a coast-free edge (land running on into a neighbour or under the frame)
# is not read as a shore along the box (east has none: its edges are its reviewed bake).
m = spec.get('clipMargin', 0); cbox = [box[0] - m, box[1] + m, box[2] - m, box[3] + m]
land = []
for f in json.load(open(arg('--land')))['features']:
    g = f['geometry']
    for poly in (g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]):
        ring = [tuple(p) for p in poly[0][:-1]]
        if max(p[0] for p in ring) < cbox[0] or min(p[0] for p in ring) > cbox[1] or max(p[1] for p in ring) < cbox[2] or min(p[1] for p in ring) > cbox[3]: continue
        part = clip(ring, cbox)
        if len(part) < 3 or area(part) < spec.get('minArea', 0.012): continue
        # A closed ring: split at the point furthest from the first, so each half has two distinct ends.
        far = max(range(len(part)), key=lambda i: math.hypot(part[i][0] - part[0][0], part[i][1] - part[0][1]))
        part = simplify(part[:far + 1], tol)[:-1] + simplify(part[far:] + [part[0]], tol)[:-1]
        if len(part) >= 3: land.append([[round(x, 3), round(y, 3)] for x, y in part])
rivers = []
want = {r['source']: r for r in spec.get('rivers', [])}
for f in json.load(open(arg('--rivers')))['features']:
    r = want.get(f['properties'].get('name'))
    if not r: continue
    g = f['geometry']
    for line in (g['coordinates'] if g['type'] == 'MultiLineString' else [g['coordinates']]):
        pts = [p for p in line if cbox[0] <= p[0] <= cbox[1] and cbox[2] <= p[1] <= cbox[3]]  # past the box too: a river runs on into the next board
        if len(pts) >= 2: rivers.append({'name': r['name'], 'w': r['w'], 'pts': [[round(x, 3), round(y, 3)] for x, y in simplify(pts, tol)]})
# Natural Earth draws a river as pieces (through a reservoir, past a confluence) whose ends need not meet: joined where they nearly
# do (joinRivers, degrees), so the board carves one course instead of a dashed one with a tapered gap at each break.
J = spec.get('joinRivers', 0)
def join(rs):
    rs = [dict(r) for r in rs]
    merged = True
    while merged:
        merged = False
        for i in range(len(rs)):
            for k in range(len(rs)):
                if i == k or rs[i]['name'] != rs[k]['name']: continue
                a, b = rs[i]['pts'], rs[k]['pts']
                for aa, bb in ((a, b), (a, b[::-1]), (a[::-1], b), (a[::-1], b[::-1])):
                    if math.hypot(aa[-1][0] - bb[0][0], aa[-1][1] - bb[0][1]) < J:
                        rs[i] = {**rs[i], 'pts': aa + bb[1:]}; del rs[k]; merged = True; break
                if merged: break
            if merged: break
    return rs
if J: rivers = join(rivers)
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'regions', f"{spec['name']}.js")
os.makedirs(os.path.dirname(out), exist_ok=True)
data = {'name': spec['name'], 'title': spec['title'], 'box': box, 'land': land, 'rivers': rivers, 'lakes': spec.get('lakes', []), 'ranges': spec.get('ranges', [])}
if 'coast' in spec: data['coast'] = spec['coast']  # worldmap.js coastRise
if spec.get('china'): data['china'] = True  # worldmap.js: the original's dry country and uplands run on into it
with open(out, 'w') as fh:
    fh.write(f"// Generated by tools/region_geo.py from tools/regions/{spec['name']}.json and Natural Earth 10m (public domain). Do not edit.\n")
    fh.write(f"// {spec['note']}\nexport default {json.dumps(data, ensure_ascii=False, separators=(',', ':'))};\n")
print(out, len(land), 'polygons', sum(len(p) for p in land), 'points', len(rivers), 'rivers')
