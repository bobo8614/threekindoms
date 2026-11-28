// Every officer wears painted art in every slot: portrait and the four expression busts (the large slots use the calm one). The
// game no longer falls back to the original pixel portraits (src/ui.js), so a missing file here would show
// 阿会喃's portrait in its place. Plain Node, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { prompt } from '../tools/portrait_prompts.mjs';
import { halfbodyPrompt } from '../tools/halfbody_prompts.mjs';

const MVP = fileURLToPath(new URL('..', import.meta.url));
const A = `${MVP}assets/ai`;
const D = JSON.parse(readFileSync(`${MVP}data/game-data.json`, 'utf8'));

test('every officer has portrait and four moods', () => {
  const missing = [];
  for (const o of D.officers) {
    for (const f of [`portraits/${o.id}.webp`, ...['calm', 'angry', 'joy', 'grief'].map((m) => `faces/${o.id}-${m}.webp`)])
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

test('portrait and halfbody prompts guard hand chirality, head-torso alignment and wide-stance polearm perspective', () => {
  for (const o of D.officers) {
    const fp = prompt(o);
    const hp = halfbodyPrompt(o);
    assert.equal(/over (his |the )?shoulder|turned slightly back/i.test(fp), false, `portrait #${o.id} look-back prompt`);
    assert.equal(/over (his |the )?shoulder|turned slightly back/i.test(hp), false, `halfbody #${o.id} look-back prompt`);
    assert.match(fp, /left\/right chirality/);
    assert.match(fp, /never twist head and torso into opposite left\/right directions/);
    assert.match(hp, /NEVER bend the far-side arm across the torso/);
  }
});
