#!/usr/bin/env python3
# Repair a logic error in one officer portrait (a bent weapon, a missing hand) through the OpenAI Images API, with the
# current portrait as the only reference. Writes a candidate; nothing is published until it is checked by eye.
# The key is read as in gen_warmap_api.py. Run one at a time.
# A plain edit leaves a bend in place, so a straight weapon takes --guide: magenta lines drawn on the input that it must follow.
# --paste then keeps the original outside a polygon, so the face and everything else stay pixel for pixel. All coordinates are 1024x1536.
#   python3 hd2d-mvp/tools/fix_portrait_api.py <id> <out.png> [--guide "x0,y0,x1,y1;..."] [--paste <file.png> ["x,y x,y ..."]]
#       [--heal <candidate.png> <base.png> <sides: b, l or lb> ["x,y x,y ..."]] takes a halfbody's left or bottom edge band from a candidate, only where the repair reaches the edge.
#       [--model gpt-image-2.6-sunburst] [--note "extra words"] [--fix "replaces the stored problem text"] [--input <prepared.png>] [--ref <second reference>] [--halfbody] [--redo]
# --halfbody works on assets/ai/halfbody/source/<id>.png instead (back it up to source/orig-2026-11-07/ first); publish with build_halfbody.py.
# --input starts from a prepared picture, e.g. a spearhead already turned into line by hand, for the model to clean up.
import base64, io, json, sys, time
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, str(Path(__file__).parent))
from gen_warmap_api import edit, png

MVP = Path(__file__).resolve().parents[1]
BOTH = 'Every pole, shaft, sword and scroll is one rigid, perfectly straight object: its visible parts lie on a single straight line even where hands or the body hide the middle.'
FIX = {
    18: 'The waist sword at the lower right bends at the guard: the hilt runs down-left and what lies below the guard runs in another direction. Redraw hilt, guard and scabbard as one straight sword at the angle of the hilt.',
    22: 'The waist sword at the lower right is broken at the guard: the hilt runs down-left while a thin gold piece below the guard turns down-right. Remove that thin piece. Continue the sword from the guard as one straight dark scabbard at the angle of the hilt, ending behind the table edge.',
    38: 'The long glaive shaft kinks at the upper red hand: the part above the hand is steeper than the part between the hands. Make the whole shaft, from the butt at the lower left through both hands to the dragon socket and blade, one straight line.',
    40: 'The rear halberd on the right is broken: its upper shaft runs down-left while the piece held in the lower-right hand runs down-right, far apart. Make them one straight halberd: the head near the top right, one shaft running straight down in front of the shoulder armour into the lower-right fist. Leave the foreground halberd on the left unchanged.',
    43: 'The trident head does not line up with its shaft: the head stands nearly upright while the shaft leans much more, so it bends at the socket. Redraw head, socket and shaft along one straight line that ends in the fist at the bottom, with the head the same size and design and inside the frame.',
    91: 'The foreground arm has no hand: the armoured forearm runs straight into the gold sword guard. Paint a strong clenched hand, same skin as his other hand, coming out of the bracer and gripping a short wrapped sword handle, with the guard and curved blade continuing from that fist. Keep the hand on his beard unchanged.',
    111: 'The foreground armoured forearm at the lower right has no hand: it ends in white cloth. Paint a strong clenched fist, same skin as his other hand, at the end of that bracer, in front of the cloth. Keep the great axe and the upper hand unchanged.',
    126: 'The glaive shaft kinks at the hand on the right: it runs down-right above the hand and down-left below it. Make the whole shaft, from the socket through the hand to the bottom edge, one straight line.',
    138: 'He grips a long pole running from the upper left to the lower right, while a separate spear with its own head sticks out behind his shoulder toward the upper right: they are not one spear. Remove the shoulder spear completely (head, socket and shaft) and paint the orange background and flying cloth there. Make the pole in his two hands the only spear, perfectly straight: keep the butt at the upper left and, beyond the lower hand, add a gold socket and a steel spearhead running on along the pole to the right edge, where the frame may crop its tip. Keep his hands, pose, face and armour.',
    144: 'The dragon socket and blade were cut out and turned by hand so that they run on in line with the rising shaft. Keep them at exactly this new angle and position, and repair only the damage from the cut: join the socket to the end of the shaft in one clean straight piece, repaint the blue sky with its light streaks behind them, hang the white tassel from the underside of the socket, and restore any cropped horn or edge. Shaft, socket and blade stay on one straight line; the frame may crop the tip.',
    158: 'The spear on the right is broken at the lower hand: above the hand the shaft runs down-left and the short piece below it runs down-right. Make it one straight spear, from the head through that hand to the bottom edge. Keep the flagpole on the left unchanged.',
    159: 'The glaive shaft on the right kinks at the hand: nearly vertical above the hand and leaning below it. Make the whole shaft, from the blade through the hand to the bottom edge, one straight line.',
    227: 'The spear behind him is broken: above the arms it runs down-left, and the piece showing below the sash at the lower right runs down-right, in a V. Remove the lower piece completely and paint the green background and his clothes there: the spear is only visible above his shoulder and is hidden by his body below. Keep his arms crossed.',
}


