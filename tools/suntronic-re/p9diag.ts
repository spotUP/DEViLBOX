import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const s8 = (b: number): number => (b << 24) >> 24;
async function fires(mod: AnyMod, L:number,R:number,cap:number, lo:number, hi:number, ticks:number){
  let n=0; const arps=new Set<number>();
  for(let c=0;c<ticks;c++){
    mod._uade_wasm_arm_capture(0x20000,0x10000);
    mod._uade_wasm_arm_capture_pc(lo,hi);
    if(mod._uade_wasm_render(L,R,882)<=0)break;
    if(!mod._uade_wasm_get_capture(cap))continue;
    const hh=new Uint32Array(mod.HEAPU8.buffer); const d0=hh[cap>>2]&0xff; arps.add(s8(d0)); n++;
  }
  return {n,arps:[...arps].sort((a,b)=>a-b)};
}
async function main(){
  const name='kompo03.src';
  const data=new Uint8Array(readFileSync(join(CORPUS_DIR,name)));
  const mod:AnyMod=await loadUADEModule(false);
  mod._uade_wasm_init(44100); addCompanions(mod,loadInstrCompanions());
  const L=mod._malloc(882*4),R=mod._malloc(882*4),cap=mod._malloc(18*4);
  async function withReload(lo:number,hi:number){
    mod._uade_wasm_stop(); mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
    const p=mod._malloc(data.byteLength); mod.HEAPU8.set(data,p);
    const h=mod._malloc(name.length*4+1); mod.stringToUTF8(name,h,name.length*4+1);
    mod._uade_wasm_load(p,data.byteLength,h); mod._free(p); mod._free(h);
    return fires(mod,L,R,cap,lo,hi,600);
  }
  for(const [lbl,lo] of [['entry',0x26c8a],['stdLoop',0x26cc0],['delta',0x26d4a],['escape',0x26ce6],['noise',0x26d1e]] as [string,number][]){
    const {n,arps}=await withReload(lo,lo+2);
    console.log(`${lbl.padEnd(8)} @0x${lo.toString(16)}: fires=${n} arps={${arps.join(',')}}`);
  }
  try{mod._uade_wasm_cleanup();}catch{}
}
main().catch(e=>{console.error(e);process.exit(1);});
