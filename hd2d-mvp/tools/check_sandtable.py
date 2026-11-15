#!/usr/bin/env python3
# Check the sand table's layout (tools/blender_sandtable.py, after its prepare step): every city model on dry land
# and on its own bank, how far each had to step back from the water, and no mountain, hill, hamlet or grove over a
# river, the lake, the sea or a road.
#   python3 hd2d-mvp/tools/check_sandtable.py [--staged] [--terrain-details]
#   python3 hd2d-mvp/tools/check_sandtable.py --staged --record-terrain-review "note" --review-picture path [...]
# --staged also checks SANDTABLE_DEST's finished road centres and packed heights (the installed board by default).
# --terrain-details lists every exposed steep region, not just the twelve worst.
import argparse, datetime, json, math, os, sys, tempfile
import numpy as np
import sandtable_ranges as ranges
parser = argparse.ArgumentParser(description='Check the sand-table preparation and staged board.')
parser.add_argument('--staged', action='store_true'); parser.add_argument('--terrain-details', action='store_true')
parser.add_argument('--record-terrain-review', metavar='NOTE'); parser.add_argument('--review-picture', action='append', default=[], metavar='PATH')
args = parser.parse_args(); staged = args.staged; terrain_details = args.terrain_details; record_note = args.record_terrain_review
if record_note is not None:
    if not staged: parser.error('--record-terrain-review requires --staged')
    if not record_note.strip(): parser.error('the review note cannot be empty')
    if not args.review_picture: parser.error('--record-terrain-review requires at least one --review-picture')
elif args.review_picture: parser.error('--review-picture requires --record-terrain-review')
sys.argv = sys.argv[:1]
TOOLS = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.realpath(os.path.dirname(os.path.dirname(TOOLS))); review_path = f'{TOOLS}/sandtable_ranges_reviewed.json'
pictures = []
for p in args.review_picture:
    path = os.path.realpath(p)
    if os.path.commonpath((ROOT, path)) != ROOT or not os.path.isfile(path): parser.error(f'review picture must be an existing file in this worktree: {p}')
    pictures.append(os.path.relpath(path, ROOT))
src = open(f'{TOOLS}/blender_sandtable.py').read().split('\ntry:\n    import bpy')[0]
ns = {'__file__': f'{TOOLS}/blender_sandtable.py'}; exec(src, ns)
installed_dir = f"{ns['MVP']}/assets/ai/sandtable/board"
with open(f'{installed_dir}/board.json') as f: installed = json.load(f)
# After installation, a plain check uses the reviewed preparation, not the old source/work tree-piece cache.
auto_work = not staged and 'SANDTABLE_WORK' not in os.environ and any(installed.get('pieces', {}).get(k) for k in ranges.RANGE_ASPECT)
if auto_work:
    ns['WORK'] = ns['INSTALLED_WORK']
try: ranges.require_preparation(ns['WORK'], 'SANDTABLE_INSTALLED_WORK' if auto_work else 'SANDTABLE_WORK', ('ground.npz', 'place.json'))
except FileNotFoundError as error: sys.exit(str(error))
if not os.path.isfile(f"{ns['BOARD']}/board.json"): sys.exit(f"Missing {ns['BOARD']}/board.json; restore the local exported source board before checking.")
d = np.load(f"{ns['WORK']}/ground.npz"); pj = json.load(open(f"{ns['WORK']}/place.json"))
X0, Z0, DX, DZ, SIZE, TIER, SEA_Y = ns['X0'], ns['Z0'], ns['DX'], ns['DZ'], ns['SIZE'], ns['TIER'], ns['SEA_Y']
Lv, G, K = d['Lv'], d['G'], d['K']
ridge = [p for p in pj['place'] if p['k'] in ranges.RANGE_ASPECT]
staged_meta = None
if staged and os.path.isfile(f"{ns['DEST']}/board.json"):
    with open(f"{ns['DEST']}/board.json") as f: staged_meta = json.load(f)
