/** CORRECT grid: native tick() (1024-bucket double-position clock) vs UADE
 *  render(1024) last-write latch. Discriminator over the corpus:
 *  among voices where PER locks exact (clock aligned), is VOL ever wrong
 *  WITHOUT UADE ever writing VOL=0 (i.e. not master-volume silence)?
 *  ~0 such voices ⟹ volume-envelope arithmetic (env*$0C>>6) is proven correct. */
import { readFileSync, readdirSync } from 'fs'; import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
import { paulaAudxVol } from '../../src/engine/suntronic/SunTronicNativeRender';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod=any; const REG_PER=3,REG_VOL=4;
async function one(mod:AnyMod,name:string,N:number){
  const data=new Uint8Array(readFileSync(join(CORPUS_DIR,name)));
  const p=mod._malloc(data.byteLength);mod.HEAPU8.set(data,p);
  const h=mod._malloc(name.length*4+1);mod.stringToUTF8(name,h,name.length*4+1);
  mod._uade_wasm_stop();mod._uade_wasm_set_looping(0);mod._uade_wasm_set_one_subsong(1);
  if(mod._uade_wasm_load(p,data.byteLength,h)!==0){mod._free(p);mod._free(h);return null;}
  mod._free(p);mod._free(h);
  const CH=1024;const L=mod._malloc(CH*4),R=mod._malloc(CH*4),lg=mod._malloc(1024*3*4);
  mod._uade_wasm_enable_paula_log(1);
  const uper:number[][]=[[],[],[],[]],uvol:number[][]=[[],[],[],[]];const cP=[-1,-1,-1,-1],cV=[-1,-1,-1,-1];
  for(let c=0;c<N;c++){
    if(mod._uade_wasm_render(L,R,CH)<=0)break;
    const n=mod._uade_wasm_get_paula_log(lg,1024);const hh=new Uint32Array(mod.HEAPU8.buffer);const base=lg>>2;
    for(let i=0;i<n;i++){const pk=hh[base+i*3];const ch=(pk>>>24)&0xff,reg=(pk>>>16)&0xff,val=pk&0xffff;
      if(ch>3)continue;if(reg===REG_VOL)cV[ch]=val;else if(reg===REG_PER)cP[ch]=val;}
    for(let v=0;v<4;v++){uper[v].push(cP[v]);uvol[v].push(cV[v]);}
  }
  mod._free(L);mod._free(R);mod._free(lg);
  const score=parseSunTronicV13Score(data);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const player:any=new (SunTronicPlayer as any)(score);
  const np:number[][]=[[],[],[],[]],nv:number[][]=[[],[],[],[]];
  for(let c=0;c<N;c++){const t=player.tick();for(let v=0;v<4;v++){np[v].push(t.voices[v].period);nv[v].push(paulaAudxVol(t.voices[v].outVolume&0xff));}}
  let alignedTicks=0,alignedVolBad=0,alignedVolBadNonMaster=0;
  for(let v=0;v<4;v++){const T=Math.min(N,uper[v].length);
    for(let c=0;c<T;c++){if(np[v][c]===uper[v][c]){alignedTicks++;if(nv[v][c]!==uvol[v][c]){alignedVolBad++;if(uvol[v][c]!==0)alignedVolBadNonMaster++;}}}
    }
  return {alignedTicks,alignedVolBad,alignedVolBadNonMaster};
}
async function main(){
  const N=parseInt(process.argv[2]??'120',10);const LIM=parseInt(process.argv[3]??'90',10);
  const files=readdirSync(CORPUS_DIR).filter(f=>!f.startsWith('.')).slice(0,LIM);
  const mod:AnyMod=await loadUADEModule(false);
  if(mod._uade_wasm_init(44100)!==0)throw new Error('init');
  addCompanions(mod,loadInstrCompanions());
  let AT=0,AVB=0,AVBNM=0;const wit:string[]=[];
  for(const f of files){let r;try{r=await one(mod,f,N);}catch{r=null;}if(!r)continue;
    AT+=r.alignedTicks;AVB+=r.alignedVolBad;AVBNM+=r.alignedVolBadNonMaster;
    if(r.alignedVolBadNonMaster>0)wit.push(`${f} nonMasterVolBad=${r.alignedVolBadNonMaster}/${r.alignedTicks}`);
  }
  console.log(`PER-aligned ticks (clock locked at that tick): ${AT}`);
  console.log(`  VOL wrong at aligned tick: ${AVB}  (NON-master = genuine env-math defect: ${AVBNM})`);
  console.log('witnesses:'); wit.slice(0,40).forEach(w=>console.log('  '+w));
}
main().catch(e=>{console.error(e);process.exit(1);});
