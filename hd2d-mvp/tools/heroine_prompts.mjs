// Battle looks for women generals (女将) that data packs can give their own officers: one look per weapon class,
// drawn through the same sprite and 单挑 pipelines as the star officers (sprite_prompts.mjs, duel_frame_prompts.mjs),
// keyed by a look name instead of an officer id. Nobody in the original game wears them.
//   node hd2d-mvp/tools/heroine_prompts.mjs            → prints the look keys
// Design rules for all three (2026-11-24; the first f-spear draw read too boyish, the user asked for clearer
// female features: long loose hair down the back, a visibly feminine figure and face; then a clearly shaped bust): an Eastern Han (c. 190 AD) heroine whose femininity reads in the
// silhouette at 70–128 px — high Han topknot with long ribbon tails, a cuirass shaped to a slim waist, long
// gathered sleeves and a layered robe skirt over the saddle — not in exposed skin. No Tang high-waisted skirts,
// Ming phoenix crowns or round mirror breastplates (明光铠, later dynasties), no fantasy or bikini armour. Accent
// colours keep clear of pink, rose and purple: the sheets are keyed on magenta and the slicers turn pinkish
// pixels into outline.

const COMMON = 'Eastern Han dynasty (c. 190 AD) woman general, unmistakably a young WOMAN at first glance even at small sprite size: a beautiful heroine with a clearly feminine figure — narrow shoulders, slim arms, a clearly visible full bust (the cuirass is moulded over two rounded breast shapes, readable in side view as a curved chest line, never a flat male chest; no cleavage or bare skin), a very narrow belt-cinched waist below it and rounder hips — an hourglass side profile — noticeably smaller and lighter-framed than a male general on the same horse; a soft oval face with large almond-shaped eyes, long lashes, fine arched brows, rouged cheeks and bright red lips, jade drop earrings; calm, resolute expression; no helmet; fully clothed and armoured, no bare skin apart from face and hands; NOT Tang-style high-waisted skirts, NOT a Ming phoenix crown, NOT round mirror breastplates, NOT fantasy or bikini armour';

export const HEROINES = {
  'f-spear': {
    name: '女将·枪', weapon: 16, war: 90, int: 70, virtue: 80,
    accent: 'vermilion red and silver',
    look: `${COMMON}. Very long glossy black hair: the top gathered in a high Han topknot bun with a small silver hairpin and a vermilion silk ribbon, and the rest falling loose in a long thick ponytail down her back to the saddle, streaming behind her when she moves (the long hair and the curved chest line are her clearest silhouette cues: keep both in every pose); two long ribbon tails flutter beside it; soft side locks frame the face. She wears Eastern Han lamellar armour (zha jia) of small silver-white lacquered iron plates laced with vermilion cord: a cuirass shaped to her slim waist, short lamellar shoulder guards, cinched by a dark leather belt with a bronze hook buckle (dai gou). Under it a vermilion-red Han robe with long sleeves gathered at the wrists and a long layered skirt that falls over the saddle past her knees, dark riding boots, and a long vermilion cloak. She carries a long Han iron spear (mao): a slender leaf-shaped spearhead with a small red horsehair tassel tied just BELOW THE SPEARHEAD at the front end (nothing at the butt end), on a dark lacquered shaft taller than she is. She rides a white horse.`,
    mount: 'a white warhorse with vermilion-and-silver Han tack and a red chest tassel',
  },
  'f-blade': {
    name: '女将·刀', weapon: 9, war: 92, int: 60, virtue: 70,
    accent: 'ochre gold and black',
    look: `${COMMON}. Very long glossy black hair: the top drawn up into a high Han topknot held by a gold hairpin and a black silk band, and the rest plaited into one long thick braid that hangs down her back past the saddle and swings behind her when she moves (the long braid and the curved chest line are her clearest silhouette cues: keep both in every pose); soft side locks frame the face; gold drop earrings; a fierce, proud look. She wears Eastern Han lamellar armour (zha jia) of small black-lacquered iron plates laced with ochre-gold cord and edged in gold: a cuirass shaped to her figure, short lamellar shoulder guards, cinched by a broad dark leather belt with a gold hook buckle (dai gou). Under it an ochre-gold Han robe with long sleeves gathered at the wrists and a long layered dark skirt with gold hems falling over the saddle past her knees, black riding boots, and a long black cloak lined with ochre gold. She wields a long-hafted Han glaive (mei jian dao): a slender, gently curved single-edged blade shaped like an eyebrow, with a small gold collar, at the top of a black lacquered wooden shaft taller than she is; a small ochre tassel at the collar. She rides a chestnut horse.`,
    mount: 'a chestnut warhorse with a dark mane, black-and-gold Han tack and an ochre chest tassel',
  },
  'f-sword': {
    name: '女将·剑', weapon: 2, war: 88, int: 82, virtue: 85,
    accent: 'jade green and white',
    look: `${COMMON}. Very long glossy black hair: half gathered into a looped Han chignon fixed with a white jade comb and a jade-green silk ribbon, the rest falling loose and straight down her back to the saddle, lifting behind her when she moves (the long hair and the curved chest line are her clearest silhouette cues: keep both in every pose); soft side locks frame the face; white jade drop earrings; a graceful, composed look. She wears the Eastern Han women's za ju chui shao robe in jade green and white: a wrapped jade-green robe with long wide sleeves gathered at the wrists, and at the hem layered pointed swallowtail pennants (xian shao) and long white silk streamers that flutter behind her over the horse's flank; over it a light fitted cuirass of small pale leather lamellae laced in jade green, shaped to her figure, cinched at the narrow waist by a white sash with a jade hook buckle; light leather bracers, a short white shoulder cape, dark riding boots. She wields a long straight double-edged Han iron sword (jian) with a ring-less jade guard and a jade-green tassel on the pommel, held in ONE hand, the other hand on the reins. She rides a dapple-grey horse.`,
    mount: 'a dapple-grey warhorse with a pale mane, white-and-jade-green Han tack and a green chest tassel',
  },
};

export const isHeroine = (key) => Object.hasOwn(HEROINES, String(key));
// The prompt helpers read officer records (id, name, weapon, war/int/virtue); a look is one with its own look and accent.
export const heroine = (key) => isHeroine(key) ? { id: String(key), heroine: true, faction: null, ...HEROINES[key] } : null;

// The prompts are written about "him": every pronoun and "the man alone" cell turns to her.
export const feminize = (text) => text
  .replace(/\bHimself\b/g, 'Herself').replace(/\bhimself\b/g, 'herself')
  .replace(/\bHis\b/g, 'Her').replace(/\bhis\b/g, 'her').replace(/\bhim\b/g, 'her')
  .replace(/\bHe\b/g, 'She').replace(/\bhe\b/g, 'she')
  .replace(/\bMan\b/g, 'Woman').replace(/\bman\b/g, 'woman').replace(/\bMAN\b/g, 'WOMAN');

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) process.stdout.write(Object.keys(HEROINES).join(' '));
