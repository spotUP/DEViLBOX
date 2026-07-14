import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
type AnyMod = any;
const STRIDE = 0x1ba, PC_LO=0x2660e, PC_HI=0x26610;
async function main(){
  const name='gliders.src'; const ticks=16;
  const data=new Uint8Array(readFileSync(join(CORPUS_DIR,name)));
  const mod:AnyMod=await loadUADEModule(false);
  mod._uade_wasm_init(44100); addCompanions(mod,loadInstrCompanions());
  const load=()=>{const p=mod._malloc(data.byteLength);mod.HEAPU8.set(data,p);const h=mod._malloc(64);mod.stringToUTF8(name,h,64);mod._uade_wasm_set_looping(0);mod._uade_wasm_set_one_subsong(1);mod._uade_wasm_load(p,data.byteLength,h);mod._free(p);mod._free(h);};
  const L=mod._malloc(882*4),R=mod._malloc(882*4),cap=mod._malloc(72),rd=mod._malloc(64);
  mod._uade_wasm_stop(); load();
  let base0=0xffffffff;
  for(let c=0;c<ticks;c++){mod._uade_wasm_arm_capture(0x20000,0x10000);mod._uade_wasm_arm_capture_pc(PC_LO,PC_HI);if(mod._uade_wasm_render(L,R,882)<=0)break;if(!mod._uade_wasm_get_capture(cap))continue;const a0=new Uint32Array(mod.HEAPU8.buffer)[(cap>>2)+8]>>>0;if(a0<base0)base0=a0;}
  const bases=[0,1,2,3].map(k=>(base0+k*STRIDE)>>>0);
  mod._uade_wasm_stop(); load();
  const rdB=(a:number,n:number)=>{mod._uade_wasm_read_memory(a>>>0,rd,n);const b=[];for(let i=0;i<n;i++)b.push(mod.HEAPU8[rd+i]);return b;};
  const rdL=(a:number)=>{const b=rdB(a,4);return((b[0]<<24)|(b[1]<<16)|(b[2]<<8)|b[3])>>>0;};
  for(let c=0;c<ticks;c++){
    if(mod._uade_wasm_render(L,R,882)<=0)break;
    const cols=bases.map(b=>{const cur=rdL(b+0)-base0+bases[0];/*rel*/const c0=rdL(b+0);const tc=rdB(b+0x2c,1)[0],td=rdB(b+0x2d,1)[0],te=rdB(b+0x2e,1)[0];const f=rdB(b+0x14,1)[0];return `cur=${(c0>>>0).toString(16)} 2c=${tc.toString(16)} 2d=${td.toString(16)} 2e=${te.toString(16)} f=${f.toString(16)}`;});
    console.log(`t${c.toString().padStart(2)} | ${cols.join(' | ')}`);
  }
  console.log('base0=',base0.toString(16),'h1 runtime? bases',bases.map(x=>x.toString(16)));
  try{mod._uade_wasm_cleanup();}catch{}
}
main().catch(e=>{console.error(e);process.exit(1);});