range_layout = (bool(ridge) or os.path.isfile(f"{ns['WORK']}/ranges.json") or
                any(installed.get('pieces', {}).get(kind) for kind in ranges.RANGE_ASPECT) or
                staged_meta is not None and any(staged_meta.get('pieces', {}).get(kind) for kind in ranges.RANGE_ASPECT))
if range_layout:
    try:
        base_work, original, selected = ranges.original_preparation(ns, ('place.json', 'ground.npz', 'road-alpha.png', 'pads.png'))
        if selected is not original: ranges.require_preparation(ns['BASE_WORK'], 'SANDTABLE_BASE_WORK', ('ground.npz',))
        reference_ns = dict(ns, BASE_WORK=base_work)
        ranges.require_preparation(ns['WORK'], 'SANDTABLE_WORK', ('ranges.json',))
        with open(f"{ns['WORK']}/ranges.json") as f: range_report = json.load(f)
        keep = range_report.get('keep')
        if keep is not None: ranges.require_preparation(ns['WORK'], 'SANDTABLE_WORK', ('keep-base.json',))
        if not ranges.same_layout(original, installed) and not ranges.same_layout(pj, installed) and not ranges.same_layout(selected, installed):
            ranges.require_preparation(ns['INSTALLED_WORK'], 'SANDTABLE_INSTALLED_WORK', ('place.json', 'ground.npz'))
    except (FileNotFoundError, ValueError) as error: sys.exit(str(error))
WET = (Lv >= 3) | (G <= SEA_Y + 0.005)
def cells(m, x, z, r):
    j0, j1 = int((z - r - Z0) / DZ), int((z + r - Z0) / DZ) + 1; k0, k1 = int((x - r - X0) / DX), int((x + r - X0) / DX) + 1
    return int(m[max(j0, 0):j1, max(k0, 0):k1].sum())
bad = 0
review_identity = review_figures = None
print('城      模型偏移  缩放  脚下水格')
for c in pj['cities']:
    h = SIZE[TIER[c['tier']]] * 0.5 * c['ms'] * 0.92
    n = cells(WET, c['mx'], c['mz'], h); moved = math.hypot(c['mx'] - c['x'], c['mz'] - c['z'])
    print(f"{c['name']:4}  {moved:6.2f}  {c['ms']:.2f}  {n:4d}{'  ✗' if n else ''}"); bad += n > 0
road = K > 0.5
for k, r in (('massif', 0.36), ('hill', 0.28), ('hamlet', 0.12), ('grove', 0.11)):
    over = [p for p in pj['place'] if p['k'] == k and cells(WET, p['x'], p['z'], r * p['s']) > 2]
    print(f'{k}: {len(over)} over water'); bad += len(over)
# Each city on the same side of its nearest river as the game has it (the sand table bends rivers round the walls).
board = json.load(open(f"{ns['BOARD']}/board.json"))
def mid(w):
    rv = np.array(w['v'], dtype=np.float32).reshape(-1, 3); return ((rv[0::2] + rv[1::2]) / 2)[:, [0, 2]]
def crossings(a, b_, p, q):   # how many of the polyline's segments a[i]-b_[i] the segment p-q crosses
    cr = lambda u, v, w_: (v[..., 0] - u[..., 0]) * (w_[..., 1] - u[..., 1]) - (v[..., 1] - u[..., 1]) * (w_[..., 0] - u[..., 0])
    return int((((cr(a, b_, p) > 0) != (cr(a, b_, q) > 0)) & ((cr(p, q, a) > 0) != (cr(p, q, b_) > 0))).sum())
# A river keeps a city on its bank when it never sweeps over the seat and the model's step back doesn't cross it. The
# side of the nearest segment won't do: it flips at a sharp bend with the city still inside the same corner.
game = [w for w in board['water'] if w['kind'] == 'river']; table = [w for w in pj['water'] if w['kind'] == 'river']
for c in pj['cities']:
    seat, model = np.array([c['x'], c['z']], dtype=np.float32), np.array([c['mx'], c['mz']], dtype=np.float32)
    for i, (w0, w1) in enumerate(zip(game, table)):
        m0, m1 = mid(w0), mid(w1)
        loop = np.concatenate([m0, m1[::-1]]); far = seat + np.array([1000.0, 0.37], dtype=np.float32)
        swept = crossings(loop, np.roll(loop, -1, 0), seat, far) % 2
        stepped = crossings(m1[:-1], m1[1:], seat, model) % 2
        if swept != stepped: print(f"✗ {c['name']} is across river {i} from its seat on the sand table"); bad += 1
