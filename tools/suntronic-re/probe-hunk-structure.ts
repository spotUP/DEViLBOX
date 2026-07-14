/**
 * probe-hunk-structure.ts — inspect the exact hunk/reloc byte structure of a
 * SunTronic V1.3 module so the Phase 4 hunk WRITER can reproduce it byte-exact.
 *
 * Usage: npx tsx tools/suntronic-re/probe-hunk-structure.ts [module]
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { CORPUS_DIR, u32BE } from './suntronicLib';

function main(): void {
  const name = process.argv[2] ?? 'mule.src';
  const buf = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  console.log(`[probe] ${name} length=${buf.length}`);
  let pos = 0;
  const rd = (): number => { const v = u32BE(buf, pos); pos += 4; return v; };
  const hdr = rd();
  console.log(`  header 0x${hdr.toString(16)} @0`);
  // resident libs
  while (u32BE(buf, pos) !== 0) { const n = rd(); pos += n * 4; }
  pos += 4; // null term
  const tableSize = rd(), first = rd(), last = rd();
  console.log(`  tableSize=${tableSize} first=${first} last=${last}`);
  for (let i = 0; i < tableSize; i++) {
    const v = rd();
    console.log(`  size[${i}] memFlags=${v >>> 30} sizeLongs=${v & 0x3fffffff} (=${(v & 0x3fffffff) * 4} bytes)`);
  }
  // hunks
  let guard = 0;
  while (pos < buf.length && guard++ < 20) {
    const off = pos;
    const type = rd() & 0x3fffffff;
    if (type === 0x3e9 || type === 0x3ea) {
      const longs = rd();
      console.log(`  @0x${off.toString(16)} HUNK_${type === 0x3e9 ? 'CODE' : 'DATA'} longs=${longs} (=${longs * 4} bytes) payload@0x${pos.toString(16)}`);
      pos += longs * 4;
    } else if (type === 0x3ec) {
      console.log(`  @0x${off.toString(16)} HUNK_RELOC32`);
      for (;;) {
        const count = rd();
        if (count === 0) { console.log(`    block-terminator 0`); break; }
        const target = rd();
        const offs: number[] = [];
        for (let i = 0; i < count; i++) offs.push(rd());
        console.log(`    block count=${count} target=${target} offs=[${offs.map((o) => '0x' + o.toString(16)).join(',')}]`);
      }
    } else if (type === 0x3f2) {
      console.log(`  @0x${off.toString(16)} HUNK_END`);
    } else {
      console.log(`  @0x${off.toString(16)} type 0x${type.toString(16)} — stop`);
      break;
    }
  }
  console.log(`  final pos=0x${pos.toString(16)} (buf.length=0x${buf.length.toString(16)})`);
}

main();
