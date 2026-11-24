// Prompt source for officer portraits: anime 2D style, varied angle/pose/expression per officer,
// and canonical iconic traits for the famous high-stat heroes.
//   node hd2d-mvp/tools/portrait_prompts.mjs <officer_id> [styleRef]   → prints the full prompt
// Used by gen_portraits.mjs (OpenAI API) and the Codex imagegen batch alike. Officer data: data/game-data.json.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const STYLE = `Character portrait for an HD-2D remake of the 1992 Namco Famicom strategy game "Sangokushi II: Haou no Tairiku" (Romance of the Three Kingdoms).
Art style: 二次元 2D anime illustration, like official character art from a modern Japanese/Chinese anime gacha game (Fate/Grand Order, Honkai, Arknights) — crisp uniform black lineart, flat cel shading with 2–3 tone steps and hard-edged shadows, bright clean colours, anime facial proportions with large expressive eyes and a small nose (still masculine and mature for older warriors), stylised dynamic hair and cloth. NOT photorealistic, NOT oil-painted, NOT semi-realistic, no painterly brush texture.
Setting: late Eastern Han dynasty (c. 190 AD) — Han-style lamellar armour, robes, guan hats and headscarves; stylised but recognisably Chinese, no Japanese samurai armour, no fantasy sci-fi parts.
Canvas: vertical 2:3 (1024x1536), character fills the frame, simple flat gradient background in the character's accent colour with a few anime light particles and speed lines; no text, no calligraphy, no logo, no watermark, no border.`;

