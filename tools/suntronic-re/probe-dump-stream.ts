/** Dump the raw hunk#1 note-stream bytes native reads for one voice, decoding the
 *  GNN opcode structure (0x00 end, 0x01-0x7f select, 0x80-0xb7 control, 0xb8-0xff
 *  pitch). Reveals any opcode in the 0x80-0x8a / 0x9d-0xb7 default-gap (consumes 0
 *  operand bytes in native -> stream desync = the slide/garbage bug). */
import { readFileSync } from 'fs'; import { join } from 'path';
import { CORPUS_DIR } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
const name = process.argv[2] ?? 'suntronic-k3.src';
const V = parseInt(process.argv[3] ?? '0', 10);
const nBytes = parseInt(process.argv[4] ?? '64', 10);
const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
const score = parseSunTronicV13Score(data);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const player: any = new (SunTronicPlayer as any)(score);
const h1: Uint8Array = player.h1;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const seq: any[] = player.sequence;
const cur0: number = seq[0].trackPtrs[V] >>> 0;
console.log(`${name} voice${V} startCursor=0x${cur0.toString(16)} h1.len=${h1.length}`);
const OPN: Record<number,string> = {0x9c:'arpSel',0x9b:'pitchSlide.w',0x9a:'volSlide.b',0x99:'volume.b',0x98:'gSpeed.b',0x97:'prng.w',0x96:'rstVolEnv',0x95:'rstFreqEnv',0x94:'setPitch.b',0x93:'gFade.w',0x92:'mVol.b',0x91:'dmaFlags.b',0x90:'finetune.b',0x8f:'speed.b',0x8e:'ciaTempo.w',0x8d:'tempoSlide.w',0x8c:'gRows.b',0x8b:'rows.b'};
let a = cur0;
for (let i = 0; i < nBytes && a < h1.length; i++) {
  const d = h1[a];
  let desc = '';
  if (d === 0x00) desc = '-- END group';
  else if (d < 0x80) desc = `select ${d}`;
  else if (d >= 0xb8) desc = `PITCH note=${(~d) & 0xff}`;
  else desc = OPN[d] ? `ctrl ${OPN[d]}` : `ctrl 0x${d.toString(16)} *** DEFAULT-GAP (0 operand) ***`;
  console.log(`0x${a.toString(16)}: ${d.toString(16).padStart(2,'0')}  ${desc}`);
  a++;
}
