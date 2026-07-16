import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
type AnyMod = any;
const SCAN_LO=0x20000,SCAN_HI=0x40000,SPT=882,TICKS=80;
const name=process.argv[2]??'gliders.src';
(async()=>{
  const data=new Uint8Array(readFileSync(join(CORPUS_DIR,name)));
  const mod:AnyMod=await loadUADEModule(false);
  if(mod._uade_wasm_init(44100)!==0)throw 0;
  addCompanions(mod,loadInstrCompanions());
  const load=()=>{const p=mod._malloc(data.byteLength);mod.HEAPU8.set(data,p);const h=mod._malloc(name.length*4+1);mod.stringToUTF8(name,h,name.length*4+1);mod._uade_wasm_set_looping(0);mod._uade_wasm_set_one_subsong(1);mod._uade_wasm_load(p,data.byteLength,h);mod._free(p);mod._free(h);};
  const L=mod._malloc(SPT*4),R=mod._malloc(SPT*4),cap=mod._malloc(18*4),rd=mod._malloc(64);
  const capU32=(i:number)=>new Uint32Array(mod.HEAPU8.buffer)[(cap>>2)+i]>>>0;
  mod._uade_wasm_stop();load();const hist=new Map<number,number>();
  for(let c=0;c<200;c++){mod._uade_wasm_arm_capture(SCAN_LO,SCAN_HI-SCAN_LO);mod._uade_wasm_arm_capture_pc(SCAN_LO,SCAN_HI);if(mod._uade_wasm_render(L,R,SPT)<=0)break;if(mod._uade_wasm_get_capture(cap))hist.set(capU32(16),(hist.get(capU32(16))??0)+1);}
  let pcLo=0,best=-1;for(const[pc,n]of hist)if(n>best){best=n;pcLo=pc;}
  const pcHi=(pcLo+2)>>>0;
  mod._uade_wasm_stop();load();let base0=0xffffffff;
  for(let c=0;c<80;c++){mod._uade_wasm_arm_capture(SCAN_LO,SCAN_HI-SCAN_LO);mod._uade_wasm_arm_capture_pc(pcLo,pcHi);if(mod._uade_wasm_render(L,R,SPT)<=0)break;if(mod._uade_wasm_get_capture(cap)){const a0=capU32(8);if(a0>=SCAN_LO&&a0<SCAN_HI&&a0<base0)base0=a0;}}
  const rW=(a:number)=>{mod._uade_wasm_read_memory(a>>>0,rd,2);return(mod.HEAPU8[rd]<<8)|mod.HEAPU8[rd+1];};
  const s16=(x:number)=>(x&0x8000)?x-0x10000:x;
  mod._uade_wasm_stop();load();const v24:number[]=[];let guard=0;
  while(v24.length<TICKS&&guard++<TICKS*40){mod._uade_wasm_arm_capture(SCAN_LO,SCAN_HI-SCAN_LO);mod._uade_wasm_arm_capture_pc(pcLo,pcHi);if(mod._uade_wasm_render(L,R,128)<=0)break;if(mod._uade_wasm_get_capture(cap))v24.push(s16(rW(base0+0x24)));}
  const doubles:number[]=[];
  for(let i=1;i<v24.length;i++){let d=v24[i]-v24[i-1];if(d<0)d+=65536;if(d>12000)doubles.push(i);}
  console.log(name,'doubles at fires:',doubles.join(','));
  const gaps=doubles.slice(1).map((x,i)=>x-doubles[i]);
  console.log('gaps:',gaps.join(','));
})();
