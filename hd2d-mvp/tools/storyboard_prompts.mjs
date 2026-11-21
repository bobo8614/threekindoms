// Prompt source for the storyboard 演出 (src/vignette.js): one locked-camera shot painted as a 3×3 sheet of nine
// consecutive frames, so figures and scene share one drawing, one light and one scale. Each story follows what the
// command or 计略 does in the rules (src/core/field.js STRAT_INFO for 计略).
//   node hd2d-mvp/tools/storyboard_prompts.mjs <scene>           → prints the prompt
//   node hd2d-mvp/tools/storyboard_prompts.mjs <scene> --refs    → reference paths, relative to hd2d-mvp/
//   node hd2d-mvp/tools/storyboard_prompts.mjs --list            → scene names
import { fileURLToPath } from 'node:url';

const ERA = 'Eastern Han dynasty China, c. 190 AD (Romance of the Three Kingdoms)';
const sheet = (setting, cast, frames) => `Nine consecutive frames of one short animated cut-scene for an HD-2D remake of a 1992 Three Kingdoms strategy game, painted together as one sheet.

SHEET (critical): a grid of exactly 3 columns and 3 rows of equal landscape 3:2 panels, read left to right, top to bottom, separated by thin solid black gutters of equal width, with the same black gutter around the outside. No numbers, captions, text, speech bubbles, signatures or UI anywhere.

SHOT (critical): every panel is the SAME locked camera on the SAME place: horizon, terrain, every tree, rock and building stay at the same position and size in all nine panels, and only what the frame describes changes. It must play as animation when the panels are shown in turn: no zoom, no pan, no change of angle.

STYLE (critical): match the first reference image: HD-2D diorama look as in Octopath Traveler / Triangle Strategy, detailed 16-bit pixel-art textures with crisp pixel clusters, soft bloom around light sources, rich but natural colours. Figures belong to the scene: painted with the scene's own light and palette, with soft outlines rather than heavy black ones, each casting a shadow on the ground. Adult figures have realistic adult proportions, about six to seven heads tall, with no oversized heads: never chibi, super-deformed or cartoonish. Colours stay natural and restrained. Not a sticker on a background, not painterly, not photographic, not anime cel.

SCENE: ${ERA}. ${setting}
FIGURES: ${cast} Figures are small in the frame, the main one about a third of the panel height, full figure, with the same face, costume and proportions in every panel.

FRAMES:
${frames.map((f, i) => `${i + 1}. ${f}`).join('\n')}`;