# Straight-weapon guides (x0,y0,x1,y1) and the area that may change; everything else stays the original, pixel for pixel.
def band(x0, y0, x1, y1, w):
    dx, dy = x1 - x0, y1 - y0; l = (dx * dx + dy * dy) ** .5; nx, ny = -dy / l * w, dx / l * w
    return [(x0 + nx, y0 + ny), (x1 + nx, y1 + ny), (x1 - nx, y1 - ny), (x0 - nx, y0 - ny)]

GUIDE = {
    43: (170, 40, 500, 1360), 126: (985, 460, 945, 1430), 138: (109, 407, 1024, 1022),
    158: (996, 420, 880, 1536), 159: (1006, 420, 912, 1380),
}
AREA = {
    40: [(740, 0), (1024, 0), (1024, 1536), (840, 1536), (840, 900), (740, 480)],
    43: [(0, 0), (330, 0), (400, 300), (400, 900), (640, 1400), (640, 1536), (300, 1536), (0, 1000)],
    126: [(820, 400), (1024, 400), (1024, 1536), (820, 1536)], 138: [(0, 300), (360, 300), (680, 0), (1024, 0), (1024, 1100), (760, 1000), (0, 500)],
    144: [(600, 0), (1024, 0), (1024, 260), (800, 260), (600, 140)],
    158: [(760, 380), (1024, 380), (1024, 1536), (760, 1536)], 159: [(850, 380), (1024, 380), (1024, 1536), (850, 1536)],
    91: [(0, 1080), (660, 1080), (660, 1320), (1024, 1490), (1024, 1536), (0, 1536)], 111: [(540, 1100), (1024, 1100), (1024, 1536), (540, 1536)],
}
HALF = {
    13: 'The long glaive shaft kinks at the upper gloved hand: steep above the hand and leaning much more below it. Make the whole shaft, from the socket and blade at the top through both hands to the bottom edge, one straight line, and move the hands and forearms just enough to grip it on that line.',
    146: 'The spear shaft kinks at the upper hand: steep above the hand and leaning much more below it. Make the whole shaft, from the spearhead through both hands to the bottom edge, one straight line, and move the hands and forearms just enough to grip it on that line.',
    216: 'The spear shaft bends at the upper hand: steep above the hand and leaning more below it. Make the whole shaft, from the spearhead through both hands to the bottom edge, one straight line, and move the hands and forearms just enough to grip it on that line. The frame may crop the very tip.',
    208: 'The glaive shaft kinks at the upper hand: steep above the hand and leaning much more below it. Make the whole shaft, from the socket and blade at the top right through both hands to the bottom edge, one straight line, and move the hands and forearms just enough to grip it on that line. The frame may crop the blade.',
}
HALF[77] = 'The helmet crest, the forehead badge and the two ear guards are drawn as stair-stepped square pixel blocks with white and grey checker squares, and white squares are scattered on the dome. Repaint only these so that they match the helmet in the second image, the same man in his finished full-length portrait: the round crest with gold rims under the gold knob, the clean black polished dome, the gold forehead band with the shield-shaped dark steel badge in its middle, and the dark steel ear guards with gold edging. Hand-painted metal, smooth curved edges, no squares, no steps, no checker pattern anywhere. Keep this picture\'s helmet size, position and angle, and each ear guard the same size and place as now. Keep the plume, the gold hanger below the right ear guard, the riveted neck plate with its plates and rivets behind the left ear guard, his face, eyebrows, beard, hair, chin strap and everything else exactly.'
HALF_AREA_77 = [(470, 365), (510, 356), (572, 356), (575, 396), (642, 398), (668, 400), (690, 432), (672, 470), (655, 510), (650, 540), (690, 548), (760, 530), (770, 400), (735, 310), (700, 250), (680, 190), (670, 125), (540, 125), (495, 175), (490, 250), (420, 270), (400, 295), (355, 290), (340, 330), (325, 400), (340, 442), (395, 500), (470, 500), (480, 430)]
HALF_GUIDE = {13: (900, 300, 420, 1500), 146: (960, 200, 400, 1536), 208: (990, 400, 420, 1536), 216: (970, 200, 420, 1536)}
HALF_AREA = {
    13: [(620, 0), (1024, 0), (1024, 1536), (150, 1536), (150, 1250), (500, 800), (620, 600)],
    146: [(680, 0), (1024, 0), (1024, 1536), (150, 1536), (150, 1200), (500, 720), (680, 620)],
    208: [(700, 0), (1024, 0), (1024, 1536), (200, 1536), (200, 1250), (560, 800), (680, 560)],
    216: [(720, 0), (1024, 0), (1024, 1536), (200, 1536), (200, 1250), (600, 820), (720, 680)],
}

