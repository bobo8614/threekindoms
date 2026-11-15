#!/usr/bin/env python3
# The 战略地图 as a war-room sand table (direction B, docs/review-assets/2026-10-30/strategy-style/B.png), built in
# Blender from the game's own board (tools/export_strategy_board.mjs) and the Tripo set pieces
# (tools/gen_sandtable_models.sh), and rendered from the game's cameras for review — the look to agree on before
# the board is baked for the game.
#  - Run with python3: reuse the accepted board's prepared ground and placements, lay range-a/range-b along its
#    crests, and adjust only their shared ground and covered vegetation (numpy + Pillow); then run Blender for review.
#  - Ground: the accepted painted heightfield, with range-foot scrub blended into it. Sea, rivers and lakes remain
#    varnished painted water, within a lacquered wooden frame.
#  - Cities: one Tripo model per tier (都城, 州治大城, 普通郡城, 关隘), a banner on a pin in the owner's colour.
#  - Light: one warm lamp from the upper left (the game's spring sun direction) over a dim warm room.
#   python3 hd2d-mvp/tools/blender_sandtable.py [--views mid,near,far] [--samples 96] [--out dir] [--blend]
# Bake for the game (plan 1: light only; the month's colours, snow and owner tint stay live in the game's shader):
#   python3 hd2d-mvp/tools/blender_sandtable.py --bake [--samples 128] [--keep x0,x1,z0,z1] [--keep-models] [--prepared]
# For ranges, set SANDTABLE_WORK and SANDTABLE_DEST to separate worktree directories and seed DEST from the installed
# board. Keep the original preparation (SANDTABLE_ORIGINAL_WORK, default source/rebake-work) and the preparation of an
# installed range board (SANDTABLE_INSTALLED_WORK, default source/ranges-installed-work), separate from WORK.
# The planner preserves fixed features and replaces only the old massifs and pieces covered by the new ranges.
# Preview --views far,mid --samples 8 --snow-lat 99 --fstop 8, then --range-models --prepared --out <preview> to build
# and render the two new near/far GLB pairs, then --bake --prepared --keep-models --samples 128. --keep-models keeps
# old staged GLBs but builds a missing range pair. --prepare-only checks placement without starting Blender.
# Range preparation softens low bright grass and tones the rock in a derived copy of the Tripo paint, retaining
# seasonal leaf greens; Blender pulls in the low apron, welds UV seams and validates the reduced near/far surfaces.
# Around the seated pieces, talus fill and reseating alternate; fixed features and sight lines can force an omission.
# Rebuild just the three tree pieces, without prepare() or a board bake (CPU Cycles; review before installing):
#   /opt/homebrew/bin/blender -b --factory-startup --python-exit-code 1 -P hd2d-mvp/tools/blender_sandtable.py -- --pieces tree-broad,tree-pine,grove --no-install
#   /opt/homebrew/bin/blender -b --factory-startup --python-exit-code 1 -P hd2d-mvp/tools/blender_sandtable.py -- --pieces tree-broad,tree-pine,grove --install-only
# --pieces stages candidates by default: inspect all renders before the separate --install-only step. Dense leaf
# triangles shred under Decimate; the tree-only path swells, remeshes, shrinks and smooths closed crowns, then transfers
# their painted colour. Near uses JPEG; far keeps the same UVs and only a 4x4 image (the game supplies the near material).
# The far crown's horizontal footprint is fitted back to the near crown within the old bounds after reduction.
# writes assets/ai/sandtable/board/: the ground's albedo seen straight down (snow-free, roads painted in), its light
# (R: the lamp with every piece's shadow and bounce, G: the sky, both under white light), the sculpted heights and the
# game's own (for its snow rule), the vegetation mask, the frame's carving, every piece kind as a game-sized GLB and
# where each stands, the rivers, lakes and road courses (src/sandtable.js).
import hashlib, json, math, os, subprocess, sys

TOOLS = os.path.dirname(os.path.abspath(__file__))
MVP = os.path.dirname(TOOLS)
SRC = f'{MVP}/assets/ai/sandtable/source'
# SANDTABLE_WORK / SANDTABLE_DEST: bake to the side, leaving the working files and the shipped board as they are.
BOARD, MODELS, WORK = f'{SRC}/board', f'{SRC}/models', os.environ.get('SANDTABLE_WORK', f'{SRC}/work')
RANGE_MODELS = f'{SRC}/mountains/models'  # Tripo originals stay read-only, outside the shared source/models symlink
ORIGINAL_WORK = os.environ.get('SANDTABLE_ORIGINAL_WORK', f'{SRC}/rebake-work')  # terrain before ranges, for planning/review
BASE_WORK = os.environ.get('SANDTABLE_BASE_WORK', ORIGINAL_WORK)  # original, or the installed range preparation
INSTALLED_WORK = os.environ.get('SANDTABLE_INSTALLED_WORK', f'{SRC}/ranges-installed-work')  # preserved preparation of the installed range board
X0, X1, Z0, Z1 = (97.5 - 111.5) * 0.9, (125 - 111.5) * 0.9, -(43 - 31.5), -(20 - 31.5)
NX, NZ = 276, 231
SEA_Y = 0.14
# Footprint of each piece in world units (its larger side; a crag is sized by height instead, see place_crags).
SIZE = {'city-capital': 1.15, 'city-major': 0.9, 'city-county': 0.68, 'pass': 0.85, 'hamlet': 0.26, 'tree-broad': 0.15,
        'tree-pine': 0.14, 'grove': 0.36, 'crag': 1.3, 'crag-low': 1.2, 'ridge': 2.6, 'boat': 0.22, 'bridge': 0.2,
        'massif': 1.7, 'hill': 0.7, 'range-a': 2.0, 'range-b': 2.0}
# How far each kind of set piece reaches from its centre: it keeps that far off a city's walls (check_sandtable.py too).
REACH = {'massif': 0.6, 'hill': 0.3, 'hamlet': 0.13, 'grove': 0.07, 'tree-broad': 0.07, 'tree-pine': 0.07}
SQUASH = {'crag': 0.7}  # height kept of a piece (the Tripo peak is a steep cone; the mock-up's ranges are broader)
TILE_SPAN = {'meadow': 1.5, 'fields': 1.6, 'forest': 1.2, 'loess': 1.6, 'rock': 0.6}  # world units one tile covers
BUDGET = {'city-capital': 120000, 'city-major': 80000, 'city-county': 50000, 'pass': 60000, 'hamlet': 15000,
          'tree-broad': 2500, 'tree-pine': 2500, 'grove': 8000, 'crag': 20000, 'crag-low': 15000, 'ridge': 40000, 'boat': 6000, 'bridge': 4000,
          'massif': 70000, 'hill': 25000, 'range-a': 70000, 'range-b': 70000}
# What the game draws of each piece (triangles, texture side): thousands of trees are instanced on the board.
GAME = {'city-capital': (24000, 1024), 'city-major': (16000, 1024), 'city-county': (10000, 1024), 'pass': (12000, 1024),
        'hamlet': (1200, 512), 'tree-broad': (240, 256), 'tree-pine': (240, 256), 'grove': (600, 512), 'boat': (500, 256),
        'bridge': (500, 256), 'massif': (8000, 1024), 'hill': (2000, 512), 'range-a': (5600, 1024), 'range-b': (5600, 1024)}
# The lighter mesh on distant tiles keeps the near UV atlas; the game draws it with the near material.
GAME_FAR = {'hamlet': 500, 'tree-broad': 64, 'tree-pine': 64, 'grove': 200, 'massif': 3000, 'hill': 800, 'range-a': 1250, 'range-b': 1250}
RANGE_KINDS = ('range-a', 'range-b')
SOLID_TREES = ('tree-broad', 'tree-pine', 'grove')
# Tree silhouettes, colour-transfer safeguards and review lighting stay together for one-line visual tuning.
CROWN_VOXELS = {'tree-broad': 48, 'tree-pine': 48, 'grove': 64}  # cells across the original footprint
CROWN_VOXEL_RETRIES = (1, 1.35, 1.8, 2.4)
CROWN_SMOOTH = True
CROWN_CLOSE, CROWN_CLOSE_BACK, CROWN_CLOSE_SMOOTH = 2.0, .8, 4  # voxels the surface swells to close the gaps between leaves, the share taken back, smoothing passes
CROWN_FAR_SMOOTH, CROWN_FAR_SMOOTH_PASSES = .2, 1  # ease small folds before reducing the far mesh
CROWN_FAR_FOOTPRINT_PAD = {'tree-broad': (1.07, 1.02), 'tree-pine': (1.02, 1.02), 'grove': (1.02, 1.0)}  # X/Y only, capped at the original bounds
CROWN_JPEG_QUALITY, CROWN_FAR_TEXTURE_SIZE = 85, 4
CROWN_LARGEST_FRACTION, CROWN_TRUNK_TOLERANCE, CROWN_FIT = .97, .1, .9999
CROWN_REDUCE_RATIO, CROWN_UV_MARGIN = .96, .025
CROWN_BAKE_SAMPLES, CROWN_CAGE_VOXELS, CROWN_RAY_VOXELS, CROWN_BAKE_MARGIN = 8, 3, 10, 12
CROWN_MIN_BAKED_CHANNEL, CROWN_MIN_BAKED_FRACTION = .001, .01
CROWN_UPPER_HEIGHT, CROWN_UPPER_NORMAL, CROWN_MIN_LUMINANCE = .28, -.15, .025
CROWN_GREEN_THRESHOLD, CROWN_MIN_GREEN_FRACTION = .006, .4
REVIEW_PITCH, REVIEW_GROUND, REVIEW_WORLD, REVIEW_SKY_STRENGTH, REVIEW_SUN = 52, (.055, .095, .035, 1), (.55, .62, .52, 1), .65, 2.2
REVIEW_SUN_DIRECTION, REVIEW_SAMPLES, REVIEW_GAP = (-.45, .3, -1), 32, 1.45
REVIEW_PATCH_SPACING, REVIEW_PATCH_JITTER, REVIEW_PATCH_SPAN = .19, .025, 25
RANGE_REVIEW_PITCH, RANGE_REVIEW_GAP, RANGE_REVIEW_SPAN = 52, 1.5, 6.7  # source / render cache / near / far
RANGE_REVIEW_SAMPLES, RANGE_JPEG_QUALITY = 16, 90
RANGE_WELD_DISTANCE, RANGE_FLAP_AREA, RANGE_MAX_FLAPS = 1e-7, 1e-5, 8  # repair only tiny dangling source faces
RANGE_FAR_SMOOTH, RANGE_FAR_SMOOTH_PASSES = .08, 1  # ease folds before far reduction without flattening the crest
RANGE_SNOWLESS_LAT = 90  # snow-lat 99 must show the prepared paint without any snow node mix
DEST = os.environ.get('SANDTABLE_DEST', f'{MVP}/assets/ai/sandtable/board')
YAW = {'pass': -90}   # Tripo turned the pass's gate to its side; every piece faces south (the game camera) with its gate
TIER = {'capital': 'city-capital', 'major': 'city-major', 'county': 'city-county', 'pass': 'pass'}

arg = lambda k, d: sys.argv[sys.argv.index(k) + 1] if k in sys.argv else d
# A cached piece is normalised to its SIZE, so the file name carries everything that shapes it: change a size and it is rebuilt.
def cache_file(name):
    # Changing a range's measured footprint or reduction rules must not silently reuse an older mesh.
    attrs = [SIZE[name], YAW.get(name), SQUASH.get(name), BUDGET[name]]
    if name in RANGE_KINDS:
        for path in (__file__, f'{TOOLS}/sandtable_ranges.py'):
            with open(path, 'rb') as f: attrs.append(hashlib.sha256(f.read()).hexdigest())
    key = hashlib.md5(json.dumps(attrs).encode()).hexdigest()[:8]
    return f'{WORK}/cache/{name}.{key}.blend'


def range_surface(ob, weld=False):
    """Weld UV seams while preserving loop UVs, repair tiny base flaps and require an oriented closed surface."""
    import bmesh, bpy
    bm = bmesh.new(); bm.from_mesh(ob.data)
    if weld:
        before = len(bm.verts)
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=RANGE_WELD_DISTANCE)
        print(f'{ob.name}: welded {before-len(bm.verts)} coincident seam vertices', flush=True)
        # range-b has one almost-zero-area triangle attached to an otherwise closed bottom edge.
        # Delete only that kind of dangling flap; never fill or remesh away the painted mountain details.
        span = max(max(v.co[i] for v in bm.verts)-min(v.co[i] for v in bm.verts) for i in range(3))
        flaps = {f for e in bm.edges if len(e.link_faces) > 2 for f in e.link_faces
                 if sum(len(edge.link_faces) == 1 for edge in f.edges) >= 2 and f.calc_area() < RANGE_FLAP_AREA*span*span}
        if len(flaps) > RANGE_MAX_FLAPS: bm.free(); raise ValueError(f'{ob.name}: too many source flaps to repair safely')
        if flaps:
            bmesh.ops.delete(bm, geom=list(flaps), context='FACES_ONLY')
            loose = [e for e in bm.edges if not e.link_faces]
            if loose: bmesh.ops.delete(bm, geom=loose, context='EDGES')
            print(f'{ob.name}: removed {len(flaps)} tiny dangling base faces', flush=True)
    bad_edges = sum(len(e.link_faces) != 2 for e in bm.edges)
    bad_verts = sum(not v.is_manifold for v in bm.verts if v.link_edges)
    if bad_edges or bad_verts:
        bm.free(); raise ValueError(f'{ob.name}: non-closed surface after weld/reduction: {bad_edges} edges, {bad_verts} vertices')
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces)); bm.to_mesh(ob.data); bm.free(); ob.data.update()
    for face in ob.data.polygons: face.use_smooth = True
    if ob.data.has_custom_normals:
        # Imported glTF split normals refer to the pre-weld faces and can leave black creases after Decimate.
        bpy.context.view_layer.objects.active = ob; ob.select_set(True)
        bpy.ops.mesh.customdata_custom_splitnormals_clear()


