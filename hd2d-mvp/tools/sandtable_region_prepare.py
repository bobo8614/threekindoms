#!/usr/bin/env python3
# The from-scratch preparation of a sand-table board (numpy + Pillow, no Blender): the game's procedural board re-cut
# at 3×, its mountains sculpted, water carved in, cities seated, set pieces placed (hamlets, massifs, hills, boats,
# woods) and the ground's colour painted. It is blender_sandtable.py's prepare() at 9eb6ba56, the step that made the
# original board's accepted preparation (source/rebake-work, whose prepared.json carries that script's hash), kept
# here for an overseas region (docs/战略地图数据包扩展设计_2026-11-17.md §5.5): the box and grid come from the
# region's board export (tools/export_region_board.mjs), not the original's constants. The original is never
# re-prepared: blender_sandtable.py and sandtable_ranges.py are untouched, and China's preparation stays as it is.
#   python3 -I hd2d-mvp/tools/sandtable_region_prepare.py <board_dir> <work_dir>
# A region's board has no cities and no roads; its counts (massifs, hills, boats, trees) are the original's per land
# cell, so the side-by-side looks as dense. Given the original's own board (no 'box' in board.json), it runs exactly
# as at 9eb6ba56 with no baseline, which is how this copy is checked against the original script.
# work_dir must be new or a previous output of this script, and never one of the shared preparations.
import hashlib, json, math, os, subprocess, sys

TOOLS = os.path.dirname(os.path.abspath(__file__))
MVP = os.path.dirname(TOOLS)
# The set pieces and tiles live, ignored, in the main checkout only (a worktree has none): read them from there, read-only.
MAIN = os.path.dirname(os.path.abspath(subprocess.run(['git', 'rev-parse', '--git-common-dir'], cwd=TOOLS, check=True, capture_output=True, text=True).stdout.strip()))
SRC = f'{MAIN}/hd2d-mvp/assets/ai/sandtable/source'
MODELS, TILES = f'{SRC}/models', f'{SRC}/tiles'
if len(sys.argv) != 3: sys.exit('usage: sandtable_region_prepare.py <board_dir> <work_dir>')
BOARD, WORK = (os.path.realpath(a) for a in sys.argv[1:3])
SHARED = [os.path.realpath(p) for p in (f'{SRC}/board', f'{SRC}/work', f'{SRC}/rebake-work', f'{SRC}/ranges-installed-work', f'{SRC}/models',
                                        f'{SRC}/tiles', f'{MAIN}/hd2d-mvp/assets/ai/sandtable/board', f'{MVP}/assets/ai/sandtable/board')]
if any(WORK == s or WORK.startswith(s + os.sep) or s.startswith(WORK + os.sep) for s in SHARED) or WORK == BOARD:
    sys.exit(f'refusing to write into {WORK}: a shared preparation, board or set-piece directory')
if os.path.isdir(WORK) and os.listdir(WORK) and not os.path.isfile(f'{WORK}/region-prepared.json'):
    sys.exit(f'refusing to write into {WORK}: not empty and not an earlier output of this script')
DEST = None  # no baseline: every piece is placed afresh (9eb6ba56 kept the shipped board's massifs and hills)
SOURCE = json.load(open(f'{BOARD}/board.json'))
REGION = 'box' in SOURCE
if REGION:
    LON0, LON1, LAT0, LAT1 = SOURCE['box']
    X0, X1, Z0, Z1 = (LON0 - 111.5) * 0.9, (LON1 - 111.5) * 0.9, -(LAT1 - 31.5), -(LAT0 - 31.5)
    NX, NZ = round((LON1 - LON0) / 0.1) + 1, round((LAT1 - LAT0) / 0.1) + 1
else:
    X0, X1, Z0, Z1 = (97.5 - 111.5) * 0.9, (125 - 111.5) * 0.9, -(43 - 31.5), -(20 - 31.5)
    NX, NZ = 276, 231
SEA_Y = 0.14
_v = SOURCE['ground']['v']
if len(_v) != NX * NZ * 3 or abs(_v[0] - X0) > 1e-3 or abs(_v[2] - Z0) > 1e-3 or abs(_v[-3] - X1) > 1e-3 or abs(_v[-1] - Z1) > 1e-3:
    sys.exit(f'{BOARD}/board.json: the ground is not a {NX}×{NZ} grid from ({X0:.3f}, {Z0:.3f}) to ({X1:.3f}, {Z1:.3f}), north row first')
# The original's caps (trees, massifs, hills, levelled peaks, boats) were set for its 51092 land cells; a region keeps their density.
CHINA_LAND_CELLS = 51092
SHARE = sum(_v[i] > SEA_Y for i in range(1, len(_v), 3)) / CHINA_LAND_CELLS if REGION else 1
cap = lambda n: max(1, math.ceil(n * SHARE)) if REGION else n
# Footprint of each piece in world units (its larger side; a crag is sized by height instead, see place_crags).
SIZE = {'city-capital': 1.15, 'city-major': 0.9, 'city-county': 0.68, 'pass': 0.85, 'hamlet': 0.26, 'tree-broad': 0.15,
        'tree-pine': 0.14, 'grove': 0.36, 'crag': 1.3, 'crag-low': 1.2, 'ridge': 2.6, 'boat': 0.22, 'bridge': 0.2,
        'massif': 1.7, 'hill': 0.7}
# How far each kind of set piece reaches from its centre: it keeps that far off a city's walls (check_sandtable.py too).
REACH = {'massif': 0.6, 'hill': 0.3, 'hamlet': 0.13, 'grove': 0.07, 'tree-broad': 0.07, 'tree-pine': 0.07}
TILE_SPAN = {'meadow': 1.5, 'fields': 1.6, 'forest': 1.2, 'loess': 1.6, 'rock': 0.6}  # world units one tile covers
TIER = {'capital': 'city-capital', 'major': 'city-major', 'county': 'city-county', 'pass': 'pass'}
MASSIF_LIMIT, HILL_PLACE_LIMIT, PEAK_LIMIT, BOAT_LIMIT = cap(200), cap(140), cap(40), cap(30)

arg = lambda k, d: None  # no --keep: a region is always prepared whole


# ------------------------------------------------------------------ python3 side: the sculpted board, placement, colour
F = 3                                   # the board is re-cut at 3× the game's heightfield
FX, FZ = (NX - 1) * F + 1, (NZ - 1) * F + 1
DX, DZ = 0.09 / F, 0.1 / F
WW = 0.52                               # water width kept of the game's river ribbons
ROAD_W, ROAD_PAINT_NARROW = 0.8, 0.9   # packed earth, on the same centre line as the game
ROAD_PAINT_COLOR = (0.58, 0.46, 0.29, 1)
ROAD_BEND, ROAD_BEND_LENGTH = 0.5, (1.0, 4.0)  # long courses get wider S-bends, in world units
ROAD_BEND_WAVE, ROAD_BEND_RELIEF, ROAD_BEND_FOREST = 0.85, 0.6, 0.35
ROAD_RELIEF_RESPONSE, ROAD_SMOOTH_SAMPLES = 2, 15
ROAD_CITY_GATE, ROAD_WATER_GATE, ROAD_KEEP_FEATHER = (0.0, 0.35), (0.05, 0.5), 0.5
ROAD_WATER_GUARD_PX, ROAD_WATER_SOFT_PX = 27, 4  # the buffered river remains wider than the maximum excursion
ROAD_MASSIF_MARGIN, ROAD_MASSIF_SOFT_PX = 0.15, 4
ROAD_MASK_PAD, ROAD_MASK_SS, ROAD_MASK_MIN_ALPHA = 0.035, 4, 128  # nonzero alpha keeps the RGB vegetation data through browser decoding
PAD_MARGIN = {'capital': 0.19, 'major': 0.14, 'county': 0.10, 'pass': 0.10}
PAD_EDGE, PAD_NOISE, PAD_COLOR, PAD_TEXTURE, PAD_MASK_POWER = 0.24, 0.18, (0.49, 0.43, 0.34, 1), 0.48, 4
PAD_SIZE_FACTOR, PAD_RIM_DARK, PAD_RIM_RANGE = 0.9, 0.78, (0.15, 0.9)
PAD_NOISE_FIELD = (0.38, 3, 137)
FIELD_INNER, FIELD_OUTER = 0.35, 0.72  # beyond the wall, neighbouring cities leave open meadow between their fields
WOOD_PLACEMENT_FIELD_OUTER = 1.0  # retain the accepted stand positions when the visible fields contract
FIELD_STRENGTH, FIELD_PATCH_FLOOR, FIELD_PATCH_RANGE = 0.85, 0.55, (0.38, 0.58)
FIELD_NOISE_FIELD, FIELD_SLOPE_RANGE, FIELD_FOREST_RANGE = (0.7, 3, 157), (0.45, 1.0), (0.35, 0.75)
FIELD_OLD_BLUR, FIELD_ERASE_RANGE, FIELD_KEEP_RANGE = 18, (0.1, 0.5), (0.05, 0.25)  # soften source plots that the new field mask removes
MEADOW_GAP_PX, MEADOW_GAP_BLUR, MEADOW_GAP_STRENGTH, MEADOW_GAP_RANGE = 15, 4, 0.9, (.05, .35)  # mend small clearings in existing vegetation, not the desert
MEADOW_TONE_SCALE, MEADOW_TONE_DETAIL, MEADOW_TONE_RANGE, MEADOW_TONE_VALUE = 0.35, 2, (0.25, 0.75), (0.88, 1.08)  # broad variations in the existing meadow tile
WOOD_CLEARING = (0.30, 0.44)           # irregular clearings in existing forest, with meadow under them
WOOD_NOISE_FIELD, WOOD_CLUMP_FIELD = (1.5, 4, 103), (1.4, 3, 77)
WOOD_OPEN_NORTH, WOOD_OPEN_CENTRAL, WOOD_OPEN_SOUTH = (0.64, 0.70), (0.36, 0.44), (0.53, 0.60)
WOOD_NORTH_TO_CENTRAL, WOOD_CENTRAL_TO_SOUTH = (-9, -3), (1, 7)
WOOD_NEW_STAND_STRENGTH, WOOD_FIELD_PRIORITY = 0.95, (0.2, 0.7)
WOOD_FOREST_THRESHOLD, WOOD_ROAD_CLEAR = 0.45, 0.4
WOOD_GROVE_STEP_XZ = (0.25, 0.22)      # a little denser inside the stands that remain
WOOD_CLUSTER_COUNT, WOOD_CLUSTER_RADIUS, WOOD_TREE_SCALE = 3, 0.075, (0.82, 1.12)
WOOD_TREE_SEPARATION = 0.09             # spread crowns within a clump instead of spending triangles on overlaps
WOOD_STAND_RADIUS = 0.49                # just below the game's 0.5 LOD cutoff, including rounded export coordinates
WOOD_INSTANCE_LIMIT, WOOD_RANDOM_LIMIT = cap(10200), cap(3500)  # preserve the far triangle budget
WOOD_CENTRAL_BOX, WOOD_CENTRAL_EXTRA = (-3, 7, -5, 3), 0 if REGION else 2400  # fill the original's heartland stands (a region has none)
WOOD_FLOOR_RADIUS, WOOD_FLOOR_STRENGTH, WOOD_FLOOR_SS = 0.72, 0.8, 2  # no forest paint beyond the crowns
WOOD_PINE_LAT, WOOD_PINE_HEIGHT = (27.5, 35.5), (0.5, 1.0)
WOOD_PINE_BASE, WOOD_PINE_NORTH, WOOD_PINE_UPLAND, WOOD_PINE_MAX = 0.035, 0.44, 0.5, 0.48
HILL_LIMIT, HILL_RISE, HILL_RISE_WINDOW = cap(35), 0.05, 9  # only real rises alongside a range survive
HILL_MASSIF_DISTANCE, HILL_SCALE, HILL_SINK = (0.8, 1.8), 0.7, 0.04
WESTERN_RANGE_X = -8.0                # retain the shipped hills alongside the western massif range as well
SKY_FLOOR = 72                          # least sky light kept on the ground (8-bit, of the bake's stored √(L/2))
SIGHT = 0.7                             # ground south of a city stays under this slope (tan of the camera's low tilt)


