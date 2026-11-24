// tools/static_check.mjs: passes on the current tree and catches a cycle, a core -> rendering import, a stale
// allowlist entry, and a dead build / mirror hook. Pure Node, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { brokenImports, checkImports, checkMirror, checkWebp, readModules } from '../tools/static_check.mjs';

const MVP = fileURLToPath(new URL('..', import.meta.url));
const tree = (spec) => {
  const dir = mkdtempSync(join(tmpdir(), 'static-check-'));
  for (const [f, text] of Object.entries(spec)) { mkdirSync(join(dir, f, '..'), { recursive: true }); writeFileSync(join(dir, f), text); }
  return dir;
};
const modules = (spec) => { const dir = tree(spec); try { return readModules(dir); } finally { rmSync(dir, { recursive: true, force: true }); } };

test('the current tree passes with exit 0', () => {
  const r = spawnSync(process.execPath, [join(MVP, 'tools/static_check.mjs')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

test('an import cycle is caught, a dynamic import is not an edge', () => {
  const cyc = modules({ 'a.js': "import { b } from './b.js';", 'b.js': "export * from './c.js';", 'c.js': "import './a.js';" });
  const errs = checkImports(cyc, new Map(), new Map());
  assert.equal(errs.length, 1); assert.match(errs[0], /a\.js \| b\.js \| c\.js/);
  const dyn = modules({ 'a.js': "const b = () => import('./b.js');", 'b.js': "import './a.js';" });
  assert.deepEqual(checkImports(dyn, new Map(), new Map()), []);
  assert.deepEqual(checkImports(cyc, new Map([['a.js | b.js | c.js', 'x']]), new Map()), []);
  assert.match(checkImports(dyn, new Map([['a.js | b.js', 'x']]), new Map())[0], /stale ALLOW_CYCLES/);
});

test('a relative import that resolves nowhere is caught; an existing json or asset outside src/js is allowed', () => {
  const spec = {
    'a.js': "import { b } from './b.js';\nimport './gone.js';\nimport d from '../data/x.json';\nimport '../data/missing.json';\nconst l = () => import('./nope.js');",
    'b.js': 'export const b = 1;'
  };
  const dir = tree({ 'src/a.js': spec['a.js'], 'src/b.js': spec['b.js'], 'data/x.json': '{}' });
  try {
    const files = readModules(join(dir, 'src'));
    const errs = checkImports(files, new Map(), new Map(), join(dir, 'src'));
    assert.deepEqual(errs.sort(), ['broken import: a.js -> ./gone.js', 'broken import: a.js -> ./nope.js', 'broken import: a.js -> ../data/missing.json'].sort());
    assert.equal(brokenImports(files).length, 4, 'without srcDir only graph files resolve');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('core importing three, a bare package or anything outside core/ is caught', () => {
  const files = modules({
    'core/game.js': "import * as THREE from 'three';\nimport { x } from '../ui.js';\nimport { y } from './ai.js';\nconst z = () => import('../app.js');",
    'core/ai.js': 'export const y = 1;', 'ui.js': 'export const x = 1;', 'app.js': '',
  });
  const errs = checkImports(files, new Map(), new Map());
  assert.equal(errs.length, 3, errs.join('\n'));
  assert.ok(errs.some((e) => /three/.test(e)) && errs.some((e) => /\.\.\/ui\.js/.test(e)) && errs.some((e) => /\.\.\/app\.js/.test(e)));
  assert.deepEqual(checkImports(files, new Map(), new Map(errs.map((e) => [e.replace(/^core import: /, '').split(' (')[0], 'x']))), []);
});

test('a dead WEBP or public.json hook is caught', () => {
  assert.deepEqual(checkWebp(MVP), []); assert.deepEqual(checkMirror(MVP), []);
  const root = mkdtempSync(join(tmpdir(), 'static-check-mvp-')), mvp = join(root, 'hd2d-mvp');
  try {
    mkdirSync(join(mvp, 'desktop'), { recursive: true }); mkdirSync(join(mvp, 'src'), { recursive: true });
    mkdirSync(join(mvp, 'tools/opensource'), { recursive: true });
    cpSync(join(MVP, 'tools/opensource/manifest.txt'), join(mvp, 'tools/opensource/manifest.txt'));
    writeFileSync(join(mvp, 'src/app.js'), 'const a = 1;');
    writeFileSync(join(mvp, 'desktop/build-app.mjs'), "const WEBP = [{ dir: 'd', ref: ['assets/${k}.png', 'assets/${k}.webp'], in: 'src/app.js' }];\n");
    assert.match(checkWebp(mvp)[0], /no longer contains/);
    writeFileSync(join(mvp, 'tools/opensource/public.json'), JSON.stringify({ rename: [{ file: 'hd2d-mvp/src/app.js', from: 'nope', to: 'x' }, { file: 'hd2d-mvp/src/gone.js', from: 'a', to: 'b' }] }));
    const errs = checkMirror(mvp, root);
    assert.equal(errs.length, 2, errs.join('\n'));
    assert.match(errs[0], /"nope" not found/); assert.match(errs[1], /gone\.js is not in the export/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