# ------------------------------------------------------------------ python3 side: the sculpted board, placement, colour
F = 3                                   # the board is re-cut at 3× the game's heightfield
FX, FZ = (NX - 1) * F + 1, (NZ - 1) * F + 1
DX, DZ = 0.09 / F, 0.1 / F
ROAD_PAINT_NARROW = 0.9                # packed earth, on the same centre line as the game
ROAD_PAINT_COLOR = (0.58, 0.46, 0.29, 1)
ROAD_BEND, ROAD_BEND_LENGTH = 0.5, (1.0, 4.0)  # long courses get wider S-bends, in world units
ROAD_BEND_WAVE, ROAD_BEND_RELIEF, ROAD_BEND_FOREST = 0.85, 0.6, 0.35
ROAD_RELIEF_RESPONSE, ROAD_SMOOTH_SAMPLES = 2, 15
ROAD_CITY_GATE, ROAD_WATER_GATE, ROAD_KEEP_FEATHER = (0.0, 0.35), (0.05, 0.5), 0.5
ROAD_MASK_PAD, ROAD_MASK_SS, ROAD_MASK_MIN_ALPHA = 0.035, 4, 128  # nonzero alpha keeps the RGB vegetation data through browser decoding
PAD_MARGIN = {'capital': 0.19, 'major': 0.14, 'county': 0.10, 'pass': 0.10}
PAD_EDGE, PAD_NOISE, PAD_COLOR, PAD_TEXTURE, PAD_MASK_POWER = 0.24, 0.18, (0.49, 0.43, 0.34, 1), 0.48, 4
PAD_SIZE_FACTOR, PAD_RIM_DARK, PAD_RIM_RANGE = 0.9, 0.78, (0.15, 0.9)
FIELD_INNER, FIELD_OUTER = 0.35, 0.72  # beyond the wall, neighbouring cities leave open meadow between their fields
FIELD_STRENGTH, FIELD_PATCH_FLOOR, FIELD_PATCH_RANGE = 0.85, 0.55, (0.38, 0.58)
FIELD_FOREST_RANGE = (0.35, 0.75)
FIELD_OLD_BLUR, FIELD_ERASE_RANGE, FIELD_KEEP_RANGE = 18, (0.1, 0.5), (0.05, 0.25)  # soften source plots that the new field mask removes
MEADOW_GAP_STRENGTH, MEADOW_GAP_RANGE = 0.9, (.05, .35)  # mend small clearings in existing vegetation, not the desert
MEADOW_TONE_SCALE, MEADOW_TONE_DETAIL, MEADOW_TONE_RANGE, MEADOW_TONE_VALUE = 0.35, 2, (0.25, 0.75), (0.88, 1.08)  # broad variations in the existing meadow tile
WOOD_NEW_STAND_STRENGTH, WOOD_FIELD_PRIORITY = 0.95, (0.2, 0.7)
WOOD_STAND_RADIUS = 0.49                # just below the game's 0.5 LOD cutoff, including rounded export coordinates
WOOD_FLOOR_RADIUS, WOOD_FLOOR_STRENGTH, WOOD_FLOOR_SS = 0.72, 0.8, 2  # no forest paint beyond the crowns
WOOD_PINE_LAT, WOOD_PINE_HEIGHT = (27.5, 35.5), (0.5, 1.0)
WOOD_PINE_BASE, WOOD_PINE_NORTH, WOOD_PINE_UPLAND, WOOD_PINE_MAX = 0.035, 0.44, 0.5, 0.48
# The range planner owns an independent random stream; per-piece export targets adapt to the final count so the
# whole board stays within 400k near / 100k far triangles. Both variants keep a 1024² painted colour image.
SKY_FLOOR = 72                          # least sky light kept on the ground (8-bit, of the bake's stored √(L/2))
SIGHT = 0.7                             # ground south of a city stays under this slope (tan of the camera's low tilt)


def smooth(a, lo, hi):
    import numpy as np
    t = np.clip((a - lo) / (hi - lo), 0, 1)
    return t * t * (3 - 2 * t)


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
                  *tuple(f'tile-{n}.png' for n in (*TILE_SPAN, 'frame')), 'ranges.json',
                  *(f'{n}-{suffix}.png' for n in RANGE_KINDS for suffix in ('paint', 'game')))


def file_hash(path):
    with open(path, 'rb') as f: return hashlib.sha256(f.read()).hexdigest()


def prepared_manifest(write=False):
    path = f'{WORK}/prepared.json'
    files = (*PREPARED_FILES, 'keep-base.json') if '--keep' in sys.argv else PREPARED_FILES
    missing = [f for f in files if not os.path.isfile(f'{WORK}/{f}')]
    if not write and not os.path.isfile(path): missing.append('prepared.json')
    if missing: raise FileNotFoundError(f"Missing {', '.join(missing)} in {WORK}; set SANDTABLE_WORK to the reviewed preparation or rerun the preview.")
    for n in RANGE_KINDS:
        if not os.path.isfile(f'{RANGE_MODELS}/{n}.glb'):
            raise FileNotFoundError(f'Missing Tripo original {RANGE_MODELS}/{n}.glb; restore it before baking.')
    checks = {'script': file_hash(__file__), 'ranges': file_hash(f'{TOOLS}/sandtable_ranges.py'),
              'models': {n: file_hash(f'{RANGE_MODELS}/{n}.glb') for n in RANGE_KINDS}, 'keep': arg('--keep', None),
              'files': {f: file_hash(f'{WORK}/{f}') for f in files}}
    if write:
        with open(path, 'w') as f: json.dump(checks, f, indent=2)
    else:
        with open(path) as f: old = json.load(f)
        if old != checks: raise ValueError('prepared layout or script changed since preview; rerun the preview before --prepared')
        print('using verified preview layout', WORK, flush=True)


# The accepted layout is the input, not a seed for rebuilding cities, roads or the vegetation random stream.
def prepare():
    sys.path.insert(0, TOOLS)
    import sandtable_ranges
    sandtable_ranges.prepare(globals())


