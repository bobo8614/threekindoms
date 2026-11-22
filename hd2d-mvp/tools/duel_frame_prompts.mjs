// Prompt source for 单挑 action sheets, sliced by slice_duel_frames.py into the frames src/duelview.js plays.
// Sheet A (4×4): idle, gallop, wind-up, strike, follow-through, hurt, taunt, fall, dodge, and the unhorsed
// rider and riderless horse that let a death part rider from mount.
// Sheet B (4×4, --b): the in-betweens — a walk cycle for slow moves and reining back, the swing's middle
// poses and recovery, 牵制's short jab, 舍身's all-in wind-up / lunge / over-balance, and two hit weights.
// Its first cell repeats IDLE A so both sheets are scaled to the same rider.
// Turn sheet (--turn): front and back views of the same rider for the 白兵 board.
// Wheel sheet (--wheel): the three-quarter views between his side and his front / back, so a horse wheels round
// in the duel instead of backing up; mirrored for the other half of the turn.
//   node hd2d-mvp/tools/duel_frame_prompts.mjs <officer_id|attacker|defender> [--b|--c|--turn|--wheel|--spin|--leap]   → prints the prompt
// Weapon class (blade / spear / sword) comes from the officer's equipment group, so the strike reads as
// a sweep, a thrust or a short cut; the generic generals carry the glaive their battle sprite shows.
// 诸葛亮 fights from his four-wheeled carriage: the same 32 cells, with the horse's gaits, rears and
// stumbles played by the wheels, the carriage body and his seat, and an empty carriage for 'loose'.
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ICONIC, accent, weaponRule, officer } from './portrait_prompts.mjs';

const DATA = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../data/game-data.json'), 'utf8'));
export const FRAMES = ['idle_a', 'idle_b', 'gallop_1', 'gallop_2', 'gallop_3', 'gallop_4', 'windup', 'strike', 'follow', 'hurt', 'taunt', 'fall', 'dodge', 'downed', 'loose_1', 'loose_2'];
export const FRAMES_B = ['idle_ref', 'walk_1', 'walk_2', 'walk_3', 'walk_4', 'swing_mid', 'swing_late', 'recover', 'feint_ready', 'feint_jab', 'feint_back', 'allin_windup', 'allin_strike', 'off_balance', 'hit_light', 'recoil_step'];
// Sheet C (--c): the 舍身 charge and leap, the crushing hit it deals, and every way a beaten rider leaves
// the duel (thrown, struggling, kneeling, slumped), plus the winner's triumph. Cells 10–14 are parts
// apart (man / horse / weapon alone) so a fall can part them on screen.
export const FRAMES_C = ['idle_ref', 'allin_charge_1', 'allin_charge_2', 'allin_leap', 'allin_smear', 'allin_impact', 'allin_land', 'hurt_crush', 'slump', 'man_fly', 'man_hit', 'man_struggle', 'horse_rear', 'weapon', 'man_kneel', 'triumph'];
// 诸葛亮 fights with his feather fan alone (2026-11-16, user's call): sword-and-fan sheets kept growing a third hand
// on the armrest, and the fan is the weapon he is known by. His equipment in the game data is unchanged.
export const weaponClass = (o) => o.name === '诸葛亮' ? 'fan' : ['sword', 'blade', 'spear'][Math.floor(o.weapon / 8)];

const STRIKE = {
  blade: {
    windup: 'WIND-UP: torso twisted back, both hands haul the long polearm up and back over the rear shoulder, crescent blade high behind his head; horse gathers its hind legs under it',
    strike: 'STRIKE: a huge forward sweep — torso rotated forward, both arms extended, the polearm swept down and FORWARD so the blade is out in front of the horse\'s head at chest height of an enemy rider; horse lunges forward',
    follow: 'FOLLOW-THROUGH: blade carried through low and past, shaft diagonal across the body, rider recovering upright',
  },
  spear: {
    windup: 'WIND-UP: spear drawn far back, rear hand at the hip, spearhead pulled back level with the saddle, torso coiled; horse gathers its hind legs',
    strike: 'STRIKE: a full horizontal THRUST — both arms and torso driven forward, the spear perfectly level and extended far in front of the horse\'s head at an enemy rider\'s chest height; horse lunges',
    follow: 'FOLLOW-THROUGH: spear pulled back halfway, point still forward, rider re-settling in the saddle',
  },
  fan: {
    windup: 'WIND-UP: the white feather fan drawn far back over his shoulder in one hand, elbow up, torso leaning back, the other hand gripping the carriage rail; he half-rises from the seat',
    strike: 'STRIKE: a forward FAN SWEEP that lands at an enemy rider\'s CHEST height — fan arm fully extended straight forward past the front of the carriage, the fan face flung edge-first at the height of his own shoulders, torso leaning forward, the other hand on the rail',
    follow: 'FOLLOW-THROUGH: the fan swept low and past after the blow, arm crossing the body, he rises back up in the seat',
  },
  sword: {
    windup: 'WIND-UP: sword raised high above the head in one hand, elbow up, torso leaning back, reins in the other hand; horse gathers',
    strike: 'STRIKE: a forward CUT that lands at an enemy rider\'s CHEST height — sword arm fully extended straight forward past the horse\'s head, the blade roughly level at the height of his own shoulders, torso leaning forward (the blade never drops below the horse\'s neck)',
    follow: 'FOLLOW-THROUGH: sword low after the cut, arm crossing the body, rider rising back up',
  },
};

// The swing between WIND-UP and STRIKE, and the short and all-in variants, per weapon class.
const SWING = {
  blade: {
    mid: 'SWING MID: the polearm coming over the top — blade straight above his head, shaft vertical, both arms raised, torso starting to turn forward',
    late: 'SWING LATE: blade sweeping down in front of his chest at 45 degrees, arms extending forward, torso turned forward, horse driving off its hind legs',
    jab: 'FEINT JAB: a quick short poke — shaft held level at the hip, blade pushed only a little past the horse\'s nose, elbows still bent, body upright (a probe, not a full swing)',
    allin: 'ALL-IN STRIKE: everything thrown into one blow — rider standing in the stirrups, body flung over the horse\'s neck, both arms at full stretch, the blade far out in front at an enemy rider\'s chest height; horse leaping forward with all four legs extended',
  },
  spear: {
    mid: 'THRUST MID: spear coming forward level at the waist, rear arm pushing, spearhead just passing the horse\'s ears',
    late: 'THRUST LATE: spear nearly fully extended, torso driving forward, rear hand at the chest',
    jab: 'FEINT JAB: a short probing jab — spear level, arms only half extended, point a little past the horse\'s nose, body upright',
    allin: 'ALL-IN THRUST: standing in the stirrups, whole body behind the spear, arms locked at full length, spear far out in front at an enemy rider\'s chest height; horse leaping forward',
  },
  fan: {
    mid: 'SWEEP MID: the fan coming down past his head, arm bent, fan diagonal, leaning forward in the seat',
    late: 'SWEEP LATE: fan arm nearly extended forward at shoulder height, the fan coming level',
    jab: 'FEINT JAB: a quick short flick of the fan forward at shoulder height, arm half extended, body upright',
    allin: 'ALL-IN SWEEP: standing, body thrown far forward, fan arm fully stretched in a long lunge',
  },
  sword: {
    mid: 'CUT MID: sword coming down past his head, arm bent, blade diagonal, torso leaning forward',
    late: 'CUT LATE: sword arm nearly extended forward at shoulder height over the horse\'s head, blade coming level',
    jab: 'FEINT JAB: a quick short thrust with the sword at shoulder height, arm half extended, body upright',
    allin: 'ALL-IN CUT: standing in the stirrups, body thrown far over the horse\'s neck, sword arm fully stretched in a long lunge; horse leaping forward',
  },
};