print('banks checked')
# No set piece stands in a city's square.
for k, reach in ns['REACH'].items():
    pts = np.array([(p['x'], p['z']) for p in pj['place'] if p['k'] == k], dtype=np.float32).reshape(-1, 2)
    for c in pj['cities']:
        hh = SIZE[TIER[c['tier']]] * 0.5 * c['ms'] + ns['PAD_MARGIN'][c['tier']] + reach
        radius = SIZE[TIER[c['tier']]] * 0.5 * c['ms'] * math.sqrt(2) + ns['PAD_MARGIN'][c['tier']] + ns['PAD_NOISE'] * .5 + reach
        x, z = pts[:, 0] - c['mx'], pts[:, 1] - c['mz']
        n = int(((np.maximum(np.abs(x), np.abs(z)) < hh) | (np.hypot(x, z) < radius)).sum())
        if n: print(f"✗ {n} {k} in {c['name']}'s pad clearance"); bad += 1
print('footprints checked')
# New models are long and rotated: checking a circle at their centres misses roads at their ends.
if range_layout:
    if keep is not None:
        with open(f"{ns['WORK']}/keep-base.json") as f: prior = json.load(f)
    else: prior = []
    base_ground = np.load(f'{base_work}/ground.npz')
    if selected is not original:
        with np.load(f"{ns['BASE_WORK']}/ground.npz") as data:
            if not ranges.same_layout(selected, installed) or not ranges.matches_board_height(ns, data['G'], installed, installed_dir):
                print('✗ selected base preparation does not match the installed board'); bad += 1
    if not ranges.base_matches_installed(ns, original, installed, base_ground['G'].shape): print('✗ base preparation differs from the installed board outside its range footprints'); bad += 1
    if ranges.same_layout(original, installed): installed_ground = base_ground['G']
    elif ranges.same_layout(pj, installed): installed_ground = G
    else:
        installed_work = ns['BASE_WORK'] if selected is not original else ns['INSTALLED_WORK']
        with open(f'{installed_work}/place.json') as f: installed_prep = json.load(f)
        if not ranges.same_layout(installed_prep, installed): print('✗ installed preparation differs from the installed board'); bad += 1
        with np.load(f'{installed_work}/ground.npz') as data: installed_ground = data['G'].copy()
    if not ranges.matches_board_height(ns, installed_ground, installed, installed_dir): print('✗ installed preparation heights differ from the installed board'); bad += 1
    if not staged and not ranges.same_layout(pj, installed): print('✗ checked preparation differs from the installed board'); bad += 1
    blocked = ranges.feature_mask(reference_ns, G.shape, base_ground, original)
    protected = ranges.terrain_protected_mask(reference_ns, G.shape, base_ground, original, blocked)
    footprint = ranges.range_footprint_mask(ns, ridge, G.shape)
    reach = ranges.range_reach_mask(ns, ridge, G.shape) | (np.abs(G-base_ground['G']) > 1e-6)
    orphan = (G > base_ground['G'] + ranges.RANGE_RISE_EPS) & ~ranges.range_fill_reach(ns, ridge, G.shape)
    if orphan.any():
        j, k = np.argwhere(orphan)[0]
        print(f'✗ {int(orphan.sum())} raised cells beyond surviving ranges, first at {X0+k*DX:.3f},{Z0+j*DZ:.3f}'); bad += 1
    origin = (X0, Z0)
    terrain = ranges.range_terrain_stats(base_ground['G'], G, reach, DX, DZ, footprint, protected, origin)
    original_slope = ranges.range_terrain_stats(base_ground['G'], base_ground['G'], reach, DX, DZ, footprint, protected, origin)['max_slope']
    def steep_locations(label, stats):
        if not stats['regions']: return
        print(f'{label} exposed steep regions (worst x,z, slope and excess; {ranges.RANGE_REPORT_BIN:g}-unit bins):')
        for p in stats['regions'] if terrain_details else stats['regions'][:12]:
            print(f"  {p['x']:.3f},{p['z']:.3f}: {p['slope']:.2f}° (+{p['excess']:.2f}°), {p['faces']} triangles")
        if not terrain_details and len(stats['regions']) > 12:
            print(f"  ... {len(stats['regions'])-12} more regions; use --terrain-details to list all")
    # finish() samples every other preparation vertex for the game. Check that baseline against the actual
    # installed height.bin, then check the coarser game triangles as well as the preview's fine triangles.
    sx, sz = (round(installed['step'][0]/DX), round(installed['step'][1]/DZ)); game_terrain = None
    w, h = installed['grid']; baseline = base_ground['G'][::max(1, sz), ::max(1, sx)]
    packed = np.fromfile(f'{installed_dir}/height.bin', dtype='<u2')
    if sx < 1 or sz < 1 or abs(installed['step'][0]-DX*sx) > 1e-6 or abs(installed['step'][1]-DZ*sz) > 1e-6 or baseline.shape != (h, w) or len(packed) != w*h*2:
        print('✗ installed height grid does not match the base preparation'); bad += 1
    else:
        game_terrain = ranges.range_terrain_stats(baseline, G[::sz, ::sx], reach[::sz, ::sx], DX*sx, DZ*sz, footprint[::sz, ::sx], protected[::sz, ::sx], origin)
        game_original_slope = ranges.range_terrain_stats(baseline, baseline, reach[::sz, ::sx], DX*sx, DZ*sz, footprint[::sz, ::sx], protected[::sz, ::sx], origin)['max_slope']
        print(f"game range terrain: steepest slope {game_terrain['max_slope']:.2f}° (installed {game_original_slope:.2f}°); "
              f"new/worsened steep triangles {game_terrain['violations']}, maximum excess {game_terrain['max_excess']:.2f}°")
        if terrain_details: steep_locations('game', game_terrain)
    print(f"range terrain: largest exposed lowering {terrain['lowering']:.4f} at {terrain['lowering_at']}, raising {terrain['raising']:.4f} at {terrain['raising_at']}; steepest slope {terrain['max_slope']:.2f}° (installed {original_slope:.2f}°); "
          f"new/worsened steep triangles {terrain['violations']}, maximum excess {terrain['max_excess']:.2f}°")
    if terrain_details: steep_locations('preview', terrain)
    def check_hollows(label, before, after, feet, fixed, dx, dz):
        global bad
        hollows = ranges.range_hollows(before, after, feet, fixed, dx, dz, origin)
        print(f'{label} exposed hollows: {len(hollows)}')
        for h in hollows:
            print(f"✗ {label} hollow at {h['x']:.3f},{h['z']:.3f}: lowered {h['lowering']:.3f}, ring depth {h['depth']:.3f}")
        if hollows: bad += 1
    check_hollows('preview', base_ground['G'], G, footprint, protected, DX, DZ)
    if game_terrain is not None:
        check_hollows('game', baseline, G[::sz, ::sx], footprint[::sz, ::sx], protected[::sz, ::sx], DX*sx, DZ*sz)
        review_identity = ranges.terrain_review_identity(G, ridge, footprint, protected, DX, DZ, origin, (sx, sz))
        review_figures = ranges.terrain_review_values(terrain, game_terrain)
        if record_note is None:
            try:
                with open(review_path) as f: reviewed = json.load(f)
                errors = ranges.terrain_review_errors(reviewed, review_identity, review_figures)
                for error in errors: print(f'✗ {error}'); bad += 1
                if errors: print('current terrain figures:', json.dumps(review_figures, ensure_ascii=False))
                else: print(f"terrain matches review dated {reviewed['date']}: {reviewed['note']}")
            except (OSError, ValueError, json.JSONDecodeError) as e:
                print(f'✗ cannot check reviewed terrain: {e}'); print('current terrain figures:', json.dumps(review_figures, ensure_ascii=False)); bad += 1
    road_points = np.concatenate([np.asarray(rd['v'], dtype=np.float32).reshape(-1, 2, 3).mean(1)[:, [0, 2]] for rd in original['roads']])
    for p in ridge:
        r = ranges.region(p, SIZE, X0, Z0, DX, DZ, G.shape, ranges.RANGE_MARGIN)
        if r is None or np.any(blocked[r[0]] & ranges.in_outline(p['k'], r[1], r[2])):
            print(f"✗ {p['k']} footprint crosses a road, water, city pad or hamlet at {p['x']:.2f},{p['z']:.2f}"); bad += 1
        u, v = ranges.local(p, SIZE, road_points[:, 0], road_points[:, 1])
        if np.any(ranges.in_outline(p['k'], u, v)):
            print(f"✗ {p['k']} covers an installed road point at {p['x']:.2f},{p['z']:.2f}"); bad += 1
        if ranges.hides_city(p, pj['cities'], SIZE, TIER): print(f"✗ {p['k']} hides a city at low tilt"); bad += 1
        inside_keep = keep is None or keep[0] <= p['x'] <= keep[1] and keep[2] <= p['z'] <= keep[3]
        gap = ranges.foot_gap(p, SIZE, G, X0, Z0, DX, DZ)
        if inside_keep and gap > -ranges.RANGE_FOOT_EMBED + .0001:
            print(f"✗ {p['k']} floats {gap:.3f} above its rise at {p['x']:.2f},{p['z']:.2f}"); bad += 1
        j, k = round((p['z']-Z0)/DZ), round((p['x']-X0)/DX)
        height = SIZE[p['k']]*p['s']*ranges.RANGE_ASPECT[p['k']][1]*ranges.RANGE_VERTICAL[p['k']]
        if inside_keep and p['y']+height-G[j,k] < height*ranges.RANGE_MIN_VISIBLE:
            print(f"✗ {p['k']} crest is buried at {p['x']:.2f},{p['z']:.2f}"); bad += 1
    for i, p in enumerate(ridge):
        for q in ridge[:i]:
            if keep is not None and not (keep[0] <= p['x'] <= keep[1] and keep[2] <= p['z'] <= keep[3]) and not (keep[0] <= q['x'] <= keep[1] and keep[2] <= q['z'] <= keep[3]): continue
            relation = ranges.pair_relation(p, q, SIZE)
            if relation in ('crossing', 'parallel', 'too close', 'buried'):
                print(f"✗ {relation} ranges at {p['x']:.2f},{p['z']:.2f} and {q['x']:.2f},{q['z']:.2f}"); bad += 1
    references = ranges.massif_reference(ns); report = range_report.get('old_massifs', [])
    coverage_pieces = ridge + [p for p in pj['place'] if p['k'] == 'massif']  # a partial --keep may retain legacy geometry
    errors = ranges.massif_coverage_errors(ns, G, references, coverage_pieces, report, pj['cities'], keep)
    for error in errors: print(f'✗ {error}'); bad += 1
    for item in report if isinstance(report, list) else []:
        if isinstance(item, dict) and not item.get('covered'):
            print(f"uncovered 9eb6ba56 massif: {item}")
    covered = sum(any(math.hypot(p['x']-r['x'], p['z']-r['z']) <= ranges.RANGE_REFERENCE_DISTANCE + 1e-8 for p in coverage_pieces) for r in references)
    if range_report.get('old_massifs_covered') != covered: print('✗ massif coverage total differs from geometry'); bad += 1
    print(f'{covered}/{len(references)} reference massif centres covered')
    if range_report.get('pieces') != len(ridge): print('✗ range piece total differs from geometry'); bad += 1
    if np.any(G[protected] != base_ground['G'][protected]): print('✗ sculpting changed a protected road, bank or water cell'); bad += 1
    for k in ('bridge', 'hamlet', 'boat'):
        before = [p for p in original['place'] if p['k'] == k]
        after = [p for p in pj['place'] if p['k'] == k]
        if before != after: print(f'✗ installed {k} placements changed'); bad += 1
    for k in ('tree-broad', 'tree-pine', 'grove', 'hill'):
        before = [p for p in original['place'] if p['k'] == k]
        after = [p for p in pj['place'] if p['k'] == k]
        inside = lambda p: keep is None or keep[0] <= p['x'] <= keep[1] and keep[2] <= p['z'] <= keep[3]
        previous = [p for p in prior if p['k'] == k]
        support = ranges.support_mask(ns, ridge, G.shape)
        retained = [p for p in before if (p in previous if not inside(p) else not ranges.clears_tree(ns, p, ridge, support))]
        if retained != after: print(f'✗ {k} outside a range moved or disappeared'); bad += 1
    print(f'{len(ridge)} range footprints, low-tilt sight lines and preserved placements checked')
