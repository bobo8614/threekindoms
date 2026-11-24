// Prompt source for the extended troop looks' 白兵 action sheets (数据包势力的兵种外观: looks only, each
// borrows the rules, frame order and clips of an original kind — BORROW in troop_sprite_prompts.mjs).
// troop_frame_prompts.mjs hands a key whose kind is one of these looks over to here, so
// gen_troop_frames_codex.sh and slice_troop_frames.py treat them like the original kinds:
//   node hd2d-mvp/tools/troop_frame_prompts.mjs <attacker|defender>-<elephant|hillman|ashigaru|steppe> [--v2] [--turn]
// Reference image 1 is the look's approved battle sprite (troop_sprite_prompts.mjs) for the side sheet, and
// the approved side sheet for the --turn sheet.
import { BORROW } from './troop_sprite_prompts.mjs';

export { BORROW };

const ARMY = {
  attacker: 'attacking army (teal-green cloth, sashes, banner and barding paint; silver / iron metal)',
  defender: 'defending army (crimson-and-gold cloth, sashes, banner and barding paint; bronze metal)',
};

const LOOK = {
  elephant: {
    unit: 'Nanman war elephant (南蛮战象) with one spear-armed rider on its neck',
    mounted: true,
    v2: 'a different elephant and rider of the same unit: a darker, older elephant with one broken-off shorter tusk and a plain rattan head plate, the rider with a bare shaven head and a bone-and-tooth necklace instead of the turban, the same rattan barding pattern and the same long spear',
    cells: [
      'IDLE A: the elephant standing square on all four feet, trunk hanging and curled at the tip, rider upright, spear held upright',
      'IDLE B: same as IDLE A — the spear still held UPRIGHT exactly as in IDLE A — but the elephant swings its trunk forward and lifts one front foot slightly, ears spread (breath)',
      'WALK 1: slow heavy walk, left fore and right hind feet lifted forward, the other two planted; rider sways, spear upright',
      'WALK 2: walk, all four feet on the ground, legs passing under the body, spear upright',
      'WALK 3: walk, right fore and left hind feet lifted forward, spear upright',
      'WALK 4: walk, all four feet on the ground, legs passing the other way, spear upright',
      'CHARGE 1: fast heavy charge (an elephant does not gallop: a fast striding run), front legs reaching forward, head lowered, tusks forward, trunk raised and curled, rider leaning forward with the spear levelled',
      'CHARGE 2: charge, legs gathered under the body, the whole body slightly lower, trunk up trumpeting',
      'CHARGE 3: charge, hind legs reaching forward, front legs pushing back, head down, tusks forward',
      'CHARGE 4: charge, legs at full stride, ears flared out, spear levelled',
      'WIND-UP: the elephant rears its head back and lifts its trunk high, the rider draws the spear far back over his shoulder',
      'STRIKE: the elephant lunges its head forward and down, tusks driving straight ahead at chest height of a man, the rider thrusting the spear forward at the same time',
      'HURT: the elephant flinches backward, head thrown up, trunk flung up, ears flared; the rider jolted back in his seat',
      'FALL: the elephant collapsing onto its knees, head sagging, the rider sliding off its neck with the spear dropping',
      'DEAD: the elephant lying on its side on the (invisible) ground, legs out, the rider sprawled beside it, spear fallen, seen from the side',
      'CHEER: the elephant rearing up on its hind legs with its trunk raised high trumpeting, the rider brandishing the spear overhead and shouting',
    ],
    turn: [
      'IDLE: the elephant standing square, trunk hanging, rider upright on its neck with the spear upright',
      'CHARGE 1: fast striding charge, one front foot lifted high, trunk raised, spear levelled ahead',
      'CHARGE 2: charge, feet passing under the body',
      'CHARGE 3: charge, the other front foot lifted high',
      'CHARGE 4: charge, feet passing the other way',
      'WIND-UP: the elephant lifts its trunk high and rears its head back, the rider draws the spear back',
      'STRIKE: the elephant lunges its head and tusks straight ahead along its facing direction, the rider thrusts the spear',
      'HURT: the elephant flinches, head thrown up, ears flared, the rider jolted back',
    ],
  },
  hillman: {
    unit: 'mountain tribal warrior (山岳蛮兵) with a broad chopping blade and a tall narrow wooden shield',
    mounted: false,
    v2: 'a different warrior of the same unit: an older, stockier man with his long hair tied in a top-knot and NO headwrap or feather, a hide cape over one shoulder, a broad round rattan shield instead of the narrow one, the same chopping blade',
    cells: [
      'IDLE A: standing ready in a slight crouch, blade held low at his side, shield in front',
      'IDLE B: same as IDLE A, chest slightly raised, weight shifted to the other foot (breath)',
      'WALK 1: advancing at a light, prowling walk, left leg forward, right leg back, shield forward, blade at the hip',
      'WALK 2: walking, legs passing under the body',
      'WALK 3: walking, right leg forward, left leg back',
      'WALK 4: walking, legs passing the other way',
      'RUN: charging forward fast and low, body leaning hard forward, long stride, blade raised, shield forward',
      'WIND-UP: blade raised high over his head behind him, body coiled, shield forward (like the approved battle sprite)',
      'STRIKE: a full downward-forward CHOP — the blade swung down and out in front of him at chest height of an enemy, front knee bent, back leg straight',
      'FOLLOW-THROUGH: the blade carried low past his front knee, body still leaning forward, recovering',
      'GUARD: crouched low behind the raised shield, blade held back, bracing for a blow',
      'HURT: jolted backward as if struck in the chest, head thrown back, blade arm flung out',
      'STAGGER: stumbling one step back, bent forward, shield arm down',
      'FALL: falling backwards, knees buckling, blade slipping from his hand',
      'DEAD: lying flat on his back on the (invisible) ground, blade and shield fallen beside him, seen from the side',
      'CHEER: standing tall, blade thrust straight up overhead, shield raised, mouth open shouting a war cry',
    ],
    turn: [
      'IDLE: standing ready in a slight crouch, blade low at his side, shield in front',
      'WALK 1: walking, left foot stepping forward, shield forward',
      'WALK 2: walking, feet passing, both nearly together',
      'WALK 3: walking, right foot stepping forward',
      'WALK 4: walking, feet passing the other way',
      'WIND-UP: blade raised high over his head, shield forward',
      'STRIKE: a full CHOP straight ahead along his facing direction, the blade swung down in front of him',
      'HURT: jolted backward as if struck in the chest, head thrown back, blade arm flung out',
    ],
  },
  ashigaru: {
    unit: 'Japanese ashigaru foot soldier (日本足轻) with a very long yari spear and a back banner',
    mounted: false,
    v2: 'a different man of the same unit: a plain cloth hachimaki headband instead of the jingasa hat, a short beard, a darker plain cuirass, the same very long spear and the same back banner',
    cells: [
      'IDLE A: standing at ease, the very long spear held upright beside him, its butt on the ground (the shaft rising high above his banner), feet apart',
      'IDLE B: same as IDLE A, chest slightly raised, weight shifted to the other foot (breath)',
      'WALK 1: marching, left leg forward, right leg back, the spear carried at a slant in both hands, its POINT UP AND FORWARD ahead of him at about 45 degrees (never pointing backward: the charge cycles walk and run frames, so the point must stay in front)',
      'WALK 2: marching, legs passing under the body, spear still slanted point-forward',
      'WALK 3: marching, right leg forward, left leg back',
      'WALK 4: marching, legs passing the other way',
      'RUN: charging forward, body leaning forward, long stride, the spear levelled forward at the hip in both hands',
      'WIND-UP: braced low, the spear drawn back in both hands with the point forward, torso coiled',
      'STRIKE: a full forward THRUST — both arms driving the very long spear straight out level at chest height, front knee bent, back leg straight (like the approved battle sprite)',
      'FOLLOW-THROUGH: spear pulled back halfway, point still forward, recovering his stance',
      'GUARD: kneeling on one knee, the spear butt braced on the ground and the point angled up and forward in a spear wall, bracing for a charge',
      'HURT: jolted backward as if struck in the chest, head thrown back, spear arm flung out',
      'STAGGER: stumbling one step back, bent forward, spear point dropping',
      'FALL: falling backwards, knees buckling, spear slipping from his hands, banner tilting',
      'DEAD: lying flat on his back on the (invisible) ground, spear and banner fallen beside him, seen from the side',
      'CHEER: standing tall, spear thrust straight up overhead, mouth open shouting',
    ],
    turn: [
      'IDLE: standing at ease, the very long spear held upright beside him, butt on the ground',
      'WALK 1: marching, left foot stepping forward, spear held upright in front of him, point up',
      'WALK 2: marching, feet passing, both nearly together',
      'WALK 3: marching, right foot stepping forward',
      'WALK 4: marching, feet passing the other way',
      'WIND-UP: braced low, spear drawn back with the point forward',
      'STRIKE: a full THRUST straight ahead along his facing direction, the spear driven out level, front knee bent',
      'HURT: jolted backward as if struck in the chest, head thrown back, spear arm flung out',
    ],
  },
  steppe: {
    unit: 'Xiongnu heavy steppe cavalryman (匈奴铁骑) in iron scale armour on an armoured steppe horse, with a long lance',
    mounted: true,
    v2: 'a different rider of the same unit on a DUN (sandy yellow) horse with a black mane: a tall fur hat with ear flaps instead of the iron helmet, a thick drooping moustache, the same iron scale coat, barding and lance',
    cells: [
      'IDLE A: horse standing square on all four hooves, rider upright, lance held upright',
      'IDLE B: same as IDLE A but the horse lowers its head and paws the ground with one front hoof (breath)',
      'WALK 1: slow four-beat walk, left fore and right hind legs reaching forward, other two planted; lance upright',
      'WALK 2: walk, all four hooves on the ground, legs passing under the body',
      'WALK 3: walk, right fore and left hind legs reaching forward',
      'WALK 4: walk, all four hooves on the ground, legs passing the other way',
      'GALLOP 1: charging gallop, both front legs reaching forward, hind legs pushing back, lance levelled forward (like the approved battle sprite)',
      'GALLOP 2: gallop, legs gathered under the body, one front hoof planted, lance levelled',
      'GALLOP 3: gallop, hind legs reaching forward under the belly, front legs pushing back',
      'GALLOP 4: gallop, extended suspension, legs spread apart, lance levelled',
      'WIND-UP: the lance pulled back along its own length, its POINT STILL FORWARD past the horse\'s head (never turned to point backward), rear hand drawn back behind the hip, torso coiled; horse gathers its hind legs',
      'STRIKE: a full horizontal THRUST — lance driven far out in front of the horse\'s head at chest height of an enemy; horse lunges',
      'HURT: rider jolted backward in the saddle, lance arm flung out; horse rears its front slightly',
      'FALL: rider slipping backwards off the saddle, lance dropping; horse rearing in panic',
      'DEAD: the horse lying on its side on the (invisible) ground, legs out, the rider sprawled across it, lance fallen beside them, seen from the side',
      'CHEER: horse rearing up on its hind legs, rider brandishing the lance overhead and howling a war cry',
    ],
    turn: [
      'IDLE: horse standing square on all four hooves, rider upright, lance held upright',
      'GALLOP 1: charging gallop, both front legs reaching forward, lance levelled ahead',
      'GALLOP 2: gallop, legs gathered under the body, one front hoof planted',
      'GALLOP 3: gallop, hind legs reaching forward under the belly',
      'GALLOP 4: gallop, extended suspension, legs spread apart',
      'WIND-UP: lance drawn back, rear hand at the hip, torso coiled; horse gathers its hind legs',
      'STRIKE: a full THRUST — lance driven straight ahead past the horse\'s head; horse lunges',
      'HURT: rider jolted backward in the saddle, lance arm flung out; horse throws its head up',
    ],
  },
};

