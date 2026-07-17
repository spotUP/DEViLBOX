/** At PER-aligned, VOL-mismatched ticks: is UADE VOL a consistent fraction of
 *  native VOL (per song)? Consistent <1 ratio ⟹ master-volume scaling, NOT env math. */
import { readFileSync } from 'fs'; import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
import { paulaAudxVol } from '../../src/engine/suntronic/SunTronicNativeRender';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod=any; const REG_PER=3,REG_VOL=4;
async function main(){
  const names=process.argv.slice(2); const N=140;
  const mod:AnyMod=await loadUADEModule(false);
  if(mod._uade_wasm_init(44100)!==0)throw new Error('init');
  addCompanions(mod,loadInstrCompanions());
  for(const name of names){
    const data=new Uint8Array(readFileSync(join(CORPUS_DIR,name)));
    const p=mod._malloc(data.byteLength);mod.HEAPU8.set(data,p);
    const h=mod._malloc(name.length*4+1);mod.stringToUTF8(name,h,name.length*4+1);
    mod._uade_wasm_stop();mod._uade_wasm_set_looping(0);mod._uade_wasm_set_one_subsong(1);
    if(mod._uade_wasm_load(p,data.byteLength,h)!==0){mod._free(p);mod._free(h);console.log(name,'LOAD FAIL');continue;}
    mod._free(p);mod._free(h);
    const CH=1024;const L=mod._malloc(CH*4),R=mod._malloc(CH*4),lg=mod._malloc(1024*3*4);
    mod._uade_wasm_enable_paula_log(1);
    const uper:number[][]=[[],[],[],[]],uvol:number[][]=[[],[],[],[]];const cP=[-1,-1,-1,-1],cV=[-1,-1,-1,-1];
    for(let c=0;c<N;c++){if(mod._uade_wasm_render(L,R,CH)<=0)break;
      const n=mod._uade_wasm_get_paula_log(lg,1024);const hh=new Uint32Array(mod.HEAPU8.buffer);const b=lg>>2;
      for(let i=0;i<n;i++){const pk=hh[b+i*3];const ch=(pk>>>24)&0xff,reg=(pk>>>16)&0xff,val=pk&0xffff;
        if(ch>3)continue;if(reg===REG_VOL)cV[ch]=val;else if(reg===REG_PER)cP[ch]=val;}
      for(let v=0;v<4;v++){uper[v].push(cP[v]);uvol[v].push(cV[v]);}}
    mod._free(L);mod._free(R);mod._free(lg);
    const score=parseSunTronicV13Score(data);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const player:any=new (SunTronicPlayer as any)(score);
    const np:number[][]=[[],[],[],[]],nv:number[][]=[[],[],[],[]];
    for(let c=0;c<N;c++){const t=player.tick();for(let v=0;v<4;v++){np[v].push(t.voices[v].period);nv[v].push(paulaAudxVol(t.voices[v].outVolume&0xff));}}
    const ratios:number[]=[];let exactDiff=0;
    for(let v=0;v<4;v++){const T=Math.min(N,uper[v].length);
      for(let c=0;c<T;c++){if(np[v][c]!==uper[v][c])continue;if(nv[v][c]===uvol[v][c])continue;if(nv[v][c]===0)continue;
        ratios.push(uvol[v][c]/nv[v][c]); if(Math.abs(uvol[v][c]-nv[v][c])>2)exactDiff++;}}
    ratios.sort((a,b)=>a-b);
    const med=ratios.length?ratios[ratios.length>>1]:NaN;
    const lo=ratios.length?ratios[Math.floor(ratios.length*0.1)]:NaN, hi=ratios.length?ratios[Math.floor(ratios.length*0.9)]:NaN;
    console.log(`${name}: mismatches=${ratios.length} ratio med=${med?.toFixed(3)} [p10=${lo?.toFixed(3)} p90=${hi?.toFixed(3)}] bigDiff(>2)=${exactDiff}`);
  }
}
main().catch(e=>{console.error(e);process.exit(1);});
