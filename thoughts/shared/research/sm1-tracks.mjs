// Inspect track entries of myfunnymazea vs defjam.
// Each track entry is 6 bytes: u32 pattern-idx + 2 bytes (1 signed transpose + 1 skip).
import fs from 'fs';

const files = [
  { name: 'myfunnymazea (BROKEN)', path: '/Users/spot/Code/DEViLBOX/public/data/songs/sidmon-1/myfunnymazea.sid', position: 4700, trackBase: 0x24 },
  { name: 'defjam        (WORKS)', path: '/Users/spot/Code/DEViLBOX/server/data/modland-cache/files/pub__modules__SidMon 1__Orpheus__defjam.sid', position: 4700, trackBase: 0x24 },
];

function rd32BE(buf, off) { return ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0; }

for (const { name, path, position, trackBase } of files) {
  const buf = fs.readFileSync(path);
  console.log(`\n━━━ ${name} ━━━`);

  // Voice track starts: 4 × 32-bit values at position-44..position-28 (raw in file offset)
  const voiceTracks = [];
  for (let v = 0; v < 4; v++) {
    const raw = rd32BE(buf, position - 44 + v * 4);
    const idx = Math.floor((raw - trackBase) / 6);
    voiceTracks.push({ raw: `0x${raw.toString(16)}`, idx });
  }
  console.log(`  voiceTrackStart = [${voiceTracks.map(v => `${v.raw}→idx${v.idx}`).join(', ')}]`);

  // Dump first 8 tracks — each 6 bytes: pattern (u32 BE) + transpose (s8 at [5])
  const trackDataOffset = position + trackBase;
  console.log(`  Tracks (first 8 of each voice — every 4th from the voice's start):`);
  for (let v = 0; v < 4; v++) {
    const start = voiceTracks[v].idx;
    const entries = [];
    for (let t = 0; t < 8; t++) {
      const off = trackDataOffset + (start + t) * 6;
      if (off + 6 > buf.length) break;
      const pattern = rd32BE(buf, off);
      const transpose = buf[off + 5] < 128 ? buf[off + 5] : buf[off + 5] - 256;
      entries.push(`pat=${pattern.toString().padStart(4)} tr=${transpose}`);
    }
    console.log(`    voice${v} (start=${start}): ${entries.join('  ')}`);
  }
}
