import { readFileSync } from 'fs'; import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
(async () => {
  const name='gliders.src'; const data=new Uint8Array(readFileSync(join(CORPUS_DIR,name)));
  const mod:any=await loadUADEModule(false); mod._uade_wasm_init(44100);
  addCompanions(mod, loadInstrCompanions());
  const ptr=mod._malloc(data.byteLength); mod.HEAPU8.set(data,ptr);
  const hp=mod._malloc(name.length*4+1); mod.stringToUTF8(name,hp,name.length*4+1);
  mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
  mod._uade_wasm_load(ptr,data.byteLength,hp);
  const L=mod._malloc(882*4),R=mod._malloc(882*4);
  console.log('has get_tick_count:', typeof mod._uade_wasm_get_tick_count);
  for(let f=0;f<6;f++){ mod._uade_wasm_render(L,R,882); console.log('frame',f,'tick',mod._uade_wasm_get_tick_count()>>>0); }
})();
