// Static gate, no browser, no dependencies, about a second:  node hd2d-mvp/tools/static_check.mjs
// Exit 0 when everything holds, otherwise one line per violation and exit 1.
//   1. src/**/*.js: the static import graph (import … from, import '…', export … from) has no cycle. Dynamic import()
//      is listed separately and never counts as an edge.
//   2. src/core/**/*.js imports only other files under src/core/ (no three, no bare package, nothing outside core/).
//   3. The build and mirror hooks still hit: every WEBP entry of desktop/build-app.mjs (its `in` file exists and holds
//      ref[0]) and every public.json rule of tools/opensource (file exists, is exported, `from` is found, same
//      sequential semantics as export.mjs).
//      Every relative specifier (static or dynamic) must resolve: to a .js under src/, or, for a target outside src/ or not
//      a .js (../data/x.json, ../assets/...), to a file that exists. Otherwise: `broken import: <from> -> <spec>`.
//   4. src/zhtable.js (繁體) has every character of the shipped text that 繁體 writes differently (checkZhHant).
//   5. Command completeness and color-mix() are guarded by tests/dockcommands.test.mjs (needs the browser, so not
//      re-checked here) and tests/csscompat.test.mjs (pure Node, run it with the changes that touch *.css).
// Known violations that predate this gate are in ALLOW_* below, each with its reason; only a new one fails, and an
// entry that no longer matches anything fails too, so the list shrinks as the code is fixed.
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseManifest, selected } from './opensource/export.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const MVP = resolve(HERE, '..');

// Allowed import cycles, as the sorted member list (paths relative to src/) joined by ' | '.
export const ALLOW_CYCLES = new Map([]);
// Allowed core imports, 'core/file.js -> specifier'.
export const ALLOW_CORE = new Map([]);

