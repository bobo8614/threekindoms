"""Range placement on the installed sand table; no Blender or shared random stream is needed."""
import hashlib, io, json, math, os, shutil, struct
from collections import Counter
from functools import lru_cache

import numpy as np
try: from PIL import Image, ImageDraw
except ImportError: Image = ImageDraw = None  # Blender's Python has no PIL; only the python3 side reads pictures

# Normalised from the two measured Tripo originals (long axis X). The support lines enclose their actual tapered
# X/Z outlines: an ellipse misses 4–5% of source vertices, while a rectangle incorrectly blocks the empty corners.
RANGE_ASPECT = {'range-a': (.46 / .98, .21 / .98), 'range-b': (.57 / .98, .26 / .98)}
RANGE_FOOT_FADE, RANGE_FOOT_INSET = (.03, .085), (.05, .20)  # pull in the flat apron without shrinking the crest
RANGE_PAINT_SIZE, RANGE_GAME_PAINT_SIZE = 2048, 1024
RANGE_GAME_SHARPEN = (.7, 60, 3)  # radius, percentage, threshold; Lanczos keeps the rock and trees crisp near the camera
RANGE_FOOT_SATURATION, RANGE_FOOT_VALUE, RANGE_FOOT_STRENGTH = .55, .92, .85
RANGE_FOOT_TINT = (1.1, .96, 1.0)  # the board's meadow is warmer than the source's yellow-green apron
RANGE_FOOT_LIGHT, RANGE_FOOT_GREEN = (.34, .43), (0., .06)  # only bright green grass, not dark forest or rock
RANGE_ROCK_CURVE, RANGE_ROCK_WARM = (.5, 1.35, .85), (1.035, .995, .94)  # pivot, contrast, exposure; warm the stone without flattening it
RANGE_ROCK_GREEN, RANGE_ROCK_LIGHT = (0., .005), (.18, .28)  # stop before the range leaf shader's .005 threshold; protect dark forest too
RANGE_NORMAL_OUTLIER_FRACTION, RANGE_NORMAL_SEAM_COS = .02, .995  # concave saddles can oppose a face; UV seams must still shade smoothly
RANGE_OUTLINE = {
    'range-a': (1.002, .6746, .64, .8371, 1.002, 1.1637, 1.231, 1.1986, 1.002, .7074, .6328, .7678, 1.002, 1.1738, 1.2439, 1.2037),
    'range-b': (1.002, .744, .8197, .8535, 1.002, 1.105, 1.1762, 1.1698, 1.002, .6948, .4792, .6875, 1.002, 1.2264, 1.2972, 1.2342),
}
RANGE_DIRECTIONS = tuple((math.cos(i * math.tau / 16), math.sin(i * math.tau / 16)) for i in range(16))
RANGE_OUTLINE_PAD, RANGE_OUTLINE_EXTENT = 1.04, 1.05  # room for normalising a reduced source and a bounding box for its outline
RANGE_WIDTH_GUARD, RANGE_HEIGHT_GUARD = 1.08, 1.08  # fail the Blender build if reduction grows beyond these measured bounds
RANGE_VERTICAL = {'range-a': 1.9, 'range-b': 1.75}  # about 25% taller; the second row uses a smaller instance scale
RANGE_LIMIT, RANGE_BASELINE_MASSIFS = 80, 50
RANGE_NEAR_TRIANGLES, RANGE_FAR_TRIANGLES, RANGE_TEXELS = 400000, 100000, 2*1024*1024
RANGE_NEAR_REDUCE_RATIO, RANGE_FAR_REDUCE_RATIO = .995, .96
RANGE_REFERENCE_DISTANCE, RANGE_REFERENCE_RADII, RANGE_REFERENCE_DIRECTIONS = .7, (0., .18, .36, .54, .69), 12
RANGE_REFERENCE_DENSE_ANGLES = 36  # retry missed sites on the complete ground grid at ten-degree rotations
RANGE_REFERENCE_ANGLES = (0., .35, -.35, .7, -.7, math.pi)  # prefer the actual ridge before trying the old massif's heading
RANGE_ROW_SCALE, RANGE_ROW_SEPARATION, RANGE_ROW_STAGGER, RANGE_ROW_ALIGN = .8, (.50, 1.25), (.2, .85), .9
RANGE_ROW_HEIGHT_SINK, RANGE_ROW_LIMIT = .04, 22
RANGE_ROW_OFFSET, RANGE_ROW_PHASE = (.75, .9, 1.05), (.25, .35, .5, .65)  # staggered along the crest, with room to skirt a pass
RANGE_ROW_FOCUS = (-12., -4., -5., 5.)  # plateau, Qinling and the high ground south of 成都
RANGE_FOOT_EMBED, RANGE_SUPPORT_PAD, RANGE_TREE_FOOT = .02, .06, .1  # support the base and preserve surviving tree feet
RANGE_SEAT_MAX_SINK, RANGE_MIN_VISIBLE = .55, .4  # reject a piece instead of burying its crest below a steep protected cell
RANGE_EMPTY_RADIUS, RANGE_EMPTY_BLUR = .8, 20  # soften an abandoned old plinth without touching a surviving range
RANGE_BLUR, RANGE_HEIGHT, RANGE_CREST = 8, (.48, 4.5), .2
RANGE_SCALE, RANGE_HEIGHT_GAIN = (.85, 1.10), .1
RANGE_TURNS = (0., .18, -.18, .3, -.3, .36, -.36, .55, -.55)  # turn along a crest before leaving a spot empty
RANGE_PRIORITY = (('汉中', -2.088, -.809, 1.25), ('冀州', -2.883, -1.081, 1.05))  # road-free trailheads on Qinling and Taihang
RANGE_STEP, RANGE_SNAP, RANGE_TURN = .45, .45, .55  # overlap, crest search, minimum forward direction
RANGE_TRACE_OPTIONS, RANGE_TRACE_SPACING, RANGE_TRACE_CANDIDATES = 8, .12, 256
RANGE_PRIORITY_TRACE_OPTIONS, RANGE_PRIORITY_TRACE_SPACING = 48, .045  # narrow road gaps need finer attempts
RANGE_SEED_STRIDE, RANGE_APART, RANGE_MAX_STEPS = 5, .30, 16
RANGE_LINK_COS, RANGE_LINK_ALONG, RANGE_SIDE_WIDTH, RANGE_SIDE_OFFSET = .8, .78, 1.0, .6  # aligned ends may join; nearby parallel spines may not
RANGE_GAP_HEIGHT, RANGE_GAP_STEPS = .8, 1  # cross one shallow gap, never carry a chain through a pass
RANGE_MARGIN = .025
RANGE_WALL_CLEAR = .05
RANGE_MIN_PITCH = .45
RANGE_SIGHT = math.tan(RANGE_MIN_PITCH)  # the north-facing camera's lowest centre ray
RANGE_CAMERA_YAW, RANGE_CITY_SIGHT_MARGIN, RANGE_SIGHT_MAX_SINK = .12, .1, .35
RANGE_MOUND_HEIGHT, RANGE_MOUND_LIFT, RANGE_MOUND_INNER, RANGE_MOUND_OUTER = .09, .04, .6, 1.25
RANGE_MOUND_ROUNDNESS, RANGE_MOUND_PAD, RANGE_MOUND_CAP = 4, .04, .12
RANGE_FOOT_RADIUS, RANGE_FOOT_PERCENTILE, RANGE_FOOT_SINK = 22, 50, .04
RANGE_TERRAIN_BLUR = 8  # calm the old crumpled plateau under each new range
RANGE_TALUS_OVER = .12  # the fill may stand this far over the installed ground, no more: lifting piece after piece raised the plateau into cliffs
RANGE_SEAT_PASSES, RANGE_SEAT_TOLERANCE = 6, .03
RANGE_TALUS, RANGE_TALUS_REACH, RANGE_TALUS_STEPS = 36., 30, 400  # degrees; cells of reach beyond the shared rise; passes
RANGE_MAX_LOWER, RANGE_MAX_SLOPE, RANGE_SLOPE_TOLERANCE = .08, 40., .01  # pit depth below the installed ground; reference angle and diagnostic tolerance
RANGE_TERRAIN_BLEND = .5  # inspect the full area around each foot, not just the footprint
RANGE_REPORT_BIN = .5  # group adjacent bad cells in world units, while retaining the worst exact coordinate
RANGE_HOLLOW_RADIUS, RANGE_HOLLOW_DEPTH, RANGE_HOLLOW_EPS = .3, .15, 1e-7  # a new closed pit, not a reshaped plateau slope
RANGE_RISE_EPS = .0001  # ignore rounding when testing a shared rise's reach
RANGE_REVIEW_HEIGHT_TOL, RANGE_REVIEW_ANGLE_TOL = .00001, .01  # tiny numeric variation, never extra steep triangles
RANGE_ISOLATED_HEIGHT = 1.15
RANGE_SCRUB_GRASS, RANGE_SCRUB_FOREST, RANGE_SCRUB_STRENGTH = .88, .35, .9  # 62.5% meadow / 37.5% forest, close to the softened foot
RANGE_RNG_SEED = 1907


def ease(a, lo, hi):
    t = np.clip((a - lo) / (hi - lo), 0, 1)
    return t * t * (3 - 2 * t)


def inset_foot(vertices):
    """Contract only the low apron; positive XY scale at every height preserves the closed surface."""
    xyz = np.asarray(vertices, dtype=np.float32).copy(); height = float(np.ptp(xyz[:, 2]))
    if height <= 1e-8: raise ValueError('range mesh has no height')
    weight = 1 - ease((xyz[:, 2] - xyz[:, 2].min()) / height, *RANGE_FOOT_FADE)
    xyz[:, 0] *= 1 - RANGE_FOOT_INSET[0] * weight
    xyz[:, 1] *= 1 - RANGE_FOOT_INSET[1] * weight
    return xyz


def tint_apron(image, positions, uv, faces):
    """Paint the low, bright green UVs toward meadow; upper UVs remain byte-for-byte the source paint."""
    if Image is None: raise RuntimeError('range paint preparation requires Pillow in system python3')
    from PIL import ImageDraw
    img = image.convert('RGB').resize((RANGE_PAINT_SIZE, RANGE_PAINT_SIZE), Image.Resampling.LANCZOS)
    positions = np.asarray(positions); uv = np.asarray(uv); faces = np.asarray(faces, dtype=np.int64).reshape(-1, 3)
    if len(positions) != len(uv) or not np.isfinite(positions).all() or not np.isfinite(uv).all() or np.any(uv < 0) or np.any(uv > 1):
        raise ValueError('range paint requires finite source positions and UVs in the paint atlas')
    z = positions[:, 1]; height = float(np.ptp(z))  # source GLB is Y-up
    if height <= 1e-8: raise ValueError('range source has no height')
    h = (z - z.min()) / height; tri_h = h[faces]; low = tri_h.min(axis=1) < RANGE_FOOT_FADE[1]
    xy = np.rint(uv * (RANGE_PAINT_SIZE-1)).astype(np.int32)
    mask, protect = Image.new('L', img.size), Image.new('1', img.size)
    draw, cover = ImageDraw.Draw(mask), ImageDraw.Draw(protect)
    # At the original two-million-triangle density each triangle is much smaller than a paint texel; its mean
    # height supplies a smooth gradient. Stronger neighbours draw last where rasterised UV edges share a pixel.
    indices = np.flatnonzero(low); strength = 1 - ease(tri_h[indices].mean(axis=1), *RANGE_FOOT_FADE)
    for i in np.argsort(strength):
        value = int(round(float(strength[i])*255))
        if value:
            q = xy[faces[indices[i]]]; draw.polygon([tuple(p) for p in q], fill=value)
    # UV islands can touch at a texel; protect upper faces so the rock and the forest above the fade never change.
    for face in faces[~low]: cover.polygon([tuple(p) for p in xy[face]], fill=1)
    rgb = np.asarray(img, dtype=np.float32) / 255; m = np.asarray(mask, dtype=np.float32) / 255
    m[np.asarray(protect, dtype=bool)] = 0
    lum = rgb[..., 0]*.299 + rgb[..., 1]*.587 + rgb[..., 2]*.114
    green = rgb[..., 1] - np.maximum(rgb[..., 0]*.95, rgb[..., 2])
    m *= ease(lum, *RANGE_FOOT_LIGHT) * ease(green, *RANGE_FOOT_GREEN) * RANGE_FOOT_STRENGTH
    muted = (lum[..., None] + (rgb-lum[..., None])*RANGE_FOOT_SATURATION) * RANGE_FOOT_VALUE * np.array(RANGE_FOOT_TINT, dtype=np.float32)
    result = rgb + (muted-rgb)*m[..., None]
    changed = int(np.count_nonzero(m > .01))
    if not changed: raise ValueError('range apron tint matched no painted pixels')
    return Image.fromarray(np.rint(np.clip(result, 0, 1)*255).astype(np.uint8), 'RGB'), changed


def tone_range_rock(image):
    """A warm contrast curve for rock; retain green foliage for the game's seasonal leaf test."""
    if Image is None: raise RuntimeError('range paint preparation requires Pillow in system python3')
    rgb = np.asarray(image.convert('RGB'), dtype=np.float32) / 255
    linear = np.where(rgb <= .04045, rgb / 12.92, ((rgb + .055) / 1.055) ** 2.4)
    green = linear[..., 1] - np.maximum(linear[..., 0] * .8, linear[..., 2])  # seasonalPiece's range leaf test
    lum = rgb[..., 0]*.299 + rgb[..., 1]*.587 + rgb[..., 2]*.114
    mask = (1 - ease(green, *RANGE_ROCK_GREEN)) * ease(lum, *RANGE_ROCK_LIGHT)
    pivot, contrast, exposure = RANGE_ROCK_CURVE
    target = np.clip(pivot + (lum-pivot)*contrast, 0, 1) * exposure
    stone = rgb * (target / np.maximum(lum, .001))[..., None] * np.asarray(RANGE_ROCK_WARM, dtype=np.float32)
    out = rgb + (stone-rgb)*mask[..., None]
    return Image.fromarray(np.rint(np.clip(out, 0, 1)*255).astype(np.uint8), 'RGB')


