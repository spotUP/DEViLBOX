/** Compare native outVolume vs UADE voice-struct $15 (true driver output vol,
 * BEFORE DeliTracker's selective Paula push). If native == $15 corpus-wide, the
 * decode is byte-exact and the paula-log VOL "residuals" are framework routing
 * artifacts, not decode bugs. Gates on TICK_PC music-tick (zero phase drift). */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
import { paulaAudxVol } from '../../src/engine/suntronic/SunTronicNativeRender';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod=any;
const SCAN_LO=0x20000,SCAN_HI=0x40000,STRIDE=0x1ba,TICK_PC=0x2660e;
async function run(name:string,TICKS:number,mod:AnyMod):Promise<void>{
  const data=new Uint8Array(readFileSync(join(CORPUS_DIR,name)));
  const load=():void=>{const p=mod._malloc(data.byteLength);mod.HEAPU8.set(data,p);const h=mod._malloc(name.length*4+1);mod.stringToUTF8(name,h,name.length*4+1);mod._uade_wasm_set_looping(0);mod._uade_wasm_set_one_subsong(1);if(mod._uade_wasm_load(p,data.byteLength,h)!==0)throw new Error('load');mod._free(p);mod._free(h);};
  const L=mod._malloc(4),R=mod._malloc(4),cap=mod._malloc(72),rd=mod._malloc(8);
  const capU32=(i:number):number=>new Uint32Array(mod.HEAPU8.buffer)[(cap>>2)+i]>>>0;
  mod._uade_wasm_stop();load();const hist=new Map<number,number>();
  for(let c=0;c<400;c++){mod._uade_wasm_arm_capture(SCAN_LO,SCAN_HI-SCAN_LO);mod._uade_wasm_arm_capture_pc(SCAN_LO,SCAN_HI);if(mod._uade_wasm_render(L,R,21)<=0)break;if(mod._uade_wasm_get_capture(cap))hist.set(capU32(16),(hist.get(capU32(16))??0)+1);}
  let wpc=0,wbest=-1;for(const[p,n]of hist)if(n>wbest){wbest=n;wpc=p;}
  mod._uade_wasm_stop();load();let base0=0xffffffff;
  for(let c=0;c<120;c++){mod._uade_wasm_arm_capture(SCAN_LO,SCAN_HI-SCAN_LO);mod._uade_wasm_arm_capture_pc(wpc,(wpc+2)>>>0);if(mod._uade_wasm_render(L,R,21)<=0)break;if(mod._uade_wasm_get_capture(cap)){const a0=capU32(8);if(a0>=SCAN_LO&&a0<SCAN_HI&&a0<base0)base0=a0;}}
  const rB=(a:number,n:number):number[]=>{mod._uade_wasm_read_memory(a>>>0,rd,n);const b:number[]=[];for(let i=0;i<n;i++)b.push(mod.HEAPU8[rd+i]);return b;};
  mod._uade_wasm_stop();load();
  const gold:number[][]=[];
  for(let s=0;s<200000&&gold.length<TICKS+2;s++){mod._uade_wasm_arm_capture_pc(TICK_PC,(TICK_PC+2)>>>0);if(mod._uade_wasm_render(L,R,1)<=0)break;if(mod._uade_wasm_get_capture(cap))gold.push([0,1,2,3].map(v=>rB(base0+v*STRIDE+0x15,1)[0]));}
  // native
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p:any=new (SunTronicPlayer as any)(parseSunTronicV13Score(data));
  const nat:number[][]=[];for(let t=0;t<TICKS;t++){const s=p.stepVblankOnce();nat.push([0,1,2,3].map(v=>(s.voices[v].outVolume&0xff)));}
  // best shift 0..2 (entry pre-update)
  let best=1e9,bs=0,detail='';
  for(const sh of [0,1,2]){let m=0,first='';for(let t=0;t<TICKS-2;t++){for(let v=0;v<4;v++){const g=gold[t+sh]?.[v];if(g===undefined)continue;if(g!==nat[t][v]){m++;if(!first)first=`t${t}v${v} U$15=${g} N=${nat[t][v]}`;}}}if(m<best){best=m;bs=sh;detail=first;}}
  console.log(`${name.padEnd(16)} base0=${base0.toString(16)} shift=${bs} VOLbad(vs $15)=${best}/${(TICKS-2)*4}  ${detail}`);
}
async function main():Promise<void>{
  const mod:AnyMod=await loadUADEModule(false);
  if(mod._uade_wasm_init(44100)!==0)throw new Error('init');
  addCompanions(mod,loadInstrCompanions());
  for(const n of ['comming0.src','freak.src','kompo04-mix.src','kompo05.src','ready','ballblaser.src']) await run(n,80,mod);
}
main().catch(e=>{console.error(e);process.exit(1);});