export const isLook = (kind) => kind in LOOK;

const STYLE = `- Background: one perfectly flat solid magenta (#FF00FF) everywhere — no ground, no shadow, no scenery, no text. No magenta or pink on the figures.
- Detailed 16-bit SNES/Octopath-style pixel art matching reference image 1 exactly: same pixel scale, crisp pixel clusters, dark outlines, 3-tone shading, light from the upper left in every cell. Bold, simple shapes: the figure is shown small, so the silhouette must read at 48 pixels tall.`;

function parse(key) {
  const [side, look] = key.split('-');
  if (!ARMY[side] || !LOOK[look]) throw new Error(`unknown troop look ${key}`);
  return [side, look, LOOK[look]];
}
const ground = (L) => (L.mounted ? "the animal's feet" : 'feet');

export function lookPrompt(key, v2 = false) {
  const [side, , L] = parse(key);
  return `Animation pose sheet (sprite sheet) for an HD-2D remake of the 1992 Famicom strategy game "Sangokushi II: Haou no Tairiku" — a rank-and-file troop of an extended-map faction, seen in small squads on a battlefield.
Subject: a ${L.unit} of the ${ARMY[side]} — ${v2 ? L.v2 : 'exactly the figure of reference image 1'}.

Layout (critical):
- Landscape canvas 1536x1024 divided into an invisible 4-column × 4-row grid of 16 equal cells (384×256 each). Do NOT draw grid lines, borders, numbers or labels.
- Exactly ONE complete figure per cell, centred in its cell, every figure at the SAME scale and on the SAME ground line (${ground(L)} at the same height near the bottom of each cell); nothing crosses into a neighbouring cell, nothing is cropped${L.mounted ? '' : ' (the long weapon too: keep it inside its own cell, angling it if needed)'}, keep a clear margin around every figure.
- Every figure faces RIGHT, strict side view, the same ${L.mounted ? 'rider and animal' : 'man'}, costume, colours and weapon in all 16 cells — only the pose changes. Never mirror a cell.
${STYLE}

Cells in reading order (left to right, top row first):
${L.cells.map((r, i) => `${i + 1}. ${r}`).join('\n')}

Reference image 1 is the approved single battle sprite of this ${v2 ? 'unit (draw another member of it)' : `exact ${L.mounted ? 'rider and animal' : 'man'}`}: ${v2 ? 'match its army colours, costume style, pixel scale and rendering precisely, changing only what the subject line says' : 'copy the face, costume, equipment, colours and weapon precisely and keep its pixel-art rendering style'}.
Make the poses strongly readable in silhouette: the weapon, the upper body and the ${L.mounted ? "animal's legs" : 'legs'} must clearly change between cells.`;
}

