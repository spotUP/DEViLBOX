import { readFileSync } from 'fs'; import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
const STRIDE=0x1ba,PC_LO=0x2660e,PC_HI=0x26610;
(async()=>{
  const name='gliders.src'; const data=new Uint8Array(readFileSync(join(CORPUS_DIR,name)));
  const mod:any=await loadUADEModule(false); mod._uade_wasm_init(44100);
  addCompanions(mod,loadInstrCompanions());
  const load=()=>{ const p=mod._malloc(data.byteLength); mod.HEAPU8.set(data,p);
    const h=mod._malloc(name.length*4+1); mod.stringToUTF8(name,h,name.length*4+1);
    mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1); mod._uade_wasm_load(p,data.byteLength,h); };
  const L=mod._malloc(882*4),R=mod._malloc(882*4),cap=mod._malloc(18*4),rd=mod._malloc(64);
  load();
  let base0=0xffffffff;
  for(let c=0;c<48;c++){ mod._uade_wasm_arm_capture(0x20000,0x10000); mod._uade_wasm_arm_capture_pc(PC_LO,PC_HI);
    mod._uade_wasm_render(L,R,882); if(!mod._uade_wasm_get_capture(cap))continue;
    const a0=new Uint32Array(mod.HEAPU8.buffer)[(cap>>2)+8]>>>0; if(a0<base0)base0=a0; }
  mod._uade_wasm_stop(); load();
  const rdW=(a:number,n:number)=>{ mod._uade_wasm_read_memory(a>>>0,rd,n); const b:number[]=[]; for(let i=0;i<n;i++)b.push(mod.HEAPU8[rd+i]); return b; };
  const v0=base0;
  const g=(off:number,n:number)=>{const b=rdW(v0+off,n); let x=0; for(const y of b)x=(x<<8)|y; return x;};
  // per-tick clock = $15 write
  const rows:any[]=[];
  while(rows.length<14){ mod._uade_wasm_arm_capture((v0+0x15)>>>0,1); mod._uade_wasm_arm_capture_pc(0,0);
    if(mod._uade_wasm_render(L,R,64)<=0)break; if(mod._uade_wasm_get_capture(cap))
      rows.push({period:g(0x20,2),pitch:g(0x08,2),vib24:g(0x24,2),vib26:g(0x26,2)}); }
  const score=parseSunTronicV13Score(data); const player:any=new SunTronicPlayer(score,{subsong:0});
  console.log('tick |   UADE  period pitch $24  $26 |  MINE  period pitch vibPh vibIx');
  for(let t=0;t<rows.length;t++){ player.tick(); const mv=player.voices[0];
    const G=rows[t];
    console.log(`${String(t).padStart(4)} | ${String(G.period).padStart(6)} ${G.pitch.toString(16).padStart(4)} ${G.vib24.toString(16).padStart(4)} ${G.vib26.toString(16).padStart(4)} | ${String(mv.period).padStart(6)} ${(mv.pitch&0xffff).toString(16).padStart(4)} ${(mv.vibPhase&0xffff).toString(16).padStart(4)} ${(mv.vibIndex&0xffff).toString(16).padStart(4)}`);
  }
})();
