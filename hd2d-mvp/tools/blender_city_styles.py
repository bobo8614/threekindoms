# The 战略地图 sand table's city models in other building styles (docs/城池风格模型_方案_2026-11-22.md): a data pack's
# new town with "style": "japan" or "korea" stands as city-<tier>-<style>.glb instead of the Han city-<tier>.glb.
# Each Tripo original in assets/ai/sandtable/source/models/<name>.glb is made the size and weight of its Han tier as
# tools/blender_sandtable.py makes the Han ones (SIZE, GAME), its paint brought to the Han model's brightness, and
# written to a staging folder with a review sheet; --install copies the reviewed GLBs to assets/ai/sandtable/board/models/.
#   /opt/homebrew/bin/blender -b --factory-startup --python-exit-code 1 -P hd2d-mvp/tools/blender_city_styles.py -- <stage_dir> [name ...]
#   /opt/homebrew/bin/blender -b --factory-startup --python-exit-code 1 -P hd2d-mvp/tools/blender_city_styles.py -- <stage_dir> --install [name ...]
# Default names: every city-*-<style>.glb / pass-<style>.glb found in source/models.
import glob, json, math, os, shutil, sys
import bpy, mathutils
import numpy as np

TOOLS = os.path.dirname(os.path.abspath(__file__))
MVP = os.path.dirname(TOOLS)
SRC = f'{MVP}/assets/ai/sandtable/source/models'
DEST = f'{MVP}/assets/ai/sandtable/board/models'
STYLES = ('japan', 'korea')
# As tools/blender_sandtable.py: the footprint's larger side, and what the game draws (triangles, texture side).
SIZE = {'city-capital': 1.15, 'city-major': 0.9, 'city-county': 0.68, 'pass': 0.85}
GAME = {'city-capital': (24000, 1024), 'city-major': (16000, 1024), 'city-county': (10000, 1024), 'pass': (12000, 1024)}
# The paint's brightness is matched to the Han model of the tier, within these bounds (Tripo's paint varies by run).
GAIN = (0.85, 1.45)
# And its saturation, only ever down (CHROMA the most it is cut): Tripo paints these warmer than the Han set, and the sand
# table's lamplight and grade then turn them orange-gold beside the Han towns (2D town pictures, 2026-11-22).
CHROMA = (0.55, 1.0)
WELD = 1e-5  # coincident-vertex distance, as a share of the model's larger side
QA_EPS = 0.001  # coplanar faces closer than this (world units at the game size) are a flicker; qa_check.py's default

args = sys.argv[sys.argv.index('--') + 1:]
stage, rest = args[0], args[1:]
install = '--install' in rest
names = [n for n in rest if not n.startswith('--')] or sorted(
    os.path.basename(f)[:-4] for f in glob.glob(f'{SRC}/*.glb') if any(f.endswith(f'-{s}.glb') for s in STYLES))
os.makedirs(stage, exist_ok=True)

def tier_of(name):
    base = name.rsplit('-', 1)[0]
    if base not in SIZE or name.rsplit('-', 1)[1] not in STYLES: raise ValueError(f'{name}: not <tier kind>-<style>')
    return base

def images(objs):
    return {n.image for o in objs for m in o.data.materials if m and m.node_tree for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image}

LUMA = np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)

def paint_stats(img):
    """Mean brightness and saturation (max - min channel) of the painted texels (the atlas's empty black gutters left out)."""
    w, h = img.size; px = np.empty(w * h * 4, dtype=np.float32); img.pixels.foreach_get(px); px = px.reshape(-1, 4)
    luma = px[:, :3] @ LUMA; m = (px[:, 3] > 0.5) & (luma > 0.02)
    if not m.any(): return 0.0, 0.0
    rgb = px[m, :3]
    return float(luma[m].mean()), float((rgb.max(1) - rgb.min(1)).mean())

