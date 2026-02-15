const fs = require('fs');
const zlib = require('zlib');
const data = fs.readFileSync('/Users/spot/Code/DEViLBOX/public/data/songs/furnace/c64/C64 junk.fur');
const dec = zlib.inflateSync(data);
const pos = 1261; // C64 feature at 1261
console.log('Instrument 6 C64 feature bytes:');
for (let i = 0; i < 15; i++) {
  const b = dec.readUInt8(pos + i);
  console.log('  Byte', i, ':', '0x' + b.toString(16).padStart(2, '0'), '=', b);
}
const c64f1 = dec.readUInt8(pos);
const c64f2 = dec.readUInt8(pos + 1);
console.log('\nc64f1 (0x' + c64f1.toString(16) + ') binary:', c64f1.toString(2).padStart(8, '0'));
console.log('  bit 0 triOn:', !!(c64f1 & 1));
console.log('  bit 1 sawOn:', !!(c64f1 & 2));
console.log('  bit 2 pulseOn:', !!(c64f1 & 4));
console.log('  bit 3 noiseOn:', !!(c64f1 & 8));
console.log('  bit 4 toFilter:', !!(c64f1 & 16));
console.log('  bit 6 initFilter:', !!(c64f1 & 64));
console.log('\nc64f2 (0x' + c64f2.toString(16) + ') binary:', c64f2.toString(2).padStart(8, '0'));
console.log('  bit 0 lp:', !!(c64f2 & 1));
console.log('  bit 1 hp:', !!(c64f2 & 2));
console.log('  bit 2 bp:', !!(c64f2 & 4));
console.log('  bit 3 ch3off:', !!(c64f2 & 8));