// Canonical look from the novel/opera tradition. Star officers must read instantly as themselves.
export const ICONIC = {
  刘备: 'Liu Bei: benevolent founder of Shu, gentle yet resolute eyes, notably large earlobes, long arms, neat short beard, green-and-gold lamellar armour over a cream robe, twin swords (shuang gu jian) — one drawn',
  关羽: 'Guan Yu: towering god of war, deep red (jujube-coloured) face, narrow phoenix eyes, magnificent very long black beard reaching the chest, green robe and green headscarf over armour, wielding the Green Dragon Crescent Blade (guandao): a LONG two-handed polearm — a shaft taller than he is, ending in a forearm-length crescent blade with a dragon-head collar at the very top',
  张飞: 'Zhang Fei: wild tiger general, round leopard-like head, huge round glaring eyes, bristling tiger whiskers and spiky black beard, roaring voice, dark iron armour with tiger motifs, eighteen-foot serpent spear (zhangba shemao): a very long spear shaft with a narrow wavy snake-shaped spearhead only at the tip — NOT a broad blade or glaive',
  袁绍: 'Yuan Shao: proud aristocrat warlord of Hebei from a family of four generations of ministers, handsome and haughty, groomed beard, ornate gold-trimmed crimson armour and silk cape, noble guan headpiece',
  颜良: "Yan Liang: Yuan Shao's fearsome vanguard champion, broad scarred face, thick black beard, crested helmet, red-lacquered heavy armour, massive broad blade",
  文丑: 'Wen Chou: brutish giant champion paired with Yan Liang, heavy brow and coarse face, bronze helmet with red plume, studded heavy armour, long spear, menacing',
  田丰: 'Tian Feng: upright, stubborn senior strategist, older thin face, long thin grey beard, black scholar guan hat, layered dark scholar robes without armour, bamboo scroll in hand',
  曹操: 'Cao Cao: ambitious hero-tyrant of Wei, sharp intelligent narrow eyes, thin moustache and short goatee, black-and-gold armour with dark purple cloak, Yitian sword, commanding sly smile',
  孙策: 'Sun Ce: the Little Conqueror of Jiangdong, young handsome and fiery, short beard stubble, red-and-gold armour with red headband, long spear, bold grin',
  董卓: 'Dong Zhuo: corpulent tyrant chancellor, heavy jowls and thick beard, small cruel eyes, gaudy black-and-gold armour with fur collar, sinister grin',
  马腾: 'Ma Teng: veteran western warlord of Liangzhou with Qiang heritage, weathered face, grey moustache, silver-white armour with fur, horse-tail plume, long spear',
  刘璋: 'Liu Zhang: mild indecisive governor of Yi province, soft round face, thin moustache, ornate scholar-official robes in pale blue, nervous expression, no armour',
  诸葛亮: 'Zhuge Liang (Kongming): serene genius strategist, long black hair under a white scholar hat (guan), wearing white crane-feather Taoist robe, holding a white feather fan, calm knowing gaze',
  赵云: 'Zhao Yun (Zilong): youthful handsome loyal general, clean-shaven, silver-white armour with blue accents, white horse-hair plume, Dragon Courage spear (Yajiao spear), determined gaze',
  吕布: 'Lu Bu: the mightiest warrior, tall and arrogant, pheasant-feather tails (two long pheasant plumes) on a golden crown helmet, red-and-black ornate armour, Sky Piercer halberd (fangtian huaji): a long two-handed shaft taller than he is, topped by a straight spear point flanked by crescent moon blades — NOT an axe or giant cleaver, fierce wild eyes',
  周瑜: 'Zhou Yu: elegant handsome Wu commander and musician, clean-shaven, refined features, red-and-white robe over light armour, sword and guqin motif, confident',
  马超: 'Ma Chao (Splendid Ma): young handsome western cavalry general, white lion-head armour, silver helmet with white plume, long spear, fierce noble look',
  司马懿: 'Sima Yi: cunning long-lived strategist of Wei, sharp wolf-like calculating gaze, long thin beard, dark purple scholar robes with black hat, cold smile',
  典韦: "Dian Wei: Cao Cao's ferocious bodyguard, huge muscular build, wild beard, bald or short cropped hair, heavy dark armour, a pair of short-hafted iron ji halberds, one gripped in each fist like hand weapons — NOT a long glaive",
  许褚: 'Xu Chu (Tiger Fool): massive bare-armed brawler, bushy beard, simple armour open at the chest, huge spiked iron club or broad sword, reckless grin',
  黄忠: 'Huang Zhong: veteran archer general, old but vigorous, long white beard and white eyebrows, gold-and-green armour, great longbow and broad sabre',
  孙权: 'Sun Quan: young lord of Wu, green-blue eyes and reddish-purple beard, square jaw, red-and-gold royal armour, regal and calm',
  庞统: 'Pang Tong (Young Phoenix): ugly but brilliant strategist, rough face, unruly hair, shabby dark scholar robes, wooden staff, sly smile',
  魏延: 'Wei Yan: fierce ambitious Shu general, dark skin, wild long hair, scarred face, crimson armour, heavy glaive, rebellious glare',
  甘宁: 'Gan Ning: ex-pirate Wu general, wild hair with a bell ornament, bare tattooed arms, light armour with feather sash, curved dao sword',
  太史慈: 'Taishi Ci: honourable Wu warrior, strong jaw, short beard, dark blue armour, twin short halberds and bow',
  张辽: 'Zhang Liao: fearsome Wei general of Hefei, stern moustache and short beard, purple-black armour, hooked halberd, battle-ready',
  姜维: 'Jiang Wei: young brilliant successor of Zhuge Liang, handsome, light silver-green armour, spear, earnest determined eyes',
  夏侯惇: 'Xiahou Dun: one-eyed Wei general, black eyepatch over his LEFT eye, fierce scarred face, thick black beard, dark purple-and-black armour, long spear',
  夏侯渊: 'Xiahou Yuan: swift Wei cavalry commander and master archer, lean face, short beard, violet armour, great bow in hand',
  徐晃: 'Xu Huang: disciplined Wei general, broad shoulders, short beard, violet armour, enormous battle axe',
  张郃: 'Zhang He: graceful veteran general, elegant features, neat beard, armour with flowing sash, long spear',
  曹仁: 'Cao Ren: steadfast Wei defender, heavy armour, round shield, stern bearded face',
  周泰: 'Zhou Tai: Sun Quan\'s loyal bodyguard, body covered in battle scars, rugged face, amber-trimmed armour, broad curved sword',
  黄盖: 'Huang Gai: veteran Wu general, grey beard, sturdy, amber armour, twin iron whips',
  吕蒙: 'Lu Meng: Wu general turned scholar, sharp eyes, short beard, amber armour with a book tucked in the belt',
  鲁肃: 'Lu Su: gentle and far-sighted Wu strategist, kind round face, scholar robes in amber, holding a scroll',
  孟获: 'Meng Huo: king of the Nanman tribes of the south, tanned skin, wild hair with feathers, leopard skin over bronze armour, huge sword',
  兀突骨: 'Wutugu: giant king of Wuge with scaly rattan armour, towering, fierce exotic features',
  陆逊: 'Lu Xun: young scholar-general of Wu, gentle handsome face, red-and-white robe with light armour, twin swords, calm intelligent smile',
};

