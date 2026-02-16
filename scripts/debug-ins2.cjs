const fs = require('fs');
const zlib = require('zlib');

const data = fs.readFileSync('/Users/spot/Code/DEViLBOX/public/data/songs/furnace/c64/C64 junk.fur');
const decompressed = zlib.inflateSync(data);

console.log('File size:', decompressed.length, 'bytes');
console.log('Version:', decompressed[20] | (decompressed[21] << 8));

// Find all INS2 blocks
const ins2Offsets = [];
for (let i = 0; i < decompressed.length - 4; i++) {
  if (decompressed.slice(i, i + 4).toString() === 'INS2') {
    ins2Offsets.push(i);
  }
}
console.log('Found', ins2Offsets.length, 'INS2 blocks at:', ins2Offsets);

// Parse each INS2 block
ins2Offsets.forEach((offset, idx) => {
  console.log(`\n=== INS2 block ${idx} at offset ${offset} ===`);
  let pos = offset + 4; // Skip 'INS2'
  const blockSize = decompressed.readUInt32LE(pos);
  pos += 4;
  const insVersion = decompressed.readUInt16LE(pos);
  pos += 2;
  const insType = decompressed.readUInt16LE(pos);
  pos += 2;
  console.log('  blockSize:', blockSize, 'insVersion:', insVersion, 'insType:', insType);
  
  // Read features until EN
  const endPos = offset + 8 + blockSize;
  while (pos < endPos) {
    const featCode = String.fromCharCode(decompressed[pos], decompressed[pos + 1]);
    pos += 2;
    if (featCode === 'EN' || featCode === '\0\0') {
      console.log('  Feature: EN (end)');
      break;
    }
    const featLen = decompressed.readUInt16LE(pos);
    pos += 2;
    console.log(`  Feature: "${featCode}" len=${featLen}`);
    
    if (featCode === 'NA') {
      // Name - null-terminated string
      let name = '';
      for (let i = pos; i < pos + featLen && decompressed[i] !== 0; i++) {
        name += String.fromCharCode(decompressed[i]);
      }
      console.log(`    Name: "${name}"`);
    }
    
    if (featCode === '64') {
      // C64 data
      const c64f1 = decompressed[pos];
      const c64f2 = decompressed[pos + 1];
      const adsr1 = decompressed[pos + 2];
      const adsr2 = decompressed[pos + 3];
      const duty = decompressed.readUInt16LE(pos + 4);
      console.log(`    c64f1=0x${c64f1.toString(16)}, c64f2=0x${c64f2.toString(16)}`);
      console.log(`    triOn=${!!(c64f1&1)}, sawOn=${!!(c64f1&2)}, pulseOn=${!!(c64f1&4)}, noiseOn=${!!(c64f1&8)}`);
      console.log(`    ADSR: a=${adsr1>>4} d=${adsr1&0xf} s=${adsr2>>4} r=${adsr2&0xf}`);
      console.log(`    duty=${duty}`);
    }
    
    if (featCode === 'MA') {
      // Macro data - check for wave macro
      const macroHeaderLen = decompressed.readUInt16LE(pos);
      console.log(`    macroHeaderLen=${macroHeaderLen}`);
      let mPos = pos + 2;
      const macroEnd = pos + featLen;
      while (mPos < macroEnd) {
        const macroCode = decompressed[mPos];
        if (macroCode === 255) break;
        const macroLen = decompressed[mPos + 1];
        const macroType = macroCode === 3 ? 'WAVE' : `code${macroCode}`;
        console.log(`      Macro: ${macroType} len=${macroLen}`);
        if (macroCode === 3 && macroLen > 0) {
          // Wave macro - show first few values
          const wordSize = (decompressed[mPos + 5] >> 6) & 3;
          let dataPos = mPos + macroHeaderLen;
          const waveVals = [];
          for (let i = 0; i < Math.min(macroLen, 8); i++) {
            if (wordSize === 0) {
              waveVals.push(decompressed[dataPos + i]);
            } else if (wordSize === 1) {
              waveVals.push(decompressed.readInt16LE(dataPos + i * 2));
            } else {
              waveVals.push(decompressed.readInt32LE(dataPos + i * 4));
            }
          }
          console.log(`        Wave values: ${waveVals.join(', ')}`);
        }
        // Jump to next macro (header + data)
        const wordSize = (decompressed[mPos + 5] >> 6) & 3;
        const dataSize = wordSize === 0 ? 1 : wordSize === 1 ? 2 : 4;
        mPos += macroHeaderLen + (macroLen * dataSize);
      }
    }
    
    pos += featLen;
  }
});