export function lookTurnPrompt(key, v2 = false) {
  const [side, , L] = parse(key);
  return `Animation pose sheet (sprite sheet) for an HD-2D remake of the 1992 Famicom strategy game "Sangokushi II: Haou no Tairiku" — a rank-and-file troop of an extended-map faction seen in small squads on a battlefield, viewed from a raised camera about 35 degrees above the ground.
Subject: a ${L.unit} of the ${ARMY[side]} — ${v2 ? L.v2 : 'the exact figure of reference image 1'}. Reference image 1 is the approved SIDE-VIEW action sheet; this new sheet shows the SAME figure from the FRONT and from the BACK.

Layout (critical):
- Landscape canvas 1536x1024 divided into an invisible 4-column × 4-row grid of 16 equal cells (384×256 each). Do NOT draw grid lines, borders, numbers or labels.
- Exactly ONE complete figure per cell, centred in its cell, every figure at the SAME scale as reference image 1 and on the SAME ground line (${ground(L)} at the same height near the bottom of each cell); nothing crosses into a neighbouring cell, nothing is cropped, keep a clear margin around every figure.
- Rows 1–2 (cells 1–8): FRONT VIEW — facing and moving straight TOWARD the viewer (down the screen); we see the face and chest${L.mounted ? " and the animal's head and chest head-on" : ''}. Seen slightly from above.
- Rows 3–4 (cells 9–16): BACK VIEW — facing and moving straight AWAY from the viewer (up the screen); we see the back${L.mounted ? " and the animal's rump and tail" : ' and the back of the head'}. Seen slightly from above.
- Not three-quarter, not side view: square-on front and square-on back. Same figure, costume, colours and weapon in all 16 cells; only pose and facing change.
${STYLE}

Cells in reading order (left to right, top row first):
${[...L.turn.map((c) => `FRONT ${c}`), ...L.turn.map((c) => `BACK ${c}`)].map((r, i) => `${i + 1}. ${r}`).join('\n')}

The walk${L.mounted ? '/charge' : ''} cycle must clearly alternate the legs between cells so it animates; the weapon must stay recognisably the same as in the side view.`;
}
