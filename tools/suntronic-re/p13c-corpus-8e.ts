import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
type AnyMod = any;
const H1BASE = 0x261c4;
async function main(){
  const files=readdirSync(CORPUS_DIR).filter(f=>statSync(join(CORPUS_DIR,f)).isFile());
  const mod:AnyMod=await loadUADEModule(false);
  if(mod._uade_wasm_init(44100)!==0)throw new Error('init');
  addCompanions(mod, loadInstrCompanions());
  const L=mod._malloc(882*4),R=mod._malloc(882*4),hits=mod._malloc(256*4);
  let parsed=0,executed=0; const execList:string[]=[]; let loadFail=0,parseFail=0;
  for(const name of files){
    let a6:number;
    try{ const s=parseSunTronicV13Score(new Uint8Array(readFileSync(join(CORPUS_DIR,name)))); a6=H1BASE+0x318+s.deltaA; }catch{ parseFail++; continue; }
    const data=new Uint8Array(readFileSync(join(CORPUS_DIR,name)));
    const ptr=mod._malloc(data.byteLength);mod.HEAPU8.set(data,ptr);const hp=mod._malloc(name.length*4+1);mod.stringToUTF8(name,hp,name.length*4+1);
    mod._uade_wasm_stop();mod._uade_wasm_set_looping(0);mod._uade_wasm_set_one_subsong(1);
    if(mod._uade_wasm_load(ptr,data.byteLength,hp)!==0){mod._free(ptr);mod._free(hp);loadFail++;continue;}mod._free(ptr);mod._free(hp);
    parsed++;
    mod._uade_wasm_clear_all_watchpoints();
    mod._uade_wasm_set_watchpoint(0, a6+0xa80, 4, 2);
    let n8e=0;
    for(let t=0;t<200;t++){ if(mod._uade_wasm_render(L,R,882)<=0)break; n8e+=mod._uade_wasm_get_watchpoint_hits(hits,256);}
    if(n8e>0){executed++; execList.push(`${name}(${n8e})`);}
  }
  console.log(`Corpus: ${parsed} parsed+played, ${parseFail} parse-fail, ${loadFail} load-fail.`);
  console.log(`Modules that EXECUTE a write to a6+0xA80..A84 (0x8e/0x8d) in first 200 ticks: ${executed}`);
  console.log(execList.join(', ')||'  (NONE)');
  mod._free(L);mod._free(R);mod._free(hits);
  try{mod._uade_wasm_cleanup();}catch{}
}
main().catch(e=>{console.error(e);process.exit(1);});
