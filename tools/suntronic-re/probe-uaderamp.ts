import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A=any; const REG_PER=3,REG_VOL=4;
async function one(mod:A,name:string,N:number){
  const data=new Uint8Array(readFileSync(join(CORPUS_DIR,name)));
  const p=mod._malloc(data.byteLength);mod.HEAPU8.set(data,p);
  const h=mod._malloc(name.length*4+1);mod.stringToUTF8(name,h,name.length*4+1);
  mod._uade_wasm_stop();mod._uade_wasm_set_looping(0);mod._uade_wasm_set_one_subsong(1);
  if(mod._uade_wasm_load(p,data.byteLength,h)!==0){mod._free(p);mod._free(h);return null;}
  mod._free(p);mod._free(h);
  const CH=882;const L=mod._malloc(CH*4),R=mod._malloc(CH*4),lg=mod._malloc(512*3*4);
  mod._uade_wasm_enable_paula_log(1);
  const vol:number[][]=[[],[],[],[]];const curV=[-1,-1,-1,-1];
  for(let c=0;c<N*3;c++){if(mod._uade_wasm_render(L,R,CH)<=0)break;
    const n=mod._uade_wasm_get_paula_log(lg,512);const hh=new Uint32Array(mod.HEAPU8.buffer);const base=lg>>2;
    for(let i=0;i<n;i++){const pk=hh[base+i*3];const ch=(pk>>>24)&0xff,reg=(pk>>>16)&0xff,val=pk&0xffff;
      if(ch>3)continue;if(reg===REG_VOL)curV[ch]=val;else if(reg===REG_PER)vol[ch].push(curV[ch]);}
    if(Math.min(...vol.map(a=>a.length))>=N)break;}
  mod._free(L);mod._free(R);mod._free(lg);
  // longest run of consecutive same-sign nonzero deltas (monotonic ramp length)
  let best=0,bestV=-1;
  for(let v=0;v<4;v++){const a=vol[v];let run=0,dir=0;
    for(let c=1;c<a.length;c++){const d=a[c]-a[c-1];const s=d>0?1:d<0?-1:0;
      if(s!==0&&s===dir)run++;else if(s!==0){dir=s;run=1;}else{dir=0;run=0;}
      if(run>best){best=run;bestV=v;}}}
  return {best,bestV};
}
async function main(){
  const N=parseInt(process.argv[2]??'60',10);
  const files=readdirSync(CORPUS_DIR).filter(f=>!f.startsWith('.'));
  const mod:A=await loadUADEModule(false);
  if(mod._uade_wasm_init(44100)!==0)throw new Error('init');
  addCompanions(mod,loadInstrCompanions());
  const rows:{f:string,best:number,v:number}[]=[];
  for(const f of files){let r;try{r=await one(mod,f,N);}catch{r=null;}if(r)rows.push({f,best:r.best,v:r.bestV});}
  rows.sort((a,b)=>b.best-a.best);
  console.log('longest monotonic UADE vol-ramp (consecutive same-sign deltas) per song:');
  rows.slice(0,20).forEach(r=>console.log(`  ${r.best.toString().padStart(3)} ramp  v${r.v}  ${r.f}`));
}
main().catch(e=>{console.error(e);process.exit(1);});
