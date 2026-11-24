// Prompt source for the extended troop looks' battle sprites (数据包势力的兵种外观, looks only: each borrows
// the rules of an original kind). One side-view figure per side × look, the reference the 4×4 action sheets
// (troop_frame_prompts.mjs) are later drawn from. The attacker sprite is drawn first with the original
// attacker sprite of the borrowed kind as style anchor; the defender sprite is the same man recoloured,
// drawn from the approved attacker one.
//   node hd2d-mvp/tools/troop_sprite_prompts.mjs <attacker|defender>-<elephant|hillman|ashigaru|steppe>
import { fileURLToPath } from 'node:url';

// Which original kind each look borrows (rules and the style-anchor sprite).
export const BORROW = { elephant: 'cavalry', hillman: 'soldier', ashigaru: 'soldier', steppe: 'cavalry' };

// Army colours are the same as the original troops so both sides stay readable in a mixed battle.
const ARMY = {
  attacker: 'teal-green and silver (the attacking army\'s colours: teal-green cloth, sashes, plume or banner, silver/iron metal)',
  defender: 'crimson and gold (the defending army\'s colours: red cloth, sashes, plume or banner, bronze/gold metal)',
};

const LOOK = {
  elephant: {
    name: 'Nanman war elephant (南蛮战象) of the southern tribes of Three Kingdoms-era Yunnan',
    body: `A huge Asian war elephant walking forward in a steady battle stride, trunk curled down and forward, two long ivory tusks clearly visible, small ears, thick grey wrinkled hide.
It wears rattan-and-leather barding (藤甲) over its head and flanks — woven rattan plates lashed with cord, painted in the army colour — and a woven howdah-less saddle pad.
One Nanman rider sits high on its neck: bare tanned arms, bead and bone necklace, a wrapped cloth turban with ONE or two short pheasant tail feathers stuck in it (NOT a ring of feathers, NOT a Native American war bonnet), rattan breastplate, holding a long spear levelled forward over the elephant's head.
The elephant must be clearly LARGER and heavier than a horse: it fills the canvas the way the horse does in the style reference, but its body is much taller and bulkier. At 64 pixels tall the tusks, the trunk and the rider's spear must still read.`,
  },
  hillman: {
    name: 'mountain tribal warrior (山岳蛮兵, like the 山越 hill peoples of the southern mountains)',
    body: `A lean, wiry foot warrior advancing in a low, springy crouch, ready to strike — lighter and quicker-looking than an armoured Han spearman.
Cloth headwrap with a feather, bare muscular arms with simple tattoo bands, a short quilted vest or a hide-and-rattan cuirass, a short wrap skirt over leggings, straw sandals.
Weapons: a broad single-edged machete-like blade (山刀) raised in one hand and a long narrow wooden shield painted with a tribal pattern in the other; a short throwing spear slung on his back.
No lamellar armour, no helmet, no halberd. At 64 pixels tall he must read as "lean barefoot-looking hillman with a big chopping blade and a tall narrow shield", never as a Han soldier.`,
  },
  ashigaru: {
    name: 'Japanese ashigaru foot soldier (日本足轻) of the Japanese archipelago',
    body: `A foot soldier braced in a forward lunge, thrusting an extremely long yari spear (長槍) — the shaft about twice his own height, held low and level in both hands, point far out in front.
Conical lacquered jingasa hat (陣笠), simple lacquered okegawa-dō cuirass with a small skirt of plates, kote sleeves, hakama tied at the shin with leg wraps, waraji straw sandals.
A narrow vertical sashimono banner on a pole rising behind his back, in the army colour with a simple plain crest (no readable text).
No round shield, no Chinese helmet or plume. At 64 pixels tall he must read as "conical hat, very long spear, back banner".`,
  },
  steppe: {
    name: 'Xiongnu heavy steppe cavalryman (匈奴铁骑) of the northern grasslands',
    body: `A heavily armoured steppe horseman charging at a gallop, couching a long lance with a pennant, leaning forward low in the saddle.
Rider: fur-trimmed pointed iron helmet with a mail aventail, long coat of iron scale armour over a fur-lined robe, fur boots, a recurve bow case and quiver hanging at the hip, braided hair.
Horse: a stocky shaggy steppe horse, with iron scale barding over its chest and neck, a fur-and-felt saddle blanket, tassels in the army colour.
He must read as heavier and more barbaric than the Han light cavalry of the style reference: fur, iron scales, armoured horse. At 64 pixels tall the lance, the fur trim and the armoured horse must read.`,
  },
};

export function troopSpritePrompt(key) {
  const [side, look] = key.split('-');
  if (!ARMY[side] || !LOOK[look]) throw new Error(`unknown troop look ${key}`);
  const L = LOOK[look];
  const refs = side === 'attacker'
    ? `Reference image 1 is an approved battle sprite of a DIFFERENT unit (a Han ${BORROW[look] === 'cavalry' ? 'light cavalryman' : 'spearman'}) from the same game: match ONLY its pixel-art rendering style, pixel scale, outline weight, shading, side-view framing and how much of the canvas the figure fills — not its costume, weapon or race.`
    : `Reference image 1 is the approved sprite of THIS EXACT unit in the attacking army's teal-green colours: draw the SAME figure — same pose, silhouette, ${look === 'elephant' || look === 'steppe' ? 'mount, ' : ''}weapon, equipment and proportions — and change ONLY the army-colour parts (cloth, sashes, banner, barding paint, tassels) to crimson and gold, and silver metal to bronze. Skin, hide, fur, wood and rattan keep their natural colours.`;
  return `Game sprite source art for an HD-2D remake of the 1992 Famicom strategy game "Sangokushi II: Haou no Tairiku" — a rank-and-file troop of an extended-map faction, seen in small squads on the tactical battlefield.
Subject: ${L.name}.
${L.body}
Army colours: ${ARMY[side]} — used for cloth, sashes, banner and barding paint, so the side is obvious at a glance; the costume itself stays culturally ${look === 'ashigaru' ? 'Japanese' : look === 'steppe' ? 'steppe nomad' : 'southern tribal'}, not Han Chinese.

Format (critical):
- Full-body side view, the whole figure${look === 'elephant' || look === 'steppe' ? ' and mount' : ''} facing RIGHT, nothing cropped, feet${look === 'elephant' || look === 'steppe' ? ' and hooves/feet of the animal' : ''} visible, weapon tip inside the canvas.
- Detailed 16-bit SNES/Octopath-style pixel art with crisp pixel clusters, dark outlines and 3-tone shading, light from the upper left; no anti-aliased painterly blur. Bold, simple shapes that read at 64 pixels tall.
- One single figure, centred, landscape 1536x1024 canvas, the figure filling about 80% of the canvas height with a clear margin all round.
- Background: one perfectly flat solid magenta (#FF00FF) colour everywhere around the figure — no ground, no shadow, no gradient, no scenery, no text. Do not use magenta or pink anywhere on the figure.
${refs}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(troopSpritePrompt(process.argv[2] || '')); } catch (e) { console.error(e.message); process.exit(1); }
}
