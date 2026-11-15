// Prompts for the war map's painted materials (tools/gen_warground_codex.sh): ground swatches the board is
// baked from at load (src/warplate.js), the cliff band on hill and bank faces, and the tree sheets.
//   node hd2d-mvp/tools/warground_prompts.mjs <name>   → prints the prompt; --list prints the names
const STYLE = `Style: the attached reference crop is from our approved concept for this game's war map (an HD-2D tactics map in the
manner of Octopath Traveler / Triangle Strategy). Match it: hand-painted pixel art with crisp 2-4 px clusters and fine
dithering, a muted warm palette (olive greens, ochre, grey-brown rock, deep teal water), soft late-morning light from the
upper left. No text, no UI, no grid lines, no figures or animals, no buildings, no signature, no frame.`;

const SWATCH = (what) => `A square SEAMLESS TILEABLE ground texture, seen STRAIGHT DOWN (orthographic top view: no perspective,
no horizon, no cast shadows from outside objects). The left edge must continue into the right edge and the top into the
bottom with no visible seam. Even coverage over the whole square: no single dominant feature, no vignette, no light
gradient across the image, no border. The square covers about four battle cells across, so small details (grass clumps,
pebbles) are 8-20 px wide in a 1024 px image.
Subject: ${what}
${STYLE}`;

const SHEET = (what) => `A sprite sheet on a perfectly flat pure magenta background (#FF00FF, no gradient, no texture, no
shadow on the background). 4 columns x 3 rows = 12 SEPARATE trees, each centred in its own cell with clear magenta margin
all round: no tree touches another or the image edge. No ground, no grass, no cast shadow under the trees.
Viewpoint: the battle camera, about 50 degrees above the horizon (high three-quarter view, looking down and forward), so a
crown reads mostly from above as a rounded mass with only a short piece of trunk showing below it. Light from the upper left:
lit top-left of each crown, deep shade lower right, crisp dark outline clusters.
Rows: row 1 four broad round deciduous crowns (large); row 2 four smaller round deciduous crowns and bushy clumps (varied
shapes); row 3 two conical pines and two tall cypress-like conifers.
${what}
${STYLE}`;

