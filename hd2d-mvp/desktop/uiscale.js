// 系统 → 界面大小 (desktop only): the whole page drawn larger on a large screen, by the browser's own page zoom
// (webContents.setZoomFactor). The page's px are fixed, so on a 1920x1080 or 2560x1440 screen at Windows' 100% the
// panels and menus came out small, in a corner of the map (2026-11-21). Page zoom is what Windows' own 缩放 does to the
// game: the layout sees a smaller window (its width rules, tests/desktopwindow.test.mjs down to 1024x600, hold as they
// are) and devicePixelRatio rises with it, so the 3D and the type stay as sharp as the screen (src/quality.js keeps
// the pixel budget). A browser has no such switch: there the player's own Ctrl + does the same.
//   zoomFor(w, h, sw, sh, size): w×h the window's content and sw×sh its screen, both at zoom 1 (DIP: Windows' 缩放 already
//   counted); size a key of SIZES.
// How large type must be drawn is the screen's, not the window's: a 32" 2560x1440 screen at 100% is as coarse as a 24"
// 1920x1080 one (about 92 ppi), and its 14px type is as small in the game's 1600x900 window as full screen. So the screen asks
// for the zoom (each size is the screen height the page is laid out for: 标准 lays a 1920x1080 screen out as 1536x864), and
// the window only holds it back where the page would not fit: never laid out below 1280x720, the window most laptops at
// Windows' 150% already give it. A window smaller than that is not zoomed at all.
// 小 is no zoom at all, the size of 0.4.1 and before: at 960 rows a 27" 2560x1440 screen still came out at 150%, and a player
// there found even 小 too large (2026-11-21). null: never zoomed. 中 is those 960 rows again (150% on that screen): another 27"
// player found 0.4.3's 175% too large and 0.4.2's 150% easy on the eyes (一光年的距离@devblog #643, 2026-11-24).
// A window may hold two sizes to one zoom (2560x1440 in a window, 1377 rows: 标准 and 大 both 175%). They are not pushed apart:
// a 标准 a step below 大 would take a maximized 1920x1080 window from 125% to 100%. The row shows each zoom instead, and its
// toast says when the window holds one back (screenZoom: what the screen alone asks for).
const SIZES = { small: null, medium: 960, normal: 810, large: 720 };
const FIT = [1280, 720];
const STEP = 0.25; // whole and quarter steps only: at 1.33 the 1px rules and the thin strokes of the serif type fall unevenly
const steps = (k) => Math.max(1, Math.floor(k / STEP + 1e-9) * STEP);
const baseOf = (size) => (Object.hasOwn(SIZES, size) ? SIZES[size] : SIZES.normal);

// The zoom the screen asks for, in a window as large as the screen.
function screenZoom(sw, sh, size = 'normal') {
  const base = baseOf(size);
  if (base === null || !(sw > 0 && sh > 0)) return 1;
  return steps(Math.min(sh / base, sw / (base * 16 / 9))); // a screen wider than 16:9 goes by its height, a narrower one by its width
}

function zoomFor(w, h, sw = w, sh = h, size = 'normal') {
  if (!(w > 0 && h > 0)) return 1;
  return Math.min(screenZoom(sw, sh, size), steps(Math.min(w / FIT[0], h / FIT[1])));
}

module.exports = { zoomFor, screenZoom, SIZES };
