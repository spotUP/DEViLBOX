import { readFileSync } from 'fs';
import { parseSunTronicV13Score, sunCommandLen, sunPitchToNote } from '../../src/lib/import/formats/SunTronicV13';

const buf = new Uint8Array(readFileSync('/Users/spot/Code/DEViLBOX/public/data/songs/formats/SUNTronicTunes/mule.src'));
const score = parseSunTronicV13Score(buf);
const h1 = score.h1;
const sub = score.subsongs[0];
const widths = { arpShift: score.arpShift, volSlideRateFromStream: score.volSlideRateFromStream };

function walk(voice: number, applyTranspose: boolean){
  let rowsPerPos = score.rowsPerPositionDefault;
  const notes: {row:number,note:number,tr:number}[] = [];
  let row = 0;
  for (const entry of sub.entries){
    const ptr = entry.trackPtrs[voice];
    const tr = entry.transposes[voice];
    let pos = ptr;
    if (!score.blockIndexByOffset.has(ptr)){ row += rowsPerPos; continue; }
    for (let r=0;r<rowsPerPos;r++){
      for(;;){
        if(pos>=h1.length) break;
        const b=h1[pos]; const len=sunCommandLen(h1,pos,widths);
        if(b===0x00){pos+=len;break;}
        if(b>=0xb8){
          const raw=(~b)&0xff;
          const eff=applyTranspose ? raw - tr : raw;
          notes.push({row, note: sunPitchToNote(eff), tr});
        } else if(b===0x8c||b===0x8b){ const a=h1[pos+1]; if(a>=1) rowsPerPos=a; }
        pos+=len;
      }
      row++;
    }
  }
  return notes;
}
for(let v=0;v<4;v++){
  const nA=walk(v,false), nB=walk(v,true);
  const diff=nA.filter((n,i)=>n.note!==nB[i].note).length;
  console.log(`voice ${v}: emittedNotes=${nA.length} transposeChangedPitch=${diff}`);
  if(v===1) console.log('  sample v1 (row,noTr->withTr):', nA.slice(0,8).map((n,i)=>`${n.row}:${n.note}->${nB[i].note}`).join(' '));
}
