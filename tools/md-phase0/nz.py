import sys; sys.path.insert(0, '/Users/spot/Code/DEViLBOX/tools/md-phase0')
from events import writes_vgm, writes_tap
# noise channel latch writes (ATT and MODE) relative to first FM key-on, first N seconds
p=sys.argv[1]; T=float(sys.argv[2]); src=writes_vgm(p) if p.endswith('.vgm') else writes_tap(p)
t0=None; lat=None; out=[]
for t,chip,a,v in src:
    if chip=='ym':
        if not a&1: lat=v
        elif lat==0x28 and v&0xF0 and t0 is None: t0=t
        continue
    if t0 is None: continue
    if v&0x80 and (v>>5)&3==3: out.append(f"{t-t0:7.3f} {'ATT' if v&16 else 'MODE'} {v&15}")
    if t-t0>T: break
print('\n'.join(out))
