/** Measure native-vs-UADE PER match rate at bucket offsets -1/0/+1 per voice.
 *  Clean +1 win = native leads by one bucket (startup latch phase). */
import { readFileSync } from 'fs'; import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod=any; const REG_PER=3;
async function one(mod:AnyMod,name:string,N:number){
  const data=new Uint8Array(readFileSync(join(CORPUS_DIR,name)));
  const p=mod._malloc(data.byteLength);mod.HEAPU8.set(data,p);
  const h=mod._malloc(name.length*4+1);mod.stringToUTF8(name,h,name.length*4+1);
  mod._uade_wasm_stop();mod._uade_wasm_set_looping(0);mod._uade_wasm_set_one_subsong(1);
  if(mod._uade_wasm_load(p,data.byteLength,h)!==0){mod._free(p);mod._free(h);return null;}
  mod._free(p);mod._free(h);
  const CH=1024;const L=mod._malloc(CH*4),R=mod._malloc(CH*4),lg=mod._malloc(1024*3*4);
  mod._uade_wasm_enable_paula_log(1);
  const uper:number[][]=[[],[],[],[]];const cP=[-1,-1,-1,-1];
  for(let c=0;c<N;c++){if(mod._uade_wasm_render(L,R,CH)<=0)break;
    const n=mod._uade_wasm_get_paula_log(lg,1024);const hh=new Uint32Array(mod.HEAPU8.buffer);const b=lg>>2;
    for(let i=0;i<n;i++){const pk=hh[b+i*3];const ch=(pk>>>24)&0xff,reg=(pk>>>16)&0xff,val=pk&0xffff;if(ch<4&&reg===REG_PER)cP[ch]=val;}
    for(let v=0;v<4;v++)uper[v].push(cP[v]);}
  mod._free(L);mod._free(R);mod._free(lg);
  const score=parseSunTronicV13Score(data);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const player:any=new (SunTronicPlayer as any)(score);
  const np:number[][]=[[],[],[],[]];
  for(let c=0;c<N;c++){const t=player.tick();for(let v=0;v<4;v++)np[v].push(t.voices[v].period);}
  const score3=[0,0,0];const off=[-1,0,1];let tot=0;
  for(let v=0;v<4;v++)for(let c=1;c<N-1;c++){if(uper[v][c]<0)continue;tot++;
    off.forEach((o,k)=>{if(np[v][c]===uper[v][c+o])score3[k]++;});}
  return {name,tot,m1:score3[0],m0:score3[1],p1:score3[2]};
}
async function main(){
  const N=parseInt(process.argv[2]??'80',10);
  const mod:AnyMod=await loadUADEModule(false);
  if(mod._uade_wasm_init(44100)!==0)throw new Error('init');
  addCompanions(mod,loadInstrCompanions());
  for(const n of process.argv.slice(3)){const r=await one(mod,n,N);if(!r){console.log(n,'FAIL');continue;}
    console.log(`${r.name.padEnd(18)} tot=${r.tot}  off-1=${r.m1} off0=${r.m0} off+1=${r.p1}  best=${['-1','0','+1'][[r.m1,r.m0,r.p1].indexOf(Math.max(r.m1,r.m0,r.p1))]}`);}
}
main().catch(e=>{console.error(e);process.exit(1);});
