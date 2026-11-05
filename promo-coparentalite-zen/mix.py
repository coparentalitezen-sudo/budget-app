"""Mix: score + narration + material foley + room tone → out/mix.wav
Run: LIB=<library> $LIB/.venv/bin/python mix.py   (needs events.json from core/render/events.mjs, voices/, music/score.wav)
Three layers: ambience (warm room tone, a very quiet mantel clock), foley on the picture's events, music ducked 8 dB under the voice.
Silences: 4.5–5.0 s everything but room tone stops (the first sound after it is the stamp); 27.5–28.0 s room tone only."""
import os, sys, json
LIB = os.environ['LIB']; sys.path.insert(0, LIB)
import numpy as np, soundfile as sf, soxr
from core.audio.sfx import SR, t_, env_exp, bp, lp, hp, noise, norm, brown, click, clack, whoosh, thump, ding, pop, add, compress, limit
D = os.path.dirname(os.path.abspath(__file__))
E = json.load(open(os.path.join(D, 'events.json')))
DUR = E['dur']; N = int(round(DUR * SR)); EV = E['ev']
rng = np.random.default_rng(31)
def nz(d): return rng.standard_normal(len(t_(d)))
def sine(f, d): return np.sin(2 * np.pi * np.cumsum(np.broadcast_to(f, len(t_(d))).astype(float)) / SR)
def M(*xs): n = max(len(x) for x in xs); return sum(np.pad(x, (0, n - len(x))) for x in xs)

# ---------------- foley by material
def stamp():                 # rubber stamp: thick, damped, a paper smack
    d = .3; tt = t_(d); return norm(sine(140 * (1 - .4 * tt), d) * env_exp(d, .035) + lp(nz(d), 1800) * env_exp(d, .012) * .9)
def paper_swish(d=.3): return norm(bp(nz(d), 1800, 8000)) * np.sin(np.pi * t_(d) / d) ** 2
def pen_write(d=.5): x = bp(nz(d), 2000, 7000) * (0.5 + .5 * np.abs(np.sin(2 * np.pi * 11 * t_(d)))); return norm(x) * np.sin(np.pi * t_(d) / d)
def slide_whistle(up=True, d=.3):
    f = np.linspace(700, 1500, len(t_(d))) if up else np.linspace(1500, 800, len(t_(d)))
    return norm(sine(f * (1 + .01 * np.sin(2 * np.pi * 6 * t_(d))), d)) * np.sin(np.pi * t_(d) / d) ** .6
def soft_tap(): d = .08; return norm(M(hp(nz(d), 1500) * env_exp(d, .003), sine(1200, d) * env_exp(d, .015) * .5))
def bubble(p=0):             # a soap-bubble "plip" that rises a step per bubble
    d = .18; f0 = 520 * 2 ** (p * 2 / 12); f = f0 * (1 + 1.4 * t_(d) / d)
    return norm(sine(f, d) * env_exp(d, .05)) * np.minimum(1, t_(d) / .004)
def buzz():                  # a phone vibrating on a hand: two short motor bursts
    d = .32; tt = t_(d); g = ((tt % .16) < .11).astype(float)
    return norm(bp(np.sign(np.sin(2 * np.pi * 150 * tt)) + .3 * nz(d), 90, 900) * g)
def flutter(d=.45):          # a paper receipt falling
    x = bp(nz(d), 1500, 6000) * (0.4 + .6 * np.abs(np.sin(2 * np.pi * 9 * t_(d)))); return norm(x) * np.sin(np.pi * t_(d) / d)
def paper_land(): d = .2; return norm(M(lp(nz(d), 1200) * env_exp(d, .02), bp(nz(d), 2000, 6000) * env_exp(d, .008) * .5))
def tick(n): d = .05; return norm(sine(2200 + n * 90, d) * env_exp(d, .01))
def iris(d): tt = t_(d); return norm(bp(nz(d), 1000, 6000) * np.linspace(1, .2, len(tt))) * np.sin(np.pi * tt / d)
def sparkle():
    out = np.zeros(int(.6 * SR))
    for i, f in enumerate([2093, 2637, 3136, 4186]): x = sine(f, .3) * env_exp(.3, .08); o = int(i * .05 * SR); out[o:o + len(x)] += x * (.7 ** i)
    return norm(out)
