"""Original BGM scores for tools/chip_bgm.py.

Written from scratch for the remake. Only tempo and the "short hook that keeps returning" shape
come from the 1992 cue (measured on the local renders, see research/assets-music.md); no original
note data was transcribed or consulted. The melodic language is Chinese rather than the original's
western diatonic writing: D gong pentatonic (D E F# A B), phrases built as qi-cheng-zhuan-he
(起承转合), each phrase picking up the note the last one ended on (鱼咬尾), cadences falling to
gong or zhi instead of a leading-tone V–I, and the B section turning to the yu mode (B).

Notes are 'D5/1.5' (pitch/beats, default 1 beat), 'r/1' is a rest. Chords are one name per half
bar ('D', 'Bm', ...); the renderer voices them as open fifths, not triads. 'gong' names the
pentatonic tonic (宫) the melody stays inside; every other score below follows the same rules.
"""

STRATEGY = {
    'bpm': 112, 'gong': 'D',
    'sections': [
        # A 起承转合: the hook (bars 1–2) ends on zhi, is restated higher, turns to yu, closes on gong.
        {'name': 'A', 'lead': 'A', 'counter': False, 'bars': [
            ('A4/.5 B4/.5 D5/1.5 E5/.5 F#5', 'D D'),
            ('E5/.5 D5/.5 B4 A4/2', 'Bm D'),
            ('A4/.5 B4/.5 D5/1.5 E5/.5 F#5/.5 A5/.5', 'D Bm'),
            ('B5 A5/.5 F#5/.5 A5/2', 'G D'),
            ('B5/1.5 A5/.5 F#5 E5/.5 F#5/.5', 'Bm G'),
            ('D5 E5/.5 D5/.5 B4/2', 'Em Bm'),
            ('A4/.5 B4/.5 D5 E5/.5 F#5/.5 E5/.5 D5/.5', 'G Em'),
            ('D5/3 r', 'D D'),
        ]},
        # A': hook again with a counter-line, the answer climbs to the high gong and settles back.
        {'name': "A'", 'lead': 'A', 'counter': True, 'bars': [
            ('A4/.5 B4/.5 D5/1.5 E5/.5 F#5', 'D D'),
            ('E5/.5 D5/.5 B4 A4/2', 'Bm D'),
            ('A4/.5 B4/.5 D5/1.5 E5/.5 F#5/.5 A5/.5', 'D Bm'),
            ('B5 A5/.5 F#5/.5 A5/2', 'G D'),
            ('D6/1.5 B5/.5 A5 B5/.5 A5/.5', 'Bm D'),
            ('F#5 E5/.5 F#5/.5 A5/2', 'G D'),
            ('B5/.5 A5/.5 F#5/.5 E5/.5 D5 E5/.5 F#5/.5', 'Em Bm'),
            ('E5 D5/.5 B4/.5 D5/2', 'G D'),
        ]},
        # B 转: yu mode on B, long breathing notes for the softer lead.
        {'name': 'B', 'lead': 'B', 'counter': False, 'bars': [
            ('F#5/2 A5 F#5', 'Bm Bm'),
            ('E5/1.5 F#5/.5 E5 D5', 'G G'),
            ('B4/2 D5 E5', 'Em Em'),
            ('F#5/3 E5', 'Bm Bm'),
            ('D5/1.5 E5/.5 F#5 A5', 'G G'),
            ('B5/2 A5 F#5', 'Em Bm'),
            ('E5 F#5/.5 E5/.5 D5 B4', 'G Em'),
            ('A4/2 B4 D5', 'Em A'),
        ]},
        # A return 合; the file loops straight back into bar 1's pickup.
        {'name': 'A2', 'lead': 'A', 'counter': True, 'bars': [
            ('A4/.5 B4/.5 D5/1.5 E5/.5 F#5', 'D D'),
            ('E5/.5 D5/.5 B4 A4/2', 'Bm D'),
            ('A4/.5 B4/.5 D5/1.5 E5/.5 F#5/.5 A5/.5', 'D Bm'),
            ('B5 A5/.5 F#5/.5 A5/2', 'G D'),
            ('B5/1.5 A5/.5 F#5 E5/.5 F#5/.5', 'Bm G'),
            ('D5 E5/.5 D5/.5 B4/2', 'Em Bm'),
            ('A4/.5 B4/.5 D5 E5/.5 F#5/.5 E5/.5 D5/.5', 'G Em'),
            ('D5/3 r', 'D D'),
        ]},
    ],
}

