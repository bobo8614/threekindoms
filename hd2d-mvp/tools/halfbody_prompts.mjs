// Prompt for an officer's standard waist-up portrait (半身像): the large portrait slots (ruler select, war
// unit panel, 白兵 face-off) need every officer framed the same way — same eye line, head size and turn —
// which the free-pose portraits (portrait_prompts.mjs) deliberately are not.
//   node hd2d-mvp/tools/halfbody_prompts.mjs <officer_id>   → prints the full prompt
// Used by gen_halfbody_codex.sh; the output is reduced and indexed by build_halfbody.py.
import { fileURLToPath } from 'node:url';
import { ICONIC, accent, officer, weaponRule } from './portrait_prompts.mjs';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const DATA = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../data/game-data.json'), 'utf8'));

export function halfbodyPrompt(o) {
  const look = ICONIC[o.name] || `${o.name} (Romance of the Three Kingdoms officer), carrying a ${DATA.equipment[o.weapon]?.name || 'sword'}`;
  return `Standard waist-up character portrait for an HD-2D remake of the 1992 Namco Famicom game "Sangokushi II: Haou no Tairiku".
Reference image 1 is this officer's approved portrait and reference image 2 his approved calm expression bust. Draw the SAME man in the SAME art style: identical face, hair, beard, headwear, skin tone, costume, colours and weapon. Only the framing and pose follow the rules below.
Subject: ${look}.
${weaponRule(look)}

Framing (critical — every officer in the cast is drawn to this exact template so they line up side by side):
- Vertical 2:3 canvas (1024x1536). WAIST-UP: the picture is cut at the hips/belt; no legs, no feet, no horse.
- Three-quarter view, body and head both turned toward the viewer's RIGHT-FRONT with eyes glancing calmly at the viewer (head, shoulders and chest aligned the same way, never twisted into opposite left/right directions).
- Head centred horizontally. The top of the headwear sits at about 6% of the height from the top edge; the EYES are on a horizontal line at 22% of the height; the head from chin to crown is about 26% of the height.
- Shoulders span roughly 75% of the width. Arms in a quiet stance: hands resting on the weapon, at the belt, or holding a fan/scroll in front of the chest. If he carries a long weapon it stands upright at one side (held ONE-HANDED by the near hand while the far hand rests naturally at his hip or waist sword — NEVER bend the far-side arm across the torso to grab the opposite edge) or crosses diagonally, and NEVER crosses the face.
- Lighting: soft key light from the upper left, the same for everyone.

Style: 二次元 2D anime illustration like official gacha-game character art — crisp black lineart, flat 2–3 step cel shading with hard-edged shadows, matching reference image 1. Background: a simple flat vertical gradient in ${accent(o)} with a few soft light particles; nothing else. No text, no logo, no border, no watermark.`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const o = officer(Number(process.argv[2]));
  if (!o) { console.error('unknown officer id'); process.exit(1); }
  process.stdout.write(halfbodyPrompt(o));
}
