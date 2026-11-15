# A contact sheet of Tripo set pieces for checking each by eye before it is used: every model rendered alone from
# the game's strategy-map angle (about 50 degrees down) under the sand table's warm lamp, with its triangle count.
#   blender -b --factory-startup -P hd2d-mvp/tools/blender_model_sheet.py -- <out.png> <model.glb>[@yaw°] [...]
import math, os, sys
import bpy, mathutils

args = sys.argv[sys.argv.index('--') + 1:]
out, files = args[0], args[1:]
tiles = []
for spec in files:
    f, _, yaw = spec.partition('@')
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    bpy.ops.import_scene.gltf(filepath=f)
    obs = [o for o in sc.objects if o.type == 'MESH']
    if yaw:
        rz = mathutils.Matrix.Rotation(math.radians(float(yaw)), 4, 'Z')  # glTF roots rotate by quaternion
        for o in [o for o in sc.objects if o.parent is None]: o.matrix_world = rz @ o.matrix_world
        bpy.context.view_layer.update()
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in obs)
    pts = [o.matrix_world @ mathutils.Vector(c) for o in obs for c in o.bound_box]
    lo = mathutils.Vector([min(p[i] for p in pts) for i in range(3)]); hi = mathutils.Vector([max(p[i] for p in pts) for i in range(3)])
    mid, size = (lo + hi) / 2, (hi - lo).length
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = size * 1.05
    d = mathutils.Vector((math.sin(0.15), -math.cos(0.15), 1.2)).normalized()
    cam.location = mid + d * size * 3; cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sc.collection.objects.link(sun)
    sun.data.energy = 3.6; sun.data.color = (1, 0.86, 0.68)
    sun.rotation_euler = mathutils.Vector((-17, -10, 21)).normalized().to_track_quat('Z', 'Y').to_euler()
    sc.world = bpy.data.worlds.new('w'); sc.world.use_nodes = True
    sc.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.42, 0.36, 0.3, 1)
    sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.6
    r = sc.render; r.engine = 'BLENDER_EEVEE' if 'BLENDER_EEVEE' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE_NEXT'
    r.resolution_x = r.resolution_y = 768; r.film_transparent = False
    sc.view_settings.view_transform = 'AgX'
    t = f'/tmp/sheet-{len(tiles)}.png'; r.filepath = t; bpy.ops.render.render(write_still=True)
    tiles.append((t, os.path.basename(spec), tris))

# Compose with Blender's own image API (no PIL in Blender's Python): tiles side by side, 3 per row.
cols = min(3, len(tiles)); rows = (len(tiles) + cols - 1) // cols
sheet = bpy.data.images.new('sheet', 768 * cols, 768 * rows)
import numpy as np
px = np.zeros((768 * rows, 768 * cols, 4), dtype=np.float32)
for i, (t, name, tris) in enumerate(tiles):
    im = bpy.data.images.load(t); a = np.array(im.pixels[:], dtype=np.float32).reshape(768, 768, 4)
    r_, c_ = rows - 1 - i // cols, i % cols
    px[r_ * 768:(r_ + 1) * 768, c_ * 768:(c_ + 1) * 768] = a
    print(f'{name}: {tris} triangles')
sheet.pixels = px.ravel(); sheet.filepath_raw = out; sheet.file_format = 'PNG'; sheet.save()
print('sheet', out)
