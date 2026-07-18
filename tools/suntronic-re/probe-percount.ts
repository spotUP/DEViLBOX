import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A=any; const REG_PER=3,REG_VOL=4;
const NAME=process.argv[2]??'sound2.s',V=parseInt(process.argv[3]??'0',10),N=parseInt(process.argv[4]??'14',10);
async function main(){
  const mod:A=await loadUADEModule(false);
  if(mod._uade_wasm_init(44100)!==0)throw new Error('init');
  addCompanions(mod,loadInstrCompanions());
  const data=new Uint8Array(readFileSync(join(CORPUS_DIR,NAME)));
  const p=mod._malloc(data.byteLength);mod.HEAPU8.set(data,p);
  const h=mod._malloc(NAME.length*4+1);mod.stringToUTF8(NAME,h,NAME.length*4+1);
  mod._uade_wasm_stop();mod._uade_wasm_set_looping(0);mod._uade_wasm_set_one_subsong(1);
  if(mod._uade_wasm_load(p,data.byteLength,h)!==0)throw new Error('load');
  mod._free(p);mod._free(h);
  const CH=882;const L=mod._malloc(CH*4),R=mod._malloc(CH*4),lg=mod._malloc(512*3*4);
  mod._uade_wasm_enable_paula_log(1);
  console.log(`buffer | perWrites volWrites (voice ${V}) : per-values | vol-values`);
  for(let b=0;b<N;b++){
    if(mod._uade_wasm_render(L,R,CH)<=0)break;
    const n=mod._uade_wasm_get_paula_log(lg,512);const hh=new Uint32Array(mod.HEAPU8.buffer);const base=lg>>2;
    const pv:number[]=[],vv:number[]=[];
    for(let i=0;i<n;i++){const packed=hh[base+i*3];const ch=(packed>>>24)&0xff,reg=(packed>>>16)&0xff,val=packed&0xffff;
      if(ch!==V)continue; if(reg===REG_PER)pv.push(val); else if(reg===REG_VOL)vv.push(val);}
    console.log(`  ${b} | per=${pv.length} vol=${vv.length} : [${pv.join(',')}] | [${vv.join(',')}]`);
  }
}
main().catch(e=>{console.error(e);process.exit(1);});