# ------------------------------------------------------------------ Blender side
def blender():
    import bpy, mathutils
    import numpy as np
    b = json.load(open(f'{BOARD}/board.json')); pj = json.load(open(f'{WORK}/place.json')); place = pj['place']
    b['roads'], b['water'], b['cities'] = pj['roads'], pj['water'], pj['cities']   # laid over the sculpted board
    out = arg('--out', f'{SRC}/renders')
    os.makedirs(out, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    B = lambda x, y, z: (x, -z, y)          # game (x east, y up, z south) → Blender (x east, y north, z up)

    def node(nt, kind, **kw):
        n = nt.nodes.new(kind)
        for k, v in kw.items():
            if k in n.inputs: n.inputs[k].default_value = v
            else: setattr(n, k, v)
        return n
    def link(nt, a, b): nt.links.new(a, b)
    def mat(name):
        m = bpy.data.materials.new(name)
        return m, m.node_tree, m.node_tree.nodes['Principled BSDF']

    def mesh(name, v, i, uv=None, m=None, narrow=1.0):
        me = bpy.data.meshes.new(name)
        vs = [B(v[k], v[k + 1], v[k + 2]) for k in range(0, len(v), 3)]
        if narrow != 1.0:  # a ribbon: vertices in (left, right) pairs across it, pulled toward their middle
            for k in range(0, len(vs) - 1, 2):
                a_, b_ = vs[k], vs[k + 1]; m_ = [(p + q) / 2 for p, q in zip(a_, b_)]
                vs[k] = tuple(mm + (p - mm) * narrow for p, mm in zip(a_, m_)); vs[k + 1] = tuple(mm + (q - mm) * narrow for q, mm in zip(b_, m_))
        fs = [(i[k], i[k + 2], i[k + 1]) for k in range(0, len(i), 3)]  # y↔z swap flips the winding
        me.from_pydata(vs, [], fs)
        if uv:
            lay = me.uv_layers.new(name='UVMap')
            for p in me.polygons:
                for li in p.loop_indices:
                    vi = me.loops[li].vertex_index; lay.data[li].uv = (uv[vi * 2], uv[vi * 2 + 1])
        for p in me.polygons: p.use_smooth = True
        ob = bpy.data.objects.new(name, me); sc.collection.objects.link(ob)
        if m: me.materials.append(m)
        return ob

    # ---- Ground: painted tiles laid in world space, mixed by the game's vegetation mask ----
    # meadow where the mask says grass, forest floor, patchwork fields, dry loess where it says none of them (rock,
    # sand, plateau); cliff rock projected from the side on the steep faces; the game's own colour over it all as a
    # broad tint, so the geography (loess, plateau, the green south) still reads.
    gm, nt, bs = mat('ground')
    crd = node(nt, 'ShaderNodeTexCoord')
    def tile(n, box=False, sat=1.0, val=1.0):
        mp = node(nt, 'ShaderNodeMapping', **{'Scale': (1 / TILE_SPAN[n],) * 3}); link(nt, crd.outputs['Object'], mp.inputs['Vector'])
        t = node(nt, 'ShaderNodeTexImage'); t.image = bpy.data.images.load(f'{WORK}/tile-{n}.png') if os.path.exists(f'{WORK}/tile-{n}.png') else None
        if box: t.projection = 'BOX'; t.projection_blend = 0.25
        link(nt, mp.outputs[0], t.inputs['Vector'])
        if sat == 1.0 and val == 1.0: return t.outputs['Color']
        hs = node(nt, 'ShaderNodeHueSaturation', **{'Saturation': sat, 'Value': val}); link(nt, t.outputs['Color'], hs.inputs['Color'])
        return hs.outputs['Color']
    def mixc(fac, a, b_, blend='MIX'):
        m = node(nt, 'ShaderNodeMix', data_type='RGBA', blend_type=blend)
        if isinstance(fac, float): m.inputs['Factor'].default_value = fac
        else: link(nt, fac, m.inputs['Factor'])
        link(nt, a, m.inputs[6]); link(nt, b_, m.inputs[7]); return m.outputs[2]
    def ramp(v, lo, hi):
        m = node(nt, 'ShaderNodeMapRange', **{'From Min': lo, 'From Max': hi}); link(nt, v, m.inputs['Value']); return m.outputs['Result']
    mk = node(nt, 'ShaderNodeTexImage'); mk.image = bpy.data.images.load(f'{WORK}/mask.png'); mk.image.colorspace_settings.name = 'Non-Color'
    rgb = node(nt, 'ShaderNodeSeparateColor'); link(nt, mk.outputs['Color'], rgb.inputs['Color'])
    loess = tile('loess', sat=0.75)
    meadow_noise = node(nt, 'ShaderNodeTexNoise', **{'Scale': MEADOW_TONE_SCALE, 'Detail': MEADOW_TONE_DETAIL}); link(nt, crd.outputs['Object'], meadow_noise.inputs['Vector'])
    meadow_range = node(nt, 'ShaderNodeMapRange', **{'From Min': MEADOW_TONE_RANGE[0], 'From Max': MEADOW_TONE_RANGE[1], 'To Min': MEADOW_TONE_VALUE[0], 'To Max': MEADOW_TONE_VALUE[1]})
    link(nt, meadow_noise.outputs['Fac'], meadow_range.inputs['Value'])
    meadow = mixc(1.0, tile('meadow', sat=0.68, val=0.92), meadow_range.outputs['Result'], 'MULTIPLY')
    col = mixc(ramp(rgb.outputs['Red'], 0.15, 0.6), loess, meadow)
    col = mixc(ramp(rgb.outputs['Green'], 0.2, 0.6), col, tile('forest', sat=0.75, val=1.15))
    col = mixc(ramp(rgb.outputs['Blue'], 0.2, 0.55), col, tile('fields', sat=0.75))
    paint = node(nt, 'ShaderNodeTexImage'); paint.image = bpy.data.images.load(f'{WORK}/ground-paint.png'); paint.interpolation = 'Cubic'
    col = mixc(float(arg('--tint', 0.45)), col, paint.outputs['Color'], 'OVERLAY')
    geo = node(nt, 'ShaderNodeNewGeometry'); sep = node(nt, 'ShaderNodeSeparateXYZ'); link(nt, geo.outputs['Normal'], sep.inputs[0])
    steep = ramp(sep.outputs['Z'], 0.8, 0.6); rock = tile('rock', box=True, sat=0.7, val=1.0)
    col = mixc(steep, col, rock)
    bk = node(nt, 'ShaderNodeTexImage'); bk.image = bpy.data.images.load(f'{WORK}/bank.png'); bk.image.colorspace_settings.name = 'Non-Color'
    bsep = node(nt, 'ShaderNodeSeparateColor'); link(nt, bk.outputs['Color'], bsep.inputs['Color'])
    peb = node(nt, 'ShaderNodeTexVoronoi', **{'Scale': 90.0}); link(nt, crd.outputs['Object'], peb.inputs['Vector'])
    pr_ = node(nt, 'ShaderNodeValToRGB'); link(nt, peb.outputs['Distance'], pr_.inputs['Fac'])
    pr_.color_ramp.elements[0].color = (0.55, 0.47, 0.35, 1); pr_.color_ramp.elements[1].position = 0.6; pr_.color_ramp.elements[1].color = (0.24, 0.22, 0.14, 1)
    col = mixc(bsep.outputs['Red'], col, pr_.outputs['Color'])
    sand = node(nt, 'ShaderNodeRGB'); sand.outputs[0].default_value = (0.66, 0.55, 0.38, 1)
    col = mixc(bsep.outputs['Green'], col, sand.outputs[0])
    if os.path.exists(f'{WORK}/pads.png'):
        pad = node(nt, 'ShaderNodeTexImage'); pad.image = bpy.data.images.load(f'{WORK}/pads.png'); pad.image.colorspace_settings.name = 'Non-Color'
        stone = node(nt, 'ShaderNodeRGB'); stone.outputs[0].default_value = PAD_COLOR
        rim = node(nt, 'ShaderNodeMapRange', **{'From Min': PAD_RIM_RANGE[0], 'From Max': PAD_RIM_RANGE[1], 'To Min': PAD_RIM_DARK, 'To Max': 1.0})
        link(nt, pad.outputs['Color'], rim.inputs['Value'])
        paving = mixc(1.0, mixc(PAD_TEXTURE, stone.outputs[0], loess, 'MULTIPLY'), rim.outputs['Result'], 'MULTIPLY')
        col = mixc(pad.outputs['Color'], col, paving)
    else: print('no pads.png; run prepare to preview the current pad layout')
    # Snow as the game lays it (seasons.js s_snow): north of the month's snow line, reached sooner on high ground,
    # ragged; steep faces hold less. 正月's line is 38.2°N.
    pos = node(nt, 'ShaderNodeSeparateXYZ'); link(nt, crd.outputs['Object'], pos.inputs[0])
    h0 = node(nt, 'ShaderNodeAttribute', attribute_name='h0')   # the game's own height, before the sculpting
    hgt = node(nt, 'ShaderNodeMath', operation='MULTIPLY_ADD', **{}); link(nt, h0.outputs['Fac'], hgt.inputs[0]); hgt.inputs[1].default_value = 2.6; hgt.inputs[2].default_value = -0.3 * 2.6
    hg = node(nt, 'ShaderNodeMath', operation='MAXIMUM'); link(nt, hgt.outputs[0], hg.inputs[0]); hg.inputs[1].default_value = 0
    rag = node(nt, 'ShaderNodeTexNoise', **{'Scale': 1.2, 'Detail': 5.0}); link(nt, crd.outputs['Object'], rag.inputs['Vector'])
    rg = node(nt, 'ShaderNodeMath', operation='MULTIPLY_ADD'); link(nt, rag.outputs['Fac'], rg.inputs[0]); rg.inputs[1].default_value = 1.5; rg.inputs[2].default_value = -0.75 + 31.5
    lat = node(nt, 'ShaderNodeMath', operation='ADD'); link(nt, pos.outputs['Y'], lat.inputs[0]); link(nt, rg.outputs[0], lat.inputs[1])
    la = node(nt, 'ShaderNodeMath', operation='ADD'); link(nt, lat.outputs[0], la.inputs[0]); link(nt, hg.outputs[0], la.inputs[1])
    sl = float(arg('--snow-lat', 99 if '--bake' in sys.argv else 38.2))
    snow = node(nt, 'ShaderNodeMapRange', interpolation_type='SMOOTHSTEP', **{'From Min': sl - 0.45, 'From Max': sl + 0.45}); link(nt, la.outputs[0], snow.inputs['Value'])
    flat = ramp(sep.outputs['Z'], 0.3, 0.65)   # cliffs hold less, but the peaks keep their caps
    sn = node(nt, 'ShaderNodeMath', operation='MULTIPLY'); link(nt, snow.outputs['Result'], sn.inputs[0]); link(nt, flat, sn.inputs[1])
    patch = node(nt, 'ShaderNodeTexNoise', **{'Scale': 14.0, 'Detail': 8.0, 'Roughness': 0.7}); link(nt, crd.outputs['Object'], patch.inputs['Vector'])
    pr = node(nt, 'ShaderNodeValToRGB'); link(nt, patch.outputs['Fac'], pr.inputs['Fac'])
    pr.color_ramp.elements[0].position = 0.3; pr.color_ramp.elements[0].color = (0.5, 0.56, 0.66, 1)   # shaded, bluish
    pr.color_ramp.elements[1].position = 0.7; pr.color_ramp.elements[1].color = (0.84, 0.85, 0.88, 1)
    # Up high the snow lies thick; on the plains it is a dusting in drifts, the earth and the fields showing through.
    thin = node(nt, 'ShaderNodeMapRange', **{'From Min': 0.3, 'From Max': 0.5, 'To Min': 0.55, 'To Max': 1.0}); link(nt, patch.outputs['Fac'], thin.inputs['Value'])
    drift = node(nt, 'ShaderNodeTexNoise', **{'Scale': 1.4, 'Detail': 4.0, 'Roughness': 0.5}); link(nt, crd.outputs['Object'], drift.inputs['Vector'])
    dm = node(nt, 'ShaderNodeMath', operation='MULTIPLY_ADD'); link(nt, drift.outputs['Fac'], dm.inputs[0]); dm.inputs[1].default_value = 1.0; dm.inputs[2].default_value = 0.3
    low = node(nt, 'ShaderNodeMapRange', interpolation_type='SMOOTHSTEP', **{'From Min': 0.55, 'From Max': 1.0, 'To Min': 0.55, 'To Max': 0.95}); link(nt, dm.outputs[0], low.inputs['Value'])
    high = node(nt, 'ShaderNodeMapRange', interpolation_type='SMOOTHSTEP', **{'From Min': 0.6, 'From Max': 1.3}); link(nt, h0.outputs['Fac'], high.inputs['Value'])
    cov = node(nt, 'ShaderNodeMix', data_type='FLOAT'); link(nt, high.outputs['Result'], cov.inputs['Factor']); link(nt, low.outputs['Result'], cov.inputs[2]); link(nt, thin.outputs['Result'], cov.inputs[3])
    sf = node(nt, 'ShaderNodeMath', operation='MULTIPLY'); link(nt, sn.outputs[0], sf.inputs[0]); link(nt, cov.outputs[0], sf.inputs[1])
    grit = node(nt, 'ShaderNodeTexNoise', **{'Scale': 26.0, 'Detail': 5.0, 'Roughness': 0.65}); link(nt, crd.outputs['Object'], grit.inputs['Vector'])
    gr = node(nt, 'ShaderNodeMapRange', **{'From Min': 0.56, 'From Max': 0.66, 'To Min': 1.0, 'To Max': 0.25}); link(nt, grit.outputs['Fac'], gr.inputs['Value'])
    sfg = node(nt, 'ShaderNodeMath', operation='MULTIPLY'); link(nt, sf.outputs[0], sfg.inputs[0]); link(nt, gr.outputs['Result'], sfg.inputs[1])
    col = mixc(sfg.outputs[0], col, pr.outputs['Color'])
    link(nt, col, bs.inputs['Base Color'])
    grain = node(nt, 'ShaderNodeTexNoise', **{'Scale': 140.0, 'Detail': 6.0, 'Roughness': 0.6})
    # Relief in the paint: the rock's strata on the cliffs, soft drifts in the snow, a clay grain everywhere.
    rbw = node(nt, 'ShaderNodeRGBToBW'); link(nt, rock, rbw.inputs['Color'])
    rh = node(nt, 'ShaderNodeMath', operation='MULTIPLY'); link(nt, rbw.outputs['Val'], rh.inputs[0]); link(nt, steep, rh.inputs[1])
    sh_ = node(nt, 'ShaderNodeMath', operation='MULTIPLY'); link(nt, patch.outputs['Fac'], sh_.inputs[0]); link(nt, sf.outputs[0], sh_.inputs[1])
    hsum = node(nt, 'ShaderNodeMath', operation='MULTIPLY_ADD'); link(nt, grain.outputs['Fac'], hsum.inputs[0]); hsum.inputs[1].default_value = 0.25; link(nt, rh.outputs[0], hsum.inputs[2])
    hsum2 = node(nt, 'ShaderNodeMath', operation='MULTIPLY_ADD'); link(nt, sh_.outputs[0], hsum2.inputs[0]); hsum2.inputs[1].default_value = 1.4; link(nt, hsum.outputs[0], hsum2.inputs[2])
    bump = node(nt, 'ShaderNodeBump', **{'Strength': 0.55, 'Distance': 0.03}); link(nt, hsum2.outputs[0], bump.inputs['Height'])
    bs.inputs['Roughness'].default_value = 0.88; link(nt, bump.outputs['Normal'], bs.inputs['Normal'])
    gd = np.load(f'{WORK}/ground.npz'); jj, kk = np.mgrid[0:FZ, 0:FX]
    co = np.stack([X0 + kk * DX, -(Z0 + jj * DZ), gd['G']], -1).astype(np.float32).ravel()
    q = (jj[:-1, :-1] * FX + kk[:-1, :-1]).ravel(); quads = np.stack([q, q + FX, q + FX + 1, q + 1], -1).ravel()
    me = bpy.data.meshes.new('ground'); me.vertices.add(FX * FZ); me.vertices.foreach_set('co', co)
    me.loops.add(len(quads)); me.loops.foreach_set('vertex_index', quads)
    me.polygons.add(len(q)); me.polygons.foreach_set('loop_start', np.arange(0, len(quads), 4))
    me.update(); me.validate()
    uv = np.stack([kk / (FX - 1), 1 - jj / (FZ - 1)], -1).reshape(-1, 2).astype(np.float32)
    me.uv_layers.new(name='UVMap').data.foreach_set('uv', uv[quads].ravel())
    me.attributes.new('h0', 'FLOAT', 'POINT').data.foreach_set('value', gd['H0'].ravel())
    me.polygons.foreach_set('use_smooth', np.ones(len(q), dtype=bool)); me.materials.append(gm)
    ground = bpy.data.objects.new('ground', me); sc.collection.objects.link(ground)

    # ---- Water: deep painted blue under a varnish, pale crests for the waves; the sea greener over the shallows
    # and foaming at the shore (work/sea.png, from the board) ----
    def water(name, base, light, coast=False):
        m, nt, bs = mat(name)
        crd = node(nt, 'ShaderNodeNewGeometry')
        wp = crd.outputs['Position']   # world space: the sea plane's own coordinates are its unit square
        mp = node(nt, 'ShaderNodeMapping', **{'Scale': (1.0, 2.6, 1.0)}); link(nt, wp, mp.inputs['Vector'])
        n = node(nt, 'ShaderNodeTexNoise', **{'Scale': 7.0, 'Detail': 5.0}); link(nt, mp.outputs[0], n.inputs['Vector'])
        r = node(nt, 'ShaderNodeValToRGB'); link(nt, n.outputs['Fac'], r.inputs['Fac'])
        r.color_ramp.elements[0].color = base; r.color_ramp.elements[1].color = light
        c_ = r.outputs['Color']
        if coast:
            st = node(nt, 'ShaderNodeTexImage'); st.image = bpy.data.images.load(f'{WORK}/sea.png'); st.image.colorspace_settings.name = 'Non-Color'
            sp = node(nt, 'ShaderNodeSeparateColor'); link(nt, st.outputs['Color'], sp.inputs['Color'])
            sh = node(nt, 'ShaderNodeMix', data_type='RGBA'); link(nt, sp.outputs['Red'], sh.inputs['Factor'])
            link(nt, c_, sh.inputs[6]); sh.inputs[7].default_value = (0.025, 0.15, 0.24, 1); c_ = sh.outputs[2]
            fo = node(nt, 'ShaderNodeMix', data_type='RGBA'); link(nt, sp.outputs['Green'], fo.inputs['Factor'])
            link(nt, c_, fo.inputs[6]); fo.inputs[7].default_value = (0.42, 0.5, 0.5, 1); c_ = fo.outputs[2]
        # Wave crests: short pale strokes, gathered in bands (the mock-up's painted chop).
        cm = node(nt, 'ShaderNodeMapping', **{'Scale': (5.0, 16.0, 1.0)}); link(nt, wp, cm.inputs['Vector'])
        vo = node(nt, 'ShaderNodeTexVoronoi', **{'Scale': 1.0, 'Randomness': 0.9}); link(nt, cm.outputs[0], vo.inputs['Vector'])
        fl = node(nt, 'ShaderNodeMapRange', **{'From Min': 0.16, 'From Max': 0.06}); link(nt, vo.outputs['Distance'], fl.inputs['Value'])
        band = node(nt, 'ShaderNodeTexNoise', **{'Scale': 0.8, 'Detail': 3.0}); link(nt, wp, band.inputs['Vector'])
        bm = node(nt, 'ShaderNodeMapRange', **{'From Min': 0.42, 'From Max': 0.62, 'To Max': 0.55}); link(nt, band.outputs['Fac'], bm.inputs['Value'])
        cr = node(nt, 'ShaderNodeMath', operation='MULTIPLY'); link(nt, fl.outputs['Result'], cr.inputs[0]); link(nt, bm.outputs['Result'], cr.inputs[1])
        mx = node(nt, 'ShaderNodeMix', data_type='RGBA'); link(nt, cr.outputs[0], mx.inputs['Factor'])
        link(nt, c_, mx.inputs[6]); mx.inputs[7].default_value = (0.6, 0.72, 0.8, 1)
        link(nt, mx.outputs[2], bs.inputs['Base Color'])
        bs.inputs['Roughness'].default_value = 0.3; bs.inputs['Coat Weight'].default_value = 1.0; bs.inputs['Coat Roughness'].default_value = 0.05
        wb = node(nt, 'ShaderNodeBump', **{'Strength': 0.3, 'Distance': 0.01}); link(nt, n.outputs['Fac'], wb.inputs['Height'])
        cb = node(nt, 'ShaderNodeBump', **{'Strength': 0.25, 'Distance': 0.004}); link(nt, cr.outputs[0], cb.inputs['Height']); link(nt, wb.outputs['Normal'], cb.inputs['Normal'])
        link(nt, cb.outputs['Normal'], bs.inputs['Normal'])
        return m
    sea_m = water('sea', (0.004, 0.024, 0.1, 1), (0.016, 0.085, 0.24, 1), coast=True)
    lake_m = water('lake', (0.015, 0.08, 0.24, 1), (0.05, 0.22, 0.46, 1))
    # Rivers: deep in the channel, paler over the shallows at the banks, white streaks running with the flow
    # (uv: u along the ribbon, v across it).
    river_m, nt, bs = mat('river')
    tc = node(nt, 'ShaderNodeTexCoord'); su = node(nt, 'ShaderNodeSeparateXYZ'); link(nt, tc.outputs['UV'], su.inputs[0])
    ac = node(nt, 'ShaderNodeMath', operation='PINGPONG'); link(nt, su.outputs['Y'], ac.inputs[0]); ac.inputs[1].default_value = 0.5
    dep = node(nt, 'ShaderNodeValToRGB'); link(nt, ac.outputs[0], dep.inputs['Fac'])
    dep.color_ramp.elements[0].color = (0.12, 0.4, 0.5, 1); dep.color_ramp.elements[1].position = 0.32; dep.color_ramp.elements[1].color = (0.015, 0.09, 0.27, 1)
    sm = node(nt, 'ShaderNodeMapping', **{'Scale': (1.5, 14.0, 1.0)}); link(nt, tc.outputs['UV'], sm.inputs['Vector'])
    st_ = node(nt, 'ShaderNodeTexNoise', **{'Scale': 3.0, 'Detail': 6.0, 'Roughness': 0.6}); link(nt, sm.outputs[0], st_.inputs['Vector'])
    sk = node(nt, 'ShaderNodeMapRange', **{'From Min': 0.6, 'From Max': 0.75, 'To Max': 0.7}); link(nt, st_.outputs['Fac'], sk.inputs['Value'])
    rmx = node(nt, 'ShaderNodeMix', data_type='RGBA'); link(nt, sk.outputs['Result'], rmx.inputs['Factor'])
    link(nt, dep.outputs['Color'], rmx.inputs[6]); rmx.inputs[7].default_value = (0.7, 0.8, 0.85, 1)
    link(nt, rmx.outputs[2], bs.inputs['Base Color'])
    bs.inputs['Roughness'].default_value = 0.25; bs.inputs['Coat Weight'].default_value = 1.0; bs.inputs['Coat Roughness'].default_value = 0.05
    rb = node(nt, 'ShaderNodeBump', **{'Strength': 0.3, 'Distance': 0.004}); link(nt, st_.outputs['Fac'], rb.inputs['Height']); link(nt, rb.outputs['Normal'], bs.inputs['Normal'])
    for w in b['water']:
        if w['kind'] == 'river':
            n_ = len(w['v']) // 3; uvs = []
            for k in range(n_): uvs += [k // 2 * 0.12, k % 2]
            mesh('river', w['v'], w['i'], uvs, river_m).location.z += 0.002
        elif w['kind'] != 'sea': mesh(w['kind'], w['v'], w['i'], None, lake_m).location.z += 0.002
    bpy.ops.mesh.primitive_plane_add(size=1, location=((X0 + X1) / 2, -(Z0 + Z1) / 2, SEA_Y))
    sea = bpy.context.object; sea.scale = (X1 - X0, Z1 - Z0, 1); sea.data.materials.append(sea_m)
    # The board's slab under the sea, so the frame closes on something.
    bpy.ops.mesh.primitive_cube_add(location=((X0 + X1) / 2, -(Z0 + Z1) / 2, -0.8)); slab = bpy.context.object
    slab.scale = ((X1 - X0) / 2, (Z1 - Z0) / 2, 0.8 + SEA_Y - 0.25)
    sm_, nt, bs = mat('seabed'); bs.inputs['Base Color'].default_value = (0.03, 0.08, 0.16, 1); slab.data.materials.append(sm_)

    # ---- Roads: trodden earth ----
    rm, nt, bs = mat('road'); bs.inputs['Base Color'].default_value = ROAD_PAINT_COLOR; bs.inputs['Roughness'].default_value = 0.95
    for r in b['roads']:
        ob = mesh('road', r['v'], r['i'], None, rm, narrow=ROAD_PAINT_NARROW); ob.location.z += 0.002

    # ---- Frame: dark lacquered wood carved with gilt cloud scrolls and key-fret (tiles/frame.png, run along each
    # side); the table under it and the room round it dark, lit only by the lamp ----
    wm, nt, bs = mat('lacquer')
    wn = node(nt, 'ShaderNodeTexWave', **{'Scale': 1.2, 'Distortion': 6.0, 'Detail': 4.0}); wr = node(nt, 'ShaderNodeValToRGB'); link(nt, wn.outputs['Fac'], wr.inputs['Fac'])
    wr.color_ramp.elements[0].color = (0.035, 0.014, 0.008, 1); wr.color_ramp.elements[1].color = (0.08, 0.032, 0.016, 1)
    link(nt, wr.outputs['Color'], bs.inputs['Base Color']); bs.inputs['Roughness'].default_value = 0.35; bs.inputs['Coat Weight'].default_value = 0.6
    fm, nt, bs = mat('carving')
    ft = node(nt, 'ShaderNodeTexImage'); ft.image = bpy.data.images.load(f'{WORK}/tile-frame.png'); ft.interpolation = 'Cubic'
    link(nt, ft.outputs['Color'], bs.inputs['Base Color'])
    bw = node(nt, 'ShaderNodeRGBToBW'); link(nt, ft.outputs['Color'], bw.inputs['Color'])
    gilt = node(nt, 'ShaderNodeMapRange', **{'From Min': 0.22, 'From Max': 0.42, 'To Max': 0.8}); link(nt, bw.outputs['Val'], gilt.inputs['Value'])
    link(nt, gilt.outputs['Result'], bs.inputs['Metallic'])
    rgh = node(nt, 'ShaderNodeMapRange', **{'From Min': 0.22, 'From Max': 0.42, 'To Min': 0.55, 'To Max': 0.32}); link(nt, bw.outputs['Val'], rgh.inputs['Value'])
    link(nt, rgh.outputs['Result'], bs.inputs['Roughness'])
    fb = node(nt, 'ShaderNodeBump', **{'Strength': 0.8, 'Distance': 0.03}); link(nt, bw.outputs['Val'], fb.inputs['Height']); link(nt, fb.outputs['Normal'], bs.inputs['Normal'])
    W_, top = 1.5, SEA_Y + 0.36
    cx, cy, hw, hh = (X0 + X1) / 2, -(Z0 + Z1) / 2, (X1 - X0) / 2, (Z1 - Z0) / 2
    for (x, y, sx, sy) in [(cx, cy + hh + W_ / 2, hw + W_, W_ / 2), (cx, cy - hh - W_ / 2, hw + W_, W_ / 2), (cx - hw - W_ / 2, cy, W_ / 2, hh), (cx + hw + W_ / 2, cy, W_ / 2, hh)]:
        bpy.ops.mesh.primitive_cube_add(location=(x, y, (top - 2.0) / 2)); f = bpy.context.object
        f.scale = (sx, sy, (top + 2.0) / 2); bpy.ops.object.transform_apply(scale=True)
        f.data.materials.append(wm); f.data.materials.append(fm)
        along = 0 if sx > sy else 1
        lay = f.data.uv_layers.active
        for p_ in f.data.polygons:
            up = p_.normal.z > 0.5; p_.material_index = 1 if up else 0
            for li in p_.loop_indices:
                co_ = f.data.vertices[f.data.loops[li].vertex_index].co
                a_, c_ = (co_.x, co_.y) if along == 0 else (co_.y, co_.x)
                lay.data[li].uv = (a_ / W_, (c_ + W_ / 2) / W_) if up else (a_ / W_, co_.z / W_)
        bv = f.modifiers.new('bevel', 'BEVEL'); bv.width = 0.08; bv.segments = 4; bv.harden_normals = True
    bpy.ops.mesh.primitive_plane_add(size=1, location=(cx, cy, -2.0)); t = bpy.context.object; t.scale = (300, 300, 1); t.data.materials.append(wm)

    # ---- Set pieces ----
    cache = {}
    def model(name):
        if name in cache: return cache[name]
        if name in SOLID_TREES:
            # The shipped near GLB is already normalised. Its closed crown, not the old shredded high-poly cache,
            # must cast both the preview and bake shadows; the staged export keeps the same near/far pair.
            f = f'{MVP}/assets/ai/sandtable/board/models/{name}.glb'
            if not os.path.isfile(f): raise FileNotFoundError(f)
            before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=f)
            new = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
            if not new: raise ValueError(f'no mesh in {f}')
            bpy.ops.object.select_all(action='DESELECT')
            for o in new: o.select_set(True)
            bpy.context.view_layer.objects.active = new[0]
            if len(new) > 1: bpy.ops.object.join()
            ob = bpy.context.view_layer.objects.active
            bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM'); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
            me = ob.data; me.name = name
            for o in [o for o in bpy.data.objects if o not in before]: bpy.data.objects.remove(o)
            cache[name] = me; print('using solid crown for shadows', f); return me
        f, cf = f'{RANGE_MODELS if name in RANGE_KINDS else MODELS}/{name}.glb', cache_file(name)
        if not os.path.exists(f): print('missing model', name); cache[name] = None; return None
        if os.path.exists(cf) and os.path.getmtime(cf) > os.path.getmtime(f):
            with bpy.data.libraries.load(cf, link=False) as (src, dst): dst.meshes = [name]
            cache[name] = dst.meshes[0]; return cache[name]
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=f)
        new = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
        bpy.ops.object.select_all(action='DESELECT')
        for o in new: o.select_set(True)
        bpy.context.view_layer.objects.active = new[0]
        if len(new) > 1: bpy.ops.object.join()
        ob = bpy.context.view_layer.objects.active
        bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM'); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        if name in RANGE_KINDS:
            # The source has 4K normal/roughness maps in addition to its paint. The game budget is one colour map
            # per variant; retaining the high-poly normal map on a reduced mesh would also give false cliff seams.
            for m in ob.data.materials:
                if not m or not m.node_tree: continue
                bs = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
                if bs:
                    for socket in ('Normal', 'Metallic', 'Roughness'):
                        for link_ in list(bs.inputs[socket].links): m.node_tree.links.remove(link_)
                    bs.inputs['Metallic'].default_value = 0; bs.inputs['Roughness'].default_value = .8
                    base = bs.inputs['Base Color'].links[0].from_node if bs.inputs['Base Color'].links else None
                    if not base or base.type != 'TEX_IMAGE': raise ValueError(f'{name}: expected one painted base-colour texture')
                    # Python softens the low grass and tones the rock; every LOD and this render share that paint.
                    base.image = bpy.data.images.load(f'{WORK}/{name}-paint.png', check_existing=True)
                    for n in list(m.node_tree.nodes):
                        if n.type == 'TEX_IMAGE' and n != base: m.node_tree.nodes.remove(n)
            # glTF splits vertices at UV seams. Decimating those separate islands tears the ridge into cracks.
            range_surface(ob, weld=True)
        tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
        if tris > BUDGET[name]:
            for _ in range(6 if name in RANGE_KINDS else 1):
                if tris <= BUDGET[name]: break
                mod = ob.modifiers.new('cut', 'DECIMATE'); mod.ratio = BUDGET[name] / tris * (.96 if name in RANGE_KINDS else 1)
                bpy.ops.object.modifier_apply(modifier=mod.name); ob.data.update()
                now = sum(len(p.vertices) - 2 for p in ob.data.polygons)
                if name in RANGE_KINDS and now >= tris: raise ValueError(f'{name}: render-mesh reduction stalled at {now}')
                tris = now
            if name in RANGE_KINDS:
                if tris > BUDGET[name]: raise ValueError(f'{name}: render mesh {tris} exceeds {BUDGET[name]}')
                print(f'{name}: render mesh {tris} triangles; compare its silhouette in the preview', flush=True)
        me = ob.data; me.name = name
        if name in YAW: me.transform(mathutils.Matrix.Rotation(math.radians(YAW[name]), 4, 'Z'))
        for img in {n.image for m in me.materials if m and m.node_tree for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image}:
            if max(img.size) > 2048: img.scale(2048, 2048)
            img.pack()
        vs = [v.co for v in me.vertices]
        lo = mathutils.Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
        hi = mathutils.Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
        me.transform(mathutils.Matrix.Scale(SIZE[name] / max(hi.x - lo.x, hi.y - lo.y), 4) @ mathutils.Matrix.Translation((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z)))
        if name in SQUASH: me.transform(mathutils.Matrix.Scale(SQUASH[name], 4, (0, 0, 1)))
        if name in ('ridge', 'bridge', 'massif') and hi.y - lo.y > hi.x - lo.x: me.transform(mathutils.Matrix.Rotation(math.pi / 2, 4, 'Z'))  # long axis on x
        if name in RANGE_KINDS:
            sys.path.insert(0, TOOLS)
            import sandtable_ranges
            me.transform(mathutils.Matrix.Scale(sandtable_ranges.RANGE_VERTICAL[name], 4, (0, 0, 1)))
            xyz = np.empty(len(me.vertices)*3, dtype=np.float32); me.vertices.foreach_get('co', xyz)
            me.vertices.foreach_set('co', sandtable_ranges.inset_foot(xyz.reshape(-1, 3)).ravel()); me.update()
            range_surface(ob)  # the inset is a positive XY scaling at each height and cannot open the welded surface
            v_ = np.array([tuple(v.co) for v in me.vertices]); dims = np.ptp(v_, axis=0)
            width, height = sandtable_ranges.RANGE_ASPECT[name]
            if dims[1] > SIZE[name] * width * sandtable_ranges.RANGE_WIDTH_GUARD or dims[2] > SIZE[name] * height * sandtable_ranges.RANGE_VERTICAL[name] * sandtable_ranges.RANGE_HEIGHT_GUARD:
                raise ValueError(f'{name}: normalised bounds {dims} exceed the placement/sight guard; update the measured aspect ratios')
            u = v_[:, 0] / (SIZE[name] / 2); v = -v_[:, 1] / (SIZE[name] * width * sandtable_ranges.RANGE_WIDTH_GUARD / 2)
            if not sandtable_ranges.in_outline(name, u, v).all(): raise ValueError(f'{name}: render mesh exceeds the measured footprint')
            print(f'{name}: normalised render bounds {dims}', flush=True)
        for o in [o for o in bpy.data.objects if o not in before]: bpy.data.objects.remove(o)
        os.makedirs(f'{WORK}/cache', exist_ok=True); bpy.data.libraries.write(cf, {me}, fake_user=True)
        cache[name] = me
        return me
    coll = bpy.data.collections.new('pieces'); sc.collection.children.link(coll)
    def put(me, x, y, z, ry=0.0, s=1.0, sx=1.0):
        ob = bpy.data.objects.new(me.name, me); ob.location = B(x, y, z); ob.rotation_euler = (0, 0, ry); ob.scale = (s * sx, s, s)
        coll.objects.link(ob); return ob
    for p in place:
        me = model(p['k'])
        if me: put(me, p['x'], p['y'], p['z'], p['ry'], p['s'], p.get('sx', 1.0))
    for name in RANGE_KINDS:
        if model(name) is None: raise FileNotFoundError(f'missing range model {name}')
    # Trees not all one green: each a little warmer or cooler, darker or lighter, a few broadleaves gone russet.
    for k in ('tree-broad', 'tree-pine', 'grove'):
        me = cache.get(k)
        for m in (me.materials if me else []):
            nt = m.node_tree; bs = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
            src = bs.inputs['Base Color'].links[0].from_socket if bs.inputs['Base Color'].links else None
            if not src or any(n.type == 'HUE_SAT' for n in nt.nodes): continue
            oi = node(nt, 'ShaderNodeObjectInfo'); hs = node(nt, 'ShaderNodeHueSaturation')
            hu = node(nt, 'ShaderNodeMapRange', **{'To Min': 0.49, 'To Max': 0.56}); link(nt, oi.outputs['Random'], hu.inputs['Value'])
            if k == 'tree-broad':  # one in five russet or gold
                rr = node(nt, 'ShaderNodeMapRange', **{'From Min': 0.795, 'From Max': 0.8, 'To Min': 0.0, 'To Max': -0.11}); link(nt, oi.outputs['Random'], rr.inputs['Value'])
                ad = node(nt, 'ShaderNodeMath', operation='ADD'); link(nt, hu.outputs['Result'], ad.inputs[0]); link(nt, rr.outputs['Result'], ad.inputs[1]); hsrc = ad.outputs[0]
            else: hsrc = hu.outputs['Result']
            link(nt, hsrc, hs.inputs['Hue'])
            hs.inputs['Saturation'].default_value = 0.8
            vv = node(nt, 'ShaderNodeMapRange', **{'To Min': 1.1, 'To Max': 1.5}); link(nt, oi.outputs['Random'], vv.inputs['Value']); link(nt, vv.outputs['Result'], hs.inputs['Value'])
            link(nt, src, hs.inputs['Color']); link(nt, hs.outputs['Color'], bs.inputs['Base Color'])

    # Cities, and a cloth banner in the owner's colour on a pole beside each, rippling away from the pole.
    pole_m, nt, bs = mat('pole'); bs.inputs['Base Color'].default_value = (0.1, 0.055, 0.03, 1)
    gold_m, nt, bs = mat('gilt'); bs.inputs['Base Color'].default_value = (0.8, 0.55, 0.22, 1); bs.inputs['Metallic'].default_value = 1; bs.inputs['Roughness'].default_value = 0.3
    rs_ = __import__('random').Random(5)
    for c in b['cities']:
        name = TIER[c['tier']]; me = model(name)
        if me: put(me, c['mx'], c['y'] - 0.03, c['mz'], 0.0, c['ms'])
        s_ = SIZE[name] / 2 * c['ms']
        px, pz, py = c['mx'] + s_ * 0.92, c['mz'] - s_ * 0.4, c['y']
        ph, ht = 0.62, 0.62 + (0.12 if c['tier'] == 'capital' else 0)
        bpy.ops.mesh.primitive_cylinder_add(radius=0.011, depth=ht, location=B(px, py + ht / 2, pz)); bpy.context.object.data.materials.append(pole_m)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.022, location=B(px, py + ht + 0.01, pz)); bpy.context.object.data.materials.append(gold_m)
        L, Hh, nu, nv, phase = 0.25, 0.16, 24, 10, rs_.uniform(0, 6.3)
        vs, fs = [], []
        for j in range(nv + 1):
            for i in range(nu + 1):
                u = i / nu
                off = 0.03 * u * math.sin(u * 2 * math.pi * 1.4 + phase) + 0.008 * math.sin(u * 9 + j * 0.6)
                vs.append(B(px + u * L, py + ht - 0.03 - j / nv * Hh - 0.03 * u * u, pz + off))
        for j in range(nv):
            for i in range(nu): fs.append((j * (nu + 1) + i, j * (nu + 1) + i + 1, (j + 1) * (nu + 1) + i + 1, (j + 1) * (nu + 1) + i))
        fme = bpy.data.meshes.new('banner'); fme.from_pydata(vs, [], fs)
        for p_ in fme.polygons: p_.use_smooth = True
        fl = bpy.data.objects.new('banner', fme); sc.collection.objects.link(fl)
        sol = fl.modifiers.new('thick', 'SOLIDIFY'); sol.thickness = 0.006
        cm, nt, bs = mat(f'banner-{c["id"]}')
        col = tuple(int(c['owner'][i:i + 2], 16) / 255 for i in (1, 3, 5))
        bs.inputs['Base Color'].default_value = (*[x ** 2.2 for x in col], 1); bs.inputs['Roughness'].default_value = 0.85
        bs.inputs['Sheen Weight'].default_value = 0.6
        fme.materials.append(cm)

    # The Tripo cities' stone a little lighter and cleaner, as the mock-up's pale walls and grey-blue roofs.
    for k in ('city-capital', 'city-major', 'city-county', 'pass', 'hamlet', 'bridge'):
        me = cache.get(k)
        for m in (me.materials if me else []):
            nt = m.node_tree; bs = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
            src = bs.inputs['Base Color'].links[0].from_socket if bs.inputs['Base Color'].links else None
            if not src or any(n.type == 'HUE_SAT' for n in nt.nodes): continue
            hs = node(nt, 'ShaderNodeHueSaturation', **{'Saturation': 1.05, 'Value': 1.3 if k != 'bridge' else 1.1})
            link(nt, src, hs.inputs['Color']); link(nt, hs.outputs['Color'], bs.inputs['Base Color'])

    # Snow on the set pieces by the same rule as the ground (north of the month's line, sooner up high, on what
    # faces the sky): thick on the mountains, a dusting on trees and roofs.
    sl_ = float(arg('--snow-lat', 99 if '--bake' in sys.argv else 38.2))
    def snowify(m, amount):
        nt = m.node_tree; bs = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
        lk = bs.inputs['Base Color'].links
        if not lk or any(n.label == 'snow' for n in nt.nodes): return
        src = lk[0].from_socket
        geo_ = node(nt, 'ShaderNodeNewGeometry'); ps = node(nt, 'ShaderNodeSeparateXYZ'); link(nt, geo_.outputs['Position'], ps.inputs[0])
        ns = node(nt, 'ShaderNodeSeparateXYZ'); link(nt, geo_.outputs['Normal'], ns.inputs[0])
        hz = node(nt, 'ShaderNodeMath', operation='MULTIPLY_ADD'); link(nt, ps.outputs['Z'], hz.inputs[0]); hz.inputs[1].default_value = 1.8; hz.inputs[2].default_value = -0.54
        hm = node(nt, 'ShaderNodeMath', operation='MAXIMUM'); link(nt, hz.outputs[0], hm.inputs[0]); hm.inputs[1].default_value = 0
        rn = node(nt, 'ShaderNodeTexNoise', **{'Scale': 1.2, 'Detail': 5.0}); link(nt, geo_.outputs['Position'], rn.inputs['Vector'])
        la_ = node(nt, 'ShaderNodeMath', operation='MULTIPLY_ADD'); link(nt, rn.outputs['Fac'], la_.inputs[0]); la_.inputs[1].default_value = 1.5; link(nt, ps.outputs['Y'], la_.inputs[2])
        lt = node(nt, 'ShaderNodeMath', operation='ADD'); link(nt, la_.outputs[0], lt.inputs[0]); link(nt, hm.outputs[0], lt.inputs[1])
        sn_ = node(nt, 'ShaderNodeMapRange', interpolation_type='SMOOTHSTEP', **{'From Min': sl_ - 31.5 + 0.75 - 0.45, 'From Max': sl_ - 31.5 + 0.75 + 0.45}); link(nt, lt.outputs[0], sn_.inputs['Value'])
        up = node(nt, 'ShaderNodeMapRange', interpolation_type='SMOOTHSTEP', **{'From Min': 0.35, 'From Max': 0.75}); link(nt, ns.outputs['Z'], up.inputs['Value'])
        fn = node(nt, 'ShaderNodeTexNoise', **{'Scale': 40.0, 'Detail': 4.0}); link(nt, geo_.outputs['Position'], fn.inputs['Vector'])
        fr_ = node(nt, 'ShaderNodeMapRange', **{'From Min': 0.35, 'From Max': 0.6}); link(nt, fn.outputs['Fac'], fr_.inputs['Value'])
        f1 = node(nt, 'ShaderNodeMath', operation='MULTIPLY'); link(nt, sn_.outputs['Result'], f1.inputs[0]); link(nt, up.outputs['Result'], f1.inputs[1])
        f2 = node(nt, 'ShaderNodeMath', operation='MULTIPLY'); link(nt, f1.outputs[0], f2.inputs[0]); link(nt, fr_.outputs['Result'], f2.inputs[1])
        f3 = node(nt, 'ShaderNodeMath', operation='MULTIPLY'); link(nt, f2.outputs[0], f3.inputs[0]); f3.inputs[1].default_value = amount
        mx_ = node(nt, 'ShaderNodeMix', data_type='RGBA', label='snow'); link(nt, f3.outputs[0], mx_.inputs['Factor'])
        link(nt, src, mx_.inputs[6]); mx_.inputs[7].default_value = (0.86, 0.88, 0.92, 1); link(nt, mx_.outputs[2], bs.inputs['Base Color'])
    for k, amt in {'massif': 1.0, 'range-a': 1.0, 'range-b': 1.0, 'hill': 0.9, 'tree-pine': 0.7, 'tree-broad': 0.6, 'grove': 0.6, 'hamlet': 0.7,
                   'city-capital': 0.5, 'city-major': 0.5, 'city-county': 0.5, 'pass': 0.6}.items():
        if k in RANGE_KINDS and sl_ >= RANGE_SNOWLESS_LAT: continue  # preserve the prepared base-colour link verbatim
        for m in (cache[k].materials if cache.get(k) else []): snowify(m, amt)

    # ---- Light: a warm lamp from the upper left over a dim warm room ----
    sun = bpy.data.lights.new('lamp', 'SUN'); sun.energy = float(arg('--sun', 5.6)); sun.color = (1.0, 0.76, 0.5); sun.angle = math.radians(2)
    so = bpy.data.objects.new('lamp', sun); sc.collection.objects.link(so)
    d = mathutils.Vector(B(-20, 15, 11)).normalized()   # the game's autumn sun: lower than spring's, longer shadows
    so.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    sc.world = bpy.data.worlds.new('room')
    bg = sc.world.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (0.38, 0.32, 0.28, 1); bg.inputs['Strength'].default_value = float(arg('--fill', 0.9))

    # ---- Cameras: the game's, 1440×900 ----
    C = mathutils.Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))
    r = sc.render; r.resolution_x, r.resolution_y = 1440, 900
    r.engine = 'CYCLES'; sc.cycles.samples = int(arg('--samples', 96)); sc.cycles.use_denoising = True
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences; prefs.compute_device_type = 'METAL'; prefs.get_devices()
        for dv in prefs.devices: dv.use = True
        sc.cycles.device = 'GPU'
    except Exception as e: print('gpu', e)
    sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = arg('--look', 'AgX - Medium High Contrast'); sc.view_settings.exposure = float(arg('--exposure', 0.6))
    if '--bake' in sys.argv: return bake(sc, ground, so, cache)
    focus = next(c for c in b['cities'] if c['name'] == '兖州')
    for nm in arg('--views', 'mid,near,far').split(','):
        if nm == 'top':   # straight down over the whole board, for checking the layout against the map
            cam = bpy.data.cameras.new(nm); cam.type = 'ORTHO'; cam.ortho_scale = X1 - X0; cam.sensor_fit = 'HORIZONTAL'; cam.clip_end = 400
            co = bpy.data.objects.new(nm, cam); sc.collection.objects.link(co); co.location = ((X0 + X1) / 2, -(Z0 + Z1) / 2, 60)
            r.resolution_x, r.resolution_y = 1440, round(1440 * (Z1 - Z0) / (X1 - X0)); sc.camera = co; r.filepath = f'{out}/{nm}.png'
            bpy.ops.render.render(write_still=True); print('rendered', r.filepath); r.resolution_x, r.resolution_y = 1440, 900
            continue
        cm_ = b['cams'][nm]
        cam = bpy.data.cameras.new(nm); cam.sensor_fit = 'VERTICAL'; cam.angle_y = math.radians(cm_['fov']); cam.clip_start = 0.1; cam.clip_end = 400
        co = bpy.data.objects.new(nm, cam); sc.collection.objects.link(co)
        qx, qy, qz, qw = cm_['quat']
        co.matrix_world = mathutils.Matrix.Translation(B(*cm_['pos'])) @ (C @ mathutils.Quaternion((qw, qx, qy, qz)).to_matrix()).to_4x4()
        # Tilt-shift as in the game and the mock-up: focus on the player's seat, a shallow aperture.
        cam.dof.use_dof = True; cam.dof.focus_distance = (co.location - mathutils.Vector(B(focus['x'], focus['y'], focus['z']))).length
        cam.dof.aperture_fstop = float(arg('--fstop', 1.4))
        sc.camera = co; r.filepath = f'{out}/{nm}.png'
        bpy.ops.render.render(write_still=True)
        print('rendered', r.filepath)
    if '--blend' in sys.argv: bpy.ops.wm.save_as_mainfile(filepath=f'{WORK}/sandtable.blend')