// Angle/pose/framing pool so the cast does not look like one template; stars get dynamic shots.
const STAR_SHOTS = [
  'dramatic low-angle shot, full upper body, weapon raised overhead mid-swing with its whole length in frame, cloth and beard whipping in the wind, intense battle cry',
  'three-quarter view facing right, chest, shoulders and face aligned the same way, weapon resting behind his near shoulder, confident fierce smile',
  'frontal heroic pose, waist-up, planting the weapon beside him, cape flowing, calm overwhelming presence',
  'dynamic diagonal composition, striding forward through swirling dust, weapon swept back along his flank in a ready stance, shouting',
  'side profile facing right on a rearing warhorse, cropped at the horse\'s chest, weapon held high',
];
// Strategist stars (智 well above 武) get commanding, cerebral poses instead of weapon swings.
const SAGE_SHOTS = [
  'dramatic low-angle shot, raising a fan or hand to command unseen armies, robes and hair swirling in a sudden wind, glowing light behind',
  'three-quarter view facing right, chest, shoulders and face aligned the same way, holding a strategy scroll in front of his chest with a knowing smile',
  'waist-up frontal pose, standing over a battle map with one hand pointing forward, firelight from below',
  'close half-body, slight high angle, fingers at the chin deep in thought, eyes sharp and calculating, drifting light particles',
  'side profile facing right, looking at distant stars, cloak in the wind, calm and enigmatic',
];
// Weapon handling: the cast kept gripping polearms at the blade and aiming them at the camera, which
// turns a guandao or halberd into a stubby giant cleaver. Spell out how each class is held.
const POLEARM = /guandao|glaive|halberd|huaji|spear|shemao|polearm|axe|刀|戟|枪|矛|斧/i;
const ONE_HAND = /short-hafted|one gripped in each|twin|sword|whip|dao sword|剑|双戟/i;
export function weaponRule(look) {
  const base = 'Anatomy: exactly two hands with five fingers each, every hand attached to a visible arm and matching left/right chirality (when a right arm on the viewer\'s left raises a weapon overhead with thumb toward the right/blade, the shaft passes in front of the palm with the four fingers curling forward over the shaft — never draw a smooth back-of-hand hiding the shaft with a right-side thumb); head, chest, shoulders and belt buckle face a consistent direction (never twist head and torso into opposite left/right directions); a weapon is straight from end to end and never fused into the hand or the body.';
  if (ONE_HAND.test(look) && !/guandao|huaji|shemao/i.test(look)) return `${base} One-handed weapons (swords, twin short halberds, whips) are held by their grip in ONE hand each, at natural size.`;
  if (POLEARM.test(look)) return `${base} Polearm handling (critical): the weapon is a LONG polearm — its shaft is longer than the man is tall and the blade sits only at the far top end. Grip the wooden shaft at least an arm's length below the blade (no hand ever touches the blade or its collar): if the polearm stands upright at one side of the frame, grip it ONE-HANDED with the near hand while the far hand rests naturally at his belt or waist sword (NEVER stretch or bend the far-side arm across the torso to grab a shaft on the opposite edge, which breaks perspective); use a two-handed grip only when the polearm crosses diagonally in front of the body. Show the shaft's length clearly and straight; do NOT point the weapon at the viewer and do NOT foreshorten it into a short giant cleaver.`;
  return base;
}
const CALM_SHOTS = [
  'bust shot, three-quarter view facing right, composed expression',
  'bust shot, facing slightly left, hand stroking beard, thoughtful',
  'half-body, frontal, arms crossed, stern look',
  'bust shot, slight high angle, glancing sideways, wary expression',
  'half-body, three-quarter left, holding a fan or scroll, faint smile',
  'half-body, one hand resting on a sword hilt, cloak lifted by the wind, gazing into the distance',
  'bust shot, low angle, raising a wine cup in a toast, hearty laugh',
  'half-body, reading a bamboo scroll in warm lamplight, calm and focused',
  'half-body, holding a war banner pole, standing on a city wall at dusk',
  'close bust, shouting an order and pointing forward, intense eyes',
];

