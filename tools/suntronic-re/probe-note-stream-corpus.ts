/** Corpus-wide coordinate-free note-stream oracle. grid (walkV13Voice) vs player fire order. */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { parseSunTronicFile } from '../../src/lib/import/formats/SunTronicParser';
import { parseSunTronicV13Score, sunPitchToNote } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';

const dir = join(process.cwd(), 'public/data/songs/formats/SUNTronicTunes');
const files = readdirSync(dir).filter(f => f.endsWith('.src'));
let clean = 0, diverged = 0; const bad: string[] = [];
for (const name of files) {
  let ab: ArrayBuffer;
  try { const b = readFileSync(join(dir, name)); ab = b.buffer.slice(b.byteOffset, b.byteOffset+b.byteLength); } catch { continue; }
  let song: any, score: any;
  try { song = parseSunTronicFile(ab, name); score = parseSunTronicV13Score(new Uint8Array(ab)); } catch { continue; }
  const gridSeq: number[][] = [[],[],[],[]];
  for (const pat of song.patterns) for (let ch=0; ch<Math.min(4,pat.channels.length); ch++)
    for (const cell of pat.channels[ch].rows) if (cell && cell.note && cell.note>0) gridSeq[ch].push(cell.note);
  const player: any = new SunTronicPlayer(score);
  const playSeq: number[][] = [[],[],[],[]];
  player.rowRecorder = (ch:number,_p:number,_r:number,note:number)=>{ if(ch>=0&&ch<4) playSeq[ch].push(sunPitchToNote(note)); };
  let started=false,prevPos0=0;
  for(let t=0;t<200000;t++){player.stepVblankOnce();const p0=player.debugVoice(0).position;if(p0>0)started=true;if(started&&p0===0&&prevPos0>0)break;prevPos0=p0;}
  let fileBad=false; const detail:string[]=[];
  for(let ch=0;ch<4;ch++){const g=gridSeq[ch],p=playSeq[ch];let i=0;while(i<g.length&&i<p.length&&g[i]===p[i])i++;if(i!==g.length||i!==p.length){fileBad=true;detail.push(`ch${ch} div@${i} g${g.length}/p${p.length}`);}}
  if(fileBad){diverged++;bad.push(`${name}: ${detail.join(' ')}`);}else clean++;
}
console.log(`CLEAN ${clean}  DIVERGED ${diverged}  total ${clean+diverged}`);
bad.slice(0,60).forEach(b=>console.log(' ',b));