export const PROMPTS = {
  'grass': { ref: 'grass', prompt: SWATCH('summer meadow grass on a tactics battlefield: short olive-green grass with darker clumps, a few lighter sunlit tufts, tiny scattered yellow-white flowers very sparse, the odd bare earth fleck. Calm and readable, not busy.') },
  'grass-spring': { ref: 'grass', prompt: SWATCH('spring meadow: fresh young green grass, a little brighter and cooler than summer, scattered tiny white and pale pink wildflowers (sparse), a few darker clumps. Calm and readable.') },
  'grass-autumn': { ref: 'grass', prompt: SWATCH('autumn meadow: dry golden-olive and ochre grass with russet clumps, some faded green left, a few fallen leaves. Calm and readable, not orange-saturated.') },
  'snow': { ref: 'grass', prompt: SWATCH('winter ground under a thin layer of snow: soft white and pale blue-grey snow with gentle drifts, dark grass tips and earth showing through in small sparse patches, subtle cool shading. Not pure white: keep pixel texture.') },
  'dirt': { ref: 'grass', prompt: SWATCH('trampled bare earth and dry grass of a battlefield track: warm brown-ochre soil with small stones, worn grass at random, dry cracks. Calm and readable.') },
  'sand': { ref: 'grass', prompt: SWATCH('dry wasteland ground: pale sandy ochre earth with fine grit, scattered small pebbles and sparse dry grass tufts, faint wind ripples. Calm and readable.') },
  'hilltop': { ref: 'rock', prompt: SWATCH('the top of a rocky hill: patchy short grass and moss over grey-brown rock slabs, small boulders and cracks, a few low shrubs. More rock than grass, but some green.') },
  'forest-floor': { ref: 'trees', prompt: SWATCH('forest floor under dense trees: dark green undergrowth, ferns, moss and leaf litter in deep shade, a few roots.') },
  'paving': { ref: 'apron', prompt: SWATCH('the paved yard of a Han-dynasty Chinese fortress: worn grey-brown flagstones of irregular rectangular size with dark joints, moss in some joints, a little dust.') },
  'fields': { ref: 'apron', prompt: SWATCH('farmland seen from above: patchwork of small ploughed and green crop fields with straight furrows, narrow earth paths and low hedges between plots. Muted, slightly dark (it is the countryside around the battlefield).') },
  'bank': { ref: 'river', prompt: SWATCH('a river bank shore: wet dark earth, grey river pebbles and small stones, a little moss and reeds, damp and darker towards one side is NOT wanted: keep it even.') },
  'water': { ref: 'river', prompt: SWATCH('the surface of a calm deep river: deep teal-blue water with small pixel-art ripples and a few short white-blue glints, slightly darker blue patches. Even, no shore, no rocks.') },
  'cliff': { ref: 'rock', prompt: `A horizontal strip texture 1536 x 512 (wide), seen FROM THE FRONT (camera level, facing a wall of rock): the face of a
natural rock cliff about the height of two men, layered grey-brown and buff sandstone strata with vertical cracks, ledges and
pixel-art shading, small dark crevices, a little moss. Along the very top edge a ragged lip of grass and small shrubs hangs
over; the bottom 10% darkens into shadow. The left edge must continue seamlessly into the right edge. No sky, no ground in
front, fill the whole image.
${STYLE}` },
  // cliff-tier's reference is a painted chunk of natural cliff (source/ref/cliff-chunk.png), made first with
  // tools/gen_image_codex.sh: "One isolated chunk of a natural cliff for a hand-made tabletop diorama, seen from the front and
  // slightly above, about three times wider than tall: flat top of short mossy grass with an overhanging turf lip; the front face
  // natural sedimentary rock, horizontal bedding layers of varying thickness, gently wavy and tilted, eroded rounded ledges,
  // deep vertical cracks, overhangs, scree at the foot; NOT bricks, blocks, dry-stone or masonry; plain light-grey background".
  // Without it the image model drew the face as laid stone.
  'cliff-tier': { ref: 'cliff-chunk', prompt: `A horizontal strip texture, 1536 x 640, of ONE natural cliff face seen straight from the front
(orthographic, camera level, no perspective, no top surface visible, no ground at the bottom); the face fills the whole frame
edge to edge. Top 12% of the height: a soft overhanging lip of short mossy grass and turf hanging slightly over the rock, a few
roots and moss drips. Below it, down to the bottom edge: natural sedimentary rock exactly like the attached reference -
horizontal bedding layers of clearly varying thickness (a few THICK beds of 8-15% of the height each, separated by thinner
darker partings), gently wavy and slightly tilted, eroded rounded ledges, recessed softer layers in shadow, two or three deep
vertical cracks at irregular spacing, small overhangs, small ferns and moss tufts in the cracks. The forms must read clearly
when the image is shown small (about 300 px wide): bold light-and-shadow on each ledge, not fine pinstripes. Colour: warm buff,
ochre and grey-brown with patchy variation (overall fairly light, like sunlit sandstone), darker in crevices, light from the
upper left. It must tile seamlessly left to right. The bottom rows plain rock. It must NOT look like bricks, stacked blocks,
dry-stone walling or masonry: no regular courses, no rectangular blocks of similar size, no mortar-like lines. No text, no
frame, no background, no sky.
${STYLE}` },
  'castle': { ref: 'apron', prompt: `ONE Han-dynasty Chinese walled fortress (a 城) on a perfectly flat pure magenta background (#FF00FF, no
gradient, no shadow on the background), centred, with clear magenta margin all round. Seen from the battle camera, about 50
degrees above the horizon (high three-quarter view from the south): a square rammed-earth and brick curtain wall with a
gate tower over the south gate facing the viewer, corner towers, and inside one two-storey hall with dark grey tiled hip
roofs and red-brown timber; a few red banners. Compact: the whole fortress is roughly square in plan, about as wide as it is
deep. No ground, no grass, no moat, no figures. Light from the upper left.
\${STYLE}` },
  'village': { ref: 'apron', prompt: `A small Chinese farming hamlet on a perfectly flat pure magenta background (#FF00FF, no gradient,
no shadow on the background), centred with clear magenta margin all round: two or three small farmhouses with thatched and
grey-tiled roofs, a low wattle fence, a haystack and a well, all close together in a compact cluster about twice as wide as
it is deep. Seen from the battle camera, about 50 degrees above the horizon (high three-quarter view from the south). No
ground plane, no grass, no figures. Light from the upper left.
\${STYLE}` },
  'trees': { ref: 'trees', prompt: SHEET('Season: summer, deep green foliage with olive highlights.') },
  'trees-spring': { ref: 'trees', prompt: SHEET('Season: spring, fresh light green leaves; two of the broad crowns are in blossom (pale pink and white), the rest green. Keep EXACTLY the same 12 tree shapes and layout as the second attached image (the summer sheet), only the foliage changes.') },
  'trees-autumn': { ref: 'trees', prompt: SHEET('Season: autumn, deciduous crowns in muted russet, ochre and dull gold (not neon orange), pines stay dark green. Keep EXACTLY the same 12 tree shapes and layout as the second attached image (the summer sheet), only the foliage changes.') },
  'trees-winter': { ref: 'trees', prompt: SHEET('Season: winter, deciduous trees bare (dark branching silhouettes with a thin dusting of snow), pines dark green with snow on top of their tiers. Keep EXACTLY the same 12 tree positions and sizes as the second attached image (the summer sheet).') },
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const k = process.argv[2];
  if (k === '--list') console.log(Object.keys(PROMPTS).join(' '));
  else if (k === '--ref') console.log(PROMPTS[process.argv[3]].ref);
  else if (!PROMPTS[k]) { console.error('unknown', k); process.exit(1); } else console.log(PROMPTS[k].prompt);
}
