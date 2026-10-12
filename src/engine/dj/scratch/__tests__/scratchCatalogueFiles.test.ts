/**
 * Catalogue file tests (owner scratch plan section 70; ledger SCR-P2.3):
 * every record's pack file exists, its anchors and ranges are ordered inside
 * the file, every recommended gesture resolves, and the pack files no record
 * references are the FX-pack-only set (never a performer source).
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { SCRATCH_RECORDS, SCRATCH_PACK_DIR, fxOnlyPackFiles } from '../scratchCatalogue';
import { REFERENCE_GESTURE_IDS, isScratchGestureId } from '../scratchGestureCatalog';

const packDir = resolve(process.cwd(), 'public', SCRATCH_PACK_DIR);

/** Frames in the WAV's `data` chunk (the true duration; P0.5's probe). */
function wavDurationSec(path: string): number {
  const buf = readFileSync(path);
  const channels = buf.readUInt16LE(22);
  const rate = buf.readUInt32LE(24);
  const bits = buf.readUInt16LE(34);
  let off = 12;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === 'data') return size / (channels * bits / 8) / rate;
    off += 8 + size + (size & 1);
  }
  throw new Error(`no data chunk in ${path}`);
}

describe('catalogue files (section 70, SCR-P2.3)', () => {
  it('every record\'s pack file exists and the provenance note is present', () => {
    expect(existsSync(join(packDir, 'PROVENANCE.md'))).toBe(true);
    for (const r of SCRATCH_RECORDS) {
      expect(existsSync(join(packDir, r.file)), r.id).toBe(true);
    }
  });

  it('safe[0] <= safeReverse[0] < vowel <= safeForward[0] < safeForward[1] <= safe[1] <= duration (+1 ms) for all 50', () => {
    for (const r of SCRATCH_RECORDS) {
      const fileSec = wavDurationSec(join(packDir, r.file));
      expect(r.safe[0], r.id).toBeLessThanOrEqual(r.safeReverse[0]);
      expect(r.safeReverse[0], r.id).toBeLessThan(r.anchors.vowel);
      expect(r.anchors.vowel, r.id).toBeLessThanOrEqual(r.safeForward[0]);
      expect(r.safeForward[0], r.id).toBeLessThan(r.safeForward[1]);
      expect(r.safeForward[1], r.id).toBeLessThanOrEqual(r.safe[1]);
      expect(r.safe[1], r.id).toBeLessThanOrEqual(r.durationSec + 0.001);
      expect(r.durationSec, r.id).toBeLessThanOrEqual(fileSec + 0.001);
      expect(r.anchors.attack, r.id).toBeGreaterThanOrEqual(0);
      expect(r.anchors.tail, r.id).toBeLessThanOrEqual(r.durationSec + 0.001);
    }
  });

  it('every recommended gesture resolves to a catalogue gesture id', () => {
    for (const r of SCRATCH_RECORDS) {
      for (const ref of r.recommendedGestures) {
        const id = REFERENCE_GESTURE_IDS[ref];
        expect(id, `${r.id}: ${ref}`).toBeDefined();
        expect(isScratchGestureId(id!)).toBe(true);
      }
      if (!r.preScratched) expect(r.gestures.length, r.id).toBeGreaterThan(0);
    }
  });

  it('the 6 pack files without a record are FX pack only: 040, 049, 053, 054, 055, 056 (020 is AH_LONG)', () => {
    const onDisk = readdirSync(packDir).filter((f) => /^scratch_\d{3}\.wav$/.test(f));
    expect(onDisk).toHaveLength(57);
    expect(fxOnlyPackFiles(onDisk)).toEqual([
      'scratch_040.wav', 'scratch_049.wav', 'scratch_053.wav',
      'scratch_054.wav', 'scratch_055.wav', 'scratch_056.wav',
    ]);
    const referenced = new Set(SCRATCH_RECORDS.map((r) => r.file));
    expect(referenced.size).toBe(51);
    for (const f of fxOnlyPackFiles(onDisk)) expect(referenced.has(f)).toBe(false);
  });

  it('AH_LONG (SCR-PG-A1): scratch_020.wav with the demo analyser\'s anchors (load_bank: vowel 440, safe 27-14467 at 22,050 Hz)', () => {
    const r = SCRATCH_RECORDS.find((x) => x.id === 'AH_LONG')!;
    expect(r.file).toBe('scratch_020.wav');
    expect(r.category).toBe('AH_VOWEL');
    expect(r.clean).toBe(true);
    expect(r.anchors.vowel).toBeCloseTo(440 / 22050, 9);
    expect(r.safe[0]).toBeCloseTo(27 / 22050, 9);
    expect(r.safe[1]).toBeCloseTo(14467 / 22050, 9);
    expect(r.durationSec).toBeCloseTo(0.6709, 4);
  });
});
