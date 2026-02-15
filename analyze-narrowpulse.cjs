const fs = require('fs');
const zlib = require('zlib');

console.log('Starting analysis...');
const data = fs.readFileSync('public/data/songs/furnace/c64/C64 junk.fur');
console.log('Read', data.length, 'bytes');
const decompressed = zlib.unzipSync(data);
console.log('Decompressed to', decompressed.length, 'bytes');

// Find magic markers
for (let i = 0; i < decompressed.length - 4; i++) {
  const magic = decompressed.toString('ascii', i, i + 4);
  if (magic === 'INST' || magic === 'INS2' || magic === 'SN2P') {
    console.log('Found', magic, 'at offset', i);
  }
}

// Find all INS2 blocks directly
const ins2Offsets = [877, 957, 1057, 1115, 1174, 1233];
for (let i = 0; i < ins2Offsets.length; i++) {
  const offset = ins2Offsets[i];
  const blockSize = decompressed.readUInt32LE(offset + 4);
  const insType = decompressed.readUInt8(offset + 8);
  console.log(`\nInst ${i}: type=${insType} blockSize=${blockSize}`);
  
  // Hex dump first 100 bytes of block
  const blockData = decompressed.slice(offset + 8, offset + 8 + Math.min(blockSize, 150));
  for (let j = 0; j < blockData.length; j += 16) {
    const line = blockData.slice(j, j + 16);
    const hex = Array.from(line).map(b => b.toString(16).padStart(2, '0')).join(' ');
    const ascii = Array.from(line).map(b => (b >= 32 && b < 127) ? String.fromCharCode(b) : '.').join('');
    console.log(`  ${j.toString(16).padStart(4, '0')}: ${hex.padEnd(48)} ${ascii}`);
  }
}
