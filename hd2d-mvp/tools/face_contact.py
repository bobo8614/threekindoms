"""Contact sheets of generated expression busts for review: one row per officer, calm/angry/joy/grief
plus the approved full portrait for identity.

  python3 hd2d-mvp/tools/face_contact.py <out_dir> [ids...]   (default: every officer with busts)
Writes <out_dir>/faces-NN.png, 12 officers per sheet, each row labelled with id and name.
"""
import json, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

MVP = Path(__file__).resolve().parents[1]
D = json.load(open(MVP / 'data/game-data.json'))
MOODS = ['calm', 'angry', 'joy', 'grief']
CW, CH, PER = 120, 160, 12
font = ImageFont.truetype('/System/Library/Fonts/Hiragino Sans GB.ttc', 18)


def main(out, ids):
    out.mkdir(parents=True, exist_ok=True)
    if not ids:
        ids = sorted({int(p.name.split('-')[0]) for p in (MVP / 'assets/ai/faces').glob('*-calm.webp')})
    for n in range(0, len(ids), PER):
        chunk = ids[n:n + PER]
        sheet = Image.new('RGB', (CW * 5 + 110, CH * len(chunk)), 'white')
        d = ImageDraw.Draw(sheet)
        for r, i in enumerate(chunk):
            d.text((6, r * CH + 60), f"{i}\n{D['officers'][i]['name']}", fill='black', font=font)
            for c, m in enumerate(MOODS):
                p = MVP / f'assets/ai/faces/{i}-{m}.webp'
                if p.exists(): sheet.paste(Image.open(p).resize((CW, CH)), (110 + c * CW, r * CH))
            p = MVP / f'assets/ai/portraits/{i}.webp'
            if p.exists(): sheet.paste(Image.open(p).resize((CW, CH * 3 // 2)).crop((0, 0, CW, CH)), (110 + 4 * CW, r * CH))
        sheet.save(out / f'faces-{n // PER + 1:02d}.png')
    print(f'{len(ids)} officers, {(len(ids) + PER - 1) // PER} sheets in {out}')


if __name__ == '__main__':
    main(Path(sys.argv[1]), [int(x) for x in sys.argv[2:]])
