// 系统 → 界面大小's zoom (desktop/uiscale.js): the screen asks for it (laid out for 810 rows at 标准, 720 大, 960 中; 小 never zooms, the size of 0.4.1 and before), the window
// holds it back so the page is never laid out below 1280x720; whole and quarter steps, never below 1. The row itself, and what the
// page tells the shell, are in tests/desktopwindow.test.mjs; the shell's own zooming (desktop/main.js) is not run here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { zoomFor, screenZoom } = createRequire(import.meta.url)('../desktop/uiscale.js');

test('标准 on the common Windows screens, full screen, maximized and in the game\'s own 1600x900 window', () => {
  for (const [w, h, sw, sh, k] of [
    [1280, 720, 1280, 720, 1], [1280, 672, 1280, 720, 1], [1366, 768, 1366, 768, 1], [1536, 864, 1536, 864, 1], // laptops, 125% / 150%: as before
    [1920, 1080, 1920, 1080, 1.25], [1920, 1017, 1920, 1080, 1.25], [1600, 900, 1920, 1080, 1.25], // 24" 1080p at 100%
    // 27" and 32" 2560x1440 at 100% (a 32" is as coarse as a 24" 1080p): large type in a window too
    [2560, 1440, 2560, 1440, 1.75], [2560, 1377, 2560, 1440, 1.75], [1600, 900, 2560, 1440, 1.25], [2000, 1125, 2560, 1440, 1.5],
    [3840, 2160, 3840, 2160, 2.5], [2560, 1080, 2560, 1080, 1.25], [3440, 1440, 3440, 1440, 1.75], // 4K, 21:9 by its height
    [1024, 600, 2560, 1440, 1], [1279, 900, 2560, 1440, 1], [0, 0, 1920, 1080, 1],
  ]) assert.equal(zoomFor(w, h, sw, sh), k, `${w}x${h} on ${sw}x${sh}`);
});

test('大 and 小 move the step, and no zoomed page is laid out below 1280x720', () => {
  assert.equal(zoomFor(1920, 1080, 1920, 1080, 'large'), 1.5);
  assert.equal(zoomFor(2560, 1440, 2560, 1440, 'large'), 2);
  // 小 is 0.4.1's size, unzoomed on every screen: at 150% a 27" 2560x1440 player found it still too large (2026-11-21)
  for (const [sw, sh] of [[1920, 1080], [2560, 1440], [3440, 1440], [3840, 2160]]) assert.equal(zoomFor(sw, sh, sw, sh, 'small'), 1, `小 on ${sw}x${sh}`);
  assert.equal(zoomFor(1920, 1080, 1920, 1080, 'nonsense'), 1.25, 'an unknown size is 标准');
  // 中 is 0.4.2's 150% on a 27" 2560x1440, full screen and in a window too (一光年的距离@devblog #643, 2026-11-24)
  for (const [w, h, sw, sh, k] of [[2560, 1440, 2560, 1440, 1.5], [2560, 1377, 2560, 1440, 1.5], [1920, 1080, 1920, 1080, 1], [3840, 2160, 3840, 2160, 2.25], [1600, 900, 2560, 1440, 1.25]])
    assert.equal(zoomFor(w, h, sw, sh, 'medium'), k, `中 ${w}x${h} on ${sw}x${sh}`);
  // A window that holds 大 back to 标准's zoom: both 175%, and the screen alone would give 大 200% (the row's toast says so)
  assert.equal(zoomFor(2560, 1377, 2560, 1440, 'large'), 1.75);
  assert.equal(screenZoom(2560, 1440, 'large'), 2);
  // Not pushed apart: a 标准 below 大 would take a maximized 1920x1080 window from 125% to 100%
  assert.equal(zoomFor(1920, 1017, 1920, 1080, 'normal'), 1.25);
  for (const [sw, sh] of [[1920, 1080], [2560, 1440], [3840, 2160]]) {
    const ks = ['small', 'medium', 'normal', 'large'].map((s) => zoomFor(sw, sh, sw, sh, s));
    assert.deepEqual([...ks].sort((a, b) => a - b), ks, `never smaller a size up, ${sw}x${sh}: ${ks}`);
  }
  for (const [sw, sh] of [[1920, 1080], [2560, 1440], [3840, 2160]]) for (const w of [1024, 1300, 1600, 1920, 2560, 3840]) for (const h of [600, 800, 1080, 1440, 2160]) {
    if (w > sw || h > sh) continue;
    for (const s of ['small', 'medium', 'normal', 'large']) {
      const k = zoomFor(w, h, sw, sh, s);
      assert.ok(k === 1 || (w / k >= 1280 && h / k >= 720), `${w}x${h} on ${sw}x${sh} ${s}: ${k}`);
      assert.equal(k * 4, Math.round(k * 4), 'quarter steps');
    }
  }
});
