// Prompts for the 白兵 field's painted set pieces (tools/gen_tactical_codex.sh) that the war map's materials
// (assets/ai/warground) do not cover: the fortress walls of a 城战 and the side banners.
//   node hd2d-mvp/tools/tactical_art_prompts.mjs <name>   → prints the prompt; --list prints the names
const STYLE = `Style: the attached reference crop is from our approved concept for this game's 白兵 battle screen (an HD-2D tactics
battle in the manner of Octopath Traveler / Triangle Strategy). Match it: hand-painted pixel art with crisp 2-4 px clusters and
fine dithering, a muted warm palette (grey-brown stone, ochre rammed earth, dark red-brown timber), soft late-afternoon light
from the upper left. No text, no characters, no emblems, no UI, no figures, no signature, no frame.`;

export const PROMPTS = {
  'wall-face': { ref: 'wall', prompt: `A horizontal strip texture 1536 x 512 (wide), seen STRAIGHT FROM THE FRONT (camera level, orthographic, facing the
wall): the outer face of a Han-dynasty Chinese fortress wall, the height of about two men. Lower two thirds: grey-brown brick
and dressed stone courses over a footing of larger rough stones, with weathering, a few cracked bricks, moss in the joints and
a darker damp band at the foot. Along the top: a parapet of square crenellations (merlons and gaps, evenly spaced, five merlons
across the image) whose gaps are filled with PURE MAGENTA #FF00FF (the sky behind will be cut out), lit on top. The left edge
must continue seamlessly into the right edge (tileable horizontally). Fill the whole image; no ground in front, no sky except
the magenta gaps.
${STYLE}` },
  'wall-top': { ref: 'wall', prompt: `A square SEAMLESS TILEABLE texture seen STRAIGHT DOWN (orthographic top view): the walkway on top of a Han-dynasty
fortress wall: worn grey-brown flagstones and packed earth with dark joints, a little moss and grit, even coverage, no border,
no light gradient, no vignette. The left edge continues into the right edge and the top into the bottom.
${STYLE}` },
  'banners': { ref: 'plain', prompt: `Two hanging war-banner cloths side by side on a perfectly flat pure magenta background (#FF00FF, no gradient,
no shadow on the background), each centred in its half with clear magenta margin all round, seen from the front. Each is a tall
vertical cloth (about 1 wide : 2.6 tall) hanging from a horizontal wooden crossbar at its top, with a darker border band of the
same hue and a short tasselled fringe at the bottom edge; heavy woven fabric with soft folds and pixel-art shading, lit from the
upper left. LEFT banner: deep muted navy blue with a dull gold-ochre border. RIGHT banner: deep muted crimson red with a dull
gold-ochre border. PLAIN CLOTH: no character, no emblem, no pattern in the field. No pole below the crossbar.
${STYLE}` },
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const k = process.argv[2];
  if (k === '--list') console.log(Object.keys(PROMPTS).join(' '));
  else if (k === '--ref') console.log(PROMPTS[process.argv[3]].ref);
  else if (!PROMPTS[k]) { console.error('unknown', k); process.exit(1); } else console.log(PROMPTS[k].prompt);
}
