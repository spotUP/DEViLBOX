"""Writes src/engine/dj/scratch/__tests__/fixtures/s950.json: the Up Rough demo's S950 chain
(sampler.process(x, "s950", 22050, dither=True) then scratch._norm) on a fixed 0.3 s input.
  /opt/homebrew/bin/python3.11 -I tools/scratch-fixtures/gen_s950_fixture.py \
    /Users/spot/Code/Up_Rough_Demo_System/tools src/engine/dj/scratch/__tests__/fixtures/s950.json"""
import sys, json
sys.path.insert(0, sys.argv[1])
import numpy as np
import sampler, scratch
RATE = 22050
n = int(0.3 * RATE)
t = np.arange(n) / RATE
x = 0.6 * np.sin(2 * np.pi * 220 * t) + 0.3 * np.sin(2 * np.pi * 3100 * t) + 0.1 * np.random.RandomState(3).uniform(-1, 1, n)
x = x / np.max(np.abs(x))
y = scratch._norm(sampler.process(x, "s950", RATE, dither=True))
idx = list(range(0, n, 37))
json.dump({"input": [float(v) for v in x], "idx": idx, "out": [float(y[i]) for i in idx], "n": n}, open(sys.argv[2], "w"))
print("ok", n, len(idx))