// The 舍身 run per weapon class for sheet C: the charge carry, the airborne cock, the smeared blow, the impact.
const ALLIN = {
  blade: {
    carry: 'polearm held low and trailing behind, crescent blade back by the horse\'s tail',
    leap: 'polearm hauled up with both hands so the crescent blade is high above and behind his head',
    smear: 'the polearm in mid-sweep, blade passing in front of his face on its way forward, with a broad painted pale-gold crescent SMEAR arc trailing the blade from high above his head down to that point (drawn as pixel art, part of the figure); the blade is still ABOVE the horse\'s neck, never down by the hooves',
    impact: 'the blade at the end of its arc far out in front of the horse\'s head, at the height of his OWN shoulders (an enemy rider\'s chest), shaft level along both fully stretched arms; the blade must not drop below the horse\'s head',
  },
  spear: {
    carry: 'spear couched under the arm, point low and forward',
    leap: 'spear drawn back to full length over the shoulder, point aimed forward and down',
    smear: 'the spear only HALF extended, driving forward level at his shoulder height, with a long, bright, thick pale-gold straight SMEAR streak behind the spearhead running back past his shoulder (drawn as pixel art, part of the figure)',
    impact: 'the spear locked at FULL extension, twice as far out as in the smear cell, level at his own shoulder height (an enemy rider\'s chest), whole body behind it',
  },
  fan: {
    carry: 'the fan held low and back at his side',
    leap: 'the fan raised high over his head, elbow up, torso arched back',
    smear: 'the fan in mid-sweep coming down in front of him, with a painted pale-gold curved SMEAR arc of wind trailing the fan (drawn as pixel art, part of the figure)',
    impact: 'the fan at the END of the same downward-forward sweep shown in the smear cell: arm fully stretched forward past the front of the carriage, the fan at an enemy rider\'s chest height, torso flung far forward',
  },
  sword: {
    carry: 'sword held low and back along the horse\'s flank',
    leap: 'sword raised high over the head, elbow up, torso arched back',
    smear: 'the sword in mid-cut coming down in front of him, with a painted pale-gold curved SMEAR arc trailing the blade (drawn as pixel art, part of the figure)',
    impact: 'the sword at the END of the same downward-forward cut shown in the smear cell: arm fully stretched forward past the horse\'s head, blade angled slightly down at an enemy rider\'s chest height, torso flung far over the neck',
  },
};
const rowsC = (a) => [
  'IDLE A (reference): horse standing square on all four hooves, rider upright holding weapon ready — identical to the first cell of reference image 1',
  `ALL-IN CHARGE 1: full racing gallop, front legs stretched far forward, hind legs pushing back; rider crouched low over the horse's neck, ${a.carry}, cloak streaming back`,
  `ALL-IN CHARGE 2: full racing gallop, all four legs gathered under the belly; rider still crouched low, ${a.carry}`,
  `ALL-IN LEAP: the horse flying LEVEL through the air like a show-jumper over a fence — body horizontal (NOT rearing, front not raised), all four legs folded tightly under the belly, the lowest hoof a third of the horse's height above the ground line, clearly higher than any other cell; rider standing in the stirrups, ${a.leap}`,
  `ALL-IN SMEAR: the horse still airborne and level, head up and neck stretched forward, front legs reaching forward and down to land (NOT bucking, head not down); rider flinging his whole body forward, ${a.smear}`,
  `ALL-IN IMPACT: front hooves just striking the ground, hind legs still in the air, horse's head UP and neck stretched forward (not bucking); rider thrown to the limit over the horse's neck, ${a.impact}`,
  'ALL-IN LAND: all four hooves down, horse skidding with its hind legs tucked under, rider pulling himself back upright, weapon swinging back toward guard',
  'CRUSHED: struck by a devastating blow from the RIGHT — rider bent far back over the saddle, facing right with his head thrown back, weapon arm flung wide behind him, almost unseated; the horse driven back to sit on its haunches, hind legs folded under it and rump almost on the ground, front legs braced forward and lifted a little (like a horse skidding backwards)',
  'SLUMPED: badly wounded — rider slumped forward onto the horse\'s neck, one arm hanging, weapon trailing down toward the ground; horse standing with its head low',
  'THROWN (the man alone, NO horse): the rider flung backwards through the air off his horse, body arched back and horizontal, arms and legs flailing, weapon flying out of his hand; draw him in the UPPER half of the cell, high above the ground line',
  'HITS THE GROUND (the man alone, NO horse): landing hard on his back and shoulder, legs still in the air, a small puff of dust under him, weapon gone',
  'STRUGGLING (the man alone, NO horse, NO weapon): lying on the ground propped up on one elbow, the other arm reaching forward for his lost weapon, head lifted',
  'RIDERLESS HORSE REARING (the horse alone, empty saddle, NO rider, NO weapon): rearing up high in panic on its hind legs, reins flying loose, mane tossing',
  'THE WEAPON ALONE (NO man, NO horse): his weapon on its own, lying flat and level across the middle of the cell, full length, exactly the weapon he carries',
  'KNEELING IN SURRENDER (the man alone, NO horse, NO weapon): on foot, kneeling on one knee on the ground, facing right, head bowed low, both empty hands clasped in front of him in a salute of surrender',
  'TRIUMPH: the victor — horse standing on all four hooves with ONE front hoof lifted and the head held high (NOT rearing), rider sitting tall and thrusting his weapon STRAIGHT UP to the sky, chest out, cloak flying',
];

