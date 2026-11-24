// Online updates for the desktop build (docs/在线增量更新方案与开发交接_2026-11-23.md): a signed manifest names a full code
// layer and per-version asset packs; they are downloaded into userData/updates/ and laid over the package's own app/ by the
// request handler (main.js serve), never by changing the program. Nothing here needs Electron: main.js passes net.fetch and
// the folders, the tests (tests/updater.test.mjs) a local server and temporary folders. The release tools
// (tools/update/*.mjs) use the same manifest, tar and snapshot code, so what they write is what this reads.
//
// What is trusted: only the two public keys main.js embeds. The manifest is verified before anything in it is used, every
// package against the SHA-256 the manifest gives, and every path in a package, a manifest or state.json is checked before it
// becomes a file name. Whatever goes wrong here, the caller falls back to the package as shipped (main.js catches).
'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const SCHEMA = 1;
const ALG = 'ECDSA-P256-SHA256';
const VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;
const CHANNELS = ['desktop', 'mobile'];
const PACK_ID = /^(desktop|mobile)-(\d{1,4}\.\d{1,4}\.\d{1,4})$/;
const KEY_ID = /^k[1-9]$/;
// The code layer: the package's own code, data and pages. A version's layer has all of them, so where it is active these paths
// come from it alone (a file the new version dropped is gone, not served from the package below).
const CODE_PATH = /^(src\/|data\/|mods\/|index\.html$|save-editor\.html$|build\.json$|assets\/manifest\.json$)/;
// The original game's music and the Suno remix: in the package only, never in an update (desktop/README.md: not for public
// distribution), so they are neither in a snapshot nor ever in a pack.
const PRIVATE_AUDIO = /^assets\/audio\/(original|remix)\//;
const LIMITS = { manifestBytes: 256 * 1024, packBytes: 600 * 2 ** 20, unpackedBytes: 800 * 2 ** 20, files: 20000, fileBytes: 200 * 2 ** 20 };

