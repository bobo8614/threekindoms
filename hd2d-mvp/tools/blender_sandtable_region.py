#!/usr/bin/env python3
# An overseas region's sand table (docs/战略地图数据包扩展设计_2026-11-17.md §5.5), baked by the original board's own
# pipeline: tools/blender_sandtable.py runs unmodified, its box, grid and directories swapped for the region's as it is
# loaded, and tools/sandtable_ranges.py lays range-a/range-b along the region's crests with its own planner. Neither
# file is edited, so the original board's reviewed preparation and its prepared.json stay valid.
# Every directory is the region's own, in the main checkout's ignored source/regions/<name>/ (never the original's):
#   board/          tools/export_region_board.mjs
#   original-work/  tools/sandtable_region_prepare.py (the from-scratch preparation, before ranges)
#   work/           --ranges below, then Blender's caches and the bake's frames
#   dest/           the baked board, for assets/ai/sandtable/regions/<name>/ once its screenshots are approved
#   renders/        review renders
# and the Tripo range originals are read from source/regions/range-models/ (copies of the reviewed range-a/range-b).
#   python3 -I hd2d-mvp/tools/blender_sandtable_region.py --region <name> --ranges
#   python3 -I hd2d-mvp/tools/blender_sandtable_region.py --region <name> --prepared --views top,mid,far --samples 8 --snow-lat 99 --fstop 8
#   python3 -I hd2d-mvp/tools/blender_sandtable_region.py --region <name> --prepared --range-models
#   python3 -I hd2d-mvp/tools/blender_sandtable_region.py --region <name> --bake --prepared --samples 128
# rangeScale in the region's spec sets the range pieces' scale (the original's is 0.85–1.1): its islands are narrower.
# The review cameras (mid, near, far) are the original board's, moved by the same offset from 兖州 to the region's
# "review" point (tools/regions/<name>.json), so a region's renders sit beside the original's at the same framing.
import json, math, os, subprocess, sys

TOOLS = os.path.dirname(os.path.abspath(__file__))
MAIN = os.path.dirname(os.path.abspath(subprocess.run(['git', 'rev-parse', '--git-common-dir'], cwd=TOOLS, check=True, capture_output=True, text=True).stdout.strip()))
REGION_MVP = f'{MAIN}/hd2d-mvp'
NAME = sys.argv[sys.argv.index('--region') + 1] if '--region' in sys.argv else ''
if not NAME or not all(ch.isalnum() or ch == '-' for ch in NAME): sys.exit('usage: blender_sandtable_region.py --region <name> ...')
REGION_DIR = f'{REGION_MVP}/assets/ai/sandtable/source/regions/{NAME}'
SPEC = json.load(open(f'{TOOLS}/regions/{NAME}.json'))
LON0, LON1, LAT0, LAT1 = SPEC['box']
BOX = ((LON0 - 111.5) * 0.9, (LON1 - 111.5) * 0.9, -(LAT1 - 31.5), -(LAT0 - 31.5))
GRID = (round((LON1 - LON0) / 0.1) + 1, round((LAT1 - LAT0) / 0.1) + 1)


