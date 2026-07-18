import { readFileSync } from 'fs';
import { join } from 'path';
import { CORPUS_DIR } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A=any;
const NAME=process.argv[2],V=parseInt(process.argv[3]??'0',10),N=parseInt(process.argv[4]??'30',10);
const data=new Uint8Array(readFileSync(join(CORPUS_DIR,NAME)));
const player:A=new (SunTronicPlayer as A)(parseSunTronicV13Score(data));
const no=player.noteOn.bind(player);
player.noteOn=(v:A,sel:number)=>{no(v,sel);if(v.channel===V)console.log(` [note-on sel=0x${(sel&0xff).toString(16)} instr volEnvLen=${v.instr?.volEnvLen} loop=${v.instr?.volEnvLoop}]`);};
console.log('tick| vol slide envIdx envVal outVol');
for(let c=0;c<N;c++){const v=player.voices[V];const i=v.instr;const ev=i?(i.volEnv[v.volEnvIndex]??0):0;
  console.log(`${String(c).padStart(3)} | ${String(v.volume).padStart(3)} ${String(v.volumeSlide).padStart(4)} ${String(v.volEnvIndex).padStart(3)} ${String(ev).padStart(4)} ${String(v.outVolume).padStart(4)}`);
  player.stepVblankOnce();
}