def section(name, bars, lead='A', counter=False):
    return {'name': name, 'lead': lead, 'counter': counter, 'bars': bars}

# Title: A yu (C gong), solemn and heroic; the hook rises A–C–D–E and falls back to the low zhi.
TITLE_A = [
    ('A4/1.5 C5/.5 D5 E5', 'Am Am'), ('G5/1.5 E5/.5 D5 E5', 'C G'),
    ('A4/1.5 C5/.5 D5 E5/.5 G5/.5', 'Am Am'), ('A5/2 G5 E5', 'F G'),
    ('D5/1.5 E5/.5 G5 E5', 'Dm Am'), ('D5/.5 C5/.5 A4 G4/2', 'C G'),
    ('A4 C5 D5/.5 E5/.5 D5/.5 C5/.5', 'Dm Em'), ('A4/3 r', 'Am Am'),
]
TITLE = {'bpm': 100, 'gong': 'C', 'sections': [
    section('Main theme', TITLE_A),
    section('Main theme answered', TITLE_A[:4] + [
        ('A5/1.5 G5/.5 E5 G5', 'F C'), ('A5 C6 A5/2', 'Am F'),
        ('G5/.5 E5/.5 D5 C5/.5 D5/.5 E5', 'G Em'), ('A4/2 E5 A5', 'Am Am')], counter=True),
    section('Bridge', [
        ('C5/2 D5 E5', 'C C'), ('G5/2 E5 D5', 'G G'), ('E5/1.5 D5/.5 C5 A4', 'Am Am'), ('G4/3 A4', 'Em G'),
        ('C5/2 E5 G5', 'F C'), ('A5/2 G5 E5', 'F Am'), ('D5 E5/.5 D5/.5 C5 D5', 'Dm G'), ('E5/3 r', 'Em Em')], lead='B'),
    section('Main theme return', TITLE_A, counter=True),
]}

# War map: E yu (G gong), dotted march hook on the yu note.
BATTLE_A = [
    ('E5/.75 E5/.25 E5/.5 G5/.5 A5 B5', 'Em Em'), ('A5/.5 G5/.5 E5 D5/2', 'C D'),
    ('E5/.75 E5/.25 E5/.5 G5/.5 A5 D6', 'Em G'), ('B5/2 A5/.5 G5/.5 A5', 'C D'),
    ('B5 A5/.5 G5/.5 E5 G5', 'Em C'), ('A5 G5/.5 E5/.5 D5/2', 'Am D'),
    ('E5/.5 G5/.5 A5/.5 G5/.5 E5 D5', 'C D'), ('E5/3 r', 'Em Em'),
]
BATTLE = {'bpm': 100, 'gong': 'G', 'sections': [
    section('March theme', BATTLE_A),
    section('March theme answered', BATTLE_A[:4] + [
        ('D6/1.5 B5/.5 A5 B5', 'G D'), ('G5 A5/.5 G5/.5 E5/2', 'C Em'),
        ('D5/.5 E5/.5 G5/.5 A5/.5 B5 A5', 'Am D'), ('E5/2 B4 E5', 'Em Em')], counter=True),
    section('Bridge', [
        ('B4 D5 E5 D5', 'Em Em'), ('B4 D5 E5/2', 'C C'), ('D5 E5 G5 E5', 'D D'), ('D5 E5 G5/2', 'Bm Bm'),
        ('E5 G5 A5 G5', 'C C'), ('E5 G5 A5/2', 'Am Am'), ('B5 A5 B5 D6', 'D D'), ('B5/2 A5 G5/.5 A5/.5', 'D D')]),
    section('March theme return', BATTLE_A, counter=True),
]}

