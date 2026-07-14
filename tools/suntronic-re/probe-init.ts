/** probe-init: dump per-voice tempo/state fields over first ticks (post-load). */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
async function main(): Promise<void> {
  const name = process.argv[2] ?? 'gliders.src';
  const ticks = parseInt(process.argv[3] ?? '4', 10);
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const mod: AnyMod = await loadUADEModule(false);
  if (mod._uade_wasm_init(44100) !== 0) throw new Error('init');
  addCompanions(mod, loadInstrCompanions());
  const ptr = mod._malloc(data.byteLength); mod.HEAPU8.set(data, ptr);
  const hp = mod._malloc(name.length*4+1); mod.stringToUTF8(name, hp, name.length*4+1);
  mod._uade_wasm_stop(); mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
  if (mod._uade_wasm_load(ptr, data.byteLength, hp) !== 0) throw new Error('load');
  mod._free(ptr); mod._free(hp);
  const a6 = 0x264dc; const bases=[0,1,2,3].map(k=>a6+0xaae+k*0x1ba);
  const rd = mod._malloc(64);
  const read=(a:number,n:number)=>{mod._uade_wasm_read_memory(a>>>0,rd,n);const b:number[]=[];for(let i=0;i<n;i++)b.push(mod.HEAPU8[rd+i]);return b;};
  const dump=(label:string)=>{
    for(let v=0;v<4;v++){const b=bases[v];
      const f=(o:number,n=1)=>{const x=read(b+o,n);return n===1?x[0]:(x[0]<<8|x[1]);};
      const cur=read(b+0,4); const curv=(cur[0]<<24|cur[1]<<16|cur[2]<<8|cur[3])>>>0;
      console.log(`${label} v${v} 2c=${f(0x2c)} 2d=${f(0x2d)} 2e=${f(0x2e,2)} 30=${f(0x30)} 31=${f(0x31)} 14=${f(0x14).toString(16)} 23=${(f(0x23)<<24>>24)} 08=${f(8,2).toString(16)} 0c=${f(0xc)} 20=${f(0x20,2)} cur=${curv.toString(16)}`);
    }
    console.log('  seqbase=',read(a6+0xaaa,4).map(x=>x.toString(16)));
  };
  const L=mod._malloc(882*4),R=mod._malloc(882*4);
  dump('t-pre');
  for(let c=0;c<ticks;c++){ mod._uade_wasm_render(L,R,882); dump('t'+c); }
  mod._free(L);mod._free(R);mod._free(rd);
  try{mod._uade_wasm_cleanup();}catch{}
}
main().catch(e=>{console.error(e);process.exit(1);});
