// Prompt source for 白兵 troop action sheets, sliced by slice_troop_frames.py into the strips
// src/tacticalview.js plays. One 4×4 sheet per side × kind (soldier / archer / cavalry) and look: look 1 is
// the approved battle sprite itself, look 2 (--v2) the same army with a different helmet, shield and face,
// so a squad of six is not six copies of one man.
// --turn gives the front / back sheet (TURN_FRAMES) for moves and blows along a column.
// Spearmen and archers were redrawn for player feedback N09 (2026-10-28: 步 and 弓 looked alike at play size):
// the spearman carries a 戟 towering over his head and a large shield, the archer a big bow held out clear of
// his body with arrows over the shoulder (SHAPE), overriding the reference sprite where they differ.
//   node hd2d-mvp/tools/troop_frame_prompts.mjs <attacker|defender>-<soldier|archer|cavalry> [--v2] [--turn]
import { fileURLToPath } from 'node:url';

export const FRAMES = {
  soldier: ['idle_a', 'idle_b', 'walk_1', 'walk_2', 'walk_3', 'walk_4', 'run', 'windup', 'strike', 'follow', 'guard', 'hurt', 'stagger', 'fall', 'dead', 'cheer'],
  archer: ['idle_a', 'idle_b', 'walk_1', 'walk_2', 'walk_3', 'walk_4', 'run', 'draw', 'aim', 'loose', 'windup', 'strike', 'hurt', 'fall', 'dead', 'cheer'],
  cavalry: ['idle_a', 'idle_b', 'walk_1', 'walk_2', 'walk_3', 'walk_4', 'gallop_1', 'gallop_2', 'gallop_3', 'gallop_4', 'windup', 'strike', 'hurt', 'fall', 'dead', 'cheer'],
};

const ARMY = {
  attacker: 'green-and-silver army (teal-green tunic and trousers under lamellar armour, silver helmet with a teal plume)',
  defender: 'crimson-and-gold army (red tunic under bronze lamellar armour, bronze helmet with a red plume)',
};
const V2 = {
  attacker: {
    soldier: 'a different man of the same unit: a plain iron cap with cheek flaps and NO plume instead of the plumed helmet, a short beard, a tall rectangular wooden shield painted teal instead of the round shield, the same halberd',
    archer: 'a different man of the same unit: a dark cloth headscarf instead of the helmet, a quilted teal coat with no lamellar, a leather bracer, the same bow and quiver',
    cavalry: 'a different rider of the same unit on a GREY dappled horse: an iron cap with a teal neck-guard and NO plume, a teal saddle cloth, the same lance',
  },
  defender: {
    soldier: 'a different man of the same unit: a round bronze cap with a leather neck-guard and NO plume, a thick moustache, a tall oval wicker shield edged in red instead of the round shield, the same halberd',
    archer: 'a different man of the same unit: a red cloth headband instead of the helmet, a padded red coat without lamellar, the same bow and quiver',
    cavalry: 'a different rider of the same unit on a BLACK horse: a bronze cap with a red neck-guard and NO plume, a red saddle cloth, the same lance',
  },
};

const SHAPE = {
  soldier: 'READABILITY REDESIGN (overrides the reference where they differ): he carries a TALL 戟 halberd — a straight pole about one and a half times his own height with a crescent side-blade below the spear point, so in standing and marching poses the weapon towers well above his head — and a LARGE shield covering him from shoulder to knee, carried in front of his body. Broad, heavy, armoured stance. At 32 pixels tall the tall pole and the big shield must be the first thing seen.',
  archer: 'READABILITY REDESIGN (overrides the reference where they differ): no polearm and no shield. A LARGE recurve bow nearly his own height, held OUT in front of his body and upright so its whole curve stands clear of his silhouette even at rest, and a quiver crammed with arrows whose fletchings stick up above his shoulder. Lighter armour, a slimmer figure than a spearman. At 32 pixels tall he must read as "a big bow curve and arrows over the shoulder", never as a man holding a pole.',
  cavalry: '',
};

