"""« Coparentalité Zen » score: an original West-Coast cool-jazz combo, 120 BPM, swing, F major, 36 s = 18 bars.
vibraphone (comping + one chord per step) / flute (melody) / jazz pizzicato bass (walking) / brushes and snaps (synthesised).
Run: LIB=<library> $LIB/.venv/bin/python music/score.py   → music/score.wav
Cue map (TREATMENT.md §6): stop-time 4.5–5.0 s; step chords on 10 / 16 / 22 s; near-silence 27.5–28 s;
the three step chords return one per beat at 28 s; final Fmaj9 tremolo on the logo (30.2 s) rings to the end."""
import os, sys
LIB = os.environ['LIB']; sys.path.insert(0, LIB)
import numpy as np, soundfile as sf
from scipy.signal import butter, sosfilt
from core.audio import sampler as S
from core.audio.sfx import SR, add, limit

OUT = os.path.dirname(os.path.abspath(__file__))
S.seed(27); rng = np.random.default_rng(27)
B = 0.5; BAR = 4 * B; DUR = 36.0; N = int(DUR * SR); SW = 0.62
stems = {k: np.zeros((N, 2), np.float32) for k in ('drums', 'bass', 'vib', 'lead')}

def T(bar, beat=0.0):
    whole = np.floor(beat + 1e-9); frac = beat - whole
    if abs(frac - .5) < 1e-6: frac = SW
    return (bar - 1) * BAR + (whole + frac) * B
def M(p): return S.midi(p) if isinstance(p, str) else p
def bp(x, lo, hi): return sosfilt(butter(2, [lo, hi], 'band', fs=SR, output='sos'), x)
def mute(a, b):            # nothing plays in [a, b)
    def ok(t): return not (a - 0.02 <= t < b)
    return ok
OK = lambda t: not (4.5 <= t < 5.0) and not (27.5 <= t < 28.0)

def motor(x, depth=.3, rate=5.0):
    tt = np.arange(len(x)) / SR; return (x * (1 - depth * (.5 + .5 * np.sin(2 * np.pi * rate * tt)))).astype(np.float32)
def vib(t, pitches, dur, vel=.45, trem=0.0, gain=1.0, pan=-.25, hard=False):
    if not OK(t): return
    for i, p in enumerate(pitches):
        x = S.note('vibraphone_hard' if hard else 'vibraphone', M(p), dur, vel=vel)
        if trem: x = motor(x, trem)
        add(stems['vib'], x, t + i * 0.006, gain, pan + (i - 1.5) * .1)
def bass(t, p, dur=.45, vel=.7):
    if not OK(t): return
    add(stems['bass'], S.note('jazz_bass', M(p), dur, vel=vel), t, 1.0, 0.05)
def flute(t, p, beats, vel=.5, gain=1.0):
    if not OK(t): return
    add(stems['lead'], S.note('flute', M(p), max(.15, beats * B * .9), vel=vel, release=.1), t - .02, gain, .2)
def brush(t, accent=False):
    if not OK(t): return
    d = .16 if accent else .22; tt = np.arange(int(d * SR)) / SR
    x = bp(rng.standard_normal(len(tt)), 2500, 9000) * (np.exp(-tt / (.03 if accent else .09)))
    add(stems['drums'], x.astype(np.float32), t, .16 if accent else .07, .3 if accent else -.3)
def snap(t):
    if not OK(t): return
    d = .08; tt = np.arange(int(d * SR)) / SR
    x = bp(rng.standard_normal(len(tt)), 1500, 5000) * np.exp(-tt / .012) + np.sin(2 * np.pi * 1800 * tt) * np.exp(-tt / .006) * .4
    add(stems['drums'], x.astype(np.float32), t, .22, .45)

# chords (voicings for vibes, bass roots)
CH = {
    'F6': (['A3', 'D4', 'F4', 'C5'], 'F2'), 'Fmaj7': (['A3', 'E4', 'G4', 'C5'], 'F2'), 'Fmaj9': (['A3', 'E4', 'G4', 'C5'], 'F2'),
    'Dm7': (['F3', 'C4', 'E4', 'A4'], 'D2'), 'Dm9': (['F3', 'C4', 'E4', 'A4'], 'D2'), 'Gm7': (['F3', 'Bb3', 'D4', 'A4'], 'G2'),
    'Gm9': (['F3', 'Bb3', 'D4', 'A4'], 'G2'), 'C7': (['E3', 'Bb3', 'D4', 'G4'], 'C2'), 'C13': (['E3', 'Bb3', 'D4', 'A4'], 'C2'),
}
# one chord (or two halves) per bar
BARS = {1: ['F6'], 2: ['Gm7', 'C7'], 3: ['Fmaj7'], 4: ['Dm7'], 5: ['Gm7', 'C7'], 6: ['Fmaj9'], 7: ['Dm7'], 8: ['Gm7', 'C7'],
        9: ['Dm9'], 10: ['Gm7'], 11: ['C7'], 12: ['Gm9'], 13: ['C13'], 14: ['Fmaj7'], 15: ['Fmaj9', 'Dm9', 'Gm9', 'C13']}
def roots(bar):
    return [CH[c][1] for c in BARS[bar]]

