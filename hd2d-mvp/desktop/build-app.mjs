// Snapshot the playable game into desktop/app/ for the Electron shell, fully offline.
//   node hd2d-mvp/desktop/build-app.mjs
//   node hd2d-mvp/desktop/build-app.mjs --generated-music     # no local audio: chiptune BGM stand-ins, committed SFX
//   node hd2d-mvp/desktop/build-app.mjs --no-original-music   # leave the original-game BGM out (SFX stay original)
// Copies index.html, save-editor.html (系统 → 记录编辑 on the title), src/, data/, mods/ (the shipped data packs) and the runtime assets (git-tracked plus untracked-but-not-ignored files,
// so generator sources never ship), adds for every BGM slot each git-ignored local version the manifest
// lists (the Suno remix in assets/audio/remix/ and the original track in assets/audio/original/), so the
// package offers the same 曲目 choice (Remix / 原版) as local play, and the original-game SFX for
// every SFX slot (the snapshot's manifest lists them first), re-encodes the 单挑 strips as lossless WebP, then
// vendors three.js (with only the addons the game imports) and the two web fonts into vendor/, where index.html
// already loads them from (tools/serve.py serves the same layout in development). Needs cwebp (brew install webp).
// The game sources are only read, never changed.
//
// --mobile (the Android APK, apk/package.json; with --out ../apk/app): the same content, cut to what a phone or tablet
// screen shows (apk/README.md「体积」). Nothing is left out, only the precision a handheld screen never shows:
// - the free-pose portraits (officer card, at most ~580 device px wide on a phone) at 640 px wide; the expression busts
//   (dialog and roster, at most 120 CSS px × the screen ratio) at 288 px; both lossy again at q78;
// - the waist-up figures keep their 768 px (the ending's frame shows them that wide on a tablet), lossy at q75;
// - the painted war maps (the 低 preset's flat war map, a phone's and a tablet's default) keep their size, lossy at q72;
// - the remix BGM / cue phrases at 128 kbps MP3, the original-game ones at 96 kbps (FC chiptune); SFX as they are.
//   Same MP3 encoder family: Chrome decodes them sample for sample at the same length, so loops.json still holds;
// - three.js minified, the fonts cut to the characters the shipped text uses (pyftsubset: `pip install fonttools brotli`,
//   or set PYFTSUBSET to its path; a character typed in that is not in the game falls back to the system font).
// Needs ffmpeg as well. Encodings are cached by content in desktop/.mobile-cache.
import { execFile, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);

const here = dirname(fileURLToPath(import.meta.url));
const game = join(here, '..');
const argOf = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const out = argOf('--out') ? resolve(argOf('--out')) : join(here, 'app');
const MOBILE = process.argv.includes('--mobile');
const mods = join(here, 'node_modules');