HALF_AREA[77] = HALF_AREA_77

# Second round (2026-11-07, subagent eye pass). Coordinates here are on the shipped 768x1152 webp and are converted to the source below.
FIX2 = {
    91: ('The sword bends at the guard: the hilt is level while the blade drops away from it. Keep the fist and the hilt, and redraw the guard and the blade so that the blade runs straight on from the hilt along the guide to the right edge, level, the same size and design. Paint the orange robe and rope belt where the old blade was.', [(106, 1052, 768, 1052)], [(0, 810), (768, 900), (768, 1152), (0, 1152)]),
    100: ('The hand does not hold the sword: the hilt runs along the top edge of the fist and the fingers hang below it. Redraw the same hand so that it really grips: the hilt enters the fist and comes out on the other side, the four fingers curl around the front of the hilt, the thumb closes over them. Hilt, guard and scabbard stay one straight line along the guide.', [(227, 813, 550, 1040)], [(150, 770), (500, 770), (500, 1060), (150, 1060)]),
    116: ('A spare halberd head (crescent blade, spear point and gold socket) grows out from behind the wine cup with no shaft and nobody holding it. Remove it completely and paint the pink background with its streaks there. Keep the cup, the hand and the fingers exactly as they are, and keep the other halberd behind his right shoulder.', [], [(20, 0), (300, 0), (300, 190), (230, 190), (130, 215), (80, 240), (20, 240)]),
    161: ('A gold scroll end sticks out below the hand far off the line of the scroll. Remove that gold end completely and paint the purple background there: the rest of the scroll is hidden by his hand and sleeve.', [], [(630, 480), (730, 480), (730, 610), (630, 610)]),
    196: ('The waist sword forms a V at the guard: the hilt runs down-left to the guard, and the scabbard below it runs down-right. Remove that scabbard completely and paint the pink robe there. Continue the sword from the guard as one straight dark scabbard on along the angle of the hilt, down-left across the robe, ending in a small gold chape at the end of the guide. Keep the hilt, the guard, the jade pendant and the red tassel.', [(719, 682, 440, 1130)], [(360, 800), (640, 720), (768, 720), (768, 1100), (560, 1152), (360, 1152)]),
    213: ('Both waist swords break at the guard: the hilts run down-left, but the black scabbard below them runs down-right and the red one drops almost straight down. Remove those scabbards and paint the white robe and red sash there. Continue each sword from its guard as one straight scabbard on along the angle of its own hilt, down-left. Each scabbard ends in a small gold chape at the end of its guide, fully inside the picture. Upper sword black, lower sword red and gold. Keep both hilts and guards.', [(722, 762, 500, 1000), (736, 876, 540, 1125)], [(340, 850), (600, 820), (768, 820), (768, 1152), (340, 1152)]),
    179: ('The fist thrust at the viewer has six fingers: a thumb on top, one pointing finger at the lower right, and four curled fingers below. Redraw this same hand, same size, angle and skin, with exactly five fingers: the thumb on top, the index finger pointing at the viewer, and exactly three curled fingers. Keep the gold bracer ring and everything around the hand.', [], [(90, 520), (400, 520), (400, 770), (90, 770)]),
    180: ('The big white sleeve at the lower right is empty: its open cuff faces down and there is no forearm or hand inside, only dark cloth. Paint his forearm in a dark blue under-sleeve coming out of that cuff and ending in a strong clenched fist with the same skin as the hand on the spear, in front of the dark cloth and above the blue sash. Remove the grey curved shape inside the sleeve. Keep the spear, the raised hand, the armour and the sash.', [], [(440, 740), (768, 740), (768, 960), (440, 960)]),
    225: ('The hand does not hold the sword: straight fingers hang behind the hilt and nothing wraps it. Redraw the same hand so that it grips: the four fingers curl around the front of the hilt, the thumb closes over them. Keep the pommel, hilt, guard and scabbard where they are.', [], [(610, 660), (768, 660), (768, 830), (610, 830)]),
    234: ('The spear is cut in two: the shaft on the left runs in behind the top of the head, and the tassel, dragon socket and spearhead on the right sit far above where that line comes out. Move the tassel, dragon socket and spearhead down so that they continue exactly along the line of the shaft, the same size and design. Paint the orange sky where they were. Keep the whole red tassel attached behind the socket, flowing to the left as it does now. Keep his head and headband unchanged.', [(0, 30, 768, 187)], [(0, 0), (768, 0), (768, 340), (510, 340), (490, 130), (400, 100), (340, 150), (250, 190), (0, 190)]),
}
HALF2 = {
    221: ('The spear shaft kinks at the upper hand: steep above the hand and leaning more below it. Make the whole spear, from the head and socket through both hands to the bottom edge, one straight line along the guide, and move the hands just enough to grip it there. The frame may crop the very tip. Keep his face, beard and red tassel.', [(700, 190, 285, 1152)], [(590, 0), (768, 0), (768, 500), (640, 800), (580, 1152), (190, 1152), (230, 1000), (370, 850), (470, 620), (590, 300)]),
    22: ('The waist sword forms a V at the guard: the hilt runs down-left while a thin tan rod below the guard runs down-right. Remove that rod and paint the dark robe there. Continue the sword from the guard as one straight dark scabbard on along the angle of the hilt to the bottom edge.', [(629, 876, 470, 1152)], [(400, 960), (680, 960), (680, 1152), (400, 1152)]),
    35: ('The halberd shaft on the left kinks at the upper hand: vertical above the hand and leaning below it. Make the whole shaft, from the socket through both hands to the bottom edge, one straight line, and move the hand just enough to grip it on that line.', [(112, 150, 190, 1152)], [(0, 0), (230, 0), (230, 260), (330, 500), (330, 1152), (0, 1152)]),
    75: ('The waist sword breaks inside the fist: the scabbard and wrapped grip rise from the lower left, but the gold ring and short black end beyond the fist run nearly level, far below that line. Make scabbard, grip, gold ring and black end one straight sword along the guide, and move the fist just enough to grip it there.', [(30, 1040, 420, 905)], [(0, 880), (470, 880), (470, 1152), (0, 1152)]),
    91: ('The sword bends at the guard: the hilt rises slightly to the left while the blade drops steeply to the right. Make hilt, guard and blade one straight sword along the guide, the same size and design, and move the fist just enough to grip it there. Remove the old guard completely, including its top end above the fist, and paint the belt there. Keep the other hand and the belt buckle.', [(57, 945, 768, 1065)], [(0, 820), (340, 820), (360, 880), (520, 1000), (768, 1000), (768, 1152), (0, 1152)]),
    100: ('The hand does not hold the sword: the hilt runs along the top edge of the fist and the fingers bend down away from it. Redraw the same hand so that it really grips: the hilt enters the fist and comes out on the other side, the four fingers curl around the front of the hilt, the thumb closes over them. Hilt, guard and scabbard stay on one straight line along the guide.', [(150, 762, 520, 1027)], [(80, 780), (470, 760), (470, 1050), (80, 1050)]),
    104: ('The sword bends at the guard: the hilt is flatter than the scabbard. Make pommel, hilt, guard and scabbard one straight sword along the guide, and move the fist just enough to grip it there. Keep the other hand and the belt.', [(214, 946, 768, 1147)], [(120, 790), (470, 790), (470, 960), (768, 1020), (768, 1152), (120, 1152)]),
    112: ('The waist sword forms a V at the fist: the hilt runs down-left into the fist, and the short piece below the fist runs down-right. Remove that piece and paint the robe there. Continue the sword below the fist as one straight scabbard on along the angle of the hilt to the bottom edge. Keep the hilt, the guard and the fist.', [(747, 730, 470, 1152)], [(380, 960), (660, 960), (680, 1152), (380, 1152)]),
    129: ('The halberd on the right bends at its gold socket: the shaft stands nearly upright while the socket and head lean to the right. Make the shaft, socket and head one straight line along the guide, with the crescent blade on the same side, and move the hand just enough to grip it there.', [(762, 280, 630, 1152)], [(560, 250), (768, 250), (768, 1152), (540, 1152)]),
    134: ('The sword forms a V inside the fist: the hilt runs down-left into the fist, and the guard and blade below it run down-right. Redraw the guard and blade so that they run on from the hilt along the guide, down-left, one straight sword the same size and design, and remove the old blade, painting the red robe and belt tassels there. Keep the hilt and the fist.', [(268, 835, 60, 1152)], [(0, 920), (450, 920), (450, 1152), (0, 1152)]),
    138: ('The spear shaft bends at the lower hand: the short piece below the fist runs flatter than the shaft above it. Redraw that piece on along the guide, one straight line with the shaft above. Keep the fist and everything else.', [(400, 770, 128, 1152)], [(0, 1060), (120, 1030), (240, 1090), (300, 1152), (0, 1152)]),
    175: ('The long glaive shaft kinks at the upper hand: steep above the hand and leaning more below it. Make the whole shaft, from the blade through the hand to the bottom edge, one straight line along the guide, and move the hand just enough to grip it there.', [(90, 345, 390, 1052)], [(0, 0), (260, 0), (260, 420), (480, 700), (480, 1152), (0, 1152)]),
    187: ('The sword is offset inside the fist: the pommel sticks out to the right of the line of the grip below the fist. Redraw it so that pommel, grip, guard and scabbard are one straight sword along the guide, and the fingers really close around the grip.', [(300, 1160, 455, 745)], [(280, 740), (560, 740), (560, 1152), (280, 1152)]),
    213: ('The waist sword on the right forms a V at the guard: the hilt runs down-left and the black scabbard with its gold strip runs down-right. Remove that scabbard and paint the red sash and white robe there. Continue the sword from the guard as one straight black scabbard on along the angle of the hilt to the bottom edge. Keep the hilt and the guard.', [(744, 961, 637, 1152)], [(520, 985), (768, 985), (768, 1152), (520, 1152)]),
}

