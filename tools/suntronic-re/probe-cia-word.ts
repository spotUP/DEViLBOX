/** probe-cia-word.ts — dump every 0x8e (CIA tempo word) / 0x8d (tempo slide) opcode
 * operand issued by each song, for all voices, across the whole render. Compares the
 * CIA fire period each song implies against the 882.759-sample gliders default. */
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

const CIA_HZ = 709379; // PAL CIA timer clock

// Patch the prototype BEFORE construction so the ctor priming tick is captured too.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const proto = SunTronicPlayer.prototype as any;
const origCtl = proto.controlOpcode;
let curName = '';
const seen = new Set<string>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
proto.controlOpcode = function (v: any, op: number, a1: number) {
  if (op === 0x8e || op === 0x8d) {
    const h1 = this.h1 as Uint8Array;
    const word = ((h1[a1] ?? 0) << 8) | (h1[a1 + 1] ?? 0);
    const vi = this.voices.indexOf(v);
    const key = `${curName}:${op}:${vi}:${word}`;
    if (!seen.has(key)) {
      seen.add(key);
      const hz = word ? CIA_HZ / word : 0;
      const smp = hz ? 44100 / hz : 0;
      // eslint-disable-next-line no-console
      console.log(`  ${curName} v${vi} op=0x${op.toString(16)} word=${word} (0x${word.toString(16)}) -> ${hz.toFixed(3)}Hz ${smp.toFixed(3)}smp`);
    }
  }
  return origCtl.call(this, v, op, a1);
};

for (const name of Object.keys(golden.modules)) {
  curName = name;
  const samples = golden.modules[name];
  const data = new Uint8Array(readFileSync(join(CORPUS, name)));
  const score = parseSunTronicV13Score(data);
  const pl = new SunTronicPlayer(score, { subsong: 0 });
  pl.renderTimeline(samples.length);
}
// eslint-disable-next-line no-console
console.log(`(scanned; ${seen.size} distinct CIA-tempo opcodes)`);