def patched_source():
    """blender_sandtable.py with the region's box, grid, directories, review cameras and focus."""
    src = open(f'{TOOLS}/blender_sandtable.py').read()
    def swap(old, new, count=1):
        nonlocal src
        if src.count(old) != count: raise ValueError(f'blender_sandtable.py changed: expected {count}× {old!r}')
        src = src.replace(old, new)
    swap("MVP = os.path.dirname(TOOLS)\n", f"MVP = {REGION_MVP!r}\nREGION_DIR = {REGION_DIR!r}\n")
    swap("BOARD, MODELS, WORK = f'{SRC}/board', f'{SRC}/models', os.environ.get('SANDTABLE_WORK', f'{SRC}/work')\n",
         "BOARD, MODELS, WORK = f'{REGION_DIR}/board', f'{SRC}/models', f'{REGION_DIR}/work'\n")
    swap("RANGE_MODELS = f'{SRC}/mountains/models'", "RANGE_MODELS = f'{SRC}/regions/range-models'")
    swap("ORIGINAL_WORK = os.environ.get('SANDTABLE_ORIGINAL_WORK', f'{SRC}/rebake-work')", "ORIGINAL_WORK = f'{REGION_DIR}/original-work'")
    swap("BASE_WORK = os.environ.get('SANDTABLE_BASE_WORK', ORIGINAL_WORK)", "BASE_WORK = ORIGINAL_WORK")
    swap("INSTALLED_WORK = os.environ.get('SANDTABLE_INSTALLED_WORK', f'{SRC}/ranges-installed-work')", "INSTALLED_WORK = None")
    swap("X0, X1, Z0, Z1 = (97.5 - 111.5) * 0.9, (125 - 111.5) * 0.9, -(43 - 31.5), -(20 - 31.5)\n", f"X0, X1, Z0, Z1 = {BOX!r}\n")
    swap("NX, NZ = 276, 231\n", f"NX, NZ = {GRID!r}\n")
    swap("DEST = os.environ.get('SANDTABLE_DEST', f'{MVP}/assets/ai/sandtable/board')", "DEST = f'{REGION_DIR}/dest'")
    swap("arg('--out', f'{SRC}/renders')", "arg('--out', f'{REGION_DIR}/renders')", 3)
    swap("focus = next(c for c in b['cities'] if c['name'] == '兖州')", "focus = REGION_FOCUS")
    swap("cm_ = b['cams'][nm]", "cm_ = REGION_CAMS[nm]")
    # The baked ground at the original's texel density (4096 px over its 24.75 width), not 4096 px over a small board.
    # No side over 4096 px either (phones' texture limit): the 20–46° japan board is taller than the original's 4096×3806.
    swap("    W, Wl = 4096, 2048", "    W = 8 * round(min(4096 * (X1 - X0) / 24.75, 4096 * (X1 - X0) / (Z1 - Z0)) / 8); Wl = W // 2")
    # The manifest also holds the unpatched bake script, so a change to it asks for a new preview as it does for China.
    swap("checks = {'script': file_hash(__file__),", "checks = {'script': [file_hash(__file__), file_hash(f'{TOOLS}/blender_sandtable.py')],")
    return src


def review_cameras():
    """The original board's review cameras moved from 兖州 to the region's review point, and that point (DOF focus)."""
    china = json.load(open(f'{REGION_MVP}/assets/ai/sandtable/source/board/board.json'))
    import numpy as np
    G = np.load(f'{REGION_DIR}/original-work/ground.npz')['G']
    x, z = (SPEC['review'][0] - 111.5) * 0.9, -(SPEC['review'][1] - 31.5)
    j, k = round((z - BOX[2]) / ((BOX[3] - BOX[2]) / (G.shape[0] - 1))), round((x - BOX[0]) / ((BOX[1] - BOX[0]) / (G.shape[1] - 1)))
    y = float(G[j, k])
    ref = next(c for c in china['cities'] if c['name'] == '兖州')
    cams = {nm: {**c, 'pos': [c['pos'][0] + x - ref['x'], c['pos'][1] + y - ref['y'], c['pos'][2] + z - ref['z']]} for nm, c in china['cams'].items()}
    return cams, {'x': x, 'y': y, 'z': z}


def load(run_main):
    ns = {'__name__': '__main__' if run_main else 'blender_sandtable_region', '__file__': os.path.abspath(__file__)}
    src = patched_source()
    if not run_main: src = src[:src.index('\ntry:\n    import bpy  # noqa: F401\n')]
    if os.path.isfile(f'{REGION_DIR}/original-work/ground.npz'): ns['REGION_CAMS'], ns['REGION_FOCUS'] = review_cameras()
    exec(compile(src, f'{TOOLS}/blender_sandtable.py', 'exec'), ns)
    return ns


