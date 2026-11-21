import sys, math, subprocess
# time-held noise power per 4 s window from nz.py output (ATT held until next ATT write)
def pw(p):
    ev=[(float(a),int(c)) for a,b,c in (l.split() for l in subprocess.run(['python3','-I','/Users/spot/Code/DEViLBOX/tools/md-phase0/nz.py',p,'40'],capture_output=True,text=True).stdout.splitlines()) if b=='ATT']
    w=[0.0]*10
    for i,(t,a) in enumerate(ev[:-1]):
        dt=ev[i+1][0]-t; k=int(t//4)
        if k<10 and a<15: w[k]+=10**(-2*a/10)*dt
    return w
F=pw(sys.argv[1]); M=pw(sys.argv[2])
print(' '.join(f'{10*math.log10(m/f):+.2f}' if f>0 and m>0 else '.' for f,m in zip(F,M)))
