/** Control: is arm_capture_pc sticky? Arm a PC that never executes (0x3ffff) and
 * a real one (EFFECTS 0x26636), render(1) many times, count get_capture!=0.
 * Then over the window, count EFFECTS entries vs $24 total-advance to settle
 * single-vs-double clock: sum(delta $24)/freqEnvSpeed = #EFFECTS runs. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
type AnyMod=any; const SCAN_LO=0x20000,SCAN_HI=0x40000,SPT=882;
const name='gliders.src'; const NSAMP=26*1024;
(async()=>{
  const data=new Uint8Array(readFileSync(join(CORPUS_DIR,name)));
  const mod:AnyMod=await loadUADEModule(false);
  if(mod._uade_wasm_init(44100)!==0)throw 0; addCompanions(mod,loadInstrCompanions());
  const load=()=>{const p=mod._malloc(data.byteLength);mod.HEAPU8.set(data,p);const h=mod._malloc(name.length*4+1);mod.stringToUTF8(name,h,name.length*4+1);mod._uade_wasm_set_looping(0);mod._uade_wasm_set_one_subsong(1);mod._uade_wasm_load(p,data.byteLength,h);mod._free(p);mod._free(h);};
  const L=mod._malloc(SPT*4),R=mod._malloc(SPT*4),cap=mod._malloc(18*4),rd=mod._malloc(64);
  const rW=(a:number)=>{mod._uade_wasm_read_memory(a>>>0,rd,2);return(mod.HEAPU8[rd]<<8)|mod.HEAPU8[rd+1];};
  const s16=(x:number)=>(x&0x8000)?x-0x10000:x;
  const base0=0x26f8a;
  // CONTROL: PC that never executes
  mod._uade_wasm_stop();load();let neverFires=0;
  for(let s=0;s<2000;s++){mod._uade_wasm_arm_capture_pc(0x3fff0,0x3fffe);if(mod._uade_wasm_render(L,R,1)<=0)break;if(mod._uade_wasm_get_capture(cap))neverFires++;}
  console.log(`control PC 0x3fff0 (should never fire): captured ${neverFires}/2000 renders`);
  // $24 total advance over window
  mod._uade_wasm_stop();load();
  let prev=s16(rW(base0+0x24)),writes=0,totalAdv=0;
  for(let s=0;s<NSAMP;s++){if(mod._uade_wasm_render(L,R,1)<=0)break;const c=s16(rW(base0+0x24));if(c!==prev){let d=c-prev;if(d<-4000)d+=65536;writes++;totalAdv+=d;prev=c;}}
  console.log(`$24 over ${(NSAMP/1024).toFixed(0)} ticks: writes=${writes} totalAdvance=${totalAdv} → EFFECTS-runs≈${(totalAdv/8000).toFixed(2)} (freqEnvSpeed=8000)`);
  console.log(`if EFFECTS-runs > ticks(${NSAMP/1024}) → double-advances exist (${(totalAdv/8000 - NSAMP/1024).toFixed(1)} extra)`);
})();
