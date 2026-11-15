#!/usr/bin/env node
// Which test files a change needs: reads `git diff <base>` (committed and uncommitted), matches each changed file
// and its changed lines against RULES, and prints the test files with the reason for each.
//   node hd2d-mvp/tools/affected_tests.mjs [base=HEAD]          list (base..working tree, new files included)
//   node hd2d-mvp/tools/affected_tests.mjs A..B                 list for a range of commits
//   node hd2d-mvp/tools/affected_tests.mjs [base] --cmd         one node --test command line (empty when none)
// A file no rule names runs everything, so a new module is never skipped by accident. The full suite still runs
// once before a branch is merged; this is for the runs while a change is being made.
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const ALL = readdirSync(new URL('../tests', import.meta.url)).filter((f) => f.endsWith('.test.mjs')).map((f) => f.replace('.test.mjs', ''));

// The 战场武器店 test walks deploy → 布阵完成 → select → unit buttons → shop modal → 确定, so it also runs when a
// change touches anything that can sit over or swallow those clicks (an overlay, pointer-events, z-index).
const CLICKPATH = /shop|武器|equip|weapon|armou?r|unitacts|clickCell|deploy|布阵|modal|shade|pointer-events|z-index|warcards|\.gear|chest\(|军资金/i;
// Every test file that opens the war map or reads the war view's sources: a change to the 3D view (src/warview.js and its
// modules under src/war/) or to what it draws with can show in any of them, not only in war.test.
const WARSET = ['warsplit', 'actpanel', 'strike', 'seethrough', 'suspend', 'strategyflat', 'casttarget', 'gamepad', 'levelup', 'repeat', 'quick-save-war', 'gpu',
  'retreatcount', 'moods', 'sysmenu', 'war', 'sfx', 'unitacts', 'titlelayout', 'warshop', 'warreport-ui', 'warreport', 'warcardfit', 'succession', 'strategy'];
const RULES = [
  { path: /^hd2d-mvp\/(tests\/game\.mjs|tools\/(headless\.mjs|serve\.py))$/, tests: ALL },
  { path: /^hd2d-mvp\/data\//, tests: ALL },
  { path: /^hd2d-mvp\/tests\/(\w+)\.test\.mjs$/, self: true },
  { path: /^hd2d-mvp\/src\/core\/field\.js$/, tests: ['qimen', 'tactical', 'war'], when: { warshop: CLICKPATH } },
  { path: /^hd2d-mvp\/src\/core\/(tactical|warcore)\.js$/, tests: ['tactical', 'skirmish', 'qimen', 'war'] },
  { path: /^hd2d-mvp\/src\/core\/ai\.js$/, tests: ['search', 'strategy'] },
  { path: /^hd2d-mvp\/src\/core\/game\.js$/, tests: ['search', 'qimen', 'tactical', 'strategy', 'command'], when: { warshop: CLICKPATH } },
  { path: /^hd2d-mvp\/src\/strategy(?:roads|cities|sky|marks|war)?\.js$/, tests: ALL }, // the split has the same coverage as the original strategy.js
  { path: /^hd2d-mvp\/src\/war\//, tests: WARSET },
  { path: /^hd2d-mvp\/src\/(warview|warmap2d|seethrough|post|quality|warplate)\.js$/, tests: WARSET, when: { warshop: CLICKPATH } },
  { path: /^hd2d-mvp\/src\/(warview|seethrough|warplate)\.js$/, tests: ['seethrough'] },
  { path: /^hd2d-mvp\/src\/skyfx2d\.js$/, tests: ['war', 'strategyflat'] },
  { path: /^hd2d-mvp\/src\/warcard\.js$/, tests: ['war', 'warshop'] },
  { path: /^hd2d-mvp\/src\/pace\.js$/, tests: ['pace', 'war'] },
  { path: /^hd2d-mvp\/src\/(skirmish|duel)\w*\.js$/, tests: ['skirmish'] },
  { path: /^hd2d-mvp\/src\/(app|ui)\.js$|^hd2d-mvp\/src\/ui\.css$/, tests: ['war', 'strategy', 'command'], when: { warshop: CLICKPATH } },
  { path: /^hd2d-mvp\/src\/assets\.js$/, tests: ['war', 'strategy'], when: { warshop: /equip/i } },
  { path: /^hd2d-mvp\/assets\/ai\/icon\/equip\//, tests: ['warshop'] },
  { path: /^hd2d-mvp\/(docs|assets|tools)\/|^\.|\.md$/, tests: [] },
  { path: /^hd2d-mvp\/src\//, tests: ALL }, // a module no rule names yet
];

const args = process.argv.slice(2), base = args.find((a) => !a.startsWith('--')) ?? 'HEAD';
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' });
const range = base.includes('..') ? base.split('..') : [base], untracked = range.length > 1 ? '' : git('ls-files', '--others', '--exclude-standard');
const files = [...new Set([...git('diff', '--name-only', ...range).split('\n'), ...untracked.split('\n')])].filter(Boolean);
const why = new Map(), add = (t, r) => { if (ALL.includes(t)) why.set(t, [...(why.get(t) ?? []), r.replace(/^hd2d-mvp\//, '').replace(/\/[^/]+\.webp$/, '/*.webp')]); };
for (const f of files) {
  const rule = RULES.find((r) => r.path.test(f));
  if (!rule) continue; // outside hd2d-mvp
  if (rule.self) { add(f.match(rule.path)[1], f); continue; }
  for (const t of rule.tests) add(t, f);
  if (rule.when) {
    let lines = '';
    try { lines = git('diff', '-U0', ...range, '--', f).split('\n').filter((l) => /^[+-][^+-]/.test(l)).join('\n'); } catch {}
    for (const [t, re] of Object.entries(rule.when)) if (!rule.tests.includes(t) && re.test(lines)) add(t, `${f} (${lines.match(re)[0]})`);
  }
}
const tests = ALL.filter((t) => why.has(t));
if (args.includes('--cmd')) console.log(tests.length ? `node --test --test-concurrency=1 ${tests.map((t) => `hd2d-mvp/tests/${t}.test.mjs`).join(' ')}` : '');
else if (!tests.length) console.log('no tests affected');
else for (const t of tests) console.log(`${t}.test.mjs  ← ${[...new Set(why.get(t))].join(', ')}`);
