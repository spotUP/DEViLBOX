import { parsePSMFile } from '../src/lib/import/formats/PSMParser';
import { readFileSync } from 'fs';
const buf = readFileSync('./public/data/songs/formats/Silver-Song0.psm');
const b = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
const song: any = parsePSMFile(b, 'Silver-Song0.psm');
console.log('BPM:', song?.initialBPM, 'Speed:', song?.initialSpeed);
console.log('Channels:', song?.numChannels, 'Patterns:', song?.patterns?.length);
console.log('Instruments:', song?.instruments?.length);
for (let i = 0; i < Math.min(8, song?.instruments?.length ?? 0); i++) {
  const inst: any = song.instruments[i];
  const ab = inst?.sample?.audioBuffer;
  console.log('Inst', i+1, ':', inst?.name?.substring(0,20), 
    'audioBuffer:', ab ? (ab as ArrayBuffer).byteLength+'B' : 'null',
    'vol:', inst?.metadata?.modPlayback?.defaultVolume);
}
// Check first few cells in pat0
const p0 = song?.patterns?.[0];
for (let c = 0; c < Math.min(4, p0?.channels?.length ?? 0); c++) {
  for (let r = 0; r < Math.min(3, p0?.channels?.[c]?.rows?.length ?? 0); r++) {
    const row = p0.channels[c]?.rows?.[r];
    if (row?.note) console.log(`Pat0 Ch${c} Row${r}:`, JSON.stringify(row));
  }
}
