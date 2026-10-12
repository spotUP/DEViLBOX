"""The demo side of the SCR-PHRASING-PARITY A/B pair: the Up Rough demo's Deck C (three_deck.render's scratch bus,
line for line) over the same track span DEViLBOX rendered, from the plan it wrote.

  three_deck.build_scratch_events(seed) -> each event's record from the role pools (a clean 'drop' advances its
  role) -> scratch.render_gesture with the boombap deck profile, a +-4 ms human offset -> deck_c_eq ->
  scratch_routine.scratch_channel(room .42, delay .28, drive .09) + 0.22 dark-room tail -> 0.60 x the beat's
  RMS -> ducked 0.25 on the beat's transients -> 0.72 x beat + Deck C, headroom 0.98.

The beat is the track (not the demo's juggled hip-hop records): the grid is the track's downbeats from plan.json.
Run: /opt/homebrew/bin/python3.11 -I tools/scratch-fixtures/render_demo_three_deck.py \
       /Users/spot/Code/Up_Rough_Demo_System/tools thoughts/spot/renders/scratch-parity
"""
import importlib.util
import json
import os
import sys
import wave

import numpy as np

TOOLS, DIR = sys.argv[1], sys.argv[2]
RATE = 22050


def load(name):
    sp = importlib.util.spec_from_file_location(name, os.path.join(TOOLS, name + ".py"))
    m = importlib.util.module_from_spec(sp)
    sp.loader.exec_module(m)
    return m


td = load("three_deck")
sc = load("scratch")
srt = load("scratch_routine")
sb = load("scratch_bank")
dsp = load("synth_dsp")

plan = json.load(open(os.path.join(DIR, "plan.json")))
with wave.open(os.path.join(DIR, "track_drops.wav")) as w:
    sr, n = w.getframerate(), w.getnframes()
    x = np.frombuffer(w.readframes(n), "<i2").astype(float) / 32768.0
beat = dsp.resample_rate(x, sr, RATE)

bank = sb.load_bank(rate=RATE, with_audio=True)
pools = td.scratch_pools_from_bank(bank)
role_i = {r: 0 for r in pools}
sev = td.build_scratch_events(plan["seed"])
step_sec = 60.0 / (plan["bpm"] * 4)
down = plan["downbeatsSec"]
first = plan["routineStartBar"]
prof = sc.PROFILES["boombap"]["deck"]
cbus = np.zeros(len(beat) + int(0.6 * RATE))
rnd = np.random.RandomState(plan["seed"] & 0xFFFFFFFF)
seed = plan["seed"]
for (bar, st, role, gesture, vel) in sev:
    o = int((down[first + bar] + st * step_sec) * RATE)
    if gesture == "needle_drop":
        g = load("turntable").needle_drop(RATE, seed=seed)
    elif gesture == "needle_lift":
        g = load("turntable").needle_lift(RATE, seed=seed)
    else:
        if gesture == "drop":
            role_i[role] = role_i.get(role, 0) + 1
        pool = pools.get(role) or pools.get("HOME")
        csrc = pool[role_i.get(role, 0) % len(pool)]
        steps = sc._GESTURE_STEPS.get(gesture, 2)
        g = sc.render_gesture(csrc, gesture, steps * step_sec, RATE, velocity=vel, profile=prof, seed=seed + bar * 16 + st)
        o = max(0, o + int((-4 + 8 * rnd.rand()) * 1e-3 * RATE))
    e = min(len(cbus), o + len(g))
    cbus[o:e] += g[:e - o]
cbus = td.deck_c_eq(cbus, RATE)
cbus = srt.scratch_channel(cbus, RATE, room=0.42, delay_mix=0.28, drive=0.09)
tail = sc._sm.reverb(cbus, RATE, kind="dark_room", mix=1.0)
m = min(len(cbus), len(tail))
cbus = np.asarray(cbus, float)
cbus[:m] = cbus[:m] + 0.22 * tail[:m]
cbus = cbus[:len(beat)]
j_rms = float(np.sqrt(np.mean(beat ** 2))) + 1e-9
c_rms = float(np.sqrt(np.mean(cbus ** 2))) + 1e-9
cbus = cbus * (td.DECK_C_LEVEL_SCALE * j_rms / c_rms)
duck = dsp.lp(np.abs(beat), 40, RATE)
duck = 1.0 - td.DUCK_DEPTH * np.clip(duck / (duck.max() + 1e-9), 0, 1)
k = min(len(beat), len(cbus))
mix = plan["trackGain"] * beat[:k] + cbus[:k] * duck[:k]
peak = float(np.max(np.abs(mix))) + 1e-9
if peak > 0.98:
    mix *= 0.98 / peak
out = os.path.join(DIR, "demo_three_deck_drops.wav")
i16 = np.clip(np.round(mix * 32767), -32768, 32767).astype("<i2")
with wave.open(out, "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE)
    w.writeframes(i16.tobytes())
print("[A/B] demo Deck C, %d events, seed %d -> %s (%.1f s)" % (len(sev), seed, out, len(mix) / RATE))
