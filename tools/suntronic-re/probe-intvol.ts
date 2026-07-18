import { readFileSync } from 'fs';
import { join } from 'path';
import { CORPUS_DIR } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A=any;
const NAME=process.argv[2],V=parseInt(process.argv[3]??'0',10),N=parseInt(process.argv[4]??'16',10);
const player:A=new (SunTronicPlayer as A)(parseSunTronicV13Score(new Uint8Array(readFileSync(join(CORPUS_DIR,NAME)))));
console.log(`${NAME} v${V}: tick| INT.volume INT.slide envIdx outVol`);
for(let c=0;c<N;c++){player.stepVblankOnce();const v=player.voices[V];
  console.log(`  ${String(c).padStart(3)} | ${String(v.volume).padStart(4)} ${String(v.volumeSlide).padStart(4)} ${String(v.volEnvIndex).padStart(3)} ${String(v.outVolume).padStart(4)}`);
}
