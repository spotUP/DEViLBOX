/**
 * probe-loop-boundary.ts — measure what the player emits across the song-end /
 * restart boundary. Gate B.2 MCP evidence showed native playback goes SILENT on
 * the 2nd loop. Hypothesis: voices go note-off (flags 0xfe) at song end and the
 * restart wraps position but never revives them (stepAll skips flags==0xfe).
 *
 * Prints, per player tick, the 4 voice flags + period + whether ANY voice is
 * audible (flags bit7 clear AND period>0), and flags the tick where the song
 * first goes permanently silent.
 *
 * Run: npx tsx tools/suntronic-re/probe-loop-boundary.ts [name.src] [ticks]
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
import { CORPUS_DIR, INSTR_DIR } from './suntronicLib';

const name = process.argv[2] ?? 'ballblaser.src';
const ticks = Number(process.argv[3] ?? 3000);

const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
const score = parseSunTronicV13Score(data);
const slotPcm = score.instrumentNames.map((n) => {
  const p = join(INSTR_DIR, n);
  return existsSync(p) ? new Int8Array(readFileSync(p)) : null;
});
const player = new SunTronicPlayer(score, { sampleData: slotPcm });

const hex = (n: number) => n.toString(16).padStart(2, '0');
let firstSilentRun = -1;
let silentRun = 0;
let lastAudibleTick = -1;

for (let t = 0; t < ticks; t++) {
  const tk = player.tick();
  const audible = tk.voices.some((v) => (v.flags & 0x80) === 0 && v.period > 0);
  if (audible) { lastAudibleTick = t; silentRun = 0; }
  else { if (silentRun === 0 && firstSilentRun < 0 && t > 20) firstSilentRun = t; silentRun++; }

  // Print a window around interesting transitions and every 200 ticks.
  const flagsStr = tk.voices.map((v) => hex(v.flags)).join(' ');
  const perStr = tk.voices.map((v) => String(v.period).padStart(4)).join(' ');
  if (t % 200 === 0 || (t >= (firstSilentRun < 0 ? 1e9 : firstSilentRun - 4) && t <= (firstSilentRun < 0 ? -1 : firstSilentRun + 20))) {
    console.log(`t${String(t).padStart(4)} aud=${audible ? 'Y' : '.'} flags[${flagsStr}] per[${perStr}]`);
  }
}

console.log('---');
console.log(`lastAudibleTick=${lastAudibleTick}  firstSilentRun(>20)=${firstSilentRun}  finalSilentRun=${silentRun}`);
console.log(`endKind evidence: song went permanently silent = ${silentRun > 100 && lastAudibleTick < ticks - 100}`);
