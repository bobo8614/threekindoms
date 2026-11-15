#!/usr/bin/env python3
# A battlefield built in Blender and rendered as the flat war map's picture (src/warmap2d.js), in place of a
# whole-map AI painting: the ground is the map's own terrain (rivers cut in, hills raised as cliffed plateaus),
# set pieces stand on their cells (castle, villages, woods, rocks), and a season is a switch on the same scene
# (snow on what faces up, leaf colour, bare broadleaf trees), so every season of a field lines up exactly.
#  - Set pieces: image-to-3D models (Tripo, from tools/gen_asset_refs.py) in source/blender/models/<name>.glb,
#    cut to a triangle budget once and kept in source/blender/cache/; a missing one is stood in by simple shapes.
#  - Ground, cliffs, banks, water and snow: seamless tiles painted in the A2 style (tools/gen_ground_tiles.py)
#    laid in world space, so their pixel clusters come out a few screen pixels wide.
#  - The camera frames the board where the layout guides put it (source/guides/board.json): orthographic, tilted
#    so a cell is as tall on screen as in the guide (sin(elevation) = cell height / cell width).
#  - The render (twice the guide's size) is reduced and finished as pixel art (pixelart()): graded toward the A2
#    concept's tone, stepped through an ordered dither, lightly sharpened, the country outside the board darker.
#   python3 hd2d-mvp/tools/blender_warmap.py <city> [season ...] [--out dir] [--blend]
# (runs Blender in the background; writes <out>/<city>-<season>.png and .webp at the guide's size, and the
#  render before the pixel-art pass as <city>-<season>-render.png)
import json, math, os, random, subprocess, sys

MVP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WG = f'{MVP}/assets/ai/warground'
MODELS, CACHE, TILES = (f'{WG}/source/blender/{d}' for d in ('models', 'cache', 'tiles'))
STYLE = f'{MVP}/docs/review-assets/2026-10-29/war-style/A2-disciplined-hd2d.png'
FOREST, SAND, PLAIN, RIVER, MOUNT, CASTLE = range(6)
MARGIN = 6                          # cells of countryside built round the board
SUB = 8                             # terrain vertices per cell side
SCALE = 2                           # rendered at twice the guide's size, then reduced
BUDGET = {'castle': 60000, 'hamlet': 30000, 'rocks': 8000, 'bush': 3000}   # triangles per model (trees: 6000)
for k in ('tree-broad-a', 'tree-broad-b', 'tree-pine', 'tree-bare'): BUDGET[k] = 6000
PREPARED = 2                        # bump when prepare() or SIZE changes, so the cache is rebuilt
CLEAR = 1.7                         # half the castle's footprint, in cells: kept level and free of trees and rock
HCLEAR = 0.75                       # the same for a hamlet (the shops and the clinic)
CALM = 0.5                          # how far open ground is pulled toward its tiles' mean colour
TOON = (0.62, 0.82, (0.24, 0.42, 0.48), (0.95, 0.95, 0.86), (1.8, 1.72, 0.66))   # crown light: facing the sun (0 away .. 1 toward) where shade ends and the lit top starts; teal shade, body, warm top
LEAF = (0.141, 0.205, 0.019)        # the one green (linear) a crown's texture is pulled toward
FLAT = 0.75                         # how far a crown's leaf texture is pulled toward LEAF
SIZE = {'tree-broad-a': 0.62, 'tree-broad-b': 0.5, 'tree-pine': 0.55, 'tree-bare': 0.6, 'bush': 0.3, 'rocks': 0.45, 'castle': 2.4, 'hamlet': 1.2}

try:
    import bpy
except ImportError:
    bpy = None


# ---------------------------------------------------------------- outside Blender

def a2_stats():
    """Mean and spread of the A2 concept's map (not its UI panels) in YCbCr, which pixelart() grades toward."""
    import numpy as np
    from PIL import Image
    a = Image.open(STYLE).convert('RGB'); w, h = a.size
    crop = a.crop((int(w * 0.17), int(h * 0.07), int(w * 0.99), int(h * 0.74))).convert('YCbCr')
    x = np.asarray(crop, float).reshape(-1, 3)
    return x.mean(0), x.std(0)


def kuwahara(a, r=1):
    """Each pixel takes the mean colour of whichever of its four (r+1) x (r+1) corner windows varies least in
    brightness: flat runs of colour, as a pixel artist lays them, with every edge kept where it was."""
    import numpy as np
    h, w = a.shape[:2]; n = r + 1; lum = a @ np.array([0.299, 0.587, 0.114])
    def box(f):
        p = np.pad(f, ((r, r), (r, r)) + ((0, 0),) * (f.ndim - 2), mode='edge')
        c = np.pad(p.cumsum(0).cumsum(1), ((1, 0), (1, 0)) + ((0, 0),) * (f.ndim - 2))
        return lambda oy, ox: (c[oy + n:oy + n + h, ox + n:ox + n + w] - c[oy:oy + h, ox + n:ox + n + w]
                               - c[oy + n:oy + n + h, ox:ox + w] + c[oy:oy + h, ox:ox + w]) / (n * n)
    mean, m1, m2 = box(a), box(lum), box(lum * lum)
    best, low = None, None
    for oy, ox in ((0, 0), (0, r), (r, 0), (r, r)):
        v, m = m2(oy, ox) - m1(oy, ox) ** 2, mean(oy, ox)
        if best is None: best, low = m, v
        else: k = v < low; best = np.where(k[..., None], m, best); low = np.where(k, v, low)
    return best


def pixelart(src, board, out, grade=0.3, levels=32, ref=None):
    """The render as pixel art at the guide's size: reduced; its tone and colour moved part of the way to the A2
    concept's (each YCbCr channel's mean and spread); the countryside beyond the board a step darker, as in A2;
    then laid in flat clusters of colour (kuwahara()) and stepped to `levels` per channel. (An ordered dither
    left a fine crosshatch over every surface, the look of a reduced photo; a palette of a few dozen colours
    or a half-size picture lost the castle's roofs, the foam and the rocks. Mapping onto A2's own colours made
    every season olive.) `ref`: the render whose statistics set the grade (the field's summer), so every season
    takes the same correction and a snowfield is not pulled toward A2's summer greens."""
    import numpy as np
    from PIL import Image, ImageFilter
    im = Image.open(src).convert('RGB').resize((board['gw'], board['gh']), Image.LANCZOS)
    y = np.asarray(im.convert('YCbCr'), float); h, w = y.shape[:2]
    r = np.asarray(Image.open(ref).convert('RGB').resize((board['gw'], board['gh']), Image.LANCZOS).convert('YCbCr'), float) if ref else y
    m, sd = r.reshape(-1, 3).mean(0), r.reshape(-1, 3).std(0)
    am, asd = a2_stats()
    y = y * (1 - grade) + ((y - m) / sd * asd + am) * grade
    a = np.asarray(Image.fromarray(np.clip(y, 0, 255).astype(np.uint8), 'YCbCr').convert('RGB'), float)
    yy, xx = np.mgrid[0:h, 0:w]
    dx = np.maximum(np.maximum(board['x'] - xx, xx - (board['x'] + board['w'])), 0)
    dy = np.maximum(np.maximum(board['y'] - yy, yy - (board['y'] + board['h'])), 0)
    a = a * (1 - 0.28 * np.clip(np.hypot(dx, dy) / 60, 0, 1)[..., None])
    step = 255 / (levels - 1)
    a = np.round(kuwahara(a) / step) * step
    im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    im = im.filter(ImageFilter.UnsharpMask(radius=1, percent=40, threshold=2))
    im.save(out); im.save(out.replace('.png', '.webp'), quality=90)


