import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const s8 = (b: number): number => (b << 24) >> 24;
async function main(){
  const name='kompo03.src';
  const data=new Uint8Array(readFileSync(join(CORPUS_DIR,name)));
  const mod:AnyMod=await loadUADEModule(false);
  mod._uade_wasm_init(44100); addCompanions(mod,loadInstrCompanions());
  const ptr=mod._malloc(data.byteLength); mod.HEAPU8.set(data,ptr);
  const hp=mod._malloc(name.length*4+1); mod.stringToUTF8(name,hp,name.length*4+1);
  mod._uade_wasm_stop(); mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
  mod._uade_wasm_load(ptr,data.byteLength,hp); mod._free(ptr); mod._free(hp);
  const L=mod._malloc(882*4),R=mod._malloc(882*4),cap=mod._malloc(18*4),rd=mod._malloc(16);
  // map: synthType byte -> count of negative-arp fires (arp<0, !=-1,-2)
  const byType=new Map<number,number>(); const posByType=new Map<number,number>();
  for(let c=0;c<2000;c++){
    mod._uade_wasm_arm_capture(0x20000,0x10000);
    mod._uade_wasm_arm_capture_pc(0x26c8a,0x26c8c);
    if(mod._uade_wasm_render(L,R,882)<=0)break;
    if(!mod._uade_wasm_get_capture(cap))continue;
    const hh=new Uint32Array(mod.HEAPU8.buffer); const r:number[]=[];
    for(let i=0;i<18;i++)r.push(hh[(cap>>2)+i]);
    const arp=s8(r[0]&0xff); const a1=r[9]>>>0;
    mod._uade_wasm_read_memory(a1+0x23,rd,1); const st=mod.HEAPU8[rd];
    if(arp<0 && arp!==-1 && arp!==-2){ byType.set(st,(byType.get(st)??0)+1); }
    else if(arp>=0){ posByType.set(st,(posByType.get(st)??0)+1); }
  }
  console.log('[p9type] negative-arp fires by synthType($23):', JSON.stringify([...byType.entries()]));
  console.log('[p9type] positive-arp fires by synthType($23):', JSON.stringify([...posByType.entries()]));
  try{mod._uade_wasm_cleanup();}catch{}
}
main().catch(e=>{console.error(e);process.exit(1);});