# ---- walking bass: root on 1, chord tones, chromatic approach into the next bar
for bar in range(1, 15):
    cs = BARS[bar]; nxt = M(roots(bar + 1)[0]) if bar + 1 in BARS else M('F2')
    if len(cs) == 1:
        r = M(CH[cs[0]][1]); walk = [r, r + (3 if cs[0].startswith(('D', 'G')) else 4), r + 7, nxt + (1 if (nxt - r) % 12 < 6 else -1)]
    else:
        a, b = M(CH[cs[0]][1]), M(CH[cs[1]][1]); walk = [a, a + 7, b, nxt + 1]
    for k, p in enumerate(walk): bass(T(bar, k), p, .44, .72 if k == 0 else .6)
# end: bass walks the four returning chords, then a held F pedal
for k, c in enumerate(BARS[15]): bass(T(15, k), M(CH[c][1]) + 12 * (k > 1) * 0, .44, .7)
bass(30.2, 'F1', 3.0, .7); bass(32.2, 'C2', 1.2, .45); bass(34.0, 'F1', 1.8, .5)

# ---- brushes: stir on every beat, accent on 2 and 4; snaps on 2 and 4 in the title (bars 3–5)
for bar in range(1, 16):
    for k in range(4):
        brush(T(bar, k)); brush(T(bar, k + .5))
        if k in (1, 3): brush(T(bar, k), True)
        if k in (1, 3) and 3 <= bar <= 5: snap(T(bar, k))

# ---- vibraphone comping (beat 1 and the swung "and" of 2), skipping the step downbeats which get their own big chord
STEP_HITS = {10.0: 'Fmaj9', 16.0: 'Dm9', 22.0: 'Gm9'}
for bar in range(1, 15):
    cs = BARS[bar]
    for j, c in enumerate(cs):
        t1 = T(bar, 2 * j)
        if t1 not in STEP_HITS: vib(t1, CH[c][0], .35, .32)
        vib(T(bar, 2 * j + 1.5), CH[c][0], .25, .26)
for t, c in STEP_HITS.items():
    vib(t, CH[c][0] + ['E5' if c != 'Gm9' else 'D5'], 1.6, .62, trem=.3, gain=1.2, hard=True)
# stop-time hook: the band hits on 4.0 then drops out; the stamp at 5.0 is the first sound after
vib(T(3, 0) - 1.0, CH['C7'][0], .4, .5)
# the merge: the step chords come back one per beat, then the final chord on the logo
for k, c in enumerate(BARS[15]): vib(T(15, k), CH[c][0], .45, .5, hard=True)
vib(30.2, ['F3', 'A3', 'E4', 'G4', 'C5', 'A5'], 5.4, .55, trem=.35, gain=1.25)
# little vibes glissando into the title and into the logo
for i, p in enumerate(['C5', 'D5', 'E5', 'G5', 'A5', 'C6']): vib(5.25 + i * .045, [p], .5, .3 + i * .04, pan=-.3 + i * .1, hard=True)
for i, p in enumerate(['F4', 'A4', 'C5', 'E5', 'G5', 'A5', 'C6']): vib(29.62 + i * .08, [p], .6, .28 + i * .03, pan=-.3 + i * .08)

# ---- flute: the melody (title), a short answer in each step, the closing phrase
MEL = [  # (bar, beat, pitch, beats)
    (3, 0, 'A4', 1), (3, 1, 'C5', .5), (3, 1.5, 'D5', .5), (3, 2, 'F5', 1.5), (3, 3.5, 'E5', .5),
    (4, 0, 'D5', 1), (4, 1, 'C5', .5), (4, 1.5, 'A4', 1.5), (4, 3, 'F4', 1),
    (5, 0, 'G4', .5), (5, .5, 'A4', .5), (5, 1, 'Bb4', 1), (5, 2, 'C5', .5), (5, 2.5, 'E5', 1.5),
    (6, 2.5, 'A5', .5), (6, 3, 'G5', 1), (7, 0, 'E5', 2),
    (9, 2.5, 'F5', .5), (9, 3, 'E5', .5), (9, 3.5, 'C5', .5), (10, 0, 'D5', 2),
    (12, 2.5, 'D5', .5), (12, 3, 'F5', .5), (12, 3.5, 'A5', .5), (13, 0, 'G5', 2),
    (16, 1, 'C5', .5), (16, 1.5, 'D5', .5), (16, 2, 'F5', 1), (16, 3, 'A5', 1), (17, 0, 'G5', 1.5), (17, 1.5, 'F5', 2.5),
]
for bar, beat, p, d in MEL: flute(T(bar, beat), p, d, .5 if bar < 16 else .45)

mix = stems['drums'] * 1.0 + stems['bass'] * 1.15 + stems['vib'] * .8 + stems['lead'] * .7
tt = np.arange(N) / SR; mix *= np.minimum(1, (DUR - tt) / 1.6)[:, None]
mix = limit(mix, .9)
sf.write(os.path.join(OUT, 'score.wav'), mix.astype(np.float32), SR)
for k, v in stems.items(): sf.write(os.path.join(OUT, f'stem_{k}.wav'), v, SR)
print('score.wav', mix.shape, 'peak', float(np.abs(mix).max()))
print('\n'.join(S.credits(['vibraphone', 'vibraphone_hard', 'flute', 'jazz_bass'])))