def ranges():
    """sandtable_ranges.prepare without the original board's checks (installed board, 9eb6ba56 massifs, --keep): the
    region's own massifs are the sites the ranges must cover, and everything else in its preparation is kept."""
    import shutil
    from collections import Counter
    import numpy as np
    from PIL import Image
    ns = load(False)
    sys.path.insert(0, TOOLS)
    import sandtable_ranges as R
    # A region's islands are narrower than the original's mountain belts: its own piece scale (rangeScale), as its ranges are shorter.
    if 'rangeScale' in SPEC: R.RANGE_SCALE = tuple(SPEC['rangeScale'])
    work, base_work = ns['WORK'], ns['BASE_WORK']
    if not os.path.isfile(f'{base_work}/region-prepared.json'): sys.exit(f'{base_work}: run tools/sandtable_region_prepare.py first')
    with open(f'{base_work}/place.json') as f: base = json.load(f)
    if any(p['k'] in R.RANGE_ASPECT for p in base['place']): sys.exit(f'{base_work} already has ranges')
    for name in ns['RANGE_KINDS']:
        if not os.path.isfile(f"{ns['RANGE_MODELS']}/{name}.glb"): sys.exit(f"missing {ns['RANGE_MODELS']}/{name}.glb (copy the reviewed Tripo original)")
    os.makedirs(work, exist_ok=True); os.makedirs(ns['DEST'], exist_ok=True)
    for name in ns['PREPARED_FILES']:
        if name not in ('ground.npz', 'place.json', 'ranges.json', 'mask.png', *(f'{k}-{s}.png' for k in R.RANGE_ASPECT for s in ('paint', 'game'))):
            shutil.copy2(f'{base_work}/{name}', f'{work}/{name}')
    for name in ns['RANGE_KINDS']:
        R.prepare_range_paint(f"{ns['RANGE_MODELS']}/{name}.glb", f'{work}/{name}-paint.png', f'{work}/{name}-game.png')
    with np.load(f'{base_work}/ground.npz') as data: ground = {k: data[k] for k in ('G', 'H0', 'Lv', 'K')}
    references = [p for p in base['place'] if p['k'] == 'massif']
    # The original's budget is RANGE_LIMIT pieces on its land; a region keeps that share of its land, and at least two pieces
    # for each range it names (a small mountainous region would otherwise get one chain for all of them).
    share = json.load(open(f'{base_work}/region-prepared.json'))['share']
    limit = max(math.ceil(R.RANGE_LIMIT * share), 2 * len(SPEC.get('ranges', [])))
    G, pieces, cover, sizes, report_ = R.plan(ns, ground, base, None, (), limit, references)
    if not pieces: sys.exit('no ranges fit the region; inspect its heights (RANGE_HEIGHT) and clearance')
    support = R.support_mask(ns, pieces, G.shape)
    place = [p for p in base['place'] if p['k'] != 'massif' and not (p['k'] in ('tree-broad', 'tree-pine', 'grove', 'hill') and R.clears_tree(ns, p, pieces, support))]
    old, new = Counter(p['k'] for p in base['place']), Counter(p['k'] for p in place)
    base['place'] = place + pieces
    with open(f'{work}/place.json', 'w') as f: json.dump(base, f, default=float)
    np.savez(f'{work}/ground.npz', G=G.astype(np.float32), H0=ground['H0'], Lv=ground['Lv'], K=ground['K'])
    # The grassy scrub skirt, as sandtable_ranges.prepare paints it.
    mask = np.array(Image.open(f'{base_work}/mask.png').convert('RGBA'), dtype=np.float32) / 255
    c = np.asarray(Image.fromarray(cover.astype(np.float32), 'F').resize((mask.shape[1], mask.shape[0]), Image.Resampling.BILINEAR)) * R.RANGE_SCRUB_STRENGTH
    no_paint = Image.fromarray(((ground['Lv'] > 0) | (ground['K'] > .05) | (ground['G'] <= ns['SEA_Y'] + .03)).astype(np.uint8) * 255, 'L')
    no_paint = np.asarray(no_paint.resize((mask.shape[1], mask.shape[0]), Image.Resampling.NEAREST)) > 0
    no_paint |= np.asarray(Image.open(f'{base_work}/pads.png').convert('L').resize((mask.shape[1], mask.shape[0]), Image.Resampling.NEAREST)) > 0
    no_paint |= np.asarray(Image.open(f'{base_work}/road-alpha.png').convert('L').resize((mask.shape[1], mask.shape[0]), Image.Resampling.NEAREST)) < 255
    c[no_paint] = 0
    mask[..., 0] = mask[..., 0] * (1 - c) + R.RANGE_SCRUB_GRASS * c
    mask[..., 1] = mask[..., 1] * (1 - c) + R.RANGE_SCRUB_FOREST * c
    mask[..., 2] *= 1 - c
    Image.fromarray((np.clip(mask, 0, 1) * 255).astype(np.uint8), 'RGBA').save(f'{work}/mask.png')
    near, far = R.model_budgets(len(pieces), ns['GAME']['range-a'][0], ns['GAME_FAR']['range-a'])
    report = {'region': NAME, 'pieces': len(pieces), 'limit': limit, 'chains': len(sizes), 'single': sum(n == 1 for n in sizes), 'longest': max(sizes, default=0),
              'near_per_piece': near, 'far_per_piece': far, 'trees_removed': sum(old[k] - new[k] for k in ('tree-broad', 'tree-pine', 'grove')),
              'hills_removed': old['hill'] - new['hill'], 'second_row': sum(bool(p.get('row')) for p in pieces),
              'old_massifs_covered': sum(x['covered'] for x in report_), 'old_massifs': report_}
    with open(f'{work}/ranges.json', 'w') as f: json.dump(report, f, indent=2)
    print('ranges:', {k: v for k, v in report.items() if k != 'old_massifs'}, flush=True)
    ns['prepared_manifest'](write=True)


