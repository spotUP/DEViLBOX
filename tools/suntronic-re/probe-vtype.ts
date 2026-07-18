import { readFileSync } from 'fs';
import { join } from 'path';
import { CORPUS_DIR } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod=any;
const NAMES=(process.argv[2]??'comming0.src,gliders.src').split(',');
for(const NAME of NAMES){
  const data=new Uint8Array(readFileSync(join(CORPUS_DIR,NAME)));
  const score=parseSunTronicV13Score(data);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const player:any=new (SunTronicPlayer as any)(score);
  console.log(`\n=== ${NAME}  arpShift=${player.arpShift} synthCount=${score.synthInstruments?.length} sampledCount=${score.sampledInstruments?.length} ===`);
  for(let c=0;c<8;c++){
    const vs=player.stepVblankOnce().voices;
    const row=vs.map((w:AnyMod,i:number)=>{
      const t=w.instr?w.instr.synthType:(w.sampled?'B':'-');
      return `v${i}:t=${t} sel=${w.instrSel??'?'} flg=${(w.flags&0xff).toString(16)} vol=${w.volume} per=${w.period}`;
    }).join('  ');
    console.log(`t${c} ${row}`);
  }
}
