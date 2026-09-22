import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  generatedPeakFor,
  shelfTrimDb,
  lowShareFromSpectrum,
  readProgrammeFromAnalyser,
  type ProgrammeAnalyser,
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
      'crushBass', 'oscBass', 'noiseBurst', 'siren', 'tubbyScream',
    ]) {
      expect(bus, moveId).toContain(`generatedPeak('${moveId}'`);
    }
  });

  it('leaves no entry in the table that nothing reads', () => {
    // `tubbyScream` sat in GENERATED_PRESENCE unused: the scream's seed gain
    // was a flat 0.15 whatever the music did. Trimming that entry on
    // 2026-09-21 to answer "scream is too loud" therefore changed nothing at
    // all, and only an audit noticed. A dead entry is worse than a missing one
    // — it reads as wired, so it absorbs a fix and gives nothing back.
    const unread = Object.keys(GENERATED_PRESENCE).filter(
      (k) => !bus.includes(`generatedPeak('${k}'`) && !bus.includes(`captureNormalisation('${k}'`),
    );
    expect(unread, `presence entries nothing reads: ${unread.join(', ')}`).toEqual([]);
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

  it('charges nothing when the programme has the headroom to absorb the boost', () => {
    // A tracker module runs around 0.2 peak — about 14 dB below full scale.
    // A 9 dB shelf on a 0.4 low share costs 3.6 dB, which fits, so the mix
    // keeps its level and the BASS control is heard as bass rather than as a
    // volume drop (2026-09-22).
    expect(shelfTrimDb(9, QUIET)).toBeCloseTo(0, 10);
  });

  it('still charges a hot master in full', () => {
    // 0.9 peak leaves under a decibel — the 2026-09-18 clipping case.
    expect(shelfTrimDb(9, LOUD)).toBeCloseTo(-3.6, 6);
  });

  it('charges only the part that will not fit', () => {
    // 0.5 peak ~ 6 dB down, 1 dB held back: 5 dB of headroom against a 7.2 dB
    // cost leaves 2.2 dB to pay for.
    const mid: ProgrammeLevel = { rms: 0.15, peak: 0.5, lowShare: 0.4, valid: true };
    expect(shelfTrimDb(18, mid)).toBeCloseTo(-(18 * 0.4 - (-20 * Math.log10(0.5) - 1)), 6);
  });

  it('never turns a boost into a lift', () => {
    expect(shelfTrimDb(18, QUIET)).toBeLessThanOrEqual(0);
    expect(shelfTrimDb(1, QUIET)).toBeLessThanOrEqual(0);
  });
});

/**
 * The levels the 2026-09-21 listening pass asked for.
 *
 * Verdicts, with what the master meter read at the time against a 0.057 RMS /
 * 0.492 peak programme baseline:
 *
 *   Slam   too loud            peak 1.072 — over full scale, clipping
 *   Kick   not loud enough     peak 0.438 — quieter than the programme
 *   Sub    not loud enough     peak 0.162 — sat under the mix
 *   Siren  a little too silent rms  0.078
 *   Scream too loud            rms  0.117 — twice the programme's RMS
 *
 * Slam and Kick are not in this table: they are processed moves, not generated
 * ones, and their levels live in `slamSpring` / `kickSpring`. Sub, Siren and
 * Scream are generated, so they belong here — referenced to the programme so
 * they survive a change of song, which a bare constant would not.
 */
