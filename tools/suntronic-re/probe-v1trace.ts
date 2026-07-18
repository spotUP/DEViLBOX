/** Trace native v1 (or any voice) per tick: cursor, sel used, instr env0, volume, outVol.
 * Subclasses the player to intercept noteOn + selectInstrument. */
import { readFileSync } from 'fs'; import { join } from 'path';
import { CORPUS_DIR } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
const name=process.argv[2]??'comming0.src'; const VC=parseInt(process.argv[3]??'1',10); const T=parseInt(process.argv[4]??'40',10);
const data=new Uint8Array(readFileSync(join(CORPUS_DIR,name)));
const score=parseSunTronicV13Score(data);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const P:any=SunTronicPlayer;
const events:string[]=[];
class Traced extends (P as any){
  noteOn(v:any,sel:number){ if(v.channel===VC) events.push(`  noteOn sel=0x${sel.toString(16)} (${(sel&0x40)?'synthA idx'+(sel&0xbf):'sampledB idx'+((sel-1)&0xff)})`); return super.noteOn(v,sel); }
}
const player:any=new Traced(score);
// dump sequence trackPtrs for this subsong
console.log('seq[0..1] trackPtrs:');
for(let i=0;i<2 && i<player.sequence.length;i++){
  console.log(`  pos${i}: [${player.sequence[i].trackPtrs.map((x:number)=>'0x'+(x>>>0).toString(16)).join(', ')}] tr=[${player.sequence[i].transposes.join(',')}]`);
}
console.log(`sampledTable len=${player.sampledTable.length}`);
player.sampledTable.forEach((s:any,i:number)=>{ if(s) console.log(`  sampled[${i}]: volEnv[0..4]=${s.volEnv?Array.from(s.volEnv.slice(0,5)).join(','):'-'} volEnvLen=${s.volEnvLen} slot=${s.slotIndex} lenW=${s.lengthWords}`); });
console.log(`--- v${VC} trace ---`);
for(let t=0;t<T;t++){
  events.length=0;
  const snap=player.stepVblankOnce();
  const raw=player.voices[VC]; const inst=raw.instr??raw.sampled;
  const line=`t${String(t).padStart(3)}: flags=0x${(raw.flags&0xff).toString(16)} vol=0x${(raw.volume&0xff).toString(16)} envIdx=${raw.volEnvIndex} env0=${inst?(inst.volEnv[raw.volEnvIndex]??0):'-'} outVol=${raw.outVolume&0xff} instr=${raw.instr?'A':(raw.sampled?'B'+raw.sampled.slotIndex:'null')}`;
  console.log(line + (events.length?'\n'+events.join('\n'):''));
}