def prepare_range_paint(source, target, game_target=None):
    """Read the original GLB without Blender and write a derived texture only into the work directory."""
    if Image is None: raise RuntimeError('range paint preparation requires Pillow in system python3')
    from check_sandtable_trees import read_glb
    doc, binary = read_glb(source)
    parts = [p for mesh in doc.get('meshes', []) for p in mesh['primitives']]
    if len(parts) != 1: raise ValueError(f'{source}: expected one painted range mesh')
    part = parts[0]
    def data(index, components, dtype):
        a = doc['accessors'][index]; view = doc['bufferViews'][a['bufferView']]; dt = np.dtype(dtype)
        expected = {'<f4': 5126, '<u2': 5123, '<u4': 5125}[dtype]
        if a.get('sparse') or a['componentType'] != expected or a['type'] != {1: 'SCALAR', 2: 'VEC2', 3: 'VEC3'}[components]:
            raise ValueError('unsupported source accessor')
        start = view.get('byteOffset', 0) + a.get('byteOffset', 0); stride = view.get('byteStride', dt.itemsize*components)
        return np.ndarray((a['count'], components), dtype=dt, buffer=binary, offset=start, strides=(stride, dt.itemsize))
    attr = part['attributes']; pos = data(attr['POSITION'], 3, '<f4'); uv = data(attr['TEXCOORD_0'], 2, '<f4')
    index = doc['accessors'][part['indices']]; dtype = {5123: '<u2', 5125: '<u4'}[index['componentType']]
    faces = data(part['indices'], 1, dtype).reshape(-1, 3)
    texture = doc['materials'][part['material']]['pbrMetallicRoughness']['baseColorTexture']
    if texture.get('texCoord', 0) != 0 or texture.get('extensions'): raise ValueError('range paint requires the original untransformed UV atlas')
    image = doc['images'][doc['textures'][texture['index']]['source']]; view = doc['bufferViews'][image['bufferView']]
    start = view.get('byteOffset', 0); original = Image.open(io.BytesIO(binary[start:start+view['byteLength']]))
    painted, count = tint_apron(original, pos, uv, faces); painted = tone_range_rock(painted)
    painted.save(target, format='PNG', optimize=True)
    if game_target is not None:
        from PIL import ImageFilter
        radius, percent, threshold = RANGE_GAME_SHARPEN
        painted.resize((RANGE_GAME_PAINT_SIZE, RANGE_GAME_PAINT_SIZE), Image.Resampling.LANCZOS).filter(
            ImageFilter.UnsharpMask(radius=radius, percent=percent, threshold=threshold)).save(game_target, format='PNG', optimize=True)
    print(f'{os.path.basename(source)}: softened {count} low grass texels and toned rock; leaf-green retained', flush=True)


def model_budgets(count, near_max, far_max, massifs=0, old_near=8000, old_far=3000):
    """Per-variant targets leave room for retained massifs and never exceed the board-wide limits."""
    if count <= 0: return near_max, far_max
    near = (RANGE_NEAR_TRIANGLES - massifs*old_near) // count
    far = (RANGE_FAR_TRIANGLES - massifs*old_far) // count
    if near < 1 or far < 1: raise ValueError('retained massifs leave no range triangle budget')
    return min(near_max, near), min(far_max, far)


def blur(a, r):
    for _ in range(3):
        for axis in (0, 1):
            p = np.pad(a, [(r + 1, r) if i == axis else (0, 0) for i in range(2)], mode='edge')
            c = np.cumsum(p, axis=axis, dtype=np.float64)
            a = ((np.take(c, np.arange(2 * r + 1, 2 * r + 1 + a.shape[axis]), axis) -
                  np.take(c, np.arange(a.shape[axis]), axis)) / (2 * r + 1)).astype(np.float32)
    return a


def footprint(p, size, extra=0):
    """Centre, orientation and half lengths of the conservative oriented model footprint."""
    length = size[p['k']] * p['s']; width = length * RANGE_ASPECT[p['k']][0] * RANGE_WIDTH_GUARD
    return (p['x'], p['z'], math.cos(p['ry']), -math.sin(p['ry']), length / 2 + extra, width / 2 + extra)


def local(p, size, x, z):
    cx, cz, ca, sa, a, b = footprint(p, size)
    return ((x - cx) * ca + (z - cz) * sa) / a, (-(x - cx) * sa + (z - cz) * ca) / b


def in_outline(kind, u, v):
    inside = np.ones(np.broadcast_shapes(np.shape(u), np.shape(v)), dtype=bool)
    for (dx, dz), bound in zip(RANGE_DIRECTIONS, RANGE_OUTLINE[kind]): inside &= dx*u + dz*v <= bound*RANGE_OUTLINE_PAD
    return inside


@lru_cache(maxsize=None)
def outline_vertices(kind):
    vertices = []
    for i, (a, b) in enumerate(RANGE_DIRECTIONS):
        c, d = RANGE_DIRECTIONS[(i + 1) % len(RANGE_DIRECTIONS)]
        h, k = RANGE_OUTLINE[kind][i]*RANGE_OUTLINE_PAD, RANGE_OUTLINE[kind][(i + 1) % len(RANGE_DIRECTIONS)]*RANGE_OUTLINE_PAD
        det = a*d - b*c
        vertices.append(((h*d - b*k)/det, (a*k - h*c)/det))
    return vertices


def mound_extra(p, size):
    _, _, _, _, a, b = footprint(p, size)
    return max(a, b) * (RANGE_MOUND_OUTER - 1) + RANGE_MOUND_PAD


def outline_distance(p, size, x, z):
    cx, cz, ca, sa, a, b = footprint(p, size)
    u, v = (x - cx) * ca + (z - cz) * sa, -(x - cx) * sa + (z - cz) * ca
    if all(dx*u/a + dz*v/b <= h*RANGE_OUTLINE_PAD for (dx, dz), h in zip(RANGE_DIRECTIONS, RANGE_OUTLINE[p['k']])): return 0.
    vertices = outline_vertices(p['k']); distance = math.inf
    for i, (x0, z0) in enumerate(vertices):
        x1, z1 = vertices[(i+1) % len(vertices)]; x0 *= a; x1 *= a; z0 *= b; z1 *= b
        vx, vz = x1-x0, z1-z0; length2 = vx*vx + vz*vz
        t = min(1., max(0., ((u-x0)*vx + (v-z0)*vz) / length2)) if length2 else 0.
        distance = min(distance, math.hypot(u-x0-t*vx, v-z0-t*vz))
    return distance


def near_outline(p, size, x, z, margin):
    cx, cz, ca, sa, a, b = footprint(p, size)
    u, v = (x-cx)*ca + (z-cz)*sa, -(x-cx)*sa + (z-cz)*ca
    # A cheap enclosing box avoids a polygon-distance calculation for distant trees and cities.
    if math.hypot(max(abs(u)-a*RANGE_OUTLINE_EXTENT, 0), max(abs(v)-b*RANGE_OUTLINE_EXTENT, 0)) >= margin: return False
    return outline_distance(p, size, x, z) < margin


def world_outline(p, size):
    cx, cz, ca, sa, a, b = footprint(p, size)
    return [(cx + ca*a*u - sa*b*v, cz + sa*a*u + ca*b*v) for u, v in outline_vertices(p['k'])]


def outlines_overlap(a, b, size):
    if math.hypot(a['x']-b['x'], a['z']-b['z']) > (size[a['k']]*a['s'] + size[b['k']]*b['s']): return False
    pa, pb = world_outline(a, size), world_outline(b, size)
    for poly in (pa, pb):
        for i, (x, z) in enumerate(poly):
            nx, nz = -(poly[(i+1) % len(poly)][1]-z), poly[(i+1) % len(poly)][0]-x
            va = [nx*x_ + nz*z_ for x_, z_ in pa]; vb = [nx*x_ + nz*z_ for x_, z_ in pb]
            if max(va) < min(vb) or max(vb) < min(va): return False
    return True


def pair_relation(a, b, size):
    """Return whether two pieces cross, run side by side, or can join along their long axes."""
    dx, dz = b['x'] - a['x'], b['z'] - a['z']; d = math.hypot(dx, dz)
    la, lb = size[a['k']]*a['s'], size[b['k']]*b['s']
    if d < RANGE_APART * min(la, lb): return 'too close'
    if d > (la+lb)/2 + max(la, lb): return None
    if 'y' in a and 'y' in b:
        for low, high in ((a,b), (b,a)):
            if high['y'] <= low['y']: continue
            u, v = local(high, size, low['x'], low['z'])
            dist = (abs(u)**RANGE_MOUND_ROUNDNESS + abs(v)**RANGE_MOUND_ROUNDNESS)**(1/RANGE_MOUND_ROUNDNESS)
            weight = 1-float(ease(dist, RANGE_MOUND_INNER, RANGE_MOUND_OUTER))
            height = size[low['k']]*low['s']*RANGE_ASPECT[low['k']][1]*RANGE_VERTICAL[low['k']]
            _, _, _, _, a_, b_ = footprint(high, size)
            under = in_outline(high['k'], u*a_/(a_*(1-RANGE_FOOT_INSET[0])+RANGE_SUPPORT_PAD),
                               v*b_/(b_*(1-RANGE_FOOT_INSET[1])+RANGE_SUPPORT_PAD))
            if ((high['y']-low['y'])*weight > height*(1-RANGE_MIN_VISIBLE) or
                under and high['y']+RANGE_FOOT_EMBED > low['y']+height*(1-RANGE_MIN_VISIBLE)): return 'buried'
    aligned = abs(math.cos(a['ry']-b['ry']))
    along_a = abs(dx*math.cos(a['ry']) - dz*math.sin(a['ry']))
    along_b = abs(dx*math.cos(b['ry']) - dz*math.sin(b['ry']))
    across_a = abs(dx*math.sin(a['ry']) + dz*math.cos(a['ry']))
    across_b = abs(dx*math.sin(b['ry']) + dz*math.cos(b['ry']))
    overlap = outlines_overlap(a, b, size)
    if aligned < RANGE_LINK_COS: return 'crossing' if overlap else None
    along = min(along_a, along_b) / d
    width = (la*RANGE_ASPECT[a['k']][0] + lb*RANGE_ASPECT[b['k']][0]) / 2
    # A lower, staggered second row gives the range depth without two parallel pieces sitting side by side.
    if (bool(a.get('row')) != bool(b.get('row')) and aligned >= RANGE_ROW_ALIGN and
        RANGE_ROW_SEPARATION[0]*width <= min(across_a, across_b) and max(across_a, across_b) <= RANGE_ROW_SEPARATION[1]*width and
        RANGE_ROW_STAGGER[0]*min(la, lb) <= min(along_a, along_b) and max(along_a, along_b) <= RANGE_ROW_STAGGER[1]*max(la, lb)):
        return 'row'
    if (max(across_a, across_b) < width*RANGE_SIDE_WIDTH and max(along_a, along_b) < (la+lb)/2 and
        (along < RANGE_LINK_ALONG or max(across_a, across_b) > width*RANGE_SIDE_OFFSET)):
        return 'parallel'
    if overlap and d < .95*min(la, lb) and along >= RANGE_LINK_ALONG: return 'join'
    return None


def clip_polygon(vertices, side):
    """Clip a convex outline against side(point) >= 0."""
    if not vertices: return []
    result = []
    prev = vertices[-1]; pv = side(prev)
    for cur in vertices:
        cv = side(cur)
        if (pv >= 0) != (cv >= 0):
            t = pv / (pv - cv)
            result.append((prev[0] + t*(cur[0]-prev[0]), prev[1] + t*(cur[1]-prev[1])))
        if cv >= 0: result.append(cur)
        prev, pv = cur, cv
    return result


def sight_ceiling(p, cities, size, tiers):
    # The game opens looking north from the south. Only the part of the real outline crossing a city's
    # sight corridor can obscure it; a mountain behind or beside the city needs no artificial shrinkage.
    vertices = world_outline(p, size)
    slope, ceiling = math.tan(RANGE_CAMERA_YAW), math.inf
    for c in cities:
        if max(z for _, z in vertices) <= c['mz']: continue
        wall = size[tiers[c['tier']]] * c['ms'] / 2
        width = wall + RANGE_CITY_SIGHT_MARGIN
        offset = lambda q: q[0] - c['mx'] - slope*(q[1]-c['mz'])
        poly = clip_polygon(vertices, lambda q: q[1] - c['mz'])
        poly = clip_polygon(poly, lambda q: width - offset(q))
        poly = clip_polygon(poly, lambda q: width + offset(q))
        if poly:
            distance = max(0, min(z for _, z in poly) - c['mz'] - wall)
            ceiling = min(ceiling, c['y'] + .05 + RANGE_SIGHT*distance)
    return ceiling


def hides_city(p, cities, size, tiers):
    top = p['y'] + size[p['k']] * p['s'] * RANGE_ASPECT[p['k']][1] * RANGE_VERTICAL[p['k']] * RANGE_HEIGHT_GUARD
    return top > sight_ceiling(p, cities, size, tiers) + 1e-8


def region(p, size, x0, z0, dx, dz, shape, extra=0):
    cx, cz, ca, sa, a, b = footprint(p, size, extra)
    rx, rz = (abs(ca) * a + abs(sa) * b) * RANGE_OUTLINE_EXTENT, (abs(sa) * a + abs(ca) * b) * RANGE_OUTLINE_EXTENT
    j0, j1 = max(0, int(math.floor((cz - rz - z0) / dz))), min(shape[0], int(math.ceil((cz + rz - z0) / dz)) + 1)
    k0, k1 = max(0, int(math.floor((cx - rx - x0) / dx))), min(shape[1], int(math.ceil((cx + rx - x0) / dx)) + 1)
    if j0 >= j1 or k0 >= k1: return None
    xx = x0 + np.arange(k0, k1)[None, :] * dx; zz = z0 + np.arange(j0, j1)[:, None] * dz
    u = ((xx - cx) * ca + (zz - cz) * sa) / a; v = (-(xx - cx) * sa + (zz - cz) * ca) / b
    return (slice(j0, j1), slice(k0, k1)), u, v


def bottom_region(p, size, x0, z0, dx, dz, shape):
    result = region(p, size, x0, z0, dx, dz, shape, RANGE_SUPPORT_PAD)
    if result is None: return None
    sl, u, v = result; _, _, _, _, a, b = footprint(p, size)
    u *= (a+RANGE_SUPPORT_PAD)/(a*(1-RANGE_FOOT_INSET[0])+RANGE_SUPPORT_PAD)
    v *= (b+RANGE_SUPPORT_PAD)/(b*(1-RANGE_FOOT_INSET[1])+RANGE_SUPPORT_PAD)
    return sl, in_outline(p['k'], u, v)


def foot_gap(p, size, ground, x0, z0, dx, dz):
    """Largest gap beneath the inset bottom, including the tapered ends, on the ground grid."""
    result = bottom_region(p, size, x0, z0, dx, dz, ground.shape)
    if result is None: return math.inf
    sl, bottom = result
    return float(p['y'] - ground[sl][bottom].min()) if bottom.any() else math.inf


def support_mask(ns, pieces, shape):
    result = np.zeros(shape, dtype=bool)
    for p in pieces:
        part = bottom_region(p, ns['SIZE'], ns['X0'], ns['Z0'], ns['DX'], ns['DZ'], shape)
        if part is not None: result[part[0]] |= part[1]
    return result


