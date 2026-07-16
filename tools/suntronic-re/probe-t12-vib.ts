/** probe-t12-vib.ts — instrument stepEffects + getNextNote for ballblaser v0 around the
 * t12 dP-5 cell. Log every stepAll's vib/pitch/period internals with the running fire
 * index and whether GNN fired / reset, to see how native's vib phase at the 0xd7 pitch-
 * only continuation diverges from golden by one step. */
import { readFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const CORPUS = resolve(REPO, 'public/data/songs/formats/SUNTronicTunes');

const score = parseSunTronicV13Score(new Uint8Array(readFileSync(join(CORPUS, 'ballblaser.src'))));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const proto = SunTronicPlayer.prototype as any;

let bucket = -1, fire = 0;
const origTick = proto.tick;
proto.tick = function (...a: unknown[]) { bucket++; return origTick.apply(this, a); };

const origStep = proto.stepEffects;
proto.stepEffects = function (v: { channel: number }, extraVib: boolean) {
  const isV0 = this.voices.indexOf(v) === 0;
  const r = origStep.call(this, v, extraVib);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vv = v as any;
  if (isV0 && bucket >= 9 && bucket <= 14) {
    // eslint-disable-next-line no-console
    console.log(
      `  b${bucket} fire${fire} tn${vv.tempoNote} tt${vv.tempoTick} pitch=${vv.pitch & 0xffff}` +
      ` vibPh=${vv.vibPhase & 0xffff} vibIdx=${vv.vibIndex} P=${vv.period} extraVib=${extraVib}`,
    );
  }
  if (isV0) fire++;
  return r;
};

const pl = new SunTronicPlayer(score, { subsong: 0 });
pl.renderTimeline(16);
