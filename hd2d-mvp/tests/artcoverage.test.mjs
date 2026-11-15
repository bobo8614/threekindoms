// Every officer wears painted art in every slot: portrait, half-body and the four expression busts. The
// game no longer falls back to the original pixel portraits (src/ui.js), so a missing file here would show
// 阿会喃's portrait in its place. Plain Node, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MVP = fileURLToPath(new URL('..', import.meta.url));
const A = `${MVP}assets/ai`;
const D = JSON.parse(readFileSync(`${MVP}data/game-data.json`, 'utf8'));

test('every officer has portrait, halfbody and four moods', () => {
  const missing = [];
  for (const o of D.officers) {
    for (const f of [`portraits/${o.id}.webp`, `halfbody/${o.id}.webp`, ...['calm', 'angry', 'joy', 'grief'].map((m) => `faces/${o.id}-${m}.webp`)])
      if (!existsSync(`${A}/${f}`)) missing.push(f);
  }
  assert.deepEqual(missing, []);
});

test('the ui never loads the original portraits', () => {
  for (const f of ['src/ui.js', 'src/app.js']) {
    const src = readFileSync(`${MVP}${f}`, 'utf8');
    assert.equal(/officers\[[^\]]+\]\.portrait|reference-assets/.test(src), false, f);
  }
});
