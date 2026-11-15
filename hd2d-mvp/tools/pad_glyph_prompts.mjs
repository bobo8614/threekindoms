// Prompts for the controller button glyphs (tools/gen_pad_glyphs_codex.sh): one sheet per pad family, 5 columns x 3
// rows, the 15 physical controls in CELLS order. tools/slice_pad_glyphs.py cuts them into assets/ai/pad/<family>/.
//   node hd2d-mvp/tools/pad_glyph_prompts.mjs xbox|ps|nintendo [cell]   → prints the prompt (a cell: a 1x1 re-paint)
//   node hd2d-mvp/tools/pad_glyph_prompts.mjs offset|sym|mouse           → the help's controller picture of that layout, or the mouse
export const CELLS = ['south', 'east', 'west', 'north', 'lb', 'rb', 'lt', 'rt', 'view', 'start', 'l3', 'r3', 'dpad', 'lstick', 'rstick'];
const FACE = 'a round face button seen straight on, a dark bronze-black disc with a thin warm-gold rim and a soft top highlight';
const STICK = 'a thumbstick cap seen straight from above: a dark round cap with a concave dish and a thin warm-gold rim';
const FAMILIES = {
  xbox: {
    south: `${FACE}, a bold capital letter "A" in muted jade green`,
    east: `${FACE}, a bold capital letter "B" in muted brick red`,
    west: `${FACE}, a bold capital letter "X" in muted steel blue`,
    north: `${FACE}, a bold capital letter "Y" in muted amber yellow`,
    lb: 'a shoulder bumper: a wide low rounded bar, dark with a warm-gold rim, the bold letters "LB" in ivory',
    rb: 'a shoulder bumper: a wide low rounded bar, dark with a warm-gold rim, the bold letters "RB" in ivory',
    lt: 'a trigger: a tall rounded-top tab, dark with a warm-gold rim, the bold letters "LT" in ivory',
    rt: 'a trigger: a tall rounded-top tab, dark with a warm-gold rim, the bold letters "RT" in ivory',
    view: 'a small round dark button with a warm-gold rim, an ivory icon of two overlapping small rectangles (the "view" button)',
    start: 'a small round dark button with a warm-gold rim, an ivory icon of three short horizontal lines (the "menu" button)',
  },
  ps: {
    south: `${FACE}, a bold cross symbol "✕" in muted sky blue`,
    east: `${FACE}, a bold ring symbol "○" in muted brick red`,
    west: `${FACE}, a bold square outline symbol "□" in muted dusty violet (not pink)`,
    north: `${FACE}, a bold triangle outline symbol "△" in muted teal green`,
    lb: 'a shoulder bumper: a wide low rounded bar, dark with a warm-gold rim, the bold text "L1" in ivory',
    rb: 'a shoulder bumper: a wide low rounded bar, dark with a warm-gold rim, the bold text "R1" in ivory',
    lt: 'a trigger: a tall rounded-top tab, dark with a warm-gold rim, the bold text "L2" in ivory',
    rt: 'a trigger: a tall rounded-top tab, dark with a warm-gold rim, the bold text "R2" in ivory',
    view: 'a small upright dark capsule button with a warm-gold rim, an ivory icon of three short vertical lines over a short bar (the "create" button)',
    start: 'a small upright dark capsule button with a warm-gold rim, an ivory icon of three short horizontal lines (the "options" button)',
  },
  nintendo: {
    south: `${FACE}, a bold capital letter "B" in ivory`,
    east: `${FACE}, a bold capital letter "A" in ivory`,
    west: `${FACE}, a bold capital letter "Y" in ivory`,
    north: `${FACE}, a bold capital letter "X" in ivory`,
    lb: 'a shoulder bumper: a wide low rounded bar, dark with a warm-gold rim, the bold letter "L" in ivory',
    rb: 'a shoulder bumper: a wide low rounded bar, dark with a warm-gold rim, the bold letter "R" in ivory',
    lt: 'a trigger: a tall rounded-top tab, dark with a warm-gold rim, the bold letters "ZL" in ivory',
    rt: 'a trigger: a tall rounded-top tab, dark with a warm-gold rim, the bold letters "ZR" in ivory',
    view: 'a small round dark button with a warm-gold rim, a bold ivory minus sign "−"',
    start: 'a small round dark button with a warm-gold rim, a bold ivory plus sign "+"',
  },
};
const SHARED = {
  l3: `${STICK}, a bold ivory letter "L" in the dish and a small ivory downward chevron below it (pressing the stick in)`,
  r3: `${STICK}, a bold ivory letter "R" in the dish and a small ivory downward chevron below it (pressing the stick in)`,
  dpad: 'a directional pad seen straight on: a plus-shaped cross of four arms, dark bronze-black with a thin warm-gold rim and a small ivory arrow tip on each arm',
  lstick: `${STICK}, a bold ivory letter "L" in the dish and four small ivory arrow tips around the cap (up, down, left, right)`,
  rstick: `${STICK}, a bold ivory letter "R" in the dish and four small ivory arrow tips around the cap (up, down, left, right)`,
};
const STYLE = `Style: crisp game UI button prompt icons for our HD-2D three-kingdoms tactics game (attached screenshot: dark
green lacquer panels with thin warm-gold borders and ivory text). Each icon is a small piece of hardware painted as a
clean bevelled game glyph: dark bronze-black body, a thin warm-gold (#c9a45c) rim, a soft highlight at the top edge, a
subtle inner shadow, and a bold, thick, perfectly legible symbol or label, high contrast so it still reads at 20 pixels.
Flat front view, no perspective tilt, no drop shadow, no glow outside the shape. All icons share the same line weight,
rim, lighting and symbol size; face buttons and stick caps are equal circles.
Backdrop: a perfectly flat pure magenta (#FF00FF) with no gradient, no texture and no shadow on it; the icons must not
use magenta or pink. Do NOT draw the grid, cell borders, numbers, captions, any text other than each icon's own label,
logos, brand marks, watermark or signature. Each icon centred in its cell, about 70% of the cell, clearly separated
from its neighbours by magenta margin.`;
const spec = (family, c) => FAMILIES[family][c] ?? SHARED[c];
// The controller pictures for the help's 手柄 page: a blank pad (no labels: the game lays each family's glyphs on its buttons).
// offset: left stick high, d-pad low (Xbox, Switch Pro); sym: d-pad high, both sticks low (PlayStation).
const PADS = {
  offset: 'the left thumbstick at the upper left and the d-pad below it at the lower left; four face buttons in a diamond at the upper right and the right thumbstick below them at the lower right; two small round buttons side by side in the middle',
  sym: 'the d-pad at the upper left and four face buttons in a diamond at the upper right; both thumbsticks side by side low in the middle, symmetrical; two small upright capsule buttons above the sticks, one either side of a plain smooth touch-panel area',
};
function padPicture(kind) {
  return `ONE illustration of a generic two-handled game controller, seen from the front and a little from above so the two
shoulder bumpers and the two triggers along its top edge are visible, centred, about 86% of the width of a wide 16:10 image.
Layout: ${PADS[kind]}.
Every button, stick cap, bumper and trigger is BLANK: no letters, numbers, symbols or arrows on any of them (the game draws
its own labels on top). No logo, no brand mark, no home button emblem, no light bar, no text anywhere.
Style: the same hand as the attached screenshot of our HD-2D three-kingdoms tactics game and its button icons: a body of dark
bronze-black lacquer with thin warm-gold (#c9a45c) trim along its edges and round every button, soft painterly highlights
from the upper left, subtle inner shadows; the buttons dark with gold rims, clearly separate and easy to locate.
Flat even lighting, no drop shadow, no reflection, no glow. Backdrop: a perfectly flat pure magenta (#FF00FF) with no
gradient, texture or shadow; the controller must not use magenta or pink.`;
}
// The mouse for the help's 键鼠 page: blank, its parts easy to point at.
const MOUSE = `ONE illustration of a plain computer mouse seen from directly above, upright, centred, about 70% of the height of a
square image: a symmetrical rounded body, a left and a right button clearly divided by a seam, a scroll wheel between them.
No logo, no brand mark, no text, no cable. Style: the same hand as the attached screenshot of our HD-2D three-kingdoms tactics
game and its button icons: dark bronze-black lacquer with thin warm-gold (#c9a45c) trim along the outline, the button seam and
round the wheel, soft painterly highlights from the upper left, subtle inner shadows. Flat even lighting, no drop shadow, no
glow. Backdrop: a perfectly flat pure magenta (#FF00FF) with no gradient, texture or shadow; the mouse must not use magenta or pink.`;
export function prompt(family, only) {
  if (family === 'mouse') return MOUSE;
  if (PADS[family]) return padPicture(family);
  if (!FAMILIES[family]) throw new Error(`unknown family ${family}`);
  if (only) {
    return `ONE game UI button icon on a flat pure magenta (#FF00FF) background, centred, about 70% of the square image, uncropped.
Icon: ${spec(family, only)}
${STYLE}`;
  }
  return `A sheet of 15 game UI button icons in a 5 columns x 3 rows grid (wide image, 5:3), one icon per cell in reading
order (left to right, top to bottom). The 15 icons, in order:
${CELLS.map((c, i) => `${i + 1}. ${spec(family, c)}`).join('\n')}
${STYLE}`;
}
if (import.meta.url === `file://${process.argv[1]}`) console.log(prompt(process.argv[2], process.argv[3]));
