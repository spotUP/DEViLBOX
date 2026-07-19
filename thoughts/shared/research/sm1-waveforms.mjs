// Dump waveform data for both files. SidMon1 waveforms are 32 bytes each, signed 8-bit.
import fs from 'fs';

const files = [
  { name: 'myfunnymazea (BROKEN)', path: '/Users/spot/Code/DEViLBOX/public/data/songs/sidmon-1/myfunnymazea.sid', position: 4700, waveStart: 0x494, totWaveforms: 2 },
  { name: 'defjam        (WORKS)', path: '/Users/spot/Code/DEViLBOX/server/data/modland-cache/files/pub__modules__SidMon 1__Orpheus__defjam.sid', position: 4700, waveStart: 0x35c, totWaveforms: 7 },
];

for (const { name, path, position, waveStart, totWaveforms } of files) {
  const buf = fs.readFileSync(path);
  const off = position + waveStart;
  console.log(`\n━━━ ${name} ━━━  wave data starts at file offset ${off}`);
  for (let w = 0; w < totWaveforms; w++) {
    const wbase = off + w * 32;
    if (wbase + 32 > buf.length) { console.log(`  waveform ${w}: out of bounds`); continue; }
    const samples = [];
    let nonZero = 0, absMax = 0;
    for (let b = 0; b < 32; b++) {
      const s = buf[wbase + b] < 128 ? buf[wbase + b] : buf[wbase + b] - 256;
      samples.push(s);
      if (s !== 0) nonZero++;
      if (Math.abs(s) > absMax) absMax = Math.abs(s);
    }
    console.log(`  waveform ${w}: nonZero=${nonZero}/32  absMax=${absMax}  first8=[${samples.slice(0, 8).join(',')}]`);
  }
}
