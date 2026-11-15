#!/usr/bin/env python3
"""Check the sand-table tree GLBs without Blender: triangles, welded topology, UVs and bounds.

    python3 hd2d-mvp/tools/check_sandtable_trees.py [--pieces tree-broad,tree-pine,grove] [--dir DIR] [--reference DIR] [--report FILE] [--compact-textures] [--require-footprint]

GLTF splits vertices at UV seams, so topology is measured after welding positions to one microunit.
Both LODs need valid UVs in the near atlas. The game ignores the far material and uses the near material on both;
--compact-textures additionally requires a near JPEG and a 4x4 far placeholder.
"""
import argparse
from collections import Counter
import hashlib
import json
import math
from pathlib import Path
import struct
import sys

MVP = Path(__file__).resolve().parent.parent
DEFAULT = MVP / 'assets/ai/sandtable/board/models'
BUDGET = {'tree-broad': (240, 64), 'tree-pine': (240, 64), 'grove': (600, 200)}
FORMATS = {5120: 'b', 5121: 'B', 5122: 'h', 5123: 'H', 5125: 'I', 5126: 'f'}
WIDTHS = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}
WELD = 1e-6
UV_EPS = 1e-4
FOOTPRINT_EPS = 1e-5
FAR_TEXTURE_SIZE = 4


def image_size(data, mime):
    if mime == 'image/png' and data[:8] == b'\x89PNG\r\n\x1a\n' and data[12:16] == b'IHDR' and len(data) >= 24:
        return struct.unpack_from('>II', data, 16)
    if mime == 'image/jpeg' and data[:2] == b'\xff\xd8':
        i = 2
        while i < len(data):
            if data[i] != 0xff: break
            while i < len(data) and data[i] == 0xff: i += 1
            if i >= len(data): break
            marker = data[i]; i += 1
            if marker in (0x01, 0xd8, 0xd9) or 0xd0 <= marker <= 0xd7: continue
            if i + 2 > len(data): break
            length = struct.unpack_from('>H', data, i)[0]
            if length < 2 or i + length > len(data): break
            if marker in (0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf) and length >= 8:
                height, width = struct.unpack_from('>HH', data, i + 3)
                return width, height
            if marker == 0xda: break
            i += length
    raise ValueError(f'invalid or unsupported embedded {mime} image')


def read_glb(path):
    raw = Path(path).read_bytes()
    magic, version, size = struct.unpack_from('<4sII', raw)
    if magic != b'glTF' or version != 2 or size != len(raw):
        raise ValueError(f'{path}: invalid GLB v2 header')
    chunks, offset = {}, 12
    while offset < len(raw):
        length, kind = struct.unpack_from('<I4s', raw, offset)
        offset += 8
        chunks[kind] = raw[offset:offset + length]
        offset += length
    return json.loads(chunks[b'JSON']), chunks[b'BIN\0']


def accessor(doc, binary, index):
    a = doc['accessors'][index]
    if 'sparse' in a:
        raise ValueError('sparse accessors are not supported')
    view = doc['bufferViews'][a['bufferView']]
    fmt = '<' + FORMATS[a['componentType']] * WIDTHS[a['type']]
    size = struct.calcsize(fmt)
    stride = view.get('byteStride', size)
    start = view.get('byteOffset', 0) + a.get('byteOffset', 0)
    return [struct.unpack_from(fmt, binary, start + i * stride) for i in range(a['count'])]


