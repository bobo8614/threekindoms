// No color-mix() in a background (好心的王er狗@bilibili, 2026-11-17): an Android WebView older than Chrome 111 does not know
// it, and with a var() inside, the whole declaration falls to transparent instead of the rule before it. The phone's command
// list showed the map and the city tags straight through. Borders and glows may keep color-mix(): there, losing it costs a
// line, not a panel. Worked-out colours live next to their base colour in ui.css (--lacquer-95, --tq-me-dk, …).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const dir = new URL('../src/', import.meta.url);
test('no color-mix() in a background in src/*.css', () => {
  const bad = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.css'))) {
    const css = readFileSync(new URL(f, dir), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(/background(?:-color|-image)?\s*:([^;}]*)/g)) if (/color-mix\(/.test(m[1])) bad.push(`${f}: ${m[0].trim()}`);
  }
  assert.deepEqual(bad, []);
});
