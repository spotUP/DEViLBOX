/** Bucket-accurate VOL/PER lockstep: native tick() (1024-sample bucket w/ the
 *  double-position clock) vs UADE render(1024) last-write-per-bucket latch.
 *  This is the golden grid (NOT the naive 882 stepVblankOnce). */
import { readFileSync } from 'fs'; import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
import { paulaAudxVol } from '../../src/engine/suntronic/SunTronicNativeRender';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod=any; const REG_PER=3,REG_VOL=4;
async function main(){
  const name=process.argv[2], N=parseInt(process.argv[3]??'80',10);
  const data=new Uint8Array(readFileSync(join(CORPUS_DIR,name)));
  const mod:AnyMod=await loadUADEModule(false);
  if(mod._uade_wasm_init(44100)!==0)throw new Error('init');
  addCompanions(mod,loadInstrCompanions());
  const p=mod._malloc(data.byteLength);mod.HEAPU8.set(data,p);
  const h=mod._malloc(name.length*4+1);mod.stringToUTF8(name,h,name.length*4+1);
  mod._uade_wasm_stop();mod._uade_wasm_set_looping(0);mod._uade_wasm_set_one_subsong(1);
  if(mod._uade_wasm_load(p,data.byteLength,h)!==0)throw new Error('load');
  mod._free(p);mod._free(h);
  const CH=1024;const L=mod._malloc(CH*4),R=mod._malloc(CH*4),lg=mod._malloc(1024*3*4);
  mod._uade_wasm_enable_paula_log(1);
  const uper:number[][]=[[],[],[],[]],uvol:number[][]=[[],[],[],[]];const curP=[-1,-1,-1,-1],curV=[-1,-1,-1,-1];
  for(let c=0;c<N;c++){
    if(mod._uade_wasm_render(L,R,CH)<=0)break;
    const n=mod._uade_wasm_get_paula_log(lg,1024);const hh=new Uint32Array(mod.HEAPU8.buffer);const base=lg>>2;
    for(let i=0;i<n;i++){const pk=hh[base+i*3];const ch=(pk>>>24)&0xff,reg=(pk>>>16)&0xff,val=pk&0xffff;
      if(ch>3)continue; if(reg===REG_VOL)curV[ch]=val; else if(reg===REG_PER)curP[ch]=val;}
    for(let v=0;v<4;v++){uper[v].push(curP[v]);uvol[v].push(curV[v]);}
  }
  try{mod._uade_wasm_cleanup();}catch{}
  const score=parseSunTronicV13Score(data);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const player:any=new (SunTronicPlayer as any)(score);
  const np:number[][]=[[],[],[],[]],nv:number[][]=[[],[],[],[]];
  for(let c=0;c<N;c++){const t=player.tick();for(let v=0;v<4;v++){np[v].push(t.voices[v].period);nv[v].push(paulaAudxVol(t.voices[v].outVolume&0xff));}}
  for(let v=0;v<4;v++){
    let pm=0,vm=0,t=0;
    for(let c=0;c<N;c++){if(c>=uper[v].length)break;t++;if(np[v][c]===uper[v][c])pm++;if(nv[v][c]===uvol[v][c])vm++;}
    console.log(`${name} v${v}: PER ${pm}/${t}  VOL ${vm}/${t}`);
  }
}
main().catch(e=>{console.error(e);process.exit(1);});
