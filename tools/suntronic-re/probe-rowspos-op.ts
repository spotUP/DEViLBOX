/** probe-rowspos-op.ts — scan each module's h1 for every `move.b #imm,$31(a2)` (0x157c
 * <imm word> 0x0031) that sets the rows/position ($31), and dump the byte the parser
 * reads at REF_ROWSPOS_OP+deltaA. Goal: find whether ballblaser sets $31=17 somewhere
 * the parser's single fixed-offset read misses. */
import { readFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const CORPUS = resolve(REPO, 'public/data/songs/formats/SUNTronicTunes');

const u16 = (b: Uint8Array, o: number): number => ((b[o] ?? 0) << 8) | (b[o + 1] ?? 0);

for (const name of ['gliders.src', 'ballblaser.src']) {
  const score = parseSunTronicV13Score(new Uint8Array(readFileSync(join(CORPUS, name))));
  const h1 = score.h1;
  // eslint-disable-next-line no-console
  console.log(`== ${name} (h1 len 0x${h1.length.toString(16)}) ==`);
  // all move.b #imm,$31(a2): 0x157c <imm-word> 0x0031  (imm byte at +3)
  const hits: string[] = [];
  for (let o = 0; o + 6 <= h1.length; o += 2) {
    if (u16(h1, o) === 0x157c && u16(h1, o + 4) === 0x0031) {
      hits.push(`0x${o.toString(16)}:imm=${h1[o + 3]}`);
    }
  }
  // eslint-disable-next-line no-console
  console.log(`  move.b #imm,$31(a2) hits: ${hits.join('  ') || 'none'}`);
  // also scan any `#imm,$31(aN)` regardless of register: 0x1?7c ... 0x0031
  const anyReg: string[] = [];
  for (let o = 0; o + 6 <= h1.length; o += 2) {
    const w = u16(h1, o);
    if ((w & 0xf0ff) === 0x107c && (w & 0x0e00) === 0x0000 && u16(h1, o + 4) === 0x0031) {
      anyReg.push(`0x${o.toString(16)}:op${w.toString(16)}:imm=${h1[o + 3]}`);
    }
  }
  // eslint-disable-next-line no-console
  console.log(`  (broad #imm,$31 scan: ${anyReg.join('  ') || 'none'})`);
}