# Decided by the user on 2026-11-07. Coordinates are on the 1024x1536 source. 141 takes the waist-up portrait as a second reference (--ref); its polygon has a hole that keeps the head.
FIX.update({
    141: 'His weapons must be the ones in the second image, his waist-up portrait: two short halberds, one in each hand, and a bow on his back. Remove the long glaive completely: its blade at the upper left, its socket and its whole long shaft behind his neck. His raised hand on the right keeps its place but grips one short halberd, whose straight shaft stands up beside the shoulder with the crescent blade and spear point in the sky above the hand. His lowered arm on the left ends in a visible clenched fist at the lower left, gripping the other short halberd, whose straight shaft stands up beside that arm with the blade above the fist. Each short halberd is about one and a half arm lengths long and has the same head, gold socket and black shaft as in the second image. The bow stays slung on his back behind the shoulder, passes behind the halberd, and its string is one thin taut straight line from tip to tip. Each hand has five fingers and really closes around its shaft. Keep his head, helmet, face and expression, the low viewing angle, armour, orange cloth and background.',
    77: 'The spear stands beside him and no hand holds it. Make the hand on the left of the picture really grip the spear: the same forearm and bracer, with four fingers wrapped around the front of the shaft and the thumb closed over them, on the guide line. The spear stays one straight line along the guide. That hand has let go of the bamboo slips, so roll the slips up into a compact tied bundle held firmly in the other hand at the right of his chest. Paint his armour and red robe where the open slips were. Keep the spear design, his head, helmet and face, his shoulders and his legs.',
    224: 'The cap on his head is drawn as stair-stepped square pixel blocks. Repaint only the cap as a normal hand-painted cloth head wrap, at the same size and place: soft smooth wrapped folds with clean curved ink lines, the same white and dark grey colours, the same painted anime style as the white cloth on his shoulders. Its side pieces hang by his cheeks and run smoothly into that white cloth. No squares, no steps, no checker pattern anywhere. Keep his forehead line, eyebrows, face, hair and the blue background.',
})
GUIDE[77] = (54, 0, 292, 1536)
AREA.update({
    141: [(0, 0), (1024, 0), (1024, 1536), (0, 1536), (0, 0), (500, 60), (505, 190), (505, 310), (560, 345), (640, 395), (735, 385), (770, 290), (815, 210), (815, 100), (720, 0), (560, 0), (500, 60), (0, 0)],
    77: [(0, 700), (1024, 640), (1024, 1340), (0, 1340)],
    224: [(0, 0), (700, 0), (720, 300), (640, 400), (610, 420), (585, 420), (556, 335), (540, 258), (510, 228), (360, 228), (325, 250), (300, 290), (288, 340), (280, 400), (276, 520), (250, 740), (0, 740)],
})