def outside():
    a = sys.argv[1:]
    out = a.pop(a.index('--out') + 1) if '--out' in a else f'{WG}/source/blender/renders'
    if '--out' in a: a.remove('--out')
    blend = '--blend' in a and not a.remove('--blend')
    city, seasons = a[0], a[1:] or ['summer']
    os.makedirs(out, exist_ok=True); os.makedirs(CACHE, exist_ok=True)
    board = json.load(open(f'{WG}/source/guides/board.json'))
    for s in sorted(seasons, key=lambda s: s != 'summer'):   # summer first: its render sets every season's grade
        raw = f'{out}/{city}-{s}-render.png'
        cmd = ['blender', '-b', '--factory-startup', '--python', os.path.abspath(__file__), '--', city, s, raw] + (['--blend'] if blend else [])
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode or not os.path.exists(raw) or 'Traceback' in r.stderr: sys.exit(r.stdout[-3000:] + r.stderr[-3000:])
        ref = f'{out}/{city}-summer-render.png'
        print(city, s, *[l for l in r.stdout.splitlines() if ' hidden by ground' in l], flush=True)
        pixelart(raw, board, f'{out}/{city}-{s}.png', ref=ref if os.path.exists(ref) else None)
        print('rendered', f'{out}/{city}-{s}.png', flush=True)


# ---------------------------------------------------------------- inside Blender

def field(city):
    d = json.load(open(f'{MVP}/data/game-data.json'))
    m = d['maps'][city] if isinstance(d['maps'], dict) else d['maps'][int(city)]
    v = d['villages'].get(city, []) if isinstance(d['villages'], dict) else d['villages'][int(city)]
    return m, v


def country(m):
    """The board's terrain with MARGIN cells of countryside round it: rivers run on out of the board, the rest is
    woods and fields from a smooth noise (dense woods, as in the A2 concept's border)."""
    import numpy as np
    H, W = len(m), len(m[0])
    n = np.zeros((H + 2 * MARGIN, W + 2 * MARGIN), int)
    noise = np.random.default_rng(5).random(n.shape)
    for _ in range(3): noise = (noise + np.roll(noise, 1, 0) + np.roll(noise, -1, 0) + np.roll(noise, 1, 1) + np.roll(noise, -1, 1)) / 5
    for y in range(n.shape[0]):
        for x in range(n.shape[1]):
            bx, by = x - MARGIN, y - MARGIN
            if 0 <= bx < W and 0 <= by < H: n[y, x] = m[by][bx]; continue
            cx, cy = min(max(bx, 0), W - 1), min(max(by, 0), H - 1)
            edge = m[cy][cx]
            n[y, x] = RIVER if edge == RIVER and max(abs(bx - cx), abs(by - cy)) < 4 else FOREST if noise[y, x] > 0.45 else PLAIN
    return n


