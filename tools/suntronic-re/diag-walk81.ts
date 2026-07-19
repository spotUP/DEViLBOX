import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSunTronicV13Score, sunPitchToNote } from '../../src/lib/import/formats/SunTronicV13';
import { decodeSunGroup } from '../../src/lib/import/formats/sunGroupCodec';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
const path = join(process.cwd(), 'public/data/songs/formats/SUNTronicTunes/analgestic2.src');
const buf = readFileSync(path);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const score: any = parseSunTronicV13Score(new Uint8Array(ab));
const h1 = score.h1; const sub = score.subsongs[0];
const voice = 1; const P = 81;
const widths = { arpShift: score.arpShift, volSlideRateFromStream: score.volSlideRateFromStream };
const numSampled = score.sampledInstruments.length;
// replicate walkV13Voice for position P only
const entry = sub.entries[P];
const ptr = entry.trackPtrs[voice]; const transpose = entry.transposes[voice];
let pos = ptr; let curInstr = 0;
console.log(`WALK ch${voice} pos${P} ptr=${ptr} transpose=${transpose} rowsPerPos=16:`);
for (let r=0; r<16; r++) {
  const d = decodeSunGroup(h1, pos, transpose, curInstr, numSampled, widths);
  curInstr = d.curInstr;
  console.log(`  r${r}: note=${d.cell.note} startpos=${pos} nextpos=${d.nextPos}`);
  pos = d.nextPos;
}
// player fires at pos P
const player: any = new SunTronicPlayer(score);
const fires: Array<[number,number]> = [];
player.rowRecorder = (ch:number,position:number,row:number,note:number)=>{ if(ch===voice&&position===P) fires.push([row-1, sunPitchToNote(note)]); };
let started=false, prev=0;
for (let t=0;t<60000;t++){player.stepVblankOnce();const p=player.debugVoice(0).position;if(p>0)started=true;if(started&&p===0&&prev>0)break;prev=p;}
console.log(`PLAYER ch${voice} pos${P} fires (row,note):`, JSON.stringify(fires));
