/** probe-bb-counters.ts — per-bucket v0 tempo counters for ballblaser buckets 55-82,
 * every speed/rowsPerPos/tie-affecting opcode, and the GNN retrigger points. Goal: see
 * why v0 wraps position 0->1 (note change) at bucket 78 when golden holds ~2 buckets. */
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const proto = SunTronicPlayer.prototype as any;
const origCtl = proto.controlOpcode;
let bucket = -1;
const SPEED_OPS = new Set([0x98, 0x8f, 0x8c, 0x8b, 0x9c, 0x9b]); // speed/rpp/arp/pitchslide
proto.controlOpcode = function (v: unknown, op: number, a1: number) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vi = (this as any).voices.indexOf(v);
  if (vi === 0 && SPEED_OPS.has(op)) {
    // eslint-disable-next-line no-console
    console.log(`  CTL b${bucket} v0 op=0x${op.toString(16)}`);
  }
  return origCtl.call(this, v, op, a1);
};
const origTick = proto.tick;
proto.tick = function (...a: unknown[]) { bucket++; return origTick.apply(this, a); };

const pl = new SunTronicPlayer(score, { subsong: 0 });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyPl = pl as any;
const origGNN = anyPl.getNextNote.bind(anyPl);
anyPl.getNextNote = function (v: unknown) {
  const r = origGNN(v);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vv = v as any;
  if (anyPl.voices.indexOf(v) === 0 && bucket >= 55 && bucket <= 82) {
    // eslint-disable-next-line no-console
    console.log(`  GNN b${bucket} v0 retrig=${r} tn=${vv.tempoNote} pos=${vv.position} sp=${vv.speed & 0xff} rpp=${vv.rowsPerPos & 0xff} tie=${vv.tie}`);
  }
  return r;
};

const tl = pl.renderTimeline(samples.length);
// eslint-disable-next-line no-console
console.log('\nsamples.length=' + samples.length);
for (let t = 72; t < samples.length; t++) {
  const g = samples[t - 1].voices, n = tl[t].voices;
  // eslint-disable-next-line no-console
  console.log(`t${t}: v0 g${g[0].period} n${n[0].period}  v3 g${g[3].period} n${n[3].period}`);
}
