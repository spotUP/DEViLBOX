import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
type AnyMod = any;
async function readDrin(name: string, drinAbs: number, settle=882): Promise<number[]> {
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const mod: AnyMod = await loadUADEModule(false);
  if (mod._uade_wasm_init(44100) !== 0) throw new Error('init');
  addCompanions(mod, loadInstrCompanions());
  const ptr = mod._malloc(data.byteLength); mod.HEAPU8.set(data, ptr);
  const hp = mod._malloc(name.length*4+1); mod.stringToUTF8(name, hp, name.length*4+1);
  mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
  if (mod._uade_wasm_load(ptr, data.byteLength, hp) !== 0) throw new Error('load '+name);
  const L = mod._malloc(1024*4), R = mod._malloc(1024*4);
  for (let i=0;i<20;i++) mod._uade_wasm_render(L, R, settle); // settle multiple frames
  const rd = mod._malloc(256);
  mod._uade_wasm_read_memory(drinAbs>>>0, rd, 256);
  const drin:number[]=[]; for(let i=0;i<256;i++){const b=mod.HEAPU8[rd+i];drin.push(b>127?b-256:b);}
  try{mod._uade_wasm_cleanup();}catch{}
  return drin;
}
async function main(){
  const abs = parseInt(process.argv[3] ?? '2828b',16);
  const a = await readDrin(process.argv[2] ?? 'ready', abs);
  console.log(`\n${process.argv[2] ?? 'ready'} drin@${abs.toString(16)} [0..255]:`);
  for(let r=0;r<16;r++) console.log(`  row${r} (d5 ${r*16}..):`, a.slice(r*16,r*16+16).join(' '));
}
main().catch(e=>{console.error(e);process.exit(1);});
