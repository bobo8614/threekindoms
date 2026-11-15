#!/usr/bin/env python3
# Sets two runs of war_look_check.mjs --json side by side, scenario by scenario (set, city, month): the failed checks must
# read word for word the same, the numbers quoted in them aside (two runs of unchanged code print ΔE 5.7 one time and 5.6
# the next; those same numbers are in m, where they are held to the tolerance below), and every number in m must agree
# within 2% (a quantity under 0.5 in size within 0.01, where 2% of it would be finer than the measure). Text in m (the
# closest terrain pair, the move cells' colour) must match exactly; a scenario or a key on one side only is a difference. Prints each disagreement; the last line is SAME when there are none, else DIFF <count>.
#   python3 hd2d-mvp/tools/war_look_diff.py <a.json> <b.json>
# For a refactor that should change nothing: tools/fixtures/war_look_pre_split.json against a run on the new code.
import json
import re
import sys


def load(path):
    with open(path, encoding='utf8') as f:
        return {(r['set'], r['city'], r['month']): r for r in json.load(f)}


def words(fails):
    return [re.sub(r'\d+(\.\d+)?', '#', f) for f in fails]


def close(x, y):
    if isinstance(x, bool) or isinstance(y, bool) or not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
        return x == y
    if max(abs(x), abs(y)) < 0.5:
        return abs(x - y) <= 0.01
    return abs(x - y) <= 0.02 * max(abs(x), abs(y))


def diff_m(a, b, path=''):
    out = []
    if isinstance(a, dict) and isinstance(b, dict):
        for k in sorted(set(a) | set(b)):
            if k not in a or k not in b:
                out.append(f'{path}{k}: {"missing in a" if k not in a else "missing in b"}')
            else:
                out += diff_m(a[k], b[k], f'{path}{k}.')
    elif isinstance(a, list) and isinstance(b, list) and len(a) == len(b):
        for i, (x, y) in enumerate(zip(a, b)):
            out += diff_m(x, y, f'{path}{i}.')
    elif not close(a, b):
        out.append(f'{path.rstrip(".")}: {a!r} vs {b!r}')
    return out


a, b = load(sys.argv[1]), load(sys.argv[2])
bad = []
for key in sorted(set(a) | set(b)):
    name = '%s city %d month %d' % key
    if key not in a or key not in b:
        bad.append(f'{name}: only in {"b" if key not in a else "a"}')
        continue
    ra, rb = a[key], b[key]
    if words(ra['fails']) != words(rb['fails']):
        bad.append(f'{name}: fails differ\n    a: {ra["fails"]}\n    b: {rb["fails"]}')
    bad += [f'{name}: m.{d}' for d in diff_m(ra['m'], rb['m'])]
for line in bad:
    print(line)
print('SAME' if not bad else f'DIFF {len(bad)}')