# A later pass on a picture that was already repaired: (text, polygon, the repaired version to work on and paste onto). Run with --redo.
REDO = {
    77: ('The helmet crest block, the forehead badge and the two ear guards are drawn as stair-stepped square pixel blocks with white and grey checker squares. Repaint only those pieces as hand-painted forged metal in the same painted anime style as his lamellar armour and the gold trim: smooth curved edges, clean ink lines, soft metal shading, dark iron with gold edging and a little silver. Keep the same helmet with the same outlines and positions: the block-like crest under the gold knob, the badge in the middle of the forehead, one ear guard on each side. Also paint out the stray white squares on the black dome so it is clean polished black. No squares, no steps and no checker pattern anywhere. Keep his face, eyebrows, beard, the gold band of the helmet, the red plume and everything else.',
         [(445, 305), (500, 303), (552, 300), (555, 335), (630, 335), (648, 350), (668, 375), (650, 410), (632, 470), (622, 500), (626, 590), (700, 590), (745, 500), (745, 300), (720, 190), (660, 110), (640, 40), (470, 40), (460, 130), (380, 130), (330, 200), (320, 290), (270, 360), (255, 445), (330, 470), (395, 470), (418, 440), (430, 360)],
         'assets/ai/portraits/77.pre-helmet-2026-11-07.png'),
}