export const SCENES = {
  // 火计: 火攻敌军，目标在森林或平地.
  'st-fire': { old: 'st-fire', prompt: sheet(
    'Dry autumn grassland at dusk under a hazy orange sky, a pine-wooded slope behind. An enemy field camp of canvas tents behind a wooden palisade with limp banners fills the right half. Tall dry reeds and straw bundles lie in the left and centre foreground, with a line of dry grass running from them to the palisade.',
    'A foot soldier in a short red tunic over leather lamellar armour and a red headscarf, at the left of the frame, seen from the side facing right. A few tiny enemy guards in the camp.',
    ['Quiet dusk. The soldier crouches in the reeds at the left, an unlit torch in hand. Enemy guards stand at ease.',
      'He strikes the torch alight, a small flame in his hands, still crouching.',
      'He rises and leans back, the burning torch drawn far behind his head.',
      'He flings it: arm forward, the torch in the air in a high arc over the middle of the frame, trailing sparks.',
      'The torch lands in the straw bundles near the palisade. A small flame catches. The soldier is back in a crouch.',
      'Fire runs along the line of dry grass to the palisade, flames knee-high, the first smoke. Guards turn their heads.',
      'The palisade burns and the wind carries flames onto the nearest tents. Guards run.',
      'The camp is ablaze, tents collapsing, black smoke leaning right across the sky, orange light on everything. Tiny enemy soldiers scatter.',
      'The whole camp is a wall of fire and the sky has turned red. The soldier stands in dark silhouette at the left, watching.']) },
  // 奇门遁甲: 困敌于石阵，数日不能移动，诸葛亮在场时每日折兵；目标不在河上和城中. His art of alone, so he is the figure:
  // his portrait's white robe and feather fan, seated on the carriage he fights from (tools/sprite_prompts.mjs).
  'st-magic': { old: 'st-magic', refs: ['assets/ai/portraits/109.webp', 'assets/ai/sprites/duel/109.png#0'], cast: 'The third reference image is the game\'s portrait of Zhuge Liang: copy his face, long black hair, goatee, white-and-grey striped scholar\'s cap, white robe with grey scroll trim and white feather fan. The fourth is his game sprite on the four-wheeled wooden carriage: copy the carriage. Draw him in the scene\'s own pixel-art style, not the portrait\'s.', prompt: sheet(
    'A wide open plain at night under swirling clouds and a pale moon, seen from a low hill. The bare hilltop with a tall trigram banner is at the left; the plain fills the centre and right, flat and empty.',
    'Zhuge Liang, the famous strategist, at the left of the frame on the hilltop, seated on his four-wheeled wooden carriage, which does not move, facing right. Long black hair, goatee, white-and-grey striped scholar\'s cap, white robe with grey scroll trim, moonlit. In his right hand he always holds one white crane-feather fan. He has NO sword and no talisman, and he stays seated. A small column of about twelve tiny enemy soldiers with two banners on the plain at centre right.',
    ['Zhuge Liang sits calmly, the feather fan resting before his chest. The enemy column marches across the plain.',
      'He lifts the fan high. A pale blue glow gathers on its feathers and his sleeves begin to stir. The enemy marches on.',
      'He sweeps the fan out toward the right. A ribbon of blue wind crosses the plain, and thin glowing blue lines crack across the ground in a wide octagon around the enemy column, which halts.',
      'Fan held out, he watches. Eight great standing stones begin to break up through the ground along the octagon, knee-high, with dust around them. Enemy soldiers look about.',
      'The stones rise to twice a man\'s height, soil falling from them, glowing trigram marks on their faces. The enemy bunches together.',
      'The ring of stones is complete and towers over the enemy. Pale mist starts to pour from between them.',
      'He turns the fan gently. Mist fills the ring to the soldiers\' chests. Enemy soldiers run in different directions, their banners tilting.',
      'Inside the ring the mist hides almost everything. Tiny figures stumble in circles and one banner has fallen.',
      'The array stands silent under the moon, with blue light in the stones and thick mist inside. Zhuge Liang sits calmly again, the fan back before his chest.']) },
  // 开发·土地: 沼を埋めたて農地に (the original's picture), here carried through to the field it makes.
  land: { old: 'land', prompt: sheet(
    'A shallow reed marsh at the foot of an ochre earthen cliff that slopes down from the upper left, in warm morning sun. Still water with ripples covers the lower two-thirds. A short row of wooden stakes and reed bundles marks a new dyke at the lower right. Sky with a few soft clouds.',
    'A sturdy peasant labourer, shirtless and sunburnt, in dark green rolled-up trousers and a green headband, barefoot, at the left of centre, with a long-handled iron hoe.',
    ['Open marsh water and reeds. The labourer stands ankle-deep, hoe raised high over his head: at the far end of the handle a narrow iron neck bends at a right angle and a thin rectangular blade stands up from it toward the sky, cutting edge at the top: a hoe, never an axe.',
      'The hoe comes down into the mud with a splash, dark clods flying.',
      'He hauls a heap of dark earth toward himself. A small bank of earth breaks the surface in front of him.',
      'He raises the hoe again, its thin iron blade standing up from the end of the handle toward the sky, as in frame 1. The bank has grown into a strip of dark earth across the left of the water.',
      'Downstroke again. The strip of earth reaches the middle of the frame and the water has shrunk behind the dyke stakes.',
      'He stands on new dark ground and smooths it with the hoe. Reeds are gone from the left half.',
      'The ground is drained and ruled into neat furrows across the lower left and centre. Only a little water remains at the far right.',
      'The first tiny green shoots stand in the furrows. He leans on the hoe and wipes his brow.',
      'Rows of bright young green crops fill the new field, shining in the sun. He stands with the hoe on his shoulder, looking over it.']) },

  // ---------- 计略 (STRAT_INFO in src/core/field.js says what each does) ----------
  // 陷阱: 敌将受伤，目标在森林或山地.
  'st-trap': { old: 'st-trap', prompt: sheet(
    'A rocky mountain path climbing from the left foreground to the right between boulders and scrub pines, in grey morning light. Near the middle of the path the ground looks exactly like the rest of the path: a pit lies under it, perfectly hidden. Until frame 4 there is NO visible hole, no stakes, no branches and no edge anywhere on the path. A low boulder stands at the left.',
    'A lean trapper soldier in a brown hooded short tunic, crouched behind the boulder at the left, facing right, gripping a hemp rope that runs along the ground, half buried in the dust, to the middle of the path. An enemy general in fine lamellar armour with a red plume on a brown horse, with two foot soldiers behind him, comes down the path from the right.',
    ['Quiet path. The trapper waits behind the boulder, rope slack. The enemy general is far up the path at the right.',
      'The general rides closer, unaware. The trapper tightens his grip and watches.',
      'The horse\'s forefeet step onto the middle of the path, which still looks solid. The trapper leans back on the rope.',
      'He heaves the rope hard. The path breaks open under the horse: the earth turns out to be a thin lid of branches and it gives way, dust jumping up.',
      'The lid collapses. Horse and general lurch downward into the opening, earth pouring in, the foot soldiers recoil.',
      'A cloud of dust stands over the pit. Sharpened bamboo stakes show at its rim. The general\'s plumed helmet is flying off.',
      'The dust thins. The general is in the pit, wounded, gripping a stake, only his head and shoulders visible above the rim.',
      'The foot soldiers rush to the rim and reach down for him. The trapper crouches again and starts to slip away to the left.',
      'The soldiers haul the wounded general out, blood on his armour, and his helmet lies on the path. The boulder at the left has no one behind it now.']) },
  // 虚兵: 敌军数日不能移动，目标在森林或山地.
  'st-ruse': { old: 'scout', prompt: sheet(
    'A forested mountain road under grey-gold afternoon light in early autumn, muted greens and ochres, seen from a slope. The road is plain packed earth from end to end, with no pit, trench, stakes, logs or traps anywhere. The road crosses from the lower right toward a wooded ridge in the upper left. Behind the ridge is empty sky.',
    'An enemy column of about ten small soldiers with one banner, led by an officer on a horse, on the road at the lower right, marching left. On the near slope at the left edge, three of our soldiers in green tunics with branches tied to the tails of two horses, and a stack of spare banners on poles. Behind the ridge only poles and banners ever appear, never an army.',
    ['The enemy column marches toward the ridge. Our three soldiers wait at the left, one holding a horse by the bridle.',
      'One banner rises behind the far ridge, then a second. Our soldiers are planting poles along the near slope.',
      'A dozen banners stand along the ridge top. Our soldier leads a horse away, branches dragging behind it.',
      'A long plume of dust rises behind the ridge, moving as if a great host were marching. The enemy officer looks up.',
      'Dozens of banners and several plumes of dust line the whole ridge. The enemy officer raises his hand and the column stops.',
      'The enemy soldiers bunch together on the road, shields up, all staring at the ridge. The officer\'s horse rears slightly.',
      'They drive stakes and set shields across the road, digging in. No one advances.',
      'At the left, our three soldiers quietly drag another pole into place, grinning. Only three men are making all of this.',
      'The enemy sits fortified and motionless on the road, staring at the ridge of banners and hanging dust, which no soldier has ever stood under.']) },
  // 要击: 伏击敌军，损兵（看武力），目标在森林或山地.
  'st-ambush': { old: 'st-ambush', prompt: sheet(
    'A narrow road through a dim pine wood, morning mist between the trunks and dappled sunlight on the packed earth. Thick ferns and undergrowth line both sides of the road.',
    'Ambush soldiers in dark green tunics and leather armour with long spears, hidden in the undergrowth on both sides. A column of about eight enemy soldiers in grey with a banner marches along the road from right to left.',
    ['The empty forest road. Only a few spear tips show among the ferns, easy to miss.',
      'The enemy column enters at the right, marching in loose order.',
      'The column is in the middle of the frame. In the ferns, the eyes and helmet of one crouching ambusher show, watching.',
      'A leading ambusher rises from the ferns and raises his arm. The nearest enemy soldier turns his head.',
      'Green soldiers burst out of the undergrowth on both sides with a war cry, spears levelled, ferns flying.',
      'They crash into the column from both flanks. The enemy line breaks in two and the banner tilts.',
      'Close fighting across the road, enemy soldiers knocked down, shields falling, dust and torn ferns in the air.',
      'The surviving enemy soldiers run off to the right. Their banner lies on the road. Green soldiers chase them.',
      'The road is strewn with dropped spears and shields. The green soldiers stand over it with spears raised in victory, mist drifting back between the trunks.']) },
  // 乱水: 水淹敌军，损兵（看智力），目标在河上.
  'st-rapids': { old: 'st-rapids', prompt: sheet(
    'A fast narrow river in a steep wooded gorge, flowing from the upper left to the lower right. At the upper left, a timber log boom holds back a mass of water behind it. Grey-green light, spray in the air.',
    'A wiry bare-chested river raider in a dark blue headband, on a rock on the near bank at the left, with a long hooked bamboo pole. A line of three enemy bamboo rafts with about nine small soldiers, spears and grain sacks, crossing mid-river at the centre right.',
    ['The rafts pole steadily across calm water. The raider crouches on his rock next to the log boom, pole in hand.',
      'He hooks the pole round the rope that binds the boom and draws it back over his shoulder.',
      'He hauls down hard. The rope snaps and the end whips through the air. Logs begin to shift.',
      'The boom bursts. A wall of white water and tumbling logs breaks loose at the upper left.',
      'The surge races down the gorge, foam filling the river. The enemy soldiers on the rafts look up in alarm.',
      'The wave hits the first raft and throws it up on end, soldiers flying off it.',
      'All three rafts break apart in the rapids, bamboo poles scattering, soldiers and spears in the churning water.',
      'White water fills the gorge. Heads and arms in the foam, grain sacks and shields spinning away to the lower right.',
      'The flood passes. Only broken bamboo and floating shields spin in the fast water. The raider stands tall on his rock with his pole.']) },
  // 火箭: 烧毁敌军携带的米，目标是敌总大将.
  'st-firearrow': { old: 'st-firearrow', prompt: sheet(
    'Early night on a broad plain, a dark blue sky with the last red glow of sunset and faint stars. The right half holds the enemy commander\'s supply train: heavy ox wagons piled with straw-wrapped rice bales and grain sacks, under a tall commander\'s banner. Before the arrows land in frame 5, there is NO fire and no smoke on the wagons, which sit dark and whole. A low earth bank runs along the left foreground.',
    'Three archers in dark red tunics and leather caps behind the bank at the left, facing right, the nearest about a third of the panel height, each with a long composite bow. A few tiny enemy guards with lanterns by the wagons.',
    ['Quiet dusk. The archers crouch behind the bank. A lit brazier stands beside them. The guards stroll by the wagons.',
      'They dip cloth-wrapped arrowheads into the brazier and the heads catch fire.',
      'They rise and draw their bows to full stretch, burning arrows pointing high up to the right.',
      'They release: three lines of fire arc high across the dark sky.',
      'The fire arrows fall into the wagons and stick in the rice bales. Small flames begin. Guards point upward.',
      'A second volley streaks overhead. The bales are alight on several wagons and the oxen shy.',
      'Fire spreads from wagon to wagon. Guards throw water from buckets to no effect.',
      'The whole train burns high. Burst sacks pour out burning rice in glowing heaps, and sparks fill the sky.',
      'The wagons are burnt-out frames over heaps of glowing, blackened rice under the commander\'s scorched banner. The archers stand on the bank in silhouette.']) },
  // 伪击转杀: 火攻守城的敌军，目标在城中，与我相邻.
  'st-feint': { old: 'st-feint', prompt: sheet(
    'Night at a Han-dynasty castle: a high rammed-earth wall with a wooden gate tower fills the right two-thirds, seen from outside at an angle; a stretch of wall curves away to the far left, moonlit blue shadows on the stone. Behind the wall the tile roofs and straw-stacked storehouses of the garrison show. A cluster of bushes grows at the wall foot in the foreground.',
    'Tiny torch-bearing attackers far away at the far left, under banners. Tiny defenders on the wall. In the bushes in the foreground, a raider in dark clothes with a clay pot of burning oil on a rope handle, about a quarter of the panel height.',
    ['Silence. Defenders line the wall above the gate. The raider crouches in the bushes.',
      'Far to the left, torches and banners appear with distant ladders: a loud attack begins there.',
      'The defenders on this wall run off along the battlements toward the far left. A few remain.',
      'The wall above the gate is empty now. The raider slips out of the bushes to the wall foot with his pot.',
      'He swings the fire pot by its rope in a wide circle, flames trailing.',
      'He lets go. The pot flies over the wall in a fiery arc toward the storehouses.',
      'A burst of flame among the stacked straw behind the wall lights up the roofs from inside.',
      'The fire leaps from roof to roof inside the castle, black smoke rising. Tiny defenders run back in confusion along the wall.',
      'The castle burns from within, the gate tower in silhouette against the flames. The distant torches at the left have gone dark: the attack there was only a feint.']) },
  // 共杀: 火攻目标及其身边的友军，各自损兵，目标在森林或山地，身边有其友军.
  'st-strife': { old: 'st-strife', prompt: sheet(
    'Deep night in a wooded valley: two enemy field camps of tents and stacked weapons, one at the centre and one at the right, side by side with a gap of dark trees between them. Soldiers of both wear the same armour.',
    'A spy in a black hooded tunic with a face cloth, at the left edge of the frame behind a tree, holding a lit torch. Many small enemy soldiers in identical grey armour.',
    ['Both camps sleep around low fires. A few sentries stand between them. The spy waits behind the tree.',
      'He slips forward and sets his torch to the nearest tent of the centre camp. A small flame climbs its side.',
      'He is gone back behind his tree. The tent flares up and soldiers rush out half dressed.',
      'Fire spreads through the centre camp. Thick smoke drifts across the gap, hiding the trees.',
      'Soldiers of the right camp run into the smoke with spears to help. Dark shapes appear in the smoke from both sides.',
      'The two groups meet in the smoke and, unable to see, take each other for attackers. Spears clash.',
      'The fight spreads: identical soldiers strike each other in the red smoke, and fire catches the right camp too.',
      'Both camps blaze. Soldiers fall on both sides, banners come down, nobody knows who is who.',
      'Both camps are burning wrecks with fallen men and spears between them, the last figures still fighting in the smoke. The spy watches from behind his tree, then turns away.']) },
  // 笼络: 劝敌将倒戈投向我军（看对方忠诚），目标不在城中.
  'st-lure': { old: 'st-lure', prompt: sheet(
    'A commander\'s field tent of the enemy at night, seen from inside: canvas walls lit by a warm lamp, a low table in the middle, a weapon rack, the tent flap at the right open on a dark camp. On a pole beside the flap stands the enemy\'s dark blue war banner.',
    'An envoy in a deep green silk robe with wide sleeves and a black official cap, entering at the left with a small lacquered chest. An enemy officer in dark blue lamellar armour with a topknot, seated at the table.',
    ['The officer sits alone with his head on his hand, looking tired, an empty cup in front of him.',
      'The envoy steps in from the left and bows low, holding out a sealed bamboo letter in both hands.',
      'The officer has taken the letter and frowns as he reads, his hand on his sword hilt.',
      'The envoy sets the chest on the table and lifts the lid. Gold ingots and silk shine in the lamplight.',
      'The officer looks up from the letter at the gold, his hand leaving the sword.',
      'He stands, deep in thought, turned toward the tent flap and the dark camp. The envoy waits, a slight smile on his face.',
      'He turns back and bows to the envoy, hands clasped.',
      'He walks to the pole and takes down the dark blue banner. It falls from his hand.',
      'The dark blue banner lies on the floor. The officer and the envoy stand together at the tent flap, about to walk out, and beyond the flap a red banner is being raised.']) },
  // 落石: 敌将受伤并损兵；自己在山地或城中，目标与我相邻且不在城中.
  'st-rock': { old: 'st-rock', prompt: sheet(
    'A narrow mountain pass in clear cold air. A high rocky cliff rises on the left with a ledge at its top, in the upper left of the frame; the pass road runs along its foot from the lower left to the lower right. Distant blue ridges at the right.',
    'Two brawny soldiers in brown tunics with long wooden levers on the ledge, beside three large round boulders. A column of about nine small enemy soldiers with a mounted officer and a banner on the pass road below.',
    ['The enemy column enters the pass below. On the ledge above, the two soldiers wait beside the boulders, levers ready.',
      'They set the levers under the largest boulder and lean on them, straining. The column is right under the cliff.',
      'The boulder tips over the edge. Loose stones fall ahead of it. The mounted officer looks up.',
      'The boulder falls down the cliff face, bouncing, with a trail of dust. Two more roll to the edge.',
      'All three boulders are falling, with a landslide of smaller rocks behind them. Enemy soldiers raise their shields and scatter.',
      'The first boulder smashes into the road amid the column, soldiers thrown aside, a huge burst of dust.',
      'More rocks crash down. Dust fills the pass. The officer is thrown from his rearing horse.',
      'Dust begins to settle. The road is blocked by boulders, with soldiers lying among them and the banner snapped.',
      'The pass is quiet. The wounded officer limps away, helped by two soldiers, over the rubble. The two soldiers on the ledge look down, levers on their shoulders.']) },
  // 连环: 锁住河上相连的敌军，数日不能移动，目标在河上，身边有同在河上的友军.
  'st-chain': { old: 'st-chain', prompt: sheet(
    'A wide grey river under a hazy morning sky, seen from the near bank. Three large enemy war junks with tall sterns and sails ride in midstream, spaced well apart. The far bank has low hills. The near bank in the foreground is a stretch of reeds.',
    'A small boat crew of our men in dark clothes, about six figures, in two narrow boats with heavy iron chains and hammers. A few tiny enemy sailors on the junks. All figures small.',
    ['Three junks ride at anchor apart from each other. Two narrow boats slide out of the reeds, low in the water, chains piled in them.',
      'The boats reach the gap between the first two junks. A man swings a grappling hook up to a hull.',
      'A heavy iron chain hangs from the first junk, being hauled across the gap. Men hammer at a staple in the hull.',
      'The chain now links the first two junks, and sparks fly from the hammer as it is spiked.',
      'The boats move on and a second chain goes up between the second and third junks.',
      'The chains pull tight as the men draw them in. The three junks swing and bump together, side to side.',
      'The boats slip away toward the reeds. Enemy sailors wake and run along the decks, pointing at the chains.',
      'The sailors raise sails and pole hard. The chains go taut and the three hulls jerk and grind against each other, going nowhere. Sails flap uselessly.',
      'The three junks sit locked together in midstream, chains shining, sailors hacking at the iron without effect. The narrow boats have gone into the reeds.']) },
  // 十面埋伏: 在林中设下伏兵（耗兵100），5日内敌军走进两格内的森林时遭伏击；自己在森林.
  'st-encircle': { old: 'st-encircle', prompt: sheet(
    'A sunlit clearing in a large old forest, seen from one side, with a dirt road crossing it and tall trees and thick undergrowth all round. Late afternoon turning to dusk through the sequence, gently.',
    'A hundred is too many to draw: show about fifteen of our soldiers in dark green tunics with spears and furled banners, and one officer in lamellar armour with a small drum on his hip. They are small in the frame. No enemy appears until the last frames.',
    ['Our soldiers march into the clearing along the road in two files behind the officer.',
      'The officer points his sword left and right. The files divide toward the trees on both sides.',
      'Soldiers wade into the undergrowth and start to crouch down, banners being furled.',
      'They pull branches over themselves. Half of them have vanished; one soldier sweeps the footprints off the road with a leafy branch.',
      'The clearing looks almost empty. Only a few helmets and the officer remain, kneeling at the edge of the trees with his hand raised for silence.',
      'Nobody can be seen at all. The clearing is calm and empty in the evening light, birds settled on the road. Only tiny glints of spear points among the ferns if you look closely.',
      'The same empty clearing at dusk. Far off at the right edge, a small enemy column appears on the road.',
      'The enemy marches into the middle of the clearing, unsuspecting. Among the ferns on every side, the glints have multiplied.',
      'The officer\'s drum sounds: banners shoot up out of the undergrowth on every side, all around the clearing, with spears behind them, and the trapped enemy halts in shock.']) },
  // 水攻: 水攻河上相连的敌军，各自损兵，目标在河上，身边有同在河上的友军.
  'st-water': { old: 'st-water', prompt: sheet(
    'A river valley under grey storm clouds in cold blue light. In the upper left a high dyke of earth bags and timber holds back a swollen lake. Below it, the river runs across the centre to the lower right, where three linked enemy rafts and boats lie side by side. A bank of mud and grass fills the left foreground.',
    'Two sappers in straw rain capes and conical hats, with long-handled mattocks, on top of the dyke. About twelve small enemy soldiers on the linked boats.',
    ['Rain falls. The lake stands brimful behind the dyke. The enemy boats ride linked on the river. The sappers climb the dyke.',
      'They swing their mattocks into the dyke top, earth bags splitting.',
      'A trickle of water runs through the cut and down the dyke face. They dig harder.',
      'The gap tears open, water spurting. The sappers scramble away along the top.',
      'The dyke bursts: a brown wall of water and timber plunges down into the valley.',
      'The flood rolls down the river and rises, trees bending. The enemy soldiers on the boats see it and point.',
      'It hits the linked boats. They cannot part, so the first one rolling over drags the others after it.',
      'All the boats capsize together in the brown torrent, soldiers and shields swept along.',
      'The valley is a brown flood with broken hulls, still chained, turning slowly in it. The sappers stand on the broken dyke in the rain.']) },
  // 连弩: 以连弩射击相邻敌军，大量损兵；自己在城中，目标与我相邻.
  'st-bow': { old: 'st-bow', prompt: sheet(
    'The battlements of a Han-dynasty city wall at midday, seen along the wall top from the left: crenellations with wooden hoardings in the left half, and in the right half a view over the wall down to the dusty plain in front of the castle. Banners on the wall.',
    'Four crossbowmen in lamellar armour and red-tasselled iron helmets on the wall top with large repeating crossbows with bolt magazines on top, resting on the crenels, facing right. An enemy assault line of about fifteen small soldiers with shields and ladders on the plain below at the right.',
    ['The enemy line advances across the plain with shields and ladders. The crossbowmen kneel behind the crenels, bows down.',
      'An officer on the wall raises his hand. They rise and slide the crossbows forward onto the crenels, loading magazines.',
      'They aim downward along the bows, cheeks to the stocks. The enemy has come close, running.',
      'The officer\'s hand drops. The first volley: a sheet of many bolts leaves the wall in straight lines.',
      'They work the levers and a second sheet of bolts is already in the air. Enemy shields bristle with bolts and front men fall.',
      'A dense continuous rain of bolts streaks from the wall. The enemy line staggers and a ladder falls.',
      'Levers pump again. Bolts stick in the ground like a field of reeds, and many enemies are down. Others crouch under shields.',
      'The enemy breaks and runs back across the plain, leaving ladders and shields.',
      'The plain is bristling with bolts, and fallen men and ladders lie still. The crossbowmen lift their bows from the crenels. Spent magazines lie at their feet.']) },
  // 劫火: 火烧相连的敌军（城中的除外），各自大量损兵；目标不在城中，身边有不在城中的友军.
  'st-firestorm': { old: 'st-firestorm', prompt: sheet(
    'A long row of linked enemy camps along a dry valley at night, each joined to the next by a wooden palisade, running across the right half and into the distance. A downhill slope of dry grass fills the left foreground. A strong wind blows from left to right: grass and banners lean right in all frames.',
    'Three raiders in dark lamellar armour and red headscarves, on the slope at the left, with two small two-wheeled wooden fire carts heaped with straw and oil jars. Many tiny enemy soldiers in the camps.',
    ['The camps sleep under the wind, a few lamps lit. The raiders bring the carts to the top of the slope.',
      'One raider sets a torch to the straw. The first cart catches and streams flame to the right.',
      'Both carts are ablaze. The raiders brace and push them forward, leaning in.',
      'They let go. The carts roll down the slope, gathering speed, leaving a trail of burning grass.',
      'The carts smash through the palisade of the nearest camp and burst, oil jars exploding in sheets of flame.',
      'The wind drives the fire along the palisade to the next camp. Tents go up one after another.',
      'Fire runs down the whole line of camps faster than the tiny figures can run. Sparks fly right in a great stream.',
      'Every camp to the horizon is burning. The sky is red and black smoke streams sideways.',
      'A single wall of fire fills the valley from end to end, driven by the wind. The three raiders stand on the burnt slope as dark silhouettes.']) },

  // ---------- 命令 (DESC in src/app.js says what each does) ----------
  // 开发·产业 (FC: a miner drives a chisel into a cave wall).
  industry: { old: 'industry', prompt: sheet(
    'Inside a mine gallery cut into reddish rock, timber props holding up the roof, oil lamps on pegs giving warm flickering light. A rough rock face fills the right, a timber track and an empty wooden ore cart wait at the lower left; the tunnel recedes into darkness at the far left.',
    'A miner in a short brown work tunic and cloth cap, sleeves rolled up, facing right at the rock face with an iron chisel and a wooden mallet, plus a boy helper in grey who appears later.',
    ['The miner sets the chisel to the plain rock and draws the mallet back.',
      'The mallet strikes the chisel, sparks and chips flying.',
      'A crack runs across the rock. He draws the mallet back again.',
      'Another blow: a slab splits away and falls, dust bursting out.',
      'Behind the fallen slab a rich seam of green-and-copper ore gleams in the lamplight. The miner stares at it.',
      'He wipes his brow and calls out, and the helper comes up with a basket.',
      'They shovel lumps of glittering ore into the cart, which is half full.',
      'The cart is heaped full. They lean into it and push it along the track toward the left.',
      'The cart rolls away into the tunnel with lamp-lit ore shining, and the miner is back at the widening seam with his mallet raised.']) },
  // 开发·人口 (FC: townsfolk on a busy street before a tiled-roof hall).
  pop: { old: 'pop', prompt: sheet(
    'A town street on a bright morning before a large two-storey tiled-roof hall. White plaster houses with grey tiles line both sides; the right side has an empty lot with a wooden frame not yet built on. Packed-earth road in the foreground.',
    'A family of settlers: exactly three people in every panel where they appear, a man with a laden shoulder pole, a woman in a pale rose robe and ONE small child in blue (never a second child with them until frame 8). The adults are slim and six to seven heads tall with small heads, not stocky. Small townsfolk gather through the scene. The man wears the same tan tunic throughout, and the new house keeps the same size and position from frame 5 on.',
    ['The street is nearly empty, two passers-by and the bare lot at the right. The family appears at the left end of the road, tired, with their bundles.',
      'A townswoman comes to meet them, waving. The family stops, looking around.',
      'They set down their bundles and bow. The child looks at a stray dog.',
      'Carpenters raise roof beams on the lot at the right as the settler man helps carry a timber.',
      'The house at the right has walls and half its tiled roof. More newcomers walk in along the road.',
      'The house is finished, with red lattice windows. A stall has opened beside it and people walk by with baskets.',
      'The street has grown busy: lanterns, banners, stalls, many small townsfolk.',
      'The family stands at their own door, the woman waving, the child running with other children.',
      'A lively full street in warm light with lanterns, crowded stalls and children running, and the hall behind it hung with red banners.']) },
  // 防灾: 修筑堤防，减轻洪水与旱灾的损失.
  disaster: { old: 'disaster', prompt: sheet(
    'A swollen brown river fills the upper right under a grey rainy summer sky. A low, damaged earthen dyke runs from the lower left to the middle right, with a gap in it. Beyond the dyke at the lower right are green fields and a thatched farmhouse.',
    'Three labourers in straw rain capes and conical straw hats, carrying straw-wrapped earth bags, in the middle ground. A foreman with a staff comes later.',
    ['Rain. River water laps through the gap in the dyke, and a thin stream runs toward the fields. A labourer arrives, a bag on his shoulder.',
      'He heaves the bag into the gap. Two more labourers come along the dyke with bags.',
      'A row of bags fills the bottom of the gap and water still spills over it.',
      'They drive wooden stakes with a mallet in front of the bags, water splashing around them.',
      'A second and third layer of bags go on. The stream to the fields has shrunk to a trickle.',
      'The gap is closed. They stamp earth down on top, the rain easing.',
      'The dyke stands higher along its length, faced with stakes. The foreman walks along it, checking with his staff.',
      'A wave from the river breaks against the new dyke and falls back. The fields behind it stay dry.',
      'The rain has stopped and a break of light falls on the dyke. The labourers rest on it with hats off, the river running high beside it and the fields green behind it.']) },
  // 调遣 (once 移动): 把武将调往相邻的己方城或空城 (the officer rides to his new post).
  march: { old: 'march', prompt: sheet(
    'A broad flat post road crosses the whole frame in the lower third, straight from the left edge to the right edge, then a branch climbs at the far right to a walled castle with a three-storey gate tower at the right horizon. Poplars stand behind the road. A wooden waystation pavilion stands just behind the road at the centre. Nothing stands in front of the road: only short grass, with no rocks, bushes or flower beds in the foreground. Fresh spring morning light with soft muted greens and earth tones; quiet, restrained colour, not saturated, no bright yellow flower fields.',
    'An officer in a dark red robe over lamellar armour and a black official cap on a chestnut horse, a standard-bearer in grey on foot beside him with a tall rectangular red banner. The figures are about a third of the panel height. They travel from left to right through the nine frames, in step, always on the road surface with hooves and feet fully visible on it, never leaving the road and never on rocks or grass. Horse legs must differ in each frame like a walk cycle.',
    ['At the far left of the road, the officer and his bearer set out at a walk.',
      'A step on, the horse\'s near foreleg raised, the banner streaming back.',
      'They pass the first poplars, the far foreleg raised.',
      'Mid-road. The officer looks forward toward the castle, and a petal drifts past.',
      'They come level with the pavilion. A clerk in the pavilion bows to them.',
      'Past the pavilion, the castle now larger above the road, the horse in mid-stride.',
      'They are at the right of the frame. The bearer lifts the banner higher.',
      'At the gate of the road\'s end, seen far ahead, a red banner rises on the castle tower in greeting.',
      'They reach the right edge, the officer raising his hand to the distant gate, where small figures wait in welcome.']) },
  // 运输: 向相邻的己方城运送金、米、宝.
  move: { old: 'move', prompt: sheet(
    'A dirt road runs straight across the lower third of the frame from the left edge to the right edge, through green farmland and willow trees, with a walled castle far off on the right horizon, in soft afternoon light with muted, natural colours and no sunset glare. Behind the road at the centre of the frame, a stream runs alongside it, spanned by one low humped stone bridge that belongs to a side path and does not touch the road. The bridge is fixed scenery: it has the same shape, size and position in all nine panels, and the cart never goes on it. The stream, willows, fence and road never change.',
    'A two-wheeled wooden ox cart loaded with rice sacks and a bound iron chest, a brown ox in front of the cart, always pulling it toward the right, and a carter in a straw hat walking a little ahead of the ox, leading it by a slack rope in one hand. He carries nothing else: no whip, switch, pole or stick. They move from left to right through the nine frames, always on the flat road in front of the bridge. The ox\'s legs and the cart wheels differ in each frame.',
    ['The cart enters at the far left, the ox stepping forward and dust rising under the wheels.',
      'It moves on past the first willow, the carter glancing back at the ox.',
      'The cart rolls along the flat road toward the centre and the ox leans into the yoke.',
      'A wheel jolts over a stone in the road at the centre of the frame, and the carter steadies the load with one hand.',
      'Past the stone, the sacks sway and the ox\'s head is up, the bridge unchanged behind them.',
      'The cart rolls on to the right of the centre, the carter walking beside the ox again.',
      'Moving right along the road, ducks scatter from the stream. The bridge still stands at the centre of the frame, unchanged, behind the cart.',
      'At the right part of the road, a farmer far back in the field behind the fence, much smaller than the carter, waves. The castle stays where it was on the horizon, and the bridge stands unchanged at the centre of the frame.',
      'The cart nears the right edge, the carter pointing with his empty free hand at the castle ahead, the rope in the other, the load all in place. The bridge stands unchanged at the centre of the frame.']) },
  // 搜索: 在城中寻访人才、金或米.
  search: { old: 'search', prompt: sheet(
    'Rolling hills at dusk at the edge of a village: a footpath from the lower left to a large thatched cottage with a door, lit windows and a small wooden gate that fills the right third of the frame in all nine panels, already near and large in frame 1, the same size and in the same place in every panel, so it never appears or grows. Tall grass and a stone marker on the left, the first stars in a deep violet-orange sky, in restrained colours.',
    'A traveller in a dark blue robe and wide straw hat, with a cloth bundle on his back, a staff and a small lit paper lantern, moving from left to right along the path to the cottage. Later, a young scholar in white comes out of the cottage.',
    ['The traveller walks up the path at the left, lantern swinging.',
      'He stops at the stone marker and holds up the lantern to read it.',
      'He walks on, and asks a farmer resting by the path. The farmer points at the cottage.',
      'He walks through the tall grass toward the cottage, stars brightening.',
      'He stands at the cottage gate and knocks with his staff, hat in hand.',
      'The door opens with warm light spilling out. A young scholar in white stands in it, holding a bamboo scroll.',
      'The traveller bows deeply and the scholar returns the bow.',
      'They sit on the step talking. The lantern on the ground glows. The scholar laughs.',
      'They come out of the gate together, the scholar with his own bundle, both looking at the castle silhouette on the far ridge under the stars.']) },
  // 侦察: 查看敌城的详细情报.
  scout: { old: 'scout', prompt: sheet(
    'Dawn on a rocky pine-covered ridge: a ledge of grey boulders and twisted pines in the foreground. Below, across a misty river valley, an enemy walled castle with many black-edged banners, smoke from kitchen fires, tents camped outside its gate. Blue-grey mist in the valley, the sun rising gold behind the far hills.',
    'A lean scout in a dark brown hooded short coat with a short sword and a coil of rope, on the boulders at the left of centre, seen from the side facing right. Tiny enemy soldiers around the castle.',
    ['In first light the scout climbs up onto the ledge, staying low.',
      'He crawls to the edge between two boulders, hood up.',
      'He shades his eyes with his hand and peers across the valley. The mist starts to lift.',
      'The mist has thinned and the castle shows clearly, with small lines of soldiers drilling at its gate.',
      'He takes out a bamboo slip and a brush and starts to write, glancing up.',
      'He counts on his fingers, looking at the tents. A tiny enemy patrol walks the far bank.',
      'He writes again. The sun clears the hills and warms the valley, and new smoke rises from the kitchens.',
      'He rolls the slip and ties it, tucking it into his coat.',
      // not "only his hooded head showing behind the boulder": the head was painted lying on the flat rock top with no edge in
      // front of it, a man sunk into the stone (D37, 2026-11-10; this frame repainted alone, docs/review-assets/2026-11-10/devblog-213-219-fix/scout)
      'He creeps away low across the top of the ledge toward the pines at the left, on hands and knees, his whole body in view on the rock, the bright castle in the valley unaware.']) },
  // 赈济 (once 施舍): 以金米赈济百姓，提高统治度.
  alms: { old: 'alms', prompt: sheet(
    'Outside the gate of a Han-dynasty county town in early winter: grey brick wall and gate behind, a relief shelter of bamboo and straw matting at the left, sacks of rice piled against the wall, snow patches on the ground, pale overcast light with a touch of warm sun.',
    'A kindly official in a dark blue robe with sleeves tied back and a black official cap, standing behind a large round black iron cauldron on a stone-ringed fire at the centre, with a long wooden ladle. Thin townsfolk in patched grey clothes with clay bowls, including an old man and a little girl.',
    ['Cold grey morning. The official pours rice from a sack into the cauldron. A few thin people wait at a distance, hunched.',
      'He stirs the pot. The fire catches and steam begins to rise. People raise their heads.',
      'He lifts the ladle and beckons to them. The old man comes forward first, with his bowl.',
      'He ladles steaming white gruel into the old man\'s bowl. More people line up behind.',
      'The old man sits by the wall and drinks, the steam on his face. The little girl holds up her bowl and the official bends to fill it.',
      'The line reaches back to the gate. The official keeps ladling, sweat on his brow, and an assistant brings another sack.',
      'People sit in groups around the shelter eating, some starting to smile, colour coming back.',
      'The old man comes back and bows low in thanks. The official raises him up by the arm.',
      'The same locked camera and framing as all the other panels, with the gate, wall, shelter and cauldron at exactly the same place and size. A faint warm glow comes through the overcast, only slightly warmer than before. The girl waves her empty bowl and the people, standing straighter now, bow toward the official beside his steaming pot, the figures at the same size as in frame 8.']) },
  // 赏赐: 赏金或赐宝，提高武将忠诚.
  reward: { old: 'reward', prompt: sheet(
    'The audience hall of a Han-dynasty governor: red lacquered pillars, a raised dais with a carved screen at the back, plain silk banners with no emblems or writing, a matte stone floor with only a soft sheen, not a mirror, in calm warm lamplight, with fewer lanterns and restrained colour.',
    'A lord in a rich dark red robe and crown. He sits on the dais only in frames 1 and 2; from frame 3 on he is standing and never sits down again. A loyal general in lamellar armour who has taken off his helmet, in the centre of the floor. He kneels from frame 2 to 7 and stands in frames 8 and 9. In frame 2 he sets his helmet on the floor beside him, and it stays on that exact spot in every later panel, still there in frame 9, never vanishing. A court attendant in dark green with one red lacquered tray of gold ingots.',
    ['The general walks up the hall alone, helmet under his arm, looking weary. The lord sits on the dais.',
      'He kneels on one knee and lowers his head before the dais.',
      'The lord stands and raises his hand. The attendant comes from the side with the tray.',
      'The attendant carries the tray up the hall, and gold glints in the lamplight.',
      'The lord comes down from the dais and takes the tray in his own hands.',
      'He holds it out to the general, who looks up in surprise.',
      'The general lifts both hands and receives the tray, overcome, and bows his head to it.',
      'The lord lays a hand on his shoulder and raises him up. The general stands, eyes bright.',
      'The general stands straight, a hand on his heart and his head high, and salutes the lord, the gold shining on the tray at his side.']) },
  // 买米: 在米市用金买米 (one of the three shared scenes split on 2026-11-07).
  'rice-buy': { old: 'market', prompt: sheet(
    'A rice market street under cloth awnings in morning sun: stalls piled with rice sacks and baskets of grain, a large wooden steelyard on a stand, a narrow street receding behind. The merchant\'s stall at the centre right is one long wooden counter, already there in frame 1, with the same shape, size and position in all nine panels; the baskets and sacks in the foreground never change place. The counter is in full view in every panel and nobody and nothing stands in front of it. The merchant stays behind it. Only what is on top of the counter changes. The handcart, when it comes, stands at the far left of the frame, well clear of the counter.',
    'A plump rice merchant in an ochre robe and small cloth cap behind his stall at the centre. A city quartermaster in a dark blue robe with an assistant who carries a heavy string of bronze coins and later a pole cart at the left.',
    ['The quartermaster arrives at the stall. The merchant bows, rubbing his hands.',
      'He reaches into a sack, and shows a handful of white rice grains. The quartermaster inspects them.',
      'The merchant holds up fingers for the price. The quartermaster shakes his head.',
      'They shake hands on it. The assistant steps up with the strings of bronze coins.',
      'The coins are counted onto the counter, pile by pile.',
      'The merchant scoops rice into a basket hanging from the steelyard, which tips with the weight, and he peers at the beam.',
      'A porter brings a sack around to the handcart standing at the far left, with the counter and the merchant in full view at the right. The assistant loads the sack.',
      'The cart at the far left is piled high with rice sacks. The quartermaster ties the load. The counter and merchant are unchanged at the right.',
      'They wheel the laden cart away out of the far left. The merchant, still behind the same counter, waves, the coins stacked on his counter, his sacks fewer behind him.']) },
  // 卖米: 在米市卖米换金.
  'rice-sell': { old: 'market', prompt: sheet(
    'A rice market street under cloth awnings in afternoon light: a merchant\'s stall at the right with an open empty storage bay and a strongbox on its counter; a large wooden steelyard on a stand; a narrow street receding behind at the left.',
    'A plump rice merchant in an ochre robe and small cloth cap behind the stall. A city quartermaster in a dark blue robe, with two porters and a handcart heavy with rice sacks from the city granary, coming from the left.',
    ['The heavy handcart is pushed in from the left by the porters, sacks piled high. The merchant looks up, and the bay behind him stands empty.',
      'The quartermaster pats a sack, and opens its neck. White rice shows.',
      'The merchant tastes a grain and nods, considering.',
      'The first sack hangs on the steelyard, the merchant peering at the beam.',
      'Porters carry sacks into the storage bay one after another, the cart emptying.',
      'The bay has filled up to shoulder height. The cart is nearly empty.',
      'The merchant opens his strongbox and draws out gold ingots and strings of coins.',
      'He counts them into the quartermaster\'s hands, gold shining.',
      'The quartermaster walks off to the left with a full heavy purse, the empty cart bumping behind the porters, and the merchant leans contentedly on his full stacks of rice.']) },
  // 卖宝: 每件宝物换100金.
  treasure: { old: 'market', prompt: sheet(
    'The dim inside of a curio dealer\'s shop on a market street: shelves of bronzes and jade, a low counter at the centre with a lamp on it, a strongbox behind the counter, the bright street through the doorway at the left.',
    'A thin old dealer in a dark brown robe and small cap, with a magnifying-eyed squint and a long thin moustache, behind the counter. A city steward in a dark blue robe carrying a cloth-wrapped bundle.',
    ['The steward comes in at the doorway with the wrapped bundle held in both hands.',
      'He lays it on the counter. The dealer leans forward with interest.',
      'The cloth is unfolded: a beautiful green jade disc gleams in the lamplight.',
      'The dealer picks it up and holds it to the lamp, the light glowing through it.',
      'He taps it with a fingernail and listens with his eyes shut.',
      'He looks at the steward and raises his fingers for the price. The steward nods slowly.',
      'He opens the strongbox and sets rows of gold ingots on the counter.',
      'The steward gathers the gold into his bag, and glances once at the jade.',
      'The steward leaves through the bright doorway with his heavy bag. The jade disc sits on its stand on the shelf, shining, and the dealer bows after him.']) },
  // 医馆 (once 病院): 花50金为武将治伤.
  hospital: { old: 'hospital', prompt: sheet(
    'Inside a Han-dynasty physician\'s house: a tall cabinet of many small herb drawers at the back left, an open doorway at the far left of the back wall, present and unchanged in all nine panels, bundles of dried herbs hanging from the beams, a clay pot steaming on a charcoal brazier at the right, a low couch at the centre, and a small work table with a stone mortar at the left beside the cabinet, at the same depth as the couch. All furniture is present from frame 1 and stays the same size and in the same place in all nine panels: nothing appears, moves or disappears, and nothing large stands in the foreground. Warm window light in restrained colour, not heavily orange.',
    'One single elderly physician with a long white beard, in a light grey robe and black cap, the same size in every panel. There is never a second physician: he appears exactly once in each panel, either by the couch or at the cabinet, never in both places. A wounded general wearing the same plain off-white under-robe and dark trousers in all nine panels, never bare-chested and never in other clothes. His left arm and shoulder are in a bloodied bandage until frame 6, and a clean white bandage from frame 7 on.',
    ['The general comes in through the door at the left, holding his arm, his face pale. The physician looks up from the cabinet.',
      'The physician helps him down onto the couch, and unwinds the bloody bandage.',
      'He has walked over to the cabinet and pulls out a drawer. The general sits alone on the couch.',
      'He grinds herbs in a stone mortar, the pestle pressed down.',
      'He spoons the brew from the steaming pot into a bowl.',
      'He presses the green paste on the wound while the general grits his teeth.',
      'He winds a clean white bandage. The general drinks from the bowl.',
      'The general sits up, colour back in his face, and flexes his hand.',
      'The general stands and swings his healed arm in a strong arc, smiling, and bows to the physician, who strokes his beard.']) },
  // 学问所: 知力80以下的武将可在此学习.
  school: { old: 'school', prompt: sheet(
    'A quiet study hall: shelves of rolled bamboo-slip books and silk scrolls, a low writing desk, an oil lamp on the desk, a round lattice window with plum blossom outside, sunlight on the floor that turns slowly from afternoon to lamp-lit evening over the frames.',
    'A young officer in a blue scholar\'s robe, with a black topknot cap, at the desk. An old teacher in white may appear at the end.',
    ['Afternoon sun. The officer sits down at the desk with a stack of bamboo books, looking doubtful.',
      'He unrolls one and reads, head bent, finger on the slips.',
      'He scratches his head and frowns over it. More scrolls lie round him.',
      'The light has moved. He writes with a brush, copying.',
      'He nods off, chin on his hand, the sunset red in the window.',
      'He jerks awake, lights the lamp, and takes up the book again.',
      'Dark outside. In lamp light, books pile on both sides of him and he reads with intense attention.',
      'He looks up in sudden understanding, one hand lifted with a finger raised, the room brighter around him.',
      'Dawn in the round window, plum blossoms falling. He stands straight with a rolled book in hand, smiling, and the old teacher, who has walked in, stands on the floor nearby and nods approval. The room is unchanged: the bookshelves are the same as in every panel and no new door or opening appears in them.']) },
  // 武器屋: 为武将购买武器与防具.
  weapons: { old: 'weapons', prompt: sheet(
    'A Han-dynasty smithy: a glowing charcoal forge with bellows at the left, an iron anvil on a stump in the middle, a low stone quench trough right beside the anvil on its right side within arm\'s reach, a grinding wheel on a bench against the back wall directly behind the anvil within a step, racks of spears, halberds and swords on the walls, restrained orange forge light against a dark interior. The camera is locked. The anvil, stump, grinding wheel and trough are all present from frame 1 and stay in exactly the same place and size in all nine panels: they never move, vanish or appear, whoever is standing near them. The smith works just to the left of the anvil and hardly moves across the room.',
    'A muscular blacksmith in a leather apron and cloth headband, at the anvil. A young general in plain armour, waiting at the right of the room, well clear of the trough, with open floor between them. The general is visible in all nine panels, at the same spot and size in frames 1 to 8, and is never hidden or missing.',
    ['The smith stands at the forge, to the left of the anvil, and draws a glowing orange blade with tongs. The anvil and stump are already in the middle of the floor at exactly the position and size they have in every later panel. The general stands watching.',
      'He lays it on the anvil and raises the hammer high.',
      'The hammer strikes the blade: sparks burst outward.',
      'Hammer up again, the blade dimmer. Sparks are falling.',
      'Another blow, sparks, the blade already longer and straighter.',
      'Without leaving the anvil, the smith leans over and plunges the blade into the trough beside it. A small plume of white steam rises straight up from the trough, and the general still stands in full view at the right.',
      'He has turned to the wheel just behind the anvil and grinds the edge, a thin line of sparks coming off it. The anvil and trough stay in place in front of him.',
      'Back beside the anvil, he holds up the finished sword. It flashes along its edge, and he offers it hilt first toward the general.',
      'The general swings the new sword in the forge light and it gleams, and he nods to the smith, who folds his arms, satisfied.']) },
  // 征兵: 每100兵20金，征得的兵进入预备兵.
  conscript: { old: 'conscript', prompt: sheet(
    'A packed-earth drill ground outside a city wall at noon: tall red war banners on poles, a weapon rack of spears, a drum on a stand, a recruiting table under an awning at the left, the grey city wall and a gate tower behind.',
    'A recruiting officer in red lamellar armour at the table, and young peasants in plain grey clothes who come in small groups. Those recruited wear red tunics with leather vests and carry spears. Every man is a grown adult, lean and tall, seven heads tall with a small head and long legs, never stocky, childlike or big-headed, including the small men in the ranks. The table, awning, drum and rack stay exactly in place in all nine panels. A clerk in grey sits at the table writing on bamboo slips in every panel from frame 2 to frame 9, and the table is always there, even after the officer leaves it to drill the men: never replaced by crates and never removed. Colours are natural and restrained: a pale hazy sky, dusty earth, dull red, not a saturated blue sky.',
    ['The drum stands silent. The officer sits at the table. Three young peasants hesitate at the gate.',
      'He beats the drum. Peasants come out through the gate in a growing line toward the table.',
      'They give their names one by one to a clerk, who is writing on bamboo slips.',
      'At the rack, they are handed spears and red tunics, awkwardly pulling them on.',
      'A ragged line of recruits stands on the ground, spears all at different angles. The officer shouts at them.',
      'He shows the thrust. They try it, badly, and one drops his spear.',
      'They lunge together, nearly in time, dust rising.',
      'A straight block of recruits stands in ranks, spears upright, as more join the rear.',
      'A full block of soldiers thrusts as one in a cloud of dust, red banners flying above them, and the officer raises his fist.']) },
  // 同盟: 遣使与他国结盟，或废除现有同盟 (the shared envoy scene split on 2026-11-07).
  ally: { old: 'envoy', prompt: sheet(
    'A pavilion on neutral ground at sunset: red pillars and a tiled roof open on all sides, a stone table in the middle, wide grassy plain and a road in the distance with calm golden light, in restrained colour. The pavilion is drawn once and repeated: it has exactly the same size and position in all nine panels, large in the frame from panel 1, with its base and steps at the same height in every panel. The stone table inside it is one small round table on a carved pedestal: it stays that same round pedestal table at the same size and place in all nine panels, never turning into a low flat slab or a wide counter, and the people stand behind or beside it. The silk treaty in frames 8 and 9 is small enough to lie on that round table and is a plain pale sheet with only two red seal stamps, with no lines of writing and no characters. Banners are plain red and plain blue, with no emblems or characters.',
    'An envoy in a red travelling robe and black cap arrives from the left. A foreign envoy in a dark blue robe and black cap comes from the right. Each has a few attendants holding banners: one red, one blue.',
    ['The two parties ride in from either side along the road, small and far from the pavilion.',
      'They dismount at the foot of the steps, and the banners are planted on either side.',
      'They walk up and bow to each other across the stone table.',
      'A sealed letter is presented and read by the blue envoy, who nods.',
      'An attendant brings a bowl of wine and a small knife to the table.',
      'Each pricks a finger and lets a drop fall in the wine.',
      'They drink in turn from the bowl, both looking solemn.',
      'They press their seals onto a silk treaty on the table.',
      'They clasp hands above the table and smile, and their attendants carry the red and blue banners together, side by side, against the sunset.']) },
  // 引拔: 劝诱敌将投奔我军.
  poach: { old: 'envoy', prompt: sheet(
    'A quiet side courtyard of an enemy town at night: a plum tree, a stone bench, a moon behind thin clouds, a garden wall with a small back gate at the left, a lit window in a house at the right.',
    'A go-between in a plain grey traveller\'s robe with a wide hat and a hidden letter. An enemy officer in a plain dark blue robe, restless, with a sword at his belt.',
    ['The officer sits on the bench under the plum tree, looking at the moon, an empty cup in his hand.',
      'The little back gate opens a crack. The go-between slips in, hat low.',
      'He walks up and bows, then glances around. The officer\'s hand goes to his sword.',
      'He takes off his hat and shows a token. The officer stops and looks at it.',
      'He hands over a letter sealed in red. The officer holds it up to the moonlight and reads.',
      'The officer looks up, his face moved, staring far off. The go-between speaks quietly, gesturing to the left.',
      'He takes off the dark blue sash of his rank and looks at it for a moment.',
      'He lets it drop on the bench, and fastens on his sword.',
      'The two of them slip out through the little back gate. The sash lies on the bench under the moon, plum petals falling on it.']) },
  // 离间: 散布流言，降低敌将忠诚.
  discord: { old: 'envoy', prompt: sheet(
    'A wine shop and street corner in an enemy town at dusk, with a noticeboard wall at the right beside the road to a lord\'s gate in the distance; paper lanterns are being lit. Every paper in the scene, on the noticeboard and in the hands of anyone, is a plain pale sheet with only one red seal stamp: no lines of writing, no characters, no scribbles or marks that resemble text.',
    'A spy in a merchant\'s brown robe and cloth cap at a table in the wine shop with townsfolk. An enemy general in fine armour, who walks by later. Small townsfolk who whisper.',
    ['The spy sits with two soldiers in the wine shop, pouring them drinks and smiling.',
      'He leans over and whispers behind his hand. The soldiers\' eyes widen.',
      'He slips out into the street and, while nobody looks, pastes a paper on the noticeboard.',
      'A crowd gathers at the noticeboard, pointing and reading.',
      'Small groups across the street whisper behind their hands, glancing toward the lord\'s gate.',
      'The enemy general rides by. People fall silent and look away from him, then whisper again behind him.',
      'He stops, and rips the paper from the board, reading it. His face darkens.',
      'He crushes it in his fist, glaring at the lord\'s gate in the distance.',
      'He stands alone in the emptied street under the lanterns, staring at the far gate with distrust. Inside the wine shop the spy quietly raises his cup.']) },
  // 记录: the writing is the date set by the game itself (src/vignette.js write), on the paper left blank here.
  record: { old: 'record', prompt: sheet(
    'Seen from slightly above, a dark lacquered wooden writing table in warm candlelight, with deep shadow beyond it. An ink stone with red cinnabar ink and a brush on a brush rest stand at the top left corner of the table. A candle stands at the top right. The brush lies on its rest in frames 1 to 5, and from frame 6 on the rest is empty.',
    'Nobody appears in the picture. Only the scroll, which has a heavy wooden roller with red-brown silk wrapping and turned end-caps, and two hands in dark red sleeves. Hands appear only in frames 2 to 6. The camera and the table never move, and the scroll, once open in frame 5, stays exactly in place.',
    ['The closed scroll lies on the table at the left, tied with a red cord. The candle burns.',
      'Two hands in dark red sleeves untie the cord.',
      'The hands push the roller to the right: a band of cream paper, completely blank, opens behind it.',
      'The roller moves further right, the blank paper wider.',
      'The roller reaches the right part of the table and the hands smooth the paper flat.',
      'One hand in a dark red sleeve reaches over to the ink stone at the top left and lifts the brush off its rest. The wide blank paper lies across the centre of the table.',
      'The hands have gone, and the brush with them: the brush rest stands empty beside the ink stone. Blank paper lies still on the table, with the flame upright.',
      'The same still table, with the empty brush rest: blank paper, with the flame slightly lower.',
      'The same still table, with the empty brush rest: wide completely blank paper in the warm candlelight, the flame steady. The paper has no writing or marks in any frame.']) },
  // 四月税金 (month event): a clerk tallies the tax coin at the treasury gate.
  tax: { old: 'tax', prompt: sheet(
    'Spring in front of a Han-dynasty county treasury: a gate of red-lacquered pillars under a grey tile roof, a low trestle table and a bamboo ledger at the left, peach blossom on a branch over the wall, clear morning light. The chests by the gate begin empty.',
    'A county clerk in a dark green official robe and black gauze cap at the table, with a brush. Small townsfolk who bring strings of coins and bolts of cloth, in a line from the right.',
    ['The clerk sets out his ledger. Empty iron-bound chests stand open by the gate. The first townsman walks up.',
      'The man puts a string of bronze coins on the table. The clerk writes it down.',
      'A woman brings coins and a bolt of cloth. The line stretches off behind her.',
      'A porter pours coins into the first chest with a rattling shower.',
      'The line goes on. The first chest is full and the second half full.',
      'The clerk lifts a long string of coins and counts it with his brush hand.',
      'Carts bring strings of coins and the chests fill. Petals fall across the table.',
      'The last townsman leaves. The clerk adds up the totals, and closes the ledger.',
      'Porters shoulder the full, iron-bound chests through the red gate, and the clerk watches them pass with the closed ledger under his arm, a petal on his cap.']) },
  // 十月收米 (month event): reaping the ripe rice in an autumn field.
  harvest: { old: 'harvest', prompt: sheet(
    'An autumn paddy field in soft late-afternoon light: rows of ripe rice bending heavy-headed fill the frame, a thatched farmhouse and a few russet trees behind, a long empty wooden drying rack at the right, a low gentle sun and long shadows. Colours are natural and restrained: muted straw gold and soft browns with a pale sky, not saturated orange, no glowing sunburst and no bright red leaves in the foreground. The drying rack is one long fence-like frame with five posts, spanning the right 40% of the panel from the right edge, already at that full length in frame 1, exactly the same in all nine panels: it never grows or gets extended, and only the sheaves hanging on it change.',
    'A farmer in a faded indigo jacket and conical straw hat with a bronze sickle, his wife in a brown jacket, and a small boy. They work in the middle of the field, and the farmer is about a third of the panel height in every panel, including frames 1 to 3: he never comes close to the camera or grows larger. In frames 1 to 3 he stands in the middle distance, at the same depth and the same small size as in frames 4 to 9, his whole body visible from hat to knees above the rice, with rice around his knees and a wide band of uncut rice in front of him. Avoid any close-up of him: his hat must be no larger in frame 1 than in frame 7. Keep the sun soft behind thin haze, with no glare.',
    ['The farmer wades into the tall rice with his sickle, a broad smile on his face.',
      'He bends, gathers stalks in his left hand, the sickle drawn back.',
      'The cut: he sweeps through the stalks and lifts the sheaf.',
      'A strip has been cut. He and his wife work along it, and sheaves lie behind them.',
      'The wife binds a sheaf and the boy runs with another in his arms.',
      'They hang sheaves on the rack, which is half covered.',
      'Half the field is stubble now. The rack is full and a second heap has been stacked.',
      'They beat sheaves on a threshing frame and grain flies in the low light, pouring into a big basket.',
      'Baskets and sacks of golden grain stand piled in front of the farmhouse. The family stands around them, the farmer lifting the boy up, in the last warm light.']) },
  // AI 间战争 (FC: 「××軍　出陣」, a general and a rider gallop through dust under a red sky).
  sortie: { old: 'sortie', prompt: sheet(
    'A wide battlefield plain under a subdued evening sky of dusty rose and muted amber fading into slate grey, with long soft clouds and a low hazy sun with no glare, not a saturated red or orange sky. A ridge of dark hills behind, a distant fortress on the far right, open trampled earth in the foreground. The sky and light stay the same in all nine panels.',
    'A general in lamellar armour and a red-plumed helmet on a dark bay warhorse with a long ji halberd, a rider beside him with a red pennant, and a mass of cavalry and infantry with many banners behind them, all moving left to right.',
    ['Empty plain. On the left horizon, a line of banners rises into view with dust behind it.',
      'The general and his rider come over the rise at a trot with the army behind.',
      'He raises the halberd to signal. Horns blow and the banners dip forward.',
      'The horses break into a gallop with their legs gathered, dust kicking up.',
      'Legs fully stretched, the halberd levelled, the column filling the left half.',
      'The army pours across the middle of the plain, dust rolling behind.',
      'The general gallops through the centre at full tilt, his red plume streaming.',
      'The front of the army reaches the right side, the fortress the same size as before. On the fortress towers, two thin pale columns of beacon smoke rise, with no flames: the fortress itself is whole and not burning.',
      'A huge cloud of dust and a forest of banners sweep toward the fortress under the same subdued evening sky, with the thin beacon smoke still rising from the intact towers. The general rides at the front of the army at the right, the same size as in frame 8.']) },
  // 旱灾 (src/app.js showEvent 'disaster'): the land itself drying out.
  drought: { old: 'drought', prompt: sheet(
    'A farming valley at midday in summer: terraced paddy fields, an irrigation ditch with a wooden water wheel, a thatched farmhouse and a few trees in the distance. The sun stands high in a sky that starts pale blue. The whole sequence shows the same place getting worse.',
    'A gaunt farmer in a patched hemp tunic and rolled trousers, conical straw hat, barefoot, with a carrying pole and two buckets.',
    ['Green rice in wet paddies, but the water is low. The farmer walks along the bank and looks up at the white sun.',
      'Paddies half dry, rice paling at the tips. The water wheel stands still above a thin trickle.',
      'The ditch is dry, the wheel stranded. He carries two buckets from far off, walking stooped.',
      'He pours a bucket on the wilted rice: a tiny dark patch on the mud.',
      'The paddies crack into plates of grey mud. Rice is yellow and falling over. Heat haze shimmers. The sky has gone pale and colourless.',
      'He kneels and digs with his hands in the dry ditch, finding only dust.',
      'He sits back, looking up at the fierce sun, his hat fallen off. Trees have lost their leaves.',
      'He stands holding up a fistful of dry earth, which crumbles and blows away through his fingers.',
      'The whole valley is deep polygonal cracks and flattened yellow straw under a white sun, and the farmer stands small and still among it, an empty bucket lying on its side at his feet.']) },
  // 洪水 (src/app.js showEvent 'disaster'): the river breaks through into the town.
  flood: { old: 'flood', prompt: sheet(
    'A riverside market town of white-walled, grey-tiled houses, with a stone bridge at the right and an earthen dyke across the distance holding back the river, under a dark slate storm sky with slanting rain. A street runs through the foreground.',
    'A villager in a short tunic, straw rain cape and conical straw hat, with a cloth sack, in the street. A few small figures who run. The house he finally climbs onto is already there in frame 1: one wide low white house at the left of the middle distance, one third of the panel wide, with a dark tiled roof, drawn at exactly that same width, size and position in all nine panels, including frames 6 and 7. No building appears, grows or widens at any point, and the buildings only sink as the water rises. The dyke stays broken: once the gap opens in frame 2, the same gap with brown water pouring through it is visible at the same place in every later panel, 3 to 9, widening only, never closed or hidden.',
    ['Heavy rain on the street. The villager hurries along. The river stands high behind the dyke.',
      'A section of the far dyke slumps and brown water spouts through it. The villager turns to look.',
      'The dyke gives way and a brown flood pours over the fields toward the town.',
      'Water rushes up the street, ankle-deep, carrying baskets. People run.',
      'The water reaches the knees. The villager grabs his sack and wades, pushing through it.',
      'It is at the window sills. He is waist-deep, facing right with his face visible, holding his sack above his head in both raised arms. A sampan spins past.',
      'Muddy water swirls past the doors, with planks and baskets floating. The bridge is half under, and he struggles on against the current.',
      'He reaches the roof of that same low house at the left and is hauled up by others on it, soaked.',
      'The town is drowned to the eaves under the slanting rain, with brown water everywhere and floating wreckage, and a small huddle of people on the roof.']) },
};

