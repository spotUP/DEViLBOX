/** probe-bb-opcodes.ts — dump the raw opcode bytes SunTronicPlayer.getNextNote reads
 * for ballblaser v0 at each GNN in buckets 55-82, plus cursor before/after. Goal: see
 * what opcode sits on the tn15 row (b73) / the position boundary (b78) that makes the
 * note only 5 buckets long when golden holds it 10 (tie/hold/note-length native drops). */
import { readFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const CORPUS = resolve(REPO, 'public/data/songs/formats/SUNTronicTunes');
const data = new Uint8Array(readFileSync(join(CORPUS, 'ballblaser.src')));
const score = parseSunTronicV13Score(data);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const proto = SunTronicPlayer.prototype as any;
let bucket = -1;
const origTick = proto.tick;
proto.tick = function (...a: unknown[]) { bucket++; return origTick.apply(this, a); };
const origGNN = proto.getNextNote;
proto.getNextNote = function (v: { cursor: number; tempoNote: number; position: number; tie: number }) {
  const doLog = this.voices.indexOf(v) === 0 && bucket >= 55 && bucket <= 82;
  if (doLog) {
    const h1 = this.h1 as Uint8Array;
    let a1 = v.cursor;
    const bytes: string[] = [];
    for (let g = 0; g < 24; g++) {
      const d0 = h1[a1++] ?? 0;
      bytes.push('0x' + d0.toString(16).padStart(2, '0'));
      if (d0 === 0x00) break;
    }
    // eslint-disable-next-line no-console
    console.log(`b${bucket} v0 tn${v.tempoNote} pos${v.position} cur=0x${v.cursor.toString(16)} tie=${v.tie}  [${bytes.join(' ')}]`);
  }
  return origGNN.call(this, v);
};

const pl = new SunTronicPlayer(score, { subsong: 0 });
pl.renderTimeline(80);
