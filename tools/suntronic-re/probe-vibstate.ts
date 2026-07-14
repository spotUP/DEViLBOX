import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
type AnyMod = any;
const STRIDE=0x1ba, PC_LO=0x2660e, PC_HI=0x26610;
async function main(){
  const name='gliders.src';
  const data=new Uint8Array(readFileSync(join(CORPUS_DIR,name)));
  const mod:AnyMod=await loadUADEModule(false);
  mod._uade_wasm_init(44100); addCompanions(mod,loadInstrCompanions());
  const load=()=>{const p=mod._malloc(data.byteLength);mod.HEAPU8.set(data,p);const h=mod._malloc(64);mod.stringToUTF8(name,h,64);mod._uade_wasm_set_looping(0);mod._uade_wasm_set_one_subsong(1);mod._uade_wasm_load(p,data.byteLength,h);mod._free(p);mod._free(h);};
  const L=mod._malloc(882*4),R=mod._malloc(882*4),cap=mod._malloc(72),rd=mod._malloc(64);
  mod._uade_wasm_stop(); load();
  let base0=0xffffffff;
  for(let c=0;c<16;c++){mod._uade_wasm_arm_capture(0x20000,0x10000);mod._uade_wasm_arm_capture_pc(PC_LO,PC_HI);if(mod._uade_wasm_render(L,R,882)<=0)break;if(!mod._uade_wasm_get_capture(cap))continue;const a0=new Uint32Array(mod.HEAPU8.buffer)[(cap>>2)+8]>>>0;if(a0<base0)base0=a0;}
  const b0=base0;
  mod._uade_wasm_stop(); load();
  const rB=(a:number,n:number)=>{mod._uade_wasm_read_memory(a>>>0,rd,n);const x=[];for(let i=0;i<n;i++)x.push(mod.HEAPU8[rd+i]);return x;};
  const w=(a:number)=>{const x=rB(a,2);return((x[0]<<8)|x[1]);};
  const sw=(a:number)=>{const v=w(a);return (v<<16)>>16;};
  let prev=''; let n=0;
  for(let r=0;r<640 && n<18;r++){
    if(mod._uade_wasm_render(L,R,64)<=0)break;
    const tup=`${rB(b0+0x2c,1)[0]},${rB(b0+0x2d,1)[0]},${rB(b0+0x2e,1)[0]}`;
    if(tup!==prev){prev=tup; n++;
      console.log(`t${(n-1).toString().padStart(2)} p20=${w(b0+0x20).toString().padStart(4)} acc08=${w(b0+8).toString(16)} vib24=${sw(b0+0x24).toString().padStart(6)}(0x${(w(b0+0x24)).toString(16)}) idx26=${rB(b0+0x26,1)[0]} slide0a=${sw(b0+0x0a)}`);
    }
  }
  try{mod._uade_wasm_cleanup();}catch{}
}
main().catch(e=>{console.error(e);process.exit(1);});
