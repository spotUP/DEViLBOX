/**
 * Regression: MaxTrax (MXTX) lossless codec — Phase 1 of native editability.
 *
 * MaxTrax is a MIDI-like event format. parseMaxTrax decodes the editable scores and preserves
 * the header + sample bank verbatim; encodeMaxTrax must reproduce an unedited module
 * byte-for-byte, across all real fixtures. An edited event must survive the round-trip.
 *
 * Fixtures: public/data/songs/maxtrax/*.mxtx (real MXTX modules).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { parseMaxTrax, encodeMaxTrax, isMaxTraxFormat } from '../maxtrax/maxtraxFormat';

const DIR = join(process.cwd(), 'public/data/songs/maxtrax');
const files = readdirSync(DIR).filter((f) => f.toLowerCase().endsWith('.mxtx'));

const load = (name: string) => new Uint8Array(readFileSync(join(DIR, name)));

describe('MaxTrax MXTX codec', () => {
  it('has real fixtures', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const name of files) {
    it(`re-encodes ${name} byte-identically`, () => {
      const orig = load(name);
      expect(isMaxTraxFormat(orig)).toBe(true);
      const data = parseMaxTrax(orig);
      expect(data.scores.length).toBeGreaterThan(0);
      const out = encodeMaxTrax(data);
      expect(out.length).toBe(orig.length);
      let firstDiff = -1;
      for (let i = 0; i < orig.length; i++) {
        if (out[i] !== orig[i]) { firstDiff = i; break; }
      }
      expect(firstDiff, `first differing byte in ${name}`).toBe(-1);
    });
  }

  it('an edited event survives the round-trip', () => {
    const data = parseMaxTrax(load(files[0]));
    // Find a note event and change its data/duration.
    const score = data.scores.find((s) => s.events.some((e) => e.command < 0x80));
    expect(score).toBeTruthy();
    if (!score) return;
    const idx = score.events.findIndex((e) => e.command < 0x80);
    score.events[idx] = { command: 0x40, data: 0x51, startTime: 123, stopTime: 456 };
    const out = encodeMaxTrax(data);
    const reparsed = parseMaxTrax(out);
    const sameScore = reparsed.scores[data.scores.indexOf(score)];
    const ev = sameScore.events[idx];
    expect(ev.command).toBe(0x40);
    expect(ev.data).toBe(0x51);
    expect(ev.startTime).toBe(123);
    expect(ev.stopTime).toBe(456);
  });
});