# ------------------------------------------------------------------ the bake (Blender side)
def range_model_signature():
    sys.path.insert(0, TOOLS)
    import sandtable_ranges
    with open(f'{WORK}/place.json') as f: pieces = json.load(f)['place']
    count = sum(p['k'] in RANGE_KINDS for p in pieces); old = sum(p['k'] == 'massif' for p in pieces)
    files = [f'{name}{suffix}.glb' for name in RANGE_KINDS for suffix in ('', '-far')]
    return {'cache': {name: os.path.basename(cache_file(name)) for name in RANGE_KINDS},
            'budgets': list(sandtable_ranges.model_budgets(count, GAME['range-a'][0], GAME_FAR['range-a'], old)),
            'files': {name: file_hash(f'{DEST}/models/{name}') for name in files}}


def range_models_current():
    try:
        with open(f'{DEST}/models/range-build.json') as f: recorded = json.load(f)
        return recorded == range_model_signature()
    except (OSError, ValueError, KeyError): return False


def mark_range_models():
    path = f'{DEST}/models/range-build.json'
    with open(path + '.tmp', 'w') as f: json.dump(range_model_signature(), f, sort_keys=True)
    os.replace(path + '.tmp', path)


def export_range_models():
    """Build the new near/far GLBs from the reviewed render cache, without replacing any old model."""
    import bpy
    import numpy as np
    sys.path.insert(0, TOOLS)
    import sandtable_ranges
    with open(f'{WORK}/place.json') as f: placed = json.load(f)['place']
    count = sum(p['k'] in RANGE_KINDS for p in placed); old = sum(p['k'] == 'massif' for p in placed)
    near_budget, far_budget = sandtable_ranges.model_budgets(count, GAME['range-a'][0], GAME_FAR['range-a'], old)
    os.makedirs(f'{DEST}/models', exist_ok=True)
    coll = bpy.data.collections.new('range-export'); bpy.context.scene.collection.children.link(coll)
    def select(ob):
        bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    def triangles(ob):
        ob.data.update()
        return sum(len(p.vertices) - 2 for p in ob.data.polygons)  # loop_triangles can be stale after a modifier
    def reduce(ob, budget, ratio):
        select(ob); count = triangles(ob)
        for _ in range(6):
            if count <= budget: break
            mod = ob.modifiers.new('range-decimate', 'DECIMATE'); mod.ratio = min(.999, budget / count * ratio)
            if hasattr(mod, 'use_collapse_triangulate'): mod.use_collapse_triangulate = True
            bpy.ops.object.modifier_apply(modifier=mod.name)
            now = triangles(ob)
            if now >= count: raise ValueError(f'{ob.name}: Decimate stalled at {now} triangles (budget {budget})')
            count = now
        if count > budget: raise ValueError(f'{ob.name}: {count} triangles exceeds {budget}')
        range_surface(ob)  # outward, smooth normals and a closed welded surface after every reduction
        return count
    def profile(ob, bins=12):
        v = np.array([tuple(p.co) for p in ob.data.vertices]); lo, hi = v[:, 0].min(), v[:, 0].max()
        ids = np.minimum(bins - 1, ((v[:, 0] - lo) / max(hi-lo, 1e-9) * bins).astype(int))
        top = np.array([v[ids == i, 2].max() if np.any(ids == i) else np.nan for i in range(bins)])
        valid = np.flatnonzero(np.isfinite(top))
        return np.interp(np.arange(bins), valid, top), max(v[:, 2].max() - v[:, 2].min(), 1e-9)
    def export(ob, path):
        select(ob)
        # Reduction can push a seam UV a fraction of a texel past the atlas edge (range-a: v 1.0006), which wraps.
        for lay in ob.data.uv_layers:
            for d_ in lay.data: d_.uv = (min(1., max(0., d_.uv[0])), min(1., max(0., d_.uv[1])))
        bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True,
                                  export_image_format='JPEG', export_image_quality=RANGE_JPEG_QUALITY)
    for name in RANGE_KINDS:
        cf = cache_file(name)
        if not os.path.isfile(cf): raise FileNotFoundError(f'{cf}: run the range preview before --range-models')
        with bpy.data.libraries.load(cf, link=False) as (src, dst): dst.meshes = [name]
        if not dst.meshes[0]: raise ValueError(f'{cf}: missing {name} mesh')
        ob = bpy.data.objects.new(name, dst.meshes[0].copy()); coll.objects.link(ob)
        if not ob.data.uv_layers: raise ValueError(f'{name}: missing UVs')
        if len(ob.data.materials) != 1: raise ValueError(f'{name}: expected one material')
        mat = ob.data.materials[0].copy(); ob.data.materials.clear(); ob.data.materials.append(mat)
        images = [n for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image]
        if len(images) != 1: raise ValueError(f'{name}: expected only the base-colour image, got {len(images)}')
        images[0].image = bpy.data.images.load(f'{WORK}/{name}-game.png', check_existing=True)  # Lanczos + light unsharp, prepared in python3
        source_top, source_height = profile(ob)
        near_count = reduce(ob, near_budget, sandtable_ranges.RANGE_NEAR_REDUCE_RATIO); near_top, near_height = profile(ob)
        near_error = float(np.max(np.abs(near_top-source_top)) / source_height)
        export(ob, f'{DEST}/models/{name}.glb')
        far = bpy.data.objects.new(f'{name}-far', ob.data.copy()); coll.objects.link(far)
        select(far); smooth = far.modifiers.new('ease-far-folds', 'SMOOTH')
        smooth.factor, smooth.iterations = RANGE_FAR_SMOOTH, RANGE_FAR_SMOOTH_PASSES
        bpy.ops.object.modifier_apply(modifier=smooth.name)
        far_count = reduce(far, far_budget, sandtable_ranges.RANGE_FAR_REDUCE_RATIO); far_top, _ = profile(far)
        far_error = float(np.max(np.abs(far_top-near_top)) / near_height)
        far_mat = mat.copy(); far.data.materials.clear(); far.data.materials.append(far_mat)
        far_images = [n for n in far_mat.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image]
        placeholder = bpy.data.images.new(f'{name}-far-placeholder', width=4, height=4, alpha=False)
        far_images[0].image = placeholder  # UVs remain intact; the game draws the far mesh with the near material.
        export(far, f'{DEST}/models/{name}-far.glb')
        print(f'{name}: near {near_count}, far {far_count} triangles; crest deviation {near_error:.1%}/{far_error:.1%} of height', flush=True)
        if max(near_error, far_error) > .25: print(f'WARNING: {name} crest changed materially; inspect near/far before installing', flush=True)
        bpy.data.objects.remove(ob, do_unlink=True); bpy.data.objects.remove(far, do_unlink=True)
    sandtable_ranges.check_models(DEST, placed, GAME, GAME_FAR)
    mark_range_models()


