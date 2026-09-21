import { describe, it, expect } from 'vitest';
import { buildMusicalChannelProfile } from '../musicalChannelProfile';
import type { ChannelAnalysis } from '@/bridge/analysis/MusicAnalysis';
import type { InstrumentClassification } from '@/bridge/analysis/ChannelNaming';

/**
 * An instrument NAME is corroboration, never identity.
 *
 * Tracker sample and instrument name slots were a message board. Musicians put
 * greetings, credits and liner notes in them rather than descriptions of the
 * sound, and the family axis used to take a name match at 0.75 confidence
 * ahead of every measured source.
 *
 * Measured across the channel-evidence corpus on 2026-09-22, the dominant
 * instrument names read `for Revision 2017`, `by AceMan`, `Put into tracker`,
 * `lost count a long`, `competition`, `lucas@bboy.com` — one phrase of a
 * paragraph per instrument slot. Only 31 of 552 rows carried a name that said
 * anything about an instrument.
 *
 * The failure mode is silent and confident: a greeting containing "bell" or
 * "bass" matches exactly the pattern a real sample name would.
 */

function analysis(over: Partial<ChannelAnalysis> = {}): ChannelAnalysis {
  return {
    channel: 0, role: 'empty', noteCount: 0, avgOctave: 0, avgPitch: 0,
    density: 0, uniqueNotes: 0, pitchRange: 0, avgInterval: 0, ...over,
  };
}

const GRID = { rowsPerBeat: 4, rowsPerBar: 16 };

/** A confident spectral verdict, the kind `SampleSpectrum` produces for a kick. */
function kickFromSpectrum(): InstrumentClassification {
  return { role: 'percussion', subrole: 'kick', confidence: 0.85 };
}

describe('a name alone cannot assert an instrument', () => {
  it('caps a name-only family below the threshold callers act on', () => {
    const p = buildMusicalChannelProfile({
      channel: 0,
      instrumentName: 'Bass Station',
      onsetRows: [0, 4, 8, 12],
      totalRows: 16,
      ...GRID,
    });
    expect(p.instrumentFamily.value).toBe('bass');
    // Below 0.6, which is what `pickTarget` and friends require before acting.
    expect(p.instrumentFamily.confidence).toBeLessThan(0.6);
  });

  it('does not let a greeting outrank a measurement', () => {
    // The real shape of the bug: the name is a credit that happens to contain
    // an instrument word, and the sample itself measures as a kick.
    const p = buildMusicalChannelProfile({
      channel: 0,
      instrumentName: 'bass player greets everyone',
      instrument: kickFromSpectrum(),
      analysis: analysis({ role: 'percussion', noteCount: 16, density: 0.25 }),
      onsetRows: [0, 4, 8, 12],
      totalRows: 16,
      ...GRID,
    });
    expect(p.instrumentFamily.value).toBe('drums');
    expect(p.instrumentFamily.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it('promotes the family when name and measurement agree', () => {
    // Two independent sources, one of which could have said anything. Agreement
    // is worth more than either alone.
    const named = buildMusicalChannelProfile({
      channel: 0,
      instrumentName: 'kick drum',
      instrument: kickFromSpectrum(),
      onsetRows: [0, 4, 8, 12],
      totalRows: 16,
      ...GRID,
    });
    const unnamed = buildMusicalChannelProfile({
      channel: 0,
      instrument: kickFromSpectrum(),
      onsetRows: [0, 4, 8, 12],
      totalRows: 16,
      ...GRID,
    });
    expect(named.instrumentFamily.value).toBe('drums');
    expect(named.instrumentFamily.confidence).toBeGreaterThan(unnamed.instrumentFamily.confidence);
  });

  it('still uses the name when nothing was measured', () => {
    // Weak evidence beats none. A chip or UADE tune has no sample to analyse,
    // so on the rare occasion the name IS descriptive it should still count.
    const p = buildMusicalChannelProfile({
      channel: 0,
      instrumentName: 'Hihat closed',
      onsetRows: [0, 2, 4, 6],
      totalRows: 16,
      ...GRID,
    });
    expect(p.instrumentFamily.value).toBe('drums');
    expect(p.instrumentFamily.confidence).toBeGreaterThan(0);
    expect(p.instrumentFamily.source).toBe('instrument');
  });

  it('prefers a weak name to a weaker measurement rather than discarding it', () => {
    // Note statistics alone contribute 0.3 and are timbre-blind: `lead` says
    // nothing about what is making the sound. A descriptive name is better
    // evidence than that, even discounted.
    const p = buildMusicalChannelProfile({
      channel: 0,
      instrumentName: 'Trumpet',
      analysis: analysis({ role: 'lead', noteCount: 8, avgOctave: 5, density: 0.2 }),
      onsetRows: [0, 4, 8, 12],
      totalRows: 16,
      ...GRID,
    });
    expect(p.instrumentFamily.value).toBe('horn');
  });

  it('reports unknown at zero confidence when there is no evidence at all', () => {
    const p = buildMusicalChannelProfile({ channel: 0, onsetRows: [], totalRows: 16, ...GRID });
    expect(p.instrumentFamily.value).toBe('unknown');
    expect(p.instrumentFamily.confidence).toBe(0);
    expect(p.instrumentFamily.source).toBe('default');
  });
});
