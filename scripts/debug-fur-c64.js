const fs = require('fs');
const zlib = require('zlib');

const filename = '/Users/spot/Code/DEViLBOX/public/data/songs/furnace/c64/C64 junk.fur';
const data = fs.readFileSync(filename);

let decompressed;
try {
  decompressed = zlib.inflateSync(data.slice(0));
} catch(e) {
  decompressed = data;
}

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
        console.log('  Found C64 feature at', pos, 'len', featLen);
        const c64Start = pos + 4;
        
        const rawBytes = [];
        for (let j = 0; j < Math.min(featLen, 15); j++) {
          rawBytes.push(decompressed.readUInt8(c64Start + j).toString(16).padStart(2, '0'));
        }
        console.log('    Raw bytes:', rawBytes.join(' '));
        
        const c64f1 = decompressed.readUInt8(c64Start);
        const c64f2 = decompressed.readUInt8(c64Start + 1);
        const adsr1 = decompressed.readUInt8(c64Start + 2);
        const adsr2 = decompressed.readUInt8(c64Start + 3);
        const duty = decompressed.readUInt16LE(c64Start + 4);
        
        console.log('    Wave: tri=' + !!(c64f1 & 1) + ' saw=' + !!(c64f1 & 2) + ' pulse=' + !!(c64f1 & 4) + ' noise=' + !!(c64f1 & 8));
        console.log('    ADSR: A=' + ((adsr1 >> 4) & 0x0F) + ' D=' + (adsr1 & 0x0F) + ' S=' + ((adsr2 >> 4) & 0x0F) + ' R=' + (adsr2 & 0x0F));
        console.log('    Duty:', duty, '(hex:', duty.toString(16), ')');
        
        pos = pos + 4 + featLen;
      } else if (featCode === 'MA') {
        // Standard macros - Reference: instrument.cpp:1816 readFeatureMA
        console.log('  Found macro data (MA) at', pos, 'len', featLen);
        const macroDataEnd = pos + 4 + featLen;
        let macroPos = pos + 4;
        
        const macroHeaderLen = decompressed.readUInt16LE(macroPos);
        macroPos += 2;
        console.log('    Macro header len:', macroHeaderLen);
        
        while (macroPos < macroDataEnd) {
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
          
          // Macro code names from Furnace
          const macroNames = ['vol', 'arp', 'duty', 'wave', 'pitch', 'ex1', 'ex2', 'ex3'];
          const macroName = macroNames[macroCode] || ('code' + macroCode);
          
          macroPos = macroStartPos + macroHeaderLen;
          
          // Read macro data
          const data = [];
          for (let j = 0; j < len && macroPos < macroDataEnd; j++) {
            if (wordSize === 0) { data.push(decompressed.readUInt8(macroPos)); macroPos += 1; }
            else if (wordSize === 1) { data.push(decompressed.readInt8(macroPos)); macroPos += 1; }
            else if (wordSize === 2) { data.push(decompressed.readInt16LE(macroPos)); macroPos += 2; }
            else { data.push(decompressed.readInt32LE(macroPos)); macroPos += 4; }
          }
          
          console.log('    ' + macroName + ': len=' + len + ' loop=' + loop + ' wordSize=' + wordSize);
          if (data.length > 0) {
            console.log('      Data:', data.slice(0, 16).join(', ') + (data.length > 16 ? '...' : ''));
          }
        }
        
        pos = macroDataEnd;
      } else if (featCode === 'SL') {
        // Standard linked macros (wave macro for C64)
        console.log('  Found linked macro (SL) at', pos, 'len', featLen);
        pos = pos + 4 + featLen;
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