def smooth(a, lo, hi):
    import numpy as np
    t = np.clip((a - lo) / (hi - lo), 0, 1)
    return t * t * (3 - 2 * t)


def trim_hills(pieces, ground_at, rise_at, inbox):
    """Keep only small, partly buried hills on real rises alongside massifs."""
    massifs = [p for p in pieces if p['k'] == 'massif']
    outside = sum(p['k'] == 'hill' and not inbox(p['x'], p['z']) for p in pieces)
    candidates = []
    for p in pieces:
        if p['k'] != 'hill' or not inbox(p['x'], p['z']): continue
        x, z = p['x'], p['z']; rise = rise_at(x, z)
        distance = min((math.hypot(x - m['x'], z - m['z']) for m in massifs), default=math.inf)
        if rise >= HILL_RISE and HILL_MASSIF_DISTANCE[0] <= distance <= HILL_MASSIF_DISTANCE[1]:
            candidates.append((rise, distance, p))
    candidates.sort(key=lambda a: (-a[0], a[1], a[2]['x'], a[2]['z']))
    chosen = {id(p) for _, _, p in candidates[:max(0, HILL_LIMIT - outside)]}
    result = []
    for p in pieces:
        if p['k'] != 'hill' or not inbox(p['x'], p['z']): result.append(p); continue
        if id(p) not in chosen: continue
        q = dict(p); ground = ground_at(p['x'], p['z'])
        q['s'] *= HILL_SCALE; q['y'] = ground - max(0, ground - p['y']) * HILL_SCALE - HILL_SINK
        result.append(q)
    return result


def tree_kind(x, z, height):
    """A stable per-site choice leaves a minority of pines, more often north and on high ground."""
    def ease(v, limits):
        t = min(1, max(0, (v - limits[0]) / (limits[1] - limits[0])))
        return t * t * (3 - 2 * t)
    chance = min(WOOD_PINE_MAX, WOOD_PINE_BASE + WOOD_PINE_NORTH * ease(31.5 - z, WOOD_PINE_LAT) + WOOD_PINE_UPLAND * ease(height, WOOD_PINE_HEIGHT))
    value = math.sin(x * 12.9898 + z * 78.233) * 43758.5453
    return 'tree-pine' if value - math.floor(value) < chance else 'tree-broad'


def soften_old_fields(image, meadow, new_fields):
    """Keep broad geographic colour but blur the old map's plot marks on meadow."""
    import numpy as np
    from PIL import Image, ImageFilter
    def resize(a):
        return np.asarray(Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8), 'L').resize(image.size, Image.Resampling.BILINEAR), dtype=np.float32) / 255
    erase = smooth(resize(meadow), *FIELD_ERASE_RANGE) * (1 - smooth(resize(new_fields), *FIELD_KEEP_RANGE))
    original = np.asarray(image, dtype=np.float32); blurred = np.asarray(image.filter(ImageFilter.GaussianBlur(FIELD_OLD_BLUR)), dtype=np.float32)
    return Image.fromarray(np.clip(original + (blurred - original) * erase[..., None], 0, 255).astype(np.uint8))


def city_land_paint(mask, cities, xx, zz, dry, woods, noise, arable=None, patches=None, nearby_meadow=None, stands=None, field_outer=FIELD_OUTER):
    """Return the seasonal mask and the dry, textured-stone pad's opacity."""
    import numpy as np
    field, pad = np.zeros_like(xx), np.zeros_like(xx)
    arable = np.ones_like(xx) if arable is None else arable
    patches = np.ones_like(xx) if patches is None else patches
    nearby_meadow = np.zeros_like(xx) if nearby_meadow is None else nearby_meadow
    stands = np.zeros_like(xx) if stands is None else stands
    for c in cities:
        half = SIZE[TIER[c['tier']]] * 0.5 * c['ms']
        d = np.hypot(xx - c['mx'], zz - c['mz'])
        field = np.maximum(field, 1 - smooth(d, half + FIELD_INNER, half + field_outer))
        rounded = np.hypot(xx - c['mx'], zz - c['mz']) + noise * PAD_NOISE
        edge = (half * math.sqrt(2) + PAD_MARGIN[c['tier']]) * PAD_SIZE_FACTOR
        pad = np.maximum(pad, 1 - smooth(rounded, edge - PAD_EDGE, edge))
    pad *= dry
    result = mask.copy()
    old_field, old_wood = result[..., 2].copy(), result[..., 1].copy()
    result[..., 1] = np.maximum(result[..., 1] * woods, stands * mask[..., 0] * WOOD_NEW_STAND_STRENGTH * (1 - smooth(field, *WOOD_FIELD_PRIORITY)))
    patch = FIELD_PATCH_FLOOR + (1 - FIELD_PATCH_FLOOR) * smooth(patches, *FIELD_PATCH_RANGE)
    farm = field * FIELD_STRENGTH * patch * arable * (1 - smooth(result[..., 1], *FIELD_FOREST_RANGE))
    result[..., 2] = np.maximum(old_field * field, farm) * dry
    result[..., 0] = np.maximum(result[..., 0], np.maximum(old_field - result[..., 2], old_wood - result[..., 1]))
    gap = 1 - smooth(np.max(mask[..., :3], axis=2), *MEADOW_GAP_RANGE)
    result[..., 0] = np.maximum(result[..., 0], nearby_meadow * gap * arable * dry * MEADOW_GAP_STRENGTH)
    result[..., 0] *= 1 - farm; result[..., 1] *= 1 - farm  # the seasonal shader must see farmland, not a grass/field tie
    result[..., :3] *= (1 - pad[..., None] ** PAD_MASK_POWER)  # keep vegetation under the feather, so no loess apron appears
    return result, pad


def remove_isolated_trees(pieces):
    """A tree omitted by far LOD must not leave behind a baked forest-floor spot."""
    trees = [p for p in pieces if p['k'] in ('tree-broad', 'tree-pine')]; bins = {}
    cell = lambda p: (math.floor(p['x'] / WOOD_STAND_RADIUS), math.floor(p['z'] / WOOD_STAND_RADIUS))
    for p in trees: bins.setdefault(cell(p), []).append(p)
    def in_stand(p):
        x, z = cell(p)
        return any(q is not p and (p['x'] - q['x']) ** 2 + (p['z'] - q['z']) ** 2 <= WOOD_STAND_RADIUS ** 2
                   for i in range(x - 1, x + 2) for j in range(z - 1, z + 2) for q in bins.get((i, j), ()))
    return [p for p in pieces if p['k'] not in ('tree-broad', 'tree-pine') or in_stand(p)]


def paint_wood_floor(mask, pieces, box=(X0, X1, Z0, Z1)):
    """Only ground actually covered by a crown gets the forest tile and seasonal forest weight."""
    import numpy as np
    from PIL import Image, ImageDraw
    h, w = mask.shape[:2]; x0, x1, z0, z1 = box; ss = WOOD_FLOOR_SS
    im = Image.new('L', (w * ss, h * ss)); draw = ImageDraw.Draw(im)
    for p in pieces:
        if p['k'] not in ('tree-broad', 'tree-pine'): continue
        radius = SIZE[p['k']] * p['s'] * .5 * WOOD_FLOOR_RADIUS
        x, z = (p['x'] - x0) / (x1 - x0) * (w - 1) * ss, (p['z'] - z0) / (z1 - z0) * (h - 1) * ss
        rx, rz = radius / (x1 - x0) * (w - 1) * ss, radius / (z1 - z0) * (h - 1) * ss
        draw.ellipse((x - rx, z - rz, x + rx, z + rz), fill=255)
    floor = np.asarray(im.resize((w, h), Image.Resampling.LANCZOS), dtype=np.float32) / 255
    out = mask.copy(); old = out[..., 1].copy()
    out[..., 1] = floor * WOOD_FLOOR_STRENGTH
    out[..., 0] = np.maximum(out[..., 0], old * (1 - floor)) * (1 - floor)
    out[..., 2] *= 1 - floor
    return out