const CELLS = {
  soldier: [
    'IDLE A: standing at ease, feet apart, halberd held upright beside him, shield on the forearm',
    'IDLE B: same as IDLE A, chest slightly raised and weight shifted to the other foot (breath)',
    'WALK 1: marching, left leg forward, right leg back, halberd upright on the shoulder, shield forward',
    'WALK 2: marching, legs passing under the body, both feet nearly together',
    'WALK 3: marching, right leg forward, left leg back',
    'WALK 4: marching, legs passing the other way',
    'RUN: charging forward, body leaning hard forward, long stride with the back foot off the ground, halberd levelled forward at the hip, shield up',
    'WIND-UP: braced in a low stance, halberd drawn far back at the hip, shield forward, torso coiled',
    'STRIKE: a full forward THRUST — both arms driving the halberd straight out level at chest height of an enemy, front knee bent, back leg straight',
    'FOLLOW-THROUGH: halberd pulled back halfway, point still forward, recovering his stance',
    'GUARD: crouched behind the raised shield, halberd held back, bracing for a blow',
    'HURT: jolted backward as if struck in the chest, head thrown back, halberd arm flung out',
    'STAGGER: stumbling one step back, bent forward, shield arm down',
    'FALL: falling backwards, knees buckling, halberd slipping from his hand',
    'DEAD: lying flat on his back on the (invisible) ground, halberd and shield fallen beside him, seen from the side',
    'CHEER: standing tall, halberd thrust straight up overhead, mouth open shouting',
  ],
  archer: [
    'IDLE A: standing ready, the big bow held out upright in front of him at arm\'s length in the left hand, its full curve clear of the body, quiver of arrows over the shoulder',
    'IDLE B: same as IDLE A, chest slightly raised and weight shifted to the other foot (breath)',
    'WALK 1: marching, left leg forward, right leg back, bow held out upright in front',
    'WALK 2: marching, legs passing under the body',
    'WALK 3: marching, right leg forward, left leg back',
    'WALK 4: marching, legs passing the other way',
    'RUN: running forward, body leaning forward, long stride, bow in hand',
    'DRAW: nocking an arrow, bow raised in front, right hand pulling the string halfway back',
    'AIM: full draw, the bow aimed upward at 30 degrees for a high arcing volley, string pulled to the ear',
    'LOOSE: arrow just released, string snapped forward, right hand flung back open',
    'WIND-UP: close fighting — the bow swung back over the shoulder like a club, low stance',
    'STRIKE: swinging the bow forward and down at an enemy\'s chest height, body lunging forward',
    'HURT: jolted backward as if struck in the chest, head thrown back, bow arm flung out',
    'FALL: falling backwards, knees buckling, bow slipping from his hand',
    'DEAD: lying flat on his back on the (invisible) ground, bow fallen beside him, seen from the side',
    'CHEER: standing tall, bow raised straight up overhead, mouth open shouting',
  ],
  cavalry: [
    'IDLE A: horse standing square on all four hooves, rider upright, lance held upright',
    'IDLE B: same as IDLE A but the horse lowers its head and lifts one front hoof slightly (breath)',
    'WALK 1: slow four-beat walk, left fore and right hind legs reaching forward, other two planted; lance upright',
    'WALK 2: walk, all four hooves on the ground, legs passing under the body',
    'WALK 3: walk, right fore and left hind legs reaching forward',
    'WALK 4: walk, all four hooves on the ground, legs passing the other way',
    'GALLOP 1: charging gallop, both front legs reaching forward, hind legs pushing back, lance levelled forward',
    'GALLOP 2: gallop, legs gathered under the body, one front hoof planted, lance levelled',
    'GALLOP 3: gallop, hind legs reaching forward under the belly, front legs pushing back',
    'GALLOP 4: gallop, extended suspension, legs spread apart, lance levelled',
    'WIND-UP: lance drawn far back, rear hand at the hip, torso coiled; horse gathers its hind legs',
    'STRIKE: a full horizontal THRUST — lance driven far out in front of the horse\'s head at chest height of an enemy; horse lunges',
    'HURT: rider jolted backward in the saddle, lance arm flung out; horse rears its front slightly',
    'FALL: rider slipping backwards off the saddle, lance dropping; horse rearing in panic',
    'DEAD: the horse lying on its side on the (invisible) ground, legs out, the rider sprawled across it, lance fallen beside them, seen from the side',
    'CHEER: horse rearing up on its hind legs, rider brandishing the lance overhead and shouting',
  ],
};

