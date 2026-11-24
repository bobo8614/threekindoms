#!/usr/bin/env node
// Which test files a change needs: reads `git diff <base>` (committed and uncommitted), matches each changed file
// and its changed lines against RULES, and prints the test files with the reason for each.
//   node hd2d-mvp/tools/affected_tests.mjs [base=HEAD]          list (base..working tree, new files included)
//   node hd2d-mvp/tools/affected_tests.mjs A..B                 list for a range of commits
//   node hd2d-mvp/tools/affected_tests.mjs [base] --cmd         one node --test command line (empty when none)
// A file no rule names runs everything, so a new module is never skipped by accident. The full suite still runs
// once before a branch is merged; this is for the runs while a change is being made.
// src/app.js, src/ui.js and src/ui.css: the browser tests open the whole page, so no import graph says which of them a change
// touches. They get the base war / strategy / command, plus tests picked by what the changed lines (and the function each hunk sits
// in, from git's hunk header) mention: the identifiers in APP_AREAS below, one entry per area of app.js. A new area or function in
// app.js needs a keyword here, or its tests are not picked until the full run (docs/dev/pitfalls/tests.md). Any change to ui.css
// picks the CSS-reading tests. src/phone.js and src/phone.css have no rule of their own on purpose: they fall to the last rule and
// run everything, as the phone layout is read by tests all over.
// Phase 1 will split src/app.js into src/app/*.js: give each submodule its own path rule then (tests picked by path), do not
// lean on the keywords above or on the last-rule catch-all.
// hd2d-mvp/desktop/: main.js, preload.js and uiscale.js select uiscale and desktopwindow; build-app.mjs selects staticcheck (it guards
// the WEBP hook) and opensource-export; every other file under desktop/ selects nothing. tools/desktop_window_check.cjs is not run here.
// The matching is selectTests(file, changedLines), exported for tests/affectedtests.test.mjs; the command line is unchanged.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, realpathSync } from 'node:fs';
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
// Each area of src/app.js and src/ui.js: the tests that cover it, and the identifiers (function, constant, element, API names)
// whose lines or enclosing function mean a change to it. Every identifier here is one that exists in the source.
export const APP_AREAS = [
  { tests: ['sysmenu'], re: /sysButtons|sysmenu|syncHd2dRow|hd2dRow|hd2dText|toggleHd2d|syncQualityRows|quitGame|shellQuit|quitKeys|fullscreen|NativeShell|__nativeBack|window\.desktop|leaveGame|backToTitle|gameVersion|\bhelp\(|resetCamera|SHAKES/ },
  { tests: ['prefs'], re: /\bPREF\b|readPref|writePref|readFlag|writeFlag|toggleHd2d|hd2dRow|toggleRoads|toggleTerritory|pinThreat|threatPinned|sysButtons|\bsetup\(/ },
  { tests: ['desktopwindow'], re: /window\.desktop|shellQuit|quitKeys|fullscreen|quitGame|leaveGame|sysButtons/ },
  { tests: ['androidback'], re: /NativeShell|__nativeBack|quitGame|shellQuit|leaveGame|sysButtons|backToTitle/ },
  { tests: ['placenames'], re: /[pP]laceName|PLACE_NAME|PLACE_NOTE|placePairs/ },
  { tests: ['gamepad'], re: /padZone|padBound|padKey|padText|padKbd|padPress|padTip|padConfirm|padCancel|padCycle|padRing|\bpad\b|cursorShow|cursorStep|cursorFrame|mapConfirm|syncPadHints|keyName|freshInput|addEventListener\('keydown'/ },
  { tests: ['pad-records'], re: /padrecords|RECORD_ACTIONS|recordAction|recordKey|configureRecordButton|resetRecordButtons|useRecordAction|recordLabel|recordItem|padBound|padKbd|syncPadHints|quickSaveKey/ },
  { tests: ['message'], re: /export function message|freshInput|keyName/ },
  { tests: ['phonetarget'], re: /commitguard|freshInput|fresh2|padPressed|\bGUARD\b|actPanel|nudgeTargets|pickOnMap/ },
  { tests: ['dockcommands', 'command'], re: /\bTABS\b|commandDock|async function command|runCommand|\bblocked\(|\bDESC\b|expedition|troopsDialog|cmdVignette|\bDOING\b|caption|\bspend\(/ },
  { tests: ['scout'], re: /scoutCity|pickOnMap|pickCityMap|pickEnemyOfficer|cityKnown|scouted|'侦察'/ },
  { tests: ['repeat', 'batchui'], re: /runTimes|confirmRun|confirmCount|confirmBatch|lastWho|executor|\bbatch\b/ },
  { tests: ['quick-save', 'quick-save-core', 'quick-save-war'], re: /quickSave|quickRecord|quickLoad|saveBlocked|writeRecord|pickSlot|recordItem|recordLabel|useRecordAction|restartWithRecord|loadRecord|LOAD_KEY|pendingLoad|SLOT_NAMES|recordLine|bookPips|markFreeSave/ },
  { tests: ['suspend', 'suspend-lock', 'quick-save-war'], re: /suspend|Suspend|resumeWar|leaveSuspend|withSuspendLock|peekSuspend|takeSuspend|dropSuspend|autoHeld|visibilitychange/ },
  { tests: ['hudlayout'], re: /placeStrategyHud|placeFly|hudWatch|visibleRect|keepClear|clearShift|toggleLogFold|strategyHudTop|\.topbar|\.dock|\.citypanel|\.endturn/ },
  { tests: ['strategyhud'], re: /cityPanel|cityStats|cityKnown|toggleLogFold|addLog|toggleRoads|toggleTerritory|territoryOf|markTerritory|roster|standings|logfold|\bhud\(/ },
  { tests: ['phonecitypanel'], re: /cityPanel|cityStats|officerSheet|roster|\.citypanel/ },
  { tests: ['phonetopbar', 'phonehelpbar'], re: /strategyHudTop|placeStrategyHud|\.topbar|\bhud\(|\bhelp\(/ },
  { tests: ['moods'], re: /showEvent|cineFlash|cutIn|duelStage|\bmood\b|MOODS|setFaces|\bface\(|portrait\(/ },
  { tests: ['disaster'], re: /showEvent|旱灾|洪水|disaster/ },
  { tests: ['succession'], re: /showEvent|succession|\bheir\b|继位|factionName/ },
  { tests: ['ending'], re: /\bending\b|playUnification|playFall|\bendTurn\b|\bendDay\b|g\.over|统一/ },
  { tests: ['actpanel'], re: /actPanel/ },
  { tests: ['skirmish', 'sfx', 'pace'], re: /cutIn|duelStage|quickTactical/ },
  { tests: ['unitacts'], re: /besideUnit/ },
  { tests: ['warcardfit', 'warinfo'], re: /warUi/ },
  { tests: ['warreport-ui', 'roninruler'], re: /settleMenu/ },
  { tests: ['warnav'], re: /warNav/ },
  { tests: ['bootsplash'], re: /bootSplash|bootsplash/ },
  { tests: ['titlelayout', 'editorentry'], re: /\btitle\(/ },
  { tests: ['webgl-startup'], re: /WebGLRenderer|WebGL 2|webglcontextlost/ },
  { tests: ['load-quality-watch'], re: /qualityIdle|quality\.watch/ },
  { tests: ['helpversion'], re: /gameVersion|build\.json|\bhelp\(/ },
  { tests: ['freesave', 'nostudy'], re: /\bsetup\(/ },
  { tests: ['freesave'], re: /freeSave/ },
  { tests: ['nostudy'], re: /noStudy/ },
  { tests: ['labelsize'], re: /labelSizeText|cycleLabelSize/ },
  { tests: ['seasonui'], re: /seasonUi|seasonTurn/ },
  { tests: ['sliders'], re: /export function sliders|\bsliders\(/ },
];
// One `when` entry per test: the tests of several areas get the alternation of their keywords.
const areaWhen = (areas) => {
  const by = new Map();
  for (const { tests, re } of areas) for (const t of tests) by.set(t, [...(by.get(t) ?? []), re.source]);
  return Object.fromEntries([...by].map(([t, src]) => [t, new RegExp(src.join('|'))]));
};
// Any change to ui.css: the tests that read its layout or its text (csscompat parses the stylesheets; the phone ones run at 667x360).
const CSS_TESTS = ['csscompat', 'hudlayout', 'warcardfit', 'seasonui', 'sysmenu', 'titlelayout', 'strategyhud', 'phonecitypanel', 'phonetopbar',
  'phonehelpbar', 'phonetactical', 'phone-input'];
const RULES = [
  { path: /^hd2d-mvp\/(tests\/game\.mjs|tools\/(headless\.mjs|serve\.py))$/, tests: ALL },
  { path: /^hd2d-mvp\/data\//, tests: ALL },
  { path: /^hd2d-mvp\/tests\/([\w-]+)\.test\.mjs$/, self: true },
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
  { path: /^hd2d-mvp\/src\/ui\.css$/, tests: ['war', 'strategy', 'command', ...CSS_TESTS], when: { warshop: CLICKPATH } },
  { path: /^hd2d-mvp\/src\/(app|ui)\.js$/, tests: ['war', 'strategy', 'command'], ctx: true, when: { warshop: CLICKPATH, ...areaWhen(APP_AREAS) } },
  { path: /^hd2d-mvp\/src\/assets\.js$/, tests: ['war', 'strategy'], when: { warshop: /equip/i } },
  { path: /^hd2d-mvp\/assets\/ai\/icon\/equip\//, tests: ['warshop'] },
  { path: /^hd2d-mvp\/tools\/static_check\.mjs$/, tests: ['staticcheck'] },
  { path: /^hd2d-mvp\/tools\/affected_tests\.mjs$/, tests: ['affectedtests', 'strategymodules'] },
  { path: /^hd2d-mvp\/desktop\/(main|preload|uiscale)\.js$/, tests: ['uiscale', 'desktopwindow'] },
  { path: /^hd2d-mvp\/desktop\/build-app\.mjs$/, tests: ['staticcheck', 'opensource-export'] },
  { path: /^hd2d-mvp\/desktop\//, tests: [] },
  { path: /^hd2d-mvp\/(docs|assets|tools)\/|^\.|\.md$/, tests: [] },
  { path: /^hd2d-mvp\/src\//, tests: ALL }, // a module no rule names yet
];

// The tests a changed file selects, as Map(test → reasons). changedLines(ctx) gives the +/- lines of the file's diff, plus (ctx)
// the function each hunk sits in; it is read only when the file's rule has `when` entries.
export function selectTests(f, changedLines = () => '') {
  const why = new Map(), add = (t, r) => { if (ALL.includes(t)) why.set(t, [...(why.get(t) ?? []), r.replace(/^hd2d-mvp\//, '').replace(/\/[^/]+\.webp$/, '/*.webp')]); };
  const rule = RULES.find((r) => r.path.test(f));
  if (!rule) return why; // outside hd2d-mvp
  if (rule.self) { add(f.match(rule.path)[1], f); return why; }
  for (const t of rule.tests) add(t, f);
  if (rule.when) {
    const lines = changedLines(!!rule.ctx);
    for (const [t, re] of Object.entries(rule.when)) if (!rule.tests.includes(t) && re.test(lines)) add(t, `${f} (${lines.match(re)[0]})`);
  }
  return why;
}

function main() {
  const args = process.argv.slice(2), base = args.find((a) => !a.startsWith('--')) ?? 'HEAD';
  const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' });
  const range = base.includes('..') ? base.split('..') : [base], untracked = range.length > 1 ? '' : git('ls-files', '--others', '--exclude-standard');
  const files = [...new Set([...git('diff', '--name-only', ...range).split('\n'), ...untracked.split('\n')])].filter(Boolean);
  const why = new Map();
  for (const f of files) {
    const diffLines = (ctx) => {
      try {
        const diff = git('diff', '-U0', ...range, '--', f).split('\n');
        return diff.map((l) => (/^[+-][^+-]/.test(l) ? l : ctx ? l.match(/^@@[^@]*@@ (.+)$/)?.[1] : null)).filter(Boolean).join('\n');
      } catch { return ''; }
    };
    for (const [t, r] of selectTests(f, diffLines)) why.set(t, [...(why.get(t) ?? []), ...r]);
  }
  const tests = ALL.filter((t) => why.has(t));
  if (args.includes('--cmd')) console.log(tests.length ? `node --test --test-concurrency=1 ${tests.map((t) => `hd2d-mvp/tests/${t}.test.mjs`).join(' ')}` : '');
  else if (!tests.length) console.log('no tests affected');
  else {
    for (const t of tests) console.log(`${t}.test.mjs  ← ${[...new Set(why.get(t))].join(', ')}`);
    if (existsSync(new URL('desktop_window_check.cjs', import.meta.url)) && files.some((f) => f.startsWith('hd2d-mvp/desktop/')))
      console.log('desktop/ changed: also run node hd2d-mvp/tools/desktop_window_check.cjs (not run here)');
  }
}
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main();