def road_mask_alpha(roads, width, height, box=(X0, X1, Z0, Z1)):
    """Opaque off-road, half-alpha on the baked ribbons; the shader maps that range to owner fill."""
    import numpy as np
    from PIL import Image, ImageDraw
    x0, x1, z0, z1 = box; ss = ROAD_MASK_SS
    im = Image.new('L', (width * ss, height * ss), 255); draw = ImageDraw.Draw(im)
    def pix(p): return ((p[0] - x0) / (x1 - x0) * (width - 1) * ss, (p[1] - z0) / (z1 - z0) * (height - 1) * ss)
    for road in roads:
        rv = np.array(road['v'], dtype=np.float32).reshape(-1, 2, 3)
        a, b = rv[:, 0, :][:, [0, 2]], rv[:, 1, :][:, [0, 2]]; mid = (a + b) * .5; side = a - mid
        length = np.linalg.norm(side, axis=1); side *= (ROAD_PAINT_NARROW + ROAD_MASK_PAD / np.maximum(length, 1e-8))[:, None]
        a, b = mid + side, mid - side
        for i in range(len(mid) - 1): draw.polygon((pix(a[i]), pix(b[i]), pix(b[i + 1]), pix(a[i + 1])), fill=ROAD_MASK_MIN_ALPHA)
        # Sharp ribbon turns can fold a quad over itself; a centre stroke closes the resulting pinhole in alpha.
        px_per_world = min((width - 1) / (x1 - x0), (height - 1) / (z1 - z0)) * ss
        line_width = max(1, round(2 * (float(length.mean()) * ROAD_PAINT_NARROW + ROAD_MASK_PAD) * px_per_world))
        draw.line([pix(p) for p in mid], fill=ROAD_MASK_MIN_ALPHA, width=line_width, joint='curve')
    return im.resize((width, height), Image.Resampling.LANCZOS)


def bend_road(rv, road_index, sample, height, slope, forest, water, cities, keep=None):
    """Move both sides together; protect water, city approaches and a --keep box's exterior."""
    import numpy as np
    mid = rv.mean(axis=1); x, z = mid[:, 0], mid[:, 2]
    tx, tz = np.gradient(x), np.gradient(z); length = np.hypot(tx, tz)
    nx, nz = -tz / np.maximum(length, 1e-8), tx / np.maximum(length, 1e-8)
    travel = np.r_[0, np.cumsum(np.hypot(np.diff(x), np.diff(z)))]; t = travel / max(float(travel[-1]), 1e-8)
    def cost(q):
        xx, zz = x + nx * q, z + nz * q
        return sample(height, xx, zz) + ROAD_BEND_RELIEF * sample(slope, xx, zz) + ROAD_BEND_FOREST * sample(forest, xx, zz)
    relief = np.tanh((cost(-ROAD_BEND) - cost(ROAD_BEND)) * ROAD_RELIEF_RESPONSE)
    wave = np.sin(2 * np.pi * t) * (1 if road_index % 2 == 0 else -1)
    offset = ROAD_BEND * smooth(travel[-1], *ROAD_BEND_LENGTH) * (ROAD_BEND_WAVE * wave + (1 - ROAD_BEND_WAVE) * relief * np.sin(np.pi * t))
    kernel = np.hanning(ROAD_SMOOTH_SAMPLES); kernel /= kernel.sum(); radius = ROAD_SMOOTH_SAMPLES // 2
    offset = np.convolve(np.pad(offset, radius, mode='edge'), kernel, mode='valid')
    gate = 1 - smooth(sample(water, x, z), *ROAD_WATER_GATE)
    for c in cities:
        d = np.hypot(x - c['x'], z - c['z']); half = SIZE[TIER[c['tier']]] * 0.5
        radius = half * math.sqrt(2) + PAD_MARGIN[c['tier']] + PAD_NOISE * .5
        gate *= smooth(d, radius + ROAD_CITY_GATE[0], radius + ROAD_CITY_GATE[1])
    if keep is not None:
        edge = np.minimum.reduce([x - keep[0], keep[1] - x, z - keep[2], keep[3] - z])
        gate *= smooth(edge, 0, ROAD_KEEP_FEATHER)
    offset *= gate
    offset *= 1 - smooth(sample(water, x + nx * offset, z + nz * offset), *ROAD_WATER_GATE)
    offset[0] = offset[-1] = 0
    rv[:, :, 0] += (nx * offset)[:, None]; rv[:, :, 2] += (nz * offset)[:, None]
    return rv


PREPARED_FILES = ('ground.npz', 'place.json', 'mask.png', 'road-alpha.png', 'pads.png', 'bank.png', 'sea.png', 'ground-paint.png',
                  *tuple(f'tile-{n}.png' for n in (*TILE_SPAN, 'frame')))


