import { readFileSync } from 'fs'; import { join } from 'path';
import { CORPUS_DIR } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
const name = process.argv[2] ?? 'suntronic-k3.src'; const V = parseInt(process.argv[3] ?? '0',10);
const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const score: any = parseSunTronicV13Score(data);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const player: any = new (SunTronicPlayer as any)(score);
console.log('arpShift', player.arpShift, 'mask', player.arpPhaseMask, 'drin.len', player.drin?.length);
const drin = player.drin;
console.log('drin[128..152]:', Array.from({length:25},(_,i)=>drin?.[128+i]).join(','));
console.log('score.arpShift', score.arpShift, 'drinOff', score.drinOff, 'periodsOff', score.periodsOff);
for (let c=0;c<10;c++){ player.stepVblankOnce(); const v=player.voices[V];
  console.log(c,'arpSel',v.arpSel,'arpPhase',v.arpPhase,'pitch',(v.pitch&0xffff),'period',v.period); }
