"""Writes src/engine/uprough/__tests__/fixtures/hat_path.json: tools/hiphop.py ProbabilityMemory, pick_hat_index,
draw_hat_vary, apply_hat_vary (_zone_eq), render_open_hat_choke and build_hat_pool, for the null test of
src/engine/uprough/hatPath.ts. Float32 arrays are stored as {n, sha (sha256 of the little-endian float32 bytes), b64
(the bytes, only where a readable diff is worth the size)}.
  /opt/homebrew/bin/python3.11 -I tools/softsynth-fixtures/gen_hat_path.py \
    /Users/spot/Code/UpRough/Up_Rough_Demo_System/tools src/engine/uprough/__tests__/fixtures/hat_path.json .
"""
import base64
import hashlib
import importlib.util
import json
import os
import random
import sys

import numpy as np

TOOLS, OUT = sys.argv[1], sys.argv[2]
sys.path.insert(0, TOOLS)


def load(name):
    sp = importlib.util.spec_from_file_location(name, os.path.join(TOOLS, name + ".py"))
    m = importlib.util.module_from_spec(sp)
    sp.loader.exec_module(m)
    return m


hh = load("hiphop")
pe = load("phrase_engine")


def arr(a, full=False):
    b = np.asarray(a, dtype=np.float32).astype("<f4").tobytes()
    d = {"n": len(b) // 4, "sha": hashlib.sha256(b).hexdigest()}
    if full:
        d["b64"] = base64.b64encode(b).decode()
    return d


# 2. ProbabilityMemory + pick_hat_index
pm_cases = []
for n, s, picks in ((6, 1, 90), (8, 2, 90), (12, 3, 90), (8, 0x4A77, 60), (1, 5, 5), (2, 7, 20)):
    rng = random.Random(s ^ 0x4A77)
    pm = pe.ProbabilityMemory(n)
    idx = [hh.pick_hat_index(pm, rng) for _ in range(picks)]
    pm_cases.append({"n": n, "seed": s, "idx": idx, "w": pm.w, "last": pm.last, "next": rng.random()})

# 4. draw_hat_vary
vary_cases = []
for s in (0, 1, 2, 12345, 2 ** 28, 2 ** 31 + 5):
    rng = random.Random(s ^ 0x4A77)
    vary_cases.append({"seed": s, "zone": None, "draws": [hh.draw_hat_vary(rng) for _ in range(30)], "next": rng.random()})
for z in ("edge", "middle", "tip", "bell", "nonsense"):
    rng = random.Random(77 ^ 0x4A77)
    vary_cases.append({"seed": 77, "zone": z, "draws": [hh.draw_hat_vary(rng, z) for _ in range(6)], "next": rng.random()})

# 3. build_hat_pool
pools = []
for style, rate, seed, n, full in (
        ("golden_era", 22050, 7, 8, True), ("boom_bap", 22050, 0, 6, False), ("trap", 22050, 1, 12, False),
        ("miami_bass", 22050, 100, 8, False), ("no_such_style", 22050, 3, 8, False), ("boom_bap", 44100, 7, 6, False),
        ("golden_era", 22050, 2 ** 28 + 3, 6, False), ("trap", 22050, 2 ** 31 + 5, 6, False),
        ("lofi", 22050, 4, 3, False), ("lofi", 22050, 4, 40, False)):
    p = hh.build_hat_pool(style, rate, seed, n)
    pools.append({"style": style, "rate": rate, "seed": seed, "n": n, "pool": [arr(h, full) for h in p]})

# 5. apply_hat_vary
base_pool = hh.build_hat_pool("boom_bap", 22050, 11, 6)
vary_hats = []
HV = {"off": 0.0031, "cents": 3.4, "atk": 0.0007, "decay": 1.03, "lp": 11900.0, "gain": 1.02, "noise_seed": 123456789}
for zone in ("edge", "middle", "tip", "bell", "nonsense"):
    v = dict(HV, zone=zone)
    vary_hats.append({"src": "pool0", "rate": 22050, "v": v, "out": arr(hh.apply_hat_vary(base_pool[0], v, rate=22050), zone in ("edge", "bell"))})
for k, (extra, rate) in enumerate((({"cents": -2.5, "decay": 0.96}, 22050), ({"off": 0.0, "atk": 0.0}, 22050),
                                   ({"off": 0.0049, "cents": 5.0, "decay": 1.05}, 44100), ({"atk": 0.0009, "gain": 0.95}, 22050))):
    v = dict(HV, zone="middle", **extra)
    src = base_pool[k + 1] if rate == 22050 else hh.build_hat_pool("boom_bap", 44100, 11, 6)[1]
    vary_hats.append({"src": "pool%d" % (k + 1) if rate == 22050 else "pool1@44100", "rate": rate, "v": v,
                      "out": arr(hh.apply_hat_vary(src, v, rate=rate))})
# synthetic short samples: offset branch taken (off < len//4) and skipped, and a tiny noise-seed spread
syn = [float(np.float32(np.sin(i * 0.9) * (1 - i / 40.0))) for i in range(40)]
for off_s, ns in ((0.0003, 1), (0.0006, 2 ** 29 + 1)):
    v = dict(HV, off=off_s, zone="tip", noise_seed=ns)
    vary_hats.append({"src": "syn", "rate": 22050, "v": v, "out": arr(hh.apply_hat_vary(syn, v, rate=22050), True)})
# drawn variations on real pool hats
rng = random.Random(0x4A77 ^ 9)
for j in range(8):
    v = hh.draw_hat_vary(rng)
    vary_hats.append({"src": "pool%d" % (j % 6), "rate": 22050, "v": v, "out": arr(hh.apply_hat_vary(base_pool[j % 6], v, rate=22050))})
pool_src = {"style": "boom_bap", "rate": 22050, "seed": 11, "n": 6}

# 6. render_open_hat_choke
oh = base_pool[2]
chokes = []
for dt, part, rate in ((1000.0, False, 22050), (1000.0, True, 22050), (0.0, False, 22050), (30.0, False, 22050),
                       (30.0, True, 22050), (60.0, True, 22050), (96.0, True, 22050)):
    chokes.append({"dt": dt, "partial": part, "rate": rate, "out": arr(hh.render_open_hat_choke(oh, dt, part, rate), dt == 30.0)})
n_oh = len(oh)
for dt in (n_oh / 22.050 - 1.0, n_oh / 22.050 - 0.01):  # fade clipped by the sample end
    chokes.append({"dt": dt, "partial": True, "rate": 22050, "out": arr(hh.render_open_hat_choke(oh, dt, True, 22050))})

# 7-lite: multi-bar run of the hat stream (pool of the SONG seed, pm persistent, fresh hat rng per bar)
runs = []
for song_seed, bars_n, sub in ((17, 3, True), (2 ** 28 + 3, 3, False)):
    pool = hh.build_hat_pool("boom_bap", 22050, song_seed, 6)
    pm = pe.ProbabilityMemory(len(pool))
    bars = []
    for b in range(bars_n):
        rng = random.Random((song_seed + b) ^ 0x4A77)
        hits = []
        for k in range(5 if sub else 3):
            i = hh.pick_hat_index(pm, rng)
            v = hh.draw_hat_vary(rng)
            hit = {"i": i, "v": v, "out": arr(hh.apply_hat_vary(pool[i], v, rate=22050))}
            if sub and k == 1:  # a sub-hit: pick + vary again from the closed pool
                si = hh.pick_hat_index(pm, rng)
                sv = hh.draw_hat_vary(rng)
                hit["sub"] = {"i": si, "v": sv, "out": arr(hh.apply_hat_vary(pool[si], sv, rate=22050))}
            hits.append(hit)
        bars.append({"hits": hits, "next": rng.random(), "w": list(pm.w), "last": pm.last})
    runs.append({"song_seed": song_seed, "sub": sub, "pool": {"style": "boom_bap", "rate": 22050, "seed": song_seed, "n": 6}, "bars": bars})

zone_gains = {k: v[1] for k, v in hh._ZONE_EQ_PARAMS.items()}
with open(OUT, "w", encoding="utf-8") as f:
    json.dump({"zone_gains": zone_gains, "pm": pm_cases, "vary": vary_cases, "pools": pools, "pool_src": pool_src,
               "vary_hats": vary_hats, "chokes": chokes, "choke_src": "pool2", "runs": runs},
              f, separators=(",", ":"), allow_nan=False)
print("%d pm, %d vary, %d pools, %d vary_hats, %d chokes, %d runs -> %s (%d bytes)" % (
    len(pm_cases), len(vary_cases), len(pools), len(vary_hats), len(chokes), len(runs), OUT, os.path.getsize(OUT)))
