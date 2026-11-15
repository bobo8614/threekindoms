// Prompts for the equipment icons (tools/gen_equip_icons_codex.sh): one sheet of the 24 weapons (4 columns x 6 rows,
// D.equipment 0-23 in reading order) and one of the 8 armours (4 x 2, 24-31). Single pieces can be re-painted with
// a 1x1 sheet: pass the id as a third argument.
//   node hd2d-mvp/tools/equip_icon_prompts.mjs weapons|armor [id]   → prints the prompt; --forms prints id/name/form
export const FORMS = [
  '短剑 (short sword): a short straight double-edged blade with a plain bronze guard and a wrapped hilt',
  '飞剑 (flying sword): a slim light sword with a swept-back guard and a long red tassel, as if mid-flight',
  '长剑 (long sword): a plain straight double-edged steel sword with a modest guard and a cord-wrapped grip',
  '破斩剑 (cleaving sword): a heavy broad single-fuller blade with a notched, battle-worn edge and a dark iron guard',
  '大剑 (great sword): a very long broad two-handed sword with a wide guard and a long grip',
  '青釭剑 (Qinggang sword): a slender sword with a pale blue-green steel blade, a jade-green pommel and a gold-inlaid guard',
  '倚天剑 (Yitian sword): a legendary long sword, a gleaming blade with a gold-and-ruby hilt and a faint heavenly glow',
  '七星剑 (seven-star sword): a straight sword with seven small gold stars inlaid down the blade, dark lacquered scabbard-coloured guard',
  '薙刀 (naginata): a long pole with a gently curved single-edged blade, a plain dark shaft',
  '眉尖刀 (eyebrow-tip sabre): a long-handled sabre whose blade is wide and tapers to a sharp up-curved tip like an eyebrow',
  '三尖刀 (three-point blade): a long-handled weapon whose head is a trident-like blade with three sharp points, the middle one longest',
  '钩镰刀 (hook-sickle blade): a long-handled sabre with a hooked sickle spur on the back of the blade',
  '偃月刀 (crescent glaive): a long-handled glaive with a broad crescent-moon blade and a plain iron butt cap',
  '凤嘴刀 (phoenix-beak blade): a long-handled blade whose head ends in a curved beak like a phoenix, with a short red tassel',
  '龙牙刀 (dragon-fang blade): a heavy long-handled blade with a jagged fang-like serrated edge and a dragon-head socket',
  '关王刀 (Guan Yu glaive, Green Dragon Crescent): a very long-handled crescent glaive, the socket a green dragon head swallowing the blade, a red tassel at the neck',
  '矛 (spear): a long plain spear with a leaf-shaped steel head and a wooden shaft',
  '双戟 (twin halberds): two crossed short halberds, each with a spear point and a crescent side blade',
  '单钩枪 (single-hook spear): a long spear with a single curved hook branching from below the spearhead',
  '战斧 (battle axe): a long-handled single-bladed axe with a broad crescent head',
  '双钩枪 (double-hook spear): a long spear with a hook branching on each side below the spearhead',
  '方天画戟 (Fangtian halberd): a grand ornate halberd, a tall spear point flanked by two crescent blades, red tassels, lacquered shaft',
  '狼牙枪 (wolf-fang spear): a long spear whose head is a spiked wolf-tooth club studded with sharp teeth',
  '蛇矛 (serpent spear): a long spear whose steel blade is wavy like a coiling snake, dark shaft and a red tassel',
  '纶巾 (silk scholar headband): a soft scholar\'s cloth cap with two trailing ribbons, pale blue-grey silk',
  '笼手 (gauntlets): a pair of plain leather-and-iron gauntlets with riveted cuffs',
  '兜 (helmet): a simple iron helmet with a rounded crown, brow plate, neck guard and a short crest',
  '硬皮 (hard leather armour): a cuirass of stiff brown boiled-leather plates laced together with cord',
  '鹤氅 (crane cloak): a long scholar\'s robe-cloak of white feathers with dark trim, like a crane\'s plumage',
  '甲胄 (plate armour): a full lamellar iron armour with shoulder guards and a belt, dark steel with bronze edges',
  '圣者之衣 (sage\'s robe): a flowing sacred robe in white and gold with a faint glowing hem, a mystic emblem on the chest',
  '龙鳞之铠 (dragon-scale armour): a magnificent armour of overlapping dragon scales in deep green-teal with gold rims and dragon-head shoulder guards',
];
const names = FORMS.map((f) => f.split(' (')[0]);
const STYLE = `Style: hand-painted game item icons in the same hand as the attached reference (character portraits of our
HD-2D three-kingdoms tactics game, in the manner of Octopath Traveler / Triangle Strategy): soft painterly shading, a warm
dark-brown contour line, warm late-morning light from the upper left, muted natural palette with small bright accents.
Each piece is drawn alone, large, about 80% of its cell, its whole shape visible and uncropped, laid diagonally
(at about 45 degrees, tip toward the upper right) for long weapons, and upright three-quarter view for armour.
Backdrop: a perfectly flat pure magenta (#FF00FF) with no gradient, no texture and no shadow on it; the pieces must not
use magenta or pink. Do NOT draw the grid, cell borders, numbers, labels, text, Chinese characters, watermark or
signature. No hands, no figures. Each piece clearly separated from its neighbours by magenta margin.`;
export function prompt(kind, only) {
  const [from, cols, rows] = kind === 'weapons' ? [0, 4, 6] : [24, 4, 2];
  const list = FORMS.slice(from, from + cols * rows);
  if (only != null) {
    return `ONE game item icon on a flat pure magenta (#FF00FF) background, a single piece centred, about 80% of the image, uncropped.
Item: ${FORMS[only]}
${STYLE}`;
  }
  return `A sheet of ${cols * rows} game item icons in a ${cols} columns x ${rows} rows grid (square image), one piece per cell in
reading order (left to right, top to bottom). The ${cols * rows} items, in order:
${list.map((f, i) => `${i + 1}. ${f}`).join('\n')}
${STYLE}`;
}
if (process.argv[1] && process.argv[1].endsWith('equip_icon_prompts.mjs')) {
  const [a, b] = process.argv.slice(2);
  if (a === '--forms') FORMS.forEach((f, i) => console.log(i, f));
  else if (a === '--names') console.log(JSON.stringify(names));
  else console.log(prompt(a, b == null ? undefined : Number(b)));
}
export { names };