// Accent by faction of first service (董卓 dark gold, 袁绍 crimson, 曹操 violet, 孙策 amber, 刘备 green,
// 刘璋 rose, 马腾 teal); unaffiliated officers get a varied palette so the cast is not uniformly blue.
const FACTION_ACCENT = ['black and dark gold', 'crimson', 'violet', 'amber orange', 'jade green', 'rose pink', 'teal'];
const FREE_ACCENT = ['ochre', 'slate grey', 'indigo', 'burgundy', 'olive green', 'copper brown', 'ice blue', 'plum purple', 'sand gold'];
const cityFaction = (o) => (o.city != null ? DATA.cities[o.city].faction : null);
export function accent(o) {
  if (o.accent) return o.accent; // a woman general's look (heroine_prompts.mjs)
  const f = o.faction ?? cityFaction(o);
  return f != null && f < 7 ? FACTION_ACCENT[f] : FREE_ACCENT[o.id % FREE_ACCENT.length];
}

export const isStar = (o) => o.war >= 90 || o.int >= 90 || o.virtue >= 95;

export function persona(o) {
  const shots = !isStar(o) ? CALM_SHOTS : o.int - o.war >= 15 ? SAGE_SHOTS : STAR_SHOTS;
  const shot = shots[o.id % shots.length];
  const tier = isStar(o)
    ? `This is a famous top-tier hero (武力 ${o.war}, 智力 ${o.int}, 人德 ${o.virtue}): give him a striking, instantly recognisable design, heroic proportions, richer costume detail and a dramatic pose that sells his strength.`
    : `Supporting officer (武力 ${o.war}, 智力 ${o.int}, 人德 ${o.virtue}): distinctive but less flamboyant design.`;
  const look = ICONIC[o.name] || `${o.name} (Romance of the Three Kingdoms officer). If he is a known figure, use his canonical look from the novel and opera tradition; otherwise design an original look: ${o.war >= 70 ? 'seasoned warrior' : o.int >= 70 ? 'scholar-strategist' : 'minor official or officer'}, carrying a ${weaponName(o)}`;
  const mind = o.int >= 85 ? 'sharp, perceptive eyes' : o.int <= 30 ? 'hot-blooded, impulsive expression' : '';
  return `Subject: ${look}. ${mind}\n${tier}\nCamera and pose: ${shot}.\n${weaponRule(look)}\nAccent colour: ${accent(o)} — use it prominently on the robe or armour and the background; avoid default navy-blue robes and blue backgrounds unless the accent itself is blue.`;
}

export function prompt(o, { hasStyleRef = false } = {}) {
  return `${STYLE}

Reference image 1 is this officer's original 1992 32x40 pixel portrait (enlarged): keep his identity cues from it (headwear shape, beard shape, face shape) but redraw completely in the anime style. Do NOT copy pixel blocks, checker or grid patterns from it — translate them into real cloth, metal or lacquer.
${hasStyleRef ? 'Reference image 2 is an approved portrait of a different officer from the same cast: match ONLY its rendering style (lineart, cel shading, colour treatment, background treatment). Do NOT copy its pose, camera angle, face or costume.\n' : ''}
${persona(o)}`;
}

const DATA = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../data/game-data.json'), 'utf8'));
const weaponName = (o) => DATA.equipment[o.weapon]?.name || 'sword';
export const officer = (id) => DATA.officers[id];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const o = officer(Number(process.argv[2]));
  if (!o) { console.error('unknown officer id'); process.exit(1); }
  process.stdout.write(prompt(o, { hasStyleRef: !!process.argv[3] }));
}