def _src(i, half, x, y):
    # 768x1152 webp to 1024x1536 source. Full-body pictures are a plain resize; halfbody ones go through align.json as in build_halfbody.py.
    if not half: return x * 4 / 3, y * 4 / 3
    adj = json.loads((MVP / 'assets/ai/halfbody/align.json').read_text()).get(str(i), {})
    dy = adj.get('dy', 0); k = max(adj.get('scale', 1), 1 + 2 * abs(dy) / 1152 + .005)
    x0, y0 = (round(768 * k) - 768) // 2, (round(1152 * k) - 1152) // 2 - dy
    return (x + x0) / k * 4 / 3, (y + y0) / k * 4 / 3

for _table, _fix, _guide, _area, _half in ((FIX2, FIX, GUIDE, AREA, False), (HALF2, HALF, HALF_GUIDE, HALF_AREA, True)):
    for _i, (_t, _g, _a) in _table.items():
        _fix[_i] = _t
        _guide[_i] = [(*_src(_i, _half, g[0], g[1]), *_src(_i, _half, g[2], g[3])) for g in _g]
        _area[_i] = [(0 if p[0] <= 0 else 1024 if p[0] >= 768 else _src(_i, _half, *p)[0], 0 if p[1] <= 0 else 1536 if p[1] >= 1152 else _src(_i, _half, *p)[1]) for p in _a]

