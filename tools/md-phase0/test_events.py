# Self-check for events.writes_vgm: a Furnace loop-continuation 0x93 (flags 0x81, sent when the first pass of a looping
# sample ends) is no DAC start; a 0x93 sample-offset start (90xx-92xx) and every 0x95 start stay.
# Run: python3 -I tools/md-phase0/test_events.py
import os, struct, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from events import writes_vgm

def wait(n):
    out = b''
    while n: k = min(n, 65535); out += b'\x61' + struct.pack('<H', k); n -= k
    return out

LEN, FREQ = 8000, 8000  # one second of sample at 8 kHz = 44100 VGM samples
body = (b'\x67\x66\x00' + struct.pack('<I', LEN) + bytes(LEN)
        + b'\x92\x00' + struct.pack('<I', FREQ)
        + b'\x95\x00' + struct.pack('<H', 0) + b'\x00'                        # note start at 0 s
        + wait(44100)
        + b'\x93\x00' + struct.pack('<I', 100) + b'\x81' + struct.pack('<I', 7900)  # loop restart at 1 s: skip
        + wait(22050)
        + b'\x93\x00' + struct.pack('<I', 2000) + b'\x01' + struct.pack('<I', 6000)  # offset note at 1.5 s: count
        + wait(22050)
        + b'\x93\x00' + struct.pack('<I', 100) + b'\x81' + struct.pack('<I', 7900)  # 0x81 mid-pass at 2 s: count
        + b'\x66')
vgm = bytearray(0x40) + body
vgm[0:4] = b'Vgm '; struct.pack_into('<I', vgm, 0x34, 0x40 - 0x34)
with tempfile.NamedTemporaryFile(suffix='.vgm', delete=False) as f: f.write(vgm)
try: got = [(round(t, 3), c) for t, chip, c, _ in writes_vgm(f.name) if chip == 'pcm']
finally: os.unlink(f.name)
want = [(0.0, 0x95), (1.5, 0x93), (2.0, 0x93)]
assert got == want, f'{got} != {want}'
print('[OK] events.writes_vgm skips only loop-continuation 0x93')
