/** probe-ballblaser-tempo.ts — trace v0/v3 tempo counters + GNN retriggers + control
 * opcodes around the t78 early note-change residual. Monkey-patches the player's
 * private getNextNote/controlOpcode to log, keyed by the driver's bucket index. */
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
const samples = golden.modules['ballblaser.src'];

const data = new Uint8Array(readFileSync(join(CORPUS, 'ballblaser.src')));
const score = parseSunTronicV13Score(data);
const pl = new SunTronicPlayer(score, { subsong: 0 });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyPl = pl as any;
const voices = anyPl.voices;
const vIndex = (v: unknown): number => voices.indexOf(v);

const origGNN = anyPl.getNextNote.bind(anyPl);
const origCtl = anyPl.controlOpcode.bind(anyPl);

// bucket counter: renderTimeline calls tick() per bucket; we can't see it directly,
// so count stepAll invocations is wrong (doubles). Track via a wrapper on tick.
let bucket = -1; // ctor priming happens before first tick
const origTick = anyPl.tick.bind(anyPl);
anyPl.tick = function (...a: unknown[]) {
  bucket++;
  return origTick(...a);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
anyPl.controlOpcode = function (v: any, op: number, a1: number) {
  const vi = vIndex(v);
  if ((vi === 0 || vi === 3) && bucket >= 70 && bucket <= 82) {
    // eslint-disable-next-line no-console
    console.log(`  b${bucket} v${vi} CTL op=0x${op.toString(16)}`);
  }
  return origCtl(v, op, a1);
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
anyPl.getNextNote = function (v: any) {
  const vi = vIndex(v);
  const before = { tt: v.tempoTick, tn: v.tempoNote, pos: v.position, sp: v.speed & 0xff, rpp: v.rowsPerPos & 0xff };
  const retrig = origGNN(v);
  if ((vi === 0 || vi === 3) && bucket >= 70 && bucket <= 82) {
    // eslint-disable-next-line no-console
    console.log(`  b${bucket} v${vi} GNN retrig=${retrig} pre{tt${before.tt} tn${before.tn} pos${before.pos} sp${before.sp} rpp${before.rpp}} post{tn${v.tempoNote} pos${v.position}}`);
  }
  return retrig;
};

const tl = pl.renderTimeline(samples.length);

// eslint-disable-next-line no-console
console.log('\n== period compare t74..80 ==');
for (let t = 74; t <= 80 && t < samples.length; t++) {
  const g = samples[t - 1].voices, n = tl[t].voices;
  // eslint-disable-next-line no-console
  console.log(`t${t}: v0 g${g[0].period} n${n[0].period}  v3 g${g[3].period} n${n[3].period}`);
}
