import { readFileSync } from 'fs';
import { parseSunTronicV13Score, sunCommandLen } from '../../src/lib/import/formats/SunTronicV13';
const buf = new Uint8Array(readFileSync('/Users/spot/Code/DEViLBOX/public/data/songs/formats/SUNTronicTunes/ready'));
const s: any = parseSunTronicV13Score(buf);
const h1 = s.h1; const bmap = s.blockIndexByOffset; const sub = s.subsongs[0];
const widths = { arpShift: s.arpShift, volSlideRateFromStream: s.volSlideRateFromStream };
console.log('arpShift', s.arpShift, 'vsr', s.volSlideRateFromStream, 'rppDefault', s.rowsPerPositionDefault, 'entries', sub.entries.length);
for (let v=0; v<4; v++){
  let rowsPerPos = s.rowsPerPositionDefault;
  const changes:string[]=[]; let noteCells=0;
  for (let pi=0; pi<sub.entries.length; pi++){
    const ptr = sub.entries[pi].trackPtrs[v]>>>0;
    if (!bmap.has(ptr) || ptr>=h1.length) continue;
    let pos=ptr;
    for (let r=0;r<rowsPerPos;r++){ let hasNote=false;
      for(;;){ if(pos>=h1.length)break; const b=h1[pos]; const len=sunCommandLen(h1,pos,widths);
        if(b===0x00){pos+=len;break;}
        if(b>=0xb8) hasNote=true;
        if(b===0x8c||b===0x8b){ const a=h1[pos+1]; if(a>=1){ if(a!==rowsPerPos) changes.push(`p${pi}r${r}:${a}`); rowsPerPos=a; } }
        pos+=len; }
      if(hasNote) noteCells++;
    }
  }
  console.log(`v${v}: rppChanges=[${changes.join(',')}] finalRPP=${rowsPerPos} noteCells=${noteCells}`);
}
