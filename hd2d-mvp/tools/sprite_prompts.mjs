// Prompt source for star-officer battle sprites (白兵 field and 单挑 scene): one side-view mounted
// figure per officer, painted as hi-res pixel art and later reduced by pixelize.py.
//   node hd2d-mvp/tools/sprite_prompts.mjs <officer_id>   → prints the full prompt
//   node hd2d-mvp/tools/sprite_prompts.mjs --stars        → prints the ids that get a sprite
// Officer look comes from portrait_prompts.mjs so sprite and portrait agree.
import { fileURLToPath } from 'node:url';
import { ICONIC, accent, weaponRule, officer } from './portrait_prompts.mjs';
import { readFileSync } from 'node:fs';
import { heroine, feminize } from './heroine_prompts.mjs';
import { genericOf, GENERIC_WEAPON } from './duel_frame_prompts.mjs';
import { dirname, join } from 'node:path';

const DATA = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../data/game-data.json'), 'utf8'));
// Same rule as the game (src/tacticalview.js): any of 武力/智力/人德 at 90 or above.
export const hasSprite = (o) => Math.max(o.war, o.int, o.virtue) >= 90;

// Famous mounts and the one officer who never rides into battle.
const MOUNT = {
  吕布: 'the legendary Red Hare (赤兔), a huge blood-red warhorse with a fiery mane',
  关羽: 'the legendary Red Hare (赤兔), a huge blood-red warhorse',
  刘备: 'Dilu (的卢), a white horse with a dark blaze on its forehead',
  曹操: 'Jueying (绝影), a sleek jet-black warhorse',
  赵云: 'a pure white warhorse', 马超: 'a pure white western warhorse with silver barding',
  张飞: 'a massive black warhorse', 孙策: 'a chestnut warhorse with red-and-gold barding',
};
const SEAT = {
  诸葛亮: 'seated on his four-wheeled wooden war carriage (四轮车) with a small canopy, feather fan raised; no horse',
};

export function spritePrompt(o) {
  const look = o.look || ICONIC[o.name] || `${o.name} (Romance of the Three Kingdoms officer), canonical look from the novel and opera tradition`;
  const sage = o.int - o.war >= 15;
  const ride = SEAT[o.name] || `riding ${MOUNT[o.name] || o.mount || (sage ? 'a calm well-groomed horse' : 'an armoured warhorse with barding in his accent colour')}`;
  const pose = sage
    ? 'upright and composed in the saddle, holding his fan, scroll or sword of office, no heavy armour unless his description has it'
    : 'leaning forward in a battle-ready charge, weapon held ready along the horse\'s flank';
  return `Game sprite source art for an HD-2D remake of the 1992 Famicom strategy game "Sangokushi II: Haou no Tairiku".
Subject: ${look.replace(/\.$/, '')}.
He is ${ride}; ${pose}.
${weaponRule(look)}
Accent colour: ${accent(o)} on cloak, barding or banner tassels.

Format (critical):
- Full-body side view, the whole figure and horse/carriage facing RIGHT, nothing cropped, feet and hooves visible.
- Detailed 16-bit SNES/Octopath-style pixel art with crisp pixel clusters, dark outlines and 3-tone shading; no anti-aliased painterly blur.
- One single figure, centred, filling about 85% of the canvas height; square 1024x1024 canvas.
- Background: one perfectly flat solid magenta (#FF00FF) colour everywhere around the figure — no ground, no shadow, no gradient, no scenery, no text. Do not use magenta or pink anywhere on the figure.
${o.heroine ? 'Reference image 1' : 'Reference image 1 is this officer\'s approved character portrait: match his face, hair, beard, headwear, armour colours and weapon exactly.\nReference image 2'} is an approved sprite of a different officer: match ONLY its pixel-art rendering style, proportions and side-view framing, not its colours or costume.`;
}

// A generic general in another weapon class (<side>-spear / <side>-sword, duel_frame_prompts.mjs genericOf): his side's approved
// glaive sprite redrawn with only the weapon changed, so the three read as one rider (gen_sprites_codex.sh).
export function genericSpritePrompt({ side, cls }) {
  const look = `a generic ${side === 'attacker' ? 'green-and-silver armoured' : 'crimson-and-gold armoured'} Three Kingdoms general on a ${side === 'attacker' ? 'brown' : 'black'} warhorse, ${GENERIC_WEAPON[cls]}`;
  const hold = cls === 'sword'
    ? 'the sword held up and ready in his weapon hand, blade angled upward and forward, the other hand on the reins'
    : 'the spear held upright and ready in his near hand, its head high above him with the red tassel just below it';
  return `Game sprite source art for an HD-2D remake of the 1992 Famicom strategy game "Sangokushi II: Haou no Tairiku".
Subject: ${look}.
Reference image 1 is the approved battle sprite of this exact general, who carries a glaive (guandao) there. Redraw THE SAME rider and horse — the same face, helmet, armour, cloak, the banner on his back, the horse and its tack, every colour value for value, the same side-view pose, framing, scale and pixel-art rendering — and change ONLY his weapon: no glaive anywhere; ${hold}.
${weaponRule(look)}

Format (critical):
- Full-body side view, the whole figure and horse facing RIGHT, nothing cropped, feet and hooves visible.
- Detailed 16-bit SNES/Octopath-style pixel art with crisp pixel clusters, dark outlines and 3-tone shading; no anti-aliased painterly blur.
- One single figure, centred, filling about 85% of the canvas height; square 1024x1024 canvas.
- Background: one perfectly flat solid magenta (#FF00FF) colour everywhere around the figure — no ground, no shadow, no gradient, no scenery, no text. Do not use magenta or pink anywhere on the figure.`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const gk = genericOf(process.argv[2]);
  if (gk && gk.cls !== 'blade') { process.stdout.write(genericSpritePrompt(gk)); process.exit(0); }
  if (process.argv[2] === '--stars') { process.stdout.write(DATA.officers.filter(hasSprite).map((o) => o.id).join(' ')); process.exit(0); }
  const h = heroine(process.argv[2]);
  if (h) { process.stdout.write(feminize(spritePrompt(h))); process.exit(0); }
  const o = officer(Number(process.argv[2]));
  if (!o) { console.error('unknown officer id'); process.exit(1); }
  process.stdout.write(spritePrompt(o));
}