def original(i, half=False):
    # The backup taken before the first repair of this picture (later rounds back up under their own date).
    for d in ('2026-11-07', '2026-11-08'):
        p = MVP / (f'assets/ai/halfbody/source/orig-{d}/{i}.png' if half else f'assets/ai/portraits/{i}.orig-{d}.png')
        if p.exists(): return p
    return p

def paste_back(i, cand, poly, out, feather=6, half=False, onto=None):
    # Original (or the version named by onto) everywhere except inside the polygon (soft edge).
    orig = Image.open(onto or original(i, half)).convert('RGB')
    new = Image.open(cand).convert('RGB').resize(orig.size, Image.LANCZOS)
    m = Image.new('L', orig.size, 0); ImageDraw.Draw(m).polygon(poly, fill=255)
    Image.composite(new, orig, m.filter(ImageFilter.GaussianBlur(feather))).save(out)

def heal(i, cand, base, sides, out, poly=None, band=34):
    # A repair that meets the crop edge must not stop there: align.json can move the crop, and anything cut short shows up as a seam.
    # Take the candidate in the edge band, beside the columns or rows the repair changed, right out to the edge of the source. Everything else stays as base.
    import numpy as np
    b = Image.open(base).convert('RGB'); o = np.asarray(Image.open(original(i, True)).convert('RGB')).astype(int); a = np.asarray(b).astype(int)
    changed = np.abs(a - o).sum(2) > 24
    new = Image.open(cand).convert('RGB').resize(b.size, Image.LANCZOS)
    # The model can drift a few pixels: line the candidate up with the picture just inside the band.
    l, t = _src(i, True, 0, 0); _, bot = _src(i, True, 0, 1152); bot = int(bot); l = int(l)
    ref = a[bot - 150:bot - band - 4, l + band:-30, 1].astype(float); best = (1e18, 0, 0); n = np.asarray(new).astype(int)[..., 1].astype(float)
    for dy in range(-10, 11):
        for dx in range(-10, 11):
            e = np.abs(n[bot - 150 + dy:bot - band - 4 + dy, l + band + dx:1024 - 30 + dx] - ref).mean()
            if e < best[0]: best = (e, dx, dy)
    new = new.transform(new.size, Image.AFFINE, (1, 0, best[1], 0, 1, best[2]), Image.BICUBIC)
    m = np.zeros(changed.shape, bool)
    if 'b' in sides:
        cols = changed[bot - 70:bot - band + 18].any(0); cols = np.convolve(cols, np.ones(61), 'same') > 0
        m[bot - band:, cols] = True
    if 'l' in sides:
        rows = changed[:, l + band - 18:l + 70].any(1); rows = np.convolve(rows, np.ones(61), 'same') > 0
        m[rows, :l + band] = True
    mask = Image.fromarray((m * 255).astype('uint8'))
    if poly: ImageDraw.Draw(mask).polygon(poly, fill=255)
    Image.composite(new, b, mask.filter(ImageFilter.GaussianBlur(6))).save(out)
    print('healed', i, 'shift', best[1:], 'of', out)