// The last frame (from 0) that does not yet tell the outcome, for scenes whose outcome can go the other way: a 计略 or
// mission that fails plays up to here and the result window takes over (src/vignette.js story).
const ATTEMPT = { 'st-fire': 3, 'st-trap': 2, 'st-ruse': 3, 'st-ambush': 3, 'st-rapids': 3, 'st-firearrow': 3, 'st-feint': 5, 'st-strife': 1, 'st-lure': 5,
  'st-rock': 2, 'st-chain': 2, 'st-encircle': 5, 'st-water': 3, 'st-bow': 2, 'st-firestorm': 3, 'st-magic': 2, search: 3, ally: 3, poach: 4, discord: 2 };

// What the game draws over a scene, kept in its index entry (src/vignette.js write()). Coordinates are in the 640-wide frame.
const EXTRA = {
  record: { text: { quad: [[82, 103], [240, 78], [548, 262], [328, 348]], u: 0.88, du: 0.19, v: 0.7, dv: 0.15, su: 0.18, sv: 0.11, from: 0.62, to: 0.92 } },
};
// How a scene is built (tools/build_storyboards.py). fresh: frames taken whole instead of locked to the one before,
// where a thin object has really gone (the brush off its rest). hold: each frame's share of the show.
// fine: [x0, y0, x1, y1, threshold] boxes in the 640×426 frame where a small thing that has gone (a head, a stick) is
// cleared from the lock instead of staying behind as a ghost. quant: 'kmeans' where median cut loses a small saturated or bright patch.
const BUILD = {
  record: { fresh: [6], hold: [0.4, 0.4, 0.5, 0.5, 0.5, 0.6, 0.3, 0.3, 1.6] },
  reward: { fine: [[260, 50, 430, 240, 22]] }, // the lord's head and crown stayed on the dais after he stood and came down
  // the drumstick stayed on the drum head; a recruit's head and a slanted spear stayed on the gate after they had walked on
  conscript: { fine: [[150, 150, 290, 300, 22], [410, 170, 500, 235, 12]] },
  'st-chain': { fine: [[240, 170, 380, 390, 22]] }, // a gap in the chain, a helmet left floating on the water
  'st-ruse': { fine: [[360, 240, 480, 350, 22]] }, // a hoof left beside the horse's forelegs
  // frame 6: the hand he held the letter out with stayed beside him after he opened his arms (D35, 2026-11-10);
  // frame 9, at the gate: the officer's head was lost against the dark doorway and the open door kept the shut one's planks
  poach: { fine: [[150, 170, 300, 350, 22], [20, 110, 130, 300, 14]] },
  'st-firearrow': { fine: [[0, 110, 340, 280, 9]] }, // the archers' bows stayed hanging in the air after they had crouched again
  pop: { quant: 'kmeans' }, // the blue banners came out grey
  // land: in frames 1 and 4 the raised hoe's head was drawn as an axe; repainted by an image edit as a thin L-shaped hoe
  // blade standing up toward the sky and patched into those two shipped frames only (sheet.png holds the fix,
  // sheet-before-hoefix.png the original; 2026-11-07).
  // median cut turned the moon into a flat cream disc with yellow specks in the clouds, and the sun into a blown-out blob
  'st-feint': { quant: 'kmeans' }, 'st-strife': { quant: 'kmeans' }, 'st-lure': { quant: 'kmeans' },
  'st-fire': { quant: 'kmeans' }, 'st-rock': { quant: 'kmeans' }, scout: { quant: 'kmeans' }, ally: { quant: 'kmeans' },
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [scene, flag] = process.argv.slice(2);
  if (scene === '--list') { console.log(Object.keys(SCENES).join('\n')); process.exit(0); }
  const S = SCENES[scene];
  if (!S) { console.error('unknown scene'); process.exit(1); }
  if (flag === '--attempt') { if (ATTEMPT[scene] != null) console.log(ATTEMPT[scene]); process.exit(0); }
  if (flag === '--build') { console.log(JSON.stringify(BUILD[scene] || {})); process.exit(0); }
  if (flag === '--extra') { console.log(JSON.stringify(EXTRA[scene] || {})); process.exit(0); }
  if (flag === '--refs') console.log(['assets/ai/title.webp', `assets/ai/vignettes/source/${S.old}/bg.webp`, ...(S.refs || [])].join('\n'));
  else process.stdout.write(`${S.prompt}\n\nThe second reference image is an earlier painting of this place: use it for mood, palette and detail only, not for its figures, and follow the description and the sheet layout above.${S.cast ? `\n${S.cast}` : ''}`);
}