// ---------- versions and paths ----------
const isVersion = (v) => typeof v === 'string' && VERSION.test(v);
function cmpVersion(a, b) {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}
const maxVersion = (...vs) => vs.filter(isVersion).reduce((m, v) => (!m || cmpVersion(v, m) > 0 ? v : m), null);
// A relative file path that means the same on Windows, macOS and Linux and stays inside the folder it is joined to.
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i;
function safeRel(p) {
  if (typeof p !== 'string' || !p || p.length > 400 || /[\\\0:*?"<>|]/.test(p) || p.startsWith('/')) return false;
  return p.split('/').every((s) => s && s !== '.' && s !== '..' && !/[. ]$/.test(s) && !RESERVED.test(s) && !/[\x00-\x1f]/.test(s));
}
const isHex = (s, n) => typeof s === 'string' && s.length === n && /^[0-9a-f]+$/.test(s);
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
// https only; a test may allow its own server on this machine.
const okUrl = (u, allowHttp) => { try { const x = new URL(u); return x.protocol === 'https:' || (allowHttp && x.protocol === 'http:' && x.hostname === '127.0.0.1'); } catch { return false; } };

// ---------- the manifest ----------
// { alg, keyId, payload: "<JSON text>", sig: base64 DER } — the payload is signed as the text it is, so no key order or
// spacing can break a signature.
function signManifest(payload, privateKeyPem, keyId) {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const sig = crypto.sign('sha256', Buffer.from(text, 'utf8'), { key: privateKeyPem, dsaEncoding: 'der' }).toString('base64');
  return JSON.stringify({ alg: ALG, keyId, payload: text, sig }, null, 1) + '\n';
}
// The payload, or a thrown Error saying why not. keys: { k1: pem, k2: pem }.
function verifyManifest(text, keys, { channel, allowHttp = false } = {}) {
  if (typeof text !== 'string' || text.length > LIMITS.manifestBytes) throw new Error('manifest too large');
  let outer;
  try { outer = JSON.parse(text); } catch { throw new Error('manifest is not JSON'); }
  if (outer?.alg !== ALG || !KEY_ID.test(outer.keyId ?? '') || typeof outer.payload !== 'string' || typeof outer.sig !== 'string') throw new Error('manifest envelope');
  const key = keys?.[outer.keyId];
  if (!key) throw new Error(`unknown key ${outer.keyId}`);
  let good = false;
  try { good = crypto.verify('sha256', Buffer.from(outer.payload, 'utf8'), { key, dsaEncoding: 'der' }, Buffer.from(outer.sig, 'base64')); } catch { good = false; }
  if (!good) throw new Error('bad signature');
  const p = JSON.parse(outer.payload);
  // Both channels are signed with the same keys: a valid mobile manifest must not be taken on the desktop.
  if (p.schema !== SCHEMA) throw new Error(`schema ${p.schema}`);
  if (!CHANNELS.includes(p.channel) || p.channel !== channel) throw new Error(`channel ${p.channel}`);
  if (!isVersion(p.version) || !isVersion(p.minBaseVersion)) throw new Error('version');
  if (!Number.isInteger(p.minShellApi) || p.minShellApi < 1) throw new Error('minShellApi');
  if (!okUrl(p.downloadPageUrl, false)) throw new Error('downloadPageUrl');
  if (!Array.isArray(p.mirrors) || !p.mirrors.length || !p.mirrors.every((m) => okUrl(m, allowHttp) && m.endsWith('/'))) throw new Error('mirrors');
  if (!Array.isArray(p.notes) || !p.notes.every((n) => typeof n === 'string')) throw new Error('notes');
  const file = (f) => f && safeRel(f.path) && f.path.split('/').length === 2 && isHex(f.sha256, 64) && Number.isInteger(f.size) && f.size > 0 && f.size <= LIMITS.packBytes;
  if (!file(p.code)) throw new Error('code');
  if (!Array.isArray(p.assetPacks)) throw new Error('assetPacks');
  let last = null;
  for (const a of p.assetPacks) {
    const m = PACK_ID.exec(a?.id ?? '');
    if (!m || m[1] !== channel || a.introducedIn !== m[2]) throw new Error(`pack id ${a?.id}`);
    if (last && cmpVersion(a.introducedIn, last) <= 0) throw new Error('packs out of order');
    if (cmpVersion(a.introducedIn, p.version) > 0) throw new Error('pack newer than the version');
    if (a.path !== undefined && !file(a)) throw new Error(`pack ${a.id}`);
    if (a.deletes !== undefined && !(Array.isArray(a.deletes) && a.deletes.every((d) => safeRel(d) && !CODE_PATH.test(d)))) throw new Error(`pack ${a.id} deletes`);
    last = a.introducedIn;
  }
  return p;
}

// ---------- tar (ustar, plain files only) ----------
// The writer's output depends on nothing but the files: sorted by path, mtime / uid / gid 0, mode 0644, no PAX headers, a
// long path split into prefix and name. macOS's own tar adds PAX headers and ._ files, so the tools use this.
const BLOCK = 512;
function octal(buf, off, len, n) { buf.write(n.toString(8).padStart(len - 1, '0') + '\0', off, len, 'ascii'); }
function splitName(p) {
  const b = Buffer.from(p, 'utf8');
  if (b.length <= 100) return ['', p];
  for (let i = p.length - 1; i > 0; i--) {
    if (p[i] !== '/') continue;
    const pre = p.slice(0, i), name = p.slice(i + 1);
    if (Buffer.byteLength(pre) <= 155 && Buffer.byteLength(name) <= 100 && name) return [pre, name];
  }
  throw new Error(`path too long for ustar: ${p}`);
}
function writeTar(entries) {
  const parts = [], seen = new Set();
  for (const { path: p, data } of [...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    if (!safeRel(p)) throw new Error(`unsafe path ${p}`);
    if (seen.has(p.toLowerCase())) throw new Error(`duplicate path ${p}`);
    seen.add(p.toLowerCase());
    const [prefix, name] = splitName(p), h = Buffer.alloc(BLOCK);
    h.write(name, 0, 100, 'utf8'); octal(h, 100, 8, 0o644); octal(h, 108, 8, 0); octal(h, 116, 8, 0);
    octal(h, 124, 12, data.length); octal(h, 136, 12, 0); h.fill(' ', 148, 156); h.write('0', 156, 1, 'ascii');
    h.write('ustar\0', 257, 6, 'ascii'); h.write('00', 263, 2, 'ascii'); h.write(prefix, 345, 155, 'utf8');
    let sum = 0; for (const c of h) sum += c;
    h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
    parts.push(h, data, Buffer.alloc((BLOCK - (data.length % BLOCK)) % BLOCK));
  }
  parts.push(Buffer.alloc(BLOCK * 2));
  return Buffer.concat(parts);
}
const cstr = (buf, off, len) => { const end = buf.indexOf(0, off); return buf.toString('utf8', off, end < 0 || end > off + len ? off + len : end); };
// Files only ([{ path, data }]); directories are allowed and skipped; anything else (links, devices, PAX) is refused.
function readTar(buf, { maxFiles = LIMITS.files, maxBytes = LIMITS.unpackedBytes } = {}) {
  const out = [], seen = new Set();
  let off = 0, total = 0;
  while (off + BLOCK <= buf.length) {
    const h = buf.subarray(off, off + BLOCK);
    if (h.every((c) => c === 0)) return out;
    let sum = 0; for (let i = 0; i < BLOCK; i++) sum += i >= 148 && i < 156 ? 32 : h[i];
    if (parseInt(cstr(h, 148, 8).trim(), 8) !== sum) throw new Error('tar checksum');
    if (cstr(h, 257, 6) !== 'ustar') throw new Error('not ustar');
    const type = String.fromCharCode(h[156] || 48), prefix = cstr(h, 345, 155), name = cstr(h, 0, 100);
    const full = prefix ? `${prefix}/${name}` : name, size = parseInt(cstr(h, 124, 12).trim() || '0', 8);
    if (!Number.isSafeInteger(size) || size < 0 || size > LIMITS.fileBytes) throw new Error(`tar size ${full}`);
    off += BLOCK;
    if (type === '5') { if (!safeRel(full.replace(/\/$/, ''))) throw new Error(`unsafe path ${full}`); off += Math.ceil(size / BLOCK) * BLOCK; continue; }
    if (type !== '0') throw new Error(`tar entry type ${type} (${full}) refused`);
    if (!safeRel(full)) throw new Error(`unsafe path ${full}`);
    if (seen.has(full.toLowerCase())) throw new Error(`duplicate path ${full}`); // one file on a case-insensitive disk
    seen.add(full.toLowerCase());
    if (out.length >= maxFiles || (total += size) > maxBytes) throw new Error('package unpacks too large');
    if (off + size > buf.length) throw new Error('tar truncated');
    out.push({ path: full, data: buf.subarray(off, off + size) });
    off += Math.ceil(size / BLOCK) * BLOCK;
  }
  throw new Error('tar truncated');
}
// gzip with a fixed header (Node writes mtime 0), so the same files give the same bytes.
const packTarGz = (entries) => zlib.gzipSync(writeTar(entries), { level: 9 });
const unpackTarGz = (buf, limits) => readTar(zlib.gunzipSync(buf, { maxOutputLength: LIMITS.unpackedBytes + BLOCK * 4 }), limits);

// ---------- snapshots ----------
function walk(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, base, out);
    else if (e.isFile()) out.push(path.relative(base, f).split(path.sep).join('/'));
  }
  return out;
}
// Every file of a build-app.mjs output (path → sha256 and size), the private audio left out. Recorded when a package or an
// update is made: the next update is the difference from this, never from a rebuild (encoders are not byte-stable).
function snapshotOf(dir, { channel, version, commit }) {
  const files = {};
  for (const rel of walk(dir).sort()) {
    if (PRIVATE_AUDIO.test(rel) || /(^|\/)\.DS_Store$/.test(rel)) continue;
    const data = fs.readFileSync(path.join(dir, rel));
    files[rel] = { sha256: sha256(data), size: data.length };
  }
  return { schema: SCHEMA, channel, version, commit, files };
}

// ---------- state ----------
// updates/state.json: { baseVersion, baseCommit, active, previous, pending, deletes, badVersions, rolledBack }
// active / previous / pending: { version, packs: [ids], confirmed?, bootFailures? }. Their folders are derived from the
// version and ids (code/<version>, packs/<id>), never read from the file.
const emptyState = (base) => ({ baseVersion: base.version, baseCommit: base.commit, active: null, previous: null, pending: null, deletes: {}, badVersions: [], rolledBack: null });
function cleanLayer(l, channel, base) {
  if (l == null) return null;
  if (!isVersion(l.version) || cmpVersion(l.version, base.version) <= 0 || !Array.isArray(l.packs)) throw new Error('layer');
  for (const id of l.packs) { const m = PACK_ID.exec(id); if (!m || m[1] !== channel) throw new Error('layer pack'); }
  return { version: l.version, packs: [...l.packs], confirmed: !!l.confirmed, bootFailures: Number.isInteger(l.bootFailures) ? l.bootFailures : 0 };
}
// A state for this package, or a fresh one when the file is for another package (several unzipped versions share one
// profile on Windows) or does not read: { state, wiped }.
function loadState(dir, base, channel) {
  let raw = null;
  try { raw = JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8')); } catch { return { state: emptyState(base), wiped: fs.existsSync(path.join(dir, 'state.json')) }; }
  if (raw?.baseVersion !== base.version || raw?.baseCommit !== base.commit) return { state: emptyState(base), wiped: true };
  try {
    const s = emptyState(base);
    s.active = cleanLayer(raw.active, channel, base); s.previous = cleanLayer(raw.previous, channel, base); s.pending = cleanLayer(raw.pending, channel, base);
    for (const [id, list] of Object.entries(raw.deletes ?? {})) if (PACK_ID.test(id) && Array.isArray(list) && list.every(safeRel)) s.deletes[id] = [...list];
    s.badVersions = (raw.badVersions ?? []).filter(isVersion);
    s.rolledBack = isVersion(raw.rolledBack) ? raw.rolledBack : null;
    return { state: s, wiped: false };
  } catch { return { state: emptyState(base), wiped: true }; }
}
function saveJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 1));
  fs.renameSync(tmp, file);
}
const saveState = (dir, s) => saveJson(path.join(dir, 'state.json'), s);
const layerDirs = (l) => (l ? [`code/${l.version}`, ...l.packs.map((id) => `packs/${id}`)] : []);
// Folders that no layer in state uses, and staging: best effort (a file still open on Windows stays until the next time).
function cleanup(dir, s, log = () => {}) {
  const keep = new Set([s.active, s.previous, s.pending].flatMap(layerDirs));
  for (const sub of ['code', 'packs']) {
    let names = [];
    try { names = fs.readdirSync(path.join(dir, sub)); } catch { continue; }
    for (const n of names) if (!keep.has(`${sub}/${n}`)) try { fs.rmSync(path.join(dir, sub, n), { recursive: true, force: true }); } catch (err) { log(`update cleanup ${sub}/${n}: ${err.code || err}`); }
  }
  try { fs.rmSync(path.join(dir, 'staging'), { recursive: true, force: true }); } catch (err) { log(`update cleanup staging: ${err.code || err}`); }
}