describe('levels asked for by ear, 2026-09-21', () => {
  it('lifts the sub swell to where it can be felt', () => {
    // It measured UNDER the programme, so "felt more than heard" had become
    // "not heard at all".
    //
    // subSwell is NOT in the sustained set — it swells and decays like a hit,
    // so it references the programme's PEAK, not its RMS. An earlier version
    // of this test asserted it stayed under LOUD.rms, which would only ever
    // have held for a sustained source.
    expect(GENERATED_PRESENCE.subSwell).toBeGreaterThan(0.5);
    const lifted = generatedPeakFor('subSwell', LOUD);
    expect(lifted).toBeGreaterThan(LOUD.peak * 0.5);   // above where it was
    expect(lifted).toBeLessThan(LOUD.peak);            // still under the mix's peak
  });

  it('trims the scream without touching what makes it a scream', () => {
    // The move's `feedbackAmount` sets how hard the filter rings. Detuning
    // that to fix a level would change the character of the move, so the trim
    // is here instead.
    expect(GENERATED_PRESENCE.tubbyScream).toBeLessThan(0.8);
    expect(generatedPeakFor('tubbyScream', LOUD)).toBeLessThan(LOUD.peak * 0.8);
  });

  it('nudges the siren up without reopening the 2026-09-18 regression', () => {
    // It used to be referenced to programme PEAK and was reported "MUCH louder
    // than the music". The bound that guards that is worth more than any
    // further increase here.
    expect(GENERATED_PRESENCE.siren).toBeGreaterThan(1.15);
    expect(generatedPeakFor('siren', LOUD)).toBeLessThan((LOUD.peak * 0.75) / 2);
  });

  it('keeps every generated move under full scale on a loud programme', () => {
    // The fault that started all of this was a move louder than the mix it
    // was supposed to decorate.
    for (const moveId of Object.keys(GENERATED_PRESENCE)) {
      expect(generatedPeakFor(moveId, LOUD), moveId).toBeLessThan(1);
    }
  });
});

describe('lowShareFromSpectrum — what a low shelf actually lifts', () => {
  const binHz = 23.4375;   // 48 kHz / 2048

  it('is the fraction of bins below the split for a flat spectrum', () => {
    const bins = 64;
    const flat = new Float32Array(bins).fill(-20);
    const below = Array.from({ length: bins }, (_, i) => i * binHz < 258).filter(Boolean).length;
    expect(lowShareFromSpectrum(flat, binHz)).toBeCloseTo(below / bins, 6);
  });

  it('reads one for a bass-only spectrum and zero for a treble-only one', () => {
    const bass = new Float32Array(64).fill(-Infinity);
    bass[2] = -10;
    expect(lowShareFromSpectrum(bass, binHz)).toBeCloseTo(1, 6);
    const treble = new Float32Array(64).fill(-Infinity);
    treble[50] = -10;
    expect(lowShareFromSpectrum(treble, binHz)).toBeCloseTo(0, 6);
  });

  it('weights by power, so a loud low bin outweighs many quiet high ones', () => {
    const s = new Float32Array(64).fill(-60);   // quiet everywhere
    s[3] = -20;                                  // one bin 40 dB louder, below the split
    expect(lowShareFromSpectrum(s, binHz)).toBeGreaterThan(0.9);
  });

  it('falls back to the typical share on an empty spectrum', () => {
    expect(lowShareFromSpectrum(new Float32Array(64).fill(-Infinity), binHz)).toBeCloseTo(0.4, 6);
  });
});

describe('readProgrammeFromAnalyser — the mix as it arrives at the insert', () => {
  function fake(time: number[], spectrumDb: number[]): ProgrammeAnalyser {
    return {
      fftSize: time.length,
      frequencyBinCount: spectrumDb.length,
      context: { sampleRate: 48000 },
      getFloatTimeDomainData(a) { a.set(time); },
      getFloatFrequencyData(a) { a.set(spectrumDb); },
    };
  }

  it('reports peak and RMS of the time-domain buffer', () => {
    const r = readProgrammeFromAnalyser(fake([0.5, -0.5, 0.5, -0.5], [-20, -20]));
    expect(r.peak).toBeCloseTo(0.5, 6);
    expect(r.rms).toBeCloseTo(0.5, 6);
  });

  it('is silent for silence, so the trim charges in full rather than assuming headroom', () => {
    const r = readProgrammeFromAnalyser(fake([0, 0, 0, 0], [-Infinity, -Infinity]));
    expect(r.peak).toBe(0);
    expect(r.rms).toBe(0);
  });

  it('derives the low share from the spectrum with the analyser\'s own bin width', () => {
    // fftSize 4 at 48 kHz -> 12 kHz per bin: bin 0 is below the split, bin 1 is not.
    const r = readProgrammeFromAnalyser(fake([0.1, 0.1, 0.1, 0.1], [-10, -10]));
    expect(r.lowShare).toBeCloseTo(0.5, 6);
  });
});
