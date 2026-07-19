import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
const b = readFileSync(join(process.cwd(),'public/data/songs/formats/SUNTronicTunes/globe.src'));
const score: any = parseSunTronicV13Score(new Uint8Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)));
console.log('sampledInstruments:', score.sampledInstruments.length);
score.sampledInstruments.forEach((s:any,i:number)=>{
  console.log(`  [${i}] name=${JSON.stringify(s.name)} lenWords=${s.lengthWords} loopStart=${s.loopStartWords} loopLen=${s.loopLenWords} slot=${s.slotIndex} hasData=${!!s.data} dataLen=${s.data?s.data.length:0}`);
});
