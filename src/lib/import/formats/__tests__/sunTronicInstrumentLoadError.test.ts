/**
 * Regression: SunTronic V1.3 instruments whose sample data cannot be read are
 * flagged with `loadError` so the UI can show the note plays nothing because the
 * sample never loaded — not because of a decode bug.
 *
 * In the test harness no `instr/` companion files are passed, so every SAMPLED
 * instrument is a silent placeholder and must carry loadError naming the missing
 * file. SYNTH instruments decode from the embedded record (no companion needed),
 * so they must NOT be flagged.
 *
 * Fails on revert: drop the loadError assignment in buildV13Instruments and the
 * sampled instruments come back with loadError === undefined.
 */
import { describe, it, expect } from 'vitest';
import { readFixture } from './sunTestUtil';
import { parseSunTronicFile } from '../SunTronicParser';
import { parseSunTronicV13Score } from '../SunTronicV13';

describe('SunTronic V1.3 instrument load-failure flagging', () => {
  it('analgestic2.src — sampled instruments without a companion are flagged, synths are not', () => {
    const ab = readFixture('analgestic2.src');
    const score = parseSunTronicV13Score(new Uint8Array(ab));
    const numSampled = score.sampledInstruments.length;
    expect(numSampled).toBeGreaterThan(0); // song must have sampled instruments to test

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const song: any = parseSunTronicFile(ab, 'analgestic2.src');
    const instruments = song.instruments as { id: number; loadError?: string }[];

    // Every sampled instrument (ids 1..numSampled), with no companion provided,
    // must be flagged with a load error that names the sample.
    for (let id = 1; id <= numSampled; id++) {
      const inst = instruments.find((i) => i.id === id);
      expect(inst, `instrument ${id} exists`).toBeTruthy();
      expect(inst!.loadError, `sampled instrument ${id} flagged`).toBeTruthy();
      expect(inst!.loadError).toMatch(/sample file missing/i);
    }

    // Synth instruments decode from the embedded record — they must NOT be
    // flagged (they produce sound without any companion file).
    const synths = instruments.filter((i) => i.id > numSampled);
    expect(synths.length).toBeGreaterThan(0);
    for (const s of synths) {
      expect(s.loadError, `synth instrument ${s.id} not flagged`).toBeUndefined();
    }
  });
});