def render_range_review():
    """Compare the original, preview cache and exported LODs; far uses the game's near paint."""
    import bpy, mathutils, numpy as np
    sys.path.insert(0, TOOLS)
    import sandtable_ranges
    out = arg('--out', f'{SRC}/renders'); os.makedirs(out, exist_ok=True)
    for name in RANGE_KINDS:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'
        sc.cycles.samples = int(arg('--samples', RANGE_REVIEW_SAMPLES)); sc.cycles.use_denoising = True
        sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'
        sc.world = bpy.data.worlds.new('range-review-world'); bg = sc.world.node_tree.nodes['Background']
        bg.inputs['Color'].default_value = REVIEW_WORLD; bg.inputs['Strength'].default_value = REVIEW_SKY_STRENGTH
        light = bpy.data.lights.new('range-review-sun', 'SUN'); light.energy = REVIEW_SUN
        sun = bpy.data.objects.new('range-review-sun', light); sc.collection.objects.link(sun)
        sun.rotation_euler = mathutils.Vector(REVIEW_SUN_DIRECTION).to_track_quat('-Z', 'Y').to_euler()
        ground = bpy.data.materials.new('range-review-ground')
        bs = next(n for n in ground.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); bs.inputs['Base Color'].default_value = REVIEW_GROUND
        bpy.ops.mesh.primitive_plane_add(size=200); bpy.context.object.data.materials.append(ground)
        def load(path):
            before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=path)
            meshes = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
            if len(meshes) != 1: raise ValueError(f'{path}: expected one mesh for LOD review')
            ob = meshes[0]; bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
            bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM'); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
            for o in [o for o in bpy.data.objects if o not in before and o != ob]: bpy.data.objects.remove(o, do_unlink=True)
            return ob
        original = load(f'{RANGE_MODELS}/{name}.glb')
        coords = np.empty(len(original.data.vertices) * 3, dtype=np.float32); original.data.vertices.foreach_get('co', coords)
        coords = coords.reshape(-1, 3); lo, hi = coords.min(axis=0), coords.max(axis=0)
        original.data.transform(mathutils.Matrix.Scale(SIZE[name] / max(hi[0]-lo[0], hi[1]-lo[1]), 4) @
                                mathutils.Matrix.Translation((-(lo[0]+hi[0])/2, -(lo[1]+hi[1])/2, -lo[2])))
        original.data.transform(mathutils.Matrix.Scale(sandtable_ranges.RANGE_VERTICAL[name], 4, (0, 0, 1)))
        with bpy.data.libraries.load(cache_file(name), link=False) as (src, dst): dst.meshes = [name]
        reference = bpy.data.objects.new('render-mesh', dst.meshes[0]); sc.collection.objects.link(reference)
        near, far = load(f'{DEST}/models/{name}.glb'), load(f'{DEST}/models/{name}-far.glb')
        far.data.materials.clear()
        for m in near.data.materials: far.data.materials.append(m)
        for ob, x in zip((original, reference, near, far), (-1.5*RANGE_REVIEW_GAP, -.5*RANGE_REVIEW_GAP, .5*RANGE_REVIEW_GAP, 1.5*RANGE_REVIEW_GAP)): ob.location.x += x
        camera = bpy.data.cameras.new('range-review-camera'); camera.type = 'ORTHO'; camera.ortho_scale = RANGE_REVIEW_SPAN
        cam = bpy.data.objects.new('range-review-camera', camera); sc.collection.objects.link(cam)
        cam.location = (0, -10, 10 * math.tan(math.radians(RANGE_REVIEW_PITCH)))
        cam.rotation_euler = (mathutils.Vector((0, 0, .2)) - cam.location).to_track_quat('-Z', 'Y').to_euler(); sc.camera = cam
        sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = 2100, 750, 100
        sc.render.image_settings.file_format = 'PNG'; sc.render.filepath = f'{out}/{name}-lod.png'
        bpy.ops.render.render(write_still=True); print('range LOD review (original / render mesh / near / far):', sc.render.filepath, flush=True)