# No ground rises across the camera's line of sight just south of a city.
XX, ZZ = np.meshgrid(X0 + np.arange(G.shape[1]) * DX, Z0 + np.arange(G.shape[0]) * DZ)
for c in pj['cities']:
    hh = SIZE[TIER[c['tier']]] * 0.5 * c['ms']; dz = ZZ - c['mz']
    m = (np.abs(XX - c['mx']) < hh + 0.35) & (dz > hh) & (dz < hh + 1.5)
    over = float((G - (c['y'] + 0.05 + (dz - hh) * ns['SIGHT']))[m].max())
    if over > 0.1: print(f"✗ {c['name']} is hidden by ground {over:.2f} above the line of sight"); bad += 1
print('sight lines checked')
# The exact wet spans which created the road bridges must still have a model at their crossing. The same road
# centres later become board.json p, the live network, the bead trail, the war march and the flat projection.
def samp(a, x, z):
    fx = np.clip((x - X0) / DX, 0, a.shape[1] - 1.001); fz = np.clip((z - Z0) / DZ, 0, a.shape[0] - 1.001)
    k, j = fx.astype(int), fz.astype(int); tx, tz = fx - k, fz - j
    return a[j, k] * (1 - tx) * (1 - tz) + a[j, k + 1] * tx * (1 - tz) + a[j + 1, k] * (1 - tx) * tz + a[j + 1, k + 1] * tx * tz