def range_reach_mask(ns, pieces, shape):
    """Include the support and its entire feathered join, including both tapered ends."""
    reach = np.zeros(shape, dtype=bool)
    for p in pieces:
        part = region(p, ns['SIZE'], ns['X0'], ns['Z0'], ns['DX'], ns['DZ'], shape, RANGE_TERRAIN_BLEND)
        if part is not None:
            sl, u, v = part; reach[sl] |= in_outline(p['k'], u, v)
    return reach


def range_fill_reach(ns, pieces, shape):
    """Talus fill extends beyond the painted mound; it must still connect to a surviving range."""
    reach = range_reach_mask(ns, pieces, shape)
    return blur(reach.astype(np.float32), RANGE_TALUS_REACH) > 0


def range_footprint_mask(ns, pieces, shape):
    """Only the actual, tapered model outlines hide the cuts made to seat them."""
    mask = np.zeros(shape, dtype=bool)
    for p in pieces:
        part = region(p, ns['SIZE'], ns['X0'], ns['Z0'], ns['DX'], ns['DZ'], shape)
        if part is not None:
            sl, u, v = part; mask[sl] |= in_outline(p['k'], u, v)
    return mask


def terrain_protected_mask(ns, shape, ground, layout, blocked=None):
    """The fixed road, water, city and hamlet cells and the planner's extra round pad clearance."""
    if blocked is None: blocked = feature_mask(ns, shape, ground, layout)
    protected = blocked | (ground['K'] > .05)
    xx = ns['X0'] + np.arange(shape[1])[None, :] * ns['DX']; zz = ns['Z0'] + np.arange(shape[0])[:, None] * ns['DZ']
    for c in layout['cities']:
        pad = ns['SIZE'][ns['TIER'][c['tier']]] * c['ms'] * math.sqrt(2)/2 + ns['PAD_MARGIN'][c['tier']] + ns['PAD_NOISE']*.5
        protected |= np.hypot(xx-c['mx'], zz-c['mz']) <= pad
    return protected


def range_terrain_stats(before, after, reach, dx, dz, footprint=None, protected=None, origin=(0., 0.)):
    """Measure exposed ground on both mesh triangles; do not excuse a changed face beside an old steep one."""
    if before.shape != after.shape or before.shape != reach.shape: raise ValueError('range terrain grids differ')
    if not np.isfinite(before).all() or not np.isfinite(after).all(): raise ValueError('range terrain has non-finite heights')
    footprint = np.zeros_like(reach) if footprint is None else footprint
    protected = np.zeros_like(reach) if protected is None else protected
    if footprint.shape != reach.shape or protected.shape != reach.shape: raise ValueError('range terrain masks differ')
    exposed = ~(footprint | protected)
    a, b, c, d = (before[:-1, :-1], before[:-1, 1:], before[1:, :-1], before[1:, 1:])
    A, B, C, D = (after[:-1, :-1], after[:-1, 1:], after[1:, :-1], after[1:, 1:])
    old = (np.hypot((b-a)/dx, (c-a)/dz), np.hypot((d-c)/dx, (d-b)/dz))
    new = (np.hypot((B-A)/dx, (C-A)/dz), np.hypot((D-C)/dx, (D-B)/dz))
    # A partially uncovered triangle still has a visible slope. Only a fully hidden face or one touching an
    # immovable feature is excluded; treating any single footprint vertex as hiding the whole face misses walls.
    hidden = (footprint[:-1, :-1] & footprint[:-1, 1:] & footprint[1:, :-1],
              footprint[1:, 1:] & footprint[:-1, 1:] & footprint[1:, :-1])
    fixed = (protected[:-1, :-1] | protected[:-1, 1:] | protected[1:, :-1],
             protected[1:, 1:] | protected[:-1, 1:] | protected[1:, :-1])
    e = (~hidden[0] & ~fixed[0], ~hidden[1] & ~fixed[1])
    r = ((reach[:-1, :-1] | reach[:-1, 1:] | reach[1:, :-1]) & e[0],
         (reach[1:, 1:] | reach[:-1, 1:] | reach[1:, :-1]) & e[1])
    max_angle = max((float(np.degrees(np.arctan(v[m])).max()) for v, m in zip(new, r) if m.any()), default=0.)
    violations = 0; excess = 0.; regions = {}
    for triangle, (previous, current, mask) in enumerate(zip(old, new, r)):
        allowed = np.maximum(RANGE_MAX_SLOPE, np.degrees(np.arctan(previous)))
        angle = np.degrees(np.arctan(current)); delta = angle - allowed
        bad = mask & (delta > RANGE_SLOPE_TOLERANCE); violations += int(np.count_nonzero(bad))
        if mask.any(): excess = max(excess, float(delta[mask].max()))
        for j, k in np.argwhere(bad):
            x = float(origin[0] + (k + (1/3 if triangle == 0 else 2/3))*dx)
            z = float(origin[1] + (j + (1/3 if triangle == 0 else 2/3))*dz)
            key = (round(x/RANGE_REPORT_BIN), round(z/RANGE_REPORT_BIN)); value = float(delta[j, k])
            if key not in regions: regions[key] = {'faces': 0, 'x': x, 'z': z, 'slope': float(angle[j, k]), 'excess': value}
            entry = regions[key]; entry['faces'] += 1
            if value > entry['excess']: entry.update(x=x, z=z, slope=float(angle[j, k]), excess=value)
    lower = np.where(exposed, before-after, -np.inf)
    j, k = np.unravel_index(int(np.argmax(lower)), lower.shape)
    lowering = max(0., float(lower[j, k])) if exposed.any() else 0.
    lower_at = (float(origin[0]+k*dx), float(origin[1]+j*dz)) if lowering else None
    upper = np.where(exposed, after-before, -np.inf)
    j, k = np.unravel_index(int(np.argmax(upper)), upper.shape)
    raising = max(0., float(upper[j, k])) if exposed.any() else 0.
    return {'lowering': lowering, 'lowering_at': lower_at,
            'raising': raising, 'raising_at': (float(origin[0]+k*dx), float(origin[1]+j*dz)) if raising else None,
            'lowered_cells': int(np.count_nonzero(exposed & (before-after > RANGE_MAX_LOWER + 1e-5))),
            'max_slope': max_angle, 'violations': violations, 'max_excess': max(0., excess),
            'regions': sorted(regions.values(), key=lambda item: (-item['excess'], item['x'], item['z']))}


@lru_cache(maxsize=None)
def hollow_ring(dx, dz, radius):
    """Partition a circle at every grid and triangle edge; the plane is constant within each arc."""
    angles = {0., math.tau}
    def add(a):
        a %= math.tau
        if 1e-12 < a < math.tau-1e-12: angles.add(round(a, 13))
    for n in range(-math.floor(radius/dx), math.floor(radius/dx)+1):
        a = math.acos(max(-1., min(1., n*dx/radius))); add(a); add(-a)
    for n in range(-math.floor(radius/dz), math.floor(radius/dz)+1):
        a = math.asin(max(-1., min(1., n*dz/radius))); add(a); add(math.pi-a)
    # Each quad is split on u+v=1, so all diagonals lie on x/dx+z/dz=integer.
    a, b = radius/dx, radius/dz; span = math.hypot(a, b); phase = math.atan2(b, a)
    for n in range(-math.floor(span), math.floor(span)+1):
        offset = math.acos(max(-1., min(1., n/span))); add(phase+offset); add(phase-offset)
    return tuple(sorted(angles))


def range_hollows(before, after, footprint, protected, dx, dz, origin=(0., 0.)):
    """A lowered exposed vertex is a pit only if the entire 0.3-unit ground circle stands above it."""
    if before.shape != after.shape or before.shape != footprint.shape or before.shape != protected.shape:
        raise ValueError('hollow ground grids differ')
    if not np.isfinite(before).all() or not np.isfinite(after).all() or dx <= 0 or dz <= 0:
        raise ValueError('invalid hollow ground or grid spacing')
    radius = RANGE_HOLLOW_RADIUS
    candidates = (before-after > RANGE_MAX_LOWER+RANGE_HOLLOW_EPS) & ~(footprint | protected)
    js, ks = np.nonzero(candidates)
    # A vertex at the board edge has no closed surrounding circle; do not invent ground outside the board.
    edge_x, edge_z = math.ceil(radius/dx-1e-10), math.ceil(radius/dz-1e-10)
    valid = (ks >= edge_x) & (ks < after.shape[1]-edge_x) & (js >= edge_z) & (js < after.shape[0]-edge_z)
    js, ks = js[valid], ks[valid]
    if not len(js): return []
    low = np.full(len(js), np.inf, dtype=np.float64)
    angles = hollow_ring(dx, dz, radius)
    for angle in angles[:-1]:
        u, v = radius*math.cos(angle)/dx, radius*math.sin(angle)/dz
        # Clip only at the last board vertex; interpolation remains exact at the edge.
        x = np.clip(ks + math.floor(u), 0, after.shape[1]-2); z = np.clip(js + math.floor(v), 0, after.shape[0]-2)
        tx, tz = ks+u-x, js+v-z
        a, b, c, d = after[z,x], after[z,x+1], after[z+1,x], after[z+1,x+1]
        height = np.where(tx+tz <= 1, a+(b-a)*tx+(c-a)*tz, d+(c-d)*(1-tx)+(b-d)*(1-tz))
        low = np.minimum(low, height)
    for start, end in zip(angles, angles[1:]):
        mid = (start+end)/2; u, v = radius*math.cos(mid)/dx, radius*math.sin(mid)/dz
        i, j = math.floor(u), math.floor(v); tx, tz = u-i, v-j
        a, b, c, d = after[js+j,ks+i], after[js+j,ks+i+1], after[js+j+1,ks+i], after[js+j+1,ks+i+1]
        if tx+tz <= 1:
            gx, gz = (b-a)/dx, (c-a)/dz; intercept = a-gx*i*dx-gz*j*dz
        else:
            gx, gz = (d-c)/dx, (d-b)/dz; intercept = d-gx*(i+1)*dx-gz*(j+1)*dz
        # Along an arc h=intercept+r*(gx*cos(t)+gz*sin(t)); inspect its interior minimum too.
        angle = np.mod(np.arctan2(-gz, -gx), math.tau)
        low = np.minimum(low, np.where((angle >= start) & (angle <= end), intercept-radius*np.hypot(gx, gz), np.inf))
    depth = low-after[js,ks]; found = depth > RANGE_HOLLOW_DEPTH+RANGE_HOLLOW_EPS
    return [{'x': float(origin[0]+k*dx), 'z': float(origin[1]+j*dz),
             'lowering': float(before[j,k]-after[j,k]), 'depth': float(dep)}
            for j, k, dep in zip(js[found], ks[found], depth[found])]


def terrain_review_identity(after, pieces, footprint, protected, dx, dz, origin, game_step):
    """Hash the actual layout and its exposure masks, with a stable float32 ground format."""
    def array_hash(a, dtype):
        a = np.ascontiguousarray(a, dtype=dtype)
        return hashlib.sha256(json.dumps(a.shape).encode()+b'\0'+a.tobytes()).hexdigest()
    transforms = sorted([(p['k'], *(float(p[k]) for k in ('x','y','z','ry','s')), float(p.get('sx', 1))) for p in pieces])
    encoded = json.dumps(transforms, separators=(',', ':'), allow_nan=False).encode()
    return {'piece_count': len(pieces), 'piece_transforms_sha256': hashlib.sha256(encoded).hexdigest(),
            'ground_sha256': array_hash(after, '<f4'),
            'footprint_sha256': array_hash(footprint, 'u1'), 'protected_sha256': array_hash(protected, 'u1'),
            'origin': [float(v) for v in origin], 'step': [float(dx), float(dz)], 'game_step': [int(v) for v in game_step],
            'slope_reference': RANGE_MAX_SLOPE, 'slope_tolerance': RANGE_SLOPE_TOLERANCE}


def terrain_review_values(fine, game):
    def metrics(s):
        location = lambda p: [float(v) for v in p] if p is not None else None
        worst = s['regions'][0] if s['regions'] else None
        return {'lowering': {'value': float(s['lowering']), 'at': location(s['lowering_at'])},
                'raising': {'value': float(s['raising']), 'at': location(s['raising_at'])},
                'steep_triangles': {'count': int(s['violations']), 'worst_at': [worst['x'], worst['z']] if worst else None,
                                    'max_excess': float(s['max_excess'])}, 'max_slope': float(s['max_slope'])}
    return {'fine': metrics(fine), 'game': metrics(game)}


def terrain_review_errors(review, identity, figures):
    """A changed identity needs new visual review; matching geometry may not exceed its recorded measurements."""
    if (not isinstance(review, dict) or review.get('version') != 1 or not isinstance(review.get('identity'), dict) or
        not isinstance(review.get('date'), str) or not review['date'].strip() or not isinstance(review.get('note'), str) or not review['note'].strip() or
        not isinstance(review.get('pictures'), list) or not review['pictures'] or any(not isinstance(p, str) or not p.strip() for p in review['pictures'])):
        raise ValueError('missing or invalid reviewed terrain record')
    errors = []
    if review.get('identity') != identity:
        changed = [key for key in identity if review.get('identity', {}).get(key) != identity[key]]
        errors.append('terrain changed since the review: ' + ', '.join(changed))
    try:
        for mesh in ('fine', 'game'):
            old, now = review['figures'][mesh], figures[mesh]
            for field in ('lowering', 'raising'):
                value, at = old[field]['value'], old[field]['at']
                if not math.isfinite(value) or value < 0 or (value > 0 and (not isinstance(at, list) or len(at) != 2 or not all(math.isfinite(v) for v in at))):
                    raise ValueError('invalid reviewed terrain measurement')
                if now[field]['value'] > value+RANGE_REVIEW_HEIGHT_TOL:
                    errors.append(f'{mesh} {field} exceeds reviewed value')
            steep = old['steep_triangles']; count, worst = steep['count'], steep['worst_at']
            if (not isinstance(count, int) or count < 0 or not math.isfinite(steep['max_excess']) or not math.isfinite(old['max_slope']) or
                (count and (not isinstance(worst, list) or len(worst) != 2 or not all(math.isfinite(v) for v in worst)))):
                raise ValueError('invalid reviewed steep-triangle measurement')
            if now['steep_triangles']['count'] > old['steep_triangles']['count']:
                errors.append(f'{mesh} steep triangle count exceeds reviewed value')
            if now['steep_triangles']['max_excess'] > old['steep_triangles']['max_excess']+RANGE_REVIEW_ANGLE_TOL:
                errors.append(f'{mesh} steep excess exceeds reviewed value')
            if now['max_slope'] > old['max_slope']+RANGE_REVIEW_ANGLE_TOL: errors.append(f'{mesh} maximum slope exceeds reviewed value')
    except (KeyError, TypeError, ValueError): raise ValueError('invalid reviewed terrain measurements') from None
    return errors