// Turn sheet (--turn): the same man walking straight toward the viewer (down the battlefield) and straight
// away from him (up it), so a squad moving or striking along a column is not drawn sideways.
const DIRS = ['front', 'back'];
const TURN_POSES = ['idle', 'walk_1', 'walk_2', 'walk_3', 'walk_4', 'windup', 'strike', 'hurt'];
export const TURN_FRAMES = DIRS.flatMap((d) => TURN_POSES.map((p) => `${d}_${p}`));
const TURN_CELLS = {
  soldier: ['IDLE: standing at ease, feet apart, halberd upright beside him, shield on the forearm',
    'WALK 1: marching, left foot stepping forward, right foot behind, halberd upright on the shoulder',
    'WALK 2: marching, feet passing, both nearly together',
    'WALK 3: marching, right foot stepping forward, left foot behind',
    'WALK 4: marching, feet passing the other way',
    'WIND-UP: braced low, halberd drawn back at the hip, shield raised in front',
    'STRIKE: a full THRUST straight ahead along his facing direction, halberd driven out level, front knee bent',
    'HURT: jolted backward as if struck in the chest, head thrown back, halberd arm flung out'],
  archer: ['IDLE: standing ready, the big bow held out upright at his side, its full curve clear of the body, arrows over the shoulder',
    'WALK 1: marching, left foot stepping forward, bow held out upright at his side',
    'WALK 2: marching, feet passing, both nearly together',
    'WALK 3: marching, right foot stepping forward',
    'WALK 4: marching, feet passing the other way',
    'AIM: full draw, bow raised and aimed upward at 30 degrees straight ahead along his facing direction, string at the ear',
    'LOOSE: arrow just released, string snapped forward, drawing hand flung back open',
    'HURT: jolted backward as if struck in the chest, head thrown back, bow arm flung out'],
  cavalry: ['IDLE: horse standing square on all four hooves, rider upright, lance held upright',
    'GALLOP 1: charging gallop, both front legs reaching forward, lance levelled ahead',
    'GALLOP 2: gallop, legs gathered under the body, one front hoof planted',
    'GALLOP 3: gallop, hind legs reaching forward under the belly',
    'GALLOP 4: gallop, extended suspension, legs spread apart',
    'WIND-UP: lance drawn back, rear hand at the hip, torso coiled; horse gathers its hind legs',
    'STRIKE: a full THRUST — lance driven straight ahead past the horse\'s head; horse lunges',
    'HURT: rider jolted backward in the saddle, lance arm flung out; horse throws its head up'],
};

export function turnPrompt(key, v2 = false) {
  const [side, kind] = key.split('-');
  if (!ARMY[side] || !TURN_CELLS[kind]) throw new Error(`unknown troop key ${key}`);
  const unit = { soldier: 'halberdier (戟兵) with a tall halberd and a large shield', archer: 'archer with a large recurve bow and a full quiver', cavalry: 'light cavalryman on a warhorse carrying a long lance' }[kind];
  const cells = TURN_CELLS[kind];
  return `Animation pose sheet (sprite sheet) for an HD-2D remake of the 1992 Famicom strategy game "Sangokushi II: Haou no Tairiku" — a rank-and-file troop seen in small squads on a battlefield, viewed from a raised camera about 35 degrees above the ground.
Subject: a common Three Kingdoms ${unit} of the ${ARMY[side]} — ${v2 ? V2[side][kind] : 'the exact man of reference image 1'}. Reference image 1 is his approved SIDE-VIEW action sheet; this new sheet shows the SAME man from the FRONT and from the BACK.${SHAPE[kind] ? `\n${SHAPE[kind]}` : ''}

Layout (critical):
- Landscape canvas 1536x1024 divided into an invisible 4-column × 4-row grid of 16 equal cells (384×256 each). Do NOT draw grid lines, borders, numbers or labels.
- Exactly ONE complete figure per cell, centred in its cell, every figure at the SAME scale as reference image 1 and on the SAME ground line (${kind === 'cavalry' ? 'hooves' : 'feet'} at the same height near the bottom of each cell); nothing crosses into a neighbouring cell, nothing is cropped, keep a clear margin around every figure.
- Rows 1–2 (cells 1–8): FRONT VIEW — he faces and moves straight TOWARD the viewer (down the screen); we see his face, chest${kind === 'cavalry' ? " and the horse's head and chest head-on" : ''}. Seen slightly from above.
- Rows 3–4 (cells 9–16): BACK VIEW — he faces and moves straight AWAY from the viewer (up the screen); we see his back${kind === 'cavalry' ? ", the horse's rump and tail" : ' and quiver/back of the helmet'}. Seen slightly from above.
- Not three-quarter, not side view: square-on front and square-on back. Same man, costume, colours and weapon in all 16 cells; only pose and facing change.
- Background: one perfectly flat solid magenta (#FF00FF) everywhere — no ground, no shadow, no scenery, no text. No magenta or pink on the figures.
- Detailed 16-bit SNES/Octopath-style pixel art matching reference image 1 exactly: same pixel scale, crisp pixel clusters, dark outlines, 3-tone shading, light from the upper left. Bold, simple shapes that read at 32 pixels tall.

Cells in reading order (left to right, top row first):
${[...cells.map((c) => `FRONT ${c}`), ...cells.map((c) => `BACK ${c}`)].map((r, i) => `${i + 1}. ${r}`).join('\n')}

The walk${kind === 'cavalry' ? '/gallop' : ''} cycle must clearly alternate the legs between cells so it animates; the weapon must stay recognisably the same as in the side view.`;
}