def bake(sc, ground, lamp, cache):
    import bpy
    import numpy as np
    tmp = f'{WORK}/bake'; os.makedirs(tmp, exist_ok=True); os.makedirs(f'{DEST}/models', exist_ok=True)
    # Only the ground and the roads painted on it face the camera; every piece still casts its shadow and bounce on
    # them. Water, banners and the sea plane cast nothing (the game draws its own).
    face = [ground, *[o for o in sc.objects if o.name.startswith('road')]]
    for o in sc.objects:
        if o.type != 'MESH' or o in face: continue
        o.visible_camera = False
        if o.name.startswith(('river', 'lake', 'Plane', 'banner', 'Cylinder', 'Sphere')): o.hide_render = True
    # Straight down over the board: pixel (0, 0) is its north-west corner.
    W, Wl = 4096, 2048
    cam = bpy.data.cameras.new('bake'); cam.type = 'ORTHO'; cam.ortho_scale = X1 - X0; cam.sensor_fit = 'HORIZONTAL'; cam.clip_end = 400
    co = bpy.data.objects.new('bake', cam); sc.collection.objects.link(co); co.location = ((X0 + X1) / 2, -(Z0 + Z1) / 2, 60); sc.camera = co
    r = sc.render; r.image_settings.file_format = 'PNG'; r.image_settings.color_mode = 'RGB'
    mats = {m for o in face for m in o.data.materials}
    def surface(kind):
        for m in mats:
            nt = m.node_tree; out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'); bs = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
            if kind == 'albedo':   # the base colour as it is, unlit
                em = nt.nodes.new('ShaderNodeEmission')
                if bs.inputs['Base Color'].links: nt.links.new(bs.inputs['Base Color'].links[0].from_socket, em.inputs['Color'])
                else: em.inputs['Color'].default_value = bs.inputs['Base Color'].default_value
                nt.links.new(em.outputs[0], out.inputs['Surface'])
            else:                  # a mid-grey clay keeping the paint's relief, so the light reads grain and strata
                df = nt.nodes.new('ShaderNodeBsdfDiffuse'); df.inputs['Color'].default_value = (0.5, 0.5, 0.5, 1)
                if bs.inputs['Normal'].links: nt.links.new(bs.inputs['Normal'].links[0].from_socket, df.inputs['Normal'])
                nt.links.new(df.outputs[0], out.inputs['Surface'])
    def shoot(name, w, samples, view):
        r.resolution_x, r.resolution_y = w, round(w * (Z1 - Z0) / (X1 - X0))
        sc.cycles.samples = samples; sc.cycles.use_denoising = samples > 16; sc.cycles.filter_width = 1.0
        sc.view_settings.view_transform = view; sc.view_settings.look = 'None'; sc.view_settings.exposure = 0
        r.image_settings.color_depth = '8' if view == 'Standard' else '16'
        r.filepath = f'{tmp}/{name}.png'; bpy.ops.render.render(write_still=True); print('baked', name)
    bg = sc.world.node_tree.nodes['Background']
    surface('albedo'); bg.inputs['Strength'].default_value = 0; lamp.hide_render = True
    shoot('albedo', W, 8, 'Standard')
    # The lamp alone at an irradiance of π under white light: a grey-0.5 surface returns 0.5·cos·shadow, plus bounce.
    surface('light'); lamp.hide_render = False; lamp.data.energy = math.pi; lamp.data.color = (1, 1, 1)
    shoot('sun', Wl, int(arg('--samples', 128)), 'Raw')
    lamp.hide_render = True; bg.inputs['Color'].default_value = (1, 1, 1, 1); bg.inputs['Strength'].default_value = 1
    shoot('sky', Wl, int(arg('--samples', 128)), 'Raw')
    # Light texture: R the lamp, G the sky, each stored as √(L/2) for precision in the shadows.
    def pix(f):
        im = bpy.data.images.load(f); im.colorspace_settings.name = 'Non-Color'
        return np.array(im.pixels[:], dtype=np.float32).reshape(-1, 4)
    sun, sky = pix(f'{tmp}/sun.png'), pix(f'{tmp}/sky.png')
    enc = lambda a: np.sqrt(np.clip(a[:, :3].mean(1) / 0.5 / 2, 0, 1))
    im = bpy.data.images.new('light', Wl, round(Wl * (Z1 - Z0) / (X1 - X0)))
    im.colorspace_settings.name = 'Non-Color'
    im.pixels.foreach_set(np.stack([enc(sun), enc(sky), np.zeros(len(sun), np.float32), np.ones(len(sun), np.float32)], -1).ravel())
    im.filepath_raw = f'{tmp}/light.png'; im.file_format = 'PNG'; im.save()

    # Pieces at the game's size, fresh from the cache (the review's colour and snow nodes are not in it).
    coll = bpy.data.collections.new('export'); sc.collection.children.link(coll)
    if '--keep-models' not in sys.argv or not range_models_current():
        print('building missing or stale range meshes from the reviewed cache', flush=True)
        export_range_models()
    else:
        sys.path.insert(0, TOOLS)
        import sandtable_ranges
        with open(f'{WORK}/place.json') as f: sandtable_ranges.check_models(DEST, json.load(f)['place'], GAME, GAME_FAR)
    with open(f'{WORK}/place.json') as f: active = active_piece_kinds(json.load(f))
    for name, (budget, side) in GAME.items():
        if name not in active: continue  # absent kinds have no instances and need no installed GLB
        if name in RANGE_KINDS: continue  # exported together with measured counts and independent placeholder textures
        if '--keep-models' in sys.argv:
            # A board-only rebake must not replace accepted piece models with fresh reductions of the source cache.
            print('keeping staged piece meshes', name); continue
        if name in SOLID_TREES:
            # Tree exports have their own closed-crown path; a board bake must not shred or replace them.
            if not all(os.path.isfile(f'{DEST}/models/{name}{s}.glb') for s in ('', '-far')):
                raise FileNotFoundError(f'{name}: build both tree LODs with --pieces first')
            print('keeping existing tree meshes', name); continue
        cf = cache_file(name)
        if not os.path.exists(cf): print('no cache for', name); continue
        with bpy.data.libraries.load(cf, link=False) as (src, dst): dst.meshes = [name]
        me = dst.meshes[0]; ob = bpy.data.objects.new(f'x-{name}', me); coll.objects.link(ob)
        tris = sum(len(p.vertices) - 2 for p in me.polygons)
        if tris > budget: ob.modifiers.new('cut', 'DECIMATE').ratio = budget / tris
        for img in {n.image for m in me.materials if m and m.node_tree for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image}:
            if max(img.size) > side: img.scale(side, side)
        bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
        bpy.ops.export_scene.gltf(filepath=f'{DEST}/models/{name}.glb', export_format='GLB', use_selection=True, export_apply=True,
                                  export_image_format='JPEG', export_jpeg_quality=85)
        print('exported', name, min(tris, budget), 'triangles')
        if name in GAME_FAR:   # geometry only: the game draws it with the full mesh's material
            for m_ in list(ob.modifiers): ob.modifiers.remove(m_)
            ob.modifiers.new('cut', 'DECIMATE').ratio = min(1.0, GAME_FAR[name] / tris)
            for img in {n.image for m in me.materials if m and m.node_tree for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image}: img.scale(4, 4)
            bpy.ops.export_scene.gltf(filepath=f'{DEST}/models/{name}-far.glb', export_format='GLB', use_selection=True, export_apply=True,
                                      export_image_format='JPEG', export_jpeg_quality=60)


