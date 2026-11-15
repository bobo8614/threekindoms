// The strategy entry and its rendering helpers must remain an acyclic module graph.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('the strategy modules and their local dependencies have no import cycles', () => {
  const root = fileURLToPath(new URL('../src/', import.meta.url));
  const names = ['strategy', 'strategyroads', 'strategycities', 'strategysky', 'strategymarks', 'strategywar', 'strategyflat', 'strategyshell'];
  const pending = new Set(), done = new Set();
  const visit = (path, chain) => {
    assert.ok(existsSync(path), `missing module ${path}`);
    assert.ok(!pending.has(path), `import cycle: ${[...chain, path].join(' → ')}`);
    if (done.has(path)) return;
    pending.add(path);
    const source = readFileSync(path, 'utf8');
    const statics = /^\s*(?:import\s+(?:[^'";]+?\s+from\s+)?|export\s+(?:\{[^}]*\}|\*)\s+from\s+)["'](\.[^"']+)["']/gm;
    const dynamics = /\bimport\s*\(\s*["'](\.[^"']+)["']\s*\)/g;
    for (const re of [statics, dynamics]) for (const m of source.matchAll(re)) visit(resolve(dirname(path), m[1]), [...chain, path]);
    pending.delete(path); done.add(path);
  };
  for (const name of names) visit(resolve(root, `${name}.js`), []);
});

test('each extracted module selects the same affected tests as strategy.js', { skip: process.platform === 'win32' }, () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'strategy-affected-'));
  try {
    const git = resolve(dir, 'git');
    writeFileSync(git, '#!/bin/sh\nif [ "$1" = diff ] && [ "$2" = --name-only ]; then printf "%s\\n" "$STRATEGY_TEST_FILE"; fi\n');
    chmodSync(git, 0o755);
    const script = fileURLToPath(new URL('../tools/affected_tests.mjs', import.meta.url));
    const selection = (name) => {
      const env = { ...process.env, PATH: `${dir}${delimiter}${process.env.PATH}`, STRATEGY_TEST_FILE: `hd2d-mvp/src/${name}.js` };
      const result = spawnSync(process.execPath, [script, '--cmd'], { env, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr); return result.stdout;
    };
    const original = selection('strategy');
    for (const name of ['strategyroads', 'strategycities', 'strategysky', 'strategymarks', 'strategywar']) assert.equal(selection(name), original, name);
    for (const name of ['strategy.test.mjs', 'strategyflat.test.mjs', 'post.test.mjs', 'hudlayout.test.mjs', 'war.test.mjs', 'territory-grid.test.mjs']) assert.ok(original.includes(name), name);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
