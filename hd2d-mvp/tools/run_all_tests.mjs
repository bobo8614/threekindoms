#!/usr/bin/env node
// The full suite before a release, in lanes: one test file is one node --test process with its own dev server and
// Chrome (tests/game.mjs), so the browser files run LANES at a time, the longest first. Files that measure time or
// frame-to-frame movement (SERIAL) run afterwards with the machine to themselves, and a file that failed in a lane
// is run once more on its own: a pass there is reported as "passed on retry", never folded into a plain pass.
//   node hd2d-mvp/tools/run_all_tests.mjs [--lanes 3] [--out <dir>]
// Writes <dir>/progress.txt (a line per finished file), <dir>/result.json (seconds per file) and <dir>/logs/<file>.<phase>.log
// (the complete output); <dir> defaults to a new folder under the system's temp directory, printed at the start.
// Exit code 0 only when every file passed, first time or on its retry. Measured 2026-11-21 (111 files, 987 tests):
// about 60 min one file at a time, 37 min with 3 lanes and strategyflat and war still serial; with war in a lane too it took longer, not shorter.
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync, appendFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url)), TESTS = join(ROOT, 'hd2d-mvp/tests');
const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : def; };
const LANES = Math.max(1, +arg('lanes', 3)), OUT = arg('out', '') || mkdtempSync(join(tmpdir(), 'sangguo-tests-'));
const FILE_CAP = 20 * 60e3, TOTAL_CAP = 90 * 60e3, T0 = Date.now();
// Alone, after the lanes: these time what the game does (pace, command), hold a pad button for a set time (gamepad), or
// failed under three lanes' load on 2026-11-21 (pack-region: a town off its board while the boards were still easing; war: 432 s
// and its own failures alone, 1144 s and 12 failures in a lane beside strategyflat and skirmish, and warsplit failed next to it).
const SERIAL = ['pace', 'command', 'gamepad', 'pack-region', 'war'];
// The longest files, to start first so no lane is left finishing one of them alone (seconds on 2026-11-21: strategyflat 408,
// skirmish 346, warshop 184, actpanel 140, …). A file not named here follows in name order.
const LONGEST = ['strategyflat', 'skirmish', 'warshop', 'actpanel', 'pack-map', 'succession', 'ending', 'pad-records', 'strike', 'quick-save', 'warsplit'];

mkdirSync(join(OUT, 'logs'), { recursive: true });
const all = readdirSync(TESTS).filter((f) => f.endsWith('.test.mjs')).map((f) => f.replace('.test.mjs', ''));
const browser = all.filter((n) => readFileSync(join(TESTS, `${n}.test.mjs`), 'utf8').includes('startGame'));
const pure = all.filter((n) => !browser.includes(n)), serial = SERIAL.filter((n) => browser.includes(n));
const rank = (n) => { const i = LONGEST.indexOf(n); return i < 0 ? LONGEST.length : i; };
const lanes = browser.filter((n) => !SERIAL.includes(n)).sort((a, b) => rank(a) - rank(b));
const results = [], live = new Set();
const mins = (since) => ((Date.now() - since) / 60e3).toFixed(1);
const note = (s) => { const line = `[${mins(T0)} min] ${s}`; console.log(line); appendFileSync(join(OUT, 'progress.txt'), line + '\n'); };
const save = () => writeFileSync(join(OUT, 'result.json'), JSON.stringify(results, null, 1));

// One node --test process over `names`, in its own process group so a file over FILE_CAP is killed with its server and Chrome.
function run(names, phase, tag = names[0]) {
  return new Promise((resolve) => {
    const t = Date.now();
    const child = spawn(process.execPath, ['--test', '--test-concurrency=1', ...names.map((n) => `hd2d-mvp/tests/${n}.test.mjs`)], { cwd: ROOT, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    live.add(child);
    let out = '', timedOut = false;
    child.stdout.on('data', (d) => { out += d; }); child.stderr.on('data', (d) => { out += d; });
    const cap = setTimeout(() => { timedOut = true; killGroup(child, 'SIGTERM'); setTimeout(() => killGroup(child, 'SIGKILL'), 5000).unref(); }, FILE_CAP);
    child.on('close', (code) => {
      clearTimeout(cap); live.delete(child); writeFileSync(join(OUT, 'logs', `${tag}.${phase}.log`), out);
      const num = (k) => +(out.match(new RegExp(`^ℹ ${k} (\\d+)`, 'm'))?.[1] ?? -1);
      const failed = [...new Set([...out.matchAll(/^✖ (.+?) \([\d.]+ms\)$/gm)].map((m) => m[1]))];
      const r = { file: tag, phase, sec: Math.round((Date.now() - t) / 1000), ok: code === 0 && !timedOut, tests: num('tests'), fail: num('fail'), timedOut, failed };
      results.push(r); save(); note(`${r.ok ? 'ok  ' : 'FAIL'} ${phase} ${tag} ${r.sec}s tests=${r.tests} fail=${r.fail}${timedOut ? ' TIMEOUT' : ''}`);
      resolve(r);
    });
  });
}
function killGroup(child, sig) { try { process.kill(-child.pid, sig); } catch {} }
function stopAll(why) { note(`STOPPED: ${why}`); for (const c of live) killGroup(c, 'SIGKILL'); save(); process.exit(2); }
setTimeout(() => stopAll(`over ${TOTAL_CAP / 60e3} min in all`), TOTAL_CAP).unref();
process.on('SIGTERM', () => stopAll('SIGTERM')); process.on('SIGINT', () => stopAll('SIGINT'));

note(`logs in ${OUT}`);
note(`${pure.length} rule files, ${lanes.length} browser files in ${LANES} lanes, then alone: ${serial.join(' ')}`);
if (pure.length) await run(pure, 'rules', 'rules');
let t = Date.now(); const queue = [...lanes];
await Promise.all(Array.from({ length: LANES }, async () => { while (queue.length) await run([queue.shift()], 'lane'); }));
note(`lanes done in ${mins(t)} min`);
t = Date.now(); for (const n of serial) await run([n], 'serial');
note(`serial files done in ${mins(t)} min`);
const again = results.filter((r) => r.phase === 'lane' && !r.ok).map((r) => r.file);
for (const n of again) await run([n], 'retry');

const last = new Map(results.map((r) => [r.file, r])), bad = [...last.values()].filter((r) => !r.ok);
const retried = again.filter((n) => last.get(n).ok), first = results.filter((r) => r.phase !== 'retry');
note(`${first.reduce((a, r) => a + Math.max(0, r.tests), 0)} tests in ${first.length - 1 + pure.length} files, ${mins(T0)} min`);
for (const n of retried) note(`passed on retry (failed in a lane: ${results.find((r) => r.file === n).failed.join(' | ') || 'no test named'}): ${n}`);
for (const r of bad) note(`FAILED: ${r.file}${r.timedOut ? ' (timed out)' : ''}: ${r.failed.join(' | ')}`);
note(bad.length ? `${bad.length} file(s) failed` : retried.length ? 'all passed, some only on retry (listed above)' : 'all passed');
process.exit(bad.length ? 1 : 0);
