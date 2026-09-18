import { describe, it, expect } from 'vitest';
import { buildMusicalChannelProfile, axisOr } from '../musicalChannelProfile';
import type { ChannelAnalysis } from '@/bridge/analysis/MusicAnalysis';

/**
 * Plan item C2. The point of the profile is that four independent questions
 * stop sharing one answer, and that nothing is asserted without a confidence.
 */

function analysis(over: Partial<ChannelAnalysis> = {}): ChannelAnalysis {
  return {
    channel: 0, role: 'empty', noteCount: 0, avgOctave: 0, avgPitch: 0,
    density: 0, uniqueNotes: 0, pitchRange: 0, avgInterval: 0, ...over,
  };
}

/** Onsets on every offbeat of a 16-row bar (4 rows/beat): rows 2, 6, 10, 14. */
const OFFBEAT_BAR = [2, 6, 10, 14];
const GRID = { rowsPerBeat: 4, rowsPerBar: 16 };

describe('MusicalChannelProfile — axes are independent', () => {
  it('a dub piano skank is piano + harmony + offbeat + mid, not one token', () => {
    // The motivating case: the legacy enum collapses all four into `skank`.
    const p = buildMusicalChannelProfile({
      channel: 2,
      instrumentName: 'Rhodes Piano',
      analysis: analysis({ role: 'skank', noteCount: 16, avgOctave: 4, density: 0.25 }),
      onsetRows: [...OFFBEAT_BAR, ...OFFBEAT_BAR.map(r => r + 16)],
      totalRows: 32,
      ...GRID,
    });
    expect(p.instrumentFamily.value).toBe('piano');
    expect(p.musicalFunction.value).toBe('harmony');
    expect(p.rhythmicRole.value).toBe('offbeat');
    expect(p.register.value).toBe('mid');
  });

  it('two piano channels can differ on function while sharing family', () => {
    const common = { instrumentName: 'Piano', onsetRows: OFFBEAT_BAR, totalRows: 16, ...GRID };
    const harmony = buildMusicalChannelProfile({
      ...common, channel: 1, analysis: analysis({ role: 'chord', noteCount: 4, avgOctave: 4 }),
    });
    const groove = buildMusicalChannelProfile({
      ...common, channel: 2, analysis: analysis({ role: 'percussion', noteCount: 4, avgOctave: 4 }),
    });
    expect(harmony.instrumentFamily.value).toBe(groove.instrumentFamily.value);
    expect(harmony.musicalFunction.value).toBe('harmony');
    expect(groove.musicalFunction.value).toBe('groove');
  });
});

describe('MusicalChannelProfile — evidence and confidence, never a bare claim', () => {
  it('reports zero confidence and a default when there is no evidence', () => {
    const p = buildMusicalChannelProfile({ channel: 0 });
    expect(p.instrumentFamily).toEqual({ value: 'unknown', confidence: 0, source: 'default' });
    expect(p.rhythmicRole.confidence).toBe(0);
    expect(p.musicalFunction.confidence).toBe(0);
  });

  it('marks timbre-blind roles as weak family evidence', () => {
    // 'lead' says nothing about what instrument it is. The classifier may be
    // confident it is a lead; that must not become confidence that it is a synth.
    const p = buildMusicalChannelProfile({
      channel: 0,
      instrument: { role: 'lead', confidence: 0.9 },
    });
    expect(p.instrumentFamily.value).toBe('synth');
    expect(p.instrumentFamily.confidence).toBeLessThanOrEqual(0.4);
  });

  it('keeps full confidence for a specific drum signal', () => {
    const p = buildMusicalChannelProfile({
      channel: 0,
      instrument: { role: 'percussion', subrole: 'kick', confidence: 1 },
    });
    expect(p.instrumentFamily.value).toBe('drums');
    expect(p.instrumentFamily.confidence).toBe(1);
  });

  it('records which source decided each axis', () => {
    const p = buildMusicalChannelProfile({
      channel: 0,
      instrumentName: 'Hammond Organ',
      analysis: analysis({ role: 'chord', noteCount: 8, avgOctave: 4 }),
      onsetRows: OFFBEAT_BAR, totalRows: 16, ...GRID,
    });
    expect(p.instrumentFamily.source).toBe('instrument');
    expect(p.register.source).toBe('notes');
    expect(p.rhythmicRole.source).toBe('rhythm');
  });

  it('prefers confident live audio over pattern data for function', () => {
    const p = buildMusicalChannelProfile({
      channel: 0,
      analysis: analysis({ role: 'pad', noteCount: 4, avgOctave: 4 }),
      runtime: { role: 'bass', confidence: 0.9, support: 1 },
    });
    expect(p.musicalFunction.value).toBe('foundation');
    expect(p.musicalFunction.source).toBe('audio');
  });

  it('axisOr refuses a low-confidence value', () => {
    const p = buildMusicalChannelProfile({
      channel: 0, instrument: { role: 'lead', confidence: 0.9 },
    });
    expect(axisOr(p.instrumentFamily, 0.7, 'unknown')).toBe('unknown');
    expect(axisOr(p.instrumentFamily, 0.3, 'unknown')).toBe('synth');
  });
});

