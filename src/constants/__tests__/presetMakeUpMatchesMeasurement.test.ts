/**
 * Every master FX preset's make-up gain is the one its chain measured.
 *
 * The make-ups were measured with five steady sines through a mono downmix;
 * through a reverb or delay a sine interferes with its own delayed copy, and
 * the effect levels under them changed on 2026-09-30 (wet-path calibration).
 * Hall Reverb carried +3.2 dB for a chain that measures -0.4 dB. Re-measured
 * with stereo pink noise at -18 dBFS (tools/master-fx-preset-calibration.ts);
 * each preset now reads within 0.1 dB of its input with its make-up.
 * The guitar (Neural) presets were measured after each amp model's own
 * level was corrected (NEURAL_MODEL_OUTPUT_DB). Kept as it was: RE-201
 * Runaway (self-oscillates by design; its level does not follow the input).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FX_PRESETS } from '../fxPresets';
import { presetChainFingerprint } from '../presetChainFingerprint';

type Row = { name: string; types: string[]; chainDb: number; makeUpDb: number; chain?: string };

/**
 * Make-ups measured on a chain the preset no longer has: retuned (f85a8e8c8 and
 * earlier) or holding an EQ3 / Filter whose gain became real dB (b730c5da5,
 * 6c9b00955) after the measurement. The live re-measure of 2026-10-08
 * (3c9dae257) skipped them because the tool skipped any preset it had a row
 * for. `npx tsx tools/master-fx-preset-calibration.ts` now measures exactly
 * these (their rows carry no chain fingerprint), then `--write`; each one that
 * is re-measured leaves this list. Big Room among them: 4.6 dB measured with a
 * -12 dB / 30 dB-knee compressor, now -22 dB / 8 dB knee.
 */
const AWAITING_LIVE_REMEASURE = new Set([
  'VHS Tape',
  'Cassette Dub',
  'Dub / Reggae',
  'Synthwave',
  'Garage / 2-Step',
  'Big Room',
  'Echo Out',
  'Dub Echo',
  'Feedback Loop',
  'Cathedral',
  'Ping Pong Hall',
  'Spacey Delay',
  'Mad Professor Cathedral',
  'Ambient Space',
  'Dreamy Haze',
  'Underwater',
  'Frozen',
  'Radiowave',
  'Haunted',
  'Cosmic',
  'Stereo Ping Pong',
  'Dumble Lead',
  'RAT + Delay',
  'Paula Dub Sirens',
  'Chipgold',
  'Paula Sings',
  'Exotic Shimmer',
  'SID Stadium',
  'SID Acid Trip',
  'SID Neon Nights',
  'Warm Overdrive',
  'Tube Screamer Glow',
  'Club Ready',
  'Clean Master',
  'Balanced',
  'House',
  'Drum & Bass',
  'Punchy Drums',
  'Clean Vocal',
  'Transparent',
]);
const measured = JSON.parse(readFileSync(join(process.cwd(), 'tools/master-fx-preset-calibration.json'), 'utf8')) as Record<string, Row>;
const kept = (r: Row) => r.name === 'RE-201 Runaway';

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

  it('were measured on the chain each preset has now (a retune is measured again)', () => {
    const stale: string[] = [];
    for (const r of Object.values(measured)) {
      const preset = FX_PRESETS.find((p) => p.name === r.name);
      if (!preset) continue;
      if (r.chain !== presetChainFingerprint(preset.effects as never)) stale.push(r.name);
    }
    expect(stale.filter((n) => !AWAITING_LIVE_REMEASURE.has(n)), 'retuned since their make-up was measured').toEqual([]);
    expect([...AWAITING_LIVE_REMEASURE].filter((n) => !stale.includes(n)), 're-measured: remove from AWAITING_LIVE_REMEASURE').toEqual([]);
  });

  it('Hall Reverb no longer gets a +3.2 dB boost', () => {
    const hall = FX_PRESETS.find((p) => p.name === 'Hall Reverb')!;
    expect(Math.abs(hall.gainCompensationDb ?? 0)).toBeLessThan(1);
  });
});
