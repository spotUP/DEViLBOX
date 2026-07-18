/** Decisive: exact SAMPLE position of UADE's first AUDxPER write per voice.
 *  If ~882 (first vblank inside buffer 0) the +1 lead measured by probe-lead is
 *  pure 1024-bucket latch granularity (audio already correct, only the metric
 *  needs sub-bucket alignment). If ~1900+ it is a genuine one-buffer Paula/interrupt
 *  latency that the render path must reproduce. Render in small chunks, track a
 *  cumulative sample counter, log first write sample index for PER (reg 3) & VOL (4). */
import { readFileSync } from 'fs'; import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod=any; const REG_PER=3, REG_VOL=4;
async function one(mod:AnyMod,name:string,CH:number){
  const data=new Uint8Array(readFileSync(join(CORPUS_DIR,name)));
  const p=mod._malloc(data.byteLength);mod.HEAPU8.set(data,p);
  const h=mod._malloc(name.length*4+1);mod.stringToUTF8(name,h,name.length*4+1);
  mod._uade_wasm_stop();mod._uade_wasm_set_looping(0);mod._uade_wasm_set_one_subsong(1);
  if(mod._uade_wasm_load(p,data.byteLength,h)!==0){mod._free(p);mod._free(h);return null;}
  mod._free(p);mod._free(h);
  const L=mod._malloc(CH*4),R=mod._malloc(CH*4),lg=mod._malloc(1024*3*4);
  mod._uade_wasm_enable_paula_log(1);
  const firstPer=[-1,-1,-1,-1], firstVol=[-1,-1,-1,-1];
  let pos=0; const hh=new Uint32Array(mod.HEAPU8.buffer); const b=lg>>2;
  for(let c=0;c<4000;c++){
    if(mod._uade_wasm_render(L,R,CH)<=0)break;
    const n=mod._uade_wasm_get_paula_log(lg,1024);
    for(let i=0;i<n;i++){const pk=hh[b+i*3];const ch=(pk>>>24)&0xff,reg=(pk>>>16)&0xff;
      // Log timestamp = END of this chunk (packed log has no sub-chunk position),
      // so resolution == CH. Use small CH (e.g. 32) to pin the write tightly.
      if(ch<4){if(reg===REG_PER&&firstPer[ch]<0)firstPer[ch]=pos+CH;
               else if(reg===REG_VOL&&firstVol[ch]<0)firstVol[ch]=pos+CH;}}
    pos+=CH;
    if(firstPer.every(x=>x>=0))break;
  }
  mod._free(L);mod._free(R);mod._free(lg);
  return {name,firstPer,firstVol};
}
async function main(){
  const CH=parseInt(process.argv[2]??'32',10);
  const mod:AnyMod=await loadUADEModule(false);
  if(mod._uade_wasm_init(44100)!==0)throw new Error('init');
  addCompanions(mod,loadInstrCompanions());
  console.log(`chunk=${CH} samples  (vblank=882.759, one 1024-buffer=1024)`);
  for(const n of process.argv.slice(3)){const r=await one(mod,n,CH);if(!r){console.log(n,'FAIL');continue;}
    console.log(`${r.name.padEnd(18)} firstPER=[${r.firstPer.join(',')}] firstVOL=[${r.firstVol.join(',')}]`);}
}
main().catch(e=>{console.error(e);process.exit(1);});