def massif_coverage_report(references, pieces, dropped, failures, options, keep=None, previous=None):
    """Report final geometry; keep the rejected piece as evidence for a site lost during seating."""
    result = []
    for i, ref in enumerate(references):
        distance = min((math.hypot(p['x']-ref['x'], p['z']-ref['z']) for p in pieces), default=math.inf)
        hit = distance <= RANGE_REFERENCE_DISTANCE + 1e-8
        omitted = [{k: p[k] for k in ('k', 'x', 'y', 'z', 'ry', 's')} for p in dropped
                   if math.hypot(p['x']-ref['x'], p['z']-ref['z']) <= RANGE_REFERENCE_DISTANCE + 1e-8]
        rejects = dict(failures.get(i, {})) if not hit else {}
        reason = 'could not be seated' if omitted and not hit else None
        if not hit and not reason and not options.get(i) and 'dense legal candidates' in rejects and not rejects['dense legal candidates']:
            if keep is not None and rejects.get('outside keep', 0): reason = 'fixed keep boundary'
            elif any(rejects.get(k, 0) for k in ('road', 'water', 'city/pad', 'hamlet', 'sight', 'protected terrain support', 'board edge')): reason = 'no legal footprint'
        entry = {'index': i, 'x': ref['x'], 'z': ref['z'], 'distance': round(distance, 3) if math.isfinite(distance) else None,
                 'covered': hit, 'reason': reason, 'omitted': omitted if not hit else [],
                 'sampled_legal_options': len(options.get(i, [])) if not hit else None, 'rejections': rejects}
        # --keep must carry the evidence for an unchanged omission outside its box; the checker revalidates it.
        if (not hit and not reason and keep is not None and previous is not None and i < len(previous) and
            not (keep[0] <= ref['x'] <= keep[1] and keep[2] <= ref['z'] <= keep[3])):
            old = previous[i]
            if old.get('index') == i and not old.get('covered') and old.get('reason'):
                for key in ('reason', 'omitted', 'sampled_legal_options', 'rejections'): entry[key] = old.get(key)
        result.append(entry)
    return result


def massif_coverage_errors(ns, ground, references, pieces, report, cities=(), keep=None):
    """Reject stale reports; an omitted piece must remain buried even at its supported, sight-safe height."""
    if not isinstance(report, list) or len(report) != len(references): return ['missing reference massif coverage report']
    errors = []
    for i, (ref, entry) in enumerate(zip(references, report)):
        distance = min((math.hypot(p['x']-ref['x'], p['z']-ref['z']) for p in pieces), default=math.inf)
        hit = distance <= RANGE_REFERENCE_DISTANCE + 1e-8
        try:
            stale = (entry.get('index') != i or not math.isfinite(entry.get('x', math.inf)) or not math.isfinite(entry.get('z', math.inf)) or
                     abs(entry.get('x', math.inf)-ref['x']) > 1e-4 or
                     abs(entry.get('z', math.inf)-ref['z']) > 1e-4 or entry.get('covered') is not hit or
                     (entry.get('distance') is None) != (not math.isfinite(distance)) or
                     math.isfinite(distance) and (not math.isfinite(entry.get('distance', math.inf)) or abs(entry.get('distance', math.inf)-distance) > .00051))
        except (AttributeError, TypeError, ValueError): stale = True
        if stale:
            errors.append(f'massif {i} coverage report differs from geometry'); continue
        if hit: continue
        reason = entry.get('reason'); valid = False
        if reason == 'could not be seated':
            for p in entry.get('omitted', []) or []:
                try:
                    if p['k'] not in RANGE_ASPECT or not all(math.isfinite(p[k]) for k in ('x', 'y', 'z', 'ry', 's')): continue
                    if math.hypot(p['x']-ref['x'], p['z']-ref['z']) > RANGE_REFERENCE_DISTANCE + 1e-8: continue
                    if any(math.hypot(p['x']-q['x'], p['z']-q['z']) < 1e-6 for q in pieces): continue
                    j, k = round((p['z']-ns['Z0'])/ns['DZ']), round((p['x']-ns['X0'])/ns['DX'])
                    if not (0 <= j < ground.shape[0] and 0 <= k < ground.shape[1]): continue
                    height = ns['SIZE'][p['k']]*p['s']*RANGE_ASPECT[p['k']][1]*RANGE_VERTICAL[p['k']]
                    part = bottom_region(p, ns['SIZE'], ns['X0'], ns['Z0'], ns['DX'], ns['DZ'], ground.shape)
                    if height <= 0 or part is None or not part[1].any(): continue
                    sl, bottom = part
                    max_y = min(float(ground[sl][bottom].min())-RANGE_FOOT_EMBED,
                                sight_ceiling(p, cities, ns['SIZE'], ns.get('TIER', {}))-height*RANGE_HEIGHT_GUARD-1e-6)
                    required = height*(RANGE_MIN_VISIBLE+.05)
                    if p['y']+height-ground[j, k] < required and max_y+height-ground[j, k] < required:
                        valid = True; break
                except (KeyError, TypeError, ValueError): continue
        elif reason == 'no legal footprint':
            rejected = entry.get('rejections') or {}
            valid = (isinstance(rejected, dict) and entry.get('sampled_legal_options') == 0 and 'dense legal candidates' in rejected and rejected['dense legal candidates'] == 0 and
                     any(rejected.get(k, 0) > 0 for k in ('road', 'water', 'city/pad', 'hamlet', 'sight', 'protected terrain support', 'board edge')))
        elif reason == 'fixed keep boundary':
            rejected = entry.get('rejections') or {}
            valid = (isinstance(rejected, dict) and keep is not None and entry.get('sampled_legal_options') == 0 and
                     rejected.get('outside keep', 0) > 0 and rejected.get('dense legal candidates') == 0)
        if not valid: errors.append(f'massif {i} at {ref["x"]:.3f},{ref["z"]:.3f} has no supported reason for being uncovered')
    return errors


def clears_tree(ns, tree, pieces, support):
    if any(near_outline(p, ns['SIZE'], tree['x'], tree['z'], .08) for p in pieces): return True
    j, k = round((tree['z']-ns['Z0'])/ns['DZ']), round((tree['x']-ns['X0'])/ns['DX'])
    jj, kk = math.ceil(RANGE_TREE_FOOT/ns['DZ']), math.ceil(RANGE_TREE_FOOT/ns['DX'])
    return bool(support[max(0,j-jj):j+jj+1, max(0,k-kk):k+kk+1].any())


def close_values(a, b):
    a, b = np.asarray(a, dtype=float), np.asarray(b, dtype=float)
    return a.shape == b.shape and np.allclose(a, b, rtol=0, atol=.00011)