export function troopPrompt(key, v2 = false) {
  const [side, kind] = key.split('-');
  if (!ARMY[side] || !CELLS[kind]) throw new Error(`unknown troop key ${key}`);
  const unit = { soldier: 'halberdier (戟兵) with a tall halberd and a large shield', archer: 'archer with a large recurve bow and a full quiver', cavalry: 'light cavalryman on a warhorse carrying a long lance' }[kind];
  const subject = `a common Three Kingdoms ${unit} of the ${ARMY[side]} — ${v2 ? V2[side][kind] : SHAPE[kind] ? 'the man of reference image 1 (same face, armour and army colours), re-armed as described below' : 'exactly as in reference image 1'}`;
  return `Animation pose sheet (sprite sheet) for an HD-2D remake of the 1992 Famicom strategy game "Sangokushi II: Haou no Tairiku" — a rank-and-file troop seen in small squads on a battlefield.
Subject: ${subject}.${SHAPE[kind] ? `\n${SHAPE[kind]}` : ''}

Layout (critical):
- Landscape canvas 1536x1024 divided into an invisible 4-column × 4-row grid of 16 equal cells (384×256 each). Do NOT draw grid lines, borders, numbers or labels.
- Exactly ONE complete figure per cell, centred in its cell, every figure at the SAME scale and the SAME ground line (${kind === 'cavalry' ? 'hooves' : 'feet'} at the same height near the bottom of each cell); nothing crosses into a neighbouring cell, nothing is cropped, keep a clear margin around every figure.
- Every figure faces RIGHT, strict side view, the same man, costume, colours and weapon in all 16 cells — only the pose changes. Never mirror a cell.
- Background: one perfectly flat solid magenta (#FF00FF) everywhere — no ground, no shadow, no scenery, no text. No magenta or pink on the figures.
- Detailed 16-bit SNES/Octopath-style pixel art: crisp pixel clusters, dark outlines, 3-tone shading, light coming from the upper left in every cell. Bold, simple shapes: the figure will be shown small, so the silhouette must read at 32 pixels tall.

Cells in reading order (left to right, top row first):
${CELLS[kind].map((r, i) => `${i + 1}. ${r}`).join('\n')}

Reference image 1 is the approved single battle sprite of this ${v2 ? 'unit (another man of it)' : 'exact man'}: ${v2 ? `match its army colours, armour style, pixel scale and rendering precisely, changing only what the subject line${SHAPE[kind] ? ' and the redesign' : ''} says` : `copy his face, costume and colours precisely and keep its pixel-art rendering style${SHAPE[kind] ? '; his weapon and shield follow the redesign above, not the reference' : ', and his weapon'}`}.
Make the poses strongly readable in silhouette: the weapon, the upper body and the ${kind === 'cavalry' ? "horse's legs" : 'legs'} must clearly change between cells.`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.stdout.write((process.argv.includes('--turn') ? turnPrompt : troopPrompt)(process.argv[2], process.argv.includes('--v2')));
