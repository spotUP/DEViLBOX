/** Dump raw Paula register writes for one channel, first N ticks. */
import { readFileSync } from 'fs'; import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod=any;
async function main(){
  const name=process.argv[2]??'comming0.src'; const CH=parseInt(process.argv[3]??'1',10);
  const ticks=parseInt(process.argv[4]??'40',10);
  const data=new Uint8Array(readFileSync(join(CORPUS_DIR,name)));
  const mod:AnyMod=await loadUADEModule(false); if(mod._uade_wasm_init(44100)!==0)throw 0;
  addCompanions(mod,loadInstrCompanions());
  const p=mod._malloc(data.byteLength);mod.HEAPU8.set(data,p);
  const h=mod._malloc(name.length*4+1);mod.stringToUTF8(name,h,name.length*4+1);
  mod._uade_wasm_stop();mod._uade_wasm_set_looping(1);mod._uade_wasm_set_one_subsong(1);
  if(mod._uade_wasm_load(p,data.byteLength,h)!==0)throw 1; mod._free(p);mod._free(h);
  const L=mod._malloc(882*4),R=mod._malloc(882*4),lg=mod._malloc(512*3*4);
  mod._uade_wasm_enable_paula_log(1);
  const regName:Record<number,string>={0:'DMA',1:'LEN',2:'PT',3:'PER',4:'VOL',5:'DAT'};
  for(let c=0;c<ticks;c++){ if(mod._uade_wasm_render(L,R,882)<=0)break;
    const n=mod._uade_wasm_get_paula_log(lg,512);const hh=new Uint32Array(mod.HEAPU8.buffer);const b=lg>>2;
    const w:string[]=[];
    for(let i=0;i<n;i++){const pk=hh[b+i*3];const ch=(pk>>>24)&0xff,rg=(pk>>>16)&0xff,vl=pk&0xffff;
      if(ch!==CH)continue; w.push(`${regName[rg]??rg}=${vl}`);}
    console.log(`t${String(c).padStart(3)}: ${w.join('  ')||'(none)'}`);
  }
}
main().catch(e=>{console.error(e);process.exit(1);});
