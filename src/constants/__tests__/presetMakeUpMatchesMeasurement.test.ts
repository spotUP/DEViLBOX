/**
 * Every master FX preset's make-up gain is the one its chain measured.
 *
 * The make-ups were measured with five steady sines through a mono downmix;
 * through a reverb or delay a sine interferes with its own delayed copy, and
 * the effect levels under them changed on 2026-09-30 (wet-path calibration).
 * Hall Reverb carried +3.2 dB for a chain that measures -0.4 dB. Re-measured
 * with stereo pink noise at -18 dBFS (tools/master-fx-preset-calibration.ts);
 * each preset now reads within 0.1 dB of its input with its make-up.
 * Kept as they were: the Neural presets (their amp models are 6-18 dB off
 * unity on their own - a per-model calibration comes first) and RE-201
 * Runaway (self-oscillates by design; its level does not follow the input).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FX_PRESETS } from '../fxPresets';

type Row = { name: string; types: string[]; chainDb: number; makeUpDb: number };
const measured = JSON.parse(readFileSync(join(process.cwd(), 'tools/master-fx-preset-calibration.json'), 'utf8')) as Record<string, Row>;
const kept = (r: Row) => r.types.includes('Neural') || r.name === 'RE-201 Runaway';

describe('master FX preset make-up gains', () => {
  it('match their measured chains', () => {
    const rows = Object.values(measured).filter((r) => !kept(r));
    expect(rows.length).toBeGreaterThan(75);
    for (const r of rows) {
      const preset = FX_PRESETS.find((p) => p.name === r.name);
      expect(preset, r.name).toBeDefined();
      expect(preset!.gainCompensationDb ?? 0, r.name).toBeCloseTo(r.makeUpDb, 5);
    }
  });

  it('Hall Reverb no longer gets a +3.2 dB boost', () => {
    const hall = FX_PRESETS.find((p) => p.name === 'Hall Reverb')!;
    expect(Math.abs(hall.gainCompensationDb ?? 0)).toBeLessThan(1);
  });
});
