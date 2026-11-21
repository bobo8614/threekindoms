// 系统 → 界面大小 (标准 / 大 / 小, the desktop game only), remembered across restarts: the whole page, panels, menus and
// maps, zoomed by the window's size, so a 1920x1080 or 2560x1440 screen at Windows' 100% no longer draws the UI small in
// a corner (2026-11-21). The shell does the zooming (desktop/uiscale.js, main.js); the page only says which size. A browser
// has no window.desktop.setUiSize and no row: there the browser's own zoom (Ctrl +) does the same.
import { readPref, writePref } from './prefs.js';

const KEY = 'hd2d-ui-size';
export const UI_SIZES = [['normal', '标准'], ['large', '大'], ['small', '小']];
const desk = globalThis.window?.desktop;
let cur = UI_SIZES.find(([k]) => k === readPref(KEY)) ?? UI_SIZES[0];
// Told at once, as the page's modules load: the shell zooms before the first paint, so a 大 is not first drawn 标准.
const tell = () => Promise.resolve(desk?.setUiSize?.(cur[0])).catch(() => null);
tell();

export const uiSizeOn = () => typeof desk?.setUiSize === 'function';
export const uiSizeText = () => cur[1];
// The next size; resolves to the zoom now in use (1 when the window is too small to zoom: the toast says so).
export function cycleUiSize() {
  cur = UI_SIZES[(UI_SIZES.indexOf(cur) + 1) % UI_SIZES.length];
  writePref(KEY, cur[0]);
  return tell();
}
