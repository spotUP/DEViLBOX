import { readFileSync } from 'fs';
import { join } from 'path';
import { CORPUS_DIR } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod=any;
const songs=(process.argv[2]??'comming0.src,freak.src,kompo05.src').split(',');
for(const NAME of songs){
  const data=new Uint8Array(readFileSync(join(CORPUS_DIR,NAME)));
  const score=parseSunTronicV13Score(data);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const player:any=new (SunTronicPlayer as any)(score);
  const h1:Uint8Array=player.h1; const off=player.synthTableOff; const sz=player.synthRecordSize;
  const seen:number[]=[];
  const orig=player.noteOn.bind(player);
  player.noteOn=(v:AnyMod,sel:number)=>{orig(v,sel);if(v.instr&&v.instr.synthType===5&&!seen.includes(sel))seen.push(sel);};
  for(let c=0;c<60;c++)player.stepVblankOnce();
  console.log(`\n=== ${NAME} synthTableOff=0x${off.toString(16)} recSize=0x${sz.toString(16)} type5 sels=[${seen.map(s=>'0x'+s.toString(16)).join(',')}] ===`);
  for(const sel of seen){
    const idx=sel&0xbf; const rec=off+idx*sz;
    const bytes=Array.from(h1.slice(rec,rec+sz)).map(b=>b.toString(16).padStart(2,'0')).join(' ');
    console.log(`  sel=0x${sel.toString(16)} idx=${idx} rec@0x${rec.toString(16)}: ${bytes}`);
  }
}
