import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  generatedPeakFor,
  smoothProgrammeLevel,
  GENERATED_PRESENCE,
  SILENT_PROGRAMME_PEAK,
  type ProgrammeLevel,
} from '../programmeLevel';

const QUIET: ProgrammeLevel = { rms: 0.05, peak: 0.2, valid: true };
const LOUD: ProgrammeLevel = { rms: 0.25, peak: 0.9, valid: true };
const SILENT: ProgrammeLevel = { rms: 0, peak: 0, valid: false };

describe('generatedPeakFor — referenced to the music, not to full scale', () => {
  it('is quieter on a quiet tune and louder on a loud one', () => {
    expect(generatedPeakFor('sonarPing', QUIET))
      .toBeLessThan(generatedPeakFor('sonarPing', LOUD));
  });

  it('fixes the reported case: a ping no longer sits 15 dB over the music', () => {
    // The old behaviour was a flat 0.8 peak whatever the programme did.
    const peak = generatedPeakFor('sonarPing', QUIET);
    expect(peak).toBeLessThan(0.2);            // below the programme's own peak
    expect(peak).toBeGreaterThan(0.01);        // still audible
  });

  it('keeps the musical ranking between generated moves', () => {
    const scream = generatedPeakFor('tubbyScream', LOUD);
    const siren = generatedPeakFor('siren', LOUD);
    const ping = generatedPeakFor('sonarPing', LOUD);
    expect(scream).toBeGreaterThan(siren);
    expect(siren).toBeGreaterThan(ping);
  });

  it('keeps the low end more conservative than the mids', () => {
    expect(GENERATED_PRESENCE.subHarmonic).toBeLessThan(GENERATED_PRESENCE.siren);
  });

  it('falls back to a modest fixed peak when nothing is playing', () => {
    const peak = generatedPeakFor('siren', SILENT);
    expect(peak).toBeCloseTo(SILENT_PROGRAMME_PEAK * GENERATED_PRESENCE.siren, 6);
    expect(peak).toBeLessThan(0.3);
  });

  it('treats a programme reading of near-silence as silence', () => {
    const almost: ProgrammeLevel = { rms: 0.001, peak: 0.002, valid: true };
    expect(generatedPeakFor('siren', almost)).toBeCloseTo(generatedPeakFor('siren', SILENT), 6);
  });

  it('scales the caller intent instead of being replaced by it', () => {
    const full = generatedPeakFor('siren', LOUD, 1);
    const half = generatedPeakFor('siren', LOUD, 0.5);
    expect(half).toBeCloseTo(full / 2, 6);
  });

  it('never returns a peak that would clip on its own, or one that is inaudible', () => {
    const blaring: ProgrammeLevel = { rms: 1, peak: 1, valid: true };
    expect(generatedPeakFor('tubbyScream', blaring)).toBeLessThanOrEqual(0.95);
    expect(generatedPeakFor('sonarPing', QUIET, 0)).toBeGreaterThan(0);
  });

  it('gives an unlisted generated move a middling presence rather than full scale', () => {
    expect(generatedPeakFor('someNewNoise', LOUD)).toBeLessThan(0.6);
  });
});

describe('smoothProgrammeLevel — describes the tune, not the transient', () => {
  it('takes the first reading as-is', () => {
    const level = smoothProgrammeLevel(null, { rms: 0.1, peak: 0.4 });
    expect(level.peak).toBe(0.4);
    expect(level.valid).toBe(true);
  });

  it('rises faster than it falls', () => {
    const start: ProgrammeLevel = { rms: 0.1, peak: 0.4, valid: true };
    const up = smoothProgrammeLevel(start, { rms: 0.1, peak: 0.9 });
    const down = smoothProgrammeLevel(start, { rms: 0.1, peak: 0.0 });
    expect(up.peak - start.peak).toBeGreaterThan(start.peak - down.peak);
  });

  it('does not chase a single loud frame all the way up', () => {
    const start: ProgrammeLevel = { rms: 0.1, peak: 0.3, valid: true };
    expect(smoothProgrammeLevel(start, { rms: 0.1, peak: 1 }).peak).toBeLessThan(0.6);
  });

  it('marks silence as invalid so a caller can tell quiet from absent', () => {
    expect(smoothProgrammeLevel(null, { rms: 0, peak: 0 }).valid).toBe(false);
  });

  it('keeps following a tune through a momentary gap', () => {
    const playing: ProgrammeLevel = { rms: 0.2, peak: 0.7, valid: true };
    expect(smoothProgrammeLevel(playing, { rms: 0, peak: 0 }).valid).toBe(true);
  });
});

describe('wiring contract — generated moves reference the programme', () => {
  const bus = readFileSync(
    join(__dirname, '..', '..', '..', 'engine', 'dub', 'DubBus.ts'), 'utf8',
  );

  it('routes every generated source through the programme reference', () => {
    for (const moveId of [
      'sonarPing', 'radioRiser', 'subSwell', 'subHarmonic',
      'crushBass', 'oscBass', 'noiseBurst', 'siren',
    ]) {
      expect(bus, moveId).toContain(`generatedPeak('${moveId}'`);
    }
  });

  it('leaves no generated source on a raw full-scale clamp', () => {
    expect(bus).not.toContain('const peak = Math.max(0, Math.min(1.0, level));');
  });

  it('puts the siren behind its own level gain rather than straight into the bus', () => {
    expect(bus).toContain('synth.output.connect(this._sirenLevelGain)');
  });
});