def inspect(path):
    doc, binary = read_glb(path)
    positions, faces, uvs = [], [], []
    for mesh in doc.get('meshes', []):
        for primitive in mesh.get('primitives', []):
            if primitive.get('mode', 4) != 4:
                raise ValueError(f'{path}: expected triangle primitives')
            attrs = primitive['attributes']
            p = accessor(doc, binary, attrs['POSITION'])
            if 'TEXCOORD_0' not in attrs:
                raise ValueError(f'{path}: missing texture coordinates')
            uv = accessor(doc, binary, attrs['TEXCOORD_0'])
            if len(uv) != len(p) or any(not all(math.isfinite(v) for v in q) for q in uv):
                raise ValueError(f'{path}: invalid texture coordinates')
            material = doc['materials'][primitive['material']]
            colour = material.get('pbrMetallicRoughness', {}).get('baseColorTexture')
            if not colour or colour.get('texCoord', 0) != 0:
                raise ValueError(f'{path}: material must use the colour texture on TEXCOORD_0')
            image_id = doc['textures'][colour['index']]['source']
            if not 0 <= image_id < len(doc.get('images', [])):
                raise ValueError(f'{path}: invalid material image')
            uvs.extend(uv)
            ids = [v[0] for v in accessor(doc, binary, primitive['indices'])] if 'indices' in primitive else list(range(len(p)))
            if len(ids) % 3:
                raise ValueError(f'{path}: incomplete triangle')
            base = len(positions)
            positions.extend(p)
            faces.extend(tuple(base + ids[i + k] for k in range(3)) for i in range(0, len(ids), 3))
    if not positions or not faces or any(not all(math.isfinite(v) for v in p) for p in positions):
        raise ValueError(f'{path}: no valid mesh')

    unique, weld_map = {}, []
    for p in positions:
        key = tuple(round(v / WELD) for v in p)
        weld_map.append(unique.setdefault(key, len(unique)))
    parent = list(range(len(unique)))

    def root(v):
        while parent[v] != v:
            parent[v] = parent[parent[v]]
            v = parent[v]
        return v

    if any(v < -UV_EPS or v > 1 + UV_EPS for uv in uvs for v in uv):
        raise ValueError(f'{path}: UV coordinates are outside the paint atlas')
    edges, edge_direction, welded, links, degenerate = Counter(), Counter(), [], {}, 0
    for face in faces:
        a, b, c = (weld_map[v] for v in face)
        if len({a, b, c}) != 3:
            degenerate += 1
            continue
        welded.append((a, b, c))
        # A closed edge count alone misses two shells touching only at one vertex. Its link must be one cycle.
        for v, x, y in ((a, b, c), (b, c, a), (c, a, b)):
            fan = links.setdefault(v, {})
            fan.setdefault(x, set()).add(y); fan.setdefault(y, set()).add(x)
        for u, v in ((a, b), (b, c), (c, a)):
            edge = tuple(sorted((u, v))); edges[edge] += 1; edge_direction[edge] += 1 if u < v else -1
            ru, rv = root(u), root(v)
            if ru != rv:
                parent[ru] = rv
    components = Counter(root(a) for a, _, _ in welded)
    nonmanifold_vertices = 0
    for fan in links.values():
        seen, stack = set(), [next(iter(fan))]
        while stack:
            v = stack.pop()
            if v in seen: continue
            seen.add(v); stack.extend(fan[v] - seen)
        if len(seen) != len(fan) or any(len(neighbours) != 2 for neighbours in fan.values()): nonmanifold_vertices += 1
    images, image_details = [], []
    for im in doc.get('images', []):
        if 'bufferView' not in im:
            raise ValueError(f'{path}: expected an embedded texture')
        view = doc['bufferViews'][im['bufferView']]
        start = view.get('byteOffset', 0)
        data = binary[start:start + view['byteLength']]; mime = im.get('mimeType'); width, height = image_size(data, mime)
        images.append(hashlib.sha256(data).hexdigest())
        image_details.append({'mime': mime, 'width': width, 'height': height, 'bytes': len(data)})
    return {'triangles': len(faces), 'components': sorted(components.values(), reverse=True),
            'single_triangles': sum(n == 1 for n in components.values()), 'boundary_edges': sum(n == 1 for n in edges.values()),
            'nonmanifold_edges': sum(n > 2 for n in edges.values()), 'nonmanifold_vertices': nonmanifold_vertices,
            'inconsistent_winding': sum(n == 2 and abs(edge_direction[e]) == 2 for e, n in edges.items()),
            'degenerate': degenerate, 'uv_vertices': len(uvs),
            'uv_min': [min(uv[i] for uv in uvs) for i in range(2)], 'uv_max': [max(uv[i] for uv in uvs) for i in range(2)],
            'bounds_min': [min(p[i] for p in positions) for i in range(3)], 'bounds_max': [max(p[i] for p in positions) for i in range(3)],
            'images': images, 'image_details': image_details}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--dir', type=Path, default=DEFAULT)
    ap.add_argument('--reference', type=Path, help='original game models; new bounds must fit inside them')
    ap.add_argument('--report', type=Path)
    ap.add_argument('--pieces', help='comma-separated tree kinds; defaults to the board\'s instanced trees')
    ap.add_argument('--compact-textures', action='store_true', help='require a near JPEG and a 4x4 far image')
    ap.add_argument('--require-footprint', action='store_true', help='require the far footprint to span at least the near footprint')
    args = ap.parse_args()
    report, errors = {}, []
    if args.pieces is not None: names = args.pieces.split(',')
    elif (args.dir.parent / 'board.json').is_file():
        with open(args.dir.parent / 'board.json') as f: board = json.load(f)
        names = [name for name in BUDGET if board.get('pieces', {}).get(name)]
    else: names = list(BUDGET)  # standalone candidates have no board metadata
    if (args.pieces is not None and not names) or len(set(names)) != len(names) or any(name not in BUDGET for name in names):
        ap.error('pieces must be distinct tree-broad, tree-pine or grove names')
    for name in names:
        budgets = BUDGET[name]
        result = {}
        for suffix, budget in zip(('', '-far'), budgets):
            key, path = 'near' if not suffix else 'far', args.dir / f'{name}{suffix}.glb'
            try:
                r = inspect(path)
                result[key] = r
                print(f"{name}{suffix}: {r['triangles']} triangles, components {r['components'][:8]}, "
                      f"single triangles {r['single_triangles']}, boundary edges {r['boundary_edges']}, "
                      f"nonmanifold edges/vertices {r['nonmanifold_edges']}/{r['nonmanifold_vertices']}, winding {r['inconsistent_winding']}")
                if r['triangles'] > budget or len(r['components']) != 1 or r['boundary_edges'] or r['nonmanifold_edges'] or r['nonmanifold_vertices'] or r['inconsistent_winding'] or r['degenerate']:
                    errors.append(f'{name}{suffix}: exceeds budget or is not one closed manifold surface')
                if not r['images']:
                    errors.append(f'{name}{suffix}: missing embedded colour texture')
                if args.compact_textures:
                    info = r['image_details']
                    if len(info) != 1 or (not suffix and info[0]['mime'] != 'image/jpeg') or (suffix and (info[0]['width'], info[0]['height']) != (FAR_TEXTURE_SIZE, FAR_TEXTURE_SIZE)):
                        errors.append(f'{name}{suffix}: expected a near JPEG or a 4x4 far placeholder')
                if args.reference:
                    old = inspect(args.reference / f'{name}.glb')
                    if any(r['bounds_min'][i] < old['bounds_min'][i] - 1e-5 or r['bounds_max'][i] > old['bounds_max'][i] + 1e-5 for i in range(3)):
                        errors.append(f'{name}{suffix}: exceeds original game bounds')
            except (OSError, ValueError, KeyError, IndexError, struct.error) as e:
                errors.append(str(e))
        if len(result) == 2 and any(result['far']['uv_min'][i] < result['near']['uv_min'][i] - UV_EPS or result['far']['uv_max'][i] > result['near']['uv_max'][i] + UV_EPS for i in range(2)):
            errors.append(f'{name}: far UV coordinates leave the near paint atlas')
        if args.require_footprint and len(result) == 2:
            for axis in (0, 2):  # GLB Y is up; compare X/Z along the ground.
                near = result['near']['bounds_max'][axis] - result['near']['bounds_min'][axis]
                far = result['far']['bounds_max'][axis] - result['far']['bounds_min'][axis]
                if far + FOOTPRINT_EPS < near: errors.append(f'{name}: far footprint axis {axis} shrank ({far:.6f} < {near:.6f})')
        report[name] = result
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps({'models': report, 'errors': errors}, indent=2) + '\n')
    for error in errors:
        print('FAIL:', error, file=sys.stderr)
    return 1 if errors else 0


if __name__ == '__main__':
    sys.exit(main())
