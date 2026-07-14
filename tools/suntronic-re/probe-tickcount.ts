import { readFileSync } from 'fs'; import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
const PC_LO=0x2660e,PC_HI=0x26610,STRIDE=0x1ba;
(async()=>{
  const name='gliders.src'; const data=new Uint8Array(readFileSync(join(CORPUS_DIR,name)));
  const mk=async()=>{ const mod:any=await loadUADEModule(false); mod._uade_wasm_init(44100);
    addCompanions(mod,loadInstrCompanions());
    const ptr=mod._malloc(data.byteLength); mod.HEAPU8.set(data,ptr);
    const hp=mod._malloc(name.length*4+1); mod.stringToUTF8(name,hp,name.length*4+1);
    mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
    mod._uade_wasm_load(ptr,data.byteLength,hp); return mod; };
  let mod=await mk(); let L=mod._malloc(882*4),R=mod._malloc(882*4),cap=mod._malloc(18*4);
  let base0=0xffffffff;
  for(let c=0;c<48;c++){ mod._uade_wasm_arm_capture(0x20000,0x10000); mod._uade_wasm_arm_capture_pc(PC_LO,PC_HI);
    mod._uade_wasm_render(L,R,882); if(!mod._uade_wasm_get_capture(cap))continue;
    const a0=new Uint32Array(mod.HEAPU8.buffer)[(cap>>2)+8]>>>0; if(a0<base0)base0=a0; }
  console.log('base0',base0.toString(16),' voice0 base',base0.toString(16));
  // count byte-writes to various voice0 offsets over 48 frames of 882
  const offs=[0x0c,0x0d,0x15,0x2c,0x2d,0x2e,0x33,0x10];
  for(const off of offs){
    mod=await mk(); L=mod._malloc(882*4);R=mod._malloc(882*4);const out=mod._malloc(64*4);
    mod._uade_wasm_clear_all_watchpoints(); mod._uade_wasm_set_watchpoint(0,base0+off,1,2);
    let t=0; for(let f=0;f<48;f++){ mod._uade_wasm_render(L,R,882);
      let n; do{ n=mod._uade_wasm_get_watchpoint_hits(out,64); t+=n; }while(n===64); }
    console.log('voice0 +0x'+off.toString(16),'byte writes/48fr =',t);
  }
})();
