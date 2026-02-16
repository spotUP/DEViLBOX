const fs = require('fs');
const zlib = require('zlib');

const data = fs.readFileSync('/Users/spot/Code/DEViLBOX/public/data/songs/furnace/c64/C64 junk.fur');
const decompressed = zlib.inflateSync(data);

console.log('File size:', decompressed.length, 'bytes');
console.log('Version:', decompressed[20] | (decompressed[21] << 8));

// Find PATR or PATN blocks (patterns)
let patternBlocks = [];
for (let i = 0; i < decompressed.length - 4; i++) {
  const magic = String.fromCharCode(
    decompressed[i], decompressed[i+1], decompressed[i+2], decompressed[i+3]
  );
  if (magic === 'PATR' || magic === 'PATN') {
    patternBlocks.push({ offset: i, magic });
  }
}

console.log('\nFound', patternBlocks.length, 'pattern blocks');

// Parse first few patterns
patternBlocks.slice(0, 5).forEach((pb, idx) => {
  console.log(`\n=== Pattern block ${idx} at offset ${pb.offset} (${pb.magic}) ===`);
  let pos = pb.offset + 4;
  
  if (pb.magic === 'PATN') {
    // New pattern format
    const blockSize = decompressed.readUInt32LE(pos); pos += 4;
    const subsong = decompressed[pos++];
    const channel = decompressed[pos++];
    const patIdx = decompressed.readUInt16LE(pos); pos += 2;
    console.log(`  subsong=${subsong} channel=${channel} patIdx=${patIdx}`);
    
    // Count non-empty rows
    const patternName = '';
    let noteCount = 0;
    const endPos = pb.offset + 8 + blockSize;
    while (pos < endPos - 8) {
      const note = decompressed[pos];
      const octave = decompressed[pos + 1];
      const inst = decompressed.readInt16LE(pos + 2);
      const vol = decompressed.readInt16LE(pos + 4);
      pos += 6;
      
      if (note > 0 || inst >= 0 || vol >= 0) {
        noteCount++;
        if (noteCount <= 5) {
          console.log(`    Row: note=${note} octave=${octave} inst=${inst} vol=${vol}`);
        }
      }
    }
    console.log(`  Total events: ${noteCount}`);
  } else if (pb.magic === 'PATR') {
    // Old pattern format
    const blockSize = decompressed.readUInt32LE(pos); pos += 4;
    const channel = decompressed[pos++];
    const patIdx = decompressed.readUInt16LE(pos); pos += 2;
    const subsong = decompressed[pos++]; // v95+
    console.log(`  channel=${channel} patIdx=${patIdx} subsong=${subsong}`);
    
    // Count rows with notes
    let noteCount = 0;
    const endPos = pb.offset + 8 + blockSize;
    while (pos < endPos) {
      const note = decompressed[pos];
      const octave = decompressed[pos + 1];
      const inst = decompressed.readInt16LE(pos + 2);
      const vol = decompressed.readInt16LE(pos + 4);
      pos += 6 + (4 * 8); // 6 core + 8 effect columns × 4 bytes
      
      if (note > 0 || inst >= 0) {
        noteCount++;
        if (noteCount <= 5) {
          console.log(`    Row: note=${note} octave=${octave} inst=${inst} vol=${vol}`);
        }
      }
    }
    console.log(`  Total note events: ${noteCount}`);
  }
});

// Check subsong orders
console.log('\nSearching for SNG2/SONG blocks...');
for (let i = 0; i < decompressed.length - 4; i++) {
  const magic = String.fromCharCode(
    decompressed[i], decompressed[i+1], decompressed[i+2], decompressed[i+3]
  );
  if (magic === 'SNG2' || magic === 'SONG') {
    console.log(`Found ${magic} at offset ${i}`);
    let pos = i + 4;
    const blockSize = decompressed.readUInt32LE(pos); pos += 4;
    console.log(`  blockSize=${blockSize}`);
    
    // Skip to orders section (varies by version)
    // For old format embedded in INFO, orders come after header
    break;
  }
}
