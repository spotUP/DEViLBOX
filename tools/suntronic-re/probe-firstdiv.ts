import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
import { paulaAudxVol } from '../../src/engine/suntronic/SunTronicNativeRender';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A=any; const REG_PER=3,REG_VOL=4;
async function uadeVol(mod:A,name:string,N:number){
  const data=new Uint8Array(readFileSync(join(CORPUS_DIR,name)));
  const p=mod._malloc(data.byteLength);mod.HEAPU8.set(data,p);
  const h=mod._malloc(name.length*4+1);mod.stringToUTF8(name,h,name.length*4+1);
  mod._uade_wasm_stop();mod._uade_wasm_set_looping(0);mod._uade_wasm_set_one_subsong(1);
  if(mod._uade_wasm_load(p,data.byteLength,h)!==0){mod._free(p);mod._free(h);return null;}
  mod._free(p);mod._free(h);
  const CH=882;const L=mod._malloc(CH*4),R=mod._malloc(CH*4),lg=mod._malloc(512*3*4);
  mod._uade_wasm_enable_paula_log(1);
  const vol:number[][]=[[],[],[],[]];const cur=[-1,-1,-1,-1];
  for(let c=0;c<N*3;c++){if(mod._uade_wasm_render(L,R,CH)<=0)break;
    const n=mod._uade_wasm_get_paula_log(lg,512);const hh=new Uint32Array(mod.HEAPU8.buffer);const b=lg>>2;
    for(let i=0;i<n;i++){const pk=hh[b+i*3];const ch=(pk>>>24)&0xff,reg=(pk>>>16)&0xff,val=pk&0xffff;
      if(ch>3)continue;if(reg===REG_VOL)cur[ch]=val;else if(reg===REG_PER)vol[ch].push(cur[ch]);}
    if(Math.min(...vol.map(a=>a.length))>=N)break;}
  mod._free(L);mod._free(R);mod._free(lg);return vol;
}
async function main(){
  const N=parseInt(process.argv[2]??'60',10);
  const files=readdirSync(CORPUS_DIR).filter(f=>!f.startsWith('.'));
  const mod:A=await loadUADEModule(false);
  if(mod._uade_wasm_init(44100)!==0)throw new Error('init');
  addCompanions(mod,loadInstrCompanions());
  const rows:{f:string,first:number,detail:string}[]=[];
  for(const f of files){
    let uv;try{uv=await uadeVol(mod,f,N);}catch{uv=null;} if(!uv)continue;
    let player:A;try{player=new (SunTronicPlayer as A)(parseSunTronicV13Score(new Uint8Array(readFileSync(join(CORPUS_DIR,f)))));}catch{continue;}
    const nv:number[][]=[[],[],[],[]];
    for(let c=0;c<N;c++){const vs=player.stepVblankOnce().voices;for(let v=0;v<4;v++)nv[v].push(paulaAudxVol(vs[v].outVolume&0xff));}
    const firsts=[99,99,99,99];
    for(let v=0;v<4;v++){const n=Math.min(N,uv[v].length);for(let c=0;c<n;c++){if(nv[v][c]!==uv[v][c]){firsts[v]=c;break;}}}
    const minFirst=Math.min(...firsts);
    if(minFirst<N)rows.push({f,first:minFirst,detail:firsts.map((x,v)=>x<N?`v${v}@${x}`:'').filter(Boolean).join(' ')});
  }
  rows.sort((a,b)=>a.first-b.first);
  console.log(`first VOL divergence tick (native vs UADE, shift 0), N=${N}:`);
  rows.forEach(r=>console.log(`  ${String(r.first).padStart(3)} | ${r.f}  [${r.detail}]`));
}
main().catch(e=>{console.error(e);process.exit(1);});
