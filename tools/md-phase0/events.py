# YM2612 + SN76489 register writes -> one event per line: "<sec> <chan> <event> <value>".
# Input: a MAME tap.lua log (tools/md-phase0/tap.lua) or a .vgm file (Furnace -vgmout), so both sides decode alike.
# Times start at the first FM key-on of the file. Events: FMn KEYON/KEYOFF, FMn FREQ <hz> (on every F-number write),
# PSGn FREQ <hz>, PSGn ATT <0..15>, NOISE MODE <latch byte low 3 bits>. Usage: events.py <tap.txt|song.vgm>
import struct, sys

YM_CLK, SN_CLK = 7670454, 3579545
CH = {0: 1, 1: 2, 2: 3, 4: 4, 5: 5, 6: 6}

def writes_tap(path):
    for line in open(path):
        if line.startswith('#') or len(line.split()) != 4: continue  # MAME stops mid-line
        t, _cpu, a, v = line.split(); a = int(a, 16); v = int(v, 16)
        if a in (0xC00011, 0x7F11): yield float(t), 'sn', 0, v
        else: yield float(t), 'ym', a & 3, v

def writes_vgm(path):
    b = open(path, 'rb').read(); p = 0x34 + struct.unpack_from('<I', b, 0x34)[0]; s = 0
    LEN = {0x4F: 1, 0x90: 4, 0x91: 4, 0x92: 5, 0x93: 10, 0x94: 1, 0x95: 4, 0xE0: 4}
    while p < len(b):
        c = b[p]; p += 1
        if c == 0x50: yield s / 44100, 'sn', 0, b[p]; p += 1
        elif c in (0x52, 0x53): port = (c - 0x52) * 2; yield s / 44100, 'ym', port, b[p]; yield s / 44100, 'ym', port + 1, b[p + 1]; p += 2
        elif c == 0x61: s += struct.unpack_from('<H', b, p)[0]; p += 2
        elif c == 0x62: s += 735
        elif c == 0x63: s += 882
        elif c == 0x66: return
        elif c == 0x67: p += 6 + struct.unpack_from('<I', b, p + 2)[0]
        elif 0x70 <= c <= 0x7F: s += c - 0x6F
        elif 0x80 <= c <= 0x8F: s += c - 0x80
        elif c in LEN: p += LEN[c]
        else: raise SystemExit(f'vgm command {c:02x} at {p - 1:x}')

def events(path):
    ym = {}; hi = {}; lat = None; per = {}; out = []; key = {}
    src = writes_vgm(path) if path.endswith('.vgm') else writes_tap(path)
    for t, chip, a, v in src:
        if chip == 'sn':
            if v & 0x80: lat = v
            if lat is None: continue
            c = (lat >> 5) & 3
            if lat & 0x10:
                if v & 0x80: out.append((t, 'NOISE' if c == 3 else f'PSG{c + 1}', 'ATT', v & 15))
            elif c < 3:
                per[c] = ((per.get(c, 0) & 0x3F0) | (v & 15)) if v & 0x80 else (((v & 0x3F) << 4) | (lat & 15))
                out.append((t, f'PSG{c + 1}', 'FREQ', round(SN_CLK / 32 / max(1, per[c]), 1)))
            elif v & 0x80: out.append((t, 'NOISE', 'MODE', v & 7))
            continue
        port = a >> 1
        if not a & 1: ym[port] = v; continue
        r = ym.get(port)
        if port == 0 and r == 0x28:
            c = CH.get(v & 7)
            if c:
                # A slot restarts its envelope only on a 0->1 key bit (YM2612 per-operator key edge), so a write that re-sends
                # already-on slots is no start. FM3 counts each risen slot: its operators are separate voices in ext-ch3 mode,
                # keyed together by Furnace (one write) but one track at a time by MDSDRV (one write per operator).
                rose = v >> 4 & ~key.get(c, 0); key[c] = v >> 4
                if not v & 0xF0: out.append((t, f'FM{c}', 'KEYOFF', 0))
                elif c == 3: out.extend((t, 'FM3', 'KEYON', 1 << i) for i in range(4) if rose >> i & 1)
                elif rose: out.append((t, f'FM{c}', 'KEYON', v >> 4))
        elif 0x40 <= r <= 0x4F and r & 3 != 3: out.append((t, f'FM{port * 3 + (r & 3) + 1}', f'TL{(r >> 2) & 3}', v & 0x7F))
        elif 0xA4 <= r <= 0xA6: hi[port * 3 + r - 0xA4] = v
        elif 0xA0 <= r <= 0xA2:
            k = port * 3 + r - 0xA0; h = hi.get(k, 0); blk = (h >> 3) & 7; fn = ((h & 7) << 8) | v
            out.append((t, f'FM{k + 1}', 'FREQ', round(fn * YM_CLK / 144 / 2 ** (21 - blk), 2)))
    t0 = next((e[0] for e in out if e[2] == 'KEYON'), 0)
    return [(round(e[0] - t0, 5), *e[1:]) for e in out]

if __name__ == '__main__':
    for e in events(sys.argv[1]): print(*e)
