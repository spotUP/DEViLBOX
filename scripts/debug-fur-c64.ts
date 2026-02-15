import * as fs from 'fs';
import * as zlib from 'zlib';

const filename = '/Users/spot/Code/DEViLBOX/public/data/songs/furnace/c64/C64 junk.fur';
const data = fs.readFileSync(filename);

// Furnace files are zlib compressed
let decompressed: Buffer;
try {
  decompressed = zlib.inflateSync(data.slice(0));
} catch {
  decompressed = data;
}

console.log('File size:', data.length);
console.log('Decompressed size:', decompressed.length);

// Find -FUR- magic
let offset = 0;
while (offset < decompressed.length - 4) {
  if (decompressed.readUInt32BE(offset) === 0x2d465552) { // -FUR
    console.log('Found -FUR- at offset:', offset);
    break;
  }
  offset++;
}

// Look for INST blocks
let instOffset = 0;
let instCount = 0;
while (instOffset < decompressed.length - 4) {
  if (decompressed.subarray(instOffset, instOffset + 4).toString() === 'INST') {
    instCount++;
    const blockSize = decompressed.readUInt32LE(instOffset + 4);
    console.log(`\n=== Instrument ${instCount} at offset ${instOffset}, block size ${blockSize} ===`);
    
    // Read instrument data
    let pos = instOffset + 8;
    const insType = decompressed.readUInt8(pos + 1); // type at INS2 format position
    console.log('  Type byte at pos+1:', insType);
    
    // Look for '64' feature block which contains C64 data
    const blockEnd = instOffset + 8 + blockSize;
    let featurePos = pos + 4; // Skip INS2 header
    while (featurePos < blockEnd - 4) {
      const featCode = decompressed.subarray(featurePos, featurePos + 2).toString();
      if (featCode === '64') {
        const featLen = decompressed.readUInt16LE(featurePos + 2);
        console.log(`  Found '64' feature at offset ${featurePos}, len=${featLen}`);
        
        // Parse C64 data
        const c64Start = featurePos + 4;
        const c64f1 = decompressed.readUInt8(c64Start);
        const c64f2 = decompressed.readUInt8(c64Start + 1);
        const adsr1 = decompressed.readUInt8(c64Start + 2);
        const adsr2 = decompressed.readUInt8(c64Start + 3);
        const duty = decompressed.readUInt16LE(c64Start + 4);
        
        const triOn = !!(c64f1 & 1);
        const sawOn = !!(c64f1 & 2);
        const pulseOn = !!(c64f1 & 4);
        const noiseOn = !!(c64f1 & 8);
        const attack = (adsr1 >> 4) & 0x0F;
        const decay = adsr1 & 0x0F;
        const sustain = (adsr2 >> 4) & 0x0F;
        const release = adsr2 & 0x0F;
        
        console.log(`  Wave: tri=${triOn} saw=${sawOn} pulse=${pulseOn} noise=${noiseOn}`);
        console.log(`  ADSR: A=${attack} D=${decay} S=${sustain} R=${release}`);
        console.log(`  Duty: ${duty}`);
        console.log(`  Flags2: ringMod=${!!(c64f2 & 64)} oscSync=${!!(c64f2 & 128)}`);
        
        break;
      }
      featurePos++;
    }
    
    instOffset = blockEnd;
  } else {
    instOffset++;
  }
}

console.log('\nTotal instruments found:', instCount);
