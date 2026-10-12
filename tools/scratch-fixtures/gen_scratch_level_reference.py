"""Reference scratch-to-programme level (Up Rough device_session.render_session). Needs numpy + scipy:
   python3 -m venv /tmp/v && /tmp/v/bin/pip install numpy scipy && /tmp/v/bin/python -I tools/scratch-fixtures/gen_scratch_level_reference.py
Output -> src/engine/dj/scratch/scratchLevel.ts SCRATCH_TO_PROGRAMME_DB."""
import sys, json, numpy as np
sys.path.insert(0, '/Users/spot/Code/Up_Rough_Demo_System/tools')
import device_session as ds
R = 22050
bank = ds.device_bank_from_scratch_bank(rate=R)
jb = ds._load("device_juggle_bus")
br = jb.make_device_break(bpm=92, rate=R, seed=0)
juggle = jb.render_bus(br, bpm=92, rate=R, seed=0, events=None).astype(np.float64)
cbus = ds.render_deck_c(bank, rate=R, bpm=92, seed=0, events=None).astype(np.float64)
n = min(len(juggle), len(cbus)); juggle = juggle[:n]; cbus = cbus[:n]
rms = lambda x: np.sqrt(np.mean(x ** 2))
c = cbus * (0.60 * rms(juggle) / rms(cbus))
env = np.abs(juggle)
# the duck: 1 - 0.25 x normalised 40 Hz envelope of |juggle| (one-pole)
a = np.exp(-2 * np.pi * 40 / R); e = np.zeros(n); acc = 0.0
for i in range(n):
    acc = a * acc + (1 - a) * env[i]; e[i] = acc
duck = 1 - 0.25 * e / e.max()
prog = 0.72 * juggle; scr = c * duck
w = int(0.4 * R)
ratios = []
for k in range(0, n - w, w):
    s = rms(scr[k:k + w]); p = rms(prog[k:k + w])
    if s > 0.05 * rms(scr) * 3 and p > 0:   # windows where the scratch sounds
        ratios.append(20 * np.log10(s / p))
print(json.dumps({'sessionScratchToProgrammeDb': round(20 * np.log10(rms(scr) / rms(prog)), 2), 'duringScratchShortTermDbMedian': round(float(np.median(ratios)), 2), 'windows': len(ratios), 'of': (n - w) // w}))