def seed_dest():
    """A region draws with the original board's piece models (src/sandtable.js loads them from board/models), so its bake
    keeps them (--keep-models): copied here for the bake's checks, with the range pair recorded as current for its layout
    (the original's per-piece budget, sandtable_ranges.model_budgets, is no larger than the region's)."""
    import shutil
    ns = load(False)
    src, dst = f"{ns['MVP']}/assets/ai/sandtable/board/models", f"{ns['DEST']}/models"
    os.makedirs(dst, exist_ok=True)
    for f in sorted(os.listdir(src)):
        if f.endswith('.glb'): shutil.copy2(f'{src}/{f}', f'{dst}/{f}')
    sys.path.insert(0, TOOLS)
    import sandtable_ranges as R
    with open(f"{ns['WORK']}/place.json") as f: count = sum(p['k'] in ns['RANGE_KINDS'] for p in json.load(f)['place'])
    with open(f"{ns['MVP']}/assets/ai/sandtable/board/board.json") as f: shipped = sum(len(v) // 6 for k, v in json.load(f)['pieces'].items() if k in ns['RANGE_KINDS'])
    budget = lambda n: list(R.model_budgets(n, ns['GAME']['range-a'][0], ns['GAME_FAR']['range-a']))
    if any(s > r for s, r in zip(budget(shipped), budget(count))):  # the original's models must fit the region's per-piece budget
        sys.exit('the region\'s range budget differs from the original\'s: build its own range models with --range-models')
    ns['mark_range_models']()
    print('seeded', dst)


if __name__ == '__main__':
    if '--seed-dest' in sys.argv: seed_dest(); sys.exit()
    try:
        import bpy  # noqa: F401
        in_blender = True
    except ImportError:
        in_blender = False
    if '--ranges' in sys.argv and not in_blender: ranges()
    elif not in_blender and '--prepared' not in sys.argv and '--finish' not in sys.argv:
        sys.exit('a region renders or bakes only a --prepared layout: run --ranges first')
    else: load(True)  # the bake script's own entry: --prepared checks the manifest, then Blender runs this file again
