/** Per-sample render: detect GNN-entry(0x2676a) fires for v0 and $24 advances.
 * Build a table of (sample, event) — GNN fire 'R', $24 +8000 '.', $24 +16000 'D'.
 * Directly shows which rows double-advance $24 and the exact tick spacing. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
type AnyMod=any; const SCAN_LO=0x20000,SCAN_HI=0x40000,SPT=882;
const name=process.argv[2]??'gliders.src'; const NSAMP=40*1024;
const GNN=0x264c8; // row-taken path clr $2c
(async()=>{
  const data=new Uint8Array(readFileSync(join(CORPUS_DIR,name)));
  const mod:AnyMod=await loadUADEModule(false);
  if(mod._uade_wasm_init(44100)!==0)throw 0; addCompanions(mod,loadInstrCompanions());
  const load=()=>{const p=mod._malloc(data.byteLength);mod.HEAPU8.set(data,p);const h=mod._malloc(name.length*4+1);mod.stringToUTF8(name,h,name.length*4+1);mod._uade_wasm_set_looping(0);mod._uade_wasm_set_one_subsong(1);mod._uade_wasm_load(p,data.byteLength,h);mod._free(p);mod._free(h);};
  const L=mod._malloc(SPT*4),R=mod._malloc(SPT*4),cap=mod._malloc(18*4),rd=mod._malloc(64);
  const rW=(a:number)=>{mod._uade_wasm_read_memory(a>>>0,rd,2);return(mod.HEAPU8[rd]<<8)|mod.HEAPU8[rd+1];};
  const s16=(x:number)=>(x&0x8000)?x-0x10000:x;
  const base0=0x26f8a;
  mod._uade_wasm_stop();load();
  let prev=s16(rW(base0+0x24));
  const rows:number[]=[], dbls:number[]=[];
  for(let s=0;s<NSAMP;s++){
    mod._uade_wasm_arm_capture_pc(GNN,GNN+2);
    if(mod._uade_wasm_render(L,R,1)<=0)break;
    const gnn=mod._uade_wasm_get_capture(cap)!==0;
    if(gnn)rows.push(s);
    const c=s16(rW(base0+0x24)); if(c!==prev){let d=c-prev;if(d<-4000)d+=65536;if(d>=12000)dbls.push(s);prev=c;}
  }
  const rowTicks=rows.map(s=>Math.round(s/1024));
  const dblTicks=dbls.map(s=>Math.round(s/1024));
  console.log(name);
  console.log('GNN(row) fire ticks:',rowTicks.slice(0,20).join(','));
  console.log('GNN row gaps:',rowTicks.slice(1,20).map((t,i)=>t-rowTicks[i]).join(','));
  console.log('$24 DOUBLE ticks: ',dblTicks.slice(0,20).join(','));
  console.log('double gaps:      ',dblTicks.slice(1,20).map((t,i)=>t-dblTicks[i]).join(','));
})();
