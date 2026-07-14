import { readFileSync } from 'fs';
import { join } from 'path';
import { CORPUS_DIR } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
const data=new Uint8Array(readFileSync(join(CORPUS_DIR,'gliders.src')));
const s=parseSunTronicV13Score(data);
for(const idx of [0,16]){
  const i=s.synthInstruments[idx];
  console.log(`instr[${idx}] rec=0x${i.recordOff.toString(16)} synthType=${i.synthType}`);
  console.log(`  volEnvOff=0x${i.volEnvOff.toString(16)} volEnvLen=${i.volEnvLen} volEnvLoop=${i.volEnvLoop}`);
  console.log(`  freqEnvOff=0x${i.freqEnvOff.toString(16)} freqEnvLen=${i.freqEnvLen} freqEnvLoop=${i.freqEnvLoop} freqEnvSpeed=${i.freqEnvSpeed}`);
  console.log(`  volEnv[0..8]=${[...i.volEnv.slice(0,8)].join(',')}`);
  console.log(`  vibDepth[0..16]=${[...i.vibDepth.slice(0,16)].join(',')} (len ${i.vibDepth.length})`);
}