def prepare():
    import numpy as np
    from PIL import Image, ImageDraw, ImageFilter
    os.makedirs(WORK, exist_ok=True)
    if os.path.exists(f'{WORK}/region-prepared.json'): os.unlink(f'{WORK}/region-prepared.json')
    preparing_script = file_hash(__file__)
    b = SOURCE
    baseline = None
    for r_ in b['roads']:
        rv_ = np.array(r_['v'], dtype=np.float32).reshape(-1, 3); m_ = (rv_[0::2] + rv_[1::2]) / 2
        rv_[0::2], rv_[1::2] = m_ + (rv_[0::2] - m_) * ROAD_W, m_ + (rv_[1::2] - m_) * ROAD_W; r_['v'] = rv_.ravel().tolist()
    v = np.array(b['ground']['v'], dtype=np.float32).reshape(-1, 3)
    H = v[:, 1].reshape(NZ, NX)
    # The source mask leaves 1-pixel gaps between its plots, and loess shows through them as a brick grid: close the
    # farmland. Its dithered forest edge reads as a black checkerboard under the dark forest tile: even that out.
    os.makedirs(WORK, exist_ok=True); r_, g_, b_, a_ = Image.open(f'{BOARD}/mask.png').convert('RGBA').split()
    Image.merge('RGBA', (r_, g_.filter(ImageFilter.MedianFilter(5)), b_.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5)), a_)).save(f'{WORK}/mask.png')
    mask = np.asarray(Image.open(f'{WORK}/mask.png'), dtype=np.float32) / 255
    source_fields = mask[..., 2].copy()  # extra painted fields should not create a new wave of hamlets
    MH, MW = mask.shape[:2]
    rs = np.random.default_rng(7)
    KEEP = None
    sst = lambda a, lo, hi: (lambda t: t * t * (3 - 2 * t))(np.clip((a - lo) / (hi - lo), 0, 1))

    # -- grid helpers: the fine grid's pixel (k, j) is the world point (X0 + k·DX, Z0 + j·DZ)
    def lin(a, n, axis):
        x = np.linspace(0, a.shape[axis] - 1, n); i0 = np.clip(np.floor(x).astype(int), 0, a.shape[axis] - 2); t = (x - i0).astype(np.float32)
        sh = [1] * a.ndim; sh[axis] = -1; t = t.reshape(sh)
        return np.take(a, i0, axis) * (1 - t) + np.take(a, i0 + 1, axis) * t
    def box(a, r, axis):
        p = np.pad(a, [(r + 1, r) if ax == axis else (0, 0) for ax in range(a.ndim)], mode='edge'); c = np.cumsum(p, axis, dtype=np.float64)
        n = a.shape[axis]
        return ((np.take(c, np.arange(2 * r + 1, 2 * r + 1 + n), axis) - np.take(c, np.arange(n), axis)) / (2 * r + 1)).astype(np.float32)
    def blur(a, r):
        for _ in range(3): a = box(box(a, r, 0), r, 1)
        return a
    def samp(G, x, z):  # bilinear, world → value
        fx = np.clip((np.asarray(x) - X0) / DX, 0, FX - 1.001); fz = np.clip((np.asarray(z) - Z0) / DZ, 0, FZ - 1.001)
        k, j = fx.astype(int), fz.astype(int); tx, tz = fx - k, fz - j
        return G[j, k] * (1 - tx) * (1 - tz) + G[j, k + 1] * tx * (1 - tz) + G[j + 1, k] * (1 - tx) * tz + G[j + 1, k + 1] * tx * tz
    pix = lambda x, z: ((x - X0) / DX, (z - Z0) / DZ)
    def canvas(mode='F', val=0): return Image.new(mode, (FX, FZ), val)
    XX = (X0 + np.arange(FX, dtype=np.float32) * DX)[None, :].repeat(FZ, 0)
    ZZ = (Z0 + np.arange(FZ, dtype=np.float32) * DZ)[:, None].repeat(FX, 1)

    H0 = lin(lin(H, FZ, 0), FX, 1)
    H0 = blur(H0, 1)                      # the game's facets smoothed out
    def vnoise(c, seed, rot):
        g = np.random.default_rng(seed).random((int(40 / c) + 4, int(40 / c) + 4)).astype(np.float32)
        ca, sa = math.cos(rot), math.sin(rot)
        u = ((XX - X0) * ca - (ZZ - Z0) * sa) / c + g.shape[1] / 2 - 14 / c; w = ((XX - X0) * sa + (ZZ - Z0) * ca) / c + g.shape[0] / 2 - 14 / c
        i, j = np.floor(u).astype(int), np.floor(w).astype(int); tu, tw = u - i, w - j
        tu, tw = tu * tu * (3 - 2 * tu), tw * tw * (3 - 2 * tw)
        return (g[j, i] * (1 - tu) + g[j, i + 1] * tu) * (1 - tw) + (g[j + 1, i] * (1 - tu) + g[j + 1, i + 1] * tu) * tw
    def ridged(c0, octs, seed):
        tot, amp, wsum, prev = 0, 1.0, 0, 1
        for o in range(octs):
            r = (1 - np.abs(vnoise(c0 / 2 ** o, seed + o, 0.7 * o + 0.3) * 2 - 1)) ** 2 * prev
            prev = np.clip(r * 1.8, 0, 1); tot = tot + r * amp; wsum += amp; amp *= 0.55
        return tot / wsum
    def fbm(c0, octs, seed):
        tot, amp, wsum = 0, 1.0, 0
        for o in range(octs): tot = tot + vnoise(c0 / 2 ** o, seed + o, 1.1 * o) * amp; wsum += amp; amp *= 0.5
        return tot / wsum

    def pockets(m):  # m's cells in connected pockets, largest first (the first of the ground under the sea plane is the sea)
        seen, out = np.zeros(m.shape, bool), []
        for j0, k0 in zip(*np.nonzero(m)):
            if seen[j0, k0]: continue
            seen[j0, k0] = True; st, cells = [(int(j0), int(k0))], []
            while st:
                j_, k_ = st.pop(); cells.append((j_, k_))
                for q_ in range(max(0, j_ - 1), min(m.shape[0], j_ + 2)):
                    for p_ in range(max(0, k_ - 1), min(m.shape[1], k_ + 2)):
                        if m[q_, p_] and not seen[q_, p_]: seen[q_, p_] = True; st.append((q_, p_))
            out.append(np.array(cells))
        return sorted(out, key=len, reverse=True)

    # -- rivers bent round the cities: the sand table's walls are far larger than the game's marker, so a river
    # that passes within a wall's reach is pushed out to run along it (away from the seat, so every city keeps
    # its bank) and eased back into its course on either side.
    # The ROM polyline's corners are eased first (with no big wall to bend round they would show); a tributary's mouth
    # follows the river it joins.
    rib = [w for w in b['water'] if w['kind'] == 'river']
    mids0 = [(lambda r: (r[0::2] + r[1::2])[:, [0, 2]] / 2)(np.array(w['v'], dtype=np.float32).reshape(-1, 3)) for w in rib]
    ker2 = np.exp(-np.linspace(-2, 2, 25) ** 2); ker2 /= ker2.sum()
    for w in rib:
        rv0 = np.array(w['v'], dtype=np.float32).reshape(-1, 3); rv = rv0.copy()
        for s_ in (0, 1):
            for ax_ in (0, 2):
                sm_ = np.convolve(np.pad(rv0[s_::2, ax_], 12, mode='edge'), ker2, 'valid'); sm_[0], sm_[-1] = rv0[s_::2, ax_][0], rv0[s_::2, ax_][-1]
                rv[s_::2, ax_] = sm_
        w['v'] = rv.ravel().tolist()
    mids1 = [(lambda r: (r[0::2] + r[1::2])[:, [0, 2]] / 2)(np.array(w['v'], dtype=np.float32).reshape(-1, 3)) for w in rib]
    for i_, w in enumerate(rib):
        rv = np.array(w['v'], dtype=np.float32).reshape(-1, 3); n_ = len(rv) // 2
        for end, rng in ((0, range(n_)), (-1, range(n_ - 1, -1, -1))):
            hits = [(float(np.hypot(*(mids0[j_] - mids0[i_][end]).T).min()), j_) for j_ in range(len(rib)) if j_ != i_]
            if not hits: continue   # a region's only river joins no other
            d_, j_ = min(hits)
            if d_ > 0.15: continue
            k_ = int(np.hypot(*(mids0[j_] - mids0[i_][end]).T).argmin()); shift = mids1[j_][k_] - mids1[i_][end]
            for q_, idx_ in enumerate(rng):
                if q_ >= 24: break
                f_ = 0.5 + 0.5 * math.cos(q_ / 24 * math.pi)
                rv[idx_ * 2, [0, 2]] += shift * f_; rv[idx_ * 2 + 1, [0, 2]] += shift * f_
        w['v'] = rv.ravel().tolist()
    # A river that stops on neither the sea nor another river (交州's, on its beach) runs on through the beach into the
    # sea at its heading, widening a little; prepare's carving below then gives it a bed.
    def run_to_sea(w):
        rv = np.array(w['v'], dtype=np.float32).reshape(-1, 3); a_, c_ = rv[0::2], rv[1::2]; m_ = ((a_ + c_) / 2)[:, [0, 2]]
        e_, y0 = m_[-1], float((a_[-1, 1] + c_[-1, 1]) / 2); dr = (e_ - m_[-5]) / np.hypot(*(e_ - m_[-5]))
        sea_cells = pockets(H0 < SEA_Y)[0]; sx, sz = X0 + sea_cells[:, 1] * DX, Z0 + sea_cells[:, 0] * DZ
        d_ = np.hypot(sx - e_[0], sz - e_[1]); d_[(sx - e_[0]) * dr[0] + (sz - e_[1]) * dr[1] <= d_ * 0.6] = 1e9   # ahead of it, not behind
        n_ = int(d_.argmin()); far, shore = float(d_[n_]), np.array([sx[n_], sz[n_]])
        if far > 1: return   # a tributary whose mouth only stops short of the river it joins
        OUT = 0.16; end_ = shore + (shore - e_) / far * OUT; run = far + OUT; ctl = e_ + dr * run * 0.45
        half = (a_[-1] - c_[-1])[[0, 2]] / 2; hw = float(np.hypot(*half)); steps = math.ceil(run / float(np.hypot(*(m_[-1] - m_[-2]))))
        new = []
        for s_ in range(1, steps + 1):
            t_ = s_ / steps; q_ = 1 - t_; p_ = q_ * q_ * e_ + 2 * q_ * t_ * ctl + t_ * t_ * end_; tn = q_ * (ctl - e_) + t_ * (end_ - ctl); tn = tn / np.hypot(*tn)
            nr = np.array([tn[1], -tn[0]]); nr = nr * (np.sign(nr @ half) or 1) * hw * (1 + 0.6 * float(sst(t_, 0.2, 0.8)))
            y_ = y0 + (SEA_Y + 0.014 - y0) * min(1, t_ * run / far)
            new += [[p_[0] + nr[0], y_, p_[1] + nr[1]], [p_[0] - nr[0], y_, p_[1] - nr[1]]]
        w['v'] = w['v'] + np.array(new, dtype=np.float32).ravel().tolist()
        last = w['i'][-6:]   # one quad, repeated down the new pairs
        for s_ in range(1, steps + 1): w['i'] = w['i'] + [v_ + 2 * s_ for v_ in last]
        print(f'river run on {run:.2f} to the sea at ({end_[0]:.2f}, {end_[1]:.2f}), {steps} pairs')
    # A region's river that runs off its board (into the next board, or under the frame) stops at the edge, as it goes on there.
    def off_board(w):
        e_ = np.array(w['v'][-6:], dtype=np.float32).reshape(2, 3).mean(0)
        return REGION and min(e_[0] - X0, X1 - e_[0], e_[2] - Z0, Z1 - e_[2]) < 0.15
    for i_, w in enumerate(rib):
        if w['v'][-2] > SEA_Y + 0.02 and not off_board(w) and all(np.hypot(*(mids0[j_] - mids0[i_][-1]).T).min() > 0.15 for j_ in range(len(rib)) if j_ != i_): run_to_sea(w)
    for w in b['water']:
        if w['kind'] != 'river': continue
        rv = np.array(w['v'], dtype=np.float32).reshape(-1, 3); a_, c_ = rv[0::2], rv[1::2]
        for it in range(6):
            m = (a_ + c_) / 2; hw = np.hypot(*(a_ - c_)[:, [0, 2]].T) / 2 * WW * 1.25
            disp = np.zeros((len(m), 2), dtype=np.float32)
            for c in b['cities']:
                R = SIZE[TIER[c['tier']]] * 0.5 * 1.3 + 0.04 + hw          # past the wall's corner, with the water's width
                dx_, dz_ = m[:, 0] - c['x'], m[:, 2] - c['z']; d = np.hypot(dx_, dz_) + 1e-6
                push = np.maximum(0, R - d)
                disp[:, 0] += dx_ / d * push; disp[:, 1] += dz_ / d * push
            if not disp.any(): break
            ker = np.exp(-np.linspace(-2.5, 2.5, 21) ** 2); ker /= ker.sum()
            sm = np.stack([np.convolve(np.pad(disp[:, i], 10, mode='edge'), ker, 'valid') for i in (0, 1)], 1)
            sm *= np.maximum(1, np.abs(disp).max(0) / np.maximum(np.abs(sm).max(0), 1e-6))[None, :] ** 0.5
            a_[:, 0] += sm[:, 0]; a_[:, 2] += sm[:, 1]; c_[:, 0] += sm[:, 0]; c_[:, 2] += sm[:, 1]
        rv[0::2], rv[1::2] = a_, c_; w['v'] = rv.ravel().tolist()
    # A source on the board narrows and fades in (w['f'], its alpha at each pair) rather than stopping square; one that starts past the frame has none to see.
    FADE = 8
    for w in b['water']:
        if w['kind'] != 'river': continue
        rv = np.array(w['v'], dtype=np.float32).reshape(-1, 3); a_, c_ = rv[0::2], rv[1::2]; m_ = (a_ + c_) / 2; f_ = np.ones(len(m_), dtype=np.float32)
        if X0 < m_[0, 0] < X1 and Z0 < m_[0, 2] < Z1:
            for q_ in range(FADE):
                t_ = float(sst(q_ / FADE, 0, 1)); f_[q_] = t_; n_ = 0.3 + 0.7 * t_
                a_[q_], c_[q_] = m_[q_] + (a_[q_] - m_[q_]) * n_, m_[q_] + (c_[q_] - m_[q_]) * n_
        rv[0::2], rv[1::2] = a_, c_; w['v'] = rv.ravel().tolist(); w['f'] = f_.tolist()
    # -- where the land must stay as the game has it: round the cities, under the roads and the water
    keep = canvas('L'); kd = ImageDraw.Draw(keep)
    for c in b['cities']:
        r = SIZE[TIER[c['tier']]] * 0.75 / DX; px, pz = pix(c['x'], c['z']); kd.ellipse((px - r, pz - r * DX / DZ, px + r, pz + r * DX / DZ), fill=255)
    def ribbon_quads(rv, f):  # the ribbon's quads, its pairs pulled toward their middle by f
        rv = np.array(rv, dtype=np.float32).reshape(-1, 3); a, c_ = rv[0::2], rv[1::2]; m = (a + c_) / 2
        a, c_ = m + (a - m) * f, m + (c_ - m) * f
        return [([pix(*a[q][[0, 2]]), pix(*c_[q][[0, 2]]), pix(*c_[q + 1][[0, 2]]), pix(*a[q + 1][[0, 2]])], float((m[q, 1] + m[q + 1, 1]) / 2)) for q in range(len(m) - 1)]
    rivers = [w for w in b['water'] if w['kind'] == 'river']
    for w in rivers:
        for poly, _ in ribbon_quads(w['v'], 2.8): kd.polygon(poly, fill=255)
    lakes = []
    for w in b['water']:
        if w['kind'] != 'lake': continue
        lv = np.array(w['v'], dtype=np.float32).reshape(-1, 3); cx, cz = lv[:, 0].mean(), lv[:, 2].mean()
        rx, rz = (lv[:, 0].max() - lv[:, 0].min()) / 2, (lv[:, 2].max() - lv[:, 2].min()) / 2
        ph = rs.uniform(0, 6.3, 4); am = rs.uniform(0.04, 0.12, 4)
        lakes.append((cx, cz, rx, rz, float(lv[0, 1]), ph, am))
    def lake_poly(L, f):
        cx, cz, rx, rz, _, ph, am = L
        out = []
        for t in np.linspace(0, 2 * math.pi, 120, endpoint=False):
            k = 1 + sum(am[i] * math.sin((i + 2) * t + ph[i]) for i in range(4))
            out.append((cx + math.cos(t) * rx * k * f, cz + math.sin(t) * rz * k * f))
        return out
    for L in lakes: kd.polygon([pix(*p) for p in lake_poly(L, 1.7)], fill=255)
    # Bend only dry stretches. Water, existing massif footprints and city approaches stay fixed, so crossings
    # retain their banks and the bridge pass sees exactly the road that is painted and exported.
    wm_ = canvas('L'); wd_ = ImageDraw.Draw(wm_)
    for w in rivers:
        for poly, _ in ribbon_quads(w['v'], 2.8 * WW): wd_.polygon(poly, fill=255)
    for L in lakes: wd_.polygon([pix(*p) for p in lake_poly(L, 1.7)], fill=255)
    guard = np.asarray(wm_.filter(ImageFilter.MaxFilter(ROAD_WATER_GUARD_PX)).filter(ImageFilter.GaussianBlur(ROAD_WATER_SOFT_PX)), dtype=np.float32) / 255
    guard = np.maximum(guard, (H0 <= SEA_Y + 0.12).astype(np.float32))
    mm_ = canvas('L'); md_ = ImageDraw.Draw(mm_)
    for x, _, z, ry, s, sx in np.array((baseline or {}).get('pieces', {}).get('massif', [])).reshape(-1, 6):
        ca, sa = math.cos(ry), -math.sin(ry); a, c_ = .82 * s * sx + ROAD_MASSIF_MARGIN, .53 * s + ROAD_MASSIF_MARGIN
        pts = [pix(x + ca * a * math.cos(t) - sa * c_ * math.sin(t), z + sa * a * math.cos(t) + ca * c_ * math.sin(t)) for t in np.linspace(0, 2 * math.pi, 32, endpoint=False)]
        md_.polygon(pts, fill=255)
    guard = np.maximum(guard, np.asarray(mm_.filter(ImageFilter.GaussianBlur(ROAD_MASSIF_SOFT_PX)), dtype=np.float32) / 255)
    forest = np.asarray(Image.fromarray((mask[..., 1] * 255).astype(np.uint8)).resize((FX, FZ), Image.Resampling.BILINEAR), dtype=np.float32) / 255
    terrain_slope = np.hypot(*np.gradient(H0, DZ, DX))
    prior_roads = baseline['roads'] if KEEP else []
    largest_bend = 0.0
    for ri, r in enumerate(b['roads']):
        rv = np.array(r['v'], dtype=np.float32).reshape(-1, 2, 3)
        original = rv.mean(axis=1).copy()
        rv = bend_road(rv, ri, samp, H0, terrain_slope, forest, guard, b['cities'])
        if KEEP:
            old = np.array(prior_roads[ri]['p'], dtype=np.float32).reshape(-1, 3)
            now = rv.mean(axis=1)
            if len(old) != len(now) or np.linalg.norm(old[[0, -1]][:, [0, 2]] - now[[0, -1]][:, [0, 2]], axis=1).max() > .05:
                raise ValueError(f'--keep: road {ri} no longer matches the staged board; do a full rebuild')
            edge = np.minimum.reduce([now[:, 0] - KEEP[0], KEEP[1] - now[:, 0], now[:, 2] - KEEP[2], KEEP[3] - now[:, 2]])
            mix = smooth(edge, 0, ROAD_KEEP_FEATHER)
            rv[:, :, 0] += ((old[:, 0] - now[:, 0]) * (1 - mix))[:, None]
            rv[:, :, 2] += ((old[:, 2] - now[:, 2]) * (1 - mix))[:, None]
        largest_bend = max(largest_bend, float(np.linalg.norm((rv.mean(axis=1) - original)[:, [0, 2]], axis=1).max()))
        r['v'] = rv.ravel().tolist()
        for poly, _ in ribbon_quads(r['v'], 2.2): kd.polygon(poly, fill=255)
    print(f'maximum road displacement from source: {largest_bend:.3f} world units')
    K = blur(np.asarray(keep, dtype=np.float32) / 255, 4)

    # -- mountains sculpted: the game's ranges raised a little and cut into ridges, crags and gullies
    land = H0 > SEA_Y + 0.02
    G = H0 + np.maximum(0, H0 - 0.6) * 0.35 * (1 - K)
    # The game's ranges are narrow walls of even height: their foot spread into broad massifs, their crest broken
    # into heavy peaks and saddles, the rock laid in strata (shelves and cliffs, green or snow on the ledges);
    # the small hills stay round and wooded.
    M = np.maximum(0, H0 - 0.38); Mb = blur(M, 9) * 2.0
    M2 = np.maximum(M, Mb); G = G + (M2 - M) * (1 - K) * (1 - sst(H0, 1.4, 2.2))
    big = sst(M2, 0.3, 0.8) * (1 - K)               # a range, not a hill
    calm = 1 - sst(H0, 1.3, 2.2) * 0.85             # the high plateau in the west rolls rather than spikes
    P = ridged(1.0, 6, 11); P = (P - P.mean()) / P.std()
    G = G + np.minimum(M2, 1.2) * P * 0.2 * calm * big
    G = G + (1 - big) * (1 - K) * sst(M2, 0.02, 0.3) * (fbm(0.35, 4, 41) - 0.5) * 0.12   # hills: lumpy, round
    R = ridged(0.35, 5, 23); R = (R - R.mean()) / R.std()
    wm = sst(H0, 0.4, 1.0) * (1 - K)
    G = G + wm * big * R * (0.04 + 0.05 * np.clip(H0 - 0.8, 0, 1.5))
    # The small hills are kept low: the Tripo hills (placed below) give them their shape.
    G = G + (np.minimum(G, 0.38 + M2 * 0.45) - G) * (1 - sst(big, 0.3, 0.6))
    G = G + land * (1 - K) * (1 - wm) * (fbm(0.5, 4, 31) - 0.5) * 0.05     # the plains' gentle swell

    # -- water carved in: rivers and lakes sit in their beds, the banks just above them
    lv_ = [0.5, 0.75, 1.0, 1.7, 2.5]
    levels = [canvas('L') for _ in lv_]; wy = canvas('F', -9.0)
    dl = [ImageDraw.Draw(m) for m in levels]; dy = ImageDraw.Draw(wy)
    for w in rivers:
        for li, f in enumerate(lv_):
            for poly, y in ribbon_quads(w['v'], f * WW): dl[li].polygon(poly, fill=255)
        for poly, y in ribbon_quads(w['v'], 3.0 * WW): dy.polygon(poly, fill=y)
    for L in lakes:
        for li, f in enumerate(lv_): dl[li].polygon([pix(*p) for p in lake_poly(L, 0.6 + 0.4 * f)], fill=255)
        dy.polygon([pix(*p) for p in lake_poly(L, 1.5)], fill=L[4])
    Lv = sum((np.asarray(m) > 0).astype(np.float32) for m in levels)
    # At a ribbon's square end a pixel of the bed can fall outside the wider height strip, with no water height to carve
    # from (wy's -9): such a hole sank the ground to -5.8 and showed the sea plane through it, a grey cap. It takes its neighbours' height.
    for _ in range(4):
        hole = (Lv >= 3) & (np.asarray(wy, dtype=np.float32) < -8)
        if not hole.any(): break
        wy = Image.fromarray(np.where(hole, np.asarray(wy.filter(ImageFilter.MaxFilter(3)), dtype=np.float32), np.asarray(wy, dtype=np.float32)), 'F')
    WY = np.asarray(wy, dtype=np.float32)
    bank = np.maximum(G, WY + 0.03)
    tgt = np.select([Lv >= 5, Lv >= 4, Lv >= 3, Lv >= 2, Lv >= 1], [WY - 0.05, WY - 0.03, WY - 0.008, bank, G * 0.5 + bank * 0.5], G)
    # A bed on land stays over the sea plane, or the sea shows through it; only a ribbon already down at the sea lies just under.
    tgt = np.where((Lv > 0) & (G > SEA_Y), np.maximum(tgt, np.minimum(SEA_Y + 0.004, WY - 0.004)), tgt)
    zone = blur((Lv > 0).astype(np.float32), 2)
    G = np.where(Lv > 0, tgt, G); G = G * (1 - zone) + blur(G, 1) * zone
    # -- each city on its own level ground, on its own bank: the sand table's walls are larger than the game's
    # marker, so where they would reach into a river, the lake or the sea the model steps back from the water
    # (away from it, so it stays on the same bank) and, failing that, shrinks a little. (mx, mz, ms) is where the
    # model stands and its scale; (x, z) stays the game's seat.
    WET = (Lv >= 3) | (G <= SEA_Y + 0.005)
    cities = []
    for c in b['cities']:
        mx, mz, ms, moves = c['x'], c['z'], 1.0, 0
        for it in range(120):
            hh = SIZE[TIER[c['tier']]] * 0.5 * ms * 0.92 + 0.02
            j0, j1 = int((mz - hh - Z0) / DZ), int((mz + hh - Z0) / DZ) + 1; k0, k1 = int((mx - hh - X0) / DX), int((mx + hh - X0) / DX) + 1
            ww = WET[max(j0, 0):j1, max(k0, 0):k1]
            if not ww.any(): break
            wz, wx = np.nonzero(ww); vx, vz = mx - (X0 + (wx + max(k0, 0)) * DX).mean(), mz - (Z0 + (wz + max(j0, 0)) * DZ).mean()
            n_ = math.hypot(vx, vz) or 1
            if moves < 10: mx, mz, moves = mx + vx / n_ * 0.03, mz + vz / n_ * 0.03, moves + 1   # step back a little,
            elif ms > 0.8: ms -= 0.02                                                              # then shrink a little
            else: break
        hh = SIZE[TIER[c['tier']]] * 0.5 * ms
        d = np.maximum(np.abs(XX - mx), np.abs(ZZ - mz)); w = (1 - sst(d, hh * 1.02, hh * 1.35)) * (1 - WET)
        G = G * (1 - w) + (c['y'] - 0.012) * w
        cities.append({**c, 'mx': round(mx, 3), 'mz': round(mz, 3), 'ms': round(ms, 3)})
        if (mx, mz, ms) != (c['x'], c['z'], 1.0): print(f"{c['name']}: model moved {math.hypot(mx - c['x'], mz - c['z']):.2f} off the water, scale {ms:.2f}")
    # -- the game's camera looks north, so ground rising just south of a city hides it (凉州 sat in a pit behind its
    # range): a valley opens southward from each city, up to the line of sight at the camera's lowest default tilt.
    def over_sight(G):
        cut = np.zeros_like(G)
        for c in cities:
            hh = SIZE[TIER[c['tier']]] * 0.5 * c['ms']
            sight = c['y'] + 0.05 + np.maximum(ZZ - c['mz'] - hh, 0) * SIGHT + np.maximum(np.abs(XX - c['mx']) - hh - 0.35, 0) * 2.0
            cut = np.maximum(cut, np.maximum(G - sight, 0) * sst(ZZ - c['mz'], -hh, 0.0))
        return cut
    G = G - blur(over_sight(G), 2); G = G - over_sight(G)
    # -- roads laid over it, over the water on their bridges
    bridges = []
    def water_at(x, z): return samp(Lv, x, z), samp(WY, x, z)
    roads = []
    for r in b['roads']:
        rv = np.array(r['v'], dtype=np.float32).reshape(-1, 3)
        lw, wyy = water_at(rv[:, 0], rv[:, 2])
        y = samp(G, rv[:, 0], rv[:, 2]) + 0.006
        y = np.where(lw > 0.5, np.maximum(y, wyy + 0.02), y)
        rv[:, 1] = y; roads.append({'v': rv.ravel().tolist(), 'i': r['i']})
        m = (rv[0::2] + rv[1::2]) / 2; lm, wm_ = water_at(m[:, 0], m[:, 2]); wet = lm >= 2.5
        q = 0
        while q < len(m):
            if not wet[q]: q += 1; continue
            e = q
            while e + 1 < len(m) and wet[e + 1]: e += 1
            a_, z_ = m[max(q - 1, 0)], m[min(e + 1, len(m) - 1)]
            mid = (a_ + z_) / 2; ln = float(np.hypot(z_[0] - a_[0], z_[2] - a_[2]))
            bridges.append({'k': 'bridge', 'x': float(mid[0]), 'z': float(mid[2]), 'y': float(wm_[(q + e) // 2]) - 0.015,
                            'ry': math.atan2(-(z_[2] - a_[2]), z_[0] - a_[0]), 's': 1.0, 'sx': max(1.0, ln * 1.1 / SIZE['bridge'])})
            q = e + 1
    slope = np.hypot(*np.gradient(G, DZ, DX))
    def msk(x, z):
        return mask[int(np.clip((z - Z0) / (Z1 - Z0) * MH, 0, MH - 1)), int(np.clip((x - X0) / (X1 - X0) * MW, 0, MW - 1))]
    def hamlet_farm(x, z):
        return source_fields[int(np.clip((z - Z0) / (Z1 - Z0) * MH, 0, MH - 1)), int(np.clip((x - X0) / (X1 - X0) * MW, 0, MW - 1))]
    def h(x, z): return float(samp(G, x, z))
    def sl(x, z): return float(samp(slope, x, z))
    def wet(x, z): return samp(Lv, x, z) > 0.2
    # r: how far a piece reaches. It stays out of each city's square (the models stand unrotated), a little margin round it.
    clear = lambda x, z, r: all(max(abs(x - c['mx']), abs(z - c['mz'])) > SIZE[TIER[c['tier']]] * 0.5 * c['ms'] + PAD_MARGIN[c['tier']] + r
                                and math.hypot(x - c['mx'], z - c['mz']) > SIZE[TIER[c['tier']]] * 0.5 * c['ms'] * math.sqrt(2) + PAD_MARGIN[c['tier']] + PAD_NOISE * .5 + r for c in cities)
    # A tall piece just south of a city hides it from the game's camera, which looks north.
    hides = lambda x, z, reach: any(abs(x - c['mx']) < SIZE[TIER[c['tier']]] * 0.5 * c['ms'] + 0.5 and 0 < z - c['mz'] < SIZE[TIER[c['tier']]] * 0.5 * c['ms'] + reach for c in cities)
    # a piece of radius r keeps off the rivers, lakes, sea and roads (K: the strips the board keeps as the game has them)
    DRY = ~((Lv >= 2) | (G <= SEA_Y + 0.01) | (K > 0.5)); NOWATER = ~((Lv >= 2) | (G <= SEA_Y + 0.01))
    def dry(x, z, r, m=None):
        m = DRY if m is None else m
        j0, j1 = int((z - r - Z0) / DZ), int((z + r - Z0) / DZ) + 1; k0, k1 = int((x - r - X0) / DX), int((x + r - X0) / DX) + 1
        return m[max(j0, 0):j1, max(k0, 0):k1].all()

    # --keep x0,x1,z0,z1: all the placing below draws from one random stream, so a river moved in one corner would
    # reshuffle the whole board. The pieces it already has stay put outside this box; only the box is placed afresh.
    inbox = lambda x, z: KEEP is None or (KEEP[0] <= x <= KEEP[1] and KEEP[2] <= z <= KEEP[3])
    shipped = baseline['pieces'] if KEEP else {}
    def kept(k):
        a = np.array(shipped.get(k, [])).reshape(-1, 6)
        return [{'k': k, 'x': p[0], 'y': p[1], 'z': p[2], 'ry': p[3], 's': p[4], 'sx': p[5]} for p in a.tolist()
                if not inbox(p[0], p[2]) and not wet(p[0], p[2]) and (k not in REACH or clear(p[0], p[2], REACH[k]))]

    place = list(bridges) + kept('hamlet')
    # Hamlets: two or three on the farmland round each city, clear of the walls and of each other.
    for c in cities:
        got = sum(p['k'] == 'hamlet' and math.hypot(p['x'] - c['mx'], p['z'] - c['mz']) < 1.7 for p in place) if KEEP else 0
        for t in range(80):
            if got >= (6 if c['tier'] in ('capital', 'major') else 4): break
            a, r = rs.uniform(0, 2 * math.pi), SIZE[TIER[c['tier']]] * 0.5 + rs.uniform(0.2, 0.9)
            x, z = c['mx'] + math.cos(a) * r, c['mz'] + math.sin(a) * r
            if h(x, z) < SEA_Y + 0.05 or hamlet_farm(x, z) < 0.25 or sl(x, z) > 0.6 or not dry(x, z, 0.13, NOWATER): continue
            if not inbox(x, z) or not clear(x, z, REACH['hamlet']) or any(p['k'] == 'hamlet' and math.hypot(p['x'] - x, p['z'] - z) < 0.34 for p in place): continue
            place.append({'k': 'hamlet', 'x': x, 'z': z, 'y': h(x, z) - 0.01, 'ry': rs.uniform(-0.4, 0.4), 's': 1}); got += 1
    # Villages strung along the roads, so the land between cities is lived in.
    for rd in roads:
        mm = np.array(rd['v'], dtype=np.float32).reshape(-1, 2, 3).mean(1); run = rs.uniform(0.3, 0.9)
        for q in range(1, len(mm)):
            run -= float(np.hypot(*(mm[q] - mm[q - 1])[[0, 2]]))
            if run > 0: continue
            run = rs.uniform(0.7, 1.3); side = rs.choice([-1, 1]); tx, tz = (mm[q] - mm[q - 1])[[0, 2]]; nn = math.hypot(tx, tz) or 1
            x, z = float(mm[q, 0] - tz / nn * side * 0.2), float(mm[q, 2] + tx / nn * side * 0.2)
            if not inbox(x, z) or h(x, z) < SEA_Y + 0.05 or hamlet_farm(x, z) < 0.15 or sl(x, z) > 0.6 or not dry(x, z, 0.12, NOWATER): continue
            if not clear(x, z, REACH['hamlet']) or any(p['k'] == 'hamlet' and math.hypot(p['x'] - x, p['z'] - z) < 0.4 for p in place): continue
            place.append({'k': 'hamlet', 'x': x, 'z': z, 'y': h(x, z) - 0.01, 'ry': rs.uniform(-0.4, 0.4), 's': rs.uniform(0.75, 1.0)})
    # Mountain massifs (Tripo) along the ranges, each laid along the crest and rising from the range's foot; round
    # wooded hills on the low rises.
    def foot(j, k, r):
        w = G[max(0, j - r):j + r + 1, max(0, k - r):k + r + 1]
        # On a region's small islands most of the window is sea floor: a foot taken from it sank 汉拏山, and 济州 with it, under the sea.
        if REGION and (w > SEA_Y + 0.02).any(): w = w[w > SEA_Y + 0.02]
        return float(np.percentile(w, 15))
    if os.path.exists(f'{MODELS}/massif.glb'):
        if baseline and 'massif' in baseline['pieces']:
            # Keep the shipped ranges' position, height and rotation; shrink a piece if it needs more clearance,
            # or drop it if it would still overlap a road, water or a city. The western pile cannot grow.
            place += kept('massif')
            for x, y, z, ry, s, sx in np.array(baseline['pieces']['massif']).reshape(-1, 6):
                if not inbox(x, z) or not clear(x, z, REACH['massif']) or hides(x, z, 0.9): continue
                ax, az = math.cos(ry), -math.sin(ry)
                fit = next((s_ for s_ in (s, s * 0.85, s * 0.7) if dry(x, z, 0.39 * s_) and dry(x + ax * 0.46 * s_, z + az * 0.46 * s_, 0.32 * s_)
                            and dry(x - ax * 0.46 * s_, z - az * 0.46 * s_, 0.32 * s_)), None)
                if fit is None: continue
                place.append({'k': 'massif', 'x': x, 'z': z, 'y': y, 'ry': ry, 's': fit, 'sx': sx})
        else:
            Hs = blur(H0, 3); gzz, gxx = np.gradient(Hs, DZ, DX)
            cand = np.argwhere((Hs > 0.75) & (Hs < 1.9) & (K < 0.3) & (Lv == 0))   # the ranges, not the high plateau
            cand = cand[np.argsort(-(Hs[cand[:, 0], cand[:, 1]] + rs.random(len(cand)) * 0.4))]
            for j, k in cand:
                x, z = X0 + k * DX, Z0 + j * DZ
                if not inbox(x, z) or not clear(x, z, REACH['massif']) or hides(x, z, 0.9) or any(p['k'] == 'massif' and math.hypot(p['x'] - x, p['z'] - z) < 0.85 for p in place): continue
                ry = math.atan2(-gxx[j, k], -gzz[j, k]) + rs.uniform(-0.25, 0.25); ax, az = math.cos(ry), -math.sin(ry)
                s0 = float(np.clip(0.7 + (Hs[j, k] - 0.75) * 0.35, 0.7, 1.25) * rs.uniform(0.85, 1.1))
                fit = next((s_ for s_ in (s0, s0 * 0.85, s0 * 0.7) if dry(x, z, 0.39 * s_) and dry(x + ax * 0.46 * s_, z + az * 0.46 * s_, 0.32 * s_)
                            and dry(x - ax * 0.46 * s_, z - az * 0.46 * s_, 0.32 * s_)), None)
                if fit is None: continue
                place.append({'k': 'massif', 'x': x, 'z': z, 'y': foot(j, k, 22) - 0.05, 'ry': ry, 's': fit})
                if sum(p['k'] == 'massif' for p in place) >= MASSIF_LIMIT: break
        # the range under each massif brought down to its foot, so no bare peak of the old wall pokes through
        for p_ in [p for p in place if p['k'] == 'massif']:
            ca, sa = math.cos(p_['ry']), -math.sin(p_['ry'])
            u = ((XX - p_['x']) * ca + (ZZ - p_['z']) * sa) / (0.82 * p_['s']); v = (-(XX - p_['x']) * sa + (ZZ - p_['z']) * ca) / (0.53 * p_['s'])
            w = (1 - sst(np.hypot(u, v), 0.75, 1.15)) * (1 - K)   # never the river banks or the roads
            G = G + (np.minimum(G, p_['y'] + 0.25) - G) * w
    if os.path.exists(f'{MODELS}/hill.glb'):
        cand = np.argwhere((M2 > 0.1) & (big < 0.5) & (K < 0.3) & (Lv == 0) & (H0 < 0.9))
        cand = cand[np.argsort(-(M2[cand[:, 0], cand[:, 1]] + rs.random(len(cand)) * 0.1))]
        place += kept('hill')
        if baseline:
            for x, y, z, ry, s, sx in np.array(baseline['pieces'].get('hill', [])).reshape(-1, 6):
                if x >= WESTERN_RANGE_X or not inbox(x, z) or not clear(x, z, REACH['hill']) or hides(x, z, 0.4): continue
                if not dry(x, z, 0.32 * s) or any(p['k'] == 'massif' and math.hypot(p['x'] - x, p['z'] - z) < 0.95 for p in place): continue
                place.append({'k': 'hill', 'x': x, 'z': z, 'y': y, 'ry': ry, 's': s, 'sx': sx})
        got = [(p['x'], p['z']) for p in place if p['k'] == 'hill']
        for j, k in cand:
            x, z = X0 + k * DX, Z0 + j * DZ
            if baseline and x < WESTERN_RANGE_X: continue  # do not build a new heap beside the preserved range
            if not inbox(x, z) or not clear(x, z, REACH['hill']) or hides(x, z, 0.4) or any(math.hypot(a - x, b_ - z) < 0.6 for a, b_ in got) or any(p['k'] == 'massif' and math.hypot(p['x'] - x, p['z'] - z) < 0.95 for p in place): continue
            if not dry(x, z, 0.32 * float(np.clip(0.65 + M2[j, k] * 1.0, 0.65, 1.1))): continue
            got.append((x, z))
            place.append({'k': 'hill', 'x': x, 'z': z, 'y': foot(j, k, 10) - 0.03, 'ry': rs.uniform(0, 6.3), 's': float(np.clip(0.65 + M2[j, k] * 1.0, 0.65, 1.1))})
            if len(got) >= HILL_PLACE_LIMIT: break
    # Any peak of the old range walls still standing bare (no massif or hill on it, e.g. one too near a city for a
    # massif): brought down and given a wooded hill, or just levelled where a hill would crowd a city or the water.
    Gl = blur(G, 15); pro = blur(G, 2) - Gl
    cand = np.argwhere((pro > 0.28) & (K < 0.6) & (H0 < 1.5))   # not the plateau's rim
    cand = cand[np.argsort(-pro[cand[:, 0], cand[:, 1]])]
    done = []
    for j, k in cand:
        x, z = X0 + k * DX, Z0 + j * DZ
        if any(math.hypot(a - x, b_ - z) < 0.7 for a, b_ in done): continue   # levelled with an earlier one
        if any(p['k'] == 'massif' and math.hypot(p['x'] - x, p['z'] - z) < 0.8 * p['s'] for p in place): continue
        f_ = foot(j, k, 14); d = np.hypot(XX - x, ZZ - z); w = (1 - sst(d, 0.35, 0.75)) * (1 - K)
        G = G + (np.minimum(G, f_ + 0.12) - G) * w
        if not (baseline and x < WESTERN_RANGE_X) and clear(x, z, REACH['hill']) and not hides(x, z, 0.4) and dry(x, z, 0.3) and not any(p['k'] == 'hill' and math.hypot(p['x'] - x, p['z'] - z) < 0.5 for p in place):
            place.append({'k': 'hill', 'x': x, 'z': z, 'y': f_ - 0.03, 'ry': rs.uniform(0, 6.3), 's': 0.85})
        done.append((x, z)); print('levelled peak at', round(x, 2), round(z, 2))
        if len(done) >= PEAK_LIMIT: break
    # Filter only after placement has consumed its random stream, so reducing hills does not reshuffle the woods.
    def hill_rise(x, z):
        j, k = round((z - Z0) / DZ), round((x - X0) / DX)
        return h(x, z) - foot(j, k, HILL_RISE_WINDOW)
    place = trim_hills(place, h, hill_rise, inbox)
    # Boats off the coast: open water within reach of the shore.
    Hl = H > SEA_Y
    place += kept('boat')
    for t in range(0 if KEEP else 4000):
        j, k = rs.integers(3, NZ - 3), rs.integers(3, NX - 3)
        if Hl[j, k] or not Hl[max(0, j - 12):j + 12, max(0, k - 12):k + 12].any() or Hl[j - 3:j + 4, k - 3:k + 4].any(): continue
        x, z = X0 + k * 0.09, Z0 + j * 0.1
        if any(p['k'] == 'boat' and math.hypot(p['x'] - x, p['z'] - z) < 0.9 for p in place): continue
        place.append({'k': 'boat', 'x': x, 'z': z, 'y': SEA_Y, 'ry': rs.uniform(0, 6.3), 's': rs.uniform(0.8, 1.1)})
        if sum(p['k'] == 'boat' for p in place) >= BOAT_LIMIT: break
    # Paint pads and vegetation after sculpting the ranges, so the field slope test sees the actual ground.
    # A cleared forest patch becomes meadow; pad feathers keep their vegetation rather than exposing loess.
    mx_, mz_ = np.meshgrid(np.linspace(X0, X1, MW, dtype=np.float32), np.linspace(Z0, Z1, MH, dtype=np.float32))
    to_mask = lambda a: np.asarray(Image.fromarray(a.astype(np.float32), 'F').resize((MW, MH), Image.Resampling.BILINEAR), dtype=np.float32)
    wood = smooth(to_mask(fbm(*WOOD_NOISE_FIELD)), *WOOD_CLEARING)
    dry_pad = 1 - to_mask(WET.astype(np.float32)); slope = np.hypot(*np.gradient(G, DZ, DX))
    arable = 1 - smooth(to_mask(slope), *FIELD_SLOPE_RANGE)
    near_veg = Image.fromarray((np.max(mask[..., :3], axis=2) * 255).astype(np.uint8), 'L')
    near_veg = np.asarray(near_veg.filter(ImageFilter.MaxFilter(MEADOW_GAP_PX)).filter(ImageFilter.GaussianBlur(MEADOW_GAP_BLUR)), dtype=np.float32) / 255
    clump = fbm(*WOOD_CLUMP_FIELD); central = smooth(mz_, *WOOD_NORTH_TO_CENTRAL); south = smooth(mz_, *WOOD_CENTRAL_TO_SOUTH)
    low = WOOD_OPEN_NORTH[0] + (WOOD_OPEN_CENTRAL[0] - WOOD_OPEN_NORTH[0]) * central + (WOOD_OPEN_SOUTH[0] - WOOD_OPEN_CENTRAL[0]) * south
    high = WOOD_OPEN_NORTH[1] + (WOOD_OPEN_CENTRAL[1] - WOOD_OPEN_NORTH[1]) * central + (WOOD_OPEN_SOUTH[1] - WOOD_OPEN_CENTRAL[1]) * south
    stands = smooth(to_mask(clump), low, high) * arable * np.clip(dry_pad, 0, 1)
    paint_args = (mask, cities, mx_, mz_, np.clip(dry_pad, 0, 1), wood, to_mask(fbm(*PAD_NOISE_FIELD)) - .5,
                  arable, to_mask(fbm(*FIELD_NOISE_FIELD)), near_veg, stands)
    painted_mask, pad = city_land_paint(*paint_args)
    mask, _ = city_land_paint(*paint_args, field_outer=WOOD_PLACEMENT_FIELD_OUTER)
    mask[..., 1] *= 1 - smooth(to_mask(K), WOOD_ROAD_CLEAR * .5, WOOD_ROAD_CLEAR)  # no forest seed on the road/city corridors
    Image.fromarray((np.clip(pad, 0, 1) * 255).astype(np.uint8), 'L').save(f'{WORK}/pads.png')
    # Woods: the old grove is one scaly dome. Three ordinary crowns in each stand use the tree material and the
    # same seasonal colour. All later tree candidates use the same stand mask, before the floor is painted from them.
    TREE_R = REACH['grove']
    ok = lambda x, z, smax: h(x, z) > SEA_Y + 0.06 and sl(x, z) < smax and not wet(x, z) and samp(K, x, z) < WOOD_ROAD_CLEAR and clear(x, z, TREE_R)
    place += kept('tree-broad') + kept('tree-pine')
    tree_n = sum(p['k'] in ('tree-broad', 'tree-pine') for p in place)
    tree_bins = {}
    def tree_cell(x, z): return (math.floor(x / WOOD_TREE_SEPARATION), math.floor(z / WOOD_TREE_SEPARATION))
    def tree_add(x, z): tree_bins.setdefault(tree_cell(x, z), []).append((x, z))
    for p in place:
        if p['k'] in ('tree-broad', 'tree-pine'): tree_add(p['x'], p['z'])
    def plant(x, z, ry=None, scale=None, check_stand=True, kind=None):
        nonlocal tree_n
        if tree_n >= WOOD_INSTANCE_LIMIT or not ok(x, z, 1.2 if h(x, z) > 1.4 else 2.0) or not dry(x, z, TREE_R): return False
        if check_stand and msk(x, z)[1] < WOOD_FOREST_THRESHOLD: return False
        bx, bz = tree_cell(x, z)
        if any((x - px) ** 2 + (z - pz) ** 2 < WOOD_TREE_SEPARATION ** 2 for i in range(bx - 1, bx + 2) for j in range(bz - 1, bz + 2)
               for px, pz in tree_bins.get((i, j), ())): return False
        pine = -z + 31.5 > 35.5 or h(x, z) > 1.2
        place.append({'k': kind or ('tree-pine' if pine else 'tree-broad'), 'x': x, 'z': z, 'y': h(x, z) - 0.01,
                      'ry': rs.uniform(0, 6.3) if ry is None else ry, 's': rs.uniform(*WOOD_TREE_SCALE) if scale is None else scale})
        tree_add(x, z); tree_n += 1; return True
    def cluster(x, z, phase, local=True):
        for i in range(WOOD_CLUSTER_COUNT):
            a = phase + 2 * math.pi * i / WOOD_CLUSTER_COUNT
            xx, zz = x + math.cos(a) * WOOD_CLUSTER_RADIUS, z + math.sin(a) * WOOD_CLUSTER_RADIUS
            if not local or inbox(xx, zz): plant(xx, zz, check_stand=local)
    for p in kept('grove'): cluster(p['x'], p['z'], p['ry'], local=False)  # migrate old domes even outside a --keep box
    sites = [(x, z) for z in np.arange(Z0 + 0.3, Z1 - 0.3, WOOD_GROVE_STEP_XZ[1]) for x in np.arange(X0 + 0.3, X1 - 0.3, WOOD_GROVE_STEP_XZ[0])]
    rs.shuffle(sites)  # the hard cap must not favour the northern rows
    for x, z in sites:
        if tree_n >= WOOD_INSTANCE_LIMIT: break
        xx, zz = x + rs.uniform(-0.09, 0.09), z + rs.uniform(-0.09, 0.09)
        if not inbox(xx, zz) or msk(xx, zz)[1] < WOOD_FOREST_THRESHOLD or not ok(xx, zz, 1.1) or not dry(xx, zz, 0.13): continue
        cluster(xx, zz, rs.uniform(0, 6.3))
    for t in b['trees']:
        if inbox(t['x'], t['z']): plant(t['x'], t['z'], t['ry'], t['s'] / 0.25, kind='tree-pine' if t['k'] == 'pine' else 'tree-broad')
    got = 0
    for t in range(60000):
        if tree_n >= WOOD_INSTANCE_LIMIT or got >= WOOD_RANDOM_LIMIT: break
        x, z = rs.uniform(X0 + 0.2, X1 - 0.2), rs.uniform(Z0 + 0.2, Z1 - 0.2)
        if inbox(x, z) and plant(x, z): got += 1
    got = 0
    for t in range(60000):
        if tree_n >= WOOD_INSTANCE_LIMIT or got >= WOOD_CENTRAL_EXTRA: break
        x, z = rs.uniform(WOOD_CENTRAL_BOX[0], WOOD_CENTRAL_BOX[1]), rs.uniform(WOOD_CENTRAL_BOX[2], WOOD_CENTRAL_BOX[3])
        if inbox(x, z) and plant(x, z): got += 1
    place = remove_isolated_trees(place)
    for p in place:
        if p['k'] in ('tree-broad', 'tree-pine') and inbox(p['x'], p['z']): p['k'] = tree_kind(p['x'], p['z'], h(p['x'], p['z']))
    mask = paint_wood_floor(painted_mask, place)
    Image.fromarray((np.clip(mask, 0, 1) * 255).astype(np.uint8), 'RGBA').save(f'{WORK}/mask.png')
    road_mask_alpha(roads, MW, MH).save(f'{WORK}/road-alpha.png')

    # Whatever else the sculpting sank under the sea plane away from the sea (a valley cut under a range) is filled to its rim, its sloping sides too.
    for cells in pockets(G < SEA_Y)[1:]:
        j0, k0 = cells.mean(0); d = np.hypot(XX - (X0 + k0 * DX), (ZZ - (Z0 + j0 * DZ)) * DX / DZ) / DX; rim = max(G[(d >= 6) & (d < 7)].mean() - 0.01, SEA_Y + 0.01)
        G = np.where(d < 6, np.maximum(G, rim + (G - rim) * sst(d, 3, 6)), G); print(f'filled a pit of {len(cells)} cells at ({X0 + k0 * DX:.2f}, {Z0 + j0 * DZ:.2f})')
    # The sculpted ground for Blender: heights, and the game's own height kept for the snow (seasons.js reads it).
    np.savez(f'{WORK}/ground.npz', G=G.astype(np.float32), H0=H0.astype(np.float32), Lv=Lv.astype(np.uint8), K=K.astype(np.float32))
    # Pebbled banks along the rivers and lakes, sand along the sea (ground uv: row 0 is the north edge).
    bankm = blur(((Lv >= 2) & (Lv <= 3)).astype(np.float32), 1) * 0.75
    sea_ = (G <= SEA_Y).astype(np.float32); beach = np.clip(blur(sea_, 3) * 3, 0, 1) * (G > SEA_Y) * (G < SEA_Y + 0.12)
    Image.fromarray((np.stack([bankm, blur(beach, 1), np.zeros_like(G)], -1) * 255).astype(np.uint8)).save(f'{WORK}/bank.png')
    water = [w for w in b['water'] if w['kind'] == 'river']
    for w in water:  # the ribbon cut to the water's width
        rv = np.array(w['v'], dtype=np.float32).reshape(-1, 3); a, c_ = rv[0::2], rv[1::2]; m = (a + c_) / 2
        rv[0::2], rv[1::2] = m + (a - m) * WW * 1.25, m + (c_ - m) * WW * 1.25; w['v'] = rv.ravel().tolist()  # edge under the bank
        if m[-1, 1] <= SEA_Y + 0.02:   # a mouth fades out over the stretch that lies on the sea
            hs, n_ = samp(G, m[:, 0], m[:, 2]), 0
            while n_ < len(m) - 1 and hs[len(m) - 1 - n_] < SEA_Y: n_ += 1
            for q_ in range(n_ + 1): w['f'][len(m) - 1 - q_] = min(w['f'][len(m) - 1 - q_], float(sst(q_ / (n_ + 1), 0, 1)))
    for L in lakes:
        pts = lake_poly(L, 1.12); vv = [L[0], L[4], L[1]]; ii = []
        for n_, (x, z) in enumerate(pts): vv += [x, L[4], z]; ii += [0, 1 + n_, 1 + (n_ + 1) % len(pts)]
        water.append({'kind': 'lake', 'v': vv, 'i': ii})
    # The sea's colour from the shore out: shallow green-blue in the bays, foam at the very edge.
    ld = (G > SEA_Y).astype(np.float32)
    shallow = np.clip(blur(ld, 14) * 3.2, 0, 1); foam = np.clip(blur(ld, 2) * 2.2, 0, 1) * (1 - ld)
    # A region's islets (対馬, 壱岐) are too small for the wide blur to reach the shallows tint, so the lit seabed, as
    # shallow round them as off any shore, showed through the dark sea as a mauve disc. In a region the tint also follows
    # the seabed's depth, as the original's does off its long coasts: full to 0.1 under the sea, gone by 0.34, just above the
    # bed's floor (0.35), so the open sea keeps no tint, as the original's does not. The original's run is unchanged.
    if REGION: shallow = np.maximum(shallow, np.clip((0.34 - (SEA_Y - G)) / 0.24, 0, 1))
    Image.fromarray((np.stack([shallow, foam, ld], -1) * 255).astype(np.uint8)).save(f'{WORK}/sea.png')

    # Ground colour: the game's pixel texture, upscaled and painted out (no dither left), graded toward the
    # mock-up's warm olive greens and ochre fields.
    g = Image.open(f'{BOARD}/ground.png').convert('RGB')
    g = g.resize((g.width * 3, g.height * 3), Image.BICUBIC).filter(ImageFilter.MedianFilter(7)).filter(ImageFilter.GaussianBlur(1.2))
    g = soften_old_fields(g, np.maximum(source_fields, mask[..., 0]), mask[..., 2])  # old paint can contain plot outlines even outside its farm mask
    a = np.asarray(g, dtype=np.float32) / 255
    lum = a @ np.array([0.3, 0.59, 0.11], dtype=np.float32)
    a = lum[..., None] + (a - lum[..., None]) * 0.55                       # calmer
    a = a * np.array([1.06, 1.0, 0.84], dtype=np.float32)                   # warmer
    a = np.clip(a ** 1.08, 0, 1)
    Image.fromarray((a * 255).astype(np.uint8)).save(f'{WORK}/ground-paint.png')
    # Ground tiles made tileable: the tile offset by half blended over itself with a soft cross, so no seam shows
    # (the frame's carving only along its length).
    for n in [*TILE_SPAN, 'frame']:
        f = f'{TILES}/{n}.png'
        if not os.path.exists(f): continue
        t = np.asarray(Image.open(f).convert('RGB').resize((1024, 1024), Image.LANCZOS), dtype=np.float32)
        u = np.abs(np.linspace(-1, 1, 1024, dtype=np.float32))
        if n == 'frame':
            o = np.roll(t, 512, 1); w = np.clip(u[None, :] * 2.2 - 1.2, 0, 1)[..., None].repeat(1024, 0)
        else:
            o = np.roll(t, (512, 512), (0, 1)); w = np.clip(np.maximum(u[:, None], u[None, :]) * 2.2 - 1.2, 0, 1)[..., None]
        Image.fromarray((t * (1 - w) + o * w).astype(np.uint8)).save(f'{WORK}/tile-{n}.png')
    json.dump({'place': place, 'roads': roads, 'water': water, 'cities': cities}, open(f'{WORK}/place.json', 'w'), default=float)
    from collections import Counter
    print('placed', dict(Counter(p['k'] for p in place)))
    if file_hash(__file__) != preparing_script: raise ValueError('script changed during preparation; rerun it')
    # What blender_sandtable.py's range step reads as its base preparation (SANDTABLE_ORIGINAL_WORK), and where it came from.
    json.dump({'script': preparing_script, 'board': file_hash(f'{BOARD}/board.json'), 'box': [X0, X1, Z0, Z1], 'grid': [NX, NZ],
               'share': SHARE, 'files': {f: file_hash(f'{WORK}/{f}') for f in PREPARED_FILES}}, open(f'{WORK}/region-prepared.json', 'w'), indent=2)


def file_hash(path):
    with open(path, 'rb') as f: return hashlib.sha256(f.read()).hexdigest()


if __name__ == '__main__':
    import time
    t0 = time.time(); prepare(); print(f'prepared {WORK} in {time.time() - t0:.0f} s')


