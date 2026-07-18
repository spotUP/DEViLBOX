import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
async function main(){
  const name='kompo03.src';
  const data=new Uint8Array(readFileSync(join(CORPUS_DIR,name)));
  const mod:AnyMod=await loadUADEModule(false);
  mod._uade_wasm_init(44100); addCompanions(mod,loadInstrCompanions());
  const ptr=mod._malloc(data.byteLength); mod.HEAPU8.set(data,ptr);
  const hp=mod._malloc(name.length*4+1); mod.stringToUTF8(name,hp,name.length*4+1);
  mod._uade_wasm_stop(); mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
  mod._uade_wasm_load(ptr,data.byteLength,hp); mod._free(ptr); mod._free(hp);
  const L=mod._malloc(882*4),R=mod._malloc(882*4),cap=mod._malloc(18*4);
  const pcHist=new Map<number,number>();
  for(let c=0;c<1500;c++){
    mod._uade_wasm_arm_capture(0x20000,0x10000);
    mod._uade_wasm_arm_capture_pc(0x26c00,0x27000);
    if(mod._uade_wasm_render(L,R,882)<=0)break;
    if(!mod._uade_wasm_get_capture(cap))continue;
    const hh=new Uint32Array(mod.HEAPU8.buffer);
    const pc=hh[(cap>>2)+16]>>>0;
    pcHist.set(pc,(pcHist.get(pc)??0)+1);
  }
  const sorted=[...pcHist.entries()].sort((a,b)=>b[1]-a[1]);
  console.log('[p9pc] captured store PCs (pc: count):');
  for(const [pc,n] of sorted.slice(0,20)) console.log(`  0x${pc.toString(16)}: ${n}`);
  try{mod._uade_wasm_cleanup();}catch{}
}
main().catch(e=>{console.error(e);process.exit(1);});
