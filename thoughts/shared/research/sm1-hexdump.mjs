// Dump the offset-table region for both files, and search for likely wave data.
import fs from 'fs';

const files = [
  { name: 'myfunnymazea', path: '/Users/spot/Code/DEViLBOX/public/data/songs/sidmon-1/myfunnymazea.sid', position: 4700 },
  { name: 'defjam', path: '/Users/spot/Code/DEViLBOX/server/data/modland-cache/files/pub__modules__SidMon 1__Orpheus__defjam.sid', position: 4700 },
];

function rd32BE(buf, off) { return ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0; }

for (const { name, path, position } of files) {
  const buf = fs.readFileSync(path);
  console.log(`\n━━━ ${name} (${buf.length} bytes, position=${position}) ━━━`);
  console.log(`  44-byte offset block at file[position-44..position-1]:`);
  for (let off = -44; off < 0; off += 4) {
    const v = rd32BE(buf, position + off);
    console.log(`    position${off.toString().padStart(3)} (file ${position + off}): 0x${v.toString(16).padStart(8,'0')} = ${v}`);
  }

  // Scan the file in 32-byte chunks and count non-zero bytes; find regions that look like wave data.
  console.log(`  Scanning file for 32-byte blocks with many non-zero bytes (waveform candidates):`);
  const candidates = [];
  for (let b = 0; b < buf.length - 32; b += 32) {
    let nz = 0, absMax = 0;
    for (let k = 0; k < 32; k++) {
      const s = buf[b + k] < 128 ? buf[b + k] : buf[b + k] - 256;
      if (s !== 0) nz++;
      if (Math.abs(s) > absMax) absMax = Math.abs(s);
    }
    if (nz >= 28 && absMax >= 20 && absMax <= 128) {
      candidates.push({ off: b, nz, absMax });
    }
  }
  console.log(`    Found ${candidates.length} 32-byte candidates.`);
  if (candidates.length > 0 && candidates.length < 200) {
    // Show runs (consecutive offsets)
    const runs = [];
    let cur = { start: candidates[0].off, end: candidates[0].off + 32, count: 1 };
    for (let i = 1; i < candidates.length; i++) {
      if (candidates[i].off === cur.end) { cur.end += 32; cur.count++; }
      else { runs.push(cur); cur = { start: candidates[i].off, end: candidates[i].off + 32, count: 1 }; }
    }
    runs.push(cur);
    console.log(`    Contiguous runs of wave-like data:`);
    for (const r of runs.slice(0, 10)) {
      console.log(`      file ${r.start}..${r.end} (${r.count} × 32-byte blocks)`);
    }
  }
}
