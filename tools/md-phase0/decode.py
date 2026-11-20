# Decode tap.lua output: YM key-ons + channel-1 F-number, PSG channel-0 tone periods, per NTSC frame.
import sys
FPS = 59.922743
ym = {}; lat = None; first = None
for line in open(sys.argv[1]):
    if line.startswith('#'): print(line.strip()); continue
    t, cpu, a, v = line.split(); t = float(t); a = int(a, 16); v = int(v, 16)
    f = int(t * FPS)
    if a in (0xC00011, 0x7F11):
        if v & 0x80: lat = v
        if lat is not None and (lat & 0x70) == 0x00 and not (v & 0x80): print(f"f{f} {cpu} PSG0 period {((v & 0x3f) << 4) | (lat & 0xf)}")
        continue
    a &= 3; port = a >> 1
    if not (a & 1): ym[port] = v; continue
    r = ym.get(port)
    if port == 0 and r == 0x28 and v & 0xF0: print(f"f{f} {cpu} KEYON ch{v & 7} ops{v >> 4:X}")
    if port == 0 and r == 0xA4: ym['hi'] = v
    if port == 0 and r == 0xA0 and 'hi' in ym: print(f"f{f} {cpu} FM1 block {(ym['hi'] >> 3) & 7} fnum {((ym['hi'] & 7) << 8) | v}")
