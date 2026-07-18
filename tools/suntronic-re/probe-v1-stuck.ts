/**
 * probe-v1-stuck.ts — dump native player voice[1] internal state per vblank for
 * `ready`. pitch-diff.ts shows voice 1 plays ONE distinct pitch where UADE plays
 * 14 ("flat / same notes"). This reveals whether the cursor/position advances at
 * all, and what note byte GETNEXTNOTE resolves each time.
 *   TSX_TSCONFIG_PATH=tsconfig.app.json npx tsx tools/suntronic-re/probe-v1-stuck.ts [song] [steps] [voice]
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { CORPUS_DIR } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';

const name = process.argv[2] || 'ready';
const steps = Number(process.argv[3] || 900); // ~30s of vblanks (882.76 samples each)
const V = Number(process.argv[4] || 1);

const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
const score = parseSunTronicV13Score(data);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const player: any = new (SunTronicPlayer as any)(score);

let prev = '';
let changes = 0;
for (let s = 0; s < steps; s++) {
  const tick = player.stepVblankOnce();
  const vi = player.voices[V];
  const snap = tick.voices[V];
  const note = (vi.pitch >> 8) & 0xff;
  const key = `pos=${vi.position} tempoNote=${vi.tempoNote} cursor=${vi.cursor} note=${note} period=${snap.period} flags=${snap.flags} instrOff=${snap.instrOff} stagedSel=${vi.stagedSel}`;
  if (key !== prev) {
    console.log(`step ${s.toString().padStart(4)}: ${key}`);
    prev = key;
    changes++;
  }
}
console.log(`--- voice ${V}: ${changes} distinct state rows over ${steps} vblanks ---`);
