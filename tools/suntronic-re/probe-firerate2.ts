/** Fire-rate via AUDxPER-write cadence: count reg-3 (period) paula writes per voice
 *  over a fixed sample window. A moving voice writes PER once per replayer fire, so
 *  writes/sec = fire rate. If gliders (exact) and tank-special (breaks) differ, timing
 *  is variable (CIA) → native's fixed 882.759 is the scheduler bug. */
import { readFileSync } from 'fs'; import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod=any; const REG_PER=3;
async function rate(mod:AnyMod,name:string){
  const data=new Uint8Array(readFileSync(join(CORPUS_DIR,name)));
  const p=mod._malloc(data.byteLength);mod.HEAPU8.set(data,p);
  const h=mod._malloc(name.length*4+1);mod.stringToUTF8(name,h,name.length*4+1);
  mod._uade_wasm_stop();mod._uade_wasm_set_looping(0);mod._uade_wasm_set_one_subsong(1);
  if(mod._uade_wasm_load(p,data.byteLength,h)!==0){mod._free(p);mod._free(h);return 'LOAD FAIL';}
  mod._free(p);mod._free(h);
  const CH=882;const L=mod._malloc(CH*4),R=mod._malloc(CH*4),lg=mod._malloc(1024*3*4);
  mod._uade_wasm_enable_paula_log(1);
  const writes=[0,0,0,0];let samples=0;const buckets:number[]=[];
  for(let c=0;c<200;c++){const got=mod._uade_wasm_render(L,R,CH);if(got<=0)break;samples+=got;
    const n=mod._uade_wasm_get_paula_log(lg,1024);const hh=new Uint32Array(mod.HEAPU8.buffer);const b=lg>>2;let bc=0;
    for(let i=0;i<n;i++){const pk=hh[b+i*3];const ch=(pk>>>24)&0xff,reg=(pk>>>16)&0xff;if(ch<4&&reg===REG_PER){writes[ch]++;if(ch===0||ch===1)bc++;}}
    buckets.push(bc);}
  mod._free(L);mod._free(R);mod._free(lg);
  const mx=Math.max(...writes);const hz=mx*44100/samples;
  // per-882-bucket fire counts for the busiest voice pair (should be ~1, doubling to 2)
  const dist:Record<number,number>={};for(const x of buckets)dist[x]=(dist[x]??0)+1;
  return `perWrites=[${writes}] samples=${samples} fireHz≈${hz.toFixed(2)} periodSamp≈${(samples/mx).toFixed(2)} bucketFireDist=${JSON.stringify(dist)}`;
}
async function main(){
  const mod:AnyMod=await loadUADEModule(false);
  if(mod._uade_wasm_init(44100)!==0)throw new Error('init');
  addCompanions(mod,loadInstrCompanions());
  for(const n of process.argv.slice(2))console.log(n.padEnd(18),await rate(mod,n));
}
main().catch(e=>{console.error(e);process.exit(1);});