bridges = np.array([(p['x'], p['z']) for p in pj['place'] if p['k'] == 'bridge'], dtype=np.float32).reshape(-1, 2)
crossings = 0
for r in pj['roads']:
    mid = np.array(r['v'], dtype=np.float32).reshape(-1, 2, 3).mean(1); wet = samp(Lv, mid[:, 0], mid[:, 2]) >= 2.5
    q = 0
    while q < len(mid):
        if not wet[q]: q += 1; continue
        e = q
        while e + 1 < len(mid) and wet[e + 1]: e += 1
        at = ((mid[max(q - 1, 0)] + mid[min(e + 1, len(mid) - 1)]) / 2)[[0, 2]]
        if not len(bridges) or float(np.linalg.norm(bridges - at, axis=1).min()) > .001:
            print(f'✗ road crossing without its bridge at {at}'); bad += 1
        crossings += 1; q = e + 1
print(f'{crossings} road crossings checked')
if staged or range_layout:
    dest = ns['DEST'] if staged else installed_dir
    meta = (staged_meta if staged_meta is not None else json.load(open(f'{dest}/board.json'))) if staged else installed
    if len(meta['roads']) != len(pj['roads']): print('✗ staged road count differs'); bad += 1
    if range_layout:
        if meta['cities'] != installed['cities'] or meta['roads'] != installed['roads'] or meta['water'] != installed['water']:
            print('✗ installed cities, road courses or water changed'); bad += 1
        for k in ('bridge', 'hamlet', 'boat'):
            if meta['pieces'].get(k, []) != installed['pieces'].get(k, []): print(f'✗ staged {k} differs from installed'); bad += 1
        if meta['pieces'].get('massif') and range_report.get('keep') is None:
            print('✗ old massifs remain on the staged board'); bad += 1
        for kind in ranges.RANGE_ASPECT:
            prepared = np.array([[p['x'], p['y'], p['z'], p['ry'], p['s'], p.get('sx', 1)] for p in ridge if p['k'] == kind]).ravel()
            baked = np.array(meta['pieces'].get(kind, []))
            if prepared.shape != baked.shape or not np.allclose(prepared, baked, rtol=0, atol=.000051):
                print(f'✗ staged {kind} differs from the checked placement'); bad += 1
        try: ranges.check_models(dest, pj['place'], ns['GAME'], ns['GAME_FAR'])
        except (OSError, ValueError, KeyError) as e: print(f'✗ {e}'); bad += 1
    for i, (rd, baked) in enumerate(zip(pj['roads'], meta['roads'])):
        centre = np.array(rd['v'], dtype=np.float32).reshape(-1, 2, 3).mean(1)
        points = np.array(baked['p'], dtype=np.float32).reshape(-1, 3)
        if centre.shape != points.shape or not np.allclose(centre, points, rtol=0, atol=.00011):
            print(f'✗ staged road {i} differs from its painted centre'); bad += 1
    w, h = meta['grid']; data = np.fromfile(f'{dest}/height.bin', dtype='<u2')
    if len(data) != w * h * 2: raise ValueError('staged height.bin has the wrong size')
    ground = meta['h'][0] + data[:w*h].reshape(h, w) * ((meta['h'][1] - meta['h'][0]) / 65535)
    if range_layout:
        sx, sz = round(meta['step'][0]/DX), round(meta['step'][1]/DZ)
        checked = G[::max(1,sz), ::max(1,sx)]
        if (sx < 1 or sz < 1 or abs(meta['step'][0]-DX*sx) > 1e-6 or abs(meta['step'][1]-DZ*sz) > 1e-6 or
            checked.shape != ground.shape or np.max(np.abs(checked-ground)) > (meta['h'][1]-meta['h'][0])/65535 + 1e-6):
            print('✗ staged heights differ from the checked preparation'); bad += 1
    below = ground < meta['sea']; seen = np.zeros_like(below); pockets = []
    for j, k in zip(*np.nonzero(below)):
        if seen[j, k]: continue
        todo = [(int(j), int(k))]; seen[j, k] = True; count = 0
        while todo:
            y, x = todo.pop(); count += 1
            for yy in range(max(0, y - 1), min(h, y + 2)):
                for xx in range(max(0, x - 1), min(w, x + 2)):
                    if below[yy, xx] and not seen[yy, xx]: seen[yy, xx] = True; todo.append((yy, xx))
        pockets.append(count)
    if len(pockets) != 1: print(f'✗ sea-plane pockets: {pockets}'); bad += 1
    rivers = [w_ for w_ in meta['water'] if w_['kind'] == 'river']
    for r in rivers:
        v = np.array(r['v']).reshape(-1, 2, 3)
        if len(r['f']) != len(v): print('✗ river alpha count'); bad += 1
    south = max((np.array(r['v']).reshape(-1, 2, 3)[-1].mean(0) for r in rivers), key=lambda p: p[2])
    k, j = round((south[0] - meta['box'][0]) / meta['step'][0]), round((south[2] - meta['box'][2]) / meta['step'][1])
    if not (0 <= k < w and 0 <= j < h and ground[j, k] < meta['sea']): print('✗ southernmost river does not reach the sea'); bad += 1
    print('staged road centres, sea plane and river mouth checked')
if record_note is not None:
    if review_identity is None or review_figures is None:
        print('✗ no valid range preparation to record'); bad += 1
    if bad:
        print('review record not written because other checks failed')
    else:
        review = {'version': 1, 'date': datetime.date.today().isoformat(), 'note': record_note.strip(),
                  'pictures': pictures, 'identity': review_identity, 'figures': review_figures}
        with tempfile.NamedTemporaryFile('w', encoding='utf-8', dir=TOOLS, delete=False) as f:
            temporary = f.name; json.dump(review, f, ensure_ascii=False, indent=2, allow_nan=False); f.write('\n')
        os.replace(temporary, review_path)
        print('wrote reviewed terrain:', review_path)
sys.exit(1 if bad else 0)
