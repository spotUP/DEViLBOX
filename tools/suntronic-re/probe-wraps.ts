/** probe-wraps.ts — log every position wrap (loadPosition) per voice for both songs
 * across the 80-bucket golden window, with the bucket + stepAll index at which it fires.
 * Tests whether gliders exercises a position boundary at all (if not, the wrap timing is
 * validated only by ballblaser). */
import { readFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const CORPUS = resolve(REPO, 'public/data/songs/formats/SUNTronicTunes');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const proto = SunTronicPlayer.prototype as any;
let bucket = -1, steps = 0;
const origTick = proto.tick;
proto.tick = function (...a: unknown[]) { bucket++; return origTick.apply(this, a); };
const origStep = proto.stepAll;
proto.stepAll = function () { steps++; return origStep.call(this); };
const origLoad = proto.loadPosition;
proto.loadPosition = function (v: { channel: number; position: number }) {
  // eslint-disable-next-line no-console
  console.log(`  WRAP v${v.channel} -> pos${v.position} @ bucket${bucket} step${steps}`);
  return origLoad.call(this, v);
};

for (const name of ['gliders.src', 'ballblaser.src']) {
  bucket = -1; steps = 0;
  // eslint-disable-next-line no-console
  console.log(`== ${name} ==`);
  const score = parseSunTronicV13Score(new Uint8Array(readFileSync(join(CORPUS, name))));
  const pl = new SunTronicPlayer(score, { subsong: 0 });
  pl.renderTimeline(80);
}
