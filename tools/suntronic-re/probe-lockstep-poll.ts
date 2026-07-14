/** probe-lockstep-poll.ts — MISS-PROOF per-tick lockstep. Renders 1 sample at a time and
 * POLLS voice0 $24 (vibrato, changes every tick) via read_memory each sample; on change,
 * that's a tick boundary → snapshot ALL 4 voices. No reliance on the capture latch, so no
 * dropped ticks (the alias that faked the +16000 vib jumps). Compares to native tick i at
 * warmup 0/1. NOT committed. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
type AnyMod = any;
const SCAN_LO=0x20000,SCAN_HI=0x40000,STRIDE=0x1ba,TICKS=48;
async function run(name:string):Promise<void>{
  const data=new Uint8Array(readFileSync(join(CORPUS_DIR,name)));
  const mod:AnyMod=await loadUADEModule(false);
  if(mod._uade_wasm_init(44100)!==0)throw new Error('init');
  addCompanions(mod,loadInstrCompanions());
  const load=():void=>{const p=mod._malloc(data.byteLength);mod.HEAPU8.set(data,p);
    const h=mod._malloc(name.length*4+1);mod.stringToUTF8(name,h,name.length*4+1);
    mod._uade_wasm_set_looping(0);mod._uade_wasm_set_one_subsong(1);
    if(mod._uade_wasm_load(p,data.byteLength,h)!==0)throw new Error('load');mod._free(p);mod._free(h);};
  const L=mod._malloc(4),R=mod._malloc(4),cap=mod._malloc(72),rd=mod._malloc(8);
  const capU32=(i:number):number=>new Uint32Array(mod.HEAPU8.buffer)[(cap>>2)+i]>>>0;
  mod._uade_wasm_stop();load();const hist=new Map<number,number>();
  for(let c=0;c<400;c++){mod._uade_wasm_arm_capture(SCAN_LO,SCAN_HI-SCAN_LO);mod._uade_wasm_arm_capture_pc(SCAN_LO,SCAN_HI);
    if(mod._uade_wasm_render(L,R,21)<=0)break;if(mod._uade_wasm_get_capture(cap))hist.set(capU32(16),(hist.get(capU32(16))??0)+1);}
  let pc=0,best=-1;for(const[p,n]of hist)if(n>best){best=n;pc=p;}
  mod._uade_wasm_stop();load();let base0=0xffffffff;
  for(let c=0;c<120;c++){mod._uade_wasm_arm_capture(SCAN_LO,SCAN_HI-SCAN_LO);mod._uade_wasm_arm_capture_pc(pc,(pc+2)>>>0);
    if(mod._uade_wasm_render(L,R,21)<=0)break;if(mod._uade_wasm_get_capture(cap)){const a0=capU32(8);if(a0>=SCAN_LO&&a0<SCAN_HI&&a0<base0)base0=a0;}}
  const rB=(a:number,n:number):number[]=>{mod._uade_wasm_read_memory(a>>>0,rd,n);const b:number[]=[];for(let i=0;i<n;i++)b.push(mod.HEAPU8[rd+i]);return b;};
  const rW=(a:number):number=>{const b=rB(a,2);return(b[0]<<8)|b[1];};
  const snapV=(vi:number)=>{const b=base0+vi*STRIDE;return{period:rW(b+0x20),acc:rW(b+0x08),vol:rB(b+0x0c,1)[0],flags:rB(b+0x14,1)[0],vib:((rW(b+0x24)<<16)>>16)};};
  // poll voice0 $24 every sample; snapshot on change (never misses a tick)
  mod._uade_wasm_stop();load();
  const gold:{voices:ReturnType<typeof snapV>[]}[]=[];
  let prev=rW(base0+0x24);
  for(let s=0;s<60000&&gold.length<TICKS;s++){
    if(mod._uade_wasm_render(L,R,1)<=0)break;
    const cur=rW(base0+0x24);
    if(cur!==prev){gold.push({voices:[0,1,2,3].map(snapV)});prev=cur;}
  }
  {
    const score=parseSunTronicV13Score(data);const player=new SunTronicPlayer(score,{subsong:0});
    player.tick(); // warmup=1 alignment
    console.log(`\n${name} vibPhase G(uade)/N(native) + per, warmup=1:`);
    for(let i=0;i<Math.min(14,gold.length);i++){const t=player.tick();const d=player.debugVoice(0);
      const g=gold[i].voices[0];const n=t.voices[0];
      console.log(`  t${String(i).padStart(2)} G{vib${String(g.vib).padStart(7)} per${g.period}} N{vib${String((d.vibPhase<<16)>>16).padStart(7)} per${n.period}}${g.vib!==((d.vibPhase<<16)>>16)?' VIB!':''}${g.period!==n.period?' PER!':''}`);}
  }
  for(const warmup of [0,1]){
    const score=parseSunTronicV13Score(data);const player=new SunTronicPlayer(score,{subsong:0});
    for(let w=0;w<warmup;w++)player.tick();
    let mism=0;const fb:string[]=[];
    for(let i=0;i<gold.length;i++){const mv=player.tick().voices;const gv=gold[i].voices;
      for(let v=0;v<4;v++){const g=gv[v],m=mv[v];
        if(g.period!==m.period||g.acc!==(m.acc&0xffff)||g.flags!==m.flags){mism++;
          if(fb.length<8)fb.push(`t${i} v${v}: G{p${g.period} a${g.acc.toString(16)} f${g.flags.toString(16)}} N{p${m.period} a${(m.acc&0xffff).toString(16)} f${m.flags.toString(16)}}`);}}}
    console.log(`\n${name} warmup=${warmup} base0=${base0.toString(16)} ticks=${gold.length}: ${mism}/${gold.length*4} mismatches`);
    for(const f of fb)console.log('   '+f);
  }
  try{mod._uade_wasm_cleanup();}catch{}
}
(async()=>{await run('gliders.src');await run('ballblaser.src');})().catch(e=>{console.error(e);process.exit(1);});
