/** Measure the EXACT per-bucket CIA-step count from UADE (count $24 writes per
 * 1024-sample bucket for v0), then inject as subtickSchedule into native. If native
 * then matches golden 0-mismatch, the player LOGIC is byte-exact and only the clock
 * constant is approximate → the two-clock abstraction is correct, derive real P. */
import { readFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
type AnyMod=any; const SPT=882;
const HERE=dirname(fileURLToPath(import.meta.url)),REPO=resolve(HERE,'../..');
const golden=JSON.parse(readFileSync(resolve(REPO,'src/engine/suntronic/__tests__/sunTronicNoteTimeline.golden.json'),'utf8'));
const BASE:Record<string,number>={'gliders.src':0x26f8a,'ballblaser.src':0x25f6a};
async function measureSchedule(name:string,nBuckets:number):Promise<number[]>{
  const data=new Uint8Array(readFileSync(join(CORPUS_DIR,name)));
  const mod:AnyMod=await loadUADEModule(false);
  if(mod._uade_wasm_init(44100)!==0)throw 0; addCompanions(mod,loadInstrCompanions());
  const p=mod._malloc(data.byteLength);mod.HEAPU8.set(data,p);const h=mod._malloc(name.length*4+1);mod.stringToUTF8(name,h,name.length*4+1);mod._uade_wasm_set_looping(0);mod._uade_wasm_set_one_subsong(1);mod._uade_wasm_load(p,data.byteLength,h);mod._free(p);mod._free(h);
  const L=mod._malloc(4),R=mod._malloc(4),rd=mod._malloc(8);
  const base=BASE[name];
  const rW=(a:number)=>{mod._uade_wasm_read_memory(a>>>0,rd,2);return(mod.HEAPU8[rd]<<8)|mod.HEAPU8[rd+1];};
  const s16=(x:number)=>(x&0x8000)?x-0x10000:x;
  const sched:number[]=[]; let prev=s16(rW(base+0x24));
  for(let b=0;b<nBuckets;b++){let steps=0;for(let s=0;s<1024;s++){if(mod._uade_wasm_render(L,R,1)<=0)break;const c=s16(rW(base+0x24));if(c!==prev){let d=c-prev;if(d<-4000)d+=65536;steps+=Math.round(d/8000);prev=c;}}sched.push(steps);}
  try{mod._uade_wasm_cleanup();}catch{}
  return sched;
}
function nativeMM(name:string,sched:number[]):{mm:number,lines:string[]}{
  const data=new Uint8Array(readFileSync(join(CORPUS_DIR,name)));
  const pl=new SunTronicPlayer(parseSunTronicV13Score(data),{subsong:0,subtickSchedule:sched});
  const S=golden.modules[name];const raw:any[]=[];
  for(let i=0;i<S.length;i++)raw.push(pl.tick().voices.map((v:any)=>({period:v.period,acc:v.acc&0xffff,flags:v.flags&0xff})));
  let mm=0;const lines:string[]=[];
  for(let i=1;i<S.length;i++){const g=S[i-1].voices;for(let v=0;v<4;v++){const gv=g[v],mv=raw[i][v];if(gv.period!==mv.period||gv.acc!==mv.acc||gv.flags!==mv.flags){mm++;if(lines.length<12)lines.push(`t${i} v${v}: gold{p${gv.period} a${gv.acc.toString(16)}} nat{p${mv.period} a${mv.acc.toString(16)}}`);}}}
  return {mm,lines};
}
(async()=>{
  for(const name of Object.keys(golden.modules)){
    const N=golden.modules[name].length;
    const sched=await measureSchedule(name,N+2);
    console.log(`\n${name} schedule[0..24]:`,sched.slice(0,25).join(','),' sum=',sched.reduce((a,b)=>a+b,0));
    const {mm,lines}=nativeMM(name,sched);
    console.log(`  injected-schedule mismatches: ${mm}/${(N-1)*4}`);
    for(const l of lines)console.log('   '+l);
  }
})();
