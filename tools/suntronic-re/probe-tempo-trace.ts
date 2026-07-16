/** Read v0 tempo counters $2c(tick)/$2d(row)/$30(speed) + $24 each sample; print a
 * per-tick trace: which ticks a row fires ($2d increments) vs which double $24.
 * Settles whether row cadence is 6.25 (7,6,6,6) → extraVib-per-row would be exact. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
type AnyMod=any; const SPT=882; const name=process.argv[2]??'gliders.src'; const NSAMP=42*1024;
(async()=>{
  const data=new Uint8Array(readFileSync(join(CORPUS_DIR,name)));
  const mod:AnyMod=await loadUADEModule(false);
  if(mod._uade_wasm_init(44100)!==0)throw 0; addCompanions(mod,loadInstrCompanions());
  const load=()=>{const p=mod._malloc(data.byteLength);mod.HEAPU8.set(data,p);const h=mod._malloc(name.length*4+1);mod.stringToUTF8(name,h,name.length*4+1);mod._uade_wasm_set_looping(0);mod._uade_wasm_set_one_subsong(1);mod._uade_wasm_load(p,data.byteLength,h);mod._free(p);mod._free(h);};
  const L=mod._malloc(SPT*4),R=mod._malloc(SPT*4),rd=mod._malloc(64);
  const rW=(a:number)=>{mod._uade_wasm_read_memory(a>>>0,rd,2);return(mod.HEAPU8[rd]<<8)|mod.HEAPU8[rd+1];};
  const rB=(a:number)=>{mod._uade_wasm_read_memory(a>>>0,rd,1);return mod.HEAPU8[rd];};
  const s16=(x:number)=>(x&0x8000)?x-0x10000:x;
  const base0=0x26f8a;
  mod._uade_wasm_stop();load();
  let p24=s16(rW(base0+0x24)),p2d=rB(base0+0x2d),p2c=rB(base0+0x2c);
  const rowTicks:number[]=[],dblTicks:number[]=[];
  for(let s=0;s<NSAMP;s++){
    if(mod._uade_wasm_render(L,R,1)<=0)break;
    const c24=s16(rW(base0+0x24)),c2d=rB(base0+0x2d),c2c=rB(base0+0x2c);
    if(c2d!==p2d||(c2c===0&&p2c!==0)){rowTicks.push(Math.round(s/1024));p2d=c2d;}
    if(c24!==p24){let d=c24-p24;if(d<-4000)d+=65536;if(d>=12000)dblTicks.push(Math.round(s/1024));p24=c24;}
    p2c=c2c;
  }
  console.log(name,'speed$30=',rB(base0+0x30),'rowsPerPos$31=',rB(base0+0x31));
  console.log('row ticks:  ',rowTicks.slice(0,22).join(','));
  console.log('row gaps:   ',rowTicks.slice(1,22).map((t,i)=>t-rowTicks[i]).join(','));
  console.log('double ticks',dblTicks.slice(0,22).join(','));
  console.log('double gaps ',dblTicks.slice(1,22).map((t,i)=>t-dblTicks[i]).join(','));
})();
