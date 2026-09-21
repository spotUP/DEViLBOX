import { describe, it, expect } from 'vitest';
import { getChannelProfiles } from '../channelProfiles';
import type { ChannelData, Pattern, TrackerCell } from '@/types/tracker';
import type { InstrumentConfig } from '@/types/instrument';

/**
 * The profile the performer targets on has to be fed what the app already
 * measured.
 *
 * `ChannelEvidence` has five slots — note statistics, the instrument verdict,
 * live audio, the name and the onset rows. Until 2026-09-22 the production
 * caller filled the name and the onsets, and nothing else. So the family axis
 * resolved by instrument NAME at 0.75 confidence, or fell through to `unknown`
 * at 0, while `classifyChannel` and `classifyInstrument` computed real answers
 * one import away and threw them at the wall.
 *
 * That is worst on the formats DEViLBOX exists for. A chip or UADE tune — AHX,
 * HVL, FC, TFMX, Hippel, Whittaker, Sonic Arranger — defines its instruments
 * inside the replayer: no sample for the spectral classifier, and a name slot
 * holding the musician's greetings. Those channels need every other source.
 */

function cell(note = 0, instrument = 0): TrackerCell {
  return { note, instrument, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

function channel(name: string, fill: Record<number, [number, number]>, length = 16): ChannelData {
  const rows: TrackerCell[] = Array.from({ length }, () => cell());
  for (const [r, [note, inst]] of Object.entries(fill)) rows[Number(r)] = cell(note, inst);
  return {
    id: name, name, rows,
    muted: false, solo: false, collapsed: false,
    volume: 100, pan: 0, instrumentId: null, color: null,
  };
}

function pattern(channels: ChannelData[]): Pattern {
  return { id: 'p0', name: 'p0', length: channels[0].rows.length, channels };
}

/** An instrument the drum-type signal identifies outright, the way an imported
 *  drum machine kit or a classified sample does. */
function kick(id: number): InstrumentConfig {
  // `drumMachine.drumType` is the strongest signal `classifyInstrument` reads —
  // confidence 1.0, ahead of sample analysis and well ahead of the name.
  return {
    id,
    name: 'greetings to everyone',
    drumMachine: { drumType: 'kick' },
  } as unknown as InstrumentConfig;
}

describe('channel profiles are built from the evidence the app already has', () => {
  it('uses the instrument verdict rather than the name slot', () => {
    // Name says nothing (it is a greeting); the instrument says kick.
    const pat = pattern([channel('greetings to everyone', { 0: [25, 1], 4: [25, 1], 8: [25, 1], 12: [25, 1] })]);
    const profiles = getChannelProfiles(
      pat,
      ['greetings to everyone'],
      4, 16,
      new Map([[1, kick(1)]]),
    );
    const p = profiles.get(0)!;
    expect(p.instrumentFamily.value).toBe('drums');
    expect(p.instrumentFamily.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it('falls back to note statistics when no instrument lookup is supplied', () => {
    // The old behaviour, still reachable: callers that cannot resolve
    // instruments must degrade rather than break.
    const pat = pattern([channel('CH1', { 0: [25, 1], 4: [25, 1], 8: [25, 1], 12: [25, 1] })]);
    const profiles = getChannelProfiles(pat, ['CH1'], 4, 16);
    const p = profiles.get(0)!;
    expect(p).toBeDefined();
    expect(p.channel).toBe(0);
  });

  it('keeps the cache keyed on the instrument lookup as well as the pattern', () => {
    // Without the lookup in the key, the first call's answer would be served
    // for every later one — including after instruments are classified, which
    // is exactly when the profile should improve.
    const pat = pattern([channel('CH1', { 0: [25, 1], 4: [25, 1], 8: [25, 1], 12: [25, 1] })]);
    const withoutInstruments = getChannelProfiles(pat, ['CH1'], 4, 16).get(0)!;
    const withInstruments = getChannelProfiles(pat, ['CH1'], 4, 16, new Map([[1, kick(1)]])).get(0)!;
    expect(withoutInstruments.instrumentFamily.value).not.toBe('drums');
    expect(withInstruments.instrumentFamily.value).toBe('drums');
  });

  it('profiles every channel of the pattern', () => {
    const pat = pattern([
      channel('a', { 0: [25, 1] }),
      channel('b', { 0: [50, 2] }),
      channel('c', {}),
    ]);
    const profiles = getChannelProfiles(pat, ['a', 'b', 'c'], 4, 16, new Map());
    expect(profiles.size).toBe(3);
    expect([...profiles.keys()]).toEqual([0, 1, 2]);
  });

  it('returns an empty map for no pattern', () => {
    expect(getChannelProfiles(null, [], 4, 16).size).toBe(0);
  });
});
