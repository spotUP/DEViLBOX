import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod=any;
const NAME=process.argv[2]??'comming0.src';
async function main(){
  const mod:AnyMod=await loadUADEModule(false);
  if(mod._uade_wasm_init(44100)!==0)throw new Error('init');
  addCompanions(mod,loadInstrCompanions());
  const data=new Uint8Array(readFileSync(join(CORPUS_DIR,NAME)));
  const p=mod._malloc(data.byteLength);mod.HEAPU8.set(data,p);
  const h=mod._malloc(NAME.length*4+1);mod.stringToUTF8(NAME,h,NAME.length*4+1);
  mod._uade_wasm_stop();mod._uade_wasm_set_looping(0);mod._uade_wasm_set_one_subsong(1);
  if(mod._uade_wasm_load(p,data.byteLength,h)!==0)throw new Error('load');
  mod._free(p);mod._free(h);
  const CH=882;const L=mod._malloc(CH*4),R=mod._malloc(CH*4);const buf=mod._malloc(4);
  for(let c=0;c<10;c++){
    if(mod._uade_wasm_render(L,R,CH)<=0)break;
    // ADKCONR = $DFF010 (16-bit). read 2 bytes.
    const rc=mod._uade_wasm_read_memory?mod._uade_wasm_read_memory(0xDFF010,buf,2):-1;
    const b=new Uint8Array(mod.HEAPU8.buffer,buf,2);
    const adk=(b[0]<<8)|b[1];
    console.log(`frame ${c}: read_memory rc=${rc} ADKCONR=0x${adk.toString(16)} attachVol(bits0-3)=0x${(adk&0x0f).toString(16)} attachPer(bits4-7)=0x${((adk>>4)&0x0f).toString(16)}`);
  }
  mod._free(L);mod._free(R);mod._free(buf);
}
main().catch(e=>{console.error(e);process.exit(1);});