# ------------------------------------------------------------------ the bake (python3 side): pack it for the game
def finish():
    import numpy as np
    from PIL import Image
    tmp = f'{WORK}/bake'
    Image.open(f'{tmp}/albedo.png').convert('RGB').save(f'{DEST}/albedo.webp', quality=88, method=6)
    # Under dense woods the sky's share bakes to nothing and the gaps between the trees go black: keep a little (G is √(L/2)).
    lit = np.array(Image.open(f'{tmp}/light.png').convert('RGB')); lit[..., 1] = np.maximum(lit[..., 1], SKY_FLOOR)
    Image.fromarray(lit).save(f'{DEST}/light.webp', quality=92, method=6)
    mask = Image.open(f'{WORK}/mask.png').convert('RGB')
    if os.path.isfile(f'{WORK}/road-alpha.png'): mask.putalpha(Image.open(f'{WORK}/road-alpha.png').convert('L'))
    mask.save(f'{DEST}/mask.png', optimize=True)  # old RGB masks are implicitly opaque; A marks the new baked roads
    Image.open(f'{WORK}/sea.png').convert('RGB').save(f'{DEST}/sea.png', optimize=True)   # R shallows, G foam
    Image.open(f'{WORK}/tile-frame.png').convert('RGB').resize((512, 512), Image.LANCZOS).save(f'{DEST}/frame.jpg', quality=88)
    gd = np.load(f'{WORK}/ground.npz'); pj = json.load(open(f'{WORK}/place.json'))
    # Heights every other fine-grid point (the game's ground mesh and its heightAt), and the game's own height there
    # (its snow rule), as 16-bit steps over each one's range.
    S = 2
    G, H0 = gd['G'][::S, ::S], gd['H0'][::S, ::S]
    q = lambda a: (a.min(), a.max(), np.round((a - a.min()) / (a.max() - a.min()) * 65535).astype('<u2'))
    (glo, ghi, gq), (hlo, hhi, hq) = q(G), q(H0)
    open(f'{DEST}/height.bin', 'wb').write(gq.tobytes() + hq.tobytes())
    r3 = lambda a: [round(float(x), 4) for x in a]
    pieces = {}
    for p in pj['place']: pieces.setdefault(p['k'], []).extend(r3([p['x'], p['y'], p['z'], p['ry'], p['s'], p.get('sx', 1.0)]))
    # Each road's course down its middle, named by the cities at its two ends.
    seats = [(c['id'], c['x'], c['z']) for c in pj['cities']]
    near = lambda x, z: min(seats, key=lambda s: (s[1] - x) ** 2 + (s[2] - z) ** 2)[0]
    roads = []
    for rd in pj['roads']:
        v = np.array(rd['v'], dtype=np.float32).reshape(-1, 2, 3).mean(1)
        roads.append({'a': near(v[0, 0], v[0, 2]), 'b': near(v[-1, 0], v[-1, 2]), 'p': r3(v.ravel())})
    # A lake's fan faces down after Blender's y↔z swap, and the double-sided material then lights it from below (black).
    water = [{'kind': w['kind'], 'v': r3(w['v']), 'i': w['i'][::-1] if w['kind'] == 'lake' else w['i'], **({'uv': r3([u for k in range(len(w['v']) // 3) for u in (k // 2 * 0.12, k % 2)]), 'f': r3(w['f'])} if w['kind'] == 'river' else {})} for w in pj['water']]
    cities = [{k: c[k] for k in ('id', 'name', 'tier', 'x', 'y', 'z', 'mx', 'mz', 'ms')} for c in pj['cities']]
    json.dump({'box': [X0, X1, Z0, Z1], 'sea': SEA_Y, 'grid': [G.shape[1], G.shape[0]], 'step': [DX * S, DZ * S], 'h': [float(glo), float(ghi)], 'h0': [float(hlo), float(hhi)],
               'size': SIZE, 'far': list(GAME_FAR), 'cities': cities, 'pieces': pieces, 'roads': roads, 'water': water},
              open(f'{DEST}/board.json', 'w'), separators=(',', ':'), default=float)
    for f in sorted(os.listdir(DEST)) + [f'models/{m}' for m in sorted(os.listdir(f'{DEST}/models'))]:
        if os.path.isfile(f'{DEST}/{f}'): print(f'{os.path.getsize(f"{DEST}/{f}") / 1e6:6.2f} MB  {f}')


# ------------------------------------------------------------------ solid game crowns: no board preparation or light bake
def solid_pieces():
    import bpy
    import bmesh
    import mathutils
    import numpy as np
    import random
    import shutil

    names = arg('--pieces', '').split(',')
    if not names or len(set(names)) != len(names) or any(n not in SOLID_TREES for n in names):
        raise ValueError('--pieces must list distinct tree-broad, tree-pine or grove names')
    if '--no-install' in sys.argv and '--install-only' in sys.argv:
        raise ValueError('--no-install and --install-only cannot be combined')
    root = os.path.realpath(MVP)
    for p in (WORK, DEST):
        if os.path.commonpath((root, os.path.realpath(p))) != root:
            raise ValueError(f'piece build must write inside this worktree: {p}')
    os.makedirs(WORK, exist_ok=True)
    if os.path.islink(WORK):
        raise ValueError(f'piece work directory must be a real directory, not a symlink: {WORK}')
    work = f'{WORK}/solid-crowns'
    original, candidate = f'{work}/original', f'{work}/candidate'
    review = f'{MVP}/docs/review-assets/2026-11-13/strategy-clarity/blender'
    for p in (work, original, candidate, review, f'{DEST}/models'):
        if os.path.commonpath((root, os.path.realpath(p))) != root:
            raise ValueError(f'piece output must stay inside this worktree: {p}')
    for p in (original, candidate, review): os.makedirs(p, exist_ok=True)
    for name in names:
        for suffix in ('', '-far'):
            old, saved = f'{DEST}/models/{name}{suffix}.glb', f'{original}/{name}{suffix}.glb'
            if not os.path.isfile(saved):
                if not os.path.isfile(old): raise FileNotFoundError(f'{saved}: restore the original {name}{suffix} reference to rebuild this unused piece')
                shutil.copy2(old, saved)  # retain the original for every review and rerun

    def verify():
        # The independent reader checks the actual exported GLBs, not the Blender objects before export.
        subprocess.run(['python3', f'{TOOLS}/check_sandtable_trees.py', '--pieces', ','.join(names), '--dir', candidate, '--compact-textures', '--require-footprint',
                        '--reference', original, '--report', f'{review}/mesh-report.json'], check=True)

    manifest = f'{candidate}/complete.json'
    def digest(path):
        with open(path, 'rb') as f: return hashlib.sha256(f.read()).hexdigest()

    def mark_complete():
        files = [f'{name}{suffix}.glb' for name in names for suffix in ('', '-far')]
        with open(f'{manifest}.tmp', 'w') as f: json.dump({'pieces': names, 'sha256': {p: digest(f'{candidate}/{p}') for p in files}}, f, indent=2)
        os.replace(f'{manifest}.tmp', manifest)

    def install():
        with open(manifest) as f: complete = json.load(f)
        files = [f'{name}{suffix}.glb' for name in names for suffix in ('', '-far')]
        if complete.get('pieces') != names or any(complete.get('sha256', {}).get(p) != digest(f'{candidate}/{p}') for p in files):
            raise ValueError('candidate set changed or is incomplete; rebuild and review it before installing')
        verify()
        staged, replaced, rollback = [], [], {}
        try:
            for name in names:
                for suffix in ('', '-far'):
                    dst = f'{DEST}/models/{name}{suffix}.glb'; tmp = f'{dst}.solid-crown-tmp'
                    if any(os.path.commonpath((root, os.path.realpath(p))) != root for p in (dst, tmp)):
                        raise ValueError(f'piece output must stay inside this worktree: {dst}')
                    with open(dst, 'rb') as f: rollback[dst] = f.read()
                    shutil.copy2(f'{candidate}/{name}{suffix}.glb', tmp); staged.append((tmp, dst))
            for tmp, dst in staged:
                os.replace(tmp, dst); replaced.append(dst)
        except Exception:
            for dst in replaced:
                with open(f'{dst}.solid-crown-restore', 'wb') as f: f.write(rollback[dst])
                os.replace(f'{dst}.solid-crown-restore', dst)
            for tmp, _ in staged:
                if os.path.exists(tmp): os.unlink(tmp)
            raise
        print('installed only:', ', '.join(os.path.basename(dst) for _, dst in staged), flush=True)

    if '--install-only' in sys.argv:
        install(); return
    if os.path.exists(manifest): os.unlink(manifest)  # a failed rebuild must not install a mixture of runs

    def clear():
        bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
        bpy.data.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)

    def select(active, *others):
        bpy.ops.object.select_all(action='DESELECT')
        for ob in (active, *others): ob.select_set(True)
        bpy.context.view_layer.objects.active = active

    def load(path):
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=path)
        objects = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
        if not objects: raise ValueError(f'no mesh in {path}')
        select(objects[0], *objects[1:])
        if len(objects) > 1: bpy.ops.object.join()
        ob = bpy.context.view_layer.objects.active
        bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        return ob

    def bounds(ob):
        xyz = np.empty(len(ob.data.vertices) * 3, dtype=np.float32)
        ob.data.vertices.foreach_get('co', xyz); xyz = xyz.reshape(-1, 3)
        if not len(xyz): raise ValueError(f'{ob.name}: empty mesh')
        return xyz.min(axis=0), xyz.max(axis=0)

    def fit(ob, lo, hi, allow_grow=False):
        a, b = bounds(ob); span = b - a
        if np.any(span <= 1e-8): raise ValueError(f'{ob.name}: flat bounds')
        scale = min(float(np.min((hi - lo) / span)) * CROWN_FIT, float('inf') if allow_grow else 1.0)
        shift = ((lo[0] + hi[0] - (a[0] + b[0]) * scale) / 2,
                 (lo[1] + hi[1] - (a[1] + b[1]) * scale) / 2, lo[2] - a[2] * scale)
        ob.data.transform(mathutils.Matrix.Translation(shift) @ mathutils.Matrix.Scale(scale, 4))
        ob.data.update()

    def fit_far_footprint(ob, near, lo, hi, name):
        a, b = bounds(ob); nlo, nhi = bounds(near); scales, shifts = [], []
        for axis, pad in enumerate(CROWN_FAR_FOOTPRINT_PAD[name]):
            span, near_span = b[axis] - a[axis], nhi[axis] - nlo[axis]
            if span <= 1e-8 or near_span <= 1e-8: raise ValueError(f'{name}: flat far footprint')
            centre, half = (nlo[axis] + nhi[axis]) / 2, near_span / 2
            allowed = min((hi[axis] - centre) / half, (centre - lo[axis]) / half)
            scale = near_span * min(pad, allowed) / span
            scales.append(scale); shifts.append(centre - (a[axis] + b[axis]) / 2 * scale)
        ob.data.transform(mathutils.Matrix(((scales[0], 0, 0, shifts[0]), (0, scales[1], 0, shifts[1]), (0, 0, 1, 0), (0, 0, 0, 1))))
        ob.data.update()  # UVs and height stay put; the far crown covers at least the near footprint.

    def connected(ob, keep_largest=False):
        bm = bmesh.new(); bm.from_mesh(ob.data)
        seen, groups = set(), []
        for v in bm.verts:
            if v in seen or not v.link_edges: continue
            stack, vs, fs = [v], [], set(); seen.add(v)
            while stack:
                q = stack.pop(); vs.append(q); fs.update(q.link_faces)
                for e in q.link_edges:
                    other = e.other_vert(q)
                    if other not in seen: seen.add(other); stack.append(other)
            groups.append((vs, fs))
        groups.sort(key=lambda g: len(g[1]), reverse=True)
        if not groups: bm.free(); raise ValueError(f'{ob.name}: no surface after remesh')
        total = sum(len(fs) for _, fs in groups)
        if keep_largest and len(groups) > 1:
            # Tiny stray islands can be discarded; a missing second crown must trigger a coarser retry instead.
            if len(groups[0][1]) / total < CROWN_LARGEST_FRACTION:
                bm.free(); return False
            bmesh.ops.delete(bm, geom=[v for vs, _ in groups[1:] for v in vs], context='VERTS')
            bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_edges], context='VERTS')
            bm.to_mesh(ob.data); ob.data.update(); groups = groups[:1]
        ok = len(groups) == 1 and all(len(e.link_faces) == 2 for e in bm.edges) and all(v.is_manifold for v in bm.verts if v.link_edges)
        bm.free(); return ok

    def triangles(ob):
        ob.data.update(); return sum(len(p.vertices) - 2 for p in ob.data.polygons)  # loop_triangles is stale right after a modifier is applied

    def reduce(ob, budget):
        select(ob)
        for _ in range(8):
            before = triangles(ob)
            if before <= budget: break
            mod = ob.modifiers.new('solid-crown-budget', 'DECIMATE')
            mod.ratio = max(.0001, min(.99, budget / before * CROWN_REDUCE_RATIO))
            if hasattr(mod, 'use_collapse_triangulate'): mod.use_collapse_triangulate = True
            bpy.ops.object.modifier_apply(modifier=mod.name)
            if triangles(ob) >= before: raise RuntimeError(f'{ob.name}: decimation did not reduce triangles')
        count = triangles(ob)
        # A collapse can leave a face turned the wrong way. Recalculate outward without altering its UVs.
        bm = bmesh.new(); bm.from_mesh(ob.data)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces)); bm.to_mesh(ob.data); bm.free(); ob.data.update()
        if count > budget or not connected(ob):
            raise RuntimeError(f'{ob.name}: {count} triangles or non-closed mesh after decimation (budget {budget})')
        for p in ob.data.polygons: p.use_smooth = CROWN_SMOOTH  # rounded lobes, without changing the triangle budget
        return count

    def unwrap(ob):
        select(ob); bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(island_margin=CROWN_UV_MARGIN)
        bpy.ops.object.mode_set(mode='OBJECT')
        if not ob.data.uv_layers.active: raise RuntimeError(f'{ob.name}: UV unwrap failed')

    def transfer(source, target, name, side, voxel):
        image = bpy.data.images.new(f'{name}-paint', width=side, height=side, alpha=True)
        image.generated_color = (0, 0, 0, 0)
        material = bpy.data.materials.new(f'{name}-paint')
        nt = material.node_tree; bs = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
        tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = image; nt.nodes.active = tex
        # A bake target linked into its own shader is a circular image dependency in Cycles.
        # Keep the image node active but unlinked until the selected-to-active transfer has finished.
        bs.inputs['Roughness'].default_value = .9
        target.data.materials.clear(); target.data.materials.append(material)
        scene = bpy.context.scene; scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'; scene.cycles.samples = CROWN_BAKE_SAMPLES
        bake = scene.render.bake; bake.use_selected_to_active = True; bake.use_pass_direct = False; bake.use_pass_indirect = False; bake.use_pass_color = True
        bake.use_cage = True; bake.cage_extrusion = voxel * CROWN_CAGE_VOXELS; bake.max_ray_distance = voxel * CROWN_RAY_VOXELS; bake.margin = CROWN_BAKE_MARGIN; bake.use_clear = True
        select(target, source)
        # Pass the operator options explicitly: its defaults need not match the scene's bake settings.
        bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'}, use_selected_to_active=True, use_cage=True,
                            cage_extrusion=bake.cage_extrusion, max_ray_distance=bake.max_ray_distance, margin=bake.margin, use_clear=True)
        raw = f'{work}/{name}-raw.png'; image.filepath_raw = raw; image.file_format = 'PNG'; image.save()
        pixels = np.empty(side * side * 4, dtype=np.float32); image.pixels.foreach_get(pixels); pixels = pixels.reshape(side, side, 4)
        rgb = pixels[:, :, :3]; valid = np.max(rgb, axis=2) > CROWN_MIN_BAKED_CHANNEL
        if valid.sum() < side * side * CROWN_MIN_BAKED_FRACTION: raise RuntimeError(f'{name}: colour transfer was empty; original {raw} retained')
        # Fill misses from the nearest transferred texel. This avoids black holes from a ray missing a thin leaf.
        for _ in range(side * 2):
            if valid.all(): break
            changed = False
            for dst, src in ((np.s_[1:, :], np.s_[:-1, :]), (np.s_[:-1, :], np.s_[1:, :]),
                             (np.s_[:, 1:], np.s_[:, :-1]), (np.s_[:, :-1], np.s_[:, 1:])):
                take = ~valid[dst] & valid[src]
                if np.any(take): rgb[dst][take] = rgb[src][take]; valid[dst][take] = True; changed = True
            if not changed: break
        if not valid.all(): raise RuntimeError(f'{name}: unfilled bake texels')
        # Rasterise the UVs of upper faces: preserve their painted hue but prevent near-black crown texels.
        lo, hi = bounds(target); h = float(hi[2] - lo[2]); crown = np.zeros((side, side), dtype=bool)
        uv = target.data.uv_layers.active.data; target.data.calc_loop_triangles()
        for tri in target.data.loop_triangles:
            if tri.normal.z < CROWN_UPPER_NORMAL or sum(target.data.vertices[i].co.z for i in tri.vertices) / 3 < lo[2] + h * CROWN_UPPER_HEIGHT: continue
            pts = np.array([(uv[i].uv.x * (side - 1), uv[i].uv.y * (side - 1)) for i in tri.loops])
            x0 = max(0, int(np.floor(pts[:, 0].min()))); x1 = min(side - 1, int(np.ceil(pts[:, 0].max())))
            y0 = max(0, int(np.floor(pts[:, 1].min()))); y1 = min(side - 1, int(np.ceil(pts[:, 1].max())))
            if x0 > x1 or y0 > y1: continue
            yy, xx = np.mgrid[y0:y1 + 1, x0:x1 + 1]; signs = []
            for i in range(3):
                a, b = pts[i], pts[(i + 1) % 3]; signs.append((b[0] - a[0]) * (yy - a[1]) - (b[1] - a[1]) * (xx - a[0]))
            crown[y0:y1 + 1, x0:x1 + 1] |= ((signs[0] >= 0) & (signs[1] >= 0) & (signs[2] >= 0)) | ((signs[0] <= 0) & (signs[1] <= 0) & (signs[2] <= 0))
        if not crown.any(): raise RuntimeError(f'{name}: no upper crown UVs')
        lum = rgb[:, :, 0] * .2126 + rgb[:, :, 1] * .7152 + rgb[:, :, 2] * .0722
        dark = crown & (lum < CROWN_MIN_LUMINANCE)
        rgb[dark] = np.clip(rgb[dark] * (CROWN_MIN_LUMINANCE / np.maximum(lum[dark], .0001))[:, None], 0, 1)
        green = crown & (rgb[:, :, 1] - np.maximum(rgb[:, :, 0] * .6, rgb[:, :, 2]) > CROWN_GREEN_THRESHOLD)
        fraction = float(green.sum() / crown.sum())
        if fraction < CROWN_MIN_GREEN_FRACTION: raise RuntimeError(f'{name}: only {fraction:.1%} of upper UVs satisfy the game leaf test; inspect {raw}')
        pixels[:, :, 3] = 1; image.pixels.foreach_set(pixels.ravel()); image.update()
        image.filepath_raw = f'{work}/{name}-paint.png'; image.file_format = 'PNG'; image.save(); image.pack()
        nt.links.new(tex.outputs['Color'], bs.inputs['Base Color'])
        print(f'{name}: upper UVs {int(crown.sum())}, leaf-green {fraction:.1%}, dark texels lifted {int(dark.sum())}; raw {raw}', flush=True)

    def export(ob, path):
        select(ob)
        bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True,
                                  export_image_format='JPEG', export_image_quality=CROWN_JPEG_QUALITY)
        if not os.path.isfile(path): raise RuntimeError(f'export failed: {path}')

    def build(name):
        clear(); old = load(f'{original}/{name}.glb'); lo, hi = bounds(old)
        bpy.data.objects.remove(old, do_unlink=True)
        source_path = f'{MODELS}/{name}.glb'
        if not os.path.isfile(source_path): raise FileNotFoundError(source_path)
        source = load(source_path); source.name = f'{name}-original'; fit(source, lo, hi, allow_grow=True)
        size = float(max(hi[0] - lo[0], hi[1] - lo[1])); voxel = size / CROWN_VOXELS[name]
        target = None
        for factor in CROWN_VOXEL_RETRIES:
            ob = source.copy(); ob.data = source.data.copy(); bpy.context.collection.objects.link(ob); ob.name = f'{name}-solid'
            select(ob); ob.data.remesh_voxel_size = voxel * factor
            try:
                bpy.ops.object.voxel_remesh()
            except RuntimeError as e:
                print(f'{name}: voxel {voxel * factor:.6f} failed: {e}', flush=True)
                bpy.data.objects.remove(ob, do_unlink=True); continue
            # Foliage remeshed at a fine voxel is a sponge: every gap between leaves is a handle, and a surface of high genus cannot be
            # collapsed below a few hundred triangles (tree-broad stalled at 398). Swell it until the gaps close, remesh, and let it back in.
            try:
                swell = voxel * factor * CROWN_CLOSE
                for d in (swell, -swell * CROWN_CLOSE_BACK):
                    mod = ob.modifiers.new('close', 'DISPLACE'); mod.strength = d; mod.mid_level = 0
                    bpy.ops.object.modifier_apply(modifier=mod.name)
                    if d > 0: bpy.ops.object.voxel_remesh()
                mod = ob.modifiers.new('ease', 'SMOOTH'); mod.factor = .5; mod.iterations = CROWN_CLOSE_SMOOTH
                bpy.ops.object.modifier_apply(modifier=mod.name)
            except RuntimeError as e:
                print(f'{name}: closing failed: {e}', flush=True); bpy.data.objects.remove(ob, do_unlink=True); continue
            if connected(ob, keep_largest=True):
                a, _ = bounds(ob)
                if a[2] <= lo[2] + (hi[2] - lo[2]) * CROWN_TRUNK_TOLERANCE:
                    fit(ob, lo, hi); target = ob; voxel *= factor; break
            bpy.data.objects.remove(ob, do_unlink=True)
        if target is None: raise RuntimeError(f'{name}: could not obtain one closed crown with its lower trunk; increase voxel size or inspect the source')
        near = reduce(target, GAME[name][0]); fit(target, lo, hi); unwrap(target)
        transfer(source, target, name, GAME[name][1], voxel)
        export(target, f'{candidate}/{name}.glb')
        far = target.copy(); far.data = target.data.copy(); bpy.context.collection.objects.link(far); far.name = f'{name}-far'
        select(far); mod = far.modifiers.new('ease-far-folds', 'SMOOTH'); mod.factor = CROWN_FAR_SMOOTH; mod.iterations = CROWN_FAR_SMOOTH_PASSES
        bpy.ops.object.modifier_apply(modifier=mod.name)
        far_count = reduce(far, GAME_FAR[name]); fit(far, lo, hi); fit_far_footprint(far, target, lo, hi, name)
        # Copy the material and image: shrinking the shared near paint would also destroy the game's far material.
        mat = target.data.materials[0].copy(); tex = next(n for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)
        image = tex.image; w, h = image.size; pixels = np.empty(w * h * 4, dtype=np.float32); image.pixels.foreach_get(pixels)
        pixels = pixels.reshape(h, w, 4); side = CROWN_FAR_TEXTURE_SIZE
        small = np.array([[pixels[y * h // side:(y + 1) * h // side, x * w // side:(x + 1) * w // side].mean(axis=(0, 1))
                           for x in range(side)] for y in range(side)], dtype=np.float32)
        placeholder = bpy.data.images.new(f'{name}-far-placeholder', width=side, height=side, alpha=False)
        placeholder.pixels.foreach_set(small.ravel()); placeholder.update(); tex.image = placeholder
        far.data.materials.clear(); far.data.materials.append(mat)
        export(far, f'{candidate}/{name}-far.glb')
        print(f'{name}: voxel {voxel:.6f}, near {near} triangles, far {far_count} triangles; one closed component each', flush=True)

    def setup_scene():
        clear(); scene = bpy.context.scene; scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'
        scene.cycles.samples = int(arg('--samples', REVIEW_SAMPLES)); scene.cycles.use_denoising = True
        scene.view_settings.view_transform = 'Standard'; scene.view_settings.look = 'None'; scene.view_settings.exposure = 0
        scene.world = bpy.data.worlds.new('review-world')
        bg = scene.world.node_tree.nodes.get('Background'); bg.inputs['Color'].default_value = REVIEW_WORLD; bg.inputs['Strength'].default_value = REVIEW_SKY_STRENGTH
        lamp = bpy.data.lights.new('review-sun', 'SUN'); lamp.energy = REVIEW_SUN
        obj = bpy.data.objects.new('review-sun', lamp); scene.collection.objects.link(obj)
        obj.rotation_euler = mathutils.Vector(REVIEW_SUN_DIRECTION).to_track_quat('-Z', 'Y').to_euler()
        ground = bpy.data.materials.new('mid-dark-ground')
        bs = next(n for n in ground.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); bs.inputs['Base Color'].default_value = REVIEW_GROUND; bs.inputs['Roughness'].default_value = 1
        bpy.ops.mesh.primitive_plane_add(size=200); bpy.context.object.data.materials.append(ground)
        scene.render.image_settings.file_format = 'PNG'; scene.render.resolution_percentage = 100
        return scene

    def camera(scene, center, span, elevation=REVIEW_PITCH):
        cam = bpy.data.cameras.new('review-camera'); cam.type = 'ORTHO'; cam.ortho_scale = span
        ob = bpy.data.objects.new('review-camera', cam); scene.collection.objects.link(ob)
        ob.location = (center[0], center[1] - span * 2, center[2] + span * 2 * math.tan(math.radians(elevation)))
        ob.rotation_euler = (mathutils.Vector(center) - ob.location).to_track_quat('-Z', 'Y').to_euler(); scene.camera = ob
        return ob

    def label(text, x, z, size, cam):
        curve = bpy.data.curves.new(text, 'FONT'); curve.body = text; curve.align_x = 'CENTER'; curve.size = size
        ob = bpy.data.objects.new(text, curve); bpy.context.scene.collection.objects.link(ob)
        ob.location = (x, 0, z); ob.rotation_euler = cam.rotation_euler

    def use_near_material(far, near):
        # Match sandtable.js: the far GLB's 4x4 placeholder is never used by the game.
        far.data.materials.clear()
        for mat in near.data.materials: far.data.materials.append(mat)

    def render_comparison(name):
        scene = setup_scene(); old = load(f'{original}/{name}.glb'); near = load(f'{candidate}/{name}.glb'); far = load(f'{candidate}/{name}-far.glb')
        use_near_material(far, near)
        lo, hi = bounds(old); span = float(max(hi - lo)); gap = span * REVIEW_GAP
        for ob, x in zip((old, near, far), (-gap, 0, gap)): ob.location.x += x
        cam = camera(scene, (0, 0, float((lo[2] + hi[2]) / 2)), gap * 4.0)
        for title, x in zip(('OLD', 'NEAR', 'FAR'), (-gap, 0, gap)): label(title, x, float(hi[2] + span * .16), span * .13, cam)
        scene.render.resolution_x, scene.render.resolution_y = 1800, 750
        scene.render.filepath = f'{review}/{name}.png'; bpy.ops.render.render(write_still=True); print('review', scene.render.filepath, flush=True)

    def render_patch():
        scene = setup_scene(); prototypes = []
        for name in names:
            near = load(f'{candidate}/{name}.glb'); far = load(f'{candidate}/{name}-far.glb')
            use_near_material(far, near); bpy.data.objects.remove(near, do_unlink=True); prototypes.append(far)
        for ob in prototypes: ob.hide_render = True
        rng = random.Random(17)
        for i in range(200):
            base = prototypes[i % len(prototypes)]; ob = base.copy(); ob.data = base.data
            bpy.context.collection.objects.link(ob); ob.hide_render = False
            ob.location = ((i % 20 - 9.5) * REVIEW_PATCH_SPACING + rng.uniform(-REVIEW_PATCH_JITTER, REVIEW_PATCH_JITTER),
                           (i // 20 - 4.5) * REVIEW_PATCH_SPACING + rng.uniform(-REVIEW_PATCH_JITTER, REVIEW_PATCH_JITTER), 0)
            ob.rotation_euler.z = rng.uniform(0, 2 * math.pi); ob.scale = (1, 1, 1)
        camera(scene, (0, 0, .1), REVIEW_PATCH_SPAN)
        scene.render.resolution_x, scene.render.resolution_y = 1600, 900
        scene.render.filepath = f'{review}/patch-200.png'; bpy.ops.render.render(write_still=True); print('review', scene.render.filepath, flush=True)

    for name in names: build(name)
    verify()
    for name in names: render_comparison(name)
    render_patch()
    mark_complete()
    print(f'candidates kept at {candidate}; inspect {review} before --install-only', flush=True)


def check_output_paths():
    root = os.path.realpath(MVP)
    for label, path in (('work', WORK), ('destination', DEST), ('render', arg('--out', f'{SRC}/renders'))):
        if os.path.commonpath((root, os.path.realpath(path))) != root:
            raise ValueError(f'{label} must stay inside this worktree: {path}')
    if os.path.realpath(WORK) == os.path.realpath(DEST): raise ValueError('work and destination must be separate directories')


def active_piece_kinds(layout):
    kinds = ({p['k'] for p in layout['place']} if 'place' in layout else {k for k, v in layout.get('pieces', {}).items() if v})
    return kinds | {TIER[c['tier']] for c in layout.get('cities', [])}


def check_staged_models():
    if '--bake' not in sys.argv: return
    path = f'{WORK}/place.json' if os.path.isfile(f'{WORK}/place.json') else f'{DEST}/board.json'
    if not os.path.isfile(path): raise FileNotFoundError(f'Missing {path}; set SANDTABLE_WORK to a preparation or seed SANDTABLE_DEST from the installed board.')
    with open(path) as f: active = active_piece_kinds(json.load(f))
    names = [n for n in (GAME if '--keep-models' in sys.argv else SOLID_TREES) if n in active]
    for name in names:
        if name in RANGE_KINDS: continue  # --keep-models builds either missing range pair from the reviewed cache
        for suffix in ('', '-far') if name in GAME_FAR else ('',):
            path = f'{DEST}/models/{name}{suffix}.glb'
            if not os.path.isfile(path): raise FileNotFoundError(f'missing staged model {path}; seed DEST from the installed board')
            if name in SOLID_TREES:
                shipped = f'{MVP}/assets/ai/sandtable/board/models/{name}{suffix}.glb'
                if file_hash(path) != file_hash(shipped): raise ValueError(f'{path} differs from the installed solid crown; seed DEST from the installed board')


try:
    import bpy  # noqa: F401
except ImportError:
    bpy = None

if bpy is not None:
    if '--pieces' in sys.argv: solid_pieces()
    elif '--range-models' in sys.argv:
        check_output_paths(); prepared_manifest(); export_range_models(); render_range_review()
    else:
        check_output_paths(); check_staged_models()
        if '--prepared' in sys.argv: prepared_manifest()
        blender()
elif '--pieces' in sys.argv:
    # A piece-only build must never call prepare() or finish(), even when invoked via system Python.
    executable = '/opt/homebrew/bin/blender' if os.path.exists('/opt/homebrew/bin/blender') else 'blender'
    subprocess.run([executable, '-b', '--factory-startup', '--python-exit-code', '1', '-P', os.path.abspath(__file__), '--', *sys.argv[1:]], check=True)
else:
    try:
        check_output_paths(); check_staged_models()
        if '--finish' in sys.argv: finish(); sys.exit()   # repack a finished bake
        if not os.path.isfile(f'{BOARD}/board.json'): raise FileNotFoundError(f'Missing {BOARD}/board.json; restore the local exported source board before baking.')
        if '--prepared' in sys.argv: prepared_manifest()
        else: prepare()
        if '--prepare-only' in sys.argv: sys.exit()
        executable = '/opt/homebrew/bin/blender' if os.path.exists('/opt/homebrew/bin/blender') else 'blender'
        subprocess.run([executable, '-b', '--factory-startup', '--python-exit-code', '1', '-P', os.path.abspath(__file__), '--', *sys.argv[1:]], check=True)
        if '--bake' in sys.argv: finish()
    except (FileNotFoundError, ValueError) as error:
        sys.exit(str(error))
