import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
import { paulaAudxVol } from '../../src/engine/suntronic/SunTronicNativeRender';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod=any;
const NAME=process.argv[2]??'comming0.src'; const VOICE=parseInt(process.argv[3]??'1',10); const N=parseInt(process.argv[4]??'20',10);
async function main(){
  const mod:AnyMod=await loadUADEModule(false);
  if(mod._uade_wasm_init(44100)!==0)throw new Error('init');
  addCompanions(mod,loadInstrCompanions());
  const data=new Uint8Array(readFileSync(join(CORPUS_DIR,NAME)));
  const p=mod._malloc(data.byteLength);mod.HEAPU8.set(data,p);
  const h=mod._malloc(NAME.length*4+1);mod.stringToUTF8(NAME,h,NAME.length*4+1);
  mod._uade_wasm_stop();mod._uade_wasm_set_looping(0);mod._uade_wasm_set_one_subsong(1);
  if(mod._uade_wasm_load(p,data.byteLength,h)!==0)throw new Error('load');
  mod._free(p);mod._free(h);
  const CH=882;const L=mod._malloc(CH*4),R=mod._malloc(CH*4);const snap=mod._malloc(16*4);
  const score=parseSunTronicV13Score(data);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const player:any=new (SunTronicPlayer as any)(score);
  console.log('tick | UADE per,vol,dma | native per,vol');
  for(let c=0;c<N;c++){
    if(mod._uade_wasm_render(L,R,CH)<=0)break;
    mod._uade_wasm_get_channel_snapshot(snap);
    const u=new Uint32Array(mod.HEAPU8.buffer, snap, 16);
    const uper=u[VOICE*4+0],uvol=u[VOICE*4+1],udma=u[VOICE*4+2];
    const vs=player.stepVblankOnce().voices; const w=vs[VOICE];
    const nv=paulaAudxVol(w.outVolume&0xff);
    console.log(`${String(c).padStart(3)} | ${String(uper).padStart(4)},${String(uvol).padStart(3)},${udma} | ${String(w.period).padStart(4)},${String(nv).padStart(3)}`);
  }
  mod._free(L);mod._free(R);mod._free(snap);
}
main().catch(e=>{console.error(e);process.exit(1);});
