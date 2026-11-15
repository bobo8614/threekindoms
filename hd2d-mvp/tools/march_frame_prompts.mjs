// Prompt source for the war-map march sheets: one generic general per side (attacker / defender) seen from
// three directions — side profile, three-quarter front, three-quarter back — each standing and in a three-frame
// walk, on a 4×3 grid. slice_march_frames.py cuts it into the strip src/warview.js plays; the three-quarter
// views face right and the game mirrors them for leftward headings, so the sheet covers six facings.
//   node hd2d-mvp/tools/march_frame_prompts.mjs <attacker|defender>   → prints the prompt
import { fileURLToPath } from 'node:url';

export const ROWS = ['side', 'front', 'back'];
export const COLS = ['stand', 'walk_1', 'walk_2', 'walk_3'];

export function marchPrompt(side) {
  return `Game sprite sheet for an HD-2D remake of the 1992 Famicom strategy game "Sangokushi II: Haou no Tairiku".
Reference image 1 is the approved battle sprite of this ${side === 'attacker' ? 'attacking' : 'defending'} army's general (side view, facing right). Draw THE SAME mounted general — same armour, colours, helmet, cloak, banner and horse — from three directions.

Layout (critical): a 4 columns × 3 rows grid of equal cells on a landscape 1536x1024 canvas, one figure per cell, centred in its cell, nothing crossing into a neighbouring cell. Every figure at the SAME scale (the horse the same size in every cell) with its hooves on the same baseline near the bottom of its cell.
Row 1 — SIDE: full side profile facing RIGHT, exactly like the reference.
Row 2 — FRONT: three-quarter front view, horse and rider walking TOWARD the viewer and turned about 30 degrees to the viewer's right; we see the horse's chest, face and front legs and the rider's face and chest, seen from slightly above.
Row 3 — BACK: three-quarter back view, walking AWAY from the viewer and turned about 30 degrees to the viewer's right; we see the horse's rump, tail and hind legs and the rider's back, cloak and banner, seen from slightly above.
Columns, the same in every row:
1. STAND: horse standing square, rider upright, weapon held upright.
2. WALK 1: horse's near foreleg lifted and reaching forward, far hind leg pushing off.
3. WALK 2: legs passing under the body, the horse's body at its highest, rider rising slightly.
4. WALK 3: far foreleg reaching forward, near hind leg pushing off (the opposite of WALK 1).
Keep the weapon, banner and cloak consistent between frames; only the legs, the horse's head nod and the rider's slight bob change while walking.

Style: detailed 16-bit SNES / Octopath Traveler pixel art matching reference image 1 exactly — crisp pixel clusters, dark outlines, 3-tone shading, same palette. No anti-aliased painterly blur.
Background: one perfectly flat solid magenta (#FF00FF) everywhere around the figures — no ground, no shadow, no grid lines, no labels, no text. Do not use magenta or pink anywhere on the figures.`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const side = process.argv[2];
  if (side !== 'attacker' && side !== 'defender') { console.error('usage: march_frame_prompts.mjs <attacker|defender>'); process.exit(1); }
  process.stdout.write(marchPrompt(side));
}