def heights(n, vil=()):
    """Terrain heights on a SUB-per-cell lattice: river beds cut below the water, hills raised as plateaus with
    steep sides, the shore and the cliff line wobbling with noise so nothing follows the grid."""
    import numpy as np
    H, W = n.shape; R, C = H * SUB + 1, W * SUB + 1
    ys, xs = np.mgrid[0:R, 0:C] / SUB
    rng = np.random.default_rng(9)
    def blur(f, k):
        for _ in range(k): f = (f + np.roll(f, 1, 0) + np.roll(f, -1, 0) + np.roll(f, 1, 1) + np.roll(f, -1, 1)) / 5
        return f
    def smooth(mask, k):
        f = np.kron(mask.astype(float), np.ones((SUB, SUB))); f = np.pad(f, ((0, 1), (0, 1)), mode='edge')
        return blur(f, k)
    def wobble(scale, amp):
        g = np.kron(rng.random((R // scale + 2, C // scale + 2)), np.ones((scale, scale)))[:R, :C]
        g = blur(g, scale * 2)
        return (g - g.mean()) / (g.std() + 1e-6) * amp
    # Rounder outlines than the cells: a wider blur (a one-cell river keeps its middle well above the line) and
    # two scales of wobble, so a shore meanders and a corner turns as a curve.
    # A narrow blur as a floor keeps a one-cell river (a diagonal one too) under water all along its course.
    wet = np.maximum(smooth(n == RIVER, 26) + wobble(3, 0.1) + wobble(9, 0.1), 0.95 * smooth(n == RIVER, 5))
    core = smooth(n == MOUNT, 12)
    hill = core + (wobble(3, 0.05) + wobble(8, 0.06)) * np.clip(core * 8, 0, 1)   # no noise bumps far from rock
    z = np.zeros((R, C)) + wobble(10, 0.015)
    z = np.where(wet > 0.5, -0.32, z - 0.1 * np.clip((wet - 0.35) / 0.15, 0, 1))   # banks slope into the bed
    # A2's outcrops are rounded rock masses, not walls: the face rises steeply from a wavering foot and rolls
    # over into a grassy cap (a convex profile), its stone bulging in lumps; a ridge one cell wide comes out a
    # long low mound rather than a fence of posts. `hill` is returned as that profile, 0 at the foot, 1 on the cap.
    t = np.clip((hill - 0.16) / 0.5, 0, 1) * (1 - np.clip((wet - 0.3) / 0.15, 0, 1))   # a hill's foot never fills a river
    # The castle stands on level ground: no rock rises inside its walls (the model is about three cells across).
    for cy, cx in zip(*np.nonzero(n == CASTLE)):
        d = np.maximum(np.abs(xs - (cx + 0.5)), np.abs(ys - (cy + 0.6)))
        t = t * np.clip((d - CLEAR) / 0.5, 0, 1)
    for cx, cy in vil:   # nor inside a hamlet's (vil: its cells on this lattice's grid)
        d = np.maximum(np.abs(xs - (cx + 0.5)), np.abs(ys - (cy + 0.6)))
        t = t * np.clip((d - HCLEAR) / 0.4, 0, 1)
    # A lone ridge stands lower than a massif (A2's outcrops are about as tall as they are deep): its height
    # comes from how much rock there is round it, so a one-cell line is a hump whose flanks show from above.
    # Each group of joined rock cells gets one height (a flat cap), from its size; the cells round it take
    # their group's height so the foot spilling past the cell is level with it.
    mt = n == MOUNT; comp = np.full(n.shape, -1); sizes = []
    for y0, x0 in zip(*np.nonzero(mt)):
        if comp[y0, x0] >= 0: continue
        stack, k = [(y0, x0)], len(sizes); comp[y0, x0] = k; c = 0
        while stack:
            y, x = stack.pop(); c += 1
            for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= yy < n.shape[0] and 0 <= xx < n.shape[1] and mt[yy, xx] and comp[yy, xx] < 0: comp[yy, xx] = k; stack.append((yy, xx))
        sizes.append(c)
    cell_top = np.where(comp >= 0, 0.45 + 0.35 * np.clip((np.array(sizes + [1])[comp] - 1) / 8, 0, 1), 0)
    p = np.pad(cell_top, 1)
    near = np.max([p[1 + dy:p.shape[0] - 1 + dy, 1 + dx:p.shape[1] - 1 + dx] for dy in (-1, 0, 1) for dx in (-1, 0, 1)], 0)
    cell_top = np.where(comp >= 0, cell_top, near)
    # Seen from the south, a tall face stands up over the cell beyond it: rock with water just north of it stays
    # low, so the river shows (smoothed, so the cap only dips).
    wn = np.zeros(n.shape, bool); wn[1:] = n[:-1] == RIVER
    cell_top = np.where(wn, np.minimum(cell_top, 0.3), cell_top)
    # Nor does rock just in front of the castle (south of it, nearer the camera) stand tall enough to hide its walls.
    for cy, cx in zip(*np.nonzero(n == CASTLE)):
        cell_top[cy + 2:cy + 4, max(cx - 2, 0):cx + 3] = np.minimum(cell_top[cy + 2:cy + 4, max(cx - 2, 0):cx + 3], 0.3)
    for cx, cy in vil:   # nor in front of a hamlet
        cell_top[cy + 1:cy + 3, max(cx - 1, 0):cx + 2] = np.minimum(cell_top[cy + 1:cy + 3, max(cx - 1, 0):cx + 2], 0.3)
    top = blur(np.pad(np.kron(cell_top, np.ones((SUB, SUB))), ((0, 1), (0, 1)), mode='edge'), 10) + wobble(4, 0.03)
    lumps = (wobble(2, 0.05) + wobble(4, 0.05)) * np.clip(t * 6, 0, 1) * np.clip((0.7 - t) * 8, 0, 1)
    z = np.where(t > 0, np.maximum(z, top * (1 - (1 - t) ** 3.2) + lumps), z)
    cap = np.clip((hill - 0.66) / 0.25, 0, 1)                 # 0 where the cap begins .. 1 a quarter cell in
    # Sand (slower going than grass): its own ground, its edge broken like a shore's.
    sand = smooth(n == SAND, 10); sand = sand + (wobble(3, 0.08) + wobble(7, 0.08)) * np.clip(sand * 6, 0, 1) * np.clip((1 - sand) * 6, 0, 1)
    return xs, ys, z, wet, t, cap, sand


def terrain(n, mat, vil=()):
    import numpy as np
    xs, ys, z, wet, hill, cap, sand = heights(n, vil)
    R, C = z.shape
    me = bpy.data.meshes.new('terrain')
    co = np.stack([xs - MARGIN, -(ys - MARGIN), z], -1).reshape(-1, 3).astype(np.float32)
    me.vertices.add(len(co)); me.vertices.foreach_set('co', co.ravel())
    i = np.arange(R * C).reshape(R, C)
    quads = np.stack([i[:-1, :-1], i[1:, :-1], i[1:, 1:], i[:-1, 1:]], -1).reshape(-1, 4)
    me.loops.add(quads.size); me.loops.foreach_set('vertex_index', quads.ravel())
    me.polygons.add(len(quads)); me.polygons.foreach_set('loop_start', np.arange(0, quads.size, 4)); me.polygons.foreach_set('loop_total', np.full(len(quads), 4))
    me.update(); me.validate()
    # Smooth shading except on the cliff faces: a face one lattice step wide would otherwise borrow its normal
    # from the top and the foot, read as grass and take the grass tile stretched down it.
    zq = z.ravel()[quads]; steep = (zq.max(1) - zq.min(1)) > 0.12
    me.polygons.foreach_set('use_smooth', ~steep)
    for name, val in (('wet', wet), ('hill', hill), ('cap', cap), ('sand', sand)):
        a = me.attributes.new(name, 'FLOAT', 'POINT'); a.data.foreach_set('value', np.clip(val, 0, 1).ravel().astype(np.float32))
    ob = bpy.data.objects.new('terrain', me); ob.data.materials.append(mat); bpy.context.scene.collection.objects.link(ob)
    return z, hill, wet


# --- materials: one season control drives them all (node names are looked up in build())

SEASON = {
    #          ground hue/sat/val   leaf tint             snow  leaf mix  light colour        sun   sky   bare   blossom
    'summer': ((0.535, 0.95, 1.4), (0.035, 0.09, 0.015), 0.0, 0.0, (1.0, 0.88, 0.70), 4.6, 0.45, False, 0),
    'spring': ((0.53, 1.0, 1.35), (0.10, 0.22, 0.03), 0.0, 0.45, (1.0, 0.93, 0.82), 4.4, 0.55, False, 1),
    'autumn': ((0.495, 0.82, 1.22), (0.32, 0.11, 0.015), 0.0, 0.65, (1.0, 0.80, 0.58), 4.2, 0.45, False, 0),
    'winter': ((0.48, 0.45, 1.05), (0.05, 0.07, 0.04), 1.0, 0.3, (0.88, 0.92, 1.0), 3.4, 0.7, True, 0),
}


SUN = (38, -140)                    # sun tilt from straight down and turn, degrees


def sun_dir():
    """Unit vector toward the sun, for the crowns' own banded light."""
    import mathutils
    return tuple(mathutils.Euler((math.radians(SUN[0]), 0, math.radians(SUN[1]))).to_matrix() @ mathutils.Vector((0, 0, 1)))


def node(nt, kind, name=None, **inputs):
    n = nt.nodes.new(kind)
    if name: n.name = n.label = name
    for k, v in inputs.items(): n.inputs[k].default_value = v
    return n


def mixc(nt, a, b, fac=None, blend='MIX'):
    """A colour Mix node (its colour sockets share their names with the float ones): a, b and fac are output
    sockets or values; returns the colour result."""
    n = node(nt, 'ShaderNodeMix'); n.data_type = 'RGBA'; n.blend_type = blend
    ia, ib = [s for s in n.inputs if s.type == 'RGBA']
    for sock, v in ((ia, a), (ib, b), (n.inputs['Factor'], fac)):
        if v is None: continue
        if isinstance(v, bpy.types.NodeSocket): nt.links.new(v, sock)
        else: sock.default_value = v
    return [s for s in n.outputs if s.type == 'RGBA'][0]


def math_(nt, op, a, b=None):
    n = node(nt, 'ShaderNodeMath'); n.operation = op
    for sock, v in ((n.inputs[0], a), (n.inputs[1], b)):
        if v is None: continue
        if isinstance(v, bpy.types.NodeSocket): nt.links.new(v, sock)
        else: sock.default_value = v
    return n.outputs[0]


def ramp(nt, v, lo, hi):
    n = node(nt, 'ShaderNodeMapRange', **{'From Min': lo, 'From Max': hi}); nt.links.new(v, n.inputs['Value'])
    return n.outputs[0]


def tile(nt, name, span, vector=None, box=False, calm=0.0):
    """A painted tile from TILES laid in world space, `span` cells to a repeat (a box projection for cliffs).
    `calm` pulls it that far toward its own mean colour: A2's open ground is a quiet, even colour with sparse
    tufts, so a general standing on it reads at once; a tile at full contrast is noise under the sprites."""
    t = node(nt, 'ShaderNodeTexImage'); t.image = bpy.data.images.load(f'{TILES}/{name}.png', check_existing=True)
    t.interpolation = 'Closest'
    if box: t.projection = 'BOX'; t.projection_blend = 0.25
    if vector is None:
        co = node(nt, 'ShaderNodeNewGeometry'); mp = node(nt, 'ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1 / span,) * 3
        nt.links.new(co.outputs['Position'], mp.inputs['Vector']); vector = mp.outputs[0]
    else:
        mp = node(nt, 'ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1 / span,) * 3; nt.links.new(vector, mp.inputs['Vector']); vector = mp.outputs[0]
    nt.links.new(vector, t.inputs['Vector'])
    if not calm: return t.outputs['Color']
    import numpy as np
    px = np.empty(len(t.image.pixels), np.float32); t.image.pixels.foreach_get(px)
    mean = px.reshape(-1, 4)[:, :3].mean(0)
    lin = np.where(mean <= 0.04045, mean / 12.92, ((mean + 0.055) / 1.055) ** 2.4)   # the pixels are sRGB, shading is linear
    return mixc(nt, t.outputs['Color'], (*lin, 1), calm)


def has_tiles(): return all(os.path.exists(f'{TILES}/{n}.png') for n in ('grass', 'drygrass', 'earth', 'rock', 'water', 'pebbles', 'snow'))


def up_mask(nt, edge=(0.97, 1.07)):
    """Where a surface faces up enough to hold snow, broken up by noise ('snow' sets how much)."""
    geo = node(nt, 'ShaderNodeNewGeometry'); sep = node(nt, 'ShaderNodeSeparateXYZ'); nt.links.new(geo.outputs['Normal'], sep.inputs[0])
    # In world space, about a cell to a patch (its default, the object's 0..1 box, made blobs seventeen cells wide).
    noi = node(nt, 'ShaderNodeTexNoise', Scale=0.9, Detail=3.0, Roughness=0.55); nt.links.new(node(nt, 'ShaderNodeNewGeometry').outputs['Position'], noi.inputs['Vector'])
    up = node(nt, 'ShaderNodeMath'); up.operation = 'MULTIPLY_ADD'; nt.links.new(sep.outputs['Z'], up.inputs[0]); up.inputs[1].default_value = 0.6; nt.links.new(noi.outputs['Fac'], up.inputs[2])
    amt = node(nt, 'ShaderNodeValue', 'snow'); amt.outputs[0].default_value = 0
    return math_(nt, 'MULTIPLY', ramp(nt, up.outputs[0], *edge), amt.outputs[0])


def snow_over(nt, color_out, snow_color=(0.86, 0.89, 0.95, 1)):
    return mixc(nt, color_out, snow_color, up_mask(nt))


def ground_mat():
    m = bpy.data.materials.new('ground'); m.use_nodes = True; nt = m.node_tree; L = nt.links
    bsdf = nt.nodes['Principled BSDF']; bsdf.inputs['Roughness'].default_value = 0.95
    for k in ('Specular IOR Level', 'Specular'):
        if k in bsdf.inputs: bsdf.inputs[k].default_value = 0.1
    attr = lambda n: node(nt, 'ShaderNodeAttribute').__setattr__('attribute_name', n) or nt.nodes[-1]
    wet = attr('wet')
    if has_tiles():
        # Grass at two scales (so the repeat does not show), dry grass and bare earth in drifting patches.
        co = node(nt, 'ShaderNodeNewGeometry').outputs['Position']
        warp = node(nt, 'ShaderNodeTexNoise', Scale=0.35, Detail=2.0)
        g1, g2 = tile(nt, 'grass', 5, calm=CALM), tile(nt, 'grass', 3.7, co, calm=CALM)
        g = mixc(nt, g1, g2, ramp(nt, warp.outputs['Fac'], 0.45, 0.55))
        pn = node(nt, 'ShaderNodeTexNoise', Scale=0.6, Detail=5.0, Roughness=0.65)
        g = mixc(nt, g, tile(nt, 'drygrass', 5, calm=CALM), ramp(nt, pn.outputs['Fac'], 0.58, 0.66))
        en = node(nt, 'ShaderNodeTexNoise', Scale=1.1, Detail=5.0, Roughness=0.7)
        g = mixc(nt, g, tile(nt, 'earth', 5, calm=CALM * 0.6), ramp(nt, en.outputs['Fac'], 0.66, 0.72))
        rh = node(nt, 'ShaderNodeHueSaturation', Saturation=0.8, Value=1.6); nt.links.new(tile(nt, 'rock', 2.2, box=True), rh.inputs['Color']); rock = rh.outputs[0]
        bank = tile(nt, 'pebbles', 3)
        sh = node(nt, 'ShaderNodeHueSaturation', Saturation=0.45, Value=1.08); nt.links.new(tile(nt, 'snow', 8), sh.inputs['Color']); snow = sh.outputs[0]
    else:
        g = node(nt, 'ShaderNodeRGB').outputs[0]; nt.nodes[-1].outputs[0].default_value = (0.1, 0.17, 0.025, 1)
        rock = node(nt, 'ShaderNodeRGB').outputs[0]; nt.nodes[-1].outputs[0].default_value = (0.3, 0.25, 0.2, 1)
        bank = node(nt, 'ShaderNodeRGB').outputs[0]; nt.nodes[-1].outputs[0].default_value = (0.3, 0.28, 0.24, 1)
        snow = (0.86, 0.89, 0.95, 1)
    hsv = node(nt, 'ShaderNodeHueSaturation', 'groundhsv'); L.new(g, hsv.inputs['Color'])
    g = hsv.outputs[0]
    if os.path.exists(f'{TILES}/sand.png'):   # laid after the season's grass colour: sand does not green in spring
        g = mixc(nt, g, tile(nt, 'sand', 4, calm=CALM * 0.6), ramp(nt, attr('sand').outputs['Fac'], 0.45, 0.55))
    geo = node(nt, 'ShaderNodeNewGeometry'); sep = node(nt, 'ShaderNodeSeparateXYZ'); L.new(geo.outputs['Normal'], sep.inputs[0])
    steep = ramp(nt, sep.outputs['Z'], 0.8, 0.55)
    # The plateau's grass lip catches the light (A2 outlines every table with it).
    hill = attr('hill')
    # The cap: mossier and darker than the field, ringed by a lit lip, so it reads as the top of the rock even
    # where its far edge faces away from the camera.
    cap = attr('cap'); on = ramp(nt, hill.outputs['Fac'], 0.66, 0.74)
    moss = node(nt, 'ShaderNodeHueSaturation', Hue=0.51, Saturation=1.1, Value=0.62); L.new(g, moss.inputs['Color'])
    lit = node(nt, 'ShaderNodeHueSaturation', Saturation=1.1, Value=1.45); L.new(g, lit.inputs['Color'])
    # A2's outcrop tops are bare stone with moss in the hollows, not a field on a plinth (and a rock cell must
    # read as rock, which costs more to cross than grass).
    pn = node(nt, 'ShaderNodeTexNoise', Scale=1.4, Detail=4.0, Roughness=0.6); L.new(node(nt, 'ShaderNodeNewGeometry').outputs['Position'], pn.inputs['Vector'])
    top = mixc(nt, moss.outputs[0], rock, math_(nt, 'MULTIPLY_ADD', ramp(nt, pn.outputs['Fac'], 0.35, 0.65), 0.5))
    nt.nodes[-1].inputs[2].default_value = 0.4                         # 40 .. 90 % stone
    g = mixc(nt, g, top, math_(nt, 'MULTIPLY', on, ramp(nt, cap.outputs['Fac'], 0.3, 0.8)))
    g = mixc(nt, g, lit.outputs[0], math_(nt, 'MULTIPLY', on, ramp(nt, cap.outputs['Fac'], 0.3, 0.05)))
    # The outcrop's whole flank is stone, up to where it rolls over into its cap.
    flank = math_(nt, 'MULTIPLY', ramp(nt, hill.outputs['Fac'], 0.02, 0.1), ramp(nt, hill.outputs['Fac'], 0.72, 0.62))
    c = mixc(nt, g, rock, math_(nt, 'MAXIMUM', steep, flank))
    # A dark seam where the cap breaks over into the stone, so the cap reads as the top of the rock, not the field.
    c = mixc(nt, c, (0.02, 0.02, 0.01, 1), math_(nt, 'MULTIPLY', math_(nt, 'MULTIPLY', ramp(nt, hill.outputs['Fac'], 0.6, 0.64), ramp(nt, hill.outputs['Fac'], 0.7, 0.66)), 0.7))
    c = mixc(nt, c, bank, ramp(nt, wet.outputs['Fac'], 0.22, 0.34))
    L.new(mixc(nt, c, snow, up_mask(nt)), bsdf.inputs['Base Color'])
    return m


def water_mat(wet=None):
    m = bpy.data.materials.new('water'); m.use_nodes = True; nt = m.node_tree; L = nt.links
    bsdf = nt.nodes['Principled BSDF']; bsdf.inputs['Roughness'].default_value = 0.35
    for k in ('Specular IOR Level', 'Specular'):
        if k in bsdf.inputs: bsdf.inputs[k].default_value = 0.15
    if has_tiles():
        c = tile(nt, 'water', 5, calm=0.55)
        hsv = node(nt, 'ShaderNodeHueSaturation', 'waterhsv'); L.new(c, hsv.inputs['Color'])
        c = hsv.outputs[0]
        if wet is not None:
            # Along the shore (the terrain's wet field, laid over the plane): lighter shallows, then a broken
            # line of white foam where the water meets the bank, as A2 draws it.
            t = node(nt, 'ShaderNodeTexImage'); t.image = wet; t.interpolation = 'Linear'; t.extension = 'EXTEND'
            L.new(node(nt, 'ShaderNodeTexCoord').outputs['Generated'], t.inputs['Vector'])
            w = t.outputs['Color']
            shallow = node(nt, 'ShaderNodeHueSaturation', Saturation=0.75, Value=1.45); L.new(c, shallow.inputs['Color'])
            c = mixc(nt, c, shallow.outputs[0], math_(nt, 'MULTIPLY', ramp(nt, w, 0.6, 0.47), 0.45))
            brk = node(nt, 'ShaderNodeTexNoise', Scale=7.0, Detail=3.0)
            foam = math_(nt, 'MULTIPLY', math_(nt, 'MULTIPLY', ramp(nt, w, 0.495, 0.465), ramp(nt, brk.outputs['Fac'], 0.4, 0.55)), 0.6)
            c = mixc(nt, c, (0.85, 0.9, 0.92, 1), foam)
        # A2's open water: deep and even, lit by short scattered glints rather than a tiled ripple.
        gp = node(nt, 'ShaderNodeMapping'); gp.inputs['Scale'].default_value = (4.5, 13.0, 1.0)
        L.new(node(nt, 'ShaderNodeNewGeometry').outputs['Position'], gp.inputs['Vector'])
        gn = node(nt, 'ShaderNodeTexNoise', Scale=1.0, Detail=0.0); L.new(gp.outputs[0], gn.inputs['Vector'])
        c = mixc(nt, c, (0.75, 0.85, 0.9, 1), math_(nt, 'MULTIPLY', ramp(nt, gn.outputs['Fac'], 0.77, 0.8), 0.55))
        L.new(c, bsdf.inputs['Base Color'])
        # The painted ripples and glints shown as they are (lit water would grey them under the sky).
        L.new(c, bsdf.inputs['Emission Color']); bsdf.inputs['Emission Strength'].default_value = 0.55
    else:
        bsdf.inputs['Base Color'].default_value = (0.03, 0.12, 0.22, 1)
    return m


def flat_mat(name, rgb, rough=0.8):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
    col = node(nt, 'ShaderNodeRGB', 'leaf' if name == 'leaf' else name); col.outputs[0].default_value = (*rgb, 1)
    nt.links.new(snow_over(nt, col.outputs[0]), nt.nodes['Principled BSDF'].inputs['Base Color'])
    nt.nodes['Principled BSDF'].inputs['Roughness'].default_value = rough
    return m


def seasonal(mat, muted=False):
    """Teaches a model's material the season and the A2 light: greens pulled toward the season's leaf colour
    ('leafmix'), what faces up lit brighter and what faces down darker (crowns read lit-top, dark-under), snow
    over what faces up."""
    nt = mat.node_tree; L = nt.links
    bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if not bsdf: return
    src = bsdf.inputs['Base Color'].links[0].from_socket if bsdf.inputs['Base Color'].links else None
    if not src: c = node(nt, 'ShaderNodeRGB'); c.outputs[0].default_value = bsdf.inputs['Base Color'].default_value; src = c.outputs[0]
    for k in ('Metallic',):
        if bsdf.inputs[k].links: L.remove(bsdf.inputs[k].links[0])
        bsdf.inputs[k].default_value = 0
    hsv = node(nt, 'ShaderNodeSeparateColor'); hsv.mode = 'HSV'; L.new(src, hsv.inputs[0])
    green = ramp(nt, hsv.outputs[0], 0.13, 0.2)
    lt = node(nt, 'ShaderNodeValue', 'leafmix'); tint = node(nt, 'ShaderNodeRGB', 'leaf')
    # Each tree turns at its own pace (autumn woods are patchy, not one colour).
    rnd = node(nt, 'ShaderNodeObjectInfo').outputs['Random']
    pace = math_(nt, 'MULTIPLY_ADD', rnd, 1.1); nt.nodes[-1].inputs[2].default_value = 0.3
    if not muted:
        # A2 paints a crown in flat colour: the model's leaf texture (every leaf lit and shaded) is pulled most
        # of the way to one green, so the light below lays clean bands over it instead of leafy noise.
        src = mixc(nt, src, (*LEAF, 1), math_(nt, 'MULTIPLY', green, FLAT))
    c = mixc(nt, src, tint.outputs[0], math_(nt, 'MINIMUM', math_(nt, 'MULTIPLY', math_(nt, 'MULTIPLY', green, lt.outputs[0]), pace), 1.0), 'COLOR')
    sat = node(nt, 'ShaderNodeHueSaturation', Saturation=0.7 if muted else 1.0, Value=1.0 if muted else 1.5); L.new(c, sat.inputs['Color'])
    geo = node(nt, 'ShaderNodeNewGeometry'); sep = node(nt, 'ShaderNodeSeparateXYZ'); L.new(geo.outputs['Normal'], sep.inputs[0])
    lift = math_(nt, 'MULTIPLY_ADD', sep.outputs['Z'], 0.6)
    nt.nodes[-1].inputs[2].default_value = 0.9                        # 0.4 facing down .. 1.3 facing up
    c = mixc(nt, sat.outputs[0], lift, 1.0, 'MULTIPLY') if muted else sat.outputs[0]
    if not muted:
        # Where a crown turns away from the eye it darkens, so neighbouring crowns part with a seam.
        lw = node(nt, 'ShaderNodeLayerWeight', Blend=0.35)
        c = mixc(nt, c, (0.02, 0.05, 0.05, 1), math_(nt, 'MULTIPLY', ramp(nt, lw.outputs['Facing'], 0.6, 0.92), 0.6))
        # Spring: one tree in seven in pale pink or white blossom ('blossom' 0..1).
        bl = node(nt, 'ShaderNodeValue', 'blossom'); bl.outputs[0].default_value = 0
        which = ramp(nt, rnd, 0.86, 0.87)
        petals = mixc(nt, (0.95, 0.72, 0.78, 1), (0.95, 0.93, 0.9, 1), ramp(nt, rnd, 0.93, 0.94))
        c = mixc(nt, c, petals, math_(nt, 'MULTIPLY', math_(nt, 'MULTIPLY', which, bl.outputs[0]), math_(nt, 'MULTIPLY', green, 0.8)))
    if muted: return L.new(snow_over(nt, c), bsdf.inputs['Base Color'])
    # Crowns in three flat tones, as A2 paints them (a lit top, a body, a dark underside; never a smooth 3D
    # gradient): the light this surface gets, shadows included, stepped by a constant ramp.
    # Lit as one round ball, not as a few hundred leaf clumps: the normal points out from the crown's middle
    # (the model's box, a little above half height), with a little of the true surface left in for texture.
    # The bands follow how that ball faces the sun alone: cast shadows from the neighbouring trees would put
    # a whole wood in shade, where A2 gives every crown its lit top.
    gen = node(nt, 'ShaderNodeTexCoord').outputs['Generated']
    sph = node(nt, 'ShaderNodeVectorMath'); sph.operation = 'SUBTRACT'; L.new(gen, sph.inputs[0]); sph.inputs[1].default_value = (0.5, 0.5, 0.6)
    vt = node(nt, 'ShaderNodeVectorTransform'); vt.vector_type = 'NORMAL'; vt.convert_from = 'OBJECT'; vt.convert_to = 'WORLD'; L.new(sph.outputs[0], vt.inputs[0])
    nv = node(nt, 'ShaderNodeVectorMath'); nv.operation = 'NORMALIZE'; L.new(vt.outputs[0], nv.inputs[0])
    mx = node(nt, 'ShaderNodeVectorMath'); mx.operation = 'MULTIPLY_ADD'; L.new(node(nt, 'ShaderNodeNewGeometry').outputs['Normal'], mx.inputs[0])
    mx.inputs[1].default_value = (0.15,) * 3; L.new(nv.outputs[0], mx.inputs[2])
    nn = node(nt, 'ShaderNodeVectorMath'); nn.operation = 'NORMALIZE'; L.new(mx.outputs[0], nn.inputs[0])
    dot = node(nt, 'ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'; L.new(nn.outputs[0], dot.inputs[0]); dot.inputs[1].default_value = sun_dir()
    cr = node(nt, 'ShaderNodeValToRGB'); cr.color_ramp.interpolation = 'CONSTANT'
    half = node(nt, 'ShaderNodeMath'); half.operation = 'MULTIPLY_ADD'; L.new(dot.outputs['Value'], half.inputs[0])
    half.inputs[1].default_value = half.inputs[2].default_value = 0.5; L.new(half.outputs[0], cr.inputs[0])   # -1..1 -> 0..1
    lo, hi, dark, mid, lit = TOON; e = cr.color_ramp.elements
    e[0].position, e[0].color = 0.0, (*dark, 1)
    e[1].position, e[1].color = hi, (*lit, 1)
    e.new(lo).color = (*mid, 1)
    # Some of the true light, shadows included, deepens the gaps where crowns crowd each other (A2's woods
    # are round crowns parted by dark teal hollows), without taking the lit tops away.
    dif = node(nt, 'ShaderNodeBsdfDiffuse'); s2r = node(nt, 'ShaderNodeShaderToRGB'); L.new(dif.outputs[0], s2r.inputs[0])
    bw = node(nt, 'ShaderNodeRGBToBW'); L.new(s2r.outputs['Color'], bw.inputs[0])
    occ = mixc(nt, (1, 1, 1, 1), (0.35, 0.5, 0.55, 1), math_(nt, 'MULTIPLY', ramp(nt, bw.outputs[0], 1.2, 0.5), 0.8))
    lit = mixc(nt, mixc(nt, c, cr.outputs['Color'], 1.0, 'MULTIPLY'), occ, 1.0, 'MULTIPLY')
    em = node(nt, 'ShaderNodeEmission'); L.new(snow_over(nt, lit), em.inputs['Color'])   # snow after the light: white, not lit-top yellow
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'); L.new(em.outputs[0], out.inputs['Surface'])


# --- set pieces

def standin(name):
    """Simple shapes for a model not made yet: enough to judge layout, scale and light."""
    import bmesh, mathutils
    M = mathutils.Matrix
    bm = bmesh.new()
    def add(fn, mat_i, **kw):
        g = fn(bm, **kw)
        for f in {f for v in g['verts'] for f in v.link_faces}: f.material_index = mat_i
    leaf = lambda: bpy.data.materials.get('leaf') or flat_mat('leaf', (0.035, 0.09, 0.015), 0.9)
    mats = []
    if name.startswith('tree'):
        add(bmesh.ops.create_cone, 0, segments=6, radius1=0.05, radius2=0.03, depth=0.35, matrix=M.Translation((0, 0, 0.17)))
        if name != 'tree-bare':
            for dx, dy, dz, r in ((0, 0, 0.5, 0.26), (0.12, 0.05, 0.4, 0.18), (-0.1, -0.06, 0.42, 0.18), (0.02, 0.1, 0.62, 0.15)):
                add(bmesh.ops.create_icosphere, 1, subdivisions=2, radius=r * (0.8 if name == 'tree-pine' else 1), matrix=M.Translation((dx, dy, dz)))
        mats = [flat_mat('bark', (0.18, 0.11, 0.06)), leaf()]
    elif name == 'bush':
        add(bmesh.ops.create_icosphere, 0, subdivisions=2, radius=0.14, matrix=M.Translation((0, 0, 0.08))); mats = [leaf()]
    elif name == 'rocks':
        for dx, r in ((0, 0.16), (0.18, 0.1), (-0.15, 0.08)):
            add(bmesh.ops.create_icosphere, 0, subdivisions=1, radius=r, matrix=M.Translation((dx, 0, r * 0.5)))
        mats = [flat_mat('stone', (0.35, 0.31, 0.26))]
    elif name == 'castle':
        add(bmesh.ops.create_cube, 0, size=1, matrix=M.Translation((0, 0, 0.12)) @ M.Diagonal((1.4, 1.1, 0.24, 1)))
        add(bmesh.ops.create_cube, 1, size=1, matrix=M.Translation((0, -0.05, 0.38)) @ M.Diagonal((0.6, 0.4, 0.3, 1)))
        mats = [flat_mat('wall', (0.45, 0.40, 0.33)), flat_mat('roof', (0.35, 0.08, 0.05))]
    elif name == 'hamlet':
        for dx, dy in ((-0.18, 0.1), (0.15, 0.12), (0, -0.15)):
            add(bmesh.ops.create_cube, 0, size=1, matrix=M.Translation((dx, dy, 0.07)) @ M.Diagonal((0.24, 0.18, 0.14, 1)))
            add(bmesh.ops.create_cone, 1, segments=4, radius1=0.2, radius2=0, depth=0.12, matrix=M.Translation((dx, dy, 0.2)) @ M.Rotation(math.pi / 4, 4, 'Z'))
        mats = [flat_mat('plaster', (0.55, 0.48, 0.38)), flat_mat('thatch', (0.30, 0.22, 0.12))]
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for mt in mats: me.materials.append(mt)
    return me


def prepare(name, f, cache):
    """Imports a model once: joined into one mesh, cut to its triangle budget, maps reduced to 1024 and packed,
    scaled so its larger footprint side is SIZE cells and standing on z = 0; written to the cache."""
    import mathutils
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=f)
    new = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in new: o.select_set(True)
    bpy.context.view_layer.objects.active = new[0]
    if len(new) > 1: bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM'); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    # Image-to-3D at its best quality is millions of triangles and 4K maps; a piece is a few dozen pixels on
    # the map (and a tree stands a thousand times), so it is cut to a budget before it is used.
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    if tris > BUDGET[name]:
        mod = ob.modifiers.new('cut', 'DECIMATE'); mod.ratio = BUDGET[name] / tris
        bpy.ops.object.modifier_apply(modifier='cut')
    for img in {n.image for m in ob.data.materials if m and m.use_nodes for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image}:
        if max(img.size) > 1024: img.scale(1024, 1024)
        img.pack()
    me = ob.data; me.name = name
    vs = [v.co for v in me.vertices]
    lo = mathutils.Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    hi = mathutils.Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    me.transform(mathutils.Matrix.Scale(SIZE[name] / max(hi.x - lo.x, hi.y - lo.y), 4) @ mathutils.Matrix.Translation((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z)))
    for o in [o for o in bpy.data.objects if o not in before]: bpy.data.objects.remove(o)
    bpy.data.libraries.write(cache, {me}, fake_user=True)
    return me


def model(name):
    """The mesh for a set piece (from the cache when it is newer than the model), its materials taught the season."""
    f, cache = f'{MODELS}/{name}.glb', f'{CACHE}/{name}-v{PREPARED}.blend'
    if not os.path.exists(f): return standin(name), True
    if os.path.exists(cache) and os.path.getmtime(cache) > os.path.getmtime(f):
        with bpy.data.libraries.load(cache, link=False) as (src, dst): dst.meshes = [name]
        me = dst.meshes[0]
    else: me = prepare(name, f, cache)
    for m in me.materials:
        if m and m.use_nodes: seasonal(m, muted=name in ('tree-bare', 'rocks', 'castle', 'hamlet'))
    return me, False


def contour(me, t, mat):
    """A thin dark contour round a model, as A2 draws every crown, rock and wall: a copy of its surface pushed
    out `t` along the normals and turned inside out, seen only where it shows past the model's own edge (an
    inverted hull; Freestyle lines took over ten minutes on a wood of trees)."""
    import bmesh
    bm = bmesh.new(); bm.from_mesh(me)
    geom = bmesh.ops.duplicate(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:])['geom']
    vs = [g for g in geom if isinstance(g, bmesh.types.BMVert)]; fs = [g for g in geom if isinstance(g, bmesh.types.BMFace)]
    bm.normal_update()
    for v in vs: v.co += v.normal * t
    bmesh.ops.reverse_faces(bm, faces=fs)
    me.materials.append(mat); k = len(me.materials) - 1
    for f in fs: f.material_index = k
    bm.to_mesh(me); bm.free()


def unhide(ob, cam, coll, ground, what='castle'):
    """Nothing may stand between the camera and the castle: rays from points on the castle toward the camera;
    a tree or bush they hit is removed (and the test repeated), and how much of the castle the ground itself
    still hides is printed (the terrain round the castle is shaped so this is nothing)."""
    import mathutils
    vl = bpy.context.view_layer; toward = (cam.matrix_world.to_3x3() @ mathutils.Vector((0, 0, 1))).normalized()
    vs = ob.data.vertices; pts = [ob.matrix_world @ vs[i].co for i in range(0, len(vs), max(1, len(vs) // 3000))]
    pts = [p for p in pts if p.z > ground(p.x, p.y) + 0.03]   # the footing sunk into the ground is not seen
    removed = 0
    for _ in range(6):
        vl.update(); dg = bpy.context.evaluated_depsgraph_get(); hit_trees, by_ground = set(), 0
        for p in pts:
            ok, _, _, _, o, _ = bpy.context.scene.ray_cast(dg, p + toward * 0.02, toward)
            if not ok or o.original == ob: continue
            if o.original.name in coll.objects: hit_trees.add(o.original)
            elif o.original.name == 'terrain': by_ground += 1
        for o in hit_trees: bpy.data.objects.remove(o)
        removed += len(hit_trees)
        if not hit_trees: break
    print(f'{what} hidden by ground {by_ground / len(pts):.3f}, trees removed {removed}')


def place(me, x, y, z, rot=0.0, s=1.0, coll=None):
    ob = bpy.data.objects.new(me.name, me)
    ob.location = (x, y, z); ob.rotation_euler = (0, 0, rot); ob.scale = (s, s, s)
    (coll or bpy.context.scene.collection).objects.link(ob)
    return ob


def build(city, season, out, keep_blend):
    import numpy as np
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    m, villages = field(city); H, W = len(m), len(m[0])
    n = country(m)
    board = json.load(open(f'{WG}/source/guides/board.json'))
    z, hillf, wetf = terrain(n, ground_mat(), [(v['x'] + MARGIN, v['y'] + MARGIN) for v in villages])
    wimg = bpy.data.images.new('wet', wetf.shape[1], wetf.shape[0], float_buffer=True)
    px = np.repeat(np.flipud(np.clip(wetf, 0, 1))[..., None], 4, -1); px[..., 3] = 1
    wimg.colorspace_settings.name = 'Non-Color'; wimg.pixels.foreach_set(px.astype(np.float32).ravel()); wimg.update(); wimg.pack()
    def at(x, y, f): return float(f[min(max(int(round((-y + MARGIN) * SUB)), 0), f.shape[0] - 1), min(max(int(round((x + MARGIN) * SUB)), 0), f.shape[1] - 1)])
    ground = lambda x, y: at(x, y, z)
    bpy.ops.mesh.primitive_plane_add(size=1, location=(W / 2, -H / 2, -0.07)); wp = bpy.context.object
    wp.scale = (W + 2 * MARGIN, H + 2 * MARGIN, 1); wp.data.materials.append(water_mat(wimg))
    flat_mat('leaf', (0.035, 0.09, 0.015), 0.9)   # shared by the stand-ins' crowns
    hsv_g, leaf, snow, leafmix, light, sun_k, sky_k, bare, blossom = SEASON[season]
    kinds = {k: model(k) for k in SIZE}
    me = lambda k: kinds[k][0]
    ink = bpy.data.materials.new('contour'); ink.use_nodes = True; ink.use_backface_culling = True
    inb = ink.node_tree.nodes['Principled BSDF']; inb.inputs['Base Color'].default_value = (0.012, 0.01, 0.005, 1); inb.inputs['Roughness'].default_value = 1
    for k, (mesh, _) in kinds.items():
        if k == 'tree-bare': continue          # twigs: a hull round each one would turn the tree black
        contour(mesh, 0.009 if k.startswith('tree') else 0.012 if k in ('bush', 'rocks') else 0.006, ink)
    broad = ['tree-bare', 'tree-bare'] if bare else ['tree-broad-a', 'tree-broad-b']
    rnd = random.Random(int(city) * 7 + 1)
    trees = bpy.data.collections.new('trees'); sc.collection.children.link(trees)
    vil = {(v['x'], v['y']) for v in villages}
    # The castle and the hamlets stand clear: the cells beside and in front of them (nearer the camera) keep
    # only low trees, so a wood never hides the town the battle is fought for (A2 frames its castle so).
    castles = [(x, y) for y in range(H) for x in range(W) if m[y][x] == CASTLE]
    front = {(cx + dx, cy + dy) for cx, cy in vil for dx in (-1, 0, 1) for dy in (0, 1, 2)} | \
            {(cx + dx, cy + dy) for cx, cy in castles for dx in range(-2, 3) for dy in (2, 3)}
    def inside_walls(x, y): return any(abs(x - (cx + 0.5)) < CLEAR and abs(-y - (cy + 0.6)) < CLEAR for cx, cy in castles) or \
        any(abs(x - (cx + 0.5)) < HCLEAR and abs(-y - (cy + 0.6)) < HCLEAR for cx, cy in vil)
    def put(kind, x, y, s, sink=0.03):
        if inside_walls(x, y): return            # nothing grows or lies inside the castle's footprint
        place(me(kind), x, y, ground(x, y) - sink, rnd.uniform(0, 6.28), s, trees)
    for gy in range(n.shape[0]):
        for gx in range(n.shape[1]):
            t, bx, by = n[gy, gx], gx - MARGIN, gy - MARGIN
            inside = 0 <= bx < W and 0 <= by < H
            if (bx, by) in vil or t == CASTLE: continue
            if t == FOREST:
                # A jittered 2 x 2 of round crowns per cell, a pine in four.
                # Low trees in front of the castle and hamlets, and where water lies just north (tall crowns stand
                # up over the cell beyond them and would hide a narrow river).
                low = (bx, by) in front or (gy > 0 and n[gy - 1, gx] == RIVER)
                for i in range(4):
                    x, y = bx + (i % 2 + rnd.uniform(0.25, 0.75)) / 2, -(by + (i // 2 + rnd.uniform(0.35, 0.9)) / 2)
                    k = rnd.choice(broad * 3 + ['tree-pine'])
                    # Crowns about half a cell wide, so a wood reads as round trees with dark hollows between
                    # (A2's); bare winter trees stay larger, or a wood of twigs thins to nothing.
                    size = rnd.uniform(0.85, 1.05) if low else rnd.uniform(1.15, 1.4)
                    put(k, x, y, size * (1.4 if k == 'tree-bare' else 1))
            elif t == SAND:
                if rnd.random() < 0.12:   # sand carries only the odd scrub
                    put('bush', bx + rnd.uniform(0.1, 0.9), -(by + rnd.uniform(0.2, 0.95)), rnd.uniform(0.5, 0.8))
            elif t == PLAIN:
                for _ in range(2):
                    if rnd.random() < 0.3:
                        x, y = bx + rnd.uniform(0.1, 0.9), -(by + rnd.uniform(0.2, 0.95))
                        put('bush', x, y, rnd.uniform(0.6, 1.1))
                if (bx, by) not in front and rnd.random() < (0.06 if inside else 0.18):
                    x, y = bx + rnd.uniform(0.2, 0.8), -(by + rnd.uniform(0.3, 0.9))
                    put(rnd.choice(broad + ['tree-pine']), x, y, rnd.uniform(0.8, 1.1))
            if t != RIVER and t != MOUNT:
                # The bank: a few stones and tufts on the land where it meets the water (A2's shores are edged so).
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = gx + dx, gy + dy
                    if 0 <= nx < n.shape[1] and 0 <= ny < n.shape[0] and n[ny, nx] == RIVER:
                        for _ in range(3):
                            ex = bx + 0.5 + dx * rnd.uniform(0.25, 0.48) + (rnd.uniform(-0.45, 0.45) if dx == 0 else 0)
                            ey = -(by + 0.5 + dy * rnd.uniform(0.25, 0.48) + (rnd.uniform(-0.45, 0.45) if dy == 0 else 0))
                            if ground(ex, ey) > -0.06: put(rnd.choice(['rocks', 'rocks', 'bush']), ex, ey, rnd.uniform(0.35, 0.6), sink=0.05)
            if t == MOUNT:
                # A grassy cap with a bush or a tree; at the foot, where the rock meets the field, a boulder or
                # two and a bush (A2 beds its outcrops in rubble and scrub, it does not crown them with it).
                for _ in range(2):
                    x, y = bx + rnd.uniform(0.15, 0.85), -(by + rnd.uniform(0.2, 0.9))
                    if at(x, y, hillf) > 0.8 and rnd.random() < 0.35: put(rnd.choice(['bush', 'bush', broad[0], 'tree-pine']), x, y, rnd.uniform(0.7, 1.0))
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = gx + dx, gy + dy
                    if 0 <= nx < n.shape[1] and 0 <= ny < n.shape[0] and n[ny, nx] not in (MOUNT, RIVER, FOREST):
                        for _ in range(2):
                            if rnd.random() > 0.55: continue
                            ex = bx + 0.5 + dx * rnd.uniform(0.8, 1.0) + (rnd.uniform(-0.45, 0.45) if dx == 0 else 0)
                            ey = -(by + 0.5 + dy * rnd.uniform(0.8, 1.0) + (rnd.uniform(-0.45, 0.45) if dy == 0 else 0))
                            if at(ex, ey, hillf) < 0.05 and ground(ex, ey) > -0.06:
                                put(rnd.choice(['rocks', 'rocks', 'bush']), ex, ey, rnd.uniform(0.5, 0.85), sink=0.06)
    for by in range(H):
        for bx in range(W):
            if m[by][bx] == CASTLE: castle = place(me('castle'), bx + 0.5, -(by + 0.6), ground(bx + 0.5, -(by + 0.5)), s=1.3)
    hamlets = [place(me('hamlet'), v['x'] + 0.5, -(v['y'] + 0.6), ground(v['x'] + 0.5, -(v['y'] + 0.5)), rnd.uniform(-0.3, 0.3)) for v in villages]
    # The season: one set of values into every material that has the season's nodes.
    for mat in bpy.data.materials:
        if not mat.use_nodes: continue
        for nd in mat.node_tree.nodes:
            if nd.name == 'snow': nd.outputs[0].default_value = snow
            elif nd.name == 'leafmix': nd.outputs[0].default_value = leafmix
            elif nd.name == 'blossom': nd.outputs[0].default_value = blossom
            elif nd.name == 'leaf': nd.outputs[0].default_value = (*leaf, 1)
            elif nd.name == 'groundhsv':
                for k, v in zip(('Hue', 'Saturation', 'Value'), hsv_g): nd.inputs[k].default_value = v
            elif nd.name == 'waterhsv': nd.inputs['Saturation'].default_value = 0.8 if bare else 1.15; nd.inputs['Value'].default_value = 0.65 if bare else 0.68
    # Light: a warm sun low from the upper left, a cool sky fill, contact shadows and occlusion.
    sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = sun_k; sun.color = light; sun.angle = math.radians(4)
    so = bpy.data.objects.new('sun', sun); so.rotation_euler = (math.radians(SUN[0]), 0, math.radians(SUN[1])); sc.collection.objects.link(so)
    world = bpy.data.worlds.new('sky'); world.use_nodes = True; sc.world = world
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.5, 0.62, 0.85, 1); world.node_tree.nodes['Background'].inputs['Strength'].default_value = sky_k * 1.6
    # Camera: orthographic, looking north, tilted so a cell is board.h/19 tall for board.w/32 wide on screen.
    cw, ch = board['w'] / W, board['h'] / H
    elev = math.asin(ch / cw)
    cam = bpy.data.cameras.new('cam'); cam.type = 'ORTHO'; cam.ortho_scale = board['gw'] / cw
    cam.clip_start, cam.clip_end = 0.1, 400
    tx, ty = W / 2, -H / 2; d = 100
    co = bpy.data.objects.new('cam', cam); co.location = (tx, ty - d * math.cos(elev), d * math.sin(elev))
    co.rotation_euler = (math.pi / 2 - elev, 0, 0); sc.collection.objects.link(co); sc.camera = co
    # The board's centre sits where the guide has it (below the frame's centre): shift the frame.
    cam.shift_x = -((board['x'] + board['w'] / 2) - board['gw'] / 2) / board['gw']
    cam.shift_y = ((board['y'] + board['h'] / 2) - board['gh'] / 2) / board['gw']
    r = sc.render; r.resolution_x, r.resolution_y = board['gw'] * SCALE, board['gh'] * SCALE; r.resolution_percentage = 100
    for eng in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT'):
        try: r.engine = eng; break
        except TypeError: pass
    ee = sc.eevee; ee.taa_render_samples = 32
    for k, v in (('use_raytracing', True), ('use_shadows', True), ('shadow_ray_count', 2), ('use_gtao', True), ('gtao_distance', 0.6)):
        try: setattr(ee, k, v)
        except (AttributeError, TypeError): pass
    try: ee.fast_gi_method = 'GLOBAL_ILLUMINATION'; ee.fast_gi_distance = 0.8; ee.ray_tracing_method = 'SCREEN'
    except (AttributeError, TypeError): pass
    sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'
    r.image_settings.file_format = 'PNG'; r.filepath = out
    unhide(castle, co, trees, ground)
    for h, v in zip(hamlets, villages): unhide(h, co, trees, ground, f"{v['kind']} {v['x']},{v['y']}")
    if keep_blend: bpy.ops.wm.save_as_mainfile(filepath=out.replace('.png', '.blend'))
    bpy.ops.render.render(write_still=True)
    print('standins:', [k for k, (_, s) in kinds.items() if s])


if __name__ == '__main__':
    if bpy is None: outside()
    else:
        a = sys.argv[sys.argv.index('--') + 1:]
        build(a[0], a[1], a[2], '--blend' in a)