describe('MusicalChannelProfile — user overrides are authoritative', () => {
  it('an override wins outright at confidence 1 and is not blended', () => {
    const p = buildMusicalChannelProfile(
      { channel: 0, instrumentName: 'Kick Drum', instrument: { role: 'percussion', subrole: 'kick', confidence: 1 } },
      { instrumentFamily: 'vocal' },
    );
    expect(p.instrumentFamily).toEqual({ value: 'vocal', confidence: 1, source: 'user' });
  });

  it('overriding one axis leaves the others inferred', () => {
    const p = buildMusicalChannelProfile(
      { channel: 0, analysis: analysis({ role: 'bass', noteCount: 8, avgOctave: 1 }) },
      { rhythmicRole: 'downbeat' },
    );
    expect(p.rhythmicRole.source).toBe('user');
    expect(p.register.source).toBe('notes');
    expect(p.musicalFunction.value).toBe('foundation');
  });
});

describe('MusicalChannelProfile — rhythm against a supplied grid', () => {
  it('detects offbeat placement', () => {
    const p = buildMusicalChannelProfile({
      channel: 0, onsetRows: [...OFFBEAT_BAR, ...OFFBEAT_BAR.map(r => r + 16)], totalRows: 32, ...GRID,
    });
    expect(p.rhythmicRole.value).toBe('offbeat');
  });

  it('detects downbeat placement', () => {
    const p = buildMusicalChannelProfile({
      channel: 0, onsetRows: [0, 16, 32, 48], totalRows: 64, ...GRID,
    });
    expect(p.rhythmicRole.value).toBe('downbeat');
  });

  it('detects backbeat placement — beats 2 and 4', () => {
    const p = buildMusicalChannelProfile({
      channel: 0, onsetRows: [4, 12, 20, 28], totalRows: 32, ...GRID,
    });
    expect(p.rhythmicRole.value).toBe('backbeat');
  });

  it('calls sparse held material sustained, not a rhythm', () => {
    const p = buildMusicalChannelProfile({
      channel: 0, onsetRows: [0], totalRows: 64, ...GRID,
    });
    expect(p.rhythmicRole.value).toBe('sustained');
  });

  it('calls off-grid material syncopated', () => {
    const p = buildMusicalChannelProfile({
      channel: 0, onsetRows: [1, 3, 5, 7, 9, 11, 13, 15], totalRows: 16, ...GRID,
    });
    expect(p.rhythmicRole.value).toBe('syncopated');
  });

  it('adapts to the supplied grid rather than assuming 16-row bars', () => {
    // Same musical placement at speed 3 (8 rows/beat, 32 rows/bar).
    const p = buildMusicalChannelProfile({
      channel: 0, onsetRows: [4, 12, 20, 28, 36, 44, 52, 60], totalRows: 64,
      rowsPerBeat: 8, rowsPerBar: 32,
    });
    expect(p.rhythmicRole.value).toBe('offbeat');
  });

  it('never claims a rhythm without a grid', () => {
    const p = buildMusicalChannelProfile({ channel: 0, onsetRows: OFFBEAT_BAR, totalRows: 16 });
    expect(p.rhythmicRole).toEqual({ value: 'free', confidence: 0, source: 'default' });
  });
});

