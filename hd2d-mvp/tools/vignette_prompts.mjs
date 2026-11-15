// Prompt source for the 命令演出 vignettes (the framed picture the original plays when a 命令书 is
// spent; see src/vignette.js). Each scene is a still background plus cut-out layers (an actor's 2-pose
// loop, a prop) generated with GPT image through Codex, then keyed and reduced by build_vignettes.py.
//   node hd2d-mvp/tools/vignette_prompts.mjs <scene> <layer>   → prints the prompt
//   node hd2d-mvp/tools/vignette_prompts.mjs --list             → "scene layer" per line
// References handed to each call (gen_vignette_codex.sh resolves them):
//   title  — assets/ai/title.webp, the approved HD-2D key art (style anchor for backgrounds)
//   sprite — assets/ai/sprites/source/attacker-soldier.webp (pixel rendering anchor for figures)
//   fc:<f> — reference-assets/graphics/vignettes/<f>.png, the original FC frame (composition only)
//   layer:<name> — an already generated layer of the same scene (identity / framing anchor)
import { fileURLToPath } from 'node:url';

const ERA = 'Eastern Han dynasty China, c. 190 AD (Romance of the Three Kingdoms)';
const BG_STYLE = `Style (critical): match reference image 1 exactly — HD-2D diorama look as in Octopath Traveler / Triangle Strategy: detailed 16-bit pixel-art textures with crisp pixel clusters, the lighting the scene describes (warm sunlight where none is given), soft bloom, slight tilt-shift depth of field at the very top and bottom edges, rich but natural colours. Not painterly, not photographic, not anime cel.`;
const BG_FORMAT = `Format: landscape 3:2 canvas (1536x1024). A single continuous scene filling the whole canvas edge to edge — no border, no frame, no vignette darkening, no text, no UI, no signature.`;
const CUT = (key) => `Format (critical): one single subject, whole and uncropped, centred, filling about 80% of the canvas height on a square 1024x1024 canvas. Background: one perfectly flat solid ${key === 'green' ? 'pure green (#00FF00)' : 'magenta (#FF00FF)'} everywhere around the subject — no ground, no shadow, no gradient, no scenery, no text. Do not use ${key === 'green' ? 'green' : 'magenta or pink'} anywhere on the subject.
Rendering: detailed 16-bit SNES/Octopath-style pixel art with crisp pixel clusters, dark outlines and 3-tone shading, lit from the upper left by warm sunlight; no anti-aliased painterly blur.`;

// Shared templates: a background plate with the middle left clear, and a figure in two loop poses.
const plate = (what, scene, open, fc) => ({ refs: fc ? ['title', `fc:${fc}`] : ['title'], prompt: `Background plate for a small framed cut-scene in an HD-2D remake of the 1992 Famicom game "Sangokushi II: Haou no Tairiku" — the picture shown when the player orders ${what}.
Scene: ${ERA}. ${scene}
${open}${/NO people/.test(open) ? '' : ' NO people or animals in the picture.'}
${fc ? 'Reference image 2 is the original 8-bit frame of this scene: follow its composition but not its palette or resolution.\n' : ''}${BG_STYLE}
${BG_FORMAT}` });
const pose0 = (subject, pose, fc) => ({ key: 'magenta', refs: ['sprite', ...(fc ? [`fc:${fc}`] : []), 'layer:bg'], prompt: `Cut-out figure for the same cut-scene (reference image ${fc ? 3 : 2} is its background; match its light and palette).
Subject: ${subject}
Pose: ${pose}${fc ? ' (reference image 2 shows this pose in the original 8-bit frame)' : ''}.
Full figure, nothing cropped.
${CUT('magenta')}
Reference image 1 is an approved sprite of a different character: match ONLY its pixel-art rendering style and proportions, not its costume.` });
const pose1 = (pose, fc) => ({ key: 'magenta', refs: ['layer:actor-0', ...(fc ? [`fc:${fc}`] : [])], prompt: `Second animation pose of the SAME subject as reference image 1 — identical face, hair, clothing, colours, props, size, outline weight and pixel-art style, as if it were the next frame of a sprite sheet.
Pose: ${pose}${fc ? ' (reference image 2 shows this pose in the original 8-bit frame)' : ''}. Same facing and same foot positions as reference image 1, so the two frames line up when they alternate.
Full figure, nothing cropped; keep the same scale as reference image 1 (same head size).
${CUT('magenta')}` });
const OPEN = 'Leave the middle of the picture, roughly the centre third down to the ground, clear: a figure will be composited standing there.';
const loop = (hold = [0.42, 0.3]) => ({ frames: ['actor-0', 'actor-1'], hold });

