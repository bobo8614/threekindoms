// Prompt for an officer's expression sheet: one image, 2×2 busts of the same man — calm, angry, joy,
// grief — matching the original's four faces (selector 0/2/3/4, see research/assets-music.md).
//   node hd2d-mvp/tools/face_prompts.mjs <officer_id>   → prints the full prompt
// Used by gen_faces_codex.sh; the sheet is cut by slice_faces.py.
import { fileURLToPath } from 'node:url';
import { ICONIC, accent, officer } from './portrait_prompts.mjs';

export const MOODS = [
  ['calm', 'top-left', 'calm, composed neutral expression, mouth closed, steady gaze at the viewer'],
  ['angry', 'top-right', 'ANGRY: furious glare, brows knitted hard, eyes wide, mouth open in a battle shout showing teeth'],
  ['joy', 'bottom-left', 'JOYFUL: broad delighted laugh, eyes squeezed into happy crescents, mouth open in a grin'],
  ['grief', 'bottom-right', 'GRIEF: worried and dejected, brows raised and drawn together, eyes lowered, mouth turned down'],
];

export function facePrompt(o) {
  const look = ICONIC[o.name] || `${o.name}, exactly as he appears in reference image 1`;
  return `Expression sheet for a character in an HD-2D remake of the 1992 Namco Famicom game "Sangokushi II: Haou no Tairiku".
Reference image 1 is this officer's approved full-body portrait. Draw the SAME man in the SAME art style: same face, hair, beard, headwear, skin tone, costume and colours. Only the facial expression changes between panels.
Reference image 2 is his original 1992 pixel portrait in five expressions; use it only as a cue for how strongly each expression reads. Never copy its pixel blocks, grid or checker patterns into hats, cloth or hair.
Subject: ${look}.

Layout (critical): a square canvas (1024x1024) split into a 2x2 grid of four EQUAL panels separated by thin pure-white gutters. Every panel shows the identical bust shot: head and shoulders only, facing the viewer in a slight three-quarter view, head centred horizontally, the whole headwear visible with a small margin of background above it, cropped at the upper chest. Same camera, same scale, same head position, same lighting in all four panels. No weapon, no hands, no text, no labels, no borders other than the gutters.
${MOODS.map(([, at, how]) => `- ${at}: ${how}`).join('\n')}

Style: 二次元 2D anime illustration like official gacha-game character art — crisp black lineart, flat 2–3 step cel shading with hard-edged shadows, anime facial proportions (mature and masculine for older warriors). Each panel has the same simple flat background in ${accent(o)}. Not photorealistic, not painterly.`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const o = officer(Number(process.argv[2]));
  if (!o) { console.error('unknown officer id'); process.exit(1); }
  process.stdout.write(facePrompt(o));
}