def same_world(base, installed):
    """Cities, road centres and every water ribbon must survive a range rebuild unchanged."""
    for c, d in zip(base['cities'], installed['cities']):
        if any(c.get(k) != d.get(k) for k in ('id', 'name', 'tier')) or any(abs(c[k] - d[k]) > .00011 for k in ('x', 'y', 'z', 'mx', 'mz', 'ms')): return False
    if len(base['cities']) != len(installed['cities']) or len(base['roads']) != len(installed['roads']): return False
    for r, old in zip(base['roads'], installed['roads']):
        centre = np.asarray(r['v']).reshape(-1, 2, 3).mean(axis=1)
        if not close_values(centre.ravel(), old['p']): return False
        nearest = lambda v: min(base['cities'], key=lambda c: (c['x']-v[0])**2 + (c['z']-v[2])**2)['id']
        if old.get('a') != nearest(centre[0]) or old.get('b') != nearest(centre[-1]): return False
    if len(base['water']) != len(installed['water']): return False
    for w, old in zip(base['water'], installed['water']):
        if w['kind'] != old['kind'] or not close_values(w['v'], old['v']): return False
        if (w['i'][::-1] if w['kind'] == 'lake' else w['i']) != old['i']: return False
        if w['kind'] == 'river':
            if not close_values(w['f'], old['f']): return False
            uv = [v for k in range(len(w['v'])//3) for v in (k//2*.12, k%2)]
            if not close_values(uv, old.get('uv', [])): return False
    return True


def same_layout(base, installed):
    """The exact preparation for a finished board, including every piece transform."""
    if not same_world(base, installed): return False
    old_pieces = installed['pieces']
    for k in set(old_pieces) | {p['k'] for p in base['place']}:
        arr = [[p['x'], p['y'], p['z'], p['ry'], p['s'], p.get('sx', 1)] for p in base['place'] if p['k'] == k]
        if not close_values(np.asarray(arr).reshape(-1), old_pieces.get(k, [])): return False
    return True


def board_instances(board, kind):
    flat = board['pieces'].get(kind, [])
    if len(flat) % 6 or not np.isfinite(np.asarray(flat, dtype=float)).all(): raise ValueError(f'invalid {kind} transforms in board.json')
    return [dict(zip(('k', 'x', 'y', 'z', 'ry', 's', 'sx'), (kind, *flat[i:i+6]))) for i in range(0, len(flat), 6)]


def base_matches_installed(ns, base, installed, shape):
    """Accept removed range-covered trees, but require all fixed features and uncovered instances to match."""
    if same_layout(base, installed): return True
    if not same_world(base, installed): return False
    ridge = [p for k in RANGE_ASPECT for p in board_instances(installed, k)]
    if not ridge: return False  # only a range installation can differ from the earlier preparation in this way
    mutable = {'massif', *RANGE_ASPECT, 'tree-broad', 'tree-pine', 'grove', 'hill'}
    fixed = (set(installed['pieces']) | {p['k'] for p in base['place']}) - mutable
    def rows(pieces):
        return np.asarray([(p['x'], p['y'], p['z'], p['ry'], p['s'], p.get('sx', 1)) for p in pieces], dtype=float).reshape(-1, 6)
    for kind in fixed:
        if not close_values(rows([p for p in base['place'] if p['k'] == kind]), rows(board_instances(installed, kind))): return False
    support = support_mask(ns, ridge, shape)
    for kind in ('tree-broad', 'tree-pine', 'grove', 'hill'):
        before = [p for p in base['place'] if p['k'] == kind and not clears_tree(ns, p, ridge, support)]
        after = [p for p in board_instances(installed, kind) if not clears_tree(ns, p, ridge, support)]
        if not close_values(rows(before), rows(after)): return False
    return True


def require_preparation(path, variable, names):
    missing = [name for name in names if not os.path.isfile(f'{path}/{name}')]
    if missing: raise FileNotFoundError(f"Missing {', '.join(missing)} in {path}; set {variable} to the matching local preparation directory.")


def original_preparation(ns, names):
    """The reviewed masks and terrain always derive from before the first range bake."""
    selected_work = ns['BASE_WORK']
    require_preparation(selected_work, 'SANDTABLE_BASE_WORK', ('place.json',))
    with open(f'{selected_work}/place.json') as f: selected = json.load(f)
    if not any(p['k'] in RANGE_ASPECT for p in selected['place']):
        require_preparation(selected_work, 'SANDTABLE_BASE_WORK', names)
        return selected_work, selected, selected
    original_work = ns['ORIGINAL_WORK']
    require_preparation(original_work, 'SANDTABLE_ORIGINAL_WORK', names)
    with open(f'{original_work}/place.json') as f: original = json.load(f)
    if any(p['k'] in RANGE_ASPECT for p in original['place']):
        raise ValueError(f'{original_work} already contains ranges; set SANDTABLE_ORIGINAL_WORK to the pre-range preparation')
    return original_work, original, selected


def matches_board_height(ns, ground, board, directory):
    sx, sz = (round(board['step'][0]/ns['DX']), round(board['step'][1]/ns['DZ']))
    w, h = board['grid']; grid = ground[::max(1, sz), ::max(1, sx)]
    packed = np.fromfile(f'{directory}/height.bin', dtype='<u2')
    if sx < 1 or sz < 1 or abs(board['step'][0]-ns['DX']*sx) > 1e-6 or abs(board['step'][1]-ns['DZ']*sz) > 1e-6 or grid.shape != (h, w) or len(packed) != w*h*2: return False
    lo, hi = board['h']; actual = lo + packed[:w*h].reshape(h, w).astype(np.float64)/65535*(hi-lo)
    return float(np.max(np.abs(actual-grid))) <= (hi-lo)/65535 + 1e-6


def massif_reference(ns):
    """Read the fixed 9eb6ba56 positions even after HEAD no longer contains a massif."""
    path = f"{ns['TOOLS']}/sandtable_massif_reference.json"
    with open(path) as f: data = json.load(f)
    rows = data['instances']
    if data.get('source_commit') != '9eb6ba56' or len(rows) != RANGE_BASELINE_MASSIFS or any(len(r) != 6 or not all(math.isfinite(v) for v in r) for r in rows):
        raise ValueError(f'invalid 9eb6ba56 massif reference: {path}')
    return [dict(zip(('x', 'y', 'z', 'ry', 's'), row[:5])) for row in rows]


def image_size(data):
    """Read PNG/JPEG dimensions without Pillow, which is absent from Blender's Python."""
    if data[:8] == b'\x89PNG\r\n\x1a\n':
        if len(data) < 24 or data[12:16] != b'IHDR': raise ValueError('truncated PNG header')
        width, height = struct.unpack('>II', data[16:24])
    elif data[:2] == b'\xff\xd8':
        # A JPEG's SOF marker may follow arbitrary metadata and quantisation segments.
        i, width, height = 2, 0, 0
        while i < len(data):
            if data[i] != 0xff: raise ValueError('invalid JPEG marker')
            while i < len(data) and data[i] == 0xff: i += 1
            if i >= len(data): break
            marker = data[i]; i += 1
            if marker in (0xd8, 0x01) or 0xd0 <= marker <= 0xd7: continue
            if marker in (0xd9, 0xda) or i + 2 > len(data): break
            length = int.from_bytes(data[i:i+2], 'big')
            if length < 2 or i + length > len(data): raise ValueError('truncated JPEG segment')
            if marker in (0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf):
                if length < 7: raise ValueError('truncated JPEG frame')
                height, width = struct.unpack('>HH', data[i+3:i+7]); break
            i += length
    else: raise ValueError('range texture must be PNG or JPEG')
    if not width or not height: raise ValueError('missing image dimensions')
    return width, height


def glb_stats(path):
    """Read actual indexed triangles, UVs and embedded image dimensions without Blender."""
    with open(path, 'rb') as f:
        magic, version, total = struct.unpack('<4sII', f.read(12))
        if magic != b'glTF' or version != 2: raise ValueError(f'{path}: not a glTF 2 GLB')
        n, kind = struct.unpack('<II', f.read(8))
        if kind != 0x4e4f534a: raise ValueError(f'{path}: missing glTF JSON')
        data = json.loads(f.read(n)); n, kind = struct.unpack('<II', f.read(8)); blob = f.read(n)
        if kind != 0x004e4942 or f.tell() != total: raise ValueError(f'{path}: missing or truncated binary chunk')
    access = data['accessors']; tris = 0; uv = True
    for mesh in data.get('meshes', []):
        for primitive in mesh['primitives']:
            if primitive.get('mode', 4) != 4: raise ValueError(f'{path}: expected triangle primitives')
            attrs = primitive['attributes']; uv &= 'TEXCOORD_0' in attrs
            count = access[primitive['indices']]['count'] if 'indices' in primitive else access[attrs['POSITION']]['count']
            if count % 3: raise ValueError(f'{path}: incomplete triangle')
            tris += count // 3
    images = []
    for im in data.get('images', []):
        view = data['bufferViews'][im['bufferView']]; start = view.get('byteOffset', 0)
        images.append(image_size(blob[start:start+view['byteLength']]))
    if not tris or not uv or len(data.get('materials', [])) != 1 or len(images) != 1:
        raise ValueError(f'{path}: needs nonempty triangles, UVs, one material and one embedded texture')
    return tris, images[0]


def check_topology(path):
    # glTF duplicates vertices at UV seams. The tree checker welds positions before measuring the actual surface.
    from check_sandtable_trees import WELD, accessor, inspect, read_glb
    mesh = inspect(path)
    defects = ('boundary_edges', 'nonmanifold_edges', 'nonmanifold_vertices', 'inconsistent_winding', 'degenerate')
    if len(mesh['components']) != 1 or any(mesh[k] for k in defects):
        raise ValueError(f"{path}: surface is not one closed, consistently wound manifold: "
                         f"components={len(mesh['components'])}, " + ', '.join(f"{k}={mesh[k]}" for k in defects))
    doc, binary = read_glb(path); volume, reversed_normals, triangles = 0., 0, 0
    for part in (p for m in doc['meshes'] for p in m['primitives']):
        attr = part['attributes']
        if 'NORMAL' not in attr: raise ValueError(f'{path}: missing smooth normals')
        positions = np.asarray(accessor(doc, binary, attr['POSITION']), dtype=np.float64)
        normals = np.asarray(accessor(doc, binary, attr['NORMAL']), dtype=np.float64)
        if normals.shape != positions.shape or not np.isfinite(normals).all(): raise ValueError(f'{path}: invalid normals')
        lengths = np.linalg.norm(normals, axis=1)
        if np.any((lengths < .9) | (lengths > 1.1)): raise ValueError(f'{path}: zero or non-unit normals')
        normals /= lengths[:, None]
        _, groups = np.unique(np.rint(positions / WELD).astype(np.int64), axis=0, return_inverse=True)
        averaged = np.zeros((groups.max()+1, 3)); np.add.at(averaged, groups, normals)
        averaged /= np.maximum(np.linalg.norm(averaged, axis=1)[:, None], 1e-12)
        if np.any(np.einsum('ij,ij->i', normals, averaged[groups]) < RANGE_NORMAL_SEAM_COS):
            raise ValueError(f'{path}: split or opposed normals at a welded UV seam')
        ids = np.asarray(accessor(doc, binary, part['indices']), dtype=np.int64).ravel() if 'indices' in part else np.arange(len(positions))
        ids = ids.reshape(-1, 3); triangles += len(ids); a, b, c = (positions[ids[:, i]] for i in range(3))
        face = np.cross(b-a, c-a); avg = normals[ids].sum(axis=1)
        dot = np.einsum('ij,ij->i', face, avg); scale = np.linalg.norm(face, axis=1) * np.linalg.norm(avg, axis=1)
        reversed_normals += int(np.count_nonzero(dot < -.05*scale))
        volume += float(np.einsum('ij,ij->i', a, np.cross(b, c)).sum() / 6)
    if volume <= 1e-9 or reversed_normals > max(1, math.ceil(triangles*RANGE_NORMAL_OUTLIER_FRACTION)):
        raise ValueError(f'{path}: inward faces or normals (signed volume {volume:.6g}, reversed normals {reversed_normals})')
    print(f"{os.path.basename(path)}: closed surface, boundary/nonmanifold edges 0/0, normal outliers {reversed_normals}/{triangles}", flush=True)
    return mesh


def check_models(dest, pieces, game, game_far):
    counts = Counter(p['k'] for p in pieces); total_near = total_far = area = 0
    for name in RANGE_ASPECT:
        near, near_image = glb_stats(f'{dest}/models/{name}.glb')
        far, far_image = glb_stats(f'{dest}/models/{name}-far.glb')
        near_mesh = check_topology(f'{dest}/models/{name}.glb'); far_mesh = check_topology(f'{dest}/models/{name}-far.glb')
        if any(far_mesh['uv_min'][i] < near_mesh['uv_min'][i] - 1e-4 or far_mesh['uv_max'][i] > near_mesh['uv_max'][i] + 1e-4 for i in range(2)):
            raise ValueError(f'{name}: far UV coordinates leave the near paint atlas')
        if near > game[name][0] or far > game_far[name]: raise ValueError(f'{name}: range GLB exceeds triangle budget')
        if max(near_image) > game[name][1] or max(far_image) > 4: raise ValueError(f'{name}: range GLB exceeds texture budget')
        total_near += near * counts[name]; total_far += far * counts[name]; area += near_image[0]*near_image[1]
        print(f'{name}: {counts[name]} instances, {near}/{far} triangles, near/far textures {near_image}/{far_image}', flush=True)
    if total_near > RANGE_NEAR_TRIANGLES or total_far > RANGE_FAR_TRIANGLES or area > RANGE_TEXELS:
        raise ValueError(f'ranges exceed board budget: triangles {total_near}/{total_far}, texture area {area}')
    if total_near + counts['massif'] * game['massif'][0] > RANGE_BASELINE_MASSIFS * game['massif'][0] or \
       total_far + counts['massif'] * game_far['massif'] > RANGE_BASELINE_MASSIFS * game_far['massif']:
        raise ValueError('partial rebuild exceeds the old board-wide massif triangle budget')
    print(f'ranges total: {total_near} near, {total_far} far triangles; {area} colour texels (two 1024² images)', flush=True)
    return total_near, total_far, area


def feature_masks(ns, shape, ground, layout):
    """Separate reviewed obstacles so an uncovered old massif has an auditable reason."""
    if Image is None: raise RuntimeError('range preparation requires Pillow in system python3')
    base = ns['BASE_WORK']; w, h = shape[1], shape[0]
    road = np.asarray(Image.open(f'{base}/road-alpha.png').convert('L').resize((w, h), Image.Resampling.NEAREST)) < 255
    pads = np.asarray(Image.open(f'{base}/pads.png').convert('L').resize((w, h), Image.Resampling.NEAREST)) > 0
    water = (ground['Lv'] > 0) | (ground['G'] <= ns['SEA_Y'] + .03)
    city, hamlet = np.zeros(shape, dtype=bool), np.zeros(shape, dtype=bool)
    x0, z0, dx, dz, size, tiers = (ns[n] for n in ('X0', 'Z0', 'DX', 'DZ', 'SIZE', 'TIER'))
    xx = x0 + np.arange(w)[None, :] * dx; zz = z0 + np.arange(h)[:, None] * dz
    for c in layout['cities']:
        wall = size[tiers[c['tier']]] * c['ms'] / 2 + RANGE_WALL_CLEAR
        city |= (np.abs(xx-c['mx']) <= wall) & (np.abs(zz-c['mz']) <= wall)
    for p in layout['place']:
        if p['k'] != 'hamlet': continue
        j, k = round((p['z'] - z0) / dz), round((p['x'] - x0) / dx)
        r = .18 * p['s']; jj = max(1, math.ceil(r / dz)); kk = max(1, math.ceil(r / dx))
        hamlet[max(0,j-jj):j+jj+1, max(0,k-kk):k+kk+1] = True
    return {'road': road, 'water': water, 'city/pad': city | pads, 'hamlet': hamlet}


def feature_mask(ns, shape, ground, layout):
    """The reviewed road and pad pixels, city walls, water and hamlets; no broad K feather in placement."""
    return np.logical_or.reduce(list(feature_masks(ns, shape, ground, layout).values()))


def plan(ns, ground, base, keep=None, fixed=(), limit=RANGE_LIMIT, references=None, legacy=(), previous_report=None):
    """Trace both directions along smoothed height ridges, rejecting whole footprints across protected features."""
    G, H0, Lv, K = (ground[n].copy() for n in ('G', 'H0', 'Lv', 'K'))
    x0, z0, dx, dz, size, tiers = (ns[n] for n in ('X0', 'Z0', 'DX', 'DZ', 'SIZE', 'TIER'))
    rng = np.random.default_rng(RANGE_RNG_SEED)
    h = blur(H0, 3); hb = blur(H0, RANGE_BLUR)
    gz, gx = np.gradient(hb, dz, dx); hzz, hzx = np.gradient(gz, dz, dx); _, hxx = np.gradient(gx, dz, dx)
    lam = (hxx + hzz) / 2 - np.sqrt(np.maximum(0, (hxx - hzz) ** 2 / 4 + hzx * hzx))
    theta = .5 * np.arctan2(2 * hzx, hxx - hzz)
    masks = feature_masks(ns, G.shape, ground, base); blocked = np.logical_or.reduce(list(masks.values()))
    body = (h > RANGE_HEIGHT[0]) & (h < RANGE_HEIGHT[1]) & ~blocked
    score = np.where(body, np.maximum(0, -lam), 0)
    if not body.any(): return G, [], np.zeros_like(G), [], []
    score /= np.percentile(score[body], 90) + 1e-6
    score = np.where(score > RANGE_CREST, score + h, 0)
    priority = np.zeros_like(score, dtype=bool); priority_distance = np.full_like(score, np.inf)
    gx_ = x0 + np.arange(G.shape[1])[None, :] * dx; gz_ = z0 + np.arange(G.shape[0])[:, None] * dz
    for name, off_x, off_z, radius in RANGE_PRIORITY:
        city = next((c for c in base['cities'] if c['name'] == name), None)
        if city is None: continue
        d2 = (gx_ - city['mx'] - off_x)**2 + (gz_ - city['mz'] - off_z)**2
        priority |= d2 <= radius**2
        priority_distance = np.minimum(priority_distance, d2 / radius**2)
    protected = terrain_protected_mask(ns, G.shape, ground, base, blocked)
    terrain = blur(G, RANGE_TERRAIN_BLUR)
    xx = x0 + np.arange(G.shape[1])[None, :] * dx; zz = z0 + np.arange(G.shape[0])[:, None] * dz
    support_cap = np.full_like(G, np.inf)
    for c in base['cities']:
        wall = size[tiers[c['tier']]]*c['ms']/2; dz_ = zz-c['mz']
        corridor = (np.abs(xx-c['mx']) < wall+.35) & (dz_ > wall) & (dz_ < wall+1.5)
        line = c['y']+.05+(dz_-wall)*ns['SIGHT']
        support_cap = np.minimum(support_cap, np.where(corridor, np.maximum(ground['G'], line), np.inf))
    def seat(p):
        # Protected road/bank cells cannot rise to meet a model: lower that model, unless it would be buried.
        region_ = bottom_region(p, size, x0, z0, dx, dz, G.shape)
        if region_ is None: return None
        sl, bottom = region_; allowed = np.minimum(np.where(protected[sl], G[sl], np.inf), support_cap[sl])
        original = p.setdefault('_seat_origin', p['y'])
        target = min(p['y'], float(allowed[bottom].min()) - RANGE_FOOT_EMBED) if bottom.any() else p['y']
        if original-target > RANGE_SEAT_MAX_SINK: return None
        j, k = round((p['z']-z0)/dz), round((p['x']-x0)/dx)
        height = size[p['k']]*p['s']*RANGE_ASPECT[p['k']][1]*RANGE_VERTICAL[p['k']]
        if protected[j,k] and G[j,k] > target+height*(1-RANGE_MIN_VISIBLE): return None
        p['y'] = target
        return p
    bounds = lambda x, z: keep is None or (keep[0] <= x <= keep[1] and keep[2] <= z <= keep[3])
    pieces = [{**p, 'chain': i, '_fixed': True} for i, p in enumerate(fixed)]
    parent, rejects = list(range(len(pieces))), Counter()
    if len(pieces) > limit: raise ValueError('retained ranges already exceed the instance budget')
    def root(a):
        while parent[a] != a: parent[a] = parent[parent[a]]; a = parent[a]
        return a
    def join(a, b): parent[root(a)] = root(b)
    for i, p in enumerate(pieces):
        for q in pieces[:i]:
            d = math.hypot(p['x']-q['x'], p['z']-q['z'])
            if .01 < d < .95 * min(size[p['k']]*p['s'], size[q['k']]*q['s']) and abs(math.cos(p['ry']-q['ry'])) > .8 and outlines_overlap(p, q, size):
                along = abs(((q['x']-p['x'])*math.cos(p['ry']) - (q['z']-p['z'])*math.sin(p['ry'])) / d)
                if along > .8: join(p['chain'], q['chain'])
    def nearest(x, z, cur, direction, step, options, spacing):
        j0, j1 = max(0, int((z - RANGE_SNAP - z0) / dz)), min(h.shape[0], int((z + RANGE_SNAP - z0) / dz) + 1)
        k0, k1 = max(0, int((x - RANGE_SNAP - x0) / dx)), min(h.shape[1], int((x + RANGE_SNAP - x0) / dx) + 1)
        if j0 >= j1 or k0 >= k1: return []
        w = score[j0:j1, k0:k1]
        if not w.size: return []
        xx = x0 + np.arange(k0, k1)[None, :] * dx; zz = z0 + np.arange(j0, j1)[:, None] * dz
        vx, vz = xx - cur[0], zz - cur[1]; dist = np.hypot(vx, vz)
        forward = vx * direction[0] + vz * direction[1]
        shallow = (h[j0:j1, k0:k1] > RANGE_HEIGHT[0]*RANGE_GAP_HEIGHT) & (h[j0:j1, k0:k1] < RANGE_HEIGHT[1])
        valid = ((w > 0) | shallow) & (dist >= step*.65) & (dist <= step*1.12) & (forward >= dist*RANGE_TURN)
        if not valid.any(): return []
        # Prefer the predicted point on the crest; a distant local maximum makes a discontinuous zigzag.
        quality = np.where(valid, np.maximum(w, .3) - 2*np.hypot(xx-x, zz-z) / RANGE_SNAP, -1e9)
        ranked = np.argsort(quality.ravel())[-RANGE_TRACE_CANDIDATES:][::-1]; result = []
        for i in ranked:
            if quality.flat[i] <= -1e8: break
            jj, kk = j0 + i // w.shape[1], k0 + i % w.shape[1]
            if any(math.hypot((kk-k2)*dx, (jj-j2)*dz) < spacing for j2, k2, _ in result): continue
            result.append((jj, kk, score[jj, kk] <= 0))
            if len(result) == options: break
        return result
    def lay(j, k, direction, chain, previous=None):
        x, z = x0 + k * dx, z0 + j * dz
        if not bounds(x, z): rejects['outside'] += 1; return None
        scale = float(np.clip(RANGE_SCALE[0] + (h[j, k] - RANGE_HEIGHT[0]) * RANGE_HEIGHT_GAIN, *RANGE_SCALE))
        preferred = len(pieces) % 2
        heading = math.atan2(-direction[1], direction[0]) + (math.pi if rng.random() < .5 else 0)
        # Seat it on the smoothed local ridge; the old rough terrain is calmed under the new mesh below.
        radius = RANGE_FOOT_RADIUS
        foot = float(np.percentile(terrain[max(0, j-radius):j+radius+1, max(0, k-radius):k+radius+1], RANGE_FOOT_PERCENTILE))
        p = None
        for variant, flip, turn in ((v, f, t) for v in (preferred, 1-preferred) for f in (0., math.pi) for t in RANGE_TURNS):
            kind = ns['RANGE_KINDS'][variant]; length = scale; ry = heading + flip + turn
            candidate = {'k': kind, 'x': x, 'z': z, 'y': foot - RANGE_FOOT_SINK * length, 'ry': ry, 's': length, 'chain': chain,
                         '_priority': bool(priority[j, k]), '_strength': float(score[j, k])}
            candidate['_seat_origin'] = candidate['y']
            if previous is not None and math.hypot(x-previous['x'], z-previous['z']) > .97 * (size[kind]*length + size[previous['k']]*previous['s']) / 2:
                rejects['chain gap'] += 1; break
            if previous is not None and not outlines_overlap(candidate, previous, size):
                rejects['chain gap'] += 1; continue
            _, _, ca, sa, a, b = footprint(candidate, size, mound_extra(candidate, size) if keep is not None else RANGE_MARGIN)
            rx, rz = (abs(ca)*a + abs(sa)*b)*RANGE_OUTLINE_EXTENT, (abs(sa)*a + abs(ca)*b)*RANGE_OUTLINE_EXTENT
            if x-rx < ns['X0'] or x+rx > ns['X1'] or z-rz < ns['Z0'] or z+rz > ns['Z1']:
                rejects['board edge'] += 1; continue
            if keep is not None and (x-rx < keep[0] or x+rx > keep[1] or z-rz < keep[2] or z+rz > keep[3]):
                rejects['keep edge'] += 1; continue
            r = region(candidate, size, x0, z0, dx, dz, G.shape, RANGE_MARGIN)
            if r is None or np.any(blocked[r[0]] & in_outline(kind, r[1], r[2])): rejects['road/water/pad/hamlet'] += 1; continue
            top = candidate['y'] + size[kind]*length*RANGE_ASPECT[kind][1]*RANGE_VERTICAL[kind]*RANGE_HEIGHT_GUARD
            sink = max(0., top - sight_ceiling(candidate, base['cities'], size, tiers))
            if sink > RANGE_SIGHT_MAX_SINK: rejects['sight'] += 1; continue
            candidate['y'] -= sink
            p = candidate; break
        if p is None: return None
        joins = []
        for q in pieces:
            d = math.hypot(q['x'] - x, q['z'] - z)
            unit = min(size[kind] * length, size[q['k']] * q['s'])
            overlap = d < .95 * unit and outlines_overlap(p, q, size)
            if overlap and root(q['chain']) != root(chain) and d > .35 and abs(math.cos(q['ry'] - ry)) > .8:
                # Only join where their long axes point toward each other, so proximity across a valley is not a chain.
                along = abs(((q['x'] - x)*math.cos(ry) - (q['z'] - z)*math.sin(ry)) / d)
                if along > .8:
                    if previous is None: rejects['joined'] += 1; return None  # a seed at an existing chain adds nothing
                    joins.append(q['chain'])
                else: rejects['pile'] += 1; return None
            elif overlap and root(q['chain']) != root(chain): rejects['pile'] += 1; return None
            if d < RANGE_APART * unit:
                rejects['overlap'] += 1; return None
        pieces.append(p)
        for other in joins: join(chain, other)  # the added bridge segment must exist before the chains are joined
        if joins: rejects['joined'] += 1
        return p
    seeds = np.argwhere(score > 0); seeds = seeds[np.argsort(-score[seeds[:, 0], seeds[:, 1]])]
    primary = seeds[priority[seeds[:, 0], seeds[:, 1]]]
    primary = primary[np.argsort(priority_distance[primary[:, 0], primary[:, 1]], kind='stable')]
    secondary = seeds[~priority[seeds[:, 0], seeds[:, 1]]][::RANGE_SEED_STRIDE]
    # Scan the narrow Qinling/Taihang corridors completely; sampling by rank can miss their only road-free sites.
    for j, k in np.concatenate((primary, secondary)):
        if len(pieces) >= limit: break
        x, z = x0 + k * dx, z0 + j * dz
        if any(math.hypot(p['x'] - x, p['z'] - z) < RANGE_APART * size[p['k']] * p['s'] for p in pieces): continue
        direction = np.array([math.cos(theta[j, k]), math.sin(theta[j, k])]); chain = len(parent); parent.append(chain)
        first = lay(j, k, direction, chain)
        if first is None: parent.pop(); continue
        for sign in (1, -1):
            # Follow the actual placed long axis, including any turn needed to clear a road or hamlet.
            axis = np.array([math.cos(first['ry']), -math.sin(first['ry'])])
            cur, d, step, gaps, last = np.array([x, z]), axis * sign, size[first['k']] * first['s'] * RANGE_STEP, 0, first
            for _ in range(RANGE_MAX_STEPS):
                if len(pieces) >= limit: break
                placed, joined, next_gaps = None, False, 0
                options, spacing = ((RANGE_PRIORITY_TRACE_OPTIONS, RANGE_PRIORITY_TRACE_SPACING) if last['_priority'] else
                                    (RANGE_TRACE_OPTIONS, RANGE_TRACE_SPACING))
                for found in nearest(*(cur + d * step), cur, d, step, options, spacing):
                    next_gaps = gaps + 1 if found[2] else 0
                    if next_gaps > RANGE_GAP_STEPS: continue
                    nxt = np.array([x0 + found[1] * dx, z0 + found[0] * dz]); nd = nxt - cur; dist = float(np.hypot(*nd))
                    if dist < step * .6 or dist > step * 1.15 or float(nd @ d) / dist < RANGE_TURN: continue
                    nd /= dist; before = rejects['joined']; placed = lay(*found[:2], nd, chain, last)
                    joined = rejects['joined'] != before
                    if placed is not None or joined: break
                if placed is None: break  # an obstacle cuts the crest into a visible pass
                gaps = next_gaps
                cur, d, step, last = nxt, nd, size[placed['k']] * placed['s'] * RANGE_STEP, placed
    print(f'accepted before alignment filter: {len(pieces)}', flush=True)
    pieces = [p for p in pieces if p.get('_fixed') or seat(p) is not None]
    # Resolve overlaps globally, not just between different chain IDs: a curved trace can double back across itself.
    # Stronger crest sites win; --keep's fixed outside pieces remain untouched and take precedence over new ones.
    ranked = sorted(enumerate(pieces), key=lambda t: (not t[1].get('_fixed'), -t[1].get('_strength', 0), t[0]))
    kept, rejected = [], set()
    for i, p in ranked:
        conflict = next((pair_relation(p, q, size) for _, q in kept
                         if not (p.get('_fixed') and q.get('_fixed')) and pair_relation(p, q, size) in ('too close', 'crossing', 'parallel', 'buried')), None)
        if conflict: rejects[conflict] += 1; rejected.add(i)
        else: kept.append((i, p))
    pieces = [p for i, p in enumerate(pieces) if i not in rejected]
    references = references if references is not None else [p for p in base['place'] if p['k'] == 'massif']
    reference_xy = np.array([(p['x'], p['z']) for p in references], dtype=float).reshape(-1, 2)
    def covered(ps):
        if not len(reference_xy) or not ps: return np.zeros(len(reference_xy), dtype=bool)
        xy = np.array([(p['x'], p['z']) for p in ps]); return np.min(np.linalg.norm(reference_xy[:, None] - xy[None, :], axis=2), axis=1) <= RANGE_REFERENCE_DISTANCE + 1e-8
    def candidate(j, k, kind, ry, row, failures, scale_override=None):
        x, z = x0 + k*dx, z0 + j*dz
        if not bounds(x, z): failures['outside keep'] += 1; return None
        scale = (scale_override if scale_override is not None else RANGE_ROW_SCALE if row else
                 float(np.clip(RANGE_SCALE[0] + (h[j,k]-RANGE_HEIGHT[0])*RANGE_HEIGHT_GAIN, *RANGE_SCALE)))
        radius = RANGE_FOOT_RADIUS
        foot = float(np.percentile(terrain[max(0,j-radius):j+radius+1, max(0,k-radius):k+radius+1], RANGE_FOOT_PERCENTILE))
        p = {'k': kind, 'x': x, 'z': z, 'y': foot-RANGE_FOOT_SINK*scale-(RANGE_ROW_HEIGHT_SINK if row else 0),
             'ry': float(ry), 's': scale, 'row': int(row), '_strength': float(score[j,k])}
        _, _, ca, sa, a, b = footprint(p, size, mound_extra(p, size) if keep is not None else RANGE_MARGIN)
        rx, rz = (abs(ca)*a + abs(sa)*b)*RANGE_OUTLINE_EXTENT, (abs(sa)*a + abs(ca)*b)*RANGE_OUTLINE_EXTENT
        if x-rx < ns['X0'] or x+rx > ns['X1'] or z-rz < ns['Z0'] or z+rz > ns['Z1']:
            failures['board edge'] += 1; return None
        if keep is not None and (x-rx < keep[0] or x+rx > keep[1] or z-rz < keep[2] or z+rz > keep[3]):
            failures['outside keep'] += 1; return None
        sl, u, v = region(p, size, x0, z0, dx, dz, G.shape, RANGE_MARGIN); outline = in_outline(kind, u, v)
        hit = [name for name, mask in masks.items() if np.any(mask[sl] & outline)]
        if hit:
            for name in hit: failures[name] += 1
            return None
        if seat(p) is None: failures['protected terrain support'] += 1; return None
        top = p['y'] + size[kind]*scale*RANGE_ASPECT[kind][1]*RANGE_VERTICAL[kind]*RANGE_HEIGHT_GUARD
        sink = max(0., top-sight_ceiling(p, base['cities'], size, tiers))
        if sink > RANGE_SIGHT_MAX_SINK or p['_seat_origin']-(p['y']-sink) > RANGE_SEAT_MAX_SINK:
            failures['sight'] += 1; return None
        p['y'] -= sink
        return p
    def compatible(p, existing):
        relations = [(q, pair_relation(p, q, size)) for q in existing]
        bad = [q for q, relation in relations if relation in ('crossing', 'parallel', 'too close', 'buried')]
        row = any(relation == 'row' for _, relation in relations)
        return bad, row
    # Generate varied, real-footprint candidates around the committed old massif positions. Hardest sites go first.
    options, failures = {}, {}
    for i, ref in enumerate(references):
        if covered(pieces)[i] or not bounds(ref['x'], ref['z']): continue
        failed, found, seen = Counter(), [], set()
        for radius in RANGE_REFERENCE_RADII:
            for angle in (np.linspace(0, math.tau, RANGE_REFERENCE_DIRECTIONS, endpoint=False) if radius else (0.,)):
                j = round((ref['z']+radius*math.sin(angle)-z0)/dz); k = round((ref['x']+radius*math.cos(angle)-x0)/dx)
                if (j,k) in seen or not (0 <= j < G.shape[0] and 0 <= k < G.shape[1]): continue
                seen.add((j,k)); x,z = x0+k*dx,z0+j*dz
                if math.hypot(x-ref['x'],z-ref['z']) > RANGE_REFERENCE_DISTANCE: continue
                headings = [-float(theta[j,k])+t for t in RANGE_REFERENCE_ANGLES]
                headings += [ref['ry']+t for t in np.linspace(0, math.tau, RANGE_REFERENCE_DIRECTIONS, endpoint=False)]
                for row, scale in ((0, None), (0, RANGE_ROW_SCALE), (1, None)):
                    found_here = 0
                    for kind in (ns['RANGE_KINDS'][(i+row)%2], ns['RANGE_KINDS'][(i+row+1)%2]):
                        for heading in headings:
                            p = candidate(j, k, kind, heading, row, failed, scale)
                            if p is None: continue
                            found.append(p); found_here += 1
                            if found_here == 4: break
                        if found_here == 4: break
        options[i], failures[i] = found, failed
    for i in sorted(options, key=lambda n: len(options[n])):
        if covered(pieces)[i]: continue
        if len(pieces) >= limit: failures[i]['triangle budget'] += 1; continue
        need = ~covered(pieces)
        def quality(p):
            delta = reference_xy-np.array([p['x'],p['z']]); gain = int(np.count_nonzero(need & (np.linalg.norm(delta,axis=1) <= RANGE_REFERENCE_DISTANCE)))
            return (-gain, math.hypot(p['x']-references[i]['x'], p['z']-references[i]['z']), p['row'])
        ordered = sorted(options[i], key=quality); selected = None
        for p in ordered:
            bad, is_row = compatible(p, pieces)
            if not bad and (not p['row'] or is_row): selected = p; break
            if p['row'] and not is_row:
                q = {**p, 'row': 0}; bad, _ = compatible(q, pieces)
                if not bad: selected = q; break  # a lower isolated crest can still cover a constrained old site
        if selected is None:
            # An old trace piece may occupy a more valuable site. Replace it only if no previously covered old site is lost.
            before = covered(pieces)
            for p in ordered:
                bad, is_row = compatible(p, pieces)
                if len(bad) > 2 or any(q.get('_fixed') for q in bad): continue
                remain = [q for q in pieces if all(q is not x for x in bad)]
                if p['row'] and not compatible(p, remain)[1]: continue
                after = covered(remain+[p])
                if np.all(after[before]) and after.sum() > before.sum(): pieces = remain; selected = p; break
        if selected is not None: selected['_priority'] = True; pieces.append(selected)
        elif options[i]: failures[i]['range overlap'] += 1
    # A coarse ring can miss a narrow road-free slot. For remaining old sites, test every ground-grid centre and
    # ten-degree rotation at the minimum scale; vectorising the raster footprint keeps the retry a preparation cost.
    for i in np.flatnonzero(~covered(pieces)):
        if len(pieces) >= limit or not bounds(references[i]['x'], references[i]['z']): continue
        ref = references[i]; j0 = round((ref['z']-z0)/dz); k0 = round((ref['x']-x0)/dx)
        jj, kk = np.mgrid[max(0,j0-math.ceil(RANGE_REFERENCE_DISTANCE/dz)):min(G.shape[0],j0+math.ceil(RANGE_REFERENCE_DISTANCE/dz)+1),
                          max(0,k0-math.ceil(RANGE_REFERENCE_DISTANCE/dx)):min(G.shape[1],k0+math.ceil(RANGE_REFERENCE_DISTANCE/dx)+1)]
        dd = np.hypot(x0+kk*dx-ref['x'], z0+jj*dz-ref['z']); js, ks, dist = jj[dd <= RANGE_REFERENCE_DISTANCE], kk[dd <= RANGE_REFERENCE_DISTANCE], dd[dd <= RANGE_REFERENCE_DISTANCE]
        order = np.argsort(dist); js, ks = js[order], ks[order]; chosen = None; dense_legal = 0
        for kind in ns['RANGE_KINDS']:
            for heading in np.linspace(0, math.tau, RANGE_REFERENCE_DENSE_ANGLES, endpoint=False):
                probe = {'k': kind, 'x': x0+k0*dx, 'z': z0+j0*dz, 's': RANGE_ROW_SCALE, 'ry': float(heading)}
                test_region = region(probe, size, x0, z0, dx, dz, G.shape, RANGE_MARGIN)
                if test_region is None: continue
                sl, u, v = test_region; y, x = np.nonzero(in_outline(kind, u, v)); oy, ox = y+sl[0].start-j0, x+sl[1].start-k0
                if not len(oy): continue
                valid = ((js+oy.min() >= 0) & (js+oy.max() < G.shape[0]) & (ks+ox.min() >= 0) & (ks+ox.max() < G.shape[1]))
                good_j, good_k = js[valid], ks[valid]
                clear = ~np.any(blocked[good_j[:,None]+oy[None,:], good_k[:,None]+ox[None,:]], axis=1)
                for j,k in zip(good_j[clear],good_k[clear]):
                    for row in (0, 1):
                        p = candidate(int(j), int(k), kind, heading, row, failures[i], RANGE_ROW_SCALE)
                        if p is None: continue
                        dense_legal += 1; bad, is_row = compatible(p, pieces)
                        if not bad and (not row or is_row): chosen = p; break
                    if chosen is not None: break
                if chosen is not None: break
            if chosen is not None: break
        if chosen is not None:
            chosen['_priority'] = True; pieces.append(chosen)
            failures[i]['dense fit'] += 1
        else:
            failures[i]['dense legal candidates'] += dense_legal
    # Add a lower row alongside broad western/central ranges, staggered so its peaks interleave with the crest.
    main = [p for p in pieces if not p.get('row') and not p.get('_fixed')]
    xlo, xhi, zlo, zhi = RANGE_ROW_FOCUS
    main.sort(key=lambda p: (not (xlo <= p['x'] <= xhi and zlo <= p['z'] <= zhi), -p.get('_strength',0)))
    for p in main:
        if len(pieces) >= limit or sum(bool(q.get('row')) for q in pieces) >= RANGE_ROW_LIMIT: break
        length = size[p['k']]*p['s']; width = length*RANGE_ASPECT[p['k']][0]
        ca, sa = math.cos(p['ry']), -math.sin(p['ry'])
        added = False
        for side in (-1, 1):
            for phase in RANGE_ROW_PHASE:
                for offset in RANGE_ROW_OFFSET:
                    x = p['x'] + ca*length*phase - sa*side*width*offset
                    z = p['z'] + sa*length*phase + ca*side*width*offset
                    j, k = round((z-z0)/dz), round((x-x0)/dx)
                    if not (0 <= j < G.shape[0] and 0 <= k < G.shape[1]): continue
                    for kind in (ns['RANGE_KINDS'][(len(pieces)+1)%2], ns['RANGE_KINDS'][len(pieces)%2]):
                        for flip in (0., math.pi):
                            failed = Counter(); q = candidate(j, k, kind, p['ry']+flip, 1, failed)
                            if q is None: continue
                            bad, is_row = compatible(q, pieces)
                            if not bad and is_row: pieces.append(q); added = True; break
                        if added: break
                    if added: break
                if added: break
            if added: break
    # Rebuild the chain graph after removals: a discarded connector must not leave a phantom chain in the report.
    parent = list(range(len(pieces)))
    for i, p in enumerate(pieces):
        p['chain'] = i
        for q in pieces[:i]:
            if pair_relation(p, q, size) in ('join', 'row'): join(i, q['chain'])
    groups = {}
    for p in pieces: groups.setdefault(root(p['chain']), []).append(p)
    # Isolated low ridges are clutter, but a genuinely high isolated summit may remain.
    pieces = [p for group in groups.values() for p in group if p.get('_fixed') or p.get('_priority') or len(group) > 1 or h[round((p['z']-z0)/dz), round((p['x']-x0)/dx)] > RANGE_ISOLATED_HEIGHT]
    # This provisional result controls the already-reviewed ground smoothing; the report is built after seating.
    now = covered(pieces)
    support = support_mask(ns, pieces, G.shape)
    for tree in base['place']:
        if tree['k'] not in ('tree-broad', 'tree-pine', 'grove', 'hill'): continue
        if clears_tree(ns, tree, pieces, support): continue
        # A surviving piece keeps the exact old ground under its feet, even in a feathered mound edge.
        j, k = round((tree['z']-z0)/dz), round((tree['x']-x0)/dx)
        jj, kk = math.ceil(RANGE_TREE_FOOT/dz), math.ceil(RANGE_TREE_FOOT/dx)
        protected[max(0,j-jj):j+jj+1,max(0,k-kk):k+kk+1] = True
    for p in pieces:
        if not p.get('_fixed') and seat(p) is None: raise ValueError(f"{p['k']} would be buried by protected terrain near {p['x']:.2f},{p['z']:.2f}")
    empty = [ref for i, ref in enumerate(references) if not now[i] and bounds(ref['x'], ref['z'])]
    if empty:
        occupied = np.zeros_like(G, dtype=bool)
        for p in pieces:
            sl, u, v = region(p, size, x0, z0, dx, dz, G.shape)
            occupied[sl] |= in_outline(p['k'], u, v)
        calm = blur(G, RANGE_EMPTY_BLUR)
        for ref in empty:
            dist = np.hypot(xx-ref['x'], zz-ref['z']); w = (1-ease(dist, 0, RANGE_EMPTY_RADIUS)) * (~protected & ~occupied)
            if keep is not None: w *= (xx >= keep[0]) & (xx <= keep[1]) & (zz >= keep[2]) & (zz <= keep[3])
            G += (np.minimum(G, calm)-G)*w
            G = np.where(w > 0, np.maximum(G, ns['SEA_Y']+.01), G)
    coverage, rise = np.zeros_like(G), np.zeros_like(G)
    for p in pieces:
        if p.get('_fixed'): continue
        extra = mound_extra(p, size)
        r = region(p, size, x0, z0, dx, dz, G.shape, extra)
        if r is None: continue
        sl, u, v = r; _, _, _, _, a, b = footprint(p, size)
        u, v = u*(a+extra)/a, v*(b+extra)/b
        dist = (np.abs(u)**RANGE_MOUND_ROUNDNESS + np.abs(v)**RANGE_MOUND_ROUNDNESS)**(1/RANGE_MOUND_ROUNDNESS)
        weight = (1 - ease(dist, RANGE_MOUND_INNER, RANGE_MOUND_OUTER)) * (~protected[sl])
        target = p['y'] + RANGE_MOUND_HEIGHT * p['s'] * (1 - ease(dist, 1., RANGE_MOUND_OUTER))
        # Clear the old baked crest inside the replacement while the new mesh and shared rounded ground form one body.
        G[sl] += (np.minimum(terrain[sl], target + RANGE_MOUND_CAP*p['s']) - G[sl]) * weight
        G[sl] += np.maximum(target - G[sl], 0) * weight
        G[sl] = np.where(weight > 0, np.maximum(G[sl], ns['SEA_Y'] + .01), G[sl])  # no new sea-plane holes inland
        coverage[sl] = np.maximum(coverage[sl], weight)
        room = np.maximum(0, p['y'] + (RANGE_MOUND_HEIGHT + RANGE_MOUND_CAP) * p['s'] - G[sl])
        rise[sl] = np.maximum(rise[sl], np.minimum(room, RANGE_MOUND_LIFT * p['s'] * weight))  # overlap shares one rise, it never stacks humps
    G += rise
    # Fill and reseat until they agree: the fill can rise over a piece standing below high ground (the plateau's
    # ranges vanished under it), so such a piece is lifted onto the filled ground and the fill is run again.
    for seat_pass in range(RANGE_SEAT_PASSES):
        for p in pieces:
            if p.get('_fixed'): continue
            sl, bottom = bottom_region(p, size, x0, z0, dx, dz, G.shape)
            # The model's underside is flat: fill beneath the tapered ends too, but never raise a protected feature.
            G[sl] = np.where(bottom & ~protected[sl], np.maximum(G[sl], p['y']+RANGE_FOOT_EMBED), G[sl])
            coverage[sl] = np.maximum(coverage[sl], bottom & ~protected[sl])
        # Seating a piece in high ground left it in a pit with near-vertical, stripe-textured walls (review 4). No wall
        # stays: within reach of the ranges the ground is filled, upward only, until no slope toward a neighbour exceeds
        # RANGE_TALUS degrees, so higher ground runs down onto the piece's flank instead of ending in a lip. Roads, water
        # and city pads (protected) are never raised.
        reach = (blur((coverage > 0).astype(np.float32), RANGE_TALUS_REACH) > 0) & ~protected
        if keep is not None: reach &= (xx >= keep[0]) & (xx <= keep[1]) & (zz >= keep[2]) & (zz <= keep[3])  # --keep leaves the rest of the board as staged
        if reach.any():
            t = math.tan(math.radians(RANGE_TALUS)); before_fill = G.copy()
            steps = [(0, 1, dx), (0, -1, dx), (1, 0, dz), (-1, 0, dz), (1, 1, math.hypot(dx, dz)), (1, -1, math.hypot(dx, dz)), (-1, 1, math.hypot(dx, dz)), (-1, -1, math.hypot(dx, dz))]
            for it in range(RANGE_TALUS_STEPS):
                best = G.copy()
                for dj, dk, d in steps:
                    n = np.full_like(G, -np.inf)
                    n[max(0, dj):G.shape[0]+min(0, dj), max(0, dk):G.shape[1]+min(0, dk)] = G[max(0, -dj):G.shape[0]+min(0, -dj), max(0, -dk):G.shape[1]+min(0, -dk)]
                    best = np.maximum(best, n - t * d)
                new = np.where(reach, np.minimum(best, np.maximum(G, ground['G'] + RANGE_TALUS_OVER)), G)  # refill the cut, never pile above the accepted ground
                if float(np.max(new - G)) < 1e-4: break
                G = new
            print(f'talus fill: {int(np.count_nonzero(G - before_fill > .01))} cells raised, most {float(np.max(G - before_fill)):.3f}, {it + 1} passes', flush=True)
        def seat_cap(p):
            # A lifted piece may not rise over a city's sight line, nor off a road, bank or pad under a tapered end.
            top = size[p['k']] * p['s'] * RANGE_ASPECT[p['k']][1] * RANGE_VERTICAL[p['k']] * RANGE_HEIGHT_GUARD
            cap = sight_ceiling(p, base['cities'], size, tiers) - top - 1e-6
            sl, bottom = bottom_region(p, size, x0, z0, dx, dz, G.shape)
            fixed_under = bottom & protected[sl]
            if fixed_under.any(): cap = min(cap, float(G[sl][fixed_under].min()) - RANGE_FOOT_EMBED)
            return cap
        lifted = 0; free_pieces = [p for p in pieces if not p.get('_fixed')]
        for p in free_pieces:
            sl, bottom = bottom_region(p, size, x0, z0, dx, dz, G.shape)
            free = bottom & ~protected[sl]
            if not free.any(): continue
            seat = min(float(np.median(G[sl][free])) - RANGE_FOOT_EMBED, seat_cap(p))
            if seat > p['y'] + RANGE_SEAT_TOLERANCE: p['y'] = seat; lifted += 1
        # Neighbours rise together: a piece lifted beside one that stayed down would bury it.
        for i, p in enumerate(free_pieces):
            for q in free_pieces[i+1:]:
                if pair_relation(p, q, size) != 'buried': continue
                low, high = (p, q) if p['y'] < q['y'] else (q, p)
                level = min(high['y'], seat_cap(low))
                if level > low['y']: low['y'] = level
                if high['y'] > low['y']: high['y'] = low['y']
                lifted += 1
        print(f'seat pass {seat_pass + 1}: {lifted} pieces lifted onto the filled ground', flush=True)
        if not lifted: break
    # A piece held down by a sight line or by fixed ground under its end cannot follow the fill up, and clearing the
    # fill off it put it back in a pit 2.6 deep. It is left out: the ground there stays as the installed board has it.
    def crest_shows(p):
        j, k = round((p['z'] - z0) / dz), round((p['x'] - x0) / dx)
        height = size[p['k']] * p['s'] * RANGE_ASPECT[p['k']][1] * RANGE_VERTICAL[p['k']]
        return p.get('_fixed') or p['y'] + height - G[j, k] >= height * (RANGE_MIN_VISIBLE + .05)
    dropped = [p for p in pieces if not crest_shows(p)]
    pieces[:] = [p for p in pieces if crest_shows(p)]
    print(f'{len(dropped)} held-down pieces left out: ' + ', '.join(f"{p['x']:.2f},{p['z']:.2f}" for p in dropped), flush=True)
    # Where a road, bank or pad under a tapered end cannot be raised, the piece comes down to it instead of floating.
    settled = 0
    for p in pieces:
        if p.get('_fixed'): continue
        gap = foot_gap(p, size, G, x0, z0, dx, dz)
        if math.isfinite(gap) and gap > -RANGE_FOOT_EMBED + 1e-4: p['y'] -= gap + RANGE_FOOT_EMBED; settled += 1
    print(f'{settled} pieces settled onto fixed ground under their ends', flush=True)
    # Smoothing a rough hillside can lift a valley in front of a city. Preserve the accepted ground wherever
    # it already exceeds the sight line, and cap any new rise below that line instead of moving the city.
    for c in base['cities']:
        wall = size[tiers[c['tier']]] * c['ms'] / 2; dz_ = zz - c['mz']
        corridor = (np.abs(xx - c['mx']) < wall + .35) & (dz_ > wall) & (dz_ < wall + 1.5)
        ceiling = c['y'] + .05 + (dz_ - wall) * ns['SIGHT']
        G = np.where(corridor, np.minimum(G, np.maximum(ground['G'], ceiling)), G)
    coverage_report = massif_coverage_report(references, [*pieces, *legacy], dropped, failures, options, keep, previous_report)
    # Removed connectors cannot count toward the chain totals of the geometry that will actually be exported.
    parent = list(range(len(pieces)))
    for i, p in enumerate(pieces):
        p['chain'] = i
        for q in pieces[:i]:
            if pair_relation(p, q, size) in ('join', 'row'): join(i, q['chain'])
    retained = {root(p['chain']) for p in pieces}
    sizes = [sum(root(p['chain']) == c for p in pieces) for c in retained]
    print(f'old massif centres covered: {sum(item["covered"] for item in coverage_report)}/{len(references)}; lower-row pieces: {sum(bool(p.get("row")) for p in pieces)}', flush=True)
    for p in pieces: p.pop('chain'); p.pop('_fixed', None); p.pop('_priority', None); p.pop('_strength', None); p.pop('_seat_origin', None)
    print(f'crest candidates {len(seeds)}, proposed {len(pieces)}, rejected {dict(rejects)}', flush=True)
    return G, pieces, coverage, sizes, coverage_report


def prepare(ns):
    work, selected_work, dest = ns['WORK'], ns['BASE_WORK'], ns['DEST']
    if os.path.realpath(work) == os.path.realpath(selected_work): raise ValueError('SANDTABLE_WORK must differ from SANDTABLE_BASE_WORK')
    base_files = [n for n in ns['PREPARED_FILES'] if n not in ('ranges.json', *(f'{k}-{suffix}.png' for k in RANGE_ASPECT for suffix in ('paint', 'game')))]
    base_work, base, selected = original_preparation(ns, base_files)
    if os.path.realpath(work) == os.path.realpath(base_work): raise ValueError('SANDTABLE_WORK must differ from SANDTABLE_ORIGINAL_WORK')
    installed_dir = f"{ns['MVP']}/assets/ai/sandtable/board"
    with open(f'{installed_dir}/board.json') as f: installed = json.load(f)
    with np.load(f'{base_work}/ground.npz') as data: base_ground = data['G'].copy()
    if not base_matches_installed(ns, base, installed, base_ground.shape):
        raise ValueError(f'{base_work} differs from the installed board outside its range footprints; set SANDTABLE_BASE_WORK to the matching original or installed preparation')
    installed_prior = None; installed_work = selected_work if selected is not base else ns['INSTALLED_WORK']
    if same_layout(base, installed):
        if not matches_board_height(ns, base_ground, installed, installed_dir): raise ValueError(f'{base_work} heights do not match the installed board')
    else:
        installed_variable = 'SANDTABLE_BASE_WORK' if selected is not base else 'SANDTABLE_INSTALLED_WORK'
        require_preparation(installed_work, installed_variable, ('place.json', 'ground.npz', 'mask.png', 'ranges.json'))
        if os.path.realpath(work) == os.path.realpath(installed_work): raise ValueError('SANDTABLE_WORK must differ from SANDTABLE_INSTALLED_WORK; use a new side-bake directory')
        with open(f'{installed_work}/place.json') as f: installed_prior = json.load(f)
        with np.load(f'{installed_work}/ground.npz') as data: installed_ground = data['G']
        if not same_layout(installed_prior, installed) or not matches_board_height(ns, installed_ground, installed, installed_dir):
            raise ValueError(f'{installed_work} does not match the installed board; set {installed_variable} to its reviewed preparation')
    references = massif_reference(ns)
    keep = [float(v) for v in ns['arg']('--keep', '').split(',')] if '--keep' in ns['sys'].argv else None
    if keep is not None and (len(keep) != 4 or keep[0] >= keep[1] or keep[2] >= keep[3]): raise ValueError('--keep needs x0,x1,z0,z1')
    if not os.path.isfile(f'{dest}/board.json'): raise FileNotFoundError(f'seed {dest} from the installed board first')
    with open(f'{dest}/board.json') as f: staged = json.load(f)
    prior, prior_work = base, base_work
    if not same_layout(base, staged):
        if installed_prior is not None and same_layout(installed_prior, staged): prior, prior_work = installed_prior, installed_work
        else:
            require_preparation(work, 'SANDTABLE_WORK', ('place.json', 'ground.npz', 'mask.png', 'ranges.json'))
            with open(f'{work}/place.json') as f: prior = json.load(f)
            prior_work = work
        if not same_layout(prior, staged): raise ValueError(f'{dest} does not match {work}/place.json; restore its reviewed preparation')
    for name in ns['RANGE_KINDS']:
        if not os.path.isfile(f"{ns['RANGE_MODELS']}/{name}.glb"): raise FileNotFoundError(f"Missing Tripo original {ns['RANGE_MODELS']}/{name}.glb; restore it before baking.")
    def inside(x, z): return keep is None or keep[0] <= x <= keep[1] and keep[2] <= z <= keep[3]
    # model() cannot render a cache without its original; fail before making a partial preview instead of omitting it.
    needed = {p['k'] for p in base['place'] if p['k'] != 'massif' and p['k'] not in RANGE_ASPECT}
    needed |= {ns['TIER'][c['tier']] for c in base['cities']}
    if keep is not None and any(p['k'] == 'massif' and not inside(p['x'], p['z']) for p in prior['place']): needed.add('massif')
    for name in sorted(needed):
        directory = f'{installed_dir}/models' if name in ns['SOLID_TREES'] else ns['MODELS']
        if not os.path.isfile(f'{directory}/{name}.glb'):
            raise FileNotFoundError(f'Missing source model {directory}/{name}.glb; restore it before baking.')
    fixed = [p for p in prior['place'] if p['k'] in RANGE_ASPECT and not inside(p['x'], p['z'])]
    previous_ground = previous_mask = previous_report = None
    if keep is not None and (prior is not base or any(p['k'] in RANGE_ASPECT for p in prior['place'])):
        variable = 'SANDTABLE_INSTALLED_WORK' if prior_work == installed_work else 'SANDTABLE_WORK' if prior_work == work else 'SANDTABLE_BASE_WORK'
        require_preparation(prior_work, variable, ('ground.npz', 'mask.png', 'ranges.json'))
        with np.load(f'{prior_work}/ground.npz') as data: previous_ground = data['G'].copy()
        previous_mask = np.array(Image.open(f'{prior_work}/mask.png').convert('RGBA'), dtype=np.float32) / 255
        with open(f'{prior_work}/ranges.json') as f: previous_report = json.load(f).get('old_massifs')
    os.makedirs(work, exist_ok=True)
    key = lambda p: (p['k'], p['x'], p['z'], p['y'], p['ry'], p['s'], p.get('sx', 1))
    prior_pieces = {key(p) for p in prior['place']}
    if keep is not None:
        with open(f'{work}/keep-base.json', 'w') as f: json.dump(prior['place'], f, default=float)
    for name in ns['PREPARED_FILES']:
        if name not in ('ground.npz', 'place.json', 'ranges.json', 'mask.png', *(f'{k}-{suffix}.png' for k in RANGE_ASPECT for suffix in ('paint', 'game'))):
            shutil.copy2(f'{base_work}/{name}', f'{work}/{name}')
    for name in ns['RANGE_KINDS']:
        prepare_range_paint(f"{ns['RANGE_MODELS']}/{name}.glb", f'{work}/{name}-paint.png', f'{work}/{name}-game.png')
    with np.load(f'{base_work}/ground.npz') as data: ground = {k: data[k] for k in ('G', 'H0', 'Lv', 'K')}
    if previous_ground is not None:
        xx = ns['X0'] + np.arange(ground['G'].shape[1])[None, :] * ns['DX']; zz = ns['Z0'] + np.arange(ground['G'].shape[0])[:, None] * ns['DZ']
        outside = (xx < keep[0]) | (xx > keep[1]) | (zz < keep[2]) | (zz > keep[3])
        ground['G'][outside] = previous_ground[outside]
    previous_massifs = [p for p in prior['place'] if p['k'] == 'massif' and not inside(p['x'], p['z'])]
    # A partial rebuild may temporarily retain legacy pieces: their old budget plus the new pieces still cannot grow.
    old_massifs = len(references)
    near_room = max(0, (old_massifs - len(previous_massifs)) * ns['GAME']['massif'][0] // ns['GAME']['range-a'][0])
    far_room = max(0, (old_massifs - len(previous_massifs)) * ns['GAME_FAR']['massif'] // ns['GAME_FAR']['range-a'])
    limit = min(RANGE_LIMIT, near_room, far_room) if previous_massifs else RANGE_LIMIT
    planner_ns = dict(ns, BASE_WORK=base_work)  # masks must be sampled from the pre-range ground, even after installation
    G, ranges, cover, sizes, reference_report = plan(planner_ns, ground, base, keep, fixed, limit, references, previous_massifs, previous_report)
    if keep is None and not ranges: raise ValueError('no ranges fit the board; inspect the clearance and source preparation')
    place, removed, hills_removed = [], 0, 0
    support = support_mask(ns, ranges, G.shape)
    for p in base['place']:
        if p['k'] == 'massif' or p['k'] in RANGE_ASPECT: continue  # re-baking an installed range board cannot duplicate its old chains
        if keep is not None and p['k'] in ('tree-broad', 'tree-pine', 'grove', 'hill') and not inside(p['x'], p['z']):
            if key(p) in prior_pieces: place.append(p)
            continue
        if p['k'] in ('tree-broad', 'tree-pine', 'grove', 'hill') and clears_tree(ns, p, ranges, support):
            removed += p['k'] != 'hill'; hills_removed += p['k'] == 'hill'; continue
        place.append(p)
    old_counts = Counter(p['k'] for p in base['place']); new_counts = Counter(p['k'] for p in place)
    removed = sum(old_counts[k] - new_counts[k] for k in ('tree-broad', 'tree-pine', 'grove'))
    hills_removed = old_counts['hill'] - new_counts['hill']
    base['place'] = place + previous_massifs + ranges
    with open(f'{work}/place.json', 'w') as f: json.dump(base, f, default=float)
    np.savez(f'{work}/ground.npz', G=G.astype(np.float32), H0=ground['H0'], Lv=ground['Lv'], K=ground['K'])
    # Paint a grassy scrub skirt only where the protected ground can actually rise; retain road alpha and farm pixels elsewhere.
    mask = np.array(Image.open(f'{base_work}/mask.png').convert('RGBA'), dtype=np.float32) / 255
    if previous_mask is not None:
        xx = np.linspace(ns['X0'], ns['X1'], mask.shape[1])[None, :]; zz = np.linspace(ns['Z0'], ns['Z1'], mask.shape[0])[:, None]
        outside = (xx < keep[0]) | (xx > keep[1]) | (zz < keep[2]) | (zz > keep[3])
        mask[outside] = previous_mask[outside]
    c = np.asarray(Image.fromarray(cover.astype(np.float32), 'F').resize((mask.shape[1], mask.shape[0]), Image.Resampling.BILINEAR)) * RANGE_SCRUB_STRENGTH
    no_paint = Image.fromarray(((ground['Lv'] > 0) | (ground['K'] > .05) | (ground['G'] <= ns['SEA_Y']+.03)).astype(np.uint8)*255, 'L')
    no_paint = np.asarray(no_paint.resize((mask.shape[1], mask.shape[0]), Image.Resampling.NEAREST)) > 0
    no_paint |= np.asarray(Image.open(f'{base_work}/pads.png').convert('L').resize((mask.shape[1], mask.shape[0]), Image.Resampling.NEAREST)) > 0
    no_paint |= np.asarray(Image.open(f'{base_work}/road-alpha.png').convert('L').resize((mask.shape[1], mask.shape[0]), Image.Resampling.NEAREST)) < 255
    c[no_paint] = 0
    if keep is not None:
        xx = np.linspace(ns['X0'], ns['X1'], mask.shape[1])[None, :]; zz = np.linspace(ns['Z0'], ns['Z1'], mask.shape[0])[:, None]
        c[(xx < keep[0]) | (xx > keep[1]) | (zz < keep[2]) | (zz > keep[3])] = 0
    mask[..., 0] = mask[..., 0] * (1-c) + RANGE_SCRUB_GRASS*c
    mask[..., 1] = mask[..., 1] * (1-c) + RANGE_SCRUB_FOREST*c
    mask[..., 2] *= 1-c
    Image.fromarray((np.clip(mask, 0, 1)*255).astype(np.uint8), 'RGBA').save(f'{work}/mask.png')
    near, far = model_budgets(len(ranges), ns['GAME']['range-a'][0], ns['GAME_FAR']['range-a'], len(previous_massifs))
    report = {'pieces': len(ranges), 'chains': len(sizes), 'single': sum(n == 1 for n in sizes), 'longest': max(sizes, default=0), 'keep': keep, 'legacy_massifs': len(previous_massifs),
              'near_budget': len(ranges)*near, 'far_budget': len(ranges)*far, 'near_per_piece': near, 'far_per_piece': far,
              'texture_texels': 2*RANGE_GAME_PAINT_SIZE**2, 'trees_removed': removed, 'hills_removed': hills_removed,
              'second_row': sum(bool(p.get('row')) for p in ranges), 'old_massifs_covered': sum(x['covered'] for x in reference_report),
              'old_massifs': reference_report}
    if ranges:
        spans = [ns['SIZE'][p['k']]*p['s'] for p in ranges]
        heights = [span*RANGE_ASPECT[p['k']][1]*RANGE_VERTICAL[p['k']] for span, p in zip(spans, ranges)]
        report.update(scale=[round(min(p['s'] for p in ranges), 3), round(max(p['s'] for p in ranges), 3)],
                      length=[round(min(spans), 3), round(max(spans), 3)], height=[round(min(heights), 3), round(max(heights), 3)])
    with open(f'{work}/ranges.json', 'w') as f: json.dump(report, f, indent=2)
    print('ranges:', {k:v for k,v in report.items() if k != 'old_massifs'}, flush=True)
    for ref in reference_report:
        if not ref['covered']: print('uncovered old massif:', ref, flush=True)
    print('installed roads, bridges, rivers, cities, hamlets, boats and uncovered trees retained', flush=True)
    ns['prepared_manifest'](write=True)