def wood_tick(): return norm(clack(1.1, 1)[:int(.1 * SR)])

fx = np.zeros((N, 2)); vo = np.zeros((N, 2)); amb = np.zeros((N, 2))
for e in EV:
    t, ty, gn, pan = e['t'], e['type'], e.get('gain', 1.0), e.get('pan', 0.0)
    if ty == 'vo': continue
    elif ty == 'stamp': add(fx, stamp(), t, .75 * gn)
    elif ty == 'iris': add(fx, iris(e.get('dur', .5)), t, .28)
    elif ty == 'pop': add(fx, pop(1), t, .32 * gn, pan or .2)
    elif ty == 'bubble': add(fx, bubble(e.get('pitch', 0)), t, .32, pan)
    elif ty == 'buzz': add(fx, buzz(), t, .28, pan)
    elif ty == 'pen_write': add(fx, pen_write(e.get('dur', .5)), t, .2 * gn, pan)
    elif ty == 'slide': add(fx, paper_swish(.25), t, .22 * gn, -.4)
    elif ty == 'whoosh': add(fx, whoosh(e.get('dur', .35), 1), t, .3 * gn, pan)
    elif ty == 'tap': add(fx, soft_tap(), t, .5, .2)
    elif ty == 'ding': add(fx, ding(1), t, .32 * gn, .1)
    elif ty == 'paper_swish': add(fx, paper_swish(.3), t, .35 * gn, pan or .4)
    elif ty == 'flutter': add(fx, flutter(e.get('dur', .45)), t, .25, -.2)
    elif ty == 'paper_land': add(fx, paper_land(), t, .5, -.2)
    elif ty == 'tick': add(fx, tick(e.get('n', 0)), t, .12, .1)
    elif ty == 'whistle': add(fx, slide_whistle(e.get('up', 0) == 1), t, .2, pan)
    elif ty == 'sparkle': add(fx, sparkle(), t, .22, 0)

# ---------------- narration: compress, then sit it ~10 dB over the music
voice_env = np.zeros(N)
for e in EV:
    if e['type'] != 'vo': continue
    y, sr = sf.read(os.path.join(D, 'voices', e['id'] + '.wav'))
    if y.ndim > 1: y = y.mean(1)
    y = soxr.resample(y, sr, SR)
    y = compress(norm(y, .9), thr=.3, ratio=3.0)
    add(vo, y, e['t'], .85, 0)
    s = int(e['t'] * SR); voice_env[s:s + len(y)] = 1

# ---------------- ambience
room = lp(brown(DUR), 900) * .02
amb += np.stack([room, np.roll(room, 311)], 1)
for k in range(int(DUR / 1.0)):
    if 30 <= k: break
    add(amb, wood_tick(), k * 1.0, .025, -.6)

# ---------------- music + ducking
mus, msr = sf.read(os.path.join(D, 'music', 'score.wav'))
if msr != SR: mus = soxr.resample(mus, msr, SR)
mus = mus[:N] if len(mus) >= N else np.pad(mus, ((0, N - len(mus)), (0, 0)))
k = int(.15 * SR); sm = np.convolve(voice_env, np.ones(k) / k, 'same')
mus = mus * (1 - sm * (1 - 10 ** (-8 / 20)))[:, None]

def gate(buf, a, b, keep=0.0, fade=.03):
    s, e = int(a * SR), int(b * SR); f = int(fade * SR); m = np.ones(N); m[s:e] = keep
    m[max(0, s - f):s] = np.linspace(1, keep, min(f, s)); m[e:e + f] = np.linspace(keep, 1, len(m[e:e + f])); buf *= m[:, None]
gate(fx, 4.5, 4.99); gate(mus, 4.5, 4.99)          # stop-time: room tone only, the stamp comes out of the silence
gate(fx, 27.5, 27.99); gate(mus, 27.5, 27.99)

mix = mus * .85 + fx * .9 + vo + amb
mix = limit(mix, .95)
os.makedirs(os.path.join(D, 'out'), exist_ok=True)
sf.write(os.path.join(D, 'out', 'mix.wav'), mix.astype(np.float32), SR)
print('mix.wav', mix.shape, 'peak', float(np.abs(mix).max()))
