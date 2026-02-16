/**
 * Debug script to examine volume macros in a Furnace .fur file
 */
const fs = require('fs');
const zlib = require('zlib');

const filename = process.argv[2] || '/Users/spot/Code/DEViLBOX/public/data/songs/furnace/c64/FairlightC64.fur';
const data = fs.readFileSync(filename);

let decompressed;
try {
  decompressed = zlib.inflateSync(data.slice(0));
} catch(e) {
  decompressed = data;
}

console.log('File:', filename);
console.log('File size:', data.length);
console.log('Decompressed size:', decompressed.length);

// Find all INS2 blocks
let instCount = 0;
for (let i = 0; i < decompressed.length - 8; i++) {
  const marker = decompressed.subarray(i, i + 4).toString();
  if (marker === 'INS2') {
    instCount++;
    const blockSize = decompressed.readUInt32LE(i + 4);
    console.log('\n=== Instrument', instCount, 'at offset', i, 'size', blockSize, '===');
    
    const blockStart = i + 8;
    const blockEnd = blockStart + blockSize;
    
    const insType = decompressed.readUInt8(blockStart + 1);
    console.log('  Type:', insType, '(3=C64)');
    
    // Parse feature blocks within INS2
    let pos = blockStart + 4;
    while (pos < blockEnd - 4) {
      const featCode = decompressed.subarray(pos, pos + 2).toString();
      const featLen = decompressed.readUInt16LE(pos + 2);
      
      if (featCode === 'NA') {
        const name = decompressed.subarray(pos + 4, pos + 4 + featLen).toString();
        console.log('  Name:', name);
        pos = pos + 4 + featLen;
      } else if (featCode === '64') {
        const c64Start = pos + 4;
        const c64f1 = decompressed.readUInt8(c64Start);
        const adsr1 = decompressed.readUInt8(c64Start + 2);
        const adsr2 = decompressed.readUInt8(c64Start + 3);
        console.log('    Wave: tri=' + !!(c64f1 & 1) + ' saw=' + !!(c64f1 & 2) + ' pulse=' + !!(c64f1 & 4) + ' noise=' + !!(c64f1 & 8));
        console.log('    ADSR: A=' + ((adsr1 >> 4) & 0x0F) + ' D=' + (adsr1 & 0x0F) + ' S=' + ((adsr2 >> 4) & 0x0F) + ' R=' + (adsr2 & 0x0F));
        pos = pos + 4 + featLen;
      } else if (featCode === 'MA') {
        console.log('  Found macro data (MA) at', pos, 'len', featLen);
        const macroDataEnd = pos + 4 + featLen;
        let macroPos = pos + 4;
        
        const macroHeaderLen = decompressed.readUInt16LE(macroPos);
        macroPos += 2;
        
        while (macroPos < macroDataEnd && macroPos < pos + 4 + featLen - 2) {
          const macroStartPos = macroPos;
          const macroCode = decompressed.readUInt8(macroPos);
          if (macroCode === 255) break;
          
          const len = decompressed.readUInt8(macroPos + 1);
          const loop = decompressed.readUInt8(macroPos + 2);
          const rel = decompressed.readUInt8(macroPos + 3);
          const mode = decompressed.readUInt8(macroPos + 4);
          const typeByte = decompressed.readUInt8(macroPos + 5);
          const delay = decompressed.readUInt8(macroPos + 6);
          const speed = decompressed.readUInt8(macroPos + 7);
          
          const wordSize = (typeByte >> 6) & 0x03;
          const macroNames = ['vol', 'arp', 'duty', 'wave', 'pitch', 'ex1', 'ex2', 'ex3'];
          const macroName = macroNames[macroCode] || ('code' + macroCode);
          
          macroPos = macroStartPos + macroHeaderLen;
          
          const dataVals = [];
          for (let j = 0; j < len && macroPos < macroDataEnd; j++) {
            if (wordSize === 0) { dataVals.push(decompressed.readUInt8(macroPos)); macroPos += 1; }
            else if (wordSize === 1) { dataVals.push(decompressed.readInt8(macroPos)); macroPos += 1; }
            else if (wordSize === 2) { dataVals.push(decompressed.readInt16LE(macroPos)); macroPos += 2; }
            else { dataVals.push(decompressed.readInt32LE(macroPos)); macroPos += 4; }
          }
          
          console.log('    ' + macroName + ': len=' + len + ' loop=' + (loop === 255 ? -1 : loop) + ' rel=' + (rel === 255 ? -1 : rel) + ' speed=' + speed);
          if (dataVals.length > 0) {
            console.log('      Data:', dataVals.slice(0, 30).join(', ') + (dataVals.length > 30 ? '...' : ''));
            if (macroCode === 0) {
              const endVal = dataVals[dataVals.length - 1];
              console.log('      >>> VOL MACRO: starts at ' + dataVals[0] + ', ends at ' + endVal + ', loop=' + (loop === 255 ? 'NONE' : loop));
              if (loop === 255 && endVal === 0) {
                console.log('      >>> VOLUME DECAYS TO ZERO - this creates decay envelope effect!');
              }
            }
          }
        }
        
        pos = macroDataEnd;
      } else if (/^[A-Z0-9]{2}$/.test(featCode)) {
        pos = pos + 4 + featLen;
      } else {
        pos++;
      }
    }
    
    i = blockEnd - 1;
  }
}

console.log('\nTotal instruments:', instCount);
