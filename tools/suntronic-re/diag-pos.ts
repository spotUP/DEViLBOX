import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSunTronicFile } from '../../src/lib/import/formats/SunTronicParser';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
const path = join(process.cwd(), 'public/data/songs/formats/SUNTronicTunes/analgestic2.src');
const buf = readFileSync(path);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const song: any = parseSunTronicFile(ab, 'analgestic2.src');
const maxPos = [0,0,0,0]; const stamped = [0,0,0,0];
for (const pat of song.patterns) for (let ch=0; ch<4; ch++) for (const c of pat.channels[ch].rows) {
  if (c && c.sunPosition !== undefined) { stamped[ch]++; if (c.sunPosition > maxPos[ch]) maxPos[ch] = c.sunPosition; }
}
console.log('grid max sunPosition per ch:', maxPos, 'stamped cells:', stamped);
console.log('total grid rows (cells.length) via patterns:', song.patterns.length, 'patterns x 64');
const score: any = parseSunTronicV13Score(new Uint8Array(ab));
console.log('rowsPerPositionDefault:', score.rowsPerPositionDefault, 'num entries:', score.subsongs[0].entries.length);
const player: any = new SunTronicPlayer(score);
const maxPlayPos = [0,0,0,0];
player.rowRecorder = (ch:number,pos:number)=>{ if(pos>maxPlayPos[ch]) maxPlayPos[ch]=pos; };
let started=false, prev=0;
for (let t=0;t<60000;t++){player.stepVblankOnce();const p=player.debugVoice(0).position;if(p>0)started=true;if(started&&p===0&&prev>0)break;prev=p;}
console.log('player max position per ch:', maxPlayPos);
