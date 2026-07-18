import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
type A=any;const NAME='play11';const TICKS=40;
async function main(){const mod:A=await loadUADEModule(false);mod._uade_wasm_init(44100);addCompanions(mod,loadInstrCompanions());
const data=new Uint8Array(readFileSync(join(CORPUS_DIR,NAME)));const ptr=mod._malloc(data.byteLength);mod.HEAPU8.set(data,ptr);const hp=mod._malloc(NAME.length*4+1);mod.stringToUTF8(NAME,hp,NAME.length*4+1);mod._uade_wasm_stop();mod._uade_wasm_set_looping(0);mod._uade_wasm_set_one_subsong(1);if(mod._uade_wasm_load(ptr,data.byteLength,hp)!==0)throw new Error('load');
const L=mod._malloc(882*4),R=mod._malloc(882*4);const out=mod._malloc(4);
const a71:number[]=[],a72:number[]=[],a6s:number[]=[];
for(let c=0;c<TICKS;c++){if(mod._uade_wasm_render(L,R,882)<=0)break;
  const a6=mod._uade_wasm_get_register(14);a6s.push(a6);
  mod._uade_wasm_read_memory((a6+0xa71)>>>0,out,1);const b71=mod.HEAPU8[out];
  mod._uade_wasm_read_memory((a6+0xa72)>>>0,out,2);const b72=(mod.HEAPU8[out]<<8)|mod.HEAPU8[out+1];
  a71.push(b71);a72.push(b72);}
console.log('A6 uniq:',[...new Set(a6s)].map(x=>x.toString(16)).slice(0,6).join(','));
console.log('$a71:',a71.join(','));
console.log('$a72:',a72.join(','));
}
main().catch(e=>{console.error(e);process.exit(1);});
