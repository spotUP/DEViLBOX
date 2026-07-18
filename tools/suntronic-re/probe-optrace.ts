import { readFileSync } from 'fs';
import { join } from 'path';
import { CORPUS_DIR } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A=any;
const NAME=process.argv[2]??'kompo05.src',V=parseInt(process.argv[3]??'1',10),N=parseInt(process.argv[4]??'8',10);
const data=new Uint8Array(readFileSync(join(CORPUS_DIR,NAME)));
const score=parseSunTronicV13Score(data);
const player:A=new (SunTronicPlayer as A)(score);
console.log('arpShift=',player.arpShift,'(wide 0x9b/0x99 semantics if >=4)');
const co=player.controlOpcode.bind(player);
player.controlOpcode=(v:A,op:number,a1:number)=>{const before=a1;const r=co(v,op,a1);
  if(v.channel===V)console.log(`  op=0x${op.toString(16)} bytes=[${Array.from(player.h1.slice(before,r)).map((b:number)=>b.toString(16).padStart(2,'0')).join(' ')}] -> vol=${v.volume} slide=${v.volumeSlide} arpSel=${v.arpSel}`);
  return r;};
const no=player.noteOn.bind(player);
player.noteOn=(v:A,sel:number)=>{no(v,sel);if(v.channel===V)console.log(` NOTE-ON sel=0x${(sel&0xff).toString(16)} vol=${v.volume} slide=${v.volumeSlide}`);};
for(let c=0;c<N;c++){console.log(`--- tick ${c} ---`);player.stepVblankOnce();}
