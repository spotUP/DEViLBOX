/** FINE=1: record sample-positions of GNN fires (cursor $0(a0) write @0x26970/74) and of
 * $24 +16000 vibrato jumps. If they coincide, +16000 is GNN-tied. Also dump instrument
 * freqEnvSpeed/Len/Loop for voice0. NOT committed. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
type AnyMod = any;
const SCAN_LO = 0x20000, SCAN_HI = 0x40000;
async function run(name: string): Promise<void> {
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const mod: AnyMod = await loadUADEModule(false);
  if (mod._uade_wasm_init(44100) !== 0) throw new Error('init');
  addCompanions(mod, loadInstrCompanions());
  const load = (): void => { const p = mod._malloc(data.byteLength); mod.HEAPU8.set(data, p);
    const h = mod._malloc(name.length*4+1); mod.stringToUTF8(name,h,name.length*4+1);
    mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
    if (mod._uade_wasm_load(p,data.byteLength,h)!==0) throw new Error('load'); mod._free(p); mod._free(h); };
  const L=mod._malloc(4),R=mod._malloc(4),cap=mod._malloc(72),rd=mod._malloc(8);
  const capU32=(i:number):number=>new Uint32Array(mod.HEAPU8.buffer)[(cap>>2)+i]>>>0;
  mod._uade_wasm_stop(); load();
  const hist=new Map<number,number>();
  for(let c=0;c<400;c++){mod._uade_wasm_arm_capture(SCAN_LO,SCAN_HI-SCAN_LO);mod._uade_wasm_arm_capture_pc(SCAN_LO,SCAN_HI);
    if(mod._uade_wasm_render(L,R,21)<=0)break;if(mod._uade_wasm_get_capture(cap))hist.set(capU32(16),(hist.get(capU32(16))??0)+1);}
  let pc=0,best=-1;for(const[p,n]of hist)if(n>best){best=n;pc=p;}
  mod._uade_wasm_stop(); load();
  let base0=0xffffffff;
  for(let c=0;c<120;c++){mod._uade_wasm_arm_capture(SCAN_LO,SCAN_HI-SCAN_LO);mod._uade_wasm_arm_capture_pc(pc,(pc+2)>>>0);
    if(mod._uade_wasm_render(L,R,21)<=0)break;if(mod._uade_wasm_get_capture(cap)){const a0=capU32(8);if(a0>=SCAN_LO&&a0<SCAN_HI&&a0<base0)base0=a0;}}
  const s16=(w:number):number=>(w<<16)>>16;
  const readW=(a:number):number=>{mod._uade_wasm_read_memory(a>>>0,rd,2);return(mod.HEAPU8[rd]<<8)|mod.HEAPU8[rd+1];};
  // GNN fires: watch cursor $0(a0) write
  const watchPos=(off:number,len:number):number[]=>{mod._uade_wasm_stop();load();const out:number[]=[];
    for(let s=0;s<30000&&out.length<24;s++){mod._uade_wasm_arm_capture((base0+off)>>>0,len);mod._uade_wasm_arm_capture_pc(0,0);
      if(mod._uade_wasm_render(L,R,1)<=0)break;if(mod._uade_wasm_get_capture(cap))out.push(s);}return out;};
  const gnnPos=watchPos(0x00,4);
  // vib +16000 positions
  mod._uade_wasm_stop();load();const vp:number[]=[];const vv:number[]=[];
  for(let s=0;s<30000&&vp.length<24;s++){mod._uade_wasm_arm_capture((base0+0x24)>>>0,2);mod._uade_wasm_arm_capture_pc(0,0);
    if(mod._uade_wasm_render(L,R,1)<=0)break;if(mod._uade_wasm_get_capture(cap)){vp.push(s);vv.push(s16(readW(base0+0x24)));}}
  const big:number[]=[];for(let i=1;i<vv.length;i++){let d=vv[i]-vv[i-1];if(d<-40000)d+=65536;if(d>40000)d-=65536;if(d===16000)big.push(vp[i]);}
  console.log(`\n${name} base0=${base0.toString(16)}`);
  console.log('  GNN cursor-write positions:', gnnPos.join(','));
  console.log('  $24 +16000 positions      :', big.join(','));
  try{mod._uade_wasm_cleanup();}catch{}
}
(async()=>{await run('gliders.src');await run('ballblaser.src');})().catch(e=>{console.error(e);process.exit(1);});
