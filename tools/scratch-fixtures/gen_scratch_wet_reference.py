"""Reference wet scratch channel metrics + room IR fixture (Up Rough scratch_routine.scratch_channel, sampler.reverb). Needs numpy + scipy:
   python3 -m venv /tmp/v && /tmp/v/bin/pip install numpy scipy && /tmp/v/bin/python -I tools/scratch-fixtures/gen_scratch_wet_reference.py
Output -> REF in src/engine/dj/scratch/__tests__/scratchWetBusMatchesTheReference.test.ts; room_ir.npy -> fixtures/scratch_room_ir.json."""
import sys, json, numpy as np
sys.path.insert(0, '/Users/spot/Code/Up_Rough_Demo_System/tools')
import scratch_routine as srt
import sampler as sm
R = 22050  # the reference renders at 22,050 Hz (scratch_dj.RATE)
def burst():
    n = int(0.03 * R)
    x = np.zeros(int(1.2 * R))
    s = 7
    for i in range(n):
        s = (s * 1103515245 + 12345) % 2147483648
        u = s / 2147483648 * 2 - 1
        w = 0.5 - 0.5 * np.cos(2 * np.pi * i / (n - 1))
        x[i] = 0.1 * u * w
    return x, n
def edc_rt(ir):
    e = np.cumsum(ir[::-1] ** 2)[::-1]
    edb = 10 * np.log10(e / e[0] + 1e-30)
    i5 = np.argmax(edb <= -5); i25 = np.argmax(edb <= -25)
    return 3 * (i25 - i5) / R  # T20 x 3 = RT60
x, n = burst()
wet = srt.scratch_channel(x.copy(), R, room=0.3, delay_mix=0.16, drive=0.10)
tail_from = n + int(0.005 * R)
ratio = 10 * np.log10(np.sum(wet[tail_from:] ** 2) / np.sum(wet[:tail_from] ** 2))
dry = srt.scratch_channel(x.copy(), R, room=0.0, delay_mix=0.0, drive=0.10)
ratio_dry = 10 * np.log10(np.sum(dry[tail_from:] ** 2) / np.sum(dry[:tail_from] ** 2))
imp = np.zeros(int(1.0 * R)); imp[0] = 1.0
room_ir = 0.6 * sm.reverb(imp, R, kind='short_plate', mix=1.0) + 0.4 * sm.reverb(imp, R, kind='dark_room', mix=1.0)
rt = edc_rt(room_ir[:len(imp)])
# also tail energy share of the room IR beyond 5 ms
tailshare = 10*np.log10(np.sum(room_ir[int(0.005*R):]**2)/np.sum(room_ir[:int(0.005*R)]**2))
print(json.dumps({'rate': R, 'channelTailToBurstDb': round(ratio, 2), 'dryTailToBurstDb': round(ratio_dry, 2), 'roomRt60Sec': round(rt, 4), 'roomTailShareDb': round(tailshare, 2), 'roomIrLen': len(room_ir)}))
np.save('room_ir.npy', room_ir)
