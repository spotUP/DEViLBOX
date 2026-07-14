import { readFileSync } from 'fs'; import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
import { calc14Kernel } from '../../src/engine/suntronic/SunTronicSynthVoice';
const PC_LO=0x26e08,PC_HI=0x26e3a; const name='kompo03.src';
const data=new Uint8Array(readFileSync(join(CORPUS_DIR,name)));
const mod:any=await loadUADEModule(false); mod._uade_wasm_init(44100); addCompanions(mod,loadInstrCompanions());
const ptr=mod._malloc(data.byteLength); mod.HEAPU8.set(data,ptr);
const hp=mod._malloc(name.length*4+1); mod.stringToUTF8(name,hp,name.length*4+1);
mod._uade_wasm_stop(); mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
mod._uade_wasm_load(ptr,data.byteLength,hp); mod._free(ptr); mod._free(hp);
const L=mod._malloc(882*4),R=mod._malloc(882*4),cap=mod._malloc(18*4),rd=mod._malloc(256);
for(let c=0;c<200;c++){ mod._uade_wasm_arm_capture(0x20000,0x10000); mod._uade_wasm_arm_capture_pc(PC_LO,PC_HI);
 if(mod._uade_wasm_render(L,R,882)<=0)break; if(!mod._uade_wasm_get_capture(cap))continue;
 const hh=new Uint32Array(mod.HEAPU8.buffer); const r:number[]=[]; for(let i=0;i<18;i++)r.push(hh[(cap>>2)+i]);
 const bl=(r[6]&0xffff)+1; mod._uade_wasm_read_memory((r[10]-1)>>>0,rd,bl); const out=mod.HEAPU8.slice(rd,rd+bl);
 mod._uade_wasm_read_memory((r[11]-1)>>>0,rd,bl); const w1u=mod.HEAPU8.slice(rd,rd+bl);
 const w1=new Int8Array(bl); for(let i=0;i<bl;i++)w1[i]=w1u[i]<<24>>24; const d2v=r[2]&0xffff,d3v=r[3]&0xffff;
 let best=999,bsl=0,bsp=0; for(let sl=0;sl<256;sl++)for(let sp=0;sp<256;sp++){ const p=calc14Kernel(sl,sp,w1,d2v,d3v,bl); let h=0; for(let i=0;i<bl;i++)if((p[i]&0xff)!==out[i])h++; if(h<best){best=h;bsl=sl;bsp=sp;} }
 console.log(`kompo03 bl=${bl} d2v=0x${d2v.toString(16)} bestHam=${best}/${bl} seed=${bsl.toString(16)},${bsp.toString(16)}`);
 console.log('out ='+Array.from(out).map(x=>x.toString(16).padStart(2,'0')).join(''));
 console.log('w1  ='+Array.from(w1u).map(x=>x.toString(16).padStart(2,'0')).join('')); break; }
try{mod._uade_wasm_cleanup()}catch{}