// ---------- the overlay ----------
// What a path resolves to under the active layer: { file } from a layer, { base: true } from the package, { gone: true } where
// a layer deleted it or the code layer has no such file. Built when the game starts and whenever the layer changes.
function buildIndex(dir, s) {
  const a = s.active;
  if (!a) return { version: null, lookup: () => ({ base: true }) };
  const files = new Map(), gone = new Set();
  for (const id of a.packs) {
    for (const d of s.deletes[id] ?? []) { files.delete(d); gone.add(d); }
    const root = path.join(dir, 'packs', id);
    if (!fs.existsSync(root)) continue; // a version with only deletes has no folder
    for (const rel of walk(root)) { files.set(rel, path.join(root, rel)); gone.delete(rel); }
  }
  const code = new Map(), croot = path.join(dir, 'code', a.version);
  for (const rel of walk(croot)) code.set(rel, path.join(croot, rel));
  if (!code.has('index.html') || !code.has('build.json')) throw new Error(`code layer ${a.version} incomplete`);
  return {
    version: a.version, files: files.size, codeFiles: code.size,
    lookup(rel) {
      if (CODE_PATH.test(rel)) return code.has(rel) ? { file: code.get(rel) } : { gone: true };
      if (files.has(rel)) return { file: files.get(rel) };
      return gone.has(rel) ? { gone: true } : { base: true };
    },
  };
}