export const SCENES = {
  // 开发·土地 (FC: 沼を埋めたて農地に — a labourer hacks at a marsh by a cliff, two poses).
  land: {
    loop: { frames: ['actor-0', 'actor-1'], hold: [0.42, 0.3] },
    layers: {
      bg: { refs: ['title', 'fc:land-0'], prompt: `Background plate for a small framed cut-scene in an HD-2D remake of the 1992 Famicom game "Sangokushi II: Haou no Tairiku" — the picture shown when the player orders land reclamation.
Scene: ${ERA}. A shallow reed marsh at the foot of an ochre earthen cliff that slopes down from the upper left, being filled in to make new farmland. Calm shallow water with sunlit ripples covers the lower two-thirds; clods of fresh dark earth and a few stones break the surface across the left foreground; on the right foreground a short row of bound wooden stakes and woven reed bundles marks the new dyke; a strip of already-reclaimed field with young green shoots on the far bank; clear sky with a few soft clouds above the cliff.
Leave the centre of the picture open, roughly the middle third, with only water there: a labourer will be composited standing in the water at the centre. NO people, animals or tools anywhere in the picture.
Reference image 2 is the original 8-bit frame of this scene: follow its composition (cliff upper left, water, clods left, stakes lower right, sky) but not its palette or resolution.
${BG_STYLE}
${BG_FORMAT}` },
      'actor-0': { key: 'magenta', refs: ['sprite', 'fc:land-0', 'layer:bg'], prompt: `Cut-out figure for the same cut-scene (reference image 3 is its background; match its light and palette).
Subject: a sturdy Han-dynasty peasant labourer, shirtless and sunburnt, dark green knee-length trousers rolled up, green cloth headband over tied-up black hair, barefoot. He stands facing the viewer three-quarters to the right, legs apart, and swings a long wooden-handled iron hoe raised high above his head with both hands, about to strike — the top of the swing (reference image 2 shows this pose in the original 8-bit frame).
Full body from head to bare feet, nothing cropped.
${CUT('magenta')}
Reference image 1 is an approved sprite of a different character: match ONLY its pixel-art rendering style and proportions, not its costume.` },
      'actor-1': { key: 'magenta', refs: ['layer:actor-0', 'fc:land-1'], prompt: `Second animation pose of the SAME character as reference image 1 — identical face, headband, hair, trousers, skin tone, hoe, size, outline weight and pixel-art style, as if it were the next frame of a sprite sheet.
Pose: the downstroke — he bends forward from the hips, arms extended down and forward, the hoe blade driven into the mud just in front of his feet at the lower right (reference image 2 shows this pose in the original 8-bit frame). Same facing and same foot positions as reference image 1, so the two frames line up when they alternate.
Full body from head to bare feet, nothing cropped; keep the figure the same scale as reference image 1 (same head size).
${CUT('magenta')}` },
    },
  },
  // 开发·产业 (FC: over the shoulder of a miner driving a chisel into a cave wall, two poses).
  industry: { loop: loop([0.4, 0.28]), layers: {
    bg: plate('industry to be developed (mining)', 'Inside a mine gallery cut into reddish rock: a rich seam of copper and iron ore glints on the rock face to the right; timber props, an oil lamp hung on a peg throwing warm flickering light, a wooden ore cart with a heap of ore at the lower left; the tunnel recedes into darkness on the left.', OPEN, 'industry-0'),
    'actor-0': pose0('a Han-dynasty miner in a short brown work tunic and leggings, cloth cap, sleeves rolled up, seen from behind three-quarter facing right toward the rock face; an iron chisel in his left hand set against the rock, a heavy wooden mallet in his right.', 'the mallet drawn back high over his shoulder, about to strike the chisel', 'industry-0'),
    'actor-1': pose1('the mallet driven forward onto the head of the chisel at the rock face, his body leaning into the blow', 'industry-1'),
  } },
  // 开发·人口 (FC: townsfolk gathered on a busy street before a tiled-roof hall).
  pop: { loop: loop([0.6, 0.45]), layers: {
    bg: plate('the town to grow (population)', 'A lively market-town street on a bright morning: new houses with grey tiled roofs and white plaster walls, red lattice windows, a large two-storey tiled-roof hall at the back; a few tiny distant townsfolk, lanterns and shop banners along the street; packed-earth road in the foreground.', OPEN, 'pop'),
    'actor-0': pose0('a cheerful young townswoman in a simple Han-dynasty robe (pale rose with a darker sash), hair in a bun, holding a small child on her left hip; standing facing the viewer three-quarter right.', 'raising her right hand high in a friendly wave of welcome', 'pop'),
    'actor-1': pose1('her right hand lowered to shoulder height mid-wave, head tilted, the child turning to look'),
  } },
  // 防灾 (the original reuses the 土地 digger; here a worker raises the dyke against the river).
  disaster: { loop: loop([0.5, 0.35]), layers: {
    bg: plate('flood defences to be built', 'A high earthen dyke along a swollen brown river under a grey, rainy summer sky; the river fills the upper right, lapping at the dyke; on top of the dyke, rows of straw-wrapped earth bags and driven wooden stakes; a flat strip of dyke-top path runs across the foreground.', OPEN),
    'actor-0': pose0('a Han-dynasty labourer in a straw rain cape over a short tunic, conical straw hat, straw sandals; facing right.', 'carrying a heavy straw-wrapped earth bag on his right shoulder, stepping forward'),
    'actor-1': pose1('bending forward and heaving the bag down off his shoulder onto the stack in front of him'),
  } },
  // 征兵 (new recruits drill at the training ground).
  conscript: { loop: loop([0.45, 0.3]), layers: {
    bg: plate('troops to be raised', 'A packed-earth drill ground outside a city wall at noon: tall war banners in red with black edging on poles, a wooden weapon rack of spears and halberds, a drum on a stand, straw training dummies; the grey city wall and a gate tower behind.', OPEN),
    'actor-0': pose0('a young Han-dynasty recruit in a red tunic with a leather lamellar vest, red headscarf, leg wraps; holding a long spear with both hands; facing right.', 'on guard, spear held level at waist height, weight on the back foot'),
    'actor-1': pose1('a lunging thrust, front knee bent, spear driven forward at full reach'),
  } },
  // 运输 (a supply cart on the road between castles); 移动 has its own (march).
  move: { loop: loop([0.32, 0.32]), layers: {
    bg: plate('officers or supplies to travel to another castle', 'A dirt road winding through green farmland and willow trees toward the walls of a distant castle on the horizon; soft afternoon light; the road crosses the foreground from left to right.', 'Leave the middle of the road in the foreground clear: an ox cart will be composited travelling along it. NO people, animals or carts in the picture.'),
    'actor-0': pose0('a two-wheeled wooden Han-dynasty ox cart loaded with rice sacks and a bound chest, pulled by a brown ox and driven by a carter in a straw hat walking beside the ox with a switch; the whole cart travelling to the RIGHT, seen from the side.', 'mid-stride: the ox with its near foreleg forward, the carter with his near leg forward'),
    'actor-1': pose1('the next step: the ox with its near foreleg back and far foreleg forward, the carter with his other leg forward, the cart wheel turned slightly'),
  } },
  // 移动 (an officer rides to his new post, his standard-bearer on foot beside him); playtest of 2026-10-30, T12.
  march: { loop: loop([0.3, 0.3]), layers: {
    bg: plate('an officer to move to another castle', 'A broad stone-paved post road between poplar trees running from the left foreground toward a great walled castle with a three-storey gate tower on the right horizon; a wooden waystation pavilion with a red pennant by the road; fresh spring morning light, a few soft clouds.', 'Leave the road in the middle of the picture clear: a rider will be composited travelling along it. NO people, animals or carts in the picture.'),
    'actor-0': pose0('a Han-dynasty officer in a dark red robe over lamellar armour and a black official cap, riding a chestnut horse at a walk to the RIGHT, seen from the side; beside the horse on the far side walks a standard-bearer in a grey tunic carrying a tall pole with a rectangular red war banner (the banner and pole inside the canvas). Horse, rider and bearer together are one subject.', 'the horse mid-stride with its near foreleg raised, the bearer with his near leg forward, the banner streaming back'),
    'actor-1': pose1('the next step: the horse with its near foreleg down and far foreleg raised, the bearer with his other leg forward, the banner fluttering the other way'),
  } },
  // 搜索 (a traveller searches the hills at dusk); 侦察 has its own (scout).
  search: { loop: loop([0.38, 0.38]), layers: {
    bg: plate('a search for talent or a scouting mission', 'Rolling hills at dusk on the edge of a village: a narrow footpath, tall grass, a stone marker, distant thatched farmhouses with lit windows, the first stars in a deep violet-orange sky, a castle silhouette on a far ridge.', OPEN),
    'actor-0': pose0('a Han-dynasty traveller in a dark blue travelling robe and wide straw hat, a cloth bundle on his back, a walking staff in his right hand and a small lit paper lantern in his left; walking to the right.', 'mid-stride with the left leg forward'),
    'actor-1': pose1('the next step, right leg forward, lantern swinging slightly'),
  } },
  // 侦察 (a scout on a ridge spies out an enemy castle at dawn); playtest of 2026-10-30, T12.
  scout: { loop: loop([0.6, 0.45]), layers: {
    bg: plate('a scouting mission against an enemy castle', 'Dawn on a rocky pine-covered ridge: in the foreground a ledge of grey boulders and twisted pines; below, across a misty river valley, an enemy walled castle flying many black-edged red banners, smoke rising from its kitchen fires, tents of an army camped outside its gate; cold blue-grey mist in the valley, the rising sun warm gold behind the far hills.', 'Leave the boulders in the middle of the foreground clear: a scout will be composited crouching on them. NO people or animals in the picture.'),
    'actor-0': pose0('a lean Han-dynasty scout in a dark brown hooded short coat, leg wraps and straw sandals, a short sword at his hip and a coil of rope on his shoulder; crouching low on one knee, seen from the side facing RIGHT.', 'crouched low, shading his eyes with his right hand, peering into the distance'),
    'actor-1': pose1('still crouched in the same place, now writing quickly on a small bamboo slip held in his left hand with a brush in his right, glancing up'),
  } },
  // 施舍 (rice gruel ladled out to the people at the city gate); 赏赐 has its own (reward). Playtest of 2026-10-30, T12.
  alms: { loop: loop([0.5, 0.4]), layers: {
    bg: plate('relief to be given to the people', 'Outside the gate of a Han-dynasty county town in early winter: the grey brick city gate and wall behind, a simple relief shelter of bamboo poles and straw matting, a few empty clay bowls stacked on a low wooden bench, sacks of rice piled against the wall, thin smoke, pale overcast light with a touch of warm sun.', OPEN),
    'actor-0': pose0('a kindly Han-dynasty official in a dark blue robe with the sleeves tied back and a black official cap, standing behind a large round black iron cauldron of steaming white rice gruel on a stone-ringed fire (include the cauldron, fire and steam in the cut-out, in front of him); a long wooden ladle in his right hand; facing the viewer three-quarters to the right.', 'dipping the ladle into the gruel, looking down into the cauldron'),
    'actor-1': pose1('lifting the full ladle out of the cauldron and holding it out to the right as if pouring into a bowl, smiling; the cauldron, fire and steam exactly where they are in reference image 1'),
  } },
  // 赏赐 (gold is presented in the hall).
  reward: { loop: loop([0.55, 0.4]), layers: {
    bg: plate('a reward or gift to be given', 'The audience hall of a Han-dynasty governor: red lacquered pillars, a raised dais with a carved screen and a vacant seat at the back, hanging silk banners, polished stone floor reflecting warm lamplight.', OPEN),
    'actor-0': pose0('a Han-dynasty court official in a dark green robe and black official cap, holding a red lacquered tray piled with gold ingots and coins; facing right.', 'kneeling on one knee, head bowed, the tray held at chest height'),
    'actor-1': pose1('still kneeling, lifting the tray high above his head in offering, looking up'),
  } },
  // 买米 / 卖米 / 卖宝 (a merchant weighs rice at his stall).
  market: { loop: loop([0.5, 0.5]), layers: {
    bg: plate('trade at the market', 'A busy rice market under awnings: stalls piled with rice sacks and baskets of grain, strings of bronze coins hanging, shop signs and cloth awnings in faded red and ochre, a narrow street receding behind.', OPEN),
    'actor-0': pose0('a plump Han-dynasty merchant in an ochre robe and a small cloth cap, holding up a large wooden steelyard balance with a basket of rice hanging on one end and a bronze weight on the other; facing the viewer.', 'the balance tipped down on the rice side, the merchant peering at the beam'),
    'actor-1': pose1('the balance level, the merchant smiling and raising his free hand'),
  } },
  // 四月税金 (month event, not a command): a clerk tallies the tax coin at the granary gate.
  tax: { loop: loop([0.5, 0.42]), layers: {
    bg: plate('the April tax collection', 'Spring in front of a Han-dynasty county treasury: a gate of red-lacquered pillars under a grey tile roof, iron-bound wooden chests and strings of bronze coins stacked on a low trestle, a bamboo ledger and an ink stone, peach blossom on a branch above the wall, clear morning light.', OPEN),
    'actor-0': pose0('a Han-dynasty county clerk in a dark green official robe and a black gauze cap, a writing brush in his right hand and an open bamboo-slip ledger in his left; standing facing right beside the coin chests.', 'writing a tally into the ledger, head bent'),
    'actor-1': pose1('looking up and lifting a long string of bronze coins in his brush hand to count it, ledger still held'),
  } },
  // 十月收米 (month event): a farmer reaps the ripe rice in an autumn field.
  harvest: { loop: loop([0.42, 0.32]), layers: {
    bg: plate('the October rice harvest', 'An autumn paddy field at golden hour: rows of ripe golden rice bending heavy-headed, sheaves stacked on wooden drying racks, a thatched farmhouse and red-leaved trees behind, a low warm sun and long shadows.', OPEN),
    'actor-0': pose0('a Han-dynasty farmer in a faded indigo short jacket and rolled trousers, a conical straw hat, a bronze sickle in his right hand; standing in the rice facing right.', 'bent forward, the left hand gathering a bunch of rice stalks, the sickle drawn back ready to cut'),
    'actor-1': pose1('the cut — the sickle swept through the stalks, the cut sheaf lifted in his left hand'),
  } },
  // 病院 (a physician grinds herbs; a pot steams on the brazier).
  hospital: { loop: loop([0.4, 0.35]), layers: {
    bg: plate('treatment at the physician\'s house', 'Inside a Han-dynasty physician\'s house: a tall wooden cabinet of many small herb drawers, bundles of dried herbs hanging from the beams, a clay pot steaming on a charcoal brazier at the right, a low table with bowls; warm window light.', OPEN),
    'actor-0': pose0('an elderly Han-dynasty physician with a long white beard in a light grey robe and a black cap, standing at a waist-high stone mortar, a pestle in both hands; facing right.', 'the pestle raised above the mortar'),
    'actor-1': pose1('the pestle pressed down into the mortar, grinding'),
  } },
  // 学问所 (a scholar studies the bamboo slips).
  school: { loop: loop([0.9, 0.5]), layers: {
    bg: plate('study at the academy', 'A quiet study hall: shelves of rolled bamboo-slip books and silk scrolls, a low writing desk, an oil lamp, a round lattice window with plum blossom outside, late afternoon sunlight falling across the floor.', OPEN),
    'actor-0': pose0('a young Han-dynasty officer in a blue scholar\'s robe and black topknot cap, holding an unrolled bamboo-slip book in both hands; standing facing right.', 'reading the bamboo book held at chest height, head bent over it'),
    'actor-1': pose1('looking up from the book in sudden understanding, one hand lifted with a finger raised'),
  } },
  // 武器屋 (the smith hammers a blade at the forge).
  weapons: { loop: loop([0.36, 0.26]), layers: {
    bg: plate('arms from the weapon shop', 'A Han-dynasty smithy: a glowing charcoal forge with bellows at the left, an iron anvil on a tree stump in the middle ground, racks of spears, halberds and swords on the walls, a quench tub; orange forge light against a dark interior.', OPEN),
    'actor-0': pose0('a muscular Han-dynasty blacksmith in a leather apron over bare arms, cloth headband, standing to the left of a black iron anvil set on a squat tree-stump block (include the anvil and stump in the cut-out, in front of him to the right); with tongs in his left hand he holds a glowing orange-red sword blade flat on the anvil, a heavy hammer in his right; facing right.', 'the hammer raised high over his shoulder, about to strike the blade on the anvil'),
    'actor-1': pose1('the hammer brought down onto the glowing blade on the anvil; the anvil, stump and tongs exactly where they are in reference image 1'),
  } },
  // 同盟 / 引拔 / 离间 (an envoy rides out with a sealed letter).
  envoy: { loop: loop([0.24, 0.24]), layers: {
    bg: plate('a diplomatic mission', 'A wide grassy plain at sunset with a straight road toward the walls of a foreign capital on the horizon; long golden light, scattered pines, a waystation post by the road.', 'Leave the road in the middle of the picture clear: a rider will be composited galloping along it. NO people or animals in the picture.'),
    'actor-0': pose0('a Han-dynasty envoy in a red travelling robe and black cap riding a chestnut horse, a lacquered letter case slung across his back and a small pennant on a pole; galloping to the RIGHT, seen from the side.', 'gallop phase with the horse\'s legs gathered under its body'),
    'actor-1': pose1('gallop phase with the horse\'s legs fully stretched out front and back'),
  } },
  // AI 间战争 (FC: 「××軍　出陣」 — a general with a halberd and a rider behind him gallop out through dust under a red sky).
  sortie: { loop: loop([0.24, 0.24]), layers: {
    bg: plate('an army marching out to war (shown while another faction attacks a city)', 'A wide battlefield plain under a dramatic crimson-and-orange evening sky streaked with long clouds, low dust drifting across the ground, a ridge of dark hills behind with the silhouettes of war banners and a distant fortress on the right; the foreground is open trampled earth.', 'Leave the middle of the picture, from the centre down to the ground, clear: two riders will be composited galloping across it. NO people or animals in the picture.', 'sortie'),
    'actor-0': pose0('two Han-dynasty cavalrymen galloping to the RIGHT side by side, seen from the side: in front a general in lamellar armour and a red-plumed helmet on a dark bay warhorse, holding a long ji halberd raised forward; a little behind and to the left a rider in a leather cap with a spear and a small red pennant. Dust kicked up under the hooves.', 'gallop phase with the horses\' legs gathered under their bodies, the halberd held high', 'sortie'),
    'actor-1': pose1('gallop phase with both horses\' legs fully stretched out front and back, the halberd levelled forward'),
  } },
  // 旱灾 / 洪水 (src/app.js showEvent 'disaster'): the struck land itself, shown while the message tells who was hit.
  drought: { loop: loop([0.6, 0.45]), layers: {
    bg: plate('no command: it is the event picture shown when a drought strikes a province', 'A parched farming valley at midday in a summer drought: a fierce white sun high in a pale, hazy, colourless sky; terraced paddy fields cracked into deep polygonal plates of dry grey-brown mud, rice stalks withered yellow and flattened; a dry irrigation ditch with a stranded wooden water wheel; a few leafless trees and a thatched farmhouse in the distance shimmering in the heat haze; harsh short shadows.', OPEN),
    'actor-0': pose0('a gaunt Han-dynasty farmer in a faded, patched hemp tunic and rolled-up trousers, conical straw hat pushed back, barefoot; an empty wooden water bucket on a carrying pole lies at his feet; facing the viewer three-quarter right.', 'standing and shading his eyes with his right hand, squinting up at the burning sky, his left hand hanging limp'),
    'actor-1': pose1('sunk down on one knee, his right hand scooping up a fistful of dry cracked earth that crumbles through his fingers, his head bowed'),
  } },
  flood: { loop: loop([0.5, 0.4]), layers: {
    bg: plate('no command: it is the event picture shown when a flood strikes a province', 'A riverside market town drowned by a flood under a dark slate storm sky with slanting rain: muddy brown water swirling up to the window sills of white-walled, grey-tiled houses; a broken earthen dyke in the distance where the swollen river pours through; floating baskets, planks and a capsized sampan; a stone bridge half under water on the right; the foreground is open flood water.', OPEN),
    'actor-0': pose0('a Han-dynasty villager in a soaked short tunic and straw rain cape, conical straw hat, wading waist-deep in muddy flood water (the water line is a flat cut across his waist; nothing below it is visible); facing RIGHT.', 'holding a bundled cloth sack of belongings high over his head with both hands, pushing forward through the water'),
    // pose1's "full figure" drew him with legs; this one keeps reference image 1's flat cut at the waist
    'actor-1': { key: 'magenta', refs: ['layer:actor-0'], prompt: `Second animation pose of the SAME subject as reference image 1 — identical face, straw hat, straw rain cape, tunic, sack, colours, size, outline weight and pixel-art style, as if it were the next frame of a sprite sheet.
Pose: the sack lowered onto his right shoulder, his left arm thrown out for balance against the current, leaning forward a little.
He is wading waist-deep exactly as in reference image 1: the figure ENDS in a perfectly flat horizontal cut at the waist, at the same height on his body as in reference image 1 — NO hips, legs or feet anywhere; nothing at all below the waist line. Same facing and same horizontal position as reference image 1, so the two frames line up when they alternate.
Keep the same scale as reference image 1 (same head size).
${CUT('magenta')}` },
  } },
  // 城·记录 (FC: a scroll rolls open and red characters are written onto it). The writing itself is
  // the date set in the game's calligraphy font by the player; the art supplies scroll and brush.
  record: {
    layers: {
      bg: { refs: ['title', 'fc:record'], prompt: `Background plate for a small framed cut-scene in an HD-2D remake of the 1992 Famicom game "Sangokushi II: Haou no Tairiku" — the picture shown when the player records (saves) the chronicle.
Scene: ${ERA}. Seen from slightly above, a long cream-coloured paper scroll lies unrolled diagonally across a dark lacquered wooden writing table, running from the upper left toward the lower right, where its heavy wooden roller with red-brown silk wrapping and turned end-caps rests. The open paper is completely BLANK — no writing, no characters, no marks — with a faint warm sheen and soft shadow under its edges. At the left edge of the table: an ink stone with a little red cinnabar ink and a brush rest. Warm candlelight from the upper right; the background beyond the table falls off into deep shadow.
The blank paper must occupy a wide band through the centre of the picture (red text will be written onto it later).
Reference image 2 is the original 8-bit frame of this scene: follow its composition (diagonal scroll, roller lower right, dark background) but not its palette or resolution.
${BG_STYLE}
${BG_FORMAT}` },
      brush: { key: 'magenta', refs: ['sprite', 'layer:bg'], prompt: `Cut-out prop for the same cut-scene (reference image 2 is its background; match its light).
Subject: a single Chinese calligraphy brush held upright in writing position — a slim bamboo handle with a small hanging loop at the top, a full soft tip loaded with glossy red cinnabar ink, a single drop forming at the tip. Seen at a slight angle, tip pointing down.
${CUT('magenta')}
Reference image 1 is an approved sprite of a different subject: match ONLY its pixel-art rendering style.` },
    },
  },

  // ---------- 计略演出 (war-map strategies; src/warview.js STRAT_SCENE plays one per 计略, each its own) ----------
  // 火计: a soldier hurls a torch into the enemy's dry camp (code-side flames on top).
  'st-fire': { loop: loop([0.4, 0.28]), layers: {
    bg: plate('a fire attack (火計) on the enemy', 'Dry autumn grassland at dusk below a pine-wooded slope; an enemy field camp of canvas tents and a wooden palisade fills the right half, war banners hanging limp; tall dry reeds and straw bundles in the foreground; a hazy orange evening sky.', OPEN),
    'actor-0': pose0('a Han-dynasty foot soldier in a short red tunic over leather lamellar armour, red headscarf, leggings and straw sandals, a flaming pitch torch in his right hand; facing RIGHT, seen from the side three-quarter.', 'leaning back with the burning torch drawn far behind his head, about to throw it'),
    'actor-1': pose1('the throw released: arm flung forward toward the right, body lunging forward over the front foot, the hand now empty'),
  } },
  // 水攻: sappers break a dyke and the river floods the low ground.
  'st-water': { loop: loop([0.45, 0.32]), layers: {
    bg: plate('a flood attack (水攻) on the enemy', 'A swollen river held back by an earthen dyke of piled earth bags and timber that runs across the middle of the picture; on the low right side of the dyke, the enemy camp sits on a flat plain; grey storm clouds and a cold blue light; spray where water already seeps through a gap in the dyke.', OPEN),
    'actor-0': pose0('a Han-dynasty sapper in a straw rain cape over a short blue tunic, conical straw hat, bare legs and straw sandals, swinging a long-handled iron mattock; facing right.', 'mattock raised high over his shoulder, about to strike the dyke'),
    'actor-1': pose1('the downstroke: bent forward, the mattock blade driven down into the dyke in front of his feet'),
  } },
  // 要击: ambushers burst out of cover.
  'st-ambush': { loop: loop([0.35, 0.3]), layers: {
    bg: plate('an ambush (伏兵) on the enemy', 'A narrow forest road in a dim pine wood, morning mist between the trunks; thick undergrowth and ferns on both sides where many spear tips and the tops of war banners just show above the bushes; dappled sunlight on the packed-earth road.', OPEN),
    'actor-0': pose0('a Han-dynasty ambush soldier in a dark green tunic over leather armour, green headscarf, leggings and sandals, gripping a long spear in both hands; facing RIGHT.', 'crouched low, spear held back, about to spring forward'),
    'actor-1': pose1('the charge: leaping forward with a war cry, the spear thrust out level toward the right'),
  } },
  // 落石: boulders are levered over the edge of a cliff onto the road below.
  'st-rock': { loop: loop([0.5, 0.3]), layers: {
    bg: plate('a rockfall (落石) on the enemy', 'The top edge of a high rocky cliff above a mountain pass; the ground on top is rough grey stone with a few twisted pines; far below on the right the narrow pass and a column of tiny enemy soldiers; clear cold mountain air and distant blue ridges.', OPEN),
    'actor-0': pose0('a brawny Han-dynasty soldier in a brown short tunic and leather vest, headscarf, leggings and sandals, both hands against a large round grey boulder beside him on his right; facing right.', 'leaning his whole weight into the boulder, straining, the boulder still on the cliff edge'),
    'actor-1': pose1('the boulder has gone over: he stumbles forward with arms outstretched, the boulder no longer there'),
  } },
  // 虚兵: a strategist works his ruse with a feather fan.
  'st-ruse': { loop: loop([0.7, 0.5]), layers: {
    bg: plate('a ruse (計略) against the enemy', 'Inside a commander\'s field tent at night: a low lacquered table with an unrolled map of rivers and roads, command tallies and a brazier glowing; the tent flap open on the right onto a dark camp with distant watch fires and banners.', OPEN),
    'actor-0': pose0('a Han-dynasty strategist in a pale blue-grey scholar\'s robe with wide sleeves and a black gauze cap, a long thin beard, a white crane-feather fan in his right hand; facing right three-quarter.', 'standing calmly, the feather fan held before his chest'),
    'actor-1': pose1('the fan swept out toward the right in a commanding gesture, his other hand behind his back'),
  } },
  // 连弩: a crossbow line shoots a volley.
  'st-bow': { loop: loop([0.4, 0.22]), layers: {
    bg: plate('a crossbow volley (連弩) at the enemy', 'Behind a line of sharpened wooden stakes and wicker shields on a low earthen rampart at midday; a dusty plain beyond with an enemy line far off on the right; banners, a drum on a stand, quivers of bolts stacked by the shields.', OPEN),
    'actor-0': pose0('a Han-dynasty crossbowman in lamellar armour and a red-tasselled iron helmet, aiming a large repeating crossbow with a bolt magazine on top; facing RIGHT, kneeling on one knee.', 'aiming along the crossbow, cheek to the stock, steady'),
    'actor-1': pose1('the instant of the shot: the crossbow kicks upward and he rocks back on his heel'),
  } },
  // 奇门遁甲: the strategist calls up the eight-gate array.
  'st-magic': { loop: loop([0.6, 0.45]), layers: {
    bg: plate('the 奇門遁甲 eight-gate array', 'A windswept hilltop altar at night under swirling clouds and a pale moon: a square earthen platform with eight standing stones in a ring, coloured banners of the eight trigrams snapping in the wind, incense smoke whipped sideways, the dark plain and the enemy\'s distant fires below.', OPEN),
    'actor-0': pose0('a Han-dynasty Taoist strategist in a long dark purple robe embroidered with the eight trigrams, hair bound under a black crown, a long sword in his right hand and a paper talisman in his left; facing right three-quarter.', 'sword held upright before his face, eyes closed, chanting'),
    'actor-1': pose1('the sword thrust up to the sky and the talisman flung out toward the right, robes billowing'),
  } },

  // 陷阱: a pit trap on a mountain path; the trapper springs it with a rope.
  'st-trap': { loop: loop([0.5, 0.26]), layers: {
    bg: plate('a pit trap (陷阱) for the enemy', 'A rocky mountain path climbing between boulders and scrub pines in grey morning light; in the right half of the path a wide covered pit, its lid of thin branches and loose earth just starting to cave in, sharpened bamboo stakes showing through the gap; a tripped log and a taut rope run from it toward the left of the picture.', OPEN),
    'actor-0': pose0('a lean Han-dynasty trapper soldier in a brown hooded short tunic and leather bracers, leggings and straw sandals, both hands gripping a thick hemp rope that runs off to the right; facing RIGHT, crouched behind cover.', 'crouched low and still, the rope held slack, waiting'),
    'actor-1': pose1('heaving the rope back with his whole body, leaning back on his heels, the rope pulled taut toward the right'),
  } },
  // 乱水: a raider in the rapids overturns the enemy's rafts.
  'st-rapids': { loop: loop([0.38, 0.3]), layers: {
    bg: plate('a river raid (乱水) on the enemy', 'A fast narrow river between steep wooded banks in a grey green gorge; white rapids and churning foam across the middle of the picture; on the right, the enemy\'s lashed bamboo rafts tipping in the current, spilling spears, shields and grain sacks into the water; spray hanging in the air.', 'Leave the left-centre of the picture clear down to the water: a figure will be composited standing there, waist-deep in the rapids.'),
    'actor-0': pose0('a Han-dynasty river raider, bare-chested and wiry, a dark blue headband, rope wound round his waist, wet cropped trousers, gripping a long bamboo boat pole with an iron hook in both hands; facing RIGHT; drawn from the thighs up as if standing in water, the lower edge of the figure a flat waterline.', 'the hooked pole drawn back over his shoulder, about to strike'),
    'actor-1': pose1('lunging forward, the hooked pole thrust out to the right and hauling down hard, as if catching and tipping a raft. Like reference image 1, draw him from the thighs up only, the figure ending in the SAME flat horizontal waterline at mid-thigh: no knees, no shins, no feet'),
  } },
  // 火箭: fire arrows rain on the enemy's grain wagons.
  'st-firearrow': { loop: loop([0.45, 0.22]), layers: {
    bg: plate('a fire-arrow attack (火箭) on the enemy supplies', 'Early night on a broad plain: on the right half of the picture the enemy\'s supply train of heavy ox wagons piled with straw-wrapped rice bales and grain sacks, a few already smouldering; a dark blue sky with the last red glow of sunset on the horizon, faint stars, a low earth bank in the foreground.', OPEN),
    'actor-0': pose0('a Han-dynasty archer in a dark red tunic over lamellar armour and a leather cap, drawing a long composite bow with an arrow whose head is wrapped in burning oil-soaked cloth; facing RIGHT, aiming high into the sky.', 'the bow at full draw, the burning arrow pointing up to the right'),
    'actor-1': pose1('the instant after the release: bow arm still extended, string hand snapped back past his ear, the arrow gone'),
  } },
  // 伪击转杀: a feint at the gate, then the real blow — a disguised raider fires the castle from within.
  'st-feint': { loop: loop([0.45, 0.3]), layers: {
    bg: plate('a feint-and-strike (伪击转杀) on an enemy castle', 'Night at the foot of a Han-dynasty castle: a high rammed-earth wall with a wooden gate tower filling the right half, the great gate standing half open, lantern light spilling out; distant war banners and torches far away on the left where a decoy attack is drawing the defenders; moonlit blue shadows on the stone.', OPEN),
    'actor-0': pose0('a Han-dynasty raider disguised in the enemy\'s plain grey gate-guard uniform and helmet, a short sword at his hip, holding a clay pot of burning oil by its rope handle; facing RIGHT, toward the open gate.', 'creeping forward low, the fire pot held behind him'),
    'actor-1': pose1('the throw: arm swung through toward the right, the fire pot gone from his hand, his body turning to run'),
  } },
  // 共杀: in the dark the enemy camp is set against itself.
  'st-strife': { loop: loop([0.4, 0.3]), layers: {
    bg: plate('a sowing of discord (共杀) in the enemy camp', 'An enemy field camp in deep night and thick drifting smoke: tents and stacked weapons, overturned braziers, scattered red embers; in the right half, two groups of the enemy\'s own soldiers in identical armour shown as dark silhouettes clashing spears against each other in the smoke; a red glow behind them.', OPEN),
    'actor-0': pose0('a Han-dynasty spy in a black hooded tunic and dark wrappings, a face cloth over his mouth, holding a small bronze gong and a striker; facing RIGHT, half turned to the viewer.', 'crouched, the gong raised beside his head, about to strike it'),
    'actor-1': pose1('the gong struck hard, his mouth open in a shout toward the right, his free arm pointing the enemy at each other'),
  } },
  // 笼络: an envoy wins an enemy officer over with gold and a letter.
  'st-lure': { loop: loop([0.7, 0.45]), layers: {
    bg: plate('a secret approach (笼络) to an enemy officer', 'A quiet lamp-lit pavilion at night with red lacquered pillars and a bamboo blind half raised; a low table with a small open chest of gold ingots and silk bolts catching the lamplight, a sealed bamboo letter beside it; a moon behind thin clouds and a garden of plum trees outside on the right.', OPEN),
    'actor-0': pose0('a Han-dynasty envoy in a rich deep green silk robe with wide sleeves and a black official cap, a neat moustache, holding a sealed letter in both hands; facing RIGHT three-quarter.', 'bowing deeply, presenting the letter forward in both hands'),
    'actor-1': pose1('straightened up with a sly smile, one wide sleeve swept out to the right toward the gold, the letter held up beside his face'),
  } },
  // 连环: enemy boats are chained together on the river.
  'st-chain': { loop: loop([0.5, 0.26]), layers: {
    bg: plate('a chain-lock (连环) of the enemy fleet', 'A wide grey river under a hazy sky; across the right half, a line of large enemy war junks with tall sterns and furled sails moored close together, heavy iron chains and planks already linking several of them; a timber jetty in the foreground on the left with coils of chain and wooden mallets.', OPEN),
    'actor-0': pose0('a burly Han-dynasty shipwright soldier in a sleeveless brown tunic and leather apron, a cloth tied round his head, a heavy iron chain over one shoulder and a big wooden mallet raised in his right hand; facing RIGHT.', 'the mallet raised high, about to drive an iron spike through a chain link'),
    'actor-1': pose1('the blow: bent forward, the mallet slammed down in front of him to the right'),
  } },
  // 十面埋伏: banners rise on every side at the drum.
  'st-encircle': { loop: loop([0.32, 0.26]), layers: {
    bg: plate('the ten-sided ambush (十面埋伏)', 'A wide valley at dawn seen from a hilltop: on every ridge and slope around it, rows upon rows of war banners of many colours suddenly raised and lines of spear tips glinting, troops pouring down from all sides toward a small enemy column trapped on the valley road in the right half; mist in the valley, golden first light.', OPEN),
    'actor-0': pose0('a Han-dynasty drummer of the army, stout and bearded, in red lamellar armour with a red cloth headband, both drumsticks in his hands, standing beside a large red war drum on a wooden stand at his right; facing RIGHT.', 'both drumsticks raised high above his head'),
    'actor-1': pose1('both drumsticks brought down hard on the drum head, his shoulders hunched with the blow'),
  } },
  // 劫火: a fire raid sweeps the linked enemy camp before the wind.
  'st-firestorm': { loop: loop([0.4, 0.3]), layers: {
    bg: plate('a great fire raid (劫火) on the enemy camps', 'A row of enemy camps along a dry valley at night, every tent and palisade on the right half already roaring in flames driven sideways by a strong wind, sparks and black smoke streaming to the right across a red sky; a downhill slope of dry grass in the foreground on the left.', OPEN),
    'actor-0': pose0('a Han-dynasty raider in dark lamellar armour and a red headscarf, both hands on the shafts of a small two-wheeled wooden fire cart heaped with burning straw and oil jars beside him on his right; facing RIGHT.', 'braced and pushing the burning cart forward, leaning into it'),
    'actor-1': pose1('the cart sent rolling away: he has let go and stands with both arms flung forward toward the right, the cart no longer there'),
  } },
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [scene, layer] = process.argv.slice(2);
  if (scene === '--list') { for (const [s, v] of Object.entries(SCENES)) for (const l of Object.keys(v.layers)) console.log(s, l); process.exit(0); }
  const L = SCENES[scene]?.layers[layer];
  if (!L) { console.error('unknown scene/layer'); process.exit(1); }
  if (process.argv.includes('--refs')) process.stdout.write(L.refs.join(' ')); else process.stdout.write(L.prompt);
}