// Cells for a rider who sits a carriage instead of a horse, in the same order as the horse rows.
const CART = {
  a: (s) => [
    'IDLE A: carriage standing still, all four wheels on the ground, he sits upright holding the feather fan up in one hand, the other hand resting empty on his knee (as in reference image 1)',
    'IDLE B: same as IDLE A but he lifts the fan slightly and his robe and the canopy tassels stir (breath)',
    'ROLL 1: carriage rolling forward fast, wheel spokes blurred at one angle, robe and canopy streaming back',
    'ROLL 2: rolling, spokes at a quarter turn, the carriage body tipped very slightly forward',
    'ROLL 3: rolling, spokes at a half turn, robe streaming back',
    'ROLL 4: rolling, spokes at three quarters of a turn, front wheels just bouncing off the ground',
    s.windup,
    s.strike.replace(/past the horse's head/, 'past the front of the carriage').replace(/below the horse's neck/, 'below his own waist'),
    s.follow,
    'HURT: he is jolted back against the seat as if struck in the chest, fan arm flung out, head thrown back; the carriage rocks back onto its rear wheels',
    'TAUNT: he points the feather fan straight at the enemy and calls out, the other hand on his knee, carriage still',
    'FALL: he slumps sideways out of the seat, the fan dropping from his hand; the carriage tips up on two wheels',
    'DODGE: he leans far back and away in the seat, fan raised as a guard, while the carriage rolls back one length',
    'DOWNED: the man alone, NO carriage — lying on his back on the (invisible) ground, the feather fan fallen beside him; same robe',
    'EMPTY CARRIAGE 1: the same carriage alone with an empty seat, NO man and NO weapon, rolling away fast, spokes at one angle',
    'EMPTY CARRIAGE 2: the same empty carriage rolling, spokes at a half turn',
  ],
  b: (w) => [
    'IDLE A (reference): carriage standing still, he sits upright with the fan — identical to the first cell of the previous sheet',
    'SLOW ROLL 1: carriage rolling slowly forward, spokes upright (+ shape)',
    'SLOW ROLL 2: spokes turned an eighth of a turn (x shape)',
    'SLOW ROLL 3: spokes upright again but the wheel hub decoration a quarter turn on',
    'SLOW ROLL 4: spokes x shape, the canopy tassels swinging the other way',
    w.mid.replace(/torso leaning forward/, 'leaning forward in the seat'),
    w.late.replace(/over the horse's head/, 'over the front of the carriage'),
    'RECOVER: fan brought back up to the ready position after a blow, he settles back into the seat',
    'FEINT READY: fan pulled back a little, shoulders slightly turned, carriage still',
    w.jab,
    'FEINT BACK: fan snatched straight back to the ready guard, he sits upright again',
    'ALL-IN WIND-UP: he stands up on the carriage floor, body arched back, the fan cocked high behind his head, the other hand gripping the carriage rail; the carriage rocks back onto its rear wheels',
    'ALL-IN SWEEP: standing, body thrown far over the carriage front, fan arm fully stretched forward in a long lunge, the fan sweeping through at chest height; the carriage lurching forward on its front wheels',
    'OFF BALANCE: after a missed all-out blow — he lurches forward over the carriage front, fan swung past and down, almost falling out; one front wheel caught and the carriage tipping',
    'HIT LIGHT: a small flinch — head and shoulders turned away, fan raised, carriage still',
    'RECOIL STEP: he recovers his seat after a blow, the carriage rolling back a short way',
  ],
};
const CARRIAGE = new Set(['诸葛亮']);
const FAN_RULE = ' Weapon (critical): he carries NO sword and NO other weapon in any cell — his ONLY weapon is the white feather fan, held by its handle in his LEFT hand in EVERY cell, wind-up and strike included, so it never changes hands: seen from the front it is on the viewer\'s RIGHT, seen from the back on the viewer\'s LEFT. His right hand is always EMPTY: resting on his knee, gripping the carriage rail, or hidden in his sleeve. Exactly two hands in every cell; never a third hand on the armrest or knee.';

// Turn sheet (--turn): the same rider seen square-on from the FRONT (riding toward the viewer, down the
// 白兵 board) and from the BACK (riding away, up it), for moves and blows along a column. Same 8 poses per
// facing as the troops' turn sheets (troop_frame_prompts.mjs TURN_FRAMES).
const TURN_STRIKE = {
  blade: ['WIND-UP: the long polearm hauled up and back over his shoulder, blade high behind his head, torso twisted', 'STRIKE: a huge sweep straight ahead along his facing — the blade swung down and out in front of the horse at chest height of an enemy rider'],
  spear: ['WIND-UP: spear drawn back, rear hand at the hip, torso coiled', 'STRIKE: a full THRUST straight ahead along his facing, spear level and driven far out past the horse\'s head'],
  fan: ['WIND-UP: the feather fan drawn high above his head, elbow up, torso leaning back', 'STRIKE: a forward FAN SWEEP straight ahead along his facing, fan arm extended past the carriage front at shoulder height'],
  sword: ['WIND-UP: sword raised high above his head, elbow up, torso leaning back', 'STRIKE: a forward CUT straight ahead along his facing, sword arm extended past the horse\'s head at shoulder height'],
};
function turnPrompt(key) {
  const generic = key === 'attacker' || key === 'defender';
  const o = generic ? null : officer(Number(key));
  const cls = generic ? 'blade' : weaponClass(o);
  const cart = !generic && CARRIAGE.has(o.name);
  const look = generic
    ? `a generic ${key === 'attacker' ? 'green-and-silver armoured' : 'crimson-and-gold armoured'} Three Kingdoms general on a ${key === 'attacker' ? 'brown' : 'black'} warhorse, carrying a long glaive (guandao-style polearm)`
    : (ICONIC[o.name] || `${o.name} (Romance of the Three Kingdoms officer), carrying a ${DATA.equipment[o.weapon].name}`);
  const [wind, strike] = TURN_STRIKE[cls];
  const mount = cart ? 'his four-wheeled war carriage' : 'his horse';
  const poses = cart ? [
    'IDLE: carriage standing still, he sits upright holding the feather fan up in one hand, the other hand resting empty on his knee', 'ROLL 1: carriage rolling, wheels at one angle, robe streaming', 'ROLL 2: rolling, wheels a quarter turn on',
    'ROLL 3: rolling, wheels a half turn on', 'ROLL 4: rolling, wheels three quarters on', wind.replace(/torso.*$/, 'half-rising from the seat'), strike.replace(/the horse('s head)?/g, 'the carriage front'),
    'HURT: jolted back against the seat, fan arm flung out, the carriage rocking'] : [
    'IDLE: horse standing square on all four hooves, rider upright holding the weapon ready', 'GALLOP 1: charging canter, both front legs reaching forward',
    'GALLOP 2: canter, legs gathered under the body, one front hoof planted', 'GALLOP 3: canter, hind legs reaching forward under the belly', 'GALLOP 4: canter, legs spread apart in suspension',
    `${wind}; horse gathers its hind legs`, `${strike}; horse lunges`, 'HURT: rider jolted backward in the saddle, weapon arm flung out; horse throws its head up'];
  return `Animation pose sheet (sprite sheet) for an HD-2D remake of the 1992 Famicom strategy game "Sangokushi II: Haou no Tairiku" — a general on ${mount} on a battlefield, viewed from a raised camera about 35 degrees above the ground.
Subject: ${look}. Reference image 1 is his approved SIDE-VIEW duel action sheet; this new sheet shows the SAME rider${cart ? ' and carriage' : ' and horse'} from the FRONT and from the BACK.
${generic ? '' : `Accent colour: ${accent(o)}.\n`}${weaponRule(look)}${cart ? FAN_RULE : ''}

Layout (critical):
- Landscape canvas 1536x1024 divided into an invisible 4-column × 4-row grid of 16 equal cells (384×256 each). Do NOT draw grid lines, borders, numbers or labels.
- Exactly ONE complete figure per cell, centred in its cell, every figure at the SAME scale as reference image 1 and on the SAME ground line (${cart ? 'wheels' : 'hooves'} at the same height near the bottom of each cell); nothing crosses into a neighbouring cell, nothing is cropped, keep a clear margin around every figure (the weapon included).
- Rows 1–2 (cells 1–8): FRONT VIEW — he rides straight TOWARD the viewer (down the screen); we see his face and chest${cart ? ' and the front of the carriage' : " and the horse's head and chest head-on"}. Seen slightly from above.
- Rows 3–4 (cells 9–16): BACK VIEW — he rides straight AWAY from the viewer (up the screen); we see his back${cart ? ' and the back of the carriage' : ", the horse's rump and tail"}. Seen slightly from above.
- Square-on front and square-on back, not three-quarter, not side view. Same face, costume, ${cart ? 'carriage' : 'horse'}, colours and weapon as reference image 1 in all 16 cells; only pose and facing change.
- Colour (critical): match reference image 1's coat, armour and cloth value for value; never lighten, saturate or wash them out.
- Background: one perfectly flat solid magenta (#FF00FF) everywhere — no ground, no shadow, no scenery, no text. No magenta or pink on the figures.
- Detailed 16-bit SNES/Octopath-style pixel art matching reference image 1 exactly: same pixel scale, crisp pixel clusters, dark outlines, 3-tone shading, light from the upper left.

Cells in reading order (left to right, top row first):
${[...poses.map((c) => `FRONT ${c}`), ...poses.map((c) => `BACK ${c}`)].map((r, i) => `${i + 1}. ${r}`).join('\n')}

The ${cart ? 'wheels' : 'gallop'} must clearly change between cells so it animates; the weapon must stay recognisably the same as in the side view.`;
}

// Wheel sheet (--wheel): a horse coming round on the ground, between the approved side and front / back views.
// The third sheet for the carriage, cell for cell in FRAMES_C order: the cell named RIDERLESS HORSE REARING is
// the empty carriage tipping up (the duel plays it as the mount rearing), and the man alone cells are the same.
CART.c = (a) => [
  'IDLE A (reference): carriage standing still, all four wheels on the ground, he sits upright with the fan — identical to the first cell of reference image 1',
  'ALL-IN CHARGE 1: the carriage rushing forward at full speed, spokes blurred, the carriage body pitched forward; he crouches low over the carriage front, fan held low and forward, the other hand gripping the rail, robe and canopy streaming back',
  'ALL-IN CHARGE 2: still rushing, spokes a quarter turn on, front wheels bouncing off the ground; he crouches low, fan low and forward',
  `ALL-IN LEAP: the whole carriage bounding LEVEL through the air over a bump — all four wheels clearly off the ground, the lowest wheel a third of the carriage's height above the ground line, higher than any other cell; he stands up on the carriage floor, ${a.leap}`,
  `ALL-IN SMEAR: the carriage still airborne, front wheels reaching down to land; he flings his whole body forward over the carriage front, ${a.smear}`,
  `ALL-IN IMPACT: front wheels just striking the ground, rear wheels still in the air; he is thrown to the limit over the carriage front, ${a.impact.replace(/past the horse's head/, 'past the front of the carriage').replace(/over the neck/, 'over the carriage front')}`,
  'ALL-IN LAND: all four wheels down, the carriage skidding, he pulls himself back upright in the seat, fan swinging back toward guard',
  'CRUSHED: struck by a devastating blow from the RIGHT — he is bent far back over the seat, facing right with his head thrown back, fan arm flung wide behind him, almost thrown out; the carriage driven back and tipped up onto its rear wheels',
  'SLUMPED: badly wounded — he slumps forward over the carriage front, one arm hanging, the fan dropped in his lap; carriage still',
  'THROWN (the man alone, NO carriage): flung backwards through the air out of the carriage, body arched back and horizontal, arms and legs flailing, robe flying, the fan flying out of his hand; draw him in the UPPER half of the cell, high above the ground line',
  'HITS THE GROUND (the man alone, NO carriage): landing hard on his back and shoulder, legs still in the air, a small puff of dust under him, no weapon',
  'STRUGGLING (the man alone, NO carriage, NO weapon): lying on the ground propped up on one elbow, the other arm reaching forward for his lost fan, head lifted',
  'EMPTY CARRIAGE TIPPING (the carriage alone, empty seat, NO man, NO weapon): the carriage tipped up high onto its two rear wheels as if jolted, canopy tassels flying',
  'THE WEAPON ALONE (NO man, NO carriage): his white feather fan on its own, lying flat and level across the middle of the cell, handle to the left, exactly the fan he carries',
  'KNEELING IN SURRENDER (the man alone, NO carriage, NO weapon): on foot, kneeling on one knee on the ground, facing right, head bowed low, both empty hands clasped in front of him in a salute of surrender, the feather fan laid on the ground before him',
  'TRIUMPH: the victor — carriage standing still, he stands up on the carriage floor raising the feather fan STRAIGHT UP to the sky in one hand, the other hand on the carriage rail, robe flying',
];
function wheelPrompt(key) {
  const generic = key === 'attacker' || key === 'defender';
  const o = generic ? null : officer(Number(key));
  const cart = !generic && CARRIAGE.has(o.name);
  const look = generic
    ? `a generic ${key === 'attacker' ? 'green-and-silver armoured' : 'crimson-and-gold armoured'} Three Kingdoms general on a ${key === 'attacker' ? 'brown' : 'black'} warhorse, carrying a long glaive (guandao-style polearm)`
    : (ICONIC[o.name] || `${o.name} (Romance of the Three Kingdoms officer), carrying a ${DATA.equipment[o.weapon].name}`);
  const front = cart ? "the front of the carriage and his face and chest, with the carriage's right-hand side receding" : "the horse's face, chest and near flank at once, with the rider's face and chest";
  const back = cart ? 'the back of the carriage and his back, with its side receding' : "the horse's rump, tail and near flank at once, with the rider's back and cloak";
  const legs = cart ? [
    'wheel spokes upright (+ shape)', 'spokes turned an eighth of a turn (x shape)', 'spokes upright with the hub a quarter turn on', 'spokes x shape, canopy tassels swinging the other way',
  ] : [
    'walking, near fore leg reaching forward, far hind leg reaching forward, the other two planted', 'walking, all four hooves on the ground, legs passing under the body',
    'walking, far fore leg reaching forward, near hind leg reaching forward, the other two planted', 'walking, all four hooves on the ground, legs passing the other way',
  ];
  const run = cart ? [
    'rolling fast, spokes blurred at one angle, robe and canopy streaming', 'rolling fast, spokes a quarter turn on, the carriage tilted into the turn', 'rolling fast, spokes a half turn on', 'rolling fast, spokes three quarters on, front wheels bouncing',
  ] : [
    'spinning away at a gallop, both front legs reaching, the horse leaning into the turn', 'galloping, legs gathered under the body, the horse leaning into the turn', 'galloping, hind legs reaching under the belly', 'galloping, legs spread in suspension',
  ];
  const empty = cart ? 'the same carriage alone with an empty seat, NO man and NO weapon' : 'the same horse alone with an empty saddle, NO rider and NO weapon';
  const rows = [
    ...legs.map((c, i) => `THREE-QUARTER FRONT ${i + 1}: ${c}`),
    ...legs.map((c, i) => `THREE-QUARTER BACK ${i + 1}: ${c}`),
    ...run.map((c, i) => `THREE-QUARTER FRONT, FLEEING ${i + 1}: ${c}; he looks back over his shoulder`),
    `EMPTY THREE-QUARTER FRONT 1: ${empty}, ${cart ? 'rolling fast' : 'bolting at a gallop, front legs reaching'}`,
    `EMPTY THREE-QUARTER FRONT 2: ${empty}, ${cart ? 'spokes a half turn on' : 'galloping, legs gathered'}`,
    `EMPTY FRONT 1: ${empty}, square-on from the FRONT, ${cart ? 'rolling toward the viewer' : 'bolting toward the viewer, head high, one fore leg reaching'}`,
    `EMPTY FRONT 2: ${empty}, square-on from the FRONT, ${cart ? 'spokes a half turn on' : 'the other fore leg reaching'}`,
  ];
  return `Animation pose sheet (sprite sheet) for an HD-2D remake of the 1992 Famicom strategy game "Sangokushi II: Haou no Tairiku" — a general on ${cart ? 'his four-wheeled war carriage' : 'his horse'} wheeling round on a battlefield.
Subject: ${look}.
Reference image 1 is his approved SIDE-VIEW action sheet (strict side, facing right). Reference image 2 is his approved FRONT and BACK sheet. This new sheet shows the SAME rider${cart ? ' and carriage' : ' and horse'} at the angles BETWEEN those views, the in-between frames of a turn, so that side → this → front plays as a smooth rotation.
${generic ? '' : `Accent colour: ${accent(o)}.\n`}${weaponRule(look)}${cart ? FAN_RULE : ''}

Layout (critical):
- Landscape canvas 1536x1024 divided into an invisible 4-column × 4-row grid of 16 equal cells (384×256 each). Do NOT draw grid lines, borders, numbers or labels.
- Exactly ONE complete figure per cell, centred in its cell, every figure at the SAME scale as the references and on the SAME ground line (${cart ? 'wheels' : 'hooves'} at the same height near the bottom of each cell); nothing crosses into a neighbouring cell, nothing is cropped, keep a clear margin around every figure (the weapon included).
- THREE-QUARTER FRONT cells: the ${cart ? 'carriage' : 'horse'} has turned about 45 degrees from the strict side view TOWARD the viewer, ${cart ? 'its front' : 'its head'} pointing to the viewer's lower RIGHT. We see ${front}. The body is clearly foreshortened: shorter than in the side view, wider than in the front view.
- THREE-QUARTER BACK cells: the ${cart ? 'carriage' : 'horse'} has turned about 45 degrees from the strict side view AWAY from the viewer, ${cart ? 'its front' : 'its head'} pointing to the viewer's upper RIGHT. We see ${back}; ${cart ? 'the front of the carriage' : "the horse's head"} is seen from behind and to the side.
- In all rider cells (rows 1–3) he holds the weapon the same way, upright and ready as in the references; only the ${cart ? 'wheels' : 'legs'} and his slight bob change between cells of a row, so the weapon never jumps. Never crop or shorten the weapon.
- Same face, costume, ${cart ? 'carriage' : 'horse'}, colours and weapon as the references in every cell. The horse's coat, mane, tail and tack must match exactly.
- Colour (critical): reference image 1 decides every colour and how dark it is. Match its coat, armour and cloth value for value; never lighten, saturate or wash them out, and where the references differ, follow reference image 1.
- Background: one perfectly flat solid magenta (#FF00FF) everywhere — no ground, no shadow, no scenery, no text. No magenta or pink on the figures.
- Detailed 16-bit SNES/Octopath-style pixel art matching the references exactly: same pixel scale, crisp pixel clusters, dark outlines, 3-tone shading, light from the upper left.

Cells in reading order (left to right, top row first):
${rows.map((r, i) => `${i + 1}. ${r}`).join('\n')}`;
}

// Spin and leap sheets (--spin / --leap, 3×2): the 普通攻击 overhead weapon spin and the 舍身 high leap of the
// 2026-11-21 duel rework (单挑动作全面优化_交接_2026-11-21.md). 关羽's pair (38-spin / 38-leap) is the approved
// sample, and is handed to Codex as reference image 2 for the layout, timing and size of the poses only.
// Frame names match slice_duel_spin.py: spin = idle_ref, spin_1..4, spin_cleave; leap = idle_ref, leap_up, leap_apex,
// leap_dive, leap_slam, leap_miss. Twin weapons (典韦 and 太史慈 short, 张任 long 双戟) spin one in each fist.
export const FRAMES_SPIN = ['idle_ref', 'spin_1', 'spin_2', 'spin_3', 'spin_4', 'spin_cleave'];
export const FRAMES_LEAP = ['idle_ref', 'leap_up', 'leap_apex', 'leap_dive', 'leap_slam', 'leap_miss'];
// Riders whose approved duel sheet carries another weapon than their equipment class: the spin and leap follow the
// sheet, or he would change weapons mid-duel (吕蒙's spin drew a short sword under his glaive strip, 2026-11-21).
const DRAWN_AS = { 吕蒙: 'blade', 黄忠: 'sword' };  // 黄忠's broad sabre is one-handed: his spin drew a glaive
const TWIN = /pair of short-hafted|twin short halberds|双戟/i;  // 张任 151 has no ICONIC line, only his 双戟
const SPIN = {
  blade: {
    grip: 'both hands raise the long polearm high ABOVE HIS HEAD, shaft held level, and whirl it round in a flat horizontal circle above the helmet like a propeller',
    phases: ['the blade end out at the FRONT (right), shaft level across above his head, the blade overhanging the horse\'s head',
      'the blade swung round to the BACK (left), shaft still level above his head, blade now overhanging the horse\'s rump',
      'the blade coming round the FAR side, shaft seen foreshortened and tilted slightly up toward the back, blade high behind his head',
      'the blade coming back round to the FRONT (right), shaft level again above his head'],
    trail: 'a thin pale-gold elliptical SPIN TRAIL streak arcing above his head behind the blade',
    cleave: 'the polearm hauled up to its highest point over his head for a downward chop, both hands high, shaft diagonal with the blade raised high behind and above his head, torso arched back',
  },
  spear: {
    grip: 'both hands raise the spear high ABOVE HIS HEAD, shaft held level, and twirl it round in a flat horizontal circle above the helmet (a spear flourish)',
    phases: ['the spearhead out at the FRONT (right), shaft level above his head',
      'the spearhead swung round to the BACK (left), shaft still level above his head',
      'the spearhead coming round the FAR side, shaft foreshortened and tilted slightly up toward the back',
      'the spearhead coming back round to the FRONT (right), shaft level again above his head'],
    trail: 'a thin pale-gold ring-shaped SPIN TRAIL streak circling above his head behind the spearhead',
    cleave: 'the spear raised highest over his head, both hands up, spearhead angled forward and down ready to drive a great thrust down at an enemy rider',
  },
  twin: {
    grip: 'he raises BOTH weapons high ABOVE HIS HEAD, one gripped in each fist by its haft, and whirls them round each other in tight circles above his helmet',
    phases: ['both weapon heads at the FRONT (right) above his head, arms raised',
      'one weapon head at the front, the other swung to the back, crossing above his helmet',
      'both weapon heads swung to the BACK (left) above his head',
      'the weapon heads crossing back toward the front above his head'],
    trail: 'two thin pale-gold circular SPIN TRAIL streaks above his head behind the weapon heads',
    cleave: 'both weapons raised highest over his head, one in each fist, ready to chop down, torso arched back',
  },
  sword: {
    grip: 'he raises the sword high ABOVE HIS HEAD in ONE hand and whirls it round in a flat circle above his helmet (a sword flourish), while the OTHER hand keeps hold of the reins at the saddle — the sword is never held two-handed',
    phases: ['the sword tip pointing to the FRONT (right) above his head, sword arm raised straight up',
      'the sword swung round to point to the BACK (left) above his head',
      'the sword coming round the FAR side, blade foreshortened and tilted slightly up toward the back',
      'the sword tip coming back round to the FRONT (right) above his head'],
    trail: 'a thin bright pale-gold circular SPIN TRAIL streak above his head behind the sword tip',
    cleave: 'the sword raised highest over his head in the one hand, blade pointing up and back, ready to cut down; the other hand still on the reins',
  },
  fan: {
    // Under the carriage canopy there is no room above his head: the fan circles beside and in front of his face.
    grip: 'he holds the white feather fan up in his LEFT hand at the height of his head and swirls it round in a circle beside and in front of his face, under the canopy, calling up the wind, his right hand gripping the carriage rail',
    phases: ['the fan out in FRONT of his face (right), arm raised to head height', 'the fan swirled round close BEHIND his head (left)',
      'the fan coming round the FAR side of his head, half hidden by it', 'the fan coming back round to the FRONT (right) of his face'],
    trail: 'a pale cyan and white SPIRAL of wind curling round his head and the fan, inside the carriage, under the canopy',
    cleave: 'the fan drawn back high beside his head in his left hand, just under the canopy roof, ready to sweep a gust forward, the whirlwind gathered round him',
  },
};
const LEAP = {
  blade: {
    up: 'both hands hauling the polearm up, the crescent blade high above his head',
    apex: 'polearm raised straight up overhead with both hands, blade pointing to the sky, torso arched back, cocking the blow',
    dive: 'the polearm sweeping down and forward in one huge chop, blade out in front of the horse\'s head, with a HUGE bright pale-gold crescent SMEAR ARC trailing the blade from high above his head down to it (drawn as pixel art, part of the figure)',
    slam: 'both arms at full stretch, the polearm swept level far out in front of the horse\'s head at the height of an enemy rider\'s chest',
    miss: 'the blade swung through and down past the target, its tip near the ground in front of the horse',
  },
  spear: {
    up: 'both hands raising the spear high, point forward',
    apex: 'spear drawn back high over his shoulder with both hands, point aimed forward and down, torso arched back',
    dive: 'the spear driven forward and down in one huge thrust, point far out in front of the horse\'s head, with a long bright pale-gold diagonal SMEAR streak behind the spearhead (drawn as pixel art, part of the figure)',
    slam: 'the spear locked at full extension, level, far out in front of the horse\'s head at the height of an enemy rider\'s chest, whole body behind it',
    miss: 'the spear thrust through past the target, point dipping toward the ground in front of the horse',
  },
  twin: {
    up: 'both weapons raised high, one in each fist',
    apex: 'both weapons raised high overhead, one in each fist, torso arched back',
    dive: 'both weapons chopping down and forward together, with a big bright pale-gold crescent SMEAR ARC trailing them (drawn as pixel art, part of the figure)',
    slam: 'both arms at full stretch forward, the two weapons out in front of the horse\'s head at the height of an enemy rider\'s chest',
    miss: 'both weapons swung through and down past the target',
  },
  sword: {
    up: 'the sword raised high to the sky in ONE hand, the other hand on the reins',
    apex: 'the sword raised high overhead in the one hand, blade pointing up and back, torso arched back, cocking the blow',
    dive: 'the sword slashing down and forward in one huge diagonal cut, arm stretched out past the horse\'s head, with a HUGE bright pale-gold crescent SMEAR ARC trailing the blade from high above his head down to it (drawn as pixel art, part of the figure)',
    slam: 'sword arm at full stretch, the blade cut through level far out in front of the horse\'s head at the height of an enemy rider\'s chest',
    miss: 'the sword swung through and down past the target, arm low in front of the horse',
  },
};
const SHEET_LAYOUT = (cart) => `Layout (critical):
- Landscape canvas 1536x1024 divided into an invisible 3-column × 2-row grid of 6 equal square cells (512×512 each). Do NOT draw grid lines, borders, numbers or labels.
- Exactly ONE complete figure per cell, every figure at the SAME scale as reference image 1; nothing crosses into a neighbouring cell, nothing is cropped, keep at least 20 px of clear magenta margin around every figure, the weapon and its trail included.
- Every figure faces RIGHT, strict side view, the same character, ${cart ? 'robe, carriage' : 'armour, horse'}, colours and weapon in all 6 cells — only the pose changes. Never mirror a cell.
- Colour (critical): reference image 1 decides every colour and how dark it is; match its coat, armour and cloth value for value, never lighten, saturate or wash them out.
- Background: one perfectly flat solid magenta (#FF00FF) everywhere — no ground, no shadow, no scenery, no text. No magenta or pink on the figures; trails and smears are pale gold / white, never pink.
- Detailed 16-bit SNES/Octopath-style pixel art matching reference image 1 exactly: same pixel scale, crisp pixel clusters, dark outlines, 3-tone shading, light from the upper left.`;
function spinLeapPrompt(key, kind) {
  const generic = key === 'attacker' || key === 'defender';
  const o = generic ? null : officer(Number(key));
  const look = generic
    ? `a generic ${key === 'attacker' ? 'green-and-silver armoured' : 'crimson-and-gold armoured'} Three Kingdoms general on a ${key === 'attacker' ? 'brown' : 'black'} warhorse, carrying a long glaive (guandao-style polearm)`
    : (ICONIC[o.name] || `${o.name} (Romance of the Three Kingdoms officer), carrying a ${DATA.equipment[o.weapon].name}`);
  const base = generic ? 'blade' : DRAWN_AS[o.name] || weaponClass(o);
  const cls = base === 'spear' && TWIN.test(look) ? 'twin' : base;
  const cart = !generic && CARRIAGE.has(o.name);
  const idle = cart ? 'IDLE (reference): carriage standing still, all four wheels on the ground, he sits upright holding the feather fan up — identical to the first cell of reference image 1'
    : 'IDLE (reference): horse standing square on all four hooves, rider upright holding the weapon ready — identical to the first cell of reference image 1';
  let rows, notes;
  if (kind === 'spin') {
    const s = SPIN[cls];
    const still = cart ? 'the carriage stands perfectly still, all four wheels on the ground' : 'the horse stands perfectly still and square on all four hooves (never rearing, never lifting a hoof)';
    rows = [idle, ...s.phases.map((p, i) => `SPIN ${i + 1}: ${still}; ${s.grip} — ${p}; ${s.trail}`), `SPIN CLEAVE: ${still}; ${s.cleave}`];
    notes = `Cells 2–5 are ONE looping overhead spin (cell 5 leads back into cell 2): the ${cart ? 'carriage, his seat' : 'horse, its legs, the rider\'s seat'} and his head must be IDENTICAL in cells 1–6, pixel for pixel in position — only his arms, the weapon and the trail move. The weapon keeps its full length in every cell (foreshortened only in SPIN 3). All four cells show the weapon clearly ABOVE his head, never in front of his face.`;
  } else if (cart) {
    // 诸葛亮's carriage does not fly like a horse: a small hop while the fan calls a wind blade down from above.
    rows = [idle,
      'LEAP UP: the carriage lurches forward, its FRONT WHEELS clearly lifted off the ground; he half-rises from the seat, the fan drawn back beside his head in his left hand, right hand on the rail',
      'LEAP APEX: the whole carriage bounced a LITTLE off the ground (all four wheels a hand\'s width above the ground line, no more); he half-rises, the fan held high beside his head just under the canopy roof, a gathering pale cyan and white whirlwind spiralling round the fan in front of the carriage',
      'LEAP DIVE: the carriage still a little off the ground; he sweeps the fan down and forward with all his strength, and a HUGE bright pale-cyan and white crescent WIND BLADE arcs from in front of the canopy down to in front of the carriage (drawn as pixel art, part of the figure)',
      'LEAP SLAM: all four wheels slammed back on the ground; his left arm at full stretch forward past the carriage front at the height of an enemy rider\'s chest, a burst of wind streaks flying forward from the fan',
      'LEAP MISS: the blow missed — the carriage lurches with one front wheel caught, he stumbles forward over the front rail, the fan swung down and past, almost falling out'];
    notes = 'Only LEAP APEX and LEAP DIVE are off the ground, and only by a little — the carriage never flies high like a horse.';
  } else {
    const l = LEAP[cls];
    rows = [idle,
      `LEAP UP: the horse explodes upward off its hind legs into a huge jump, body rising at a steep angle, front legs tucked, hind hooves just leaving the ground; rider standing in the stirrups, ${l.up}`,
      `LEAP APEX: the horse at the very TOP of a huge jump, flying LEVEL and fully stretched out like a show-jumper (front legs reaching forward, hind legs trailing back), its lowest hoof HALF the horse's height above the ground line — the highest figure on the sheet; rider ${l.apex}`,
      `LEAP DIVE: the horse plunging down from the jump, nose down, front legs reaching down to land; rider flinging his whole body forward, ${l.dive}`,
      `LEAP SLAM: all four hooves slammed down, the horse crouched low from the impact, head UP and neck stretched forward; rider thrown low over the horse's neck, ${l.slam}`,
      `LEAP MISS: the blow missed — the horse has overshot and dropped onto its FRONT KNEES, skidding, hind legs still standing; rider lurching forward over the mane, almost unseated, ${l.miss}`];
    notes = 'LEAP UP, LEAP APEX and LEAP DIVE are airborne (hooves clearly above the ground line); IDLE, LEAP SLAM and LEAP MISS stand on the ground.';
  }
  // First 109 draws (2026-11-21) pushed the fan up through the canopy roof and painted rainbow wind, whose pink the
  // slicer keys out with the magenta background.
  if (cart) notes = notes.replace(/All four cells show the weapon clearly ABOVE his head, never in front of his face\./, '') + ' The carriage canopy (critical): it stays whole and on top in every cell — his arm and the fan are always BELOW the canopy roof, raised beside his head in front of the canopy pole, never poking through or above the roof. Wind, whirlwinds and wind blades are pale cyan and white only — NO pink, violet, magenta or rainbow colours anywhere.';
  const ref2 = cart ? '' : `\nReference image 2 is the approved ${kind} sheet of a DIFFERENT rider (Guan Yu, green robe, red horse): follow ONLY its layout, the pose timing of each cell, how high the figures sit and how big the trails are. Copy NOTHING of his face, costume, colours, horse or weapon${cls === 'blade' ? '' : ` — this rider uses his own ${cls === 'sword' ? 'one-handed sword' : cls === 'twin' ? 'two separate weapons, one in each fist' : 'spear'}, handled as described below, not a two-handed polearm`}.`;
  return `Animation pose sheet (sprite sheet) for an HD-2D remake of the 1992 Famicom strategy game "Sangokushi II: Haou no Tairiku" — a ${cart ? 'one-on-one duel fought from a four-wheeled war carriage (no horse in any cell)' : 'mounted one-on-one duel'}: the ${kind === 'spin' ? 'overhead weapon spin before a big blow' : 'all-out high leap and crushing downward strike'}.
Subject: ${look} — exactly as in reference image 1.
${generic ? '' : `Accent colour: ${accent(o)}.\n`}${weaponRule(look)}${cart ? FAN_RULE : ''}
Reference image 1 is the approved FIRST pose sheet of this exact rider: copy his face, costume, ${cart ? 'carriage' : 'horse'}, weapon, pixel scale and rendering precisely.${ref2}

${SHEET_LAYOUT(cart)}

Cells in reading order (left to right, top row first):
${rows.map((r, i) => `${i + 1}. ${r}`).join('\n')}

${notes} Exactly two hands in every cell.`;
}

export function framePrompt(key, sheet = 'a') {
  if (sheet === 'turn') return turnPrompt(key);
  if (sheet === 'wheel') return wheelPrompt(key);
  if (sheet === 'spin' || sheet === 'leap') return spinLeapPrompt(key, sheet);
  const generic = key === 'attacker' || key === 'defender';
  const o = generic ? null : officer(Number(key));
  const cls = generic ? 'blade' : weaponClass(o);
  const look = generic
    ? `a generic ${key === 'attacker' ? 'green-and-silver armoured' : 'crimson-and-gold armoured'} Three Kingdoms general on a ${key === 'attacker' ? 'brown' : 'black'} warhorse, carrying a long glaive (guandao-style polearm) — exactly as in reference image 1`
    : `${ICONIC[o.name] || `${o.name} (Romance of the Three Kingdoms officer), carrying a ${DATA.equipment[o.weapon].name}`} — exactly as in reference image 1`;
  const s = STRIKE[cls], w = SWING[cls];
  const cart = !generic && CARRIAGE.has(o.name);
  const rowsB = cart ? CART.b(w) : [
    'IDLE A (reference): horse standing square on all four hooves, rider upright holding weapon ready — identical to the first cell of the previous sheet',
    'WALK 1: slow four-beat walk, left fore leg reaching forward, right hind leg reaching forward, other two planted; rider calm, weapon upright',
    'WALK 2: walk, all four hooves on the ground, legs passing under the body',
    'WALK 3: walk, right fore leg reaching forward, left hind leg reaching forward, other two planted',
    'WALK 4: walk, all four hooves on the ground, legs passing the other way',
    w.mid, w.late,
    'RECOVER: weapon being brought back up to the ready position after a blow, rider re-centring in the saddle, horse settling its front legs',
    'FEINT READY: a small cocking motion — weapon pulled back only a little, shoulders slightly turned, horse still',
    w.jab,
    'FEINT BACK: weapon snatched straight back to the ready guard, rider already upright again',
    'ALL-IN WIND-UP: the deepest wind-up — rider rising in the stirrups, body arched back, weapon cocked as far back over the rear shoulder as it goes; horse rearing up on its hind legs',
    w.allin,
    'OFF BALANCE: after a missed all-out blow — rider lurching forward over the mane, weapon swung past and down, almost unseated; horse stumbling, one front leg buckled',
    'HIT LIGHT: a small flinch — head and shoulders turned away, weapon arm pulled in, horse flinching but planted',
    'RECOIL STEP: rider recovering his seat after a blow, horse taking a step back with one hind leg reaching back to brace',
  ];
  const rows = sheet === 'c' ? (cart ? CART.c : rowsC)(ALLIN[cls]) : sheet === 'b' ? rowsB : cart ?CART.a(s) : [
    'IDLE A: horse standing square on all four hooves, rider upright holding weapon ready',
    'IDLE B: same as IDLE A but the horse shifts its weight and lifts one front hoof slightly, rider\'s chest and cloak a little raised (breath)',
    'GALLOP 1: canter stride, both front legs reaching forward, hind legs pushing back',
    'GALLOP 2: canter stride, legs gathered under the body, one front hoof planted',
    'GALLOP 3: canter stride, hind legs reaching forward under the belly, front legs pushing back',
    'GALLOP 4: canter stride, extended suspension, legs spread apart',
    s.windup, s.strike, s.follow,
    'HURT: rider jolted backwards in the saddle as if struck in the chest, weapon arm flung out, head thrown back; horse rears its front slightly and steps back',
    'TAUNT: rider brandishes the weapon straight overhead and shouts a challenge, horse prancing with one front leg raised',
    'FALL: rider slipping backwards off the saddle, weapon dropping from his hand, body tilted far back; the horse rears up in panic',
    'DODGE: rider leans far back and away, weapon pulled in close, while the horse skips one step backwards',
    'DOWNED: the rider alone, NO horse — lying on his back on the (invisible) ground, weapon fallen beside him; same costume',
    'RIDERLESS HORSE 1: the same horse alone with an empty saddle, NO rider and NO weapon, galloping with front legs reaching forward',
    'RIDERLESS HORSE 2: the same riderless horse, NO rider, galloping with legs gathered under the body',
  ];
  return `Animation pose sheet (sprite sheet) for an HD-2D remake of the 1992 Famicom strategy game "Sangokushi II: Haou no Tairiku" — a ${cart ? 'one-on-one duel fought from a four-wheeled war carriage (no horse in any cell)' : 'mounted one-on-one duel'}.
Subject: ${look}.
${generic ? '' : `Accent colour: ${accent(o)}.\n`}${weaponRule(look)}${cart ? FAN_RULE : ''}

Layout (critical):
- Landscape canvas 1536x1024 divided into an invisible 4-column × 4-row grid of 16 equal cells (384×256 each). Do NOT draw grid lines, borders, numbers or labels.
- Exactly ONE complete figure per cell, centred in its cell, every figure at the SAME scale and the SAME ground line (${cart ? 'wheels' : 'hooves'} at the same height near the bottom of each cell); nothing crosses into a neighbouring cell, nothing is cropped, keep a clear margin around every figure.
- Every figure faces RIGHT, strict side view, the same character, ${cart ? 'robe, carriage' : 'armour, horse'}, colours and weapon in all 16 cells — only the pose changes. Never mirror a cell.
- Background: one perfectly flat solid magenta (#FF00FF) everywhere — no ground, no shadow, no scenery, no text. No magenta or pink on the figures.
- Detailed 16-bit SNES/Octopath-style pixel art: crisp pixel clusters, dark outlines, 3-tone shading, light coming from the upper left in every cell.

${sheet === 'b' ? 'This is the SECOND sheet of the same rider: the scale, ground line, rendering and colours must match reference image 1 exactly.\n' : sheet === 'c' ? 'This is the THIRD sheet of the same rider: the scale, ground line, rendering and colours must match reference image 1 exactly. Exceptions to the shared ground line: the LEAP and SMEAR cells are airborne (' + (cart ? 'wheels' : 'hooves') + ' clearly above the ground line), the THROWN man is high in the air, and the WEAPON ALONE lies across the middle of its cell. Cells that show the man, the ' + (cart ? 'carriage' : 'horse') + ' or the weapon ALONE must show ONLY that part, at the same scale as in the mounted cells. Everything he wears — helmet, plume, cloak, and any banner on his back — stays on him in every cell where he appears, mounted or alone.\n' : ''}Cells in reading order (left to right, top row first):
${rows.map((r, i) => `${i + 1}. ${r}`).join('\n')}

${sheet === 'b' || sheet === 'c' ? 'Reference image 1 is the approved FIRST pose sheet of this exact rider and horse: copy his face, costume, horse, weapon, pixel scale and rendering precisely.' : 'Reference image 1 is the approved single battle sprite of this exact rider and horse: copy his face, costume, horse and weapon precisely and keep its pixel-art rendering style.'} ${generic ? '' : 'Reference image 2 is his approved portrait for the face.'}
Make the poses strongly readable in silhouette: the weapon, the rider's upper body and the ${cart ? "carriage's tilt and wheel spokes" : "horse's legs"} must clearly change between cells.`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const flag = ['turn', 'wheel', 'spin', 'leap', 'b', 'c'].find((f) => process.argv.includes(`--${f}`));
  process.stdout.write(framePrompt(process.argv[2], flag || 'a'));
}