// ---------- starting up: confirmation and rollback (§5.4) ----------
// Each takes the state and changes it in place; the caller writes it. A version counts as good only once the title is reached.
function promotePending(s) {
  if (!s.pending) return false;
  if (s.active?.version !== s.pending.version) s.previous = s.active ? { ...s.active, confirmed: true, bootFailures: 0 } : s.previous;
  s.active = { ...s.pending, confirmed: false, bootFailures: 0 };
  s.pending = null;
  s.badVersions = s.badVersions.filter((v) => v !== s.active.version); // installed again on the player's word
  return true;
}
function rollback(s) {
  s.rolledBack = s.active.version;
  s.active = s.previous ? { ...s.previous, confirmed: true, bootFailures: 0 } : null;
  s.previous = null;
}
// Before a page load: counts the try for a version not yet confirmed. Two tries already counted and never confirmed (a crash,
// a GPU process gone, a window closed while stuck) roll it back now.
function beforeBoot(s) {
  if (!s.active || s.active.confirmed) return { rolledBack: false };
  if (s.active.bootFailures >= 2) { rollback(s); return { rolledBack: true }; }
  s.active.bootFailures++;
  return { rolledBack: false };
}
// The title is up: the version is good; a version rolled back from is bad only now, once its predecessor has started.
function onTitle(s) {
  let changed = false;
  if (s.active && !s.active.confirmed) { s.active.confirmed = true; s.active.bootFailures = 0; changed = true; }
  if (s.rolledBack) { if (!s.badVersions.includes(s.rolledBack)) s.badVersions.push(s.rolledBack); s.rolledBack = null; changed = true; }
  return changed;
}
// Failing before the title. 'hard' (the main frame did not load, a module missing, startup-error) rolls back at once; 'soft'
// (the page process gone, the time limit) is often the machine (a GPU driver), so only a second failed start rolls back.
function onBootFail(s, kind) {
  if (!s.active || s.active.confirmed) return { rolledBack: false };
  if (kind === 'hard' || s.active.bootFailures >= 2) { rollback(s); return { rolledBack: true }; }
  return { rolledBack: false };
}
// 回退到原始版本: back to the package; the version is marked bad (a manual check may still install it again).
function revertToBase(s) {
  const v = s.active?.version;
  if (v && !s.badVersions.includes(v)) s.badVersions.push(v);
  s.active = null; s.previous = null; s.pending = null; s.rolledBack = null;
  return v ?? null;
}

