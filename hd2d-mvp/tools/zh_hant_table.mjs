// Builds src/zhtable.js, the 简体 → 繁體（台湾标准）table behind 系统 → 文字 (src/lang.js, src/zh.js).
//   node hd2d-mvp/tools/zh_hant_table.mjs            regenerate after adding text (static_check says when a character is missing)
//   node hd2d-mvp/tools/zh_hant_table.mjs --names    also print every proper noun with its conversion, for review
// Source: OpenCC's dictionaries (s2twp: STPhrases + STCharacters, then TWPhrases, then TWVariants), pinned to OPENCC_TAG and
// cached in ~/.cache/hd2d-opencc (downloaded once; only the dictionary text is read, no OpenCC code runs). Only the phrases and
// characters the shipped text uses go into the table, so it stays small and the phone build's font cut grows by those
// characters alone. tools/zh_hant_overrides.json wins over OpenCC: the proper nouns (于禁 stays 于, 钟会 is 鍾會) and the few
// words OpenCC turns into Taiwan vocabulary that does not fit a 三国 game.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeConverter } from '../src/zh.js';

const HERE = fileURLToPath(new URL('.', import.meta.url));
export const MVP = resolve(HERE, '..');
const OPENCC_TAG = 'ver.1.2.0';
const DICTS = ['STCharacters', 'STPhrases', 'TWPhrases', 'TWVariants', 'TSCharacters'];
const CACHE = join(homedir(), '.cache', 'hd2d-opencc', OPENCC_TAG);
export const TABLE = join(MVP, 'src', 'zhtable.js');
const OVERRIDES = join(HERE, 'zh_hant_overrides.json');
// Every 简体 character 繁體 writes differently, so static_check can tell a new character that needs the table rebuilt from
// one that stays the same, without the dictionaries.
export const ST_KEYS = join(HERE, 'zh_hant_st_keys.txt');

const CJK = /[㐀-鿿豈-﫿]+/g;
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
// The text the game shows: src (code comments left out), the two pages, the game data and the shipped data packs. The 鸣谢
// list (data/thanks.txt) is players' own names and is never converted.
export function shippedText() {
  const files = [
    ...walk(join(MVP, 'src')).filter((f) => /\.(js|css)$/.test(f) && !f.endsWith(`${sep}zhtable.js`)),
    join(MVP, 'index.html'), join(MVP, 'save-editor.html'),
    join(MVP, 'data', 'game-data.json'), join(MVP, 'data', 'base-map.json'),
    ...walk(join(MVP, 'mods')).filter((f) => f.endsWith('.json')),
  ];
  return files.map((f) => {
    const t = readFileSync(f, 'utf8');
    return f.endsWith('.js') ? strip(t) : f.endsWith('.html') || f.endsWith('.css') ? t.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '') : t;
  }).join('\n');
}
export const runs = (text) => [...new Set(text.match(CJK) ?? [])];

async function dict(name) {
  const file = join(CACHE, `${name}.txt`);
  if (!existsSync(file)) {
    mkdirSync(CACHE, { recursive: true });
    const url = `https://raw.githubusercontent.com/BYVoid/OpenCC/${OPENCC_TAG}/data/dictionary/${name}.txt`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    writeFileSync(file, await r.text());
  }
  const m = new Map();
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const [k, v] = line.split('\t'); if (!v) continue;
    if (!m.has(k)) m.set(k, v.trim().split(' ')[0]);
  }
  return m;
}

// The phrases' second stage (TWPhrases, then TWVariants character by character), on 繁體 text.
const twStage = (t, twp, twv, twMax) => {
  let out = '';
  for (let i = 0; i < t.length;) {
    let hit = 0;
    for (let n = Math.min(twMax, t.length - i); n > 1; n--) if (twp.has(t.substr(i, n))) { hit = n; break; }
    if (hit) { out += twp.get(t.substr(i, hit)); i += hit; } else { out += twv.get(t[i]) ?? t[i]; i++; }
  }
  return out;
};

async function build({ names }) {
  const [stc, stp, twp, twv, tsc] = await Promise.all(DICTS.map(dict));
  const twMax = Math.max(...[...twp.keys()].map((k) => k.length));
  const over = JSON.parse(readFileSync(OVERRIDES, 'utf8'));
  const charOf = (c) => over.chars?.[c] ?? twStage(stc.get(c) ?? c, twp, twv, 1);
  // Full phrase dictionary in 简体 keys: STPhrases, then TWPhrases (繁體 keys taken back to 简体 through TSCharacters, so a
  // 简体 run can meet them), then the overrides.
  const all = new Map();
  for (const [k, v] of stp) all.set(k, twStage(v, twp, twv, twMax));
  for (const [k, v] of twp) { const s = [...k].map((c) => tsc.get(c) ?? c).join(''); if (!all.has(s)) all.set(s, v); }
  for (const [k, v] of Object.entries(over.phrases ?? {})) if (!k.startsWith('_')) all.set(k, v);

  const text = shippedText(), rs = runs(text);
  const used = new Set(), chars = new Set();
  let max = 1; for (const k of all.keys()) max = Math.max(max, k.length);
  // Forward maximum matching over each run, recording the phrases it lands on: the table then segments the same way.
  for (const r of rs) for (let i = 0; i < r.length;) {
    let hit = 0;
    for (let n = Math.min(max, r.length - i); n > 1; n--) if (all.has(r.substr(i, n))) { hit = n; break; }
    if (hit) { used.add(r.substr(i, hit)); i += hit; } else { chars.add(r[i]); i++; }
  }
  for (const r of rs) for (const c of r) chars.add(c);
  const phrases = {};
  // Every phrase the runs land on is kept, also one that converts as its characters do: it holds its place against a shorter
  // or overlapping phrase, so the game segments a run exactly as here.
  for (const k of [...used].sort()) phrases[k] = all.get(k);
  const charMap = {};
  for (const c of [...chars].sort()) { const v = charOf(c); if (v !== c) charMap[c] = v; }
  const table = { chars: charMap, phrases };
  const head = `// Generated by tools/zh_hant_table.mjs (OpenCC ${OPENCC_TAG} s2twp + tools/zh_hant_overrides.json): 简体 → 繁體（台湾标准）\n`
    + '// for the characters and phrases the shipped text uses. Do not edit by hand: change the overrides and run the tool again.\n';
  writeFileSync(TABLE, `${head}export default ${JSON.stringify(table, null, 0).replace(/","/g, '",\n"')};\n`);
  const changing = [...stc.keys()].filter((k) => k.length === 1 && charOf(k) !== k).sort().join('');
  writeFileSync(ST_KEYS, `# The 简体 characters 繁體 writes differently (OpenCC ${OPENCC_TAG} + overrides), for tools/static_check.mjs. Generated by tools/zh_hant_table.mjs.\n${changing}\n`);
  console.log(`src/zhtable.js: ${Object.keys(charMap).length} characters, ${Object.keys(phrases).length} phrases (${rs.length} runs)`);

  if (names) {
    const zh = makeConverter(table);
    const D = JSON.parse(readFileSync(join(MVP, 'data', 'game-data.json'), 'utf8'));
    const list = [...D.officers.map((o) => ['武将', o.name, o.jp]), ...D.cities.map((c) => ['城', c.name]), ...D.equipment.map((e) => ['装备', e.name])];
    for (const [k, s, jp] of list) { const t = zh(s); if (t !== s) console.log(`${k}\t${s}\t${t}${jp ? `\t原版 ${jp}` : ''}`); }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await build({ names: process.argv.includes('--names') });