describe('MusicalChannelProfile — scalars', () => {
  it('repetition is high for an identical bar and low for a changing one', () => {
    const steady = buildMusicalChannelProfile({
      channel: 0, onsetRows: [...OFFBEAT_BAR, ...OFFBEAT_BAR.map(r => r + 16), ...OFFBEAT_BAR.map(r => r + 32)],
      totalRows: 48, ...GRID,
    });
    const varied = buildMusicalChannelProfile({
      channel: 0, onsetRows: [0, 3, 18, 25, 33, 47], totalRows: 48, ...GRID,
    });
    expect(steady.repetition).toBe(1);
    expect(varied.repetition).toBeLessThan(0.5);
  });

  it('a single bar proves nothing about repetition', () => {
    const p = buildMusicalChannelProfile({ channel: 0, onsetRows: OFFBEAT_BAR, totalRows: 16, ...GRID });
    expect(p.repetition).toBe(0);
  });

  it('foundation outranks texture in importance at equal density', () => {
    const bass = buildMusicalChannelProfile({
      channel: 0, analysis: analysis({ role: 'bass', noteCount: 8, avgOctave: 1, density: 0.25 }),
    });
    const pad = buildMusicalChannelProfile({
      channel: 1, analysis: analysis({ role: 'pad', noteCount: 8, avgOctave: 4, density: 0.25 }),
    });
    expect(bass.importance).toBeGreaterThan(pad.importance);
  });

  it('audibility is damped when there is no live audio to measure', () => {
    const offline = buildMusicalChannelProfile({
      channel: 0, analysis: analysis({ role: 'bass', noteCount: 16, density: 1 }),
    });
    const live = buildMusicalChannelProfile({
      channel: 0, analysis: analysis({ role: 'bass', noteCount: 16, density: 1 }),
      runtime: { role: 'bass', confidence: 0.9, support: 1 },
    });
    expect(offline.audibility).toBeLessThan(live.audibility);
  });

  it('keeps every scalar inside 0..1 even with absurd input', () => {
    const p = buildMusicalChannelProfile({
      channel: 0,
      analysis: analysis({ role: 'bass', noteCount: 999, density: 42 }),
      runtime: { role: 'bass', confidence: 99, support: 5 },
      onsetRows: [0, 0, 0], totalRows: 0, ...GRID,
    });
    for (const v of [p.importance, p.density, p.audibility, p.repetition]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('MusicalChannelProfile — register', () => {
  it('maps octaves onto bands', () => {
    const bands = [0, 2, 3, 4, 5, 7].map(avgOctave =>
      buildMusicalChannelProfile({
        channel: 0, analysis: analysis({ role: 'bass', noteCount: 4, avgOctave }),
      }).register.value);
    expect(bands).toEqual(['sub', 'low', 'lowMid', 'mid', 'highMid', 'high']);
  });

  it('lowers confidence when the channel spans a wide pitch range', () => {
    const narrow = buildMusicalChannelProfile({
      channel: 0, analysis: analysis({ role: 'bass', noteCount: 8, avgOctave: 2, pitchRange: 5 }),
    });
    const wide = buildMusicalChannelProfile({
      channel: 0, analysis: analysis({ role: 'bass', noteCount: 8, avgOctave: 2, pitchRange: 36 }),
    });
    expect(wide.register.confidence).toBeLessThan(narrow.register.confidence);
  });
});