// ---------- what to download (§4.3) ----------
// { kind: 'latest' | 'skip' | 'shell-required' | 'ready' | 'update', … }
function planUpdate(p, { base, state: s, shellApi, manual, havePacks = new Set(), haveCode = new Set() }) {
  const current = maxVersion(base.version, s.active?.version);
  if (cmpVersion(p.version, current) <= 0) return { kind: 'latest', version: current };
  const bad = s.badVersions.includes(p.version);
  if (bad && !manual) return { kind: 'skip', version: p.version };
  const info = { version: p.version, notes: p.notes, releasedAt: p.releasedAt ?? null, downloadPageUrl: p.downloadPageUrl, bad };
  if (p.minShellApi > shellApi || cmpVersion(base.version, p.minBaseVersion) < 0) return { kind: 'shell-required', ...info };
  if (s.pending?.version === p.version) return { kind: 'ready', ...info };
  const packs = p.assetPacks.filter((a) => cmpVersion(a.introducedIn, base.version) > 0);
  const downloads = [];
  if (!haveCode.has(p.version)) downloads.push({ kind: 'code', id: p.version, path: p.code.path, sha256: p.code.sha256, size: p.code.size });
  for (const a of packs) if (a.path && !havePacks.has(a.id)) downloads.push({ kind: 'pack', id: a.id, path: a.path, sha256: a.sha256, size: a.size });
  return { kind: 'update', ...info, downloads, bytes: downloads.reduce((n, d) => n + d.size, 0), packs: packs.map((a) => a.id), deletes: Object.fromEntries(packs.map((a) => [a.id, a.deletes ?? []])) };
}

