/** probe-floor-schedule.ts — with the GNN read-order fix in place, re-measure the fire
 * schedule. Sweep several ways of placing the "double" fire per bucket and count golden
 * mismatches for BOTH songs. Goal: a single principled clock accumulator that is 0/316
 * on both (the current round(k*6.25) leaves ballblaser t12 dP-5).
 *
 * Each schedule is a function firesBeforeBucket(i) = cumulative stepAll count that must
 * have run by the time bucket i is snapshotted. We drive stepAll to hit that count, then
 * snapshot, mirroring renderTimeline (tl[i] = state after bucket i's steps) and the
 * golden alignment samples[i-1] vs tl[i]. */
import { readFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const CORPUS = resolve(REPO, 'public/data/songs/formats/SUNTronicTunes');
const GOLDEN = resolve(REPO, 'src/engine/suntronic/__tests__/sunTronicNoteTimeline.golden.json');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const golden: any = JSON.parse(readFileSync(GOLDEN, 'utf8'));

const AUDIO = 1024, CIA = 882.759;

// candidate: cumulative fires that must have run BEFORE snapshotting bucket i (i>=1).
// bucket 0 snapshot = ctor state (0 fires). tl[i] mirrors i fires baseline + doubles.
const SCHEDULES: Record<string, (i: number) => number> = {
  'round(k*6.25)': (i) => {          // current committed double-position clock
    let fires = i, k = 1;
    for (;;) { const b = Math.round(k * 6.25); if (b < i || (b === i)) { /* count doubles with bucket<=i? */ } break; }
    // reconstruct: doubles land at round(k*6.25); count those <= i-? — replicate exactly below instead
    return fires; // placeholder, real one computed in run()
  },
  'floor(i*1024/CIA)': (i) => Math.floor((i * AUDIO) / CIA),
  'floor+phase0.5': (i) => Math.floor((i * AUDIO + AUDIO / 2) / CIA),
  'round(i*1024/CIA)': (i) => Math.round((i * AUDIO) / CIA),
  'ceil-1': (i) => Math.ceil((i * AUDIO) / CIA) - 1,
};

interface Row { period: number; acc: number; flags: number }
function snap(anyPl: { voices: Array<{ period: number; pitch: number; flags: number }> }): Row[] {
  return anyPl.voices.map((v) => ({ period: v.period, acc: v.pitch & 0xffff, flags: v.flags & 0xff })) as unknown as Row[];
}

function measure(name: string, firesBefore: (i: number) => number, songs: string[]): void {
  const line: string[] = [name.padEnd(20)];
  for (const song of songs) {
    const samples = golden.modules[song];
    const score = parseSunTronicV13Score(new Uint8Array(readFileSync(join(CORPUS, song))));
    const pl = new SunTronicPlayer(score, { subsong: 0 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyPl = pl as any;
    const tl: Row[][] = [];
    let fired = 0;
    tl.push(snap(anyPl)); // bucket 0 = ctor state
    for (let i = 1; i < samples.length; i++) {
      const target = firesBefore(i);
      while (fired < target) { anyPl.stepAll(); fired++; }
      tl.push(snap(anyPl));
    }
    let mm = 0; const det: string[] = [];
    for (let i = 1; i < samples.length; i++) {
      const g = samples[i - 1].voices, mv = tl[i];
      for (let v = 0; v < 4; v++) {
        if (g[v].period !== mv[v].period || g[v].acc !== (mv[v].acc & 0xffff)) {
          mm++; if (det.length < 4) det.push(`t${i}v${v}dP${mv[v].period - g[v].period}`);
        }
      }
    }
    line.push(`${song.slice(0, 4)}=${mm}/316 ${det.join(' ')}`.padEnd(34));
  }
  // eslint-disable-next-line no-console
  console.log(line.join('  '));
}

const songs = ['gliders.src', 'ballblaser.src'];
for (const [name, fn] of Object.entries(SCHEDULES)) {
  if (name === 'round(k*6.25)') continue; // placeholder; committed schedule already measured via rpp-sweep
  measure(name, fn, songs);
}
