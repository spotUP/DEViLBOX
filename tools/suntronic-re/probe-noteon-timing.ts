/** probe-noteon-timing.ts — pin the note-trigger off-by-one on ballblaser.
 * Renders natively, logs every tick where voice0's pitch base ($08 hi byte)
 * changes (= a new PITCH opcode took effect) alongside tempoTick/tempoNote and
 * the note-stream cursor. UADE oracle triggers voice0's first note change at
 * t10 (per probe-lockstep-poll); this shows which native tick applies it and
 * what the cursor is doing across that boundary. NOT committed. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { CORPUS_DIR } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPlayer = any;
function run(name: string): void {
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const score = parseSunTronicV13Score(data);
  const player = new SunTronicPlayer(score, { subsong: 0 }) as AnyPlayer;
  const v0 = player.voices[0];
  console.log(`\n${name} native voice0 note-timing (cursor/pitch/period per tick):`);
  let prevPitchHi = (v0.pitch >> 8) & 0xff;
  for (let i = 0; i < 16; i++) {
    const t = player.tick();
    const cur = v0.cursor;
    const pitchHi = (v0.pitch >> 8) & 0xff;
    const changed = pitchHi !== prevPitchHi;
    console.log(`  t${String(i).padStart(2)} tempoTick=${v0.tempoTick} tempoNote=${v0.tempoNote} cursor=${cur} pitchHi=${pitchHi} per=${t.voices[0].period}${changed ? ' <-- PITCH CHANGE' : ''}`);
    prevPitchHi = pitchHi;
  }
}
run('ballblaser.src');
