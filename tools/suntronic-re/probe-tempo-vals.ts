/** print gliders v0 speed($30)/rowsPerPos($31) from the parsed score + initial voice state. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { CORPUS_DIR } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
const name=process.argv[2]??'gliders.src';
const data=new Uint8Array(readFileSync(join(CORPUS_DIR,name)));
const score=parseSunTronicV13Score(data);
const pl=new SunTronicPlayer(score,{subsong:0});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const vs=(pl as any).voices;
for(let i=0;i<4;i++){const v=vs[i];console.log(`v${i}: speed=${v.speed} rowsPerPos=${v.rowsPerPos} tempoTick=${v.tempoTick} tempoNote=${v.tempoNote} position=${v.position} flags=${v.flags?.toString(16)}`);}
