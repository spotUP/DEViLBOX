// Decode a UADE --write-audio dump (uade_osc_0 format) into per-channel Paula
// register writes. Frame = int32 tdelta (BE) + 8-byte union. If (tdelta & 0x80000000):
// paula event {int8 channel, int8 event_type, uint16 value BE}; else 4x int16 output BE.
// Register types: VOL=1 PER=2 DAT=3 LEN=4 LCH=5 LCL=6 LOOP=7 OUTPUT=8 START_BUFFER=9.
import fs from 'fs';
const buf = fs.readFileSync(process.argv[2]);
const PET = {1:'VOL',2:'PER',3:'DAT',4:'LEN',5:'LCH',6:'LCL',7:'LOOP',8:'OUTPUT',9:'START'};
let pos = 16; // skip header
const events = []; // {t, ch, type, val}
let t = 0;
while (pos + 12 <= buf.length) {
  const tdelta = buf.readUInt32BE(pos); pos += 4;
  const isEvent = (tdelta & 0x80000000) !== 0;
  const dt = tdelta & 0x7fffffff;
  t += dt;
  if (isEvent) {
    const ch = buf.readInt8(pos);
    const et = buf.readInt8(pos + 1);
    const val = buf.readUInt16BE(pos + 2);
    events.push({ t, ch, type: PET[et] || et, val });
  }
  pos += 8;
}
// Summarize: for LEN/VOL/PER per channel, distinct values + count
const reg = ['LEN','VOL','PER'];
for (let ch = 0; ch < 4; ch++) {
  console.log(`--- channel ${ch} ---`);
  for (const r of reg) {
    const vals = events.filter(e => e.ch === ch && e.type === r).map(e => e.val);
    if (!vals.length) { console.log(`  ${r}: (none)`); continue; }
    const uniq = [...new Set(vals)].sort((a,b)=>a-b);
    console.log(`  ${r}: n=${vals.length} range=[${uniq[0]}..${uniq[uniq.length-1]}] distinct=${uniq.length} sample=${uniq.slice(0,8).join(',')}`);
  }
}
console.log(`total events=${events.length}`);
