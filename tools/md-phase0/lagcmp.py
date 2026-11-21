import sys,math
# lagcmp.py fur.ev mame.ev T ch : per frame cents error, best of lag -1..+1 frames (MAME vblank vs Furnace tick phase)
def load(p,ch,T,ev='FREQ'):
    d={}
    for l in open(p):
        t,c,e,v=l.split(); t=float(t)
        if 0<=t<T and c==ch and e==ev: d[round(t*60)]=float(v)
    return d
def series(d,N):
    out=[];cur=None
    for f in range(N): cur=d.get(f,cur); out.append(cur)
    return out
T=float(sys.argv[3]);N=int(T*60)
a=series(load(sys.argv[1],sys.argv[4],T),N);b=series(load(sys.argv[2],sys.argv[4],T),N)
# silent frames (PSG ATT 15 on either side, now or one frame either way) carry no audible pitch: skip them
sa=series(load(sys.argv[1],sys.argv[4],T,'ATT'),N);sb=series(load(sys.argv[2],sys.argv[4],T,'ATT'),N)
silent=lambda f: any(x[g]==15 for x in (sa,sb) for g in (f-1,f,f+1))
bad=[];worst=(0,0)
for f in range(2,N-2):
    q=b[f]
    if not q or silent(f): continue
    if not all(a[f+k] for k in (-1,0,1)): continue
    c=min(abs(1200*math.log2(q/a[f+k])) for k in (-1,0,1) if a[f+k])
    if c>worst[0]: worst=(c,f)
    if c>10: bad.append(f)
print(sys.argv[4],'over10c',len(bad),'worst',round(worst[0],1),'at',round(worst[1]/60,3),'first bad',[round(x/60,3) for x in bad[:6]])
