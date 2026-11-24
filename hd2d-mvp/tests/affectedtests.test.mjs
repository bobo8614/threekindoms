// tools/affected_tests.mjs: which tests a changed file and its changed lines select. Pure Node, no browser: selectTests is
// fed the lines a `git diff -U0` would give. The browser tests open the whole page and import nothing of src/app.js, so for
// app.js, ui.js and ui.css the keyword map (APP_AREAS) is the only link from a change to its tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { selectTests, APP_AREAS } from '../tools/affected_tests.mjs';

const pick = (file, lines = '') => [...selectTests(file, () => lines).keys()].sort();
const APP = 'hd2d-mvp/src/app.js';

test('the base tests stay for app.js, ui.js and ui.css, whatever the lines say', () => {
  for (const f of [APP, 'hd2d-mvp/src/ui.js', 'hd2d-mvp/src/ui.css']) {
    const t = pick(f, '+// a comment');
    for (const base of ['war', 'strategy', 'command']) assert.ok(t.includes(base), `${f} ${base}`);
  }
});

test('lines of app.js pick the tests of the area they mention', () => {
  const cases = [
    ['+  const row = sysButtons();', 'sysmenu'], ['+    const zone = padZone();', 'gamepad'], ['-const TABS = { 城: [] };', 'dockcommands'],
    ['+commandDock.close?.();', 'command'], ['+async function quickRecord() {', 'quick-save'], ['+  await withSuspendLock(() => 0);', 'suspend-lock'],
    ['+function placeStrategyHud() {', 'hudlayout'], ['+  quitGame();', 'androidback'], ['+  window.desktop?.quit();', 'desktopwindow'],
    ['+G.setPlaceNames(true);', 'placenames'], ['+writePref(PREF.threat, 1);', 'prefs'], ['+  case "disaster": break;', 'disaster'],
    ['+  await playUnification();', 'ending'], ['+const lastWho = 3;', 'repeat'], ['+function cityPanel(cid) {', 'phonecitypanel'],
    ['+const useRecordAction = 1;', 'pad-records'], ['+  freshInput(e);', 'phonetarget'],
  ];
  for (const [line, want] of cases) assert.ok(pick(APP, line).includes(want), `${line} -> ${want}`);
});

test('the function a hunk sits in counts, as git prints it after the hunk header', () => {
  const via = (fn) => [...selectTests(APP, (ctx) => (ctx ? fn : '+  x = 1;')).keys()];
  assert.ok(via('function sysButtons() {').includes('sysmenu'));
  assert.ok(!selectTests(APP, (ctx) => (ctx ? '' : '+  x = 1;')).has('sysmenu'));
  assert.ok(!selectTests('hd2d-mvp/src/core/game.js', (ctx) => (ctx ? 'function sysButtons() {' : '+  x = 1;')).has('sysmenu'));
});

test('ui.js picks message for its message box', () => {
  assert.ok(pick('hd2d-mvp/src/ui.js', '+export function message(title, text) {').includes('message'));
});

test('any change to ui.css picks the CSS tests', () => {
  const t = pick('hd2d-mvp/src/ui.css', '+.panel { margin: 0 }');
  for (const want of ['csscompat', 'hudlayout', 'warcardfit', 'phonetopbar']) assert.ok(t.includes(want), want);
});

test('warshop follows the click-path keywords only', () => {
  assert.ok(!pick(APP, '+const padZone = 1;').includes('warshop'));
  assert.ok(!pick('hd2d-mvp/src/ui.css', '+.panel { margin: 0 }').includes('warshop'));
  assert.ok(pick(APP, '+  await warShop(u);').includes('warshop'));
  assert.ok(pick('hd2d-mvp/src/ui.css', '+.shade { pointer-events: none }').includes('warshop'));
});

test('phone.js and phone.css still run everything', () => {
  const all = readdirSync(new URL('.', import.meta.url)).filter((f) => f.endsWith('.test.mjs')).length;
  for (const f of ['hd2d-mvp/src/phone.js', 'hd2d-mvp/src/phone.css']) assert.equal(pick(f).length, all, f);
});

test('every test the map names exists, and every keyword area still matches app.js or ui.js', () => {
  const dir = new URL('.', import.meta.url), src = new URL('../src/', import.meta.url);
  const text = ['app.js', 'ui.js'].map((f) => readFileSync(new URL(f, src), 'utf8')).join('\n');
  for (const { tests, re } of APP_AREAS) {
    for (const t of tests) assert.ok(readdirSync(dir).includes(`${t}.test.mjs`), `no tests/${t}.test.mjs`);
    assert.ok(re.test(text), `no keyword of ${tests} is left in app.js or ui.js: ${re.source.slice(0, 60)}`);
  }
});

test('a test file with a hyphen in its name selects itself', () => {
  assert.deepEqual(pick('hd2d-mvp/tests/quick-save.test.mjs'), ['quick-save']);
  assert.deepEqual(pick('hd2d-mvp/tests/pad-records.test.mjs'), ['pad-records']);
});

test('the areas added after review: war UI, cut-ins, settle menu, nav, boot and title flow', () => {
  const cases = [
    ['+  actPanel(info, was);', 'actpanel'], ['+  await cutIn(a);', 'skirmish'], ['+  await duelStage(a);', 'sfx'], ['+quickTactical(1)', 'pace'],
    ['+  besideUnit(u, acts);', 'unitacts'], ['+  const ui = warUi(field);', 'warcardfit'], ['+  const ui = warUi(field);', 'warinfo'],
    ['+async function settleMenu() {', 'warreport-ui'], ['+async function settleMenu() {', 'roninruler'], ['+warNav?.update(dt);', 'warnav'],
    ['+await bootSplash({ audio });', 'bootsplash'], ['+  title();', 'titlelayout'], ['+  title();', 'editorentry'],
    ['+new THREE.WebGLRenderer({});', 'webgl-startup'], ['+quality.watch(qualityIdle);', 'load-quality-watch'], ['+  setup();', 'freesave'],
    ['+  setup();', 'nostudy'], ['+g.noStudy = 1;', 'nostudy'], ['+g.freeSave = 1;', 'freesave'], ['+labelSizeText()', 'labelsize'],
    ['+function seasonUi() {', 'seasonui'], ['+  help();', 'helpversion'],
  ];
  for (const [line, want] of cases) assert.ok(pick(APP, line).includes(want), `${line} -> ${want}`);
});

test('desktop/: the shell files and build-app.mjs select their tests, the rest select nothing', () => {
  assert.deepEqual(pick('hd2d-mvp/desktop/main.js'), ['desktopwindow', 'uiscale']);
  assert.deepEqual(pick('hd2d-mvp/desktop/uiscale.js'), ['desktopwindow', 'uiscale']);
  assert.deepEqual(pick('hd2d-mvp/desktop/build-app.mjs'), ['opensource-export', 'staticcheck']);
  assert.deepEqual(pick('hd2d-mvp/desktop/package.json'), []);
});