// ---------- the updater ----------
// opts: { dir, base: { version, commit }, channel, shellApi, keys, manifestUrl, fetch, allowHttp, log, emit }
function createUpdater(opts) {
  const { dir, base, channel, shellApi, keys, manifestUrl, fetch, allowHttp = false, log = () => {}, emit = () => {} } = opts;
  if (!isVersion(base.version)) throw new Error(`package version ${base.version}`);
  const loaded = loadState(dir, base, channel);
  let s = loaded.state;
  if (loaded.wiped) { log('updates: state is for another package or unreadable; cleared'); wipeLayers(); }
  let plan = null, payload = null, job = null, status = { phase: 'idle' };
  const save = () => saveState(dir, s);
  const tell = (st) => { status = st; emit(st); };
  function wipeLayers() {
    for (const sub of ['code', 'packs', 'staging']) try { fs.rmSync(path.join(dir, sub), { recursive: true, force: true }); } catch (err) { log(`updates: clearing ${sub}: ${err.code || err}`); }
    try { saveState(dir, s); } catch (err) { log(`updates: state not written: ${err.code || err}`); }
  }
  const settingsFile = path.join(dir, 'settings.json'); // kept through a wipe: the player's own switch
  const settings = () => { try { const o = JSON.parse(fs.readFileSync(settingsFile, 'utf8')); return { autoCheck: o.autoCheck === true }; } catch { return { autoCheck: false }; } };
  const listDir = (sub) => { try { return new Set(fs.readdirSync(path.join(dir, sub))); } catch { return new Set(); } };

  async function fetchManifest(signal) {
    if (!okUrl(manifestUrl, allowHttp)) throw new Error('manifest url');
    const res = await fetch(manifestUrl, { signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`manifest HTTP ${res.status}`);
    if (!okUrl(res.url || manifestUrl, allowHttp)) throw new Error('manifest redirected off https');
    const text = await res.text();
    return verifyManifest(text, keys, { channel, allowHttp });
  }
  // One package from the first mirror that gives the right bytes: each try starts from the mirror's own address (CNB's 302 goes
  // to a temporary one that is never kept), a 404 after the 302 or a wrong hash moves on to the next.
  async function fetchFile(d, signal, progress) {
    const errors = [];
    for (const m of payload.mirrors) {
      const url = m + d.path;
      try {
        const res = await fetch(url, { signal, cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        if (!okUrl(res.url || url, allowHttp)) throw new Error('redirected off https');
        const hash = crypto.createHash('sha256'), chunks = [];
        let got = 0;
        const reader = res.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          got += value.length;
          if (got > d.size) { reader.cancel().catch(() => {}); throw new Error('larger than the manifest says'); }
          hash.update(value); chunks.push(Buffer.from(value)); progress(value.length);
        }
        if (got !== d.size) throw new Error(`size ${got} of ${d.size}`);
        if (hash.digest('hex') !== d.sha256) throw new Error('sha256 mismatch');
        return Buffer.concat(chunks, got);
      } catch (err) {
        if (signal.aborted) throw err;
        progress(-1); // the bar goes back for this file
        errors.push(`${url}: ${err.message || err}`);
        log(`updates: ${d.path} from ${m}: ${err.message || err}`);
      }
    }
    throw new Error(`no mirror gave ${d.path} (${errors.join('; ')})`);
  }
  // Unpacked into staging, checked, then moved into place whole: a layer folder exists only complete.
  function install(d, buf) {
    const entries = unpackTarGz(buf);
    const wrong = entries.find((e) => (d.kind === 'code' ? !CODE_PATH.test(e.path) : CODE_PATH.test(e.path) || PRIVATE_AUDIO.test(e.path)));
    if (wrong) throw new Error(`${d.path}: ${wrong.path} does not belong in a ${d.kind} package`);
    if (d.kind === 'code' && !['index.html', 'build.json'].every((f) => entries.some((e) => e.path === f))) throw new Error(`${d.path}: incomplete code package`);
    const name = d.id, sub = d.kind === 'code' ? 'code' : 'packs';
    const stage = path.join(dir, 'staging', `${sub}-${name}`), final = path.join(dir, sub, name);
    fs.rmSync(stage, { recursive: true, force: true });
    for (const e of entries) { const f = path.join(stage, ...e.path.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, e.data); }
    fs.mkdirSync(path.join(dir, sub), { recursive: true });
    if (fs.existsSync(final)) fs.rmSync(final, { recursive: true, force: true });
    fs.renameSync(stage, final);
  }

  return {
    get state() { return s; },
    status: () => status,
    settings,
    setAutoCheck(on) { saveJson(settingsFile, { ...settings(), autoCheck: !!on }); return settings(); },
    index: () => buildIndex(dir, s),
    // What the 更新 dialog shows besides the check: the version in use, whether there is one to go back from.
    info: () => ({ base: base.version, active: s.active?.version ?? null, pending: s.pending?.version ?? null, canRevert: !!s.active, badVersions: [...s.badVersions], autoCheck: settings().autoCheck }),
    async check({ manual = false } = {}) {
      if (job) return status;
      tell({ phase: 'checking', manual });
      const ac = new AbortController(), timer = setTimeout(() => ac.abort(), 20000);
      try {
        payload = await fetchManifest(ac.signal);
        plan = planUpdate(payload, { base, state: s, shellApi, manual, havePacks: listDir('packs'), haveCode: listDir('code') });
        const st = { phase: plan.kind, manual, ...plan };
        delete st.downloads; delete st.deletes;
        tell(st);
      } catch (err) {
        plan = null;
        log(`updates: check failed: ${err.message || err}`);
        tell({ phase: 'error', manual, error: ac.signal.aborted ? '连接超时' : '无法取得更新信息', detail: String(err.message || err) });
      } finally { clearTimeout(timer); }
      return status;
    },
    async download() {
      if (job || plan?.kind !== 'update') return status;
      const ac = new AbortController(), total = plan.bytes, mine = plan;
      let done = 0, fileDone = 0;
      job = ac;
      tell({ phase: 'downloading', version: mine.version, bytes: total, done: 0 });
      try {
        for (const d of mine.downloads) {
          fileDone = 0;
          const buf = await fetchFile(d, ac.signal, (n) => {
            if (n < 0) { done -= fileDone; fileDone = 0; } else { done += n; fileDone += n; }
            tell({ phase: 'downloading', version: mine.version, bytes: total, done });
          });
          if (ac.signal.aborted) throw new Error('cancelled');
          install(d, buf);
        }
        s.pending = { version: mine.version, packs: mine.packs, confirmed: false, bootFailures: 0 };
        for (const [id, list] of Object.entries(mine.deletes)) s.deletes[id] = list;
        save();
        tell({ phase: 'ready', version: mine.version, notes: mine.notes, bad: mine.bad });
      } catch (err) {
        try { fs.rmSync(path.join(dir, 'staging'), { recursive: true, force: true }); } catch {}
        if (ac.signal.aborted) { log('updates: download cancelled'); tell({ phase: 'update', ...mine, downloads: undefined, deletes: undefined, cancelled: true }); }
        else { log(`updates: download failed: ${err.message || err}`); tell({ phase: 'error', error: '下载失败', detail: String(err.message || err), retry: 'download' }); }
      } finally { job = null; }
      return status;
    },
    cancel() { job?.abort(); },
    // The downloaded version becomes the active one (not yet confirmed); the caller rebuilds the index and reloads the page.
    apply() {
      if (!s.pending) return false;
      promotePending(s); save(); cleanup(dir, s, log);
      tell({ phase: 'idle' });
      return true;
    },
    revert() { const v = revertToBase(s); save(); cleanup(dir, s, log); tell({ phase: 'idle' }); return v; },
    // Start-up: the pending version (downloaded, 稍后) takes effect, and the try is counted.
    boot() {
      const promoted = promotePending(s), r = beforeBoot(s);
      if (promoted || s.active || r.rolledBack) save();
      if (r.rolledBack) log(`updates: ${s.rolledBack} failed to start twice; back to ${s.active?.version ?? 'the package'}`);
      return { promoted, rolledBack: r.rolledBack };
    },
    title() { if (onTitle(s)) { save(); cleanup(dir, s, log); return true; } return false; },
    // The window closed by the player before the title, nothing having failed: that start is not held against the version.
    uncount() { if (s.active && !s.active.confirmed && s.active.bootFailures > 0) { s.active.bootFailures--; save(); } },
    bootFailed(kind) { const r = onBootFail(s, kind); if (r.rolledBack) { save(); log(`updates: ${s.rolledBack} failed to start (${kind}); back to ${s.active?.version ?? 'the package'}`); } return r.rolledBack; },
  };
}

module.exports = {
  SCHEMA, ALG, CODE_PATH, PRIVATE_AUDIO, LIMITS,
  isVersion, cmpVersion, safeRel, sha256, signManifest, verifyManifest,
  writeTar, readTar, packTarGz, unpackTarGz, snapshotOf, walk,
  loadState, saveState, emptyState, cleanup, buildIndex,
  promotePending, beforeBoot, onTitle, onBootFail, revertToBase, planUpdate, createUpdater,
};