const STATIC = /^\s*(?:import\s+(?:[^'";]+?\s+from\s+)?|export\s+(?:\{[^}]*\}|\*(?:\s+as\s+\w+)?)\s+from\s+)["']([^"']+)["']/gm;
const DYNAMIC = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
// Comment stripper only: it does not understand strings or regex literals, so a `/*` and `*/` pair inside one swallows the
// text between them. src/ has no such case today.
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');

const listJs = (dir) => readdirSync(dir, { recursive: true }).filter((f) => f.endsWith('.js')).map((f) => f.split(sep).join('/')).sort();

// Reads every .js under srcDir: { files: Map(rel -> { statics: [spec], dynamics: [spec] }) }.
export function readModules(srcDir) {
  const files = new Map();
  for (const rel of listJs(srcDir)) {
    const text = strip(readFileSync(join(srcDir, rel), 'utf8'));
    files.set(rel, { statics: [...text.matchAll(STATIC)].map((m) => m[1]), dynamics: [...text.matchAll(DYNAMIC)].map((m) => m[1]) });
  }
  return files;
}

// A relative specifier resolved to a path relative to src/ ('core/game.js'); null for a bare package specifier.
const resolveSpec = (from, spec) => (spec.startsWith('.') ? relative('.', join(dirname(from), spec)).split(sep).join('/') : null);

// Strongly connected components with more than one member (or a self import), as sorted member lists.
export function findCycles(files) {
  const edges = new Map([...files].map(([f, m]) => [f, m.statics.map((s) => resolveSpec(f, s)).filter((t) => t && files.has(t))]));
  let n = 0; const idx = new Map(), low = new Map(), on = new Set(), stack = [], out = [];
  const go = (v) => {
    idx.set(v, n); low.set(v, n++); stack.push(v); on.add(v);
    for (const w of edges.get(v)) {
      if (!idx.has(w)) { go(w); low.set(v, Math.min(low.get(v), low.get(w))); } else if (on.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)));
    }
    if (low.get(v) === idx.get(v)) {
      const comp = []; let w;
      do { w = stack.pop(); on.delete(w); comp.push(w); } while (w !== v);
      if (comp.length > 1 || edges.get(v).includes(v)) out.push(comp.sort());
    }
  };
  for (const v of edges.keys()) if (!idx.has(v)) go(v);
  return out.sort((a, b) => a[0].localeCompare(b[0]));
}

// Core files importing anything that is not another file under core/ (static and dynamic alike).
export function coreViolations(files) {
  const bad = [];
  for (const [f, m] of files) {
    if (!f.startsWith('core/')) continue;
    for (const spec of [...m.statics, ...m.dynamics]) {
      const t = resolveSpec(f, spec);
      if (t === null) bad.push(`${f} -> ${spec} (bare package; core stays free of three and the DOM)`);
      else if (!t.startsWith('core/')) bad.push(`${f} -> ${spec} (outside src/core/)`);
    }
  }
  return bad;
}

// Relative imports whose target is nowhere (findCycles drops these silently). srcDir lets a target outside src/ or a
// non-.js file (a json, an asset) count when it exists on disk; without it only the files in the graph resolve.
export function brokenImports(files, srcDir = null) {
  const bad = [];
  for (const [f, m] of files) {
    for (const spec of [...m.statics, ...m.dynamics]) {
      const t = resolveSpec(f, spec);
      if (t === null || (t.endsWith('.js') && files.has(t))) continue;
      if (srcDir && !(t.endsWith('.js') && !t.startsWith('..')) && existsSync(join(srcDir, t))) continue;
      bad.push(`broken import: ${f} -> ${spec}`);
    }
  }
  return bad;
}

export function checkImports(files, allowCycles = ALLOW_CYCLES, allowCore = ALLOW_CORE, srcDir = null) {
  const errors = [...brokenImports(files, srcDir)], seen = new Set();
  for (const comp of findCycles(files)) {
    const key = comp.join(' | ');
    if (allowCycles.has(key)) seen.add(key); else errors.push(`import cycle among ${comp.length} modules: ${key}`);
  }
  for (const key of allowCycles.keys()) if (!seen.has(key)) errors.push(`stale ALLOW_CYCLES entry (cycle is gone, delete it): ${key}`);
  const seenCore = new Set();
  for (const v of coreViolations(files)) {
    const key = v.split(' (')[0];
    if (allowCore.has(key)) seenCore.add(key); else errors.push(`core import: ${v}`);
  }
  for (const key of allowCore.keys()) if (!seenCore.has(key)) errors.push(`stale ALLOW_CORE entry (import is gone, delete it): ${key}`);
  return errors;
}

export function checkWebp(mvp = MVP) {
  const errors = [], text = readFileSync(join(mvp, 'desktop/build-app.mjs'), 'utf8');
  const m = text.match(/^const WEBP = (\[[\s\S]*?\n?\]);$/m);
  if (!m) return ['desktop/build-app.mjs: no `const WEBP = [...]` line found (this check parses it; update static_check.mjs if the shape changed)'];
  const list = Function(`return ${m[1]}`)();
  for (const { ref: [from], in: file } of list) {
    const f = join(mvp, file);
    if (!existsSync(f)) errors.push(`build-app.mjs WEBP: ${file} does not exist`);
    else if (!readFileSync(f, 'utf8').includes(from)) errors.push(`build-app.mjs WEBP: ${file} no longer contains ${from}`);
  }
  return errors;
}

// public.json `rename`, applied in order on in-memory copies exactly as export.mjs does: the file must be in the export
// (manifest.txt selects it, or overlay/ supplies it), `json` rules need valid JSON, text rules need `from` to be found.
export function checkMirror(mvp = MVP, repoRoot = resolve(mvp, '..')) {
  const errors = [], dir = join(mvp, 'tools/opensource');
  const pub = JSON.parse(readFileSync(join(dir, 'public.json'), 'utf8'));
  const want = parseManifest(readFileSync(join(dir, 'manifest.txt'), 'utf8'));
  const overlay = join(dir, 'overlay'), texts = new Map();
  for (const r of pub.rename ?? []) {
    const over = join(overlay, r.file), src = join(repoRoot, r.file);
    if (!texts.has(r.file)) {
      if (existsSync(over)) texts.set(r.file, readFileSync(over, 'utf8'));
      else if (selected(want, r.file) && existsSync(src)) texts.set(r.file, readFileSync(src, 'utf8'));
      else { errors.push(`public.json: ${r.file} is not in the export (missing, or manifest.txt does not select it)`); texts.set(r.file, null); }
    }
    const s = texts.get(r.file);
    if (s === null) continue;
    if (r.json) { try { JSON.parse(s); } catch (e) { errors.push(`public.json: ${r.file} is not valid JSON (${e.message})`); } continue; }
    if (!s.includes(r.from)) errors.push(`public.json: "${r.from}" not found in ${r.file}`);
    else texts.set(r.file, s.split(r.from).join(r.to));
  }
  return errors;
}

// 繁體 (系统 → 文字): every character of the shipped text that 繁體 writes differently has its entry in src/zhtable.js, so
// new text never shows a 简体 character in 繁體. A new word the table lacks is not caught (characters convert one by one
// there); rebuild the table before a release (docs/dev/release.md).
export async function checkZhHant(mvp = MVP) {
  const { shippedText, runs, ST_KEYS, TABLE } = await import('./zh_hant_table.mjs');
  if (resolve(TABLE) !== join(mvp, 'src', 'zhtable.js')) return [];
  const keys = new Set([...readFileSync(ST_KEYS, 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).join('')]);
  const { default: table } = await import(`${new URL(`file://${TABLE}`).href}?t=${Date.now()}`);
  const miss = new Set();
  for (const r of runs(shippedText())) for (const c of r) if (keys.has(c) && !(c in table.chars)) miss.add(c);
  return miss.size ? [`src/zhtable.js lacks ${miss.size} character(s) the text now uses (${[...miss].slice(0, 20).join('')}): run node hd2d-mvp/tools/zh_hant_table.mjs`] : [];
}

export function runAll(mvp = MVP) {
  const files = readModules(join(mvp, 'src'));
  const dyn = [...files].flatMap(([f, m]) => m.dynamics.map((d) => `${f} -> ${d}`));
  return { errors: [...checkImports(files, ALLOW_CYCLES, ALLOW_CORE, join(mvp, 'src')), ...checkWebp(mvp), ...checkMirror(mvp)], modules: files.size, dynamics: dyn };
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const { errors, modules, dynamics } = runAll();
  errors.push(...(await checkZhHant()));
  if (process.argv.includes('--dynamic')) console.log(`dynamic imports (not edges):\n  ${dynamics.join('\n  ')}`);
  if (errors.length) { console.error(`static_check: ${errors.length} violation(s)\n${errors.map((e) => `  ✗ ${e}`).join('\n')}`); process.exit(1); }
  console.log(`static_check ok: ${modules} modules, ${dynamics.length} dynamic imports, build and mirror hooks hit.`);
  console.log('Not re-checked here: dock command completeness (tests/dockcommands.test.mjs, browser) and background color-mix() (tests/csscompat.test.mjs, pure Node: run it when touching *.css).');
}
