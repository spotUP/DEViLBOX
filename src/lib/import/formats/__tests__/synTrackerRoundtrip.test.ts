/**
 * Regression: SynTracker is editable + exportable. Parse -> export must be BYTE-IDENTICAL on
 * unedited modules (lossless raw cell codec + per-channel pattern writeback), across all real
 * fixtures. A single edited cell must survive the round-trip.
 *
 * Fixtures: public/data/songs/syntracker/*.synmod (real SYNTRACKER-SONG: modules).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { parseSynTrackerFile, isSynTrackerFormat } from '../SynTrackerParser';
import { exportSynTrackerFile } from '@lib/export/SynTrackerExporter';

const DIR = join(process.cwd(), 'public/data/songs/syntracker');
const files = readdirSync(DIR).filter((f) => f.toLowerCase().endsWith('.synmod'));

function ab(name: string): ArrayBuffer {
  const b = readFileSync(join(DIR, name));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

describe('SynTracker parse + export round-trip', () => {
  it('has real fixtures', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const name of files) {
    it(`re-exports ${name} byte-identically (only referenced pattern bytes)`, () => {
      const buf = ab(name);
      expect(isSynTrackerFormat(buf, name)).toBe(true);
      const song = parseSynTrackerFile(buf, `synmod.${name}`);
      const out = exportSynTrackerFile(song);
      const orig = new Uint8Array(buf);
      expect(out.length).toBe(orig.length);
      // The exporter rewrites every referenced pattern cell from the losslessly-decoded song;
      // unedited => identical. Assert the full file is byte-identical.
      let firstDiff = -1;
      for (let i = 0; i < orig.length; i++) {
        if (out[i] !== orig[i]) { firstDiff = i; break; }
      }
      expect(firstDiff, `first differing byte offset in ${name}`).toBe(-1);
    });
  }

  it('edits survive the round-trip', () => {
    const buf = ab(files[0]);
    const song = parseSynTrackerFile(buf, `synmod.${files[0]}`);
    const edit = { note: 40, instrument: 3, volume: 0, effTyp: 0x53, eff: 6, effTyp2: 0, eff2: 0 };
    // SynTracker patterns can be shared across song positions (per-channel position lists);
    // export is last-position-wins, so edit channel-0 row-0 in every position for a
    // deterministic result regardless of which position writes the shared pattern last.
    for (const pattern of song.patterns) pattern.channels[0].rows[0] = { ...edit };
    const out = exportSynTrackerFile(song);
    const reparsed = parseSynTrackerFile(out.slice().buffer as ArrayBuffer, `synmod.${files[0]}`);
    const cell = reparsed.patterns[0].channels[0].rows[0];
    expect(cell.note).toBe(40);
    expect(cell.instrument).toBe(3);
    expect(cell.effTyp).toBe(0x53);
    expect(cell.eff).toBe(6);
  });
});
