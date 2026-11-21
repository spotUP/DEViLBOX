# loud.py <vgm> <tap> [win=4] [T=40]: per-channel register loudness (dB, rel full scale), Furnace vs MAME, per window.
# FM: sum of carrier amplitudes 10^(-0.75*TL/20) while keyed (no envelope). PSG: 10^(-2*ATT/20). DAC: RMS of output bytes.
import sys, struct, math; sys.path.insert(0, '/Users/spot/Code/DEViLBOX/tools/md-phase0')
from events import writes_tap, writes_vgm
CAR = {0:[3],1:[3],2:[3],3:[3],4:[1,3],5:[1,2,3],6:[1,2,3],7:[0,1,2,3]}
SLOT = [0, 8, 4, 12]  # op1,op2,op3,op4 register offsets
def vgm_dac(path):  # yields (t, byte) from DAC stream starts (0x95) at the 0x92 rate
    b = open(path,'rb').read(); p = 0x34 + struct.unpack_from('<I', b, 0x34)[0]; s = 0; blocks = []; data = b''; freq = 0; cur = None; out = []
    LEN = {0x4F:1,0x50:1,0x52:2,0x53:2,0x90:4,0x91:4,0x93:10,0xE0:4}
    def flush(upto):
        nonlocal cur
        if not cur: return
        st, off, ln, fr = cur; n = min(ln, int((upto - st) * fr))
        for i in range(n): out.append((st + i / fr, data[off + i]))
        cur = None
    while p < len(b):
        c = b[p]; p += 1
        if c == 0x67: sz = struct.unpack_from('<I', b, p+2)[0]; blocks.append((len(data), sz)); data += b[p+6:p+6+sz]; p += 6 + sz
        elif c == 0x92: freq = struct.unpack_from('<I', b, p+1)[0]; p += 5
        elif c == 0x95: flush(s/44100); bid = struct.unpack_from('<H', b, p+1)[0]; off, ln = blocks[bid]; cur = (s/44100, off, ln, freq); p += 4
        elif c == 0x94: flush(s/44100); p += 1
        elif c == 0x61: s += struct.unpack_from('<H', b, p)[0]; p += 2
        elif c == 0x62: s += 735
        elif c == 0x63: s += 882
        elif c == 0x66: break
        elif 0x70 <= c <= 0x7F: s += c - 0x6F
        elif 0x80 <= c <= 0x8F: s += c - 0x80
        elif c in LEN: p += LEN[c]
        else: raise SystemExit(f'vgm {c:02x}')
    flush(1e9); return out
def analyse(path, win, T):
    src = writes_vgm(path) if path.endswith('.vgm') else writes_tap(path)
    reg = {0:{}, 1:{}}; lat = {}; key = [0]*7; att = [15]*4; snl = None; dac = []
    frames = []; t0 = None; nextf = None
    acc = {}
    def sample(t):
        row = {}
        for c in range(1, 7):
            port, ch = (0, c-1) if c <= 3 else (1, c-4)
            al = reg[port].get(0xB0+ch, 0) & 7; tl = [reg[port].get(0x40+SLOT[o]+ch, 127) & 127 for o in range(4)]
            row[f'FM{c}'] = sum(10**(-0.75*tl[o]/20) for o in CAR[al] if key[c] >> o & 1)
        for i in range(4): row[f'PSG{i+1}'] = 10**(-2*att[i]/20) if att[i] < 15 else 0
        return row
    for t, chip, a, v in src:
        if chip == 'sn':
            if v & 0x80: snl = v
            if snl is not None and v & 0x90 == 0x90: att[(v >> 5) & 3] = v & 15
            continue
        if not a & 1: lat[a >> 1] = v; continue
        r = lat.get(a >> 1); port = a >> 1
        if r is None: continue
        if t0 is None and port == 0 and r == 0x28 and v & 0xF0 and (v & 7) != 3: t0 = t; nextf = t
        while nextf is not None and t >= nextf:
            frames.append((nextf - t0, sample(nextf))); nextf += 1/60
        if port == 0 and r == 0x2A: dac.append((t, v)); continue
        if port == 0 and r == 0x28:
            c = v & 7
            if c != 3 and c != 7: key[(c & 3) + 1 + (3 if c & 4 else 0)] = v >> 4
        reg[port][r] = v
    if path.endswith('.vgm'): dac = vgm_dac(path)
    nw = int(T / win); res = {}
    for t, row in frames:
        w = int(t // win)
        if 0 <= w < nw:
            for k, x in row.items(): res.setdefault(k, [0.0]*nw)[w] += x*x / (win*60)
    d = [0.0]*nw; n = [0]*nw
    for i, (t, x) in enumerate(dac):  # hold each byte until the next one, at most 1 ms
        dt = min(1e-3, (dac[i+1][0] - t) if i + 1 < len(dac) else 1e-3); w = int((t - t0) // win)
        if 0 <= w < nw: d[w] += ((x - 128) / 128) ** 2 * dt / win; n[w] += 1
    res['DAC'] = d; res['DACn'] = n
    return res
win = float(sys.argv[3]) if len(sys.argv) > 3 else 4; T = float(sys.argv[4]) if len(sys.argv) > 4 else 40
F = analyse(sys.argv[1], win, T); Mm = analyse(sys.argv[2], win, T)
db = lambda x: 10*math.log10(x) if x > 0 else -99
for k in [f'FM{c}' for c in range(1,7)] + [f'PSG{i}' for i in range(1,5)]:
    print(k.ljust(6), ' '.join(f'{db(Mm[k][w])-db(F[k][w]):+6.2f}' if F[k][w] > 0 or Mm[k][w] > 0 else '   .  ' for w in range(len(F[k]))), ' F0', round(db(F[k][0]),1), 'M0', round(db(Mm[k][0]),1))
print('DAC   ', ' '.join(f'{db(Mm["DAC"][w])-db(F["DAC"][w]):+6.2f}' for w in range(len(F['DAC']))), ' F0', round(db(F['DAC'][0]),1), 'M0', round(db(Mm['DAC'][0]),1))
print('DACn F', F['DACn']); print('DACn M', Mm['DACn'])
