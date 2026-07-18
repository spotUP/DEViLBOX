/** Trace native tick() PER vs UADE per bucket for a song; at first divergence dump
 *  native per-voice tempoTick/tempoNote/position/flags to test the global-vs-per-voice
 *  tempo hypothesis. */
import { readFileSync } from 'fs'; import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod=any; const REG_PER=3;
async function main(){
  const name=process.argv[2]??'tank-special.src'; const N=parseInt(process.argv[3]??'16',10);
  const data=new Uint8Array(readFileSync(join(CORPUS_DIR,name)));
  const mod:AnyMod=await loadUADEModule(false);
  if(mod._uade_wasm_init(44100)!==0)throw new Error('init');
  addCompanions(mod,loadInstrCompanions());
  const p=mod._malloc(data.byteLength);mod.HEAPU8.set(data,p);
  const h=mod._malloc(name.length*4+1);mod.stringToUTF8(name,h,name.length*4+1);
  mod._uade_wasm_stop();mod._uade_wasm_set_looping(0);mod._uade_wasm_set_one_subsong(1);
  if(mod._uade_wasm_load(p,data.byteLength,h)!==0)throw new Error('load');
  mod._free(p);mod._free(h);
  const CH=1024;const L=mod._malloc(CH*4),R=mod._malloc(CH*4),lg=mod._malloc(1024*3*4);
  mod._uade_wasm_enable_paula_log(1);
  const uper:number[][]=[[],[],[],[]];const cP=[-1,-1,-1,-1];
  for(let c=0;c<N;c++){if(mod._uade_wasm_render(L,R,CH)<=0)break;
    const n=mod._uade_wasm_get_paula_log(lg,1024);const hh=new Uint32Array(mod.HEAPU8.buffer);const b=lg>>2;
    for(let i=0;i<n;i++){const pk=hh[b+i*3];const ch=(pk>>>24)&0xff,reg=(pk>>>16)&0xff,val=pk&0xffff;if(ch<4&&reg===REG_PER)cP[ch]=val;}
    for(let v=0;v<4;v++)uper[v].push(cP[v]);}
  const score=parseSunTronicV13Score(data);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const player:any=new (SunTronicPlayer as any)(score);
  console.log('bkt| nativePER            | uadePER              | flags            | tTick        | pos');
  for(let c=0;c<N;c++){const t=player.tick();const vs=player.voices;
    const nper=t.voices.map((x:any)=>x.period);
    const up=uper.map(a=>a[c]);
    const fl=vs.map((v:any)=>v.flags.toString(16));
    const tt=vs.map((v:any)=>v.tempoTick);
    const po=vs.map((v:any)=>v.position);
    const mark=nper.map((x:number,v:number)=>x===up[v]?' ':'X').join('');
    console.log(`${String(c).padStart(3)}|${nper.map((x:number)=>String(x).padStart(5)).join('')}|${up.map((x:number)=>String(x).padStart(5)).join('')}| ${fl.join(',')} | ${tt.join(',')} | ${po.join(',')}  ${mark}`);
  }
}
main().catch(e=>{console.error(e);process.exit(1);});