def load(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    obs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    if not obs: raise ValueError(f'no mesh in {path}')
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs: o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    if len(obs) > 1: bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM'); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in [o for o in bpy.context.scene.objects if o != ob]: bpy.data.objects.remove(o)
    return ob

def han_stats(base):
    ob = load(f'{DEST}/{base}.glb')
    st = [paint_stats(i) for i in images([ob])]
    return float(np.mean([a for a, _ in st])), float(np.mean([b for _, b in st]))

def tris(me): return sum(len(p.vertices) - 2 for p in me.polygons)

def clean(me, eps):
    """After the reduction, at the game size: faces whose paint collapsed to a point (zero UV area), and of each pair
    of coplanar faces within eps the smaller one when they face the same way (they flicker) or both when they face
    each other (hidden, glued). The same tests as the blender-asset-qa skill's qa_check.py."""
    import bmesh
    from mathutils.bvhtree import BVHTree
    from mathutils.geometry import intersect_point_tri
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.triangulate(bm, faces=list(bm.faces))
    bm.faces.ensure_lookup_table(); uv = bm.loops.layers.uv.active; drop = set()
    for f in bm.faces:
        p = [l[uv].uv for l in f.loops]
        if abs((p[1].x - p[0].x) * (p[2].y - p[0].y) - (p[2].x - p[0].x) * (p[1].y - p[0].y)) < 1e-12: drop.add(f.index)
    zero_uv = len(drop)
    tree = BVHTree.FromBMesh(bm); fight = glued = 0
    for f in bm.faces:
        if f.index in drop or f.normal.length < 0.5: continue
        a, b, c = (v.co for v in f.verts); cen = (a + b + c) / 3
        for q in (cen, cen.lerp(a, .6), cen.lerp(b, .6), cen.lerp(c, .6)):
            for _, _, j, _ in tree.find_nearest_range(q, eps):
                if j is None or j == f.index or j in drop: continue
                g = bm.faces[j]
                # Faces sharing a corner count too: after export the seams split again and a fold is an overlap.
                if abs(f.normal.dot(g.normal)) < 0.999: continue
                a2, b2, c2 = (v.co for v in g.verts)
                if intersect_point_tri(q - g.normal * g.normal.dot(q - a2), a2, b2, c2) is None: continue
                if f.normal.dot(g.normal) > 0: drop.add(f.index if f.calc_area() <= g.calc_area() else j); fight += 1
                else: drop.update((f.index, j)); glued += 1
                break
            if f.index in drop: break
    bmesh.ops.delete(bm, geom=[bm.faces[i] for i in drop], context='FACES')
    loose = [v for v in bm.verts if not v.link_faces]
    if loose: bmesh.ops.delete(bm, geom=loose, context='VERTS')
    bm.to_mesh(me); bm.free(); me.update()
    return {'zero_uv': zero_uv, 'z_fight': fight, 'back_to_back': glued}

report = {}
if install:
    for name in names:
        tier_of(name)
        f = f'{stage}/{name}.glb'
        if not os.path.isfile(f): raise FileNotFoundError(f'{f}: stage it first')
        shutil.copyfile(f, f'{DEST}/{name}.glb'); print('installed', name, flush=True)
    sys.exit(0)

levels = {}
for name in names:
    base = tier_of(name); budget, side = GAME[base]
    if base not in levels: levels[base] = han_stats(base)
    ob = load(f'{SRC}/{name}.glb'); me = ob.data
    t0 = tris(me)
    # Normal, roughness and metal maps are not drawn by the game (one colour map per piece, as the Han models).
    for m in me.materials:
        if not m or not m.node_tree: continue
        bs = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if not bs: continue
        for socket in ('Normal', 'Metallic', 'Roughness'):
            for l in list(bs.inputs[socket].links): m.node_tree.links.remove(l)
        bs.inputs['Metallic'].default_value = 0; bs.inputs['Roughness'].default_value = 0.8
        base_tex = bs.inputs['Base Color'].links[0].from_node if bs.inputs['Base Color'].links else None
        for n in list(m.node_tree.nodes):
            if n.type == 'TEX_IMAGE' and n != base_tex: m.node_tree.nodes.remove(n)
    # glTF splits vertices at UV seams; reduced as separate islands they tear into cracks the table shows through.
    # Weld them first (loop UVs stay with the loops, so the paint does not move).
    import bmesh
    bm = bmesh.new(); bm.from_mesh(me); v0 = len(bm.verts)
    span = max(max(v.co[i] for v in bm.verts) - min(v.co[i] for v in bm.verts) for i in range(3))
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=WELD * span)
    welded = v0 - len(bm.verts); bm.to_mesh(me); bm.free(); me.update()
    if me.has_custom_normals:  # imported split normals refer to the unwelded faces
        bpy.context.view_layer.objects.active = ob; ob.select_set(True); bpy.ops.mesh.customdata_custom_splitnormals_clear()
    # Two passes as the Han pieces had (source → cache budget → game budget) keep the walls' straight edges better.
    for target in (max(budget * 5, budget), budget):
        now = tris(me)
        if now > target:
            mod = ob.modifiers.new('cut', 'DECIMATE'); mod.ratio = target / now
            bpy.ops.object.modifier_apply(modifier=mod.name); me.update()
    # Normalise: centred, standing on z 0, its footprint's larger side SIZE (gates already face the camera: no yaw).
    vs = np.array([tuple(v.co) for v in me.vertices]); lo, hi = vs.min(0), vs.max(0)
    me.transform(mathutils.Matrix.Scale(SIZE[base] / max(hi[0] - lo[0], hi[1] - lo[1]), 4)
                 @ mathutils.Matrix.Translation((-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -lo[2])))
    me.update()
    cleaned = [clean(me, QA_EPS) for _ in range(3)]  # a deleted face can uncover the next pair
    vs = np.array([tuple(v.co) for v in me.vertices]); dims = (vs.max(0) - vs.min(0)).tolist()
    imgs = images([ob]); gains = []; chromas = []
    for img in imgs:
        if max(img.size) > side: img.scale(side, side)
        lv, sat = paint_stats(img); hl, hs = levels[base]
        g = min(max(hl / lv, GAIN[0]), GAIN[1]) if lv else 1.0; gains.append(g)
        k = min(max(hs / sat, CHROMA[0]), CHROMA[1]) if sat else 1.0; chromas.append(k)
        if abs(g - 1) > 0.01 or k < 0.99:
            w, h = img.size; px = np.empty(w * h * 4, dtype=np.float32); img.pixels.foreach_get(px); px = px.reshape(-1, 4)
            y = (px[:, :3] @ LUMA)[:, None]  # chroma scaled about each texel's own grey, so brightness stays
            px[:, :3] = np.clip((y + (px[:, :3] - y) * k) * g, 0, 1); img.pixels.foreach_set(px.ravel()); img.update()
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    out = f'{stage}/{name}.glb'
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_apply=True,
                              export_image_format='JPEG', export_jpeg_quality=85)
    report[name] = {'tier': base, 'source_tris': t0, 'welded': welded, 'cleaned': cleaned, 'tris': tris(me), 'dims': [round(d, 3) for d in dims], 'size': SIZE[base],
                    'textures': len(imgs), 'gain': [round(g, 3) for g in gains], 'chroma': [round(k, 3) for k in chromas], 'han': [round(v, 4) for v in levels[base]],
                    'bytes': os.path.getsize(out)}
    print(name, json.dumps(report[name]), flush=True)
with open(f'{stage}/report.json', 'w') as f: json.dump(report, f, indent=1, ensure_ascii=False)
