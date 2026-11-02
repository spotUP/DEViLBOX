import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { traceSid } from '../formats/SIDParser';
import { sidTraceToGoatTracker } from '../formats/sidTraceToGoatTracker';
import { scoreSidTrace, createHeadlessGT, type HeadlessGT } from '../formats/sidTraceScore';

const DIR = 'public/data/songs/sid';
/** Frames compared per tune (the first minute of a PAL tune); keeps a run short. */
const FRAMES = 3000;
const RESULTS = process.env.SID_SCORE_RESULTS;

let gt: HeadlessGT;
beforeAll(async () => { gt = await createHeadlessGT(); }, 60_000);

describe('GoatTracker conversion of a SID trace replays in the GTUltra core', () => {
  for (const file of readdirSync(DIR).filter((f) => f.endsWith('.sid')).sort()) {
    it(`${file}: replay score`, () => {
      const bytes = readFileSync(join(DIR, file));
      const trace = traceSid(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
      expect(trace).not.toBeNull();
      const built = sidTraceToGoatTracker(trace!, file);
      let replayed = 0;
      const counting = { play: (...a: Parameters<HeadlessGT['play']>) => { const r = gt.play(...a); replayed = r.length; return r; } };
      const s = scoreSidTrace(trace!, built, counting, FRAMES);
      // Sentinel: the GT core produced the frames that were compared.
      expect(replayed).toBeGreaterThanOrEqual(s.frames - built.frameOffset);
      expect(s.changes).toBeGreaterThan(0);
      const row = {
        file, fpr: built.framesPerRow, offset: built.frameOffset, notes: built.noteCount, instruments: built.instrumentCount,
        programFrames: built.programFrames, shared: built.sharedPrograms, warnings: built.warnings,
        score: +s.score.toFixed(4), tolerant: +s.tolerantScore.toFixed(4), lag: s.lag, frames: s.frames, changes: s.changes,
        perClass: Object.fromEntries(Object.entries(s.perClass).map(([k, v]) => [k, { n: v.changes, exact: v.changes ? +(v.exact / v.changes).toFixed(3) : null, tol: v.changes ? +(v.tolerant / v.changes).toFixed(3) : null }])),
        misses: s.firstMisses.slice(0, 6),
      };
      console.log('SIDSCORE ' + JSON.stringify(row));
      if (RESULTS) {
        const all = existsSync(RESULTS) ? JSON.parse(readFileSync(RESULTS, 'utf8')) as Array<{ file: string }> : [];
        writeFileSync(RESULTS, JSON.stringify([...all.filter((r) => r.file !== file), row], null, 1));
      }
    }, 300_000);
  }
});
