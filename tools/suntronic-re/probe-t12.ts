/** probe-t12.ts — dump ballblaser v0 period + vib/pitch-acc state per tick around the
 * t12 dP-5 residual, alongside the golden period, to localize the vib-onset glitch. */
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

const score = parseSunTronicV13Score(new Uint8Array(readFileSync(join(CORPUS, 'ballblaser.src'))));
const pl = new SunTronicPlayer(score, { subsong: 0 });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyPl = pl as any;
const tl = pl.renderTimeline(samples.length);
for (let i = 8; i <= 16; i++) {
  const g = samples[i - 1].voices[0];
  const m = tl[i].voices[0];
  const dv = pl.debugVoice(0);
  // eslint-disable-next-line no-console
  console.log(
    `t${i}: nativeP=${m.period} goldenP=${g.period} dP=${m.period - g.period}` +
    ` nativeAcc=${m.acc & 0xffff} goldenAcc=${g.acc}` +
    `  [end-state vib=${dv.vibPhase} vibIdx=${dv.vibIndex} tn=${dv.tempoNote} pos=${dv.position}]`,
  );
}
void anyPl;
