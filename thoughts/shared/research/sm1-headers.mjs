// Dump SidMon1 header offsets for multiple files.
// The parser reads 44 bytes before the " SID-MON BY R.v.VLIET" string.
import fs from 'fs';

const files = [
  { name: 'myfunnymazea (BROKEN)', path: '/Users/spot/Code/DEViLBOX/public/data/songs/sidmon-1/myfunnymazea.sid' },
  { name: 'defjam        (WORKS)', path: '/Users/spot/Code/DEViLBOX/server/data/modland-cache/files/pub__modules__SidMon 1__Orpheus__defjam.sid' },
  { name: 'newsontour    (WORKS)', path: '/Users/spot/Code/DEViLBOX/server/data/modland-cache/files/pub__modules__SidMon 1__Daryl__newsontour.sid' },
];

const MAGIC = ' SID-MON BY R.v.VLIET  (c) 1988 ';

function rd32BE(buf, off) {
  return ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0;
}

for (const { name, path } of files) {
  const buf = fs.readFileSync(path);
  // Find the magic marker
  let position = -1;
  for (let i = 0; i < buf.length - 32; i++) {
    let match = true;
    for (let k = 0; k < 32; k++) {
      if (buf[i + k] !== MAGIC.charCodeAt(k)) { match = false; break; }
    }
    if (match) { position = i; break; }
  }
  if (position < 0) { console.log(`${name}: magic NOT FOUND`); continue; }

  // Read the 44 bytes before position as the offset block.
  const trackBase   = rd32BE(buf, position - 44);
  const trackEnd    = rd32BE(buf, position - 28);
  const instrBase   = rd32BE(buf, position - 28);
  const instrEnd    = rd32BE(buf, position - 24);
  const waveStart   = rd32BE(buf, position - 24);
  const waveEnd     = rd32BE(buf, position - 20);
  const patStart    = rd32BE(buf, position - 12);
  const patEnd      = rd32BE(buf, position - 8);
  const ppBase      = rd32BE(buf, position - 8);
  const ppEnd       = rd32BE(buf, position - 4);

  const numTracks      = Math.floor((trackEnd - trackBase) / 6);
  const totInstruments = (instrEnd - instrBase) >> 5;
  const totWaveforms   = (waveEnd - waveStart) >> 5;
  const numPatRows     = Math.floor((patEnd - patStart) / 5);
  const numPatPtrs     = Math.floor((ppEnd - ppBase) / 4);

  console.log(`━━━ ${name} ━━━  file=${buf.length}  position=${position}`);
  console.log(`  trackBase=0x${trackBase.toString(16).padStart(8,'0')}  trackEnd=0x${trackEnd.toString(16).padStart(8,'0')}  numTracks=${numTracks}`);
  console.log(`  instrBase=0x${instrBase.toString(16).padStart(8,'0')}  instrEnd=0x${instrEnd.toString(16).padStart(8,'0')}  totInstruments=${totInstruments}`);
  console.log(`  waveStart=0x${waveStart.toString(16).padStart(8,'0')}  waveEnd=0x${waveEnd.toString(16).padStart(8,'0')}  totWaveforms=${totWaveforms}`);
  console.log(`  patStart=0x${patStart.toString(16).padStart(8,'0')}   patEnd=0x${patEnd.toString(16).padStart(8,'0')}    numPatRows=${numPatRows}`);
  console.log(`  ppBase=0x${ppBase.toString(16).padStart(8,'0')}     ppEnd=0x${ppEnd.toString(16).padStart(8,'0')}      numPatPtrs=${numPatPtrs}`);
}