# 白兵: B yu (D gong), fast stepwise riff circling the yu note.
SKIRMISH_A = [
    ('B4/.5 D5/.5 E5/.5 D5/.5 B4/.5 A4/.5 B4', 'Bm Bm'), ('B4/.5 D5/.5 E5/.5 F#5/.5 E5/.5 D5/.5 E5', 'G A'),
    ('B4/.5 D5/.5 E5/.5 D5/.5 B4/.5 A4/.5 B4', 'Bm Bm'), ('D5/.5 E5/.5 F#5/.5 A5/.5 F#5 E5', 'G A'),
    ('F#5/.5 E5/.5 D5/.5 E5/.5 F#5 A5', 'Bm D'), ('B5/.5 A5/.5 F#5/.5 E5/.5 D5 E5', 'G A'),
    ('F#5/.5 E5/.5 D5/.5 B4/.5 A4 D5', 'G A'), ('B4/3 r', 'Bm Bm'),
]
SKIRMISH = {'bpm': 152, 'gong': 'D', 'sections': [
    section('Battle riff', SKIRMISH_A),
    section('Battle riff repeated', SKIRMISH_A, counter=True),
    section('Climb', [
        ('E5 F#5 A5 F#5', 'Em Em'), ('E5/.5 F#5/.5 E5/.5 D5/.5 B4/2', 'Em Em'), ('F#5 A5 B5 A5', 'D D'),
        ('F#5/.5 A5/.5 F#5/.5 E5/.5 D5/2', 'D D'), ('A5 B5 D6 B5', 'G G'), ('A5/.5 B5/.5 A5/.5 F#5/.5 E5/2', 'G G'),
        ('F#5/.5 A5/.5 B5/.5 D6/.5 E6 D6', 'A A'), ('B5/2 A5 F#5', 'A A')]),
    section('Battle riff return', SKIRMISH_A, counter=True),
]}

# 单挑: G gong, heroic stepwise theme; the answer is a call and response, the clash turns to E yu.
DUEL_A = [
    ('D5 E5/.5 G5/.5 A5/1.5 G5/.5', 'G G'), ('E5 D5 B4 D5', 'Em D'),
    ('D5 E5/.5 G5/.5 A5/1.5 B5/.5', 'G G'), ('D6/2 B5 A5', 'C D'),
    ('B5/1.5 A5/.5 G5 A5', 'Em G'), ('B5 A5/.5 G5/.5 E5/2', 'C Em'),
    ('D5 E5 G5/.5 A5/.5 G5/.5 E5/.5', 'Am D'), ('G5/3 r', 'G G'),
]
DUEL = {'bpm': 100, 'gong': 'G', 'sections': [
    section('Duel theme', DUEL_A),
    section('Duel theme answered', DUEL_A[:2] + [
        ('B5 A5/.5 B5/.5 D6/1.5 B5/.5', 'G G'), ('A5 G5 E5 G5', 'Em D'),
        ('A5/1.5 B5/.5 D6 B5', 'C G'), ('A5 G5/.5 E5/.5 D5/2', 'Am D'),
        ('E5/.5 G5/.5 A5/.5 B5/.5 A5 G5', 'C D'), ('G5/2 D5 G5', 'G G')], counter=True),
    section('Clash', [
        ('E5/.5 E5/.5 G5 E5/.5 D5/.5 B4', 'Em Em'), ('E5/.5 E5/.5 G5 A5/2', 'Am Am'),
        ('B5/.5 B5/.5 A5 G5/.5 E5/.5 D5', 'Em Em'), ('E5/2 B4/2', 'Em D'),
        ('E5/.5 G5/.5 A5/.5 B5/.5 D6 B5', 'C D'), ('A5/.5 B5/.5 A5/.5 G5/.5 E5/2', 'Am Am'),
        ('D5 E5 G5 A5', 'C D'), ('B5/2 A5/2', 'D D')]),
    section('Duel theme return', DUEL_A, counter=True),
]}