// Generator inputs and editor-only material that the game never loads, and the dropped generated score (新编, assets/audio/bgm-*).
const SKIP = [/(^|\/)source(\/|$)/, /^assets\/ai\/title-source/, /^assets\/audio\/(original|remix)\//, /^assets\/audio\/generated\.json$/, /^assets\/audio\/bgm-[^/]+\.mp3$/, /(^|\/)\.DS_Store$/];
const KEEP = [/^index\.html$/, /^save-editor\.html$/, /^src\//, /^data\//, /^mods\//, /^assets\//]; // mods/: the data packs shipped with the game (core/pack.js)
// An extension region of the 战略地图 ships only once it is open to packs (listed in its regions/index.json): until then no pack can
// declare it, and its pictures would only weigh the package (docs/战略地图数据包_交接_2026-11-17.md).
const REGIONS = 'assets/ai/sandtable/regions', regionIndex = join(game, REGIONS, 'index.json');
// The boards of the open regions (one of a region's name, or a region's `boards`: src/core/pack.js regionBoards).
const openRegions = new Set(existsSync(regionIndex) ? Object.entries(JSON.parse(readFileSync(regionIndex, 'utf8'))).flatMap(([n, e]) => (e.boards ? Object.keys(e.boards) : [n])) : []);
SKIP.push({ test: (f) => f.startsWith(`${REGIONS}/`) && f !== `${REGIONS}/index.json` && !openRegions.has(f.slice(REGIONS.length + 1).split('/')[0]) });

rmSync(out, { recursive: true, force: true });
const listed = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: game, encoding: 'utf8' }).split('\0');
let files = 0, bytes = 0;
for (const f of listed) {
  if (!f || !KEEP.some((r) => r.test(f)) || SKIP.some((r) => r.test(f))) continue;
  const src = join(game, f);
  if (!existsSync(src)) continue; // tracked but deleted in the working tree
  mkdirSync(dirname(join(out, f)), { recursive: true });
  cpSync(src, join(out, f));
  files++; bytes += statSync(src).size;
}
// The open-source repository keeps its art out of git (a Release asset pack, unzipped over the clone, so git ignores
// it): ASSETS.sha256 at the repository root lists those files. Copy them too, and stop with the fix when one is missing.
const sumsFile = join(game, '..', 'ASSETS.sha256');
if (existsSync(sumsFile)) {
  const missing = [];
  for (const line of readFileSync(sumsFile, 'utf8').split('\n')) {
    const f = line.slice(66).replace(/^hd2d-mvp\//, '');
    if (!f || !KEEP.some((r) => r.test(f)) || SKIP.some((r) => r.test(f)) || existsSync(join(out, f))) continue;
    const src = join(game, f);
    if (!existsSync(src)) { missing.push(f); continue; }
    mkdirSync(dirname(join(out, f)), { recursive: true });
    cpSync(src, join(out, f));
    files++; bytes += statSync(src).size;
  }
  if (missing.length) {
    console.error(`${missing.length} files of ASSETS.sha256 are missing (first: ${missing[0]}): unzip the asset pack from the Releases page in the repository root (see README.md)`);
    process.exit(1);
  }
}

// BGM and the command / 计略 phrases (cue-*): per manifest slot, every remix and original candidate that exists locally, so the 曲目 switch finds
// the same sets as in development; the manifest order (remix first) still decides the default. Both folders
// are git-ignored, so git ls-files never lists them; copy them explicitly.
// SFX: the original-game file for every slot, moved to the front of the snapshot's manifest so it beats
// a committed generated one (sfx-clash); slots without an original keep the committed/synth fallbacks.
const manifest = JSON.parse(readFileSync(join(game, 'assets/manifest.json'), 'utf8'));
const local = process.argv.includes('--no-original-music') ? /^assets\/audio\/remix\// : /^assets\/audio\/(remix|original)\//;
const music = {};
if (!process.argv.includes('--generated-music')) for (const [slot, list] of Object.entries(manifest.audio || {})) {
  let picks = [];
  if (slot.startsWith('bgm-') || slot.startsWith('cue-')) picks = [].concat(list).filter((f) => local.test(f) && existsSync(join(game, f)));
  else if (slot.startsWith('sfx-')) {
    const pick = `assets/audio/original/${slot}.mp3`;
    if (!existsSync(join(game, pick))) continue;
    manifest.audio[slot] = [pick, ...[].concat(list).filter((f) => f !== pick)];
    picks = [pick];
  }
  if (!picks.length) continue;
  music[slot] = picks;
  for (const pick of picks) {
    if (existsSync(join(out, pick))) continue;
    mkdirSync(dirname(join(out, pick)), { recursive: true });
    cpSync(join(game, pick), join(out, pick));
    files++; bytes += statSync(join(game, pick)).size;
  }
}
writeFileSync(join(out, 'assets/manifest.json'), JSON.stringify(manifest, null, 1) + '\n');

// 单挑 strips: ~6000 px wide RGBA PNGs, a third of the size as lossless WebP (same pixels, -exact keeps the
// colour under transparent ones); the snapshot's app.js asks for .webp. Encoded copies are cached by content hash.
const WEBP = [{ dir: 'assets/ai/sprites/duel', ref: ['assets/ai/sprites/duel/${k}.png', 'assets/ai/sprites/duel/${k}.webp'], in: 'src/app.js' }];
const cache = join(here, '.webp-cache');
mkdirSync(cache, { recursive: true });
let webpSaved = 0;
for (const { dir, ref: [from, to], in: file } of WEBP) {
  const pngs = readdirSync(join(out, dir)).filter((f) => f.endsWith('.png'));
  await Promise.all(Array.from({ length: 8 }, async (_, lane) => {
    for (let i = lane; i < pngs.length; i += 8) {
      const png = join(out, dir, pngs[i]), webp = png.replace(/\.png$/, '.webp');
      const hit = join(cache, createHash('sha1').update(readFileSync(png)).digest('hex') + '.webp');
      if (!existsSync(hit)) await run('cwebp', ['-quiet', '-lossless', '-exact', '-z', '9', png, '-o', hit + '.tmp']).then(() => renameSync(hit + '.tmp', hit));
      cpSync(hit, webp);
      webpSaved += statSync(png).size - statSync(webp).size;
      rmSync(png);
    }
  })).catch((e) => { throw new Error(`cwebp failed (brew install webp): ${e.message}`); });
  const src = readFileSync(join(out, file), 'utf8');
  if (!src.includes(from)) throw new Error(`${file}: ${from} not found — update WEBP in build-app.mjs`);
  writeFileSync(join(out, file), src.replaceAll(from, to));
}

// --mobile: re-encode in place under the same names (see the header). Each output is cached by its input and
// settings; an encoding that comes out larger than its source keeps the source.
const mobileCache = join(here, '.mobile-cache');
const lanes = (items, fn) => Promise.all(Array.from({ length: 8 }, async (_, lane) => { for (let i = lane; i < items.length; i += 8) await fn(items[i]); }));
const slim = {};
async function recode(rows, ext, encode) {
  mkdirSync(mobileCache, { recursive: true });
  await lanes(rows, async ({ file, label, args }) => {
    const hit = join(mobileCache, createHash('sha1').update(readFileSync(file)).update(args.join(' ')).digest('hex') + ext);
    if (!existsSync(hit)) await encode(file, hit + '.tmp', args).then(() => renameSync(hit + '.tmp', hit));
    const was = statSync(file).size, now = statSync(hit).size;
    if (now < was) cpSync(hit, file);
    const s = (slim[label] ||= { files: 0, was: 0, now: 0 });
    s.files++; s.was += was; s.now += Math.min(now, was);
  });
}
const listIn = (dir, re) => (existsSync(join(out, dir)) ? readdirSync(join(out, dir)).filter((f) => re.test(f)).map((f) => join(out, dir, f)) : []);
if (MOBILE) {
  const SETS = [
    { dir: 'assets/ai/portraits', args: ['-resize', '640', '0', '-q', '78'] },
    { dir: 'assets/ai/faces', args: ['-resize', '288', '0', '-q', '78'] },
    { dir: 'assets/ai/halfbody', args: ['-q', '75'] },
    { dir: 'assets/ai/warground/maps', args: ['-q', '72'] },
  ];
  const rows = SETS.flatMap(({ dir, args }) => listIn(dir, /\.webp$/).map((file) => ({ file, label: dir, args: [...args, '-alpha_q', '100', '-sharp_yuv', '-metadata', 'none'] })));
  await recode(rows, '.webp', (src, dst, args) => run('cwebp', ['-quiet', ...args, src, '-o', dst]))
    .catch((e) => { throw new Error(`cwebp failed (brew install webp): ${e.message}`); });
  // BGM and cue phrases; the SFX (short, some placed to the frame) stay as they are.
  const AUDIO = [{ dir: 'assets/audio/remix', kbps: 128 }, { dir: 'assets/audio/original', kbps: 96 }];
  const tracks = AUDIO.flatMap(({ dir, kbps }) => listIn(dir, /^(bgm|cue)-.*\.mp3$/).map((file) => ({ file, label: dir, args: ['-b:a', `${kbps}k`] })));
  await recode(tracks, '.mp3', (src, dst, args) => run('ffmpeg', ['-v', 'error', '-y', '-i', src, '-map', '0:a', '-c:a', 'libmp3lame', ...args, '-f', 'mp3', dst]))
    .catch((e) => { throw new Error(`ffmpeg failed (brew install ffmpeg): ${e.message}`); });
}

// three.js: the build plus the addons the game imports and what they import in turn (found by following
// the import statements), so a newly used addon is picked up by the next snapshot.
const three = join(mods, 'three');
const threeVersion = JSON.parse(readFileSync(join(three, 'package.json'), 'utf8')).version;
// --mobile: the minified build under the name index.html's import map asks for.
cpSync(join(three, MOBILE ? 'build/three.module.min.js' : 'build/three.module.js'), join(out, 'vendor/three/build/three.module.js'));
const jsm = join(three, 'examples/jsm');
const addons = new Set();
const gameJs = listed.filter((f) => /^src\/.*\.js$/.test(f) && existsSync(join(game, f)));
const queue = gameJs.flatMap((f) => [...readFileSync(join(game, f), 'utf8').matchAll(/['"]three\/addons\/([^'"]+)['"]/g)].map((m) => m[1]));
while (queue.length) {
  const rel = queue.pop();
  if (addons.has(rel)) continue;
  if (!existsSync(join(jsm, rel))) throw new Error(`three/addons/${rel} not found in three ${threeVersion}`);
  addons.add(rel);
  // Only real import / export statements and import(): a comment such as GLTFLoader's "loaded from 'https://…'" is not one.
  const specs = readFileSync(join(jsm, rel), 'utf8').matchAll(/^\s*(?:import|export)\b[^;'"]*?\bfrom\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/gm);
  for (const spec of [...specs].map((m) => m[1] ?? m[2] ?? m[3])) {
    if (spec === 'three') continue;
    if (!spec.startsWith('.')) throw new Error(`three/addons/${rel} imports ${spec} — not vendored`);
    queue.push(relative(jsm, join(jsm, dirname(rel), spec)));
  }
}
for (const rel of addons) cpSync(join(jsm, rel), join(out, 'vendor/three/examples/jsm', rel));

// index.html already loads three.js and the fonts from vendor/; fail loudly if that moved or it reaches out.
const html = readFileSync(join(game, 'index.html'), 'utf8');
for (const ref of ['vendor/fonts/fonts.css', './vendor/three/build/three.module.js', './vendor/three/examples/jsm/'])
  if (!html.includes(ref)) throw new Error(`index.html: ${ref} not found — update build-app.mjs`);
if (/https?:\/\//.test(html.replace(/<!--[\s\S]*?-->/g, ''))) throw new Error('index.html still references the network');
writeFileSync(join(out, 'index.html'), html);

// Fonts: the same families and weights index.html asks Google Fonts for, woff2 only. --mobile: every character of
// the shipped text (code, data, markup, the 鸣谢 list) plus printable ASCII; each fontsource slice is cut to the characters
// of its unicode-range that occur, and a slice with none is left out (as toy/build-toy.mjs on the Toy branch).
const faces = [['noto-serif-sc', [400, 600, 900]], ['ma-shan-zheng', [400]]];
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
const used = new Set();
if (MOBILE) {
  for (const f of walk(out)) if (/\.(html|js|json|css|txt)$/.test(f) && !f.includes('/vendor/')) for (const c of readFileSync(f, 'utf8')) used.add(c.codePointAt(0));
  for (let c = 0x20; c < 0x7f; c++) used.add(c);
}
const parseRange = (s) => s.split(',').map((r) => r.trim().replace(/^U\+/i, '')).map((r) => r.includes('?')
  ? [parseInt(r.replace(/\?/g, '0'), 16), parseInt(r.replace(/\?/g, 'f'), 16)]
  : r.split('-').map((x) => parseInt(x, 16))).map(([a, b = a]) => [a, b]);
const pyftsubset = process.env.PYFTSUBSET || 'pyftsubset';
const fontJobs = [];
let css = '';
mkdirSync(join(out, 'vendor/fonts/files'), { recursive: true });
for (const [pkg, weights] of faces) for (const w of weights) {
  const dir = join(mods, '@fontsource', pkg);
  for (const block of readFileSync(join(dir, `${w}.css`), 'utf8').split(/(?=@font-face)/)) {
    if (!block.startsWith('@font-face')) { css += block; continue; }
    const name = block.match(/url\(\.\/files\/([^)]+\.woff2)\)/)[1];
    if (MOBILE) {
      const range = block.match(/unicode-range:\s*([^;]+);/);
      const chars = range ? [...used].filter((c) => parseRange(range[1]).some(([a, b]) => c >= a && c <= b)) : [...used];
      if (!chars.length) continue;
      fontJobs.push({ file: join(dir, 'files', name), dst: join(out, 'vendor/fonts/files', name), chars });
    } else cpSync(join(dir, 'files', name), join(out, 'vendor/fonts/files', name));
    css += block.replace(/,\s*url\([^)]*\.woff\) format\('woff'\)/g, '').trimEnd() + '\n';
  }
  css += '\n';
}
if (fontJobs.length) {
  mkdirSync(mobileCache, { recursive: true });
  await lanes(fontJobs, async ({ file, dst, chars }) => {
    const unicodes = chars.sort((a, b) => a - b).map((c) => c.toString(16)).join(',');
    const hit = join(mobileCache, createHash('sha1').update(readFileSync(file)).update(unicodes).digest('hex') + '.woff2');
    if (!existsSync(hit)) await run(pyftsubset, [file, `--unicodes=${unicodes}`, '--flavor=woff2', '--layout-features=*', '--no-hinting', `--output-file=${hit}.tmp`]).then(() => renameSync(hit + '.tmp', hit));
    cpSync(hit, dst);
    const s = (slim['vendor/fonts'] ||= { files: 0, was: 0, now: 0 });
    s.files++; s.was += statSync(file).size; s.now += statSync(dst).size;
  }).catch((e) => { throw new Error(`pyftsubset failed (pip install fonttools brotli, or set PYFTSUBSET): ${e.message}`); });
}
writeFileSync(join(out, 'vendor/fonts/fonts.css'), css);

const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: game, encoding: 'utf8' }).trim();
// Dirty means a change in what the package is made of (the KEEP paths above), not notes or captures under docs/.
const dirty = execFileSync('git', ['status', '--porcelain', '--', 'index.html', 'save-editor.html', 'src', 'data', 'mods', 'assets'], { cwd: game, encoding: 'utf8' }).trim() ? '+dirty' : '';
// version: the 说明 shows it (src/app.js gameVersion), from the same package.json the release bumps (天使之翼723@devblog).
const version = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8')).version;
writeFileSync(join(out, 'build.json'), JSON.stringify({ version, commit: commit + dirty, built: new Date().toISOString(), ...(MOBILE ? { profile: 'mobile' } : {}), music }, null, 1));
const mb = (n) => `${(n / 2 ** 20).toFixed(1)} MB`;
for (const [label, s] of Object.entries(slim)) console.log(`  --mobile ${label}: ${s.files} files, ${mb(s.was)} → ${mb(s.now)}`);
if (MOBILE) console.log(`  --mobile total: ${mb(walk(out).reduce((n, f) => n + statSync(f).size, 0))}`);
console.log(`${relative(process.cwd(), out) || out}: ${files} game files, ${(bytes / 2 ** 20).toFixed(1)} MB (${(webpSaved / 2 ** 20).toFixed(1)} MB less as WebP) + vendor (three ${threeVersion} with ${addons.size} addon files, fonts) @ ${commit}${dirty}; local audio: ${Object.entries(music).map(([k, fs]) => `${k}=${fs.map((f) => f.split('/').at(-2)).join('+')}`).join(' ') || 'none'}`);
