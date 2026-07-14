/** probe-ciaword.ts — walk each voice's note-opcode stream for the FIRST few rows
 * and dump every control opcode + operand, so we can read the module-defined CIA
 * tempo word (opcode 0x8e) and speed (0x98/0x8f) directly instead of sweeping. The
 * CIA word converts to a sample period: PAL CIA clock 709379 Hz → samples =
 * word/709379*44100. NOT committed. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { CORPUS_DIR } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';

const CIA_HZ = 709379, SR = 44100;
const name = process.argv[2] ?? 'gliders.src';
const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
const score = parseSunTronicV13Score(data);
const h1 = score.h1;
const sub = score.subsongs[0];

const s8 = (b: number): number => (b << 24) >> 24;
for (let ch = 0; ch < 4; ch++) {
  let a1 = sub.entries[0].trackPtrs[ch];
  const ops: string[] = [];
  for (let guard = 0; guard < 200 && ops.length < 24; guard++) {
    const d0 = h1[a1++] ?? 0;
    if (d0 === 0x00) { ops.push('|END'); break; }
    if (d0 < 0x80) { ops.push(`sel${d0}`); continue; }
    if (d0 >= 0xb8) { ops.push(`NOTE${(~d0) & 0xff}`); continue; }
    // control opcode — decode operand length like controlOpcode
    const opname = `op${d0.toString(16)}`;
    let operand = '';
    switch (d0) {
      case 0x8e: { const w = ((h1[a1] << 8) | h1[a1 + 1]); a1 += 2;
        operand = `=CIA 0x${w.toString(16)} → ${(w / CIA_HZ * SR).toFixed(1)}samp`; break; }
      case 0x9b: { const w = s8(h1[a1]) * 256 + h1[a1 + 1]; a1 += 2; operand = `=${w}`; break; }
      case 0x8d: case 0x93: case 0x97: a1 += 2; operand = '=<2b>'; break;
      case 0x98: operand = `=speed ${h1[a1]}`; a1 += 1; break;
      case 0x8f: operand = `=vspeed ${h1[a1]}`; a1 += 1; break;
      case 0x9c: case 0x9a: case 0x99: case 0x94: case 0x92: case 0x91:
      case 0x90: case 0x8c: case 0x8b: a1 += 1; operand = `=${h1[a1 - 1]}`; break;
      default: break;
    }
    ops.push(opname + operand);
  }
  console.log(`ch${ch}: ${ops.join('  ')}`);
}
