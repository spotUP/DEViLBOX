import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  generatedPeakFor,
  shelfTrimDb,
  smoothProgrammeLevel,
  GENERATED_PRESENCE,
  SILENT_PROGRAMME_PEAK,
  type ProgrammeLevel,
} from '../programmeLevel';

const QUIET: ProgrammeLevel = { rms: 0.05, peak: 0.2, lowShare: 0.4, valid: true };
const LOUD: ProgrammeLevel = { rms: 0.25, peak: 0.9, lowShare: 0.4, valid: true };
const SILENT: ProgrammeLevel = { rms: 0, peak: 0, lowShare: 0.4, valid: false };

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

  it('keeps the musical ranking among transients', () => {
    expect(generatedPeakFor('tubbyScream', LOUD))
      .toBeGreaterThan(generatedPeakFor('sonarPing', LOUD));
  });

  it('keeps the low end more conservative than the mids', () => {
    expect(GENERATED_PRESENCE.subHarmonic).toBeLessThan(GENERATED_PRESENCE.siren);
  });

  it('references a SUSTAINED source to RMS, not to peak', () => {
    // The reported bug: a drone at 0.75 of the programme's PEAK sits three to
    // four times above the level the mix averages. The siren must land near
    // the programme's RMS instead.
    const siren = generatedPeakFor('siren', LOUD);
    expect(siren).toBeLessThan(LOUD.peak / 2);
    expect(siren).toBeGreaterThan(LOUD.rms);          // still audible over it
    expect(siren).toBeLessThan(LOUD.rms * 1.5);       // but only just
  });

  it('keeps a transient referenced to peak', () => {
    expect(generatedPeakFor('sonarPing', LOUD)).toBeGreaterThan(LOUD.rms);
    expect(generatedPeakFor('sonarPing', LOUD)).toBeCloseTo(LOUD.peak * 0.45, 6);
  });

  it('puts the siren well below where the peak reference put it', () => {
    // What the first pass produced, for the record.
    const oldBehaviour = LOUD.peak * 0.75;
    expect(generatedPeakFor('siren', LOUD)).toBeLessThan(oldBehaviour / 2);
  });

  it('holds a sustained low end under the mix rather than over it', () => {
    expect(generatedPeakFor('oscBass', LOUD)).toBeLessThan(LOUD.rms);
  });

  it('falls back to a modest fixed level when nothing is playing', () => {
    // A transient falls back to the fixed peak; a sustained source falls back
    // to the RMS that peak implies, so it stays quiet in the same proportion
    // it would be against real music.
    expect(generatedPeakFor('sonarPing', SILENT))
      .toBeCloseTo(SILENT_PROGRAMME_PEAK * GENERATED_PRESENCE.sonarPing, 6);
    const siren = generatedPeakFor('siren', SILENT);
    expect(siren).toBeLessThan(0.1);
    expect(siren).toBeGreaterThan(0.01);
  });

  it('treats a programme reading of near-silence as silence', () => {
    const almost: ProgrammeLevel = { rms: 0.001, peak: 0.002, lowShare: 0.4, valid: true };
    expect(generatedPeakFor('siren', almost)).toBeCloseTo(generatedPeakFor('siren', SILENT), 6);
    expect(generatedPeakFor('sonarPing', almost))
      .toBeCloseTo(generatedPeakFor('sonarPing', SILENT), 6);
  });

  it('scales the caller intent instead of being replaced by it', () => {
    const full = generatedPeakFor('siren', LOUD, 1);
    const half = generatedPeakFor('siren', LOUD, 0.5);
    expect(half).toBeCloseTo(full / 2, 6);
  });

  it('never returns a peak that would clip on its own, or one that is inaudible', () => {
    const blaring: ProgrammeLevel = { rms: 1, peak: 1, lowShare: 0.4, valid: true };
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
    const start: ProgrammeLevel = { rms: 0.1, peak: 0.4, lowShare: 0.4, valid: true };
    const up = smoothProgrammeLevel(start, { rms: 0.1, peak: 0.9 });
    const down = smoothProgrammeLevel(start, { rms: 0.1, peak: 0.0 });
    expect(up.peak - start.peak).toBeGreaterThan(start.peak - down.peak);
  });

  it('does not chase a single loud frame all the way up', () => {
    const start: ProgrammeLevel = { rms: 0.1, peak: 0.3, lowShare: 0.4, valid: true };
    expect(smoothProgrammeLevel(start, { rms: 0.1, peak: 1 }).peak).toBeLessThan(0.6);
  });

  it('marks silence as invalid so a caller can tell quiet from absent', () => {
    expect(smoothProgrammeLevel(null, { rms: 0, peak: 0 }).valid).toBe(false);
  });

  it('keeps following a tune through a momentary gap', () => {
    const playing: ProgrammeLevel = { rms: 0.2, peak: 0.7, lowShare: 0.4, valid: true };
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

describe('shelfTrimDb — pay for what the boost actually costs', () => {
  it('trims far less than the shelf gain, because only the low end is lifted', () => {
    const trim = shelfTrimDb(9, LOUD);            // lowShare 0.4
    expect(trim).toBeGreaterThan(-9);             // not the full 9 dB
    expect(trim).toBeCloseTo(-3.6, 6);
  });

  it('trims more on a bass-heavy tune than on a thin one', () => {
    const heavy = shelfTrimDb(9, { ...LOUD, lowShare: 0.7 });
    const thin = shelfTrimDb(9, { ...LOUD, lowShare: 0.1 });
    expect(heavy).toBeLessThan(thin);
  });

  it('never disappears entirely, and never swallows the tune', () => {
    expect(shelfTrimDb(9, { ...LOUD, lowShare: 0 })).toBeLessThan(0);
    expect(shelfTrimDb(9, { ...LOUD, lowShare: 1 })).toBeGreaterThan(-9);
  });

  it('does nothing when the shelf is flat or cutting', () => {
    expect(shelfTrimDb(0, LOUD)).toBe(0);
    expect(shelfTrimDb(-4, LOUD)).toBe(0);
  });

  it('falls back to a typical share when nothing is playing', () => {
    expect(shelfTrimDb(9, SILENT)).toBeCloseTo(-3.6, 6);
  });
});