if __name__ == '__main__':
    a = sys.argv[1:]
    half = '--halfbody' in a
    if half: a.remove('--halfbody')
    redo = '--redo' in a
    if redo: a.remove('--redo')
    fixes, guide_of, area_of = (HALF, HALF_GUIDE, HALF_AREA) if half else (FIX, GUIDE, AREA)
    if '--heal' in a:
        k = a.index('--heal')
        heal(int(a[0]), a[k + 1], a[k + 2], a[k + 3], a[1], [tuple(map(float, p.split(','))) for p in a[k + 4].split()] if len(a) > k + 4 else None); sys.exit()
    if '--paste' in a:
        k = a.index('--paste')
        i = int(a[0]); poly = [tuple(map(float, p.split(','))) for p in a[k + 2].split()] if len(a) > k + 2 else area_of[i]
        if redo: poly, onto = REDO[i][1], MVP / REDO[i][2]
        else: onto = None
        paste_back(i, a[k + 1], poly, a[1], half=half, onto=onto); print('pasted', a[1]); sys.exit()
    opt = lambda k, d: (a.pop(a.index(k) + 1), a.remove(k))[0] if k in a else d
    model, note, guide, start = opt('--model', 'gpt-image-2.6-sunburst'), opt('--note', ''), opt('--guide', ''), opt('--input', '')
    fix_text, ref = opt('--fix', ''), opt('--ref', '')
    i, out = int(a[0]), Path(a[1])
    if redo: fix_text, start = REDO[i][0], str(MVP / REDO[i][2])
    src = MVP / (f'assets/ai/halfbody/source/{i}.png' if half else f'assets/ai/portraits/{i}.png')
    text = f"""Edit this finished character illustration. Fix ONLY this drawing error:
{fix_text or fixes[i]}
{BOTH} Hands have the right number of fingers and really grip what they hold.
Keep everything else exactly as it is: the same person, face, expression, hair, headwear, costume, colours, composition, framing, background, line work and painted anime style. Do not add text, a frame or new objects. {note}"""
    im = Image.open(start or (original(i, half) if original(i, half).exists() else src)).convert('RGB')
    guides = [tuple(map(float, g.split(','))) for g in guide.split(';')] if guide else (guide_of[i] if isinstance(guide_of[i], list) else [guide_of[i]]) if i in guide_of and (i in FIX2 or i in HALF2 or not start) else []
    if guides:
        d = ImageDraw.Draw(im)
        for x0, y0, x1, y1 in guides:
            d.line([(x0, y0), (x1, y1)], fill=(255, 0, 255), width=5)
        text += '\nThe thin magenta straight line was added to this picture as a guide: the corrected weapon runs exactly along it, from end to end, perfectly straight, and hands on it grip it there. Remove every trace of the magenta line from the finished picture.'
    t0 = time.time()
    r = edit([png(im)] + ([png(Image.open(ref).convert('RGB'))] if ref else []), text, 1, model, 'high', size='1024x1536')
    out.parent.mkdir(parents=True, exist_ok=True)
    Image.open(io.BytesIO(base64.b64decode(r['data'][0]['b64_json']))).convert('RGB').save(out)
    Image.open(out).save(out.with_suffix('.raw.png'))
    if redo: paste_back(i, out, REDO[i][1], out, onto=start)
    elif i in area_of: paste_back(i, out, area_of[i], out, half=half)
    print('saved', out, f'{time.time() - t0:.0f} s', 'usage', json.dumps(r.get('usage', {})))