# 战后: C gong, slow singing line over a brisk pulse (half notes at 150 bpm).
RESULT_A = [
    ('E5/2 G5/2', 'C C'), ('A5/3 G5', 'F C'), ('E5/2 D5 C5', 'Am Am'), ('D5/4', 'G G'),
    ('E5/2 G5/2', 'C C'), ('A5/2 C6/2', 'F F'), ('D6/2 C6 A5', 'Dm G'), ('G5/4', 'G G'),
    ('A5/2 G5 E5', 'F C'), ('G5/2 E5 D5', 'C Am'), ('C5/2 D5 E5', 'F G'), ('A4/4', 'Am Am'),
    ('C5/2 D5 E5', 'F G'), ('G5/2 A5 G5', 'C Am'), ('E5/2 D5/2', 'Dm G'), ('C5/4', 'C C'),
]
RESULT = {'bpm': 150, 'gong': 'C', 'sections': [
    section('Theme', RESULT_A, lead='B'),
    section('Theme return', RESULT_A, counter=True),
]}

# 败北: D yu (F gong), slow lament; the answer climbs an octave and sinks back to the yu note.
GAMEOVER = {'bpm': 76, 'gong': 'F', 'sections': [
    section('Lament', [
        ('A4/2 C5 D5', 'Dm Dm'), ('F5/1.5 G5/.5 F5 D5', 'Bb F'), ('C5/2 A4 C5', 'F F'), ('D5/4', 'Dm Dm'),
        ('F5/2 G5 A5', 'Bb F'), ('C6/1.5 A5/.5 G5 F5', 'F C'), ('G5 F5 D5 C5', 'Gm C'), ('D5/3 r', 'Dm Dm')], lead='B'),
    section('Lament answered', [
        ('A5/2 C6 D6', 'Dm Dm'), ('C6/1.5 A5/.5 G5/2', 'F C'), ('F5/2 D5 F5', 'Bb F'), ('G5/4', 'C C'),
        ('A5/2 G5 F5', 'Dm Bb'), ('D5/1.5 F5/.5 G5/2', 'Gm C'), ('A4 C5 D5 C5', 'Gm F'), ('D5/4', 'Dm Dm')], lead='B', counter=True),
]}

# 结局: A gong, soaring theme that reaches the high jiao and comes home.
ENDING_A = [
    ('E5 F#5/.5 A5/.5 B5/2', 'A A'), ('C#6 B5/.5 A5/.5 F#5/2', 'D A'),
    ('E5 F#5/.5 A5/.5 B5/1.5 C#6/.5', 'A F#m'), ('E6/2 C#6 B5', 'D E'),
]
ENDING = {'bpm': 112, 'gong': 'A', 'sections': [
    section('Ending theme', ENDING_A + [
        ('A5/1.5 B5/.5 C#6 B5', 'F#m D'), ('A5 F#5/.5 E5/.5 C#5/2', 'A F#m'),
        ('B4 C#5 E5/.5 F#5/.5 E5/.5 C#5/.5', 'D E'), ('A4/3 r', 'A A')]),
    section('Ending theme grows', ENDING_A + [
        ('E6/1.5 C#6/.5 B5 C#6', 'D A'), ('A5 B5/.5 A5/.5 F#5/2', 'D F#m'),
        ('E5/.5 F#5/.5 A5/.5 B5/.5 C#6 B5', 'D E'), ('A5/3 r', 'A A')], counter=True),
    section('Reflection', [
        ('C#5/2 E5 F#5', 'F#m F#m'), ('E5/2 C#5 B4', 'D D'), ('A4/2 B4 C#5', 'A A'), ('B4/4', 'E E'),
        ('C#5/2 E5 F#5', 'F#m D'), ('A5/2 F#5 E5', 'D A'), ('F#5 E5 C#5 B4', 'Bm E'), ('E5/4', 'E E')], lead='B'),
    section('Finale', ENDING_A + [
        ('A5/1.5 B5/.5 C#6 E6', 'F#m D'), ('C#6 B5/.5 A5/.5 F#5/2', 'D A'),
        ('E5 F#5 B5 C#6', 'D E'), ('A5/3 r', 'A A')], counter=True),
]}

SCORES = {'bgm-title': TITLE, 'bgm-strategy': STRATEGY, 'bgm-battle': BATTLE, 'bgm-skirmish': SKIRMISH,
          'bgm-duel': DUEL, 'bgm-result': RESULT, 'bgm-gameover': GAMEOVER, 'bgm-ending': ENDING}
